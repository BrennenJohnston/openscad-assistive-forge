/**
 * The levels builder turns a map plan into the levels file the Tactile Map
 * tile imports, and says in plain words when a map is getting crowded.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  emptyPlan,
  validatePlan,
  sampleStationPlan,
  FEATURE_KINDS,
} from '../../src/js/tactile-map/plan.js';
import {
  buildLevelsSvg,
  buildLevelRings,
  strokePolyline,
  STROKE_METHOD,
  BUILTIN_SYMBOLS,
} from '../../src/js/tactile-map/levels-svg.js';
import { offsetRing } from '../../src/js/svg-offset.js';
import { regionArea, ringsFromPathData } from '../../src/js/ring-geometry.js';

const triangle = (id, x, y) => ({
  id,
  class: 'landmark',
  kind: 'point',
  symbol: 'landmark-triangle',
  at: [x, y],
  on: true,
});

function groupsOf(svg) {
  const groups = {};
  const re = /<g id="([^"]+)">([\s\S]*?)<\/g>/g;
  let m;
  while ((m = re.exec(svg))) groups[m[1]] = m[2];
  return groups;
}

function pathDataOf(groupBody) {
  const m = groupBody.match(/<path[^>]*\sd="([^"]*)"/);
  return m ? m[1] : '';
}

function ringsOf(groupBody) {
  return ringsFromPathData(pathDataOf(groupBody));
}

describe('the plan', () => {
  it('names five kinds of feature and starts empty', () => {
    expect(FEATURE_KINDS).toEqual(['line', 'area', 'point', 'text', 'channel']);
    const plan = emptyPlan(480, 360);
    expect(plan.size).toEqual({ w: 480, h: 360 });
    expect(plan.features).toEqual([]);
    expect(plan.meta.north).toBe('arrow');
    expect(validatePlan(plan)).toEqual({ ok: true, errors: [] });
  });

  it('refuses a feature without a kind it knows, in a sentence', () => {
    const plan = emptyPlan(480, 360);
    plan.features.push({ id: 'x', class: 'wall', kind: 'blob', on: true });
    const result = validatePlan(plan);
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/blob/);
  });
});

describe('the levels file', () => {
  it('puts each class on its level, with the four groups and the letters box', () => {
    const plan = emptyPlan(480, 360);
    plan.meta.title = 'STATION';
    plan.features.push(
      {
        id: 'wall-1',
        class: 'wall',
        kind: 'line',
        points: [
          [20, 20],
          [120, 20],
        ],
        on: true,
      },
      {
        id: 'route-1',
        class: 'route',
        kind: 'line',
        points: [
          [40, 300],
          [127, 300],
        ],
        on: true,
      },
      triangle('stairs-1', 100, 200),
      triangle('stairs-2', 140, 200)
    );
    const { svg, warnings, stats } = buildLevelsSvg(plan);
    expect(svg).toMatch(
      /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="480mm" height="360mm" viewBox="0 0 480 360">/
    );
    const groups = groupsOf(svg);
    expect(Object.keys(groups)).toEqual([
      'level1',
      'level2',
      'level3',
      'channels',
      'cutouts',
      'letters',
    ]);
    expect(ringsOf(groups.level1)).toHaveLength(0);
    expect(ringsOf(groups.level3)).toHaveLength(1);
    expect(ringsOf(groups.level2).length).toBeGreaterThanOrEqual(2 + 30);
    expect(groups.letters).toMatch(/<rect[^>]*fill="none"/);
    expect(warnings).toEqual([]);
    expect(stats.levelsUsed).toBe(2);
    expect(stats.symbolsUsed).toBe(1);
    // The plate splitter reads the rings before they become path data.
    const parts = buildLevelRings(plan);
    expect(parts.rings.level3).toHaveLength(1);
    expect(parts.rings.level1).toHaveLength(0);
    expect(Object.keys(BUILTIN_SYMBOLS)).toContain('stairs');
  });

  it('draws a 10 mm triangle within 2 percent of 43.3 square millimeters', () => {
    const plan = emptyPlan(200, 150);
    plan.features.push(triangle('t', 100, 75));
    const groups = groupsOf(buildLevelsSvg(plan).svg);
    const area = regionArea(ringsOf(groups.level2));
    expect(Math.abs(area - 43.3) / 43.3).toBeLessThan(0.02);
  });

  it('strokes a straight 100 mm wall of width 2 to one ring near 200 plus the round caps', () => {
    const plan = emptyPlan(200, 150);
    plan.features.push({
      id: 'w',
      class: 'wall',
      kind: 'line',
      points: [
        [50, 75],
        [150, 75],
      ],
      on: true,
    });
    const rings = ringsOf(groupsOf(buildLevelsSvg(plan).svg).level3);
    expect(rings).toHaveLength(1);
    // Round caps: a 24-gon of radius 1 at each end adds 3.11 square
    // millimeters to the 200 of the body.
    const expected = 200 + Math.PI * 1 * 1;
    expect(Math.abs(regionArea(rings) - expected) / expected).toBeLessThan(
      0.02
    );
  });

  it('took the segment-and-disc stroke, because offsetRing closes an open polyline', () => {
    // The probe the plan asked for: offsetRing on a straight line and on an L.
    const line = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    const ell = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ];
    expect(offsetRing(line, 1)).toBeNull();
    const ellRegion = offsetRing(ell, 1, { smooth: false });
    // The L came back as a filled triangle with a band around it, not as a
    // 2 mm wide L: its area is near the triangle's 5,000, not the L's 400.
    expect(regionArea(ellRegion)).toBeGreaterThan(4000);
    expect(STROKE_METHOD).toBe('segments-and-discs');
    const stroked = strokePolyline(
      [
        [0, 0],
        [100, 0],
        [100, 100],
      ],
      2
    );
    // 200 mm of band, 2 mm wide, with round joins and caps.
    const expected = 400 + Math.PI;
    expect(Math.abs(regionArea(stroked) - expected) / expected).toBeLessThan(
      0.03
    );
  });
});

describe('the clutter checks', () => {
  it('names both symbols when two are closer than the minimum gap', () => {
    const plan = emptyPlan(200, 150);
    plan.features.push(triangle('a', 100, 75), triangle('b', 112, 75));
    const { warnings } = buildLevelsSvg(plan);
    const close = warnings.filter((w) => w.code === 'too-close');
    expect(close).toHaveLength(1);
    expect(close[0].text).toBe(
      'a and b are 2 mm apart, closer than the 3 mm minimum. Move one or turn one off.'
    );
  });

  it('counts the symbol keys and warns past fifteen', () => {
    const plan = emptyPlan(600, 450);
    for (let i = 0; i < 16; i++) {
      plan.features.push({
        id: `s${i}`,
        class: 'landmark',
        kind: 'point',
        at: [30 + (i % 8) * 60, 60 + Math.floor(i / 8) * 120],
        symbol: i % 2 ? 'circle' : 'triangle',
        name: `symbol ${i}`,
        on: true,
      });
      plan.features[i].symbol = `shape-${i}`;
    }
    const { warnings } = buildLevelsSvg(plan);
    const many = warnings.find((w) => w.code === 'too-many-symbols');
    expect(many).toBeTruthy();
    expect(many.text).toBe(
      '16 different symbols on this map. More than 15 is hard to remember; consider fewer.'
    );
  });

  it('warns about a line wider than 2.2 mm and about a map wider than two hand spans', () => {
    const plan = emptyPlan(700, 300);
    plan.features.push({
      id: 'thick',
      class: 'wall',
      kind: 'line',
      width: 2.4,
      points: [
        [20, 20],
        [200, 20],
      ],
      on: true,
    });
    const { warnings } = buildLevelsSvg(plan);
    const wide = warnings.find((w) => w.code === 'line-too-wide');
    expect(wide.text).toBe(
      'thick is 2.4 mm wide; lines wider than 2.2 mm read as two lines. Use 2.2 mm or a double line.'
    );
    const map = warnings.find((w) => w.code === 'too-wide');
    expect(map.text).toBe(
      'The map is 700 mm wide; more than 600 mm is beyond two hand spans.'
    );
  });
});

describe('the sample station plan', () => {
  it('builds a three-level file the tile can import, saved for a look in the app', () => {
    const plan = sampleStationPlan();
    expect(validatePlan(plan).ok).toBe(true);
    const { svg, warnings, stats } = buildLevelsSvg(plan);
    const groups = groupsOf(svg);
    for (const id of ['level1', 'level2', 'level3', 'channels']) {
      expect(ringsOf(groups[id]).length, id).toBeGreaterThan(0);
    }
    expect(stats.levelsUsed).toBe(3);
    expect(warnings).toEqual([]);
    const dir = join(tmpdir(), 'tactile-map-levels');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'sample-plan.svg'), svg);
  });
});
