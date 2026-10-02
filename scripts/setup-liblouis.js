#!/usr/bin/env node
/**
 * Setup liblouis braille-translation assets
 * @license GPL-3.0-or-later
 *
 * Copies the liblouis emscripten engine and a curated set of translation
 * tables from node_modules into public/liblouis/ (gitignored, deployed as
 * static assets). The Braille Card Customizer's web worker loads these at
 * runtime — nothing here is bundled into the app JS.
 *
 * Table include closure: liblouis tables reference other tables via
 * `include <file>` lines. This script recursively parses those lines and
 * copies the full closure so on-demand loading in the browser never 404s.
 *
 * Licensing: liblouis engine is LGPL-2.1+, the JS bindings (easy-api.js)
 * are GPL-3.0, and individual tables carry their own headers. A NOTICE
 * file with attribution is written alongside the copied assets.
 *
 * With `--from <tables> --liblouis <version> [--out <dir>]` it copies
 * instead the Unified English Braille tables of a liblouis release, and
 * every table they include, for the engine that
 * scripts/build-liblouis-wasm.sh builds from the same release.
 */

import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const BUILD_DIR = path.join(ROOT, 'node_modules', 'liblouis-build');
const EASYAPI_DIR = path.join(ROOT, 'node_modules', 'liblouis');
const TABLES_SRC = path.join(BUILD_DIR, 'tables');
const DEST_DIR = path.join(ROOT, 'public', 'liblouis');
const TABLES_DEST = path.join(DEST_DIR, 'tables');

// Engine files loaded by src/worker/liblouis-worker.js via importScripts
const ENGINE_FILES = [
  { src: path.join(BUILD_DIR, 'build-no-tables-utf16.js'), name: 'build-no-tables-utf16.js' },
  { src: path.join(EASYAPI_DIR, 'easy-api.js'), name: 'easy-api.js' },
];

// Curated tables surfaced in the UI. unicode.dis is not user-selectable —
// it is prepended to every table chain to force Unicode braille output.
const CURATED_TABLES = [
  {
    file: 'en-ueb-g1.ctb',
    label: 'English (UEB) Grade 1 — uncontracted',
    default: true,
  },
  {
    file: 'en-ueb-g2.ctb',
    label: 'English (UEB) Grade 2 — contracted',
  },
  {
    file: 'en-us-g1.ctb',
    label: 'English (US) Grade 1 — uncontracted',
  },
  {
    file: 'en-us-g2.ctb',
    label: 'English (US) Grade 2 — contracted',
  },
];

// Always copied in addition to the curated set + closure
const BASE_TABLES = ['unicode.dis'];

/**
 * Parse `include <file>` directives from a liblouis table.
 * Trailing comments after the filename are ignored
 * (e.g. "include en-ueb-chardefs.uti UEB specific char defs.").
 * @param {string} tablePath - Absolute path to the table file
 * @returns {string[]} Included table file names
 */
function parseIncludes(tablePath) {
  const content = fs.readFileSync(tablePath, 'utf-8');
  const includes = [];
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*include\s+(\S+)/);
    if (match) includes.push(match[1]);
  }
  return includes;
}

/**
 * Compute the transitive include closure of a set of table files.
 * @param {string[]} seeds - Table file names to start from
 * @param {string} [sourceDir] - The folder the tables are read from
 * @returns {{ closure: string[], missing: string[] }}
 */
function resolveTableClosure(seeds, sourceDir = TABLES_SRC) {
  const visited = new Set();
  const missing = [];
  const queue = [...seeds];

  while (queue.length > 0) {
    const name = queue.shift();
    if (visited.has(name)) continue;

    const srcPath = path.join(sourceDir, name);
    if (!fs.existsSync(srcPath)) {
      missing.push(name);
      continue;
    }
    visited.add(name);
    queue.push(...parseIncludes(srcPath));
  }

  return { closure: [...visited].sort(), missing };
}

// Tables from a liblouis release, for the engine scripts/build-liblouis-wasm.sh
// builds from the same tarball. Only Unified English Braille is offered: the
// U.S. code from before 2016 (EBAE) is no longer accepted for braille signs.
const RELEASE_TABLES = [
  {
    file: 'en-ueb-g1.ctb',
    label: 'English (UEB) Grade 1, uncontracted',
    default: true,
  },
  {
    file: 'en-ueb-g2.ctb',
    label: 'English (UEB) Grade 2, contracted',
  },
];

function option(name) {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
}

/**
 * Copy the release's tables the app offers, and every table they include,
 * into `out`. The catalog names the release and lists every file copied, so
 * the worker can load the set without guessing. Nothing in it changes from
 * one run to the next, so the files can be committed and checked by checksum.
 */
function setupFromRelease(from, out, version) {
  console.log(`liblouis tables from ${from}`);
  console.log('='.repeat(60));

  const seeds = [...BASE_TABLES, ...RELEASE_TABLES.map((t) => t.file)];
  const { closure, missing } = resolveTableClosure(seeds, from);
  if (missing.length > 0) {
    console.error(`✗ Tables missing from the release: ${missing.join(', ')}`);
    process.exit(1);
  }

  // Emptied first, so no table from an older engine survives beside these.
  const tablesOut = path.join(out, 'tables');
  fs.rmSync(tablesOut, { recursive: true, force: true });
  fs.mkdirSync(tablesOut, { recursive: true });
  for (const name of closure) {
    fs.copyFileSync(path.join(from, name), path.join(tablesOut, name));
  }
  console.log(
    `\u2713 ${closure.length} table files (offered tables + include closure)`
  );

  const catalog = {
    liblouis: version,
    defaultTable: RELEASE_TABLES.find((t) => t.default).file,
    tables: RELEASE_TABLES.map(({ file, label }) => ({ file, label })),
    closure,
  };
  fs.writeFileSync(
    path.join(out, 'tables.json'),
    `${JSON.stringify(catalog, null, 2)}\n`
  );
  console.log('\u2713 tables.json catalog');

  const notice = [
    'liblouis braille translation tables',
    '',
    `tables/ holds translation tables from liblouis ${version}, the release the`,
    'braille engine in public/wasm/liblouis/ is built from, copied unmodified.',
    'They are licensed under the GNU Lesser General Public License, version 2.1',
    "or later; each table's own header names its authors and its license.",
    '  https://liblouis.io/  https://github.com/liblouis/liblouis',
    '',
    'scripts/build-liblouis-wasm.sh builds the engine and copies these tables',
    'with scripts/setup-liblouis.js.',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(out, 'NOTICE.txt'), notice);
  console.log('\u2713 NOTICE.txt attribution');
  console.log('='.repeat(60));
  console.log(`\u2713 liblouis tables ready in ${out}`);
}

function main() {
  console.log('liblouis Asset Setup');
  console.log('='.repeat(60));

  // Preconditions
  for (const engine of ENGINE_FILES) {
    if (!fs.existsSync(engine.src)) {
      console.error(`\u2717 Missing ${engine.src}`);
      console.error('  Run `npm install` first (liblouis is a devDependency).');
      process.exit(1);
    }
  }
  if (!fs.existsSync(TABLES_SRC)) {
    console.error(`\u2717 Missing tables directory: ${TABLES_SRC}`);
    process.exit(1);
  }

  fs.mkdirSync(TABLES_DEST, { recursive: true });

  // Engine
  for (const engine of ENGINE_FILES) {
    fs.copyFileSync(engine.src, path.join(DEST_DIR, engine.name));
    const sizeKb = Math.round(fs.statSync(engine.src).size / 1024);
    console.log(`\u2713 ${engine.name} (${sizeKb} KB)`);
  }

  // Tables (curated + transitive include closure)
  const seeds = [...BASE_TABLES, ...CURATED_TABLES.map((t) => t.file)];
  const { closure, missing } = resolveTableClosure(seeds);

  if (missing.length > 0) {
    console.error(
      `\u2717 Unresolved table includes: ${missing.join(', ')}\n` +
        '  The liblouis-build tables directory may have changed layout.'
    );
    process.exit(1);
  }

  for (const name of closure) {
    fs.copyFileSync(path.join(TABLES_SRC, name), path.join(TABLES_DEST, name));
  }
  console.log(`\u2713 ${closure.length} table files (curated set + include closure)`);

  // Static catalog consumed by the Braille Card Customizer UI
  const catalog = {
    generated: new Date().toISOString(),
    defaultTable: CURATED_TABLES.find((t) => t.default)?.file || CURATED_TABLES[0].file,
    tables: CURATED_TABLES.map(({ file, label }) => ({ file, label })),
  };
  fs.writeFileSync(
    path.join(DEST_DIR, 'tables.json'),
    JSON.stringify(catalog, null, 2)
  );
  console.log('\u2713 tables.json catalog');

  // Attribution notice
  const notice = [
    'liblouis braille translation assets',
    '',
    'build-no-tables-utf16.js — liblouis C engine compiled with emscripten.',
    '  liblouis is licensed under LGPL-2.1-or-later.',
    '  https://liblouis.io/  https://github.com/liblouis/liblouis',
    'easy-api.js — liblouis-js JavaScript bindings, licensed under GPL-3.0.',
    '  https://github.com/liblouis/liblouis-js',
    'tables/ — liblouis translation tables. Individual tables carry their',
    '  own license headers (mostly LGPL-2.1-or-later).',
    '',
    'These files are copied from the liblouis / liblouis-build npm packages',
    'by scripts/setup-liblouis.js and served as static assets.',
  ].join('\n');
  fs.writeFileSync(path.join(DEST_DIR, 'NOTICE.txt'), notice);
  console.log('\u2713 NOTICE.txt attribution');

  console.log('='.repeat(60));
  console.log(`\u2713 liblouis assets ready in ${path.relative(ROOT, DEST_DIR)}`);
}

const from = option('--from');
if (from) {
  const version = option('--liblouis');
  if (!version) {
    console.error(
      '--from needs --liblouis <version>, the release the tables come from.'
    );
    process.exit(2);
  }
  setupFromRelease(
    path.resolve(from),
    path.resolve(option('--out') || DEST_DIR),
    version
  );
} else {
  main();
}
