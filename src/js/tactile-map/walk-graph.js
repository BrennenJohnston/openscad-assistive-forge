/**
 * The walking graph of a map's area, and the shortest walk between two
 * places on it.
 *
 * The ways a person may walk (footways and sidewalks, crossings, pedestrian
 * streets, paths, steps) join wherever they share a point; OpenStreetMap
 * ways that meet share a node, and a node's latitude and longitude are the
 * same in both, so points join on their coordinates (no node ids are kept).
 * Streets carry a walk only where no footway does: they cost three times
 * their length. Steps are allowed and marked unless a walk avoids them. A
 * place inside a building starts or ends at that building's doors.
 *
 * No DOM here: the panel imports this file lazily.
 *
 * @license GPL-3.0-or-later
 */
import { projectLatLon } from './osm-geometry.js';

/** Ways a person walks. */
const WALK = new Set([
  'footway',
  'pedestrian',
  'steps',
  'living_street',
  'corridor',
  'path',
]);
/** Streets: a fallback where no footway joins two points. */
const ROADS = new Set([
  'residential',
  'unclassified',
  'service',
  'tertiary',
  'secondary',
  'primary',
  'tertiary_link',
  'secondary_link',
  'primary_link',
]);
const CLOSED = new Set(['no', 'private']);
const FOOT_ON_CYCLEWAY = new Set(['yes', 'designated']);

/** What a meter of street costs against a meter of footway. */
export const ROAD_FACTOR = 3;
/** What a flight of steps adds when a walk avoids steps, in meters. */
export const AVOID_STEPS_M = 10000;
/** How far from a building's outline a door may be and still be its door. */
export const DOOR_REACH_M = 3;

/** A point's key: its latitude and longitude to 7 decimals (about 1 cm). */
export const pointKey = (lat, lon) => `${lat.toFixed(7)},${lon.toFixed(7)}`;

const meters = (a, b) => {
  const [e, n] = projectLatLon(b.lat, b.lon, a);
  return Math.hypot(e, n);
};

/** How a way is walked: 1 for a footway, ROAD_FACTOR for a street, 0 never. */
function walkFactor(tags = {}) {
  if (CLOSED.has(tags.access) || CLOSED.has(tags.foot)) return 0;
  const hw = tags.highway;
  if (WALK.has(hw)) return 1;
  if (hw === 'cycleway' && FOOT_ON_CYCLEWAY.has(tags.foot)) return 1;
  if (ROADS.has(hw)) return ROAD_FACTOR;
  return 0;
}

/**
 * The graph of every walkable way in the elements.
 *
 * @param {object[]} elements - trimmed elements (osm-geometry.js)
 * @returns {{ points: Map<string, {lat: number, lon: number}>, edges: Map<string, Array<{to: string, m: number, factor: number, way: number|string, steps: boolean}>>, ways: Map<number|string, object> }}
 */
export function buildWalkGraph(elements = []) {
  const points = new Map();
  const edges = new Map();
  const ways = new Map();
  const link = (from, edge) => {
    if (!edges.has(from)) edges.set(from, []);
    edges.get(from).push(edge);
  };
  for (const el of elements) {
    if (el?.type !== 'way' || !Array.isArray(el.geometry)) continue;
    const tags = el.tags || {};
    const factor = walkFactor(tags);
    if (!factor) continue;
    ways.set(el.id, tags);
    const steps = tags.highway === 'steps';
    for (let i = 1; i < el.geometry.length; i += 1) {
      const a = el.geometry[i - 1];
      const b = el.geometry[i];
      const ka = pointKey(a.lat, a.lon);
      const kb = pointKey(b.lat, b.lon);
      if (ka === kb) continue;
      points.set(ka, { lat: a.lat, lon: a.lon });
      points.set(kb, { lat: b.lat, lon: b.lon });
      const m = meters(a, b);
      link(ka, { to: kb, m, factor, way: el.id, steps });
      link(kb, { to: ka, m, factor, way: el.id, steps });
    }
  }
  return { points, edges, ways };
}

/** A small binary heap of [cost, key], least cost first. */
function createHeap() {
  const items = [];
  return {
    get size() {
      return items.length;
    },
    push(item) {
      items.push(item);
      let i = items.length - 1;
      while (i > 0) {
        const parent = (i - 1) >> 1;
        if (items[parent][0] <= items[i][0]) break;
        [items[parent], items[i]] = [items[i], items[parent]];
        i = parent;
      }
    },
    pop() {
      const top = items[0];
      const last = items.pop();
      if (items.length > 0) {
        items[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1;
          const r = l + 1;
          let least = i;
          if (l < items.length && items[l][0] < items[least][0]) least = l;
          if (r < items.length && items[r][0] < items[least][0]) least = r;
          if (least === i) break;
          [items[least], items[i]] = [items[i], items[least]];
          i = least;
        }
      }
      return top;
    },
  };
}

/**
 * The shortest walk from any of the starts to any of the goals.
 *
 * @param {ReturnType<typeof buildWalkGraph>} graph
 * @param {string[]} starts - point keys
 * @param {string[]} goals - point keys
 * @param {{avoidSteps?: boolean}} [options]
 * @returns {{ lengthM: number, points: Array<{lat: number, lon: number}>, ways: Array<number|string>, steps: Array<number|string>, crossings: Array<number|string> }|null}
 */
export function shortestWalk(
  graph,
  starts,
  goals,
  { avoidSteps = false } = {}
) {
  const goalSet = new Set(goals.filter((k) => graph.points.has(k)));
  const cost = new Map();
  const prev = new Map();
  const heap = createHeap();
  for (const k of starts) {
    if (!graph.points.has(k)) continue;
    cost.set(k, 0);
    heap.push([0, k]);
  }
  let end = null;
  while (heap.size > 0) {
    const [c, u] = heap.pop();
    if (c > cost.get(u)) continue;
    if (goalSet.has(u)) {
      end = u;
      break;
    }
    for (const edge of graph.edges.get(u) || []) {
      const step =
        edge.m * edge.factor + (avoidSteps && edge.steps ? AVOID_STEPS_M : 0);
      const next = c + step;
      if (next < (cost.get(edge.to) ?? Infinity)) {
        cost.set(edge.to, next);
        prev.set(edge.to, { from: u, edge });
        heap.push([next, edge.to]);
      }
    }
  }
  if (end === null) return null;

  const keys = [end];
  const used = [];
  let lengthM = 0;
  for (let k = end; prev.has(k); k = prev.get(k).from) {
    const { from, edge } = prev.get(k);
    lengthM += edge.m;
    used.push(edge.way);
    keys.push(from);
  }
  keys.reverse();
  used.reverse();
  const ways = used.filter((w, i) => i === 0 || used[i - 1] !== w);
  const unique = (list) => list.filter((w, i) => list.indexOf(w) === i);
  return {
    lengthM,
    points: keys.map((k) => graph.points.get(k)),
    ways,
    steps: unique(ways.filter((w) => graph.ways.get(w)?.highway === 'steps')),
    crossings: unique(
      ways.filter((w) => graph.ways.get(w)?.footway === 'crossing')
    ),
  };
}

/** Is the point inside the closed ring (ray casting on latitude and longitude)? */
function insideRing(pt, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i];
    const b = ring[j];
    if (
      a.lat > pt.lat !== b.lat > pt.lat &&
      pt.lon < ((b.lon - a.lon) * (pt.lat - a.lat)) / (b.lat - a.lat) + a.lon
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/** The distance from a point to a ring's outline, in meters. */
function toOutlineM(pt, ring) {
  let best = Infinity;
  for (let i = 1; i < ring.length; i += 1) {
    const [ax, ay] = projectLatLon(ring[i - 1].lat, ring[i - 1].lon, pt);
    const [bx, by] = projectLatLon(ring[i].lat, ring[i].lon, pt);
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t =
      len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}

/** The graph's point nearest a place, or null on an empty graph. */
function nearestPoint(graph, pt) {
  let best = null;
  let bestM = Infinity;
  for (const [k, p] of graph.points) {
    const m = meters(pt, p);
    if (m < bestM) {
      bestM = m;
      best = k;
    }
  }
  return best;
}

/**
 * Where a walk may start (role 'start') or end (role 'end') for a place.
 * Inside a building: its doors within DOOR_REACH_M of its outline that lie
 * on the graph; a start leaves by any door but an emergency one; an end
 * arrives by a main door when the building has one, else by any door but an
 * exit or an emergency one. A building with no door on the graph, or a place
 * outside every building: the graph's point nearest it.
 *
 * @param {ReturnType<typeof buildWalkGraph>} graph
 * @param {object[]} elements
 * @param {{lat: number, lon: number}} place
 * @param {'start'|'end'} role
 * @returns {{ keys: string[], building: string|null, buildingId: number|string|null }}
 */
export function placeCandidates(graph, elements, place, role) {
  const building = elements.find(
    (el) =>
      el?.type === 'way' &&
      el.tags?.building &&
      Array.isArray(el.geometry) &&
      el.geometry.length > 3 &&
      insideRing(place, el.geometry)
  );
  if (building) {
    const doors = elements.filter(
      (el) =>
        el?.type === 'node' &&
        el.tags?.entrance &&
        graph.points.has(pointKey(el.lat, el.lon)) &&
        toOutlineM(el, building.geometry) <= DOOR_REACH_M
    );
    let chosen;
    if (role === 'start') {
      chosen = doors.filter((d) => d.tags.entrance !== 'emergency');
    } else {
      const main = doors.filter((d) => d.tags.entrance === 'main');
      chosen = main.length
        ? main
        : doors.filter(
            (d) => d.tags.entrance !== 'exit' && d.tags.entrance !== 'emergency'
          );
    }
    const name = building.tags.name || '';
    if (chosen.length > 0) {
      return {
        keys: chosen.map((d) => pointKey(d.lat, d.lon)),
        building: name,
        buildingId: building.id,
      };
    }
    const near = nearestPoint(graph, place);
    return {
      keys: near ? [near] : [],
      building: name,
      buildingId: building.id,
    };
  }
  const near = nearestPoint(graph, place);
  return { keys: near ? [near] : [], building: null, buildingId: null };
}

/**
 * The walk between two places in the elements, or null when none joins them.
 *
 * @param {{ elements: object[], from: {lat: number, lon: number}, to: {lat: number, lon: number}, avoidSteps?: boolean }} args
 */
export function walkBetween({ elements = [], from, to, avoidSteps = false }) {
  const graph = buildWalkGraph(elements);
  const start = placeCandidates(graph, elements, from, 'start');
  const end = placeCandidates(graph, elements, to, 'end');
  const walk = shortestWalk(graph, start.keys, end.keys, { avoidSteps });
  if (!walk) return null;
  return { ...walk, from: start, to: end };
}
