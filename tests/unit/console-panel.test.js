/**
 * Unit tests for how the console panel shows an entry.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ConsolePanel, LIVE_RESTORE_MS } from '../../src/js/console-panel.js'
import { announceError, announceImmediate } from '../../src/js/announcer.js'

vi.mock('../../src/js/announcer.js', () => ({
  announceError: vi.fn(),
  announceImmediate: vi.fn(),
}))

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

describe('the console log, as a screen reader meets it', () => {
  let container

  beforeEach(() => {
    document.body.innerHTML =
      '<input type="checkbox" id="console-filter-echo" checked>' +
      '<div id="log" role="log" aria-live="polite" aria-relevant="additions"></div>'
    container = document.getElementById('log')
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps the rows it has shown when new output arrives', () => {
    const p = new ConsolePanel({ container, badge: document.createElement('span') })
    p.addOutput('ECHO: "first"')
    const firstRow = container.querySelector('.console-entry')
    p.addOutput('ECHO: "second"')
    const rows = container.querySelectorAll('.console-entry')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toBe(firstRow)
  })

  it('marks no row as an alert', () => {
    const p = new ConsolePanel({ container, badge: document.createElement('span') })
    p.addOutput(['WARNING: one', 'ERROR: two'].join('\n'))
    expect(container.querySelectorAll('[role="alert"]')).toHaveLength(0)
  })

  it('is quiet while a filter rebuilds it, then live again', () => {
    vi.useFakeTimers()
    const p = new ConsolePanel({ container, badge: document.createElement('span') })
    p.addOutput(['ECHO: "a"', 'WARNING: b'].join('\n'))
    const box = document.getElementById('console-filter-echo')
    box.checked = false
    box.dispatchEvent(new Event('change'))
    expect(container.getAttribute('aria-live')).toBe('off')
    expect(container.querySelectorAll('.console-entry')).toHaveLength(1)
    vi.advanceTimersByTime(LIVE_RESTORE_MS)
    expect(container.getAttribute('aria-live')).toBe('polite')
  })

  it('leaves a line to the log while the log is on screen', () => {
    const p = new ConsolePanel({ container, badge: document.createElement('span') })
    container.checkVisibility = () => true
    p.addOutput('WARNING: shown in the log')
    expect(announceImmediate).not.toHaveBeenCalled()
    expect(announceError).not.toHaveBeenCalled()
  })

  it('speaks a line itself while the log is out of sight, its level once', () => {
    const p = new ConsolePanel({ container, badge: document.createElement('span') })
    container.checkVisibility = () => false
    p.addOutput('WARNING: out of sight')
    expect(announceImmediate).toHaveBeenCalledWith('WARNING: out of sight')
  })

  it('leaves an error line to the failed run, which says it once', () => {
    const p = new ConsolePanel({ container, badge: document.createElement('span') })
    container.checkVisibility = () => false
    p.addOutput('ERROR: Parser error: syntax error in file a.scad, line 4')
    expect(announceError).not.toHaveBeenCalled()
    expect(announceImmediate).not.toHaveBeenCalled()
  })
})

describe('copying the console', () => {
  it('says Copied once, to the eye and to a screen reader', async () => {
    document.body.innerHTML = '<button id="console-copy-btn" aria-label="Copy console output to clipboard">📋</button>'
    const writeText = vi.fn().mockResolvedValue()
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const p = panel()
    p.addSystemLine('one line')
    vi.mocked(announceImmediate).mockClear()
    await p.copyToClipboard()
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(vi.mocked(announceImmediate).mock.calls.map((c) => c[0])).toEqual(['Console copied'])
    const btn = document.getElementById('console-copy-btn')
    expect(btn.textContent.trim()).toBe('Copied')
    document.body.innerHTML = ''
  })
})
