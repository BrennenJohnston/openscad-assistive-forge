/**
 * Unit tests for Help > Library info: one row per bundled library with its
 * license, the date of the copy bundled and whether it is on, and the dialog
 * still opens when the libraries' manifest cannot be read.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { showLibraryInfoDialog } from '../../src/js/library-info-dialog.js'

let originalRaf

const manifest = {
  libraries: {
    MCAD: { license: 'LGPL-2.1', date: '2021-10-25' },
    BOSL2: { license: 'BSD-2-Clause', date: '2026-06-29' },
    NopSCADlib: { license: 'GPL-3.0', date: '2025-10-08' },
    dotSCAD: { license: 'LGPL-3.0', date: '2022-10-11' },
  },
}

function manager({ readable = true, on = [] } = {}) {
  return {
    getManifest: async () => (readable ? manifest : null),
    isEnabled: (id) => on.includes(id),
  }
}

function rows() {
  return [...document.querySelectorAll('.library-info-table tbody tr')].map((tr) =>
    [...tr.children].map((cell) => cell.textContent.trim())
  )
}

beforeEach(() => {
  document.body.innerHTML = ''
  originalRaf = globalThis.requestAnimationFrame
  globalThis.requestAnimationFrame = (cb) => cb()
})

afterEach(() => {
  globalThis.requestAnimationFrame = originalRaf
})

describe('showLibraryInfoDialog', () => {
  it('lists each bundled library with its license, date and whether it is on', async () => {
    const closed = showLibraryInfoDialog(manager({ on: ['MCAD'] }))
    await new Promise((resolve) => setTimeout(resolve))
    const dialog = document.querySelector('[role="dialog"][aria-labelledby="libraryInfoTitle"]')
    expect(dialog).not.toBeNull()
    expect(document.getElementById('libraryInfoTitle').textContent).toBe('Library Info')
    expect(rows()).toEqual([
      ['MCAD', 'LGPL-2.1', '2021-10-25', 'Yes'],
      ['BOSL2', 'BSD-2-Clause', '2026-06-29', 'No'],
      ['NopSCADlib', 'GPL-3.0', '2025-10-08', 'No'],
      ['dotSCAD', 'LGPL-3.0', '2022-10-11', 'No'],
    ])
    expect(document.activeElement.textContent.trim()).toBe('Close')
    document.activeElement.click()
    await expect(closed).resolves.toBe('close')
    expect(document.querySelector('.library-info-modal')).toBeNull()
  })

  it('still opens when the manifest cannot be read, saying the date is not recorded', async () => {
    showLibraryInfoDialog(manager({ readable: false }))
    await new Promise((resolve) => setTimeout(resolve))
    const first = rows()[0]
    expect(first[0]).toBe('MCAD')
    expect(first[1]).toBe('LGPL-2.1')
    expect(first[2]).toBe('Not recorded')
  })
})
