/**
 * OpenStreetMap geometry for the Tactile Map Designer: a point on the earth
 * to meters about the map's center, an Overpass element trimmed to the tags
 * a map reads, and meters to millimeters at the map's scale.
 *
 * The projection and the trimmer's shape come from my We Go Places game,
 * copied here so the two projects stay apart; the kept tags are the map's
 * own. A local equirectangular projection is exact enough for a map a few
 * hundred meters across: at 600 m the error is under a centimeter.
 *
 * No DOM here: a worker may import this file.
 *
 * @license GPL-3.0-or-later
 */

/** Meters per degree of latitude, and of longitude at the equator. */
const M_PER_DEG_LAT = 110540;
const M_PER_DEG_LON = 111320;

/**
 * The tags a map keeps from an element. Everything else (sources, notes,
 * editors' marks, addresses) is dropped before the data is held.
 */
export const KEPT_TAGS = Object.freeze([
  'highway',
  'footway',
  'crossing',
  'kerb',
  'tactile_paving',
  'incline',
  'surface',
  'width',
  'name',
  'building',
  'railway',
  'waterway',
  'leisure',
  'amenity',
  'shop',
  'entrance',
  'public_transport',
  'bus',
  'tram',
  'level',
  'layer',
  'steps',
  'handrail',
  'wheelchair',
  // Who may walk a way: a path is walkable unless one of these says no.
  'foot',
  'access',
]);

/**
 * The tags that make an element worth keeping at all: a feature class can
 * be read from them. A name or a width alone does not keep an element.
 */
const INTEREST_TAGS = Object.freeze([
  'highway',
  'footway',
  'crossing',
  'kerb',
  'tactile_paving',
  'building',
  'railway',
  'waterway',
  'leisure',
  'amenity',
  'shop',
  'entrance',
  'public_transport',
  'bus',
  'tram',
  'steps',
]);

/**
 * The box `halfEastM` east and west and `halfNorthM` north and south of the
 * center, in degrees.
 *
 * @param {{lat: number, lon: number}} center
 * @param {number} halfEastM
 * @param {number} halfNorthM
 * @returns {{south: number, west: number, north: number, east: number}}
 */
export function boxAroundCenter(center, halfEastM, halfNorthM) {
  const cosLat = Math.cos((center.lat * Math.PI) / 180);
  const dLat = halfNorthM / M_PER_DEG_LAT;
  const dLon = halfEastM / (M_PER_DEG_LON * cosLat);
  return {
    south: center.lat - dLat,
    west: center.lon - dLon,
    north: center.lat + dLat,
    east: center.lon + dLon,
  };
}

/**
 * A point to meters east and north of the center.
 *
 * @param {number} lat
 * @param {number} lon
 * @param {{lat: number, lon: number}} center
 * @returns {[number, number]} [east, north] in meters
 */
export function projectLatLon(lat, lon, center) {
  const cosLat = Math.cos((center.lat * Math.PI) / 180);
  return [
    (lon - center.lon) * M_PER_DEG_LON * cosLat,
    (lat - center.lat) * M_PER_DEG_LAT,
  ];
}

/**
 * An Overpass element with the tags a map reads and its geometry, or null
 * when it has no tag of interest or no place.
 *
 * @param {object} el - `{ type, id, tags, geometry }` for a way (geometry as
 *   `[{ lat, lon }, ...]`, as `out geom` gives it), `{ type, id, tags, lat,
 *   lon }` for a node
 * @returns {object|null}
 */
export function trimElement(el) {
  if (!el || typeof el !== 'object') return null;
  const tags = el.tags && typeof el.tags === 'object' ? el.tags : {};
  if (!INTEREST_TAGS.some((key) => key in tags)) return null;
  const kept = {};
  for (const key of KEPT_TAGS) {
    if (key in tags) kept[key] = tags[key];
  }
  if (el.type === 'node') {
    if (!Number.isFinite(el.lat) || !Number.isFinite(el.lon)) return null;
    return { type: 'node', id: el.id, lat: el.lat, lon: el.lon, tags: kept };
  }
  const geometry = Array.isArray(el.geometry)
    ? el.geometry.filter(
        (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon)
      )
    : [];
  if (geometry.length === 0) return null;
  return { type: el.type, id: el.id, tags: kept, geometry };
}

/**
 * Millimeters on the map per meter on the ground: the map's width spans
 * twice the radius.
 *
 * @param {number} mapWidthMm
 * @param {number} radiusM
 * @returns {number}
 */
export function mmPerMeter(mapWidthMm, radiusM) {
  return mapWidthMm / (2 * radiusM);
}

/**
 * Meters east and north of the center to the plan's millimeters, whose
 * origin is the map's top left corner and whose y runs DOWN the page: the
 * center sits in the middle, north is up.
 *
 * @param {[number, number]} eastNorth - meters from the center
 * @param {{w: number, h: number}} size - the map in mm
 * @param {number} k - mm per meter
 * @returns {[number, number]} [x, y] in mm
 */
export function toMm(eastNorth, size, k) {
  const [east, north] = eastNorth;
  return [size.w / 2 + east * k, size.h / 2 - north * k];
}
