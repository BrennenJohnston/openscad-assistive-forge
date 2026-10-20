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

  it('returns to a drawn control whose container carries a hidden class', () => {
    // The Help button sits in the workflow bar, which is classed "hidden" on
    // the Main Page while the button itself stays on screen; focus went to
    // the main region instead of back to Help.
    const bar = document.createElement('nav')
    bar.classList.add('hidden')
    document.body.appendChild(bar)
    const help = button('Help', bar)
    help.checkVisibility = () => true
    help.focus()
    const modal = dialogWithButton()
    openModal(modal)
    closeModal(modal)
    expect(document.activeElement).toBe(help)
  })

  it('asks a fallback given as a function when the dialog closes', () => {
    // A dialog a game controller opens on connecting finds nothing focused,
    // and the control to land on may be drawn only after it opened.
    const main = document.createElement('main')
    main.id = 'main-content'
    main.tabIndex = -1
    document.body.appendChild(main)
    let first = null
    const modal = dialogWithButton()
    openModal(modal, { fallbackFocus: () => first })
    first = button('Width', main)
    closeModal(modal)
    expect(document.activeElement).toBe(first)
  })

  it('does not return to a control that is not drawn', () => {
    // An input in a folded group is in the page but cannot take focus.
    const folded = button('Width')
    folded.checkVisibility = () => false
    const fallback = button('Dimensions')
    const modal = dialogWithButton()
    openModal(modal, { returnFocus: folded, fallbackFocus: fallback })
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

  it('leaves focus in the same dialog when it opens again at once', () => {
    // Escape, then Enter on the opener straight away: the first close's
    // retries must not pull focus out of the dialog open again.
    const frames = []
    globalThis.requestAnimationFrame = (cb) => frames.push(cb)
    const opener = button('View Full Console')
    opener.focus()
    const modal = dialogWithButton()
    openModal(modal)
    closeModal(modal)
    expect(document.activeElement).toBe(opener)
    openModal(modal)
    const inside = modal.querySelector('button')
    expect(document.activeElement).toBe(inside)
    frames.splice(0).forEach((cb) => cb())
    vi.advanceTimersByTime(60)
    expect(document.activeElement).toBe(inside)
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

describe('a button busy with its own action', () => {
  it('keeps focus, says it is unavailable, and comes back as it was', async () => {
    const { setBusy, isBusy } = await import('../../src/js/focus-trap.js')
    const save = button('Save to Folder')
    save.focus()
    setBusy(save, true)
    expect(document.activeElement).toBe(save)
    expect(save.getAttribute('aria-disabled')).toBe('true')
    expect(isBusy(save)).toBe(true)
    setBusy(save, false)
    expect(save.hasAttribute('aria-disabled')).toBe(false)
    expect(isBusy(save)).toBe(false)
  })
})
