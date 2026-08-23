import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { createGpuGlyphPass } from '../../src/js/_hfm-gpu.js'
import {
  installCanvasMock,
  removeCanvasMock,
  createMockPreviewManager,
} from './hfm-convert-fixture.js'

/**
 * CW-32: the GPU glyph pass, and the promise that nothing depends on it.
 *
 * The shader itself cannot run here - jsdom has no GPU - so what is guarded
 * is everything around it: that a machine without WebGL2 is told so rather
 * than crashing, that the converter still paints when the pass declines, and
 * that the constants ported into the shader still match the ones the CPU
 * uses. That last one is the drift this release could most easily grow: two
 * copies of the same tap layout and contrast maths, in two languages.
 */

const gpuSource = readFileSync(
  join(process.cwd(), 'src', 'js', '_hfm-gpu.js'),
  'utf8'
)
const cpuSource = readFileSync(
  join(process.cwd(), 'src', 'js', '_hfm.js'),
  'utf8'
)

describe('CW-32 GPU pass — the fallback is not optional', () => {
  it('reports itself unavailable, with a reason, when there is no WebGL2', () => {
    const pass = createGpuGlyphPass({ getContext: () => ({}) })
    expect(pass.available).toBe(false)
    expect(pass.reason).toMatch(/WebGL2/i)
    // An unavailable pass must still answer every call rather than throw:
    // the converter asks before it knows.
    expect(pass.sample({})).toBeNull()
    expect(() => pass.dispose()).not.toThrow()
  })

  it('reports itself unavailable when the renderer has no context at all', () => {
    expect(createGpuGlyphPass(null).available).toBe(false)
    expect(createGpuGlyphPass({}).available).toBe(false)
  })
})

describe('CW-32 GPU pass — the shader and the CPU agree on the constants', () => {
  it('uses the same luminance coefficients as _relLum01', () => {
    // _relLum01: (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
    for (const coefficient of ['0.2126', '0.7152', '0.0722']) {
      expect(cpuSource).toContain(coefficient)
      expect(gpuSource).toContain(coefficient)
    }
  })

  it('uses the same external-tap table as _EXT_AFFECTING', () => {
    // The CPU table, read out of its own source so the test cannot drift
    // from it either.
    const cpuTable = cpuSource
      .slice(
        cpuSource.indexOf('const _EXT_AFFECTING = ['),
        cpuSource.indexOf('];', cpuSource.indexOf('const _EXT_AFFECTING = ['))
      )
      .match(/\[[\d, ]+\]/g)
      .map((row) =>
        row
          .replace(/[[\]\s]/g, '')
          .split(',')
          .map(Number)
      )
    expect(cpuTable).toEqual([
      [0, 1, 2, 4],
      [0, 1, 3, 5],
      [2, 4, 6],
      [3, 5, 7],
      [4, 6, 8, 9],
      [5, 7, 8, 9],
    ])

    // The shader flattens it to four entries per row, padding with -1.
    const shaderTable = gpuSource
      .slice(
        gpuSource.indexOf('const int EXT_AFFECTING[24]'),
        gpuSource.indexOf(
          ');',
          gpuSource.indexOf('const int EXT_AFFECTING[24]')
        )
      )
      .match(/-?\d+/g)
      .slice(2) // the two 24s in the declaration
      .map(Number)
    const flattened = cpuTable
      .map((row) => [...row, ...Array(4 - row.length).fill(-1)])
      .flat()
    expect(shaderTable).toEqual(flattened)
  })

  it('keeps the reverse-video rule the CPU has: space becomes the sparsest glyph', () => {
    expect(gpuSource).toContain('uSparsestNonSpace')
    expect(gpuSource).toMatch(/reversed && best == int\(uSpaceIndex\)/)
  })

  it('encodes the scene texture, because a render target holds linear light', () => {
    // The single most consequential line in the file: without it every mid
    // tone darkens and the road loses its dither entirely.
    expect(gpuSource).toContain('encodeOutput')
    expect(gpuSource).toContain('1.055')
    expect(gpuSource).toContain('0.0031308')
  })
})

describe('CW-32 — the converter paints when the pass declines', () => {
  beforeEach(() => installCanvasMock())
  afterEach(() => {
    removeCanvasMock()
    vi.restoreAllMocks()
  })

  it('runs the CPU loop and still paints with gpuSample on but no GPU', async () => {
    vi.resetModules()
    const { initAltView } = await import('../../src/js/_hfm.js')
    const pm = createMockPreviewManager()
    const api = await initAltView(pm, { allowTinyCells: true, gpuSample: true })

    const nowSpy = vi.spyOn(performance, 'now')
    api.enable()
    nowSpy.mockReturnValue(10000)
    expect(() => api.render()).not.toThrow()

    // jsdom's canvas has no WebGL2, so the pass must have declined and the
    // CPU path must have produced the frame.
    expect(api.getConvertStats().usedGpu).toBe(false)
    expect(api.getConvertStats().samples).toBeGreaterThan(0)

    nowSpy.mockRestore()
    api.dispose()
  })
})
