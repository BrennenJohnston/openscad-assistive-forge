/**
 * Escape inside an open dialog element belongs to the dialog. The browser
 * closes one on Escape unless the key's default is prevented, and the Cancel
 * render shortcut, also on Escape, prevented it even with nothing rendering.
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

describe('Escape and the Cancel render shortcut', () => {
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

  it('leaves Escape to an open dialog element', () => {
    const dialog = document.createElement('dialog')
    dialog.setAttribute('open', '')
    const choice = document.createElement('input')
    choice.type = 'radio'
    dialog.appendChild(choice)
    document.body.appendChild(dialog)

    const event = pressEscape(choice)

    expect(event.defaultPrevented).toBe(false)
    expect(cancel).not.toHaveBeenCalled()
  })

  it('still cancels a render from anywhere else', () => {
    const button = document.createElement('button')
    document.body.appendChild(button)

    const event = pressEscape(button)

    expect(event.defaultPrevented).toBe(true)
    expect(cancel).toHaveBeenCalledTimes(1)
  })
})
