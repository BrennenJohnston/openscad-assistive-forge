/**
 * The braille tools' sentences carry no em dash: the house rule for UI text,
 * and a screen reader passes the dash to its voice as a bare pause where the
 * sentence needs a stop. Every string literal of the panel and of the wrap
 * engine is read with the American English scan's reader, so comments are
 * left alone.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { jsTextRuns } from '../../scripts/us-english-scan.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');
const FILES = ['src/js/braille-panel.js', 'src/js/braille-wrap.js'];

describe('braille tools UI text', () => {
  for (const file of FILES) {
    it(`${file} has no em dash in a string`, () => {
      const source = readFileSync(join(ROOT, file), 'utf-8');
      const runs = jsTextRuns(source);
      expect(runs.length).toBeGreaterThan(0);
      const hits = runs
        .filter((run) => run.kind === 'string' && run.text.includes('—'))
        .map((run) => `${file}:${run.line}: ${run.text.trim()}`);
      expect(hits).toEqual([]);
    });
  }
});
