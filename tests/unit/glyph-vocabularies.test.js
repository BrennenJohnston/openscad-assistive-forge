import { describe, it, expect } from 'vitest'
import { GLYPH_VOCABULARIES } from '../../src/js/game/glyph-vocabularies.js'
import { SURFACE_CLASS } from '../../src/js/game/city-class-pass.js'
import { GLYPH_COUNT, FIRST_CHAR_CODE } from '../../src/js/_hfm-paint.js'

/**
 * The vocabularies are an ART ASSET that is meant to be edited by hand, so
 * these guard the two rules an edit can break without looking broken until
 * someone walks the city and sees it.
 */
describe('glyph vocabularies (CW-23)', () => {
  const rows = Object.entries(GLYPH_VOCABULARIES)
  const nameOf = (id) =>
    Object.keys(SURFACE_CLASS).find((k) => SURFACE_CLASS[k] === Number(id)) ??
    `class ${id}`

  it('gives every surface class except sky a vocabulary', () => {
    const covered = new Set(Object.keys(GLYPH_VOCABULARIES).map(Number))
    for (const [name, id] of Object.entries(SURFACE_CLASS)) {
      if (id === SURFACE_CLASS.SKY) continue
      expect(covered.has(id), `${name} has no vocabulary row`).toBe(true)
    }
  })

  it('never lets the sky claim a vocabulary', () => {
    // Sky is the fallback: unclassified cells must keep the full 95 glyphs.
    expect(GLYPH_VOCABULARIES[SURFACE_CLASS.SKY]).toBeUndefined()
  })

  for (const [id, glyphs] of rows) {
    describe(nameOf(id), () => {
      it('contains the space character', () => {
        // Rule 1. Without it the darkest cells cannot stay empty and the
        // black the picture is built on fills in with texture.
        expect(glyphs.includes(' '), `"${glyphs}" has no space`).toBe(true)
      })

      it('is all printable ASCII the atlas actually holds', () => {
        for (const ch of glyphs) {
          const idx = ch.charCodeAt(0) - FIRST_CHAR_CODE
          expect(
            idx >= 0 && idx < GLYPH_COUNT,
            `${nameOf(id)} contains ${JSON.stringify(ch)}, which is outside the 95 printable ASCII glyphs`
          ).toBe(true)
        }
      })

      it('repeats no character', () => {
        const seen = new Set(glyphs)
        expect(seen.size, `"${glyphs}" repeats a character`).toBe(glyphs.length)
      })

      it('spans light, middle and dense characters', () => {
        // Rule 2. The converter still chooses WITHIN a row by brightness, so a
        // row clustered at one weight flattens that surface to a single tone.
        // Ink weight here is a coarse stand-in for glyph coverage - enough to
        // catch a row that has drifted to one end.
        const LIGHT = new Set(" .,'`:;\"^_-")
        const DENSE = new Set('#%8&$@MWBDGRQ0')
        const light = [...glyphs].filter((c) => LIGHT.has(c)).length
        const dense = [...glyphs].filter((c) => DENSE.has(c)).length
        const middle = glyphs.length - light - dense
        expect(light, `"${glyphs}" has no light characters`).toBeGreaterThan(0)
        expect(
          dense + middle,
          `"${glyphs}" has nothing above the lightest weights`
        ).toBeGreaterThan(0)
        expect(
          glyphs.length,
          `"${glyphs}" is too small to carry a tonal range`
        ).toBeGreaterThanOrEqual(6)
      })
    })
  }
})

describe('surface classes (CW-23)', () => {
  it('gives every class a distinct id, with sky at zero', () => {
    // Zero is what an unclassified pixel reads back as, so sky has to BE zero
    // or an unknown mesh would be reported as some real surface.
    expect(SURFACE_CLASS.SKY).toBe(0)
    const ids = Object.values(SURFACE_CLASS)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('keeps every id inside one byte, because that is the wire format', () => {
    for (const [name, id] of Object.entries(SURFACE_CLASS)) {
      expect(Number.isInteger(id), `${name} is not an integer`).toBe(true)
      expect(id >= 0 && id <= 255, `${name} does not fit in a byte`).toBe(true)
    }
  })
})
