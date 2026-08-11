/**
 * Unit tests for the header Classic toggle's U-10 viewport gate (UF-5 P2).
 *
 * The button is aria-disabled with a reason while the viewport is
 * mobile-shaped and it points INTO Classic; the way out of Classic is
 * never gated; a click while gated announces instead of switching; and
 * the availability subscription re-enables it live on resize.
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
  const { UIModeController } =
    await import('../../src/js/ui-mode-controller.js');
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

  it('marks the toggle disabled-with-reason on a phone-shaped viewport', async () => {
    setViewport(375, 812);
    const { UIModeController } = await freshController();
    const btn = buildToggleDom();

    const controller = new UIModeController();
    controller.init();

    expect(btn.getAttribute('aria-disabled')).toBe('true');
    expect(btn.getAttribute('aria-describedby')).toBe(
      'classicModeToggleReason'
    );
    expect(btn.getAttribute('title')).toContain('desktop-only for now');
    expect(btn.classList.contains('hidden')).toBe(false);
  });

  it('leaves the toggle fully enabled on a desktop-shaped viewport', async () => {
    setViewport(1280, 800);
    const { UIModeController } = await freshController();
    const btn = buildToggleDom();

    const controller = new UIModeController();
    controller.init();

    expect(btn.hasAttribute('aria-disabled')).toBe(false);
    expect(btn.hasAttribute('aria-describedby')).toBe(false);
  });

  it('announces the refusal instead of switching when clicked while gated', async () => {
    setViewport(375, 812);
    const { UIModeController, announceImmediate } = await freshController();
    const btn = buildToggleDom();

    const controller = new UIModeController();
    controller.init();
    const modeBefore = controller.getMode();

    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(controller.getMode()).toBe(modeBefore);
    expect(announceImmediate).toHaveBeenCalledWith(
      `Classic unavailable. ${REASON_TEXT}`
    );
  });

  it('never gates the way out: inside Classic the toggle stays enabled at phone shapes', async () => {
    setViewport(1280, 800);
    const { UIModeController } = await freshController();
    const btn = buildToggleDom();

    const controller = new UIModeController();
    controller.init();
    expect(controller.switchMode('classic')).toBe(true);

    setViewport(375, 812);
    controller._updateClassicToggleButton();
    expect(btn.hasAttribute('aria-disabled')).toBe(false);

    // Leaving works, and the button locks again once it points back in.
    controller.toggleClassic();
    expect(controller.getMode()).not.toBe('classic');
    expect(btn.getAttribute('aria-disabled')).toBe('true');
  });

  it('re-enables live when a resize makes the viewport desktop-shaped', async () => {
    setViewport(375, 812);
    const { UIModeController } = await freshController();
    const btn = buildToggleDom();

    const controller = new UIModeController();
    controller.init();
    expect(btn.getAttribute('aria-disabled')).toBe('true');

    vi.useFakeTimers();
    try {
      setViewport(1280, 800);
      window.dispatchEvent(new Event('resize'));
      vi.runAllTimers();
      expect(btn.hasAttribute('aria-disabled')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
