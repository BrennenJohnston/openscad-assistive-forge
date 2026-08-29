import { describe, it, expect } from 'vitest'
import path from 'node:path'
import {
  subpathRings,
  rasterizeRings,
  iouOfMasks,
  splitPlateRings,
  readPlate,
  comparePlates,
  topFaceLoops,
  readStlTriangles,
  referencePlate,
  EDGE_BAND,
} from '../../scripts/stencil-golden.mjs'

const square = (x0, y0, x1, y1) => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
]
const BOX = { minX: 0, minY: 0, maxX: 20, maxY: 20 }
const area = (mask) => mask.reduce((n, v) => n + v, 0)

describe('rasterizeRings', () => {
  it('fills a square and leaves the rest of the grid empty', () => {
    const mask = rasterizeRings([square(0, 0, 10, 10)], BOX, 200)
    // Half the box across and half down: a quarter of the grid, within the
    // pixel the edge lands in.
    expect(area(mask) / (200 * 200)).toBeCloseTo(0.25, 2)
  })

  it('treats a ring inside a ring as a hole, not more material', () => {
    const solid = rasterizeRings([square(0, 0, 20, 20)], BOX, 200)
    const holed = rasterizeRings(
      [square(0, 0, 20, 20), square(5, 5, 15, 15)],
      BOX,
      200
    )
    expect(area(holed) / area(solid)).toBeCloseTo(0.75, 2)
  })

  it('preserves aspect, so a cut of the wrong proportions cannot be stretched into agreement', () => {
    const wide = rasterizeRings([square(0, 0, 20, 10)], BOX, 200)
    const tall = rasterizeRings([square(0, 0, 10, 20)], BOX, 200)
    expect(iouOfMasks(wide, tall).iou).toBeLessThan(0.4)
  })
})

describe('iouOfMasks', () => {
  it('reports a known overlap of two offset squares', () => {
    const a = rasterizeRings([square(0, 0, 10, 10)], BOX, 400)
    const b = rasterizeRings([square(5, 5, 15, 15)], BOX, 400)
    // 25 of an area of 175: the two squares share one quarter of each.
    const r = iouOfMasks(a, b)
    expect(r.iou).toBeCloseTo(25 / 175, 2)
    expect(r.onlyA).toBeGreaterThan(0)
    expect(r.onlyB).toBeGreaterThan(0)
  })

  it('is 1 for a mask against itself', () => {
    const a = rasterizeRings([square(1, 2, 9, 17)], BOX, 128)
    expect(iouOfMasks(a, a).iou).toBe(1)
  })

  it('refuses masks of different sizes rather than comparing them', () => {
    const a = rasterizeRings([square(0, 0, 5, 5)], BOX, 32)
    const b = rasterizeRings([square(0, 0, 5, 5)], BOX, 64)
    expect(() => iouOfMasks(a, b)).toThrow(/size/)
  })
})

describe('subpathRings', () => {
  it('splits a compound path into one ring per subpath', () => {
    const rings = subpathRings('M 0 0 H 10 V 10 H 0 Z M 3 3 H 7 V 7 H 3 Z')
    expect(rings).toHaveLength(2)
    expect(rings[0]).toHaveLength(4)
    expect(rings[1]).toHaveLength(4)
  })

  it('does not join two subpaths into one ring', () => {
    // Joined, the two squares would raster as one bar across the gap.
    const rings = subpathRings('M 0 0 H 4 V 4 H 0 Z M 16 16 H 20 V 20 H 16 Z')
    const mask = rasterizeRings(rings, BOX, 200)
    const joined = rasterizeRings([[...rings[0], ...rings[1]]], BOX, 200)
    expect(area(mask)).toBeLessThan(area(joined))
  })

  it('returns nothing for path data it cannot read', () => {
    expect(subpathRings('')).toEqual([])
    expect(subpathRings(null)).toEqual([])
  })
})

describe('splitPlateRings', () => {
  const plate = square(0, 0, 60, 60)
  const art = square(20, 20, 40, 45)
  const pegHole = square(2, 2, 5, 5)

  it('takes the largest ring as the plate outline', () => {
    const { outline } = splitPlateRings([art, plate, pegHole])
    expect(outline.w).toBe(60)
  })

  it('drops a cut whose centre sits within the edge band', () => {
    const { cuts, dropped } = splitPlateRings([plate, art, pegHole])
    expect(cuts).toHaveLength(1)
    expect(dropped).toHaveLength(1)
    expect(cuts[0].w).toBe(20)
  })

  it('keeps a cut just inside the band and drops one just outside it', () => {
    const band = EDGE_BAND * 60
    const inside = square(band + 1, band + 1, band + 3, band + 3)
    const outside = square(band - 3, band - 3, band - 1, band - 1)
    const { cuts, dropped } = splitPlateRings([plate, inside, outside])
    expect(cuts).toHaveLength(1)
    expect(dropped).toHaveLength(1)
    expect(cuts[0].cx).toBeGreaterThan(band)
  })
})

describe('the reference plates', () => {
  it('reads plate 1 as one silhouette cut plus five registration features', () => {
    const { loops } = topFaceLoops(readStlTriangles(referencePlate(1)))
    expect(loops).toHaveLength(7)
    const plate = readPlate(referencePlate(1))
    expect(plate.cuts).toHaveLength(1)
    expect(plate.dropped).toHaveLength(5)
    // The owner's silhouette: 31.69 x 39.70 mm, measured off the STL.
    expect(plate.cuts[0].w).toBeCloseTo(31.69, 1)
    expect(plate.cuts[0].h).toBeCloseTo(39.7, 1)
  })

  it('scores a reference plate against itself at 1.000', () => {
    for (let n = 1; n <= 6; n++) {
      const p = readPlate(referencePlate(n))
      expect(comparePlates(p, p).iou).toBe(1)
    }
  })

  it('can tell two different plates apart', () => {
    const p2 = readPlate(referencePlate(2))
    for (const n of [1, 3, 4, 5, 6]) {
      const r = comparePlates(p2, readPlate(referencePlate(n)))
      expect(r.iou).toBeLessThan(0.5)
    }
  })

  it('finds the cut count of every reference plate', () => {
    const counts = [1, 2, 3, 4, 5, 6].map((n) => readPlate(referencePlate(n)).cuts.length)
    expect(counts).toEqual([1, 4, 4, 2, 4, 4])
  })
})

describe('readPlate', () => {
  it('refuses a file that is neither a plate STL nor a plate SVG', () => {
    expect(() => readPlate(path.join('tests', 'fixtures', 'harley', 'README.md'))).toThrow(
      /expected a \.stl or \.svg plate/
    )
  })
})
