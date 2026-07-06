/**
 * Unit tests for the manifest generation logic in cli/commands/manifest.js
 *
 * Covers: main file detection heuristics, preset file detection,
 * manifest output shape (uncompressed and zip bundle modes).
 *
 * Imports the real exported helpers — no mirrored copies — so these tests
 * fail when the CLI logic changes.
 */

import { describe, it, expect } from 'vitest'
import {
  detectMainFile,
  looksLikePresetFile,
  buildManifest,
} from '../../cli/commands/manifest.js'

// ---------------------------------------------------------------------------
// detectMainFile
// ---------------------------------------------------------------------------

describe('detectMainFile', () => {
  it('returns null for empty list', () => {
    expect(detectMainFile([])).toBeNull()
  })

  it('returns the only file when list has one entry', () => {
    expect(detectMainFile(['design.scad'])).toBe('design.scad')
  })

  it('prefers main.scad by exact name', () => {
    expect(detectMainFile(['helper.scad', 'main.scad', 'util.scad'])).toBe('main.scad')
  })

  it('prefers a file with "main" in the basename', () => {
    expect(detectMainFile(['alpha.scad', 'main_design.scad'])).toBe('main_design.scad')
  })

  it('prefers a single root-level file over nested ones', () => {
    expect(detectMainFile(['subfolder/deep.scad', 'root.scad'])).toBe('root.scad')
  })

  it('prefers file with Customizer annotations when multiple root files exist', () => {
    const content = new Map([
      ['alpha.scad', '// just a comment'],
      ['beta.scad', '/* [Dimensions] */\nwidth = 10; // [5:50]'],
    ])
    expect(detectMainFile(['alpha.scad', 'beta.scad'], content)).toBe('beta.scad')
  })

  it('falls back to alphabetical order', () => {
    expect(detectMainFile(['zebra.scad', 'apple.scad'])).toBe('apple.scad')
  })
})

// ---------------------------------------------------------------------------
// looksLikePresetFile
// ---------------------------------------------------------------------------

describe('looksLikePresetFile', () => {
  it('detects presets by filename hint', () => {
    expect(looksLikePresetFile('my_presets.json')).toBe(true)
    expect(looksLikePresetFile('parameters.json')).toBe(true)
    expect(looksLikePresetFile('config.json')).toBe(true)
  })

  it('returns false for plain json without hints', () => {
    expect(looksLikePresetFile('data.json')).toBe(false)
  })

  it('detects preset files by content key "parameterSets"', () => {
    const content = JSON.stringify({ parameterSets: { 'Box Small': { w: 10 } } })
    expect(looksLikePresetFile('data.json', content)).toBe(true)
  })

  it('detects preset files by content key "presets"', () => {
    const content = JSON.stringify({ presets: [{ name: 'A', values: {} }] })
    expect(looksLikePresetFile('data.json', content)).toBe(true)
  })

  it('returns false for invalid JSON content', () => {
    expect(looksLikePresetFile('data.json', '{not json}')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// buildManifest — uncompressed mode
// ---------------------------------------------------------------------------

describe('buildManifest — uncompressed mode', () => {
  it('generates a minimal manifest from a single .scad file', () => {
    const { manifest, mainFile } = buildManifest({
      allFiles: ['design.scad'],
      name: 'Test Project',
      author: 'Alice',
      zipMode: false,
    })
    expect(manifest.forgeManifest).toBe('1.0')
    expect(manifest.name).toBe('Test Project')
    expect(manifest.author).toBe('Alice')
    expect(manifest.files.main).toBe('design.scad')
    expect(mainFile).toBe('design.scad')
    expect(manifest.files.bundle).toBeUndefined()
  })

  it('includes companion files and presets', () => {
    const { manifest } = buildManifest({
      allFiles: ['design.scad', 'openings.txt', 'my_presets.json'],
      zipMode: false,
    })
    expect(manifest.files.companions).toContain('openings.txt')
    expect(manifest.files.presets).toBe('my_presets.json')
  })

  it('puts non-main .scad files in companions', () => {
    const { manifest } = buildManifest({
      allFiles: ['main.scad', 'helper.scad'],
      zipMode: false,
    })
    expect(manifest.files.main).toBe('main.scad')
    expect(manifest.files.companions).toContain('helper.scad')
  })

  it('handles multiple preset files as an array', () => {
    const { manifest } = buildManifest({
      allFiles: ['design.scad', 'presets_a.json', 'presets_b.json'],
      zipMode: false,
    })
    expect(Array.isArray(manifest.files.presets)).toBe(true)
    expect(manifest.files.presets).toHaveLength(2)
  })

  it('produces a warning when no .scad files are present', () => {
    const { warnings } = buildManifest({ allFiles: ['readme.txt'], zipMode: false })
    expect(warnings.length).toBeGreaterThan(0)
  })

  it('omits author field when not provided', () => {
    const { manifest } = buildManifest({
      allFiles: ['design.scad'],
      zipMode: false,
    })
    expect('author' in manifest).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// buildManifest — zip bundle mode
// ---------------------------------------------------------------------------

describe('buildManifest — zip bundle mode', () => {
  it('generates a bundle manifest with files.bundle set', () => {
    const { manifest } = buildManifest({
      allFiles: ['design.scad', 'helper.txt'],
      zipMode: true,
      zipName: 'project.zip',
      name: 'Bundle Project',
    })
    expect(manifest.files.bundle).toBe('project.zip')
    expect(manifest.files.main).toBe('design.scad')
    expect(manifest.files.companions).toBeUndefined()
    expect(manifest.files.presets).toBeUndefined()
  })

  it('uses the zip filename as default project name', () => {
    const { manifest } = buildManifest({
      allFiles: ['design.scad'],
      zipMode: true,
      zipName: 'my_cool_project.zip',
    })
    expect(manifest.name).toBe('my_cool_project')
  })

  it('does not include files.main in bundle manifest when no scad files found', () => {
    const { manifest, warnings } = buildManifest({
      allFiles: ['readme.txt'],
      zipMode: true,
      zipName: 'project.zip',
    })
    expect(manifest.files.main).toBeUndefined()
    expect(warnings.length).toBeGreaterThan(0)
  })
})
