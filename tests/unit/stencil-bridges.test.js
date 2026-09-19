/**
 * Bridges for the laser lane (DP-13).
 *
 * A bridge is a rib of material left across a cut so an island stays put. The
 * cases below are about ribs that actually reach both sides, about an island
 * that CANNOT be held being reported rather than quietly dropped, and about
 * bridges staying out of the layered mode, which needs none.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';
import {
  BRIDGE_WIDTH_MM,
  rayRingIntersections,
  ribRect,
  generateBridgesForIsland,
  findIslands,
  buildBridges,
  bridgesToPathData,
} from '../../src/js/stencil-bridges.js';
import {
  parseSvgElements,
  classifyElements,
} from '../../src/js/svg-preparer.js';
import {
  buildNestingTree,
  polygonFromPathData,
  pointInPolygon,
} from '../../src/js/svg-nesting.js';

const ring = (d) => polygonFromPathData(d).points;
const SQUARE = ring('M 0 0 H 100 V 100 H 0 Z');
const INNER = ring('M 40 40 H 60 V 60 H 40 Z');

describe('rayRingIntersections', () => {
  it('finds both crossings of a ray through a square', () => {
    const ts = rayRingIntersections({ x: 50, y: 50 }, { x: 1, y: 0 }, SQUARE);
    expect(ts).toHaveLength(1);
    expect(ts[0]).toBeCloseTo(50, 6);
  });

  it('ignores crossings behind the origin', () => {
    // Only positive t: a rib runs outward from the island, never back.
    const ts = rayRingIntersections({ x: 50, y: 50 }, { x: 1, y: 0 }, SQUARE);
    expect(ts.every((t) => t > 0)).toBe(true);
  });

  it('returns nothing for a ray parallel to every edge it could meet', () => {
    expect(rayRingIntersections({ x: 0, y: 0 }, { x: 1, y: 0 }, [])).toEqual(
      []
    );
    expect(rayRingIntersections({ x: 0, y: 0 }, { x: 1, y: 0 }, null)).toEqual(
      []
    );
  });
});

describe('ribRect', () => {
  it('spans the gap and is as wide as it was asked to be', () => {
    const r = ribRect({ x: 0, y: 0 }, { x: 1, y: 0 }, 10, 20, 4);
    expect(r).toHaveLength(4);
    const xs = r.map((p) => p.x);
    const ys = r.map((p) => p.y);
    expect(Math.min(...xs)).toBeCloseTo(10, 6);
    expect(Math.max(...xs)).toBeCloseTo(20, 6);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(4, 6);
  });

  it('runs along the ray whatever direction it points', () => {
    const r = ribRect({ x: 0, y: 0 }, { x: 0, y: 1 }, 5, 15, 2);
    const ys = r.map((p) => p.y);
    expect(Math.min(...ys)).toBeCloseTo(5, 6);
    expect(Math.max(...ys)).toBeCloseTo(15, 6);
  });
});

describe('generateBridgesForIsland', () => {
  const island = { ring: INNER, enclosingRing: SQUARE };

  it('places the ribs it was asked for', () => {
    const { rects, failedAngles } = generateBridgesForIsland(island, {
      count: 2,
    });
    expect(rects).toHaveLength(2);
    expect(failedAngles).toEqual([]);
  });

  it('★ each rib REACHES both sides, or it holds nothing', () => {
    // A rib that stops short of the enclosing material is decoration. Each
    // one must start inside the island and finish inside the surround.
    const { rects } = generateBridgesForIsland(island, { count: 4 });
    expect(rects.length).toBe(4);
    for (const r of rects) {
      // It must CROSS the island's edge: some corners in, some out. A rib
      // wholly inside holds nothing, and one wholly outside touches nothing.
      const inside = r.filter((p) => pointInPolygon(p, INNER)).length;
      expect(inside).toBeGreaterThan(0);
      expect(inside).toBeLessThan(r.length);
      // And it reaches the surround: the far end is past the island by more
      // than the gap, deliberately overrunning so the boolean leaves no
      // zero-width seam. That overrun is why corners may sit outside SQUARE.
      const far = Math.max(...r.map((p) => Math.hypot(p.x - 50, p.y - 50)));
      expect(far).toBeGreaterThan(50);
    }
  });

  it('uses an INTERIOR point, so a concave island works', () => {
    // The owner's version fans from the centroid, and the middle of a C is in
    // the gap. Rays fired from outside cross the ring in the wrong order and
    // the ribs come out backwards.
    const c = ring(
      'M 20 20 L 80 20 L 80 35 L 35 35 L 35 65 L 80 65 L 80 80 L 20 80 Z'
    );
    const { rects } = generateBridgesForIsland(
      { ring: c, enclosingRing: SQUARE },
      { count: 2 }
    );
    expect(rects.length).toBeGreaterThan(0);
  });

  it('reports an angle it could not place rather than dropping it', () => {
    // An island held by one rib instead of two is something to know BEFORE
    // cutting, not after it falls on the floor.
    const { failedAngles } = generateBridgesForIsland(
      { ring: INNER, enclosingRing: [] },
      { count: 2 }
    );
    expect(failedAngles.length).toBeGreaterThan(0);
  });

  it('survives an island it cannot find a point inside', () => {
    const r = generateBridgesForIsland(
      { ring: [{ x: 0, y: 0 }], enclosingRing: SQUARE },
      { count: 2 }
    );
    expect(r.rects).toEqual([]);
    expect(r.failedAngles.length).toBeGreaterThan(0);
  });

  it('survives nonsense', () => {
    expect(generateBridgesForIsland(null).rects).toEqual([]);
    expect(generateBridgesForIsland({}).rects).toEqual([]);
  });
});

describe('findIslands and buildBridges', () => {
  const design =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
    '<path d="M0 0 H100 V100 H0 Z" fill="#000"/>' +
    '<path d="M40 40 H60 V60 H40 Z" fill="#fff"/></svg>';

  const parsed = () => {
    const els = classifyElements(parseSvgElements(design));
    return { els, tree: buildNestingTree(els) };
  };

  it('finds a shape inside another shape', () => {
    const { els, tree } = parsed();
    const islands = findIslands(els, tree);
    expect(islands).toHaveLength(1);
    expect(islands[0].index).toBe(1);
  });

  it('finds nothing when nothing is enclosed', () => {
    const els = classifyElements(
      parseSvgElements(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 20">' +
          '<path d="M0 0 H10 V10 H0 Z" fill="#000"/>' +
          '<path d="M50 0 H60 V10 H50 Z" fill="#000"/></svg>'
      )
    );
    expect(findIslands(els, buildNestingTree(els))).toEqual([]);
  });

  it('builds ribs and says how many shapes it held', () => {
    const { els, tree } = parsed();
    const r = buildBridges(els, tree, { count: 2 });
    expect(r.islandCount).toBe(1);
    expect(r.unheld).toBe(0);
    expect(r.rects).toHaveLength(2);
    expect(r.message).toBeNull();
  });

  it('★ says plainly when a shape will fall out', () => {
    // Silence here means someone cuts a sheet and finds a hole in it.
    const fake = {
      nodes: [
        {
          index: 0,
          polygon: SQUARE,
          parent: null,
          children: [1],
          degenerate: false,
        },
        {
          index: 1,
          polygon: [{ x: 1, y: 1 }],
          parent: 0,
          children: [],
          degenerate: false,
        },
      ],
    };
    const r = buildBridges([{}, {}], fake, { count: 2 });
    expect(r.unheld).toBe(1);
    expect(r.message).toMatch(/will fall out when it is cut/);
    expect(r.message).not.toContain('—');
  });

  it('says nothing at all when there are no islands', () => {
    const els = classifyElements(
      parseSvgElements(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
          '<path d="M0 0 H100 V100 H0 Z" fill="#000"/></svg>'
      )
    );
    expect(buildBridges(els, buildNestingTree(els)).message).toBeNull();
  });

  it('survives nonsense', () => {
    expect(findIslands(null, null)).toEqual([]);
    expect(buildBridges(null, null).islandCount).toBe(0);
  });
});

describe('bridgesToPathData', () => {
  it('writes each rib as a closed subpath', () => {
    const d = bridgesToPathData([
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ],
    ]);
    expect(d).toMatch(/^M /);
    expect(d).toMatch(/Z$/);
    expect((d.match(/M/g) || []).length).toBe(1);
  });

  it('skips a rib with too few corners to be a shape', () => {
    expect(bridgesToPathData([[{ x: 0, y: 0 }]])).toBe('');
    expect(bridgesToPathData(null)).toBe('');
  });

  it('the default rib is 3 mm, which is a printable and cuttable width', () => {
    expect(BRIDGE_WIDTH_MM).toBe(3);
  });
});
