/**
 * Unit tests for what happens after the engine fails: the worker asks for a
 * restart, the render controller can tell a stop it made from one the person
 * asked for, and the preview treats only a real cancel as one.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../src/js/feature-flags.js', () => ({
  isEnabled: vi.fn(() => false),
}))

import {
  translateWorkerError,
  workerErrorNeedsRestart,
} from '../../src/worker/error-translations.js'
import { RenderController } from '../../src/js/render-controller.js'
import {
  AutoPreviewController,
  PREVIEW_STATE,
} from '../../src/js/auto-preview-controller.js'

// The worker's own words when it refuses to run the engine a second time.
function doubleInvokeError() {
  const error = new Error(
    'WASM_DOUBLE_INVOKE: The rendering engine was not restarted between renders. ' +
      'This render has been canceled to prevent corrupted geometry. ' +
      'The engine will restart automatically before the next render.'
  )
  error.code = 'WASM_DOUBLE_INVOKE'
  error.needsRestart = true
  return error
}

function runtimeError(message) {
  const error = new Error(message)
  error.name = 'RuntimeError'
  return error
}

beforeEach(() => {
  for (const method of ['error', 'warn', 'log', 'info', 'debug']) {
    vi.spyOn(console, method).mockImplementation(() => {})
  }
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('an engine failure after the engine has run asks for a restart', () => {
  it.each([
    ['Chromium running out of stack', new RangeError('Maximum call stack size exceeded')],
    ['Firefox running out of stack', runtimeError('indirect call to null')],
    [
      'WebKit running out of stack',
      runtimeError('call_indirect to a signature that does not match'),
    ],
    ['an empty model', new Error('Current top level object is empty. Output: ')],
  ])('%s', (_, error) => {
    const { code } = translateWorkerError(error)
    expect(
      workerErrorNeedsRestart(error, code, { callMainInvoked: true })
    ).toBe(true)
  })

  it('a failure before the engine ran does not', () => {
    const error = new Error('Could not write the model file')
    const { code } = translateWorkerError(error)
    expect(
      workerErrorNeedsRestart(error, code, { callMainInvoked: false })
    ).toBe(false)
  })
})

describe('the refusal to run the engine twice', () => {
  it('keeps its code, so the render controller restarts and tries again', () => {
    expect(translateWorkerError(doubleInvokeError()).code).toBe(
      'WASM_DOUBLE_INVOKE'
    )
  })
})

describe('a stopped render says who stopped it', () => {
  function busyController() {
    const controller = new RenderController()
    controller.worker = { postMessage: vi.fn(), terminate: vi.fn() }
    vi.spyOn(controller, '_hardCancelAndReinit').mockResolvedValue(undefined)
    const reject = vi.fn()
    controller.currentRequest = { id: 'render-1', reject }
    return { controller, reject }
  }

  it('a cancel carries RENDER_CANCELLED', () => {
    const { controller, reject } = busyController()
    controller.cancel()
    expect(reject.mock.calls[0][0].code).toBe('RENDER_CANCELLED')
  })

  it('a hard cancel carries RENDER_CANCELLED', () => {
    const { controller, reject } = busyController()
    controller.cancel({ hard: true })
    expect(reject.mock.calls[0][0].code).toBe('RENDER_CANCELLED')
  })

  it('the time limit carries RENDER_TIMEOUT and the seconds it waited', async () => {
    vi.useFakeTimers()
    const controller = new RenderController()
    controller.worker = { postMessage: vi.fn(), terminate: vi.fn() }
    controller.ready = true
    vi.spyOn(controller, '_hardCancelAndReinit').mockResolvedValue(undefined)

    const render = controller.render('cube(1);', {}, { timeoutMs: 1000 })
    const outcome = render.catch((error) => error)
    await vi.waitFor(() => expect(controller.currentRequest).toBeTruthy())

    vi.advanceTimersByTime(1000 + 30000)
    const error = await outcome
    expect(error.code).toBe('RENDER_TIMEOUT')
    expect(error.message).toContain('31 seconds')
  })
})

describe('the preview treats only a real cancel as one', () => {
  let renderController
  let controller
  let onError

  beforeEach(() => {
    renderController = {
      isBusy: vi.fn(() => false),
      cancel: vi.fn(),
      renderPreview: vi.fn(),
      render: vi.fn(),
    }
    const previewManager = {
      loadSTL: vi.fn().mockResolvedValue(),
      setColorOverride: vi.fn(),
      setColorOverrideEnabled: vi.fn(),
      colorOverrideEnabled: false,
      clear: vi.fn(),
      show2DPreview: vi.fn(),
    }
    controller = new AutoPreviewController(renderController, previewManager, {
      debounceMs: 10,
    })
    controller.setScadContent('cube(10);')
    onError = vi.fn()
    controller.onError = onError
  })

  async function previewFailingWith(error) {
    renderController.renderPreview.mockRejectedValueOnce(error)
    const params = { width: 10 }
    const paramHash = controller.hashParams(params)
    controller.currentParamHash = paramHash
    controller.currentPreviewKey = `${paramHash}|model`
    await controller.renderPreview(params, paramHash)
  }

  it('a refusal whose message says "canceled" is an error, not a cancel', async () => {
    await previewFailingWith(doubleInvokeError())
    expect(controller.state).toBe(PREVIEW_STATE.ERROR)
    expect(onError).toHaveBeenCalled()
  })

  it('a stop at the time limit is an error the person is told about', async () => {
    const error = new Error('Stopped after 60 seconds')
    error.code = 'RENDER_TIMEOUT'
    await previewFailingWith(error)
    expect(controller.state).toBe(PREVIEW_STATE.ERROR)
    expect(onError).toHaveBeenCalled()
  })

  it('a cancel stays quiet', async () => {
    const error = new Error('Render canceled')
    error.code = 'RENDER_CANCELLED'
    await previewFailingWith(error)
    expect(controller.state).not.toBe(PREVIEW_STATE.ERROR)
    expect(onError).not.toHaveBeenCalled()
  })
})
