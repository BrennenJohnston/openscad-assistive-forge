import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../src/js/preview.js', () => ({
  PreviewManager: class {
    constructor() {}
    init() {
      return Promise.resolve()
    }
    loadSTL() {
      return Promise.resolve()
    }
    setColorOverride() {}
    dispose() {}
  }
}))

import { ComparisonView } from '../../src/js/comparison-view.js'

describe('ComparisonView', () => {
  let container
  let comparisonController
  let view

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)

    comparisonController = {
      subscribe: vi.fn(),
      getAllVariants: vi.fn(() => []),
      getVariant: vi.fn(),
      renderVariant: vi.fn().mockResolvedValue(),
      renderAllVariants: vi.fn().mockResolvedValue(),
      exportComparison: vi.fn(() => ({ variants: [] }))
    }

    view = new ComparisonView(container, comparisonController)
  })

  it('creates the comparison layout markup', () => {
    const layout = view.createComparisonLayout()
    expect(layout).toContain('comparison-container')
    expect(layout).toContain('comparison-grid')
  })

  it('dispatches add-variant events on button click', async () => {
    const eventSpy = vi.fn()
    window.addEventListener('comparison:add-variant', eventSpy)

    await view.init()
    const addButton = document.getElementById('add-variant-btn')
    addButton.click()

    expect(eventSpy).toHaveBeenCalled()
  })

  it('renders all pending variants when requested', async () => {
    comparisonController.getAllVariants.mockReturnValue([
      { id: 'v1', state: 'pending' },
      { id: 'v2', state: 'pending' }
    ])
    comparisonController.getVariant.mockImplementation((id) => ({ id, state: 'pending' }))

    await view.autoRenderPendingVariants()

    expect(comparisonController.renderVariant).toHaveBeenCalledWith('v1')
    expect(comparisonController.renderVariant).toHaveBeenCalledWith('v2')
  })

  it('invokes renderAllVariants and updates button state', async () => {
    await view.init()

    const renderAllBtn = document.getElementById('render-all-btn')
    await view.handleRenderAll()

    expect(comparisonController.renderAllVariants).toHaveBeenCalled()
    expect(renderAllBtn.disabled).toBe(false)
  })

  it('exports comparison data to a JSON download', () => {
    const createObjectURL = vi.fn(() => 'blob:mock')
    const revokeObjectURL = vi.fn()
    global.URL.createObjectURL = createObjectURL
    global.URL.revokeObjectURL = revokeObjectURL

    view.handleExport()

    expect(comparisonController.exportComparison).toHaveBeenCalled()
    expect(createObjectURL).toHaveBeenCalled()
    expect(revokeObjectURL).toHaveBeenCalled()
  })

  it('dispatches exit events', () => {
    const eventSpy = vi.fn()
    window.addEventListener('comparison:exit', eventSpy)

    view.handleExit()

    expect(eventSpy).toHaveBeenCalled()
  })
})
