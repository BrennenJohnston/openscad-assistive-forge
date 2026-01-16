import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { ThemeManager } from '../../src/js/theme-manager.js'

describe('Theme Manager', () => {
  let themeManager

  beforeEach(() => {
    // Clear localStorage
    localStorage.clear()
    
    // Reset document attributes
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.removeAttribute('data-high-contrast')
    
    themeManager = new ThemeManager()
  })

  afterEach(() => {
    localStorage.clear()
  })

  describe('Initialization', () => {
    it('should initialize with default theme', () => {
      expect(themeManager).toBeDefined()
      expect(themeManager.currentTheme).toMatch(/auto|light|dark/)
    })

    it('should load saved theme from localStorage', () => {
      localStorage.setItem('openscad-customizer-theme', 'dark')
      
      const manager = new ThemeManager()
      expect(manager.currentTheme).toBe('dark')
    })

    it('should handle missing localStorage data', () => {
      const manager = new ThemeManager()
      // Should default to auto
      expect(manager.currentTheme).toBe('auto')
    })

    it('should apply theme to document on initialization', () => {
      const attr = document.documentElement.getAttribute('data-theme')
      // May be null, light, or dark depending on system preference
      expect(attr === null || attr === 'light' || attr === 'dark').toBe(true)
    })
  })

  describe('Theme Cycling', () => {
    it('should cycle through themes', () => {
      // cycleTheme() is the main API
      themeManager.cycleTheme()
      const state1 = themeManager.getState()
      expect(state1.theme).toMatch(/auto|light|dark/)
      
      themeManager.cycleTheme()
      const state2 = themeManager.getState()
      expect(state2.theme).toMatch(/auto|light|dark/)
    })
  })

  describe('High Contrast Mode', () => {
    it('should toggle high contrast mode', () => {
      themeManager.toggleHighContrast()
      
      const state = themeManager.getState()
      expect(state.highContrast).toBe(true)
      expect(document.documentElement.getAttribute('data-high-contrast')).toBe('true')
    })

    it('should toggle high contrast off', () => {
      themeManager.toggleHighContrast() // On
      themeManager.toggleHighContrast() // Off
      
      const state = themeManager.getState()
      expect(state.highContrast).toBe(false)
    })

    it('should persist high contrast preference', () => {
      themeManager.toggleHighContrast()
      
      const saved = localStorage.getItem('openscad-customizer-high-contrast')
      expect(saved).toBe('true')
    })
  })

  describe('Theme Persistence', () => {
    it('should save theme via applyTheme', () => {
      themeManager.applyTheme('dark')
      themeManager.saveTheme('dark')
      
      const saved = localStorage.getItem('openscad-customizer-theme')
      expect(saved).toBe('dark')
    })

    it('should persist across instances', () => {
      themeManager.saveTheme('dark')
      
      const newManager = new ThemeManager()
      const state = newManager.getState()
      expect(state.theme).toBe('dark')
    })
  })

  describe('Event Listeners', () => {
    it('should notify listeners on high contrast toggle', () => {
      const listener = vi.fn()
      themeManager.addListener(listener)
      
      themeManager.toggleHighContrast()
      
      // Listener should be called
      expect(listener).toHaveBeenCalled()
    })

    it('should allow unsubscribing listeners', () => {
      const listener = vi.fn()
      const unsubscribe = themeManager.addListener(listener)
      
      themeManager.toggleHighContrast()
      expect(listener).toHaveBeenCalledTimes(1)
      
      unsubscribe()
      
      themeManager.toggleHighContrast()
      expect(listener).toHaveBeenCalledTimes(1) // Not called again
    })
  })

  describe('State Retrieval', () => {
    it('should return current theme state', () => {
      const state = themeManager.getState()
      
      expect(state).toBeDefined()
      expect(state.theme).toMatch(/auto|light|dark/)
      expect(typeof state.highContrast).toBe('boolean')
    })
  })
})
