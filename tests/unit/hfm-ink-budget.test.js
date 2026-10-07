import { describe, it, expect } from 'vitest'
import {
  DEFAULT_INK_BUDGET,
  normalizeInkBudget,
  cellChroma,
  whiteAllowed,
  pickPaletteIndex,
  normalizeChroma,
  parsePaletteColor,
} from '../../src/js/_hfm-paint.js'
import {
  HC_PALETTE_GREEN,
  CITY_PALETTE_INK_BUDGET,
} from '../../src/js/game/hc-palettes.js'

/**
 * Without a budget, colour mode has no way to say "this cell is dim": the
 * cell contrast curve normalises every cell to full scale before its glyph
 * is chosen, and a palette entry is then put on whatever came out. So a dim
 * grey wall arrives at the match as (1, 1, 1) and takes white, which is how
 * more than half of every frame would be white.
 *
 * Every case below states the answer without the budget beside the answer
 * with it, because the whole claim is that one particular cell changes hands.
 */

const PALETTE = HC_PALETTE_GREEN.map((c) => normalizeChroma(parsePaletteColor(c)))
const WHITE_INDEX = HC_PALETTE_GREEN.findIndex(
  (c) => c.toLowerCase() === '#ffffff'
)

describe('the ink budget: the white gate', () => {
  it('sends a dim grey cell to white without the budget, and to a colour with it', () => {
    // The green set's white is the last entry, and a grey cell normalises to
    // exactly it - so it wins by a distance of zero, however dim the cell is.
    expect(WHITE_INDEX).toBeGreaterThanOrEqual(0)
    const stateless = pickPaletteIndex(0.7, 0.7, 0.7, PALETTE, 1)
    expect(stateless).toBe(WHITE_INDEX)

    // With the budget: 0.7 is under the 0.9 white floor, so white is withheld
    // and the cell takes the nearest CHROMATIC entry instead.
    const budget = normalizeInkBudget(CITY_PALETTE_INK_BUDGET)
    expect(whiteAllowed(0.7, cellChroma(0.7, 0.7, 0.7), budget)).toBe(false)
    const budgeted = pickPaletteIndex(0.7, 0.7, 0.7, PALETTE, 1, WHITE_INDEX)
    expect(budgeted).not.toBe(WHITE_INDEX)
    expect(HC_PALETTE_GREEN[budgeted]).toBe('#00ffff')
  })

  it('still lets a bright colourless cell be white', () => {
    const budget = normalizeInkBudget(CITY_PALETTE_INK_BUDGET)
    expect(whiteAllowed(0.95, cellChroma(0.95, 0.95, 0.95), budget)).toBe(true)
    expect(pickPaletteIndex(0.95, 0.95, 0.95, PALETTE, 1)).toBe(WHITE_INDEX)
  })

  it('refuses white to a bright cell that has a colour in it', () => {
    // A bright but tinted cell - a lit amber window, a red brake light - has
    // somewhere better to go than white, and the gate is what sends it there.
    const chroma = cellChroma(1, 0.8, 0.8)
    expect(chroma).toBeCloseTo(0.2, 6)
    const budget = normalizeInkBudget(CITY_PALETTE_INK_BUDGET)
    expect(whiteAllowed(0.95, chroma, budget)).toBe(false)
  })

  it('is exactly the unbudgeted pick when there is no budget', () => {
    for (const lum of [0.1, 0.5, 0.7, 0.95]) {
      expect(whiteAllowed(lum, 0, null)).toBe(true)
      expect(pickPaletteIndex(lum, lum, lum, PALETTE, 1, -1)).toBe(WHITE_INDEX)
    }
  })
})

describe('the ink budget: chroma', () => {
  it('is zero for any grey and one for a pure hue', () => {
    expect(cellChroma(0, 0, 0)).toBe(0)
    expect(cellChroma(0.2, 0.2, 0.2)).toBe(0)
    expect(cellChroma(1, 1, 1)).toBe(0)
    expect(cellChroma(0, 1, 0)).toBe(1)
    expect(cellChroma(1, 0, 0)).toBe(1)
  })

  it('does not depend on how bright the cell is', () => {
    // The same hue at two brightnesses is the same distance from grey, which
    // is what lets the gate ask about brightness and colour separately.
    expect(cellChroma(0.9, 0.45, 0.45)).toBeCloseTo(cellChroma(0.4, 0.2, 0.2), 6)
  })
})

describe('the ink budget: configuration', () => {
  it('is off for null, false, and a budget with nothing in it', () => {
    expect(normalizeInkBudget(null)).toBeNull()
    expect(normalizeInkBudget(false)).toBeNull()
    expect(normalizeInkBudget({ floor: 0, whiteLum: 0 })).toBeNull()
  })

  it('keeps a white gate with no floor, which is a real configuration', () => {
    // "Is the problem the ink or the white?" is answerable only if the two
    // halves can be turned on separately.
    const gateOnly = normalizeInkBudget({ floor: 0, whiteLum: 0.9 })
    expect(gateOnly).not.toBeNull()
    expect(gateOnly.floor).toBe(0)
    expect(gateOnly.whiteLum).toBe(0.9)
  })

  it('fills the defaults', () => {
    expect(normalizeInkBudget({})).toEqual(DEFAULT_INK_BUDGET)
    expect(normalizeInkBudget({ floor: -1 }).floor).toBe(DEFAULT_INK_BUDGET.floor)
  })

  it('has no floor, and keeps the white gate', () => {
    // The floor is zero. Measured at the Seattle spawn, standing, 30 %:
    //
    //   floor 0.5   3.1 % inked
    //   floor 0.3  28.5 % inked
    //   floor 0    88.4 % inked, white share 0.00 %   <- shipped
    //
    // A floor leaves the city's lights floating in black, and the darkness is
    // what a player notices. The two halves do different jobs, which is why
    // one can go: the white gate alone takes white from 61.8 % to 0.01 % and
    // changes nothing else, so the gate is what removes the flat white fields
    // that make colour mode unreadable, and the floor is what makes the city
    // dark. The gate stays.
    expect(CITY_PALETTE_INK_BUDGET.floor).toBe(0)
    expect(CITY_PALETTE_INK_BUDGET.whiteLum).toBe(0.9)
    // A floor of zero must not switch the whole budget off: the gate has to
    // survive it, and normalizeInkBudget only returns null when both are off.
    expect(normalizeInkBudget(CITY_PALETTE_INK_BUDGET)).toEqual({
      floor: 0,
      whiteLum: 0.9,
      whiteChroma: 0.12,
    })
    expect(normalizeInkBudget({ floor: 0, whiteLum: 0 })).toBeNull()
  })
})
