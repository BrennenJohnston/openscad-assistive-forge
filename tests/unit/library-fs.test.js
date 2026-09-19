/**
 * UF-24 — a library bundle's files must ALL reach the virtual filesystem.
 *
 * Measured on the release base with the four shipped bundles: MCAD lost 5 of
 * 42 files, BOSL2 9 of 67, NopSCADlib 380 of 389 and dotSCAD 692 of 695. The
 * losses were exactly (files in subfolders) minus (number of subfolders) in
 * every case, because each bundle file created its own folders and only the
 * first file in a folder found that folder missing.
 *
 * The fake FS below is the important part: Emscripten's FS.ErrnoError carries
 * `errno`, NOT the Node-style `code` an EEXIST check looks for, so a guard
 * written as `if (error.code !== 'EEXIST') throw` rethrows every time.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { ensureLibraryDir, writeLibraryFile } from '../../src/worker/library-fs.js'

/** Minimal stand-in for the Emscripten FS, with its error shape. */
function makeFakeFS() {
  const folders = new Set(['/'])
  const files = new Map()

  const errnoError = (message) => {
    // Deliberately NOT a Node error: no `code` property, just `errno`.
    const err = new Error(message)
    err.name = 'ErrnoError'
    err.errno = 20 // Emscripten's EEXIST
    return err
  }

  return {
    folders,
    files,
    analyzePath(path) {
      if (folders.has(path)) return { exists: true, object: { isFolder: true } }
      if (files.has(path)) return { exists: true, object: { isFolder: false } }
      return { exists: false, object: null }
    },
    mkdir(path) {
      if (folders.has(path) || files.has(path)) {
        throw errnoError(`File exists: ${path}`)
      }
      folders.add(path)
    },
    writeFile(path, content) {
      files.set(path, content)
    },
  }
}

/** The shape that broke: several files sharing one folder, and a nested one. */
const BUNDLE_FILES = [
  'core.scad',
  'lib.scad',
  'utils/core/core.scad',
  'utils/core/bom.scad',
  'utils/core/rounded_rectangle.scad',
  'vitamins/screw.scad',
  'vitamins/nut.scad',
]

describe('library-fs', () => {
  let FS

  beforeEach(() => {
    FS = makeFakeFS()
  })

  describe('writeLibraryFile', () => {
    it('writes every file of a bundle, not just the first in each folder', () => {
      for (const file of BUNDLE_FILES) {
        writeLibraryFile(FS, '/libraries/NopSCADlib', file, `// ${file}`)
      }

      const written = [...FS.files.keys()].sort()
      expect(written).toEqual(
        BUNDLE_FILES.map((f) => `/libraries/NopSCADlib/${f}`).sort()
      )
    })

    it('creates folders nested more than one level deep', () => {
      writeLibraryFile(FS, '/libraries/dotSCAD', 'src/util/sum.scad', '// sum')

      expect(FS.folders.has('/libraries/dotSCAD/src')).toBe(true)
      expect(FS.folders.has('/libraries/dotSCAD/src/util')).toBe(true)
      expect(FS.files.get('/libraries/dotSCAD/src/util/sum.scad')).toBe('// sum')
    })

    it('returns the absolute path it wrote', () => {
      const written = writeLibraryFile(
        FS,
        '/libraries/BOSL2',
        'std.scad',
        '// std'
      )
      expect(written).toBe('/libraries/BOSL2/std.scad')
    })

    it('does not choke on a bundle whose files are all top level', () => {
      for (const file of ['a.scad', 'b.scad', 'c.scad']) {
        writeLibraryFile(FS, '/libraries/MCAD', file, `// ${file}`)
      }
      expect(FS.files.size).toBe(3)
    })
  })

  describe('ensureLibraryDir', () => {
    it('creates every missing segment', () => {
      ensureLibraryDir(FS, '/libraries/NopSCADlib/utils/core')

      expect(FS.folders.has('/libraries')).toBe(true)
      expect(FS.folders.has('/libraries/NopSCADlib')).toBe(true)
      expect(FS.folders.has('/libraries/NopSCADlib/utils')).toBe(true)
      expect(FS.folders.has('/libraries/NopSCADlib/utils/core')).toBe(true)
    })

    it('is safe to call again for a folder that already exists', () => {
      ensureLibraryDir(FS, '/libraries/MCAD/bitmap')
      expect(() =>
        ensureLibraryDir(FS, '/libraries/MCAD/bitmap')
      ).not.toThrow()
      expect(FS.folders.has('/libraries/MCAD/bitmap')).toBe(true)
    })

    it('refuses to treat an existing file as a folder', () => {
      FS.writeFile('/libraries/MCAD', 'not a folder')

      expect(() => ensureLibraryDir(FS, '/libraries/MCAD/bitmap')).toThrow(
        /not directory/
      )
    })
  })
})
