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
import { STORAGE_KEY_SOUNDS, STORAGE_KEY_SOUND_KINDS_OFF } from '../../src/js/storage-keys.js'

vi.mock('../../src/js/crt-sounds.js', () => ({
  playCrtSound: vi.fn(async () => 1),
  stopCrtSound: vi.fn(),
  preloadCrtSounds: vi.fn(),
  playKeySound: vi.fn(async () => 0.16),
  preloadKeySounds: vi.fn(),
  playDialSound: vi.fn(async () => 0.12),
  preloadDialSounds: vi.fn(),
  setMuted: vi.fn(),
  duck: vi.fn(),
  playCameraSound: vi.fn(async () => 0.06),
  preloadCameraSounds: vi.fn(),
  playDrawerSound: vi.fn(async () => 0.45),
  preloadDrawerSounds: vi.fn(),
  playControlSound: vi.fn(async () => 0.08),
  preloadControlSounds: vi.fn(),
  playScrollSound: vi.fn(async () => 0.055),
  preloadScrollSounds: vi.fn(),
  playTypingSound: vi.fn(async () => 0.1),
}))

// The screen waits for its sound to start, which the mock settles on a tick.
const soundStarted = () => new Promise((resolve) => setTimeout(resolve, 0))

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
    setVectorLook: vi.fn(),
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
    // Fake timers: turning the Alt View on with no glow saved queues a
    // delayed save of the default glow, and a real one fired into the glow
    // cases' storage below when the machine was busy.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    localStorage.clear()
    document.documentElement.removeAttribute('data-ui-variant')
  })

  afterEach(() => {
    vi.useRealTimers()
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
    // Off again: a look left on keeps listening to the page in later cases.
    controller2.disableAltViewWithPreview(toggle)
  })

  it('on a phone starts at 45% when nothing is saved, and a saved size still wins', async () => {
    const width = Object.getOwnPropertyDescriptor(window, 'innerWidth')
    Object.defineProperty(window, 'innerWidth', { value: 412, configurable: true })
    try {
      const toggle = document.createElement('button')
      const controller = await freshController(previewManagerStub())
      await controller.enableAltViewWithPreview(toggle)
      expect((await lastAltView()).setFontScale).toHaveBeenLastCalledWith(0.45)
      controller.disableAltViewWithPreview(toggle)

      localStorage.setItem('openscad-forge-hfm-font-scale', '1.2')
      const controller2 = await freshController(previewManagerStub())
      await controller2.enableAltViewWithPreview(toggle)
      expect((await lastAltView()).setFontScale).toHaveBeenLastCalledWith(1.2)
      controller2.disableAltViewWithPreview(toggle)
    } finally {
      if (width) Object.defineProperty(window, 'innerWidth', width)
      else delete window.innerWidth
    }
  })

  it('under 40% draws the model as lines, 4 px wide at 35% and 1 px at 0%; Edges picks the creases, Surfaces the faces, Classic draws crisp; 40% is characters again', async () => {
    pageWithHeaderAndDpad()
    const toggle = document.createElement('button')
    const controller = await freshController(previewManagerStub())
    await controller.enableAltViewWithPreview(toggle)
    // Past the greeting the status line types first.
    await vi.advanceTimersByTimeAsync(3000)
    const altView = await lastAltView()
    const set = (id, value) => {
      const input = document.getElementById(id)
      input.value = String(value)
      input.dispatchEvent(new Event('input'))
    }
    const strip = document.getElementById('previewStatusAltAdjust')
    const size = document.getElementById('_hfmFontScale')

    set('_hfmFontScale', 0.35)
    expect(altView.setVectorLook).toHaveBeenLastCalledWith({
      widthPx: 4,
      surfaceOpacity: 0.01,
      creaseDeg: 15,
      crisp: false,
    })
    expect(size.getAttribute('aria-valuetext')).toBe('Vector lines, 35%')
    expect(strip.textContent).toContain('LINES 35%')
    expect(size.getAttribute('aria-label') ?? document.getElementById('_hfmFontScale-label')?.textContent, 'the slider is Focus').toContain('Focus')
    set('_hfmFontScale', 0)
    expect(altView.setVectorLook).toHaveBeenLastCalledWith(expect.objectContaining({ widthPx: 1 }))
    set('_hfmContrast', 0.7)
    expect(altView.setVectorLook, 'Soft').toHaveBeenLastCalledWith(expect.objectContaining({ creaseDeg: 30 }))
    set('_hfmContrast', 1.6)
    expect(altView.setVectorLook, 'Sharp').toHaveBeenLastCalledWith(expect.objectContaining({ creaseDeg: 5 }))
    set('_hfmSurfaces', 0.5)
    expect(altView.setVectorLook).toHaveBeenLastCalledWith(expect.objectContaining({ surfaceOpacity: 0.5 }))
    document.body.dataset.uiMode = 'classic'
    document.dispatchEvent(new CustomEvent('ui-mode-changed', { detail: { mode: 'classic' } }))
    expect(altView.setVectorLook, 'Classic').toHaveBeenLastCalledWith(expect.objectContaining({ crisp: true }))
    delete document.body.dataset.uiMode
    // Classic is a look of its own: its greeting types again.
    await vi.advanceTimersByTimeAsync(3000)

    set('_hfmFontScale', 0.4)
    expect(altView.setVectorLook).toHaveBeenLastCalledWith(null)
    expect(size.getAttribute('aria-valuetext')).toBe('40%')
    expect(strip.textContent).toContain('FOCUS 40%')
    controller.disableAltViewWithPreview(toggle)
  })

  it('under 40% the characters stay at 40%, so a look whose lines cannot load draws no smaller characters', async () => {
    pageWithHeaderAndDpad()
    const toggle = document.createElement('button')
    const controller = await freshController(previewManagerStub())
    await controller.enableAltViewWithPreview(toggle)
    const altView = await lastAltView()
    const set = (value) => {
      const input = document.getElementById('_hfmFontScale')
      input.value = String(value)
      input.dispatchEvent(new Event('input'))
    }

    set(0.35)
    expect(altView.setFontScale).toHaveBeenLastCalledWith(0.4)
    set(0)
    expect(altView.setFontScale).toHaveBeenLastCalledWith(0.4)
    set(0.45)
    expect(altView.setFontScale).toHaveBeenLastCalledWith(0.45)
    controller.disableAltViewWithPreview(toggle)
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
    controller2.disableAltViewWithPreview(toggle)
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
    controller.disableAltViewWithPreview(toggle)
  })
})

describe('the Alt View draws in every time', () => {
  let matchMedia

  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-ui-variant')
    document.documentElement.removeAttribute('data-alt-view-reveal')
    matchMedia = window.matchMedia
    window.matchMedia = vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  })

  afterEach(() => {
    window.matchMedia = matchMedia
    localStorage.clear()
    document.documentElement.removeAttribute('data-ui-variant')
    document.documentElement.removeAttribute('data-alt-view-reveal')
  })

  it('draws in on each switch-on and on a theme change while on, not once per page', async () => {
    pageWithHeaderAndDpad()
    const pm = previewManagerStub()
    const controller = await freshController(pm)
    const toggle = document.createElement('button')
    const root = document.documentElement

    await controller.enableAltViewWithPreview(toggle)
    await soundStarted()
    expect(root.hasAttribute('data-alt-view-reveal'), 'the first time').toBe(true)

    controller.disableAltViewWithPreview(toggle)
    expect(root.hasAttribute('data-alt-view-reveal'), 'ended on switch-off').toBe(false)

    await controller.enableAltViewWithPreview(toggle)
    await soundStarted()
    expect(root.hasAttribute('data-alt-view-reveal'), 'the second time').toBe(true)

    root.removeAttribute('data-alt-view-reveal')
    controller.onThemeChanged()
    await soundStarted()
    expect(root.hasAttribute('data-alt-view-reveal'), 'after a theme change').toBe(true)

    controller.disableAltViewWithPreview(toggle)
    controller.onThemeChanged()
    await soundStarted()
    expect(root.hasAttribute('data-alt-view-reveal'), 'not while off').toBe(false)
  })

  it('after the draw-in the picture powers on: the class on the character canvas, waiting for the reveal', async () => {
    pageWithHeaderAndDpad()
    const canvas = document.createElement('canvas')
    canvas.className = 'hfm-overlay-canvas'
    document.body.appendChild(canvas)
    const controller = await freshController(previewManagerStub())
    const toggle = document.createElement('button')
    await controller.enableAltViewWithPreview(toggle)
    await soundStarted()
    expect(canvas.classList.contains('alt-view-power-on'), 'the power-on class').toBe(true)
    expect(canvas.classList.contains('alt-view-power-on--after-reveal'), 'after the draw-in').toBe(true)
    controller.disableAltViewWithPreview(toggle)
    expect(canvas.classList.contains('alt-view-power-on'), 'ended on switch-off').toBe(false)
  })

  it('the sound first, then the screen: the draw-in waits for the sound to start', async () => {
    pageWithHeaderAndDpad()
    const controller = await freshController(previewManagerStub())
    const { playCrtSound } = await import('../../src/js/crt-sounds.js')
    const root = document.documentElement
    const toggle = document.createElement('button')

    let started
    playCrtSound.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          started = resolve
        })
    )
    await controller.enableAltViewWithPreview(toggle)
    expect(playCrtSound).toHaveBeenCalledWith('on')
    expect(root.hasAttribute('data-alt-view-reveal'), 'not before the sound').toBe(false)
    expect(
      document.getElementById('previewStatusAltAdjust').textContent,
      'the status line holds blank for the greeting'
    ).toBe('')
    started(2.21)
    await soundStarted()
    expect(root.hasAttribute('data-alt-view-reveal'), 'once the sound started').toBe(true)

    // Sounds off: nothing to wait for.
    controller.disableAltViewWithPreview(toggle)
    localStorage.setItem(STORAGE_KEY_SOUNDS, 'false')
    await controller.enableAltViewWithPreview(toggle)
    expect(root.hasAttribute('data-alt-view-reveal'), 'at once with sounds off').toBe(true)
    controller.disableAltViewWithPreview(toggle)
  })

  it('waits a quarter second at most: a sound that cannot start does not hold the screen', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      pageWithHeaderAndDpad()
      const controller = await freshController(previewManagerStub())
      const { playCrtSound } = await import('../../src/js/crt-sounds.js')
      const root = document.documentElement
      playCrtSound.mockImplementationOnce(() => new Promise(() => {}))
      const toggle = document.createElement('button')
      await controller.enableAltViewWithPreview(toggle)
      await vi.advanceTimersByTimeAsync(200)
      expect(root.hasAttribute('data-alt-view-reveal'), 'still waiting at 200 ms').toBe(false)
      await vi.advanceTimersByTimeAsync(60)
      expect(root.hasAttribute('data-alt-view-reveal'), 'begun by 260 ms').toBe(true)
      controller.disableAltViewWithPreview(toggle)
    } finally {
      vi.useRealTimers()
    }
  })

  it('fetches the sounds as soon as the key is there, with sounds on', async () => {
    pageWithHeaderAndDpad()
    const controller = await freshController(previewManagerStub())
    const { preloadCrtSounds } = await import('../../src/js/crt-sounds.js')
    controller.injectAltToggle()
    expect(document.getElementById('_hfmToggle'), 'the key').not.toBeNull()
    expect(preloadCrtSounds).toHaveBeenCalledTimes(1)

    document.getElementById('_hfmToggle').remove()
    localStorage.setItem(STORAGE_KEY_SOUNDS, 'false')
    controller.injectAltToggle()
    expect(preloadCrtSounds, 'not with sounds off').toHaveBeenCalledTimes(1)
  })
})

describe('the Alt View is heard', () => {
  let matchMedia
  let reducedMotion

  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-ui-variant')
    reducedMotion = false
    matchMedia = window.matchMedia
    window.matchMedia = vi.fn(() => ({
      matches: reducedMotion,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  })

  afterEach(() => {
    window.matchMedia = matchMedia
    localStorage.clear()
    document.documentElement.removeAttribute('data-ui-variant')
    document.documentElement.removeAttribute('data-alt-view-reveal')
  })

  // The sound module this controller got: the registry is reset per controller.
  const soundsAsked = async () => {
    const { playCrtSound } = await import('../../src/js/crt-sounds.js')
    return playCrtSound.mock.calls.map(([name]) => name)
  }

  it('switch-on is on, a look change is look, switch-off is off; nothing with sounds off', async () => {
    pageWithHeaderAndDpad()
    const pm = previewManagerStub()
    const controller = await freshController(pm)
    const toggle = document.createElement('button')

    await controller.enableAltViewWithPreview(toggle)
    expect(await soundsAsked()).toEqual(['on'])

    controller.onThemeChanged()
    expect(await soundsAsked()).toEqual(['on', 'look'])

    document.dispatchEvent(
      new CustomEvent('ui-mode-changed', { detail: { mode: 'classic' } })
    )
    expect(await soundsAsked(), 'Classic entered').toEqual(['on', 'look', 'look'])
    document.dispatchEvent(
      new CustomEvent('ui-mode-changed', { detail: { mode: 'simplified' } })
    )
    expect(await soundsAsked(), 'Classic left').toEqual(['on', 'look', 'look', 'look'])

    controller.disableAltViewWithPreview(toggle)
    expect(await soundsAsked()).toEqual(['on', 'look', 'look', 'look', 'off'])
    controller.onThemeChanged()
    expect(await soundsAsked(), 'nothing while off').toHaveLength(5)

    localStorage.setItem(STORAGE_KEY_SOUNDS, 'false')
    await controller.enableAltViewWithPreview(toggle)
    controller.onThemeChanged()
    controller.disableAltViewWithPreview(toggle)
    expect(await soundsAsked(), 'nothing with sounds off').toHaveLength(5)
  })

  // A button of the given size on the page, with the box the press reads.
  function sizedButton(id, width, height) {
    const button = document.createElement('button')
    button.id = id
    button.getBoundingClientRect = () => ({ width, height, left: 0, top: 0, right: width, bottom: height, x: 0, y: 0 })
    document.body.appendChild(button)
    return button
  }
  const press = (el, type, init = {}) =>
    el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...init }))
  const keysAsked = async () => {
    const { playKeySound } = await import('../../src/js/crt-sounds.js')
    return playKeySound.mock.calls.map((c) => c.join(' '))
  }

  it('while on, every button press is a key by its size: a press down, then up; not the look\'s own key', async () => {
    pageWithHeaderAndDpad()
    const icon = sizedButton('iconBtn', 36, 36)
    const menuItem = sizedButton('menuBtn', 240, 31)
    const key = sizedButton('_hfmToggle', 44, 44)
    const controller = await freshController(previewManagerStub())
    const { preloadKeySounds } = await import('../../src/js/crt-sounds.js')
    const toggle = document.createElement('button')

    press(icon, 'pointerdown')
    expect(await keysAsked(), 'nothing while the look is off').toEqual([])

    await controller.enableAltViewWithPreview(toggle)
    expect(preloadKeySounds, 'the phosphor keys fetched at switch-on').toHaveBeenCalledWith('p')
    press(icon, 'pointerdown')
    press(icon, 'pointerup')
    press(menuItem, 'pointerdown')
    press(menuItem, 'pointerup')
    press(key, 'pointerdown')
    press(key, 'pointerup')
    expect(await keysAsked()).toEqual(['p 2 down', 'p 2 up', 'p 6 down', 'p 6 up'])

    // The keyboard: Enter or Space on a focused button, no repeats.
    icon.focus()
    icon.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    icon.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', repeat: true, bubbles: true }))
    icon.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }))
    icon.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }))
    expect((await keysAsked()).slice(4)).toEqual(['p 2 down', 'p 2 up'])

    // Classic is the DOS look.
    document.body.dataset.uiMode = 'classic'
    press(icon, 'pointerdown')
    press(icon, 'pointerup')
    expect((await keysAsked()).slice(6)).toEqual(['d 2 down', 'd 2 up'])
    delete document.body.dataset.uiMode

    controller.disableAltViewWithPreview(toggle)
    press(icon, 'pointerdown')
    expect(await keysAsked(), 'nothing once off').toHaveLength(8)

    localStorage.setItem(STORAGE_KEY_SOUNDS, 'false')
    await controller.enableAltViewWithPreview(toggle)
    press(icon, 'pointerdown')
    expect(await keysAsked(), 'nothing with sounds off').toHaveLength(8)
    controller.disableAltViewWithPreview(toggle)
  })

  // A slider on the page, with the range a drag moves it over.
  function slider(id, min, max, step) {
    const input = document.createElement('input')
    input.type = 'range'
    input.id = id
    input.min = String(min)
    input.max = String(max)
    input.step = String(step)
    input.value = String(min)
    document.body.appendChild(input)
    return input
  }
  // The page's clock, which the drag's moves advance.
  let clock = 0
  // A drag or a key moves the slider to a value, some milliseconds on, and
  // the browser says input.
  const slide = (el, value, afterMs = 100) => {
    clock += afterMs
    el.value = String(value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }
  const clicksAsked = async () => {
    const { playDialSound } = await import('../../src/js/crt-sounds.js')
    return playDialSound.mock.calls.map(([set, tone]) => `${set} ${tone}`)
  }

  it('while on, a slider clicks as a dial does, one click file per slider by its steps, fifteen a second at most, until it is let go', async () => {
    pageWithHeaderAndDpad()
    clock = 0
    vi.spyOn(performance, 'now').mockImplementation(() => clock)
    const fine = slider('fine', 0, 3, 0.1)
    const coarse = slider('coarse', 1, 3, 0.5)
    const wide = slider('wide', -180, 180, 1)
    const controller = await freshController(previewManagerStub())
    const { preloadDialSounds } = await import('../../src/js/crt-sounds.js')
    const toggle = document.createElement('button')

    press(fine, 'pointerdown')
    slide(fine, 0.1)
    expect(await clicksAsked(), 'nothing while the look is off').toEqual([])

    await controller.enableAltViewWithPreview(toggle)
    expect(preloadDialSounds, 'the phosphor clicks fetched at switch-on').toHaveBeenCalledWith('p')
    // 30 steps of 0.1: the fourth tone; one click per step, the same file each time.
    press(fine, 'pointerdown')
    slide(fine, 0.2)
    slide(fine, 0.3)
    slide(fine, 0.3)
    expect(await clicksAsked(), 'a value that did not change is no click').toEqual(['p 4', 'p 4'])
    press(fine, 'pointerup')
    // Four steps of 0.5: the lowest tone.
    press(coarse, 'pointerdown')
    slide(coarse, 1.5)
    slide(coarse, 2)
    press(coarse, 'pointerup')
    expect((await clicksAsked()).slice(2)).toEqual(['p 1', 'p 1'])
    // 360 steps of 1: the highest tone; a jump across many steps is one click.
    press(wide, 'pointerdown')
    slide(wide, -170)
    press(wide, 'pointerup')
    expect((await clicksAsked()).slice(4)).toEqual(['p 7'])
    // The ceiling: a step sooner than 67 ms after the last click is passed
    // over, and the next one counts from the click that played.
    press(fine, 'pointerdown')
    slide(fine, 0.4)
    slide(fine, 0.5, 30)
    slide(fine, 0.6, 30)
    expect((await clicksAsked()).slice(5), 'two steps 30 ms apart: one click').toEqual(['p 4'])
    slide(fine, 0.7, 10)
    expect((await clicksAsked()).slice(5), '70 ms after the click that played: a click').toEqual(['p 4', 'p 4'])
    slide(fine, 0.8, 66)
    expect((await clicksAsked()).slice(5), '66 ms is too soon').toHaveLength(2)
    press(fine, 'pointerup')
    // The keyboard: an arrow moves a focused slider one step.
    fine.focus()
    fine.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    slide(fine, 0.9)
    expect((await clicksAsked()).slice(7)).toEqual(['p 4'])

    // Classic is the DOS look; its clicks are fetched when it is entered.
    document.body.dataset.uiMode = 'classic'
    document.dispatchEvent(new CustomEvent('ui-mode-changed', { detail: { mode: 'classic' } }))
    expect(preloadDialSounds).toHaveBeenCalledWith('d')
    press(coarse, 'pointerdown')
    slide(coarse, 2.5)
    press(coarse, 'pointerup')
    expect((await clicksAsked()).slice(8)).toEqual(['d 1'])
    delete document.body.dataset.uiMode

    controller.disableAltViewWithPreview(toggle)
    press(fine, 'pointerdown')
    slide(fine, 1)
    expect(await clicksAsked(), 'nothing once off').toHaveLength(9)

    localStorage.setItem(STORAGE_KEY_SOUNDS, 'false')
    await controller.enableAltViewWithPreview(toggle)
    press(fine, 'pointerdown')
    slide(fine, 1.1)
    expect(await clicksAsked(), 'nothing with sounds off').toHaveLength(9)
    controller.disableAltViewWithPreview(toggle)
  })

  it('the sounds button: just before the key; a press turns sounds off without a key and on with one, and the setting, the mute and Preferences follow', async () => {
    pageWithHeaderAndDpad()
    const controller = await freshController(previewManagerStub())
    const sounds = await import('../../src/js/crt-sounds.js')
    const { setSoundsOn } = await import('../../src/js/hfm-controller.js')
    controller.injectAltToggle()
    const button = document.getElementById('_hfmSounds')
    expect(button, 'made with the key').not.toBeNull()
    expect(document.getElementById('_hfmToggle').previousElementSibling, 'just before the key').toBe(button)
    expect(button.getAttribute('aria-label')).toBe('Sounds')
    expect(button.getAttribute('aria-pressed'), 'sounds start on').toBe('true')
    expect(button.classList.contains('alt-view-toggle'), "the key's look").toBe(true)
    expect(button.querySelector('svg').getAttribute('aria-hidden')).toBe('true')

    const said = []
    const listen = (event) => said.push(event.detail.on)
    document.addEventListener('sounds-setting-change', listen)
    const toggle = document.createElement('button')
    await controller.enableAltViewWithPreview(toggle)

    press(button, 'pointerdown')
    press(button, 'pointerup')
    button.click()
    expect(button.getAttribute('aria-pressed')).toBe('false')
    expect(localStorage.getItem(STORAGE_KEY_SOUNDS)).toBe('false')
    expect(sounds.setMuted).toHaveBeenLastCalledWith(true)
    expect(await keysAsked(), 'no key for the press that turns sounds off').toEqual([])

    press(button, 'pointerdown')
    press(button, 'pointerup')
    button.click()
    expect(button.getAttribute('aria-pressed')).toBe('true')
    expect(localStorage.getItem(STORAGE_KEY_SOUNDS)).toBe('true')
    expect(sounds.setMuted).toHaveBeenLastCalledWith(false)
    const keys = await keysAsked()
    expect(keys, 'one key for the press that turns them on').toHaveLength(1)
    expect(keys[0]).toMatch(/^p \d down$/)

    // Preferences' checkbox goes through the same door.
    setSoundsOn(false)
    expect(button.getAttribute('aria-pressed')).toBe('false')
    expect(said).toEqual([false, true, false])
    document.removeEventListener('sounds-setting-change', listen)
    controller.disableAltViewWithPreview(toggle)
  })

  // The view's camera, placed around the model by its turn and tilt in
  // degrees and its distance; the orbit controls tell of a drag's start,
  // each change and its end.
  function viewWithControls(pm) {
    const camera = new PerspectiveCamera()
    const target = new Vector3(0, 0, 0)
    const listeners = {}
    const controls = {
      target,
      addEventListener: vi.fn((type, fn) => {
        ;(listeners[type] ??= new Set()).add(fn)
      }),
      removeEventListener: vi.fn((type, fn) => listeners[type]?.delete(fn)),
      fire: (type) => [...(listeners[type] ?? [])].forEach((fn) => fn({ type })),
      listening: (type) => listeners[type]?.size ?? 0,
    }
    const canvas = document.createElement('canvas')
    document.body.appendChild(canvas)
    Object.assign(pm, {
      controls,
      renderer: { domElement: canvas },
      projectionMode: 'perspective',
      getActiveCamera: () => camera,
    })
    const place = (turn, tilt, distance = 100) => {
      const t = (turn * Math.PI) / 180
      const e = (tilt * Math.PI) / 180
      camera.position.set(
        distance * Math.cos(e) * Math.cos(t),
        distance * Math.cos(e) * Math.sin(t),
        distance * Math.sin(e)
      )
      controls.fire('change')
    }
    return { controls, canvas, place }
  }
  const cameraAsked = async () => {
    const { playCameraSound } = await import('../../src/js/crt-sounds.js')
    return playCameraSound.mock.calls.map(([kind]) => kind)
  }
  // Each tick's way: left -1, right 1, none 0.
  const cameraWays = async () => {
    const { playCameraSound } = await import('../../src/js/crt-sounds.js')
    return playCameraSound.mock.calls.map(([, how]) => how?.way ?? 0)
  }

  it('the 3D view ticks for a direct move: a bearing per 15 degrees turned, a ratchet per 10 tilted, a lens detent per 5 % zoomed', async () => {
    pageWithHeaderAndDpad()
    clock = 0
    vi.spyOn(performance, 'now').mockImplementation(() => clock)
    const pm = previewManagerStub()
    const { controls, place } = viewWithControls(pm)
    const controller = await freshController(pm)
    const { preloadCameraSounds } = await import('../../src/js/crt-sounds.js')
    const toggle = document.createElement('button')
    place(0, 20)

    controls.fire('start')
    for (let turn = 1; turn <= 10; turn++) place(turn, 20)
    controls.fire('end')
    expect(await cameraAsked(), 'nothing while the look is off').toEqual([])

    await controller.enableAltViewWithPreview(toggle)
    expect(preloadCameraSounds, 'the camera ticks fetched at switch-on').toHaveBeenCalled()
    place(0, 20)
    // A drag of 45 degrees, a degree a frame: three bearing ticks.
    controls.fire('start')
    for (let turn = 1; turn <= 45; turn++) {
      clock += 20
      place(turn, 20)
    }
    controls.fire('end')
    expect(await cameraAsked()).toEqual(['turn', 'turn', 'turn'])
    // Turned left (the angle growing, as Rotate left turns it): left's tick.
    expect(await cameraWays()).toEqual([-1, -1, -1])

    // A tilt of 20 degrees: two ratchet ticks; the damping's glide after the
    // drag ends still counts.
    controls.fire('start')
    for (let tilt = 21; tilt <= 35; tilt++) {
      clock += 20
      place(45, tilt)
    }
    controls.fire('end')
    for (let tilt = 36; tilt <= 40; tilt++) {
      clock += 20
      place(45, tilt)
    }
    expect((await cameraAsked()).slice(3)).toEqual(['tilt', 'tilt'])
    expect((await cameraWays()).slice(3), 'tilted up: up\'s tick').toEqual([1, 1])

    // The wheel: three notches of 5 % closer, each a lens detent.
    for (const distance of [95, 90.25, 85.7]) {
      clock += 100
      controls.fire('start')
      place(45, 40, distance)
      controls.fire('end')
    }
    expect((await cameraAsked()).slice(5)).toEqual(['zoom', 'zoom', 'zoom'])
    expect((await cameraWays()).slice(5), 'zoomed in: in\'s tick').toEqual([1, 1, 1])

    // A jitter back and forth of under a step says nothing.
    controls.fire('start')
    for (const turn of [44, 46, 44, 46, 45]) {
      clock += 100
      place(turn, 40, 85.7)
    }
    controls.fire('end')
    expect(await cameraAsked(), 'a jitter').toHaveLength(8)
    controller.disableAltViewWithPreview(toggle)
    expect(controls.listening('change'), 'let go once off').toBe(0)
  })

  it('the 3D view ticks fourteen times a second at most, however fast it turns', async () => {
    pageWithHeaderAndDpad()
    clock = 0
    vi.spyOn(performance, 'now').mockImplementation(() => clock)
    const pm = previewManagerStub()
    const { controls, place } = viewWithControls(pm)
    const controller = await freshController(pm)
    await controller.enableAltViewWithPreview(document.createElement('button'))
    place(0, 20)
    controls.fire('start')
    // Twenty steps of 15 degrees in one second: twenty ticks asked.
    for (let n = 1; n <= 20; n++) {
      clock += 50
      place(n * 15, 20)
    }
    controls.fire('end')
    const ticks = await cameraAsked()
    expect(ticks.length).toBeGreaterThan(0)
    expect(ticks.length).toBeLessThanOrEqual(14)
    controller.disableAltViewWithPreview(document.createElement('button'))
  })

  it('a move a pan button, a view or View All made plays no camera tick; the arrow keys on the preview and a controller stick do', async () => {
    pageWithHeaderAndDpad()
    clock = 0
    vi.spyOn(performance, 'now').mockImplementation(() => clock)
    const pm = previewManagerStub()
    const { place } = viewWithControls(pm)
    const container = document.createElement('div')
    container.tabIndex = 0
    document.body.appendChild(container)
    pm.container = container
    const pan = document.getElementById('cameraPanUp')
    const controller = await freshController(pm)
    await controller.enableAltViewWithPreview(document.createElement('button'))
    place(0, 20)

    // A pan button pressed: its move is the button's, heard as its key.
    clock += 100
    press(pan, 'pointerdown')
    place(45, 20)
    press(pan, 'pointerup')
    pan.click()
    clock += 100
    place(90, 20)
    // A view chosen from a menu or a shortcut: no drag, no tick.
    clock += 100
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '4', ctrlKey: true, bubbles: true }))
    place(180, -30)
    expect(await cameraAsked(), 'buttons, views and View All').toEqual([])

    // The arrow keys on the focused preview turn it directly.
    container.focus()
    for (let n = 1; n <= 3; n++) {
      clock += 100
      container.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
      place(180 + n * 15, -30)
    }
    expect(await cameraAsked(), 'the arrow keys').toEqual(['turn', 'turn', 'turn'])

    // A controller's stick pushed past its dead zone turns it directly too.
    const hadGamepads = navigator.getGamepads
    navigator.getGamepads = () => [
      { axes: [0, 0, 0.8, 0], buttons: [] },
    ]
    try {
      clock += 1000
      document.body.focus()
      document.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
      clock += 100
      place(240, -30)
      expect((await cameraAsked()).slice(3), 'a stick').toEqual(['turn'])
    } finally {
      navigator.getGamepads = hadGamepads
    }

    // Sounds off: nothing at all.
    localStorage.setItem(STORAGE_KEY_SOUNDS, 'false')
    container.focus()
    clock += 100
    container.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    place(300, -30)
    expect(await cameraAsked(), 'sounds off').toHaveLength(4)
    controller.disableAltViewWithPreview(document.createElement('button'))
  })

  it("the camera's rotate and zoom buttons play the view's tick for their move, not a key: a turn, a tilt, a zoom, wherever they sit", async () => {
    pageWithHeaderAndDpad()
    clock = 0
    vi.spyOn(performance, 'now').mockImplementation(() => clock)
    const pm = previewManagerStub()
    viewWithControls(pm)
    const buttons = [
      ['cameraRotateLeft', 'turn'],
      ['cameraRotateRight', 'turn'],
      ['mobileCameraRotateLeft', 'turn'],
      ['mobileCameraRotateRight', 'turn'],
      ['cameraRotateUp', 'tilt'],
      ['cameraRotateDown', 'tilt'],
      ['mobileCameraRotateUp', 'tilt'],
      ['mobileCameraRotateDown', 'tilt'],
      ['cameraZoomIn', 'zoom'],
      ['cameraZoomOut', 'zoom'],
      ['mobileCameraZoomIn', 'zoom'],
      ['mobileCameraZoomOut', 'zoom'],
      ['classicZoomInBtn', 'zoom'],
      ['classicZoomOutBtn', 'zoom'],
    ].map(([id, kind]) => ({ el: sizedButton(id, 36, 36), kind }))
    const left = buttons[0].el
    const hadPads = navigator.getGamepads
    let held = false
    navigator.getGamepads = () => [{ axes: [0, 0, 0, 0], buttons: [{ pressed: held, value: held ? 1 : 0 }] }]
    const controller = await freshController(pm)
    const toggle = document.createElement('button')

    press(left, 'pointerdown')
    press(left, 'pointerup')
    left.click()
    expect(await cameraAsked(), 'nothing while the look is off').toEqual([])

    await controller.enableAltViewWithPreview(toggle)
    // A pointer's press and release, then the click that moves the view.
    for (const { el } of buttons) {
      clock += 100
      press(el, 'pointerdown')
      press(el, 'pointerup')
      el.click()
    }
    expect(await cameraAsked()).toEqual(buttons.map(({ kind }) => kind))
    expect(await cameraWays(), 'left, down and out lower; right, up and in higher').toEqual([
      -1, 1, -1, 1, 1, -1, 1, -1, 1, -1, 1, -1, 1, -1,
    ])
    expect(await keysAsked(), 'no key for any of them').toEqual([])

    // Enter on the focused button: its keydown, the click it makes, its keyup.
    left.focus()
    clock += 100
    left.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    left.click()
    left.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }))
    expect((await cameraAsked()).slice(14), 'Enter').toEqual(['turn'])

    // The page's own click stays quiet; a controller's A button is a press.
    clock += 100
    left.click()
    expect(await cameraAsked(), "the page's own click").toHaveLength(15)
    held = true
    clock += 100
    left.click()
    held = false
    expect((await cameraAsked()).slice(15), 'a controller').toEqual(['turn'])

    // Pressed and let go off the button: no click, so no move and no tick.
    clock += 100
    press(left, 'pointerdown')
    press(document.body, 'pointerup')
    expect(await cameraAsked(), 'let go elsewhere').toHaveLength(16)

    // Two presses closer than a tick allows: the second is passed over.
    clock += 100
    for (let n = 0; n < 2; n++) {
      clock += 30
      press(left, 'pointerdown')
      press(left, 'pointerup')
      left.click()
    }
    expect((await cameraAsked()).slice(16), 'fourteen a second at most').toEqual(['turn'])

    // Sounds off: nothing at all.
    localStorage.setItem(STORAGE_KEY_SOUNDS, 'false')
    clock += 100
    press(left, 'pointerdown')
    press(left, 'pointerup')
    left.click()
    expect(await cameraAsked(), 'sounds off').toHaveLength(17)
    expect(await keysAsked(), 'still no key').toEqual([])
    navigator.getGamepads = hadPads
    controller.disableAltViewWithPreview(toggle)
  })

  it('a list scrolled by hand ticks a line at a time, down lower and up higher, fourteen a second at most, and its end once; a scroll the page makes is silent', async () => {
    pageWithHeaderAndDpad()
    clock = 0
    vi.spyOn(performance, 'now').mockImplementation(() => clock)
    const list = document.createElement('div')
    let top = 0
    Object.defineProperty(list, 'scrollTop', { get: () => top, configurable: true })
    Object.defineProperty(list, 'scrollHeight', { value: 1000, configurable: true })
    Object.defineProperty(list, 'clientHeight', { value: 400, configurable: true })
    document.body.appendChild(list)
    const scrollTo = (y) => {
      top = y
      list.dispatchEvent(new Event('scroll'))
    }
    const wheel = (deltaY) =>
      list.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY }))
    const scrollsAsked = async () => {
      const { playScrollSound } = await import('../../src/js/crt-sounds.js')
      return playScrollSound.mock.calls.map(([how]) => (how.end ? 'end' : how.way))
    }
    const controller = await freshController(previewManagerStub())
    const { preloadScrollSounds } = await import('../../src/js/crt-sounds.js')
    const toggle = document.createElement('button')

    wheel(100)
    scrollTo(100)
    expect(await scrollsAsked(), 'nothing while the look is off').toEqual([])

    await controller.enableAltViewWithPreview(toggle)
    expect(preloadScrollSounds, 'the platen fetched at switch-on').toHaveBeenCalled()
    // The page's own scroll (a field brought into view): silent.
    clock += 2000
    scrollTo(150)
    expect(await scrollsAsked(), "the page's own scroll").toEqual([])

    // The wheel: a tick for every 40 px line, going down a little lower.
    wheel(100)
    for (const y of [190, 230, 270]) {
      clock += 100
      scrollTo(y)
    }
    expect(await scrollsAsked()).toEqual([-1, -1, -1])

    // A fast fling: a line a tick at most every 70 ms; the rest passed over.
    clock += 100
    for (const y of [310, 350, 390, 430]) {
      clock += 20
      scrollTo(y)
    }
    expect(await scrollsAsked(), 'fourteen a second at most').toHaveLength(4)

    // On to the end: its line, then the end of the list, once.
    clock += 100
    scrollTo(600)
    clock += 100
    scrollTo(600)
    expect((await scrollsAsked()).slice(4)).toEqual([-1, 'end'])

    // Back up a line, a little higher; the end is behind it.
    wheel(-100)
    clock += 100
    scrollTo(550)
    expect((await scrollsAsked()).slice(6)).toEqual([1])

    // Sounds off: nothing.
    localStorage.setItem(STORAGE_KEY_SOUNDS, 'false')
    wheel(-100)
    clock += 100
    scrollTo(450)
    expect(await scrollsAsked(), 'sounds off').toHaveLength(7)
    controller.disableAltViewWithPreview(toggle)
  })

  it('a kind of sound turned off in Preferences stays silent while the rest play; the choice is kept, read at start, and told to the page', async () => {
    pageWithHeaderAndDpad()
    clock = 0
    vi.spyOn(performance, 'now').mockImplementation(() => clock)
    const button = sizedButton('plainBtn', 36, 36)
    const slider = document.createElement('input')
    slider.type = 'range'
    slider.min = '0'
    slider.max = '10'
    slider.step = '1'
    slider.value = '0'
    const box = document.createElement('input')
    box.type = 'checkbox'
    document.body.append(slider, box)
    const controller = await freshController(previewManagerStub())
    const { setSoundKindOff, soundKindsOff } = await import('../../src/js/hfm-controller.js')
    const told = []
    const listen = (event) => told.push([...event.detail.off])
    document.addEventListener('sound-kinds-change', listen)
    const toggle = document.createElement('button')
    await controller.enableAltViewWithPreview(toggle)
    const step = (value) => {
      slider.value = String(value)
      slider.dispatchEvent(new Event('input', { bubbles: true }))
    }

    expect(soundKindsOff(), 'everything on to begin with').toEqual([])
    setSoundKindOff('dials', true)
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY_SOUND_KINDS_OFF))).toEqual(['dials'])
    expect(told).toEqual([['dials']])
    clock += 100
    step(1)
    clock += 100
    step(2)
    expect(await dialsAsked(), 'the slider is silent').toEqual([])
    press(button, 'pointerdown')
    press(button, 'pointerup')
    expect(await keysAsked(), 'a key still plays').toEqual(['p 2 down', 'p 2 up'])
    box.click()
    expect(await controlsAsked(), 'a switch still flips').toEqual(['lever-on'])

    setSoundKindOff('switches', true)
    setSoundKindOff('dials', false)
    expect(soundKindsOff()).toEqual(['switches'])
    expect(told.at(-1)).toEqual(['switches'])
    box.click()
    expect(await controlsAsked(), 'the switch is silent now').toEqual(['lever-on'])
    clock += 100
    step(3)
    expect(await dialsAsked(), 'the slider clicks again').toEqual(['p 2'])
    expect(() => setSoundKindOff('music', true)).toThrow('No such kind of sound: music')
    document.removeEventListener('sound-kinds-change', listen)
    controller.disableAltViewWithPreview(toggle)

    // Read at start: a choice kept from before, and a bad value ignored.
    localStorage.setItem(STORAGE_KEY_SOUND_KINDS_OFF, JSON.stringify(['keys', 'nonsense']))
    const again = await freshController(previewManagerStub())
    const fresh = await import('../../src/js/hfm-controller.js')
    expect(fresh.soundKindsOff(), 'known kinds only').toEqual(['keys'])
    await again.enableAltViewWithPreview(toggle)
    // The sound mock outlives the module reset: count from here.
    const { playKeySound } = await import('../../src/js/crt-sounds.js')
    playKeySound.mockClear()
    press(button, 'pointerdown')
    press(button, 'pointerup')
    expect(await keysAsked(), 'keys off from the start').toEqual([])
    again.disableAltViewWithPreview(toggle)
  })

  it('a page that starts with sounds off starts muted', async () => {
    localStorage.setItem(STORAGE_KEY_SOUNDS, 'false')
    pageWithHeaderAndDpad()
    await freshController(previewManagerStub())
    const { setMuted } = await import('../../src/js/crt-sounds.js')
    expect(setMuted).toHaveBeenCalledWith(true)
  })

  it('plays with reduced motion too: sound is not motion', async () => {
    reducedMotion = true
    pageWithHeaderAndDpad()
    const pm = previewManagerStub()
    const controller = await freshController(pm)
    const toggle = document.createElement('button')
    await controller.enableAltViewWithPreview(toggle)
    expect(document.documentElement.hasAttribute('data-alt-view-reveal'), 'no draw-in').toBe(
      false
    )
    expect(await soundsAsked()).toEqual(['on'])
    controller.disableAltViewWithPreview(toggle)
  })

  // A drawer's panel, sized as a drawer that has somewhere to go.
  function drawerPanel(width = 300, height = 400) {
    const el = document.createElement('div')
    Object.defineProperty(el, 'offsetWidth', { value: width })
    Object.defineProperty(el, 'offsetHeight', { value: height })
    document.body.appendChild(el)
    return el
  }
  const drawersAsked = async () => {
    const { playDrawerSound } = await import('../../src/js/crt-sounds.js')
    return playDrawerSound.mock.calls.map(([name, phase, how]) => `${name} ${phase} ${how.stopAt} ${how.whole}`)
  }
  const dialsAsked = async () => {
    const { playDialSound } = await import('../../src/js/crt-sounds.js')
    return playDialSound.mock.calls.map((c) => c.join(' '))
  }
  const controlsAsked = async () => {
    const { playControlSound } = await import('../../src/js/crt-sounds.js')
    return playControlSound.mock.calls.map(([kind]) => kind)
  }
  const typingAsked = async () => {
    const { playTypingSound } = await import('../../src/js/crt-sounds.js')
    return playTypingSound.mock.calls.map(([set]) => set)
  }

  it('a drawer opening plays the opening once and closing the closing, with when it meets its stop, without motion too; not one laid out at once', async () => {
    pageWithHeaderAndDpad()
    const panel = drawerPanel()
    const controller = await freshController(previewManagerStub())
    const { slideDrawer } = await import('../../src/js/drawer-motion.js')
    const { preloadDrawerSounds } = await import('../../src/js/crt-sounds.js')
    const toggle = document.createElement('button')
    // No pace here, as with reduced motion: the drawers change at once.
    const move = (name, open, how = {}) =>
      slideDrawer([{ el: panel }], { from: 'left', open, name, ...how })

    move('customizer', true)
    expect(await drawersAsked(), 'nothing while the look is off').toEqual([])

    await controller.enableAltViewWithPreview(toggle)
    expect(preloadDrawerSounds, 'the drawer fetched at switch-on').toHaveBeenCalled()
    move('customizer', true)
    move('customizer', false)
    move('preview-settings', true)
    move('phone-ascii', true)
    move('phone-camera', false)
    expect(await drawersAsked()).toEqual([
      'customizer open 0 true',
      'customizer close 0 true',
      'preview-settings open 0 true',
      'phone-ascii open 0 true',
      'phone-camera close 0 true',
    ])
    move('camera', true, { instant: true })
    slideDrawer([{ el: panel }], { from: 'left', open: true })
    expect(await drawersAsked(), 'laid out at once, or a room with no name').toHaveLength(5)

    // Classic's drawers are the same drawer.
    document.body.dataset.uiMode = 'classic'
    move('classic-console', true)
    move('classic-editor', false)
    move('classic-right-top', true)
    expect((await drawersAsked()).slice(5)).toEqual([
      'classic-console open 0 true',
      'classic-editor close 0 true',
      'classic-right-top open 0 true',
    ])
    delete document.body.dataset.uiMode

    controller.disableAltViewWithPreview(toggle)
    move('customizer', true)
    expect(await drawersAsked(), 'nothing once off').toHaveLength(8)

    localStorage.setItem(STORAGE_KEY_SOUNDS, 'false')
    await controller.enableAltViewWithPreview(toggle)
    move('customizer', false)
    expect(await drawersAsked(), 'nothing with sounds off').toHaveLength(8)
    controller.disableAltViewWithPreview(toggle)
  })

  it("a drawer's own buttons play no key: the drawer they move is the sound", async () => {
    pageWithHeaderAndDpad()
    const ids = [
      'collapseParamPanelBtn',
      'cameraPanelToggle',
      'previewDrawerToggle',
      'mobileDrawerToggle',
      'drawerCloseBtn',
      'cameraDrawerToggle',
      'asciiDrawerToggle',
      'classicEditorCloseBtn',
      'classicCustomizerCloseBtn',
    ]
    const buttons = ids.map((id) => sizedButton(id, 36, 36))
    const stow = sizedButton('stowLeft', 24, 24)
    stow.className = 'btn classic-pane-btn classic-stow-btn'
    const other = sizedButton('otherBtn', 36, 36)
    const controller = await freshController(previewManagerStub())
    const toggle = document.createElement('button')
    await controller.enableAltViewWithPreview(toggle)
    for (const el of [...buttons, stow, other]) {
      press(el, 'pointerdown')
      press(el, 'pointerup')
      el.click()
    }
    const enter = buttons[0]
    enter.focus()
    enter.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    enter.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }))
    expect(await keysAsked(), 'only the other button').toEqual(['p 2 down', 'p 2 up'])
    controller.disableAltViewWithPreview(toggle)
  })

  it('a checkbox and a switch flip a lever, up for on and down for off; a radio button snaps on; never a key', async () => {
    pageWithHeaderAndDpad()
    const box = document.createElement('input')
    box.type = 'checkbox'
    const radioA = document.createElement('input')
    radioA.type = 'radio'
    radioA.name = 'pick'
    const radioB = radioA.cloneNode()
    const paramSwitch = document.createElement('input')
    paramSwitch.type = 'checkbox'
    paramSwitch.setAttribute('role', 'switch')
    document.body.append(box, radioA, radioB, paramSwitch)
    const modeSwitch = sizedButton('modeSwitch', 120, 36)
    modeSwitch.setAttribute('role', 'switch')
    modeSwitch.setAttribute('aria-checked', 'false')
    const controller = await freshController(previewManagerStub())
    const { preloadControlSounds } = await import('../../src/js/crt-sounds.js')
    const toggle = document.createElement('button')

    box.click()
    expect(await controlsAsked(), 'nothing while the look is off').toEqual([])

    await controller.enableAltViewWithPreview(toggle)
    expect(preloadControlSounds).toHaveBeenCalled()
    box.click()
    box.click()
    radioA.click()
    radioB.click()
    radioB.click()
    press(paramSwitch, 'pointerdown')
    press(paramSwitch, 'pointerup')
    paramSwitch.click()
    expect(await controlsAsked()).toEqual([
      // the box was checked once while the look was off
      'lever-off',
      'lever-on',
      'snap-on',
      'snap-on',
      'lever-on',
    ])
    press(modeSwitch, 'pointerdown')
    press(modeSwitch, 'pointerup')
    modeSwitch.click()
    modeSwitch.setAttribute('aria-checked', 'true')
    modeSwitch.click()
    expect((await controlsAsked()).slice(5), 'by the state it leaves').toEqual([
      'lever-on',
      'lever-off',
    ])
    expect(await keysAsked(), 'a switch is never a key').toEqual([])
    controller.disableAltViewWithPreview(toggle)
  })

  it('a list clicks as it opens and again as a choice is made; a color well the same', async () => {
    pageWithHeaderAndDpad()
    const list = document.createElement('select')
    list.innerHTML = '<option>a</option><option>b</option>'
    const many = document.createElement('select')
    many.multiple = true
    many.innerHTML = '<option>a</option><option>b</option>'
    const well = document.createElement('input')
    well.type = 'color'
    document.body.append(list, many, well)
    const controller = await freshController(previewManagerStub())
    const toggle = document.createElement('button')
    const choose = (el) => el.dispatchEvent(new Event('change', { bubbles: true }))

    await controller.enableAltViewWithPreview(toggle)
    press(list, 'pointerdown')
    list.value = 'b'
    choose(list)
    list.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true }))
    list.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    choose(list)
    expect(await controlsAsked(), 'an arrow alone chooses without opening').toEqual([
      'select-open',
      'select-choose',
      'select-open',
      'select-choose',
    ])
    press(many, 'pointerdown')
    choose(many)
    press(well, 'pointerdown')
    choose(well)
    expect((await controlsAsked()).slice(4), 'a list always open does not open').toEqual([
      'select-choose',
      'select-open',
      'select-choose',
    ])
    controller.disableAltViewWithPreview(toggle)
  })

  it('typing into a field is a quiet key per keystroke, fifteen a second at most; not a shortcut or a move', async () => {
    pageWithHeaderAndDpad()
    clock = 0
    vi.spyOn(performance, 'now').mockImplementation(() => clock)
    const field = document.createElement('input')
    field.type = 'text'
    const notes = document.createElement('textarea')
    const fixed = document.createElement('input')
    fixed.readOnly = true
    const button = sizedButton('plainBtn', 36, 36)
    document.body.append(field, notes, fixed)
    const controller = await freshController(previewManagerStub())
    const toggle = document.createElement('button')
    const type = (el, key, init = {}, afterMs = 100) => {
      clock += afterMs
      el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }))
    }

    type(field, 'a')
    expect(await typingAsked(), 'nothing while the look is off').toEqual([])

    await controller.enableAltViewWithPreview(toggle)
    type(field, 'a')
    type(field, 'Backspace')
    type(notes, 'Enter')
    type(field, 'Shift')
    type(field, 's', { ctrlKey: true })
    type(field, 'Tab')
    type(field, 'ArrowLeft')
    type(fixed, 'a')
    type(button, 'a')
    expect(await typingAsked(), 'three keystrokes that type').toEqual(['p', 'p', 'p'])

    // Thirty keystrokes in a second: at most fifteen keys.
    const before = (await typingAsked()).length
    for (let n = 0; n < 30; n++) type(field, 'x', {}, 1000 / 30)
    const heard = (await typingAsked()).length - before
    expect(heard).toBeLessThanOrEqual(15)
    expect(heard).toBeGreaterThanOrEqual(10)

    document.body.dataset.uiMode = 'classic'
    type(field, 'a', {}, 500)
    expect((await typingAsked()).at(-1), "the DOS look's smallest key").toBe('d')
    delete document.body.dataset.uiMode
    controller.disableAltViewWithPreview(toggle)
  })

  it("a number box's arrows click as a dial does; a number typed into it is typing", async () => {
    pageWithHeaderAndDpad()
    clock = 0
    vi.spyOn(performance, 'now').mockImplementation(() => clock)
    const box = document.createElement('input')
    box.type = 'number'
    box.min = '0'
    box.max = '10'
    box.step = '1'
    box.value = '0'
    document.body.append(box)
    const controller = await freshController(previewManagerStub())
    const toggle = document.createElement('button')

    await controller.enableAltViewWithPreview(toggle)
    box.focus()
    clock += 100
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    slide(box, 1)
    expect(await clicksAsked(), 'ten steps: the second tone').toEqual(['p 2'])
    clock += 100
    box.dispatchEvent(new KeyboardEvent('keydown', { key: '5', bubbles: true }))
    slide(box, 15, 5)
    expect(await clicksAsked(), 'typed, not stepped').toHaveLength(1)
    expect(await typingAsked()).toEqual(['p'])
    controller.disableAltViewWithPreview(toggle)
  })

  it('a menu or a dialog opening and closing is a latch; a pop-out list the same', async () => {
    pageWithHeaderAndDpad()
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    dialog.setAttribute('aria-hidden', 'true')
    const menu = document.createElement('div')
    menu.className = 'toolbar-menu-modal'
    menu.setAttribute('aria-hidden', 'true')
    const popout = document.createElement('div')
    popout.className = 'camera-shortcuts-panel'
    popout.hidden = true
    const other = document.createElement('div')
    other.setAttribute('aria-hidden', 'true')
    document.body.append(dialog, menu, popout, other)
    const controller = await freshController(previewManagerStub())
    const toggle = document.createElement('button')
    const settled = () => new Promise((resolve) => setTimeout(resolve, 0))

    dialog.setAttribute('aria-hidden', 'false')
    await settled()
    expect(await controlsAsked(), 'nothing while the look is off').toEqual([])
    dialog.setAttribute('aria-hidden', 'true')

    await controller.enableAltViewWithPreview(toggle)
    dialog.setAttribute('aria-hidden', 'false')
    await settled()
    dialog.setAttribute('aria-hidden', 'true')
    await settled()
    menu.setAttribute('aria-hidden', 'false')
    await settled()
    menu.setAttribute('aria-hidden', 'true')
    popout.hidden = false
    other.setAttribute('aria-hidden', 'false')
    await settled()
    popout.hidden = true
    await settled()
    expect(await controlsAsked()).toEqual([
      'latch-open',
      'latch-close',
      'latch-open',
      'latch-close',
      'latch-open',
      'latch-close',
    ])

    // A dialog made, then shown, then taken away.
    const made = document.createElement('div')
    made.setAttribute('role', 'dialog')
    document.body.append(made)
    made.setAttribute('aria-hidden', 'false')
    await settled()
    made.setAttribute('aria-hidden', 'true')
    made.remove()
    await settled()
    expect((await controlsAsked()).slice(6)).toEqual(['latch-open', 'latch-close'])

    controller.disableAltViewWithPreview(toggle)
    dialog.setAttribute('aria-hidden', 'false')
    await settled()
    expect(await controlsAsked(), 'nothing once off').toHaveLength(8)
  })

  it("a disclosure and a link are keys; a press with no key of its own first plays one when a controller's button is held", async () => {
    pageWithHeaderAndDpad()
    const details = document.createElement('details')
    details.innerHTML = '<summary>Group</summary><p>x</p>'
    const summary = details.querySelector('summary')
    summary.getBoundingClientRect = () => ({ width: 200, height: 30, left: 0, top: 0, right: 200, bottom: 30, x: 0, y: 0 })
    const link = document.createElement('a')
    link.href = '#here'
    link.getBoundingClientRect = () => ({ width: 60, height: 20, left: 0, top: 0, right: 60, bottom: 20, x: 0, y: 0 })
    document.body.append(details, link)
    const button = sizedButton('padBtn', 36, 36)
    const hadPads = navigator.getGamepads
    let held = false
    navigator.getGamepads = () => [{ axes: [0, 0, 0, 0], buttons: [{ pressed: held, value: held ? 1 : 0 }] }]
    const controller = await freshController(previewManagerStub())
    const toggle = document.createElement('button')

    await controller.enableAltViewWithPreview(toggle)
    press(summary, 'pointerdown')
    press(summary, 'pointerup')
    press(link, 'pointerdown')
    press(link, 'pointerup')
    expect(await keysAsked()).toEqual(['p 5 down', 'p 5 up', 'p 2 down', 'p 2 up'])

    // The page's own clicks stay quiet.
    button.click()
    expect(await keysAsked()).toHaveLength(4)
    // A controller's A button: its click is the press.
    held = true
    button.click()
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect((await keysAsked()).slice(4)).toEqual(['p 2 down', 'p 2 up'])
    // A press heard first: its click is not heard again.
    press(button, 'pointerdown')
    press(button, 'pointerup')
    button.click()
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect((await keysAsked()).slice(6)).toEqual(['p 2 down', 'p 2 up'])

    navigator.getGamepads = hadPads
    controller.disableAltViewWithPreview(toggle)
  })

  it('a label that opens a file chooser is a key, one press whether a pointer, Enter or a controller presses it', async () => {
    pageWithHeaderAndDpad()
    const zone = document.createElement('label')
    zone.tabIndex = 0
    zone.innerHTML = '<span>Drop a project here</span><input type="file">'
    zone.getBoundingClientRect = () => ({ width: 400, height: 160, left: 0, top: 0, right: 400, bottom: 160, x: 0, y: 0 })
    const text = zone.querySelector('span')
    const chooser = zone.querySelector('input')
    let opened = 0
    chooser.addEventListener('click', () => opened++)
    zone.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') chooser.click()
    })
    const browse = document.createElement('label')
    browse.innerHTML = 'Browse<input type="file">'
    browse.getBoundingClientRect = () => ({ width: 90, height: 36, left: 0, top: 0, right: 90, bottom: 36, x: 0, y: 0 })
    const browseInput = browse.querySelector('input')
    const gridLabel = document.createElement('label')
    gridLabel.innerHTML = '<input type="checkbox"> Grid'
    const picker = document.createElement('input')
    picker.type = 'file'
    document.body.append(zone, browse, gridLabel, picker)
    const opener = sizedButton('openBtn', 36, 36)
    opener.addEventListener('click', () => chooser.click())
    const hadPads = navigator.getGamepads
    let held = false
    navigator.getGamepads = () => [{ axes: [0, 0, 0, 0], buttons: [{ pressed: held, value: held ? 1 : 0 }] }]
    const controller = await freshController(previewManagerStub())
    const toggle = document.createElement('button')
    const enter = (el, type) => el.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', bubbles: true }))
    const tapped = () => new Promise((resolve) => setTimeout(resolve, 100))

    await controller.enableAltViewWithPreview(toggle)
    press(text, 'pointerdown')
    press(text, 'pointerup')
    text.click()
    expect(opened, 'the label passes its click on').toBe(1)
    expect(await keysAsked(), 'a pointer on the label').toEqual(['p 7 down', 'p 7 up'])
    zone.focus()
    enter(zone, 'keydown')
    enter(zone, 'keyup')
    expect(opened).toBe(2)
    expect((await keysAsked()).slice(2), 'Enter on the label').toEqual(['p 7 down', 'p 7 up'])
    // The input the browser gives the focus to when its label is pressed.
    browseInput.focus()
    press(browse, 'pointerdown')
    press(browse, 'pointerup')
    browse.click()
    enter(browseInput, 'keydown')
    enter(browseInput, 'keyup')
    expect((await keysAsked()).slice(4), "a label's input sounds as the label").toEqual([
      'p 4 down',
      'p 4 up',
      'p 4 down',
      'p 4 up',
    ])

    held = true
    zone.click()
    await tapped()
    browseInput.click()
    await tapped()
    opener.click()
    await tapped()
    picker.click()
    gridLabel.click()
    await tapped()
    expect((await keysAsked()).slice(8), 'a controller: each press once').toEqual([
      'p 7 down',
      'p 7 up',
      'p 4 down',
      'p 4 up',
      'p 2 down',
      'p 2 up',
    ])
    expect(opened, 'the chooser opened by another control').toBe(4)

    navigator.getGamepads = hadPads
    controller.disableAltViewWithPreview(toggle)
  })

  it('a grip ticks for every 2 % of the window it is moved by hand, and for a move its keys make', async () => {
    pageWithHeaderAndDpad()
    clock = 0
    vi.spyOn(performance, 'now').mockImplementation(() => clock)
    const frames = []
    const hadFrame = window.requestAnimationFrame
    const hadCancel = window.cancelAnimationFrame
    window.requestAnimationFrame = (fn) => frames.push(fn)
    window.cancelAnimationFrame = (id) => {
      frames[id - 1] = null
    }
    const runFrame = () => {
      const due = frames.splice(0)
      for (const fn of due) fn?.(clock)
    }
    let x = 500
    const grip = document.createElement('div')
    grip.setAttribute('role', 'separator')
    grip.tabIndex = 0
    grip.getBoundingClientRect = () => ({ width: 8, height: 400, left: x, top: 0, right: x + 8, bottom: 400, x, y: 0 })
    document.body.append(grip)
    const controller = await freshController(previewManagerStub())
    const toggle = document.createElement('button')
    const width = window.innerWidth
    const dragTo = (px) => {
      clock += 100
      x = px
      runFrame()
    }

    await controller.enableAltViewWithPreview(toggle)
    const before = (await clicksAsked()).length
    press(grip, 'pointerdown')
    dragTo(500 + width * 0.01)
    expect((await clicksAsked()).length - before, '1 %: nothing yet').toBe(0)
    dragTo(500 + width * 0.021)
    dragTo(500 + width * 0.03)
    dragTo(500 + width * 0.042)
    expect((await clicksAsked()).slice(before), 'a tick per 2 %, the middle tone').toEqual(['p 4', 'p 4'])
    press(grip, 'pointerup')
    dragTo(500 + width * 0.2)
    expect((await clicksAsked()).length - before, 'let go').toBe(2)

    grip.focus()
    clock += 100
    grip.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    x -= 10
    runFrame()
    expect((await clicksAsked()).length - before, 'a key that moved it').toBe(3)

    window.requestAnimationFrame = hadFrame
    window.cancelAnimationFrame = hadCancel
    controller.disableAltViewWithPreview(toggle)
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
      'Pan arrows now adjust the Alt View: up and down for edges, left and right for focus, Shift with up and down for glow.',
    ])

    expect(controller.onPanControl({ direction: 'up', shiftKey: false })).toBe(
      'Edges 105%'
    )
    expect(controller.onPanControl({ direction: 'left', shiftKey: false })).toBe(
      'Focus 55%'
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
