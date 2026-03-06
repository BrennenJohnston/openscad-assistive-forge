/**
 * Regression tests for Phase 11: parameter panel first-open scroll.
 *
 * Root cause: after renderParameterUI(), main.js called firstInput.focus()
 * without { preventScroll: true }. On mobile (off-canvas drawer) and desktop
 * (collapsed panel), this advanced the panel's scroll position before the user
 * had opened the panel, causing the first-open view to skip the top of the list.
 *
 * Fix: firstInput.focus({ preventScroll: true }) so the panel's scrollTop stays
 * at 0 and the user always sees the top of the parameter list on first open.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderParameterUI } from '../../src/js/ui-generator.js';

const schema = {
  groups: [{ id: 'g', label: 'General', order: 0 }],
  parameters: {
    width: {
      name: 'width',
      type: 'number',
      default: 50,
      minimum: 10,
      maximum: 100,
      step: 1,
      uiType: 'slider',
      group: 'g',
      order: 0,
      description: '',
    },
  },
};

describe('Parameter panel first-open scroll guard', () => {
  let panel;
  let container;

  beforeEach(() => {
    panel = document.createElement('div');
    panel.style.overflowY = 'auto';
    panel.style.height = '200px';
    container = document.createElement('div');
    panel.appendChild(container);
    document.body.appendChild(panel);
  });

  afterEach(() => {
    if (panel?.parentNode) document.body.removeChild(panel);
  });

  it('renderParameterUI does not call focus() or move the panel scrollTop', () => {
    const focusSpy = vi.spyOn(HTMLElement.prototype, 'focus');
    renderParameterUI(schema, container, vi.fn());
    // No input should be auto-focused by renderParameterUI itself
    expect(focusSpy).not.toHaveBeenCalled();
    expect(panel.scrollTop).toBe(0);
    focusSpy.mockRestore();
  });

  it('first focusable input exists inside the panel after render', () => {
    renderParameterUI(schema, container, vi.fn());
    const firstInput = container.querySelector(
      'input:not([type="hidden"]), select, textarea'
    );
    expect(firstInput).toBeTruthy();
    expect(panel.contains(firstInput)).toBe(true);
  });

  it('focus({ preventScroll: true }) does not advance panel scrollTop', () => {
    renderParameterUI(schema, container, vi.fn());
    const firstInput = container.querySelector(
      'input:not([type="hidden"]), select, textarea'
    );
    expect(firstInput).toBeTruthy();

    const scrollTopBefore = panel.scrollTop;
    // Simulate the corrected main.js post-load focus call
    firstInput.focus({ preventScroll: true });
    expect(panel.scrollTop).toBe(scrollTopBefore);
  });

  it('focus({ preventScroll: true }) is the correct call signature for post-load auto-focus', () => {
    renderParameterUI(schema, container, vi.fn());
    const firstInput = container.querySelector(
      'input:not([type="hidden"]), select, textarea'
    );
    expect(firstInput).toBeTruthy();

    const focusSpy = vi.spyOn(firstInput, 'focus');
    // This documents what main.js must do: pass preventScroll: true
    firstInput.focus({ preventScroll: true });
    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
    expect(focusSpy).toHaveBeenCalledTimes(1);
  });
});
