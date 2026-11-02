/**
 * A draft map plan from OpenStreetMap elements: the mapping of the class
 * table's osm lists, everything off but the sidewalks near the address and
 * the landmarks ticked, clipped to the map, the You are here point in the
 * middle.
 *
 * The fixture is twenty elements around 47.6, -122.33 placed in meters
 * from the center; the map is 480 x 360 mm at a 250 m radius, so one meter
 * is 0.96 mm and the box reaches 250 m east and west, 187.5 m north and
 * south.
 *
 * @license GPL-3.0-or-later
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  draftPlan,
  DRAFT_LIMIT,
} from '../../src/js/tactile-map/plan-from-osm.js';
import { SHAPE_LIST_CAP } from '../../src/js/svg-preparer.js';
import { scaleChoice, nearestRule } from '../../src/js/tactile-map/scales.js';
import { pullTiles, TILE_URL } from '../../src/js/tactile-map/osm-tiles.js';
import { projectLatLon, toMm } from '../../src/js/tactile-map/osm-geometry.js';
import {
  MAP_CLASSES,
  ROAD_WIDTHS_M,
} from '../../src/js/tactile-map/map-classes.js';
import { validatePlan } from '../../src/js/tactile-map/plan.js';
import { buildLevelRings } from '../../src/js/tactile-map/levels-svg.js';

const CENTER = { lat: 47.6, lon: -122.33 };
const M_PER_DEG_LAT = 110540;
const M_PER_DEG_LON = 111320 * Math.cos((CENTER.lat * Math.PI) / 180);
/** A point east and north of the center, in meters, as lat and lon. */
const at = (e, n) => ({
  lat: CENTER.lat + n / M_PER_DEG_LAT,
  lon: CENTER.lon + e / M_PER_DEG_LON,
});
const way = (id, tags, points) => ({
  type: 'way',
  id,
  tags,
  geometry: points.map(([e, n]) => at(e, n)),
});
const node = (id, tags, [e, n]) => ({ type: 'node', id, tags, ...at(e, n) });
const K = 0.96;
const X = (e) => 240 + e * K;
const Y = (n) => 180 - n * K;

const ELEMENTS = [
  way(1, { highway: 'footway', footway: 'sidewalk', name: 'Near Walk' }, [
    [-50, 20],
    [50, 20],
  ]),
  way(2, { highway: 'footway', footway: 'sidewalk' }, [
    [180, -40],
    [220, 40],
  ]),
  way(3, { highway: 'footway', footway: 'crossing' }, [
    [50, 20],
    [56, 20],
  ]),
  way(4, { building: 'yes', name: 'The Hall' }, [
    [-40, -60],
    [-20, -60],
    [-20, -40],
    [-40, -40],
    [-40, -60],
  ]),
  node(5, { highway: 'bus_stop', public_transport: 'platform' }, [10, 40]),
  way(6, { highway: 'steps' }, [
    [0, -10],
    [0, -30],
  ]),
  way(7, { highway: 'residential', width: '8', name: 'Pine St' }, [
    [-200, 100],
    [200, 100],
  ]),
  node(8, { shop: 'bakery', name: 'Corner Bakery' }, [30, 30]),
  way(9, { leisure: 'park', name: 'Green' }, [
    [100, -150],
    [140, -150],
    [140, -110],
    [100, -110],
    [100, -150],
  ]),
  way(10, { highway: 'footway', footway: 'sidewalk' }, [
    [200, -100],
    [300, -100],
  ]),
  node(11, { entrance: 'main' }, [-15, 5]),
  node(12, { highway: 'crossing', crossing: 'marked' }, [-50, 20]),
  node(13, { amenity: 'bench' }, [20, -5]),
  node(14, { amenity: 'cafe', name: 'Bean' }, [70, 70]),
  node(15, { amenity: 'bicycle_parking' }, [75, 75]),
  way(16, { railway: 'tram' }, [
    [-100, -120],
    [100, -120],
  ]),
  way(17, { highway: 'path', foot: 'yes' }, [
    [-30, 60],
    [30, 60],
  ]),
  way(18, { highway: 'path' }, [
    [-30, 70],
    [30, 70],
  ]),
  way(19, { highway: 'service' }, [
    [-100, -150],
    [-100, -50],
  ]),
  node(20, { note: 'nothing a map reads' }, [5, 5]),
];

const DRAFT = () =>
  draftPlan({
    elements: ELEMENTS,
    center: CENTER,
    radiusM: 250,
    landmarks: ['entrance', 'transit-stop'],
    size: { w: 480, h: 360 },
    place: { name: 'Pine Street Station, Seattle, Washington', ...CENTER },
  });

const byId = (plan, id) => plan.features.find((f) => f.id === id);
const close = (a, b) => expect(a).toBeCloseTo(b, 2);

describe("the class table's osm lists", () => {
  it('name a tag and an element kind for every class that reads OpenStreetMap, and the nine road widths', () => {
    const withOsm = MAP_CLASSES.filter((c) => Array.isArray(c.osm));
    expect(withOsm.map((c) => c.key)).toEqual([
      'curb',
      'walkway',
      'crossing',
      'track',
      'traffic-island',
      'area',
      'stairs',
      'entrance',
      'landmark',
      'transit-stop',
      'curb-ramp',
      'raised-curb',
    ]);
    for (const c of withOsm) {
      for (const rule of c.osm) {
        expect(typeof rule.tag).toBe('string');
        expect(['way', 'closed', 'node']).toContain(rule.kind);
      }
    }
    expect(ROAD_WIDTHS_M).toEqual({
      motorway: 14,
      trunk: 12,
      primary: 10,
      secondary: 9,
      tertiary: 8,
      unclassified: 7,
      residential: 6,
      living_street: 5,
      service: 4,
    });
  });
});

describe('draftPlan', () => {
  it('makes a plan the validator and the levels builder accept, titled after the place', () => {
    const { plan } = DRAFT();
    expect(validatePlan(plan)).toEqual({ ok: true, errors: [] });
    expect(plan.size).toEqual({ w: 480, h: 360 });
    expect(plan.meta.title).toBe('Pine Street Station');
    expect(plan.meta.geo).toEqual({ center: CENTER, mmPerM: 0.96 });
    const { warnings } = buildLevelRings(plan);
    expect(warnings.filter((w) => w.code === 'line-too-wide')).toEqual([]);
  });

  it('turns the sidewalk near the address on and the far one off, projected north up', () => {
    const { plan } = DRAFT();
    const near = byId(plan, 'osm-way-1');
    expect(near.class).toBe('walkway');
    expect(near.kind).toBe('line');
    expect(near.on).toBe(true);
    expect(near.name).toBe('Near Walk');
    close(near.points[0][0], X(-50));
    close(near.points[0][1], Y(20));
    close(near.points[1][0], X(50));
    const far = byId(plan, 'osm-way-2');
    expect(far.class).toBe('walkway');
    expect(far.on).toBe(false);
  });

  it("turns a crossing touching an on walkway's end on, as a line for a way and a point for a node", () => {
    const { plan } = DRAFT();
    const crossingWay = byId(plan, 'osm-way-3');
    expect([crossingWay.class, crossingWay.kind, crossingWay.on]).toEqual([
      'crossing',
      'line',
      true,
    ]);
    const crossingNode = byId(plan, 'osm-node-12');
    expect([crossingNode.class, crossingNode.kind, crossingNode.on]).toEqual([
      'crossing',
      'point',
      true,
    ]);
    close(crossingNode.at[0], X(-50));
    close(crossingNode.at[1], Y(20));
  });

  it('makes a building and a park areas, off', () => {
    const { plan } = DRAFT();
    const hall = byId(plan, 'osm-way-4');
    expect([hall.class, hall.kind, hall.on, hall.name]).toEqual([
      'area',
      'area',
      false,
      'The Hall',
    ]);
    expect(hall.ring.length).toBeGreaterThanOrEqual(4);
    const park = byId(plan, 'osm-way-9');
    expect([park.class, park.kind, park.on]).toEqual(['area', 'area', false]);
  });

  it('makes the bus stop a transit stop and the entrance an entrance, on when ticked and off when not', () => {
    const { plan } = DRAFT();
    const stop = byId(plan, 'osm-node-5');
    expect([stop.class, stop.kind, stop.on]).toEqual([
      'transit-stop',
      'point',
      true,
    ]);
    const door = byId(plan, 'osm-node-11');
    expect([door.class, door.kind, door.on]).toEqual([
      'entrance',
      'point',
      true,
    ]);
    const { plan: none } = draftPlan({
      elements: ELEMENTS,
      center: CENTER,
      radiusM: 250,
      landmarks: [],
      size: { w: 480, h: 360 },
    });
    expect(byId(none, 'osm-node-5').on).toBe(false);
    expect(byId(none, 'osm-node-11').on).toBe(false);
  });

  it('gives a steps way a stairs point at its middle and a walkway line', () => {
    const { plan } = DRAFT();
    const stairs = byId(plan, 'osm-way-6-stairs');
    expect([stairs.class, stairs.kind, stairs.on]).toEqual([
      'stairs',
      'point',
      false,
    ]);
    close(stairs.at[0], X(0));
    close(stairs.at[1], Y(-20));
    const walk = byId(plan, 'osm-way-6');
    expect([walk.class, walk.kind, walk.on]).toEqual(['walkway', 'line', true]);
  });

  it("gives a road two curb lines half its width each side, off; a service road the table's width", () => {
    const { plan } = DRAFT();
    const left = byId(plan, 'osm-way-7-left');
    const right = byId(plan, 'osm-way-7-right');
    for (const curb of [left, right]) {
      expect([curb.class, curb.kind, curb.on]).toEqual(['curb', 'line', false]);
      expect(curb.points).toHaveLength(2);
      close(curb.points[0][0], X(-200));
      close(curb.points[1][0], X(200));
    }
    const ys = [left.points[0][1], right.points[0][1]].sort((a, b) => a - b);
    close(ys[0], Y(100) - 4 * K);
    close(ys[1], Y(100) + 4 * K);
    const service = byId(plan, 'osm-way-19-left');
    const serviceOther = byId(plan, 'osm-way-19-right');
    const xs = [service.points[0][0], serviceOther.points[0][0]].sort(
      (a, b) => a - b
    );
    close(xs[1] - xs[0], 4 * K);
  });

  it("clips a line at the map's edge and drops what lies beyond", () => {
    const { plan } = DRAFT();
    const edge = byId(plan, 'osm-way-10');
    expect(edge.on).toBe(false);
    for (const [x] of edge.points) expect(x).toBeLessThanOrEqual(480);
    close(edge.points[0][0], X(200));
    close(edge.points[edge.points.length - 1][0], 480);
    close(edge.points[0][1], Y(-100));
  });

  it('keeps shops and benches only when ticked, a named amenity as an off landmark, and nothing for the rest', () => {
    const { plan } = DRAFT();
    expect(byId(plan, 'osm-node-8')).toBeUndefined();
    expect(byId(plan, 'osm-node-13')).toBeUndefined();
    const cafe = byId(plan, 'osm-node-14');
    expect([cafe.class, cafe.kind, cafe.on, cafe.name]).toEqual([
      'landmark',
      'point',
      false,
      'Bean',
    ]);
    expect(byId(plan, 'osm-node-15')).toBeUndefined();
    expect(byId(plan, 'osm-way-18')).toBeUndefined();
    expect(byId(plan, 'osm-node-20')).toBeUndefined();
    const { plan: ticked } = draftPlan({
      elements: ELEMENTS,
      center: CENTER,
      radiusM: 250,
      landmarks: ['shop', 'bench'],
      size: { w: 480, h: 360 },
    });
    const shop = byId(ticked, 'osm-node-8');
    expect([shop.class, shop.on, shop.name]).toEqual([
      'landmark',
      true,
      'Corner Bakery',
    ]);
    expect(byId(ticked, 'osm-node-13').on).toBe(true);
  });

  it('makes the tram a track and the foot path a walkway, both off', () => {
    const { plan } = DRAFT();
    expect(byId(plan, 'osm-way-16').class).toBe('track');
    expect(byId(plan, 'osm-way-16').on).toBe(false);
    expect(byId(plan, 'osm-way-17').class).toBe('walkway');
    expect(byId(plan, 'osm-way-17').on).toBe(false);
  });

  it('puts the You are here point in the middle, on, and counts what it drew', () => {
    const { plan, counts } = DRAFT();
    const here = byId(plan, 'you-are-here');
    expect([here.class, here.kind, here.on, here.at]).toEqual([
      'you-are-here',
      'point',
      true,
      [240, 180],
    ]);
    expect(counts).toEqual({
      walkways: 5,
      crossings: 2,
      buildings: 1,
      landmarks: 4,
      total: 19,
      on: 7,
      leftOut: 0,
    });
    expect(plan.features.filter((f) => f.on).length).toBe(counts.on);
  });

  it('drops a line under 3 mm and an area under 10 square millimeters', () => {
    const tiny = [
      way(30, { highway: 'footway' }, [
        [0, 0],
        [2, 0],
      ]),
      way(31, { building: 'yes' }, [
        [10, 10],
        [12, 10],
        [12, 12],
        [10, 12],
        [10, 10],
      ]),
    ];
    const { plan } = draftPlan({
      elements: tiny,
      center: CENTER,
      radiusM: 250,
      size: { w: 480, h: 360 },
    });
    expect(plan.features.map((f) => f.id)).toEqual(['you-are-here']);
  });
});

describe('a draft at a named scale', () => {
  // A residential street (6 m) and a primary road (10 m) east to west, a
  // sidewalk beside the address, a marked and an unmarked crossing.
  const STREETS = [
    way(10, { highway: 'residential', name: 'Lane' }, [
      [-200, 40],
      [200, 40],
    ]),
    way(11, { highway: 'primary', name: 'Avenue' }, [
      [-200, -60],
      [200, -60],
    ]),
    way(12, { highway: 'footway', footway: 'sidewalk', name: 'Walk' }, [
      [-60, 10],
      [60, 10],
    ]),
    way(13, { highway: 'footway', footway: 'crossing', crossing: 'marked' }, [
      [0, 10],
      [0, 34],
    ]),
    way(14, { highway: 'footway', footway: 'crossing', crossing: 'unmarked' }, [
      [60, 10],
      [60, 34],
    ]),
  ];
  const draftAt = (key, ratio) =>
    draftPlan({
      elements: STREETS,
      center: CENTER,
      scale: {
        ratio: ratio ?? scaleChoice(key).ratio,
        rules: scaleChoice(key)?.rules ?? nearestRule(ratio),
      },
      landmarks: [],
      size: { w: 480, h: 360 },
    }).plan;
  const byId = (plan, prefix) =>
    plan.features.filter(
      (f) => f.id === prefix || f.id.startsWith(`${prefix}-`)
    );

  it('takes its millimeters per meter from the ratio: 1 at 1:1000, 0.25 at 1:4000', () => {
    expect(draftAt('block').meta.geo.mmPerM).toBe(1);
    expect(draftAt('neighborhood').meta.geo.mmPerM).toBe(0.25);
    expect(draftAt('building').meta.geo.mmPerM).toBe(2);
    // The sidewalk 10 m north of the address, 60 m each way: 120 mm long at 1:1000.
    const walk = byId(draftAt('block'), 'osm-way-12')[0];
    expect(walk.points[0][0]).toBeCloseTo(240 - 60, 1);
    expect(walk.points[walk.points.length - 1][0]).toBeCloseTo(240 + 60, 1);
  });

  it('draws every street as an off pair of curb lines near a block, and as one line, on, over a neighborhood', () => {
    const block = draftAt('block');
    expect(byId(block, 'osm-way-10').map((f) => f.id)).toEqual([
      'osm-way-10-left',
      'osm-way-10-right',
    ]);
    expect(byId(block, 'osm-way-10').every((f) => !f.on)).toBe(true);
    const hood = draftAt('neighborhood');
    const lane = byId(hood, 'osm-way-10');
    expect(lane.map((f) => [f.id, f.class, f.on])).toEqual([
      ['osm-way-10', 'curb', true],
    ]);
    // Side paths and crossings leave: no sidewalk, no crossing.
    expect(byId(hood, 'osm-way-12')).toEqual([]);
    expect(hood.features.filter((f) => f.class === 'crossing')).toEqual([]);
    expect(hood.features.filter((f) => f.class === 'walkway' && f.on)).toEqual(
      []
    );
  });

  it('draws a street as one line over a few blocks where its curbs would fall 3 mm apart or closer', () => {
    const blocks = draftAt('blocks');
    // 6 m at 1:2000 is 3 mm: one line; 10 m is 5 mm: a pair.
    expect(byId(blocks, 'osm-way-10').map((f) => f.id)).toEqual(['osm-way-10']);
    expect(byId(blocks, 'osm-way-11').map((f) => f.id)).toEqual([
      'osm-way-11-left',
      'osm-way-11-right',
    ]);
  });

  it('keeps a crossing marking near a building: an unmarked crossing dashed, a marked one in its ticks; one style at a block', () => {
    const near = draftAt('building');
    expect(byId(near, 'osm-way-13')[0].style).toBeUndefined();
    expect(byId(near, 'osm-way-14')[0].style).toBe('dashed');
    const block = draftAt('block');
    expect(byId(block, 'osm-way-14')[0].style).toBeUndefined();
  });

  it('starts the ticked landmarks on only where their symbols fit: every one near a block, transit stops over a few blocks, none over a neighborhood', () => {
    const marks = [
      ...STREETS,
      node(20, { entrance: 'main', name: 'Door' }, [10, 20]),
      node(
        21,
        { highway: 'bus_stop', public_transport: 'platform', name: 'Stop' },
        [-30, 20]
      ),
    ];
    const at = (key) =>
      draftPlan({
        elements: marks,
        center: CENTER,
        scale: { ratio: scaleChoice(key).ratio, rules: scaleChoice(key).rules },
        landmarks: ['entrance', 'transit-stop'],
        size: { w: 480, h: 360 },
      }).plan;
    const on = (plan, id) => plan.features.find((f) => f.id === id)?.on;
    expect([
      on(at('block'), 'osm-node-20'),
      on(at('block'), 'osm-node-21'),
    ]).toEqual([true, true]);
    expect([
      on(at('blocks'), 'osm-node-20'),
      on(at('blocks'), 'osm-node-21'),
    ]).toEqual([false, true]);
    expect([
      on(at('neighborhood'), 'osm-node-20'),
      on(at('neighborhood'), 'osm-node-21'),
    ]).toEqual([false, false]);
  });

  it('draws a custom ratio by the rules of the nearest named choice', () => {
    const custom = draftAt('custom', 3500);
    expect(custom.meta.geo.mmPerM).toBeCloseTo(1000 / 3500, 6);
    expect(byId(custom, 'osm-way-10').map((f) => f.id)).toEqual(['osm-way-10']);
  });
});

describe('a draft within the editor', () => {
  it('keeps every feature on and the off ones nearest the address, up to what the editor lists, and counts the rest', () => {
    // 1200 off sidewalks spiraling outward, all on the plate, and one on
    // sidewalk by the address.
    const elements = [];
    for (let i = 0; i < 1200; i += 1) {
      const r = 40 + i * 0.1;
      const a = (i * 137.5 * Math.PI) / 180;
      const e = r * Math.cos(a);
      const n = r * Math.sin(a);
      elements.push(
        way(1000 + i, { highway: 'footway', footway: 'sidewalk' }, [
          [e, n],
          [e + 6, n],
        ])
      );
    }
    elements.push(
      way(9, { highway: 'footway', footway: 'sidewalk' }, [
        [-10, 5],
        [10, 5],
      ])
    );
    const { plan, counts } = draftPlan({
      elements,
      center: CENTER,
      scale: { ratio: 1000, rules: scaleChoice('block').rules },
      landmarks: [],
      size: { w: 480, h: 360 },
    });
    expect(plan.features.length).toBe(DRAFT_LIMIT);
    expect(counts.total).toBe(DRAFT_LIMIT);
    expect(counts.leftOut).toBe(1201 + 1 - DRAFT_LIMIT);
    // The on sidewalk near the address stays; the kept off ones are the nearest.
    expect(plan.features.find((f) => f.id === 'osm-way-9').on).toBe(true);
    const kept = new Set(plan.features.map((f) => f.id));
    expect(kept.has('osm-way-1000')).toBe(true);
    expect(kept.has('osm-way-2199')).toBe(false);
  });

  it('lists no more than the editor works with', () => {
    expect(DRAFT_LIMIT).toBeLessThanOrEqual(SHAPE_LIST_CAP);
  });
});

describe('the pedestrian base near a building', () => {
  // A sidewalk 10 m north of the address, split where three crossings
  // leave it: a zebra, one with no markings, one painted in lines. Curb
  // nodes stand on the crossings as OpenStreetMap maps them; a traffic
  // island continues the unmarked crossing.
  const BASE = [
    way(20, { highway: 'footway', footway: 'sidewalk' }, [
      [-60, 10],
      [-40, 10],
    ]),
    way(21, { highway: 'footway', footway: 'sidewalk' }, [
      [-40, 10],
      [0, 10],
    ]),
    way(22, { highway: 'footway', footway: 'sidewalk' }, [
      [0, 10],
      [40, 10],
    ]),
    way(23, { highway: 'footway', footway: 'sidewalk' }, [
      [40, 10],
      [60, 10],
    ]),
    way(
      24,
      {
        highway: 'footway',
        footway: 'crossing',
        crossing: 'marked',
        'crossing:markings': 'zebra',
      },
      [
        [0, 10],
        [0, 34],
      ]
    ),
    way(
      25,
      {
        highway: 'footway',
        footway: 'crossing',
        crossing: 'uncontrolled',
        'crossing:markings': 'no',
      },
      [
        [40, 10],
        [40, 34],
      ]
    ),
    way(
      26,
      {
        highway: 'footway',
        footway: 'crossing',
        'crossing:markings': 'lines',
      },
      [
        [-40, 10],
        [-40, 34],
      ]
    ),
    way(27, { highway: 'footway', footway: 'traffic_island' }, [
      [40, 34],
      [40, 40],
    ]),
    node(31, { barrier: 'kerb', kerb: 'lowered' }, [0, 12]),
    node(32, { barrier: 'kerb', kerb: 'lowered' }, [0, 32]),
    node(33, { barrier: 'kerb', kerb: 'raised' }, [40, 12]),
    node(34, { barrier: 'kerb', kerb: 'lowered' }, [-40, 12]),
    // 2.5 m from the one before: 5 mm apart at 1:500, too close to read.
    node(35, { barrier: 'kerb', kerb: 'lowered' }, [-40, 14.5]),
    node(36, { barrier: 'kerb', kerb: 'flush' }, [-40, 30]),
    // On no line the draft shows.
    node(37, { barrier: 'kerb', kerb: 'lowered' }, [100, 60]),
    // On the sidewalk, at a driveway.
    node(38, { barrier: 'kerb', kerb: 'lowered' }, [20, 10]),
  ];
  const draftAt = (key) =>
    draftPlan({
      elements: BASE,
      center: CENTER,
      scale: { ratio: scaleChoice(key).ratio, rules: scaleChoice(key).rules },
      landmarks: [],
      size: { w: 480, h: 360 },
    });
  const one = (plan, id) => plan.features.find((f) => f.id === id);
  const at2 = (e, n) => [240 + e * 2, 180 - n * 2];

  it('draws curb ramps and raised curbs as symbols at their nodes, on where they stand on a sidewalk or crossing the draft shows and do not crowd', () => {
    const { plan, counts } = draftAt('building');
    const curbs = plan.features
      .filter((f) => f.class === 'curb-ramp' || f.class === 'raised-curb')
      .map((f) => [f.id, f.class, f.kind, f.on]);
    expect(curbs).toEqual([
      ['osm-node-31', 'curb-ramp', 'point', true],
      ['osm-node-32', 'curb-ramp', 'point', true],
      ['osm-node-33', 'raised-curb', 'point', true],
      ['osm-node-34', 'curb-ramp', 'point', true],
      ['osm-node-35', 'curb-ramp', 'point', false],
      ['osm-node-37', 'curb-ramp', 'point', false],
      ['osm-node-38', 'curb-ramp', 'point', true],
    ]);
    expect(one(plan, 'osm-node-31').at).toEqual(at2(0, 12));
    expect(one(plan, 'osm-node-33').at).toEqual(at2(40, 12));
    // A flush curb is neither a ramp nor a raised curb.
    expect(one(plan, 'osm-node-36')).toBeUndefined();
    // Curbs are not counted as landmarks.
    expect(counts.landmarks).toBe(0);
    expect(validatePlan(plan).ok).toBe(true);
    // The draft starts with no symbols too close to read.
    const { warnings } = buildLevelRings(plan);
    expect(warnings.filter((w) => w.code === 'too-close')).toEqual([]);
  });

  it('draws a crossing in its markings: zebra and lines in ticks, none dashed; a traffic island as its own line, on with its crossing', () => {
    const { plan } = draftAt('building');
    expect(one(plan, 'osm-way-24').style).toBeUndefined();
    expect(one(plan, 'osm-way-26').style).toBeUndefined();
    expect(one(plan, 'osm-way-25').style).toBe('dashed');
    expect(one(plan, 'osm-way-25').on).toBe(true);
    const island = one(plan, 'osm-way-27');
    expect([island.class, island.kind, island.on]).toEqual([
      'traffic-island',
      'line',
      true,
    ]);
  });

  it('leaves the curbs out from a block up, and keeps the island', () => {
    const { plan } = draftAt('block');
    expect(
      plan.features.filter(
        (f) => f.class === 'curb-ramp' || f.class === 'raised-curb'
      )
    ).toEqual([]);
    expect(one(plan, 'osm-way-27').class).toBe('traffic-island');
    expect(one(plan, 'osm-way-25').style).toBeUndefined();
  });

  it('reads the real tiles around the Gates Center at 1:500: curb ramps where the lowered curbs stand, a zebra in ticks; none at 1:1000', async () => {
    const tile = (x) =>
      readFileSync(`tests/fixtures/tactile-map/sourdough-15-${x}-11437.mvt`);
    const TILE = { 5251: tile(5251), 5252: tile(5252) };
    const fetch = vi.fn(async (url) => {
      const x = Object.keys(TILE).find(
        (k) =>
          url ===
          TILE_URL.replace('{z}', 15).replace('{x}', k).replace('{y}', 11437)
      );
      const bytes = x ? TILE[x] : new Uint8Array(0);
      return {
        ok: true,
        status: x ? 200 : 204,
        arrayBuffer: async () =>
          bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength
          ),
      };
    });
    const GATES = { lat: 47.652873, lon: -122.3044814 };
    const { elements } = await pullTiles({
      box: { south: 47.651, west: -122.308, north: 47.657, east: -122.295 },
      fetch,
    });
    const draft = (key) =>
      draftPlan({
        elements,
        center: GATES,
        scale: {
          ratio: scaleChoice(key).ratio,
          rules: scaleChoice(key).rules,
        },
        landmarks: ['entrance', 'transit-stop', 'crossing'],
        size: { w: 480, h: 360 },
      }).plan;
    const near = draft('building');
    const ramps = near.features.filter((f) => f.class === 'curb-ramp');
    expect(ramps.length).toBeGreaterThan(0);
    expect(ramps.some((f) => f.on)).toBe(true);
    const lowered = elements.filter(
      (e) => e.type === 'node' && e.tags.kerb === 'lowered'
    );
    for (const f of ramps) {
      const id = Number(f.id.replace('osm-node-', ''));
      const el = lowered.find((e) => e.id === id);
      expect(el).toBeTruthy();
      const [x, y] = toMm(projectLatLon(el.lat, el.lon, GATES), near.size, 2);
      expect(f.at[0]).toBeCloseTo(x, 2);
      expect(f.at[1]).toBeCloseTo(y, 2);
    }
    const zebra = elements.find(
      (e) =>
        e.type === 'way' &&
        /^zebra/.test(e.tags['crossing:markings'] || '') &&
        near.features.some((f) => f.id === `osm-way-${e.id}`)
    );
    expect(zebra).toBeTruthy();
    const drawn = near.features.find((f) => f.id === `osm-way-${zebra.id}`);
    expect([drawn.class, drawn.style]).toEqual(['crossing', undefined]);
    const block = draft('block');
    expect(
      block.features.filter(
        (f) => f.class === 'curb-ramp' || f.class === 'raised-curb'
      )
    ).toEqual([]);
  });
});
