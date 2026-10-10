/**
 * Unit tests for where focus goes when a dialog closes, and when a button
 * that has focus is disabled: never to the page body, where a keyboard or
 * screen reader user loses their place.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { openModal, closeModal } from '../../src/js/modal-manager.js'
import { disableKeepingFocus } from '../../src/js/focus-trap.js'

function button(text, parent = document.body) {
  const el = document.createElement('button')
  el.textContent = text
  parent.appendChild(el)
  return el
}

function dialogWithButton() {
  const modal = document.createElement('div')
  modal.classList.add('hidden')
  modal.setAttribute('aria-hidden', 'true')
  const inside = button('OK', modal)
  inside.getClientRects = () => [{ width: 10, height: 10 }]
  document.body.appendChild(modal)
  return modal
}

let originalRaf

beforeEach(() => {
  document.body.innerHTML = ''
  originalRaf = globalThis.requestAnimationFrame
  globalThis.requestAnimationFrame = (cb) => cb()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
})

afterEach(() => {
  vi.runOnlyPendingTimers()
  vi.useRealTimers()
  globalThis.requestAnimationFrame = originalRaf
})

describe('a dialog closing', () => {
  it('returns focus to the control named on opening', () => {
    const menuButton = button('Help')
    const menuItem = button('About')
    menuItem.focus()
    const modal = dialogWithButton()
    openModal(modal, { returnFocus: menuButton })
    menuItem.remove()
    closeModal(modal)
    expect(document.activeElement).toBe(menuButton)
  })

  it('goes to the fallback when the control that opened it is gone', () => {
    const opener = button('Delete')
    const list = button('Saved projects')
    opener.focus()
    const modal = dialogWithButton()
    openModal(modal)
    opener.remove()
    closeModal(modal, { fallbackFocus: list })
    expect(document.activeElement).toBe(list)
  })

  it('goes to the main region when nothing better is left', () => {
    const main = document.createElement('main')
    main.id = 'main-content'
    main.tabIndex = -1
    document.body.appendChild(main)
    const opener = button('Delete', main)
    opener.focus()
    const modal = dialogWithButton()
    openModal(modal)
    opener.remove()
    closeModal(modal)
    expect(document.activeElement).toBe(main)
  })

  it('does not return to a control that is now hidden', () => {
    const panel = document.createElement('div')
    document.body.appendChild(panel)
    const opener = button('Edit', panel)
    const fallback = button('Projects')
    opener.focus()
    const modal = dialogWithButton()
    openModal(modal, { fallbackFocus: fallback })
    panel.classList.add('hidden')
    closeModal(modal)
    expect(document.activeElement).toBe(fallback)
  })

  it('keeps the focus a caller moves after closing', () => {
    // A list drawn again under the dialog loses its opener, and the caller
    // finds the new row itself. The retries are for focus lost in the hide,
    // not for taking it back from there.
    const frames = []
    globalThis.requestAnimationFrame = (cb) => frames.push(cb)
    const main = document.createElement('main')
    main.id = 'main-content'
    main.tabIndex = -1
    document.body.appendChild(main)
    const opener = button('Edit', main)
    opener.focus()
    const modal = dialogWithButton()
    openModal(modal)
    opener.remove()
    closeModal(modal)
    const row = button('helpers.scad', main)
    row.focus()
    frames.splice(0).forEach((cb) => cb())
    vi.advanceTimersByTime(60)
    expect(document.activeElement).toBe(row)
  })
})

describe('a focused button being disabled', () => {
  it('hands focus to the fallback first', () => {
    const undo = button('Undo')
    const redo = button('Redo')
    undo.focus()
    disableKeepingFocus(undo, redo)
    expect(undo.disabled).toBe(true)
    expect(document.activeElement).toBe(redo)
  })

  it('leaves focus alone when the button did not have it', () => {
    const undo = button('Undo')
    const field = document.createElement('input')
    document.body.appendChild(field)
    field.focus()
    disableKeepingFocus(undo, button('Redo'))
    expect(undo.disabled).toBe(true)
    expect(document.activeElement).toBe(field)
  })
})

describe('a dialog opening', () => {
  it('takes focus at once, before the next frame', () => {
    // A busy page, or a tab in the background, can hold the next frame back;
    // a key pressed meanwhile must reach the dialog, not what is behind it.
    globalThis.requestAnimationFrame = () => 0
    const opener = button('Help')
    opener.focus()
    const modal = dialogWithButton()
    openModal(modal)
    expect(modal.contains(document.activeElement)).toBe(true)
  })
})
