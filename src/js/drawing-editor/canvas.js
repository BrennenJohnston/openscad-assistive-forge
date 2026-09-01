/**
 * The region canvas: the one view a person points at (DP-20).
 *
 * An inline <svg> with the original drawing underneath and one <path> per
 * REGION on top, each carrying `data-region`, so the browser's own hit-testing
 * answers "which region did they click" exactly - the path IS the region. The
 * tools are the ones a vector editor has: Select, Marquee, Paint, Remove,
 * Hand. Everything the canvas decides it reports through callbacks; the plan
 * itself lives in the surface, so a click and a table row change the same
 * thing by the same path.
 *
 * Keyboard: the canvas is one Tab stop. Arrow keys move a HIGHLIGHT to the
 * nearest region in that direction, Enter or Space toggles it in the
 * selection, Home and End go to the first and last. The regions table is the
 * full keyboard path; this is the shortcut for someone who can see the
 * drawing and prefers to walk it.
 *
 * Coordinates: pointer positions are mapped into the drawing's units with the
 * viewBox and the element's box under `preserveAspectRatio="xMidYMid meet"`,
 * the arithmetic the browser does, written out here so it can be tested
 * without a layout engine and so a marquee is compared against the regions'
 * own bounding boxes rather than against something the DOM has to measure.
 *
 * @license GPL-3.0-or-later
 */

import { EDITOR_STRINGS as S } from './strings.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** The tools, in toolbar order, with the key that picks each. */
export const TOOLS = Object.freeze([
  { id: 'select', key: 'v' },
  { id: 'marquee', key: 'm' },
  { id: 'paint', key: 'p' },
  { id: 'remove', key: 'r' },
  { id: 'hand', key: 'h' },
]);

/** Room around the drawing when it is fitted, as a fraction of its size. */
const FIT_PADDING = 0.04;
const ZOOM_STEP = 1.5;
/** A marquee smaller than this is a click that wandered, not a rectangle. */
const MARQUEE_MIN_UNITS = 0.5;

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
 * The regions whose bounding boxes lie wholly inside a rectangle.
 *
 * @param {Array<{key: string, bbox: {minX, minY, maxX, maxY}}>} regions
 * @param {{x1: number, y1: number, x2: number, y2: number}} rect - Any corner order
 * @returns {string[]} region keys
 */
export function regionsInside(regions, rect) {
  const minX = Math.min(rect.x1, rect.x2);
  const maxX = Math.max(rect.x1, rect.x2);
  const minY = Math.min(rect.y1, rect.y2);
  const maxY = Math.max(rect.y1, rect.y2);
  return regions
    .filter(
      (r) =>
        r.bbox &&
        r.bbox.minX >= minX &&
        r.bbox.maxX <= maxX &&
        r.bbox.minY >= minY &&
        r.bbox.maxY <= maxY
    )
    .map((r) => r.key);
}

/**
 * The nearest region in a direction, by interior point.
 *
 * "In a direction" means the other region's centre lies inside a 90-degree
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
 * @param {object} args
 * @param {HTMLElement} args.container - Where the canvas mounts
 * @param {string} args.labelId - id of the element that names the canvas
 * @param {object} [args.on] - Callbacks: onClick(key, shift), onEmptyClick(shift),
 *   onMarquee(keys, shift), onPaint(key), onRemove(key), onHighlight(key),
 *   onToggle(key), onOpenColour(key), onPan()
 * @returns {object}
 */
export function createRegionCanvas({ container, labelId, on = {} }) {
  const root = document.createElement('div');
  root.className = 'drawing-editor-canvas';

  const help = document.createElement('p');
  help.className = 'sr-only';
  help.id = `${labelId}-help`;
  help.textContent = S.canvasHelp;

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'drawing-editor-canvas-svg');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('tabindex', '0');
  svg.setAttribute('role', 'group');
  svg.setAttribute('aria-labelledby', labelId);
  svg.setAttribute('aria-describedby', help.id);
  svg.dataset.tool = 'select';

  // The layers, in drawing order (DP-21): the art underneath, the regions
  // tinted over it, the plate being stepped through, the keyboard highlight
  // (two strokes), the marquee on top. A hatch pattern for removed regions
  // lives in defs; its colour comes from the stylesheet's tokens.
  const defs = document.createElementNS(SVG_NS, 'defs');
  const hatchId = `${labelId}-hatch`;
  const hatch = document.createElementNS(SVG_NS, 'pattern');
  hatch.id = hatchId;
  hatch.setAttribute('patternUnits', 'userSpaceOnUse');
  hatch.setAttribute('width', '6');
  hatch.setAttribute('height', '6');
  hatch.setAttribute('patternTransform', 'rotate(45)');
  const hatchLine = document.createElementNS(SVG_NS, 'line');
  hatchLine.setAttribute('x1', '0');
  hatchLine.setAttribute('y1', '0');
  hatchLine.setAttribute('x2', '0');
  hatchLine.setAttribute('y2', '6');
  hatchLine.setAttribute('class', 'drawing-editor-hatch-line');
  hatch.appendChild(hatchLine);
  defs.appendChild(hatch);

  const artLayer = document.createElementNS(SVG_NS, 'g');
  artLayer.setAttribute('data-layer', 'art');
  artLayer.setAttribute('aria-hidden', 'true');
  const regionLayer = document.createElementNS(SVG_NS, 'g');
  regionLayer.setAttribute('data-layer', 'regions');
  const plateLayer = document.createElementNS(SVG_NS, 'g');
  plateLayer.setAttribute('data-layer', 'plate');
  plateLayer.setAttribute('aria-hidden', 'true');
  const highlightLayer = document.createElementNS(SVG_NS, 'g');
  highlightLayer.setAttribute('data-layer', 'highlight');
  highlightLayer.setAttribute('aria-hidden', 'true');
  const halo = document.createElementNS(SVG_NS, 'path');
  halo.setAttribute('class', 'drawing-editor-highlight-halo');
  const focusStroke = document.createElementNS(SVG_NS, 'path');
  focusStroke.setAttribute('class', 'drawing-editor-highlight-stroke');
  highlightLayer.append(halo, focusStroke);
  highlightLayer.setAttribute('visibility', 'hidden');
  const marquee = document.createElementNS(SVG_NS, 'rect');
  marquee.setAttribute('data-layer', 'marquee');
  marquee.setAttribute('class', 'drawing-editor-marquee');
  marquee.setAttribute('aria-hidden', 'true');
  marquee.setAttribute('visibility', 'hidden');
  svg.append(defs, artLayer, regionLayer, plateLayer, highlightLayer, marquee);
  svg.dataset.view = 'plan';

  root.append(help, svg);
  container.appendChild(root);

  let regions = [];
  let natural = { x: 0, y: 0, w: 100, h: 100 };
  let vb = { ...natural };
  let tool = 'select';
  let highlighted = null;
  let drag = null;
  const pathByKey = new Map();

  /** Whether the person asked for less motion; read each time it matters. */
  const reduceMotion = () =>
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches === true;

  function applyViewBox() {
    svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  }

  /** Where the pointer is, in the drawing's units. */
  function toUnits(event) {
    return clientToViewBox(
      svg.getBoundingClientRect(),
      vb,
      event.clientX,
      event.clientY
    );
  }

  /**
   * Put a drawing and its regions on the canvas.
   *
   * @param {string} svgString - The original art, drawn underneath
   * @param {Array<object>} list - Regions with key, rings-as-path (`d`), bbox
   * @param {{minX, minY, maxX, maxY}|null} bbox - The drawing's extent
   */
  function setDrawing(svgString, list, bbox) {
    regions = list;
    pathByKey.clear();
    while (artLayer.firstChild) artLayer.removeChild(artLayer.firstChild);
    while (regionLayer.firstChild)
      regionLayer.removeChild(regionLayer.firstChild);

    if (svgString) {
      const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml');
      const source = doc.querySelector('svg');
      if (source) {
        for (const child of Array.from(source.childNodes)) {
          if (child.nodeType === 1) {
            const tag = child.tagName.toLowerCase();
            // Scripts and foreign content have no business in a picture.
            if (tag === 'script' || tag === 'foreignobject') continue;
            artLayer.appendChild(document.importNode(child, true));
          }
        }
      }
    }

    for (const r of list) {
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', r.d);
      path.setAttribute('class', 'drawing-editor-region');
      path.setAttribute('fill-rule', 'evenodd');
      path.dataset.region = r.key;
      regionLayer.appendChild(path);
      pathByKey.set(r.key, path);
    }
    clearHighlight();
    showPlate(null);

    if (bbox && bbox.maxX > bbox.minX && bbox.maxY > bbox.minY) {
      const w = bbox.maxX - bbox.minX;
      const h = bbox.maxY - bbox.minY;
      natural = {
        x: bbox.minX - w * FIT_PADDING,
        y: bbox.minY - h * FIT_PADDING,
        w: w * (1 + 2 * FIT_PADDING),
        h: h * (1 + 2 * FIT_PADDING),
      };
    } else {
      natural = { x: 0, y: 0, w: 100, h: 100 };
    }
    highlighted = null;
    fit();
  }

  /**
   * Paint the plan onto the regions: each path takes its colour, and the
   * selected, removed and highlighted ones say so in a class.
   *
   * @param {object} state
   * @param {Object<string, string>} state.fills - key -> css colour, or ''
   * @param {Set<string>} state.selected
   * @param {Set<string>} state.removed
   */
  function setState({ fills = {}, selected = new Set(), removed = new Set() }) {
    for (const [key, path] of pathByKey) {
      const fill = fills[key];
      if (fill) path.style.setProperty('--region-fill', fill);
      else path.style.removeProperty('--region-fill');
      path.classList.toggle('is-selected', selected.has(key));
      path.classList.toggle('is-removed', removed.has(key));
      if (removed.has(key)) path.setAttribute('fill', `url(#${hatchId})`);
      else path.removeAttribute('fill');
      path.classList.toggle('is-highlighted', key === highlighted);
      path.setAttribute('aria-hidden', 'true');
    }
  }

  /**
   * The keyboard highlight: a two-stroke outline drawn OVER the regions
   * (the region's own stroke would sit under its neighbours), which PULSES
   * for three beats and then settles, unless the person asked for less
   * motion, in which case it settles at once. The classes are the contract a
   * spec can read: `is-pulsing` until the animation ends, then `is-steady`.
   *
   * @param {string|null} key
   * @param {{pulse?: boolean}} [options] - Pulse (a keyboard move) or settle
   *   at once (a click, a hover)
   */
  function setHighlight(key, { pulse = false } = {}) {
    if (highlighted && pathByKey.has(highlighted)) {
      pathByKey.get(highlighted).classList.remove('is-highlighted');
    }
    highlighted = key && pathByKey.has(key) ? key : null;
    if (!highlighted) {
      clearHighlight();
      return;
    }
    const path = pathByKey.get(highlighted);
    path.classList.add('is-highlighted');
    const d = path.getAttribute('d');
    halo.setAttribute('d', d);
    focusStroke.setAttribute('d', d);
    highlightLayer.setAttribute('visibility', 'visible');
    highlightLayer.dataset.region = highlighted;
    highlightLayer.classList.remove('is-pulsing', 'is-steady');
    // Restarting an animation needs the class to leave and come back.
    void highlightLayer.getBoundingClientRect?.();
    highlightLayer.classList.add(
      pulse && !reduceMotion() ? 'is-pulsing' : 'is-steady'
    );
  }

  function clearHighlight() {
    highlighted = null;
    highlightLayer.setAttribute('visibility', 'hidden');
    highlightLayer.classList.remove('is-pulsing', 'is-steady');
    delete highlightLayer.dataset.region;
    for (const path of pathByKey.values())
      path.classList.remove('is-highlighted');
  }

  function onPulseEnd() {
    if (highlightLayer.classList.contains('is-pulsing')) {
      highlightLayer.classList.remove('is-pulsing');
      highlightLayer.classList.add('is-steady');
    }
  }
  highlightLayer.addEventListener('animationend', onPulseEnd);

  /**
   * Show the drawing as it arrived, or the plan drawn over it. The layers
   * stay where they are; the stylesheet hides all but the art.
   * @param {'plan'|'original'} view
   */
  function setView(view) {
    svg.dataset.view = view === 'original' ? 'original' : 'plan';
  }

  /**
   * Draw one plate's cut over the dimmed plan, or none.
   * @param {string|null} pathData - The plate's rings as path data
   */
  function showPlate(pathData) {
    while (plateLayer.firstChild) plateLayer.removeChild(plateLayer.firstChild);
    if (pathData) {
      const cut = document.createElementNS(SVG_NS, 'path');
      cut.setAttribute('d', pathData);
      cut.setAttribute('class', 'drawing-editor-plate-cut');
      cut.setAttribute('fill-rule', 'evenodd');
      plateLayer.appendChild(cut);
      svg.dataset.plate = 'true';
    } else {
      delete svg.dataset.plate;
    }
  }

  function onHover(event) {
    const key = regionKeyOf(event.target);
    for (const [k, path] of pathByKey) {
      path.classList.toggle(
        'is-hover',
        k === key && event.type === 'pointerover'
      );
    }
  }

  function setTool(name) {
    tool = TOOLS.some((t) => t.id === name) ? name : 'select';
    svg.dataset.tool = tool;
    cancelDrag();
  }

  function fit() {
    vb = { ...natural };
    applyViewBox();
  }

  function zoomBy(factor, about = null) {
    const cx = about ? about.x : vb.x + vb.w / 2;
    const cy = about ? about.y : vb.y + vb.h / 2;
    const w = vb.w / factor;
    const h = vb.h / factor;
    vb = {
      x: cx - (cx - vb.x) / factor,
      y: cy - (cy - vb.y) / factor,
      w,
      h,
    };
    applyViewBox();
  }

  function cancelDrag() {
    if (drag?.pointerId !== undefined) {
      try {
        svg.releasePointerCapture(drag.pointerId);
      } catch {
        // Not captured in this environment; nothing to release.
      }
    }
    drag = null;
    marquee.setAttribute('visibility', 'hidden');
  }

  const regionKeyOf = (target) =>
    target?.closest?.('[data-region]')?.dataset.region ?? null;

  function onPointerDown(event) {
    if (event.button !== 0) return;
    const at = toUnits(event);
    const key = regionKeyOf(event.target);
    if (tool === 'hand') {
      drag = {
        kind: 'pan',
        start: at,
        vb0: { ...vb },
        pointerId: event.pointerId,
      };
    } else if (tool === 'marquee') {
      drag = { kind: 'marquee', start: at, pointerId: event.pointerId };
    } else {
      // Select, paint, remove: a click, resolved on release so a drag that
      // began on a region does not fire on the way down.
      drag = { kind: 'click', start: at, key, pointerId: event.pointerId };
      return;
    }
    try {
      svg.setPointerCapture(event.pointerId);
    } catch {
      // jsdom has no pointer capture; the events still arrive.
    }
    event.preventDefault();
  }

  function onPointerMove(event) {
    if (!drag) return;
    const at = toUnits(event);
    if (drag.kind === 'pan') {
      vb = {
        ...drag.vb0,
        x: drag.vb0.x - (at.x - drag.start.x) * (drag.vb0.w / vb.w),
        y: drag.vb0.y - (at.y - drag.start.y) * (drag.vb0.h / vb.h),
      };
      applyViewBox();
    } else if (drag.kind === 'marquee') {
      const x = Math.min(drag.start.x, at.x);
      const y = Math.min(drag.start.y, at.y);
      marquee.setAttribute('x', String(x));
      marquee.setAttribute('y', String(y));
      marquee.setAttribute('width', String(Math.abs(at.x - drag.start.x)));
      marquee.setAttribute('height', String(Math.abs(at.y - drag.start.y)));
      marquee.setAttribute('visibility', 'visible');
    }
  }

  function onPointerUp(event) {
    if (!drag) return;
    const at = toUnits(event);
    const current = drag;
    cancelDrag();
    if (current.kind === 'marquee') {
      const w = Math.abs(at.x - current.start.x);
      const h = Math.abs(at.y - current.start.y);
      if (w < MARQUEE_MIN_UNITS && h < MARQUEE_MIN_UNITS) {
        // A click with the marquee tool selects what it hit, like Select.
        const key = regionKeyOf(event.target);
        if (key) on.onClick?.(key, event.shiftKey);
        else on.onEmptyClick?.(event.shiftKey);
        return;
      }
      const keys = regionsInside(regions, {
        x1: current.start.x,
        y1: current.start.y,
        x2: at.x,
        y2: at.y,
      });
      on.onMarquee?.(keys, event.shiftKey);
      return;
    }
    if (current.kind === 'pan') {
      on.onPan?.();
      return;
    }
    // A click: the region under the pointer on release, or nothing.
    const key = regionKeyOf(event.target) ?? current.key;
    if (tool === 'paint') {
      if (key) on.onPaint?.(key);
    } else if (tool === 'remove') {
      if (key) on.onRemove?.(key);
    } else if (key) {
      setHighlight(key);
      on.onClick?.(key, event.shiftKey);
    } else {
      on.onEmptyClick?.(event.shiftKey);
    }
  }

  function onDoubleClick(event) {
    const key = regionKeyOf(event.target);
    if (key) on.onOpenColour?.(key);
  }

  function onWheel(event) {
    event.preventDefault();
    zoomBy(event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP, toUnits(event));
  }

  function onKeyDown(event) {
    const dir = {
      ArrowLeft: 'left',
      ArrowRight: 'right',
      ArrowUp: 'up',
      ArrowDown: 'down',
    }[event.key];
    if (dir) {
      event.preventDefault();
      const next = nearestInDirection(regions, highlighted, dir);
      if (next) {
        setHighlight(next, { pulse: true });
        on.onHighlight?.(next);
      }
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const next =
        event.key === 'Home'
          ? (regions[0]?.key ?? null)
          : (regions[regions.length - 1]?.key ?? null);
      if (next) {
        setHighlight(next, { pulse: true });
        on.onHighlight?.(next);
      }
      return;
    }
    if ((event.key === 'Enter' || event.key === ' ') && highlighted) {
      event.preventDefault();
      on.onToggle?.(highlighted);
      return;
    }
    if (event.key === 'Escape' && drag) {
      event.preventDefault();
      event.stopPropagation();
      cancelDrag();
    }
  }

  svg.addEventListener('pointerdown', onPointerDown);
  svg.addEventListener('pointermove', onPointerMove);
  svg.addEventListener('pointerup', onPointerUp);
  svg.addEventListener('pointercancel', cancelDrag);
  svg.addEventListener('dblclick', onDoubleClick);
  svg.addEventListener('wheel', onWheel, { passive: false });
  svg.addEventListener('keydown', onKeyDown);
  svg.addEventListener('pointerover', onHover);
  svg.addEventListener('pointerout', onHover);

  return {
    root,
    svg,
    setDrawing,
    setState,
    setHighlight,
    clearHighlight,
    setView,
    getView: () => svg.dataset.view,
    showPlate,
    highlightLayer,
    getHighlight: () => highlighted,
    setTool,
    getTool: () => tool,
    fit,
    zoomIn: () => zoomBy(ZOOM_STEP),
    zoomOut: () => zoomBy(1 / ZOOM_STEP),
    isDragging: () => drag !== null,
    cancelDrag,
    getViewBox: () => ({ ...vb }),
    destroy() {
      svg.removeEventListener('pointerdown', onPointerDown);
      svg.removeEventListener('pointermove', onPointerMove);
      svg.removeEventListener('pointerup', onPointerUp);
      svg.removeEventListener('pointercancel', cancelDrag);
      svg.removeEventListener('dblclick', onDoubleClick);
      svg.removeEventListener('wheel', onWheel);
      svg.removeEventListener('keydown', onKeyDown);
      svg.removeEventListener('pointerover', onHover);
      svg.removeEventListener('pointerout', onHover);
      highlightLayer.removeEventListener('animationend', onPulseEnd);
      root.remove();
    },
  };
}
