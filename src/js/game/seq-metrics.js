/**
 * @license GPL-3.0-or-later
 */
// Per-cell FRAME-SEQUENCE metrics for the ASCII City Walk (CW-67).
//
// `scripts/seq-city-walk.mjs` photographs MOTION: N consecutive converted
// frames under a scripted pose, scored cell by cell on the converter's own
// grid. This module is the scoring, and nothing else - no DOM, no page, no
// Playwright - so the arithmetic that every Round 8 verdict is read off can
// be unit-tested against sequences with known answers.
//
// It lives in `src/js/game/` rather than in `scripts/` for two reasons: the
// instrument imports it through the dev server's own module graph, so the
// code the tests cover is byte-for-byte the code that runs; and the class
// labels come from `city-class-pass.js` rather than a second copy that can
// drift from the wire format (CW-33 appended two ids and a duplicated table
// would have given every surface the voice of its neighbour).
//
// WHAT THE COLUMNS MEAN, and why each is here:
//
//   * CHANGE is the plain per-frame churn: the share of (cell, frame pair)
//     slots where the glyph is not what it was. A walking picture should
//     change; the question this round asks is how much, and where.
//   * FLIP (A-B-A) is the fracture signature: a cell that comes back to what
//     it was two frames ago while its neighbours slide on is flashing, not
//     moving. A flip rate means nothing without the change rate beside it,
//     so both are always reported.
//   * PERSISTENCE is the mean length in frames of a cell's runs of one
//     glyph. Two scenes with the same change rate feel completely different
//     at 3 frames and at 15, and this is the number CW-68's dead band moves.
//   * CHURN CELLS is the share of cells that changed in MORE THAN HALF the
//     frame pairs - the population that is boiling rather than sliding.
//   * DRIVE is the converter's own decision, not a painted pixel: the
//     intensity level in mono, the palette index in colour. Reverse video
//     paints a solid cell with the glyph knocked out and no pixel statistic
//     separates that from a dense glyph reliably; the drive index says so.
//   * The EDGE row holds every cell whose CLASS moved during the sequence.
//     It swept across a geometry edge, so its flicker is real motion; it is
//     excluded from every class row and counted on its own. `ghostPct` on
//     the summary asks the opposite question for CW-68: of the moments a
//     cell's class changed AND the cell carried ink, how often did its glyph
//     NOT follow within the same frame pair? A hysteresis that holds those is
//     a ghost. The ink condition is not fussiness: two blank cells of
//     different classes draw the same nothing, and counting those would bury
//     the guard under a baseline it can never move.
//
// Every count is folded incrementally so a long sequence costs one pass per
// frame and no per-frame allocation beyond the two copies it must keep.

import { SURFACE_CLASS } from './city-class-pass.js';

/** The row id used for cells whose surface class moved during the sequence. */
export const EDGE_CLASS = -1;

/**
 * id -> label, derived from the pass's own wire format so an appended class
 * is named here the moment it exists. `BUILDING_WALL` reads as `wall`: the
 * prefix is a namespace in the enum, not part of the surface's name.
 */
const LABEL_BY_ID = new Map(
  Object.entries(SURFACE_CLASS).map(([name, id]) => [
    id,
    name.toLowerCase().replace(/^building_/, ''),
  ])
);

/**
 * @param {number} id a `SURFACE_CLASS` value, or `EDGE_CLASS`
 * @returns {string} the label used in every table and JSON summary
 */
export function classLabel(id) {
  if (id === EDGE_CLASS) return 'EDGE(class moved)';
  return LABEL_BY_ID.get(id) ?? `class${id}`;
}

/**
 * A fold in progress.
 *
 * @typedef {object} SeqFold
 * @property {number} cols grid columns (cells across)
 * @property {number} rows grid rows (cells down)
 * @property {number} cells `cols * rows`
 * @property {boolean} mono true for the intensity ladder, false for a palette
 * @property {number} reverseIndex the drive index the reverse-video atlas
 *   rides at (mono only; -1 when unknown)
 * @property {number} whiteIndex the palette index of white (colour only; -1
 *   when the palette has no white)
 * @property {number} litLumMin the converter's blank/ink cliff, used for the
 *   mono lit share (an option because CW-70/CW-71 move it)
 * @property {number} frames frames folded so far
 * @property {boolean} finished set by `finishFold`; a finished fold is closed
 * @property {Int16Array|null} prevGlyphs frame f-1's glyph indices
 * @property {Int16Array|null} prevGlyphs2 frame f-2's glyph indices
 * @property {Int16Array|null} prevDrive frame f-1's drive indices
 * @property {Int16Array|null} prevDrive2 frame f-2's drive indices
 * @property {Uint8Array|null} firstClass frame 0's class per cell
 * @property {Uint8Array|null} prevClass frame f-1's class per cell
 * @property {Uint8Array} classChanged 1 where the class ever left frame 0's
 * @property {Int32Array} classToggles per-cell count of class changes
 * @property {Map<string, number>} classPairs `"a>b"` (ids, low first) -> count
 * @property {Int32Array} glyphChange per-cell count of glyph changes
 * @property {Int32Array} glyphFlip per-cell count of A-B-A glyph returns
 * @property {Int32Array} driveChange per-cell count of drive changes
 * @property {Int32Array} driveFlip per-cell count of A-B-A drive returns
 * @property {Int32Array} reverseOrWhiteToggle per-cell count of crossings
 *   into or out of reverse video (mono) or white (colour)
 * @property {Uint8Array} everLit 1 where the cell carried ink in any frame
 * @property {Int32Array} runLength the open run of one glyph, per cell
 * @property {Float64Array} runSum closed run lengths, per cell
 * @property {Int32Array} runCount closed runs, per cell
 * @property {number[]} litShare lit share per frame
 * @property {number[]} whiteShare white share per frame (colour)
 * @property {number[]} reverseShare reverse-video share per frame (mono)
 * @property {number} classMoveEvents (cell, frame pair) slots where the class
 *   changed
 * @property {number} classMoveLitEvents of those, where the cell carried ink
 *   in the new frame - the ones a person could see a glyph decision in
 * @property {number} classMoveGlyphHeld of the lit ones, where the glyph did
 *   not change with the class
 */

/**
 * Start a fold over a `cols` x `rows` cell grid.
 *
 * @param {number} cols
 * @param {number} rows
 * @param {{mono: boolean, reverseIndex?: number, whiteIndex?: number,
 *   litLumMin?: number}} options
 * @returns {SeqFold}
 */
export function createFold(cols, rows, options = {}) {
  if (!Number.isInteger(cols) || cols <= 0) {
    throw new Error(`createFold: cols must be a positive integer, got ${cols}`);
  }
  if (!Number.isInteger(rows) || rows <= 0) {
    throw new Error(`createFold: rows must be a positive integer, got ${rows}`);
  }
  if (typeof options.mono !== 'boolean') {
    throw new Error(
      'createFold: options.mono must be stated. A fold scores the intensity ' +
        'ladder or a palette, and the two are different measurements.'
    );
  }
  const cells = cols * rows;
  return {
    cols,
    rows,
    cells,
    mono: options.mono,
    reverseIndex: Number.isInteger(options.reverseIndex)
      ? options.reverseIndex
      : -1,
    whiteIndex: Number.isInteger(options.whiteIndex) ? options.whiteIndex : -1,
    litLumMin:
      typeof options.litLumMin === 'number' ? options.litLumMin : LIT_LUM_MIN,
    frames: 0,
    finished: false,
    prevGlyphs: null,
    prevGlyphs2: null,
    prevDrive: null,
    prevDrive2: null,
    firstClass: null,
    prevClass: null,
    classChanged: new Uint8Array(cells),
    classToggles: new Int32Array(cells),
    classPairs: new Map(),
    glyphChange: new Int32Array(cells),
    glyphFlip: new Int32Array(cells),
    driveChange: new Int32Array(cells),
    driveFlip: new Int32Array(cells),
    reverseOrWhiteToggle: new Int32Array(cells),
    everLit: new Uint8Array(cells),
    runLength: new Int32Array(cells).fill(1),
    runSum: new Float64Array(cells),
    runCount: new Int32Array(cells),
    litShare: [],
    whiteShare: [],
    reverseShare: [],
    classMoveEvents: 0,
    classMoveLitEvents: 0,
    classMoveGlyphHeld: 0,
  };
}

/**
 * The converter's blank/ink cliff. A mono cell below it draws nothing, so it
 * is the honest definition of "lit" for a mono sequence.
 */
export const LIT_LUM_MIN = 0.5;

/**
 * Fold one converted frame.
 *
 * @param {SeqFold} fold
 * @param {{glyphs: ArrayLike<number>, cls: ArrayLike<number>,
 *   intensity?: ArrayLike<number>|null, lum?: ArrayLike<number>|null,
 *   colour?: ArrayLike<number>|null}} frame the cell probe's decisions plus
 *   the class pass's read. `intensity` and `lum` are the mono pair;
 *   `colour` is the per-cell palette index (-1 where the cell is blank).
 * @returns {number} frames folded so far
 */
export function foldFrame(fold, frame) {
  if (fold.finished) {
    throw new Error('foldFrame: this fold is finished and cannot take more');
  }
  const n = fold.cells;
  const { glyphs, cls } = frame;
  requireLength(glyphs, n, 'glyphs');
  requireLength(cls, n, 'cls');
  let drive;
  let lum = null;
  if (fold.mono) {
    requireLength(frame.intensity, n, 'intensity');
    requireLength(frame.lum, n, 'lum');
    drive = frame.intensity;
    lum = frame.lum;
  } else {
    requireLength(frame.colour, n, 'colour');
    drive = frame.colour;
  }

  if (!fold.firstClass) {
    fold.firstClass = Uint8Array.from(cls);
  } else {
    const prevClass = fold.prevClass;
    for (let i = 0; i < n; i++) {
      const now = cls[i];
      if (now !== fold.firstClass[i]) fold.classChanged[i] = 1;
      const was = prevClass[i];
      if (now !== was) {
        fold.classToggles[i]++;
        fold.classMoveEvents++;
        const key = was < now ? `${was}>${now}` : `${now}>${was}`;
        fold.classPairs.set(key, (fold.classPairs.get(key) ?? 0) + 1);
        const inked = fold.mono ? lum[i] >= fold.litLumMin : drive[i] >= 0;
        if (inked) {
          fold.classMoveLitEvents++;
          if (fold.prevGlyphs && glyphs[i] === fold.prevGlyphs[i]) {
            fold.classMoveGlyphHeld++;
          }
        }
      }
    }
  }
  fold.prevClass = Uint8Array.from(cls);

  let lit = 0;
  let white = 0;
  let reverse = 0;
  for (let i = 0; i < n; i++) {
    if (fold.mono) {
      if (lum[i] >= fold.litLumMin) {
        lit++;
        fold.everLit[i] = 1;
      }
      if (drive[i] === fold.reverseIndex) reverse++;
    } else {
      if (drive[i] >= 0) {
        lit++;
        fold.everLit[i] = 1;
      }
      if (drive[i] === fold.whiteIndex) white++;
    }
  }
  fold.litShare.push(lit / n);
  fold.whiteShare.push(white / n);
  fold.reverseShare.push(reverse / n);

  const prevGlyphs = fold.prevGlyphs;
  if (prevGlyphs) {
    const prevGlyphs2 = fold.prevGlyphs2;
    const prevDrive = fold.prevDrive;
    const prevDrive2 = fold.prevDrive2;
    const flagIndex = fold.mono ? fold.reverseIndex : fold.whiteIndex;
    for (let i = 0; i < n; i++) {
      const glyph = glyphs[i];
      if (glyph !== prevGlyphs[i]) {
        fold.glyphChange[i]++;
        fold.runSum[i] += fold.runLength[i];
        fold.runCount[i]++;
        fold.runLength[i] = 1;
        if (prevGlyphs2 && glyph === prevGlyphs2[i]) fold.glyphFlip[i]++;
      } else {
        fold.runLength[i]++;
      }
      const now = drive[i];
      const was = prevDrive[i];
      if (now !== was) {
        fold.driveChange[i]++;
        if ((was === flagIndex) !== (now === flagIndex)) {
          fold.reverseOrWhiteToggle[i]++;
        }
        if (prevDrive2 && now === prevDrive2[i]) fold.driveFlip[i]++;
      }
    }
  }
  fold.prevGlyphs2 = prevGlyphs;
  fold.prevGlyphs = Int16Array.from(glyphs);
  fold.prevDrive2 = fold.prevDrive;
  fold.prevDrive = Int16Array.from(drive);
  fold.frames++;
  return fold.frames;
}

/**
 * One summarised row of the tables the instrument prints.
 *
 * @typedef {object} SeqRow
 * @property {string} name the class label, or `EDGE(class moved)`
 * @property {number} cells cells in this row
 * @property {number} lit cells that carried ink in ANY frame of the sequence
 * @property {number} glyphChangePct share of (cell, frame pair) slots where
 *   the glyph changed
 * @property {number} glyphFlipPct share of (cell, frame triple) slots where
 *   the glyph came back to what it was two frames earlier
 * @property {number} driveOrColourChangePct the same for the drive index
 * @property {number} driveOrColourFlipPct the same for A-B-A drive returns
 * @property {number} reverseOrWhiteToggles crossings into or out of reverse
 *   video (mono) or white (colour)
 * @property {number} churnCellsPct share of cells that changed in more than
 *   half the frame pairs
 * @property {number} meanGlyphPersistenceFrames mean run length in frames
 */

/**
 * Close the fold and summarise it.
 *
 * Calling this twice would count the open runs twice, so the fold is closed
 * and a second call throws rather than quietly reporting a different number.
 *
 * @param {SeqFold} fold
 * @param {{topClassPairs?: number}} [options]
 * @returns {{cols: number, rows: number, cells: number, frames: number,
 *   mono: boolean, classChangedCells: number, classPairs: Array<[string,
 *   number]>, litShareMean: number, whiteShare: number[],
 *   reverseShare: number[], ghostPct: number, classMoveEvents: number,
 *   classMoveLitEvents: number, total: SeqRow, perClass: SeqRow[],
 *   edge: SeqRow}}
 */
export function finishFold(fold, options = {}) {
  if (fold.finished) throw new Error('finishFold: this fold is already closed');
  if (fold.frames === 0) {
    throw new Error(
      'finishFold: no frames were folded. A sequence that captured nothing ' +
        "is this project's recorded failure mode, so it is an error here."
    );
  }
  fold.finished = true;
  const n = fold.cells;
  const pairs = Math.max(1, fold.frames - 1);
  const triples = Math.max(1, fold.frames - 2);
  const rows = new Map();
  const edge = emptyRow(EDGE_CLASS);
  let classChangedCells = 0;

  for (let i = 0; i < n; i++) {
    fold.runSum[i] += fold.runLength[i];
    fold.runCount[i]++;
    let row;
    if (fold.classChanged[i]) {
      classChangedCells++;
      row = edge;
    } else {
      const id = fold.firstClass[i];
      row = rows.get(id);
      if (!row) {
        row = emptyRow(id);
        rows.set(id, row);
      }
    }
    row.cells++;
    row.lit += fold.everLit[i];
    row.glyphChange += fold.glyphChange[i];
    row.glyphFlip += fold.glyphFlip[i];
    row.driveChange += fold.driveChange[i];
    row.driveFlip += fold.driveFlip[i];
    row.reverseOrWhiteToggle += fold.reverseOrWhiteToggle[i];
    if (fold.glyphChange[i] > pairs * 0.5) row.churn++;
    row.runSum += fold.runSum[i];
    row.runCount += fold.runCount[i];
  }

  const total = emptyRow(EDGE_CLASS);
  for (const row of [...rows.values(), edge]) {
    total.cells += row.cells;
    total.lit += row.lit;
    total.glyphChange += row.glyphChange;
    total.glyphFlip += row.glyphFlip;
    total.driveChange += row.driveChange;
    total.driveFlip += row.driveFlip;
    total.reverseOrWhiteToggle += row.reverseOrWhiteToggle;
    total.churn += row.churn;
    total.runSum += row.runSum;
    total.runCount += row.runCount;
  }

  const top = Number.isInteger(options.topClassPairs)
    ? options.topClassPairs
    : 6;
  const summarise = (row) => summariseRow(row, pairs, triples);
  return {
    cols: fold.cols,
    rows: fold.rows,
    cells: n,
    frames: fold.frames,
    mono: fold.mono,
    classChangedCells,
    classPairs: [...fold.classPairs.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, top)
      .map(([key, count]) => [
        key
          .split('>')
          .map((id) => classLabel(Number(id)))
          .join('/'),
        count,
      ]),
    litShareMean: round4(
      fold.litShare.reduce((sum, v) => sum + v, 0) / fold.litShare.length
    ),
    whiteShare: fold.whiteShare.map(round4),
    reverseShare: fold.reverseShare.map(round4),
    classMoveEvents: fold.classMoveEvents,
    classMoveLitEvents: fold.classMoveLitEvents,
    ghostPct: pct(fold.classMoveGlyphHeld, fold.classMoveLitEvents),
    total: { ...summarise(total), name: 'TOTAL' },
    perClass: [...rows.values()]
      .sort((a, b) => b.cells - a.cells)
      .map(summarise),
    edge: summarise(edge),
  };
}

function emptyRow(cls) {
  return {
    cls,
    cells: 0,
    lit: 0,
    glyphChange: 0,
    glyphFlip: 0,
    driveChange: 0,
    driveFlip: 0,
    reverseOrWhiteToggle: 0,
    churn: 0,
    runSum: 0,
    runCount: 0,
  };
}

function summariseRow(row, pairs, triples) {
  return {
    name: classLabel(row.cls),
    cells: row.cells,
    lit: row.lit,
    glyphChangePct: pct(row.glyphChange, row.cells * pairs),
    glyphFlipPct: pct(row.glyphFlip, row.cells * triples),
    driveOrColourChangePct: pct(row.driveChange, row.cells * pairs),
    driveOrColourFlipPct: pct(row.driveFlip, row.cells * triples),
    reverseOrWhiteToggles: row.reverseOrWhiteToggle,
    churnCellsPct: pct(row.churn, row.cells),
    meanGlyphPersistenceFrames: round2(row.runSum / Math.max(1, row.runCount)),
  };
}

function requireLength(arr, n, what) {
  if (!arr || typeof arr.length !== 'number') {
    throw new Error(`foldFrame: ${what} is missing`);
  }
  if (arr.length !== n) {
    throw new Error(
      `foldFrame: ${what} has ${arr.length} entries, the grid has ${n}. ` +
        'The grid moved mid-sequence, so the frames are not comparable.'
    );
  }
}

/** A share as a percentage, and 0 rather than NaN for an empty population. */
function pct(numerator, denominator) {
  if (!(denominator > 0)) return 0;
  return Number(((100 * numerator) / denominator).toFixed(2));
}

function round2(v) {
  return Number(v.toFixed(2));
}

function round4(v) {
  return Number(v.toFixed(4));
}
