/**
 * Braille ASCII to Unicode braille (braille-ascii.js), checked against the
 * North American Braille ASCII Code as liblouis's en-us-brf.dis gives it:
 * the character for each cell, by the cell's dots.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';
import { asciiToCells } from '../../src/js/braille-ascii.js';

/** Each braille ASCII character and the dots of its cell (en-us-brf.dis). */
const DOTS = {
  ' ': '',
  A: '1',
  B: '12',
  C: '14',
  D: '145',
  E: '15',
  F: '124',
  G: '1245',
  H: '125',
  I: '24',
  J: '245',
  K: '13',
  L: '123',
  M: '134',
  N: '1345',
  O: '135',
  P: '1234',
  Q: '12345',
  R: '1235',
  S: '234',
  T: '2345',
  U: '136',
  V: '1236',
  W: '2456',
  X: '1346',
  Y: '13456',
  Z: '1356',
  0: '356',
  1: '2',
  2: '23',
  3: '25',
  4: '256',
  5: '26',
  6: '235',
  7: '2356',
  8: '236',
  9: '35',
  "'": '3',
  '@': '4',
  '"': '5',
  ',': '6',
  '*': '16',
  '/': '34',
  '-': '36',
  '^': '45',
  '.': '46',
  ';': '56',
  '<': '126',
  '%': '146',
  ':': '156',
  '[': '246',
  '>': '345',
  '+': '346',
  _: '456',
  $: '1246',
  '\\': '1256',
  '?': '1456',
  '!': '2346',
  '#': '3456',
  '&': '12346',
  '(': '12356',
  ']': '12456',
  ')': '23456',
  '=': '123456',
};

/** The Unicode braille cell with the given dots. */
const cellOf = (dots) =>
  String.fromCharCode(
    0x2800 + [...dots].reduce((bits, dot) => bits | (1 << (dot - 1)), 0)
  );

describe('asciiToCells', () => {
  it('converts the Braille Authority card example h>ry@a"', () => {
    // "harry@" and the line continuation sign, from its card guidelines
    expect(asciiToCells('h>ry@a"')).toEqual({
      text: cellOf('125') + cellOf('345') + cellOf('1235') + cellOf('13456') +
        cellOf('4') + cellOf('1') + cellOf('5'),
      invalid: null,
    });
  });

  it('gives each of the 64 characters the cell en-us-brf.dis gives it', () => {
    const characters = Object.keys(DOTS);
    expect(characters).toHaveLength(64);
    const cells = characters.map((ch) => asciiToCells(ch).text);
    expect(new Set(cells).size).toBe(64);
    for (const ch of characters) {
      expect(asciiToCells(ch).text).toBe(cellOf(DOTS[ch]));
    }
  });

  it('reads letters in either case as the same cells', () => {
    expect(asciiToCells('hello')).toEqual(asciiToCells('HELLO'));
  });

  it('passes braille cells through and keeps line breaks', () => {
    const cell = cellOf('125');
    expect(asciiToCells(`${cell}a\nb`).text).toBe(
      `${cell}${cellOf('1')}\n${cellOf('12')}`
    );
  });

  it('converts nothing when a character is not braille ASCII, and says where', () => {
    expect(asciiToCells('ab\nc{d')).toEqual({
      text: 'ab\nc{d',
      invalid: { line: 2, char: '{' },
    });
  });
});
