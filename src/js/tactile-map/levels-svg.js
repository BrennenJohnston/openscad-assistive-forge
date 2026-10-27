/**
 * The levels builder: a map plan in, the levels file out.
 *
 * The levels file is one SVG in millimeters with a group per height,
 * <g id="level1"> to <g id="level3">, <g id="channels"> and
 * <g id="cutouts"> (what is cut right through the plate: a plate's name as
 * notches, added by the plate splitter), which the Tactile Map tile imports
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
import { activeLibrary } from './symbol-library.js';

/** How lines are stroked (the plan allowed offsetRing first; see above). */
export const STROKE_METHOD = 'segments-and-discs';

const DISC_SEGMENTS = 24;

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
  'transit-stop': DISC_SHAPE,
};

/**
 * Symbols as a map by key, whether they came as a map or as the library's
 * array of { key, ... }.
 */
function symbolMap(symbols) {
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
 * style, with which symbol. The drawing editor's class column ships the
 * same rows later; until then this is the one copy.
 */
export const LEVELS_BY_CLASS = {
  wall: { kind: 'line', level: 3, width: 2.0, style: 'solid' },
  curb: { kind: 'line', level: 1, width: 1.0, style: 'solid' },
  walkway: { kind: 'line', level: 1, width: 1.5, style: 'solid' },
  route: { kind: 'line', level: 2, width: 1.5, style: 'dotted' },
  crossing: { kind: 'line', level: 2, width: 1.5, style: 'ticks' },
  track: { kind: 'line', level: 1, width: 1.0, style: 'double' },
  area: { kind: 'area', level: 1 },
  stairs: { kind: 'point', level: 2, symbol: 'stairs' },
  'elevator-up': { kind: 'point', level: 2, symbol: 'elevator-up' },
  'elevator-down': { kind: 'point', level: 2, symbol: 'elevator-down' },
  entrance: { kind: 'point', level: 2, symbol: 'entrance' },
  landmark: { kind: 'point', level: 2, symbol: 'landmark-circle' },
  'you-are-here': { kind: 'point', level: 2, symbol: 'you-are-here' },
  'transit-stop': { kind: 'point', level: 2, symbol: 'transit-stop' },
  channel: { kind: 'channel' },
  text: { kind: 'text' },
  ignore: { kind: 'ignore' },
};

export const DEFAULT_SETTINGS = {
  classes: LEVELS_BY_CLASS,
  // null means the symbol library in use (activeLibrary()).
  symbols: null,
  symbolSizeMm: 10,
  minGapMm: 3,
  tapeWidthMm: 12.7,
  channelClearanceMm: 0.4,
  channelKeepClearMm: 3,
  dotSpacingMm: 3,
  dashMm: 6,
  dashGapMm: 3,
  doubleGapMm: 1.5,
  tickLengthMm: 6,
  tickSpacingMm: 6,
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

function doubleLine(pairs, width, gap) {
  const points = toPoints(pairs);
  const d = (width + gap) / 2;
  return union([
    ...strokePolyline(offsetPolyline(points, d), width),
    ...strokePolyline(offsetPolyline(points, -d), width),
  ]);
}

/** A symbol's ring at a size, centered on a point. */
function symbolRings(shape, size, at) {
  const [cx, cy] = at;
  return shapeRings(shape).map((ring) =>
    ring.map((p) => pt(cx - size / 2 + p.x * size, cy - size / 2 + p.y * size))
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

const nameOf = (f) => f.name || f.id;

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
        rings = dashedLine(pts, width, s.dashMm, s.dashGapMm);
      else if (style === 'ticks')
        rings = tickedLine(pts, width, s.tickLengthMm, s.tickSpacingMm);
      else if (style === 'double')
        rings = doubleLine(f.points, width, s.doubleGapMm);
      else rings = strokePolyline(f.points, width);
      built.push({ f, level, rings });
      if (style !== 'double' && width > s.maxSingleLineMm) {
        warn(
          'line-too-wide',
          f.id,
          `${nameOf(f)} is ${say(width)} mm wide; lines wider than ${say(s.maxSingleLineMm)} mm read as two lines. Use ${say(s.maxSingleLineMm)} mm or a double line.`
        );
      }
    } else if (kind === 'area') {
      const level = f.level ?? cls.level ?? 1;
      built.push({ f, level, rings: [positive(toPoints(f.ring))] });
      if (f.texture) textures.add(f.texture);
    } else if (kind === 'point') {
      const level = f.level ?? cls.level ?? 2;
      const size = f.size ?? s.symbolSizeMm;
      const key = f.symbol ?? cls.symbol ?? 'circle';
      symbolKeys.add(key);
      let shape = symbols[key];
      if (!shape) {
        unknownSymbols.add(key);
        shape = symbols.circle || BUILTIN_SYMBOLS.circle;
      }
      built.push({ f, level, rings: symbolRings(shape, size, f.at) });
      points.push({ f, size });
      if (size < s.minSymbolMm) {
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
        level: 'channels',
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
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const a = points[i];
      const b = points[j];
      const dx = Math.abs(a.f.at[0] - b.f.at[0]);
      const dy = Math.abs(a.f.at[1] - b.f.at[1]);
      const gap = Math.max(0, Math.max(dx, dy) - (a.size + b.size) / 2);
      if (gap < s.minGapMm) {
        warn(
          'too-close',
          a.f.id,
          `${nameOf(a.f)} and ${nameOf(b.f)} are ${say(gap)} mm apart, closer than the ${say(s.minGapMm)} mm minimum. Move one or turn one off.`,
          { featureIds: [a.f.id, b.f.id] }
        );
      }
    }
  }
  for (const c of channels) {
    for (const b of built) {
      if (b.f === c.f || b.level === 'channels') continue;
      const d = distanceRectRings(c.r, b.rings);
      if (d < s.channelKeepClearMm) {
        warn(
          'channel-too-close',
          c.f.id,
          `The label channel ${nameOf(c.f)} is ${say(d)} mm from ${nameOf(b.f)}; keep ${say(s.channelKeepClearMm)} mm clear.`,
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
  const levelsUsed = new Set(
    built.filter((b) => b.level !== 'channels').map((b) => b.level)
  );
  if (levelsUsed.size > s.maxLevels) {
    warn(
      'too-many-levels',
      null,
      `This map uses ${levelsUsed.size} levels; more than ${s.maxLevels} are hard to tell apart by touch.`
    );
  }

  // The groups: one NonZero union per level.
  // cutouts stays empty here: a plate's name as notches joins it in the
  // plate splitter, and the tile imports every group, so each is present.
  const groupRings = {
    level1: [],
    level2: [],
    level3: [],
    channels: [],
    cutouts: [],
  };
  for (const b of built) {
    const key = b.level === 'channels' ? 'channels' : `level${b.level}`;
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
