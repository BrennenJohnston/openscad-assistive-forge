/**
 * Downloaded files are named for the project and the day, in plain words: a
 * person finding the file later knows what it is. The old name carried an
 * unexplained code, and both STL kinds got the same name, so the browser
 * numbered one of them.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  generateFilename,
  resolveDownloadFilename,
} from '../../src/js/download.js'

describe('generateFilename', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-11T12:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('is the project and the day', () => {
    expect(generateFilename('multi-file-box.zip', { w: 1 }, 'obj')).toBe(
      'multi-file-box-2026-10-11.obj'
    )
    expect(generateFilename('simple_box.scad', {}, 'svg')).toBe(
      'simple_box-2026-10-11.svg'
    )
  })

  it('tells the two STL kinds apart', () => {
    expect(generateFilename('simple_box.scad', {}, 'stl', { stlBinary: true })).toBe(
      'simple_box-2026-10-11-binary.stl'
    )
    expect(generateFilename('simple_box.scad', {}, 'stl', { stlBinary: false })).toBe(
      'simple_box-2026-10-11-ascii.stl'
    )
    // An STL of no stated kind is named plainly.
    expect(generateFilename('simple_box.scad', {}, 'stl')).toBe(
      'simple_box-2026-10-11.stl'
    )
  })

  it('reaches the STL kind through resolveDownloadFilename', () => {
    expect(
      resolveDownloadFilename('simple_box.scad', {}, 'stl', null, { stlBinary: false })
    ).toBe('simple_box-2026-10-11-ascii.stl')
  })
})
