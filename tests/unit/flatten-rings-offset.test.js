/**
 * The compound road's combine when a row carries an offset (DP-82, D-174).
 *
 * A traced drawing is one path whose rings are the editor's rows. With no
 * offset the rows are concatenated back into one even-odd path; with one,
 * `flattenCompoundRings` reads the rows as one drawing by the parity of the
 * rows kept, offsets each ring with its own sign, and folds the regions.
 *
 * @license GPL-3.0-or-later
 */
import { describe, it, expect } from 'vitest';
import * as engine from '../../src/js/ring-geometry.js';
import {
  flattenCompoundRings,
  flattenWithRings,
  offsetDrawing,
} from '../../src/js/flatten-rings.js';

const sq = (a, b) => `M${a},${a} L${b},${a} L${b},${b} L${a},${b} Z`;
const META = { viewBox: '0 0 100 100' };
const U = (0.3 * 100) / 14; // 0.3 mm on a 100-unit page at 14 mm

const dOf = (svg) => /d="([^"]+)"/.exec(svg)[1];
const inkArea = (svg) =>
  engine.regionArea(engine.evenOddUnion(engine.ringsFromPathData(dOf(svg))));
const widthsOf = (svg) =>
  engine
    .ringsFromPathData(dOf(svg))
    .map((r) => {
      const xs = r.map((p) => p.x);
      return Math.max(...xs) - Math.min(...xs);
    })
    .sort((a, b) => b - a);

describe('flattenCompoundRings (DP-82)', () => {
  it('★ keeps a detail drawn inside a loop, which the plain fold of rows loses', () => {
    // Four nested squares as rows: the even-odd ink is the outer band plus
    // the island's band, 3,600 + 1,200. Handed to flattenWithRings one per
    // element, the island is unioned into the outer and cut away with the
    // hole: 3,600 (MEASURED, dp82-nesting-probe). That is why an offset
    // compound drawing has a combine of its own.
    const rows = [sq(0, 100), sq(10, 90), sq(30, 70), sq(40, 60)].map(
      (d, i) => ({ pathData: d, role: i % 2 ? 'hole' : 'foreground' })
    );
    expect(inkArea(flattenCompoundRings(engine, rows, META))).toBeCloseTo(
      4800,
      0
    );
    expect(inkArea(flattenWithRings(engine, rows, META))).toBeCloseTo(3600, 0);
  });

  it('★ D-174: +0.3 mm on both rows of a square line thickens it by twice that', () => {
    const rows = [sq(0, 100), sq(10, 90)].map((d, i) => ({
      pathData: d,
      role: i ? 'hole' : 'foreground',
      offset: U,
    }));
    const [outer, inner] = widthsOf(flattenCompoundRings(engine, rows, META));
    expect(Math.abs(outer - 104.29)).toBeLessThan(0.15);
    expect(Math.abs(inner - 75.71)).toBeLessThan(0.15);
    expect(Math.abs((outer - inner) / 2 - 14.29)).toBeLessThan(0.15);
  });

  it('★ -0.3 mm on both rows thins it: the outer ring in, the hole ring out', () => {
    const rows = [sq(0, 100), sq(10, 90)].map((d, i) => ({
      pathData: d,
      role: i ? 'hole' : 'foreground',
      offset: -U,
    }));
    const [outer, inner] = widthsOf(flattenCompoundRings(engine, rows, META));
    expect(Math.abs(outer - 95.71)).toBeLessThan(0.15);
    expect(Math.abs(inner - 84.29)).toBeLessThan(0.15);
  });

  it('an offset on one row alone moves that ring only', () => {
    const rows = [
      { pathData: sq(0, 100), role: 'foreground', offset: U },
      { pathData: sq(10, 90), role: 'hole' },
    ];
    const [outer, inner] = widthsOf(flattenCompoundRings(engine, rows, META));
    expect(Math.abs(outer - 104.29)).toBeLessThan(0.15);
    expect(Math.abs(inner - 80)).toBeLessThan(0.15);
  });

  it('★ two rings grown into each other MERGE, where the even-odd concatenation inverted the overlap', () => {
    // Two 40-unit squares 10 apart, each +10: as squares the union would be
    // 110 x 60 = 6,600 and the even-odd fill 6,000 (the overlap counted
    // twice and emptied). Rounded corners cost a little, never a hole.
    const rows = [
      { pathData: sq(0, 40), role: 'foreground', offset: 10 },
      { pathData: 'M50,0 L90,0 L90,40 L50,40 Z', role: 'foreground', offset: 10 },
    ];
    const svg = flattenCompoundRings(engine, rows, META);
    expect(inkArea(svg)).toBeGreaterThan(6400);
    expect(engine.ringsFromPathData(dOf(svg))).toHaveLength(1);
  });

  it('a hole shrunk to nothing is closed', () => {
    const rows = [
      { pathData: sq(0, 100), role: 'foreground' },
      { pathData: sq(10, 90), role: 'hole', offset: 45 },
    ];
    const svg = flattenCompoundRings(engine, rows, META);
    expect(engine.ringsFromPathData(dOf(svg))).toHaveLength(1);
    expect(inkArea(svg)).toBeCloseTo(10000, 0);
  });

  it('a shape shrunk to nothing is gone, and nothing left is null', () => {
    const rows = [{ pathData: sq(40, 60), role: 'foreground', offset: -30 }];
    expect(flattenCompoundRings(engine, rows, META)).toBeNull();
    expect(flattenCompoundRings(engine, [], META)).toBeNull();
    expect(
      flattenCompoundRings(engine, [{ pathData: sq(0, 10), role: 'ignore' }], META)
    ).toBeNull();
  });

  it('★ the parity is of the rows KEPT: with the outer row Off, the inner ring is solid, as the concatenation drew it', () => {
    const rows = [
      { pathData: sq(0, 100), role: 'ignore' },
      { pathData: sq(10, 90), role: 'hole', offset: U },
    ];
    const svg = flattenCompoundRings(engine, rows, META);
    const rings = engine.ringsFromPathData(dOf(svg));
    expect(rings).toHaveLength(1);
    expect(Math.abs(widthsOf(svg)[0] - 84.29)).toBeLessThan(0.15);
  });

  it('On and Cut out are labels here, as they were in the concatenation', () => {
    const asLabelled = [sq(0, 100), sq(10, 90)].map((d, i) => ({
      pathData: d,
      role: i ? 'hole' : 'foreground',
      offset: U,
    }));
    const allOn = asLabelled.map((el) => ({ ...el, role: 'foreground' }));
    expect(flattenCompoundRings(engine, allOn, META)).toBe(
      flattenCompoundRings(engine, asLabelled, META)
    );
  });

  it('a row that cannot be read is appended as it was and counted', () => {
    const warnings = [];
    const rows = [
      { pathData: sq(0, 100), role: 'foreground', offset: U },
      { pathData: 'not a path', role: 'foreground' },
    ];
    const svg = flattenCompoundRings(engine, rows, META, warnings);
    expect(svg).toContain('fill-rule="nonzero"');
    expect(svg).toContain('<path d="not a path" fill="black" fill-rule="evenodd"/>');
    expect(warnings).toEqual([
      '1 shape(s) could not be merged and were appended as-is',
    ]);
  });

  it('writes the meta the ring road writes', () => {
    const svg = flattenCompoundRings(
      engine,
      [{ pathData: sq(0, 100), role: 'foreground', offset: 1 }],
      { viewBox: '0 0 100 100', width: '100', height: '100' }
    );
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">')).toBe(true);
  });
});

describe('offsetDrawing (DP-82)', () => {
  it('reads rings as one drawing and signs each offset by its parity', () => {
    const rings = [sq(0, 100), sq(10, 90)].map(
      (d) => engine.ringsFromPathData(d)[0]
    );
    const region = offsetDrawing(engine, rings, () => U);
    const widths = region
      .map((r) => {
        const xs = r.map((p) => p.x);
        return Math.max(...xs) - Math.min(...xs);
      })
      .sort((a, b) => b - a);
    expect(Math.abs(widths[0] - 104.29)).toBeLessThan(0.15);
    expect(Math.abs(widths[1] - 75.71)).toBeLessThan(0.15);
    // Clipper's convention: the solid positive, the hole negative.
    expect(engine.areaOf(region[0]) * engine.areaOf(region[1])).toBeLessThan(0);
  });

  it('leaves unoffset rings as drawn and returns [] for nothing', () => {
    const rings = [engine.ringsFromPathData(sq(10, 90))[0]];
    const region = offsetDrawing(engine, rings, () => 0);
    expect(region).toHaveLength(1);
    expect(Math.abs(engine.areaOf(region[0]) - 6400)).toBeLessThan(1);
    expect(offsetDrawing(engine, [], () => 1)).toEqual([]);
  });
});
