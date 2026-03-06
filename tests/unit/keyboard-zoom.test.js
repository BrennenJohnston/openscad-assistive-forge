import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { KeyboardConfig, DEFAULT_SHORTCUTS } from '../../src/js/keyboard-config.js'

const STORAGE_KEY = 'openscad-forge-keyboard-shortcuts'

function makeKeydown(key, { ctrl = false, shift = false, alt = false } = {}) {
  return new KeyboardEvent('keydown', {
    key,
    ctrlKey: ctrl,
    shiftKey: shift,
    altKey: alt,
    bubbles: true,
    cancelable: true,
  })
}

function makeCmEditor() {
  const editor = document.createElement('div')
  editor.classList.add('cm-editor')
  const content = document.createElement('div')
  content.setAttribute('contenteditable', 'true')
  editor.appendChild(content)
  document.body.appendChild(editor)
  return { editor, content }
}

describe('Editor zoom shortcuts (editorOnly)', () => {
  let kb
  let increaseSpy
  let decreaseSpy

  beforeEach(() => {
    document.body.innerHTML = ''
    localStorage.clear()
    kb = new KeyboardConfig()
    kb.init()
    increaseSpy = vi.fn()
    decreaseSpy = vi.fn()
    kb.on('increaseFontSize', increaseSpy)
    kb.on('decreaseFontSize', decreaseSpy)
  })

  afterEach(() => {
    kb.destroy()
    localStorage.clear()
    vi.restoreAllMocks()
  })

  // --- DEFAULT_SHORTCUTS flags ---

  it('increaseFontSize DEFAULT_SHORTCUTS has editorOnly: true', () => {
    expect(DEFAULT_SHORTCUTS.increaseFontSize.editorOnly).toBe(true)
  })

  it('decreaseFontSize DEFAULT_SHORTCUTS has editorOnly: true', () => {
    expect(DEFAULT_SHORTCUTS.decreaseFontSize.editorOnly).toBe(true)
  })

  // --- Inside .cm-editor: shortcuts must fire ---

  it('fires increaseFontSize and calls preventDefault when Ctrl+= inside .cm-editor', () => {
    const { content } = makeCmEditor()
    const event = makeKeydown('=', { ctrl: true })
    content.dispatchEvent(event)
    expect(increaseSpy).toHaveBeenCalledTimes(1)
    expect(event.defaultPrevented).toBe(true)
  })

  it('fires decreaseFontSize and calls preventDefault when Ctrl+- inside .cm-editor', () => {
    const { content } = makeCmEditor()
    const event = makeKeydown('-', { ctrl: true })
    content.dispatchEvent(event)
    expect(decreaseSpy).toHaveBeenCalledTimes(1)
    expect(event.defaultPrevented).toBe(true)
  })

  it('fires when focus is on the .cm-editor root element itself', () => {
    const { editor } = makeCmEditor()
    const event = makeKeydown('=', { ctrl: true })
    editor.dispatchEvent(event)
    expect(increaseSpy).toHaveBeenCalledTimes(1)
    expect(event.defaultPrevented).toBe(true)
  })

  // --- Outside .cm-editor: shortcuts must NOT fire and must NOT steal default ---

  it('does NOT fire increaseFontSize and does NOT preventDefault when Ctrl+= outside editor', () => {
    const div = document.createElement('div')
    document.body.appendChild(div)
    const event = makeKeydown('=', { ctrl: true })
    div.dispatchEvent(event)
    expect(increaseSpy).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  it('does NOT fire decreaseFontSize and does NOT preventDefault when Ctrl+- outside editor', () => {
    const div = document.createElement('div')
    document.body.appendChild(div)
    const event = makeKeydown('-', { ctrl: true })
    div.dispatchEvent(event)
    expect(decreaseSpy).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  it('does NOT fire zoom shortcuts when focus is in a plain INPUT field', () => {
    const input = document.createElement('input')
    document.body.appendChild(input)
    const event = makeKeydown('=', { ctrl: true })
    input.dispatchEvent(event)
    expect(increaseSpy).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  it('does NOT fire zoom shortcuts when focus is on document.body', () => {
    const event = makeKeydown('=', { ctrl: true })
    document.body.dispatchEvent(event)
    expect(increaseSpy).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  // --- Non-editorOnly shortcuts still work outside the editor ---

  it('non-editorOnly shortcuts still fire outside the editor', () => {
    const renderSpy = vi.fn()
    kb.on('render', renderSpy)
    const div = document.createElement('div')
    document.body.appendChild(div)
    const event = makeKeydown('F6')
    div.dispatchEvent(event)
    expect(renderSpy).toHaveBeenCalledTimes(1)
  })

  it('non-editorOnly shortcuts are still blocked in regular input fields', () => {
    const renderSpy = vi.fn()
    kb.on('render', renderSpy)
    const input = document.createElement('input')
    document.body.appendChild(input)
    const event = makeKeydown('F6')
    input.dispatchEvent(event)
    expect(renderSpy).not.toHaveBeenCalled()
  })

  // --- editorOnly is preserved through setShortcut / load / save ---

  it('editorOnly is preserved after setShortcut', () => {
    kb.setShortcut('increaseFontSize', { key: '+', ctrl: true })
    expect(kb.getShortcut('increaseFontSize').editorOnly).toBe(true)
  })

  it('editorOnly is preserved after loading a customization from localStorage', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ increaseFontSize: { key: '+', ctrl: true } })
    )
    const kb2 = new KeyboardConfig()
    kb2.init()
    expect(kb2.getShortcut('increaseFontSize').editorOnly).toBe(true)
    kb2.destroy()
  })

  it('editorOnly is NOT written to localStorage', () => {
    kb.setShortcut('increaseFontSize', { key: '+', ctrl: true })
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY))
    expect(saved.increaseFontSize).not.toHaveProperty('editorOnly')
  })

  // --- Custom editorSelector ---

  it('respects custom editorSelector from init options', () => {
    // The beforeEach kb instance uses '.cm-editor' and would fire first on the
    // shared document listener, calling preventDefault and masking the result.
    // Destroy it before testing a different selector in isolation.
    kb.destroy()

    const kb2 = new KeyboardConfig()
    kb2.init({ editorSelector: '.my-custom-editor' })
    const zoomSpy = vi.fn()
    kb2.on('increaseFontSize', zoomSpy)

    // Standard .cm-editor should NOT trigger when editorSelector is custom
    const { content } = makeCmEditor()
    const e1 = makeKeydown('=', { ctrl: true })
    content.dispatchEvent(e1)
    expect(zoomSpy).not.toHaveBeenCalled()
    expect(e1.defaultPrevented).toBe(false)

    // Custom .my-custom-editor SHOULD trigger
    const customEditor = document.createElement('div')
    customEditor.classList.add('my-custom-editor')
    document.body.appendChild(customEditor)
    const e2 = makeKeydown('=', { ctrl: true })
    customEditor.dispatchEvent(e2)
    expect(zoomSpy).toHaveBeenCalledTimes(1)
    expect(e2.defaultPrevented).toBe(true)

    kb2.destroy()
  })
})
