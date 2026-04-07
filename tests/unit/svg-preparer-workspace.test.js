/**
 * SVG Preparation Workspace — Unit tests
 *
 * Phase 2: Tests for createSvgPrepWorkspace DOM structure, ARIA attributes,
 * fullscreen toggle, close behavior, keyboard handling, and lifecycle.
 *
 * focus-trap and announcer are mocked because jsdom does not provide layout
 * dimensions needed for focus trapping, and has no live-region DOM elements.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockTrapActivate = vi.fn();
const mockTrapDeactivate = vi.fn();
const mockTrapIsActive = vi.fn(() => false);

vi.mock('../../src/js/focus-trap.js', () => ({
  createDocumentFocusTrap: vi.fn(() => ({
    activate: mockTrapActivate,
    deactivate: mockTrapDeactivate,
    isActive: mockTrapIsActive,
  })),
}));

vi.mock('../../src/js/announcer.js', () => ({
  announce: vi.fn(),
  POLITENESS: { POLITE: 'polite', ASSERTIVE: 'assertive' },
}));

vi.mock('../../src/js/feature-flags.js', () => ({
  isEnabled: vi.fn(() => false),
}));

import {
  createSvgPrepWorkspace,
  describeElement,
} from '../../src/js/svg-preparer-workspace.js';
import { createDocumentFocusTrap } from '../../src/js/focus-trap.js';
import { announce } from '../../src/js/announcer.js';
import { isEnabled } from '../../src/js/feature-flags.js';

// ── Test data ────────────────────────────────────────────────────────────────

function makeAnalysis(elementCount = 3, opts = {}) {
  const parser = new DOMParser();
  const svgParts = [];
  for (let i = 0; i < elementCount; i++) {
    svgParts.push(`<circle cx="${50 + i * 20}" cy="50" r="10" fill="black"/>`);
  }
  const svgString = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">${svgParts.join('')}</svg>`;
  const doc = parser.parseFromString(svgString, 'image/svg+xml');
  const circles = Array.from(doc.querySelectorAll('circle'));

  return {
    status: opts.status || 'needs_review',
    confidence: opts.confidence || 0.8,
    elements: circles.map((el, i) => ({
      element: el,
      pathData: `M${50 + i * 20},40 a10,10 0 1,0 0,20 a10,10 0 1,0 0,-20`,
      fill: 'black',
      stroke: '',
      luminance: 0,
      autoRole: i === 0 ? 'foreground' : 'hole',
      warnings: opts.warnings?.[i] || [],
    })),
    warnings: opts.globalWarnings || [],
    unsupportedFeatures: opts.unsupportedFeatures || [],
    recommendation: opts.recommendation || 'open_editor',
    singleElement: elementCount === 1,
  };
}

const SIMPLE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="black"/></svg>';

// ── Setup / teardown ─────────────────────────────────────────────────────────

let container;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  vi.clearAllMocks();
});

afterEach(() => {
  document.body.innerHTML = '';
  container = null;
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('createSvgPrepWorkspace', () => {
  describe('DOM structure', () => {
    it('creates the workspace root with correct ARIA attributes', () => {
      const ws = createSvgPrepWorkspace(container);
      const root = ws._root;

      expect(root).toBeTruthy();
      expect(root.classList.contains('svg-prep-workspace')).toBe(true);
      expect(root.getAttribute('role')).toBe('region');
      expect(root.getAttribute('aria-labelledby')).toBe('svg-prep-title');
      expect(root.hidden).toBe(true);

      ws.destroy();
    });

    it('appends the workspace to the container', () => {
      const ws = createSvgPrepWorkspace(container);
      expect(container.querySelector('.svg-prep-workspace')).toBe(ws._root);
      ws.destroy();
    });

    it('creates a header with title and control buttons', () => {
      const ws = createSvgPrepWorkspace(container);
      const root = ws._root;

      const title = root.querySelector('#svg-prep-title');
      expect(title).toBeTruthy();
      expect(title.tagName).toBe('H3');
      expect(title.textContent).toBe('SVG Preparation Editor');

      const fullscreenBtn = root.querySelector('.svg-prep-fullscreen-btn');
      expect(fullscreenBtn).toBeTruthy();
      expect(fullscreenBtn.getAttribute('aria-label')).toBe('Open fullscreen');

      const closeBtn = root.querySelector('.svg-prep-close-btn');
      expect(closeBtn).toBeTruthy();
      expect(closeBtn.getAttribute('aria-label')).toBe('Close editor');

      ws.destroy();
    });

    it('creates dual preview panes with correct ARIA', () => {
      const ws = createSvgPrepWorkspace(container);
      const root = ws._root;

      const sourcePane = root.querySelector('.svg-prep-source-pane');
      expect(sourcePane).toBeTruthy();
      expect(sourcePane.getAttribute('role')).toBe('img');
      expect(sourcePane.getAttribute('aria-label')).toBe('Source SVG');

      const resultPane = root.querySelector('.svg-prep-result-pane');
      expect(resultPane).toBeTruthy();
      expect(resultPane.getAttribute('role')).toBe('img');
      expect(resultPane.getAttribute('aria-label')).toBe('Prepared result');

      ws.destroy();
    });

    it('creates zoom controls for each preview pane', () => {
      const ws = createSvgPrepWorkspace(container);
      const root = ws._root;

      const sourceZoom = root.querySelector(
        '.svg-prep-source-pane .svg-prep-zoom-controls'
      );
      expect(sourceZoom).toBeTruthy();
      expect(sourceZoom.querySelector('.svg-prep-zoom-fit')).toBeTruthy();
      expect(sourceZoom.querySelector('.svg-prep-zoom-in')).toBeTruthy();
      expect(sourceZoom.querySelector('.svg-prep-zoom-out')).toBeTruthy();

      const resultZoom = root.querySelector(
        '.svg-prep-result-pane .svg-prep-zoom-controls'
      );
      expect(resultZoom).toBeTruthy();

      ws.destroy();
    });

    it('creates an object list container with list role', () => {
      const ws = createSvgPrepWorkspace(container);
      const objects = ws._root.querySelector('.svg-prep-objects');

      expect(objects).toBeTruthy();
      expect(objects.getAttribute('role')).toBe('list');
      expect(objects.getAttribute('aria-label')).toBe('SVG objects');

      ws.destroy();
    });

    it('creates a warnings region with aria-live', () => {
      const ws = createSvgPrepWorkspace(container);
      const warnings = ws._root.querySelector('.svg-prep-warnings');

      expect(warnings).toBeTruthy();
      expect(warnings.getAttribute('role')).toBe('status');
      expect(warnings.getAttribute('aria-live')).toBe('polite');

      ws.destroy();
    });

    it('creates footer with Apply, Keep original, and Reset buttons', () => {
      const ws = createSvgPrepWorkspace(container);
      const footer = ws._root.querySelector('.svg-prep-footer');

      expect(footer).toBeTruthy();

      const applyBtn = footer.querySelector('[data-action="apply"]');
      expect(applyBtn).toBeTruthy();
      expect(applyBtn.textContent).toBe('Apply prepared SVG');
      expect(applyBtn.classList.contains('btn-primary')).toBe(true);

      const keepBtn = footer.querySelector('[data-action="keep"]');
      expect(keepBtn).toBeTruthy();
      expect(keepBtn.textContent).toBe('Keep original');

      const resetBtn = footer.querySelector('[data-action="reset"]');
      expect(resetBtn).toBeTruthy();
      expect(resetBtn.textContent).toBe('Reset');

      ws.destroy();
    });

    it('creates a fullscreen backdrop element (hidden by default)', () => {
      const ws = createSvgPrepWorkspace(container);
      const backdrop = ws._refs.backdrop;

      expect(backdrop).toBeTruthy();
      expect(backdrop.classList.contains('svg-prep-fullscreen-backdrop')).toBe(true);
      expect(backdrop.classList.contains('hidden')).toBe(true);
      expect(backdrop.getAttribute('aria-hidden')).toBe('true');

      ws.destroy();
    });

    it('backdrop is a sibling of root, not a child (stacking context fix)', () => {
      const ws = createSvgPrepWorkspace(container);
      const backdrop = ws._refs.backdrop;

      expect(ws._root.contains(backdrop)).toBe(false);
      expect(backdrop.parentNode).toBe(container);
      expect(ws._root.parentNode).toBe(container);

      ws.destroy();
    });
  });

  describe('open / close lifecycle', () => {
    it('shows the workspace on open and hides on close', () => {
      const ws = createSvgPrepWorkspace(container);
      const analysis = makeAnalysis(2);

      expect(ws._root.hidden).toBe(true);

      ws.open(SIMPLE_SVG, analysis);
      expect(ws._root.hidden).toBe(false);

      ws.close();
      expect(ws._root.hidden).toBe(true);

      ws.destroy();
    });

    it('announces open and close via the announcer', () => {
      const ws = createSvgPrepWorkspace(container);
      ws.open(SIMPLE_SVG, makeAnalysis(1));

      expect(announce).toHaveBeenCalledWith('SVG Preparation Editor opened');

      ws.close();
      expect(announce).toHaveBeenCalledWith('SVG Preparation Editor closed');

      ws.destroy();
    });

    it('close is idempotent when already closed', () => {
      const ws = createSvgPrepWorkspace(container);
      ws.close();
      expect(announce).not.toHaveBeenCalledWith(
        'SVG Preparation Editor closed'
      );
      ws.destroy();
    });

    it('re-opening after close resets the workspace', () => {
      const ws = createSvgPrepWorkspace(container);
      const analysis1 = makeAnalysis(2);
      const analysis2 = makeAnalysis(1);

      ws.open(SIMPLE_SVG, analysis1);
      const items1 = ws._root.querySelectorAll('.svg-prep-object');
      expect(items1.length).toBe(2);

      ws.close();
      ws.open(SIMPLE_SVG, analysis2);
      const items2 = ws._root.querySelectorAll('.svg-prep-object');
      expect(items2.length).toBe(1);

      ws.destroy();
    });
  });

  describe('object list population', () => {
    it('creates a list item per analysis element', () => {
      const ws = createSvgPrepWorkspace(container);
      ws.open(SIMPLE_SVG, makeAnalysis(3));

      const items = ws._root.querySelectorAll('.svg-prep-object');
      expect(items.length).toBe(3);

      ws.destroy();
    });

    it('each list item has listitem role and tabindex', () => {
      const ws = createSvgPrepWorkspace(container);
      ws.open(SIMPLE_SVG, makeAnalysis(2));

      const items = ws._root.querySelectorAll('.svg-prep-object');
      items.forEach((item) => {
        expect(item.getAttribute('role')).toBe('listitem');
        expect(item.tabIndex).toBe(0);
      });

      ws.destroy();
    });

    it('each list item has a color swatch, name, and role radio group', () => {
      const ws = createSvgPrepWorkspace(container);
      ws.open(SIMPLE_SVG, makeAnalysis(1));

      const item = ws._root.querySelector('.svg-prep-object');
      expect(item.querySelector('.svg-prep-swatch')).toBeTruthy();
      expect(item.querySelector('.svg-prep-object-name')).toBeTruthy();

      const fieldset = item.querySelector('.svg-prep-role-group');
      expect(fieldset).toBeTruthy();
      expect(fieldset.tagName).toBe('FIELDSET');

      const radios = fieldset.querySelectorAll('input[type="radio"]');
      expect(radios.length).toBe(3);

      const values = Array.from(radios).map((r) => r.value);
      expect(values).toEqual(['foreground', 'hole', 'ignore']);

      ws.destroy();
    });

    it('radio group reflects the autoRole from analysis', () => {
      const ws = createSvgPrepWorkspace(container);
      const analysis = makeAnalysis(2);

      ws.open(SIMPLE_SVG, analysis);

      const items = ws._root.querySelectorAll('.svg-prep-object');
      const firstRadios = items[0].querySelectorAll('input[type="radio"]');
      const checkedFirst = Array.from(firstRadios).find((r) => r.checked);
      expect(checkedFirst.value).toBe('foreground');

      const secondRadios = items[1].querySelectorAll('input[type="radio"]');
      const checkedSecond = Array.from(secondRadios).find((r) => r.checked);
      expect(checkedSecond.value).toBe('hole');

      ws.destroy();
    });

    it('shows warning badge on elements with warnings', () => {
      const analysis = makeAnalysis(2, {
        warnings: [['Stroked path — not supported'], []],
      });
      const ws = createSvgPrepWorkspace(container);
      ws.open(SIMPLE_SVG, analysis);

      const items = ws._root.querySelectorAll('.svg-prep-object');
      const warningBadge = items[0].querySelector('.svg-prep-object-warning');
      expect(warningBadge).toBeTruthy();
      expect(warningBadge.getAttribute('aria-label')).toBe(
        'Stroked path — not supported'
      );

      expect(items[1].querySelector('.svg-prep-object-warning')).toBeFalsy();

      ws.destroy();
    });

    it('aria-label includes element name and role', () => {
      const ws = createSvgPrepWorkspace(container);
      ws.open(SIMPLE_SVG, makeAnalysis(1));

      const item = ws._root.querySelector('.svg-prep-object');
      expect(item.getAttribute('aria-label')).toMatch(/Circle 1.*foreground/);

      ws.destroy();
    });
  });

  describe('global warnings', () => {
    it('renders global warnings from the analysis', () => {
      const analysis = makeAnalysis(1, {
        globalWarnings: [
          'Stroked path ignored',
          'Elements inside <defs> skipped',
        ],
      });
      const ws = createSvgPrepWorkspace(container);
      ws.open(SIMPLE_SVG, analysis);

      const warningRegion = ws._root.querySelector('.svg-prep-warnings');
      const items = warningRegion.querySelectorAll('li');
      expect(items.length).toBe(2);
      expect(items[0].textContent).toBe('Stroked path ignored');

      ws.destroy();
    });

    it('clears warnings when analysis has none', () => {
      const ws = createSvgPrepWorkspace(container);
      ws.open(SIMPLE_SVG, makeAnalysis(1, { globalWarnings: ['test'] }));
      ws.close();
      ws.open(SIMPLE_SVG, makeAnalysis(1));

      const warningRegion = ws._root.querySelector('.svg-prep-warnings');
      expect(warningRegion.querySelectorAll('li').length).toBe(0);

      ws.destroy();
    });
  });

  describe('role change', () => {
    it('updates aria-label when a role radio is changed', () => {
      const ws = createSvgPrepWorkspace(container);
      ws.open(SIMPLE_SVG, makeAnalysis(1));

      const item = ws._root.querySelector('.svg-prep-object');
      const radios = item.querySelectorAll('input[type="radio"]');

      // Change from foreground to hole
      const holeRadio = Array.from(radios).find((r) => r.value === 'hole');
      holeRadio.checked = true;
      holeRadio.dispatchEvent(new Event('change', { bubbles: true }));

      expect(item.getAttribute('aria-label')).toMatch(/hole/);

      ws.destroy();
    });

    it('updates the ARIA live region on role change with preview info', () => {
      const ws = createSvgPrepWorkspace(container);
      ws.open(SIMPLE_SVG, makeAnalysis(1));

      const radios = ws._root.querySelectorAll('input[type="radio"]');
      const ignoreRadio = Array.from(radios).find((r) => r.value === 'ignore');
      ignoreRadio.checked = true;
      ignoreRadio.dispatchEvent(new Event('change', { bubbles: true }));

      const liveRegion = ws._root.querySelector(
        '[aria-live="polite"][aria-atomic="true"]'
      );
      expect(liveRegion).toBeTruthy();
      expect(liveRegion.textContent).toMatch(/preview/i);

      ws.destroy();
    });
  });

  describe('fullscreen', () => {
    it('adds fullscreen class and shows backdrop on openFullscreen', () => {
      const ws = createSvgPrepWorkspace(container);
      ws.open(SIMPLE_SVG, makeAnalysis(1));
      ws.openFullscreen();

      expect(ws._root.classList.contains('svg-prep-fullscreen')).toBe(true);

      const backdrop = ws._refs.backdrop;
      expect(backdrop.classList.contains('hidden')).toBe(false);
      expect(backdrop.getAttribute('aria-hidden')).toBe('false');

      ws.destroy();
    });

    it('portals root and backdrop to document.body on openFullscreen', () => {
      const ws = createSvgPrepWorkspace(container);
      ws.open(SIMPLE_SVG, makeAnalysis(1));
      ws.openFullscreen();

      expect(ws._root.parentNode).toBe(document.body);
      expect(ws._refs.backdrop.parentNode).toBe(document.body);

      ws.destroy();
    });

    it('returns root and backdrop to container on closeFullscreen', () => {
      const ws = createSvgPrepWorkspace(container);
      ws.open(SIMPLE_SVG, makeAnalysis(1));
      ws.openFullscreen();
      ws.closeFullscreen();

      expect(ws._root.parentNode).toBe(container);
      expect(ws._refs.backdrop.parentNode).toBe(container);

      ws.destroy();
    });

    it('close() returns portalled elements to container', () => {
      const ws = createSvgPrepWorkspace(container);
      ws.open(SIMPLE_SVG, makeAnalysis(1));
      ws.openFullscreen();
      ws.close();

      expect(ws._root.parentNode).toBe(container);
      expect(ws._refs.backdrop.parentNode).toBe(container);

      ws.destroy();
    });

    it('creates a focus trap on openFullscreen', () => {
      const ws = createSvgPrepWorkspace(container);
      ws.open(SIMPLE_SVG, makeAnalysis(1));
      ws.openFullscreen();

      expect(createDocumentFocusTrap).toHaveBeenCalledWith(
        ws._root,
        expect.objectContaining({ onEscape: expect.any(Function) })
      );
      expect(mockTrapActivate).toHaveBeenCalled();

      ws.destroy();
    });

    it('announces fullscreen open', () => {
      const ws = createSvgPrepWorkspace(container);
      ws.open(SIMPLE_SVG, makeAnalysis(1));
      ws.openFullscreen();

      expect(announce).toHaveBeenCalledWith(
        'SVG editor expanded to fullscreen'
      );

      ws.destroy();
    });

    it('updates fullscreen button label on open', () => {
      const ws = createSvgPrepWorkspace(container);
      ws.open(SIMPLE_SVG, makeAnalysis(1));
      ws.openFullscreen();

      const btn = ws._root.querySelector('.svg-prep-fullscreen-btn');
      expect(btn.getAttribute('aria-label')).toBe('Exit fullscreen');

      ws.destroy();
    });

    it('removes fullscreen class and hides backdrop on closeFullscreen', () => {
      const ws = createSvgPrepWorkspace(container);
      ws.open(SIMPLE_SVG, makeAnalysis(1));
      ws.openFullscreen();
      ws.closeFullscreen();

      expect(ws._root.classList.contains('svg-prep-fullscreen')).toBe(false);

      const backdrop = ws._refs.backdrop;
      expect(backdrop.classList.contains('hidden')).toBe(true);
      expect(backdrop.getAttribute('aria-hidden')).toBe('true');

      ws.destroy();
    });

    it('deactivates the focus trap on closeFullscreen', () => {
      const ws = createSvgPrepWorkspace(container);
      ws.open(SIMPLE_SVG, makeAnalysis(1));
      ws.openFullscreen();
      ws.closeFullscreen();

      expect(mockTrapDeactivate).toHaveBeenCalled();

      ws.destroy();
    });

    it('announces fullscreen close', () => {
      const ws = createSvgPrepWorkspace(container);
      ws.open(SIMPLE_SVG, makeAnalysis(1));
      ws.openFullscreen();
      ws.closeFullscreen();

      expect(announce).toHaveBeenCalledWith('Exited fullscreen SVG editor');

      ws.destroy();
    });

    it('restores fullscreen button label on close', () => {
      const ws = createSvgPrepWorkspace(container);
      ws.open(SIMPLE_SVG, makeAnalysis(1));
      ws.openFullscreen();
      ws.closeFullscreen();

      const btn = ws._root.querySelector('.svg-prep-fullscreen-btn');
      expect(btn.getAttribute('aria-label')).toBe('Open fullscreen');

      ws.destroy();
    });

    it('openFullscreen is a no-op when workspace is closed', () => {
      const ws = createSvgPrepWorkspace(container);
      ws.openFullscreen();

      expect(createDocumentFocusTrap).not.toHaveBeenCalled();
      expect(ws._root.classList.contains('svg-prep-fullscreen')).toBe(false);

      ws.destroy();
    });

    it('openFullscreen is a no-op when already fullscreen', () => {
      const ws = createSvgPrepWorkspace(container);
      ws.open(SIMPLE_SVG, makeAnalysis(1));
      ws.openFullscreen();

      vi.clearAllMocks();
      ws.openFullscreen();

      expect(createDocumentFocusTrap).not.toHaveBeenCalled();

      ws.destroy();
    });

    it('close() exits fullscreen automatically', () => {
      const ws = createSvgPrepWorkspace(container);
      ws.open(SIMPLE_SVG, makeAnalysis(1));
      ws.openFullscreen();
      ws.close();

      expect(mockTrapDeactivate).toHaveBeenCalled();
      expect(ws._root.classList.contains('svg-prep-fullscreen')).toBe(false);

      ws.destroy();
    });
  });

  describe('keyboard handling', () => {
    it('Escape closes the editor when not fullscreen', () => {
      const ws = createSvgPrepWorkspace(container);
      ws.open(SIMPLE_SVG, makeAnalysis(1));

      const event = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
      });
      ws._root.dispatchEvent(event);

      expect(ws._root.hidden).toBe(true);

      ws.destroy();
    });

    it('Escape exits fullscreen when fullscreen is active', () => {
      const ws = createSvgPrepWorkspace(container);
      ws.open(SIMPLE_SVG, makeAnalysis(1));
      ws.openFullscreen();

      const event = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
      });
      ws._root.dispatchEvent(event);

      expect(ws._root.classList.contains('svg-prep-fullscreen')).toBe(false);
      expect(ws._root.hidden).toBe(false);

      ws.destroy();
    });
  });

  describe('close button', () => {
    it('close button closes the editor', () => {
      const ws = createSvgPrepWorkspace(container);
      ws.open(SIMPLE_SVG, makeAnalysis(1));

      const closeBtn = ws._root.querySelector('.svg-prep-close-btn');
      closeBtn.click();

      expect(ws._root.hidden).toBe(true);

      ws.destroy();
    });
  });

  describe('fullscreen button', () => {
    it('fullscreen button opens fullscreen', () => {
      const ws = createSvgPrepWorkspace(container);
      ws.open(SIMPLE_SVG, makeAnalysis(1));

      const fsBtn = ws._root.querySelector('.svg-prep-fullscreen-btn');
      fsBtn.click();

      expect(ws._root.classList.contains('svg-prep-fullscreen')).toBe(true);

      ws.destroy();
    });

    it('fullscreen button toggles: second click exits fullscreen', () => {
      const ws = createSvgPrepWorkspace(container);
      ws.open(SIMPLE_SVG, makeAnalysis(1));

      const fsBtn = ws._root.querySelector('.svg-prep-fullscreen-btn');
      fsBtn.click();
      expect(ws._root.classList.contains('svg-prep-fullscreen')).toBe(true);

      fsBtn.click();
      expect(ws._root.classList.contains('svg-prep-fullscreen')).toBe(false);
      expect(ws._root.hidden).toBe(false);

      ws.destroy();
    });

    it('fullscreen button re-enters fullscreen after toggle cycle', () => {
      const ws = createSvgPrepWorkspace(container);
      ws.open(SIMPLE_SVG, makeAnalysis(1));

      const fsBtn = ws._root.querySelector('.svg-prep-fullscreen-btn');
      fsBtn.click();
      fsBtn.click();
      fsBtn.click();
      expect(ws._root.classList.contains('svg-prep-fullscreen')).toBe(true);

      ws.destroy();
    });
  });

  describe('backdrop click-to-close', () => {
    it('clicking backdrop closes fullscreen', () => {
      const ws = createSvgPrepWorkspace(container);
      ws.open(SIMPLE_SVG, makeAnalysis(1));
      ws.openFullscreen();

      const backdrop = ws._refs.backdrop;
      backdrop.click();

      expect(ws._root.classList.contains('svg-prep-fullscreen')).toBe(false);
      expect(backdrop.classList.contains('hidden')).toBe(true);
      expect(ws._root.hidden).toBe(false);

      ws.destroy();
    });

    it('clicking backdrop does nothing when not fullscreen', () => {
      const ws = createSvgPrepWorkspace(container);
      ws.open(SIMPLE_SVG, makeAnalysis(1));

      ws._refs.backdrop.click();

      expect(ws._root.hidden).toBe(false);
      expect(ws._root.classList.contains('svg-prep-fullscreen')).toBe(false);

      ws.destroy();
    });
  });

  describe('footer buttons', () => {
    it('Apply closes the editor', () => {
      const ws = createSvgPrepWorkspace(container);
      ws.open(SIMPLE_SVG, makeAnalysis(1));

      const applyBtn = ws._root.querySelector('[data-action="apply"]');
      applyBtn.click();

      expect(ws._root.hidden).toBe(true);

      ws.destroy();
    });

    it('Keep original clears result and closes', () => {
      const ws = createSvgPrepWorkspace(container);
      ws.open(SIMPLE_SVG, makeAnalysis(1));

      const keepBtn = ws._root.querySelector('[data-action="keep"]');
      keepBtn.click();

      expect(ws._root.hidden).toBe(true);
      expect(ws.getResult()).toBe(null);

      ws.destroy();
    });

    it('Reset announces reset via the live region', () => {
      const ws = createSvgPrepWorkspace(container);
      ws.open(SIMPLE_SVG, makeAnalysis(1));

      const resetBtn = ws._root.querySelector('[data-action="reset"]');
      resetBtn.click();

      const liveRegion = ws._root.querySelector(
        '[aria-live="polite"][aria-atomic="true"]'
      );
      expect(liveRegion.textContent).toMatch(/reset/i);

      ws.destroy();
    });
  });

  describe('destroy', () => {
    it('removes the workspace and backdrop from the DOM', () => {
      const ws = createSvgPrepWorkspace(container);
      ws.destroy();

      expect(container.querySelector('.svg-prep-workspace')).toBe(null);
      expect(container.querySelector('.svg-prep-fullscreen-backdrop')).toBe(null);
    });

    it('closes the workspace before destroying', () => {
      const ws = createSvgPrepWorkspace(container);
      ws.open(SIMPLE_SVG, makeAnalysis(1));
      ws.openFullscreen();
      ws.destroy();

      expect(mockTrapDeactivate).toHaveBeenCalled();
      expect(container.querySelector('.svg-prep-workspace')).toBe(null);
    });
  });

  describe('getResult', () => {
    it('returns null when no result has been set', () => {
      const ws = createSvgPrepWorkspace(container);
      expect(ws.getResult()).toBe(null);
      ws.destroy();
    });
  });
});

describe('describeElement', () => {
  function makeEl(tag, attrs = {}) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs)) {
      el.setAttribute(k, v);
    }
    return el;
  }

  it('describes a circle with radius', () => {
    expect(describeElement(makeEl('circle', { r: '20' }), 0)).toBe(
      'Circle 1 (r=20)'
    );
  });

  it('describes an ellipse with dimensions', () => {
    expect(describeElement(makeEl('ellipse', { rx: '10', ry: '5' }), 1)).toBe(
      'Ellipse 2 (10\u00D75)'
    );
  });

  it('describes a rectangle with dimensions', () => {
    expect(
      describeElement(makeEl('rect', { width: '30', height: '40' }), 2)
    ).toBe('Rectangle 3 (30\u00D740)');
  });

  it('describes a polygon', () => {
    expect(describeElement(makeEl('polygon'), 0)).toBe('Polygon 1');
  });

  it('describes a path', () => {
    expect(describeElement(makeEl('path'), 4)).toBe('Path 5');
  });

  it('describes unknown tags as Shape', () => {
    expect(describeElement(makeEl('g'), 0)).toBe('Shape 1');
  });
});

// ── Phase 3 — Live preview, zoom, highlighting ──────────────────────────────

describe('Phase 3: source pane rendering', () => {
  it('renders source SVG inline in the source pane on open', () => {
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(1));

    const sourceSvg = ws._root.querySelector('.svg-prep-source-pane svg');
    expect(sourceSvg).toBeTruthy();

    ws.destroy();
  });

  it('tags render-scope elements with data-prep-index', () => {
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(1));

    const tagged = ws._root.querySelector(
      '.svg-prep-source-pane [data-prep-index="0"]'
    );
    expect(tagged).toBeTruthy();
    expect(tagged.tagName.toLowerCase()).toBe('circle');

    ws.destroy();
  });

  it('removes source SVG on close', () => {
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(1));
    ws.close();

    const sourceSvg = ws._root.querySelector('.svg-prep-source-pane svg');
    expect(sourceSvg).toBeFalsy();

    ws.destroy();
  });
});

describe('Phase 3: result pane rendering', () => {
  it('renders prepared result in the result pane on open', () => {
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(1));

    const resultSvg = ws._root.querySelector('.svg-prep-result-pane svg');
    expect(resultSvg).toBeTruthy();

    ws.destroy();
  });

  it('result pane contains a single <path> after preparation', () => {
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(1));

    const paths = ws._root.querySelectorAll('.svg-prep-result-pane path');
    expect(paths.length).toBe(1);

    ws.destroy();
  });

  it('result path includes fill-rule="evenodd"', () => {
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(1));

    const path = ws._root.querySelector('.svg-prep-result-pane path');
    expect(path.getAttribute('fill-rule')).toBe('evenodd');

    ws.destroy();
  });

  it('getResult returns prepared SVG string after open', () => {
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(1));

    const result = ws.getResult();
    expect(result).not.toBeNull();
    expect(result).toContain('<svg');
    expect(result).toContain('<path');

    ws.destroy();
  });

  it('removes result SVG on close', () => {
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(1));
    ws.close();

    const resultSvg = ws._root.querySelector('.svg-prep-result-pane svg');
    expect(resultSvg).toBeFalsy();

    ws.destroy();
  });
});

describe('Phase 3: role change updates result preview', () => {
  it('changing role to ignore empties the preview', () => {
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(1));

    const radios = ws._root.querySelectorAll('input[type="radio"]');
    const ignoreRadio = Array.from(radios).find((r) => r.value === 'ignore');
    ignoreRadio.checked = true;
    ignoreRadio.dispatchEvent(new Event('change', { bubbles: true }));

    const resultSvg = ws._root.querySelector('.svg-prep-result-pane svg');
    expect(resultSvg).toBeFalsy();
    expect(ws.getResult()).toBeNull();

    ws.destroy();
  });

  it('changing role from hole to foreground updates result path data', () => {
    const ws = createSvgPrepWorkspace(container);
    const analysis = makeAnalysis(2);
    ws.open(SIMPLE_SVG, analysis);

    const initialPath = ws._root.querySelector('.svg-prep-result-pane path');
    const initialD = initialPath ? initialPath.getAttribute('d') : '';

    const items = ws._root.querySelectorAll('.svg-prep-object');
    const secondRadios = items[1].querySelectorAll('input[type="radio"]');
    const fgRadio = Array.from(secondRadios).find(
      (r) => r.value === 'foreground'
    );
    fgRadio.checked = true;
    fgRadio.dispatchEvent(new Event('change', { bubbles: true }));

    const updatedPath = ws._root.querySelector('.svg-prep-result-pane path');
    const updatedD = updatedPath ? updatedPath.getAttribute('d') : '';
    expect(updatedD).not.toBe(initialD);

    ws.destroy();
  });

  it('announces preview state after role change', () => {
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(2));

    const secondItem = ws._root.querySelector(
      '.svg-prep-object[data-index="1"]'
    );
    const radios = secondItem.querySelectorAll('input[type="radio"]');
    const fgRadio = Array.from(radios).find((r) => r.value === 'foreground');
    fgRadio.checked = true;
    fgRadio.dispatchEvent(new Event('change', { bubbles: true }));

    const liveRegion = ws._root.querySelector(
      '[aria-live="polite"][aria-atomic="true"]'
    );
    expect(liveRegion.textContent).toMatch(/preview updated/i);
    expect(liveRegion.textContent).toMatch(/foreground/i);

    ws.destroy();
  });
});

describe('Phase 3: object list highlighting', () => {
  it('adds data-prep-highlight on object mouseover', () => {
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(1));

    const item = ws._root.querySelector('.svg-prep-object');
    item.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

    const highlighted = ws._root.querySelector(
      '.svg-prep-source-pane [data-prep-highlight]'
    );
    expect(highlighted).toBeTruthy();

    ws.destroy();
  });

  it('removes data-prep-highlight on object mouseout', () => {
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(1));

    const item = ws._root.querySelector('.svg-prep-object');
    item.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    item.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));

    const highlighted = ws._root.querySelector(
      '.svg-prep-source-pane [data-prep-highlight]'
    );
    expect(highlighted).toBeFalsy();

    ws.destroy();
  });

  it('adds data-prep-highlight on object focusin', () => {
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(1));

    const item = ws._root.querySelector('.svg-prep-object');
    item.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

    const highlighted = ws._root.querySelector(
      '.svg-prep-source-pane [data-prep-highlight]'
    );
    expect(highlighted).toBeTruthy();

    ws.destroy();
  });

  it('removes data-prep-highlight on object focusout', () => {
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(1));

    const item = ws._root.querySelector('.svg-prep-object');
    item.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    item.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));

    const highlighted = ws._root.querySelector(
      '.svg-prep-source-pane [data-prep-highlight]'
    );
    expect(highlighted).toBeFalsy();

    ws.destroy();
  });
});

describe('Phase 3: zoom controls', () => {
  it('zoom in reduces the source pane viewBox', () => {
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(1));

    const sourceSvg = ws._root.querySelector('.svg-prep-source-pane svg');
    const initialVB = sourceSvg.getAttribute('viewBox');
    const [, , w1] = initialVB.split(/[\s,]+/).map(Number);

    const zoomInBtn = ws._root.querySelector(
      '.svg-prep-source-pane .svg-prep-zoom-in'
    );
    zoomInBtn.click();

    const newVB = sourceSvg.getAttribute('viewBox');
    const [, , w2] = newVB.split(/[\s,]+/).map(Number);
    expect(w2).toBeLessThan(w1);

    ws.destroy();
  });

  it('zoom out expands the source pane viewBox', () => {
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(1));

    const sourceSvg = ws._root.querySelector('.svg-prep-source-pane svg');
    const initialVB = sourceSvg.getAttribute('viewBox');
    const [, , w1] = initialVB.split(/[\s,]+/).map(Number);

    const zoomOutBtn = ws._root.querySelector(
      '.svg-prep-source-pane .svg-prep-zoom-out'
    );
    zoomOutBtn.click();

    const newVB = sourceSvg.getAttribute('viewBox');
    const [, , w2] = newVB.split(/[\s,]+/).map(Number);
    expect(w2).toBeGreaterThan(w1);

    ws.destroy();
  });

  it('fit restores the natural viewBox', () => {
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(1));

    const sourceSvg = ws._root.querySelector('.svg-prep-source-pane svg');
    const naturalVB = sourceSvg.getAttribute('viewBox');

    const zoomInBtn = ws._root.querySelector(
      '.svg-prep-source-pane .svg-prep-zoom-in'
    );
    zoomInBtn.click();
    expect(sourceSvg.getAttribute('viewBox')).not.toBe(naturalVB);

    const fitBtn = ws._root.querySelector(
      '.svg-prep-source-pane .svg-prep-zoom-fit'
    );
    fitBtn.click();
    expect(sourceSvg.getAttribute('viewBox')).toBe(naturalVB);

    ws.destroy();
  });

  it('keyboard + zooms in on focused pane', () => {
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(1));

    const sourcePane = ws._root.querySelector('.svg-prep-source-pane');
    const sourceSvg = sourcePane.querySelector('svg');
    const initialVB = sourceSvg.getAttribute('viewBox');
    const [, , w1] = initialVB.split(/[\s,]+/).map(Number);

    sourcePane.dispatchEvent(
      new KeyboardEvent('keydown', { key: '+', bubbles: true })
    );

    const [, , w2] = sourceSvg
      .getAttribute('viewBox')
      .split(/[\s,]+/)
      .map(Number);
    expect(w2).toBeLessThan(w1);

    ws.destroy();
  });

  it('keyboard - zooms out on focused pane', () => {
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(1));

    const sourcePane = ws._root.querySelector('.svg-prep-source-pane');
    const sourceSvg = sourcePane.querySelector('svg');
    const initialVB = sourceSvg.getAttribute('viewBox');
    const [, , w1] = initialVB.split(/[\s,]+/).map(Number);

    sourcePane.dispatchEvent(
      new KeyboardEvent('keydown', { key: '-', bubbles: true })
    );

    const [, , w2] = sourceSvg
      .getAttribute('viewBox')
      .split(/[\s,]+/)
      .map(Number);
    expect(w2).toBeGreaterThan(w1);

    ws.destroy();
  });

  it('makes preview panes focusable with tabIndex', () => {
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(1));

    const sourcePane = ws._root.querySelector('.svg-prep-source-pane');
    expect(sourcePane.tabIndex).toBe(0);

    const resultPane = ws._root.querySelector('.svg-prep-result-pane');
    expect(resultPane.tabIndex).toBe(0);

    ws.destroy();
  });
});

describe('Phase 3: reset behavior', () => {
  it('Reset restores radio buttons to auto-classification', () => {
    const ws = createSvgPrepWorkspace(container);
    const analysis = makeAnalysis(2);
    ws.open(SIMPLE_SVG, analysis);

    const items = ws._root.querySelectorAll('.svg-prep-object');
    const firstRadios = items[0].querySelectorAll('input[type="radio"]');
    const ignoreRadio = Array.from(firstRadios).find(
      (r) => r.value === 'ignore'
    );
    ignoreRadio.checked = true;
    ignoreRadio.dispatchEvent(new Event('change', { bubbles: true }));

    const resetBtn = ws._root.querySelector('[data-action="reset"]');
    resetBtn.click();

    const fgRadio = Array.from(firstRadios).find(
      (r) => r.value === 'foreground'
    );
    expect(fgRadio.checked).toBe(true);

    ws.destroy();
  });

  it('Reset updates the result preview', () => {
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(1));

    const radios = ws._root.querySelectorAll('input[type="radio"]');
    const ignoreRadio = Array.from(radios).find((r) => r.value === 'ignore');
    ignoreRadio.checked = true;
    ignoreRadio.dispatchEvent(new Event('change', { bubbles: true }));

    expect(ws._root.querySelector('.svg-prep-result-pane svg')).toBeFalsy();

    const resetBtn = ws._root.querySelector('[data-action="reset"]');
    resetBtn.click();

    expect(ws._root.querySelector('.svg-prep-result-pane svg')).toBeTruthy();

    ws.destroy();
  });
});

// ── Phase 4a — Callback integration ─────────────────────────────────────

describe('Phase 4a: open() callbacks parameter', () => {
  it('open() accepts an optional callbacks parameter', () => {
    const ws = createSvgPrepWorkspace(container);
    const onApply = vi.fn();
    ws.open(SIMPLE_SVG, makeAnalysis(1), { onApply });
    expect(ws._root.hidden).toBe(false);
    ws.destroy();
  });

  it('open() works without callbacks (backward compat)', () => {
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(1));
    expect(ws._root.hidden).toBe(false);
    ws.destroy();
  });
});

describe('Phase 4a: Apply button fires onApply callback', () => {
  it('calls onApply with the prepared result on Apply', () => {
    const onApply = vi.fn();
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(1), { onApply });

    const applyBtn = ws._root.querySelector('[data-action="apply"]');
    applyBtn.click();

    expect(onApply).toHaveBeenCalledTimes(1);
    const result = onApply.mock.calls[0][0];
    expect(result).toContain('<svg');
    expect(result).toContain('<path');
  });

  it('closes the editor after calling onApply', () => {
    const onApply = vi.fn();
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(1), { onApply });

    ws._root.querySelector('[data-action="apply"]').click();
    expect(ws._root.hidden).toBe(true);

    ws.destroy();
  });
});

describe('Phase 4a: Keep original fires onKeepOriginal callback', () => {
  it('calls onKeepOriginal on Keep original', () => {
    const onKeepOriginal = vi.fn();
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(1), { onKeepOriginal });

    ws._root.querySelector('[data-action="keep"]').click();

    expect(onKeepOriginal).toHaveBeenCalledTimes(1);
  });

  it('clears the result before calling onKeepOriginal', () => {
    const onKeepOriginal = vi.fn();
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(1), { onKeepOriginal });

    ws._root.querySelector('[data-action="keep"]').click();
    expect(ws.getResult()).toBeNull();

    ws.destroy();
  });

  it('closes the editor after calling onKeepOriginal', () => {
    const onKeepOriginal = vi.fn();
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(1), { onKeepOriginal });

    ws._root.querySelector('[data-action="keep"]').click();
    expect(ws._root.hidden).toBe(true);

    ws.destroy();
  });
});

describe('Phase 4a: Escape / close button do not fire callbacks', () => {
  it('Escape does not fire onApply or onKeepOriginal', () => {
    const onApply = vi.fn();
    const onKeepOriginal = vi.fn();
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(1), { onApply, onKeepOriginal });

    ws._root.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    );

    expect(onApply).not.toHaveBeenCalled();
    expect(onKeepOriginal).not.toHaveBeenCalled();

    ws.destroy();
  });

  it('close button does not fire onApply or onKeepOriginal', () => {
    const onApply = vi.fn();
    const onKeepOriginal = vi.fn();
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(1), { onApply, onKeepOriginal });

    ws._root.querySelector('.svg-prep-close-btn').click();

    expect(onApply).not.toHaveBeenCalled();
    expect(onKeepOriginal).not.toHaveBeenCalled();

    ws.destroy();
  });
});

describe('Phase 4a: callbacks are cleared on close', () => {
  it('does not fire stale callbacks on re-open without callbacks', () => {
    const onApply = vi.fn();
    const ws = createSvgPrepWorkspace(container);

    ws.open(SIMPLE_SVG, makeAnalysis(1), { onApply });
    ws.close();
    ws.open(SIMPLE_SVG, makeAnalysis(1));

    ws._root.querySelector('[data-action="apply"]').click();
    expect(onApply).not.toHaveBeenCalled();

    ws.destroy();
  });
});

// ── Phase 5 — Persistence support ───────────────────────────────────────

describe('Phase 5: getRoleOverrides()', () => {
  it('returns current roles as an array copy', () => {
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(3));

    const overrides = ws.getRoleOverrides();
    expect(Array.isArray(overrides)).toBe(true);
    expect(overrides).toHaveLength(3);
    expect(overrides[0]).toBe('foreground');
    expect(overrides[1]).toBe('hole');
    expect(overrides[2]).toBe('hole');

    ws.destroy();
  });

  it('returns a copy that does not mutate internal state', () => {
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(2));

    const overrides = ws.getRoleOverrides();
    overrides[0] = 'ignore';

    const fresh = ws.getRoleOverrides();
    expect(fresh[0]).toBe('foreground');

    ws.destroy();
  });

  it('reflects role changes made via radio buttons', () => {
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(2));

    const radios = ws._root.querySelectorAll('input[type="radio"]');
    const ignoreRadio = Array.from(radios).find(
      (r) => r.name === 'svg-prep-role-0' && r.value === 'ignore'
    );
    ignoreRadio.checked = true;
    ignoreRadio.dispatchEvent(new Event('change', { bubbles: true }));

    const overrides = ws.getRoleOverrides();
    expect(overrides[0]).toBe('ignore');

    ws.destroy();
  });

  it('is callable from the onApply callback before close()', () => {
    let capturedOverrides = null;
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(2), {
      onApply: () => {
        capturedOverrides = ws.getRoleOverrides();
      },
    });

    ws._root.querySelector('[data-action="apply"]').click();
    expect(capturedOverrides).toBeTruthy();
    expect(capturedOverrides[0]).toBe('foreground');

    ws.destroy();
  });
});

describe('Phase 5: open() with initialOverrides', () => {
  it('applies initial overrides to radio buttons', () => {
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(3), {
      initialOverrides: ['ignore', 'foreground', 'hole'],
    });

    const overrides = ws.getRoleOverrides();
    expect(overrides).toEqual(['ignore', 'foreground', 'hole']);

    const radios0 = ws._root.querySelectorAll(
      'input[name="svg-prep-role-0"]'
    );
    const checked0 = Array.from(radios0).find((r) => r.checked);
    expect(checked0.value).toBe('ignore');

    const radios1 = ws._root.querySelectorAll(
      'input[name="svg-prep-role-1"]'
    );
    const checked1 = Array.from(radios1).find((r) => r.checked);
    expect(checked1.value).toBe('foreground');

    ws.destroy();
  });

  it('updates aria-labels when applying initial overrides', () => {
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(2), {
      initialOverrides: ['ignore', 'foreground'],
    });

    const items = ws._root.querySelectorAll('.svg-prep-object');
    expect(items[0].getAttribute('aria-label')).toContain('role: ignore');
    expect(items[1].getAttribute('aria-label')).toContain(
      'role: foreground'
    );

    ws.destroy();
  });

  it('ignores overrides beyond the element count', () => {
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(2), {
      initialOverrides: ['ignore', 'foreground', 'hole', 'foreground'],
    });

    const overrides = ws.getRoleOverrides();
    expect(overrides).toHaveLength(2);
    expect(overrides).toEqual(['ignore', 'foreground']);

    ws.destroy();
  });

  it('skips null entries in initialOverrides', () => {
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(3), {
      initialOverrides: [null, 'foreground', null],
    });

    const overrides = ws.getRoleOverrides();
    expect(overrides[0]).toBe('foreground');
    expect(overrides[1]).toBe('foreground');
    expect(overrides[2]).toBe('hole');

    ws.destroy();
  });

  it('works without initialOverrides (backward compat)', () => {
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(2));

    const overrides = ws.getRoleOverrides();
    expect(overrides[0]).toBe('foreground');
    expect(overrides[1]).toBe('hole');

    ws.destroy();
  });

  it('result preview reflects initial overrides', () => {
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(2), {
      initialOverrides: ['ignore', 'ignore'],
    });

    expect(ws._root.querySelector('.svg-prep-result-pane svg')).toBeFalsy();

    ws.destroy();
  });
});

// ── Phase 6b — Accessibility validation ──────────────────────────────────

describe('Phase 6b: accessibility — screen reader landmarks', () => {
  it('workspace root is a labelled region', () => {
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(1));

    expect(ws._root.getAttribute('role')).toBe('region');
    expect(ws._root.getAttribute('aria-labelledby')).toBe('svg-prep-title');
    const title = ws._root.querySelector('#svg-prep-title');
    expect(title).toBeTruthy();
    expect(title.textContent).not.toBe('');

    ws.destroy();
  });

  it('object list is a labelled list landmark', () => {
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(2));

    const list = ws._root.querySelector('.svg-prep-objects');
    expect(list.getAttribute('role')).toBe('list');
    expect(list.getAttribute('aria-label')).toBe('SVG objects');

    const items = list.querySelectorAll('[role="listitem"]');
    expect(items.length).toBe(2);

    ws.destroy();
  });

  it('preview panes have img role with descriptive labels', () => {
    const ws = createSvgPrepWorkspace(container);

    const src = ws._root.querySelector('.svg-prep-source-pane');
    expect(src.getAttribute('role')).toBe('img');
    expect(src.getAttribute('aria-label')).toBe('Source SVG');

    const res = ws._root.querySelector('.svg-prep-result-pane');
    expect(res.getAttribute('role')).toBe('img');
    expect(res.getAttribute('aria-label')).toBe('Prepared result');

    ws.destroy();
  });

  it('warning region is a live status landmark', () => {
    const ws = createSvgPrepWorkspace(container);

    const w = ws._root.querySelector('.svg-prep-warnings');
    expect(w.getAttribute('role')).toBe('status');
    expect(w.getAttribute('aria-live')).toBe('polite');

    ws.destroy();
  });

  it('inline live region is polite and atomic', () => {
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(1));

    const lr = ws._root.querySelector(
      '[aria-live="polite"][aria-atomic="true"]'
    );
    expect(lr).toBeTruthy();
    expect(lr.classList.contains('sr-only')).toBe(true);

    ws.destroy();
  });
});

describe('Phase 6b: accessibility — all interactive elements have names', () => {
  it('fullscreen button has an accessible name', () => {
    const ws = createSvgPrepWorkspace(container);
    const btn = ws._root.querySelector('.svg-prep-fullscreen-btn');
    expect(btn.getAttribute('aria-label')).toBeTruthy();
    ws.destroy();
  });

  it('close button has an accessible name', () => {
    const ws = createSvgPrepWorkspace(container);
    const btn = ws._root.querySelector('.svg-prep-close-btn');
    expect(btn.getAttribute('aria-label')).toBeTruthy();
    ws.destroy();
  });

  it('all zoom buttons have accessible names', () => {
    const ws = createSvgPrepWorkspace(container);
    const zoomBtns = ws._root.querySelectorAll('.svg-prep-zoom-controls button');
    expect(zoomBtns.length).toBeGreaterThanOrEqual(6);

    zoomBtns.forEach((btn) => {
      expect(btn.getAttribute('aria-label')).toBeTruthy();
    });

    ws.destroy();
  });

  it('footer action buttons have visible text labels', () => {
    const ws = createSvgPrepWorkspace(container);
    const footer = ws._root.querySelector('.svg-prep-footer');
    const btns = footer.querySelectorAll('button');

    btns.forEach((btn) => {
      expect(btn.textContent.trim()).not.toBe('');
    });

    ws.destroy();
  });

  it('each radio group has a legend for screen readers', () => {
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(2));

    const fieldsets = ws._root.querySelectorAll('.svg-prep-role-group');
    fieldsets.forEach((fs) => {
      const legend = fs.querySelector('legend');
      expect(legend).toBeTruthy();
      expect(legend.textContent).toMatch(/Role for/);
      expect(legend.classList.contains('sr-only')).toBe(true);
    });

    ws.destroy();
  });

  it('color swatches are hidden from screen readers', () => {
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(2));

    const swatches = ws._root.querySelectorAll('.svg-prep-swatch');
    swatches.forEach((s) => {
      expect(s.getAttribute('aria-hidden')).toBe('true');
    });

    ws.destroy();
  });

  it('color swatches are non-interactive decorative elements, not checkboxes', () => {
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(2));

    const swatches = ws._root.querySelectorAll('.svg-prep-swatch');
    expect(swatches.length).toBe(2);
    swatches.forEach((s) => {
      expect(s.tagName).toBe('SPAN');
      expect(s.querySelector('input')).toBeNull();
      expect(s.getAttribute('role')).toBeNull();
    });

    ws.destroy();
  });

  it('backdrop is marked aria-hidden when shown and hidden', () => {
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(1));

    const backdrop = ws._refs.backdrop;
    expect(backdrop.getAttribute('aria-hidden')).toBe('true');

    ws.openFullscreen();
    expect(backdrop.getAttribute('aria-hidden')).toBe('false');

    ws.closeFullscreen();
    expect(backdrop.getAttribute('aria-hidden')).toBe('true');

    ws.destroy();
  });
});

describe('Phase 6b: accessibility — keyboard walkthrough', () => {
  it('all object list items are keyboard-focusable', () => {
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(3));

    const items = ws._root.querySelectorAll('.svg-prep-object');
    items.forEach((item) => {
      expect(item.tabIndex).toBe(0);
    });

    ws.destroy();
  });

  it('preview panes are keyboard-focusable for zoom shortcuts', () => {
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(1));

    const srcPane = ws._root.querySelector('.svg-prep-source-pane');
    const resPane = ws._root.querySelector('.svg-prep-result-pane');
    expect(srcPane.tabIndex).toBe(0);
    expect(resPane.tabIndex).toBe(0);

    ws.destroy();
  });

  it('Escape in fullscreen exits fullscreen without closing editor', () => {
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(1));
    ws.openFullscreen();

    ws._root.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    );

    expect(ws._root.classList.contains('svg-prep-fullscreen')).toBe(false);
    expect(ws._root.hidden).toBe(false);

    ws.destroy();
  });

  it('Escape when not fullscreen closes the editor', () => {
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(1));

    ws._root.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    );

    expect(ws._root.hidden).toBe(true);

    ws.destroy();
  });

  it('radio inputs use shared name per element for arrow-key navigation', () => {
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(2));

    const group0 = ws._root.querySelectorAll('input[name="svg-prep-role-0"]');
    expect(group0.length).toBe(3);

    const group1 = ws._root.querySelectorAll('input[name="svg-prep-role-1"]');
    expect(group1.length).toBe(3);

    expect(group0[0].name).not.toBe(group1[0].name);

    ws.destroy();
  });

  it('keyboard = key zooms in on focused source pane', () => {
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(1));

    const sourcePane = ws._root.querySelector('.svg-prep-source-pane');
    const svg = sourcePane.querySelector('svg');
    const [, , w1] = svg.getAttribute('viewBox').split(/[\s,]+/).map(Number);

    sourcePane.dispatchEvent(
      new KeyboardEvent('keydown', { key: '=', bubbles: true })
    );

    const [, , w2] = svg.getAttribute('viewBox').split(/[\s,]+/).map(Number);
    expect(w2).toBeLessThan(w1);

    ws.destroy();
  });
});

describe('Phase 6b: accessibility — focus management', () => {
  it('openFullscreen creates a focus trap', () => {
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(1));
    ws.openFullscreen();

    expect(createDocumentFocusTrap).toHaveBeenCalledWith(
      ws._root,
      expect.objectContaining({ onEscape: expect.any(Function) })
    );
    expect(mockTrapActivate).toHaveBeenCalledWith(
      expect.objectContaining({ initialFocus: expect.any(HTMLElement) })
    );

    ws.destroy();
  });

  it('closeFullscreen deactivates the focus trap', () => {
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(1));
    ws.openFullscreen();
    ws.closeFullscreen();

    expect(mockTrapDeactivate).toHaveBeenCalled();

    ws.destroy();
  });

  it('close() deactivates fullscreen trap if active', () => {
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(1));
    ws.openFullscreen();

    vi.clearAllMocks();
    ws.close();

    expect(mockTrapDeactivate).toHaveBeenCalled();

    ws.destroy();
  });

  it('announces lifecycle events for screen readers', () => {
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(1));
    expect(announce).toHaveBeenCalledWith('SVG Preparation Editor opened');

    ws.openFullscreen();
    expect(announce).toHaveBeenCalledWith('SVG editor expanded to fullscreen');

    ws.closeFullscreen();
    expect(announce).toHaveBeenCalledWith('Exited fullscreen SVG editor');

    ws.close();
    expect(announce).toHaveBeenCalledWith('SVG Preparation Editor closed');

    ws.destroy();
  });
});

// ── Fullscreen sticky layout CSS contract ────────────────────────────────
//
// jsdom does not compute styles from external CSS. These tests read the
// stylesheet source to verify the layout contract for fullscreen mode.
// They are intentionally red until Phase 2 adds the required CSS rules.

describe('Fullscreen sticky layout CSS contract', () => {
  let css;

  beforeAll(() => {
    css = readFileSync(resolve('src/styles/components.css'), 'utf-8');
  });

  it('fullscreen root sets overflow: hidden so only objects list scrolls', () => {
    const match = css.match(
      /\.svg-prep-workspace\.svg-prep-fullscreen\s*\{([^}]*)\}/
    );
    expect(match).not.toBeNull();
    expect(match[1]).toMatch(/overflow\s*:\s*hidden/);
  });

  it('fullscreen objects list has overflow-y: auto', () => {
    expect(css).toMatch(
      /\.svg-prep-fullscreen\s+\.svg-prep-objects\s*\{[^}]*overflow-y\s*:\s*auto/
    );
  });

  it('540px stacking media query is scoped to non-fullscreen only', () => {
    const mediaBlocks = [
      ...css.matchAll(
        /@media\s*\(\s*max-width\s*:\s*540px\s*\)\s*\{([\s\S]*?\n\})/g
      ),
    ];
    const nonFullscreenBlock = mediaBlocks.find((m) =>
      /:not\(\.svg-prep-fullscreen\)/.test(m[1])
    );
    expect(nonFullscreenBlock).toBeDefined();
  });

  it('540px fullscreen block uses compact padding with safe-area-insets', () => {
    const mediaBlocks = [
      ...css.matchAll(
        /@media\s*\(\s*max-width\s*:\s*540px\s*\)\s*\{([\s\S]*?\n\})/g
      ),
    ];
    const fullscreenBlock = mediaBlocks.find(
      (m) =>
        /\.svg-prep-fullscreen/.test(m[1]) &&
        !/\:not\(/.test(m[1].split('.svg-prep-fullscreen')[0].split('\n').pop())
    );
    expect(fullscreenBlock).toBeDefined();
    expect(fullscreenBlock[1]).toMatch(/env\(safe-area-inset-top/);
    expect(fullscreenBlock[1]).toMatch(/env\(safe-area-inset-bottom/);
  });

  it('non-fullscreen workspace preserves default overflow', () => {
    const baseMatch = css.match(
      /\.svg-prep-workspace\s*\{([^}]*)\}/
    );
    expect(baseMatch).not.toBeNull();
    expect(baseMatch[1]).not.toMatch(/overflow\s*:\s*hidden/);
  });
});

// ── Phase 9 — Offset input unit tests ────────────────────────────────────

describe('Phase 9: offset inputs (flag disabled)', () => {
  it('does not render offset inputs when flag is disabled', () => {
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(2));

    const inputs = ws._root.querySelectorAll('.svg-prep-offset-input');
    expect(inputs.length).toBe(0);

    ws.destroy();
  });

  it('design-width group is hidden when flag is disabled', () => {
    const ws = createSvgPrepWorkspace(container);

    const group = ws._root.querySelector('.svg-prep-design-width');
    expect(group.hidden).toBe(true);

    ws.destroy();
  });
});

describe('Phase 9: offset inputs (flag enabled)', () => {
  beforeEach(() => {
    isEnabled.mockReturnValue(true);
  });
  afterEach(() => {
    isEnabled.mockReturnValue(false);
  });

  it('renders an offset input per element', () => {
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(3));

    const inputs = ws._root.querySelectorAll('.svg-prep-offset-input');
    expect(inputs.length).toBe(3);

    ws.destroy();
  });

  it('offset input has correct type, range, and step', () => {
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(1));

    const input = ws._root.querySelector('.svg-prep-offset-input');
    expect(input.type).toBe('number');
    expect(input.min).toBe('-2');
    expect(input.max).toBe('2');
    expect(input.step).toBe('0.1');
    expect(input.value).toBe('0');

    ws.destroy();
  });

  it('offset input has aria-label including element name and units', () => {
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(1));

    const input = ws._root.querySelector('.svg-prep-offset-input');
    expect(input.getAttribute('aria-label')).toMatch(/Offset for .+ \(mm\)/);

    ws.destroy();
  });

  it('offset input starts disabled when autoRole is "ignore"', () => {
    const analysis = makeAnalysis(2);
    analysis.elements[1].autoRole = 'ignore';
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, analysis);

    const items = ws._root.querySelectorAll('.svg-prep-object');
    const secondInput = items[1].querySelector('.svg-prep-offset-input');
    expect(secondInput.disabled).toBe(true);

    const firstInput = items[0].querySelector('.svg-prep-offset-input');
    expect(firstInput.disabled).toBe(false);

    ws.destroy();
  });

  it('disables offset input when role changes to "ignore"', () => {
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(1));

    const item = ws._root.querySelector('.svg-prep-object');
    const ignoreRadio = Array.from(
      item.querySelectorAll('input[type="radio"]')
    ).find((r) => r.value === 'ignore');
    ignoreRadio.checked = true;
    ignoreRadio.dispatchEvent(new Event('change', { bubbles: true }));

    const offsetInput = item.querySelector('.svg-prep-offset-input');
    expect(offsetInput.disabled).toBe(true);

    ws.destroy();
  });

  it('re-enables offset input when role changes back from "ignore"', () => {
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(1));

    const item = ws._root.querySelector('.svg-prep-object');
    const radios = item.querySelectorAll('input[type="radio"]');
    const ignoreRadio = Array.from(radios).find((r) => r.value === 'ignore');
    const fgRadio = Array.from(radios).find((r) => r.value === 'foreground');

    ignoreRadio.checked = true;
    ignoreRadio.dispatchEvent(new Event('change', { bubbles: true }));

    fgRadio.checked = true;
    fgRadio.dispatchEvent(new Event('change', { bubbles: true }));

    expect(item.querySelector('.svg-prep-offset-input').disabled).toBe(false);

    ws.destroy();
  });

  it('resets offset value to 0 when role changes to "ignore"', () => {
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(1));

    const item = ws._root.querySelector('.svg-prep-object');
    const offsetInput = item.querySelector('.svg-prep-offset-input');
    offsetInput.value = '0.5';
    offsetInput.dispatchEvent(new Event('input', { bubbles: true }));

    const ignoreRadio = Array.from(
      item.querySelectorAll('input[type="radio"]')
    ).find((r) => r.value === 'ignore');
    ignoreRadio.checked = true;
    ignoreRadio.dispatchEvent(new Event('change', { bubbles: true }));

    expect(offsetInput.value).toBe('0');

    ws.destroy();
  });
});

describe('Phase 9: getOffsetOverrides()', () => {
  beforeEach(() => {
    isEnabled.mockReturnValue(true);
  });
  afterEach(() => {
    isEnabled.mockReturnValue(false);
  });

  it('returns initial zeros for all elements', () => {
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(3));

    expect(ws.getOffsetOverrides()).toEqual([0, 0, 0]);

    ws.destroy();
  });

  it('reflects offset changes from input events', () => {
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(2));

    const inputs = ws._root.querySelectorAll('.svg-prep-offset-input');
    inputs[0].value = '0.5';
    inputs[0].dispatchEvent(new Event('input', { bubbles: true }));

    expect(ws.getOffsetOverrides()[0]).toBe(0.5);
    expect(ws.getOffsetOverrides()[1]).toBe(0);

    ws.destroy();
  });

  it('returns a copy that does not mutate internal state', () => {
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(2));

    const overrides = ws.getOffsetOverrides();
    overrides[0] = 99;

    expect(ws.getOffsetOverrides()[0]).toBe(0);

    ws.destroy();
  });

  it('is callable from the onApply callback before close', () => {
    let capturedOffsets = null;
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(2), {
      onApply: () => {
        capturedOffsets = ws.getOffsetOverrides();
      },
    });

    const inputs = ws._root.querySelectorAll('.svg-prep-offset-input');
    inputs[0].value = '1.0';
    inputs[0].dispatchEvent(new Event('input', { bubbles: true }));

    ws._root.querySelector('[data-action="apply"]').click();
    expect(capturedOffsets).toEqual([1.0, 0]);

    ws.destroy();
  });
});

describe('Phase 9: open() with initialOffsets', () => {
  beforeEach(() => {
    isEnabled.mockReturnValue(true);
  });
  afterEach(() => {
    isEnabled.mockReturnValue(false);
  });

  it('applies initial offsets to input values', () => {
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(3), {
      initialOffsets: [0.5, -0.3, 0],
    });

    const inputs = ws._root.querySelectorAll('.svg-prep-offset-input');
    expect(inputs[0].value).toBe('0.5');
    expect(inputs[1].value).toBe('-0.3');
    expect(inputs[2].value).toBe('0');

    ws.destroy();
  });

  it('getOffsetOverrides reflects initial offsets', () => {
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(2), {
      initialOffsets: [1.0, -0.5],
    });

    expect(ws.getOffsetOverrides()).toEqual([1.0, -0.5]);

    ws.destroy();
  });

  it('ignores non-finite values in initialOffsets', () => {
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(3), {
      initialOffsets: [NaN, null, undefined],
    });

    expect(ws.getOffsetOverrides()).toEqual([0, 0, 0]);

    ws.destroy();
  });

  it('works without initialOffsets (backward compat)', () => {
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(2));

    expect(ws.getOffsetOverrides()).toEqual([0, 0]);

    ws.destroy();
  });
});

describe('Phase 9: design-width input', () => {
  beforeEach(() => {
    isEnabled.mockReturnValue(true);
  });
  afterEach(() => {
    isEnabled.mockReturnValue(false);
  });

  it('renders with default value of 14', () => {
    const ws = createSvgPrepWorkspace(container);

    const input = ws._root.querySelector('.svg-prep-design-width-input');
    expect(input).toBeTruthy();
    expect(input.value).toBe('14');

    ws.destroy();
  });

  it('has correct type and constraints', () => {
    const ws = createSvgPrepWorkspace(container);

    const input = ws._root.querySelector('.svg-prep-design-width-input');
    expect(input.type).toBe('number');
    expect(input.min).toBe('1');
    expect(input.max).toBe('200');
    expect(input.step).toBe('1');

    ws.destroy();
  });

  it('design-width group is visible when flag is enabled', () => {
    const ws = createSvgPrepWorkspace(container);

    const group = ws._root.querySelector('.svg-prep-design-width');
    expect(group.hidden).toBe(false);

    ws.destroy();
  });

  it('has a label with "mm" unit suffix', () => {
    const ws = createSvgPrepWorkspace(container);

    const unit = ws._root.querySelector('.svg-prep-design-width-unit');
    expect(unit).toBeTruthy();
    expect(unit.textContent).toBe('mm');

    ws.destroy();
  });
});

describe('Phase 9: Reset restores offsets', () => {
  beforeEach(() => {
    isEnabled.mockReturnValue(true);
  });
  afterEach(() => {
    isEnabled.mockReturnValue(false);
  });

  it('Reset clears offset values to zero', () => {
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(2));

    const inputs = ws._root.querySelectorAll('.svg-prep-offset-input');
    inputs[0].value = '1.5';
    inputs[0].dispatchEvent(new Event('input', { bubbles: true }));

    ws._root.querySelector('[data-action="reset"]').click();

    expect(inputs[0].value).toBe('0');
    expect(ws.getOffsetOverrides()).toEqual([0, 0]);

    ws.destroy();
  });

  it('Reset re-enables offset inputs disabled by ignore role', () => {
    const ws = createSvgPrepWorkspace(container);
    ws.open(SIMPLE_SVG, makeAnalysis(1));

    const item = ws._root.querySelector('.svg-prep-object');
    const ignoreRadio = Array.from(
      item.querySelectorAll('input[type="radio"]')
    ).find((r) => r.value === 'ignore');
    ignoreRadio.checked = true;
    ignoreRadio.dispatchEvent(new Event('change', { bubbles: true }));

    expect(item.querySelector('.svg-prep-offset-input').disabled).toBe(true);

    ws._root.querySelector('[data-action="reset"]').click();

    expect(item.querySelector('.svg-prep-offset-input').disabled).toBe(false);

    ws.destroy();
  });
});
