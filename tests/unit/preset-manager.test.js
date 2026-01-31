import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { PresetManager, coercePresetValues, extractScadVersion, compareVersions } from '../../src/js/preset-manager.js'

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

  describe('Listener Notifications', () => {
    it('should notify listeners on save', () => {
      const listener = vi.fn()
      presetManager.subscribe(listener)
      
      presetManager.savePreset(modelName, 'Test', { width: 100 })
      
      expect(listener).toHaveBeenCalledWith(
        'save',
        expect.objectContaining({ name: 'Test' }),
        modelName
      )
    })

    it('should notify listeners on delete', () => {
      const preset = presetManager.savePreset(modelName, 'Test', { width: 100 })
      const listener = vi.fn()
      presetManager.subscribe(listener)
      
      presetManager.deletePreset(modelName, preset.id)
      
      expect(listener).toHaveBeenCalledWith(
        'delete',
        expect.objectContaining({ id: preset.id }),
        modelName
      )
    })

    it('should handle listener errors gracefully', () => {
      const errorListener = vi.fn(() => { throw new Error('Listener error') })
      const goodListener = vi.fn()
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      
      presetManager.subscribe(errorListener)
      presetManager.subscribe(goodListener)
      
      presetManager.savePreset(modelName, 'Test', { width: 100 })
      
      expect(consoleSpy).toHaveBeenCalled()
      expect(goodListener).toHaveBeenCalled()
      
      consoleSpy.mockRestore()
    })

    it('should allow unsubscribing', () => {
      const listener = vi.fn()
      const unsubscribe = presetManager.subscribe(listener)
      
      unsubscribe()
      presetManager.savePreset(modelName, 'Test', { width: 100 })
      
      expect(listener).not.toHaveBeenCalled()
    })
  })

  describe('Statistics', () => {
    it('should return correct stats', () => {
      presetManager.savePreset('model-1', 'Preset 1', { width: 100 })
      presetManager.savePreset('model-1', 'Preset 2', { width: 200 })
      presetManager.savePreset('model-2', 'Preset 1', { width: 300 })
      
      const stats = presetManager.getStats()
      
      expect(stats.modelCount).toBe(2)
      expect(stats.totalPresets).toBe(3)
      expect(stats.models).toContain('model-1')
      expect(stats.models).toContain('model-2')
    })

    it('should return empty stats when no presets', () => {
      // Create a fresh PresetManager with empty state
      const freshManager = new PresetManager()
      freshManager.presets = {}
      
      const stats = freshManager.getStats()
      
      expect(stats.modelCount).toBe(0)
      expect(stats.totalPresets).toBe(0)
      expect(stats.models).toHaveLength(0)
    })
  })

  describe('Storage Availability', () => {
    it('should detect storage availability', () => {
      expect(presetManager.isStorageAvailable()).toBe(true)
    })

    it('should handle storage unavailability', () => {
      const originalSetItem = localStorage.setItem
      const originalRemoveItem = localStorage.removeItem
      
      localStorage.setItem = vi.fn(() => { throw new Error('Storage error') })
      localStorage.removeItem = vi.fn()
      
      expect(presetManager.isStorageAvailable()).toBe(false)
      
      localStorage.setItem = originalSetItem
      localStorage.removeItem = originalRemoveItem
    })
  })

  describe('ID Generation', () => {
    it('should generate unique IDs', () => {
      const id1 = presetManager.generateId()
      const id2 = presetManager.generateId()
      
      expect(id1).not.toBe(id2)
      expect(id1).toMatch(/^preset-\d+-[a-z0-9]+$/)
    })
  })

  describe('OpenSCAD Native Format Import', () => {
    it('should import OpenSCAD native preset format (parameterSets)', () => {
      const openscadPresets = {
        parameterSets: {
          'Ken\'s Keyguard': {
            width: '200',
            height: '150',
            thickness: '3.5'
          },
          'Large Version': {
            width: '300',
            height: '200',
            thickness: '5.0'
          }
        },
        fileFormatVersion: '1'
      }
      const json = JSON.stringify(openscadPresets)
      
      const result = presetManager.importPreset(json, modelName)
      
      expect(result.success).toBe(true)
      expect(result.format).toBe('openscad-native')
      expect(result.imported).toBe(2)
      
      const presets = presetManager.getPresetsForModel(modelName)
      expect(presets).toHaveLength(2)
      expect(presets.find(p => p.name === 'Ken\'s Keyguard')).toBeDefined()
      expect(presets.find(p => p.name === 'Large Version')).toBeDefined()
    })

    it('should coerce string values to proper types during import', () => {
      const paramSchema = {
        width: { type: 'number' },
        enabled: { type: 'boolean' },
        count: { type: 'integer' }
      }
      
      const openscadPresets = {
        parameterSets: {
          'Test': {
            width: '100.5',
            enabled: 'true',
            count: '42'
          }
        },
        fileFormatVersion: '1'
      }
      
      const result = presetManager.importPreset(
        JSON.stringify(openscadPresets), 
        modelName, 
        paramSchema
      )
      
      expect(result.success).toBe(true)
      const presets = presetManager.getPresetsForModel(modelName)
      expect(presets[0].parameters.width).toBe(100.5)
      expect(presets[0].parameters.enabled).toBe(true)
      expect(presets[0].parameters.count).toBe(42)
    })

    it('should handle OpenSCAD yes/no boolean strings', () => {
      const paramSchema = {
        have_frame: { type: 'boolean' },
        use_supports: { type: 'boolean' }
      }
      
      const openscadPresets = {
        parameterSets: {
          'Test': {
            have_frame: 'yes',
            use_supports: 'no'
          }
        },
        fileFormatVersion: '1'
      }
      
      const result = presetManager.importPreset(
        JSON.stringify(openscadPresets), 
        modelName, 
        paramSchema
      )
      
      const presets = presetManager.getPresetsForModel(modelName)
      expect(presets[0].parameters.have_frame).toBe(true)
      expect(presets[0].parameters.use_supports).toBe(false)
    })

    it('should handle vector/array values in OpenSCAD format', () => {
      const paramSchema = {
        position: { type: 'vector' }
      }
      
      const openscadPresets = {
        parameterSets: {
          'Test': {
            position: '[10, 20, 30]'
          }
        },
        fileFormatVersion: '1'
      }
      
      const result = presetManager.importPreset(
        JSON.stringify(openscadPresets), 
        modelName, 
        paramSchema
      )
      
      const presets = presetManager.getPresetsForModel(modelName)
      expect(presets[0].parameters.position).toEqual([10, 20, 30])
    })

    it('should warn but continue for unknown fileFormatVersion', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      
      const openscadPresets = {
        parameterSets: {
          'Test': { width: '100' }
        },
        fileFormatVersion: '99'  // Unknown version
      }
      
      const result = presetManager.importPreset(
        JSON.stringify(openscadPresets), 
        modelName
      )
      
      expect(result.success).toBe(true)
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unknown OpenSCAD preset file format version')
      )
      
      consoleWarnSpy.mockRestore()
    })

    it('should use fallback model name when not provided', () => {
      const openscadPresets = {
        parameterSets: {
          'Test': { width: '100' }
        },
        fileFormatVersion: '1'
      }
      
      const result = presetManager.importPreset(JSON.stringify(openscadPresets))
      
      expect(result.success).toBe(true)
      expect(result.modelName).toBe('Unknown Model')
    })
  })

  describe('OpenSCAD Native Format Export', () => {
    beforeEach(() => {
      presetManager.savePreset(modelName, 'Preset 1', { 
        width: 100, 
        enabled: true,
        name: 'test'
      })
      presetManager.savePreset(modelName, 'Preset 2', { 
        width: 200, 
        enabled: false,
        name: 'test2'
      })
    })

    it('should export to OpenSCAD native format', () => {
      const exported = presetManager.exportOpenSCADNativeFormat(modelName)
      
      expect(typeof exported).toBe('string')
      
      const parsed = JSON.parse(exported)
      expect(parsed.fileFormatVersion).toBe('1')
      expect(parsed.parameterSets).toBeDefined()
      expect(Object.keys(parsed.parameterSets)).toHaveLength(2)
    })

    it('should stringify all values in OpenSCAD export', () => {
      const exported = presetManager.exportOpenSCADNativeFormat(modelName)
      const parsed = JSON.parse(exported)
      
      const preset1 = parsed.parameterSets['Preset 1']
      expect(typeof preset1.width).toBe('string')
      expect(preset1.width).toBe('100')
      expect(typeof preset1.enabled).toBe('string')
      expect(preset1.enabled).toBe('true')
    })

    it('should export single preset to OpenSCAD native format', () => {
      const presets = presetManager.getPresetsForModel(modelName)
      const exported = presetManager.exportPresetOpenSCADNative(modelName, presets[0].id)
      
      const parsed = JSON.parse(exported)
      expect(parsed.fileFormatVersion).toBe('1')
      expect(Object.keys(parsed.parameterSets)).toHaveLength(1)
    })

    it('should return null when no presets exist', () => {
      const result = presetManager.exportOpenSCADNativeFormat('non-existent-model')
      expect(result).toBeNull()
    })
  })

  describe('Changed Parameters Export', () => {
    it('should detect changed parameters', () => {
      const currentParams = {
        width: 150,
        height: 100,
        enabled: true
      }
      const defaultParams = {
        width: { default: 100 },
        height: { default: 100 },
        enabled: { default: true }
      }
      
      const changed = presetManager.getChangedParameters(currentParams, defaultParams)
      
      expect(Object.keys(changed)).toHaveLength(1)
      expect(changed.width).toBeDefined()
      expect(changed.width.current).toBe(150)
      expect(changed.width.default).toBe(100)
    })

    it('should handle floating point comparison', () => {
      const currentParams = { value: 100.00001 }
      const defaultParams = { value: { default: 100 } }
      
      const changed = presetManager.getChangedParameters(currentParams, defaultParams)
      
      // Should be considered equal (within tolerance)
      expect(Object.keys(changed)).toHaveLength(0)
    })

    it('should export changed parameters as JSON', () => {
      const currentParams = { width: 150, height: 100 }
      const defaultParams = {
        width: { default: 100 },
        height: { default: 100 }
      }
      
      const exported = presetManager.exportChangedParametersJSON(
        currentParams, 
        defaultParams, 
        modelName
      )
      
      const parsed = JSON.parse(exported)
      expect(parsed.type).toBe('openscad-changed-parameters')
      expect(parsed.changeCount).toBe(1)
      expect(parsed.parameters.width).toBeDefined()
    })

    it('should report no changes when all defaults', () => {
      const currentParams = { width: 100 }
      const defaultParams = { width: { default: 100 } }
      
      const exported = presetManager.exportChangedParametersJSON(
        currentParams, 
        defaultParams, 
        modelName
      )
      
      const parsed = JSON.parse(exported)
      expect(parsed.message).toContain('No parameters have been changed')
    })
  })

  describe('Multi-file Import and Merge', () => {
    it('should merge presets from multiple files', () => {
      const file1 = JSON.stringify({
        parameterSets: {
          'Preset A': { width: '100' },
          'Preset B': { width: '200' }
        },
        fileFormatVersion: '1'
      })
      
      const file2 = JSON.stringify({
        parameterSets: {
          'Preset C': { width: '300' }
        },
        fileFormatVersion: '1'
      })
      
      const result = presetManager.importAndMergePresets(
        [file1, file2], 
        modelName
      )
      
      expect(result.success).toBe(true)
      expect(result.imported).toBe(3)
      
      const presets = presetManager.getPresetsForModel(modelName)
      expect(presets).toHaveLength(3)
    })

    it('should rename duplicates with rename strategy', () => {
      const file1 = JSON.stringify({
        parameterSets: {
          'Test': { width: '100' }
        },
        fileFormatVersion: '1'
      })
      
      const file2 = JSON.stringify({
        parameterSets: {
          'Test': { width: '200' }
        },
        fileFormatVersion: '1'
      })
      
      const result = presetManager.importAndMergePresets(
        [file1, file2], 
        modelName,
        {},
        'rename'
      )
      
      expect(result.imported).toBe(2)
      
      const presets = presetManager.getPresetsForModel(modelName)
      expect(presets).toHaveLength(2)
      expect(presets.find(p => p.name === 'Test')).toBeDefined()
      expect(presets.find(p => p.name === 'Test (2)')).toBeDefined()
    })

    it('should skip duplicates with keep strategy', () => {
      const file1 = JSON.stringify({
        parameterSets: {
          'Test': { width: '100' }
        },
        fileFormatVersion: '1'
      })
      
      const file2 = JSON.stringify({
        parameterSets: {
          'Test': { width: '200' }
        },
        fileFormatVersion: '1'
      })
      
      const result = presetManager.importAndMergePresets(
        [file1, file2], 
        modelName,
        {},
        'keep'
      )
      
      expect(result.imported).toBe(1)
      expect(result.skipped).toBe(1)
      
      const presets = presetManager.getPresetsForModel(modelName)
      expect(presets).toHaveLength(1)
      // First one should be kept (width: 100)
      expect(presets[0].parameters.width).toBe(100) // Auto-detected as number
    })

    it('should overwrite duplicates with overwrite strategy', () => {
      const file1 = JSON.stringify({
        parameterSets: {
          'Test': { width: '100' }
        },
        fileFormatVersion: '1'
      })
      
      const file2 = JSON.stringify({
        parameterSets: {
          'Test': { width: '200' }
        },
        fileFormatVersion: '1'
      })
      
      const result = presetManager.importAndMergePresets(
        [file1, file2], 
        modelName,
        {},
        'overwrite'
      )
      
      expect(result.imported).toBe(2)
      
      const presets = presetManager.getPresetsForModel(modelName)
      // Should have the last value (200)
      expect(presets.find(p => p.name === 'Test').parameters.width).toBe(200)
    })

    it('should handle mix of Forge and OpenSCAD formats', () => {
      const openscadFile = JSON.stringify({
        parameterSets: {
          'OpenSCAD Preset': { width: '100' }
        },
        fileFormatVersion: '1'
      })
      
      const forgeFile = JSON.stringify({
        version: '1.0.0',
        type: 'openscad-preset',
        modelName: modelName,
        preset: {
          name: 'Forge Preset',
          parameters: { width: 200 }
        }
      })
      
      const result = presetManager.importAndMergePresets(
        [openscadFile, forgeFile], 
        modelName
      )
      
      expect(result.imported).toBe(2)
      
      const presets = presetManager.getPresetsForModel(modelName)
      expect(presets.find(p => p.name === 'OpenSCAD Preset')).toBeDefined()
      expect(presets.find(p => p.name === 'Forge Preset')).toBeDefined()
    })

    it('should report errors for invalid files', () => {
      const validFile = JSON.stringify({
        parameterSets: { 'Test': { width: '100' } },
        fileFormatVersion: '1'
      })
      
      const invalidFile = 'not valid json'
      
      const result = presetManager.importAndMergePresets(
        [validFile, invalidFile], 
        modelName
      )
      
      expect(result.imported).toBe(1)
      expect(result.errors).toBeDefined()
      expect(result.errors).toHaveLength(1)
    })
  })

  describe('Type Coercion Utility', () => {
    it('should coerce string numbers to numbers', () => {
      const values = { width: '100.5', count: '42' }
      const schema = {
        width: { type: 'number' },
        count: { type: 'integer' }
      }
      
      const coerced = coercePresetValues(values, schema)
      
      expect(coerced.width).toBe(100.5)
      expect(coerced.count).toBe(42)
    })

    it('should auto-detect types without schema', () => {
      const values = {
        numValue: '123',
        boolTrue: 'true',
        boolFalse: 'false',
        boolYes: 'yes',
        boolNo: 'no',
        stringValue: 'hello',
        arrayValue: '[1, 2, 3]'
      }
      
      const coerced = coercePresetValues(values)
      
      expect(coerced.numValue).toBe(123)
      expect(coerced.boolTrue).toBe(true)
      expect(coerced.boolFalse).toBe(false)
      expect(coerced.boolYes).toBe(true)
      expect(coerced.boolNo).toBe(false)
      expect(coerced.stringValue).toBe('hello')
      expect(coerced.arrayValue).toEqual([1, 2, 3])
    })

    it('should preserve already correct types', () => {
      const values = {
        num: 100,
        bool: true,
        str: 'test',
        arr: [1, 2, 3]
      }
      
      const coerced = coercePresetValues(values)
      
      expect(coerced.num).toBe(100)
      expect(coerced.bool).toBe(true)
      expect(coerced.str).toBe('test')
      expect(coerced.arr).toEqual([1, 2, 3])
    })
  })

  describe('analyzePresetCompatibility', () => {
    it('returns compatible for identical parameter sets', () => {
      const preset = { width: 100, height: 50 }
      const schema = { width: { type: 'number' }, height: { type: 'number' } }
      const result = presetManager.analyzePresetCompatibility(preset, schema)
      expect(result.isCompatible).toBe(true)
      expect(result.extraParams).toEqual([])
      expect(result.missingParams).toEqual([])
    })

    it('detects extra params in preset', () => {
      const preset = { width: 100, oldParam: 50 }
      const schema = { width: { type: 'number' } }
      const result = presetManager.analyzePresetCompatibility(preset, schema)
      expect(result.isCompatible).toBe(false)
      expect(result.extraParams).toContain('oldParam')
    })

    it('detects missing params from schema', () => {
      const preset = { width: 100 }
      const schema = { width: { type: 'number' }, newParam: { type: 'number' } }
      const result = presetManager.analyzePresetCompatibility(preset, schema)
      expect(result.isCompatible).toBe(false)
      expect(result.missingParams).toContain('newParam')
    })

    it('detects boolean type mismatches with invalid string', () => {
      const preset = { enabled: 'invalid' }
      const schema = { enabled: { type: 'boolean' } }
      const result = presetManager.analyzePresetCompatibility(preset, schema)
      expect(result.typeMismatches.length).toBeGreaterThan(0)
      expect(result.typeMismatches[0].key).toBe('enabled')
    })

    it('does not flag valid boolean strings as mismatches', () => {
      const preset = { enabled: 'true', disabled: 'no' }
      const schema = { 
        enabled: { type: 'boolean' }, 
        disabled: { type: 'boolean' } 
      }
      const result = presetManager.analyzePresetCompatibility(preset, schema)
      expect(result.typeMismatches.length).toBe(0)
    })

    it('detects integer type mismatches with non-numeric string', () => {
      const preset = { count: 'abc' }
      const schema = { count: { type: 'integer' } }
      const result = presetManager.analyzePresetCompatibility(preset, schema)
      expect(result.typeMismatches.length).toBeGreaterThan(0)
    })

    it('does not flag valid numeric strings as mismatches', () => {
      const preset = { count: '42', ratio: '3.14' }
      const schema = { 
        count: { type: 'integer' }, 
        ratio: { type: 'number' } 
      }
      const result = presetManager.analyzePresetCompatibility(preset, schema)
      expect(result.typeMismatches.length).toBe(0)
    })

    it('calculates compatible count correctly', () => {
      const preset = { a: 1, b: 2, c: 3 }
      const schema = { a: { type: 'number' }, b: { type: 'number' } }
      const result = presetManager.analyzePresetCompatibility(preset, schema)
      expect(result.compatibleCount).toBe(2) // a and b match
      expect(result.totalPresetParams).toBe(3)
      expect(result.totalSchemaParams).toBe(2)
    })

    it('handles empty preset', () => {
      const preset = {}
      const schema = { width: { type: 'number' } }
      const result = presetManager.analyzePresetCompatibility(preset, schema)
      expect(result.isCompatible).toBe(false)
      expect(result.missingParams).toContain('width')
      expect(result.extraParams).toEqual([])
    })

    it('handles empty schema', () => {
      const preset = { width: 100 }
      const schema = {}
      const result = presetManager.analyzePresetCompatibility(preset, schema)
      expect(result.isCompatible).toBe(false)
      expect(result.extraParams).toContain('width')
      expect(result.missingParams).toEqual([])
    })

    it('handles both extra and missing params', () => {
      const preset = { old1: 1, old2: 2, shared: 100 }
      const schema = { 
        shared: { type: 'number' }, 
        new1: { type: 'number' }, 
        new2: { type: 'number' } 
      }
      const result = presetManager.analyzePresetCompatibility(preset, schema)
      expect(result.isCompatible).toBe(false)
      expect(result.extraParams).toContain('old1')
      expect(result.extraParams).toContain('old2')
      expect(result.missingParams).toContain('new1')
      expect(result.missingParams).toContain('new2')
      expect(result.compatibleCount).toBe(1) // shared
    })
  })

  describe('extractScadVersion', () => {
    it('returns null for empty content', () => {
      expect(extractScadVersion('')).toBeNull()
      expect(extractScadVersion(null)).toBeNull()
    })

    it('extracts version from // Version: v74', () => {
      const result = extractScadVersion('// Version: v74\nmodule test() {}')
      expect(result.version).toBe('74')
    })

    it('extracts version from // Version: 74 (no v prefix)', () => {
      const result = extractScadVersion('// Version: 74\nmodule test() {}')
      expect(result.version).toBe('74')
    })

    it('extracts version from // Version: 2.0', () => {
      const result = extractScadVersion('// Version: 2.0')
      expect(result.version).toBe('2.0')
    })

    it('extracts version from /* Version 1.2.3 */', () => {
      const result = extractScadVersion('/* Version 1.2.3 */')
      expect(result.version).toBe('1.2.3')
    })

    it('extracts version from /* Version: 1.2.3 */ with colon', () => {
      const result = extractScadVersion('/* Version: 1.2.3 */')
      expect(result.version).toBe('1.2.3')
    })

    it('extracts version from // v1.0 comment', () => {
      const result = extractScadVersion('// v1.0 - Initial release')
      expect(result.version).toBe('1.0')
    })

    it('extracts version from $version variable with double quotes', () => {
      const result = extractScadVersion('$version = "2.5";')
      expect(result.version).toBe('2.5')
    })

    it('extracts version from $version variable with single quotes', () => {
      const result = extractScadVersion("$version = '3.0';")
      expect(result.version).toBe('3.0')
    })

    it('extracts version from version = 74 assignment', () => {
      const result = extractScadVersion('version = 74;')
      expect(result.version).toBe('74')
    })

    it('extracts version from version = 1.5 decimal assignment', () => {
      const result = extractScadVersion('version = 1.5;')
      expect(result.version).toBe('1.5')
    })

    it('returns null when no version pattern found', () => {
      const result = extractScadVersion('module cube() { cube(10); }')
      expect(result).toBeNull()
    })

    it('returns null for code without any version indicators', () => {
      const code = `
        // A simple test module
        module test_part() {
          cube([10, 20, 30]);
        }
        test_part();
      `
      expect(extractScadVersion(code)).toBeNull()
    })

    it('extracts version with multi-digit parts', () => {
      const result = extractScadVersion('// Version: 12.34.56')
      expect(result.version).toBe('12.34.56')
    })

    it('includes raw match in result', () => {
      const result = extractScadVersion('// Version: v74')
      expect(result.raw).toContain('74')
    })

    it('handles version in middle of file', () => {
      const code = `
        // Some header comment
        module test() {}
        // Version: 2.0
        test();
      `
      const result = extractScadVersion(code)
      expect(result.version).toBe('2.0')
    })
  })

  describe('compareVersions', () => {
    it('returns 0 for equal versions', () => {
      expect(compareVersions('1.0', '1.0')).toBe(0)
      expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
    })

    it('returns -1 when first version is lower', () => {
      expect(compareVersions('1.0', '2.0')).toBe(-1)
      expect(compareVersions('1.0', '1.1')).toBe(-1)
      expect(compareVersions('1.0.0', '1.0.1')).toBe(-1)
    })

    it('returns 1 when first version is higher', () => {
      expect(compareVersions('2.0', '1.0')).toBe(1)
      expect(compareVersions('1.1', '1.0')).toBe(1)
      expect(compareVersions('1.0.1', '1.0.0')).toBe(1)
    })

    it('handles versions with different segment counts', () => {
      expect(compareVersions('1.0', '1.0.0')).toBe(0)
      expect(compareVersions('1.0.1', '1.0')).toBe(1)
      expect(compareVersions('1.0', '1.0.1')).toBe(-1)
    })

    it('compares major versions correctly', () => {
      expect(compareVersions('2.0.0', '1.9.9')).toBe(1)
      expect(compareVersions('10.0', '9.0')).toBe(1)
    })

    it('handles single segment versions', () => {
      expect(compareVersions('74', '73')).toBe(1)
      expect(compareVersions('1', '2')).toBe(-1)
    })
  })

  describe('Value Equality Comparison', () => {
    it('should compare equal numbers correctly', () => {
      expect(presetManager.valuesEqual(100, 100)).toBe(true)
      expect(presetManager.valuesEqual(100, 101)).toBe(false)
    })

    it('should handle floating point tolerance', () => {
      expect(presetManager.valuesEqual(100.00001, 100)).toBe(true)
      expect(presetManager.valuesEqual(100.001, 100)).toBe(false)
    })

    it('should compare string and number', () => {
      expect(presetManager.valuesEqual('100', 100)).toBe(true)
      expect(presetManager.valuesEqual(100, '100')).toBe(true)
    })

    it('should compare boolean and OpenSCAD strings', () => {
      expect(presetManager.valuesEqual(true, 'yes')).toBe(true)
      expect(presetManager.valuesEqual(true, 'true')).toBe(true)
      expect(presetManager.valuesEqual(false, 'no')).toBe(true)
      expect(presetManager.valuesEqual(false, 'false')).toBe(true)
    })

    it('should compare arrays', () => {
      expect(presetManager.valuesEqual([1, 2, 3], [1, 2, 3])).toBe(true)
      expect(presetManager.valuesEqual([1, 2, 3], [1, 2, 4])).toBe(false)
      expect(presetManager.valuesEqual([1, 2], [1, 2, 3])).toBe(false)
    })

    it('should handle null and undefined', () => {
      expect(presetManager.valuesEqual(null, null)).toBe(true)
      expect(presetManager.valuesEqual(undefined, undefined)).toBe(true)
      expect(presetManager.valuesEqual(null, undefined)).toBe(true)
      expect(presetManager.valuesEqual(null, 0)).toBe(false)
    })
  })
})
