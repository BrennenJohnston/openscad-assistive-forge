/**
 * What a reader steers by stays clear.
 *
 * The north cue is drawn by the model at the plate's top right (or along its
 * top edge), wherever the map falls, so a symbol or a building could stand on
 * it. The US National Park Service's tactile map guidelines ask that the arrow
 * have nothing around it but its label, and that is the rule here: lines and
 * areas stop short of the cue, by the 9.525 mm raised letters keep, and a
 * symbol in the way moves out. A symbol on the destination or on You are here
 * moves off too, the map's own 3 mm from them; those two marks move only for
 * the cue, since the arrow has nowhere else to be.
 *
 * Positions on a tactile map are relative, and a short move keeps a symbol
 * beside what it marks. The panel says what moved, in one sentence.
 *
 * Zones are in the sheet's frame, millimeters, y down, the top left at the
 * origin. No DOM here: a worker may import this file.
 *
 * @license GPL-3.0-or-later
 */

import { difference } from '../ring-geometry.js';
import { SHEET_CLEARANCE_MM } from './sheet.js';

/**
 * The arrow the model draws (tactile_map.scad, `north_arrow_2d`): the N, a gap,
 * a head whose tip is 40 degrees, and the shaft, in a column 14 mm wide,
 * 9.525 mm in from the plate's edges. A test holds these to the model's.
 */
export const NORTH_ARROW_MM = Object.freeze({
  edge: 9.525,
  width: 14,
  letter: 16,
  gap: 3,
  headWidth: 10,
  shaft: 30,
});

/** The model's north line: its thickness, as far in from the edge as the arrow. */
export const NORTH_LINE_MM = 2;

/** What the cue keeps around it (mm), the clearance raised letters keep. */
export const NORTH_CLEARANCE_MM = SHEET_CLEARANCE_MM;

/** The classes a reader steers by: other symbols stay off them. */
const MARKS = new Set(['destination', 'you-are-here']);

const EPS = 1e-6;

function arrowHeight() {
  const { letter, gap, headWidth, shaft } = NORTH_ARROW_MM;
  const head = headWidth / 2 / Math.tan((20 * Math.PI) / 180);
  return letter + gap + head + shaft;
}

/**
 * The places the north cue takes on a sheet, with their clearance. A plate's
 * top edge is where the model draws it, so a title on plates of its own adds
 * the top of the first plate of the map to the sheet's top.
 *
 * @param {object} args
 * @param {number} args.sheetW - The sheet's width (mm)
 * @param {string} args.cue - The tile's north_cue
 * @param {number[]} [args.plateTops] - Each y a cue can be drawn from
 * @param {number} [args.clearanceMm]
 * @returns {Array<{x0: number, y0: number, x1: number, y1: number}>}
 */
export function northZones({
  sheetW,
  cue,
  plateTops = [0],
  clearanceMm = NORTH_CLEARANCE_MM,
}) {
  if (cue === 'None' || !cue) return [];
  const { edge, width } = NORTH_ARROW_MM;
  return plateTops.map((top) =>
    cue === 'North line'
      ? {
          x0: 0,
          y0: top,
          x1: sheetW,
          y1: top + edge + NORTH_LINE_MM + clearanceMm,
        }
      : {
          x0: sheetW - edge - width - clearanceMm,
          y0: top,
          x1: sheetW,
          y1: top + edge + arrowHeight() + clearanceMm,
        }
  );
}

function halfOf(f, { symbolSizeMm, channelAcrossMm }) {
  if (f.kind === 'channel') {
    const across = channelAcrossMm / 2;
    const along = f.length / 2;
    return f.vertical ? [across, along] : [along, across];
  }
  const half = (f.size ?? symbolSizeMm) / 2;
  return [half, half];
}

const overlaps = ([x, y], [hx, hy], o) =>
  x + hx > o.x0 + EPS &&
  x - hx < o.x1 - EPS &&
  y + hy > o.y0 + EPS &&
  y - hy < o.y1 - EPS;

const grown = ([x, y], [hx, hy], by) => ({
  x0: x - hx - by,
  y0: y - hy - by,
  x1: x + hx + by,
  y1: y + hy + by,
});

/**
 * The nearest place for a box out of every hard obstacle, in bounds, and off
 * the soft ones when a way exists. Sides of the obstacles it meets are the
 * only places worth trying, three steps deep; null when there is none.
 */
function escape(start, half, hard, soft, bounds) {
  const [hx, hy] = half;
  const inBounds = ([x, y]) =>
    x - hx >= bounds.x0 - EPS &&
    x + hx <= bounds.x1 + EPS &&
    y - hy >= bounds.y0 - EPS &&
    y + hy <= bounds.y1 + EPS;
  const clearOf = (p, list) => !list.some((o) => overlaps(p, half, o));
  const seen = new Set();
  let best = null;
  let fallback = null;
  let frontier = [start];
  for (let depth = 0; depth < 3; depth += 1) {
    const next = [];
    for (const p of frontier) {
      for (const o of [...hard, ...soft]) {
        if (!overlaps(p, half, o)) continue;
        for (const q of [
          [o.x0 - hx, p[1]],
          [o.x1 + hx, p[1]],
          [p[0], o.y0 - hy],
          [p[0], o.y1 + hy],
        ]) {
          const id = `${q[0].toFixed(4)},${q[1].toFixed(4)}`;
          if (seen.has(id) || !inBounds(q)) continue;
          seen.add(id);
          next.push(q);
          if (!clearOf(q, hard)) continue;
          const mm = Math.hypot(q[0] - start[0], q[1] - start[1]);
          if (clearOf(q, soft)) {
            if (!best || mm < best.mm) best = { at: q, mm };
          } else if (!fallback || mm < fallback.mm) {
            fallback = { at: q, mm };
          }
        }
      }
    }
    if (best) break;
    frontier = next;
  }
  return best || fallback;
}

/**
 * The plan's features with the zones and the marks kept clear. Hands back the
 * same array when nothing moved.
 *
 * @param {object[]} features - In the plan's frame
 * @param {object} options
 * @param {Array<{x0: number, y0: number, x1: number, y1: number}>} options.zones - In the plan's frame
 * @param {number} options.symbolSizeMm
 * @param {number} options.gapMm - What other symbols keep from a mark
 * @param {{x0: number, y0: number, x1: number, y1: number}} options.bounds - Where a symbol may stand
 * @param {number} options.channelAcrossMm - A label channel's width
 * @returns {{ features: object[], moved: Array<{id: string, mm: number}> }}
 */
export function keepClear(features, options) {
  const { zones = [], gapMm, bounds } = options;
  const at = new Map();
  const moved = [];
  const live = features.filter((f) => f.on !== false);
  const points = live.filter((f) => f.kind === 'point' && Array.isArray(f.at));
  const whereIs = (f) => at.get(f.id) || f.at;
  const move = (f, hard, soft) => {
    const half = halfOf(f, options);
    const from = whereIs(f);
    if (!hard.some((o) => overlaps(from, half, o))) return;
    const out = escape(from, half, hard, soft, bounds);
    if (!out) return;
    at.set(f.id, out.at);
    moved.push({ id: f.id, mm: out.mm });
  };

  const marks = points.filter((f) => MARKS.has(f.class));
  const others = points.filter((f) => !MARKS.has(f.class));
  for (const f of marks) move(f, zones, []);
  const markBoxes = marks.map((f) =>
    grown(whereIs(f), halfOf(f, options), gapMm)
  );
  for (const f of others) {
    const soft = others
      .filter((g) => g !== f)
      .map((g) => grown(whereIs(g), halfOf(g, options), gapMm));
    move(f, [...zones, ...markBoxes], soft);
  }

  // A label channel goes with its symbol; then it keeps out of the zones
  // itself. It is not a symbol, so the sentence does not count it.
  const carried = new Map();
  for (const f of live.filter((x) => x.kind === 'channel')) {
    const parent = points.find((p) => `label-${p.id}` === f.id);
    const shift = parent && at.get(parent.id);
    let pos = f.at;
    if (shift) {
      pos = [
        f.at[0] + shift[0] - parent.at[0],
        f.at[1] + shift[1] - parent.at[1],
      ];
    }
    const half = halfOf(f, options);
    if (zones.some((o) => overlaps(pos, half, o))) {
      const out = escape(pos, half, zones, [], bounds);
      if (out) pos = out.at;
    }
    if (pos !== f.at) carried.set(f.id, pos);
  }

  if (at.size === 0 && carried.size === 0) return { features, moved: [] };
  return {
    features: features.map((f) =>
      at.has(f.id) || carried.has(f.id)
        ? { ...f, at: at.get(f.id) || carried.get(f.id) }
        : f
    ),
    moved,
  };
}

/**
 * What moved, in one sentence, or null. A11Y.
 *
 * @param {Array<{id: string, mm: number}>} moved
 * @returns {string|null}
 */
export function keptClearNote(moved) {
  if (!moved.length) return null;
  const say = (n) => String(Math.round(n * 10) / 10);
  const why = 'to keep the north arrow and the marks clear.';
  if (moved.length === 1)
    return `One symbol moved ${say(moved[0].mm)} mm ${why}`;
  const most = Math.max(...moved.map((m) => m.mm));
  return `${moved.length} symbols moved up to ${say(most)} mm ${why}`;
}

/**
 * Every group's rings with the zones taken out. A group that never reaches a
 * zone keeps its rings as they are.
 *
 * @param {Record<string, Array<Array<{x: number, y: number}>>>} rings - In the zones' frame
 * @param {Array<{x0: number, y0: number, x1: number, y1: number}>} zones
 * @returns {Record<string, Array<Array<{x: number, y: number}>>>}
 */
export function cutZones(rings, zones) {
  if (!zones.length) return rings;
  const clip = zones.map((z) => [
    { x: z.x0, y: z.y0 },
    { x: z.x1, y: z.y0 },
    { x: z.x1, y: z.y1 },
    { x: z.x0, y: z.y1 },
  ]);
  const reaches = (ring) => {
    const xs = ring.map((p) => p.x);
    const ys = ring.map((p) => p.y);
    const box = {
      x0: Math.min(...xs),
      y0: Math.min(...ys),
      x1: Math.max(...xs),
      y1: Math.max(...ys),
    };
    return zones.some(
      (z) => box.x1 > z.x0 && box.x0 < z.x1 && box.y1 > z.y0 && box.y0 < z.y1
    );
  };
  const out = {};
  for (const key of Object.keys(rings)) {
    const group = rings[key] || [];
    out[key] = group.some(reaches) ? difference(group, clip) : group;
  }
  return out;
}
