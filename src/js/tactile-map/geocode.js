/**
 * Geocoding for the Tactile Map Designer: a typed address or place name
 * becomes up to five places from Nominatim, the OpenStreetMap geocoder.
 *
 * Under its usage policy, as read on 2026-10-29: at most one request a
 * second, no autocomplete (a search runs on a press, never on a keystroke),
 * the application identified (the page's origin travels as the Referer; no
 * email is added), the attribution shown beside the results. The request is
 * a plain GET with no custom header, so the browser sends it without a
 * preflight.
 *
 * Errors carry a `code`: 'empty' (nothing to search), 'rate' (a second
 * search within a second), 'no-answer' (the server did not answer 200, or
 * the network failed, or the 15 s ran out).
 *
 * No DOM here.
 *
 * @license GPL-3.0-or-later
 */

export const NOMINATIM_SEARCH_URL =
  'https://nominatim.openstreetmap.org/search';
/** The policy's floor between two requests, in milliseconds. */
export const MIN_INTERVAL_MS = 1000;
/** How long a search may take before it counts as no answer. */
export const TIMEOUT_MS = 15000;
export const RESULT_LIMIT = 5;

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

/**
 * A geocoder with its own clock and fetch (injected for tests) and its own
 * one-a-second gate.
 *
 * @param {{ fetch?: Function, now?: () => number }} [deps]
 * @returns {{ searchPlaces: (query: string, options?: { signal?: AbortSignal }) => Promise<Array<{ name: string, lat: number, lon: number, kind: string }>> }}
 */
export function createGeocoder({
  fetch: fetchImpl = globalThis.fetch,
  now = Date.now,
} = {}) {
  let lastAt = -Infinity;

  async function searchPlaces(query, { signal } = {}) {
    const q = String(query ?? '').trim();
    if (!q) throw fail('empty', 'Nothing to search for.');
    const at = now();
    if (at - lastAt < MIN_INTERVAL_MS) {
      throw fail('rate', 'One search a second.');
    }
    lastAt = at;

    const url =
      `${NOMINATIM_SEARCH_URL}?format=jsonv2&limit=${RESULT_LIMIT}` +
      `&q=${encodeURIComponent(q)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const onOuterAbort = () => controller.abort();
    if (signal) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener('abort', onOuterAbort, { once: true });
    }
    let text;
    try {
      const response = await fetchImpl(url, { signal: controller.signal });
      if (!response.ok) {
        throw fail(
          'no-answer',
          `The address search answered ${response.status}.`
        );
      }
      text = await response.text();
    } catch (error) {
      if (error && error.code) throw error;
      throw fail(
        'no-answer',
        `The address search did not answer: ${error?.message || error}`
      );
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener?.('abort', onOuterAbort);
    }

    let list;
    try {
      list = JSON.parse(text);
    } catch {
      throw fail(
        'no-answer',
        'The address search answered something other than places.'
      );
    }
    if (!Array.isArray(list)) return [];
    return list.slice(0, RESULT_LIMIT).map((hit) => ({
      name: String(hit.display_name ?? hit.name ?? ''),
      lat: Number(hit.lat),
      lon: Number(hit.lon),
      kind: String(hit.type ?? hit.category ?? ''),
    }));
  }

  return { searchPlaces };
}

const shared = createGeocoder();

/** The app's one geocoder: its gate is shared by every caller on the page. */
export const searchPlaces = shared.searchPlaces;
