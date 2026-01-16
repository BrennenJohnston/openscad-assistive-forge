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

  it('hashes parameters consistently', () => {
    const hash = controller.hashParams({ width: 10, height: 5 })
    expect(hash).toBe(JSON.stringify({ width: 10, height: 5 }))
  })

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

  it('clears debounce timer when disabling auto-preview', () => {
    vi.useFakeTimers()
    controller.debounceTimer = setTimeout(() => {}, 1000)
    controller.setEnabled(false)
    expect(controller.debounceTimer).toBeNull()
  })

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

  it('loads cached preview and updates state', async () => {
    controller.setColorParamNames(['box_color'])
    const params = { box_color: '00ff00' }
    const hash = controller.hashParams(params)
    const cached = { stl: new ArrayBuffer(4), stats: { triangles: 5 }, timestamp: Date.now() }
    controller.previewCache.set(hash, cached)

    const previewReady = vi.fn()
    controller.onPreviewReady = previewReady

    await controller.loadCachedPreview(hash)

    expect(previewManager.setColorOverride).toHaveBeenCalledWith('#00ff00')
    expect(previewManager.loadSTL).toHaveBeenCalledWith(cached.stl)
    expect(controller.state).toBe(PREVIEW_STATE.CURRENT)
    expect(previewReady).toHaveBeenCalledWith(cached.stl, cached.stats, true)
  })

  it('adds results to cache and evicts old entries', () => {
    controller.maxCacheSize = 1

    controller.addToCache('first', { stl: new ArrayBuffer(1), stats: {} })
    controller.addToCache('second', { stl: new ArrayBuffer(2), stats: {} })

    expect(controller.previewCache.size).toBe(1)
    expect(controller.previewCache.has('second')).toBe(true)
  })

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
})
