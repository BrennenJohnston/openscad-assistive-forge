/**
 * Detail levels: what a map shows, chosen as a whole tier instead of one
 * feature at a time.
 *
 * Each map type offers four tiers from the research on what a tactile map
 * carries: ISO 19028 4.2.1 (only what the purpose needs), Holloway,
 * Marriott, Butler and Reinders 2019 (the map's features ranked with its
 * readers: the way and the main building first, then food, stops and
 * toilets, the rest left out) and BANA 2022 8.5.4 (too much information
 * makes a map too busy). Under a tier, one switch per group of features:
 * the sidewalks, the crossings, the entrances, the buildings, the named
 * places, the transit stops, the street furniture, the curbs. The draft
 * builder marks what each switch reads (plan-from-osm.js: `way` on the
 * sidewalks near the address and the crossings they meet, `address` on the
 * address's own door, `twin` on a stop's second point, `roomy` on a curb
 * with room, `street` on a street drawn as one line, `what` on every
 * point, building and park).
 *
 * The scale's rules still hold (scales.js): over a few blocks or a
 * neighborhood a point class the scale leaves out stays out, and so do
 * the buildings, whatever the tier; only "Everything" shows all.
 *
 * The count of different symbols on the map is kept within what a reader
 * can learn: a warning past 10 and a refusal past 15 (Wabinski, Moscicka
 * and Touya 2022, after Rowell and Ungar 2003).
 *
 * No DOM here: a worker may import this file.
 *
 * @license GPL-3.0-or-later
 */

export const SYMBOLS_WARN = 10;
export const SYMBOLS_MAX = 15;
/** A building this close to the way, in meters, stands along it. */
export const ALONG_M = 10;

/** The switches and the choices each takes, in the order they are offered. */
export const SWITCHES = Object.freeze({
  sidewalks: ['way', 'all'],
  crossings: ['way', 'all'],
  entrances: ['address', 'all'],
  buildings: ['none', 'along', 'named', 'all'],
  landmarks: ['none', 'named', 'all'],
  transit: ['off', 'on'],
  furniture: ['off', 'on'],
  curbs: ['off', 'on'],
});

const FULL = Object.freeze({
  sidewalks: 'all',
  crossings: 'all',
  entrances: 'all',
  buildings: 'all',
  landmarks: 'all',
  transit: 'on',
  furniture: 'on',
  curbs: 'on',
  everything: true,
});

const WAY = Object.freeze({
  sidewalks: 'way',
  crossings: 'way',
  entrances: 'address',
  buildings: 'none',
  landmarks: 'none',
  transit: 'off',
  furniture: 'off',
  curbs: 'on',
});

const PLACE_SWITCHES = [
  WAY,
  { ...WAY, buildings: 'along', landmarks: 'named', transit: 'on' },
  {
    ...WAY,
    sidewalks: 'all',
    crossings: 'all',
    entrances: 'all',
    buildings: 'all',
    landmarks: 'named',
    transit: 'on',
  },
  FULL,
];

// A route decides its own sidewalks, crossings and doors, and keeps its
// buildings to its two ends until a tier names more (plan-from-route.js).
const ROUTE_SWITCHES = [
  WAY,
  { ...WAY, landmarks: 'named', transit: 'on' },
  { ...WAY, buildings: 'along', landmarks: 'named', transit: 'on' },
  FULL,
];

const KEYS = ['way', 'named', 'buildings', 'everything'];

const tiers = (names, sentences, switches) =>
  KEYS.map((key, i) => ({
    key,
    name: names[i],
    sentence: sentences[i],
    switches: switches[i],
  }));

/** The tiers per map type; a map from a drawing has none. */
export const DETAIL_LEVELS = Object.freeze({
  place: tiers(
    [
      'The way and its doors',
      'Named places',
      'Every building',
      'Everything in the data',
    ],
    [
      'The sidewalks and crossings near the address, its door, the steps and You are here; nothing else.',
      'The way, the named places and transit stops the scale has room for, and the buildings along the way.',
      'Every sidewalk, crossing, building and entrance, and the named places.',
      'Every feature in the data, for you to turn off what a reader does not need.',
    ],
    PLACE_SWITCHES
  ),
  route: tiers(
    [
      'The route and its crossings',
      'Named places along it',
      'Every building along it',
      'Everything',
    ],
    [
      'The route, its crossings and steps, and its two ends; nothing else.',
      'The route, and the named places and transit stops along it.',
      'The route, the named places along it and every building beside it.',
      'Every feature in the data around the route.',
    ],
    ROUTE_SWITCHES
  ),
  drawing: [],
});

/**
 * The switches of a tier, as a new object.
 *
 * @param {'place'|'route'|'drawing'} type
 * @param {string} key - the tier's key
 * @returns {Record<string, string|boolean>}
 */
export function switchesFor(type, key) {
  const level = (DETAIL_LEVELS[type] || []).find((l) => l.key === key);
  return level ? { ...level.switches } : {};
}

function toSegment(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t =
    len2 === 0
      ? 0
      : Math.max(
          0,
          Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)
        );
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

/** Whether a ring comes within `reach` mm of any of the lines. */
function nearLines(ring, lines, reach) {
  for (const pts of lines) {
    for (let i = 1; i < pts.length; i += 1) {
      for (const p of ring) {
        if (toSegment(p, pts[i - 1], pts[i]) <= reach) return true;
      }
    }
    for (const p of pts) {
      for (let i = 0; i < ring.length; i += 1) {
        if (toSegment(p, ring[i], ring[(i + 1) % ring.length]) <= reach) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Whether a tier's switches want a point of a named-place group (a
 * landmark, a transit stop, street furniture), the scale aside.
 *
 * @param {object} f - a feature
 * @param {Record<string, string|boolean>} sw - the switches
 * @returns {boolean}
 */
export function wantsPoint(f, sw) {
  if (sw.everything) return true;
  if (f.class === 'landmark') {
    return sw.landmarks === 'all' || (sw.landmarks === 'named' && !!f.name);
  }
  if (f.class === 'transit-stop') return sw.transit === 'on' && !f.twin;
  if (f.class === 'furniture') return sw.furniture === 'on';
  return false;
}

/**
 * Whether a tier's switches want a building or a park: along the way is
 * within `reach` mm of one of the lines.
 *
 * @param {object} f - an area feature
 * @param {Record<string, string|boolean>} sw - the switches
 * @param {number[][][]} lines - the way's lines, in mm
 * @param {number} reach - in mm
 * @returns {boolean}
 */
export function wantsArea(f, sw, lines, reach) {
  if (sw.everything) return true;
  if (f.what === 'Park') return sw.buildings === 'all';
  if (sw.buildings === 'all') return true;
  if (sw.buildings === 'named') return !!f.name;
  if (sw.buildings === 'along') {
    return Array.isArray(f.ring) && nearLines(f.ring, lines, reach);
  }
  return false;
}

/** The switch a reader may lower first, said in a refusal. */
function lowerFirst(switches) {
  const ways = [];
  if (switches.furniture === 'on') ways.push('Turn Street furniture off');
  if (switches.landmarks && switches.landmarks !== 'none') {
    ways.push(
      ways.length ? 'choose fewer landmarks' : 'Choose fewer landmarks'
    );
  }
  if (!ways.length) ways.push('Choose a level with less');
  return `${ways.join(' or ')}.`;
}

/**
 * The features with `on` set by a tier's switches, the count on, the
 * different symbols, and a warning or a refusal about them.
 *
 * @param {object[]} features - a draft's features
 * @param {object} options
 * @param {'place'|'route'} options.type
 * @param {Record<string, string|boolean>} options.switches
 * @param {{rules: object}|null} options.scale
 * @param {{w: number, h: number}} options.size
 * @param {number} options.mmPerM
 * @returns {{ features: object[], on: number, symbols: number, warning: string|null, refusal: string|null }}
 */
export function applyDetail(features, { switches, scale, mmPerM }) {
  const sw = switches || {};
  const rules = scale?.rules || null;
  const generalized = Array.isArray(rules?.landmarks);
  const fits = (cls) => !generalized || rules.landmarks.includes(cls);
  const lines = features
    .filter((f) => f.way && f.kind === 'line' && Array.isArray(f.points))
    .map((f) => f.points);
  const reach = ALONG_M * (mmPerM || 1);

  const decide = (f) => {
    // You are here is the reader's own place, placed by them in the editor:
    // no tier turns it on or off.
    if (f.class === 'you-are-here') return f.on !== false;
    if (sw.everything) return true;
    switch (f.class) {
      case 'destination':
        return true;
      case 'walkway':
        return sw.sidewalks === 'all' || !!f.way;
      case 'crossing':
      case 'traffic-island':
        // A crossing point is a symbol, and a symbol keeps to the scale.
        if (f.kind === 'point' && !fits('crossing')) return false;
        return sw.crossings === 'all' || !!f.way;
      case 'stairs':
        return (sw.sidewalks === 'all' || !!f.way) && fits('stairs');
      case 'entrance':
        return !!f.address || (sw.entrances === 'all' && fits('entrance'));
      case 'area':
        return !generalized && wantsArea(f, sw, lines, reach);
      case 'landmark':
      case 'transit-stop':
      case 'furniture':
        return fits(f.class) && wantsPoint(f, sw);
      case 'curb-ramp':
      case 'raised-curb':
        return sw.curbs === 'on' && !!f.roomy;
      case 'curb':
        return !!f.street;
      default:
        // A route, a steep run, words, channels: not the levels' to switch.
        return f.class === 'route' ||
          f.class === 'steep' ||
          f.kind === 'text' ||
          f.kind === 'channel'
          ? f.on !== false
          : false;
    }
  };

  const out = features.map((f) => ({ ...f, on: decide(f) }));
  return { features: out, ...judgeSymbols(out, sw) };
}

/**
 * The count on, the different symbols on (the classes, without channels
 * and words), and a warning or a refusal about them.
 *
 * @param {object[]} features
 * @param {Record<string, string|boolean>} switches
 * @returns {{ on: number, symbols: number, warning: string|null, refusal: string|null }}
 */
export function judgeSymbols(features, switches) {
  const on = features.filter((f) => f.on);
  const symbols = new Set(
    on
      .filter((f) => f.kind !== 'channel' && f.kind !== 'text')
      .map((f) => f.class)
  ).size;
  const warning =
    symbols > SYMBOLS_WARN && symbols <= SYMBOLS_MAX
      ? `${symbols} different symbols: more than ${SYMBOLS_WARN} is hard to remember.`
      : null;
  const refusal =
    symbols > SYMBOLS_MAX
      ? `${symbols} different symbols: more than ${SYMBOLS_MAX} cannot be told apart. ${lowerFirst(switches || {})}`
      : null;
  return { on: on.length, symbols, warning, refusal };
}
