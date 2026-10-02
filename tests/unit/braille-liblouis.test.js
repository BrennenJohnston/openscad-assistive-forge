// @vitest-environment node
/**
 * The braille tables the app ships, in public/liblouis/.
 *
 * They are build output: scripts/build-liblouis-wasm.sh copies them, through
 * scripts/setup-liblouis.js, from the liblouis release it builds the engine
 * from. These tests read the committed files. The engine itself is tested
 * against native liblouis in liblouis-engine.test.js.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LIBLOUIS_DIR = join(__dirname, '../../public/liblouis');
const TABLES_DIR = join(LIBLOUIS_DIR, 'tables');

describe('public/liblouis, the tables the app ships', () => {
  const catalog = JSON.parse(
    readFileSync(join(LIBLOUIS_DIR, 'tables.json'), 'utf-8')
  );

  it('offers Unified English Braille Grade 1 and Grade 2, and nothing else', () => {
    expect(catalog.tables).toEqual([
      { file: 'en-ueb-g1.ctb', label: 'English (UEB) Grade 1, uncontracted' },
      { file: 'en-ueb-g2.ctb', label: 'English (UEB) Grade 2, contracted' },
    ]);
    expect(catalog.defaultTable).toBe('en-ueb-g1.ctb');
  });

  it('names the liblouis release the engine is built from', () => {
    expect(catalog.liblouis).toBe('3.39.0');
  });

  it('lists exactly the files in the tables folder', () => {
    expect([...catalog.closure].sort()).toEqual(readdirSync(TABLES_DIR).sort());
  });

  it('ships every table that a shipped table includes', () => {
    for (const file of catalog.closure) {
      const text = readFileSync(join(TABLES_DIR, file), 'utf-8');
      for (const line of text.split(/\r?\n/)) {
        const match = line.match(/^\s*include\s+(\S+)/);
        if (match) {
          expect(catalog.closure, `${file} includes ${match[1]}`).toContain(
            match[1]
          );
        }
      }
    }
  });

  it('no longer ships the U.S. code from before 2016', () => {
    expect(existsSync(join(TABLES_DIR, 'en-us-g1.ctb'))).toBe(false);
    expect(existsSync(join(TABLES_DIR, 'en-us-g2.ctb'))).toBe(false);
  });

  it('no longer ships the 2017 engine or its JavaScript binding', () => {
    expect(existsSync(join(LIBLOUIS_DIR, 'build-no-tables-utf16.js'))).toBe(
      false
    );
    expect(existsSync(join(LIBLOUIS_DIR, 'easy-api.js'))).toBe(false);
  });
});

// Pure helper from the browser-side translator manager: safe to import in
// node (the worker is only spawned on demand).
describe('stripUnsupportedChars', () => {
  it('removes characters outside the Basic Multilingual Plane, such as emoji', async () => {
    const { stripUnsupportedChars } = await import(
      '../../src/js/braille-translator.js'
    );
    const { text, stripped } = stripUnsupportedChars('hi \u{1F600} there');
    expect(text).toBe('hi  there');
    expect(stripped).toEqual(['\u{1F600}']);
  });

  it('keeps BMP text intact', async () => {
    const { stripUnsupportedChars } = await import(
      '../../src/js/braille-translator.js'
    );
    const { text, stripped } = stripUnsupportedChars('caf\u00E9 123');
    expect(text).toBe('caf\u00E9 123');
    expect(stripped).toEqual([]);
  });
});
