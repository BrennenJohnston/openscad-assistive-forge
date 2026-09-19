/**
 * Unit tests for the persisted-classic phone boot (U-10, UF-5 P4, Q-24a).
 *
 * A saved Classic preference on a mobile-shaped viewport boots Forge
 * Standard, marks the deferral, and PRESERVES the stored preference:
 * incidental writes (density flips) keep mode 'classic' in storage, while
 * an explicit real mode switch clears the deferral and wins. Entry via
 * switchMode('classic') is refused while mobile-shaped.
 *
 * classic-availability.js holds module-scope state, so each test imports
 * a fresh module tree.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../src/js/announcer.js', () => ({
  announceImmediate: vi.fn(),
}));

const KEY = 'openscad-forge-ui-mode';

function setViewport(width, height) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  });
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    writable: true,
    value: height,
  });
}

function storedPrefs() {
  return JSON.parse(localStorage.getItem(KEY));
}

async function freshController() {
  vi.resetModules();
  const { UIModeController } =
    await import('../../src/js/ui-mode-controller.js');
  return UIModeController;
}

describe('Persisted-classic boot behind the viewport gate', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('boots Standard on a phone and marks the deferral, storage untouched', async () => {
    setViewport(375, 812);
    localStorage.setItem(
      KEY,
      JSON.stringify({ mode: 'classic', lastCustomMode: 'standard' })
    );
    const UIModeController = await freshController();

    const controller = new UIModeController();

    expect(controller.getMode()).toBe('standard');
    expect(controller.isClassicDeferredByViewport()).toBe(true);
    expect(storedPrefs().mode).toBe('classic');
  });

  it('boots Classic on a desktop viewport with no deferral', async () => {
    setViewport(1280, 800);
    localStorage.setItem(
      KEY,
      JSON.stringify({ mode: 'classic', lastCustomMode: 'standard' })
    );
    const UIModeController = await freshController();

    const controller = new UIModeController();

    expect(controller.getMode()).toBe('classic');
    expect(controller.isClassicDeferredByViewport()).toBe(false);
  });

  it('keeps the stored classic through a density flip while deferred', async () => {
    setViewport(375, 812);
    localStorage.setItem(
      KEY,
      JSON.stringify({ mode: 'classic', lastCustomMode: 'standard' })
    );
    const UIModeController = await freshController();
    const controller = new UIModeController();

    controller.setClassicDensity('simplified');

    expect(storedPrefs().mode).toBe('classic');
    expect(storedPrefs().lastCustomMode).toBe('simplified');
    expect(controller.isClassicDeferredByViewport()).toBe(true);
  });

  it('lets an explicit real mode switch clear the deferral and win', async () => {
    setViewport(375, 812);
    localStorage.setItem(
      KEY,
      JSON.stringify({ mode: 'classic', lastCustomMode: 'standard' })
    );
    const UIModeController = await freshController();
    const controller = new UIModeController();

    expect(controller.switchMode('simplified')).toBe(true);

    expect(controller.isClassicDeferredByViewport()).toBe(false);
    expect(storedPrefs().mode).toBe('simplified');
  });

  it('refuses switchMode(classic) while the viewport is mobile-shaped', async () => {
    setViewport(375, 812);
    const UIModeController = await freshController();
    const controller = new UIModeController();

    expect(controller.switchMode('classic')).toBe(false);
    expect(controller.getMode()).not.toBe('classic');
  });

  it('importPreferences falls back to standard for classic on a phone', async () => {
    setViewport(375, 812);
    const UIModeController = await freshController();
    const controller = new UIModeController();

    controller.importPreferences(
      { defaultMode: 'classic' },
      { applyImmediately: false }
    );

    expect(controller.getMode()).toBe('standard');
  });

  it('no deferral when the classic_mode flag itself is off (silent fallback stays)', async () => {
    setViewport(375, 812);
    localStorage.setItem(
      KEY,
      JSON.stringify({ mode: 'classic', lastCustomMode: 'standard' })
    );
    vi.resetModules();
    vi.doMock('../../src/js/feature-flags.js', () => ({
      isEnabled: vi.fn(() => false),
    }));
    const { UIModeController } =
      await import('../../src/js/ui-mode-controller.js');

    const controller = new UIModeController();

    expect(controller.getMode()).toBe('standard');
    expect(controller.isClassicDeferredByViewport()).toBe(false);
    vi.doUnmock('../../src/js/feature-flags.js');
  });
});
