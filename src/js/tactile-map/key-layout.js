/**
 * The key plate's layout: the key (map-key.js) laid out as rows on plates of
 * the map's plate size, for the Tactile Map tile's Key mode.
 *
 * Each row: at the left, the symbol, a piece of the line or a patch of the
 * area at its printed size and height, so a finger learns it as it is on
 * the map (ISO 19028 6.4.3); then the words in raised capitals, built as
 * the Braille Sign builds its letters (ADA 703.2: the capital I 16 mm,
 * 1.21 spacing, a 135 % line pitch); under the words a channel for the
 * braille on label tape, as the map's own labels are, because tape reads
 * better than dots printed flat. Words, channels and samples keep the
 * sign's 9.525 mm (3/8 in) from each other and from the raised frame
 * (ADA 703.2.7, 703.3.2). The title row comes first, then You are here
 * and the rest in the key's order, then the numbered places. Rows continue
 * on a second key plate when the first is full; a 1 mm raised line frames
 * each plate (Wabinski and others 2022: a key framed by a line when it is
 * its own sheet).
 *
 * The samples, the channels and the frame become the plate's levels file
 * through the map's own levels builder, so a line or a symbol reads
 * exactly as it does on the map and a channel is cut as the map's are.
 * The words are rows the model raises itself: "x:y:WORDS", x and y the
 * start of the baseline in tenths of a millimeter from the plate's bottom
 * left, rows split by "|". The texts to write on the tape go into the
 * README in the channels' order.
 *
 * No DOM here: a worker may import this file.
 *
 * @license GPL-3.0-or-later
 */
import {
  SIGN_LETTER_CAP_FACTOR,
  SIGN_LETTER_METRICS,
  SIGN_LETTER_UNKNOWN,
  signRowWidthMm,
} from '../sign-letter-metrics.js';
import {
  buildLevelRings,
  DEFAULT_SETTINGS,
  levelsSvgFromRings,
} from './levels-svg.js';
import { labelCells } from './map-key.js';
import { channelLengthMm, LABEL_CELL_MM, LABEL_END_MM } from './map-labels.js';
import { emptyPlan } from './plan.js';

/**
 * Raised words, braille and a raised frame keep 9.525 mm (3/8 in) from each
 * other (ADA 703.2.7, 703.3.2; the Braille Sign's clearance).
 */
export const KEY_CLEARANCE_MM = 9.525;
/** The frame: a 1 mm raised line this far in from the edge. */
export const KEY_FRAME_INSET_MM = 4;
export const KEY_FRAME_WIDTH_MM = 1;
/** Words, channels and samples keep the clearance inside the frame's line. */
export const KEY_MARGIN_MM =
  KEY_FRAME_INSET_MM + KEY_FRAME_WIDTH_MM + KEY_CLEARANCE_MM;
/** The capital I of the words (ADA 703.2.5; the Braille Sign's default). */
export const KEY_LETTER_MM = 16;
/** The sample column: a line's 18 mm piece; a wider symbol widens it. */
const SAMPLE_MM = 18;
/** The Braille Sign's letter spacing (ADA 703.2.7). */
const LETTER_SPACING = 1.21;
/** Line pitch of the raised words: 135 % of the capital (ADA 703.2.8). */
export const PRINT_PITCH = 1.35;
/** Between two channels of one entry (BANA 2022 8.5.3; the map's channels). */
const CHANNEL_GAP_MM = 3;

const tenths = (v) => Math.round(v * 10);
const clean = (s) => String(s || '').replace(/\|/g, '/');

/** A key plate's name in the plate list: Key, or Key 1, Key 2 and on. */
export const keyLabel = (id) => (id === 'key' ? 'Key' : `Key ${id.slice(4)}`);

/**
 * What a key row carries beside its sample: a tape channel, raised words
 * and the channel, or the words alone. Braille first: the words are in the
 * README, and 16 mm capitals take a plate for a few rows.
 */
export const KEY_WORDS = [
  { key: 'braille', name: 'Braille only' },
  { key: 'both', name: 'Print and braille' },
  { key: 'print', name: 'Print only' },
];

/** How tall a sample stands, for a row of its own. */
function sampleTallMm(entry) {
  if (entry.kind === 'point') return Number(entry.sizeMm) || 0;
  if (entry.kind === 'line') return Number(entry.widthMm) || 0;
  return 9;
}

export function keyRows(key, title) {
  const head = title ? `Key: ${title}` : 'Key';
  return [
    { print: head, say: head.toLowerCase(), sample: null },
    ...key.entries.map((e) => ({
      print: e.name,
      say: e.name.toLowerCase(),
      sample: e,
    })),
    ...key.numbers.map((n) => ({
      print: `${n.number} ${n.name}`,
      say: `${n.number} ${n.name}`.toLowerCase(),
      sample: null,
    })),
  ];
}

/** How far below its baseline a row's ink reaches (the sign's metrics). */
function descentMm(text, letterMm) {
  const size = letterMm / SIGN_LETTER_CAP_FACTOR;
  let lowest = 0;
  for (const c of text) {
    const m = SIGN_LETTER_METRICS[c] || SIGN_LETTER_UNKNOWN;
    if (m[3] < lowest) lowest = m[3];
  }
  return -lowest * size;
}

/** Words wrapped to a width in raised capitals. */
export function wrapPrint(text, widthMm, letterMm) {
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

/**
 * A tape text divided at its spaces into pieces of at most `maxCells`,
 * each piece's cells by `cellsOf` (the tape measure's count, or the
 * estimate).
 */
function wrapTape(text, maxCells, cellsOf = labelCells) {
  const lines = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (cellsOf(next) <= maxCells) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    let rest = word;
    while (cellsOf(rest) > maxCells) {
      let cut = rest.length - 1;
      while (cut > 1 && cellsOf(rest.slice(0, cut)) > maxCells) cut -= 1;
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    line = rest;
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
 * @param {{ entries: Array<object>, numbers: Array<object> }} key
 * @param {object} options
 * @param {number} options.plateW - mm
 * @param {number} options.plateH - mm
 * @param {string} [options.title]
 * @param {string} [options.words] - a KEY_WORDS key: 'braille', 'both' or
 *   'print'
 * @param {number} [options.letterHeightMm] - the capital's height
 * @param {object} [options.settings] - the levels builder's, the tape's
 *   width among them
 * @returns {Array<{id: string, size: {w: number, h: number}, plan: object, svg: string, print: string, tape: string[]}>}
 */
export function keyPlates(
  key,
  {
    plateW,
    plateH,
    title = '',
    words = KEY_WORDS[0].key,
    letterHeightMm = KEY_LETTER_MM,
    settings = {},
  }
) {
  const withPrint = words !== 'braille';
  const withTape = words !== 'print';
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const across = s.tapeWidthMm + s.channelClearanceMm;
  // The cells a strip of tape takes: the translator's count through the
  // tape measure the settings carry, or the estimate.
  const cellsOf = s.tape?.of ? (text) => s.tape.of(text).cells : labelCells;
  const sampleW = Math.max(
    SAMPLE_MM,
    ...key.entries.map((e) => Number(e.sizeMm) || 0)
  );
  const textX = KEY_MARGIN_MM + sampleW + KEY_CLEARANCE_MM;
  const textW = plateW - KEY_MARGIN_MM - textX;
  const maxCells = Math.max(
    1,
    Math.floor((textW - 2 * LABEL_END_MM) / LABEL_CELL_MM)
  );
  const pitch = letterHeightMm * PRINT_PITCH;
  const bottomLimit = plateH - KEY_MARGIN_MM;
  const pages = [];
  let page = null;

  const newPage = () => {
    page = { samples: [], print: [], channels: [], tape: [], y: KEY_MARGIN_MM };
    pages.push(page);
  };
  const used = () => page.print.length + page.channels.length > 0;
  newPage();

  keyRows(key, title).forEach((row, i) => {
    const printLines = withPrint
      ? wrapPrint(clean(row.print).toUpperCase(), textW, letterHeightMm)
      : [];
    const tapeLines = withTape
      ? wrapTape(clean(row.say), maxCells, cellsOf)
      : [];
    const sampleTall = row.sample ? sampleTallMm(row.sample) : 0;
    // Each line's height and the lead before it: the letters and the ink
    // under their baseline at the sign's pitch; a channel the tape's width,
    // the clearance under the words, 3 mm under another channel.
    const lines = [
      ...printLines.map((text, k) => ({
        text,
        k,
        tape: false,
        tall: letterHeightMm + descentMm(text, letterHeightMm),
        lead:
          k === 0
            ? 0
            : pitch -
              letterHeightMm -
              descentMm(printLines[k - 1], letterHeightMm),
      })),
      ...tapeLines.map((text, k) => ({
        text,
        k,
        tape: true,
        tall: across,
        lead: k > 0 ? CHANNEL_GAP_MM : printLines.length ? KEY_CLEARANCE_MM : 0,
      })),
    ];
    const rowHeight = Math.max(
      lines.reduce((h, l) => h + l.lead + l.tall, 0),
      sampleTall
    );
    if (used() && page.y + rowHeight > bottomLimit) newPage();
    // Line by line, so a row taller than a plate goes on on the next one and
    // nothing is set past the margin.
    let first = { page, top: page.y };
    let bottom = page.y;
    let previous = null;
    for (const line of lines) {
      let top = previous === null ? page.y : bottom + line.lead;
      if (top + line.tall > bottomLimit && (used() || previous)) {
        newPage();
        if (previous === null) first = { page, top: page.y };
        top = page.y;
      }
      // The model reads a baseline in tenths of a millimeter: the words
      // settle down onto the next tenth, never up into the clearance above.
      if (!line.tape) {
        const base = Math.ceil((top + letterHeightMm) * 10 - 1e-9) / 10;
        top = base - letterHeightMm;
      }
      if (line.tape) {
        const length = channelLengthMm(cellsOf(line.text));
        page.channels.push({
          id: `key-tape-${i}-${line.k}`,
          class: 'channel',
          kind: 'channel',
          at: [textX + length / 2, top + line.tall / 2],
          length,
          on: true,
        });
        page.tape.push(line.text);
      } else {
        // A row as the model reads it: the baseline's start, the capital's
        // height, standing on the base (0 above it), then the words.
        page.print.push(
          `${tenths(textX)}:${tenths(plateH - (top + letterHeightMm))}:${tenths(letterHeightMm)}:0:${line.text}`
        );
      }
      bottom = top + line.tall;
      previous = line;
    }
    // The sample stands beside the row, on the row's first plate; a sample
    // taller than the row's lines makes the row its own height.
    if (first.page === page) {
      bottom = Math.min(bottomLimit, Math.max(bottom, first.top + sampleTall));
    }
    const sampleBottom = first.page === page ? bottom : bottomLimit;
    if (row.sample) {
      first.page.samples.push(
        sampleOf(row.sample, `key-sample-${i}`, [
          KEY_MARGIN_MM + sampleW / 2,
          (first.top + sampleBottom) / 2,
        ])
      );
    }
    page.y = bottom + KEY_CLEARANCE_MM;
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
    plan.features.push(...p.samples, ...p.channels);
    const { rings, cones } = buildLevelRings(plan, settings);
    return {
      id: pages.length === 1 ? 'key' : `key-${n + 1}`,
      size: { w: plateW, h: plateH },
      plan,
      svg: levelsSvgFromRings(rings, plan.size),
      print: p.print.join('|'),
      tape: p.tape,
      cones,
    };
  });
}
