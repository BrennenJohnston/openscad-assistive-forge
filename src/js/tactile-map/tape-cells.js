/**
 * The tape measured by the braille translator.
 *
 * A label's channel is cut to its cells, and the cells of a braille label
 * depend on the grade: contracted UEB (Grade 2) shortens most words,
 * uncontracted (Grade 1) spells them. The app's translator (liblouis in a
 * worker) gives the braille; this measure counts its cells, remembers each
 * text and each word of it by grade, and answers the layouts at once from
 * what it remembers: a text translated whole, a piece of one from its
 * translated words with a blank cell between them, anything else by the
 * estimate `labelCells` gives, said so with `measured: false`. An engine
 * that cannot load leaves the estimate in place and `failed` set, so the
 * layouts never wait on it and the panel can say so.
 *
 * Nothing in the engine, its worker or its tables changes for this; the
 * measure is one more caller of `translateText`.
 *
 * @license GPL-3.0-or-later
 */

import { translateText } from '../braille-translator.js';
import { labelCells } from './map-key.js';

/** A blank braille cell, the space on tape. */
export const BLANK_CELL = '⠀';

/**
 * The grades offered, each with its table. Uncontracted first: most hand-press
 * braille labelers write letter by letter and cannot contract.
 */
export const TAPE_GRADES = Object.freeze([
  {
    key: 'g1',
    name: 'Uncontracted (Grade 1)',
    table: 'en-ueb-g1.ctb',
    said: 'uncontracted braille (Grade 1)',
  },
  {
    key: 'g2',
    name: 'Contracted (UEB Grade 2)',
    table: 'en-ueb-g2.ctb',
    said: 'contracted braille (UEB Grade 2)',
  },
]);

/** The grade's record, the first grade for a key nothing offers. */
export const gradeOf = (key) =>
  TAPE_GRADES.find((g) => g.key === key) || TAPE_GRADES[0];

/** The liblouis table for a grade key. */
export const tableFor = (key) => gradeOf(key).table;

/** The cells in a braille string: every character, a blank cell too. */
export const brailleCells = (braille) => [...String(braille || '')].length;

const wordsOf = (text) =>
  String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

/** The app's translator as the measure calls it: the braille of a text. */
const appTranslate = async (text, table) =>
  (await translateText(text, table)).braille;

export class TapeMeasure {
  /**
   * @param {(text: string, table: string) => Promise<string|{braille: string}>} [translate]
   */
  constructor(translate = appTranslate) {
    this.translate = translate;
    /** @type {Map<string, {braille: string, cells: number}>} */
    this.cache = new Map();
    this.failed = false;
    this.error = null;
  }

  key(grade, text) {
    return `${grade}\u0000${String(text).trim().toLowerCase()}`;
  }

  has(grade, text) {
    return this.cache.has(this.key(grade, text));
  }

  /** The texts among `texts` the measure cannot yet answer for a grade. */
  missing(texts, grade) {
    const out = [];
    for (const t of texts || []) {
      const s = String(t || '').trim();
      if (!s) continue;
      if (this.has(grade, s)) continue;
      if (wordsOf(s).every((w) => this.has(grade, w))) continue;
      out.push(s);
    }
    return out;
  }

  /**
   * Translate every text, and every word of it, once for a grade. The
   * texts go through lowercased, as a labeler's tape is written (BANA's
   * space-saving rule; the app's translator does the same).
   *
   * @param {string[]} texts
   * @param {string} grade - a TAPE_GRADES key
   * @returns {Promise<{ measured: boolean, translated: number, error?: Error }>}
   */
  async measure(texts, grade) {
    const table = tableFor(grade);
    const todo = new Set();
    for (const t of texts || []) {
      const s = String(t || '').trim();
      if (!s) continue;
      if (!this.has(grade, s)) todo.add(s);
      for (const w of wordsOf(s)) if (!this.has(grade, w)) todo.add(w);
    }
    if (!todo.size) return { measured: !this.failed, translated: 0 };
    try {
      for (const s of todo) {
        const out = await this.translate(s.toLowerCase(), table);
        const braille = typeof out === 'string' ? out : out?.braille || '';
        this.cache.set(this.key(grade, s), {
          braille,
          cells: brailleCells(braille),
        });
      }
      this.failed = false;
      this.error = null;
      return { measured: true, translated: todo.size };
    } catch (error) {
      this.failed = true;
      this.error = error;
      return { measured: false, translated: 0, error };
    }
  }

  /**
   * A text's cells and braille for a grade: translated whole, or summed
   * from its translated words with a blank cell between them, or the
   * estimate with `measured: false`.
   *
   * @param {string} text
   * @param {string} grade
   * @returns {{ cells: number, braille: string, measured: boolean, grade: string }}
   */
  of(text, grade) {
    const s = String(text || '').trim();
    if (!s) return { cells: 0, braille: '', measured: true, grade };
    const hit = this.cache.get(this.key(grade, s));
    if (hit) return { ...hit, measured: true, grade };
    const words = wordsOf(s);
    const parts = words.map((w) => this.cache.get(this.key(grade, w)));
    if (words.length && parts.every(Boolean)) {
      return {
        braille: parts.map((p) => p.braille).join(BLANK_CELL),
        cells: parts.reduce((n, p) => n + p.cells, 0) + words.length - 1,
        measured: true,
        grade,
      };
    }
    return { cells: labelCells(s), braille: '', measured: false, grade };
  }

  /**
   * What the layouts take in their settings: a function of the text bound
   * to a grade, and whether the engine stands.
   */
  view(grade) {
    return {
      grade,
      of: (text) => this.of(text, grade),
      measured: !this.failed,
    };
  }
}

/**
 * A measure with these texts translated for a grade.
 *
 * @param {string[]} texts
 * @param {string} grade
 * @param {(text: string, table: string) => Promise<string|{braille: string}>} [translate]
 * @returns {Promise<TapeMeasure>}
 */
export async function measureTape(texts, grade, translate) {
  const tape = new TapeMeasure(translate);
  await tape.measure(texts, grade);
  return tape;
}
