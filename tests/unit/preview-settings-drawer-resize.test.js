/**
 * Regression tests for Phase 12: preview settings drawer resize persistence.
 *
 * Root cause: the window-resize handler in preview-settings-drawer.js called
 * expand() unconditionally whenever the viewport crossed from mobile to desktop
 * width, ignoring the user's saved collapsed preference in localStorage. The
 * initial-state logic correctly checked loadCollapsedState(), but the resize
 * handler did not.
 *
 * Fix: before calling expand() in the resize handler, re-read loadCollapsedState().
 * Only auto-expand if the returned value is not `true` (i.e. the user has not
 * explicitly chosen to keep the drawer collapsed).
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initPreviewSettingsDrawer } from '../../src/js/preview-settings-drawer.js';

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

  it('does NOT auto-expand when user explicitly collapsed it and viewport widens to desktop', () => {
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
