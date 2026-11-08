/**
 * The sheet: what the plate prints around the map face.
 *
 * A blank band of at least 10 mm runs round the face (Gardiner and Perkins'
 * clear margin; BANA 2022 puts the title in the upper part of the map and
 * keeps raised text clear of the map's edge), and the title stands above
 * the face on a band of its own, each line at the sign's pitch with the
 * ADA 703 clearance above and below, wrapped to the face's width at the
 * title's capital height, the band rounded up to whole millimeters. The
 * title may instead stand inside the face's top edge, as the model drew it
 * before, or be left out.
 *
 * Geometry here is the plan's: millimeters, y down, the sheet's top left at
 * the origin. The model's rows (`raised_words`) are written y up from the
 * sheet's bottom left, in tenths of a millimeter, by `rowsText`.
 *
 * No DOM here: a worker may import this file.
 *
 * @license GPL-3.0-or-later
 */

import { LETTER_SPACING, PRINT_PITCH, wrapPrint } from './key-layout.js';
import { PLATE_MIN_MM, planPlates } from './plate-tiling.js';
import { signRowWidthMm } from '../sign-letter-metrics.js';

/** Raised text keeps 9.525 mm (3/8 in) clear (ADA 703.2.7, 703.3.2). */
export const SHEET_CLEARANCE_MM = 9.525;

/**
 * A title line stops this far before a plate seam, so a letter the
 * model draws a little wider than the sign's measure still stands whole.
 */
export const SEAM_CLEAR_MM = 3;

/** The band's width (mm): where it starts, and what the dial allows. */
export const MARGIN_MM = Object.freeze({ start: 10, min: 10, max: 40 });

/** Where the raised title stands, the band first. */
export const TITLE_PLACEMENTS = Object.freeze([
  { key: 'band', name: 'Above the map, on its own band' },
  { key: 'inside', name: "Inside the map's top edge" },
  { key: 'none', name: 'No raised title' },
]);

/** Which way the plate lies for a place map, landscape first. */
export const ORIENTATIONS = Object.freeze([
  { key: 'landscape', name: 'Landscape' },
  { key: 'portrait', name: 'Portrait' },
]);

const round3 = (v) => Math.round(v * 1000) / 1000;

/**
 * The face cut down to what prints: the smallest whole-millimeter box
 * around every ring, cone footprint and letter box, never under the
 * smallest plate the model takes and never past the face. The box grows
 * to the right and down to reach the minimum, and back when the face
 * ends there. The band then goes around the trimmed face as around any
 * face. Nothing printed gives the face back as it is.
 *
 * A view, not a change to the plan: `offset` is what every coordinate
 * subtracts to land on the trimmed face.
 *
 * @param {object} input
 * @param {{ w: number, h: number }} input.face - the plan's face in mm
 * @param {object} input.printed
 * @param {Record<string, Array<Array<{x: number, y: number}>>>} [input.printed.rings]
 * @param {Array<[number, number]>} [input.printed.cones] - cone centers
 * @param {number} [input.printed.coneRadiusMm]
 * @param {Array<{x: number, y: number, width: number, height: number}>} [input.printed.boxes]
 * @param {{ w: number, h: number }} [input.minMm]
 * @returns {{ face: { w: number, h: number }, offset: [number, number], trimmed: boolean }}
 */
export function trimFace({ face, printed = {}, minMm = PLATE_MIN_MM }) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const take = (x, y) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };
  for (const list of Object.values(printed.rings || {})) {
    for (const ring of list || []) for (const p of ring) take(p.x, p.y);
  }
  const r = printed.coneRadiusMm || 0;
  for (const [x, y] of printed.cones || []) {
    take(x - r, y - r);
    take(x + r, y + r);
  }
  for (const b of printed.boxes || []) {
    take(b.x, b.y);
    take(b.x + b.width, b.y + b.height);
  }
  const whole = {
    face: { w: face.w, h: face.h },
    offset: [0, 0],
    trimmed: false,
  };
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return whole;
  const side = (lo, hi, extent, min) => {
    let a = Math.max(0, Math.floor(lo));
    let b = Math.min(extent, Math.ceil(hi));
    if (b - a < min) b = Math.min(extent, a + min);
    if (b - a < min) a = Math.max(0, b - min);
    return [a, b];
  };
  const [x0, x1] = side(minX, maxX, face.w, Math.min(minMm.w, face.w));
  const [y0, y1] = side(minY, maxY, face.h, Math.min(minMm.h, face.h));
  const w = x1 - x0;
  const h = y1 - y0;
  if (x0 === 0 && y0 === 0 && w === face.w && h === face.h) return whole;
  return { face: { w, h }, offset: [x0, y0], trimmed: true };
}

/**
 * The title band for a title: its lines in capitals, wrapped to the face's
 * width at the capital height, and its height; null for no title.
 *
 * @param {string} title
 * @param {number} faceWidthMm
 * @param {number} letterMm - the capital height
 * @returns {{ lines: string[], h: number } | null}
 */
export function titleBandOf(
  title,
  faceWidthMm,
  letterMm,
  minMm = 0,
  wordMaxMm = faceWidthMm
) {
  const text = String(title || '')
    .trim()
    .toUpperCase();
  if (!text) return null;
  const lines = wrapPrint(text, faceWidthMm, letterMm, wordMaxMm);
  if (!lines.length) return null;
  // Rounded up to the millimeter: the tile's sizes are whole millimeters,
  // and a band of 40.65 would reach the model as 41 with the third of a
  // millimeter falling at a plate's top edge.
  return {
    lines,
    h: Math.max(
      Math.ceil(
        lines.length * letterMm * PRINT_PITCH + 2 * SHEET_CLEARANCE_MM - 1e-9
      ),
      minMm
    ),
  };
}

/**
 * The sheet around a face.
 *
 * @param {object} input
 * @param {{ w: number, h: number }} input.face - the map face in mm
 * @param {number} [input.marginMm] - the band, held to MARGIN_MM's range
 * @param {string} [input.title]
 * @param {'band'|'inside'|'none'} [input.placement]
 * @param {number} [input.letterMm] - the title's capital height
 * @param {number} [input.bandMinMm] - the band no shallower than this
 * @param {number} [input.titleWidthMm] - the title wrapped to this, else the face
 * @param {number} [input.titleWordMaxMm] - a lone word may run to this
 * @returns {{
 *   w: number, h: number, face: {w: number, h: number}, marginMm: number,
 *   faceAt: [number, number], band: {left: number, right: number, top: number, bottom: number},
 *   titleBand: {y: number, h: number, lines: string[]} | null, placement: string
 * }}
 */
export function sheetOf({
  face,
  marginMm = MARGIN_MM.start,
  title = '',
  placement = 'band',
  letterMm = 16,
  bandMinMm = 0,
  titleWidthMm = null,
  titleWordMaxMm = null,
}) {
  const m = Math.min(
    MARGIN_MM.max,
    Math.max(MARGIN_MM.min, Number(marginMm) || MARGIN_MM.start)
  );
  const where = TITLE_PLACEMENTS.some((p) => p.key === placement)
    ? placement
    : 'band';
  const band =
    where === 'band'
      ? titleBandOf(
          title,
          titleWidthMm > 0 ? Math.min(titleWidthMm, face.w) : face.w,
          letterMm,
          bandMinMm,
          titleWordMaxMm > 0 ? Math.min(titleWordMaxMm, face.w) : undefined
        )
      : null;
  const bandH = band ? band.h : 0;
  return {
    w: round3(face.w + 2 * m),
    h: round3(face.h + 2 * m + bandH),
    face: { w: face.w, h: face.h },
    marginMm: m,
    faceAt: [m, round3(m + bandH)],
    band: { left: m, right: m, top: m, bottom: m },
    titleBand: band ? { y: m, h: band.h, lines: band.lines } : null,
    placement: where,
  };
}

/**
 * The sheet as the bed cuts it. The title wraps to the first plate column,
 * the margin and SEAM_CLEAR_MM short of the seam, so no letter is cut by
 * one (a word that fits the column only without that reserve stands whole
 * on a line of its own rather than broken); and a band that goes on
 * plates of its own is as deep as those
 * plates, the smallest the model takes, so the plates and the board agree.
 * Each answer can change the other (more lines, a deeper band, a row of
 * its own), so the sheet is planned again until it holds still.
 *
 * @param {Parameters<typeof sheetOf>[0]} input
 * @param {{ w: number, d: number }} bed
 * @returns {ReturnType<typeof sheetOf>}
 */
export function sheetOnBed(input, bed) {
  let sheet = sheetOf(input);
  if (!sheet.titleBand) return sheet;
  for (let pass = 0; pass < 4; pass += 1) {
    const layout = planPlates({
      w: sheet.w,
      h: sheet.h,
      bed,
      titleBandMm: sheet.titleBand.h,
    });
    const next = sheetOf({
      ...input,
      titleWidthMm:
        layout.cols > 1 ? layout.plateW - sheet.marginMm - SEAM_CLEAR_MM : null,
      titleWordMaxMm:
        layout.cols > 1 ? layout.plateW - sheet.marginMm - 0.5 : null,
      bandMinMm: layout.titlePlates.length ? PLATE_MIN_MM.h : 0,
    });
    const same =
      next.h === sheet.h &&
      next.titleBand.h === sheet.titleBand.h &&
      next.titleBand.lines.join('|') === sheet.titleBand.lines.join('|');
    sheet = next;
    if (same) break;
  }
  return sheet;
}

/**
 * The rings moved by an offset: the face's rings into the sheet's frame.
 *
 * @param {Record<string, Array<Array<{x: number, y: number}>>>} rings
 * @param {[number, number]} offset
 * @returns {Record<string, Array<Array<{x: number, y: number}>>>}
 */
export function shiftRings(rings, [dx, dy]) {
  const out = {};
  for (const key of Object.keys(rings || {})) {
    out[key] = (rings[key] || []).map((ring) =>
      ring.map((p) => ({ x: p.x + dx, y: p.y + dy }))
    );
  }
  return out;
}

/**
 * The title band's lines as the model's rows: each line's baseline start
 * at the face's left, y up from the sheet's bottom, the capital height,
 * standing on the base.
 *
 * @param {ReturnType<typeof sheetOf>} sheet
 * @param {number} letterMm
 * @returns {Array<{x: number, y: number, h: number, z: number, text: string}>}
 */
export function titleRows(sheet, letterMm) {
  const band = sheet.titleBand;
  if (!band) return [];
  return band.lines.map((text, i) => {
    const top = band.y + SHEET_CLEARANCE_MM + i * letterMm * PRINT_PITCH;
    return {
      x: sheet.faceAt[0],
      y: round3(sheet.h - (top + letterMm)),
      h: letterMm,
      z: 0,
      text,
    };
  });
}

/**
 * Rows as the model reads them: "x:y:h:z:TEXT" in tenths of a millimeter,
 * split by "|". A "|" in a text becomes "/" so the rows stay apart.
 *
 * @param {Array<{x: number, y: number, h: number, z: number, text: string}>} rows
 * @returns {string}
 */
export function rowsText(rows) {
  const tenths = (v) => String(Math.round(v * 10));
  return (rows || [])
    .map(
      (r) =>
        `${tenths(r.x)}:${tenths(r.y)}:${tenths(r.h)}:${tenths(r.z)}:${String(r.text).replace(/\|/g, '/')}`
    )
    .join('|');
}

/**
 * The rows that reach one plate of the sheet, moved into the plate's
 * frame (y up from the plate's bottom). A row's start may lie left of the
 * plate or its text run past the plate's edge: the model clips the letters
 * to the plate, so a line across a seam continues on the next plate. A
 * row whose letters end before the plate (by the sign's measure, with
 * SEAM_CLEAR_MM to spare) is not the plate's: it would print nothing.
 *
 * @param {Array<{x: number, y: number, h: number, z: number, text: string}>} rows
 * @param {{ x: number, y: number, w: number, h: number }} plate - in the sheet's frame, y down
 * @param {number} sheetH
 * @returns {Array<{x: number, y: number, h: number, z: number, text: string}>}
 */
export function plateRows(rows, plate, sheetH) {
  return (rows || [])
    .filter((r) => {
      // The row's baseline in the sheet's y-down frame; the capital stands
      // above it. Keep the row when any of its height lies on the plate.
      const baseline = sheetH - r.y;
      const top = baseline - r.h;
      if (!(baseline > plate.y && top < plate.y + plate.h)) return false;
      const end =
        r.x +
        signRowWidthMm(String(r.text), {
          charHeightMm: r.h,
          letterSpacing: LETTER_SPACING,
        });
      return r.x < plate.x + plate.w && end + SEAM_CLEAR_MM > plate.x;
    })
    .map((r) => ({
      ...r,
      x: round3(r.x - plate.x),
      y: round3(r.y - (sheetH - (plate.y + plate.h))),
    }));
}
