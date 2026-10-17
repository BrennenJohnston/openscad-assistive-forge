/**
 * Drawers that slide in the Alt View's look: nothing moves without the
 * look's pace; the room a drawer takes is sized with it; a closing drawer
 * keeps its open layout until its slide ends, out of reach meanwhile, and a
 * press that turns it round keeps it open.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  drawerPace,
  poseAt,
  sidePanelParts,
  slideDrawer,
  stripWidth,
} from '../../src/js/drawer-motion.js';

const root = document.documentElement;

function setPace() {
  root.style.setProperty('--alt-drawer-open', '500ms');
  root.style.setProperty('--alt-drawer-close', '0.45s');
  root.style.setProperty('--alt-drawer-ease', 'ease-in-out');
}

/** A drawer with a size, whose slides finish or are canceled on command. */
function makeDrawer({ height = 200, width = 300 } = {}) {
  const el = document.createElement('div');
  Object.defineProperty(el, 'offsetHeight', { value: height });
  Object.defineProperty(el, 'offsetWidth', { value: width });
  const slides = [];
  el.animate = vi.fn((keyframes, options) => {
    let settle;
    let fail;
    const finished = new Promise((resolve, reject) => {
      settle = resolve;
      fail = reject;
    });
    const slide = {
      keyframes,
      options,
      finished,
      finish: () => settle(),
      cancel: vi.fn(() => {
        const error = new Error('canceled');
        error.name = 'AbortError';
        fail(error);
      }),
    };
    slides.push(slide);
    return slide;
  });
  document.body.appendChild(el);
  return { el, slides };
}

describe('drawer motion', () => {
  beforeEach(() => {
    root.removeAttribute('style');
    document.body.innerHTML = '';
  });

  afterEach(() => {
    root.removeAttribute('style');
  });

  it('has no pace outside the look', () => {
    expect(drawerPace()).toBeNull();
  });

  it('reads the look pace in ms', () => {
    setPace();
    expect(drawerPace()).toEqual({ open: 500, close: 450, ease: 'ease-in-out' });
  });

  it('puts a drawer behind its edge, cut there, at the start of its way', () => {
    expect(poseAt({}, 'bottom', 200, 0)).toEqual({
      transform: 'translateY(200px)',
      clipPath: 'inset(0px 0px 200px 0px)',
    });
    expect(poseAt({ role: 'drawer' }, 'left', 300, 0.5)).toEqual({
      transform: 'translateX(-150px)',
      clipPath: 'inset(0px 0px 0px 150px)',
    });
    expect(poseAt({}, 'top', 100, 1)).toEqual({
      transform: 'translateY(0px)',
      clipPath: 'inset(0px 0px 0px 0px)',
    });
  });

  it('moves a rider whole, at the size it holds', () => {
    expect(poseAt({ role: 'rider' }, 'left', 300, 0)).toEqual({
      transform: 'translateX(-300px)',
    });
    expect(
      poseAt({ role: 'rider', hold: { width: '336px' } }, 'right', 300, 1)
    ).toEqual({ width: '336px', transform: 'translateX(0px)' });
  });

  it('sizes a room between its closed and open sizes', () => {
    expect(
      poseAt({ role: 'space', props: { height: [44, 340] } }, 'top', 296, 0.25)
    ).toEqual({ height: '118px' });
    expect(
      poseAt(
        { role: 'space', props: { width: [36, 508], minWidth: [36, 508] } },
        'left',
        472,
        1
      )
    ).toEqual({ width: '508px', minWidth: '508px' });
  });

  it('makes a desktop panel its own room, its children riding at their width', () => {
    root.style.setProperty('--drawer-collapsed-width', '36px');
    const panel = document.createElement('div');
    Object.defineProperty(panel, 'offsetWidth', { value: 180 });
    for (const width of [179, 0, 179]) {
      const child = document.createElement('div');
      Object.defineProperty(child, 'offsetWidth', { value: width });
      panel.appendChild(child);
    }
    const parts = sidePanelParts(panel, 'left');
    expect(parts[0]).toEqual({
      el: panel,
      role: 'space',
      props: { width: [36, 180], minWidth: [36, 180] },
    });
    expect(parts.slice(1).map((part) => [part.role, part.hold])).toEqual([
      ['rider', { width: '179px' }],
      ['rider', { width: '179px' }],
    ]);
    // On the right the children ride the growing left edge as laid out.
    expect(
      sidePanelParts(panel, 'right')
        .slice(1)
        .map((part) => part.role)
    ).toEqual(['held', 'held']);
    expect(poseAt({ role: 'held', hold: { width: '179px' } }, 'right', 144, 0)).toEqual({
      width: '179px',
    });
  });

  it('moves a room alone at the pace, and leaves an unchanged one still', () => {
    setPace();
    const room = makeDrawer();
    slideDrawer(
      [{ el: room.el, role: 'space', props: { paddingBottom: [52, 297] } }],
      { from: 'bottom', open: true }
    );
    expect(room.slides).toHaveLength(1);
    expect(room.slides[0].keyframes[0].paddingBottom).toBe('52px');
    expect(room.slides[0].keyframes[1].paddingBottom).toBe('297px');

    const still = makeDrawer();
    const whenClosed = vi.fn();
    const move = slideDrawer(
      [{ el: still.el, role: 'space', props: { paddingBottom: [297, 297] } }],
      { from: 'bottom', open: false, whenClosed }
    );
    expect(move).toBeNull();
    expect(whenClosed).toHaveBeenCalledTimes(1);
    expect(still.slides).toHaveLength(0);
  });

  it('closes at once without the look pace', () => {
    const { el } = makeDrawer();
    const whenClosed = vi.fn();
    expect(slideDrawer([{ el }], { from: 'bottom', open: false, whenClosed })).toBeNull();
    expect(whenClosed).toHaveBeenCalledTimes(1);
    expect(el.animate).not.toHaveBeenCalled();
  });

  it('closes at once when told the layout itself is changing', () => {
    setPace();
    const { el } = makeDrawer();
    const whenClosed = vi.fn();
    slideDrawer([{ el }], { from: 'left', open: false, whenClosed, instant: true });
    expect(whenClosed).toHaveBeenCalledTimes(1);
    expect(el.animate).not.toHaveBeenCalled();
  });

  it('opens over the open pace and settles back against its stop', () => {
    setPace();
    const { el, slides } = makeDrawer({ height: 200 });
    slideDrawer([{ el }], { from: 'bottom', open: true });
    const [slide] = slides;
    expect(slide.options.duration).toBe(500);
    expect(slide.keyframes.map((k) => k.offset)).toEqual([0, 0.8, 0.9, 1]);
    expect(slide.keyframes[0].transform).toBe('translateY(200px)');
    expect(slide.keyframes[1].transform).toBe('translateY(0px)');
    expect(slide.keyframes[2].transform).toBe('translateY(4px)');
    expect(slide.keyframes[3].transform).toBe('translateY(0px)');
  });

  it('keeps the strip of a desktop panel in view', () => {
    setPace();
    const { el, slides } = makeDrawer({ width: 180 });
    slideDrawer([{ el }], { from: 'right', open: true, keep: 36 });
    expect(slides[0].keyframes[0].transform).toBe('translateX(144px)');
  });

  it('lays a drawer out closed only when its slide ends, out of reach meanwhile', async () => {
    setPace();
    const { el, slides } = makeDrawer();
    const whenClosed = vi.fn();
    const done = slideDrawer([{ el }], {
      from: 'bottom',
      open: false,
      inert: [el],
      whenClosed,
    });
    expect(slides[0].options.duration).toBe(450);
    expect(el.inert).toBe(true);
    expect(whenClosed).not.toHaveBeenCalled();
    slides[0].finish();
    await expect(done).resolves.toBe(true);
    expect(whenClosed).toHaveBeenCalledTimes(1);
    expect(el.inert).toBe(false);
  });

  it('a press that turns a closing drawer round keeps it open and in reach', async () => {
    setPace();
    const { el, slides } = makeDrawer();
    const whenClosed = vi.fn();
    const closing = slideDrawer([{ el }], {
      from: 'bottom',
      open: false,
      inert: [el],
      whenClosed,
    });
    slideDrawer([{ el }], { from: 'bottom', open: true });
    expect(slides[0].cancel).toHaveBeenCalled();
    await expect(closing).resolves.toBe(false);
    expect(whenClosed).not.toHaveBeenCalled();
    expect(el.inert).toBe(false);
    expect(slides).toHaveLength(2);
  });

  it('turned round in mid-slide, keeps the sizes its slide began with', () => {
    setPace();
    const panel = makeDrawer();
    slideDrawer(
      [{ el: panel.el, role: 'space', props: { width: [36, 508] } }],
      { from: 'left', open: false, whenClosed: vi.fn() }
    );
    // Measured mid-slide, the panel reports the width its slide gave it.
    slideDrawer(
      [{ el: panel.el, role: 'space', props: { width: [36, 300] } }],
      { from: 'left', open: true }
    );
    const last = panel.slides[1].keyframes;
    expect(last[last.length - 1].width).toBe('508px');
  });

  it('moves every part of a drawer together', () => {
    setPace();
    const { el, slides } = makeDrawer({ width: 300 });
    const rider = makeDrawer();
    slideDrawer(
      [{ el }, { el: rider.el, role: 'rider' }],
      { from: 'left', open: true }
    );
    expect(slides).toHaveLength(1);
    expect(rider.slides).toHaveLength(1);
    expect(rider.slides[0].keyframes[0]).not.toHaveProperty('clipPath');
    expect(rider.slides[0].keyframes[0].transform).toBe('translateX(-300px)');
  });

  it('reads the strip width from its token', () => {
    root.style.setProperty('--drawer-collapsed-width', '36px');
    expect(stripWidth()).toBe(36);
  });
});
