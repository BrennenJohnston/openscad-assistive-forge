/**
 * The editor reopens where it was left (DP-81, D-175).
 *
 * Apply stores the combined drawing and the key of the choices it was made
 * from. A reopen that restores the same choices, at the same width, on the
 * same drawing paints the stored result and arms Apply at once, with no
 * combine at all; a stale key, a changed width, or the first change after
 * such a reopen combines as before. The runner is a fake, so a combine that
 * should not happen is a runner that was never asked.
 *
 * @license GPL-3.0-or-later
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../src/js/focus-trap.js', () => ({
  createDocumentFocusTrap: vi.fn(() => ({
    activate: vi.fn(),
    deactivate: vi.fn(),
    isActive: vi.fn(() => false),
  })),
}));
vi.mock('../../src/js/announcer.js', () => ({
  announce: vi.fn(),
  POLITENESS: { POLITE: 'polite', ASSERTIVE: 'assertive' },
}));
vi.mock('../../src/js/feature-flags.js', () => ({
  isEnabled: vi.fn(() => false),
}));

const runners = [];
vi.mock('../../src/js/flatten-runner.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    createFlattenRunner: vi.fn(() => {
      const runner = {
        pending: null,
        start: vi.fn(
          () =>
            new Promise((resolve, reject) => {
              runner.pending = { resolve, reject };
            })
        ),
        cancel: vi.fn(),
        isRunning: () => runner.pending !== null,
        destroy: vi.fn(),
        settle(svg) {
          const p = runner.pending;
          runner.pending = null;
          p.resolve({ svg, warnings: [], ms: 12 });
        },
      };
      runners.push(runner);
      return runner;
    }),
  };
});

import { createSvgPrepWorkspace } from '../../src/js/svg-preparer-workspace.js';

const SIMPLE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">' +
  '<circle cx="50" cy="50" r="20"/><circle cx="120" cy="50" r="20"/></svg>';

function makeAnalysis() {
  const doc = new DOMParser().parseFromString(SIMPLE_SVG, 'image/svg+xml');
  const circles = Array.from(doc.querySelectorAll('circle'));
  return {
    status: 'ready',
    confidence: 1,
    isCompoundPathOnly: false,
    elements: circles.map((el, i) => ({
      element: el,
      index: i,
      type: 'circle',
      pathData: `M${30 + i * 70},50 a20,20 0 1,0 40,0 a20,20 0 1,0 -40,0 z`,
      fill: '#000000',
      autoRole: 'foreground',
      warnings: [],
    })),
    warnings: [],
    unsupportedFeatures: [],
  };
}

const RESULT =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">' +
  '<path d="M10,10h20v20h-20z" fill="#000"/></svg>';

const startsAsked = () =>
  runners.reduce((n, r) => n + r.start.mock.calls.length, 0);

describe('the editor reopens where it was left (DP-81, D-175)', () => {
  let container;
  let realWorker;

  beforeEach(() => {
    realWorker = globalThis.Worker;
    globalThis.Worker = class FakeWorker {};
    runners.length = 0;
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    globalThis.Worker = realWorker;
    document.body.innerHTML = '';
  });

  /** Open once as a person would, take the key Apply would store, close. */
  async function keyFor(ws, callbacks) {
    ws.open(SIMPLE_SVG, makeAnalysis(), callbacks);
    await ws.whenReady();
    const key = ws.choicesKey();
    ws.dismiss();
    return key;
  }

  it('★ a matching key paints the stored result and arms Apply without asking for a combine', async () => {
    const ws = createSvgPrepWorkspace(container);
    const choices = { initialOverrides: ['foreground', 'ignore'], designWidthMm: 11.97 };
    const key = await keyFor(ws, choices);
    expect(typeof key).toBe('string');
    const asked = startsAsked();

    ws.open(SIMPLE_SVG, makeAnalysis(), {
      ...choices,
      initialResult: RESULT,
      initialResultKey: key,
    });
    await ws.whenReady();
    expect(startsAsked()).toBe(asked);
    expect(ws.getResult()).toBe(RESULT);
    expect(ws._refs.applyBtn.disabled).toBe(false);
    expect(ws.wasOpenedAsLeft()).toEqual({ on: 1, off: 1 });
    const picture = ws._root.querySelector('.svg-prep-result-pane svg');
    expect(picture.classList.contains('svg-prep-standin')).toBe(false);
    expect(picture.querySelector('path.svg-prep-result-ink')).not.toBeNull();
    // The restored choices stand as they were.
    expect(ws.getRoleOverrides()[1]).toBe('ignore');
    ws.destroy();
  });

  it('★ a stale key combines as before: a role, or the width, changed since Apply', async () => {
    const ws = createSvgPrepWorkspace(container);
    const key = await keyFor(ws, {
      initialOverrides: ['foreground', 'ignore'],
      designWidthMm: 11.97,
    });
    const asked = startsAsked();

    // The same drawing, one role different from the stored result's.
    ws.open(SIMPLE_SVG, makeAnalysis(), {
      initialOverrides: ['foreground', 'foreground'],
      designWidthMm: 11.97,
      initialResult: RESULT,
      initialResultKey: key,
    });
    await ws.whenReady();
    expect(startsAsked()).toBe(asked + 1);
    expect(ws.wasOpenedAsLeft()).toBeNull();
    expect(ws.getResult()).toBeNull();
    expect(ws._refs.applyBtn.disabled).toBe(true);
    ws.dismiss();

    // The same choices at another width (the charm's Scale moved): the
    // offsets are in millimeters, so the result is not the same drawing.
    ws.open(SIMPLE_SVG, makeAnalysis(), {
      initialOverrides: ['foreground', 'ignore'],
      designWidthMm: 14,
      initialResult: RESULT,
      initialResultKey: key,
    });
    await ws.whenReady();
    expect(startsAsked()).toBe(asked + 2);
    expect(ws.wasOpenedAsLeft()).toBeNull();
    ws.destroy();
  });

  it('the first change after a trusted reopen marks the pane stale and combines', async () => {
    const ws = createSvgPrepWorkspace(container);
    const choices = { initialOverrides: ['foreground', 'ignore'], designWidthMm: 11.97 };
    const key = await keyFor(ws, choices);
    const asked = startsAsked();
    ws.open(SIMPLE_SVG, makeAnalysis(), {
      ...choices,
      initialResult: RESULT,
      initialResultKey: key,
    });
    await ws.whenReady();
    expect(startsAsked()).toBe(asked);

    const radio = ws._root.querySelector(
      '.svg-prep-object input[type="radio"][value="foreground"]:not(:checked)'
    );
    expect(radio).not.toBeNull();
    radio.checked = true;
    radio.dispatchEvent(new Event('change', { bubbles: true }));
    expect(ws.getResult()).toBeNull();
    expect(ws._refs.applyBtn.disabled).toBe(true);
    await vi.waitFor(() => expect(startsAsked()).toBe(asked + 1), {
      timeout: 5000,
    });
    ws.destroy();
  });

  it('no stored result, or no key, is the ordinary open', async () => {
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(), { initialResult: RESULT });
    await ws.whenReady();
    expect(startsAsked()).toBe(1);
    expect(ws.wasOpenedAsLeft()).toBeNull();
    ws.destroy();
  });
});
