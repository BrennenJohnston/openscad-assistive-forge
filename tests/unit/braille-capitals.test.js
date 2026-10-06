// @vitest-environment node
/**
 * The sign's ADA capitals rule (braille-capitals.js). ADA 703.3.1 gives sign
 * braille a capital only before the first word of a sentence, names, single
 * letters, initials and acronyms; the Access Board's guide adds that nothing
 * else is capitalized, whatever the print shows. The rule keeps the one kind
 * software can tell, a capital letter standing alone, and lowercases the
 * rest. The Braille Authority of North America's signage guidelines (rev.
 * 10/27/23) braille STAIRS, Room 420 and Building 3 100 with no capital sign
 * and staircase 3B and section 4R with one on the letter; through the real
 * engine, those come out cell for cell as native liblouis 3.39.0 gives them.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { adaSignCapitals } from '../../src/js/braille-capitals.js';
import {
  installTables,
  loadLiblouis,
  resetLiblouis,
  translate,
} from '../../src/js/liblouis-engine.js';

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const BUILT = path.join(ROOT, 'vendor', 'liblouis', 'liblouis.mjs');
const WASM = path.join(ROOT, 'public', 'wasm', 'liblouis', 'liblouis.wasm');
const SHIPPED = path.join(ROOT, 'public', 'liblouis');

const ACUTE = String.fromCodePoint(0x0301);

describe('adaSignCapitals', () => {
  it.each([
    ['Room 420', 'room 420'],
    ['STAIRS', 'stairs'],
    ['Building 3 100', 'building 3 100'],
    ['EXIT', 'exit'],
    ['ICU Waiting Room', 'icu waiting room'],
    ['Dr. Ana Ruiz', 'dr. ana ruiz'],
  ])('lowercases every letter that belongs to a word: %j', (typed, kept) => {
    expect(adaSignCapitals(typed)).toBe(kept);
  });

  it.each([
    ['Staircase 3B', 'staircase 3B'],
    ['Section 4R', 'section 4R'],
    ['Conference Room B', 'conference room B'],
    ['WING C', 'wing C'],
    ['B12', 'B12'],
    ['J. Smith', 'J. smith'],
    ['U.S.A.', 'U.S.A.'],
    ['X-Ray', 'X-ray'],
  ])('keeps the capital of a letter standing alone: %j', (typed, kept) => {
    expect(adaSignCapitals(typed)).toBe(kept);
  });

  it('counts an accent written as a separate mark with its letter', () => {
    expect(adaSignCapitals(`E${ACUTE}COLE`)).toBe(`e${ACUTE}cole`);
    expect(adaSignCapitals(`Wing E${ACUTE}`)).toBe(`wing E${ACUTE}`);
  });

  it('leaves lowercase text, digits and rows of several lines as they are', () => {
    expect(adaSignCapitals('room 3b')).toBe('room 3b');
    expect(adaSignCapitals('206.543.4779')).toBe('206.543.4779');
    expect(adaSignCapitals('ROOM 3B\nWING C')).toBe('room 3B\nwing C');
    expect(adaSignCapitals('')).toBe('');
  });
});

describe('the ADA capitals rule through the real engine (BANA signage examples)', () => {
  let mod;

  beforeAll(async () => {
    resetLiblouis();
    const catalog = JSON.parse(
      readFileSync(path.join(SHIPPED, 'tables.json'), 'utf8')
    );
    mod = await loadLiblouis(() => import(pathToFileURL(BUILT).href), {
      wasmUrl: WASM,
    });
    installTables(
      mod,
      catalog.closure.map((name) => ({
        name,
        bytes: readFileSync(path.join(SHIPPED, 'tables', name)),
      }))
    );
  });

  afterAll(() => resetLiblouis());

  // Native liblouis 3.39.0 (the official win64 lou_translate) on the same
  // text after the rule, UEB Grade 2.
  it.each([
    ['STAIRS', '⠌⠁⠊⠗⠎'],
    ['Room 420', '⠗⠕⠕⠍⠀⠼⠙⠃⠚'],
    ['Building 3 100', '⠃⠥⠊⠇⠙⠬⠀⠼⠉⠀⠼⠁⠚⠚'],
    ['Staircase 3B', '⠌⠁⠊⠗⠉⠁⠎⠑⠀⠼⠉⠠⠃'],
    ['Section 4R', '⠎⠑⠉⠰⠝⠀⠼⠙⠠⠗'],
    ['Conference Room B', '⠒⠋⠻⠰⠑⠀⠗⠕⠕⠍⠀⠰⠠⠃'],
  ])('%j', (typed, cells) => {
    expect(translate(mod, 'en-ueb-g2.ctb', adaSignCapitals(typed)).braille).toBe(
      cells
    );
  });
});
