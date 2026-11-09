/**
 * The key's layout: the key (map-key.js) as pieces, a row each, for the
 * Tactile Map tile's Key mode, so a row prints on its own and can be kept
 * for another map.
 *
 * Each piece: at the left, the place's number in the form the Labels switch
 * chose (a braille wedge, a channel for its braille on label tape, or a
 * raised numeral), or the kind's symbol, line or area at its printed size so
 * a finger learns it as it is on the map (ISO 19028 6.4.3); then the name in
 * the same form. The samples and the channels become the piece's levels
 * file through the map's own levels builder; the model raises the words,
 * the numerals and the wedges from rows the piece writes.
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
import {
  brailleCells,
  cellsBraille,
  channelLengthMm,
  DEFAULT_LABEL_STYLE,
  identifierBox,
  LABEL_CELL_MM,
  LABEL_END_MM,
  wedgeCells,
  wedgeCellsFor,
  wedgeSize,
} from './identifiers.js';
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
export const LETTER_SPACING = 1.21;
/** Line pitch of the raised words: 135 % of the capital (ADA 703.2.8). */
export const PRINT_PITCH = 1.35;
/** Between two channels of one entry (BANA 2022 8.5.3; the map's channels). */
const CHANNEL_GAP_MM = 3;

const tenths = (v) => Math.round(v * 10);
const round3 = (v) => Math.round(v * 1000) / 1000;
const clean = (s) => String(s || '').replace(/\|/g, '/');

/** A key plate's name in the plate list: Key, or Key 1, Key 2 and on. */
export const keyLabel = (id) => (id === 'key' ? 'Key' : `Key ${id.slice(4)}`);

/** How tall a sample stands, for a row of its own. */
function sampleTallMm(entry) {
  if (entry.kind === 'point') return Number(entry.sizeMm) || 0;
  if (entry.kind === 'line') return Number(entry.widthMm) || 0;
  return 9;
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

/**
 * Words wrapped to a width in raised capitals. A word wider than the line
 * stands on a line of its own when it is within `wordMaxMm` (the width
 * the line may take when a word needs it), and breaks only past that.
 */
export function wrapPrint(text, widthMm, letterMm, wordMaxMm = widthMm) {
  const width = (s) =>
    signRowWidthMm(s, {
      charHeightMm: letterMm,
      letterSpacing: LETTER_SPACING,
    });
  const fits = (s) => width(s) <= widthMm;
  const lines = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (fits(next)) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    if (width(word) <= Math.max(widthMm, wordMaxMm)) {
      lines.push(word);
      line = '';
      continue;
    }
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
 * The key's rows as the model reads them, one piece each: the title, then
 * You are here and the rest of the kinds in the key's order, then the
 * numbered places. A numbered row's words are the place's name; its number
 * stands in its own form at the row's left.
 *
 * @param {{ entries: Array<object>, numbers: Array<object> }} key
 * @param {string} [title]
 */
export function keyRows(key, title) {
  const head = title ? `Key: ${title}` : 'Key';
  return [
    { print: head, say: head.toLowerCase(), sample: null, number: null },
    ...key.entries.map((e) => ({
      print: e.name,
      say: e.name.toLowerCase(),
      sample: e,
      number: null,
    })),
    ...key.numbers.map((n) => ({
      print: n.name,
      say: n.name.toLowerCase(),
      sample: null,
      number: n.number,
    })),
  ];
}

/** Uncontracted letters a to z as dots, for a wedge before the translator answers. */
const A_TO_J = [
  [1],
  [1, 2],
  [1, 4],
  [1, 4, 5],
  [1, 5],
  [1, 2, 4],
  [1, 2, 4, 5],
  [1, 2, 5],
  [2, 4],
  [2, 4, 5],
];
const LETTER_DOTS = [
  ...A_TO_J,
  ...A_TO_J.map((d) => [...d, 3]),
  ...A_TO_J.slice(0, 2).map((d) => [...d, 3, 6]),
  [2, 4, 5, 6],
  ...A_TO_J.slice(2, 5).map((d) => [...d, 3, 6]),
];

/**
 * Words as uncontracted braille, letter by letter, with the number sign
 * before a run of digits: the estimate a wedge takes until the braille
 * translator has measured the words.
 *
 * @param {string} text
 * @returns {string} Unicode braille
 */
export function estimateBraille(text) {
  const cells = [];
  let digits = false;
  for (const ch of String(text || '').toLowerCase()) {
    if (ch >= 'a' && ch <= 'z') {
      cells.push(LETTER_DOTS[ch.charCodeAt(0) - 97]);
      digits = false;
    } else if (ch >= '0' && ch <= '9') {
      if (!digits) cells.push([3, 4, 5, 6]);
      cells.push(A_TO_J[(ch.charCodeAt(0) - 48 + 9) % 10]);
      digits = true;
    } else if (/\s/.test(ch)) {
      cells.push([]);
      digits = false;
    }
  }
  return cellsBraille(cells);
}

/** Braille cells broken at their spaces into lines of at most `max` cells. */
function wrapCells(cells, max) {
  const words = [];
  let word = [];
  for (const c of cells) {
    if (c.length === 0) {
      if (word.length) words.push(word);
      word = [];
    } else {
      word.push(c);
    }
  }
  if (word.length) words.push(word);
  const lines = [];
  let line = [];
  for (const w of words) {
    const next = line.length ? [...line, [], ...w] : w;
    if (next.length <= max) {
      line = next;
      continue;
    }
    if (line.length) lines.push(line);
    let rest = w;
    while (rest.length > max) {
      lines.push(rest.slice(0, max));
      rest = rest.slice(max);
    }
    line = rest;
  }
  if (line.length) lines.push(line);
  return lines;
}

/** A cell's dots as the model's number: dot 1 the 1, up to dot 6 the 32. */
const bitsOf = (dots) => dots.reduce((b, d) => b | (1 << (d - 1)), 0);

/**
 * The key, a piece for each row, so each prints on its own and a row (a
 * kind's symbol, a place) can be kept and used again with another map. A
 * row reads left to right: the number in the switch's form, or the kind's
 * sample at its printed size (ISO 19028 6.4.3), then the name in the same
 * form. Braille label tape: a channel for the braille number, then channels
 * for the name, cut for the tape grade chosen. Braille wedges: the number's
 * wedge, then the name on wedges in contracted braille (UEB Grade 2), the
 * translator's. Raised numbers and letters: the bold numeral, then the name
 * in raised capitals built as the Braille Sign builds its letters (ADA
 * 703.2). A name too long for the piece goes on in lines below, the first
 * line farthest from the reader as on a page; every part keeps the sign's
 * 9.525 mm from the next and from the piece's edge (ADA 703.2.7, 703.3.2).
 *
 * @param {{ entries: Array<object>, numbers: Array<object> }} key
 * @param {object} options
 * @param {string} [options.title]
 * @param {string} [options.style] - a LABEL_STYLES key (identifiers.js)
 * @param {number} [options.letterHeightMm] - the raised capital's height
 * @param {number} [options.maxWidthMm] - the widest a piece may be (the bed)
 * @param {object} [options.settings] - the levels builder's: the tape's width,
 *   the tape measure (`tape`), the wedge's dials (`wedge`)
 * @param {(text: string) => string} [options.braille] - a text's contracted
 *   braille (Unicode), for the wedges
 * @returns {Array<{id: string, name: string, size: {w: number, h: number}, plan: object, svg: string, print: string, wedges: string, brailleWedges: string, marks: object[], tape: string[], cones: Array<[number, number]>}>}
 */
export function keyPieces(
  key,
  {
    title = '',
    style = DEFAULT_LABEL_STYLE,
    letterHeightMm = KEY_LETTER_MM,
    maxWidthMm = 250,
    settings = {},
    braille = null,
  } = {}
) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const across = s.tapeWidthMm + s.channelClearanceMm;
  const cellsOf = s.tape?.of ? (text) => s.tape.of(text).cells : labelCells;
  const brailleOf = (text) =>
    (braille && braille(text)) || estimateBraille(text);
  const M = KEY_CLEARANCE_MM;
  const rows = keyRows(key, title);
  const pitch = letterHeightMm * PRINT_PITCH;

  return rows.map((row, i) => {
    // The row's left: its number in the switch's form (a raised numeral when
    // a wedge cannot hold the number), or its kind's sample.
    let left = null;
    if (row.number) {
      const box =
        identifierBox(row.number, style, s.wedge, {
          inBand: true,
          acrossMm: across,
        }) || identifierBox(row.number, 'raised', s.wedge, { inBand: true });
      left = { kind: 'number', w: box.w, h: box.h, part: box.parts[0] };
    } else if (row.sample) {
      left = {
        kind: 'sample',
        w: Math.max(SAMPLE_MM, Number(row.sample.sizeMm) || 0),
        h: sampleTallMm(row.sample),
      };
    }
    const room = maxWidthMm - 2 * M - (left ? left.w + KEY_CLEARANCE_MM : 0);

    // The name's lines, each with its height, its width and the gap above.
    let lines;
    if (style === 'tape') {
      const maxCells = Math.max(
        1,
        Math.floor((room - 2 * LABEL_END_MM) / LABEL_CELL_MM)
      );
      lines = wrapTape(clean(row.say), maxCells, cellsOf).map((text, k) => ({
        kind: 'tape',
        text,
        w: channelLengthMm(cellsOf(text)),
        h: across,
        gap: k ? CHANNEL_GAP_MM : 0,
        read: across,
      }));
    } else if (style === 'raised') {
      const texts = wrapPrint(
        clean(row.print).toUpperCase(),
        room,
        letterHeightMm
      );
      lines = texts.map((text, k) => ({
        kind: 'words',
        text,
        w: signRowWidthMm(text, {
          charHeightMm: letterHeightMm,
          letterSpacing: LETTER_SPACING,
        }),
        h: letterHeightMm + descentMm(text, letterHeightMm),
        gap: k
          ? pitch - letterHeightMm - descentMm(texts[k - 1], letterHeightMm)
          : 0,
        read: letterHeightMm,
      }));
    } else {
      const cells = brailleCells(brailleOf(clean(row.say)));
      lines = wrapCells(cells, wedgeCellsFor(room)).map((c, k) => {
        const size = wedgeSize(c, s.wedge);
        return {
          kind: 'wedge',
          cells: c,
          w: size.w,
          h: size.depth,
          gap: k ? KEY_CLEARANCE_MM : 0,
          read: size.depth,
        };
      });
    }

    // The first line's reading line and the left's bottom are one line.
    const firstRead = lines.length ? lines[0].read : 0;
    const reading = M + Math.max(firstRead, left ? left.h : 0);
    const x0 = M + (left ? left.w + KEY_CLEARANCE_MM : 0);
    let bottom = reading;
    let y = reading - firstRead;
    const placed = lines.map((line, k) => {
      if (k > 0) y = bottom + line.gap;
      let top = y;
      // The model reads a baseline in tenths of a millimeter: the words
      // settle down onto the next tenth, never up into the clearance.
      if (line.kind === 'words') {
        top =
          Math.ceil((top + letterHeightMm) * 10 - 1e-9) / 10 - letterHeightMm;
      }
      bottom = top + line.h;
      return { ...line, top };
    });
    const w = Math.max(
      20,
      Math.ceil(x0 + Math.max(0, ...placed.map((l) => l.w)) + M - 1e-9)
    );
    const h = Math.max(20, Math.ceil(Math.max(bottom, reading) + M - 1e-9));

    const plan = emptyPlan(w, h);
    const print = [];
    const wedges = [];
    const brailleWedges = [];
    const marks = [];
    const tape = [];
    if (left?.kind === 'sample') {
      plan.features.push(
        sampleOf(row.sample, `key-sample-${i}`, [
          M + left.w / 2,
          reading - left.h / 2,
        ])
      );
    } else if (left) {
      const cx = M + left.w / 2;
      const part = left.part;
      if (part.kind === 'channel') {
        plan.features.push({
          id: `key-number-${i}`,
          class: 'channel',
          kind: 'channel',
          at: [round3(cx), round3(reading - part.h / 2)],
          length: part.w,
          on: true,
        });
        tape.push(`#${row.number}`);
      } else if (part.kind === 'numeral') {
        print.push(
          `${tenths(cx)}:${tenths(h - reading)}:${tenths(part.capMm)}:0:#${row.number}`
        );
      } else {
        wedges.push(`${tenths(cx)}:${tenths(h - reading)}:${row.number}`);
        marks.push({
          number: row.number,
          wedge: {
            x: round3(cx),
            y: round3(reading),
            w: part.w,
            depth: part.h,
            cells: wedgeCells(row.number),
          },
        });
      }
    }
    placed.forEach((line, k) => {
      if (line.kind === 'tape') {
        plan.features.push({
          id: `key-tape-${i}-${k}`,
          class: 'channel',
          kind: 'channel',
          at: [round3(x0 + line.w / 2), round3(line.top + line.h / 2)],
          length: line.w,
          on: true,
        });
        tape.push(line.text);
      } else if (line.kind === 'words') {
        print.push(
          `${tenths(x0)}:${tenths(h - (line.top + letterHeightMm))}:${tenths(letterHeightMm)}:0:${line.text}`
        );
      } else {
        const foot = line.top + line.h;
        brailleWedges.push(
          `${tenths(x0 + line.w / 2)}:${tenths(h - foot)}:${line.cells.map(bitsOf).join('.')}`
        );
        marks.push({
          number: null,
          wedge: {
            x: round3(x0 + line.w / 2),
            y: round3(foot),
            w: line.w,
            depth: line.h,
            cells: line.cells,
          },
        });
      }
    });
    const { rings, cones } = buildLevelRings(plan, settings);
    return {
      id: rows.length === 1 ? 'key' : `key-${i + 1}`,
      name: row.number ? `${row.number} ${row.print}` : row.print,
      size: { w, h },
      plan,
      svg: levelsSvgFromRings(rings, plan.size),
      print: print.join('|'),
      wedges: wedges.join('|'),
      brailleWedges: brailleWedges.join('|'),
      marks,
      tape,
      cones,
    };
  });
}
