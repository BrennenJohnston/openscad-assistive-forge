import { describe, it, expect } from 'vitest'
import {
  DROP_KIND,
  classifyDrop,
  describeAccepted,
  acceptAttribute,
} from '../../src/js/upload-router.js'

function fakeFile(name) {
  return new File(['x'], name)
}

// DataTransferItem-shaped mock (jsdom has no real DataTransferItem in drops)
function fakeItem({ file = null, directory = null } = {}) {
  return {
    kind: 'file',
    webkitGetAsEntry: () =>
      directory ? { isDirectory: true, name: directory } : file ? { isDirectory: false } : null,
    getAsFile: () => file,
  }
}

describe('classifyDrop — single files by extension', () => {
  const cases = [
    ['model.scad', DROP_KIND.SCAD],
    ['Project.SCAD', DROP_KIND.SCAD],
    ['bundle.zip', DROP_KIND.ZIP],
    ['mesh.stl', DROP_KIND.STL],
    ['presets.json', DROP_KIND.PRESET_JSON],
    ['notes.docx', DROP_KIND.UNSUPPORTED],
    ['no-extension', DROP_KIND.UNSUPPORTED],
  ]
  for (const [name, kind] of cases) {
    it(`classifies ${name} as ${kind}`, () => {
      const result = classifyDrop([fakeFile(name)])
      expect(result.kind).toBe(kind)
      expect(result.files).toHaveLength(1)
    })
  }
})

describe('classifyDrop — folders and multi-file drops', () => {
  it('classifies a directory drop as FOLDER with its entries', () => {
    const result = classifyDrop([fakeItem({ directory: 'my-project' })])
    expect(result.kind).toBe(DROP_KIND.FOLDER)
    expect(result.directoryEntries).toHaveLength(1)
    expect(result.files).toHaveLength(0)
  })

  it('prefers FOLDER when a directory is dropped alongside files', () => {
    const result = classifyDrop([
      fakeItem({ directory: 'proj' }),
      fakeItem({ file: fakeFile('stray.scad') }),
    ])
    expect(result.kind).toBe(DROP_KIND.FOLDER)
  })

  it('classifies multiple loose files with a .scad as MULTI', () => {
    const result = classifyDrop([
      fakeFile('main.scad'),
      fakeFile('openings.txt'),
      fakeFile('default.svg'),
    ])
    expect(result.kind).toBe(DROP_KIND.MULTI)
    expect(result.files).toHaveLength(3)
  })

  it('classifies multiple loose files without a .scad as UNSUPPORTED', () => {
    const result = classifyDrop([fakeFile('a.txt'), fakeFile('b.png')])
    expect(result.kind).toBe(DROP_KIND.UNSUPPORTED)
  })

  it('classifies an empty drop as UNSUPPORTED', () => {
    expect(classifyDrop([]).kind).toBe(DROP_KIND.UNSUPPORTED)
    expect(classifyDrop(null).kind).toBe(DROP_KIND.UNSUPPORTED)
  })

  it('unwraps DataTransferItem-shaped file entries', () => {
    const result = classifyDrop([fakeItem({ file: fakeFile('box.scad') })])
    expect(result.kind).toBe(DROP_KIND.SCAD)
    expect(result.files[0].name).toBe('box.scad')
  })
})

describe('accepted-types copy', () => {
  it('lists every supported kind in the user-facing copy', () => {
    const copy = describeAccepted()
    for (const needle of ['.scad', '.zip', 'folder', '.stl', '.json']) {
      expect(copy).toContain(needle)
    }
  })

  it('accept attribute covers the pickable extensions', () => {
    expect(acceptAttribute()).toBe('.scad,.zip,.stl,.json')
  })
})
