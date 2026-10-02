#!/usr/bin/env node
/**
 * Copy liblouis's braille translation tables for the braille tools.
 * @license GPL-3.0-or-later
 *
 *   node scripts/setup-liblouis.js --from <tables> --liblouis <version> [--out <dir>]
 *
 * scripts/build-liblouis-wasm.sh runs this with the tables folder of the
 * liblouis release it builds the engine from. It copies the tables the app
 * offers, Unified English Braille Grade 1 and Grade 2, and every table they
 * include, into public/liblouis/ (or --out), with the tables.json catalog the
 * worker reads and a NOTICE.txt.
 *
 * Table include closure: liblouis tables reference other tables via
 * `include <file>` lines. This script recursively parses those lines and
 * copies the full closure, so the engine never meets an include it lacks.
 *
 * Licensing: every table copied is LGPL-2.1-or-later, and each carries its
 * own header naming its authors.
 */

import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const DEST_DIR = path.join(ROOT, 'public', 'liblouis');

// unicode.dis is not user-selectable: it goes first in every table list so
// that liblouis answers in Unicode braille.
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
 * @param {string} sourceDir - The folder the tables are read from
 * @returns {{ closure: string[], missing: string[] }}
 */
function resolveTableClosure(seeds, sourceDir) {
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

const from = option('--from');
const version = option('--liblouis');
if (!from || !version) {
  console.error(
    'Usage: node scripts/setup-liblouis.js --from <tables> --liblouis <version> [--out <dir>]'
  );
  process.exit(2);
}
setupFromRelease(
  path.resolve(from),
  path.resolve(option('--out') || DEST_DIR),
  version
);
