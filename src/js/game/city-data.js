/**
 * City extract parser for the ASCII City Walk game (CW-2).
 *
 * Turns an OpenStreetMap extract (Overpass API `out tags geom` JSON, either
 * raw or wrapped by scripts/bake-city-extract.mjs) into flat, renderer-ready
 * data: building footprints in local meters with resolved heights, and road
 * centerlines with approximate widths.
 *
 * Deliberately DOM-free and three.js-free: the same module runs in the
 * browser (game scene build), in Node (the bake script trims with it), and
 * under vitest.
 *
 * Map data © OpenStreetMap contributors, ODbL 1.0 — see
 * THIRD_PARTY_NOTICES.md ("OpenStreetMap Data").
 *
 * @license GPL-3.0-or-later
 */

// One storey when only building:levels is tagged. 3 m/level is the common
// renderer convention (OSM Simple 3D Buildings recommends explicit height
// over levels; levels are a fallback).
export const LEVEL_HEIGHT_M = 3.0;

// Untagged buildings (about half of a typical dense downtown extract in the
// planning proof query) render at a low-rise default rather than vanishing.
export const DEFAULT_BUILDING_HEIGHT_M = 8.0;

// Anything taller than this is a tagging error, not a building.
const MAX_BUILDING_HEIGHT_M = 700;

// Visual approximation of paved width per highway class, in meters. These
// are game-world ribbons, not survey data.
export const ROAD_WIDTHS_M = {
  motorway: 16,
  trunk: 14,
  primary: 12,
  secondary: 10,
  tertiary: 8,
  residential: 6,
  unclassified: 6,
  living_street: 6,
  pedestrian: 8,
  service: 4,
  footway: 2.5,
  path: 2.5,
  cycleway: 2.5,
  steps: 2.5,
  track: 3,
};
const DEFAULT_ROAD_WIDTH_M = 5;

// Meters per degree at the equator (equirectangular local projection).
const M_PER_DEG_LAT = 110540;
const M_PER_DEG_LON = 111320;

/**
 * Project a lat/lon to local meters around a center point.
 * +x east, +y north; z (up) is added by the scene builder.
 *
 * @param {number} lat
 * @param {number} lon
 * @param {{lat: number, lon: number}} center
 * @returns {[number, number]} [x, y] in meters
 */
export function projectLatLon(lat, lon, center) {
  const cosLat = Math.cos((center.lat * Math.PI) / 180);
  return [
    (lon - center.lon) * M_PER_DEG_LON * cosLat,
    (lat - center.lat) * M_PER_DEG_LAT,
  ];
}

/**
 * Parse a height-ish tag value into meters.
 * Accepts "12", "12.5", "12 m", "12m", "40'", "40 ft". Returns null when
 * unparseable.
 *
 * @param {string|undefined} raw
 * @returns {number|null}
 */
function parseLengthMeters(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const s = raw.trim().toLowerCase();
  const m = s.match(/^(-?\d+(?:[.,]\d+)?)\s*(m|meter|meters|ft|feet|')?$/);
  if (!m) return null;
  const value = parseFloat(m[1].replace(',', '.'));
  if (!Number.isFinite(value)) return null;
  const unit = m[2];
  if (unit === 'ft' || unit === 'feet' || unit === "'") {
    return value * 0.3048;
  }
  return value;
}

/**
 * Resolve a building's vertical extent from its tags.
 * Cascade: height / building:height → building:levels × LEVEL_HEIGHT_M →
 * DEFAULT_BUILDING_HEIGHT_M. min_height / building:min_level analogously
 * (default 0).
 *
 * @param {Object} tags
 * @returns {{heightM: number, minHeightM: number}}
 */
export function resolveBuildingHeight(tags = {}) {
  let heightM =
    parseLengthMeters(tags.height) ??
    parseLengthMeters(tags['building:height']);

  if (heightM === null || heightM <= 0) {
    const levels = parseFloat(tags['building:levels']);
    heightM =
      Number.isFinite(levels) && levels > 0 ? levels * LEVEL_HEIGHT_M : null;
  }
  if (heightM === null || heightM <= 0) heightM = DEFAULT_BUILDING_HEIGHT_M;
  heightM = Math.min(heightM, MAX_BUILDING_HEIGHT_M);

  let minHeightM = parseLengthMeters(tags.min_height);
  if (minHeightM === null) {
    const minLevel = parseFloat(tags['building:min_level']);
    minHeightM =
      Number.isFinite(minLevel) && minLevel > 0 ? minLevel * LEVEL_HEIGHT_M : 0;
  }
  minHeightM = Math.max(0, minHeightM);

  // A sliver keeps min_height-only tagging from producing zero volume.
  if (heightM <= minHeightM) heightM = minHeightM + 0.5;

  return { heightM, minHeightM };
}

/** Exact-coordinate key for ring stitching (Overpass repeats node coords). */
function pointKey(pt) {
  return `${pt.lat},${pt.lon}`;
}

/**
 * Assemble closed rings from relation member way geometries. Members may
 * individually be closed rings or open chains that connect end-to-end
 * (multipolygon outers are often split across several ways). Chains that
 * never close are dropped and counted.
 *
 * @param {Array<Array<{lat:number,lon:number}>>} memberGeoms
 * @returns {{rings: Array<Array<{lat:number,lon:number}>>, dropped: number}}
 */
function assembleRings(memberGeoms) {
  const segments = [];
  for (const geom of memberGeoms) {
    if (Array.isArray(geom) && geom.length >= 2) segments.push(geom.slice());
  }

  const rings = [];
  let dropped = 0;

  // Closed members are rings already.
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    if (pointKey(seg[0]) === pointKey(seg[seg.length - 1])) {
      rings.push(seg);
      segments.splice(i, 1);
    }
  }

  // Stitch the remaining open chains end-to-end.
  while (segments.length > 0) {
    const chain = segments.shift();
    let guard = segments.length + 1;
    while (guard-- > 0) {
      const endKey = pointKey(chain[chain.length - 1]);
      if (pointKey(chain[0]) === endKey) break; // closed

      const idx = segments.findIndex(
        (seg) =>
          pointKey(seg[0]) === endKey ||
          pointKey(seg[seg.length - 1]) === endKey
      );
      if (idx === -1) break; // dead end

      const next = segments.splice(idx, 1)[0];
      if (pointKey(next[0]) === endKey) {
        chain.push(...next.slice(1));
      } else {
        chain.push(...next.slice(0, -1).reverse());
      }
    }

    if (
      chain.length >= 4 &&
      pointKey(chain[0]) === pointKey(chain[chain.length - 1])
    ) {
      rings.push(chain);
    } else {
      dropped++;
    }
  }

  return { rings, dropped };
}

/**
 * Project a closed lat/lon ring to local meters, drop the duplicated last
 * point, and enforce winding. Returns null for degenerate rings (< 3
 * distinct points or ~zero area).
 *
 * @param {Array<{lat:number,lon:number}>} ring
 * @param {{lat:number,lon:number}} center
 * @param {boolean} counterClockwise - desired winding of the result
 * @returns {Array<[number, number]>|null}
 */
function projectRing(ring, center, counterClockwise) {
  let pts = ring.map((p) => projectLatLon(p.lat, p.lon, center));
  const [fx, fy] = pts[0];
  const [lx, ly] = pts[pts.length - 1];
  if (fx === lx && fy === ly) pts = pts.slice(0, -1);
  if (pts.length < 3) return null;

  const area = signedArea(pts);
  if (Math.abs(area) < 0.5) return null; // < 0.5 m² is noise
  if (area < 0 === counterClockwise) pts.reverse();
  return pts;
}

/**
 * Signed area of a polygon in local meters (shoelace). Positive = CCW.
 * @param {Array<[number, number]>} pts
 * @returns {number}
 */
export function signedArea(pts) {
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

/**
 * Parse a city extract into renderer-ready data.
 *
 * Accepts either raw Overpass `out tags geom` JSON ({elements: [...]}) or
 * the wrapper written by scripts/bake-city-extract.mjs ({format, center,
 * elements, ...}). A center is required from the wrapper or options.
 *
 * @param {Object} extract - Overpass JSON or baked wrapper
 * @param {Object} [options]
 * @param {{lat:number,lon:number}} [options.center] - projection center
 *   (overrides the wrapper's)
 * @returns {{
 *   center: {lat:number,lon:number},
 *   attribution: string,
 *   buildings: Array<{outer: Array<[number,number]>, holes: Array<Array<[number,number]>>, heightM: number, minHeightM: number, name: (string|undefined)}>,
 *   roads: Array<{points: Array<[number,number]>, widthM: number, kind: string}>,
 *   boundsM: {minX:number, minY:number, maxX:number, maxY:number},
 *   stats: {buildingCount:number, roadCount:number, droppedRings:number, droppedElements:number}
 * }}
 */
export function parseCityExtract(extract, options = {}) {
  const center = options.center ?? extract?.center;
  if (!center || !Number.isFinite(center.lat) || !Number.isFinite(center.lon)) {
    throw new Error('parseCityExtract: no projection center available');
  }
  const elements = Array.isArray(extract?.elements) ? extract.elements : [];

  const buildings = [];
  const roads = [];
  let droppedRings = 0;
  let droppedElements = 0;

  const isBuildingTags = (tags) =>
    tags && typeof tags.building === 'string' && tags.building !== 'no';

  // Old-style multipolygon tagging can return an outer member way that is
  // itself tagged building=*; skip those standalone ways so the footprint is
  // not extruded twice.
  const relationMemberWayIds = new Set();
  for (const el of elements) {
    if (el.type === 'relation' && isBuildingTags(el.tags)) {
      for (const m of el.members ?? []) {
        if (m.type === 'way' && m.ref != null) relationMemberWayIds.add(m.ref);
      }
    }
  }

  for (const el of elements) {
    const tags = el.tags ?? {};

    if (el.type === 'way' && isBuildingTags(tags)) {
      if (relationMemberWayIds.has(el.id)) continue;
      const outer = Array.isArray(el.geometry)
        ? projectRing(el.geometry, center, true)
        : null;
      if (!outer) {
        droppedElements++;
        continue;
      }
      const { heightM, minHeightM } = resolveBuildingHeight(tags);
      buildings.push({
        outer,
        holes: [],
        heightM,
        minHeightM,
        name: tags.name,
        tags,
      });
      continue;
    }

    if (el.type === 'relation' && isBuildingTags(tags)) {
      const outerGeoms = [];
      const innerGeoms = [];
      for (const m of el.members ?? []) {
        if (m.type !== 'way' || !Array.isArray(m.geometry)) continue;
        if (m.role === 'inner') innerGeoms.push(m.geometry);
        else outerGeoms.push(m.geometry); // 'outer' and blank roles
      }

      const outerResult = assembleRings(outerGeoms);
      const innerResult = assembleRings(innerGeoms);
      droppedRings += outerResult.dropped + innerResult.dropped;

      const holes = [];
      for (const ring of innerResult.rings) {
        const hole = projectRing(ring, center, false);
        if (hole) holes.push(hole);
      }

      let emitted = false;
      const { heightM, minHeightM } = resolveBuildingHeight(tags);
      for (const ring of outerResult.rings) {
        const outer = projectRing(ring, center, true);
        if (!outer) {
          droppedRings++;
          continue;
        }
        // Round 1 simplification: every hole rides every outer ring of its
        // relation. Extra holes outside an outer are harmless to triangulate.
        buildings.push({
          outer,
          holes,
          heightM,
          minHeightM,
          name: tags.name,
          tags,
        });
        emitted = true;
      }
      if (!emitted) droppedElements++;
      continue;
    }

    if (
      el.type === 'way' &&
      typeof tags.highway === 'string' &&
      Array.isArray(el.geometry) &&
      el.geometry.length >= 2
    ) {
      const points = el.geometry.map((p) =>
        projectLatLon(p.lat, p.lon, center)
      );
      roads.push({
        points,
        widthM: ROAD_WIDTHS_M[tags.highway] ?? DEFAULT_ROAD_WIDTH_M,
        kind: tags.highway,
      });
    }
  }

  // Bounds define the playable core (map view, ground plane, collision).
  // Overpass `around` returns WHOLE ways, so a highway passing through the
  // radius can trail kilometers beyond it — bounds therefore come from the
  // buildings alone whenever any exist, and road tails are treated as
  // scenery outside the core.
  const boundsM = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  const growBounds = ([x, y]) => {
    if (x < boundsM.minX) boundsM.minX = x;
    if (y < boundsM.minY) boundsM.minY = y;
    if (x > boundsM.maxX) boundsM.maxX = x;
    if (y > boundsM.maxY) boundsM.maxY = y;
  };
  for (const b of buildings) b.outer.forEach(growBounds);
  if (buildings.length === 0) {
    for (const r of roads) r.points.forEach(growBounds);
  }

  return {
    center: { lat: center.lat, lon: center.lon },
    attribution:
      typeof extract?.attribution === 'string'
        ? extract.attribution
        : 'Map data © OpenStreetMap contributors',
    buildings,
    roads,
    boundsM,
    stats: {
      buildingCount: buildings.length,
      roadCount: roads.length,
      droppedRings,
      droppedElements,
    },
  };
}

/**
 * Trim a raw Overpass element down to what the game needs. Used by the bake
 * script; exported so tests can pin the kept-tag list.
 *
 * @param {Object} el - raw Overpass element
 * @returns {Object|null} trimmed element, or null when irrelevant
 */
export function trimOverpassElement(el) {
  const KEPT_TAGS = [
    'building',
    'height',
    'building:height',
    'building:levels',
    'min_height',
    'building:min_level',
    'name',
    'highway',
    // Landmark families (CW-10)
    'tourism',
    'historic',
    'amenity',
  ];

  const trimTags = (tags) => {
    if (!tags) return undefined;
    const out = {};
    for (const key of KEPT_TAGS) {
      if (typeof tags[key] === 'string') out[key] = tags[key];
    }
    return Object.keys(out).length > 0 ? out : undefined;
  };

  const roundPt = (p) => ({
    lat: Math.round(p.lat * 1e6) / 1e6,
    lon: Math.round(p.lon * 1e6) / 1e6,
  });

  if (el.type === 'way' && Array.isArray(el.geometry)) {
    const tags = trimTags(el.tags);
    if (!tags || (!tags.building && !tags.highway)) return null;
    return { type: 'way', id: el.id, tags, geometry: el.geometry.map(roundPt) };
  }

  if (el.type === 'relation' && Array.isArray(el.members)) {
    const tags = trimTags(el.tags);
    if (!tags || !tags.building) return null;
    const members = el.members
      .filter((m) => m.type === 'way' && Array.isArray(m.geometry))
      .map((m) => ({
        type: 'way',
        ref: m.ref,
        role: m.role,
        geometry: m.geometry.map(roundPt),
      }));
    if (members.length === 0) return null;
    return { type: 'relation', id: el.id, tags, members };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Landmarks (CW-10)
// ---------------------------------------------------------------------------

// Amenity values notable enough to landmark when the building is named.
const LANDMARK_AMENITIES = new Set([
  'place_of_worship',
  'theatre',
  'townhall',
  'library',
  'university',
  'courthouse',
  'arts_centre',
  'hospital',
  'community_centre',
  'conference_centre',
]);

/**
 * Pick the named buildings worth marking on the map: tagged tourism or
 * historic sites, notable amenities, and the tallest or largest named
 * structures. Deterministic; capped.
 *
 * @param {ReturnType<typeof parseCityExtract>} model
 * @param {{max?: number}} [options]
 * @returns {Array<{name: string, x: number, y: number, heightM: number, score: number}>}
 */
export function extractLandmarks(model, options = {}) {
  const max = options.max ?? 12;
  const seen = new Set();
  const scored = [];

  for (const building of model.buildings) {
    const name = building.name;
    if (typeof name !== 'string' || name.trim() === '') continue;
    if (seen.has(name)) continue; // multi-part buildings appear once

    const tags = building.tags ?? {};
    let score = 0;
    if (typeof tags.tourism === 'string') score += 3;
    if (typeof tags.historic === 'string') score += 3;
    if (LANDMARK_AMENITIES.has(tags.amenity)) score += 2;
    if (building.heightM >= 60) score += 2;
    else if (building.heightM >= 25) score += 1;
    if (Math.abs(signedArea(building.outer)) >= 3000) score += 1;

    if (score < 2) continue;
    seen.add(name);

    let cx = 0;
    let cy = 0;
    for (const [x, y] of building.outer) {
      cx += x;
      cy += y;
    }
    scored.push({
      name,
      x: cx / building.outer.length,
      y: cy / building.outer.length,
      heightM: building.heightM,
      score,
    });
  }

  scored.sort((a, b) => b.score - a.score || b.heightM - a.heightM);
  return scored.slice(0, max);
}

/**
 * Street-view landmark proximity with hysteresis: you are "near" a landmark
 * once inside enterM of its centroid, and stay near it until you leave
 * exitM — so the HUD does not flicker at the boundary.
 *
 * @param {ReturnType<typeof extractLandmarks>} landmarks
 * @param {number} x - player position
 * @param {number} y
 * @param {string|null} currentName - the landmark currently held as near
 * @param {{enterM?: number, exitM?: number}} [options]
 * @returns {string|null} the landmark now considered near, or null
 */
export function nearestLandmarkName(
  landmarks,
  x,
  y,
  currentName,
  options = {}
) {
  const enterM = options.enterM ?? 60;
  const exitM = options.exitM ?? 80;

  let nearest = null;
  let nearestDist = Infinity;
  let currentDist = Infinity;
  for (const lm of landmarks) {
    const dist = Math.hypot(lm.x - x, lm.y - y);
    if (dist < nearestDist) {
      nearest = lm;
      nearestDist = dist;
    }
    if (lm.name === currentName) currentDist = dist;
  }

  if (currentName !== null && currentDist <= exitM) return currentName;
  if (nearest && nearestDist <= enterM) return nearest.name;
  return null;
}
