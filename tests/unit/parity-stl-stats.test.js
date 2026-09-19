import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import {
  parseSTL,
  computeStats,
  compareStats,
  canonicalHash,
  TOLERANCE_PROFILES,
} from '../../scripts/parity/stl-stats.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURES = path.join(__dirname, '..', 'fixtures', 'parity')

const cubeBinary = readFileSync(path.join(FIXTURES, 'cube10.stl'))
const cubeAscii = readFileSync(path.join(FIXTURES, 'cube10-ascii.stl'))

describe('parseSTL', () => {
  it('parses binary STL (length-equation detection)', () => {
    const mesh = parseSTL(cubeBinary)
    expect(mesh.format).toBe('binary')
    expect(mesh.count).toBe(12)
    expect(mesh.triangles).toHaveLength(108)
  })

  it('parses ASCII STL', () => {
    const mesh = parseSTL(cubeAscii)
    expect(mesh.format).toBe('ascii')
    expect(mesh.count).toBe(12)
  })

  it('accepts ArrayBuffer and Uint8Array inputs', () => {
    const asUint8 = new Uint8Array(cubeBinary)
    const asArrayBuffer = asUint8.buffer.slice(
      asUint8.byteOffset,
      asUint8.byteOffset + asUint8.byteLength
    )
    expect(parseSTL(asUint8).count).toBe(12)
    expect(parseSTL(asArrayBuffer).count).toBe(12)
  })

  it('rejects non-STL data', () => {
    expect(() => parseSTL(new TextEncoder().encode('OFF\n8 12 0\n'))).toThrow(
      /Not a valid STL/
    )
  })
})

describe('computeStats — desktop-generated cube(10)', () => {
  const stats = computeStats(parseSTL(cubeBinary))

  it('reports 12 facets', () => {
    expect(stats.facets).toBe(12)
  })

  it('computes volume 1000 mm³', () => {
    expect(stats.volume).toBeCloseTo(1000, 6)
  })

  it('computes surface area 600 mm²', () => {
    expect(stats.surfaceArea).toBeCloseTo(600, 6)
  })

  it('computes bbox dims [10,10,10] mm', () => {
    expect(stats.dims[0]).toBeCloseTo(10, 6)
    expect(stats.dims[1]).toBeCloseTo(10, 6)
    expect(stats.dims[2]).toBeCloseTo(10, 6)
    expect(stats.bbox.min[0]).toBeCloseTo(0, 6)
    expect(stats.bbox.max[2]).toBeCloseTo(10, 6)
  })
})

describe('canonicalHash', () => {
  it('is stable across repeated parses', () => {
    const h1 = computeStats(parseSTL(cubeBinary)).canonicalHash
    const h2 = computeStats(parseSTL(cubeBinary)).canonicalHash
    expect(h1).toBe(h2)
    expect(h1).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is emission-order independent', () => {
    const mesh = parseSTL(cubeBinary)
    // Reverse triangle order (each 9-double record) — same set, new order.
    const reversed = new Float64Array(mesh.triangles.length)
    for (let t = 0; t < mesh.count; t++) {
      reversed.set(
        mesh.triangles.subarray(t * 9, t * 9 + 9),
        (mesh.count - 1 - t) * 9
      )
    }
    expect(canonicalHash({ triangles: reversed, count: mesh.count })).toBe(
      canonicalHash(mesh)
    )
  })

  it('matches between ASCII and binary exports of the same cube', () => {
    // Cube coordinates are exact integers, so ASCII text and binary
    // float32 round-trips represent identical values.
    const hBin = computeStats(parseSTL(cubeBinary)).canonicalHash
    const hAsc = computeStats(parseSTL(cubeAscii)).canonicalHash
    expect(hAsc).toBe(hBin)
  })

  it('changes when geometry changes', () => {
    const mesh = parseSTL(cubeBinary)
    const perturbed = Float64Array.from(mesh.triangles)
    perturbed[0] += 0.5
    expect(
      canonicalHash({ triangles: perturbed, count: mesh.count })
    ).not.toBe(canonicalHash(mesh))
  })
})

describe('compareStats', () => {
  const stats = computeStats(parseSTL(cubeBinary))

  it('identical stats pass every profile', () => {
    for (const profile of Object.keys(TOLERANCE_PROFILES)) {
      const result = compareStats(stats, stats, profile)
      expect(result.pass, `profile ${profile}: ${result.failures}`).toBe(true)
      expect(result.metrics.hashEqual).toBe(true)
    }
  })

  it('cross-version tolerates facet differences but not volume drift', () => {
    const retessellated = {
      ...stats,
      facets: 14,
      canonicalHash: 'different',
    }
    const okay = compareStats(retessellated, stats, 'cross-version')
    expect(okay.pass).toBe(true)

    const shrunk = { ...retessellated, volume: stats.volume * 0.99 }
    const bad = compareStats(shrunk, stats, 'cross-version')
    expect(bad.pass).toBe(false)
    expect(bad.failures.join()).toMatch(/volume/)
  })

  it('matched profile fails on a 0.02 mm bbox shift', () => {
    const shifted = {
      ...stats,
      bbox: {
        min: [...stats.bbox.min],
        max: [stats.bbox.max[0] + 0.02, stats.bbox.max[1], stats.bbox.max[2]],
      },
    }
    const result = compareStats(shifted, stats, 'matched')
    expect(result.pass).toBe(false)
    expect(result.failures.join()).toMatch(/bbox/)
  })

  it('matched profile warns (not fails) on facet-count drift', () => {
    const retessellated = { ...stats, facets: 13, canonicalHash: 'x' }
    const result = compareStats(retessellated, stats, 'matched')
    expect(result.pass).toBe(true)
    expect(result.warnings.join()).toMatch(/facet/)
  })

  it('golden profile requires exact facets and hash equality', () => {
    const almost = { ...stats, canonicalHash: 'not-the-same' }
    const result = compareStats(almost, stats, 'golden')
    expect(result.pass).toBe(false)
    expect(result.failures.join()).toMatch(/hash/)
  })

  it('rejects unknown profiles loudly', () => {
    expect(() => compareStats(stats, stats, 'nope')).toThrow(/Unknown/)
  })
})
