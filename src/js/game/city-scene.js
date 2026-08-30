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
  CircleGeometry,
  Color,
  DirectionalLight,
  ExtrudeGeometry,
  Fog,
  Group,
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
  buildRoadwayIndex,
  rectsOverlap,
} from './walk-controls.js';
import {
  makeFigureSpec,
  makeFigureGeoms,
  makeTravelerSpec,
  TRAVELER_CANE_REACH_M,
  TRAVELER_CANE_THICK_M,
} from './city-figures.js';
import {
  treeTableFor,
  pickSpecies,
  treeSpec,
  makeCanopyGeoms,
} from './city-trees.js';
import {
  flowerTableFor,
  pickFlower,
  planterBoxes,
  picnicTableBoxes,
  flowerbedPositions,
  PLANTER_L_M,
  PLANTER_W_M,
  TABLE_L_M,
  TABLE_W_M,
  TABLE_TOP_H_M,
  PLANTER_H_M,
} from './city-planting.js';
import {
  dressingFor,
  needleLegPoint,
  NEEDLE_LEG,
  NEEDLE_LEG_BEARINGS_RAD,
  libraryPlatformRing,
  LIBRARY_DIAGRID,
  LIBRARY_PLATFORMS,
} from './landmark-dressings.js';
import {
  DEFAULT_MAP_STYLE,
  mapStyleById,
  wayfindMarkSizeM,
  wayfindTierOf,
} from './city-map-styles.js';
import {
  birdTableFor,
  pickBird,
  birdSpec,
  birdBoxes,
  PERCH_SINK_M,
} from './city-birds.js';
import {
  buildRoadGraph,
  ringCentroid,
  trafficDensityFor,
} from './city-data.js';
import {
  facadeCandidates,
  facadeFamilyFor,
  fitBays,
  fitRows,
  groupWallRuns,
  FACADE_FAMILIES,
} from './facade-grammar.js';

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
// CW-Q81, answered by the owner at G1 2026-08-29. A park's surface was
// 0x101410 - a luminance of about 0.07 - so the converter drew almost nothing
// on it and a park read as a hole in the city; with CW-71's colour ink floor
// at 0.3 it would have drawn NOTHING at all in colour. The owner asked for it
// raised ABOVE that floor, knowing that this puts a park brighter than the
// road (0.15-0.23) and so on the far side of CW-8's carpet law, which was
// written to stop a ground surface reading as a carpet. 0x4a5c4a is a
// luminance of 0.341: over the ink floor, under the 0.5 blank level the
// monochrome ladder uses, and the green texture multiplies it down from there.
// PHOTOGRAPHED before it shipped; if it reads as a carpet it comes back.
const GREEN_TONES = { street: 0x4a5c4a, map: 0x3f5a3f };

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

/**
 * A building's own colour comes from its vertex colours, so the material tint
 * is a plain multiplier and white is the identity. CW-60's styles move it
 * over the map; naming it means the street's value and the restore cannot
 * drift apart (D-114).
 */
const BUILDING_STREET_TINT = 0xffffff;

// Roads float just above the ground plane so they win the depth test.
const ROAD_LIFT_M = 0.08;
/** CW-60: wayfinding marks ride above every flat surface on the map. */
const WAYFIND_LIFT_M = ROAD_LIFT_M + 0.12;
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
 * The archetype names, in table order, for the grammar to point at (CW-73).
 *
 * facade-grammar.js names its archetypes rather than indexing them, so
 * reordering the table above cannot silently re-point a whole family of
 * buildings at the wrong glazing. Exported so the unit suite can prove every
 * name the grammar uses is a real one.
 */
export const WINDOW_ARCHETYPE_NAMES = Object.freeze(
  WINDOW_ARCHETYPES.map((a) => a.name)
);

const ARCHETYPE_INDEX_BY_NAME = new Map(
  WINDOW_ARCHETYPE_NAMES.map((name, i) => [name, i])
);

/**
 * ★★ CW-63: FACADE FAMILIES A DRESSING CAN ASK FOR, AND THE GENERIC HASH
 * CANNOT.
 *
 * These sit AFTER the nine archetypes in every array the buildings loop
 * indexes, and the hash that picks a facade for an ordinary building still
 * divides by `WINDOW_ARCHETYPES.length`. So a dressing row is the only way any
 * building in any city ever wears one of these, which is what keeps CW-Q56's
 * exception named rather than leaked: adding the diagrid to WINDOW_ARCHETYPES
 * would have given one building in ten a diamond skin it has no business
 * wearing.
 *
 * They cost no new MESH and no new class id - every bucket becomes a mesh
 * called `buildings` like the other nine, so the CW-56 builders guard and
 * CW-43's full MAX_CLASS_SPANS are both satisfied by construction.
 */
const DRESSING_FACADES = ['diagrid'];

/** Buckets, textures and meshes are indexed over both lists together. */
const FACADE_COUNT = WINDOW_ARCHETYPES.length + DRESSING_FACADES.length;

/** @param {string|undefined} name @returns {number} -1 when there is none */
function dressingFacadeIndex(name) {
  const i = DRESSING_FACADES.indexOf(name ?? '');
  return i < 0 ? -1 : WINDOW_ARCHETYPES.length + i;
}

/**
 * What a mapped material biases a building's glazing towards (CW-34 P3).
 *
 * A BIAS, never an override: the listed archetypes are the ones that material
 * chooses among, and the building's own hash still picks which. Denver is 97
 * glass buildings out of 363, and forcing all of them onto one archetype
 * would trade the letterform monoculture this release removed for a material
 * monoculture in its place.
 *
 * CW-73: these were indices into WINDOW_ARCHETYPES and are NAMES now, so
 * that the material table and facade-grammar.js's type table speak the same
 * language and can be intersected. Same nine values, same shortlists.
 */
const ARCHETYPES_BY_MATERIAL = new Map([
  // A curtain wall is glazing bars and continuous bands, not punched holes.
  ['glass', ['stripes', 'wide', 'band']],
  ['mirror', ['stripes', 'wide', 'band']],
  ['glass_reinforced_concrete', ['stripes', 'band']],
  // Masonry punches holes in a solid wall.
  ['brick', ['narrow', 'slot', 'plain']],
  ['stone', ['narrow', 'slot']],
  ['sandstone', ['narrow', 'slot']],
  ['concrete', ['cross', 'plain', 'pair']],
  ['plaster', ['plain', 'pair']],
  ['metal', ['stripes', 'band']],
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
 * ★★ CW-63: THE SEATTLE CENTRAL LIBRARY'S DIAGRID, painted at runtime like
 * every other facade in this city, so it costs the bundle nothing.
 *
 * The published skin is a steel-and-glass DIAMOND grid wrapping the whole
 * envelope. Drawn here as a lattice of two diagonal families, with the glass
 * between them and the steel members CUT OUT of it - the archetype table's
 * first rule, learned at CW-25: draw a dark shape ON a wall and the wall stops
 * reading as lit at all.
 *
 * ★ THE TILE IS ONE DIAMOND PERIOD IN EACH AXIS, TIMES FOUR. The lattice is
 * the pair of line families x/w + z/h = k and x/w - z/h = k, whose period is
 * exactly one diamond width across and one diamond height up, so any whole
 * number of diamonds wraps seamlessly; four by four gives the per-pane
 * brightness room to look unplanned before it repeats, and the levels are
 * indexed modulo the tile so the wrap stays exact.
 *
 * ★ THE RESOLUTION IS SET BY THE MEMBER, NOT BY TASTE. CW-52 found a facade
 * pattern finer than the character grid beats against it and shimmers, and the
 * release prompt's floor is a line at least 3 px wide in TEXTURE space. At
 * 14.2 px per metre the shipped 1.2 m member is 17 px there, far over it, and
 * the whole tile is a quarter of a megabyte.
 *
 * That floor is not the binding one, though. On SCREEN at the 90 m photograph
 * gate one metre is 7.28 px, so the member is 8.7 px against a character cell
 * 4 px wide - and it is the SCREEN number that decided the width, because a
 * member under one cell across cannot make a cell dark whatever the texture
 * holds.
 *
 * ★ THAT 7.28 IS OVER THE GAME VIEWPORT'S HEIGHT, NOT THE WINDOW'S, and the
 * difference is 19%. The camera is sized from `viewport.clientHeight`, which
 * in the 1600 x 900 window the gate used is 756 px - the header takes the
 * rest, and the captured ASCII canvas measures 1600 x 756. Working from 900
 * puts the published 0.4 m member at 3.46 px instead of 2.91, which is 0.87 of
 * a cell instead of 0.73.
 *
 * @returns {CanvasTexture|null}
 */
function createDiagridTexture() {
  const { widthM, heightM, memberM, paneLevel, memberLevel } = LIBRARY_DIAGRID;
  const pxPerM = 14.22;
  const tileD = 4;
  const cellW = Math.round(widthM * pxPerM);
  const cellH = Math.round(heightM * pxPerM);
  const c = make2dContext(cellW * tileD, cellH * tileD);
  if (!c) return null;
  const { canvas, ctx } = c;

  // The glass behind everything, so a member that misses a pixel leaves glass
  // rather than a hole in it.
  const [paneLo, paneHi] = paneLevel;
  ctx.fillStyle = `rgb(${paneLo},${paneLo},${paneLo})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const rand = makeLcg(0x5ea11b63);
  // One brightness per pane, indexed modulo the tile: that is what makes the
  // wrap exact rather than merely unlikely to be noticed.
  const levels = [];
  for (let i = 0; i < tileD * 2; i++) {
    levels.push([]);
    for (let j = 0; j < tileD * 2; j++) {
      // A mirror curtain wall is not a grid of office windows: the panes
      // vary a little so the wall is not a flat plate, and no further. As
      // shipped both ends are exact black, so the variation is what a
      // different pane level would use rather than something it does today.
      levels[i].push(paneLo + Math.floor(rand() * (paneHi - paneLo + 1)));
    }
  }

  const wrap = (n) => ((n % (tileD * 2)) + tileD * 2) % (tileD * 2);
  // Pane centres sit where both diagonal families cross at half-integers -
  // every (k, l) with k + l odd, in half-diamond steps.
  for (let k = -1; k <= tileD * 2 + 1; k++) {
    for (let l = -1; l <= tileD * 2 + 1; l++) {
      if ((k + l) % 2 === 0) continue;
      const cx = (k * cellW) / 2;
      const cy = (l * cellH) / 2;
      const level = levels[wrap(k)][wrap(l)];
      ctx.fillStyle = `rgb(${level},${level},${level})`;
      ctx.beginPath();
      ctx.moveTo(cx - cellW / 2, cy);
      ctx.lineTo(cx, cy - cellH / 2);
      ctx.lineTo(cx + cellW / 2, cy);
      ctx.lineTo(cx, cy + cellH / 2);
      ctx.closePath();
      ctx.fill();
    }
  }

  // The steel. Cut OUT of the glass when it is meant to land as exact black -
  // the archetype table's own first rule, and the one value that reads as an
  // empty cell - or painted over it when the members are the bright thing.
  if (memberLevel <= 0) ctx.globalCompositeOperation = 'destination-out';
  ctx.strokeStyle =
    memberLevel <= 0
      ? '#000'
      : `rgb(${memberLevel},${memberLevel},${memberLevel})`;
  ctx.lineWidth = memberM * pxPerM;
  ctx.beginPath();
  for (let k = -tileD; k <= tileD * 2; k++) {
    // Rising, then falling: one line of each family through every lattice
    // column, run the full height of the tile.
    ctx.moveTo(k * cellW, 0);
    ctx.lineTo((k + tileD) * cellW, tileD * cellH);
    ctx.moveTo(k * cellW, 0);
    ctx.lineTo((k - tileD) * cellW, tileD * cellH);
  }
  ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';

  // Same v convention as every other facade: a lattice boundary at z = 0, so
  // the diamonds count up from the platform each one stands on.
  const tileWM = widthM * tileD;
  const tileHM = heightM * tileD;
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
 * ★★ CW-74: WHAT A BUILDING SAYS ABOUT ITS OWN GROUND FLOOR.
 *
 * The picker read POI NODES within 35 m and nothing else, so a building
 * carrying `amenity=library` was never asked what it was and its ground floor
 * fell through to a hash of its index. The Central Library (way 37056442,
 * `amenity=library` and `tourism=attraction`) got its shopfront from a coin
 * toss; so did 136 other grounded Seattle buildings, and 28, 46 and 9 in the
 * other three cities.
 *
 * Two tables carry the values the POI map has no answer for. Both are TASTE,
 * measured against what is actually in the four extracts:
 *
 *   65 `amenity=parking`, 18 `shelter`, 13 `place_of_worship`,
 *   13 `social_facility`, 8 `courthouse`, 5 `tourism=museum`, ...
 *
 * ★ A BUILDING WITH NO SHOPFRONT GETS NO BAND, and no shop sign either. A
 * multi-storey car park with a lit shop window across its base is a worse
 * answer than a plain wall, and it is the answer the hash was giving.
 */
const LOBBY_BAND = STOREFRONT_VARIANTS.findIndex((v) => v.name === 'lobby');

/** Own-tag values that read as a LOBBY: a way in, not a shop window. */
const OWN_TAG_LOBBY = new Set([
  'arts_centre',
  'attraction',
  'bus_station',
  'clinic',
  'college',
  'community_centre',
  'conference_centre',
  'courthouse',
  'doctors',
  'dojo',
  'events_venue',
  'fire_station',
  'gallery',
  'hospital',
  'museum',
  'police',
  'school',
  'social_centre',
  'social_facility',
  'studio',
  'townhall',
  'university',
]);

/** Own-tag values that read as a LIT FRONTAGE the POI map has no key for. */
const OWN_TAG_BANDS = new Map([
  ['biergarten', 6],
  ['casino', 19],
  ['food_court', 11],
  ['ice_cream', 5],
  ['nightclub', 19],
  ['stripclub', 19],
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

/**
 * ★★ CW-74: WHICH GROUND FLOOR THIS BUILDING HAS, from the strongest evidence
 * available: ITS OWN TAG FIRST, the nearest POI second, the hash last.
 *
 * `shop` beats `amenity` beats `tourism`. ★ ONLY THE FIRST OF THOSE IS
 * DECIDED BY THE DATA. Exactly three buildings in the four extracts carry more
 * than one of the three tags, and only one of them resolves differently either
 * way: the Richard Levy Gallery in Albuquerque (way 437189766,
 * `shop=art` + `tourism=gallery`) gets a shop window rather than a gallery
 * lobby. The Central Library carries `amenity=library` AND
 * `tourism=attraction` and lands on the same lobby whichever is read first.
 * The amenity-before-tourism half is therefore a stated convention with no
 * case in this data to justify it - what a building IS beats what it is a
 * destination FOR - and the unit case that pins it says so.
 *
 * @param {Record<string,string>|undefined} tags the BUILDING's own tags
 * @param {string|null} poiKind the nearest POI's kind, or null
 * @returns {{band:number|null|undefined, kind:string|null,
 *   source:'own'|'poi'|'hash'}} `band` is an index into STOREFRONT_VARIANTS;
 *   **null means NO BAND** (this building has no shopfront at all);
 *   **undefined means the caller's hash decides**, which is what happens when
 *   nothing knows anything. `kind` is the vocabulary word the answer came
 *   from, which is what the CW-46 warm/cool bias is keyed on - a BAND name is
 *   not the same vocabulary and using one there silently loses the bias.
 */
export function storefrontBandForBuilding(tags, poiKind) {
  const own = (key) => {
    const v = tags?.[key];
    return typeof v === 'string' && v.length > 0 ? v : null;
  };

  const shop = own('shop');
  if (shop !== null) {
    if (shop === 'no') return { band: null, kind: null, source: 'own' };
    const kind = normalizeStorefrontKind(`shop:${shop}`);
    return { band: storefrontBandFor(kind), kind, source: 'own' };
  }

  for (const key of ['amenity', 'tourism']) {
    const value = own(key);
    if (value === null) continue;
    // CW-53 kept the hotel's lobby off the POI index because a hotel is a WAY
    // in every extract and the index only ever sees nodes.
    const direct = storefrontBandFor(value);
    if (direct !== null) return { band: direct, kind: value, source: 'own' };
    if (OWN_TAG_BANDS.has(value)) {
      return { band: OWN_TAG_BANDS.get(value), kind: value, source: 'own' };
    }
    if (OWN_TAG_LOBBY.has(value)) {
      // A lobby is lit like a library's: the temperature table already has a
      // word for that, and `value` (a courthouse, a museum) does not.
      return { band: LOBBY_BAND, kind: 'library', source: 'own' };
    }
    return { band: null, kind: null, source: 'own' };
  }

  const fromPoi = normalizeStorefrontKind(poiKind ?? null);
  const band = storefrontBandFor(fromPoi);
  if (band !== null) return { band, kind: fromPoi, source: 'poi' };
  return { band: undefined, kind: null, source: 'hash' };
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
/**
 * Paint the shopfront bands onto a canvas, at a brightness.
 *
 * CW-70 split this out of createStorefrontTexture so the bands can be
 * repainted at run time: the three treatments of the bright layer differ in
 * how bright a lit ground floor is, and the owner compares them side by side.
 * `brightness` multiplies every painted channel, so 1 is exactly what the art
 * direction above paints (a brightest paint of 0xef, luminance 0.937) and 0.83
 * puts that at 0.777, below the reverse-video cliff.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {number} brightness
 * @returns {number} the brightness actually applied
 */
function paintStorefrontCanvas(canvas, brightness) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return 1;
  const bandH = canvas.height / STOREFRONT_VARIANTS.length;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#181818';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  STOREFRONT_VARIANTS.forEach((variant, i) => {
    ctx.save();
    ctx.translate(0, i * bandH);
    variant.paint(ctx, canvas.width, bandH);
    ctx.restore();
  });

  const scale = Number.isFinite(brightness) ? Math.max(0, brightness) : 1;
  if (Math.abs(scale - 1) > 1e-6) {
    // Scaled on the pixels rather than through a multiply composite, so the
    // result is exactly `paint x scale` and a test can say what it should be.
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = img.data;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.round(data[i] * scale);
      data[i + 1] = Math.round(data[i + 1] * scale);
      data[i + 2] = Math.round(data[i + 2] * scale);
    }
    ctx.putImageData(img, 0, 0);
  }
  return scale;
}

function createStorefrontTexture(brightness = 1) {
  const bandH = 112;
  const c = make2dContext(192, bandH * STOREFRONT_VARIANTS.length);
  if (!c) return null;
  const { canvas } = c;

  paintStorefrontCanvas(canvas, brightness);

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

/**
 * What a city's GREENSPACE is made of (CW-57, CW-Q51's extension).
 *
 * Two rows are the owner's own words and ship as given; two were researched at
 * execution, the way CW-51's paving rows were - and unlike the paving, where
 * Denver and Burnaby genuinely specified the SAME broom finish, their ground
 * genuinely differs.
 *
 * - seattle   'lush': greens lush, with plant tufts at the edges. The owner's
 *             words.
 * - albuquerque 'dirt': dirt and rough stone, no lush green. The owner's
 *             words, and the honest one for a high-desert city.
 * - denver    'turf': irrigated Kentucky bluegrass. Denver Parks' own
 *             irrigation inventory describes its park sites as composed of
 *             irrigated bluegrass turf alongside non-irrigated native and
 *             natural areas, and bluegrass was the default landscape cover
 *             across city property for decades - so an even, managed,
 *             mown surface with native patches is what a Denver park is.
 *             (Denver Parks Irrigation System Inventory, Aqua Engineering,
 *             denvergov.org; Denver Water on the 2023 policy shift toward
 *             native grasses.)
 * - burnaby   'moss': the City of Burnaby's Boulevard Treatment and
 *             Maintenance Policy requires NATURAL turf on boulevards -
 *             artificial turf is expressly not acceptable - and Burnaby's
 *             clay-heavy soil, high rainfall and mature tree canopy are the
 *             conditions moss thrives in. So a Burnaby verge is soft, uneven
 *             and mottled rather than mown flat. (The policy is the city's
 *             own; the moss-conditions claim is local horticultural practice
 *             rather than a municipal specification, and is marked as the
 *             weaker of the two citations.)
 *
 * ★ THE LUMINANCE NEVER MOVES. This is texture and vocabulary, never
 * brightness: a green bright enough to be obvious in the 3D frame carpets the
 * lower half of the street view, which is the law every one of these clusters
 * is written around. The texture MULTIPLIES the one GREEN_TONES tone.
 *
 * Every row is design data the owner can veto.
 */
export const CITY_GROUND = {
  seattle: 'lush',
  albuquerque: 'dirt',
  denver: 'turf',
  burnaby: 'moss',
};
const DEFAULT_GROUND = 'turf';
const GREEN_TILE_M = 8;
const GREEN_TILE_PX = 256;

/**
 * A greenspace's own surface, as a texture that multiplies GREEN_TONES.
 *
 * Mid grey is "unchanged", exactly as in the paving texture, so every mark
 * here is a small step either side of the tone the green already had.
 *
 * @param {'lush'|'dirt'|'turf'|'moss'} style
 * @returns {CanvasTexture|null}
 */
function createGreenTexture(style) {
  const size = GREEN_TILE_PX;
  const c = make2dContext(size, size);
  if (!c) return null;
  const { canvas, ctx } = c;
  const pxPerM = size / GREEN_TILE_M;
  ctx.fillStyle = 'rgb(160,160,160)';
  ctx.fillRect(0, 0, size, size);
  const rand = makeLcg(0x9eed5a11);
  const grey = (v) => `rgb(${v},${v},${v})`;

  // ★ THE CONTRAST IS WIDE ON PURPOSE, AND THAT IS NOT THE SAME AS BRIGHT.
  // GREEN_TONES.street is 0x101410 - a luminance under a tenth - and a texture
  // that only steps a few percent either side of mid grey multiplies almost
  // nothing: measured, the first version of this was invisible in every city.
  // The MEAN stays at mid grey, so the tone the carpet law governs does not
  // move; the VARIANCE is what grows, which is exactly what "texture and
  // vocabulary, never brightness" asks for.
  if (style === 'lush') {
    // Tufts: short upright strokes in dense clumps, so a Seattle green reads
    // as growth rather than as a lawn.
    for (let clump = 0; clump < 120; clump++) {
      const cx = rand() * size;
      const cy = rand() * size;
      for (let i = 0; i < 16; i++) {
        const x = cx + (rand() - 0.5) * pxPerM * 1.1;
        const y = cy + (rand() - 0.5) * pxPerM * 1.1;
        ctx.fillStyle = grey(70 + Math.floor(rand() * 185));
        ctx.fillRect(x, y, 1, 2 + Math.floor(rand() * 5));
      }
    }
  } else if (style === 'dirt') {
    // Dirt and rough stone: a sparse speckle with the odd bright fleck and
    // long bare stretches between - the opposite of a lawn.
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = grey(75 + Math.floor(rand() * 60));
      ctx.fillRect(rand() * size, rand() * size, 1, 1);
    }
    for (let i = 0; i < 160; i++) {
      const r = 1 + rand() * 2.6;
      ctx.beginPath();
      ctx.arc(rand() * size, rand() * size, r, 0, Math.PI * 2);
      ctx.fillStyle = grey(200 + Math.floor(rand() * 55));
      ctx.fill();
    }
  } else if (style === 'moss') {
    // Moss: soft uneven blotches, large and overlapping, so the surface reads
    // as mottled rather than mown.
    for (let i = 0; i < 260; i++) {
      const r = pxPerM * (0.15 + rand() * 0.5);
      ctx.beginPath();
      ctx.arc(rand() * size, rand() * size, r, 0, Math.PI * 2);
      ctx.fillStyle = grey(85 + Math.floor(rand() * 155));
      ctx.fill();
    }
  } else {
    // Irrigated turf: mown stripes, even and managed, with a fine grain -
    // the bluegrass Denver's parks actually are.
    const stripe = Math.max(2, Math.round(pxPerM * 0.9));
    for (let y = 0; y < size; y += stripe) {
      ctx.fillStyle = grey((y / stripe) % 2 === 0 ? 105 : 215);
      ctx.fillRect(0, y, size, stripe);
    }
    for (let i = 0; i < 1800; i++) {
      ctx.fillStyle = grey(120 + Math.floor(rand() * 80));
      ctx.fillRect(rand() * size, rand() * size, 1, 1);
    }
  }

  // ShapeGeometry's UVs are the vertex x/y, which this project keeps in
  // METRES - so the repeat is distance over tile, never a normalized guess,
  // and a park keeps one real-world scale whatever its size.
  return makeRepeatingTexture(canvas, 1 / GREEN_TILE_M, 1 / GREEN_TILE_M);
}

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

/**
 * ★★ CW-73: FIT THE WINDOW GRID TO THE WALL IT IS ON.
 *
 * ExtrudeGeometry lays a side wall out as u = whichever of world x or y the
 * wall runs along, v = 1 - z, both in METRES, and every facade texture in this
 * city carries a metre repeat that assumes it. That is why a wall of arbitrary
 * width has a fractional bay at its corner and a building of arbitrary height
 * a fractional row at its top: the grid is fitted to the WORLD, not to the
 * building.
 *
 * This rewrites the side-wall UVs so that instead:
 *
 *   - each WALL RUN carries a whole number of bays, sharing the run exactly
 *     (facade-grammar's `fitBays`), so no bay is cut at a corner;
 *   - the wall's height above `baseM` carries a whole number of rows
 *     (`fitRows`), so no row is cut at the top;
 *   - `baseM` reserves the ground floor, which the storefront strip covers.
 *
 * ★ ONLY THE SIDE GROUP IS TOUCHED. ExtrudeGeometry emits the cap faces first
 * (materialIndex 0) and the walls second (materialIndex 1), six vertices per
 * wall segment in the order lower-i, lower-j, upper-i, lower-j, upper-j,
 * upper-i. The caps are the roof and the underside; their UVs are the
 * footprint's own x and y and re-fitting them would re-texture every roof in
 * the city for no reason.
 *
 * The per-building phase that CW-34 introduced still applies and still moves
 * in WHOLE bays and rows - `phaseU` in bay metres, `phaseV` in row metres -
 * so fifty towers sharing one texture still do not share one lit pattern.
 *
 * @param {BufferGeometry} geometry
 * @param {{bayWM:number, bayHM:number, bayPitchM:number, rowHeightM:number,
 *          baseM:number, phaseU:number, phaseV:number}} fit
 * @returns {{runs:number, blank:number, rowError:number}|null} null when the
 *   geometry has no side walls to fit (which is not an error - a flat cap can
 *   be all there is). `rowError` is how far the worst vertex on this volume
 *   sits from a row boundary, MEASURED off the vertices rather than assumed:
 *   the arithmetic cannot be wrong, but the mesh can be a shape the
 *   arithmetic was never told about.
 */
export function fitFacadeUv(geometry, fit) {
  const side = geometry.groups?.find((g) => g.materialIndex === 1);
  if (!side || side.count < 6 || side.count % 6 !== 0) return null;
  const pos = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  if (!pos || !uv) return null;

  const chunks = side.count / 6;
  const segments = new Array(chunks);
  for (let c = 0; c < chunks; c++) {
    const i = side.start + c * 6;
    segments[c] = [
      [pos.getX(i), pos.getY(i)],
      [pos.getX(i + 1), pos.getY(i + 1)],
    ];
  }

  const vScale = fit.bayHM / fit.rowHeightM;
  // Which of the six vertices sit at the segment's start, and which at its
  // end. Getting this wrong mirrors every other triangle, which reads as a
  // wall of windows that alternate direction.
  const AT_END = [false, true, false, true, true, false];
  let blank = 0;
  let blankM = 0;
  let wallM = 0;
  let runCount = 0;
  let topZ = -Infinity;

  for (const run of groupWallRuns(segments)) {
    runCount++;
    const { bays, bayWidthM } = fitBays({
      widthM: run.lengthM,
      pitchM: fit.bayPitchM,
    });
    let travelledM = 0;
    for (let c = run.start; c < run.start + run.count; c++) {
      const i = side.start + c * 6;
      const [a, b] = segments[c];
      const segLenM = Math.hypot(b[0] - a[0], b[1] - a[1]);
      wallM += segLenM;
      if (bays === 0) {
        // A wall too narrow for one bay is BLANK, not squeezed. Every window
        // texture is painted grout-first and every archetype's pane is inset,
        // so the tile's own corner is grout in all nine: pinning the whole
        // wall to it is a dark wall rather than a smeared window.
        for (let k = 0; k < 6; k++) uv.setXY(i + k, 0, 1);
        blankM += segLenM;
        continue;
      }
      const uStart = fit.phaseU + (travelledM / bayWidthM) * fit.bayWM;
      const uEnd =
        fit.phaseU + ((travelledM + segLenM) / bayWidthM) * fit.bayWM;
      for (let k = 0; k < 6; k++) {
        const z = pos.getZ(i + k);
        if (z > topZ) topZ = z;
        uv.setXY(
          i + k,
          AT_END[k] ? uEnd : uStart,
          1 + fit.phaseV - (z - fit.baseM) * vScale
        );
      }
      travelledM += segLenM;
    }
    if (bays === 0) blank += run.count;
  }
  uv.needsUpdate = true;
  // ★ MEASURE THE CLAIM AT THE TOP OF THE WALL, and only there. The BOTTOM of
  // a wall with a reserved ground floor is off the row grid ON PURPOSE - the
  // storefront strip covers it - so including it turns the honest number into
  // a permanent half-row of noise. This asks the actual question: does the
  // wall FINISH on a row boundary?
  const topRows = (topZ - fit.baseM) / fit.rowHeightM;
  return {
    runs: runCount,
    blank,
    blankM,
    wallM,
    rowError: Number.isFinite(topRows)
      ? Math.abs(topRows - Math.round(topRows))
      : 0,
  };
}

function offsetGeometryUv(geometry, du, dv) {
  const uv = geometry.getAttribute('uv');
  if (!uv) return;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) + du, uv.getY(i) + dv);
  }
  uv.needsUpdate = true;
}

/**
 * ★★ CW-63 (CW-Q56): AUTHORED TRIPOD ARCS FOR THE SPACE NEEDLE.
 *
 * The data has thirteen straight `building:part` prisms and no curve, so the
 * hourglass - the one thing that makes the silhouette the Space Needle rather
 * than a mast - is authored here from published dimensions (see
 * landmark-dressings.js for the numbers and their sources).
 *
 * ★ THE ARCS ARE BOXES, and that is a decision the converter makes for us.
 * A swept tube would carry vertices this city cannot see: read through a
 * grid whose cell is 4 px wide and 9 px tall, nine stacked boxes and a smooth
 * curve are the same picture, and boxes merge into the same buffer every
 * other building already uses. So the legs cost geometry and nothing else -
 * no new material, no new draw call, no new class id.
 *
 * @param {[number, number]} centre the tower's own centre, in world metres
 * @param {number} groundZ what the tower stands on
 */
function needleTripodGeometries(centre, groundZ, tint) {
  const geoms = [];
  const { segments, thicknessM } = NEEDLE_LEG;
  const half = thicknessM / 2;
  for (const bearing of NEEDLE_LEG_BEARINGS_RAD) {
    for (let i = 0; i < segments; i++) {
      const a = needleLegPoint(bearing, i / segments);
      const b = needleLegPoint(bearing, (i + 1) / segments);
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const dz = b[2] - a[2];
      const len = Math.hypot(dx, dy, dz);
      if (!(len > 0)) continue;
      // ★ NON-INDEXED, AND THE CITY WOULD NOT LOAD WITHOUT IT. Every building
      // in the merge comes from ExtrudeGeometry, which has no index;
      // BoxGeometry has one, and mergeGeometries refuses a mix outright
      // ("index attribute exists among all geometries, or in none of them").
      // The whole city failed to build on the first run of this - the CW-25
      // merged-mesh invariant, arriving from a new direction.
      const box = new BoxGeometry(
        thicknessM,
        thicknessM,
        len + half
      ).toNonIndexed();
      // Stand the box along the segment: pitch it away from vertical by the
      // segment's own slope, then swing it round to the leg's bearing.
      const pitch = Math.acos(Math.min(1, Math.max(-1, dz / len)));
      box.rotateX(pitch);
      box.rotateZ(-Math.atan2(dx, dy));
      box.translate(
        centre[0] + (a[0] + b[0]) / 2,
        centre[1] + (a[1] + b[1]) / 2,
        groundZ + (a[2] + b[2]) / 2
      );
      paintGeometry(box, tint);
      geoms.push(box);
    }
  }
  return geoms;
}

/**
 * ★★ CW-63 (CW-Q56): THE SEATTLE CENTRAL LIBRARY'S AUTHORED MASSING.
 *
 * This is the one dressing that REPLACES rather than adds, and the reason is
 * in the data. The Library's way carries `building=yes height=60` and four
 * `building:part=roof` ways with no height on any of them, so the generic
 * pipeline draws a plain 60 m box with four default-height slabs standing
 * inside it. Nothing in that says anything about the five offset platforms the
 * building is known for, so there is nothing to wrap - the box goes and the
 * platforms stand in its place.
 *
 * ★ THE FOOTPRINTS ARE THE DATA'S, SHRUNK AND SLID. Each platform is the
 * building's own outline scaled about its centroid along the block's own axes
 * and offset in metres, so every platform keeps the block's cut-corner plan
 * and the whole stack stays where the map put it. The numbers are in
 * landmark-dressings.js with their sources.
 *
 * ★ COLLISION IS UNTOUCHED, by construction: collision reads `building.outer`
 * and never looks at geometry, and this function does not modify the outline.
 * A platform that overhangs the sidewalk is a cantilever you can walk under,
 * which is what the published building does over 4th Avenue.
 *
 * @param {Object} building
 * @param {[number, number, number]} tint
 */
function libraryPlatformGeometries(building, tint) {
  const geoms = [];
  const centre = ringCentroid(building.outer);
  const rings = LIBRARY_PLATFORMS.map((platform) => ({
    ring: libraryPlatformRing(building.outer, centre, platform),
    fromM: building.heightM * platform.fromH,
    toM: building.heightM * platform.toH,
  }));
  for (const { ring, fromM, toM } of rings) {
    if (!(toM > fromM)) continue;
    const geom = extrudeBuilding(
      // No holes: the outline this dresses has none (measured - the Library's
      // way is a single 12-point ring), and a platform is a transform of that
      // ring. A dressed building with a courtyard would need them threaded
      // through the same transform, which is a change this table has no row
      // to justify yet.
      { outer: ring, holes: [], heightM: toM, minHeightM: fromM },
      tint
    );
    if (geom) geoms.push(geom);
  }
  // ★ THE FOUR FLOWING PLANES. Every platform is a transform of the SAME
  // outline, so consecutive rings have the same vertex count and the skin
  // between them is one quad per edge - no triangulation, no seams to chase.
  for (let i = 0; i + 1 < rings.length; i++) {
    const plane = loftRings(
      rings[i].ring,
      rings[i].toM,
      rings[i + 1].ring,
      rings[i + 1].fromM,
      tint
    );
    if (plane) geoms.push(plane);
  }
  return geoms;
}

/**
 * A sloping skin between two rings of equal length, as a merge-ready
 * non-indexed geometry.
 *
 * ★ THE UVs COPY ExtrudeGeometry'S SIDE-WALL RULE ON PURPOSE. Three.js lays a
 * side wall out as u = whichever of world x or y the wall runs along and
 * v = 1 - z, and every facade texture in this city is built with a metre
 * repeat that assumes it. Inventing a UV here would have run the diagrid at a
 * different scale on the leaning parts than on the upright ones, which is
 * exactly the seam a diamond lattice shows.
 *
 * @param {Array<[number, number]>} lower
 * @param {number} lowerZ
 * @param {Array<[number, number]>} upper
 * @param {number} upperZ
 * @param {[number, number, number]} tint
 * @returns {BufferGeometry|null}
 */
function loftRings(lower, lowerZ, upper, upperZ, tint) {
  const n = lower.length;
  if (n < 3 || upper.length !== n) return null;
  const pos = new Float32Array(n * 18);
  const uv = new Float32Array(n * 12);
  let p = 0;
  let t = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    // Wound so the outward face is the front one, the same way round as the
    // extruded walls above and below it.
    const quad = [
      [lower[i][0], lower[i][1], lowerZ],
      [lower[j][0], lower[j][1], lowerZ],
      [upper[j][0], upper[j][1], upperZ],
      [upper[i][0], upper[i][1], upperZ],
    ];
    const alongY =
      Math.abs(quad[1][1] - quad[0][1]) >= Math.abs(quad[1][0] - quad[0][0]);
    for (const k of [0, 1, 2, 0, 2, 3]) {
      pos[p++] = quad[k][0];
      pos[p++] = quad[k][1];
      pos[p++] = quad[k][2];
      uv[t++] = alongY ? quad[k][1] : quad[k][0];
      uv[t++] = 1 - quad[k][2];
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(pos, 3));
  geometry.setAttribute('uv', new BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  paintGeometry(geometry, tint);
  return geometry;
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

// CW-76 canopy columns. A canopy is a slab held over something; where the
// something is a building it needs nothing (the building holds it), and where
// it is open ground it needs legs or it is exactly the floating slab this
// release exists to remove.
//
// The legs go at the outline's own corners, which is where a real canopy's
// posts stand, thinned to one every CANOPY_COLUMN_SPACING_M so a 29-corner
// awning gets a colonnade and not a fence. A corner standing in a drawn
// roadway gets NO column: CW-75's law is that nothing of the city stands in
// the road, and a post in a traffic lane is worse than a slab with one fewer
// leg. Some canopies span a street corner to corner and legally get none at
// all - those are counted, not fudged.
const CANOPY_COLUMN_W_M = 0.35;
const CANOPY_COLUMN_SPACING_M = 6;

/**
 * @param {Object} building - a canopy, already resolved by city-data
 * @param {number} tint
 * @param {{insideRoadway: Function}|null} roadways
 * @returns {{geoms: Array, placed: number, refused: number}}
 */
function canopyColumnGeometries(building, tint, roadways) {
  const out = { geoms: [], placed: 0, refused: 0 };
  const baseM = building.minHeightM ?? 0;
  const ring = building.outer;
  if (!(baseM > 0) || !Array.isArray(ring) || ring.length < 3) return out;

  const half = CANOPY_COLUMN_W_M / 2;
  let sinceLast = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const [x, y] = ring[i];
    if (i > 0) {
      const [px, py] = ring[i - 1];
      sinceLast += Math.hypot(x - px, y - py);
    }
    if (sinceLast < CANOPY_COLUMN_SPACING_M) continue;
    // The whole post has to clear the kerb, not just its centre.
    if (roadways?.insideRoadway(x, y, -CANOPY_COLUMN_W_M)) {
      out.refused++;
      continue;
    }
    const geom = extrudeBuilding(
      {
        outer: [
          [x - half, y - half],
          [x + half, y - half],
          [x + half, y + half],
          [x - half, y + half],
        ],
        holes: [],
        heightM: baseM,
        minHeightM: 0,
      },
      tint
    );
    if (!geom) continue;
    out.geoms.push(geom);
    out.placed++;
    sinceLast = 0;
  }
  return out;
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
  const windowTextures = [
    ...WINDOW_ARCHETYPES.map((_, i) => createWindowTexture(i)),
    // CW-63: the dressing-only families, in DRESSING_FACADES order. Painted
    // for every city, and in a city with no dressed landmark in it the bucket
    // stays empty and no mesh is ever made from it.
    createDiagridTexture(),
  ];
  const storefrontTexture = createStorefrontTexture();
  // CW-51: which paving finish this city's own municipality specifies.
  const pavingTexture = createPavingTexture(
    CITY_PAVING[model.name] ?? DEFAULT_PAVING
  );
  const groundTexture = createGroundTexture();
  const greenTexture = createGreenTexture(
    CITY_GROUND[model.name] ?? DEFAULT_GROUND
  );
  for (const t of [
    ...windowTextures,
    storefrontTexture,
    groundTexture,
    pavingTexture,
    greenTexture,
  ]) {
    if (t) disposables.push(t);
  }

  // Buildings — merged, vertex-tinted, window-textured meshes, dressed with
  // the CW-18 signs and rooftop masts. One mesh per archetype (CW-25/CW-34):
  // the texture is per-material, so a facade look means a mesh to carry it.
  const buildingGeoms = Array.from({ length: FACADE_COUNT }, () => []);
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
  // CW-53: how many ground floors landed on each band. The distribution is the
  // only way to see whether the map data is biasing anything - a band nobody
  // uses and a band everybody uses look identical in a texture.
  const storefrontBands = new Array(STOREFRONT_VARIANTS.length).fill(0);
  // CW-74: where each ground floor's answer came from, and how many grounded
  // buildings carry a tag of their own at all. `ownTagged` minus
  // `ownTagHotel` is exactly what the picker used to THROW AWAY, because
  // `tourism=hotel` was the only own tag it ever read (CW-53).
  const storefrontSource = { own: 0, poi: 0, hash: 0, none: 0 };
  let storefrontOwnTagged = 0;
  let storefrontOwnTagHotel = 0;
  // CW-73: how the grammar actually landed on this city's data. A family
  // nobody reaches and a family everybody reaches look identical in a
  // texture, and the count of BLANK walls is the only way the "no half bay
  // at a corner" rule can be seen to have a cost.
  const facadeFamilyCounts = Object.fromEntries(
    Object.keys(FACADE_FAMILIES).map((k) => [k, 0])
  );
  // ...and WHICH FACE inside the family, because "169 apartment buildings"
  // and "169 apartment buildings wearing one face" are the same number until
  // this is counted.
  const facadeFaceCounts = Object.fromEntries(
    Object.keys(FACADE_FAMILIES).map((k) => [k, {}])
  );
  // CW-76: canopies, their legs, and the ones that legally get none.
  let canopyColumns = 0;
  let canopyColumnsRefused = 0;
  let canopyUnsupported = 0;
  let podiumsDrawn = 0;
  // Built once, and only where a canopy actually needs asking - the index
  // costs a pass over every road ribbon in the city.
  let canopyRoadways;
  const canopyRoadwayIndex = () => {
    if (canopyRoadways === undefined) {
      canopyRoadways = buildRoadwayIndex(model.roads ?? []);
    }
    return canopyRoadways;
  };
  let fittedWalls = 0;
  let blankWalls = 0;
  let wallMetres = 0;
  let blankMetres = 0;
  let shortWalls = 0;
  let levelsTagged = 0;
  // ★ The "no chopped top row" claim, MEASURED rather than asserted: how far
  // the worst wall vertex in the whole city sits from a row boundary. A shape
  // the fit was never told about - a roof shortening a body, a part standing
  // on another part - would show up here and nowhere else.
  let worstRowError = 0;
  let worstRowErrorId = null;
  const facadeFitSample = [];

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
    // ★★ CW-73: TYPE FIRST, MATERIAL SECOND, HASH ONLY AS THE TIEBREAK.
    //
    // The census says which buildings are which - 605 `apartments`, 266
    // `commercial`, 139 `retail` across the four extracts - and until this
    // release nothing read it, so a block of flats had the same chance of a
    // curtain wall as an office tower. The family narrows the choice; where a
    // material is also mapped the two are intersected (and the material wins
    // an empty intersection, because it describes the actual wall); the
    // building's own hash still picks which of the survivors it wears, so
    // `building=yes` - most of Albuquerque - looks exactly as it always has.
    const family = facadeFamilyFor(building.tags?.building);
    facadeFamilyCounts[family]++;
    const candidates = facadeCandidates(family, materialBias);
    const chosenName = candidates[h % candidates.length];
    facadeFaceCounts[family][chosenName] =
      (facadeFaceCounts[family][chosenName] ?? 0) + 1;
    // CW-63: a dressed landmark can ask for a facade family reserved for
    // dressings. The generic path above can only ever reach the nine, so no
    // ordinary building can land on one.
    const dressing = dressingFor(building.id);
    const dressedFacade = dressingFacadeIndex(dressing?.facade);
    const archetypeIndex =
      dressedFacade >= 0
        ? dressedFacade
        : (ARCHETYPE_INDEX_BY_NAME.get(chosenName) ?? 0);

    // CW-46 rider: the ground floor's HEIGHT is per building (hash within the
    // documented 3.2-5.0 m range). CW-73 hoists it above the volume loop,
    // because the window grid now has to know where the storefront ends
    // before it can fit rows into what is left.
    const storefrontHM = 3.2 + (((h >>> 9) % 10) / 9) * 1.8;
    const grounded =
      building.minHeightM === 0 && building.heightM >= storefrontHM + 1.5;
    // `building:levels` is a statement about the whole building, so it is
    // read once and applied to the body only - a rooftop plant room is not
    // six storeys tall because the tower under it is.
    // CW-74: set false when the building's own tag says it has no shopfront.
    let hasBand = true;
    const taggedLevels = Number.parseFloat(
      building.tags?.['building:levels'] ?? ''
    );
    const levels = Number.isFinite(taggedLevels) ? taggedLevels : null;
    if (levels !== null) levelsTagged++;
    const familySpec = FACADE_FAMILIES[family];
    // CW-26: where the parts really are the mass (they cover the outline)
    // they REPLACE it - extruding the outline as well would bury them inside
    // a plain box, the very thing Simple 3D Buildings exists to avoid. Where
    // they merely sit on it, BOTH are drawn, or a turret mapped onto a plain
    // hall would delete the hall and leave the turret hanging. Collision is
    // untouched either way: it reads outlines and never parts.
    // CW-63: an authored MASSING replaces the data's volumes outright - see
    // libraryPlatformGeometries for why that is the honest move for the one
    // building that has one.
    //
    // CW-76: where the parts cover the outline but NONE of them reaches the
    // ground, the outline is still what holds them up. It is drawn as a
    // podium from the pavement to the lowest part's base and the parts take
    // it from there, so Metropolitan Park West Tower stands on Seattle
    // instead of starting at 45 m. city-data decides the height; this only
    // draws it.
    const podium =
      building.partsAreMass && building.podiumToM > 0
        ? {
            ...building,
            heightM: building.podiumToM,
            minHeightM: 0,
            roof: null,
          }
        : null;
    const volumes = dressing?.massing
      ? []
      : building.partsAreMass
        ? podium
          ? [podium, ...building.parts]
          : building.parts
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
        // repetition CW-34 existed to remove, only at a coarser grain. The
        // phase moves in WHOLE BAYS and WHOLE ROWS (CW-46: the archetype's
        // own metre sizes), so no shift can put a half-height row of windows
        // at a ground line. It survives the merge because it is baked into
        // the vertex data rather than set on the material.
        const bayW = WINDOW_ARCHETYPES[archetypeIndex]?.bayWM ?? WINDOW_BAY_W_M;
        const bayH = WINDOW_ARCHETYPES[archetypeIndex]?.bayHM ?? WINDOW_BAY_H_M;
        const phaseU = ((h >>> 3) % WINDOW_TILE_BAYS_X) * bayW;
        const phaseV = ((h >>> 13) % WINDOW_TILE_BAYS_Y) * bayH;
        // ★ CW-73: the grid is FITTED to this volume, and only on the generic
        // path. A dressing's facade (the library's diagrid) is a continuous
        // lattice whose whole point is that it does not restart at a corner,
        // so it keeps the world-metre UVs it was designed against.
        //
        // The ground floor is reserved where a storefront will cover it. A
        // volume too short to give a row to anything else falls back to no
        // reservation rather than drawing nothing.
        //
        // Every volume is fitted to ITS OWN extent, not to the building's, so
        // a setback or a skybridge finishes on a full row too. That is also
        // why `building:levels` is only offered to a volume standing on the
        // ground: it counts storeys from the pavement, and the ground floor
        // it counts is the one the reservation takes away.
        const volumeBaseM = body.minHeightM ?? 0;
        const reserveM = grounded && volumeBaseM === 0 ? storefrontHM : 0;
        const volumeLevels =
          volume === building && volumeBaseM === 0 ? levels : null;
        const rowFit =
          dressedFacade >= 0
            ? null
            : (fitRows({
                heightM: body.heightM,
                baseM: volumeBaseM + reserveM,
                levels: volumeLevels,
                levelM: familySpec.levelM,
              }) ??
              fitRows({
                heightM: body.heightM,
                baseM: volumeBaseM,
                levels: volumeLevels,
                levelM: familySpec.levelM,
              }));
        // COUNTED, NOT ACTED ON. A volume shorter than one storey gets a row
        // of windows squashed into it, which is wrong and is left alone on
        // purpose: blanking those bands costs a fifth of Denver's facade. The
        // whole measurement is in facade-grammar.js beside the constant.
        if (rowFit?.tooShort) shortWalls++;
        const fitted = rowFit
          ? fitFacadeUv(geom, {
              bayWM: bayW,
              bayHM: bayH,
              bayPitchM: bayW,
              rowHeightM: rowFit.rowHeightM,
              baseM: rowFit.baseM,
              phaseU,
              phaseV,
            })
          : null;
        if (fitted) {
          fittedWalls += fitted.runs;
          blankWalls += fitted.blank;
          wallMetres += fitted.wallM;
          blankMetres += fitted.blankM;
          if (fitted.rowError > worstRowError) {
            worstRowError = fitted.rowError;
            worstRowErrorId = building.id;
          }
          if (facadeFitSample.length < 24) {
            facadeFitSample.push({
              id: building.id,
              type: building.tags?.building ?? null,
              family,
              face: chosenName,
              heightM: body.heightM,
              baseM: rowFit.baseM,
              levels: volumeLevels,
              rows: rowFit.rows,
              rowHeightM: rowFit.rowHeightM,
              walls: fitted.runs,
              blank: fitted.blank,
              rowError: fitted.rowError,
            });
          }
        } else {
          offsetGeometryUv(geom, phaseU, phaseV);
        }
        bucket.push(geom);
      }
      if (roof) bucket.push(roof);
      anyGeom = true;
    }

    /**
     * ★★ THE ONE HOOK (CW-63, CW-Q56). Everything above ran the generic path,
     * untouched, for every building in every city. A landmark with a dressing
     * row gets its authored geometry added HERE, into the same archetype
     * bucket, so it merges into the same buffer, wears the same material and
     * takes the same class id - and a city with no dressed landmark in it
     * (Denver, the control) never reaches this line at all.
     *
     * Additive on purpose: the Needle's thirteen parts are correct and are
     * left exactly as the data has them. Delete the row and the building goes
     * back to being ordinary, with nothing else to unpick.
     */
    if (dressing?.legs === 'needle-tripod') {
      const centre = ringCentroid(building.outer);
      for (const geom of needleTripodGeometries(
        centre,
        building.minHeightM,
        tint
      )) {
        buildingGeoms[archetypeIndex].push(geom);
        anyGeom = true;
      }
    }
    if (dressing?.massing === 'library-platforms') {
      for (const geom of libraryPlatformGeometries(building, tint)) {
        buildingGeoms[archetypeIndex].push(geom);
        anyGeom = true;
      }
    }

    // CW-76: a canopy standing over open ground gets legs. One over a
    // building does not - the building under it IS the support, and posts
    // through its roof would be the invention.
    if (building.canopy && building.canopy.source !== 'covered') {
      const legs = canopyColumnGeometries(building, tint, canopyRoadwayIndex());
      for (const geom of legs.geoms) buildingGeoms[archetypeIndex].push(geom);
      canopyColumns += legs.placed;
      canopyColumnsRefused += legs.refused;
      if (legs.placed === 0) canopyUnsupported++;
      else anyGeom = true;
    }
    if (podium) podiumsDrawn++;

    if (!anyGeom) return;

    // Grounded buildings tall enough to have an upstairs get the lit
    // storefront strip; elevated parts (skybridges) do not. The texture band
    // still spans one STOREFRONT_HEIGHT_M in v, so the strip's v is scaled to
    // fill its band exactly before the whole-band offset picks which look it
    // wears. `storefrontHM` and `grounded` are computed above, because CW-73's
    // window grid has to know where this band ends.
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
      // CW-74: the building's own tag decides first. Everything the picker
      // reads is counted, so a table nobody reaches and a table everybody
      // reaches do not look the same in the record.
      if (
        typeof building.tags?.shop === 'string' ||
        typeof building.tags?.amenity === 'string' ||
        typeof building.tags?.tourism === 'string'
      ) {
        storefrontOwnTagged++;
        if (building.tags?.tourism === 'hotel') storefrontOwnTagHotel++;
      }
      const choice = storefrontBandForBuilding(
        building.tags,
        poiIndex.nearestKind(cx, cy, STOREFRONT_POI_RANGE_M)
      );
      // ★ A BUILDING WITH NO SHOPFRONT GETS NO BAND AND NO SIGN. A car park
      // or a place of worship used to take a hashed shop window across its
      // base, which is the one answer the map data had already ruled out.
      if (choice.band === null) {
        storefrontSource.none++;
        hasBand = false;
      }
      const strip =
        choice.band === null
          ? null
          : extrudeBuilding(
              building,
              storefrontTemperatureTint(h, choice.kind),
              {
                depthOverride: storefrontHM,
              }
            );
      if (strip) {
        // THE SEED LAW (CW-34, held through CW-53): this is the SAME hash
        // draw it has always been; only the modulus widened with the set.
        const band = choice.band ?? (h >>> 23) % STOREFRONT_VARIANTS.length;
        storefrontSource[choice.source]++;
        storefrontBands[band]++;
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
      hasBand &&
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
  // CW-60: a style can hide or retint the buildings, which needs the meshes
  // themselves and not only their materials.
  const buildingMeshRefs = [];
  // CW-41: every material filtered for the cell raster, so one setter can
  // follow the character size.
  const cellRasterMats = [];
  buildingGeoms.forEach((geoms, familyIndex) => {
    if (geoms.length === 0) return;
    const merged = mergeGeometries(geoms, false);
    for (const geom of geoms) geom.dispose();
    const material = new MeshLambertMaterial({
      color: BUILDING_STREET_TINT,
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
    buildingMeshRefs.push({ mesh, material });
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
  let roadMeshRef = null;
  let sidewalkMeshRef = null;
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
    roadMeshRef = makeFlatMesh(roadPositions, roadMat, 'roads', roadColors);
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
    sidewalkMeshRef = makeFlatMesh(
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
  let greenMeshRef = null;
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
      map: greenTexture ?? null,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    // CW-41/CW-51: any texture the converter samples rides the cell-raster
    // filter, and D-111 is what happens when it is filtered but never pushed
    // to the list - the shader carries a bias uniform nothing writes.
    applyCellRasterFiltering(greenMat);
    cellRasterMats.push(greenMat);
    greenMeshRef = new Mesh(merged, greenMat);
    greenMeshRef.name = 'greens';
    group.add(greenMeshRef);
    disposables.push(merged, greenMat);
    roadTriangles += merged.index
      ? merged.index.count / 3
      : merged.getAttribute('position').count / 3;
  }

  /**
   * ★★ THE WAYFINDING LAYER, RENDERED FOR THE FIRST TIME (CW-60).
   *
   * CW-43 parsed crossings, kerbs and tactile paving into `model.wayfinding`
   * and drew none of it - the record at the time said so plainly, that the
   * typed points ride the model for a future feature. This is that feature,
   * and the mission sentence is what it serves: wayfinding information for a
   * blind traveler, finally visible on the map rather than only in the data.
   *
   * Marks are built at a UNIT size and scaled per frame by the map's zoom,
   * because a mark has to be a SCREEN size (see city-map-styles.js). One
   * merged mesh per kind so each can carry its own brightness, and so the
   * three can be told apart at a size where shape cannot survive.
   */
  const wayfindMeshes = [];
  const wayfindCounts = {};
  {
    const byKind = new Map();
    for (const point of model.wayfinding ?? []) {
      const list = byKind.get(point.kind) ?? [];
      list.push(point);
      byKind.set(point.kind, list);
    }
    for (const [kind, points] of byKind) {
      const positions = [];
      for (const { x, y } of points) {
        // ★ LIFTED ABOVE THE ROAD, and the first version was not. Built at
        // z = 0 the marks sat UNDER the road surface, which rides at
        // ROAD_LIFT_M, and the style photographed as a dimmed map with
        // nothing on it at all. Seen from straight overhead, a hair too low
        // is the same as not existing.
        const h = 0.5;
        const z = WAYFIND_LIFT_M;
        positions.push(
          x - h,
          y - h,
          z,
          x + h,
          y - h,
          z,
          x + h,
          y + h,
          z,
          x - h,
          y - h,
          z,
          x + h,
          y + h,
          z,
          x - h,
          y + h,
          z
        );
      }
      if (positions.length === 0) continue;
      const tier = wayfindTierOf(kind);
      const mat = new MeshBasicMaterial({
        color: new Color(tier, tier, tier),
        // Flat marks over a flat road: without an offset of their own these
        // z-fight in the surface-id buffer, which is D-110 exactly.
        polygonOffset: true,
        polygonOffsetFactor: -6,
        polygonOffsetUnits: -6,
      });
      const geom = new BufferGeometry();
      geom.setAttribute(
        'position',
        new BufferAttribute(new Float32Array(positions), 3)
      );
      const normals = new Float32Array(positions.length);
      for (let i = 0; i < normals.length; i += 3) normals[i + 2] = 1;
      geom.setAttribute('normal', new BufferAttribute(normals, 3));
      const mesh = new Mesh(geom, mat);
      // Borrows the SIGN voice: a small bright mark that means something,
      // which is what a sign face already is. The span table is FULL.
      mesh.name = 'wayfinding-marks';
      mesh.visible = false;
      mesh.renderOrder = 3;
      // The unit square is centred on the point, so scaling the MESH about
      // the world origin would slide every mark. Each mark is instead built
      // around its own centre and the mesh scaled about that centre per
      // frame - see setMapZoom below.
      mesh.userData.wayfindKind = kind;
      mesh.userData.points = points;
      mesh.userData.geom = geom;
      group.add(mesh);
      disposables.push(geom, mat);
      wayfindMeshes.push(mesh);
      wayfindCounts[kind] = points.length;
    }
  }

  let currentStyleId = DEFAULT_MAP_STYLE;
  /**
   * The zoom the marks were last BUILT for. Rewriting five thousand quads is
   * cheap once and not cheap sixty times a second, and a held zoom key calls
   * the map camera every frame, so the work is skipped when the number has
   * not moved. null forces a rebuild, which is what a style change wants:
   * the marks may have been invisible, and therefore skipped, at this very
   * zoom a moment ago.
   */
  let wayfindBuiltZoom = null;

  /**
   * Put one style's visibility and tones onto the layers. Only ever called
   * while the map is showing.
   */
  const applyMapStyle = (styleId) => {
    const style = mapStyleById(styleId);
    const put = (mesh, mat, layer, mapTone) => {
      if (mesh) mesh.visible = layer.show;
      if (mat) mat.color = new Color(layer.tone ?? mapTone);
    };
    put(roadMeshRef, roadMat, style.roads, ROAD_TONES.map);
    put(sidewalkMeshRef, sidewalkMat, style.sidewalks, SIDEWALK_TONES.map);
    put(greenMeshRef, greenMat, style.greens, GREEN_TONES.map);
    for (const { mesh, material } of buildingMeshRefs) {
      mesh.visible = style.buildings.show;
      // A building's tone is per-family vertex colour, so a style tints the
      // material rather than replacing a single colour.
      material.color = new Color(style.buildings.tone ?? BUILDING_STREET_TINT);
    }
    for (const mesh of wayfindMeshes) mesh.visible = style.wayfinding.show;
  };

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
      if (!isMap) {
        // Leaving the map puts every layer back the way the street expects,
        // whatever style was showing. A style is a MAP state and nothing
        // else, which is why street view never has to know about it.
        //
        // ★★ D-114: THAT SENTENCE WAS FALSE FOR ONE LAYER, AND IT WAS THE
        // ONE THIS FUNCTION DOES NOT OWN A LINE FOR. The three ribbon
        // materials above are re-toned every call, and the buildings are
        // not: this branch restored their TEXTURE and their VISIBILITY and
        // left `material.color` wherever `applyMapStyle` put it. Measured
        // street ink, Seattle at the spawn: 22.28 before any map, 18.65
        // after a look at Buildings only, and 13.54 - THIRTY-NINE PER CENT
        // DIMMER, for the rest of the session - after a look at Wayfinding.
        // A style is a map state, so the map has to hand it back.
        for (const mesh of wayfindMeshes) mesh.visible = false;
        if (roadMeshRef) roadMeshRef.visible = true;
        if (sidewalkMeshRef) sidewalkMeshRef.visible = true;
        if (greenMeshRef) greenMeshRef.visible = true;
        for (const { mesh, material } of buildingMeshRefs) {
          mesh.visible = true;
          material.color = new Color(BUILDING_STREET_TINT);
        }
      } else {
        applyMapStyle(currentStyleId);
      }
    },

    /**
     * CW-60: the SECOND axis over the map. `setMapView` decides street or
     * map; this decides which of the four maps. Tones and visibility only -
     * no geometry is rebuilt - so switching is free and cannot drift out of
     * step with the street view.
     * @param {string} styleId
     */
    setMapStyle(styleId) {
      currentStyleId = mapStyleById(styleId).id;
      applyMapStyle(currentStyleId);
      // A layer that was hidden was also being skipped by setMapZoom, so the
      // marks it is about to show may be built for some older zoom entirely.
      wayfindBuiltZoom = null;
    },

    /**
     * CW-60: a wayfinding mark is a SCREEN size, so the map's zoom has to
     * reach it. Called from the map's own frame step.
     * @param {number} zoom
     */
    setMapZoom(zoom) {
      if (wayfindMeshes.length === 0) return;
      if (wayfindBuiltZoom === zoom) return;
      wayfindBuiltZoom = zoom;
      const b = model.boundsM;
      const spanM = Math.max(b.maxX - b.minX, b.maxY - b.minY, 100);
      const size = wayfindMarkSizeM(zoom, spanM);
      for (const mesh of wayfindMeshes) {
        if (!mesh.visible) continue;
        const points = mesh.userData.points;
        const pos = mesh.geometry.getAttribute('position');
        const h = size / 2;
        for (let i = 0; i < points.length; i++) {
          const { x, y } = points[i];
          const o = i * 18;
          const quad = [
            x - h,
            y - h,
            x + h,
            y - h,
            x + h,
            y + h,
            x - h,
            y - h,
            x + h,
            y + h,
            x - h,
            y + h,
          ];
          for (let v = 0; v < 6; v++) {
            pos.array[o + v * 3] = quad[v * 2];
            pos.array[o + v * 3 + 1] = quad[v * 2 + 1];
          }
        }
        pos.needsUpdate = true;
      }
    },
    /**
     * CW-41: follow the character size. The bias makes the facade texture's
     * effective texel one CELL (log2 of the cell height, the axis the
     * window rows beat against); at 0 the filtering is exactly stock.
     * @param {number} cellHPx - cell height in canvas pixels
     */
    /**
     * CW-70: repaint the shopfront bands at a new brightness.
     *
     * The bands are the brightest thing the city paints, and at 0.93-0.95 they
     * are what turns a lit ground floor into a solid block once the converter
     * has read them. This is the scene half of the game's luminance-layer
     * switch; the converter half is the reverse-video threshold and its share
     * cap.
     *
     * @param {number} scale 1 is what the art direction paints
     * @returns {number} the brightness now painted
     */
    setStorefrontBrightness(scale) {
      if (!storefrontTexture?.image) return 1;
      const applied = paintStorefrontCanvas(storefrontTexture.image, scale);
      storefrontTexture.needsUpdate = true;
      return applied;
    },
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
      storefrontBands,
      storefrontSource,
      storefrontOwnTagged,
      storefrontOwnTagHotel,
      facadeFamilyCounts,
      facadeFaceCounts,
      canopyColumns,
      canopyColumnsRefused,
      canopyUnsupported,
      podiumsDrawn,
      fittedWalls,
      blankWalls,
      wallMetres,
      blankMetres,
      shortWalls,
      levelsTagged,
      worstRowError,
      worstRowErrorId,
      facadeFitSample,
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

/**
 * CW-54: a car has wheels, and they are the only thing touching the ground.
 *
 * Until now the body box sat flush on z=0, which is why a parked row read as a
 * low dotted mass rather than as cars (the directive's item 7). The body lifts
 * onto a clearance and four wheels carry it, so there is a gap under every car
 * for the light to fail to reach - at character scale that shadow line is what
 * says "vehicle" long before any wheel is resolvable.
 *
 * Clearances and radii are segment-typical: a crew-cab pickup and a three-row
 * SUV ride higher than a sedan, which is why they get their own numbers rather
 * than one figure for everything.
 *
 * THE WHEEL IS A BOX, and that is a measured choice rather than a lazy one.
 * MEASURED: this city carries 7,900-odd cars between the parked rows and the
 * frozen traffic, so every triangle on a wheel costs about 31,600 of them. A
 * six-sided capped cylinder is 24 triangles and would add 758,000 to a scene
 * that stands at 1,245,615; a box is 12 and adds 379,000. At the sizes this
 * game is played at a wheel is about a pixel, and the proof gate photographs
 * decide whether that pixel needs to be round. One line to change the
 * primitive if they ever say it does.
 */
const CAR_CLEARANCE_M = { pickup: 0.28, suv: 0.28, default: 0.2 };
const CAR_WHEEL_RADIUS_M = { pickup: 0.38, suv: 0.36, default: 0.32 };
const CAR_WHEEL_WIDTH_M = 0.22;
// Wheels sit at the corners, about where a real wheelbase puts them, and
// INBOARD OF THE FLANKS BY MORE THAN HALF THEIR OWN WIDTH. The first form of
// this used a 0.1 m inset with a 0.22 m wheel, which stands 1 cm proud of the
// bodywork - and the parked-car guard caught it immediately, because a car
// that is wider than its class table is a car that can cross the curb line.
const CAR_WHEELBASE_SHARE = 0.36;
const CAR_WHEEL_INSET_M = 0.13;

/** The ride height and wheel size a class was measured for. */
function carAnatomy(kind) {
  return {
    clearanceM: CAR_CLEARANCE_M[kind] ?? CAR_CLEARANCE_M.default,
    wheelRadiusM: CAR_WHEEL_RADIUS_M[kind] ?? CAR_WHEEL_RADIUS_M.default,
  };
}

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
function pushCarClassGeoms(
  list,
  cls,
  x,
  y,
  angle,
  bodyTint,
  cabinTint,
  wheelTint,
  lamps = false
) {
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
  // CW-54: the body starts at the clearance, not at the ground, and the four
  // wheels below it are the only things that touch z=0.
  const { clearanceM, wheelRadiusM } = carAnatomy(cls.kind);
  const bodyH = cls.bodyM - clearanceM;
  box(cls.lenM, cls.widM, bodyH, 0, 0, clearanceM + bodyH / 2, bodyTint);
  for (const along of [1, -1]) {
    for (const across of [1, -1]) {
      box(
        wheelRadiusM * 2,
        CAR_WHEEL_WIDTH_M,
        wheelRadiusM * 2,
        along * cls.lenM * CAR_WHEELBASE_SHARE,
        across * (cls.widM / 2 - CAR_WHEEL_INSET_M),
        wheelRadiusM,
        wheelTint
      );
    }
  }
  if (lamps) {
    // A pair at each end, set in from the flanks, at about bumper height.
    const lampZ = clearanceM + bodyH * 0.55;
    const lampAcross = cls.widM / 2 - CAR_LAMP_SIZE_M;
    for (const across of [1, -1]) {
      box(
        CAR_LAMP_SIZE_M,
        CAR_LAMP_SIZE_M,
        CAR_LAMP_SIZE_M,
        cls.lenM / 2,
        across * lampAcross,
        lampZ,
        CAR_HEADLAMP_TINT
      );
      box(
        CAR_LAMP_SIZE_M,
        CAR_LAMP_SIZE_M,
        CAR_LAMP_SIZE_M,
        -cls.lenM / 2,
        across * lampAcross,
        lampZ,
        CAR_TAILLAMP_TINT
      );
    }
  }
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
// CW-75: how far a mapped crossing reaches. A person standing on tarmac is a
// mistake everywhere except here, where it is somebody crossing the road -
// and OpenStreetMap says exactly where those are.
const CROSSING_REACH_M = 12;
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

// CW-75 retired TRAFFIC_LANE_INSET_M (a flat 1.6 m from the kerb, which put
// a moving car 0.10 m from a parked one on every road this game parks on).
// The lane is derived from the road's own width by `laneLayoutFor` below.
const TRAFFIC_MIN_SPACING_M = 9;
const TRAFFIC_END_MARGIN_M = 6;

const CAR_ROAD_KINDS = new Set([
  'residential',
  'tertiary',
  'secondary',
  'unclassified',
  'living_street',
]);

/**
 * The widest car the class table holds (CW-75). A parking bay and a travel
 * lane each have to hold one, so the lane arithmetic below is written in
 * terms of the table rather than a number somebody typed.
 */
const CAR_MAX_HALF_W_M = Math.max(...CAR_CLASSES.map((cls) => cls.widM)) / 2;

/**
 * ★ HOW A ROADWAY DIVIDES INTO A PARKING BAY AND A TRAVEL LANE (CW-75).
 *
 * The frozen traffic used to sit a flat 1.6 m in from the kerb and the parked
 * row 1.5 m in, which put the two CENTRES 0.10 m apart on every road class
 * this game parks on - the whole "cars clip through each other" complaint, by
 * construction rather than by accident. Parked cars never overlapped each
 * other; a moving car was simply parked on top of them.
 *
 * So the lane is derived instead of assumed. The parked row keeps exactly the
 * place it has always had, one car-half inside the kerb, and the travel lanes
 * take what is left between it and the centreline:
 *
 *   - two lanes, one each side of the centreline, when the free strip holds
 *     two car widths;
 *   - one lane down the middle, shared by both directions, when it holds one -
 *     which is what an 8 m residential street with cars parked on both sides
 *     really is;
 *   - no parking at all when the free strip cannot hold a car even so, and
 *     the road gives its whole width to traffic.
 *
 * @param {{widthM?: number}} road
 * @returns {{parks: boolean, laneOffsetM: number, sharedLane: boolean, hasTraffic: boolean}}
 */
function laneLayoutFor(road) {
  const halfM = (road?.widthM ?? 0) / 2;
  const kerbFreeM = halfM - CURB_WIDTH_M;
  // Unchanged: the parked row's own centre.
  const parkedCentreM = halfM - CURB_WIDTH_M - 1;
  // Tarmac between the centreline and the parked row's inner flank.
  const parkedFreeM = parkedCentreM - CAR_MAX_HALF_W_M;
  const parks = parkedCentreM >= 0.8 && parkedFreeM >= CAR_MAX_HALF_W_M;
  const freeM = parks ? parkedFreeM : kerbFreeM;
  if (freeM >= CAR_MAX_HALF_W_M * 2) {
    return {
      parks,
      laneOffsetM: freeM / 2,
      sharedLane: false,
      hasTraffic: true,
    };
  }
  if (freeM >= CAR_MAX_HALF_W_M) {
    return { parks, laneOffsetM: 0, sharedLane: true, hasTraffic: true };
  }
  return { parks, laneOffsetM: 0, sharedLane: false, hasTraffic: false };
}
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
// CW-56 moved the tree's own dimensions into city-trees.js, where a species
// decides them. This one stays because the infill clearance check still asks
// how wide a trunk is before it plants one.
const TRUNK_SIDE_M = 0.3;
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
export const CAR_TIERS = [0.35, 0.5, 0.65, 0.8];
const CAR_CHROMA = 0.5;
export const CAR_CABIN_LIFT = 0.12;

/**
 * CW-54: the greenhouse is GLASS, and glass is the same colour on every car.
 *
 * The cabin already sat a ladder step above the body (CAR_CABIN_LIFT), but it
 * took the car's own paint hue, so a red car had red windows. It takes one
 * fixed cool tint now, which is what separates a windscreen from the wing
 * beside it.
 *
 * MONO IS UNTOUCHED BY DESIGN, and that is why this goes through
 * inGamutChroma rather than CAR_CHROMA: tintOf's luminance promise holds only
 * while nothing clamps, so an in-gamut chroma keeps the cabin at exactly
 * 0.47 / 0.62 / 0.77 / 0.92 - the same four numbers a monochrome screen read
 * before. Only the colour schemes can tell the difference.
 *
 * MEASURED at hue 195, encoded the way D-112 says to measure: the tint lands a
 * cool entry from chroma 0.140 at the darkest cabin, 0.190 at the next and
 * 0.235 at the third, so 0.30 clears all three with room and is about as grey
 * as this can be and still be glass. THE BRIGHTEST CABIN CANNOT READ COOL AT
 * ALL: at 0.92 the gamut caps chroma at 0.204, below the 0.235 it would need,
 * so a top-tier windscreen lands white. That is a fact about where the ladder
 * puts it rather than a number to tune - and a bright windscreen reading white
 * is what a bright windscreen does.
 */
const CAR_GLASS_HUE_DEG = 195;
const CAR_GLASS_CHROMA = 0.3;

/** One cabin tint, from the cabin's own tier - never from the paint. */
export function glassTint(tier) {
  const cabin = Math.min(1, tier + CAR_CABIN_LIFT);
  return tintOf(
    cabin,
    CAR_GLASS_HUE_DEG,
    inGamutChroma(cabin, CAR_GLASS_HUE_DEG, CAR_GLASS_CHROMA)
  );
}

/**
 * CW-54: tyres are SLIGHTLY dimmer than the body they carry (the owner's
 * word), and floored so the darkest cars keep wheels that read.
 *
 * The floor is the lesson CW-45 paid for: a dark tier on black pavement
 * vanishes, and a wheel that vanishes takes the shadow line with it - which is
 * the whole point of lifting the body. The proof gate's photographs decide
 * whether 0.3 is high enough; one line to move it.
 */
const CAR_TYRE_DROP = 0.15;
const CAR_TYRE_FLOOR = 0.3;

/**
 * CW-54: head and tail lamps, on the cars that are supposed to be driving.
 *
 * The luminance ladder decides these numbers, not taste. A lit shopfront is
 * reserved the 0.93-0.95 band and a sign plate sits at 0.97; the monochrome
 * reverse-video threshold is 0.80, and a cell has to cross it to read as a
 * LIT POINT rather than as a bright grey.
 *
 * MEASURED, and it moved the number: the brightest paint already on a car is
 * a top-tier cabin at 0.92 (CAR_TIERS tops out at 0.8 and CAR_CABIN_LIFT adds
 * 0.12), so a head lamp at the 0.90 this was first written at would have been
 * DIMMER than the brightest bodywork in the street. It sits at 0.92 instead -
 * the top of the band cars are allowed - and it cannot go higher without
 * invading the storefront reserve, which is a reserved-band question and not
 * this release's to answer. A tail lamp is dimmer because a tail light is.
 *
 * Both go through inGamutChroma. tintOf CLAMPS, and a clamped channel silently
 * voids the luminance it promised (CW-49's lesson: heads use it, torso and legs
 * do not). A saturated red at this brightness is exactly the case that breaks -
 * it wants 1.26 in the red channel - so the chroma asked for is the chroma the
 * tier can actually carry.
 *
 * AND THAT CHROMA IS MEASURED IN LINEAR LIGHT, WHILE THE PALETTE MATCH HAPPENS
 * AFTER THE OUTPUT ENCODING (D-112). The tail tier was 0.85, whose in-gamut
 * tint is a linear 1 / 0.8095 / 0.8095 - decisively red through
 * pickPaletteIndex. But the converter reads the ENCODED canvas, where sRGB's
 * toe lifts 0.8095 to 0.910; raised to the scheme's chromaBoost of 5 that is
 * 0.624, past the 0.6 at which WHITE beats RED. Photographed at nine metres,
 * 233 of the 390 pixels a tail lamp owns came back #ffffff - a second pair of
 * head lamps. Read off the frame, the flip sits between 0.835 and 0.839; the
 * reverse-video floor is 0.80; so a red brake light lives in a window about
 * three and a half hundredths wide and 0.82 is the middle of it.
 *
 * The head lamp lands WHITE by the same arithmetic, and that is left alone: a
 * head lamp is white.
 *
 * ONLY THE FROZEN TRAFFIC IS LIT. Parked cars are parked: their lamps are off,
 * which is also what stops a kerbside row from becoming a string of bright
 * points along every street. One line to light them too.
 */
const CAR_LAMP_SIZE_M = 0.16;
const CAR_HEADLAMP_TIER = 0.92;
const CAR_HEADLAMP_HUE_DEG = 50;
const CAR_HEADLAMP_CHROMA = 0.18;
const CAR_TAILLAMP_TIER = 0.82;
const CAR_TAILLAMP_HUE_DEG = 0;
const CAR_TAILLAMP_CHROMA = 0.75;

/** The two lamp tints, computed once - they never vary by car. */
export const CAR_HEADLAMP_TINT = tintOf(
  CAR_HEADLAMP_TIER,
  CAR_HEADLAMP_HUE_DEG,
  inGamutChroma(CAR_HEADLAMP_TIER, CAR_HEADLAMP_HUE_DEG, CAR_HEADLAMP_CHROMA)
);
export const CAR_TAILLAMP_TINT = tintOf(
  CAR_TAILLAMP_TIER,
  CAR_TAILLAMP_HUE_DEG,
  inGamutChroma(CAR_TAILLAMP_TIER, CAR_TAILLAMP_HUE_DEG, CAR_TAILLAMP_CHROMA)
);

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

/**
 * CW-57 (CW-Q55): what a planting is made of.
 *
 * The box and the table are dim, near-neutral objects - stone and timber -
 * because their identity is SHAPE and POSITION (the hydrant lesson). The
 * flowers are the only bright thing, and they ride on a separate lid so the
 * box's own brightness never changes with them: a monochrome screen sees one
 * knee-high block whatever is growing in it.
 */
const PLANTER_BODY_TINT = tintOf(0.3, 40, 0.08);
const TABLE_TINT = tintOf(0.38, 30, 0.25);
const FLOWER_TIER = 0.55;
const FLOWER_CHROMA = 0.6;
/**
 * CW-57's flowerbed tone. BRIGHTER than the ground band on purpose, and the
 * release record measures whether that carpets: the carpet law is about a
 * SURFACE, and a bed at 56 mapped places in Seattle is not one. CW-56's
 * fallen leaves, which sat under 4,593 trees, were.
 */
const BED_TIER = 0.45;
const BED_CHROMA = 0.5;

/**
 * CW-58's birds.
 *
 * A bird is TINY - a sparrow is 0.15 m against a planter's 1.2 - so it was
 * natural to reach for brightness as the lever. THE PROOF GATE SAYS THERE IS
 * NO SUCH LEVER: a per-species brightness bias moved the frame by nothing in
 * mono across its whole range, and in colour every species landed #ffffff
 * because these palettes have no dark neutral. See city-birds.js for both
 * measurements. Every bird therefore takes ONE tier, and what distinguishes
 * them is size, shape and where they rest.
 *
 * ★ THE CROW'S DARKNESS IS WHY IT IS PLACED HIGH, and CW-57 is what makes
 * that a measurement rather than a preference: this city's greenspace sits at
 * luminance under a tenth and a texture cannot lift it, so a dark bird on a
 * lawn is a dark shape on a near-black field. `SPECIES_PERCHES` keeps the crow
 * on parapets and lamp heads, where the sky is behind it.
 */
const BIRD_TIER = 0.68;
const BIRD_HUE_DEG = 45;
const BIRD_CHROMA = 0.14;
/** How many perches of a kind carry a bird. Punctuation, not a flock. */
const BIRD_PER_PERCH = {
  'bench-back': 0.09,
  'picnic-top': 0.14,
  'planter-rim': 0.1,
  'lamp-head': 0.06,
  parapet: 0.05,
  ground: 0.12,
  'open-ground': 0.035,
};
/** A gathering of geese, not a lone one: 2 to 5 on the same patch of grass. */
const GOOSE_FLOCK_MAX = 4;
const GOOSE_SPACING_M = 1.9;

/**
 * ★ THE FALLBACK, AND IT IS STATED AS ONE. Denver and Albuquerque have ZERO
 * mapped planters and zero flowerbeds - measured, not assumed, in CW-55's
 * rebake. The directive licenses filling that gap; this is where, and the code
 * says out loud that it is design rather than data.
 *
 * Planters go INSIDE mapped green polygons, at roughly one per this many
 * square metres, which is ordinary parks-department planting-bed spacing for a
 * civic bed. Real data always wins: a city with mapped planters never reaches
 * this branch, so Seattle's eleven and Burnaby's four are its own.
 *
 * One line to reverse - set it to 0 and those two cities have no planters,
 * which is what their maps actually say.
 */
const FALLBACK_PLANTER_PER_M2 = 900;
const FALLBACK_PLANTER_MAX = 40;
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
  // CW-77: a pedestrian street is the most heavily lit street a city has -
  // Seattle's own standard gives it a luminaire every 60 ft - and this game
  // gave it none at all, because the set above was written from the classes
  // that carry cars. Post Alley was unlit until this release.
  'pedestrian',
]);
// CW-77: spacing by road class, from Seattle Streets Illustrated 3.6 (the
// city's own lighting standard) rather than one number for every street:
//
//   * a street 50 ft (15.2 m) wide or less gets street lights ALTERNATING
//     every 180 ft (55 m), so one side and then the other;
//   * a wider street gets OPPOSITE PAIRS every 250 ft (76 m), both sides at
//     the same station;
//   * a pedestrian street gets pedestrian luminaires every 60 ft (18 m),
//     which is why a shopping street reads as lit and a back street does not.
//
// ★ THE WIDE RULE DOES NOT FIRE IN THESE FOUR CITIES, and saying so is the
// point. Every road class this game lights is 14 m or narrower in
// ROAD_WIDTHS_M (primary and trunk are the widest at 14), and the two classes
// that would exceed 15 m - motorway and trunk - are deliberately unlit since
// CW-18. The rule is implemented against the WIDTH, which is the standard's
// own criterion, so a future width change or a new class reaches it without
// anyone remembering to; a unit test drives it with an 18 m road, because a
// rule nothing exercises is a rule nobody has tested (CW-74).
//
// ★★ AND THE ORDINARY-STREET INTERVAL IS 18 m, NOT 55, BECAUSE HALF A
// SENTENCE IS NOT A STANDARD. The release plan quoted "street lights
// alternating every 180 ft" and stopped there; the standard's own sentence
// continues "...pedestrian lights between them at 60 ft". A walker on a lit
// Seattle street therefore passes a luminaire every 18 m, and the two things
// that can be checked against the world both say so:
//
//   * Seattle City Light's surveyed register measures a median
//     nearest-neighbour spacing of 16.7 m over 3,679 lit poles.
//   * At 55 m the three cities with no such register lose 40 % of their
//     lamps (Albuquerque 915 -> 545, Burnaby 531 -> 352), and the CW-45 bird
//     pin fires: Albuquerque's roadrunner falls 13 -> 5 against a 40 % lamp
//     cut, which is a DISPROPORTIONATE loss and exactly the starvation that
//     pin was written to catch. At 18 m it is 23.
//
// So 55 m is the interval of one KIND of lamp, not the interval of light. The
// game draws one kind of pole, so it draws them at the interval a walker
// actually meets one. Reversal: set this to 55 and re-run the bird pins.
const LAMP_WIDE_STREET_M = 15.2;
const LAMP_SPACING_NARROW_M = 18;
const LAMP_SPACING_WIDE_M = 76;
const LAMP_SPACING_PEDESTRIAN_M = 18;
const LAMP_END_MARGIN_M = 4;

/**
 * How this road is lit: the interval, and whether the two sides alternate or
 * stand opposite each other.
 *
 * @param {{kind:string, widthM:number}} road
 * @returns {{spacingM:number, paired:boolean}}
 */
export function lampLayoutFor(road) {
  if (road.kind === 'pedestrian' || road.kind === 'living_street') {
    return { spacingM: LAMP_SPACING_PEDESTRIAN_M, paired: false };
  }
  // The two intervals are the same number today and are kept apart on
  // purpose: one is a pedestrian luminaire's own spacing and the other is
  // what an ordinary street works out to once its pedestrian lights are
  // counted. If either moves, it moves alone.
  if ((road.widthM ?? 0) > LAMP_WIDE_STREET_M) {
    return { spacingM: LAMP_SPACING_WIDE_M, paired: true };
  }
  return { spacingM: LAMP_SPACING_NARROW_M, paired: false };
}

// A mapped lamp CLAIMS ONE FULL INTERVAL around it: the procedural stream
// exists to light a street the map is silent about, not to double up on one
// it has already described. The claim is the street's own interval rather
// than a fixed distance, so the rule means the same thing on a pedestrian
// street and on an arterial.
//
// ★ A SHARE OF THE INTERVAL IS NOT ENOUGH, and a unit test said so. At 0.6 a
// street whose map gives a lamp every 25 m has slots 12.5 m from the nearest
// mapped one - outside a 10.8 m claim - so the stream filled a street that
// was already fully described. One interval is the honest radius: where the
// map has spoken within an interval, it has spoken.
const LAMP_CLAIM_SHARE = 1;
// makePointGrid only searches its own cell and the ring around it, so the
// cell has to be at least as big as the widest question anyone asks of it -
// which is the widest interval in the table, not the one this city uses.
const LAMP_CLAIM_CELL_M = 80;

// ★ A SURVEYED POLE IS NOT IN THE ROAD; OUR RIBBON IS TOO WIDE. Seattle City
// Light's register puts 572 of its 3,679 lit poles inside a ribbon this game
// draws - and City Light does not stand poles in traffic lanes. Measured, the
// disagreement is small on ordinary streets (p50 0.8-1.3 m inside on
// secondary, residential and service) and large on the freeway (p50 4.9 m on
// motorway, 5.5 m on trunk), where I-5 runs below grade and the game draws a
// flat 16 m band across it.
//
// So a mapped lamp shallowly inside a ribbon is NUDGED out to the kerb along
// the ribbon's own outward normal - our approximation yields to the survey -
// and one deeper than this is dropped and counted, because there the two are
// not disagreeing by a metre, they are describing different worlds. The
// threshold is the roadway index's own slack, past which it refuses to answer
// at all.
const LAMP_NUDGE_MAX_M = 2;
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

/**
 * ★ WHERE THE CARS ARE, AS RECTANGLES (CW-75).
 *
 * `makePointGrid` answers "is anything within N metres", which is the right
 * question for a row of parked cars sharing a kerb and the WRONG one for a
 * moving car in the next lane. MEASURED on Seattle: entering the frozen
 * traffic into the parked stream's 6 m point grid does take the last car-on-
 * car overlap out, and it costs 856 parked cars and 401 traffic cars to do
 * it - because a radius cannot tell "two metres to the side, which is a lane"
 * from "two metres along, which is a collision".
 *
 * So the streams share this instead: the same spatial buckets, but the test
 * is the true rectangle overlap the census scores them on. Same zero, 66
 * refusals instead of 1,257.
 *
 * @param {number} cellM
 */
function makeFootprintGrid(cellM) {
  const buckets = new Map();
  const key = (cx, cy) => cx + ',' + cy;
  const spanOf = (rect) =>
    Math.hypot(rect.halfLengthM ?? 0, rect.halfWidthM ?? 0);
  return {
    add(rect) {
      const reach = spanOf(rect);
      const cx0 = Math.floor((rect.x - reach) / cellM);
      const cx1 = Math.floor((rect.x + reach) / cellM);
      const cy0 = Math.floor((rect.y - reach) / cellM);
      const cy1 = Math.floor((rect.y + reach) / cellM);
      for (let gy = cy0; gy <= cy1; gy++) {
        for (let gx = cx0; gx <= cx1; gx++) {
          const k = key(gx, gy);
          const list = buckets.get(k);
          if (list) list.push(rect);
          else buckets.set(k, [rect]);
        }
      }
    },
    /** @returns {boolean} whether `rect` overlaps anything already added */
    overlaps(rect) {
      const reach = spanOf(rect);
      const cx0 = Math.floor((rect.x - reach) / cellM);
      const cx1 = Math.floor((rect.x + reach) / cellM);
      const cy0 = Math.floor((rect.y - reach) / cellM);
      const cy1 = Math.floor((rect.y + reach) / cellM);
      for (let gy = cy0; gy <= cy1; gy++) {
        for (let gx = cx0; gx <= cx1; gx++) {
          for (const other of buckets.get(key(gx, gy)) ?? []) {
            if (rectsOverlap(rect, other)) return true;
          }
        }
      }
      return false;
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
  // CW-56: what actually got planted, per species. A table nobody uses and a
  // table everybody uses look identical in a merged mesh (CW-53's lesson),
  // so the build counts its own.
  const speciesPlanted = {};
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
  // CW-57: plantings and tables, each its own merged mesh so the class pass
  // can dress them in their own voices.
  const planterGeoms = [];
  const flowerGeoms = [];
  const tableGeoms = [];
  const bedPositions = [];
  const plantingPlaced = { planter: 0, flowerbed: 0, picnic_table: 0 };
  let fallbackPlanters = 0;

  const b = model.boundsM;
  const inCore = (x, y) =>
    x >= b.minX - PROP_MARGIN_M &&
    x <= b.maxX + PROP_MARGIN_M &&
    y >= b.minY - PROP_MARGIN_M &&
    y <= b.maxY + PROP_MARGIN_M;
  const isBlocked = (x, y) => (collision ? collision.isBlocked(x, y) : false);

  // ★ CW-75: ONE index of every drawn roadway, shared by every stream below.
  //
  // Each stream used to know about exactly one road - its own - and planted
  // relative to that road's kerb. A side street's infill trees therefore
  // walked straight into the ribbon of the street they cross, and nothing in
  // the build was ever asked about it. `insideRoadway` is that question, and
  // it is asked with the prop's own footprint so a trunk is rejected when its
  // BOX reaches the tarmac, not only when its centre does.
  const roadways = buildRoadwayIndex(model.roads);
  // Where a person may stand in the road: on a mapped crossing. The cell size
  // IS the reach, so `occupied`'s one-cell neighbourhood covers it exactly.
  const crossingSpots = makePointGrid(CROSSING_REACH_M);
  for (const point of model.wayfinding ?? []) {
    if (point.kind === 'crossing') crossingSpots.add(point.x, point.y);
  }
  /** Whether a prop of this half-size would stand on tarmac here. */
  const inRoadway = (x, y, halfM) => roadways.insideRoadway(x, y, -halfM);
  const standingInRoad = (x, y, halfM) =>
    inRoadway(x, y, halfM) && !crossingSpots.occupied(x, y, CROSSING_REACH_M);
  let treesDemoted = 0;
  let treesDropped = 0;
  let treesSkippedInRoad = 0;
  let lampsSkippedInRoad = 0;
  // CW-77: what the map gave us, and what became of it. `lampsMapped` counts
  // the ones that STOOD, never the ones considered - a counter whose name
  // does not match what it counts is how a census comes to report 520 mapped
  // lamps stood beside 36 refused out of 520 offered.
  let lampsMappedConsidered = 0;
  let lampsMapped = 0;
  let lampsMappedNudged = 0;
  let lampsMappedInRoad = 0;
  let lampsMappedBlocked = 0;
  let lampsMappedCrowded = 0;
  let lampsProcedural = 0;
  let peopleSkippedInRoad = 0;
  let roadsWithoutParking = 0;
  let carsRefusedOverlap = 0;

  const treeSpots = makePointGrid(PROP_SPATIAL_CELL_M);
  const carSpots = makePointGrid(PROP_SPATIAL_CELL_M);
  const lampSpots = makePointGrid(PROP_SPATIAL_CELL_M);
  // A second index, coarse enough to answer the claim question (see
  // LAMP_CLAIM_CELL_M). Only mapped lamps go in it.
  const mappedLampSpots = makePointGrid(LAMP_CLAIM_CELL_M);
  // CW-75: every car this build placed, parked and moving alike, as the
  // rectangle it actually occupies. The parked stream already stamps its
  // cars into `obstacles`, but the frozen traffic never did - which is why
  // "cars clip through each other" could be argued about for two rounds
  // without anyone being able to count it. A census that has to re-derive a
  // placement is a census that can be wrong in the same direction as the
  // code it audits, so the build writes down what it did.
  const carFootprints = [];
  // The registry both car streams consult before taking a spot (CW-75).
  const carBoxes = makeFootprintGrid(PROP_SPATIAL_CELL_M);
  let parkedCount = 0;
  let mappedTreeCount = 0;

  // CW-56: which species, and therefore how tall and what shape. The draw
  // takes DIFFERENT BITS of the seed the tier already uses rather than a new
  // random stream - CW-46's lesson, and the reason adding five species to
  // every city moves no census pin: nothing is inserted into an existing draw
  // order, so every other consumer of that stream sees the number it saw
  // before.
  const treeTable = treeTableFor(model.name);
  const plantTree = (x, y, seed, leafType) => {
    const tier = CANOPY_TIERS[seed % CANOPY_TIERS.length];
    const species = pickSpecies(treeTable, (seed >>> 5) % 997, leafType);
    const spec = treeSpec(species, (((seed >>> 11) % 1000) + 0.5) / 1000);
    speciesPlanted[spec.name] = (speciesPlanted[spec.name] ?? 0) + 1;
    trunkGeoms.push(
      makeBox(
        spec.trunkSideM,
        spec.trunkSideM,
        spec.trunkHeightM,
        x,
        y,
        spec.trunkHeightM / 2,
        0,
        TRUNK_TINT
      )
    );
    // A faceted crown, not a smooth ball: the flat facets give the sampler
    // the luminance steps it needs to read as leaves rather than a blob. The
    // cone stacks three of them for the same reason.
    const canopyTint = tintOf(tier, CANOPY_HUE_DEG, CANOPY_CHROMA);
    for (const canopy of makeCanopyGeoms(x, y, spec)) {
      paintGeometry(canopy, canopyTint);
      canopyGeoms.push(canopy);
    }

    treeSpots.add(x, y);
    obstacles.push({
      x,
      y,
      halfLengthM: spec.trunkSideM / 2,
      halfWidthM: spec.trunkSideM / 2,
      rotationRad: 0,
    });
  };

  // 1. The trees the map records. Real data wins every argument with the
  //    infill below, so these are placed first and only skipped where a
  //    building stands on them (or a duplicate node repeats one).
  //
  //    CW-75: except about standing in the road. A mapped tree node whose
  //    coordinates land inside a drawn roadway is not a tree in the road in
  //    the real world - it is a street tree whose kerb this game draws a
  //    metre or two off, because the ribbon is a class width rather than a
  //    survey. The tree keeps its side of the street and steps back onto the
  //    pavement; only where there is no pavement to take it is it dropped,
  //    and then it is counted rather than quietly forgotten.
  model.trees.forEach(({ x, y, leafType }, index) => {
    let tx = x;
    let ty = y;
    const hit = inRoadway(tx, ty, TRUNK_SIDE_M / 2);
    if (hit) {
      const outM = hit.widthM / 2 + TREE_SIDEWALK_OFFSET_M;
      const px = hit.cx + hit.nx * outM;
      const py = hit.cy + hit.ny * outM;
      if (
        inCore(px, py) &&
        !isBlocked(px, py) &&
        !inRoadway(px, py, TRUNK_SIDE_M / 2) &&
        !treeSpots.occupied(px, py, MAPPED_TREE_MIN_GAP_M)
      ) {
        tx = px;
        ty = py;
        treesDemoted++;
      } else {
        treesDropped++;
        return;
      }
    }
    if (!inCore(tx, ty) || isBlocked(tx, ty)) return;
    if (treeSpots.occupied(tx, ty, MAPPED_TREE_MIN_GAP_M)) return;
    plantTree(tx, ty, hashBuilding(index, 'osm-tree'), leafType);
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
  // CW-58 perch records. A bird rests on things the city already has, so the
  // builders that make them write down where they went rather than the bird
  // code guessing a second time.
  const placedPlanters = [];
  const placedTables = [];
  const placedLampHeads = [];
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

  // 1b-ii. CW-57 (CW-Q55): planters, flowerbeds and picnic tables, at the
  //        extract's own positions where the data is real. Same law as the
  //        CW-43 furniture: placement fidelity IS the accessibility point, so
  //        nothing here invents a position that the map already answers.
  const flowerTable = flowerTableFor(model.name);
  const flowerTintFor = (seed) =>
    tintOf(FLOWER_TIER, pickFlower(flowerTable, seed).hueDeg, FLOWER_CHROMA);

  const addPlanter = (x, y, angle, seed) => {
    for (const b of planterBoxes(
      x,
      y,
      angle,
      PLANTER_BODY_TINT,
      flowerTintFor(seed)
    )) {
      const geom = makeBox(b.l, b.w, b.h, b.x, b.y, b.z, b.angle, b.tint);
      // The lid is the flowers; it is a different mesh so the class pass can
      // give it its own voice without the box changing.
      (b.tint === PLANTER_BODY_TINT ? planterGeoms : flowerGeoms).push(geom);
    }
    obstacles.push({
      x,
      y,
      halfLengthM: PLANTER_L_M / 2,
      halfWidthM: PLANTER_W_M / 2,
      rotationRad: angle,
    });
    furnitureSpots.add(x, y);
    placedPlanters.push({ x, y, angle });
    plantingPlaced.planter++;
  };

  (model.plantings ?? []).forEach((item, index) => {
    const { x, y } = item;
    if (!inCore(x, y) || isBlocked(x, y)) return;
    if (furnitureSpots.occupied(x, y, FURNITURE_MIN_GAP_M)) return;
    if (treeSpots.occupied(x, y, FURNITURE_TREE_GAP_M)) return;
    const seed = hashBuilding(index, 'planting:' + item.kind);
    if (item.kind === 'planter') {
      const near = segmentAngles.nearest(x, y);
      addPlanter(x, y, near ? near.angle : 0, seed);
      return;
    }
    // A flowerbed is flat, has no collision, and takes no spatial slot: you
    // walk across a bed of flowers in this city, which is what the data
    // describes and not a thing to stop a cane on.
    for (const v of flowerbedPositions(x, y, item.areaM2, seed)) {
      bedPositions.push(v);
    }
    plantingPlaced.flowerbed++;
  });

  (model.picnicTables ?? []).forEach((item, index) => {
    const { x, y } = item;
    if (!inCore(x, y) || isBlocked(x, y)) return;
    if (furnitureSpots.occupied(x, y, FURNITURE_MIN_GAP_M)) return;
    if (treeSpots.occupied(x, y, FURNITURE_TREE_GAP_M)) return;
    const seed = hashBuilding(index, 'picnic');
    const near = segmentAngles.nearest(x, y);
    const angle = near ? near.angle : ((seed % 360) * Math.PI) / 180;
    for (const b of picnicTableBoxes(x, y, angle, TABLE_TINT)) {
      tableGeoms.push(makeBox(b.l, b.w, b.h, b.x, b.y, b.z, b.angle, b.tint));
    }
    obstacles.push({
      x,
      y,
      halfLengthM: TABLE_L_M / 2,
      halfWidthM: TABLE_W_M / 2,
      rotationRad: angle,
    });
    furnitureSpots.add(x, y);
    placedTables.push({ x, y, angle });
    plantingPlaced.picnic_table++;
    // Picnic tables ship UNOCCUPIED. Sitters are bench-only, which is settled
    // law from CW-45 and no signed question has extended it.
  });

  // ★ THE FALLBACK. Only a city whose map has NO planters at all reaches this,
  // so real data always wins - and the count it produces is reported
  // separately, because a reader should be able to tell design from data.
  if (plantingPlaced.planter === 0 && FALLBACK_PLANTER_PER_M2 > 0) {
    for (const [gi, green] of (model.greens ?? []).entries()) {
      const areaM2 = ringAreaM2(green.outer);
      const want = Math.floor(areaM2 / FALLBACK_PLANTER_PER_M2);
      if (want < 1) continue;
      const [cx, cy] = ringCentroid(green.outer);
      const rng = makeLcg(hashBuilding(gi, 'fallback-planter'));
      const reach = Math.sqrt(areaM2 / Math.PI) * 0.7;
      for (let i = 0; i < want; i++) {
        if (fallbackPlanters >= FALLBACK_PLANTER_MAX) break;
        const a = rng() * Math.PI * 2;
        const r = Math.sqrt(rng()) * reach;
        const px = cx + Math.cos(a) * r;
        const py = cy + Math.sin(a) * r;
        if (!inCore(px, py) || isBlocked(px, py)) continue;
        if (furnitureSpots.occupied(px, py, FURNITURE_MIN_GAP_M)) continue;
        if (treeSpots.occupied(px, py, FURNITURE_TREE_GAP_M)) continue;
        addPlanter(
          px,
          py,
          rng() * Math.PI * 2,
          hashBuilding(gi * 31 + i, 'fp')
        );
        fallbackPlanters++;
      }
      if (fallbackPlanters >= FALLBACK_PLANTER_MAX) break;
    }
  }

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
    // CW-75: the bench is mapped data and stays where the map put it, but
    // seating somebody is this build's own invention - and it will not
    // invent a person sitting on the tarmac.
    if (standingInRoad(sx, sy, PERSON_DEPTH_M / 2)) {
      peopleSkippedInRoad++;
      return;
    }
    const spec = makeFigureSpec(rng, 'sitting', { seatZ: BENCH_SEAT_H_M });
    plantFigure(sx, sy, bench.facing, spec, rng);
    sitterCount++;
    // The bench already stamps collision; the sitter just keeps standing
    // figures from crowding the seat.
    personSpots.add(sx, sy);
  });

  /**
   * Stand one lamp. Both streams go through here, so a mapped lamp and an
   * invented one are the same object in the world and no reader has to check
   * which of two copies of this code they are looking at.
   *
   * `reachSide` is which way the head cantilevers: +1 or -1 along the road's
   * left normal, or 0 for a lamp with no road to lean over.
   */
  const standLamp = (x, y, angle, nx, ny, reachSide) => {
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
    const hx = x - nx * LAMP_HEAD_REACH_M * reachSide;
    const hy = y - ny * LAMP_HEAD_REACH_M * reachSide;
    lampHeadGeoms.push(
      makeBox(
        LAMP_HEAD_LENGTH_M,
        LAMP_HEAD_WIDTH_M,
        LAMP_HEAD_THICK_M,
        hx,
        hy,
        LAMP_HEAD_Z_M,
        angle,
        LAMP_HEAD_TINT
      )
    );
    lampSpots.add(x, y);
    placedLampHeads.push({ x: hx, y: hy, angle });
    obstacles.push({
      x,
      y,
      halfLengthM: POLE_SIDE_M / 2,
      halfWidthM: POLE_SIDE_M / 2,
      rotationRad: 0,
    });
  };

  // 1b. THE LAMPS THE MAP ACTUALLY GIVES US, before anything is invented.
  //
  // Seattle carries City Light's own surveyed register (CW-Q76); the other
  // three carry OpenStreetMap's `highway=street_lamp` nodes. Either way these
  // are real positions and they go down FIRST, so the procedural stream below
  // fills the gaps between them rather than doubling up on a street the map
  // has already described.
  for (const lamp of model.lamps ?? []) {
    let { x, y } = lamp;
    if (!inCore(x, y)) continue;
    lampsMappedConsidered++;
    // ★ OUR RIBBON IS THE APPROXIMATION, NOT THE SURVEY. A pole shallowly
    // inside a drawn roadway is pushed out to its kerb along the ribbon's own
    // outward normal; one deeper than the index's slack is a pole beside a
    // road we draw as a flat band over a trench, and it is dropped rather
    // than moved a lie's worth of distance.
    const hit = inRoadway(x, y, POLE_SIDE_M / 2);
    if (hit) {
      const out = hit.inside + POLE_SIDE_M;
      if (out > LAMP_NUDGE_MAX_M) {
        lampsMappedInRoad++;
        continue;
      }
      x += hit.nx * out;
      y += hit.ny * out;
      if (inRoadway(x, y, POLE_SIDE_M / 2)) {
        lampsMappedInRoad++;
        continue;
      }
      lampsMappedNudged++;
    }
    if (isBlocked(x, y)) {
      lampsMappedBlocked++;
      continue;
    }
    if (lampSpots.occupied(x, y, LAMP_MIN_LAMP_GAP_M)) {
      lampsMappedCrowded++;
      continue;
    }
    if (treeSpots.occupied(x, y, LAMP_MIN_TREE_GAP_M)) {
      lampsMappedCrowded++;
      continue;
    }
    if (furnitureSpots.occupied(x, y, FURNITURE_CLEAR_M)) {
      lampsMappedCrowded++;
      continue;
    }
    // A mapped lamp has no road of its own to lean over, so its head sits on
    // the pole and takes the angle of the nearest road segment - which is the
    // same thing the planters and picnic tables do for their facing.
    const near = segmentAngles.nearest(x, y);
    standLamp(x, y, near ? near.angle : 0, 0, 0, 0);
    mappedLampSpots.add(x, y);
    lampsMapped++;
  }

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
    // CW-75: how this road divides between parking and travel.
    const lanes = laneLayoutFor(road);
    if (carRng && !lanes.parks) roadsWithoutParking++;
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
    // CW-77: how THIS street is lit (Seattle Streets Illustrated 3.6).
    const lampLayout = lampLayoutFor(road);
    // ...and how far a mapped lamp reaches when it claims its stretch: one
    // interval ALONG the street, plus the street's own half width, because a
    // pole mapped on the far kerb is still this street's lamp. Without the
    // width the claim misses the opposite side by a metre or two and the
    // stream quietly lights a street the map had already described.
    const claimM =
      lampLayout.spacingM * LAMP_CLAIM_SHARE + (road.widthM ?? 0) / 2;
    let lampCursor = lampRng
      ? LAMP_END_MARGIN_M + lampRng() * lampLayout.spacingM
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
          // A pavement offset measured from THIS road's kerb still lands in
          // the middle of the road this one crosses. Nobody stands there
          // unless the map says there is a crossing (CW-75).
          if (standingInRoad(px, py, PERSON_DEPTH_M / 2)) {
            peopleSkippedInRoad++;
            continue;
          }

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
        // Both directions: a lane each side of the centreline where the road
        // is wide enough for two, otherwise one lane down the middle that
        // both directions share (CW-75 `laneLayoutFor`).
        for (const dir of [1, -1]) {
          let cursor = trafficCursor[dir > 0 ? 0 : 1];
          while (cursor <= len) {
            const along = cursor;
            cursor += trafficSpacingM * (0.7 + trafficRng() * 0.6);
            if (!lanes.hasTraffic) break;
            const lane = lanes.laneOffsetM;
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
            const cabinTint = glassTint(tier);
            // CW-46: the class comes from the SAME seed, so adding classes
            // reshuffled nothing else on the street.
            const wheelTint = tintOf(
              Math.max(CAR_TYRE_FLOOR, tier - CAR_TYRE_DROP),
              hue,
              CAR_CHROMA
            );
            const cls = pickCarClass(((seed >>> 3) % 1000) / 1000);
            // CW-75: a moving car takes its slot off the street like any
            // other. Until now the traffic stream never wrote itself down,
            // so the parked stream could not see it and parked on top of it.
            const box = {
              x,
              y,
              halfLengthM: cls.lenM / 2,
              halfWidthM: cls.widM / 2,
              rotationRad: heading,
              stream: 'traffic',
            };
            if (carBoxes.overlaps(box)) {
              carsRefusedOverlap++;
              continue;
            }
            pushCarClassGeoms(
              trafficGeoms,
              cls,
              x,
              y,
              heading,
              bodyTint,
              cabinTint,
              wheelTint,
              true
            );
            carBoxes.add(box);
            carFootprints.push(box);
            trafficCount++;
          }
          trafficCursor[dir > 0 ? 0 : 1] = Math.max(0, cursor - len);
        }
      }

      if (lampRng) {
        while (lampCursor <= len) {
          const along = lampCursor;
          lampCursor += lampLayout.spacingM;
          // A narrow street alternates sides; a wide one carries an opposite
          // PAIR at each station, which is what a 250 ft standard means.
          const sides = lampLayout.paired ? [1, -1] : [lampSide];
          if (!lampLayout.paired) lampSide = -lampSide;
          for (const side of sides) {
            const x = x1 + ux * along + nx * lampOffset * side;
            const y = y1 + uy * along + ny * lampOffset * side;
            if (!inCore(x, y)) continue;
            if (isBlocked(x, y)) continue;
            if (treeSpots.occupied(x, y, LAMP_MIN_TREE_GAP_M)) continue;
            if (lampSpots.occupied(x, y, LAMP_MIN_LAMP_GAP_M)) continue;
            if (furnitureSpots.occupied(x, y, FURNITURE_CLEAR_M)) continue;
            // ★ A MAPPED LAMP CLAIMS ITS STRETCH. The procedural stream is
            // here to light a street the map is silent about; where the map
            // has already put a lamp within a share of this street's own
            // interval, there is nothing to invent.
            if (mappedLampSpots.occupied(x, y, claimM)) continue;
            // Outside this road's kerb can still be inside the next one's -
            // which is how 373 poles came to stand on tarmac, most of them in
            // the I-5 trench where the ribbons overlap (CW-75).
            if (inRoadway(x, y, POLE_SIDE_M / 2)) {
              lampsSkippedInRoad++;
              continue;
            }
            standLamp(x, y, angle, nx, ny, side);
            lampsProcedural++;
          }
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
            // 1.2 m outside THIS road's kerb is the middle of the road it
            // crosses (CW-75). The infill stream plants nothing on tarmac.
            if (inRoadway(x, y, TRUNK_SIDE_M / 2)) {
              treesSkippedInRoad++;
              continue;
            }
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

        if (carRng && lanes.parks) {
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

            const box = {
              x,
              y,
              halfLengthM: hl,
              halfWidthM: hw,
              rotationRad: angle,
              stream: 'parked',
            };
            if (carBoxes.overlaps(box)) {
              carsRefusedOverlap++;
              continue;
            }

            const tier = CAR_TIERS[seed % CAR_TIERS.length];
            const hue = TINT_HUES_DEG[(seed >>> 5) % TINT_HUES_DEG.length];
            const bodyTint = tintOf(tier, hue, CAR_CHROMA);
            const cabinTint = glassTint(tier);
            const wheelTint = tintOf(
              Math.max(CAR_TYRE_FLOOR, tier - CAR_TYRE_DROP),
              hue,
              CAR_CHROMA
            );
            pushCarClassGeoms(
              carGeoms,
              cls,
              x,
              y,
              angle,
              bodyTint,
              cabinTint,
              wheelTint
            );

            carSpots.add(x, y);
            carBoxes.add(box);
            parkedCount++;
            carFootprints.push(box);
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

  /**
   * CW-58: birds where birds rest.
   *
   * Every bird sits on something the city already built, and the builders
   * wrote down where those things went. Nothing here invents a perch: if a
   * city has no picnic tables, it has no birds on picnic tables, and that is
   * a result rather than a gap.
   *
   * Deterministic from the same hash every other prop uses, keyed by perch
   * kind and index, so no existing draw order moves - the seed law that
   * CW-49 nearly paid for.
   */
  const birdGeoms = [];
  const birdsPlaced = {};
  /**
   * ★ WHICH BIRDS TOOK WHICH PERCH, because a total cannot answer a question
   * about competition. Only two Denver birds can stand on a mapped lawn, and
   * only there do they take sites from each other; the crow also works
   * parapets, lamp heads and the open ground beside a pole, so its TOTAL
   * moves with the city's lamp count and says nothing about the lawn. CW-77
   * doubled the lamps and the crow's total passed the goose's while the
   * goose lost not one bird - which is how a guard written on the totals
   * came to fail on a city that had not changed.
   *
   * @type {Record<string, Record<string, number>>} perch kind -> name -> count
   */
  const birdsByPerch = {};
  let birdPerch = 'unknown';
  const birdRoster = birdTableFor(model.name);

  const addBird = (px, py, pz, facing, name, sizeDraw) => {
    const spec = birdSpec(name, ((sizeDraw % 1000) + 0.5) / 1000);
    if (!spec) return;
    const tint = tintOf(
      BIRD_TIER,
      BIRD_HUE_DEG,
      inGamutChroma(BIRD_TIER, BIRD_HUE_DEG, BIRD_CHROMA)
    );
    const c = Math.cos(facing);
    const sn = Math.sin(facing);
    for (const b of birdBoxes(spec, facing)) {
      birdGeoms.push(
        makeBox(
          b.l,
          b.w,
          b.h,
          px + b.along * c - b.across * sn,
          py + b.along * sn + b.across * c,
          pz + b.z,
          facing,
          tint
        )
      );
    }
    birdsPlaced[name] = (birdsPlaced[name] ?? 0) + 1;
    const byName = (birdsByPerch[birdPerch] ??= {});
    byName[name] = (byName[name] ?? 0) + 1;
  };

  /**
   * One pass per perch kind. `sites` is whatever the builder recorded; the
   * hash decides which of them carry a bird and which species takes it.
   */
  const perchPass = (perch, sites, zOf, facingOf) => {
    const rate = BIRD_PER_PERCH[perch] ?? 0;
    if (rate <= 0) return;
    birdPerch = perch;
    sites.forEach((site, index) => {
      const seed = hashBuilding(index, 'bird:' + perch);
      if ((seed % 1000) / 1000 >= rate) return;
      const name = pickBird(birdRoster, perch, seed >>> 7);
      if (!name) return;
      // ★ GEESE COME IN GROUPS, and that is a fix as well as a fact. Letting
      // the crow and the gull onto lawns - which the proof gate said was
      // right - gave them two thirds of every ground site and dropped
      // BURNABY FROM NINE GEESE TO ONE. A goose is the most legible bird on
      // the roster by a factor of three, so one of it in a city is a waste of
      // the only bird that really reads. Geese are gregarious and gather on
      // open grass; a small flock is what a park actually looks like.
      const flock =
        name === 'canada goose' ? 2 + ((seed >>> 19) % GOOSE_FLOCK_MAX) : 1;
      for (let k = 0; k < flock; k++) {
        const spread = k === 0 ? 0 : GOOSE_SPACING_M;
        const a = (((seed >>> 21) + k * 97) % 360) * (Math.PI / 180);
        const gx = site.x + Math.cos(a) * spread * k;
        const gy = site.y + Math.sin(a) * spread * k;
        if (k > 0 && isBlocked(gx, gy)) continue;
        addBird(
          gx,
          gy,
          zOf(site) - PERCH_SINK_M,
          facingOf(site, seed + k * 31),
          name,
          (seed >>> 13) + k * 271
        );
      }
    });
  };

  const hashFacing = (seed) => ((seed >>> 17) % 360) * (Math.PI / 180);

  perchPass(
    'bench-back',
    placedBenches.filter((b) => b.backrest),
    () => BENCH_SEAT_H_M + BENCH_BACK_H_M,
    (site) => site.facing
  );
  perchPass(
    'picnic-top',
    placedTables,
    () => TABLE_TOP_H_M,
    (site, seed) => hashFacing(seed)
  );
  perchPass(
    'planter-rim',
    placedPlanters,
    () => PLANTER_H_M,
    (site, seed) => hashFacing(seed)
  );
  perchPass(
    'lamp-head',
    placedLampHeads,
    () => LAMP_HEAD_Z_M + LAMP_HEAD_THICK_M / 2,
    (site, seed) => hashFacing(seed)
  );

  // A parapet perch is a building outline vertex at the building's own roof
  // height. Only mid-rise roofs: a bird on a fifty-storey parapet is a bird
  // nobody will ever be looking at, and one on a single-storey shed is at
  // eye level where the roof edge already reads as a line.
  const PARAPET_MIN_M = 6;
  const PARAPET_MAX_M = 32;
  const parapetSites = [];
  model.buildings.forEach((building, index) => {
    const h = building.heightM;
    if (!(h >= PARAPET_MIN_M && h <= PARAPET_MAX_M)) return;
    const ring = building.outer;
    if (!ring || ring.length < 3) return;
    const seed = hashBuilding(index, 'bird:parapet-site');
    const v = ring[seed % ring.length];
    if (!inCore(v[0], v[1])) return;
    const next = ring[(seed % ring.length) + 1] ?? ring[0];
    parapetSites.push({
      x: v[0],
      y: v[1],
      z: h,
      angle: Math.atan2(next[1] - v[1], next[0] - v[0]),
    });
  });
  perchPass(
    'parapet',
    parapetSites,
    (site) => site.z,
    (site) => site.angle
  );

  // Ground birds stand on mapped green, not on pavement - a goose on a road
  // is not a goose anybody has seen. The centroid is where the green is
  // widest, so that is where they go.
  // ★ SITES SCALE WITH THE PARK'S AREA, and the first draft did not - it gave
  // every green exactly one, which left ALBUQUERQUE WITH A SINGLE ROADRUNNER
  // in the whole city. The roadrunner is that city's own bird and the entire
  // argument for per-city rosters, so one of it is the same as none. A lawn
  // also genuinely holds several geese rather than one.
  const GROUND_M2_PER_SITE = 400;
  const GROUND_MAX_PER_GREEN = 6;
  const groundSites = [];
  (model.greens ?? []).forEach((green, index) => {
    if (!green.outer || green.outer.length < 3) return;
    const areaM2 = ringAreaM2(green.outer);
    if (areaM2 < 60) return;
    const [cx, cy] = ringCentroid(green.outer);
    if (!inCore(cx, cy)) return;
    const want = Math.max(
      1,
      Math.min(GROUND_MAX_PER_GREEN, Math.round(areaM2 / GROUND_M2_PER_SITE))
    );
    const spread = Math.min(14, Math.sqrt(areaM2 / Math.PI));
    for (let i = 0; i < want; i++) {
      const seed = hashBuilding(index * 8 + i, 'bird:ground-site');
      const gx = cx + (((seed >>> 3) % 200) / 200 - 0.5) * spread * 2;
      const gy = cy + (((seed >>> 11) % 200) / 200 - 0.5) * spread * 2;
      if (isBlocked(gx, gy)) continue;
      groundSites.push({ x: gx, y: gy });
    }
  });
  perchPass(
    'ground',
    groundSites,
    () => ROAD_LIFT_M,
    (site, seed) => hashFacing(seed)
  );

  // Open ground is PAVEMENT, not parkland, and a lamp post is the cheapest
  // honest way to find some: a lamp stands on the footway beside the
  // carriageway, so a spot a couple of metres off one is footway too. The
  // blocked check does the rest.
  const openSites = [];
  placedLampHeads.forEach((lamp, index) => {
    const seed = hashBuilding(index, 'bird:open-site');
    const a = ((seed >>> 5) % 360) * (Math.PI / 180);
    const r = 1.6 + ((seed >>> 15) % 100) / 100;
    const ox = lamp.x + Math.cos(a) * r;
    const oy = lamp.y + Math.sin(a) * r;
    if (!inCore(ox, oy) || isBlocked(ox, oy)) return;
    openSites.push({ x: ox, y: oy });
  });
  perchPass(
    'open-ground',
    openSites,
    () => ROAD_LIFT_M,
    (site, seed) => hashFacing(seed)
  );

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
  // CW-57: the planting props. The flowers are their own mesh so the class
  // pass can give colour its own voice without the box changing.
  addMerged(planterGeoms, 'planters', propMaterial());
  addMerged(flowerGeoms, 'planter-flowers', propMaterial());
  addMerged(tableGeoms, 'picnic-tables', propMaterial());
  // CW-58: one mesh for every bird in the city. Birds are tiny, so the cost
  // exposure here is geometry count and draw calls rather than the FILL that
  // CW-56's crowns paid - hence one merge, not one per species.
  addMerged(birdGeoms, 'birds', propMaterial());
  // Flowerbeds are FLAT, so they get the same treatment the road lines get:
  // their own polygonOffset, because two coplanar surfaces without one fight
  // in the surface-id buffer and re-roll a quarter of the frame's glyph
  // vocabulary (D-110).
  if (bedPositions.length > 0) {
    const bedGeom = new BufferGeometry();
    bedGeom.setAttribute(
      'position',
      new BufferAttribute(new Float32Array(bedPositions), 3)
    );
    const bedNormals = new Float32Array(bedPositions.length);
    for (let i = 0; i < bedNormals.length; i += 3) bedNormals[i + 2] = 1;
    bedGeom.setAttribute('normal', new BufferAttribute(bedNormals, 3));
    paintGeometry(bedGeom, tintOf(BED_TIER, flowerTable[0].hueDeg, BED_CHROMA));
    const bedMat = new MeshLambertMaterial({
      color: 0xffffff,
      vertexColors: true,
      polygonOffset: true,
      polygonOffsetFactor: -5,
      polygonOffsetUnits: -5,
    });
    const bedMesh = new Mesh(bedGeom, bedMat);
    bedMesh.name = 'flowerbeds';
    group.add(bedMesh);
    disposables.push(bedGeom, bedMat);
    triangles += bedPositions.length / 9;
  }

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
    /**
     * CW-75: the rectangle every car occupies, `stream` telling parked from
     * frozen traffic. The placement audit and its census read this.
     * @type {Array<{x:number, y:number, halfLengthM:number, halfWidthM:number, rotationRad:number, stream:'parked'|'traffic'}>}
     */
    carFootprints,
    // CW-77: where every lamp head ended up, so the census can measure the
    // SPACING - a lamp count cannot say whether a street is lit.
    lampHeads: placedLampHeads,
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
      speciesPlanted,
      // CW-57: what stands, split so a reader can tell DATA from the
      // fallback - fallbackPlanters is design, everything else is the map.
      plantingPlaced,
      birdsPlaced,
      birdsByPerch,
      fallbackPlanters,
      carCount: parkedCount,
      lampCount: lampSpots.size,
      // CW-75: what the road-ribbon index cost each stream, so a census can
      // show the placement audit moved only what it claimed to move.
      treesDemoted,
      treesDropped,
      treesSkippedInRoad,
      lampsSkippedInRoad,
      lampsMappedConsidered,
      lampsMapped,
      lampsMappedNudged,
      lampsMappedInRoad,
      lampsMappedBlocked,
      lampsMappedCrowded,
      lampsProcedural,
      peopleSkippedInRoad,
      roadsWithoutParking,
      carsRefusedOverlap,
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
 * Landmark marks for the map view (CW-10, redesigned by CW-62).
 *
 * ★★ WHAT WAS HERE WAS NOT DIM, IT WAS NOT THERE. CW-10 drew one 7x7x90
 * pillar per landmark, and the owner's complaint that cycling landmarks
 * "only moves the camera" turned out to be arithmetic. MEASURED at CW-62,
 * blacked out at the same pose against a same-run control that read 0.000%:
 *
 *   zoom 0.4   a beacon is 1.36 px wide, 0.34 CELLS   the layer owns 0.000%
 *   zoom 1     3.39 px, 0.85 cells                    0.002%
 *   zoom 2     6.78 px, 1.69 cells                    0.013%
 *
 * The converter's cell is 4 px wide, so at the zoom a player opens the map at
 * a whole landmark is smaller than one character. Twelve of them together
 * owned two thousandths of one per cent of the frame - and this round REFUSED
 * fallen leaves at under one per cent (CW-56).
 *
 * So the marks are rebuilt to the laws the map's other marks already obey:
 *
 * ★ A MARK IS A SCREEN SIZE, NOT A NUMBER OF METRES (CW-60, photographed
 *   empty twice to learn it). Size comes from a fraction of the CITY'S span
 *   and the caller scales the root by the same `2.2 / zoom` clamp the player
 *   marker and the pick circle use, so a mark holds its footprint in glyphs
 *   rather than in ground.
 *
 * ★★ A BRIGHT OUTLINE ONLY READS WHEN IT IS WRAPPED AROUND EXACT BLACK
 *   (CW-40, restated by CW-61 after a bare bright ring came back invisible in
 *   three palettes of five while owning up to 1% of the frame). Exact black is
 *   the one value the converter renders as an EMPTY cell, and an empty patch
 *   inside a mark is a footprint no building in any palette has.
 *
 * The map now carries three marks and they have to stay apart: the player is
 * a SQUARE, the travel pick is a CIRCLE (CW-61), and a landmark is a DIAMOND.
 *
 * @param {Array<{name: string, x: number, y: number}>} landmarks
 * @param {number} spanM the city's own span, so the marks scale with it
 */
export function buildLandmarkBeacons(landmarks, spanM) {
  const group = new Group();
  group.name = 'landmark-beacons';

  const span = Math.max(100, spanM || 0);
  // Smaller than the player's marker: the player is the one mark that must
  // always win, and there are twelve of these.
  const outer = Math.max(10, span * 0.016);

  const frameMat = new MeshBasicMaterial({
    color: 0xffffff,
    depthTest: false,
  });
  const coreMat = new MeshBasicMaterial({ color: 0x000000, depthTest: false });

  /**
   * ★★ EVERY STATE IS A FOOTPRINT, AND VISITED-AS-A-TONE WAS TRIED FIRST AND
   * FAILED IN THE MOST INSTRUCTIVE WAY.
   *
   * Visited began as a dimmer frame (0x8a8a8a against white). Measured, that
   * changed 0.46% of the frame in colour, 0.66% in mono green and 0.46% in
   * HC-light, against a 0.000% same-run control - a real, repeatable change,
   * about forty per cent of the layer's own pixels. It looked like a pass.
   *
   * Photographed, every visited diamond DISAPPEARED. The dim grey sank into
   * the map's own glyph noise and what remained was the selected mark and the
   * player. **Changed is not readable**, the same way CW-61 found that
   * present is not findable - and the number would have shipped it.
   *
   * So all three states stay bright with their holes intact, and differ by
   * SIZE, which is what this grid can carry (CW-61 told its circle from the
   * player's square the same way):
   *
   *   unvisited   the base diamond
   *   visited     the same mark at 0.72, hole intact - plainly lesser
   *   selected    a halo behind it, plainly greater
   */
  // A four-segment circle is a diamond: its vertices sit on the axes.
  const frameGeom = new CircleGeometry(outer, 4);
  const coreGeom = new CircleGeometry(outer * 0.52, 4);
  const visitedFrameGeom = new CircleGeometry(outer * 0.72, 4);
  const visitedCoreGeom = new CircleGeometry(outer * 0.72 * 0.5, 4);
  const selectedGeom = new CircleGeometry(outer * 1.5, 4);

  const marks = landmarks.map((lm) => {
    const root = new Group();
    root.position.set(lm.x, lm.y, 0);

    // The selected ring sits UNDER the frame and shows only for the chosen
    // one, so selection changes the mark's outline rather than its colour.
    const halo = new Mesh(selectedGeom, frameMat);
    halo.position.z = 58;
    halo.renderOrder = 990;
    halo.visible = false;
    root.add(halo);

    const frame = new Mesh(frameGeom, frameMat);
    frame.position.z = 59;
    frame.renderOrder = 991;
    root.add(frame);

    const core = new Mesh(coreGeom, coreMat);
    core.position.z = 60;
    core.renderOrder = 992;
    root.add(core);

    group.add(root);
    return { root, halo, frame, core };
  });

  return {
    group,
    /** The caller drives this from applyMapCamera, with the marker's own scale. */
    setScale(scale) {
      for (const m of marks) m.root.scale.set(scale, scale, 1);
    },
    setSelected(index) {
      marks.forEach((m, i) => {
        m.halo.visible = i === index;
      });
    },
    /** @param {Set<string>} visited names the player has reached */
    setVisited(visited) {
      marks.forEach((m, i) => {
        const seen = Boolean(visited?.has(landmarks[i].name));
        m.frame.geometry = seen ? visitedFrameGeom : frameGeom;
        m.core.geometry = seen ? visitedCoreGeom : coreGeom;
      });
    },
    dispose() {
      frameGeom.dispose();
      coreGeom.dispose();
      visitedFrameGeom.dispose();
      visitedCoreGeom.dispose();
      selectedGeom.dispose();
      frameMat.dispose();
      coreMat.dispose();
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
 * ★★ CW-64 (CW-Q59): THE ONE BOUNDED EXCEPTION TO THE FROZEN WORLD.
 *
 * This city does not move. That is Round 4's directive and it is the reason
 * the converter can run at all - a static frame is not re-converted. Rain has
 * been the only mover since, and the owner signed CW-Q59 to add a second: a
 * show that runs for about twenty seconds, marks frames dirty only while it
 * runs, and leaves the world exactly as still as it found it.
 *
 * ★ THE BLOOM IS THE THUNDER'S HUMP, AND THAT IS NOT A COINCIDENCE.
 * `stepWeather` already swells thunder with `Math.sin(k * Math.PI)` and its
 * own comment says why: "a single smooth hump: up over the first half, down
 * over the second, so there is no edge anywhere in it." WCAG 2.3.1 counts
 * paired luminance SWINGS, not brightness, so a bloom with no edge is a bloom
 * with no flash. The same shape answers both.
 *
 * ★★ THE BLOOM IS DRIVEN THROUGH COLOUR, NEVER OPACITY. Scaling
 * `material.color` lands a star on EXACT BLACK at both ends of the hump, and
 * exact black is the one value this converter renders as an empty cell (CW-5),
 * so a burst fades to nothing rather than to a grey stain - and there is no
 * transparency sorting anywhere in it.
 */
/**
 * ★ THE SHOW'S NUMBERS LIVE IN ONE MUTABLE OBJECT so a photograph sweep can
 * change one variable per page load without touching the file - the pattern
 * CW-63's diagrid used, and the reason its six variants took one session
 * rather than six.
 */
export const FIREWORK_SHOW = {
  /** CW-Q59's signed radius. */
  ringM: 200,
  /**
   * ★★ THE PLAN SAYS "z ~60-120 m, just above the buildings", AND MEASURED
   * THAT IS NOT ABOVE THEM.
   *
   * Counted within 250 m of each city's centre: Seattle has 12 buildings over
   * 60 m and 6 over 120 m (tallest 148); Denver 10 and 1 (tallest 152);
   * Burnaby 10 and 0 (114); Albuquerque 2 and 0 (120). Photographed from the
   * Seattle spawn, a burst at 68 m on the 200 m ring sat squarely BEHIND a
   * facade - in frustum, bright, and invisible, because the depth test was
   * doing its job.
   *
   * So the band is raised to clear the skyline the plan meant it to clear. The
   * plan's INTENT ("just above the buildings") is what is honoured here; its
   * number was written before anyone counted.
   */
  zMinM: 150,
  zMaxM: 230,
  /**
   * ★★ SEVEN METRES, AND FIVE SIZES WERE PHOTOGRAPHED TO GET THERE.
   *
   * At the 200 m ring one metre is 3.27 px over the game viewport's 756, so a
   * 1 m star is 0.82 of a character cell wide and 0.36 TALL - it would average
   * away exactly as CW-63's published diagrid member did. Measured against a
   * same-run control frame with the show stopped:
   *
   *   5 m   0.567% of the frame   separated points, but faint
   *   7 m   1.169%                SHIPPED - bold, still distinct
   *   10 m  2.253%                the stars MERGE into one green blob
   *   16 m  3.797%                a cloud
   *   24 m  5.305%                a wall
   *
   * ★ A share-of-frame number is the WRONG bar here and CW-58 is why: its
   * goose measured below the leaves CW-56 refused and was unmistakable,
   * because share-of-frame measures a carpet, not a single object. What
   * settled 7 m was the photograph - at 10 m and up the burst stops being a
   * scatter of stars and becomes a shape.
   */
  starM: 7,
  spreadM: 35,
  /**
   * ★ THE CADENCE LIVES HERE SO 2.3.1 CAN BE RED-PROVEN. A flash counter that
   * has only ever returned zero is not a measurement, it is a hope. With these
   * two sweepable, the same instrument can be handed a deliberate strobe and
   * asked whether it notices - which is the only thing that makes the shipped
   * zero worth reporting.
   *
   * The bloom is comfortably over 2.3.1's one-second floor and the gap keeps
   * bursts to about 0.71 a second against its ceiling of three.
   */
  bloomMs: 1600,
  gapMs: 1400,
};

/**
 * How far out the reduced-motion celebration sits, and how far apart its two
 * bursts are. Closer than the ring so the look up is steep enough to clear the
 * buildings beside the player - at 120 m and 230 m up that is 62 degrees,
 * against the ring's 43.
 */
const FIREWORK_STILL_RANGE_M = 120;
const FIREWORK_STILL_SPAN_RAD = 0.7;
const FIREWORK_STARS = 28;
/** Concurrent bursts. One material per SLOT, so two bursts can share a hue. */
const FIREWORK_SLOTS = 2;
const FIREWORK_SHOW_MS = 20000;
/** Gentle, so stars drift rather than drop out of the sky. */
const FIREWORK_FALL_MSS = 3.5;
/** See the note in fireBurst: 0.9 lands four of six hues on white. */
const FIREWORK_TIER = 0.75;

export function buildFireworks(spanM) {
  const group = new Group();
  group.name = 'fireworks';
  group.visible = false;

  // One metre, scaled per star at update time, so the size stays sweepable
  // without rebuilding the city.
  const geom = new BoxGeometry(1, 1, 1);

  // The star pattern is the same every burst on purpose: what a player reads
  // is the position, the colour and the timing, and a per-burst direction set
  // would be a new random stream inserted into a draw order (the seed law).
  const rand = makeLcg(0xf1b0c0de);
  const dirs = [];
  for (let i = 0; i < FIREWORK_STARS; i++) {
    // Even-ish over the sphere, flattened a little so a burst reads wider
    // than it is tall - the cell grid is 2.25x coarser vertically.
    const z = rand() * 2 - 1;
    const r = Math.sqrt(Math.max(0, 1 - z * z));
    const a = rand() * Math.PI * 2;
    dirs.push([Math.cos(a) * r, Math.sin(a) * r, z * 0.6]);
  }

  /**
   * ★★ THE MAP GETS ITS OWN MARK, AND IT IS A TRIANGLE FOR A MEASURED REASON.
   *
   * The map already carries three marks and they stay apart by SHAPE: the
   * player is a square, CW-61's travel pick is a 28-segment circle, CW-62's
   * landmarks are diamonds. A fourth mark cannot be another rounded blob at a
   * scale where a mark is a few character cells across - CW-61's man died of
   * exactly that. A triangle is three straight edges and an unmistakable
   * silhouette, and it is the only shape of that description left.
   *
   * ★ AND IT GROWS, WHICH NOTHING ELSE ON THIS MAP CAN DO. The world is
   * frozen; the show is its one bounded exception. So the mark swells with its
   * burst's own bloom, which is both the truest picture of a firework and a
   * distinction no static mark can imitate.
   *
   * The bright frame wraps an EXACT-BLACK core because that is CW-40's law as
   * CW-61 restated it and CW-62 paid for it: a bright outline reads only when
   * it is wrapped around exact black, since exact black is the one value the
   * converter renders as an empty cell.
   */
  const mapGroup = new Group();
  mapGroup.name = 'fireworks-map';
  mapGroup.visible = false;
  const mapFrameMat = new MeshBasicMaterial({
    color: 0xffffff,
    depthTest: false,
  });
  const mapCoreMat = new MeshBasicMaterial({
    color: 0x000000,
    depthTest: false,
  });
  // One metre, scaled at update time, so the map's own zoom law owns the size.
  const mapFrameGeom = new CircleGeometry(1, 3);
  const mapCoreGeom = new CircleGeometry(0.52, 3);

  const slots = [];
  for (let s = 0; s < FIREWORK_SLOTS; s++) {
    const material = new MeshBasicMaterial({ color: 0x000000, fog: false });
    const stars = [];
    for (let i = 0; i < FIREWORK_STARS; i++) {
      const mesh = new Mesh(geom, material);
      // D-115: THE NAME HAS TO BE ON THE MESH. The class pass traverses with
      // `if (!obj.isMesh) return` and then reads `obj.name`, so naming only the
      // GROUP left every star resolving to SKY and CW-64's
      // ['fireworks', SIGN] mapping applying to nothing at all. Found when
      // CW-65 widened CW-56's builders guard to ask the standalone builders -
      // the gap CW-64's own record named and did not close.
      mesh.name = 'fireworks';
      mesh.visible = false;
      group.add(mesh);
      stars.push(mesh);
    }
    const mapRoot = new Group();
    const mapFrame = new Mesh(mapFrameGeom, mapFrameMat);
    // D-115, and see the note on the stars above. The map marks are drawn over
    // an ortho camera with their own materials, so what this buys them is the
    // same voice the street bursts get rather than the sky's.
    mapFrame.name = 'fireworks';
    mapFrame.position.z = 61;
    mapFrame.renderOrder = 995;
    mapRoot.add(mapFrame);
    const mapCore = new Mesh(mapCoreGeom, mapCoreMat);
    mapCore.name = 'fireworks';
    mapCore.position.z = 62;
    mapCore.renderOrder = 996;
    mapRoot.add(mapCore);
    mapRoot.visible = false;
    mapGroup.add(mapRoot);
    slots.push({
      material,
      stars,
      mapRoot,
      startMs: -1,
      centre: [0, 0, 0],
      tint: null,
    });
  }

  /**
   * The map mark's base size, from the CITY'S OWN SPAN - the same law the
   * player marker and CW-62's landmark diamonds ride on.
   *
   * ★ 0.034 IS TWICE A LANDMARK'S 0.016 AND IT IS NOT GREED. Two things push
   * it up. A triangle of a given circumradius has 1.30 R2 of area against a
   * diamond's 2 R2 - 65% - so matching a landmark's presence already costs
   * 1.24x the radius. And measured on the map, one burst mark at 0.02 changed
   * **0.068%** of the frame where the twelve landmark diamonds change 1.125%
   * together, about 0.094% each: photographed, it did not stand out among
   * them, which is CW-62's own finding arriving again. There are only ever one
   * or two of these, they last a second and a half, and they are the thing the
   * show exists to point at.
   */
  const markBaseM = Math.max(12, Math.max(100, spanM || 0) * 0.034);
  /** The zoom clamp, handed in by the controller. */
  let mapMarkScale = 1;

  // ★★ start() TAKES NO CLOCK, AND THAT IS THE POINT. The first version had it
  // take `nowMs`, and the very first attempt to photograph the show handed it
  // `performance.now()` while `update` receives the game's own
  // `performance.now() - startedAtMs`. Two clocks, hours apart in value, so
  // every burst was scheduled in the far future and nothing ever fired - a
  // show that started, reported itself running, and drew nothing. The start is
  // established by the first update instead, on whatever clock the caller is
  // actually stepping with.
  let armed = false;
  /** A held still frame is not running, but it IS on screen. */
  let still = false;
  let showStartMs = -1;
  let nextBurstMs = -1;
  let burstIndex = 0;

  const fireBurst = (nowMs, centreX, centreY) => {
    const slot = slots.find((s) => s.startMs < 0);
    if (!slot) return;
    // Position and colour from the burst's own index, never a new stream.
    // ★ THE OFFSETS ARE NOT DECORATION: hashSpot(0, 0) is 0, so without them
    // the FIRST burst of every show would fire at angle 0 in the first hue,
    // every time. Checked, not assumed.
    const h = hashSpot(burstIndex * 97 + 13, burstIndex * 131 + 29);
    const angle = ((h % 3600) / 3600) * Math.PI * 2;
    const z =
      FIREWORK_SHOW.zMinM +
      (((h >>> 12) % 100) / 100) * (FIREWORK_SHOW.zMaxM - FIREWORK_SHOW.zMinM);
    slot.centre = [
      centreX + Math.sin(angle) * FIREWORK_SHOW.ringM,
      centreY + Math.cos(angle) * FIREWORK_SHOW.ringM,
      z,
    ];
    // SIGN_HUES_DEG is the set already chosen to land palette entries.
    // ★ THE BIT SLICE WAS CHOSEN BY PRINTING THE SEQUENCE, not by habit. Over
    // the ~14 bursts a 20 s show fires, `>>> 5` uses only FOUR of the six hues
    // and `>>> 0` five; 13, 17 and 21 each use all six. A modulus is not a
    // guarantee of variety at fourteen draws - look at the actual sequence.
    const hue = SIGN_HUES_DEG[(h >>> 17) % SIGN_HUES_DEG.length];
    // ★★ 0.75, NOT 0.9, AND D-112 IS WHY. Fitted with inGamutChroma, encoded
    // to sRGB and handed to the real pickPaletteIndex with chromaBoost 5:
    // at tier 0.9 FOUR OF SIX hues land white in each palette set, because the
    // gamut cap makes the colour impossible rather than merely hard. At 0.75
    // every hue lands its own entry in both sets. The bloom scales down from
    // the peak and lower tiers land their hue MORE reliably, so the peak is
    // the only value that needed checking.
    slot.tint = tintOf(
      FIREWORK_TIER,
      hue,
      inGamutChroma(FIREWORK_TIER, hue, 0.9)
    );
    slot.startMs = nowMs;
    burstIndex++;
  };

  return {
    group,
    /** The map's own representation, at the bursts' true ring positions. */
    mapGroup,

    /**
     * The map's zoom clamp, exactly as `beacons.setScale` takes it. Four marks
     * on one map now, and still one number deciding how big a mark is.
     */
    setMapScale(scale) {
      mapMarkScale = Math.max(0.05, scale);
    },

    start() {
      armed = true;
      still = false;
      showStartMs = -1;
      burstIndex = 0;
      group.visible = true;
    },

    /**
     * ★★ THE REDUCED-MOTION PATH DRAWS SOMETHING, AND THAT IS THE WHOLE POINT.
     *
     * The plan's words are "a static celebratory frame plus the announcement -
     * never nothing". So this composes both slots at their fullest bloom, on
     * opposite sides of the ring, and leaves them there: a player who has
     * asked the machine to stop moving things still gets to SEE that they
     * finished the city. Nothing animates, `isRunning()` stays false, and the
     * step loop never touches it - the frozen world is not bent for this at
     * all, because a still picture is not motion.
     *
     * The caller clears it; there is no timer here, because a timer is the one
     * thing this path is not allowed to have.
     */
    showStill(x, y, headingRad = 0) {
      armed = false;
      still = true;
      showStartMs = -1;
      group.visible = true;
      mapGroup.visible = true;
      for (let si = 0; si < slots.length; si++) {
        const slot = slots[si];
        // ★★ THE CALM FRAME IS PUT WHERE THE PLAYER IS LOOKING, AND CLOSER AND
        // HIGHER THAN THE RING, BECAUSE "NEVER NOTHING" IS A PROMISE.
        //
        // Placed on the show's own ring at fixed compass bearings, it
        // photographed from the Seattle spawn as a wall: 200 m out at 190 m up
        // is 43 degrees of elevation, and a tower thirty metres away covers
        // that easily. The moving show can afford a blocked burst because
        // fourteen more follow from other bearings; a single still frame
        // cannot. So it sits either side of the player's own heading, at
        // FIREWORK_STILL_RANGE_M, high enough that the look up clears what is
        // next to them.
        const spread = FIREWORK_STILL_SPAN_RAD;
        const angle = headingRad + (si - (slots.length - 1) / 2) * spread;
        const z = FIREWORK_SHOW.zMaxM;
        slot.centre = [
          x + Math.sin(angle) * FIREWORK_STILL_RANGE_M,
          y + Math.cos(angle) * FIREWORK_STILL_RANGE_M,
          z,
        ];
        const hue = SIGN_HUES_DEG[si % SIGN_HUES_DEG.length];
        slot.tint = tintOf(
          FIREWORK_TIER,
          hue,
          inGamutChroma(FIREWORK_TIER, hue, 0.9)
        );
        slot.material.color.setRGB(...slot.tint);
        for (let i = 0; i < slot.stars.length; i++) {
          const d = dirs[i];
          slot.stars[i].position.set(
            slot.centre[0] + d[0] * FIREWORK_SHOW.spreadM,
            slot.centre[1] + d[1] * FIREWORK_SHOW.spreadM,
            slot.centre[2] + d[2] * FIREWORK_SHOW.spreadM
          );
          slot.stars[i].scale.setScalar(FIREWORK_SHOW.starM);
          slot.stars[i].visible = true;
        }
        slot.mapRoot.position.set(slot.centre[0], slot.centre[1], 0);
        const markScale = markBaseM * mapMarkScale;
        slot.mapRoot.scale.set(markScale, markScale, 1);
        slot.mapRoot.visible = true;
      }
    },

    /** Take the still frame down. */
    clear() {
      armed = false;
      still = false;
      showStartMs = -1;
      group.visible = false;
      mapGroup.visible = false;
      for (const slot of slots) {
        slot.startMs = -1;
        for (const mesh of slot.stars) mesh.visible = false;
        slot.mapRoot.visible = false;
      }
    },

    isRunning() {
      return armed;
    },

    /**
     * Is there anything on screen from this show - moving OR held still?
     *
     * ★ THE MAP SYNC NEEDS THIS AND `isRunning()` WOULD HAVE LIED TO IT. The
     * reduced-motion celebration is deliberately NOT "running": nothing
     * animates and the step loop never touches it. But it is very much
     * VISIBLE, and a view toggle that asks `isRunning()` would hide it and
     * never bring it back - a player who opened the map during their three
     * seconds of celebration would lose the celebration.
     */
    isShowing() {
      return armed || still;
    },

    /**
     * The show does NOT re-centre on the player the way rain does: a firework
     * is at a place in the city, so walking toward one gets you nearer.
     */
    update(dtS, x, y, nowMs) {
      if (!armed) return;
      if (showStartMs < 0) {
        showStartMs = nowMs;
        nextBurstMs = nowMs;
      }
      if (nowMs - showStartMs > FIREWORK_SHOW_MS) {
        const anyLive = slots.some((s) => s.startMs >= 0);
        if (!anyLive) {
          armed = false;
          still = false;
          showStartMs = -1;
          group.visible = false;
          mapGroup.visible = false;
          for (const slot of slots) {
            for (const mesh of slot.stars) mesh.visible = false;
            slot.mapRoot.visible = false;
          }
          return;
        }
      } else if (nowMs >= nextBurstMs) {
        fireBurst(nowMs, x, y);
        nextBurstMs = nowMs + FIREWORK_SHOW.gapMs;
      }

      for (const slot of slots) {
        if (slot.startMs < 0) continue;
        const since = nowMs - slot.startMs;
        if (since > FIREWORK_SHOW.bloomMs) {
          slot.startMs = -1;
          for (const mesh of slot.stars) mesh.visible = false;
          slot.mapRoot.visible = false;
          continue;
        }
        const k = since / FIREWORK_SHOW.bloomMs;
        // The thunder's hump. No edge anywhere in it, which is what keeps
        // 2.3.1 satisfied by construction rather than by luck.
        const bloom = Math.sin(k * Math.PI);
        slot.material.color.setRGB(
          slot.tint[0] * bloom,
          slot.tint[1] * bloom,
          slot.tint[2] * bloom
        );
        // Decelerating outward, then a gentle fall.
        const spread = FIREWORK_SHOW.spreadM * (1 - (1 - k) * (1 - k));
        const drop = 0.5 * FIREWORK_FALL_MSS * (since / 1000) ** 2;
        for (let i = 0; i < slot.stars.length; i++) {
          const d = dirs[i];
          slot.stars[i].position.set(
            slot.centre[0] + d[0] * spread,
            slot.centre[1] + d[1] * spread,
            slot.centre[2] + d[2] * spread - drop
          );
          slot.stars[i].scale.setScalar(FIREWORK_SHOW.starM);
          slot.stars[i].visible = true;
        }

        // The map mark sits at the burst's TRUE position - the same ring the
        // stars are on - and swells with the same bloom, so what the map shows
        // is where the show actually is rather than a decoration of it.
        slot.mapRoot.position.set(slot.centre[0], slot.centre[1], 0);
        // ★ x AND y ONLY. `setScalar` scales the children's z offsets with
        // everything else, and those offsets are what keep the frame under the
        // core: at a ~107x mark scale the pair flew to z 6,500 and straight
        // out of the overhead camera's frustum. Photographed as a map with
        // marks in the scene graph and nothing in the picture.
        const markScale = markBaseM * mapMarkScale * (0.45 + 0.55 * bloom);
        slot.mapRoot.scale.set(markScale, markScale, 1);
        slot.mapRoot.visible = true;
      }
    },

    dispose() {
      group.clear();
      mapGroup.clear();
      geom.dispose();
      mapFrameGeom.dispose();
      mapCoreGeom.dispose();
      mapFrameMat.dispose();
      mapCoreMat.dispose();
      for (const slot of slots) slot.material.dispose();
    },
  };
}

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

// ---------------------------------------------------------------------------
// CW-65 (CW-Q60): the traveler
// ---------------------------------------------------------------------------

/**
 * The tones the traveler wears, and why each is where it is.
 *
 * Ordinary figures wear FIGURE_TIERS [0.5, 0.65, 0.8] on the torso with legs a
 * step below, and a head at HEAD_TIER 0.82 - so 0.8 is the brightest clothing
 * anybody in the city has. A high-visibility jacket has to beat that to be a
 * jacket rather than another bright shirt.
 *
 * ★ THE HEAD STAYS AT 0.82, EXACTLY LIKE EVERYONE ELSE'S. It is the ground the
 * glasses are drawn against, and CW-49 measured that at 0.80 the mono frames
 * moved by up to 0.74% of their pixels while at 0.82 they do not move at all.
 */
const TRAVELER_JACKET_TIER_DEFAULT = 0.92;

/**
 * ★ EVERY NUMBER THE TRAVELER LOOKS LIKE LIVES HERE, MUTABLE, SO IT CAN BE
 * SWEPT WITHOUT REBUILDING THE CITY. CW-64 learned this the hard way: a value
 * you cannot sweep is a value whose guard cannot be red-proven, and a flash
 * counter that has only ever returned zero is not a measurement but a hope.
 * `place()` reads this object every time, so a sweep patches it and re-places.
 */
export const TRAVELER_LOOK = {
  jacketTier: TRAVELER_JACKET_TIER_DEFAULT,
  /** Yellow: the hue high-visibility clothing actually is. Verified ENCODED,
   *  never in linear (D-112) - it lands #ffff00 / #aaff00. */
  jacketHueDeg: 60,
  jacketChroma: 0.5,
  /** A white cane is white: neutral, and above every tone anybody wears. */
  caneTier: 0.95,
  caneThickM: TRAVELER_CANE_THICK_M,
  caneReachM: TRAVELER_CANE_REACH_M,
  /** Trousers, low in the band so the jacket has something to be brighter
   *  than - but never below the 0.45 floor the proof gate set when a 0.3 leg
   *  vanished against black pavement. */
  legTier: 0.5,
  /** ★ THE HEAD STAYS AT 0.82, EXACTLY LIKE EVERYONE ELSE'S. It is the ground
   *  the glasses are drawn against, and CW-49 measured that at 0.80 the mono
   *  frames move by up to 0.74% of their pixels while at 0.82 they do not
   *  move at all. */
  headTier: 0.82,
  headHueDeg: 30,
};

/**
 * How far from a spot other figures are counted when looking for a busy
 * stretch of pavement.
 *
 * ★★ AND "BUSY" IS A SMALLER WORD HERE THAN IT SOUNDS. Measured at this head,
 * PERSON_SPACING_M is 26 m and the DENSEST 25 m neighbourhood in the whole of
 * Seattle holds SEVEN figures - six other people over a 50 m circle, in a city
 * 2,627 x 2,644 m across. So this bias does NOT hide the traveler in a crowd;
 * there is no crowd. What it buys is that the traveler is found among people
 * rather than alone on an empty street, which is the character of the thing.
 */
export const TRAVELER_BUSY_RADIUS_M = 25;
/** How far the traveler is kept from the spawn, so the reward is walked to. */
export const TRAVELER_MIN_FROM_SPAWN_M = 150;

/**
 * Choose where a city's traveler stands: deterministic per city, biased toward
 * the busiest pavement, and never within sight of the spawn.
 *
 * ★ O(n), not O(n²). Scoring 3,029 spots against each other is nine million
 * distance tests; bucketing them into cells the size of the search radius
 * answers the same question in one pass, and the answer is a BIAS rather than
 * an exact maximum, so the approximation costs nothing real.
 *
 * @param {{x: number, y: number, pose: string, facing: number}[]} spots
 * @param {string} citySlug
 * @param {{spawnX?: number, spawnY?: number}} [options]
 * @returns {{x: number, y: number, facing: number, neighbours: number}|null}
 */
export function pickTravelerSpot(spots, citySlug, options = {}) {
  if (!Array.isArray(spots) || spots.length === 0) return null;
  const { spawnX = null, spawnY = null } = options;
  const R = TRAVELER_BUSY_RADIUS_M;

  const key = (x, y) => Math.floor(x / R) + ',' + Math.floor(y / R);
  const counts = new Map();
  for (const s of spots)
    counts.set(key(s.x, s.y), (counts.get(key(s.x, s.y)) ?? 0) + 1);

  // A spot's neighbourhood is its own cell plus the eight around it.
  const scoreOf = (s) => {
    const cx = Math.floor(s.x / R);
    const cy = Math.floor(s.y / R);
    let n = 0;
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        n += counts.get(cx + dx + ',' + (cy + dy)) ?? 0;
    return n;
  };

  const far =
    spawnX === null || spawnY === null
      ? () => true
      : (s) =>
          Math.hypot(s.x - spawnX, s.y - spawnY) >= TRAVELER_MIN_FROM_SPAWN_M;

  // A standing figure's spot, so the traveler is not planted mid-stride
  // through a bench; the pose itself is always 'standing'.
  let pool = spots.filter((s) => s.pose !== 'sitting' && far(s));
  // ★ NEVER RETURN NULL FOR A CITY THAT HAS PEOPLE. If nothing is far enough
  // from the spawn - a small extract, or a spawn in the middle of everything -
  // the distance is what gives way, not the traveler.
  if (pool.length === 0) pool = spots.filter((s) => s.pose !== 'sitting');
  if (pool.length === 0) pool = spots;

  const scored = pool.map((s) => ({ s, n: scoreOf(s) }));
  scored.sort((a, b) => b.n - a.n || a.s.x - b.s.x || a.s.y - b.s.y);
  // The busiest tenth, then one of those by the city's own hash - so the spot
  // is stable per city but not always the single densest, which would put
  // every city's traveler in the same kind of place.
  const top = scored.slice(0, Math.max(1, Math.floor(scored.length * 0.1)));
  let h = 2166136261 >>> 0;
  const slug = String(citySlug);
  for (let i = 0; i < slug.length; i++) {
    h = (h ^ slug.charCodeAt(i)) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  const pick = top[h % top.length];
  return {
    x: pick.s.x,
    y: pick.s.y,
    facing: pick.s.facing,
    neighbours: pick.n,
  };
}

/**
 * One blind traveler, built STANDALONE and added to the scene beside the
 * fireworks rather than inside the city group.
 *
 * ★★ IT CANNOT LIVE IN THE CITY GROUP, AND THE CONTROLLER'S OWN ORDER SAYS SO.
 * `buildStreetProps(model, collision)` runs while the city is being built, and
 * the saved progress is not read until much later - so at build time nothing
 * knows whether this city's traveler has been found, or where they were put.
 * Finding them also MOVES them (to the spawn, as the companion), and rebuilding
 * a city's props to move one person is absurd. `buildFireworks` is the
 * precedent and this follows it exactly.
 *
 * ★ THE MESH BORROWS SURFACE_CLASS.PERSON, WHICH IS NOT A BORROW SO MUCH AS
 * THE RIGHT VOICE. The span table is full at 16 (CW-43's law), and PERSON is
 * literally what this is: the vocabulary CW-45 built to draw a small standing
 * person. Zero new class ids.
 *
 * ★ AND CW-56'S BUILDERS GUARD CANNOT SEE THIS MESH. That guard enumerates
 * `buildStreetProps` only, so a standalone builder is outside it - the same gap
 * CW-64 found for `fireworks`. The guard is widened to ask the standalone
 * builders too.
 *
 * @param {string} citySlug - seeds the body, so a city's traveler is stable
 * @returns {{group: Group, place: Function, isPlaced: () => boolean,
 *            position: () => [number, number]|null,
 *            setMapView: Function, dispose: Function}}
 */
export function buildTraveler(citySlug) {
  const group = new Group();
  group.name = 'traveler-group';
  group.visible = false;

  // ★ The body comes from a stream of the traveler's OWN, seeded from the city
  // name. A draw taken from a road's stream would shift the pose and build of
  // every figure planted after it (the CW-45/46 seed law) - and this is built
  // outside every road's stream anyway, which is the belt to that braces.
  let h = 2166136261 >>> 0;
  for (let i = 0; i < String(citySlug).length; i++) {
    h = (h ^ String(citySlug).charCodeAt(i)) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  const spec = makeTravelerSpec(makeLcg(h), {
    caneSide: h & 1 ? 1 : -1,
  });

  const material = new MeshLambertMaterial({
    color: 0xffffff,
    vertexColors: true,
  });
  let mesh = null;
  let at = null;

  // ★★ EXACT BLACK, not a dark colour. The converter renders exact black as an
  // EMPTY CELL (CW-5), which is the only true dark this medium has - these
  // palettes carry no dark neutral at all (CW-58 measured every bird landing
  // white). A hole across the eyes of a bright head is CW-40's law used on
  // purpose rather than worked around.
  const glassesTint = [0, 0, 0];

  const clear = () => {
    if (!mesh) return;
    group.remove(mesh);
    mesh.geometry.dispose();
    mesh = null;
  };

  /**
   * Stand the traveler at a spot, facing a direction. Cheap enough to call on
   * a find (it is ONE figure), which is what lets the same object be both the
   * hidden traveler and the companion who turns up by the spawn afterwards.
   */
  const place = (x, y, facingRad) => {
    clear();
    const L = TRAVELER_LOOK;
    // ★ inGamutChroma, not raw chroma: tintOf CLAMPS, and a clamped channel
    // silently voids the luminance promise the monochrome schemes read (CW-49).
    const jacketTint = tintOf(
      L.jacketTier,
      L.jacketHueDeg,
      inGamutChroma(L.jacketTier, L.jacketHueDeg, L.jacketChroma)
    );
    const legTint = tintOf(L.legTier, 240, 0);
    const headTint = tintOf(
      L.headTier,
      L.headHueDeg,
      inGamutChroma(L.headTier, L.headHueDeg, 0.5)
    );
    const caneTint = tintOf(L.caneTier, 0, 0);
    const zones = makeFigureGeoms(x, y, facingRad, {
      ...spec,
      cane: { thickM: L.caneThickM, reachM: L.caneReachM, tipZ: 0 },
    });
    for (const g of zones.torso) paintGeometry(g, jacketTint);
    for (const g of zones.legs) paintGeometry(g, legTint);
    for (const g of zones.figure) paintGeometry(g, headTint);
    for (const g of zones.cane) paintGeometry(g, caneTint);
    for (const g of zones.glasses) paintGeometry(g, glassesTint);
    const all = [
      ...zones.legs,
      ...zones.torso,
      ...zones.figure,
      ...zones.cane,
      ...zones.glasses,
    ];
    const merged = mergeGeometries(all, false);
    for (const g of all) g.dispose();
    mesh = new Mesh(merged, material);
    // The name is what the class pass reads; see CLASS_BY_MESH_NAME.
    mesh.name = 'traveler';
    group.add(mesh);
    group.visible = true;
    at = [x, y];
  };

  return {
    group,
    spec,
    place,
    isPlaced: () => mesh !== null,
    position: () => (at ? [at[0], at[1]] : null),
    /** Street furniture hides on the map; so does a person. */
    setMapView(isMap) {
      group.visible = !isMap && mesh !== null;
    },
    dispose() {
      clear();
      material.dispose();
    },
  };
}
