import { describe, it, expect } from 'vitest'
import {
  LUMINANCE_LAYER,
  LUMINANCE_LAYER_DEFAULT,
  MONO_REVERSE_THRESHOLD,
} from '../../../src/js/game/hc-palettes.js'
import { nextReverseLift } from '../../../src/js/_hfm-paint.js'

/**
 * CW-70. Three treatments of the solid bright layer, built to be compared and
 * not to be guessed between. What can be pinned without a graphics card is the
 * arithmetic: where each treatment puts a lit shopfront relative to the cliff
 * that turns it into a slab, and how the share cap behaves over frames.
 */

/** The brightest paint in the shopfront art direction: #efefef. */
const BRIGHTEST_PAINT = 0xef / 255

describe('the luminance layer: what the owner chose, twice', () => {
  it('★ draws CAPPED solid cells by default - the answer after PLAYING it', () => {
    // CW-Q74 was answered `off` from still photographs at G1, and CW-72
    // deleted the losing columns. Playing the deployed build, the owner called
    // the result sad and asked for the solid cells back, capped. This is the
    // second answer, and the reason it differs from the first is that a still
    // is not a filmstrip - a lesson this round had already written down and
    // then let a GATE question be answered from stills anyway.
    expect(LUMINANCE_LAYER_DEFAULT).toBe('calm')
    expect(LUMINANCE_LAYER.calm).toEqual({
      reverseAt: MONO_REVERSE_THRESHOLD,
      reverseShareCap: 0.01,
      reverseLiftMax: 0.06,
      storefrontScale: 0.93,
    })
  })

  it('keeps off reachable, dimming and all', () => {
    expect(LUMINANCE_LAYER.off).toEqual({
      reverseAt: null,
      reverseShareCap: null,
      reverseLiftMax: 0,
      // ★ THE PART NOBODY ASKED FOR. `off` was chosen as "no solid cells" and
      // also dims every lit shopfront band by 17 %, because the treatments
      // always moved both halves together.
      storefrontScale: 0.83,
    })
  })

  it('keeps stock as the comparison, unchanged', () => {
    expect(LUMINANCE_LAYER.stock).toEqual({
      reverseAt: MONO_REVERSE_THRESHOLD,
      reverseShareCap: null,
      reverseLiftMax: 0,
      storefrontScale: 1,
    })
  })

  it('carries all three treatments again, because the choice was reopened', () => {
    expect(Object.keys(LUMINANCE_LAYER).sort()).toEqual([
      'calm',
      'off',
      'stock',
    ])
  })

  it('★ and NONE of them lights a single extra cell', () => {
    // Measured at the Seattle spawn, standing, 30 %, mono: the lit share is
    // 4.5 % under `off`, `calm` AND `stock`. This layer only decides whether
    // an ALREADY-lit cell is drawn as a solid slab or as a character; it can
    // never lift a dark one. So monochrome's darkness - 95 % of the screen
    // blank - is structural and older than this round, and CW-Q74 is not what
    // made the city dark. Colour mode's ink floor is (see hfm-ink-budget).
    const scales = Object.values(LUMINANCE_LAYER).map((m) => m.storefrontScale)
    expect(Math.min(...scales)).toBeGreaterThan(0.5)
  })

  it('puts a lit shopfront either side of the cliff, as the two columns mean', () => {
    const band = (mode) =>
      BRIGHTEST_PAINT * LUMINANCE_LAYER[mode].storefrontScale
    // Stock: the brightest thing in the picture, above the cliff - which is
    // why a row of shopfronts read as a row of solid blocks.
    expect(band('stock')).toBeGreaterThan(MONO_REVERSE_THRESHOLD)
    expect(band('stock')).toBeCloseTo(0.937, 3)
    // Off: below the cliff by construction, so a shopfront reads as bright
    // characters even if reverse video came back...
    expect(band('off')).toBeLessThan(MONO_REVERSE_THRESHOLD)
    expect(band('off')).toBeCloseTo(0.778, 3)
    // ...and still lit: above the converter blank floor of 0.5.
    expect(band('off')).toBeGreaterThan(0.5)
    // Calm: over the cliff like stock, so the band CAN go solid, but the cap
    // bounds how much of the frame does.
    expect(band('calm')).toBeGreaterThan(MONO_REVERSE_THRESHOLD)
    expect(band('calm')).toBeCloseTo(0.8716, 4)
    expect(band('calm')).toBeLessThan(band('stock'))
  })
})

describe('the luminance layer: the share cap controller', () => {
  const CAP = 0.01

  it('does nothing at all when there is no cap', () => {
    for (const share of [0, 0.005, 0.5]) {
      expect(nextReverseLift(share, null, 0.05)).toBe(0)
    }
  })

  it('lifts the threshold while the share is over the cap', () => {
    let lift = 0
    const walk = []
    for (let frame = 0; frame < 5; frame++) {
      lift = nextReverseLift(0.05, CAP, lift)
      walk.push(Number(lift.toFixed(4)))
    }
    expect(walk).toEqual([0.01, 0.02, 0.03, 0.04, 0.05])
  })

  it('walks back down EIGHT times more slowly than it went up', () => {
    let lift = 0.05
    const down = []
    for (let frame = 0; frame < 4; frame++) {
      lift = nextReverseLift(0, CAP, lift)
      down.push(Number(lift.toFixed(5)))
    }
    expect(down).toEqual([0.04875, 0.0475, 0.04625, 0.045])
  })

  it('holds still anywhere between half the cap and the cap, so it cannot hunt', () => {
    // MEASURED, not chosen: an earlier version relaxed at three quarters of
    // the cap by half a step, and a standing pose in front of a row of lit
    // shopfronts produced 13,999 reverse crossings over 24 frames where the
    // uncapped picture produced none. One step up put the share under the
    // relax line, the next frame relaxed, the frame after was over again.
    for (const share of [0.0051, 0.007, 0.009, 0.00999]) {
      expect(nextReverseLift(share, CAP, 0.03)).toBe(0.03)
    }
    expect(nextReverseLift(0.004, CAP, 0.03)).toBeLessThan(0.03)
    expect(nextReverseLift(0.011, CAP, 0.03)).toBeGreaterThan(0.03)
  })

  it('cannot hunt: one step up must not land under the relax line', () => {
    // The property that makes a still picture stay still. Whatever the share
    // was before a rise, the frame after a successful rise either holds or
    // rises again - it can only relax if the share fell below HALF the cap,
    // which means the thing that lit those cells has gone, not that the
    // threshold overshot by a hair.
    let lift = 0
    // A share that settles just under the cap after two steps.
    const shares = [0.05, 0.02, 0.0099, 0.0099, 0.0099, 0.0099]
    const walk = shares.map((share) => {
      lift = nextReverseLift(share, CAP, lift)
      return Number(lift.toFixed(4))
    })
    expect(walk).toEqual([0.01, 0.02, 0.02, 0.02, 0.02, 0.02])
  })

  it('never lifts past its ceiling, and never below zero', () => {
    let lift = 0
    for (let frame = 0; frame < 200; frame++) lift = nextReverseLift(1, CAP, lift)
    expect(lift).toBe(0.19)
    // 0.80 + 0.19 is still under 1, so the layer is bounded, never abolished.
    expect(MONO_REVERSE_THRESHOLD + lift).toBeLessThan(1)
    for (let frame = 0; frame < 200; frame++) lift = nextReverseLift(0, CAP, lift)
    expect(lift).toBe(0)
  })

  it('is a CONTROLLER, not a clamp: it is always one frame behind', () => {
    // Red proof for the claim the record makes. The first frame of a sweep is
    // over the cap and the lift is still zero when it is drawn - the overshoot
    // is real, and the instrument's per-frame share is where it is read.
    const lift = nextReverseLift(0.05, CAP, 0)
    expect(lift).toBeGreaterThan(0)
    // Five frames of a 5 % share are needed before the threshold has moved far
    // enough to matter, which is what "one frame behind" costs in practice.
    let held = 0
    let frames = 0
    while (held < 0.05 && frames < 50) {
      held = nextReverseLift(0.05, CAP, held)
      frames++
    }
    expect(frames).toBe(5)
  })
})
