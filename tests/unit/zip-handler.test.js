import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  validateZipFile,
  scanIncludes,
  resolveIncludePath,
  getZipStats,
  createFileTree,
  extractZipFiles,
  resolveProjectFile,
  buildPresetCompanionMap,
  applyCompanionAliases,
  getOverlaySvgTarget,
  findFirstOverlayAsset,
  matchesBrand,
  parsePresetParts,
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

    it('should resolve tablet version digits in preset name to the correct folder', () => {
      // Regression: single-digit tokens like '7','8','9' from 'iPad 7,8,9' were
      // filtered by the length > 1 guard, causing 'Cases/iPad 7,8,9/...' and
      // 'Cases/iPad 10/...' to tie on ('ipad','fintie','touchchat') → null.
      const files = makeFiles([
        ['main.scad', '// scad'],
        ['Cases/iPad 7,8,9/Fintie/TouchChat/openings_and_additions.txt', 'ipad789 tc'],
        ['Cases/iPad 10/Fintie/TouchChat/openings_and_additions.txt', 'ipad10 tc'],
      ])
      const parameterSets = { 'iPad 7,8,9 - Fintie - TouchChat': {} }
      const map = buildPresetCompanionMap(files, parameterSets)
      expect(map.get('iPad 7,8,9 - Fintie - TouchChat').openingsPath).toBe(
        'Cases/iPad 7,8,9/Fintie/TouchChat/openings_and_additions.txt'
      )
    })

    it('should not false-match a single-digit token against a folder with that digit embedded in a longer number', () => {
      // Non-regression: token '7' must not match folder 'iPad 78'
      // via substring — only exact word-boundary matches in folder segments count.
      const files = makeFiles([
        ['main.scad', '// scad'],
        ['Cases/iPad 7/App/openings_and_additions.txt', 'ipad7'],
        ['Cases/iPad 78/App/openings_and_additions.txt', 'ipad78'],
      ])
      const parameterSets = { 'iPad 7 - App': {} }
      const map = buildPresetCompanionMap(files, parameterSets)
      expect(map.get('iPad 7 - App').openingsPath).toBe(
        'Cases/iPad 7/App/openings_and_additions.txt'
      )
    })
  })

  describe('buildPresetCompanionMap — keyguard case/app hierarchy', () => {
    const ANDNARY_CASE_PATH =
      'Cases and App Specifics/iPad 10,11/Andnary-equivalent Case/openings_and_additions.txt'

    const KEYGUARD_FIXTURE = new Map([
      ['main.scad', '// keyguard'],
      ['openings_and_additions.txt', 'root default'],
      [ANDNARY_CASE_PATH, 'andnary case-level'],
      [
        'Cases and App Specifics/iPad 10,11/Andnary-equivalent Case/Grid VocoChat/openings_and_additions.txt',
        'andnary grid vocochat',
      ],
      [
        'Cases and App Specifics/iPad 10,11/Andnary-equivalent Case/LWFL/openings_and_additions.txt',
        'andnary lwfl',
      ],
      [
        'Cases and App Specifics/iPad 10,11/Andnary-equivalent Case/P2G/openings_and_additions.txt',
        'andnary p2g',
      ],
      [
        'Cases and App Specifics/iPad 10,11/SUPCASE-equivalent Case/openings_and_additions.txt',
        'supcase case-level',
      ],
      [
        'Cases and App Specifics/iPad 10,11/SUPCASE-equivalent Case/TouchChat/openings_and_additions.txt',
        'supcase touchchat',
      ],
    ])

    it('should resolve preset to app-specific path when app subfolder name is a unique token match', () => {
      const map = buildPresetCompanionMap(KEYGUARD_FIXTURE, {
        'iPad 10,11 - Andnary - P2G': {},
      })
      expect(map.get('iPad 10,11 - Andnary - P2G').openingsPath).toBe(
        'Cases and App Specifics/iPad 10,11/Andnary-equivalent Case/P2G/openings_and_additions.txt'
      )
    })

    it('should fall back to case-level path when preset app has no dedicated subfolder', () => {
      const map = buildPresetCompanionMap(KEYGUARD_FIXTURE, {
        'iPad 10,11 - Andnary - Grid SC 50': {},
      })
      expect(
        map.get('iPad 10,11 - Andnary - Grid SC 50').openingsPath
      ).toBe(ANDNARY_CASE_PATH)
    })

    it('should prefer case-level path when app tokens cause ties among deeper paths', () => {
      const filesWithoutGrid = new Map(KEYGUARD_FIXTURE)
      filesWithoutGrid.delete(
        'Cases and App Specifics/iPad 10,11/Andnary-equivalent Case/Grid VocoChat/openings_and_additions.txt'
      )
      const map = buildPresetCompanionMap(filesWithoutGrid, {
        'iPad 10,11 - Andnary - Grid SC 50': {},
      })
      expect(
        map.get('iPad 10,11 - Andnary - Grid SC 50').openingsPath
      ).toBe(ANDNARY_CASE_PATH)
    })

    it('should resolve app-specific preset across case brands', () => {
      const map = buildPresetCompanionMap(KEYGUARD_FIXTURE, {
        'iPad 10,11 - SUPCASE - TouchChat': {},
      })
      expect(map.get('iPad 10,11 - SUPCASE - TouchChat').openingsPath).toBe(
        'Cases and App Specifics/iPad 10,11/SUPCASE-equivalent Case/TouchChat/openings_and_additions.txt'
      )
    })
  })

  describe('applyCompanionAliases', () => {
    it('should preserve existing root-level openings key (not replace with nested)', () => {
      const files = new Map([
        ['main.scad', '// scad'],
        ['openings_and_additions.txt', 'default openings'],
        ['Cases/iPad/TouchChat/openings_and_additions.txt', 'preset openings'],
      ])
      const mapping = {
        openingsPath: 'Cases/iPad/TouchChat/openings_and_additions.txt',
        svgPath: null,
      }
      const result = applyCompanionAliases(files, mapping)
      expect(result.get('openings_and_additions.txt')).toBe('default openings')
    })

    it('should preserve existing root-level default.svg (not replace with nested)', () => {
      const files = new Map([
        ['main.scad', '// scad'],
        ['default.svg', '<svg>placeholder</svg>'],
        ['SVG files/iPad/App/icon.svg', '<svg>app icon</svg>'],
      ])
      const mapping = {
        openingsPath: null,
        svgPath: 'SVG files/iPad/App/icon.svg',
      }
      const result = applyCompanionAliases(files, mapping)
      expect(result.get('default.svg')).toBe('<svg>placeholder</svg>')
    })

    it('should preserve both existing root keys when mapping has both paths', () => {
      const files = new Map([
        ['main.scad', '// scad'],
        ['openings_and_additions.txt', 'default'],
        ['default.svg', '<svg>placeholder</svg>'],
        ['Cases/iPad/TC/openings_and_additions.txt', 'tc openings'],
        ['SVG files/iPad/TC/screen.svg', '<svg>tc</svg>'],
      ])
      const mapping = {
        openingsPath: 'Cases/iPad/TC/openings_and_additions.txt',
        svgPath: 'SVG files/iPad/TC/screen.svg',
      }
      const result = applyCompanionAliases(files, mapping)
      expect(result.get('openings_and_additions.txt')).toBe('default')
      expect(result.get('default.svg')).toBe('<svg>placeholder</svg>')
    })

    it('should not mutate the original Map', () => {
      const files = new Map([
        ['main.scad', '// scad'],
        ['openings_and_additions.txt', 'original'],
        ['Cases/A/openings_and_additions.txt', 'preset A'],
      ])
      const mapping = {
        openingsPath: 'Cases/A/openings_and_additions.txt',
        svgPath: null,
      }
      applyCompanionAliases(files, mapping)
      expect(files.get('openings_and_additions.txt')).toBe('original')
      expect(files.has('default.svg')).toBe(false)
    })

    it('should return unchanged copy when mapping is null', () => {
      const files = new Map([
        ['main.scad', '// scad'],
        ['openings_and_additions.txt', 'default'],
      ])
      const result = applyCompanionAliases(files, null)
      expect(result.get('openings_and_additions.txt')).toBe('default')
      expect(result.has('default.svg')).toBe(false)
    })

    it('should skip alias when mapped source path is missing from files', () => {
      const files = new Map([
        ['main.scad', '// scad'],
        ['openings_and_additions.txt', 'default'],
      ])
      const mapping = {
        openingsPath: 'Cases/Missing/openings_and_additions.txt',
        svgPath: 'SVG files/Missing/icon.svg',
      }
      const result = applyCompanionAliases(files, mapping)
      expect(result.get('openings_and_additions.txt')).toBe('default')
      expect(result.has('default.svg')).toBe(false)
    })

    it('should preserve all original entries alongside aliases', () => {
      const files = new Map([
        ['main.scad', '// scad'],
        ['openings_and_additions.txt', 'default'],
        ['default.svg', '<svg>placeholder</svg>'],
        ['Cases/A/openings_and_additions.txt', 'preset A'],
        ['Cases/B/openings_and_additions.txt', 'preset B'],
        ['SVG files/A/icon.svg', '<svg>a</svg>'],
      ])
      const mapping = {
        openingsPath: 'Cases/A/openings_and_additions.txt',
        svgPath: 'SVG files/A/icon.svg',
      }
      const result = applyCompanionAliases(files, mapping)
      expect(result.size).toBe(files.size)
      expect(result.get('Cases/B/openings_and_additions.txt')).toBe('preset B')
      expect(result.get('Cases/A/openings_and_additions.txt')).toBe('preset A')
    })

    it('should preserve root keys in integration with buildPresetCompanionMap', () => {
      const files = new Map([
        ['main.scad', '// scad'],
        ['openings_and_additions.txt', 'root default'],
        ['default.svg', '<svg>placeholder</svg>'],
        ['Cases/AlphaTab/TouchChat/openings_and_additions.txt', 'at tc'],
        ['Cases/AlphaTab/Snap/openings_and_additions.txt', 'at snap'],
        ['SVG files/AlphaTab/TouchChat/icon.svg', '<svg>at tc</svg>'],
        ['SVG files/AlphaTab/Snap/icon.svg', '<svg>at snap</svg>'],
      ])
      const parameterSets = {
        'AlphaTab TouchChat': {},
        'AlphaTab Snap': {},
      }
      const companionMap = buildPresetCompanionMap(files, parameterSets)
      const tcMapping = companionMap.get('AlphaTab TouchChat')
      const tcResult = applyCompanionAliases(files, tcMapping)
      expect(tcResult.get('openings_and_additions.txt')).toBe('root default')
      expect(tcResult.get('default.svg')).toBe('<svg>placeholder</svg>')

      const snapMapping = companionMap.get('AlphaTab Snap')
      const snapResult = applyCompanionAliases(files, snapMapping)
      expect(snapResult.get('openings_and_additions.txt')).toBe('root default')
      expect(snapResult.get('default.svg')).toBe('<svg>placeholder</svg>')
    })
  })

  describe('applyCompanionAliases — root key creation guard (KI-012 regression)', () => {
    it('should CREATE root openings key when project has no root-level openings file', () => {
      const files = new Map([
        ['main.scad', 'include <openings_and_additions.txt>'],
        ['Cases/iPad/LWFL/openings_and_additions.txt', 'lwfl openings'],
        ['Cases/iPad/P2G/openings_and_additions.txt', 'p2g openings'],
      ])
      const mapping = {
        openingsPath: 'Cases/iPad/LWFL/openings_and_additions.txt',
        svgPath: null,
      }
      const result = applyCompanionAliases(files, mapping)
      expect(result.has('openings_and_additions.txt')).toBe(true)
      expect(result.get('openings_and_additions.txt')).toBe('lwfl openings')
    })

    it('should CREATE root default.svg when project has no root-level SVG', () => {
      const files = new Map([
        ['main.scad', 'import("default.svg")'],
        ['SVG files/iPad/App/icon.svg', '<svg>app icon</svg>'],
      ])
      const mapping = {
        openingsPath: null,
        svgPath: 'SVG files/iPad/App/icon.svg',
      }
      const result = applyCompanionAliases(files, mapping)
      expect(result.has('default.svg')).toBe(true)
      expect(result.get('default.svg')).toBe('<svg>app icon</svg>')
    })

    it('should NOT replace existing root keys — preserve original content (KI-012 fix)', () => {
      const files = new Map([
        ['main.scad', 'include <openings_and_additions.txt>'],
        ['openings_and_additions.txt', 'default content'],
        ['default.svg', '<svg>placeholder</svg>'],
        ['Cases/iPad/LWFL/openings_and_additions.txt', 'lwfl openings'],
        ['SVG files/iPad/LWFL/screen.svg', '<svg>lwfl</svg>'],
      ])
      const mapping = {
        openingsPath: 'Cases/iPad/LWFL/openings_and_additions.txt',
        svgPath: 'SVG files/iPad/LWFL/screen.svg',
      }
      const result = applyCompanionAliases(files, mapping)
      expect(result.get('openings_and_additions.txt')).toBe('default content')
      expect(result.get('default.svg')).toBe('<svg>placeholder</svg>')
    })

    it('should CREATE root openings from resolved path when no root key exists (Bug A/B scenario)', () => {
      const files = new Map([
        ['keyguard_v75.scad', 'include <openings_and_additions.txt>'],
        ['Cases and App Specifics/iPad 10,11/Andnary-equivalent Case/LWFL/openings_and_additions.txt', 'andnary lwfl'],
        ['Cases and App Specifics/iPad 10,11/Andnary-equivalent Case/P2G/openings_and_additions.txt', 'andnary p2g'],
      ])
      const mapping = {
        openingsPath: 'Cases and App Specifics/iPad 10,11/Andnary-equivalent Case/LWFL/openings_and_additions.txt',
        svgPath: null,
      }
      const result = applyCompanionAliases(files, mapping)
      expect(result.size).toBe(files.size + 1)
      expect(result.has('openings_and_additions.txt')).toBe(true)
      expect(result.get('openings_and_additions.txt')).toBe('andnary lwfl')
      for (const [key, value] of files) {
        expect(result.get(key)).toBe(value)
      }
    })
  })

  describe('applyCompanionAliases — generic aliases', () => {
    it('should preserve existing root keys with generic aliases (not replace)', () => {
      const files = new Map([
        ['main.scad', '// scad'],
        ['config.txt', 'default config'],
        ['logo.svg', '<svg>default</svg>'],
        ['data/config.txt', 'preset data'],
        ['assets/logo.svg', '<svg>logo</svg>'],
      ])
      const mapping = {
        aliases: {
          'config.txt': 'data/config.txt',
          'logo.svg': 'assets/logo.svg',
        },
      }
      const result = applyCompanionAliases(files, mapping)
      expect(result.get('config.txt')).toBe('default config')
      expect(result.get('logo.svg')).toBe('<svg>default</svg>')
    })

    it('should skip aliases when source path is missing', () => {
      const files = new Map([['main.scad', '// scad']])
      const mapping = {
        aliases: { 'missing.txt': 'data/missing.txt' },
      }
      const result = applyCompanionAliases(files, mapping)
      expect(result.has('missing.txt')).toBe(false)
    })

    it('should not mutate the original Map with generic aliases', () => {
      const files = new Map([
        ['main.scad', '// scad'],
        ['nested/data.txt', 'original'],
      ])
      const mapping = { aliases: { 'data.txt': 'nested/data.txt' } }
      applyCompanionAliases(files, mapping)
      expect(files.has('data.txt')).toBe(false)
    })

    it('should prefer generic aliases over legacy format (root key preserved)', () => {
      const files = new Map([
        ['main.scad', '// scad'],
        ['custom.txt', 'default custom'],
        ['nested/custom.txt', 'custom content'],
        ['other/openings_and_additions.txt', 'should not be used'],
      ])
      const mapping = {
        aliases: { 'custom.txt': 'nested/custom.txt' },
        openingsPath: 'other/openings_and_additions.txt',
      }
      const result = applyCompanionAliases(files, mapping)
      expect(result.get('custom.txt')).toBe('default custom')
      expect(result.has('openings_and_additions.txt')).toBe(false)
    })

    it('should preserve root keys for non-keyguard project without magic filenames', () => {
      const files = new Map([
        ['main.scad', 'include <settings.txt>\nimport("pattern.svg")'],
        ['settings.txt', 'default settings'],
        ['pattern.svg', '<svg>default</svg>'],
        ['presets/A/settings.txt', 'preset A settings'],
        ['presets/B/settings.txt', 'preset B settings'],
        ['assets/A/pattern.svg', '<svg>A</svg>'],
        ['assets/B/pattern.svg', '<svg>B</svg>'],
      ])
      const mapping = {
        aliases: {
          'settings.txt': 'presets/A/settings.txt',
          'pattern.svg': 'assets/A/pattern.svg',
        },
        svgAliasTarget: 'pattern.svg',
      }
      const result = applyCompanionAliases(files, mapping)
      expect(result.get('settings.txt')).toBe('default settings')
      expect(result.get('pattern.svg')).toBe('<svg>default</svg>')
      expect(result.has('default.svg')).toBe(false)
      expect(result.has('openings_and_additions.txt')).toBe(false)
    })
  })

  describe('applyCompanionAliases — create-only semantics (KI-012 inversion)', () => {
    it('generic: should CREATE root key when target does not exist (Structure B)', () => {
      const files = new Map([
        ['main.scad', 'include <config.txt>'],
        ['presets/Alpha/config.txt', 'alpha config'],
      ])
      const mapping = {
        aliases: { 'config.txt': 'presets/Alpha/config.txt' },
      }
      const result = applyCompanionAliases(files, mapping)
      expect(result.has('config.txt')).toBe(true)
      expect(result.get('config.txt')).toBe('alpha config')
    })

    it('generic: should NOT replace root key when target already exists (Structure A)', () => {
      const files = new Map([
        ['main.scad', 'include <config.txt>'],
        ['config.txt', 'default config'],
        ['presets/Alpha/config.txt', 'alpha config'],
      ])
      const mapping = {
        aliases: { 'config.txt': 'presets/Alpha/config.txt' },
      }
      const result = applyCompanionAliases(files, mapping)
      expect(result.get('config.txt')).toBe('default config')
    })

    it('legacy: should CREATE root openings when target does not exist', () => {
      const files = new Map([
        ['main.scad', 'include <openings_and_additions.txt>'],
        ['Cases/iPad/LWFL/openings_and_additions.txt', 'lwfl openings'],
      ])
      const mapping = {
        openingsPath: 'Cases/iPad/LWFL/openings_and_additions.txt',
        svgPath: null,
      }
      const result = applyCompanionAliases(files, mapping)
      expect(result.has('openings_and_additions.txt')).toBe(true)
      expect(result.get('openings_and_additions.txt')).toBe('lwfl openings')
    })

    it('legacy: should NOT replace root openings when target already exists', () => {
      const files = new Map([
        ['main.scad', 'include <openings_and_additions.txt>'],
        ['openings_and_additions.txt', 'original content'],
        ['Cases/iPad/LWFL/openings_and_additions.txt', 'lwfl openings'],
      ])
      const mapping = {
        openingsPath: 'Cases/iPad/LWFL/openings_and_additions.txt',
        svgPath: null,
      }
      const result = applyCompanionAliases(files, mapping)
      expect(result.get('openings_and_additions.txt')).toBe('original content')
    })

    it('integration: buildPresetCompanionMap + applyCompanionAliases with Structure B (no root file)', () => {
      const files = new Map([
        ['main.scad', 'include <data.txt>'],
        ['presets/Alpha/data.txt', 'alpha data'],
        ['presets/Beta/data.txt', 'beta data'],
      ])
      const parameterSets = {
        'Alpha Work': {},
        'Beta Work': {},
      }
      const companionMap = buildPresetCompanionMap(files, parameterSets, {
        companionTargets: ['data.txt'],
      })

      const alphaMapping = companionMap.get('Alpha Work')
      const alphaResult = applyCompanionAliases(files, alphaMapping)
      expect(alphaResult.has('data.txt')).toBe(true)
      expect(alphaResult.get('data.txt')).toBe('alpha data')

      const betaMapping = companionMap.get('Beta Work')
      const betaResult = applyCompanionAliases(files, betaMapping)
      expect(betaResult.has('data.txt')).toBe(true)
      expect(betaResult.get('data.txt')).toBe('beta data')
    })
  })

  describe('buildPresetCompanionMap — generic companionTargets', () => {
    function makeFiles(entries) {
      return new Map(entries)
    }

    it('should resolve generic companion targets per preset', () => {
      const files = makeFiles([
        ['main.scad', '// scad'],
        ['presets/Alpha/config.txt', 'alpha config'],
        ['presets/Beta/config.txt', 'beta config'],
      ])
      const parameterSets = { 'Alpha Preset': {}, 'Beta Preset': {} }
      const map = buildPresetCompanionMap(files, parameterSets, {
        companionTargets: ['config.txt'],
      })

      const alpha = map.get('Alpha Preset')
      expect(alpha.aliases).toBeDefined()
      expect(alpha.aliases['config.txt']).toBe('presets/Alpha/config.txt')

      const beta = map.get('Beta Preset')
      expect(beta.aliases['config.txt']).toBe('presets/Beta/config.txt')
    })

    it('should resolve SVGs into aliases with basename key', () => {
      const files = makeFiles([
        ['main.scad', '// scad'],
        ['presets/Alpha/config.txt', 'alpha config'],
        ['presets/Beta/config.txt', 'beta config'],
        ['assets/Alpha/diagram.svg', '<svg>A</svg>'],
        ['assets/Beta/diagram.svg', '<svg>B</svg>'],
      ])
      const parameterSets = { 'Alpha Preset': {}, 'Beta Preset': {} }
      const map = buildPresetCompanionMap(files, parameterSets, {
        companionTargets: ['config.txt'],
      })

      const alpha = map.get('Alpha Preset')
      expect(alpha.svgAliasTarget).toBe('diagram.svg')
      expect(alpha.aliases['diagram.svg']).toBe('assets/Alpha/diagram.svg')
    })

    it('should use legacy path when companionTargets is empty', () => {
      const files = makeFiles([
        ['main.scad', '// scad'],
        ['Cases/A/openings_and_additions.txt', 'a'],
        ['Cases/B/openings_and_additions.txt', 'b'],
      ])
      const parameterSets = { 'Preset A': {} }
      const map = buildPresetCompanionMap(files, parameterSets, {
        companionTargets: [],
      })
      const result = map.get('Preset A')
      expect(result.openingsPath).toBeDefined()
      expect(result.aliases).toBeUndefined()
    })

    it('should use legacy path when options is omitted', () => {
      const files = makeFiles([
        ['main.scad', '// scad'],
        ['Cases/A/openings_and_additions.txt', 'a'],
        ['Cases/B/openings_and_additions.txt', 'b'],
      ])
      const parameterSets = { 'Preset A': {} }
      const map = buildPresetCompanionMap(files, parameterSets)
      const result = map.get('Preset A')
      expect(result.openingsPath).toBeDefined()
      expect(result.aliases).toBeUndefined()
    })

    it('should preserve root keys in generic integration with applyCompanionAliases', () => {
      const files = makeFiles([
        ['main.scad', 'include <data.txt>'],
        ['data.txt', 'default data'],
        ['presets/Alpha/data.txt', 'alpha data'],
        ['presets/Beta/data.txt', 'beta data'],
        ['assets/diagram.svg', '<svg>shared</svg>'],
      ])
      const parameterSets = {
        'Alpha Work': {},
        'Beta Work': {},
      }
      const companionMap = buildPresetCompanionMap(files, parameterSets, {
        companionTargets: ['data.txt'],
      })

      const alphaMapping = companionMap.get('Alpha Work')
      const alphaResult = applyCompanionAliases(files, alphaMapping)
      expect(alphaResult.get('data.txt')).toBe('default data')
      expect(alphaResult.has('openings_and_additions.txt')).toBe(false)
      expect(alphaResult.has('default.svg')).toBe(false)

      const betaMapping = companionMap.get('Beta Work')
      const betaResult = applyCompanionAliases(files, betaMapping)
      expect(betaResult.get('data.txt')).toBe('default data')
    })
  })

  describe('getOverlaySvgTarget', () => {
    it('should return svgAliasTarget from generic mapping', () => {
      const mapping = {
        aliases: { 'icon.svg': 'assets/icon.svg' },
        svgAliasTarget: 'icon.svg',
      }
      expect(getOverlaySvgTarget(mapping)).toBe('icon.svg')
    })

    it('should find SVG key in aliases when svgAliasTarget is absent', () => {
      const mapping = {
        aliases: {
          'data.txt': 'presets/data.txt',
          'screen.svg': 'assets/screen.svg',
        },
      }
      expect(getOverlaySvgTarget(mapping)).toBe('screen.svg')
    })

    it('should return default.svg for legacy mapping with svgPath', () => {
      const mapping = { openingsPath: null, svgPath: 'SVG files/icon.svg' }
      expect(getOverlaySvgTarget(mapping)).toBe('default.svg')
    })

    it('should return null for legacy mapping without svgPath', () => {
      const mapping = { openingsPath: 'some/path.txt', svgPath: null }
      expect(getOverlaySvgTarget(mapping)).toBeNull()
    })

    it('should return null for null mapping', () => {
      expect(getOverlaySvgTarget(null)).toBeNull()
    })

    it('should return null when aliases has no SVG entries', () => {
      const mapping = { aliases: { 'data.txt': 'presets/data.txt' } }
      expect(getOverlaySvgTarget(mapping)).toBeNull()
    })
  })

  describe('findFirstOverlayAsset', () => {
    it('should prefer SVG files over raster images', () => {
      const files = new Map([
        ['main.scad', '// scad'],
        ['photo.png', 'data:image/png;base64,...'],
        ['diagram.svg', '<svg/>'],
      ])
      expect(findFirstOverlayAsset(files)).toBe('diagram.svg')
    })

    it('should fall back to raster images when no SVG exists', () => {
      const files = new Map([
        ['main.scad', '// scad'],
        ['screenshot.png', 'data:image/png;base64,...'],
      ])
      expect(findFirstOverlayAsset(files)).toBe('screenshot.png')
    })

    it('should return null when no image assets exist', () => {
      const files = new Map([
        ['main.scad', '// scad'],
        ['data.txt', 'text content'],
      ])
      expect(findFirstOverlayAsset(files)).toBeNull()
    })

    it('should return null for empty or null input', () => {
      expect(findFirstOverlayAsset(null)).toBeNull()
      expect(findFirstOverlayAsset(new Map())).toBeNull()
    })

    it('should handle case-insensitive extensions', () => {
      const files = new Map([
        ['main.scad', '// scad'],
        ['IMAGE.PNG', 'data:image/png;base64,...'],
      ])
      expect(findFirstOverlayAsset(files)).toBe('IMAGE.PNG')
    })

    it('should find nested SVG files', () => {
      const files = new Map([
        ['main.scad', '// scad'],
        ['assets/sub/logo.svg', '<svg/>'],
      ])
      expect(findFirstOverlayAsset(files)).toBe('assets/sub/logo.svg')
    })
  })

  describe('matchesBrand', () => {
    it('should match brand name to equivalent case folder', () => {
      expect(matchesBrand('Andnary-equivalent Case', 'Andnary')).toBe(true)
    })

    it('should handle double-space in folder name', () => {
      expect(matchesBrand('SUPCASE-equivalent  Case', 'SUPCASE')).toBe(true)
    })

    it('should match multi-word brand with whitespace normalization', () => {
      expect(matchesBrand('SP LTROP-equivalent Case', 'SP LTROP')).toBe(true)
    })

    it('should be case-insensitive', () => {
      expect(matchesBrand('LTROP-equivalent Case', 'ltrop')).toBe(true)
    })

    it('should not match different brands', () => {
      expect(matchesBrand('LTROP-equivalent Case', 'SP LTROP')).toBe(false)
    })

    it('should not confuse SP LTROP with LTROP', () => {
      expect(matchesBrand('SP LTROP-equivalent Case', 'LTROP')).toBe(false)
    })

    it('should match bare folder name without -equivalent Case suffix', () => {
      expect(matchesBrand('Fintie', 'Fintie')).toBe(true)
    })

    it('should handle extra whitespace in brand', () => {
      expect(matchesBrand('SP LTROP-equivalent Case', 'SP  LTROP')).toBe(true)
    })
  })

  // Phase 1 — failure-mode tests (expected to FAIL against current code)

  describe('buildPresetCompanionMap — failure mode: sibling substring ambiguity', () => {
    const SIBLING_FIXTURE = new Map([
      ['main.scad', '// keyguard'],
      ['openings_and_additions.txt', 'root default'],
      [
        'Cases and App Specifics/iPad 10,11/Andnary-equivalent Case/openings_and_additions.txt',
        'andnary case-level',
      ],
      [
        'Cases and App Specifics/iPad 10,11/Andnary-equivalent Case/LWFL/openings_and_additions.txt',
        'andnary lwfl',
      ],
      [
        'Cases and App Specifics/iPad 10,11/Andnary-equivalent Case/LWFL-VI/openings_and_additions.txt',
        'andnary lwfl-vi',
      ],
    ])

    it('should resolve LWFL preset to LWFL path, not LWFL-VI sibling', () => {
      const map = buildPresetCompanionMap(SIBLING_FIXTURE, {
        'iPad 10,11 - Andnary - LWFL': {},
      })
      expect(map.get('iPad 10,11 - Andnary - LWFL').openingsPath).toBe(
        'Cases and App Specifics/iPad 10,11/Andnary-equivalent Case/LWFL/openings_and_additions.txt'
      )
    })

    it('should still resolve LWFL-VI preset correctly when both siblings exist', () => {
      const map = buildPresetCompanionMap(SIBLING_FIXTURE, {
        'iPad 10,11 - Andnary - LWFL-VI': {},
      })
      expect(map.get('iPad 10,11 - Andnary - LWFL-VI').openingsPath).toBe(
        'Cases and App Specifics/iPad 10,11/Andnary-equivalent Case/LWFL-VI/openings_and_additions.txt'
      )
    })
  })

  describe('buildPresetCompanionMap — failure mode: cross-brand token bleed', () => {
    const BRAND_CONFUSION_FIXTURE = new Map([
      ['main.scad', '// keyguard'],
      ['openings_and_additions.txt', 'root default'],
      [
        'Cases and App Specifics/iPad 7,8,9/LTROP-equivalent Case/openings_and_additions.txt',
        'ltrop case-level',
      ],
      [
        'Cases and App Specifics/iPad 7,8,9/LTROP-equivalent Case/LWFL-VI/openings_and_additions.txt',
        'ltrop lwfl-vi',
      ],
      [
        'Cases and App Specifics/iPad 7,8,9/SP LTROP-equivalent Case/openings_and_additions.txt',
        'sp ltrop case-level',
      ],
      [
        'Cases and App Specifics/iPad 7,8,9/SP LTROP-equivalent Case/LWFL-VI/openings_and_additions.txt',
        'sp ltrop lwfl-vi',
      ],
    ])

    it('should resolve SP LTROP preset to SP LTROP path, not LTROP', () => {
      const map = buildPresetCompanionMap(BRAND_CONFUSION_FIXTURE, {
        'iPad 7,8,9 - SP LTROP - LWFL-VI': {},
      })
      expect(map.get('iPad 7,8,9 - SP LTROP - LWFL-VI').openingsPath).toBe(
        'Cases and App Specifics/iPad 7,8,9/SP LTROP-equivalent Case/LWFL-VI/openings_and_additions.txt'
      )
    })

    it('should not map app tokens from wrong brand when brands share app subfolders', () => {
      const files = new Map([
        ['main.scad', '// keyguard'],
        ['openings_and_additions.txt', 'root default'],
        [
          'Cases and App Specifics/iPad 10,11/Andnary-equivalent Case/openings_and_additions.txt',
          'andnary case-level',
        ],
        [
          'Cases and App Specifics/iPad 10,11/Andnary-equivalent Case/Grid VocoChat/openings_and_additions.txt',
          'andnary grid vocochat',
        ],
        [
          'Cases and App Specifics/iPad 10,11/SUPCASE-equivalent Case/openings_and_additions.txt',
          'supcase case-level',
        ],
      ])
      const map = buildPresetCompanionMap(files, {
        'iPad 10,11 - SUPCASE - Grid SC 50': {},
      })
      expect(map.get('iPad 10,11 - SUPCASE - Grid SC 50').openingsPath).toBe(
        'Cases and App Specifics/iPad 10,11/SUPCASE-equivalent Case/openings_and_additions.txt'
      )
    })
  })

  describe('buildPresetCompanionMap — failure mode: LTROP mount-type ambiguity', () => {
    const MOUNT_TYPE_FIXTURE = new Map([
      ['main.scad', '// keyguard'],
      ['openings_and_additions.txt', 'root default'],
      [
        'Cases and App Specifics/iPad 7,8,9/LTROP-equivalent Case/Keyguard Frame/openings_and_additions.txt',
        'ltrop keyguard frame mount-level',
      ],
      [
        'Cases and App Specifics/iPad 7,8,9/LTROP-equivalent Case/Keyguard Frame/LWFL-VI/openings_and_additions.txt',
        'ltrop keyguard frame lwfl-vi',
      ],
      [
        'Cases and App Specifics/iPad 7,8,9/LTROP-equivalent Case/No Mount and Slide-in or Raised Tabs/openings_and_additions.txt',
        'ltrop no mount mount-level',
      ],
      [
        'Cases and App Specifics/iPad 7,8,9/LTROP-equivalent Case/No Mount and Slide-in or Raised Tabs/LWFL-VI/openings_and_additions.txt',
        'ltrop no mount lwfl-vi',
      ],
    ])

    it('should resolve app-level path deterministically when mount-type is ambiguous', () => {
      const map = buildPresetCompanionMap(MOUNT_TYPE_FIXTURE, {
        'iPad 7,8,9 - LTROP - LWFL-VI': {},
      })
      const result = map.get('iPad 7,8,9 - LTROP - LWFL-VI')
      expect(result.openingsPath).not.toBeNull()
      expect(result.openingsPath).toMatch(/LWFL-VI\/openings_and_additions\.txt$/)
      expect(result.resolution).toBe('unique')
    })

    it('should produce a deterministic result across repeated calls', () => {
      const presets = { 'iPad 7,8,9 - LTROP - LWFL-VI': {} }
      const first = buildPresetCompanionMap(MOUNT_TYPE_FIXTURE, presets)
      const second = buildPresetCompanionMap(MOUNT_TYPE_FIXTURE, presets)
      expect(first.get('iPad 7,8,9 - LTROP - LWFL-VI').openingsPath).toBe(
        second.get('iPad 7,8,9 - LTROP - LWFL-VI').openingsPath
      )
    })
  })

  describe('buildPresetCompanionMap — compound word normalization gap', () => {
    it('should resolve VocoChat compound word to Voco Chat folder path', () => {
      const files = new Map([
        ['main.scad', '// keyguard'],
        ['openings_and_additions.txt', 'root default'],
        [
          'Cases and App Specifics/iPad mini 6,7/Andnary-equivalent Case/openings_and_additions.txt',
          'andnary case-level',
        ],
        [
          'Cases and App Specifics/iPad mini 6,7/Andnary-equivalent Case/Voco Chat/openings_and_additions.txt',
          'andnary voco chat',
        ],
      ])
      const map = buildPresetCompanionMap(files, {
        'iPad mini 6,7 - Andnary - VocoChat': {},
      })
      expect(map.get('iPad mini 6,7 - Andnary - VocoChat').openingsPath).toBe(
        'Cases and App Specifics/iPad mini 6,7/Andnary-equivalent Case/Voco Chat/openings_and_additions.txt'
      )
    })
  })

  describe('buildPresetCompanionMap — LWFL family regression', () => {
    const LWFL_FAMILY_FIXTURE = new Map([
      ['main.scad', '// keyguard'],
      ['openings_and_additions.txt', 'root default'],
      // Andnary brand: LWFL at app-level (no mount-type layer)
      [
        'Cases and App Specifics/iPad 10,11/Andnary-equivalent Case/openings_and_additions.txt',
        'andnary case-level',
      ],
      [
        'Cases and App Specifics/iPad 10,11/Andnary-equivalent Case/LWFL/openings_and_additions.txt',
        'andnary lwfl',
      ],
      [
        'Cases and App Specifics/iPad 10,11/Andnary-equivalent Case/LWFL-VI/openings_and_additions.txt',
        'andnary lwfl-vi',
      ],
      [
        'Cases and App Specifics/iPad 10,11/Andnary-equivalent Case/P2G/openings_and_additions.txt',
        'andnary p2g',
      ],
      // LTROP brand: 3-level hierarchy with mount types
      [
        'Cases and App Specifics/iPad 7,8,9/LTROP-equivalent Case/Keyguard Frame/openings_and_additions.txt',
        'ltrop kf mount-level',
      ],
      [
        'Cases and App Specifics/iPad 7,8,9/LTROP-equivalent Case/Keyguard Frame/LWFL/openings_and_additions.txt',
        'ltrop kf lwfl',
      ],
      [
        'Cases and App Specifics/iPad 7,8,9/LTROP-equivalent Case/Keyguard Frame/LWFL-VI/openings_and_additions.txt',
        'ltrop kf lwfl-vi',
      ],
      [
        'Cases and App Specifics/iPad 7,8,9/LTROP-equivalent Case/No Mount and Slide-in or Raised Tabs/openings_and_additions.txt',
        'ltrop nm mount-level',
      ],
      [
        'Cases and App Specifics/iPad 7,8,9/LTROP-equivalent Case/No Mount and Slide-in or Raised Tabs/LWFL/openings_and_additions.txt',
        'ltrop nm lwfl',
      ],
      [
        'Cases and App Specifics/iPad 7,8,9/LTROP-equivalent Case/No Mount and Slide-in or Raised Tabs/LWFL-VI/openings_and_additions.txt',
        'ltrop nm lwfl-vi',
      ],
      // SP LTROP brand: same structure
      [
        'Cases and App Specifics/iPad 7,8,9/SP LTROP-equivalent Case/Keyguard Frame/openings_and_additions.txt',
        'sp ltrop kf mount-level',
      ],
      [
        'Cases and App Specifics/iPad 7,8,9/SP LTROP-equivalent Case/Keyguard Frame/LWFL-VI/openings_and_additions.txt',
        'sp ltrop kf lwfl-vi',
      ],
      [
        'Cases and App Specifics/iPad 7,8,9/SP LTROP-equivalent Case/No Mount and Slide-in or Raised Tabs/openings_and_additions.txt',
        'sp ltrop nm mount-level',
      ],
      [
        'Cases and App Specifics/iPad 7,8,9/SP LTROP-equivalent Case/No Mount and Slide-in or Raised Tabs/LWFL-VI/openings_and_additions.txt',
        'sp ltrop nm lwfl-vi',
      ],
    ])

    it('should resolve Andnary LWFL to exact LWFL path, not LWFL-VI sibling', () => {
      const map = buildPresetCompanionMap(LWFL_FAMILY_FIXTURE, {
        'iPad 10,11 - Andnary - LWFL': {},
      })
      const entry = map.get('iPad 10,11 - Andnary - LWFL')
      expect(entry.openingsPath).toBe(
        'Cases and App Specifics/iPad 10,11/Andnary-equivalent Case/LWFL/openings_and_additions.txt'
      )
      expect(entry.resolution).toBe('unique')
    })

    it('should resolve Andnary LWFL-VI to exact LWFL-VI path', () => {
      const map = buildPresetCompanionMap(LWFL_FAMILY_FIXTURE, {
        'iPad 10,11 - Andnary - LWFL-VI': {},
      })
      const entry = map.get('iPad 10,11 - Andnary - LWFL-VI')
      expect(entry.openingsPath).toBe(
        'Cases and App Specifics/iPad 10,11/Andnary-equivalent Case/LWFL-VI/openings_and_additions.txt'
      )
      expect(entry.resolution).toBe('unique')
    })

    it('should resolve LTROP LWFL deterministically to app-level path despite mount-type ambiguity', () => {
      const map = buildPresetCompanionMap(LWFL_FAMILY_FIXTURE, {
        'iPad 7,8,9 - LTROP - LWFL': {},
      })
      const entry = map.get('iPad 7,8,9 - LTROP - LWFL')
      expect(entry.openingsPath).not.toBeNull()
      expect(entry.openingsPath).toMatch(/LWFL\/openings_and_additions\.txt$/)
      expect(entry.openingsPath).not.toMatch(/LWFL-VI/)
      expect(entry.resolution).toBe('unique')
    })

    it('should resolve LTROP LWFL-VI deterministically to app-level path despite mount-type ambiguity', () => {
      const map = buildPresetCompanionMap(LWFL_FAMILY_FIXTURE, {
        'iPad 7,8,9 - LTROP - LWFL-VI': {},
      })
      const entry = map.get('iPad 7,8,9 - LTROP - LWFL-VI')
      expect(entry.openingsPath).not.toBeNull()
      expect(entry.openingsPath).toMatch(/LWFL-VI\/openings_and_additions\.txt$/)
      expect(entry.resolution).toBe('unique')
    })

    it('should resolve SP LTROP LWFL-VI without cross-brand bleed', () => {
      const map = buildPresetCompanionMap(LWFL_FAMILY_FIXTURE, {
        'iPad 7,8,9 - SP LTROP - LWFL-VI': {},
      })
      const entry = map.get('iPad 7,8,9 - SP LTROP - LWFL-VI')
      expect(entry.openingsPath).not.toBeNull()
      expect(entry.openingsPath).toContain('SP LTROP-equivalent Case')
      expect(entry.openingsPath).toMatch(/LWFL-VI\/openings_and_additions\.txt$/)
      expect(entry.resolution).toBe('unique')
    })

    it('should resolve all LWFL family presets simultaneously without interference', () => {
      const presets = {
        'iPad 10,11 - Andnary - LWFL': {},
        'iPad 10,11 - Andnary - LWFL-VI': {},
        'iPad 10,11 - Andnary - P2G': {},
        'iPad 7,8,9 - LTROP - LWFL': {},
        'iPad 7,8,9 - LTROP - LWFL-VI': {},
        'iPad 7,8,9 - SP LTROP - LWFL-VI': {},
      }
      const map = buildPresetCompanionMap(LWFL_FAMILY_FIXTURE, presets)

      expect(map.get('iPad 10,11 - Andnary - LWFL').openingsPath).toContain('Andnary')
      expect(map.get('iPad 10,11 - Andnary - LWFL').openingsPath).toMatch(/\/LWFL\//)
      expect(map.get('iPad 10,11 - Andnary - LWFL-VI').openingsPath).toMatch(/\/LWFL-VI\//)
      expect(map.get('iPad 10,11 - Andnary - P2G').openingsPath).toMatch(/\/P2G\//)
      expect(map.get('iPad 7,8,9 - LTROP - LWFL').openingsPath).toContain('LTROP')
      expect(map.get('iPad 7,8,9 - LTROP - LWFL').openingsPath).toMatch(/\/LWFL\//)
      expect(map.get('iPad 7,8,9 - LTROP - LWFL-VI').openingsPath).toContain('LTROP-equivalent Case')
      expect(map.get('iPad 7,8,9 - SP LTROP - LWFL-VI').openingsPath).toContain('SP LTROP')

      for (const [, entry] of map) {
        expect(entry.resolution).toBe('unique')
      }
    })

    it('should produce deterministic results across repeated calls for mount-type-ambiguous presets', () => {
      const presets = {
        'iPad 7,8,9 - LTROP - LWFL': {},
        'iPad 7,8,9 - LTROP - LWFL-VI': {},
      }
      const first = buildPresetCompanionMap(LWFL_FAMILY_FIXTURE, presets)
      const second = buildPresetCompanionMap(LWFL_FAMILY_FIXTURE, presets)

      expect(first.get('iPad 7,8,9 - LTROP - LWFL').openingsPath).toBe(
        second.get('iPad 7,8,9 - LTROP - LWFL').openingsPath
      )
      expect(first.get('iPad 7,8,9 - LTROP - LWFL-VI').openingsPath).toBe(
        second.get('iPad 7,8,9 - LTROP - LWFL-VI').openingsPath
      )
    })
  })

  describe('buildPresetCompanionMap — "x" token word filter parity', () => {
    const X_TOKEN_FIXTURE = new Map([
      ['main.scad', '// keyguard'],
      ['openings_and_additions.txt', 'root default'],
      [
        'Cases and App Specifics/iPad 7,8,9/LTROP-equivalent Case/Keyguard Frame/openings_and_additions.txt',
        'ltrop kf mount-level',
      ],
      [
        'Cases and App Specifics/iPad 7,8,9/LTROP-equivalent Case/Keyguard Frame/TD Snap 8 x 10/openings_and_additions.txt',
        'ltrop kf td snap 8x10',
      ],
      [
        'Cases and App Specifics/iPad 7,8,9/LTROP-equivalent Case/Keyguard Frame/TD Snap 5 x 5/openings_and_additions.txt',
        'ltrop kf td snap 5x5',
      ],
    ])

    it('should resolve "TD Snap 8 x 10" to app-level path, not mount-type ancestor', () => {
      const map = buildPresetCompanionMap(X_TOKEN_FIXTURE, {
        'iPad 7,8,9 - LTROP - TD Snap 8 x 10': {},
      })
      const entry = map.get('iPad 7,8,9 - LTROP - TD Snap 8 x 10')
      expect(entry.openingsPath).toBe(
        'Cases and App Specifics/iPad 7,8,9/LTROP-equivalent Case/Keyguard Frame/TD Snap 8 x 10/openings_and_additions.txt'
      )
      expect(entry.resolution).toBe('unique')
    })

    it('should resolve "TD Snap 5 x 5" to app-level path, not mount-type ancestor', () => {
      const map = buildPresetCompanionMap(X_TOKEN_FIXTURE, {
        'iPad 7,8,9 - LTROP - TD Snap 5 x 5': {},
      })
      const entry = map.get('iPad 7,8,9 - LTROP - TD Snap 5 x 5')
      expect(entry.openingsPath).toBe(
        'Cases and App Specifics/iPad 7,8,9/LTROP-equivalent Case/Keyguard Frame/TD Snap 5 x 5/openings_and_additions.txt'
      )
      expect(entry.resolution).toBe('unique')
    })
  })

  describe('parsePresetParts', () => {
    it('should parse "iPad 10,11 - Andnary - LWFL" into { tablet, brand, app }', () => {
      const result = parsePresetParts('iPad 10,11 - Andnary - LWFL')
      expect(result).toEqual({ tablet: 'iPad 10,11', brand: 'Andnary', app: 'LWFL' })
    })

    it('should parse "iPad 7,8,9 - SP LTROP - LWFL-VI" with multi-word brand', () => {
      const result = parsePresetParts('iPad 7,8,9 - SP LTROP - LWFL-VI')
      expect(result).toEqual({ tablet: 'iPad 7,8,9', brand: 'SP LTROP', app: 'LWFL-VI' })
    })

    it('should handle hyphenated app names without splitting on inner hyphens', () => {
      const result = parsePresetParts('iPad mini 6,7 - Fintie - LWFL-VI')
      expect(result).toEqual({ tablet: 'iPad mini 6,7', brand: 'Fintie', app: 'LWFL-VI' })
    })

    it('should return null for names without " - " separator', () => {
      expect(parsePresetParts('AlphaTab TouchChat')).toBeNull()
      expect(parsePresetParts('SingleWord')).toBeNull()
    })

    it('should handle names with only tablet and brand (2 parts, no app)', () => {
      const result = parsePresetParts('iPad 10,11 - Andnary')
      expect(result).toEqual({ tablet: 'iPad 10,11', brand: 'Andnary', app: null })
    })
  })

  describe('companionTargets — generic alias pipeline regression', () => {
    it('should produce correct { aliases, svgAliasTarget } shape and apply through full pipeline', () => {
      const files = new Map([
        ['main.scad', 'include <openings_and_additions.txt>'],
        ['openings_and_additions.txt', 'default placeholder'],
        ['screen.svg', '<svg>default</svg>'],
        ['Cases/iPad 10/BrandA/TouchChat/openings_and_additions.txt', 'tc openings'],
        ['Cases/iPad 10/BrandA/Snap/openings_and_additions.txt', 'snap openings'],
        ['SVG files/iPad 10/BrandA/TouchChat/screen.svg', '<svg>tc</svg>'],
        ['SVG files/iPad 10/BrandA/Snap/screen.svg', '<svg>snap</svg>'],
      ])
      const parameterSets = {
        'iPad 10 BrandA TouchChat': {},
        'iPad 10 BrandA Snap': {},
      }
      const companionMap = buildPresetCompanionMap(files, parameterSets, {
        companionTargets: ['openings_and_additions.txt'],
      })

      const tcMapping = companionMap.get('iPad 10 BrandA TouchChat')
      expect(tcMapping.aliases).toBeDefined()
      expect(tcMapping.aliases['openings_and_additions.txt']).toBe(
        'Cases/iPad 10/BrandA/TouchChat/openings_and_additions.txt'
      )
      expect(tcMapping.svgAliasTarget).toBe('screen.svg')
      expect(tcMapping.aliases['screen.svg']).toBe(
        'SVG files/iPad 10/BrandA/TouchChat/screen.svg'
      )

      const applied = applyCompanionAliases(files, tcMapping)
      expect(applied.get('openings_and_additions.txt')).toBe('default placeholder')
      expect(applied.get('screen.svg')).toBe('<svg>default</svg>')

      const svgTarget = getOverlaySvgTarget(tcMapping)
      expect(svgTarget).toBe('screen.svg')
    })
  })

  describe('buildPresetCompanionMap — resolution diagnostics', () => {
    function makeFiles(entries) {
      return new Map(entries)
    }

    it('should tag uniquely resolved presets with resolution: unique', () => {
      const files = makeFiles([
        ['main.scad', '// scad'],
        ['Cases/AlphaTab/TouchChat/openings_and_additions.txt', 'at tc'],
        ['Cases/AlphaTab/Snap/openings_and_additions.txt', 'at snap'],
      ])
      const map = buildPresetCompanionMap(files, {
        'AlphaTab TouchChat': {},
        'AlphaTab Snap': {},
      })
      expect(map.get('AlphaTab TouchChat').resolution).toBe('unique')
      expect(map.get('AlphaTab Snap').resolution).toBe('unique')
    })

    it('should resolve LTROP LWFL-VI as unique via app-name match (not ancestor-fallback)', () => {
      const files = makeFiles([
        ['main.scad', '// keyguard'],
        ['openings_and_additions.txt', 'root default'],
        ['Cases/iPad 7,8,9/LTROP-equivalent Case/Keyguard Frame/openings_and_additions.txt', 'ltrop kf'],
        ['Cases/iPad 7,8,9/LTROP-equivalent Case/Keyguard Frame/LWFL-VI/openings_and_additions.txt', 'ltrop kf lwfl-vi'],
        ['Cases/iPad 7,8,9/LTROP-equivalent Case/No Mount and Slide-in or Raised Tabs/openings_and_additions.txt', 'ltrop nm'],
        ['Cases/iPad 7,8,9/LTROP-equivalent Case/No Mount and Slide-in or Raised Tabs/LWFL-VI/openings_and_additions.txt', 'ltrop nm lwfl-vi'],
      ])
      const map = buildPresetCompanionMap(files, {
        'iPad 7,8,9 - LTROP - LWFL-VI': {},
      })
      const entry = map.get('iPad 7,8,9 - LTROP - LWFL-VI')
      expect(entry.openingsPath).not.toBeNull()
      expect(entry.openingsPath).toMatch(/LWFL-VI\/openings_and_additions\.txt$/)
      expect(entry.resolution).toBe('unique')
    })

    it('should tag ambiguous presets when scores are tied with no ancestor', () => {
      const files = makeFiles([
        ['main.scad', '// scad'],
        ['Cases/Alpha/openings_and_additions.txt', 'alpha'],
        ['Cases/Beta/openings_and_additions.txt', 'beta'],
      ])
      const map = buildPresetCompanionMap(files, { 'Cases Device': {} })
      expect(map.get('Cases Device').resolution).toBe('ambiguous')
    })

    it('should include resolution field in generic companionTargets path', () => {
      const files = makeFiles([
        ['main.scad', '// scad'],
        ['presets/Alpha/config.txt', 'alpha config'],
        ['presets/Beta/config.txt', 'beta config'],
      ])
      const map = buildPresetCompanionMap(files, {
        'Alpha Preset': {},
        'Beta Preset': {},
      }, { companionTargets: ['config.txt'] })

      expect(map.get('Alpha Preset').resolution).toBe('unique')
      expect(map.get('Beta Preset').resolution).toBe('unique')
    })

    it('should tag generic path entries as ambiguous when target cannot resolve', () => {
      const files = makeFiles([
        ['main.scad', '// scad'],
        ['Cases/Alpha/openings_and_additions.txt', 'alpha'],
        ['Cases/Beta/openings_and_additions.txt', 'beta'],
      ])
      const map = buildPresetCompanionMap(files, { 'Cases Device': {} }, {
        companionTargets: ['openings_and_additions.txt'],
      })
      expect(map.get('Cases Device').resolution).toBe('ambiguous')
    })
  })

  describe('buildPresetCompanionMap — ZIP-name independence and alias isolation', () => {
    it('companion map is identical regardless of the ZIP container name', () => {
      const files = new Map([
        ['main.scad', '// scad'],
        ['openings_and_additions.txt', 'root default'],
        ['Cases/BrandA/AppX/openings_and_additions.txt', 'brand-a appx'],
        ['Cases/BrandA/AppY/openings_and_additions.txt', 'brand-a appy'],
      ])
      const parameterSets = {
        'BrandA AppX': {},
        'BrandA AppY': {},
      }

      const mapFromZip1 = buildPresetCompanionMap(files, parameterSets)
      const mapFromZip2 = buildPresetCompanionMap(files, parameterSets)

      expect(mapFromZip1.get('BrandA AppX').openingsPath)
        .toBe(mapFromZip2.get('BrandA AppX').openingsPath)
      expect(mapFromZip1.get('BrandA AppY').openingsPath)
        .toBe(mapFromZip2.get('BrandA AppY').openingsPath)
    })

    it('no alias state bleeds between separate buildPresetCompanionMap calls', () => {
      const filesA = new Map([
        ['main.scad', '// scad'],
        ['Cases/BrandA/App1/openings_and_additions.txt', 'brand-a app1'],
        ['Cases/BrandA/App2/openings_and_additions.txt', 'brand-a app2'],
      ])
      const filesB = new Map([
        ['main.scad', '// scad'],
        ['Cases/BrandB/App3/openings_and_additions.txt', 'brand-b app3'],
        ['Cases/BrandB/App4/openings_and_additions.txt', 'brand-b app4'],
      ])

      const mapA = buildPresetCompanionMap(filesA, { 'BrandA App1': {} })
      const mapB = buildPresetCompanionMap(filesB, { 'BrandB App3': {} })

      expect(mapA.has('BrandA App1')).toBe(true)
      expect(mapA.has('BrandB App3')).toBe(false)
      expect(mapB.has('BrandB App3')).toBe(true)
      expect(mapB.has('BrandA App1')).toBe(false)

      expect(mapB.get('BrandB App3').openingsPath)
        .toBe('Cases/BrandB/App3/openings_and_additions.txt')
    })

    it('separate project loads produce independent companion maps', () => {
      const sharedFiles = new Map([
        ['main.scad', '// scad'],
        ['Cases/Tab1/Brand1/openings_and_additions.txt', 'tab1-brand1'],
        ['Cases/Tab2/Brand2/openings_and_additions.txt', 'tab2-brand2'],
      ])

      const presetsLoad1 = { 'Tab1 Brand1': {} }
      const presetsLoad2 = { 'Tab2 Brand2': {} }

      const map1 = buildPresetCompanionMap(sharedFiles, presetsLoad1)
      const map2 = buildPresetCompanionMap(sharedFiles, presetsLoad2)

      expect(map1.get('Tab1 Brand1').openingsPath)
        .toBe('Cases/Tab1/Brand1/openings_and_additions.txt')
      expect(map1.has('Tab2 Brand2')).toBe(false)

      expect(map2.get('Tab2 Brand2').openingsPath)
        .toBe('Cases/Tab2/Brand2/openings_and_additions.txt')
      expect(map2.has('Tab1 Brand1')).toBe(false)
    })
  })

  describe('buildPresetCompanionMap — real stakeholder naming pattern assertions', () => {
    const __test_dirname = dirname(fileURLToPath(import.meta.url))

    let parameterSets

    beforeAll(() => {
      const jsonPath = resolve(
        __test_dirname,
        '../fixtures/keyguard-v75/keyguard_v75.json'
      )
      const data = JSON.parse(readFileSync(jsonPath, 'utf8'))
      parameterSets = data.parameterSets
    })

    it('Fintie presets for different tablet models resolve to distinct paths', () => {
      const files = new Map([
        ['main.scad', '// keyguard'],
        ['openings_and_additions.txt', 'root'],
        ['Cases and App Specifics/iPad 7,8,9/Fintie-equivalent Case/openings_and_additions.txt', 'fintie 789'],
        ['Cases and App Specifics/iPad 7,8,9/Fintie-equivalent Case/TouchChat/openings_and_additions.txt', 'fintie 789 tc'],
        ['Cases and App Specifics/iPad 10,11/Fintie-equivalent Case/openings_and_additions.txt', 'fintie 1011'],
        ['Cases and App Specifics/iPad 10,11/Fintie-equivalent Case/TouchChat/openings_and_additions.txt', 'fintie 1011 tc'],
      ])

      const map = buildPresetCompanionMap(files, {
        'iPad 7,8,9 - Fintie - TouchChat': {},
        'iPad 10,11 - Fintie - TouchChat': {},
      })

      expect(map.get('iPad 7,8,9 - Fintie - TouchChat').openingsPath)
        .toBe('Cases and App Specifics/iPad 7,8,9/Fintie-equivalent Case/TouchChat/openings_and_additions.txt')
      expect(map.get('iPad 10,11 - Fintie - TouchChat').openingsPath)
        .toBe('Cases and App Specifics/iPad 10,11/Fintie-equivalent Case/TouchChat/openings_and_additions.txt')
    })

    it('Andnary case-level fallback works when app has no subfolder', () => {
      const files = new Map([
        ['main.scad', '// keyguard'],
        ['openings_and_additions.txt', 'root'],
        ['Cases and App Specifics/iPad 10,11/Andnary-equivalent Case/openings_and_additions.txt', 'andnary case-level'],
        ['Cases and App Specifics/iPad 10,11/Andnary-equivalent Case/LWFL/openings_and_additions.txt', 'andnary lwfl'],
      ])

      const map = buildPresetCompanionMap(files, {
        'iPad 10,11 - Andnary - Grid SC 50': {},
      })

      expect(map.get('iPad 10,11 - Andnary - Grid SC 50').openingsPath)
        .toBe('Cases and App Specifics/iPad 10,11/Andnary-equivalent Case/openings_and_additions.txt')
    })

    it('all 292 preset names from the stakeholder fixture are parseable by parsePresetParts', () => {
      const presetNames = Object.keys(parameterSets).filter(
        (n) => n !== 'design default values'
      )
      expect(presetNames).toHaveLength(292)

      for (const name of presetNames) {
        const parts = parsePresetParts(name)
        expect(parts).not.toBeNull()
        expect(parts.tablet).toBeTruthy()
        expect(parts.brand).toBeTruthy()
      }
    })

    it('stakeholder presets contain expected tablet model variety', () => {
      const presetNames = Object.keys(parameterSets).filter(
        (n) => n !== 'design default values'
      )
      const tablets = new Set(
        presetNames.map((n) => parsePresetParts(n)?.tablet).filter(Boolean)
      )

      expect(tablets.has('iPad 7,8,9')).toBe(true)
      expect(tablets.has('iPad 10,11')).toBe(true)
      expect(tablets.has('iPad mini 6,7')).toBe(true)
      expect(tablets.size).toBeGreaterThanOrEqual(3)
    })

    it('stakeholder presets contain expected brand variety', () => {
      const presetNames = Object.keys(parameterSets).filter(
        (n) => n !== 'design default values'
      )
      const brands = new Set(
        presetNames.map((n) => parsePresetParts(n)?.brand).filter(Boolean)
      )

      expect(brands.has('Fintie')).toBe(true)
      expect(brands.has('Andnary')).toBe(true)
      expect(brands.has('SUPCASE')).toBe(true)
      expect(brands.has('LTROP')).toBe(true)
      expect(brands.has('SP LTROP')).toBe(true)
      expect(brands.size).toBeGreaterThanOrEqual(5)
    })
  })

  describe('buildPresetCompanionMap — Phase 7: full 292-preset validation', () => {
    const __test_dirname = dirname(fileURLToPath(import.meta.url))

    const MOUNT_TYPES = [
      'Keyguard Frame',
      'No Mount and Slide-in or Raised Tabs',
    ]

    const LTROP_AMBIGUOUS_APPS = new Set([
      'LWFL-VI',
      'P2G 6 x 10',
      'P2G 7 x 11',
      'Proloquo',
      'Grid Voco Chat',
      'Grid Super Core 30',
      'Grid Super Core 30 max rails',
      'Grid Super Core 50',
      'TC WordPower 42',
      'TC WordPower 42 - lg wnd',
      'TC WordPower 60',
      'TC WordPower 60 - lg wnd',
      'TC WordPower 80',
      'TC WordPower 80 - lg wnd',
      'TC WordPower 108',
      'TC WordPower 108 - lg wnd',
      'TC WordPower 108 (merged)',
      'TC WordPower 108 (merged) - lg wnd',
    ])

    function buildKeyguardFileTree(presetNames) {
      const files = new Map()
      files.set('keyguard_v75.scad', 'include <openings_and_additions.txt>')
      files.set('openings_and_additions.txt', 'root default')

      const combos = new Map()
      for (const name of presetNames) {
        const parts = parsePresetParts(name)
        if (!parts) continue
        const key = `${parts.tablet}|${parts.brand}`
        if (!combos.has(key)) combos.set(key, new Set())
        if (parts.app) combos.get(key).add(parts.app)
      }

      for (const [key, apps] of combos.entries()) {
        const [tablet, brand] = key.split('|')
        const isLTROP = brand === 'LTROP' && tablet === 'iPad 7,8,9'
        const brandFolder =
          brand === 'SUPCASE' && tablet === 'iPad mini 6,7'
            ? 'SUPCASE-equivalent  Case'
            : `${brand}-equivalent Case`
        const base = `Cases and App Specifics/${tablet}/${brandFolder}`

        if (isLTROP) {
          for (const mt of MOUNT_TYPES) {
            files.set(
              `${base}/${mt}/openings_and_additions.txt`,
              `${brand} ${mt} mount-level`
            )
            for (const app of apps) {
              if (LTROP_AMBIGUOUS_APPS.has(app)) {
                files.set(
                  `${base}/${mt}/${app}/openings_and_additions.txt`,
                  `${brand} ${mt} ${app}`
                )
              } else if (mt === MOUNT_TYPES[0]) {
                files.set(
                  `${base}/${mt}/${app}/openings_and_additions.txt`,
                  `${brand} ${mt} ${app}`
                )
              }
            }
          }
        } else {
          files.set(`${base}/openings_and_additions.txt`, `${brand} case-level`)
          for (const app of apps) {
            files.set(
              `${base}/${app}/openings_and_additions.txt`,
              `${brand} ${app}`
            )
          }
        }
      }

      return files
    }

    function categorise(map, presetNames) {
      let unique = 0
      let heuristic = 0
      let unmapped = 0
      const unmappedNames = []
      const heuristicNames = []

      for (const name of presetNames) {
        const entry = map.get(name)
        const path = entry?.openingsPath ?? entry?.aliases?.['openings_and_additions.txt'] ?? null
        if (!path) {
          unmapped++
          unmappedNames.push(name)
          continue
        }
        const dir = path.substring(0, path.lastIndexOf('/'))
        const lastSeg = dir.split('/').pop()
        const isLTROPPath = path.includes('LTROP-equivalent Case')
        if (isLTROPPath && MOUNT_TYPES.includes(lastSeg)) {
          heuristic++
          heuristicNames.push(name)
        } else {
          unique++
        }
      }

      return { unique, heuristic, unmapped, unmappedNames, heuristicNames }
    }

    let presetNames
    let parameterSets
    let fileTree

    beforeAll(() => {
      const jsonPath = resolve(
        __test_dirname,
        '../fixtures/keyguard-v75/keyguard_v75.json'
      )
      const data = JSON.parse(readFileSync(jsonPath, 'utf8'))
      parameterSets = data.parameterSets
      presetNames = Object.keys(parameterSets).filter(
        (n) => n !== 'design default values'
      )
      fileTree = buildKeyguardFileTree(presetNames)
    })

    it('should have 292 presets in the fixture', () => {
      expect(presetNames).toHaveLength(292)
    })

    // Validated thresholds (actual: 292 unique, 0 heuristic, 0 unmapped):
    //
    // Two companion-resolution improvements eliminated all 22 former
    // ancestor-fallback heuristic defaults:
    //
    // 1. extraSegmentsMatchTokens word filter parity: single-char non-digit
    //    words (e.g. "x" in "TD Snap 5 x 5") are now skipped, matching the
    //    tokeniser's own filter. Recovers 3 presets whose single-winner
    //    ancestor check was failing due to unmatched "x".
    //
    // 2. App-name exact-match tie-breaker: when tied candidates span
    //    different intermediate folders (e.g. mount types) but the preset has
    //    a parsed app name, prefer candidates whose leaf folder tokenizes to
    //    the same set as the app name. Recovers 19 LTROP presets whose
    //    app-level paths tied across mount types.

    it('should resolve 290+ uniquely via legacy path', () => {
      const map = buildPresetCompanionMap(fileTree, parameterSets)
      const { unique, heuristic, unmapped, unmappedNames, heuristicNames } =
        categorise(map, presetNames)

      console.log(
        `[Phase 7 Legacy] Unique: ${unique}, Heuristic: ${heuristic}, ` +
          `Unmapped: ${unmapped} / ${presetNames.length}`
      )
      if (unmappedNames.length > 0) {
        console.log('[Phase 7 Legacy] Unmapped:', unmappedNames)
      }
      if (heuristicNames.length > 0) {
        console.log('[Phase 7 Legacy] Heuristic:', heuristicNames)
      }

      expect(unique).toBeGreaterThanOrEqual(290)
      expect(unmapped).toBe(0)
    })

    it('should resolve 290+ uniquely via generic companionTargets path', () => {
      const map = buildPresetCompanionMap(fileTree, parameterSets, {
        companionTargets: ['openings_and_additions.txt'],
      })
      const { unique, heuristic, unmapped, unmappedNames } =
        categorise(map, presetNames)

      console.log(
        `[Phase 7 Generic] Unique: ${unique}, Heuristic: ${heuristic}, ` +
          `Unmapped: ${unmapped} / ${presetNames.length}`
      )
      if (unmappedNames.length > 0) {
        console.log('[Phase 7 Generic] Unmapped:', unmappedNames)
      }

      expect(unique).toBeGreaterThanOrEqual(290)
      expect(unmapped).toBe(0)
    })

    it('should produce correct { aliases, svgAliasTarget } shape from generic path', () => {
      const map = buildPresetCompanionMap(fileTree, parameterSets, {
        companionTargets: ['openings_and_additions.txt'],
      })

      for (const name of presetNames) {
        const entry = map.get(name)
        expect(entry).toBeDefined()
        expect(entry).toHaveProperty('aliases')
        expect(entry).toHaveProperty('svgAliasTarget')
        expect(typeof entry.aliases).toBe('object')
      }
    })

    it('should produce consistent counts between legacy and generic paths', () => {
      const legacyMap = buildPresetCompanionMap(fileTree, parameterSets)
      const genericMap = buildPresetCompanionMap(fileTree, parameterSets, {
        companionTargets: ['openings_and_additions.txt'],
      })

      const legacy = categorise(legacyMap, presetNames)
      const generic = categorise(genericMap, presetNames)

      expect(generic.unique).toBe(legacy.unique)
      expect(generic.heuristic).toBe(legacy.heuristic)
      expect(generic.unmapped).toBe(legacy.unmapped)
    })

    it('should resolve all presets without heuristic defaults after companion-resolution hardening', () => {
      const map = buildPresetCompanionMap(fileTree, parameterSets)
      const { unique, heuristic, heuristicNames } = categorise(
        map,
        presetNames
      )

      expect(unique).toBe(presetNames.length)
      expect(heuristic).toBe(0)
      expect(heuristicNames).toHaveLength(0)
    })

    it('should include a resolution field on every entry (legacy path)', () => {
      const map = buildPresetCompanionMap(fileTree, parameterSets)

      for (const name of presetNames) {
        const entry = map.get(name)
        expect(entry).toBeDefined()
        expect(entry).toHaveProperty('resolution')
        expect(['unique', 'ancestor-fallback', 'ambiguous']).toContain(entry.resolution)
      }
    })

    it('should include a resolution field on every entry (generic path)', () => {
      const map = buildPresetCompanionMap(fileTree, parameterSets, {
        companionTargets: ['openings_and_additions.txt'],
      })

      for (const name of presetNames) {
        const entry = map.get(name)
        expect(entry).toBeDefined()
        expect(entry).toHaveProperty('resolution')
        expect(['unique', 'ancestor-fallback', 'ambiguous']).toContain(entry.resolution)
      }
    })

    it('should report consistent resolution counts between legacy and generic paths', () => {
      const legacyMap = buildPresetCompanionMap(fileTree, parameterSets)
      const genericMap = buildPresetCompanionMap(fileTree, parameterSets, {
        companionTargets: ['openings_and_additions.txt'],
      })

      const legacyCounts = { unique: 0, 'ancestor-fallback': 0, ambiguous: 0 }
      const genericCounts = { unique: 0, 'ancestor-fallback': 0, ambiguous: 0 }

      for (const name of presetNames) {
        legacyCounts[legacyMap.get(name).resolution]++
        genericCounts[genericMap.get(name).resolution]++
      }

      expect(genericCounts.unique).toBe(legacyCounts.unique)
      expect(genericCounts['ancestor-fallback']).toBe(legacyCounts['ancestor-fallback'])
      expect(genericCounts.ambiguous).toBe(legacyCounts.ambiguous)

      console.log(
        `[Phase 7 Resolution] Unique: ${legacyCounts.unique}, ` +
          `Ancestor-fallback: ${legacyCounts['ancestor-fallback']}, ` +
          `Ambiguous: ${legacyCounts.ambiguous}`
      )
    })

    it('should resolve all LTROP presets as unique after app-name tie-breaking', () => {
      const map = buildPresetCompanionMap(fileTree, parameterSets)

      const ltropPresets = presetNames.filter((n) => {
        const parts = parsePresetParts(n)
        return parts?.brand === 'LTROP'
      })
      expect(ltropPresets.length).toBeGreaterThan(0)

      for (const name of ltropPresets) {
        const entry = map.get(name)
        expect(entry.resolution).toBe('unique')
        expect(entry.openingsPath).not.toBeNull()
      }
    })
  })
})
