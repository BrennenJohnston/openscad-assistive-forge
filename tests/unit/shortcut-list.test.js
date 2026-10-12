/**
 * The Keyboard Shortcuts list names each command once. A command with two
 * keys is one row with a button per key, so it no longer reads as two
 * different actions, and each key can still be changed on its own.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  generateShortcutsEditorHTML,
  generateShortcutsHelpHTML,
  keyboardConfig,
} from '../../src/js/keyboard-config.js'

function rows() {
  const host = document.createElement('div')
  host.innerHTML = generateShortcutsEditorHTML()
  return [...host.querySelectorAll('.shortcut-item')].map((row) => ({
    description: row.querySelector('.shortcut-description').textContent,
    keys: [...row.querySelectorAll('.shortcut-key-btn kbd')].map((k) => k.textContent.trim()),
    actions: [...row.querySelectorAll('.shortcut-key-btn')].map((b) => b.dataset.action),
  }))
}

describe('the Keyboard Shortcuts list', () => {
  beforeEach(() => {
    localStorage.clear()
    keyboardConfig.resetAll?.()
  })

  it('lists a command with two keys once, a button for each key', () => {
    const list = rows()
    expect(list.filter((r) => r.description === 'Toggle Customizer panel')).toEqual([
      {
        description: 'Toggle Customizer panel',
        keys: ['Ctrl+B', 'Ctrl+Alt+4'],
        actions: ['toggleParameters', 'toggleCustomizer'],
      },
    ])
    expect(list.filter((r) => r.description === 'Toggle Editor panel')).toEqual([
      {
        description: 'Toggle Editor panel',
        keys: ['Ctrl+E', 'Ctrl+Alt+3'],
        actions: ['toggleExpertMode', 'toggleCodeEditor'],
      },
    ])
  })

  it('names no command twice', () => {
    const descriptions = rows().map((r) => r.description)
    expect(descriptions.length).toBeGreaterThan(20)
    expect(new Set(descriptions).size).toBe(descriptions.length)
  })

  it('shows both keys on one line of the read-only list', () => {
    const host = document.createElement('div')
    host.innerHTML = generateShortcutsHelpHTML()
    const line = [...host.querySelectorAll('dd')].find(
      (dd) => dd.textContent === 'Toggle Customizer panel'
    )
    const keys = [...line.previousElementSibling.querySelectorAll('kbd')].map((k) =>
      k.textContent.trim()
    )
    expect(keys).toEqual(['Ctrl+B', 'Ctrl+Alt+4'])
    expect(
      [...host.querySelectorAll('dd')].filter((dd) => dd.textContent === 'Toggle Customizer panel')
    ).toHaveLength(1)
  })
})
