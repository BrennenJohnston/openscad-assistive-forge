/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ModeManager,
  getModeManager,
  resetModeManager,
} from '../../src/js/mode-manager.js';

// Mock feature flags module
vi.mock('../../src/js/feature-flags.js', () => ({
  isEnabled: vi.fn((flagId) => {
    // Enable expert_mode by default for tests
    if (flagId === 'expert_mode') return true;
    return false;
  }),
}));

describe('ModeManager', () => {
  let modeManager;
  let mockAnnounce;
  let mockOnModeChange;

  beforeEach(() => {
    // Clear localStorage
    localStorage.clear();

    // Reset singleton
    resetModeManager();

    // Create mocks
    mockAnnounce = vi.fn();
    mockOnModeChange = vi.fn();

    // Create a fresh instance
    modeManager = new ModeManager({
      announceToScreenReader: mockAnnounce,
      onModeChange: mockOnModeChange,
    });

    // Create screen reader announcer element
    const announcer = document.createElement('div');
    announcer.id = 'srAnnouncer';
    document.body.appendChild(announcer);
  });

  afterEach(() => {
    // Clean up DOM
    const announcer = document.getElementById('srAnnouncer');
    if (announcer) announcer.remove();

    // Reset mocks
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with standard mode', () => {
      expect(modeManager.getMode()).toBe('standard');
    });

    it('should initialize with auto preferred editor', () => {
      expect(modeManager.getPreferredEditor()).toBe('auto');
    });

    it('should load preferences from localStorage', () => {
      localStorage.setItem(
        'openscad-forge-mode-prefs',
        JSON.stringify({ preferredEditor: 'textarea' })
      );

      const newManager = new ModeManager();
      expect(newManager.getPreferredEditor()).toBe('textarea');
    });
  });

  describe('isExpertModeAvailable', () => {
    it('should return true when feature flag is enabled', () => {
      expect(modeManager.isExpertModeAvailable()).toBe(true);
    });
  });

  describe('switchMode', () => {
    it('should switch from standard to expert mode', () => {
      const result = modeManager.switchMode('expert');

      expect(result).toBe(true);
      expect(modeManager.getMode()).toBe('expert');
    });

    it('should switch from expert to standard mode', () => {
      modeManager.switchMode('expert');
      const result = modeManager.switchMode('standard');

      expect(result).toBe(true);
      expect(modeManager.getMode()).toBe('standard');
    });

    it('should return true when already in target mode', () => {
      const result = modeManager.switchMode('standard');

      expect(result).toBe(true);
      expect(modeManager.getMode()).toBe('standard');
    });

    it('should call onModeChange callback', () => {
      modeManager.switchMode('expert');

      expect(mockOnModeChange).toHaveBeenCalledWith('expert', 'standard');
    });

    it('should announce mode switch to screen reader', () => {
      modeManager.switchMode('expert');

      expect(mockAnnounce).toHaveBeenCalledWith(
        expect.stringContaining('Expert Mode')
      );
    });

    it('should skip announcement when option is set', () => {
      modeManager.switchMode('expert', { skipAnnouncement: true });

      expect(mockAnnounce).not.toHaveBeenCalled();
    });

    it('should notify subscribers of mode change', () => {
      const subscriber = vi.fn();
      modeManager.subscribe(subscriber);

      modeManager.switchMode('expert');

      expect(subscriber).toHaveBeenCalledWith('expert', 'standard');
    });

    it('should save mode to preferences', () => {
      modeManager.switchMode('expert');

      const prefs = JSON.parse(
        localStorage.getItem('openscad-forge-mode-prefs')
      );
      expect(prefs.lastMode).toBe('expert');
    });
  });

  describe('toggleMode', () => {
    it('should toggle from standard to expert', () => {
      const newMode = modeManager.toggleMode();

      expect(newMode).toBe('expert');
      expect(modeManager.getMode()).toBe('expert');
    });

    it('should toggle from expert to standard', () => {
      modeManager.switchMode('expert');
      const newMode = modeManager.toggleMode();

      expect(newMode).toBe('standard');
      expect(modeManager.getMode()).toBe('standard');
    });
  });

  describe('setPreferredEditor', () => {
    it('should set preferred editor to monaco', () => {
      modeManager.setPreferredEditor('monaco');

      expect(modeManager.getPreferredEditor()).toBe('monaco');
    });

    it('should set preferred editor to textarea', () => {
      modeManager.setPreferredEditor('textarea');

      expect(modeManager.getPreferredEditor()).toBe('textarea');
    });

    it('should set preferred editor to auto', () => {
      modeManager.setPreferredEditor('textarea');
      modeManager.setPreferredEditor('auto');

      expect(modeManager.getPreferredEditor()).toBe('auto');
    });

    it('should ignore invalid editor types', () => {
      modeManager.setPreferredEditor('invalid');

      expect(modeManager.getPreferredEditor()).toBe('auto');
    });

    it('should save preference to localStorage', () => {
      modeManager.setPreferredEditor('monaco');

      const prefs = JSON.parse(
        localStorage.getItem('openscad-forge-mode-prefs')
      );
      expect(prefs.preferredEditor).toBe('monaco');
    });
  });

  describe('resolveEditorType', () => {
    it('should return monaco when explicitly preferred', () => {
      modeManager.setPreferredEditor('monaco');

      expect(modeManager.resolveEditorType()).toBe('monaco');
    });

    it('should return textarea when explicitly preferred', () => {
      modeManager.setPreferredEditor('textarea');

      expect(modeManager.resolveEditorType()).toBe('textarea');
    });

    it('should auto-detect based on user preferences', () => {
      // Default auto mode
      const result = modeManager.resolveEditorType();

      // Should return either 'monaco' or 'textarea'
      expect(['monaco', 'textarea']).toContain(result);
    });
  });

  describe('subscribe', () => {
    it('should add subscriber', () => {
      const subscriber = vi.fn();
      modeManager.subscribe(subscriber);

      modeManager.switchMode('expert');

      expect(subscriber).toHaveBeenCalled();
    });

    it('should return unsubscribe function', () => {
      const subscriber = vi.fn();
      const unsubscribe = modeManager.subscribe(subscriber);

      unsubscribe();
      modeManager.switchMode('expert');

      expect(subscriber).not.toHaveBeenCalled();
    });

    it('should handle subscriber errors gracefully', () => {
      const errorSubscriber = vi.fn(() => {
        throw new Error('Test error');
      });
      const goodSubscriber = vi.fn();

      modeManager.subscribe(errorSubscriber);
      modeManager.subscribe(goodSubscriber);

      // Should not throw
      expect(() => modeManager.switchMode('expert')).not.toThrow();

      // Good subscriber should still be called
      expect(goodSubscriber).toHaveBeenCalled();
    });
  });

  describe('getModeState', () => {
    it('should return current mode state', () => {
      const state = modeManager.getModeState();

      expect(state).toEqual({
        currentMode: 'standard',
        preferredEditor: 'auto',
        expertModeAvailable: true,
      });
    });

    it('should reflect mode changes', () => {
      modeManager.switchMode('expert');
      modeManager.setPreferredEditor('textarea');

      const state = modeManager.getModeState();

      expect(state.currentMode).toBe('expert');
      expect(state.preferredEditor).toBe('textarea');
    });
  });

  describe('singleton', () => {
    it('should return same instance with getModeManager', () => {
      const instance1 = getModeManager();
      const instance2 = getModeManager();

      expect(instance1).toBe(instance2);
    });

    it('should create new instance after reset', () => {
      const instance1 = getModeManager();
      resetModeManager();
      const instance2 = getModeManager();

      expect(instance1).not.toBe(instance2);
    });
  });
});
