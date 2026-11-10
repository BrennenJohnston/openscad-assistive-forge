/**
 * The number a named thing carries on the map, and where it stands.
 *
 * The Labels switch says what a number is made of, one of three: a braille
 * wedge (the embosser's assembly map's form: the number sign and the digits
 * on a face that leans back toward the reader), a channel for braille label
 * tape that holds the braille number, or a raised bold numeral. The key
 * repeats the number in the same form beside the place's name (key-layout.js).
 * A thing carries its number on itself when the number fits there and covers
 * at most half of it (map-labels.js places those); otherwise the number
 * stands in the margin band beside the map, at the end of a raised lead line
 * from the thing (BANA 2022 5.10.2), on the nearest edge with room; with no
 * room left anywhere it is in the key only.
 *
 * Geometry here is the plan's: millimeters, y down. Every number faces the
 * sheet's bottom edge, the reader's. A box's bottom is its reading line: the
 * wedge's front foot, the numeral's baseline, the channel's lower edge.
 *
 * No DOM here: a worker may import this file.
 *
 * @license GPL-3.0-or-later
 */

import { signRowWidthMm } from '../sign-letter-metrics.js';
import { strokePolyline } from './levels-svg.js';

/**
 * Raised work keeps 9.525 mm (3/8 in) from the sheet's edge (ADA 703.2.7),
 * sheet.js's SHEET_CLEARANCE_MM; a test holds the two equal. Not imported:
 * sheet.js reaches this file back through the key's layout.
 */
export const BAND_EDGE_MM = 9.525;

/** What a number on the map and in the key is made of; wedges to start. */
export const LABEL_STYLES = Object.freeze([
  { key: 'wedge', name: 'Braille wedges' },
  { key: 'tape', name: 'Braille label tape' },
  { key: 'raised', name: 'Raised numbers and letters' },
]);
export const DEFAULT_LABEL_STYLE = 'wedge';

/** A braille labeler's cell pitch on tape (ADA 703.3.1: 6.1 to 7.6 mm). */
export const LABEL_CELL_MM = 6.2;
/** Tape beyond the cells at each end of a label. */
export const LABEL_END_MM = 4;
/** A channel's length for a label of `cells` cells. */
export const channelLengthMm = (cells) =>
  Math.round((cells * LABEL_CELL_MM + 2 * LABEL_END_MM) * 10) / 10;

/**
 * The wedge's constants, the model's (tactile_map.scad, from the embosser's
 * `label_wedge`): the back's angle, the flat top, the face's margins, the
 * dots. The two dials, their ranges and their starts are the model's too:
 * a 6 mm foot at 75 degrees. A test keeps the two files equal.
 */
export const WEDGE = Object.freeze({
  backAngleDeg: 60,
  topMm: 1.5,
  marginXMm: 2.5,
  marginTopMm: 2.0,
  dotPitchMm: 2.5,
  dotBaseMm: 1.5,
  cellPitchMm: 6.5,
  footMm: Object.freeze({ start: 6, min: 2, max: 12 }),
  angleDeg: Object.freeze({ start: 75, min: 45, max: 90 }),
});

/** The largest number a wedge holds: the number sign and two digits. */
export const WEDGE_MAX_NUMBER = 99;

/** A numeral's capital height on a thing, and in the band (mm). */
export const NUMERAL_ON_THING_MM = 10;
export const NUMERAL_IN_BAND_MM = 16;

/** Between a number and what goes with it (mm). */
export const PART_GAP_MM = 3;

/** How far a number keeps from a seam between two plates (mm). */
export const SEAM_GAP_MM = 1;

/** A lead line's width, and the gap it leaves before a numeral or a channel (mm). */
export const LEAD_WIDTH_MM = 1.2;
export const LEAD_GAP_MM = 3;
/** How far a lead runs into a wedge's back, so the two are one solid. */
const LEAD_INTO_MM = 0.5;

/** The edges a band number may stand at: the top holds the title and the cue. */
export const BAND_SIDES = Object.freeze(['bottom', 'left', 'right']);

/** A channel's width beside the tape in it: 12.7 mm tape and 0.4 mm. */
const ACROSS_MM = 13.1;

const NUMBER_SIGN = [3, 4, 5, 6];
const DIGIT_DOTS = [
  [2, 4, 5],
  [1],
  [1, 2],
  [1, 4],
  [1, 4, 5],
  [1, 5],
  [1, 2, 4],
  [1, 2, 4, 5],
  [1, 2, 5],
  [2, 4],
];

/** A bold numeral's ink runs a little past the regular measure (mm a side). */
const BOLD_ALLOWANCE_MM = 0.5;
/** A digit's ink stands a little over the capital's height. */
const DIGIT_TOP_OF_CAP = 0.97024 / 0.95552;

const round3 = (v) => Math.round(v * 1000) / 1000;
const clamp = (v, { min, max, start }) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : start;
};

/**
 * The wedge's two dials, held to their ranges, from the model's values.
 *
 * @param {{ footMm?: number, angleDeg?: number }} [dials]
 * @returns {{ footMm: number, angleDeg: number }}
 */
export function wedgeDials(dials = {}) {
  return {
    footMm: clamp(dials.footMm, WEDGE.footMm),
    angleDeg: clamp(dials.angleDeg, WEDGE.angleDeg),
  };
}

/**
 * A number's braille cells as lists of dot numbers: the number sign, then a
 * cell a digit (1 = a to 0 = j), the model's `_cells(n)`.
 *
 * @param {number} n
 * @returns {number[][]}
 */
export function wedgeCells(n) {
  return [
    NUMBER_SIGN,
    ...String(n)
      .split('')
      .map((d) => DIGIT_DOTS[+d]),
  ];
}

/**
 * Braille text (Unicode braille, as the translator writes it) as cells of
 * dot numbers; a space, written either way, is a cell with no dots.
 *
 * @param {string} braille
 * @returns {number[][]}
 */
export function brailleCells(braille) {
  return [...String(braille || '')].map((ch) => {
    const code = ch.codePointAt(0);
    if (code < 0x2800 || code > 0x28ff) return [];
    const bits = (code - 0x2800) & 0x3f;
    const dots = [];
    for (let d = 0; d < 6; d += 1) if (bits & (1 << d)) dots.push(d + 1);
    return dots;
  });
}

/** Cells of dot numbers as Unicode braille. */
export function cellsBraille(cells) {
  return cells
    .map((dots) =>
      String.fromCodePoint(
        0x2800 + dots.reduce((bits, d) => bits | (1 << (d - 1)), 0)
      )
    )
    .join('');
}

/** A number's braille, the number sign then its digits, as Unicode. */
export const numberBraille = (n) => cellsBraille(wedgeCells(n));

/**
 * A wedge's footprint and height for `cells` braille cells (or a number's),
 * as the model builds it.
 *
 * @param {number|number[][]} what - a number, or its cells
 * @param {{ footMm?: number, angleDeg?: number }} [dials]
 * @returns {{ w: number, depth: number, h: number }}
 */
export function wedgeSize(what, dials) {
  const { footMm, angleDeg } = wedgeDials(dials);
  const rad = (d) => (d * Math.PI) / 180;
  const cellW = WEDGE.dotPitchMm + WEDGE.dotBaseMm;
  const cellH = 2 * WEDGE.dotPitchMm + WEDGE.dotBaseMm;
  const faceH = footMm + cellH + WEDGE.marginTopMm;
  const h = faceH * Math.sin(rad(angleDeg));
  const run = faceH * Math.cos(rad(angleDeg));
  const depth = run + WEDGE.topMm + h / Math.tan(rad(WEDGE.backAngleDeg));
  const cells = Array.isArray(what) ? what.length : wedgeCells(what).length;
  const w = (cells - 1) * WEDGE.cellPitchMm + cellW + 2 * WEDGE.marginXMm;
  return { w: round3(w), depth: round3(depth), h: round3(h) };
}

/** How many braille cells fit on a wedge no wider than `widthMm`. */
export function wedgeCellsFor(widthMm) {
  const cellW = WEDGE.dotPitchMm + WEDGE.dotBaseMm;
  return Math.max(
    1,
    Math.floor((widthMm - cellW - 2 * WEDGE.marginXMm) / WEDGE.cellPitchMm) + 1
  );
}

/**
 * A raised numeral's box: its width by the sign's measure (bold digits
 * share the regular advance) and its ink's height.
 *
 * @param {number} n
 * @param {number} capMm
 * @returns {{ w: number, h: number }}
 */
export function numeralSize(n, capMm) {
  const w =
    signRowWidthMm(String(n), { charHeightMm: capMm, letterSpacing: 1 }) +
    2 * BOLD_ALLOWANCE_MM;
  return { w: round3(w), h: round3(capMm * DIGIT_TOP_OF_CAP) };
}

/**
 * The box a number takes by the switch: one part, a wedge, a channel for
 * its braille on tape, or a numeral, standing on the box's bottom. Null when
 * the switch leaves the number nothing to be made of (a wedge past what it
 * holds).
 *
 * @param {number} n
 * @param {string} style - a LABEL_STYLES key
 * @param {{ footMm?: number, angleDeg?: number }} [dials]
 * @param {{ inBand?: boolean, acrossMm?: number }} [options] - acrossMm: a
 *   channel's width, the tape's and its clearance
 * @returns {{ w: number, h: number, parts: Array<{kind: 'numeral'|'wedge'|'channel', x0: number, w: number, h: number, capMm?: number}> } | null}
 */
export function identifierBox(
  n,
  style,
  dials,
  { inBand = false, acrossMm = ACROSS_MM } = {}
) {
  let part = null;
  if (style === 'raised') {
    const capMm = inBand ? NUMERAL_IN_BAND_MM : NUMERAL_ON_THING_MM;
    const m = numeralSize(n, capMm);
    part = { kind: 'numeral', w: m.w, h: m.h, capMm };
  } else if (style === 'tape') {
    const length = channelLengthMm(wedgeCells(n).length);
    part = { kind: 'channel', w: length, h: acrossMm };
  } else if (style === 'wedge' && n <= WEDGE_MAX_NUMBER) {
    const s = wedgeSize(n, dials);
    part = { kind: 'wedge', w: s.w, h: s.depth };
  }
  if (!part) return null;
  return {
    w: round3(part.w),
    h: round3(part.h),
    parts: [{ ...part, x0: 0 }],
  };
}

/**
 * A number set down with its box's top left at (x0, y0): the box, and the
 * numeral's center and baseline, the wedge's front foot with its cells, or
 * the channel's center and length.
 *
 * @param {object} input
 * @param {string} input.featureId
 * @param {number} input.number
 * @param {ReturnType<typeof identifierBox>} input.box
 * @param {number} input.x0
 * @param {number} input.y0
 * @param {'thing'|'bottom'|'left'|'right'} input.where
 * @param {number} [input.standsOn] - the level under a numeral on a thing, 0 for the base
 */
export function markAt({
  featureId,
  number,
  box,
  x0,
  y0,
  where,
  standsOn = 0,
}) {
  const line = y0 + box.h;
  const mark = {
    featureId,
    number,
    where,
    box: {
      x0: round3(x0),
      y0: round3(y0),
      x1: round3(x0 + box.w),
      y1: round3(line),
    },
    numeral: null,
    wedge: null,
    channel: null,
  };
  for (const p of box.parts) {
    const cx = round3(x0 + p.x0 + p.w / 2);
    if (p.kind === 'numeral') {
      mark.numeral = { x: cx, y: round3(line), capMm: p.capMm, standsOn };
    } else if (p.kind === 'channel') {
      mark.channel = {
        x: cx,
        y: round3(line - p.h / 2),
        length: p.w,
        across: p.h,
      };
    } else {
      mark.wedge = {
        x: cx,
        y: round3(line),
        w: p.w,
        depth: p.h,
        cells: wedgeCells(number),
      };
    }
  }
  return mark;
}

/**
 * Where a band number's lead ends: at the wedge's back (run a little into
 * it, so the two print as one), or 3 mm short of a channel or a numeral
 * (BANA 2022 3.4.3.6).
 */
function leadEnd(mark, side) {
  if (mark.wedge) {
    const { x, y, w, depth } = mark.wedge;
    if (side === 'bottom') return [x, y - depth + LEAD_INTO_MM];
    if (side === 'left') return [x + w / 2 - LEAD_INTO_MM, y - depth / 2];
    return [x - w / 2 + LEAD_INTO_MM, y - depth / 2];
  }
  let x;
  let top;
  let bottom;
  let half;
  if (mark.channel) {
    ({ x } = mark.channel);
    top = mark.channel.y - mark.channel.across / 2;
    bottom = mark.channel.y + mark.channel.across / 2;
    half = mark.channel.length / 2;
  } else {
    const { capMm } = mark.numeral;
    const { w, h } = numeralSize(mark.number, capMm);
    ({ x } = mark.numeral);
    bottom = mark.numeral.y;
    top = bottom - h;
    half = w / 2;
  }
  if (side === 'bottom') return [x, top - LEAD_GAP_MM];
  const mid = (top + bottom) / 2;
  if (side === 'left') return [x + half + LEAD_GAP_MM, mid];
  return [x - half - LEAD_GAP_MM, mid];
}

/** A thing's outline points: an area's ring, a point's symbol square. */
function outlineOf(f, symbolSizeMm) {
  if (f.kind === 'area' && Array.isArray(f.ring)) return f.ring;
  const h = (f.size ?? symbolSizeMm) / 2;
  const [x, y] = f.at;
  return [
    [x - h, y - h],
    [x + h, y - h],
    [x + h, y + h],
    [x - h, y + h],
  ];
}

/**
 * Where a lead leaves a thing toward an edge: the outline's point nearest
 * that edge; along a side that faces the edge, its point nearest the
 * outline's middle.
 *
 * @param {Array<number[]>} points - the outline, a closed ring
 * @param {'bottom'|'left'|'right'} side
 * @returns {number[]}
 */
export function anchorToward(points, side) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const bottom = side === 'bottom';
  const mid = bottom
    ? (Math.min(...xs) + Math.max(...xs)) / 2
    : (Math.min(...ys) + Math.max(...ys)) / 2;
  const reach = (p) => (bottom ? p[1] : side === 'left' ? -p[0] : p[0]);
  const alongOf = (p) => (bottom ? p[0] : p[1]);
  const best = Math.max(...points.map(reach));
  const extreme = (p) => reach(p) > best - 1e-6;
  const spots = [];
  points.forEach((p, i) => {
    if (!extreme(p)) return;
    spots.push(p);
    const q = points[(i + 1) % points.length];
    if (q !== p && extreme(q)) {
      const lo = Math.min(alongOf(p), alongOf(q));
      const hi = Math.max(alongOf(p), alongOf(q));
      const t = Math.min(hi, Math.max(lo, mid));
      spots.push(bottom ? [t, p[1]] : [p[0], t]);
    }
  });
  const off = (p) => Math.abs(alongOf(p) - mid);
  return spots.reduce((a, b) => (off(b) < off(a) ? b : a));
}

/**
 * Items along one edge, packed: each centered at its ideal place when it
 * can be, in the order of those places (or in the order given),
 * PART_GAP_MM apart, within [lo, hi]. Null when they do not fit.
 *
 * An item keeps SEAM_GAP_MM from every `blocked` place (the seams between
 * plates), moved past it the way it was going.
 *
 * @param {Array<{ideal: number, size: number}>} items
 * @param {number} lo
 * @param {number} hi
 * @param {{ inOrder?: boolean, blocked?: number[] }} [options] - keep the
 *   items' own order; places no item may cover
 * @returns {number[]|null} each item's start, in the items' order
 */
export function packAlong(
  items,
  lo,
  hi,
  { inOrder = false, blocked = [] } = {}
) {
  // A micrometer's tolerance: an item set just clear of a seam, by the sum
  // of its start and size, is clear of it.
  const hit = (s, size) =>
    blocked.find(
      (b) => s < b + SEAM_GAP_MM - 1e-6 && s + size > b - SEAM_GAP_MM + 1e-6
    );
  const listed = items.map((it, i) => ({ ...it, i }));
  const order = inOrder
    ? listed
    : listed.sort((a, b) => a.ideal - b.ideal || a.i - b.i);
  const total =
    order.reduce((n, it) => n + it.size, 0) +
    PART_GAP_MM * Math.max(0, order.length - 1);
  if (total > hi - lo + 1e-9) return null;
  const start = [];
  let next = lo;
  for (const it of order) {
    let s = Math.max(next, it.ideal - it.size / 2);
    for (
      let b = hit(s, it.size), n = 0;
      b !== undefined && n <= blocked.length;
      b = hit(s, it.size), n += 1
    ) {
      s = b + SEAM_GAP_MM;
    }
    start.push(s);
    next = s + it.size + PART_GAP_MM;
  }
  // Pushed past the far end: slide back, keeping the gaps.
  let limit = hi;
  for (let k = order.length - 1; k >= 0; k -= 1) {
    const size = order[k].size;
    let s = Math.min(start[k], limit - size);
    for (
      let b = hit(s, size), n = 0;
      b !== undefined && n <= blocked.length;
      b = hit(s, size), n += 1
    ) {
      s = b - SEAM_GAP_MM - size;
    }
    if (hit(s, size) !== undefined) return null;
    start[k] = s;
    limit = s - PART_GAP_MM;
  }
  if (start.length && start[0] < lo - 1e-9) return null;
  const out = new Array(items.length);
  order.forEach((it, k) => {
    out[it.i] = round3(start[k]);
  });
  return out;
}

/** Whether segments a-b and c-d cross at a point inside both. */
function crosses(a, b, c, d) {
  const turn = (o, q, r) =>
    (q[0] - o[0]) * (r[1] - o[1]) - (q[1] - o[1]) * (r[0] - o[0]);
  return turn(c, d, a) * turn(c, d, b) < 0 && turn(a, b, c) * turn(a, b, d) < 0;
}

/** Whether a lead from a to b runs over a box, grown by half the lead's width. */
function overBox(a, b, box) {
  const g = LEAD_WIDTH_MM / 2;
  const r = { x0: box.x0 - g, y0: box.y0 - g, x1: box.x1 + g, y1: box.y1 + g };
  const inside = ([x, y]) => x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1;
  if (inside(a) || inside(b)) return true;
  const c = [
    [r.x0, r.y0],
    [r.x1, r.y0],
    [r.x1, r.y1],
    [r.x0, r.y1],
  ];
  return c.some((p, i) => crosses(a, b, p, c[(i + 1) % 4]));
}

/**
 * The numbers that did not fit on their things, set in the band around the
 * map's face: the nearest edge with room (the bottom, the left or the right;
 * the top holds the title and the north cue) whose lead would run over no
 * other number, else the nearest with room; each number at its thing's place
 * along that edge, and the order along the edge changed until no two of its
 * leads cross; a lead line from the thing's outline to the number. A number
 * with no room on any edge is in the key only, and a sentence says so.
 *
 * @param {object} input
 * @param {Array<{f: object, number: number, name: string}>} input.pending - in number order
 * @param {{x0: number, y0: number, x1: number, y1: number}} input.face - the face, plan frame
 * @param {string} input.style - a LABEL_STYLES key
 * @param {{ footMm?: number, angleDeg?: number }} [input.dials]
 * @param {number} [input.symbolSizeMm]
 * @param {Array<{x0: number, y0: number, x1: number, y1: number}>} [input.zones] - kept clear (the north cue), plan frame
 * @param {object[]} [input.marks] - the numbers standing on things, whose
 *   boxes a lead keeps off
 * @param {{x?: number[], y?: number[]}} [input.seams] - the seams between
 *   plates, plan frame: no number stands across one
 * @param {number} [input.acrossMm] - a channel's width, for numbers on tape
 * @returns {{ marks: object[], leads: Array<[number[], number[]]>, rings: Array<Array<{x: number, y: number}>>, sides: {left: number, right: number, bottom: number}, keyOnly: Array<{featureId: string, number: number, name: string}> }}
 */
export function bandPlan({
  pending = [],
  face,
  style,
  dials,
  symbolSizeMm = 10,
  zones = [],
  marks: onThings = [],
  seams = {},
  acrossMm = ACROSS_MM,
}) {
  // A seam across the bottom margin runs up and down; across a side, along.
  const blocked = {
    bottom: seams.x || [],
    left: seams.y || [],
    right: seams.y || [],
  };
  const span = {
    bottom: [face.x0, face.x1],
    left: [face.y0, face.y1],
    right: [face.y0, face.y1],
  };
  // A band beside the face starts below whatever the cue keeps clear there.
  for (const z of zones) {
    if (z.x0 < face.x0 + 1) span.left[0] = Math.max(span.left[0], z.y1);
    if (z.x1 > face.x1 - 1) span.right[0] = Math.max(span.right[0], z.y1);
  }
  const along = (side, box) => (side === 'bottom' ? box.w : box.h);
  const taken = { bottom: [], left: [], right: [] };
  const keyOnly = [];
  const fits = (side, list) =>
    packAlong(
      list.map((it) => ({ ideal: it.ideal, size: along(side, it.box) })),
      span[side][0],
      span[side][1],
      { blocked: blocked[side] }
    );
  const boxFor = (number) =>
    identifierBox(number, style, dials, { inBand: true, acrossMm });

  for (const item of pending) {
    const outline = outlineOf(item.f, symbolSizeMm);
    const xs = outline.map((p) => p[0]);
    const ys = outline.map((p) => p[1]);
    const away = {
      bottom: face.y1 - Math.max(...ys),
      left: Math.min(...xs) - face.x0,
      right: face.x1 - Math.max(...xs),
    };
    const sides = [...BAND_SIDES].sort((a, b) => away[a] - away[b]);
    // Where the lead would end: at the number's ideal place, held inside the
    // edge's span (below the cue's clearance on a side).
    const reach = (side, ideal, box) => {
      const half = along(side, box) / 2;
      const at = Math.min(
        span[side][1] - half,
        Math.max(span[side][0] + half, ideal)
      );
      return side === 'bottom'
        ? [at, face.y1 + LEAD_GAP_MM]
        : [side === 'left' ? face.x0 : face.x1, at];
    };
    const others = onThings.filter((m) => m.featureId !== item.f.id);
    let placed = false;
    if (boxFor(item.number)) {
      const open = [];
      for (const side of sides) {
        const box = boxFor(item.number);
        const anchor = anchorToward(outline, side);
        const ideal = side === 'bottom' ? anchor[0] : anchor[1];
        const next = [...taken[side], { ...item, box, anchor, ideal }];
        if (!fits(side, next)) continue;
        const end = reach(side, ideal, box);
        open.push({
          side,
          next,
          clear: !others.some((m) => overBox(anchor, end, m.box)),
        });
      }
      const pick = open.find((o) => o.clear) || open[0];
      if (pick) {
        taken[pick.side] = pick.next;
        placed = true;
      }
    }
    if (!placed) {
      keyOnly.push({
        featureId: item.f.id,
        number: item.number,
        name: item.name,
      });
    }
  }

  // One edge's numbers at their starts, in the order given, with their leads.
  const layOut = (side, order) => {
    const starts = packAlong(
      order.map((it) => ({ ideal: it.ideal, size: along(side, it.box) })),
      span[side][0],
      span[side][1],
      { inOrder: true, blocked: blocked[side] }
    );
    return order.map((it, k) => {
      let x0;
      let y0;
      if (side === 'bottom') {
        x0 = starts[k];
        y0 = face.y1 + LEAD_GAP_MM;
      } else {
        y0 = starts[k];
        x0 =
          side === 'left'
            ? face.x0 - LEAD_GAP_MM - it.box.w
            : face.x1 + LEAD_GAP_MM;
      }
      const mark = markAt({
        featureId: it.f.id,
        number: it.number,
        box: it.box,
        x0,
        y0,
        where: side,
      });
      mark.lead = [it.anchor.map(round3), leadEnd(mark, side).map(round3)];
      return mark;
    });
  };

  const marks = [];
  const leads = [];
  const sides = { left: 0, right: 0, bottom: 0 };
  for (const side of BAND_SIDES) {
    const list = taken[side];
    if (!list.length) continue;
    const deepest = Math.max(
      ...list.map((it) => (side === 'bottom' ? it.box.h : it.box.w))
    );
    sides[side] = Math.ceil(LEAD_GAP_MM + deepest + BAND_EDGE_MM - 1e-9);
    // In the order of the things' places first; then any two whose leads
    // cross change places, until none do, within a bound on the passes.
    const order = [...list].sort((a, b) => a.ideal - b.ideal);
    let laid = layOut(side, order);
    for (let pass = 0; pass < order.length * order.length; pass += 1) {
      let swap = null;
      for (let i = 0; i < laid.length && !swap; i += 1) {
        for (let j = i + 1; j < laid.length && !swap; j += 1) {
          const [a, b] = laid[i].lead;
          const [c, d] = laid[j].lead;
          if (crosses(a, b, c, d)) swap = [i, j];
        }
      }
      if (!swap) break;
      [order[swap[0]], order[swap[1]]] = [order[swap[1]], order[swap[0]]];
      laid = layOut(side, order);
    }
    for (const mark of laid) {
      marks.push(mark);
      leads.push(mark.lead);
    }
  }
  marks.sort((a, b) => a.number - b.number);
  return {
    marks,
    leads,
    rings: leads.flatMap(([a, b]) =>
      strokePolyline([a, b], LEAD_WIDTH_MM, { caps: 'butt' })
    ),
    sides,
    keyOnly,
  };
}

/**
 * Whether a box stands across a seam between plates, within SEAM_GAP_MM.
 *
 * @param {{x0: number, y0: number, x1: number, y1: number}} box
 * @param {{x?: number[], y?: number[]}} seams
 * @returns {boolean}
 */
export function crossesSeam(box, seams = {}) {
  const across = (lo, hi, at) => lo < at + SEAM_GAP_MM && hi > at - SEAM_GAP_MM;
  return (
    (seams.x || []).some((x) => across(box.x0, box.x1, x)) ||
    (seams.y || []).some((y) => across(box.y0, box.y1, y))
  );
}

/** The sentence for a number with no room anywhere (A11Y). */
export const KEY_ONLY_SENTENCE = (name, n) =>
  `No room on the map or in its margin for ${name}'s number ${n}; it is in the key.`;

/**
 * Marks moved by an offset: the plan's into the sheet's frame.
 *
 * @param {object[]} marks
 * @param {[number, number]} offset
 */
export function moveMarks(marks, [dx, dy]) {
  const at = ([x, y]) => [round3(x + dx), round3(y + dy)];
  return (marks || []).map((m) => ({
    ...m,
    box: {
      x0: round3(m.box.x0 + dx),
      y0: round3(m.box.y0 + dy),
      x1: round3(m.box.x1 + dx),
      y1: round3(m.box.y1 + dy),
    },
    numeral: m.numeral
      ? {
          ...m.numeral,
          x: round3(m.numeral.x + dx),
          y: round3(m.numeral.y + dy),
        }
      : null,
    wedge: m.wedge
      ? { ...m.wedge, x: round3(m.wedge.x + dx), y: round3(m.wedge.y + dy) }
      : null,
    lead: m.lead ? m.lead.map(at) : m.lead,
  }));
}

const overlapsPlate = (b, p) =>
  b.x1 > p.x && b.x0 < p.x + p.w && b.y1 > p.y && b.y0 < p.y + p.h;

/**
 * The model's wedge rows for one plate: "x:y:n" per wedge that reaches the
 * plate, its front foot's middle in tenths of a millimeter from the plate's
 * bottom left (y up). The model cuts each wedge to its plate, so one across
 * a seam is whole when the plates are put together.
 *
 * @param {object[]} marks - in the frame `plate` is in
 * @param {{x: number, y: number, w: number, h: number}} plate
 * @returns {string}
 */
export function wedgeRows(marks, plate) {
  const tenths = (v) => String(Math.round(v * 10));
  return (marks || [])
    .filter((m) => m.wedge)
    .filter((m) =>
      overlapsPlate(
        {
          x0: m.wedge.x - m.wedge.w / 2,
          x1: m.wedge.x + m.wedge.w / 2,
          y0: m.wedge.y - m.wedge.depth,
          y1: m.wedge.y,
        },
        plate
      )
    )
    .map(
      (m) =>
        `${tenths(m.wedge.x - plate.x)}:${tenths(plate.h - (m.wedge.y - plate.y))}:${m.number}`
    )
    .join('|');
}

/**
 * The numerals as raised-word rows of the sheet (sheet.js `rowsText`): "#n",
 * centered on x, the baseline y up from the sheet's bottom, standing on the
 * level under it.
 *
 * @param {object[]} marks - in the sheet's frame
 * @param {number} sheetH
 * @param {(level: number) => number} zOf - a level's top above the base (mm)
 * @returns {Array<{x: number, y: number, h: number, z: number, text: string}>}
 */
export function numeralRows(marks, sheetH, zOf = () => 0) {
  return (marks || [])
    .filter((m) => m.numeral)
    .map((m) => ({
      x: m.numeral.x,
      y: round3(sheetH - m.numeral.y),
      h: m.numeral.capMm,
      z: m.numeral.standsOn ? round3(zOf(m.numeral.standsOn)) : 0,
      text: `#${m.number}`,
    }));
}

/**
 * The marks that reach a plate, moved into its frame (y down).
 *
 * @param {object[]} marks
 * @param {{x: number, y: number, w: number, h: number}} plate
 */
export function plateMarks(marks, plate) {
  return moveMarks(
    (marks || []).filter((m) =>
      overlapsPlate(
        m.wedge
          ? {
              x0: Math.min(m.box.x0, m.wedge.x - m.wedge.w / 2),
              x1: Math.max(m.box.x1, m.wedge.x + m.wedge.w / 2),
              y0: Math.min(m.box.y0, m.wedge.y - m.wedge.depth),
              y1: m.box.y1,
            }
          : m.box,
        plate
      )
    ),
    [-plate.x, -plate.y]
  );
}

/**
 * The braille on a wedge as dots seen on a flat page: the face laid down on
 * the wedge's footprint, read left to right, its first row of dots toward
 * the back. For the paper and the PDF, so a sighted helper reads it where it
 * stands. Each dot's center, in the mark's frame.
 *
 * @param {{ x: number, y: number, depth: number, cells?: number[][] }} wedge
 * @param {number|number[][]} [what] - a number or cells; else the wedge's own
 * @returns {Array<[number, number]>}
 */
export function wedgeDots(wedge, what = wedge.cells) {
  const cells = Array.isArray(what) ? what : wedgeCells(what);
  const p = WEDGE.dotPitchMm;
  const x0 = wedge.x - ((cells.length - 1) * WEDGE.cellPitchMm) / 2;
  const middle = wedge.y - wedge.depth / 2;
  const out = [];
  cells.forEach((dots, i) => {
    for (const k of dots) {
      const col = k <= 3 ? -1 : 1;
      const row = (k - 1) % 3;
      out.push([
        round3(x0 + i * WEDGE.cellPitchMm + (col * p) / 2),
        round3(middle + (row - 1) * p),
      ]);
    }
  });
  return out;
}
