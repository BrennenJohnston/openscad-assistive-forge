/**
 * Auto-rotate's switch in Preview Settings & Info: it owns the state, drives
 * the preview, keeps the saved preference, and gives way to reduced motion.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { initOverlayGridController } from '../../src/js/overlay-grid-controller.js'

function previewManagerStub() {
  return {
    setAutoRotate: vi.fn(),
    setAutoRotateSpeed: vi.fn(),
    isAutoRotateEnabled: vi.fn(() => false),
  }
}

function setReducedMotion(matches) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: query.includes('prefers-reduced-motion') ? matches : false,
    media: query,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

describe('Auto-rotate switch', () => {
  let pm

  beforeEach(() => {
    localStorage.clear()
    setReducedMotion(false)
    document.body.innerHTML = `
      <label class="toggle-switch">
        <input type="checkbox" id="autoRotateSetting" />
        <span class="toggle-label">Auto-rotate</span>
      </label>
      <input type="range" id="rotationSpeedInput" min="0.1" max="3" step="0.1" value="0.5" />
      <span id="rotationSpeedValue">0.5°/s</span>
    `
    pm = previewManagerStub()
  })

  it('turns the preview rotating on and off and keeps the choice', () => {
    initOverlayGridController({ getPreviewManager: () => pm, updateStatus: vi.fn() })
    const toggle = document.getElementById('autoRotateSetting')

    toggle.checked = true
    toggle.dispatchEvent(new Event('change'))
    expect(pm.setAutoRotate).toHaveBeenLastCalledWith(true)
    expect(localStorage.setItem).toHaveBeenCalledWith(expect.stringContaining('auto-rotate'), 'true')

    toggle.checked = false
    toggle.dispatchEvent(new Event('change'))
    expect(pm.setAutoRotate).toHaveBeenLastCalledWith(false)
  })

  it('stays off when the person prefers reduced motion', () => {
    setReducedMotion(true)
    initOverlayGridController({ getPreviewManager: () => pm, updateStatus: vi.fn() })
    const toggle = document.getElementById('autoRotateSetting')

    toggle.checked = true
    toggle.dispatchEvent(new Event('change'))
    expect(pm.setAutoRotate).not.toHaveBeenCalledWith(true)
    expect(toggle.checked).toBe(false)
  })

  it('shows the saved choice once the preview connects', () => {
    initOverlayGridController({ getPreviewManager: () => pm, updateStatus: vi.fn() })
      .setAutoRotation(true)
    expect(document.getElementById('autoRotateSetting').checked).toBe(true)
  })
})
