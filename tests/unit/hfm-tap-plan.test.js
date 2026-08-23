import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

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

const allContexts = []
let origGetContext

/** A stable, high-frequency pattern: neighbouring pixels differ, so which
 *  pixel a tap reads changes the answer. */
function samplePixel(x, y) {
  const h = (x * 73856093) ^ (y * 19349663) ^ ((x + y) * 83492791)
  return [(h >>> 3) & 255, (h >>> 11) & 255, (h >>> 19) & 255]
}

function makeImageData(w, h) {
  const data = new Uint8ClampedArray(Math.max(1, w * h) * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = samplePixel(x, y)
      const i = (y * w + x) * 4
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      // Alpha has to vary too. The same mock answers the ATLAS readback, and
      // the atlas's shape vectors are built from alpha alone - a flat 255
      // gives all 95 glyphs the same vector, every cell then matches the same
      // glyph, and the comparison below passes while proving nothing.
      data[i + 3] = (r ^ (g >>> 1) ^ (b << 1)) & 255
    }
  }
  return { width: w, height: h, data }
}

function installCanvasMock() {
  origGetContext = HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.getContext = function (type, opts) {
    const canvas = this
    const ctx = {
      canvas,
      font: '',
      textAlign: '',
      textBaseline: '',
      fillStyle: '',
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
      shadowBlur: 0,
      shadowColor: '',
      imageSmoothingEnabled: true,
      filter: 'none',
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      fillText: vi.fn(),
      drawImage: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      scale: vi.fn(),
      // The sampler asks for the whole sample buffer; the atlas builder asks
      // for its own bitmap. Both get a real, varied image.
      getImageData: vi.fn((x, y, w, h) => makeImageData(w, h)),
      createImageData: vi.fn((w, h) => makeImageData(w, h)),
      putImageData: vi.fn(),
      measureText: vi.fn(() => ({ width: 6 })),
      _creationOpts: opts || {},
    }
    allContexts.push(ctx)
    return ctx
  }
}

function createMockPreviewManager() {
  const container = document.createElement('div')
  Object.defineProperty(container, 'clientWidth', {
    value: 200,
    configurable: true,
  })
  Object.defineProperty(container, 'clientHeight', {
    value: 150,
    configurable: true,
  })
  const canvas = document.createElement('canvas')
  canvas.width = 200
  canvas.height = 150
  return {
    renderer: { domElement: canvas, render: vi.fn() },
    scene: {},
    container,
    controls: { addEventListener: vi.fn(), removeEventListener: vi.fn() },
    isAutoRotateEnabled: vi.fn(() => false),
    getActiveCamera: vi.fn(() => ({})),
  }
}

/** One conversion with the legacy path forced, one with the plan. */
async function convertBothWays(options = {}) {
  vi.resetModules()
  const { initAltView } = await import('../../src/js/_hfm.js')
  const pm = createMockPreviewManager()
  const api = await initAltView(pm, { allowTinyCells: true, ...options })
  if (options.palette) api.setPalette(options.palette)
  if (options.intensityLevels) api.setIntensityLevels(options.intensityLevels)
  if (options.reverseThreshold !== undefined) {
    api.setReverseVideo(options.reverseThreshold)
  }

  const nowSpy = vi.spyOn(performance, 'now')
  api.enable()

  paintCalls.length = 0
  api.setBenchLegacy({ taps: true })
  nowSpy.mockReturnValue(10000)
  api.render()

  api.setBenchLegacy({ taps: false })
  api.invalidate()
  nowSpy.mockReturnValue(20000)
  api.render()

  nowSpy.mockRestore()
  api.dispose()
  return paintCalls
}

beforeEach(() => {
  allContexts.length = 0
  paintCalls.length = 0
  installCanvasMock()
})

afterEach(() => {
  HTMLCanvasElement.prototype.getContext = origGetContext
  vi.restoreAllMocks()
})

describe('CW-30 sampling plan — the deduped taps read the same picture', () => {
  it('produces glyph-for-glyph identical output to the per-tap path', async () => {
    const calls = await convertBothWays()

    expect(calls.length).toBe(2)
    const [legacy, planned] = calls
    expect(planned.cols).toBe(legacy.cols)
    expect(planned.rows).toBe(legacy.rows)
    // A frame with nothing in it would agree under any scheme; require that
    // this one actually exercised a range of glyphs.
    expect(new Set(legacy.glyphIndices).size).toBeGreaterThan(3)
    expect([...planned.glyphIndices]).toEqual([...legacy.glyphIndices])
  })

  it('stays identical in palette mode, where taps also carry colour', async () => {
    const calls = await convertBothWays({
      palette: ['#ff0000', '#00ff00', '#0000ff', '#ffffff'],
    })
    expect(calls.length).toBe(2)
    expect([...calls[1].glyphIndices]).toEqual([...calls[0].glyphIndices])
  })

  it('stays identical with intensity levels and reverse video', async () => {
    const calls = await convertBothWays({
      intensityLevels: [0.45, 0.7, 1],
      reverseThreshold: 0.75,
    })
    expect(calls.length).toBe(2)
    expect([...calls[1].glyphIndices]).toEqual([...calls[0].glyphIndices])
  })
})
