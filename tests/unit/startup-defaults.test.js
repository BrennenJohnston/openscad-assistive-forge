/**
 * Unit tests for startup default values.
 *
 * Verifies:
 *   - UIModeController defaults to 'simplified' mode when no saved preference exists
 *   - Saved modes are restored, with legacy names migrated
 *     ('basic' → 'simplified', 'advanced' → 'standard')
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  UIModeController,
  normalizeUiMode,
} from '../../src/js/ui-mode-controller.js';

describe('UIModeController — startup defaults', () => {
  let mockStorage = {};

  beforeEach(() => {
    mockStorage = {};
    const localStorageMock = {
      getItem: vi.fn((key) => mockStorage[key] ?? null),
      setItem: vi.fn((key, value) => {
        mockStorage[key] = value;
      }),
      removeItem: vi.fn((key) => {
        delete mockStorage[key];
      }),
      clear: vi.fn(() => {
        mockStorage = {};
      }),
      key: vi.fn((index) => Object.keys(mockStorage)[index] ?? null),
      get length() {
        return Object.keys(mockStorage).length;
      },
    };
    Object.defineProperty(global, 'localStorage', {
      value: localStorageMock,
      writable: true,
    });
  });

  it('defaults to "simplified" mode when localStorage is empty', () => {
    const controller = new UIModeController();
    expect(controller.currentMode).toBe('simplified');
  });

  it('defaults to "simplified" mode when getMode() is called with no saved pref', () => {
    const controller = new UIModeController();
    expect(controller.getMode()).toBe('simplified');
  });

  it('restores "standard" mode from localStorage', () => {
    mockStorage['openscad-forge-ui-mode'] = JSON.stringify({
      mode: 'standard',
    });
    const controller = new UIModeController();
    expect(controller.currentMode).toBe('standard');
  });

  it('migrates legacy "advanced" saved mode to "standard"', () => {
    mockStorage['openscad-forge-ui-mode'] = JSON.stringify({
      mode: 'advanced',
    });
    const controller = new UIModeController();
    expect(controller.currentMode).toBe('standard');
  });

  it('migrates legacy "basic" saved mode to "simplified"', () => {
    mockStorage['openscad-forge-ui-mode'] = JSON.stringify({ mode: 'basic' });
    const controller = new UIModeController();
    expect(controller.currentMode).toBe('simplified');
  });

  it('falls back to "standard" when saved "classic" mode is flag-disabled', () => {
    mockStorage['openscad-forge-ui-mode'] = JSON.stringify({
      mode: 'classic',
    });
    const controller = new UIModeController();
    expect(controller.currentMode).toBe(
      controller.isClassicAvailable() ? 'classic' : 'standard'
    );
  });

  it('ignores invalid saved mode value and falls back to "simplified"', () => {
    mockStorage['openscad-forge-ui-mode'] = JSON.stringify({ mode: 'invalid' });
    const controller = new UIModeController();
    expect(controller.currentMode).toBe('simplified');
  });
});

describe('normalizeUiMode', () => {
  it('passes through the three current modes', () => {
    expect(normalizeUiMode('simplified')).toBe('simplified');
    expect(normalizeUiMode('standard')).toBe('standard');
    expect(normalizeUiMode('classic')).toBe('classic');
  });

  it('maps legacy names', () => {
    expect(normalizeUiMode('basic')).toBe('simplified');
    expect(normalizeUiMode('advanced')).toBe('standard');
  });

  it('returns null for unrecognized values', () => {
    expect(normalizeUiMode('expert')).toBeNull();
    expect(normalizeUiMode('')).toBeNull();
    expect(normalizeUiMode(null)).toBeNull();
    expect(normalizeUiMode(42)).toBeNull();
  });
});
