import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  installCanvasMock,
  removeCanvasMock,
  convertBothWays,
} from './hfm-convert-fixture.js'

/**
 * CW-30 P1: the deduped sampling plan must be EXACT, not merely close.
 *
 * The sixteen taps a cell makes are rounded to whole sample pixels, and at
 * small character sizes many of them round to the same pixel - at the 10%
 * floor all sixteen land on six. Reading each distinct pixel once and handing
 * the value to every tap that asked for it should therefore produce the same
 * glyph for every cell, not a similar one. This drives a real conversion both
 * ways over the same synthetic frame and compares the glyph indices the
 * painter is handed.
 *
 * The frame is deterministic noise rather than a flat fill on purpose: a flat
 * frame would agree under any sampling scheme at all and prove nothing.
 */

const paintCalls = []

vi.mock('../../src/js/_hfm-paint.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    paintFrame: (ctx, glyphIndices, cols, rows, ...rest) => {
      paintCalls.push({
        glyphIndices: Int16Array.from(glyphIndices),
        cols,
        rows,
      })
      return actual.paintFrame(ctx, glyphIndices, cols, rows, ...rest)
    },
  }
})

beforeEach(() => {
  paintCalls.length = 0
  installCanvasMock()
})

afterEach(() => {
  removeCanvasMock()
  vi.restoreAllMocks()
})

describe('CW-30 sampling plan — the deduped taps read the same picture', () => {
  it('produces glyph-for-glyph identical output to the per-tap path', async () => {
    await convertBothWays({ taps: true })

    expect(paintCalls.length).toBe(2)
    const [legacy, planned] = paintCalls
    expect(planned.cols).toBe(legacy.cols)
    expect(planned.rows).toBe(legacy.rows)
    // A frame with nothing in it would agree under any scheme; require that
    // this one actually exercised a range of glyphs.
    expect(new Set(legacy.glyphIndices).size).toBeGreaterThan(3)
    expect([...planned.glyphIndices]).toEqual([...legacy.glyphIndices])
  })

  it('stays identical in palette mode, where taps also carry colour', async () => {
    await convertBothWays(
      { taps: true },
      { palette: ['#ff0000', '#00ff00', '#0000ff', '#ffffff'] }
    )
    expect(paintCalls.length).toBe(2)
    expect([...paintCalls[1].glyphIndices]).toEqual([
      ...paintCalls[0].glyphIndices,
    ])
  })

  it('stays identical with intensity levels and reverse video', async () => {
    await convertBothWays(
      { taps: true },
      { intensityLevels: [0.45, 0.7, 1], reverseThreshold: 0.75 }
    )
    expect(paintCalls.length).toBe(2)
    expect([...paintCalls[1].glyphIndices]).toEqual([
      ...paintCalls[0].glyphIndices,
    ])
  })
})
