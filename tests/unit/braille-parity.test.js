// @vitest-environment node
/**
 * Parity: the app's whole translation path (the engine, then the card's and
 * the sign's layouts) against two other programs' braille for every corpus
 * phrase, capitals kept, in both tables:
 *
 * - native liblouis 3.39.0 (`liblouis-3.39.0.json`, written by the build's
 *   own check), cell for cell;
 * - a second liblouis-based generator (`second-generator.json`), cell for
 *   cell, unless a row is listed in its `expectedDifferences` with the
 *   liblouis output that explains the difference.
 *
 * At a wide row nothing wraps, so each typed line is one row holding exactly
 * the reference cells. At 12 cells per row the rows still carry the same
 * cells: wrapping and dividing never change one.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import {
  installTables,
  loadLiblouis,
  resetLiblouis,
  translate,
} from '../../src/js/liblouis-engine.js'
import { layoutBrailleText, layoutSignText } from '../../src/js/braille-wrap.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const BUILT = path.join(ROOT, 'vendor', 'liblouis', 'liblouis.mjs')
const WASM = path.join(ROOT, 'public', 'wasm', 'liblouis', 'liblouis.wasm')
const SHIPPED = path.join(ROOT, 'public', 'liblouis')
const FIXTURES = path.join(ROOT, 'tests', 'fixtures', 'braille-reference')
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))
const catalog = readJson(path.join(SHIPPED, 'tables.json'))
const corpus = readJson(path.join(FIXTURES, 'corpus.json'))
const native = readJson(path.join(FIXTURES, 'liblouis-3.39.0.json'))
const second = readJson(path.join(FIXTURES, 'second-generator.json'))
const WIDE = 1000

let mod

beforeAll(async () => {
  resetLiblouis()
  mod = await loadLiblouis(() => import(pathToFileURL(BUILT).href), {
    wasmUrl: WASM,
  })
  installTables(
    mod,
    catalog.closure.map((name) => ({
      name,
      bytes: readFileSync(path.join(SHIPPED, 'tables', name)),
    }))
  )
})

afterAll(() => resetLiblouis())

/**
 * The engine's answer as the layouts receive it, capitals kept. It is also
 * the plain braille string the layouts took when they translated word by
 * word, so this test runs against that code too.
 */
const engine = (table) => async (text) => {
  const { braille, inputPos } = translate(mod, table, text)
  return Object.assign(new String(braille), { braille, inputPos })
}

const cardRows = async (table, text, cellsPerLine) =>
  (
    await layoutBrailleText({
      text,
      translate: engine(table),
      cellsPerLine,
      rowsPerCard: 100,
      maxTotalLines: 100,
    })
  ).allLines.map((row) => String(row.braille))

const signRows = async (table, text, cellsPerLine) =>
  (
    await layoutSignText({
      text,
      translate: engine(table),
      maxSourceChars: WIDE,
      brailleCellsPerLine: cellsPerLine,
      maxRows: 100,
    })
  ).brailleRows.map((row) => String(row.braille))

/** The cells, without blank cells or line breaks, which wrapping may move. */
const cellsOf = (rows) => rows.join('').replace(/[\u2800\n]/g, '')

const rows = corpus.map((row) => [row.id, row.text])

for (const table of Object.keys(native.tables)) {
  describe(`${table}: the app against both programs`, () => {
    it.each(rows)('%s, on a card and on a sign at a wide row', async (id, text) => {
      const reference = native.tables[table][id]
      expect((await cardRows(table, text, WIDE)).join('\n')).toBe(reference)
      expect((await signRows(table, text, WIDE)).join('\n')).toBe(reference)
      const explained = second.expectedDifferences[table]?.[id]
      if (explained === undefined) {
        expect(second.tables[table][id]).toBe(reference)
      } else {
        // The second generator differs here, and its own liblouis says why
        expect(second.tables[table][id]).toBe(explained)
      }
    })

    it.each(rows)('%s keeps every cell at 12 cells per row', async (id, text) => {
      const reference = cellsOf([native.tables[table][id]])
      expect(cellsOf(await cardRows(table, text, 12))).toBe(reference)
      expect(cellsOf(await signRows(table, text, 12))).toBe(reference)
    })
  })
}
