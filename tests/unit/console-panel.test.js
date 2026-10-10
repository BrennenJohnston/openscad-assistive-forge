/**
 * Unit tests for how the console panel shows an entry.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest'
import { ConsolePanel } from '../../src/js/console-panel.js'

function panel() {
  return new ConsolePanel({
    container: document.createElement('div'),
    badge: document.createElement('span'),
  })
}

// What a sighted reader sees: everything but the screen-reader-only words.
function shown(html) {
  const host = document.createElement('div')
  host.innerHTML = html
  host.querySelectorAll('.sr-only').forEach((el) => el.remove())
  return host.querySelector('.console-entry').textContent.replace(/\s+/g, ' ')
}

describe('a console entry', () => {
  it('shows its level once when the message already starts with it', () => {
    const html = panel().renderEntry({
      type: 'warning',
      message: 'WARNING: Unable to convert $vpr=[] to a vec3 or vec2 of numbers',
      timestamp: Date.now(),
      line: null,
    })
    expect(shown(html)).not.toMatch(/WARNING\s+WARNING/)
    expect(shown(html)).toContain('WARNING Unable to convert')
  })

  it('keeps the message whole, the words a screen reader reads', () => {
    const html = panel().renderEntry({
      type: 'echo',
      message: 'ECHO: "ready"',
      timestamp: Date.now(),
      line: null,
    })
    const host = document.createElement('div')
    host.innerHTML = html
    expect(host.querySelector('.console-message').textContent).toBe(
      'ECHO: "ready"'
    )
  })

  it('shows its level when the message does not say it', () => {
    const html = panel().renderEntry({
      type: 'warning',
      message: 'Viewall and autocenter disabled',
      timestamp: Date.now(),
      line: null,
    })
    expect(shown(html)).toContain('WARNING Viewall and autocenter disabled')
  })
})
