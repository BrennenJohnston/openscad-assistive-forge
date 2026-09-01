/**
 * Bridges: ribs of material left across a cut so an island stays attached.
 *
 * PORTED FROM the owner's own stencil-forge repository, src/js/stencil-bridges.js
 * (https://github.com/BrennenJohnston/stencil-forge, GPL-3.0-or-later): the
 * ray/ring intersection, the rib rectangle, and the fan of evenly spaced rays
 * with a half-step retry. Prior art surveyed there: PathBinder (MIT) and
 * BridgeIt (MIT) place configurable-width connectors the same way.
 *
 * ★ WHERE BRIDGES BELONG, AND WHERE THEY DO NOT. The 3D-printed multi-layer
 * stencil exists so that bridges are UNNECESSARY: each plate's cut is the
 * union of its layer and everything deeper, which is always solid and never a
 * ring, so nothing is ever left connected to nothing. See stencil-plates.js.
 *
 * A LASER CUT has no such luxury. It is one sheet, cut once, and the counter
 * of an O always falls out. So bridges are the laser lane's instrument, and
 * the single-sheet 3D print's, and they are not used by the layered mode at
 * all. Reaching for them there would put a scar across artwork that did not
 * need one.
 *
 * One deliberate change on the way over: the owner's version fans its rays
 * from the island's CENTROID. A centroid can fall outside a concave island -
 * the middle of a C is in the gap - and rays from outside cross the ring in
 * the wrong order. This uses svg-nesting's interiorPoint(), which scans for a
 * point genuinely inside, for the same reason the nesting analysis does.
 *
 * @license GPL-3.0-or-later
 */

import { interiorPoint } from './svg-nesting.js';

/** Rib width and overlap defaults, in millimetres. */
export const BRIDGE_WIDTH_MM = 3;
export const BRIDGE_OVERLAP_MM = 0.5;

/**
 * Every positive ray parameter t where c + t*dir crosses the ring.
 *
 * @param {{x: number, y: number}} c - Ray origin
 * @param {{x: number, y: number}} dir - Unit direction
 * @param {Array<{x: number, y: number}>} ring
 * @returns {number[]} Sorted ascending
 */
export function rayRingIntersections(c, dir, ring) {
  const out = [];
  if (!ring || ring.length < 2) return out;
  const n = ring.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const a = ring[j];
    const b = ring[i];
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const denom = dir.x * ey - dir.y * ex;
    if (Math.abs(denom) < 1e-12) continue;
    const t = ((a.x - c.x) * ey - (a.y - c.y) * ex) / denom;
    const u = ((a.x - c.x) * dir.y - (a.y - c.y) * dir.x) / denom;
    if (t > 1e-9 && u >= 0 && u <= 1) out.push(t);
  }
  return out.sort((p, q) => p - q);
}

/**
 * One rib, as a rectangle spanning a gap along a ray.
 *
 * @param {{x: number, y: number}} c
 * @param {{x: number, y: number}} dir - Unit direction
 * @param {number} tStart
 * @param {number} tEnd
 * @param {number} widthMm
 * @returns {Array<{x: number, y: number}>}
 */
export function ribRect(c, dir, tStart, tEnd, widthMm) {
  const nx = -dir.y;
  const ny = dir.x;
  const h = widthMm / 2;
  const at = (t) => ({ x: c.x + dir.x * t, y: c.y + dir.y * t });
  const s = at(tStart);
  const e = at(tEnd);
  return [
    { x: s.x + nx * h, y: s.y + ny * h },
    { x: e.x + nx * h, y: e.y + ny * h },
    { x: e.x - nx * h, y: e.y - ny * h },
    { x: s.x - nx * h, y: s.y - ny * h },
  ];
}

/**
 * Ribs for one island: a fan of evenly spaced rays, each retried once at a
 * half-step if it finds no clean crossing pair.
 *
 * A ray that still fails is REPORTED, not silently dropped. An island held by
 * one rib instead of two is a thing someone needs to know about before they
 * cut, not after it falls on the floor.
 *
 * @param {{ring: Array, enclosingRing: Array}} island
 * @param {object} [options]
 * @param {number} [options.count=2] - Ribs per island
 * @param {number} [options.widthMm]
 * @param {number} [options.angleOffsetDeg=0]
 * @param {number} [options.overlapMm]
 * @returns {{rects: Array<Array<{x: number, y: number}>>, failedAngles: number[]}}
 */
export function generateBridgesForIsland(island, options = {}) {
  const {
    count = 2,
    widthMm = BRIDGE_WIDTH_MM,
    angleOffsetDeg = 0,
    overlapMm = BRIDGE_OVERLAP_MM,
  } = options;

  const rects = [];
  const failedAngles = [];
  if (!island || !island.ring || !island.enclosingRing) {
    return { rects, failedAngles };
  }
  // An interior point, not the centroid: the middle of a C is in the gap, and
  // rays fired from outside the island cross its ring in the wrong order.
  const c = interiorPoint(island.ring);
  if (!c) return { rects, failedAngles: [0] };

  for (let k = 0; k < count; k++) {
    const baseDeg = angleOffsetDeg + (360 / count) * k;
    let placed = false;

    for (const retryDeg of [0, 180 / count]) {
      const rad = ((baseDeg + retryDeg) * Math.PI) / 180;
      const dir = { x: Math.cos(rad), y: Math.sin(rad) };

      const islandTs = rayRingIntersections(c, dir, island.ring);
      if (islandTs.length === 0) continue;
      const tExit = islandTs[islandTs.length - 1];

      const outerTs = rayRingIntersections(c, dir, island.enclosingRing).filter(
        (t) => t > tExit + 1e-9
      );
      if (outerTs.length === 0) continue;

      rects.push(
        ribRect(c, dir, tExit - overlapMm, outerTs[0] + overlapMm, widthMm)
      );
      placed = true;
      break;
    }

    if (!placed) failedAngles.push(baseDeg);
  }

  return { rects, failedAngles };
}

/**
 * The islands in a single-sheet cut: a shape wholly inside another shape,
 * with nothing holding it once the cut is made.
 *
 * @param {Array} elements - Parsed elements, positionally aligned with tree
 * @param {{nodes: Array}} tree - buildNestingTree result
 * @returns {Array<{index: number, ring: Array, enclosingRing: Array}>}
 */
export function findIslands(elements, tree) {
  const out = [];
  if (!Array.isArray(elements) || !tree || !Array.isArray(tree.nodes)) {
    return out;
  }
  for (const node of tree.nodes) {
    if (node.parent === null || node.parent === undefined) continue;
    if (node.degenerate) continue;
    const parent = tree.nodes[node.parent];
    if (!parent || parent.polygon.length < 3) continue;
    out.push({
      index: node.index,
      ring: node.polygon,
      enclosingRing: parent.polygon,
    });
  }
  return out;
}

/**
 * Bridges for a whole design, with a plain-language report.
 *
 * STRINGS: owner review pending (DP-R1 text pack).
 *
 * @param {Array} elements
 * @param {{nodes: Array}} tree
 * @param {object} [options] - Passed to generateBridgesForIsland
 * @returns {{rects: Array, islandCount: number, unheld: number,
 *   partlyHeld: number, message: string|null}}
 */
export function buildBridges(elements, tree, options = {}) {
  const islands = findIslands(elements, tree);
  const rects = [];
  let unheld = 0;
  let partlyHeld = 0;

  for (const island of islands) {
    const { rects: ribs, failedAngles } = generateBridgesForIsland(
      island,
      options
    );
    rects.push(...ribs);
    // No rib at all means the shape falls out. Fewer ribs than asked for is
    // not a failure - it is still held - so it is counted separately.
    if (ribs.length === 0) unheld += 1;
    else if (failedAngles.length > 0) partlyHeld += 1;
  }

  let message = null;
  if (islands.length === 0) {
    message = null;
  } else if (unheld > 0) {
    message =
      unheld === 1
        ? `1 shape in this design could not be given a bridge and will fall out when it is cut. Make it larger, or move it away from the edge it sits against.`
        : `${unheld} shapes in this design could not be given bridges and will fall out when they are cut. Make them larger, or move them away from the edges they sit against.`;
  }

  return {
    rects,
    islandCount: islands.length,
    unheld,
    partlyHeld,
    message,
  };
}

/**
 * Rib rectangles as path data, for subtracting from a cut.
 *
 * @param {Array<Array<{x: number, y: number}>>} rects
 * @returns {string}
 */
export function bridgesToPathData(rects) {
  return (rects || [])
    .filter((r) => r && r.length >= 3)
    .map(
      (r) =>
        'M ' + r.map((p) => `${round(p.x)} ${round(p.y)}`).join(' L ') + ' Z'
    )
    .join(' ');
}

function round(n) {
  return Math.round(n * 1e4) / 1e4;
}
