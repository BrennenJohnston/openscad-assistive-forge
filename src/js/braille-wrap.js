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
 * @param {Array<{ braille: string, cells: number }>} words - Translated words
 * @param {number} cellsPerLine - Line capacity in cells
 * @returns {string[]} Wrapped braille lines
 */
export function packWords(words, cellsPerLine) {
  const lines = [];
  let line = '';
  let lineCells = 0;

  for (const word of words) {
    if (lineCells === 0) {
      line = word.braille;
      lineCells = word.cells;
      continue;
    }
    if (lineCells + 1 + word.cells <= cellsPerLine) {
      line += BRAILLE_SPACE + word.braille;
      lineCells += 1 + word.cells;
    } else {
      lines.push(line);
      line = word.braille;
      lineCells = word.cells;
    }
  }
  if (lineCells > 0) lines.push(line);
  return lines;
}

/**
 * Chunk wrapped lines into cards of at most `rowsPerCard` lines each.
 * @param {string[]} lines - Wrapped braille lines
 * @param {number} rowsPerCard - Max rows on one card
 * @returns {string[][]} One entry per card
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
 * @param {number} [opts.maxTotalLines=20] - Hard ceiling from the SCAD's
 *   Line_1..Line_N parameter count
 * @returns {Promise<{
 *   cards: string[][],
 *   allLines: string[],
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
      wrapped.push('');
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
      wrapped.push(braille);
      continue;
    }

    const words = [];
    for (const sourceWord of trimmed.split(/\s+/)) {
      const braille = await translate(sourceWord);
      const cells = countCells(braille);

      if (cells <= cellsPerLine) {
        words.push({ braille, cells });
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
        words.push({ braille, cells });
        continue;
      }

      let anySegmentTooLong = false;
      for (const segment of segments) {
        const segBraille = await translate(segment);
        const segCells = countCells(segBraille);
        if (segCells > cellsPerLine) anySegmentTooLong = true;
        words.push({ braille: segBraille, cells: segCells });
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

    wrapped.push(...packWords(words, cellsPerLine));
  }

  // Drop trailing blank lines (they carry no content).
  while (wrapped.length > 0 && wrapped[wrapped.length - 1] === '') {
    wrapped.pop();
  }

  let allLines = wrapped;
  if (allLines.length > maxTotalLines) {
    warnings.push({
      type: 'too-many-lines',
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
 * Shorten long user strings for warning messages.
 * @param {string} str
 * @returns {string}
 */
function truncateForMessage(str) {
  return str.length > 40 ? `${str.slice(0, 37)}…` : str;
}
