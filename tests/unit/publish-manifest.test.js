import { describe, it, expect } from 'vitest'
import { buildProjectManifest } from '../../src/js/publish-manifest.js'
import { validateManifest } from '../../src/js/manifest-loader.js'

// The oracle is the loader's own validator. If these two ever drift apart, the
// Publish dialog starts handing out manifests the app refuses to load - which
// is exactly what D-95 was.
const expectValid = (manifest) => {
  const result = validateManifest(manifest)
  expect(result.errors).toEqual([])
  expect(result.valid).toBe(true)
}

const zipProject = () =>
  new Map([
    ['main.scad', ''],
    ['utils/helpers.scad', ''],
    ['modules/lid.scad', ''],
  ])

describe('buildProjectManifest', () => {
  describe('a ZIP project (D-95)', () => {
    const build = () =>
      buildProjectManifest({
        uploadName: 'multi-file-box.zip',
        mainFilePath: 'main.scad',
        projectFiles: zipProject(),
      })

    it('emits a manifest the loader accepts', () => {
      expectValid(build())
    })

    it('names the archive as the bundle, never as files.main', () => {
      const manifest = build()
      expect(manifest.files.bundle).toBe('multi-file-box.zip')
      expect(manifest.files.main).toBe('main.scad')
    })

    it('does not ask the author to host the bundle contents twice', () => {
      const manifest = build()
      expect(manifest.files.companions).toBeUndefined()
      expect(manifest.files.presets).toBeUndefined()
    })

    it('strips the archive extension from the project name', () => {
      expect(build().name).toBe('multi-file-box')
    })

    it('falls back to the archive name when no main path is known', () => {
      // Not valid as a manifest - the point is that the builder does not
      // invent a .scad path it has no evidence for.
      const manifest = buildProjectManifest({
        uploadName: 'multi-file-box.zip',
        mainFilePath: null,
      })
      expect(manifest.files.bundle).toBe('multi-file-box.zip')
      expect(manifest.files.main).toBe('multi-file-box.zip')
    })
  })

  describe('a single .scad project', () => {
    it('emits the same shape it always has', () => {
      const manifest = buildProjectManifest({
        uploadName: 'simple_box.scad',
        mainFilePath: 'simple_box.scad',
      })
      expect(manifest).toEqual({
        forgeManifest: '1.0',
        name: 'simple_box',
        files: { main: 'simple_box.scad' },
        defaults: { autoPreview: true },
      })
      expectValid(manifest)
    })
  })

  describe('a multi-file project that is not a bundle', () => {
    const build = () =>
      buildProjectManifest({
        uploadName: 'box.scad',
        mainFilePath: 'box.scad',
        projectFiles: new Map([
          ['box.scad', ''],
          ['lid.scad', ''],
          ['logo.svg', ''],
          ['presets.json', ''],
        ]),
      })

    it('lists companions and presets, and never the main file', () => {
      const manifest = build()
      expect(manifest.files.main).toBe('box.scad')
      expect(manifest.files.companions).toEqual(['lid.scad', 'logo.svg'])
      expect(manifest.files.presets).toBe('presets.json')
      expectValid(manifest)
    })

    it('excludes the main file by its path, not by the upload name', () => {
      // A folder import's main file carries a relative path; the upload name
      // is only its basename, so matching on the upload name left the main
      // file listed as its own companion.
      const manifest = buildProjectManifest({
        uploadName: 'box.scad',
        mainFilePath: 'src/box.scad',
        projectFiles: new Map([
          ['src/box.scad', ''],
          ['src/lid.scad', ''],
        ]),
      })
      expect(manifest.files.main).toBe('src/box.scad')
      expect(manifest.files.companions).toEqual(['src/lid.scad'])
      expectValid(manifest)
    })

    it('emits an array when there is more than one preset file', () => {
      const manifest = buildProjectManifest({
        uploadName: 'box.scad',
        mainFilePath: 'box.scad',
        projectFiles: new Map([
          ['box.scad', ''],
          ['a.json', ''],
          ['b.json', ''],
        ]),
      })
      expect(manifest.files.presets).toEqual(['a.json', 'b.json'])
      expectValid(manifest)
    })
  })

  describe('defaults', () => {
    it('carries the selected preset but not the placeholder', () => {
      expect(
        buildProjectManifest({
          uploadName: 'box.scad',
          presetName: 'Wide',
        }).defaults.preset
      ).toBe('Wide')
      expect(
        buildProjectManifest({
          uploadName: 'box.scad',
          presetName: 'design default values',
        }).defaults.preset
      ).toBeUndefined()
    })

    it('omits uiMode when the app is in its standard mode', () => {
      const manifest = buildProjectManifest({
        uploadName: 'box.scad',
        uiModePrefs: { defaultMode: 'standard', hiddenPanelsInBasic: [] },
      })
      expect(manifest.defaults.uiMode).toBeUndefined()
    })

    it('omits hiddenPanels when the set matches the registry defaults', () => {
      const manifest = buildProjectManifest({
        uploadName: 'box.scad',
        uiModePrefs: {
          defaultMode: 'simplified',
          hiddenPanelsInBasic: ['console', 'editor'],
        },
        registryHiddenDefaults: ['editor', 'console'],
      })
      expect(manifest.defaults.uiMode).toBe('simplified')
      expect(manifest.defaults.hiddenPanels).toBeUndefined()
    })

    it('emits hiddenPanels when the author changed the set', () => {
      const manifest = buildProjectManifest({
        uploadName: 'box.scad',
        uiModePrefs: {
          defaultMode: 'simplified',
          hiddenPanelsInBasic: ['console'],
        },
        registryHiddenDefaults: ['editor', 'console'],
      })
      expect(manifest.defaults.hiddenPanels).toEqual(['console'])
    })

    it('does not sort the caller\u0027s array', () => {
      const hidden = ['editor', 'console']
      buildProjectManifest({
        uploadName: 'box.scad',
        uiModePrefs: { defaultMode: 'simplified', hiddenPanelsInBasic: hidden },
        registryHiddenDefaults: ['console', 'editor'],
      })
      expect(hidden).toEqual(['editor', 'console'])
    })
  })
})
