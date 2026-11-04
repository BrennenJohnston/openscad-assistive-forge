/**
 * The region canvas: the one view a person points at.
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
 * A MOVABLE region (the map purpose's destination and You are here, named
 * by `on.canMove`) is dragged with the pointer in the Select tool, or picked
 * up with Space, nudged by the arrow keys (1 unit; 10 with Shift) and put
 * down with Space or Enter; Escape puts it back. The canvas keeps each
 * region's offset as a transform and reports the whole move once, through
 * `on.onMoveEnd`, so the surface records one command.
 *
 * The picture moves under every tool: a drag that starts on empty ground
 * pans (the Hand tool pans from anywhere), Shift with an arrow key pans a
 * tenth of the view, the bare arrows pan in the Hand tool, and `panBy`
 * serves the toolbar's four pan buttons.
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
  { id: 'route', key: 'w' },
]);

/** Room around the drawing when it is fitted, as a fraction of its size. */
const FIT_PADDING = 0.04;
const ZOOM_STEP = 1.5;
/** A marquee smaller than this is a click that wandered, not a rectangle. */
const MARQUEE_MIN_UNITS = 0.5;
/** A drag of a mark shorter than this is a click on it. */
const MOVE_MIN_UNITS = 0.5;
/** A press on empty ground that travels less than this is a click, not a pan. */
const PAN_MIN_PX = 3;
/** What an arrow key or a pan button moves the view by: a tenth of it. */
const PAN_FRACTION = 0.1;
/** The arrow keys' steps during a carry, in drawing units (mm on a map). */
const NUDGE_UNITS = 1;
const NUDGE_SHIFT_UNITS = 10;

const round1 = (v) => Math.round(v * 10) / 10;

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
 * @param {object} args
 * @param {HTMLElement} args.container - Where the canvas mounts
 * @param {string} args.labelId - id of the element that names the canvas
 * @param {object} [args.on] - Callbacks: onClick(key, shift), onEmptyClick(shift),
 *   onMarquee(keys, shift), onPaint(key), onRemove(key), onHighlight(key),
 *   onToggle(key), onOpenColour(key), onPan(), canMove(key) -> boolean,
 *   onPickUp(key), onMoving(key, dx, dy), onMoveEnd(key, dx, dy),
 *   onPutBack(key)
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

  // The layers, in drawing order: the art underneath, the regions
  // tinted over it, the plate being stepped through, the keyboard highlight
  // (two strokes), the marquee on top. A hatch pattern for removed regions
  // lives in defs; its color comes from the stylesheet's tokens.
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
  // The map purpose's Off hatch: the same stripes, drawn stronger, as the
  // charm customizer draws a shape turned off.
  const offId = `${labelId}-off`;
  const off = hatch.cloneNode(true);
  off.id = offId;
  off.firstChild.setAttribute('class', 'drawing-editor-off-line');
  defs.append(hatch, off);

  const artLayer = document.createElementNS(SVG_NS, 'g');
  artLayer.setAttribute('data-layer', 'art');
  artLayer.setAttribute('aria-hidden', 'true');
  // Each region's edge, drawn under it: a light stroke a little wider than
  // the shape, so a shape in a dark layer color still reads on the dark
  // ground. Shown only for a region that carries a look.
  const edgeLayer = document.createElementNS(SVG_NS, 'g');
  edgeLayer.setAttribute('data-layer', 'edges');
  edgeLayer.setAttribute('aria-hidden', 'true');
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
  svg.append(
    defs,
    artLayer,
    edgeLayer,
    regionLayer,
    plateLayer,
    highlightLayer,
    marquee
  );
  svg.dataset.view = 'plan';

  root.append(help, svg);
  container.appendChild(root);

  let regions = [];
  let natural = { x: 0, y: 0, w: 100, h: 100 };
  let vb = { ...natural };
  let tool = 'select';
  let highlighted = null;
  let drag = null;
  /** A mark picked up by keyboard: its key and the offset so far. */
  let carry = null;
  const pathByKey = new Map();
  const edgeByKey = new Map();
  /** Each moved region's offset from where the drawing put it. */
  const offsets = new Map();

  const canMove = (key) => !!key && on.canMove?.(key) === true;

  /** Draw a region's offset, settled plus what a drag or carry adds. */
  function placeRegion(key, extraX = 0, extraY = 0) {
    const base = offsets.get(key) || [0, 0];
    const dx = round1(base[0] + extraX);
    const dy = round1(base[1] + extraY);
    const transform = dx === 0 && dy === 0 ? null : `translate(${dx} ${dy})`;
    for (const el of [pathByKey.get(key), edgeByKey.get(key)]) {
      if (!el) continue;
      if (transform) el.setAttribute('transform', transform);
      else el.removeAttribute('transform');
    }
    if (highlighted === key) {
      if (transform) highlightLayer.setAttribute('transform', transform);
      else highlightLayer.removeAttribute('transform');
    }
  }

  /**
   * Settle a region's offset, as the surface records it (a move done, or
   * undone). The region's box and interior follow, so the arrow keys and
   * the marquee find it where it now stands.
   */
  function setRegionOffset(key, offset) {
    const was = offsets.get(key) || [0, 0];
    const next = offset ? [round1(offset[0]), round1(offset[1])] : [0, 0];
    if (next[0] === 0 && next[1] === 0) offsets.delete(key);
    else offsets.set(key, next);
    const r = regions.find((x) => x.key === key);
    if (r) {
      const dx = next[0] - was[0];
      const dy = next[1] - was[1];
      if (r.bbox) {
        r.bbox = {
          minX: r.bbox.minX + dx,
          minY: r.bbox.minY + dy,
          maxX: r.bbox.maxX + dx,
          maxY: r.bbox.maxY + dy,
        };
      }
      if (r.interior) {
        r.interior = { x: r.interior.x + dx, y: r.interior.y + dy };
      }
    }
    placeRegion(key);
  }

  function endCarry() {
    carry = null;
    delete svg.dataset.carrying;
  }

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
    edgeByKey.clear();
    offsets.clear();
    endCarry();
    highlightLayer.removeAttribute('transform');
    while (artLayer.firstChild) artLayer.removeChild(artLayer.firstChild);
    while (edgeLayer.firstChild) edgeLayer.removeChild(edgeLayer.firstChild);
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
      const edge = document.createElementNS(SVG_NS, 'path');
      edge.setAttribute('d', r.d);
      edge.setAttribute('class', 'drawing-editor-region-edge');
      edge.setAttribute('fill-rule', 'evenodd');
      edge.dataset.edge = r.key;
      edgeLayer.appendChild(edge);
      edgeByKey.set(r.key, edge);
      if (canMove(r.key)) {
        path.dataset.movable = 'true';
        edge.dataset.movable = 'true';
      }
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
   * Paint the plan onto the regions: each path takes its color, and the
   * selected, removed and highlighted ones say so in a class.
   *
   * @param {object} state
   * @param {Object<string, string>} state.fills - key -> css color, or ''
   * @param {Set<string>} state.selected
   * @param {Set<string>} state.removed
   * @param {Object<string, string>} [state.looks] - key -> a look the
   *   stylesheet draws (the map purpose's `level-1-area`, `level-3-line`,
   *   `off-area`, `off-line`); an Off area takes the Off hatch
   */
  function setState({
    fills = {},
    selected = new Set(),
    removed = new Set(),
    looks = {},
  }) {
    for (const [key, path] of pathByKey) {
      const look = looks[key];
      const fill =
        fills[key] || (look === 'off-area' ? `url(#${offId})` : undefined);
      if (fill) path.style.setProperty('--region-fill', fill);
      else path.style.removeProperty('--region-fill');
      const edge = edgeByKey.get(key);
      if (look) {
        path.dataset.look = look;
        if (edge) edge.dataset.look = look;
      } else {
        delete path.dataset.look;
        if (edge) delete edge.dataset.look;
      }
      path.classList.toggle('is-selected', selected.has(key));
      path.classList.toggle('is-removed', removed.has(key));
      if (removed.has(key)) path.setAttribute('fill', `url(#${hatchId})`);
      else path.removeAttribute('fill');
      path.classList.toggle('is-highlighted', key === highlighted);
      path.setAttribute('aria-hidden', 'true');
    }
    stackByLook(looks);
    // A canvas that paints looks draws every shape itself; the dimmed art
    // underneath would only darken the ground inside an Off hatch.
    if (Object.keys(looks).length > 0) artLayer.setAttribute('display', 'none');
    else artLayer.removeAttribute('display');
  }

  /**
   * Paint in the order the print stacks: a shape left Off at the bottom,
   * then the floor, the symbol level and the top, a line over an area of its
   * own level; the drawing's order within each. Without looks the drawing's
   * order stands, so an Off hatch never lies over a painted shape.
   */
  function stackByLook(looks) {
    const rank = (key) => {
      const look = looks[key] || '';
      const level = /^level-(\d)-(area|line)$/.exec(look);
      if (!level) return 0;
      return Number(level[1]) + (level[2] === 'line' ? 0.5 : 0);
    };
    const wanted = regions
      .map((r, i) => [r.key, i])
      .sort((x, y) => rank(x[0]) - rank(y[0]) || x[1] - y[1])
      .map(([key]) => key);
    const current = [...regionLayer.children].map((p) => p.dataset.region);
    if (wanted.every((key, i) => key === current[i])) return;
    for (const key of wanted) {
      const path = pathByKey.get(key);
      if (path) regionLayer.appendChild(path);
      const edge = edgeByKey.get(key);
      if (edge) edgeLayer.appendChild(edge);
    }
  }

  /**
   * The keyboard highlight: a two-stroke outline drawn OVER the regions
   * (the region's own stroke would sit under its neighbors), which PULSES
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
    const moved = path.getAttribute('transform');
    if (moved) highlightLayer.setAttribute('transform', moved);
    else highlightLayer.removeAttribute('transform');
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
    if (carry) putBack();
    highlighted = null;
    highlightLayer.setAttribute('visibility', 'hidden');
    highlightLayer.classList.remove('is-pulsing', 'is-steady');
    highlightLayer.removeAttribute('transform');
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

  /**
   * Move the view by fractions of its own width and height: a positive x
   * looks further right, a positive y further down.
   */
  function panBy(fx, fy) {
    vb = { ...vb, x: vb.x + fx * vb.w, y: vb.y + fy * vb.h };
    applyViewBox();
  }

  function startPan(event, at) {
    drag = {
      kind: 'pan',
      start: at,
      vb0: { ...vb },
      clientX: event.clientX,
      clientY: event.clientY,
      moved: false,
      pointerId: event.pointerId,
    };
  }

  function cancelDrag() {
    if (drag?.pointerId !== undefined) {
      try {
        svg.releasePointerCapture(drag.pointerId);
      } catch {
        // Not captured in this environment; nothing to release.
      }
    }
    // A mark let go mid-drag goes back where it was.
    if (drag?.kind === 'move') placeRegion(drag.key);
    drag = null;
    marquee.setAttribute('visibility', 'hidden');
  }

  /** A carry ended by Escape, or by the highlight leaving: the mark goes back. */
  function putBack() {
    if (!carry) return;
    const { key } = carry;
    endCarry();
    placeRegion(key);
    on.onPutBack?.(key);
  }

  /** A carry ended by Space or Enter: one move, as the pointer would make. */
  function putDown() {
    if (!carry) return;
    const { key, dx, dy } = carry;
    endCarry();
    if (dx === 0 && dy === 0) {
      placeRegion(key);
      on.onPutBack?.(key);
      return;
    }
    on.onMoveEnd?.(key, dx, dy);
  }

  // A shape's edge, under it, answers for it: a click in a dashed line's gap
  // or just beside a thin line still finds the shape.
  const regionKeyOf = (target) => {
    const el = target?.closest?.('[data-region], [data-edge]');
    return el?.dataset.region ?? el?.dataset.edge ?? null;
  };

  function onPointerDown(event) {
    if (event.button !== 0) return;
    const at = toUnits(event);
    const key = regionKeyOf(event.target);
    if (tool === 'hand') {
      startPan(event, at);
    } else if (tool === 'marquee') {
      drag = { kind: 'marquee', start: at, pointerId: event.pointerId };
    } else if (!key) {
      // Empty ground under any other tool: a drag pans, as the Hand tool
      // does; a press that does not travel is a click on nothing.
      startPan(event, at);
    } else if (tool === 'select' && canMove(key)) {
      // A mark under the Select tool moves with the pointer; a press that
      // does not travel is a click on it, resolved on release.
      if (carry) putBack();
      drag = {
        kind: 'move',
        start: at,
        key,
        dx: 0,
        dy: 0,
        moved: false,
        pointerId: event.pointerId,
      };
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
    // The press is taken over below, which also stops the browser's own
    // focusing of the canvas: done here instead, so a click on empty ground
    // still hands the keyboard to the picture.
    if (typeof svg.focus === 'function' && document.activeElement !== svg) {
      svg.focus({ preventScroll: true });
    }
    event.preventDefault();
  }

  function onPointerMove(event) {
    if (!drag) return;
    const at = toUnits(event);
    if (drag.kind === 'pan') {
      if (
        !drag.moved &&
        Math.abs(event.clientX - drag.clientX) < PAN_MIN_PX &&
        Math.abs(event.clientY - drag.clientY) < PAN_MIN_PX
      ) {
        return;
      }
      drag.moved = true;
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
    } else if (drag.kind === 'move') {
      drag.dx = at.x - drag.start.x;
      drag.dy = at.y - drag.start.y;
      if (
        !drag.moved &&
        Math.abs(drag.dx) < MOVE_MIN_UNITS &&
        Math.abs(drag.dy) < MOVE_MIN_UNITS
      ) {
        return;
      }
      drag.moved = true;
      placeRegion(drag.key, drag.dx, drag.dy);
      on.onMoving?.(drag.key, round1(drag.dx), round1(drag.dy));
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
      if (current.moved) {
        on.onPan?.();
        return;
      }
      // A press on empty ground that went nowhere: the click it always was.
      if (tool !== 'hand') on.onEmptyClick?.(event.shiftKey);
      return;
    }
    if (current.kind === 'move') {
      if (current.moved) {
        // The whole move at once; the surface settles the offset it records.
        on.onMoveEnd?.(current.key, round1(current.dx), round1(current.dy));
        return;
      }
      setHighlight(current.key);
      on.onClick?.(current.key, event.shiftKey);
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
    if (carry) {
      // A mark in hand: the arrows carry it, Space or Enter puts it down,
      // Escape puts it back; nothing else leaves the carry.
      if (dir) {
        event.preventDefault();
        event.stopPropagation();
        const step = event.shiftKey ? NUDGE_SHIFT_UNITS : NUDGE_UNITS;
        carry.dx += dir === 'left' ? -step : dir === 'right' ? step : 0;
        carry.dy += dir === 'up' ? -step : dir === 'down' ? step : 0;
        placeRegion(carry.key, carry.dx, carry.dy);
        on.onMoving?.(carry.key, round1(carry.dx), round1(carry.dy));
        return;
      }
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        putDown();
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        putBack();
        return;
      }
      return;
    }
    if (dir && (event.shiftKey || tool === 'hand')) {
      // Shift with an arrow moves the picture under every tool; in the Hand
      // tool the bare arrows do the same. Elsewhere the bare arrows keep
      // walking the shapes, the keyboard reader's way.
      event.preventDefault();
      event.stopPropagation();
      panBy(
        dir === 'left' ? -PAN_FRACTION : dir === 'right' ? PAN_FRACTION : 0,
        dir === 'up' ? -PAN_FRACTION : dir === 'down' ? PAN_FRACTION : 0
      );
      return;
    }
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
    if (
      event.key === ' ' &&
      highlighted &&
      tool === 'select' &&
      canMove(highlighted)
    ) {
      // Space picks a mark up; Enter still opens its row, as on any shape.
      event.preventDefault();
      event.stopPropagation();
      carry = { key: highlighted, dx: 0, dy: 0 };
      svg.dataset.carrying = highlighted;
      on.onPickUp?.(highlighted);
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
    panBy,
    panLeft: () => panBy(-PAN_FRACTION, 0),
    panUp: () => panBy(0, -PAN_FRACTION),
    panDown: () => panBy(0, PAN_FRACTION),
    panRight: () => panBy(PAN_FRACTION, 0),
    isDragging: () => drag !== null,
    isCarrying: () => carry !== null,
    putBack,
    cancelDrag,
    setRegionOffset,
    getRegionOffset: (key) => [...(offsets.get(key) || [0, 0])],
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
