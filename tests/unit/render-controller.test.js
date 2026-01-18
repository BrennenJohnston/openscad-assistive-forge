import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RenderController, RENDER_QUALITY, estimateRenderTime } from '../../src/js/render-controller.js'

describe('RenderController', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })
  it('applies quality settings to parameters', () => {
    const controller = new RenderController()
    const params = { $fn: 100, $fa: 5, $fs: 0.5 }
    const adjusted = controller.applyQualitySettings(params, RENDER_QUALITY.DRAFT)

    // DRAFT: maxFn=24, minFa=15, minFs=3 (community draft standard)
    expect(adjusted.$fn).toBe(24)
    expect(adjusted.$fa).toBe(15)
    expect(adjusted.$fs).toBe(3)
  })

  it('forces $fn when missing and forceFn is true', () => {
    const controller = new RenderController()
    const adjusted = controller.applyQualitySettings({}, RENDER_QUALITY.DRAFT)

    // DRAFT forces $fn to maxFn=24
    expect(adjusted.$fn).toBe(24)
  })

  it('reports busy state when a request is active', () => {
    const controller = new RenderController()
    controller.currentRequest = { id: 'render-1' }
    expect(controller.isBusy()).toBe(true)
  })

  it('handles READY message from worker', () => {
    const controller = new RenderController()
    const readyResolve = vi.fn()
    controller.readyResolve = readyResolve

    controller.handleMessage({ type: 'READY', payload: {} })

    expect(controller.ready).toBe(true)
    expect(readyResolve).toHaveBeenCalled()
  })

  it('forwards progress updates to current request', () => {
    const controller = new RenderController()
    const onProgress = vi.fn()
    controller.currentRequest = { id: 'render-1', onProgress }

    controller.handleMessage({
      type: 'PROGRESS',
      payload: { percent: 50, message: 'Halfway' }
    })

    expect(onProgress).toHaveBeenCalledWith(50, 'Halfway')
  })

  it('resolves COMPLETE message and provides stl alias', () => {
    const controller = new RenderController()
    const resolve = vi.fn()
    controller.currentRequest = { id: 'render-1', resolve }

    controller.handleMessage({
      type: 'COMPLETE',
      payload: { requestId: 'render-1', data: new ArrayBuffer(2), stats: { triangles: 3 } }
    })

    expect(resolve).toHaveBeenCalled()
    const result = resolve.mock.calls[0][0]
    expect(result.stl).toBe(result.data)
  })

  it('rejects current request on ERROR message', () => {
    const controller = new RenderController()
    const reject = vi.fn()
    controller.currentRequest = { id: 'render-2', reject }

    controller.handleMessage({
      type: 'ERROR',
      payload: { requestId: 'render-2', message: 'Render failed' }
    })

    expect(reject).toHaveBeenCalled()
    expect(controller.currentRequest).toBeNull()
  })

  it('rejects init promise on worker init error', () => {
    const controller = new RenderController()
    const readyReject = vi.fn()
    controller.readyReject = readyReject

    controller.handleMessage({
      type: 'ERROR',
      payload: { requestId: 'init', message: 'Init failed' }
    })

    expect(readyReject).toHaveBeenCalled()
  })

  it('sends render request and resolves on completion', async () => {
    const controller = new RenderController()
    controller.worker = { postMessage: vi.fn() }
    controller.ready = true

    const renderPromise = controller.render('cube(1);', { $fn: 32 }, { outputFormat: 'stl', timeoutMs: 123 })

    await Promise.resolve()

    const requestId = controller.currentRequest.id
    expect(controller.worker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'RENDER',
        payload: expect.objectContaining({
          requestId,
          scadContent: 'cube(1);',
          outputFormat: 'stl',
          timeoutMs: 123
        })
      })
    )

    controller.handleMessage({
      type: 'COMPLETE',
      payload: { requestId, data: new ArrayBuffer(1), stats: { triangles: 1 } }
    })

    const result = await renderPromise
    expect(result.stl).toBeDefined()
  })

  it('cancels the current render request', () => {
    const controller = new RenderController()
    controller.worker = { postMessage: vi.fn() }
    const reject = vi.fn()
    controller.currentRequest = { id: 'render-3', reject }

    controller.cancel()

    expect(controller.worker.postMessage).toHaveBeenCalledWith({
      type: 'CANCEL',
      payload: { requestId: 'render-3' }
    })
    expect(controller.currentRequest).toBeNull()
    expect(reject).toHaveBeenCalled()
  })
  
  it('handles memory warning callback', () => {
    const controller = new RenderController()
    const onMemoryWarning = vi.fn()
    controller.setMemoryWarningCallback(onMemoryWarning)
    
    const memoryInfo = { 
      used: 450 * 1024 * 1024, 
      limit: 512 * 1024 * 1024, 
      percent: 88,
      usedMB: 450,
      limitMB: 512
    }
    
    controller.handleMessage({
      type: 'MEMORY_USAGE',
      payload: memoryInfo
    })
    
    expect(onMemoryWarning).toHaveBeenCalledWith(memoryInfo)
    expect(controller.memoryUsage).toEqual(memoryInfo)
  })
  
  it('does not trigger memory warning below threshold', () => {
    const controller = new RenderController()
    const onMemoryWarning = vi.fn()
    controller.setMemoryWarningCallback(onMemoryWarning)
    
    const memoryInfo = { 
      used: 200 * 1024 * 1024, 
      limit: 512 * 1024 * 1024, 
      percent: 39,
      usedMB: 200,
      limitMB: 512
    }
    
    controller.handleMessage({
      type: 'MEMORY_USAGE',
      payload: memoryInfo
    })
    
    expect(onMemoryWarning).not.toHaveBeenCalled()
    expect(controller.memoryUsage).toEqual(memoryInfo)
  })

  it('resolves pending memory request', () => {
    const controller = new RenderController()
    const memoryResolve = vi.fn()
    controller.memoryResolve = memoryResolve
    
    const memoryInfo = { 
      used: 200 * 1024 * 1024, 
      limit: 512 * 1024 * 1024, 
      percent: 39,
      usedMB: 200,
      limitMB: 512
    }
    
    controller.handleMessage({
      type: 'MEMORY_USAGE',
      payload: memoryInfo
    })
    
    expect(memoryResolve).toHaveBeenCalledWith(memoryInfo)
    expect(controller.memoryResolve).toBeNull()
  })

  it('handles unknown message types', () => {
    const controller = new RenderController()
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    
    controller.handleMessage({
      type: 'UNKNOWN_TYPE',
      payload: {}
    })
    
    expect(consoleSpy).toHaveBeenCalledWith('[RenderController] Unknown message type:', 'UNKNOWN_TYPE')
    consoleSpy.mockRestore()
  })

  it('handles init progress messages', () => {
    const controller = new RenderController()
    const onInitProgress = vi.fn()
    
    controller.handleMessage({
      type: 'PROGRESS',
      payload: { requestId: 'init', percent: 50, message: 'Loading...' }
    }, onInitProgress)
    
    expect(onInitProgress).toHaveBeenCalled()
  })

  it('does not apply $fn cap when maxFn is null', () => {
    const controller = new RenderController()
    const params = { $fn: 100 }
    const adjusted = controller.applyQualitySettings(params, RENDER_QUALITY.FULL)
    
    expect(adjusted.$fn).toBe(100)
  })

  it('does not apply $fa/$fs when quality settings are null', () => {
    const controller = new RenderController()
    const params = { $fa: 5, $fs: 0.5 }
    const adjusted = controller.applyQualitySettings(params, RENDER_QUALITY.FULL)
    
    expect(adjusted.$fa).toBe(5)
    expect(adjusted.$fs).toBe(0.5)
  })

  it('applies minFa when $fa is undefined', () => {
    const controller = new RenderController()
    const params = {}
    const adjusted = controller.applyQualitySettings(params, RENDER_QUALITY.DRAFT)
    
    // DRAFT minFa=15 (community draft standard)
    expect(adjusted.$fa).toBe(15)
  })

  it('applies minFs when $fs is undefined', () => {
    const controller = new RenderController()
    const params = {}
    const adjusted = controller.applyQualitySettings(params, RENDER_QUALITY.DRAFT)
    
    // DRAFT minFs=3 (community draft standard)
    expect(adjusted.$fs).toBe(3)
  })

  it('returns not busy when no current request', () => {
    const controller = new RenderController()
    controller.currentRequest = null
    expect(controller.isBusy()).toBe(false)
  })

  it('getMemoryUsage returns default when worker not ready', async () => {
    const controller = new RenderController()
    controller.worker = null
    controller.ready = false
    
    const result = await controller.getMemoryUsage()
    
    expect(result.available).toBe(false)
    expect(result.percent).toBe(0)
  })

  it('checkMemoryUsage does nothing when worker not ready', async () => {
    const controller = new RenderController()
    controller.worker = null
    controller.ready = false
    
    // Should not throw
    await controller.checkMemoryUsage()
  })

  it('checkMemoryUsage posts message when worker is ready', async () => {
    const controller = new RenderController()
    controller.worker = { postMessage: vi.fn() }
    controller.ready = true
    
    await controller.checkMemoryUsage()
    
    expect(controller.worker.postMessage).toHaveBeenCalledWith({ type: 'GET_MEMORY_USAGE' })
  })

  it('terminate cleans up worker', () => {
    const controller = new RenderController()
    controller.worker = { terminate: vi.fn() }
    controller.ready = true
    controller.currentRequest = { id: 'render-1' }
    
    controller.terminate()
    
    expect(controller.worker).toBeNull()
    expect(controller.ready).toBe(false)
    expect(controller.currentRequest).toBeNull()
  })

  it('cancel does nothing when no current request', () => {
    const controller = new RenderController()
    controller.worker = { postMessage: vi.fn() }
    controller.currentRequest = null
    
    controller.cancel()
    
    expect(controller.worker.postMessage).not.toHaveBeenCalled()
  })

  it('renderPreview uses PREVIEW quality by default', async () => {
    const controller = new RenderController()
    controller.worker = { postMessage: vi.fn() }
    controller.ready = true
    
    const renderPromise = controller.renderPreview('cube(1);', {})
    
    await Promise.resolve()
    
    const requestId = controller.currentRequest.id
    controller.handleMessage({
      type: 'COMPLETE',
      payload: { requestId, data: new ArrayBuffer(1), stats: { triangles: 1 } }
    })
    
    await renderPromise
    
    // Verify quality was applied (timeout should be PREVIEW timeout)
    const call = controller.worker.postMessage.mock.calls[0][0]
    expect(call.payload.timeoutMs).toBe(RENDER_QUALITY.PREVIEW.timeoutMs)
  })

  it('renderFull uses FULL quality', async () => {
    const controller = new RenderController()
    controller.worker = { postMessage: vi.fn() }
    controller.ready = true
    
    const renderPromise = controller.renderFull('cube(1);', {})
    
    await Promise.resolve()
    
    const requestId = controller.currentRequest.id
    controller.handleMessage({
      type: 'COMPLETE',
      payload: { requestId, data: new ArrayBuffer(1), stats: { triangles: 1 } }
    })
    
    await renderPromise
    
    // Verify quality was applied (timeout should be FULL timeout)
    const call = controller.worker.postMessage.mock.calls[0][0]
    expect(call.payload.timeoutMs).toBe(RENDER_QUALITY.FULL.timeoutMs)
  })

  it('throws error when rendering without init', async () => {
    const controller = new RenderController()
    controller.ready = false
    
    await expect(controller.render('cube(1);', {})).rejects.toThrow('Worker not ready')
  })

  it('converts files Map to object for render', async () => {
    const controller = new RenderController()
    controller.worker = { postMessage: vi.fn() }
    controller.ready = true
    
    const files = new Map([['main.scad', 'cube(1);']])
    const renderPromise = controller.render('cube(1);', {}, { files, mainFile: 'main.scad' })
    
    await Promise.resolve()
    
    const requestId = controller.currentRequest.id
    controller.handleMessage({
      type: 'COMPLETE',
      payload: { requestId, data: new ArrayBuffer(1), stats: { triangles: 1 } }
    })
    
    await renderPromise
    
    const call = controller.worker.postMessage.mock.calls[0][0]
    expect(call.payload.files).toEqual({ 'main.scad': 'cube(1);' })
    expect(call.payload.mainFile).toBe('main.scad')
  })

  it('passes libraries to render', async () => {
    const controller = new RenderController()
    controller.worker = { postMessage: vi.fn() }
    controller.ready = true
    
    const libraries = [{ id: 'MCAD', path: '/libraries/MCAD' }]
    const renderPromise = controller.render('cube(1);', {}, { libraries })
    
    await Promise.resolve()
    
    const requestId = controller.currentRequest.id
    controller.handleMessage({
      type: 'COMPLETE',
      payload: { requestId, data: new ArrayBuffer(1), stats: { triangles: 1 } }
    })
    
    await renderPromise
    
    const call = controller.worker.postMessage.mock.calls[0][0]
    expect(call.payload.libraries).toEqual(libraries)
  })
})

describe('estimateRenderTime', () => {
  it('returns base estimate for simple content', () => {
    const estimate = estimateRenderTime('cube(10);')
    
    expect(estimate.seconds).toBeGreaterThanOrEqual(2)
    expect(estimate.complexity).toBeGreaterThanOrEqual(0)
    expect(estimate.confidence).toBeDefined()
    expect(estimate.warning).toBeNull()
  })
  
  it('returns higher estimate for complex operations', () => {
    const simple = estimateRenderTime('cube(10);')
    const complex = estimateRenderTime(`
      minkowski() {
        cube(10);
        sphere(2);
      }
    `)
    
    expect(complex.complexity).toBeGreaterThan(simple.complexity)
    expect(complex.seconds).toBeGreaterThanOrEqual(simple.seconds)
  })
  
  it('detects expensive operations', () => {
    const scad = `
      minkowski() {
        hull() { sphere(5); translate([20,0,0]) sphere(5); }
        cube(1);
      }
    `
    const estimate = estimateRenderTime(scad)
    
    expect(estimate.warning).toContain('minkowski')
    expect(estimate.details.minkowskis).toBe(1)
    expect(estimate.details.hulls).toBe(1)
  })
  
  it('accounts for high $fn value', () => {
    const lowFn = estimateRenderTime('sphere(10);', { $fn: 16 })
    const highFn = estimateRenderTime('sphere(10);', { $fn: 200 })
    
    expect(highFn.complexity).toBeGreaterThan(lowFn.complexity)
    expect(highFn.warning).toContain('$fn')
  })
  
  it('counts for loops', () => {
    const scad = `
      for (i = [0:10]) {
        for (j = [0:10]) {
          translate([i*2, j*2, 0]) cube(1);
        }
      }
    `
    const estimate = estimateRenderTime(scad)
    
    expect(estimate.details.forLoops).toBe(2)
    expect(estimate.complexity).toBeGreaterThan(0)
  })
  
  it('handles empty or null content', () => {
    expect(estimateRenderTime(null).complexity).toBe(0)
    expect(estimateRenderTime('').complexity).toBe(0)
    expect(estimateRenderTime(undefined).complexity).toBe(0)
  })
  
  it('returns confidence levels based on complexity', () => {
    const simple = estimateRenderTime('cube(1);')
    const complex = estimateRenderTime(`
      minkowski() {
        intersection() {
          difference() {
            hull() { sphere(10); cube(10); }
            cylinder(h=20, r=5);
          }
          sphere(15);
        }
        cube(0.5);
      }
      for (i = [0:20]) for (j = [0:20]) translate([i,j,0]) cube(1);
    `)
    
    expect(simple.confidence).toBe('high')
    expect(complex.confidence).toBe('low')
  })
})
