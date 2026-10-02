// @vitest-environment node
/**
 * The translator's two rules for text liblouis cannot write as six-dot
 * braille, run against the committed engine and the tables the app ships,
 * the way the worker runs them:
 *
 * - a character the selected table does not define is left out of the
 *   braille. liblouis would spell it out as an escape such as '\x2603',
 *   eight cells with one dot-7 cell, which a six-dot sign prints as a
 *   different cell;
 * - a no-break space or a tab is a word space. liblouis hands either back as
 *   itself, not as a blank cell, where the line is translated whole.
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
  normalizeSpaces,
  translateLeavingOut,
} from '../../src/js/braille-translator.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const BUILT = path.join(ROOT, 'vendor', 'liblouis', 'liblouis.mjs')
const WASM = path.join(ROOT, 'public', 'wasm', 'liblouis', 'liblouis.wasm')
const SHIPPED = path.join(ROOT, 'public', 'liblouis')
const catalog = JSON.parse(
  readFileSync(path.join(SHIPPED, 'tables.json'), 'utf8')
)

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

/** What the worker answers translateText, for one table. */
const engine = (table) => async (text) => {
  const { braille, inputPos } = translate(mod, table, text)
  return { translation: braille, inputPos }
}

const TABLES = ['en-ueb-g1.ctb', 'en-ueb-g2.ctb']
const SNOWMAN = '\u2603'
const HEART = '\u2665'
const CJK = '\u4E2D'
const NO_BREAK_SPACE = '\u00A0'
const TAB = '\t'

describe('translateLeavingOut: a character the table does not define', () => {
  it('is left out of the braille, which keeps the cells it had before', async () => {
    const result = await translateLeavingOut(
      `ROOM ${SNOWMAN} 101`,
      engine('en-ueb-g2.ctb')
    )
    // Capital word ROOM, a blank cell either side of where the snowman
    // stood, number 101; measured against native liblouis 3.39.0
    expect(result.braille).toBe(
      '\u2820\u2820\u2817\u2815\u2815\u280D\u2800\u2800\u283C\u2801\u281A\u2801'
    )
    expect(result.leftOut).toEqual([SNOWMAN])
  })

  it('leaves no braille when the text is nothing else', async () => {
    for (const table of TABLES) {
      const result = await translateLeavingOut(SNOWMAN, engine(table))
      expect(result).toEqual({ braille: '', inputPos: [], leftOut: [SNOWMAN] })
    }
  })

  it('leaves the rest exactly as if the character had never been typed', async () => {
    const cases = [
      [`a${SNOWMAN}b`, 'ab', [SNOWMAN]],
      [`${SNOWMAN}${SNOWMAN}`, '', [SNOWMAN]],
      [`ROOM ${SNOWMAN}${SNOWMAN} ${CJK} 101`, 'ROOM   101', [SNOWMAN, CJK]],
      [`I ${HEART} NY`, 'I  NY', [HEART]],
    ]
    for (const table of TABLES) {
      for (const [text, without, leftOut] of cases) {
        const result = await translateLeavingOut(text, engine(table))
        const expected = without === '' ? '' : translate(mod, table, without).braille
        expect(result.braille, `${table}: ${text}`).toBe(expected)
        expect(result.braille).toMatch(/^[\u2800-\u283F]*$/)
        expect(new Set(result.leftOut)).toEqual(new Set(leftOut))
      }
    }
  })

  it('changes nothing in a text the table defines, positions included', async () => {
    // Accents, Greek, currency, dashes, a fraction and a check mark are all
    // defined in Unified English Braille
    const text = `Tee3D caf\u00E9 \u03A9 \u20AC5 \u2013 \u00BD \u2713`
    for (const table of TABLES) {
      const direct = translate(mod, table, text)
      const result = await translateLeavingOut(text, engine(table))
      expect(result).toEqual({
        braille: direct.braille,
        inputPos: direct.inputPos,
        leftOut: [],
      })
    }
  })
})

describe('normalizeSpaces: a no-break space or a tab', () => {
  it('becomes an ordinary space, so the text keeps its length', () => {
    expect(normalizeSpaces(`Room${NO_BREAK_SPACE}101`)).toBe('Room 101')
    expect(normalizeSpaces(`Room${TAB}101`)).toBe('Room 101')
  })

  it('then translates as a blank cell, the same as an ordinary space', async () => {
    for (const table of TABLES) {
      const plain = translate(mod, table, 'Room 101').braille
      for (const space of [NO_BREAK_SPACE, TAB]) {
        const result = await translateLeavingOut(
          normalizeSpaces(`Room${space}101`),
          engine(table)
        )
        expect(result).toEqual(
          expect.objectContaining({ braille: plain, leftOut: [] })
        )
      }
    }
  })
})
