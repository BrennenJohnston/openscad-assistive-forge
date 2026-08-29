/**
 * The acceptance oracle, as a test: does Forge cut the shapes the owner cut?
 *
 * The owner's six plates are in `tests/fixtures/harley/`. This builds six from
 * their drawing through the app's real modules and compares each with the
 * plate they made by hand, as intersection over union of the two cuts.
 *
 * The numbers were MEASURED by DP-17 and shown to the owner at gate G1. The
 * bars below sit 0.05 under what was measured, so ordinary drift in the
 * boolean does not redden the lane and a real change does.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { JSDOM } from 'jsdom'
import {
  splitPlateRings,
  subpathRings,
  readPlate,
  comparePlates,
  referencePlate,
} from '../../scripts/stencil-golden.mjs'
import {
  buildRegions,
  regionAt,
  platesFor,
} from '../../src/js/stencil-colours.js'
import {
  fitRingsToPlate,
  buildStencilPlate,
} from '../../src/js/stencil-plates.js'
import { boundsOf } from '../../src/js/svg-nesting.js'

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>')
globalThis.DOMParser = dom.window.DOMParser
globalThis.XMLSerializer = dom.window.XMLSerializer
globalThis.Node = dom.window.Node
const { parseSvgElements, classifyElements } = await import(
  '../../src/js/svg-preparer.js'
)

const HARLEY = join('tests', 'fixtures', 'harley')
const PLATE = { plateW: 60, plateH: 60, marginMm: 10.15, scalePercent: 100 }

/** Everything the app does between the owner's drawing and six plate SVGs. */
function forgePlates({ absorb = true, rule = 'own' } = {}) {
  const elements = classifyElements(
    parseSvgElements(readFileSync(join(HARLEY, 'sketch4.svg'), 'utf8'))
  )
  const plan = JSON.parse(readFileSync(join(HARLEY, 'harley-plan.json'), 'utf8'))
  const { regions, silhouette, lineMode } = buildRegions(elements)

  const assignment = {}
  for (const r of regions) assignment[r.key] = plan.order[0]
  let matched = 0
  for (const row of plan.regions) {
    const hit = regionAt(regions, { x: row.at[0], y: row.at[1] })
    if (hit) {
      assignment[hit.key] = row.colour
      matched += 1
    }
  }
  const cuts = platesFor(
    { palette: plan.palette, order: plan.order, assignment, rule, lineMode },
    regions,
    silhouette,
    { absorbEnclosedLines: absorb }
  )
  const contentBox = boundsOf(
    [...silhouette, ...cuts.flatMap((c) => c.rings)].flat()
  )
  const svgs = cuts.map((cut, i) =>
    buildStencilPlate({
      rings: fitRingsToPlate(cut.rings, contentBox, PLATE),
      ...PLATE,
      // The comparison is of the ART. Forge puts a cross 8 mm in from each
      // corner and the reference puts a peg hole 2.5 mm in, so no one edge
      // band drops both, and registration differs by design anyway.
      marks: false,
      layer: i + 1,
      layerCount: cuts.length,
    }).svg
  )
  return { svgs, cuts, matched, plan, contentBox, regions }
}

const iouOf = (plateSvg, n) =>
  comparePlates(
    splitPlateRings(subpathRings(/ d="([^"]*)"/.exec(plateSvg)[1])),
    readPlate(referencePlate(n)),
    { flipY: true }
  )

describe('the six plates, against the six the owner cut', () => {
  const { svgs, matched, plan } = forgePlates()

  it('finds every region the reference plan names', () => {
    expect(matched).toBe(plan.regions.length)
    expect(svgs).toHaveLength(6)
  })

  // Measured 2026-08-28: 0.999, 0.998, 0.998, 0.998, 0.724, 0.026.
  const BARS = [0.94, 0.94, 0.94, 0.94, 0.67, 0.0]
  for (let n = 1; n <= 4; n++) {
    it(`cuts plate ${n} where the owner cut it`, () => {
      const r = iouOf(svgs[n - 1], n)
      expect(r.iou).toBeGreaterThan(BARS[n - 1])
      expect(r.cutsA).toBe(r.cutsB)
      expect(r.aspectA).toBeCloseTo(r.aspectB, 2)
    })
  }

  it('★ cuts plate 5 smaller than the owner did, because they cut the rim too', () => {
    // The reference's pupil cuts are 6.587 and 7.678 mm2 where the FACE of the
    // pupil is nearer 4.5: the owner opened the pupil and the ring around it
    // together. Same four cuts, same places, a different amount of them.
    const r = iouOf(svgs[4], 5)
    expect(r.cutsA).toBe(4)
    expect(r.cutsB).toBe(4)
    expect(r.iou).toBeGreaterThan(BARS[4])
    expect(r.iou).toBeLessThan(0.95)
  })

  it('★ cuts plate 6 as two openings where the reference has four', () => {
    // The owner's plate 6 repeats plate 5's two pupil cuts exactly, so it
    // carries openings for two colours. No colour plan asks for that, and the
    // low number is the honest report of it rather than a fault in the engine.
    const r = iouOf(svgs[5], 6)
    expect(r.cutsA).toBe(2)
    expect(r.cutsB).toBe(4)
    expect(r.iou).toBeLessThan(0.2)
  })

  it('makes plate 1 the silhouette, one solid cut, at the reference size', () => {
    const r = iouOf(svgs[0], 1)
    expect(r.cutsA).toBe(1)
    expect(r.iou).toBeGreaterThan(0.99)
  })
})

describe('the two switches, measured against the same answer sheet', () => {
  it('★ loses the eye plate when enclosed lines are left open', () => {
    // The owner cut the eyes SOLID. Leaving the band between eye and pupil
    // uncut leaves an island there and halves the agreement on that plate.
    const open = forgePlates({ absorb: false })
    const closed = forgePlates({ absorb: true })
    expect(iouOf(open.svgs[3], 4).iou).toBeLessThan(0.7)
    expect(iouOf(closed.svgs[3], 4).iou).toBeGreaterThan(0.94)
  })

  it('is a different stencil under the stacked rule, as it should be', () => {
    // Stacked is the bridge-less printed method and the reference is the hand
    // method; they are not supposed to agree, and the number says so.
    const stacked = forgePlates({ rule: 'stacked' })
    expect(iouOf(stacked.svgs[1], 2).iou).toBeLessThan(0.6)
    expect(iouOf(stacked.svgs[0], 1).iou).toBeGreaterThan(0.99)
  })
})

describe('fitRingsToPlate', () => {
  const { cuts, contentBox } = forgePlates()

  it('★ fits the DESIGN, not each plate, so the colours land on each other', () => {
    // Plate 6 is the nose and the tongue. Fitted against its OWN bounds it
    // would fill the sheet; against the design's it stays where the nose is.
    const shared = fitRingsToPlate(cuts[5].rings, contentBox, PLATE)
    const alone = fitRingsToPlate(
      cuts[5].rings,
      boundsOf(cuts[5].rings.flat()),
      PLATE
    )
    const box = (rings) => boundsOf(rings.flat())
    expect(box(shared).maxY - box(shared).minY).toBeLessThan(12)
    expect(box(alone).maxY - box(alone).minY).toBeGreaterThan(39)
  })

  it('lands every plate inside the margin', () => {
    for (const cut of cuts) {
      const b = boundsOf(fitRingsToPlate(cut.rings, contentBox, PLATE).flat())
      expect(b.minX).toBeGreaterThanOrEqual(PLATE.marginMm - 0.01)
      expect(b.minY).toBeGreaterThanOrEqual(PLATE.marginMm - 0.01)
      expect(b.maxX).toBeLessThanOrEqual(PLATE.plateW - PLATE.marginMm + 0.01)
      expect(b.maxY).toBeLessThanOrEqual(PLATE.plateH - PLATE.marginMm + 0.01)
    }
  })

  it('says nothing rather than dividing by a box with no size', () => {
    expect(
      fitRingsToPlate([[{ x: 0, y: 0 }]], { minX: 0, maxX: 0, minY: 0, maxY: 0 }, PLATE)
    ).toEqual([])
  })
})
