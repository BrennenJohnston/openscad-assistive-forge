import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { detectLibraries, LibraryManager, LIBRARY_DEFINITIONS } from '../../src/js/library-manager.js'

describe('LibraryManager', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  describe('detectLibraries', () => {
    it('detects library usage from include/use statements', () => {
      const scad = `
        include <MCAD/gear.scad>
        use <BOSL2/std.scad>
        include <dotSCAD/shape.scad>
      `
      const detected = detectLibraries(scad)
      expect(new Set(detected)).toEqual(new Set(['MCAD', 'BOSL2', 'dotSCAD']))
    })

    it('detects NopSCADlib usage', () => {
      const scad = `use <NopSCADlib/core.scad>`
      const detected = detectLibraries(scad)
      expect(detected).toContain('NopSCADlib')
    })

    it('returns empty array when no libraries detected', () => {
      const scad = `cube([10, 10, 10]);`
      const detected = detectLibraries(scad)
      expect(detected).toEqual([])
    })

    it('ignores unknown library paths', () => {
      const scad = `include <unknown_lib/file.scad>`
      const detected = detectLibraries(scad)
      expect(detected).toEqual([])
    })

    it('handles multiple includes from same library', () => {
      const scad = `
        include <MCAD/gear.scad>
        include <MCAD/boxes.scad>
        use <MCAD/screw.scad>
      `
      const detected = detectLibraries(scad)
      expect(detected).toEqual(['MCAD'])
    })
  })

  describe('enable, disable, toggle', () => {
    it('enables, disables, and toggles libraries', () => {
      const manager = new LibraryManager()
      manager.enable('MCAD')
      expect(manager.get('MCAD').enabled).toBe(true)

      manager.disable('MCAD')
      expect(manager.get('MCAD').enabled).toBe(false)

      manager.toggle('MCAD')
      expect(manager.get('MCAD').enabled).toBe(true)
    })

    it('ignores unknown library ids for enable', () => {
      const manager = new LibraryManager()
      expect(() => manager.enable('UNKNOWN')).not.toThrow()
      expect(manager.get('UNKNOWN')).toBeNull()
    })

    it('ignores unknown library ids for disable', () => {
      const manager = new LibraryManager()
      expect(() => manager.disable('UNKNOWN')).not.toThrow()
    })

    it('ignores unknown library ids for toggle', () => {
      const manager = new LibraryManager()
      expect(() => manager.toggle('UNKNOWN')).not.toThrow()
    })
  })

  describe('persistence', () => {
    it('persists library state to localStorage', () => {
      const manager = new LibraryManager()
      manager.enable('BOSL2')

      const stored = JSON.parse(localStorage.getItem('openscad-forge-libraries'))
      expect(stored.BOSL2.enabled).toBe(true)
    })

    it('loads library state from localStorage', () => {
      localStorage.setItem(
        'openscad-forge-libraries',
        JSON.stringify({ MCAD: { enabled: true }, BOSL2: { enabled: false } })
      )
      const manager = new LibraryManager()

      expect(manager.get('MCAD').enabled).toBe(true)
      expect(manager.get('BOSL2').enabled).toBe(false)
    })

    it('handles invalid JSON in localStorage gracefully', () => {
      localStorage.setItem('openscad-forge-libraries', 'invalid json')
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      
      const manager = new LibraryManager()
      
      // After error, library should be at default state (disabled)
      // The manager should still work even with invalid JSON
      expect(manager.get('MCAD')).not.toBeNull()
      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it('handles localStorage errors on save gracefully', () => {
      const manager = new LibraryManager()
      const originalSetItem = localStorage.setItem
      localStorage.setItem = vi.fn(() => { throw new Error('Storage full') })
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      
      expect(() => manager.enable('MCAD')).not.toThrow()
      
      localStorage.setItem = originalSetItem
      consoleSpy.mockRestore()
    })

    it('handles missing enabled property in saved state', () => {
      localStorage.setItem(
        'openscad-forge-libraries',
        JSON.stringify({ MCAD: {} })
      )
      const manager = new LibraryManager()
      
      expect(manager.get('MCAD').enabled).toBe(false)
    })
  })

  describe('getEnabled', () => {
    it('returns enabled libraries', () => {
      localStorage.clear()
      const manager = new LibraryManager()
      manager.enable('MCAD')
      manager.enable('BOSL2')

      const enabled = manager.getEnabled().map(lib => lib.id)
      expect(new Set(enabled)).toEqual(new Set(['MCAD', 'BOSL2']))
    })

    it('returns empty array when no libraries enabled', () => {
      localStorage.clear()
      const manager = new LibraryManager()
      // Ensure all are disabled first
      manager.reset()
      expect(manager.getEnabled()).toHaveLength(0)
    })
  })

  describe('getAll', () => {
    it('returns all library definitions', () => {
      const manager = new LibraryManager()
      const all = manager.getAll()
      
      expect(Object.keys(all)).toContain('MCAD')
      expect(Object.keys(all)).toContain('BOSL2')
      expect(Object.keys(all)).toContain('NopSCADlib')
      expect(Object.keys(all)).toContain('dotSCAD')
    })
  })

  describe('isEnabled', () => {
    it('returns true for enabled library', () => {
      localStorage.clear()
      const manager = new LibraryManager()
      manager.enable('MCAD')
      
      expect(manager.isEnabled('MCAD')).toBe(true)
    })

    it('returns false for disabled library', () => {
      localStorage.clear()
      const manager = new LibraryManager()
      manager.reset() // Ensure all are disabled
      
      expect(manager.isEnabled('MCAD')).toBe(false)
    })

    it('returns false for unknown library', () => {
      localStorage.clear()
      const manager = new LibraryManager()
      
      expect(manager.isEnabled('UNKNOWN')).toBe(false)
    })
  })

  describe('getMountPaths', () => {
    it('returns mount paths for enabled libraries', () => {
      localStorage.clear()
      const manager = new LibraryManager()
      manager.reset() // Start fresh
      manager.enable('MCAD')
      manager.enable('BOSL2')
      
      const paths = manager.getMountPaths()
      
      expect(paths).toHaveLength(2)
      expect(paths.find(p => p.id === 'MCAD')).toEqual({ id: 'MCAD', path: '/libraries/MCAD' })
      expect(paths.find(p => p.id === 'BOSL2')).toEqual({ id: 'BOSL2', path: '/libraries/BOSL2' })
    })

    it('returns empty array when no libraries enabled', () => {
      localStorage.clear()
      const manager = new LibraryManager()
      manager.reset() // Ensure all are disabled
      
      expect(manager.getMountPaths()).toHaveLength(0)
    })
  })

  describe('autoEnable', () => {
    it('auto-enables detected libraries', () => {
      localStorage.clear()
      const manager = new LibraryManager()
      manager.reset() // Start fresh
      const scad = `include <MCAD/gear.scad>`
      
      const autoEnabled = manager.autoEnable(scad)
      
      expect(autoEnabled).toContain('MCAD')
      expect(manager.isEnabled('MCAD')).toBe(true)
    })

    it('does not re-enable already enabled libraries', () => {
      localStorage.clear()
      const manager = new LibraryManager()
      manager.reset()
      manager.enable('MCAD')
      const scad = `include <MCAD/gear.scad>`
      
      const autoEnabled = manager.autoEnable(scad)
      
      expect(autoEnabled).not.toContain('MCAD')
    })

    it('returns empty array when no libraries detected', () => {
      localStorage.clear()
      const manager = new LibraryManager()
      const scad = `cube([10, 10, 10]);`
      
      const autoEnabled = manager.autoEnable(scad)
      
      expect(autoEnabled).toHaveLength(0)
    })
  })

  describe('subscribe', () => {
    it('notifies listeners on state changes', () => {
      const manager = new LibraryManager()
      const listener = vi.fn()
      manager.subscribe(listener)

      manager.enable('dotSCAD')
      expect(listener).toHaveBeenCalledWith(
        'enable',
        'dotSCAD',
        expect.objectContaining({ id: 'dotSCAD', enabled: true })
      )
    })

    it('notifies listeners on disable', () => {
      const manager = new LibraryManager()
      manager.enable('MCAD')
      const listener = vi.fn()
      manager.subscribe(listener)

      manager.disable('MCAD')
      expect(listener).toHaveBeenCalledWith(
        'disable',
        'MCAD',
        expect.objectContaining({ id: 'MCAD', enabled: false })
      )
    })

    it('notifies listeners on toggle', () => {
      localStorage.clear()
      const manager = new LibraryManager()
      manager.reset() // Start with all disabled
      const listener = vi.fn()
      manager.subscribe(listener)

      manager.toggle('BOSL2')
      expect(listener).toHaveBeenCalledWith(
        'toggle',
        'BOSL2',
        expect.objectContaining({ id: 'BOSL2', enabled: true })
      )
    })

    it('returns unsubscribe function', () => {
      const manager = new LibraryManager()
      const listener = vi.fn()
      const unsubscribe = manager.subscribe(listener)

      unsubscribe()
      manager.enable('MCAD')

      expect(listener).not.toHaveBeenCalled()
    })

    it('handles listener errors gracefully', () => {
      const manager = new LibraryManager()
      const errorListener = vi.fn(() => { throw new Error('Listener error') })
      const goodListener = vi.fn()
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      
      manager.subscribe(errorListener)
      manager.subscribe(goodListener)

      manager.enable('MCAD')

      expect(consoleSpy).toHaveBeenCalled()
      expect(goodListener).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })
  })

  describe('reset', () => {
    it('resets all libraries and notifies listeners', () => {
      const manager = new LibraryManager()
      manager.enable('MCAD')

      const listener = vi.fn()
      manager.subscribe(listener)

      manager.reset()

      expect(manager.getEnabled()).toHaveLength(0)
      expect(listener).toHaveBeenCalledWith('reset', null, undefined)
    })

    it('resets multiple enabled libraries', () => {
      const manager = new LibraryManager()
      manager.enable('MCAD')
      manager.enable('BOSL2')
      manager.enable('dotSCAD')

      manager.reset()

      expect(manager.isEnabled('MCAD')).toBe(false)
      expect(manager.isEnabled('BOSL2')).toBe(false)
      expect(manager.isEnabled('dotSCAD')).toBe(false)
    })
  })

  describe('getStats', () => {
    it('returns correct statistics', () => {
      const manager = new LibraryManager()
      manager.enable('MCAD')
      manager.enable('BOSL2')
      
      const stats = manager.getStats()
      
      expect(stats.total).toBe(4)
      expect(stats.enabled).toBe(2)
      expect(stats.disabled).toBe(2)
      expect(stats.popular).toBe(2) // MCAD and BOSL2 are popular
    })

    it('returns correct stats when no libraries enabled', () => {
      localStorage.clear()
      const manager = new LibraryManager()
      manager.reset() // Ensure all are disabled
      
      const stats = manager.getStats()
      
      expect(stats.total).toBe(4)
      expect(stats.enabled).toBe(0)
      expect(stats.disabled).toBe(4)
    })
  })

  describe('checkAvailability', () => {
    it('checks availability of all libraries', async () => {
      const manager = new LibraryManager()
      global.fetch = vi.fn().mockResolvedValue({ ok: true })
      
      const availability = await manager.checkAvailability()
      
      expect(availability.MCAD).toBe(true)
      expect(availability.BOSL2).toBe(true)
    })

    it('handles fetch errors gracefully', async () => {
      const manager = new LibraryManager()
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))
      
      const availability = await manager.checkAvailability()
      
      expect(availability.MCAD).toBe(false)
    })

    it('handles non-ok responses', async () => {
      const manager = new LibraryManager()
      global.fetch = vi.fn().mockResolvedValue({ ok: false })
      
      const availability = await manager.checkAvailability()
      
      expect(availability.MCAD).toBe(false)
    })
  })

  describe('getManifest', () => {
    it('fetches and returns manifest', async () => {
      const manager = new LibraryManager()
      const mockManifest = { version: '1.0', libraries: [] }
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockManifest)
      })
      
      const manifest = await manager.getManifest()
      
      expect(manifest).toEqual(mockManifest)
    })

    it('returns null on fetch error', async () => {
      const manager = new LibraryManager()
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      
      const manifest = await manager.getManifest()
      
      expect(manifest).toBeNull()
      consoleSpy.mockRestore()
    })

    it('returns null on non-ok response', async () => {
      const manager = new LibraryManager()
      global.fetch = vi.fn().mockResolvedValue({ ok: false })
      
      const manifest = await manager.getManifest()
      
      expect(manifest).toBeNull()
    })
  })

  describe('LIBRARY_DEFINITIONS', () => {
    it('exports library definitions', () => {
      expect(LIBRARY_DEFINITIONS).toBeDefined()
      expect(LIBRARY_DEFINITIONS.MCAD).toBeDefined()
      expect(LIBRARY_DEFINITIONS.MCAD.id).toBe('MCAD')
    })
  })
})
