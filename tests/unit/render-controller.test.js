import { describe, it, expect, vi } from 'vitest'
import { RenderController, RENDER_QUALITY } from '../../src/js/render-controller.js'

describe('RenderController', () => {
  it('applies quality settings to parameters', () => {
    const controller = new RenderController()
    const params = { $fn: 100, $fa: 5, $fs: 0.5 }
    const adjusted = controller.applyQualitySettings(params, RENDER_QUALITY.DRAFT)

    expect(adjusted.$fn).toBe(16)
    expect(adjusted.$fa).toBe(12)
    expect(adjusted.$fs).toBe(2)
  })

  it('forces $fn when missing and forceFn is true', () => {
    const controller = new RenderController()
    const adjusted = controller.applyQualitySettings({}, RENDER_QUALITY.DRAFT)

    expect(adjusted.$fn).toBe(16)
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
})
