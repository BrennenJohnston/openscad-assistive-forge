import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  paintFrame,
  resizeOverlay,
  buildGlyphAtlas,
  getPhosphorColor,
  GLYPH_COUNT,
  SPACE_INDEX,
} from '../../src/js/_hfm-paint.js'

function createMockCtx(canvasWidth = 100, canvasHeight = 80) {
  const canvas = { width: canvasWidth, height: canvasHeight }
  const ctx = {
    canvas,
    clearRect: vi.fn(),
    fillText: vi.fn(),
    drawImage: vi.fn(),
    font: '',
    textAlign: '',
    textBaseline: '',
    fillStyle: '',
    globalAlpha: 1,
  }
  return ctx
}

function createMockPersistCanvas(width = 100, height = 80) {
  return { width, height }
}

function createMockPersistCtx() {
  return {
    clearRect: vi.fn(),
    drawImage: vi.fn(),
  }
}

function createMockAtlas({ cellW = 12, cellH = 24, dpr = 1 } = {}) {
  return {
    canvas: { width: GLYPH_COUNT * cellW, height: cellH },
    cellW,
    cellH,
    dpr,
    color: '#00ff00',
  }
}

/** Flat glyph-index grid filled with a single index. */
function buildGrid(cols, rows, index) {
  return new Int16Array(cols * rows).fill(index)
}

describe('buildGlyphAtlas', () => {
  let origGetContext
  let atlasCtx

  beforeEach(() => {
    origGetContext = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function () {
      atlasCtx = createMockCtx()
      atlasCtx.canvas = this
      atlasCtx.getImageData = vi.fn(() => ({ data: new Uint8ClampedArray(4) }))
      return atlasCtx
    }
  })

  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = origGetContext
  })

  it('sizes cells at device-pixel resolution', () => {
    const atlas = buildGlyphAtlas({
      fontFamily: 'monospace',
      fontSizePx: 10,
      charW: 6,
      charH: 12,
      dpr: 2,
      color: '#00ff00',
    })

    expect(atlas.cellW).toBe(12)
    expect(atlas.cellH).toBe(24)
    expect(atlas.canvas.width).toBe(GLYPH_COUNT * 12)
    expect(atlas.canvas.height).toBe(24)
    expect(atlas.dpr).toBe(2)
  })

  /**
   * Install a getImageData that hands back a one-glyph-worth buffer whose
   * strongest alpha is `maxAlpha`, and capture what putImageData writes back.
   */
  function stubAtlasPixels(maxAlpha) {
    const pixels = new Uint8ClampedArray(4 * 4)
    // Four pixels: transparent, half of max, max, transparent.
    pixels[3] = 0
    pixels[7] = Math.round(maxAlpha / 2)
    pixels[11] = maxAlpha
    pixels[15] = 0
    atlasCtx.getImageData = vi.fn(() => ({ data: pixels }))
    atlasCtx.putImageData = vi.fn()
    return pixels
  }

  it('restores brightness a tiny atlas lost to antialiasing (CW-12)', () => {
    let pixels
    const orig = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function () {
      atlasCtx = createMockCtx()
      atlasCtx.canvas = this
      pixels = stubAtlasPixels(164) // MEASURED: a 3 px atlas peaks at 164/255
      return atlasCtx
    }
    buildGlyphAtlas({
      fontFamily: 'monospace',
      fontSizePx: 3,
      charW: 2,
      charH: 4,
      dpr: 1,
      color: '#00ff00',
    })
    HTMLCanvasElement.prototype.getContext = orig

    expect(atlasCtx.putImageData).toHaveBeenCalledTimes(1)
    // The strongest pixel reaches full opacity; the rest scale with it and
    // fully transparent pixels stay transparent.
    expect(pixels[11]).toBe(255)
    expect(pixels[7]).toBe(128)
    expect(pixels[3]).toBe(0)
    expect(pixels[15]).toBe(0)
  })

  it('leaves an already-opaque tiny atlas untouched', () => {
    const orig = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function () {
      atlasCtx = createMockCtx()
      atlasCtx.canvas = this
      stubAtlasPixels(255)
      return atlasCtx
    }
    buildGlyphAtlas({
      fontFamily: 'monospace',
      fontSizePx: 4,
      charW: 3,
      charH: 5,
      dpr: 1,
      color: '#00ff00',
    })
    HTMLCanvasElement.prototype.getContext = orig

    expect(atlasCtx.putImageData).not.toHaveBeenCalled()
  })

  it('never touches an atlas big enough for the preview to use', () => {
    // The preview's Alt View bottoms out around a 5-6 px cell. Above the
    // 4 px threshold the atlas is not even read, let alone rewritten.
    const orig = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function () {
      atlasCtx = createMockCtx()
      atlasCtx.canvas = this
      stubAtlasPixels(120) // faint on purpose: it must STILL be left alone
      return atlasCtx
    }
    buildGlyphAtlas({
      fontFamily: 'monospace',
      fontSizePx: 10,
      charW: 5,
      charH: 13,
      dpr: 1,
      color: '#00ff00',
    })
    HTMLCanvasElement.prototype.getContext = orig

    expect(atlasCtx.getImageData).not.toHaveBeenCalled()
    expect(atlasCtx.putImageData).not.toHaveBeenCalled()
  })

  it('renders all 95 printable ASCII glyphs centered with the tint color', () => {
    buildGlyphAtlas({
      fontFamily: 'monospace',
      fontSizePx: 10,
      charW: 6,
      charH: 12,
      dpr: 1,
      color: '#ffb000',
    })

    expect(atlasCtx.fillText).toHaveBeenCalledTimes(GLYPH_COUNT)
    expect(atlasCtx.fillStyle).toBe('#ffb000')
    expect(atlasCtx.textAlign).toBe('center')
    expect(atlasCtx.textBaseline).toBe('middle')

    // First glyph (space) at the center of cell 0; last glyph (~) at cell 94
    expect(atlasCtx.fillText).toHaveBeenCalledWith(' ', 3, 6)
    expect(atlasCtx.fillText).toHaveBeenCalledWith('~', 94 * 6 + 3, 6)
  })
})

describe('getPhosphorColor', () => {
  it('falls back to green when --color-accent is not defined', () => {
    // jsdom getComputedStyle returns '' for undefined custom properties
    expect(getPhosphorColor()).toBe('#00ff00')
  })
})

describe('paintFrame', () => {
  let ctx

  beforeEach(() => {
    ctx = createMockCtx()
  })

  it('clears once and blits one glyph per non-space cell', () => {
    const cols = 4
    const rows = 3
    const atlas = createMockAtlas()
    const glyphs = buildGrid(cols, rows, 33) // 'A'

    paintFrame(ctx, glyphs, cols, rows, atlas, 10, 12, null, null, 0)

    expect(ctx.clearRect).toHaveBeenCalledOnce()
    expect(ctx.drawImage).toHaveBeenCalledTimes(cols * rows)
  })

  it('skips blank (space) cells entirely', () => {
    const cols = 4
    const rows = 3
    const atlas = createMockAtlas()
    const glyphs = buildGrid(cols, rows, SPACE_INDEX)
    glyphs[5] = 33 // a single visible glyph

    paintFrame(ctx, glyphs, cols, rows, atlas, 10, 12, null, null, 0)

    expect(ctx.drawImage).toHaveBeenCalledTimes(1)
  })

  it('selects the source rect from the atlas by glyph index', () => {
    const cols = 2
    const rows = 1
    const atlas = createMockAtlas({ cellW: 12, cellH: 24 })
    const glyphs = new Int16Array([33, 65]) // 'A' and 'a'

    paintFrame(ctx, glyphs, cols, rows, atlas, 10, 12, null, null, 0)

    const calls = ctx.drawImage.mock.calls
    expect(calls[0][0]).toBe(atlas.canvas)
    // (atlas, sx, sy, sw, sh, dx, dy, dw, dh)
    expect(calls[0].slice(1, 5)).toEqual([33 * 12, 0, 12, 24])
    expect(calls[1].slice(1, 5)).toEqual([65 * 12, 0, 12, 24])
  })

  it('paints destinations at integer coordinates even with fractional metrics', () => {
    const cols = 3
    const rows = 2
    const atlas = createMockAtlas({ cellW: 13, cellH: 27, dpr: 1.5 })
    const glyphs = buildGrid(cols, rows, 2)

    paintFrame(ctx, glyphs, cols, rows, atlas, 8.7, 15.3, null, null, 0)

    for (const call of ctx.drawImage.mock.calls) {
      const [, , , , , dx, dy] = call
      expect(Number.isInteger(dx)).toBe(true)
      expect(Number.isInteger(dy)).toBe(true)
    }
    expect(ctx.drawImage).toHaveBeenCalledTimes(cols * rows)
  })

  it('scales destination steps by the atlas dpr', () => {
    const cols = 2
    const rows = 1
    const atlas = createMockAtlas({ cellW: 20, cellH: 24, dpr: 2 })
    const glyphs = new Int16Array([1, 1])

    paintFrame(ctx, glyphs, cols, rows, atlas, 10, 12, null, null, 0)

    const calls = ctx.drawImage.mock.calls
    expect(calls[0][5]).toBe(0)
    expect(calls[1][5]).toBe(20) // col 1 * charW 10 * dpr 2
  })

  it('composites persistence canvas when persistFade > 0', () => {
    const cols = 2
    const rows = 2
    const atlas = createMockAtlas()
    const glyphs = buildGrid(cols, rows, 33)
    const persistCanvas = createMockPersistCanvas()
    const persistCtx = createMockPersistCtx()

    paintFrame(
      ctx, glyphs, cols, rows, atlas, 10, 12,
      persistCanvas, persistCtx, 0.85
    )

    // ctx.drawImage composites the persist canvas onto main
    expect(ctx.drawImage).toHaveBeenCalledWith(persistCanvas, 0, 0)
    // persistCtx.drawImage copies the combined result back
    expect(persistCtx.clearRect).toHaveBeenCalledOnce()
    expect(persistCtx.drawImage).toHaveBeenCalledWith(ctx.canvas, 0, 0)
  })

  it('does not enter persistence branch when persistFade is 0', () => {
    const cols = 2
    const rows = 2
    const atlas = createMockAtlas()
    const glyphs = buildGrid(cols, rows, 33)
    const persistCanvas = createMockPersistCanvas()
    const persistCtx = createMockPersistCtx()

    paintFrame(
      ctx, glyphs, cols, rows, atlas, 10, 12,
      persistCanvas, persistCtx, 0
    )

    expect(ctx.drawImage).not.toHaveBeenCalledWith(persistCanvas, 0, 0)
    expect(persistCtx.drawImage).not.toHaveBeenCalled()
    expect(persistCtx.clearRect).not.toHaveBeenCalled()
  })

  it('degrades gracefully when persistCanvas is null', () => {
    const cols = 2
    const rows = 2
    const atlas = createMockAtlas()
    const glyphs = buildGrid(cols, rows, 33)

    expect(() => {
      paintFrame(ctx, glyphs, cols, rows, atlas, 10, 12, null, null, 0.85)
    }).not.toThrow()

    // only atlas blits, no persistence composite
    expect(ctx.drawImage).toHaveBeenCalledTimes(cols * rows)
  })

  it('degrades gracefully when persistCtx is null but persistCanvas is provided', () => {
    const cols = 2
    const rows = 2
    const atlas = createMockAtlas()
    const glyphs = buildGrid(cols, rows, 33)
    const persistCanvas = createMockPersistCanvas()

    expect(() => {
      paintFrame(
        ctx, glyphs, cols, rows, atlas, 10, 12,
        persistCanvas, null, 0.85
      )
    }).not.toThrow()

    expect(ctx.drawImage).not.toHaveBeenCalledWith(persistCanvas, 0, 0)
  })
})

describe('persistence canvas clearing', () => {
  it('clearRect on persistCtx clears stale afterglow content', () => {
    const persistCanvas = createMockPersistCanvas(200, 150)
    const persistCtx = createMockPersistCtx()

    // Simulate what clearPersistence() does
    persistCtx.clearRect(0, 0, persistCanvas.width, persistCanvas.height)

    expect(persistCtx.clearRect).toHaveBeenCalledWith(0, 0, 200, 150)
  })

  it('paintFrame with persistFade > 0 composites then stores to persistence canvas', () => {
    const ctx = createMockCtx()
    const cols = 3
    const rows = 2
    const atlas = createMockAtlas()
    const glyphs = buildGrid(cols, rows, 33)
    const persistCanvas = createMockPersistCanvas()
    const persistCtx = createMockPersistCtx()

    paintFrame(
      ctx, glyphs, cols, rows, atlas, 10, 12,
      persistCanvas, persistCtx, 0.85
    )

    expect(persistCtx.clearRect).toHaveBeenCalledOnce()
    expect(persistCtx.drawImage).toHaveBeenCalledWith(ctx.canvas, 0, 0)
  })
})

describe('resizeOverlay', () => {
  function mockCanvas() {
    return { width: 0, height: 0, style: {} }
  }

  it('sets a DPR-scaled backing store with CSS-sized element styles', () => {
    const canvas = mockCanvas()
    resizeOverlay(canvas, 800, 600, 2, null)

    expect(canvas.width).toBe(1600)
    expect(canvas.height).toBe(1200)
    expect(canvas.style.width).toBe('800px')
    expect(canvas.style.height).toBe('600px')
  })

  it('keeps backing store equal to CSS size at dpr 1', () => {
    const canvas = mockCanvas()
    resizeOverlay(canvas, 640, 480, 1, null)

    expect(canvas.width).toBe(640)
    expect(canvas.height).toBe(480)
  })

  it('sizes the persistence canvas to match the backing store', () => {
    const canvas = mockCanvas()
    const persistCanvas = { width: 0, height: 0 }

    resizeOverlay(canvas, 1024, 768, 1.5, persistCanvas)

    expect(canvas.width).toBe(1536)
    expect(canvas.height).toBe(1152)
    expect(persistCanvas.width).toBe(1536)
    expect(persistCanvas.height).toBe(1152)
  })

  it('does not modify persistCanvas when it is null or undefined', () => {
    const canvas = mockCanvas()

    expect(() => {
      resizeOverlay(canvas, 640, 480, 1, null)
      resizeOverlay(canvas, 640, 480, 1, undefined)
    }).not.toThrow()

    expect(canvas.width).toBe(640)
    expect(canvas.height).toBe(480)
  })
})
