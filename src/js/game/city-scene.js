/**
 * Three.js world builder for the ASCII City Walk game (CW-3, expanded in
 * CW-8).
 *
 * Turns a parsed city model (see city-data.js) into a static, Z-up scene
 * group: extruded building footprints merged into one mesh, a ground plane,
 * and flat road ribbons. The ASCII converter maps rendered luminance to
 * glyph density, so everything here is designed around what the sampler can
 * see:
 *
 * - Walls carry a repeating window-grid texture. Three's ExtrudeGeometry
 *   side-wall UVs are WORLD METERS (u = x or y, v = -z), so a RepeatWrapping
 *   texture with repeat = 1/spacing needs no custom UVs — lit windows become
 *   glyph clusters, dark grout becomes seams, and buildings read as the
 *   reference's window arrays instead of uniform glyph slabs.
 * - Each building gets a deterministic tint: a lightness TIER (what the
 *   monochrome modes see as per-building glyph density) plus a HUE aligned
 *   with the high-contrast palettes (what CW-6's color quantization sees).
 *   The tint rides a per-vertex color attribute so all buildings still merge
 *   into one draw call.
 * - Grounded buildings get a brighter 0–3.5 m storefront strip (coplanar
 *   with the wall, pulled forward by polygonOffset) — the reference's lit
 *   ground floor, and (CW-18) some of them a tinted sign panel above it.
 * - Towers grow rooftop masts, and the streets grow lamps (CW-18): thin dark
 *   stems under a bright head, which is what the reference's overhead dashes
 *   turn out to be.
 * - The ground is near-black with a sparse deterministic dot texture (the
 *   reference's near-field dither); roads are dim at street level and
 *   brighten in the map view via setMapView().
 *
 * @license GPL-3.0-or-later
 */

import {
  AmbientLight,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  ExtrudeGeometry,
  Fog,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Path,
  PlaneGeometry,
  RepeatWrapping,
  Shape,
  ShapeGeometry,
  Vector2,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  pointInRing,
  CURB_HEIGHT_M,
  PAVEMENT_WIDTH_M,
  isPavementWay,
} from './walk-controls.js';
import { makeFigureSpec, makeFigureGeoms } from './city-figures.js';
import {
  buildRoadGraph,
  ringCentroid,
  trafficDensityFor,
} from './city-data.js';

// Per-view road treatment. Any visible SURFACE tone carpets the lower half
// of the street view — perspective stacks every road between here and the
// horizon into a few cell rows (measured again in CW-8; fog does not save
// it). So at street level the surfaces go exact black and streets are drawn
// the way the reference draws them: as CURB LINES — thin edge ribbons that
// read as dashes nearby and sub-sample away with distance. Overhead, the
// surfaces brighten into the map's street network and the curbs hide.
export const ROAD_TONES = { street: 0x000000, map: 0x4a4a4a };
const CURB_TONE = 0x303030;
const CURB_WIDTH_M = 0.5;

/**
 * Pavement tones (CW-33). A separately-mapped pavement is lighter than the
 * roadway it runs beside - that difference is the whole point of drawing it,
 * because it is what tells a walker where the kerb is.
 *
 * Street level stays dark: this city is read through a converter that turns
 * brightness into characters, and a pavement bright enough to be obvious in
 * the 3D frame would carpet the bottom of the screen in glyphs. It is lifted
 * just far enough off the roadway to separate, and the SIDEWALK glyph
 * vocabulary does the rest of the work.
 */
const SIDEWALK_TONES = { street: 0x161616, map: 0x6a6a6a };

/**
 * Greenspace tones (CW-33). Dim at street level for the same reason, and
 * distinctly lighter than the roadway overhead so a park reads as a shape on
 * the map rather than a hole in the grid.
 */
const GREEN_TONES = { street: 0x101410, map: 0x3f5a3f };

/**
 * How the `surface` tag shifts a ribbon's tone, where OSM has one (CW-33).
 *
 * The multiplier is deliberately gentle: this is texture, not colour-coding,
 * and the converter sees only brightness. Anything stronger would turn a
 * change of paving into a change of material.
 *
 * Roads carry a surface tag on 88% of Seattle's ways and 9% of
 * Albuquerque's, so most ribbons take the class default below and that is
 * stated rather than hidden - an untagged road is assumed asphalt, an
 * untagged pavement concrete, which is the OSM default assumption.
 */
const SURFACE_TONE_SCALE = {
  asphalt: 0.85,
  concrete: 1.25,
  concrete_plates: 1.25,
  paving_stones: 1.4,
  sett: 1.35,
  cobblestone: 1.35,
  bricks: 1.3,
  gravel: 1.15,
  compacted: 1.1,
  ground: 1.05,
  dirt: 1.05,
  grass: 1.0,
  wood: 1.2,
};

/** What a ribbon is assumed to be made of when OSM does not say. */
const DEFAULT_ROAD_SURFACE = 'asphalt';
const DEFAULT_SIDEWALK_SURFACE = 'concrete';

// Minor path classes are parsed (city-data keeps them for future rounds)
// but not drawn: dense downtowns carry footpaths everywhere, and under
// first-person perspective compression they merge into a solid glyph
// carpet that drowns the actual street grid.
const UNDRAWN_ROAD_KINDS = new Set([
  'footway',
  'path',
  'cycleway',
  'steps',
  'track',
]);

// Roads float just above the ground plane so they win the depth test.
const ROAD_LIFT_M = 0.08;
// CW-50: the roadway is CUT DOWN a curb's height rather than the pavement
// being built up, which is what keeps every prop standing where it already
// stood. ROAD_LIFT_M keeps its own separate job - a depth epsilon on whatever
// plane a ribbon lies in - and the two never add on the same surface: the
// difference between a pavement ribbon and a roadway ribbon is exactly the
// curb height.
const ROADWAY_LIFT_M = ROAD_LIFT_M - CURB_HEIGHT_M;

// CW-51 centre lines. The rhythm is the US skip line, 3 m of paint to 9 m of
// gap. The WIDTH is a model rather than a measurement, and the number came
// from measuring rather than from argument.
//
// Real highway paint is 0.10-0.15 m. Built at 0.12 it painted 213 pixels of a
// 1.44-million-pixel frame - 0.015%, invisible, and confined to a band in the
// middle distance. Widening moved that steadily (0.25 -> 367 px, 0.35 -> 477,
// 0.50 -> 643) and only at 0.50 did the photographs show a line reading as
// dashes rather than as speckle. This is the same licence CURB_WIDTH_M already
// takes for the same reason: a converter that turns brightness into characters
// cannot resolve a sub-cell feature, however true to life its width is.
//
// The carpet law bounds the other end and is not strained. Banded against the
// same pose with no lines at all, the change lands entirely in ONE mid-frame
// band (+0.6 to +1.0 points); the sky band moves by EXACTLY zero and so do the
// near-ground bands.
//
// LINE_TONE sits at the curb's own luminance (0x30 grey reads 48/255) but
// carries warmth, so a colour scheme quantizes it toward yellow while a
// monochrome scheme - which reads luminance alone - sees what it saw from a
// curb. Only arterials are painted: a residential street often carries no
// centre line in life, and painting every street is the fastest way to break
// the carpet law.
const LINE_PAINT_M = 3;
const LINE_GAP_M = 9;
const LINE_WIDTH_M = 0.5;
const LINE_TONE = 0x3a3310;
const ARTERIAL_LINE_KINDS = new Set(['secondary', 'primary', 'trunk']);
const PAVEMENT_LIFT_M = ROAD_LIFT_M + 0.04;
// Paint lies ON the roadway, a depth epsilon above it.
const LINE_LIFT_M = ROADWAY_LIFT_M + 0.01;
// The ground plane has to sit under the deepest thing drawn on it, or it
// would hide the roadway it is meant to be beneath.
const GROUND_PLANE_Z = ROADWAY_LIFT_M - 0.02;
const GROUND_MARGIN_M = 200;

// Window grid: 4 m bays, 3 m storeys; the texture tile spans 4×3 bays so a
// deterministic scatter of dark windows repeats every 16 m × 9 m instead of
// every bay.
const WINDOW_BAY_W_M = 4;
const WINDOW_BAY_H_M = 3;
// CW-34: a much larger tile than the 4x3 it was. The lit-run pattern needs
// room to look unplanned before it wraps, and at 4 bays across the repeat was
// visible along a whole street.
const WINDOW_TILE_BAYS_X = 8;
const WINDOW_TILE_BAYS_Y = 12;

const STOREFRONT_HEIGHT_M = 3.5;
const GROUND_TILE_M = 48;
// Ground dither (CW-18). The 256 px tile covers GROUND_TILE_M, so a pixel is
// about 19 cm and a streak runs up to a metre and a half.
const GROUND_TONE_MIN = 0x26;
const GROUND_TONE_SPAN = 0x14;
const GROUND_STREAK_MAX_PX = 8;
const GROUND_STREAK_ALONG_SHARE = 0.75;
const GROUND_PATCHES = 40;
const GROUND_PATCH_STREAKS = 40;
const GROUND_PATCH_RADIUS_PX = 26;
const GROUND_LOOSE_STREAKS = 800;
/**
 * CW-52: anisotropic filtering, for the one surface in this city that is seen
 * almost edge-on.
 *
 * CW-41 measured anisotropy on the FACADES and found it worth nothing, which
 * is what an isotropic mip chain should give on a surface facing the camera.
 * The ground plane is the opposite case: at eye height it stretches away to
 * the fog, so the isotropic level of detail is forced by the derivative ACROSS
 * the view and throws away everything along it. MEASURED over a 20-frame
 * sub-cell turn at the Seattle spawn, glyph flips on ground cells: 1.33% with
 * neither knob, 1.38% with the cell-raster filter alone, 1.38% with anisotropy
 * alone, and 0.26% with BOTH - four fifths of the way to the floor that
 * deleting the texture outright sets (0.01%). Neither is worth anything
 * without the other, which is why they ship together.
 *
 * three.js clamps this to whatever the device actually supports, so a machine
 * with less simply gets less.
 */
const GROUND_ANISOTROPY = 16;

// Building tint model. TIERS drive luminance (what monochrome sees);
// HUES are the CW-Q5/Q6 palette families (what HC quantization sees).
// The chroma component is constructed luminance-free, so two buildings in
// the same tier read identically bright in mono while quantizing to
// different colors under high contrast.
const TINT_TIERS = [0.5, 0.65, 0.8, 0.95];
const TINT_HUES_DEG = [0, 30, 60, 120, 180, 270, 300, 330];
const TINT_CHROMA = 0.45;

// Sign panels and rooftop masts (CW-18). A sign is two boxes: a bright
// near-neutral PLATE that owns the top of the street-level luminance band
// (above the cars' 0.92, beside the storefront's 0.95), and a smaller, deeply
// tinted FACE laid on top of it. Monochrome therefore reads a bright
// rectangle with a darker middle - the reference's bordered panel - while the
// high-contrast quantizer, which compares chroma and ignores brightness, reads
// the face's hue. Neither job fights the other, which a single box cannot
// manage: a tint bright enough to top the band normalizes too close to white
// to land anywhere but the white entry.
const SIGN_PLATE_TINT = [0.97, 0.97, 0.97];
const SIGN_FACE_CHROMA = 0.75;
const SIGN_FACE_TIER = 0.8;
// Hues that survive quantization from both HC sets at this chroma, measured
// against the shipped pickPaletteIndex. 120 is left out - green belongs to the
// trees - and so are 240/270, which normalize too near white to land on a
// color in the ANSI-bright set.
const SIGN_HUES_DEG = [0, 30, 60, 180, 300, 330];
// The bright border, as a share of the panel's height and capped: measured
// on the reference, a sign's frame is a few percent of its width, and a fixed
// 0.18 m sub-samples to nothing on a 5 m billboard.
const SIGN_FRAME_SHARE = 0.22;
const SIGN_FRAME_MAX_M = 0.5;
const SIGN_THICKNESS_M = 0.12;
// Clear of the wall it hangs on, and of the storefront strip's polygonOffset.
const SIGN_STANDOFF_M = 0.1;
// A sign wants the wall people walk past. Measured on all four cities, the
// LONGEST wall's midpoint sits a median 19-21 m from the nearest road, while
// the nearest wall sits at 6-11 m - so half the signs would have faced an
// alley. Walls within this much of the longest are ranked by street distance
// instead, which lifts "within 20 m of a road" from 44-59% to 78-95%.
const SIGN_WALL_LENGTH_SHARE = 0.6;
const SIGN_ROAD_CELL_M = 40;

// Storefront band: a shop sign above the glass, on a hashed subset of the
// buildings that carry a storefront strip at all.
const SIGN_BAND_SHARE = 0.45;
const SIGN_BAND_HEIGHT_M = 1.1;
const SIGN_BAND_MAX_W_M = 7;
const SIGN_BAND_EDGE_SHARE = 0.55;
// A block of shops is ONE footprint in OpenStreetMap, so a single sign per
// building leaves a 90 m frontage with one sign on it. Long walls get a row.
const SIGN_BAND_PITCH_M = 24;
const SIGN_BAND_MAX_PER_WALL = 4;

// Upper faces: the rare big billboard, on tall buildings only.
const SIGN_BILLBOARD_MIN_HEIGHT_M = 25;
const SIGN_BILLBOARD_SHARE = 0.5;
const SIGN_BILLBOARD_H_M = 5;
const SIGN_BILLBOARD_MAX_W_M = 12;
const SIGN_BILLBOARD_EDGE_SHARE = 0.5;
// Where up the face it sits, as a fraction of building height.
const SIGN_BILLBOARD_MIN_FRAC = 0.35;
const SIGN_BILLBOARD_MAX_FRAC = 0.7;

// Rooftop masts. The percentile alone is not enough: Albuquerque's tallest
// 15% are 9 m sheds, so an absolute floor decides what counts as a tower.
const ANTENNA_HEIGHT_PERCENTILE = 0.85;
const ANTENNA_MIN_HEIGHT_M = 20;
// Found by eye: at 0.14 m a mast is thinner than a pixel past about 60 m, so
// no roofline in any shot showed one. A real rooftop mast is 0.2-0.5 m.
const ANTENNA_MAST_SIDE_M = 0.4;
const ANTENNA_MAST_MIN_M = 2.5;
const ANTENNA_MAST_MAX_M = 6;
const ANTENNA_TUFT_SPAN_M = 1.2;
const ANTENNA_TUFT_THICK_M = 0.2;
const ANTENNA_TIER = 0.72;
const ANTENNA_CHROMA = 0.5;

/**
 * Deterministic 32-bit hash for building identity (index + name).
 * @param {number} index
 * @param {string} [name]
 * @returns {number} unsigned 32-bit
 */
function hashBuilding(index, name) {
  let h = (index * 2654435761) >>> 0;
  if (typeof name === 'string') {
    for (let i = 0; i < name.length; i++) {
      h = ((h ^ name.charCodeAt(i)) * 16777619) >>> 0;
    }
  }
  h ^= h >>> 16;
  h = (h * 2246822519) >>> 0;
  h ^= h >>> 13;
  return h >>> 0;
}

/**
 * Deterministic 32-bit hash for a point on the ground, for choices that must
 * be stable per spot WITHOUT drawing from a shared random stream. The prop
 * streams run the length of a road, so a draw taken for one prop shifts every
 * prop planted after it; a spot hash adds variety without moving anything.
 *
 * @param {number} x
 * @param {number} y
 * @returns {number} unsigned 32-bit
 */
export function hashSpot(x, y) {
  // Millimetres: fine enough that two props never collide, coarse enough that
  // a coordinate which round-trips through a float differently still agrees.
  let h = (Math.round(x * 1000) * 2654435761) >>> 0;
  h = ((h ^ Math.round(y * 1000)) * 16777619) >>> 0;
  h ^= h >>> 16;
  h = (h * 2246822519) >>> 0;
  h ^= h >>> 13;
  return h >>> 0;
}

/** Pure hue → RGB (HSL with S=1, L=0.5). */
function hueToRgb(hueDeg) {
  const h = ((hueDeg % 360) + 360) % 360;
  const f = (n) => {
    const k = (n + h / 30) % 12;
    return 0.5 - 0.5 * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}

const LUM_R = 0.2126;
const LUM_G = 0.7152;
const LUM_B = 0.0722;

/**
 * Deterministic per-building tint: luminance == tier exactly (pre-clamp),
 * hue carried as a luminance-free chroma offset.
 *
 * @param {number} index - building index in the model
 * @param {string} [name]
 * @returns {[number, number, number]} linear-ish RGB in [0, 1]
 */
export function buildingTint(index, name) {
  const h = hashBuilding(index, name);
  return tintOf(
    TINT_TIERS[h % TINT_TIERS.length],
    TINT_HUES_DEG[(h >>> 3) % TINT_HUES_DEG.length],
    TINT_CHROMA
  );
}

/**
 * Tint of a given luminance tier, pushed toward a hue without changing that
 * luminance: mono sees the tier, the high-contrast quantizer sees the hue.
 *
 * @param {number} tier - target luminance in [0, 1]
 * @param {number} hueDeg
 * @param {number} chroma - how far toward the hue, 0 = neutral gray
 * @returns {[number, number, number]}
 */
export function tintOf(tier, hueDeg, chroma) {
  const [hr, hg, hb] = hueToRgb(hueDeg);
  const hueLum = hr * LUM_R + hg * LUM_G + hb * LUM_B;
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  return [
    clamp01(tier + (hr - hueLum) * chroma),
    clamp01(tier + (hg - hueLum) * chroma),
    clamp01(tier + (hb - hueLum) * chroma),
  ];
}

/**
 * The strongest chroma tintOf can apply at this tier without a channel
 * running past the ends of the range.
 *
 * tintOf keeps luminance AT the tier by moving the channels in opposite
 * directions, but it clamps, and a clamped channel breaks that promise: a
 * pure red at tier 0.82 and chroma 0.5 wants 1.21 in its red channel, gets
 * 1.0, and lands at luminance 0.775 instead of 0.82. That matters wherever
 * the monochrome schemes must stay put, since luminance is all they read.
 * Near the top of the range the honest maximum is small - a saturated red
 * simply is not 82% bright - so this trades saturation for the promise.
 *
 * @param {number} tier
 * @param {number} hueDeg
 * @param {number} chroma - the chroma asked for; the return never exceeds it
 * @returns {number}
 */
export function inGamutChroma(tier, hueDeg, chroma) {
  const [hr, hg, hb] = hueToRgb(hueDeg);
  const hueLum = hr * LUM_R + hg * LUM_G + hb * LUM_B;
  let limit = chroma;
  for (const channel of [hr, hg, hb]) {
    const delta = channel - hueLum;
    if (delta > 0) limit = Math.min(limit, (1 - tier) / delta);
    else if (delta < 0) limit = Math.min(limit, tier / -delta);
  }
  return limit > 0 ? limit : 0;
}

/**
 * Flood a geometry's vertex-color attribute with one tint, which is what
 * lets every prop of a kind merge into a single draw call.
 *
 * @param {import('three').BufferGeometry} geometry
 * @param {[number, number, number]} tint
 */
function paintGeometry(geometry, tint) {
  const count = geometry.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = tint[0];
    colors[i * 3 + 1] = tint[1];
    colors[i * 3 + 2] = tint[2];
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
}

// ---------------------------------------------------------------------------
// Procedural textures (deterministic; null in headless test environments)
// ---------------------------------------------------------------------------

/** Tiny LCG so texture randomness is identical on every machine. */
function makeLcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function make2dContext(width, height) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext?.('2d');
  if (!ctx || typeof ctx.fillRect !== 'function') return null;
  return { canvas, ctx };
}

function makeRepeatingTexture(canvas, repeatX, repeatY, offsetY = 0) {
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.offset.set(0, offsetY);
  return texture;
}

/**
 * The letter families a facade's windows can be cut from (CW-25).
 *
 * Every building wore the same rectangular window, so once the converter had
 * turned a frame into characters one tower's wall was indistinguishable from
 * the next: colour told them apart but TEXTURE did not. Each family gives its
 * buildings a differently-shaped lit pane, which is variation the sampler can
 * actually see.
 *
 * These are SHAPES, not writing. The letters are chosen for how they fill a
 * window bay — an X reads as a cross-braced pane, an O as a round one — and a
 * wall built from one repeated letter carries no more meaning than a brick
 * bond does. Readable text through the converter stays impossible; that is a
 * recorded limitation, not something this is sneaking up on.
 *
 * `null` is the plain rectangular pane the city has always had, kept as a
 * family so a share of the buildings still look exactly as they did.
 */
/**
 * THIS ARRAY IS ART DIRECTION, like glyph-vocabularies.js. It is data, not
 * machinery: each entry says how one family of buildings glazes a window bay,
 * and adding, removing or reordering entries changes how the city reads
 * without touching any other code.
 *
 * WHY IT REPLACED THE LETTERS (CW-Q26, owner-signed). CW-25 gave each family
 * a letterform cut out of its panes - X, O, 8, H, Z, M, A - to make one
 * tower's wall distinguishable from the next. Photographed at the owner's own
 * character size it did the opposite of its intent: the near towers read as
 * LITERAL GIANT LETTERS built out of smaller letters. The letters are gone,
 * entirely, and what replaces them is the shape of the glazing itself.
 *
 * The archetypes are the nine window kinds PixelCity's texture generator
 * draws (see THIRD_PARTY_NOTICES). Ideas only - both projects are GPL-3 and
 * no code was copied; these are reimplemented from a description of what each
 * kind looks like.
 *
 * RULES FOR EDITING, both learned the hard way:
 *   1. **Cut out, never draw on.** Each painter fills a LIT pane and then
 *      removes the glazing bars with `destination-out`. CW-25 tried drawing
 *      dark bars onto the wall instead; a thin shape replaced a solid lit
 *      rectangle with a few strokes and whole facades stopped reading as lit
 *      at all. Photographed, and reverted.
 *   2. **No shape that reads as a character.** That is the fault this whole
 *      release exists to remove. Bars, slots and bands only.
 */
// CW-46 facade rider (the directive's third uniformity: "the buildings
// surfaces all being the same size windows"): every archetype now carries
// its OWN bay metre size (bayWM x bayHM), so window rhythm differs between
// families - a 'narrow' punched wall runs 2.8 m bays where a 'band'
// curtain wall runs 5 m. The texture tile stays 8x12 bays; only the metre
// repeat changes, and the per-building phase shift moves in the
// archetype's own bay units, which is what keeps CW-34's whole-bay law
// intact (a fractional shift would put half-height window rows at every
// ground line). The values are a taste table, one line each to reverse.
const WINDOW_ARCHETYPES = [
  // A plain pane split by a centre mullion - the window the city has always
  // had, kept as one family so a share of the buildings look unchanged.
  {
    name: 'plain',
    bayWM: 4,
    bayHM: 3,
    bars: (ctx, x, y, w, h) => {
      ctx.fillRect(x + w * 0.48, y, w * 0.04, h);
    },
  },
  // One tall slot: a narrow vertical opening in a mostly solid bay.
  {
    name: 'slot',
    bayWM: 3.2,
    bayHM: 2.8,
    inset: [0.36, 0.14, 0.28, 0.72],
    bars: () => {},
  },
  // Two panes side by side, a wide mullion between them.
  {
    name: 'pair',
    bayWM: 4.4,
    bayHM: 3.1,
    bars: (ctx, x, y, w, h) => {
      ctx.fillRect(x + w * 0.44, y, w * 0.12, h);
    },
  },
  // A pane with the blinds part way down, at a height that varies per bay.
  {
    name: 'blinds',
    bayWM: 3.6,
    bayHM: 2.9,
    bars: (ctx, x, y, w, h, rand) => {
      const drop = 0.15 + rand() * 0.55;
      ctx.fillRect(x, y, w, h * drop);
      ctx.fillRect(x + w * 0.48, y + h * drop, w * 0.04, h * (1 - drop));
    },
  },
  // Vertical stripes: a curtain-walled bay read as glazing bars.
  {
    name: 'stripes',
    bayWM: 4,
    bayHM: 3.4,
    bars: (ctx, x, y, w, h) => {
      for (let i = 1; i < 4; i++)
        ctx.fillRect(x + w * (i / 4) - w * 0.02, y, w * 0.04, h);
    },
  },
  // One wide horizontal light, short and letterbox-shaped.
  {
    name: 'wide',
    bayWM: 4.8,
    bayHM: 2.7,
    inset: [0.08, 0.3, 0.84, 0.34],
    bars: () => {},
  },
  // Four panes, both mullions crossing.
  {
    name: 'cross',
    bayWM: 3.4,
    bayHM: 3,
    bars: (ctx, x, y, w, h) => {
      ctx.fillRect(x + w * 0.48, y, w * 0.04, h);
      ctx.fillRect(x, y + h * 0.46, w, h * 0.06);
    },
  },
  // A single narrow punched window in a solid wall - brick, not curtain.
  {
    name: 'narrow',
    bayWM: 2.8,
    bayHM: 2.9,
    inset: [0.3, 0.2, 0.4, 0.56],
    bars: (ctx, x, y, w, h) => {
      ctx.fillRect(x + w * 0.46, y, w * 0.08, h);
    },
  },
  // A continuous horizontal band, the pane running the full bay width.
  {
    name: 'band',
    bayWM: 5,
    bayHM: 3.2,
    inset: [0.02, 0.26, 0.96, 0.44],
    bars: (ctx, x, y, w, h) => {
      ctx.fillRect(x + w * 0.5, y, w * 0.03, h);
    },
  },
];

/**
 * What a mapped material biases a building's glazing towards (CW-34 P3).
 *
 * A BIAS, never an override: the listed archetypes are the ones that material
 * chooses among, and the building's own hash still picks which. Denver is 97
 * glass buildings out of 363, and forcing all of them onto one archetype
 * would trade the letterform monoculture this release removed for a material
 * monoculture in its place.
 *
 * Indices into WINDOW_ARCHETYPES: 0 plain, 1 slot, 2 pair, 3 blinds,
 * 4 stripes, 5 wide, 6 cross, 7 narrow, 8 band.
 */
const ARCHETYPES_BY_MATERIAL = new Map([
  // A curtain wall is glazing bars and continuous bands, not punched holes.
  ['glass', [4, 5, 8]],
  ['mirror', [4, 5, 8]],
  ['glass_reinforced_concrete', [4, 8]],
  // Masonry punches holes in a solid wall.
  ['brick', [7, 1, 0]],
  ['stone', [7, 1]],
  ['sandstone', [7, 1]],
  ['concrete', [6, 0, 2]],
  ['plaster', [0, 2]],
  ['metal', [4, 8]],
]);

/** The default pane rectangle, as fractions of a bay. */
const WINDOW_PANE_INSET = [0.2, 0.2, 0.6, 0.56];

/**
 * Window-grid wall texture: lit window shapes on dark grout, one 4×3-bay
 * tile with a deterministic quarter of the windows gone dark.
 *
 * @param {string|null} [family] - the letter this facade's panes are cut
 *   from, or null for the plain rectangular pane
 * @returns {CanvasTexture|null}
 */
/**
 * The wall texture for one window archetype (CW-34).
 *
 * Two things make a facade stop repeating. The first is the archetype: which
 * shape the glazing takes. The second, and the one the eye actually notices,
 * is WHICH WINDOWS ARE LIT.
 *
 * The old pattern rolled each bay dark with probability 0.25, independently,
 * over a 4x3 tile. That produces an even scatter that repeats every four bays
 * across and three up - a texture, in the wallpaper sense, and the city read
 * as wallpaper. Real towers at night are lit in RUNS: a floor of one firm
 * working late is a row of lit windows with dark stretches either side.
 *
 * So the pattern is painted the way PixelCity paints it (idea credit in
 * THIRD_PARTY_NOTICES; no code copied). Per band of floors, re-rolled every
 * few rows, pick a run length and a lit density; walk each row lighting
 * windows in consecutive runs of that length. Lit panes take a brightness
 * jitter and sometimes a vertical curtain streak; dark panes take faint
 * noise, because a dark window is not black.
 *
 * The tile is also much larger than it was - 8 bays by 12 instead of 4 by 3 -
 * so the pattern has room to look unplanned before it wraps.
 *
 * @param {number} archetypeIndex - which entry of WINDOW_ARCHETYPES
 * @returns {CanvasTexture|null}
 */
function createWindowTexture(archetypeIndex = 0) {
  const bayW = 64;
  const bayH = 48;
  const c = make2dContext(bayW * WINDOW_TILE_BAYS_X, bayH * WINDOW_TILE_BAYS_Y);
  if (!c) return null;
  const { canvas, ctx } = c;

  const archetype = WINDOW_ARCHETYPES[archetypeIndex] ?? WINDOW_ARCHETYPES[0];
  const [insetX, insetY, insetW, insetH] = archetype.inset ?? WINDOW_PANE_INSET;

  ctx.fillStyle = '#101010';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Seeded per archetype, so a family always paints the same wall and no two
  // families share a lit pattern that would give them away as one texture in
  // different clothes.
  const rand = makeLcg(0xc17b0011 + archetypeIndex * 0x9e37);

  const paintBay = (bx, by, lit) => {
    const x0 = bx * bayW;
    const y0 = by * bayH;
    const px = x0 + bayW * insetX;
    const py = y0 + bayH * insetY;
    const pw = bayW * insetW;
    const ph = bayH * insetH;

    if (lit) {
      // Jitter, so a run of lit windows is not one flat block of light.
      const level = 196 + Math.floor(rand() * 56);
      ctx.fillStyle = `rgb(${level},${level},${level})`;
    } else {
      const level = 34 + Math.floor(rand() * 16);
      ctx.fillStyle = `rgb(${level},${level},${level})`;
    }
    ctx.fillRect(px, py, pw, ph);

    // The glazing bars are CUT OUT of the pane, never drawn on the wall.
    ctx.globalCompositeOperation = 'destination-out';
    archetype.bars(ctx, px, py, pw, ph, rand);
    // A curtain drawn across part of a lit window: one more thing that
    // differs bay to bay without differing family to family.
    if (lit && rand() < 0.22) {
      const cw = pw * (0.12 + rand() * 0.2);
      ctx.fillRect(px + rand() * (pw - cw), py, cw, ph);
    }
    ctx.globalCompositeOperation = 'source-over';
  };

  let bandRows = 0;
  let runLength = 4;
  let litDensity = 3;
  for (let by = 0; by < WINDOW_TILE_BAYS_Y; by++) {
    if (bandRows <= 0) {
      // A band is a few floors that share a tenant's habits.
      bandRows = 2 + Math.floor(rand() * 4);
      runLength = 2 + Math.floor(rand() * 9);
      litDensity = 2 + Math.floor(rand() * 4);
    }
    bandRows--;
    let bx = 0;
    while (bx < WINDOW_TILE_BAYS_X) {
      const lit = rand() * 5 < litDensity;
      const run = 1 + Math.floor(rand() * runLength);
      for (let k = 0; k < run && bx < WINDOW_TILE_BAYS_X; k++, bx++) {
        paintBay(bx, by, lit);
      }
    }
  }

  const tileWM = (archetype.bayWM ?? WINDOW_BAY_W_M) * WINDOW_TILE_BAYS_X;
  const tileHM = (archetype.bayHM ?? WINDOW_BAY_H_M) * WINDOW_TILE_BAYS_Y;
  // Side-wall v = 1 - z: the -1/tile offset puts a bay boundary at z = 0 so
  // window rows count up from each building's base.
  return makeRepeatingTexture(canvas, 1 / tileWM, 1 / tileHM, -1 / tileHM);
}

/**
 * Storefront texture: one bright glass band per 4 m bay with a dim sign
 * strip above — the ground floor glow of the reference.
 * @returns {CanvasTexture|null}
 */
/**
 * THE GROUND-FLOOR BANDS (CW-34). Art direction, like WINDOW_ARCHETYPES.
 *
 * The owner's second photographed complaint: "the first level of each
 * building is exactly the same". It was — one texture strip, one merged mesh,
 * repeating every four metres along every building in the city.
 *
 * Each entry paints one storefront kind into a bay. They are stacked
 * vertically into ONE texture and each building's ground floor slides its UVs
 * to land on the band it wears, so five kinds still cost one mesh and one
 * draw call.
 *
 * Which one a building gets comes from the nearest shop or eating place in
 * the map data where there is one, and from the building's hash where there
 * is not. Albuquerque has the fewest POIs of the four cities and is the
 * control: it must still look varied on the hash alone.
 */
const STOREFRONT_VARIANTS = [
  {
    name: 'glass',
    paint: (ctx, w, h) => {
      ctx.fillStyle = '#efefef';
      ctx.fillRect(w * 0.08, h * 0.3, w * 0.84, h * 0.62);
      ctx.fillStyle = '#7a7a7a';
      ctx.fillRect(w * 0.08, h * 0.06, w * 0.84, h * 0.14);
      // A mullion, so a wide shopfront is not one undivided slab of light.
      ctx.fillStyle = '#181818';
      ctx.fillRect(w * 0.49, h * 0.3, w * 0.02, h * 0.62);
    },
  },
  {
    name: 'awning',
    paint: (ctx, w, h) => {
      ctx.fillStyle = '#d8d8d8';
      ctx.fillRect(w * 0.1, h * 0.46, w * 0.8, h * 0.46);
      // The awning itself: a bright band with its shadow under it.
      ctx.fillStyle = '#9a9a9a';
      ctx.fillRect(w * 0.04, h * 0.26, w * 0.92, h * 0.16);
      ctx.fillStyle = '#101010';
      ctx.fillRect(w * 0.1, h * 0.42, w * 0.8, h * 0.05);
    },
  },
  {
    name: 'shutter',
    paint: (ctx, w, h) => {
      // Closed for the night: dim, and horizontally ribbed.
      ctx.fillStyle = '#3a3a3a';
      ctx.fillRect(w * 0.08, h * 0.24, w * 0.84, h * 0.68);
      ctx.fillStyle = '#242424';
      for (let i = 0; i < 7; i++) {
        ctx.fillRect(w * 0.08, h * (0.28 + i * 0.09), w * 0.84, h * 0.03);
      }
    },
  },
  {
    name: 'arcade',
    paint: (ctx, w, h) => {
      // A colonnade: two piers with a lit recess between them.
      ctx.fillStyle = '#c8c8c8';
      ctx.fillRect(w * 0.22, h * 0.34, w * 0.56, h * 0.58);
      ctx.fillStyle = '#161616';
      ctx.fillRect(w * 0.0, h * 0.2, w * 0.2, h * 0.8);
      ctx.fillRect(w * 0.8, h * 0.2, w * 0.2, h * 0.8);
    },
  },
  {
    name: 'service',
    paint: (ctx, w, h) => {
      // A blank wall with a service door. Not every ground floor is a shop,
      // and a street where they all are reads as a film set.
      ctx.fillStyle = '#2a2a2a';
      ctx.fillRect(w * 0.06, h * 0.2, w * 0.88, h * 0.72);
      ctx.fillStyle = '#585858';
      ctx.fillRect(w * 0.4, h * 0.42, w * 0.2, h * 0.5);
    },
  },
  // CW-53, the five the owner signed. From here on every band is drawn with
  // features at least three texture pixels across: CW-52 measured that the
  // storefront texture is this city's largest single source of character
  // fracture, and a one-pixel feature is exactly what beats against the cell
  // grid.
  {
    name: 'cafe-tables',
    paint: (ctx, w, h) => {
      // A cafe that spills onto the pavement: lit inside, tables against it.
      ctx.fillStyle = '#e4e4e4';
      ctx.fillRect(w * 0.1, h * 0.44, w * 0.8, h * 0.4);
      ctx.fillStyle = '#a4a4a4';
      ctx.fillRect(w * 0.04, h * 0.24, w * 0.92, h * 0.16);
      ctx.fillStyle = '#101010';
      ctx.fillRect(w * 0.1, h * 0.4, w * 0.8, h * 0.05);
      ctx.fillStyle = '#1c1c1c';
      for (let i = 0; i < 3; i++) {
        ctx.fillRect(w * (0.16 + i * 0.26), h * 0.66, w * 0.14, h * 0.26);
      }
    },
  },
  {
    name: 'barfront',
    paint: (ctx, w, h) => {
      // Dark front, one long lit bar inside, one lit door.
      ctx.fillStyle = '#242424';
      ctx.fillRect(w * 0.06, h * 0.22, w * 0.88, h * 0.7);
      ctx.fillStyle = '#d8d8d8';
      ctx.fillRect(w * 0.12, h * 0.5, w * 0.5, h * 0.14);
      ctx.fillStyle = '#8a8a8a';
      ctx.fillRect(w * 0.7, h * 0.36, w * 0.18, h * 0.56);
    },
  },
  {
    name: 'market',
    paint: (ctx, w, h) => {
      // A stall: striped canopy, goods on a trestle, shadow beneath.
      ctx.fillStyle = '#cfcfcf';
      ctx.fillRect(w * 0.06, h * 0.52, w * 0.88, h * 0.3);
      ctx.fillStyle = '#9c9c9c';
      ctx.fillRect(w * 0.02, h * 0.26, w * 0.96, h * 0.18);
      ctx.fillStyle = '#4a4a4a';
      for (let i = 0; i < 6; i++) {
        ctx.fillRect(w * (0.04 + i * 0.16), h * 0.26, w * 0.05, h * 0.18);
      }
      ctx.fillStyle = '#141414';
      ctx.fillRect(w * 0.06, h * 0.82, w * 0.88, h * 0.1);
    },
  },
  {
    name: 'lobby',
    paint: (ctx, w, h) => {
      // Taller and brighter than a shop, with a door block in the middle.
      ctx.fillStyle = '#ededed';
      ctx.fillRect(w * 0.06, h * 0.16, w * 0.88, h * 0.76);
      ctx.fillStyle = '#161616';
      ctx.fillRect(w * 0.44, h * 0.16, w * 0.03, h * 0.76);
      ctx.fillRect(w * 0.06, h * 0.16, w * 0.88, h * 0.04);
      ctx.fillStyle = '#5c5c5c';
      ctx.fillRect(w * 0.36, h * 0.52, w * 0.28, h * 0.4);
    },
  },
  {
    name: 'roller',
    paint: (ctx, w, h) => {
      // A roller door, ribbed the OTHER way from the shutter above, so the
      // two never read as the same closed front.
      ctx.fillStyle = '#333333';
      ctx.fillRect(w * 0.04, h * 0.2, w * 0.92, h * 0.72);
      ctx.fillStyle = '#1e1e1e';
      for (let i = 0; i < 11; i++) {
        ctx.fillRect(w * (0.06 + i * 0.085), h * 0.24, w * 0.03, h * 0.64);
      }
      ctx.fillStyle = '#6e6e6e';
      ctx.fillRect(w * 0.04, h * 0.2, w * 0.92, h * 0.05);
    },
  },
  // CW-53, the ten the DATA asked for. Each is chosen for a light pattern a
  // sampler can still tell apart at a two-by-four pixel cell, and each is
  // earned by a count measured in the four extracts - the record carries the
  // table.
  {
    name: 'restaurant',
    paint: (ctx, w, h) => {
      ctx.fillStyle = '#e8e8e8';
      ctx.fillRect(w * 0.08, h * 0.28, w * 0.84, h * 0.64);
      ctx.fillStyle = '#1a1a1a';
      for (let i = 0; i < 4; i++) {
        ctx.fillRect(w * (0.12 + i * 0.2), h * 0.7, w * 0.12, h * 0.22);
      }
      ctx.fillStyle = '#8e8e8e';
      ctx.fillRect(w * 0.08, h * 0.2, w * 0.84, h * 0.06);
    },
  },
  {
    name: 'fastfood',
    paint: (ctx, w, h) => {
      // The menu board is the whole identity: a bright band ABOVE the counter.
      ctx.fillStyle = '#c4c4c4';
      ctx.fillRect(w * 0.06, h * 0.5, w * 0.88, h * 0.42);
      ctx.fillStyle = '#ededed';
      ctx.fillRect(w * 0.1, h * 0.24, w * 0.8, h * 0.2);
      ctx.fillStyle = '#202020';
      for (let i = 0; i < 3; i++) {
        ctx.fillRect(w * (0.16 + i * 0.24), h * 0.28, w * 0.04, h * 0.12);
      }
      ctx.fillRect(w * 0.06, h * 0.44, w * 0.88, h * 0.05);
    },
  },
  {
    name: 'clothes',
    paint: (ctx, w, h) => {
      // Two tall display windows split by one dark pier.
      ctx.fillStyle = '#eaeaea';
      ctx.fillRect(w * 0.06, h * 0.24, w * 0.4, h * 0.68);
      ctx.fillRect(w * 0.54, h * 0.24, w * 0.4, h * 0.68);
      ctx.fillStyle = '#141414';
      ctx.fillRect(w * 0.46, h * 0.2, w * 0.08, h * 0.72);
      ctx.fillStyle = '#3a3a3a';
      ctx.fillRect(w * 0.14, h * 0.46, w * 0.08, h * 0.46);
      ctx.fillRect(w * 0.3, h * 0.5, w * 0.08, h * 0.42);
      ctx.fillRect(w * 0.68, h * 0.46, w * 0.08, h * 0.46);
    },
  },
  {
    name: 'salon',
    paint: (ctx, w, h) => {
      // A long lit mirror strip with chairs under it.
      ctx.fillStyle = '#d0d0d0';
      ctx.fillRect(w * 0.08, h * 0.26, w * 0.84, h * 0.66);
      ctx.fillStyle = '#efefef';
      ctx.fillRect(w * 0.12, h * 0.34, w * 0.76, h * 0.16);
      ctx.fillStyle = '#242424';
      for (let i = 0; i < 4; i++) {
        ctx.fillRect(w * (0.14 + i * 0.2), h * 0.6, w * 0.1, h * 0.32);
      }
    },
  },
  {
    name: 'grocer',
    paint: (ctx, w, h) => {
      // Shelves, evenly stacked top to bottom - the one band that is all
      // horizontals at a regular pitch.
      ctx.fillStyle = '#dedede';
      ctx.fillRect(w * 0.06, h * 0.22, w * 0.88, h * 0.7);
      ctx.fillStyle = '#2a2a2a';
      for (let i = 0; i < 5; i++) {
        ctx.fillRect(w * 0.06, h * (0.3 + i * 0.13), w * 0.88, h * 0.045);
      }
    },
  },
  {
    name: 'hotel',
    paint: (ctx, w, h) => {
      // A canopy lit from above, over a dark recessed entrance.
      ctx.fillStyle = '#232323';
      ctx.fillRect(w * 0.06, h * 0.24, w * 0.88, h * 0.68);
      ctx.fillStyle = '#e0e0e0';
      ctx.fillRect(w * 0.24, h * 0.18, w * 0.52, h * 0.12);
      ctx.fillStyle = '#0e0e0e';
      ctx.fillRect(w * 0.24, h * 0.3, w * 0.52, h * 0.06);
      ctx.fillStyle = '#9a9a9a';
      ctx.fillRect(w * 0.36, h * 0.54, w * 0.28, h * 0.38);
    },
  },
  {
    name: 'bank',
    paint: (ctx, w, h) => {
      // Mostly dark stone with ONE lit alcove, which is what a bank is at
      // night.
      ctx.fillStyle = '#1e1e1e';
      ctx.fillRect(w * 0.04, h * 0.18, w * 0.92, h * 0.74);
      ctx.fillStyle = '#6a6a6a';
      ctx.fillRect(w * 0.04, h * 0.18, w * 0.92, h * 0.06);
      ctx.fillStyle = '#e6e6e6';
      ctx.fillRect(w * 0.62, h * 0.44, w * 0.2, h * 0.34);
    },
  },
  {
    name: 'vacant',
    paint: (ctx, w, h) => {
      // Papered over, and unlit. Fifty-seven of these are mapped across the
      // four downtowns; a band with no light in it is the strongest contrast
      // the set has against the nineteen that have some.
      ctx.fillStyle = '#3c3c3c';
      ctx.fillRect(w * 0.08, h * 0.26, w * 0.84, h * 0.66);
      ctx.fillStyle = '#2e2e2e';
      ctx.fillRect(w * 0.08, h * 0.26, w * 0.84, h * 0.05);
    },
  },
  {
    name: 'bakery',
    paint: (ctx, w, h) => {
      // A lit counter with a dark canopy over it, and the tray line across it.
      ctx.fillStyle = '#3a3a3a';
      ctx.fillRect(w * 0.04, h * 0.26, w * 0.92, h * 0.2);
      ctx.fillStyle = '#e2e2e2';
      ctx.fillRect(w * 0.1, h * 0.52, w * 0.8, h * 0.34);
      ctx.fillStyle = '#8c8c8c';
      ctx.fillRect(w * 0.16, h * 0.58, w * 0.68, h * 0.06);
      ctx.fillStyle = '#101010';
      ctx.fillRect(w * 0.1, h * 0.86, w * 0.8, h * 0.06);
    },
  },
  {
    name: 'marquee',
    paint: (ctx, w, h) => {
      // The one band whose light is ABOVE everything else in it.
      ctx.fillStyle = '#1c1c1c';
      ctx.fillRect(w * 0.06, h * 0.42, w * 0.88, h * 0.5);
      ctx.fillStyle = '#ededed';
      ctx.fillRect(w * 0.02, h * 0.2, w * 0.96, h * 0.16);
      ctx.fillStyle = '#2a2a2a';
      for (let i = 0; i < 8; i++) {
        ctx.fillRect(w * (0.06 + i * 0.115), h * 0.24, w * 0.04, h * 0.08);
      }
      ctx.fillStyle = '#7a7a7a';
      ctx.fillRect(w * 0.3, h * 0.6, w * 0.4, h * 0.32);
    },
  },
];

/**
 * Which storefront band a POI kind asks for; anything else falls to the hash.
 *
 * CW-53: shop kinds arrive as `shop:<value>` now that the parser keeps the
 * value. Only the values with a band of their own are listed - every other
 * shop is normalised back to the generic `shop` kind below, so a jeweller and
 * a phone shop read exactly as they did before rather than falling through to
 * the hash and losing the one thing the map data knew about them.
 */
const STOREFRONT_BY_POI = new Map([
  ['shop', 0],
  ['pharmacy', 0],
  ['cafe', 5],
  ['bar', 6],
  ['pub', 6],
  ['marketplace', 7],
  ['library', 8],
  ['post_office', 4],
  ['restaurant', 10],
  ['fast_food', 11],
  ['bank', 16],
  ['cinema', 19],
  ['theatre', 19],
  ['hotel', 15],
  // The ten the shop tag earns, by measured count across the four extracts.
  ['shop:clothes', 12],
  ['shop:shoes', 12],
  ['shop:fashion_accessories', 12],
  ['shop:boutique', 12],
  ['shop:hairdresser', 13],
  ['shop:beauty', 13],
  ['shop:barber', 13],
  ['shop:cosmetics', 13],
  ['shop:convenience', 14],
  ['shop:supermarket', 14],
  ['shop:greengrocer', 14],
  ['shop:deli', 14],
  ['shop:vacant', 17],
  ['shop:bakery', 18],
  ['shop:pastry', 18],
  ['shop:confectionery', 18],
]);

/**
 * CW-53: a shop value with no band of its own reads as the generic shop.
 *
 * The alternative - letting it fall through to the hash - would throw away the
 * one fact the map actually recorded about that corner, which is the opposite
 * of what keeping the value was for.
 *
 * @param {string|null} kind
 * @returns {string|null}
 */
function normalizeStorefrontKind(kind) {
  if (kind === null || !kind.startsWith('shop:')) return kind;
  return STOREFRONT_BY_POI.has(kind) ? kind : 'shop';
}

/**
 * CW-53: the twenty ground floors, in band order.
 *
 * Exported because it is DESIGN DATA the owner can veto row by row, and a
 * table nothing names in a test is a table that can be reordered by accident -
 * the band index is baked into every storefront's UVs.
 */
export const STOREFRONT_BAND_NAMES = STOREFRONT_VARIANTS.map((v) => v.name);

/**
 * CW-53: which band a POI kind lands on, or null when it falls to the hash.
 *
 * The scene calls this rather than reading the map directly, so a test that
 * pins the mapping is pinning the code the city actually runs.
 *
 * @param {string|null} kind
 * @returns {number|null}
 */
export function storefrontBandFor(kind) {
  const normalized = normalizeStorefrontKind(kind ?? null);
  if (normalized === null) return null;
  return STOREFRONT_BY_POI.get(normalized) ?? null;
}

// CW-46 rider (c): "white shop lights is repetitive" - each storefront's
// glass now leans warm, cool or neutral. Places that serve food glow warm,
// retail stays neutral, services lean cool; buildings with no nearby POI
// hash across the set. Taste table, one line each to reverse; every tint's
// luminance stays in the ~0.93-0.95 storefront band the CAR_TIERS ladder
// reserves above the props.
const STOREFRONT_TEMPERATURES = {
  warm: [1.0, 0.94, 0.78],
  neutral: [0.95, 0.95, 0.95],
  cool: [0.85, 0.95, 1.0],
};
const STOREFRONT_TEMP_BY_POI = new Map([
  ['restaurant', 'warm'],
  ['cafe', 'warm'],
  ['fast_food', 'warm'],
  ['bar', 'warm'],
  ['pub', 'warm'],
  ['marketplace', 'warm'],
  ['shop:bakery', 'warm'],
  ['shop:pastry', 'warm'],
  ['shop:confectionery', 'warm'],
  ['shop:convenience', 'warm'],
  ['shop:supermarket', 'warm'],
  ['shop:greengrocer', 'warm'],
  ['shop:deli', 'warm'],
  ['shop', 'neutral'],
  ['pharmacy', 'neutral'],
  ['hotel', 'neutral'],
  ['shop:clothes', 'neutral'],
  ['shop:shoes', 'neutral'],
  ['shop:fashion_accessories', 'neutral'],
  ['shop:boutique', 'neutral'],
  ['shop:hairdresser', 'neutral'],
  ['shop:beauty', 'neutral'],
  ['shop:barber', 'neutral'],
  ['shop:cosmetics', 'neutral'],
  // Papered over and unlit: it takes the street's own light, not its own.
  ['shop:vacant', 'neutral'],
  ['bank', 'cool'],
  ['cinema', 'cool'],
  ['theatre', 'cool'],
  ['library', 'cool'],
  ['post_office', 'cool'],
]);
const STOREFRONT_TEMP_KEYS = ['warm', 'neutral', 'cool'];

function storefrontTemperatureTint(h, poiKind) {
  const biased =
    poiKind !== null ? STOREFRONT_TEMP_BY_POI.get(poiKind) : undefined;
  const key = biased ?? STOREFRONT_TEMP_KEYS[(h >>> 17) % 3];
  return STOREFRONT_TEMPERATURES[key];
}

/**
 * Every storefront band in one texture, stacked vertically.
 *
 * A building picks its band by sliding its ground floor's UVs, so five kinds
 * cost one texture, one material and one mesh — the same trick the window
 * archetypes use per building, applied to a different axis.
 *
 * @returns {CanvasTexture|null}
 */
function createStorefrontTexture() {
  const bandH = 112;
  const c = make2dContext(192, bandH * STOREFRONT_VARIANTS.length);
  if (!c) return null;
  const { canvas, ctx } = c;

  ctx.fillStyle = '#181818';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  STOREFRONT_VARIANTS.forEach((variant, i) => {
    ctx.save();
    ctx.translate(0, i * bandH);
    variant.paint(ctx, canvas.width, bandH);
    ctx.restore();
  });

  const tileHM = STOREFRONT_HEIGHT_M * STOREFRONT_VARIANTS.length;
  return makeRepeatingTexture(
    canvas,
    1 / WINDOW_BAY_W_M,
    1 / tileHM,
    -1 / tileHM
  );
}

/**
 * Ground dither texture: dim streaks on black for the near-field pavement
 * (CW-18 retune); everything else stays exact black, which is the only tone
 * the converter reads as an empty cell.
 *
 * Three rules, all learned the hard way:
 * - Tones stay inside a narrow dim band. A visible SURFACE tone carpets the
 *   lower half of the street view, because perspective stacks every metre of
 *   road between here and the horizon into a few cell rows.
 * - The marks are STREAKS, not dots. The reference's pavement reads as scuffs
 *   and tyre lines; single pixels sub-sample to nothing at a distance and to
 *   a regular stipple up close.
 * - The density is uneven. A flat scatter reads as a carpet however dim it
 *   is, so most marks arrive in patches with bare tarmac between them.
 * @returns {CanvasTexture|null}
 */
function createGroundTexture() {
  const size = 256;
  const c = make2dContext(size, size);
  if (!c) return null;
  const { canvas, ctx } = c;

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, size, size);

  const rand = makeLcg(0x5eed6a0d);
  const tone = () => {
    const v = GROUND_TONE_MIN + Math.floor(rand() * GROUND_TONE_SPAN);
    return `rgb(${v}, ${v}, ${v})`;
  };
  // One streak: a run of pixels along one axis, mostly the long way.
  const streak = (x, y) => {
    const len = 2 + Math.floor(rand() * GROUND_STREAK_MAX_PX);
    ctx.fillStyle = tone();
    if (rand() < GROUND_STREAK_ALONG_SHARE) ctx.fillRect(x, y, len, 1);
    else ctx.fillRect(x, y, 1, len);
  };

  // Patches first: a scuffed stretch of tarmac, then the sparse scatter that
  // keeps the bare ground from reading as a hard edge around them.
  for (let p = 0; p < GROUND_PATCHES; p++) {
    const cx = rand() * size;
    const cy = rand() * size;
    for (let i = 0; i < GROUND_PATCH_STREAKS; i++) {
      const dx = (rand() - 0.5) * 2 * GROUND_PATCH_RADIUS_PX;
      const dy = (rand() - 0.5) * 2 * GROUND_PATCH_RADIUS_PX;
      streak(
        Math.floor(cx + dx) & (size - 1),
        Math.floor(cy + dy) & (size - 1)
      );
    }
  }
  for (let i = 0; i < GROUND_LOOSE_STREAKS; i++) {
    streak(Math.floor(rand() * size), Math.floor(rand() * size));
  }

  const texture = makeRepeatingTexture(
    canvas,
    1 / GROUND_TILE_M,
    1 / GROUND_TILE_M
  );
  texture.anisotropy = GROUND_ANISOTROPY;
  return texture;
}

/**
 * Which paving finish a city's pavements wear (CW-51, CW-Q51).
 *
 * TWO of these are the owner's own words and ship as given. The other two are
 * what the cities' own specifications say, fetched and cited at execution -
 * and one of them REFUTES what the plan expected:
 *
 * - seattle   'aggregate': pebbly river-stone aggregate. The owner's words.
 * - albuquerque 'cracked': flat, with cracks and intentional grip-scoring
 *               lines. The owner's words.
 * - denver    'broom': Denver Parks and Recreation's construction standards
 *               require that all concrete walkways have a BROOM FINISH - a
 *               soft-bristle broom drawn across float-finished concrete,
 *               perpendicular to the line of travel, for slip resistance.
 * - burnaby   'broom': Burnaby's Supplementary Specifications adopt MMCD
 *               2019, whose Section 03 30 20 (Concrete Walks, Curbs and
 *               Gutters) specifies a broom finish for sidewalks. The plan
 *               EXPECTED exposed aggregate here; the specification does not
 *               support it, and exposed aggregate in BC is a decorative or
 *               private finish rather than the municipal sidewalk standard.
 *
 * So Denver and Burnaby share a finish because they genuinely specify the
 * same one. That is a finding, not a gap: inventing a difference to make four
 * cities look four ways would be the dishonest option. Denver's real
 * distinguishing feature is a DETACHED sidewalk with a tree-lawn amenity zone
 * between kerb and walk, which is ground character rather than paving texture
 * and belongs to CW-57.
 *
 * Every row here is design data the owner can veto.
 */
export const CITY_PAVING = {
  seattle: 'aggregate',
  albuquerque: 'cracked',
  denver: 'broom',
  burnaby: 'broom',
};
const DEFAULT_PAVING = 'broom';

// Municipal sidewalk standards put control joints at roughly the width of the
// walk - 4 to 6 ft on a standard walk - so the seams land about every 1.5 m.
const PAVING_SCORE_M = 1.5;
// One tile covers this many metres, and the UVs are in metres, so the repeat
// is just distance / tile.
const PAVING_TILE_M = 6;
const PAVING_TILE_PX = 256;

/**
 * A pavement's paving texture: scoring seams everywhere, plus the city's own
 * finish on top.
 *
 * Brightness only - the tone stays SIDEWALK_TONES' own dark neighbourhood and
 * the texture multiplies it. A paving that brightened the pavement would
 * carpet the lower half of the street view, which is the CW-8 law this whole
 * cluster is written around.
 *
 * @param {'aggregate'|'cracked'|'broom'} style
 * @returns {CanvasTexture|null}
 */
function createPavingTexture(style) {
  const size = PAVING_TILE_PX;
  const c = make2dContext(size, size);
  if (!c) return null;
  const { canvas, ctx } = c;
  const pxPerM = size / PAVING_TILE_M;

  // Mid grey is "unchanged": the texture multiplies the material tone, so
  // everything here is a small step either side of it.
  ctx.fillStyle = 'rgb(160,160,160)';
  ctx.fillRect(0, 0, size, size);
  const rand = makeLcg(0x5caff01d);
  const grey = (v) => `rgb(${v},${v},${v})`;

  if (style === 'aggregate') {
    // Pebbly river-stone: dense small round speckle, low contrast, so it
    // reads as a gritty surface rather than as dots.
    for (let i = 0; i < 2600; i++) {
      const r = 0.7 + rand() * 1.6;
      ctx.beginPath();
      ctx.arc(rand() * size, rand() * size, r, 0, Math.PI * 2);
      ctx.fillStyle = grey(140 + Math.floor(rand() * 46));
      ctx.fill();
    }
  } else if (style === 'broom') {
    // Broom finish: fine parallel lines drawn PERPENDICULAR to the line of
    // travel, which is across the walk - so they run along the u axis.
    for (let y = 0; y < size; y += 2) {
      ctx.fillStyle = grey(150 + Math.floor(rand() * 22));
      ctx.fillRect(0, y, size, 1);
    }
  } else {
    // Cracked and grip-scored: a flat slab, a few wandering cracks, and
    // deliberate scoring lines cut across it for grip.
    for (let i = 0; i < 5; i++) {
      let x = rand() * size;
      let y = rand() * size;
      ctx.strokeStyle = grey(126 + Math.floor(rand() * 16));
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let s = 0; s < 26; s++) {
        x += (rand() - 0.5) * 18;
        y += (rand() - 0.35) * 14;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    for (let g = 0; g < 6; g++) {
      const y = ((g + 0.5) * size) / 6;
      ctx.fillStyle = grey(150);
      ctx.fillRect(0, Math.round(y), size, 1);
    }
  }

  // The scoring seams last, so nothing paints over them: control joints at
  // PAVING_SCORE_M, darker than the slab because a joint is a groove.
  const seam = Math.max(1, Math.round(0.03 * pxPerM));
  for (let m = 0; m < PAVING_TILE_M; m += PAVING_SCORE_M) {
    ctx.fillStyle = grey(118);
    ctx.fillRect(0, Math.round(m * pxPerM), size, seam);
  }

  // The UVs are in METRES, so the repeat is one tile per PAVING_TILE_M and a
  // pavement keeps one real-world paving scale whatever its width.
  return makeRepeatingTexture(canvas, 1 / PAVING_TILE_M, 1 / PAVING_TILE_M);
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/**
 * Extrude one building footprint. Footprint coordinates are meters in the
 * XY plane; extrusion runs along +Z from minHeightM to heightM.
 *
 * @param {{outer: Array<[number,number]>, holes: Array<Array<[number,number]>>, heightM: number, minHeightM: number}} building
 * @param {[number, number, number]} tint - per-vertex color for the whole building
 * @param {{depthOverride?: number}} [options]
 * @returns {ExtrudeGeometry|null}
 */
/**
 * Slide a geometry's UVs, in tile fractions (CW-34).
 *
 * The window texture repeats every WINDOW_TILE_BAYS_X bays across and
 * WINDOW_TILE_BAYS_Y up, and its `repeat` is set in metres, so a shift of one
 * bay's width moves the pattern one window along on this geometry and nothing
 * else. Eight by twelve gives ninety-six distinct walls per archetype.
 */
function scaleGeometryUv(geometry, su, sv) {
  const uv = geometry.getAttribute('uv');
  if (!uv) return;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  }
  uv.needsUpdate = true;
}

function offsetGeometryUv(geometry, du, dv) {
  const uv = geometry.getAttribute('uv');
  if (!uv) return;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) + du, uv.getY(i) + dv);
  }
  uv.needsUpdate = true;
}

function extrudeBuilding(building, tint, options = {}) {
  const shape = new Shape(building.outer.map(([x, y]) => new Vector2(x, y)));
  for (const hole of building.holes) {
    shape.holes.push(new Path(hole.map(([x, y]) => new Vector2(x, y))));
  }

  const depth = options.depthOverride ?? building.heightM - building.minHeightM;
  if (!(depth > 0)) return null;

  let geometry;
  try {
    geometry = new ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: false,
      curveSegments: 1,
    });
  } catch (_) {
    // Malformed polygons that survived parsing must not kill the city.
    return null;
  }
  if (options.depthOverride === undefined && building.minHeightM > 0) {
    geometry.translate(0, 0, building.minHeightM);
  }

  paintGeometry(geometry, tint);

  return geometry;
}

// CW-26 roofs. Only these three become geometry. Each has an exact
// construction a walker can recognise on a skyline; round, dome, mansard,
// skillion and the rest keep their flat top rather than being guessed at,
// because a wrong roof reads worse than no roof.
const ROOF_SHAPES_BUILT = new Set(['pyramidal', 'gabled', 'hipped']);

// A gable needs a ridge, and a ridge needs to know which way the building
// runs. That question only has an honest answer when the footprint really is
// a rectangle, so anything baggier than this keeps its flat top.
const ROOF_RECT_FILL_MIN = 0.85;

/** Unsigned shoelace area of a projected ring. */
function ringAreaM2(ring) {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return Math.abs(sum / 2);
}

/**
 * Smallest-area oriented bounding box of a ring, swept in one-degree steps.
 * Exact enough to place a ridge and far less code than rotating calipers.
 *
 * @param {Array<[number,number]>} ring
 * @returns {{area:number,c:number,s:number,minU:number,maxU:number,minV:number,maxV:number}|null}
 */
function orientedBox(ring) {
  let best = null;
  for (let deg = 0; deg < 90; deg++) {
    const a = (deg * Math.PI) / 180;
    const c = Math.cos(a);
    const s = Math.sin(a);
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    for (const [x, y] of ring) {
      const u = x * c + y * s;
      const v = -x * s + y * c;
      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }
    const area = (maxU - minU) * (maxV - minV);
    if (best === null || area < best.area) {
      best = { area, c, s, minU, maxU, minV, maxV };
    }
  }
  return best && best.area > 0 ? best : null;
}

/**
 * A sloped roof solid standing on a volume's footprint, or null when the
 * shape is not one we build or the footprint cannot carry an honest ridge.
 * The body below has already been shortened by the roof's height, so this
 * caps it rather than sitting on top of a full-height box.
 *
 * @param {Object} volume - a building or building:part, carrying .roof
 * @param {[number, number, number]} tint
 * @returns {BufferGeometry|null}
 */
function roofGeometry(volume, tint) {
  const roof = volume.roof;
  if (!roof || !ROOF_SHAPES_BUILT.has(roof.shape)) return null;
  const ring = volume.outer;
  if (!Array.isArray(ring) || ring.length < 3) return null;

  const topZ = volume.heightM;
  const baseZ = topZ - roof.heightM;
  if (!(baseZ > volume.minHeightM)) return null;

  const tris = [];
  const push = (a, b, c) => {
    tris.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  };

  if (roof.shape === 'pyramidal') {
    // Exact for ANY polygon: every footprint edge rises to one apex.
    let cx = 0;
    let cy = 0;
    for (const [x, y] of ring) {
      cx += x;
      cy += y;
    }
    const apex = [cx / ring.length, cy / ring.length, topZ];
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      push(
        [ring[j][0], ring[j][1], baseZ],
        [ring[i][0], ring[i][1], baseZ],
        apex
      );
    }
  } else {
    const box = orientedBox(ring);
    if (!box) return null;
    if (ringAreaM2(ring) / box.area < ROOF_RECT_FILL_MIN) return null;

    const { c, s, minU, maxU, minV, maxV } = box;
    // The ridge runs along the LONG axis unless the mapper said otherwise.
    let alongU = maxU - minU >= maxV - minV;
    if (roof.orientation === 'across') alongU = !alongU;

    // One construction serves both axes: p runs along the ridge, q across it.
    const at = alongU
      ? (p, q, z) => [p * c - q * s, p * s + q * c, z]
      : (p, q, z) => [q * c - p * s, q * s + p * c, z];
    const p0 = alongU ? minU : minV;
    const p1 = alongU ? maxU : maxV;
    const q0 = alongU ? minV : minU;
    const q1 = alongU ? maxV : maxU;

    const qMid = (q0 + q1) / 2;
    // A hip pulls the ridge in by half the width at each end; a gable does
    // not, which leaves its ends vertical triangles instead of slopes.
    const inset =
      roof.shape === 'hipped'
        ? Math.min((q1 - q0) / 2, (p1 - p0) / 2 - 0.01)
        : 0;

    const r0 = at(p0 + inset, qMid, topZ);
    const r1 = at(p1 - inset, qMid, topZ);
    const c00 = at(p0, q0, baseZ);
    const c10 = at(p1, q0, baseZ);
    const c11 = at(p1, q1, baseZ);
    const c01 = at(p0, q1, baseZ);

    push(c00, c10, r1);
    push(c00, r1, r0);
    push(c11, c01, r0);
    push(c11, r0, r1);
    push(c10, c11, r1);
    push(c01, c00, r0);
  }

  if (tris.length === 0) return null;
  const geometry = new BufferGeometry();
  const position = new Float32Array(tris);
  geometry.setAttribute('position', new BufferAttribute(position, 3));
  // The buildings merge as one geometry, so the attribute set has to match
  // what ExtrudeGeometry produces or mergeGeometries refuses the batch.
  geometry.setAttribute(
    'uv',
    new BufferAttribute(new Float32Array((position.length / 3) * 2), 2)
  );
  geometry.computeVertexNormals();
  paintGeometry(geometry, tint);
  return geometry;
}

/**
 * Build flat ribbon strips along a road centerline: two triangles per
 * segment, unmitred joins (adjacent quads simply overlap). With
 * `edgeOffset`, the ribbon is shifted sideways from the centerline —
 * that is how the curb lines are drawn (one ribbon per side).
 *
 * @param {{points: Array<[number,number]>, widthM: number}} road
 * @param {number[]} positions - flat xyz output array (appended to)
 * @param {{minX:number,minY:number,maxX:number,maxY:number}} [cullBounds]
 *   segments with both endpoints outside are skipped
 * @param {{widthM?: number, offsetM?: number, liftM?: number}} [shape]
 *   ribbon width / sideways offset / z lift overrides
 */
/**
 * The vertical face of a curb: a wall standing along one edge of a road, from
 * the roadway up to the pavement (CW-50). Without it the raised pavement is a
 * lid with nothing under it, and a low camera sees straight through the step.
 *
 * @param {{points: Array<[number,number]>, widthM: number}} road
 * @param {number[]} positions - flat xyz output array (appended to)
 * @param {{minX:number,minY:number,maxX:number,maxY:number}} [cullBounds]
 * @param {{offsetM: number, loZ: number, hiZ: number}} shape
 */
function appendCurbFace(road, positions, cullBounds, shape) {
  const { offsetM, loZ, hiZ } = shape;
  const inBounds = (x, y) =>
    !cullBounds ||
    (x >= cullBounds.minX &&
      x <= cullBounds.maxX &&
      y >= cullBounds.minY &&
      y <= cullBounds.maxY);
  for (let i = 0; i < road.points.length - 1; i++) {
    const [x1, y1] = road.points[i];
    const [x2, y2] = road.points[i + 1];
    if (!inBounds(x1, y1) && !inBounds(x2, y2)) continue;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    const nx = (-dy / len) * offsetM;
    const ny = (dx / len) * offsetM;
    const ax = x1 + nx;
    const ay = y1 + ny;
    const bx = x2 + nx;
    const by = y2 + ny;
    positions.push(
      ax,
      ay,
      loZ,
      bx,
      by,
      loZ,
      bx,
      by,
      hiZ,
      ax,
      ay,
      loZ,
      bx,
      by,
      hiZ,
      ax,
      ay,
      hiZ
    );
  }
}

/**
 * A dashed centre line down a two-way arterial (CW-51).
 *
 * OpenStreetMap carries NO road_marking tags at all in any of the four baked
 * circles, so this is derived from the road CLASS rather than from data, and
 * the record says so. Only arterials get one: a residential street often has
 * no centre line in life, and painting every street is the fastest way to
 * break the CW-8 carpet law.
 *
 * The rhythm is the US skip line, 3 m of paint to 9 m of gap, and the paint is
 * 0.12 m wide - real paint width, which is sub-cell at any distance BY DESIGN.
 * That is what keeps it reading as dashes near the walker and sub-sampling
 * away down the street rather than laying a stripe to the horizon.
 *
 * The cursor carries ACROSS segments: OSM splits a street into many short
 * ways, and restarting the rhythm at each vertex would bunch paint at bends.
 *
 * @param {{points: Array<[number,number]>}} road
 * @param {number[]} positions - flat xyz output array (appended to)
 * @param {{minX:number,minY:number,maxX:number,maxY:number}} [cullBounds]
 * @param {number} startCursorM - where in the paint/gap cycle this road begins
 * @returns {number} the cursor to carry into the next road
 */
function appendCenterLineDashes(road, positions, cullBounds, startCursorM = 0) {
  const period = LINE_PAINT_M + LINE_GAP_M;
  let cursor = ((startCursorM % period) + period) % period;
  const half = LINE_WIDTH_M / 2;
  const inBounds = (x, y) =>
    !cullBounds ||
    (x >= cullBounds.minX &&
      x <= cullBounds.maxX &&
      y >= cullBounds.minY &&
      y <= cullBounds.maxY);

  for (let i = 0; i < road.points.length - 1; i++) {
    const [x1, y1] = road.points[i];
    const [x2, y2] = road.points[i + 1];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    const ux = dx / len;
    const uy = dy / len;
    const nx = -uy * half;
    const ny = ux * half;
    const skip = !inBounds(x1, y1) && !inBounds(x2, y2);

    let t = 0;
    while (t < len) {
      const intoCycle = cursor % period;
      if (intoCycle < LINE_PAINT_M) {
        const run = Math.min(LINE_PAINT_M - intoCycle, len - t);
        if (!skip && run > 0.01) {
          const ax = x1 + ux * t;
          const ay = y1 + uy * t;
          const bx = x1 + ux * (t + run);
          const by = y1 + uy * (t + run);
          positions.push(
            ax + nx,
            ay + ny,
            LINE_LIFT_M,
            ax - nx,
            ay - ny,
            LINE_LIFT_M,
            bx - nx,
            by - ny,
            LINE_LIFT_M,
            ax + nx,
            ay + ny,
            LINE_LIFT_M,
            bx - nx,
            by - ny,
            LINE_LIFT_M,
            bx + nx,
            by + ny,
            LINE_LIFT_M
          );
        }
        t += run;
        cursor += run;
      } else {
        const run = Math.min(period - intoCycle, len - t);
        t += run;
        cursor += run;
      }
    }
  }
  return cursor;
}

function appendRoadRibbon(road, positions, cullBounds, shape = {}) {
  const half = (shape.widthM ?? road.widthM) / 2;
  const offset = shape.offsetM ?? 0;
  const lift = shape.liftM ?? ROAD_LIFT_M;
  const inBounds = (x, y) =>
    !cullBounds ||
    (x >= cullBounds.minX &&
      x <= cullBounds.maxX &&
      y >= cullBounds.minY &&
      y <= cullBounds.maxY);
  for (let i = 0; i < road.points.length - 1; i++) {
    const [x1, y1] = road.points[i];
    const [x2, y2] = road.points[i + 1];
    if (!inBounds(x1, y1) && !inBounds(x2, y2)) continue;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    const nx = -dy / len;
    const ny = dx / len;
    const cx1 = x1 + nx * offset;
    const cy1 = y1 + ny * offset;
    const cx2 = x2 + nx * offset;
    const cy2 = y2 + ny * offset;
    const px = nx * half;
    const py = ny * half;

    const a = [cx1 + px, cy1 + py, lift];
    const b = [cx1 - px, cy1 - py, lift];
    const c = [cx2 - px, cy2 - py, lift];
    const d = [cx2 + px, cy2 + py, lift];
    // Two CCW triangles (normal +Z): a-b-c, a-c-d
    positions.push(...a, ...b, ...c, ...a, ...c, ...d);
    // CW-33: the surface tint rides as a vertex colour so that every ribbon
    // stays in ONE merged mesh. Splitting by paving material would multiply
    // the draw calls and, worse, give the class pass a new mesh name to learn
    // for every value OSM happens to carry.
    if (shape.colors) {
      const t = shape.tint ?? 1;
      for (let v = 0; v < 6; v++) shape.colors.push(t, t, t);
    }
    // CW-51: UVs in METRES, so a paving texture keeps one real-world scale
    // whatever width the ribbon is and however the way is split. v runs
    // ALONG the ribbon and carries across segments on `shape.uvCursor`,
    // otherwise the scoring seams would restart at every OSM vertex and
    // bunch at bends the way the centre-line dashes would have.
    if (shape.uvs) {
      const v0 = shape.uvCursor ?? 0;
      const v1 = v0 + len;
      const u = half;
      shape.uvs.push(u, v0, -u, v0, -u, v1, u, v0, -u, v1, u, v1);
      shape.uvCursor = v1;
    }
  }
}

/** The tone multiplier a ribbon takes from its `surface` tag (CW-33). */
function surfaceTint(surface, fallback) {
  return SURFACE_TONE_SCALE[surface] ?? SURFACE_TONE_SCALE[fallback] ?? 1;
}

// ---------------------------------------------------------------------------
// Facade and rooftop dressing (CW-18)
// ---------------------------------------------------------------------------

/**
 * The wall to hang a sign on: one of the footprint's longest, and of those
 * the one nearest a street, because a sign nobody walks past is not a sign.
 *
 * Outer rings are guaranteed counter-clockwise by city-data's projectRing, so
 * the outward normal of the edge i -> i+1 is its RIGHT normal - no centroid
 * guess needed, which matters because a centroid guess is wrong for any
 * concave block.
 *
 * @param {Array<[number, number]>} ring
 * @param {(x: number, y: number) => number} roadDistance
 * @returns {{midX:number, midY:number, ux:number, uy:number, ox:number, oy:number, lengthM:number, angleRad:number}|null}
 */
function signWall(ring, roadDistance) {
  const walls = [];
  let longestM = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (!(len > 0)) continue;
    if (len > longestM) longestM = len;
    walls.push({
      midX: (x1 + x2) / 2,
      midY: (y1 + y2) / 2,
      ux: dx / len,
      uy: dy / len,
      ox: dy / len,
      oy: -dx / len,
      lengthM: len,
      angleRad: Math.atan2(dy, dx),
    });
  }
  if (walls.length === 0) return null;

  let best = null;
  let bestDist = Infinity;
  for (const wall of walls) {
    if (wall.lengthM < longestM * SIGN_WALL_LENGTH_SHARE) continue;
    const d = roadDistance(wall.midX, wall.midY);
    // Ties - including a building with no road in reach at all, where every
    // distance is Infinity - fall back to the longest wall.
    if (
      !best ||
      d < bestDist ||
      (d === bestDist && wall.lengthM > best.lengthM)
    ) {
      best = wall;
      bestDist = d;
    }
  }
  return best;
}

/**
 * Hang one sign on a wall: the bright plate, then the tinted face laid over
 * it and standing a little proud so the two never share a plane.
 *
 * @param {{plates: Array, faces: Array}} out
 * @param {ReturnType<typeof longestWall>} wall
 * @param {{widthM:number, heightM:number, baseZ:number, hueDeg:number, alongM?:number}} spec
 *   alongM slides the sign away from the wall's midpoint, which is how one
 *   frontage carries a row of them
 */
function appendSign(out, wall, spec) {
  const { widthM, heightM, baseZ, hueDeg } = spec;
  const alongM = spec.alongM ?? 0;
  const anchorX = wall.midX + wall.ux * alongM;
  const anchorY = wall.midY + wall.uy * alongM;
  const centerZ = baseZ + heightM / 2;
  const plateOut = SIGN_STANDOFF_M + SIGN_THICKNESS_M / 2;
  out.plates.push(
    makeBox(
      widthM,
      SIGN_THICKNESS_M,
      heightM,
      anchorX + wall.ox * plateOut,
      anchorY + wall.oy * plateOut,
      centerZ,
      wall.angleRad,
      SIGN_PLATE_TINT
    )
  );

  const frameM = Math.min(SIGN_FRAME_MAX_M, heightM * SIGN_FRAME_SHARE);
  const faceW = widthM - frameM * 2;
  const faceH = heightM - frameM * 2;
  if (faceW <= 0 || faceH <= 0) return;
  const faceT = SIGN_THICKNESS_M * 0.7;
  const faceOut = SIGN_STANDOFF_M + SIGN_THICKNESS_M + faceT / 2 - 0.03;
  out.faces.push(
    makeBox(
      faceW,
      faceT,
      faceH,
      anchorX + wall.ox * faceOut,
      anchorY + wall.oy * faceOut,
      centerZ,
      wall.angleRad,
      tintOf(SIGN_FACE_TIER, hueDeg, SIGN_FACE_CHROMA)
    )
  );
}

/**
 * One to three masts on a roof, each with a cross tuft near its tip - the
 * reference's thin ticks above the skyline. The mast foot must be a point
 * that is genuinely inside the footprint, or a tower would grow an aerial
 * floating beside it; concave blocks make that a real case, so the candidate
 * is tested rather than assumed.
 *
 * @param {Array} geoms
 * @param {{outer: Array<[number,number]>, heightM: number}} building
 * @param {number} hash
 * @param {[number, number, number]} tint
 * @returns {number} masts placed
 */
function appendAntennas(geoms, building, hash, tint) {
  const ring = building.outer;
  let cx = 0;
  let cy = 0;
  for (const [x, y] of ring) {
    cx += x;
    cy += y;
  }
  cx /= ring.length;
  cy /= ring.length;

  const rand = makeLcg(hash);
  const count = 1 + (hash % 3);
  let placed = 0;
  for (let i = 0; i < count; i++) {
    const vertex = ring[Math.floor(rand() * ring.length) % ring.length];
    // Pulled well in from its vertex, toward the middle of the roof.
    const t = 0.45 + rand() * 0.3;
    const x = vertex[0] + (cx - vertex[0]) * t;
    const y = vertex[1] + (cy - vertex[1]) * t;
    if (!pointInRing(x, y, ring)) continue;

    const mastH =
      ANTENNA_MAST_MIN_M + rand() * (ANTENNA_MAST_MAX_M - ANTENNA_MAST_MIN_M);
    const base = building.heightM;
    geoms.push(
      makeBox(
        ANTENNA_MAST_SIDE_M,
        ANTENNA_MAST_SIDE_M,
        mastH,
        x,
        y,
        base + mastH / 2,
        0,
        tint
      )
    );
    geoms.push(
      makeBox(
        ANTENNA_TUFT_SPAN_M,
        ANTENNA_TUFT_THICK_M,
        ANTENNA_TUFT_THICK_M,
        x,
        y,
        base + mastH * 0.82,
        rand() * Math.PI,
        tint
      )
    );
    placed++;
  }
  return placed;
}

/**
 * The height a building must reach before it earns a mast: the tall tail of
 * this city, but never a shed. Albuquerque's 85th percentile is 9 m.
 *
 * @param {Array<{heightM: number}>} buildings
 * @returns {number}
 */
function antennaHeightCutoff(buildings) {
  if (buildings.length === 0) return Infinity;
  const heights = buildings.map((x) => x.heightM).sort((a, b) => a - b);
  const at =
    heights[
      Math.min(
        heights.length - 1,
        Math.floor(heights.length * ANTENNA_HEIGHT_PERCENTILE)
      )
    ];
  return Math.max(at, ANTENNA_MIN_HEIGHT_M);
}

/**
 * Build the static city world group.
 *
 * @param {ReturnType<import('./city-data.js').parseCityExtract>} model
 * @returns {{
 *   group: Group,
 *   setMapView: (isMap: boolean) => void,
 *   dispose: () => void,
 *   stats: {buildingTriangles: number, storefrontTriangles: number, roadTriangles: number, signCount: number, antennaCount: number, dressingTriangles: number}
 * }}
 */
/**
 * How much of a building face survives the fog at any distance (CW-24).
 *
 * The fog fades to BLACK at 260 m, and only EXACT black reads as an empty
 * cell (the CW-1 finding), so every tower past the fog was being deleted from
 * the picture rather than pushed into the distance — the middle of the frame
 * came out as a void while the bake holds real geometry out to 707 m.
 *
 * Clamping the fog factor leaves this fraction of the lit surface behind at
 * any distance, so a far tower is a dim silhouette instead of a hole. Only
 * the BUILDINGS get this: ground, roads and curbs must still vanish, because
 * a dim carpet across the lower half of the frame is the recorded round-1
 * failure and perspective stacks every road between here and the horizon into
 * a few rows of cells.
 */
const FAR_SILHOUETTE_KEEP = 0.14;

/**
 * Give a material a fog FLOOR: it fogs normally with distance, then stops.
 *
 * three.js has no such knob, so this rewrites the stock fog chunk. The stock
 * chunk computes a fog factor and mixes to the fog colour; this one clamps
 * that factor first. Both fog kinds are handled because the chunk is replaced
 * whole and the scene's fog kind is not this function's business to assume.
 *
 * @param {import('three').Material} material
 * @param {number} [keep] - fraction of the surface that survives at any range
 */
function applyFarSilhouetteFog(material, keep = FAR_SILHOUETTE_KEEP) {
  const maxFactor = Math.max(0, Math.min(1, 1 - keep));
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uMaxFogFactor = { value: maxFactor };
    // Kept reachable so the floor can be measured and tuned against a live
    // frame: writing the uniform takes effect on the next draw, where
    // changing the constant would mean a rebuild and a different session.
    material.userData.maxFogFactor = shader.uniforms.uMaxFogFactor;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <fog_pars_fragment>',
        '#include <fog_pars_fragment>\nuniform float uMaxFogFactor;'
      )
      .replace(
        '#include <fog_fragment>',
        `#ifdef USE_FOG
          #ifdef FOG_EXP2
            float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
          #else
            float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
          #endif
          fogFactor = min( fogFactor, uMaxFogFactor );
          gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
        #endif`
      );
  };
  // Materials that compile differently must not share a cached program.
  material.customProgramCacheKey = () => `farSilhouette:${maxFactor}`;
}

/**
 * CW-41: filter a texture for the CELL raster, not the pixel raster.
 *
 * The shimmer the owner reported is the window-bay pattern beating against
 * the character grid: the scene renders full-res, is box-halved once, and
 * the converter then reads one or two sample pixels per cell - so any
 * texture feature near cell frequency re-rolls its cells under sub-cell
 * view changes. MEASURED (P0): with the bay pattern blurred away, a 0.05
 * degree turn re-rolls 4.5% of Denver's lit cells instead of 12.4%; with
 * only sub-bay detail blurred, nothing changes; anisotropy changes
 * nothing; the exact-CPU path reads the same. The fix follows the numbers:
 * add a mip bias so the texture's effective texel is the CELL, which
 * dissolves bays exactly where they fall under about two cells and leaves
 * near facades sharp - the hardware LOD still carries the distance term.
 *
 * Composes with the material's existing onBeforeCompile (the fog floor).
 * The bias uniform lives in userData so the game can set it before or
 * after first compile, and per size change, without a rebuild.
 */
function applyCellRasterFiltering(material) {
  material.userData.cellLodBias = { value: 0 };
  const prev = material.onBeforeCompile;
  const prevKey = material.customProgramCacheKey;
  material.onBeforeCompile = (shader, renderer) => {
    prev?.call(material, shader, renderer);
    shader.uniforms.uCellLodBias = material.userData.cellLodBias;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <map_pars_fragment>',
        '#include <map_pars_fragment>\nuniform float uCellLodBias;'
      )
      .replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
          vec4 sampledDiffuseColor = texture2D( map, vMapUv, uCellLodBias );
          diffuseColor *= sampledDiffuseColor;
        #endif`
      );
  };
  material.customProgramCacheKey = () =>
    `${prevKey ? prevKey.call(material) : ''}|cellRaster`;
}

export function buildCityGroup(model) {
  const group = new Group();
  group.name = 'ascii-city';
  const disposables = [];

  // CW-25/CW-34: one window texture per archetype. Painted at runtime, so the
  // whole set of facade looks costs nothing in the bundle.
  const windowTextures = WINDOW_ARCHETYPES.map((_, i) =>
    createWindowTexture(i)
  );
  const storefrontTexture = createStorefrontTexture();
  // CW-51: which paving finish this city's own municipality specifies.
  const pavingTexture = createPavingTexture(
    CITY_PAVING[model.name] ?? DEFAULT_PAVING
  );
  const groundTexture = createGroundTexture();
  for (const t of [
    ...windowTextures,
    storefrontTexture,
    groundTexture,
    pavingTexture,
  ]) {
    if (t) disposables.push(t);
  }

  // Buildings — merged, vertex-tinted, window-textured meshes, dressed with
  // the CW-18 signs and rooftop masts. One mesh per archetype (CW-25/CW-34):
  // the texture is per-material, so a facade look means a mesh to carry it.
  const buildingGeoms = WINDOW_ARCHETYPES.map(() => []);
  const storefrontGeoms = [];
  const signOut = { plates: [], faces: [] };
  const roadIndex = makePointGrid(SIGN_ROAD_CELL_M);
  for (const road of model.roads) {
    for (const [x, y] of road.points) roadIndex.add(x, y);
  }
  const roadDistance = (x, y) => roadIndex.nearest(x, y);

  // CW-34: where the shops and cafes are, so a ground floor can be the kind
  // of thing that is actually on that corner.
  const poiIndex = makeKindGrid(STOREFRONT_POI_RANGE_M);
  for (const poi of model.pois ?? []) poiIndex.add(poi.x, poi.y, poi.kind);
  const antennaGeoms = [];
  const antennaCutoffM = antennaHeightCutoff(model.buildings);
  let signCount = 0;
  let antennaCount = 0;

  model.buildings.forEach((building, index) => {
    const h = hashBuilding(index, building.name);
    const tint = buildingTint(index, building.name);
    // CW-34: the mapped material narrows the choice of glazing; the hash
    // still makes it. Untagged buildings — which is most of them everywhere
    // except Denver — choose from all nine, so the city looks right with no
    // data at all.
    const materialBias = ARCHETYPES_BY_MATERIAL.get(
      building.tags?.['building:material']
    );
    const archetypeIndex = materialBias
      ? materialBias[h % materialBias.length]
      : h % WINDOW_ARCHETYPES.length;
    // CW-26: where the parts really are the mass (they cover the outline)
    // they REPLACE it - extruding the outline as well would bury them inside
    // a plain box, the very thing Simple 3D Buildings exists to avoid. Where
    // they merely sit on it, BOTH are drawn, or a turret mapped onto a plain
    // hall would delete the hall and leave the turret hanging. Collision is
    // untouched either way: it reads outlines and never parts.
    const volumes = building.partsAreMass
      ? building.parts
      : [building, ...(building.parts ?? [])];
    let anyGeom = false;
    for (const volume of volumes) {
      // A pitched roof CAPS its volume rather than sitting on top of it: the
      // body is shortened by exactly what the roof occupies, so the building
      // still finishes at its tagged height.
      const roof = roofGeometry(volume, tint);
      const body = roof
        ? { ...volume, heightM: volume.heightM - volume.roof.heightM }
        : volume;
      const geom = extrudeBuilding(body, tint);
      if (!geom && !roof) continue;
      // The same hash that fixes a building's colour fixes its facade, so a
      // tower keeps both for as long as the extract does.
      const bucket = buildingGeoms[archetypeIndex];
      if (geom) {
        // CW-34: slide this building's window pattern along the tile.
        //
        // Nine archetypes over hundreds of buildings means roughly fifty
        // towers share each texture, and without this they would share it
        // EXACTLY - the same lit windows in the same places, which is the
        // repetition this release exists to remove, only at a coarser grain.
        // ExtrudeGeometry lays UVs out in world metres, so shifting the
        // attribute by a hash-derived phase moves where the tile starts on
        // this building alone. It survives the merge because it is baked into
        // the vertex data rather than set on the material.
        // WHOLE BAYS, not a continuous slide. The texture's own v offset
        // exists so that window rows count up from a building's base
        // (`-1 / tileHM` in makeRepeatingTexture); a fractional shift would
        // put a half-height row of windows at every ground line. CW-46: the
        // bays are the ARCHETYPE'S OWN metre size now, so the phase moves
        // in those units - same law, per family.
        const bayW = WINDOW_ARCHETYPES[archetypeIndex]?.bayWM ?? WINDOW_BAY_W_M;
        const bayH = WINDOW_ARCHETYPES[archetypeIndex]?.bayHM ?? WINDOW_BAY_H_M;
        offsetGeometryUv(
          geom,
          ((h >>> 3) % WINDOW_TILE_BAYS_X) * bayW,
          ((h >>> 13) % WINDOW_TILE_BAYS_Y) * bayH
        );
        bucket.push(geom);
      }
      if (roof) bucket.push(roof);
      anyGeom = true;
    }
    if (!anyGeom) return;

    // Grounded buildings tall enough to have an upstairs get the lit
    // storefront strip; elevated parts (skybridges) do not. CW-46 rider:
    // the ground floor's HEIGHT is per building now (hash within the
    // documented 3.2-5.0 m range) - the directive's "same size first
    // floor" complaint. The texture band still spans one
    // STOREFRONT_HEIGHT_M in v, so the strip's v is scaled to fill its
    // band exactly before the whole-band offset picks which look it wears.
    const storefrontHM = 3.2 + (((h >>> 9) % 10) / 9) * 1.8;
    const grounded =
      building.minHeightM === 0 && building.heightM >= storefrontHM + 1.5;
    if (grounded) {
      // CW-34: which ground floor this building wears. The nearest shop or
      // eating place in the map data decides where there is one; the
      // building's own hash decides where there is not, so a city with no
      // POIs at all still has a varied street. CW-46: the same POI answer
      // now also warms or cools the glass.
      const [cx, cy] = ringCentroid(building.outer);
      // CW-53: a hotel is a WAY in every one of the four extracts, never a
      // node, so it can only be read off the building's own tags - the POI
      // index would never see one. Its own tag beats a neighbour's point.
      const poiKind =
        building.tags?.tourism === 'hotel'
          ? 'hotel'
          : normalizeStorefrontKind(
              poiIndex.nearestKind(cx, cy, STOREFRONT_POI_RANGE_M)
            );
      const poiBand = storefrontBandFor(poiKind);
      const strip = extrudeBuilding(
        building,
        storefrontTemperatureTint(h, poiKind),
        {
          depthOverride: storefrontHM,
        }
      );
      if (strip) {
        // THE SEED LAW (CW-34, held through CW-53): this is the SAME hash
        // draw it has always been; only the modulus widened with the set.
        const band = poiBand ?? (h >>> 23) % STOREFRONT_VARIANTS.length;
        scaleGeometryUv(strip, 1, STOREFRONT_HEIGHT_M / storefrontHM);
        offsetGeometryUv(strip, 0, band * STOREFRONT_HEIGHT_M);
        storefrontGeoms.push(strip);
      }
    }

    const wall = signWall(building.outer, roadDistance);
    const hueOf = (bits) => SIGN_HUES_DEG[bits % SIGN_HUES_DEG.length];

    // Shop signs over the glass: a row along the frontage, each one hashed in
    // or out so a street reads as some shops lit and some dark.
    const signBaseM = storefrontHM + 0.4;
    if (
      wall &&
      grounded &&
      building.heightM >= signBaseM + SIGN_BAND_HEIGHT_M + 0.5
    ) {
      const slots = Math.max(
        1,
        Math.min(
          SIGN_BAND_MAX_PER_WALL,
          Math.floor(wall.lengthM / SIGN_BAND_PITCH_M)
        )
      );
      const widthM = Math.min(
        SIGN_BAND_MAX_W_M,
        (wall.lengthM / slots) * SIGN_BAND_EDGE_SHARE
      );
      for (let slot = 0; slot < slots && widthM > SIGN_BAND_HEIGHT_M; slot++) {
        const bits = h >>> (slot * 5);
        if ((bits % 100) / 100 >= SIGN_BAND_SHARE) continue;
        appendSign(signOut, wall, {
          widthM,
          heightM: SIGN_BAND_HEIGHT_M,
          baseZ: signBaseM,
          hueDeg: hueOf(bits >>> 7),
          // Slot centers, measured from the middle of the wall.
          alongM: (wall.lengthM / slots) * (slot + 0.5 - slots / 2),
        });
        signCount++;
      }
    }

    // The rarer big billboard, high on a tower's flank.
    if (
      wall &&
      building.heightM >= SIGN_BILLBOARD_MIN_HEIGHT_M &&
      ((h >>> 17) % 100) / 100 < SIGN_BILLBOARD_SHARE
    ) {
      const widthM = Math.min(
        SIGN_BILLBOARD_MAX_W_M,
        wall.lengthM * SIGN_BILLBOARD_EDGE_SHARE
      );
      const frac =
        SIGN_BILLBOARD_MIN_FRAC +
        (((h >>> 21) % 64) / 64) *
          (SIGN_BILLBOARD_MAX_FRAC - SIGN_BILLBOARD_MIN_FRAC);
      const baseZ = Math.min(
        building.heightM * frac,
        building.heightM - SIGN_BILLBOARD_H_M - 1
      );
      if (widthM > SIGN_BILLBOARD_H_M && baseZ > building.minHeightM) {
        appendSign(signOut, wall, {
          widthM,
          heightM: SIGN_BILLBOARD_H_M,
          baseZ,
          hueDeg: hueOf(h >>> 23),
        });
        signCount++;
      }
    }

    if (building.heightM >= antennaCutoffM) {
      antennaCount += appendAntennas(
        antennaGeoms,
        building,
        h,
        tintOf(
          ANTENNA_TIER,
          TINT_HUES_DEG[(h >>> 3) % TINT_HUES_DEG.length],
          ANTENNA_CHROMA
        )
      );
    }
  });

  let buildingTriangles = 0;
  // One entry per family that actually got buildings; every mesh keeps the
  // name 'buildings', which is what the surface-class pass (CW-23) and the
  // map-view swap below both key on.
  const buildingMats = [];
  // CW-41: every material filtered for the cell raster, so one setter can
  // follow the character size.
  const cellRasterMats = [];
  buildingGeoms.forEach((geoms, familyIndex) => {
    if (geoms.length === 0) return;
    const merged = mergeGeometries(geoms, false);
    for (const geom of geoms) geom.dispose();
    const material = new MeshLambertMaterial({
      color: 0xffffff,
      map: windowTextures[familyIndex] ?? null,
      vertexColors: true,
    });
    applyFarSilhouetteFog(material);
    applyCellRasterFiltering(material);
    cellRasterMats.push(material);
    const mesh = new Mesh(merged, material);
    mesh.name = 'buildings';
    group.add(mesh);
    disposables.push(merged, material);
    buildingMats.push({ material, texture: windowTextures[familyIndex] });
    buildingTriangles += merged.getAttribute('position').count / 3;
  });

  let storefrontTriangles = 0;
  if (storefrontGeoms.length > 0) {
    const merged = mergeGeometries(storefrontGeoms, false);
    for (const geom of storefrontGeoms) geom.dispose();
    const material = new MeshLambertMaterial({
      color: 0xffffff,
      map: storefrontTexture ?? null,
      vertexColors: true,
      // Coplanar with the building wall behind it — pull it forward.
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    applyCellRasterFiltering(material);
    cellRasterMats.push(material);
    const mesh = new Mesh(merged, material);
    mesh.name = 'storefronts';
    group.add(mesh);
    disposables.push(merged, material);
    storefrontTriangles = merged.getAttribute('position').count / 3;
  }

  // Signs and masts: their own merged meshes so the whole facade pack can be
  // hidden overhead in one line each, the way the curbs already are.
  let dressingTriangles = 0;
  const dressingMeshes = [];
  const addDressing = (geoms, name) => {
    if (geoms.length === 0) return;
    const merged = mergeGeometries(geoms, false);
    for (const g of geoms) g.dispose();
    const material = new MeshLambertMaterial({
      color: 0xffffff,
      vertexColors: true,
    });
    const mesh = new Mesh(merged, material);
    mesh.name = name;
    group.add(mesh);
    dressingMeshes.push(mesh);
    disposables.push(merged, material);
    dressingTriangles += merged.index
      ? merged.index.count / 3
      : merged.getAttribute('position').count / 3;
  };
  addDressing(signOut.plates, 'sign-plates');
  addDressing(signOut.faces, 'sign-faces');
  addDressing(antennaGeoms, 'antennas');

  // Ground plane (PlaneGeometry lies in XY facing +Z — already our Z-up
  // floor). Black base + sparse dot texture = near-field dither only.
  const b = model.boundsM;
  const width = Math.max(b.maxX - b.minX, 1) + GROUND_MARGIN_M * 2;
  const height = Math.max(b.maxY - b.minY, 1) + GROUND_MARGIN_M * 2;
  const groundGeom = new PlaneGeometry(width, height);
  const groundMat = new MeshLambertMaterial({
    color: 0xffffff,
    map: groundTexture ?? null,
  });
  if (!groundTexture) groundMat.color.setHex(0x000000);
  // The ground dither is a texture like any other and beats against the cell
  // grid like any other; it had simply never been given the CW-41 filter.
  // Opted in UNCONDITIONALLY, the way the facades already are: the shader edit
  // does nothing without a map, and gating it on the texture would hide the
  // wiring from every test, which is exactly how D-111 shipped.
  applyCellRasterFiltering(groundMat);
  cellRasterMats.push(groundMat);
  const ground = new Mesh(groundGeom, groundMat);
  ground.name = 'ground';
  ground.position.set(
    (b.minX + b.maxX) / 2,
    (b.minY + b.maxY) / 2,
    GROUND_PLANE_Z
  );
  // Texture repeat is per-meter; the plane's UVs span 0..1, so scale them.
  if (groundTexture) {
    groundTexture.repeat.set(width / GROUND_TILE_M, height / GROUND_TILE_M);
  }
  group.add(ground);
  disposables.push(groundGeom, groundMat);

  // Roads — one merged ribbon mesh, dim at street level, bright overhead.
  // Segments entirely beyond the ground plane are dropped: Overpass returns
  // whole ways, and their far tails would otherwise float over the void.
  const cullBounds = {
    minX: b.minX - GROUND_MARGIN_M,
    minY: b.minY - GROUND_MARGIN_M,
    maxX: b.maxX + GROUND_MARGIN_M,
    maxY: b.maxY + GROUND_MARGIN_M,
  };
  const roadPositions = [];
  const roadColors = [];
  const curbPositions = [];
  const linePositions = [];
  let lineCursorM = 0;
  const sidewalkPositions = [];
  const sidewalkUvs = [];
  const sidewalkColors = [];
  for (const road of model.roads) {
    // CW-33: a separately-mapped pavement is drawn even though `footway` is
    // in the undrawn set. The set exists because a downtown carries footpaths
    // everywhere and, compressed by first-person perspective, they merge into
    // a solid glyph carpet that drowns the street grid. A footway=sidewalk
    // way is the narrow subset that runs along a kerb, and it gets its own
    // narrower ribbon, its own tone and its own glyph voice rather than
    // joining the roads - which is what keeps it from being that carpet.
    // Paths through parks stay undrawn.
    //
    // CW-Q64: a PEDESTRIANISED street joins the mapped pavements here. It is
    // pavement end to end, so it gets no roadway, no apron and no kerb - a
    // curb down the middle of one would be a road that is not there.
    if (isPavementWay(road)) {
      appendRoadRibbon(road, sidewalkPositions, cullBounds, {
        colors: sidewalkColors,
        uvs: sidewalkUvs,
        tint: surfaceTint(road.surface, DEFAULT_SIDEWALK_SURFACE),
        liftM: PAVEMENT_LIFT_M,
      });
      continue;
    }
    if (UNDRAWN_ROAD_KINDS.has(road.kind)) continue;
    // CW-50: the roadway drops a curb's height below the pavement.
    appendRoadRibbon(road, roadPositions, cullBounds, {
      colors: roadColors,
      tint: surfaceTint(road.surface, DEFAULT_ROAD_SURFACE),
      liftM: ROADWAY_LIFT_M,
    });
    // Every street gets a pavement, not only the few whose pavements
    // OpenStreetMap maps separately - that patchiness is what left the
    // roadway reading as a gap between two lines rather than as a road with
    // kerbs. This is the apron the walker's surface grid agrees with.
    const apronOffset = (road.widthM + PAVEMENT_WIDTH_M) / 2;
    for (const side of [apronOffset, -apronOffset]) {
      appendRoadRibbon(road, sidewalkPositions, cullBounds, {
        widthM: PAVEMENT_WIDTH_M,
        offsetM: side,
        colors: sidewalkColors,
        uvs: sidewalkUvs,
        tint: surfaceTint(road.surface, DEFAULT_SIDEWALK_SURFACE),
        liftM: PAVEMENT_LIFT_M,
      });
    }
    // CW-51: only the arterials are painted, and lanes= refines nothing here
    // because it is tagged on 18% of Seattle's ways and less elsewhere - the
    // class is the honest signal, and the record says the lines are derived
    // rather than mapped.
    if (ARTERIAL_LINE_KINDS.has(road.kind)) {
      lineCursorM = appendCenterLineDashes(
        road,
        linePositions,
        cullBounds,
        lineCursorM
      );
    }
    const edgeOffset = (road.widthM - CURB_WIDTH_M) / 2;
    for (const side of [edgeOffset, -edgeOffset]) {
      // The curb's own top, level with the pavement it edges.
      appendRoadRibbon(road, curbPositions, cullBounds, {
        widthM: CURB_WIDTH_M,
        offsetM: side,
        liftM: PAVEMENT_LIFT_M + 0.01,
      });
      // ...and its face, so the step down is a surface and not a gap to see
      // under from a low camera.
      appendCurbFace(road, curbPositions, cullBounds, {
        offsetM: side < 0 ? side - CURB_WIDTH_M / 2 : side + CURB_WIDTH_M / 2,
        loZ: ROADWAY_LIFT_M,
        hiZ: PAVEMENT_LIFT_M + 0.01,
      });
    }
  }

  const makeFlatMesh = (positions, material, name, colors, uvs) => {
    const geom = new BufferGeometry();
    geom.setAttribute(
      'position',
      new BufferAttribute(new Float32Array(positions), 3)
    );
    const normals = new Float32Array(positions.length);
    for (let i = 0; i < normals.length; i += 3) normals[i + 2] = 1;
    geom.setAttribute('normal', new BufferAttribute(normals, 3));
    if (colors && colors.length === positions.length) {
      geom.setAttribute(
        'color',
        new BufferAttribute(new Float32Array(colors), 3)
      );
    }
    if (uvs && uvs.length === (positions.length / 3) * 2) {
      geom.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
    }
    const mesh = new Mesh(geom, material);
    mesh.name = name;
    group.add(mesh);
    disposables.push(geom, material);
    return mesh;
  };

  let roadTriangles = 0;
  let roadMat = null;
  let curbMesh = null;
  let lineMesh = null;
  if (roadPositions.length > 0) {
    roadMat = new MeshLambertMaterial({
      color: ROAD_TONES.street,
      vertexColors: true,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    makeFlatMesh(roadPositions, roadMat, 'roads', roadColors);
    roadTriangles = roadPositions.length / 9;

    const curbMat = new MeshLambertMaterial({
      color: CURB_TONE,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    curbMesh = makeFlatMesh(curbPositions, curbMat, 'curbs');

    // CW-51: paint gets its own mesh so it can carry its own tone, but it
    // borrows the CURB voice in the class pass rather than minting an id -
    // the span table is exactly full (CW-43), and a curb is already the
    // thin-ribbon-that-dashes-and-sub-samples treatment paint wants.
    if (linePositions.length > 0) {
      const lineMat = new MeshLambertMaterial({
        color: LINE_TONE,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
      });
      lineMesh = makeFlatMesh(linePositions, lineMat, 'road-lines');
    }
  }

  // CW-33: pavements, as their own surface.
  let sidewalkMat = null;
  if (sidewalkPositions.length > 0) {
    sidewalkMat = new MeshLambertMaterial({
      color: SIDEWALK_TONES.street,
      vertexColors: true,
      map: pavingTexture ?? null,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });
    // CW-51: the paving rides the CW-41 cell-raster filter like every other
    // texture in the city. An unfiltered paving is exactly the beat pattern
    // against the cell grid that release was written to kill.
    //
    // D-111: and it has to JOIN THE LIST, or the shader carries a bias uniform
    // that nothing ever writes and the filtering is stock at every character
    // size. Measured at the Seattle spawn, glyph flips on pavement cells:
    // 0.28% undriven, 0.01% driven - and with the bias driven, deleting the
    // paving texture outright changes not one cell of the converted frame, so
    // the filter takes the whole of what the beat pattern had to give.
    applyCellRasterFiltering(sidewalkMat);
    cellRasterMats.push(sidewalkMat);
    makeFlatMesh(
      sidewalkPositions,
      sidewalkMat,
      'sidewalks',
      sidewalkColors,
      sidewalkUvs
    );
    roadTriangles += sidewalkPositions.length / 9;
  }

  // CW-33: greenspace, as flat polygons a hair above the ground plane. The
  // ring-to-shape path is the one extrudeBuilding already uses, so a park
  // with a concave edge comes out the shape it is mapped as.
  let greenMat = null;
  const greenGeoms = [];
  for (const green of model.greens ?? []) {
    const shape = new Shape();
    const ring = green.outer;
    if (!ring || ring.length < 3) continue;
    shape.moveTo(ring[0][0], ring[0][1]);
    for (let i = 1; i < ring.length; i++) shape.lineTo(ring[i][0], ring[i][1]);
    shape.closePath();
    const geom = new ShapeGeometry(shape);
    geom.translate(0, 0, ROAD_LIFT_M - 0.02);
    greenGeoms.push(geom);
  }
  if (greenGeoms.length > 0) {
    const merged = mergeGeometries(greenGeoms, false);
    for (const g of greenGeoms) g.dispose();
    greenMat = new MeshLambertMaterial({
      color: GREEN_TONES.street,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const greenMesh = new Mesh(merged, greenMat);
    greenMesh.name = 'greens';
    group.add(greenMesh);
    disposables.push(merged, greenMat);
    roadTriangles += merged.index
      ? merged.index.count / 3
      : merged.getAttribute('position').count / 3;
  }

  return {
    group,
    /**
     * Swap per-view scene treatment. Street view: black road surfaces,
     * streets drawn as curb lines, textured walls and dotted ground. Map
     * view: bright road surfaces (the street network), curbs, signs and masts
     * hidden, and
     * textures stripped — solid tinted roofs on clean black ground keep the
     * overhead blocks readable (roof caps share the wall texture's world
     * UVs, and its dark grout turned the round-1 map to fuzz).
     * @param {boolean} isMap
     */
    setMapView(isMap) {
      if (roadMat) {
        roadMat.color = new Color(isMap ? ROAD_TONES.map : ROAD_TONES.street);
      }
      // CW-33: pavements and greens brighten overhead with the roads, so the
      // map reads as a street network with parks in it rather than a grid
      // floating on black.
      if (sidewalkMat) {
        sidewalkMat.color = new Color(
          isMap ? SIDEWALK_TONES.map : SIDEWALK_TONES.street
        );
      }
      if (greenMat) {
        greenMat.color = new Color(
          isMap ? GREEN_TONES.map : GREEN_TONES.street
        );
      }
      if (curbMesh) curbMesh.visible = !isMap;
      // CW-51: paint is street-level detail; overhead the map wants the
      // network, not its markings.
      if (lineMesh) lineMesh.visible = !isMap;
      for (const mesh of dressingMeshes) mesh.visible = !isMap;
      for (const { material, texture } of buildingMats) {
        material.map = isMap ? null : (texture ?? null);
        material.needsUpdate = true;
      }
      groundMat.map = isMap ? null : (groundTexture ?? null);
      if (!groundTexture || isMap) groundMat.color.setHex(0x000000);
      else groundMat.color.setHex(0xffffff);
      groundMat.needsUpdate = true;
    },
    /**
     * CW-41: follow the character size. The bias makes the facade texture's
     * effective texel one CELL (log2 of the cell height, the axis the
     * window rows beat against); at 0 the filtering is exactly stock.
     * @param {number} cellHPx - cell height in canvas pixels
     */
    setCellRaster(cellHPx) {
      const bias = Math.max(0, Math.log2(Math.max(1, cellHPx)));
      for (const m of cellRasterMats) {
        if (m.userData.cellLodBias) m.userData.cellLodBias.value = bias;
      }
    },
    dispose() {
      for (const d of disposables) d.dispose();
      group.clear();
    },
    stats: {
      buildingTriangles,
      storefrontTriangles,
      roadTriangles,
      signCount,
      antennaCount,
      dressingTriangles,
    },
  };
}

// ---------------------------------------------------------------------------
// Street props: trees and parked cars (CW-16)
// ---------------------------------------------------------------------------

// Sizes are ordinary real-world meters; the ASCII sampler turns them into
// glyph clusters, so what matters is that a canopy clears the player's eyes
// and a car reads as a bright block at the curb.
//
// CW-46 (CW-Q46): six vehicle CLASSES, never likenesses - the owner asked
// for the average size and shape of what Americans actually drive, and we
// ship segment-typical exterior dimensions (length x width x height,
// metres) rounded from manufacturers' published spec sheets for each US
// segment's common models (full-size crew-cab pickup, three-row SUV,
// two-row crossover, mid-size sedan, compact hatch, minivan). The table is
// the owner-signed CW-Q46 data (plan section 2, 2026-08-23). `bodyM` is
// the beltline the greenhouse sits on; `weight` is the hash mix,
// US-street-plausible (pickups and SUVs common) - one line each to
// reverse.
export const CAR_CLASSES = [
  { kind: 'pickup', lenM: 5.8, widM: 2.0, hM: 1.9, bodyM: 1.05, weight: 22 },
  { kind: 'suv', lenM: 5.0, widM: 1.98, hM: 1.9, bodyM: 0.95, weight: 22 },
  {
    kind: 'crossover',
    lenM: 4.6,
    widM: 1.85,
    hM: 1.65,
    bodyM: 0.85,
    weight: 20,
  },
  { kind: 'sedan', lenM: 4.9, widM: 1.85, hM: 1.45, bodyM: 0.8, weight: 18 },
  { kind: 'hatch', lenM: 4.4, widM: 1.8, hM: 1.5, bodyM: 0.8, weight: 10 },
  { kind: 'minivan', lenM: 5.2, widM: 2.0, hM: 1.75, bodyM: 0.85, weight: 8 },
];
const CAR_CLASS_WEIGHT_TOTAL = CAR_CLASSES.reduce((s, c) => s + c.weight, 0);

/** Deterministic weighted class pick from a [0,1) draw (CW-46). */
export function pickCarClass(r) {
  let t = r * CAR_CLASS_WEIGHT_TOTAL;
  for (const cls of CAR_CLASSES) {
    t -= cls.weight;
    if (t < 0) return cls;
  }
  return CAR_CLASSES[CAR_CLASSES.length - 1];
}

// The longest class must fit a slot with air at both ends, and the spot
// grid must keep crossing-street neighbours' stamped footprints apart -
// 5.8 m pickups at the old 5 m centers would have overlapped by 0.8 m.
const CAR_SLOT_M = 6.5;
const CAR_OCCUPANCY_MIN = 0.4;
const CAR_OCCUPANCY_MAX = 0.6;
const CAR_MIN_GAP_M = 6;

/**
 * One vehicle of its class, as boxes pushed onto `list` (CW-46). Every
 * class shares the chassis box up to its beltline; the greenhouse differs,
 * and that IS the silhouette: a pickup is a tall cab over an OPEN bed
 * (rails and tailgate, no roof), an SUV/crossover a long tall cabin, a
 * minivan one box nearly end to end, a sedan the classic inset cabin, a
 * hatch a cabin reaching the tail. Boxes overlap by a hair - never
 * exactly-touching faces.
 */
function pushCarClassGeoms(list, cls, x, y, angle, bodyTint, cabinTint) {
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const nx = -uy;
  const ny = ux;
  const box = (len, wid, h, dAlong, dAcross, z, tint) =>
    list.push(
      makeBox(
        len,
        wid,
        h,
        x + ux * dAlong + nx * dAcross,
        y + uy * dAlong + ny * dAcross,
        z,
        angle,
        tint
      )
    );
  box(cls.lenM, cls.widM, cls.bodyM, 0, 0, cls.bodyM / 2, bodyTint);
  const ghH = cls.hM - cls.bodyM + 0.05;
  const ghZ = cls.bodyM - 0.05 + ghH / 2;
  const w = cls.widM - 0.2;
  if (cls.kind === 'pickup') {
    const cabL = cls.lenM * 0.4;
    box(cabL, w, ghH, cls.lenM / 2 - cabL / 2 - 0.12, 0, ghZ, cabinTint);
    const bedL = cls.lenM * 0.52;
    const bedAlong = -(cls.lenM / 2) + bedL / 2 + 0.06;
    const railH = 0.45;
    const railZ = cls.bodyM - 0.03 + railH / 2;
    for (const s of [-1, 1]) {
      box(
        bedL,
        0.1,
        railH,
        bedAlong,
        (cls.widM / 2 - 0.07) * s,
        railZ,
        bodyTint
      );
    }
    box(0.1, cls.widM - 0.1, railH, -(cls.lenM / 2) + 0.07, 0, railZ, bodyTint);
  } else if (cls.kind === 'suv' || cls.kind === 'crossover') {
    box(cls.lenM * 0.78, w, ghH, -cls.lenM * 0.04, 0, ghZ, cabinTint);
  } else if (cls.kind === 'minivan') {
    box(cls.lenM * 0.86, w, ghH, -cls.lenM * 0.02, 0, ghZ, cabinTint);
  } else if (cls.kind === 'hatch') {
    box(cls.lenM * 0.6, w, ghH, -cls.lenM * 0.17, 0, ghZ, cabinTint);
  } else {
    // Sedan: the classic inset cabin amidships.
    box(cls.lenM * 0.55, w, ghH, -cls.lenM * 0.04, 0, ghZ, cabinTint);
  }
}
// Cars park along ordinary streets. Motorways, trunks and primaries get none:
// nobody leaves a car on an arterial, and their ribbons carry the through
// traffic CW-19 will animate.
// Frozen traffic (CW-19). Cars standing ON the travel lanes, in faux
// movement: placed along the lane and turned to face the way they would be
// going. Nothing about them moves — the round's directive is that everything
// movement-capable ships time-frozen — and the seam that decides HOW MANY is
// trafficDensityFor(), so a future live source or a re-bake that keeps lane
// counts plugs in there rather than here.
//
// They do NOT block the player. That is a decision, recorded: a frozen car is
// scenery, and walling off a travel lane with invisible obstacles would make
// the street feel like a maze. Parked cars keep their collision, because they
// stand where a walker actually goes.
// Silhouette people (CW-19).
//
// The owner's recorded dislike of the reference is its people: two coloured
// blobs read as debris rather than as anyone. A figure through this converter
// is a SHAPE — a dark cutout against a lit shopfront, or a lit form against
// the dark street — so what it needs is an outline a person recognises, which
// two boxes cannot give. These are built from head, shoulders, torso, two
// arms and two legs: seven small boxes, cheap enough to merge with everything
// else and specific enough to read as a human at a few character cells.
//
// They are static, like the traffic. Placement is stamped into collision the
// way trees are, because a person standing on the pavement is furniture the
// player should walk around rather than through.
// CW-45 (CW-Q45): the figure GEOMETRY lives in city-figures.js now, with
// per-figure height/build from documented human ranges and jointed poses.
// These two stay as the obstacle footprint every figure stamps - a walker's
// personal space does not change with a few centimetres of stature.
const PERSON_SHOULDER_W_M = 0.46;
const PERSON_DEPTH_M = 0.24;
// The bright and dim tones the small companion geometry wears (the dog).
// Anything at a walker's side is BRIGHTER than the pavement and dimmer than a
// lit sign, so it reads in front of things rather than as part of them.
// Figure zones take scheme hues of their own; see plantFigure.
const PERSON_TINT = [0.82, 0.82, 0.82];
const PERSON_DARK_TINT = [0.5, 0.5, 0.5];
// One figure every so many metres of shopfront-facing pavement.
const PERSON_SPACING_M = 26;
const PERSON_MIN_GAP_M = 3;
const PERSON_CURB_OFFSET_M = 1.1;
const DOG_HEIGHT_M = 0.45;
const DOG_LENGTH_M = 0.6;
const DOG_WIDTH_M = 0.2;

/**
 * A dog on a lead beside its walker: a low body, four short legs and a head.
 */
function makeDogGeoms(x, y, facingRad) {
  const out = [];
  const bodyZ = DOG_HEIGHT_M * 0.62;
  out.push(
    makeBox(
      DOG_LENGTH_M,
      DOG_WIDTH_M,
      DOG_HEIGHT_M * 0.42,
      x,
      y,
      bodyZ,
      facingRad,
      PERSON_DARK_TINT
    )
  );
  const cos = Math.cos(facingRad);
  const sin = Math.sin(facingRad);
  out.push(
    makeBox(
      DOG_WIDTH_M,
      DOG_WIDTH_M,
      DOG_WIDTH_M,
      x + cos * DOG_LENGTH_M * 0.5,
      y + sin * DOG_LENGTH_M * 0.5,
      DOG_HEIGHT_M * 0.86,
      facingRad,
      PERSON_TINT
    )
  );
  for (const along of [0.34, -0.34]) {
    for (const across of [0.5, -0.5]) {
      out.push(
        makeBox(
          0.07,
          0.07,
          bodyZ,
          x + cos * DOG_LENGTH_M * along - sin * DOG_WIDTH_M * across,
          y + sin * DOG_LENGTH_M * along + cos * DOG_WIDTH_M * across,
          bodyZ / 2,
          facingRad,
          PERSON_DARK_TINT
        )
      );
    }
  }
  return out;
}

const TRAFFIC_LANE_INSET_M = 1.6;
const TRAFFIC_MIN_SPACING_M = 9;
const TRAFFIC_END_MARGIN_M = 6;

const CAR_ROAD_KINDS = new Set([
  'residential',
  'tertiary',
  'secondary',
  'unclassified',
  'living_street',
]);
// No car within this distance of a road vertex: OSM splits ways at junctions,
// so the segment ends ARE the intersections.
const JUNCTION_MARGIN_M = 5;

const TREE_ROAD_KINDS = new Set([
  'residential',
  'tertiary',
  'pedestrian',
  'living_street',
]);
const TREE_SPACING_M = 18;
const TREE_END_MARGIN_M = 3;
// Outside the curb line, on the sidewalk side.
const TREE_SIDEWALK_OFFSET_M = 1.2;
const TRUNK_SIDE_M = 0.3;
const TRUNK_HEIGHT_M = 2.5;
const CANOPY_RADIUS_M = 1.25;
// The crown starts above eye height (1.7 m) so the player walks under it.
const CANOPY_BASE_M = 2;
const MAPPED_TREE_MIN_GAP_M = 2.5;
const INFILL_TREE_MIN_GAP_M = 6;
const PROP_SPATIAL_CELL_M = 8;

// Props live in the walkable core, matching the collision grid's own margin —
// past that the roads are scenery and nobody can reach them anyway.
const PROP_MARGIN_M = 30;

// Trunks are dark and nearly neutral (a thin stem of sparse glyphs); canopies
// carry a strong green so the HC quantizer lands on the palette's green/lime
// rather than a neighboring hue.
const TRUNK_TINT = tintOf(0.28, 30, 0.2);
const CANOPY_TIERS = [0.55, 0.7];
const CANOPY_HUE_DEG = 120;
const CANOPY_CHROMA = 0.7;
// One tier below the building set, on the owner's call. The lit storefront
// strip and CW-18's sign panels own the top of the street-level band; cars
// read as accents underneath them rather than competing for the same
// brightness. Still four tiers, so a parked row stays varied.
const CAR_TIERS = [0.35, 0.5, 0.65, 0.8];
const CAR_CHROMA = 0.5;
const CAR_CABIN_LIFT = 0.12;

// Street furniture (CW-43, CW-Q43). True node positions only: the owner's
// mission sentence makes this wayfinding data for a blind traveler, and a
// prop moved for looks is a lie a cane cannot check. Sizes in metres.
const STOP_POLE_SIDE_M = 0.12;
const STOP_POLE_HEIGHT_M = 3.2;
const STOP_FLAG_W_M = 0.6;
const STOP_FLAG_H_M = 0.4;
const STOP_SHELTER_L_M = 2.4;
const STOP_SHELTER_D_M = 1.2;
const STOP_SHELTER_H_M = 2.2;
const BENCH_SEAT_L_M = 1.8;
const BENCH_SEAT_D_M = 0.5;
const BENCH_SEAT_H_M = 0.45;
const BENCH_BACK_H_M = 0.45;
const BENCH_BACK_THICK_M = 0.08;
const BASKET_SIDE_M = 0.45;
const BASKET_HEIGHT_M = 0.6;
const RACK_L_M = 0.9;
const RACK_THICK_M = 0.08;
const RACK_HEIGHT_M = 0.8;
const HYDRANT_SIDE_M = 0.3;
const HYDRANT_HEIGHT_M = 0.6;
// Two OSM nodes for the same object (it happens) collapse to one prop.
const FURNITURE_MIN_GAP_M = 0.4;
// A mapped tree standing on the node wins - both are real data, the tree
// planted first.
const FURNITURE_TREE_GAP_M = 0.6;
// Procedural infill (trees, lamps, parked cars) must not intersect a real
// object: real data wins every argument with infill.
const FURNITURE_CLEAR_M = 1.4;
// Muted municipal paint next to the cars' 0.5.
const FURNITURE_CHROMA = 0.4;
// The segment-angle grid's cell: coarse is fine, furniture stands within a
// pavement's width of its street.
const FURNITURE_ROAD_CELL_M = 24;

// Streetlights (CW-18). Ordinary streets and the arterials both get them -
// the arterials carry no parked cars and no trees today, so lamps are the
// only furniture they have. Motorways and trunk roads are left alone: their
// ribbons are the through-traffic CW-19 will animate.
const LAMP_ROAD_KINDS = new Set([
  'primary',
  'secondary',
  'tertiary',
  'residential',
  'unclassified',
  'living_street',
]);
const LAMP_SPACING_M = 30;
const LAMP_END_MARGIN_M = 4;
// Just outside the curb ribbon, on the sidewalk, inside the tree line.
const LAMP_CURB_OFFSET_M = 0.45;
const LAMP_MIN_TREE_GAP_M = 1.6;
// Two ways sharing a corridor must not stack lamps on the same spot.
const LAMP_MIN_LAMP_GAP_M = 4;
const POLE_SIDE_M = 0.15;
const POLE_HEIGHT_M = 6;
const LAMP_HEAD_LENGTH_M = 0.8;
const LAMP_HEAD_WIDTH_M = 0.3;
const LAMP_HEAD_THICK_M = 0.15;
const LAMP_HEAD_Z_M = 5.8;
// The head hangs over the roadway, the way a cantilever arm does.
const LAMP_HEAD_REACH_M = 0.5;
// A mid-grey metal stem, and a head at the very top of the street-level band.
// The stem started at tier 0.3 and had to come up: measured against the night
// sky a dark pole is invisible, so the bright head read as a box floating with
// nothing under it - proved by hiding the two lamp meshes and watching the box
// go. It is neutral on purpose too, so the high-contrast quantizer files a
// steel post with the curbs and the pavement instead of tinting it cyan.
// ---------------------------------------------------------------------------
// Traffic lights (CW-19)
// ---------------------------------------------------------------------------
// A signal is a pole with THREE stacked heads, of which exactly one is lit —
// the reference's look, and the shape a player reads as a traffic light even
// at a few character cells. The world is time-frozen by the round's standing
// directive, and these are the one exception the owner signed: a light that
// never changes is not a traffic light.
//
// The lit head is a flat, unlit colour rather than a shaded surface, because a
// signal EMITS. The dark heads are a dim grey rather than black: only exact
// black reads as an empty cell, and a head that vanishes leaves the lit one
// floating with nothing under it — the same failure the lamp posts hit in
// CW-18 and were fixed for.
const LIGHT_POLE_SIDE_M = 0.14;
const LIGHT_POLE_HEIGHT_M = 4.2;
const LIGHT_HEAD_SIZE_M = 0.34;
const LIGHT_HEAD_DEPTH_M = 0.22;
const LIGHT_HEAD_PITCH_M = 0.42;
const LIGHT_HEAD_BASE_Z_M = 3.0;
// Clear of the curb ribbon and of anything the street furniture already holds.
const LIGHT_CURB_OFFSET_M = 1.2;
const LIGHT_MIN_GAP_M = 6;
const LIGHT_TINTS = {
  red: [1, 0.13, 0.1],
  amber: [1, 0.62, 0.05],
  green: [0.13, 1, 0.28],
  dark: [0.17, 0.17, 0.17],
};
// Two phase groups, so the cross street is red while this one is green.
const LIGHT_PHASE_COUNT = 2;
// >= 2 s per state keeps this a state SWAP and nowhere near WCAG 2.3.1's
// flash threshold. Green is the long one, amber the brief one, and a phase
// spends the rest of the cycle red while the other phase runs.
const LIGHT_GREEN_MS = 5000;
const LIGHT_AMBER_MS = 2000;
const LIGHT_CYCLE_MS = (LIGHT_GREEN_MS + LIGHT_AMBER_MS) * LIGHT_PHASE_COUNT;

/**
 * Which head is lit for a phase group at a moment in the cycle.
 *
 * @param {number} elapsedMs
 * @param {number} phase - 0..LIGHT_PHASE_COUNT-1
 * @returns {'red'|'amber'|'green'}
 */
export function trafficLightState(elapsedMs, phase) {
  const cycle =
    ((elapsedMs % LIGHT_CYCLE_MS) + LIGHT_CYCLE_MS) % LIGHT_CYCLE_MS;
  const slot = (LIGHT_GREEN_MS + LIGHT_AMBER_MS) * phase;
  const since =
    (((cycle - slot) % LIGHT_CYCLE_MS) + LIGHT_CYCLE_MS) % LIGHT_CYCLE_MS;
  if (since < LIGHT_GREEN_MS) return 'green';
  if (since < LIGHT_GREEN_MS + LIGHT_AMBER_MS) return 'amber';
  return 'red';
}

const POLE_TINT = [0.45, 0.45, 0.45];
const LAMP_HEAD_TINT = [0.97, 0.97, 0.97];

/**
 * Small spatial hash for "is anything already standing here?". Query
 * distances must not exceed the cell size, which is why the cell is bigger
 * than every gap below.
 *
 * @param {number} cellM
 */
/** How far a shop may be from a building and still decide its ground floor. */
const STOREFRONT_POI_RANGE_M = 35;

/**
 * A point grid that remembers what each point IS, not just where (CW-34).
 *
 * makePointGrid below answers "how far to the nearest road"; this answers
 * "what is the nearest shop, and what kind". Same bucketing, one extra field,
 * kept separate rather than complicating the distance-only grid that four
 * other features already depend on.
 */
function makeKindGrid(cellM) {
  const buckets = new Map();
  const key = (cx, cy) => cx + ',' + cy;
  return {
    add(x, y, kind) {
      const k = key(Math.floor(x / cellM), Math.floor(y / cellM));
      let bucket = buckets.get(k);
      if (!bucket) buckets.set(k, (bucket = []));
      bucket.push({ x, y, kind });
    },
    /**
     * The kind of the nearest point within `rangeM`, or null. Searches the
     * cell the query falls in and its eight neighbours, which is exact as
     * long as rangeM does not exceed the cell size.
     */
    nearestKind(x, y, rangeM) {
      const cx = Math.floor(x / cellM);
      const cy = Math.floor(y / cellM);
      let best = null;
      let bestD = rangeM * rangeM;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const bucket = buckets.get(key(cx + dx, cy + dy));
          if (!bucket) continue;
          for (const p of bucket) {
            const d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
            if (d < bestD) {
              bestD = d;
              best = p.kind;
            }
          }
        }
      }
      return best;
    },
  };
}

function makePointGrid(cellM) {
  const buckets = new Map();
  let count = 0;
  const key = (cx, cy) => cx + ',' + cy;
  return {
    get size() {
      return count;
    },
    add(x, y) {
      const k = key(Math.floor(x / cellM), Math.floor(y / cellM));
      const list = buckets.get(k);
      if (list) list.push(x, y);
      else buckets.set(k, [x, y]);
      count++;
    },
    /** @returns {boolean} whether any stored point is within distM */
    occupied(x, y, distM) {
      const cx = Math.floor(x / cellM);
      const cy = Math.floor(y / cellM);
      const d2 = distM * distM;
      for (let gy = cy - 1; gy <= cy + 1; gy++) {
        for (let gx = cx - 1; gx <= cx + 1; gx++) {
          const list = buckets.get(key(gx, gy));
          if (!list) continue;
          for (let i = 0; i < list.length; i += 2) {
            const dx = list[i] - x;
            const dy = list[i + 1] - y;
            if (dx * dx + dy * dy < d2) return true;
          }
        }
      }
      return false;
    },
    /**
     * Distance to the nearest stored point, or Infinity past one cell.
     * @returns {number}
     */
    nearest(x, y) {
      const cx = Math.floor(x / cellM);
      const cy = Math.floor(y / cellM);
      let best = Infinity;
      for (let gy = cy - 1; gy <= cy + 1; gy++) {
        for (let gx = cx - 1; gx <= cx + 1; gx++) {
          const list = buckets.get(key(gx, gy));
          if (!list) continue;
          for (let i = 0; i < list.length; i += 2) {
            const d = Math.hypot(list[i] - x, list[i + 1] - y);
            if (d < best) best = d;
          }
        }
      }
      return best;
    },
  };
}

/**
 * A tinted box placed in the world: built in its own frame, rotated about Z,
 * then moved into place, so it merges with its neighbors into one mesh.
 */
/**
 * CW-43: street furniture faces the street it serves. A coarse bucket grid
 * of sampled road points answers "which way does the nearest road run, and
 * where is it" without scanning every segment per item. Hash jitter is only
 * for the rare node with no road in reach — OSM gives bus stops and benches
 * no orientation of their own.
 */
function makeSegmentAngleGrid(roads, cellM) {
  const buckets = new Map();
  const key = (cx, cy) => cx + ',' + cy;
  for (const road of roads) {
    const pts = road.points;
    for (let i = 0; i + 1 < pts.length; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[i + 1];
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.hypot(dx, dy);
      if (len < 1e-6) continue;
      const angle = Math.atan2(dy, dx);
      // Long segments register at intervals so no cell between the
      // endpoints goes blind.
      const steps = Math.max(1, Math.ceil(len / cellM));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const px = x1 + dx * t;
        const py = y1 + dy * t;
        const k = key(Math.floor(px / cellM), Math.floor(py / cellM));
        const list = buckets.get(k);
        if (list) list.push(px, py, angle);
        else buckets.set(k, [px, py, angle]);
      }
    }
  }
  return {
    /** @returns {{angle:number, px:number, py:number}|null} nearest sampled road point within ~2 cells */
    nearest(x, y) {
      const cx = Math.floor(x / cellM);
      const cy = Math.floor(y / cellM);
      let best = null;
      let bestD2 = Infinity;
      for (let gy = cy - 2; gy <= cy + 2; gy++) {
        for (let gx = cx - 2; gx <= cx + 2; gx++) {
          const list = buckets.get(key(gx, gy));
          if (!list) continue;
          for (let i = 0; i < list.length; i += 3) {
            const dx = list[i] - x;
            const dy = list[i + 1] - y;
            const d2 = dx * dx + dy * dy;
            if (d2 < bestD2) {
              bestD2 = d2;
              best = { angle: list[i + 2], px: list[i], py: list[i + 1] };
            }
          }
        }
      }
      return best;
    },
  };
}

function makeBox(sizeX, sizeY, sizeZ, x, y, z, rotationRad, tint) {
  const geom = new BoxGeometry(sizeX, sizeY, sizeZ);
  if (rotationRad) geom.rotateZ(rotationRad);
  geom.translate(x, y, z);
  paintGeometry(geom, tint);
  return geom;
}

/**
 * Furnish the streets with trees and parked cars (CW-16) and streetlights
 * (CW-18).
 *
 * Trees are the ones OpenStreetMap actually records first, then a
 * deterministic infill along ordinary curbs so a city with thin tree data
 * still looks planted. Cars park in hashed runs with gaps along the curb.
 * Lamps march down every ordinary street and arterial, alternating sides.
 * Nothing here moves — ambient traffic is a later release.
 *
 * The collision grid is an INPUT: props must not land inside a building, so
 * the grid has to exist before they are placed. The trunk and car footprints
 * it should gain come back as `obstacles` for the caller to stamp.
 *
 * @param {ReturnType<import('./city-data.js').parseCityExtract>} model
 * @param {{isBlocked: (x:number, y:number) => boolean}} [collision]
 * @returns {{
 *   group: Group,
 *   obstacles: Array<{x:number, y:number, halfLengthM:number, halfWidthM:number, rotationRad:number}>,
 *   setMapView: (isMap: boolean) => void,
 *   dispose: () => void,
 *   stats: {treeCount:number, mappedTreeCount:number, carCount:number, lampCount:number, triangles:number}
 * }}
 */
export function buildStreetProps(model, collision = null) {
  const group = new Group();
  group.name = 'street-props';
  const disposables = [];
  const obstacles = [];

  const trunkGeoms = [];
  const canopyGeoms = [];
  const carGeoms = [];
  const trafficGeoms = [];
  let trafficCount = 0;
  const personGeoms = [];
  let personCount = 0;
  let sitterCount = 0;
  const personSpots = makePointGrid(PROP_SPATIAL_CELL_M);
  const figureSpots = [];
  const figuresByPose = {};
  // CW-45 (CW-Q45): plant one whole person - their own height and build
  // drawn from the documented ranges, jointed pose, and tones from the SAME
  // palette machinery the cars wear. Every zone of a figure takes a hue from
  // the city's colour scheme (CW-49): torso, legs, and head and shoulders
  // each pick their own, so a street of people carries the scheme's whole
  // range rather than one repeated tone.
  const FIGURE_CHROMA = 0.5;
  // A head is the thinnest part of a figure - thinner than the legs, whose
  // floor is 0.45 - so its tone sits at the top of the luminance band, where
  // the filter still resolves it at the smallest character sizes.
  //
  // The value is the tone heads already wore, exactly. tintOf holds luminance
  // AT the tier and moves only chroma, so matching it means the monochrome
  // schemes - which have only luminance to read - render bit-identically to
  // before, while the colour schemes gain the hue. Measured both ways: at
  // 0.80 the mono frames moved by up to 0.74% of their pixels, because a two
  // percent luminance shift is enough to flip a cell's glyph; at 0.82 they do
  // not move at all.
  const HEAD_TIER = 0.82;
  const plantFigure = (x, y, facing, spec, rng) => {
    const torsoHue =
      TINT_HUES_DEG[
        Math.floor(rng() * TINT_HUES_DEG.length) % TINT_HUES_DEG.length
      ];
    const legHue =
      TINT_HUES_DEG[
        Math.floor(rng() * TINT_HUES_DEG.length) % TINT_HUES_DEG.length
      ];
    // The proof gate caught the first tier draw: a 0.35 torso over 0.3
    // legs vanished against black pavement - a floating half-person.
    // Figures are thin, so their clothing stays in the upper luminance
    // band (the R4 figure wore 0.82/0.5 greys and read).
    const FIGURE_TIERS = [0.5, 0.65, 0.8];
    const torsoTier =
      FIGURE_TIERS[
        Math.floor(rng() * FIGURE_TIERS.length) % FIGURE_TIERS.length
      ];
    const legTier = Math.max(0.45, torsoTier - 0.15);
    // The head hue comes from the figure's own spot, NOT from another draw on
    // rng: that stream runs the length of a road and is shared by every
    // figure on it, so one extra draw here would shift the pose and build of
    // every figure planted after this one. The spot hash adds the variety
    // without touching the order (the CW-45/46 seed law).
    const headHue = TINT_HUES_DEG[hashSpot(x, y) % TINT_HUES_DEG.length];
    const zones = makeFigureGeoms(x, y, facing, spec);
    const torsoTint = tintOf(torsoTier, torsoHue, FIGURE_CHROMA);
    const legTint = tintOf(legTier, legHue, FIGURE_CHROMA);
    // Gamut-limited so the tone's luminance really is HEAD_TIER for every
    // hue, not just the ones that happen not to clip. Torso and legs sit
    // lower in the band where clipping is rare and are left exactly as they
    // were; it is the head, at the top of the band, that needs it.
    const headTint = tintOf(
      HEAD_TIER,
      headHue,
      inGamutChroma(HEAD_TIER, headHue, FIGURE_CHROMA)
    );
    for (const g of zones.torso) paintGeometry(g, torsoTint);
    for (const g of zones.legs) paintGeometry(g, legTint);
    for (const g of zones.figure) paintGeometry(g, headTint);
    personGeoms.push(...zones.legs, ...zones.torso, ...zones.figure);
    personCount++;
    figuresByPose[spec.pose] = (figuresByPose[spec.pose] ?? 0) + 1;
    figureSpots.push({ x, y, pose: spec.pose, facing });
  };
  const poleGeoms = [];
  const lampHeadGeoms = [];
  // CW-43 street furniture, one merged mesh per class.
  const stopPoleGeoms = [];
  const shelterGeoms = [];
  const benchGeoms = [];
  const basketGeoms = [];
  const rackGeoms = [];
  const hydrantGeoms = [];

  const b = model.boundsM;
  const inCore = (x, y) =>
    x >= b.minX - PROP_MARGIN_M &&
    x <= b.maxX + PROP_MARGIN_M &&
    y >= b.minY - PROP_MARGIN_M &&
    y <= b.maxY + PROP_MARGIN_M;
  const isBlocked = (x, y) => (collision ? collision.isBlocked(x, y) : false);

  const treeSpots = makePointGrid(PROP_SPATIAL_CELL_M);
  const carSpots = makePointGrid(PROP_SPATIAL_CELL_M);
  const lampSpots = makePointGrid(PROP_SPATIAL_CELL_M);
  let mappedTreeCount = 0;

  const plantTree = (x, y, seed) => {
    const tier = CANOPY_TIERS[seed % CANOPY_TIERS.length];
    trunkGeoms.push(
      makeBox(
        TRUNK_SIDE_M,
        TRUNK_SIDE_M,
        TRUNK_HEIGHT_M,
        x,
        y,
        TRUNK_HEIGHT_M / 2,
        0,
        TRUNK_TINT
      )
    );
    // A faceted crown, not a smooth ball: the flat facets give the sampler
    // the luminance steps it needs to read as leaves rather than a blob.
    const canopy = new IcosahedronGeometry(CANOPY_RADIUS_M, 0);
    canopy.translate(x, y, CANOPY_BASE_M + CANOPY_RADIUS_M);
    paintGeometry(canopy, tintOf(tier, CANOPY_HUE_DEG, CANOPY_CHROMA));
    canopyGeoms.push(canopy);

    treeSpots.add(x, y);
    obstacles.push({
      x,
      y,
      halfLengthM: TRUNK_SIDE_M / 2,
      halfWidthM: TRUNK_SIDE_M / 2,
      rotationRad: 0,
    });
  };

  // 1. The trees the map records. Real data wins every argument with the
  //    infill below, so these are placed first and only skipped where a
  //    building stands on them (or a duplicate node repeats one).
  model.trees.forEach(([x, y], index) => {
    if (!inCore(x, y) || isBlocked(x, y)) return;
    if (treeSpots.occupied(x, y, MAPPED_TREE_MIN_GAP_M)) return;
    plantTree(x, y, hashBuilding(index, 'osm-tree'));
    mappedTreeCount++;
  });

  // 1b. CW-43 street furniture, at the extract's own node positions — the
  //     accessibility point IS the fidelity, so nothing here invents a
  //     placement. Each prop faces its street; each is solid (a cane's
  //     logic must hold against a real pole). Placed before the infill so
  //     procedural trees, lamps and parked cars keep clear of real objects.
  const furnitureSpots = makePointGrid(PROP_SPATIAL_CELL_M);
  const segmentAngles = makeSegmentAngleGrid(
    model.roads,
    FURNITURE_ROAD_CELL_M
  );
  const furniturePlaced = {};
  // CW-45: where the benches actually STAND, for the sitters - position,
  // seat axis, which way a seated person faces (toward the road), and
  // whether there is a back.
  const placedBenches = [];
  (model.furniture ?? []).forEach((item, index) => {
    const { x, y } = item;
    if (!inCore(x, y) || isBlocked(x, y)) return;
    if (furnitureSpots.occupied(x, y, FURNITURE_MIN_GAP_M)) return;
    if (treeSpots.occupied(x, y, FURNITURE_TREE_GAP_M)) return;
    const seed = hashBuilding(index, 'furniture:' + item.kind);
    const near = segmentAngles.nearest(x, y);
    const angle = near ? near.angle : ((seed % 360) * Math.PI) / 180;
    // Away from the road: where a shelter stands relative to its flag, and
    // which side a bench's back is on. Falls back to the angle's normal
    // when the node sits exactly on the road line.
    let awayX = near ? x - near.px : 0;
    let awayY = near ? y - near.py : 0;
    const awayLen = Math.hypot(awayX, awayY);
    if (awayLen > 0.3) {
      awayX /= awayLen;
      awayY /= awayLen;
    } else {
      const side = seed % 2 === 0 ? 1 : -1;
      awayX = -Math.sin(angle) * side;
      awayY = Math.cos(angle) * side;
    }
    const tier = CAR_TIERS[seed % CAR_TIERS.length];
    const hue = TINT_HUES_DEG[(seed >>> 5) % TINT_HUES_DEG.length];
    const tint = tintOf(tier, hue, FURNITURE_CHROMA);

    if (item.kind === 'bus_stop') {
      stopPoleGeoms.push(
        makeBox(
          STOP_POLE_SIDE_M,
          STOP_POLE_SIDE_M,
          STOP_POLE_HEIGHT_M,
          x,
          y,
          STOP_POLE_HEIGHT_M / 2,
          angle,
          POLE_TINT
        )
      );
      // The flag plate at the top, its face toward the roadway.
      stopPoleGeoms.push(
        makeBox(
          STOP_FLAG_W_M,
          0.06,
          STOP_FLAG_H_M,
          x,
          y,
          STOP_POLE_HEIGHT_M - STOP_FLAG_H_M / 2,
          angle,
          tintOf(0.8, hue, FURNITURE_CHROMA)
        )
      );
      obstacles.push({
        x,
        y,
        halfLengthM: STOP_POLE_SIDE_M / 2,
        halfWidthM: STOP_POLE_SIDE_M / 2,
        rotationRad: angle,
      });
      if (item.shelter) {
        const sx = x + awayX * (STOP_SHELTER_D_M / 2 + 0.4);
        const sy = y + awayY * (STOP_SHELTER_D_M / 2 + 0.4);
        if (!isBlocked(sx, sy)) {
          shelterGeoms.push(
            makeBox(
              STOP_SHELTER_L_M,
              STOP_SHELTER_D_M,
              STOP_SHELTER_H_M,
              sx,
              sy,
              STOP_SHELTER_H_M / 2,
              angle,
              tintOf(0.45, hue, FURNITURE_CHROMA)
            )
          );
          obstacles.push({
            x: sx,
            y: sy,
            halfLengthM: STOP_SHELTER_L_M / 2,
            halfWidthM: STOP_SHELTER_D_M / 2,
            rotationRad: angle,
          });
        }
      }
    } else if (item.kind === 'bench') {
      placedBenches.push({
        x,
        y,
        angle,
        facing: Math.atan2(-awayY, -awayX),
        backrest: Boolean(item.backrest),
      });
      benchGeoms.push(
        makeBox(
          BENCH_SEAT_L_M,
          BENCH_SEAT_D_M,
          BENCH_SEAT_H_M,
          x,
          y,
          BENCH_SEAT_H_M / 2,
          angle,
          tint
        )
      );
      if (item.backrest) {
        // The back stands on the seat's away-from-road edge, overlapping
        // the seat by a hair so the boxes never share an exact face.
        const bx = x + awayX * (BENCH_SEAT_D_M / 2 - BENCH_BACK_THICK_M / 2);
        const by = y + awayY * (BENCH_SEAT_D_M / 2 - BENCH_BACK_THICK_M / 2);
        benchGeoms.push(
          makeBox(
            BENCH_SEAT_L_M,
            BENCH_BACK_THICK_M,
            BENCH_BACK_H_M + 0.01,
            bx,
            by,
            BENCH_SEAT_H_M + BENCH_BACK_H_M / 2 - 0.01,
            angle,
            tint
          )
        );
      }
      obstacles.push({
        x,
        y,
        halfLengthM: BENCH_SEAT_L_M / 2,
        halfWidthM: BENCH_SEAT_D_M / 2,
        rotationRad: angle,
      });
    } else if (item.kind === 'waste_basket') {
      basketGeoms.push(
        makeBox(
          BASKET_SIDE_M,
          BASKET_SIDE_M,
          BASKET_HEIGHT_M,
          x,
          y,
          BASKET_HEIGHT_M / 2,
          angle,
          tint
        )
      );
      obstacles.push({
        x,
        y,
        halfLengthM: BASKET_SIDE_M / 2,
        halfWidthM: BASKET_SIDE_M / 2,
        rotationRad: angle,
      });
    } else if (item.kind === 'bicycle_parking') {
      // A staple rack stands with its hoop across the kerb line.
      rackGeoms.push(
        makeBox(
          RACK_L_M,
          RACK_THICK_M,
          RACK_HEIGHT_M,
          x,
          y,
          RACK_HEIGHT_M / 2,
          angle + Math.PI / 2,
          tint
        )
      );
      obstacles.push({
        x,
        y,
        halfLengthM: RACK_L_M / 2,
        halfWidthM: RACK_THICK_M / 2,
        rotationRad: angle + Math.PI / 2,
      });
    } else if (item.kind === 'fire_hydrant') {
      hydrantGeoms.push(
        makeBox(
          HYDRANT_SIDE_M,
          HYDRANT_SIDE_M,
          HYDRANT_HEIGHT_M,
          x,
          y,
          HYDRANT_HEIGHT_M / 2,
          0,
          tint
        )
      );
      obstacles.push({
        x,
        y,
        halfLengthM: HYDRANT_SIDE_M / 2,
        halfWidthM: HYDRANT_SIDE_M / 2,
        rotationRad: 0,
      });
    } else {
      return;
    }

    furnitureSpots.add(x, y);
    furniturePlaced[item.kind] = (furniturePlaced[item.kind] ?? 0) + 1;
  });

  // 1c. CW-45 sitting figures, ONLY where a real bench stands - never a
  //     scattered seat: a city with two mapped benches gets at most two
  //     sitters, which is the data's own answer. At most one seated figure
  //     per bench, hash-decided; the sitter faces the way the bench does
  //     (toward the road) and takes a seat position along it. The chance is
  //     one line to reverse.
  const BENCH_SITTER_CHANCE = 0.4;
  placedBenches.forEach((bench, index) => {
    const rng = makeLcg(hashBuilding(index, 'bench-sitter'));
    if (rng() >= BENCH_SITTER_CHANCE) return;
    const along = (rng() * 2 - 1) * (BENCH_SEAT_L_M / 2 - 0.35);
    const sx = bench.x + Math.cos(bench.angle) * along;
    const sy = bench.y + Math.sin(bench.angle) * along;
    const spec = makeFigureSpec(rng, 'sitting', { seatZ: BENCH_SEAT_H_M });
    plantFigure(sx, sy, bench.facing, spec, rng);
    sitterCount++;
    // The bench already stamps collision; the sitter just keeps standing
    // figures from crowding the seat.
    personSpots.add(sx, sy);
  });

  // 2. Procedural infill along ordinary curbs, and the parked cars. Both
  //    walk the road segments; each road carries its own deterministic
  //    number stream so a city lays out identically on every machine.
  model.roads.forEach((road, roadIndex) => {
    const treeRng = TREE_ROAD_KINDS.has(road.kind)
      ? makeLcg(hashBuilding(roadIndex, road.kind + ':trees'))
      : null;
    const carRng = CAR_ROAD_KINDS.has(road.kind)
      ? makeLcg(hashBuilding(roadIndex, road.kind + ':cars'))
      : null;
    const lampRng = LAMP_ROAD_KINDS.has(road.kind)
      ? makeLcg(hashBuilding(roadIndex, road.kind + ':lamps'))
      : null;
    const trafficDensity = trafficDensityFor(road);
    const trafficRng =
      trafficDensity > 0
        ? makeLcg(hashBuilding(roadIndex, road.kind + ':traffic'))
        : null;
    // Cars per kilometre becomes metres between cars, floored so a busy
    // arterial does not end up bumper to bumper.
    const trafficSpacingM = Math.max(
      TRAFFIC_MIN_SPACING_M,
      trafficDensity > 0 ? 1000 / trafficDensity : Infinity
    );
    const peopleRng = LAMP_ROAD_KINDS.has(road.kind)
      ? makeLcg(hashBuilding(roadIndex, road.kind + ':people'))
      : null;
    if (!treeRng && !carRng && !lampRng && !trafficRng && !peopleRng) return;

    const occupancy =
      CAR_OCCUPANCY_MIN +
      (carRng ? carRng() : 0) * (CAR_OCCUPANCY_MAX - CAR_OCCUPANCY_MIN);
    const treeOffset = road.widthM / 2 + TREE_SIDEWALK_OFFSET_M;
    // Inside the curb line, one car-half clear of it.
    const carOffset = road.widthM / 2 - CURB_WIDTH_M - 1;
    const lampOffset = road.widthM / 2 + LAMP_CURB_OFFSET_M;
    // Lamps run down the whole way, alternating sides, so the cursor and the
    // side carry ACROSS segments: OSM splits a street into many short
    // segments, and restarting the spacing at each vertex would stand a lamp
    // at every bend.
    let peopleCursor = peopleRng ? peopleRng() * PERSON_SPACING_M : 0;
    const trafficCursor = trafficRng
      ? [
          TRAFFIC_END_MARGIN_M + trafficRng() * trafficSpacingM,
          TRAFFIC_END_MARGIN_M + trafficRng() * trafficSpacingM,
        ]
      : [0, 0];
    let lampCursor = lampRng
      ? LAMP_END_MARGIN_M + lampRng() * LAMP_SPACING_M
      : 0;
    let lampSide = lampRng && lampRng() < 0.5 ? -1 : 1;

    for (let i = 0; i < road.points.length - 1; i++) {
      const [x1, y1] = road.points[i];
      const [x2, y2] = road.points[i + 1];
      if (!inCore(x1, y1) && !inCore(x2, y2)) continue;
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.hypot(dx, dy);
      if (len < 1e-6) continue;
      const ux = dx / len;
      const uy = dy / len;
      // Left normal, mirrored for the other side of the street.
      const nx = -uy;
      const ny = ux;
      const angle = Math.atan2(dy, dx);

      if (peopleRng) {
        // People stand on the pavement, on the shopfront side, facing the
        // street or along it — where a person waiting or walking would be.
        let cursor = peopleCursor;
        while (cursor <= len) {
          const along = cursor;
          cursor += PERSON_SPACING_M * (0.5 + peopleRng() * 1.1);
          const walkSide = peopleRng() < 0.5 ? -1 : 1;
          const offset = road.widthM / 2 + PERSON_CURB_OFFSET_M;
          const px = x1 + ux * along + nx * offset * walkSide;
          const py = y1 + uy * along + ny * offset * walkSide;
          if (!inCore(px, py)) continue;
          if (isBlocked(px, py)) continue;
          if (treeSpots.occupied(px, py, PERSON_MIN_GAP_M)) continue;
          if (lampSpots.occupied(px, py, PERSON_MIN_GAP_M)) continue;
          if (personSpots.occupied(px, py, PERSON_MIN_GAP_M)) continue;

          const roll = peopleRng();
          // Along the pavement, or turned a quarter to face the shopfronts.
          const facing =
            angle +
            (roll < 0.25 ? Math.PI / 2 : 0) +
            (walkSide < 0 ? Math.PI : 0);
          // CW-45 pose mix (one line each to reverse): the standers keep
          // the R4 quarter; about three movers in twenty jog.
          const pose =
            roll < 0.25
              ? 'standing'
              : peopleRng() < 0.15
                ? 'jogging'
                : 'walking';
          const spec = makeFigureSpec(peopleRng, pose);
          plantFigure(px, py, facing, spec, peopleRng);
          // Roughly one WALKER in six has a dog a pace ahead - paces, not
          // joggers.
          if (pose === 'walking' && peopleRng() < 0.17) {
            const dx2 = px + Math.cos(facing) * 0.85;
            const dy2 = py + Math.sin(facing) * 0.85;
            if (inCore(dx2, dy2) && !isBlocked(dx2, dy2)) {
              personGeoms.push(...makeDogGeoms(dx2, dy2, facing));
            }
          }
          personSpots.add(px, py);
          obstacles.push({
            x: px,
            y: py,
            halfLengthM: PERSON_DEPTH_M / 2,
            halfWidthM: PERSON_SHOULDER_W_M / 2,
            rotationRad: facing,
          });
        }
        peopleCursor = Math.max(0, cursor - len);
      }

      if (trafficRng) {
        // Both directions: one lane each side of the centreline, each facing
        // the way that lane runs.
        for (const dir of [1, -1]) {
          let cursor = trafficCursor[dir > 0 ? 0 : 1];
          while (cursor <= len) {
            const along = cursor;
            cursor += trafficSpacingM * (0.7 + trafficRng() * 0.6);
            const lane = road.widthM / 2 - TRAFFIC_LANE_INSET_M;
            if (lane <= 0.5) break;
            const x = x1 + ux * along + nx * lane * dir;
            const y = y1 + uy * along + ny * lane * dir;
            if (!inCore(x, y)) continue;
            if (isBlocked(x, y)) continue;
            if (carSpots.occupied(x, y, CAR_MIN_GAP_M)) continue;
            const seed = Math.floor(trafficRng() * 0xffff);
            const tier = CAR_TIERS[seed % CAR_TIERS.length];
            const hue = TINT_HUES_DEG[(seed >>> 5) % TINT_HUES_DEG.length];
            const heading = dir > 0 ? angle : angle + Math.PI;
            const bodyTint = tintOf(tier, hue, CAR_CHROMA);
            const cabinTint = tintOf(
              Math.min(1, tier + CAR_CABIN_LIFT),
              hue,
              CAR_CHROMA
            );
            // CW-46: the class comes from the SAME seed, so adding classes
            // reshuffled nothing else on the street.
            const cls = pickCarClass(((seed >>> 3) % 1000) / 1000);
            pushCarClassGeoms(
              trafficGeoms,
              cls,
              x,
              y,
              heading,
              bodyTint,
              cabinTint
            );
            trafficCount++;
          }
          trafficCursor[dir > 0 ? 0 : 1] = Math.max(0, cursor - len);
        }
      }

      if (lampRng) {
        while (lampCursor <= len) {
          const along = lampCursor;
          lampCursor += LAMP_SPACING_M;
          const x = x1 + ux * along + nx * lampOffset * lampSide;
          const y = y1 + uy * along + ny * lampOffset * lampSide;
          const side = lampSide;
          lampSide = -lampSide;
          if (!inCore(x, y)) continue;
          if (isBlocked(x, y)) continue;
          if (treeSpots.occupied(x, y, LAMP_MIN_TREE_GAP_M)) continue;
          if (lampSpots.occupied(x, y, LAMP_MIN_LAMP_GAP_M)) continue;
          if (furnitureSpots.occupied(x, y, FURNITURE_CLEAR_M)) continue;

          poleGeoms.push(
            makeBox(
              POLE_SIDE_M,
              POLE_SIDE_M,
              POLE_HEIGHT_M,
              x,
              y,
              POLE_HEIGHT_M / 2,
              0,
              POLE_TINT
            )
          );
          // The head reaches back over the roadway from its pole.
          lampHeadGeoms.push(
            makeBox(
              LAMP_HEAD_LENGTH_M,
              LAMP_HEAD_WIDTH_M,
              LAMP_HEAD_THICK_M,
              x - nx * LAMP_HEAD_REACH_M * side,
              y - ny * LAMP_HEAD_REACH_M * side,
              LAMP_HEAD_Z_M,
              angle,
              LAMP_HEAD_TINT
            )
          );
          lampSpots.add(x, y);
          obstacles.push({
            x,
            y,
            halfLengthM: POLE_SIDE_M / 2,
            halfWidthM: POLE_SIDE_M / 2,
            rotationRad: 0,
          });
        }
        lampCursor -= len;
      }

      for (const side of [1, -1]) {
        if (treeRng) {
          const ox = nx * treeOffset * side;
          const oy = ny * treeOffset * side;
          const phase = treeRng() * TREE_SPACING_M;
          for (
            let s = TREE_END_MARGIN_M + phase;
            s <= len - TREE_END_MARGIN_M;
            s += TREE_SPACING_M
          ) {
            const jitter = (treeRng() - 0.5) * 2;
            const along = Math.min(
              Math.max(s + jitter, TREE_END_MARGIN_M),
              Math.max(len - TREE_END_MARGIN_M, TREE_END_MARGIN_M)
            );
            const x = x1 + ux * along + ox;
            const y = y1 + uy * along + oy;
            if (!inCore(x, y)) continue;
            if (treeSpots.occupied(x, y, INFILL_TREE_MIN_GAP_M)) continue;
            if (furnitureSpots.occupied(x, y, FURNITURE_CLEAR_M)) continue;
            const h = TRUNK_SIDE_M / 2;
            if (
              isBlocked(x, y) ||
              isBlocked(x + h, y + h) ||
              isBlocked(x - h, y - h) ||
              isBlocked(x + h, y - h) ||
              isBlocked(x - h, y + h)
            ) {
              continue;
            }
            plantTree(
              x,
              y,
              hashBuilding(roadIndex * 131 + i, 'infill:' + side)
            );
          }
        }

        if (carRng && carOffset >= 0.8) {
          const ox = nx * carOffset * side;
          const oy = ny * carOffset * side;
          const maxHalfLen = CAR_CLASSES[0].lenM / 2;
          for (
            let s = JUNCTION_MARGIN_M + maxHalfLen;
            s + maxHalfLen <= len - JUNCTION_MARGIN_M;
            s += CAR_SLOT_M
          ) {
            const seed = hashBuilding(
              roadIndex * 977 + i,
              'car:' + side + ':' + Math.round(s)
            );
            if (carRng() >= occupancy) continue;
            const x = x1 + ux * s + ox;
            const y = y1 + uy * s + oy;
            if (!inCore(x, y)) continue;
            if (carSpots.occupied(x, y, CAR_MIN_GAP_M)) continue;
            if (furnitureSpots.occupied(x, y, FURNITURE_CLEAR_M)) continue;
            // CW-46: the class comes from the same seed that always picked
            // tier and hue, so classes reshuffled nothing else.
            const cls = pickCarClass(((seed >>> 3) % 1000) / 1000);
            // The whole CLASS footprint has to be clear, not just the
            // middle - a pickup asks for more curb than a hatch.
            const hl = cls.lenM / 2;
            const hw = cls.widM / 2;
            let clear = !isBlocked(x, y);
            for (const corner of [
              [hl, hw],
              [hl, -hw],
              [-hl, hw],
              [-hl, -hw],
            ]) {
              if (!clear) break;
              clear = !isBlocked(
                x + ux * corner[0] + nx * corner[1],
                y + uy * corner[0] + ny * corner[1]
              );
            }
            if (!clear) continue;

            const tier = CAR_TIERS[seed % CAR_TIERS.length];
            const hue = TINT_HUES_DEG[(seed >>> 5) % TINT_HUES_DEG.length];
            const bodyTint = tintOf(tier, hue, CAR_CHROMA);
            const cabinTint = tintOf(
              Math.min(1, tier + CAR_CABIN_LIFT),
              hue,
              CAR_CHROMA
            );
            pushCarClassGeoms(carGeoms, cls, x, y, angle, bodyTint, cabinTint);

            carSpots.add(x, y);
            obstacles.push({
              x,
              y,
              halfLengthM: hl,
              halfWidthM: hw,
              rotationRad: angle,
            });
          }
        }
      }
    }
  });

  let triangles = 0;
  const addMerged = (geoms, name, material) => {
    if (geoms.length === 0) {
      material.dispose();
      return;
    }
    const merged = mergeGeometries(geoms, false);
    for (const g of geoms) g.dispose();
    const mesh = new Mesh(merged, material);
    mesh.name = name;
    group.add(mesh);
    disposables.push(merged, material);
    triangles += merged.index
      ? merged.index.count / 3
      : merged.getAttribute('position').count / 3;
  };

  const propMaterial = () =>
    new MeshLambertMaterial({ color: 0xffffff, vertexColors: true });
  addMerged(trunkGeoms, 'tree-trunks', propMaterial());
  addMerged(canopyGeoms, 'tree-canopies', propMaterial());
  addMerged(carGeoms, 'cars', propMaterial());
  addMerged(trafficGeoms, 'traffic-cars', propMaterial());
  addMerged(personGeoms, 'people', propMaterial());
  addMerged(poleGeoms, 'lamp-poles', propMaterial());
  addMerged(lampHeadGeoms, 'lamp-heads', propMaterial());
  // CW-43 street furniture, one mesh per class so the class pass can dress
  // each in its own voice.
  addMerged(stopPoleGeoms, 'bus-stop-poles', propMaterial());
  addMerged(shelterGeoms, 'bus-stop-shelters', propMaterial());
  addMerged(benchGeoms, 'benches', propMaterial());
  addMerged(basketGeoms, 'waste-baskets', propMaterial());
  addMerged(rackGeoms, 'bike-racks', propMaterial());
  addMerged(hydrantGeoms, 'hydrants', propMaterial());

  // Traffic lights (CW-19). Placed on the road GRAPH rather than on the road
  // list: a signal belongs where streets actually meet, and OSM splits ways at
  // junctions, so the graph's nodes of degree 3 or more already are those
  // corners.
  const lightSpots = makePointGrid(PROP_SPATIAL_CELL_M);
  const lightPoleGeoms = [];
  // One geometry list per phase group and head position, because a head has
  // to be able to light up on its own.
  const lightHeadGeoms = [];
  for (let phase = 0; phase < LIGHT_PHASE_COUNT; phase++) {
    lightHeadGeoms.push({ red: [], amber: [], green: [] });
  }

  const graph = buildRoadGraph(model.roads);
  for (const nodeIndex of graph.intersections) {
    const node = graph.nodes[nodeIndex];
    // The signal stands on a corner, not in the carriageway. Offset along the
    // first chain's direction, turned ninety degrees, on a side fixed by the
    // node index so a rebuild puts it back in the same place.
    const chain = graph.chains[node.chains[0]];
    const pts = chain.points;
    const near = pts[0];
    const far = pts[pts.length - 1];
    let dx = far[0] - near[0];
    let dy = far[1] - near[1];
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const side = nodeIndex % 2 === 0 ? 1 : -1;
    const reach = chain.widthM / 2 + LIGHT_CURB_OFFSET_M;
    const x = node.x + -dy * reach * side + dx * reach * side;
    const y = node.y + dx * reach * side + dy * reach * side;

    if (!inCore(x, y)) continue;
    if (isBlocked(x, y)) continue;
    if (treeSpots.occupied(x, y, LAMP_MIN_TREE_GAP_M)) continue;
    if (lampSpots.occupied(x, y, LAMP_MIN_LAMP_GAP_M)) continue;
    if (lightSpots.occupied(x, y, LIGHT_MIN_GAP_M)) continue;

    lightPoleGeoms.push(
      makeBox(
        LIGHT_POLE_SIDE_M,
        LIGHT_POLE_SIDE_M,
        LIGHT_POLE_HEIGHT_M,
        x,
        y,
        LIGHT_POLE_HEIGHT_M / 2,
        0,
        POLE_TINT
      )
    );

    // Red on top, then amber, then green — the order every signal uses, and
    // the one a player reads without being told.
    const phase = nodeIndex % LIGHT_PHASE_COUNT;
    const facing = Math.atan2(dy, dx);
    const stack = ['red', 'amber', 'green'];
    stack.forEach((slot, i) => {
      lightHeadGeoms[phase][slot].push(
        makeBox(
          LIGHT_HEAD_DEPTH_M,
          LIGHT_HEAD_SIZE_M,
          LIGHT_HEAD_SIZE_M,
          x,
          y,
          LIGHT_HEAD_BASE_Z_M + (stack.length - 1 - i) * LIGHT_HEAD_PITCH_M,
          facing,
          LIGHT_TINTS.dark
        )
      );
    });

    lightSpots.add(x, y);
    obstacles.push({
      x,
      y,
      halfLengthM: LIGHT_POLE_SIDE_M / 2,
      halfWidthM: LIGHT_POLE_SIDE_M / 2,
      rotationRad: 0,
    });
  }

  // A material per head so a state change is a colour write, not a rebuild.
  const lightMaterials = [];
  addMerged(lightPoleGeoms, 'light-poles', propMaterial());
  for (let phase = 0; phase < LIGHT_PHASE_COUNT; phase++) {
    const slots = {};
    for (const slot of ['red', 'amber', 'green']) {
      const geoms = lightHeadGeoms[phase][slot];
      if (geoms.length === 0) continue;
      const material = new MeshBasicMaterial({
        color: new Color(...LIGHT_TINTS.dark),
      });
      const merged = mergeGeometries(geoms, false);
      for (const g of geoms) g.dispose();
      const mesh = new Mesh(merged, material);
      mesh.name = 'light-heads';
      group.add(mesh);
      disposables.push(merged, material);
      slots[slot] = material;
    }
    if (Object.keys(slots).length > 0) lightMaterials.push(slots);
  }

  let litFor = null;
  const paintLights = (state) => {
    lightMaterials.forEach((slots, phase) => {
      const lit = state === null ? null : trafficLightState(state, phase);
      for (const slot of ['red', 'amber', 'green']) {
        const material = slots[slot];
        if (!material) continue;
        const tint = lit === slot ? LIGHT_TINTS[slot] : LIGHT_TINTS.dark;
        material.color.setRGB(tint[0], tint[1], tint[2]);
      }
    });
  };
  // Light them once at build. Reduced motion simply never calls update, and
  // a stopped cycle has to look like a real signal rather than a dead one —
  // with no initial paint every head sits at its dark tint and a player who
  // asked for reduced motion gets a city of broken traffic lights.
  paintLights(0);
  litFor = lightMaterials
    .map((_, phase) => trafficLightState(0, phase))
    .join('|');

  const trafficLights = {
    /**
     * Advance the signals. Returns true ONLY when a head actually changed,
     * which is what keeps this off the per-frame path: the converter is asked
     * to re-run once per state change — about once every two seconds and only
     * while lights are in view — rather than every frame.
     *
     * @param {number} elapsedMs
     * @returns {boolean} whether anything on screen changed
     */
    update(elapsedMs) {
      if (lightMaterials.length === 0) return false;
      const key = lightMaterials
        .map((_, phase) => trafficLightState(elapsedMs, phase))
        .join('|');
      if (key === litFor) return false;
      litFor = key;
      paintLights(elapsedMs);
      return true;
    },
    /** How many signals the city got — for the release record and the tests. */
    count: lightPoleGeoms.length,
  };

  return {
    group,
    trafficLights,
    /** Frozen cars standing on the travel lanes (CW-19). */
    frozenTrafficCount: trafficCount,
    /** Static silhouette figures on the pavements (CW-19, varied CW-45). */
    peopleCount: personCount,
    /** CW-45: where each figure stands and its pose - deterministic per
     * city; the proof-gate driver and the e2e counts read this. */
    figureSpots,
    obstacles,
    /**
     * The map view is a clean street network seen from a kilometer up:
     * street furniture there is overhead fuzz, exactly like the curb lines
     * and the wall textures that already hide.
     * @param {boolean} isMap
     */
    setMapView(isMap) {
      group.visible = !isMap;
    },
    dispose() {
      for (const d of disposables) d.dispose();
      group.clear();
    },
    stats: {
      treeCount: treeSpots.size,
      mappedTreeCount,
      carCount: carSpots.size,
      lampCount: lampSpots.size,
      // CW-43: what actually stands in the city, per class — the model's
      // own counts minus anything out of core or inside a building.
      furnitureCount: furnitureSpots.size,
      furnitureByKind: furniturePlaced,
      // CW-45: pose census and how many benches hold a sitter.
      figuresByPose,
      sitterCount,
      triangles,
    },
  };
}

/**
 * Landmark beacons for the map view (CW-10): one slim pillar per landmark,
 * dim by default, the selected one bright white. MeshBasicMaterial ignores
 * lighting, so beacons read the same at every ambient level.
 *
 * @param {Array<{name: string, x: number, y: number}>} landmarks
 * @returns {{group: import('three').Group, setSelected: (index: number|null) => void, dispose: () => void}}
 */
export function buildLandmarkBeacons(landmarks) {
  const group = new Group();
  group.name = 'landmark-beacons';

  const geom = new BoxGeometry(7, 7, 90);
  const dimMat = new MeshBasicMaterial({ color: 0x777777 });
  const brightMat = new MeshBasicMaterial({ color: 0xffffff });

  const meshes = landmarks.map((lm) => {
    const mesh = new Mesh(geom, dimMat);
    mesh.position.set(lm.x, lm.y, 0);
    group.add(mesh);
    return mesh;
  });

  return {
    group,
    setSelected(index) {
      meshes.forEach((mesh, i) => {
        mesh.material = i === index ? brightMat : dimMat;
      });
    },
    dispose() {
      geom.dispose();
      dimMat.dispose();
      brightMat.dispose();
      group.clear();
    },
  };
}

// ---------------------------------------------------------------------------
// Rain (CW-20)
// ---------------------------------------------------------------------------
// Slivers of geometry falling inside a box that travels with the player, dim
// enough that the converter turns them into sparse streak characters rather
// than a wall of ink. Nothing about this is drawn in the DOM or bolted onto
// the converter: it is scene geometry going through the same pipeline as the
// city, which is what makes it look like it belongs there.
//
// A pool, not a spawner. The drops are created once and recycled: a drop that
// falls out of the bottom of the box is lifted back to the top with a new
// horizontal position, so the count never changes and nothing is allocated
// per frame.
const RAIN_BOX_M = 34;
const RAIN_TOP_M = 22;
const RAIN_DROP_LEN_M = 0.72;
const RAIN_DROP_THICK_M = 0.035;
// Light and heavy (CW-Q18). Heavy is not simply "more": the drops also fall
// faster and lean further, because rain that only gets denser reads as fog.
const RAIN_LEVELS = [
  { name: 'light', drops: 150, speedMS: 15, leanMS: 1.4, tint: 0.34 },
  { name: 'heavy', drops: 420, speedMS: 24, leanMS: 3.2, tint: 0.46 },
];

/**
 * A pool of falling drops that follows the player.
 *
 * @param {number} [maxDrops] - pool size; the level decides how many are
 *   actually visible, so switching intensity never rebuilds geometry
 * @returns {{
 *   group: Group,
 *   setLevel: (index: number|null) => void,
 *   update: (dtS: number, x: number, y: number) => void,
 *   dispose: () => void
 * }}
 */
export function buildRain(
  maxDrops = RAIN_LEVELS[RAIN_LEVELS.length - 1].drops
) {
  const group = new Group();
  group.name = 'rain';
  group.visible = false;

  const geom = new BoxGeometry(
    RAIN_DROP_THICK_M,
    RAIN_DROP_THICK_M,
    RAIN_DROP_LEN_M
  );
  const material = new MeshBasicMaterial({ color: 0x555555 });
  const drops = [];
  const rand = makeLcg(0x5a1d0b0b);

  for (let i = 0; i < maxDrops; i++) {
    const mesh = new Mesh(geom, material);
    mesh.position.set(
      (rand() - 0.5) * RAIN_BOX_M,
      (rand() - 0.5) * RAIN_BOX_M,
      rand() * RAIN_TOP_M
    );
    mesh.visible = false;
    group.add(mesh);
    drops.push(mesh);
  }

  let level = null;
  let centreX = 0;
  let centreY = 0;

  return {
    group,

    /**
     * @param {number|null} index - RAIN_LEVELS index, or null for no rain
     */
    setLevel(index) {
      level = Number.isInteger(index) ? (RAIN_LEVELS[index] ?? null) : null;
      group.visible = level !== null;
      const shown = level ? level.drops : 0;
      for (let i = 0; i < drops.length; i++) drops[i].visible = i < shown;
      if (level) material.color.setScalar(level.tint);
    },

    /**
     * Fall, and keep the box centred on the player. Re-centring MOVES the
     * drops with the box rather than leaving them behind, so walking never
     * outruns the weather.
     */
    update(dtS, x, y) {
      if (!level) return;
      const dx = x - centreX;
      const dy = y - centreY;
      centreX = x;
      centreY = y;
      group.position.set(x, y, 0);

      const fall = level.speedMS * dtS;
      const lean = level.leanMS * dtS;
      const half = RAIN_BOX_M / 2;
      const shown = level.drops;
      for (let i = 0; i < shown; i++) {
        const p = drops[i].position;
        p.z -= fall;
        p.x += lean;
        // The box moved under the drops; keep them where they were in world
        // terms so the rain does not slide sideways when the player walks.
        p.x -= dx;
        p.y -= dy;
        if (p.z < 0 || p.x > half || p.x < -half || p.y > half || p.y < -half) {
          p.x = (rand() - 0.5) * RAIN_BOX_M;
          p.y = (rand() - 0.5) * RAIN_BOX_M;
          p.z = RAIN_TOP_M * (0.6 + rand() * 0.4);
        }
      }
    },

    dispose() {
      group.clear();
      geom.dispose();
      material.dispose();
    },
  };
}

/** How many rain levels there are, for callers cycling through them. */
export const RAIN_LEVEL_COUNT = RAIN_LEVELS.length;
/** Level names, for the announcements the owner reviews. */
export const RAIN_LEVEL_NAMES = RAIN_LEVELS.map((l) => l.name);

/**
 * Attach the game's lighting: a dim ambient fill plus a headlight parented
 * to the camera (the same view-space arrangement the model preview uses, so
 * walls facing the player read brightest in the ASCII conversion).
 *
 * @param {import('three').Scene} scene
 * @param {import('three').Camera} camera
 * @returns {{detach: () => void, setMapBoost: (isMap: boolean) => void}}
 */
export function attachCityLighting(scene, camera) {
  // Street 0.55; map 1.3 — the overhead view has no headlight on the roofs,
  // so the boost makes blocks render as dense glyph masses. Multiplicative
  // (not emissive) so per-building tints keep their hue for the HC palette
  // quantizer.
  const AMBIENT_STREET = 0.55;
  const AMBIENT_MAP = 1.3;
  const ambient = new AmbientLight(0xffffff, AMBIENT_STREET);
  scene.add(ambient);

  // Distance fade to black: building faces dim with depth (near walls
  // dense glyphs, far skyline sparse) and the far field falls to empty —
  // the reference aesthetic's "distant objects fade into the dark".
  // Disabled for the orthographic map view by the controller.
  const fog = new Fog(0x000000, 40, 260);
  const prevFog = scene.fog;
  scene.fog = fog;

  // Camera must be in the scene graph for its child light to render.
  scene.add(camera);
  const headlight = new DirectionalLight(0xffffff, 2.2);
  headlight.position.set(0, 0, 0);
  headlight.target.position.set(0, 0, -1); // straight down the view axis
  camera.add(headlight);
  camera.add(headlight.target);

  // CW-20: the fog can drift between clear and murky nights, and a rare
  // thunder swell can lift the ambient light. Both are AMBIENT MOTION and
  // both are driven by the controller, which owns the reduced-motion state —
  // nothing here starts moving on its own.
  //
  // The drift moves the fog FAR plane, not the near one, and it never
  // reaches the buildings’ silhouette floor from CW-24: a murky night pulls
  // the skyline closer, it does not delete it, because the floor is applied
  // after the fog factor and survives any density.
  const FOG_FAR_CLEAR = 260;
  const FOG_FAR_MURKY = 150;
  // Minutes-scale, deliberately. This is weather, and it also puts the
  // change rate orders of magnitude below anything WCAG 2.3.1 concerns
  // itself with: a full clear-to-murky sweep takes about three minutes.
  const FOG_DRIFT_PERIOD_MS = 360000;
  // A swell, not a flash: it rises and falls over about a third of a second
  // and lifts the ambient by well under half again. Thunder in this city is
  // mood lighting, and the amplitude is chosen so that even at its peak the
  // frame-to-frame change is a gentle ramp rather than a transition.
  const THUNDER_PEAK = 0.22;
  const THUNDER_MS = 320;
  let ambientBase = AMBIENT_STREET;

  // Where phase 0 of the drift sits on the caller's clock. The drift used to
  // be read straight off that clock, which meant the fog was wherever the
  // session happened to have reached whenever it was asked - so the first
  // frame of a shower jumped to a thickness nothing had walked into (D-74).
  let fogDriftAnchorMs = 0;

  const applyFogDensity = (t) => {
    const k = Math.max(0, Math.min(1, Number(t) || 0));
    fog.far = FOG_FAR_CLEAR + (FOG_FAR_MURKY - FOG_FAR_CLEAR) * k;
  };

  return {
    setMapBoost(isMap) {
      ambientBase = isMap ? AMBIENT_MAP : AMBIENT_STREET;
      ambient.intensity = ambientBase;
    },

    /**
     * Slide the fog between a clear night and a murky one (CW-Q18).
     *
     * @param {number} t - 0 clear, 1 murky
     */
    setFogDensity(t) {
      applyFogDensity(t);
    },

    /**
     * Start or resume the drift so its first driven frame reproduces the fog
     * that is on screen right now, rather than snapping to wherever a
     * free-running clock had got to (D-74).
     *
     * @param {number} nowMs - the caller's clock, the same one stepFogDrift
     *   will be given
     */
    beginFogDrift(nowMs) {
      const span = FOG_FAR_CLEAR - FOG_FAR_MURKY;
      const density = Math.max(
        0,
        Math.min(1, (FOG_FAR_CLEAR - fog.far) / span)
      );
      // density(p) = (1 - cos(2*pi*p)) / 2, so p = acos(1 - 2*density) / 2*pi.
      // acos returns the RISING branch, which is the one to resume on: fog
      // that is already thickening carries on thickening.
      const phase = Math.acos(1 - 2 * density) / (Math.PI * 2);
      fogDriftAnchorMs = Number(nowMs) - phase * FOG_DRIFT_PERIOD_MS;
    },

    /**
     * One frame of drift, measured from the anchor beginFogDrift set.
     *
     * @param {number} nowMs - the caller's clock
     */
    stepFogDrift(nowMs) {
      let phase =
        (((Number(nowMs) - fogDriftAnchorMs) % FOG_DRIFT_PERIOD_MS) /
          FOG_DRIFT_PERIOD_MS) %
        1;
      if (phase < 0) phase += 1;
      applyFogDensity((1 - Math.cos(phase * Math.PI * 2)) / 2);
    },

    /** Where the fog sits now, so the release record can state it. */
    getFogFar() {
      return fog.far;
    },

    /**
     * A thunder swell: 0 at rest, 1 at the peak of the flash.
     *
     * @param {number} amount - 0..1
     */
    setThunder(amount) {
      const a = Math.max(0, Math.min(1, Number(amount) || 0));
      ambient.intensity = ambientBase * (1 + THUNDER_PEAK * a);
    },

    /** The drift period and swell length, for the record and the tests. */
    weatherTiming: {
      fogDriftPeriodMs: FOG_DRIFT_PERIOD_MS,
      thunderMs: THUNDER_MS,
      fogFarClear: FOG_FAR_CLEAR,
      fogFarMurky: FOG_FAR_MURKY,
      thunderPeak: THUNDER_PEAK,
    },
    detach() {
      camera.remove(headlight);
      camera.remove(headlight.target);
      scene.remove(ambient);
      scene.remove(camera);
      scene.fog = prevFog ?? null;
      ambient.dispose();
      headlight.dispose();
    },
  };
}
