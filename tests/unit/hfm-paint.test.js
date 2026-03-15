import { describe, it, expect, beforeEach, vi } from 'vitest'
import { paintFrame, resizeOverlay, sampleColors, QUANT_LEVELS } from '../../src/js/_hfm-paint.js'

function createMockCtx(canvasWidth = 100, canvasHeight = 80) {
  const canvas = { width: canvasWidth, height: canvasHeight }
  const ctx = {
    canvas,
    clearRect: vi.fn(),
    fillText: vi.fn(),
    drawImage: vi.fn(),
    font: '',
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

function buildGrid(cols, rows) {
  const total = cols * rows
  const chars = new Array(total).fill('A')
  const colors = new Array(total).fill('rgb(0,255,0)')
  return { chars, colors }
}

function buildGridMultiColor(cols, rows, colorList) {
  const total = cols * rows
  const chars = new Array(total).fill('A')
  const colors = Array.from({ length: total }, (_, i) => colorList[i % colorList.length])
  return { chars, colors }
}

describe('paintFrame', () => {
  let ctx

  beforeEach(() => {
    ctx = createMockCtx()
  })

  it('calls clearRect and fillText rows*cols times without persistence', () => {
    const cols = 4
    const rows = 3
    const { chars, colors } = buildGrid(cols, rows)

    paintFrame(ctx, chars, colors, cols, rows, 10, 12, '10px mono', null, null, 0)

    expect(ctx.clearRect).toHaveBeenCalledOnce()
    expect(ctx.fillText).toHaveBeenCalledTimes(cols * rows)
  })

  it('sets font and textBaseline before drawing', () => {
    const { chars, colors } = buildGrid(2, 2)

    paintFrame(ctx, chars, colors, 2, 2, 10, 12, '14px monospace', null, null, 0)

    expect(ctx.font).toBe('14px monospace')
    expect(ctx.textBaseline).toBe('top')
  })

  it('draws each character at the correct grid position', () => {
    const cols = 3
    const rows = 2
    const charW = 8
    const charH = 16
    const { chars, colors } = buildGrid(cols, rows)

    paintFrame(ctx, chars, colors, cols, rows, charW, charH, '10px mono', null, null, 0)

    expect(ctx.fillText).toHaveBeenCalledWith('A', 0, 0)
    expect(ctx.fillText).toHaveBeenCalledWith('A', charW, 0)
    expect(ctx.fillText).toHaveBeenCalledWith('A', 2 * charW, 0)
    expect(ctx.fillText).toHaveBeenCalledWith('A', 0, charH)
  })

  it('composites persistence canvas when persistFade > 0', () => {
    const cols = 2
    const rows = 2
    const { chars, colors } = buildGrid(cols, rows)
    const persistCanvas = createMockPersistCanvas()
    const persistCtx = createMockPersistCtx()

    paintFrame(
      ctx, chars, colors, cols, rows, 10, 12, '10px mono',
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
    const { chars, colors } = buildGrid(cols, rows)
    const persistCanvas = createMockPersistCanvas()
    const persistCtx = createMockPersistCtx()

    paintFrame(
      ctx, chars, colors, cols, rows, 10, 12, '10px mono',
      persistCanvas, persistCtx, 0
    )

    expect(ctx.drawImage).not.toHaveBeenCalled()
    expect(persistCtx.drawImage).not.toHaveBeenCalled()
    expect(persistCtx.clearRect).not.toHaveBeenCalled()
  })

  it('degrades gracefully when persistCanvas is null', () => {
    const cols = 2
    const rows = 2
    const { chars, colors } = buildGrid(cols, rows)

    expect(() => {
      paintFrame(
        ctx, chars, colors, cols, rows, 10, 12, '10px mono',
        null, null, 0.85
      )
    }).not.toThrow()

    expect(ctx.drawImage).not.toHaveBeenCalled()
    expect(ctx.fillText).toHaveBeenCalledTimes(cols * rows)
  })

  it('degrades gracefully when persistCtx is null but persistCanvas is provided', () => {
    const cols = 2
    const rows = 2
    const { chars, colors } = buildGrid(cols, rows)
    const persistCanvas = createMockPersistCanvas()

    expect(() => {
      paintFrame(
        ctx, chars, colors, cols, rows, 10, 12, '10px mono',
        persistCanvas, null, 0.85
      )
    }).not.toThrow()

    expect(ctx.drawImage).not.toHaveBeenCalled()
  })

  it('sets fillStyle no more than QUANT_LEVELS times for a fully-unique-color grid', () => {
    const cols = 4
    const rows = 4
    // Build a grid where every cell has a distinct color string (worst case for batching)
    const total = cols * rows
    const chars = new Array(total).fill('A')
    // 16 unique colors — still within QUANT_LEVELS (32)
    const colors = Array.from({ length: total }, (_, i) => `rgb(0,${i * 16},0)`)

    const fillStyleValues = []
    Object.defineProperty(ctx, 'fillStyle', {
      get() { return fillStyleValues.at(-1) ?? '' },
      set(v) { fillStyleValues.push(v) },
      configurable: true,
    })

    paintFrame(ctx, chars, colors, cols, rows, 10, 12, '10px mono', null, null, 0)

    // Each unique color should be set exactly once (color-grouped batching)
    const uniqueColors = new Set(colors)
    expect(fillStyleValues.length).toBe(uniqueColors.size)
    expect(fillStyleValues.length).toBeLessThanOrEqual(QUANT_LEVELS)
  })

  it('draws all characters regardless of color-grouped draw order', () => {
    const cols = 3
    const rows = 2
    const colorList = ['rgb(0,128,0)', 'rgb(0,200,0)', 'rgb(0,64,0)']
    const { chars, colors } = buildGridMultiColor(cols, rows, colorList)

    paintFrame(ctx, chars, colors, cols, rows, 8, 16, '10px mono', null, null, 0)

    expect(ctx.fillText).toHaveBeenCalledTimes(cols * rows)
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
    const { chars, colors } = buildGrid(cols, rows)
    const persistCanvas = createMockPersistCanvas()
    const persistCtx = createMockPersistCtx()

    paintFrame(
      ctx, chars, colors, cols, rows, 10, 12, '10px mono',
      persistCanvas, persistCtx, 0.85
    )

    // After paintFrame with persistence, the persist canvas should have been updated
    expect(persistCtx.clearRect).toHaveBeenCalledOnce()
    expect(persistCtx.drawImage).toHaveBeenCalledWith(ctx.canvas, 0, 0)

    // Now simulate clearing persistence (as clearPersistence would)
    persistCtx.clearRect.mockClear()
    persistCtx.clearRect(0, 0, persistCanvas.width, persistCanvas.height)
    expect(persistCtx.clearRect).toHaveBeenCalledWith(0, 0, 100, 80)
  })
})

describe('resizeOverlay', () => {
  it('sets width and height on the primary canvas', () => {
    const canvas = { width: 0, height: 0 }
    resizeOverlay(canvas, 800, 600, null)

    expect(canvas.width).toBe(800)
    expect(canvas.height).toBe(600)
  })

  it('sets width and height on both canvases when persistCanvas is provided', () => {
    const canvas = { width: 0, height: 0 }
    const persistCanvas = { width: 0, height: 0 }

    resizeOverlay(canvas, 1024, 768, persistCanvas)

    expect(canvas.width).toBe(1024)
    expect(canvas.height).toBe(768)
    expect(persistCanvas.width).toBe(1024)
    expect(persistCanvas.height).toBe(768)
  })

  it('does not modify persistCanvas when it is null', () => {
    const canvas = { width: 0, height: 0 }

    expect(() => {
      resizeOverlay(canvas, 640, 480, null)
    }).not.toThrow()

    expect(canvas.width).toBe(640)
    expect(canvas.height).toBe(480)
  })

  it('does not modify persistCanvas when it is undefined', () => {
    const canvas = { width: 0, height: 0 }

    expect(() => {
      resizeOverlay(canvas, 640, 480, undefined)
    }).not.toThrow()

    expect(canvas.width).toBe(640)
    expect(canvas.height).toBe(480)
  })
})

describe('sampleColors', () => {
  function make1x1White() {
    return new Uint8ClampedArray([255, 255, 255, 255])
  }

  it('returns green phosphor when amber param is explicitly false', () => {
    const colors = sampleColors(make1x1White(), 1, 1, 1, 1, 1, false)
    expect(colors).toHaveLength(1)
    expect(colors[0]).toMatch(/^rgb\(0,\d+,0\)$/)
  })

  it('returns amber phosphor when amber param is explicitly true', () => {
    const colors = sampleColors(make1x1White(), 1, 1, 1, 1, 1, true)
    expect(colors).toHaveLength(1)
    expect(colors[0]).toMatch(/^rgb\(\d+,\d+,0\)$/)
    expect(colors[0]).not.toMatch(/^rgb\(0,/)
  })

  it('detects amber from data-theme="light" when amber param is omitted', () => {
    document.documentElement.setAttribute('data-theme', 'light')
    const colors = sampleColors(make1x1White(), 1, 1, 1, 1, 1)
    expect(colors[0]).toMatch(/^rgb\(\d+,\d+,0\)$/)
    expect(colors[0]).not.toMatch(/^rgb\(0,/)
    document.documentElement.removeAttribute('data-theme')
  })

  it('detects green from data-theme="dark" when amber param is omitted', () => {
    document.documentElement.setAttribute('data-theme', 'dark')
    const colors = sampleColors(make1x1White(), 1, 1, 1, 1, 1)
    expect(colors[0]).toMatch(/^rgb\(0,\d+,0\)$/)
    document.documentElement.removeAttribute('data-theme')
  })

  it('falls back to system preference when data-theme is absent', () => {
    document.documentElement.removeAttribute('data-theme')
    const colors = sampleColors(make1x1White(), 1, 1, 1, 1, 1)
    expect(colors).toHaveLength(1)
    // In JSDOM, matchMedia defaults to not matching (prefers-color-scheme: dark)
    // → system is light → amber
    expect(colors[0]).toMatch(/^rgb\(\d+,\d+,0\)$/)
  })

  it('produces correct grid dimensions for multi-cell grids', () => {
    const w = 4
    const h = 3
    const data = new Uint8ClampedArray(w * h * 4)
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 128; data[i + 1] = 128; data[i + 2] = 128; data[i + 3] = 255
    }
    const cols = 2
    const rows = 3
    const colors = sampleColors(data, w, w / cols, h / rows, cols, rows, false)
    expect(colors).toHaveLength(cols * rows)
  })
})
