import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { PreviewManager, isThreeJsLoaded } from '../../src/js/preview.js'

describe('PreviewManager', () => {
  let container

  beforeEach(() => {
    container = document.createElement('div')
    container.style.width = '800px'
    container.style.height = '600px'
    document.body.appendChild(container)
    localStorage.clear()
  })

  afterEach(() => {
    document.body.removeChild(container)
    localStorage.clear()
  })

  describe('Three.js Loading', () => {
    it('reports Three.js as not loaded initially', () => {
      expect(isThreeJsLoaded()).toBe(false)
    })
  })

  describe('Constructor', () => {
    it('initializes with default options', () => {
      const manager = new PreviewManager(container)
      
      expect(manager.container).toBe(container)
      expect(manager.currentTheme).toBe('light')
      expect(manager.highContrast).toBe(false)
      expect(manager.colorOverride).toBeNull()
      expect(manager.measurementsEnabled).toBe(false)
    })

    it('initializes with custom theme option', () => {
      const manager = new PreviewManager(container, { theme: 'dark' })
      
      expect(manager.currentTheme).toBe('dark')
    })

    it('initializes with high contrast option', () => {
      const manager = new PreviewManager(container, { highContrast: true })
      
      expect(manager.highContrast).toBe(true)
    })

    it('loads measurement preference from localStorage', () => {
      localStorage.setItem('openscad-customizer-measurements', 'true')
      const manager = new PreviewManager(container)
      
      expect(manager.measurementsEnabled).toBe(true)
    })
  })

  describe('Measurement Preferences', () => {
    it('loads and saves measurement preference', () => {
      localStorage.setItem('openscad-customizer-measurements', 'true')
      const manager = new PreviewManager(container)

      expect(manager.loadMeasurementPreference()).toBe(true)

      manager.saveMeasurementPreference(false)
      expect(localStorage.getItem('openscad-customizer-measurements')).toBe('false')
    })

    it('returns false when localStorage is empty', () => {
      const manager = new PreviewManager(container)
      expect(manager.loadMeasurementPreference()).toBe(false)
    })

    it('handles localStorage errors gracefully when loading', () => {
      const manager = new PreviewManager(container)
      const originalGetItem = localStorage.getItem
      localStorage.getItem = vi.fn(() => { throw new Error('Storage error') })
      
      expect(manager.loadMeasurementPreference()).toBe(false)
      
      localStorage.getItem = originalGetItem
    })

    it('handles localStorage errors gracefully when saving', () => {
      const manager = new PreviewManager(container)
      const originalSetItem = localStorage.setItem
      localStorage.setItem = vi.fn(() => { throw new Error('Storage error') })
      
      // Should not throw
      expect(() => manager.saveMeasurementPreference(true)).not.toThrow()
      
      localStorage.setItem = originalSetItem
    })
  })

  describe('Color Override', () => {
    it('applies color overrides when a mesh is present', () => {
      const manager = new PreviewManager(container)
      manager.mesh = {
        material: {
          color: { setHex: vi.fn() }
        }
      }

      manager.setColorOverride('#ff0000')

      expect(manager.colorOverride).toBe('#ff0000')
      expect(manager.mesh.material.color.setHex).toHaveBeenCalled()
    })

    it('normalizes hex colors without hash', () => {
      const manager = new PreviewManager(container)
      manager.mesh = {
        material: {
          color: { setHex: vi.fn() }
        }
      }

      manager.setColorOverride('00ff00')

      expect(manager.colorOverride).toBe('#00ff00')
    })

    it('handles invalid hex colors', () => {
      const manager = new PreviewManager(container)
      manager.mesh = {
        material: {
          color: { setHex: vi.fn() }
        }
      }

      manager.setColorOverride('invalid')

      expect(manager.colorOverride).toBeNull()
    })

    it('handles empty string color', () => {
      const manager = new PreviewManager(container)
      manager.setColorOverride('')
      
      expect(manager.colorOverride).toBeNull()
    })

    it('handles null color', () => {
      const manager = new PreviewManager(container)
      manager.setColorOverride(null)
      
      expect(manager.colorOverride).toBeNull()
    })

    it('does nothing when no mesh is present', () => {
      const manager = new PreviewManager(container)
      manager.mesh = null

      // Should not throw
      expect(() => manager.setColorOverride('#ff0000')).not.toThrow()
      expect(manager.colorOverride).toBe('#ff0000')
    })
  })

  describe('Toggle Measurements', () => {
    it('toggles measurements and persists preference', () => {
      const manager = new PreviewManager(container)
      manager.mesh = {}
      manager.showMeasurements = vi.fn()
      manager.hideMeasurements = vi.fn()

      manager.toggleMeasurements(true)
      expect(manager.showMeasurements).toHaveBeenCalled()
      expect(localStorage.getItem('openscad-customizer-measurements')).toBe('true')

      manager.toggleMeasurements(false)
      expect(manager.hideMeasurements).toHaveBeenCalled()
      expect(localStorage.getItem('openscad-customizer-measurements')).toBe('false')
    })

    it('does not show measurements when no mesh exists', () => {
      const manager = new PreviewManager(container)
      manager.mesh = null
      manager.showMeasurements = vi.fn()

      manager.toggleMeasurements(true)
      
      expect(manager.showMeasurements).not.toHaveBeenCalled()
      expect(manager.measurementsEnabled).toBe(true)
    })
  })

  describe('Theme Detection', () => {
    it('detects light theme from document', () => {
      document.documentElement.setAttribute('data-theme', 'light')
      document.documentElement.setAttribute('data-high-contrast', 'false')
      
      const manager = new PreviewManager(container)
      const theme = manager.detectTheme()
      
      expect(theme).toBe('light')
    })

    it('detects dark theme from document', () => {
      document.documentElement.setAttribute('data-theme', 'dark')
      document.documentElement.setAttribute('data-high-contrast', 'false')
      
      const manager = new PreviewManager(container)
      const theme = manager.detectTheme()
      
      expect(theme).toBe('dark')
    })

    it('detects high contrast light theme', () => {
      document.documentElement.setAttribute('data-theme', 'light')
      document.documentElement.setAttribute('data-high-contrast', 'true')
      
      const manager = new PreviewManager(container)
      const theme = manager.detectTheme()
      
      expect(theme).toBe('light-hc')
    })

    it('detects high contrast dark theme', () => {
      document.documentElement.setAttribute('data-theme', 'dark')
      document.documentElement.setAttribute('data-high-contrast', 'true')
      
      const manager = new PreviewManager(container)
      const theme = manager.detectTheme()
      
      expect(theme).toBe('dark-hc')
    })

    afterEach(() => {
      document.documentElement.removeAttribute('data-theme')
      document.documentElement.removeAttribute('data-high-contrast')
    })
  })

  describe('Theme Update', () => {
    it('updates theme when scene exists (no grid)', () => {
      const manager = new PreviewManager(container)
      manager.scene = {
        background: { setHex: vi.fn() },
        remove: vi.fn(),
        add: vi.fn()
      }
      manager.gridHelper = null // No grid helper
      manager.currentTheme = 'light'

      manager.updateTheme('dark', false)

      expect(manager.currentTheme).toBe('dark')
      expect(manager.scene.background.setHex).toHaveBeenCalled()
    })

    it('does not update when scene is null', () => {
      const manager = new PreviewManager(container)
      manager.scene = null
      manager.currentTheme = 'light'

      manager.updateTheme('dark', false)

      // Should not throw and theme should not change
      expect(manager.currentTheme).toBe('light')
    })

    it('does not update when theme is the same', () => {
      const manager = new PreviewManager(container)
      manager.scene = {
        background: { setHex: vi.fn() }
      }
      manager.currentTheme = 'dark'

      manager.updateTheme('dark', false)

      expect(manager.scene.background.setHex).not.toHaveBeenCalled()
    })

    it('applies high contrast suffix when needed (no grid)', () => {
      const manager = new PreviewManager(container)
      manager.scene = {
        background: { setHex: vi.fn() },
        remove: vi.fn(),
        add: vi.fn()
      }
      manager.gridHelper = null // No grid helper
      manager.currentTheme = 'light'

      manager.updateTheme('dark', true)

      expect(manager.currentTheme).toBe('dark-hc')
      expect(manager.highContrast).toBe(true)
    })

    it('updates mesh color when mesh exists (no grid)', () => {
      const manager = new PreviewManager(container)
      manager.scene = {
        background: { setHex: vi.fn() },
        remove: vi.fn(),
        add: vi.fn()
      }
      manager.gridHelper = null // No grid helper
      manager.mesh = {
        material: {
          color: { setHex: vi.fn() }
        }
      }
      manager.currentTheme = 'light'

      manager.updateTheme('dark', false)

      expect(manager.mesh.material.color.setHex).toHaveBeenCalled()
    })

    it('refreshes measurements when enabled and mesh exists (no grid)', () => {
      const manager = new PreviewManager(container)
      manager.scene = {
        background: { setHex: vi.fn() },
        remove: vi.fn(),
        add: vi.fn()
      }
      manager.gridHelper = null // No grid helper
      manager.mesh = {}
      manager.measurementsEnabled = true
      manager.showMeasurements = vi.fn()
      manager.currentTheme = 'light'

      manager.updateTheme('dark', false)

      expect(manager.showMeasurements).toHaveBeenCalled()
    })
  })

  describe('LOD Warning', () => {
    it('shows LOD warning for large models', () => {
      const manager = new PreviewManager(container)
      
      manager.showLODWarning(150000, 50000, false)
      
      const warning = container.querySelector('#lodWarning')
      expect(warning).not.toBeNull()
      expect(warning.classList.contains('lod-warning--warning')).toBe(true)
      expect(warning.textContent).toContain('150,000')
    })

    it('shows critical LOD warning for very large models', () => {
      const manager = new PreviewManager(container)
      
      manager.showLODWarning(600000, 200000, true)
      
      const warning = container.querySelector('#lodWarning')
      expect(warning).not.toBeNull()
      expect(warning.classList.contains('lod-warning--critical')).toBe(true)
      expect(warning.textContent).toContain('Very Large Model')
    })

    it('hides LOD warning', () => {
      const manager = new PreviewManager(container)
      manager.showLODWarning(150000, 50000, false)
      
      expect(container.querySelector('#lodWarning')).not.toBeNull()
      
      manager.hideLODWarning()
      
      expect(container.querySelector('#lodWarning')).toBeNull()
    })

    it('removes existing warning before showing new one', () => {
      const manager = new PreviewManager(container)
      manager.showLODWarning(150000, 50000, false)
      manager.showLODWarning(600000, 200000, true)
      
      const warnings = container.querySelectorAll('#lodWarning')
      expect(warnings.length).toBe(1)
      expect(warnings[0].classList.contains('lod-warning--critical')).toBe(true)
    })

    it('dismiss button hides warning', () => {
      const manager = new PreviewManager(container)
      manager.showLODWarning(150000, 50000, false)
      
      const dismissBtn = container.querySelector('#lodWarningDismiss')
      dismissBtn.click()
      
      expect(container.querySelector('#lodWarning')).toBeNull()
    })

    it('handles hideLODWarning when no warning exists', () => {
      const manager = new PreviewManager(container)
      
      // Should not throw
      expect(() => manager.hideLODWarning()).not.toThrow()
    })

    it('handles hideLODWarning when container is null', () => {
      const manager = new PreviewManager(container)
      manager.container = null
      
      // Should not throw
      expect(() => manager.hideLODWarning()).not.toThrow()
    })
  })

  describe('LOD Stats', () => {
    it('returns default stats when no model loaded', () => {
      const manager = new PreviewManager(container)
      
      const stats = manager.getLODStats()
      
      expect(stats.vertexCount).toBe(0)
      expect(stats.triangleCount).toBe(0)
      expect(stats.isLarge).toBe(false)
      expect(stats.isCritical).toBe(false)
    })

    it('returns correct stats for large model', () => {
      const manager = new PreviewManager(container)
      manager.lastVertexCount = 150000
      manager.lastTriangleCount = 50000
      
      const stats = manager.getLODStats()
      
      expect(stats.vertexCount).toBe(150000)
      expect(stats.triangleCount).toBe(50000)
      expect(stats.isLarge).toBe(true)
      expect(stats.isCritical).toBe(false)
    })

    it('returns correct stats for critical model', () => {
      const manager = new PreviewManager(container)
      manager.lastVertexCount = 600000
      manager.lastTriangleCount = 200000
      
      const stats = manager.getLODStats()
      
      expect(stats.vertexCount).toBe(600000)
      expect(stats.triangleCount).toBe(200000)
      expect(stats.isLarge).toBe(true)
      expect(stats.isCritical).toBe(true)
    })
  })

  describe('Clear and Dispose', () => {
    it('clears preview content and disposes resources', () => {
      const manager = new PreviewManager(container)
      const geometryDispose = vi.fn()
      const materialDispose = vi.fn()
      const mapDispose = vi.fn()

      manager.scene = { remove: vi.fn() }
      manager.renderer = { render: vi.fn(), dispose: vi.fn() }
      manager.camera = {}
      manager.mesh = {
        geometry: { dispose: geometryDispose },
        material: { dispose: materialDispose }
      }
      manager.measurementHelpers = {
        traverse: (callback) => {
          callback({ geometry: { dispose: geometryDispose }, material: { dispose: materialDispose, map: { dispose: mapDispose } } })
        }
      }

      manager.clear()

      expect(manager.mesh).toBeNull()
      expect(manager.renderer.render).toHaveBeenCalled()
    })

    it('disposes all resources', () => {
      const manager = new PreviewManager(container)
      const geometryDispose = vi.fn()
      const materialDispose = vi.fn()
      const rendererDispose = vi.fn()

      manager.animationId = 123
      manager.handleResize = vi.fn()
      manager.mesh = {
        geometry: { dispose: geometryDispose },
        material: { dispose: materialDispose }
      }
      manager.renderer = { dispose: rendererDispose }

      // Mock cancelAnimationFrame
      const originalCancelAnimationFrame = window.cancelAnimationFrame
      window.cancelAnimationFrame = vi.fn()

      manager.dispose()

      expect(window.cancelAnimationFrame).toHaveBeenCalledWith(123)
      expect(manager.animationId).toBeNull()
      expect(geometryDispose).toHaveBeenCalled()
      expect(materialDispose).toHaveBeenCalled()
      expect(rendererDispose).toHaveBeenCalled()
      expect(container.innerHTML).toBe('')

      window.cancelAnimationFrame = originalCancelAnimationFrame
    })

    it('handles dispose when resources are null', () => {
      const manager = new PreviewManager(container)
      manager.animationId = null
      manager.handleResize = null
      manager.mesh = null
      manager.renderer = null

      // Should not throw
      expect(() => manager.dispose()).not.toThrow()
    })
  })

  describe('Calculate Dimensions', () => {
    it('returns null when no mesh exists', () => {
      const manager = new PreviewManager(container)
      manager.mesh = null
      
      const dimensions = manager.calculateDimensions()
      
      expect(dimensions).toBeNull()
    })
  })

  describe('Fit Camera to Model', () => {
    it('does nothing when no mesh exists', () => {
      const manager = new PreviewManager(container)
      manager.mesh = null
      manager.camera = { position: { set: vi.fn() } }
      
      // Should not throw
      expect(() => manager.fitCameraToModel()).not.toThrow()
      expect(manager.camera.position.set).not.toHaveBeenCalled()
    })
  })

  describe('Animation Loop', () => {
    it('calls requestAnimationFrame and updates controls', () => {
      const manager = new PreviewManager(container)
      manager.controls = { update: vi.fn() }
      manager.renderer = { render: vi.fn() }
      manager.scene = {}
      manager.camera = {}
      
      const originalRAF = window.requestAnimationFrame
      window.requestAnimationFrame = vi.fn((cb) => 123)
      
      manager.animate()
      
      expect(window.requestAnimationFrame).toHaveBeenCalled()
      expect(manager.animationId).toBe(123)
      
      window.requestAnimationFrame = originalRAF
    })
  })

  describe('Grid Helper Update in Theme', () => {
    it('removes old grid helper when updating theme', () => {
      const manager = new PreviewManager(container)
      
      // Mock Three.js objects
      const mockGridHelper = {
        material: { linewidth: 2 }
      }
      
      manager.scene = {
        background: { setHex: vi.fn() },
        remove: vi.fn(),
        add: vi.fn()
      }
      manager.gridHelper = mockGridHelper
      manager.currentTheme = 'light'
      
      // Since Three.js isn't loaded, updateTheme will fail when trying to create GridHelper
      // We catch the error and verify the scene.remove was called
      try {
        manager.updateTheme('dark', false)
      } catch (e) {
        // Expected - Three.js not loaded
      }
      
      expect(manager.scene.remove).toHaveBeenCalledWith(mockGridHelper)
    })
  })

  describe('Color Override Edge Cases', () => {
    it('handles non-string color values', () => {
      const manager = new PreviewManager(container)
      manager.setColorOverride(123)
      
      expect(manager.colorOverride).toBeNull()
    })

    it('handles whitespace-only color values', () => {
      const manager = new PreviewManager(container)
      manager.setColorOverride('   ')
      
      expect(manager.colorOverride).toBeNull()
    })

    it('handles 3-digit hex colors', () => {
      const manager = new PreviewManager(container)
      manager.mesh = {
        material: {
          color: { setHex: vi.fn() }
        }
      }
      
      // 3-digit hex should be rejected (we only accept 6-digit)
      manager.setColorOverride('#f00')
      
      expect(manager.colorOverride).toBeNull()
    })
  })

  describe('Theme Detection Edge Cases', () => {
    it('falls back to system preference for auto theme', () => {
      document.documentElement.removeAttribute('data-theme')
      document.documentElement.setAttribute('data-high-contrast', 'false')
      
      // Mock matchMedia
      const originalMatchMedia = window.matchMedia
      window.matchMedia = vi.fn().mockReturnValue({ matches: true })
      
      const manager = new PreviewManager(container)
      const theme = manager.detectTheme()
      
      expect(theme).toBe('dark')
      
      window.matchMedia = originalMatchMedia
    })

    it('uses light theme when system prefers light', () => {
      document.documentElement.removeAttribute('data-theme')
      document.documentElement.setAttribute('data-high-contrast', 'false')
      
      const originalMatchMedia = window.matchMedia
      window.matchMedia = vi.fn().mockReturnValue({ matches: false })
      
      const manager = new PreviewManager(container)
      const theme = manager.detectTheme()
      
      expect(theme).toBe('light')
      
      window.matchMedia = originalMatchMedia
    })
  })

  describe('Update Theme with Existing HC Suffix', () => {
    it('does not double-add hc suffix', () => {
      const manager = new PreviewManager(container)
      manager.scene = {
        background: { setHex: vi.fn() },
        remove: vi.fn(),
        add: vi.fn()
      }
      manager.gridHelper = null
      manager.currentTheme = 'light'
      
      manager.updateTheme('dark-hc', true)
      
      expect(manager.currentTheme).toBe('dark-hc')
    })
  })

  describe('Clear with Measurements', () => {
    it('clears measurements when clearing preview', () => {
      const manager = new PreviewManager(container)
      manager.hideMeasurements = vi.fn()
      manager.dimensions = { x: 10, y: 20, z: 30 }
      manager.mesh = {
        geometry: { dispose: vi.fn() },
        material: { dispose: vi.fn() }
      }
      manager.scene = { remove: vi.fn() }
      manager.renderer = { render: vi.fn() }
      manager.camera = {}
      
      manager.clear()
      
      expect(manager.hideMeasurements).toHaveBeenCalled()
      expect(manager.dimensions).toBeNull()
    })
  })

  describe('Resize Behavior', () => {
    it('initializes with resize tracking state', () => {
      const manager = new PreviewManager(container)
      
      expect(manager._lastAspect).toBeNull()
      expect(manager._lastContainerWidth).toBe(0)
      expect(manager._lastContainerHeight).toBe(0)
      expect(manager._resizeDebounceId).toBeNull()
    })

    it('has default resize configuration', () => {
      const manager = new PreviewManager(container)
      
      expect(manager._resizeConfig).toBeDefined()
      expect(manager._resizeConfig.aspectChangeThreshold).toBe(0.15)
      expect(manager._resizeConfig.adjustCameraOnResize).toBe(true)
      expect(manager._resizeConfig.debounceDelay).toBe(100)
    })

    it('allows setting resize configuration', () => {
      const manager = new PreviewManager(container)
      
      manager.setResizeConfig({
        aspectChangeThreshold: 0.25,
        adjustCameraOnResize: false
      })
      
      expect(manager._resizeConfig.aspectChangeThreshold).toBe(0.25)
      expect(manager._resizeConfig.adjustCameraOnResize).toBe(false)
    })

    it('clamps aspectChangeThreshold within valid range', () => {
      const manager = new PreviewManager(container)
      
      manager.setResizeConfig({ aspectChangeThreshold: -0.5 })
      expect(manager._resizeConfig.aspectChangeThreshold).toBe(0.01)
      
      manager.setResizeConfig({ aspectChangeThreshold: 1.0 })
      expect(manager._resizeConfig.aspectChangeThreshold).toBe(0.5)
    })

    it('ignores invalid config values', () => {
      const manager = new PreviewManager(container)
      const originalThreshold = manager._resizeConfig.aspectChangeThreshold
      const originalAdjust = manager._resizeConfig.adjustCameraOnResize
      
      manager.setResizeConfig({
        aspectChangeThreshold: 'invalid',
        adjustCameraOnResize: 'not-boolean'
      })
      
      // Values should remain unchanged for invalid inputs
      expect(manager._resizeConfig.aspectChangeThreshold).toBe(originalThreshold)
      expect(manager._resizeConfig.adjustCameraOnResize).toBe(originalAdjust)
    })

    it('clears resize state on dispose', () => {
      const manager = new PreviewManager(container)
      
      // Set some state
      manager._lastAspect = 1.5
      manager._lastContainerWidth = 800
      manager._lastContainerHeight = 600
      manager._resizeDebounceId = 123
      
      // Mock cancelAnimationFrame
      const originalCAF = window.cancelAnimationFrame
      window.cancelAnimationFrame = vi.fn()
      
      manager.dispose()
      
      expect(manager._lastAspect).toBeNull()
      expect(manager._lastContainerWidth).toBe(0)
      expect(manager._lastContainerHeight).toBe(0)
      
      window.cancelAnimationFrame = originalCAF
    })
  })

  describe('Show Measurements', () => {
    it('does nothing when no mesh exists', () => {
      const manager = new PreviewManager(container)
      manager.mesh = null
      manager.hideMeasurements = vi.fn()
      
      manager.showMeasurements()
      
      // hideMeasurements is called, but nothing else happens
      expect(manager.hideMeasurements).not.toHaveBeenCalled()
    })
  })

  describe('Hide Measurements', () => {
    it('disposes measurement helpers properly', () => {
      const manager = new PreviewManager(container)
      const geometryDispose = vi.fn()
      const materialDispose = vi.fn()
      const mapDispose = vi.fn()
      const sceneRemove = vi.fn()

      manager.scene = { remove: sceneRemove }
      manager.measurementHelpers = {
        traverse: (callback) => {
          callback({ 
            geometry: { dispose: geometryDispose }, 
            material: { dispose: materialDispose, map: { dispose: mapDispose } } 
          })
          callback({ 
            geometry: { dispose: geometryDispose }, 
            material: { dispose: materialDispose } 
          })
        }
      }

      manager.hideMeasurements()

      expect(geometryDispose).toHaveBeenCalledTimes(2)
      expect(materialDispose).toHaveBeenCalledTimes(2)
      expect(mapDispose).toHaveBeenCalledTimes(1)
      expect(sceneRemove).toHaveBeenCalled()
      expect(manager.measurementHelpers).toBeNull()
    })

    it('does nothing when measurementHelpers is null', () => {
      const manager = new PreviewManager(container)
      manager.measurementHelpers = null
      
      // Should not throw
      expect(() => manager.hideMeasurements()).not.toThrow()
    })
  })

  describe('Reference Overlay', () => {
    describe('Overlay Configuration', () => {
      it('initializes with default overlay config', () => {
        const manager = new PreviewManager(container)
        
        expect(manager.overlayConfig).toBeDefined()
        expect(manager.overlayConfig.enabled).toBe(false)
        expect(manager.overlayConfig.opacity).toBe(0.5)
        expect(manager.overlayConfig.offsetX).toBe(0)
        expect(manager.overlayConfig.offsetY).toBe(0)
        expect(manager.overlayConfig.rotationDeg).toBe(0)
        expect(manager.overlayConfig.width).toBe(200)
        expect(manager.overlayConfig.height).toBe(150)
        expect(manager.overlayConfig.zPosition).toBe(-0.25)
        expect(manager.overlayConfig.lockAspect).toBe(true)
        expect(manager.overlayConfig.intrinsicAspect).toBeNull()
        expect(manager.overlayConfig.sourceFileName).toBeNull()
      })

      it('initializes with no overlay mesh or texture', () => {
        const manager = new PreviewManager(container)
        
        expect(manager.referenceOverlay).toBeNull()
        expect(manager.referenceTexture).toBeNull()
      })
    })

    describe('getOverlayConfig', () => {
      it('returns a copy of the overlay config', () => {
        const manager = new PreviewManager(container)
        
        const config = manager.getOverlayConfig()
        
        expect(config).toEqual(manager.overlayConfig)
        
        // Verify it's a copy, not a reference
        config.enabled = true
        expect(manager.overlayConfig.enabled).toBe(false)
      })
    })

    describe('setOverlayEnabled', () => {
      it('updates enabled state in config', () => {
        const manager = new PreviewManager(container)
        
        manager.setOverlayEnabled(true)
        expect(manager.overlayConfig.enabled).toBe(true)
        
        manager.setOverlayEnabled(false)
        expect(manager.overlayConfig.enabled).toBe(false)
      })

      it('hides overlay mesh when disabled', () => {
        const manager = new PreviewManager(container)
        manager.referenceOverlay = { visible: true }
        
        manager.setOverlayEnabled(false)
        
        expect(manager.referenceOverlay.visible).toBe(false)
      })
    })

    describe('setOverlayOpacity', () => {
      it('clamps opacity to valid range', () => {
        const manager = new PreviewManager(container)
        
        manager.setOverlayOpacity(-0.5)
        expect(manager.overlayConfig.opacity).toBe(0)
        
        manager.setOverlayOpacity(1.5)
        expect(manager.overlayConfig.opacity).toBe(1)
        
        manager.setOverlayOpacity(0.7)
        expect(manager.overlayConfig.opacity).toBe(0.7)
      })

      it('updates overlay material opacity', () => {
        const manager = new PreviewManager(container)
        manager.referenceOverlay = {
          material: { opacity: 0.5 }
        }
        
        manager.setOverlayOpacity(0.8)
        
        expect(manager.referenceOverlay.material.opacity).toBe(0.8)
      })
    })

    describe('setOverlayTransform', () => {
      it('updates offset values', () => {
        const manager = new PreviewManager(container)
        
        manager.setOverlayTransform({ offsetX: 10, offsetY: -5 })
        
        expect(manager.overlayConfig.offsetX).toBe(10)
        expect(manager.overlayConfig.offsetY).toBe(-5)
      })

      it('updates rotation value', () => {
        const manager = new PreviewManager(container)
        
        manager.setOverlayTransform({ rotationDeg: 45 })
        
        expect(manager.overlayConfig.rotationDeg).toBe(45)
      })

      it('handles partial updates', () => {
        const manager = new PreviewManager(container)
        manager.overlayConfig.offsetX = 100
        manager.overlayConfig.offsetY = 200
        
        manager.setOverlayTransform({ offsetX: 50 })
        
        expect(manager.overlayConfig.offsetX).toBe(50)
        expect(manager.overlayConfig.offsetY).toBe(200) // unchanged
      })
    })

    describe('setOverlaySize', () => {
      it('updates width and height', () => {
        const manager = new PreviewManager(container)
        
        manager.setOverlaySize({ width: 300, height: 200 })
        
        expect(manager.overlayConfig.width).toBe(300)
        expect(manager.overlayConfig.height).toBe(200)
      })

      it('adjusts height when width changes with aspect lock', () => {
        const manager = new PreviewManager(container)
        manager.overlayConfig.lockAspect = true
        manager.overlayConfig.intrinsicAspect = 2 // 2:1 aspect ratio
        
        manager.setOverlaySize({ width: 400 })
        
        expect(manager.overlayConfig.width).toBe(400)
        expect(manager.overlayConfig.height).toBe(200) // 400 / 2 = 200
      })

      it('adjusts width when height changes with aspect lock', () => {
        const manager = new PreviewManager(container)
        manager.overlayConfig.lockAspect = true
        manager.overlayConfig.intrinsicAspect = 2 // 2:1 aspect ratio
        
        manager.setOverlaySize({ height: 100 })
        
        expect(manager.overlayConfig.height).toBe(100)
        expect(manager.overlayConfig.width).toBe(200) // 100 * 2 = 200
      })

      it('does not adjust when aspect lock is off', () => {
        const manager = new PreviewManager(container)
        manager.overlayConfig.lockAspect = false
        manager.overlayConfig.intrinsicAspect = 2
        manager.overlayConfig.width = 100
        manager.overlayConfig.height = 50
        
        manager.setOverlaySize({ width: 200 })
        
        expect(manager.overlayConfig.width).toBe(200)
        expect(manager.overlayConfig.height).toBe(50) // unchanged
      })
    })

    describe('setOverlayAspectLock', () => {
      it('updates aspect lock state', () => {
        const manager = new PreviewManager(container)
        
        manager.setOverlayAspectLock(false)
        expect(manager.overlayConfig.lockAspect).toBe(false)
        
        manager.setOverlayAspectLock(true)
        expect(manager.overlayConfig.lockAspect).toBe(true)
      })
    })

    describe('removeReferenceOverlay', () => {
      it('removes overlay mesh from scene', () => {
        const manager = new PreviewManager(container)
        const geometryDispose = vi.fn()
        const materialDispose = vi.fn()
        const sceneRemove = vi.fn()
        const textureDispose = vi.fn()
        
        manager.scene = { remove: sceneRemove }
        manager.referenceOverlay = {
          geometry: { dispose: geometryDispose },
          material: { dispose: materialDispose }
        }
        manager.referenceTexture = { dispose: textureDispose }
        
        manager.removeReferenceOverlay()
        
        expect(sceneRemove).toHaveBeenCalled()
        expect(geometryDispose).toHaveBeenCalled()
        expect(materialDispose).toHaveBeenCalled()
        expect(textureDispose).toHaveBeenCalled()
        expect(manager.referenceOverlay).toBeNull()
        expect(manager.referenceTexture).toBeNull()
      })

      it('does nothing when no overlay exists', () => {
        const manager = new PreviewManager(container)
        manager.referenceOverlay = null
        manager.referenceTexture = null
        
        // Should not throw
        expect(() => manager.removeReferenceOverlay()).not.toThrow()
      })
    })

    describe('getMaxTextureResolution', () => {
      it('returns lower resolution for mobile', () => {
        const manager = new PreviewManager(container)
        
        // Mock mobile conditions
        const originalInnerWidth = window.innerWidth
        Object.defineProperty(window, 'innerWidth', { value: 400, writable: true })
        
        const resolution = manager.getMaxTextureResolution()
        
        expect(resolution).toBe(1024)
        
        Object.defineProperty(window, 'innerWidth', { value: originalInnerWidth })
      })

      it('returns higher resolution for desktop', () => {
        const manager = new PreviewManager(container)
        
        // Mock desktop conditions
        const originalInnerWidth = window.innerWidth
        const originalMaxTouchPoints = navigator.maxTouchPoints
        Object.defineProperty(window, 'innerWidth', { value: 1920, writable: true })
        Object.defineProperty(navigator, 'maxTouchPoints', { value: 0, configurable: true })
        
        const resolution = manager.getMaxTextureResolution()
        
        expect(resolution).toBe(2048)
        
        Object.defineProperty(window, 'innerWidth', { value: originalInnerWidth })
        Object.defineProperty(navigator, 'maxTouchPoints', { value: originalMaxTouchPoints, configurable: true })
      })
    })

    describe('loadImage', () => {
      it('returns a promise', () => {
        const manager = new PreviewManager(container)
        
        // In jsdom, images don't actually load, so we just verify the API works
        const promise = manager.loadImage('data:image/png;base64,')
        
        expect(promise).toBeInstanceOf(Promise)
      })

      it('creates an Image element internally', () => {
        const manager = new PreviewManager(container)
        
        // The loadImage method creates an Image and returns a promise
        // We can verify it doesn't throw synchronously
        expect(() => manager.loadImage('test-url')).not.toThrow()
      })
    })

    describe('Clear with Overlay', () => {
      it('preserves overlay but updates Z position on clear', () => {
        const manager = new PreviewManager(container)
        manager.scene = { remove: vi.fn() }
        manager.renderer = { render: vi.fn() }
        manager.camera = {}
        manager.mesh = {
          geometry: { dispose: vi.fn() },
          material: { dispose: vi.fn() }
        }
        manager.referenceOverlay = {
          position: { z: -5 }
        }
        manager.overlayConfig.zPosition = -0.25
        manager.autoBedOffset = 10
        
        manager.clear()
        
        // Overlay should still exist
        expect(manager.referenceOverlay).not.toBeNull()
        // Z position should be reset to config value (not offset)
        expect(manager.referenceOverlay.position.z).toBe(-0.25)
      })
    })

    describe('Dispose with Overlay', () => {
      it('removes overlay on dispose', () => {
        const manager = new PreviewManager(container)
        manager.removeReferenceOverlay = vi.fn()
        manager.renderer = { dispose: vi.fn() }
        
        manager.dispose()
        
        expect(manager.removeReferenceOverlay).toHaveBeenCalled()
      })
    })
  })
})
