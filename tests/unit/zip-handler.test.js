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
  applyCompanionAliases,
  getOverlaySvgTarget,
  findFirstOverlayAsset,
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

  describe('applyCompanionAliases', () => {
    it('should set root-level openings key from mapped nested path', () => {
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
      expect(result.get('openings_and_additions.txt')).toBe('preset openings')
    })

    it('should set root-level default.svg from mapped SVG path', () => {
      const files = new Map([
        ['main.scad', '// scad'],
        ['SVG files/iPad/App/icon.svg', '<svg>app icon</svg>'],
      ])
      const mapping = {
        openingsPath: null,
        svgPath: 'SVG files/iPad/App/icon.svg',
      }
      const result = applyCompanionAliases(files, mapping)
      expect(result.get('default.svg')).toBe('<svg>app icon</svg>')
    })

    it('should set both alias keys when mapping has both paths', () => {
      const files = new Map([
        ['main.scad', '// scad'],
        ['openings_and_additions.txt', 'default'],
        ['Cases/iPad/TC/openings_and_additions.txt', 'tc openings'],
        ['SVG files/iPad/TC/screen.svg', '<svg>tc</svg>'],
      ])
      const mapping = {
        openingsPath: 'Cases/iPad/TC/openings_and_additions.txt',
        svgPath: 'SVG files/iPad/TC/screen.svg',
      }
      const result = applyCompanionAliases(files, mapping)
      expect(result.get('openings_and_additions.txt')).toBe('tc openings')
      expect(result.get('default.svg')).toBe('<svg>tc</svg>')
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
        ['Cases/A/openings_and_additions.txt', 'preset A'],
        ['Cases/B/openings_and_additions.txt', 'preset B'],
        ['SVG files/A/icon.svg', '<svg>a</svg>'],
      ])
      const mapping = {
        openingsPath: 'Cases/A/openings_and_additions.txt',
        svgPath: 'SVG files/A/icon.svg',
      }
      const result = applyCompanionAliases(files, mapping)
      expect(result.size).toBe(files.size + 1)
      expect(result.get('Cases/B/openings_and_additions.txt')).toBe('preset B')
      expect(result.get('Cases/A/openings_and_additions.txt')).toBe('preset A')
    })

    it('should integrate with buildPresetCompanionMap output', () => {
      const files = new Map([
        ['main.scad', '// scad'],
        ['openings_and_additions.txt', 'root default'],
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
      expect(tcResult.get('openings_and_additions.txt')).toBe('at tc')
      expect(tcResult.get('default.svg')).toBe('<svg>at tc</svg>')

      const snapMapping = companionMap.get('AlphaTab Snap')
      const snapResult = applyCompanionAliases(files, snapMapping)
      expect(snapResult.get('openings_and_additions.txt')).toBe('at snap')
      expect(snapResult.get('default.svg')).toBe('<svg>at snap</svg>')
    })
  })

  describe('applyCompanionAliases — generic aliases', () => {
    it('should apply generic aliases from mapping.aliases', () => {
      const files = new Map([
        ['main.scad', '// scad'],
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
      expect(result.get('config.txt')).toBe('preset data')
      expect(result.get('logo.svg')).toBe('<svg>logo</svg>')
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

    it('should prefer generic aliases over legacy format', () => {
      const files = new Map([
        ['main.scad', '// scad'],
        ['nested/custom.txt', 'custom content'],
        ['other/openings_and_additions.txt', 'should not be used'],
      ])
      const mapping = {
        aliases: { 'custom.txt': 'nested/custom.txt' },
        openingsPath: 'other/openings_and_additions.txt',
      }
      const result = applyCompanionAliases(files, mapping)
      expect(result.get('custom.txt')).toBe('custom content')
      expect(result.has('openings_and_additions.txt')).toBe(false)
    })

    it('should resolve a non-keyguard project without magic filenames', () => {
      const files = new Map([
        ['main.scad', 'include <settings.txt>\nimport("pattern.svg")'],
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
      expect(result.get('settings.txt')).toBe('preset A settings')
      expect(result.get('pattern.svg')).toBe('<svg>A</svg>')
      expect(result.has('default.svg')).toBe(false)
      expect(result.has('openings_and_additions.txt')).toBe(false)
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

    it('should integrate generic map with applyCompanionAliases', () => {
      const files = makeFiles([
        ['main.scad', 'include <data.txt>'],
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
      expect(alphaResult.get('data.txt')).toBe('alpha data')
      expect(alphaResult.has('openings_and_additions.txt')).toBe(false)
      expect(alphaResult.has('default.svg')).toBe(false)

      const betaMapping = companionMap.get('Beta Work')
      const betaResult = applyCompanionAliases(files, betaMapping)
      expect(betaResult.get('data.txt')).toBe('beta data')
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
})
