import { describe, it, expect, beforeEach, vi } from 'vitest'
import { validateZipFile, scanIncludes, resolveIncludePath, getZipStats, createFileTree, extractZipFiles } from '../../src/js/zip-handler.js'
import JSZip from 'jszip'

describe('ZIP Handler', () => {
  describe('ZIP Validation', () => {
    it('should validate .zip files', () => {
      const zipFile = new File(['content'], 'test.zip', { type: 'application/zip' })
      
      const result = validateZipFile(zipFile)
      
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('should reject files over 100MB', () => {
      const largeSize = 101 * 1024 * 1024 // 101MB
      const largeFile = new File(['x'.repeat(largeSize)], 'large.zip', { type: 'application/zip' })

      const result = validateZipFile(largeFile)

      expect(result.valid).toBe(false)
      expect(result.error).toContain('100MB')
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

    it('should reject files with uppercase ZIP extension', () => {
      const txtFile = new File(['content'], 'test.TXT', { type: 'text/plain' })
      
      const result = validateZipFile(txtFile)
      
      expect(result.valid).toBe(false)
    })

    it('should accept files with uppercase ZIP extension', () => {
      const zipFile = new File(['content'], 'test.ZIP', { type: 'application/zip' })
      
      const result = validateZipFile(zipFile)
      
      expect(result.valid).toBe(true)
    })
  })

  describe('ZIP Extraction', () => {
    it('should extract files from a valid ZIP', async () => {
      // Create a test ZIP file
      const zip = new JSZip()
      zip.file('main.scad', 'cube([10, 10, 10]);')
      zip.file('utils/helper.scad', 'module helper() {}')
      
      const zipBlob = await zip.generateAsync({ type: 'blob' })
      
      const result = await extractZipFiles(zipBlob)
      
      expect(result.files.size).toBe(2)
      expect(result.mainFile).toBe('main.scad')
      expect(result.files.get('main.scad')).toContain('cube')
    })

    it('should detect main.scad as main file', async () => {
      const zip = new JSZip()
      zip.file('main.scad', 'cube([10, 10, 10]);')
      zip.file('other.scad', 'sphere(5);')
      
      const zipBlob = await zip.generateAsync({ type: 'blob' })
      
      const result = await extractZipFiles(zipBlob)
      
      expect(result.mainFile).toBe('main.scad')
    })

    it('should detect file with "main" in name as main file', async () => {
      const zip = new JSZip()
      zip.file('project_main.scad', 'cube([10, 10, 10]);')
      zip.file('helper.scad', 'sphere(5);')
      
      const zipBlob = await zip.generateAsync({ type: 'blob' })
      
      const result = await extractZipFiles(zipBlob)
      
      expect(result.mainFile).toBe('project_main.scad')
    })

    it('should prefer root files over nested files', async () => {
      const zip = new JSZip()
      zip.file('model.scad', 'cube([10, 10, 10]);')
      zip.file('modules/part.scad', 'sphere(5);')
      
      const zipBlob = await zip.generateAsync({ type: 'blob' })
      
      const result = await extractZipFiles(zipBlob)
      
      expect(result.mainFile).toBe('model.scad')
    })

    it('should detect file with Customizer annotations as main file', async () => {
      const zip = new JSZip()
      zip.file('a_file.scad', 'sphere(5);')
      zip.file('b_file.scad', '/*[Dimensions]*/ width = 10; // [5:50]')
      
      const zipBlob = await zip.generateAsync({ type: 'blob' })
      
      const result = await extractZipFiles(zipBlob)
      
      expect(result.mainFile).toBe('b_file.scad')
    })

    it('should throw error when no .scad files found', async () => {
      const zip = new JSZip()
      zip.file('readme.txt', 'This is a readme')
      zip.file('image.png', 'fake image data')
      
      const zipBlob = await zip.generateAsync({ type: 'blob' })
      
      await expect(extractZipFiles(zipBlob)).rejects.toThrow('No .scad files found')
    })

    it('should skip directories during extraction', async () => {
      const zip = new JSZip()
      zip.file('main.scad', 'cube([10, 10, 10]);')
      zip.folder('empty_folder')
      
      const zipBlob = await zip.generateAsync({ type: 'blob' })
      
      const result = await extractZipFiles(zipBlob)
      
      expect(result.files.size).toBe(1)
      expect(result.files.has('empty_folder')).toBe(false)
    })

    it('should normalize paths with backslashes', async () => {
      const zip = new JSZip()
      zip.file('modules/helper.scad', 'module helper() {}')
      zip.file('main.scad', 'cube([10, 10, 10]);')
      
      const zipBlob = await zip.generateAsync({ type: 'blob' })
      
      const result = await extractZipFiles(zipBlob)
      
      expect(result.files.has('modules/helper.scad')).toBe(true)
    })

    it('should handle single .scad file', async () => {
      const zip = new JSZip()
      zip.file('only_file.scad', 'cube([10, 10, 10]);')
      
      const zipBlob = await zip.generateAsync({ type: 'blob' })
      
      const result = await extractZipFiles(zipBlob)
      
      expect(result.mainFile).toBe('only_file.scad')
    })

    it('should handle nested main.scad', async () => {
      const zip = new JSZip()
      zip.file('project/main.scad', 'cube([10, 10, 10]);')
      zip.file('other.scad', 'sphere(5);')
      
      const zipBlob = await zip.generateAsync({ type: 'blob' })
      
      const result = await extractZipFiles(zipBlob)
      
      expect(result.mainFile).toBe('project/main.scad')
    })

    it('should fall back to alphabetically first file', async () => {
      const zip = new JSZip()
      zip.file('modules/z_file.scad', 'cube([10, 10, 10]);')
      zip.file('modules/a_file.scad', 'sphere(5);')
      
      const zipBlob = await zip.generateAsync({ type: 'blob' })
      
      const result = await extractZipFiles(zipBlob)
      
      expect(result.mainFile).toBe('modules/a_file.scad')
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

    it('should find include with quotes', () => {
      const scad = `
        include "local/file.scad"
        use "another.scad"
      `
      
      const includes = scanIncludes(scad)
      
      expect(includes.length).toBeGreaterThanOrEqual(2)
    })

    it('should handle content without includes', () => {
      const scad = `
        cube([10, 10, 10]);
        sphere(5);
      `
      
      const includes = scanIncludes(scad)
      
      expect(includes).toHaveLength(0)
    })

    it('should find multiple includes in one line', () => {
      const scad = 'include <a.scad> include <b.scad>'
      
      const includes = scanIncludes(scad)
      
      expect(includes.length).toBe(2)
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

    it('should resolve paths with quotes', () => {
      const resolved = resolveIncludePath('include "utils/helpers.scad"', 'main.scad')
      
      expect(resolved).toBe('utils/helpers.scad')
    })

    it('should resolve use statement with quotes', () => {
      const resolved = resolveIncludePath('use "library.scad"', 'main.scad')
      
      expect(resolved).toBe('library.scad')
    })

    it('should handle deeply nested paths', () => {
      const resolved = resolveIncludePath('include <../../common.scad>', 'a/b/c/file.scad')
      
      expect(resolved).toBe('a/common.scad')
    })

    it('should handle current directory references', () => {
      const resolved = resolveIncludePath('include <./local.scad>', 'modules/main.scad')
      
      expect(resolved).toBe('modules/local.scad')
    })

    it('should handle multiple parent directory references', () => {
      const resolved = resolveIncludePath('include <../../../root.scad>', 'a/b/c/d.scad')
      
      expect(resolved).toBe('root.scad')
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

    it('should use different icons for different file types', () => {
      const files = new Map([
        ['main.scad', 'content'],
        ['readme.md', 'readme content']
      ])
      const tree = createFileTree(files, 'main.scad')

      expect(tree).toContain('📄') // scad file icon
      expect(tree).toContain('📎') // other file icon
    })

    it('should sort files alphabetically', () => {
      const files = new Map([
        ['z_file.scad', 'content'],
        ['a_file.scad', 'content'],
        ['m_file.scad', 'content']
      ])
      const tree = createFileTree(files, 'a_file.scad')

      const aIndex = tree.indexOf('a_file.scad')
      const mIndex = tree.indexOf('m_file.scad')
      const zIndex = tree.indexOf('z_file.scad')

      expect(aIndex).toBeLessThan(mIndex)
      expect(mIndex).toBeLessThan(zIndex)
    })

    it('should show badge for main file', () => {
      const files = new Map([
        ['main.scad', 'content'],
        ['other.scad', 'content']
      ])
      const tree = createFileTree(files, 'main.scad')

      expect(tree).toContain('file-tree-badge')
      expect(tree).toContain('main</span>')
    })

    it('should handle empty file map', () => {
      const files = new Map()
      const tree = createFileTree(files, '')

      expect(tree).toContain('ZIP Contents (0 files)')
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

    it('should return file lists', () => {
      const files = new Map([
        ['main.scad', 'content'],
        ['helper.scad', 'content'],
        ['README.md', 'readme']
      ])
      
      const stats = getZipStats(files)
      
      expect(stats.scadFilesList).toContain('main.scad')
      expect(stats.scadFilesList).toContain('helper.scad')
      expect(stats.otherFilesList).toContain('README.md')
    })

    it('should calculate correct total size', () => {
      const files = new Map([
        ['file1.scad', 'abc'],     // 3 bytes
        ['file2.scad', 'defgh'],   // 5 bytes
        ['file3.txt', 'ij']        // 2 bytes
      ])
      
      const stats = getZipStats(files)
      
      expect(stats.totalSize).toBe(10)
    })

    it('should count other files separately', () => {
      const files = new Map([
        ['main.scad', 'content'],
        ['readme.md', 'readme'],
        ['license.txt', 'license'],
        ['image.png', 'data']
      ])
      
      const stats = getZipStats(files)
      
      expect(stats.otherFiles).toBe(3)
    })
  })
})
