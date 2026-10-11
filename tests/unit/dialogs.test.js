/**
 * Unit tests for the app's own question dialogs that stand in for the
 * browser's prompt() and for a copy the browser refused: a visible label on
 * the field, focus on the field, Enter and Escape, and focus back on the
 * control that opened the dialog.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { showPromptDialog, showTextToCopyDialog } from '../../src/js/dialogs.js'

let originalRaf
let originalClipboard

function opener(text = 'Rename') {
  const el = document.createElement('button')
  el.textContent = text
  document.body.appendChild(el)
  el.focus()
  return el
}

function openDialog() {
  return document.querySelector('[role="dialog"][aria-modal="true"]')
}

function setClipboard(writeText) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  })
}

beforeEach(() => {
  document.body.innerHTML = ''
  originalRaf = globalThis.requestAnimationFrame
  globalThis.requestAnimationFrame = (cb) => cb()
  originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
  vi.spyOn(window, 'prompt')
  vi.spyOn(window, 'confirm')
  vi.spyOn(window, 'alert')
})

afterEach(() => {
  vi.restoreAllMocks()
  globalThis.requestAnimationFrame = originalRaf
  if (originalClipboard) {
    Object.defineProperty(navigator, 'clipboard', originalClipboard)
  } else {
    delete navigator.clipboard
  }
})

describe('showPromptDialog', () => {
  it('opens a named dialog whose field has a visible label and the starting text, selected', () => {
    opener()
    showPromptDialog('Rename the folder "Gears".', {
      title: 'Rename Folder',
      label: 'Folder name',
      defaultValue: 'Gears',
    })
    const dialog = openDialog()
    expect(dialog).not.toBeNull()
    const title = document.getElementById(dialog.getAttribute('aria-labelledby'))
    expect(title.textContent).toBe('Rename Folder')
    const field = dialog.querySelector('input[type="text"]')
    const label = dialog.querySelector(`label[for="${field.id}"]`)
    expect(label.textContent.trim()).toBe('Folder name')
    expect(field.value).toBe('Gears')
    expect(document.activeElement).toBe(field)
    expect(field.selectionStart).toBe(0)
    expect(field.selectionEnd).toBe('Gears'.length)
    expect(window.prompt).not.toHaveBeenCalled()
  })

  it('resolves the trimmed text when the form is sent (Enter in the field)', async () => {
    opener()
    const answer = showPromptDialog('Name the new folder.', { label: 'Folder name' })
    const field = openDialog().querySelector('input[type="text"]')
    field.value = '  Brackets  '
    field.form.requestSubmit()
    await expect(answer).resolves.toBe('Brackets')
    expect(openDialog()).toBeNull()
  })

  it('resolves the trimmed text when the confirm button is pressed', async () => {
    opener()
    const answer = showPromptDialog('Rename "a.scad".', {
      label: 'New name',
      defaultValue: 'a.scad',
      confirmLabel: 'Rename',
    })
    const dialog = openDialog()
    dialog.querySelector('input[type="text"]').value = 'b.scad '
    const confirm = [...dialog.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Rename')
    confirm.click()
    await expect(answer).resolves.toBe('b.scad')
  })

  it('resolves null on Escape and on Cancel, and gives focus back to the opener', async () => {
    const button = opener()
    const first = showPromptDialog('Name the new folder.', { label: 'Folder name' })
    openDialog().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await expect(first).resolves.toBeNull()
    expect(document.activeElement).toBe(button)

    const second = showPromptDialog('Name the new folder.', { label: 'Folder name' })
    const cancel = [...openDialog().querySelectorAll('button')].find((b) => b.textContent.trim() === 'Cancel')
    cancel.click()
    await expect(second).resolves.toBeNull()
    expect(document.activeElement).toBe(button)
    expect(window.prompt).not.toHaveBeenCalled()
  })
})

describe('showTextToCopyDialog', () => {
  const LINK = 'https://example.org/forge/?manifest=https%3A%2F%2Fexample.org%2Fm.json'

  it('shows the text in a read-only field with a visible label, focused and selected', () => {
    opener('Copy')
    showTextToCopyDialog(LINK)
    const dialog = openDialog()
    const title = document.getElementById(dialog.getAttribute('aria-labelledby'))
    expect(title.textContent).toBe('Copy by hand')
    const field = dialog.querySelector('textarea')
    expect(field.readOnly).toBe(true)
    expect(field.value).toBe(LINK)
    expect(dialog.querySelector(`label[for="${field.id}"]`).textContent.trim()).toBe('Text to copy')
    expect(document.activeElement).toBe(field)
    expect(field.selectionStart).toBe(0)
    expect(field.selectionEnd).toBe(LINK.length)
    expect(window.prompt).not.toHaveBeenCalled()
  })

  it('Copy tries the clipboard again and closes when it works', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    setClipboard(writeText)
    const button = opener('Copy')
    const result = showTextToCopyDialog(LINK)
    const copy = [...openDialog().querySelectorAll('button')].find((b) => b.textContent.trim() === 'Copy')
    copy.click()
    await expect(result).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledWith(LINK)
    expect(openDialog()).toBeNull()
    expect(document.activeElement).toBe(button)
  })

  it('a second refusal says so and leaves the text selected in the open dialog', async () => {
    setClipboard(vi.fn().mockRejectedValue(new Error('NotAllowedError')))
    opener('Copy')
    showTextToCopyDialog(LINK)
    const dialog = openDialog()
    const copy = [...dialog.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Copy')
    copy.click()
    const status = dialog.querySelector('[role="status"]')
    await vi.waitFor(() => expect(status.textContent).toMatch(/Still not allowed/))
    const field = dialog.querySelector('textarea')
    expect(document.activeElement).toBe(field)
    expect(field.selectionEnd - field.selectionStart).toBe(LINK.length)
    expect(openDialog()).toBe(dialog)
  })

  it('Close and Escape resolve false', async () => {
    opener('Copy')
    const first = showTextToCopyDialog(LINK)
    const close = [...openDialog().querySelectorAll('button')].find((b) => b.textContent.trim() === 'Close')
    close.click()
    await expect(first).resolves.toBe(false)

    const second = showTextToCopyDialog(LINK)
    openDialog().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await expect(second).resolves.toBe(false)
  })
})
