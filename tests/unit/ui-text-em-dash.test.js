/**
 * Nothing the app shows or says carries an em dash: the house rule for UI
 * text, and a screen reader hands the dash to its voice as a bare pause where
 * the sentence needs a stop or a colon. Read here:
 *   - every string in src/, with the American English scan's reader, except
 *     the arguments of a console call, which only a developer sees;
 *   - the text and the attributes a person reads in index.html;
 *   - the Customizer text of every example model, as the app's parser reads
 *     it.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';
import { jsTextRuns, htmlTextRuns } from '../../scripts/us-english-scan.mjs';
import { extractParameters } from '../../src/js/parser.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

// Built from character codes, so this file holds no dash of its own.
const EM_DASH = String.fromCharCode(0x2014);
const EM_DASH_ESCAPE = String.fromCharCode(92) + 'u2014';
const EM_DASH_ENTITY = /&(mdash|#x2014|#8212);/i;

const hasDash = (text) =>
  text.includes(EM_DASH) ||
  text.includes(EM_DASH_ESCAPE) ||
  EM_DASH_ENTITY.test(text);

function filesUnder(dir, extension, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) filesUnder(path, extension, out);
    else if (path.endsWith(extension)) out.push(path);
  }
  return out;
}

const shown = (path) => relative(ROOT, path).split('\\').join('/');

/**
 * The name of the call a string is an argument of, or null when it is not
 * inside one. `code` has every string and comment blanked, so a bracket
 * inside one never counts.
 */
function enclosingCall(code, start) {
  let depth = 0;
  for (let i = start - 1; i >= 0; i--) {
    const ch = code[i];
    if (ch === ')' || ch === ']' || ch === '}') depth += 1;
    else if (ch === '(' || ch === '[' || ch === '{') {
      if (depth > 0) depth -= 1;
      else if (ch !== '(') return null;
      else {
        const name = code.slice(Math.max(0, i - 80), i).match(/([\w$.]+)\s*$/);
        return name ? name[1] : null;
      }
    } else if (ch === ';' && depth === 0) return null;
  }
  return null;
}

describe('UI text carries no em dash', () => {
  it('in the strings of src/, outside console calls', () => {
    const hits = [];
    let read = 0;
    for (const path of filesUnder(join(ROOT, 'src'), '.js')) {
      const source = readFileSync(path, 'utf-8');
      const runs = jsTextRuns(source);
      const chars = source.split('');
      for (const run of runs) {
        for (let k = run.start; k < run.start + run.text.length; k++) {
          if (chars[k] !== '\n') chars[k] = ' ';
        }
      }
      const code = chars.join('');
      for (const run of runs) {
        if (run.kind !== 'string') continue;
        read += 1;
        if (!hasDash(run.text)) continue;
        const call = enclosingCall(code, run.start) || '';
        if (/^console\.\w+$/.test(call)) continue;
        hits.push(`${shown(path)}:${run.line}: ${run.text.trim()}`);
      }
    }
    expect(read).toBeGreaterThan(1000);
    expect(hits).toEqual([]);
  });

  it('in the text and readable attributes of index.html', () => {
    const source = readFileSync(join(ROOT, 'index.html'), 'utf-8');
    // Nobody reads a comment, and the reader would take the words between a
    // "<" and a ">" inside one for page text.
    const uncommented = source.replace(/<!--[\s\S]*?-->/g, (m) =>
      m.replace(/[^\n]/g, ' ')
    );
    const runs = htmlTextRuns(uncommented);
    expect(runs.length).toBeGreaterThan(500);
    const hits = runs
      .filter((run) => hasDash(run.text))
      .map((run) => `index.html:${run.line}: ${run.text.trim()}`);
    expect(hits).toEqual([]);
  });

  it('in the Customizer text of every example model', () => {
    const models = filesUnder(join(ROOT, 'public/examples'), '.scad');
    expect(models.length).toBeGreaterThan(10);
    const hits = [];
    const walk = (value, file, where) => {
      if (typeof value === 'string') {
        if (hasDash(value)) hits.push(`${file} ${where}: ${value}`);
      } else if (Array.isArray(value)) {
        value.forEach((item, i) => walk(item, file, `${where}[${i}]`));
      } else if (value && typeof value === 'object') {
        for (const [key, item] of Object.entries(value)) {
          walk(item, file, `${where}.${key}`);
        }
      }
    };
    // The parser reports each extraction on the console; that report is not
    // what this reads.
    const quiet = vi.spyOn(console, 'debug').mockImplementation(() => {});
    try {
      for (const path of models) {
        walk(extractParameters(readFileSync(path, 'utf-8')), shown(path), 'schema');
      }
    } finally {
      quiet.mockRestore();
    }
    expect(hits).toEqual([]);
  });
});
