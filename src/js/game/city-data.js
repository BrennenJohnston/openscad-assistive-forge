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

// CW-76. A part standing this close to the ground is standing ON it. Above
// it, the parts float and the outline under them is what holds the building
// up - see resolveMassing.
export const PART_GROUND_MAX_M = 0.5;

// CW-76. Two volumes this far apart vertically are still one building: real
// extracts round a podium to 8 m and start the slab above it at 9, and a
// walker at street level cannot see a metre of daylight thirty metres up.
// Wider than this and the gap is the defect this release is named after.
export const SUPPORT_GAP_TOLERANCE_M = 1.5;

// CW-76 canopies. `building=roof` and `building=bridge` are not masses: they
// are a surface held over something. Extruded from zero they become a wall
// across the street, which is what the round's directive photographed on 3rd
// Avenue. A canopy is a SLAB this thick, and its underside never drops below
// the clearance a walker needs - below that a canopy would be a wall again,
// and the collision grid (walk-controls, EYE_HEIGHT_M + 0.3) would start
// blocking a way that is meant to be walked under.
export const CANOPY_THICKNESS_M = 0.3;
export const CANOPY_MIN_CLEAR_M = 2.2;

// Where a canopy sits when the data says nothing at all: no min_height, no
// height, and nothing under it. Two thirds of the roof ways in the four
// extracts are exactly this (Seattle 27 of 46, Albuquerque 14 of 14), so this
// number is the one most canopies actually wear. It is a shelter height, not
// a guess at a building.
export const CANOPY_DEFAULT_BASE_M = 4;

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
// unclassified moves with residential (CW-Q62): it is the same kind of street
// and reading two metres narrower than an identical neighbour was an accident
// of the class list, not a design. living_street stays at 6 because a shared
// street is narrow ON PURPOSE - that narrowness is the traffic calming.
//
// primary and trunk therefore both sit at 14 m (CW-Q63, left deliberately):
// both are major arterials, 14 m is honest for each, and widening trunk to
// keep them distinct would only put more black surface in the frame.
export const ROAD_WIDTHS_M = {
  motorway: 16,
  trunk: 14,
  primary: 14,
  secondary: 12,
  tertiary: 10,
  residential: 8,
  unclassified: 8,
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

/**
 * CW-77: mapped street lamps.
 *
 * Kept OUT of `furniture` on purpose. `furniture` is CW-43's stream, with its
 * own geometry, its own spacing grid and exact e2e counts; a lamp is drawn by
 * the lamp stream instead, and folding one into the other would move every
 * furniture count in the game for no reason a reader could follow. They ride
 * their own list.
 */
export const LAMP_HIGHWAY_VALUE = 'street_lamp';
export const FURNITURE_EMERGENCY_VALUES = ['fire_hydrant'];

/**
 * CW-44 (CW-Q44): named attraction nodes join the bake and the landmark
 * legend at true positions — generic and data-driven, no 3D special-casing.
 * tourism=attraction is the umbrella; attraction=* carries the specific
 * kind (the Great Wheel is attraction=big_wheel).
 */
export const ATTRACTION_TOURISM_VALUES = ['attraction'];

/**
 * CW-55 (CW-Q55): the planting and resting seeds CW-57 renders.
 *
 * One list per query family, the same bargain FURNITURE_* strikes: the bake
 * asks for exactly these values and the parser types by them, so an extract
 * can never carry what the game will not read and the game can never expect
 * what the bake did not fetch.
 *
 * A planter is a node OR a way (a raised bed with a footprint); a flowerbed
 * is a way, tagged either leisure or landuse, and deliberately NOT added to
 * the GREEN_* lists - a flowerbed is a planting to be dressed, not a lawn to
 * be coloured green. A picnic table is a node.
 */
export const PLANTER_MAN_MADE_VALUES = ['planter'];
export const FLOWERBED_VALUES = ['flowerbed'];
export const PICNIC_LEISURE_VALUES = ['picnic_table'];

/**
 * Whether tags make a CW-55 planting - a planter or a flowerbed. Kept apart
 * from isGreenTags on purpose: these are dressed, not drawn as lawn.
 */
export function isPlantingTags(tags) {
  if (!tags) return false;
  return (
    PLANTER_MAN_MADE_VALUES.includes(tags.man_made) ||
    FLOWERBED_VALUES.includes(tags.leisure) ||
    FLOWERBED_VALUES.includes(tags.landuse)
  );
}

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

/**
 * The height these tags actually STATE, or null when the 8 m default is doing
 * the talking. resolveBuildingHeight cannot answer this: it has already
 * substituted the default by the time it returns, and a canopy tagged nothing
 * is a different structure from one tagged height=8.
 *
 * @param {Object} tags
 * @returns {number|null}
 */
export function taggedHeightM(tags = {}) {
  const direct =
    parseLengthMeters(tags.height) ??
    parseLengthMeters(tags['building:height']);
  if (direct !== null && direct > 0)
    return Math.min(direct, MAX_BUILDING_HEIGHT_M);
  const levels = parseFloat(tags['building:levels']);
  if (Number.isFinite(levels) && levels > 0) {
    return Math.min(levels * LEVEL_HEIGHT_M, MAX_BUILDING_HEIGHT_M);
  }
  return null;
}

/**
 * CW-76: is this way a canopy rather than a mass? `building=roof` is a roof
 * over something with no walls under it; `building=bridge` is the same idea
 * spanning a gap. Both are drawn as slabs.
 *
 * @param {Object} tags
 * @returns {boolean}
 */
export function isCanopyBuilding(tags = {}) {
  return tags?.building === 'roof' || tags?.building === 'bridge';
}

/**
 * Where a canopy's slab starts and stops.
 *
 * The cascade for the UNDERSIDE, in the order the data deserves to be
 * believed: the mapper's own min_height; the height of the building the
 * canopy sits over; the canopy's own tagged height less the slab (a roof
 * tagged 3 m tall has its SURFACE at 3 m, not its underside); and finally the
 * shelter default. The TOP is the tagged height where there is one, so the
 * Convention Center Arch keeps the 10-to-18 m volume its mapper described,
 * and a slab's thickness otherwise.
 *
 * @param {Object} tags
 * @param {number|null} coveredHeightM - the building this canopy stands over
 * @returns {{baseM: number, topM: number, source: string}}
 */
export function resolveCanopy(tags = {}, coveredHeightM = null) {
  const tagged = taggedHeightM(tags);
  const min = parseLengthMeters(tags.min_height);
  const minLevel = parseFloat(tags['building:min_level']);
  const minTagged =
    min !== null && min > 0
      ? min
      : Number.isFinite(minLevel) && minLevel > 0
        ? minLevel * LEVEL_HEIGHT_M
        : null;

  let baseM;
  let source;
  if (minTagged !== null) {
    baseM = minTagged;
    source = 'min_height';
  } else if (Number.isFinite(coveredHeightM) && coveredHeightM > 0) {
    baseM = coveredHeightM;
    source = 'covered';
  } else if (tagged !== null) {
    baseM = tagged - CANOPY_THICKNESS_M;
    source = 'height';
  } else {
    baseM = CANOPY_DEFAULT_BASE_M;
    source = 'default';
  }
  baseM = Math.max(baseM, CANOPY_MIN_CLEAR_M);

  const topM = Math.max(tagged ?? 0, baseM + CANOPY_THICKNESS_M);
  return { baseM, topM, source };
}

/**
 * CW-76: decide what each building's MASS actually is, once every outline and
 * every part is in hand.
 *
 * Three questions, in this order, because each one changes the answer to the
 * next:
 *
 *  1. Is this way a canopy? Then it is a slab held over something, not a
 *     solid from the pavement. `building=roof` extruded from zero is how a
 *     canopy over 3rd Avenue became a building across the street.
 *
 *  2. Do this building's parts really replace its outline? Simple 3D
 *     Buildings says they do when they cover it (CW-26, PART_COVERAGE_MIN),
 *     and that is right - but only if one of them reaches the ground.
 *     Metropolitan Park West Tower's three parts all start at 45 m, so the
 *     outline stood down and the tower began in mid-air. The parts still
 *     replace the outline ABOVE their base; below it the outline is the
 *     podium that holds them up.
 *
 *  3. Is there anything under the lowest volume at all? Ask the whole city,
 *     not the way: an orphaned `building:part` at 121.9 m is the top slice of
 *     a stack whose lower slices are separate ways standing on the street,
 *     and a per-way test calls all four of them floating. Where the column
 *     really is empty the volume is drawn down to whatever IS under it - the
 *     gap is closed, never doubled, so a slab a metre above an 8 m podium
 *     grows by a metre rather than sprouting a second copy of the podium.
 *
 * Canopies are exempt from (3) on purpose. A canopy hangs; that is what it is
 * for. What it must not do is hang over nothing with no support, and that is
 * a question about COLUMNS - which need the roads, so the scene asks it
 * (city-scene.js, buildCityGroup) and this pass does not.
 *
 * Mutates `buildings` and returns what it did, for the census.
 *
 * @param {Array<Object>} buildings
 * @returns {{canopies:number, canopiesCovered:number, canopyBySource:Object, podiums:number, grounded:number, groundedToZero:number, floatingMass:number}}
 */
export function resolveMassing(buildings) {
  const out = {
    canopies: 0,
    canopiesCovered: 0,
    canopyBySource: { min_height: 0, covered: 0, height: 0, default: 0 },
    podiums: 0,
    grounded: 0,
    groundedToZero: 0,
    floatingMass: 0,
  };
  if (!Array.isArray(buildings) || buildings.length === 0) return out;

  const boxes = buildings.map((b) => ringBounds(b.outer));
  const centroids = buildings.map((b) => ringCentroid(b.outer));
  const canopy = buildings.map((b) => isCanopyBuilding(b.tags));

  // (1) Canopies. The covered building is the one whose outline contains this
  // canopy's centroid; where more than one does, the TALLEST wins, because a
  // canopy sits on the roof it is nearest to being part of.
  for (let i = 0; i < buildings.length; i++) {
    if (!canopy[i]) continue;
    const b = buildings[i];
    const [cx, cy] = centroids[i];
    let coveredHeightM = null;
    for (let j = 0; j < buildings.length; j++) {
      if (j === i || canopy[j]) continue;
      const bb = boxes[j];
      if (cx < bb.minX || cx > bb.maxX || cy < bb.minY || cy > bb.maxY) {
        continue;
      }
      if (!pointInRing(cx, cy, buildings[j].outer)) continue;
      const h = buildings[j].heightM ?? 0;
      if (coveredHeightM === null || h > coveredHeightM) coveredHeightM = h;
    }
    const { baseM, topM, source } = resolveCanopy(b.tags, coveredHeightM);
    b.minHeightM = baseM;
    b.heightM = topM;
    // A slab has no pitch. resolveRoof was answered against the old extent
    // and would now cap a 0.3 m body with a 1.5 m roof.
    b.roof = null;
    // A canopy's own parts must not stand in for it: the slab IS the way.
    b.partsAreMass = false;
    b.canopy = { baseM, topM, source, coveredHeightM };
    out.canopies++;
    if (source === 'covered') out.canopiesCovered++;
    out.canopyBySource[source]++;
  }

  // (2) The podium under parts that all float.
  for (const b of buildings) {
    b.podiumToM = 0;
    if (!b.partsAreMass || !Array.isArray(b.parts) || b.parts.length === 0) {
      continue;
    }
    let lowest = Infinity;
    for (const p of b.parts) {
      const base = Number.isFinite(p.minHeightM) ? p.minHeightM : 0;
      if (base < lowest) lowest = base;
    }
    if (!Number.isFinite(lowest) || !(lowest > PART_GROUND_MAX_M)) continue;
    const outlineBase = Number.isFinite(b.minHeightM) ? b.minHeightM : 0;
    if (outlineBase >= lowest) continue;
    b.podiumToM = lowest;
    out.podiums++;
  }

  // (3) Close the empty columns, lowest first. Bottom-up matters: fixing the
  // 19 m slab of a four-slab stack puts the 19.5 m slab back on solid ground,
  // and a pass that ran top-down would have drawn four nested boxes where the
  // city has one building.
  const drawnVolumes = (b) => {
    const list = [];
    if (b.partsAreMass) {
      if (b.podiumToM > 0) {
        list.push({ ring: b.outer, base: 0, top: b.podiumToM, owner: b });
      }
    } else {
      list.push({
        ring: b.outer,
        base: b.minHeightM ?? 0,
        top: b.heightM ?? 0,
        owner: b,
        volume: b,
      });
    }
    for (const p of b.parts ?? []) {
      list.push({
        ring: p.outer,
        base: p.minHeightM ?? 0,
        top: p.heightM ?? 0,
        owner: b,
        volume: p,
      });
    }
    return list;
  };

  const all = [];
  for (const b of buildings) all.push(...drawnVolumes(b));

  // ★ Read LIVE, never off the snapshot. This loop lowers volumes as it goes,
  // and a stack of four slabs is only resolved by one fix if the second slab
  // can see that the first one now reaches the ground.
  const baseOf = (v) => (v.volume ? (v.volume.minHeightM ?? 0) : v.base);
  const topOf = (v) => (v.volume ? (v.volume.heightM ?? 0) : v.top);

  /**
   * How high anything drawn over (x, y) reaches, other than `self`.
   *
   * ★★★ CW-90 (D-126): A BUILDING'S OWN VOLUMES COUNT AS SUPPORT NOW. CW-76
   * excluded them, which was right for the question it was asking - it only
   * ever looked at a building's LOWEST volume, and a sibling could not be
   * holding that up. It is wrong for the question the owner asked, which is
   * about a part hovering above a LOWER PART of the same building: there, the
   * lower part is exactly what support means.
   *
   * The walk still starts at the ground and only accepts a span whose base is
   * within a tolerance of what it has reached so far, so a floating sibling
   * cannot prop anything up - it has to be connected to the ground itself.
   */
  const supportUnder = (x, y, self) => {
    const spans = [];
    for (const v of all) {
      if (v === self) continue;
      if (!(topOf(v) > baseOf(v))) continue;
      if (!pointInRing(x, y, v.ring)) continue;
      spans.push(v);
    }
    spans.sort((a, z) => baseOf(a) - baseOf(z));
    let reach = PART_GROUND_MAX_M;
    for (const v of spans) {
      if (baseOf(v) > reach + SUPPORT_GAP_TOLERANCE_M) break;
      if (topOf(v) > reach) reach = topOf(v);
    }
    return reach;
  };

  // ★★★ EVERY VOLUME, NOT EACH BUILDING'S LOWEST ONE (CW-90, D-126, CW-Q89
  // "close every gap"). CW-76 built `lowestOf` and asked about that alone, so
  // a part hanging above a lower part was never even a candidate - it is not
  // the lowest thing its building draws, so the pass walked straight past it.
  // That is the defect the owner photographed: a floating half over the half
  // below it.
  //
  // MEASURED before this pass looked at all of them, over the four shipped
  // extracts: 71 drawn volumes still hung with a gap beneath them - Seattle
  // 35, Denver 31, Albuquerque 1, Burnaby 4. The worst were not obscure:
  // Seattle Municipal Tower began at 18 m under a 220 m tower, Qualtrics
  // Tower at 25 m, Museum House 88.5 m up with 77.8 m of nothing under it.
  //
  // It is also asked at each VOLUME'S own centre rather than at its
  // building's: a wing off to one side of a big outline is not described by
  // the middle of that outline.
  const floaters = [];
  for (let i = 0; i < buildings.length; i++) {
    if (canopy[i]) continue;
    for (const v of drawnVolumes(buildings[i])) {
      if (!v.volume) continue;
      if (!(v.base > PART_GROUND_MAX_M)) continue;
      floaters.push({
        index: i,
        building: buildings[i],
        volume: v.volume,
        ring: v.ring,
      });
    }
  }
  // Lowest first, and the reach is read LIVE, so grounding the 19 m slab of a
  // stack lets the 19.5 m slab above it see solid ground on the same pass.
  floaters.sort(
    (a, z) => (a.volume.minHeightM ?? 0) - (z.volume.minHeightM ?? 0)
  );

  for (const f of floaters) {
    const base = f.volume.minHeightM ?? 0;
    if (!(base > PART_GROUND_MAX_M)) continue;
    const [cx, cy] = ringCentroid(f.ring);
    const reach = supportUnder(cx, cy, null);
    if (reach + SUPPORT_GAP_TOLERANCE_M >= base) continue;
    const newBase = reach <= PART_GROUND_MAX_M ? 0 : reach;
    f.volume.minHeightM = newBase;
    // The volume just grew downward, and a pitched roof is a share of the
    // BODY, so it would grow with it. Re-answer it against the new extent.
    f.volume.roof = resolveRoof(f.volume.tags ?? {}, f.volume.heightM, newBase);
    out.grounded++;
    if (newBase === 0) out.groundedToZero++;
  }

  // The post-condition, MEASURED rather than assumed: after the pass, how
  // many DRAWN VOLUMES still stand on nothing? CW-90 widened this from
  // "masses" to every volume, for the same reason it widened the pass: a part
  // hanging over a lower part is the defect, and counting only each
  // building's lowest volume could never see one. The e2e guard asserts this
  // is zero in all four cities.
  for (let i = 0; i < buildings.length; i++) {
    if (canopy[i]) continue;
    for (const v of drawnVolumes(buildings[i])) {
      if (!v.volume) continue;
      const base = v.volume.minHeightM ?? 0;
      if (!(base > PART_GROUND_MAX_M)) continue;
      const [cx, cy] = ringCentroid(v.ring);
      if (supportUnder(cx, cy, null) + SUPPORT_GAP_TOLERANCE_M < base) {
        out.floatingMass++;
      }
    }
  }

  return out;
}

/**
 * CW-77: the terrain block an `ascii-city-extract@2` carries, validated.
 *
 * The bake samples a national 1 m DEM on a regular grid clipped to the
 * circle and writes it as a flat row-major array with its own origin, step
 * and dimensions, plus the licence and attribution the source requires. This
 * turns it into something a heightfield can be built from and REFUSES a block
 * it cannot trust rather than handing on a half-filled grid: a wrong terrain
 * is a walker sunk to the knee or floating, which is worse than flat ground.
 *
 * Returns null for a v1 extract, which is the whole additive promise.
 *
 * @param {Object|undefined} raw
 * @returns {{originX:number, originY:number, stepM:number, cols:number, rows:number, samples:Float32Array, coverage:number, minM:number, maxM:number, source:string, license:string, attribution:string}|null}
 */
export function parseElevation(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const { originX, originY, stepM, cols, rows } = raw;
  const finite = (v) => typeof v === 'number' && Number.isFinite(v);
  if (![originX, originY, stepM, cols, rows].every(finite)) return null;
  if (!(stepM > 0) || !(cols > 1) || !(rows > 1)) return null;
  if (!Array.isArray(raw.samples) || raw.samples.length !== cols * rows) {
    return null;
  }

  // A null in the grid is a point the service had no data for, and it stays a
  // hole rather than a zero: sea level is a real height and "no answer" is
  // not. `coverage` is what fraction of the grid answered, so a consumer can
  // refuse a city that is mostly holes.
  const samples = new Float32Array(cols * rows);
  let filled = 0;
  let minM = Infinity;
  let maxM = -Infinity;
  for (let i = 0; i < samples.length; i++) {
    const v = raw.samples[i];
    if (typeof v === 'number' && Number.isFinite(v)) {
      samples[i] = v;
      filled++;
      if (v < minM) minM = v;
      if (v > maxM) maxM = v;
    } else {
      samples[i] = Number.NaN;
    }
  }
  if (filled === 0) return null;

  // Coverage is measured against the points the bake ASKED FOR, not against
  // the whole rectangle: a circle fills about 61 % of its bounding square at
  // this step, and reporting that as 61 % covered would read as "a third of
  // the terrain is missing" when nothing is.
  const asked =
    typeof raw.inCircle === 'number' && raw.inCircle > 0
      ? raw.inCircle
      : samples.length;

  return {
    originX,
    originY,
    stepM,
    cols,
    rows,
    samples,
    inCircle: asked,
    coverage: Math.min(1, filled / asked),
    minM,
    maxM,
    source: typeof raw.source === 'string' ? raw.source : '',
    license: typeof raw.license === 'string' ? raw.license : '',
    attribution: typeof raw.attribution === 'string' ? raw.attribution : '',
  };
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
  // CW-55 (CW-Q55): the seeds CW-57 renders. Kept apart from `furniture`
  // because furniture is DRAWN today and its counts are e2e-pinned; these
  // ride the model until a release renders them.
  const plantings = [];
  const picnicTables = [];
  const partWays = [];
  // CW-77: mapped street lamps, their own stream (see LAMP_HIGHWAY_VALUE).
  const lamps = [];
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
        // CW-55: a tree is a TYPED OBJECT now, not a bare [x, y]. What it is
        // has to travel with where it is or CW-56 would need a parallel array
        // keyed by index, which is the classic way for two lists to drift.
        // There was exactly one consumer of the array form to convert.
        const [x, y] = projectLatLon(el.lat, el.lon, center);
        const tree = { x, y };
        if (typeof tags.leaf_type === 'string') tree.leafType = tags.leaf_type;
        if (typeof tags.genus === 'string') tree.genus = tags.genus;
        if (typeof tags.species === 'string') tree.species = tags.species;
        if (typeof tags.denotation === 'string') {
          tree.denotation = tags.denotation;
        }
        trees.push(tree);
        continue;
      }
      // CW-55: a planter node and a picnic table, typed at their true
      // positions. Routed BEFORE the poi branch for the same reason a bench
      // is: a picnic table is a leisure node and must not be handed to the
      // storefront chooser.
      if (PLANTER_MAN_MADE_VALUES.includes(tags.man_made)) {
        const [x, y] = projectLatLon(el.lat, el.lon, center);
        plantings.push({ x, y, kind: 'planter', areaM2: 0 });
        continue;
      }
      if (PICNIC_LEISURE_VALUES.includes(tags.leisure)) {
        const [x, y] = projectLatLon(el.lat, el.lon, center);
        picnicTables.push({ x, y });
        continue;
      }
      // CW-77: a mapped street lamp, at its own position. Routed before the
      // furniture branch for the same reason the furniture branch sits before
      // the poi one: a lamp is a highway node and must not fall through into
      // something that dresses a ground floor.
      if (tags.highway === LAMP_HIGHWAY_VALUE) {
        const [x, y] = projectLatLon(el.lat, el.lon, center);
        const lamp = { x, y };
        if (typeof tags.lamp_mount === 'string') lamp.mount = tags.lamp_mount;
        const lampH = parseLengthMeters(tags.height);
        if (lampH !== null && lampH > 0) lamp.heightM = lampH;
        // Whose asset it is. The Seattle extract carries City Light's own
        // pole register beside OpenStreetMap's lamps (CW-Q76), and a reader
        // has to be able to tell them apart.
        if (typeof tags.operator === 'string') lamp.operator = tags.operator;
        if (typeof tags.ref === 'string') lamp.ref = tags.ref;
        lamps.push(lamp);
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
      //
      // CW-53: a shop keeps its OWN VALUE, prefixed so the two tag families
      // can never collide. This used to collapse all 1,042 shop nodes in the
      // four extracts to one kind, which sent every one of them to the same
      // ground floor - and the value was already in the extract, so nothing
      // had to be rebaked to start reading it. The game decides which values
      // are worth their own shopfront; the parser only stops throwing the
      // answer away.
      if (tags.shop || tags.amenity) {
        const [x, y] = projectLatLon(el.lat, el.lon, center);
        pois.push({
          x,
          y,
          kind: tags.shop ? `shop:${tags.shop}` : tags.amenity,
        });
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
        // CW-63: the OSM way id, carried so a landmark dressing can be keyed
        // by it. A NAME would have been easier and is the wrong key: names
        // are edited, translated and disambiguated upstream, and CW-62 has
        // just recorded what names-as-identity costs when a rebake moves one.
        id: el.id,
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
          id: el.id,
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

    // CW-55: a planter or a flowerbed mapped as a POLYGON. It is carried as a
    // centroid and an area rather than as a ring, because what CW-57 needs is
    // where the bed is and how much of it there is - a two-by-four pixel cell
    // cannot show the shape of a flowerbed, and keeping the ring would put
    // real bytes in every extract for a detail no one can see.
    if (
      el.type === 'way' &&
      isPlantingTags(tags) &&
      Array.isArray(el.geometry)
    ) {
      const ring = projectRing(el.geometry, center, true);
      if (ring) {
        const [x, y] = ringCentroid(ring);
        plantings.push({
          x,
          y,
          kind: PLANTER_MAN_MADE_VALUES.includes(tags.man_made)
            ? 'planter'
            : 'flowerbed',
          areaM2: Math.round(Math.abs(signedArea(ring)) * 100) / 100,
        });
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

  // CW-76: canopies, podiums and empty columns, decided over the whole set
  // rather than one way at a time. Runs unconditionally - a city can have
  // roof ways and no building:part at all (Albuquerque has 14 and none).
  const massing = resolveMassing(buildings);

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
    // CW-51: the extract has always carried which city it is, and the model
    // was dropping it on the floor. The scene needs it to give each city the
    // pavement finish its own municipality actually specifies.
    name: typeof extract?.name === 'string' ? extract.name : null,
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
    plantings,
    picnicTables,
    wayfinding,
    attractions,
    // CW-77: mapped lamps, and the terrain the bake sampled. Both are
    // ADDITIVE - a v1 extract simply has neither, and every reader of them
    // has to cope with that.
    lamps,
    elevation: parseElevation(extract?.elevation),
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
      // CW-76: what resolveMassing did, so the census reads the builder's own
      // counters instead of re-deriving them beside it.
      canopyCount: massing.canopies,
      canopyCovered: massing.canopiesCovered,
      canopyBySource: massing.canopyBySource,
      podiumCount: massing.podiums,
      groundedVolumes: massing.grounded,
      groundedToZero: massing.groundedToZero,
      floatingMass: massing.floatingMass,
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
      // CW-55: what the rebake carries for CW-56/57 to render.
      plantingCount: plantings.length,
      plantingByKind: plantings.reduce((acc, p) => {
        acc[p.kind] = (acc[p.kind] ?? 0) + 1;
        return acc;
      }, {}),
      picnicTableCount: picnicTables.length,
      // CW-77: how many lamps the map actually gave us, and whose they are.
      lampNodeCount: lamps.length,
      lampNodesByOperator: lamps.reduce((acc, l) => {
        const k = l.operator ?? 'OpenStreetMap';
        acc[k] = (acc[k] ?? 0) + 1;
        return acc;
      }, {}),
      leafTypedTreeCount: trees.filter((t) => t.leafType).length,
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
    // CW-77: what ascii-city-extract@2 adds.
    //
    // `wikidata` is the stable identity a landmark registry can be keyed on
    // where a name cannot (CW-62: names are edited, translated and
    // disambiguated upstream). `layer` and `location` are how the map says a
    // building is below the street, which the bake now drops. `incline` is
    // OSM's own slope, kept for the 28 Seattle sidewalks that carry one even
    // though a DEM has to do the real work. `ele` is a spot height. Every one
    // of them is ADDITIVE: a v1 reader ignores what it does not know.
    'wikidata',
    'layer',
    'location',
    'incline',
    'ele',
    // CW-77 street lamps: how the luminaire is carried, where the map says.
    'lamp_mount',
    'support',
    'operator',
    'ref',
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
    // CW-55 (CW-Q55): what a tree IS, and where a planting is. genus and
    // species are near-absent in all four cities and are kept anyway, at no
    // measurable cost, so a later release never has to rebake to read them;
    // leaf_type is the one that is actually there (Seattle 56%, Burnaby 70%)
    // and is what CW-56 drives a species from. denotation says whether a tree
    // is an avenue tree or a landmark. man_made carries the planter.
    'genus',
    'species',
    'leaf_type',
    'denotation',
    'man_made',
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
    // CW-55 pays the gate lesson a FOURTH time: a planter way and a flowerbed
    // way carry none of the keys above and would die here with their tags
    // intact.
    if (
      !tags ||
      (!tags.building &&
        !tags.highway &&
        !tags['building:part'] &&
        !isGreenTags(tags) &&
        !isPlantingTags(tags))
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
    // CW-55, a FOURTH time: a planter node (man_made) and a picnic table
    // (leisure) have to be admitted here as well as kept above.
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
        !tags.attraction &&
        !tags.man_made &&
        !tags.leisure)
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
