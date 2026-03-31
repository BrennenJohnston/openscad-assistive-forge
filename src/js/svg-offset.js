/**
 * SVG Path Offset Bridge Module
 *
 * Wraps clipper2-js to provide polygon offset for SVG path strings.
 * Converts SVG paths to/from Clipper integer polygons for inflate/deflate.
 *
 * @license GPL-3.0-or-later
 */

import { getPointAtLength, getTotalLength } from 'svg-path-commander';
import { Clipper, Paths64, JoinType, EndType } from 'clipper2-js';

const SCALE = 1000;

/**
 * Sample an SVG path `d` string to an array of {x, y} points.
 *
 * @param {string} pathData - SVG path `d` attribute
 * @param {number} [sampleCount=128] - Number of evenly-spaced sample points
 * @returns {Array<{x: number, y: number}>}
 */
export function pathToPolygon(pathData, sampleCount = 128) {
  if (!pathData || typeof pathData !== 'string') return [];

  const totalLen = getTotalLength(pathData);
  if (totalLen === 0) return [];

  const points = [];
  for (let i = 0; i < sampleCount; i++) {
    const t = (i / sampleCount) * totalLen;
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
 * Offset an SVG path by a given amount in SVG coordinate units.
 *
 * Positive offset expands (outset), negative shrinks (inset).
 * Returns the original pathData unchanged when offset is 0 or
 * when Clipper produces an empty result (full collapse).
 *
 * @param {string} pathData - SVG path `d` attribute
 * @param {number} offsetSvgUnits - Offset in SVG coordinate units
 * @param {object} [options]
 * @param {number} [options.sampleCount=128] - Polygon sampling density
 * @param {number} [options.miterLimit=2] - Miter limit for offset corners
 * @returns {string} Offset SVG path `d` string
 */
export function offsetPath(pathData, offsetSvgUnits, options = {}) {
  if (!offsetSvgUnits || offsetSvgUnits === 0) return pathData;
  if (!pathData || typeof pathData !== 'string') return pathData;

  const { sampleCount = 128, miterLimit = 2 } = options;

  const points = pathToPolygon(pathData, sampleCount);
  if (points.length < 3) return pathData;

  const flatCoords = [];
  for (const pt of points) {
    flatCoords.push(Math.round(pt.x * SCALE), Math.round(pt.y * SCALE));
  }
  const scaledPath = Clipper.makePath(flatCoords);

  const paths = new Paths64();
  paths.push(scaledPath);

  const result = Clipper.InflatePaths(
    paths,
    offsetSvgUnits * SCALE,
    JoinType.Round,
    EndType.Polygon,
    miterLimit,
  );

  if (!result || result.length === 0) return pathData;

  const parts = [];
  for (const rp of result) {
    if (rp.length === 0) continue;
    const unscaled = rp.map((pt) => ({ x: pt.x / SCALE, y: pt.y / SCALE }));
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
