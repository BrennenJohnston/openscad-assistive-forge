import { describe, it, expect } from 'vitest'
import {
  CALIBRATION_BAR_MS,
  CALIBRATION_FLOOR_LADDER,
  CALIBRATION_FALLBACK_TOKEN,
  CALIBRATION_MIN_SAMPLES,
  CALIBRATION_PHASE_BUDGET_MS,
  CALIBRATION_PHASE_TIMEOUT_MS,
  CALIBRATION_RAISE_PASSES,
  CALIBRATION_SAMPLES_PER_SCALE,
  CALIBRATION_SETTLE_CONVERTS,
  CITY_DEFAULT_CHAR_SCALE,
  nextProbeScale,
  chooseCalibratedSize,
  raiseFloor,
  isConclusive,
  createProbePhase,
  stepProbePhase,
  encodeCalibration,
  decodeCalibration,
  decomposeCost,
} from '../../../src/js/game/size-calibration.js'

const BAR = CALIBRATION_BAR_MS

const holds = (scale) => ({ scale, avgMs: BAR - 5, samples: 20 })
const fails = (scale) => ({ scale, avgMs: BAR + 20, samples: 20 })

/**
 * CW-72 rewrote what this module is FOR. It used to pick a landing - the size
 * this machine would open at - from two candidates, one of which was below the
 * game's default, so two machines opened two different games. It now measures
 * a FLOOR: everybody starts at one size, and a machine that cannot hold it is
 * moved UP the ladder, never down, and only after two passes agree.
 */

describe('calibration constants', () => {
  it('has one default, and a ladder that starts there and only goes up', () => {
    expect(CITY_DEFAULT_CHAR_SCALE).toBe(0.3)
    expect(CALIBRATION_FLOOR_LADDER[0]).toBe(CITY_DEFAULT_CHAR_SCALE)
    for (let i = 1; i < CALIBRATION_FLOOR_LADDER.length; i++) {
      expect(CALIBRATION_FLOOR_LADDER[i]).toBeGreaterThan(
        CALIBRATION_FLOOR_LADDER[i - 1]
      )
    }
    // Nothing on the ladder is below the default: this is a floor, and a floor
    // that could go below the size everyone else has is a landing again.
    for (const rung of CALIBRATION_FLOOR_LADDER) {
      expect(rung).toBeGreaterThanOrEqual(CITY_DEFAULT_CHAR_SCALE)
    }
    // CW-41: 10% and 20% are the same 2x4 pixel cell (the 3 px font floor), so
    // neither can be a rung - measuring both would measure one thing twice.
    expect(CALIBRATION_FLOOR_LADDER).not.toContain(0.1)
    expect(CALIBRATION_FLOOR_LADDER).not.toContain(0.2)
  })

  it('needs more than one pass to raise, so the floor cannot flap', () => {
    expect(CALIBRATION_RAISE_PASSES).toBeGreaterThan(1)
  })

  it('measures against the converter governor, not a guessed frame budget', () => {
    expect(CALIBRATION_BAR_MS).toBe(33)
  })
})

describe('nextProbeScale', () => {
  it('asks for the default first: that is the only question worth asking', () => {
    expect(nextProbeScale([])).toBe(CITY_DEFAULT_CHAR_SCALE)
  })

  it('stops the moment the default holds', () => {
    expect(nextProbeScale([holds(0.3)])).toBeNull()
  })

  it('climbs when the default fails, and stops at the first rung that holds', () => {
    expect(nextProbeScale([fails(0.3)])).toBe(0.4)
    expect(nextProbeScale([fails(0.3), fails(0.4)])).toBe(0.5)
    expect(nextProbeScale([fails(0.3), holds(0.4)])).toBeNull()
  })

  it('stops when every rung is measured', () => {
    expect(nextProbeScale([fails(0.3), fails(0.4), fails(0.5)])).toBeNull()
  })

  it('never asks for a rung a LARGER size already condemned', () => {
    // Cost falls as the cells get bigger, so a failure at 50% condemns 30%
    // and 40% without measuring them.
    expect(nextProbeScale([fails(0.5)])).toBeNull()
  })

  it('measures the size already on screen first, to spare a visible flip', () => {
    expect(nextProbeScale([], BAR, 0.5)).toBe(0.5)
    // ...but not when a smaller rung has already decided the pass.
    expect(nextProbeScale([holds(0.3)], BAR, 0.5)).toBeNull()
    // ...and not when a larger failure has already condemned it.
    expect(nextProbeScale([fails(0.5)], BAR, 0.4)).toBeNull()
  })

  it('takes no shortcut for an on-screen size that is not a rung', () => {
    expect(nextProbeScale([], BAR, 0.7)).toBe(CITY_DEFAULT_CHAR_SCALE)
  })

  it('treats an average exactly at the bar as holding', () => {
    expect(nextProbeScale([{ scale: 0.3, avgMs: BAR, samples: 20 }])).toBeNull()
  })

  it('ignores junk readings', () => {
    const junk = [
      { scale: 0.3, avgMs: Number.NaN, samples: 20 },
      { scale: 0.3, avgMs: 5, samples: 0 },
    ]
    expect(nextProbeScale(junk)).toBe(CITY_DEFAULT_CHAR_SCALE)
  })
})

describe('chooseCalibratedSize', () => {
  it('is the default when the default holds', () => {
    expect(chooseCalibratedSize([holds(0.3)])).toEqual({
      floorScale: 0.3,
      held: true,
    })
  })

  it('climbs to the first rung that holds', () => {
    expect(chooseCalibratedSize([fails(0.3), holds(0.4)])).toEqual({
      floorScale: 0.4,
      held: true,
    })
  })

  it('parks at the top rung and says so when nothing held', () => {
    // `held: false` is the honest answer: this machine did not reach the bar
    // at any size, and the record should say that rather than name a size
    // that worked.
    expect(chooseCalibratedSize([fails(0.3), fails(0.4), fails(0.5)])).toEqual({
      floorScale: 0.5,
      held: false,
    })
    expect(chooseCalibratedSize([])).toEqual({ floorScale: 0.5, held: false })
  })

  it('treats an average exactly at the bar as holding', () => {
    expect(
      chooseCalibratedSize([{ scale: 0.3, avgMs: BAR, samples: 20 }]).floorScale
    ).toBe(0.3)
  })

  it('ignores junk readings', () => {
    expect(
      chooseCalibratedSize([{ scale: 0.3, avgMs: Number.NaN, samples: 20 }])
        .held
    ).toBe(false)
  })
})

describe('raiseFloor', () => {
  const stored = (floorScale, pending = 0) => ({ floorScale, pending })

  it('takes two agreeing passes to raise, and never raises on one', () => {
    // The R6 ledger's floor-flapping item: a floor that moved on a single
    // slow reading gave a player a different size every time they opened the
    // game on a machine that was sometimes busy.
    const first = raiseFloor(stored(0.3), 0.4)
    expect(first).toEqual({ floorScale: 0.3, pending: 1 })
    expect(raiseFloor(first, 0.4)).toEqual({ floorScale: 0.4, pending: 0 })
  })

  it('one contented pass clears the count', () => {
    const pendingOnce = raiseFloor(stored(0.3), 0.4)
    expect(pendingOnce.pending).toBe(1)
    const contented = raiseFloor(pendingOnce, 0.3)
    expect(contented).toEqual({ floorScale: 0.3, pending: 0 })
    // ...so the next slow pass starts counting again from one.
    expect(raiseFloor(contented, 0.4).floorScale).toBe(0.3)
  })

  it('NEVER lowers a floor, however fast the machine measures', () => {
    for (const measured of [0.1, 0.3, 0.4]) {
      expect(raiseFloor(stored(0.5), measured)).toEqual({
        floorScale: 0.5,
        pending: 0,
      })
    }
  })

  it('starts from the default when there is nothing on record', () => {
    expect(raiseFloor(null, 0.3)).toEqual({
      floorScale: CITY_DEFAULT_CHAR_SCALE,
      pending: 0,
    })
    expect(raiseFloor(undefined, 0.5).pending).toBe(1)
  })

  it('ignores a measurement that is not a number', () => {
    expect(raiseFloor(stored(0.3, 1), Number.NaN)).toEqual({
      floorScale: 0.3,
      pending: 0,
    })
  })
})

describe('isConclusive', () => {
  it('a measured rung decides, either way', () => {
    expect(isConclusive([holds(0.3)])).toBe(true)
    expect(isConclusive([fails(0.3)])).toBe(true)
  })

  it('a comfortable manual size holding proves nothing about the ladder', () => {
    expect(isConclusive([holds(0.7)])).toBe(false)
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
  it('round-trips a settled floor', () => {
    for (const floorScale of CALIBRATION_FLOOR_LADDER) {
      const stored = encodeCalibration({ floorScale, pending: 0 })
      expect(decodeCalibration(stored)).toEqual({
        floorScale,
        pending: 0,
        migrated: false,
      })
    }
  })

  it('round-trips a floor with a pass arguing for a coarser one', () => {
    const stored = encodeCalibration({ floorScale: 0.3, pending: 1 })
    expect(stored).toBe('0.3,1')
    expect(decodeCalibration(stored)).toEqual({
      floorScale: 0.3,
      pending: 1,
      migrated: false,
    })
  })

  it('MIGRATES a CW-42 landing below the default up to it', () => {
    // CW-42 could land a machine at 10%, and a stored 10% surviving as a
    // floor would leave that machine with its own private game after this
    // release. Both of CW-42's spellings migrate.
    expect(decodeCalibration('0.1')).toEqual({
      floorScale: CITY_DEFAULT_CHAR_SCALE,
      pending: 0,
      migrated: true,
    })
    expect(decodeCalibration(CALIBRATION_FALLBACK_TOKEN)).toEqual({
      floorScale: CITY_DEFAULT_CHAR_SCALE,
      pending: 0,
      migrated: true,
    })
  })

  it('honours a stored floor ABOVE the default as a floor', () => {
    expect(decodeCalibration('0.5').floorScale).toBe(0.5)
    expect(decodeCalibration('0.5').migrated).toBe(false)
  })

  it('reads junk as null - no trusted floor, use the default', () => {
    for (const junk of [null, undefined, '', 'x', '0.25', '2']) {
      expect(decodeCalibration(junk)).toBeNull()
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
