/**
 * The Alt View controller's words: what the live region is written with.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { announce } from '../../src/js/announcer.js'

async function freshController() {
  vi.resetModules()
  const { initHfmController } = await import('../../src/js/hfm-controller.js')
  return initHfmController({
    getPreviewManager: () => null,
    getDisplayOptionsController: () => ({ refreshOverlays: vi.fn() }),
  })
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
