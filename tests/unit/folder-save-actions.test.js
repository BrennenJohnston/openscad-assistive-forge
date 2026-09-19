import { describe, it, expect, vi } from 'vitest'
import {
  baseName,
  exportPathFor,
  companionWrites,
  createFolderSaveActions,
} from '../../src/js/folder-save-actions.js'

/** A FolderWriteBack stand-in that records what it was asked to write. */
function fakeWriteBack({ available = true, failOn = [] } = {}) {
  const writes = []
  return {
    writes,
    isAvailable: () => available,
    writeFile: vi.fn(async (path, content) => {
      if (failOn.includes(path)) throw new Error('permission denied')
      writes.push([path, content])
      return { ok: true, path, size: String(content).length }
    }),
  }
}

function harness(options = {}) {
  const {
    enabled = true,
    writeBack = fakeWriteBack(),
    hasWriteBack = true,
  } = options
  const announced = []
  const statuses = []
  const actions = createFolderSaveActions({
    getWriteBack: () => (hasWriteBack ? writeBack : null),
    isEnabled: () => enabled,
    announce: (m) => announced.push(m),
    onStatus: (m, level) => statuses.push([m, level]),
  })
  return { actions, writeBack, announced, statuses }
}

describe('baseName', () => {
  it('keeps a plain name and drops any directory', () => {
    expect(baseName('box.stl')).toBe('box.stl')
    expect(baseName('out/box.stl')).toBe('box.stl')
    expect(baseName('out\\box.stl')).toBe('box.stl')
  })
})

describe('exportPathFor', () => {
  it('puts the export beside the design it came from', () => {
    expect(exportPathFor('src/keyguard.scad', 'keyguard-abc.stl')).toBe(
      'src/keyguard.scad'.replace('keyguard.scad', 'keyguard-abc.stl')
    )
  })

  it('drops to the folder root when the design is at the root', () => {
    expect(exportPathFor('keyguard.scad', 'keyguard-abc.stl')).toBe(
      'keyguard-abc.stl'
    )
  })

  it('drops to the root when there is no design path at all', () => {
    expect(exportPathFor(null, 'thing.stl')).toBe('thing.stl')
  })

  it('never lets a download name carry a directory of its own', () => {
    // A filename is not a path, and a save action must not be a way to write
    // outside the folder the person connected.
    expect(exportPathFor('src/a.scad', '../../evil.stl')).toBe('src/evil.stl')
  })
})

describe('companionWrites', () => {
  const files = () =>
    new Map([
      ['main.scad', 'cube();'],
      ['openings.txt', 'a,b'],
      ['logo.svg', '<svg/>'],
    ])

  it('writes every file except the main design', () => {
    // Forge is not the editor of record for the design in this loop, and
    // overwriting it is how a shared folder turns into an argument.
    expect(companionWrites(files(), 'main.scad')).toEqual([
      ['openings.txt', 'a,b'],
      ['logo.svg', '<svg/>'],
    ])
  })

  it('writes everything when no main file is known', () => {
    expect(companionWrites(files(), null)).toHaveLength(3)
  })

  it('has nothing to write for an empty or absent project', () => {
    expect(companionWrites(null, 'main.scad')).toEqual([])
    expect(companionWrites(new Map(), 'main.scad')).toEqual([])
  })
})

describe('canSave', () => {
  it('is false while the flag is dark, even with a folder connected', () => {
    const { actions } = harness({ enabled: false })
    expect(actions.canSave()).toBe(false)
  })

  it('is false with the flag lit but no folder connected', () => {
    const { actions } = harness({
      writeBack: fakeWriteBack({ available: false }),
    })
    expect(actions.canSave()).toBe(false)
  })

  it('is false on a browser with no write-back at all', () => {
    const { actions } = harness({ hasWriteBack: false })
    expect(actions.canSave()).toBe(false)
  })

  it('is true only when all three hold', () => {
    const { actions } = harness()
    expect(actions.canSave()).toBe(true)
  })
})

describe('saveExport', () => {
  it('writes the bytes it was given, beside the design, and says so', async () => {
    const { actions, writeBack, announced, statuses } = harness()
    const result = await actions.saveExport({
      fileName: 'keyguard-abc.stl',
      data: 'BYTES',
      mainFilePath: 'src/keyguard.scad',
    })

    expect(result).toEqual({ ok: true, path: 'src/keyguard-abc.stl' })
    // Through FolderWriteBack, never around it: that is what keeps the
    // watcher from seeing our own write as somebody else's change.
    expect(writeBack.writeFile).toHaveBeenCalledWith(
      'src/keyguard-abc.stl',
      'BYTES'
    )
    expect(announced).toEqual([
      'Saved src/keyguard-abc.stl to the connected folder.',
    ])
    expect(statuses[0][1]).toBe('success')
  })

  it('refuses rather than writing when it cannot save', async () => {
    const { actions, writeBack } = harness({ enabled: false })
    const result = await actions.saveExport({
      fileName: 'a.stl',
      data: 'B',
    })
    expect(result.ok).toBe(false)
    expect(writeBack.writeFile).not.toHaveBeenCalled()
  })

  it('surfaces a failure instead of swallowing it', async () => {
    const { actions, announced, statuses } = harness({
      writeBack: fakeWriteBack({ failOn: ['a.stl'] }),
    })
    const result = await actions.saveExport({ fileName: 'a.stl', data: 'B' })

    expect(result.ok).toBe(false)
    expect(result.error).toBe('permission denied')
    expect(announced[0]).toMatch(/Could not save a\.stl/)
    expect(statuses[0][1]).toBe('warning')
  })
})

describe('saveCompanions', () => {
  const projectFiles = () =>
    new Map([
      ['main.scad', 'cube();'],
      ['openings.txt', 'a,b'],
      ['logo.svg', '<svg/>'],
    ])

  it('writes the companions and leaves the design alone', async () => {
    const { actions, writeBack, announced } = harness()
    const result = await actions.saveCompanions({
      projectFiles: projectFiles(),
      mainFilePath: 'main.scad',
    })

    expect(result.ok).toBe(true)
    expect(result.written).toEqual(['openings.txt', 'logo.svg'])
    expect(writeBack.writes.map(([p]) => p)).not.toContain('main.scad')
    // One announcement for the batch: per-file would flood the live region.
    expect(announced).toHaveLength(1)
    expect(announced[0]).toBe(
      'Saved 2 companion files to the connected folder.'
    )
  })

  it('names the single file when there is only one', async () => {
    const { actions, announced } = harness()
    await actions.saveCompanions({
      projectFiles: new Map([
        ['main.scad', 'cube();'],
        ['openings.txt', 'a,b'],
      ]),
      mainFilePath: 'main.scad',
    })
    expect(announced[0]).toBe('Saved openings.txt to the connected folder.')
  })

  it('reports which files could not be written, and still writes the rest', async () => {
    const { actions, announced } = harness({
      writeBack: fakeWriteBack({ failOn: ['logo.svg'] }),
    })
    const result = await actions.saveCompanions({
      projectFiles: projectFiles(),
      mainFilePath: 'main.scad',
    })

    expect(result.ok).toBe(false)
    expect(result.written).toEqual(['openings.txt'])
    expect(result.failed).toEqual(['logo.svg'])
    expect(announced[0]).toMatch(/1 could not be written: logo\.svg/)
  })

  it('says so plainly when there is nothing to save', async () => {
    const { actions, announced } = harness()
    const result = await actions.saveCompanions({
      projectFiles: new Map([['main.scad', 'cube();']]),
      mainFilePath: 'main.scad',
    })
    expect(result.ok).toBe(true)
    expect(result.written).toEqual([])
    expect(announced[0]).toBe('There are no companion files to save.')
  })

  it('writes nothing at all while the flag is dark', async () => {
    const { actions, writeBack } = harness({ enabled: false })
    const result = await actions.saveCompanions({
      projectFiles: projectFiles(),
      mainFilePath: 'main.scad',
    })
    expect(result.ok).toBe(false)
    expect(writeBack.writeFile).not.toHaveBeenCalled()
  })
})
