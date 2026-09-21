/**
 * The customizer drawer and the drawing editor (DP-80, D-178).
 *
 * At phone width the drawer is a modal dialog with a focus trap. The editor
 * takes the preview area behind it, so a press on "Open the drawing editor"
 * or "Crop first" inside the drawer used to leave the drawer standing over
 * an editor nobody could see or reach. Now the drawer stands aside while the
 * editor is open and comes back when it closes, keeping the focus the
 * editor's host has just put inside it.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initDrawerController } from '../../src/js/drawer-controller.js';

function mountDrawer() {
  document.body.innerHTML = `
    <button id="mobileDrawerToggle" aria-expanded="false" aria-label="Open customizer panel">Customizer</button>
    <aside id="paramPanel" role="region" aria-label="Customizer">
      <h2 id="parameters-heading">Customizer</h2>
      <button id="drawerCloseBtn" class="hidden">Close</button>
      <button id="startBtn">Start conversion</button>
      <button id="cropBtn">Crop first</button>
    </aside>
    <div id="drawerBackdrop"></div>
    <div id="drawingEditorSurface" hidden></div>
  `;
}

describe('the customizer drawer stands aside for the drawing editor (DP-80, D-178)', () => {
  let widthBefore;

  beforeEach(() => {
    vi.useFakeTimers();
    widthBefore = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', {
      value: 412,
      configurable: true,
      writable: true,
    });
    mountDrawer();
    initDrawerController();
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(window, 'innerWidth', {
      value: widthBefore,
      configurable: true,
      writable: true,
    });
    document.body.innerHTML = '';
  });

  const drawer = () => document.getElementById('paramPanel');
  const toggle = () => document.getElementById('mobileDrawerToggle');
  const isOpen = () => drawer().classList.contains('drawer-open');

  it('★ closes when the editor opens and comes back when it closes, with the focus the host set', () => {
    toggle().click();
    vi.advanceTimersByTime(300);
    expect(isOpen()).toBe(true);
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    document.getElementById('cropBtn').focus();

    // The editor opens (the surface's own hook dispatches this).
    window.dispatchEvent(new CustomEvent('drawing-editor:open'));
    expect(isOpen()).toBe(false);
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(document.body.classList.contains('drawer-open')).toBe(false);

    // The host puts focus back on the button, then the editor says it closed.
    document.getElementById('cropBtn').focus();
    window.dispatchEvent(new CustomEvent('drawing-editor:close'));
    expect(isOpen()).toBe(true);
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    vi.advanceTimersByTime(300);
    expect(document.activeElement).toBe(document.getElementById('cropBtn'));
  });

  it('does nothing when the drawer was not open, and does not reopen a drawer the person closed', () => {
    window.dispatchEvent(new CustomEvent('drawing-editor:open'));
    expect(isOpen()).toBe(false);
    window.dispatchEvent(new CustomEvent('drawing-editor:close'));
    expect(isOpen()).toBe(false);

    toggle().click();
    vi.advanceTimersByTime(300);
    expect(isOpen()).toBe(true);
    document.getElementById('drawerCloseBtn').click();
    expect(isOpen()).toBe(false);
    window.dispatchEvent(new CustomEvent('drawing-editor:close'));
    expect(isOpen()).toBe(false);
  });

  it('is a desktop sidebar above the breakpoint: nothing to stand aside', () => {
    Object.defineProperty(window, 'innerWidth', {
      value: 1280,
      configurable: true,
      writable: true,
    });
    toggle().click();
    expect(isOpen()).toBe(false);
    window.dispatchEvent(new CustomEvent('drawing-editor:open'));
    window.dispatchEvent(new CustomEvent('drawing-editor:close'));
    expect(isOpen()).toBe(false);
  });
});
