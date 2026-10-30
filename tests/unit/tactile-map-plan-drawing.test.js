/**
 * A map plan into the drawing editor and back by index: the drawing is one
 * path per feature in feature order, the analyzer lists them in that order,
 * and the rows that come back switch features on and off and change their
 * class without moving a point.
 *
 * @license GPL-3.0-or-later
 */
import { describe, it, expect } from 'vitest';
import {
  drawingFromPlan,
  applyRowsToPlan,
} from '../../src/js/tactile-map/plan-drawing.js';
import { analyzeSvg } from '../../src/js/svg-preparer.js';
import { ringsFromPathData } from '../../src/js/ring-geometry.js';
import { emptyPlan, validatePlan } from '../../src/js/tactile-map/plan.js';

function plan() {
  const p = emptyPlan(480, 360);
  p.meta.title = 'Pine Street Station';
  p.features.push(
    {
      id: 'osm-way-1',
      class: 'walkway',
      kind: 'line',
      name: 'Near Walk',
      points: [
        [100, 180],
        [200, 180],
      ],
      on: true,
    },
    {
      id: 'osm-way-4',
      class: 'area',
      kind: 'area',
      name: 'The Hall',
      ring: [
        [20, 20],
        [80, 20],
        [80, 80],
        [20, 80],
      ],
      holes: [
        [
          [40, 40],
          [40, 60],
          [60, 60],
          [60, 40],
        ],
      ],
      on: false,
    },
    {
      id: 'osm-node-5',
      class: 'transit-stop',
      kind: 'point',
      at: [300, 100],
      on: true,
    },
    {
      id: 'osm-way-7-left',
      class: 'curb',
      kind: 'line',
      points: [
        [48, 80],
        [432, 80],
        [432, 90],
      ],
      on: false,
    },
    {
      id: 'you-are-here',
      class: 'you-are-here',
      kind: 'point',
      name: 'You are here',
      at: [240, 180],
      on: true,
    },
    {
      id: 'loop',
      class: 'wall',
      kind: 'line',
      points: [
        [300, 250],
        [400, 250],
        [400, 330],
        [300, 330],
        [300, 250],
      ],
      on: false,
    }
  );
  return p;
}

const paths = (svg) => [...svg.matchAll(/<path\b[^>]*>/g)].map((m) => m[0]);
const attr = (tag, name) =>
  new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1] ?? null;
const boxOf = (d) => {
  const pts = ringsFromPathData(d).flat();
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return {
    x0: Math.min(...xs),
    x1: Math.max(...xs),
    y0: Math.min(...ys),
    y1: Math.max(...ys),
  };
};

describe('drawingFromPlan', () => {
  it('writes the map at its size and one path per feature, in order, named by data-feature, off features included', () => {
    const svg = drawingFromPlan(plan());
    expect(svg).toContain('viewBox="0 0 480 360"');
    expect(svg).toContain('width="480mm"');
    expect(svg).toContain('height="360mm"');
    const tags = paths(svg);
    expect(tags.map((t) => attr(t, 'data-feature'))).toEqual([
      'osm-way-1',
      'osm-way-4',
      'osm-node-5',
      'osm-way-7-left',
      'you-are-here',
      'loop',
    ]);
  });

  it('draws a line as its filled outline at the class width, an area with its holes, a point as its symbol', () => {
    const tags = paths(drawingFromPlan(plan()));
    const walk = boxOf(attr(tags[0], 'd'));
    expect(walk.x0).toBeCloseTo(100 - 0.75, 1);
    expect(walk.x1).toBeCloseTo(200 + 0.75, 1);
    expect(walk.y1 - walk.y0).toBeCloseTo(1.5, 1);
    const hall = attr(tags[1], 'd');
    expect(ringsFromPathData(hall)).toHaveLength(2);
    expect(attr(tags[1], 'fill-rule')).toBe('evenodd');
    const stop = boxOf(attr(tags[2], 'd'));
    expect(stop.x0).toBeGreaterThanOrEqual(295);
    expect(stop.x1).toBeLessThanOrEqual(305);
    expect(stop.y0).toBeGreaterThanOrEqual(95);
    expect(stop.y1).toBeLessThanOrEqual(105);
    const curb = boxOf(attr(tags[3], 'd'));
    expect(curb.y1 - curb.y0).toBeCloseTo(10 + 1.0, 1);
    const loop = ringsFromPathData(attr(tags[5], 'd'));
    expect(loop.length).toBeGreaterThanOrEqual(2);
  });

  it('comes back from the analyzer as one element per feature, in the same order', () => {
    const p = plan();
    const analysis = analyzeSvg(drawingFromPlan(p));
    expect(analysis.elements).toHaveLength(p.features.length);
    expect(
      analysis.elements.map((e) => e.element.getAttribute('data-feature'))
    ).toEqual(p.features.map((f) => f.id));
  });
});

describe('applyRowsToPlan', () => {
  it('switches a feature off keeping its class, switches one on with a new class, and moves no point', () => {
    const before = plan();
    const snapshot = JSON.parse(JSON.stringify(before));
    const regions = before.features.map((f, index) => ({
      key: `shape-${index}`,
      index,
      name: `Path ${index + 1}`,
      class: f.on ? f.class : 'ignore',
    }));
    regions[0].class = 'ignore';
    regions[1].class = 'area';
    regions[3].class = 'route';
    const after = applyRowsToPlan(before, regions);
    expect(after).not.toBe(before);
    expect(before).toEqual(snapshot);
    expect(after.features[0].on).toBe(false);
    expect(after.features[0].class).toBe('walkway');
    expect(after.features[1].on).toBe(true);
    expect(after.features[1].class).toBe('area');
    expect(after.features[3].on).toBe(true);
    expect(after.features[3].class).toBe('route');
    expect(after.features[2].on).toBe(true);
    expect(after.features[5].on).toBe(false);
    for (const [i, f] of after.features.entries()) {
      const was = snapshot.features[i];
      expect(f.id).toBe(was.id);
      expect(f.points ?? null).toEqual(was.points ?? null);
      expect(f.ring ?? null).toEqual(was.ring ?? null);
      expect(f.holes ?? null).toEqual(was.holes ?? null);
      expect(f.at ?? null).toEqual(was.at ?? null);
    }
    expect(after.meta).toEqual(before.meta);
    expect(validatePlan(after).ok).toBe(true);
  });

  it('ignores a region whose index names no feature', () => {
    const before = plan();
    const after = applyRowsToPlan(before, [{ index: 99, class: 'wall' }]);
    expect(after.features).toEqual(before.features);
  });
});
