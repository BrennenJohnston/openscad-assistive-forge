/**
 * The route: sidewalks picked in walking order join end to end, their
 * length is read in meters, and on Apply the segments that meet become one
 * Route feature.
 *
 * @license GPL-3.0-or-later
 */
import { describe, it, expect } from 'vitest';
import {
  fitsRoute,
  routeLengthM,
  joinRoute,
  ROUTE_TOLERANCE_MM,
} from '../../src/js/tactile-map/route.js';

const seg = (a, b) => [a, b];

describe('fitsRoute', () => {
  it('takes anything onto an empty route, as it is', () => {
    expect(fitsRoute([], seg([5, 5], [10, 5]))).toEqual([
      [5, 5],
      [10, 5],
    ]);
  });

  it('accepts a candidate whose first point lies within 2 mm of the route end', () => {
    const route = [seg([0, 0], [10, 0])];
    expect(fitsRoute(route, seg([11.5, 0.5], [20, 0]))).toEqual([
      [11.5, 0.5],
      [20, 0],
    ]);
    expect(ROUTE_TOLERANCE_MM).toBe(2);
  });

  it('reverses a candidate whose last point lies at the route end', () => {
    const route = [seg([0, 0], [10, 0])];
    expect(
      fitsRoute(route, [
        [20, 0],
        [15, 1],
        [10, 0],
      ])
    ).toEqual([
      [10, 0],
      [15, 1],
      [20, 0],
    ]);
  });

  it('refuses a candidate that touches neither end', () => {
    const route = [seg([0, 0], [10, 0])];
    expect(fitsRoute(route, seg([13, 0], [20, 0]))).toBeNull();
    expect(fitsRoute(route, seg([20, 0], [13, 0]))).toBeNull();
  });

  it('refuses a shape without points', () => {
    expect(fitsRoute([], null)).toBeNull();
    expect(fitsRoute([], [[1, 1]])).toBeNull();
  });
});

describe('routeLengthM', () => {
  it('sums the segments and divides by the millimeters per meter', () => {
    const route = [seg([0, 0], [30, 0]), seg([30, 0], [30, 40])];
    expect(routeLengthM(route, 0.96)).toBeCloseTo(70 / 0.96, 3);
    expect(routeLengthM([], 0.96)).toBe(0);
    expect(routeLengthM(route, 0)).toBe(0);
  });
});

describe('joinRoute', () => {
  const line = (id, points, extra = {}) => ({
    id,
    class: 'route',
    kind: 'line',
    points,
    on: true,
    ...extra,
  });

  it('merges three touching route lines into one Route feature, in walking order, and leaves the rest alone', () => {
    const features = [
      {
        id: 'w',
        class: 'wall',
        kind: 'line',
        points: [
          [0, 50],
          [50, 50],
        ],
        on: true,
      },
      line('a', [
        [0, 0],
        [10, 0],
      ]),
      { id: 'p', class: 'entrance', kind: 'point', at: [5, 5], on: true },
      line('c', [
        [30, 0],
        [20, 0],
      ]),
      line('b', [
        [10, 0],
        [20, 0],
      ]),
    ];
    const out = joinRoute(features);
    expect(out.map((f) => f.id)).toEqual(['w', 'route-1', 'p']);
    const route = out[1];
    expect(route.class).toBe('route');
    expect(route.kind).toBe('line');
    expect(route.on).toBe(true);
    expect(route.points).toEqual([
      [0, 0],
      [10, 0],
      [20, 0],
      [30, 0],
    ]);
    expect(features[1].points).toEqual([
      [0, 0],
      [10, 0],
    ]);
  });

  it('leaves a gap unmerged: two Route features', () => {
    const features = [
      line('a', [
        [0, 0],
        [10, 0],
      ]),
      line('b', [
        [10, 0],
        [20, 0],
      ]),
      line('c', [
        [25, 0],
        [40, 0],
      ]),
    ];
    const out = joinRoute(features);
    expect(out.map((f) => f.id)).toEqual(['route-1', 'route-2']);
    expect(out[0].points).toEqual([
      [0, 0],
      [10, 0],
      [20, 0],
    ]);
    expect(out[1].points).toEqual([
      [25, 0],
      [40, 0],
    ]);
  });

  it('skips route lines that are off and returns the same list when nothing is a route', () => {
    const features = [
      line(
        'a',
        [
          [0, 0],
          [10, 0],
        ],
        { on: false }
      ),
      {
        id: 'k',
        class: 'walkway',
        kind: 'line',
        points: [
          [0, 0],
          [1, 1],
        ],
        on: true,
      },
    ];
    expect(joinRoute(features)).toEqual(features);
  });
});
