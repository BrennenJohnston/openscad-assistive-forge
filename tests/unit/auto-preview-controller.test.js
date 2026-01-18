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
      setColorOverride: vi.fn()
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
      
      expect(ctrl.debounceMs).toBe(1500)
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

    it('prefers box_color when available', () => {
      controller.setColorParamNames(['other_color', 'box_color'])
      const color = controller.resolvePreviewColor({ use_colors: 'yes', box_color: 'ff0000', other_color: '00ff00' })
      expect(color).toBe('#ff0000')
    })

    it('falls back to first color param when box_color not configured', () => {
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
    it('marks state as stale when auto-preview is disabled', () => {
      controller.enabled = false
      controller.previewParamHash = 'existing'
      controller.state = PREVIEW_STATE.CURRENT

      controller.onParameterChange({ width: 20 })

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

    it('sets state to PENDING when auto-preview disabled and no existing preview', () => {
      controller.enabled = false
      controller.previewParamHash = null
      
      controller.onParameterChange({ width: 20 })
      
      expect(controller.state).toBe(PREVIEW_STATE.PENDING)
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
      expect(previewManager.loadSTL).toHaveBeenCalledWith(cached.stl)
      expect(controller.state).toBe(PREVIEW_STATE.CURRENT)
      expect(previewReady).toHaveBeenCalledWith(cached.stl, cached.stats, true, undefined)
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
})
