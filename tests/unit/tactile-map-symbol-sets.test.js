/**
 * Symbol sets: the basic shapes and the University of Oregon's published
 * set, one chosen by key, each class getting its shape under the key the
 * class asks for.
 *
 * What is pinned: the fourteen Oregon point symbols, named and sourced;
 * every symbol passing the library's checks at its own size (6 mm or more
 * across, no part under 1.0 mm); the 13 mm parts kept 13 mm; every point
 * class mapped to the set or to the basic shape; a set's line styles drawn
 * by the levels builder from the class's own row.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { OREGON_2012 } from '../../src/js/tactile-map/symbol-sets/oregon-2012.js';
import {
  BUILT_IN_SETS,
  BUILT_IN_SYMBOLS,
  SYMBOL_MIN_FEATURE_MM,
  SYMBOL_MIN_SIZE_MM,
  activeLibrary,
  activeSet,
  activeSetKey,
  librarySymbolsFor,
  setActiveSet,
  setLibrary,
  thinnestFeatureMm,
} from '../../src/js/tactile-map/symbol-library.js';
import { MAP_CLASSES } from '../../src/js/tactile-map/map-classes.js';
import {
  buildLevelRings,
  settingsForSet,
} from '../../src/js/tactile-map/levels-svg.js';
import { ringsFromPathData } from '../../src/js/ring-geometry.js';
import {
  sheetLayout,
  symbolSheetData,
} from '../../src/js/tactile-map/symbol-sheet.js';

const extent = (pathData) => {
  const pts = ringsFromPathData(pathData).flat();
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
};

afterEach(() => {
  setLibrary(null);
  setActiveSet('forge-basic');
});

describe('the University of Oregon set', () => {
  it('carries the fourteen point symbols, each named, with its meaning and a source naming the paper and the models', () => {
    expect(OREGON_2012.symbols.map((s) => s.key)).toEqual([
      'challenging-feature',
      'flexible-feature',
      'elevation-change',
      'vegetation',
      'intersection',
      'intersection-across',
      'intersection-along',
      'intersection-both',
      'entrance',
      'entrance-up',
      'entrance-down',
      'passageway',
      'overpass',
      'underpass',
    ]);
    for (const s of OREGON_2012.symbols) {
      expect(s.name).toBeTruthy();
      expect(s.meaning).toMatch(/\S/);
      expect(s.source).toContain('Lobben and Lawrence 2012');
      expect(s.source).toContain('University of Oregon, GPL-3');
    }
    expect(OREGON_2012.credit).toBe(
      'Symbols: Lobben and Lawrence 2012, University of Oregon, GPL-3'
    );
  });

  it("passes the library's checks at each symbol's own size: 6 mm or more across, no part thinner than 1.0 mm", () => {
    for (const s of OREGON_2012.symbols) {
      const [w, h] = extent(s.pathData);
      expect(Math.min(w, h) * s.minSizeMm).toBeGreaterThanOrEqual(
        SYMBOL_MIN_SIZE_MM
      );
      expect(
        thinnestFeatureMm(s.pathData, s.minSizeMm),
        `${s.name} at ${s.minSizeMm} mm`
      ).toBeGreaterThanOrEqual(SYMBOL_MIN_FEATURE_MM);
    }
  });

  it('keeps the published 13 mm: a single symbol 13 mm across, the triangle 15 mm wide and 13 tall, a two-part symbol wide enough for its 13 mm parts', () => {
    const size = (key) =>
      OREGON_2012.symbols.find((s) => s.key === key).minSizeMm;
    for (const key of [
      'challenging-feature',
      'flexible-feature',
      'vegetation',
      'intersection',
      'intersection-both',
      'entrance',
    ]) {
      expect(size(key)).toBe(13);
    }
    expect(size('elevation-change')).toBeCloseTo(15.01, 2);
    for (const key of [
      'entrance-up',
      'entrance-down',
      'overpass',
      'underpass',
    ]) {
      expect(size(key)).toBeGreaterThan(29);
    }
    expect(OREGON_2012.symbolSizeMm).toBe(13);
    expect([OREGON_2012.lineMm, OREGON_2012.publishedLineMm]).toEqual([
      1.2, 0.8,
    ]);
  });

  it('maps every point class, and crossing points, to a symbol of the set or to the basic shape', () => {
    const points = MAP_CLASSES.filter((c) => c.kind === 'point').map(
      (c) => c.key
    );
    expect(Object.keys(OREGON_2012.classSymbols).sort()).toEqual(
      [...points, 'crossing'].sort()
    );
    const keys = new Set(OREGON_2012.symbols.map((s) => s.key));
    for (const value of Object.values(OREGON_2012.classSymbols)) {
      if (value !== null) expect(keys.has(value)).toBe(true);
    }
    expect(OREGON_2012.classSymbols['you-are-here']).toBeNull();
  });
});

describe('symbol sets in the library', () => {
  it('lists the basic shapes first, then the Oregon set', () => {
    expect(BUILT_IN_SETS.map((s) => [s.key, s.name])).toEqual([
      ['forge-basic', 'Forge basic shapes'],
      ['oregon-2012', 'University of Oregon symbols'],
    ]);
    expect(BUILT_IN_SETS[0].symbols).toBe(BUILT_IN_SYMBOLS);
    expect(BUILT_IN_SETS[0].symbolSizeMm).toBe(10);
  });

  it("gives each class the set's shape under the key the class asks for, and keeps the basic shape where the set has none", () => {
    const lib = Object.fromEntries(
      librarySymbolsFor('oregon-2012').map((s) => [s.key, s])
    );
    const oregon = (key) => OREGON_2012.symbols.find((s) => s.key === key);
    const basic = (key) => BUILT_IN_SYMBOLS.find((s) => s.key === key);
    expect(lib.entrance.pathData).toBe(oregon('entrance').pathData);
    expect(lib.stairs.pathData).toBe(oregon('elevation-change').pathData);
    expect(lib['transit-stop'].pathData).toBe(
      oregon('challenging-feature').pathData
    );
    expect(lib.landmark.pathData).toBe(oregon('flexible-feature').pathData);
    expect(lib.crossing.pathData).toBe(oregon('intersection').pathData);
    expect(lib['you-are-here']).toEqual(basic('you-are-here'));
    expect(lib['curb-ramp']).toEqual(basic('curb-ramp'));
    expect(lib['chevron-uphill']).toEqual(basic('chevron-uphill'));
    expect(librarySymbolsFor('forge-basic')).toEqual(BUILT_IN_SYMBOLS);
  });

  it('puts a set in use by its key; an unknown key changes nothing; a loaded file still wins', () => {
    expect(activeSetKey()).toBe('forge-basic');
    expect(activeLibrary()).toBe(BUILT_IN_SYMBOLS);
    setActiveSet('oregon-2012');
    expect(activeSetKey()).toBe('oregon-2012');
    expect(activeLibrary().find((s) => s.key === 'entrance').name).toBe(
      'Entrance'
    );
    expect(activeLibrary()).toEqual(librarySymbolsFor('oregon-2012'));
    setActiveSet('no-such-set');
    expect(activeSetKey()).toBe('oregon-2012');
    const own = [
      { key: 'circle', name: 'Mine', pathData: 'M 0 0 H 1 V 1 H 0 Z' },
    ];
    setLibrary(own);
    expect(activeLibrary()).toBe(own);
  });

  it('names the set in use, and a loaded file as your own set', () => {
    expect(activeSet()).toEqual({
      key: 'forge-basic',
      name: 'Forge basic shapes',
    });
    setActiveSet('oregon-2012');
    expect(activeSet()).toEqual({
      key: 'oregon-2012',
      name: 'University of Oregon symbols',
    });
    setLibrary([
      { key: 'circle', name: 'Mine', pathData: 'M 0 0 H 1 V 1 H 0 Z' },
    ]);
    expect(activeSet()).toEqual({ key: 'file', name: 'Your own set' });
  });
});

describe("a set's line styles in the levels builder", () => {
  const WALK = {
    id: 'w',
    class: 'walkway',
    kind: 'line',
    points: [
      [10, 50],
      [60, 50],
    ],
    on: true,
  };
  const plan = (features) => ({
    size: { w: 100, h: 100 },
    features,
    meta: {},
  });

  it("takes the set's symbols, its 13 mm size and its line styles for the classes that use them", () => {
    const s = settingsForSet('oregon-2012');
    expect(s.symbolSizeMm).toBe(13);
    expect(s.symbols).toEqual(librarySymbolsFor('oregon-2012'));
    expect(s.classes.walkway).toMatchObject({
      style: 'dashed',
      width: 1.2,
      dashMm: 2.93,
      dashGapMm: 5.87,
    });
    expect(s.classes.track).toMatchObject({
      style: 'double',
      width: 1.2,
      gapMm: 3.8,
    });
    expect(s.classes.curb).toMatchObject({ style: 'solid', width: 1.2 });
    expect(settingsForSet('forge-basic')).toEqual({});
  });

  it("draws a sidewalk as the set's dashes, every 8.8 mm, from the class's own row", () => {
    const basic = buildLevelRings(plan([WALK]));
    const oregon = buildLevelRings(plan([WALK]), settingsForSet('oregon-2012'));
    // The plan holds the sidewalk alone, so every ring is the sidewalk's.
    const walkRings = (built) =>
      Object.values(built.rings).reduce((n, list) => n + list.length, 0);
    expect(walkRings(basic)).toBe(1);
    // A 50 mm sidewalk: dashes start at 0, 8.8, ... 44 mm.
    expect(walkRings(oregon)).toBe(6);
  });
});

describe('the symbol sheet', () => {
  const read = (p) => readFileSync(p, 'utf8');
  // The value after "name = " on the line that starts with the name.
  const lineOf = (text, name) =>
    text.split(/\r?\n/).find((line) => line.startsWith(`${name} = `)) || '';
  const valueOf = (text, name) =>
    Number(lineOf(text, name).split(' = ')[1].split(';')[0]);
  const rangeOf = (text, name) =>
    lineOf(text, name).split(' = ')[1].split(';')[0];

  it('is written from the sets: the data file is what the sets give now (run scripts/build-symbol-sheet.mjs after a change)', () => {
    expect(read('docs/guides/symbol-sheet/symbol_sheet_data.scad')).toBe(
      symbolSheetData()
    );
  });

  it("keeps the map's heights and their ranges, so a print feels like a map", () => {
    const map = read('public/examples/tactile-map/tactile_map.scad');
    const sheet = read('docs/guides/symbol-sheet/symbol_sheet.scad');
    for (const name of ['level_step_mm', 'symbol_step_mm']) {
      expect(valueOf(sheet, name), name).toBe(valueOf(map, name));
    }
    for (const name of ['LEVEL_STEP_RANGE_MM', 'SYMBOL_STEP_RANGE_MM']) {
      expect(rangeOf(sheet, name), name).toBe(rangeOf(map, name));
    }
  });

  it('fits each set on one plate for a 256 mm bed, every symbol at its size with a 12 mm gap', () => {
    for (const set of BUILT_IN_SETS) {
      const layout = sheetLayout(set);
      expect(layout.plateW).toBeLessThanOrEqual(256);
      expect(layout.plateH).toBeLessThanOrEqual(256);
      expect(layout.cells).toHaveLength(set.symbols.length);
      for (const c of layout.cells) {
        expect(c.size).toBe(
          Math.max(c.symbol.minSizeMm ?? 0, set.symbolSizeMm)
        );
      }
    }
    const oregon = sheetLayout(OREGON_2012);
    expect(oregon.cells.find((c) => c.name === 'Entrance').size).toBe(13);
  });
});
