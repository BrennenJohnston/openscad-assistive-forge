/**
 * A route map's draft: the walk between two places, raised as one route
 * from door to door, and only what a person walking it needs switched on.
 *
 * On: the route itself (one feature, from the walk's own points, so no
 * short way is lost); the crossings and the flights of steps on it; the
 * start and destination buildings; "You are here" at the start door and an
 * entrance at the destination door; the paths that meet the walk as short
 * stubs, so a finger feels each junction it passes; the streets it crosses
 * as curbs near each crossing; and the landmarks the person ticked that lie
 * near the walk, each set beside the route and clear of every other symbol,
 * so of two bus stops facing each other across a street one is on. Nothing
 * that is on comes within ROUTE_GAP_MM of the route, so a curb never runs
 * beside it where a finger would take the two for one. Everything else is
 * drawn too, switched Off, one choice away in the editor.
 *
 * The map is fitted to the walk and the two buildings, north up, and the
 * plate to the map: the side the walk does not fill shrinks.
 *
 * No DOM here: the panel imports this file lazily.
 *
 * @license GPL-3.0-or-later
 */
import { draftPlan } from './plan-from-osm.js';
import { projectLatLon, toMm } from './osm-geometry.js';
import { pointKey, walkBetween } from './walk-graph.js';
import { DEFAULT_SETTINGS } from './levels-svg.js';
import { PLATE_MIN_MM } from './plate-tiling.js';

/** The least gap between the route and anything else that is on, in mm. */
export const ROUTE_GAP_MM = 3;
/** How far from the walk a ticked landmark may be and start on, in meters. */
export const CORRIDOR_M = 25;
/** How much of a path that meets the walk is drawn, in meters. */
export const STUB_M = 15;
/** How much of a crossed street's curbs is drawn each side of a crossing. */
export const CURB_WINDOW_M = 25;
/** The ground kept around the walk and the buildings, in meters. */
export const MARGIN_M = 30;

const DENSIFY_MM = 0.5;
/** How far a landmark may be moved to stand clear of the route, in mm. */
const MAX_SHIFT_MM = 15;
const MIN_PIECE_MM = 2;
const SIMPLIFY_MM = 0.2;
const POINT_CLASSES_NEAR = new Set(['landmark', 'transit-stop']);

const round3 = (v) => Math.round(v * 1000) / 1000;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

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

function toPolyline(p, line) {
  let best = Infinity;
  for (let i = 1; i < line.length; i += 1) {
    best = Math.min(best, toSegment(p, line[i - 1], line[i]));
  }
  return best;
}

function densify(points, step) {
  const out = [points[0]];
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const n = Math.max(1, Math.ceil(dist(a, b) / step));
    for (let j = 1; j <= n; j += 1) {
      out.push([
        a[0] + ((b[0] - a[0]) * j) / n,
        a[1] + ((b[1] - a[1]) * j) / n,
      ]);
    }
  }
  return out;
}

/** Douglas-Peucker on a polyline of [x, y]. */
function simplify(points, epsilon) {
  if (points.length < 3) return points;
  let index = 0;
  let worst = 0;
  const first = points[0];
  const last = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i += 1) {
    const d = toSegment(points[i], first, last);
    if (d > worst) {
      worst = d;
      index = i;
    }
  }
  if (worst <= epsilon) return [first, last];
  const left = simplify(points.slice(0, index + 1), epsilon);
  const right = simplify(points.slice(index), epsilon);
  return [...left.slice(0, -1), ...right];
}

const lengthOf = (pts) =>
  pts.reduce((sum, p, i) => (i ? sum + dist(pts[i - 1], p) : sum), 0);

/** The gap from a point to a symbol's square, `half` mm from its center. */
const toSquare = (p, at, half) =>
  Math.hypot(
    Math.max(0, Math.abs(p[0] - at[0]) - half),
    Math.max(0, Math.abs(p[1] - at[1]) - half)
  );

/**
 * Where a symbol stands clear of the route: where it is, or moved straight
 * away from the route's nearest point, on its own side, the least that
 * clears it; null when MAX_SHIFT_MM does not.
 */
function besideRoute(at, route, isClear) {
  if (isClear(at)) return at;
  let best = null;
  for (let i = 1; i < route.length; i += 1) {
    const a = route[i - 1];
    const b = route[i];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len === 0) continue;
    const t = Math.max(
      0,
      Math.min(1, ((at[0] - a[0]) * dx + (at[1] - a[1]) * dy) / (len * len))
    );
    const q = [a[0] + t * dx, a[1] + t * dy];
    const d = dist(at, q);
    if (!best || d < best.d) {
      const n = [-dy / len, dx / len];
      const side =
        Math.sign((at[0] - q[0]) * n[0] + (at[1] - q[1]) * n[1]) || 1;
      best = { d, q, n: [n[0] * side, n[1] * side] };
    }
  }
  if (!best) return null;
  for (let s = best.d; s <= best.d + MAX_SHIFT_MM; s += DENSIFY_MM / 2) {
    const p = [
      round3(best.q[0] + best.n[0] * s),
      round3(best.q[1] + best.n[1] * s),
    ];
    if (isClear(p)) return p;
  }
  return null;
}

/** Runs of consecutive points that pass the test, each at least MIN_PIECE_MM long. */
function runs(points, keep) {
  const out = [];
  let run = [];
  for (const p of points) {
    if (keep(p)) run.push(p);
    else {
      if (run.length > 1) out.push(run);
      run = [];
    }
  }
  if (run.length > 1) out.push(run);
  return out.filter((r) => lengthOf(r) >= MIN_PIECE_MM);
}

/** The first `max` mm of a run, measured from its end nearest the route. */
function fromNearEnd(run, route, max) {
  const ordered =
    toPolyline(run[0], route) <= toPolyline(run[run.length - 1], route)
      ? run
      : [...run].reverse();
  const out = [ordered[0]];
  let total = 0;
  for (let i = 1; i < ordered.length && total < max; i += 1) {
    total += dist(ordered[i - 1], ordered[i]);
    out.push(ordered[i]);
  }
  return out;
}

const idMatches = (f, id) =>
  f.id === `osm-way-${id}` || f.id.startsWith(`osm-way-${id}-`);

const shortName = (place, fallback) =>
  (place?.name || fallback || '').split(',')[0].trim();

/**
 * Build the draft of a route map.
 *
 * @param {object} args
 * @param {object[]} args.elements - trimmed elements (osm-geometry.js)
 * @param {{lat: number, lon: number, name?: string}} args.from
 * @param {{lat: number, lon: number, name?: string}} args.to
 * @param {{w: number, h: number}} [args.size] - the map in mm
 * @param {string[]} [args.landmarks] - the landmark boxes ticked
 * @param {boolean} [args.avoidSteps]
 * @param {{name: string}|null} [args.fromStop] - the walk starts at this stop
 *   (a walk from a bus or train): a Transit stop there, not You are here
 * @param {{name: string}|null} [args.toStop] - the walk ends at this stop: a
 *   Transit stop there, not a door
 * @returns {{ plan: object|null, walk: object|null, counts: object|null }}
 */
export function draftRoutePlan({
  elements = [],
  from,
  to,
  size = { w: 480, h: 360 },
  landmarks = [],
  avoidSteps = false,
  fromStop = null,
  toStop = null,
} = {}) {
  const walk = walkBetween({ elements, from, to, avoidSteps });
  if (!walk || walk.points.length < 2) {
    return { plan: null, walk: null, counts: null };
  }

  // The extent: the walk and both buildings, with a margin, north up.
  const wayById = new Map(
    elements.filter((e) => e?.type === 'way').map((e) => [e.id, e])
  );
  const outline = (id) => (id == null ? [] : wayById.get(id)?.geometry || []);
  const all = [
    ...walk.points,
    ...outline(walk.from.buildingId),
    ...outline(walk.to.buildingId),
  ];
  const lats = all.map((p) => p.lat);
  const lons = all.map((p) => p.lon);
  const center = {
    lat: (Math.min(...lats) + Math.max(...lats)) / 2,
    lon: (Math.min(...lons) + Math.max(...lons)) / 2,
  };
  const [east, north] = projectLatLon(
    Math.max(...lats),
    Math.max(...lons),
    center
  );
  const spanE = 2 * Math.abs(east) + 2 * MARGIN_M;
  const spanN = 2 * Math.abs(north) + 2 * MARGIN_M;
  const k = Math.min(size.w / spanE, size.h / spanN);
  // The plate at that scale: the side the walk does not fill shrinks to it,
  // never below the smallest map the model takes.
  const plate = {
    w: Math.min(size.w, Math.max(PLATE_MIN_MM.w, Math.ceil(spanE * k))),
    h: Math.min(size.h, Math.max(PLATE_MIN_MM.h, Math.ceil(spanN * k))),
  };
  const mm = (p) =>
    toMm(projectLatLon(p.lat, p.lon, center), plate, k).map(round3);

  const base = draftPlan({
    elements,
    center,
    radiusM: plate.w / (2 * k),
    landmarks,
    size: plate,
    place: null,
  }).plan;

  const route = walk.points
    .map(mm)
    .filter((p, i, list) => i === 0 || dist(list[i - 1], p) > 1e-6);
  const near = (p, max) => toPolyline(p, route) <= max;

  const features = [];
  // Ticked landmarks near the walk: placed once the route's own symbols are.
  const nearby = [];
  for (const f of base.features) {
    if (f.id === 'you-are-here') continue;
    const copy = { ...f, on: false };
    if (
      f.on &&
      f.kind === 'point' &&
      POINT_CLASSES_NEAR.has(f.class) &&
      near(f.at, CORRIDOR_M * k)
    ) {
      nearby.push(copy);
    }
    features.push(copy);
  }

  const switchOn = (test) => {
    for (const f of features) if (test(f)) f.on = true;
  };
  switchOn(
    (f) =>
      f.class === 'crossing' && walk.crossings.some((id) => idMatches(f, id))
  );
  // A crossing point on the walk, unless its crossing line is on already.
  const crossingLines = features.filter(
    (f) => f.class === 'crossing' && f.kind === 'line' && f.on
  );
  switchOn(
    (f) =>
      f.class === 'crossing' &&
      f.kind === 'point' &&
      toPolyline(f.at, route) <= 0.5 &&
      !crossingLines.some((c) => toPolyline(f.at, c.points) <= 1)
  );
  switchOn(
    (f) =>
      f.class === 'stairs' &&
      walk.steps.some((id) => f.id === `osm-way-${id}-stairs`)
  );
  for (const id of [walk.from.buildingId, walk.to.buildingId]) {
    if (id != null) switchOn((f) => f.kind === 'area' && idMatches(f, id));
  }

  // The paths that meet the walk, as stubs.
  const extra = [];
  const stubMm = STUB_M * k;
  for (const f of features) {
    if (f.class !== 'walkway' || f.kind !== 'line') continue;
    const pieces = runs(densify(f.points, DENSIFY_MM), (p) => {
      const d = toPolyline(p, route);
      return d >= ROUTE_GAP_MM && d <= stubMm;
    }).filter(
      (r) =>
        Math.min(toPolyline(r[0], route), toPolyline(r[r.length - 1], route)) <=
        ROUTE_GAP_MM + DENSIFY_MM + 0.1
    );
    pieces.forEach((r, i) => {
      const stub = simplify(fromNearEnd(r, route, stubMm), SIMPLIFY_MM);
      if (lengthOf(stub) < MIN_PIECE_MM) return;
      extra.push({
        id: `${f.id}-stub-${i + 1}`,
        class: 'walkway',
        kind: 'line',
        points: stub.map((p) => p.map(round3)),
        on: true,
        ...(f.name ? { name: f.name } : {}),
      });
    });
  }

  // The streets the walk crosses: curbs near each crossing, clear of the route.
  const crossingWays = walk.crossings
    .map((id) => wayById.get(id))
    .filter(Boolean);
  const crossingPoints = new Map();
  for (const w of crossingWays) {
    for (const p of w.geometry) crossingPoints.set(pointKey(p.lat, p.lon), p);
  }
  const windowMm = CURB_WINDOW_M * k;
  for (const road of wayById.values()) {
    const shared = (road.geometry || []).filter((p) =>
      crossingPoints.has(pointKey(p.lat, p.lon))
    );
    if (shared.length === 0 || !road.tags?.highway) continue;
    const centers = shared.map(mm);
    for (const f of features) {
      if (f.class !== 'curb' || !idMatches(f, road.id)) continue;
      runs(densify(f.points, DENSIFY_MM), (p) => {
        return (
          centers.some((c) => dist(c, p) <= windowMm) &&
          toPolyline(p, route) >= ROUTE_GAP_MM
        );
      }).forEach((r, i) => {
        extra.push({
          id: `${f.id}-near-${i + 1}`,
          class: 'curb',
          kind: 'line',
          points: simplify(r, SIMPLIFY_MM).map((p) => p.map(round3)),
          on: true,
          ...(f.name ? { name: f.name } : {}),
        });
      });
    }
  }

  // "You are here" stands at the start door, moved back into the start
  // building, away from the walk, only as far as the other symbols need.
  const clear = DEFAULT_SETTINGS.symbolSizeMm + DEFAULT_SETTINGS.minGapMm;
  const others = [...features, ...extra].filter(
    (f) => f.on && f.kind === 'point'
  );
  const crowded = (at) =>
    others.some(
      (f) =>
        Math.max(Math.abs(f.at[0] - at[0]), Math.abs(f.at[1] - at[1])) < clear
    );
  const back = [route[0][0] - route[1][0], route[0][1] - route[1][1]];
  const backLen = Math.hypot(back[0], back[1]) || 1;
  let here = route[0];
  for (let s = 0; crowded(here) && s <= 2 * clear; s += DENSIFY_MM) {
    here = [
      round3(route[0][0] + (back[0] / backLen) * s),
      round3(route[0][1] + (back[1] / backLen) * s),
    ];
  }

  const startName = shortName(from, walk.from.building);
  const endName = shortName(to, walk.to.building);
  features.push(
    {
      id: 'route-walk',
      class: 'route',
      kind: 'line',
      name: 'Route',
      points: route,
      on: true,
    },
    fromStop
      ? {
          id: 'start-stop',
          class: 'transit-stop',
          kind: 'point',
          name: fromStop.name,
          at: route[0],
          on: true,
        }
      : {
          id: 'you-are-here',
          class: 'you-are-here',
          kind: 'point',
          name: 'You are here',
          at: here,
          on: true,
        },
    toStop
      ? {
          id: 'destination-stop',
          class: 'transit-stop',
          kind: 'point',
          name: toStop.name,
          at: route[route.length - 1],
          on: true,
        }
      : {
          id: 'destination-door',
          class: 'entrance',
          kind: 'point',
          name: endName || 'Destination',
          at: route[route.length - 1],
          on: true,
        },
    ...extra
  );

  // The ticked landmarks, nearest the walk first: each beside the route, its
  // edge ROUTE_GAP_MM from the route's, and on only when clear of every
  // symbol already on and, where it really stands, of every landmark kept:
  // of a pair facing each other across a street, the nearer that can stand
  // clear (one inside a bend of the route may not).
  const half = DEFAULT_SETTINGS.symbolSizeMm / 2;
  const routeEdge =
    (DEFAULT_SETTINGS.classes.route?.width ?? 0) / 2 + ROUTE_GAP_MM;
  const dense = densify(route, DENSIFY_MM / 2);
  const clearOfRoute = (at) =>
    dense.every((p) => toSquare(p, at, half) >= routeEdge);
  const onPlate = ([x, y]) =>
    x >= half && x <= plate.w - half && y >= half && y <= plate.h - half;
  const symbols = features.filter((f) => f.on && f.kind === 'point');
  const crowding = (list, at) =>
    list.some(
      (q) => Math.max(Math.abs(q[0] - at[0]), Math.abs(q[1] - at[1])) < clear
    );
  const kept = [];
  nearby.sort((a, b) => toPolyline(a.at, route) - toPolyline(b.at, route));
  for (const f of nearby) {
    if (crowding(kept, f.at)) continue;
    const at = besideRoute(f.at, route, clearOfRoute);
    if (!at || !onPlate(at)) continue;
    if (
      crowding(
        symbols.map((s) => s.at),
        at
      )
    )
      continue;
    kept.push(f.at);
    f.at = at;
    f.on = true;
    symbols.push(f);
  }

  const plan = {
    ...base,
    features,
    meta: {
      ...base.meta,
      title: [startName, endName].filter(Boolean).join(' to '),
      geo: { center, mmPerM: k },
      route: { lengthM: walk.lengthM, from: startName, to: endName },
    },
  };
  return {
    plan,
    walk,
    counts: {
      lengthM: walk.lengthM,
      crossings: features.filter((f) => f.class === 'crossing' && f.on).length,
      steps: walk.steps.length,
      on: features.filter((f) => f.on).length,
      total: features.length,
    },
  };
}
