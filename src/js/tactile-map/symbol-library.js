/**
 * The tactile map's symbols: the basic shapes drawn from published sources,
 * the University of Oregon's published set (symbol-sets/oregon-2012.js),
 * and a door for a set of your own.
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
import { MAP_CLASSES } from './map-classes.js';
import { OREGON_2012 } from './symbol-sets/oregon-2012.js';

/** The smallest a point symbol may be, across (BANA 2022, 3.4.3.11). */
export const SYMBOL_MIN_SIZE_MM = 6;
/** The thinnest part a symbol may have at 10 mm (a 0.4 mm nozzle's floor). */
export const SYMBOL_MIN_FEATURE_MM = 1.0;
/** The size the thickness check is made at. */
export const SYMBOL_CHECK_SIZE_MM = 10;

const DISC = 'M 0.5 0 A 0.5 0.5 0 1 1 0.5 1 A 0.5 0.5 0 1 1 0.5 0 Z';
/**
 * The destination cone's foot and height (mm): Touch Mapper's marker,
 * BUILDING_HEIGHT_MM 2.9 + 2 tall and half as wide in radius.
 */
export const DESTINATION_CONE_MM = 4.9;
/** A center dot 0.4 of the symbol across: 4 mm on a 10 mm symbol. */
const CENTER_DOT =
  'M 0.5 0.3 A 0.2 0.2 0 1 1 0.5 0.7 A 0.2 0.2 0 1 1 0.5 0.3 Z';

/**
 * The shipped set. Names are the words a key sheet and a screen reader use.
 */
export const BUILT_IN_SYMBOLS = [
  {
    key: 'stairs',
    name: 'Stairs',
    pathData:
      'M 0.958 0.703 L 0.972 0.698 L 0.983 0.689 L 0.992 0.677 L 0.997 0.664 L 0.999 0.65 L 0.997 0.636 L 0.992 0.623 L 0.844 0.323 L 0.835 0.311 L 0.824 0.302 L 0.81 0.297 L 0.796 0.295 L 0.782 0.297 L 0.768 0.302 L 0.757 0.311 L 0.748 0.323 L 0.648 0.526 L 0.548 0.323 L 0.539 0.311 L 0.527 0.302 L 0.514 0.297 L 0.5 0.295 L 0.486 0.297 L 0.472 0.302 L 0.461 0.311 L 0.452 0.323 L 0.352 0.526 L 0.252 0.323 L 0.243 0.311 L 0.231 0.302 L 0.218 0.297 L 0.204 0.295 L 0.19 0.297 L 0.176 0.302 L 0.165 0.311 L 0.156 0.323 L 0.008 0.623 L 0.003 0.636 L 0.001 0.65 L 0.003 0.664 L 0.008 0.677 L 0.017 0.689 L 0.029 0.698 L 0.042 0.703 L 0.056 0.705 L 0.07 0.703 L 0.084 0.698 L 0.095 0.689 L 0.104 0.677 L 0.204 0.474 L 0.304 0.677 L 0.313 0.689 L 0.325 0.698 L 0.338 0.703 L 0.352 0.705 L 0.366 0.703 L 0.38 0.698 L 0.391 0.689 L 0.4 0.677 L 0.5 0.474 L 0.6 0.677 L 0.609 0.689 L 0.621 0.698 L 0.634 0.703 L 0.648 0.705 L 0.662 0.703 L 0.675 0.698 L 0.687 0.689 L 0.696 0.677 L 0.796 0.474 L 0.896 0.677 L 0.905 0.689 L 0.916 0.698 L 0.93 0.703 L 0.944 0.705 Z',
    minSizeMm: SYMBOL_MIN_SIZE_MM,
    source:
      'A zigzag, a row of sharp turns, from my tactile key for the SeaTac station, scaled to 10 mm with its line at 1.1 mm',
  },
  {
    key: 'elevator-up',
    name: 'Elevator up',
    pathData:
      'M 0.5 0.067 L 0 0.933 L 1 0.933 Z M 0.208 0.813 L 0.5 0.307 L 0.792 0.813 Z',
    minSizeMm: SYMBOL_MIN_SIZE_MM,
    source:
      'An outlined triangle, point up, from my SeaTac key; Nolan and Morris 1971: an outline is told from a solid',
  },
  {
    key: 'elevator-down',
    name: 'Elevator down',
    pathData:
      'M 1 0.067 L 0 0.067 L 0.5 0.933 Z M 0.208 0.187 L 0.792 0.187 L 0.5 0.693 Z',
    minSizeMm: SYMBOL_MIN_SIZE_MM,
    source:
      'An outlined triangle, point down, from my SeaTac key; turned over, so up and down differ by which way the point goes',
  },
  {
    key: 'entrance',
    name: 'Entrance',
    pathData:
      'M 0.956 0.998 L 0.97 0.992 L 0.982 0.982 L 0.992 0.97 L 0.998 0.956 L 1 0.94 L 1 0.06 L 0.998 0.044 L 0.992 0.03 L 0.982 0.018 L 0.97 0.008 L 0.956 0.002 L 0.94 0 L 0.06 0 L 0.044 0.002 L 0.03 0.008 L 0.018 0.018 L 0.008 0.03 L 0.002 0.044 L 0 0.06 L 0 0.94 L 0.002 0.956 L 0.008 0.97 L 0.018 0.982 L 0.03 0.992 L 0.044 0.998 L 0.06 1 L 0.076 0.998 L 0.09 0.992 L 0.102 0.982 L 0.112 0.97 L 0.118 0.956 L 0.12 0.94 L 0.12 0.12 L 0.88 0.12 L 0.88 0.94 L 0.882 0.956 L 0.888 0.97 L 0.898 0.982 L 0.91 0.992 L 0.924 0.998 L 0.94 1 Z',
    minSizeMm: SYMBOL_MIN_SIZE_MM,
    source:
      'A door frame: three sides, open toward the way in; Nolan and Morris 1971: an open form is told from a closed one',
  },
  {
    key: 'crossing',
    name: 'Crossing',
    pathData:
      'M 0.918 0.968 L 0.935 0.961 L 0.949 0.949 L 0.961 0.935 L 0.968 0.918 L 0.97 0.9 L 0.968 0.882 L 0.961 0.865 L 0.949 0.851 L 0.599 0.5 L 0.949 0.149 L 0.961 0.135 L 0.968 0.118 L 0.97 0.1 L 0.968 0.082 L 0.961 0.065 L 0.949 0.051 L 0.935 0.039 L 0.918 0.032 L 0.9 0.03 L 0.882 0.032 L 0.865 0.039 L 0.851 0.051 L 0.5 0.401 L 0.149 0.051 L 0.135 0.039 L 0.118 0.032 L 0.1 0.03 L 0.082 0.032 L 0.065 0.039 L 0.051 0.051 L 0.039 0.065 L 0.032 0.082 L 0.03 0.1 L 0.032 0.118 L 0.039 0.135 L 0.051 0.149 L 0.401 0.5 L 0.051 0.851 L 0.039 0.865 L 0.032 0.882 L 0.03 0.9 L 0.032 0.918 L 0.039 0.935 L 0.051 0.949 L 0.065 0.961 L 0.082 0.968 L 0.1 0.97 L 0.118 0.968 L 0.135 0.961 L 0.149 0.949 L 0.5 0.599 L 0.851 0.949 L 0.865 0.961 L 0.882 0.968 L 0.9 0.97 Z',
    minSizeMm: SYMBOL_MIN_SIZE_MM,
    source:
      'An X: two crossed lines, four free ends; Wabinski, Moscicka and Touya 2022 list a cross among the shapes that read well',
  },
  {
    key: 'landmark',
    name: 'Landmark',
    pathData: 'M 1 0.5 L 0.5 0 L 0 0.5 L 0.5 1 Z',
    minSizeMm: SYMBOL_MIN_SIZE_MM,
    source:
      'A solid diamond: four corners and no hollow, so it is not mistaken for the round You are here; BANA 2022 3.4.3.11 (6 mm or more, 3 mm apart)',
  },
  {
    key: 'furniture',
    name: 'Street furniture',
    pathData:
      'M 0.223 0.678 L 0.247 0.674 L 0.269 0.666 L 0.29 0.656 L 0.31 0.643 L 0.327 0.627 L 0.343 0.61 L 0.356 0.59 L 0.366 0.569 L 0.374 0.547 L 0.378 0.523 L 0.38 0.5 L 0.378 0.477 L 0.374 0.453 L 0.366 0.431 L 0.356 0.41 L 0.343 0.39 L 0.327 0.373 L 0.31 0.357 L 0.29 0.344 L 0.269 0.334 L 0.247 0.326 L 0.223 0.322 L 0.2 0.32 L 0.177 0.322 L 0.153 0.326 L 0.131 0.334 L 0.11 0.344 L 0.09 0.357 L 0.073 0.373 L 0.057 0.39 L 0.044 0.41 L 0.034 0.431 L 0.026 0.453 L 0.022 0.477 L 0.02 0.5 L 0.022 0.523 L 0.026 0.547 L 0.034 0.569 L 0.044 0.59 L 0.057 0.61 L 0.073 0.627 L 0.09 0.643 L 0.11 0.656 L 0.131 0.666 L 0.153 0.674 L 0.177 0.678 L 0.2 0.68 Z M 0.823 0.678 L 0.847 0.674 L 0.869 0.666 L 0.89 0.656 L 0.91 0.643 L 0.927 0.627 L 0.943 0.61 L 0.956 0.59 L 0.966 0.569 L 0.974 0.547 L 0.978 0.523 L 0.98 0.5 L 0.978 0.477 L 0.974 0.453 L 0.966 0.431 L 0.956 0.41 L 0.943 0.39 L 0.927 0.373 L 0.91 0.357 L 0.89 0.344 L 0.869 0.334 L 0.847 0.326 L 0.823 0.322 L 0.8 0.32 L 0.777 0.322 L 0.753 0.326 L 0.731 0.334 L 0.71 0.344 L 0.69 0.357 L 0.673 0.373 L 0.657 0.39 L 0.644 0.41 L 0.634 0.431 L 0.626 0.453 L 0.622 0.477 L 0.62 0.5 L 0.622 0.523 L 0.626 0.547 L 0.634 0.569 L 0.644 0.59 L 0.657 0.61 L 0.673 0.627 L 0.69 0.643 L 0.71 0.656 L 0.731 0.666 L 0.753 0.674 L 0.777 0.678 L 0.8 0.68 Z',
    minSizeMm: SYMBOL_MIN_SIZE_MM,
    source:
      'Two dots with a gap, an interrupted form; each dot 3.6 mm, over the 2 mm the NSW guidelines keep clear of braille',
  },
  {
    key: 'curb-ramp',
    name: 'Curb ramp',
    pathData:
      'M 0.97 0.05 L 0.77 0.05 L 0.77 0.95 L 0.97 0.95 Z M 0.6 0.35 L 0.4 0.35 L 0.4 0.95 L 0.6 0.95 Z M 0.23 0.65 L 0.03 0.65 L 0.03 0.95 L 0.23 0.95 Z',
    minSizeMm: SYMBOL_MIN_SIZE_MM,
    source:
      'Three rising bars: a row of blocks that climbs, the way the ramp does; an interrupted form',
  },
  {
    key: 'raised-curb',
    name: 'Raised curb',
    pathData:
      'M 1 0.17 L 0.998 0.154 L 0.992 0.14 L 0.982 0.128 L 0.97 0.118 L 0.956 0.112 L 0.94 0.11 L 0.924 0.112 L 0.91 0.118 L 0.898 0.128 L 0.888 0.14 L 0.882 0.154 L 0.88 0.17 L 0.88 0.75 L 0.56 0.75 L 0.56 0.17 L 0.558 0.154 L 0.552 0.14 L 0.542 0.128 L 0.53 0.118 L 0.516 0.112 L 0.5 0.11 L 0.484 0.112 L 0.47 0.118 L 0.458 0.128 L 0.448 0.14 L 0.442 0.154 L 0.44 0.17 L 0.44 0.75 L 0.12 0.75 L 0.12 0.17 L 0.118 0.154 L 0.112 0.14 L 0.102 0.128 L 0.09 0.118 L 0.076 0.112 L 0.06 0.11 L 0.044 0.112 L 0.03 0.118 L 0.018 0.128 L 0.008 0.14 L 0.002 0.154 L 0 0.17 L 0 0.89 L 1 0.89 Z',
    minSizeMm: SYMBOL_MIN_SIZE_MM,
    source: 'A comb: a bar with three teeth, an edge a wheel cannot take',
  },
  {
    key: 'you-are-here',
    name: 'You are here',
    pathData: DISC,
    // The part that stands one symbol step higher than every other symbol
    // (the levels file's here group), so the reader's place is the highest
    // mark on the map and no disc feels like it.
    raisedPathData: CENTER_DOT,
    minSizeMm: SYMBOL_MIN_SIZE_MM,
    source:
      'BANA 2022 8.5.6 (the most prominent symbol, first in the key); ISO 19028 6.5.1 (the present location higher than the other marks), via Wabinski, Moscicka and Touya 2024: a disc with a 4 mm center dot one symbol step higher',
  },
  {
    key: 'destination-cone',
    name: 'Destination cone',
    // The footprint; the model raises the cone itself (solid), 4.9 mm tall
    // with a flat top 0.6 mm across, from the plate's underside.
    pathData: DISC,
    minSizeMm: DESTINATION_CONE_MM,
    solid: 'cone',
    source:
      "Touch Mapper's address marker (skarkkai/touch-mapper, converter/tactile_constants.py and obj-to-tactile.py, AGPL-3.0): a 16-sided cone 4.9 mm tall and 4.9 mm across, its top cut flat at an eighth of the radius so it prints",
  },
  {
    key: 'transit-stop',
    name: 'Transit stop',
    pathData:
      'M 1 0 L 0 0 L 0 1 L 1 1 Z M 0.11 0.11 L 0.89 0.11 L 0.89 0.89 L 0.11 0.89 Z M 0.555 0.365 L 0.73 0.365 L 0.73 0.255 L 0.27 0.255 L 0.27 0.365 L 0.445 0.365 L 0.445 0.76 L 0.555 0.76 Z',
    minSizeMm: SYMBOL_MIN_SIZE_MM,
    source:
      'An outlined square holding a T, a frame with a letter inside, from the ticket machine on my SeaTac key',
  },
  {
    key: 'chevron-uphill',
    name: 'Uphill chevron',
    pathData:
      'M 0.074 0.933 L 0.088 0.928 L 0.099 0.919 L 0.108 0.907 L 0.368 0.527 L 0.373 0.514 L 0.375 0.5 L 0.373 0.486 L 0.368 0.472 L 0.108 0.092 L 0.099 0.081 L 0.088 0.072 L 0.074 0.067 L 0.06 0.065 L 0.046 0.067 L 0.033 0.072 L 0.021 0.081 L 0.012 0.092 L 0.007 0.106 L 0.005 0.12 L 0.007 0.134 L 0.012 0.148 L 0.254 0.5 L 0.012 0.853 L 0.007 0.866 L 0.005 0.88 L 0.007 0.894 L 0.012 0.907 L 0.021 0.919 L 0.033 0.928 L 0.046 0.933 L 0.06 0.935 Z M 0.384 0.933 L 0.398 0.928 L 0.409 0.919 L 0.418 0.907 L 0.678 0.527 L 0.683 0.514 L 0.685 0.5 L 0.683 0.486 L 0.678 0.472 L 0.418 0.092 L 0.409 0.081 L 0.398 0.072 L 0.384 0.067 L 0.37 0.065 L 0.356 0.067 L 0.343 0.072 L 0.331 0.081 L 0.322 0.092 L 0.317 0.106 L 0.315 0.12 L 0.317 0.134 L 0.322 0.148 L 0.564 0.5 L 0.322 0.853 L 0.317 0.866 L 0.315 0.88 L 0.317 0.894 L 0.322 0.907 L 0.331 0.919 L 0.343 0.928 L 0.356 0.933 L 0.37 0.935 Z M 0.694 0.933 L 0.708 0.928 L 0.719 0.919 L 0.728 0.907 L 0.988 0.527 L 0.993 0.514 L 0.995 0.5 L 0.993 0.486 L 0.988 0.472 L 0.728 0.092 L 0.719 0.081 L 0.708 0.072 L 0.694 0.067 L 0.68 0.065 L 0.666 0.067 L 0.653 0.072 L 0.641 0.081 L 0.632 0.092 L 0.627 0.106 L 0.625 0.12 L 0.627 0.134 L 0.632 0.148 L 0.874 0.5 L 0.632 0.853 L 0.627 0.866 L 0.625 0.88 L 0.627 0.894 L 0.632 0.907 L 0.641 0.919 L 0.653 0.928 L 0.666 0.933 L 0.68 0.935 Z',
    minSizeMm: SYMBOL_MIN_SIZE_MM,
    source:
      'Three chevrons pointing uphill, from the escalator on my SeaTac key, scaled to 10 mm with the line at 1.1 mm; drawn along a Steep sidewalk',
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
    const symbol = {
      key: entry.key,
      name,
      pathData: entry.pathData,
      minSizeMm,
      source,
    };
    if (entry.raisedPathData !== undefined) {
      if (
        typeof entry.raisedPathData !== 'string' ||
        !ringsFromPathData(entry.raisedPathData).length
      ) {
        refuse(`${name} has no shape in its raisedPathData.`);
      }
      if (
        thinnestFeatureMm(entry.raisedPathData, SYMBOL_CHECK_SIZE_MM) <
        SYMBOL_MIN_FEATURE_MM
      ) {
        throw new Error(
          `Symbol ${name} has a raised part thinner than ${SYMBOL_MIN_FEATURE_MM.toFixed(1)} mm, which a 0.4 mm nozzle cannot print.`
        );
      }
      symbol.raisedPathData = entry.raisedPathData;
    }
    symbols.push(symbol);
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

/**
 * The built-in sets, the basic shapes first. A set names the symbol each map
 * class takes (`classSymbols`, by the class's key; null keeps the basic
 * shape) and the size its symbols were published at.
 */
export const BUILT_IN_SETS = [
  {
    key: 'forge-basic',
    name: 'Forge basic shapes',
    symbolSizeMm: 10,
    symbols: BUILT_IN_SYMBOLS,
  },
  OREGON_2012,
];

/**
 * A set's symbols as the library the levels builder reads: every basic
 * shape, with the set's own shape put under the key each class it covers
 * asks for. Two classes asking for one key share the set's shape.
 *
 * @param {string} setKey
 * @returns {Array<object>}
 */
export function librarySymbolsFor(setKey) {
  const set = BUILT_IN_SETS.find((s) => s.key === setKey);
  if (!set || set.symbols === BUILT_IN_SYMBOLS) return BUILT_IN_SYMBOLS;
  const byKey = new Map(BUILT_IN_SYMBOLS.map((s) => [s.key, s]));
  for (const [cls, symbolKey] of Object.entries(set.classSymbols || {})) {
    const shape = symbolKey && set.symbols.find((s) => s.key === symbolKey);
    if (!shape) continue;
    const key = MAP_CLASSES.find((c) => c.key === cls)?.symbolKey;
    if (!key) continue;
    byKey.set(key, {
      key,
      name: shape.name,
      pathData: shape.pathData,
      minSizeMm: shape.minSizeMm,
      source: shape.source,
    });
  }
  return [...byKey.values()];
}

let loaded = null;
let setKey = 'forge-basic';
let setSymbols = BUILT_IN_SYMBOLS;

/** The key of the built-in set in use. */
export function activeSetKey() {
  return setKey;
}

/** The set in use, by key and name: a loaded file's, or the built-in set's. */
export function activeSet() {
  if (loaded) return { key: 'file', name: 'Your own set' };
  const set = BUILT_IN_SETS.find((s) => s.key === setKey);
  return { key: set.key, name: set.name };
}

/**
 * Put a built-in set in use by its key; an unknown key changes nothing.
 *
 * @param {string} key
 */
export function setActiveSet(key) {
  if (!BUILT_IN_SETS.some((s) => s.key === key)) return;
  setKey = key;
  setSymbols = librarySymbolsFor(key);
}

/** The symbols in use: a loaded file's, or the built-in set's. */
export function activeLibrary() {
  return loaded || setSymbols;
}

/**
 * Put a loaded set in use, whole, or go back to the built-in set with null.
 *
 * @param {Array<object>|null} symbols
 */
export function setLibrary(symbols) {
  loaded = Array.isArray(symbols) && symbols.length ? symbols : null;
}
