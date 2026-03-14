import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { AutoPreviewController, PREVIEW_STATE } from '../../src/js/auto-preview-controller.js'

describe('AutoPreviewController', () => {
  let renderController
  let previewManager
  let controller

  beforeEach(() => {
    renderController = {
      isBusy: vi.fn(() => false),
      cancel: vi.fn(),
      renderPreview: vi.fn().mockResolvedValue({
        stl: new ArrayBuffer(8),
        stats: { triangles: 12 }
      }),
      render: vi.fn().mockResolvedValue({
        stl: new ArrayBuffer(16),
        stats: { triangles: 24 }
      })
    }

    previewManager = {
      loadSTL: vi.fn().mockResolvedValue(),
      setColorOverride: vi.fn(),
      colorOverrideEnabled: true,
      clear: vi.fn()
    }

    controller = new AutoPreviewController(renderController, previewManager, {
      debounceMs: 10
    })
    controller.setScadContent('cube(10);')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('Constructor', () => {
    it('initializes with default options', () => {
      const ctrl = new AutoPreviewController(renderController, previewManager)
      
      // MANIFOLD OPTIMIZED: Default debounceMs reduced from 1500 to 800
      expect(ctrl.debounceMs).toBe(800)
      expect(ctrl.maxCacheSize).toBe(10)
      expect(ctrl.enabled).toBe(true)
      expect(ctrl.state).toBe(PREVIEW_STATE.IDLE)
    })

    it('initializes with custom options', () => {
      const ctrl = new AutoPreviewController(renderController, previewManager, {
        debounceMs: 500,
        maxCacheSize: 5,
        enabled: false
      })
      
      expect(ctrl.debounceMs).toBe(500)
      expect(ctrl.maxCacheSize).toBe(5)
      expect(ctrl.enabled).toBe(false)
    })

    it('accepts callback options', () => {
      const onStateChange = vi.fn()
      const onPreviewReady = vi.fn()
      const onProgress = vi.fn()
      const onError = vi.fn()
      
      const ctrl = new AutoPreviewController(renderController, previewManager, {
        onStateChange,
        onPreviewReady,
        onProgress,
        onError
      })
      
      expect(ctrl.onStateChange).toBe(onStateChange)
      expect(ctrl.onPreviewReady).toBe(onPreviewReady)
      expect(ctrl.onProgress).toBe(onProgress)
      expect(ctrl.onError).toBe(onError)
    })
  })

  describe('Parameter Hashing', () => {
    it('hashes parameters consistently', () => {
      const hash = controller.hashParams({ width: 10, height: 5 })
      expect(hash).toBe(JSON.stringify({ width: 10, height: 5 }))
    })

    it('produces different hashes for different params', () => {
      const hash1 = controller.hashParams({ width: 10 })
      const hash2 = controller.hashParams({ width: 20 })
      expect(hash1).not.toBe(hash2)
    })

    it('produces same hash for same params', () => {
      const hash1 = controller.hashParams({ width: 10, height: 5 })
      const hash2 = controller.hashParams({ width: 10, height: 5 })
      expect(hash1).toBe(hash2)
    })
  })

  describe('Color Resolution', () => {
    it('resolves preview color based on configured color params', () => {
      controller.setColorParamNames(['box_color'])
      const color = controller.resolvePreviewColor({ use_colors: 'yes', box_color: 'ff0000' })
      expect(color).toBe('#ff0000')
    })

    it('returns null preview color when colors are disabled', () => {
      controller.setColorParamNames(['box_color'])
      const color = controller.resolvePreviewColor({ use_colors: false, box_color: 'ff0000' })
      expect(color).toBeNull()
    })

    it('returns null when no color params configured', () => {
      controller.setColorParamNames([])
      const color = controller.resolvePreviewColor({ box_color: 'ff0000' })
      expect(color).toBeNull()
    })

    it('returns null when parameters is null', () => {
      controller.setColorParamNames(['box_color'])
      const color = controller.resolvePreviewColor(null)
      expect(color).toBeNull()
    })

    it('returns null when use_colors is no', () => {
      controller.setColorParamNames(['box_color'])
      const color = controller.resolvePreviewColor({ use_colors: 'no', box_color: 'ff0000' })
      expect(color).toBeNull()
    })

    it('uses first color param in declaration order (no box_color preference)', () => {
      controller.setColorParamNames(['other_color', 'box_color'])
      const color = controller.resolvePreviewColor({ use_colors: 'yes', box_color: 'ff0000', other_color: '00ff00' })
      expect(color).toBe('#00ff00')
    })

    it('uses first color param when only one is configured', () => {
      controller.setColorParamNames(['other_color'])
      const color = controller.resolvePreviewColor({ use_colors: 'yes', other_color: '00ff00' })
      expect(color).toBe('#00ff00')
    })

    it('handles color with hash prefix', () => {
      controller.setColorParamNames(['box_color'])
      const color = controller.resolvePreviewColor({ use_colors: 'yes', box_color: '#ff0000' })
      expect(color).toBe('#ff0000')
    })

    it('returns null for invalid color format', () => {
      controller.setColorParamNames(['box_color'])
      const color = controller.resolvePreviewColor({ use_colors: 'yes', box_color: 'invalid' })
      expect(color).toBeNull()
    })

    it('returns null when color param value is not a string', () => {
      controller.setColorParamNames(['box_color'])
      const color = controller.resolvePreviewColor({ use_colors: 'yes', box_color: 123 })
      expect(color).toBeNull()
    })
  })

  describe('Enable/Disable', () => {
    it('clears debounce timer when disabling auto-preview', () => {
      vi.useFakeTimers()
      controller.debounceTimer = setTimeout(() => {}, 1000)
      controller.setEnabled(false)
      expect(controller.debounceTimer).toBeNull()
    })

    it('sets enabled flag', () => {
      controller.setEnabled(false)
      expect(controller.enabled).toBe(false)
      
      controller.setEnabled(true)
      expect(controller.enabled).toBe(true)
    })
  })

  describe('Parameter Change Handling', () => {
    it('marks state as stale when auto-preview is disabled and has existing preview', () => {
      controller.enabled = false
      controller.previewParamHash = 'existing'
      controller.previewCacheKey = 'existing|model'
      controller.state = PREVIEW_STATE.CURRENT

      controller.onParameterChange({ width: 20 })

      // When auto-preview disabled (not complexity), state should be STALE if there's a cached preview
      expect(controller.state).toBe(PREVIEW_STATE.STALE)
    })

    it('stores pending parameters when render is busy', () => {
      renderController.isBusy.mockReturnValue(true)
      controller.onParameterChange({ width: 20 })

      expect(controller.pendingParameters).toEqual({ width: 20 })
      expect(controller.pendingParamHash).toBe(controller.hashParams({ width: 20 }))
      expect(controller.state).toBe(PREVIEW_STATE.PENDING)
    })

    it('schedules preview rendering when enabled', async () => {
      vi.useFakeTimers()
      const renderSpy = vi.spyOn(controller, 'renderPreview').mockResolvedValue()

      controller.onParameterChange({ width: 25 })
      expect(controller.state).toBe(PREVIEW_STATE.PENDING)

      vi.advanceTimersByTime(10)
      expect(renderSpy).toHaveBeenCalledWith({ width: 25 }, controller.hashParams({ width: 25 }))
    })

    it('returns early when no SCAD content', () => {
      controller.currentScadContent = null
      const stateSpy = vi.spyOn(controller, 'setState')
      
      controller.onParameterChange({ width: 20 })
      
      expect(stateSpy).not.toHaveBeenCalled()
    })

    it('returns early when preview is already current', () => {
      const params = { width: 20 }
      const hash = controller.hashParams(params)
      // Use compound cache key: paramHash|qualityKey (default qualityKey is 'model' when no quality set)
      const cacheKey = `${hash}|model`
      controller.previewParamHash = hash
      controller.previewCacheKey = cacheKey
      controller.currentParamHash = hash
      controller.currentPreviewKey = cacheKey
      controller.state = PREVIEW_STATE.CURRENT
      const stateSpy = vi.spyOn(controller, 'setState')
      
      controller.onParameterChange(params)
      
      expect(stateSpy).not.toHaveBeenCalled()
    })

    it('loads from cache when available', async () => {
      const params = { width: 20 }
      const hash = controller.hashParams(params)
      // Use compound cache key: paramHash|qualityKey (default qualityKey is 'model' when no quality set)
      const cacheKey = `${hash}|model`
      controller.previewCache.set(cacheKey, { stl: new ArrayBuffer(4), stats: {}, timestamp: Date.now() })
      
      const loadCachedSpy = vi.spyOn(controller, 'loadCachedPreview').mockResolvedValue()
      
      controller.onParameterChange(params)
      
      expect(loadCachedSpy).toHaveBeenCalledWith(hash, cacheKey, 'model')
    })

    it('clears existing debounce timer when busy', () => {
      vi.useFakeTimers()
      controller.debounceTimer = setTimeout(() => {}, 1000)
      renderController.isBusy.mockReturnValue(true)
      
      controller.onParameterChange({ width: 20 })
      
      expect(controller.debounceTimer).toBeNull()
    })

    it('sets state to IDLE when auto-preview disabled and no existing preview', () => {
      controller.enabled = false
      controller.previewParamHash = null
      controller.previewCacheKey = null
      
      controller.onParameterChange({ width: 20 })
      
      // When auto-preview disabled (not complexity pause), state should be IDLE if no cached preview
      expect(controller.state).toBe(PREVIEW_STATE.IDLE)
    })
  })

  describe('Cache Management', () => {
    it('loads cached preview and updates state', async () => {
      controller.setColorParamNames(['box_color'])
      const params = { box_color: '00ff00' }
      const hash = controller.hashParams(params)
      // Use compound cache key: paramHash|qualityKey
      const qualityKey = 'model'
      const cacheKey = `${hash}|${qualityKey}`
      const cached = { stl: new ArrayBuffer(4), stats: { triangles: 5 }, timestamp: Date.now() }
      controller.previewCache.set(cacheKey, cached)

      const previewReady = vi.fn()
      controller.onPreviewReady = previewReady

      await controller.loadCachedPreview(hash, cacheKey, qualityKey)

      expect(previewManager.setColorOverride).toHaveBeenCalledWith('#00ff00')
      expect(previewManager.loadSTL).toHaveBeenCalledWith(cached.stl, { preserveCamera: false })
      expect(controller.state).toBe(PREVIEW_STATE.CURRENT)
      expect(previewReady).toHaveBeenCalledWith(
        cached.stl,
        cached.stats,
        true,
        undefined,
        expect.objectContaining({
          cached: true,
          parseMs: 0,
          renderMs: 0,
          wasmInitMs: 0,
        })
      )
    })

    it('adds results to cache and evicts old entries', () => {
      controller.maxCacheSize = 1

      controller.addToCache('first', { stl: new ArrayBuffer(1), stats: {} })
      controller.addToCache('second', { stl: new ArrayBuffer(2), stats: {} })

      expect(controller.previewCache.size).toBe(1)
      expect(controller.previewCache.has('second')).toBe(true)
    })

    it('returns early when cache entry not found', async () => {
      const hash = 'nonexistent'
      const cacheKey = `${hash}|model`
      await controller.loadCachedPreview(hash, cacheKey, 'model')
      
      expect(previewManager.loadSTL).not.toHaveBeenCalled()
    })

    it('handles load error and removes from cache', async () => {
      const params = { width: 20 }
      const hash = controller.hashParams(params)
      // Use compound cache key: paramHash|qualityKey
      const qualityKey = 'model'
      const cacheKey = `${hash}|${qualityKey}`
      controller.previewCache.set(cacheKey, { stl: new ArrayBuffer(4), stats: {}, timestamp: Date.now() })
      previewManager.loadSTL.mockRejectedValueOnce(new Error('Load failed'))
      
      const renderSpy = vi.spyOn(controller, 'renderPreview').mockResolvedValue()
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      
      await controller.loadCachedPreview(hash, cacheKey, qualityKey)
      
      expect(controller.previewCache.has(cacheKey)).toBe(false)
      expect(renderSpy).toHaveBeenCalled()
      
      consoleSpy.mockRestore()
    })

    it('clears preview cache', () => {
      controller.previewCache.set('hash1', { stl: new ArrayBuffer(1), stats: {}, timestamp: Date.now() })
      controller.previewCache.set('hash2', { stl: new ArrayBuffer(2), stats: {}, timestamp: Date.now() })
      
      controller.clearPreviewCache()
      
      expect(controller.previewCache.size).toBe(0)
    })

    it('clears all cache including full quality', () => {
      controller.previewCache.set('hash', { stl: new ArrayBuffer(1), stats: {}, timestamp: Date.now() })
      controller.fullQualitySTL = new ArrayBuffer(2)
      controller.fullQualityStats = { triangles: 10 }
      controller.fullRenderParamHash = 'hash'
      controller.previewParamHash = 'hash'
      
      controller.clearCache()
      
      expect(controller.previewCache.size).toBe(0)
      expect(controller.fullQualitySTL).toBeNull()
      expect(controller.fullQualityStats).toBeNull()
      expect(controller.fullRenderParamHash).toBeNull()
      expect(controller.previewParamHash).toBeNull()
    })
  })

  describe('SCAD Content', () => {
    it('resets state when setting new SCAD content', () => {
      controller.previewCache.set('hash', { stl: new ArrayBuffer(1), stats: {}, timestamp: Date.now() })
      controller.previewParamHash = 'hash'
      controller.fullQualitySTL = new ArrayBuffer(2)
      controller.state = PREVIEW_STATE.CURRENT

      controller.setScadContent('new content')

      expect(controller.previewCache.size).toBe(0)
      expect(controller.previewParamHash).toBeNull()
      expect(controller.fullQualitySTL).toBeNull()
      expect(controller.state).toBe(PREVIEW_STATE.IDLE)
    })

    it('increments scad version on new content', () => {
      const initialVersion = controller.scadVersion
      
      controller.setScadContent('new content')
      
      expect(controller.scadVersion).toBe(initialVersion + 1)
    })

    it('cancels pending work on new content', () => {
      const cancelSpy = vi.spyOn(controller, 'cancelPending')
      
      controller.setScadContent('new content')
      
      expect(cancelSpy).toHaveBeenCalled()
    })
  })

  describe('Project Files', () => {
    it('sets project files and main file path', () => {
      const files = new Map([['main.scad', 'cube(10);']])
      
      controller.setProjectFiles(files, 'main.scad')
      
      expect(controller.projectFiles).toBe(files)
      expect(controller.mainFilePath).toBe('main.scad')
    })

    it('handles null project files', () => {
      controller.setProjectFiles(null, null)
      
      expect(controller.projectFiles).toBeNull()
      expect(controller.mainFilePath).toBeNull()
    })
  })

  describe('Preview Quality', () => {
    it('sets preview quality and clears cache', () => {
      controller.previewCache.set('hash', { stl: new ArrayBuffer(1), stats: {}, timestamp: Date.now() })
      
      controller.setPreviewQuality({ $fn: 20 })
      
      expect(controller.previewQuality).toEqual({ $fn: 20 })
      expect(controller.previewCache.size).toBe(0)
    })

    it('sets state to stale when current preview key exists', () => {
      // The controller sets state to stale when currentPreviewKey exists
      controller.currentPreviewKey = 'hash|model'
      controller.state = PREVIEW_STATE.CURRENT
      
      controller.setPreviewQuality({ $fn: 20 })
      
      expect(controller.state).toBe(PREVIEW_STATE.STALE)
    })
  })

  describe('Libraries', () => {
    it('sets enabled libraries', () => {
      const libraries = [{ id: 'BOSL2', path: '/libraries/BOSL2' }]
      
      controller.setEnabledLibraries(libraries)
      
      expect(controller.enabledLibraries).toEqual(libraries)
    })

    it('handles null libraries', () => {
      controller.setEnabledLibraries(null)
      
      expect(controller.enabledLibraries).toEqual([])
    })
  })

  describe('State Management', () => {
    it('sets state and calls callback', () => {
      const onStateChange = vi.fn()
      controller.onStateChange = onStateChange
      
      controller.setState(PREVIEW_STATE.RENDERING, { extra: 'data' })
      
      expect(controller.state).toBe(PREVIEW_STATE.RENDERING)
      expect(onStateChange).toHaveBeenCalledWith(PREVIEW_STATE.RENDERING, PREVIEW_STATE.IDLE, { extra: 'data' })
    })
  })

  describe('Color Param Names', () => {
    it('sets color param names', () => {
      controller.setColorParamNames(['color1', 'color2'])
      
      expect(controller.colorParamNames).toEqual(['color1', 'color2'])
    })

    it('filters out falsy values', () => {
      controller.setColorParamNames(['color1', null, '', 'color2', undefined])
      
      expect(controller.colorParamNames).toEqual(['color1', 'color2'])
    })

    it('handles non-array input', () => {
      controller.setColorParamNames('not an array')
      
      expect(controller.colorParamNames).toEqual([])
    })
  })

  describe('Cancel Pending', () => {
    it('clears debounce timer', () => {
      vi.useFakeTimers()
      controller.debounceTimer = setTimeout(() => {}, 1000)
      
      controller.cancelPending()
      
      expect(controller.debounceTimer).toBeNull()
    })

    it('does not call render controller cancel (debounce/queued only)', () => {
      // cancelPending() only clears debounce timers and pending parameters
      // It does NOT cancel in-progress renders (OpenSCAD WASM is blocking)
      controller.cancelPending()
      
      expect(renderController.cancel).not.toHaveBeenCalled()
    })
  })

  describe('Get Current Full STL', () => {
    it('returns full STL when hash matches', () => {
      const params = { width: 20 }
      const hash = controller.hashParams(params)
      controller.fullRenderParamHash = hash
      controller.fullQualitySTL = new ArrayBuffer(8)
      controller.fullQualityStats = { triangles: 10 }
      
      const result = controller.getCurrentFullSTL(params)
      
      expect(result).toEqual({
        stl: controller.fullQualitySTL,
        stats: controller.fullQualityStats
      })
    })

    it('returns null when hash does not match', () => {
      controller.fullRenderParamHash = 'different'
      controller.fullQualitySTL = new ArrayBuffer(8)
      
      const result = controller.getCurrentFullSTL({ width: 20 })
      
      expect(result).toBeNull()
    })

    it('returns null when no full STL exists', () => {
      controller.fullQualitySTL = null
      
      const result = controller.getCurrentFullSTL({ width: 20 })
      
      expect(result).toBeNull()
    })
  })

  describe('Full Render Preview Updates', () => {
    it('preserves an existing color preview during STL generate', async () => {
      const params = { width: 20 }
      renderController.renderFull = vi.fn().mockResolvedValue({
        stl: new ArrayBuffer(16),
        stats: { triangles: 42 },
        format: 'stl'
      })
      previewManager.loadOFF = vi.fn().mockResolvedValue()
      previewManager.setRenderState = vi.fn()
      previewManager.colorOverrideEnabled = false
      previewManager._getPrimaryGeometry = vi.fn(() => ({
        attributes: { color: {} }
      }))

      await controller.renderFull(params)

      expect(renderController.renderFull).toHaveBeenCalledWith(
        'cube(10);',
        params,
        expect.objectContaining({
          files: undefined,
          mainFile: undefined,
          libraries: [],
          paramTypes: {},
          onProgress: expect.any(Function)
        })
      )
      expect(previewManager.setRenderState).toHaveBeenCalled()
      expect(previewManager.loadSTL).not.toHaveBeenCalled()
      expect(previewManager.loadOFF).not.toHaveBeenCalled()
      expect(controller.state).toBe(PREVIEW_STATE.CURRENT)
    })

    it('loads OFF data when full render returns OFF format', async () => {
      const params = { width: 20 }
      const offData = new ArrayBuffer(32)
      renderController.renderFull = vi.fn().mockResolvedValue({
        stl: offData,
        stats: { triangles: 42 },
        format: 'off'
      })
      previewManager.loadOFF = vi.fn().mockResolvedValue()
      previewManager.setRenderState = vi.fn()
      previewManager.colorOverrideEnabled = false
      previewManager._getPrimaryGeometry = vi.fn(() => null)

      await controller.renderFull(params)

      expect(previewManager.loadOFF).toHaveBeenCalledWith(offData, {
        preserveCamera: false
      })
      expect(previewManager.loadSTL).not.toHaveBeenCalled()
      expect(controller.previewParamHash).toBe(controller.hashParams(params))
    })
  })

  describe('isNonPreviewableParameters', () => {
    it('returns true for "Customizer Settings"', () => {
      expect(AutoPreviewController.isNonPreviewableParameters({ generate: 'Customizer Settings' })).toBe(true)
    })

    it('returns true for "customizer settings" (case-insensitive)', () => {
      expect(AutoPreviewController.isNonPreviewableParameters({ generate: 'customizer settings' })).toBe(true)
    })

    it('returns false for SVG generate modes (2D modes are previewable)', () => {
      expect(AutoPreviewController.isNonPreviewableParameters({ generate: 'SVG' })).toBe(false)
      expect(AutoPreviewController.isNonPreviewableParameters({ generate: 'svg export' })).toBe(false)
    })

    it('returns false for DXF generate modes (2D modes are previewable)', () => {
      expect(AutoPreviewController.isNonPreviewableParameters({ generate: 'DXF' })).toBe(false)
    })

    it('returns false for "First Layer" generate modes (2D modes are previewable)', () => {
      expect(AutoPreviewController.isNonPreviewableParameters({ generate: 'First Layer' })).toBe(false)
      expect(AutoPreviewController.isNonPreviewableParameters({ generate: 'first layer height' })).toBe(false)
    })

    it('returns true for empty string generate', () => {
      expect(AutoPreviewController.isNonPreviewableParameters({ generate: '' })).toBe(true)
    })

    it('returns true for whitespace-only generate', () => {
      expect(AutoPreviewController.isNonPreviewableParameters({ generate: '   ' })).toBe(true)
    })

    it('returns false for 3D generate modes', () => {
      expect(AutoPreviewController.isNonPreviewableParameters({ generate: '3D Printed' })).toBe(false)
      expect(AutoPreviewController.isNonPreviewableParameters({ generate: 'STL' })).toBe(false)
    })

    it('returns false for null/undefined parameters', () => {
      expect(AutoPreviewController.isNonPreviewableParameters(null)).toBe(false)
      expect(AutoPreviewController.isNonPreviewableParameters(undefined)).toBe(false)
    })

    it('returns false when generate is not a string', () => {
      expect(AutoPreviewController.isNonPreviewableParameters({ generate: 42 })).toBe(false)
      expect(AutoPreviewController.isNonPreviewableParameters({})).toBe(false)
    })

    it('returns false for labeled enum numeric value matching "first layer for SVG/DXF file" (2D modes are previewable)', () => {
      const enumEntries = [
        { value: '0', label: '3d printed keyguard' },
        { value: '1', label: 'first layer for SVG/DXF file' },
      ]
      expect(AutoPreviewController.isNonPreviewableParameters({ generate: '1' }, enumEntries)).toBe(false)
    })

    it('returns false for labeled enum numeric value matching a 3D label', () => {
      const enumEntries = [
        { value: '0', label: '3d printed keyguard' },
        { value: '1', label: 'first layer for SVG/DXF file' },
      ]
      expect(AutoPreviewController.isNonPreviewableParameters({ generate: '0' }, enumEntries)).toBe(false)
    })

    it('returns false for labeled enum numeric value whose label contains "svg" (2D modes are previewable)', () => {
      const enumEntries = [
        { value: '0', label: '3D Model' },
        { value: '1', label: 'SVG output' },
      ]
      expect(AutoPreviewController.isNonPreviewableParameters({ generate: '1' }, enumEntries)).toBe(false)
    })

    it('returns true for labeled enum numeric value whose label contains "customizer"', () => {
      const enumEntries = [
        { value: '0', label: '3D Model' },
        { value: '1', label: 'Customizer Settings' },
      ]
      expect(AutoPreviewController.isNonPreviewableParameters({ generate: '1' }, enumEntries)).toBe(true)
    })

    it('returns false when generateEnumEntries does not contain the value', () => {
      const enumEntries = [
        { value: '0', label: 'first layer for SVG/DXF file' },
      ]
      // generate='5' does not match any entry, falls back to raw value check
      expect(AutoPreviewController.isNonPreviewableParameters({ generate: '5' }, enumEntries)).toBe(false)
    })

    it('falls back to raw value keyword check when no generateEnumEntries provided', () => {
      // Without enum context, numeric string "1" does not match any keyword
      expect(AutoPreviewController.isNonPreviewableParameters({ generate: '1' })).toBe(false)
    })
  })

  describe('2D Mode Handling', () => {
    it('does NOT set MODEL_IS_2D for SVG generate mode (2D modes are previewable)', async () => {
      const onStateChange = vi.fn()
      const onError = vi.fn()
      controller.onStateChange = onStateChange
      controller.onError = onError
      const params = { generate: 'SVG' }
      const paramHash = controller.hashParams(params)
      controller.currentParamHash = paramHash
      controller.currentPreviewKey = `${paramHash}|model`

      await controller.renderPreview(params, paramHash)

      const stateChangeCalls = onStateChange.mock.calls.map(c => c[0])
      expect(stateChangeCalls).not.toContain(PREVIEW_STATE.MODEL_IS_2D)
      expect(stateChangeCalls).not.toContain(PREVIEW_STATE.ERROR)
    })

    it('does NOT set MODEL_IS_2D for DXF generate mode (2D modes are previewable)', async () => {
      const onStateChange = vi.fn()
      controller.onStateChange = onStateChange
      const params = { generate: 'DXF' }
      const paramHash = controller.hashParams(params)
      controller.currentParamHash = paramHash
      controller.currentPreviewKey = `${paramHash}|model`

      await controller.renderPreview(params, paramHash)

      const stateChangeCalls = onStateChange.mock.calls.map(c => c[0])
      expect(stateChangeCalls).not.toContain(PREVIEW_STATE.MODEL_IS_2D)
    })

    it('does NOT call onError with MODEL_IS_2D for SVG generate mode', async () => {
      const onError = vi.fn()
      controller.onError = onError
      const params = { generate: 'SVG' }
      const paramHash = controller.hashParams(params)
      controller.currentParamHash = paramHash
      controller.currentPreviewKey = `${paramHash}|model`

      await controller.renderPreview(params, paramHash)

      const errorCodes = onError.mock.calls.map(c => c[0]?.code).filter(Boolean)
      expect(errorCodes).not.toContain('MODEL_IS_2D')
    })

    it('uses ERROR state (not MODEL_IS_2D) for Customizer mode', async () => {
      const onStateChange = vi.fn()
      const onError = vi.fn()
      controller.onStateChange = onStateChange
      controller.onError = onError
      const params = { generate: 'Customizer Settings' }
      const paramHash = controller.hashParams(params)
      controller.currentParamHash = paramHash
      controller.currentPreviewKey = `${paramHash}|model`

      await controller.renderPreview(params, paramHash)

      const stateChangeCalls = onStateChange.mock.calls.map(c => c[0])
      expect(stateChangeCalls).toContain(PREVIEW_STATE.ERROR)
      expect(stateChangeCalls).not.toContain(PREVIEW_STATE.MODEL_IS_2D)
    })

    it('does NOT call previewManager.clear() for Customizer mode', async () => {
      const params = { generate: 'Customizer Settings' }
      const paramHash = controller.hashParams(params)
      controller.currentParamHash = paramHash
      controller.currentPreviewKey = `${paramHash}|model`

      await controller.renderPreview(params, paramHash)

      expect(previewManager.clear).not.toHaveBeenCalled()
    })

    it('clears the pending debounce timer for Customizer mode', async () => {
      vi.useFakeTimers()
      controller.debounceTimer = setTimeout(() => {}, 5000)
      const params = { generate: 'Customizer Settings' }
      const paramHash = controller.hashParams(params)
      controller.currentParamHash = paramHash
      controller.currentPreviewKey = `${paramHash}|model`

      await controller.renderPreview(params, paramHash)

      expect(controller.debounceTimer).toBeNull()
    })
  })

  describe('Rendering State Indicator (S-011)', () => {
    it('transitions through RENDERING during a successful preview render', async () => {
      const onStateChange = vi.fn()
      controller.onStateChange = onStateChange
      const params = { width: 10 }
      const paramHash = controller.hashParams(params)
      controller.currentParamHash = paramHash
      controller.currentPreviewKey = `${paramHash}|model`

      await controller.renderPreview(params, paramHash)

      const stateSequence = onStateChange.mock.calls.map(c => c[0])
      expect(stateSequence).toContain(PREVIEW_STATE.RENDERING)
      expect(stateSequence).toContain(PREVIEW_STATE.CURRENT)
      const renderIdx = stateSequence.indexOf(PREVIEW_STATE.RENDERING)
      const currentIdx = stateSequence.indexOf(PREVIEW_STATE.CURRENT)
      expect(renderIdx).toBeLessThan(currentIdx)
    })

    it('transitions through RENDERING to ERROR on render failure', async () => {
      renderController.renderPreview.mockRejectedValue(new Error('WASM crash'))
      const onStateChange = vi.fn()
      const onError = vi.fn()
      controller.onStateChange = onStateChange
      controller.onError = onError
      const params = { width: 10 }
      const paramHash = controller.hashParams(params)
      controller.currentParamHash = paramHash
      controller.currentPreviewKey = `${paramHash}|model`

      await controller.renderPreview(params, paramHash)

      const stateSequence = onStateChange.mock.calls.map(c => c[0])
      expect(stateSequence).toContain(PREVIEW_STATE.RENDERING)
      expect(stateSequence).toContain(PREVIEW_STATE.ERROR)
      const renderIdx = stateSequence.indexOf(PREVIEW_STATE.RENDERING)
      const errorIdx = stateSequence.indexOf(PREVIEW_STATE.ERROR)
      expect(renderIdx).toBeLessThan(errorIdx)
    })

    it('passes previous state to onStateChange when entering RENDERING', async () => {
      const onStateChange = vi.fn()
      controller.onStateChange = onStateChange
      controller.state = PREVIEW_STATE.PENDING
      const params = { width: 10 }
      const paramHash = controller.hashParams(params)
      controller.currentParamHash = paramHash
      controller.currentPreviewKey = `${paramHash}|model`

      await controller.renderPreview(params, paramHash)

      const renderingCall = onStateChange.mock.calls.find(c => c[0] === PREVIEW_STATE.RENDERING)
      expect(renderingCall).toBeDefined()
      expect(renderingCall[1]).toBe(PREVIEW_STATE.PENDING)
    })

    it('RENDERING state clears when render completes (state becomes CURRENT)', async () => {
      const params = { width: 10 }
      const paramHash = controller.hashParams(params)
      controller.currentParamHash = paramHash
      controller.currentPreviewKey = `${paramHash}|model`

      await controller.renderPreview(params, paramHash)

      expect(controller.state).toBe(PREVIEW_STATE.CURRENT)
      expect(controller.state).not.toBe(PREVIEW_STATE.RENDERING)
    })

    it('debounced parameter change sets PENDING before RENDERING', async () => {
      vi.useFakeTimers()
      const onStateChange = vi.fn()
      controller.onStateChange = onStateChange

      renderController.renderPreview.mockImplementation(() =>
        Promise.resolve({ stl: new ArrayBuffer(8), stats: { triangles: 10 } })
      )

      controller.onParameterChange({ width: 30 })
      expect(controller.state).toBe(PREVIEW_STATE.PENDING)

      await vi.advanceTimersByTimeAsync(controller.debounceMs + 50)

      const stateSequence = onStateChange.mock.calls.map(c => c[0])
      expect(stateSequence.indexOf(PREVIEW_STATE.PENDING)).toBeLessThan(
        stateSequence.indexOf(PREVIEW_STATE.RENDERING)
      )
    })
  })

  describe('Format-agnostic output (getCurrentFullOutput)', () => {
    it('returns null when no full render exists', () => {
      const result = controller.getCurrentFullOutput({ width: 10 })
      expect(result).toBeNull()
    })

    it('returns data, format, and stats for matching params', async () => {
      renderController.renderFull = vi.fn().mockResolvedValue({
        stl: new ArrayBuffer(32),
        format: 'svg',
        stats: { triangles: 0, size: 1234 },
        consoleOutput: '',
      })

      const params = { width: 10 }
      await controller.renderFull(params)

      const output = controller.getCurrentFullOutput(params)
      expect(output).not.toBeNull()
      expect(output.format).toBe('svg')
      expect(output.data).toBeInstanceOf(ArrayBuffer)
      expect(output.stats.size).toBe(1234)
    })

    it('returns null for different params', async () => {
      renderController.renderFull = vi.fn().mockResolvedValue({
        stl: new ArrayBuffer(32),
        format: 'stl',
        stats: { triangles: 12, size: 800 },
        consoleOutput: '',
      })

      await controller.renderFull({ width: 10 })
      const output = controller.getCurrentFullOutput({ width: 20 })
      expect(output).toBeNull()
    })

    it('tracks fullQualityFormat through renderFull', async () => {
      renderController.renderFull = vi.fn().mockResolvedValue({
        stl: new ArrayBuffer(32),
        format: 'dxf',
        stats: { triangles: 0, size: 567 },
        consoleOutput: '',
      })

      await controller.renderFull({ width: 10 })
      expect(controller.fullQualityFormat).toBe('dxf')
    })

    it('resets fullQualityFormat on clearCache', async () => {
      renderController.renderFull = vi.fn().mockResolvedValue({
        stl: new ArrayBuffer(32),
        format: 'svg',
        stats: { triangles: 0, size: 100 },
        consoleOutput: '',
      })

      await controller.renderFull({ width: 10 })
      expect(controller.fullQualityFormat).toBe('svg')

      controller.clearCache()
      expect(controller.fullQualityFormat).toBeNull()
    })

    it('resets fullQualityFormat on dispose', async () => {
      controller.fullQualityFormat = 'svg'
      controller.dispose()
      expect(controller.fullQualityFormat).toBeNull()
    })
  })
})
