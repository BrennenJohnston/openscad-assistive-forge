import { describe, it, expect, beforeEach, vi } from 'vitest'
import { detectLibraries, LibraryManager } from '../../src/js/library-manager.js'

describe('LibraryManager', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('detects library usage from include/use statements', () => {
    const scad = `
      include <MCAD/gear.scad>
      use <BOSL2/std.scad>
      include <dotSCAD/shape.scad>
    `
    const detected = detectLibraries(scad)
    expect(new Set(detected)).toEqual(new Set(['MCAD', 'BOSL2', 'dotSCAD']))
  })

  it('enables, disables, and toggles libraries', () => {
    const manager = new LibraryManager()
    manager.enable('MCAD')
    expect(manager.get('MCAD').enabled).toBe(true)

    manager.disable('MCAD')
    expect(manager.get('MCAD').enabled).toBe(false)

    manager.toggle('MCAD')
    expect(manager.get('MCAD').enabled).toBe(true)
  })

  it('ignores unknown library ids', () => {
    const manager = new LibraryManager()
    expect(() => manager.enable('UNKNOWN')).not.toThrow()
    expect(manager.get('UNKNOWN')).toBeNull()
  })

  it('persists library state to localStorage', () => {
    const manager = new LibraryManager()
    manager.enable('BOSL2')

    const stored = JSON.parse(localStorage.getItem('openscad-customizer-libraries'))
    expect(stored.BOSL2.enabled).toBe(true)
  })

  it('loads library state from localStorage', () => {
    localStorage.setItem(
      'openscad-customizer-libraries',
      JSON.stringify({ MCAD: { enabled: true }, BOSL2: { enabled: false } })
    )
    const manager = new LibraryManager()

    expect(manager.get('MCAD').enabled).toBe(true)
    expect(manager.get('BOSL2').enabled).toBe(false)
  })

  it('returns enabled libraries', () => {
    const manager = new LibraryManager()
    manager.enable('MCAD')
    manager.enable('BOSL2')

    const enabled = manager.getEnabled().map(lib => lib.id)
    expect(new Set(enabled)).toEqual(new Set(['MCAD', 'BOSL2']))
  })

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

  it('resets all libraries and notifies listeners', () => {
    const manager = new LibraryManager()
    manager.enable('MCAD')

    const listener = vi.fn()
    manager.subscribe(listener)

    manager.reset()

    expect(manager.getEnabled()).toHaveLength(0)
    expect(listener).toHaveBeenCalledWith('reset', null, undefined)
  })
})
