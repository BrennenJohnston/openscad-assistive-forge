/**
 * The key plate's layout: the key (map-key.js) laid out as rows on plates of
 * the map's plate size, for the Tactile Map tile's Key mode.
 *
 * Each row: at the left, the symbol, a piece of the line or a patch of the
 * area at its printed size and height, so a finger learns it as it is on
 * the map (ISO 19028 6.4.3); then the words in raised capitals and the
 * braille under them, as my printed station maps' keys carry a symbol,
 * large print and a braille strip. The title row comes first, then
 * You are here and the rest in the key's order, then the abbreviations.
 * Rows wrap to the plate and continue on a second key plate when the first
 * is full; a 1 mm raised line frames each plate (Wabinski and others 2022:
 * a key framed by a line when it is its own sheet).
 *
 * The samples and the frame become the plate's levels file through the
 * map's own levels builder, so a line or a symbol reads exactly as it
 * does on the map. The words and the braille are rows the model raises
 * itself: "x:y:content", x and y in tenths of a millimeter from the
 * plate's bottom left, rows split by "|".
 *
 * No DOM here: a worker may import this file.
 *
 * @license GPL-3.0-or-later
 */
import { signRowWidthMm } from '../sign-letter-metrics.js';
import { buildLevelRings, levelsSvgFromRings } from './levels-svg.js';
import { emptyPlan } from './plan.js';

/** Words and braille keep 9.525 mm (3/8 in) from the edge (ADA 703.3.2). */
export const KEY_MARGIN_MM = 9.525;
/** The column the samples stand in, left of the words. */
export const KEY_SYMBOL_COLUMN_MM = 24;
/** Between one row's last line and the next row (BANA 8.5.3: 3 mm at least). */
export const KEY_GAP_MM = 5;
/** The frame: a 1 mm raised line this far in from the edge. */
export const KEY_FRAME_INSET_MM = 4;
export const KEY_FRAME_WIDTH_MM = 1;

/** The model's TITLE_LETTER_SPACING. */
const LETTER_SPACING = 1.21;
/** Line pitch of the raised words: 150 % of the capital (ADA 703.2.8). */
const PRINT_PITCH = 1.5;
/** Braille line pitch (ADA 703.3.1's 10 to 10.2 mm; the Braille Sign's). */
const BRAILLE_LINE_MM = 10.1;
/** From a cell's center to its top or bottom dot's edge: 2.5 + 0.8. */
const CELL_HALF_MM = 3.3;
/** From the words' baseline to the braille's top. */
const PRINT_TO_BRAILLE_MM = 3;
const BLANK = '⠀';

const tenths = (v) => Math.round(v * 10);
const clean = (s) => String(s || '').replace(/\|/g, '/');

/**
 * The texts the key needs in braille, lowercase, each once: the title row,
 * every entry's name, every abbreviation with its name.
 *
 * @param {{ entries: Array<object>, abbreviations: Array<object> }} key
 * @param {string} [title]
 * @returns {string[]}
 */
export function keyTexts(key, title = '') {
  const rows = keyRows(key, title).map((r) => r.say);
  return [...new Set(rows)];
}

function keyRows(key, title) {
  const head = title ? `Key: ${title}` : 'Key';
  return [
    { print: head, say: head.toLowerCase(), sample: null },
    ...key.entries.map((e) => ({
      print: e.name,
      say: e.name.toLowerCase(),
      sample: e,
    })),
    ...key.abbreviations.map((a) => ({
      print: `${a.key} ${a.name}`,
      say: `${a.key} ${a.name}`.toLowerCase(),
      sample: null,
    })),
  ];
}

/** Words wrapped to a width in raised capitals. */
function wrapPrint(text, widthMm, letterMm) {
  const fits = (s) =>
    signRowWidthMm(s, {
      charHeightMm: letterMm,
      letterSpacing: LETTER_SPACING,
    }) <= widthMm;
  const lines = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (fits(next)) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    // A word longer than the line breaks where it must.
    let rest = word;
    while (!fits(rest)) {
      let cut = rest.length - 1;
      while (cut > 1 && !fits(rest.slice(0, cut))) cut -= 1;
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    line = rest;
  }
  if (line) lines.push(line);
  return lines;
}

/** Braille wrapped to a number of cells, at its blank cells. */
function wrapBraille(cells, maxCells) {
  const words = cells.split(BLANK).filter((w) => w.length > 0);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line}${BLANK}${word}` : word;
    if ([...next].length <= maxCells) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    let rest = [...word];
    while (rest.length > maxCells) {
      lines.push(rest.slice(0, maxCells).join(''));
      rest = rest.slice(maxCells);
    }
    line = rest.join('');
  }
  if (line) lines.push(line);
  return lines;
}

/** A sample of an entry, centered on a point, as a plan feature. */
function sampleOf(entry, id, [cx, cy]) {
  const cls = entry.classes[0];
  if (entry.kind === 'point') {
    return {
      id,
      class: cls,
      kind: 'point',
      at: [cx, cy],
      symbol: entry.symbolKey,
      size: entry.sizeMm,
      on: true,
    };
  }
  if (entry.kind === 'line') {
    return {
      id,
      class: cls,
      kind: 'line',
      points: [
        [cx - 9, cy],
        [cx + 9, cy],
      ],
      style: entry.style,
      width: entry.widthMm,
      on: true,
    };
  }
  return {
    id,
    class: cls,
    kind: 'area',
    ring: [
      [cx - 7, cy - 4.5],
      [cx + 7, cy - 4.5],
      [cx + 7, cy + 4.5],
      [cx - 7, cy + 4.5],
    ],
    on: true,
  };
}

/**
 * The key plates.
 *
 * @param {{ entries: Array<object>, abbreviations: Array<object> }} key
 * @param {object} options
 * @param {number} options.plateW - mm
 * @param {number} options.plateH - mm
 * @param {string} [options.title]
 * @param {((text: string) => string)|null} options.brailleOf - Unicode braille
 *   for each of `keyTexts`; null when there is no braille (print only)
 * @param {number} [options.letterHeightMm] - the capital's height
 * @param {number} [options.cellMm] - braille cell spacing
 * @param {object} [options.settings] - the levels builder's
 * @returns {Array<{id: string, size: {w: number, h: number}, plan: object, svg: string, print: string, braille: string}>}
 */
export function keyPlates(
  key,
  {
    plateW,
    plateH,
    title = '',
    brailleOf = null,
    letterHeightMm = 8,
    cellMm = 7,
    settings = {},
  }
) {
  const textX = KEY_MARGIN_MM + KEY_SYMBOL_COLUMN_MM;
  const textW = plateW - KEY_MARGIN_MM - textX;
  const maxCells = Math.max(1, Math.floor(textW / cellMm));
  const pitch = letterHeightMm * PRINT_PITCH;
  const bottomLimit = plateH - KEY_MARGIN_MM;
  const pages = [];
  let page = null;

  const newPage = () => {
    page = { rows: [], print: [], braille: [], y: KEY_MARGIN_MM };
    pages.push(page);
  };
  newPage();

  keyRows(key, title).forEach((row, i) => {
    const printLines = wrapPrint(
      clean(row.print).toUpperCase(),
      textW,
      letterHeightMm
    );
    const cells = brailleOf ? clean(brailleOf(row.say)) : '';
    const brailleLines = cells ? wrapBraille(cells, maxCells) : [];
    const height = (top) => {
      const lastBase = top + letterHeightMm + (printLines.length - 1) * pitch;
      if (!brailleLines.length) return lastBase - top;
      const firstCell = lastBase + PRINT_TO_BRAILLE_MM + CELL_HALF_MM;
      return (
        firstCell +
        (brailleLines.length - 1) * BRAILLE_LINE_MM +
        CELL_HALF_MM -
        top
      );
    };
    if (page.rows.length && page.y + height(page.y) > bottomLimit) newPage();
    const top = page.y;
    const bottom = top + height(top);
    printLines.forEach((text, k) => {
      const base = top + letterHeightMm + k * pitch;
      page.print.push(`${tenths(textX)}:${tenths(plateH - base)}:${text}`);
    });
    const lastBase = top + letterHeightMm + (printLines.length - 1) * pitch;
    brailleLines.forEach((text, k) => {
      const center =
        lastBase + PRINT_TO_BRAILLE_MM + CELL_HALF_MM + k * BRAILLE_LINE_MM;
      page.braille.push(`${tenths(textX)}:${tenths(plateH - center)}:${text}`);
    });
    if (row.sample) {
      const at = [KEY_MARGIN_MM + KEY_SYMBOL_COLUMN_MM / 2, (top + bottom) / 2];
      page.rows.push(sampleOf(row.sample, `key-sample-${i}`, at));
    } else {
      page.rows.push(null);
    }
    page.y = bottom + KEY_GAP_MM;
  });

  return pages.map((p, n) => {
    const plan = emptyPlan(plateW, plateH);
    const inset = KEY_FRAME_INSET_MM;
    plan.features.push({
      id: 'key-frame',
      class: 'curb',
      kind: 'line',
      points: [
        [inset, inset],
        [plateW - inset, inset],
        [plateW - inset, plateH - inset],
        [inset, plateH - inset],
        [inset, inset],
      ],
      width: KEY_FRAME_WIDTH_MM,
      on: true,
    });
    for (const f of p.rows) if (f) plan.features.push(f);
    const { rings } = buildLevelRings(plan, settings);
    return {
      id: pages.length === 1 ? 'key' : `key-${n + 1}`,
      size: { w: plateW, h: plateH },
      plan,
      svg: levelsSvgFromRings(rings, plan.size),
      print: p.print.join('|'),
      braille: p.braille.join('|'),
    };
  });
}
