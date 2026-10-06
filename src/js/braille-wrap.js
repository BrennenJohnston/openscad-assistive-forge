/**
 * Braille layout engine — capacity math, BANA-style word wrapping, and
 * multi-card splitting for the Braille Card Customizer.
 *
 * All geometry inputs are millimeters and mirror the wedge-card SCAD
 * parameters. Translation itself is NOT done here: callers supply an async
 * `translate(text)` function (see braille-translator.js) that answers
 * `{ braille, inputPos }`, where `inputPos` gives for each cell the index of
 * the character it came from (or is null). A plain braille string is also
 * accepted, read as braille with no positions. This keeps every function
 * in this module either pure or testable with a stub translator.
 *
 * Wrapping rules, for cards and signs (UEB and the BANA fact sheet):
 * - A typed line is translated once, whole: capital passages and other
 *   indicators span words (UEB 8.5.7), so translating word by word changes
 *   the braille. A new typed line starts afresh (UEB 8.5.6).
 * - The braille is cut into words at its blank cells and packed greedily;
 *   lines break only between words, so wrapping never changes a cell.
 * - A braille word longer than a line is divided in the braille itself; no
 *   piece is translated again. An email or web address divides after
 *   @ . - / : _ and a number after a period or comma, never between digits,
 *   and each of their rows but the last ends with the line continuation
 *   sign, dot 5 (BANA's business card guidelines, UEB 6.10), which the row
 *   must hold too. When a row cannot, the word is divided without the sign,
 *   the guidelines' last resort. Any other word divides after . - / : and
 *   gains nothing: a hyphen or a slash already ends its row (UEB 10.13.2,
 *   7.4.1).
 * - User newlines are hard breaks.
 *
 * @license GPL-3.0-or-later
 */

/** Unicode braille blank cell (used instead of ASCII space in output). */
export const BRAILLE_SPACE = '\u2800';

/** The line continuation sign (dot 5). */
const LINE_CONTINUATION = '\u2810';

/** Characters after which an over-long word of each kind may be divided. */
const DIVIDE_AFTER = {
  address: ['@', '.', '-', '/', ':', '_'],
  number: ['.', ','],
  other: ['.', '-', '/', ':'],
};

/**
 * Count braille cells in a translated string. Braille patterns live in the
 * BMP (U+2800–U+28FF) so string length equals cell count, but spread the
 * string anyway so stray astral characters cannot skew the count.
 * @param {string} braille - Translated braille string
 * @returns {number} Cell count
 */
export function countCells(braille) {
  return [...braille].length;
}

/**
 * Compute line/row capacity from card geometry.
 *
 * cellsPerLine = floor((cardWidth − 2·margin) / cellSpacing)
 * rowsPerCard  = min(maxRowsPerCard, floor((cardHeight − 2·margin) / lineSpacing))
 *
 * The flooring intentionally leaves one spacing unit of slack for the
 * physical dot extent beyond cell centers.
 *
 * @param {Object} opts
 * @param {number} opts.cardWidthMm - Card face width (mm)
 * @param {number} opts.cardHeightMm - Card face height (mm)
 * @param {number} opts.marginMm - Margin on every edge (mm)
 * @param {number} opts.cellSpacingMm - Horizontal cell pitch (mm)
 * @param {number} opts.lineSpacingMm - Vertical line pitch (mm)
 * @param {number} opts.maxRowsPerCard - User cap on rows per card
 * @returns {{ cellsPerLine: number, rowsPerCard: number }}
 */
export function computeCapacity({
  cardWidthMm,
  cardHeightMm,
  marginMm,
  cellSpacingMm,
  lineSpacingMm,
  maxRowsPerCard,
}) {
  const usableWidth = cardWidthMm - 2 * marginMm;
  const usableHeight = cardHeightMm - 2 * marginMm;

  const cellsPerLine = Math.max(
    1,
    Math.floor(usableWidth / Math.max(cellSpacingMm, 0.01))
  );
  const rowsFromHeight = Math.max(
    1,
    Math.floor(usableHeight / Math.max(lineSpacingMm, 0.01))
  );
  const rowsPerCard = Math.max(
    1,
    Math.min(Math.max(1, Math.floor(maxRowsPerCard)), rowsFromHeight)
  );

  return { cellsPerLine, rowsPerCard };
}

/**
 * Greedily pack translated words into lines of at most `cellsPerLine`
 * cells, breaking only at word boundaries. Words are joined by a single
 * braille blank cell. Pure and synchronous.
 *
 * Each word may carry its original (untranslated) `source` text; packed
 * lines return the joined source alongside the braille so previews can
 * show the print-language text under each braille line.
 *
 * When `maxSourceChars` is finite the packed source text (words joined by
 * one space) is a second line-break constraint. Sign mode uses this: each
 * wrapped line is also a row of raised Latin letters, which must fit the
 * plate width just like the braille cells must.
 *
 * @param {Array<{ braille: string, cells: number, source?: string }>} words
 *   Translated words
 * @param {number} cellsPerLine - Line capacity in cells
 * @param {number} [maxSourceChars=Infinity] - Line capacity in source
 *   (print-language) characters
 * @returns {Array<{ braille: string, source: string }>} Wrapped lines
 */
export function packWords(words, cellsPerLine, maxSourceChars = Infinity) {
  const lines = [];
  let line = '';
  let lineCells = 0;
  let lineSrcLen = 0;
  let lineSources = [];

  for (const word of words) {
    const srcLen = [...(word.source ?? '')].length;
    if (lineCells === 0) {
      line = word.braille;
      lineCells = word.cells;
      lineSrcLen = srcLen;
      lineSources = [word.source ?? ''];
      continue;
    }
    if (
      lineCells + 1 + word.cells <= cellsPerLine &&
      lineSrcLen + 1 + srcLen <= maxSourceChars
    ) {
      line += BRAILLE_SPACE + word.braille;
      lineCells += 1 + word.cells;
      lineSrcLen += 1 + srcLen;
      lineSources.push(word.source ?? '');
    } else {
      lines.push({ braille: line, source: lineSources.join(' ') });
      line = word.braille;
      lineCells = word.cells;
      lineSrcLen = srcLen;
      lineSources = [word.source ?? ''];
    }
  }
  if (lineCells > 0) {
    lines.push({ braille: line, source: lineSources.join(' ') });
  }
  return lines;
}

/**
 * Chunk wrapped lines into cards of at most `rowsPerCard` lines each.
 * Sequential groups, blanks included — the SCAD All-cards layout mode
 * mirrors this chunking exactly (see braille_wedge_card.scad), so any
 * change here must be reflected there (covered by a parity unit test).
 * @param {Array} lines - Wrapped lines (braille strings or line objects)
 * @param {number} rowsPerCard - Max rows on one card
 * @returns {Array<Array>} One entry per card
 */
export function chunkIntoCards(lines, rowsPerCard) {
  if (lines.length === 0) return [[]];
  const cards = [];
  for (let i = 0; i < lines.length; i += rowsPerCard) {
    cards.push(lines.slice(i, i + rowsPerCard));
  }
  return cards;
}

/**
 * A translator may answer with `{ braille, inputPos }` or with the braille
 * alone; positions are used only when there is one for every cell.
 * @param {string|{ braille: string, inputPos?: number[]|null }} answer
 * @returns {{ braille: string, inputPos: number[]|null }}
 */
function asTranslation(answer) {
  if (typeof answer === 'string') return { braille: answer, inputPos: null };
  const braille = String(answer.braille);
  const inputPos = Array.isArray(answer.inputPos) ? answer.inputPos : null;
  return {
    braille,
    inputPos:
      inputPos && inputPos.length === countCells(braille) ? inputPos : null,
  };
}

/**
 * The braille words of a translated line: [start, end) cell ranges between
 * runs of blank cells.
 * @param {string[]} cells
 * @returns {Array<[number, number]>}
 */
function wordSpans(cells) {
  const spans = [];
  let start = -1;
  cells.forEach((cell, i) => {
    if (cell === BRAILLE_SPACE) {
      if (start >= 0) spans.push([start, i]);
      start = -1;
    } else if (start < 0) {
      start = i;
    }
  });
  if (start >= 0) spans.push([start, cells.length]);
  return spans;
}

/**
 * Where each braille word's typed text lies in the line: from the character
 * its first cell came from to the next word's (the first word from the
 * line's start, the last to its end). Null without positions, or when they
 * do not run forward from word to word.
 * @param {string} line
 * @param {Array<[number, number]>} spans
 * @param {number[]|null} inputPos
 * @returns {Array<[number, number]>|null}
 */
function wordRanges(line, spans, inputPos) {
  if (!inputPos) return null;
  const starts = spans.map(([start]) => inputPos[start]);
  if (starts.some((p, k) => k > 0 && !(p > starts[k - 1]))) return null;
  return starts.map((p, k) => [k === 0 ? 0 : p, starts[k + 1] ?? line.length]);
}

/**
 * The kind of a word's typed text, for dividing it. A slash alone does not
 * make an address: words joined by a slash, and dates, divide after it with
 * no sign (UEB 7.4.1); it counts after a domain name, as in example.org/visit.
 * @param {string} source
 * @returns {'address'|'number'|'other'}
 */
function wordKind(source) {
  const core = source.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  if (/@|:\/\/|^www\./i.test(core) || /^[^/]*\.\p{L}[^/]*\//u.test(core)) {
    return 'address';
  }
  if (/^\d+(?:[.,]\d+)+$/.test(core)) return 'number';
  return 'other';
}

/**
 * Cells of a braille word at which a new line may start: the first cell
 * past each of `divideAfter` in the word's typed text.
 * @param {string} line
 * @param {number[]} inputPos
 * @param {number} start - The word's first cell
 * @param {number} end - Past the word's last cell
 * @param {string[]} divideAfter
 * @returns {number[]} Cell indexes, ascending, inside (start, end)
 */
function divisionPoints(line, inputPos, start, end, divideAfter) {
  const points = new Set();
  for (let i = start; i < end; i++) {
    if (!divideAfter.includes(line[inputPos[i]])) continue;
    let j = i + 1;
    while (j < end && inputPos[j] <= inputPos[i]) j++;
    if (j < end) points.add(j);
  }
  return [...points].sort((a, b) => a - b);
}

/**
 * Group a word's cells into pieces that each fill a line, cutting only at
 * division points. Every piece but the last is followed by `signCells` more
 * cells, which its line must hold too. A piece longer than a line is kept
 * whole.
 * @returns {Array<[number, number]>} [start, end) cell ranges
 */
function divideWord(start, end, points, cellsPerLine, signCells = 0) {
  const pieces = [];
  let pieceStart = start;
  let lastFit = start;
  const fits = (cut) =>
    cut - pieceStart + (cut === end ? 0 : signCells) <= cellsPerLine;
  for (const cut of [...points, end]) {
    if (fits(cut)) {
      lastFit = cut;
      continue;
    }
    if (lastFit > pieceStart) {
      pieces.push([pieceStart, lastFit]);
      pieceStart = lastFit;
    }
    if (fits(cut)) {
      lastFit = cut;
      continue;
    }
    pieces.push([pieceStart, cut]);
    pieceStart = cut;
    lastFit = cut;
  }
  if (lastFit > pieceStart) pieces.push([pieceStart, lastFit]);
  return pieces;
}

/**
 * Translate one typed line whole and cut its braille into words, each with
 * the typed text it came from. Without usable positions, braille words
 * take the typed words in order when the counts match, or else the first
 * takes the whole line. A word longer than a line is divided in the braille
 * itself (see divideWord); nothing is translated again, so every cell is
 * the whole line's.
 * @param {string} line - One typed line, words separated by single spaces
 * @param {function} translate - See layoutBrailleText
 * @param {number} cellsPerLine
 * @returns {Promise<{
 *   words: Array<{ braille: string, cells: number, source: string }>,
 *   overlong: Array<{ source: string, cells: number, divided: boolean }>,
 *   continued: string[],
 * }>} `overlong` lists the words that still overflow a line: whole when
 *   they could not be divided, or a piece of them when they were;
 *   `continued` lists the words divided with the line continuation sign
 */
async function translateLine(line, translate, cellsPerLine) {
  const { braille, inputPos } = asTranslation(await translate(line));
  const cells = Array.from(braille);
  const spans = wordSpans(cells);
  const ranges = wordRanges(line, spans, inputPos);
  const typed = line.split(' ');
  const sourceOf = (k) => {
    if (ranges) return line.slice(...ranges[k]).trim();
    if (typed.length === spans.length) return typed[k];
    return k === 0 ? line : '';
  };
  const piece = (from, to, source, sign = '') => ({
    braille: cells.slice(from, to).join('') + sign,
    cells: to - from + countCells(sign),
    source,
  });

  const words = [];
  const overlong = [];
  const continued = [];
  spans.forEach(([start, end], k) => {
    const source = sourceOf(k);
    if (end - start <= cellsPerLine) {
      words.push(piece(start, end, source));
      return;
    }
    const kind = wordKind(source);
    const points = ranges
      ? divisionPoints(line, inputPos, start, end, DIVIDE_AFTER[kind])
      : [];
    if (points.length === 0) {
      words.push(piece(start, end, source));
      overlong.push({ source, cells: end - start, divided: false });
      return;
    }
    const [wordFrom, wordTo] = ranges[k];
    const overflows = (pieces, signCells) =>
      pieces.some(
        ([from, to], i) =>
          to - from + (i < pieces.length - 1 ? signCells : 0) > cellsPerLine
      );
    let sign = kind === 'other' ? '' : LINE_CONTINUATION;
    let pieces = divideWord(start, end, points, cellsPerLine, countCells(sign));
    if (sign && overflows(pieces, countCells(sign))) {
      sign = '';
      pieces = divideWord(start, end, points, cellsPerLine);
    }
    pieces.forEach(([from, to], i) => {
      const sourceFrom = from === start ? wordFrom : inputPos[from];
      const sourceTo = to === end ? wordTo : inputPos[to];
      const text = line.slice(sourceFrom, sourceTo).trim();
      words.push(piece(from, to, text, i < pieces.length - 1 ? sign : ''));
    });
    if (overflows(pieces, countCells(sign))) {
      overlong.push({ source, cells: end - start, divided: true });
    } else if (sign) {
      continued.push(source);
    }
  });
  return { words, overlong, continued };
}

/**
 * Note once each word a layout divided with the line continuation sign.
 * @param {Array<{ type: string, message: string }>} warnings
 * @param {string[]} continued - The divided words' typed text
 */
function noteContinued(warnings, continued) {
  for (const source of continued) {
    const message =
      `"${truncateForMessage(source)}" is divided across rows. Each row ` +
      `but the last ends with the line continuation sign (dot 5).`;
    if (!warnings.some((w) => w.message === message)) {
      warnings.push({ type: 'line-continuation', message });
    }
  }
}

/**
 * Pack one translated line's words into rows; a row's text leaves out the
 * gap an empty source would leave.
 * @param {Array<{ braille: string, cells: number, source: string }>} words
 * @param {number} cellsPerLine
 * @param {number} [maxSourceChars=Infinity]
 * @returns {Array<{ braille: string, source: string }>}
 */
function packLine(words, cellsPerLine, maxSourceChars = Infinity) {
  return packWords(words, cellsPerLine, maxSourceChars).map((row) => ({
    braille: row.braille,
    source: row.source.split(' ').filter(Boolean).join(' '),
  }));
}

/**
 * Full layout pipeline: translate, wrap, and split plain text into braille
 * cards.
 *
 * @param {Object} opts
 * @param {string} opts.text - Plain input text (user newlines are hard breaks)
 * @param {function(string): Promise<{ braille: string, inputPos: (number[]|null) }|string>} opts.translate -
 *   Async line translator (see the module notes)
 * @param {number} opts.cellsPerLine - Line capacity in cells
 * @param {number} opts.rowsPerCard - Max rows per card
 * @param {boolean} [opts.autoWrap=true] - Wrap at word boundaries; when
 *   false each user line is translated whole and only hard breaks apply
 * @param {boolean} [opts.splitCards=true] - Split overflow onto more cards;
 *   when false everything stays on one card and overflow warns
 * @param {number} [opts.maxSourceChars=Infinity] - Additional per-line
 *   capacity in source (print-language) characters; sign mode passes the
 *   raised-letter row capacity here so wrapped lines fit both scripts
 * @param {number} [opts.maxTotalLines=20] - Hard ceiling from the SCAD's
 *   Line_1..Line_N parameter count
 * @returns {Promise<{
 *   cards: Array<Array<{ braille: string, source: string }>>,
 *   allLines: Array<{ braille: string, source: string }>,
 *   warnings: Array<{ type: string, message: string }>,
 *   cellsPerLine: number,
 * }>}
 */
export async function layoutBrailleText({
  text,
  translate,
  cellsPerLine,
  rowsPerCard,
  autoWrap = true,
  splitCards = true,
  maxSourceChars = Infinity,
  maxTotalLines = 20,
}) {
  const warnings = [];
  const wrapped = [];

  const sourceLines = text.replace(/\r\n?/g, '\n').split('\n');

  for (const sourceLine of sourceLines) {
    const trimmed = sourceLine.trim();
    if (trimmed === '') {
      // Preserve intentional blank lines between content (SCAD does too),
      // but let trailing blanks fall away naturally via later truncation.
      wrapped.push({ braille: '', source: '' });
      continue;
    }

    if (!autoWrap) {
      const { braille } = asTranslation(await translate(trimmed));
      if (countCells(braille) > cellsPerLine) {
        warnings.push({
          type: 'line-overflow',
          message:
            `"${truncateForMessage(trimmed)}" is ${countCells(braille)} cells ` +
            `but the line capacity is ${cellsPerLine}. Turn on auto-wrap, ` +
            `shorten the line, or reduce the margin.`,
        });
      }
      wrapped.push({ braille, source: trimmed });
      continue;
    }

    const line = trimmed.split(/\s+/).join(' ');
    for (const typedWord of line.split(' ')) {
      const sourceChars = [...typedWord].length;
      if (sourceChars > maxSourceChars) {
        warnings.push({
          type: 'word-too-long',
          message:
            `"${truncateForMessage(typedWord)}" is ${sourceChars} characters ` +
            `but a row of raised letters only holds about ${maxSourceChars}. ` +
            `Shorten it or widen the sign.`,
        });
      }
    }

    const { words, overlong, continued } = await translateLine(
      line,
      translate,
      cellsPerLine
    );
    for (const { source, cells, divided } of overlong) {
      warnings.push({
        type: 'word-too-long',
        message: divided
          ? `Part of "${truncateForMessage(source)}" is still longer ` +
            `than one line even after dividing at punctuation. Shorten it, ` +
            `reduce the margin, or widen the card.`
          : `"${truncateForMessage(source)}" needs ${cells} cells but a ` +
            `line only holds ${cellsPerLine}. It cannot be divided ` +
            `automatically. Shorten it, reduce the margin, or widen the card.`,
      });
    }
    noteContinued(warnings, continued);

    wrapped.push(...packLine(words, cellsPerLine, maxSourceChars));
  }

  // Drop trailing blank lines (they carry no content).
  while (wrapped.length > 0 && wrapped[wrapped.length - 1].braille === '') {
    wrapped.pop();
  }

  let allLines = wrapped;
  if (allLines.length > maxTotalLines) {
    warnings.push({
      type: 'too-many-lines',
      needed: allLines.length,
      available: maxTotalLines,
      message:
        `The text needs ${allLines.length} braille lines but only ` +
        `${maxTotalLines} are available. The extra lines were dropped.`,
    });
    allLines = allLines.slice(0, maxTotalLines);
  }

  let cards;
  if (splitCards) {
    cards = chunkIntoCards(allLines, rowsPerCard);
  } else {
    cards = [allLines];
    if (allLines.length > rowsPerCard) {
      warnings.push({
        type: 'rows-overflow',
        message:
          `The text needs ${allLines.length} rows but the card holds ` +
          `${rowsPerCard}. Turn on "Split overflow into additional cards" ` +
          `or raise "Max rows per card".`,
      });
    }
  }

  return { cards, allLines, warnings, cellsPerLine };
}

/**
 * Sign-mode layout: wrap the raised-letter rows and the braille rows
 * independently from the same text.
 *
 * ADA 703.3.2 (and the BANA signage guidelines) place braille below the
 * ENTIRE raised text as one block — braille line breaks do not have to
 * mirror the print line breaks. Raised letters (~16 mm characters) hold
 * far fewer characters per row than braille (~7 mm cells), so mirroring
 * the letter rows would leave most of each braille row blank. Instead:
 *
 * 1. Letter rows are packed on source-character capacity alone, from the
 *    typed words; no translation is needed for them.
 * 2. Each typed line's surviving words are translated once, whole (capital
 *    passages span words), and the braille is cut into rows at its blank
 *    cells on cell capacity alone, as on a card.
 *
 * User newlines stay hard breaks in both scripts. When the letter rows
 * exceed `maxRows`, the overflow is dropped and the braille pass only
 * packs the words that survived, so the two plates always carry the
 * same content.
 *
 * @param {Object} opts
 * @param {string} opts.text - Plain input text
 * @param {function(string): Promise<{ braille: string, inputPos: (number[]|null) }|string>} opts.translate -
 *   Async line translator (see the module notes)
 * @param {number} opts.maxSourceChars - Letter-row capacity, in print
 *   characters or in the units of `measureSource`
 * @param {function(string): number} [opts.measureSource] - Width of a row
 *   of raised letters; defaults to its character count. The sign passes its
 *   letters' real widths in mm. With a measure the caller keeps
 *   `maxSourceChars` at least the widest word, as the sign's auto-fit does.
 * @param {number|function(number): number} opts.brailleCellsPerLine -
 *   Braille row capacity in cells, or a function of the longest packed
 *   letter row (measured as above) so the caller can derive the capacity
 *   from the final auto-fit sign width
 * @param {number} opts.maxRows - Row ceiling for each plate (the SCAD's
 *   Line_N / sign_text_N parameter count)
 * @param {boolean} [opts.skipBrailleRows=false] - Lay out the raised
 *   letters only and return `brailleRows: []`. For the braille editor,
 *   which supplies the braille plate's rows verbatim: translating text
 *   whose output is about to be discarded would also raise cell-capacity
 *   warnings about braille the sign is not going to carry.
 * @returns {Promise<{
 *   textRows: Array<{ source: string }>,
 *   brailleRows: Array<{ braille: string, source: string }>,
 *   warnings: Array<{ type: string, message: string }>,
 *   brailleCellsPerLine: number,
 *   longestRowChars: number,
 * }>}
 */
export async function layoutSignText({
  text,
  translate,
  maxSourceChars,
  measureSource,
  brailleCellsPerLine,
  maxRows,
  skipBrailleRows = false,
}) {
  const warnings = [];
  const measure = measureSource ?? ((source) => [...source].length);

  // Hard user lines -> typed word lists (null marks an intentional blank
  // line).
  const userLines = [];
  for (const sourceLine of text.replace(/\r\n?/g, '\n').split('\n')) {
    const trimmed = sourceLine.trim();
    userLines.push(
      trimmed === '' ? null : trimmed.split(/\s+/).map((source) => ({ source }))
    );
  }

  // Pass 1 — letter rows, packed on the source text only (characters, or
  // the caller's measure). Each row keeps its word objects and user-line
  // index so the braille pass can reflow exactly the words that survive
  // the row ceiling.
  const joinSources = (row) => row.map((w) => w.source).join(' ');
  const textRows = [];
  userLines.forEach((words, lineIdx) => {
    if (words === null) {
      textRows.push({ source: '', words: [], lineIdx });
      return;
    }
    let row = [];
    const pushRow = () =>
      textRows.push({
        source: joinSources(row),
        words: row,
        lineIdx,
      });
    for (const word of words) {
      const srcLen = [...word.source].length;
      if (!measureSource && srcLen > maxSourceChars) {
        warnings.push({
          type: 'word-too-long',
          message:
            `"${truncateForMessage(word.source)}" is ${srcLen} characters ` +
            `but a row of raised letters only holds about ${maxSourceChars}. ` +
            `Shorten it or widen the sign.`,
        });
      }
      if (row.length === 0) {
        row = [word];
      } else if (measure(joinSources([...row, word])) <= maxSourceChars) {
        row.push(word);
      } else {
        pushRow();
        row = [word];
      }
    }
    if (row.length > 0) pushRow();
  });
  while (
    textRows.length > 0 &&
    textRows[textRows.length - 1].words.length === 0
  ) {
    textRows.pop();
  }

  let keptTextRows = textRows;
  if (textRows.length > maxRows) {
    warnings.push({
      type: 'too-many-lines',
      needed: textRows.length,
      available: maxRows,
      message:
        `The text needs ${textRows.length} rows of raised letters but ` +
        `only ${maxRows} are available. The extra rows were dropped.`,
    });
    keptTextRows = textRows.slice(0, maxRows);
  }

  // The longest surviving letter row drives the final auto-fit sign
  // width, which in turn sets the braille capacity.
  const longestRowChars = keptTextRows.reduce(
    (max, row) => Math.max(max, [...row.source].length),
    0
  );
  const longestRow = keptTextRows.reduce(
    (max, row) => Math.max(max, measure(row.source)),
    0
  );
  const cellsPerLine = Math.max(
    1,
    typeof brailleCellsPerLine === 'function'
      ? brailleCellsPerLine(longestRow)
      : brailleCellsPerLine
  );

  if (skipBrailleRows) {
    return {
      textRows: keptTextRows.map(({ source }) => ({ source })),
      brailleRows: [],
      warnings,
      brailleCellsPerLine: cellsPerLine,
      longestRowChars,
    };
  }

  // Regroup the surviving words by user line (hard breaks preserved;
  // blank user lines become their own empty groups).
  const groups = [];
  for (const row of keptTextRows) {
    const last = groups[groups.length - 1];
    if (last && last.lineIdx === row.lineIdx) {
      last.words.push(...row.words);
    } else {
      groups.push({ lineIdx: row.lineIdx, words: [...row.words] });
    }
  }

  // Pass 2 — braille rows: each user line's surviving words are translated
  // once, whole, and packed on cells only.
  let brailleRows = [];
  for (const group of groups) {
    if (group.words.length === 0) {
      brailleRows.push({ braille: '', source: '' });
      continue;
    }
    const line = group.words.map((word) => word.source).join(' ');
    const { words, overlong, continued } = await translateLine(
      line,
      translate,
      cellsPerLine
    );
    for (const { source, cells, divided } of overlong) {
      warnings.push({
        type: 'word-too-long',
        message: divided
          ? `Part of "${truncateForMessage(source)}" is still longer ` +
            `than one braille row even after dividing at punctuation. ` +
            `Shorten it or widen the sign.`
          : `"${truncateForMessage(source)}" needs ${cells} braille cells ` +
            `but a row only holds ${cellsPerLine}. It cannot be divided ` +
            `automatically. Shorten it or widen the sign.`,
      });
    }
    noteContinued(warnings, continued);
    brailleRows.push(...packLine(words, cellsPerLine));
  }
  if (brailleRows.length > maxRows) {
    warnings.push({
      type: 'too-many-lines',
      needed: brailleRows.length,
      available: maxRows,
      message:
        `The braille needs ${brailleRows.length} rows but only ${maxRows} ` +
        `are available. The extra rows were dropped.`,
    });
    brailleRows = brailleRows.slice(0, maxRows);
  }

  return {
    textRows: keptTextRows.map(({ source }) => ({ source })),
    brailleRows,
    warnings,
    brailleCellsPerLine: cellsPerLine,
    longestRowChars,
  };
}

/**
 * Layout for the Braille Charm: every character but a space becomes its own
 * charm and is translated alone. A charm is read on its own, so each one
 * carries its own capital or number sign ("B" is the capital sign and b).
 * @param {Object} opts
 * @param {string} opts.text - The characters typed
 * @param {function} opts.translate - See layoutBrailleText
 * @returns {Promise<Array<{ braille: string, source: string }>>} One per charm
 */
export async function layoutCharmText({ text, translate }) {
  const charms = [];
  for (const ch of text) {
    if (/\s/u.test(ch)) continue;
    const { braille } = asTranslation(await translate(ch));
    charms.push({ braille, source: ch });
  }
  return charms;
}

/**
 * Shorten long user strings for warning messages.
 * @param {string} str
 * @returns {string}
 */
function truncateForMessage(str) {
  return str.length > 40 ? `${str.slice(0, 37)}…` : str;
}
