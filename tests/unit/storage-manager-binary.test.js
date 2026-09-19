import { describe, it, expect, vi, afterEach } from 'vitest'
import { readProjectFilesFromList } from '../../src/js/storage-manager.js'

afterEach(() => {
  vi.restoreAllMocks()
})

// B16 regression guard: File.text() never throws on binary input — it
// lossily decodes as UTF-8 — so the old read-everything-as-text import
// silently corrupted every .png/.stl companion. Binary companions must
// round-trip byte-identically (images as data URLs, matching the zip
// import path) or be skipped, never stored as garbage text.

function makeFile(name, relPath, content) {
  const bytes =
    typeof content === 'string' ? new TextEncoder().encode(content) : content
  const file = new File([bytes], name)
  Object.defineProperty(file, 'webkitRelativePath', { value: relPath })
  // jsdom's File lacks text()/arrayBuffer(); emulate real Blob semantics
  // (text() lossily UTF-8-decodes binary — exactly the hazard under test).
  file.text = async () => new TextDecoder().decode(bytes)
  file.arrayBuffer = async () =>
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  return file
}

// Bytes that UTF-8 decoding destroys: 0x00, lone continuation bytes, 0xFF.
const BINARY_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0x80, 0x81, 0xfe, 0x0d, 0x0a, 0x1a,
])

describe('readProjectFilesFromList — binary safety', () => {
  const scad = 'cube(10);\n'

  it('stores text companions as strings', async () => {
    const files = [
      makeFile('main.scad', 'proj/main.scad', scad),
      makeFile('openings.txt', 'proj/openings.txt', 'add opening 1 2 3'),
      makeFile('shape.svg', 'proj/shape.svg', '<svg></svg>'),
    ]
    const result = await readProjectFilesFromList(files, 'proj/main.scad')
    expect(result.projectFiles['main.scad']).toBe(scad)
    expect(result.projectFiles['openings.txt']).toBe('add opening 1 2 3')
    expect(result.projectFiles['shape.svg']).toBe('<svg></svg>')
  })

  it('stores images as byte-identical base64 data URLs', async () => {
    const files = [
      makeFile('main.scad', 'proj/main.scad', scad),
      makeFile('screenshot.png', 'proj/screenshot.png', BINARY_BYTES),
    ]
    const result = await readProjectFilesFromList(files, 'proj/main.scad')
    const stored = result.projectFiles['screenshot.png']

    expect(stored).toMatch(/^data:image\/png;base64,/)
    const decoded = Uint8Array.from(
      atob(stored.split(',')[1]),
      (c) => c.charCodeAt(0)
    )
    expect(Array.from(decoded)).toEqual(Array.from(BINARY_BYTES))
  })

  it('uses the jpeg MIME type for .jpg files', async () => {
    const files = [
      makeFile('main.scad', 'proj/main.scad', scad),
      makeFile('photo.jpg', 'proj/photo.jpg', BINARY_BYTES),
    ]
    const result = await readProjectFilesFromList(files, 'proj/main.scad')
    expect(result.projectFiles['photo.jpg']).toMatch(/^data:image\/jpeg;base64,/)
  })

  it('skips .stl companions instead of storing corrupted text', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const files = [
      makeFile('main.scad', 'proj/main.scad', scad),
      makeFile('mesh.stl', 'proj/mesh.stl', BINARY_BYTES),
    ]
    const result = await readProjectFilesFromList(files, 'proj/main.scad')
    expect(result.projectFiles['mesh.stl']).toBeUndefined()
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('mesh.stl')
    )
  })

  it('skips hidden files and unknown extensions', async () => {
    const files = [
      makeFile('main.scad', 'proj/main.scad', scad),
      makeFile('.DS_Store', 'proj/.DS_Store', BINARY_BYTES),
      makeFile('notes.docx', 'proj/notes.docx', BINARY_BYTES),
    ]
    const result = await readProjectFilesFromList(files, 'proj/main.scad')
    expect(Object.keys(result.projectFiles)).toEqual(['main.scad'])
  })

  it('throws when the main file is missing', async () => {
    await expect(
      readProjectFilesFromList([], 'proj/main.scad')
    ).rejects.toThrow(/Main file not found/)
  })
})
