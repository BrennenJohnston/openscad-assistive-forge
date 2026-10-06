// @vitest-environment node
/**
 * The braille engine: liblouis 3.39.0, built by scripts/build-liblouis-wasm.sh
 * and driven through src/js/liblouis-engine.js with the tables the app ships,
 * the way the worker drives it.
 *
 * The reference is what native liblouis 3.39.0 answered for the same phrases,
 * written by the build's own check (tests/fixtures/braille-reference/). Every
 * phrase in both tables has to come out the same, cell for cell. The binding
 * this replaced passed its tests while a capital passage or a word with a
 * number in it crashed the app, because none of its tests had more cells than
 * letters; these phrases have plenty.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import {
  backTranslate,
  installTables,
  loadLiblouis,
  resetLiblouis,
  translate,
  version,
} from '../../src/js/liblouis-engine.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const BUILT = path.join(ROOT, 'vendor', 'liblouis', 'liblouis.mjs')
const WASM = path.join(ROOT, 'public', 'wasm', 'liblouis', 'liblouis.wasm')
const SHIPPED = path.join(ROOT, 'public', 'liblouis')
const FIXTURES = path.join(ROOT, 'tests', 'fixtures', 'braille-reference')

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))
const corpus = readJson(path.join(FIXTURES, 'corpus.json'))
const reference = readJson(path.join(FIXTURES, 'liblouis-3.39.0.json'))
const catalog = readJson(path.join(SHIPPED, 'tables.json'))
const loader = () => import(pathToFileURL(BUILT).href)

let mod

beforeAll(async () => {
  resetLiblouis()
  mod = await loadLiblouis(loader, { wasmUrl: WASM })
  installTables(
    mod,
    catalog.closure.map((name) => ({
      name,
      bytes: readFileSync(path.join(SHIPPED, 'tables', name)),
    }))
  )
})

afterAll(() => resetLiblouis())

/** A row may hold several typed lines; each one is translated on its own. */
const translateRow = (table, text) =>
  text
    .split('\n')
    .map((line) => translate(mod, table, line).braille)
    .join('\n')

describe('the braille engine against native liblouis 3.39.0', () => {
  it('is the release the reference was taken from', () => {
    expect(version(mod)).toBe(reference.liblouis)
  })

  for (const table of Object.keys(reference.tables)) {
    it.each(corpus.map((row) => [row.id, row.text]))(
      `${table} %s %j`,
      (id, text) => {
        expect(translateRow(table, text)).toBe(reference.tables[table][id])
      }
    )
  }
})

describe('the braille engine', () => {
  it('names the character each cell came from, inside its own text', () => {
    for (const table of Object.keys(reference.tables)) {
      for (const row of corpus) {
        for (const line of row.text.split('\n')) {
          const { braille, inputPos } = translate(mod, table, line)
          expect(inputPos, `${table} ${row.id}`).toHaveLength(braille.length)
          for (const p of inputPos) {
            expect(p).toBeGreaterThanOrEqual(0)
            expect(p).toBeLessThan(line.length)
          }
        }
      }
    }
  })

  it('counts positions in the string, past a character two units long', () => {
    // An emoji is one character to liblouis and two UTF-16 units to
    // JavaScript, so the B's cells come from index 3, not 2.
    const { inputPos } = translate(mod, 'en-ueb-g2.ctb', 'A\u{1F600}B')
    expect(inputPos[inputPos.length - 1]).toBe(3)
  })

  it('retries a buffer that is too small rather than return a short translation', () => {
    const text = 'ROOM ROOM ROOM ROOM'
    const whole = translate(mod, 'en-ueb-g2.ctb', text)
    const real = mod._lou_translate
    let calls = 0
    mod._lou_translate = (...args) => {
      calls++
      return real(...args)
    }
    try {
      expect(translate(mod, 'en-ueb-g2.ctb', text, { capacity: 4 })).toEqual(whole)
    } finally {
      mod._lou_translate = real
    }
    expect(calls).toBeGreaterThan(1)
  })

  it('reads one contracted cell back as its whole word', () => {
    expect(backTranslate(mod, 'en-ueb-g2.ctb', '\u2805')).toBe('knowledge')
  })

  it('reads a translated phrase back as the phrase', () => {
    const phrase = 'knowledge for people'
    const braille = translate(mod, 'en-ueb-g2.ctb', phrase).braille
    expect(backTranslate(mod, 'en-ueb-g2.ctb', braille)).toBe(phrase)
  })

  it('refuses a table name that could reach outside its folder', () => {
    expect(() => translate(mod, '../etc/passwd', 'room')).toThrow(
      'Not a liblouis table name'
    )
  })

  it('names the table and gives liblouis its own reason when a table is missing', () => {
    expect(() => translate(mod, 'en-us-g2.ctb', 'room')).toThrow(
      /^liblouis could not translate this text with en-us-g2\.ctb \(.+\)$/
    )
  })
})
