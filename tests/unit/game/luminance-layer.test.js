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

describe('the luminance layer: the three columns', () => {
  it('starts at stock, so nothing changes until the owner chooses', () => {
    expect(LUMINANCE_LAYER_DEFAULT).toBe('stock')
    expect(LUMINANCE_LAYER.stock).toEqual({
      reverseAt: MONO_REVERSE_THRESHOLD,
      reverseShareCap: null,
      reverseLiftMax: 0,
      storefrontScale: 1,
    })
  })

  it('puts a lit shopfront on the right side of the cliff in each treatment', () => {
    const band = (mode) => BRIGHTEST_PAINT * LUMINANCE_LAYER[mode].storefrontScale
    // Stock: the brightest thing in the picture, well above the cliff, which
    // is why a row of shopfronts reads as a row of solid blocks.
    expect(band('stock')).toBeGreaterThan(MONO_REVERSE_THRESHOLD)
    expect(band('stock')).toBeCloseTo(0.937, 3)
    // Calm: still clearly lit, still above the cliff (it is the SHARE that is
    // bounded there, not the band), but no longer the whitest thing on screen.
    expect(band('calm')).toBeGreaterThan(MONO_REVERSE_THRESHOLD)
    expect(band('calm')).toBeLessThan(band('stock'))
    expect(band('calm')).toBeCloseTo(0.872, 3)
    // Off: BELOW the cliff by construction, so a shopfront reads as bright
    // characters rather than a slab even if reverse video came back.
    expect(band('off')).toBeLessThan(MONO_REVERSE_THRESHOLD)
    expect(band('off')).toBeCloseTo(0.778, 3)
    // ...and still lit: above the converter's blank floor of 0.5.
    expect(band('off')).toBeGreaterThan(0.5)
  })

  it('turns reverse video off only in the off treatment', () => {
    expect(LUMINANCE_LAYER.stock.reverseAt).toBe(MONO_REVERSE_THRESHOLD)
    expect(LUMINANCE_LAYER.calm.reverseAt).toBe(MONO_REVERSE_THRESHOLD)
    expect(LUMINANCE_LAYER.off.reverseAt).toBeNull()
  })

  it('caps the share only in the calm treatment', () => {
    expect(LUMINANCE_LAYER.stock.reverseShareCap).toBeNull()
    expect(LUMINANCE_LAYER.off.reverseShareCap).toBeNull()
    expect(LUMINANCE_LAYER.calm.reverseShareCap).toBe(0.01)
    // The cap has to sit above what a STANDING street already paints, or the
    // treatment would suppress the layer everywhere rather than bound a sweep:
    // the lamp-lit pose measures 0.39 % standing and passes 2 % in a look.
    expect(LUMINANCE_LAYER.calm.reverseShareCap).toBeGreaterThan(0.004)
    expect(LUMINANCE_LAYER.calm.reverseShareCap).toBeLessThan(0.02)
  })

  it('cannot lift the threshold past the lit band, so calm never becomes off', () => {
    // MEASURED: without this bound, a pose in front of a wall of shopfronts -
    // where the natural solid share is four times the cap - lifted the
    // threshold until every band had gone, a slow fade to `off` that then
    // oscillated (10,164 crossings over 47 standing frames). The bands are all
    // painted at ONE luminance, so no threshold keeps some and drops the rest.
    const band = BRIGHTEST_PAINT * LUMINANCE_LAYER.calm.storefrontScale
    const headroom = band - LUMINANCE_LAYER.calm.reverseAt
    expect(headroom).toBeGreaterThan(0)
    expect(LUMINANCE_LAYER.calm.reverseLiftMax).toBeLessThan(headroom)
    // ...and the lift is still large enough to bound a sweeping lamp cone,
    // which needed under 0.05 to come back under the cap.
    expect(LUMINANCE_LAYER.calm.reverseLiftMax).toBeGreaterThanOrEqual(0.05)
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
