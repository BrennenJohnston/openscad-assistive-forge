/**
 * Seattle City Light's own pole register, as extract nodes (CW-77, CW-Q76).
 *
 * Dev-lane only. Seattle is the one city of the four with a published,
 * surveyed streetlight register, and the owner authorised its use explicitly
 * at gate G1 (CW-Q76) after being told that its catalog page states no
 * licence. The provenance is written into the extract so that anybody reading
 * the file can see where the poles came from and on whose say-so.
 *
 * WHAT THE SERVICE ACTUALLY HOLDS, measured 2026-08-29 against the baked
 * circle (47.612, -122.340, r = 1,300 m):
 *
 *   - 4,115 poles, of which 3,679 carry `HasStreetlight = Yes`.
 *   - Density 775 per km2; nearest-neighbour spacing p10 8.1 m, median
 *     16.7 m, p90 29.1 m - denser than the ~27 m the game invents.
 *   - `HEIGHT` is populated on 1,736 of the 4,115 and is zero on the rest,
 *     so it is carried where it exists and never defaulted.
 *
 * ★ THE SERVICE'S OWN COUNT IS WRONG, BY FIVE TIMES. `returnCountOnly=true`
 * and `returnIdsOnly=true` both report 21,703 poles inside that circle;
 * fetching the features and MEASURING their distances gives 4,115, with the
 * furthest at 1,295 m. The same disagreement holds at 200 m (1,484 against a
 * measured 170) and at 400 m (4,174 against 675). Only the feature endpoint
 * is believed here, and every point is re-checked against the radius after it
 * arrives - a count endpoint that cannot be reproduced by the features it
 * counts is not evidence.
 *
 * @license GPL-3.0-or-later
 */

const SERVICE =
  'https://services.arcgis.com/ZOyb2t4B0UYuYNYH/arcgis/rest/services/' +
  'Seattle_City_Light_Poles/FeatureServer/0/query';

export const CITY_LIGHT_PROVENANCE = {
  name: 'Seattle City Light Poles',
  publisher: 'City of Seattle',
  service: SERVICE,
  // Stated plainly because it is the whole reason this needed a decision.
  license:
    'No licence is stated on the publisher catalog page. Used with the ' +
    'project owner explicit authorisation (CW-Q76, 2026-08-29).',
  attribution: 'Streetlight positions: Seattle City Light pole register',
};

const M_PER_DEG_LAT = 110540;
const M_PER_DEG_LON = 111320;

/** Metres between a lat/lon and the circle centre. */
export function metresFrom(center, lat, lon) {
  const cosLat = Math.cos((center.lat * Math.PI) / 180);
  return Math.hypot(
    (lon - center.lon) * M_PER_DEG_LON * cosLat,
    (lat - center.lat) * M_PER_DEG_LAT
  );
}

/** One page of the feature query. */
export function pageUrl(center, radiusM, offset, pageSize = 2000) {
  const params = new URLSearchParams({
    where: '1=1',
    geometry: JSON.stringify({
      x: center.lon,
      y: center.lat,
      spatialReference: { wkid: 4326 },
    }),
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    distance: String(radiusM),
    units: 'esriSRUnit_Meter',
    outFields: 'ASSET_ID,HEIGHT,HasStreetlight',
    returnGeometry: 'true',
    outSR: '4326',
    resultOffset: String(offset),
    resultRecordCount: String(pageSize),
    f: 'json',
  });
  return `${SERVICE}?${params}`;
}

/**
 * Page the whole register inside a circle.
 *
 * `fetchJson` is injected so the tests can drive paging, a short last page, a
 * rate limit and a malformed feature with no network.
 *
 * @returns {{features:Array<Object>, pages:number, warnings:Array<string>}}
 */
export async function fetchPoles({
  center,
  radiusM,
  fetchJson,
  pageSize = 2000,
  maxPages = 40,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
}) {
  const features = [];
  const warnings = [];
  let pages = 0;
  for (let page = 0; page < maxPages; page++) {
    const url = pageUrl(center, radiusM, page * pageSize, pageSize);
    let body = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await fetchJson(url);
      if (res.ok) {
        body = res.body;
        break;
      }
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt === 3) {
        throw new Error(
          `Seattle City Light poles returned HTTP ${res.status}`
        );
      }
      await sleep([30000, 60000, 120000][attempt]);
    }
    pages++;
    const got = Array.isArray(body?.features) ? body.features : [];
    features.push(...got);
    if (got.length < pageSize) break;
  }
  return { features, pages, warnings };
}

/**
 * Turn the register into extract nodes.
 *
 * Only poles that actually carry a streetlight become lamps - the register
 * holds every distribution pole in the city and most of the rest are not
 * lights. Every point is re-measured against the radius, because the
 * service's own spatial filter cannot be trusted (see the header).
 *
 * IDs ARE NEGATIVE, AND THAT IS THE CONTRACT. OpenStreetMap ids are positive,
 * so a negative id in an extract says "this element is not from OSM" without
 * a reader having to look anything up, and the ODbL attribution on the file
 * keeps meaning exactly what it says.
 *
 * @returns {{elements:Array<Object>, kept:number, notLit:number, outside:number, withHeight:number}}
 */
export function polesToElements(features, center, radiusM) {
  const elements = [];
  let notLit = 0;
  let outside = 0;
  let withHeight = 0;
  for (const f of features ?? []) {
    const g = f?.geometry;
    const a = f?.attributes ?? {};
    if (!g || !Number.isFinite(g.x) || !Number.isFinite(g.y)) continue;
    if (a.HasStreetlight !== 'Yes') {
      notLit++;
      continue;
    }
    if (metresFrom(center, g.y, g.x) > radiusM) {
      outside++;
      continue;
    }
    const tags = {
      highway: 'street_lamp',
      operator: 'Seattle City Light',
    };
    if (a.ASSET_ID != null && String(a.ASSET_ID).length > 0) {
      tags.ref = String(a.ASSET_ID);
    }
    // Feet in the register, metres in the extract; zero means "not recorded"
    // in this dataset and is never carried as a height of zero.
    const ft = Number(a.HEIGHT);
    if (Number.isFinite(ft) && ft > 0) {
      tags.height = `${Math.round(ft * 0.3048 * 10) / 10}`;
      withHeight++;
    }
    elements.push({
      type: 'node',
      id: -Math.abs(Number(a.ASSET_ID) || elements.length + 1),
      lat: Math.round(g.y * 1e7) / 1e7,
      lon: Math.round(g.x * 1e7) / 1e7,
      tags,
    });
  }
  return { elements, kept: elements.length, notLit, outside, withHeight };
}
