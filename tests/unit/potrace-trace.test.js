// @vitest-environment node
/**
 * DP-43: the Potrace engine, running the wasm that actually ships.
 *
 * Runs in the node environment because that is what the committed module was
 * built to support alongside web and worker; under jsdom it would take the
 * browser branch and try to fetch its own wasm over a network that is not
 * there. Using the shipped file rather than a fake is the point: a build that
 * came out mirrored or without its holes is a defect nobody would see until a
 * charm was printed.
 *
 * The build itself is guarded separately by scripts/verify-potrace-wasm.mjs,
 * which runs inside the workflow before anything is committed. These tests
 * guard the JavaScript wrapper and the file in the repository.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import {
  trace,
  loadPotrace,
  resetPotrace,
  countSubpaths,
  POTRACE_DEFAULTS,
  POTRACE_MODULE_URL,
} from '../../src/js/potrace-trace.js'

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..'
)
const BUILT = path.join(ROOT, 'public', 'wasm', 'potrace', 'potrace.mjs')
const loader = () => import(pathToFileURL(BUILT).href)

/** A blank mask, one byte per pixel, row 0 at the top. */
function mask(width, height) {
  return { width, height, data: new Uint8Array(width * height) }
}

function fill(m, x0, y0, x1, y1, value = 1) {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) m.data[y * m.width + x] = value
  }
  return m
}

const run = (m, options) =>
  trace(m.data, m.width, m.height, { loader, ...options })

/** Every coordinate in a piece of path data. */
function box(pathData) {
  const numbers = pathData
    .replace(/[MCLZ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(Number)
  const xs = numbers.filter((_, i) => i % 2 === 0)
  const ys = numbers.filter((_, i) => i % 2 === 1)
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  }
}

describe('the Potrace engine (DP-43)', () => {
  beforeEach(() => resetPotrace())
  afterEach(() => resetPotrace())

  it('the built wasm is committed where the page will look for it', () => {
    expect(existsSync(BUILT)).toBe(true)
    expect(POTRACE_MODULE_URL).toBe('/wasm/potrace/potrace.mjs')
    expect(
      existsSync(path.join(ROOT, 'public', 'wasm', 'potrace', 'potrace.wasm'))
    ).toBe(true)
    // The licence and the recipe travel with the binary or the binary should
    // not be there at all.
    expect(
      existsSync(path.join(ROOT, 'public', 'wasm', 'potrace', 'COPYING.potrace'))
    ).toBe(true)
    expect(
      existsSync(path.join(ROOT, 'public', 'wasm', 'potrace', 'README.txt'))
    ).toBe(true)
  })

  it('carries potrace’s own defaults, so "leave it alone" means the same thing', () => {
    expect(POTRACE_DEFAULTS).toEqual({
      turdsize: 2,
      turnpolicy: 4,
      alphamax: 1.0,
      opttolerance: 0.2,
    })
  })

  it('a blank picture traces to nothing, which is not an error', async () => {
    await expect(run(mask(16, 16))).resolves.toBe('')
  })

  it('★ a 4x4 bitmap traces to the path it should, to the character', async () => {
    // Two pixels across in the middle of a four-pixel square. Potrace rounds a
    // shape that small into a circle, and this is what that circle is: centred
    // on (2,2), radius 1, control points a shade over half a pixel out - the
    // usual constant for drawing a circle in cubics. Pinned exactly, because
    // the whole engine sits behind this one string.
    const m = new Uint8Array(16)
    for (let y = 1; y < 3; y++) for (let x = 1; x < 3; x++) m[y * 4 + x] = 1
    await expect(trace(m, 4, 4, { loader, turdsize: 0 })).resolves.toBe(
      'M1 2C1 2.55 1.45 3 2 3C2.55 3 3 2.55 3 2C3 1.45 2.55 1 2 1C1.45 1 1 1.45 1 2Z'
    )
  })

  it('★ one pixel in the top left corner comes back in the top left corner', async () => {
    // The sharpest form of the orientation question there is: the whole drawing
    // is one pixel, and it has exactly one right answer.
    const m = new Uint8Array(16)
    m[0] = 1
    const only = await trace(m, 4, 4, { loader, turdsize: 0 })
    expect(box(only)).toEqual({ minX: 0, maxX: 1, minY: 0, maxY: 1 })
  })

  it('a square is one closed shape, where it was drawn', async () => {
    const square = await run(fill(mask(16, 16), 4, 4, 12, 12))
    expect(countSubpaths(square)).toBe(1)
    const bounds = box(square)
    // Potrace fits its polygon by least squares and may keep a vertex anywhere
    // inside the unit square of its corner, so this asks for placement, not
    // for exact arithmetic.
    expect(bounds.minX).toBeCloseTo(4, 0)
    expect(bounds.maxX).toBeCloseTo(12, 0)
    expect(bounds.minY).toBeCloseTo(4, 0)
    expect(bounds.maxY).toBeCloseTo(12, 0)
  })

  it('★ keeps the top of the picture at the top of the drawing', async () => {
    // Potrace counts its rows from the bottom and its own SVG backend flips
    // them back. A build that does only half of that pair traces every picture
    // upside down, and nothing else in the app would notice.
    const top = box(await run(fill(mask(16, 16), 0, 0, 16, 2)))
    const bottom = box(await run(fill(mask(16, 16), 0, 14, 16, 16)))
    expect(top.maxY).toBeLessThanOrEqual(8)
    expect(bottom.minY).toBeGreaterThanOrEqual(8)
  })

  it('★ keeps the left of the picture on the left', async () => {
    const left = box(await run(fill(mask(16, 16), 0, 0, 2, 16)))
    expect(left.maxX).toBeLessThanOrEqual(8)
  })

  it('★ a ring keeps its hole, and an island inside the hole comes back', async () => {
    // Two shapes filled even-odd is a ring; three is a ring with something in
    // it. If the hole were lost the charm would print solid.
    const ring = fill(fill(mask(24, 24), 4, 4, 20, 20), 9, 9, 15, 15, 0)
    expect(countSubpaths(await run(ring))).toBe(2)
    const island = fill(ring, 11, 11, 13, 13, 1)
    expect(countSubpaths(await run(island))).toBe(3)
  })

  it('the speck filter reaches the library', async () => {
    const speckled = fill(fill(mask(24, 24), 4, 4, 12, 12), 20, 20, 21, 21)
    expect(countSubpaths(await run(speckled, { turdsize: 0 }))).toBe(2)
    expect(countSubpaths(await run(speckled, { turdsize: 2 }))).toBe(1)
  })

  it('the corner threshold reaches the library', async () => {
    const disc = mask(40, 40)
    for (let y = 0; y < 40; y++) {
      for (let x = 0; x < 40; x++) {
        if ((x - 20) ** 2 + (y - 20) ** 2 < 15 * 15) disc.data[y * 40 + x] = 1
      }
    }
    expect(await run(disc)).toContain('C')
    expect(await run(disc, { alphamax: 0 })).not.toContain('C')
  })

  it('says so when the mask does not match the size it was given', async () => {
    await expect(trace(new Uint8Array(10), 4, 4, { loader })).rejects.toThrow(
      /needs 16 bytes, got 10/
    )
  })

  it('refuses a picture with no size at all', async () => {
    await expect(trace(new Uint8Array(0), 0, 0, { loader })).rejects.toThrow(
      /Cannot trace a 0x0 picture/
    )
  })

  it('loads the module once and hands the same one back', async () => {
    const first = loadPotrace(loader)
    const second = loadPotrace(loader)
    expect(first).toBe(second)
    await expect(first).resolves.toBe(await second)
  })

  it('★ a failed load does not poison the next attempt', async () => {
    // Someone whose network drops mid-session gets to try again by tracing
    // again, rather than being told no for the rest of the visit.
    const broken = () => Promise.reject(new Error('offline'))
    await expect(loadPotrace(broken)).rejects.toThrow('offline')
    await expect(loadPotrace(loader)).resolves.toBeTruthy()
  })

  it('refuses a module that is not a loader, rather than failing later', async () => {
    await expect(loadPotrace(async () => ({ default: 42 }))).rejects.toThrow(
      /did not export a loader/
    )
  })

  describe('countSubpaths', () => {
    it('counts one per closed shape', () => {
      expect(countSubpaths('M0 0L1 0L1 1ZM2 2L3 2L3 3Z')).toBe(2)
    })

    it('calls nothing nothing', () => {
      expect(countSubpaths('')).toBe(0)
      expect(countSubpaths(null)).toBe(0)
      expect(countSubpaths(undefined)).toBe(0)
    })
  })
})
