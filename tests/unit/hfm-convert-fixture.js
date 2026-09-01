import { vi } from 'vitest'

/**
 * Shared scaffolding for the CW-30 converter parity tests.
 *
 * Both of them do the same thing: run one real conversion down the old code
 * path and one down the new one, over the SAME synthetic frame, and compare
 * the glyph indices the painter is handed. Only the switch they flip differs.
 *
 * `vi.mock` is hoisted per file and cannot be shared, so each test file keeps
 * its own paint-capturing mock; everything else lives here.
 */

/** A stable, high-frequency pattern: neighbouring pixels differ, so which
 *  pixel a tap reads changes the answer. */
export function samplePixel(x, y) {
  const h = (x * 73856093) ^ (y * 19349663) ^ ((x + y) * 83492791)
  return [(h >>> 3) & 255, (h >>> 11) & 255, (h >>> 19) & 255]
}

export function makeImageData(w, h) {
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
      // glyph, and a comparison built on it passes while proving nothing.
      data[i + 3] = (r ^ (g >>> 1) ^ (b << 1)) & 255
    }
  }
  return { width: w, height: h, data }
}

let origGetContext = null

export function installCanvasMock() {
  origGetContext = HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.getContext = function (type, opts) {
    return {
      canvas: this,
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
  }
}

export function removeCanvasMock() {
  if (origGetContext) HTMLCanvasElement.prototype.getContext = origGetContext
  origGetContext = null
}

export function createMockPreviewManager() {
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

/**
 * Convert the same frame twice: once with `legacyFlags` forced on, once with
 * every switch off. Returns nothing - the caller reads its own paint capture.
 *
 * @param {object} legacyFlags - the setBenchLegacy payload for the first pass
 * @param {object} [options] - initAltView options plus palette/intensity setup
 */
export async function convertBothWays(legacyFlags, options = {}) {
  vi.resetModules()
  const { initAltView } = await import('../../src/js/_hfm.js')
  const pm = createMockPreviewManager()
  const api = await initAltView(pm, { allowTinyCells: true, ...options })
  if (options.palette) api.setPalette(options.palette)
  if (options.intensityLevels) api.setIntensityLevels(options.intensityLevels)
  if (options.reverseThreshold !== undefined) {
    api.setReverseVideo(options.reverseThreshold)
  }
  if (options.contrastScale !== undefined) {
    api.setContrastScale(options.contrastScale)
  }

  const nowSpy = vi.spyOn(performance, 'now')
  api.enable()

  api.setBenchLegacy(legacyFlags)
  nowSpy.mockReturnValue(10000)
  api.render()

  api.setBenchLegacy({ taps: false, contrast: false })
  api.invalidate()
  nowSpy.mockReturnValue(20000)
  api.render()

  nowSpy.mockRestore()
  api.dispose()
}

/** How many of two glyph runs agree, as a fraction of the whole frame. */
export function agreementFraction(a, b) {
  if (a.length !== b.length) return 0
  let same = 0
  for (let i = 0; i < a.length; i++) if (a[i] === b[i]) same++
  return same / a.length
}
