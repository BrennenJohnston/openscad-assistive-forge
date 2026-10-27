/**
 * A map plan from a classed drawing.
 *
 * The drawing editor's map purpose hands back every shape of a drawing
 * with a class from the class table. This module turns those shapes into
 * features of a plan (plan.js) at a real size, so a line map drawn on
 * paper, traced from a photograph or converted from a DXF becomes a tactile
 * map without a single coordinate typed.
 *
 * What a shape becomes is decided by its class's kind:
 *
 * - a LINE class: the shape's centerline, found by thinning the shape on a
 *   grid of CELL_MM cells (the raster mask the thickness measure uses) to
 *   a one-cell skeleton, which is then traced into polylines, pruned of the
 *   short branches a corner grows, pushed back out to the shape's ends and
 *   simplified. A shape whose ridge width is over MAX_LINE_WIDTH_MM is not
 *   a line anyone drew: it is kept as an area, with a warning that names
 *   it. A wall drawn as a closed outline arrives as two rings, the outer
 *   edge and the inner, which the editor lists as two rows: the inner ring
 *   is read as the outer's hole whether it was classed with it or ignored,
 *   so the centerline runs between the two edges. Small round shapes of
 *   one line class (the dots of a dotted route) are joined in order of
 *   nearness into one line.
 * - an AREA class: the shape's outer ring, filled; its holes are dropped
 *   (an outline classed as an area means the whole of it).
 * - a POINT class: a point at the shape's center, with the class's symbol
 *   drawn there by the levels builder; the drawn shape itself is dropped.
 *   The bars or strokes of one drawn symbol, within SYMBOL_MERGE_MM of
 *   each other, are one point.
 * - Ignore: dropped.
 *
 * The scale is `unitsPerMm`: how many drawing units make a millimeter,
 * from the drawing's width in millimeters (`scaleFromWidth`) or from two
 * picked points a known distance apart (`scaleFromDistance`). Without one,
 * the drawing is as wide as the map width given. The map is as big as the
 * shapes kept: its top left corner is the kept shapes' top left, less half
 * the widest line class kept, so a wall along the edge stays on the plate
 * (the sample plan's own convention, its border 1 mm in). A drawing's
 * margins, a key sheet beside the map and anything else set to Ignore add
 * nothing to the map. Coordinates come out in millimeters from that
 * corner, y down, as the plan wants them.
 *
 * A DXF the engine converted arrives as one stroked path of its loops with
 * no fill (the engine's own SVG export), which the editor would read as
 * thin bands along every loop; the tile reads the same loops as filled
 * shapes, and `filledOutlines` makes the editor read them so too, so a wall
 * drawn as a closed outline is one shape with a hole, not two bands.
 *
 * No DOM here: a worker may import this file.
 *
 * @license GPL-3.0-or-later
 */

import { areaOf, centroid, nestingOf } from '../ring-geometry.js';
import { rasterizeRings, ridgeWidthOfRings } from '../shape-thickness.js';
import { mapClass } from './map-classes.js';
import { emptyPlan } from './plan.js';

/** The grid the skeleton is found on, in millimeters per cell. */
export const CELL_MM = 0.25;

/**
 * A shape classed as a line whose ridge width (the median width along its
 * middle) is over this is kept as an area: no drawn line is this wide, and
 * a centerline of a blob would be a guess.
 */
export const MAX_LINE_WIDTH_MM = 6;

/** Shapes of one point class closer than this are one drawn symbol. */
export const SYMBOL_MERGE_MM = 10;

/** A shape of a line class no bigger than this, and roughly round, is a dot. */
export const DOT_MAX_MM = 4;

/** The most cells the skeleton grid has on its long side. */
const MAX_SKELETON_CELLS = 4096;

/** Physical units an SVG width or height may carry, in millimeters. */
const UNIT_MM = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6 };

/** The title the engine's SVG export writes. */
const ENGINE_TITLE = /<title>\s*OpenSCAD Model\s*<\/title>/i;

const round2 = (n) => Math.round(n * 100) / 100;
const round1 = (n) => Math.round(n * 10) / 10;

// ---------------------------------------------------------------------------
// The drawing's box and the scale
// ---------------------------------------------------------------------------

/**
 * The engine's SVG export of a drawing (a DXF converted by the app), with
 * its stroked, unfilled loops made filled shapes under the even-odd rule:
 * what the tile makes of the same file. Any other SVG comes back as it is,
 * because a stroked line in a drawing someone made is the line itself.
 *
 * @param {string} svgText
 * @returns {string}
 */
export function filledOutlines(svgText) {
  const text = String(svgText || '');
  if (!ENGINE_TITLE.test(text)) return text;
  return text.replace(/<path\b[^>]*>/g, (tag) => {
    if (!/\sfill\s*=\s*["']none["']/i.test(tag)) return tag;
    return tag
      .replace(/\sfill\s*=\s*["']none["']/i, ' fill="#000" fill-rule="evenodd"')
      .replace(
        /\sstroke(?:-width|-linejoin|-linecap)?\s*=\s*["'][^"']*["']/gi,
        ''
      );
  });
}

/**
 * A drawing's box in its own units: the viewBox, else its width and height;
 * and the width and height in millimeters when the file declares a
 * physical unit (mm, cm, in, pt, pc), null when it does not.
 *
 * @param {string} svgText
 * @returns {{x: number, y: number, width: number, height: number, widthMm: number|null, heightMm: number|null}|null}
 */
export function drawingBox(svgText) {
  const open = /<svg\b[^>]*>/i.exec(String(svgText || ''));
  if (!open) return null;
  const tag = open[0];
  const attr = (name) => {
    const m = new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, 'i').exec(tag);
    return m ? m[1].trim() : null;
  };
  const length = (text) => {
    if (text == null) return null;
    const m = /^([0-9]*\.?[0-9]+(?:e[-+]?[0-9]+)?)\s*([a-z%]*)$/i.exec(text);
    if (!m) return null;
    const value = Number(m[1]);
    if (!(value > 0)) return null;
    const unit = m[2].toLowerCase();
    const factor = UNIT_MM[unit];
    return { value, mm: factor ? value * factor : null };
  };
  const width = length(attr('width'));
  const height = length(attr('height'));
  const vb = (attr('viewBox') || '')
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(Number);
  let box = null;
  if (vb.length === 4 && vb.every(Number.isFinite) && vb[2] > 0 && vb[3] > 0) {
    box = { x: vb[0], y: vb[1], width: vb[2], height: vb[3] };
  } else if (width && height) {
    box = { x: 0, y: 0, width: width.value, height: height.value };
  }
  if (!box) return null;
  return {
    ...box,
    widthMm: width?.mm ?? null,
    heightMm: height?.mm ?? null,
  };
}

/**
 * The scale from the drawing's width in millimeters.
 *
 * @param {{width: number}} box - The drawing's box in its own units
 * @param {number} widthMm - How wide the drawing is, or is to be, in mm
 * @returns {{unitsPerMm: number}|null} null when either number is not above 0
 */
export function scaleFromWidth(box, widthMm) {
  if (!(box?.width > 0) || !(widthMm > 0)) return null;
  return { unitsPerMm: box.width / widthMm };
}

/**
 * The scale from two picked points and the distance between them.
 *
 * @param {[number, number]} a - In drawing units
 * @param {[number, number]} b
 * @param {number} distanceMm
 * @returns {{unitsPerMm: number}|null} null when the points coincide or the
 *   distance is not above 0
 */
export function scaleFromDistance(a, b, distanceMm) {
  const units = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (!(units > 0) || !(distanceMm > 0)) return null;
  return { unitsPerMm: units / distanceMm };
}

/**
 * The sentence said when a scale is set (A11Y).
 *
 * @param {{unitsPerMm: number}} scale
 * @returns {string}
 */
export function scaleSentence(scale) {
  const mm = Number((1 / scale.unitsPerMm).toPrecision(3));
  return `Scale set: one drawing unit is ${mm} mm.`;
}

// ---------------------------------------------------------------------------
// The centerline of a thin shape
// ---------------------------------------------------------------------------

function boundsOf(rings) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const ring of rings) {
    for (const p of ring) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
  }
  return { minX, minY, maxX, maxY };
}

/** The eight neighbors of a cell, the four edge neighbors first. */
function neighborsOf(i, w) {
  return [
    i - w,
    i + 1,
    i + w,
    i - 1,
    i - w + 1,
    i + w + 1,
    i + w - 1,
    i - w - 1,
  ];
}

/** Ink neighbors of a cell, in the circular order N, NE, E, SE, S, SW, W, NW. */
function ringAround(mask, i, w) {
  return [
    mask[i - w],
    mask[i - w + 1],
    mask[i + 1],
    mask[i + w + 1],
    mask[i + w],
    mask[i + w - 1],
    mask[i - 1],
    mask[i - w - 1],
  ];
}

/** How many times the ring of neighbors goes from paper to ink. */
function crossings(ring) {
  let a = 0;
  for (let k = 0; k < 8; k++) {
    if (!ring[k] && ring[(k + 1) % 8]) a++;
  }
  return a;
}

/**
 * Thin the mask to a one-cell skeleton in place (Zhang and Suen, 1984).
 * The mask's border cells are paper, so no edge check is needed.
 */
function thin(mask, w, h) {
  let changed = true;
  const dead = [];
  while (changed) {
    changed = false;
    for (let sub = 0; sub < 2; sub++) {
      dead.length = 0;
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const i = y * w + x;
          if (!mask[i]) continue;
          const r = ringAround(mask, i, w);
          const b = r[0] + r[1] + r[2] + r[3] + r[4] + r[5] + r[6] + r[7];
          if (b < 2 || b > 6) continue;
          if (crossings(r) !== 1) continue;
          const [n, ne, e, se, s, sw, ww, nw] = r;
          void ne;
          void se;
          void sw;
          void nw;
          if (sub === 0) {
            if (n && e && s) continue;
            if (e && s && ww) continue;
          } else {
            if (n && e && ww) continue;
            if (n && s && ww) continue;
          }
          dead.push(i);
        }
      }
      for (const i of dead) mask[i] = 0;
      if (dead.length) changed = true;
    }
  }
}

/** Ink neighbors of a cell, edge neighbors first. */
function inkNeighbors(mask, i, w) {
  return neighborsOf(i, w).filter((j) => mask[j]);
}

/** Whether a skeleton cell is an end (one neighbor) or a junction. */
function isNode(mask, i, w) {
  const r = ringAround(mask, i, w);
  const deg = r[0] + r[1] + r[2] + r[3] + r[4] + r[5] + r[6] + r[7];
  return deg === 1 || crossings(r) >= 3;
}

/**
 * Walk a skeleton from a cell along unvisited ink until a node or a dead
 * end. Returns the cells walked, the start first. An edge neighbor is
 * taken before a diagonal one, so the extra cell a thinning leaves at a
 * corner is walked through as a one-cell detour (the simplification
 * straightens it) rather than left as a branch.
 */
function walk(mask, w, start, first, visited) {
  const path = [start];
  let prev = start;
  let cur = first;
  visited[cur] = 1;
  for (;;) {
    path.push(cur);
    if (isNode(mask, cur, w)) break;
    const next = inkNeighbors(mask, cur, w).filter(
      (j) => j !== prev && !visited[j]
    );
    if (next.length === 0) break;
    const step = next[0];
    visited[step] = 1;
    prev = cur;
    cur = step;
  }
  return path;
}

/**
 * Remove the short branches a thinning grows at corners: a branch from an
 * end to a junction shorter than `maxCells` cells. Up to three rounds, as
 * a removed branch can leave a shorter one behind.
 */
function pruneSpurs(mask, w, h, maxCells) {
  for (let round = 0; round < 3; round++) {
    const spurs = [];
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (!mask[i]) continue;
        const nbrs = inkNeighbors(mask, i, w);
        if (nbrs.length !== 1) continue;
        const visited = new Uint8Array(0);
        const path = walkUnvisited(mask, w, i, nbrs[0], visited);
        const last = path[path.length - 1];
        const r = ringAround(mask, last, w);
        if (crossings(r) >= 3 && path.length - 1 < maxCells) {
          spurs.push(path.slice(0, -1));
        }
      }
    }
    if (spurs.length === 0) return;
    for (const spur of spurs) for (const i of spur) mask[i] = 0;
  }
}

/** A walk that keeps its own visited set, for the pruning pass. */
function walkUnvisited(mask, w, start, first, _unused) {
  void _unused;
  const seen = new Set([start, first]);
  const path = [start, first];
  let prev = start;
  let cur = first;
  for (let guard = 0; guard < 1e6; guard++) {
    if (isNode(mask, cur, w)) break;
    const next = inkNeighbors(mask, cur, w).filter(
      (j) => j !== prev && !seen.has(j)
    );
    if (next.length === 0) break;
    const step = next[0];
    seen.add(step);
    path.push(step);
    prev = cur;
    cur = step;
  }
  return path;
}

/**
 * Trace a skeleton into paths of cell indexes: every branch between two
 * nodes, then every closed loop that has no node on it.
 *
 * @returns {Array<{cells: number[], closed: boolean}>}
 */
function tracePaths(mask, w, h) {
  const visited = new Uint8Array(w * h);
  const paths = [];
  const nodes = [];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (mask[i] && isNode(mask, i, w)) nodes.push(i);
    }
  }
  // A branch is kept when it reaches another node, or is three cells or
  // longer: a shorter dead end is the extra cell a thinning leaves beside
  // a corner, already walked through by the branch it belongs to.
  for (const n of nodes) {
    for (const m of inkNeighbors(mask, n, w)) {
      if (visited[m]) continue;
      const path = walk(mask, w, n, m, visited);
      const last = path[path.length - 1];
      if (path.length >= 3 || (path.length === 2 && isNode(mask, last, w)))
        paths.push({ cells: path, closed: false });
    }
    visited[n] = 1;
  }
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (!mask[i] || visited[i]) continue;
      visited[i] = 1;
      const nbrs = inkNeighbors(mask, i, w).filter((j) => !visited[j]);
      if (nbrs.length === 0) continue;
      const path = walk(mask, w, i, nbrs[0], visited);
      const last = path[path.length - 1];
      const closed = path.length >= 3 && neighborsOf(last, w).includes(i);
      if (path.length >= 3) paths.push({ cells: path, closed });
    }
  }
  return paths;
}

/**
 * Join the branches that meet at a node where exactly two meet: a corner
 * the thinning left looking like a junction, or a junction whose other
 * branches were pruned. A chain that comes back to its own start closes.
 *
 * @param {Array<{cells: number[], closed: boolean}>} paths
 * @returns {Array<{cells: number[], closed: boolean}>}
 */
function joinAtCorners(paths) {
  const open = paths.filter((p) => !p.closed);
  const out = paths.filter((p) => p.closed);
  const endsAt = new Map();
  const add = (cell, k) => {
    if (!endsAt.has(cell)) endsAt.set(cell, []);
    endsAt.get(cell).push(k);
  };
  open.forEach((p, k) => {
    add(p.cells[0], k);
    add(p.cells[p.cells.length - 1], k);
  });
  const taken = new Uint8Array(open.length);
  const oriented = (k, startCell) => {
    const cells = open[k].cells;
    return cells[0] === startCell ? cells.slice() : cells.slice().reverse();
  };
  for (let k = 0; k < open.length; k++) {
    if (taken[k]) continue;
    taken[k] = 1;
    let chain = open[k].cells.slice();
    let closed = false;
    // Grow at the tail, then at the head, through nodes shared by two.
    for (const atTail of [true, false]) {
      for (;;) {
        const end = atTail ? chain[chain.length - 1] : chain[0];
        const meet = (endsAt.get(end) || []).filter((j) => !taken[j]);
        if ((endsAt.get(end) || []).length !== 2 || meet.length !== 1) break;
        const next = oriented(meet[0], end).slice(1);
        taken[meet[0]] = 1;
        chain = atTail ? chain.concat(next) : next.reverse().concat(chain);
      }
    }
    if (chain.length >= 3 && chain[0] === chain[chain.length - 1]) {
      chain.pop();
      closed = true;
    }
    out.push({ cells: chain, closed });
  }
  return out;
}

/**
 * Push an open path's ends back out to the shape's edge: thinning stops a
 * skeleton about half a width short of each end. The end is moved along
 * the path's last direction while the shape is still under it.
 */
function extendEnds(points, solid, w, h, maxSteps) {
  if (points.length < 2) return points;
  const out = points.slice();
  const push = (atEnd) => {
    const n = out.length;
    const k = Math.min(6, n - 1);
    const end = atEnd ? out[n - 1] : out[0];
    const back = atEnd ? out[n - 1 - k] : out[k];
    const dx = end[0] - back[0];
    const dy = end[1] - back[1];
    const len = Math.hypot(dx, dy);
    if (!(len > 0)) return;
    const ux = dx / len;
    const uy = dy / len;
    let best = null;
    for (let t = 1; t <= maxSteps; t++) {
      const x = end[0] + ux * t;
      const y = end[1] + uy * t;
      const cx = Math.round(x);
      const cy = Math.round(y);
      if (cx < 0 || cy < 0 || cx >= w || cy >= h) break;
      if (!solid[cy * w + cx]) break;
      best = [x, y];
    }
    if (!best) return;
    if (atEnd) out.push(best);
    else out.unshift(best);
  };
  push(true);
  push(false);
  return out;
}

/** Douglas and Peucker: the fewest points within epsilon of the path. */
function simplifyPath(points, epsilon) {
  if (points.length <= 2) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = points[a];
    const [bx, by] = points[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let far = -1;
    let farD = epsilon;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = points[i];
      let d;
      if (len2 === 0) d = Math.hypot(px - ax, py - ay);
      else
        d = Math.abs(dy * px - dx * py + bx * ay - by * ax) / Math.sqrt(len2);
      if (d > farD) {
        farD = d;
        far = i;
      }
    }
    if (far >= 0) {
      keep[far] = 1;
      stack.push([a, far], [far, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/**
 * The centerlines of a thin shape, in the shape's own units (millimeters
 * here): one polyline per branch of its skeleton. A closed loop (an
 * outline wall) comes back with `closed` true and its first point repeated
 * at the end. Empty when the shape is too small to have a middle.
 *
 * @param {Array<Array<{x: number, y: number}>>} rings - The shape, holes included
 * @param {object} [options]
 * @param {number} [options.cellMm] - The grid, CELL_MM by default
 * @param {number} [options.ridgeMm] - The shape's ridge width, which sizes
 *   the corner branches pruned and the ends pushed out
 * @returns {Array<{points: Array<[number, number]>, closed: boolean}>}
 */
export function centerlines(rings, options = {}) {
  const { cellMm = CELL_MM, ridgeMm = 0 } = options;
  if (!rings.length) return [];
  const b = boundsOf(rings);
  const long = Math.max(b.maxX - b.minX, b.maxY - b.minY);
  if (!(long > 0)) return [];
  const cell = Math.max(cellMm, long / MAX_SKELETON_CELLS);
  const w = Math.ceil((b.maxX - b.minX) / cell) + 3;
  const h = Math.ceil((b.maxY - b.minY) / cell) + 3;
  const scaled = rings.map((ring) =>
    ring.map((p) => ({
      x: (p.x - b.minX) / cell + 1,
      y: (p.y - b.minY) / cell + 1,
    }))
  );
  const solid = rasterizeRings(scaled, w, h);
  const mask = solid.slice();
  thin(mask, w, h);
  const ridgeCells = Math.max(2, Math.ceil((ridgeMm || cell) / cell));
  pruneSpurs(mask, w, h, ridgeCells + 2);
  const toPoint = (i) => [i % w, Math.floor(i / w)];
  const out = [];
  for (const path of joinAtCorners(tracePaths(mask, w, h))) {
    let points = path.cells.map(toPoint);
    if (!path.closed) points = extendEnds(points, solid, w, h, ridgeCells + 3);
    points = points.map(([x, y]) => [
      round2(b.minX + (x - 0.5) * cell),
      round2(b.minY + (y - 0.5) * cell),
    ]);
    points = simplifyPath(points, Math.max(0.3, cell));
    if (path.closed) points.push(points[0]);
    if (points.length >= 2) out.push({ points, closed: path.closed });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Dots and symbols
// ---------------------------------------------------------------------------

/**
 * Join dots into chains by nearness: from an end (the dot whose second
 * nearest neighbor is farthest), to the nearest dot not yet taken, while
 * the gap stays under three typical spacings. Dots with no neighbor close
 * enough come back as chains of one.
 *
 * @param {Array<[number, number]>} centers
 * @returns {number[][]} Chains of indexes into centers
 */
function chainDots(centers) {
  const n = centers.length;
  if (n <= 1) return centers.map((_, i) => [i]);
  const dist = (i, j) =>
    Math.hypot(centers[i][0] - centers[j][0], centers[i][1] - centers[j][1]);
  const nearest = [];
  for (let i = 0; i < n; i++) {
    const ds = [];
    for (let j = 0; j < n; j++) if (j !== i) ds.push(dist(i, j));
    ds.sort((a, b) => a - b);
    nearest.push(ds);
  }
  const spacings = nearest.map((ds) => ds[0]).sort((a, b) => a - b);
  const typical = spacings[Math.floor(spacings.length / 2)];
  const maxGap = Math.max(3 * typical, 2 * DOT_MAX_MM);
  const taken = new Uint8Array(n);
  const chains = [];
  for (let left = n; left > 0; ) {
    let start = -1;
    let farthest = -Infinity;
    for (let i = 0; i < n; i++) {
      if (taken[i]) continue;
      const second = nearest[i][1] ?? Infinity;
      if (second > farthest) {
        farthest = second;
        start = i;
      }
    }
    const chain = [start];
    taken[start] = 1;
    left--;
    let cur = start;
    for (;;) {
      let next = -1;
      let best = maxGap;
      for (let j = 0; j < n; j++) {
        if (taken[j]) continue;
        const d = dist(cur, j);
        if (d < best) {
          best = d;
          next = j;
        }
      }
      if (next < 0) break;
      chain.push(next);
      taken[next] = 1;
      left--;
      cur = next;
    }
    chains.push(chain);
  }
  return chains;
}

/** Groups of indexes whose centers chain within `withinMm` of each other. */
function clusterWithin(centers, withinMm) {
  const n = centers.length;
  const group = centers.map((_, i) => i);
  const find = (i) => {
    while (group[i] !== i) {
      group[i] = group[group[i]];
      i = group[i];
    }
    return i;
  };
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = Math.hypot(
        centers[i][0] - centers[j][0],
        centers[i][1] - centers[j][1]
      );
      if (d <= withinMm) group[find(i)] = find(j);
    }
  }
  const byRoot = new Map();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!byRoot.has(root)) byRoot.set(root, []);
    byRoot.get(root).push(i);
  }
  return [...byRoot.values()];
}

// ---------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------

/**
 * Turn the editor's classed regions into a map plan.
 *
 * @param {object} args
 * @param {Array<{key: string, index: number, name?: string, class: string, rings: Array<Array<{x: number, y: number}>>}>} args.regions
 *   As the map purpose hands them back: every surviving shape, its rings in
 *   the drawing's own units
 * @param {Object<string, string>} [args.classes] - A class per region key or
 *   index, over the region's own
 * @param {{unitsPerMm: number}} [args.scale] - The scale; without one the
 *   drawing's box is `mapWidthMm` wide
 * @param {{x: number, y: number, width: number, height: number}} [args.box]
 *   The drawing's box in its units (drawingBox); without one, the extent of
 *   every shape handed in, ignored ones included: the drawing as drawn
 * @param {number} [args.mapWidthMm] - The width the drawing is, with no scale
 * @param {number} [args.mapHeightMm] - The height, when the box has none
 * @param {string} [args.title]
 * @returns {{plan: object, warnings: Array<{code: string, featureId: string, regionKey: string, text: string}>, scale: {unitsPerMm: number}}}
 */
export function planFromRegions({
  regions = [],
  classes = null,
  scale = null,
  box = null,
  mapWidthMm = null,
  mapHeightMm = null,
  title = '',
} = {}) {
  const classOf = (region) =>
    classes?.[region.key] ??
    classes?.[region.index] ??
    region.class ??
    'ignore';

  // Every ring on its own, with its region and class; the nesting below
  // tells the holes from the shapes.
  const entries = [];
  for (const region of regions) {
    const cls = classOf(region);
    const def = mapClass(cls);
    const kind = def ? def.kind : 'ignore';
    for (const ring of region.rings || []) {
      if (!Array.isArray(ring) || ring.length < 3) continue;
      entries.push({ ring, region, cls, kind, def });
    }
  }

  // The scale comes from the drawing's box; the map's size and corner from
  // the shapes kept.
  const kept = entries.filter((e) => e.kind !== 'ignore');
  const extent = boundsOf((kept.length ? kept : entries).map((e) => e.ring));
  let frame = box;
  if (!(frame?.width > 0) || !(frame?.height > 0)) {
    frame =
      Number.isFinite(extent.minX) && extent.maxX > extent.minX
        ? {
            x: extent.minX,
            y: extent.minY,
            width: extent.maxX - extent.minX,
            height: extent.maxY - extent.minY,
          }
        : { x: 0, y: 0, width: mapWidthMm || 0, height: mapHeightMm || 0 };
  }
  let unitsPerMm = scale?.unitsPerMm > 0 ? scale.unitsPerMm : null;
  if (!unitsPerMm) {
    unitsPerMm =
      mapWidthMm > 0 && frame.width > 0 ? frame.width / mapWidthMm : 1;
  }
  let marginMm = 0;
  for (const e of kept) {
    if (e.kind === 'line' && e.def?.widthMm > 0)
      marginMm = Math.max(marginMm, e.def.widthMm / 2);
  }
  const corner = Number.isFinite(extent.minX)
    ? {
        x: extent.minX - marginMm * unitsPerMm,
        y: extent.minY - marginMm * unitsPerMm,
      }
    : { x: frame.x, y: frame.y };
  const toMm = (p) => ({
    x: (p.x - corner.x) / unitsPerMm,
    y: (p.y - corner.y) / unitsPerMm,
  });
  const w = Number.isFinite(extent.minX)
    ? round1((extent.maxX - extent.minX) / unitsPerMm + 2 * marginMm)
    : round1(frame.width / unitsPerMm);
  const h = Number.isFinite(extent.minY)
    ? round1((extent.maxY - extent.minY) / unitsPerMm + 2 * marginMm)
    : frame.height > 0
      ? round1(frame.height / unitsPerMm)
      : round1(mapHeightMm || 0);
  const plan = emptyPlan(w, h);
  plan.meta.title = title || '';
  plan.meta.scale = { unit: 'mm', unitsPerMm };
  const warnings = [];

  for (const e of entries) e.mm = e.ring.map(toMm);

  // Holes: a ring directly inside a shape's ring, of the shape's class or
  // ignored, is that shape's hole. Parents are decided first (by depth).
  const nesting = nestingOf(entries.map((e) => e.mm));
  const order = entries
    .map((_, i) => i)
    .sort((a, b) => nesting[a].depth - nesting[b].depth);
  for (const i of order) {
    const e = entries[i];
    const p = nesting[i].parent;
    e.hole = false;
    e.holes = [];
    if (p < 0) continue;
    const parent = entries[p];
    if (parent.hole || parent.kind === 'ignore') continue;
    if (e.cls === parent.cls || e.kind === 'ignore') {
      e.hole = true;
      parent.holes.push(e);
    }
  }

  // Ids: a region's key, then -2, -3 for every further feature it makes.
  const used = new Map();
  const idFor = (region) => {
    const n = (used.get(region.key) || 0) + 1;
    used.set(region.key, n);
    return n === 1 ? region.key : `${region.key}-${n}`;
  };
  const nameOf = (region) => region.name || region.key;
  const pairs = (ring) => ring.map((p) => [round2(p.x), round2(p.y)]);
  const keepAsArea = (e, code) => {
    const id = idFor(e.region);
    plan.features.push({
      id,
      class: e.cls,
      kind: 'area',
      name: nameOf(e.region),
      ring: pairs(e.mm),
      on: true,
    });
    warnings.push({
      code,
      featureId: id,
      regionKey: e.region.key,
      text: `${nameOf(e.region)} was traced as a line but is too wide to find its center; it was kept as an area.`,
    });
  };

  const points = new Map();
  const dots = new Map();
  const shapes = entries.filter((e) => !e.hole && e.kind !== 'ignore');
  for (const e of shapes) {
    if (e.kind === 'area') {
      plan.features.push({
        id: idFor(e.region),
        class: e.cls,
        kind: 'area',
        name: nameOf(e.region),
        ring: pairs(e.mm),
        on: true,
      });
    } else if (e.kind === 'point') {
      const c = centroid(e.mm);
      if (!points.has(e.cls)) points.set(e.cls, []);
      points.get(e.cls).push({ e, at: [c.x, c.y] });
    } else if (e.kind === 'line') {
      const b = boundsOf([e.mm]);
      const dx = b.maxX - b.minX;
      const dy = b.maxY - b.minY;
      const extent = Math.max(dx, dy);
      const aspect = dy > 0 ? dx / dy : Infinity;
      if (extent <= DOT_MAX_MM && aspect >= 0.5 && aspect <= 2) {
        const c = centroid(e.mm);
        if (!dots.has(e.cls)) dots.set(e.cls, []);
        dots.get(e.cls).push({ e, at: [c.x, c.y] });
        continue;
      }
      lineFeatures(e);
    }
  }

  function lineFeatures(e) {
    const rings = [e.mm, ...e.holes.map((hole) => hole.mm)];
    const ridge = ridgeWidthOfRings(rings, CELL_MM);
    if (ridge > MAX_LINE_WIDTH_MM) {
      keepAsArea(e, 'line-too-wide');
      return;
    }
    const lines = centerlines(rings, { ridgeMm: ridge });
    if (lines.length === 0) {
      keepAsArea(e, 'line-no-center');
      return;
    }
    for (const line of lines) {
      plan.features.push({
        id: idFor(e.region),
        class: e.cls,
        kind: 'line',
        name: nameOf(e.region),
        points: line.points,
        on: true,
      });
    }
  }

  for (const [cls, list] of dots) {
    const chains = chainDots(list.map((d) => d.at));
    for (const chain of chains) {
      if (chain.length === 1) {
        lineFeatures(list[chain[0]].e);
        continue;
      }
      const first = chain
        .map((i) => list[i])
        .sort((a, b) => a.e.region.index - b.e.region.index)[0];
      plan.features.push({
        id: idFor(first.e.region),
        class: cls,
        kind: 'line',
        name: nameOf(first.e.region),
        points: chain.map((i) => [
          round2(list[i].at[0]),
          round2(list[i].at[1]),
        ]),
        on: true,
      });
    }
  }

  for (const [cls, list] of points) {
    for (const group of clusterWithin(
      list.map((p) => p.at),
      SYMBOL_MERGE_MM
    )) {
      const members = group
        .map((i) => list[i])
        .sort((a, b) => a.e.region.index - b.e.region.index);
      const x = members.reduce((sum, m) => sum + m.at[0], 0) / members.length;
      const y = members.reduce((sum, m) => sum + m.at[1], 0) / members.length;
      plan.features.push({
        id: idFor(members[0].e.region),
        class: cls,
        kind: 'point',
        name: nameOf(members[0].e.region),
        at: [round2(x), round2(y)],
        on: true,
      });
    }
  }

  // The plan in the drawing's order, whatever the kinds were handled in.
  const rank = new Map(regions.map((r, i) => [r.key, i]));
  plan.features.sort(
    (a, b) =>
      (rank.get(a.id.replace(/-\d+$/, '')) ?? 0) -
      (rank.get(b.id.replace(/-\d+$/, '')) ?? 0)
  );

  void areaOf;
  return { plan, warnings, scale: { unitsPerMm } };
}
