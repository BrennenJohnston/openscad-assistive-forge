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
  Vector2,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { pointInRing } from './walk-controls.js';

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
const GROUND_MARGIN_M = 200;

// Window grid: 4 m bays, 3 m storeys; the texture tile spans 4×3 bays so a
// deterministic scatter of dark windows repeats every 16 m × 9 m instead of
// every bay.
const WINDOW_BAY_W_M = 4;
const WINDOW_BAY_H_M = 3;
const WINDOW_TILE_BAYS_X = 4;
const WINDOW_TILE_BAYS_Y = 3;

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

// Building tint model. TIERS drive luminance (what monochrome sees);
// HUES are the CW-Q5/Q6 palette families (what HC quantization sees).
// The chroma component is constructed luminance-free, so two buildings in
// the same tier read identically bright in mono while quantizing to
// different colors under high contrast.
const TINT_TIERS = [0.5, 0.65, 0.8, 0.95];
const TINT_HUES_DEG = [0, 30, 60, 120, 180, 270, 300, 330];
const TINT_CHROMA = 0.45;
const STOREFRONT_TINT = [0.95, 0.95, 0.95];

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
const SIGN_BAND_BASE_M = STOREFRONT_HEIGHT_M + 0.4;
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
const ANTENNA_MAST_SIDE_M = 0.14;
const ANTENNA_MAST_MIN_M = 2.5;
const ANTENNA_MAST_MAX_M = 6;
const ANTENNA_TUFT_SPAN_M = 1.1;
const ANTENNA_TUFT_THICK_M = 0.12;
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
function tintOf(tier, hueDeg, chroma) {
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
 * Window-grid wall texture: lit window rectangles on dark grout, one 4×3-bay
 * tile with a deterministic quarter of the windows gone dark.
 * @returns {CanvasTexture|null}
 */
function createWindowTexture() {
  const bayW = 96;
  const bayH = 72;
  const c = make2dContext(bayW * WINDOW_TILE_BAYS_X, bayH * WINDOW_TILE_BAYS_Y);
  if (!c) return null;
  const { canvas, ctx } = c;

  ctx.fillStyle = '#101010';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const rand = makeLcg(0xc17b0011);
  for (let by = 0; by < WINDOW_TILE_BAYS_Y; by++) {
    for (let bx = 0; bx < WINDOW_TILE_BAYS_X; bx++) {
      const x0 = bx * bayW;
      const y0 = by * bayH;
      const dark = rand() < 0.25;
      ctx.fillStyle = dark ? '#2c2c2c' : '#dcdcdc';
      ctx.fillRect(x0 + bayW * 0.2, y0 + bayH * 0.2, bayW * 0.6, bayH * 0.56);
      // Center mullion splits each window into two panes.
      ctx.fillStyle = '#101010';
      ctx.fillRect(x0 + bayW * 0.48, y0 + bayH * 0.2, bayW * 0.04, bayH * 0.56);
    }
  }

  const tileWM = WINDOW_BAY_W_M * WINDOW_TILE_BAYS_X;
  const tileHM = WINDOW_BAY_H_M * WINDOW_TILE_BAYS_Y;
  // Side-wall v = 1 - z: the -1/tile offset puts a bay boundary at z = 0 so
  // window rows count up from each building's base.
  return makeRepeatingTexture(canvas, 1 / tileWM, 1 / tileHM, -1 / tileHM);
}

/**
 * Storefront texture: one bright glass band per 4 m bay with a dim sign
 * strip above — the ground floor glow of the reference.
 * @returns {CanvasTexture|null}
 */
function createStorefrontTexture() {
  const c = make2dContext(192, 112);
  if (!c) return null;
  const { canvas, ctx } = c;

  ctx.fillStyle = '#181818';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // Glass
  ctx.fillStyle = '#efefef';
  ctx.fillRect(
    canvas.width * 0.08,
    canvas.height * 0.3,
    canvas.width * 0.84,
    canvas.height * 0.62
  );
  // Sign band
  ctx.fillStyle = '#7a7a7a';
  ctx.fillRect(
    canvas.width * 0.08,
    canvas.height * 0.06,
    canvas.width * 0.84,
    canvas.height * 0.14
  );

  return makeRepeatingTexture(
    canvas,
    1 / WINDOW_BAY_W_M,
    1 / STOREFRONT_HEIGHT_M,
    -1 / STOREFRONT_HEIGHT_M
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

  return makeRepeatingTexture(canvas, 1 / GROUND_TILE_M, 1 / GROUND_TILE_M);
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
  }
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
export function buildCityGroup(model) {
  const group = new Group();
  group.name = 'ascii-city';
  const disposables = [];

  const windowTexture = createWindowTexture();
  const storefrontTexture = createStorefrontTexture();
  const groundTexture = createGroundTexture();
  for (const t of [windowTexture, storefrontTexture, groundTexture]) {
    if (t) disposables.push(t);
  }

  // Buildings — one merged, vertex-tinted, window-textured mesh, dressed with
  // the CW-18 signs and rooftop masts.
  const buildingGeoms = [];
  const storefrontGeoms = [];
  const signOut = { plates: [], faces: [] };
  const roadIndex = makePointGrid(SIGN_ROAD_CELL_M);
  for (const road of model.roads) {
    for (const [x, y] of road.points) roadIndex.add(x, y);
  }
  const roadDistance = (x, y) => roadIndex.nearest(x, y);
  const antennaGeoms = [];
  const antennaCutoffM = antennaHeightCutoff(model.buildings);
  let signCount = 0;
  let antennaCount = 0;

  model.buildings.forEach((building, index) => {
    const h = hashBuilding(index, building.name);
    const tint = buildingTint(index, building.name);
    const geom = extrudeBuilding(building, tint);
    if (!geom) return;
    buildingGeoms.push(geom);

    // Grounded buildings tall enough to have an upstairs get the lit
    // storefront strip; elevated parts (skybridges) do not.
    const grounded =
      building.minHeightM === 0 &&
      building.heightM >= STOREFRONT_HEIGHT_M + 1.5;
    if (grounded) {
      const strip = extrudeBuilding(building, STOREFRONT_TINT, {
        depthOverride: STOREFRONT_HEIGHT_M,
      });
      if (strip) storefrontGeoms.push(strip);
    }

    const wall = signWall(building.outer, roadDistance);
    const hueOf = (bits) => SIGN_HUES_DEG[bits % SIGN_HUES_DEG.length];

    // Shop signs over the glass: a row along the frontage, each one hashed in
    // or out so a street reads as some shops lit and some dark.
    if (
      wall &&
      grounded &&
      building.heightM >= SIGN_BAND_BASE_M + SIGN_BAND_HEIGHT_M + 0.5
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
          baseZ: SIGN_BAND_BASE_M,
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
  let buildingsMat = null;
  if (buildingGeoms.length > 0) {
    const merged = mergeGeometries(buildingGeoms, false);
    for (const geom of buildingGeoms) geom.dispose();
    buildingsMat = new MeshLambertMaterial({
      color: 0xffffff,
      map: windowTexture ?? null,
      vertexColors: true,
    });
    const mesh = new Mesh(merged, buildingsMat);
    mesh.name = 'buildings';
    group.add(mesh);
    disposables.push(merged, buildingsMat);
    buildingTriangles = merged.getAttribute('position').count / 3;
  }

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
  const ground = new Mesh(groundGeom, groundMat);
  ground.name = 'ground';
  ground.position.set((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, 0);
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
  const curbPositions = [];
  for (const road of model.roads) {
    if (UNDRAWN_ROAD_KINDS.has(road.kind)) continue;
    appendRoadRibbon(road, roadPositions, cullBounds);
    const edgeOffset = (road.widthM - CURB_WIDTH_M) / 2;
    for (const side of [edgeOffset, -edgeOffset]) {
      appendRoadRibbon(road, curbPositions, cullBounds, {
        widthM: CURB_WIDTH_M,
        offsetM: side,
        liftM: ROAD_LIFT_M + 0.02,
      });
    }
  }

  const makeFlatMesh = (positions, material, name) => {
    const geom = new BufferGeometry();
    geom.setAttribute(
      'position',
      new BufferAttribute(new Float32Array(positions), 3)
    );
    const normals = new Float32Array(positions.length);
    for (let i = 0; i < normals.length; i += 3) normals[i + 2] = 1;
    geom.setAttribute('normal', new BufferAttribute(normals, 3));
    const mesh = new Mesh(geom, material);
    mesh.name = name;
    group.add(mesh);
    disposables.push(geom, material);
    return mesh;
  };

  let roadTriangles = 0;
  let roadMat = null;
  let curbMesh = null;
  if (roadPositions.length > 0) {
    roadMat = new MeshLambertMaterial({
      color: ROAD_TONES.street,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    makeFlatMesh(roadPositions, roadMat, 'roads');
    roadTriangles = roadPositions.length / 9;

    const curbMat = new MeshLambertMaterial({
      color: CURB_TONE,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    curbMesh = makeFlatMesh(curbPositions, curbMat, 'curbs');
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
      if (curbMesh) curbMesh.visible = !isMap;
      for (const mesh of dressingMeshes) mesh.visible = !isMap;
      if (buildingsMat) {
        buildingsMat.map = isMap ? null : (windowTexture ?? null);
        buildingsMat.needsUpdate = true;
      }
      groundMat.map = isMap ? null : (groundTexture ?? null);
      if (!groundTexture || isMap) groundMat.color.setHex(0x000000);
      else groundMat.color.setHex(0xffffff);
      groundMat.needsUpdate = true;
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
const CAR_LENGTH_M = 4.4;
const CAR_WIDTH_M = 1.8;
const CAR_HEIGHT_M = 1.35;
const CAR_BODY_HEIGHT_M = 0.75;
const CAR_CABIN_INSET_M = 0.55;
const CAR_SLOT_M = 6;
const CAR_OCCUPANCY_MIN = 0.4;
const CAR_OCCUPANCY_MAX = 0.6;
const CAR_MIN_GAP_M = 5;
// Cars park along ordinary streets. Motorways, trunks and primaries get none:
// nobody leaves a car on an arterial, and their ribbons carry the through
// traffic CW-19 will animate.
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
// A dim metal stem, and a head at the very top of the street-level band: at
// glyph scale the pole is a thin dark stroke and the head a bright dash.
const POLE_TINT = tintOf(0.3, 210, 0.12);
const LAMP_HEAD_TINT = [0.97, 0.97, 0.97];

/**
 * Small spatial hash for "is anything already standing here?". Query
 * distances must not exceed the cell size, which is why the cell is bigger
 * than every gap below.
 *
 * @param {number} cellM
 */
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
  const poleGeoms = [];
  const lampHeadGeoms = [];

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
    if (!treeRng && !carRng && !lampRng) return;

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
          for (
            let s = JUNCTION_MARGIN_M + CAR_LENGTH_M / 2;
            s + CAR_LENGTH_M / 2 <= len - JUNCTION_MARGIN_M;
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
            // The whole footprint has to be clear, not just the middle.
            const hl = CAR_LENGTH_M / 2;
            const hw = CAR_WIDTH_M / 2;
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
            carGeoms.push(
              makeBox(
                CAR_LENGTH_M,
                CAR_WIDTH_M,
                CAR_BODY_HEIGHT_M,
                x,
                y,
                CAR_BODY_HEIGHT_M / 2,
                angle,
                bodyTint
              )
            );
            // Cabin: shorter, narrower, set back, and overlapping the body by
            // a hair so the two boxes never share an exact face.
            const cabinLen = CAR_LENGTH_M - CAR_CABIN_INSET_M * 2;
            const cabinBottom = CAR_BODY_HEIGHT_M - 0.05;
            const cabinH = CAR_HEIGHT_M - cabinBottom;
            const back = -CAR_CABIN_INSET_M / 2;
            carGeoms.push(
              makeBox(
                cabinLen,
                CAR_WIDTH_M - 0.2,
                cabinH,
                x + ux * back,
                y + uy * back,
                cabinBottom + cabinH / 2,
                angle,
                cabinTint
              )
            );

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
  addMerged(poleGeoms, 'lamp-poles', propMaterial());
  addMerged(lampHeadGeoms, 'lamp-heads', propMaterial());

  return {
    group,
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

  return {
    setMapBoost(isMap) {
      ambient.intensity = isMap ? AMBIENT_MAP : AMBIENT_STREET;
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
