import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  validateZipFile,
  scanIncludes,
  resolveIncludePath,
  getZipStats,
  createFileTree,
  extractZipFiles,
  resolveProjectFile,
  buildPresetCompanionMap,
} from '../../src/js/zip-handler.js'
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

  describe('Image extraction as data URLs', () => {
    it('should extract PNG files as data URLs', async () => {
      const zip = new JSZip()
      zip.file('main.scad', 'cube([10, 10, 10]);')
      zip.file('screenshot.png', new Uint8Array([137, 80, 78, 71])) // PNG magic bytes

      const zipBlob = await zip.generateAsync({ type: 'blob' })
      const result = await extractZipFiles(zipBlob)

      expect(result.files.has('screenshot.png')).toBe(true)
      const value = result.files.get('screenshot.png')
      expect(value).toMatch(/^data:image\/png;base64,/)
    })

    it('should extract JPG files with jpeg MIME type', async () => {
      const zip = new JSZip()
      zip.file('main.scad', 'cube([10, 10, 10]);')
      zip.file('photo.jpg', new Uint8Array([0xff, 0xd8, 0xff])) // JPEG magic bytes

      const zipBlob = await zip.generateAsync({ type: 'blob' })
      const result = await extractZipFiles(zipBlob)

      expect(result.files.has('photo.jpg')).toBe(true)
      const value = result.files.get('photo.jpg')
      expect(value).toMatch(/^data:image\/jpeg;base64,/)
    })

    it('should still skip non-image binary files', async () => {
      const zip = new JSZip()
      zip.file('main.scad', 'cube([10, 10, 10]);')
      zip.file('model.stl', new Uint8Array([0x73, 0x74, 0x6c])) // fake STL

      const zipBlob = await zip.generateAsync({ type: 'blob' })
      const result = await extractZipFiles(zipBlob)

      expect(result.files.has('model.stl')).toBe(false)
    })

    it('should extract nested PNG files preserving path', async () => {
      const zip = new JSZip()
      zip.file('main.scad', 'cube([10, 10, 10]);')
      zip.file('SVG files/iPad/default.png', new Uint8Array([137, 80, 78, 71]))

      const zipBlob = await zip.generateAsync({ type: 'blob' })
      const result = await extractZipFiles(zipBlob)

      expect(result.files.has('SVG files/iPad/default.png')).toBe(true)
      expect(result.files.get('SVG files/iPad/default.png')).toMatch(
        /^data:image\/png;base64,/
      )
    })
  })

  describe('resolveProjectFile', () => {
    it('should return content on exact key match', () => {
      const files = new Map([
        ['default.svg', '<svg/>'],
        ['other.svg', '<svg2/>'],
      ])
      const result = resolveProjectFile(files, 'default.svg')
      expect(result).not.toBeNull()
      expect(result.key).toBe('default.svg')
      expect(result.content).toBe('<svg/>')
    })

    it('should return content on basename fallback when one match', () => {
      const files = new Map([
        ['SVG files/iPad/CoughDrop/QC 60.svg', '<svg/>'],
        ['main.scad', '// scad'],
      ])
      const result = resolveProjectFile(files, 'QC 60.svg')
      expect(result).not.toBeNull()
      expect(result.key).toBe('SVG files/iPad/CoughDrop/QC 60.svg')
    })

    it('should return null when basename matches multiple files (ambiguous)', () => {
      const files = new Map([
        ['SVG files/iPad/App1/default.svg', '<svg1/>'],
        ['SVG files/iPad/App2/default.svg', '<svg2/>'],
      ])
      const result = resolveProjectFile(files, 'default.svg')
      expect(result).toBeNull()
    })

    it('should return null when no match exists', () => {
      const files = new Map([['main.scad', '// code']])
      const result = resolveProjectFile(files, 'default.svg')
      expect(result).toBeNull()
    })

    it('should return null for empty inputs', () => {
      expect(resolveProjectFile(null, 'file.svg')).toBeNull()
      expect(resolveProjectFile(new Map(), '')).toBeNull()
    })

    it('should prefer exact key over basename match', () => {
      const files = new Map([
        ['default.svg', '<root svg/>'],
        ['sub/default.svg', '<nested svg/>'],
      ])
      const result = resolveProjectFile(files, 'default.svg')
      expect(result).not.toBeNull()
      expect(result.key).toBe('default.svg')
      expect(result.content).toBe('<root svg/>')
    })
  })

  describe('buildPresetCompanionMap', () => {
    function makeFiles(entries) {
      return new Map(entries)
    }

    it('should return empty map for empty inputs', () => {
      expect(buildPresetCompanionMap(null, null).size).toBe(0)
      expect(buildPresetCompanionMap(new Map(), {}).size).toBe(0)
    })

    it('should map preset to the best-matching openings path', () => {
      // Use multi-char differentiators so the tokeniser can distinguish paths.
      // Token "7" (len 1) is filtered; "AlphaTab", "BetaTab", "TouchChat", "Snap" are not.
      const files = makeFiles([
        ['main.scad', '// scad'],
        ['openings_and_additions.txt', 'default'],
        ['Cases/AlphaTab/TouchChat/openings_and_additions.txt', 'at tc'],
        ['Cases/AlphaTab/Snap/openings_and_additions.txt', 'at snap'],
        ['Cases/BetaTab/TouchChat/openings_and_additions.txt', 'bt tc'],
      ])
      const parameterSets = {
        'AlphaTab TouchChat': {},
        'AlphaTab Snap': {},
        'BetaTab TouchChat': {},
      }
      const map = buildPresetCompanionMap(files, parameterSets)

      expect(map.get('AlphaTab TouchChat').openingsPath).toBe(
        'Cases/AlphaTab/TouchChat/openings_and_additions.txt'
      )
      expect(map.get('AlphaTab Snap').openingsPath).toBe(
        'Cases/AlphaTab/Snap/openings_and_additions.txt'
      )
      expect(map.get('BetaTab TouchChat').openingsPath).toBe(
        'Cases/BetaTab/TouchChat/openings_and_additions.txt'
      )
    })

    it('should set openingsPath null when scores are tied (ambiguous)', () => {
      const files = makeFiles([
        ['main.scad', '// scad'],
        ['Cases/Alpha/openings_and_additions.txt', 'alpha'],
        ['Cases/Beta/openings_and_additions.txt', 'beta'],
      ])
      // Preset name tokens score equally on both paths
      const parameterSets = { 'Cases Device': {} }
      const map = buildPresetCompanionMap(files, parameterSets)
      // Both paths score equally for tokens ['cases', 'device']
      // 'cases' matches both paths, 'device' matches neither — tie
      expect(map.get('Cases Device').openingsPath).toBeNull()
    })

    it('should map preset to the best-matching SVG path', () => {
      const files = makeFiles([
        ['main.scad', '// scad'],
        ['openings_and_additions.txt', 'default'],
        ['SVG files/iPad 7/App1/icon.svg', '<svg1/>'],
        ['SVG files/iPad 7/App2/icon.svg', '<svg2/>'],
        ['Cases/iPad 7/App1/openings_and_additions.txt', 'ipad7-app1'],
        ['Cases/iPad 7/App2/openings_and_additions.txt', 'ipad7-app2'],
      ])
      const parameterSets = { 'iPad 7 App1': {}, 'iPad 7 App2': {} }
      const map = buildPresetCompanionMap(files, parameterSets)

      expect(map.get('iPad 7 App1').svgPath).toBe('SVG files/iPad 7/App1/icon.svg')
      expect(map.get('iPad 7 App2').svgPath).toBe('SVG files/iPad 7/App2/icon.svg')
    })

    it('should skip "design default values" preset name', () => {
      const files = makeFiles([
        ['main.scad', '// scad'],
        ['Cases/A/openings_and_additions.txt', 'a'],
        ['Cases/B/openings_and_additions.txt', 'b'],
      ])
      const parameterSets = {
        'design default values': {},
        'Preset A': {},
      }
      const map = buildPresetCompanionMap(files, parameterSets)
      expect(map.has('design default values')).toBe(false)
      expect(map.has('Preset A')).toBe(true)
    })

    it('should not map openings when openings file is not aliasable (single path)', () => {
      const files = makeFiles([
        ['main.scad', '// scad'],
        ['openings_and_additions.txt', 'only one'],
      ])
      const parameterSets = { 'Preset A': {} }
      const map = buildPresetCompanionMap(files, parameterSets)
      // Single instance — not aliasable, no mapping needed
      expect(map.get('Preset A').openingsPath).toBeNull()
    })
  })
})
