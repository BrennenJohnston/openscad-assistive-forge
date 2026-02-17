/**
 * Feature Flags Unit Tests
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  FLAGS,
  isEnabled,
  setUserPreference,
  clearUserPreference,
  getAllFlagStates,
  getConfigurableFlags,
  _internal,
} from '../../src/js/feature-flags.js';

describe('Feature Flags', () => {
  // Mock localStorage using Object.defineProperty for better compatibility
  let mockStorage = {};
  const originalLocalStorage = global.localStorage;

  beforeEach(() => {
    mockStorage = {};

    // Create a complete localStorage mock
    const localStorageMock = {
      getItem: vi.fn((key) => mockStorage[key] || null),
      setItem: vi.fn((key, value) => {
        mockStorage[key] = value;
      }),
      removeItem: vi.fn((key) => {
        delete mockStorage[key];
      }),
      clear: vi.fn(() => {
        mockStorage = {};
      }),
      key: vi.fn((index) => Object.keys(mockStorage)[index] || null),
      get length() {
        return Object.keys(mockStorage).length;
      },
    };

    // Replace localStorage globally
    Object.defineProperty(global, 'localStorage', {
      value: localStorageMock,
      writable: true,
      configurable: true,
    });

    // Mock window.location.search for URL override tests
    vi.stubGlobal('location', {
      search: '',
      origin: 'http://localhost',
      pathname: '/',
      hash: '',
    });
  });

  afterEach(() => {
    // Restore original localStorage
    Object.defineProperty(global, 'localStorage', {
      value: originalLocalStorage,
      writable: true,
      configurable: true,
    });
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('FLAGS definition', () => {
    it('should have required flag properties', () => {
      expect(FLAGS.expert_mode).toBeDefined();
      expect(FLAGS.vector_parameters).toBeDefined();
      expect(FLAGS.memory_monitoring).toBeDefined();
      expect(FLAGS.csp_reporting).toBeDefined();
    });

    it('should have consistent structure for all flags', () => {
      for (const [id, flag] of Object.entries(FLAGS)) {
        expect(flag.id).toBe(id);
        expect(typeof flag.name).toBe('string');
        expect(typeof flag.description).toBe('string');
        expect(typeof flag.default).toBe('boolean');
        expect(typeof flag.rollout).toBe('number');
        expect(flag.rollout).toBeGreaterThanOrEqual(0);
        expect(flag.rollout).toBeLessThanOrEqual(100);
        expect(typeof flag.userConfigurable).toBe('boolean');
      }
    });
  });

  describe('isEnabled', () => {
    it('should return false for unknown flags', () => {
      expect(isEnabled('unknown_flag')).toBe(false);
    });

    it('should return true for flags with full rollout enabled', () => {
      // expert_mode has rollout: 100 and default: true (enabled for production)
      expect(isEnabled('expert_mode')).toBe(true);
    });

    it('should return true for flags with 100% rollout', () => {
      // memory_monitoring has rollout: 100
      expect(isEnabled('memory_monitoring')).toBe(true);
    });

    it('should respect user preference for configurable flags', () => {
      // Set user preference
      setUserPreference('expert_mode', true);

      expect(isEnabled('expert_mode')).toBe(true);

      // Toggle off
      setUserPreference('expert_mode', false);
      expect(isEnabled('expert_mode')).toBe(false);
    });

    it('should not allow user preference for non-configurable flags', () => {
      const result = setUserPreference('vector_parameters', true);
      expect(result).toBe(false);
    });

    it('should respect URL override over user preference', () => {
      // Set user preference
      setUserPreference('expert_mode', false);

      // Set URL override
      vi.stubGlobal('location', {
        search: '?flag_expert_mode=true',
        origin: 'http://localhost',
        pathname: '/',
        hash: '',
      });

      expect(isEnabled('expert_mode')).toBe(true);
    });
  });

  describe('URL overrides', () => {
    it('should parse true values correctly', () => {
      vi.stubGlobal('location', {
        search: '?flag_expert_mode=true',
        origin: 'http://localhost',
        pathname: '/',
        hash: '',
      });

      expect(_internal.getUrlOverride('expert_mode')).toBe(true);
    });

    it('should parse 1 as true', () => {
      vi.stubGlobal('location', {
        search: '?flag_expert_mode=1',
        origin: 'http://localhost',
        pathname: '/',
        hash: '',
      });

      expect(_internal.getUrlOverride('expert_mode')).toBe(true);
    });

    it('should parse false values correctly', () => {
      vi.stubGlobal('location', {
        search: '?flag_memory_monitoring=false',
        origin: 'http://localhost',
        pathname: '/',
        hash: '',
      });

      expect(_internal.getUrlOverride('memory_monitoring')).toBe(false);
    });

    it('should parse 0 as false', () => {
      vi.stubGlobal('location', {
        search: '?flag_memory_monitoring=0',
        origin: 'http://localhost',
        pathname: '/',
        hash: '',
      });

      expect(_internal.getUrlOverride('memory_monitoring')).toBe(false);
    });

    it('should return null for missing parameters', () => {
      vi.stubGlobal('location', {
        search: '?other_param=value',
        origin: 'http://localhost',
        pathname: '/',
        hash: '',
      });

      expect(_internal.getUrlOverride('expert_mode')).toBe(null);
    });
  });

  describe('setUserPreference', () => {
    it('should save preference for configurable flags', () => {
      const result = setUserPreference('expert_mode', true);

      expect(result).toBe(true);
      // Verify localStorage.setItem was called
      expect(localStorage.setItem).toHaveBeenCalled();

      // Get the stored value from mockStorage
      const storedValue = mockStorage[_internal.STORAGE_KEY];
      expect(storedValue).toBeDefined();

      const prefs = JSON.parse(storedValue);
      expect(prefs.expert_mode).toBe(true);
    });

    it('should reject unknown flags', () => {
      const result = setUserPreference('unknown_flag', true);
      expect(result).toBe(false);
    });

    it('should reject non-configurable flags', () => {
      const result = setUserPreference('csp_reporting', false);
      expect(result).toBe(false);
    });
  });

  describe('clearUserPreference', () => {
    it('should remove preference from storage', () => {
      // Set preference first
      setUserPreference('expert_mode', true);

      // Clear it
      clearUserPreference('expert_mode');

      // The storage should still have the key but without expert_mode
      const storedValue = mockStorage[_internal.STORAGE_KEY];
      const prefs = storedValue ? JSON.parse(storedValue) : {};
      expect(prefs.expert_mode).toBeUndefined();
    });
  });

  describe('getAllFlagStates', () => {
    it('should return state for all flags', () => {
      const states = getAllFlagStates();

      expect(Object.keys(states)).toHaveLength(Object.keys(FLAGS).length);

      for (const [id, state] of Object.entries(states)) {
        expect(state.flag).toBe(FLAGS[id]);
        expect(typeof state.enabled).toBe('boolean');
        expect(['default', 'user', 'url', 'rollout', 'full_rollout']).toContain(
          state.source
        );
      }
    });

    it('should indicate source correctly', () => {
      setUserPreference('expert_mode', true);

      const states = getAllFlagStates();

      expect(states.expert_mode.source).toBe('user');
      expect(states.memory_monitoring.source).toBe('full_rollout');
    });
  });

  describe('getConfigurableFlags', () => {
    it('should return only user-configurable flags', () => {
      const configurable = getConfigurableFlags();

      expect(configurable.length).toBeGreaterThan(0);
      for (const flag of configurable) {
        expect(flag.userConfigurable).toBe(true);
      }
    });

    it('should not include non-configurable flags', () => {
      const configurable = getConfigurableFlags();

      const ids = configurable.map((f) => f.id);
      expect(ids).not.toContain('csp_reporting');
      expect(ids).not.toContain('vector_parameters');
    });
  });

  describe('cyrb53 hash function', () => {
    it('should produce deterministic output', () => {
      const hash1 = _internal.cyrb53('test-string');
      const hash2 = _internal.cyrb53('test-string');

      expect(hash1).toBe(hash2);
    });

    it('should produce different output for different inputs', () => {
      const hash1 = _internal.cyrb53('test-string-1');
      const hash2 = _internal.cyrb53('test-string-2');

      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty string', () => {
      const hash = _internal.cyrb53('');
      expect(typeof hash).toBe('number');
    });
  });

  describe('hashToBucket', () => {
    it('should return values between 0 and 99', () => {
      for (let i = 0; i < 100; i++) {
        const bucket = _internal.hashToBucket(`user-${i}`, 'test_flag');
        expect(bucket).toBeGreaterThanOrEqual(0);
        expect(bucket).toBeLessThan(100);
      }
    });

    it('should be deterministic', () => {
      const bucket1 = _internal.hashToBucket('user-123', 'expert_mode');
      const bucket2 = _internal.hashToBucket('user-123', 'expert_mode');

      expect(bucket1).toBe(bucket2);
    });
  });

  describe('getUserId', () => {
    it('should generate and store user ID', () => {
      const id1 = _internal.getUserId();
      const id2 = _internal.getUserId();

      expect(id1).toBe(id2);
      expect(id1).toMatch(/^user-\d+-[a-z0-9]+$/);
    });

    it('should persist user ID across calls', () => {
      const id = _internal.getUserId();
      // Verify setItem was called
      expect(localStorage.setItem).toHaveBeenCalled();
      // Verify the ID was stored
      const storedId = mockStorage[_internal.USER_ID_KEY];
      expect(storedId).toBe(id);
    });
  });
});
