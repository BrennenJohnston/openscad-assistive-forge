import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

function createMockCanvasContext(opts = {}) {
  return {
    font: '',
    textAlign: '',
    textBaseline: '',
    fillStyle: '',
    globalAlpha: 1,
    imageSmoothingEnabled: true,
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    drawImage: vi.fn(),
    getImageData: vi.fn(() => ({
      data: new Uint8ClampedArray(4),
    })),
    measureText: vi.fn(() => ({
      width: 6,
      actualBoundingBoxAscent: 8,
      actualBoundingBoxDescent: 2,
      actualBoundingBoxLeft: 0,
      actualBoundingBoxRight: 6,
    })),
    ...opts,
  }
}

const allContexts = []

let origGetContext
function installCanvasMock() {
  origGetContext = HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.getContext = function (type, opts) {
    const ctx = createMockCanvasContext()
    ctx.canvas = this
    ctx._creationOpts = opts || {}
    allContexts.push(ctx)
    return ctx
  }
}

function removeCanvasMock() {
  HTMLCanvasElement.prototype.getContext = origGetContext
}

function createMockContainer() {
  const el = document.createElement('div')
  Object.defineProperty(el, 'clientWidth', { value: 200, configurable: true })
  Object.defineProperty(el, 'clientHeight', { value: 150, configurable: true })
  return el
}

function createMockRenderer() {
  const canvas = document.createElement('canvas')
  canvas.width = 200
  canvas.height = 150
  canvas.style.opacity = ''
  return {
    domElement: canvas,
    render: vi.fn(),
  }
}

function createMockControls() {
  const listeners = new Map()
  return {
    addEventListener: vi.fn((type, fn) => listeners.set(type, fn)),
    removeEventListener: vi.fn((type) => listeners.delete(type)),
    _fire(type) {
      listeners.get(type)?.()
    },
  }
}

function createMockPreviewManager() {
  const perspCamera = { type: 'perspective' }
  const orthoCamera = { type: 'orthographic' }
  const renderer = createMockRenderer()
  const scene = {}
  const container = createMockContainer()
  let activeCamera = perspCamera

  return {
    renderer,
    scene,
    camera: perspCamera,
    container,
    controls: createMockControls(),
    isAutoRotateEnabled: vi.fn(() => false),
    getActiveCamera: vi.fn(() => activeCamera),
    _setActiveCamera(cam) { activeCamera = cam },
    _perspCamera: perspCamera,
    _orthoCamera: orthoCamera,
  }
}

/** Find the sampler context: the one that drew the WebGL canvas. */
function findSamplerCtx(pm) {
  return allContexts.find(c =>
    c.drawImage.mock.calls.some(call => call[0] === pm.renderer.domElement)
  )
}

/** Count sampling readbacks performed via the sampler context. */
function samplingDrawCount(pm) {
  const ctx = findSamplerCtx(pm)
  if (!ctx) return 0
  return ctx.drawImage.mock.calls.filter(
    call => call[0] === pm.renderer.domElement
  ).length
}

beforeEach(() => {
  allContexts.length = 0
  installCanvasMock()
})

afterEach(() => {
  removeCanvasMock()
  vi.restoreAllMocks()
})

describe('initAltView — camera sync (Hypothesis G)', () => {
  it('render() uses previewManager.getActiveCamera() instead of captured camera', async () => {
    vi.resetModules()
    const { initAltView } = await import('../../src/js/_hfm.js')
    const pm = createMockPreviewManager()
    const api = await initAltView(pm)

    api.render()

    expect(pm.getActiveCamera).toHaveBeenCalled()
    expect(pm.renderer.render).toHaveBeenCalledWith(pm.scene, pm._perspCamera)

    api.dispose()
  })

  it('render() picks up orthographic camera after projection switch', async () => {
    vi.resetModules()
    const { initAltView } = await import('../../src/js/_hfm.js')
    const pm = createMockPreviewManager()
    const api = await initAltView(pm)

    pm._setActiveCamera(pm._orthoCamera)
    api.render()

    expect(pm.renderer.render).toHaveBeenCalledWith(pm.scene, pm._orthoCamera)

    api.dispose()
  })
})

describe('initAltView — sampler imageSmoothingEnabled', () => {
  it('sets imageSmoothingEnabled = true on the sample canvas context (bilinear area-average)', async () => {
    vi.resetModules()
    const { initAltView } = await import('../../src/js/_hfm.js')
    const pm = createMockPreviewManager()
    const api = await initAltView(pm)

    vi.spyOn(performance, 'now').mockReturnValue(10000)
    api.enable()
    api.render()

    const samplerCtx = findSamplerCtx(pm)
    expect(samplerCtx).toBeDefined()
    expect(samplerCtx.imageSmoothingEnabled).toBe(true)

    api.dispose()
  })
})

describe('initAltView — integer paint destinations', () => {
  it('any overlay drawImage blit receives integer destination coordinates', async () => {
    vi.resetModules()
    const { initAltView } = await import('../../src/js/_hfm.js')
    const pm = createMockPreviewManager()
    const api = await initAltView(pm)

    vi.spyOn(performance, 'now').mockReturnValue(10000)
    api.enable()
    api.render()

    // 9-arg drawImage calls are atlas blits: (atlas, sx, sy, sw, sh, dx, dy, dw, dh)
    for (const ctx of allContexts) {
      for (const call of ctx.drawImage.mock.calls) {
        if (call.length === 9) {
          expect(Number.isInteger(call[5])).toBe(true)
          expect(Number.isInteger(call[6])).toBe(true)
        }
      }
    }

    api.dispose()
  })
})

describe('initAltView — render-on-demand scheduling', () => {
  it('skips ASCII conversion when not dirty (no new sampling drawImage)', async () => {
    vi.resetModules()
    const { initAltView } = await import('../../src/js/_hfm.js')
    const pm = createMockPreviewManager()
    const api = await initAltView(pm)

    const nowSpy = vi.spyOn(performance, 'now')

    nowSpy.mockReturnValue(10000)
    api.enable()
    api.render()
    expect(samplingDrawCount(pm)).toBe(1)

    // Advance past the fps throttle but stay inside the 1 Hz fallback window
    nowSpy.mockReturnValue(10100)
    api.render()
    expect(samplingDrawCount(pm)).toBe(1)

    // WebGL scene still renders every frame
    expect(pm.renderer.render).toHaveBeenCalledTimes(2)

    api.dispose()
  })

  it('invalidate() re-enables conversion', async () => {
    vi.resetModules()
    const { initAltView } = await import('../../src/js/_hfm.js')
    const pm = createMockPreviewManager()
    const api = await initAltView(pm)

    const nowSpy = vi.spyOn(performance, 'now')

    nowSpy.mockReturnValue(10000)
    api.enable()
    api.render()
    expect(samplingDrawCount(pm)).toBe(1)

    nowSpy.mockReturnValue(10100)
    api.render()
    expect(samplingDrawCount(pm)).toBe(1)

    api.invalidate()
    nowSpy.mockReturnValue(10200)
    api.render()
    expect(samplingDrawCount(pm)).toBe(2)

    api.dispose()
  })

  it('1 Hz fallback tick converts even without invalidation', async () => {
    vi.resetModules()
    const { initAltView } = await import('../../src/js/_hfm.js')
    const pm = createMockPreviewManager()
    const api = await initAltView(pm)

    const nowSpy = vi.spyOn(performance, 'now')

    nowSpy.mockReturnValue(10000)
    api.enable()
    api.render()
    expect(samplingDrawCount(pm)).toBe(1)

    // More than 1000 ms after the last conversion — fallback fires
    nowSpy.mockReturnValue(11500)
    api.render()
    expect(samplingDrawCount(pm)).toBe(2)

    api.dispose()
  })

  it('OrbitControls change event marks the frame dirty', async () => {
    vi.resetModules()
    const { initAltView } = await import('../../src/js/_hfm.js')
    const pm = createMockPreviewManager()
    const api = await initAltView(pm)

    const nowSpy = vi.spyOn(performance, 'now')

    nowSpy.mockReturnValue(10000)
    api.enable()
    expect(pm.controls.addEventListener).toHaveBeenCalledWith(
      'change',
      expect.any(Function)
    )
    api.render()
    expect(samplingDrawCount(pm)).toBe(1)

    pm.controls._fire('change')
    nowSpy.mockReturnValue(10100)
    api.render()
    expect(samplingDrawCount(pm)).toBe(2)

    api.dispose()
  })

  it('auto-rotate keeps conversion running every allowed frame', async () => {
    vi.resetModules()
    const { initAltView } = await import('../../src/js/_hfm.js')
    const pm = createMockPreviewManager()
    pm.isAutoRotateEnabled.mockReturnValue(true)
    const api = await initAltView(pm)

    const nowSpy = vi.spyOn(performance, 'now')

    nowSpy.mockReturnValue(10000)
    api.enable()
    api.render()
    expect(samplingDrawCount(pm)).toBe(1)

    nowSpy.mockReturnValue(10100)
    api.render()
    expect(samplingDrawCount(pm)).toBe(2)

    api.dispose()
  })

  it('disable() removes the controls change listener', async () => {
    vi.resetModules()
    const { initAltView } = await import('../../src/js/_hfm.js')
    const pm = createMockPreviewManager()
    const api = await initAltView(pm)

    api.enable()
    api.disable()

    expect(pm.controls.removeEventListener).toHaveBeenCalledWith(
      'change',
      expect.any(Function)
    )

    api.dispose()
  })
})

describe('initAltView — API surface', () => {
  it('exposes invalidate() and rebuildGlyphs(), and no getEffectiveFps()', async () => {
    vi.resetModules()
    const { initAltView } = await import('../../src/js/_hfm.js')
    const pm = createMockPreviewManager()
    const api = await initAltView(pm)

    expect(typeof api.invalidate).toBe('function')
    expect(typeof api.rebuildGlyphs).toBe('function')
    expect(api.getEffectiveFps).toBeUndefined()

    api.dispose()
  })

  it('clamps contrast and font scale to their documented ranges', async () => {
    vi.resetModules()
    const { initAltView } = await import('../../src/js/_hfm.js')
    const pm = createMockPreviewManager()
    const api = await initAltView(pm)

    expect(api.setContrastScale(99)).toBe(4.0)
    expect(api.setContrastScale(0)).toBe(0.5)
    expect(api.setFontScale(99)).toBe(2.5)
    expect(api.setFontScale(0)).toBe(0.5)

    api.dispose()
  })
})

describe('initAltView — instance isolation (CW-1)', () => {
  // Two instances from ONE module load (no resetModules between them): each
  // must own its overlay, sampler, settings, and lifecycle. This is what
  // allows a second alt-rendered surface to coexist with the preview's.
  it('creates an independent overlay per container', async () => {
    vi.resetModules()
    const { initAltView } = await import('../../src/js/_hfm.js')
    const pmA = createMockPreviewManager()
    const pmB = createMockPreviewManager()
    const a = await initAltView(pmA)
    const b = await initAltView(pmB)

    expect(
      pmA.container.querySelectorAll('canvas.hfm-overlay-canvas')
    ).toHaveLength(1)
    expect(
      pmB.container.querySelectorAll('canvas.hfm-overlay-canvas')
    ).toHaveLength(1)

    a.dispose()
    b.dispose()
  })

  it('settings do not cross-talk between instances', async () => {
    vi.resetModules()
    const { initAltView } = await import('../../src/js/_hfm.js')
    const a = await initAltView(createMockPreviewManager())
    const b = await initAltView(createMockPreviewManager())

    a.setContrastScale(4.0)
    a.setFontScale(2.5)
    a.setPersistFade(0.5)

    expect(b.getContrastScale()).toBe(1)
    expect(b.getFontScale()).toBe(1)
    expect(b.getPersistFade()).toBe(0)

    a.dispose()
    b.dispose()
  })

  it('enabling one instance leaves the other untouched, and each samples its own renderer', async () => {
    vi.resetModules()
    const { initAltView } = await import('../../src/js/_hfm.js')
    const pmA = createMockPreviewManager()
    const pmB = createMockPreviewManager()
    const a = await initAltView(pmA)
    const b = await initAltView(pmB)

    const nowSpy = vi.spyOn(performance, 'now')
    nowSpy.mockReturnValue(10000)

    a.enable()
    expect(a.isEnabled()).toBe(true)
    expect(b.isEnabled()).toBe(false)
    expect(pmA.renderer.domElement.style.opacity).toBe('0')
    expect(pmB.renderer.domElement.style.opacity).not.toBe('0')

    a.render()
    b.render()
    expect(samplingDrawCount(pmA)).toBe(1)
    expect(samplingDrawCount(pmB)).toBe(0)

    b.enable()
    b.render()
    expect(samplingDrawCount(pmB)).toBe(1)

    a.dispose()
    b.dispose()
  })

  it('disposing one instance leaves the other fully functional', async () => {
    vi.resetModules()
    const { initAltView } = await import('../../src/js/_hfm.js')
    const pmA = createMockPreviewManager()
    const pmB = createMockPreviewManager()
    const a = await initAltView(pmA)
    const b = await initAltView(pmB)

    const nowSpy = vi.spyOn(performance, 'now')
    nowSpy.mockReturnValue(10000)

    a.enable()
    b.enable()
    a.render()
    b.render()
    expect(samplingDrawCount(pmA)).toBe(1)
    expect(samplingDrawCount(pmB)).toBe(1)

    a.dispose()
    expect(
      pmA.container.querySelectorAll('canvas.hfm-overlay-canvas')
    ).toHaveLength(0)
    expect(
      pmB.container.querySelectorAll('canvas.hfm-overlay-canvas')
    ).toHaveLength(1)

    b.invalidate()
    nowSpy.mockReturnValue(10100)
    b.render()
    expect(samplingDrawCount(pmB)).toBe(2)

    b.dispose()
  })
})
