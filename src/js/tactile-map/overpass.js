/**
 * The Overpass pull for the Tactile Map Designer: everything a map reads
 * within a radius of a point, from the public Overpass API, as one
 * form-encoded POST (a simple request: the server answers a preflight 406),
 * with the back-off its commons page asks for and the attribution every pull
 * must show.
 *
 * Measured 2026-10-29: the public server answers in 22 to 50 s whatever the
 * radius, refuses now and then with 502 "at capacity", 504 or 429, and
 * served every pull on the first retry after 30 s. The policy: pause 30 s on
 * a refusal; stay under 10,000 queries and 1 GB a day.
 *
 * Errors carry a `code`: 'busy' (refused three times, after 30 s and 60 s
 * waits), 'no-answer' (the network failed, the 70 s ran out, or the body was
 * not JSON).
 *
 * No DOM here.
 *
 * @license GPL-3.0-or-later
 */
import { trimElement } from './osm-geometry.js';

export const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
export const ATTRIBUTION = 'Map data from OpenStreetMap contributors, ODbL';
export const ATTRIBUTION_URL = 'https://www.openstreetmap.org/copyright';
/** The server's own timeout for the query, in seconds. */
export const QUERY_TIMEOUT_S = 60;
/** Ours, a little past the server's. */
export const TIMEOUT_MS = 70000;
/** The waits between tries after a refusal, in milliseconds. */
export const BACKOFF_MS = Object.freeze([30000, 60000]);
/** The statuses that mean "not now": the server is full or throttling. */
const REFUSALS = new Set([429, 502, 504, 406]);

const WAY_TAGS = ['highway', 'building', 'railway', 'leisure', 'amenity'];
const NODE_TAGS = [
  'entrance',
  'highway=crossing',
  'highway=bus_stop',
  'public_transport',
  'amenity',
  'shop',
];

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

/**
 * The Overpass QL for one map: the ways and nodes of every class the map
 * reads within the radius, with their tags and geometry.
 *
 * @param {{lat: number, lon: number, radiusM: number}} where
 * @returns {string}
 */
export function buildQuery({ lat, lon, radiusM }) {
  const around = `around:${radiusM},${lat},${lon}`;
  const ways = WAY_TAGS.map((t) => `way(${around})[${t}];`).join('');
  const nodes = NODE_TAGS.map((t) => `node(${around})[${t}];`).join('');
  return `[out:json][timeout:${QUERY_TIMEOUT_S}];(${ways}${nodes});out tags geom;`;
}

const defaultWait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Pull everything within the radius, trimmed to what a map reads.
 *
 * @param {object} args
 * @param {number} args.lat
 * @param {number} args.lon
 * @param {number} args.radiusM
 * @param {Function} [args.fetch] - injected for tests
 * @param {(ms: number) => Promise<void>} [args.wait] - injected for tests
 * @param {(seconds: number) => void} [args.onWait] - told before each back-off
 * @param {AbortSignal} [args.signal]
 * @returns {Promise<{elements: object[], bytes: number, ms: number, attribution: string}>}
 */
export async function pullArea({
  lat,
  lon,
  radiusM,
  fetch: fetchImpl = globalThis.fetch,
  wait = defaultWait,
  onWait = () => {},
  signal,
} = {}) {
  const body = 'data=' + encodeURIComponent(buildQuery({ lat, lon, radiusM }));
  const started = Date.now();
  for (let attempt = 0; ; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const onOuterAbort = () => controller.abort();
    if (signal) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener('abort', onOuterAbort, { once: true });
    }
    let response;
    let text;
    try {
      response = await fetchImpl(OVERPASS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: controller.signal,
      });
      text = await response.text();
    } catch (error) {
      throw fail(
        'no-answer',
        `The map data did not arrive: ${error?.message || error}`
      );
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener?.('abort', onOuterAbort);
    }

    if (REFUSALS.has(response.status)) {
      if (attempt >= BACKOFF_MS.length) {
        throw fail(
          'busy',
          `The map server refused ${attempt + 1} times (${response.status}).`
        );
      }
      const ms = BACKOFF_MS[attempt];
      onWait(ms / 1000);
      await wait(ms);
      continue;
    }
    if (!response.ok) {
      throw fail('no-answer', `The map server answered ${response.status}.`);
    }
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw fail(
        'no-answer',
        'The map server answered something other than map data.'
      );
    }
    const raw = Array.isArray(json?.elements) ? json.elements : [];
    const elements = raw.map(trimElement).filter(Boolean);
    return {
      elements,
      bytes: new TextEncoder().encode(text).length,
      ms: Date.now() - started,
      attribution: ATTRIBUTION,
      remark: typeof json?.remark === 'string' ? json.remark : null,
    };
  }
}
