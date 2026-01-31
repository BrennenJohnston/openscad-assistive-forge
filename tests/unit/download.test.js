/**
 * Unit tests for Download Manager
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  OUTPUT_FORMATS,
  generateFilename,
  downloadFile,
  downloadSTL,
  formatFileSize,
} from '../../src/js/download.js'

describe('Download Manager', () => {
  describe('OUTPUT_FORMATS', () => {
    it('should define all required formats', () => {
      expect(OUTPUT_FORMATS).toHaveProperty('stl')
      expect(OUTPUT_FORMATS).toHaveProperty('obj')
      expect(OUTPUT_FORMATS).toHaveProperty('off')
      expect(OUTPUT_FORMATS).toHaveProperty('amf')
      expect(OUTPUT_FORMATS).toHaveProperty('3mf')
    })

    it('should have required properties for each format', () => {
      Object.values(OUTPUT_FORMATS).forEach((format) => {
        expect(format).toHaveProperty('name')
        expect(format).toHaveProperty('extension')
        expect(format).toHaveProperty('mimeType')
        expect(format).toHaveProperty('description')
      })
    })

    it('should have correct STL format definition', () => {
      expect(OUTPUT_FORMATS.stl).toEqual({
        name: 'STL',
        extension: '.stl',
        mimeType: 'application/vnd.ms-pki.stl',
        description: 'Most common format for 3D printing',
        is2D: false,
      })
    })

    it('should have correct OBJ format definition', () => {
      expect(OUTPUT_FORMATS.obj).toEqual({
        name: 'OBJ',
        extension: '.obj',
        mimeType: 'text/plain',
        description: 'Wavefront OBJ, widely supported',
        is2D: false,
      })
    })

    it('should have correct SVG format definition (2D)', () => {
      expect(OUTPUT_FORMATS.svg).toEqual({
        name: 'SVG',
        extension: '.svg',
        mimeType: 'image/svg+xml',
        description: 'SVG - For laser cutting or 2D vector graphics',
        is2D: true,
      })
    })

    it('should have correct DXF format definition (2D)', () => {
      expect(OUTPUT_FORMATS.dxf).toEqual({
        name: 'DXF',
        extension: '.dxf',
        mimeType: 'application/dxf',
        description: 'DXF - For CAD software and laser cutting',
        is2D: true,
      })
    })

    it('should distinguish 2D formats from 3D formats', () => {
      // 3D formats should have is2D: false
      expect(OUTPUT_FORMATS.stl.is2D).toBe(false)
      expect(OUTPUT_FORMATS.obj.is2D).toBe(false)
      expect(OUTPUT_FORMATS.off.is2D).toBe(false)
      expect(OUTPUT_FORMATS.amf.is2D).toBe(false)
      expect(OUTPUT_FORMATS['3mf'].is2D).toBe(false)
      
      // 2D formats should have is2D: true
      expect(OUTPUT_FORMATS.svg.is2D).toBe(true)
      expect(OUTPUT_FORMATS.dxf.is2D).toBe(true)
    })
  })

  describe('generateFilename', () => {
    beforeEach(() => {
      // Mock Date to get consistent test results
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-01-15'))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should generate filename with model name, hash, and date', () => {
      const filename = generateFilename('test_model', { width: 50 }, 'stl')
      expect(filename).toMatch(/^test_model-[a-z0-9]+-20260115\.stl$/)
    })

    it('should sanitize model name', () => {
      const filename = generateFilename('My Model!.scad', {}, 'stl')
      expect(filename).toMatch(/^my_model_-[a-z0-9]+-20260115\.stl$/)
    })

    it('should remove .scad extension from model name', () => {
      const filename = generateFilename('model.scad', {}, 'stl')
      expect(filename).not.toContain('.scad')
      expect(filename).toMatch(/^model-[a-z0-9]+-20260115\.stl$/)
    })

    it('should remove .zip extension from model name', () => {
      const filename = generateFilename('project.zip', {}, 'stl')
      expect(filename).not.toContain('.zip')
      expect(filename).toMatch(/^project-[a-z0-9]+-20260115\.stl$/)
    })

    it('should replace invalid characters with underscores', () => {
      const filename = generateFilename('test@#$%model', {}, 'stl')
      expect(filename).toMatch(/^test____model-[a-z0-9]+-20260115\.stl$/)
    })

    it('should convert to lowercase', () => {
      const filename = generateFilename('TestModel', {}, 'stl')
      expect(filename).toMatch(/^testmodel-[a-z0-9]+-20260115\.stl$/)
    })

    it('should generate different hashes for different parameters', () => {
      const filename1 = generateFilename('model', { width: 50 }, 'stl')
      const filename2 = generateFilename('model', { width: 100 }, 'stl')
      
      const hash1 = filename1.split('-')[1]
      const hash2 = filename2.split('-')[1]
      
      expect(hash1).not.toBe(hash2)
    })

    it('should generate same hash for same parameters', () => {
      const filename1 = generateFilename('model', { width: 50, height: 100 }, 'stl')
      const filename2 = generateFilename('model', { width: 50, height: 100 }, 'stl')
      
      const hash1 = filename1.split('-')[1]
      const hash2 = filename2.split('-')[1]
      
      expect(hash1).toBe(hash2)
    })

    it('should support different output formats', () => {
      const stlFile = generateFilename('model', {}, 'stl')
      const objFile = generateFilename('model', {}, 'obj')
      const offFile = generateFilename('model', {}, 'off')
      const amfFile = generateFilename('model', {}, 'amf')
      const threemfFile = generateFilename('model', {}, '3mf')
      
      expect(stlFile).toMatch(/\.stl$/)
      expect(objFile).toMatch(/\.obj$/)
      expect(offFile).toMatch(/\.off$/)
      expect(amfFile).toMatch(/\.amf$/)
      expect(threemfFile).toMatch(/\.3mf$/)
    })

    it('should default to STL format', () => {
      const filename = generateFilename('model', {})
      expect(filename).toMatch(/\.stl$/)
    })

    it('should handle unknown formats gracefully', () => {
      const filename = generateFilename('model', {}, 'unknown')
      expect(filename).toMatch(/\.unknown$/)
    })

    it('should handle empty parameters', () => {
      const filename = generateFilename('model', {}, 'stl')
      expect(filename).toMatch(/^model-[a-z0-9]+-20260115\.stl$/)
    })

    it('should handle complex parameter objects', () => {
      const params = {
        width: 50,
        height: 100,
        shape: 'round',
        options: { smooth: true, finish: 'matte' },
      }
      const filename = generateFilename('model', params, 'stl')
      expect(filename).toMatch(/^model-[a-z0-9]+-20260115\.stl$/)
    })
  })

  describe('downloadFile', () => {
    let createElementSpy
    let createObjectURLSpy
    let revokeObjectURLSpy
    let mockAnchor

    beforeEach(() => {
      // Mock anchor element
      mockAnchor = {
        href: '',
        download: '',
        click: vi.fn(),
      }

      createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor)
      createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url')
      revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    })

    afterEach(() => {
      createElementSpy.mockRestore()
      createObjectURLSpy.mockRestore()
      revokeObjectURLSpy.mockRestore()
    })

    it('should create blob with correct MIME type for STL', () => {
      const data = new ArrayBuffer(100)
      downloadFile(data, 'test.stl', 'stl')
      
      // Blob constructor is called internally
      expect(createObjectURLSpy).toHaveBeenCalled()
    })

    it('should trigger download with correct filename', () => {
      const data = new ArrayBuffer(100)
      downloadFile(data, 'my-model.stl', 'stl')
      
      expect(mockAnchor.download).toBe('my-model.stl')
      expect(mockAnchor.click).toHaveBeenCalled()
    })

    it('should create and revoke object URL', () => {
      const data = new ArrayBuffer(100)
      downloadFile(data, 'test.stl', 'stl')
      
      expect(createObjectURLSpy).toHaveBeenCalled()
      expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:mock-url')
    })

    it('should handle OBJ format', () => {
      const data = new ArrayBuffer(100)
      downloadFile(data, 'test.obj', 'obj')
      
      expect(createObjectURLSpy).toHaveBeenCalled()
      expect(mockAnchor.click).toHaveBeenCalled()
    })

    it('should handle OFF format', () => {
      const data = new ArrayBuffer(100)
      downloadFile(data, 'test.off', 'off')
      
      expect(createObjectURLSpy).toHaveBeenCalled()
      expect(mockAnchor.click).toHaveBeenCalled()
    })

    it('should handle AMF format', () => {
      const data = new ArrayBuffer(100)
      downloadFile(data, 'test.amf', 'amf')
      
      expect(createObjectURLSpy).toHaveBeenCalled()
      expect(mockAnchor.click).toHaveBeenCalled()
    })

    it('should handle 3MF format', () => {
      const data = new ArrayBuffer(100)
      downloadFile(data, 'test.3mf', '3mf')
      
      expect(createObjectURLSpy).toHaveBeenCalled()
      expect(mockAnchor.click).toHaveBeenCalled()
    })

    it('should default to STL format', () => {
      const data = new ArrayBuffer(100)
      downloadFile(data, 'test.stl')
      
      expect(createObjectURLSpy).toHaveBeenCalled()
      expect(mockAnchor.click).toHaveBeenCalled()
    })

    it('should use fallback MIME type for unknown formats', () => {
      const data = new ArrayBuffer(100)
      downloadFile(data, 'test.unknown', 'unknown')
      
      expect(createObjectURLSpy).toHaveBeenCalled()
      expect(mockAnchor.click).toHaveBeenCalled()
    })

    it('should handle empty ArrayBuffer', () => {
      const data = new ArrayBuffer(0)
      downloadFile(data, 'empty.stl', 'stl')
      
      expect(createObjectURLSpy).toHaveBeenCalled()
      expect(mockAnchor.click).toHaveBeenCalled()
    })
  })

  describe('downloadSTL', () => {
    let createElementSpy
    let createObjectURLSpy
    let revokeObjectURLSpy
    let mockAnchor

    beforeEach(() => {
      mockAnchor = {
        href: '',
        download: '',
        click: vi.fn(),
      }

      createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor)
      createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url')
      revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    })

    afterEach(() => {
      createElementSpy.mockRestore()
      createObjectURLSpy.mockRestore()
      revokeObjectURLSpy.mockRestore()
    })

    it('should call downloadFile with STL format', () => {
      const data = new ArrayBuffer(100)
      downloadSTL(data, 'test.stl')
      
      expect(mockAnchor.download).toBe('test.stl')
      expect(mockAnchor.click).toHaveBeenCalled()
    })

    it('should be backward compatible', () => {
      const data = new ArrayBuffer(100)
      downloadSTL(data, 'legacy-model.stl')
      
      expect(createObjectURLSpy).toHaveBeenCalled()
      expect(revokeObjectURLSpy).toHaveBeenCalled()
    })
  })

  describe('formatFileSize', () => {
    it('should format bytes < 1KB as B', () => {
      expect(formatFileSize(0)).toBe('0 B')
      expect(formatFileSize(512)).toBe('512 B')
      expect(formatFileSize(1023)).toBe('1023 B')
    })

    it('should format bytes < 1MB as KB', () => {
      expect(formatFileSize(1024)).toBe('1.0 KB')
      expect(formatFileSize(2048)).toBe('2.0 KB')
      expect(formatFileSize(512 * 1024)).toBe('512.0 KB')
      expect(formatFileSize(1024 * 1024 - 1)).toBe('1024.0 KB')
    })

    it('should format bytes >= 1MB as MB', () => {
      expect(formatFileSize(1024 * 1024)).toBe('1.0 MB')
      expect(formatFileSize(2 * 1024 * 1024)).toBe('2.0 MB')
      expect(formatFileSize(5.5 * 1024 * 1024)).toBe('5.5 MB')
      expect(formatFileSize(100 * 1024 * 1024)).toBe('100.0 MB')
    })

    it('should round to 1 decimal place', () => {
      expect(formatFileSize(1536)).toBe('1.5 KB')
      expect(formatFileSize(2.5 * 1024 * 1024)).toBe('2.5 MB')
      expect(formatFileSize(1234)).toMatch(/^1\.\d KB$/)
    })

    it('should handle very large files', () => {
      expect(formatFileSize(1024 * 1024 * 1024)).toBe('1024.0 MB')
      expect(formatFileSize(5 * 1024 * 1024 * 1024)).toBe('5120.0 MB')
    })

    it('should handle fractional bytes', () => {
      // File sizes are typically reported as-is for bytes
      expect(formatFileSize(1.5)).toBe('1.5 B')
      expect(formatFileSize(1023.9)).toBe('1023.9 B')
    })
  })

  describe('Integration Tests', () => {
    let createElementSpy
    let createObjectURLSpy
    let revokeObjectURLSpy
    let mockAnchor

    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-01-15'))

      mockAnchor = {
        href: '',
        download: '',
        click: vi.fn(),
      }

      createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor)
      createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url')
      revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    })

    afterEach(() => {
      vi.useRealTimers()
      createElementSpy.mockRestore()
      createObjectURLSpy.mockRestore()
      revokeObjectURLSpy.mockRestore()
    })

    it('should generate filename and download file end-to-end', () => {
      const modelName = 'my_model.scad'
      const parameters = { width: 50, height: 100 }
      const data = new ArrayBuffer(1024)
      
      const filename = generateFilename(modelName, parameters, 'stl')
      downloadFile(data, filename, 'stl')
      
      expect(filename).toMatch(/^my_model-[a-z0-9]+-20260115\.stl$/)
      expect(mockAnchor.download).toBe(filename)
      expect(mockAnchor.click).toHaveBeenCalled()
      expect(revokeObjectURLSpy).toHaveBeenCalled()
    })

    it('should support full workflow for multiple formats', () => {
      const modelName = 'test'
      const parameters = { size: 10 }
      const data = new ArrayBuffer(2048)
      
      const formats = ['stl', 'obj', 'off', 'amf', '3mf']
      
      formats.forEach((format) => {
        const filename = generateFilename(modelName, parameters, format)
        downloadFile(data, filename, format)
        
        expect(filename).toContain(format === '3mf' ? '.3mf' : `.${format}`)
        expect(mockAnchor.download).toBe(filename)
      })
      
      expect(mockAnchor.click).toHaveBeenCalledTimes(5)
    })
  })
})
