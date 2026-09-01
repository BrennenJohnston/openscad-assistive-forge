import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  parsePaletteColor,
  normalizeChroma,
  pickPaletteIndex,
  driveColor,
  pickIntensityIndex,
} from '../../src/js/_hfm-paint.js'

/**
 * Palette-mode (CW-6) tests.
 *
 * The canvas mock is richer than hfm.test.js's: atlas canvases report an
 * alpha ramp along x (so glyph shape vectors are distinct and bright cells
 * resolve to a non-space glyph), and the sampler context reports a
 * red-left / cyan-right frame (so cells pick different palette entries).
 */

const allContexts = []
let origGetContext

function installCanvasMock() {
  origGetContext = HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.getContext = function (type, opts) {
    const canvas = this
    const ctx = {
      canvas,
      _creationOpts: opts || {},
      _isSampler: false,
      // A distinct non-zero tag per context, written into the red channel of
      // that atlas's pixels so the painted frame carries the identity of the
      // atlas each cell was drawn from (CW-22: cells are composited, not
      // blitted, so the drawImage call log no longer records the source).
      _ctxId: (allContexts.length % 200) + 1,
      font: '',
      textAlign: '',
      textBaseline: '',
      fillStyle: '',
      globalAlpha: 1,
      imageSmoothingEnabled: true,
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      fillText: vi.fn(),
      drawImage: vi.fn((source) => {
        if (source && source.__isRendererCanvas) {
          ctx._isSampler = true
        }
      }),
      measureText: vi.fn(() => ({
        width: 6,
        fontBoundingBoxAscent: 8,
        fontBoundingBoxDescent: 2,
      })),
      getImageData: vi.fn((x, y, w, h) => {
        const data = new Uint8ClampedArray(w * h * 4)
        if (ctx._isSampler) {
          // Left half saturated red, right half saturated cyan.
          for (let py = 0; py < h; py++) {
            for (let px = 0; px < w; px++) {
              const i = (py * w + px) * 4
              if (px < w / 2) {
                data[i] = 230
                data[i + 1] = 20
                data[i + 2] = 20
              } else {
                data[i] = 20
                data[i + 1] = 230
                data[i + 2] = 230
              }
              data[i + 3] = 255
            }
          }
        } else {
          // Atlas readback: alpha ramps with x so glyph vectors differ and
          // a bright uniform cell maps to a non-space glyph. Red carries this
          // atlas's identity so painted cells can be traced back to it.
          for (let py = 0; py < h; py++) {
            for (let px = 0; px < w; px++) {
              const i = (py * w + px) * 4
              data[i] = ctx._ctxId
              data[i + 3] = (px * 7) % 256
            }
          }
        }
        return { data }
      }),
      createImageData: vi.fn((w, h) => ({
        width: w,
        height: h,
        data: new Uint8ClampedArray(Math.max(1, w * h) * 4),
      })),
      putImageData: vi.fn(),
    }
    allContexts.push(ctx)
    return ctx
  }
}

function removeCanvasMock() {
  HTMLCanvasElement.prototype.getContext = origGetContext
}

function createMockPreviewManager() {
  const canvas = document.createElement('canvas')
  canvas.width = 200
  canvas.height = 150
  canvas.__isRendererCanvas = true
  const container = document.createElement('div')
  Object.defineProperty(container, 'clientWidth', { value: 200 })
  Object.defineProperty(container, 'clientHeight', { value: 150 })
  return {
    renderer: { domElement: canvas, render: vi.fn() },
    scene: {},
    camera: { type: 'perspective' },
    container,
    controls: null,
    isAutoRotateEnabled: vi.fn(() => false),
    getActiveCamera: vi.fn(() => ({ type: 'perspective' })),
  }
}

/**
 * Which atlases the painted frame actually drew from.
 *
 * Before CW-22 this read the 9-arg drawImage call log. The composite path
 * paints every cell into one buffer instead, so the source is recovered from
 * the pixels themselves: each atlas stamps its own _ctxId into the red
 * channel, and a painted cell carries that tag through untouched.
 */
function paintedAtlasIds() {
  const ids = new Set()
  for (const ctx of allContexts) {
    for (const call of ctx.putImageData.mock.calls) {
      const { data } = call[0]
      for (let i = 0; i < data.length; i += 4) {
        // The painter only writes non-transparent-black source pixels, so any
        // non-zero quad here came from some atlas.
        if (data[i] || data[i + 1] || data[i + 2] || data[i + 3]) {
          if (data[i]) ids.add(data[i])
        }
      }
    }
  }
  return ids
}

beforeEach(() => {
  allContexts.length = 0
  installCanvasMock()
})

afterEach(() => {
  removeCanvasMock()
  vi.restoreAllMocks()
})

describe('palette math helpers', () => {
  it('parses hex colors', () => {
    expect(parsePaletteColor('#ff0000')).toEqual([1, 0, 0])
    expect(parsePaletteColor('#00ffff')).toEqual([0, 1, 1])
    const pink = parsePaletteColor('#ff2d95')
    expect(pink[0]).toBe(1)
    expect(pink[1]).toBeCloseTo(45 / 255, 5)
    expect(pink[2]).toBeCloseTo(149 / 255, 5)
    // Unparseable input degrades to white, never throws.
    expect(parsePaletteColor('rebeccapurple')).toEqual([1, 1, 1])
  })

  it('normalizes chroma by the max component', () => {
    expect(normalizeChroma([0.5, 0.25, 0])).toEqual([1, 0.5, 0])
    expect(normalizeChroma([0, 0, 0])).toEqual([0, 0, 0])
  })

  it('picks the hue-nearest entry, surviving fog darkening', () => {
    const palette = ['#00ff00', '#00ffff', '#ffff00', '#ff00ff', '#ff5555', '#ffffff']
    const normalized = palette.map((c) => normalizeChroma(parsePaletteColor(c)))

    // Saturated red → the red-family entry (#ff5555)
    expect(pickPaletteIndex(1, 0.1, 0.1, normalized)).toBe(4)
    // The SAME hue fog-dimmed to 10% → still the red entry
    expect(pickPaletteIndex(0.1, 0.01, 0.01, normalized)).toBe(4)
    // Cyan → cyan
    expect(pickPaletteIndex(0.05, 0.9, 0.9, normalized)).toBe(1)
    // Achromatic bright → white
    expect(pickPaletteIndex(0.8, 0.8, 0.8, normalized)).toBe(5)
    // Yellow → yellow
    expect(pickPaletteIndex(0.9, 0.9, 0.1, normalized)).toBe(2)
  })
})

describe('initAltView palette mode', () => {
  it('exposes setPalette/getPalette and returns a defensive copy', async () => {
    vi.resetModules()
    const { initAltView } = await import('../../src/js/_hfm.js')
    const api = await initAltView(createMockPreviewManager())

    expect(typeof api.setPalette).toBe('function')
    expect(api.getPalette()).toBeNull()

    const colors = ['#ff0000', '#00ffff']
    api.setPalette(colors)
    const got = api.getPalette()
    expect(got).toEqual(colors)
    expect(got).not.toBe(colors)

    api.setPalette(null)
    expect(api.getPalette()).toBeNull()
    api.dispose()
  })

  it('renders each cell from its palette color atlas (multi-source blits)', async () => {
    vi.resetModules()
    const { initAltView } = await import('../../src/js/_hfm.js')
    const pm = createMockPreviewManager()
    const api = await initAltView(pm)

    api.setPalette(['#ff5555', '#00ffff'])
    vi.spyOn(performance, 'now').mockReturnValue(10000)
    api.enable()
    api.render()

    const sources = paintedAtlasIds()
    // The red-left/cyan-right frame must route to BOTH palette atlases.
    expect(sources.size).toBeGreaterThanOrEqual(2)

    api.dispose()
  })

  it('null palette keeps the classic single-atlas path', async () => {
    vi.resetModules()
    const { initAltView } = await import('../../src/js/_hfm.js')
    const pm = createMockPreviewManager()
    const api = await initAltView(pm)

    vi.spyOn(performance, 'now').mockReturnValue(10000)
    api.enable()
    api.render()

    const sources = paintedAtlasIds()
    expect(sources.size).toBe(1)

    api.dispose()
  })

  it('palettes stay per-instance (isolation)', async () => {
    vi.resetModules()
    const { initAltView } = await import('../../src/js/_hfm.js')
    const a = await initAltView(createMockPreviewManager())
    const b = await initAltView(createMockPreviewManager())

    a.setPalette(['#ff0000', '#00ff00'])
    expect(a.getPalette()).toHaveLength(2)
    expect(b.getPalette()).toBeNull()

    a.dispose()
    b.dispose()
  })
})

describe('phosphor drive levels (CW-21)', () => {
  it('full drive returns the phosphor unchanged', () => {
    expect(driveColor('#00ff00', 1)).toBe('#00ff00')
    expect(driveColor('#ffb000', 1)).toBe('#ffb000')
  })

  it('dimming scales every channel together, so the hue survives', () => {
    // A dimmed green is still pure green: a monochrome tube driven softly is
    // the same phosphor with less beam, not a different colour.
    expect(driveColor('#00ff00', 0.65)).toBe('#00a600')
    expect(driveColor('#00ff00', 0.5)).toBe('#008000')
    // Amber keeps its red:green ratio through the dim.
    expect(driveColor('#ffb000', 0.65)).toBe('#a67200')
  })

  it('drive above 1 blooms toward white rather than overflowing', () => {
    // Multiplying would clip green to itself and change nothing; a real tube
    // saturates and washes out, which is what the extra energy looks like.
    expect(driveColor('#00ff00', 1.5)).toBe('#80ff80')
    expect(driveColor('#00ff00', 2)).toBe('#ffffff')
    expect(driveColor('#00ff00', 5)).toBe('#ffffff')
  })

  it('drive 0 is black and negative or non-finite drives do not throw', () => {
    expect(driveColor('#00ff00', 0)).toBe('#000000')
    expect(driveColor('#00ff00', -3)).toBe('#000000')
    expect(driveColor('#00ff00', NaN)).toBe('#00ff00')
    expect(driveColor('#00ff00', undefined)).toBe('#00ff00')
  })

  it('an unparseable phosphor degrades to white instead of throwing', () => {
    expect(driveColor('rebeccapurple', 1)).toBe('#ffffff')
  })
})

describe('intensity selection (CW-21)', () => {
  it('splits the luminance range evenly, brightest cells last', () => {
    // Two levels is the hardware's single intensity bit.
    expect(pickIntensityIndex(0, 2)).toBe(0)
    expect(pickIntensityIndex(0.49, 2)).toBe(0)
    expect(pickIntensityIndex(0.5, 2)).toBe(1)
    expect(pickIntensityIndex(1, 2)).toBe(1)
  })

  it('never indexes past the last level, whatever the luminance', () => {
    // A luminance of exactly 1 must not select levels[levelCount], which
    // would hand paintFrame an undefined atlas.
    for (const n of [2, 3, 4, 8]) {
      expect(pickIntensityIndex(1, n)).toBe(n - 1)
      expect(pickIntensityIndex(1.4, n)).toBe(n - 1)
      expect(pickIntensityIndex(-0.2, n)).toBe(0)
      expect(pickIntensityIndex(NaN, n)).toBe(0)
    }
  })

  it('collapses to a single level when there is nothing to choose between', () => {
    expect(pickIntensityIndex(0.9, 1)).toBe(0)
    expect(pickIntensityIndex(0.9, 0)).toBe(0)
  })

  it('gives each level an equal share of the range at four levels', () => {
    expect(pickIntensityIndex(0.1, 4)).toBe(0)
    expect(pickIntensityIndex(0.3, 4)).toBe(1)
    expect(pickIntensityIndex(0.6, 4)).toBe(2)
    expect(pickIntensityIndex(0.8, 4)).toBe(3)
  })
})
