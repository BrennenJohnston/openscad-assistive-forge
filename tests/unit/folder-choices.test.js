/**
 * Unit tests for choosing a project in a folder: every .scad is offered,
 * grouped by folder, and a name with two dots in it is a name, not a way
 * out of the folder.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, vi } from 'vitest'
import JSZip from 'jszip'
import { groupScadChoices } from '../../src/js/file-handler.js'
import { hasParentSegment } from '../../src/js/file-param-resolver.js'
import { extractZipFiles } from '../../src/js/zip-handler.js'

describe('the main-file choices for a folder', () => {
  const paths = [
    'models/robot/main.scad',
    'models/notes.scad',
    'models/lamp/main.scad',
    'models/extra.scad',
    'models/lamp/shade..scad',
  ]

  it('offers every .scad, the folder itself first, then each subfolder', () => {
    expect(groupScadChoices(paths, 'models')).toEqual([
      { folder: '', paths: ['models/extra.scad', 'models/notes.scad'] },
      {
        folder: 'lamp',
        paths: ['models/lamp/main.scad', 'models/lamp/shade..scad'],
      },
      { folder: 'robot', paths: ['models/robot/main.scad'] },
    ])
  })

  it('keeps two files with one name apart by their folder', () => {
    const groups = groupScadChoices(paths, 'models')
    const mains = groups.flatMap((g) =>
      g.paths.filter((p) => p.endsWith('/main.scad')).map(() => g.folder)
    )
    expect(mains).toEqual(['lamp', 'robot'])
  })
})

describe('a path that climbs out of its folder', () => {
  it.each(['../evil.scad', 'parts/../../evil.scad', 'parts\\..\\evil.scad', '..'])(
    '%s is refused',
    (path) => {
      expect(hasParentSegment(path)).toBe(true)
    }
  )

  it.each(['puzzle_V2..scad', 'lamp/shade..scad', 'a/..b/c.scad', 'notes...txt'])(
    '%s is only a name',
    (path) => {
      expect(hasParentSegment(path)).toBe(false)
    }
  )
})

describe('a ZIP with two dots in a file name', () => {
  // JSZip resolves a stored "../" itself when it reads an archive, so the
  // reader's own guard is a second line; hasParentSegment is tested above.
  it('keeps the file, and no extracted path climbs out', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const zip = new JSZip()
    zip.file('main.scad', 'include <shade..scad>\nshade();')
    zip.file('shade..scad', 'module shade() cube(1);')
    zip.file('../evil.scad', 'cube(1);')
    const result = await extractZipFiles(
      await zip.generateAsync({ type: 'blob' })
    )
    expect(result.files.has('shade..scad')).toBe(true)
    expect([...result.files.keys()].some(hasParentSegment)).toBe(false)
    vi.restoreAllMocks()
  })
})
