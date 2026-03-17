import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { collectScadFiles, generatePerLibraryManifest } from '../../scripts/setup-libraries.js'

describe('setup-libraries', () => {
  let tmpDir

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scad-lib-test-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('collectScadFiles', () => {
    it('collects .scad files from a flat directory', () => {
      fs.writeFileSync(path.join(tmpDir, 'boxes.scad'), '// boxes')
      fs.writeFileSync(path.join(tmpDir, 'gears.scad'), '// gears')
      fs.writeFileSync(path.join(tmpDir, 'README.md'), '# readme')

      const files = collectScadFiles(tmpDir)

      expect(files).toEqual(['boxes.scad', 'gears.scad'])
    })

    it('collects .scad files from nested subdirectories', () => {
      const sub = path.join(tmpDir, 'bitmap')
      fs.mkdirSync(sub)
      fs.writeFileSync(path.join(tmpDir, 'shapes.scad'), '// shapes')
      fs.writeFileSync(path.join(sub, 'font.scad'), '// font')

      const files = collectScadFiles(tmpDir)

      expect(files).toEqual(['bitmap/font.scad', 'shapes.scad'])
    })

    it('skips dot-files, manifest.json, and non-scad files', () => {
      fs.writeFileSync(path.join(tmpDir, '.library-metadata.json'), '{}')
      fs.writeFileSync(path.join(tmpDir, 'manifest.json'), '{}')
      fs.writeFileSync(path.join(tmpDir, 'README.md'), '# hi')
      fs.writeFileSync(path.join(tmpDir, 'boxes.scad'), '// boxes')

      const files = collectScadFiles(tmpDir)

      expect(files).toEqual(['boxes.scad'])
    })

    it('returns empty array for non-existent directory', () => {
      const files = collectScadFiles(path.join(tmpDir, 'nope'))
      expect(files).toEqual([])
    })

    it('returns sorted file paths', () => {
      fs.writeFileSync(path.join(tmpDir, 'z_last.scad'), '')
      fs.writeFileSync(path.join(tmpDir, 'a_first.scad'), '')
      fs.writeFileSync(path.join(tmpDir, 'm_middle.scad'), '')

      const files = collectScadFiles(tmpDir)

      expect(files).toEqual(['a_first.scad', 'm_middle.scad', 'z_last.scad'])
    })
  })

  describe('generatePerLibraryManifest', () => {
    it('returns null for non-existent library directory', () => {
      const result = generatePerLibraryManifest('NonExistent')
      expect(result).toBeNull()
    })
  })

  describe('per-library manifest regression', () => {
    it('manifest.json contains files array (regression: worker expects this)', () => {
      const mcadPath = path.join(tmpDir, 'MCAD')
      fs.mkdirSync(mcadPath)
      fs.writeFileSync(path.join(mcadPath, 'boxes.scad'), '// roundedBox')
      fs.writeFileSync(path.join(mcadPath, 'gears.scad'), '// gear')

      const scadFiles = collectScadFiles(mcadPath)
      const manifest = { name: 'MCAD', files: scadFiles }

      expect(manifest).toHaveProperty('files')
      expect(Array.isArray(manifest.files)).toBe(true)
      expect(manifest.files).toContain('boxes.scad')
      expect(manifest.files).toContain('gears.scad')
    })
  })
})
