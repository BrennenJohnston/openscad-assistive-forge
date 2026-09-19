/**
 * SVG Path Offset Bridge Module
 *
 * Polygon offset for SVG path strings, with clipper2-js used for boolean
 * cleanup only.
 *
 * D-107: clipper2-js@1.2.4's ClipperOffset is defective and offsetPath no
 * longer routes through it. MEASURED on an 80×80 square (see
 * svg-offset.test.js): outsets landed at 92–95% of the requested delta
 * and lopsided (one side exact, the other short), and insets delivered
 * only 9–15% — a requested −5 shrank each side by 0.47 units. The error
 * varies with scale, so no wrapper factor can correct it. The offset
 * outline is now built here (parallel edge segments, round-join arcs at
 * opening corners, a raw-vertex detour at overlap corners so overshoot
 * debris winds negative) and cleaned with a Positive-fill union — the
 * port's flat boolean ops are correct and stay in use.
 *
 * @license GPL-3.0-or-later
 */

import { getPointAtLength, getTotalLength } from 'svg-path-commander';
import { Clipper, FillRule, Paths64 } from 'clipper2-js';

const SCALE = 1000;

/**
 * Compute an adaptive sample count based on path total length.
 * Ensures simple paths get at least 256 samples and complex paths
 * scale up proportionally, capped at 2048 for performance.
 *
 * @param {number} totalLength - Total arc length of the SVG path
 * @returns {number}
 */
export function adaptiveSampleCount(totalLength) {
  return Math.max(256, Math.min(2048, Math.round(totalLength * 2)));
}

/**
 * Sample an SVG path `d` string to an array of {x, y} points.
 *
 * When sampleCount is omitted, the count is chosen adaptively based on
 * path total length (min 256, scale with length, max 2048).
 *
 * @param {string} pathData - SVG path `d` attribute
 * @param {number} [sampleCount] - Number of evenly-spaced sample points
 * @returns {Array<{x: number, y: number}>}
 */
export function pathToPolygon(pathData, sampleCount) {
  if (!pathData || typeof pathData !== 'string') return [];

  const totalLen = getTotalLength(pathData);
  if (totalLen === 0) return [];

  const count = sampleCount ?? adaptiveSampleCount(totalLen);
  const points = [];
  for (let i = 0; i < count; i++) {
    const t = (i / count) * totalLen;
    const pt = getPointAtLength(pathData, t);
    points.push({ x: pt.x, y: pt.y });
  }
  return points;
}

/**
 * Convert an array of {x, y} points to an SVG path `d` string.
 *
 * @param {Array<{x: number, y: number}>} points
 * @returns {string} SVG path `d` string (M…L…Z)
 */
export function polygonToPath(points) {
  if (!points || points.length === 0) return '';

  const r = (n) => Math.round(n * 1000) / 1000;
  let d = `M${r(points[0].x)},${r(points[0].y)}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L${r(points[i].x)},${r(points[i].y)}`;
  }
  d += ' Z';
  return d;
}

/**
 * Apply Chaikin corner-cutting smoothing to a polygon.
 * Each iteration replaces consecutive point pairs with two new points
 * at 25% and 75% along the segment, converging toward a quadratic B-spline.
 *
 * @param {Array<{x: number, y: number}>} points - Input polygon
 * @param {number} [iterations=2] - Number of smoothing passes
 * @returns {Array<{x: number, y: number}>}
 */
export function chaikinSmooth(points, iterations = 2) {
  if (!points || points.length < 3) return points;

  let current = points;
  for (let iter = 0; iter < iterations; iter++) {
    const next = [];
    const len = current.length;
    for (let i = 0; i < len; i++) {
      const p0 = current[i];
      const p1 = current[(i + 1) % len];
      next.push(
        { x: 0.75 * p0.x + 0.25 * p1.x, y: 0.75 * p0.y + 0.25 * p1.y },
        { x: 0.25 * p0.x + 0.75 * p1.x, y: 0.25 * p0.y + 0.75 * p1.y }
      );
    }
    current = next;
  }
  return current;
}

/**
 * Signed shoelace area of a polygon.
 * @param {Array<{x: number, y: number}>} points
 * @returns {number}
 */
function signedArea(points) {
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const q = points[(i + 1) % n];
    area += p.x * q.y - q.x * p.y;
  }
  return area / 2;
}

/**
 * Build the raw offset outline of a single closed ring: each edge shifted
 * delta along its outward normal, joined by round arcs where the turn
 * opens a gap on the offset side, and by a detour through the RAW vertex
 * where the segments overlap — the detour keeps overshoot debris wound
 * negative so the Positive-fill union cleanup drops it (that is what
 * makes over-shrunk geometry collapse to nothing instead of leaving
 * pinwheel slivers).
 *
 * The ring is normalized to positive winding first so (dy, -dx) is the
 * outward normal regardless of how the source path was authored.
 *
 * @param {Array<{x: number, y: number}>} ring - Closed ring, >= 3 points
 * @param {number} delta - Offset in SVG units (positive = outset)
 * @param {number} arcTolerance - Max chord deviation on join arcs (SVG units)
 * @returns {Array<{x: number, y: number}>} Possibly self-crossing outline
 */
function buildOffsetOutline(ring, delta, arcTolerance) {
  const points = signedArea(ring) < 0 ? [...ring].reverse() : ring;
  const n = points.length;

  const dirs = [];
  const normals = [];
  const edgeIndices = [];
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) {
      dirs.push(null);
      normals.push(null);
      continue;
    }
    dirs.push({ x: dx / len, y: dy / len });
    normals.push({ x: dy / len, y: -dx / len });
    edgeIndices.push(i);
  }
  if (edgeIndices.length < 3) return [];

  // Chord length that stays within arcTolerance of a radius-|delta| arc
  const radius = Math.abs(delta);
  const chord = Math.max(
    radius * 0.05,
    2 * Math.sqrt(Math.max(2 * radius * arcTolerance, 0))
  );

  const out = [];
  for (let k = 0; k < edgeIndices.length; k++) {
    const i = edgeIndices[k];
    const iNext = edgeIndices[(k + 1) % edgeIndices.length];
    const a = points[i];
    const b = points[(i + 1) % n];
    const ni = normals[i];
    const nNext = normals[iNext];

    out.push({ x: a.x + ni.x * delta, y: a.y + ni.y * delta });
    out.push({ x: b.x + ni.x * delta, y: b.y + ni.y * delta });

    const turnCross = dirs[i].x * dirs[iNext].y - dirs[i].y * dirs[iNext].x;
    if (turnCross * delta > 1e-12) {
      const theta1 = Math.atan2(ni.y, ni.x);
      const theta2 = Math.atan2(nNext.y, nNext.x);
      let sweep = theta2 - theta1;
      while (sweep > Math.PI) sweep -= 2 * Math.PI;
      while (sweep < -Math.PI) sweep += 2 * Math.PI;
      const steps = Math.max(1, Math.ceil((Math.abs(sweep) * radius) / chord));
      for (let s = 1; s < steps; s++) {
        const theta = theta1 + (sweep * s) / steps;
        out.push({
          x: b.x + Math.cos(theta) * delta,
          y: b.y + Math.sin(theta) * delta,
        });
      }
    } else {
      out.push({ x: b.x, y: b.y });
    }
  }
  return out;
}

/**
 * Offset an SVG path by a given amount in SVG coordinate units.
 *
 * Positive offset expands (outset), negative shrinks (inset).
 * Returns the original pathData unchanged when offset is 0 or
 * when the result collapses to nothing (full collapse).
 *
 * @param {string} pathData - SVG path `d` attribute
 * @param {number} offsetSvgUnits - Offset in SVG coordinate units
 * @param {object} [options]
 * @param {number} [options.sampleCount] - Polygon sampling density (adaptive if omitted)
 * @param {number} [options.miterLimit=2] - Accepted for API compatibility;
 *   joins are always round since the D-107 rewrite, so it has no effect
 * @param {number} [options.arcTolerance=0.25] - Max chord deviation on
 *   round join arcs, in SVG units
 * @param {boolean} [options.smooth=true] - Apply Chaikin smoothing to output
 * @param {number} [options.smoothIterations=2] - Number of Chaikin passes
 * @returns {string} Offset SVG path `d` string
 */
export function offsetPath(pathData, offsetSvgUnits, options = {}) {
  if (!offsetSvgUnits || offsetSvgUnits === 0) return pathData;
  if (!pathData || typeof pathData !== 'string') return pathData;

  const {
    sampleCount,
    arcTolerance = 0.25,
    smooth = true,
    smoothIterations = 2,
  } = options;

  const points = pathToPolygon(pathData, sampleCount);
  if (points.length < 3) return pathData;

  const outline = buildOffsetOutline(points, offsetSvgUnits, arcTolerance);
  if (outline.length < 3) return pathData;

  const flatCoords = [];
  for (const pt of outline) {
    flatCoords.push(Math.round(pt.x * SCALE), Math.round(pt.y * SCALE));
  }
  const paths = new Paths64();
  paths.push(Clipper.makePath(flatCoords));

  // Positive fill keeps the correctly-wound region and drops inverted
  // overshoot loops (the port's flat booleans are correct; only its
  // ClipperOffset is broken — see the module header).
  const result = Clipper.Union(paths, undefined, FillRule.Positive);
  if (!result || result.length === 0) return pathData;

  const parts = [];
  for (const rp of result) {
    if (rp.length < 3) continue;
    let unscaled = rp.map((pt) => ({
      x: Number(pt.x) / SCALE,
      y: Number(pt.y) / SCALE,
    }));
    if (smooth) {
      unscaled = chaikinSmooth(unscaled, smoothIterations);
    }
    const d = polygonToPath(unscaled);
    if (d) parts.push(d);
  }

  return parts.length > 0 ? parts.join(' ') : pathData;
}

/**
 * Convert a millimeter offset value to SVG coordinate units.
 *
 * @param {number} mm - Offset in millimeters
 * @param {number} viewBoxWidth - SVG viewBox width (SVG units)
 * @param {number} designWidthMm - Physical design width (mm)
 * @returns {number} Offset in SVG coordinate units
 */
export function mmToSvgUnits(mm, viewBoxWidth, designWidthMm) {
  if (!designWidthMm || designWidthMm <= 0) return 0;
  if (!viewBoxWidth || viewBoxWidth <= 0) return 0;
  return (mm * viewBoxWidth) / designWidthMm;
}
