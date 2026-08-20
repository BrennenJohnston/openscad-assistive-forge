import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { unpackLibraryArchive } from '../../src/worker/lib-archive.js'

describe('unpackLibraryArchive (AF-12)', () => {
  it('returns every file with its path and text, skipping directory entries', async () => {
    const zip = new JSZip()
    zip.file('top.scad', 'module top() {}')
    zip.folder('sub')
    zip.file('sub/nested.scad', 'module nested() {}')
    const buffer = await zip.generateAsync({ type: 'arraybuffer' })

    const entries = await unpackLibraryArchive(buffer)
    const byPath = Object.fromEntries(entries.map((e) => [e.path, e.text]))

    expect(Object.keys(byPath).sort()).toEqual(['sub/nested.scad', 'top.scad'])
    expect(byPath['top.scad']).toBe('module top() {}')
    expect(byPath['sub/nested.scad']).toBe('module nested() {}')
  })

  it('rejects on bytes that are not a zip - the caller falls back per-file', async () => {
    const garbage = new TextEncoder().encode('not a zip at all').buffer
    await expect(unpackLibraryArchive(garbage)).rejects.toThrow()
  })
})
