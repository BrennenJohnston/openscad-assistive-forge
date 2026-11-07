/**
 * One way to move a picture and one way to find a shape, in every purpose of
 * the drawing editor (S9 in docs/specs/UI_STANDARDS.md): the arithmetic, then
 * the charm's relief picture, which had its own zoom row and no drag.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../src/js/focus-trap.js', async (importOriginal) => ({
  ...(await importOriginal()),
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

import {
  ARROW_PANS,
  PAN_FRACTION,
  centerInScroller,
  createPinch,
  keptOnDrawing,
  pannedView,
  viewAfterDrag,
  zoomedView,
} from '../../src/js/drawing-editor/navigation.js';
import { createDrawingEditor } from '../../src/js/drawing-editor/surface.js';
import { EDITOR_STRINGS as S } from '../../src/js/drawing-editor/strings.js';
import { analyzeSvg } from '../../src/js/svg-preparer.js';

const NATURAL = { x: 0, y: 0, w: 100, h: 50 };

describe('the arithmetic of a view', () => {
  it('pans by a tenth, and never off the drawing', () => {
    expect(PAN_FRACTION).toBe(0.1);
    expect(ARROW_PANS.ArrowRight).toEqual([0.1, 0]);
    expect(pannedView(NATURAL, 0.1, 0, NATURAL).x).toBeCloseTo(10, 6);
    const far = pannedView({ ...NATURAL, x: 49 }, 0.5, 0, NATURAL);
    expect(far.x).toBe(50);
    expect(keptOnDrawing({ ...NATURAL, y: -99 }, NATURAL).y).toBe(-25);
  });

  it('zooms about the middle, or about a point that stays where it is', () => {
    const closer = zoomedView(NATURAL, 2);
    expect(closer).toEqual({ x: 25, y: 12.5, w: 50, h: 25 });
    const about = zoomedView(NATURAL, 2, { x: 10, y: 10 });
    expect(about.x).toBe(5);
    expect(about.y).toBe(5);
    expect(about.w).toBe(50);
  });

  it('drags from the view at the press, however the steps fall', () => {
    const box = { width: 200, height: 100 };
    const view = viewAfterDrag(NATURAL, box, 20, -10, NATURAL);
    expect(view.x).toBe(-10);
    expect(view.y).toBe(5);
    // A box with no size leaves the view where it was.
    expect(viewAfterDrag(NATURAL, { width: 0, height: 0 }, 9, 9)).toEqual(
      NATURAL
    );
  });

  it('pinches with two fingers, and a mouse is never one of them', () => {
    let view = { ...NATURAL };
    const pinch = createPinch({
      getView: () => view,
      setView: (v) => {
        view = v;
      },
      getBox: () => ({ width: 200, height: 100 }),
      getNatural: () => NATURAL,
    });
    const e = (pointerId, clientX, clientY, pointerType = 'touch') => ({
      pointerId,
      clientX,
      clientY,
      pointerType,
      preventDefault: () => {},
    });
    expect(pinch.down(e(1, 0, 0, 'mouse'))).toBe(false);
    expect(pinch.down(e(1, 50, 50))).toBe(false);
    expect(pinch.down(e(2, 150, 50))).toBe(true);
    // Twice as far apart: half the view, the middle kept.
    expect(pinch.move(e(1, 0, 50))).toBe(true);
    pinch.move(e(2, 200, 50));
    expect(view.w).toBeCloseTo(50, 6);
    expect(view.x + view.w / 2).toBeCloseTo(50, 6);
    pinch.up(e(1));
    expect(pinch.active()).toBe(false);
  });

  it('brings a row to the middle of its list', () => {
    const scroller = document.createElement('div');
    const row = document.createElement('div');
    scroller.getBoundingClientRect = () => ({ top: 100, height: 400 });
    row.getBoundingClientRect = () => ({ top: 450, height: 40 });
    scroller.scrollTop = 1000;
    centerInScroller(row, scroller);
    // The row's middle is at 470, the list's at 300: 170 further down.
    expect(scroller.scrollTop).toBe(1170);
  });
});

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50">
${Array.from({ length: 12 }, (_, i) => `<rect id="s${i}" x="${i * 8}" y="${i % 2 ? 30 : 5}" width="6" height="6"/>`).join('\n')}
</svg>`;

describe('the relief picture moves as the others do', () => {
  let editor;
  let surfaceEl;

  const panel = () => editor._root.querySelector('.drawing-editor-panel');
  const toggle = () =>
    editor._root.querySelector('.drawing-editor-panel-toggle');
  const pane = () => editor._root.querySelector('.svg-prep-result-pane');
  const picture = () => pane().querySelector('svg');
  const viewOf = () =>
    picture().getAttribute('viewBox').split(/[\s,]+/).map(Number);
  const zoomGroup = () => editor._root.querySelector('.drawing-editor-zoom');
  const press = (action) =>
    zoomGroup().querySelector(`[data-action="${action}"]`).click();
  const hit = (i) =>
    pane().querySelector(`.svg-prep-hit-path[data-index="${i}"]`);
  const pointer = (el, type, x, y, extra = {}) =>
    el.dispatchEvent(
      Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
        button: 0,
        clientX: x,
        clientY: y,
        pointerId: 1,
        pointerType: 'mouse',
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
        ...extra,
      })
    );
  const key = (el, k, extra = {}) =>
    el.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: k,
        bubbles: true,
        cancelable: true,
        ...extra,
      })
    );

  beforeEach(async () => {
    document.body.innerHTML = '<div id="surface"></div>';
    surfaceEl = document.getElementById('surface');
    editor = createDrawingEditor({ surfaceEl });
    editor.open(SVG, analyzeSvg(SVG), { purpose: 'relief', mode: 'file' });
    await vi.waitFor(() => expect(hit(11)).not.toBeNull(), {
      timeout: 5000,
    });
    Object.defineProperty(picture(), 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 200, height: 100 }),
    });
    picture().setPointerCapture = () => {};
    pane().setPointerCapture = () => {};
    pane().releasePointerCapture = () => {};
  });

  afterEach(() => {
    editor.destroy();
    document.body.innerHTML = '';
  });

  it('has the same seven buttons by the same names, and Select and Hand, and no zoom row of its own in the toolbar way', () => {
    expect(zoomGroup().hidden).toBe(false);
    const names = [...zoomGroup().querySelectorAll('button')].map(
      (b) => b.getAttribute('aria-label') || b.textContent
    );
    expect(names).toEqual([
      S.fit,
      S.zoomIn,
      S.zoomOut,
      S.panLeft,
      S.panUp,
      S.panDown,
      S.panRight,
    ]);
    const tools = [
      ...editor._root.querySelectorAll('.drawing-editor-tool'),
    ].filter((b) => !b.hidden);
    expect(tools.map((b) => b.dataset.tool)).toEqual(['select', 'hand']);
    expect(editor._root.querySelector('.drawing-editor-paint').hidden).toBe(
      true
    );
  });

  it('the buttons move the picture a tenth at a time, and Fit brings it back', () => {
    const [x0, , w0] = viewOf();
    press('zoom-in');
    const [, , w1] = viewOf();
    expect(w1).toBeCloseTo(w0 / 1.5, 3);
    const [x1] = viewOf();
    press('pan-right');
    expect(viewOf()[0] - x1).toBeCloseTo(w1 * 0.1, 3);
    press('fit');
    expect(viewOf()[0]).toBe(x0);
    expect(viewOf()[2]).toBe(w0);
  });

  it('a drag on empty ground pans with every step, and the click that ends it chooses nothing', () => {
    const [x0, , w] = viewOf();
    const scale = Math.min(200 / w, 100 / viewOf()[3]);
    pointer(pane(), 'pointerdown', 100, 50);
    for (const x of [110, 118, 140, 131, 160]) {
      pointer(pane(), 'pointermove', x, 50);
      expect(viewOf()[0]).toBeCloseTo(x0 - (x - 100) / scale, 3);
    }
    pointer(pane(), 'pointerup', 160, 50);
    pointer(pane(), 'click', 160, 50);
    expect(editor._workspace.getSelected?.() ?? []).toEqual([]);
  });

  it('a drag that fires no click, as a finger does not, leaves the next tap to choose its shape', () => {
    pointer(pane(), 'pointerdown', 100, 50);
    pointer(pane(), 'pointermove', 160, 50);
    pointer(pane(), 'pointerup', 160, 50);
    pointer(hit(3), 'pointerdown', 50, 25);
    pointer(hit(3), 'pointerup', 50, 25);
    pointer(hit(3), 'click', 50, 25);
    expect(
      editor._root.querySelectorAll('.svg-prep-object--selected')
    ).toHaveLength(1);
  });

  it('a press that does not travel is the click it always was, and a press on a shape never pans', () => {
    const [x0] = viewOf();
    pointer(hit(3), 'pointerdown', 50, 25);
    pointer(hit(3), 'pointermove', 90, 25);
    expect(viewOf()[0]).toBe(x0);
    pointer(hit(3), 'pointerup', 90, 25);
  });

  it('the Hand tool pans from a shape too, and its press chooses nothing', () => {
    editor.setTool('hand');
    expect(editor.getTool()).toBe('hand');
    expect(
      editor._root
        .querySelector('[data-tool="hand"]')
        .getAttribute('aria-pressed')
    ).toBe('true');
    const [x0] = viewOf();
    pointer(hit(3), 'pointerdown', 50, 25);
    pointer(hit(3), 'pointermove', 90, 25);
    expect(viewOf()[0]).toBeLessThan(x0);
    pointer(hit(3), 'pointerup', 90, 25);
    pointer(hit(3), 'click', 90, 25);
    expect(
      editor._root.querySelectorAll('.svg-prep-object--selected')
    ).toHaveLength(0);
  });

  it('Shift with an arrow pans; the bare arrow walks the shapes and says which, and pans in the Hand tool', () => {
    press('zoom-in');
    const [x0] = viewOf();
    key(pane(), 'ArrowRight', { shiftKey: true });
    const [x1, , w] = viewOf();
    expect(x1 - x0).toBeCloseTo(w * 0.1, 3);
    key(pane(), 'ArrowRight');
    expect(viewOf()[0]).toBe(x1);
    const status = editor._root.querySelector('.drawing-editor-status');
    expect(status.textContent).toMatch(/,/);
    expect(
      pane().querySelectorAll('.svg-prep-overlay-hover path').length
    ).toBeGreaterThan(0);
    editor.setTool('hand');
    key(pane(), 'ArrowRight');
    expect(viewOf()[0]).toBeGreaterThan(x1);
  });

  it('plus and minus zoom and 0 fits, on the picture, and V and H pick the tools', () => {
    const [, , w0] = viewOf();
    key(pane(), '+');
    expect(viewOf()[2]).toBeLessThan(w0);
    key(pane(), '0');
    expect(viewOf()[2]).toBe(w0);
    key(pane(), 'h');
    expect(editor.getTool()).toBe('hand');
    key(pane(), 'v');
    expect(editor.getTool()).toBe('select');
  });

  it('a shape chosen on the picture opens a closed list and brings its row to the middle', () => {
    toggle().click();
    expect(panel().hidden).toBe(true);
    const shapes = editor._sections.regions.details;
    shapes.open = false;
    let centered = 0;
    Object.defineProperty(panel(), 'scrollTop', {
      get: () => centered,
      set: (v) => {
        centered = v;
      },
      configurable: true,
    });
    panel().getBoundingClientRect = () => ({ top: 0, height: 400 });
    const row = editor._root.querySelector(
      '.svg-prep-object[data-index="9"]'
    );
    row.getBoundingClientRect = () => ({ top: 900, height: 40 });
    pointer(hit(9), 'pointerdown', 50, 25);
    pointer(hit(9), 'pointerup', 50, 25);
    pointer(hit(9), 'click', 50, 25);
    expect(panel().hidden).toBe(false);
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(shapes.open).toBe(true);
    expect(centered).toBe(720);
    expect(row.classList.contains('svg-prep-object--selected')).toBe(true);
    // A plain press hands the keyboard to the row, so Tab reaches its controls.
    expect(document.activeElement).toBe(row);
  });

  it('a press with Ctrl or Shift keeps the keyboard on the picture, for the next shape', () => {
    const focused = document.activeElement;
    pointer(hit(2), 'click', 50, 25, { ctrlKey: true });
    expect(document.activeElement).toBe(focused);
    expect(
      editor._root
        .querySelector('.svg-prep-object[data-index="2"]')
        .classList.contains('svg-prep-object--selected')
    ).toBe(true);
  });

  it('Enter on a walked shape chooses it the same way', () => {
    key(pane(), 'ArrowRight');
    key(pane(), 'Enter');
    expect(
      editor._root.querySelectorAll('.svg-prep-object--selected')
    ).toHaveLength(1);
    expect(panel().hidden).toBe(false);
  });
});
