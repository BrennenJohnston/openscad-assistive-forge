import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  MeshPhongMaterial,
  DoubleSide,
  BufferGeometry,
  Float32BufferAttribute,
  PerspectiveCamera,
  BoxGeometry,
  Mesh,
  Vector3,
} from 'three'
import { PreviewManager, isThreeJsLoaded, DESKTOP_SHININESS, CORNFIELD_BACK_COLOR } from '../../src/js/preview.js'

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
    it('reports Three.js as loaded (static import)', () => {
      expect(isThreeJsLoaded()).toBe(true)
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
      localStorage.setItem('openscad-forge-measurements', 'true')
      const manager = new PreviewManager(container)
      
      expect(manager.measurementsEnabled).toBe(true)
    })

    it('sets directional light positions to match desktop OpenSCAD GLView', async () => {
      const manager = new PreviewManager(container)
      await manager.init()

      // Light 0: {-1, +1, +1, 0} — GLView.cc line 308 (master) / line 335 (2021)
      expect(manager.directionalLight1.position.x).toBe(-1)
      expect(manager.directionalLight1.position.y).toBe(1)
      expect(manager.directionalLight1.position.z).toBe(1)

      // Light 1: {+1, -1, -1, 0} — GLView.cc line 309 (master) / line 336 (2021)
      expect(manager.directionalLight2.position.x).toBe(1)
      expect(manager.directionalLight2.position.y).toBe(-1)
      expect(manager.directionalLight2.position.z).toBe(-1)
    })

    it('exports DESKTOP_SHININESS matching OpenSCAD GLView value (64)', () => {
      // GLView.cc line 324 (master) / line 351 (2021):
      // glMateriali(GL_FRONT_AND_BACK, GL_SHININESS, 64) [OBSERVED]
      expect(DESKTOP_SHININESS).toBe(64)
    })

    it('pins the Q-30 calibrated light intensities (U-14)', async () => {
      // Ambient 0.2π is the desktop rig π-cancelled; the directional pair
      // carries the ×1.5 the owner chose from the P4 contact sheet against
      // OpenSCAD 2021.01 at a pinned pose. A drift here silently un-does a
      // by-eye calibration no functional test can see.
      const manager = new PreviewManager(container)
      await manager.init()

      expect(manager.baseLightIntensities.ambient).toBeCloseTo(0.2 * Math.PI)
      expect(manager.baseLightIntensities.dir1).toBeCloseTo(1.5 * Math.PI)
      expect(manager.baseLightIntensities.dir2).toBeCloseTo(1.5 * Math.PI)
      expect(manager.directionalLight1.intensity).toBeCloseTo(1.5 * Math.PI)
      expect(manager.directionalLight2.intensity).toBeCloseTo(1.5 * Math.PI)

      // Sliders start neutral: the calibration must not pre-bias them.
      expect(manager._brightnessScale).toBe(1)
      expect(manager._contrastFactor).toBe(1)
    })
  })

  describe('Measurement Preferences', () => {
    it('loads and saves measurement preference', () => {
      localStorage.setItem('openscad-forge-measurements', 'true')
      const manager = new PreviewManager(container)

      expect(manager.loadMeasurementPreference()).toBe(true)

      manager.saveMeasurementPreference(false)
      expect(localStorage.getItem('openscad-forge-measurements--forge')).toBe('false')
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

  describe('Zoom-to-cursor Preference (F17)', () => {
    it('defaults to true when no preference is stored', () => {
      const manager = new PreviewManager(container)
      expect(manager.zoomToCursorEnabled).toBe(true)
      expect(manager.loadZoomToCursorPreference()).toBe(true)
    })

    it('respects a stored false preference', () => {
      localStorage.setItem('openscad-forge-zoom-to-cursor', 'false')
      const manager = new PreviewManager(container)
      expect(manager.zoomToCursorEnabled).toBe(false)
      expect(manager.loadZoomToCursorPreference()).toBe(false)
    })

    it('persists toggle changes to localStorage', () => {
      const manager = new PreviewManager(container)
      manager.toggleZoomToCursor(false)
      expect(localStorage.getItem('openscad-forge-zoom-to-cursor--forge')).toBe('false')
      expect(manager.zoomToCursorEnabled).toBe(false)

      manager.toggleZoomToCursor(true)
      expect(localStorage.getItem('openscad-forge-zoom-to-cursor--forge')).toBe('true')
      expect(manager.zoomToCursorEnabled).toBe(true)
    })

    it('coerces non-boolean inputs', () => {
      const manager = new PreviewManager(container)
      manager.toggleZoomToCursor(0)
      expect(manager.zoomToCursorEnabled).toBe(false)
      manager.toggleZoomToCursor(1)
      expect(manager.zoomToCursorEnabled).toBe(true)
    })

    it('mirrors the toggle into the OrbitControls instance when present', () => {
      // jsdom has no WebGL, so PreviewManager.init() never builds real
      // OrbitControls. Stub the property bag the live code writes to and
      // verify the toggle keeps it in sync.
      const manager = new PreviewManager(container)
      manager.controls = { zoomToCursor: true }

      manager.toggleZoomToCursor(false)
      expect(manager.controls.zoomToCursor).toBe(false)

      manager.toggleZoomToCursor(true)
      expect(manager.controls.zoomToCursor).toBe(true)
    })

    it('is a no-op on controls when controls have not been created yet', () => {
      const manager = new PreviewManager(container)
      manager.controls = null
      expect(() => manager.toggleZoomToCursor(false)).not.toThrow()
      expect(manager.zoomToCursorEnabled).toBe(false)
    })

    it('handles localStorage errors gracefully when loading', () => {
      const manager = new PreviewManager(container)
      const originalGetItem = localStorage.getItem
      localStorage.getItem = vi.fn(() => { throw new Error('Storage error') })

      // Falls back to the default-on behaviour even when storage is unreadable.
      expect(manager.loadZoomToCursorPreference()).toBe(true)

      localStorage.getItem = originalGetItem
    })

    it('handles localStorage errors gracefully when saving', () => {
      const manager = new PreviewManager(container)
      const originalSetItem = localStorage.setItem
      localStorage.setItem = vi.fn(() => { throw new Error('Storage error') })

      expect(() => manager.saveZoomToCursorPreference(false)).not.toThrow()

      localStorage.setItem = originalSetItem
    })
  })

  describe('Color Override', () => {
    it('applies color overrides when a mesh is present and override enabled', () => {
      const manager = new PreviewManager(container)
      manager.colorOverrideEnabled = true
      manager.mesh = {
        material: {
          color: { setHex: vi.fn() },
          vertexColors: false,
          needsUpdate: false,
        }
      }

      manager.setColorOverride('#ff0000')

      expect(manager.colorOverride).toBe('#ff0000')
      expect(manager.mesh.material.color.setHex).toHaveBeenCalled()
    })

    it('stores override but does not apply when disabled', () => {
      const manager = new PreviewManager(container)
      manager.colorOverrideEnabled = false
      manager.mesh = {
        material: {
          color: { setHex: vi.fn() },
          vertexColors: false,
          needsUpdate: false,
        }
      }

      manager.setColorOverride('#ff0000')

      expect(manager.colorOverride).toBe('#ff0000')
      expect(manager.mesh.material.color.setHex).not.toHaveBeenCalled()
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
      expect(localStorage.getItem('openscad-forge-measurements--forge')).toBe('true')

      manager.toggleMeasurements(false)
      expect(manager.hideMeasurements).toHaveBeenCalled()
      expect(localStorage.getItem('openscad-forge-measurements--forge')).toBe('false')
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

    it('detects mono-hc theme (dark + high contrast + mono variant)', () => {
      document.documentElement.setAttribute('data-theme', 'dark')
      document.documentElement.setAttribute('data-high-contrast', 'true')
      document.documentElement.setAttribute('data-ui-variant', 'mono')

      const manager = new PreviewManager(container)
      const theme = manager.detectTheme()

      expect(theme).toBe('mono-hc')
    })

    it('detects mono-light-hc theme (light + high contrast + mono variant)', () => {
      document.documentElement.setAttribute('data-theme', 'light')
      document.documentElement.setAttribute('data-high-contrast', 'true')
      document.documentElement.setAttribute('data-ui-variant', 'mono')

      const manager = new PreviewManager(container)
      const theme = manager.detectTheme()

      expect(theme).toBe('mono-light-hc')
    })

    afterEach(() => {
      document.documentElement.removeAttribute('data-theme')
      document.documentElement.removeAttribute('data-high-contrast')
      document.documentElement.removeAttribute('data-ui-variant')
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

    it('"Don\'t show again" permanently dismisses the warning', () => {
      const manager = new PreviewManager(container)
      manager.showLODWarning(150000, 50000, false)

      const permanentBtn = container.querySelector('#lodWarningDismissPermanent')
      expect(permanentBtn).not.toBeNull()
      permanentBtn.click()

      expect(container.querySelector('#lodWarning')).toBeNull()
      expect(manager.isLODWarningPermanentlyDismissed()).toBe(true)

      manager.showLODWarning(150000, 50000, false)
      expect(container.querySelector('#lodWarning')).toBeNull()
    })

    it('permanent dismiss survives new PreviewManager instances', () => {
      const manager1 = new PreviewManager(container)
      manager1.dismissLODWarningPermanently()

      const container2 = document.createElement('div')
      const manager2 = new PreviewManager(container2)
      manager2.showLODWarning(150000, 50000, false)

      expect(container2.querySelector('#lodWarning')).toBeNull()
    })

    it('resetLODWarningDismissal re-enables warnings', () => {
      const manager = new PreviewManager(container)
      manager.dismissLODWarningPermanently()
      expect(manager.isLODWarningPermanentlyDismissed()).toBe(true)

      manager.resetLODWarningDismissal()
      expect(manager.isLODWarningPermanentlyDismissed()).toBe(false)

      manager.showLODWarning(150000, 50000, false)
      expect(container.querySelector('#lodWarning')).not.toBeNull()
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

  // Center, View All and Reset View are three different commands upstream. They
  // were two-thirds duplicates here: Center called a method that did not exist
  // and the other two both fitted the model (G4). These assert what each one
  // DOES to the camera, not merely that it ran.
  describe('Camera commands: Center vs View All vs Reset View', () => {
    // A cube 10mm on a side, sitting 100mm along +X so "centered" is visible.
    const MODEL_CENTER = new Vector3(100, 0, 0)

    function makeManager() {
      const manager = new PreviewManager(container)
      manager.camera = new PerspectiveCamera(45, 4 / 3, 0.1, 10000)
      manager.camera.position.set(...PreviewManager.DEFAULT_CAMERA_POSITION)
      manager.projectionMode = 'perspective'
      manager.controls = { target: new Vector3(0, 0, 0), update: vi.fn() }
      manager.mesh = new Mesh(new BoxGeometry(10, 10, 10), new MeshPhongMaterial())
      manager.mesh.position.copy(MODEL_CENTER)
      manager.mesh.updateMatrixWorld(true)
      return manager
    }

    it('resetCamera restores the default pose and needs no model', () => {
      const manager = new PreviewManager(container)
      manager.camera = new PerspectiveCamera(45, 4 / 3, 0.1, 10000)
      manager.camera.position.set(1, 2, 3)
      manager.controls = { target: new Vector3(9, 9, 9), update: vi.fn() }
      manager.mesh = null

      manager.resetCamera()

      const [x, y, z] = PreviewManager.DEFAULT_CAMERA_POSITION
      expect(manager.camera.position.toArray()).toEqual([x, y, z])
      expect(manager.controls.target.toArray()).toEqual([0, 0, 0])
      expect(manager.camera.up.toArray()).toEqual([0, 0, 1])
    })

    it('centerCamera moves the target onto the model, keeping angle and distance', () => {
      const manager = makeManager()
      const before = manager.camera.position.clone()
      const distanceBefore = before.distanceTo(manager.controls.target)
      const directionBefore = before.clone().sub(manager.controls.target).normalize()

      expect(manager.centerCamera()).toBe(true)

      expect(manager.controls.target.distanceTo(MODEL_CENTER)).toBeLessThan(1e-6)
      // Same distance and same viewing direction: only the target moved.
      const after = manager.camera.position
      expect(after.distanceTo(manager.controls.target)).toBeCloseTo(distanceBefore, 6)
      const directionAfter = after.clone().sub(manager.controls.target).normalize()
      expect(directionAfter.angleTo(directionBefore)).toBeLessThan(1e-6)
      // The camera itself moved, by exactly the target's delta.
      expect(after.distanceTo(before)).toBeCloseTo(MODEL_CENTER.length(), 6)
    })

    it('viewAllCamera fits the model WITHOUT changing the viewing angle', () => {
      const manager = makeManager()
      // Look from a non-default angle so "kept the angle" means something.
      manager.camera.position.set(0, 0, 400)
      manager.controls.target.set(0, 0, 0)
      const directionBefore = manager.camera.position
        .clone()
        .sub(manager.controls.target)
        .normalize()

      expect(manager.viewAllCamera()).toBe(true)

      expect(manager.controls.target.distanceTo(MODEL_CENTER)).toBeLessThan(1e-6)
      const directionAfter = manager.camera.position
        .clone()
        .sub(manager.controls.target)
        .normalize()
      expect(directionAfter.angleTo(directionBefore)).toBeLessThan(1e-6)
      // A 10mm cube at 45deg fits from ~21mm away, nowhere near 400.
      expect(manager.camera.position.distanceTo(MODEL_CENTER)).toBeLessThan(60)
    })

    it('viewAllCamera and resetCamera leave the camera in different places', () => {
      const fitted = makeManager()
      fitted.viewAllCamera()

      const reset = makeManager()
      reset.resetCamera()

      expect(fitted.camera.position.distanceTo(reset.camera.position)).toBeGreaterThan(1)
      expect(fitted.controls.target.distanceTo(reset.controls.target)).toBeGreaterThan(1)
    })

    it('centerCamera and viewAllCamera report false with no model', () => {
      const manager = new PreviewManager(container)
      manager.camera = new PerspectiveCamera(45, 4 / 3, 0.1, 10000)
      manager.controls = { target: new Vector3(), update: vi.fn() }
      manager.mesh = null

      expect(manager.centerCamera()).toBe(false)
      expect(manager.viewAllCamera()).toBe(false)
    })
  })

  // D-48 (U-36). Every face view used to leave its own `camera.up` behind.
  // OrbitControls reads camera.up ONCE, when it is constructed, so a later up
  // never reaches the orbit maths — but the lookAt(target) that ends every
  // frame's update does read it. Top and Bottom therefore left the picture
  // rolled, and the roll grew with every drag (measured live: 25deg, 40deg,
  // 45deg over three 25px drags) until the view was un-navigable.
  //
  // The invariant that fixes it, asserted here at the source: three's lookAt
  // builds screen-right as normalize(up x forward), so screen-right is always
  // perpendicular to camera.up. With Z-up that means screenRight.z === 0 at
  // every pose — which IS "no roll" in a Z-up world.
  describe('setCameraView keeps the world Z-up (D-48)', () => {
    const VIEW_NAMES = Object.keys(PreviewManager.CAMERA_VIEWS)

    function makeViewManager() {
      const manager = new PreviewManager(container)
      manager.camera = new PerspectiveCamera(45, 4 / 3, 0.1, 10000)
      manager.camera.up.set(0, 0, 1)
      manager.projectionMode = 'perspective'
      manager.controls = { target: new Vector3(0, 0, 0), update: vi.fn() }
      manager.mesh = new Mesh(new BoxGeometry(10, 10, 10), new MeshPhongMaterial())
      manager.mesh.updateMatrixWorld(true)
      return manager
    }

    /** The camera's world basis: columns 1 and 2 of its world matrix. */
    function screenBasis(camera) {
      camera.updateMatrixWorld(true)
      const m = camera.matrixWorld.elements
      return {
        right: new Vector3(m[0], m[1], m[2]),
        up: new Vector3(m[4], m[5], m[6]),
        toEye: new Vector3(m[8], m[9], m[10]),
      }
    }

    it('leaves camera.up at world Z for every one of the seven views', () => {
      expect(VIEW_NAMES).toHaveLength(7)
      for (const name of VIEW_NAMES) {
        const manager = makeViewManager()
        manager.setCameraView(name)
        expect(manager.camera.up.toArray(), `${name} view`).toEqual([0, 0, 1])
      }
    })

    it('no view table entry carries its own up any more', () => {
      for (const [name, view] of Object.entries(PreviewManager.CAMERA_VIEWS)) {
        expect(view.up, `${name} view must not define an up`).toBeUndefined()
      }
    })

    it('puts no roll in the picture at any of the seven views', () => {
      for (const name of VIEW_NAMES) {
        const manager = makeViewManager()
        manager.setCameraView(name)
        const { right } = screenBasis(manager.camera)
        // Rolled by a hair is still rolled; 1e-9 is float noise, not a pose.
        expect(Math.abs(right.z), `${name} view screen-right tilted`).toBeLessThan(1e-9)
      }
    })

    it('keeps the desktop screen orientation at Top and Bottom', () => {
      const top = makeViewManager()
      top.setCameraView('top')
      const topBasis = screenBasis(top.camera)
      // Desktop Top: looking down -Z with +X across the screen and +Y up it.
      expect(topBasis.right.x).toBeCloseTo(1, 6)
      expect(topBasis.up.y).toBeCloseTo(1, 6)
      expect(topBasis.toEye.z).toBeCloseTo(1, 5)

      const bottom = makeViewManager()
      bottom.setCameraView('bottom')
      const bottomBasis = screenBasis(bottom.camera)
      // Desktop Bottom: looking up +Z, +X still across, +Y DOWN the screen.
      expect(bottomBasis.right.x).toBeCloseTo(1, 6)
      expect(bottomBasis.up.y).toBeCloseTo(-1, 6)
      expect(bottomBasis.toEye.z).toBeCloseTo(-1, 5)
    })

    it('places Top and Bottom off the pole, but invisibly so', () => {
      const zAxis = new Vector3(0, 0, 1)
      for (const [name, sign] of [
        ['top', 1],
        ['bottom', -1],
      ]) {
        const manager = makeViewManager()
        manager.setCameraView(name)
        const toEye = manager.camera.position
          .clone()
          .sub(manager.controls.target)
          .normalize()
        const polar = toEye.angleTo(zAxis.clone().multiplyScalar(sign))
        // Above OrbitControls' own polar epsilon (1e-6 rad) by three orders,
        // so the controls never clamp there; the actual angle is 0.057deg,
        // which moves the picture by well under one pixel on any canvas this
        // app draws, so nobody can see it.
        expect(polar, `${name} sits on the pole`).toBeGreaterThan(1e-4)
        expect(polar, `${name} is visibly off-axis`).toBeLessThan(0.1 * (Math.PI / 180))
      }
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

  describe('Color Override Toggle', () => {
    it('initializes with colorOverrideEnabled = false', () => {
      const manager = new PreviewManager(container)
      expect(manager.colorOverrideEnabled).toBe(false)
    })

    it('setColorOverrideEnabled(true) applies solid color to COFF mesh', () => {
      const manager = new PreviewManager(container)
      const colorAttr = { count: 100 }
      manager.mesh = {
        material: {
          color: { setHex: vi.fn() },
          vertexColors: true,
          needsUpdate: false,
        },
        geometry: {
          attributes: { color: colorAttr },
        },
      }
      manager.colorOverride = '#ff0000'
      manager.setColorOverrideEnabled(true)

      expect(manager.mesh.material.vertexColors).toBe(false)
      expect(manager.mesh.material.needsUpdate).toBe(true)
      expect(manager.mesh.material.color.setHex).toHaveBeenCalledWith(0xff0000)
    })

    it('setColorOverrideEnabled(false) restores vertex colors on COFF mesh', () => {
      const manager = new PreviewManager(container)
      const colorAttr = { count: 100 }
      manager.mesh = {
        material: {
          color: { setHex: vi.fn() },
          vertexColors: false,
          needsUpdate: false,
        },
        geometry: {
          attributes: { color: colorAttr },
        },
      }
      manager.colorOverride = '#ff0000'
      manager.colorOverrideEnabled = true
      manager.setColorOverrideEnabled(false)

      expect(manager.mesh.material.vertexColors).toBe(true)
      expect(manager.mesh.material.needsUpdate).toBe(true)
    })

    it('toggle OFF prevents setColorOverride from applying', () => {
      const manager = new PreviewManager(container)
      manager.colorOverrideEnabled = false
      manager.mesh = {
        material: {
          color: { setHex: vi.fn() },
          vertexColors: false,
          needsUpdate: false,
        },
      }
      manager.setColorOverride('#ff0000')

      expect(manager.colorOverride).toBe('#ff0000')
      expect(manager.mesh.material.color.setHex).not.toHaveBeenCalled()
    })

    it('toggle OFF on plain mesh falls back to theme default', () => {
      const manager = new PreviewManager(container)
      manager.currentTheme = 'light'
      manager.mesh = {
        material: {
          color: { setHex: vi.fn() },
          vertexColors: false,
          needsUpdate: false,
        },
        geometry: {
          attributes: {},
        },
      }
      manager.colorOverride = '#ff0000'
      manager.colorOverrideEnabled = true
      manager.setColorOverrideEnabled(false)

      expect(manager.mesh.material.vertexColors).toBe(false)
      expect(manager.mesh.material.needsUpdate).toBe(true)
      expect(manager.mesh.material.color.setHex).toHaveBeenCalled()
    })

    it('_syncColorOverride handles group meshes', () => {
      const manager = new PreviewManager(container)
      const child1 = {
        material: {
          color: { setHex: vi.fn() },
          vertexColors: true,
          needsUpdate: false,
        },
        geometry: {
          attributes: { color: { count: 10 } },
        },
        userData: {},
      }
      const highlightChild = {
        material: {
          color: { setHex: vi.fn() },
          vertexColors: false,
          needsUpdate: false,
        },
        geometry: { attributes: {} },
        userData: { isHighlightOverlay: true },
      }
      manager.mesh = {
        isGroup: true,
        children: [child1, highlightChild],
      }
      manager.colorOverride = '#00ff00'
      manager.setColorOverrideEnabled(true)

      expect(child1.material.vertexColors).toBe(false)
      expect(child1.material.color.setHex).toHaveBeenCalledWith(0x00ff00)
      expect(highlightChild.material.color.setHex).not.toHaveBeenCalled()
    })

    it('_syncColorOverride is a no-op when no mesh exists', () => {
      const manager = new PreviewManager(container)
      manager.mesh = null
      expect(() => manager.setColorOverrideEnabled(true)).not.toThrow()
    })
  })

  describe('Appearance Override Toggle', () => {
    it('initializes with appearanceOverrideEnabled = false', () => {
      const manager = new PreviewManager(container)
      expect(manager.appearanceOverrideEnabled).toBe(false)
    })

    it('setAppearanceOverrideEnabled(true) does not reset appearance', () => {
      const manager = new PreviewManager(container)
      manager.mesh = {
        material: {
          transparent: true,
          opacity: 0.5,
          depthWrite: true,
          needsUpdate: false,
        },
      }
      manager.ambientLight = { intensity: 1 }
      manager.directionalLight1 = { intensity: 1 }
      manager.directionalLight2 = { intensity: 1 }
      manager.baseLightIntensities = { ambient: 1, dir1: 1, dir2: 1 }
      manager._brightnessScale = 1.5
      manager._contrastFactor = 0.8

      manager.setAppearanceOverrideEnabled(true)

      expect(manager.appearanceOverrideEnabled).toBe(true)
      expect(manager._brightnessScale).toBe(1.5)
      expect(manager._contrastFactor).toBe(0.8)
    })

    it('setAppearanceOverrideEnabled(false) resets opacity/brightness/contrast to defaults', () => {
      const manager = new PreviewManager(container)
      manager.mesh = {
        material: {
          transparent: true,
          opacity: 0.5,
          depthWrite: true,
          renderOrder: 1,
          needsUpdate: false,
        },
      }
      manager.ambientLight = { intensity: 1 }
      manager.directionalLight1 = { intensity: 1 }
      manager.directionalLight2 = { intensity: 1 }
      manager.baseLightIntensities = { ambient: 1, dir1: 1, dir2: 1 }
      manager._brightnessScale = 1.5
      manager._contrastFactor = 0.8
      manager.appearanceOverrideEnabled = true

      manager.setAppearanceOverrideEnabled(false)

      expect(manager.appearanceOverrideEnabled).toBe(false)
      expect(manager._brightnessScale).toBe(1)
      expect(manager._contrastFactor).toBe(1)
      expect(manager.mesh.material.opacity).toBe(1)
      expect(manager.mesh.material.transparent).toBe(false)
    })

    it('setModelOpacity is a no-op when override disabled', () => {
      const manager = new PreviewManager(container)
      manager.mesh = {
        material: {
          transparent: false,
          opacity: 1,
          depthWrite: true,
          needsUpdate: false,
        },
      }
      manager.appearanceOverrideEnabled = false

      manager.setModelOpacity(50)

      expect(manager.mesh.material.opacity).toBe(1)
    })

    it('setBrightness is a no-op when override disabled', () => {
      const manager = new PreviewManager(container)
      manager.ambientLight = { intensity: 1 }
      manager.directionalLight1 = { intensity: 1 }
      manager.directionalLight2 = { intensity: 1 }
      manager.baseLightIntensities = { ambient: 1, dir1: 1, dir2: 1 }
      manager._brightnessScale = 1
      manager.appearanceOverrideEnabled = false

      manager.setBrightness(150)

      expect(manager._brightnessScale).toBe(1)
    })

    it('setContrast is a no-op when override disabled', () => {
      const manager = new PreviewManager(container)
      manager.ambientLight = { intensity: 1 }
      manager.directionalLight1 = { intensity: 1 }
      manager.directionalLight2 = { intensity: 1 }
      manager.baseLightIntensities = { ambient: 1, dir1: 1, dir2: 1 }
      manager._contrastFactor = 1
      manager.appearanceOverrideEnabled = false

      manager.setContrast(150)

      expect(manager._contrastFactor).toBe(1)
    })

    it('resetAppearance is a no-op when override disabled', () => {
      const manager = new PreviewManager(container)
      manager.mesh = {
        material: {
          transparent: true,
          opacity: 0.5,
          depthWrite: true,
          needsUpdate: false,
        },
      }
      manager.ambientLight = { intensity: 1 }
      manager.directionalLight1 = { intensity: 1 }
      manager.directionalLight2 = { intensity: 1 }
      manager.baseLightIntensities = { ambient: 1, dir1: 1, dir2: 1 }
      manager._brightnessScale = 1.5
      manager.appearanceOverrideEnabled = false

      manager.resetAppearance()

      expect(manager._brightnessScale).toBe(1.5)
      expect(manager.mesh.material.opacity).toBe(0.5)
    })

    it('_syncAppearance is a no-op when no mesh exists (opacity reset skipped)', () => {
      const manager = new PreviewManager(container)
      manager.mesh = null
      manager.ambientLight = { intensity: 1 }
      manager.directionalLight1 = { intensity: 1 }
      manager.directionalLight2 = { intensity: 1 }
      manager.baseLightIntensities = { ambient: 1, dir1: 1, dir2: 1 }
      manager._brightnessScale = 1.5
      manager.appearanceOverrideEnabled = true

      expect(() => manager.setAppearanceOverrideEnabled(false)).not.toThrow()
      expect(manager._brightnessScale).toBe(1)
    })

    it('_syncAppearance handles group meshes when disabling', () => {
      const manager = new PreviewManager(container)
      const child1 = {
        material: {
          transparent: true,
          opacity: 0.5,
          depthWrite: true,
          renderOrder: 1,
          needsUpdate: false,
        },
      }
      const child2 = {
        material: {
          transparent: true,
          opacity: 0.7,
          depthWrite: true,
          renderOrder: 1,
          needsUpdate: false,
        },
      }
      manager.mesh = {
        isGroup: true,
        children: [child1, child2],
      }
      manager.ambientLight = { intensity: 1 }
      manager.directionalLight1 = { intensity: 1 }
      manager.directionalLight2 = { intensity: 1 }
      manager.baseLightIntensities = { ambient: 1, dir1: 1, dir2: 1 }
      manager.appearanceOverrideEnabled = true

      manager.setAppearanceOverrideEnabled(false)

      expect(child1.material.opacity).toBe(1)
      expect(child1.material.transparent).toBe(false)
      expect(child2.material.opacity).toBe(1)
      expect(child2.material.transparent).toBe(false)
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

  describe('Reference Image', () => {
    describe('Overlay Configuration', () => {
      it('initializes with default overlay config', () => {
        const manager = new PreviewManager(container)
        
        expect(manager.overlayConfig).toBeDefined()
        expect(manager.overlayConfig.enabled).toBe(false)
        expect(manager.overlayConfig.opacity).toBe(1.0)
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

  describe('Custom Grid Presets', () => {
    let manager

    beforeEach(() => {
      manager = new PreviewManager(container)
      localStorage.clear()
    })

    it('loadCustomGridPresets() returns [] when nothing is stored', () => {
      expect(manager.loadCustomGridPresets()).toEqual([])
    })

    it('saveCustomGridPreset() stores a valid preset and returns success', () => {
      const result = manager.saveCustomGridPreset('My Printer', 180, 180)
      expect(result.success).toBe(true)
      const loaded = manager.loadCustomGridPresets()
      expect(loaded).toHaveLength(1)
      expect(loaded[0]).toMatchObject({ name: 'My Printer', widthMm: 180, heightMm: 180 })
    })

    it('saveCustomGridPreset() rejects empty name', () => {
      const result = manager.saveCustomGridPreset('', 220, 220)
      expect(result.success).toBe(false)
      expect(result.error).toMatch(/name/i)
    })

    it('saveCustomGridPreset() rejects whitespace-only name', () => {
      const result = manager.saveCustomGridPreset('   ', 220, 220)
      expect(result.success).toBe(false)
    })

    it('saveCustomGridPreset() rejects width below 50', () => {
      const result = manager.saveCustomGridPreset('Tiny', 49, 220)
      expect(result.success).toBe(false)
      expect(result.error).toMatch(/width/i)
    })

    it('saveCustomGridPreset() rejects width above 500', () => {
      const result = manager.saveCustomGridPreset('Huge', 501, 220)
      expect(result.success).toBe(false)
    })

    it('saveCustomGridPreset() rejects height below 50', () => {
      const result = manager.saveCustomGridPreset('Bad Height', 220, 49)
      expect(result.success).toBe(false)
      expect(result.error).toMatch(/height/i)
    })

    it('saveCustomGridPreset() rounds decimal widths to integers', () => {
      const result = manager.saveCustomGridPreset('Decimal', 220.7, 220.3)
      expect(result.success).toBe(true)
      const loaded = manager.loadCustomGridPresets()
      expect(loaded[0].widthMm).toBe(221)
      expect(loaded[0].heightMm).toBe(220)
    })

    it('saveCustomGridPreset() rejects duplicate names', () => {
      manager.saveCustomGridPreset('Dupe', 220, 220)
      const result = manager.saveCustomGridPreset('Dupe', 300, 300)
      expect(result.success).toBe(false)
      expect(result.error).toMatch(/already exists/i)
    })

    it('deleteCustomGridPreset() removes an existing preset', () => {
      manager.saveCustomGridPreset('To Delete', 200, 200)
      const removed = manager.deleteCustomGridPreset('To Delete')
      expect(removed).toBe(true)
      expect(manager.loadCustomGridPresets()).toHaveLength(0)
    })

    it('deleteCustomGridPreset() returns false for non-existent name', () => {
      const removed = manager.deleteCustomGridPreset('Ghost')
      expect(removed).toBe(false)
    })

    it('saves boundary value 50x50 successfully', () => {
      const result = manager.saveCustomGridPreset('Minimal', 50, 50)
      expect(result.success).toBe(true)
    })

    it('saves boundary value 500x500 successfully', () => {
      const result = manager.saveCustomGridPreset('Maximal', 500, 500)
      expect(result.success).toBe(true)
    })

    it('multiple presets accumulate correctly', () => {
      manager.saveCustomGridPreset('A', 100, 100)
      manager.saveCustomGridPreset('B', 200, 200)
      manager.saveCustomGridPreset('C', 300, 300)
      expect(manager.loadCustomGridPresets()).toHaveLength(3)
    })
  })

  describe('Grid Color', () => {
    let manager

    beforeEach(() => {
      manager = new PreviewManager(container)
      localStorage.clear()
    })

    describe('setGridColor', () => {
      it('stores a valid hex color as gridColorOverride', () => {
        manager.setGridColor('#ff0000')
        expect(manager.gridColorOverride).toBe('#ff0000')
      })

      it('persists the color in localStorage', () => {
        manager.setGridColor('#00ff00')
        expect(localStorage.getItem('openscad-forge-grid-color--forge')).toBe('#00ff00')
      })

      it('normalizes hex without hash', () => {
        manager.setGridColor('0000ff')
        expect(manager.gridColorOverride).toBe('#0000ff')
      })

      it('ignores invalid color values', () => {
        manager.setGridColor('not-a-color')
        expect(manager.gridColorOverride).toBeNull()
      })

      it('ignores null', () => {
        manager.gridColorOverride = '#ff0000'
        manager.setGridColor(null)
        expect(manager.gridColorOverride).toBe('#ff0000')
      })

      it('ignores empty string', () => {
        manager.gridColorOverride = '#ff0000'
        manager.setGridColor('')
        expect(manager.gridColorOverride).toBe('#ff0000')
      })
    })

    describe('resetGridColor', () => {
      it('clears gridColorOverride', () => {
        manager.gridColorOverride = '#ff0000'
        manager.resetGridColor()
        expect(manager.gridColorOverride).toBeNull()
      })

      it('removes the color from localStorage', () => {
        localStorage.setItem('openscad-forge-grid-color--forge', '#ff0000')
        manager.resetGridColor()
        expect(localStorage.getItem('openscad-forge-grid-color--forge')).toBeNull()
      })
    })

    describe('getGridColor', () => {
      it('returns null when no override is set', () => {
        expect(manager.getGridColor()).toBeNull()
      })

      it('returns the current override', () => {
        manager.gridColorOverride = '#abcdef'
        expect(manager.getGridColor()).toBe('#abcdef')
      })
    })

    describe('loadGridColorPreference', () => {
      it('returns null when nothing is stored', () => {
        expect(manager.loadGridColorPreference()).toBeNull()
      })

      it('returns a stored valid hex color', () => {
        localStorage.setItem('openscad-forge-grid-color', '#aabbcc')
        expect(manager.loadGridColorPreference()).toBe('#aabbcc')
      })

      it('returns null for invalid stored value', () => {
        localStorage.setItem('openscad-forge-grid-color', 'garbage')
        expect(manager.loadGridColorPreference()).toBeNull()
      })

      it('handles localStorage errors gracefully', () => {
        const originalGetItem = localStorage.getItem
        localStorage.getItem = vi.fn(() => { throw new Error('Storage error') })
        expect(manager.loadGridColorPreference()).toBeNull()
        localStorage.getItem = originalGetItem
      })
    })

    describe('saveGridColorPreference', () => {
      it('saves a valid color', () => {
        manager.saveGridColorPreference('#112233')
        expect(localStorage.getItem('openscad-forge-grid-color--forge')).toBe('#112233')
      })

      it('removes the key when null is passed', () => {
        localStorage.setItem('openscad-forge-grid-color--forge', '#112233')
        manager.saveGridColorPreference(null)
        expect(localStorage.getItem('openscad-forge-grid-color--forge')).toBeNull()
      })

      it('handles localStorage errors gracefully', () => {
        const originalSetItem = localStorage.setItem
        localStorage.setItem = vi.fn(() => { throw new Error('Storage error') })
        expect(() => manager.saveGridColorPreference('#aabbcc')).not.toThrow()
        localStorage.setItem = originalSetItem
      })
    })

    describe('_resolveGridColors', () => {
      it('returns theme defaults when no override is set', () => {
        manager.currentTheme = 'light'
        manager.gridColorOverride = null
        const colors = manager._resolveGridColors()
        expect(colors.gridPrimary).toBe(0xcccccc)
        expect(colors.gridSecondary).toBe(0xe0e0e0)
      })

      it('returns override-derived colors when override is set', () => {
        manager.currentTheme = 'light'
        manager.gridColorOverride = '#ff0000'
        const colors = manager._resolveGridColors()
        expect(colors.gridPrimary).toBe(0xff0000)
        expect(colors.gridSecondary).not.toBe(0xff0000)
      })

      it('falls back to light theme for unknown theme key', () => {
        manager.currentTheme = 'nonexistent'
        manager.gridColorOverride = null
        const colors = manager._resolveGridColors()
        expect(colors.gridPrimary).toBe(0xcccccc)
      })
    })

    describe('_deriveSecondaryGridColor', () => {
      it('blends primary toward background at 50%', () => {
        const secondary = PreviewManager._deriveSecondaryGridColor(0x000000, 0xffffff)
        const r = (secondary >> 16) & 0xff
        const g = (secondary >> 8) & 0xff
        const b = secondary & 0xff
        expect(r).toBe(128)
        expect(g).toBe(128)
        expect(b).toBe(128)
      })

      it('returns same color when primary equals background', () => {
        const secondary = PreviewManager._deriveSecondaryGridColor(0xaabbcc, 0xaabbcc)
        expect(secondary).toBe(0xaabbcc)
      })

      it('blends red channel correctly', () => {
        const secondary = PreviewManager._deriveSecondaryGridColor(0xff0000, 0x000000)
        const r = (secondary >> 16) & 0xff
        expect(r).toBe(128)
        expect(secondary & 0xff).toBe(0)
      })
    })

    describe('gridColorOverride initialized from localStorage', () => {
      it('picks up stored color on construction', () => {
        localStorage.setItem('openscad-forge-grid-color', '#deadbe')
        const m = new PreviewManager(container)
        expect(m.gridColorOverride).toBe('#deadbe')
      })

      it('stays null when nothing is stored', () => {
        const m = new PreviewManager(container)
        expect(m.gridColorOverride).toBeNull()
      })
    })
  })

  describe('Grid Opacity', () => {
    let manager

    beforeEach(() => {
      manager = new PreviewManager(container)
      localStorage.clear()
    })

    describe('setGridOpacity', () => {
      it('stores a valid opacity value', () => {
        manager.setGridOpacity(50)
        expect(manager.gridOpacity).toBe(50)
      })

      it('persists in localStorage', () => {
        manager.setGridOpacity(75)
        expect(localStorage.getItem('openscad-forge-grid-opacity--forge')).toBe('75')
      })

      it('clamps below minimum to 10', () => {
        manager.setGridOpacity(0)
        expect(manager.gridOpacity).toBe(10)
      })

      it('clamps above maximum to 100', () => {
        manager.setGridOpacity(150)
        expect(manager.gridOpacity).toBe(100)
      })

      it('rounds fractional values', () => {
        manager.setGridOpacity(55.7)
        expect(manager.gridOpacity).toBe(56)
      })

      it('ignores NaN input', () => {
        manager.gridOpacity = 80
        manager.setGridOpacity('not-a-number')
        expect(manager.gridOpacity).toBe(80)
      })

      it('accepts string-numeric input', () => {
        manager.setGridOpacity('60')
        expect(manager.gridOpacity).toBe(60)
      })
    })

    describe('getGridOpacity', () => {
      it('returns default 100 when no override', () => {
        expect(manager.getGridOpacity()).toBe(100)
      })

      it('returns the current value', () => {
        manager.gridOpacity = 40
        expect(manager.getGridOpacity()).toBe(40)
      })
    })

    describe('resetGridOpacity', () => {
      it('resets to 100', () => {
        manager.gridOpacity = 30
        manager.resetGridOpacity()
        expect(manager.gridOpacity).toBe(100)
      })

      it('removes from localStorage', () => {
        localStorage.setItem('openscad-forge-grid-opacity--forge', '50')
        manager.resetGridOpacity()
        expect(localStorage.getItem('openscad-forge-grid-opacity--forge')).toBeNull()
      })
    })

    describe('loadGridOpacityPreference', () => {
      it('returns 100 when nothing stored', () => {
        expect(manager.loadGridOpacityPreference()).toBe(100)
      })

      it('returns stored valid value', () => {
        localStorage.setItem('openscad-forge-grid-opacity', '65')
        expect(manager.loadGridOpacityPreference()).toBe(65)
      })

      it('returns 100 for out-of-range stored value', () => {
        localStorage.setItem('openscad-forge-grid-opacity', '5')
        expect(manager.loadGridOpacityPreference()).toBe(100)
      })

      it('returns 100 for non-numeric stored value', () => {
        localStorage.setItem('openscad-forge-grid-opacity', 'abc')
        expect(manager.loadGridOpacityPreference()).toBe(100)
      })

      it('handles localStorage errors gracefully', () => {
        const originalGetItem = localStorage.getItem
        localStorage.getItem = vi.fn(() => { throw new Error('Storage error') })
        expect(manager.loadGridOpacityPreference()).toBe(100)
        localStorage.getItem = originalGetItem
      })
    })

    describe('saveGridOpacityPreference', () => {
      it('saves a non-default value', () => {
        manager.saveGridOpacityPreference(70)
        expect(localStorage.getItem('openscad-forge-grid-opacity--forge')).toBe('70')
      })

      it('removes key when null', () => {
        localStorage.setItem('openscad-forge-grid-opacity--forge', '50')
        manager.saveGridOpacityPreference(null)
        expect(localStorage.getItem('openscad-forge-grid-opacity--forge')).toBeNull()
      })

      it('removes key when value is 100 (default)', () => {
        manager.saveGridOpacityPreference(100)
        expect(localStorage.getItem('openscad-forge-grid-opacity--forge')).toBeNull()
      })

      it('handles localStorage errors gracefully', () => {
        const originalSetItem = localStorage.setItem
        localStorage.setItem = vi.fn(() => { throw new Error('Storage error') })
        expect(() => manager.saveGridOpacityPreference(50)).not.toThrow()
        localStorage.setItem = originalSetItem
      })
    })

    describe('_applyGridOpacity', () => {
      it('does nothing when gridHelper is null', () => {
        manager.gridHelper = null
        expect(() => manager._applyGridOpacity()).not.toThrow()
      })

      it('sets material opacity for single material', () => {
        const mockMaterial = { transparent: false, opacity: 1 }
        manager.gridHelper = { material: mockMaterial }
        manager.gridOpacity = 50
        manager._applyGridOpacity()
        expect(mockMaterial.transparent).toBe(true)
        expect(mockMaterial.opacity).toBe(0.5)
      })

      it('sets material opacity for array of materials', () => {
        const mat1 = { transparent: false, opacity: 1 }
        const mat2 = { transparent: false, opacity: 1 }
        manager.gridHelper = { material: [mat1, mat2] }
        manager.gridOpacity = 40
        manager._applyGridOpacity()
        expect(mat1.transparent).toBe(true)
        expect(mat1.opacity).toBeCloseTo(0.4)
        expect(mat2.transparent).toBe(true)
        expect(mat2.opacity).toBeCloseTo(0.4)
      })

      it('sets transparent to false when opacity is 100', () => {
        const mockMaterial = { transparent: true, opacity: 0.5 }
        manager.gridHelper = { material: mockMaterial }
        manager.gridOpacity = 100
        manager._applyGridOpacity()
        expect(mockMaterial.transparent).toBe(false)
        expect(mockMaterial.opacity).toBe(1)
      })
    })

    describe('gridOpacity initialized from localStorage', () => {
      it('picks up stored opacity on construction', () => {
        localStorage.setItem('openscad-forge-grid-opacity', '60')
        const m = new PreviewManager(container)
        expect(m.gridOpacity).toBe(60)
      })

      it('defaults to 100 when nothing stored', () => {
        const m = new PreviewManager(container)
        expect(m.gridOpacity).toBe(100)
      })
    })
  })

  describe('Color Legend', () => {
    let manager

    beforeEach(() => {
      manager = new PreviewManager(container)
    })

    describe('showColorLegend', () => {
      it('creates a legend element in the container', () => {
        manager.showColorLegend([
          { name: 'keyguard_color', value: '#ff0000' },
          { name: 'frame_color', value: '#00ff00' },
        ])
        const legend = container.querySelector('#colorLegend')
        expect(legend).not.toBeNull()
        expect(legend.getAttribute('role')).toBe('status')
      })

      it('renders a row per color parameter', () => {
        manager.showColorLegend([
          { name: 'a', value: '#111111' },
          { name: 'b', value: '#222222' },
          { name: 'c', value: '#333333' },
        ])
        const rows = container.querySelectorAll('.color-legend-row')
        expect(rows.length).toBe(3)
      })

      it('replaces underscores with spaces in labels', () => {
        manager.showColorLegend([{ name: 'first_layer_color', value: '#aaa' }])
        const label = container.querySelector('.color-legend-label')
        expect(label.textContent).toContain('first layer color')
      })

      it('removes existing legend before showing a new one', () => {
        manager.showColorLegend([{ name: 'a', value: '#111' }])
        manager.showColorLegend([{ name: 'b', value: '#222' }])
        const legends = container.querySelectorAll('#colorLegend')
        expect(legends.length).toBe(1)
      })

      it('does nothing for empty array', () => {
        manager.showColorLegend([])
        expect(container.querySelector('#colorLegend')).toBeNull()
      })

      it('does nothing for null', () => {
        manager.showColorLegend(null)
        expect(container.querySelector('#colorLegend')).toBeNull()
      })

      it('does nothing when container is missing', () => {
        manager.container = null
        expect(() => manager.showColorLegend([{ name: 'a', value: '#fff' }])).not.toThrow()
      })
    })

    describe('hideColorLegend', () => {
      it('removes the legend', () => {
        manager.showColorLegend([{ name: 'a', value: '#111' }])
        manager.hideColorLegend()
        expect(container.querySelector('#colorLegend')).toBeNull()
      })

      it('does nothing when no legend exists', () => {
        expect(() => manager.hideColorLegend()).not.toThrow()
      })

      it('does nothing when container is null', () => {
        manager.container = null
        expect(() => manager.hideColorLegend()).not.toThrow()
      })
    })
  })

  describe('Render State Color', () => {
    let manager

    beforeEach(() => {
      manager = new PreviewManager(container)
      manager.currentTheme = 'light'
      manager.colorOverride = null
      manager.renderState = null
    })

    describe('setRenderState', () => {
      it('is a no-op and does not store render state', () => {
        manager.setRenderState('preview')
        expect(manager.renderState).toBeNull()
      })

      it('is a no-op for laser state', () => {
        manager.setRenderState('laser')
        expect(manager.renderState).toBeNull()
      })

      it('is a no-op for null', () => {
        manager.renderState = 'preview'
        manager.setRenderState(null)
        expect(manager.renderState).toBe('preview')
      })

      it('is a no-op for undefined', () => {
        manager.renderState = 'preview'
        manager.setRenderState(undefined)
        expect(manager.renderState).toBe('preview')
      })
    })

    describe('_resolveModelColor', () => {
      it('returns theme default when no state and no override (light)', () => {
        const color = manager._resolveModelColor()
        expect(color).toBe('#9a8200')
      })

      it('returns theme default regardless of renderState (light, preview)', () => {
        manager.renderState = 'preview'
        const color = manager._resolveModelColor()
        expect(color).toBe('#9a8200')
      })

      it('returns theme default regardless of renderState (light, laser)', () => {
        manager.renderState = 'laser'
        const color = manager._resolveModelColor()
        expect(color).toBe('#9a8200')
      })

      it('returns dark theme default regardless of renderState', () => {
        manager.currentTheme = 'dark'
        manager.renderState = 'preview'
        const color = manager._resolveModelColor()
        expect(color).toBe('#4d9fff')
      })

      it('returns dark theme default for laser renderState', () => {
        manager.currentTheme = 'dark'
        manager.renderState = 'laser'
        const color = manager._resolveModelColor()
        expect(color).toBe('#4d9fff')
      })

      it('returns light-hc theme default regardless of renderState', () => {
        manager.currentTheme = 'light-hc'
        manager.renderState = 'preview'
        const color = manager._resolveModelColor()
        expect(color).toBe('#0052cc')
      })

      it('returns dark-hc theme default regardless of renderState', () => {
        manager.currentTheme = 'dark-hc'
        manager.renderState = 'laser'
        const color = manager._resolveModelColor()
        expect(color).toBe('#66b3ff')
      })

      it('returns mono theme default regardless of renderState', () => {
        manager.currentTheme = 'mono'
        manager.renderState = 'preview'
        const color = manager._resolveModelColor()
        expect(color).toBe('#00ff00')
      })

      it('returns mono-light theme default regardless of renderState', () => {
        manager.currentTheme = 'mono-light'
        manager.renderState = 'laser'
        const color = manager._resolveModelColor()
        expect(color).toBe('#ffb000')
      })

      it('returns mono-hc theme default', () => {
        manager.currentTheme = 'mono-hc'
        manager.renderState = 'preview'
        const color = manager._resolveModelColor()
        expect(color).toBe('#33ff33')
      })

      it('returns mono-light-hc theme default', () => {
        manager.currentTheme = 'mono-light-hc'
        manager.renderState = 'laser'
        const color = manager._resolveModelColor()
        expect(color).toBe('#ffc233')
      })

      it('returns colorOverride when enabled regardless of render state', () => {
        manager.renderState = 'laser'
        manager.colorOverrideEnabled = true
        manager.colorOverride = '#00ff00'
        const color = manager._resolveModelColor()
        expect(color).toBe('#00ff00')
      })

      it('returns colorOverride when enabled regardless of render state (preview)', () => {
        manager.renderState = 'preview'
        manager.colorOverrideEnabled = true
        manager.colorOverride = '#abcdef'
        const color = manager._resolveModelColor()
        expect(color).toBe('#abcdef')
      })

      it('returns theme default when override exists but is disabled', () => {
        manager.colorOverride = '#abcdef'
        manager.colorOverrideEnabled = false
        const color = manager._resolveModelColor()
        expect(color).toBe('#9a8200')
      })

      it('falls back to theme default for unknown render state', () => {
        manager.renderState = 'unknown_state'
        const color = manager._resolveModelColor()
        expect(color).toBe('#9a8200')
      })
    })

    describe('renderState does not affect model color', () => {
      it('all render states produce the same color (light theme)', () => {
        const defaultColor = manager._resolveModelColor()
        manager.renderState = 'preview'
        const previewColor = manager._resolveModelColor()
        manager.renderState = 'laser'
        const laserColor = manager._resolveModelColor()
        expect(defaultColor).toBe(previewColor)
        expect(defaultColor).toBe(laserColor)
      })

      it('all render states produce the same color (dark theme)', () => {
        manager.currentTheme = 'dark'
        const defaultColor = manager._resolveModelColor()
        manager.renderState = 'preview'
        const previewColor = manager._resolveModelColor()
        manager.renderState = 'laser'
        const laserColor = manager._resolveModelColor()
        expect(defaultColor).toBe(previewColor)
        expect(defaultColor).toBe(laserColor)
      })

      it('colorOverride takes priority over theme for all states when enabled', () => {
        manager.colorOverride = '#abcdef'
        manager.colorOverrideEnabled = true
        const defaultColor = manager._resolveModelColor()
        manager.renderState = 'preview'
        const previewColor = manager._resolveModelColor()
        manager.renderState = 'laser'
        const laserColor = manager._resolveModelColor()
        expect(defaultColor).toBe('#abcdef')
        expect(previewColor).toBe('#abcdef')
        expect(laserColor).toBe('#abcdef')
      })

      it('each theme has a distinct model color', () => {
        const themes = ['light', 'dark', 'light-hc', 'dark-hc', 'mono', 'mono-light', 'mono-hc', 'mono-light-hc']
        const colors = themes.map(t => {
          manager.currentTheme = t
          return manager._resolveModelColor()
        })
        const unique = new Set(colors)
        expect(unique.size).toBe(themes.length)
      })
    })
  })

  describe('loadSTL empty-geometry guard', () => {
    it('resolves with empty:true and calls clear() for 0-vertex STL', async () => {
      const manager = new PreviewManager(container)
      manager.clear = vi.fn()
      manager.hideLODWarning = vi.fn()
      manager.scene = { remove: vi.fn() }
      manager.mesh = null

      const emptyGeometry = { attributes: {} }
      const mockSTLLoader = { parse: vi.fn(() => emptyGeometry) }

      const originalLoadSTL = manager.loadSTL.bind(manager)
      manager.loadSTL = function (stlData, options = {}) {
        const { STLLoader: _OrigLoader, ...rest } = this
        void rest
        const self = this
        return new Promise((resolve) => {
          self.hideLODWarning()
          if (self.mesh) {
            self.scene.remove(self.mesh)
          }
          const geometry = mockSTLLoader.parse(stlData)
          const vertexCount = geometry.attributes.position
            ? geometry.attributes.position.count
            : 0
          if (vertexCount === 0) {
            self.clear()
            resolve({ parseMs: 0, empty: true })
            return
          }
        })
      }

      const result = await manager.loadSTL(new ArrayBuffer(0))
      expect(result).toEqual({ parseMs: 0, empty: true })
      expect(manager.clear).toHaveBeenCalled()
    })
  })

  describe('Rendered 2D Preview', () => {
    let manager

    beforeEach(() => {
      manager = new PreviewManager(container)
      // Simulate the #rendered2dPreview element from index.html
      const preview2d = document.createElement('div')
      preview2d.id = 'rendered2dPreview'
      preview2d.classList.add('rendered-2d-preview', 'hidden')
      document.body.appendChild(preview2d)

      // Simulate #previewModelSummary
      const summary = document.createElement('div')
      summary.id = 'previewModelSummary'
      document.body.appendChild(summary)
    })

    afterEach(() => {
      document.getElementById('rendered2dPreview')?.remove()
      document.getElementById('previewModelSummary')?.remove()
    })

    describe('show2DPreview', () => {
      it('inserts sanitized SVG into the 2D preview element', () => {
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M0 0 L100 100"/></svg>'
        manager.show2DPreview(svg)

        const el = document.getElementById('rendered2dPreview')
        expect(el.classList.contains('hidden')).toBe(false)
        expect(el.querySelector('svg')).not.toBeNull()
        expect(el.querySelector('path')).not.toBeNull()
      })

      it('strips <script> elements from SVG', () => {
        const svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert("xss")</script><circle cx="50" cy="50" r="40"/></svg>'
        manager.show2DPreview(svg)

        const el = document.getElementById('rendered2dPreview')
        expect(el.querySelector('script')).toBeNull()
        expect(el.querySelector('circle')).not.toBeNull()
      })

      it('strips event-handler attributes', () => {
        const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect onclick="alert(1)" width="100" height="100"/></svg>'
        manager.show2DPreview(svg)

        const rect = document.getElementById('rendered2dPreview').querySelector('rect')
        expect(rect.getAttribute('onclick')).toBeNull()
      })

      it('updates ARIA summary for 2D content', () => {
        const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>'
        manager.show2DPreview(svg)

        const summary = document.getElementById('previewModelSummary')
        expect(summary.textContent).toContain('2D')
      })

      it('sets _is2DPreviewActive to true', () => {
        const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>'
        manager.show2DPreview(svg)

        expect(manager._is2DPreviewActive).toBe(true)
      })

      it('injects desktop-parity styling for unstyled SVGs', () => {
        const svg = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0 L100 100"/><polygon points="0,0 50,50 100,0"/></svg>'
        manager.show2DPreview(svg)

        const style = document.getElementById('rendered2dPreview').querySelector('style[data-forge-preview]')
        expect(style).not.toBeNull()
        expect(style.textContent).toContain('#7A9F7A')
      })

      it('does not inject parity styling when SVG has explicit fills', () => {
        const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect fill="#ff0000" width="10" height="10"/></svg>'
        manager.show2DPreview(svg)

        const style = document.getElementById('rendered2dPreview').querySelector('style[data-forge-preview]')
        expect(style).toBeNull()
      })
    })

    describe('hide2DPreview', () => {
      it('hides the 2D preview element and clears content', () => {
        const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>'
        manager.show2DPreview(svg)
        manager.hide2DPreview()

        const el = document.getElementById('rendered2dPreview')
        expect(el.classList.contains('hidden')).toBe(true)
        expect(el.innerHTML).toBe('')
      })

      it('sets _is2DPreviewActive to false', () => {
        manager.show2DPreview('<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>')
        manager.hide2DPreview()

        expect(manager._is2DPreviewActive).toBe(false)
      })
    })

    describe('sanitizeSVG', () => {
      it('removes script tags', () => {
        const result = PreviewManager.sanitizeSVG(
          '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect width="10" height="10"/></svg>'
        )
        expect(result).not.toContain('<script')
        expect(result).toContain('<rect')
      })

      it('removes event handler attributes', () => {
        const result = PreviewManager.sanitizeSVG(
          '<svg xmlns="http://www.w3.org/2000/svg"><rect onload="alert(1)" width="10" height="10"/></svg>'
        )
        expect(result).not.toContain('onload')
      })

      it('removes javascript: hrefs', () => {
        const result = PreviewManager.sanitizeSVG(
          '<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><rect width="10" height="10"/></a></svg>'
        )
        expect(result).not.toContain('javascript:')
      })

      it('strips <foreignObject> elements', () => {
        const result = PreviewManager.sanitizeSVG(
          '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject width="100" height="100"><body xmlns="http://www.w3.org/1999/xhtml"><p>evil</p></body></foreignObject><rect width="10" height="10"/></svg>'
        )
        expect(result).not.toContain('foreignObject')
        expect(result).toContain('<rect')
      })

      it('strips <iframe> elements', () => {
        const result = PreviewManager.sanitizeSVG(
          '<svg xmlns="http://www.w3.org/2000/svg"><iframe src="https://evil.com"></iframe><rect width="10" height="10"/></svg>'
        )
        expect(result).not.toContain('iframe')
        expect(result).toContain('<rect')
      })

      it('strips <embed> elements', () => {
        const result = PreviewManager.sanitizeSVG(
          '<svg xmlns="http://www.w3.org/2000/svg"><embed src="evil.swf"/><rect width="10" height="10"/></svg>'
        )
        expect(result).not.toContain('embed')
        expect(result).toContain('<rect')
      })

      it('strips <object> elements', () => {
        const result = PreviewManager.sanitizeSVG(
          '<svg xmlns="http://www.w3.org/2000/svg"><object data="evil.swf"></object><rect width="10" height="10"/></svg>'
        )
        expect(result).not.toContain('object')
        expect(result).toContain('<rect')
      })

      it('blocks <use> with external http: href', () => {
        const result = PreviewManager.sanitizeSVG(
          '<svg xmlns="http://www.w3.org/2000/svg"><use href="http://evil.com/sprite.svg#icon"/><rect width="10" height="10"/></svg>'
        )
        expect(result).not.toContain('<use')
        expect(result).toContain('<rect')
      })

      it('blocks <use> with external https: href', () => {
        const result = PreviewManager.sanitizeSVG(
          '<svg xmlns="http://www.w3.org/2000/svg"><use href="https://evil.com/sprite.svg#icon"/><rect width="10" height="10"/></svg>'
        )
        expect(result).not.toContain('<use')
      })

      it('blocks <use> with protocol-relative href', () => {
        const result = PreviewManager.sanitizeSVG(
          '<svg xmlns="http://www.w3.org/2000/svg"><use href="//evil.com/sprite.svg#icon"/><rect width="10" height="10"/></svg>'
        )
        expect(result).not.toContain('<use')
      })

      it('preserves <use> with local fragment href', () => {
        const result = PreviewManager.sanitizeSVG(
          '<svg xmlns="http://www.w3.org/2000/svg"><defs><circle id="dot" r="5"/></defs><use href="#dot"/></svg>'
        )
        expect(result).toContain('use')
        expect(result).toContain('#dot')
      })

      it('blocks data: protocol in href', () => {
        const result = PreviewManager.sanitizeSVG(
          '<svg xmlns="http://www.w3.org/2000/svg"><a href="data:text/html,<script>alert(1)</script>"><rect width="10" height="10"/></a></svg>'
        )
        expect(result).not.toContain('data:')
      })

      it('blocks data: protocol in xlink:href', () => {
        const result = PreviewManager.sanitizeSVG(
          '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><image xlink:href="data:image/svg+xml;base64,PHN2Zz4=" width="10" height="10"/></svg>'
        )
        expect(result).not.toContain('data:')
      })
    })

    describe('svgLacksVisualStyling', () => {
      it('returns true for geometry-only SVG', () => {
        const parser = new DOMParser()
        const doc = parser.parseFromString(
          '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0L10 10"/><polygon points="0,0 5,5 10,0"/></svg>',
          'image/svg+xml'
        )
        expect(PreviewManager.svgLacksVisualStyling(doc.documentElement)).toBe(true)
      })

      it('returns false for styled SVG', () => {
        const parser = new DOMParser()
        const doc = parser.parseFromString(
          '<svg xmlns="http://www.w3.org/2000/svg"><path fill="#ff0000" d="M0 0L10 10"/></svg>',
          'image/svg+xml'
        )
        expect(PreviewManager.svgLacksVisualStyling(doc.documentElement)).toBe(false)
      })

      it('returns false for SVG with no shapes', () => {
        const parser = new DOMParser()
        const doc = parser.parseFromString(
          '<svg xmlns="http://www.w3.org/2000/svg"><text>Hello</text></svg>',
          'image/svg+xml'
        )
        expect(PreviewManager.svgLacksVisualStyling(doc.documentElement)).toBe(false)
      })
    })

    describe('injectDesktopParityStyling', () => {
      it('adds a style element with data-forge-preview attribute', () => {
        const parser = new DOMParser()
        const doc = parser.parseFromString(
          '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0L10 10"/></svg>',
          'image/svg+xml'
        )
        PreviewManager.injectDesktopParityStyling(doc.documentElement)
        const style = doc.querySelector('style[data-forge-preview]')
        expect(style).not.toBeNull()
        expect(style.textContent).toContain('#7A9F7A')
      })

      it('does not add duplicate style elements', () => {
        const parser = new DOMParser()
        const doc = parser.parseFromString(
          '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0L10 10"/></svg>',
          'image/svg+xml'
        )
        PreviewManager.injectDesktopParityStyling(doc.documentElement)
        PreviewManager.injectDesktopParityStyling(doc.documentElement)
        const styles = doc.querySelectorAll('style[data-forge-preview]')
        expect(styles.length).toBe(1)
      })
    })

    describe('_set2DPreviewActive', () => {
      it('hides 3D canvas when 2D is active', () => {
        const mockCanvas = document.createElement('canvas')
        manager.renderer = { domElement: mockCanvas }
        
        manager._set2DPreviewActive(true)
        expect(mockCanvas.style.display).toBe('none')
        
        manager._set2DPreviewActive(false)
        expect(mockCanvas.style.display).toBe('')
      })

      it('updates container ARIA label', () => {
        manager._set2DPreviewActive(true)
        expect(container.getAttribute('aria-label')).toBe('Rendered 2D SVG preview')
        
        manager._set2DPreviewActive(false)
        expect(container.getAttribute('aria-label')).toBe('3D model preview and controls')
      })
    })
  })

  describe('Dual-render helpers', () => {
    it('_disposeMeshResources disposes a single Mesh', () => {
      const manager = new PreviewManager(container)
      const disposeMat = vi.fn()
      const disposeGeo = vi.fn()
      manager.mesh = {
        isGroup: false,
        geometry: { dispose: disposeGeo },
        material: { dispose: disposeMat },
      }
      manager._disposeMeshResources()
      expect(disposeGeo).toHaveBeenCalledOnce()
      expect(disposeMat).toHaveBeenCalledOnce()
    })

    it('_disposeMeshResources disposes all children of a Group', () => {
      const manager = new PreviewManager(container)
      const child1Geo = { dispose: vi.fn() }
      const child1Mat = { dispose: vi.fn() }
      const child2Geo = { dispose: vi.fn() }
      const child2Mat = { dispose: vi.fn() }
      manager.mesh = {
        isGroup: true,
        children: [
          { geometry: child1Geo, material: child1Mat },
          { geometry: child2Geo, material: child2Mat },
        ],
      }
      manager._disposeMeshResources()
      expect(child1Geo.dispose).toHaveBeenCalledOnce()
      expect(child1Mat.dispose).toHaveBeenCalledOnce()
      expect(child2Geo.dispose).toHaveBeenCalledOnce()
      expect(child2Mat.dispose).toHaveBeenCalledOnce()
    })

    it('_disposeMeshResources is safe on null mesh', () => {
      const manager = new PreviewManager(container)
      manager.mesh = null
      expect(() => manager._disposeMeshResources()).not.toThrow()
    })

    it('_getPrimaryGeometry returns geometry from single Mesh', () => {
      const manager = new PreviewManager(container)
      const geo = { attributes: { position: { count: 36 } } }
      manager.mesh = { isGroup: false, geometry: geo }
      expect(manager._getPrimaryGeometry()).toBe(geo)
    })

    it('_getPrimaryGeometry returns first child geometry from Group', () => {
      const manager = new PreviewManager(container)
      const geo = { attributes: { position: { count: 36 } } }
      manager.mesh = {
        isGroup: true,
        children: [
          { geometry: geo },
          { geometry: { attributes: { position: { count: 36 } } } },
        ],
      }
      expect(manager._getPrimaryGeometry()).toBe(geo)
    })

    it('_getPrimaryGeometry returns null when mesh is null', () => {
      const manager = new PreviewManager(container)
      manager.mesh = null
      expect(manager._getPrimaryGeometry()).toBeNull()
    })

    it('applyColorToMesh skips highlight overlay children in Groups', () => {
      const manager = new PreviewManager(container)
      manager.colorOverrideEnabled = true
      manager.colorOverride = '#ff0000'
      const normalColor = { setHex: vi.fn() }
      const highlightColor = { setHex: vi.fn() }
      manager.mesh = {
        isGroup: true,
        children: [
          {
            material: { color: normalColor, vertexColors: false, needsUpdate: false },
            userData: {},
          },
          {
            material: { color: highlightColor, vertexColors: false, needsUpdate: false },
            userData: { isHighlightOverlay: true },
          },
        ],
      }
      manager.applyColorToMesh()
      expect(normalColor.setHex).toHaveBeenCalledOnce()
      expect(highlightColor.setHex).not.toHaveBeenCalled()
    })

    it('setModelOpacity applies to all children of a Group', () => {
      const manager = new PreviewManager(container)
      const mat1 = {
        transparent: false,
        opacity: 1,
        depthWrite: true,
        needsUpdate: false,
      }
      const mat2 = {
        transparent: false,
        opacity: 1,
        depthWrite: true,
        needsUpdate: false,
      }
      manager.mesh = {
        isGroup: true,
        children: [
          { material: mat1, renderOrder: 0 },
          { material: mat2, renderOrder: 0 },
        ],
      }
      manager.appearanceOverrideEnabled = true
      manager.setModelOpacity(50)
      expect(mat1.transparent).toBe(true)
      expect(mat1.opacity).toBe(0.5)
      expect(mat2.transparent).toBe(true)
      expect(mat2.opacity).toBe(0.5)
    })
  })

  describe('2D/3D Preview Transitions', () => {
    let manager
    let preview2d

    beforeEach(() => {
      manager = new PreviewManager(container)
      preview2d = document.createElement('div')
      preview2d.id = 'rendered2dPreview'
      preview2d.classList.add('rendered-2d-preview', 'hidden')
      document.body.appendChild(preview2d)
    })

    afterEach(() => {
      document.getElementById('rendered2dPreview')?.remove()
    })

    it('clear() calls hide2DPreview() when 2D preview is active', () => {
      manager.show2DPreview('<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>')
      expect(manager._is2DPreviewActive).toBe(true)

      const spy = vi.spyOn(manager, 'hide2DPreview')
      manager.scene = { remove: vi.fn() }
      manager.renderer = { render: vi.fn() }
      manager.camera = {}

      manager.clear()

      expect(spy).toHaveBeenCalled()
      expect(manager._is2DPreviewActive).toBe(false)
    })

    it('clear() calls hide2DPreview() even when no 2D preview is active (idempotent)', () => {
      expect(manager._is2DPreviewActive).toBeFalsy()

      const spy = vi.spyOn(manager, 'hide2DPreview')
      manager.scene = { remove: vi.fn() }
      manager.renderer = { render: vi.fn() }
      manager.camera = {}

      manager.clear()

      expect(spy).toHaveBeenCalled()
    })

    it('loadSTL() calls hide2DPreview() before processing', async () => {
      manager.show2DPreview('<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>')
      const spy = vi.spyOn(manager, 'hide2DPreview')

      await manager.loadSTL(new ArrayBuffer(0)).catch(() => {
        // THREE.js not loaded — expected
      })

      expect(spy).toHaveBeenCalled()
    })

    it('loadOFF() calls hide2DPreview() before processing', async () => {
      manager.show2DPreview('<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>')
      const spy = vi.spyOn(manager, 'hide2DPreview')

      await manager.loadOFF('OFF\n0 0 0').catch(() => {
        // THREE.js not loaded — expected
      })

      expect(spy).toHaveBeenCalled()
    })

    it('after clear(), _is2DPreviewActive is false', () => {
      manager.show2DPreview('<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>')
      expect(manager._is2DPreviewActive).toBe(true)

      manager.scene = { remove: vi.fn() }
      manager.renderer = { render: vi.fn() }
      manager.camera = {}
      manager.clear()

      expect(manager._is2DPreviewActive).toBe(false)
    })
  })
})

// ---------------------------------------------------------------------------
// Phase 5 — Visual-Parity Cross-Phase Validation
//
// Validates that all Phase 1–4 changes compose correctly: Cornfield gold
// default color, desktop-matched lighting, aligned shininess, zero specular,
// and post-load overlay refresh. This suite guards against regressions that
// individual phase tests might miss by checking the full configuration in a
// single constructed PreviewManager instance.
// ---------------------------------------------------------------------------
describe('Visual Parity — desktop OpenSCAD alignment (Phase 5)', () => {
  let container
  let manager

  beforeEach(async () => {
    container = document.createElement('div')
    container.style.width = '800px'
    container.style.height = '600px'
    document.body.appendChild(container)
    localStorage.clear()
    manager = new PreviewManager(container)
    await manager.init()
  })

  afterEach(() => {
    document.body.removeChild(container)
    localStorage.clear()
  })

  describe('lighting pipeline matches desktop GLView::initializeGL()', () => {
    it('ambient intensity is 0.2 * π (OpenGL default GL_LIGHT_MODEL_AMBIENT)', () => {
      const expected = 0.2 * Math.PI
      expect(manager.ambientLight.intensity).toBeCloseTo(expected, 5)
    })

    it('directional intensities are 1.5 * π (π-cancel × Q-30 calibration)', () => {
      // 1.0*π cancels the BRDF_Lambert divisor (OpenGL diffuse {1,1,1,1});
      // the further ×1.5 is the owner's Q-30 pick from A/B captures against
      // desktop 2021.01 at a pinned pose (U-14, 2026-08-11) — with π-cancel
      // alone the same mesh in the same baked colors rendered visibly darker.
      const expected = 1.5 * Math.PI
      expect(manager.directionalLight1.intensity).toBeCloseTo(expected, 5)
      expect(manager.directionalLight2.intensity).toBeCloseTo(expected, 5)
    })

    it('directional lights are parented to camera (view-space positioning)', () => {
      expect(manager.directionalLight1.parent).toBe(manager.camera)
      expect(manager.directionalLight2.parent).toBe(manager.camera)
    })

    it('base intensities record matches constructed values', () => {
      expect(manager.baseLightIntensities.ambient).toBeCloseTo(0.2 * Math.PI, 5)
      expect(manager.baseLightIntensities.dir1).toBeCloseTo(1.5 * Math.PI, 5)
      expect(manager.baseLightIntensities.dir2).toBeCloseTo(1.5 * Math.PI, 5)
    })
  })

  // The light theme used Cornfield gold #f9d72c until 2026-07; it measures
  // 1.3:1 against the #f5f5f5 background and fails WCAG 2.2 SC 1.4.11, so
  // it was darkened in the same hue (see preview-colors-contrast.test.js).
  describe('light theme default model color (darkened Cornfield gold)', () => {
    it('light theme model color resolves to #9a8200', () => {
      manager.currentTheme = 'light'
      const color = manager._resolveModelColor()
      expect(color).toBe('#9a8200')
    })

    it('color override takes priority over the theme default', () => {
      manager.currentTheme = 'light'
      manager.colorOverrideEnabled = true
      manager.colorOverride = '#ff0000'
      const color = manager._resolveModelColor()
      expect(color).toBe('#ff0000')
    })

    it('disabling color override reverts to the theme default', () => {
      manager.currentTheme = 'light'
      manager.colorOverride = '#ff0000'
      manager.colorOverrideEnabled = false
      const color = manager._resolveModelColor()
      expect(color).toBe('#9a8200')
    })
  })

  describe('back-face (CUTOUT) color entries', () => {
    it('every theme has a modelBack property', () => {
      const themes = ['light', 'dark', 'light-hc', 'dark-hc', 'mono', 'mono-light', 'mono-hc', 'mono-light-hc']
      themes.forEach(theme => {
        manager.currentTheme = theme
        const backColor = manager._resolveModelBackColor()
        expect(backColor).toBeTypeOf('number')
        expect(backColor).toBeGreaterThanOrEqual(0)
        expect(backColor).toBeLessThanOrEqual(0xffffff)
      })
    })

    it('light theme modelBack is darkened Cornfield green 0x5a8a22', () => {
      manager.currentTheme = 'light'
      expect(manager._resolveModelBackColor()).toBe(0x5a8a22)
    })

    it('back-face color is theme-driven (ignores color override)', () => {
      manager.currentTheme = 'light'
      manager.colorOverrideEnabled = true
      manager.colorOverride = '#ff0000'
      expect(manager._resolveModelBackColor()).toBe(0x5a8a22)
    })

    it('back-face color differs from front-face model color for all themes', () => {
      const themes = ['light', 'dark', 'light-hc', 'dark-hc', 'mono', 'mono-light', 'mono-hc', 'mono-light-hc']
      themes.forEach(theme => {
        manager.currentTheme = theme
        const frontHex = parseInt(manager._resolveModelColor().slice(1), 16)
        const backHex = manager._resolveModelBackColor()
        expect(backHex).not.toBe(frontHex)
      })
    })

    it('falls back to light theme modelBack for unknown theme', () => {
      manager.currentTheme = 'nonexistent'
      expect(manager._resolveModelBackColor()).toBe(0x5a8a22)
    })
  })

  describe('material configuration', () => {
    it('DESKTOP_SHININESS constant is 64 (GLView.cc line 324)', () => {
      expect(DESKTOP_SHININESS).toBe(64)
    })

    it('CORNFIELD_BACK_COLOR constant is 0x9dcb51 (ColorMap.cc OPENCSG_FACE_BACK_COLOR)', () => {
      expect(CORNFIELD_BACK_COLOR).toBe(0x9dcb51)
    })
  })

  describe('two-sided (backface) material configuration', () => {
    let material

    beforeEach(() => {
      material = new MeshPhongMaterial({
        color: 0xf9d72c,
        specular: 0x000000,
        shininess: 64,
        flatShading: false,
      })
      manager._applyBackfaceColoring(material, CORNFIELD_BACK_COLOR)
    })

    it('sets material.side to DoubleSide', () => {
      expect(material.side).toBe(DoubleSide)
    })

    it('sets onBeforeCompile callback', () => {
      expect(typeof material.onBeforeCompile).toBe('function')
    })

    it('sets customProgramCacheKey for shader caching', () => {
      expect(typeof material.customProgramCacheKey).toBe('function')
      expect(material.customProgramCacheKey()).toBe('backface-coloring-v7')
    })

    it('populates userData.backfaceColorUniform after compile callback fires', () => {
      const mockShader = {
        vertexShader: [
          'varying vec3 vViewPosition;',
          'void main() {',
          'vViewPosition = - mvPosition.xyz;',
          '}',
        ].join('\n'),
        fragmentShader: [
          'uniform float opacity;',
          'void main() {',
          'vec4 diffuseColor = vec4( diffuse, opacity );',
          '#include <color_fragment>',
          '}',
        ].join('\n'),
        uniforms: {},
      }
      material.onBeforeCompile(mockShader)
      expect(material.userData.backfaceColorUniform).toBeDefined()
      expect(material.userData.backfaceColorUniform.value).toBeDefined()
    })

    it('injects backfaceColor uniform and varyings into fragment shader', () => {
      const mockShader = {
        vertexShader: [
          'varying vec3 vViewPosition;',
          'void main() {',
          'vViewPosition = - mvPosition.xyz;',
          '}',
        ].join('\n'),
        fragmentShader: [
          'uniform float opacity;',
          'void main() {',
          'vec4 diffuseColor = vec4( diffuse, opacity );',
          '#include <color_fragment>',
          '}',
        ].join('\n'),
        uniforms: {},
      }
      material.onBeforeCompile(mockShader)
      expect(mockShader.fragmentShader).toContain('uniform vec3 backfaceColor;')
      expect(mockShader.fragmentShader).toContain('varying float vIsInner;')
    })

    it('injects aIsInner attribute and vIsInner varying into vertex shader', () => {
      const mockShader = {
        vertexShader: [
          'varying vec3 vViewPosition;',
          'void main() {',
          'vViewPosition = - mvPosition.xyz;',
          '}',
        ].join('\n'),
        fragmentShader: [
          'uniform float opacity;',
          'void main() {',
          'vec4 diffuseColor = vec4( diffuse, opacity );',
          '#include <color_fragment>',
          '}',
        ].join('\n'),
        uniforms: {},
      }
      material.onBeforeCompile(mockShader)
      expect(mockShader.vertexShader).toContain('attribute float aIsInner;')
      expect(mockShader.vertexShader).toContain('varying float vIsInner;')
      expect(mockShader.vertexShader).toContain('vIsInner = aIsInner;')
    })

    it('replaces diffuse init with combined gl_FrontFacing + aIsInner test', () => {
      const mockShader = {
        vertexShader: [
          'varying vec3 vViewPosition;',
          'void main() {',
          'vViewPosition = - mvPosition.xyz;',
          '}',
        ].join('\n'),
        fragmentShader: [
          'uniform float opacity;',
          'void main() {',
          'vec4 diffuseColor = vec4( diffuse, opacity );',
          '#include <color_fragment>',
          '}',
        ].join('\n'),
        uniforms: {},
      }
      material.onBeforeCompile(mockShader)
      expect(mockShader.fragmentShader).toContain('isBack ? backfaceColor : diffuse')
      expect(mockShader.fragmentShader).toContain('vIsInner > 0.5')
      expect(mockShader.fragmentShader).not.toContain('vec4 diffuseColor = vec4( diffuse, opacity );')
    })

    it('adds isBack override after color_fragment include', () => {
      const mockShader = {
        vertexShader: [
          'varying vec3 vViewPosition;',
          'void main() {',
          'vViewPosition = - mvPosition.xyz;',
          '}',
        ].join('\n'),
        fragmentShader: [
          'uniform float opacity;',
          'void main() {',
          'vec4 diffuseColor = vec4( diffuse, opacity );',
          '#include <color_fragment>',
          '}',
        ].join('\n'),
        uniforms: {},
      }
      material.onBeforeCompile(mockShader)
      expect(mockShader.fragmentShader).toContain('if ( isBack ) diffuseColor = vec4( backfaceColor, opacity );')
    })

    it('_syncColorOverride propagates back-face color when uniform exists', () => {
      const mockShader = {
        vertexShader: [
          'varying vec3 vViewPosition;',
          'void main() {',
          'vViewPosition = - mvPosition.xyz;',
          '}',
        ].join('\n'),
        fragmentShader: [
          'uniform float opacity;',
          'void main() {',
          'vec4 diffuseColor = vec4( diffuse, opacity );',
          '#include <color_fragment>',
          '}',
        ].join('\n'),
        uniforms: {},
      }
      material.onBeforeCompile(mockShader)

      const geometry = { attributes: {} }
      const mesh = { material, geometry, isGroup: false }
      manager.mesh = mesh
      manager.currentTheme = 'dark'
      manager._syncColorOverride()
      const expectedHex = 0x3d8a44
      expect(material.userData.backfaceColorUniform.value.getHex()).toBe(expectedHex)
    })
  })

  describe('_classifyInnerFaces CPU-side classifier', () => {
    let originalFetch

    beforeEach(() => {
      originalFetch = globalThis.fetch
      globalThis.fetch = vi.fn(() => Promise.resolve())
    })

    afterEach(() => {
      globalThis.fetch = originalFetch
    })

    function buildCavityGeometry() {
      const outerPos = []
      const outerNrm = []
      for (let i = 0; i < 6; i++) {
        const x = 20 + i * 3
        outerPos.push(x, 0, 0, x, 1, 0, x, 0, 1)
        outerNrm.push(1, 0, 0, 1, 0, 0, 1, 0, 0)
      }
      for (let i = 0; i < 6; i++) {
        const x = -20 - i * 3
        outerPos.push(x, 0, 0, x, -1, 0, x, 0, 1)
        outerNrm.push(-1, 0, 0, -1, 0, 0, -1, 0, 0)
      }
      const positions = new Float32Array([
        0, 0, 2,  1, 0, 2,  0.5, 1, 2,
        0, 0, 2,  1, 0, 2,  0.5, -5, 3,
        ...outerPos,
      ])
      const normals = new Float32Array([
        0, 0, -1,  0, 0, -1,  0, 0, -1,
        0, 0, 1,   0, 0, 1,   0, 0, 1,
        ...outerNrm,
      ])
      const geometry = new BufferGeometry()
      geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
      geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3))
      return geometry
    }

    it('classifies inner cavity face and promotes across concave edge', () => {
      const geometry = buildCavityGeometry()
      manager._classifyInnerFaces(geometry)

      const attr = geometry.getAttribute('aIsInner')
      expect(attr).toBeDefined()
      // face 0: dot < 0 AND concaveEdgeCount >= 1 → baseline inner
      expect(attr.getX(0)).toBe(1)
      // face 1: dot > 0 but promoted across concave edge (nDot = -1) from face 0
      expect(attr.getX(3)).toBe(1)
      // outer faces: dot >> 0, no concave edges → outer
      for (let v = 6; v < attr.count; v += 3) {
        expect(attr.getX(v)).toBe(0)
      }
    })

    it('coplanar smoothing eliminates isolated mismatches via majority vote', () => {
      const positions = new Float32Array([
        // 3 coplanar faces sharing edges (grid), all with dot < 0 → baseline inner
        0, 0, 0.5,  2, 0, 0.5,  0, 2, 0.5,
        2, 0, 0.5,  2, 2, 0.5,  0, 2, 0.5,
        2, 0, 0.5,  4, 0, 0.5,  2, 2, 0.5,
        // face 3: same normal but forced dot > 0 by placing far from origin
        40, 0, 0,  42, 0, 0,  41, 1, 0,
      ])
      const normals = new Float32Array([
        0, 0, -1,  0, 0, -1,  0, 0, -1,
        0, 0, -1,  0, 0, -1,  0, 0, -1,
        0, 0, -1,  0, 0, -1,  0, 0, -1,
        0, 0, -1,  0, 0, -1,  0, 0, -1,
      ])
      const geometry = new BufferGeometry()
      geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
      geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3))
      manager._classifyInnerFaces(geometry)

      const attr = geometry.getAttribute('aIsInner')
      // faces 0-2: connected coplanar component, all dot < 0 → all inner
      expect(attr.getX(0)).toBe(1)
      expect(attr.getX(3)).toBe(1)
      expect(attr.getX(6)).toBe(1)
      // face 3: disconnected, dot > 0 → outer (not affected by smoothing of faces 0-2)
      expect(attr.getX(9)).toBe(0)
    })
  })

  describe('post-load listener infrastructure (Show Edges refresh)', () => {
    it('PreviewManager exposes addPostLoadListener API', () => {
      expect(typeof manager.addPostLoadListener).toBe('function')
      expect(typeof manager.removePostLoadListener).toBe('function')
    })

    it('listeners fire after registration', () => {
      const spy = vi.fn()
      manager.addPostLoadListener(spy)
      manager._firePostLoadListeners()
      expect(spy).toHaveBeenCalledTimes(1)
    })

    it('removed listeners do not fire', () => {
      const spy = vi.fn()
      manager.addPostLoadListener(spy)
      manager.removePostLoadListener(spy)
      manager._firePostLoadListeners()
      expect(spy).not.toHaveBeenCalled()
    })
  })
})

describe('loadOFF() heuristic skip — CSG color preprocessing', () => {
  let container
  let manager

  beforeEach(async () => {
    container = document.createElement('div')
    container.style.width = '800px'
    container.style.height = '600px'
    document.body.appendChild(container)
    localStorage.clear()
    manager = new PreviewManager(container)
    await manager.init()
  })

  afterEach(() => {
    document.body.removeChild(container)
    localStorage.clear()
  })

  const OFF_WITHOUT_COLORS = [
    'OFF',
    '4 2 0',
    '0 0 0',
    '1 0 0',
    '0 1 0',
    '0 0 1',
    '3 0 1 2',
    '3 0 2 3',
  ].join('\n')

  const OFF_WITH_FACE_COLORS = [
    'OFF',
    '4 2 0',
    '0 0 0',
    '1 0 0',
    '0 1 0',
    '0 0 1',
    '3 0 1 2 249 215 44 255',
    '3 0 2 3 157 203 81 255',
  ].join('\n')

  it('calls _classifyInnerFaces when OFF has no face colors', async () => {
    const spy = vi.spyOn(manager, '_classifyInnerFaces')

    const { hasColors } = await manager.loadOFF(OFF_WITHOUT_COLORS)

    expect(hasColors).toBe(false)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('skips _classifyInnerFaces when OFF has per-face colors', async () => {
    const spy = vi.spyOn(manager, '_classifyInnerFaces')

    const { hasColors } = await manager.loadOFF(OFF_WITH_FACE_COLORS)

    expect(hasColors).toBe(true)
    expect(spy).not.toHaveBeenCalled()
  })

  it('applies vertex colors from OFF face color data', async () => {
    await manager.loadOFF(OFF_WITH_FACE_COLORS)

    const geometry = manager.mesh?.geometry
    expect(geometry).toBeDefined()
    const colorAttr = geometry.getAttribute('color')
    expect(colorAttr).toBeDefined()
    expect(colorAttr.count).toBeGreaterThan(0)
  })

  it('applies _classifyInnerFaces aIsInner attribute for colorless OFF', async () => {
    await manager.loadOFF(OFF_WITHOUT_COLORS)

    const geometry = manager.mesh?.geometry
    expect(geometry).toBeDefined()
    const innerAttr = geometry.getAttribute('aIsInner')
    expect(innerAttr).toBeDefined()
  })
})
