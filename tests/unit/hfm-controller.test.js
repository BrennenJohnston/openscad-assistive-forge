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
import { STORAGE_KEY_SOUNDS } from '../../src/js/storage-keys.js'

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

  it('on a phone starts at 40% when nothing is saved, and a saved size still wins', async () => {
    const width = Object.getOwnPropertyDescriptor(window, 'innerWidth')
    Object.defineProperty(window, 'innerWidth', { value: 412, configurable: true })
    try {
      const toggle = document.createElement('button')
      const controller = await freshController(previewManagerStub())
      await controller.enableAltViewWithPreview(toggle)
      expect((await lastAltView()).setFontScale).toHaveBeenLastCalledWith(0.4)
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
