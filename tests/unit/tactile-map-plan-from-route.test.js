/**
 * A route map's draft: the walk between two places raised as one route,
 * from door to door, with the crossing and the steps on it, the two
 * buildings, a "You are here" at the start door and an entrance at the
 * destination door; the side paths that meet the walk as short stubs; the
 * streets crossed as curbs near each crossing, never within 3 mm of the
 * route; everything else present and Off; the map fitted to the walk.
 *
 * The fixture is the walk from the Husky Union Building to the Bill &
 * Melinda Gates Center at the University of Washington (243.6 m by the
 * reference script). Map data from OpenStreetMap contributors, ODbL.
 *
 * @license GPL-3.0-or-later
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  draftRoutePlan,
  ROUTE_GAP_MM,
} from '../../src/js/tactile-map/plan-from-route.js';
import { trimElement } from '../../src/js/tactile-map/osm-geometry.js';
import { buildLevelRings } from '../../src/js/tactile-map/levels-svg.js';

const FIXTURE = JSON.parse(
  readFileSync('tests/fixtures/tactile-map/uw-hub-gates.json', 'utf8')
);
const ELEMENTS = FIXTURE.elements.map(trimElement).filter(Boolean);
const HUB = {
  lat: 47.6553685,
  lon: -122.3051021,
  name: 'Husky Union Building, 4001, East Stevens Way Northeast, Seattle',
};
const GATES = {
  lat: 47.652873,
  lon: -122.3044814,
  name: 'Bill & Melinda Gates Center, 3800, East Stevens Way Northeast, Seattle',
};
const SIZE = { w: 480, h: 360 };

const lengthOf = (pts) =>
  pts.reduce(
    (sum, p, i) =>
      i ? sum + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0,
    0
  );
function toSegment(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t =
    len2 === 0
      ? 0
      : Math.max(
          0,
          Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)
        );
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
const toLine = (p, pts) =>
  Math.min(...pts.slice(1).map((q, i) => toSegment(p, pts[i], q)));

const draft = () =>
  draftRoutePlan({ elements: ELEMENTS, from: HUB, to: GATES, size: SIZE });

describe('a route map draft', () => {
  it('raises the walk as ONE route feature from door to door, 243.6 m at the map scale', () => {
    const { plan, walk } = draft();
    const routes = plan.features.filter((f) => f.class === 'route');
    expect(routes).toHaveLength(1);
    expect(routes[0].on).toBe(true);
    const k = plan.meta.geo.mmPerM;
    const metres = lengthOf(routes[0].points) / k;
    expect(metres).toBeGreaterThan(242.6);
    expect(metres).toBeLessThan(244.6);
    expect(walk.lengthM).toBeGreaterThan(243.1);
    expect(walk.lengthM).toBeLessThan(244.1);
  });

  it('switches on the crossing and the flight of steps on the walk', () => {
    const { plan } = draft();
    const on = (id) => plan.features.find((f) => f.id === id)?.on;
    expect(on('osm-way-436426110')).toBe(true);
    expect(on('osm-way-463804370-stairs')).toBe(true);
  });

  it('switches on the two buildings, You are here at the start door and an entrance at the destination door', () => {
    const { plan } = draft();
    const route = plan.features.find((f) => f.class === 'route');
    const hub = plan.features.filter((f) =>
      f.id.startsWith('osm-way-222822705')
    );
    const gates = plan.features.filter((f) =>
      f.id.startsWith('osm-way-1491155067')
    );
    expect(hub.length).toBeGreaterThan(0);
    expect(gates.length).toBeGreaterThan(0);
    for (const f of [...hub, ...gates]) expect(f.on).toBe(true);
    const here = plan.features.filter(
      (f) => f.class === 'you-are-here' && f.on
    );
    expect(here).toHaveLength(1);
    // At the start door, or moved back from it only as far as the symbols
    // need (a symbol and the 3 mm gap).
    expect(
      Math.hypot(
        here[0].at[0] - route.points[0][0],
        here[0].at[1] - route.points[0][1]
      )
    ).toBeLessThanOrEqual(13.5);
    const last = route.points[route.points.length - 1];
    const door = plan.features.filter(
      (f) =>
        f.class === 'entrance' &&
        f.on &&
        Math.hypot(f.at[0] - last[0], f.at[1] - last[1]) < 0.01
    );
    expect(door).toHaveLength(1);
  });

  it('keeps every walkway and curb that is on at least the gap from the route, the walkways as stubs near it', () => {
    const { plan } = draft();
    const route = plan.features.find((f) => f.class === 'route').points;
    const k = plan.meta.geo.mmPerM;
    const on = plan.features.filter(
      (f) => f.on && (f.class === 'walkway' || f.class === 'curb')
    );
    expect(on.length).toBeGreaterThan(0);
    for (const f of on) {
      for (const p of f.points) {
        expect(toLine(p, route)).toBeGreaterThanOrEqual(ROUTE_GAP_MM - 0.05);
      }
      if (f.class === 'walkway') {
        for (const p of f.points) {
          expect(toLine(p, route)).toBeLessThanOrEqual(15 * k + 0.5);
        }
      }
    }
  });

  it('fits both buildings and the walk inside the plate, and leaves everything else off', () => {
    const { plan } = draft();
    const inside = ([x, y]) => x >= 0 && x <= SIZE.w && y >= 0 && y <= SIZE.h;
    const route = plan.features.find((f) => f.class === 'route');
    expect(route.points.every(inside)).toBe(true);
    for (const id of ['osm-way-222822705', 'osm-way-1491155067']) {
      const f = plan.features.find((g) => g.id === id);
      expect(f, id).toBeTruthy();
      expect(f.ring.every(inside)).toBe(true);
    }
    const onCount = plan.features.filter((f) => f.on).length;
    expect(onCount).toBeLessThan(40);
    expect(plan.features.length).toBeGreaterThan(200);
  });

  it('switches the crossing on once, as its line, not again as the point in its middle', () => {
    const { plan } = draft();
    expect(
      plan.features.filter((f) => f.class === 'crossing' && f.on)
    ).toHaveLength(1);
  });

  it('keeps every symbol that is on clear of the others: the steps by the HUB door push You are here back into the building', () => {
    const { plan } = draft();
    const { warnings } = buildLevelRings(plan);
    expect(warnings.filter((w) => w.code === 'too-close')).toEqual([]);
    const here = plan.features.find((f) => f.class === 'you-are-here' && f.on);
    const hub = plan.features.find((f) => f.id === 'osm-way-222822705');
    // Still inside the HUB's outline.
    let inside = false;
    const r = hub.ring;
    for (let i = 0, j = r.length - 1; i < r.length; j = i, i += 1) {
      if (
        r[i][1] > here.at[1] !== r[j][1] > here.at[1] &&
        here.at[0] <
          ((r[j][0] - r[i][0]) * (here.at[1] - r[i][1])) / (r[j][1] - r[i][1]) +
            r[i][0]
      ) {
        inside = !inside;
      }
    }
    expect(inside).toBe(true);
  });

  it('names the plan after the two places', () => {
    const { plan } = draft();
    expect(plan.meta.title).toBe(
      'Husky Union Building to Bill & Melinda Gates Center'
    );
  });

  it('says there is no walk when nothing joins the places', () => {
    const result = draftRoutePlan({
      elements: ELEMENTS,
      from: HUB,
      to: { lat: 47.7, lon: -122.2, name: 'Far away' },
      size: SIZE,
    });
    // The far place snaps to the nearest graph point, so a walk exists; an
    // empty graph has none.
    expect(result.plan).not.toBeNull();
    expect(
      draftRoutePlan({ elements: [], from: HUB, to: GATES, size: SIZE }).plan
    ).toBeNull();
  });
});
