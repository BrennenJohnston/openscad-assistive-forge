/**
 * @license GPL-3.0-or-later
 */
// CW-42 (CW-Q39): the floor knows this machine.
//
// The owner: "Lower character size should be set automatically to a range
// of 10% to 30% depending on the user's browser performance range, allowing
// for 30 fps." The signed design is BOTH: the smallest size in [10%, 30%]
// that holds 30 fps becomes the range's FLOOR and the landing DEFAULT for
// players who never chose a size themselves. A manual choice sticks.
//
// This module is the pure half: given measured convert-time readings, which
// size wins. It owns no timers, no DOM and no storage, so every branch is
// unit-testable, and the controller's probe loop stays a thin driver.
//
// WHY THE CANDIDATES ARE 10 AND 30, NOT 10/20/30 (measured, CW-41): the
// converter's 3px font floor maps 10% and 20% to the SAME rendered size
// (fontSizePx 3, cell 2x4), so the range holds exactly two distinct costs.
// Probing 20 would measure nothing 10 does not.
//
// "Holds 30 fps" operationally: convert average <= the converter's own
// 30-conversions-per-second governor ceiling (_MIN_INTERVAL_MS = 33). A
// convert that fits inside the governor's slot leaves the rAF loop its
// headroom; one that does not is exactly what the governor backs off from.

/** The 30 fps bar, in convert milliseconds (the governor's own ceiling). */
export const CALIBRATION_BAR_MS = 33;

// CW-72's one default lives with the other size constants, in walk-controls,
// and is re-exported here because every caller of this module wants it.
import { CITY_DEFAULT_CHAR_SCALE } from './walk-controls.js';
export { CITY_DEFAULT_CHAR_SCALE };

/**
 * The sizes the floor may RAISE to, in order, on a machine that cannot hold
 * the default. It never goes below: calibration is a floor now, not a landing.
 * A slower machine gets a coarser picture of the same game.
 */
export const CALIBRATION_FLOOR_LADDER = [0.3, 0.4, 0.5];

/**
 * How many consecutive slow passes it takes to raise the floor.
 *
 * One slow pass is a busy afternoon; two is a machine. The ledger's
 * floor-flapping item (R6, CW-42) is why: a floor that moved on every entry
 * gave a player a different size each time they opened the game. Nothing
 * lowers the floor automatically - only the player does, by choosing a size.
 */
export const CALIBRATION_RAISE_PASSES = 2;

/** CW-42's candidates, kept ONLY so a stored value of its shape is recognised. */
export const CALIBRATION_LEGACY_CANDIDATES = [0.1, 0.3];

/** None of the range holds: the floor parks here and the default stays. */
/** @deprecated CW-72 - the floor never parks below CITY_DEFAULT_CHAR_SCALE. */
export const CALIBRATION_FALLBACK_FLOOR = CITY_DEFAULT_CHAR_SCALE;

/** How many conversions make one honest probe reading. */
export const CALIBRATION_SAMPLES_PER_SCALE = 20;

/** The fewest conversions a reading may rest on when the budget runs out.
 * A machine slow enough to hit the budget is far from the bar anyway. */
export const CALIBRATION_MIN_SAMPLES = 5;

/** How long one phase may keep sampling before it settles for what it has
 * (with at least the minimum) — bounds entry calibration on slow machines. */
export const CALIBRATION_PHASE_BUDGET_MS = 1500;

/** A phase whose sample count stops MOVING for this long is abandoned: a
 * hidden tab converts nothing, and calibration must never wedge. Progress,
 * not wall-clock — a slow machine that still converts is allowed to finish. */
export const CALIBRATION_PHASE_TIMEOUT_MS = 3000;

/** Converted frames discarded after a size flip before sampling starts
 * (the first converts after a flip carry one-off atlas/raster work). */
export const CALIBRATION_SETTLE_CONVERTS = 2;

const EPS = 1e-9;

const isReading = (r) =>
  r &&
  Number.isFinite(r.scale) &&
  Number.isFinite(r.avgMs) &&
  r.avgMs >= 0 &&
  Number.isFinite(r.samples) &&
  r.samples > 0;

const forScale = (readings, scale) =>
  readings.find((r) => isReading(r) && Math.abs(r.scale - scale) < EPS);

// Convert cost falls as scale rises (a larger scale means fewer cells), so
// a failed reading at ANY larger scale — a candidate or the entry size —
// proves this candidate cannot hold the bar without ever probing it. The
// live pass leans on this to skip visible size flips it cannot profit from.
const dominatedByFailure = (readings, scale, barMs) =>
  readings.some(
    (r) => isReading(r) && r.scale > scale + EPS && r.avgMs > barMs
  );

/**
 * Which candidate to probe next, smallest first — or null when the answer
 * is already known. Probing stops the moment the smallest candidate holds
 * the bar (the sizes above it cannot change the pick), and never asks for
 * a candidate a larger size's failure has already condemned.
 *
 * When the size on screen is itself an undecided candidate it is measured
 * first: that reading costs no visible flip.
 *
 * @param {Array<{scale: number, avgMs: number, samples: number}>} readings
 * @param {number} [barMs]
 * @param {number|null} [currentScale] the size on screen right now
 * @returns {number|null}
 */
export function nextProbeScale(
  readings,
  barMs = CALIBRATION_BAR_MS,
  currentScale = null
) {
  // A rung that is already ON SCREEN is measured first: that reading costs no
  // visible flip, and a player who chose 50% for themselves should not watch
  // the game drop to 30% just to ask a question about it.
  if (Number.isFinite(currentScale)) {
    const onScreen = CALIBRATION_FLOOR_LADDER.find(
      (s) => Math.abs(s - currentScale) < EPS
    );
    if (
      onScreen !== undefined &&
      !forScale(readings, onScreen) &&
      !dominatedByFailure(readings, onScreen, barMs) &&
      !CALIBRATION_FLOOR_LADDER.some((s) => {
        if (s > onScreen - EPS) return false;
        const r = forScale(readings, s);
        return r !== undefined && r.avgMs <= barMs;
      })
    ) {
      return onScreen;
    }
  }
  // The ladder runs UPWARD from the one default. The pass asks one question -
  // "can this machine hold the size everybody gets?" - and, only if it cannot,
  // how far up it has to go.
  for (const rung of CALIBRATION_FLOOR_LADDER) {
    const reading = forScale(readings, rung);
    if (reading) {
      // A rung that holds ends the pass: nothing above it needs measuring.
      if (reading.avgMs <= barMs) return null;
      continue;
    }
    // A LARGER size that already failed condemns this one too (cost falls as
    // the cells get bigger), so there is nothing to learn by measuring it.
    if (dominatedByFailure(readings, rung, barMs)) continue;
    return rung;
  }
  return null;
}

/**
 * The decision: the smallest rung of the ladder this machine can hold.
 *
 * CW-72 turned this from a LANDING into a FLOOR. It answers "how coarse does
 * this machine need the picture to be", never "which size should this player
 * get" - the answer to that is CITY_DEFAULT_CHAR_SCALE for everybody, unless
 * the floor is above it.
 *
 * `held` is false when nothing on the ladder held: the floor parks at the top
 * rung, and the record says the machine did not reach the bar at any size
 * rather than pretending one worked.
 *
 * @param {Array<{scale: number, avgMs: number, samples: number}>} readings
 * @param {number} [barMs]
 * @returns {{floorScale: number, held: boolean}}
 */
export function chooseCalibratedSize(readings, barMs = CALIBRATION_BAR_MS) {
  for (const rung of CALIBRATION_FLOOR_LADDER) {
    const reading = forScale(readings, rung);
    if (reading && reading.avgMs <= barMs) {
      return { floorScale: rung, held: true };
    }
  }
  return {
    floorScale: CALIBRATION_FLOOR_LADDER[CALIBRATION_FLOOR_LADDER.length - 1],
    held: false,
  };
}

/**
 * CW-72: the floor only moves UP, and only after two passes agree.
 *
 * A floor that moved on a single reading gave a player a different size every
 * time they opened the game on a machine that was sometimes busy (the R6
 * ledger's floor-flapping item). A raise now needs
 * CALIBRATION_RAISE_PASSES consecutive passes that all want it, and one pass
 * that is happy at the current floor clears the count.
 *
 * Nothing here ever lowers a floor. A player who wants a finer picture sets
 * the size themselves, and their choice is remembered.
 *
 * @param {{floorScale: number, pending: number}|null} stored what is on record
 * @param {number} measured this pass's answer from chooseCalibratedSize
 * @param {number} [passes]
 * @returns {{floorScale: number, pending: number}}
 */
export function raiseFloor(
  stored,
  measured,
  passes = CALIBRATION_RAISE_PASSES
) {
  const floorScale = Number.isFinite(stored?.floorScale)
    ? stored.floorScale
    : CITY_DEFAULT_CHAR_SCALE;
  const pending = Number.isFinite(stored?.pending) ? stored.pending : 0;
  if (!Number.isFinite(measured) || measured <= floorScale + EPS) {
    return { floorScale, pending: 0 };
  }
  const agreed = pending + 1;
  if (agreed >= passes) return { floorScale: measured, pending: 0 };
  return { floorScale, pending: agreed };
}

/**
 * Whether a finished pass actually DECIDED anything. It did if a candidate
 * was measured, or if a failing reading at any larger size condemned the
 * whole range (cost falls as scale rises). An entry that only confirmed a
 * comfortable manual size holds proves nothing about the range — storing or
 * announcing a fallback from it would brand a fast machine as slow.
 *
 * @param {Array<{scale: number, avgMs: number, samples: number}>} readings
 * @param {number} [barMs]
 * @returns {boolean}
 */
export function isConclusive(readings, barMs = CALIBRATION_BAR_MS) {
  return (
    CALIBRATION_FLOOR_LADDER.some((s) => forScale(readings, s) !== undefined) ||
    readings.some((r) => isReading(r) && r.avgMs > barMs)
  );
}

/**
 * One probe phase's bookkeeping. The driver feeds it the converter's
 * cumulative totals once per frame via stepProbePhase; everything here is
 * plain arithmetic so the whole lifecycle is unit-testable.
 *
 * @param {number} scale the size under measurement
 * @param {number} nowMs
 */
export function createProbePhase(scale, nowMs) {
  return {
    scale,
    settleLeft: CALIBRATION_SETTLE_CONVERTS,
    baseSumMs: null,
    baseSamples: null,
    lastSamples: null,
    lastProgressMs: nowMs,
    sampleStartMs: null,
  };
}

/**
 * Advance a probe phase with the converter's cumulative totals.
 *
 * @param {ReturnType<typeof createProbePhase>} phase mutated in place
 * @param {{sumMs: number, samples: number}} totals cumulative, ever-growing
 * @param {number} nowMs
 * @returns {{status: 'sampling'}
 *   | {status: 'done', reading: {scale: number, avgMs: number, samples: number}}
 *   | {status: 'abandoned'}}
 */
export function stepProbePhase(phase, totals, nowMs) {
  if (phase.lastSamples === null) {
    phase.lastSamples = totals.samples;
    return { status: 'sampling' };
  }
  const converts = totals.samples - phase.lastSamples;
  phase.lastSamples = totals.samples;
  if (converts > 0) {
    phase.lastProgressMs = nowMs;
  } else if (nowMs - phase.lastProgressMs > CALIBRATION_PHASE_TIMEOUT_MS) {
    return { status: 'abandoned' };
  }

  if (phase.settleLeft > 0) {
    phase.settleLeft -= converts;
    if (phase.settleLeft <= 0) {
      phase.baseSumMs = totals.sumMs;
      phase.baseSamples = totals.samples;
      phase.sampleStartMs = nowMs;
    }
    return { status: 'sampling' };
  }

  const samples = totals.samples - phase.baseSamples;
  const budgetSpent =
    samples >= CALIBRATION_MIN_SAMPLES &&
    nowMs - phase.sampleStartMs > CALIBRATION_PHASE_BUDGET_MS;
  if (samples >= CALIBRATION_SAMPLES_PER_SCALE || budgetSpent) {
    return {
      status: 'done',
      reading: {
        scale: phase.scale,
        avgMs: (totals.sumMs - phase.baseSumMs) / samples,
        samples,
      },
    };
  }
  return { status: 'sampling' };
}

/** CW-42's spelling of "no candidate held". Read, never written, since CW-72. */
export const CALIBRATION_FALLBACK_TOKEN = 'fallback';

/**
 * The persisted shape: the floor, and how many consecutive passes have asked
 * to raise it. "0.3" is a settled floor; "0.3,1" is a floor with one pass
 * arguing for a coarser one.
 *
 * @param {{floorScale: number, pending?: number}} result
 * @returns {string}
 */
export function encodeCalibration(result) {
  const floorScale = Number.isFinite(result?.floorScale)
    ? result.floorScale
    : CITY_DEFAULT_CHAR_SCALE;
  const pending = Number.isFinite(result?.pending) ? result.pending : 0;
  return pending > 0 ? `${floorScale},${pending}` : String(floorScale);
}

/**
 * Read a stored floor back, MIGRATING anything CW-42 left behind.
 *
 * CW-42 stored a landing, and the landing could be BELOW the one default -
 * 10% was one of its two candidates. A stored 10% must not survive as a
 * floor, or the machine that wrote it would keep its own private game after
 * this release. So: a stored value at or above the default is honoured as a
 * floor; anything below it, and CW-42's `fallback` token, migrate to the
 * default. Junk still reads as null - no trusted floor, use the default.
 *
 * @param {string|null|undefined} raw straight from localStorage
 * @returns {{floorScale: number, pending: number, migrated: boolean}|null}
 */
export function decodeCalibration(raw) {
  if (raw === CALIBRATION_FALLBACK_TOKEN) {
    return {
      floorScale: CITY_DEFAULT_CHAR_SCALE,
      pending: 0,
      migrated: true,
    };
  }
  const [floorText, pendingText] = String(raw ?? '').split(',');
  const value = parseFloat(floorText);
  if (!Number.isFinite(value)) return null;
  const rung = CALIBRATION_FLOOR_LADDER.find((s) => Math.abs(s - value) < EPS);
  if (rung !== undefined) {
    const pending = Math.max(0, Math.trunc(parseFloat(pendingText)) || 0);
    return { floorScale: rung, pending, migrated: false };
  }
  const legacy = CALIBRATION_LEGACY_CANDIDATES.find(
    (s) => Math.abs(s - value) < EPS
  );
  if (legacy !== undefined) {
    return {
      floorScale: CITY_DEFAULT_CHAR_SCALE,
      pending: 0,
      migrated: true,
    };
  }
  return null;
}

/**
 * The CW-37 two-point solve, for the RECORD rather than the pick: split a
 * pair of readings into fixed cost and per-cell cost. Returns null when the
 * pair cannot support the split (same cell count, or missing cells).
 *
 * @param {{avgMs: number, cells: number}} a
 * @param {{avgMs: number, cells: number}} b
 * @returns {{fixedMs: number, perCellNs: number}|null}
 */
export function decomposeCost(a, b) {
  if (
    !a ||
    !b ||
    !Number.isFinite(a.cells) ||
    !Number.isFinite(b.cells) ||
    !Number.isFinite(a.avgMs) ||
    !Number.isFinite(b.avgMs) ||
    a.cells === b.cells
  ) {
    return null;
  }
  const perCellMs = (b.avgMs - a.avgMs) / (b.cells - a.cells);
  const fixedMs = a.avgMs - perCellMs * a.cells;
  return { fixedMs, perCellNs: perCellMs * 1e6 };
}
