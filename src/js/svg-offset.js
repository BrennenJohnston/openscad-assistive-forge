/**
 * SVG Path Offset Bridge Module
 *
 * Wraps clipper2-js to provide polygon offset for SVG path strings.
 * Converts SVG paths to/from Clipper integer polygons for inflate/deflate.
 *
 * @license GPL-3.0-or-later
 */

import { getPointAtLength, getTotalLength } from 'svg-path-commander';
import { Clipper, ClipperOffset, Paths64, JoinType, EndType } from 'clipper2-js';

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
        { x: 0.25 * p0.x + 0.75 * p1.x, y: 0.25 * p0.y + 0.75 * p1.y },
      );
    }
    current = next;
  }
  return current;
}

/**
 * Offset an SVG path by a given amount in SVG coordinate units.
 *
 * Positive offset expands (outset), negative shrinks (inset).
 * Returns the original pathData unchanged when offset is 0 or
 * when Clipper produces an empty result (full collapse).
 *
 * @param {string} pathData - SVG path `d` attribute
 * @param {number} offsetSvgUnits - Offset in SVG coordinate units
 * @param {object} [options]
 * @param {number} [options.sampleCount] - Polygon sampling density (adaptive if omitted)
 * @param {number} [options.miterLimit=2] - Miter limit for offset corners
 * @param {number} [options.arcTolerance=0.25] - Arc tolerance in SVG units for round joins
 * @param {boolean} [options.smooth=true] - Apply Chaikin smoothing to output
 * @param {number} [options.smoothIterations=2] - Number of Chaikin passes
 * @returns {string} Offset SVG path `d` string
 */
export function offsetPath(pathData, offsetSvgUnits, options = {}) {
  if (!offsetSvgUnits || offsetSvgUnits === 0) return pathData;
  if (!pathData || typeof pathData !== 'string') return pathData;

  const {
    sampleCount,
    miterLimit = 2,
    arcTolerance = 0.25,
    smooth = true,
    smoothIterations = 2,
  } = options;

  const points = pathToPolygon(pathData, sampleCount);
  if (points.length < 3) return pathData;

  const flatCoords = [];
  for (const pt of points) {
    flatCoords.push(Math.round(pt.x * SCALE), Math.round(pt.y * SCALE));
  }
  const scaledPath = Clipper.makePath(flatCoords);

  const paths = new Paths64();
  paths.push(scaledPath);

  const co = new ClipperOffset(miterLimit, arcTolerance * SCALE);
  co.addPaths(paths, JoinType.Round, EndType.Polygon);
  const result = new Paths64();
  co.execute(offsetSvgUnits * SCALE, result);

  if (!result || result.length === 0) return pathData;

  const parts = [];
  for (const rp of result) {
    if (rp.length === 0) continue;
    let unscaled = rp.map((pt) => ({ x: pt.x / SCALE, y: pt.y / SCALE }));
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
