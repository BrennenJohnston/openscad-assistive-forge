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
 * cells: wrapping and dividing never change one, and dividing an address or
 * a number only adds the line continuation sign at the end of a row.
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

/** The line continuation sign (dot 5). */
const CONTINUATION = '\u2810'

/** A row without the line continuation sign a divided row ends with. */
const unmarked = (row) => row.replace(/\u2810$/, '')

const rows = corpus.map((row) => [row.id, row.text])

it('has no reference word ending in dot 5, so a row ending in it ends with the sign', () => {
  for (const table of Object.keys(native.tables)) {
    for (const braille of Object.values(native.tables[table])) {
      for (const word of braille.split(/[\u2800\n]/)) {
        expect(word.endsWith(CONTINUATION)).toBe(false)
      }
    }
  }
})

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
      expect(cellsOf((await cardRows(table, text, 12)).map(unmarked))).toBe(
        reference
      )
      expect(cellsOf((await signRows(table, text, 12)).map(unmarked))).toBe(
        reference
      )
    })
  })

  describe(`${table}: the line continuation sign on a card and on a sign`, () => {
    const both = async (text, cellsPerLine) => [
      await cardRows(table, text, cellsPerLine),
      await signRows(table, text, cellsPerLine),
    ]

    it('ends each row of a divided e-mail address but the last', async () => {
      const whole = translate(mod, table, 'first.last@example.com').braille
      for (const divided of await both('first.last@example.com', 13)) {
        expect(divided.length).toBeGreaterThan(1)
        expect(divided.map((row) => row.endsWith(CONTINUATION))).toEqual(
          divided.map((row, i) => i < divided.length - 1)
        )
        expect(divided.map(unmarked).join('')).toBe(whole)
      }
    })

    it('ends the first row of a phone number divided after a period, with one number sign', async () => {
      for (const divided of await both('206.555.0147', 8)) {
        expect(divided).toEqual([
          '\u283C\u2803\u281A\u280B\u2832\u2810',
          '\u2811\u2811\u2811\u2832\u281A\u2801\u2819\u281B',
        ])
        expect(divided.join('').split('\u283C')).toHaveLength(2)
      }
    })

    it('adds nothing to a word divided at its own hyphen', async () => {
      // Grade 1 spells addressed in 9 cells, Grade 2 in 8
      const cellsPerLine = table === 'en-ueb-g2.ctb' ? 8 : 9
      for (const divided of await both('self-addressed', cellsPerLine)) {
        expect(divided).toHaveLength(2)
        expect(divided[0].endsWith('\u2824')).toBe(true)
        expect(divided.some((row) => row.endsWith(CONTINUATION))).toBe(false)
      }
    })

    it('still refuses a 30-letter word with no division point', async () => {
      const text = 'abcdefghijklmnopqrstuvwxyzabcd'
      const card = await layoutBrailleText({
        text,
        translate: engine(table),
        cellsPerLine: 13,
        rowsPerCard: 100,
        maxTotalLines: 100,
      })
      const sign = await layoutSignText({
        text,
        translate: engine(table),
        maxSourceChars: WIDE,
        brailleCellsPerLine: 13,
        maxRows: 100,
      })
      for (const { warnings } of [card, sign]) {
        expect(warnings.map((w) => w.type)).toEqual(['word-too-long'])
        expect(warnings[0].message).toContain('It cannot be divided automatically.')
      }
    })
  })
}
