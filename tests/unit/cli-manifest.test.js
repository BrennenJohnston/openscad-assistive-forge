/**
 * Unit tests for the manifest generation logic used by cli/commands/manifest.js
 *
 * Covers: main file detection heuristics, preset file detection,
 * manifest output shape (uncompressed and zip bundle modes).
 *
 * These tests mirror the pure helper functions from the CLI command so they
 * can run without touching the filesystem or spawning a process.
 */

import { describe, it, expect } from 'vitest'

// Re-implement the pure logic that the CLI exercises so we can unit-test it
// without spawning a process. Keep these mirrors in sync with manifest.js.

const COMPANION_EXTS = new Set(['.txt', '.svg', '.csv', '.dxf'])
const PRESET_EXT = '.json'
const PRESET_NAME_HINTS = ['preset', 'presets', 'params', 'parameters', 'config']

function detectMainFilePure(scadFiles, contentMap = new Map()) {
  if (scadFiles.length === 0) return null
  if (scadFiles.length === 1) return scadFiles[0]

  const mainScad = scadFiles.find(
    (p) => p.toLowerCase() === 'main.scad' || p.toLowerCase().endsWith('/main.scad')
  )
  if (mainScad) return mainScad

  const mainNamed = scadFiles.find((p) =>
    p.split('/').pop().toLowerCase().includes('main')
  )
  if (mainNamed) return mainNamed

  const rootFiles = scadFiles.filter((p) => !p.includes('/'))
  if (rootFiles.length === 1) return rootFiles[0]

  const candidates = rootFiles.length > 0 ? rootFiles : scadFiles
  for (const p of candidates) {
    const content = contentMap.get(p)
    if (content && /\/\*\s*\[.*?\]\s*\*\//.test(content)) return p
  }

  return rootFiles.length > 0 ? rootFiles.sort()[0] : scadFiles.sort()[0]
}

function looksLikePresetFilePure(filePath, content) {
  const name = filePath.split('/').pop().replace(/\.json$/i, '').toLowerCase()
  if (PRESET_NAME_HINTS.some((hint) => name.includes(hint))) return true
  if (content) {
    try {
      const parsed = JSON.parse(content)
      if (parsed && (parsed.parameterSets || parsed.presets)) return true
    } catch { /* not a preset */ }
  }
  return false
}

function buildManifestPure({ allFiles, contentMap = new Map(), name, author, zipMode, zipName }) {
  const warnings = []
  const scadFiles = allFiles.filter((f) => f.toLowerCase().endsWith('.scad'))
  const jsonFiles = allFiles.filter((f) => f.toLowerCase().endsWith(PRESET_EXT))
  const companionFiles = allFiles.filter((f) => {
    const ext = f.toLowerCase().match(/(\.[^./\\]+)$/)?.[1]
    return ext && COMPANION_EXTS.has(ext)
  })

  const mainFile = detectMainFilePure(scadFiles, contentMap)

  if (!mainFile) warnings.push('No .scad files found')

  const presetFiles = jsonFiles.filter((f) => looksLikePresetFilePure(f, contentMap.get(f)))

  const manifest = {
    forgeManifest: '1.0',
    name: name || (zipName ? zipName.replace(/\.zip$/i, '') : 'My Project'),
    files: {},
  }

  if (author) manifest.author = author

  if (zipMode && zipName) {
    manifest.files.bundle = zipName
    if (mainFile) manifest.files.main = mainFile
  } else {
    if (mainFile) manifest.files.main = mainFile

    const otherScad = scadFiles.filter((f) => f !== mainFile)
    if (companionFiles.length > 0 || otherScad.length > 0) {
      manifest.files.companions = [...otherScad, ...companionFiles]
    }

    if (presetFiles.length === 1) manifest.files.presets = presetFiles[0]
    else if (presetFiles.length > 1) manifest.files.presets = presetFiles
  }

  return { manifest, mainFile, warnings }
}

// ---------------------------------------------------------------------------
// detectMainFilePure
// ---------------------------------------------------------------------------

describe('detectMainFilePure', () => {
  it('returns null for empty list', () => {
    expect(detectMainFilePure([])).toBeNull()
  })

  it('returns the only file when list has one entry', () => {
    expect(detectMainFilePure(['design.scad'])).toBe('design.scad')
  })

  it('prefers main.scad by exact name', () => {
    expect(detectMainFilePure(['helper.scad', 'main.scad', 'util.scad'])).toBe('main.scad')
  })

  it('prefers a file with "main" in the basename', () => {
    expect(detectMainFilePure(['alpha.scad', 'main_design.scad'])).toBe('main_design.scad')
  })

  it('prefers a single root-level file over nested ones', () => {
    expect(detectMainFilePure(['subfolder/deep.scad', 'root.scad'])).toBe('root.scad')
  })

  it('prefers file with Customizer annotations when multiple root files exist', () => {
    const content = new Map([
      ['alpha.scad', '// just a comment'],
      ['beta.scad', '/* [Dimensions] */\nwidth = 10; // [5:50]'],
    ])
    expect(detectMainFilePure(['alpha.scad', 'beta.scad'], content)).toBe('beta.scad')
  })

  it('falls back to alphabetical order', () => {
    expect(detectMainFilePure(['zebra.scad', 'apple.scad'])).toBe('apple.scad')
  })
})

// ---------------------------------------------------------------------------
// looksLikePresetFilePure
// ---------------------------------------------------------------------------

describe('looksLikePresetFilePure', () => {
  it('detects presets by filename hint', () => {
    expect(looksLikePresetFilePure('my_presets.json')).toBe(true)
    expect(looksLikePresetFilePure('parameters.json')).toBe(true)
    expect(looksLikePresetFilePure('config.json')).toBe(true)
  })

  it('returns false for plain json without hints', () => {
    expect(looksLikePresetFilePure('data.json')).toBe(false)
  })

  it('detects preset files by content key "parameterSets"', () => {
    const content = JSON.stringify({ parameterSets: { 'Box Small': { w: 10 } } })
    expect(looksLikePresetFilePure('data.json', content)).toBe(true)
  })

  it('detects preset files by content key "presets"', () => {
    const content = JSON.stringify({ presets: [{ name: 'A', values: {} }] })
    expect(looksLikePresetFilePure('data.json', content)).toBe(true)
  })

  it('returns false for invalid JSON content', () => {
    expect(looksLikePresetFilePure('data.json', '{not json}')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// buildManifestPure — uncompressed mode
// ---------------------------------------------------------------------------

describe('buildManifestPure — uncompressed mode', () => {
  it('generates a minimal manifest from a single .scad file', () => {
    const { manifest, mainFile } = buildManifestPure({
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
    const { manifest } = buildManifestPure({
      allFiles: ['design.scad', 'openings.txt', 'my_presets.json'],
      zipMode: false,
    })
    expect(manifest.files.companions).toContain('openings.txt')
    expect(manifest.files.presets).toBe('my_presets.json')
  })

  it('puts non-main .scad files in companions', () => {
    const { manifest } = buildManifestPure({
      allFiles: ['main.scad', 'helper.scad'],
      zipMode: false,
    })
    expect(manifest.files.main).toBe('main.scad')
    expect(manifest.files.companions).toContain('helper.scad')
  })

  it('handles multiple preset files as an array', () => {
    const { manifest } = buildManifestPure({
      allFiles: ['design.scad', 'presets_a.json', 'presets_b.json'],
      zipMode: false,
    })
    expect(Array.isArray(manifest.files.presets)).toBe(true)
    expect(manifest.files.presets).toHaveLength(2)
  })

  it('produces a warning when no .scad files are present', () => {
    const { warnings } = buildManifestPure({ allFiles: ['readme.txt'], zipMode: false })
    expect(warnings.length).toBeGreaterThan(0)
  })

  it('omits author field when not provided', () => {
    const { manifest } = buildManifestPure({
      allFiles: ['design.scad'],
      zipMode: false,
    })
    expect('author' in manifest).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// buildManifestPure — zip bundle mode
// ---------------------------------------------------------------------------

describe('buildManifestPure — zip bundle mode', () => {
  it('generates a bundle manifest with files.bundle set', () => {
    const { manifest } = buildManifestPure({
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
    const { manifest } = buildManifestPure({
      allFiles: ['design.scad'],
      zipMode: true,
      zipName: 'my_cool_project.zip',
    })
    expect(manifest.name).toBe('my_cool_project')
  })

  it('does not include files.main in bundle manifest when no scad files found', () => {
    const { manifest, warnings } = buildManifestPure({
      allFiles: ['readme.txt'],
      zipMode: true,
      zipName: 'project.zip',
    })
    expect(manifest.files.main).toBeUndefined()
    expect(warnings.length).toBeGreaterThan(0)
  })
})
