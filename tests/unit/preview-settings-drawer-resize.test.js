/**
 * Tests for preview settings drawer resize persistence.
 *
 * The window-resize handler in preview-settings-drawer.js must not call
 * expand() unconditionally whenever the viewport crosses from mobile to
 * desktop width: that would ignore the user's saved collapsed preference
 * in localStorage. Before calling expand() it re-reads
 * loadCollapsedState() and only auto-expands if the returned value is not
 * `true` (i.e. the user has not explicitly chosen to keep the drawer
 * collapsed).
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  initPreviewSettingsDrawer,
  loadSettingsShare,
  SETTINGS_SHEET_CAP,
  settingsSheetBounds,
  settingsSheetPx,
} from '../../src/js/preview-settings-drawer.js';

// Must match the key produced by getDrawerStateKey('preview-settings')
const STORAGE_KEY = 'openscad-drawer-preview-settings-state';

function buildDOM() {
  const toggleBtn = document.createElement('button');
  toggleBtn.id = 'previewDrawerToggle';
  const section = document.createElement('div');
  section.id = 'previewInfoSection';
  document.body.appendChild(toggleBtn);
  document.body.appendChild(section);
  return { toggleBtn, section };
}

function setViewportWidth(px) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: px,
  });
}

function triggerResize() {
  window.dispatchEvent(new Event('resize'));
}

describe('Preview settings drawer resize persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('does not auto-expand when user explicitly collapsed it and viewport widens to desktop', () => {
    vi.useFakeTimers();
    try {
      buildDOM();
      setViewportWidth(1024);
      localStorage.setItem(STORAGE_KEY, 'true'); // user explicitly collapsed

      const ctrl = initPreviewSettingsDrawer();
      expect(ctrl.isExpanded()).toBe(false); // starts collapsed per saved preference

      // Remain at desktop width — resize fires (e.g. toolbars/scrollbars shift)
      triggerResize();
      vi.runAllTimers();

      // User choice must be preserved — no auto-expand
      expect(ctrl.isExpanded()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('auto-expands on desktop when no saved preference exists (new-user default)', () => {
    vi.useFakeTimers();
    try {
      buildDOM();
      setViewportWidth(375); // start as mobile
      // No localStorage entry — new user

      const ctrl = initPreviewSettingsDrawer();
      expect(ctrl.isExpanded()).toBe(false); // mobile default: collapsed

      setViewportWidth(1024);
      triggerResize();
      vi.runAllTimers();

      // No preference saved → should auto-expand on desktop
      expect(ctrl.isExpanded()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('auto-expands on desktop when user previously explicitly expanded (savedState=false)', () => {
    vi.useFakeTimers();
    try {
      buildDOM();
      setViewportWidth(375); // start as mobile
      localStorage.setItem(STORAGE_KEY, 'false'); // user previously expanded on desktop

      const ctrl = initPreviewSettingsDrawer();
      // On mobile the initial logic still collapses regardless of savedState
      expect(ctrl.isExpanded()).toBe(false);

      setViewportWidth(1024);
      triggerResize();
      vi.runAllTimers();

      // savedState is 'false' (explicitly expanded) → auto-expand
      expect(ctrl.isExpanded()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('preserves user-collapsed choice through a mobile round-trip', () => {
    vi.useFakeTimers();
    try {
      buildDOM();
      setViewportWidth(1024);
      localStorage.setItem(STORAGE_KEY, 'false'); // start expanded
      const ctrl = initPreviewSettingsDrawer();
      expect(ctrl.isExpanded()).toBe(true);

      // User collapses manually on desktop
      ctrl.collapse();
      expect(ctrl.isExpanded()).toBe(false);
      // collapse() called saveCollapsedState(true) → localStorage is now 'true'
      expect(localStorage.getItem(STORAGE_KEY)).toBe('true');

      // Viewport shrinks to mobile — already collapsed, no state change
      setViewportWidth(375);
      triggerResize();
      vi.runAllTimers();
      expect(ctrl.isExpanded()).toBe(false);

      // Viewport widens back to desktop — user preference must still hold
      setViewportWidth(1024);
      triggerResize();
      vi.runAllTimers();
      expect(ctrl.isExpanded()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('collapses automatically when viewport shrinks from desktop to mobile', () => {
    vi.useFakeTimers();
    try {
      buildDOM();
      setViewportWidth(1024);
      localStorage.setItem(STORAGE_KEY, 'false'); // explicitly expanded
      const ctrl = initPreviewSettingsDrawer();
      expect(ctrl.isExpanded()).toBe(true);

      setViewportWidth(375);
      triggerResize();
      vi.runAllTimers();

      expect(ctrl.isExpanded()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

// On a phone held upright the settings are a sheet over the preview: its
// height is kept as a share of the screen's height, within a floor (its
// title row and one control) and a ceiling (the bar's top), and the grip on
// its bottom edge moves it by keys as the Customizer's grip does.
describe("the phone settings sheet's height", () => {
  const HEIGHT_KEY = 'openscad-forge-phone-settings-height';
  const rootVar = (name) =>
    document.documentElement.style.getPropertyValue(name).trim();

  function buildPhoneDOM() {
    document.body.innerHTML = `
      <button id="previewDrawerToggle" aria-expanded="false"></button>
      <div id="previewInfoSection" class="preview-info-section">
        <div class="preview-drawer-header"></div>
        <div class="preview-info-content" id="previewInfoContent">
          <div class="preview-settings-panel">
            <div class="preview-settings-header">Preview Settings</div>
          </div>
        </div>
        <div id="settingsHeightGrip" role="separator" tabindex="0" hidden></div>
      </div>
      <div class="customizer-glass" data-sheet="settings" hidden></div>`;
  }

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('style');
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 412,
    });
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      writable: true,
      value: 915,
    });
    window.matchMedia = () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    });
  });

  afterEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
    delete window.matchMedia;
  });

  it('stays between its floor and the bar, at most the screen', () => {
    expect(
      settingsSheetBounds({
        top: 186,
        viewportHeight: 915,
        barReserved: 54,
        floor: 96,
      })
    ).toEqual({ min: 96, max: 675 });
    // A floor taller than the room: the room wins.
    expect(
      settingsSheetBounds({
        top: 800,
        viewportHeight: 915,
        barReserved: 54,
        floor: 96,
      })
    ).toEqual({ min: 61, max: 61 });
  });

  it('opens as tall as its controls, at most 40% of the screen, when nothing is kept', () => {
    expect(SETTINGS_SHEET_CAP).toBe(0.4);
    const bounds = { min: 96, max: 675 };
    expect(settingsSheetPx(null, bounds, 915, Math.min(817, 0.4 * 915))).toBe(
      366
    );
    expect(settingsSheetPx(null, bounds, 915, Math.min(200, 0.4 * 915))).toBe(
      200
    );
    // A kept share wins, within the bounds.
    expect(settingsSheetPx(0.5, bounds, 915, 366)).toBe(458);
    expect(settingsSheetPx(0.05, bounds, 915, 366)).toBe(96);
    expect(settingsSheetPx(1, bounds, 915, 366)).toBe(675);
  });

  it('keeps the height as a share of the screen, and ignores a bad value', () => {
    expect(loadSettingsShare()).toBeNull();
    localStorage.setItem(HEIGHT_KEY, '0.3');
    expect(loadSettingsShare()).toBe(0.3);
    localStorage.setItem(HEIGHT_KEY, 'tall');
    expect(loadSettingsShare()).toBeNull();
  });

  it("the grip's keys move it up and down, and the height is kept", () => {
    buildPhoneDOM();
    // A height kept from before, so the steps below start from 30%.
    localStorage.setItem(HEIGHT_KEY, '0.3');
    const ctrl = initPreviewSettingsDrawer();
    ctrl.expand();
    expect(ctrl.isExpanded()).toBe(true);
    const grip = document.getElementById('settingsHeightGrip');
    expect(grip.hidden).toBe(false);
    expect(rootVar('--phone-settings-height')).toBe('275px');
    expect(grip.getAttribute('aria-valuenow')).toBe('30');
    expect(grip.getAttribute('aria-valuetext')).toBe(
      "Preview Settings 30% of the screen's height"
    );

    const press = (key, shiftKey = false) =>
      grip.dispatchEvent(
        new KeyboardEvent('keydown', { key, shiftKey, bubbles: true })
      );
    press('ArrowDown');
    // 2% of 915 px is 18.3 px.
    expect(rootVar('--phone-settings-height')).toBe('293px');
    expect(Number(localStorage.getItem(HEIGHT_KEY))).toBeCloseTo(293 / 915, 3);
    press('ArrowUp', true);
    expect(rootVar('--phone-settings-height')).toBe('247px');
    // jsdom lays nothing out: the floor is one touch target, the ceiling
    // the whole screen.
    press('Home');
    expect(rootVar('--phone-settings-height')).toBe('44px');
    press('End');
    expect(rootVar('--phone-settings-height')).toBe('915px');
    expect(grip.getAttribute('aria-valuenow')).toBe('100');

    // A key the grip does not use is left alone.
    const tab = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    });
    grip.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(false);

    // Escape on the grip closes the sheet and focuses its button.
    grip.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    );
    expect(ctrl.isExpanded()).toBe(false);
    expect(document.activeElement.id).toBe('previewDrawerToggle');
    expect(grip.hidden).toBe(true);
  });
});
