/**
 * Rings: closed polygons in one coordinate space, with flat boolean ops.
 *
 * The colour model needs to ask questions the element-level nesting tree
 * cannot answer - what are the FACES of a line network, what is left of a
 * plate once the colours after it are added, is this hole an island - and all
 * of them are boolean questions about closed rings rather than about drawn
 * elements. This module is that layer, and nothing above it talks to
 * clipper2-js directly.
 *
 * PORTED FROM the owner's own stencil-forge repository,
 * src/js/geometry-core.js (https://github.com/BrennenJohnston/stencil-forge,
 * GPL-3.0-or-later): the SCALE convention, the Path64 conversions, the three
 * flat booleans, the signed-area and centroid formulas, and buildRingTree.
 * Three things changed on the way over:
 *
 *   1. The units are the CALLER'S, not millimetres. A face of a drawing is
 *      found in SVG user units and only becomes millimetres when a plate
 *      size says so, and a module that calls everything mm invites exactly
 *      the mistake D-122 was.
 *   2. `pointInPolygon` and `boundsOf` are IMPORTED from svg-nesting.js
 *      rather than ported a second time. That file carries the same ray-cast,
 *      from the same source, and one copy of a predicate is the point.
 *   3. `offsetRegion` and `morphologicalOpen` were deliberately NOT brought
 *      over. Their only intended caller is the raster lane's sliver cleanup
 *      (DP-18), and the measured lesson there is a pixel-AREA floor, not a
 *      morphological open. Porting a hundred lines of resample-and-displace
 *      for a caller that may never want it is code no one asked for; it can
 *      come when something needs it, and svg-offset.js already carries the
 *      same construction for path strings.
 *
 * ★ clipper2-js@1.2.4 IS PARTLY BROKEN, and this module is written around it
 * (D-107, measured in the standalone and pinned by a guard test here):
 *   - Flat `Union` / `Difference` / `Intersect` are correct. Only these.
 *   - `executePolyTree()` throws internally and hands back an empty tree, so
 *     ring nesting is built HERE (buildRingTree).
 *   - `Clipper.pointInPolygon()` answers IsOn for every input, so the
 *     predicate comes from svg-nesting.
 *   - `ClipperOffset` / `InflatePaths` apply about half the delta asked for
 *     and displace negative offsets.
 * A guard test in `ring-geometry.test.js` pins the import list and every
 * clipper member this file may touch, and is proven able to fail.
 *
 * Ring convention, which is clipper2's own union output: a solid ring has
 * positive shoelace area and a hole has negative. A "region" is a flat array
 * of such rings.
 *
 * @license GPL-3.0-or-later
 */

import { Clipper, FillRule, Paths64 } from 'clipper2-js';
import {
  boundsOf,
  pointInPolygon,
  polygonFromPathData,
} from './svg-nesting.js';
import {
  parsePathString,
  pathToAbsolute,
  pathToCurve,
} from 'svg-path-commander';

/**
 * Caller units per Clipper integer unit.
 *
 * 1000 means a thousandth of a caller unit survives the round trip: a
 * micrometre when the caller counts millimetres, and about a quarter of a
 * micrometre on the cat, whose drawing is 119.813 units wide. Rounding is the
 * only lossy step in a boolean, so it is named once, here.
 */
export const SCALE = 1000;

/**
 * One ring to a Clipper Path64.
 *
 * @param {Array<{x: number, y: number}>} ring
 * @returns {import('clipper2-js').Path64}
 */
export function toPath64(ring) {
  const flat = [];
  for (const p of ring)
    flat.push(Math.round(p.x * SCALE), Math.round(p.y * SCALE));
  return Clipper.makePath(flat);
}

/**
 * One Clipper Path64 back to a ring.
 *
 * @param {import('clipper2-js').Path64} path
 * @returns {Array<{x: number, y: number}>}
 */
export function fromPath64(path) {
  const out = [];
  for (const pt of path)
    out.push({ x: Number(pt.x) / SCALE, y: Number(pt.y) / SCALE });
  return out;
}

/**
 * Rings to Paths64. Anything with fewer than three points is not a ring.
 *
 * @param {Array<Array<{x: number, y: number}>>} rings
 * @returns {import('clipper2-js').Paths64}
 */
export function toPaths64(rings) {
  const paths = new Paths64();
  for (const ring of rings) {
    if (ring && ring.length >= 3) paths.push(toPath64(ring));
  }
  return paths;
}

/**
 * Paths64 back to rings.
 *
 * Degenerate rings are dropped here rather than by each caller: this port
 * occasionally emits a zero-area artefact ring - measured in the standalone
 * on a re-union of an already-unioned donut - and every clipper result in
 * this module comes back through this one function.
 *
 * @param {import('clipper2-js').Paths64} paths
 * @returns {Array<Array<{x: number, y: number}>>}
 */
export function fromPaths64(paths) {
  const out = [];
  for (const path of paths) {
    if (path.length < 3) continue;
    const ring = fromPath64(path);
    if (Math.abs(areaOf(ring)) < 1e-9) continue;
    out.push(ring);
  }
  return out;
}

/**
 * Read a set of rings the way an SVG reads them: EVEN-ODD.
 *
 * ★ THIS IS NOT A UNION, and calling it one is how the mistake gets made. Two
 * overlapping squares come back as a ring with a HOLE where they overlap,
 * because a point covered twice is outside under even-odd. That is exactly
 * right when the rings are a drawing - a compound path's subpaths are even-odd
 * against each other, which is what makes the counter of a letter a counter -
 * and exactly wrong when they are two regions being combined.
 *
 * Use this to INTERPRET one drawing. Use `union` to COMBINE regions.
 *
 * ★ Order-independent either way, which is the reason this layer exists. The
 * even-odd union `flattenToCompoundPath` performs through path-bool is
 * order-DEPENDENT once shapes overlap (D-120): the same 139 stroke bands in a
 * different order give a different picture and the drawing quietly corrupts.
 * Clipper does not care what order the rings arrive in.
 *
 * @param {Array<Array<{x: number, y: number}>>} rings
 * @returns {Array<Array<{x: number, y: number}>>} Clipper convention: solid
 *   rings positive, holes negative
 */
export function evenOddUnion(rings) {
  return fromPaths64(
    Clipper.Union(toPaths64(rings), undefined, FillRule.EvenOdd)
  );
}

/**
 * A true union of regions: everything covered by anything.
 *
 * NonZero, so an area covered twice stays covered. That needs the rings to be
 * wound the way clipper writes them - solids one way, holes the other - which
 * is what `orientRegion` is for and what everything in this module hands back.
 *
 * @param {Array<Array<{x: number, y: number}>>} a
 * @param {Array<Array<{x: number, y: number}>>} [b]
 * @returns {Array<Array<{x: number, y: number}>>}
 */
export function union(a, b) {
  return fromPaths64(
    Clipper.Union(toPaths64(a), b ? toPaths64(b) : undefined, FillRule.NonZero)
  );
}

/**
 * Wind a region the way clipper writes one: the outer ring positive, every
 * other ring negative.
 *
 * A face of a line drawing arrives the other way up - it IS a hole of the
 * drawing's union, so its outer ring is negative and the islands inside it are
 * positive - and a NonZero union of rings wound like that returns the
 * complement of what was meant.
 *
 * @param {Array<Array<{x: number, y: number}>>} rings - Outer ring first
 * @returns {Array<Array<{x: number, y: number}>>}
 */
export function orientRegion(rings) {
  return rings.map((ring, i) => {
    const a = areaOf(ring);
    const wantPositive = i === 0;
    return a > 0 === wantPositive ? ring : [...ring].reverse();
  });
}

/**
 * Subject minus clip. NonZero, like `union`: these are region operations.
 *
 * @param {Array<Array<{x: number, y: number}>>} subject
 * @param {Array<Array<{x: number, y: number}>>} clip
 * @returns {Array<Array<{x: number, y: number}>>}
 */
export function difference(subject, clip) {
  return fromPaths64(
    Clipper.Difference(toPaths64(subject), toPaths64(clip), FillRule.NonZero)
  );
}

/**
 * What subject and clip share. NonZero, like `union`.
 *
 * @param {Array<Array<{x: number, y: number}>>} subject
 * @param {Array<Array<{x: number, y: number}>>} clip
 * @returns {Array<Array<{x: number, y: number}>>}
 */
export function intersect(subject, clip) {
  return fromPaths64(
    Clipper.Intersect(toPaths64(subject), toPaths64(clip), FillRule.NonZero)
  );
}

/**
 * Signed area of a ring. Positive is a solid, negative is a hole.
 *
 * @param {Array<{x: number, y: number}>} ring
 * @returns {number} In the caller's units, squared
 */
export function areaOf(ring) {
  let a = 0;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % n];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/**
 * Net area of a region: solids minus holes.
 *
 * @param {Array<Array<{x: number, y: number}>>} rings
 * @returns {number}
 */
export function regionArea(rings) {
  let sum = 0;
  for (const ring of rings) sum += areaOf(ring);
  return sum;
}

/**
 * Area-weighted centroid of a ring, falling back to the vertex mean for a
 * ring with no area to weight by.
 *
 * @param {Array<{x: number, y: number}>} ring
 * @returns {{x: number, y: number}}
 */
export function centroid(ring) {
  let a = 0;
  let cx = 0;
  let cy = 0;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % n];
    const cross = p.x * q.y - q.x * p.y;
    a += cross;
    cx += (p.x + q.x) * cross;
    cy += (p.y + q.y) * cross;
  }
  if (Math.abs(a) < 1e-12) {
    let sx = 0;
    let sy = 0;
    for (const p of ring) {
      sx += p.x;
      sy += p.y;
    }
    return { x: sx / n, y: sy / n };
  }
  a *= 0.5;
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

/**
 * @typedef {object} RingNode
 * @property {Array<{x: number, y: number}>} ring
 * @property {boolean} isHole - Negative-area ring
 * @property {number} area - Signed
 * @property {number} depth - 0 for top-level solids, 1 for their holes, ...
 * @property {RingNode|null} parent
 * @property {RingNode[]} children
 */

/**
 * Union the input and build the containment tree over the result.
 *
 * Stands in for clipper2-js's executePolyTree, which throws internally and
 * returns nothing. Containment is decided by casting one vertex of each ring
 * against the larger rings, bounding-box prefiltered, smallest enclosing ring
 * first - so a ring's parent is the ring immediately around it.
 *
 * @param {Array<Array<{x: number, y: number}>>} rings
 * @returns {{roots: RingNode[], nodes: RingNode[]}}
 */
export function buildRingTree(rings) {
  const unioned = evenOddUnion(rings);
  const nodes = unioned.map((ring) => {
    const area = areaOf(ring);
    return {
      ring,
      isHole: area < 0,
      area,
      depth: 0,
      parent: null,
      children: [],
      bounds: boundsOf(ring),
    };
  });

  const byAreaAsc = [...nodes].sort(
    (a, b) => Math.abs(a.area) - Math.abs(b.area)
  );
  for (let i = 0; i < byAreaAsc.length; i++) {
    const node = byAreaAsc[i];
    const probe = node.ring[0];
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
      if (pointInPolygon(probe, candidate.ring)) {
        node.parent = candidate;
        candidate.children.push(node);
        break;
      }
    }
  }

  const roots = nodes.filter((n) => !n.parent);
  const assignDepth = (node, depth) => {
    node.depth = depth;
    for (const child of node.children) assignDepth(child, depth + 1);
  };
  for (const root of roots) assignDepth(root, 0);
  for (const node of nodes) delete node.bounds;
  return { roots, nodes };
}

/**
 * Ramer-Douglas-Peucker, through the one clipper2 simplifier that works.
 *
 * @param {Array<Array<{x: number, y: number}>>} rings
 * @param {number} epsilon - Largest deviation allowed, caller's units
 * @returns {Array<Array<{x: number, y: number}>>}
 */
export function simplify(rings, epsilon) {
  if (!epsilon || epsilon <= 0) return rings;
  return fromPaths64(
    Clipper.simplifyPaths(toPaths64(rings), epsilon * SCALE, true)
  );
}

/**
 * One ring per SUBPATH of a path.
 *
 * `polygonFromPathData` concatenates every subpath into a single point list,
 * which is right for a nesting bound and wrong for a hole: the segment that
 * joins the end of one subpath to the start of the next is not an edge of
 * either, and rasterising or unioning through it draws a bar across the gap.
 * Everything goes through `pathToCurve` first, so each subpath opens with an
 * absolute M whatever the file was written in.
 *
 * @param {string} pathData
 * @param {number} [steps] - Subdivisions per curve, passed through
 * @returns {Array<Array<{x: number, y: number}>>}
 */
export function ringsFromPathData(pathData, steps) {
  if (!pathData || typeof pathData !== 'string') return [];
  let curve;
  try {
    curve = pathToCurve(pathToAbsolute(parsePathString(pathData)));
  } catch {
    return [];
  }
  const groups = [];
  let current = null;
  for (const seg of curve) {
    if (seg[0] === 'M') {
      current = [seg];
      groups.push(current);
    } else if (current) {
      current.push(seg);
    }
  }
  const rings = [];
  for (const group of groups) {
    const text = group.map((s) => s[0] + ' ' + s.slice(1).join(' ')).join(' ');
    const { points } = polygonFromPathData(text, steps);
    if (points.length >= 3) rings.push(points);
  }
  return rings;
}

/**
 * Rings back to path data, one subpath each, closed.
 *
 * Straight lines only: a ring is already a polygon by the time it is here,
 * and re-fitting curves to it would be inventing accuracy the boolean does
 * not have.
 *
 * @param {Array<Array<{x: number, y: number}>>} rings
 * @param {number} [decimals]
 * @returns {string}
 */
export function ringsToPathData(rings, decimals = 4) {
  const f = 10 ** decimals;
  const r = (n) => Math.round(n * f) / f;
  const parts = [];
  for (const ring of rings) {
    if (!ring || ring.length < 3) continue;
    let d = `M ${r(ring[0].x)} ${r(ring[0].y)}`;
    for (let i = 1; i < ring.length; i++)
      d += ` L ${r(ring[i].x)} ${r(ring[i].y)}`;
    parts.push(d + ' Z');
  }
  return parts.join(' ');
}
