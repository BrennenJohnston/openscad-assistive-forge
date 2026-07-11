/**
 * Unit tests for the braille layout engine (braille-wrap.js)
 *
 * Uses a stub translator (1 char = 1 cell, uppercase adds an indicator
 * cell) so wrapping logic is tested independently of liblouis. Real
 * translation is covered by braille-liblouis.test.js.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';
import {
  BRAILLE_SPACE,
  countCells,
  computeCapacity,
  splitWordAfterPunctuation,
  packWords,
  chunkIntoCards,
  layoutBrailleText,
} from '../../src/js/braille-wrap.js';

/**
 * Stub translator: each character becomes one braille cell (⠿), capitals
 * add a leading indicator cell (⠠) like real UEB translation.
 */
async function stubTranslate(text) {
  let out = '';
  for (const ch of text) {
    if (/[A-Z]/.test(ch)) out += '\u2820\u283F';
    else out += '\u283F';
  }
  return out;
}

describe('countCells', () => {
  it('counts braille characters', () => {
    expect(countCells('\u2813\u2811\u2807\u2807\u2815')).toBe(5);
    expect(countCells('')).toBe(0);
  });
});

describe('computeCapacity', () => {
  it('matches the wedge card defaults (85mm card, 6mm margin, 7mm cells)', () => {
    const { cellsPerLine, rowsPerCard } = computeCapacity({
      cardWidthMm: 85,
      cardHeightMm: 55,
      marginMm: 6,
      cellSpacingMm: 7,
      lineSpacingMm: 10,
      maxRowsPerCard: 5,
    });
    // floor((85 - 12) / 7) = 10, floor((55 - 12) / 10) = 4
    expect(cellsPerLine).toBe(10);
    expect(rowsPerCard).toBe(4);
  });

  it('caps rows at maxRowsPerCard when the card is tall', () => {
    const { rowsPerCard } = computeCapacity({
      cardWidthMm: 85,
      cardHeightMm: 200,
      marginMm: 6,
      cellSpacingMm: 7,
      lineSpacingMm: 10,
      maxRowsPerCard: 5,
    });
    expect(rowsPerCard).toBe(5);
  });

  it('never returns less than 1 cell or row', () => {
    const { cellsPerLine, rowsPerCard } = computeCapacity({
      cardWidthMm: 10,
      cardHeightMm: 10,
      marginMm: 25,
      cellSpacingMm: 7,
      lineSpacingMm: 10,
      maxRowsPerCard: 5,
    });
    expect(cellsPerLine).toBe(1);
    expect(rowsPerCard).toBe(1);
  });

  it('wider margin reduces capacity (BANA standard margin)', () => {
    const narrow = computeCapacity({
      cardWidthMm: 85,
      cardHeightMm: 55,
      marginMm: 6,
      cellSpacingMm: 7,
      lineSpacingMm: 10,
      maxRowsPerCard: 5,
    });
    const standard = computeCapacity({
      cardWidthMm: 85,
      cardHeightMm: 55,
      marginMm: 12.7,
      cellSpacingMm: 7,
      lineSpacingMm: 10,
      maxRowsPerCard: 5,
    });
    expect(standard.cellsPerLine).toBeLessThan(narrow.cellsPerLine);
    expect(standard.rowsPerCard).toBeLessThan(narrow.rowsPerCard);
  });
});

describe('splitWordAfterPunctuation', () => {
  it('splits emails after @ and .', () => {
    expect(splitWordAfterPunctuation('name@example.com')).toEqual([
      'name@',
      'example.',
      'com',
    ]);
  });

  it('splits URLs after / and :', () => {
    expect(splitWordAfterPunctuation('https://a.io/x')).toEqual([
      'https:',
      '/',
      '/',
      'a.',
      'io/',
      'x',
    ]);
  });

  it('splits hyphenated words after -', () => {
    expect(splitWordAfterPunctuation('well-known')).toEqual([
      'well-',
      'known',
    ]);
  });

  it('returns single segment for plain words', () => {
    expect(splitWordAfterPunctuation('hello')).toEqual(['hello']);
  });

  it('segments concatenate back to the input', () => {
    const word = 'a.b@c-d/e:f';
    expect(splitWordAfterPunctuation(word).join('')).toBe(word);
  });
});

describe('packWords', () => {
  const w = (cells) => ({ braille: '\u283F'.repeat(cells), cells });

  it('packs words greedily with one blank cell between', () => {
    // 3 + 1 + 3 = 7 <= 8, adding another 3+1 would be 11 > 8
    const lines = packWords([w(3), w(3), w(3)], 8);
    expect(lines).toHaveLength(2);
    expect(countCells(lines[0])).toBe(7);
    expect(lines[0]).toContain(BRAILLE_SPACE);
    expect(countCells(lines[1])).toBe(3);
  });

  it('one word per line when words fill the line', () => {
    const lines = packWords([w(10), w(10)], 10);
    expect(lines).toHaveLength(2);
  });

  it('returns empty array for no words', () => {
    expect(packWords([], 10)).toEqual([]);
  });
});

describe('chunkIntoCards', () => {
  it('splits lines into cards of rowsPerCard', () => {
    const lines = ['a', 'b', 'c', 'd', 'e'];
    expect(chunkIntoCards(lines, 2)).toEqual([
      ['a', 'b'],
      ['c', 'd'],
      ['e'],
    ]);
  });

  it('returns a single empty card for no lines', () => {
    expect(chunkIntoCards([], 4)).toEqual([[]]);
  });
});

describe('layoutBrailleText', () => {
  const baseOpts = {
    translate: stubTranslate,
    cellsPerLine: 10,
    rowsPerCard: 4,
    maxTotalLines: 20,
  };

  it('translates and wraps a simple two-word text', async () => {
    const { cards, allLines, warnings } = await layoutBrailleText({
      ...baseOpts,
      text: 'hello world',
    });
    // 5 + 1 + 5 = 11 > 10 -> two lines
    expect(allLines).toHaveLength(2);
    expect(cards).toHaveLength(1);
    expect(warnings).toHaveLength(0);
  });

  it('keeps words together when they fit', async () => {
    const { allLines } = await layoutBrailleText({
      ...baseOpts,
      text: 'hi yo',
    });
    expect(allLines).toHaveLength(1);
    expect(countCells(allLines[0])).toBe(5); // 2 + 1 + 2
  });

  it('honors user newlines as hard breaks', async () => {
    const { allLines } = await layoutBrailleText({
      ...baseOpts,
      text: 'hi\nyo',
    });
    expect(allLines).toHaveLength(2);
  });

  it('preserves intentional blank lines between content', async () => {
    const { allLines } = await layoutBrailleText({
      ...baseOpts,
      text: 'hi\n\nyo',
    });
    expect(allLines).toEqual([
      await stubTranslate('hi'),
      '',
      await stubTranslate('yo'),
    ]);
  });

  it('drops trailing blank lines', async () => {
    const { allLines } = await layoutBrailleText({
      ...baseOpts,
      text: 'hi\n\n\n',
    });
    expect(allLines).toHaveLength(1);
  });

  it('returns one empty card for empty text', async () => {
    const { cards, allLines } = await layoutBrailleText({
      ...baseOpts,
      text: '',
    });
    expect(allLines).toEqual([]);
    expect(cards).toEqual([[]]);
  });

  it('divides an over-long email after punctuation', async () => {
    const { allLines, warnings } = await layoutBrailleText({
      ...baseOpts,
      text: 'name@example.com',
    });
    // 16 cells > 10 -> divided into name@ / example. / com
    expect(allLines.length).toBeGreaterThan(1);
    expect(warnings).toHaveLength(0);
  });

  it('warns about an unbreakable over-long word', async () => {
    const { warnings } = await layoutBrailleText({
      ...baseOpts,
      text: 'abcdefghijklmnop',
    });
    expect(warnings.some((w) => w.type === 'word-too-long')).toBe(true);
  });

  it('splits overflow into multiple cards', async () => {
    const { cards } = await layoutBrailleText({
      ...baseOpts,
      text: 'aa\nbb\ncc\ndd\nee\nff',
    });
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveLength(4);
    expect(cards[1]).toHaveLength(2);
  });

  it('warns instead of splitting when splitCards is off', async () => {
    const { cards, warnings } = await layoutBrailleText({
      ...baseOpts,
      text: 'aa\nbb\ncc\ndd\nee\nff',
      splitCards: false,
    });
    expect(cards).toHaveLength(1);
    expect(cards[0]).toHaveLength(6);
    expect(warnings.some((w) => w.type === 'rows-overflow')).toBe(true);
  });

  it('warns on line overflow when autoWrap is off', async () => {
    const { allLines, warnings } = await layoutBrailleText({
      ...baseOpts,
      text: 'hello wonderful world',
      autoWrap: false,
    });
    expect(allLines).toHaveLength(1); // whole line kept as-is
    expect(warnings.some((w) => w.type === 'line-overflow')).toBe(true);
  });

  it('truncates beyond maxTotalLines with a warning', async () => {
    const text = Array.from({ length: 25 }, () => 'aa').join('\n');
    const { allLines, warnings } = await layoutBrailleText({
      ...baseOpts,
      text,
      maxTotalLines: 20,
    });
    expect(allLines).toHaveLength(20);
    expect(warnings.some((w) => w.type === 'too-many-lines')).toBe(true);
  });

  it('all-caps text still wraps correctly (capitals cost extra cells)', async () => {
    const { allLines } = await layoutBrailleText({
      ...baseOpts,
      text: 'ABCDE',
    });
    // 5 capitals x 2 cells = 10 cells -> exactly one full line
    expect(allLines).toHaveLength(1);
    expect(countCells(allLines[0])).toBe(10);
  });
});
