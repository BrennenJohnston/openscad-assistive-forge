/**
 * The walking graph of a map's area and the walk between two places: the
 * ways a person may walk joined where they share a point, streets only as a
 * fallback, steps allowed and marked unless a walk avoids them, and a place
 * that is a building reached by its doors.
 *
 * The numbers are the reference walk on the fixture (the Husky Union
 * Building to the Bill & Melinda Gates Center at the University of
 * Washington), computed apart from this code by a Python script with the
 * same rules. Map data from OpenStreetMap contributors, ODbL.
 *
 * @license GPL-3.0-or-later
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  buildWalkGraph,
  shortestWalk,
  placeCandidates,
  walkBetween,
  pointKey,
  ROAD_FACTOR,
} from '../../src/js/tactile-map/walk-graph.js';
import { trimElement } from '../../src/js/tactile-map/osm-geometry.js';

const FIXTURE = JSON.parse(
  readFileSync('tests/fixtures/tactile-map/uw-hub-gates.json', 'utf8')
);
const ELEMENTS = FIXTURE.elements.map(trimElement).filter(Boolean);
const HUB = { lat: 47.6553685, lon: -122.3051021 };
const GATES = { lat: 47.652873, lon: -122.3044814 };
const HUB_SOUTH_DOOR = '47.6549148,-122.3051535';
const GATES_MAIN_DOOR = '47.6531263,-122.3047276';
const REFERENCE_WAYS = [
  463804371, 463804372, 463804370, 463804373, 446932881, 476761629, 436426110,
  476761630, 967264640, 475704336, 475746060, 475746063, 449757062, 1272903342,
  1272903348,
];

/** A way from points given as [lat, lon]. */
const way = (id, tags, pts) => ({
  type: 'way',
  id,
  tags,
  geometry: pts.map(([lat, lon]) => ({ lat, lon })),
});

describe('the walking graph', () => {
  it('keeps the foot and access tags a walk needs', () => {
    const el = trimElement(
      way(1, { highway: 'path', foot: 'designated', access: 'no' }, [
        [0, 0],
        [0, 0.001],
      ])
    );
    expect(el.tags).toMatchObject({ foot: 'designated', access: 'no' });
  });

  it('joins the fixture ways where they share a point: 1107 points', () => {
    const graph = buildWalkGraph(ELEMENTS);
    expect(graph.points.size).toBe(1107);
  });

  it('finds the reference walk door to door: 243.6 m over 15 ways, the steps and the crossing on it', () => {
    const graph = buildWalkGraph(ELEMENTS);
    const walk = shortestWalk(graph, [HUB_SOUTH_DOOR], [GATES_MAIN_DOOR]);
    expect(walk.lengthM).toBeGreaterThan(243.1);
    expect(walk.lengthM).toBeLessThan(244.1);
    expect(walk.ways).toEqual(REFERENCE_WAYS);
    expect(walk.steps).toEqual([463804370]);
    expect(walk.crossings).toEqual([436426110]);
    expect(pointKey(walk.points[0].lat, walk.points[0].lon)).toBe(
      HUB_SOUTH_DOOR
    );
    const last = walk.points[walk.points.length - 1];
    expect(pointKey(last.lat, last.lon)).toBe(GATES_MAIN_DOOR);
  });

  it('avoids the steps when asked, leaving by whichever HUB door then makes the walk shortest: 260.9 m over 12 ways, no steps', () => {
    const walk = walkBetween({
      elements: ELEMENTS,
      from: HUB,
      to: GATES,
      avoidSteps: true,
    });
    expect(walk.lengthM).toBeGreaterThan(260.4);
    expect(walk.lengthM).toBeLessThan(261.4);
    expect(walk.ways).toHaveLength(12);
    expect(walk.steps).toEqual([]);
  });

  it('takes a street only where no footway joins the places, and never a way closed to people on foot', () => {
    // A to C: a footway bending through B, or a street straight across.
    const A = [0, 0];
    const B = [0.0005, 0.0005];
    const C = [0, 0.001];
    const street = way(2, { highway: 'residential' }, [A, C]);
    const footway = way(1, { highway: 'footway' }, [A, B, C]);
    const g1 = buildWalkGraph([footway, street]);
    expect(shortestWalk(g1, [pointKey(...A)], [pointKey(...C)]).ways).toEqual([
      1,
    ]);
    const closed = way(3, { highway: 'footway', foot: 'no' }, [A, B, C]);
    const g2 = buildWalkGraph([closed, street]);
    const walk = shortestWalk(g2, [pointKey(...A)], [pointKey(...C)]);
    expect(walk.ways).toEqual([2]);
    // 0.001 degrees of longitude at the equator: 111.32 m.
    expect(walk.lengthM).toBeCloseTo(111.32, 1);
    expect(ROAD_FACTOR).toBe(3);
  });

  it('says there is no walk when nothing joins the places', () => {
    const g = buildWalkGraph([
      way(1, { highway: 'footway' }, [
        [0, 0],
        [0, 0.001],
      ]),
      way(2, { highway: 'footway' }, [
        [1, 1],
        [1, 1.001],
      ]),
    ]);
    expect(shortestWalk(g, [pointKey(0, 0)], [pointKey(1, 1.001)])).toBeNull();
  });
});

describe('where a place starts', () => {
  it('a building starts at its doors within 3 m of its outline, and ends at its main door when it has one', () => {
    const graph = buildWalkGraph(ELEMENTS);
    const from = placeCandidates(graph, ELEMENTS, HUB, 'start');
    expect(from.building).toBe('Husky Union Building');
    expect(from.keys).toHaveLength(7);
    expect(from.keys).toContain(HUB_SOUTH_DOOR);
    const to = placeCandidates(graph, ELEMENTS, GATES, 'end');
    expect(to.building).toBe('Bill & Melinda Gates Center');
    expect(to.keys).toEqual([GATES_MAIN_DOOR]);
  });

  it('a point outside any building starts at the nearest point of the graph', () => {
    const graph = buildWalkGraph(ELEMENTS);
    const c = placeCandidates(
      graph,
      ELEMENTS,
      { lat: 47.6544332, lon: -122.3050738 },
      'start'
    );
    expect(c.building).toBeNull();
    expect(c.keys).toHaveLength(1);
    expect(graph.points.has(c.keys[0])).toBe(true);
  });

  it('walks from the HUB to the Gates Center, leaving by the door that makes the walk shortest', () => {
    const walk = walkBetween({ elements: ELEMENTS, from: HUB, to: GATES });
    expect(walk.lengthM).toBeGreaterThan(243.1);
    expect(walk.lengthM).toBeLessThan(244.1);
    expect(walk.ways).toEqual(REFERENCE_WAYS);
    expect(walk.from.building).toBe('Husky Union Building');
    expect(walk.to.building).toBe('Bill & Melinda Gates Center');
  });
});
