/**
 * The Overpass pull for the Tactile Map Designer: everything a map reads
 * within a radius of a point, from the public Overpass servers, as one
 * form-encoded POST (a simple request: the server answers a preflight 406),
 * with the back-off their commons page asks for and the attribution every
 * pull must show.
 *
 * Measured 2026-11-01 from the deployed site: the main server refuses the
 * site's requests within a second (an error page with no cross-origin
 * header, so the browser sees only a failed fetch; 406 outside the page),
 * while VK Maps' server answers the same query with the header in 18 to 24 s.
 * So each attempt tries the host list in order, moving to the next server at
 * once on a refusal, a blocked answer or no answer within that server's own
 * wait; only when every server failed does the 30 s, then 60 s back-off run
 * and the list start again.
 *
 * Errors carry a `code`: 'busy' (every server refused or ran out of time,
 * three times, after 30 s and 60 s waits), 'no-answer' (offline, stopped by
 * the person, or every server answered with something other than map data).
 *
 * No DOM here.
 *
 * @license GPL-3.0-or-later
 */
import { trimElement } from './osm-geometry.js';

/**
 * The servers a pull asks, in order, each with the name the status says and
 * how long to wait for its answer. The main server answers in 22 to 50 s when
 * it answers at all (measured 2026-10-29), but refuses the deployed site at
 * once; 20 s keeps a person from waiting long on it before the second.
 */
export const OVERPASS_HOSTS = Object.freeze([
  Object.freeze({
    url: 'https://overpass-api.de/api/interpreter',
    name: "OpenStreetMap's main server",
    timeoutMs: 20000,
  }),
  Object.freeze({
    url: 'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
    name: "VK Maps' server",
    timeoutMs: 70000,
  }),
]);
export const ATTRIBUTION = 'Map data from OpenStreetMap contributors, ODbL';
export const ATTRIBUTION_URL = 'https://www.openstreetmap.org/copyright';
/** The server's own timeout for the query, in seconds. */
export const QUERY_TIMEOUT_S = 60;
/** The waits between tries of the whole list, in milliseconds. */
export const BACKOFF_MS = Object.freeze([30000, 60000]);
/** The statuses that mean "not now": the server is full or throttling. */
const REFUSALS = new Set([429, 502, 503, 504, 406]);

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
export function buildQuery({ lat, lon, radiusM, box }) {
  // A box (south, west, north, east): the ground a place map's scale covers,
  // or the room around two places; a radius around one place otherwise.
  const around = box
    ? `${box.south},${box.west},${box.north},${box.east}`
    : `around:${radiusM},${lat},${lon}`;
  const ways = WAY_TAGS.map((t) => `way(${around})[${t}];`).join('');
  const nodes = NODE_TAGS.map((t) => `node(${around})[${t}];`).join('');
  return `[out:json][timeout:${QUERY_TIMEOUT_S}];(${ways}${nodes});out tags geom;`;
}

const defaultWait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Ask one server. Resolves `{ json, text }` on map data, or `{ failed }` with
 * 'refused' (a refusal status, or a fetch the browser blocked), 'no-answer'
 * (nothing within the server's wait) or 'no-data' (another error status, or
 * a body that is not JSON); the first two are worth asking again later.
 * Throws 'no-answer' when the person stopped the pull or the device is
 * offline: no other server would help.
 */
async function askHost(host, { body, fetchImpl, signal, online }) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, host.timeoutMs);
  const onOuterAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onOuterAbort, { once: true });
  }
  let response;
  let text;
  try {
    response = await fetchImpl(host.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: controller.signal,
    });
    text = await response.text();
  } catch (error) {
    if (signal?.aborted || !online()) {
      throw fail(
        'no-answer',
        `The map data did not arrive: ${error?.message || error}`
      );
    }
    // An error page without a cross-site header looks exactly like a failed
    // connection to the page: the server is refusing this site.
    return { failed: timedOut ? 'no-answer' : 'refused' };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener?.('abort', onOuterAbort);
  }
  if (REFUSALS.has(response.status)) return { failed: 'refused' };
  if (!response.ok) return { failed: 'no-data' };
  try {
    return { json: JSON.parse(text), text };
  } catch {
    return { failed: 'no-data' };
  }
}

/**
 * Pull everything within the radius, trimmed to what a map reads.
 *
 * @param {object} args
 * @param {number} args.lat
 * @param {number} args.lon
 * @param {number} args.radiusM
 * @param {Array<{url: string, name: string, timeoutMs: number}>} [args.hosts]
 * @param {Function} [args.fetch] - injected for tests
 * @param {(ms: number) => Promise<void>} [args.wait] - injected for tests
 * @param {(seconds: number, next?: string, info?: {from: string, reason: string}) => void} [args.onWait]
 *   told the seconds before each back-off; told 0, the next server's name
 *   and why when the pull moves to the next server at once
 * @param {AbortSignal} [args.signal]
 * @returns {Promise<{elements: object[], bytes: number, ms: number, attribution: string, host: string, remark: string|null}>}
 */
export async function pullArea({
  lat,
  lon,
  radiusM,
  box,
  hosts = OVERPASS_HOSTS,
  fetch: fetchImpl = globalThis.fetch,
  wait = defaultWait,
  onWait = () => {},
  signal,
  online = () => globalThis.navigator?.onLine !== false,
} = {}) {
  const body =
    'data=' + encodeURIComponent(buildQuery({ lat, lon, radiusM, box }));
  const started = Date.now();
  for (let attempt = 0; ; attempt += 1) {
    let later = 0;
    for (let h = 0; h < hosts.length; h += 1) {
      const host = hosts[h];
      const answer = await askHost(host, { body, fetchImpl, signal, online });
      if (answer.failed) {
        if (answer.failed !== 'no-data') later += 1;
        const next = hosts[h + 1];
        if (next) {
          onWait(0, next.name, { from: host.name, reason: answer.failed });
        }
        continue;
      }
      const { json, text } = answer;
      const raw = Array.isArray(json?.elements) ? json.elements : [];
      const elements = raw.map(trimElement).filter(Boolean);
      return {
        elements,
        bytes: new TextEncoder().encode(text).length,
        ms: Date.now() - started,
        attribution: ATTRIBUTION,
        host: host.name,
        remark: typeof json?.remark === 'string' ? json.remark : null,
      };
    }
    if (later === 0) {
      throw fail('no-answer', 'No map server answered with map data.');
    }
    if (attempt >= BACKOFF_MS.length) {
      throw fail('busy', `Every map server refused, ${attempt + 1} times.`);
    }
    const ms = BACKOFF_MS[attempt];
    onWait(ms / 1000);
    await wait(ms);
  }
}
