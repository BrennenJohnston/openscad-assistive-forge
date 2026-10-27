/**
 * The plate splitter: a map cut into equal plates that fit a print bed,
 * each with a name and its own levels file.
 *
 * A 480 x 360 mm map on a 256 x 256 mm bed becomes four plates of 240 x
 * 180 mm, named A1, A2, B1, B2: the row letter counts down from the top
 * edge (A at the top), the column number across from the left (1 at the
 * left), so the names read like a page. My own hand-cut station maps were
 * numbered from the right; this module numbers from the left, and the
 * assembly guide's picture shows which way round.
 *
 * Every plate is the same size, the fewest that fit the bed less a 2 mm
 * margin each side, with the bed tried both ways round. A plate's levels
 * file is the map's rings clipped to the plate's rectangle and moved to the
 * plate's own corner, so the Tactile Map tile prints it as a map of its
 * own; a fragment under 1 mm on its longer side, left by a cut through a
 * corner, is dropped and counted rather than printed as a speck.
 *
 * A plate can carry its name: as notches on the bottom edge a finger can
 * count, one notch per row letter and one dot per column number, cut right
 * through the plate (the levels file's cutouts group, which the tile cuts
 * through everything), or as a 10 mm strip along its bottom edge for 6 mm
 * raised letters (the tile draws the letters from a parameter; this file
 * only reserves the box).
 *
 * No DOM here: a worker may import this file.
 *
 * @license GPL-3.0-or-later
 */

import { intersect, areaOf } from '../ring-geometry.js';
import { levelsSvgFromRings } from './levels-svg.js';

/** The beds offered, in the order the menu shows them. */
export const BED_PRESETS = [
  {
    key: 'x1c',
    name: 'Bambu Lab X1C, P1S or P1P (256 x 256 mm)',
    w: 256,
    d: 256,
  },
  { key: 'a1', name: 'Bambu Lab A1 (256 x 256 mm)', w: 256, d: 256 },
  { key: 'a1-mini', name: 'Bambu Lab A1 mini (180 x 180 mm)', w: 180, d: 180 },
  {
    key: 'mk4s',
    name: 'Prusa MK4S, MK4 or MK3S (250 x 210 mm)',
    w: 250,
    d: 210,
  },
  { key: 'mini', name: 'Prusa MINI (180 x 180 mm)', w: 180, d: 180 },
  { key: 'xl', name: 'Prusa XL (360 x 360 mm)', w: 360, d: 360 },
  {
    key: 'ender3',
    name: 'Creality Ender 3 family (220 x 220 mm)',
    w: 220,
    d: 220,
  },
  { key: 'k1max', name: 'Creality K1 Max (300 x 300 mm)', w: 300, d: 300 },
  { key: 'custom', name: 'Custom size', w: null, d: null },
];

/** How a plate carries its name, the default first. */
export const ID_STYLES = [
  { key: 'notches', name: 'Notches on the bottom edge' },
  { key: 'margin', name: 'Raised letters in the margin' },
];

/**
 * The smallest plate the Tactile Map tile accepts: its map_width_mm and
 * map_height_mm minimums, in millimeters. A test keeps the two equal.
 */
export const PLATE_MIN_MM = { w: 100, h: 75 };

/** Kept clear of the bed's edges on every side. */
export const PLATE_MARGIN_MM = 2;
/** The strip for raised letters along a plate's bottom edge. */
export const ID_MARGIN_STRIP_MM = 10;
/** The raised letters' capital height in that strip. */
export const ID_LETTER_MM = 6;
/** A clipped fragment shorter than this on its longer side is dropped. */
export const SLIVER_MM = 1.0;

const NOTCH_W = 3;
const NOTCH_DEPTH = 2;
const NOTCH_PITCH = 6;
const DOT_D = 2;
const DOT_GAP = 12;
const DISC_SEGMENTS = 24;
const LETTER_ADVANCE = 0.85;

const pt = (x, y) => ({ x, y });

function positive(ring) {
  return areaOf(ring) < 0 ? [...ring].reverse() : ring;
}

function rectRing(x0, y0, x1, y1) {
  return positive([pt(x0, y0), pt(x1, y0), pt(x1, y1), pt(x0, y1)]);
}

function discRing(cx, cy, r) {
  const ring = [];
  for (let i = 0; i < DISC_SEGMENTS; i++) {
    const a = (2 * Math.PI * i) / DISC_SEGMENTS;
    ring.push(pt(cx + r * Math.cos(a), cy + r * Math.sin(a)));
  }
  return positive(ring);
}

/** The row letter for a row index from 0: A, B, ... Z, AA, AB. */
export function rowLetter(index) {
  let n = index;
  let s = '';
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

/** A plate id back to its row and column indexes from 0. */
export function plateIdParts(id) {
  const m = /^([A-Z]+)(\d+)$/.exec(String(id));
  if (!m) return null;
  let row = 0;
  for (const ch of m[1]) row = row * 26 + (ch.charCodeAt(0) - 64);
  return { row: row - 1, col: Number(m[2]) - 1 };
}

function layoutFor(w, h, bedW, bedD, marginMm, rotated) {
  const usableW = Math.max(1, bedW - 2 * marginMm);
  const usableD = Math.max(1, bedD - 2 * marginMm);
  const cols = Math.max(1, Math.ceil(w / usableW - 1e-9));
  const rows = Math.max(1, Math.ceil(h / usableD - 1e-9));
  return {
    rows,
    cols,
    plateW: w / cols,
    plateH: h / rows,
    rotated,
    bedW,
    bedD,
  };
}

/**
 * Cut a map into equal plates for a bed.
 *
 * @param {{ w: number, h: number, bed: { w: number, d: number }, marginMm?: number }} args
 * @returns {{ rows: number, cols: number, plateW: number, plateH: number, rotated: boolean, bed: { w: number, d: number }, plates: Array<{ id: string, row: number, col: number, x: number, y: number, w: number, h: number }> }}
 */
export function planPlates({ w, h, bed, marginMm = PLATE_MARGIN_MM }) {
  const straight = layoutFor(w, h, bed.w, bed.d, marginMm, false);
  const turned = layoutFor(w, h, bed.d, bed.w, marginMm, true);
  const count = (l) => l.rows * l.cols;
  const area = (l) => l.plateW * l.plateH;
  let best = straight;
  if (count(turned) < count(straight)) best = turned;
  else if (
    count(turned) === count(straight) &&
    area(turned) > area(straight) + 1e-9
  )
    best = turned;
  const plates = [];
  for (let r = 0; r < best.rows; r++) {
    for (let c = 0; c < best.cols; c++) {
      plates.push({
        id: `${rowLetter(r)}${c + 1}`,
        row: r,
        col: c,
        x: c * best.plateW,
        y: r * best.plateH,
        w: best.plateW,
        h: best.plateH,
      });
    }
  }
  return {
    rows: best.rows,
    cols: best.cols,
    plateW: best.plateW,
    plateH: best.plateH,
    rotated: best.rotated,
    bed: { w: best.bedW, d: best.bedD },
    plates,
  };
}

function longerSide(ring) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of ring) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return Math.max(maxX - minX, maxY - minY);
}

/**
 * One plate's levels file: the map's rings clipped to the plate and moved
 * to its corner, with the plate's name as a margin box or as notches.
 *
 * @param {Record<string, Array<Array<{x: number, y: number}>>>} levelRings - From buildLevelRings
 * @param {{ id: string, x: number, y: number, w: number, h: number }} plate - From planPlates
 * @param {{ id?: 'margin' | 'notches' | 'none' }} [options]
 * @returns {{ svg: string, dropped: number, size: { w: number, h: number }, plateId: string, idStyle: string }}
 */
export function plateLevelsSvg(levelRings, plate, options = {}) {
  const idStyle = options.id || 'none';
  const clip = [
    rectRing(plate.x, plate.y, plate.x + plate.w, plate.y + plate.h),
  ];
  const rings = {};
  let dropped = 0;
  for (const key of Object.keys(levelRings)) {
    const source = levelRings[key] || [];
    const cut = source.length ? intersect(source, clip) : [];
    const kept = [];
    for (const ring of cut) {
      const moved = ring.map((p) => pt(p.x - plate.x, p.y - plate.y));
      if (longerSide(moved) < SLIVER_MM) dropped++;
      else kept.push(moved);
    }
    rings[key] = kept;
  }
  if (!rings.channels) rings.channels = [];
  if (!rings.cutouts) rings.cutouts = [];

  const size = { w: plate.w, h: plate.h };
  const textBoxes = [];
  const parts = plateIdParts(plate.id) || { row: 0, col: 0 };

  if (idStyle === 'notches') {
    // One notch per row letter (A is one), at a 6 mm pitch from the left;
    // then a 12 mm gap and one dot per column number, in the cutouts group
    // the tile cuts right through the plate. Each reaches past the bottom
    // edge so the cut meets it cleanly.
    const notches = parts.row + 1;
    for (let i = 1; i <= notches; i++) {
      const x0 = NOTCH_PITCH * i;
      rings.cutouts.push(
        rectRing(x0, plate.h - NOTCH_DEPTH, x0 + NOTCH_W, plate.h + 0.5)
      );
    }
    const dotsStart = NOTCH_PITCH * notches + NOTCH_W + DOT_GAP;
    for (let j = 0; j <= parts.col; j++) {
      rings.cutouts.push(
        discRing(
          dotsStart + DOT_D / 2 + NOTCH_PITCH * j,
          plate.h - NOTCH_DEPTH,
          DOT_D / 2
        )
      );
    }
  } else if (idStyle === 'margin') {
    size.h = plate.h + ID_MARGIN_STRIP_MM;
    const width = plate.id.length * ID_LETTER_MM * LETTER_ADVANCE;
    textBoxes.push({
      x: plate.w / 2 - width / 2,
      y: plate.h + (ID_MARGIN_STRIP_MM - ID_LETTER_MM) / 2,
      width,
      height: ID_LETTER_MM,
    });
  }

  return {
    svg: levelsSvgFromRings(rings, size, textBoxes),
    dropped,
    size,
    plateId: plate.id,
    idStyle,
  };
}
