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
    // CW-22: the composite path is now the default paint path, so the mock
    // has to be able to hand out and receive a frame buffer.
    createImageData: vi.fn((w, h) => ({
      width: w,
      height: h,
      data: new Uint8ClampedArray(w * h * 4),
    })),
    putImageData: vi.fn(),
    font: '',
    textAlign: '',
    textBaseline: '',
    fillStyle: '',
    globalAlpha: 1,
  }
  return ctx
}

/**
 * Decode the frame the composite path handed to putImageData.
 *
 * createMockAtlas paints each glyph cell as a solid block carrying its own
 * index in the red channel, so a painted frame can be read back as "which
 * glyph landed at which pixel" without a real canvas. This is what lets the
 * CW-22 tests assert the PIXELS a player sees instead of a drawImage call log.
 */
function paintedFrame(ctx) {
  const calls = ctx.putImageData.mock.calls
  const img = calls[calls.length - 1][0]
  return {
    width: img.width,
    height: img.height,
    /** Glyph index at a pixel, or null where nothing was painted. */
    glyphAt(x, y) {
      const p = (y * img.width + x) * 4
      return img.data[p + 3] === 0 ? null : img.data[p]
    },
    /** Cell origins that received a glyph, as "x,y" strings. */
    inkedOrigins(cols, rows, stepX, stepY) {
      const out = []
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = (c * stepX) | 0
          const y = (r * stepY) | 0
          if (this.glyphAt(x, y) !== null) out.push(`${x},${y}`)
        }
      }
      return out
    },
  }
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
  const width = GLYPH_COUNT * cellW
  const height = cellH
  // Every glyph cell is a solid opaque block whose RED channel carries that
  // glyph's own index, so painted output decodes back to glyph identity.
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < GLYPH_COUNT; i++) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < cellW; x++) {
        const p = (y * width + i * cellW + x) * 4
        data[p] = i
        data[p + 3] = 255
      }
    }
  }
  return {
    canvas: {
      width,
      height,
      getContext: () => ({ getImageData: () => ({ data, width, height }) }),
    },
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
      normalizeTinyAlpha: true,
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
      normalizeTinyAlpha: true,
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
      normalizeTinyAlpha: true,
    })
    HTMLCanvasElement.prototype.getContext = orig

    expect(atlasCtx.getImageData).not.toHaveBeenCalled()
    expect(atlasCtx.putImageData).not.toHaveBeenCalled()
  })

  it('leaves a tiny atlas alone when the caller did not opt in', () => {
    // THE guard for the main app. Iosevka Term advances at about half its
    // size, so the preview slider's own 0.5 minimum lands on a 7 px font and
    // a 4 px cell - inside the width threshold. Only the missing opt-in keeps
    // the preview's Alt View rendering exactly as it always has.
    const orig = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function () {
      atlasCtx = createMockCtx()
      atlasCtx.canvas = this
      stubAtlasPixels(164)
      return atlasCtx
    }
    buildGlyphAtlas({
      fontFamily: 'monospace',
      fontSizePx: 7,
      charW: 4,
      charH: 9,
      dpr: 1,
      color: '#00ff00',
      // no normalizeTinyAlpha - this is the preview's call shape
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

  it('composites one glyph per non-space cell in a single putImageData', () => {
    const cols = 4
    const rows = 3
    const atlas = createMockAtlas({ cellW: 10, cellH: 12 })
    const glyphs = buildGrid(cols, rows, 33) // 'A'

    paintFrame(ctx, glyphs, cols, rows, atlas, 10, 12, null, null, 0)

    // The whole frame reaches the canvas as ONE call, not one call per cell:
    // that is the entire point of the composite path (CW-12, CW-22).
    expect(ctx.putImageData).toHaveBeenCalledOnce()
    expect(ctx.drawImage).not.toHaveBeenCalled()
    const frame = paintedFrame(ctx)
    expect(frame.inkedOrigins(cols, rows, 10, 12)).toHaveLength(cols * rows)
  })

  it('skips blank (space) cells entirely', () => {
    const cols = 4
    const rows = 3
    const atlas = createMockAtlas({ cellW: 10, cellH: 12 })
    const glyphs = buildGrid(cols, rows, SPACE_INDEX)
    glyphs[5] = 33 // a single visible glyph, at col 1 of row 1

    paintFrame(ctx, glyphs, cols, rows, atlas, 10, 12, null, null, 0)

    const frame = paintedFrame(ctx)
    expect(frame.inkedOrigins(cols, rows, 10, 12)).toEqual(['10,12'])
    expect(frame.glyphAt(10, 12)).toBe(33)
  })

  it('selects the source rect from the atlas by glyph index', () => {
    const cols = 2
    const rows = 1
    const atlas = createMockAtlas({ cellW: 10, cellH: 12 })
    const glyphs = new Int16Array([33, 65]) // 'A' and 'a'

    paintFrame(ctx, glyphs, cols, rows, atlas, 10, 12, null, null, 0)

    // Each cell carries the pixels of ITS OWN glyph, across the full cell.
    const frame = paintedFrame(ctx)
    expect(frame.glyphAt(0, 0)).toBe(33)
    expect(frame.glyphAt(9, 11)).toBe(33)
    expect(frame.glyphAt(10, 0)).toBe(65)
    expect(frame.glyphAt(19, 11)).toBe(65)
  })

  it('paints destinations at integer coordinates even with fractional metrics', () => {
    const cols = 3
    const rows = 2
    const atlas = createMockAtlas({ cellW: 13, cellH: 23, dpr: 1.5 })
    // A different glyph per column, so cell boundaries are visible in output.
    const glyphs = new Int16Array([11, 22, 33, 11, 22, 33])

    paintFrame(ctx, glyphs, cols, rows, atlas, 8.7, 15.3, null, null, 0)

    // stepX 13.05 and stepY 22.95 truncate to whole pixels — glyph edges stay
    // crisp instead of landing on a fractional boundary.
    const frame = paintedFrame(ctx)
    expect(frame.glyphAt(0, 0)).toBe(11)
    expect(frame.glyphAt(13, 0)).toBe(22)
    expect(frame.glyphAt(26, 0)).toBe(33)
    expect(frame.glyphAt(0, 22)).toBe(11)
  })

  it('scales destination steps by the atlas dpr', () => {
    const cols = 2
    const rows = 1
    const atlas = createMockAtlas({ cellW: 20, cellH: 24, dpr: 2 })
    const glyphs = new Int16Array([1, 2])

    paintFrame(ctx, glyphs, cols, rows, atlas, 10, 12, null, null, 0)

    const frame = paintedFrame(ctx)
    expect(frame.glyphAt(0, 0)).toBe(1)
    expect(frame.glyphAt(20, 0)).toBe(2) // col 1 * charW 10 * dpr 2
  })

  it('composites at large character cells too — CW-22 removed the size gate', () => {
    // Until CW-22 a cell wider than 4 CSS px fell back to one drawImage per
    // cell, which MEASURED 2-3x slower at every size from the 50% default up.
    // Cell size no longer chooses the path; only afterglow does.
    const cols = 3
    const rows = 2
    const atlas = createMockAtlas({ cellW: 20, cellH: 30 })
    const glyphs = buildGrid(cols, rows, 40)

    paintFrame(ctx, glyphs, cols, rows, atlas, 20, 30, null, null, 0)

    expect(ctx.putImageData).toHaveBeenCalledOnce()
    expect(ctx.drawImage).not.toHaveBeenCalled()
    expect(paintedFrame(ctx).glyphAt(40, 30)).toBe(40)
  })

  it('afterglow still paints per cell — the one buffer cannot layer frames', () => {
    const cols = 2
    const rows = 2
    const atlas = createMockAtlas({ cellW: 10, cellH: 12 })
    const glyphs = buildGrid(cols, rows, 33)
    const persistCanvas = createMockPersistCanvas()
    const persistCtx = createMockPersistCtx()

    paintFrame(
      ctx, glyphs, cols, rows, atlas, 10, 12,
      persistCanvas, persistCtx, 0.85
    )

    expect(ctx.putImageData).not.toHaveBeenCalled()
    expect(ctx.clearRect).toHaveBeenCalledOnce()
    // cols*rows glyph blits plus the one persistence composite
    expect(ctx.drawImage).toHaveBeenCalledTimes(cols * rows + 1)
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
    const atlas = createMockAtlas({ cellW: 10, cellH: 12 })
    const glyphs = buildGrid(cols, rows, 33)

    expect(() => {
      paintFrame(ctx, glyphs, cols, rows, atlas, 10, 12, null, null, 0.85)
    }).not.toThrow()

    // No persistence canvas means no afterglow, which means the fade collapses
    // to 0 and the frame composites normally — glyphs, no trail.
    expect(ctx.putImageData).toHaveBeenCalledOnce()
    expect(paintedFrame(ctx).inkedOrigins(cols, rows, 10, 12)).toHaveLength(
      cols * rows
    )
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

describe('reverse-video atlas (CW-21)', () => {
  let origGetContext
  let ctxCalls

  beforeEach(() => {
    ctxCalls = []
    origGetContext = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function () {
      const ctx = {
        canvas: this,
        globalCompositeOperation: 'source-over',
        font: '',
        textAlign: '',
        textBaseline: '',
        fillStyle: '',
        clearRect: vi.fn(),
        fillRect: vi.fn(function (...a) {
          ctxCalls.push(['fillRect', ctx.globalCompositeOperation, ...a])
        }),
        fillText: vi.fn(function (ch) {
          ctxCalls.push(['fillText', ctx.globalCompositeOperation, ch])
        }),
        getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
        putImageData: vi.fn(),
      }
      return ctx
    }
  })

  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = origGetContext
  })

  const build = (reverse) =>
    buildGlyphAtlas({
      fontFamily: 'monospace',
      fontSizePx: 10,
      charW: 6,
      charH: 12,
      dpr: 1,
      color: '#00ff00',
      reverse,
    })

  it('fills the whole atlas and knocks the glyphs out of it', () => {
    build(true)
    const fills = ctxCalls.filter((c) => c[0] === 'fillRect')
    const texts = ctxCalls.filter((c) => c[0] === 'fillText')
    // One solid fill, laid down BEFORE any glyph, in normal compositing.
    expect(fills).toHaveLength(1)
    expect(fills[0][1]).toBe('source-over')
    expect(ctxCalls.indexOf(fills[0])).toBeLessThan(ctxCalls.indexOf(texts[0]))
    // Every glyph is then punched out of that fill, not painted onto it.
    expect(texts).toHaveLength(GLYPH_COUNT)
    for (const t of texts) expect(t[1]).toBe('destination-out')
  })

  it('leaves the normal atlas exactly as it was', () => {
    build(false)
    expect(ctxCalls.filter((c) => c[0] === 'fillRect')).toHaveLength(0)
    const texts = ctxCalls.filter((c) => c[0] === 'fillText')
    expect(texts).toHaveLength(GLYPH_COUNT)
    for (const t of texts) expect(t[1]).toBe('source-over')
  })

  it('restores normal compositing so the caller is not left inverted', () => {
    const atlas = build(true)
    expect(atlas.reverse).toBe(true)
    expect(build(false).reverse).toBe(false)
  })
})

describe('CRT decoration (CW-21 P4)', () => {
  it('bloom asks the rasterizer for a halo, and only when requested', () => {
    const seen = []
    const orig = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function () {
      const ctx = createMockCtx()
      ctx.canvas = this
      ctx.shadowBlur = 0
      ctx.shadowColor = ''
      ctx.fillText = vi.fn(() => {
        seen.push({ blur: ctx.shadowBlur, color: ctx.shadowColor })
      })
      return ctx
    }
    const build = (bloom, dpr = 1) =>
      buildGlyphAtlas({
        fontFamily: 'monospace',
        fontSizePx: 10,
        charW: 6,
        charH: 12,
        dpr,
        color: '#00ff00',
        bloom,
      })

    build(0)
    expect(seen.every((s) => s.blur === 0)).toBe(true)

    seen.length = 0
    build(2)
    // Every glyph is drawn with the halo, tinted the same phosphor.
    expect(seen).toHaveLength(GLYPH_COUNT)
    expect(seen.every((s) => s.blur === 2 && s.color === '#00ff00')).toBe(true)

    // The radius is in CSS px, so a 2x display gets the same apparent halo.
    seen.length = 0
    build(2, 2)
    expect(seen[0].blur).toBe(4)

    HTMLCanvasElement.prototype.getContext = orig
  })

  it('scanlines take alpha off alternate rows and leave the rest alone', () => {
    const cols = 4
    const rows = 4
    const atlas = createMockAtlas({ cellW: 10, cellH: 12 })
    const glyphs = buildGrid(cols, rows, 33)
    const ctx = createMockCtx(cols * 10, rows * 12)

    paintFrame(
      ctx, glyphs, cols, rows, atlas, 10, 12,
      null, null, 0, undefined, false, 0.5
    )

    const img = ctx.putImageData.mock.calls[0][0]
    const w = img.width
    const alphaAt = (x, y) => img.data[(y * w + x) * 4 + 3]
    // Row 0 is untouched, row 1 keeps half its alpha, row 2 untouched again.
    expect(alphaAt(0, 0)).toBe(255)
    expect(alphaAt(0, 1)).toBe(128)
    expect(alphaAt(0, 2)).toBe(255)
    expect(alphaAt(0, 3)).toBe(128)
  })

  it('no scanline dim leaves every row at full alpha', () => {
    const cols = 4
    const rows = 4
    const atlas = createMockAtlas({ cellW: 10, cellH: 12 })
    const glyphs = buildGrid(cols, rows, 33)
    const ctx = createMockCtx(cols * 10, rows * 12)

    paintFrame(ctx, glyphs, cols, rows, atlas, 10, 12, null, null, 0)

    const img = ctx.putImageData.mock.calls[0][0]
    const w = img.width
    for (let y = 0; y < 4; y++) {
      expect(img.data[(y * w) * 4 + 3]).toBe(255)
    }
  })
})
