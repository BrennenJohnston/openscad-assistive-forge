/**
 * The Overpass pull for the Tactile Map Designer: one form-encoded POST for
 * everything within a radius, tried on each server of the host list in
 * turn, the back-off the public servers ask for once all have failed, the
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
  OVERPASS_HOSTS,
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

describe('the host list', () => {
  it("names OpenStreetMap's main server first and VK Maps' server second, each with its own wait", () => {
    expect(OVERPASS_HOSTS).toEqual([
      {
        url: 'https://overpass-api.de/api/interpreter',
        name: "OpenStreetMap's main server",
        timeoutMs: 20000,
      },
      {
        url: 'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
        name: "VK Maps' server",
        timeoutMs: 70000,
      },
    ]);
    expect(Object.isFrozen(OVERPASS_HOSTS)).toBe(true);
  });
});

describe('pullArea', () => {
  const where = { lat: 47.6, lon: -122.33, radiusM: 250 };
  const MAIN = OVERPASS_HOSTS[0];
  const VK = OVERPASS_HOSTS[1];
  const aborted = () =>
    new DOMException('The operation was aborted.', 'AbortError');
  /** A fetch that answers per host: a reply, or an Error to throw. */
  function fetchByHost(byUrl) {
    const seen = {};
    return vi.fn(async (url) => {
      const list = byUrl[url];
      const i = (seen[url] = (seen[url] ?? -1) + 1);
      const step = list[Math.min(i, list.length - 1)];
      if (step instanceof Error) throw step;
      return step;
    });
  }
  const urls = (fetch) => fetch.mock.calls.map((c) => c[0]);

  it("posts the query form-encoded as a simple request and resolves the trimmed elements with the pull's size, time, attribution and host", async () => {
    const fetch = fetchSequence(reply(200, ELEMENTS));
    const wait = vi.fn(async () => {});
    const result = await pullArea({ ...where, fetch, wait });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(MAIN.url);
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
    expect(result.host).toBe("OpenStreetMap's main server");
    expect(wait).not.toHaveBeenCalled();
  });

  it("goes to VK Maps' server at once when the main server refuses (406), without a back-off", async () => {
    const fetch = fetchByHost({
      [MAIN.url]: [reply(406, '<html>406 Not Acceptable</html>')],
      [VK.url]: [reply(200, ELEMENTS)],
    });
    const wait = vi.fn(async () => {});
    const onWait = vi.fn();
    const result = await pullArea({ ...where, fetch, wait, onWait });
    expect(urls(fetch)).toEqual([MAIN.url, VK.url]);
    expect(onWait).toHaveBeenCalledTimes(1);
    expect(onWait).toHaveBeenCalledWith(0, "VK Maps' server", {
      from: "OpenStreetMap's main server",
      reason: 'refused',
    });
    expect(onWait).not.toHaveBeenCalledWith(30);
    expect(wait).not.toHaveBeenCalled();
    expect(result.elements).toHaveLength(2);
    expect(result.host).toBe("VK Maps' server");
    expect(result.attribution).toBe(ATTRIBUTION);
  });

  it('goes to the second server the same way when the browser blocks the answer (no cross-origin header)', async () => {
    const fetch = fetchByHost({
      [MAIN.url]: [new TypeError('Failed to fetch')],
      [VK.url]: [reply(200, ELEMENTS)],
    });
    const wait = vi.fn(async () => {});
    const onWait = vi.fn();
    const result = await pullArea({
      ...where,
      fetch,
      wait,
      onWait,
      online: () => true,
    });
    expect(urls(fetch)).toEqual([MAIN.url, VK.url]);
    expect(onWait).toHaveBeenCalledWith(0, "VK Maps' server", {
      from: "OpenStreetMap's main server",
      reason: 'refused',
    });
    expect(wait).not.toHaveBeenCalled();
    expect(result.host).toBe("VK Maps' server");
  });

  it('goes to the second server when the first gives no answer within its own wait, and stops waiting for the first', async () => {
    const hosts = [
      { ...MAIN, timeoutMs: 5 },
      { ...VK, timeoutMs: 1000 },
    ];
    let mainSignal = null;
    const fetch = vi.fn(async (url, init) => {
      if (url === MAIN.url) {
        mainSignal = init.signal;
        return new Promise((_, reject) => {
          init.signal.addEventListener('abort', () => reject(aborted()));
        });
      }
      return reply(200, ELEMENTS);
    });
    const onWait = vi.fn();
    const result = await pullArea({
      ...where,
      hosts,
      fetch,
      wait: vi.fn(async () => {}),
      onWait,
      online: () => true,
    });
    expect(mainSignal.aborted).toBe(true);
    expect(onWait).toHaveBeenCalledWith(0, "VK Maps' server", {
      from: "OpenStreetMap's main server",
      reason: 'no-answer',
    });
    expect(result.host).toBe("VK Maps' server");
  });

  it('counts servers that ran out of time toward the back-off, as refusals are', async () => {
    const hosts = [
      { ...MAIN, timeoutMs: 5 },
      { ...VK, timeoutMs: 5 },
    ];
    let n = 0;
    const fetch = vi.fn(async (url, init) => {
      n += 1;
      if (n === 3) return reply(200, ELEMENTS);
      return new Promise((_, reject) => {
        init.signal.addEventListener('abort', () => reject(aborted()));
      });
    });
    const wait = vi.fn(async () => {});
    const result = await pullArea({
      ...where,
      hosts,
      fetch,
      wait,
      online: () => true,
    });
    expect(wait.mock.calls.map((c) => c[0])).toEqual([30000]);
    expect(result.host).toBe("OpenStreetMap's main server");
  });

  it('sends the very same query body to both servers', async () => {
    const fetch = fetchByHost({
      [MAIN.url]: [reply(503, 'busy')],
      [VK.url]: [reply(200, ELEMENTS)],
    });
    await pullArea({ ...where, fetch, wait: vi.fn(async () => {}) });
    const [first, second] = fetch.mock.calls.map((c) => c[1]);
    expect(second.body).toBe(first.body);
    expect(second.method).toBe('POST');
    expect(second.headers).toEqual(first.headers);
  });

  it("never asks VK Maps' server when the main server answers", async () => {
    const fetch = fetchByHost({
      [MAIN.url]: [reply(200, ELEMENTS)],
      [VK.url]: [reply(200, ELEMENTS)],
    });
    const onWait = vi.fn();
    await pullArea({ ...where, fetch, wait: vi.fn(), onWait });
    expect(urls(fetch)).toEqual([MAIN.url]);
    expect(onWait).not.toHaveBeenCalled();
  });

  it('treats 406, 429, 502, 503 and 504 as the server refusing', async () => {
    for (const status of [406, 429, 502, 503, 504]) {
      const fetch = fetchByHost({
        [MAIN.url]: [reply(status, 'no')],
        [VK.url]: [reply(200, ELEMENTS)],
      });
      const onWait = vi.fn();
      const result = await pullArea({
        ...where,
        fetch,
        wait: vi.fn(async () => {}),
        onWait,
      });
      expect(urls(fetch)).toEqual([MAIN.url, VK.url]);
      expect(onWait.mock.calls[0][2].reason).toBe('refused');
      expect(result.host).toBe("VK Maps' server");
    }
  });

  it('only when every server failed does it wait 30 s, then 60 s, trying the list again each time, then gives up as busy', async () => {
    const fetch = fetchByHost({
      [MAIN.url]: [reply(406, 'no')],
      [VK.url]: [reply(429, 'slow down')],
    });
    const wait = vi.fn(async () => {});
    const onWait = vi.fn();
    await expect(
      pullArea({ ...where, fetch, wait, onWait })
    ).rejects.toMatchObject({ code: 'busy' });
    expect(urls(fetch)).toEqual([
      MAIN.url,
      VK.url,
      MAIN.url,
      VK.url,
      MAIN.url,
      VK.url,
    ]);
    expect(wait.mock.calls.map((c) => c[0])).toEqual([30000, 60000]);
    expect(onWait.mock.calls.map((c) => c[0])).toEqual([0, 30, 0, 60, 0]);
    expect(onWait.mock.calls.filter((c) => c[0] > 0)).toEqual([[30], [60]]);
  });

  it('a server list that answers on the second try resolves the elements after one 30 s wait', async () => {
    const fetch = fetchByHost({
      [MAIN.url]: [new TypeError('Failed to fetch')],
      [VK.url]: [reply(504, 'gateway'), reply(200, ELEMENTS)],
    });
    const wait = vi.fn(async () => {});
    const result = await pullArea({
      ...where,
      fetch,
      wait,
      online: () => true,
    });
    expect(wait.mock.calls.map((c) => c[0])).toEqual([30000]);
    expect(result.elements).toHaveLength(2);
    expect(result.host).toBe("VK Maps' server");
  });

  it('moves on from a server that answers something other than map data, and says no-answer at once when no server can', async () => {
    const fetch = fetchByHost({
      [MAIN.url]: [reply(200, '<html>maintenance</html>')],
      [VK.url]: [reply(400, 'bad request')],
    });
    const wait = vi.fn(async () => {});
    const onWait = vi.fn();
    await expect(
      pullArea({ ...where, fetch, wait, onWait })
    ).rejects.toMatchObject({ code: 'no-answer' });
    expect(urls(fetch)).toEqual([MAIN.url, VK.url]);
    expect(onWait).toHaveBeenCalledWith(0, "VK Maps' server", {
      from: "OpenStreetMap's main server",
      reason: 'no-data',
    });
    expect(wait).not.toHaveBeenCalled();
  });

  it('says no-answer at once when the device is offline, without waiting or trying the second server', async () => {
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

  it('says no-answer at once when the person stops the pull', async () => {
    const controller = new AbortController();
    const fetch = vi.fn(async () => {
      controller.abort();
      throw aborted();
    });
    await expect(
      pullArea({
        ...where,
        fetch,
        wait: vi.fn(),
        signal: controller.signal,
        online: () => true,
      })
    ).rejects.toMatchObject({ code: 'no-answer' });
    expect(fetch).toHaveBeenCalledTimes(1);
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
