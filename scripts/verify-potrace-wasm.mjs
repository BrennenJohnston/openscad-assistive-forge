#!/usr/bin/env node
/**
 * Prove the built Potrace wasm actually traces.
 *
 * A build step that only checks a file exists would happily ship a wasm that
 * loads and then draws every picture upside down. These shapes have answers
 * that can be worked out on paper, so a wrong one is caught here rather than
 * by a person wondering why their charm came out mirrored.
 *
 * Run after scripts/build-potrace-wasm.sh:
 *   node scripts/verify-potrace-wasm.mjs
 *
 * @license GPL-3.0-or-later
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { trace, countSubpaths, resetPotrace } from '../src/js/potrace-trace.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILT = path.join(ROOT, 'public', 'wasm', 'potrace', 'potrace.mjs');

if (!existsSync(BUILT)) {
  console.error(`No build to verify at ${BUILT}.`);
  console.error('Run ./scripts/build-potrace-wasm.sh first.');
  process.exit(1);
}

const loader = () => import(pathToFileURL(BUILT).href);

/** A blank mask, one byte per pixel. */
function mask(width, height) {
  return { width, height, data: new Uint8Array(width * height) };
}

function fill(m, x0, y0, x1, y1, value = 1) {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) m.data[y * m.width + x] = value;
  }
  return m;
}

/** Every coordinate in a piece of path data, as {xs, ys}. */
function coordinates(pathData) {
  const numbers = pathData
    .replace(/[MCLZ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(Number);
  const xs = [];
  const ys = [];
  for (let i = 0; i < numbers.length; i += 2) {
    xs.push(numbers[i]);
    ys.push(numbers[i + 1]);
  }
  return { xs, ys };
}

const box = (pathData) => {
  const { xs, ys } = coordinates(pathData);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
};

let failures = 0;
const check = (name, condition, detail) => {
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` - ${detail}` : ''}`);
  }
};

const run = (m, options) => trace(m.data, m.width, m.height, { loader, ...options });

console.log('Verifying public/wasm/potrace/potrace.mjs\n');

// A picture with no ink in it is not a failure: it is a picture with no ink in
// it, and the caller has to be able to tell the two apart.
const empty = await run(mask(16, 16));
check('a blank picture traces to nothing at all', empty === '', JSON.stringify(empty));

// A square from (4,4) to (12,12) is one shape, and its corners are known. The
// tolerance is there because potrace fits its polygon by least squares and is
// only obliged to keep a vertex inside the unit square of its corner; a square
// that has moved further than that has moved for some other reason.
const square = await run(fill(mask(16, 16), 4, 4, 12, 12));
const squareBox = box(square);
const near = (value, want) => Math.abs(value - want) <= 1;
check('a square is one closed shape', countSubpaths(square) === 1, `got ${countSubpaths(square)}`);
check(
  'the square lands where it was drawn',
  near(squareBox.minX, 4) &&
    near(squareBox.maxX, 12) &&
    near(squareBox.minY, 4) &&
    near(squareBox.maxY, 12),
  `${JSON.stringify(squareBox)}, expected about 4..12 on both axes`
);

// ★ The flip. Ink in the TOP rows must come back in the TOP half of the
// drawing: potrace counts rows from the bottom and its own SVG backend flips
// them back, so a build that does only half of that pair is upside down. Half
// a picture is a wide margin on purpose - the question is which end the ink is
// at, and no amount of curve fitting can move a band that far.
const topRows = await run(fill(mask(16, 16), 0, 0, 16, 2));
const topBox = box(topRows);
check(
  'the top of the picture is the top of the drawing',
  topBox.maxY <= 8,
  `y spans ${topBox.minY}..${topBox.maxY}, expected the top half`
);

const bottomRows = await run(fill(mask(16, 16), 0, 14, 16, 16));
const bottomBox = box(bottomRows);
check(
  'and the bottom is the bottom',
  bottomBox.minY >= 8,
  `y spans ${bottomBox.minY}..${bottomBox.maxY}, expected the bottom half`
);

const leftColumns = await run(fill(mask(16, 16), 0, 0, 2, 16));
const leftBox = box(leftColumns);
check(
  'the left edge is the left edge',
  leftBox.maxX <= 8,
  `x spans ${leftBox.minX}..${leftBox.maxX}, expected the left half`
);

// A ring is an outer boundary and a hole, which is two closed shapes filled
// even-odd. If the hole were missing the drawing would print solid.
const ring = fill(fill(mask(24, 24), 4, 4, 20, 20), 9, 9, 15, 15, 0);
const ringPath = await run(ring);
check('a ring is two closed shapes', countSubpaths(ringPath) === 2, `got ${countSubpaths(ringPath)}`);

// An island inside the hole is a third shape, and even-odd fills it again.
const island = fill(ring, 11, 11, 13, 13, 1);
const islandPath = await run(island);
check(
  'an island inside the hole is a third',
  countSubpaths(islandPath) === 3,
  `got ${countSubpaths(islandPath)}`
);

// turdsize is the speck filter, and it has to be reaching the library.
const speckled = fill(fill(mask(24, 24), 4, 4, 12, 12), 20, 20, 21, 21);
const kept = await run(speckled, { turdsize: 0 });
const dropped = await run(speckled, { turdsize: 2 });
check('turdsize 0 keeps a single-pixel speck', countSubpaths(kept) === 2, `got ${countSubpaths(kept)}`);
check(
  'turdsize 2 drops it',
  countSubpaths(dropped) === 1,
  `got ${countSubpaths(dropped)}`
);

// alphamax 0 makes every corner sharp, so a circle traced that way must come
// back as straight lines only - proof the curve settings are wired through.
const disc = mask(40, 40);
for (let y = 0; y < 40; y++) {
  for (let x = 0; x < 40; x++) {
    if ((x - 20) ** 2 + (y - 20) ** 2 < 15 * 15) disc.data[y * 40 + x] = 1;
  }
}
const rounded = await run(disc);
const sharp = await run(disc, { alphamax: 0 });
check('a disc traced normally uses curves', rounded.includes('C'), 'no curve segments');
check('alphamax 0 makes every corner sharp', !sharp.includes('C'), 'curves survived');

const { default: createPotrace } = await import(pathToFileURL(BUILT).href);
const mod = await createPotrace();
const version = mod.UTF8ToString(mod._potrace_build_version());
check('the wasm reports the pinned potrace version', /1\.16/.test(version), version);
console.log(`\n  potrace_version(): ${version}`);

resetPotrace();

if (failures) {
  console.error(`\n${failures} check(s) failed. This build must not be committed.`);
  process.exit(1);
}
console.log('\nAll checks passed.');
