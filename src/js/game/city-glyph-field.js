/**
 * @license GPL-3.0-or-later
 */
// The glyph field: pick the character from the surface, not the screen.
//
// The reference this project works from chooses a cell's character by
// looking up the texture of whatever the ray hit, in the surface's own
// coordinates. A wall's characters therefore belong to the wall: walk past
// and they travel with it. Ours are chosen by matching the screen's luminance
// in that cell against every glyph's shape, so a step of 0.16 m re-rolls
// 8.13 % of facade cells every frame. This module is the other answer: give
// each surface a value that does not move when the camera does, and let the
// cell read it.
//
// What is pure here and why. Everything below is arithmetic on numbers and
// typed arrays - no DOM, no three.js, no canvas. The class pass and the
// converter call it; the unit tests pin it. The one impure step, reading a
// CanvasTexture's pixels, lives in city-class-pass.js where the texture is.
//
// The field is deliberately coarse, and that is the whole mechanism. A
// field at the source texture's own resolution would not be stable: a cell
// 40 m away covers hundreds of texels, so the smallest camera move would slide
// it onto a different one and the glyph would re-roll. What makes a character
// belong to a wall is that a patch of wall roughly the size of a cell shares
// one field value. So the field is box-downsampled to a lattice near the
// cell's own footprint and sampled with NEAREST. The far column is where this
// stops working - a cell out there covers many lattice squares whatever we
// choose.

/**
 * The classes whose glyph comes from the surface rather than from the screen.
 *
 * Road and curb are absent because the scene cannot serve them: `roads`,
 * `curbs` and `road-lines` carry neither a uv attribute nor a map, so there
 * is no surface coordinate to look anything up in. They are also already
 * steady (4.44 % and 4.11 % glyph change per frame walking).
 *
 * The facade cannot have both steadiness and windows. A wall's glyph only
 * stops re-rolling once a lattice square is bigger than a cell's footprint,
 * and the facade's windows live at about that same scale - so the lattice
 * that holds a wall still is the lattice that erases its windows. Glyph
 * change per frame over a 24-frame walk:
 *
 *   lattice   wall     storefront   ground   sidewalk
 *   screen    6.52 %   2.57 %       3.12 %   0.49 %
 *   64        7.28 %   4.25 %       0.27 %   0.01 %
 *   16        4.77 %   0.01 %       0.00 %   0.01 %
 *   8         0.90 %   0.01 %       0.00 %   0.01 %
 *
 * At 8 the wall is steady and the facade has become smooth diagonal bands
 * with no windows in it at all; at 64 the windows read well and the wall is
 * no steadier than on the screen pick. The facade is anchored at 64 for the
 * look of its windows, not for steadiness. Do not coarsen the lattice to win
 * the churn number back.
 *
 * The surfaces whose texture is a dither rather than a structure - ground,
 * paving, greenspace - have nothing to lose and everything to gain: the
 * ground is the worst churn in the game at 23.52 %/frame stateless.
 *
 * The ids are literals on purpose. Importing SURFACE_CLASS here would close
 * a cycle - city-class-pass.js has to import this module to build its
 * fields - and vitest does not tolerate it: the seq-metrics suite fails to
 * import with SURFACE_CLASS undefined. The same choice, for the same reason,
 * as CITY_BACKING_EXEMPT_CLASS_IDS in hc-palettes.js. A unit case asserts
 * every number below is the class it claims to be.
 */
export const ANCHORED_CLASSES = Object.freeze([
  1, // SURFACE_CLASS.GROUND
  4, // SURFACE_CLASS.BUILDING_WALL
  5, // SURFACE_CLASS.BUILDING_ROOF
  6, // SURFACE_CLASS.STOREFRONT
  13, // SURFACE_CLASS.SIDEWALK
  14, // SURFACE_CLASS.GREEN
]);
const ANCHORED = new Set(ANCHORED_CLASSES);

/** @returns {boolean} whether this class takes its glyph from the surface */
export function isAnchoredClass(classId) {
  return ANCHORED.has(classId);
}

/**
 * How many steps the texel ladder has.
 *
 * The field byte written into the class pass's G channel is `level + 1`, so 0
 * can keep meaning "no field here, use the screen pick" - which is what every
 * unclassified mesh, every non-anchored class and the sky all write. That caps
 * the ladder at 254; 8 is the value in use.
 */
export const FIELD_LEVELS = 8;

/** Rec. 601 luma, the same weighting the converter's own sampler uses. */
export function luminance(r, g, b) {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/**
 * A 0..1 luminance to a ladder step.
 *
 * @param {number} lum 0..1
 * @param {number} levels
 * @returns {number} 0..levels-1
 */
export function quantiseLevel(lum, levels = FIELD_LEVELS) {
  if (!(lum > 0)) return 0;
  const step = Math.floor(lum * levels);
  return step >= levels ? levels - 1 : step;
}

/**
 * The lattice a source texture is reduced to.
 *
 * Both axes are divided by the same integer factor, so a bay stays the shape
 * it is: reducing 512x576 to a square lattice would stretch every window.
 *
 * @param {number} w source width
 * @param {number} h source height
 * @param {number} maxSize the longest side the field may have
 * @returns {{w: number, h: number, factor: number}}
 */
export function fieldSize(w, h, maxSize) {
  const factor = Math.max(1, Math.ceil(Math.max(w, h) / maxSize));
  return {
    w: Math.max(1, Math.floor(w / factor)),
    h: Math.max(1, Math.floor(h / factor)),
    factor,
  };
}

/**
 * Box-downsample RGBA pixels into one ladder step per lattice square.
 *
 * The average is taken over the whole square rather than one sample from it,
 * because a single sample of a facade canvas lands on a window mullion as
 * often as on the glass and the field would then flicker between bays that
 * look identical.
 *
 * @param {Uint8ClampedArray|Uint8Array} rgba source pixels, w*h*4
 * @param {number} w
 * @param {number} h
 * @param {number} maxSize
 * @param {number} levels
 * @returns {{levels: Uint8Array, w: number, h: number, factor: number}}
 */
export function buildField(rgba, w, h, maxSize, levels = FIELD_LEVELS) {
  const size = fieldSize(w, h, maxSize);
  const out = new Uint8Array(size.w * size.h);
  const f = size.factor;
  for (let y = 0; y < size.h; y++) {
    for (let x = 0; x < size.w; x++) {
      let sum = 0;
      let n = 0;
      for (let sy = y * f; sy < Math.min((y + 1) * f, h); sy++) {
        for (let sx = x * f; sx < Math.min((x + 1) * f, w); sx++) {
          const i = (sy * w + sx) * 4;
          sum += luminance(rgba[i], rgba[i + 1], rgba[i + 2]);
          n++;
        }
      }
      out[y * size.w + x] = quantiseLevel(n > 0 ? sum / n : 0, levels);
    }
  }
  return { levels: out, w: size.w, h: size.h, factor: size.factor };
}

/**
 * How much ink a glyph puts on a cell, from the shape vector the converter
 * matches against: the mean of its coverage samples.
 *
 * @param {Float32Array|number[]} vector
 * @returns {number} 0..1
 */
export function glyphCoverage(vector) {
  let sum = 0;
  for (let i = 0; i < vector.length; i++) sum += vector[i];
  return vector.length > 0 ? sum / vector.length : 0;
}

/**
 * One class's ladder: for each field step, the glyph to draw.
 *
 * Matched by coverage, not by position in the row. Stepping through the
 * vocabulary in index order would hand equal screen area to every character
 * whatever its weight, and the facade row runs from a space to '@' - the
 * picture would come out flat and far too dark. Each step asks instead for the
 * glyph whose ink is nearest the tone that step stands for, so the field
 * reproduces the texture's own tonal range through whatever characters the
 * class is allowed. That also means a row with a narrow range simply reuses
 * its extremes, rather than inventing weight it does not have.
 *
 * @param {number[]} glyphIds the class's allowed atlas indices
 * @param {Array<Float32Array>} glyphVectors every glyph's shape vector
 * @param {number} levels
 * @returns {Int16Array} levels entries, each an atlas index
 */
export function buildLadder(glyphIds, glyphVectors, levels = FIELD_LEVELS) {
  const out = new Int16Array(levels);
  if (!glyphIds || glyphIds.length === 0) return out;
  const cover = glyphIds.map((id) => ({
    id,
    c: glyphCoverage(glyphVectors[id] ?? []),
  }));
  for (let level = 0; level < levels; level++) {
    // The tone this step stands for: the middle of its band, so step 0 asks
    // for the lightest tone the band covers rather than for pure black.
    const want = (level + 0.5) / levels;
    let best = cover[0];
    let bestD = Math.abs(cover[0].c - want);
    for (let i = 1; i < cover.length; i++) {
      const d = Math.abs(cover[i].c - want);
      if (d < bestD) {
        bestD = d;
        best = cover[i];
      }
    }
    out[level] = best.id;
  }
  return out;
}

/**
 * Every anchored class's ladder, keyed by class id.
 *
 * @param {Map<number, {glyphIds: number[]}>} classLookups
 * @param {Array<Float32Array>} glyphVectors
 * @param {number} levels
 * @returns {Map<number, Int16Array>}
 */
export function buildLadders(
  classLookups,
  glyphVectors,
  levels = FIELD_LEVELS
) {
  const out = new Map();
  if (!classLookups) return out;
  for (const [classId, lookup] of classLookups) {
    if (!ANCHORED.has(classId)) continue;
    if (!lookup?.glyphIds?.length) continue;
    out.set(classId, buildLadder(lookup.glyphIds, glyphVectors, levels));
  }
  return out;
}

/**
 * The glyph a cell takes from the surface, or -1 for "use the screen pick".
 *
 * -1 rather than a throw or a space: every caller has a screen pick already in
 * hand, and a field that cannot answer should fall back to it silently. That
 * is what the sky, the cars, the trees and the road all do on every frame.
 *
 * @param {Map<number, Int16Array>} ladders
 * @param {number} classId
 * @param {number} fieldByte 0 = no field, else level + 1
 * @returns {number} an atlas index, or -1
 */
export function anchoredGlyph(ladders, classId, fieldByte) {
  if (!fieldByte) return -1;
  const ladder = ladders?.get(classId);
  if (!ladder || ladder.length === 0) return -1;
  const level = fieldByte - 1;
  return ladder[level < ladder.length ? level : ladder.length - 1];
}
