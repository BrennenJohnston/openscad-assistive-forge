/**
 * The workspace's combine through a (faked) flatten worker (DP-53).
 *
 * The other workspace file runs the combine inline, because jsdom has no
 * Worker. Here a Worker exists and the runner is a fake the test settles, so
 * what happens BETWEEN the start of a combine and its landing can be pinned:
 * DP-53 lets a person zoom the stand-in while the worker works, and PR #240's
 * board (Firefox 3/3, three of three) found the result landing with the
 * viewBox the pane held when the combine began, so two fingers did nothing.
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

describe('the combine through a worker (DP-53)', () => {
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

  it('★ a zoom made while the worker works outlives the picture it was made on', async () => {
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis());
    await ws.whenReady();
    // The open's combine is in flight, and the stand-in holds the pane.
    expect(runners).toHaveLength(1);
    expect(runners[0].isRunning()).toBe(true);
    const standIn = ws._root.querySelector('.svg-prep-result-pane svg');
    expect(standIn.classList.contains('svg-prep-standin')).toBe(true);
    const before = standIn.getAttribute('viewBox');

    // Two fingers, or the + button: the picture on screen zooms in.
    ws._root.querySelector('.svg-prep-result-pane .svg-prep-zoom-in').click();
    const zoomed = ws._root
      .querySelector('.svg-prep-result-pane svg')
      .getAttribute('viewBox');
    expect(zoomed).not.toBe(before);

    // Then the result lands.
    runners[0].settle(RESULT);
    await ws.whenCombined();
    await Promise.resolve();
    const picture = ws._root.querySelector('.svg-prep-result-pane svg');
    expect(picture.classList.contains('svg-prep-standin')).toBe(false);
    expect(picture.getAttribute('viewBox')).toBe(zoomed);
    ws.destroy();
  });
});
