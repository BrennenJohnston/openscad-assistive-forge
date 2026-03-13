/**
 * Unit tests for startup default values.
 *
 * Verifies:
 *   - UIModeController defaults to 'basic' mode when no saved preference exists
 *   - UIModeController restores 'advanced' mode when saved preference is 'advanced'
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UIModeController } from '../../src/js/ui-mode-controller.js';

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

  it('defaults to "basic" mode when localStorage is empty', () => {
    const controller = new UIModeController();
    expect(controller.currentMode).toBe('basic');
  });

  it('defaults to "basic" mode when getMode() is called with no saved pref', () => {
    const controller = new UIModeController();
    expect(controller.getMode()).toBe('basic');
  });

  it('restores "advanced" mode from localStorage', () => {
    mockStorage['openscad-forge-ui-mode'] = JSON.stringify({ mode: 'advanced' });
    const controller = new UIModeController();
    expect(controller.currentMode).toBe('advanced');
  });

  it('restores "basic" mode from localStorage', () => {
    mockStorage['openscad-forge-ui-mode'] = JSON.stringify({ mode: 'basic' });
    const controller = new UIModeController();
    expect(controller.currentMode).toBe('basic');
  });

  it('ignores invalid saved mode value and falls back to "basic"', () => {
    mockStorage['openscad-forge-ui-mode'] = JSON.stringify({ mode: 'invalid' });
    const controller = new UIModeController();
    expect(controller.currentMode).toBe('basic');
  });
});
