/**
 * D-122: the plate builder used to fit a cut against the wrong canvas.
 *
 * `flattenLayers` writes each cut as `<svg viewBox="0 0 100 H"><g
 * transform="translate(..) scale(s)"><path d=RAW..>`. The path data is still
 * in the design's own units; the group transform is what puts it on the
 * 100-wide layer canvas. `buildPlateCompanions` read the viewBox for the
 * canvas and the raw `d` for the shape, so the fit scaled 119.81 units of the
 * owner's cat as if they were 100 - and 503 PIXELS of a raster trace as if
 * they were 100, which is the 285 mm cat on a 100 mm plate in the owner's own
 * export.
 *
 * Every test here does what the app does, through the same exported pieces,
 * and the last one REINSTATES the defect so the others cannot quietly go
 * vacuous: a guard that has never been seen to fail carries no information.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  parseSvgElements,
  classifyElements,
  flattenLayers,
  readLayerFile,
} from '../../src/js/svg-preparer.js'
import { buildNestingTree } from '../../src/js/svg-nesting.js'
import {
  buildStencilPlate,
  stencilLayers,
  plateFit,
  composeFit,
} from '../../src/js/stencil-plates.js'
import { subpathRings } from '../../scripts/stencil-golden.mjs'

const FIXTURES = join('tests', 'fixtures', 'harley')
const PLATE = { plateW: 100, plateH: 100, marginMm: 15, scalePercent: 100 }
// margin 15 on a 100 mm plate at 100%: the design belongs in [15, 85].
const BOX = { min: 15, max: 85 }

/** Everything the app does between a file and a plate, in one place. */
function platesFor(svgText, cap = 3) {
  const els = classifyElements(parseSvgElements(svgText))
  const tree = buildNestingTree(els)
  const vb = /viewBox="([^"]+)"/.exec(svgText)[1].split(/[\s,]+/).map(Number)
  const meta = { viewBox: vb.join(' ') }
  const canvas = { width: vb[2], height: vb[3] }
  const { layers, plateCount } = stencilLayers(
    tree,
    els.map((e) => e.role),
    cap,
    canvas
  )
  const cuts = flattenLayers(els, layers, plateCount, meta, null, { solid: true })
  const first = readLayerFile(cuts.find(Boolean))
  return { els, cuts, plateCount, first }
}

/** The cut's bounding box in plate millimetres, marks and outline removed. */
function cutBoxOf(plateSvg) {
  const d = / d="([^"]*)"/.exec(plateSvg)[1]
  const rings = subpathRings(d)
  // Subpath 0 is the plate outline; the next eight are the four corner
  // crosses, two subpaths each.
  const cut = rings.slice(9)
  if (cut.length === 0) return null
  const xs = cut.flatMap((r) => r.map((p) => p.x))
  const ys = cut.flatMap((r) => r.map((p) => p.y))
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  }
}

describe('readLayerFile', () => {
  const svg = readFileSync(join(FIXTURES, 'trace-503px.svg'), 'utf8')

  it('hands back the canvas AND the transform onto it, not one without the other', () => {
    const { first } = platesFor(svg)
    expect(first.canvasSpan).toBe(100)
    expect(first.canvasHeight).toBeGreaterThan(100)
    expect(first.transform).not.toBeNull()
    // 503-pixel units onto a 100-wide canvas: about one fifth.
    expect(first.transform.scale).toBeCloseTo(100 / 425, 2)
  })

  it('says so plainly when there is nothing to read', () => {
    expect(readLayerFile(null)).toBeNull()
    expect(readLayerFile('<svg></svg>')).toBeNull()
  })

  it('falls back to the layer canvas when a file carries no transform', () => {
    const bare = '<svg viewBox="0 0 100 125"><path d="M 0 0 H 10 V 10 Z"/></svg>'
    const r = readLayerFile(bare)
    expect(r.transform).toBeNull()
    expect(r.canvasSpan).toBe(100)
    expect(r.canvasHeight).toBe(125)
  })
})

describe('composeFit', () => {
  it('maps a point the same way as applying both transforms in turn', () => {
    const fit = { scale: 0.5, dx: 10, dy: 4 }
    const pre = { scale: 0.2, dx: -3, dy: 7 }
    const one = composeFit(fit, pre)
    const p = { x: 40, y: 25 }
    const twice = {
      x: fit.scale * (pre.scale * p.x + pre.dx) + fit.dx,
      y: fit.scale * (pre.scale * p.y + pre.dy) + fit.dy,
    }
    expect(one.scale * p.x + one.dx).toBeCloseTo(twice.x, 9)
    expect(one.scale * p.y + one.dy).toBeCloseTo(twice.y, 9)
  })

  it('leaves the fit alone when there is nothing to compose', () => {
    const fit = { scale: 2, dx: 1, dy: 3 }
    expect(composeFit(fit, null)).toBe(fit)
  })
})

describe('a plate built from a drawing whose units are pixels', () => {
  const svg = readFileSync(join(FIXTURES, 'trace-503px.svg'), 'utf8')
  const { cuts, plateCount, first } = platesFor(svg)

  it('makes three plates from three nested shapes', () => {
    expect(plateCount).toBe(3)
  })

  it('lands every plate cut inside the design box', () => {
    for (let plate = 1; plate <= plateCount; plate++) {
      const cut = readLayerFile(cuts[plate - 1])
      const { svg: plateSvg } = buildStencilPlate({
        cutPathData: cut.pathData,
        cutTransform: first.transform,
        canvasSpan: first.canvasSpan,
        canvasHeight: first.canvasHeight,
        ...PLATE,
        marks: true,
        layer: plate,
        layerCount: plateCount,
      })
      const box = cutBoxOf(plateSvg)
      expect(box.minX, `plate ${plate} left`).toBeGreaterThanOrEqual(BOX.min - 0.01)
      expect(box.maxX, `plate ${plate} right`).toBeLessThanOrEqual(BOX.max + 0.01)
      expect(box.minY, `plate ${plate} top`).toBeGreaterThanOrEqual(BOX.min - 0.01)
      expect(box.maxY, `plate ${plate} bottom`).toBeLessThanOrEqual(BOX.max + 0.01)
    }
  })

  it('fills the design box with plate 1, so the fix is not just a shrink', () => {
    const cut = readLayerFile(cuts[0])
    const { svg: plateSvg } = buildStencilPlate({
      cutPathData: cut.pathData,
      cutTransform: first.transform,
      canvasSpan: first.canvasSpan,
      canvasHeight: first.canvasHeight,
      ...PLATE,
      marks: true,
      layer: 1,
      layerCount: plateCount,
    })
    const box = cutBoxOf(plateSvg)
    // The taller axis fills the 70 mm box; the design is 425 x 590 pixels.
    expect(box.maxY - box.minY).toBeCloseTo(70, 0)
    expect(box.maxX - box.minX).toBeCloseTo((70 * 425) / 590, 0)
  })

  it('THE DEFECT, REINSTATED: dropping the transform puts the cut off the design box', () => {
    const cut = readLayerFile(cuts[0])
    const { svg: plateSvg } = buildStencilPlate({
      cutPathData: cut.pathData,
      // What the plate builder used to do: the canvas from the viewBox, the
      // path data straight out of the file, and no transform between them.
      cutTransform: null,
      canvasSpan: first.canvasSpan,
      canvasHeight: first.canvasHeight,
      ...PLATE,
      marks: true,
      layer: 1,
      layerCount: plateCount,
    })
    const box = cutBoxOf(plateSvg)
    expect(box.maxX).toBeGreaterThan(BOX.max)
    expect(box.maxY).toBeGreaterThan(BOX.max)
    // Not a near miss: a 425-pixel design fitted as 100 units is 4.25 times
    // over, so the cut runs clean off a 100 mm plate.
    expect(box.maxY).toBeGreaterThan(PLATE.plateH)
  })
})

describe("the owner's own cat", () => {
  const svg = readFileSync(join(FIXTURES, 'sketch4.svg'), 'utf8')
  const { cuts, plateCount, first } = platesFor(svg)

  it('is 119.813 units wide and normalizes onto the 100-wide canvas', () => {
    expect(first.canvasSpan).toBe(100)
    expect(first.transform.scale).toBeCloseTo(100 / 119.813, 4)
  })

  it('lands inside the design box on every plate', () => {
    for (let plate = 1; plate <= plateCount; plate++) {
      const cut = readLayerFile(cuts[plate - 1])
      const { svg: plateSvg } = buildStencilPlate({
        cutPathData: cut.pathData,
        cutTransform: first.transform,
        canvasSpan: first.canvasSpan,
        canvasHeight: first.canvasHeight,
        ...PLATE,
        marks: true,
        layer: plate,
        layerCount: plateCount,
      })
      const box = cutBoxOf(plateSvg)
      expect(box.minX, `plate ${plate} left`).toBeGreaterThanOrEqual(BOX.min - 0.01)
      expect(box.maxX, `plate ${plate} right`).toBeLessThanOrEqual(BOX.max + 0.01)
      expect(box.minY, `plate ${plate} top`).toBeGreaterThanOrEqual(BOX.min - 0.01)
      expect(box.maxY, `plate ${plate} bottom`).toBeLessThanOrEqual(BOX.max + 0.01)
    }
  })

  it('used to overrun it by 1.198, the ratio of its own width to the canvas', () => {
    const cut = readLayerFile(cuts[0])
    const fit = plateFit({
      canvasSpan: first.canvasSpan,
      canvasHeight: first.canvasHeight,
      ...PLATE,
    })
    const withTransform = composeFit(fit, first.transform)
    expect(fit.scale / withTransform.scale).toBeCloseTo(119.813 / 100, 3)
    expect(cut.pathData.length).toBeGreaterThan(0)
  })
})
