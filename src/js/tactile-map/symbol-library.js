/**
 * The tactile map's symbols: nine shapes drawn from published sources, and
 * a door for a set of your own.
 *
 * Each symbol is filled path data in a unit box (0 to 1, x right, y down)
 * with no strokes, so it prints as a solid raised shape at any size. The
 * levels builder scales it to the symbol size and centers it on the point.
 * The sizes follow the tactile graphics guidelines: a point symbol is 6 mm
 * or more across and 3 mm from anything else (BANA 2022, 3.4.3.11), and no
 * part of it is thinner than 1.0 mm at 10 mm, which is what a 0.4 mm nozzle
 * lays down reliably.
 *
 * A set loaded from a file replaces the built-in set whole, never merged,
 * so a map reads one way. The door refuses a file that is not a list of
 * symbols, a symbol smaller than 6 mm at its smallest size, and a symbol
 * with a part thinner than 1.0 mm at 10 mm, each with a sentence that says
 * which.
 *
 * No DOM here: a worker may import this file; the door reads a File or
 * anything with a text() method.
 *
 * @license GPL-3.0-or-later
 */

import { ringsFromPathData, evenOddUnion, areaOf } from '../ring-geometry.js';
import {
  rasterizeRings,
  PRINT_CELL_MM,
  MAX_CELLS,
} from '../shape-thickness.js';
import { lineWidthPercentiles } from '../ink-extraction.js';

/** The smallest a point symbol may be, across (BANA 2022, 3.4.3.11). */
export const SYMBOL_MIN_SIZE_MM = 6;
/** The thinnest part a symbol may have at 10 mm (a 0.4 mm nozzle's floor). */
export const SYMBOL_MIN_FEATURE_MM = 1.0;
/** The size the thickness check is made at. */
export const SYMBOL_CHECK_SIZE_MM = 10;

const S3 = Math.sqrt(3);
const DISC = 'M 0.5 0 A 0.5 0.5 0 1 1 0.5 1 A 0.5 0.5 0 1 1 0.5 0 Z';

/**
 * The shipped set. Names are the words a key sheet and a screen reader use.
 */
export const BUILT_IN_SYMBOLS = [
  {
    key: 'stairs',
    name: 'Stairs',
    pathData:
      'M 0 0.08 H 1 V 0.24 H 0 Z M 0 0.42 H 1 V 0.58 H 0 Z M 0 0.76 H 1 V 0.92 H 0 Z',
    minSizeMm: SYMBOL_MIN_SIZE_MM,
    source:
      'McCallum, Ungar and Jehoel 2006, British Journal of Visual Impairment 24(2): stair symbols as parallel bars; BANA 2022 Unit 3, line styles',
  },
  {
    key: 'elevator-up',
    name: 'Elevator up',
    pathData: 'M 0.5 0.05 L 1 0.95 H 0 Z',
    minSizeMm: SYMBOL_MIN_SIZE_MM,
    source:
      'BANA 2022 3.4.3.7 (arrowhead proportions); McCallum, Ungar and Jehoel 2006 (simple arrows read best)',
  },
  {
    key: 'elevator-down',
    name: 'Elevator down',
    pathData: 'M 0 0.05 H 1 L 0.5 0.95 Z',
    minSizeMm: SYMBOL_MIN_SIZE_MM,
    source:
      'BANA 2022 3.4.3.7 (arrowhead proportions); McCallum, Ungar and Jehoel 2006 (simple arrows read best); the up arrow turned over',
  },
  {
    key: 'entrance',
    name: 'Entrance',
    pathData: 'M 0 0.75 A 0.5 0.5 0 0 1 1 0.75 Z',
    minSizeMm: SYMBOL_MIN_SIZE_MM,
    source:
      'ISO 19028, as reviewed by Wabinski, Moscicka and Touya 2024: a semicircle shows a direction, here the way in',
  },
  {
    key: 'landmark-circle',
    name: 'Landmark, circle',
    pathData: DISC,
    minSizeMm: SYMBOL_MIN_SIZE_MM,
    source:
      'BANA 2022 3.4.3.11 (point symbols 6 mm or more, 3 mm apart); Jehoel, Ungar, McCallum and Rowell 2009 (a circle is identified at 5.5 mm)',
  },
  {
    key: 'landmark-square',
    name: 'Landmark, square',
    pathData: 'M 0.05 0.05 H 0.95 V 0.95 H 0.05 Z',
    minSizeMm: SYMBOL_MIN_SIZE_MM,
    source:
      'BANA 2022 3.4.3.11; Jehoel, Ungar, McCallum and Rowell 2009 (a square is identified at 5.0 mm)',
  },
  {
    key: 'landmark-triangle',
    name: 'Landmark, triangle',
    pathData: `M 0.5 ${0.5 - S3 / 4} L 1 ${0.5 + S3 / 4} H 0 Z`,
    minSizeMm: SYMBOL_MIN_SIZE_MM,
    source:
      'BANA 2022 3.4.3.11; Jehoel, Ungar, McCallum and Rowell 2009 (a triangle is identified at 6.4 mm); Gual, Puyuelo and Lloveras 2012 (pyramids and prisms recognized best)',
  },
  {
    key: 'you-are-here',
    name: 'You are here',
    pathData: `${DISC} M 0.35 0.35 H 0.65 V 0.65 H 0.35 Z`,
    minSizeMm: SYMBOL_MIN_SIZE_MM,
    source:
      'BANA 2022 8.5.6 (the most prominent symbol, first in the key); ISO 19028 via Wabinski, Moscicka and Touya 2024',
  },
  {
    key: 'transit-stop',
    name: 'Transit stop',
    pathData: 'M 0.05 0.05 H 0.35 V 0.5 H 0.65 V 0.05 H 0.95 V 0.95 H 0.05 Z',
    minSizeMm: SYMBOL_MIN_SIZE_MM,
    source:
      'BANA 2022 8.5.4 (landmarks) and 8.6.5 (a shape used twice differs by 25 to 30 percent): a square with a notch',
  },
  {
    key: 'chevron-uphill',
    name: 'Uphill chevron',
    pathData:
      'M 0.1 0.9 L 0.5 0.1 L 0.9 0.9 L 0.72 0.9 L 0.5 0.42 L 0.28 0.9 Z',
    minSizeMm: SYMBOL_MIN_SIZE_MM,
    source:
      'Ungar 2005 (arrows read by their point); OpenSidewalks incline as rise over run; drawn along a Steep sidewalk line every 10 mm, 6 mm across (BANA 2022 3.4.3.3 dash figures)',
  },
];

/** A number for a sentence: one decimal at most, no trailing zero. */
const say = (n) => String(Math.round(n * 10) / 10);

function boundsOf(rings) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const ring of rings) {
    for (const p of ring) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  return { minX, minY, maxX, maxY };
}

/** Is a point inside a ring (even-odd ray test)? */
function pointInRing(pt, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (
      a.y > pt.y !== b.y > pt.y &&
      pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
  }
  return inside;
}

/** The ridge width (p50) of one region's rings, in the rings' units. */
function ridgeOf(rings) {
  const { minX, minY, maxX, maxY } = boundsOf(rings);
  const long = Math.max(maxX - minX, maxY - minY);
  if (!(long > 0)) return 0;
  const cell = Math.max(PRINT_CELL_MM, long / MAX_CELLS);
  const width = Math.ceil((maxX - minX) / cell) + 2;
  const height = Math.ceil((maxY - minY) / cell) + 2;
  const scaled = rings.map((ring) =>
    ring.map((p) => ({
      x: (p.x - minX) / cell + 1,
      y: (p.y - minY) / cell + 1,
    }))
  );
  return (
    lineWidthPercentiles(rasterizeRings(scaled, width, height), width, height)
      .p50 * cell
  );
}

/**
 * The thinnest part of a symbol when it prints at sizeMm, in mm.
 *
 * Each solid part of the shape (a positive ring with the holes inside it) is
 * measured on its own with the ridge of shape-thickness.js, and the thinnest
 * part is the answer. The ridge's median is the part's width: on a solid
 * square it is the square, on a bar the bar. The tenth percentile was tried
 * first and read 0.98 mm on a solid 10 mm square, from the corner pixels of
 * the distance transform, so it is not used. A thin spur fused to a fat body
 * is not seen by this measure; the printed sheet is.
 *
 * @param {string} pathData - The symbol in its unit box
 * @param {number} sizeMm - The printed size of the box
 * @returns {number} 0 when the shape is empty
 */
export function thinnestFeatureMm(pathData, sizeMm) {
  const unit = evenOddUnion(ringsFromPathData(pathData));
  if (!unit.length || !(sizeMm > 0)) return 0;
  const rings = unit.map((ring) =>
    ring.map((p) => ({ x: p.x * sizeMm, y: p.y * sizeMm }))
  );
  const solids = rings.filter((r) => areaOf(r) > 0);
  const holes = rings.filter((r) => areaOf(r) < 0);
  let thinnest = Infinity;
  for (const solid of solids) {
    const own = holes.filter((h) => pointInRing(h[0], solid));
    thinnest = Math.min(thinnest, ridgeOf([solid, ...own]));
  }
  return Number.isFinite(thinnest) ? thinnest : 0;
}

/**
 * Check a parsed symbol list and return it in the library's shape, or throw
 * with the sentence that says what is wrong.
 *
 * @param {unknown} data - The parsed JSON
 * @param {string} fileName - For the sentences
 * @returns {{ symbols: Array<object>, warnings: string[] }}
 */
export function validateSymbolLibrary(data, fileName = 'the file') {
  const refuse = (reason) => {
    throw new Error(`${fileName} is not a symbol library: ${reason}`);
  };
  if (!Array.isArray(data)) refuse('it is not a list of symbols.');
  if (data.length === 0) refuse('the list is empty.');
  const symbols = [];
  const warnings = [];
  const seen = new Set();
  data.forEach((entry, i) => {
    if (
      !entry ||
      typeof entry !== 'object' ||
      typeof entry.key !== 'string' ||
      entry.key === '' ||
      typeof entry.pathData !== 'string'
    ) {
      refuse(`entry ${i + 1} has no key and pathData.`);
    }
    if (seen.has(entry.key)) refuse(`the key ${entry.key} appears twice.`);
    seen.add(entry.key);
    const name =
      typeof entry.name === 'string' && entry.name ? entry.name : entry.key;
    const minSizeMm =
      typeof entry.minSizeMm === 'number' && entry.minSizeMm > 0
        ? entry.minSizeMm
        : SYMBOL_MIN_SIZE_MM;
    const source = typeof entry.source === 'string' ? entry.source : '';
    const rings = ringsFromPathData(entry.pathData);
    if (!rings.length) refuse(`${name} has no shape in its pathData.`);
    const b = boundsOf(rings);
    const smallest = Math.min(b.maxX - b.minX, b.maxY - b.minY) * minSizeMm;
    if (smallest < SYMBOL_MIN_SIZE_MM) {
      throw new Error(
        `Symbol ${name} is ${say(smallest)} mm at its smallest size; a symbol must be at least ${SYMBOL_MIN_SIZE_MM} mm.`
      );
    }
    if (
      thinnestFeatureMm(entry.pathData, SYMBOL_CHECK_SIZE_MM) <
      SYMBOL_MIN_FEATURE_MM
    ) {
      throw new Error(
        `Symbol ${name} has a part thinner than ${SYMBOL_MIN_FEATURE_MM.toFixed(1)} mm, which a 0.4 mm nozzle cannot print.`
      );
    }
    if (!source)
      warnings.push(
        `Symbol ${name} has no source; say where its shape comes from.`
      );
    symbols.push({
      key: entry.key,
      name,
      pathData: entry.pathData,
      minSizeMm,
      source,
    });
  });
  return { symbols, warnings };
}

/**
 * Read a symbol library from a file the person chose: a JSON list of
 * { key, name, pathData, minSizeMm, source }.
 *
 * @param {{ name?: string, text: () => Promise<string> }} file
 * @returns {Promise<{ symbols: Array<object>, warnings: string[] }>}
 */
export async function loadSymbolLibraryFile(file) {
  const fileName = (file && file.name) || 'the file';
  const text = await file.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `${fileName} is not a symbol library: it is not valid JSON.`
    );
  }
  return validateSymbolLibrary(data, fileName);
}

let loaded = null;

/** The set in use: a loaded one, or the built-in nine. */
export function activeLibrary() {
  return loaded || BUILT_IN_SYMBOLS;
}

/**
 * Put a loaded set in use, whole, or restore the built-in set with null.
 *
 * @param {Array<object>|null} symbols
 */
export function setLibrary(symbols) {
  loaded = Array.isArray(symbols) && symbols.length ? symbols : null;
}
