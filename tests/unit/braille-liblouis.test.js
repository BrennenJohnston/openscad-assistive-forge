// @vitest-environment node
/**
 * Real-liblouis translation tests (Node build of the same engine the
 * browser worker runs) + validation of the assets that
 * scripts/setup-liblouis.js copies into public/liblouis/.
 *
 * Runs in the node environment: liblouis's environment sniffing treats
 * jsdom's `window` as a browser GUI thread and refuses to load tables.
 *
 * Requires `npm run setup-liblouis` to have populated public/liblouis/
 * (wired into prebuild + pixi setup); tests are skipped with a clear
 * message when assets are missing.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const LIBLOUIS_DIR = join(__dirname, '../../public/liblouis');
const TABLES_DIR = join(LIBLOUIS_DIR, 'tables');

const assetsReady = existsSync(join(TABLES_DIR, 'unicode.dis'));

const BRAILLE_ONLY = /^[\u2800-\u28FF ]+$/;

// In the Node build the table folder is mounted at /tables in the
// emscripten FS, so chain entries need the tables/ prefix. The browser
// worker uses on-demand HTTP loading and plain file names instead.
const chain = (table) => `tables/unicode.dis,tables/${table}`;

describe.skipIf(!assetsReady)(
  'liblouis translation against public/liblouis tables',
  () => {
    let liblouis;

    function getLiblouis() {
      if (!liblouis) {
        liblouis = require('liblouis');
        liblouis.enableOnDemandTableLoading(resolve(TABLES_DIR));
      }
      return liblouis;
    }

    it('translates "hello" to braille under en-ueb-g1', () => {
      const out = getLiblouis().translateString(
        chain('en-ueb-g1.ctb'),
        'hello'
      );
      expect(out).toBe('\u2813\u2811\u2807\u2807\u2815'); // ⠓⠑⠇⠇⠕
    });

    it('translates "hello world" under en-ueb-g1 (uncontracted)', () => {
      const out = getLiblouis().translateString(
        chain('en-ueb-g1.ctb'),
        'hello world'
      );
      expect(out).toBe(
        '\u2813\u2811\u2807\u2807\u2815 \u283A\u2815\u2817\u2807\u2819'
      ); // ⠓⠑⠇⠇⠕ ⠺⠕⠗⠇⠙
    });

    it('grade 2 contracts "world"', () => {
      const g1 = getLiblouis().translateString(
        chain('en-ueb-g1.ctb'),
        'world'
      );
      const g2 = getLiblouis().translateString(
        chain('en-ueb-g2.ctb'),
        'world'
      );
      expect(g2.length).toBeLessThan(g1.length);
    });

    it('capital letters add an indicator cell', () => {
      const lower = getLiblouis().translateString(
        chain('en-ueb-g1.ctb'),
        'hello'
      );
      const upper = getLiblouis().translateString(
        chain('en-ueb-g1.ctb'),
        'Hello'
      );
      expect(upper.length).toBe(lower.length + 1);
      expect(upper.startsWith('\u2820')).toBe(true); // ⠠ capital indicator
    });

    it('all four curated tables produce Unicode braille output', () => {
      for (const table of [
        'en-ueb-g1.ctb',
        'en-ueb-g2.ctb',
        'en-us-g1.ctb',
        'en-us-g2.ctb',
      ]) {
        const out = getLiblouis().translateString(chain(table), 'test');
        expect(out, `table ${table}`).toBeTruthy();
        expect(out, `table ${table}`).toMatch(BRAILLE_ONLY);
      }
    });
  }
);

describe.skipIf(!assetsReady)('public/liblouis asset integrity', () => {
  it('engine files exist', () => {
    expect(existsSync(join(LIBLOUIS_DIR, 'build-no-tables-utf16.js'))).toBe(
      true
    );
    expect(existsSync(join(LIBLOUIS_DIR, 'easy-api.js'))).toBe(true);
  });

  it('tables.json catalog is valid and lists existing tables', () => {
    const catalog = JSON.parse(
      readFileSync(join(LIBLOUIS_DIR, 'tables.json'), 'utf-8')
    );
    expect(typeof catalog.defaultTable).toBe('string');
    expect(Array.isArray(catalog.tables)).toBe(true);
    expect(catalog.tables.length).toBeGreaterThanOrEqual(4);

    const files = catalog.tables.map((t) => t.file);
    expect(files).toContain(catalog.defaultTable);

    for (const table of catalog.tables) {
      expect(typeof table.label).toBe('string');
      expect(existsSync(join(TABLES_DIR, table.file)), table.file).toBe(true);
    }
  });

  it('every include directive in copied tables resolves (closure complete)', () => {
    const { readdirSync } = require('fs');
    for (const file of readdirSync(TABLES_DIR)) {
      const content = readFileSync(join(TABLES_DIR, file), 'utf-8');
      for (const line of content.split(/\r?\n/)) {
        const match = line.match(/^\s*include\s+(\S+)/);
        if (match) {
          expect(
            existsSync(join(TABLES_DIR, match[1])),
            `${file} includes ${match[1]}`
          ).toBe(true);
        }
      }
    }
  });
});

// Pure helper from the browser-side translator manager: safe to import in
// node (the worker is only spawned on demand).
describe('stripUnsupportedChars', () => {
  it('removes astral-plane characters that crash the UTF-16 build', async () => {
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
