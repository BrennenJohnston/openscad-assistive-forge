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
//
// CW-50 widened the four classes a walker actually stands beside. The old
// numbers were the carriageway alone; these are curb to curb, which is what
// the pavement runs against and therefore what the view has to be true to.
// A US travel lane is 3.0-3.7 m and a parking lane about 2.4 m, so a
// two-lane residential street with parking on both sides is nearer 8 m than
// 6, and each step up the class ladder adds a lane's worth.
//
// unclassified and living_street deliberately did NOT move with residential:
// a living street is narrow by design, and both are left for the owner to
// call rather than widened by association. That leaves primary and trunk at
// the same 14 m, which is stated here rather than hidden.
export const ROAD_WIDTHS_M = {
  motorway: 16,
  trunk: 14,
  primary: 14,
  secondary: 12,
  tertiary: 10,
  residential: 8,
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

/**
 * How wide a separately-mapped pavement is drawn (CW-33).
 *
 * A footway way defaults to 2.5 m above, which is a path through a park. A
 * kerbside pavement is narrower and more regular, and `width` is tagged on at
 * most fourteen ways in any of the four cities - far too sparse to design on -
 * so this is a stated class default rather than a measurement.
 */
export const SIDEWALK_WIDTH_M = 1.8;

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
/**
 * The leisure and landuse values the game treats as greenspace (CW-33).
 *
 * ONE list, exported, because two of them would drift: the bake builds its
 * Overpass filter from these and the trim gate below admits exactly the same
 * values, so an extract can never carry a polygon the game will not draw or
 * miss one it would have. Every value was counted across the four cities
 * before it was chosen (plan section 1d).
 */
export const GREEN_LEISURE_VALUES = [
  'park',
  'garden',
  'pitch',
  'playground',
  'grass',
];
export const GREEN_LANDUSE_VALUES = [
  'grass',
  'recreation_ground',
  'forest',
  'meadow',
  'village_green',
];

/**
 * The amenity values that read as a shopfront at street level (CW-33).
 *
 * `amenity` unfiltered is the wrong question to ask a downtown: it is mostly
 * benches, waste baskets, bicycle parking and parking meters, and asking for
 * all of them timed the Overpass query out (HTTP 504, measured). These are the
 * ones that put a lit window and a sign on a ground floor, which is what
 * CW-34 chooses a storefront band from.
 *
 * This filters the QUERY. The node gate below stays permissive, because an
 * amenity node that has arrived in an extract is small and usable whatever it
 * is; the gate's job is to drop what the game cannot use, not to second-guess
 * the bake.
 */
export const STOREFRONT_AMENITY_VALUES = [
  'restaurant',
  'cafe',
  'fast_food',
  'bar',
  'pub',
  'bank',
  'pharmacy',
  'cinema',
  'theatre',
  'library',
  'post_office',
  'marketplace',
];

/**
 * CW-43 (CW-Q43): street furniture, from real node positions only.
 *
 * One list, not two — the bake queries exactly these values and the parser
 * types by them, so an extract can never carry what the game will not read,
 * and the game can never expect what the bake does not fetch. The owner's
 * mission sentence governs: this is wayfinding data for a blind traveler,
 * so placement fidelity IS the accessibility point — true positions, never
 * decorative scatter.
 *
 * Rendered prop classes (drawn, solid, dressed in the class pass):
 * bus_stop (highway), bench / waste_basket / bicycle_parking (amenity),
 * fire_hydrant (emergency). Data-only wayfinding classes (ride the extract
 * and the model for future features; nothing drawn): crossing (highway,
 * with its kerb / tactile_paving / crossing:* / traffic_signals:*
 * companions), plus bare kerb=* and tactile_paving=* nodes.
 */
export const FURNITURE_AMENITY_VALUES = [
  'bench',
  'waste_basket',
  'bicycle_parking',
];
export const FURNITURE_HIGHWAY_VALUES = ['bus_stop', 'crossing'];
export const FURNITURE_EMERGENCY_VALUES = ['fire_hydrant'];

/**
 * CW-44 (CW-Q44): named attraction nodes join the bake and the landmark
 * legend at true positions — generic and data-driven, no 3D special-casing.
 * tourism=attraction is the umbrella; attraction=* carries the specific
 * kind (the Great Wheel is attraction=big_wheel).
 */
export const ATTRACTION_TOURISM_VALUES = ['attraction'];

/** Whether a way's tags make it greenspace the game draws. */
export function isGreenTags(tags) {
  if (!tags) return false;
  return (
    GREEN_LEISURE_VALUES.includes(tags.leisure) ||
    GREEN_LANDUSE_VALUES.includes(tags.landuse)
  );
}

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
 * The smallest building:part the bake keeps, in square metres (CW-Q31).
 *
 * Denver's downtown is mapped with thousands of building:part volumes, and a
 * large share of them are slivers a few centimetres across - ledges and
 * setbacks that no character cell could ever show. Dropping them at BAKE time
 * is what brought Denver inside the size bar and finally let it have the
 * stepped towers and roofs the other three cities already had.
 *
 * The owner signed the number. It lives here rather than in the bake script
 * so the schema documentation and the bake read the same one.
 */
export const MIN_PART_AREA_M2 = 10;

/**
 * Ground area of a lat/lon ring in square metres, as the game would project
 * it. Pure; used by the bake to apply MIN_PART_AREA_M2.
 *
 * @param {Array<{lat:number,lon:number}>} geometry - a closed ring
 * @param {{lat:number,lon:number}} center
 * @returns {number} area in m², always positive; 0 for a degenerate ring
 */
export function ringAreaM2(geometry, center) {
  if (!Array.isArray(geometry) || geometry.length < 3) return 0;
  const pts = geometry.map((p) => projectLatLon(p.lat, p.lon, center));
  return Math.abs(signedArea(pts));
}

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
export function ringCentroid(ring) {
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
 *   buildings: Array<{outer: Array<[number,number]>, holes: Array<Array<[number,number]>>, heightM: number, minHeightM: number, name: (string|undefined), parts: Array<Object>, partsAreMass: boolean, roof: (Object|null)}>,
 *   roads: Array<{points: Array<[number,number]>, widthM: number, kind: string, name: (string|undefined), sidewalk: boolean, surface: (string|undefined)}>,
 *   greens: Array<{outer: Array<[number,number]>, kind: string}>,
 *   pois: Array<{x:number, y:number, kind:string}>,
 *   trees: Array<[number,number]>,
 *   boundsM: {minX:number, minY:number, maxX:number, maxY:number},
 *   stats: {buildingCount:number, roadCount:number, greenCount:number, poiCount:number, sidewalkCount:number, surfacedRoadCount:number, treeCount:number, partCount:number, orphanParts:number, droppedRings:number, droppedElements:number}
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
  const greens = [];
  const trees = [];
  const pois = [];
  const furniture = [];
  const wayfinding = [];
  const attractions = [];
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
      if (!Number.isFinite(el.lat) || !Number.isFinite(el.lon)) {
        droppedElements++;
        continue;
      }
      if (tags.natural === 'tree') {
        trees.push(projectLatLon(el.lat, el.lon, center));
        continue;
      }
      // CW-43 (CW-Q43): rendered street furniture, typed, at the node's true
      // position. Routed BEFORE the poi branch on purpose: a bench is an
      // amenity node, and letting it fall through would hand the storefront
      // chooser a bench to dress a ground floor by.
      if (tags.highway === 'bus_stop') {
        const [x, y] = projectLatLon(el.lat, el.lon, center);
        furniture.push({
          x,
          y,
          kind: 'bus_stop',
          shelter: tags.shelter === 'yes',
        });
        continue;
      }
      if (FURNITURE_AMENITY_VALUES.includes(tags.amenity)) {
        const [x, y] = projectLatLon(el.lat, el.lon, center);
        const item = { x, y, kind: tags.amenity };
        if (tags.amenity === 'bench') item.backrest = tags.backrest === 'yes';
        furniture.push(item);
        continue;
      }
      if (tags.emergency === 'fire_hydrant') {
        const [x, y] = projectLatLon(el.lat, el.lon, center);
        furniture.push({ x, y, kind: 'fire_hydrant' });
        continue;
      }
      // CW-43 data-only wayfinding: crossings with their companions, and
      // bare kerb / tactile nodes. Nothing is drawn; the typed points ride
      // the model for the future wayfinding features the owner named.
      if (tags.highway === 'crossing' || tags.kerb || tags.tactile_paving) {
        const [x, y] = projectLatLon(el.lat, el.lon, center);
        wayfinding.push({
          x,
          y,
          kind:
            tags.highway === 'crossing'
              ? 'crossing'
              : tags.kerb
                ? 'kerb'
                : 'tactile_paving',
          tags,
        });
        continue;
      }
      // CW-44 (CW-Q44): a NAMED attraction node joins the landmark
      // candidates — generic and data-driven, no special-casing by name.
      if (
        typeof tags.name === 'string' &&
        tags.name.trim() !== '' &&
        (tags.tourism === 'attraction' || typeof tags.attraction === 'string')
      ) {
        const [x, y] = projectLatLon(el.lat, el.lon, center);
        attractions.push({
          name: tags.name,
          x,
          y,
          kind:
            typeof tags.attraction === 'string'
              ? tags.attraction
              : 'attraction',
          heightM: parseLengthMeters(tags.height) ?? 0,
        });
        continue;
      }
      // CW-33/CW-34: a shop or a place to eat, kept as a point with its kind.
      // Nothing is drawn AT the point - it says what sort of ground floor the
      // building nearest to it should wear.
      if (tags.shop || tags.amenity) {
        const [x, y] = projectLatLon(el.lat, el.lon, center);
        pois.push({ x, y, kind: tags.shop ? 'shop' : tags.amenity });
        continue;
      }
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
      // CW-33: a separately-mapped pavement is a footway way with
      // footway=sidewalk. There are hundreds in every city and until now they
      // were built as narrow ROADS, which is why a kerbside path read as
      // another lane. The flag is what lets the scene give them their own
      // ribbon, their own width and their own surface.
      const sidewalk =
        tags.highway === 'footway' && tags.footway === 'sidewalk';
      roads.push({
        points,
        widthM: sidewalk
          ? SIDEWALK_WIDTH_M
          : (ROAD_WIDTHS_M[tags.highway] ?? DEFAULT_ROAD_WIDTH_M),
        kind: tags.highway,
        // CW-27: the bake has always kept road names; this is where they
        // were being dropped on the floor.
        name: tags.name,
        sidewalk,
        // Undefined where OSM has no opinion; the scene applies a documented
        // class default rather than inventing one here.
        surface: tags.surface,
      });
      continue;
    }

    // CW-33 greenspace: parks, gardens, pitches and the rest, as flat
    // polygons. Ways only this round - a park mapped as a multipolygon
    // relation is missed, and the release record counts what that costs.
    if (el.type === 'way' && isGreenTags(tags) && Array.isArray(el.geometry)) {
      const ring = projectRing(el.geometry, center, true);
      if (ring) {
        greens.push({ outer: ring, kind: tags.leisure ?? tags.landuse });
      } else {
        droppedRings++;
      }
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
    greens,
    trees,
    pois,
    furniture,
    wayfinding,
    attractions,
    boundsM,
    stats: {
      buildingCount: buildings.length,
      roadCount: roads.length,
      greenCount: greens.length,
      poiCount: pois.length,
      sidewalkCount: roads.filter((r) => r.sidewalk).length,
      surfacedRoadCount: roads.filter((r) => r.surface).length,
      treeCount: trees.length,
      partCount: partWays.length,
      orphanParts,
      droppedRings,
      droppedElements,
      // CW-43/CW-44: per-class counts — the record's table and the e2e
      // count oracles read these.
      furnitureCount: furniture.length,
      furnitureByKind: furniture.reduce((acc, f) => {
        acc[f.kind] = (acc[f.kind] ?? 0) + 1;
        return acc;
      }, {}),
      wayfindingCount: wayfinding.length,
      attractionCount: attractions.length,
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
    // CW-33: what the ground is actually made of. `surface` is tagged on
    // 88% of Seattle's roads and 9% of Albuquerque's, so it informs the
    // texture where present and a documented class default carries the rest.
    'surface',
    // A separately-mapped pavement is a highway=footway way with this
    // sub-tag. There are hundreds in every city and they were already in the
    // extracts, drawn as if they were roads; this is the tag that tells them
    // apart.
    'footway',
    // Too sparse to design on (at most 14 width tags in any of the four
    // cities), kept so a later release can use them without another rebake.
    'lanes',
    'width',
    // CW-33 greenspace.
    'landuse',
    'leisure',
    // CW-34's facades ride this rebake rather than asking Overpass twice.
    'building:material',
    'building:colour',
    // CW-43 (CW-Q43): street furniture and its wayfinding companions. The
    // owner's mission sentence: vital wayfinding information to a blind
    // traveler — the companions (does the stop have a shelter, does the
    // bench have a back, is the kerb lowered, does the signal sound) are
    // the data, not decoration.
    'emergency',
    'shelter',
    'bench',
    'bin',
    'backrest',
    'seats',
    'kerb',
    'tactile_paving',
    'crossing',
    'crossing:island',
    'crossing:markings',
    'traffic_signals:sound',
    'traffic_signals:vibration',
    // CW-44 (CW-Q44): the specific attraction kind (big_wheel, viewpoint…).
    'attraction',
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
    // CW-33 repeats the CW-26 lesson: keeping a tag is not enough, this gate
    // has to admit the way as well. A leisure=park polygon carries none of
    // the three keys above and would die here with its tags intact.
    if (
      !tags ||
      (!tags.building &&
        !tags.highway &&
        !tags['building:part'] &&
        !isGreenTags(tags))
    )
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
    // CW-33: shop and amenity nodes join the trees. They are not drawn yet —
    // CW-34 uses them to choose a building's ground-floor storefront from
    // what is actually there — but they ride this rebake so that release
    // does not have to ask Overpass for the four cities all over again.
    // CW-43/CW-44 repeat the gate lesson a third time: keeping a tag is not
    // enough — a bus stop (highway), a hydrant (emergency), a bare kerb or
    // tactile node, and an attraction (tourism/attraction) all die here
    // unless the gate admits them too.
    if (
      !tags ||
      (!tags.natural &&
        !tags.shop &&
        !tags.amenity &&
        !tags.highway &&
        !tags.emergency &&
        !tags.kerb &&
        !tags.tactile_paving &&
        !tags.tourism &&
        !tags.attraction)
    ) {
      return null;
    }
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

  // CW-44 (CW-Q44): named attraction NODES join the building ways, and an
  // attraction outranks a plain tourism=hotel building: the Seattle legend
  // was 11/12 hotels because hotels are the named tall things downtown. The
  // base of 6 is chosen against the building arithmetic above — a plain
  // tall hotel reaches 5 (tourism 3 + height 2) and 6 only with a
  // city-block footprint, so a thing people travel to see beats plain
  // built mass and only another tagged site can tie it. Buildings run
  // first, so a name mapped as both a way and a node keeps the way's
  // geometry-backed entry.
  for (const node of model.attractions ?? []) {
    if (typeof node.name !== 'string' || node.name.trim() === '') continue;
    if (seen.has(node.name)) continue;
    seen.add(node.name);
    let score = 6;
    if (node.heightM >= 60) score += 2;
    else if (node.heightM >= 25) score += 1;
    scored.push({
      name: node.name,
      x: node.x,
      y: node.y,
      heightM: node.heightM || 0,
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

// CW-27. Street lookup runs on movement frames, so it is a grid rather than
// a scan: 40 m cells, the same size the sign placer found workable, and a
// query only ever visits the rings it needs to cover its own limit.
const STREET_CELL_M = 40;

// A cycletrack or footpath usually runs a few metres from the street it
// parallels, so the NEAREST named way is often not the street a player
// would say they are on: at the Seattle spawn it is "4th Avenue Cycletrack"
// at 4.1 m with "4th Avenue" itself at 8.1 m. A small penalty prefers the
// street, while still letting a genuinely separate path win when you really
// are on one.
const PATH_KINDS = new Set(['cycleway', 'footway', 'path', 'steps', 'track']);
const PATH_PENALTY_M = 8;

/** Squared distance from a point to a segment, and where along it that fell. */
function pointSegDist2(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = 0;
  if (len2 > 0) {
    t = ((px - ax) * dx + (py - ay) * dy) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
  }
  const cx = ax + dx * t;
  const cy = ay + dy * t;
  return (px - cx) * (px - cx) + (py - cy) * (py - cy);
}

/**
 * Index every NAMED road segment for nearest-name queries.
 *
 * Unnamed ways are left out entirely: they can never answer the question,
 * and a downtown extract is mostly unnamed service spurs and footpaths.
 *
 * @param {Array<{points: Array<[number,number]>, name?: string}>} roads
 * @param {number} [cellM]
 * @returns {{nearest: (x:number, y:number, maxM:number) => {name:string, distM:number}|null, segmentCount: number}}
 */
export function buildStreetIndex(roads, cellM = STREET_CELL_M) {
  const segs = [];
  const cells = new Map();
  const key = (cx, cy) => `${cx},${cy}`;

  for (const road of roads ?? []) {
    if (typeof road?.name !== 'string' || road.name === '') continue;
    const pts = road.points ?? [];
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1];
      const [bx, by] = pts[i];
      const index = segs.length;
      segs.push({ ax, ay, bx, by, name: road.name, kind: road.kind });
      const c0x = Math.floor(Math.min(ax, bx) / cellM);
      const c1x = Math.floor(Math.max(ax, bx) / cellM);
      const c0y = Math.floor(Math.min(ay, by) / cellM);
      const c1y = Math.floor(Math.max(ay, by) / cellM);
      for (let cx = c0x; cx <= c1x; cx++) {
        for (let cy = c0y; cy <= c1y; cy++) {
          const k = key(cx, cy);
          let list = cells.get(k);
          if (!list) {
            list = [];
            cells.set(k, list);
          }
          list.push(index);
        }
      }
    }
  }

  return {
    segmentCount: segs.length,
    /**
     * Every named street within maxM, nearest first, one entry per NAME.
     * The controller needs the runner-up as well as the winner: at an
     * intersection two streets are almost equidistant, and knowing the gap
     * is what stops the HUD flapping between them.
     *
     * @param {number} x
     * @param {number} y
     * @param {number} maxM
     * @returns {Array<{name: string, distM: number}>}
     */
    query(x, y, maxM) {
      if (!(maxM > 0) || segs.length === 0) return [];
      const rings = Math.ceil(maxM / cellM);
      const cx = Math.floor(x / cellM);
      const cy = Math.floor(y / cellM);
      const max2 = maxM * maxM;
      const bestByName = new Map();
      const seen = new Set();
      for (let ix = cx - rings; ix <= cx + rings; ix++) {
        for (let iy = cy - rings; iy <= cy + rings; iy++) {
          const list = cells.get(key(ix, iy));
          if (!list) continue;
          for (const index of list) {
            if (seen.has(index)) continue;
            seen.add(index);
            const s = segs[index];
            const d2 = pointSegDist2(x, y, s.ax, s.ay, s.bx, s.by);
            if (d2 > max2) continue;
            const distM = Math.sqrt(d2);
            const rank = distM + (PATH_KINDS.has(s.kind) ? PATH_PENALTY_M : 0);
            const prev = bestByName.get(s.name);
            if (prev === undefined || rank < prev.rank) {
              bestByName.set(s.name, { distM, rank });
            }
          }
        }
      }
      return [...bestByName.entries()]
        .map(([name, v]) => ({ name, distM: v.distM, rank: v.rank }))
        .sort((a, b) => a.rank - b.rank);
    },
    /** The single nearest named street, or null. */
    nearest(x, y, maxM) {
      return this.query(x, y, maxM)[0] ?? null;
    },
  };
}
