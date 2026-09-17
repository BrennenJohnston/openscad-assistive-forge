/**
 * A shape's own thickness, at the printed size and in the picture (DP-54 P1).
 *
 * The measure is DP-36's ridge (a distance transform's local maxima, twice
 * the distance being the width there) taken over ONE shape's rings, raster-
 * ized into a small mask: at 0.025 mm per cell at the design width, and at
 * one cell per picture unit for the picture floor. P0 MEASURED the logo's
 * 206 shapes in about 50 ms this way, and 1,200 rects in 80 ms, so no
 * cheaper stand-in is needed (2A/P was the fallback; it halves a blob's
 * diameter, which the ridge does not).
 * @license GPL-3.0-or-later
 */
import { describe, it, expect } from 'vitest';
import {
  rasterizeRings,
  ridgeWidth,
  measureShapeThickness,
  measureAllThickness,
  THIN_PRINT_MM,
  THIN_PICTURE_PX,
} from '../../src/js/shape-thickness.js';

const rect = (x, y, w, h) => `M${x},${y}h${w}v${h}h${-w}z`;
/** A square ring: an outer square with a square counter, stroke `t`. */
const ring = (x, y, size, t) =>
  `M${x},${y}h${size}v${size}h${-size}z M${x + t},${y + t}v${size - 2 * t}h${size - 2 * t}v${-(size - 2 * t)}z`;
const disc = (cx, cy, r) =>
  `M${cx - r},${cy} a${r},${r} 0 1,0 ${2 * r},0 a${r},${r} 0 1,0 ${-2 * r},0 z`;

describe('rasterizeRings', () => {
  it('fills a rectangle even-odd, one cell per unit', () => {
    const rings = [
      [
        { x: 1, y: 1 },
        { x: 5, y: 1 },
        { x: 5, y: 3 },
        { x: 1, y: 3 },
      ],
    ];
    const mask = rasterizeRings(rings, 7, 5);
    let ink = 0;
    for (const v of mask) ink += v;
    expect(ink).toBe(4 * 2);
  });
});

describe('ridgeWidth on a shape of its own', () => {
  it('a stroke: its width', () => {
    const w = ridgeWidth(rect(0, 0, 100, 10), 1);
    expect(w).toBeGreaterThanOrEqual(9);
    expect(w).toBeLessThanOrEqual(11);
  });

  it('a disc: about its diameter', () => {
    const w = ridgeWidth(disc(50, 50, 20), 1);
    expect(w).toBeGreaterThanOrEqual(34);
    expect(w).toBeLessThanOrEqual(42);
  });

  it('a letter with a counter: the stroke, not the letter', () => {
    const w = ridgeWidth(ring(0, 0, 100, 12), 1);
    expect(w).toBeGreaterThanOrEqual(10);
    expect(w).toBeLessThanOrEqual(14);
  });

  it('a sliver thinner than a cell: zero, which is under any floor', () => {
    expect(ridgeWidth(rect(0, 0, 100, 0.4), 1)).toBe(0);
  });

  it('measures at the cell size asked for', () => {
    // A 10-unit stroke at 0.5 units per cell is 20 cells wide, 10 units.
    const w = ridgeWidth(rect(0, 0, 100, 10), 0.5);
    expect(w).toBeGreaterThanOrEqual(9);
    expect(w).toBeLessThanOrEqual(11);
  });
});

describe('measureShapeThickness', () => {
  it('★ names both measures: mm at the design width, px in the picture, and what each floor says', () => {
    // A 600-unit picture printed 12 mm wide: 50 units per mm. A stroke 10
    // units wide is 0.2 mm and 10 px: too thin to print, wide enough to trace.
    const m = measureShapeThickness(rect(0, 0, 100, 10), {
      viewBoxWidth: 600,
      designWidthMm: 12,
    });
    expect(m.measure).toBe('ridge');
    expect(m.printedMm).toBeGreaterThan(0.17);
    expect(m.printedMm).toBeLessThan(0.23);
    expect(m.picturePx).toBeGreaterThanOrEqual(9);
    expect(m.picturePx).toBeLessThanOrEqual(11);
    expect(m.tooThinToPrint).toBe(true);
    expect(m.tooSmallToTrace).toBe(false);
  });

  it('a 2 px speck is too small to trace, whatever the width', () => {
    const m = measureShapeThickness(rect(0, 0, 2, 2), {
      viewBoxWidth: 600,
      designWidthMm: 200,
    });
    expect(m.tooSmallToTrace).toBe(true);
    expect(m.picturePx).toBeLessThan(THIN_PICTURE_PX);
  });

  it('a thick stroke on a wide design passes both floors', () => {
    const m = measureShapeThickness(rect(0, 0, 300, 60), {
      viewBoxWidth: 600,
      designWidthMm: 12,
    });
    expect(m.printedMm).toBeGreaterThan(THIN_PRINT_MM);
    expect(m.tooThinToPrint).toBe(false);
    expect(m.tooSmallToTrace).toBe(false);
  });

  it('the floors can be moved by the caller', () => {
    const m = measureShapeThickness(rect(0, 0, 100, 10), {
      viewBoxWidth: 600,
      designWidthMm: 12,
      thinPrintMm: 0.1,
      thinPicturePx: 20,
    });
    expect(m.tooThinToPrint).toBe(false);
    expect(m.tooSmallToTrace).toBe(true);
  });

  it('no rings means no measure and no flag', () => {
    const m = measureShapeThickness('', { viewBoxWidth: 600, designWidthMm: 12 });
    expect(m.measure).toBe('none');
    expect(m.tooThinToPrint).toBe(false);
    expect(m.tooSmallToTrace).toBe(false);
  });
});

describe('measureAllThickness', () => {
  it('measures every path in order and counts the flags, in a bounded time', () => {
    const paths = [];
    for (let i = 0; i < 300; i++) paths.push(rect((i % 20) * 30, Math.floor(i / 20) * 30, 20, i % 2 ? 2 : 12));
    const t0 = performance.now();
    const all = measureAllThickness(paths, { viewBoxWidth: 600, designWidthMm: 12 });
    const ms = performance.now() - t0;
    expect(all.shapes).toHaveLength(300);
    expect(all.tooThinToPrint).toBe(300);
    expect(all.tooSmallToTrace).toBe(150);
    expect(ms).toBeLessThan(2000);
  });
});
