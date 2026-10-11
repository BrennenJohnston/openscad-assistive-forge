/**
 * Escape that closes something (a drawer, a menu, a help tooltip) is not
 * also the Cancel render shortcut: closing the Customizer drawer while a
 * preview runs must leave the preview running.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { KeyboardConfig } from '../../src/js/keyboard-config.js'

const pressEscape = (target) => {
  const event = new KeyboardEvent('keydown', {
    key: 'Escape',
    bubbles: true,
    cancelable: true,
  })
  target.dispatchEvent(event)
  return event
}

describe('An Escape already used', () => {
  let kb
  let cancel

  beforeEach(() => {
    document.body.innerHTML = ''
    localStorage.clear()
    kb = new KeyboardConfig()
    kb.init()
    cancel = vi.fn()
    kb.on('cancelRender', cancel)
  })

  afterEach(() => {
    kb.destroy()
    localStorage.clear()
  })

  it('does not cancel a render', () => {
    const drawer = document.createElement('div')
    const control = document.createElement('input')
    drawer.appendChild(control)
    document.body.appendChild(drawer)
    drawer.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') e.preventDefault()
    })

    pressEscape(control)

    expect(cancel).not.toHaveBeenCalled()
  })

  it('an unused Escape still cancels one', () => {
    const button = document.createElement('button')
    document.body.appendChild(button)

    pressEscape(button)

    expect(cancel).toHaveBeenCalledTimes(1)
  })
})
