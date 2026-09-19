/**
 * Keyboard Shortcuts Binder Unit Tests (MC-1)
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  applyAriaKeyshortcuts,
  toAriaKeyshortcut,
} from '../../src/js/keyboard-shortcuts-binder.js';
import { DEFAULT_SHORTCUTS } from '../../src/js/keyboard-config.js';

describe('toAriaKeyshortcut', () => {
  it('passes through function keys unchanged', () => {
    expect(toAriaKeyshortcut({ key: 'F6' })).toBe('F6');
  });

  it('normalizes ctrl to Control and uppercases letters', () => {
    expect(toAriaKeyshortcut({ key: 'e', ctrl: true })).toBe('Control+E');
  });

  it('orders modifiers Control, Alt, Shift, Meta', () => {
    expect(
      toAriaKeyshortcut({ key: 'x', ctrl: true, alt: true, shift: true })
    ).toBe('Control+Alt+Shift+X');
  });

  it('converts space to the Space key name', () => {
    expect(toAriaKeyshortcut({ key: ' ', shift: true })).toBe('Shift+Space');
  });

  it('keeps named keys like ArrowDown as-is', () => {
    expect(toAriaKeyshortcut({ key: 'ArrowDown', alt: true })).toBe(
      'Alt+ArrowDown'
    );
  });
});

describe('applyAriaKeyshortcuts', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <button id="primaryActionBtn">Generate</button>
      <button id="focusModeBtn">Focus</button>
      <button id="themeToggle">Theme</button>
      <button id="expertModeToggle">Expert</button>
      <input id="paramSearchInput" type="text" />
      <button class="camera-view-btn" data-view="top">Top</button>
      <button class="camera-view-btn" data-view="top">Top (mobile)</button>
    `;
  });

  it('applies default shortcuts with WAI-ARIA syntax', () => {
    applyAriaKeyshortcuts(DEFAULT_SHORTCUTS);

    expect(
      document.getElementById('focusModeBtn').getAttribute('aria-keyshortcuts')
    ).toBe('F');
    expect(
      document
        .getElementById('expertModeToggle')
        .getAttribute('aria-keyshortcuts')
    ).toBe('Control+E');
    expect(
      document.getElementById('themeToggle').getAttribute('aria-keyshortcuts')
    ).toBe('Control+Shift+T');
    expect(
      document
        .getElementById('paramSearchInput')
        .getAttribute('aria-keyshortcuts')
    ).toBe('Control+Shift+F');
  });

  it('combines multiple actions targeting the same element', () => {
    // render (F6) and download (F7) both live on the primary action button
    applyAriaKeyshortcuts(DEFAULT_SHORTCUTS);

    expect(
      document
        .getElementById('primaryActionBtn')
        .getAttribute('aria-keyshortcuts')
    ).toBe('F6 F7');
  });

  it('annotates every element matching a selector', () => {
    applyAriaKeyshortcuts(DEFAULT_SHORTCUTS);

    const viewButtons = document.querySelectorAll(
      '.camera-view-btn[data-view="top"]'
    );
    expect(viewButtons).toHaveLength(2);
    for (const btn of viewButtons) {
      expect(btn.getAttribute('aria-keyshortcuts')).toBe('Control+4');
    }
  });

  it('recomputes attributes when re-applied with re-mapped shortcuts', () => {
    applyAriaKeyshortcuts(DEFAULT_SHORTCUTS);
    expect(
      document.getElementById('focusModeBtn').getAttribute('aria-keyshortcuts')
    ).toBe('F');

    const remapped = {
      ...DEFAULT_SHORTCUTS,
      focusMode: { key: 'm', ctrl: true, description: 'Toggle focus mode' },
    };
    applyAriaKeyshortcuts(remapped);
    expect(
      document.getElementById('focusModeBtn').getAttribute('aria-keyshortcuts')
    ).toBe('Control+M');
  });

  it('skips actions whose elements are absent without throwing', () => {
    document.body.innerHTML = '<button id="focusModeBtn">Focus</button>';
    const count = applyAriaKeyshortcuts(DEFAULT_SHORTCUTS);
    expect(count).toBe(1);
  });
});
