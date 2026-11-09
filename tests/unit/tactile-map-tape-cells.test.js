// @vitest-environment node
/**
 * The tape measured by the braille translator: each label's cells counted
 * from its braille, contracted (UEB Grade 2) or uncontracted (Grade 1),
 * with the estimate kept for an engine that cannot load. The real engine
 * runs here, as the braille suites run it, so the counts are liblouis's.
 *
 * @license GPL-3.0-or-later
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  installTables,
  loadLiblouis,
  resetLiblouis,
  translate,
} from '../../src/js/liblouis-engine.js';
import {
  TAPE_GRADES,
  TapeMeasure,
  brailleCells,
  measureTape,
  tableFor,
} from '../../src/js/tactile-map/tape-cells.js';
import { labelCells } from '../../src/js/tactile-map/map-key.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BUILT = path.join(ROOT, 'vendor', 'liblouis', 'liblouis.mjs');
const WASM = path.join(ROOT, 'public', 'wasm', 'liblouis', 'liblouis.wasm');
const SHIPPED = path.join(ROOT, 'public', 'liblouis');
const catalog = JSON.parse(
  readFileSync(path.join(SHIPPED, 'tables.json'), 'utf8')
);

let mod;
beforeAll(async () => {
  resetLiblouis();
  mod = await loadLiblouis(() => import(pathToFileURL(BUILT).href), {
    wasmUrl: WASM,
  });
  installTables(
    mod,
    catalog.closure.map((name) => ({
      name,
      bytes: readFileSync(path.join(SHIPPED, 'tables', name)),
    }))
  );
});
afterAll(() => resetLiblouis());

/** The app's translator, as the measure calls it: text and table in, braille out. */
const engine = async (text, table) => translate(mod, table, text).braille;

describe('the grades and the cells', () => {
  it('offers uncontracted first, as a hand-press labeler writes, each grade with its liblouis table', () => {
    expect(TAPE_GRADES.map((g) => [g.key, g.name, g.table])).toEqual([
      ['g1', 'Uncontracted (Grade 1)', 'en-ueb-g1.ctb'],
      ['g2', 'Contracted (UEB Grade 2)', 'en-ueb-g2.ctb'],
    ]);
    expect(tableFor('g2')).toBe('en-ueb-g2.ctb');
    expect(tableFor('nonsense')).toBe('en-ueb-g1.ctb');
  });

  it('counts every character of a braille string as a cell, a blank cell too', () => {
    expect(brailleCells('⠏⠉')).toBe(2);
    expect(brailleCells('⠏⠊⠝⠑⠀⠎⠞')).toBe(7);
    expect(brailleCells('')).toBe(0);
  });
});

describe('the measure with the real engine', () => {
  it('measures Oceanography Building in fewer cells contracted than uncontracted, and the estimate stands between or above them', async () => {
    const tape = await measureTape(['Oceanography Building'], 'g2', engine);
    await tape.measure(['Oceanography Building'], 'g1');
    const g2 = tape.of('Oceanography Building', 'g2');
    const g1 = tape.of('Oceanography Building', 'g1');
    expect(g2.measured).toBe(true);
    expect(g1.measured).toBe(true);
    expect(g2.cells).toBe(brailleCells(g2.braille));
    expect(g1.cells).toBe(brailleCells(g1.braille));
    // Pasted into the record from this line.
    console.log(
      `Oceanography Building: contracted ${g2.cells} cells (${g2.braille}), uncontracted ${g1.cells} cells (${g1.braille}), the estimate ${labelCells('Oceanography Building')}`
    );
    expect(g2.cells).toBeLessThan(g1.cells);
    // The letters lowercased, as the labeler's tape is: no capital signs.
    expect(g1.cells).toBe('oceanography building'.length);
  });

  it('answers a piece it has not seen from the words it has, a blank cell between them, and a word it has not seen by the estimate', async () => {
    const tape = new TapeMeasure(engine);
    await tape.measure(['Plaza Cafe'], 'g2');
    const whole = tape.of('Plaza Cafe', 'g2');
    const plaza = tape.of('Plaza', 'g2');
    const cafe = tape.of('cafe', 'g2');
    expect(whole.cells).toBe(plaza.cells + 1 + cafe.cells);
    // "Cafe Plaza" was never translated whole; its words were.
    const turned = tape.of('Cafe Plaza', 'g2');
    expect(turned.measured).toBe(true);
    expect(turned.cells).toBe(whole.cells);
    const unseen = tape.of('Fisheries Center', 'g2');
    expect(unseen).toEqual({
      cells: labelCells('Fisheries Center'),
      braille: '',
      measured: false,
      grade: 'g2',
    });
    expect(tape.missing(['Plaza Cafe', 'Fisheries Center'], 'g2')).toEqual([
      'Fisheries Center',
    ]);
  });

  it('keeps the estimate, says so, and does not fail the layout when the engine cannot translate', async () => {
    const broken = new TapeMeasure(async () => {
      throw new Error('liblouis worker failed');
    });
    const out = await broken.measure(['Pine'], 'g2');
    expect(out.measured).toBe(false);
    expect(broken.failed).toBe(true);
    expect(broken.of('Pine', 'g2')).toEqual({
      cells: labelCells('Pine'),
      braille: '',
      measured: false,
      grade: 'g2',
    });
    const view = broken.view('g2');
    expect(view.measured).toBe(false);
    expect(view.of('Pine').cells).toBe(5);
  });
});
