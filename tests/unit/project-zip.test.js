import { describe, it, expect } from 'vitest'
import {
  buildProvenance,
  buildProjectZipEntries,
  decodeProjectFileValue,
  MANIFEST_FILE_NAME,
  PROVENANCE_FILE_NAME,
} from '../../src/js/project-zip.js'
import { buildProjectManifest } from '../../src/js/publish-manifest.js'

const AT = '2026-08-24T22:16:15.999Z'

describe('buildProvenance', () => {
  it('records where the design came from', () => {
    const record = buildProvenance({
      manifestUrl: 'https://raw.githubusercontent.com/u/r/main/forge-manifest.json',
      projectName: 'keyguard',
      author: 'Someone',
      appVersion: '4.5.0',
      presetName: 'Wide',
      parameters: { width: 66 },
      generatedAt: AT,
    })

    expect(record).toEqual({
      forgeProvenance: '1.0',
      generatedAt: AT,
      appVersion: '4.5.0',
      project: 'keyguard',
      manifest: 'https://raw.githubusercontent.com/u/r/main/forge-manifest.json',
      preset: 'Wide',
      parameters: { width: 66 },
      author: 'Someone',
    })
  })

  it('says null rather than guessing when a project did not come from a link', () => {
    const record = buildProvenance({ generatedAt: AT })
    expect(record.manifest).toBeNull()
    expect(record.preset).toBeNull()
    expect(record.project).toBeNull()
    expect(record.parameters).toEqual({})
    expect('author' in record).toBe(false)
  })

  it('does not record the placeholder preset name as a preset', () => {
    const record = buildProvenance({
      presetName: 'design default values',
      generatedAt: AT,
    })
    expect(record.preset).toBeNull()
  })

  it('copies the parameters rather than holding the object it was given', () => {
    const parameters = { width: 66 }
    const record = buildProvenance({ parameters, generatedAt: AT })
    parameters.width = 1
    expect(record.parameters).toEqual({ width: 66 })
  })
})

describe('decodeProjectFileValue', () => {
  it('unwraps a base64 data URL so a picture arrives as a picture', () => {
    expect(decodeProjectFileValue('data:image/png;base64,AAAB')).toEqual({
      content: 'AAAB',
      base64: true,
    })
  })

  it('leaves text alone', () => {
    expect(decodeProjectFileValue('cube([1,1,1]);')).toEqual({
      content: 'cube([1,1,1]);',
      base64: false,
    })
  })

  it('leaves a data URL that is not base64 alone', () => {
    expect(decodeProjectFileValue('data:text/plain,hello')).toEqual({
      content: 'data:text/plain,hello',
      base64: false,
    })
  })
})

describe('buildProjectZipEntries', () => {
  const manifest = { forgeManifest: '1.0', files: { main: 'main.scad' } }
  const provenance = { forgeProvenance: '1.0', generatedAt: AT }

  it('carries every project file, plus the manifest and the provenance', () => {
    const entries = buildProjectZipEntries({
      projectFiles: new Map([
        ['main.scad', 'cube();'],
        ['utils/helpers.scad', 'module h() {}'],
        ['logo.png', 'data:image/png;base64,AAAB'],
      ]),
      manifest,
      provenance,
    })

    expect(entries.map((e) => e.path)).toEqual([
      'main.scad',
      'utils/helpers.scad',
      'logo.png',
      MANIFEST_FILE_NAME,
      PROVENANCE_FILE_NAME,
    ])
    expect(entries.find((e) => e.path === 'logo.png')).toEqual({
      path: 'logo.png',
      content: 'AAAB',
      base64: true,
    })
  })

  it('falls back to the single main file when there is no project map', () => {
    const entries = buildProjectZipEntries({
      projectFiles: null,
      mainFilePath: 'box.scad',
      mainContent: 'cube();',
      manifest,
      provenance,
    })
    expect(entries.map((e) => e.path)).toEqual([
      'box.scad',
      MANIFEST_FILE_NAME,
      PROVENANCE_FILE_NAME,
    ])
  })

  it('still writes the manifest and provenance when there is no content at all', () => {
    const entries = buildProjectZipEntries({ manifest, provenance })
    expect(entries.map((e) => e.path)).toEqual([
      MANIFEST_FILE_NAME,
      PROVENANCE_FILE_NAME,
    ])
  })

  it('writes readable JSON, not a single line', () => {
    const entries = buildProjectZipEntries({ manifest, provenance })
    const written = entries.find((e) => e.path === MANIFEST_FILE_NAME)
    expect(written.content).toContain('\n')
    expect(JSON.parse(written.content)).toEqual(manifest)
  })
})

describe('the archive describes itself as unpacked', () => {
  it('a ZIP project exports a loose-file manifest, never a bundle pointing at itself', () => {
    // The archive ships the project unpacked beside its manifest. A manifest
    // saying files.bundle would name an archive that is not in there.
    const packed = buildProjectManifest({
      uploadName: 'multi-file-box.zip',
      mainFilePath: 'main.scad',
      projectFiles: new Map([
        ['main.scad', ''],
        ['utils/helpers.scad', ''],
      ]),
      asBundle: false,
    })
    expect(packed.files.bundle).toBeUndefined()
    expect(packed.files.main).toBe('main.scad')
    expect(packed.files.companions).toEqual(['utils/helpers.scad'])
  })
})
