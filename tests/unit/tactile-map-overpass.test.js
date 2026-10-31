/**
 * The Overpass pull for the Tactile Map Designer: one form-encoded POST for
 * everything within a radius, the back-off the public server asks for, the
 * elements trimmed to what a map reads, and the attribution every pull
 * carries. The fetch, the wait and the progress callback are injected.
 *
 * @license GPL-3.0-or-later
 */
import { describe, it, expect, vi } from 'vitest';
import {
  buildQuery,
  pullArea,
  ATTRIBUTION,
  ATTRIBUTION_URL,
  OVERPASS_URL,
} from '../../src/js/tactile-map/overpass.js';

const ELEMENTS = {
  elements: [
    {
      type: 'way',
      id: 1,
      tags: { highway: 'footway', footway: 'sidewalk', source: 'survey' },
      geometry: [
        { lat: 47.6, lon: -122.33 },
        { lat: 47.601, lon: -122.33 },
      ],
    },
    {
      type: 'node',
      id: 2,
      lat: 47.6,
      lon: -122.331,
      tags: { highway: 'crossing', crossing: 'marked' },
    },
    {
      type: 'way',
      id: 3,
      tags: { source: 'survey' },
      geometry: [{ lat: 47.6, lon: -122.33 }],
    },
  ],
};

const reply = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
});

/** A fetch that answers the given statuses in turn, the last one again. */
function fetchSequence(...replies) {
  let i = 0;
  return vi.fn(async () => replies[Math.min(i++, replies.length - 1)]);
}

describe('buildQuery', () => {
  it('asks for every way and node class of the map within the radius, with tags and geometry', () => {
    const q = buildQuery({ lat: 47.6, lon: -122.33, radiusM: 250 });
    expect(q.startsWith('[out:json][timeout:60];(')).toBe(true);
    expect(q.endsWith(');out tags geom;')).toBe(true);
    for (const sel of [
      'way(around:250,47.6,-122.33)[highway]',
      'way(around:250,47.6,-122.33)[building]',
      'way(around:250,47.6,-122.33)[railway]',
      'way(around:250,47.6,-122.33)[leisure]',
      'way(around:250,47.6,-122.33)[amenity]',
      'node(around:250,47.6,-122.33)[entrance]',
      'node(around:250,47.6,-122.33)[highway=crossing]',
      'node(around:250,47.6,-122.33)[highway=bus_stop]',
      'node(around:250,47.6,-122.33)[public_transport]',
      'node(around:250,47.6,-122.33)[amenity]',
      'node(around:250,47.6,-122.33)[shop]',
    ]) {
      expect(q).toContain(sel + ';');
    }
  });

  it('asks for the same classes inside a box, for a map between two places', () => {
    const q = buildQuery({
      box: { south: 47.652, west: -122.307, north: 47.6562, east: -122.303 },
    });
    expect(q.startsWith('[out:json][timeout:60];(')).toBe(true);
    for (const sel of [
      'way(47.652,-122.307,47.6562,-122.303)[highway]',
      'way(47.652,-122.307,47.6562,-122.303)[building]',
      'node(47.652,-122.307,47.6562,-122.303)[entrance]',
      'node(47.652,-122.307,47.6562,-122.303)[highway=crossing]',
    ]) {
      expect(q).toContain(sel + ';');
    }
    expect(q).not.toContain('around:');
  });
});

describe('pullArea', () => {
  const where = { lat: 47.6, lon: -122.33, radiusM: 250 };

  it("posts the query form-encoded as a simple request and resolves the trimmed elements with the pull's size, time and attribution", async () => {
    const fetch = fetchSequence(reply(200, ELEMENTS));
    const wait = vi.fn(async () => {});
    const result = await pullArea({ ...where, fetch, wait });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(OVERPASS_URL);
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      'Content-Type': 'application/x-www-form-urlencoded',
    });
    expect(init.body.startsWith('data=')).toBe(true);
    expect(decodeURIComponent(init.body.slice(5))).toBe(buildQuery(where));
    expect(result.elements).toHaveLength(2);
    expect(result.elements[0].tags).toEqual({
      highway: 'footway',
      footway: 'sidewalk',
    });
    expect(result.elements[1]).toMatchObject({ type: 'node', id: 2 });
    expect(result.bytes).toBeGreaterThan(100);
    expect(result.ms).toBeGreaterThanOrEqual(0);
    expect(result.attribution).toBe(ATTRIBUTION);
    expect(wait).not.toHaveBeenCalled();
  });

  it('waits 30 s after a 502 and tries again, saying so', async () => {
    const fetch = fetchSequence(
      reply(502, '<h1>502 at capacity</h1>'),
      reply(200, ELEMENTS)
    );
    const wait = vi.fn(async () => {});
    const onWait = vi.fn();
    const result = await pullArea({ ...where, fetch, wait, onWait });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledTimes(1);
    expect(wait).toHaveBeenCalledWith(30000);
    expect(onWait).toHaveBeenCalledWith(30);
    expect(result.elements).toHaveLength(2);
  });

  it('gives up as busy after three refusals, having waited 30 s then 60 s', async () => {
    const fetch = fetchSequence(reply(429, 'slow down'));
    const wait = vi.fn(async () => {});
    const onWait = vi.fn();
    await expect(
      pullArea({ ...where, fetch, wait, onWait })
    ).rejects.toMatchObject({ code: 'busy' });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(wait.mock.calls.map((c) => c[0])).toEqual([30000, 60000]);
    expect(onWait.mock.calls.map((c) => c[0])).toEqual([30, 60]);
  });

  it('treats 406, 503 and 504 as the server refusing, like 429 and 502', async () => {
    for (const status of [406, 503, 504]) {
      const fetch = fetchSequence(reply(status, 'no'), reply(200, ELEMENTS));
      const wait = vi.fn(async () => {});
      const result = await pullArea({ ...where, fetch, wait });
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(result.elements).toHaveLength(2);
    }
  });

  // An overloaded server's error page can carry no cross-site header, and
  // then the browser reports only "Failed to fetch": that is the server
  // refusing too (MEASURED on 2026-10-30, a 503 for over an hour).
  it('counts a request that gets no answer as the server refusing: waits, tries again, and gives up as busy', async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const wait = vi.fn(async () => {});
    const onWait = vi.fn();
    await expect(
      pullArea({ ...where, fetch, wait, onWait, online: () => true })
    ).rejects.toMatchObject({ code: 'busy' });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(onWait.mock.calls.map((c) => c[0])).toEqual([30, 60]);
  });

  it('a request with no answer that then succeeds resolves the elements', async () => {
    let n = 0;
    const fetch = vi.fn(async () => {
      if (n++ === 0) throw new TypeError('Failed to fetch');
      return reply(200, ELEMENTS);
    });
    const wait = vi.fn(async () => {});
    const result = await pullArea({
      ...where,
      fetch,
      wait,
      online: () => true,
    });
    expect(wait).toHaveBeenCalledWith(30000);
    expect(result.elements).toHaveLength(2);
  });

  it('says no-answer at once when the device is offline, without waiting', async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const wait = vi.fn(async () => {});
    await expect(
      pullArea({ ...where, fetch, wait, online: () => false })
    ).rejects.toMatchObject({ code: 'no-answer' });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });

  it('posts the box query when given a box', async () => {
    const fetch = fetchSequence(reply(200, ELEMENTS));
    const box = {
      south: 47.652,
      west: -122.307,
      north: 47.6562,
      east: -122.303,
    };
    await pullArea({ box, fetch, wait: vi.fn() });
    expect(decodeURIComponent(fetch.mock.calls[0][1].body.slice(5))).toBe(
      buildQuery({ box })
    );
  });

  it("names the data's source and its page", () => {
    expect(ATTRIBUTION).toBe('Map data from OpenStreetMap contributors, ODbL');
    expect(ATTRIBUTION_URL).toBe('https://www.openstreetmap.org/copyright');
  });
});
