/**
 * The Alt View controller's words: what the live region is written with.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
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
  return {
    mesh: null,
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
  }
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
// theme button the key is placed after, and the pan D-pad the adjust
// button joins. Returns every text written to the live region.
function pageWithHeaderAndDpad() {
  document.body.innerHTML = `
    <div id="srAnnouncer" aria-live="polite"></div>
    <button id="themeToggle"></button>
    <div class="camera-control-dpad"><button id="cameraPanUp"></button></div>
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
      'Characters 95%'
    )
    expect(controller.onPanControl({ direction: 'up', shiftKey: true })).toBe(
      'Glow 5%'
    )

    adjust.click()
    await vi.advanceTimersByTimeAsync(100)
    expect(written.at(-1)).toBe('Pan arrows move the view again.')
  })
})
