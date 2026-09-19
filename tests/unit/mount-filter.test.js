import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  filterFilesForMount,
  isBinaryCompanion,
} from '../../src/js/mount-filter.js'

afterEach(() => {
  vi.restoreAllMocks()
})

// A binary blob big enough that two of them cross the 32 MB fast path.
const BIG = 20 * 1024 * 1024
function bigDataUrl() {
  return 'data:image/png;base64,' + 'A'.repeat(BIG)
}

describe('isBinaryCompanion', () => {
  it('detects data URLs, byte arrays, and buffers', () => {
    expect(isBinaryCompanion('data:image/png;base64,AAA')).toBe(true)
    expect(isBinaryCompanion(new Uint8Array(4))).toBe(true)
    expect(isBinaryCompanion(new ArrayBuffer(4))).toBe(true)
    expect(isBinaryCompanion('cube(10);')).toBe(false)
  })
})

describe('filterFilesForMount', () => {
  it('passes small projects through untouched (same Map identity)', () => {
    const files = new Map([
      ['main.scad', 'cube(10);'],
      ['openings.txt', 'data'],
      ['screenshot.png', 'data:image/png;base64,AAA='],
    ])
    const result = filterFilesForMount(files, 'main.scad')
    expect(result.files).toBe(files)
    expect(result.dropped).toEqual([])
  })

  it('keeps referenced binaries and drops unreferenced ones above the fast path', () => {
    const files = new Map([
      ['main.scad', 'import("used.png");\ninclude <openings.txt>\ncube(1);'],
      ['openings.txt', 'data'],
      ['used.png', bigDataUrl()],
      ['unused.png', bigDataUrl()],
    ])
    const result = filterFilesForMount(files, 'main.scad')
    expect(result.files).not.toBe(files)
    expect([...result.files.keys()]).toEqual(
      expect.arrayContaining(['main.scad', 'openings.txt', 'used.png'])
    )
    expect(result.files.has('unused.png')).toBe(false)
    expect(result.dropped).toEqual(['unused.png'])
    // Input Map untouched
    expect(files.size).toBe(4)
  })

  it('always keeps every text file regardless of size decisions', () => {
    const files = new Map([
      ['main.scad', 'cube(1);'],
      ['notes.txt', 'not referenced anywhere'],
      ['a.png', bigDataUrl()],
      ['b.png', bigDataUrl()],
    ])
    const result = filterFilesForMount(files, 'main.scad')
    expect(result.files.has('notes.txt')).toBe(true)
  })

  it('matches references transitively through included files', () => {
    const files = new Map([
      ['main.scad', 'include <helper.scad>\ncube(1);'],
      ['helper.scad', 'import("mesh-a.png");'],
      ['mesh-a.png', bigDataUrl()],
      ['mesh-b.png', bigDataUrl()],
    ])
    const result = filterFilesForMount(files, 'main.scad')
    expect(result.files.has('mesh-a.png')).toBe(true)
    expect(result.files.has('mesh-b.png')).toBe(false)
  })

  it('warns (but keeps files) when referenced content exceeds the budget', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // 14 × 20 MB referenced images ≈ 280 MB > 256 MB budget
    const names = Array.from({ length: 14 }, (_, i) => `img${i}.png`)
    const files = new Map([
      ['main.scad', names.map((n) => `import("${n}");`).join('\n')],
      ...names.map((n) => [n, bigDataUrl()]),
    ])
    const result = filterFilesForMount(files, 'main.scad')
    for (const n of names) expect(result.files.has(n)).toBe(true)
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('mount budget')
    )
  })

  it('is a no-op without a main file or without files', () => {
    expect(filterFilesForMount(null, 'x').dropped).toEqual([])
    const files = new Map([
      ['a.png', bigDataUrl()],
      ['b.png', bigDataUrl()],
    ])
    expect(filterFilesForMount(files, undefined).files).toBe(files)
  })
})
