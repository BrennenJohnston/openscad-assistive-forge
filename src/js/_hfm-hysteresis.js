/**
 * @license GPL-3.0-or-later
 */
// Temporal hysteresis for the converter's per-cell decisions (CW-68).
//
// THE PROBLEM, measured. The pick is stateless: every converted frame chooses
// each cell's glyph, drive level and reverse-video flag from that frame alone.
// A texel scrolling one pixel therefore re-rolls the glyph, and the two
// threshold cliffs - reverse video at a luminance of 0.80, the drive split at
// each level boundary - turn a one per cent drift into a whole-cell flip.
// Walking a Seattle street at 4.8 m/s re-rolls 9 to 11 per cent of facade
// glyphs EVERY frame, and mean glyph persistence is 6 to 8 frames.
//
// THE RULE. A cell keeps what it had unless the new answer is better by more
// than a dead band. Three decisions, three bands, one shape:
//
//   glyph    keep the previous glyph unless the new candidate is closer to the
//            cell's shape vector by more than `glyph` (squared 6-D distance).
//   reverse  enter reverse video above `reverseAt + reverse`, leave it below
//            `reverseAt - reverse`. Between those two it stays as it was.
//   drive    keep the previous intensity level while the cell sits within
//            `drive` of the level boundary it just crossed.
//
// The reverse cliff has a band of its OWN rather than sharing the drive one,
// because the two mistakes are not the same size. A cell that steps between
// two drive levels changes brightness; a cell that crosses the reverse cliff
// turns into a solid block with the glyph knocked out of it. Widening the
// reverse band also moves where solid cells appear at all, which is a
// question about the look of the game rather than about steadiness, so it is
// kept separate and left at the narrow value here.
//
// WHY IT IS SAFE TO HOLD. CW-52 measured a threshold-only version of this and
// dropped it: 400 changes prevented, but 2,788 cell-frames left showing the
// wrong thing, because a cell that swept across a geometry edge kept the
// glyph of the surface it had left. Two guards answer that, and they are the
// reason this is worth building at all:
//
//   * RESET ON CHANGE OF SURFACE. When the cell's surface class changes, or
//     its reverse-video state flips, the memory is dropped and the new answer
//     is taken immediately. Those are exactly the moments the content under
//     the cell became a different thing, and they are also the moments the
//     glyph VOCABULARY changes, so a held glyph might not even be legal.
//   * A HOLD EXPIRES. No cell may keep one answer for more than `holdFrames`
//     conversions. A dead band alone can hold a slowly drifting cell forever;
//     an expiry bounds the smear at a number somebody chose.
//
// Every rule here is a pure function of the numbers handed to it, because the
// GPU path evaluates the same rules in a shader and the CPU path evaluates
// them here: if the two ever disagree, a cell is painted with one decision's
// glyph and another's drive. The unit tests pin the arithmetic; the shader
// carries the same expressions in GLSL with a comment pointing here.

/** What the pack of three bands looks like when nobody has chosen one. */
export const DEFAULT_HYSTERESIS = Object.freeze({
  glyph: 0.02,
  drive: 0.02,
  reverse: 0.02,
  holdFrames: 30,
});

/**
 * The largest hold this can carry.
 *
 * The GPU path packs the hold counter and the reverse flag into ONE byte of
 * the pick target's alpha channel (`hold * 2 + reversed`), so a hold above
 * 127 could not survive the round trip. Clamped rather than rejected: a
 * caller asking for a very long hold means "as long as possible".
 */
export const MAX_HOLD_FRAMES = 127;

/**
 * Normalise a caller's options into the band pack, or null for OFF.
 *
 * @param {{glyph?: number, drive?: number, reverse?: number,
 *   holdFrames?: number}|null|false} options - null, false or an object whose
 *   bands are all zero turns it off
 * @returns {{glyph: number, drive: number, reverse: number,
 *   holdFrames: number}|null}
 */
export function normalizeHysteresis(options) {
  if (!options) return null;
  const num = (value, fallback) =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0
      ? value
      : fallback;
  const glyph = num(options.glyph, DEFAULT_HYSTERESIS.glyph);
  const drive = num(options.drive, DEFAULT_HYSTERESIS.drive);
  const reverse = num(options.reverse, DEFAULT_HYSTERESIS.reverse);
  const holdFrames = Math.min(
    MAX_HOLD_FRAMES,
    Math.max(
      1,
      Math.round(num(options.holdFrames, DEFAULT_HYSTERESIS.holdFrames))
    )
  );
  // All bands zero is off, not a no-op configuration that still costs the
  // history buffers and the extra render target.
  if (glyph <= 0 && drive <= 0 && reverse <= 0) return null;
  return { glyph, drive, reverse, holdFrames };
}

/**
 * Should this cell keep the glyph it had?
 *
 * @param {object} args
 * @param {number} args.candidate the glyph the stateless pick chose
 * @param {number} args.candidateDist2 its squared distance to the cell vector
 * @param {number} args.prevGlyph last frame's glyph, or -1 if there is none
 * @param {number} args.prevDist2 last frame's glyph measured against THIS
 *   frame's cell vector - not the distance it had when it was chosen
 * @param {number} args.band the dead band, in the same squared-distance units
 * @param {number} args.hold how many frames the previous glyph has been held
 * @param {number} args.holdFrames the expiry
 * @param {boolean} args.reset the cell's surface changed under it: take the
 *   candidate whatever the distances say
 * @returns {{glyph: number, hold: number}}
 */
export function glyphWithMemory({
  candidate,
  candidateDist2,
  prevGlyph,
  prevDist2,
  band,
  hold,
  holdFrames,
  reset,
}) {
  // `hold` counts the consecutive frames the memory has OVERRIDDEN the
  // stateless pick, not how long a glyph has been on screen: a cell the pick
  // agrees with is not being held, so its counter goes back to zero and it can
  // never expire while it is stable.
  if (
    reset ||
    prevGlyph < 0 ||
    band <= 0 ||
    hold >= holdFrames ||
    prevGlyph === candidate
  ) {
    return { glyph: candidate, hold: 0 };
  }
  // candidateDist2 is the minimum over the vocabulary, so prevDist2 is never
  // smaller; the question is only whether it is worse by more than the band.
  if (prevDist2 - candidateDist2 <= band) {
    return { glyph: prevGlyph, hold: hold + 1 };
  }
  return { glyph: candidate, hold: 0 };
}

/**
 * Reverse video with a dead band around its cliff.
 *
 * @param {number} lum cell luminance
 * @param {boolean} wasReversed last frame's answer
 * @param {number} reverseAt the shipped threshold (0.80 in the game)
 * @param {number} band half-width; 0.02 gives the 0.82 / 0.78 pair
 * @returns {boolean}
 */
export function reverseWithMemory(lum, wasReversed, reverseAt, band) {
  if (!(band > 0)) return lum >= reverseAt;
  return wasReversed ? lum >= reverseAt - band : lum >= reverseAt + band;
}

/**
 * The drive level, holding the previous one near the boundary it crossed.
 *
 * The stateless split is even: `floor(lum * levelCount)`. A cell sitting on a
 * boundary flips level on any drift at all, which is the whole-cell brightness
 * flicker; within `band` of the boundary it just crossed, it keeps what it had.
 * A jump of more than one level is a real change and is always taken.
 *
 * @param {number} lum
 * @param {number} prevIndex last frame's level, or -1
 * @param {number} levelCount
 * @param {number} band
 * @returns {number}
 */
export function driveWithMemory(lum, prevIndex, levelCount, band) {
  if (!(levelCount > 1)) return 0;
  const value = Number.isFinite(lum) ? lum : 0;
  const raw = Math.floor(value * levelCount);
  const next = raw < 0 ? 0 : raw >= levelCount ? levelCount - 1 : raw;
  if (!(band > 0) || prevIndex < 0 || prevIndex >= levelCount) return next;
  if (next === prevIndex) return next;
  if (Math.abs(next - prevIndex) > 1) return next;
  const boundary = Math.max(next, prevIndex) / levelCount;
  return Math.abs(value - boundary) < band ? prevIndex : next;
}

/**
 * Squared distance between a cell's shape vector and a glyph's.
 *
 * @param {ArrayLike<number>} cellVector six values
 * @param {ArrayLike<number>} glyphVector six values
 * @returns {number}
 */
export function shapeDistance2(cellVector, glyphVector) {
  let sum = 0;
  for (let i = 0; i < 6; i++) {
    const d = cellVector[i] - glyphVector[i];
    sum += d * d;
  }
  return sum;
}

/**
 * The per-cell memory the two paths keep between conversions.
 *
 * Held as one object so that every place that must forget - a resize, a
 * palette change, an atlas rebuild - can call `forget` and be sure it did not
 * miss an array. A stale history after a resize is not a subtle bug: the
 * arrays are a different length and the cells no longer mean the same places.
 *
 * `cls` is only written by the CPU path: the GPU path keeps the previous
 * surface class in the green channel of its own pick target, where the shader
 * can read it without a second upload.
 *
 * @param {number} cellCount
 * @returns {{cells: number, glyph: Int16Array, hold: Uint8Array,
 *   drive: Int8Array, reversed: Uint8Array, cls: Int16Array}}
 */
export function createHistory(cellCount) {
  return {
    cells: cellCount,
    glyph: new Int16Array(cellCount).fill(-1),
    hold: new Uint8Array(cellCount),
    drive: new Int8Array(cellCount).fill(-1),
    reversed: new Uint8Array(cellCount),
    cls: new Int16Array(cellCount).fill(-1),
  };
}

/**
 * The history for this grid, reallocated when the grid changed.
 *
 * @param {object|null} history
 * @param {number} cellCount
 * @returns {ReturnType<createHistory>}
 */
export function ensureHistory(history, cellCount) {
  if (history && history.cells === cellCount) return history;
  return createHistory(cellCount);
}
