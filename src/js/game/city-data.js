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

// The only import here, and deliberate: pointInRing is the even-odd ray cast
// walk-controls already owns, and CW-26 needs exactly it to decide which
// outline a building:part stands inside. walk-controls is itself DOM-free and
// import-free, so the Node bake path stays clean.
import { pointInRing } from './walk-controls.js';

// One storey when only building:levels is tagged. 3 m/level is the common
// renderer convention (OSM Simple 3D Buildings recommends explicit height
// over levels; levels are a fallback).
export const LEVEL_HEIGHT_M = 3.0;

// Untagged buildings (about half of a typical dense downtown extract in the
// planning proof query) render at a low-rise default rather than vanishing.
export const DEFAULT_BUILDING_HEIGHT_M = 8.0;

// Anything taller than this is a tagging error, not a building.
const MAX_BUILDING_HEIGHT_M = 700;

// CW-26. Simple 3D Buildings says a building's parts replace its outline, and
// where mappers tile the whole footprint that is exactly right. Real extracts
// are not so tidy: Seattle has 32 of 122 part-hosts under 60% covered and
// Albuquerque's lower quartile host is covered TWO PERCENT - one turret on a
// plain hall. Dropping those outlines would delete the building and leave the
// turret hanging, so the outline only stands down when the parts really are
// the mass. Above this ratio the parts replace the outline; below it they
// stand proud of it.
export const PART_COVERAGE_MIN = 0.6;

// CW-26 roofs. A roof shallower than this is not worth the triangles at the
// distance a walker sees it, and one deeper than a fifth of the building
// starts to look like a circus tent, so an untagged pitch takes a quarter of
// the body and everything is clamped into a believable band.
const ROOF_DEFAULT_SHARE = 0.25;
const ROOF_MAX_SHARE = 0.6;
const ROOF_MIN_M = 1.5;
const ROOF_MAX_M = 10;

/**
 * Resolve a roof from its tags, or null when the building has none worth
 * building. Height cascade mirrors the body: roof:height → roof:levels ×
 * LEVEL_HEIGHT_M → a share of the body.
 *
 * @param {Object} tags
 * @param {number} heightM - total building height
 * @param {number} minHeightM - where the body starts
 * @returns {{shape: string, heightM: number, orientation: string|undefined}|null}
 */
export function resolveRoof(tags = {}, heightM = 0, minHeightM = 0) {
  const shape = tags['roof:shape'];
  if (typeof shape !== 'string' || shape === '' || shape === 'flat') {
    return null;
  }
  const body = heightM - minHeightM;
  if (!(body > 0)) return null;

  let roofM = parseLengthMeters(tags['roof:height']);
  if (roofM === null) {
    const levels = parseFloat(tags['roof:levels']);
    roofM =
      Number.isFinite(levels) && levels > 0 ? levels * LEVEL_HEIGHT_M : null;
  }
  if (roofM === null) roofM = body * ROOF_DEFAULT_SHARE;
  roofM = Math.min(roofM, body * ROOF_MAX_SHARE, ROOF_MAX_M);
  if (!(roofM >= ROOF_MIN_M)) return null;

  return { shape, heightM: roofM, orientation: tags['roof:orientation'] };
}

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
 *   trees: Array<[number,number]>,
 *   boundsM: {minX:number, minY:number, maxX:number, maxY:number},
 *   stats: {buildingCount:number, roadCount:number, treeCount:number, droppedRings:number, droppedElements:number}
 * }}
 */
/** Axis-aligned bounds of a projected ring, for the part-host prefilter. */
function ringBounds(ring) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Area-weighted centroid of a projected ring. On a degenerate (zero-area)
 * ring the shoelace term vanishes, so this falls back to the vertex mean
 * rather than dividing by zero.
 *
 * @param {Array<[number,number]>} ring
 * @returns {[number, number]}
 */
function ringCentroid(ring) {
  let twiceArea = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const cross = xj * yi - xi * yj;
    twiceArea += cross;
    cx += (xj + xi) * cross;
    cy += (yj + yi) * cross;
  }
  if (twiceArea !== 0) return [cx / (3 * twiceArea), cy / (3 * twiceArea)];
  let sx = 0;
  let sy = 0;
  for (const [x, y] of ring) {
    sx += x;
    sy += y;
  }
  return [sx / ring.length, sy / ring.length];
}

export function parseCityExtract(extract, options = {}) {
  const center = options.center ?? extract?.center;
  if (!center || !Number.isFinite(center.lat) || !Number.isFinite(center.lon)) {
    throw new Error('parseCityExtract: no projection center available');
  }
  const elements = Array.isArray(extract?.elements) ? extract.elements : [];

  const buildings = [];
  const roads = [];
  const trees = [];
  const partWays = [];
  let droppedRings = 0;
  let droppedElements = 0;
  let orphanParts = 0;

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

    // Point props (CW-16): mapped street trees, projected but deliberately
    // NOT fed to growBounds - the playable core stays building-derived.
    if (el.type === 'node') {
      if (tags.natural !== 'tree') continue;
      if (!Number.isFinite(el.lat) || !Number.isFinite(el.lon)) {
        droppedElements++;
        continue;
      }
      trees.push(projectLatLon(el.lat, el.lon, center));
      continue;
    }

    // CW-26: a building:part is a VOLUME INSIDE an outline, not a building of
    // its own, so it is collected here and matched to its outline after the
    // loop. A way tagged BOTH building and building:part is its own outline
    // and falls through to the branch below.
    if (
      el.type === 'way' &&
      typeof tags['building:part'] === 'string' &&
      tags['building:part'] !== 'no' &&
      !isBuildingTags(tags)
    ) {
      const ring = Array.isArray(el.geometry)
        ? projectRing(el.geometry, center, true)
        : null;
      if (!ring) {
        droppedElements++;
        continue;
      }
      const { heightM, minHeightM } = resolveBuildingHeight(tags);
      partWays.push({
        outer: ring,
        holes: [],
        heightM,
        minHeightM,
        tags,
        roof: resolveRoof(tags, heightM, minHeightM),
      });
      continue;
    }

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
        roof: resolveRoof(tags, heightM, minHeightM),
        tags,
        parts: [],
        partsAreMass: false,
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
          roof: resolveRoof(tags, heightM, minHeightM),
          tags,
          parts: [],
          partsAreMass: false,
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

  // CW-26: match every part to the outline that contains it. Simple 3D
  // Buildings can bind them with a type=building relation, but in the real
  // extracts CONTAINMENT is the association that is actually there - Denver
  // carries 3,013 parts and no such relations. The host search is bounding-box
  // filtered first, which is what keeps 3,013 x 330 honest.
  if (partWays.length > 0) {
    const outlineCount = buildings.length;
    const boxes = buildings.map((b) => ringBounds(b.outer));
    for (const part of partWays) {
      const [cx, cy] = ringCentroid(part.outer);
      let host = -1;
      for (let i = 0; i < outlineCount; i++) {
        const bb = boxes[i];
        if (cx < bb.minX || cx > bb.maxX || cy < bb.minY || cy > bb.maxY) {
          continue;
        }
        if (pointInRing(cx, cy, buildings[i].outer)) {
          host = i;
          break;
        }
      }
      if (host >= 0) {
        buildings[host].parts.push(part);
        continue;
      }
      // A part whose outline is outside the extract radius is still a real
      // volume standing on a real street; drawing it beats dropping it.
      orphanParts++;
      buildings.push({
        ...part,
        name: part.tags.name,
        parts: [],
        partsAreMass: false,
      });
    }

    // Decide, per host, whether its parts ARE the building or merely sit on
    // it. Overlapping parts can push the ratio past 1, which only makes the
    // answer more certain.
    for (const b of buildings) {
      if (b.parts.length === 0) continue;
      const outlineArea = Math.abs(signedArea(b.outer));
      const partArea = b.parts.reduce(
        (sum, p) => sum + Math.abs(signedArea(p.outer)),
        0
      );
      b.partsAreMass =
        outlineArea > 0 && partArea / outlineArea >= PART_COVERAGE_MIN;
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
    trees,
    boundsM,
    stats: {
      buildingCount: buildings.length,
      roadCount: roads.length,
      treeCount: trees.length,
      partCount: partWays.length,
      orphanParts,
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
    // Street trees (CW-16)
    'natural',
    // CW-26: the real silhouettes. Whole-building roof:shape is nearly absent
    // in US downtowns (1.5% Seattle, 3.6% Denver, 0% Albuquerque) but rich in
    // residential Burnaby (26.8%); the downtown shapes live in building:part
    // instead (Denver: 3,013 parts with 2,981 heights for 330 buildings).
    // Keeping both is what lets one renderer serve both kinds of city.
    'building:part',
    'roof:shape',
    'roof:height',
    'roof:levels',
    'roof:orientation',
    // Crowd proxy for where people stand (CW-19's placement seam).
    'shop',
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
    // CW-26: a building:part way usually carries NO building tag — in Simple
    // 3D Buildings the parts sit inside a separately-tagged outline. Keeping
    // the tag is not enough; this gate has to let the part through too.
    if (!tags || (!tags.building && !tags.highway && !tags['building:part']))
      return null;
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

  // Standalone nodes are point props (CW-16 street trees), not geometry.
  if (
    el.type === 'node' &&
    Number.isFinite(el.lat) &&
    Number.isFinite(el.lon)
  ) {
    const tags = trimTags(el.tags);
    if (!tags || !tags.natural) return null;
    const { lat, lon } = roundPt(el);
    return { type: 'node', id: el.id, tags, lat, lon };
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

// ---------------------------------------------------------------------------
// The road graph (CW-19)
// ---------------------------------------------------------------------------

/**
 * Highway classes a car would actually be driven on.
 *
 * Service roads, footways and pedestrian streets are left out: a car frozen
 * in an alley or on a footpath reads as a mistake rather than as traffic.
 */
export const DRIVABLE_ROAD_KINDS = new Set([
  'motorway',
  'trunk',
  'primary',
  'secondary',
  'tertiary',
  'residential',
  'unclassified',
  'living_street',
]);

/** Endpoints closer than this share a node, in meters. */
const NODE_SNAP_M = 1.5;

/**
 * Cars per kilometre of road, by class — the open-data proxy for how busy a
 * street is (CW-19, signed at CW-Q17a).
 *
 * This is the honest part of the design, so it is written down rather than
 * hidden: there is no uniform open feed of live congestion. Real-time traffic
 * is commercial data. What open map data DOES carry is what kind of road it
 * is and how many lanes it has, and how busy a street looks follows from that
 * closely enough for a frozen scene.
 *
 * Lane counts are not in the extract today — the bake keeps a fixed tag list
 * and `lanes` is not on it — so this reads road class alone and multiplies by
 * a lane factor when a road record ever carries one. That is the seam a
 * future live source, or a re-bake that keeps `lanes`, plugs into: one
 * function, one call site.
 *
 * @param {{kind: string, lanes?: number}} road
 * @returns {number} cars per kilometre
 */
export function trafficDensityFor(road) {
  const perKm = {
    motorway: 34,
    trunk: 30,
    primary: 26,
    secondary: 20,
    tertiary: 14,
    residential: 8,
    unclassified: 8,
    living_street: 4,
  };
  const base = perKm[road?.kind] ?? 0;
  const lanes = Number(road?.lanes);
  // Two lanes is the unstated default a class figure already assumes.
  const laneFactor = Number.isFinite(lanes) && lanes > 0 ? lanes / 2 : 1;
  return base * laneFactor;
}

/**
 * Build a graph of the drivable road network: chains and the nodes they meet
 * at (CW-19).
 *
 * OSM splits ways at junctions, so a road record's polyline already IS a
 * chain and its ENDS already are the junctions — this does not have to search
 * for crossings, only to notice which chains share an end. Endpoints within
 * NODE_SNAP_M of each other are treated as the same node, because the extract
 * rounds coordinates and two ways that meet in the data can land a few
 * centimetres apart after projection.
 *
 * Degree is what makes a node useful: 1 is a dead end or the edge of the
 * bake, 2 is a road simply continuing under a new name, and 3 or more is a
 * real intersection — which is where a traffic light belongs.
 *
 * @param {Array<{points: number[][], widthM: number, kind: string}>} roads
 * @param {{snapM?: number}} [options]
 * @returns {{
 *   chains: Array<{points: number[][], kind: string, widthM: number, startNode: number, endNode: number}>,
 *   nodes: Array<{x: number, y: number, degree: number, chains: number[]}>,
 *   intersections: number[]
 * }}
 */
export function buildRoadGraph(roads, options = {}) {
  const snap = options.snapM ?? NODE_SNAP_M;
  const nodes = [];
  const byCell = new Map();

  const nodeAt = (x, y) => {
    // A snap grid alone would split two points that straddle a cell edge, so
    // the neighbouring cells are searched too.
    const cx = Math.round(x / snap);
    const cy = Math.round(y / snap);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const bucket = byCell.get(`${cx + dx},${cy + dy}`);
        if (!bucket) continue;
        for (const index of bucket) {
          const n = nodes[index];
          if (Math.hypot(n.x - x, n.y - y) <= snap) return index;
        }
      }
    }
    const index = nodes.length;
    nodes.push({ x, y, degree: 0, chains: [] });
    const key = `${cx},${cy}`;
    if (!byCell.has(key)) byCell.set(key, []);
    byCell.get(key).push(index);
    return index;
  };

  const chains = [];
  for (const road of roads ?? []) {
    if (!DRIVABLE_ROAD_KINDS.has(road?.kind)) continue;
    const points = road.points;
    if (!Array.isArray(points) || points.length < 2) continue;
    const first = points[0];
    const last = points[points.length - 1];
    const startNode = nodeAt(first[0], first[1]);
    const endNode = nodeAt(last[0], last[1]);
    const index = chains.length;
    chains.push({
      points,
      kind: road.kind,
      widthM: road.widthM,
      startNode,
      endNode,
    });
    for (const node of new Set([startNode, endNode])) {
      nodes[node].chains.push(index);
    }
    // A loop that starts and ends at one node still arrives there twice.
    nodes[startNode].degree += 1;
    nodes[endNode].degree += 1;
  }

  const intersections = [];
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].degree >= 3) intersections.push(i);
  }

  return { chains, nodes, intersections };
}
