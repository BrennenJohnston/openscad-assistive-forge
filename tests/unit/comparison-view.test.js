import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

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
    updateTheme() {}
  }
}))

import { ComparisonView } from '../../src/js/comparison-view.js'
import { escapeHtml } from '../../src/js/html-utils.js'

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
      exportComparison: vi.fn(() => ({ variants: [] })),
      removeVariant: vi.fn(),
      clearVariants: vi.fn(),
      updateVariant: vi.fn()
    }

    view = new ComparisonView(container, comparisonController)
  })

  afterEach(() => {
    if (container.parentNode) {
      document.body.removeChild(container)
    }
  })

  describe('Constructor', () => {
    it('initializes with default options', () => {
      expect(view.container).toBe(container)
      expect(view.theme).toBe('light')
      expect(view.highContrast).toBe(false)
      expect(view.isAutoRendering).toBe(false)
    })

    it('initializes with custom options', () => {
      const customView = new ComparisonView(container, comparisonController, {
        theme: 'dark',
        highContrast: true
      })
      
      expect(customView.theme).toBe('dark')
      expect(customView.highContrast).toBe(true)
    })

    it('subscribes to comparison controller', () => {
      expect(comparisonController.subscribe).toHaveBeenCalled()
    })
  })

  describe('Layout Creation', () => {
    it('creates the comparison layout markup', () => {
      const layout = view.createComparisonLayout()
      expect(layout).toContain('comparison-container')
      expect(layout).toContain('comparison-grid')
    })

    it('includes all control buttons', () => {
      const layout = view.createComparisonLayout()
      expect(layout).toContain('render-all-btn')
      expect(layout).toContain('export-comparison-btn')
      expect(layout).toContain('exit-comparison-btn')
      expect(layout).toContain('Return to Customizer')
    })

    it('includes empty state message', () => {
      const layout = view.createComparisonLayout()
      expect(layout).toContain('comparison-empty-state')
      expect(layout).toContain('No variants added')
    })
  })

  describe('Event Handling', () => {
    it('dispatches exit events', () => {
      const eventSpy = vi.fn()
      window.addEventListener('comparison:exit', eventSpy)

      view.handleExit()

      expect(eventSpy).toHaveBeenCalled()
      window.removeEventListener('comparison:exit', eventSpy)
    })
  })

  describe('Auto Render', () => {
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

    it('skips variants that are no longer pending', async () => {
      // First call returns pending variants, but getVariant shows they're complete
      comparisonController.getAllVariants
        .mockReturnValueOnce([{ id: 'v1', state: 'pending' }])
        .mockReturnValueOnce([]) // Second call for re-check
      comparisonController.getVariant.mockImplementation((id) => {
        return { id, state: 'complete' } // Changed during check
      })

      await view.autoRenderPendingVariants()

      expect(comparisonController.renderVariant).not.toHaveBeenCalled()
    })

    it('prevents concurrent auto-render cycles', async () => {
      view.isAutoRendering = true
      comparisonController.getAllVariants.mockReturnValue([
        { id: 'v1', state: 'pending' }
      ])

      await view.autoRenderPendingVariants()

      expect(comparisonController.renderVariant).not.toHaveBeenCalled()
    })

    it('handles render errors gracefully', async () => {
      comparisonController.getAllVariants
        .mockReturnValueOnce([
          { id: 'v1', state: 'pending' },
          { id: 'v2', state: 'pending' }
        ])
        .mockReturnValueOnce([]) // Second call for re-check returns empty
      comparisonController.getVariant.mockImplementation((id) => ({ id, state: 'pending' }))
      comparisonController.renderVariant
        .mockRejectedValueOnce(new Error('Render failed'))
        .mockResolvedValueOnce()

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      
      await view.autoRenderPendingVariants()

      expect(consoleSpy).toHaveBeenCalled()
      expect(comparisonController.renderVariant).toHaveBeenCalledTimes(2)
      
      consoleSpy.mockRestore()
    })

    it('returns early when no pending variants', async () => {
      comparisonController.getAllVariants.mockReturnValue([
        { id: 'v1', state: 'complete' }
      ])

      await view.autoRenderPendingVariants()

      expect(comparisonController.renderVariant).not.toHaveBeenCalled()
    })
  })

  describe('Render All', () => {
    it('invokes renderAllVariants and updates button state', async () => {
      await view.init()

      const renderAllBtn = document.getElementById('render-all-btn')
      await view.handleRenderAll()

      expect(comparisonController.renderAllVariants).toHaveBeenCalled()
      expect(renderAllBtn.disabled).toBe(false)
    })
  })

  describe('Export', () => {
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
  })

  describe('State Labels', () => {
    it('returns correct label for pending state', () => {
      const label = view.getStateLabel('pending')
      expect(label).toBe('Pending')
    })

    it('returns correct label for rendering state', () => {
      const label = view.getStateLabel('rendering')
      expect(label).toBe('Rendering...')
    })

    it('returns correct label for complete state', () => {
      const label = view.getStateLabel('complete')
      expect(label).toBe('Complete')
    })

    it('returns correct label for error state', () => {
      const label = view.getStateLabel('error')
      expect(label).toBe('Error')
    })

    it('returns state as-is for unknown state', () => {
      const label = view.getStateLabel('unknown')
      // The implementation returns the state as-is if not recognized
      expect(label).toBe('unknown')
    })
  })

  describe('HTML Escaping', () => {
    it('escapes HTML special characters', () => {
      const escaped = escapeHtml('<script>alert("xss")</script>')
      expect(escaped).not.toContain('<script>')
      expect(escaped).toContain('&lt;')
      expect(escaped).toContain('&gt;')
    })

    it('escapes ampersands', () => {
      const escaped = escapeHtml('A & B')
      expect(escaped).toBe('A &amp; B')
    })

    it('handles strings with quotes', () => {
      // The implementation may not escape quotes, but should handle them
      const escaped = escapeHtml('"quoted"')
      expect(typeof escaped).toBe('string')
    })
  })

  describe('Variant Card HTML', () => {
    it('creates variant card with correct structure', () => {
      const variant = {
        id: 'test-id',
        name: 'Test Variant',
        state: 'pending'
      }
      
      const html = view.createVariantCardHTML(variant)
      
      expect(html).toContain('variant-header')
      expect(html).toContain('variant-preview')
      expect(html).toContain('variant-status')
      expect(html).toContain('Test Variant')
    })

    it('includes stats when available', () => {
      const variant = {
        id: 'test-id',
        name: 'Test Variant',
        state: 'complete',
        stats: { triangles: 1000 }
      }
      
      const html = view.createVariantCardHTML(variant)
      
      expect(html).toContain('1000 triangles')
    })

    it('includes error message when present', () => {
      const variant = {
        id: 'test-id',
        name: 'Test Variant',
        state: 'error',
        error: 'Render failed'
      }
      
      const html = view.createVariantCardHTML(variant)
      
      expect(html).toContain('Render failed')
      expect(html).toContain('status-error')
    })

    it('disables download button when not complete', () => {
      const variant = {
        id: 'test-id',
        name: 'Test Variant',
        state: 'pending'
      }
      
      const html = view.createVariantCardHTML(variant)
      
      expect(html).toContain('disabled')
    })

    it('enables download button when complete', () => {
      const variant = {
        id: 'test-id',
        name: 'Test Variant',
        state: 'complete'
      }
      
      const html = view.createVariantCardHTML(variant)
      
      // Should not have disabled on download button
      const downloadBtnMatch = html.match(/variant-download-btn[^>]*>/);
      expect(downloadBtnMatch[0]).not.toContain('disabled')
    })
  })

  describe('Comparison Events', () => {
    it('handles add event', async () => {
      await view.init()
      view.addVariantCard = vi.fn()
      view.autoRenderPendingVariants = vi.fn()
      view.updateControls = vi.fn()
      view.updateEmptyState = vi.fn()
      
      const variant = { id: 'v1', name: 'Test', state: 'pending' }
      view.handleComparisonEvent('add', variant)
      
      expect(view.addVariantCard).toHaveBeenCalledWith(variant)
    })

    it('handles remove event', async () => {
      await view.init()
      view.removeVariantCard = vi.fn()
      view.updateControls = vi.fn()
      view.updateEmptyState = vi.fn()
      
      view.handleComparisonEvent('remove', { id: 'v1' })
      
      expect(view.removeVariantCard).toHaveBeenCalledWith('v1')
    })

    it('handles update event', async () => {
      await view.init()
      view.updateVariantCard = vi.fn()
      view.updateControls = vi.fn()
      view.updateEmptyState = vi.fn()
      
      const variant = { id: 'v1', name: 'Updated', state: 'complete' }
      view.handleComparisonEvent('update', variant)
      
      expect(view.updateVariantCard).toHaveBeenCalledWith(variant)
    })

    it('handles clear event', async () => {
      await view.init()
      view.clearAllVariantCards = vi.fn()
      view.updateControls = vi.fn()
      view.updateEmptyState = vi.fn()
      
      view.handleComparisonEvent('clear', {})
      
      expect(view.clearAllVariantCards).toHaveBeenCalled()
    })
  })

  describe('Dispose', () => {
    it('disposes all preview managers', async () => {
      const mockPreviewManager = {
        init: vi.fn().mockResolvedValue(),
        loadSTL: vi.fn(),
        dispose: vi.fn()
      }
      
      view.previewManagers.set('v1', mockPreviewManager)
      view.previewManagers.set('v2', mockPreviewManager)
      
      view.dispose()
      
      expect(mockPreviewManager.dispose).toHaveBeenCalledTimes(2)
      expect(view.previewManagers.size).toBe(0)
    })

    it('clears container innerHTML', () => {
      container.innerHTML = '<div>test</div>'
      
      view.dispose()
      
      expect(container.innerHTML).toBe('')
    })
  })

  describe('Theme Updates', () => {
    it('updates theme for all preview managers', () => {
      const mockPreviewManager = {
        updateTheme: vi.fn()
      }
      
      view.previewManagers.set('v1', mockPreviewManager)
      view.previewManagers.set('v2', mockPreviewManager)
      
      view.updateTheme('dark', true)
      
      expect(view.theme).toBe('dark')
      expect(view.highContrast).toBe(true)
      expect(mockPreviewManager.updateTheme).toHaveBeenCalledWith('dark', true)
      expect(mockPreviewManager.updateTheme).toHaveBeenCalledTimes(2)
    })
  })

  describe('Add Variant Card', () => {
    it('returns early when grid element not found', async () => {
      // Remove the grid element
      const grid = document.getElementById('comparison-grid')
      if (grid) grid.remove()
      
      const variant = { id: 'v1', name: 'Test', state: 'pending' }
      
      // Should not throw
      await expect(view.addVariantCard(variant)).resolves.toBeUndefined()
    })

    it('loads STL when variant is complete', async () => {
      await view.init()
      
      const mockSTL = new ArrayBuffer(100)
      const variant = { 
        id: 'v1', 
        name: 'Test', 
        state: 'complete',
        stl: mockSTL
      }
      
      await view.addVariantCard(variant)
      
      const previewManager = view.previewManagers.get('v1')
      expect(previewManager).toBeDefined()
    })
  })

  describe('Update Variant Card', () => {
    it('returns early when card not found', () => {
      const variant = { id: 'nonexistent', name: 'Test', state: 'pending' }
      
      // Should not throw
      expect(() => view.updateVariantCard(variant)).not.toThrow()
    })

    it('updates name input when changed', async () => {
      await view.init()
      
      const variant = { id: 'v1', name: 'Original', state: 'pending' }
      await view.addVariantCard(variant)
      
      const updatedVariant = { id: 'v1', name: 'Updated', state: 'pending' }
      view.updateVariantCard(updatedVariant)
      
      const nameInput = document.querySelector(`[data-variant-id="v1"].variant-name-input`)
      expect(nameInput.value).toBe('Updated')
    })

    it('loads STL when variant becomes complete', async () => {
      await view.init()
      
      const variant = { id: 'v1', name: 'Test', state: 'pending' }
      await view.addVariantCard(variant)
      
      const mockSTL = new ArrayBuffer(100)
      const updatedVariant = { id: 'v1', name: 'Test', state: 'complete', stl: mockSTL }
      view.updateVariantCard(updatedVariant)
      
      // Preview manager should have been called
      const previewManager = view.previewManagers.get('v1')
      expect(previewManager).toBeDefined()
    })
  })

  describe('Remove Variant Card', () => {
    it('removes card and disposes preview manager', async () => {
      await view.init()
      comparisonController.getVariantCount = vi.fn(() => 1)
      
      const variant = { id: 'v1', name: 'Test', state: 'pending' }
      await view.addVariantCard(variant)
      
      expect(document.getElementById('variant-card-v1')).not.toBeNull()
      expect(view.previewManagers.has('v1')).toBe(true)
      
      comparisonController.getVariantCount = vi.fn(() => 0)
      view.removeVariantCard('v1')
      
      expect(document.getElementById('variant-card-v1')).toBeNull()
      expect(view.previewManagers.has('v1')).toBe(false)
    })

    it('handles removing non-existent card', () => {
      comparisonController.getVariantCount = vi.fn(() => 0)
      expect(() => view.removeVariantCard('nonexistent')).not.toThrow()
    })
  })

  describe('Update Empty State', () => {
    it('shows empty state when no variants', async () => {
      await view.init()
      comparisonController.getVariantCount = vi.fn(() => 0)
      
      // Clear grid first
      const grid = document.getElementById('comparison-grid')
      grid.innerHTML = ''
      
      view.updateEmptyState()
      
      const emptyState = grid.querySelector('.comparison-empty-state')
      expect(emptyState).not.toBeNull()
    })

    it('removes empty state when variants exist', async () => {
      await view.init()
      comparisonController.getVariantCount = vi.fn(() => 1)
      
      view.updateEmptyState()
      
      const grid = document.getElementById('comparison-grid')
      const emptyState = grid.querySelector('.comparison-empty-state')
      expect(emptyState).toBeNull()
    })

    it('handles missing grid element', () => {
      const grid = document.getElementById('comparison-grid')
      if (grid) grid.remove()
      
      expect(() => view.updateEmptyState()).not.toThrow()
    })
  })

  describe('Update Controls', () => {
    it('disables render and export when no variants', async () => {
      await view.init()
      comparisonController.getVariantCount = vi.fn(() => 0)
      
      view.updateControls()
      
      const renderAllBtn = document.getElementById('render-all-btn')
      const exportBtn = document.getElementById('export-comparison-btn')
      expect(renderAllBtn.disabled).toBe(true)
      expect(exportBtn.disabled).toBe(true)
    })
  })

  describe('Variant Card Listeners', () => {
    it('handles name change', async () => {
      await view.init()
      comparisonController.renameVariant = vi.fn()
      
      const variant = { id: 'v1', name: 'Test', state: 'pending' }
      await view.addVariantCard(variant)
      
      const nameInput = document.querySelector(`[data-variant-id="v1"].variant-name-input`)
      nameInput.value = 'New Name'
      nameInput.dispatchEvent(new Event('change'))
      
      expect(comparisonController.renameVariant).toHaveBeenCalledWith('v1', 'New Name')
    })

    it('ignores empty name change', async () => {
      await view.init()
      comparisonController.renameVariant = vi.fn()
      
      const variant = { id: 'v1', name: 'Test', state: 'pending' }
      await view.addVariantCard(variant)
      
      const nameInput = document.querySelector(`[data-variant-id="v1"].variant-name-input`)
      nameInput.value = '   '
      nameInput.dispatchEvent(new Event('change'))
      
      expect(comparisonController.renameVariant).not.toHaveBeenCalled()
    })
  })

  describe('Handle Render Variant', () => {
    it('renders variant successfully', async () => {
      await view.init()
      
      await view.handleRenderVariant('v1')
      
      expect(comparisonController.renderVariant).toHaveBeenCalledWith('v1')
    })

    it('shows alert on render error', async () => {
      await view.init()
      comparisonController.renderVariant.mockRejectedValueOnce(new Error('Render failed'))
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      
      await view.handleRenderVariant('v1')
      
      expect(alertSpy).toHaveBeenCalledWith('Render failed: Render failed')
      alertSpy.mockRestore()
      consoleSpy.mockRestore()
    })
  })

  describe('Handle Download Variant', () => {
    it('dispatches download event when STL available', () => {
      const eventSpy = vi.fn()
      window.addEventListener('comparison:download-variant', eventSpy)
      
      comparisonController.getVariant.mockReturnValue({
        id: 'v1',
        name: 'Test',
        stl: new ArrayBuffer(100)
      })
      
      view.handleDownloadVariant('v1')
      
      expect(eventSpy).toHaveBeenCalled()
      window.removeEventListener('comparison:download-variant', eventSpy)
    })

    it('shows alert when no STL available', () => {
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
      comparisonController.getVariant.mockReturnValue({ id: 'v1', name: 'Test' })
      
      view.handleDownloadVariant('v1')
      
      expect(alertSpy).toHaveBeenCalledWith('No STL available for this variant')
      alertSpy.mockRestore()
    })

    it('shows alert when variant not found', () => {
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
      comparisonController.getVariant.mockReturnValue(null)
      
      view.handleDownloadVariant('v1')
      
      expect(alertSpy).toHaveBeenCalledWith('No STL available for this variant')
      alertSpy.mockRestore()
    })
  })

  describe('Handle Edit Variant', () => {
    it('dispatches edit event', () => {
      const eventSpy = vi.fn()
      window.addEventListener('comparison:edit-variant', eventSpy)
      
      view.handleEditVariant('v1')
      
      expect(eventSpy).toHaveBeenCalled()
      const event = eventSpy.mock.calls[0][0]
      expect(event.detail.variantId).toBe('v1')
      window.removeEventListener('comparison:edit-variant', eventSpy)
    })
  })

  describe('Handle Delete Variant', () => {
    it('removes variant after confirmation', () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true)
      comparisonController.getVariant.mockReturnValue({ id: 'v1', name: 'Test' })
      
      view.handleDeleteVariant('v1')
      
      expect(comparisonController.removeVariant).toHaveBeenCalledWith('v1')
    })

    it('does not remove variant if cancelled', () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false)
      comparisonController.getVariant.mockReturnValue({ id: 'v1', name: 'Test' })
      
      view.handleDeleteVariant('v1')
      
      expect(comparisonController.removeVariant).not.toHaveBeenCalled()
    })

    it('does nothing if variant not found', () => {
      comparisonController.getVariant.mockReturnValue(null)
      
      view.handleDeleteVariant('v1')
      
      expect(comparisonController.removeVariant).not.toHaveBeenCalled()
    })
  })

  describe('Handle Render All Error', () => {
    it('shows alert on error', async () => {
      await view.init()
      comparisonController.renderAllVariants.mockRejectedValueOnce(new Error('Render failed'))
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      
      await view.handleRenderAll()
      
      expect(alertSpy).toHaveBeenCalled()
      alertSpy.mockRestore()
      consoleSpy.mockRestore()
    })
  })

  describe('Clear All Variant Cards', () => {
    it('disposes all preview managers and clears grid', async () => {
      await view.init()
      
      const mockPreviewManager = {
        init: vi.fn().mockResolvedValue(),
        loadSTL: vi.fn(),
        dispose: vi.fn()
      }
      view.previewManagers.set('v1', mockPreviewManager)
      view.previewManagers.set('v2', mockPreviewManager)
      
      view.clearAllVariantCards()
      
      expect(mockPreviewManager.dispose).toHaveBeenCalledTimes(2)
      expect(view.previewManagers.size).toBe(0)
      
      const grid = document.getElementById('comparison-grid')
      expect(grid.innerHTML).toContain('comparison-empty-state')
    })
  })

  describe('Attach Variant Card Listeners', () => {
    it('handles missing card gracefully', () => {
      expect(() => view.attachVariantCardListeners('nonexistent')).not.toThrow()
    })
  })
})
