/**
 * The tactile map's symbol library: nine sourced shapes a finger can tell
 * apart at 10 mm, and a door for a set of your own that refuses what a
 * 0.4 mm nozzle cannot print.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
  BUILT_IN_SYMBOLS,
  SYMBOL_MIN_SIZE_MM,
  SYMBOL_MIN_FEATURE_MM,
  thinnestFeatureMm,
  loadSymbolLibraryFile,
  activeLibrary,
  setLibrary,
} from '../../src/js/tactile-map/symbol-library.js';
import { buildLevelsSvg } from '../../src/js/tactile-map/levels-svg.js';
import { emptyPlan } from '../../src/js/tactile-map/plan.js';
import { regionArea, ringsFromPathData } from '../../src/js/ring-geometry.js';

const KEYS = [
  'stairs',
  'elevator-up',
  'elevator-down',
  'entrance',
  'landmark-circle',
  'landmark-square',
  'landmark-triangle',
  'you-are-here',
  'transit-stop',
  'chevron-uphill',
];

const fileOf = (value, name = 'symbols.json') => ({
  name,
  text: async () => (typeof value === 'string' ? value : JSON.stringify(value)),
});

afterEach(() => setLibrary(null));

describe('the built-in symbols', () => {
  it('are the ten shapes, each with a name and a source', () => {
    expect(BUILT_IN_SYMBOLS.map((s) => s.key)).toEqual(KEYS);
    for (const s of BUILT_IN_SYMBOLS) {
      expect(typeof s.name, s.key).toBe('string');
      expect(s.name.length, s.key).toBeGreaterThan(0);
      expect(typeof s.source, s.key).toBe('string');
      expect(s.source.length, s.key).toBeGreaterThan(10);
      expect(s.minSizeMm, s.key).toBe(SYMBOL_MIN_SIZE_MM);
      expect(ringsFromPathData(s.pathData).length, s.key).toBeGreaterThan(0);
    }
  });

  it('have no part thinner than 1.0 mm at 10 mm', () => {
    for (const s of BUILT_IN_SYMBOLS) {
      expect(thinnestFeatureMm(s.pathData, 10), s.key).toBeGreaterThanOrEqual(
        SYMBOL_MIN_FEATURE_MM
      );
    }
  });

  it('stay inside the unit box and the landmark triangle keeps its area', () => {
    for (const s of BUILT_IN_SYMBOLS) {
      for (const ring of ringsFromPathData(s.pathData)) {
        for (const p of ring) {
          expect(p.x, s.key).toBeGreaterThanOrEqual(-0.001);
          expect(p.x, s.key).toBeLessThanOrEqual(1.001);
          expect(p.y, s.key).toBeGreaterThanOrEqual(-0.001);
          expect(p.y, s.key).toBeLessThanOrEqual(1.001);
        }
      }
    }
    const tri = BUILT_IN_SYMBOLS.find((s) => s.key === 'landmark-triangle');
    const area = regionArea(ringsFromPathData(tri.pathData));
    expect(Math.abs(area - 0.433) / 0.433).toBeLessThan(0.02);
  });

  it('are what the levels builder draws by default', () => {
    const plan = emptyPlan(200, 150);
    plan.features.push({
      id: 'here',
      class: 'you-are-here',
      kind: 'point',
      at: [100, 75],
      on: true,
    });
    const { svg, stats } = buildLevelsSvg(plan);
    expect(stats.unknownSymbols).toEqual([]);
    // A disc with a square hole: two rings in level 2.
    const d = svg.match(/<g id="level2"><path d="([^"]*)"/)[1];
    expect(ringsFromPathData(d)).toHaveLength(2);
  });
});

describe('the file door', () => {
  it('refuses a file that is not a symbol library, in a sentence', async () => {
    await expect(loadSymbolLibraryFile(fileOf('not json'))).rejects.toThrow(
      /symbols\.json is not a symbol library: /
    );
    await expect(loadSymbolLibraryFile(fileOf({ a: 1 }))).rejects.toThrow(
      /symbols\.json is not a symbol library: /
    );
  });

  it('refuses a 4 mm symbol with the named sentence', async () => {
    const file = fileOf([
      {
        key: 'tiny',
        name: 'Tiny',
        pathData: 'M0 0 H1 V1 H0 Z',
        minSizeMm: 4,
        source: 'a test',
      },
    ]);
    await expect(loadSymbolLibraryFile(file)).rejects.toThrow(
      'Symbol Tiny is 4 mm at its smallest size; a symbol must be at least 6 mm.'
    );
  });

  it('refuses a symbol with a part thinner than 1.0 mm at 10 mm', async () => {
    const file = fileOf([
      {
        key: 'hair',
        name: 'Hairline',
        pathData: 'M0 0 H1 V1 H0 Z M0.04 0.04 V0.96 H0.96 V0.04 Z',
        minSizeMm: 6,
        source: 'a test',
      },
    ]);
    await expect(loadSymbolLibraryFile(file)).rejects.toThrow(
      'Symbol Hairline has a part thinner than 1.0 mm, which a 0.4 mm nozzle cannot print.'
    );
  });

  it('replaces the built-in set whole, and null restores it', async () => {
    const mine = [
      {
        key: 'a',
        name: 'A',
        pathData: 'M0 0 H1 V1 H0 Z',
        minSizeMm: 6,
        source: 'mine',
      },
      {
        key: 'b',
        name: 'B',
        pathData: 'M0.5 0 L1 1 H0 Z',
        minSizeMm: 6,
        source: 'mine',
      },
    ];
    const { symbols, warnings } = await loadSymbolLibraryFile(fileOf(mine));
    expect(symbols).toHaveLength(2);
    expect(warnings).toEqual([]);
    setLibrary(symbols);
    expect(activeLibrary()).toHaveLength(2);
    expect(activeLibrary().map((s) => s.key)).toEqual(['a', 'b']);
    setLibrary(null);
    expect(activeLibrary()).toHaveLength(10);
    expect(activeLibrary()).toBe(BUILT_IN_SYMBOLS);
  });
});
