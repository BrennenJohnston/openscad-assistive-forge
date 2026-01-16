import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { PresetManager } from '../../src/js/preset-manager.js'

describe('Preset Manager', () => {
  let presetManager
  let modelName

  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear()
    
    modelName = 'test-model'
    presetManager = new PresetManager()
  })

  afterEach(() => {
    // Cleanup
    localStorage.clear()
  })

  describe('Initialization', () => {
    it('should initialize without errors', () => {
      expect(presetManager).toBeDefined()
      expect(presetManager.presets).toBeDefined()
    })

    it('should load existing presets from localStorage', () => {
      // Manually set some presets in localStorage
      const existingData = {
        [modelName]: [
          { 
            id: '1',
            name: 'Preset 1', 
            parameters: { width: 100 },
            created: Date.now(),
            modified: Date.now(),
            description: ''
          }
        ]
      }
      localStorage.setItem(
        'openscad-customizer-presets',
        JSON.stringify(existingData)
      )
      
      const manager = new PresetManager()
      const presets = manager.getPresetsForModel(modelName)
      
      expect(presets).toHaveLength(1)
      expect(presets[0].name).toBe('Preset 1')
    })

    it('should handle missing localStorage data', () => {
      const manager = new PresetManager()
      const presets = manager.getPresetsForModel(modelName)
      
      expect(Array.isArray(presets)).toBe(true)
      expect(presets).toHaveLength(0)
    })

    it('should handle corrupted localStorage data', () => {
      localStorage.setItem('openscad-customizer-presets', 'invalid json')
      
      const manager = new PresetManager()
      const presets = manager.getPresetsForModel(modelName)
      
      expect(Array.isArray(presets)).toBe(true)
      expect(presets).toHaveLength(0)
    })
  })

  describe('Saving Presets', () => {
    it('should save preset with name and parameters', () => {
      const preset = presetManager.savePreset(
        modelName,
        'Test Preset',
        { width: 100, height: 50 }
      )
      
      expect(preset).toBeDefined()
      expect(preset.name).toBe('Test Preset')
      expect(preset.parameters).toEqual({ width: 100, height: 50 })
      expect(preset.id).toBeDefined()
    })

    it('should add timestamp to saved preset', () => {
      const beforeTime = Date.now()
      const preset = presetManager.savePreset(modelName, 'Test', { width: 100 })
      const afterTime = Date.now()
      
      expect(preset.created).toBeDefined()
      expect(preset.created).toBeGreaterThanOrEqual(beforeTime)
      expect(preset.created).toBeLessThanOrEqual(afterTime)
      expect(preset.modified).toBeDefined()
    })

    it('should save preset with optional description', () => {
      const preset = presetManager.savePreset(
        modelName,
        'Test',
        { width: 100 },
        { description: 'My description' }
      )
      
      expect(preset.description).toBe('My description')
    })

    it('should update existing preset with same name', () => {
      presetManager.savePreset(modelName, 'Test', { width: 100 })
      presetManager.savePreset(modelName, 'Test', { width: 150 })
      
      const presets = presetManager.getPresetsForModel(modelName)
      expect(presets).toHaveLength(1)
      expect(presets[0].parameters.width).toBe(150)
    })

    it('should save multiple presets', () => {
      presetManager.savePreset(modelName, 'Preset 1', { width: 100 })
      presetManager.savePreset(modelName, 'Preset 2', { width: 150 })
      presetManager.savePreset(modelName, 'Preset 3', { width: 200 })
      
      const presets = presetManager.getPresetsForModel(modelName)
      expect(presets).toHaveLength(3)
    })

    it('should persist to localStorage', () => {
      presetManager.savePreset(modelName, 'Test', { width: 100 })
      
      // Create new instance to verify persistence
      const newManager = new PresetManager()
      const presets = newManager.getPresetsForModel(modelName)
      
      expect(presets).toHaveLength(1)
      expect(presets[0].name).toBe('Test')
    })
  })

  describe('Loading Presets', () => {
    let presetId1, presetId2

    beforeEach(() => {
      const p1 = presetManager.savePreset(modelName, 'Preset 1', { width: 100 })
      const p2 = presetManager.savePreset(modelName, 'Preset 2', { width: 150 })
      presetId1 = p1.id
      presetId2 = p2.id
    })

    it('should load preset by ID', () => {
      const preset = presetManager.loadPreset(modelName, presetId1)
      
      expect(preset).toBeDefined()
      expect(preset.name).toBe('Preset 1')
      expect(preset.parameters).toEqual({ width: 100 })
    })

    it('should return null for non-existent preset', () => {
      const preset = presetManager.loadPreset(modelName, 'non-existent-id')
      
      // May return null or undefined depending on implementation
      expect(preset).toBeFalsy()
    })

    it('should return all presets for model', () => {
      const presets = presetManager.getPresetsForModel(modelName)
      
      expect(presets).toHaveLength(2)
      expect(presets[0].name).toBe('Preset 1')
      expect(presets[1].name).toBe('Preset 2')
    })
  })

  describe('Deleting Presets', () => {
    let presetId1, presetId2, presetId3

    beforeEach(() => {
      const p1 = presetManager.savePreset(modelName, 'Preset 1', { width: 100 })
      const p2 = presetManager.savePreset(modelName, 'Preset 2', { width: 150 })
      const p3 = presetManager.savePreset(modelName, 'Preset 3', { width: 200 })
      presetId1 = p1.id
      presetId2 = p2.id
      presetId3 = p3.id
    })

    it('should delete preset by ID', () => {
      const result = presetManager.deletePreset(modelName, presetId2)
      
      expect(result).toBe(true)
      const presets = presetManager.getPresetsForModel(modelName)
      expect(presets).toHaveLength(2)
      expect(presets.find(p => p.id === presetId2)).toBeUndefined()
    })

    it('should persist deletion to localStorage', () => {
      presetManager.deletePreset(modelName, presetId2)
      
      const newManager = new PresetManager()
      const presets = newManager.getPresetsForModel(modelName)
      
      expect(presets).toHaveLength(2)
      expect(presets.find(p => p.id === presetId2)).toBeUndefined()
    })

    it('should handle deleting non-existent preset', () => {
      const result = presetManager.deletePreset(modelName, 'non-existent-id')
      
      expect(result).toBe(false)
      const presets = presetManager.getPresetsForModel(modelName)
      expect(presets).toHaveLength(3)
    })

    it('should delete all presets', () => {
      presetManager.deletePreset(modelName, presetId1)
      presetManager.deletePreset(modelName, presetId2)
      presetManager.deletePreset(modelName, presetId3)
      
      const presets = presetManager.getPresetsForModel(modelName)
      expect(presets).toHaveLength(0)
    })
  })

  describe('Exporting Presets', () => {
    let presetId1, presetId2

    beforeEach(() => {
      const p1 = presetManager.savePreset(
        modelName,
        'Preset 1',
        { width: 100 },
        { description: 'First preset' }
      )
      const p2 = presetManager.savePreset(
        modelName,
        'Preset 2',
        { width: 150 },
        { description: 'Second preset' }
      )
      presetId1 = p1.id
      presetId2 = p2.id
    })

    it('should export all presets as JSON string', () => {
      const exported = presetManager.exportAllPresets(modelName)
      
      expect(typeof exported).toBe('string')
      
      const parsed = JSON.parse(exported)
      expect(parsed.version).toBe('1.0.0')
      expect(parsed.type).toBe('openscad-presets-collection')
      expect(parsed.modelName).toBe(modelName)
      expect(parsed.presets).toHaveLength(2)
    })

    it('should export single preset', () => {
      const exported = presetManager.exportPreset(modelName, presetId1)
      
      expect(typeof exported).toBe('string')
      
      const parsed = JSON.parse(exported)
      expect(parsed.version).toBe('1.0.0')
      expect(parsed.type).toBe('openscad-preset')
      expect(parsed.preset.name).toBe('Preset 1')
      expect(parsed.preset.parameters).toEqual({ width: 100 })
    })

    it('should include metadata in export', () => {
      const exported = presetManager.exportAllPresets(modelName)
      const parsed = JSON.parse(exported)
      
      expect(parsed.exported).toBeDefined()
      expect(parsed.presets[0].created).toBeDefined()
      expect(parsed.presets[0].description).toBe('First preset')
    })
  })

  describe('Importing Presets', () => {
    it('should import presets from collection JSON', () => {
      const importData = {
        version: '1.0.0',
        type: 'openscad-presets-collection',
        modelName: modelName,
        presets: [
          { name: 'Imported 1', parameters: { width: 100 }, description: '', created: Date.now() },
          { name: 'Imported 2', parameters: { width: 150 }, description: '', created: Date.now() }
        ],
        exported: Date.now()
      }
      const json = JSON.stringify(importData)
      
      const result = presetManager.importPreset(json)
      
      expect(result.success).toBe(true)
      expect(result.imported).toBe(2)
      
      const presets = presetManager.getPresetsForModel(modelName)
      expect(presets).toHaveLength(2)
      expect(presets[0].name).toBe('Imported 1')
    })

    it('should import single preset', () => {
      const importData = {
        version: '1.0.0',
        type: 'openscad-preset',
        modelName: modelName,
        preset: {
          name: 'Imported',
          parameters: { width: 100 },
          description: '',
          created: Date.now()
        },
        exported: Date.now()
      }
      const json = JSON.stringify(importData)
      
      const result = presetManager.importPreset(json)
      
      expect(result.success).toBe(true)
      const presets = presetManager.getPresetsForModel(modelName)
      expect(presets).toHaveLength(1)
      expect(presets[0].name).toBe('Imported')
    })

    it('should merge imported presets with existing', () => {
      presetManager.savePreset(modelName, 'Existing', { width: 100 })
      
      const importData = {
        version: '1.0.0',
        type: 'openscad-preset',
        modelName: modelName,
        preset: {
          name: 'Imported',
          parameters: { width: 150 },
          description: '',
          created: Date.now()
        },
        exported: Date.now()
      }
      
      presetManager.importPreset(JSON.stringify(importData))
      
      const presets = presetManager.getPresetsForModel(modelName)
      expect(presets).toHaveLength(2)
    })

    it('should update existing preset on name conflict', () => {
      presetManager.savePreset(modelName, 'Test', { width: 100 })
      
      const importData = {
        version: '1.0.0',
        type: 'openscad-preset',
        modelName: modelName,
        preset: {
          name: 'Test',
          parameters: { width: 200 },
          description: '',
          created: Date.now()
        },
        exported: Date.now()
      }
      
      presetManager.importPreset(JSON.stringify(importData))
      
      const presets = presetManager.getPresetsForModel(modelName)
      expect(presets).toHaveLength(1)
      expect(presets[0].parameters.width).toBe(200)
    })

    it('should handle invalid JSON gracefully', () => {
      const result = presetManager.importPreset('invalid json')
      
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('should handle invalid format', () => {
      const invalid = { notAPreset: true }
      const result = presetManager.importPreset(JSON.stringify(invalid))
      
      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid preset file format')
    })
  })

  describe('Preset Validation', () => {
    it('should reject preset without model name', () => {
      expect(() => {
        presetManager.savePreset('', 'Test', { width: 100 })
      }).toThrow()
    })

    it('should reject preset without name', () => {
      expect(() => {
        presetManager.savePreset(modelName, '', { width: 100 })
      }).toThrow()
    })

    it('should reject preset with invalid parameters', () => {
      expect(() => {
        presetManager.savePreset(modelName, 'Test', null)
      }).toThrow()
    })
  })

  describe('Model Isolation', () => {
    it('should isolate presets by model name', () => {
      const model1 = 'model-1'
      const model2 = 'model-2'
      
      presetManager.savePreset(model1, 'Preset', { width: 100 })
      presetManager.savePreset(model2, 'Preset', { width: 200 })
      
      const presets1 = presetManager.getPresetsForModel(model1)
      const presets2 = presetManager.getPresetsForModel(model2)
      
      expect(presets1[0].parameters.width).toBe(100)
      expect(presets2[0].parameters.width).toBe(200)
    })

    it('should not share presets between different models', () => {
      const model1 = 'model-1'
      const model2 = 'model-2'
      
      presetManager.savePreset(model1, 'Test', { width: 100 })
      
      const presets2 = presetManager.getPresetsForModel(model2)
      expect(presets2).toHaveLength(0)
    })
  })

  describe('Storage Quota Handling', () => {
    it('should handle quota exceeded error gracefully', () => {
      // Mock localStorage.setItem to throw quota error
      const originalSetItem = localStorage.setItem
      const originalGetItem = localStorage.getItem
      const consoleWarnSpy = vi.spyOn(console, 'warn')
      
      // Make both setItem and getItem throw to simulate storage unavailable
      localStorage.setItem = vi.fn(() => {
        const error = new Error('QuotaExceededError')
        error.name = 'QuotaExceededError'
        throw error
      })
      
      localStorage.getItem = vi.fn(() => {
        throw new Error('QuotaExceededError')
      })
      
      // Should not throw, but handle gracefully
      let preset
      expect(() => {
        preset = presetManager.savePreset(modelName, 'Test', { width: 100 })
      }).not.toThrow()
      
      // Preset should still be saved in memory
      expect(preset).toBeDefined()
      expect(preset.name).toBe('Test')
      
      // Warning should be logged (since storage is unavailable)
      expect(consoleWarnSpy).toHaveBeenCalled()
      
      // Restore original
      localStorage.setItem = originalSetItem
      localStorage.getItem = originalGetItem
      consoleWarnSpy.mockRestore()
    })
  })
})
