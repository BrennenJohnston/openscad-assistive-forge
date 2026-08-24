import { describe, it, expect } from 'vitest'
import {
  CALIBRATION_BAR_MS,
  CALIBRATION_CANDIDATES,
  CALIBRATION_FALLBACK_FLOOR,
  CALIBRATION_FALLBACK_TOKEN,
  CALIBRATION_MIN_SAMPLES,
  CALIBRATION_PHASE_BUDGET_MS,
  CALIBRATION_PHASE_TIMEOUT_MS,
  CALIBRATION_SAMPLES_PER_SCALE,
  CALIBRATION_SETTLE_CONVERTS,
  nextProbeScale,
  chooseCalibratedSize,
  isConclusive,
  createProbePhase,
  stepProbePhase,
  encodeCalibration,
  decodeCalibration,
  decomposeCost,
} from '../../../src/js/game/size-calibration.js'
import { CHAR_SCALE_DEFAULT } from '../../../src/js/game/walk-controls.js'

const BAR = CALIBRATION_BAR_MS

const holds = (scale) => ({ scale, avgMs: BAR - 5, samples: 20 })
const fails = (scale) => ({ scale, avgMs: BAR + 20, samples: 20 })

describe('calibration constants', () => {
  it('candidates are the two real sizes in [10%, 30%], smallest first', () => {
    // CW-41: the converter's 3px font floor makes 10% and 20% the same
    // rendered picture, so the owner's range holds exactly two costs.
    expect(CALIBRATION_CANDIDATES).toEqual([0.1, 0.3])
  })

  it('the bar is the converter governor ceiling (33 ms = 30 fps)', () => {
    expect(CALIBRATION_BAR_MS).toBe(33)
  })
})

describe('nextProbeScale', () => {
  it('asks for the smallest candidate first', () => {
    expect(nextProbeScale([])).toBe(0.1)
  })

  it('moves up when the smallest candidate failed', () => {
    expect(nextProbeScale([fails(0.1)])).toBe(0.3)
  })

  it('stops the moment the smallest candidate holds', () => {
    expect(nextProbeScale([holds(0.1)])).toBeNull()
  })

  it('stops when every candidate is measured', () => {
    expect(nextProbeScale([fails(0.1), holds(0.3)])).toBeNull()
    expect(nextProbeScale([fails(0.1), fails(0.3)])).toBeNull()
  })

  it('never asks for a candidate a larger size already condemned', () => {
    // Cost falls as scale rises: 30% failing proves 10% cannot hold.
    expect(nextProbeScale([fails(0.3)])).toBeNull()
  })

  it('a failed entry size above the range condemns the whole range', () => {
    expect(nextProbeScale([fails(0.5)])).toBeNull()
  })

  it('an entry size that holds proves nothing about smaller sizes', () => {
    expect(nextProbeScale([holds(0.5)])).toBe(0.1)
  })

  it('measures the size already on screen first (no visible flip)', () => {
    expect(nextProbeScale([], BAR, 0.3)).toBe(0.3)
  })

  it('on-screen preference agrees with the failure of the size below it', () => {
    expect(nextProbeScale([fails(0.1)], BAR, 0.3)).toBe(0.3)
  })

  it('a smaller candidate that holds is decided — the on-screen size is not reopened', () => {
    expect(nextProbeScale([holds(0.1)], BAR, 0.3)).toBeNull()
  })

  it('on-screen preference still honors domination by a larger failure', () => {
    expect(nextProbeScale([fails(0.5)], BAR, 0.3)).toBeNull()
    expect(nextProbeScale([fails(0.3)], BAR, 0.1)).toBeNull()
  })

  it('a non-candidate on-screen size takes no shortcut', () => {
    expect(nextProbeScale([], BAR, 0.5)).toBe(0.1)
    expect(nextProbeScale([], BAR, null)).toBe(0.1)
  })

  it('an average exactly at the bar holds', () => {
    expect(nextProbeScale([{ scale: 0.1, avgMs: BAR, samples: 20 }])).toBeNull()
  })

  it('ignores junk readings', () => {
    const junk = [
      { scale: 0.1, avgMs: NaN, samples: 20 },
      { scale: 0.1, avgMs: 10, samples: 0 },
      { scale: 0.1, avgMs: -1, samples: 20 },
      null,
      { scale: NaN, avgMs: 10, samples: 20 },
    ]
    expect(nextProbeScale(junk)).toBe(0.1)
  })
})

describe('chooseCalibratedSize', () => {
  it('picks the smallest candidate that holds, as floor AND default', () => {
    expect(chooseCalibratedSize([holds(0.1), holds(0.3)])).toEqual({
      floorScale: 0.1,
      defaultScale: 0.1,
      fallback: false,
    })
  })

  it('moves up to 30% when only it holds', () => {
    expect(chooseCalibratedSize([fails(0.1), holds(0.3)])).toEqual({
      floorScale: 0.3,
      defaultScale: 0.3,
      fallback: false,
    })
  })

  it('falls back honestly when nothing in range holds', () => {
    expect(chooseCalibratedSize([fails(0.1), fails(0.3)])).toEqual({
      floorScale: CALIBRATION_FALLBACK_FLOOR,
      defaultScale: CHAR_SCALE_DEFAULT,
      fallback: true,
    })
  })

  it('falls back when 30% failed and 10% was rightly never probed', () => {
    expect(chooseCalibratedSize([fails(0.3)]).fallback).toBe(true)
  })

  it('falls back when only the entry size above the range was measured', () => {
    // Both cases: an interrupted pass may hold readings that decide nothing.
    expect(chooseCalibratedSize([fails(0.5)]).fallback).toBe(true)
    expect(chooseCalibratedSize([holds(0.5)]).fallback).toBe(true)
  })

  it('falls back on no readings at all (a wedged or hidden entry)', () => {
    expect(chooseCalibratedSize([]).fallback).toBe(true)
  })

  it('an average exactly at the bar holds', () => {
    const result = chooseCalibratedSize([
      { scale: 0.1, avgMs: BAR, samples: 20 },
    ])
    expect(result).toEqual({
      floorScale: 0.1,
      defaultScale: 0.1,
      fallback: false,
    })
  })

  it('ignores junk readings and falls back', () => {
    const junk = [{ scale: 0.1, avgMs: NaN, samples: 20 }, null]
    expect(chooseCalibratedSize(junk).fallback).toBe(true)
  })
})

describe('isConclusive', () => {
  it('a measured candidate decides, either way', () => {
    expect(isConclusive([holds(0.1)])).toBe(true)
    expect(isConclusive([fails(0.3)])).toBe(true)
  })

  it('a failing reading above the range condemns it — conclusive', () => {
    expect(isConclusive([fails(0.5)])).toBe(true)
  })

  it('a comfortable manual size holding proves nothing about the range', () => {
    expect(isConclusive([holds(0.5)])).toBe(false)
  })

  it('no readings decide nothing', () => {
    expect(isConclusive([])).toBe(false)
    expect(isConclusive([{ scale: 0.1, avgMs: NaN, samples: 20 }])).toBe(false)
  })
})

describe('stepProbePhase', () => {
  // Feed the phase a converter whose cumulative totals grow `perConvertMs`
  // per conversion, `convertsPerStep` conversions per driver step.
  const drive = (phase, { perConvertMs, stepMs, convertsPerStep = 1, from }) => {
    const totals = from ?? { sumMs: 100, samples: 50 }
    let nowMs = 10000
    for (;;) {
      nowMs += stepMs
      totals.sumMs += perConvertMs * convertsPerStep
      totals.samples += convertsPerStep
      const result = stepProbePhase(phase, { ...totals }, nowMs)
      if (result.status !== 'sampling') return { result, totals, nowMs }
    }
  }

  it('settles, samples, and reports the average of ONLY the sampled span', () => {
    const phase = createProbePhase(0.1, 10000)
    // First step only sights the counter; settle converts carry junk cost.
    expect(
      stepProbePhase(phase, { sumMs: 100, samples: 50 }, 10000).status
    ).toBe('sampling')
    const totals = { sumMs: 100, samples: 50 }
    let nowMs = 10000
    for (let i = 0; i < CALIBRATION_SETTLE_CONVERTS; i++) {
      nowMs += 33
      totals.sumMs += 999 // atlas-rebuild-sized junk the sample must exclude
      totals.samples += 1
      expect(stepProbePhase(phase, { ...totals }, nowMs).status).toBe('sampling')
    }
    const { result } = drive(phase, {
      perConvertMs: 7,
      stepMs: 33,
      from: totals,
    })
    expect(result.status).toBe('done')
    expect(result.reading.scale).toBe(0.1)
    expect(result.reading.samples).toBe(CALIBRATION_SAMPLES_PER_SCALE)
    expect(result.reading.avgMs).toBeCloseTo(7, 9)
  })

  it('a slow machine settles for the minimum sample when the budget runs out', () => {
    const phase = createProbePhase(0.3, 10000)
    stepProbePhase(phase, { sumMs: 0, samples: 0 }, 10000)
    const { result } = drive(phase, {
      perConvertMs: 400,
      stepMs: 400,
      from: { sumMs: 0, samples: 0 },
    })
    expect(result.status).toBe('done')
    expect(result.reading.samples).toBeGreaterThanOrEqual(
      CALIBRATION_MIN_SAMPLES
    )
    expect(result.reading.samples).toBeLessThan(CALIBRATION_SAMPLES_PER_SCALE)
    expect(result.reading.avgMs).toBeCloseTo(400, 6)
  })

  it('keeps sampling below the minimum even past the budget', () => {
    const phase = createProbePhase(0.3, 10000)
    stepProbePhase(phase, { sumMs: 0, samples: 0 }, 10000)
    const totals = { sumMs: 0, samples: 0 }
    let nowMs = 10000
    // Settle first.
    for (let i = 0; i < CALIBRATION_SETTLE_CONVERTS; i++) {
      nowMs += 33
      totals.sumMs += 33
      totals.samples += 1
      stepProbePhase(phase, { ...totals }, nowMs)
    }
    // One convert, then silence well past the budget but under the
    // no-progress timeout: still sampling, never a premature reading.
    nowMs += 33
    totals.sumMs += 33
    totals.samples += 1
    expect(stepProbePhase(phase, { ...totals }, nowMs).status).toBe('sampling')
    nowMs += CALIBRATION_PHASE_BUDGET_MS + 200
    expect(stepProbePhase(phase, { ...totals }, nowMs).status).toBe('sampling')
  })

  it('abandons when the counter stops moving (hidden tab), progress-based', () => {
    const phase = createProbePhase(0.1, 10000)
    stepProbePhase(phase, { sumMs: 0, samples: 0 }, 10000)
    // No conversions at all; wall-clock alone must not produce a reading.
    let status
    for (let nowMs = 10100; nowMs < 20000; nowMs += 500) {
      status = stepProbePhase(phase, { sumMs: 0, samples: 0 }, nowMs).status
      if (status !== 'sampling') break
    }
    expect(status).toBe('abandoned')
  })

  it('never abandons a machine that is still converting, however slowly', () => {
    const phase = createProbePhase(0.1, 10000)
    stepProbePhase(phase, { sumMs: 0, samples: 0 }, 10000)
    const gap = CALIBRATION_PHASE_TIMEOUT_MS - 200
    const { result } = drive(phase, {
      perConvertMs: 50,
      stepMs: gap,
      from: { sumMs: 0, samples: 0 },
    })
    expect(result.status).toBe('done')
  })
})

describe('encodeCalibration / decodeCalibration', () => {
  it('round-trips both normal picks', () => {
    for (const scale of CALIBRATION_CANDIDATES) {
      const result = { floorScale: scale, defaultScale: scale, fallback: false }
      expect(decodeCalibration(encodeCalibration(result))).toEqual(result)
    }
  })

  it('round-trips the fallback, whose floor and default differ', () => {
    const raw = encodeCalibration({
      floorScale: CALIBRATION_FALLBACK_FLOOR,
      defaultScale: CHAR_SCALE_DEFAULT,
      fallback: true,
    })
    expect(raw).toBe(CALIBRATION_FALLBACK_TOKEN)
    expect(decodeCalibration(raw)).toEqual({
      floorScale: CALIBRATION_FALLBACK_FLOOR,
      defaultScale: CHAR_SCALE_DEFAULT,
      fallback: true,
    })
  })

  it('reads junk as null — no trusted calibration', () => {
    for (const raw of [null, undefined, '', 'abc', '0.2', '0.5', '10', 'NaN']) {
      expect(decodeCalibration(raw)).toBeNull()
    }
  })
})

describe('decomposeCost', () => {
  it('splits a pair of readings into fixed and per-cell cost', () => {
    const split = decomposeCost(
      { avgMs: 10, cells: 1000 },
      { avgMs: 20, cells: 2000 }
    )
    expect(split.fixedMs).toBeCloseTo(0, 9)
    expect(split.perCellNs).toBeCloseTo(10000, 6)
  })

  it('is order-independent', () => {
    const a = { avgMs: 12.5, cells: 151200 }
    const b = { avgMs: 6.2, cells: 37800 }
    const ab = decomposeCost(a, b)
    const ba = decomposeCost(b, a)
    expect(ab.fixedMs).toBeCloseTo(ba.fixedMs, 9)
    expect(ab.perCellNs).toBeCloseTo(ba.perCellNs, 9)
  })

  it('refuses a pair it cannot split', () => {
    expect(decomposeCost({ avgMs: 10, cells: 100 }, { avgMs: 20, cells: 100 }))
      .toBeNull()
    expect(decomposeCost(null, { avgMs: 20, cells: 200 })).toBeNull()
    expect(decomposeCost({ avgMs: 10 }, { avgMs: 20, cells: 200 })).toBeNull()
    expect(
      decomposeCost({ avgMs: NaN, cells: 100 }, { avgMs: 20, cells: 200 })
    ).toBeNull()
  })
})
