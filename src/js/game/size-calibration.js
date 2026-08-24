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

import { CHAR_SCALE_DEFAULT } from './walk-controls.js';

/** The 30 fps bar, in convert milliseconds (the governor's own ceiling). */
export const CALIBRATION_BAR_MS = 33;

/** The owner's range: the calibrated size lives in [10%, 30%]. */
export const CALIBRATION_CANDIDATES = [0.1, 0.3];

/** None of the range holds: the floor parks here and the default stays. */
export const CALIBRATION_FALLBACK_FLOOR = 0.3;

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
  if (Number.isFinite(currentScale)) {
    const onScreen = CALIBRATION_CANDIDATES.find(
      (s) => Math.abs(s - currentScale) < EPS
    );
    // A smaller candidate that already holds has decided the pick — the
    // shortcut must not reopen it.
    const decidedBelow =
      onScreen !== undefined &&
      CALIBRATION_CANDIDATES.some((s) => {
        if (s >= onScreen - EPS) return false;
        const r = forScale(readings, s);
        return r !== undefined && r.avgMs <= barMs;
      });
    if (
      onScreen !== undefined &&
      !decidedBelow &&
      !forScale(readings, onScreen) &&
      !dominatedByFailure(readings, onScreen, barMs)
    ) {
      return onScreen;
    }
  }
  for (const candidate of CALIBRATION_CANDIDATES) {
    const reading = forScale(readings, candidate);
    if (!reading) {
      if (dominatedByFailure(readings, candidate, barMs)) continue;
      return candidate;
    }
    if (reading.avgMs <= barMs) return null;
  }
  return null;
}

/**
 * The decision: the smallest measured candidate holding the bar, or the
 * honest fallback (floor parks at 30%, the default stays the game's own —
 * the fallback must never pretend a size the machine cannot hold).
 *
 * @param {Array<{scale: number, avgMs: number, samples: number}>} readings
 * @param {number} [barMs]
 * @returns {{floorScale: number, defaultScale: number, fallback: boolean}}
 */
export function chooseCalibratedSize(readings, barMs = CALIBRATION_BAR_MS) {
  for (const candidate of CALIBRATION_CANDIDATES) {
    const reading = forScale(readings, candidate);
    if (reading && reading.avgMs <= barMs) {
      return {
        floorScale: candidate,
        defaultScale: candidate,
        fallback: false,
      };
    }
  }
  return {
    floorScale: CALIBRATION_FALLBACK_FLOOR,
    defaultScale: CHAR_SCALE_DEFAULT,
    fallback: true,
  };
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
    CALIBRATION_CANDIDATES.some((s) => forScale(readings, s) !== undefined) ||
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

/** The stored spelling of "no candidate held" (floor 30%, default stays). */
export const CALIBRATION_FALLBACK_TOKEN = 'fallback';

/**
 * The persisted shape of a calibration result. A normal pick stores its
 * scale; the fallback stores a token, because its floor and default differ
 * and a bare number could not say so.
 *
 * @param {{floorScale: number, fallback: boolean}} result
 * @returns {string}
 */
export function encodeCalibration(result) {
  if (!result || result.fallback) return CALIBRATION_FALLBACK_TOKEN;
  return String(result.floorScale);
}

/**
 * Read a stored calibration back. Junk — absent, unparseable, or a value
 * that is not one of the candidates — reads as null: this machine holds no
 * trusted calibration, and the caller falls back to the uncalibrated seed.
 *
 * @param {string|null|undefined} raw straight from localStorage
 * @returns {{floorScale: number, defaultScale: number, fallback: boolean}|null}
 */
export function decodeCalibration(raw) {
  if (raw === CALIBRATION_FALLBACK_TOKEN) {
    return {
      floorScale: CALIBRATION_FALLBACK_FLOOR,
      defaultScale: CHAR_SCALE_DEFAULT,
      fallback: true,
    };
  }
  const value = parseFloat(raw ?? '');
  const candidate = CALIBRATION_CANDIDATES.find(
    (s) => Math.abs(s - value) < EPS
  );
  if (candidate === undefined) return null;
  return { floorScale: candidate, defaultScale: candidate, fallback: false };
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
