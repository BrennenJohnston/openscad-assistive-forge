import { describe, it, expect, beforeEach } from 'vitest'
import { validateZipFile, scanIncludes, resolveIncludePath, getZipStats, createFileTree } from '../../src/js/zip-handler.js'

describe('ZIP Handler', () => {
  describe('ZIP Validation', () => {
    it('should validate .zip files', () => {
      const zipFile = new File(['content'], 'test.zip', { type: 'application/zip' })
      
      const result = validateZipFile(zipFile)
      
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('should reject files over 20MB', () => {
      const largeSize = 21 * 1024 * 1024 // 21MB
      const largeFile = new File(['x'.repeat(largeSize)], 'large.zip', { type: 'application/zip' })
      
      const result = validateZipFile(largeFile)
      
      expect(result.valid).toBe(false)
      expect(result.error).toContain('20MB')
    })

    it('should reject non-zip files', () => {
      const txtFile = new File(['content'], 'test.txt', { type: 'text/plain' })
      
      const result = validateZipFile(txtFile)
      
      expect(result.valid).toBe(false)
      expect(result.error).toMatch(/zip|ZIP|\.zip/)
    })

    it('should handle missing file type', () => {
      const file = new File(['content'], 'test.zip', { type: '' })
      
      const result = validateZipFile(file)
      
      // Should validate by extension
      expect(result.valid).toBe(true)
    })

    it('should reject empty ZIP files', () => {
      const emptyFile = new File([''], 'empty.zip', { type: 'application/zip' })
      const result = validateZipFile(emptyFile)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('empty')
    })
  })

  describe('Include Scanning', () => {
    it('should scan for include statements', () => {
      const scad = `
        include <utils/helpers.scad>
        use <modules/parts.scad>
      `
      
      const includes = scanIncludes(scad)
      
      // scanIncludes returns full statements, not just paths
      expect(Array.isArray(includes)).toBe(true)
      expect(includes.length).toBeGreaterThan(0)
    })

    it('should handle empty content', () => {
      const includes = scanIncludes('')
      
      expect(Array.isArray(includes)).toBe(true)
      expect(includes).toHaveLength(0)
    })

    it('should find include and use statements', () => {
      const scad = `
        include <real.scad>
        use <another.scad>
      `
      
      const includes = scanIncludes(scad)
      
      // Should find statements
      expect(includes.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('Include Path Resolution', () => {
    it('should resolve relative paths', () => {
      const resolved = resolveIncludePath('include <utils/helpers.scad>', 'main.scad')
      
      expect(resolved).toBeDefined()
      expect(resolved).toContain('helpers.scad')
    })

    it('should resolve paths from nested files', () => {
      const resolved = resolveIncludePath('include <../shared.scad>', 'modules/parts.scad')
      
      expect(resolved).toBeDefined()
      expect(resolved).toContain('shared.scad')
    })

    it('should handle use statements', () => {
      const resolved = resolveIncludePath('use <library.scad>', 'main.scad')
      
      expect(resolved).toBeDefined()
      expect(resolved).toContain('library.scad')
    })

    it('should return null for invalid include statements', () => {
      const resolved = resolveIncludePath('echo("no include")', 'main.scad')
      expect(resolved).toBeNull()
    })

    it('should resolve absolute include paths', () => {
      const resolved = resolveIncludePath('include </shared/part.scad>', 'main.scad')
      expect(resolved).toBe('shared/part.scad')
    })
  })

  describe('File Tree Rendering', () => {
    it('should highlight the main file in the tree', () => {
      const files = new Map([
        ['main.scad', 'content'],
        ['utils/helper.scad', 'content']
      ])
      const tree = createFileTree(files, 'main.scad')

      expect(tree).toContain('file-tree-item main')
      expect(tree).toContain('main.scad')
      expect(tree).toContain('ZIP Contents (2 files)')
    })
  })

  describe('ZIP Statistics', () => {
    it('should calculate ZIP stats', () => {
      const files = new Map([
        ['main.scad', 'content1'],
        ['utils/helpers.scad', 'content2'],
        ['modules/parts.scad', 'content3']
      ])
      
      const stats = getZipStats(files)
      
      expect(stats.totalFiles).toBe(3)
      expect(stats.scadFiles).toBe(3)
      expect(stats.totalSize).toBeGreaterThan(0)
    })

    it('should count only .scad files', () => {
      const files = new Map([
        ['main.scad', 'content'],
        ['README.md', 'readme'],
        ['image.png', 'data']
      ])
      
      const stats = getZipStats(files)
      
      expect(stats.totalFiles).toBe(3)
      expect(stats.scadFiles).toBe(1)
    })

    it('should handle empty ZIP', () => {
      const files = new Map()
      
      const stats = getZipStats(files)
      
      expect(stats.totalFiles).toBe(0)
      expect(stats.scadFiles).toBe(0)
      expect(stats.totalSize).toBe(0)
    })
  })
})
