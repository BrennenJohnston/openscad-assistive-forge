/**
 * The map's PDF, for the transcriber and the assembler: the map with its
 * plates on the first page, then each plate at full size with every label
 * channel drawn and the text its tape will carry printed in it, then the
 * labels as a list, then the key. Laid under a printed plate, a plate's
 * page shows where every tape goes; read beside it, the list says what
 * each tape says.
 *
 * Built from the same data as the map paper (map-paper.js), drawn with the
 * writer in pdf-writer.js. The page is paper: white, black ink; the plate's
 * levels and channels take the editor's colors, handed in from the tokens.
 *
 * @license GPL-3.0-or-later
 */

import { PdfWriter, textWidthMm } from './pdf-writer.js';

/** The papers offered, sideways, the first the default. */
export const PAPER_SIZES = Object.freeze([
  { key: 'letter', name: 'Letter', w: 279.4, h: 215.9 },
  { key: 'a4', name: 'A4', w: 297, h: 210 },
]);

/** Clear of the page's edges on every side (mm); the page headings sit in it. */
export const PDF_MARGIN_MM = 10;

const INK = [0, 0, 0];
const FAINT = [0.45, 0.45, 0.45];
const SEAM = [0.8, 0.1, 0.1];
const HEADING_PT = 12;
const BODY_PT = 9;
const NAME_PT = 8;
const LINE_MM = 5;
/** Liberation Sans' capital stands about 0.72 of the size; Helvetica's alike. */
const CAP_OF_SIZE = 0.72;
const PT_OF_MM = 72 / 25.4;
const EDGE_CLEARANCE_MM = 9.525;
const TITLE_LETTER_MM = 16;
const CHANNEL_END_MM = 2;

/** A token's value as the writer's color; anything but a hex reads as ink. */
function colorOf(value) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(value || '').trim());
  if (!m) return INK;
  const hex = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
}

/**
 * One plate (or the whole map) drawn at `scale` with its top left at
 * (x, y): the outline, the levels, the channels with their texts, the
 * names, a key plate's raised words, the title, and the plate seams when
 * a layout is given.
 */
function drawPlate(w, data, { x, y, scale, colors, seams }) {
  const s = scale;
  const px = (v) => x + v * s;
  const py = (v) => y + v * s;
  const map = (rings) =>
    (rings || []).map((ring) => ring.map((p) => ({ x: px(p.x), y: py(p.y) })));
  w.rect(x, y, data.size.w * s, data.size.h * s, {
    stroke: FAINT,
    widthMm: 0.3,
  });
  for (const [key, token] of [
    ['level1', colors.level1],
    ['level2', colors.level2],
    ['level3', colors.level3],
    ['here', null],
  ]) {
    w.polygons(map(data.rings?.[key]), {
      fill: token ? colorOf(token) : INK,
    });
  }
  const channel = colorOf(colors.channel);
  for (const ch of data.channels || []) {
    const [cx, cy] = ch.at;
    const rw = (ch.vertical ? ch.across : ch.length) * s;
    const rh = (ch.vertical ? ch.length : ch.across) * s;
    w.rect(px(cx) - rw / 2, py(cy) - rh / 2, rw, rh, {
      stroke: channel,
      fill: [1, 1, 1],
      widthMm: 0.4,
    });
    if (ch.text) {
      const room = Math.max(1, (ch.length - 2 * CHANNEL_END_MM) * s);
      let pt = NAME_PT;
      while (pt > 4 && textWidthMm(ch.text, pt) > room) pt -= 0.5;
      w.text(px(cx), py(cy) + (pt / PT_OF_MM) * 0.35, pt, ch.text, {
        align: 'center',
        color: INK,
      });
    }
  }
  for (const t of data.texts || []) {
    w.text(
      px(t.at[0]),
      py(t.at[1]) + (NAME_PT / PT_OF_MM) * 0.35,
      NAME_PT,
      t.text,
      {
        align: 'center',
        color: INK,
      }
    );
  }
  for (const r of data.words || []) {
    w.text(px(r.x), py(r.y), (r.h / CAP_OF_SIZE) * s * PT_OF_MM, r.text, {
      color: INK,
    });
  }
  if (data.title) {
    w.text(
      px(EDGE_CLEARANCE_MM),
      py(EDGE_CLEARANCE_MM + TITLE_LETTER_MM),
      (TITLE_LETTER_MM / CAP_OF_SIZE) * s * PT_OF_MM,
      String(data.title).toUpperCase(),
      { bold: true, color: INK }
    );
  }
  for (const p of seams || []) {
    w.rect(px(p.x), py(p.y), p.w * s, p.h * s, { stroke: SEAM, widthMm: 0.5 });
    w.text(px(p.x) + 2, py(p.y) + 5, BODY_PT, p.id, {
      bold: true,
      color: SEAM,
    });
  }
}

/** Lines of text down a page, a new page when the first runs out. */
function writeLines(w, size, heading, lines) {
  const bottom = size.h - PDF_MARGIN_MM;
  let y = PDF_MARGIN_MM + 6;
  const start = () => {
    w.page(size.w, size.h);
    w.text(PDF_MARGIN_MM, 7, HEADING_PT, heading, { bold: true });
    y = PDF_MARGIN_MM + 6;
  };
  start();
  for (const line of lines) {
    if (y > bottom) start();
    w.text(PDF_MARGIN_MM, y, BODY_PT, line);
    y += LINE_MM;
  }
}

/**
 * The PDF.
 *
 * @param {object} input
 * @param {string} input.mapName
 * @param {string} [input.lead] - What the map is, the README's first sentence
 * @param {string} [input.paper] - A PAPER_SIZES key
 * @param {object} input.whole - The whole map's paper data: rings, size, texts, channels, title
 * @param {Array<object>} input.plates - Each plate's paper data with its id (the key plates among them)
 * @param {{ plates: Array<{id: string, x: number, y: number, w: number, h: number}> }} [input.layout]
 * @param {string[]} [input.keyLines] - The key as text, line by line
 * @param {Array<{text: string, cells: number, name: string, lengthMm: number}>} [input.labels]
 * @param {number} [input.tapeWidthMm]
 * @param {Record<string, string>} input.colors - The paper's token values
 * @returns {{ bytes: Uint8Array, pages: number, unspelled: string[] }}
 */
export function mapPdf({
  mapName,
  lead = '',
  paper = PAPER_SIZES[0].key,
  whole,
  plates = [],
  layout = null,
  keyLines = [],
  labels = [],
  tapeWidthMm = 0,
  colors = {},
}) {
  const size = PAPER_SIZES.find((p) => p.key === paper) || PAPER_SIZES[0];
  const w = new PdfWriter();
  const M = PDF_MARGIN_MM;

  // The map and its plates.
  w.page(size.w, size.h);
  w.text(M, 6, HEADING_PT, mapName, { bold: true });
  if (lead) w.text(M, 10.5, 7, lead, { color: FAINT });
  const top = 14;
  const scale = Math.min(
    (size.w - 2 * M) / whole.size.w,
    (size.h - top - M) / whole.size.h,
    1
  );
  drawPlate(w, whole, { x: M, y: top, scale, colors, seams: layout?.plates });

  // Each plate at full size when the paper holds it.
  for (const plate of plates) {
    w.page(size.w, size.h);
    const fits =
      plate.size.w + 2 * M <= size.w && plate.size.h + 2 * M <= size.h;
    const s = fits
      ? 1
      : Math.min(
          (size.w - 2 * M) / plate.size.w,
          (size.h - 2 * M) / plate.size.h
        );
    const how = fits ? 'at full size' : `scaled to ${Math.round(s * 100)} %`;
    w.text(
      M,
      7,
      BODY_PT,
      `Plate ${plate.id}, ${plate.size.w} x ${plate.size.h} mm, ${how}`,
      { bold: true }
    );
    drawPlate(w, plate, { x: M, y: M, scale: s, colors });
  }

  // The labels, then the key.
  const labelLines = [
    tapeWidthMm
      ? `Label tape ${tapeWidthMm} mm wide; each channel is its label's cells at 6.2 mm plus 4 mm at each end.`
      : '',
    ...labels.map(
      (l) =>
        `${l.text}: ${l.cells} ${l.cells === 1 ? 'cell' : 'cells'}, a channel ${l.lengthMm} mm long, beside ${l.name}`
    ),
  ].filter((line) => line !== '');
  writeLines(
    w,
    size,
    'Labels',
    labelLines.length ? labelLines : ['No labels on this map.']
  );
  const key = keyLines.filter((line, i) => !(i === 0 && line === 'Key'));
  writeLines(w, size, 'Key', key.length ? key : ['No key.']);

  return { bytes: w.save(), pages: w.pageCount(), unspelled: w.unspelled() };
}
