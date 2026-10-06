/**
 * Six-key braille entry (braille-six-key.js): chords of the physical keys
 * f, d, s (dots 1, 2, 3) and j, k, l (dots 4, 5, 6) become one cell when
 * the last key is released, as on a Perkins brailler.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';
import {
  createSixKeyEntry,
  describeCell,
} from '../../src/js/braille-six-key.js';

const CODE = { f: 'KeyF', d: 'KeyD', s: 'KeyS', j: 'KeyJ', k: 'KeyK', l: 'KeyL' };

/** Hold the keys down in order, then release them in order; the cells made. */
function chord(entry, keys, extra = {}) {
  const codes = keys.map((key) => (key === ' ' ? 'Space' : CODE[key]));
  for (const code of codes) entry.keyDown({ code, ...extra });
  return codes.map((code) => entry.keyUp({ code })).filter(Boolean);
}

describe('createSixKeyEntry', () => {
  it('makes one cell from f, d and k held together: dots 1, 2 and 5', () => {
    expect(chord(createSixKeyEntry(), ['f', 'd', 'k'])).toEqual([
      String.fromCharCode(0x2813),
    ]);
  });

  it('makes the full cell from all six keys', () => {
    expect(chord(createSixKeyEntry(), ['f', 'd', 's', 'j', 'k', 'l'])).toEqual([
      String.fromCharCode(0x283f),
    ]);
  });

  it('makes the blank cell from Space pressed alone', () => {
    expect(chord(createSixKeyEntry(), [' '])).toEqual([
      String.fromCharCode(0x2800),
    ]);
  });

  it('gives the cell when the last key is released, in any order', () => {
    const entry = createSixKeyEntry();
    entry.keyDown({ code: 'KeyF' });
    entry.keyDown({ code: 'KeyJ' });
    expect(entry.keyUp({ code: 'KeyJ' })).toBeNull();
    expect(entry.keyUp({ code: 'KeyF' })).toBe(String.fromCharCode(0x2809));
    // The next chord starts empty
    expect(chord(entry, ['d'])).toEqual([String.fromCharCode(0x2802)]);
  });

  it('leaves a key pressed with Ctrl, Alt or Meta alone', () => {
    for (const modifier of ['ctrlKey', 'altKey', 'metaKey']) {
      const entry = createSixKeyEntry();
      expect(entry.keyDown({ code: 'KeyF', [modifier]: true })).toBe(false);
      expect(entry.keyUp({ code: 'KeyF' })).toBeNull();
    }
  });

  it('takes a repeated key but adds nothing for it', () => {
    const entry = createSixKeyEntry();
    expect(entry.keyDown({ code: 'KeyF' })).toBe(true);
    expect(entry.keyDown({ code: 'KeyF', repeat: true })).toBe(true);
    expect(entry.keyDown({ code: 'KeyF', repeat: true })).toBe(true);
    expect(entry.keyUp({ code: 'KeyF' })).toBe(String.fromCharCode(0x2801));
  });

  it('leaves every other key alone', () => {
    const entry = createSixKeyEntry();
    for (const code of ['Tab', 'Enter', 'Escape', 'Backspace', 'ArrowLeft', 'KeyA', 'ShiftLeft']) {
      expect(entry.keyDown({ code })).toBe(false);
      expect(entry.keyUp({ code })).toBeNull();
    }
  });

  it('forgets a half-built chord when reset', () => {
    const entry = createSixKeyEntry();
    entry.keyDown({ code: 'KeyF' });
    entry.reset();
    expect(entry.keyUp({ code: 'KeyF' })).toBeNull();
    expect(chord(entry, ['d'])).toEqual([String.fromCharCode(0x2802)]);
  });
});

describe('describeCell', () => {
  it('names a cell by its dots, and the blank cell as space', () => {
    expect(describeCell(String.fromCharCode(0x2813))).toBe('dots 1 2 5');
    expect(describeCell(String.fromCharCode(0x283f))).toBe('dots 1 2 3 4 5 6');
    expect(describeCell(String.fromCharCode(0x2800))).toBe('space');
  });
});
