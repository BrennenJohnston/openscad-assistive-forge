/**
 * The map key, listed from the plan: what a reader needs before the map
 * (BANA 2022 8.5.9: the key "shown before the map", explaining every
 * texture and tactile symbol; ISO 19028 4.2.4: every tactile mark
 * explained).
 *
 * The entries: every symbol, line and area the map draws, You are here
 * first and the rest in order of importance, each at its printed size (ISO
 * 19028 6.4.2 and 6.4.3). Classes that draw the same shape share an entry,
 * since a finger cannot tell them apart. Then the 2-cell keys of the named
 * places whose names do not fit a label beside their symbol, in
 * alphabetical order (BANA 2022 8.5.10; ISO 19028 6.4.2), each made by
 * BANA 2022 5.8.1's rules: suggestive of the place, its first letter the
 * place's own, one of its two letters with dot 3 or dot 6, never aa, ac, cc
 * or ca, and never a pair braille writes as a shortform BANA does not allow
 * or as one contracted cell.
 *
 * No DOM here: a worker may import this file.
 *
 * @license GPL-3.0-or-later
 */
import { MAP_CLASSES } from './map-classes.js';
import { featureNames } from './feature-names.js';
import {
  activeLibrary,
  activeSet,
  BUILT_IN_SYMBOLS,
} from './symbol-library.js';
import {
  BUILTIN_SYMBOLS,
  DEFAULT_SETTINGS,
  symbolMap,
  symbolRings,
} from './levels-svg.js';
import { regionArea } from '../ring-geometry.js';

/**
 * The braille cells a label channel holds: 12.7 mm tape beside a 10 mm
 * symbol, about 40 mm of it, at about 6.2 mm a cell.
 */
export const LABEL_CELLS = 6;

/** Point classes, most important first; You are here leads the key. */
const POINT_ORDER = [
  'you-are-here',
  'entrance',
  'stairs',
  'elevator-up',
  'elevator-down',
  'crossing',
  'transit-stop',
  'landmark',
  'furniture',
  'curb-ramp',
  'raised-curb',
];
const LINE_ORDER = [
  'walkway',
  'crossing',
  'route',
  'steep',
  'traffic-island',
  'curb',
  'track',
  'wall',
];
const AREA_ORDER = ['area'];

/** How a built-in symbol feels, in words; a loaded set's name otherwise. */
const SHAPE_WORDS = Object.freeze({
  'you-are-here': (mm) =>
    `a disc ${mm} mm across with a center dot one step higher`,
  stairs: (mm) => `three bars, ${mm} mm`,
  'elevator-up': (mm) => `a triangle pointing up, ${mm} mm`,
  'elevator-down': (mm) => `a triangle pointing down, ${mm} mm`,
  entrance: (mm) => `a half disc ${mm} mm across, flat side to the way in`,
  'landmark-circle': (mm) => `a disc ${mm} mm across`,
  circle: (mm) => `a disc ${mm} mm across`,
  'landmark-square': (mm) => `a square, ${mm} mm`,
  'landmark-triangle': (mm) => `a triangle, ${mm} mm`,
  'transit-stop': (mm) => `a square with a notch, ${mm} mm`,
});

const LINE_WORDS = Object.freeze({
  solid: (w) => `a solid line ${w} mm wide`,
  dotted: (w) => `a dotted line ${w} mm wide`,
  dashed: (w) => `a dashed line ${w} mm wide`,
  double: (w) => `a double line, each ${w} mm wide`,
  ticks: (w) => `a line ${w} mm wide with short cross-ticks`,
  chevrons: (w) => `a line ${w} mm wide with chevrons pointing uphill`,
});

const say = (n) => String(Math.round(n * 10) / 10);

/** A level's height in a word: the floor, the symbols, the walls. */
const LEVEL_WORDS = Object.freeze({ 1: 'low', 2: 'middle', 3: 'high' });

/**
 * What a finger meets of a shape at 10 mm, as a short signature: its area,
 * its box and where its weight sits (so a triangle pointing up and one
 * pointing down differ), and whether part of it stands higher. Two symbols
 * with one signature print alike, whatever their keys.
 */
function feel(shape) {
  const rings = symbolRings(shape, 10, [0, 0]);
  const pts = rings.flat();
  if (!pts.length) return 'none';
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const r = (v) => Math.round(v * 2) / 2;
  const mean = (v) => v.reduce((a, b) => a + b, 0) / v.length;
  return [
    Math.round(regionArea(rings)),
    r(Math.max(...xs) - Math.min(...xs)),
    r(Math.max(...ys) - Math.min(...ys)),
    r(mean(xs)),
    r(mean(ys)),
    typeof shape.raisedPathData === 'string' ? 'raised' : 'flat',
  ].join('|');
}

/**
 * The cells a label takes in uncontracted braille, as an estimate: one a
 * letter, digit, space or mark, one more for each capitalized word and each
 * run of digits.
 *
 * @param {string} text
 * @returns {number}
 */
export function labelCells(text) {
  const s = String(text || '').trim();
  if (!s) return 0;
  const capitals = (s.match(/\b[A-Z]/g) || []).length;
  const numbers = (s.match(/\d+/g) || []).length;
  return s.length + capitals + numbers;
}

/** Letters with dot 3 or dot 6 in braille: k to z (w is 2-4-5-6). */
const LOWER_ROW = /[k-z]/;
/**
 * Pairs never used as a key: the four BANA 5.8.1.2 names; the 2-cell UEB
 * shortforms BANA 5.8.1.5 does not allow; and the pairs contracted braille
 * writes as one cell (groupsigns), which would make a 1-cell key.
 */
const BARRED = new Set([
  'aa',
  'ac',
  'cc',
  'ca',
  'ab',
  'af',
  'ag',
  'cd',
  'ei',
  'gd',
  'gt',
  'ch',
  'gh',
  'sh',
  'th',
  'wh',
  'ed',
  'er',
  'ou',
  'ow',
  'st',
  'ar',
  'ea',
  'bb',
  'ff',
  'gg',
  'be',
  'en',
  'in',
]);
/** Words a key never starts from. */
const MINOR = new Set([
  'of',
  'the',
  'and',
  'at',
  'on',
  'in',
  'for',
  'a',
  'an',
  'to',
  'de',
]);

const usable = (pair, taken) =>
  /^[a-z]{2}$/.test(pair) &&
  LOWER_ROW.test(pair) &&
  !BARRED.has(pair) &&
  !taken.has(pair);

/**
 * A 2-cell key for a place's name, by BANA 2022 5.8.1: the first letter of
 * its first word, then the first letter of each later word, then the later
 * letters of those words, then of the first word, then any letter; the
 * first pair that has a letter with dot 3 or dot 6, is not barred and is
 * not taken. The key is added to `taken`.
 *
 * @param {string} name
 * @param {Set<string>} taken
 * @returns {string|null}
 */
export function keyLetters(name, taken) {
  const words = String(name || '')
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);
  const main = words.filter((w) => !MINOR.has(w));
  const list = main.length ? main : words;
  if (!list.length) return null;
  const first = list[0][0];
  const seconds = [
    ...list.slice(1).map((w) => w[0]),
    ...list.slice(1).flatMap((w) => [...w.slice(1)]),
    ...list[0].slice(1),
    ...'abcdefghijklmnopqrstuvwxyz',
  ];
  for (const second of seconds) {
    const pair = first + second;
    if (usable(pair, taken)) {
      taken.add(pair);
      return pair;
    }
  }
  return null;
}

/**
 * The named places on a plan that are on, in order of importance: by
 * class (POINT_ORDER), then nearer the address first. The key's letters
 * and the labels on the map are given in this order, so the most
 * important places get the most suggestive keys and the first room.
 *
 * @param {object} plan
 * @returns {object[]}
 */
export function namedPoints(plan) {
  const center = [plan.size.w / 2, plan.size.h / 2];
  const near = (f) => Math.hypot(f.at[0] - center[0], f.at[1] - center[1]);
  const rank = (key) => {
    const i = POINT_ORDER.indexOf(key);
    return i < 0 ? POINT_ORDER.length : i;
  };
  return (plan.features || [])
    .filter(
      (f) =>
        f.on !== false &&
        f.kind === 'point' &&
        f.class !== 'you-are-here' &&
        f.name
    )
    .sort((a, b) => rank(a.class) - rank(b.class) || near(a) - near(b));
}

/**
 * The key of a plan: its entries and its abbreviations.
 *
 * @param {object} plan
 * @param {object} [settings] - the levels builder's (symbols, size)
 * @param {{ needsKey?: Set<string> }} [options] - places keyed although
 *   their names fit a label (a label with no room on the map)
 * @returns {{ entries: Array<object>, abbreviations: Array<{key: string, featureId: string, name: string}> }}
 */
export function keyFor(plan, settings = {}, { needsKey = new Set() } = {}) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const classes = s.classes || {};
  const symbols = symbolMap(s.symbols || activeLibrary());
  const basicShapes = symbolMap(BUILT_IN_SYMBOLS);
  const all = plan?.features || [];
  const on = all.filter((f) => f.on !== false);
  const className = (key) =>
    MAP_CLASSES.find((c) => c.key === key)?.name || key;
  const rank = (order, key) => {
    const i = order.indexOf(key);
    return i < 0 ? order.length : i;
  };

  // Points: one entry per shape as printed, its classes named together.
  const bySymbol = new Map();
  const shapeOf = (key) =>
    symbols[key] || symbols.circle || BUILTIN_SYMBOLS.circle;
  for (const f of on.filter((x) => x.kind === 'point')) {
    const key = f.symbol ?? classes[f.class]?.symbol ?? 'circle';
    const sig = feel(shapeOf(key));
    const entry = bySymbol.get(sig) || {
      kind: 'point',
      symbolKey: key,
      classes: [],
      sizeMm: 0,
    };
    if (!entry.classes.includes(f.class)) entry.classes.push(f.class);
    entry.sizeMm = Math.max(entry.sizeMm, f.size ?? s.symbolSizeMm);
    bySymbol.set(sig, entry);
  }
  const points = [...bySymbol.values()].map((e) => {
    e.classes.sort((a, b) => rank(POINT_ORDER, a) - rank(POINT_ORDER, b));
    const shape = shapeOf(e.symbolKey);
    // The basic shape in words; a set's or a file's shape by its own name.
    const basic =
      SHAPE_WORDS[e.symbolKey] &&
      shape?.pathData === basicShapes[e.symbolKey]?.pathData;
    return {
      ...e,
      name: e.classes.map(className).join(' or '),
      raised: typeof shape?.raisedPathData === 'string',
      shape: basic
        ? SHAPE_WORDS[e.symbolKey](say(e.sizeMm))
        : `${shape?.name || e.symbolKey}, ${say(e.sizeMm)} mm`,
    };
  });
  points.sort(
    (a, b) => rank(POINT_ORDER, a.classes[0]) - rank(POINT_ORDER, b.classes[0])
  );

  // Lines: one entry per class and style.
  const byLine = new Map();
  for (const f of on.filter((x) => x.kind === 'line')) {
    const cls = classes[f.class] || {};
    const style = f.style ?? cls.style ?? 'solid';
    const widthMm = f.width ?? cls.width ?? 1.5;
    const level = f.level ?? cls.level ?? 1;
    const key = `${f.class}|${style}|${widthMm}|${level}`;
    if (!byLine.has(key)) {
      byLine.set(key, {
        kind: 'line',
        classes: [f.class],
        name: className(f.class),
        style,
        widthMm,
        level,
        shape: `${(LINE_WORDS[style] || LINE_WORDS.solid)(say(widthMm))}, ${LEVEL_WORDS[level] || 'low'}`,
      });
    }
  }
  const lines = [...byLine.values()];
  lines.sort(
    (a, b) => rank(LINE_ORDER, a.classes[0]) - rank(LINE_ORDER, b.classes[0])
  );

  const areaClasses = [
    ...new Set(on.filter((x) => x.kind === 'area').map((f) => f.class)),
  ]
    .filter((c) => c !== 'text')
    .sort((a, b) => rank(AREA_ORDER, a) - rank(AREA_ORDER, b));
  const areas = areaClasses.map((c) => ({
    kind: 'area',
    classes: [c],
    name: className(c),
    shape: `a raised area, ${LEVEL_WORDS[classes[c]?.level] || 'low'}`,
  }));

  // Abbreviations: the named places whose names do not fit a label (or
  // whose label found no room), in order of importance.
  const names = featureNames(all);
  const saidById = new Map(all.map((f, i) => [f.id, names[i]]));
  const named = namedPoints(plan).filter(
    (f) => labelCells(f.name) > LABEL_CELLS || needsKey.has(f.id)
  );
  const taken = new Set();
  const abbreviations = [];
  for (const f of named) {
    const key = keyLetters(f.name, taken);
    if (key) {
      abbreviations.push({ key, featureId: f.id, name: saidById.get(f.id) });
    }
  }
  abbreviations.sort((a, b) => a.key.localeCompare(b.key));

  return {
    entries: [...points, ...lines, ...areas],
    abbreviations,
    set: activeSet(),
  };
}

/**
 * The key as text, for the README in the plate zip.
 *
 * @param {{ entries: Array<object>, abbreviations: Array<object> }} key
 * @returns {string}
 */
export function keyText(key) {
  const out = ['Key'];
  if (key.set?.name) out.push(`Symbols: ${key.set.name}.`);
  out.push('', 'Symbols, You are here first:');
  for (const e of key.entries) out.push(`- ${e.name}: ${e.shape}`);
  if (key.abbreviations.length) {
    out.push('', 'Abbreviations on the map, alphabetically:');
    for (const a of key.abbreviations) out.push(`- ${a.key}: ${a.name}`);
  }
  if (key.labels?.length) {
    out.push('', 'Labels to write on braille tape, each for its channel:');
    for (const l of key.labels) out.push(`- ${l.text}: beside ${l.name}`);
  }
  return out.join('\n') + '\n';
}

/**
 * The key in one sentence, for the status line.
 *
 * @param {{ entries: Array<object>, abbreviations: Array<object> }} key
 * @returns {string}
 */
export function keySentence(key) {
  const n = key.entries.length;
  const m = key.abbreviations.length;
  return `The key has ${n} ${n === 1 ? 'symbol' : 'symbols'} and ${m} ${m === 1 ? 'abbreviation' : 'abbreviations'}.`;
}
