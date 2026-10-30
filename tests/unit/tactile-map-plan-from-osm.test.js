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
import { describe, it, expect } from 'vitest';
import { draftPlan } from '../../src/js/tactile-map/plan-from-osm.js';
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
      'area',
      'stairs',
      'entrance',
      'landmark',
      'transit-stop',
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
