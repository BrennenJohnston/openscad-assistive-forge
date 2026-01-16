import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { PreviewManager, isThreeJsLoaded } from '../../src/js/preview.js'

describe('PreviewManager', () => {
  let container

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    localStorage.clear()
  })

  afterEach(() => {
    document.body.removeChild(container)
    localStorage.clear()
  })

  it('reports Three.js as not loaded initially', () => {
    expect(isThreeJsLoaded()).toBe(false)
  })

  it('loads and saves measurement preference', () => {
    localStorage.setItem('openscad-customizer-measurements', 'true')
    const manager = new PreviewManager(container)

    expect(manager.loadMeasurementPreference()).toBe(true)

    manager.saveMeasurementPreference(false)
    expect(localStorage.getItem('openscad-customizer-measurements')).toBe('false')
  })

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
})
