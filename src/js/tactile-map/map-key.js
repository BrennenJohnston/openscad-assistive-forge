/**
 * The map key, listed from the plan: what a reader needs before the map
 * (BANA 2022 8.5.9: the key "shown before the map", explaining every
 * texture and tactile symbol; ISO 19028 4.2.4: every tactile mark
 * explained).
 *
 * The entries: every symbol, line and area the map draws, You are here
 * first and the rest in order of importance, each at its printed size (ISO
 * 19028 6.4.2 and 6.4.3). Classes that draw the same shape share an entry,
 * since a finger cannot tell them apart. Then every named thing by its
 * number (map-numbers.js), marks first and codes after them (ISO 19028
 * 6.4.2), numbers last (BANA 2022 5.7.1).
 *
 * No DOM here: a worker may import this file.
 *
 * @license GPL-3.0-or-later
 */
import { MAP_CLASSES } from './map-classes.js';
import { featureNames } from './feature-names.js';
import { numberedThings } from './map-numbers.js';
import {
  activeLibrary,
  activeSet,
  BUILT_IN_SYMBOLS,
} from './symbol-library.js';
import { BUILTIN_SYMBOLS, DEFAULT_SETTINGS, symbolMap } from './levels-svg.js';

/**
 * The most braille cells a name takes on tape beside a point's symbol: 12.7
 * mm tape beside a 10 mm symbol, about 40 mm of it, at about 6.2 mm a cell.
 * A longer name's point carries only its number.
 */
export const LABEL_CELLS = 6;

/** Point classes, most important first; the destination, then You are here, lead the key. */
const POINT_ORDER = [
  'destination',
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
  'destination-cone': (mm) =>
    `a cone ${mm} mm across and ${mm} mm tall, flat at the top`,
  'you-are-here': (mm) =>
    `a disc ${mm} mm across with a center dot one step higher`,
  stairs: (mm) => `a zigzag, ${mm} mm`,
  'elevator-up': (mm) => `an outlined triangle pointing up, ${mm} mm`,
  'elevator-down': (mm) => `an outlined triangle pointing down, ${mm} mm`,
  entrance: (mm) => `a door frame, ${mm} mm, open toward the way in`,
  crossing: (mm) => `an X, ${mm} mm`,
  landmark: (mm) => `a solid diamond, ${mm} mm`,
  furniture: (mm) => `two dots, ${mm} mm`,
  'curb-ramp': (mm) => `three rising bars, ${mm} mm`,
  'raised-curb': (mm) => `a comb, ${mm} mm`,
  circle: (mm) => `a disc ${mm} mm across`,
  'transit-stop': (mm) => `an outlined square with a T, ${mm} mm`,
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

/** The key row of a crossing drawn dashed, one with no marking. A11Y. */
const UNMARKED_CROSSING = 'Crossing, unmarked';
/** Added to the Crossing row where a traffic island is on. A11Y. */
const ISLAND_NOTE = ', plain where it crosses a traffic island';

/** Said when a loaded set draws two kinds alike. A11Y. */
const sharedShapeNote = (names) =>
  `${names.join(' and ')} share one shape in this set; the key lists them together.`;

/** A level's height in a word: the floor, the symbols, the walls. */
const LEVEL_WORDS = Object.freeze({ 1: 'low', 2: 'middle', 3: 'high' });

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

/**
 * The key of a plan: its entries and its numbered things.
 *
 * @param {object} plan
 * @param {object} [settings] - the levels builder's (symbols, size)
 * @returns {{ entries: Array<object>, numbers: Array<{number: number, featureId: string, name: string}> }}
 */
export function keyFor(plan, settings = {}) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const classes = s.classes || {};
  const symbols = symbolMap(s.symbols || activeLibrary());
  const basicShapes = symbolMap(BUILT_IN_SYMBOLS);
  const otherSet = Object.values(symbols).some(
    (x) => basicShapes[x.key] && basicShapes[x.key].pathData !== x.pathData
  );
  const all = plan?.features || [];
  const on = all.filter((f) => f.on !== false);
  const className = (key) =>
    MAP_CLASSES.find((c) => c.key === key)?.name || key;
  const rank = (order, key) => {
    const i = order.indexOf(key);
    return i < 0 ? order.length : i;
  };

  // Points: one row per symbol. Two classes share a row only when a loaded
  // set draws them with one shape.
  const bySymbol = new Map();
  const shapeOf = (key) =>
    symbols[key] || symbols.circle || BUILTIN_SYMBOLS.circle;
  for (const f of on.filter((x) => x.kind === 'point')) {
    const key = f.symbol ?? classes[f.class]?.symbol ?? 'circle';
    const entry = bySymbol.get(key) || {
      kind: 'point',
      symbolKey: key,
      classes: [],
      sizeMm: 0,
    };
    if (!entry.classes.includes(f.class)) entry.classes.push(f.class);
    entry.sizeMm = Math.max(entry.sizeMm, f.size ?? s.symbolSizeMm);
    // The destination's row carries the address it marks.
    if (f.class === 'destination' && f.name) entry.address = f.name;
    bySymbol.set(key, entry);
  }
  const points = [...bySymbol.values()].map((e) => {
    e.classes.sort((a, b) => rank(POINT_ORDER, a) - rank(POINT_ORDER, b));
    const shape = shapeOf(e.symbolKey);
    // The basic shape in words; a set's or a file's shape by its own name.
    const basic =
      SHAPE_WORDS[e.symbolKey] &&
      shape?.pathData === basicShapes[e.symbolKey]?.pathData;
    // A built-in set with no shape for a class keeps the basic one, and says so.
    const borrowed = basic && otherSet && !shape?.solid;
    return {
      ...e,
      name:
        e.classes[0] === 'destination' && e.address
          ? `Destination, ${e.address}`
          : e.classes.map(className).join(' or '),
      raised: typeof shape?.raisedPathData === 'string',
      shape: basic
        ? `${SHAPE_WORDS[e.symbolKey](say(e.sizeMm))}${borrowed ? ', basic shape' : ''}`
        : `${shape?.name || e.symbolKey}, ${say(e.sizeMm)} mm`,
    };
  });
  points.sort(
    (a, b) => rank(POINT_ORDER, a.classes[0]) - rank(POINT_ORDER, b.classes[0])
  );

  // Lines: one entry per class and style. A traffic island is the plain
  // stretch of a crossing: no row of its own while a crossing row says so.
  const byLine = new Map();
  const onLines = on.filter((x) => x.kind === 'line');
  const island = onLines.some((x) => x.class === 'traffic-island');
  const crossingRow = onLines.some((x) => x.class === 'crossing');
  for (const f of onLines) {
    if (f.class === 'traffic-island' && crossingRow) continue;
    const cls = classes[f.class] || {};
    const style = f.style ?? cls.style ?? 'solid';
    const widthMm = f.width ?? cls.width ?? 1.5;
    const level = f.level ?? cls.level ?? 1;
    const key = `${f.class}|${style}|${widthMm}|${level}`;
    if (!byLine.has(key)) {
      const unmarked = f.class === 'crossing' && style === 'dashed';
      const pause =
        f.class === 'crossing' && island && style !== 'dashed'
          ? ISLAND_NOTE
          : '';
      byLine.set(key, {
        kind: 'line',
        classes: [f.class],
        name: unmarked ? UNMARKED_CROSSING : className(f.class),
        style,
        widthMm,
        level,
        shape: `${(LINE_WORDS[style] || LINE_WORDS.solid)(say(widthMm))}, ${LEVEL_WORDS[level] || 'low'}${pause}`,
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

  // The named things, in number order.
  const names = featureNames(all);
  const saidById = new Map(all.map((f, i) => [f.id, names[i]]));
  const numbers = numberedThings(plan).map((f, i) => ({
    number: i + 1,
    featureId: f.id,
    name: saidById.get(f.id),
  }));

  return {
    entries: [...points, ...lines, ...areas],
    numbers,
    notes: points
      .filter((e) => e.classes.length > 1)
      .map((e) => sharedShapeNote(e.classes.map(className))),
    set: activeSet(),
  };
}

/**
 * The key as text, for the README in the plate zip.
 *
 * @param {{ entries: Array<object>, numbers: Array<object> }} key
 * @returns {string}
 */
export function keyText(key) {
  const out = ['Key'];
  if (key.set?.name) out.push(`Symbols: ${key.set.name}.`);
  out.push('', 'Symbols, You are here first:');
  for (const e of key.entries) out.push(`- ${e.name}: ${e.shape}`);
  if (key.numbers.length) {
    out.push('', 'Numbered places on the map:');
    for (const n of key.numbers) out.push(`- ${n.number} ${n.name}`);
  }
  if (key.labels?.length) {
    out.push('', 'Labels to write on braille tape, each for its channel:');
    for (const l of key.labels) {
      // The translator's braille, its cells and the channel's length when
      // the tape was measured (tape-cells.js); the text alone otherwise.
      const detail = l.braille
        ? ` (${l.braille}, ${l.cells} ${l.cells === 1 ? 'cell' : 'cells'}${l.lengthMm ? `, ${l.lengthMm} mm` : ''})`
        : '';
      out.push(`- ${l.text}${detail}: ${l.inside ? 'in' : 'beside'} ${l.name}`);
    }
  }
  return out.join('\n') + '\n';
}

/**
 * The key in one sentence, for the status line.
 *
 * @param {{ entries: Array<object>, numbers: Array<object> }} key
 * @returns {string}
 */
export function keySentence(key) {
  const n = key.entries.length;
  const m = key.numbers.length;
  return `The key has ${n} ${n === 1 ? 'symbol' : 'symbols'} and ${m} numbered ${m === 1 ? 'place' : 'places'}.`;
}
