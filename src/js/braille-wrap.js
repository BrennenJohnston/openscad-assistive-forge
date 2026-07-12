/**
 * Braille layout engine — capacity math, BANA-style word wrapping, and
 * multi-card splitting for the Braille Card Customizer.
 *
 * All geometry inputs are millimetres and mirror the wedge-card SCAD
 * parameters. Translation itself is NOT done here: callers supply an async
 * `translate(text) => braille` function (see braille-translator.js), which
 * keeps every function in this module either pure or trivially testable
 * with a stub translator.
 *
 * v1 wrapping rules (BANA fact sheet, simplified):
 * - Words are whitespace-separated and translated individually
 *   (contractions never span spaces, so per-word translation matches
 *   whole-line translation for standard tables).
 * - Lines break only at word boundaries; words are packed greedily.
 * - A single word longer than the line capacity is divided after
 *   punctuation (@ . - / :) — the BANA-recommended division points for
 *   emails and URLs. Dot-5 continuation indicators are a documented
 *   follow-up, not v1.
 * - User newlines are hard breaks.
 *
 * @license GPL-3.0-or-later
 */

/** Unicode braille blank cell (used instead of ASCII space in output). */
export const BRAILLE_SPACE = '\u2800';

/** Characters after which an over-long word may be divided (BANA fact sheet). */
const BREAK_AFTER_CHARS = ['@', '.', '-', '/', ':'];

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
 * physical dot extent beyond cell centres.
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
 * Split an over-long word into segments after BANA punctuation characters.
 * "name@example.com" → ["name@", "example.", "com"].
 * Words without punctuation come back as a single segment.
 * @param {string} word - Source (untranslated) word
 * @returns {string[]} Segments, in order, concat equals the input
 */
export function splitWordAfterPunctuation(word) {
  const segments = [];
  let current = '';
  for (const ch of word) {
    current += ch;
    if (BREAK_AFTER_CHARS.includes(ch)) {
      segments.push(current);
      current = '';
    }
  }
  if (current) segments.push(current);
  return segments;
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
 * Full layout pipeline: translate, wrap, and split plain text into braille
 * cards.
 *
 * @param {Object} opts
 * @param {string} opts.text - Plain input text (user newlines are hard breaks)
 * @param {function(string): Promise<string>} opts.translate - Async word/line
 *   translator returning Unicode braille (untranslatable input may throw or
 *   return braille containing replacement output — both are surfaced as
 *   warnings, not exceptions)
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
      const braille = await translate(trimmed);
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

    const words = [];
    for (const sourceWord of trimmed.split(/\s+/)) {
      const braille = await translate(sourceWord);
      const cells = countCells(braille);
      const sourceChars = [...sourceWord].length;

      if (sourceChars > maxSourceChars) {
        warnings.push({
          type: 'word-too-long',
          message:
            `"${truncateForMessage(sourceWord)}" is ${sourceChars} characters ` +
            `but a row of raised letters only holds about ${maxSourceChars}. ` +
            `Shorten it or widen the sign.`,
        });
      }

      if (cells <= cellsPerLine) {
        words.push({ braille, cells, source: sourceWord });
        continue;
      }

      // Over-long word: divide after BANA punctuation and translate the
      // pieces individually.
      const segments = splitWordAfterPunctuation(sourceWord);
      if (segments.length === 1) {
        warnings.push({
          type: 'word-too-long',
          message:
            `"${truncateForMessage(sourceWord)}" needs ${cells} cells but a ` +
            `line only holds ${cellsPerLine}. It cannot be divided ` +
            `automatically — shorten it, reduce the margin, or widen the card.`,
        });
        words.push({ braille, cells, source: sourceWord });
        continue;
      }

      let anySegmentTooLong = false;
      for (const segment of segments) {
        const segBraille = await translate(segment);
        const segCells = countCells(segBraille);
        if (segCells > cellsPerLine) anySegmentTooLong = true;
        words.push({ braille: segBraille, cells: segCells, source: segment });
      }
      if (anySegmentTooLong) {
        warnings.push({
          type: 'word-too-long',
          message:
            `Part of "${truncateForMessage(sourceWord)}" is still longer ` +
            `than one line even after dividing at punctuation. Shorten it, ` +
            `reduce the margin, or widen the card.`,
        });
      }
    }

    wrapped.push(...packWords(words, cellsPerLine, maxSourceChars));
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
 * 1. Letter rows are packed on source-character capacity alone.
 * 2. Braille rows reflow the same words on cell capacity alone.
 *
 * User newlines stay hard breaks in both scripts. When the letter rows
 * exceed `maxRows`, the overflow is dropped and the braille pass only
 * packs the words that survived, so the two plates always carry the
 * same content.
 *
 * @param {Object} opts
 * @param {string} opts.text - Plain input text
 * @param {function(string): Promise<string>} opts.translate - Async word
 *   translator returning Unicode braille
 * @param {number} opts.maxSourceChars - Letter-row capacity in print
 *   characters
 * @param {number|function(number): number} opts.brailleCellsPerLine -
 *   Braille row capacity in cells, or a function of the longest packed
 *   letter row (in source characters) so the caller can derive the
 *   capacity from the final auto-fit sign width
 * @param {number} opts.maxRows - Row ceiling for each plate (the SCAD's
 *   Line_N / sign_text_N parameter count)
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
  brailleCellsPerLine,
  maxRows,
}) {
  const warnings = [];

  // Translate every distinct word once; both passes share the results.
  const cache = new Map();
  const translateCached = async (t) => {
    if (!cache.has(t)) cache.set(t, await translate(t));
    return cache.get(t);
  };

  // Hard user lines -> word lists (null marks an intentional blank line).
  const userLines = [];
  for (const sourceLine of text.replace(/\r\n?/g, '\n').split('\n')) {
    const trimmed = sourceLine.trim();
    if (trimmed === '') {
      userLines.push(null);
      continue;
    }
    const words = [];
    for (const source of trimmed.split(/\s+/)) {
      const braille = await translateCached(source);
      words.push({ source, braille, cells: countCells(braille) });
    }
    userLines.push(words);
  }

  // Pass 1 — letter rows, packed on source characters only. Each row
  // keeps its word objects and user-line index so the braille pass can
  // reflow exactly the words that survive the row ceiling.
  const textRows = [];
  userLines.forEach((words, lineIdx) => {
    if (words === null) {
      textRows.push({ source: '', words: [], lineIdx });
      return;
    }
    let row = [];
    let rowLen = 0;
    const pushRow = () =>
      textRows.push({
        source: row.map((w) => w.source).join(' '),
        words: row,
        lineIdx,
      });
    for (const word of words) {
      const srcLen = [...word.source].length;
      if (srcLen > maxSourceChars) {
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
        rowLen = srcLen;
      } else if (rowLen + 1 + srcLen <= maxSourceChars) {
        row.push(word);
        rowLen += 1 + srcLen;
      } else {
        pushRow();
        row = [word];
        rowLen = srcLen;
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
  const cellsPerLine = Math.max(
    1,
    typeof brailleCellsPerLine === 'function'
      ? brailleCellsPerLine(longestRowChars)
      : brailleCellsPerLine
  );

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

  // Pass 2 — braille rows, packed on cells only.
  let brailleRows = [];
  for (const group of groups) {
    if (group.words.length === 0) {
      brailleRows.push({ braille: '', source: '' });
      continue;
    }
    const packable = [];
    for (const word of group.words) {
      if (word.cells <= cellsPerLine) {
        packable.push(word);
        continue;
      }
      // Over-long word: divide after BANA punctuation and translate the
      // pieces individually (same rule as layoutBrailleText).
      const segments = splitWordAfterPunctuation(word.source);
      if (segments.length === 1) {
        warnings.push({
          type: 'word-too-long',
          message:
            `"${truncateForMessage(word.source)}" needs ${word.cells} ` +
            `braille cells but a row only holds ${cellsPerLine}. It cannot ` +
            `be divided automatically — shorten it or widen the sign.`,
        });
        packable.push(word);
        continue;
      }
      let anySegmentTooLong = false;
      for (const segment of segments) {
        const segBraille = await translateCached(segment);
        const segCells = countCells(segBraille);
        if (segCells > cellsPerLine) anySegmentTooLong = true;
        packable.push({ source: segment, braille: segBraille, cells: segCells });
      }
      if (anySegmentTooLong) {
        warnings.push({
          type: 'word-too-long',
          message:
            `Part of "${truncateForMessage(word.source)}" is still longer ` +
            `than one braille row even after dividing at punctuation. ` +
            `Shorten it or widen the sign.`,
        });
      }
    }
    brailleRows.push(...packWords(packable, cellsPerLine));
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
 * Shorten long user strings for warning messages.
 * @param {string} str
 * @returns {string}
 */
function truncateForMessage(str) {
  return str.length > 40 ? `${str.slice(0, 37)}…` : str;
}
