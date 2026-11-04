/**
 * The sheet: what the plate prints around the map face.
 *
 * A blank band of at least 10 mm runs round the face (Gardiner and Perkins'
 * clear margin; BANA 2022 puts the title in the upper part of the map and
 * keeps raised text clear of the map's edge), and the title stands above
 * the face on a band of its own, each line at the sign's pitch with the
 * ADA 703 clearance above and below, wrapped to the face's width at the
 * title's capital height. The title may instead stand inside the face's top
 * edge, as the model drew it before, or be left out.
 *
 * Geometry here is the plan's: millimeters, y down, the sheet's top left at
 * the origin. The model's rows (`raised_words`) are written y up from the
 * sheet's bottom left, in tenths of a millimeter, by `rowsText`.
 *
 * No DOM here: a worker may import this file.
 *
 * @license GPL-3.0-or-later
 */

import { PRINT_PITCH, wrapPrint } from './key-layout.js';

/** Raised text keeps 9.525 mm (3/8 in) clear (ADA 703.2.7, 703.3.2). */
export const SHEET_CLEARANCE_MM = 9.525;

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
 * The title band for a title: its lines in capitals, wrapped to the face's
 * width at the capital height, and its height; null for no title.
 *
 * @param {string} title
 * @param {number} faceWidthMm
 * @param {number} letterMm - the capital height
 * @returns {{ lines: string[], h: number } | null}
 */
export function titleBandOf(title, faceWidthMm, letterMm) {
  const text = String(title || '')
    .trim()
    .toUpperCase();
  if (!text) return null;
  const lines = wrapPrint(text, faceWidthMm, letterMm);
  if (!lines.length) return null;
  return {
    lines,
    h: round3(lines.length * letterMm * PRINT_PITCH + 2 * SHEET_CLEARANCE_MM),
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
}) {
  const m = Math.min(
    MARGIN_MM.max,
    Math.max(MARGIN_MM.min, Number(marginMm) || MARGIN_MM.start)
  );
  const where = TITLE_PLACEMENTS.some((p) => p.key === placement)
    ? placement
    : 'band';
  const band = where === 'band' ? titleBandOf(title, face.w, letterMm) : null;
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
 * The rows that fall on one plate of the sheet, moved into the plate's
 * frame (y up from the plate's bottom). A row's start may lie left of the
 * plate or its text run past the plate's edge: the model clips the letters
 * to the plate, so a line across a seam continues on the next plate.
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
      return baseline > plate.y && top < plate.y + plate.h;
    })
    .map((r) => ({
      ...r,
      x: round3(r.x - plate.x),
      y: round3(r.y - (sheetH - (plate.y + plate.h))),
    }));
}
