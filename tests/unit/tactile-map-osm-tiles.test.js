/**
 * The map data from the OpenStreetMap US Sourdough tiles: the zoom 15 tiles
 * over an area, each feature kept once (clipped to its own tile), shapes cut
 * by a tile edge joined again, lines snapped where they meet, and the
 * elements the draft builders read. Then the order of the sources: the tiles
 * first, the Overpass servers when the tiles fail.
 *
 * The two fixtures are real tiles over the University of Washington (zoom
 * 15, x 5251 and 5252, y 11437, fetched 2026-11-01; map data from
 * OpenStreetMap contributors, ODbL). The fetch is injected.
 *
 * @license GPL-3.0-or-later
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  TILES_NAME,
  TILE_URL,
  pullTiles,
  tileRange,
} from '../../src/js/tactile-map/osm-tiles.js';
import { pullMapData } from '../../src/js/tactile-map/map-data.js';
import { OVERPASS_HOSTS } from '../../src/js/tactile-map/overpass.js';
import { draftPlan } from '../../src/js/tactile-map/plan-from-osm.js';
import { buildWalkGraph } from '../../src/js/tactile-map/walk-graph.js';

const TILE = {
  '15/5251/11437': readFileSync(
    'tests/fixtures/tactile-map/sourdough-15-5251-11437.mvt'
  ),
  '15/5252/11437': readFileSync(
    'tests/fixtures/tactile-map/sourdough-15-5252-11437.mvt'
  ),
};
const GATES = { lat: 47.652873, lon: -122.3044814 };
/** Both fixture tiles, one row: the Gates Center and the athletic fields. */
const BOX = { south: 47.651, west: -122.308, north: 47.657, east: -122.295 };

const urlOf = (z, x, y) =>
  TILE_URL.replace('{z}', z).replace('{x}', x).replace('{y}', y);

/** A fetch that serves the fixture tiles and an empty answer for the rest. */
function tileFetch() {
  return vi.fn(async (url) => {
    const key = Object.keys(TILE).find((k) => url === urlOf(...k.split('/')));
    if (!key) return { ok: true, status: 204, arrayBuffer: async () => new ArrayBuffer(0) };
    const bytes = TILE[key];
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () =>
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    };
  });
}

const tagged = (elements, key, value) =>
  elements.filter((e) => e.tags[key] === value);

describe('the tiles over an area', () => {
  it("names the service and asks for its zoom 15 tiles", () => {
    expect(TILES_NAME).toBe("OpenStreetMap US's map tiles");
    expect(TILE_URL).toBe(
      'https://tiles.openstreetmap.us/vector/sourdough/{z}/{x}/{y}.mvt'
    );
    expect(tileRange({ box: BOX })).toEqual([
      { z: 15, x: 5251, y: 11437 },
      { z: 15, x: 5252, y: 11437 },
    ]);
    // A circle of 250 m around the Gates Center sits in one tile.
    expect(tileRange({ ...GATES, radiusM: 250 })).toEqual([
      { z: 15, x: 5251, y: 11437 },
    ]);
  });
});

describe('pullTiles', () => {
  it('turns the tiles into the elements a draft reads: sidewalks, crossings, steps, entrances, stops and named buildings', async () => {
    const fetch = tileFetch();
    const result = await pullTiles({ box: BOX, fetch });
    expect(fetch).toHaveBeenCalledTimes(2);
    for (const [url, init] of fetch.mock.calls) {
      expect(url.startsWith('https://tiles.openstreetmap.us/')).toBe(true);
      expect(init.headers).toBeUndefined();
      expect(init.signal).toBeTruthy();
    }
    const { elements } = result;
    const ways = elements.filter((e) => e.type === 'way');
    const nodes = elements.filter((e) => e.type === 'node');
    // 18 sidewalk lines touch the box (MEASURED 2026-11-01).
    expect(tagged(ways, 'footway', 'sidewalk').length).toBeGreaterThanOrEqual(15);
    expect(tagged(ways, 'footway', 'crossing').length).toBeGreaterThan(40);
    expect(tagged(ways, 'highway', 'steps').length).toBeGreaterThan(30);
    expect(tagged(nodes, 'highway', 'crossing').length).toBeGreaterThan(40);
    // Counted in the box by an independent decoder (Python
    // mapbox-vector-tile): 134 entrance points and 18 stops.
    expect(nodes.filter((n) => n.tags.entrance).length).toBe(134);
    expect(
      nodes.filter((n) => n.tags.highway === 'bus_stop' || n.tags.public_transport)
        .length
    ).toBe(18);
    const gates = ways.find((w) => w.tags.name === 'Bill & Melinda Gates Center');
    expect(gates.tags.building).toBeTruthy();
    expect(gates.geometry[0]).toEqual(gates.geometry[gates.geometry.length - 1]);
    // Nothing a map does not read is kept.
    for (const e of elements) {
      expect(e.tags._minzoom).toBeUndefined();
      expect(e.tags.lit).toBeUndefined();
    }
    expect(result.host).toBe("OpenStreetMap US's map tiles");
    expect(result.bytes).toBe(TILE['15/5251/11437'].length + TILE['15/5252/11437'].length);
    expect(result.attribution).toBe(
      'Map data from OpenStreetMap contributors, ODbL'
    );
  });

  it('gives every element its own number, as the draft builders key them', async () => {
    const { elements } = await pullTiles({ box: BOX, fetch: tileFetch() });
    const ways = elements.filter((e) => e.type === 'way').map((e) => e.id);
    const nodes = elements.filter((e) => e.type === 'node').map((e) => e.id);
    expect(new Set(ways).size).toBe(ways.length);
    expect(new Set(nodes).size).toBe(nodes.length);
    for (const id of [...ways, ...nodes]) expect(Number.isInteger(id)).toBe(true);
  });

  it('joins a building cut by the tile edge into one outline', async () => {
    const { elements } = await pullTiles({ box: BOX, fetch: tileFetch() });
    const edge = -122.2998046875;
    const tennis = elements.filter((e) => e.tags.name === 'Nordstrom Tennis Center');
    expect(tennis).toHaveLength(1);
    const lons = tennis[0].geometry.map((p) => p.lon);
    expect(Math.min(...lons)).toBeLessThan(edge);
    expect(Math.max(...lons)).toBeGreaterThan(edge);
  });

  it('keeps a point the two tiles both carry once', async () => {
    const { elements } = await pullTiles({ box: BOX, fetch: tileFetch() });
    const key = (n) => `${n.lat.toFixed(7)},${n.lon.toFixed(7)}`;
    const nodes = elements.filter((e) => e.type === 'node');
    const seen = new Map();
    for (const n of nodes) {
      const k = `${key(n)} ${JSON.stringify(n.tags)}`;
      seen.set(k, (seen.get(k) || 0) + 1);
    }
    expect([...seen.values()].every((n) => n === 1)).toBe(true);
  });

  it('meets the walks at the tile edge, so the walk graph runs from one tile into the next', async () => {
    const { elements } = await pullTiles({ box: BOX, fetch: tileFetch() });
    const graph = buildWalkGraph(elements);
    const edge = -122.2998046875;
    const key = (p) => `${p.lat.toFixed(7)},${p.lon.toFixed(7)}`;
    const footways = elements.filter(
      (e) => e.type === 'way' && e.tags.highway === 'footway'
    );
    const west = footways.filter((w) => w.geometry.some((p) => p.lon < edge - 1e-6));
    const east = footways.filter((w) => w.geometry.some((p) => p.lon > edge + 1e-6));
    const onEdge = (w) =>
      w.geometry.filter((p) => Math.abs(p.lon - edge) < 1e-7).map(key);
    const shared = west
      .flatMap(onEdge)
      .filter((k) => east.some((w) => onEdge(w).includes(k)));
    expect(shared.length).toBeGreaterThan(0);
    // The shared point joins both pieces in the walk graph.
    const neighbors = (graph.edges.get(shared[0]) || []).map((e) => e.to);
    const pointOf = (k) => graph.points.get(k);
    expect(neighbors.some((k) => pointOf(k).lon < edge - 1e-7)).toBe(true);
    expect(neighbors.some((k) => pointOf(k).lon > edge + 1e-7)).toBe(true);
  });

  it('keeps only what lies within a circle around a place', async () => {
    const { elements } = await pullTiles({ ...GATES, radiusM: 250, fetch: tileFetch() });
    const m = (p) =>
      Math.hypot(
        (p.lat - GATES.lat) * 110540,
        (p.lon - GATES.lon) * 111320 * Math.cos((GATES.lat * Math.PI) / 180)
      );
    for (const e of elements) {
      if (e.type === 'node') expect(m(e)).toBeLessThanOrEqual(251);
    }
    expect(elements.some((e) => e.tags.name === 'Nordstrom Tennis Center')).toBe(false);
    expect(elements.some((e) => e.tags.name === 'Bill & Melinda Gates Center')).toBe(true);
  });

  it('says refused when the service refuses, and no-answer when it is silent past its wait or the device is offline', async () => {
    const refusing = vi.fn(async () => ({ ok: false, status: 429, arrayBuffer: async () => new ArrayBuffer(0) }));
    await expect(pullTiles({ box: BOX, fetch: refusing })).rejects.toMatchObject({ code: 'refused' });

    const blocked = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(
      pullTiles({ box: BOX, fetch: blocked, online: () => true })
    ).rejects.toMatchObject({ code: 'refused' });
    await expect(
      pullTiles({ box: BOX, fetch: blocked, online: () => false })
    ).rejects.toMatchObject({ code: 'no-answer' });

    const silent = vi.fn(
      (url, init) =>
        new Promise((_, reject) => {
          init.signal.addEventListener('abort', () =>
            reject(new DOMException('The operation was aborted.', 'AbortError'))
          );
        })
    );
    await expect(
      pullTiles({ box: BOX, fetch: silent, timeoutMs: 5, online: () => true })
    ).rejects.toMatchObject({ code: 'no-answer' });

    const garbled = vi.fn(async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => new Uint8Array([0x1a, 0xff, 0xff]).buffer,
    }));
    await expect(pullTiles({ box: BOX, fetch: garbled })).rejects.toMatchObject({ code: 'no-data' });
  });

  it('gives a draft of the Gates Center with its sidewalks on and its entrances, from the same builder as the Overpass data', async () => {
    const { elements } = await pullTiles({ ...GATES, radiusM: 250, fetch: tileFetch() });
    const { plan, counts } = draftPlan({
      elements,
      center: GATES,
      radiusM: 250,
      landmarks: ['entrance', 'transit-stop'],
      size: { w: 480, h: 360 },
      place: { name: 'Bill & Melinda Gates Center, 3800, East Stevens Way Northeast', ...GATES },
    });
    expect(plan.features.some((f) => f.class === 'walkway' && f.on)).toBe(true);
    expect(plan.features.some((f) => f.class === 'entrance' && f.on)).toBe(true);
    expect(counts.on).toBeGreaterThan(0);
  });
});

describe('pullMapData: the tiles first, the Overpass servers when they fail', () => {
  const where = { ...GATES, radiusM: 250 };

  it('takes the tiles and never asks an Overpass server when the tiles answer', async () => {
    const overpass = vi.fn();
    const onWait = vi.fn();
    const result = await pullMapData({ ...where, fetch: tileFetch(), overpass, onWait });
    expect(result.host).toBe("OpenStreetMap US's map tiles");
    expect(result.elements.length).toBeGreaterThan(100);
    expect(overpass).not.toHaveBeenCalled();
    expect(onWait).not.toHaveBeenCalled();
  });

  it("moves to OpenStreetMap's main server at once when the tiles fail, saying so, and passes the pull on", async () => {
    const refusing = vi.fn(async () => ({ ok: false, status: 503, arrayBuffer: async () => new ArrayBuffer(0) }));
    const answer = { elements: [], bytes: 1, ms: 1, host: "VK Maps' server" };
    const overpass = vi.fn(async () => answer);
    const onWait = vi.fn();
    const result = await pullMapData({ ...where, fetch: refusing, overpass, onWait });
    expect(result).toBe(answer);
    expect(onWait).toHaveBeenCalledTimes(1);
    expect(onWait).toHaveBeenCalledWith(0, OVERPASS_HOSTS[0].name, {
      from: "OpenStreetMap US's map tiles",
      reason: 'refused',
    });
    const passed = overpass.mock.calls[0][0];
    expect([passed.lat, passed.lon, passed.radiusM]).toEqual([where.lat, where.lon, 250]);
    expect(passed.onWait).toBe(onWait);
    expect(passed.fetch).toBe(refusing);
  });

  it('stops at once, asking no other server, when the device is offline', async () => {
    const blocked = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const overpass = vi.fn();
    await expect(
      pullMapData({ ...where, fetch: blocked, overpass, online: () => false })
    ).rejects.toMatchObject({ code: 'no-answer' });
    expect(overpass).not.toHaveBeenCalled();
  });
});
