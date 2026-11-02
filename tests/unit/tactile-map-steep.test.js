/**
 * Steep sidewalks: a way's incline from the map data where it gives a
 * number, otherwise heights read along every on walkway through the map's
 * scale, smoothed over 30 m; the runs steeper than the grade become Steep
 * sidewalk features pointing uphill; the grade keeps to its range.
 *
 * @license GPL-3.0-or-later
 */
import { describe, it, expect, vi } from 'vitest';
import {
  markSteep,
  inclinePct,
  inclinesOf,
  needsTerrain,
  GRADE_MIN_PCT,
  GRADE_MAX_PCT,
} from '../../src/js/tactile-map/steep.js';
import { emptyPlan, validatePlan } from '../../src/js/tactile-map/plan.js';

const CENTER = { lat: 47.6, lon: -122.33 };
const M_PER_DEG_LON = 111320 * Math.cos((CENTER.lat * Math.PI) / 180);
/** Meters east of the center from a longitude. */
const eastOf = (lon) => (lon - CENTER.lon) * M_PER_DEG_LON;

/** A plan at one millimeter per meter with one 100 m walkway running east from the middle. */
function plan() {
  const p = emptyPlan(480, 360);
  p.meta.geo = { center: CENTER, mmPerM: 1 };
  p.features.push(
    {
      id: 'osm-way-1',
      class: 'walkway',
      kind: 'line',
      name: 'Pine Walk',
      points: [
        [240, 180],
        [340, 180],
      ],
      on: true,
    },
    {
      id: 'osm-way-2',
      class: 'walkway',
      kind: 'line',
      points: [
        [240, 200],
        [340, 200],
      ],
      on: false,
    },
    {
      id: 'you-are-here',
      class: 'you-are-here',
      kind: 'point',
      at: [240, 180],
      on: true,
    }
  );
  return p;
}

describe('markSteep', () => {
  it('marks a 100 m walkway up a 10 percent plane as one steep run, uphill at its far end', () => {
    const elevationAt = (lat, lon) => 100 + eastOf(lon) * 0.1;
    const { plan: out, steepCount } = markSteep(plan(), {
      elevationAt,
      gradePct: 5,
    });
    expect(steepCount).toBe(1);
    const steep = out.features.filter((f) => f.class === 'steep');
    expect(steep).toHaveLength(1);
    const run = steep[0];
    expect(run.kind).toBe('line');
    expect(run.style).toBe('chevrons');
    expect(run.uphill).toBe('end');
    expect(run.on).toBe(true);
    expect(run.id).toBe('osm-way-1-steep-1');
    expect(run.points).toHaveLength(11);
    expect(run.points[0][0]).toBeCloseTo(240, 3);
    expect(run.points[10][0]).toBeCloseTo(340, 3);
    expect(run.points.every(([, y]) => Math.abs(y - 180) < 1e-6)).toBe(true);
    // The off walkway is not read; the rest of the plan is untouched.
    expect(out.features.filter((f) => f.class === 'walkway')).toHaveLength(2);
    expect(validatePlan(out).ok).toBe(true);
  });

  it('points the chevrons at the start when the walkway runs downhill', () => {
    const elevationAt = (lat, lon) => 100 - eastOf(lon) * 0.08;
    const { plan: out } = markSteep(plan(), { elevationAt, gradePct: 5 });
    const run = out.features.find((f) => f.class === 'steep');
    expect(run.uphill).toBe('start');
  });

  it('marks nothing on a flat walkway and leaves the plan as it was', () => {
    const before = plan();
    const { plan: out, steepCount } = markSteep(before, {
      elevationAt: () => 100,
      gradePct: 5,
    });
    expect(steepCount).toBe(0);
    expect(out.features).toEqual(before.features);
  });

  it('smooths a one-sample spike of 2 m away over 30 m', () => {
    const elevationAt = (lat, lon) =>
      Math.abs(eastOf(lon) - 50) < 1 ? 102 : 100;
    const { steepCount } = markSteep(plan(), { elevationAt, gradePct: 5 });
    expect(steepCount).toBe(0);
  });

  it('skips a walkway whose heights are missing, and a plan with no scale', () => {
    const { steepCount } = markSteep(plan(), {
      elevationAt: () => null,
      gradePct: 5,
    });
    expect(steepCount).toBe(0);
    const bare = emptyPlan(480, 360);
    bare.features.push(plan().features[0]);
    const { plan: out } = markSteep(bare, {
      elevationAt: () => 0,
      gradePct: 5,
    });
    expect(out.features).toHaveLength(1);
  });

  it('refuses a grade outside 3 to 12 percent in a sentence', () => {
    expect(GRADE_MIN_PCT).toBe(3);
    expect(GRADE_MAX_PCT).toBe(12);
    expect(() =>
      markSteep(plan(), { elevationAt: () => 100, gradePct: 2 })
    ).toThrow('The steep grade is 2 %; it must be between 3 and 12 %.');
    expect(() =>
      markSteep(plan(), { elevationAt: () => 100, gradePct: 12.5 })
    ).toThrow('The steep grade is 12.5 %; it must be between 3 and 12 %.');
  });
});

describe('inclinePct', () => {
  it('reads a percent or a degree value with its sign, and nothing else', () => {
    expect(inclinePct('8%')).toBe(8);
    expect(inclinePct('-8 %')).toBe(-8);
    expect(inclinePct('+12%')).toBe(12);
    expect(inclinePct('8,5%')).toBe(8.5);
    expect(inclinePct('10°')).toBeCloseTo(17.63, 2);
    expect(inclinePct('up 8%')).toBe(8);
    expect(inclinePct('down 8%')).toBe(-8);
    expect(inclinePct('0')).toBe(0);
    expect(inclinePct('-0%')).toBe(0);
    // No number, or a number with no unit: the terrain is read instead.
    for (const v of [
      'up',
      'down',
      'up/down',
      'yes',
      'steep',
      '15',
      '',
      undefined,
    ])
      expect(inclinePct(v)).toBeNull();
  });
});

describe('an incline in the map data', () => {
  const way = (id, incline) => ({
    type: 'way',
    id,
    tags: { highway: 'footway', incline },
    geometry: [],
  });

  it('marks a way tagged incline=8% steep at 5 % without reading a height', () => {
    const inclines = inclinesOf([way(1, '8%'), way(2, '-9%')]);
    const p = plan();
    p.features[1].on = true;
    expect(needsTerrain(p, inclines)).toBe(false);
    const elevationAt = vi.fn(() => 100);
    const { plan: out, steepCount } = markSteep(p, {
      elevationAt,
      gradePct: 5,
      inclines,
    });
    expect(elevationAt).not.toHaveBeenCalled();
    expect(steepCount).toBe(2);
    const [up, down] = out.features.filter((f) => f.class === 'steep');
    // OpenSidewalks' rule: the tag is the most along the path, so the whole
    // way is steep, uphill where a positive incline climbs.
    expect(up).toMatchObject({
      id: 'osm-way-1-steep-1',
      kind: 'line',
      style: 'chevrons',
      uphill: 'end',
      on: true,
      name: 'Pine Walk, steep',
    });
    expect(up.points).toEqual(p.features[0].points);
    expect(down.uphill).toBe('start');
    expect(validatePlan(out).ok).toBe(true);
  });

  it('takes a gentle tagged incline at its word: not steep, no height read', () => {
    const inclines = inclinesOf([way(1, '3%')]);
    const elevationAt = vi.fn((lat, lon) => 100 + eastOf(lon) * 0.1);
    const { steepCount } = markSteep(plan(), {
      elevationAt,
      gradePct: 5,
      inclines,
    });
    expect(steepCount).toBe(0);
    expect(elevationAt).not.toHaveBeenCalled();
  });

  it('falls back to the tiles for incline=up with no number', () => {
    const inclines = inclinesOf([way(1, 'up')]);
    expect(inclines.size).toBe(0);
    expect(needsTerrain(plan(), inclines)).toBe(true);
    const elevationAt = vi.fn((lat, lon) => 100 + eastOf(lon) * 0.1);
    const { steepCount } = markSteep(plan(), {
      elevationAt,
      gradePct: 5,
      inclines,
    });
    expect(elevationAt).toHaveBeenCalled();
    expect(steepCount).toBe(1);
  });
});
