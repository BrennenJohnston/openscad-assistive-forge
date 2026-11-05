/**
 * Labels on the map: a channel for braille label tape beside each named
 * place the map shows, laid in when the map is built (the plan the editor
 * edits keeps none of them).
 *
 * A place whose name fits a label (map-key.js LABEL_CELLS) gets a channel
 * for its name; a longer name gets a 2-cell channel for its key, the full
 * name in the key (BANA 2022 8.5.10). A channel stands beside the symbol,
 * right, left, below, above or at a corner, the first that keeps 3 mm from
 * every symbol, line, area, title and other channel (BANA 2022 8.5.3; the
 * levels builder's channelKeepClearMm). A place whose name fits but finds
 * no room tries its 2-cell key; a place with no room at all is said in a
 * warning and is in the key. The most important places are placed first
 * (map-key.js namedPoints), so they get the room.
 *
 * No DOM here: a worker may import this file.
 *
 * @license GPL-3.0-or-later
 */
import { keyFor, labelCells, LABEL_CELLS, namedPoints } from './map-key.js';
import { featureNames } from './feature-names.js';
import { buildLevelRings, DEFAULT_SETTINGS } from './levels-svg.js';

/** A braille labeler's cell pitch on tape (ADA 703.3.1: 6.1 to 7.6 mm). */
export const LABEL_CELL_MM = 6.2;
/** Tape beyond the cells at each end of a label. */
export const LABEL_END_MM = 4;
/** A channel's length for a label of `cells` cells. */
export const channelLengthMm = (cells) =>
  Math.round((cells * LABEL_CELL_MM + 2 * LABEL_END_MM) * 10) / 10;

/** A channel keeps this far inside the plate's edge. */
const EDGE_MM = 2;

const rect = (cx, cy, hw, hh) => ({
  x0: cx - hw,
  y0: cy - hh,
  x1: cx + hw,
  y1: cy + hh,
});

function rectRect(a, b) {
  const dx = Math.max(0, b.x0 - a.x1, a.x0 - b.x1);
  const dy = Math.max(0, b.y0 - a.y1, a.y0 - b.y1);
  return Math.hypot(dx, dy);
}

function pointRect([x, y], r) {
  const dx = Math.max(r.x0 - x, 0, x - r.x1);
  const dy = Math.max(r.y0 - y, 0, y - r.y1);
  return Math.hypot(dx, dy);
}

function pointSegment(p, a, b) {
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

function segmentsCross(a, b, c, d) {
  const cross = (o, p, q) =>
    (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

const corners = (r) => [
  [r.x0, r.y0],
  [r.x1, r.y0],
  [r.x1, r.y1],
  [r.x0, r.y1],
];

/** How far a segment is from a rectangle; 0 where they meet. */
function segmentRect(a, b, r) {
  if (pointRect(a, r) === 0 || pointRect(b, r) === 0) return 0;
  const c = corners(r);
  for (let i = 0; i < 4; i += 1) {
    if (segmentsCross(a, b, c[i], c[(i + 1) % 4])) return 0;
  }
  return Math.min(
    pointRect(a, r),
    pointRect(b, r),
    ...c.map((p) => pointSegment(p, a, b))
  );
}

function insideRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i];
    const b = ring[j];
    if (
      a[1] > y !== b[1] > y &&
      x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/** The things a channel keeps clear of, from the features that are on. */
function obstaclesOf(plan, s, textBoxes) {
  const out = [];
  const classes = s.classes || {};
  for (const f of plan.features || []) {
    if (f.on === false) continue;
    const cls = classes[f.class] || {};
    if (f.kind === 'point') {
      const h = (f.size ?? s.symbolSizeMm) / 2;
      out.push({ rect: rect(f.at[0], f.at[1], h, h) });
    } else if (f.kind === 'line' && Array.isArray(f.points)) {
      const half = (f.width ?? cls.width ?? 1.5) / 2;
      for (let i = 1; i < f.points.length; i += 1) {
        out.push({ seg: [f.points[i - 1], f.points[i]], half });
      }
    } else if (f.kind === 'area' && Array.isArray(f.ring)) {
      out.push({ ring: f.ring });
    } else if (f.kind === 'channel' && Array.isArray(f.at)) {
      const across = s.tapeWidthMm + s.channelClearanceMm;
      const half = f.vertical
        ? [across / 2, f.length / 2]
        : [f.length / 2, across / 2];
      out.push({ rect: rect(f.at[0], f.at[1], half[0], half[1]) });
    }
  }
  for (const b of textBoxes || []) {
    out.push({
      rect: { x0: b.x, y0: b.y, x1: b.x + b.width, y1: b.y + b.height },
    });
  }
  return out;
}

function clearance(r, obstacles) {
  let best = Infinity;
  for (const o of obstacles) {
    let d;
    if (o.rect) d = rectRect(r, o.rect);
    else if (o.seg) d = segmentRect(o.seg[0], o.seg[1], r) - o.half;
    else {
      const ring = o.ring;
      if (
        corners(r).some((p) => insideRing(p, ring)) ||
        ring.some((p) => pointRect(p, r) === 0)
      ) {
        d = 0;
      } else {
        d = Infinity;
        for (let i = 0; i < ring.length; i += 1) {
          d = Math.min(d, segmentRect(ring[i], ring[(i + 1) % ring.length], r));
        }
      }
    }
    if (d < best) best = d;
    if (best <= 0) return best;
  }
  return best;
}

/**
 * The places a channel `length` long may stand beside a symbol: right,
 * left, below, above, then the four corners.
 */
function candidates([x, y], half, length, across, gap) {
  const sideX = half + gap + length / 2;
  const sideY = half + gap + across / 2;
  return [
    [x + sideX, y],
    [x - sideX, y],
    [x, y + sideY],
    [x, y - sideY],
    [x + sideX, y + sideY],
    [x + sideX, y - sideY],
    [x - sideX, y + sideY],
    [x - sideX, y - sideY],
  ];
}

/**
 * The plan with its label channels, the labels, the key that goes with
 * them and the warnings.
 *
 * @param {object} plan
 * @param {object} [settings] - the levels builder's
 * @param {{ grade: string, measured: boolean, of: (text: string) => {cells: number, braille: string, measured: boolean, grade: string} }} [settings.tape] -
 *   the tape measure's view (tape-cells.js); without one the cells are estimated
 * @returns {{ plan: object, labels: Array<{featureId: string, text: string, cells: number, braille: string, measured: boolean, grade: string|null, name: string}>, key: object, warnings: Array<{code: string, featureId: string, text: string}> }}
 */
export function labelPlan(plan, settings = {}) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const keep = s.channelKeepClearMm;
  const across = s.tapeWidthMm + s.channelClearanceMm;
  const { textBoxes } = buildLevelRings(plan, s);
  const obstacles = obstaclesOf(plan, s, textBoxes);
  const { w, h } = plan.size;

  const tryPlace = (f, cells) => {
    const length = channelLengthMm(cells);
    const half = (f.size ?? s.symbolSizeMm) / 2;
    for (const [cx, cy] of candidates(f.at, half, length, across, keep + 0.2)) {
      const r = rect(cx, cy, length / 2, across / 2);
      if (r.x0 < EDGE_MM || r.y0 < EDGE_MM) continue;
      if (r.x1 > w - EDGE_MM || r.y1 > h - EDGE_MM) continue;
      if (clearance(r, obstacles) < keep) continue;
      obstacles.push({ rect: r });
      return { at: [round(cx), round(cy)], length };
    }
    return null;
  };

  // The cells a text takes on tape: the braille translator's count when the
  // settings carry the tape measure (tape-cells.js), the estimate otherwise.
  const measure = s.tape?.of
    ? (text) => s.tape.of(text)
    : (text) => ({
        cells: labelCells(text),
        braille: '',
        measured: false,
        grade: null,
      });

  const needsKey = new Set();
  const placed = [];
  const unplaced = [];
  for (const f of namedPoints(plan)) {
    const cells = measure(f.name).cells;
    if (cells <= LABEL_CELLS) {
      const spot = tryPlace(f, cells);
      if (spot) {
        placed.push({ f, spot, mode: 'name', cells });
        continue;
      }
    }
    needsKey.add(f.id);
    const spot = tryPlace(f, 2);
    if (spot) placed.push({ f, spot, mode: 'key', cells: 2 });
    else unplaced.push(f);
  }

  const key = keyFor(plan, s, { needsKey });
  const letters = new Map(key.abbreviations.map((a) => [a.featureId, a.key]));
  const names = featureNames(plan.features || []);
  const said = new Map((plan.features || []).map((f, i) => [f.id, names[i]]));
  const labels = [];
  const channels = [];
  for (const { f, spot, mode, cells } of placed) {
    const text = mode === 'name' ? f.name : letters.get(f.id);
    if (!text) continue;
    const m = measure(text);
    labels.push({
      featureId: f.id,
      text,
      cells,
      braille: m.braille,
      measured: m.measured,
      grade: m.grade,
      lengthMm: spot.length,
      name: said.get(f.id),
    });
    channels.push({
      id: `label-${f.id}`,
      class: 'channel',
      kind: 'channel',
      at: spot.at,
      length: spot.length,
      on: true,
    });
  }
  const warnings = unplaced.map((f) => ({
    code: 'no-room-for-label',
    featureId: f.id,
    text: `No room for ${said.get(f.id)}'s label; it is in the key as ${letters.get(f.id)}.`,
  }));
  return {
    plan: { ...plan, features: [...(plan.features || []), ...channels] },
    labels,
    key: { ...key, labels },
    warnings,
  };
}

function round(v) {
  return Math.round(v * 1000) / 1000;
}
