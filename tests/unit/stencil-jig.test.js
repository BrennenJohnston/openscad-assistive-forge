/**
 * The registration jig, pinned against the base plate the owner printed.
 *
 * Every number here except `holeClearance` was measured off their STL by
 * DP-15, and `holeClearance` is the one the reference does not carry because
 * CAD does not need it and a printer does.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest'
import {
  JIG_DEFAULTS,
  MIN_FEATURE_EDGE_MM,
  jigFeatureCentres,
  jigFits,
  jigHolePathData,
  jigPegs,
} from '../../src/js/stencil-jig.js'
import { ringsFromPathData, areaOf } from '../../src/js/ring-geometry.js'

describe('the reference numbers', () => {
  it('matches the base plate the owner printed', () => {
    expect(JIG_DEFAULTS.pegDiameter).toBe(3.0)
    expect(JIG_DEFAULTS.keyWidth).toBe(3.0)
    expect(JIG_DEFAULTS.keyDepth).toBe(2.0)
    expect(JIG_DEFAULTS.featureInset).toBe(2.5)
    expect(JIG_DEFAULTS.pegHeight).toBe(4.4)
  })

  it('proposes a clearance the reference does not have', () => {
    // The owner's plate holes are exactly the size of their pegs: 6.99 mm2
    // against 6.99 and 6.00 against 6.00. That is a CAD fit, not a print fit.
    expect(JIG_DEFAULTS.holeClearance).toBe(0.2)
  })
})

describe('jigFeatureCentres', () => {
  it('★ puts the ROUND pegs at the top and the KEYS at the bottom', () => {
    // Four identical pegs let a plate go on rotated a half turn, and a stencil
    // laid on backwards paints one colour mirrored over five correct ones.
    const f = jigFeatureCentres(60, 60)
    expect(f.map((x) => x.kind)).toEqual(['round', 'round', 'key', 'key'])
    expect(f[0].cy).toBeLessThan(f[2].cy)
  })

  it('insets every centre from both edges', () => {
    const f = jigFeatureCentres(200, 120, 2.5)
    expect(f[0]).toMatchObject({ cx: 2.5, cy: 2.5 })
    expect(f[1]).toMatchObject({ cx: 197.5, cy: 2.5 })
    expect(f[2]).toMatchObject({ cx: 2.5, cy: 117.5 })
    expect(f[3]).toMatchObject({ cx: 197.5, cy: 117.5 })
  })
})

describe('jigFits', () => {
  const base = { plateW: 60, plateH: 60, marginMm: 15 }

  it('accepts the reference jig on the reference plate', () => {
    expect(jigFits({ ...base, ...JIG_DEFAULTS })).toEqual({
      ok: true,
      reason: null,
    })
  })

  it('refuses a hole that would break the plate edge', () => {
    const r = jigFits({ ...base, featureInset: 2, pegDiameter: 6 })
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/break the edge/)
  })

  it('refuses a hole that would reach into the design area', () => {
    const r = jigFits({ ...base, marginMm: 3, featureInset: 2.5 })
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/design area/)
  })

  it('refuses a plate too small to carry it', () => {
    const r = jigFits({ plateW: 5, plateH: 5, marginMm: 15, featureInset: 2.5 })
    expect(r.ok).toBe(false)
  })

  it('holds the edge floor exactly at the boundary', () => {
    const inset = MIN_FEATURE_EDGE_MM + (3 + 0.2) / 2
    expect(jigFits({ ...base, featureInset: inset }).ok).toBe(true)
    expect(jigFits({ ...base, featureInset: inset - 0.01 }).ok).toBe(false)
  })

  it('says nothing at all when there are no pegs to fit', () => {
    expect(jigFits({ ...base, ...JIG_DEFAULTS }).reason).toBeNull()
  })
})

describe('jigHolePathData', () => {
  const d = jigHolePathData({ plateW: 60, plateH: 60 })
  const rings = ringsFromPathData(d)

  it('cuts four features, as four subpaths of ONE path', () => {
    expect(rings).toHaveLength(4)
    // Every subpath is part of the same `d`: a hole in a path of its own is
    // not a hole, it is more material.
    expect(d.split('Z').length - 1).toBe(4)
  })

  it('makes the round holes the peg plus the clearance', () => {
    const wanted = Math.PI * ((3.0 + 0.2) / 2) ** 2
    const round = rings.slice(0, 2).map((r) => Math.abs(areaOf(r)))
    // A 48-sided polygon is a shade under the circle it approximates.
    for (const a of round) expect(a).toBeCloseTo(wanted, 1)
  })

  it('makes the keys the key plus the clearance', () => {
    const wanted = (3.0 + 0.2) * (2.0 + 0.2)
    for (const r of rings.slice(2)) {
      expect(Math.abs(areaOf(r))).toBeCloseTo(wanted, 4)
    }
  })

  it('grows every hole and never the peg', () => {
    const tight = ringsFromPathData(
      jigHolePathData({ plateW: 60, plateH: 60, holeClearance: 0 })
    )
    expect(Math.abs(areaOf(rings[3]))).toBeGreaterThan(
      Math.abs(areaOf(tight[3]))
    )
    expect(jigPegs({ plateW: 60, plateH: 60 })[3].width).toBe(3.0)
  })
})

describe('jigPegs', () => {
  it('gives the base part four pegs at the plate holes, at true size', () => {
    const pegs = jigPegs({ plateW: 60, plateH: 60 })
    expect(pegs).toHaveLength(4)
    expect(pegs[0]).toMatchObject({ kind: 'round', diameter: 3, height: 4.4 })
    expect(pegs[3]).toMatchObject({ kind: 'key', width: 3, depth: 2, height: 4.4 })
    const holes = jigFeatureCentres(60, 60)
    pegs.forEach((p, i) => {
      expect(p.cx).toBe(holes[i].cx)
      expect(p.cy).toBe(holes[i].cy)
    })
  })
})
