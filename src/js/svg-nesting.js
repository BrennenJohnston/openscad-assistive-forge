/**
 * Nesting analysis for SVG designs: which shape sits inside which.
 *
 * The layered engine needs one thing this app never computed before: for
 * every element, how many other elements enclose it. That number is the
 * element's depth, and depth is what the owner's containment law is written
 * in - an element may only join layer N if something at layer N-1 still
 * surrounds it, or the printer is asked to build a piece of geometry
 * standing on nothing.
 *
 * PORTED FROM the owner's own stencil-forge repository, src/js/geometry-core.js
 * (https://github.com/BrennenJohnston/stencil-forge, GPL-3.0-or-later):
 * the ray-cast point-in-polygon, the bounding-box prefilter, and the
 * smallest-enclosing-ring parent search. Two things changed on the way over:
 *
 *   1. stencil-forge unions its input through clipper2-js first and builds
 *      the tree over RINGS. Here the tree is built over ELEMENTS, because
 *      the editor's Layer column is per element and a union would dissolve
 *      exactly the identities the column needs.
 *   2. No clipper2-js at all. That library is a dependency of this app, so
 *      the temptation is real and the trap is documented: at 1.2.4 its
 *      pointInPolygon returns IsOn for every input and executePolyTree
 *      throws internally and hands back an empty tree. A guard test pins
 *      this module's import list so neither can creep back in.
 *
 * Coordinates are SVG user units with transforms already baked by
 * svg-preparer's parseSvgElements (x right, y down). Nothing here parses
 * paint, so it is unharmed by the D-118 class-rule defect.
 *
 * @license GPL-3.0-or-later
 */

import {
  parsePathString,
  pathToAbsolute,
  pathToCurve,
} from 'svg-path-commander';

/**
 * The prototype's layer cap. The owner's number: three passes is what the
 * tiered charm model builds, so the editor never offers a fourth even when
 * the artwork could support one. The LIMIT a file earns is its nesting
 * depth; this is the ceiling applied to it.
 */
export const LAYER_CAP = 3;

/** Subdivisions per curve segment when flattening a path to a polygon. */
const CURVE_STEPS = 16;

/**
 * Segment budget for the self-intersection check. Past this the answer is
 * reported as unknown rather than guessed - see selfIntersects().
 */
const SELF_INTERSECT_BUDGET = 400;

/**
 * Whether a cubic segment is a straight line in disguise: both control
 * points lie on the chord, within a tolerance scaled to the chord itself.
 *
 * @returns {boolean}
 */
function isStraight(x0, y0, x1, y1, x2, y2, x3, y3) {
  const dx = x3 - x0;
  const dy = y3 - y0;
  const chord = Math.hypot(dx, dy);
  if (chord < 1e-12) {
    // A zero-length chord is only straight if the controls sit on it too.
    return (
      Math.hypot(x1 - x0, y1 - y0) < 1e-9 && Math.hypot(x2 - x0, y2 - y0) < 1e-9
    );
  }
  const tol = chord * 1e-6;
  const dist = (px, py) => Math.abs(dx * (py - y0) - dy * (px - x0)) / chord;
  if (dist(x1, y1) > tol || dist(x2, y2) > tol) return false;
  // On the chord's LINE is not enough - a control point beyond either end
  // makes the curve double back over itself.
  const along = (px, py) => ((px - x0) * dx + (py - y0) * dy) / (chord * chord);
  const t1 = along(x1, y1);
  const t2 = along(x2, y2);
  return t1 >= -1e-6 && t1 <= 1 + 1e-6 && t2 >= -1e-6 && t2 <= 1 + 1e-6;
}

/**
 * Flatten an SVG path `d` string into a polygon of sampled points.
 *
 * Curves are subdivided arithmetically rather than walked with
 * getPointAtLength, which costs a full path traversal per sample and turns
 * an 831-element file into a visible stall.
 *
 * @param {string} pathData - Path `d` attribute, absolute or relative
 * @param {number} [steps] - Subdivisions per curve segment
 * @returns {{points: Array<{x: number, y: number}>, closed: boolean}}
 */
export function polygonFromPathData(pathData, steps = CURVE_STEPS) {
  const empty = { points: [], closed: false };
  if (!pathData || typeof pathData !== 'string') return empty;
  let absolute;
  let curve;
  try {
    absolute = pathToAbsolute(parsePathString(pathData));
    curve = pathToCurve(absolute);
  } catch {
    return empty;
  }
  if (!Array.isArray(curve) || curve.length === 0) return empty;

  // pathToCurve DISCARDS the Z command - a closed square and an open one
  // come back as the same list of cubics. Closure is read from the parsed
  // path instead, or an unclosed outline would silently pass for a region.
  let closed = absolute.some((seg) => seg[0] === 'Z' || seg[0] === 'z');

  const points = [];
  let cx = 0;
  let cy = 0;
  const push = (x, y) => {
    const last = points[points.length - 1];
    if (last && Math.abs(last.x - x) < 1e-9 && Math.abs(last.y - y) < 1e-9) {
      return;
    }
    points.push({ x, y });
  };

  for (const seg of curve) {
    const op = seg[0];
    if (op === 'M') {
      cx = seg[1];
      cy = seg[2];
      push(cx, cy);
    } else if (op === 'C') {
      const [, x1, y1, x2, y2, x, y] = seg;
      // pathToCurve turns every straight L into a cubic with collinear
      // control points. Subdividing those would put sixteen points along
      // each side of a square: slower, and no more accurate. Emit the
      // corner and move on.
      if (isStraight(cx, cy, x1, y1, x2, y2, x, y)) {
        push(x, y);
      } else {
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          const u = 1 - t;
          push(
            u * u * u * cx +
              3 * u * u * t * x1 +
              3 * u * t * t * x2 +
              t * t * t * x,
            u * u * u * cy +
              3 * u * u * t * y1 +
              3 * u * t * t * y2 +
              t * t * t * y
          );
        }
      }
      cx = x;
      cy = y;
    } else if (op === 'L') {
      cx = seg[1];
      cy = seg[2];
      push(cx, cy);
    } else if (op === 'Z' || op === 'z') {
      closed = true;
    }
  }

  // A trailing point identical to the first is the closure, not a vertex.
  if (points.length > 1) {
    const first = points[0];
    const last = points[points.length - 1];
    if (
      Math.abs(first.x - last.x) < 1e-9 &&
      Math.abs(first.y - last.y) < 1e-9
    ) {
      points.pop();
      closed = true;
    }
  }
  return { points, closed };
}

/**
 * Signed area of a polygon. Positive and negative both mean "a region";
 * the sign records winding, which nesting does not care about.
 *
 * @param {Array<{x: number, y: number}>} polygon
 * @returns {number}
 */
export function signedArea(polygon) {
  let a = 0;
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const p = polygon[i];
    const q = polygon[(i + 1) % n];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/**
 * Axis-aligned bounds of a polygon.
 *
 * @param {Array<{x: number, y: number}>} polygon
 * @returns {{minX: number, minY: number, maxX: number, maxY: number}|null}
 */
export function boundsOf(polygon) {
  if (!polygon || polygon.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of polygon) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Ray-cast point-in-polygon (even-odd crossing count).
 *
 * Ported from stencil-forge geometry-core.js. Points exactly on the boundary
 * are unspecified, which is why containment is tested with an interior point
 * rather than a vertex - see interiorPoint().
 *
 * @param {{x: number, y: number}} pt
 * @param {Array<{x: number, y: number}>} polygon
 * @returns {boolean}
 */
export function pointInPolygon(pt, polygon) {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (
      a.y > pt.y !== b.y > pt.y &&
      pt.x < a.x + ((pt.y - a.y) * (b.x - a.x)) / (b.y - a.y)
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * A point strictly inside a polygon.
 *
 * stencil-forge probes with polygon[0], which is a VERTEX - it lies on its
 * own boundary, and two shapes that touch there answer unpredictably. A
 * letter's counter touches its stem in exactly that way. So scan a
 * horizontal line across the shape, collect the crossings, and take the
 * middle of the widest interior span: guaranteed inside for a simple
 * polygon, and the widest span is the one most tolerant of a wobble.
 *
 * @param {Array<{x: number, y: number}>} polygon
 * @returns {{x: number, y: number}|null} null when no interior exists
 */
export function interiorPoint(polygon) {
  if (!polygon || polygon.length < 3) return null;
  const b = boundsOf(polygon);
  if (!b || b.maxY - b.minY <= 0) return null;

  // Several scan lines, because one can land on a vertex row or miss a
  // thin arm entirely.
  const fractions = [0.5, 0.25, 0.75, 0.135, 0.865, 0.38, 0.62];
  for (const f of fractions) {
    const y = b.minY + (b.maxY - b.minY) * f;
    const xs = [];
    const n = polygon.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const p = polygon[i];
      const q = polygon[j];
      if (p.y > y !== q.y > y) {
        xs.push(p.x + ((y - p.y) * (q.x - p.x)) / (q.y - p.y));
      }
    }
    if (xs.length < 2) continue;
    xs.sort((m, n2) => m - n2);
    let best = null;
    let bestWidth = 0;
    // Crossings pair up as inside spans under the even-odd rule.
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const width = xs[i + 1] - xs[i];
      if (width > bestWidth) {
        bestWidth = width;
        best = { x: (xs[i] + xs[i + 1]) / 2, y };
      }
    }
    if (best && bestWidth > 1e-9) return best;
  }
  return null;
}

/**
 * Whether a polygon crosses itself.
 *
 * Reported honestly: a shape with more segments than the budget returns
 * `checked: false` rather than a comforting `false`. A silent "no problems
 * found" that only means "did not look" is the kind of answer this project
 * has been burned by before.
 *
 * @param {Array<{x: number, y: number}>} polygon
 * @returns {{checked: boolean, intersects: boolean}}
 */
export function selfIntersects(polygon) {
  const n = polygon ? polygon.length : 0;
  if (n < 4) return { checked: true, intersects: false };
  if (n > SELF_INTERSECT_BUDGET) return { checked: false, intersects: false };

  const cross = (ox, oy, ax, ay, bx, by) =>
    (ax - ox) * (by - oy) - (ay - oy) * (bx - ox);
  for (let i = 0; i < n; i++) {
    const a1 = polygon[i];
    const a2 = polygon[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      // Adjacent segments always share an endpoint; the wrap-around pair
      // (last, first) is adjacent too.
      if (i === 0 && j === n - 1) continue;
      const b1 = polygon[j];
      const b2 = polygon[(j + 1) % n];
      const d1 = cross(a1.x, a1.y, a2.x, a2.y, b1.x, b1.y);
      const d2 = cross(a1.x, a1.y, a2.x, a2.y, b2.x, b2.y);
      const d3 = cross(b1.x, b1.y, b2.x, b2.y, a1.x, a1.y);
      const d4 = cross(b1.x, b1.y, b2.x, b2.y, a2.x, a2.y);
      if (d1 * d2 < 0 && d3 * d4 < 0)
        return { checked: true, intersects: true };
    }
  }
  return { checked: true, intersects: false };
}

/**
 * @typedef {object} NestingNode
 * @property {number} index - Position in the input element array
 * @property {Array<{x: number, y: number}>} polygon - Flattened outline
 * @property {number} depth - 0 for outermost, 1 for one enclosure, ...
 * @property {number|null} parent - Index of the smallest enclosing element
 * @property {number[]} children - Indices directly inside this one
 * @property {number} area - Unsigned area in square user units
 * @property {boolean} closed - The subpath carried a Z
 * @property {boolean} degenerate - No usable interior
 * @property {string[]} notes - Plain-language observations for the UI
 */

/**
 * Build the element containment tree.
 *
 * @param {Array<{pathData: string}>} elements - Parsed SVG elements, in
 *   document order, with transforms already baked
 * @param {object} [options]
 * @param {number} [options.curveSteps]
 * @returns {{nodes: NestingNode[], roots: number[], maxDepth: number,
 *   depthLimit: number, degenerateCount: number}}
 */
export function buildNestingTree(elements, options = {}) {
  const list = Array.isArray(elements) ? elements : [];
  const steps = options.curveSteps || CURVE_STEPS;

  const nodes = list.map((el, index) => {
    const { points, closed } = polygonFromPathData(el?.pathData, steps);
    const area = points.length >= 3 ? Math.abs(signedArea(points)) : 0;
    const probe = interiorPoint(points);
    const notes = [];
    if (points.length === 0) notes.push('empty');
    else if (!closed) notes.push('open');
    if (points.length >= 3 && area <= 1e-9) notes.push('zero-area');
    if (!probe && points.length > 0) notes.push('no-interior');
    return {
      index,
      polygon: points,
      probe,
      bounds: boundsOf(points),
      area,
      closed,
      degenerate: !probe,
      depth: 0,
      parent: null,
      children: [],
      notes,
    };
  });

  // Smallest enclosing element wins, so walk candidates from small to large
  // and stop at the first hit - the same ordering stencil-forge uses.
  const usable = nodes.filter((n) => !n.degenerate);
  const byAreaAsc = [...usable].sort((a, b) => a.area - b.area);

  for (let i = 0; i < byAreaAsc.length; i++) {
    const node = byAreaAsc[i];
    for (let j = i + 1; j < byAreaAsc.length; j++) {
      const candidate = byAreaAsc[j];
      const cb = candidate.bounds;
      const nb = node.bounds;
      if (
        nb.minX < cb.minX ||
        nb.maxX > cb.maxX ||
        nb.minY < cb.minY ||
        nb.maxY > cb.maxY
      ) {
        continue;
      }
      if (pointInPolygon(node.probe, candidate.polygon)) {
        node.parent = candidate.index;
        candidate.children.push(node.index);
        break;
      }
    }
  }

  const roots = [];
  for (const node of nodes) {
    if (node.parent === null && !node.degenerate) roots.push(node.index);
  }
  const assignDepth = (index, depth) => {
    const node = nodes[index];
    node.depth = depth;
    for (const child of node.children) assignDepth(child, depth + 1);
  };
  for (const root of roots) assignDepth(root, 0);

  let maxDepth = 0;
  for (const node of nodes) {
    if (!node.degenerate && node.depth > maxDepth) maxDepth = node.depth;
  }

  for (const node of nodes) {
    delete node.bounds;
    delete node.probe;
  }

  return {
    nodes,
    roots,
    maxDepth,
    // How many times the layering process can run: one pass per level of
    // nesting the artwork actually has.
    depthLimit: nodes.some((n) => !n.degenerate) ? maxDepth + 1 : 0,
    degenerateCount: nodes.filter((n) => n.degenerate).length,
  };
}

/**
 * The layer each element is suggested for: its nesting depth, capped.
 *
 * Auto-categorized, and editable afterwards - the suggestion is a starting
 * point, not a verdict.
 *
 * @param {{nodes: NestingNode[]}} tree
 * @param {number} [cap]
 * @returns {Array<number|null>} Layer per element index, null when unusable
 */
export function suggestLayers(tree, cap = LAYER_CAP) {
  if (!tree || !Array.isArray(tree.nodes)) return [];
  return tree.nodes.map((n) =>
    n.degenerate ? null : Math.min(n.depth + 1, cap)
  );
}

/**
 * The number of layers this artwork can support, never above the cap.
 *
 * @param {{depthLimit: number}} tree
 * @param {number} [cap]
 * @returns {number}
 */
export function layerLimit(tree, cap = LAYER_CAP) {
  if (!tree || !tree.depthLimit) return 0;
  return Math.min(tree.depthLimit, cap);
}

/**
 * Check an assignment against the owner's containment law.
 *
 * The law, verbatim from the directive (line 9):
 *
 *   "By default, after layer 1, all elements are embossed or raised, then
 *   deleted. The elements that get selected for layer 2 bypass this
 *   deletion process. When selecting layer 3 elements, the rule is the
 *   element selected must not have been cut during the previous layers.
 *   This will protect the 3D generating process from floating elements
 *   that are disjointed from the larger object being built."
 *
 * Mechanically: an element on layer N (N > 1) must sit inside an element on
 * layer N-1. Anything else is asked to stand on material that was removed.
 *
 * Nothing is reassigned here. A broken row is reported and stays as the
 * person set it.
 *
 * @param {{nodes: NestingNode[]}} tree
 * @param {Array<number|null>} layers - Layer per element index
 * @returns {Array<{index: number, layer: number, reason: string}>} Problems
 */
export function validateLayers(tree, layers) {
  if (!tree || !Array.isArray(tree.nodes) || !Array.isArray(layers)) return [];
  const problems = [];
  for (const node of tree.nodes) {
    const layer = layers[node.index];
    if (!layer || layer <= 1 || node.degenerate) continue;

    let ancestor = node.parent;
    let supported = false;
    while (ancestor !== null && ancestor !== undefined) {
      if (layers[ancestor] === layer - 1) {
        supported = true;
        break;
      }
      ancestor = tree.nodes[ancestor]?.parent ?? null;
    }
    if (!supported) {
      problems.push({
        index: node.index,
        layer,
        reason:
          node.parent === null
            ? 'not-enclosed'
            : 'enclosing-shape-on-wrong-layer',
      });
    }
  }
  return problems;
}
