/**
 * SVG Offset Bridge Module — Unit tests
 *
 * Tests for pathToPolygon, polygonToPath, offsetPath, and mmToSvgUnits.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';
import {
  pathToPolygon,
  polygonToPath,
  offsetPath,
  mmToSvgUnits,
  adaptiveSampleCount,
  chaikinSmooth,
} from '../../src/js/svg-offset.js';

const SQUARE_PATH = 'M10,10 L90,10 L90,90 L10,90 Z';

function pointsBBox(points) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

// ---------------------------------------------------------------------------
// pathToPolygon
// ---------------------------------------------------------------------------

describe('pathToPolygon', () => {
  it('returns an array of {x, y} points for a valid path', () => {
    const points = pathToPolygon(SQUARE_PATH);
    expect(Array.isArray(points)).toBe(true);
    expect(points.length).toBeGreaterThan(0);
    for (const pt of points) {
      expect(pt).toHaveProperty('x');
      expect(pt).toHaveProperty('y');
      expect(typeof pt.x).toBe('number');
      expect(typeof pt.y).toBe('number');
    }
  });

  it('returns the requested number of sample points', () => {
    const points = pathToPolygon(SQUARE_PATH, 64);
    expect(points).toHaveLength(64);
  });

  it('defaults to adaptive sample count when no count provided', () => {
    const points = pathToPolygon(SQUARE_PATH);
    expect(points.length).toBeGreaterThanOrEqual(256);
    expect(points.length).toBeLessThanOrEqual(2048);
  });

  it('sample points lie within the path bounding box', () => {
    const points = pathToPolygon(SQUARE_PATH);
    const bbox = pointsBBox(points);
    expect(bbox.minX).toBeGreaterThanOrEqual(9);
    expect(bbox.maxX).toBeLessThanOrEqual(91);
    expect(bbox.minY).toBeGreaterThanOrEqual(9);
    expect(bbox.maxY).toBeLessThanOrEqual(91);
  });

  it('returns empty array for empty string', () => {
    expect(pathToPolygon('')).toEqual([]);
  });

  it('returns empty array for null input', () => {
    expect(pathToPolygon(null)).toEqual([]);
  });

  it('returns empty array for undefined input', () => {
    expect(pathToPolygon(undefined)).toEqual([]);
  });

  it('returns empty array for non-string input', () => {
    expect(pathToPolygon(42)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// polygonToPath
// ---------------------------------------------------------------------------

describe('polygonToPath', () => {
  it('converts points to a path string starting with M and ending with Z', () => {
    const points = [
      { x: 10, y: 20 },
      { x: 30, y: 40 },
      { x: 50, y: 60 },
    ];
    const d = polygonToPath(points);
    expect(d).toMatch(/^M/);
    expect(d).toMatch(/Z$/);
  });

  it('includes all points as L commands after the initial M', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const d = polygonToPath(points);
    expect(d).toContain('M0,0');
    expect(d).toContain('L10,0');
    expect(d).toContain('L10,10');
    expect(d).toContain('L0,10');
    expect(d).toContain('Z');
  });

  it('returns empty string for empty array', () => {
    expect(polygonToPath([])).toBe('');
  });

  it('returns empty string for null input', () => {
    expect(polygonToPath(null)).toBe('');
  });

  it('returns empty string for undefined input', () => {
    expect(polygonToPath(undefined)).toBe('');
  });

  it('rounds coordinates to 3 decimal places', () => {
    const points = [
      { x: 1.23456789, y: 2.34567891 },
      { x: 3.45678912, y: 4.56789123 },
    ];
    const d = polygonToPath(points);
    expect(d).toContain('M1.235,2.346');
    expect(d).toContain('L3.457,4.568');
  });

  it('handles a single point (degenerate polygon)', () => {
    const d = polygonToPath([{ x: 5, y: 10 }]);
    expect(d).toBe('M5,10 Z');
  });

  it('roundtrips through pathToPolygon for a simple closed shape', () => {
    const triangle = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 50, y: 87 },
    ];
    const d = polygonToPath(triangle);
    const resampled = pathToPolygon(d, 64);
    const bbox = pointsBBox(resampled);
    expect(bbox.minX).toBeLessThan(5);
    expect(bbox.maxX).toBeGreaterThan(95);
    expect(bbox.minY).toBeLessThan(5);
    expect(bbox.maxY).toBeGreaterThan(80);
  });
});

// ---------------------------------------------------------------------------
// offsetPath
// ---------------------------------------------------------------------------

describe('offsetPath', () => {
  it('positive offset produces a path with larger bounding box', () => {
    const origPoints = pathToPolygon(SQUARE_PATH, 64);
    const origBBox = pointsBBox(origPoints);

    const expanded = offsetPath(SQUARE_PATH, 5);
    expect(expanded).not.toBe(SQUARE_PATH);

    const resultPoints = pathToPolygon(expanded, 64);
    expect(resultPoints.length).toBeGreaterThan(0);
    const bbox = pointsBBox(resultPoints);

    expect(bbox.minX).toBeLessThan(origBBox.minX);
    expect(bbox.maxX).toBeGreaterThan(origBBox.maxX);
    expect(bbox.minY).toBeLessThan(origBBox.minY);
    expect(bbox.maxY).toBeGreaterThan(origBBox.maxY);
  });

  it('negative offset produces a path with smaller bounding box', () => {
    const origPoints = pathToPolygon(SQUARE_PATH, 64);
    const origBBox = pointsBBox(origPoints);

    const shrunk = offsetPath(SQUARE_PATH, -5);
    expect(shrunk).not.toBe(SQUARE_PATH);

    const resultPoints = pathToPolygon(shrunk, 64);
    expect(resultPoints.length).toBeGreaterThan(0);
    const bbox = pointsBBox(resultPoints);

    expect(bbox.minX).toBeGreaterThan(origBBox.minX);
    expect(bbox.maxX).toBeLessThan(origBBox.maxX);
    expect(bbox.minY).toBeGreaterThan(origBBox.minY);
    expect(bbox.maxY).toBeLessThan(origBBox.maxY);
  });

  it('zero offset returns original pathData unchanged', () => {
    expect(offsetPath(SQUARE_PATH, 0)).toBe(SQUARE_PATH);
  });

  it('null offset returns original pathData unchanged', () => {
    expect(offsetPath(SQUARE_PATH, null)).toBe(SQUARE_PATH);
  });

  it('undefined offset returns original pathData unchanged', () => {
    expect(offsetPath(SQUARE_PATH, undefined)).toBe(SQUARE_PATH);
  });

  it('returns original pathData for empty string input', () => {
    expect(offsetPath('', 5)).toBe('');
  });

  it('returns original pathData for null path input', () => {
    expect(offsetPath(null, 5)).toBe(null);
  });

  it('collapse case: extreme negative offset returns original pathData', () => {
    const result = offsetPath(SQUARE_PATH, -100);
    expect(result).toBe(SQUARE_PATH);
  });

  it('returned path is a valid SVG path string', () => {
    const expanded = offsetPath(SQUARE_PATH, 3);
    expect(expanded).toMatch(/^M/);
    expect(expanded).toContain('Z');
    expect(expanded).not.toContain('NaN');
    expect(expanded).not.toContain('undefined');
    expect(expanded).not.toContain('Infinity');
  });

  it('respects custom sampleCount option', () => {
    const result = offsetPath(SQUARE_PATH, 5, { sampleCount: 32 });
    expect(result).not.toBe(SQUARE_PATH);
    expect(result).toMatch(/^M/);
  });
});

// ---------------------------------------------------------------------------
// mmToSvgUnits
// ---------------------------------------------------------------------------

describe('mmToSvgUnits', () => {
  it('correctly converts mm to SVG units', () => {
    const result = mmToSvgUnits(1, 100, 14);
    expect(result).toBeCloseTo(100 / 14, 3);
  });

  it('scales linearly with mm value', () => {
    const single = mmToSvgUnits(1, 100, 14);
    const double = mmToSvgUnits(2, 100, 14);
    expect(double).toBeCloseTo(single * 2, 3);
  });

  it('returns 0 for zero designWidthMm', () => {
    expect(mmToSvgUnits(1, 100, 0)).toBe(0);
  });

  it('returns 0 for negative designWidthMm', () => {
    expect(mmToSvgUnits(1, 100, -5)).toBe(0);
  });

  it('returns 0 for zero viewBoxWidth', () => {
    expect(mmToSvgUnits(1, 0, 14)).toBe(0);
  });

  it('returns 0 for negative viewBoxWidth', () => {
    expect(mmToSvgUnits(1, -50, 14)).toBe(0);
  });

  it('returns 0 for zero mm input', () => {
    expect(mmToSvgUnits(0, 100, 14)).toBe(0);
  });

  it('handles negative mm values (inset)', () => {
    const result = mmToSvgUnits(-0.5, 100, 14);
    expect(result).toBeLessThan(0);
    expect(result).toBeCloseTo((-0.5 * 100) / 14, 3);
  });
});

// ---------------------------------------------------------------------------
// adaptiveSampleCount
// ---------------------------------------------------------------------------

describe('adaptiveSampleCount', () => {
  it('returns at least 256 for short paths', () => {
    expect(adaptiveSampleCount(10)).toBe(256);
    expect(adaptiveSampleCount(100)).toBe(256);
  });

  it('scales with path length', () => {
    expect(adaptiveSampleCount(500)).toBe(1000);
    expect(adaptiveSampleCount(300)).toBe(600);
  });

  it('caps at 2048 for very long paths', () => {
    expect(adaptiveSampleCount(5000)).toBe(2048);
    expect(adaptiveSampleCount(10000)).toBe(2048);
  });

  it('returns 256 for zero length', () => {
    expect(adaptiveSampleCount(0)).toBe(256);
  });
});

// ---------------------------------------------------------------------------
// chaikinSmooth
// ---------------------------------------------------------------------------

describe('chaikinSmooth', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];

  it('increases point count (each iteration roughly doubles)', () => {
    const smoothed = chaikinSmooth(square, 1);
    expect(smoothed.length).toBe(square.length * 2);
  });

  it('multiple iterations increase point count further', () => {
    const s1 = chaikinSmooth(square, 1);
    const s2 = chaikinSmooth(square, 2);
    expect(s2.length).toBeGreaterThan(s1.length);
  });

  it('output points lie within the convex hull of input', () => {
    const smoothed = chaikinSmooth(square, 2);
    for (const pt of smoothed) {
      expect(pt.x).toBeGreaterThanOrEqual(-0.01);
      expect(pt.x).toBeLessThanOrEqual(10.01);
      expect(pt.y).toBeGreaterThanOrEqual(-0.01);
      expect(pt.y).toBeLessThanOrEqual(10.01);
    }
  });

  it('returns input unchanged for fewer than 3 points', () => {
    const two = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
    expect(chaikinSmooth(two, 2)).toBe(two);
  });

  it('returns input unchanged for null input', () => {
    expect(chaikinSmooth(null, 2)).toBeNull();
  });

  it('zero iterations returns the original points', () => {
    const result = chaikinSmooth(square, 0);
    expect(result).toBe(square);
  });
});

// ---------------------------------------------------------------------------
// offsetPath — smoothing options
// ---------------------------------------------------------------------------

describe('offsetPath smoothing', () => {
  it('smooth=false produces output with fewer points than smooth=true', () => {
    const unsmoothed = offsetPath(SQUARE_PATH, 5, { smooth: false, sampleCount: 64 });
    const smoothed = offsetPath(SQUARE_PATH, 5, { smooth: true, sampleCount: 64 });

    const countLs = (d) => (d.match(/L/g) || []).length;
    expect(countLs(smoothed)).toBeGreaterThan(countLs(unsmoothed));
  });

  it('accepts custom smoothIterations', () => {
    const s1 = offsetPath(SQUARE_PATH, 5, { smooth: true, smoothIterations: 1, sampleCount: 64 });
    const s3 = offsetPath(SQUARE_PATH, 5, { smooth: true, smoothIterations: 3, sampleCount: 64 });

    const countLs = (d) => (d.match(/L/g) || []).length;
    expect(countLs(s3)).toBeGreaterThan(countLs(s1));
  });

  it('smooth=true is the default behavior', () => {
    const defaultResult = offsetPath(SQUARE_PATH, 5, { sampleCount: 64 });
    const explicitSmooth = offsetPath(SQUARE_PATH, 5, { smooth: true, sampleCount: 64 });

    const countLs = (d) => (d.match(/L/g) || []).length;
    expect(countLs(defaultResult)).toBe(countLs(explicitSmooth));
  });
});
