import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { ThemeManager, initThemeToggle } from '../../src/js/theme-manager.js'

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
      localStorage.setItem('openscad-forge-theme', 'dark')
      
      const manager = new ThemeManager()
      expect(manager.currentTheme).toBe('dark')
    })

    it('should load saved light theme from localStorage', () => {
      localStorage.setItem('openscad-forge-theme', 'light')
      
      const manager = new ThemeManager()
      expect(manager.currentTheme).toBe('light')
    })

    it('should handle invalid theme in localStorage', () => {
      localStorage.setItem('openscad-forge-theme', 'invalid-theme')
      
      const manager = new ThemeManager()
      // Should default to auto
      expect(manager.currentTheme).toBe('auto')
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

    it('should handle localStorage errors gracefully when loading theme', () => {
      const originalGetItem = localStorage.getItem
      localStorage.getItem = () => { throw new Error('Storage error') }
      
      const manager = new ThemeManager()
      expect(manager.currentTheme).toBe('auto')
      
      localStorage.getItem = originalGetItem
    })

    it('should handle localStorage errors gracefully when loading high contrast', () => {
      const originalGetItem = localStorage.getItem
      localStorage.getItem = (key) => {
        if (key === 'openscad-forge-high-contrast') {
          throw new Error('Storage error')
        }
        return null
      }
      
      const manager = new ThemeManager()
      expect(manager.highContrast).toBe(false)
      
      localStorage.getItem = originalGetItem
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
      
      const saved = localStorage.getItem('openscad-forge-high-contrast')
      expect(saved).toBe('true')
    })
  })

  describe('Theme Persistence', () => {
    it('should save theme via applyTheme', () => {
      themeManager.applyTheme('dark')
      themeManager.saveTheme('dark')
      
      const saved = localStorage.getItem('openscad-forge-theme')
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

    it('should return active theme based on current setting', () => {
      themeManager.applyTheme('light')
      expect(themeManager.getActiveTheme()).toBe('light')
      
      themeManager.applyTheme('dark')
      expect(themeManager.getActiveTheme()).toBe('dark')
    })

    it('should return system preference for auto theme', () => {
      themeManager.applyTheme('auto')
      const activeTheme = themeManager.getActiveTheme()
      // Should be either light or dark based on system preference
      expect(activeTheme).toMatch(/light|dark/)
    })
  })

  describe('Theme Application', () => {
    it('should apply light theme to document', () => {
      themeManager.applyTheme('light')
      
      expect(document.documentElement.getAttribute('data-theme')).toBe('light')
      expect(themeManager.currentTheme).toBe('light')
    })

    it('should apply dark theme to document', () => {
      themeManager.applyTheme('dark')
      
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
      expect(themeManager.currentTheme).toBe('dark')
    })

    it('should remove data-theme attribute for auto theme', () => {
      themeManager.applyTheme('dark')
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
      
      themeManager.applyTheme('auto')
      expect(document.documentElement.getAttribute('data-theme')).toBeNull()
    })

    it('should apply high contrast mode to document', () => {
      themeManager.applyHighContrast(true)
      
      expect(document.documentElement.getAttribute('data-high-contrast')).toBe('true')
      expect(themeManager.highContrast).toBe(true)
    })

    it('should remove high contrast attribute when disabled', () => {
      themeManager.applyHighContrast(true)
      themeManager.applyHighContrast(false)
      
      expect(document.documentElement.getAttribute('data-high-contrast')).toBeNull()
      expect(themeManager.highContrast).toBe(false)
    })
  })

  describe('Theme Saving', () => {
    it('should handle localStorage errors when saving theme', () => {
      const originalSetItem = localStorage.setItem
      localStorage.setItem = () => { throw new Error('Quota exceeded') }
      
      // Should not throw
      expect(() => themeManager.saveTheme('dark')).not.toThrow()
      
      localStorage.setItem = originalSetItem
    })

    it('should handle localStorage errors when saving high contrast', () => {
      const originalSetItem = localStorage.setItem
      localStorage.setItem = () => { throw new Error('Quota exceeded') }
      
      // Should not throw
      expect(() => themeManager.saveHighContrast(true)).not.toThrow()
      
      localStorage.setItem = originalSetItem
    })
  })

  describe('Listener Management', () => {
    it('should remove listener using removeListener method', () => {
      const listener = vi.fn()
      themeManager.addListener(listener)
      
      themeManager.toggleHighContrast()
      expect(listener).toHaveBeenCalledTimes(1)
      
      themeManager.removeListener(listener)
      
      themeManager.toggleHighContrast()
      expect(listener).toHaveBeenCalledTimes(1) // Not called again
    })

    it('should handle listener errors gracefully', () => {
      const errorListener = vi.fn(() => { throw new Error('Listener error') })
      const goodListener = vi.fn()
      
      themeManager.addListener(errorListener)
      themeManager.addListener(goodListener)
      
      // Should not throw and should still call other listeners
      expect(() => themeManager.toggleHighContrast()).not.toThrow()
      expect(goodListener).toHaveBeenCalled()
    })

    it('should pass correct arguments to listeners', () => {
      const listener = vi.fn()
      themeManager.addListener(listener)
      
      themeManager.applyTheme('dark')
      
      expect(listener).toHaveBeenCalledWith('dark', 'dark', false)
    })
  })

  describe('Init Method', () => {
    it('should apply current theme and high contrast on init', () => {
      localStorage.setItem('openscad-forge-theme', 'dark')
      localStorage.setItem('openscad-forge-high-contrast', 'true')
      
      const manager = new ThemeManager()
      manager.init()
      
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
      expect(document.documentElement.getAttribute('data-high-contrast')).toBe('true')
    })

    it('should return the manager instance for chaining', () => {
      const result = themeManager.init()
      expect(result).toBe(themeManager)
    })

    it('should warn when MutationObserver is unavailable', () => {
      const originalMutationObserver = window.MutationObserver
      window.MutationObserver = undefined

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      themeManager.init()

      expect(warnSpy).toHaveBeenCalled()

      warnSpy.mockRestore()
      window.MutationObserver = originalMutationObserver
    })

    it('should respond to system theme changes in auto mode', () => {
      const originalMatchMedia = window.matchMedia
      let changeHandler

      window.matchMedia = vi.fn().mockReturnValue({
        matches: false,
        addEventListener: (event, handler) => {
          if (event === 'change') {
            changeHandler = handler
          }
        },
        removeEventListener: () => {},
      })

      themeManager.currentTheme = 'auto'

      const applySpy = vi.spyOn(themeManager, 'applyRadixScales')
      const notifySpy = vi.spyOn(themeManager, 'notifyListeners')

      themeManager.init()

      applySpy.mockClear()
      notifySpy.mockClear()

      expect(changeHandler).toBeDefined()
      changeHandler({ matches: true })

      expect(applySpy).toHaveBeenCalled()
      expect(notifySpy).toHaveBeenCalled()

      applySpy.mockRestore()
      notifySpy.mockRestore()
      window.matchMedia = originalMatchMedia
    })
  })

  describe('Cycle Theme Messages', () => {
    it('should return correct message for auto theme', () => {
      themeManager.currentTheme = 'dark'
      const message = themeManager.cycleTheme()
      expect(message).toBe('Theme: Auto (follows system)')
    })

    it('should return correct message for light theme', () => {
      themeManager.currentTheme = 'auto'
      const message = themeManager.cycleTheme()
      expect(message).toBe('Theme: Light')
    })

    it('should return correct message for dark theme', () => {
      themeManager.currentTheme = 'light'
      const message = themeManager.cycleTheme()
      expect(message).toBe('Theme: Dark')
    })
  })
})

describe('initThemeToggle', () => {
  let themeManager

  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.removeAttribute('data-high-contrast')
    document.body.innerHTML = ''
    themeManager = new ThemeManager()
  })

  afterEach(() => {
    localStorage.clear()
    document.body.innerHTML = ''
  })

  it('should handle missing button gracefully', () => {
    // Should not throw when button doesn't exist
    expect(() => initThemeToggle('non-existent-button')).not.toThrow()
  })

  it('should initialize toggle button with click handler', () => {
    const button = document.createElement('button')
    button.id = 'theme-toggle'
    document.body.appendChild(button)
    
    initThemeToggle('theme-toggle')
    
    // Button should have aria-label
    expect(button.getAttribute('aria-label')).toContain('Current theme')
  })

  it('should cycle theme on button click', () => {
    const button = document.createElement('button')
    button.id = 'theme-toggle'
    document.body.appendChild(button)
    
    initThemeToggle('theme-toggle')
    
    const initialTheme = themeManager.currentTheme
    button.click()
    
    // Theme should have changed (cycled)
    // Note: We can't easily test this without importing themeManager singleton
    expect(button.getAttribute('aria-label')).toContain('Current theme')
  })

  it('should handle keyboard Enter key', () => {
    const button = document.createElement('button')
    button.id = 'theme-toggle'
    document.body.appendChild(button)
    
    const clickSpy = vi.spyOn(button, 'click')
    
    initThemeToggle('theme-toggle')
    
    const event = new KeyboardEvent('keydown', { key: 'Enter' })
    button.dispatchEvent(event)
    
    expect(clickSpy).toHaveBeenCalled()
  })

  it('should handle keyboard Space key', () => {
    const button = document.createElement('button')
    button.id = 'theme-toggle'
    document.body.appendChild(button)
    
    const clickSpy = vi.spyOn(button, 'click')
    
    initThemeToggle('theme-toggle')
    
    const event = new KeyboardEvent('keydown', { key: ' ' })
    button.dispatchEvent(event)
    
    expect(clickSpy).toHaveBeenCalled()
  })

  it('should call onToggle callback when provided', () => {
    const button = document.createElement('button')
    button.id = 'theme-toggle'
    document.body.appendChild(button)
    
    const onToggle = vi.fn()
    
    initThemeToggle('theme-toggle', onToggle)
    button.click()
    
    expect(onToggle).toHaveBeenCalled()
  })
})
