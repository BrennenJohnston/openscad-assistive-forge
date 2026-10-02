// @vitest-environment node
/**
 * Whole-line translation against the committed engine and the tables the
 * app ships. A typed line laid out on a card must hold exactly the cells
 * liblouis gives the whole line, cut only at its blank cells, for every
 * test phrase whose braille words each fit a line. Translating word by
 * word failed this wherever a capital passage or another indicator spans
 * words. The sign model's default braille line is checked the same way:
 * it must be what the panel lays out for the model's default text.
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
import {
  countCells,
  layoutBrailleText,
  layoutSignText,
} from '../../src/js/braille-wrap.js'
import { extractParameters } from '../../src/js/parser.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const BUILT = path.join(ROOT, 'vendor', 'liblouis', 'liblouis.mjs')
const WASM = path.join(ROOT, 'public', 'wasm', 'liblouis', 'liblouis.wasm')
const SHIPPED = path.join(ROOT, 'public', 'liblouis')
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))
const catalog = readJson(path.join(SHIPPED, 'tables.json'))
const corpus = readJson(
  path.join(ROOT, 'tests', 'fixtures', 'braille-reference', 'corpus.json')
)
const BLANK = '\u2800'

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
 * The engine's answer as the layout receives it, also readable as the plain
 * braille string the layout took when it translated word by word.
 */
const engine = (table) => async (text) => {
  const { braille, inputPos } = translate(mod, table, text)
  return Object.assign(new String(braille), { braille, inputPos })
}

/** Every typed line in the corpus, spaces as the layout normalizes them. */
const lines = corpus.flatMap((row) =>
  row.text
    .split('\n')
    .map((typed) => typed.trim().split(/\s+/).join(' '))
    .filter((line) => line !== '')
    .map((line) => ({ id: row.id, line }))
)

describe('a card line holds the cells of the whole line', () => {
  for (const table of ['en-ueb-g1.ctb', 'en-ueb-g2.ctb']) {
    for (const cellsPerLine of [12, 40]) {
      it(`${table}, ${cellsPerLine} cells per line`, async () => {
        const differences = []
        let compared = 0
        for (const { id, line } of lines) {
          const whole = translate(mod, table, line).braille
          // A word longer than a line is divided, so its rows cannot rejoin
          // with blank cells; those lines are checked by the division tests.
          if (whole.split(BLANK).some((word) => countCells(word) > cellsPerLine)) {
            continue
          }
          const { allLines } = await layoutBrailleText({
            text: line,
            translate: engine(table),
            cellsPerLine,
            rowsPerCard: 100,
            maxTotalLines: 100,
          })
          compared++
          const rejoined = allLines.map((row) => String(row.braille)).join(BLANK)
          if (rejoined !== whole) differences.push(`${id}: ${line}`)
        }
        expect(differences).toEqual([])
        expect(compared).toBeGreaterThan(40)
      })
    }
  }
})

describe('the sign model opens with its own braille', () => {
  it('holds in Line_1 what the panel lays out for its default text', async () => {
    const sign = path.join(ROOT, 'public', 'examples', 'braille-sign')
    const { parameters } = extractParameters(
      readFileSync(path.join(sign, 'braille_sign.scad'), 'utf8')
    )
    const { brailleTranslation } = readJson(path.join(sign, 'manifest.json'))
    const keepCapitals = brailleTranslation.capitals !== 'off'
    const translateAsThePanel = async (text) =>
      engine(brailleTranslation.defaultTable)(
        keepCapitals ? text : text.toLowerCase()
      )
    const { brailleRows } = await layoutSignText({
      text: parameters.sign_text_1.default,
      translate: translateAsThePanel,
      maxSourceChars: 100,
      brailleCellsPerLine: 40,
      maxRows: brailleTranslation.lineParams.length,
    })
    // The first layout writes nothing when the model already holds this
    expect(brailleRows.map((row) => String(row.braille))).toEqual([
      parameters.Line_1.default,
    ])
  })
})
