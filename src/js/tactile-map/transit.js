/**
 * Journeys from Transitous (transitous.org), the open, community-run journey
 * planner on the MOTIS engine: a walk, or a trip by bus and train, between
 * two places, each said in words and carrying its legs' shapes for the map.
 *
 * Its terms allow an open-source, non-commercial app that is light on its
 * resources; a browser app is known by its Referer, which this site's
 * Referrer-Policy (strict-origin-when-cross-origin) sends as the site's
 * origin. So: one request per press, the last answer kept for the same
 * question, and the attribution its terms ask for beside the route.
 *
 * @license GPL-3.0-or-later
 */

export const TRANSIT_URL = 'https://api.transitous.org/api/v5/plan';

export const TRANSIT_STRINGS = Object.freeze({
  /** Under the route step and in the README; the middle part links to the sources. */
  attribution: ['Routes from ', 'Transitous', ', on OpenStreetMap data.'],
  sourcesUrl: 'https://transitous.org/sources',
});

/** How many journeys by transit a press offers. */
const JOURNEYS = 3;

/**
 * An encoded polyline (the Google format, which MOTIS writes) to
 * `[lat, lon]` pairs at `precision` decimal places.
 *
 * @param {string} encoded
 * @param {number} [precision]
 * @returns {Array<[number, number]>}
 */
export function decodePolyline(encoded, precision = 6) {
  const factor = 10 ** precision;
  const points = [];
  let i = 0;
  let lat = 0;
  let lon = 0;
  const next = () => {
    let result = 0;
    let shift = 0;
    let byte;
    do {
      byte = encoded.charCodeAt(i) - 63;
      i += 1;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && i < encoded.length);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (i < encoded.length) {
    lat += next();
    lon += next();
    points.push([lat / factor, lon / factor]);
  }
  return points;
}

const placeOf = (p = {}) => {
  const place = { name: p.name || '', lat: p.lat, lon: p.lon };
  if (p.stopId) place.stopId = p.stopId;
  return place;
};

function legOf(l) {
  return {
    mode: l.mode,
    routeShortName: l.routeShortName || null,
    agencyName: l.agencyName || null,
    headsign: l.headsign || null,
    from: placeOf(l.from),
    to: placeOf(l.to),
    points: l.legGeometry
      ? decodePolyline(l.legGeometry.points, l.legGeometry.precision)
      : [],
    distanceM: Math.round(l.distance || 0),
    steps: (l.steps || []).map((s) => ({
      streetName: s.streetName || '',
      distanceM: Math.round(s.distance || 0),
      elevationUp: s.elevationUp || 0,
      elevationDown: s.elevationDown || 0,
    })),
  };
}

/** Row 16: the minutes, the changes, and each ride to where it is left. */
function wordsOf(minutes, changes, legs) {
  const rides = legs.filter((l) => l.mode !== 'WALK');
  if (!rides.length) {
    const meters = legs.reduce((sum, l) => sum + l.distanceM, 0);
    return `${minutes} min on foot, ${meters} m.`;
  }
  const said =
    changes === 0
      ? 'no change'
      : changes === 1
        ? '1 change'
        : `${changes} changes`;
  const trips = rides
    .map(
      (l) => `the ${l.routeShortName || l.mode.toLowerCase()} to ${l.to.name}`
    )
    .join(', then ');
  return `${minutes} min, ${said}: ${trips}.`;
}

function journeyOf(it) {
  const legs = (it.legs || []).map(legOf);
  const minutes = Math.round((it.duration || 0) / 60);
  const changes = it.transfers || 0;
  return { minutes, changes, legs, words: wordsOf(minutes, changes, legs) };
}

function failure(code, cause) {
  const error = new Error(code);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

/**
 * @param {object} [options]
 * @param {typeof fetch} [options.fetch]
 * @param {() => Date} [options.now] - the time asked for when none is given
 */
export function createTransitPlanner({
  fetch = globalThis.fetch.bind(globalThis),
  now = () => new Date(),
} = {}) {
  let last = null;
  return {
    /**
     * Journeys between two places, on foot or by transit. Rejects with a
     * `code`: 'rate' (too many requests), 'none-found', 'no-answer'.
     *
     * @param {{ from: {lat: number, lon: number}, to: {lat: number, lon: number}, when?: Date, mode: 'walk'|'transit' }} ask
     */
    async planJourneys({ from, to, when, mode }) {
      const time = (when || now()).toISOString();
      const key = [from.lat, from.lon, to.lat, to.lon, time, mode].join('|');
      if (last?.key === key) return last.journeys;
      const params = new URLSearchParams({
        fromPlace: `${from.lat},${from.lon}`,
        toPlace: `${to.lat},${to.lon}`,
        time,
        pedestrianProfile: 'FOOT',
      });
      if (mode === 'walk') {
        params.set('directModes', 'WALK');
        params.set('transitModes', '');
      } else {
        params.set('numItineraries', String(JOURNEYS));
      }
      let response;
      try {
        response = await fetch(`${TRANSIT_URL}?${params}`);
      } catch (error) {
        throw failure('no-answer', error);
      }
      if (response.status === 429) throw failure('rate');
      if (!response.ok) throw failure('no-answer');
      const body = await response.json();
      const raw = mode === 'walk' ? body.direct || [] : body.itineraries || [];
      // The planner may offer the same journey again at a later time: one
      // of each, by what it says.
      const seen = new Set();
      const journeys = [];
      for (const it of raw) {
        const journey = journeyOf(it);
        if (seen.has(journey.words)) continue;
        seen.add(journey.words);
        journeys.push(journey);
        if (journeys.length === JOURNEYS) break;
      }
      if (!journeys.length) throw failure('none-found');
      last = { key, journeys };
      return journeys;
    },
  };
}
