/**
 * The vector look's edge table (_hfm-edges.js): every edge once with its
 * two faces' normals, the silhouette for a camera, and the dim wireframe of
 * the rounded parts. A prism of 36 sides stands for a rounded shape: its
 * sides meet at 10 degrees, under the 15-degree crease, so today's lines
 * are its two rims alone.
 */
import { describe, expect, it } from 'vitest'
import {
  buildEdgeTable,
  silhouetteSegments,
  wireframeSegments,
  WIREFRAME_DIRECTIONS,
} from '../../src/js/_hfm-edges.js'

const SIDES = 36
const RADIUS = 10
const HEIGHT = 4

/** The prism as a triangle soup, outward faces, 9 numbers a triangle. */
function prismSoup() {
  const ring = (z) =>
    Array.from({ length: SIDES }, (_, i) => {
      const t = (i / SIDES) * Math.PI * 2
      return [RADIUS * Math.cos(t), RADIUS * Math.sin(t), z]
    })
  const low = ring(0)
  const high = ring(HEIGHT)
  const out = []
  const tri = (p, q, r) => out.push(...p, ...q, ...r)
  for (let i = 0; i < SIDES; i++) {
    const j = (i + 1) % SIDES
    tri(low[i], low[j], high[j])
    tri(low[i], high[j], high[i])
    tri([0, 0, HEIGHT], high[i], high[j])
    tri([0, 0, 0], low[j], low[i])
  }
  return Float32Array.from(out)
}

/** The same prism with a vertex list and an index. */
function prismIndexed() {
  const soup = prismSoup()
  const ids = new Map()
  const vertices = []
  const index = []
  for (let i = 0; i < soup.length; i += 3) {
    const key = `${soup[i].toFixed(5)},${soup[i + 1].toFixed(5)},${soup[i + 2].toFixed(5)}`
    let id = ids.get(key)
    if (id === undefined) {
      id = vertices.length / 3
      ids.set(key, id)
      vertices.push(soup[i], soup[i + 1], soup[i + 2])
    }
    index.push(id)
  }
  return { positions: Float32Array.from(vertices), index: Uint32Array.from(index) }
}

const segmentsOf = (array) => {
  const out = []
  for (let i = 0; i < array.length; i += 6) out.push(Array.from(array.slice(i, i + 6)))
  return out
}
const isVertical = ([ax, ay, az, bx, by, bz]) =>
  Math.abs(ax - bx) < 1e-6 && Math.abs(ay - by) < 1e-6 && Math.abs(az - bz) > 1

describe('the edge table', () => {
  it('holds every edge of the prism once, with both faces where there are two', () => {
    const table = buildEdgeTable(prismSoup())
    // 36 edges on each rim, 36 verticals, 36 quad diagonals, 36 spokes a cap.
    expect(table.count).toBe(216)
    expect(table.vertices.length / 3, 'the ring twice and two centers').toBe(74)
    expect(Array.from(table.paired).every((p) => p === 1), 'closed: two faces each').toBe(true)
  })

  it('reads an indexed mesh the same as a soup', () => {
    const { positions, index } = prismIndexed()
    const table = buildEdgeTable(positions, index)
    expect(table.count).toBe(216)
    expect(table.vertices.length / 3).toBe(74)
  })
})

describe('the silhouette', () => {
  it('is the two verticals where the sides turn away from an eye at the side, the rims left to the creases', () => {
    const table = buildEdgeTable(prismSoup())
    const lines = segmentsOf(silhouetteSegments(table, { eye: [1000, 0, 0] }))
    expect(lines).toHaveLength(2)
    expect(lines.every(isVertical), 'verticals').toBe(true)
    const ys = lines.map((s) => Math.round(s[1])).sort((a, b) => a - b)
    expect(ys, 'at the near and far side of the prism, seen from +x').toEqual([-10, 10])
    expect(lines.every((s) => Math.abs(s[0]) < 1e-6), 'at x = 0').toBe(true)
  })

  it('takes a view direction for an orthographic camera, and moves with the eye', () => {
    const table = buildEdgeTable(prismSoup())
    const ortho = segmentsOf(silhouetteSegments(table, { direction: [-1, 0, 0] }))
    expect(ortho).toHaveLength(2)
    expect(ortho.every(isVertical)).toBe(true)
    const fromY = segmentsOf(silhouetteSegments(table, { eye: [0, 1000, 0] }))
    const xs = fromY.map((s) => Math.round(s[0])).sort((a, b) => a - b)
    expect(xs, 'seen from +y the verticals are at x = -10 and 10').toEqual([-10, 10])
  })

  it('leaves out the creases, which are drawn already, and a crease angle of 0 keeps them out too', () => {
    const table = buildEdgeTable(prismSoup())
    // At 1 degree the 10-degree sides are creases as well: nothing is left.
    expect(silhouetteSegments(table, { eye: [1000, 0, 0] }, { creaseDeg: 1 })).toHaveLength(0)
  })
})

describe('the dim wireframe', () => {
  it('draws some of the verticals where the side turns from one direction to the next, none of the rims', () => {
    const table = buildEdgeTable(prismSoup())
    const lines = segmentsOf(wireframeSegments(table))
    expect(WIREFRAME_DIRECTIONS).toBe(32)
    expect(lines.length, 'a few lines round the prism, not 36').toBeGreaterThanOrEqual(6)
    expect(lines.length).toBeLessThanOrEqual(24)
    expect(lines.every(isVertical), 'verticals only: the rims are creases').toBe(true)
  })

  it('is the same from a soup and from an indexed mesh, and empty at a crease angle that takes every side', () => {
    const soup = wireframeSegments(buildEdgeTable(prismSoup()))
    const { positions, index } = prismIndexed()
    const indexed = wireframeSegments(buildEdgeTable(positions, index))
    expect(Array.from(indexed)).toEqual(Array.from(soup))
    expect(wireframeSegments(buildEdgeTable(prismSoup()), { creaseDeg: 1 })).toHaveLength(0)
  })

  it('draws nothing on a box: its six faces are six directions apart at creases', () => {
    const box = Float32Array.from(
      [
        // Two faces of a unit box are enough: coplanar triangles make no line.
        [0, 0, 0, 1, 0, 0, 1, 1, 0],
        [0, 0, 0, 1, 1, 0, 0, 1, 0],
        [0, 0, 1, 1, 1, 1, 1, 0, 1],
        [0, 0, 1, 0, 1, 1, 1, 1, 1],
      ].flat()
    )
    expect(wireframeSegments(buildEdgeTable(box))).toHaveLength(0)
  })
})
