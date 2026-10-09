/**
 * Playwright's page.waitForFunction takes (fn, arg, options). An options
 * object in second place is handed to the page function as its argument,
 * and the wait quietly uses the default timeout instead of the one written.
 * This reads every browser test and fails on a call shaped that way.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const DIRS = ['tests/e2e', 'tests/e2e-prod', 'tests/visual'];
const CALL = '.' + 'waitForFunction(';

function filesUnder(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return filesUnder(path);
    return /\.(m?js)$/.test(name) ? [path] : [];
  });
}

/** The top-level arguments of the call whose '(' ends at `start`. */
function argumentsAt(src, start) {
  const args = [];
  let depth = 1;
  let current = '';
  let i = start;
  while (i < src.length && depth > 0) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') {
      i = src.indexOf('\n', i);
      if (i < 0) break;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      i = src.indexOf('*/', i + 2) + 2;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      while (j < src.length && src[j] !== c) j += src[j] === '\\' ? 2 : 1;
      current += src.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if ('([{'.includes(c)) depth += 1;
    if (')]}'.includes(c)) depth -= 1;
    if (depth === 0) break;
    if (c === ',' && depth === 1) {
      args.push(current.trim());
      current = '';
    } else {
      current += c;
    }
    i += 1;
  }
  if (current.trim()) args.push(current.trim());
  return args;
}

/** Calls whose second argument is an options object ({ timeout } or { polling }). */
export function misplacedWaitOptions(src) {
  const lines = [];
  let at = src.indexOf(CALL);
  while (at >= 0) {
    const args = argumentsAt(src, at + CALL.length);
    if (args.length === 2 && /^\{\s*(timeout|polling)\b/.test(args[1])) {
      lines.push(src.slice(0, at).split('\n').length);
    }
    at = src.indexOf(CALL, at + CALL.length);
  }
  return lines;
}

describe('browser test waits', () => {
  it('reads an options object in second place as misplaced', () => {
    const fn = '() => true';
    expect(misplacedWaitOptions(`page${CALL}${fn}, { timeout: 5000 })`)).toEqual([1]);
    expect(misplacedWaitOptions(`page${CALL}${fn}, null, { timeout: 5000 })`)).toEqual([]);
    expect(misplacedWaitOptions(`page${CALL}${fn}, 'a, b')`)).toEqual([]);
  });

  it('every waitForFunction passes its options third', () => {
    const found = DIRS.flatMap((dir) =>
      filesUnder(join(ROOT, dir)).flatMap((path) =>
        misplacedWaitOptions(readFileSync(path, 'utf8')).map(
          (line) => `${relative(ROOT, path).replace(/\\/g, '/')}:${line}`
        )
      )
    );
    expect(found).toEqual([]);
  });
});
