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
    getActiveCamera: vi.fn(() => activeCamera),
    _setActiveCamera(cam) { activeCamera = cam },
    _perspCamera: perspCamera,
    _orthoCamera: orthoCamera,
  }
}

beforeEach(() => {
  allContexts.length = 0
  installCanvasMock()
})

afterEach(() => {
  removeCanvasMock()
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

describe('initAltView — sampler imageSmoothingEnabled (Hypothesis B)', () => {
  it('sets imageSmoothingEnabled = false on the sample canvas context', async () => {
    vi.resetModules()
    const { initAltView } = await import('../../src/js/_hfm.js')
    const pm = createMockPreviewManager()
    const api = await initAltView(pm)

    api.enable()
    api.render()

    // Find the sampler context (created with willReadFrequently: true)
    const samplerCtx = allContexts.find(c => c._creationOpts?.willReadFrequently === true)
    expect(samplerCtx).toBeDefined()
    expect(samplerCtx.imageSmoothingEnabled).toBe(false)

    api.dispose()
  })
})

describe('initAltView — integer font metrics (Hypothesis C)', () => {
  it('fillText receives integer pixel positions even with fractional charW/charH', async () => {
    removeCanvasMock()
    allContexts.length = 0
    const fractionalOrigGetContext = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (type, opts) {
      const ctx = createMockCanvasContext({
        measureText: vi.fn(() => ({
          width: 6.7,
          actualBoundingBoxAscent: 8.3,
          actualBoundingBoxDescent: 2.4,
          actualBoundingBoxLeft: 0,
          actualBoundingBoxRight: 6.7,
        })),
      })
      ctx.canvas = this
      ctx._creationOpts = opts || {}
      allContexts.push(ctx)
      return ctx
    }

    vi.resetModules()
    const { initAltView } = await import('../../src/js/_hfm.js')
    const pm = createMockPreviewManager()
    const api = await initAltView(pm)

    api.enable()
    api.render()

    // Find the overlay context that received fillText calls
    const overlayCtx = allContexts.find(c =>
      c.fillText.mock.calls.length > 0 && !c._creationOpts?.willReadFrequently
    )
    if (overlayCtx) {
      for (const call of overlayCtx.fillText.mock.calls) {
        const [, x, y] = call
        expect(Number.isInteger(x)).toBe(true)
        expect(Number.isInteger(y)).toBe(true)
      }
    }

    api.dispose()
    HTMLCanvasElement.prototype.getContext = fractionalOrigGetContext
    installCanvasMock()
  })
})
