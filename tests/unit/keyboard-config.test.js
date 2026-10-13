/**
 * The Alt View's character-size shortcuts: a pair of bare keys that clash
 * with no other default, listed as one command in Keyboard Shortcuts, and
 * kept out of text fields.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  DEFAULT_SHORTCUTS,
  SHORTCUT_CATEGORIES,
  generateShortcutsHelpHTML,
  keyboardConfig,
} from '../../src/js/keyboard-config.js'

const signature = (s) =>
  [s.ctrl && 'ctrl', s.shift && 'shift', s.alt && 'alt', s.meta && 'meta', s.key.toLowerCase()]
    .filter(Boolean)
    .join('+')

describe('the Alt View character-size shortcuts', () => {
  beforeEach(() => {
    localStorage.clear()
    keyboardConfig.resetAll?.()
  })

  it('are the minus and equals keys, bare, and clash with no other default', () => {
    expect(DEFAULT_SHORTCUTS.altViewSmaller).toMatchObject({ key: '-' })
    expect(DEFAULT_SHORTCUTS.altViewLarger).toMatchObject({ key: '=' })
    for (const action of ['altViewSmaller', 'altViewLarger']) {
      const shortcut = DEFAULT_SHORTCUTS[action]
      expect(shortcut.global).toBeFalsy()
      expect(shortcut.editorOnly).toBeFalsy()
      const twins = Object.entries(DEFAULT_SHORTCUTS).filter(
        ([, s]) => signature(s) === signature(shortcut)
      )
      expect(twins.map(([name]) => name)).toEqual([action])
    }
  })

  it('are listed once, as one command with two keys', () => {
    const entries = Object.values(SHORTCUT_CATEGORIES).flatMap((c) => c.actions)
    expect(entries).toContainEqual(['altViewSmaller', 'altViewLarger'])

    const host = document.createElement('div')
    host.innerHTML = generateShortcutsHelpHTML()
    const rows = [...host.querySelectorAll('dd')].filter(
      (dd) => dd.textContent === 'Alt View: smaller or larger characters'
    )
    expect(rows).toHaveLength(1)
    const keys = [...rows[0].previousElementSibling.querySelectorAll('kbd')].map((k) =>
      k.textContent.trim()
    )
    expect(keys).toEqual(['-', '='])
  })
})
