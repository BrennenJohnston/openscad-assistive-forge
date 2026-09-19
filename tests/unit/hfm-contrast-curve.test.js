import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  installCanvasMock,
  removeCanvasMock,
  convertBothWays,
  agreementFraction,
} from './hfm-convert-fixture.js'

/**
 * CW-30 P2: the tabulated contrast curves must not change the picture.
 *
 * Unlike the sampling plan, this one is an APPROXIMATION - pow(t, exp) read
 * from a 2048-step table with linear interpolation instead of computed - so
 * the honest gate is a measured agreement rate, not an equality assertion.
 * The worst-case interpolation error is around 6e-7, four orders of magnitude
 * below the 1/11 step the glyph key quantizes to, so a cell only changes
 * glyph if its shape vector sat within that error of a bucket edge.
 *
 * The frame here is high-frequency noise, which is the worst case for that:
 * real scenery has large smooth regions whose cells sit nowhere near an edge.
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

describe('CW-30 contrast curves — tabulated pow keeps the same picture', () => {
  it('agrees with computed pow on essentially every cell', async () => {
    await convertBothWays({ contrast: true })

    expect(paintCalls.length).toBe(2)
    const [computed, tabulated] = paintCalls
    expect(new Set(computed.glyphIndices).size).toBeGreaterThan(3)

    const agreement = agreementFraction(
      computed.glyphIndices,
      tabulated.glyphIndices
    )
    // The plan's parity gate is 99% of cells. A 2048-step table clears that by
    // a wide margin on noise, and the margin is the point: a table coarse
    // enough to be visible would land far below this.
    expect(agreement).toBeGreaterThanOrEqual(0.999)
  })

  it('holds at the sharpest contrast setting the slider allows', async () => {
    // contrastScale 4 drives the exponents to 12.8 and 20, where the curve is
    // steepest and a table is most likely to disagree.
    await convertBothWays({ contrast: true }, { contrastScale: 4 })
    expect(paintCalls.length).toBe(2)
    const agreement = agreementFraction(
      paintCalls[0].glyphIndices,
      paintCalls[1].glyphIndices
    )
    expect(agreement).toBeGreaterThanOrEqual(0.999)
  })
})
