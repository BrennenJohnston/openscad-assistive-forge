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
  chevronsLine,
  strokePolyline,
  STROKE_METHOD,
  BUILTIN_SYMBOLS,
  CHANNEL_CUTS,
  LEVELS_BY_CLASS,
  pointSizeMm,
  settingsForSet,
} from '../../src/js/tactile-map/levels-svg.js';
import { offsetRing } from '../../src/js/svg-offset.js';
import { regionArea, ringsFromPathData } from '../../src/js/ring-geometry.js';

const mark = (id, x, y) => ({
  id,
  class: 'landmark',
  kind: 'point',
  symbol: 'landmark',
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

  it("refuses an area's hole that is not a ring, in a sentence", () => {
    const plan = emptyPlan(480, 360);
    plan.features.push({
      id: 'yard',
      class: 'area',
      kind: 'area',
      ring: [
        [0, 0],
        [100, 0],
        [100, 100],
        [0, 100],
      ],
      holes: [
        [
          [20, 20],
          [40, 40],
        ],
      ],
      on: true,
    });
    const result = validatePlan(plan);
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([
      'yard has a hole that is not a ring of three or more points.',
    ]);
    plan.features[0].holes = [
      [
        [20, 20],
        [40, 20],
        [40, 40],
        [20, 40],
      ],
    ];
    expect(validatePlan(plan)).toEqual({ ok: true, errors: [] });
  });
});

describe('the levels file', () => {
  it('puts each class on its level, with the six groups and the letters box', () => {
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
      mark('stairs-1', 100, 200),
      mark('stairs-2', 140, 200)
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
      'here',
      'channels',
      'cutouts',
      'leads',
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

  it("keeps an area's holes open: a 100 mm plateau with a 20 mm slot", () => {
    const plan = emptyPlan(480, 360);
    plan.features.push({
      id: 'plateau',
      class: 'area',
      kind: 'area',
      ring: [
        [0, 0],
        [100, 0],
        [100, 100],
        [0, 100],
      ],
      holes: [
        [
          [20, 20],
          [40, 20],
          [40, 40],
          [20, 40],
        ],
      ],
      on: true,
    });
    const { rings } = buildLevelRings(plan);
    expect(rings.level1).toHaveLength(2);
    const areas = rings.level1
      .map((r) => regionArea([r]))
      .sort((a, b) => a - b);
    expect(Math.abs(areas[0] + 400)).toBeLessThan(1);
    expect(Math.abs(areas[1] - 10000)).toBeLessThan(1);
    const { svg } = buildLevelsSvg(plan);
    const d = pathDataOf(groupsOf(svg).level1);
    expect((d.match(/M /g) || []).length).toBe(2);
    expect(regionArea(ringsFromPathData(d))).toBeCloseTo(9600, 0);
  });

  it('raises a drawn word, classed Text, to the symbol level with its counters open', () => {
    expect(LEVELS_BY_CLASS.text).toEqual({ kind: 'area', level: 2 });
    const plan = emptyPlan(480, 360);
    plan.features.push({
      id: 'letter-o',
      class: 'text',
      kind: 'area',
      ring: [
        [100, 100],
        [116, 100],
        [116, 120],
        [100, 120],
      ],
      holes: [
        [
          [104, 104],
          [112, 104],
          [112, 116],
          [104, 116],
        ],
      ],
      on: true,
    });
    const { rings, warnings } = buildLevelRings(plan);
    expect(warnings).toEqual([]);
    expect(rings.level1).toEqual([]);
    expect(rings.level2).toHaveLength(2);
    const areas = rings.level2
      .map((r) => regionArea([r]))
      .sort((a, b) => a - b);
    expect(Math.abs(areas[0] + 96)).toBeLessThan(1);
    expect(Math.abs(areas[1] - 320)).toBeLessThan(1);
  });

  it('draws a 10 mm landmark within 2 percent of 50 square millimeters', () => {
    const plan = emptyPlan(200, 150);
    plan.features.push(mark('t', 100, 75));
    const groups = groupsOf(buildLevelsSvg(plan).svg);
    const area = regionArea(ringsOf(groups.level2));
    expect(Math.abs(area - 50) / 50).toBeLessThan(0.02);
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

describe('You are here, the most prominent mark', () => {
  it('stands a full disc on the symbol level and a center dot 0.4 of its size in the here group, counted as the same level', () => {
    const plan = emptyPlan(200, 150);
    plan.features.push({
      id: 'you-are-here',
      class: 'you-are-here',
      kind: 'point',
      name: 'You are here',
      at: [100, 75],
      on: true,
    });
    const { rings, stats } = buildLevelRings(plan);
    const disc = regionArea(rings.level2);
    const dot = regionArea(rings.here);
    // A 10 mm disc with no hole (78.5 mm2) and a 4 mm dot (12.6 mm2).
    expect(Math.abs(disc - 25 * Math.PI) / (25 * Math.PI)).toBeLessThan(0.03);
    expect(Math.abs(dot - 4 * Math.PI) / (4 * Math.PI)).toBeLessThan(0.03);
    const xs = rings.here.flat().map((p) => p.x);
    const ys = rings.here.flat().map((p) => p.y);
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(100, 1);
    expect((Math.min(...ys) + Math.max(...ys)) / 2).toBeCloseTo(75, 1);
    expect(stats.levelsUsed).toBe(1);
    const { svg } = buildLevelsSvg(plan);
    expect(svg).toMatch(/<g id="here"><path d="[^"]+"\/><\/g>/);
  });

  it('writes the here group empty on a map without You are here, since the model imports every group', () => {
    const plan = emptyPlan(200, 150);
    plan.features.push(mark('a', 100, 75));
    const { svg } = buildLevelsSvg(plan);
    expect(svg).toContain('<g id="here"></g>');
  });
});

describe('the clutter checks', () => {
  it('names both symbols when two are closer than the minimum gap', () => {
    const plan = emptyPlan(200, 150);
    plan.features.push(mark('a', 100, 75), mark('b', 112, 75));
    const { warnings } = buildLevelsSvg(plan);
    const close = warnings.filter((w) => w.code === 'too-close');
    expect(close).toHaveLength(1);
    expect(close[0].text).toBe(
      'Landmark and Landmark (2) are 2 mm apart, closer than the 3 mm minimum. Move one or turn one off.'
    );
  });

  it('never says a gap under the minimum is the minimum: 2.96 mm reads 2.9 mm', () => {
    const plan = emptyPlan(200, 150);
    plan.features.push(mark('a', 100, 75), mark('b', 112.96, 75));
    const { warnings } = buildLevelsSvg(plan);
    const close = warnings.filter((w) => w.code === 'too-close');
    expect(close).toHaveLength(1);
    expect(close[0].text).toBe(
      'Landmark and Landmark (2) are 2.9 mm apart, closer than the 3 mm minimum. Move one or turn one off.'
    );
  });

  it('says three or more symbols at one spot in one warning: one kind, keep one; several kinds, move them apart', () => {
    const hall = {
      id: 'hall',
      class: 'area',
      kind: 'area',
      name: 'The Hall',
      ring: [
        [20, 20],
        [60, 20],
        [60, 50],
        [20, 50],
      ],
      on: true,
    };
    const bench = (id, x, y) => ({
      id,
      class: 'furniture',
      kind: 'point',
      what: 'Bench',
      at: [x, y],
      on: true,
    });
    const plan = emptyPlan(200, 150);
    plan.features.push(
      hall,
      bench('b1', 100, 75),
      bench('b2', 101, 75),
      bench('b3', 100, 76),
      bench('b4', 101, 76),
      mark('t1', 150, 20),
      mark('t2', 160, 20),
      {
        id: 's1',
        class: 'stairs',
        kind: 'point',
        at: [170, 20],
        on: true,
      }
    );
    const { warnings } = buildLevelsSvg(plan);
    const close = warnings.filter((w) => w.code === 'too-close');
    expect(close.map((w) => w.text)).toEqual([
      '4 benches within 3 mm of one another near The Hall. Keep one and turn the others off.',
      '3 symbols within 3 mm of one another near The Hall. Move them apart or turn some off.',
    ]);
    expect(close[0].featureIds).toEqual(['b1', 'b2', 'b3', 'b4']);
    expect(close[1].featureIds).toEqual(['t1', 't2', 's1']);
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
      'Wall is 2.4 mm wide; lines wider than 2.2 mm read as two lines. Use 2.2 mm or a double line.'
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

describe('tape channels cut through', () => {
  it('offers a recess first, then a cut through for tape on a backing board', () => {
    expect(CHANNEL_CUTS.map((c) => [c.key, c.name])).toEqual([
      ['recess', 'A recess with a floor'],
      ['through', 'Cut through, for a backing board'],
    ]);
  });

  it('writes the channel rectangles into cutouts and leaves channels empty when the settings say through', () => {
    const plan = sampleStationPlan();
    const recess = buildLevelRings(plan);
    const through = buildLevelRings(plan, { channelsThrough: true });
    expect(recess.rings.channels.length).toBeGreaterThan(0);
    expect(recess.rings.cutouts).toEqual([]);
    expect(through.rings.channels).toEqual([]);
    expect(through.rings.cutouts).toEqual(recess.rings.channels);
    expect(through.stats.levelsUsed).toBe(recess.stats.levelsUsed);
    const { svg } = buildLevelsSvg(plan, { channelsThrough: true });
    const groups = groupsOf(svg);
    expect(groups.channels).toBe('');
    expect(ringsOf(groups.cutouts)).toHaveLength(recess.rings.channels.length);
  });

  it('keeps the clearance check on a channel cut through', () => {
    const plan = emptyPlan(200, 150);
    plan.features.push(mark('t', 50, 50), {
      id: 'c',
      class: 'channel',
      kind: 'channel',
      at: [50, 62],
      length: 30,
      on: true,
    });
    const recess = buildLevelRings(plan);
    const through = buildLevelRings(plan, { channelsThrough: true });
    expect(recess.warnings.map((w) => w.code)).toEqual(['channel-too-close']);
    expect(through.warnings).toEqual(recess.warnings);
  });
});

describe('the chevrons style', () => {
  const line = [
    [0, 180],
    [100, 180],
  ];
  /** The x of every point that lies out past the line's own width: the chevrons' arm ends. */
  const armEnds = (rings) =>
    rings
      .flat()
      .filter((p) => Math.abs(p.y - 180) > 2.5)
      .map((p) => p.x);

  it('draws a chevron every 10 mm, 6 mm across, pointing to the uphill end', () => {
    const rings = chevronsLine(line, 1.5, 10, 6, 'end');
    const ends = armEnds(rings);
    expect(ends.length).toBeGreaterThan(0);
    // Ten chevrons centered at 5, 15, ... 95: their arm ends sit 3 mm back of each center.
    const clusters = new Set(ends.map((x) => Math.round((x + 3 - 5) / 10)));
    expect(clusters.size).toBe(10);
    expect(Math.min(...ends)).toBeGreaterThan(0.5);
    expect(Math.min(...ends)).toBeLessThan(3.5);
    const ys = rings.flat().map((p) => p.y);
    expect(Math.max(...ys) - 180).toBeLessThanOrEqual(3 + 0.76);
    expect(180 - Math.min(...ys)).toBeLessThanOrEqual(3 + 0.76);
  });

  it('turns the chevrons round when the uphill end is the start', () => {
    const ends = armEnds(chevronsLine(line, 1.5, 10, 6, 'start'));
    // The arm ends now sit 3 mm past each center: the first near 8.
    expect(Math.min(...ends)).toBeGreaterThan(6.5);
    expect(Math.min(...ends)).toBeLessThan(9.5);
  });

  it('is what the levels builder draws for the steep class, on level 2', () => {
    const plan = emptyPlan(480, 360);
    plan.features.push({
      id: 'steep-1',
      class: 'steep',
      kind: 'line',
      points: line,
      on: true,
      style: 'chevrons',
      uphill: 'end',
    });
    const { rings, warnings } = buildLevelRings(plan);
    const onLevel2 = Object.entries(rings).find(
      ([key, list]) => /2/.test(key) && list.length > 0
    );
    expect(onLevel2).toBeTruthy();
    expect(warnings.filter((w) => w.code === 'line-too-wide')).toEqual([]);
  });
});

describe('the pedestrian base classes', () => {
  it('puts a curb ramp and a raised curb on the symbol level in forms of their own, and a traffic island as a plain line on level 2', () => {
    expect(LEVELS_BY_CLASS['curb-ramp']).toEqual({
      kind: 'point',
      level: 2,
      symbol: 'curb-ramp',
    });
    expect(LEVELS_BY_CLASS['raised-curb']).toEqual({
      kind: 'point',
      level: 2,
      symbol: 'raised-curb',
    });
    expect(LEVELS_BY_CLASS['traffic-island']).toEqual({
      kind: 'line',
      level: 2,
      width: 1.5,
      style: 'solid',
    });
    const area = (cls) => {
      const plan = emptyPlan(200, 150);
      plan.features.push({
        id: 'c',
        class: cls,
        kind: 'point',
        at: [100, 75],
        on: true,
      });
      return regionArea(ringsOf(groupsOf(buildLevelsSvg(plan).svg).level2));
    };
    // Three bars 2 mm wide, 3, 6 and 9 mm tall: 36 square millimeters. The comb
    // is another form with about the same material.
    expect(Math.abs(area('curb-ramp') - 36) / 36).toBeLessThan(0.02);
    expect(area('raised-curb')).toBeGreaterThan(30);
    expect(area('raised-curb')).toBeLessThan(45);
  });

  it('draws the destination cone footprint, 4.9 mm across on the symbol level, with no too-small warning: the cone is read by its height', () => {
    const plan = emptyPlan(100, 100);
    plan.features.push({
      id: 'destination',
      class: 'destination',
      kind: 'point',
      name: '3600 Ferry Pl NE',
      size: 4.9,
      at: [50, 50],
      on: true,
    });
    const { svg, warnings } = buildLevelsSvg(plan);
    expect(warnings.filter((w) => w.code === 'symbol-too-small')).toEqual([]);
    const disc = ringsOf(groupsOf(svg).level2);
    expect(disc).toHaveLength(1);
    expect(Math.abs(regionArea(disc) - Math.PI * 2.45 ** 2)).toBeLessThan(1);
  });

  it('lists where each solid symbol stands, for the model to raise the cone there; a map without one lists nothing', () => {
    const plan = emptyPlan(100, 100);
    plan.features.push(
      {
        id: 'destination',
        class: 'destination',
        kind: 'point',
        name: '3600 Ferry Pl NE',
        size: 4.9,
        at: [50, 50],
        on: true,
      },
      {
        id: 'cafe',
        class: 'landmark',
        kind: 'point',
        at: [20, 20],
        on: true,
      },
      {
        id: 'off',
        class: 'destination',
        kind: 'point',
        at: [80, 80],
        on: false,
      }
    );
    expect(buildLevelRings(plan).cones).toEqual([[50, 50]]);
    expect(buildLevelRings(emptyPlan(100, 100)).cones).toEqual([]);
  });
});

describe('the station lines, as my SeaTac key draws them', () => {
  const build = (cls, points) => {
    const plan = emptyPlan(100, 80);
    plan.features.push({ id: cls, class: cls, kind: 'line', points, on: true });
    return buildLevelRings(plan);
  };
  const boxOf = (ring) => ({
    x0: Math.min(...ring.map((p) => p.x)),
    x1: Math.max(...ring.map((p) => p.x)),
    y0: Math.min(...ring.map((p) => p.y)),
    y1: Math.max(...ring.map((p) => p.y)),
  });
  const byX = (rings) => rings.map(boxOf).sort((a, b) => a.x0 - b.x0);
  const tooWide = (warnings) =>
    warnings.filter((w) => w.code === 'line-too-wide');

  it('draws a shoreline side as dashes 3 mm long and 3 mm apart, 1.5 mm wide, on the floor', () => {
    const { rings } = build('shoreline', [
      [10, 30],
      [40, 30],
    ]);
    expect(rings.level2).toEqual([]);
    const dashes = byX(rings.level1);
    expect(dashes).toHaveLength(5);
    dashes.forEach((d, i) => {
      expect(d.x0).toBeCloseTo(10 + 6 * i, 2);
      expect(d.x1 - d.x0).toBeCloseTo(3, 2);
      expect(d.y1 - d.y0).toBeCloseTo(1.5, 2);
    });
  });

  it('draws a paid fare zone as a band 5.04 mm wide on the floor and nine 0.72 mm bars across it on the symbol level, every 2.664 mm, over the key sample 23.04 mm long', () => {
    const { rings, warnings } = build('fare-zone', [
      [10, 30],
      [33.04, 30],
    ]);
    const band = byX(rings.level1);
    expect(band).toHaveLength(1);
    expect(band[0].x0).toBeCloseTo(10, 2);
    expect(band[0].x1).toBeCloseTo(33.04, 2);
    expect(band[0].y1 - band[0].y0).toBeCloseTo(5.04, 2);
    const bars = byX(rings.level2);
    expect(bars).toHaveLength(9);
    bars.forEach((b, i) => {
      expect((b.x0 + b.x1) / 2).toBeCloseTo(10.864 + 2.664 * i, 2);
      expect(b.x1 - b.x0).toBeCloseTo(0.72, 2);
      expect(b.y1 - b.y0).toBeCloseTo(4.032, 2);
      expect(b.y0 - band[0].y0).toBeCloseTo(0.504, 2);
    });
    expect(tooWide(warnings)).toEqual([]);
  });

  it("centres a fare zone's bars on a line of any length, the same margin at both ends, and keeps them apart and inside the band round a corner", () => {
    const straight = byX(
      build('fare-zone', [
        [10, 30],
        [50, 30],
      ]).rings.level2
    );
    expect(straight).toHaveLength(15);
    const first = straight[0].x0 - 10;
    const last = 50 - straight[14].x1;
    expect(first).toBeCloseTo(last, 2);
    expect(first).toBeGreaterThanOrEqual(0.504);
    const corner = [
      [10, 10],
      [40, 10],
      [40, 40],
    ];
    // Twenty-two bars fit 60 mm; on the inside of the turn the eleventh
    // would touch the tenth, so it is left out and no two bars fuse.
    const bent = build('fare-zone', corner).rings.level2;
    expect(bent).toHaveLength(21);
    for (const bar of bent) {
      expect(regionArea([bar])).toBeCloseTo(0.72 * 4.032, 2);
    }
    const toLine = (p) =>
      Math.min(
        Math.max(Math.abs(p.y - 10), Math.max(0, p.x - 40), 0) +
          (p.x < 10 ? 10 - p.x : 0),
        Math.abs(p.x - 40) + Math.max(0, 10 - p.y) + Math.max(0, p.y - 40)
      );
    for (const p of bent.flat()) expect(toLine(p)).toBeLessThan(2.52);
  });

  it('draws a platform edge as beads 1.55 by 2.4 mm every 3.8435 mm, joined on the floor by necks 0.706 mm at their middle, a block 1.4 mm across on each bead on the symbol level', () => {
    const { rings, warnings } = build('platform-edge', [
      [10, 30],
      [49.985, 30],
    ]);
    expect(rings.level1).toHaveLength(1);
    const chain = boxOf(rings.level1[0]);
    expect(chain.x0).toBeCloseTo(10, 2);
    expect(chain.x1).toBeCloseTo(49.985, 2);
    expect(chain.y1 - chain.y0).toBeCloseTo(2.4, 2);
    // Each neck's middle, halfway between two beads, is 0.706 mm across.
    for (let i = 0; i < 10; i++) {
      const middle = 10 + 3.8435 * i + 1.55 + (3.8435 - 1.55) / 2;
      const ys = rings.level1[0]
        .filter((p) => Math.abs(p.x - middle) < 1e-3)
        .map((p) => p.y);
      expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(0.706, 2);
    }
    const blocks = byX(rings.level2);
    expect(blocks).toHaveLength(11);
    blocks.forEach((b, i) => {
      // The two end blocks stand 0.01 mm inside their bead, so no face of
      // the floor and the block only touch.
      const start = 10 + 3.8435 * i + (i === 0 ? 0.01 : 0);
      const end = 10 + 3.8435 * i + 1.55 - (i === 10 ? 0.01 : 0);
      expect(b.x0).toBeCloseTo(start, 2);
      expect(b.x1).toBeCloseTo(end, 2);
      expect(b.y1 - b.y0).toBeCloseTo(1.4, 2);
    });
    expect(tooWide(warnings)).toEqual([]);
  });
});

describe('the station symbols on a map', () => {
  const point = (id, cls, at, extra = {}) => ({
    id,
    class: cls,
    kind: 'point',
    at,
    on: true,
    ...extra,
  });
  const boxOf = (rings) => {
    const all = rings.flat();
    const xs = all.map((p) => p.x);
    const ys = all.map((p) => p.y);
    return [
      Math.max(...xs) - Math.min(...xs),
      Math.max(...ys) - Math.min(...ys),
    ];
  };
  const codes = (warnings, code) => warnings.filter((w) => w.code === code);

  it('draws them at their own sizes in every set, whatever size the set draws its symbols', () => {
    for (const set of [{}, settingsForSet('oregon-2012')]) {
      const sizeOf = (cls) => {
        const plan = emptyPlan(100, 80);
        plan.features.push(point(cls, cls, [50, 40]));
        return boxOf(buildLevelRings(plan, set).rings.level2);
      };
      const [tw, th] = sizeOf('turnstile');
      expect(tw).toBeCloseTo(2, 2);
      expect(th).toBeCloseTo(4, 2);
      // A symbol's rings are joined in its unit box at a thousandth of the
      // box, 0.02 mm on an 18.5 mm symbol.
      const [ew, eh] = sizeOf('escalator');
      expect(ew).toBeCloseTo(18.469, 1);
      expect(eh).toBeCloseTo(10.034, 1);
      const [kw, kh] = sizeOf('ticket-machine');
      expect(kw).toBeCloseTo(15.75, 2);
      expect(kh).toBeCloseTo(15.75, 2);
    }
  });

  it('lets a row of turnstiles 4 mm apart stand without a warning, at their own 2 by 4 mm', () => {
    const plan = emptyPlan(100, 80);
    for (const [i, x] of [40, 44, 48, 52].entries()) {
      plan.features.push(point(`gate-${i}`, 'turnstile', [x, 40]));
    }
    const { warnings } = buildLevelRings(plan);
    expect(codes(warnings, 'symbol-too-small')).toEqual([]);
    expect(codes(warnings, 'too-close')).toEqual([]);
  });

  it('still warns when a turnstile stands close to anything else, or is drawn smaller than its own size', () => {
    const plan = emptyPlan(100, 80);
    plan.features.push(
      point('gate', 'turnstile', [40, 40]),
      point('cafe', 'landmark', [48, 40]),
      point('small', 'turnstile', [80, 40], { size: 3 })
    );
    const { warnings } = buildLevelRings(plan);
    expect(codes(warnings, 'too-close').map((w) => w.featureIds)).toEqual([
      ['gate', 'cafe'],
    ]);
    expect(codes(warnings, 'symbol-too-small').map((w) => w.featureId)).toEqual(
      ['small']
    );
  });

  it('turns a symbol to its angle: an escalator at 90 degrees points down the map, a turnstile at 90 lies across it', () => {
    const plan = emptyPlan(100, 80);
    plan.features.push(point('down', 'escalator', [50, 40], { angle: 90 }));
    const rings = buildLevelRings(plan).rings.level2;
    const [w, h] = boxOf(rings);
    expect(w).toBeCloseTo(10.034, 1);
    expect(h).toBeCloseTo(18.469, 1);
    // Its lowest point is the last chevron's tip, on the middle line.
    const lowest = rings.flat().reduce((a, p) => (p.y > a.y ? p : a));
    expect(lowest.x).toBeCloseTo(50, 1);
    const across = emptyPlan(100, 80);
    across.features.push(point('gate', 'turnstile', [50, 40], { angle: 90 }));
    const [tw, th] = boxOf(buildLevelRings(across).rings.level2);
    expect(tw).toBeCloseTo(4, 2);
    expect(th).toBeCloseTo(2, 2);
  });

  it("measures a point at its own size first, then its symbol's own size, then the set's", () => {
    const oregon = settingsForSet('oregon-2012');
    expect(pointSizeMm(point('e', 'escalator', [0, 0]))).toBeCloseTo(18.469, 3);
    expect(pointSizeMm(point('e', 'escalator', [0, 0]), oregon)).toBeCloseTo(
      18.469,
      3
    );
    expect(pointSizeMm(point('l', 'landmark', [0, 0]))).toBe(10);
    expect(pointSizeMm(point('l', 'landmark', [0, 0]), oregon)).toBe(13);
    expect(pointSizeMm(point('e', 'escalator', [0, 0], { size: 12 }))).toBe(12);
  });
});
