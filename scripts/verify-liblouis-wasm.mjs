#!/usr/bin/env node
/**
 * Prove the built liblouis wasm translates exactly as native liblouis does.
 *
 * A wasm that loads and then gives slightly different braille would sail past
 * a build that only checks a version number. This runs every phrase of the
 * test corpus, in both English tables, through the built module and through a
 * native lou_translate from the same release, and fails on any difference,
 * cell for cell. It also checks what only the module can get wrong: where
 * each cell came from, back-translation, and the retry when the first buffer
 * is too small.
 *
 * Run after scripts/build-liblouis-wasm.sh:
 *   node scripts/verify-liblouis-wasm.mjs --native <lou_translate> --tables <dir> [--write-reference]
 *
 * --tables is the folder of tables both translators read. --write-reference
 * also writes the native tool's answers to
 * tests/fixtures/braille-reference/liblouis-<version>.json.
 *
 * @license GPL-3.0-or-later
 */

import { spawnSync } from 'node:child_process';
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  backTranslate,
  installTables,
  loadLiblouis,
  resetLiblouis,
  translate,
  version,
} from '../src/js/liblouis-engine.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILT = path.join(ROOT, 'vendor', 'liblouis', 'liblouis.mjs');
const WASM = path.join(ROOT, 'public', 'wasm', 'liblouis', 'liblouis.wasm');
const FIXTURES = path.join(ROOT, 'tests', 'fixtures', 'braille-reference');
const TABLES = ['en-ueb-g2.ctb', 'en-ueb-g1.ctb'];

const option = (name) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const nativeTool = option('--native');
const tablesDir = option('--tables');
const writeReference = process.argv.includes('--write-reference');

if (!nativeTool || !tablesDir) {
  console.error(
    'Usage: node scripts/verify-liblouis-wasm.mjs --native <lou_translate> --tables <dir> [--write-reference]'
  );
  process.exit(2);
}
for (const file of [BUILT, WASM, nativeTool, tablesDir]) {
  if (!existsSync(file)) {
    console.error(`Nothing at ${file}.`);
    console.error(
      'Run ./scripts/build-liblouis-wasm.sh first, and check the paths given.'
    );
    process.exit(1);
  }
}

let failures = 0;
const check = (name, condition, detail) => {
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` - ${detail}` : ''}`);
  }
};

/** Both translators may write a blank cell as a space; compare them as U+2800. */
const blanks = (cells) => cells.replace(/ /g, '\u2800');

/**
 * The native tool, given one line of text per input line, writes one line of
 * braille for each, so a whole table's worth of lines takes one process.
 */
function nativeTranslate(table, lines) {
  const list = `${path.join(tablesDir, 'unicode.dis')},${path.join(tablesDir, table)}`;
  const run = spawnSync(nativeTool, ['--forward', list], {
    input: `${lines.join('\n')}\n`,
    encoding: 'utf8',
  });
  if (run.error || run.status !== 0) {
    throw new Error(
      `lou_translate failed: ${run.error?.message || run.stderr}`
    );
  }
  const out = run.stdout.replace(/\r\n/g, '\n').split('\n');
  if (out[out.length - 1] === '') out.pop();
  if (out.length !== lines.length) {
    throw new Error(
      `lou_translate answered ${out.length} lines for ${lines.length}.`
    );
  }
  return out.map(blanks);
}

const nativeVersion = spawnSync(nativeTool, ['--version'], { encoding: 'utf8' })
  .stdout.split('\n')[0]
  .trim();
const corpus = JSON.parse(
  readFileSync(path.join(FIXTURES, 'corpus.json'), 'utf8')
);

const mod = await loadLiblouis(() => import(pathToFileURL(BUILT).href), {
  wasmUrl: WASM,
});
// Every file in the folder goes in: this run proves the engine, and the
// curated set the app ships is proven separately against the same corpus.
installTables(
  mod,
  readdirSync(tablesDir)
    .filter((name) => statSync(path.join(tablesDir, name)).isFile())
    .map((name) => ({ name, bytes: readFileSync(path.join(tablesDir, name)) }))
);

const builtVersion = version(mod);
console.log(`Built module: liblouis ${builtVersion}`);
console.log(`Native tool:  ${nativeVersion}\n`);
check(
  'the native tool reports the same release',
  nativeVersion.endsWith(builtVersion),
  nativeVersion
);

const reference = { liblouis: builtVersion, tables: {} };
let comparisons = 0;
let differences = 0;
let positionProblems = 0;

for (const table of TABLES) {
  // A row may hold several typed lines; each line is translated on its own.
  const lines = corpus.flatMap((row) => row.text.split('\n'));
  const native = nativeTranslate(table, lines);
  reference.tables[table] = {};
  let next = 0;
  for (const row of corpus) {
    const rowLines = row.text.split('\n');
    const expected = native.slice(next, next + rowLines.length).join('\n');
    next += rowLines.length;
    reference.tables[table][row.id] = expected;
    comparisons++;
    let actual;
    try {
      actual = rowLines
        .map((line) => {
          const { braille, inputPos } = translate(mod, table, line);
          const outside = inputPos.filter((p) => !(p >= 0 && p < line.length));
          if (inputPos.length !== braille.length || outside.length) {
            positionProblems++;
            console.log(
              `  POS  ${table} ${row.id}: ${inputPos.length} positions for ${braille.length} cells, ${outside.length} outside the text`
            );
          }
          return braille;
        })
        .join('\n');
    } catch (error) {
      actual = `<error: ${error.message}>`;
    }
    if (actual !== expected) {
      differences++;
      console.log(
        `  DIFF ${table} ${row.id} ${JSON.stringify(row.text)}\n       native ${expected}\n       wasm   ${actual}`
      );
    }
  }
}
console.log(
  `  ${comparisons} comparisons (${corpus.length} rows, ${TABLES.length} tables), ${differences} differences`
);
check(
  'the wasm equals native liblouis on every row of both tables',
  differences === 0
);

check(
  'every cell names a character inside its own text',
  positionProblems === 0,
  `${positionProblems} line(s) with a position problem`
);

const knowledge = backTranslate(mod, 'en-ueb-g2.ctb', '\u2805');
check(
  'one cell back-translates to its whole word',
  knowledge === 'knowledge',
  JSON.stringify(knowledge)
);
const phrase = 'knowledge for people';
const roundTrip = backTranslate(
  mod,
  'en-ueb-g2.ctb',
  translate(mod, 'en-ueb-g2.ctb', phrase).braille
);
check(
  'a phrase survives the round trip',
  roundTrip === phrase,
  JSON.stringify(roundTrip)
);

// A first buffer far too small must come back whole, never cut short.
const text = 'ROOM ROOM ROOM ROOM';
const whole = translate(mod, 'en-ueb-g2.ctb', text);
const realTranslate = mod._lou_translate;
let calls = 0;
mod._lou_translate = (...args) => {
  calls++;
  return realTranslate(...args);
};
let retried;
try {
  retried = translate(mod, 'en-ueb-g2.ctb', text, { capacity: 4 });
} finally {
  mod._lou_translate = realTranslate;
}
check(
  `a too-small first buffer is retried until the text fits (${calls} calls)`,
  calls > 1 && retried.braille === whole.braille,
  `${calls} calls, ${retried?.braille}`
);

// Not a pass or fail: what liblouis itself reads back from a word that mixes
// letters and a digit, recorded so a later change in the answer shows up.
const mixed = 'Tee3D';
const mixedBack = backTranslate(
  mod,
  'en-ueb-g2.ctb',
  translate(mod, 'en-ueb-g2.ctb', mixed).braille
);
console.log(
  `  note ${mixed} round trip: ${JSON.stringify(mixedBack)}${mixedBack === mixed ? '' : ' (liblouis reads it back differently)'}`
);

if (writeReference) {
  const file = path.join(FIXTURES, `liblouis-${builtVersion}.json`);
  writeFileSync(file, `${JSON.stringify(reference, null, 2)}\n`);
  console.log(
    `\nWrote ${path.relative(ROOT, file)} from the native tool's answers.`
  );
}

resetLiblouis();

if (failures) {
  console.error(
    `\n${failures} check(s) failed. This build must not be committed.`
  );
  process.exit(1);
}
console.log('\nAll checks passed.');
