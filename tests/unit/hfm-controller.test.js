/**
 * The Alt View controller: its effect on the preview it switches, and its
 * words (what the live region is written with).
 *
 * The preview manager here is the real class with its drawing calls
 * stubbed, so the grid logic under test is the shipped one; the character
 * renderer is replaced, because the controller only needs its handle.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  BoxGeometry,
  Box3,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Vector3,
} from 'three'
import { PreviewManager } from '../../src/js/preview.js'
import { announce } from '../../src/js/announcer.js'

vi.mock('../../src/js/_hfm.js', () => ({
  initAltView: vi.fn(async () => ({
    enable: vi.fn(),
    disable: vi.fn(),
    render: vi.fn(),
    resize: vi.fn(),
    invalidate: vi.fn(),
    rebuildGlyphs: vi.fn(),
    setFontScale: vi.fn(),
    setContrastScale: vi.fn(),
    setPersistFade: vi.fn(),
    setReducedMotion: vi.fn(),
    clearPersistence: vi.fn(),
  })),
}))

function previewManagerStub() {
  const pm = Object.create(PreviewManager.prototype)
  Object.assign(pm, {
    gridEnabled: pm.loadGridPreference(),
    gridHelper: { visible: true },
    mesh: null,
    renderer: {},
    setPostLoadHook: vi.fn(),
    clearPostLoadHook: vi.fn(),
    setRenderOverride: vi.fn(),
    clearRenderOverride: vi.fn(),
    setResizeHook: vi.fn(),
    clearResizeHook: vi.fn(),
    detectTheme: vi.fn(() => 'dark'),
    updateTheme: vi.fn(),
    handleResize: vi.fn(),
    disableRotationCentering: vi.fn(),
  })
  pm.gridHelper.visible = pm.gridEnabled
  return pm
}

async function freshController(previewManager = null) {
  vi.resetModules()
  const { initHfmController } = await import('../../src/js/hfm-controller.js')
  return initHfmController({
    getPreviewManager: () => previewManager,
    getDisplayOptionsController: () => ({ refreshOverlays: vi.fn() }),
  })
}

// The pieces of the page the controller looks for: the live region, the
// theme button the key is placed after, the pan D-pad, and the camera
// panel's tools row the adjust button joins beside the projection button.
// Returns every text written to the live region.
function pageWithHeaderAndDpad() {
  document.body.innerHTML = `
    <div id="srAnnouncer" aria-live="polite"></div>
    <button id="themeToggle"></button>
    <div id="cameraPanelBody">
      <div class="camera-control-dpad"><button id="cameraPanUp"></button></div>
      <div class="camera-shortcuts-help"><button id="projectionToggle"></button></div>
      <div id="cameraPanelExtras"></div>
    </div>
    <div id="previewStatusBar"><span id="previewStatusAltAdjust"></span></div>
  `
  const region = document.getElementById('srAnnouncer')
  const written = []
  new MutationObserver(() => {
    if (region.textContent) written.push(region.textContent)
  }).observe(region, {
    childList: true,
    characterData: true,
    subtree: true,
  })
  return written
}

describe('the character size the Alt View starts with', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-ui-variant')
  })

  afterEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-ui-variant')
  })

  async function lastAltView() {
    const { initAltView } = await import('../../src/js/_hfm.js')
    return initAltView.mock.results.at(-1).value
  }

  it('draws finer characters when nothing is saved, and a saved size wins', async () => {
    const pm = previewManagerStub()
    const controller = await freshController(pm)
    const toggle = document.createElement('button')

    await controller.enableAltViewWithPreview(toggle)
    const altView = await lastAltView()
    expect(altView.setFontScale).toHaveBeenLastCalledWith(0.6)
    controller.disableAltViewWithPreview(toggle)

    localStorage.setItem('openscad-forge-hfm-font-scale', '1.2')
    const pm2 = previewManagerStub()
    const controller2 = await freshController(pm2)
    await controller2.enableAltViewWithPreview(toggle)
    expect((await lastAltView()).setFontScale).toHaveBeenLastCalledWith(1.2)
  })
})

describe('the glow the Alt View starts with', () => {
  const GLOW_KEY = 'openscad-forge-hfm-persist-fade'
  let matchMedia

  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-ui-variant')
    matchMedia = window.matchMedia
  })

  afterEach(() => {
    window.matchMedia = matchMedia
    vi.useRealTimers()
    localStorage.clear()
    document.documentElement.removeAttribute('data-ui-variant')
  })

  function reduceMotion() {
    window.matchMedia = vi.fn((query) => ({
      matches: query.includes('prefers-reduced-motion: reduce'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  }

  async function lastAltView() {
    const { initAltView } = await import('../../src/js/_hfm.js')
    return initAltView.mock.results.at(-1).value
  }

  it('is a gentle 15% when nothing is saved, and a saved 0 stays 0', async () => {
    // Fake timers: turning the Alt View on queues a delayed save of the glow,
    // and a real one would fire into the next case's storage.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    pageWithHeaderAndDpad()
    const controller = await freshController(previewManagerStub())
    const toggle = document.createElement('button')
    await controller.enableAltViewWithPreview(toggle)
    expect((await lastAltView()).setPersistFade).toHaveBeenLastCalledWith(0.15)
    controller.disableAltViewWithPreview(toggle)

    localStorage.setItem(GLOW_KEY, '0')
    const controller2 = await freshController(previewManagerStub())
    await controller2.enableAltViewWithPreview(toggle)
    expect((await lastAltView()).setPersistFade).toHaveBeenLastCalledWith(0)
  })

  it('with reduced motion is held at 0, says so, and leaves the saved choice alone', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    reduceMotion()
    pageWithHeaderAndDpad()
    localStorage.setItem(GLOW_KEY, '0.4')
    const controller = await freshController(previewManagerStub())
    const toggle = document.createElement('button')
    document.documentElement.setAttribute('data-ui-variant', 'mono')
    await controller.enableAltViewWithPreview(toggle)
    await vi.advanceTimersByTimeAsync(2_000)
    expect((await lastAltView()).setPersistFade).toHaveBeenLastCalledWith(0)
    expect(document.getElementById('previewStatusAltAdjust').textContent).toContain('GLOW 0%')
    expect(localStorage.getItem(GLOW_KEY)).toBe('0.4')
  })
})

describe('the grid when the Alt View turns on and off', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-ui-variant')
  })

  afterEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-ui-variant')
  })

  it('hides the grid in the Alt View, keeps one turned on there, and restores the ordinary grid after', async () => {
    const pm = previewManagerStub()
    const controller = await freshController(pm)
    const toggle = document.createElement('button')
    expect(pm.gridHelper.visible).toBe(true)

    await controller.enableAltViewWithPreview(toggle)
    expect(document.documentElement.getAttribute('data-ui-variant')).toBe('mono')
    expect(pm.gridHelper.visible).toBe(false)

    pm.toggleGrid(true)
    controller.disableAltViewWithPreview(toggle)
    expect(pm.gridHelper.visible).toBe(true)

    pm.toggleGrid(false)
    await controller.enableAltViewWithPreview(toggle)
    expect(pm.gridHelper.visible).toBe(true)

    controller.disableAltViewWithPreview(toggle)
    expect(pm.gridHelper.visible).toBe(false)
  })
})

describe('the model stays on the bed in the Alt View', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-ui-variant')
  })

  afterEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-ui-variant')
  })

  // A 50 x 40 x 30 box as a load leaves it: centred, then raised by the
  // auto-bed so its bottom sits on the grid at Z 0 and the orbit target at
  // its middle.
  function previewManagerWithBox() {
    const pm = previewManagerStub()
    const geometry = new BoxGeometry(50, 40, 30)
    geometry.translate(0, 0, 15)
    pm.mesh = new Mesh(geometry, new MeshBasicMaterial())
    pm.autoBedEnabled = true
    pm.autoBedOffset = 15
    pm.rotationCenteringEnabled = false
    pm.referenceOverlay = null
    pm.camera = new PerspectiveCamera()
    pm.camera.position.set(100, -100, 100)
    pm.projectionMode = 'perspective'
    pm.controls = { target: new Vector3(0, 0, 15), update: vi.fn() }
    delete pm.disableRotationCentering
    return pm
  }

  const bottomZ = (pm) => {
    pm.mesh.updateMatrixWorld(true)
    return new Box3().setFromObject(pm.mesh).min.z
  }

  it('keeps the bottom on the grid and the orbit about the middle, on and off', async () => {
    const pm = previewManagerWithBox()
    const controller = await freshController(pm)
    const toggle = document.createElement('button')
    expect(bottomZ(pm)).toBeCloseTo(0)

    await controller.enableAltViewWithPreview(toggle)
    expect(bottomZ(pm)).toBeCloseTo(0)
    expect(pm.controls.target.z).toBeCloseTo(15)

    controller.disableAltViewWithPreview(toggle)
    expect(bottomZ(pm)).toBeCloseTo(0)
    expect(pm.controls.target.z).toBeCloseTo(15)
  })
})

describe('the unlock is heard', () => {
  let region

  beforeEach(() => {
    vi.useFakeTimers({
      toFake: [
        'setTimeout',
        'clearTimeout',
        'requestAnimationFrame',
        'cancelAnimationFrame',
      ],
    })
    region = document.createElement('div')
    region.id = 'srAnnouncer'
    region.setAttribute('aria-live', 'polite')
    document.body.appendChild(region)
    const theme = document.createElement('button')
    theme.id = 'themeToggle'
    document.body.appendChild(theme)
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('still says a key appeared when the button that completed the sequence speaks right after', async () => {
    const controller = await freshController()
    const written = []
    new MutationObserver(() => {
      if (region.textContent) written.push(region.textContent)
    }).observe(region, { childList: true, characterData: true, subtree: true })

    controller.handleUnlock()
    await vi.advanceTimersByTimeAsync(10)
    announce('Pan right')
    await vi.advanceTimersByTimeAsync(1200)

    expect(written).toContain('A key appeared next to the theme button.')
    expect(written.indexOf('A key appeared next to the theme button.')).toBeGreaterThan(
      written.indexOf('Pan right')
    )
  })
})

describe('the Alt View and pan adjust speak plainly', () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: [
        'setTimeout',
        'clearTimeout',
        'requestAnimationFrame',
        'cancelAnimationFrame',
      ],
    })
    localStorage.clear()
    document.documentElement.removeAttribute('data-ui-variant')
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    document.body.innerHTML = ''
    document.documentElement.removeAttribute('data-ui-variant')
  })

  it('puts the adjust button beside the projection button, leaving the Pan D-pad to View All', async () => {
    pageWithHeaderAndDpad()
    const controller = await freshController()
    controller.injectAltToggle()
    const adjust = document.getElementById('_hfmPanAdjust')
    expect(adjust.previousElementSibling?.id).toBe('projectionToggle')
    expect(adjust.closest('.camera-control-dpad')).toBeNull()
    expect(adjust.classList.contains('dpad-center')).toBe(false)
  })

  it('names the key and the adjust button by what they are for', async () => {
    pageWithHeaderAndDpad()
    const controller = await freshController()
    controller.injectAltToggle()
    const key = document.getElementById('_hfmToggle')
    expect(key.getAttribute('aria-label')).toBe('Alt View')
    expect(key.getAttribute('title')).toBe('Alt View')
    expect(
      document.getElementById('_hfmPanAdjust').getAttribute('aria-label')
    ).toBe('Adjust the Alt View with the pan arrows')
  })

  it('says one sentence when the Alt View turns on, and one when it turns off', async () => {
    const written = pageWithHeaderAndDpad()
    const controller = await freshController(previewManagerStub())
    controller.injectAltToggle()
    const key = document.getElementById('_hfmToggle')

    key.click()
    await vi.advanceTimersByTimeAsync(100)
    expect(document.documentElement.getAttribute('data-ui-variant')).toBe('mono')
    expect(written).toEqual([
      'Alt View on. The preview is drawn with characters and the interface follows.',
    ])

    key.click()
    await vi.advanceTimersByTimeAsync(100)
    expect(written.at(-1)).toBe('Alt View off.')
    expect(written).toHaveLength(2)
  })

  it('keeps one name for pan adjust, says one sentence per state, then each value plainly', async () => {
    const written = pageWithHeaderAndDpad()
    const controller = await freshController(previewManagerStub())
    controller.injectAltToggle()
    document.getElementById('_hfmToggle').click()
    await vi.advanceTimersByTimeAsync(100)
    written.length = 0

    const adjust = document.getElementById('_hfmPanAdjust')
    adjust.click()
    await vi.advanceTimersByTimeAsync(100)
    expect(adjust.getAttribute('aria-pressed')).toBe('true')
    expect(adjust.getAttribute('aria-label')).toBe(
      'Adjust the Alt View with the pan arrows'
    )
    expect(written).toEqual([
      'Pan arrows now adjust the Alt View: up and down for edges, left and right for size, Shift with up and down for glow.',
    ])

    expect(controller.onPanControl({ direction: 'up', shiftKey: false })).toBe(
      'Edges 105%'
    )
    expect(controller.onPanControl({ direction: 'left', shiftKey: false })).toBe(
      'Characters 55%'
    )
    // One step up from the 15% the glow starts at.
    expect(controller.onPanControl({ direction: 'up', shiftKey: true })).toBe(
      'Glow 20%'
    )

    adjust.click()
    await vi.advanceTimersByTimeAsync(100)
    expect(written.at(-1)).toBe('Pan arrows move the view again.')
  })
})

describe('where the browser has no 3D graphics', () => {
  const SENTENCE = 'Alt View needs 3D graphics, which this browser has turned off.'

  beforeEach(() => {
    vi.useFakeTimers({
      toFake: [
        'setTimeout',
        'clearTimeout',
        'requestAnimationFrame',
        'cancelAnimationFrame',
      ],
    })
    localStorage.clear()
    document.documentElement.removeAttribute('data-ui-variant')
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    document.body.innerHTML = ''
    document.documentElement.removeAttribute('data-ui-variant')
  })

  // A controller whose preview manager can arrive later, as a project opens;
  // that preview made no WebGL renderer, so the character renderer's start
  // fails reading it, as it does in a browser with WebGL switched off. The
  // failure is set after the module reset, on the copy the controller imports.
  async function controllerWithoutRenderer({ projectOpen }) {
    const pm = previewManagerStub()
    pm.renderer = null
    const holder = { manager: projectOpen ? pm : null }
    vi.resetModules()
    const { initHfmController } = await import('../../src/js/hfm-controller.js')
    const controller = initHfmController({
      getPreviewManager: () => holder.manager,
      getDisplayOptionsController: () => ({ refreshOverlays: vi.fn() }),
    })
    const { initAltView } = await import('../../src/js/_hfm.js')
    initAltView.mockImplementationOnce(async (manager) => {
      if (!manager.renderer) {
        throw new TypeError(
          "can't access property \"domElement\", renderer is null"
        )
      }
    })
    return { controller, openProject: () => (holder.manager = pm) }
  }

  it('the key says why once, stays off, and leaves the look as it was', async () => {
    const written = pageWithHeaderAndDpad()
    const { controller } = await controllerWithoutRenderer({ projectOpen: true })
    controller.injectAltToggle()
    const key = document.getElementById('_hfmToggle')

    key.click()
    await vi.advanceTimersByTimeAsync(100)

    expect(written).toEqual([SENTENCE])
    expect(document.getElementById('previewStatusAltAdjust').textContent).toBe(
      SENTENCE
    )
    expect(key.getAttribute('aria-pressed')).toBe('false')
    expect(document.documentElement.hasAttribute('data-ui-variant')).toBe(false)
    expect(controller.isEnabled()).toBe(false)
  })

  it('a look turned on before a project opens is undone, and says why', async () => {
    const written = pageWithHeaderAndDpad()
    const { controller, openProject } = await controllerWithoutRenderer({
      projectOpen: false,
    })
    controller.injectAltToggle()
    const key = document.getElementById('_hfmToggle')
    key.click()
    await vi.advanceTimersByTimeAsync(100)
    expect(document.documentElement.getAttribute('data-ui-variant')).toBe('mono')
    written.length = 0

    // A project opens where the browser draws no 3D picture, and the look
    // that was waiting for it is asked to start (as the file handler does).
    openProject()
    await controller.enableAltViewWithPreview(key).catch(() => {})
    await vi.advanceTimersByTimeAsync(100)

    expect(written).toEqual([SENTENCE])
    expect(key.getAttribute('aria-pressed')).toBe('false')
    expect(document.documentElement.hasAttribute('data-ui-variant')).toBe(false)
    expect(controller.isPendingEnable()).toBe(false)
  })
})
