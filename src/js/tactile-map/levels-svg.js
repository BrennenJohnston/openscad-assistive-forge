/**
 * The levels builder: a map plan in, the levels file out.
 *
 * The levels file is one SVG in millimeters with a group per height,
 * <g id="level1"> to <g id="level3">, <g id="here"> (the part of a symbol
 * that stands one symbol step above the symbol level: You are here's center
 * dot), <g id="channels"> (the label tape's recesses) and
 * <g id="cutouts"> (what is cut right through the plate: a plate's name as
 * notches, added by the plate splitter, and the channels when the settings
 * cut them through) and <g id="leads"> (the lines from a thing to its number
 * in the margin), which the Tactile Map tile imports
 * one group at a time by id; every group is written, empty or not, since a
 * missing id is a warning. One more group, <g id="letters">, holds the box
 * the raised title will take, for the checks only: the model draws the
 * letters itself with text().
 *
 * Lines are stroked here, not by offsetRing: that function offsets a CLOSED
 * ring, so an open polyline handed to it comes back as a filled loop (a
 * straight line has too few edges and returns null; an L becomes a
 * triangle with a band around it; tests/unit/tactile-map-levels.test.js
 * keeps the proof). A stroke is built instead from one rectangle per
 * segment and one disc per vertex, united under NonZero (even-odd would cut
 * holes where the pieces overlap). Every level is then the NonZero union of
 * its features, so the order of the plan never changes the picture.
 *
 * Alongside the file come warnings in plain sentences, each naming the
 * feature it is about, for the limits the tactile map guidelines give: 15
 * symbols, 4 textures, 3 mm between symbols, 3 mm around a label channel,
 * 2.2 mm as the widest single line, two hand spans by one, three levels,
 * 6 mm as the smallest symbol.
 *
 * No DOM here: a worker may import this file.
 *
 * @license GPL-3.0-or-later
 */

import {
  areaOf,
  union,
  evenOddUnion,
  ringsFromPathData,
  ringsToPathData,
} from '../ring-geometry.js';
import {
  BUILT_IN_SETS,
  activeLibrary,
  librarySymbolsFor,
} from './symbol-library.js';
import { levelsByClass, mapClass } from './map-classes.js';
import { featureNames, placeFinder } from './feature-names.js';

/** How lines are stroked (the plan allowed offsetRing first; see above). */
export const STROKE_METHOD = 'segments-and-discs';

const DISC_SEGMENTS = 24;

/** The line styles the widest-single-line check leaves alone. */
const NOT_SINGLE_LINES = new Set(['double', 'bars', 'beads']);

/**
 * A symbol is a shape in a unit box (0 to 1, y down), scaled to the symbol
 * size and centered on the point. An entry carries `ring` ([[u, v], ...]) or
 * `pathData` (the symbol library's form; several subpaths make several
 * rings, and a hole stays a hole).
 *
 * Until the symbol library ships, two placeholder shapes stand under the
 * library's keys: a disc that fills the box, and an equilateral triangle
 * with its side the box width, so a 10 mm triangle has an area of 43.3
 * square millimeters.
 */
const DISC_SHAPE = {
  ring: Array.from({ length: DISC_SEGMENTS }, (_, i) => {
    const a = (2 * Math.PI * i) / DISC_SEGMENTS;
    return [0.5 + 0.5 * Math.cos(a), 0.5 + 0.5 * Math.sin(a)];
  }),
};
const TRIANGLE_SHAPE = {
  ring: [
    [0.5, 0.5 - Math.sqrt(3) / 4],
    [1, 0.5 + Math.sqrt(3) / 4],
    [0, 0.5 + Math.sqrt(3) / 4],
  ],
};

export const BUILTIN_SYMBOLS = {
  circle: DISC_SHAPE,
  triangle: TRIANGLE_SHAPE,
  stairs: TRIANGLE_SHAPE,
  'elevator-up': TRIANGLE_SHAPE,
  'elevator-down': TRIANGLE_SHAPE,
  entrance: DISC_SHAPE,
  'landmark-circle': DISC_SHAPE,
  'landmark-square': DISC_SHAPE,
  'landmark-triangle': TRIANGLE_SHAPE,
  'you-are-here': DISC_SHAPE,
  'destination-cone': DISC_SHAPE,
  'transit-stop': DISC_SHAPE,
};

/**
 * The builder's settings for a built-in symbol set: its symbols, the size
 * they were published at, and its line styles, if it has any, on the
 * classes that draw with them. The basic shapes need none: the defaults
 * are theirs.
 *
 * @param {string} setKey
 * @returns {object}
 */
export function settingsForSet(setKey) {
  const set = BUILT_IN_SETS.find((x) => x.key === setKey);
  if (!set || set.key === BUILT_IN_SETS[0].key) return {};
  const classes = { ...LEVELS_BY_CLASS };
  for (const line of set.lineStyles || []) {
    if (!line.class || !classes[line.class]) continue;
    const row = { ...classes[line.class], style: line.style };
    if (line.widthMm !== undefined) row.width = line.widthMm;
    if (line.dashMm !== undefined) row.dashMm = line.dashMm;
    if (line.dashGapMm !== undefined) row.dashGapMm = line.dashGapMm;
    if (line.gapMm !== undefined) row.gapMm = line.gapMm;
    classes[line.class] = row;
  }
  return {
    classes,
    symbols: librarySymbolsFor(setKey),
    symbolSizeMm: set.symbolSizeMm,
  };
}

/**
 * Symbols as a map by key, whether they came as a map or as the library's
 * array of { key, ... }.
 */
export function symbolMap(symbols) {
  if (Array.isArray(symbols)) {
    const map = {};
    for (const s of symbols) if (s && s.key) map[s.key] = s;
    return map;
  }
  return symbols || {};
}

/** A shape's rings in the unit box, solids positive, holes negative. */
function shapeRings(shape) {
  if (Array.isArray(shape.ring)) return [positive(toPoints(shape.ring))];
  if (typeof shape.pathData === 'string') {
    return evenOddUnion(ringsFromPathData(shape.pathData));
  }
  return [];
}

/**
 * The class table: what each class is, on which level, how wide, in which
 * style, with which symbol. One copy, in map-classes.js, which the drawing
 * editor's class menu reads too; this is its shape for the builder.
 */
export const LEVELS_BY_CLASS = levelsByClass();

/**
 * The level a feature is raised to, as buildLevelRings raises it: its own,
 * else its class's, else 2 for a point and 1 for a line or an area.
 *
 * @param {object} f - a plan feature
 * @param {object} [classes] - the class table
 * @returns {number}
 */
export function featureLevel(f, classes = LEVELS_BY_CLASS) {
  const cls = classes[f.class] || {};
  return f.level ?? cls.level ?? (f.kind === 'point' ? 2 : 1);
}

/**
 * How a label channel is cut: a recess with a floor under the tape (the
 * model's depth), or right through the plate, for a map glued to a backing
 * board that the tape then lies on. The panel's "Tape channels" offers
 * these in this order.
 */
export const CHANNEL_CUTS = Object.freeze([
  { key: 'recess', name: 'A recess with a floor' },
  { key: 'through', name: 'Cut through, for a backing board' },
]);

export const DEFAULT_SETTINGS = {
  classes: LEVELS_BY_CLASS,
  // null means the symbol library in use (activeLibrary()).
  symbols: null,
  symbolSizeMm: 10,
  minGapMm: 3,
  tapeWidthMm: 12.7,
  channelClearanceMm: 0.4,
  channelKeepClearMm: 3,
  // true writes the channels into the cutouts group, cut right through.
  channelsThrough: false,
  dotSpacingMm: 3,
  dashMm: 6,
  dashGapMm: 3,
  doubleGapMm: 1.5,
  tickLengthMm: 6,
  tickSpacingMm: 6,
  // A Steep sidewalk's chevrons: one every 10 mm, 6 mm across, pointing
  // uphill (BANA 2022 3.4.3.3 keeps dashes between 6 and 10 mm).
  chevronPitchMm: 10,
  chevronAcrossMm: 6,
  // A Paid fare zone's bars, from my SeaTac key: 0.72 mm wide and 4.032 mm
  // across the band, one every 2.664 mm, at least 0.504 mm in from its ends.
  fareBarMm: 0.72,
  fareBarAcrossMm: 4.032,
  fareBarPitchMm: 2.664,
  fareBarEndMm: 0.504,
  // A Platform edge's beads, from my SeaTac key: 1.55 mm along, one every
  // 3.8435 mm, joined by necks 0.706 mm at their middle; a block 1.4 mm
  // across on each bead.
  beadMm: 1.55,
  beadPitchMm: 3.8435,
  beadNeckMm: 0.706,
  beadBlockAcrossMm: 1.4,
  maxSingleLineMm: 2.2,
  maxSymbols: 15,
  maxTextures: 4,
  maxLevels: 3,
  minSymbolMm: 6,
  maxWidthMm: 600,
  maxHeightMm: 450,
  // The title band, as the tile lays it out.
  titleCharHeightMm: 16,
  edgeClearanceMm: 9.525,
  northArrowColumnMm: 20,
  northLineMm: 2,
  northGapMm: 3,
  // Average advance of an uppercase Liberation Sans letter at the tile's
  // spacing, as a share of the capital height: an estimate for the box.
  letterAdvance: 0.85,
};

// ---------------------------------------------------------------------------
// Geometry in millimeters, y down
// ---------------------------------------------------------------------------

const pt = (x, y) => ({ x, y });

/** A ring wound the way clipper writes a solid: positive area. */
function positive(ring) {
  return areaOf(ring) < 0 ? [...ring].reverse() : ring;
}

/** A ring wound the way clipper writes a hole: negative area. */
function negative(ring) {
  return areaOf(ring) > 0 ? [...ring].reverse() : ring;
}

function discRing(cx, cy, r, n = DISC_SEGMENTS) {
  const ring = [];
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n;
    ring.push(pt(cx + r * Math.cos(a), cy + r * Math.sin(a)));
  }
  return positive(ring);
}

function rectRing(x0, y0, x1, y1) {
  return positive([pt(x0, y0), pt(x1, y0), pt(x1, y1), pt(x0, y1)]);
}

/** The rectangle of width w around the segment a to b. */
function segmentRing(a, b, w) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return null;
  const nx = (-dy / len) * (w / 2);
  const ny = (dx / len) * (w / 2);
  return positive([
    pt(a.x + nx, a.y + ny),
    pt(b.x + nx, b.y + ny),
    pt(b.x - nx, b.y - ny),
    pt(a.x - nx, a.y - ny),
  ]);
}

const toPoints = (pairs) => pairs.map(([x, y]) => pt(x, y));

function isClosed(points) {
  const a = points[0];
  const b = points[points.length - 1];
  return points.length > 2 && Math.hypot(a.x - b.x, a.y - b.y) < 1e-9;
}

/**
 * Stroke an open or closed polyline to a region of the given width.
 *
 * One rectangle per segment, one disc per vertex: round joins, and round
 * caps unless caps is 'butt'. United under NonZero.
 *
 * @param {Array<[number, number]>} pairs - Points in mm
 * @param {number} width - Stroke width in mm
 * @param {{ caps?: 'round' | 'butt' }} [options]
 * @returns {Array<Array<{x: number, y: number}>>} Rings, solids positive
 */
export function strokePolyline(pairs, width, options = {}) {
  const { caps = 'round' } = options;
  const points = toPoints(pairs);
  if (points.length < 2 || !(width > 0)) return [];
  const pieces = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const r = segmentRing(points[i], points[i + 1], width);
    if (r) pieces.push(r);
  }
  const closed = isClosed(points);
  const first = caps === 'round' || closed ? 0 : 1;
  const last =
    caps === 'round' || closed ? points.length - 1 : points.length - 2;
  for (let i = first; i <= last; i++) {
    pieces.push(discRing(points[i].x, points[i].y, width / 2));
  }
  return union(pieces);
}

/** Arc length of a polyline. */
function lengthOf(points) {
  let total = 0;
  for (let i = 0; i + 1 < points.length; i++) {
    total += Math.hypot(
      points[i + 1].x - points[i].x,
      points[i + 1].y - points[i].y
    );
  }
  return total;
}

/** The point and unit tangent at arc length s along a polyline. */
function along(points, s) {
  let walked = 0;
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i];
    const b = points[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-9) continue;
    if (s <= walked + len || i + 2 === points.length) {
      const t = Math.max(0, Math.min(1, (s - walked) / len));
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        tx: (b.x - a.x) / len,
        ty: (b.y - a.y) / len,
      };
    }
    walked += len;
  }
  const a = points[points.length - 1];
  return { x: a.x, y: a.y, tx: 1, ty: 0 };
}

/** The part of a polyline between arc lengths s0 and s1, as pairs. */
function subPolyline(points, s0, s1) {
  const out = [];
  const start = along(points, s0);
  out.push([start.x, start.y]);
  let walked = 0;
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i];
    const b = points[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const end = walked + len;
    if (end > s0 && end < s1) out.push([b.x, b.y]);
    walked = end;
    if (walked >= s1) break;
  }
  const stop = along(points, s1);
  out.push([stop.x, stop.y]);
  return out;
}

/** A polyline moved d millimeters along its own normal (miter joins). */
function offsetPolyline(points, d) {
  const n = points.length;
  const normals = [];
  for (let i = 0; i + 1 < n; i++) {
    const dx = points[i + 1].x - points[i].x;
    const dy = points[i + 1].y - points[i].y;
    const len = Math.hypot(dx, dy) || 1;
    normals.push({ x: -dy / len, y: dx / len });
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    const nPrev = normals[Math.max(0, i - 1)];
    const nNext = normals[Math.min(normals.length - 1, i)];
    let mx = nPrev.x + nNext.x;
    let my = nPrev.y + nNext.y;
    const mlen = Math.hypot(mx, my);
    if (mlen < 1e-9) {
      mx = nNext.x;
      my = nNext.y;
    } else {
      // The miter length grows as the corner sharpens; cap it at 2.5 widths.
      const cosHalf = Math.max(0.4, mlen / 2);
      mx = mx / mlen / cosHalf;
      my = my / mlen / cosHalf;
    }
    out.push([points[i].x + mx * d, points[i].y + my * d]);
  }
  return out;
}

function dottedLine(points, width, spacing) {
  const total = lengthOf(points);
  const discs = [];
  for (let s = 0; s <= total + 1e-9; s += spacing) {
    const p = along(points, Math.min(s, total));
    discs.push(discRing(p.x, p.y, width / 2));
  }
  return union(discs);
}

function dashedLine(points, width, dash, gap) {
  const total = lengthOf(points);
  const pieces = [];
  for (let s = 0; s < total; s += dash + gap) {
    const sub = subPolyline(points, s, Math.min(s + dash, total));
    pieces.push(...strokePolyline(sub, width, { caps: 'butt' }));
  }
  return union(pieces);
}

function tickedLine(points, width, tickLength, spacing) {
  const total = lengthOf(points);
  const ticks = [];
  for (let s = 0; s <= total + 1e-9; s += spacing) {
    const p = along(points, Math.min(s, total));
    const nx = -p.ty;
    const ny = p.tx;
    const hl = tickLength / 2;
    const hw = width / 2;
    ticks.push(
      positive([
        pt(p.x + nx * hl + p.tx * hw, p.y + ny * hl + p.ty * hw),
        pt(p.x + nx * hl - p.tx * hw, p.y + ny * hl - p.ty * hw),
        pt(p.x - nx * hl - p.tx * hw, p.y - ny * hl - p.ty * hw),
        pt(p.x - nx * hl + p.tx * hw, p.y - ny * hl + p.ty * hw),
      ])
    );
  }
  return union(ticks);
}

/**
 * A line with a chevron every `pitch` mm, `across` mm wide, each pointing
 * to the uphill end (`uphill` 'end' or 'start'): the line at its width
 * plus two arms per chevron, stroked at the same width, under one union.
 * Exported for the levels test.
 */
export function chevronsLine(pairs, width, pitch, across, uphill = 'end') {
  const points = toPoints(pairs);
  const total = lengthOf(points);
  const dir = uphill === 'start' ? -1 : 1;
  const half = across / 2;
  const pieces = [...strokePolyline(pairs, width)];
  for (let s = pitch / 2; s < total; s += pitch) {
    const p = along(points, s);
    const nx = -p.ty;
    const ny = p.tx;
    const apex = [p.x + p.tx * dir * half, p.y + p.ty * dir * half];
    const back = [p.x - p.tx * dir * half, p.y - p.ty * dir * half];
    const left = [back[0] + nx * half, back[1] + ny * half];
    const right = [back[0] - nx * half, back[1] - ny * half];
    pieces.push(...strokePolyline([left, apex, right], width));
  }
  return union(pieces);
}

/** How many marks `size` long, every `pitch`, fit in `room`; at least one. */
function marksIn(room, size, pitch) {
  return Math.max(1, Math.floor((room - size) / pitch + 1e-9) + 1);
}

/**
 * A rectangle centered at arc length s along a polyline, `lengthMm` on the
 * line's direction there and `acrossMm` square to it.
 */
function markAt(points, s, lengthMm, acrossMm) {
  const p = along(points, s);
  const nx = -p.ty;
  const ny = p.tx;
  const ha = lengthMm / 2;
  const hc = acrossMm / 2;
  return positive([
    pt(p.x + p.tx * ha + nx * hc, p.y + p.ty * ha + ny * hc),
    pt(p.x - p.tx * ha + nx * hc, p.y - p.ty * ha + ny * hc),
    pt(p.x - p.tx * ha - nx * hc, p.y - p.ty * ha - ny * hc),
    pt(p.x + p.tx * ha - nx * hc, p.y + p.ty * ha - ny * hc),
  ]);
}

/**
 * A Paid fare zone: a band the line's width with square ends, and bars
 * across it, the run of bars centered so both ends keep the same margin.
 * The bars go one level above the band.
 */
function barsLine(pairs, width, s) {
  const points = toPoints(pairs);
  const total = lengthOf(points);
  const band = strokePolyline(pairs, width, { caps: 'butt' });
  const room = total - 2 * s.fareBarEndMm;
  if (room < s.fareBarMm) return { rings: band, marks: [] };
  const n = marksIn(room, s.fareBarMm, s.fareBarPitchMm);
  const run = (n - 1) * s.fareBarPitchMm + s.fareBarMm;
  const first = (total - run) / 2 + s.fareBarMm / 2;
  // On the inside of a turn a bar can reach the one before it; it is left
  // out, so no two bars fuse into a mark of another shape.
  const bars = [];
  for (let i = 0; i < n; i++) {
    const bar = markAt(
      points,
      first + i * s.fareBarPitchMm,
      s.fareBarMm,
      s.fareBarAcrossMm
    );
    const before = bars[bars.length - 1];
    if (before && union([before, bar]).length < 2) continue;
    bars.push(bar);
  }
  return { rings: band, marks: union(bars) };
}

/**
 * A Platform edge: beads the line's width across, centered on the line as
 * a run, each joined to the next by a neck that narrows to its middle and
 * reaches 0.01 mm into both beads; a block on each bead one level up, the
 * two end blocks 0.01 mm inside their bead so no faces only touch.
 */
function beadsLine(pairs, width, s) {
  const points = toPoints(pairs);
  const total = lengthOf(points);
  const bead = s.beadMm;
  const pitch = s.beadPitchMm;
  const n = marksIn(total, bead, pitch);
  const start = (total - ((n - 1) * pitch + bead)) / 2;
  const EPS = 0.01;
  const floor = [];
  const blocks = [];
  for (let i = 0; i < n; i++) {
    const s0 = start + i * pitch;
    floor.push(markAt(points, s0 + bead / 2, bead, width));
    const inStart = i === 0 ? EPS : 0;
    const inEnd = i === n - 1 ? EPS : 0;
    blocks.push(
      markAt(
        points,
        s0 + bead / 2 + (inStart - inEnd) / 2,
        bead - inStart - inEnd,
        s.beadBlockAcrossMm
      )
    );
    if (i === n - 1) continue;
    const p = along(points, s0 + bead - EPS);
    const q = along(points, s0 + pitch + EPS);
    const len = Math.hypot(q.x - p.x, q.y - p.y);
    if (len < 1e-9) continue;
    const nx = -(q.y - p.y) / len;
    const ny = (q.x - p.x) / len;
    const m = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
    const end = width / 2;
    const waist = s.beadNeckMm / 2;
    floor.push(
      positive([
        pt(p.x - nx * end, p.y - ny * end),
        pt(m.x - nx * waist, m.y - ny * waist),
        pt(q.x - nx * end, q.y - ny * end),
        pt(q.x + nx * end, q.y + ny * end),
        pt(m.x + nx * waist, m.y + ny * waist),
        pt(p.x + nx * end, p.y + ny * end),
      ])
    );
  }
  return { rings: union(floor), marks: union(blocks) };
}

function doubleLine(pairs, width, gap) {
  const points = toPoints(pairs);
  const d = (width + gap) / 2;
  return union([
    ...strokePolyline(offsetPolyline(points, d), width),
    ...strokePolyline(offsetPolyline(points, -d), width),
  ]);
}

/**
 * A symbol's rings at a size, centered on a point and turned by `angle`
 * degrees: the way its right-hand side then faces, measured on the map
 * with y down, so 90 turns a symbol to face down the map.
 */
export function symbolRings(shape, size, at, angle = 0) {
  const [cx, cy] = at;
  const a = ((angle || 0) * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return shapeRings(shape).map((ring) =>
    ring.map((p) => {
      const x = (p.x - 0.5) * size;
      const y = (p.y - 0.5) * size;
      return pt(cx + x * cos - y * sin, cy + x * sin + y * cos);
    })
  );
}

/**
 * The size a point's symbol prints at: the feature's own, else its symbol's
 * own (the station symbols), else the set's.
 *
 * @param {object} f - a point feature
 * @param {object} [settings] - the levels builder's
 * @returns {number} mm
 */
export function pointSizeMm(f, settings = {}) {
  if (f.size !== undefined) return f.size;
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const cls = (s.classes || LEVELS_BY_CLASS)[f.class] || {};
  const shape = symbolMap(s.symbols || activeLibrary())[
    f.symbol ?? cls.symbol ?? 'circle'
  ];
  return shape?.sizeMm ?? s.symbolSizeMm;
}

/**
 * A point feature's symbol as buildLevelRings draws it, in the plan's frame;
 * an unknown symbol is drawn as the circle.
 *
 * @param {object} f - a point feature
 * @param {object} [settings] - the levels builder's
 * @returns {Array<Array<{x: number, y: number}>>}
 */
export function pointRings(f, settings = {}) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const cls = (s.classes || LEVELS_BY_CLASS)[f.class] || {};
  const symbols = symbolMap(s.symbols || activeLibrary());
  const shape =
    symbols[f.symbol ?? cls.symbol ?? 'circle'] ||
    symbols.circle ||
    BUILTIN_SYMBOLS.circle;
  return symbolRings(
    shape,
    f.size ?? shape.sizeMm ?? s.symbolSizeMm,
    f.at,
    f.angle
  );
}

// ---------------------------------------------------------------------------
// Distances for the checks
// ---------------------------------------------------------------------------

function distancePointRect(p, r) {
  const dx = Math.max(r.x0 - p.x, 0, p.x - r.x1);
  const dy = Math.max(r.y0 - p.y, 0, p.y - r.y1);
  return Math.hypot(dx, dy);
}

function distancePointSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t =
    len2 > 0
      ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
      : 0;
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

/** The smallest distance between a rectangle and a set of rings. */
function distanceRectRings(r, rings) {
  let best = Infinity;
  const corners = [
    pt(r.x0, r.y0),
    pt(r.x1, r.y0),
    pt(r.x1, r.y1),
    pt(r.x0, r.y1),
  ];
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      best = Math.min(best, distancePointRect(ring[i], r));
      const next = ring[(i + 1) % ring.length];
      for (const c of corners)
        best = Math.min(best, distancePointSegment(c, ring[i], next));
    }
  }
  return best;
}

/** A number for a sentence: one decimal at most, no trailing zero. */
const say = (n) => String(Math.round(n * 10) / 10);
/** The same, rounded down: a gap under a minimum never reads as the minimum. */
const sayUnder = (n) => String(Math.floor(n * 10) / 10);

// The names the editor's rows show (feature-names.js), set for each build.
let names = new Map();
const nameOf = (f) => names.get(f.id) || f.name || f.id;

/** Words with no plural of their own: said as "{n} drinking water symbols". */
const NO_PLURAL = /(water|parking|furniture|information|fast food)$/i;
const IRREGULAR = Object.freeze({
  'Elevator up': 'elevators up',
  'Elevator down': 'elevators down',
});

/** The plural of a kind or class word, in lowercase but for capitals (ATMs). */
function plural(word) {
  if (IRREGULAR[word]) return IRREGULAR[word];
  const aside = word.match(/^(.*?) (\(.*\))$/);
  if (aside) return `${plural(aside[1])} ${aside[2]}`;
  if (/^[A-Z0-9]+$/.test(word)) return `${word}s`;
  const w = word.charAt(0).toLowerCase() + word.slice(1);
  if (NO_PLURAL.test(w)) return `${w} symbols`;
  if (/s$/.test(w)) return w;
  if (/[^aeiou]y$/.test(w)) return `${w.slice(0, -1)}ies`;
  if (/(ch|sh|x|z)$/.test(w)) return `${w}es`;
  return `${w}s`;
}

/**
 * The word for a spot whose symbols are all one thing ("benches", "bus
 * stops", "landmarks"), or null when they are not.
 */
function spotWord(features) {
  const whats = new Set(features.map((f) => f.what || ''));
  if (whats.size === 1 && !whats.has('')) return plural([...whats][0]);
  const classes = new Set(features.map((f) => f.class));
  if (classes.size !== 1) return null;
  const name = mapClass([...classes][0])?.name;
  return name ? plural(name) : null;
}

// ---------------------------------------------------------------------------
// The builder
// ---------------------------------------------------------------------------

/**
 * Build a plan's rings per group (level1, level2, level3, channels), the
 * boxes its raised letters take, the warnings and the stats. The plate
 * splitter clips these rings; the levels file is one call further on.
 *
 * @param {object} plan - See plan.js
 * @param {Partial<typeof DEFAULT_SETTINGS>} [settings]
 * @returns {{ rings: Record<string, Array<Array<{x: number, y: number}>>>, textBoxes: Array<object>, warnings: Array<{code: string, featureId: string|null, featureIds?: string[], text: string}>, stats: object }}
 */
export function buildLevelRings(plan, settings = {}) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const list = plan.features || [];
  names = new Map(featureNames(list).map((name, i) => [list[i].id, name]));
  const classes = s.classes || LEVELS_BY_CLASS;
  const symbols = symbolMap(s.symbols || activeLibrary());
  const w = plan.size.w;
  const h = plan.size.h;
  const warnings = [];
  const warn = (code, featureId, text, extra) =>
    warnings.push({ code, featureId, text, ...extra });

  // Every feature's rings, kept with the feature for the checks.
  const built = [];
  const symbolKeys = new Set();
  const unknownSymbols = new Set();
  const textures = new Set();
  const points = [];
  const channels = [];
  const textBoxes = [];
  // Where each solid symbol stands: the model raises the cone there itself.
  const cones = [];

  for (const f of plan.features || []) {
    if (f.on === false) continue;
    const cls = classes[f.class] || {};
    const kind = f.kind;
    if (kind === 'line') {
      const width = f.width ?? cls.width ?? 1.5;
      const style = f.style ?? cls.style ?? 'solid';
      const level = f.level ?? cls.level ?? 1;
      const pts = toPoints(f.points);
      let rings;
      if (style === 'dotted') rings = dottedLine(pts, width, s.dotSpacingMm);
      else if (style === 'dashed')
        rings = dashedLine(
          pts,
          width,
          cls.dashMm ?? s.dashMm,
          cls.dashGapMm ?? s.dashGapMm
        );
      else if (style === 'ticks')
        rings = tickedLine(pts, width, s.tickLengthMm, s.tickSpacingMm);
      else if (style === 'chevrons')
        rings = chevronsLine(
          f.points,
          width,
          s.chevronPitchMm,
          s.chevronAcrossMm,
          f.uphill
        );
      else if (style === 'double')
        rings = doubleLine(f.points, width, cls.gapMm ?? s.doubleGapMm);
      else if (style === 'bars' || style === 'beads') {
        const form =
          style === 'bars'
            ? barsLine(f.points, width, s)
            : beadsLine(f.points, width, s);
        rings = form.rings;
        if (form.marks.length)
          built.push({ f, level: level + 1, rings: form.marks });
      } else rings = strokePolyline(f.points, width);
      built.push({ f, level, rings });
      // A double line, and a band carrying bars or beads carrying blocks,
      // are not single lines.
      if (!NOT_SINGLE_LINES.has(style) && width > s.maxSingleLineMm) {
        warn(
          'line-too-wide',
          f.id,
          `${nameOf(f)} is ${say(width)} mm wide; lines wider than ${say(s.maxSingleLineMm)} mm read as two lines. Use ${say(s.maxSingleLineMm)} mm or a double line.`
        );
      }
    } else if (kind === 'area') {
      const level = f.level ?? cls.level ?? 1;
      // The holes wound the other way stay open under the level's NonZero
      // union, unless another shape of the level covers them.
      const rings = [
        positive(toPoints(f.ring)),
        ...(f.holes || []).map((hole) => negative(toPoints(hole))),
      ];
      built.push({ f, level, rings });
      if (f.texture) textures.add(f.texture);
    } else if (kind === 'point') {
      const level = f.level ?? cls.level ?? 2;
      const key = f.symbol ?? cls.symbol ?? 'circle';
      symbolKeys.add(key);
      let shape = symbols[key];
      if (!shape) {
        unknownSymbols.add(key);
        shape = symbols.circle || BUILTIN_SYMBOLS.circle;
      }
      const size = f.size ?? shape.sizeMm ?? s.symbolSizeMm;
      built.push({ f, level, rings: symbolRings(shape, size, f.at, f.angle) });
      if (typeof shape.raisedPathData === 'string') {
        built.push({
          f,
          level: 'here',
          rings: symbolRings(
            { pathData: shape.raisedPathData },
            size,
            f.at,
            f.angle
          ),
        });
      }
      points.push({ f, size });
      if (shape.solid) cones.push([f.at[0], f.at[1]]);
      // A solid symbol (the destination cone) is read by its height, not
      // its footprint, and a symbol at a size of its own (the turnstile's
      // bar) was printed and felt at that size: the floor does not apply.
      const ownSize = shape.sizeMm !== undefined && size === shape.sizeMm;
      if (size < s.minSymbolMm && !shape.solid && !ownSize) {
        warn(
          'symbol-too-small',
          f.id,
          `${nameOf(f)}'s symbol is ${say(size)} mm; symbols smaller than ${say(s.minSymbolMm)} mm are hard to recognize.`
        );
      }
    } else if (kind === 'channel') {
      const across = s.tapeWidthMm + s.channelClearanceMm;
      const [cx, cy] = f.at;
      const half = f.vertical
        ? [across / 2, f.length / 2]
        : [f.length / 2, across / 2];
      const r = {
        x0: cx - half[0],
        y0: cy - half[1],
        x1: cx + half[0],
        y1: cy + half[1],
      };
      channels.push({ f, r });
      built.push({
        f,
        level: s.channelsThrough ? 'cutouts' : 'channels',
        rings: [rectRing(r.x0, r.y0, r.x1, r.y1)],
      });
    } else if (kind === 'text') {
      const size = f.size ?? s.titleCharHeightMm;
      const [x, y] = f.at;
      textBoxes.push({
        x,
        y,
        width: f.text.length * size * s.letterAdvance,
        height: size,
      });
    }
  }

  // The title's box, as the tile lays the title out.
  const north = plan.meta?.north ?? 'arrow';
  const title = plan.meta?.title || '';
  if (title) {
    const x = s.edgeClearanceMm;
    const y =
      s.edgeClearanceMm + (north === 'line' ? s.northLineMm + s.northGapMm : 0);
    const right =
      w - s.edgeClearanceMm - (north === 'arrow' ? s.northArrowColumnMm : 0);
    textBoxes.unshift({
      x,
      y,
      width: Math.max(
        0,
        Math.min(
          title.length * s.titleCharHeightMm * s.letterAdvance,
          right - x
        )
      ),
      height: s.titleCharHeightMm,
      // The tile's own title, laid out on the plate's edge, not a thing on
      // the map: the trim leaves it out.
      title: true,
    });
  }

  // The checks.
  if (symbolKeys.size > s.maxSymbols) {
    warn(
      'too-many-symbols',
      null,
      `${symbolKeys.size} different symbols on this map. More than ${s.maxSymbols} is hard to remember; consider fewer.`
    );
  }
  if (textures.size > s.maxTextures) {
    warn(
      'too-many-textures',
      null,
      `${textures.size} area textures. More than ${s.maxTextures} read as noise; consider plain areas.`
    );
  }
  // Symbols closer than the gap, gathered into spots: a pair is named, a
  // spot of three or more is said once (six benches at one place are one
  // thing to fix, not fifteen).
  const spotOf = points.map((_, i) => i);
  const root = (i) => (spotOf[i] === i ? i : (spotOf[i] = root(spotOf[i])));
  const pairs = [];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const a = points[i];
      const b = points[j];
      const dx = Math.abs(a.f.at[0] - b.f.at[0]);
      const dy = Math.abs(a.f.at[1] - b.f.at[1]);
      const gap = Math.max(0, Math.max(dx, dy) - (a.size + b.size) / 2);
      // A bank of gates stands as drawn, each bar beside the next.
      const bank = a.f.class === 'turnstile' && b.f.class === 'turnstile';
      if (gap < s.minGapMm && !bank) {
        pairs.push({ a, b, gap });
        spotOf[root(j)] = root(i);
      }
    }
  }
  const crowded = new Set(pairs.flatMap(({ a, b }) => [a, b]));
  const spots = new Map();
  points.forEach((p, i) => {
    if (!crowded.has(p)) return;
    const key = root(i);
    if (!spots.has(key)) spots.set(key, []);
    spots.get(key).push(p);
  });
  const nearestPlace = placeFinder(list);
  for (const spot of spots.values()) {
    if (spot.length === 2) {
      const { a, b, gap } = pairs.find(
        (q) => spot.includes(q.a) && spot.includes(q.b)
      );
      warn(
        'too-close',
        a.f.id,
        `${nameOf(a.f)} and ${nameOf(b.f)} are ${sayUnder(gap)} mm apart, closer than the ${say(s.minGapMm)} mm minimum. Move one or turn one off.`,
        { featureIds: [a.f.id, b.f.id] }
      );
      continue;
    }
    const middle = [0, 1].map(
      (axis) => spot.reduce((sum, p) => sum + p.f.at[axis], 0) / spot.length
    );
    const place = nearestPlace(middle);
    const near = place ? ` near ${place}` : '';
    const word = spotWord(spot.map((p) => p.f));
    const within = `within ${say(s.minGapMm)} mm of one another${near}.`;
    warn(
      'too-close',
      spot[0].f.id,
      word
        ? `${spot.length} ${word} ${within} Keep one and turn the others off.`
        : `${spot.length} symbols ${within} Move them apart or turn some off.`,
      { featureIds: spot.map((p) => p.f.id) }
    );
  }
  for (const c of channels) {
    for (const b of built) {
      if (b.f === c.f || b.f.kind === 'channel') continue;
      const d = distanceRectRings(c.r, b.rings);
      if (d < s.channelKeepClearMm) {
        warn(
          'channel-too-close',
          c.f.id,
          `The label channel ${nameOf(c.f)} is ${sayUnder(d)} mm from ${nameOf(b.f)}; keep ${say(s.channelKeepClearMm)} mm clear.`,
          { featureIds: [c.f.id, b.f.id] }
        );
      }
    }
  }
  if (w > s.maxWidthMm) {
    warn(
      'too-wide',
      null,
      `The map is ${say(w)} mm wide; more than ${say(s.maxWidthMm)} mm is beyond two hand spans.`
    );
  }
  if (h > s.maxHeightMm) {
    warn(
      'too-tall',
      null,
      `The map is ${say(h)} mm tall; more than ${say(s.maxHeightMm)} mm is beyond a hand span.`
    );
  }
  // A raised part stands on its symbol: the same level, by the count.
  const GROUPS = ['channels', 'cutouts', 'here'];
  const levelsUsed = new Set(
    built.filter((b) => !GROUPS.includes(b.level)).map((b) => b.level)
  );
  if (levelsUsed.size > s.maxLevels) {
    warn(
      'too-many-levels',
      null,
      `This map uses ${levelsUsed.size} levels; more than ${s.maxLevels} are hard to tell apart by touch.`
    );
  }

  // The groups: one NonZero union per level.
  // cutouts holds the channels only when they are cut through: a plate's
  // name as notches joins it in the plate splitter, and the tile imports
  // every group, so each is present.
  const groupRings = {
    level1: [],
    level2: [],
    level3: [],
    here: [],
    channels: [],
    cutouts: [],
    leads: [],
  };
  for (const b of built) {
    const key = GROUPS.includes(b.level) ? b.level : `level${b.level}`;
    if (!groupRings[key]) groupRings[key] = [];
    groupRings[key].push(...b.rings);
  }
  const rings = {};
  const ringsPerLevel = {};
  let segments = 0;
  for (const key of Object.keys(groupRings)) {
    rings[key] = groupRings[key].length ? union(groupRings[key]) : [];
    ringsPerLevel[key] = rings[key].length;
    for (const r of rings[key]) segments += r.length;
  }

  return {
    rings,
    textBoxes,
    warnings,
    cones,
    stats: {
      segments,
      ringsPerLevel,
      symbolsUsed: symbolKeys.size,
      unknownSymbols: [...unknownSymbols],
      levelsUsed: levelsUsed.size,
    },
  };
}

/**
 * The levels file for a set of per-group rings: one <g> per key, in the
 * order given, each holding one path of all its rings, then the letters
 * group with the boxes the raised letters take.
 *
 * @param {Record<string, Array<Array<{x: number, y: number}>>>} rings
 * @param {{ w: number, h: number }} size - The map in mm
 * @param {Array<{x: number, y: number, width: number, height: number}>} [textBoxes]
 * @returns {string}
 */
export function levelsSvgFromRings(rings, size, textBoxes = []) {
  const groups = [];
  for (const key of Object.keys(rings)) {
    const list = rings[key] || [];
    const body = list.length ? `<path d="${ringsToPathData(list, 3)}"/>` : '';
    groups.push(`  <g id="${key}">${body}</g>`);
  }
  const letters = textBoxes
    .map(
      (b) =>
        `<rect x="${say(b.x)}" y="${say(b.y)}" width="${say(b.width)}" height="${say(b.height)}" fill="none"/>`
    )
    .join('');
  groups.push(
    `  <g id="letters"><!-- the boxes the raised letters take; the model draws the letters with text() -->${letters}</g>`
  );
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size.w}mm" height="${size.h}mm" viewBox="0 0 ${size.w} ${size.h}">\n` +
    groups.join('\n') +
    '\n</svg>\n'
  );
}

/**
 * Build the levels file for a plan: the rings, then the SVG.
 *
 * @param {object} plan - See plan.js
 * @param {Partial<typeof DEFAULT_SETTINGS>} [settings]
 * @returns {{ svg: string, warnings: Array<{code: string, featureId: string|null, featureIds?: string[], text: string}>, stats: object }}
 */
export function buildLevelsSvg(plan, settings = {}) {
  const { rings, textBoxes, warnings, stats } = buildLevelRings(plan, settings);
  return {
    svg: levelsSvgFromRings(rings, plan.size, textBoxes),
    warnings,
    stats,
  };
}
