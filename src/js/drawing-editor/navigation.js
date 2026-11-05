/**
 * How a picture in the drawing editor moves, one rule for every purpose.
 *
 * The charm's relief picture, the stencil's regions and the map's shapes are
 * drawn three ways, but a person moves all of them the same way: a drag on
 * empty ground pans (the Hand tool pans from anywhere), Shift with an arrow key
 * moves a tenth of the view, the bare arrows do so in the Hand tool and walk
 * the shapes otherwise, the wheel and two fingers zoom, and four pan buttons
 * stand beside Fit, + and -. docs/specs/UI_STANDARDS.md (S9) carries the rule.
 *
 * Everything here is arithmetic on a view box, so it can be tested without a
 * layout engine. A view is {x, y, w, h} in the drawing's units.
 *
 * @license GPL-3.0-or-later
 */

export const ZOOM_STEP = 1.5;
/** What an arrow key or a pan button moves the view by: a tenth of it. */
export const PAN_FRACTION = 0.1;
/** A press on empty ground that travels less than this is a click, not a pan. */
export const PAN_MIN_PX = 3;
/** How far two fingers may take the zoom, as shares of the whole drawing. */
const PINCH_MIN_SHARE = 1 / 64;
const PINCH_MAX_SHARE = 8;

/** Each arrow key as the share of the view it pans, across and down. */
export const ARROW_PANS = Object.freeze({
  ArrowLeft: [-PAN_FRACTION, 0],
  ArrowRight: [PAN_FRACTION, 0],
  ArrowUp: [0, -PAN_FRACTION],
  ArrowDown: [0, PAN_FRACTION],
});

/** Each arrow key as a direction a walk over the shapes can take. */
export const ARROW_WALKS = Object.freeze({
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
});

/** The tools every purpose has, which move the picture or point at a shape. */
export const NAVIGATION_TOOLS = Object.freeze(['select', 'hand']);

/**
 * Map a pointer position into viewBox units.
 *
 * @param {{left: number, top: number, width: number, height: number}} box -
 *   The svg element's box on screen
 * @param {{x: number, y: number, w: number, h: number}} vb
 * @param {number} clientX
 * @param {number} clientY
 * @returns {{x: number, y: number}}
 */
export function clientToViewBox(box, vb, clientX, clientY) {
  if (!(box.width > 0) || !(box.height > 0) || !(vb.w > 0) || !(vb.h > 0)) {
    return { x: vb.x, y: vb.y };
  }
  const scale = Math.min(box.width / vb.w, box.height / vb.h);
  const drawnW = vb.w * scale;
  const drawnH = vb.h * scale;
  const offsetX = (box.width - drawnW) / 2;
  const offsetY = (box.height - drawnH) / 2;
  return {
    x: vb.x + (clientX - box.left - offsetX) / scale,
    y: vb.y + (clientY - box.top - offsetY) / scale,
  };
}

/**
 * A view kept on the drawing: its middle never leaves the drawing's box, so
 * the picture cannot be steered out of sight; Fit brings the whole of it back.
 *
 * @param {{x: number, y: number, w: number, h: number}} view
 * @param {{x: number, y: number, w: number, h: number}|null} natural
 * @returns {{x: number, y: number, w: number, h: number}}
 */
export function keptOnDrawing(view, natural) {
  if (!natural) return view;
  return {
    ...view,
    x: Math.min(
      Math.max(view.x, natural.x - view.w / 2),
      natural.x + natural.w - view.w / 2
    ),
    y: Math.min(
      Math.max(view.y, natural.y - view.h / 2),
      natural.y + natural.h - view.h / 2
    ),
  };
}

/**
 * A view moved by shares of its own size: a positive x looks further right, a
 * positive y further down.
 */
export function pannedView(view, fx, fy, natural = null) {
  return keptOnDrawing(
    { ...view, x: view.x + fx * view.w, y: view.y + fy * view.h },
    natural
  );
}

/**
 * A view zoomed about a point (the middle of the view if none is given); a
 * factor over 1 looks closer.
 */
export function zoomedView(view, factor, about = null) {
  const cx = about ? about.x : view.x + view.w / 2;
  const cy = about ? about.y : view.y + view.h / 2;
  return {
    x: cx - (cx - view.x) / factor,
    y: cy - (cy - view.y) / factor,
    w: view.w / factor,
    h: view.h / factor,
  };
}

/**
 * The view a drag has moved to: the view at the press, less the pixels the
 * pointer has traveled since.
 *
 * Always from the press, never from where the pointer reads in the view as
 * it is now. The drag is moving that view, so reading through it feeds each
 * step back into the next and the picture jumps between frames.
 *
 * @param {{x: number, y: number, w: number, h: number}} start - The view at the press
 * @param {{width: number, height: number}} box - The svg element's box on screen
 * @param {number} dx - Pixels traveled across
 * @param {number} dy - Pixels traveled down
 * @param {{x: number, y: number, w: number, h: number}|null} [natural]
 * @returns {{x: number, y: number, w: number, h: number}}
 */
export function viewAfterDrag(start, box, dx, dy, natural = null) {
  if (!(box.width > 0) || !(box.height > 0)) return { ...start };
  const scale = Math.min(box.width / start.w, box.height / start.h);
  return keptOnDrawing(
    { ...start, x: start.x - dx / scale, y: start.y - dy / scale },
    natural
  );
}

/**
 * Two fingers on a picture: they pinch and carry it. A touch is not a mouse
 * with one position, it is pointers that arrive and leave one by one, so this
 * keeps them by id.
 *
 * @param {object} args
 * @param {() => object|null} args.getView
 * @param {(view: object) => void} args.setView
 * @param {() => {width: number, height: number}} args.getBox
 * @param {() => object|null} args.getNatural
 * @returns {{down: Function, move: Function, up: Function, active: Function}}
 */
export function createPinch({ getView, setView, getBox, getNatural }) {
  const pointers = new Map();
  let pinch = null;
  const spanOf = (a, b) =>
    Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  const midOf = (a, b) => ({
    x: (a.clientX + b.clientX) / 2,
    y: (a.clientY + b.clientY) / 2,
  });
  return {
    /** @returns {boolean} whether two fingers are down now */
    down(event) {
      if (event.pointerType === 'mouse') return false;
      pointers.set(event.pointerId, event);
      if (pointers.size !== 2) return false;
      const [a, b] = [...pointers.values()];
      const view = getView();
      if (!view) return false;
      pinch = {
        span: spanOf(a, b),
        mid: midOf(a, b),
        view,
        box: getBox(),
      };
      return true;
    },
    /** @returns {boolean} whether this move was the pinch's */
    move(event) {
      if (!pointers.has(event.pointerId)) return false;
      pointers.set(event.pointerId, event);
      if (pointers.size !== 2 || !pinch) return false;
      const [a, b] = [...pointers.values()];
      const span = spanOf(a, b);
      if (span <= 0 || pinch.span <= 0) return true;
      event.preventDefault();
      // Fingers apart, a smaller view: a view IS the window onto the drawing,
      // so looking closer means asking for less of it.
      const natural = getNatural() || pinch.view;
      const w = Math.max(
        natural.w * PINCH_MIN_SHARE,
        Math.min(
          natural.w * PINCH_MAX_SHARE,
          (pinch.view.w * pinch.span) / span
        )
      );
      const h = pinch.view.h * (w / pinch.view.w);
      const mid = midOf(a, b);
      const dx =
        (mid.x - pinch.mid.x) * (pinch.view.w / Math.max(1, pinch.box.width));
      const dy =
        (mid.y - pinch.mid.y) * (pinch.view.h / Math.max(1, pinch.box.height));
      setView({
        x: pinch.view.x + (pinch.view.w - w) / 2 - dx,
        y: pinch.view.y + (pinch.view.h - h) / 2 - dy,
        w,
        h,
      });
      return true;
    },
    up(event) {
      pointers.delete(event.pointerId);
      if (pointers.size < 2) pinch = null;
    },
    active: () => pinch !== null,
    clear() {
      pointers.clear();
      pinch = null;
    },
  };
}

/**
 * The nearest region in a direction, by interior point.
 *
 * "In a direction" means the other region's center lies inside a 90-degree
 * cone opening that way, so pressing Right never lands on something that is
 * mostly above; among those, the closest wins.
 *
 * @param {Array<{key: string, interior: {x: number, y: number}}>} regions
 * @param {string|null} fromKey
 * @param {'left'|'right'|'up'|'down'} direction
 * @returns {string|null}
 */
export function nearestInDirection(regions, fromKey, direction) {
  const from = regions.find((r) => r.key === fromKey);
  if (!from) return regions[0]?.key ?? null;
  const dirs = {
    left: [-1, 0],
    right: [1, 0],
    up: [0, -1],
    down: [0, 1],
  };
  const [dx, dy] = dirs[direction] || [0, 0];
  let best = null;
  let bestDist = Infinity;
  for (const r of regions) {
    if (r.key === fromKey || !r.interior) continue;
    const vx = r.interior.x - from.interior.x;
    const vy = r.interior.y - from.interior.y;
    const along = vx * dx + vy * dy;
    const across = Math.abs(vx * dy) + Math.abs(vy * dx);
    if (along <= 0 || across > along) continue;
    const dist = vx * vx + vy * vy;
    if (dist < bestDist) {
      bestDist = dist;
      best = r.key;
    }
  }
  return best;
}

/**
 * Bring a row to the middle of the list that scrolls it, moving nothing else
 * on the page (`scrollIntoView` would move every scroller around it). The
 * scroll is immediate, so a request for less motion has nothing to ask for.
 *
 * @param {HTMLElement} row
 * @param {HTMLElement} scroller
 */
export function centerInScroller(row, scroller) {
  if (!row || !scroller) return;
  const a = row.getBoundingClientRect();
  const b = scroller.getBoundingClientRect();
  scroller.scrollTop += a.top + a.height / 2 - (b.top + b.height / 2);
}
