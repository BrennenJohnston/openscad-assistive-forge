/**
 * The map data from the OpenStreetMap US Sourdough tiles: prebuilt vector
 * tiles of OpenStreetMap whose features carry OpenStreetMap's own tags, so
 * the draft builders read them as they read an Overpass answer.
 *
 * A pull reads the zoom 15 tiles over the area (about 825 m across in
 * Seattle; one to four tiles for a map), keeps each feature once by clipping
 * it to its own tile (a tile repeats a margin of its neighbors), joins a
 * building cut by a tile edge into one outline, snaps the end of a walk onto
 * a walk it meets within a meter (the tiles simplify lines, which can drop
 * the shared point a junction needs), and keeps what lies in the area: a
 * circle around a place, or the box around two.
 *
 * Measured 2026-11-01 (`04_DATA_SOURCES.md`): the tile over the Gates Center
 * carries its sidewalks and crossings, crossing points, curbs, entrances,
 * bus stops and named buildings, 101 KB, in 0.2 to 1.8 s; the service allows
 * the site's origin. Its usage policy asks for the page's own Origin and
 * Referer, which a browser sends, and no client name of another app.
 *
 * Errors carry a `code`: 'refused' (a refusal or a blocked answer),
 * 'no-answer' (nothing within the wait, offline, or stopped), 'no-data'
 * (bytes that are not a tile).
 *
 * No DOM here.
 *
 * @license GPL-3.0-or-later
 */
import { decodeTile } from './vector-tile.js';
import { trimElement } from './osm-geometry.js';
import { intersect, union, areaOf } from '../ring-geometry.js';

export const TILES_NAME = "OpenStreetMap US's map tiles";
export const TILE_URL =
  'https://tiles.openstreetmap.us/vector/sourdough/{z}/{x}/{y}.mvt';
export const TILES_ATTRIBUTION_URL = 'https://tiles.openstreetmap.us';
export const ZOOM = 15;
/** All the tiles of one pull, in milliseconds. */
export const TIMEOUT_MS = 20000;
/** How far the end of a walk may be from a walk it meets, in meters. */
export const SNAP_M = 1;

/** Tile units per tile: one grid for every tile, whatever its layers say. */
const UNITS = 4096;
const EARTH_M = 40075016.686;
const ATTRIBUTION = 'Map data from OpenStreetMap contributors, ODbL';

/** The layers a map reads, as the Overpass query reads their tags. */
const LAYERS = [
  'highways',
  'buildings',
  'railways',
  'leisure',
  'amenities',
  'public_transport',
  'shops',
  // Curbs: barrier=kerb points with their kerb value.
  'barriers',
];
const WAY_KEYS = ['highway', 'building', 'railway', 'leisure', 'amenity'];
const wantedNode = (t) =>
  'entrance' in t ||
  t.highway === 'crossing' ||
  t.highway === 'bus_stop' ||
  'public_transport' in t ||
  'amenity' in t ||
  'shop' in t ||
  'kerb' in t;

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

const worldUnits = (z) => 2 ** z * UNITS;

/** A latitude and longitude to world units at a zoom (y down). */
function toUnits(lat, lon, z = ZOOM) {
  const s = Math.sin((lat * Math.PI) / 180);
  return [
    ((lon + 180) / 360) * worldUnits(z),
    (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * worldUnits(z),
  ];
}

/** World units back to a latitude and longitude. */
function toLatLon(x, y, z = ZOOM) {
  const n = Math.PI * (1 - (2 * y) / worldUnits(z));
  return {
    lat: (Math.atan(Math.sinh(n)) * 180) / Math.PI,
    lon: (x / worldUnits(z)) * 360 - 180,
  };
}

/** Meters on the ground per world unit at a latitude. */
const metersPerUnit = (lat, z = ZOOM) =>
  (EARTH_M * Math.cos((lat * Math.PI) / 180)) / worldUnits(z);

/**
 * The area of a pull in world units: a box, or a circle around a place.
 *
 * @returns {{ minX: number, minY: number, maxX: number, maxY: number, circle: null|{x: number, y: number, r: number} }}
 */
function areaBounds(where) {
  if (where.box) {
    const { south, west, north, east } = where.box;
    const [minX, maxY] = toUnits(south, west);
    const [maxX, minY] = toUnits(north, east);
    return { minX, minY, maxX, maxY, circle: null };
  }
  const [x, y] = toUnits(where.lat, where.lon);
  const r = where.radiusM / metersPerUnit(where.lat);
  return {
    minX: x - r,
    minY: y - r,
    maxX: x + r,
    maxY: y + r,
    circle: { x, y, r },
  };
}

/**
 * The tiles over an area, row by row.
 *
 * @param {{box?: {south: number, west: number, north: number, east: number}, lat?: number, lon?: number, radiusM?: number}} where
 * @returns {Array<{z: number, x: number, y: number}>}
 */
export function tileRange(where) {
  const a = areaBounds(where);
  const x0 = Math.floor(a.minX / UNITS);
  const x1 = Math.floor(a.maxX / UNITS);
  const y0 = Math.floor(a.minY / UNITS);
  const y1 = Math.floor(a.maxY / UNITS);
  const out = [];
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) out.push({ z: ZOOM, x, y });
  }
  return out;
}

/** Fetch one tile's bytes: empty for a tile with nothing in it. */
async function fetchTile(tile, { fetchImpl, signal }) {
  const url = TILE_URL.replace('{z}', tile.z)
    .replace('{x}', tile.x)
    .replace('{y}', tile.y);
  const response = await fetchImpl(url, { signal });
  if (response.status === 204 || response.status === 404) {
    return new Uint8Array(0);
  }
  if (!response.ok) {
    throw fail('refused', `${TILES_NAME} answered ${response.status}.`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

/** Clip a line (world units) to a square; the pieces inside it. */
function clipLine(points, [x0, y0, x1, y1]) {
  const pieces = [];
  let current = null;
  for (let i = 0; i + 1 < points.length; i += 1) {
    const [ax, ay] = points[i];
    const [bx, by] = points[i + 1];
    const dx = bx - ax;
    const dy = by - ay;
    let t0 = 0;
    let t1 = 1;
    let inside = true;
    for (const [p, q] of [
      [-dx, ax - x0],
      [dx, x1 - ax],
      [-dy, ay - y0],
      [dy, y1 - ay],
    ]) {
      if (p === 0) {
        if (q < 0) inside = false;
      } else {
        const t = q / p;
        if (p < 0) t0 = Math.max(t0, t);
        else t1 = Math.min(t1, t);
      }
    }
    if (!inside || t0 > t1) {
      current = null;
      continue;
    }
    const start = t0 === 0 ? [ax, ay] : [ax + t0 * dx, ay + t0 * dy];
    const end = t1 === 1 ? [bx, by] : [ax + t1 * dx, ay + t1 * dy];
    if (!current) {
      current = [start];
      pieces.push(current);
    }
    current.push(end);
    if (t1 < 1) current = null;
  }
  // A piece that only touches the square is a point, not a line.
  return pieces.filter(
    (p) => p.length >= 2 && p.some(([x, y]) => x !== p[0][0] || y !== p[0][1])
  );
}

const asRing = (points) => points.map(([x, y]) => ({ x, y }));
const fromRing = (ring) => ring.map(({ x, y }) => [x, y]);

/**
 * Every wanted feature of the tiles, in world units relative to the first
 * tile's corner (the ring operations keep their numbers small), clipped to
 * its own tile.
 */
function collect(tiles, origin) {
  const lines = [];
  const points = [];
  const areas = new Map();
  for (const { tile, layers } of tiles) {
    const left = tile.x * UNITS - origin[0];
    const top = tile.y * UNITS - origin[1];
    const square = [left, top, left + UNITS, top + UNITS];
    const squareRing = asRing([
      [left, top],
      [left + UNITS, top],
      [left + UNITS, top + UNITS],
      [left, top + UNITS],
    ]);
    for (const name of LAYERS) {
      const layer = layers[name];
      if (!layer) continue;
      const k = UNITS / layer.extent;
      const place = ([x, y]) => [left + x * k, top + y * k];
      for (const f of layer.features) {
        const tags = {};
        for (const [key, value] of Object.entries(f.tags)) {
          if (!key.startsWith('_')) tags[key] = String(value);
        }
        if (f.type === 1) {
          for (const [pt] of f.geometry) {
            const [x, y] = place(pt);
            // Half-open, so a point on the edge between two tiles is one.
            if (x >= left && x < left + UNITS && y >= top && y < top + UNITS) {
              points.push({ tags, x, y });
            }
          }
        } else if (f.type === 2) {
          for (const line of f.geometry) {
            for (const piece of clipLine(line.map(place), square)) {
              lines.push({ tags, points: piece });
            }
          }
        } else if (f.type === 3) {
          // Keyed by layer and id: the same building in two tiles is one.
          const key = `${name}:${f.id}`;
          const entry = areas.get(key) || { tags, rings: [] };
          for (const polygon of f.geometry) {
            const outer = polygon[0].map(place);
            for (const ring of intersect([asRing(outer)], [squareRing])) {
              entry.rings.push(ring);
            }
          }
          areas.set(key, entry);
        }
      }
    }
  }
  return { lines, points, areas };
}

/** Distance from a point to a segment, with the nearest point and its t. */
function nearestOnSegment([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t =
    len2 === 0
      ? 0
      : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  const x = ax + t * dx;
  const y = ay + t * dy;
  return { d: Math.hypot(px - x, py - y), x, y, t };
}

/**
 * Snap the ends of walks onto the walks they meet: onto a point of the other
 * line when one is that close, else onto a new point put into its segment.
 */
function snapEnds(lines, snapUnits) {
  for (const line of lines) {
    for (const end of [0, line.points.length - 1]) {
      const p = line.points[end];
      let best = null;
      for (const other of lines) {
        if (other === line) continue;
        const pts = other.points;
        for (let i = 0; i + 1 < pts.length; i += 1) {
          const n = nearestOnSegment(p, pts[i], pts[i + 1]);
          if (n.d <= snapUnits && (!best || n.d < best.d)) {
            best = { ...n, other, i };
          }
        }
      }
      if (!best || best.d === 0) continue;
      const pts = best.other.points;
      const a = pts[best.i];
      const b = pts[best.i + 1];
      const da = Math.hypot(p[0] - a[0], p[1] - a[1]);
      const db = Math.hypot(p[0] - b[0], p[1] - b[1]);
      if (da <= snapUnits && da <= db) line.points[end] = a;
      else if (db <= snapUnits) line.points[end] = b;
      else {
        const q = [best.x, best.y];
        pts.splice(best.i + 1, 0, q);
        line.points[end] = q;
      }
    }
  }
}

/** Whether a line or ring (world units) touches the area. */
function touches(points, area, closed = false) {
  const { circle } = area;
  const pts = closed ? [...points, points[0]] : points;
  if (pts.length === 1) {
    const [x, y] = pts[0];
    if (circle) return Math.hypot(x - circle.x, y - circle.y) <= circle.r;
    return x >= area.minX && x <= area.maxX && y >= area.minY && y <= area.maxY;
  }
  for (let i = 0; i + 1 < pts.length; i += 1) {
    if (circle) {
      if (
        nearestOnSegment([circle.x, circle.y], pts[i], pts[i + 1]).d <= circle.r
      )
        return true;
    } else if (
      clipLine(
        [pts[i], pts[i + 1]],
        [area.minX, area.minY, area.maxX, area.maxY]
      ).length > 0
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Pull everything within the area from the tiles, as Overpass elements.
 *
 * @param {object} args
 * @param {number} [args.lat]
 * @param {number} [args.lon]
 * @param {number} [args.radiusM]
 * @param {{south: number, west: number, north: number, east: number}} [args.box]
 * @param {Function} [args.fetch] - injected for tests
 * @param {AbortSignal} [args.signal]
 * @param {number} [args.timeoutMs]
 * @returns {Promise<{elements: object[], bytes: number, ms: number, attribution: string, host: string, remark: null}>}
 */
export async function pullTiles({
  lat,
  lon,
  radiusM,
  box,
  fetch: fetchImpl = globalThis.fetch,
  signal,
  timeoutMs = TIMEOUT_MS,
  online = () => globalThis.navigator?.onLine !== false,
} = {}) {
  const where = box ? { box } : { lat, lon, radiusM };
  const started = Date.now();
  const tiles = tileRange(where);
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onOuterAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onOuterAbort, { once: true });
  }
  let fetched;
  try {
    fetched = await Promise.all(
      tiles.map((tile) =>
        fetchTile(tile, { fetchImpl, signal: controller.signal }).then(
          (bytes) => ({ tile, bytes })
        )
      )
    );
  } catch (error) {
    // Stop the other tiles of the pull: one failed tile fails it.
    controller.abort();
    if (typeof error?.code === 'string') throw error;
    if (timedOut || signal?.aborted || !online()) {
      throw fail(
        'no-answer',
        `${TILES_NAME} did not answer: ${error?.message || error}`
      );
    }
    // A refusal without a cross-site header looks like a failed connection.
    throw fail('refused', `${TILES_NAME} refused: ${error?.message || error}`);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener?.('abort', onOuterAbort);
  }

  let decoded;
  try {
    decoded = fetched.map(({ tile, bytes }) => ({
      tile,
      bytes: bytes.length,
      layers: bytes.length ? decodeTile(bytes) : {},
    }));
  } catch (error) {
    throw fail(
      'no-data',
      `${TILES_NAME} sent something other than tiles: ${error.message}`
    );
  }

  const origin = [tiles[0].x * UNITS, tiles[0].y * UNITS];
  const { lines, points, areas } = collect(decoded, origin);
  const centerLat = box ? (box.south + box.north) / 2 : lat;
  snapEnds(
    lines.filter((l) => 'highway' in l.tags),
    SNAP_M / metersPerUnit(centerLat)
  );

  const a = areaBounds(where);
  const area = {
    minX: a.minX - origin[0],
    minY: a.minY - origin[1],
    maxX: a.maxX - origin[0],
    maxY: a.maxY - origin[1],
    circle: a.circle && {
      x: a.circle.x - origin[0],
      y: a.circle.y - origin[1],
      r: a.circle.r,
    },
  };
  const latLon = ([x, y]) => toLatLon(x + origin[0], y + origin[1]);
  const elements = [];
  let id = 0;
  const way = (tags, pts) => {
    const el = trimElement({
      type: 'way',
      id: ++id,
      tags,
      geometry: pts.map(latLon),
    });
    if (el) elements.push(el);
  };
  for (const line of lines) {
    if (!WAY_KEYS.some((k) => k in line.tags)) continue;
    if (touches(line.points, area)) way(line.tags, line.points);
  }
  for (const { tags, rings } of areas.values()) {
    if (!WAY_KEYS.some((k) => k in tags)) continue;
    for (const ring of union(rings)) {
      if (areaOf(ring) <= 0) continue;
      const pts = fromRing(ring);
      if (!touches(pts, area, true)) continue;
      way(tags, [...pts, pts[0]]);
    }
  }
  for (const { tags, x, y } of points) {
    if (!wantedNode(tags) || !touches([[x, y]], area)) continue;
    const at = latLon([x, y]);
    const el = trimElement({ type: 'node', id: ++id, tags, ...at });
    if (el) elements.push(el);
  }
  return {
    elements,
    bytes: decoded.reduce((n, d) => n + d.bytes, 0),
    ms: Date.now() - started,
    attribution: ATTRIBUTION,
    host: TILES_NAME,
    remark: null,
  };
}
