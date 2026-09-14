// @vitest-environment node
/**
 * DP-36: the whole road, on a picture that is a file.
 *
 * The credit-line tests work on drawings built as strings, which is the right
 * way to test a rule. This traces two PNGs through the engine that actually
 * ships and then takes the caption off, because that is the road a person's
 * picture travels and the only place the pieces can disagree with each other.
 *
 * The fixtures are drawn by scripts/make-icon-fixtures.mjs. They are stand-ins
 * for a stock icon and copy only the SHAPE of the problem, measured across nine
 * real ones; no stock icon is in this repository.
 *
 * Node environment: the committed Potrace module supports it, and under jsdom
 * it would take its browser branch and fetch its own wasm over a network that
 * is not there. jsdom is then installed by hand for the one thing the
 * credit-line module needs a DOM for.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { PNG } from 'pngjs'
import { JSDOM } from 'jsdom'

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..'
)
const FIXTURES = path.join(ROOT, 'tests', 'fixtures', 'icons')
const LOADER = path.join(ROOT, 'vendor', 'potrace', 'potrace.mjs')
const WASM = path.join(ROOT, 'public', 'wasm', 'potrace', 'potrace.wasm')

let extractInk
let trace
let pathDataToSvg
let removeCreditLine
let findCreditLine
let parseSvgElements

beforeAll(async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>')
  globalThis.DOMParser = dom.window.DOMParser
  globalThis.XMLSerializer = dom.window.XMLSerializer
  globalThis.document = dom.window.document
  ;({ extractInk } = await import('../../src/js/ink-extraction.js'))
  ;({ trace, pathDataToSvg } = await import('../../src/js/potrace-trace.js'))
  ;({ removeCreditLine, findCreditLine } = await import(
    '../../src/js/credit-line.js'
  ))
  ;({ parseSvgElements } = await import('../../src/js/svg-preparer.js'))
})

/** Decode a fixture into the shape the ink path expects. */
function picture(name) {
  const png = PNG.sync.read(fs.readFileSync(path.join(FIXTURES, name)))
  return {
    width: png.width,
    height: png.height,
    data: new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.length),
  }
}

/** The road a picture takes: ink mask, trace, drawing. */
async function draw(name, ink = { mode: 'lineart' }) {
  const img = picture(name)
  const extracted = extractInk(img, {
    ...ink,
    makeImageData: (w, h) => ({
      width: w,
      height: h,
      data: new Uint8ClampedArray(w * h * 4),
    }),
  })
  const pathData = await trace(
    extracted.mask,
    img.width,
    img.height,
    { loader: () => import(pathToFileURL(LOADER).href), wasmUrl: WASM }
  )
  return pathDataToSvg(pathData, img.width, img.height)
}

const shapeCount = (svg) => (parseSvgElements(svg).length)

describe('a stock-icon shaped picture, end to end (DP-36)', () => {
  it('★ the outline drawing comes out as the outline, not the outline plus a caption', async () => {
    const svg = await draw('outline-ring.png')
    const before = shapeCount(svg)
    // The caption is most of the picture, exactly as it is on the real ones.
    expect(before).toBeGreaterThan(30)

    const out = removeCreditLine(svg)
    expect(out.removed).toBeGreaterThanOrEqual(36)
    // The gate: what is left is the drawing, and the drawing is small.
    expect(shapeCount(out.svg)).toBeLessThanOrEqual(10)
    // And nothing of the caption is left to puzzle over.
    expect(findCreditLine(out.svg).count).toBe(0)
  })

  it('★ the ring keeps its counter, so it is still a ring', async () => {
    const svg = await draw('outline-ring.png')
    const out = removeCreditLine(svg)
    // An outline is two closed shapes: the outside and the hole it encloses.
    // One would mean a filled disc, which is a different drawing.
    expect(shapeCount(out.svg)).toBe(2)
  })

  it('★ the face keeps all three counters as holes', async () => {
    const svg = await draw('filled-face.png')
    const out = removeCreditLine(svg)
    // Outer boundary, two eyes, one mouth.
    expect(shapeCount(out.svg)).toBe(4)
    expect(out.svg).toContain('fill-rule="evenodd"')
    expect(findCreditLine(out.svg).count).toBe(0)
  })

  it('a picture with nothing to remove is handed back as it was', async () => {
    // The same face, cropped to its own drawing: no caption, nothing to do.
    const img = picture('filled-face.png')
    const cropped = {
      width: img.width,
      height: 520,
      data: img.data.slice(0, img.width * 520 * 4),
    }
    const extracted = extractInk(cropped, {
      mode: 'lineart',
      makeImageData: (w, h) => ({
        width: w,
        height: h,
        data: new Uint8ClampedArray(w * h * 4),
      }),
    })
    const d = await trace(extracted.mask, cropped.width, cropped.height, {
      loader: () => import(pathToFileURL(LOADER).href),
      wasmUrl: WASM,
    })
    const svg = pathDataToSvg(d, cropped.width, cropped.height)
    const out = removeCreditLine(svg)
    expect(out.removed).toBe(0)
    expect(out.svg).toBe(svg)
    expect(shapeCount(svg)).toBe(4)
  })

  it('the fixtures are drawn here, not downloaded', () => {
    // A guard on the rule rather than on the code: if a stock icon ever lands
    // in this folder, the next person sees this test rather than a lawyer.
    const files = fs.readdirSync(FIXTURES).sort()
    expect(files).toEqual(['filled-face.png', 'outline-ring.png'])
    for (const f of files) {
      expect(fs.statSync(path.join(FIXTURES, f)).size).toBeLessThan(64 * 1024)
    }
  })
})
