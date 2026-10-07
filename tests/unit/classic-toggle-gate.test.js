/**
 * Unit tests for the header Classic toggle's viewport gate.
 *
 * While the viewport is mobile-shaped the button that points into Classic
 * is removed rather than greyed out. The boundary is one predicate - the
 * same one the gate always used - so the button is present exactly when
 * pressing it would work, and absent otherwise.
 *
 * The way out of Classic is never gated, so a live Classic session keeps
 * its button at any viewport shape.
 *
 * classic-availability.js keeps listeners and a last-notified value at
 * module scope, so each test imports a fresh controller module tree.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../src/js/announcer.js', () => ({
  announceImmediate: vi.fn(),
}));

const REASON_TEXT =
  'Classic is desktop-only for now. A mobile version is planned. ' +
  'Use the Assistive Forge interface on phones and narrow windows.';

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

function buildToggleDom() {
  document.body.innerHTML = '';
  const btn = document.createElement('button');
  btn.id = 'classicModeToggle';
  btn.className = 'btn btn-sm btn-secondary classic-toggle hidden';
  const label = document.createElement('span');
  label.className = 'classic-label';
  label.textContent = 'Classic';
  btn.appendChild(label);
  document.body.appendChild(btn);
  const reason = document.createElement('span');
  reason.id = 'classicModeToggleReason';
  reason.className = 'sr-only';
  reason.textContent = REASON_TEXT;
  document.body.appendChild(reason);
  return btn;
}

async function freshController() {
  vi.resetModules();
  const { UIModeController } = await import(
    '../../src/js/ui-mode-controller.js'
  );
  const { announceImmediate } = await import('../../src/js/announcer.js');
  return { UIModeController, announceImmediate };
}

describe('Classic toggle viewport gate', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('removes the toggle on a phone-shaped viewport', async () => {
    setViewport(375, 812);
    const { UIModeController } = await freshController();
    const btn = buildToggleDom();

    const controller = new UIModeController();
    controller.init();

    expect(btn.classList.contains('hidden')).toBe(true);
    // The disabled-with-reason attributes must be gone, not merely unread: an
    // aria-describedby left on a removed control is an orphan pointing at
    // text nothing can reach.
    expect(btn.hasAttribute('aria-disabled')).toBe(false);
    expect(btn.hasAttribute('aria-describedby')).toBe(false);
  });

  it('shows the toggle, undecorated, on a desktop-shaped viewport', async () => {
    setViewport(1280, 800);
    const { UIModeController } = await freshController();
    const btn = buildToggleDom();

    const controller = new UIModeController();
    controller.init();

    expect(btn.classList.contains('hidden')).toBe(false);
    expect(btn.hasAttribute('aria-disabled')).toBe(false);
    expect(btn.hasAttribute('aria-describedby')).toBe(false);
    expect(btn.getAttribute('title')).toBe('Switch to Classic desktop layout');
  });

  it('never gates the way out: inside Classic the toggle stays on screen at phone shapes', async () => {
    setViewport(1280, 800);
    const { UIModeController } = await freshController();
    const btn = buildToggleDom();

    const controller = new UIModeController();
    controller.init();
    expect(controller.switchMode('classic')).toBe(true);

    setViewport(375, 812);
    controller._updateClassicToggleButton();
    expect(btn.classList.contains('hidden')).toBe(false);
    expect(btn.getAttribute('aria-label')).toBe(
      'Switch back to the Assistive Forge interface'
    );

    // Leaving works, and the button goes away once it points back in.
    controller.toggleClassic();
    expect(controller.getMode()).not.toBe('classic');
    expect(btn.classList.contains('hidden')).toBe(true);
  });

  it('reappears live when a resize makes the viewport desktop-shaped', async () => {
    setViewport(375, 812);
    const { UIModeController } = await freshController();
    const btn = buildToggleDom();

    const controller = new UIModeController();
    controller.init();
    expect(btn.classList.contains('hidden')).toBe(true);

    vi.useFakeTimers();
    try {
      setViewport(1280, 800);
      window.dispatchEvent(new Event('resize'));
      vi.runAllTimers();
      expect(btn.classList.contains('hidden')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('refuses out loud whenever a click arrives and Classic cannot be entered', async () => {
    setViewport(375, 812);
    const { UIModeController, announceImmediate } = await freshController();
    const btn = buildToggleDom();

    const controller = new UIModeController();
    controller.init();
    const modeBefore = controller.getMode();

    // The refusal asks the gate, not aria-disabled: the attribute is never
    // set while the button is removed, and switchMode's own refusal is
    // silent, so keying off the attribute would drop the spoken message. The
    // announcement survives however the click arrives: a script, a ?uiMode=
    // deep link, or a future change that puts the button back on screen while
    // entry is closed. No attribute is set here, on purpose.
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(controller.getMode()).toBe(modeBefore);
    expect(announceImmediate).toHaveBeenCalledWith(
      `Classic unavailable. ${REASON_TEXT}`
    );
  });

  it('leaves the saved Classic preference alone while the viewport defers it', async () => {
    localStorage.setItem(
      'openscad-forge-ui-mode',
      JSON.stringify({ mode: 'classic', lastCustomMode: 'standard' })
    );
    setViewport(375, 812);
    const { UIModeController } = await freshController();
    buildToggleDom();

    const controller = new UIModeController();
    controller.init();

    // A boot race is not possible here: the
    // viewport is consulted synchronously in the constructor, before anything
    // mounts, so a phone boot can only ever land in a custom mode.
    expect(controller.getMode()).toBe('standard');
    expect(controller.isClassicDeferredByViewport()).toBe(true);

    controller.setClassicDensity('simplified');
    expect(JSON.parse(localStorage.getItem('openscad-forge-ui-mode')).mode).toBe(
      'classic'
    );
  });
});
