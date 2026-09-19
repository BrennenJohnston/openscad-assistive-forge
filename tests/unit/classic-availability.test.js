/**
 * Unit tests for the U-10 viewport gate (UF-5 P1).
 *
 * The predicate: desktop-shaped means width >= 1024 AND not portrait
 * (height <= width). Tested at the real breakpoints (1024/1023), in both
 * orientations, and through the debounced resize/orientationchange
 * subscription. The module holds window listeners and a last-notified
 * value at module scope, so every test re-imports a fresh copy.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

async function freshModule() {
  vi.resetModules();
  return import('../../src/js/classic-availability.js');
}

describe('classic-availability predicate', () => {
  it('accepts the 1024px boundary itself in landscape', async () => {
    setViewport(1024, 768);
    const mod = await freshModule();
    expect(mod.isViewportDesktopShaped()).toBe(true);
  });

  it('rejects one pixel below the boundary', async () => {
    setViewport(1023, 768);
    const mod = await freshModule();
    expect(mod.isViewportDesktopShaped()).toBe(false);
  });

  it('rejects a portrait viewport even when it is wide enough (the Q-25 trade)', async () => {
    setViewport(1080, 1920);
    const mod = await freshModule();
    expect(mod.isViewportDesktopShaped()).toBe(false);
  });

  it('accepts a common desktop landscape viewport', async () => {
    setViewport(1920, 1080);
    const mod = await freshModule();
    expect(mod.isViewportDesktopShaped()).toBe(true);
  });

  it('accepts a square viewport (square is not portrait)', async () => {
    setViewport(1024, 1024);
    const mod = await freshModule();
    expect(mod.isViewportDesktopShaped()).toBe(true);
  });

  it('rejects a phone in portrait', async () => {
    setViewport(375, 812);
    const mod = await freshModule();
    expect(mod.isViewportDesktopShaped()).toBe(false);
  });

  it('rejects a phone in landscape (the width floor still gates)', async () => {
    setViewport(812, 375);
    const mod = await freshModule();
    expect(mod.isViewportDesktopShaped()).toBe(false);
  });

  it('exports the breakpoint Classic layout and gate agree on', async () => {
    const mod = await freshModule();
    expect(mod.CLASSIC_MIN_WIDTH_PX).toBe(1024);
  });
});

describe('classic-availability subscription', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('does not call back at subscribe time', async () => {
    setViewport(1280, 800);
    const mod = await freshModule();
    const spy = vi.fn();
    mod.subscribeViewportShape(spy);
    vi.runAllTimers();
    expect(spy).not.toHaveBeenCalled();
  });

  it('notifies once, with false, when the viewport turns mobile-shaped', async () => {
    setViewport(1280, 800);
    const mod = await freshModule();
    const spy = vi.fn();
    mod.subscribeViewportShape(spy);

    setViewport(375, 812);
    window.dispatchEvent(new Event('resize'));
    vi.runAllTimers();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(false);
  });

  it('notifies once, with true, when the viewport turns desktop-shaped', async () => {
    setViewport(375, 812);
    const mod = await freshModule();
    const spy = vi.fn();
    mod.subscribeViewportShape(spy);

    setViewport(1280, 800);
    window.dispatchEvent(new Event('resize'));
    vi.runAllTimers();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(true);
  });

  it('debounces a burst of resize events into a single notification', async () => {
    setViewport(1280, 800);
    const mod = await freshModule();
    const spy = vi.fn();
    mod.subscribeViewportShape(spy);

    setViewport(900, 800);
    window.dispatchEvent(new Event('resize'));
    setViewport(700, 800);
    window.dispatchEvent(new Event('resize'));
    setViewport(375, 812);
    window.dispatchEvent(new Event('resize'));
    vi.runAllTimers();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(false);
  });

  it('stays silent when a resize does not change the answer', async () => {
    setViewport(1280, 800);
    const mod = await freshModule();
    const spy = vi.fn();
    mod.subscribeViewportShape(spy);

    setViewport(1600, 900);
    window.dispatchEvent(new Event('resize'));
    vi.runAllTimers();

    expect(spy).not.toHaveBeenCalled();
  });

  it('reacts to orientationchange (a rotation, no resize event needed)', async () => {
    setViewport(1280, 800);
    const mod = await freshModule();
    const spy = vi.fn();
    mod.subscribeViewportShape(spy);

    setViewport(800, 1280);
    window.dispatchEvent(new Event('orientationchange'));
    vi.runAllTimers();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(false);
  });

  it('stops notifying after unsubscribe', async () => {
    setViewport(1280, 800);
    const mod = await freshModule();
    const spy = vi.fn();
    const unsubscribe = mod.subscribeViewportShape(spy);
    unsubscribe();

    setViewport(375, 812);
    window.dispatchEvent(new Event('resize'));
    vi.runAllTimers();

    expect(spy).not.toHaveBeenCalled();
  });

  it('keeps other subscribers alive when one throws', async () => {
    setViewport(1280, 800);
    const mod = await freshModule();
    const errorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const bad = vi.fn(() => {
      throw new Error('boom');
    });
    const good = vi.fn();
    mod.subscribeViewportShape(bad);
    mod.subscribeViewportShape(good);

    setViewport(375, 812);
    window.dispatchEvent(new Event('resize'));
    vi.runAllTimers();

    expect(good).toHaveBeenCalledWith(false);
    expect(errorSpy).toHaveBeenCalled();
  });
});
