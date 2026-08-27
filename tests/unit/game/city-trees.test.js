import { describe, it, expect } from 'vitest'
import {
  CITY_TREES,
  CANOPY_FORMS,
  CANOPY_BASE_MIN_M,
  treeTableFor,
  pickSpecies,
  treeSpec,
  makeCanopyGeoms,
} from '../../../src/js/game/city-trees.js'

/**
 * CW-56 (CW-Q55): each city's own street trees.
 *
 * The tables are cited design data and are the owner's to veto row by row, so
 * what is guarded here is not WHICH species - that is an argument, not a bug -
 * but that the tables are well formed, that the forms they name exist, that
 * the crown obeys the law a walker depends on, and that the map's own
 * leaf_type actually steers the choice rather than decorating it.
 */
describe('per-city tree species and forms (CW-56)', () => {
  const CITIES = Object.keys(CITY_TREES)

  it('gives every city five well-formed rows naming forms that exist', () => {
    expect(CITIES.sort()).toEqual([
      'albuquerque',
      'burnaby',
      'denver',
      'seattle',
    ])
    for (const city of CITIES) {
      const table = CITY_TREES[city]
      expect(table, city).toHaveLength(5)
      for (const s of table) {
        expect(typeof s.name, `${city} ${s.name}`).toBe('string')
        expect(CANOPY_FORMS[s.form], `${city} ${s.name} form`).toBeDefined()
        expect(s.h[1], `${city} ${s.name} range`).toBeGreaterThan(s.h[0])
        // A street tree, not a bonsai and not a redwood.
        expect(s.h[0]).toBeGreaterThanOrEqual(5)
        expect(s.h[1]).toBeLessThanOrEqual(30)
        expect(typeof s.deciduous).toBe('boolean')
      }
    }
  })

  it('lets the desert city wear its own trees', () => {
    // The whole argument for per-city tables: Albuquerque is the control, and
    // a control that wears Seattle's maples is not controlling for anything.
    // Not one species name is shared between the two.
    const seattle = new Set(CITY_TREES.seattle.map((s) => s.name))
    const abq = CITY_TREES.albuquerque.map((s) => s.name)
    expect(abq.filter((n) => seattle.has(n))).toEqual([])
    // And the two PNW-adjacent cities are the ones with conifers.
    const conifers = (city) =>
      CITY_TREES[city].filter((s) => !s.deciduous).length
    expect(conifers('burnaby')).toBe(2)
    expect(conifers('albuquerque')).toBe(1)
    expect(conifers('seattle')).toBe(0)
    expect(conifers('denver')).toBe(0)
  })

  it('never starts a crown below the height a walker walks at', () => {
    // CW-16's law, and the reason a conifer does not skirt to the ground
    // here: a crown at head height is a wall the collision grid knows
    // nothing about. Checked at BOTH ends of every species' range, because
    // baseShare is a fraction and the short end is where it bites.
    for (const city of CITIES) {
      for (const s of CITY_TREES[city]) {
        for (const t of [0, 0.5, 1]) {
          const spec = treeSpec(s, t)
          expect(
            spec.baseM,
            `${city} ${s.name} at t=${t}`
          ).toBeGreaterThanOrEqual(CANOPY_BASE_MIN_M)
          expect(spec.topM).toBeGreaterThan(spec.baseM)
          expect(spec.radiusM).toBeGreaterThan(0)
          expect(spec.trunkHeightM).toBeGreaterThan(spec.baseM)
        }
      }
    }
  })

  it('is the same tree every time, and different trees at different draws', () => {
    const s = CITY_TREES.seattle[1]
    expect(treeSpec(s, 0.25)).toEqual(treeSpec(s, 0.25))
    expect(treeSpec(s, 0.25).topM).not.toBe(treeSpec(s, 0.75).topM)
    // t is clamped rather than wrapped, so a caller that hands over 1.4 gets
    // the tallest tree in the range and not the shortest.
    expect(treeSpec(s, 1.4).topM).toBe(treeSpec(s, 1).topM)
    expect(treeSpec(s, -3).topM).toBe(treeSpec(s, 0).topM)
  })

  it('lets the MAP decide the leaf, and the table decide the species', () => {
    const bby = treeTableFor('burnaby')
    // Burnaby names two conifers, so a needleleaved tree there gets one of
    // its own.
    for (let draw = 0; draw < 12; draw++) {
      const s = pickSpecies(bby, draw, 'needleleaved')
      expect(s.deciduous, `draw ${draw}`).toBe(false)
      expect(['western redcedar', 'Douglas-fir']).toContain(s.name)
    }
    for (let draw = 0; draw < 12; draw++) {
      expect(pickSpecies(bby, draw, 'broadleaved').deciduous).toBe(true)
    }

    // ★ Seattle's extract carries 34 needleleaved trees and its published
    // composition names no conifer. Those are real, mapped conifers, and
    // before this they would have been drawn as maples. The map is telling
    // us a FORM; the table is telling us which species the city PLANTS.
    // So the form wins and the name is left blank rather than invented.
    const sea = treeTableFor('seattle')
    const fallback = pickSpecies(sea, 7, 'needleleaved')
    expect(fallback.deciduous).toBe(false)
    expect(fallback.form).toBe('cone')
    expect(fallback.name).toBe('conifer')

    // With no leaf_type at all - which is EVERY tree in Albuquerque - the
    // hash draws from the whole table.
    const abq = treeTableFor('albuquerque')
    const drawn = new Set()
    for (let draw = 0; draw < 40; draw++) {
      drawn.add(pickSpecies(abq, draw, undefined).name)
    }
    expect(drawn.size).toBe(5)
  })

  it('falls back to a table rather than to nothing', () => {
    expect(treeTableFor('atlantis')).toBe(CITY_TREES.seattle)
  })

  it('stacks a cone and does not stack anything else', () => {
    const flat = treeSpec(CITY_TREES.seattle[1], 0.5) // maple, round
    const cone = treeSpec(CITY_TREES.burnaby[4], 0.5) // Douglas-fir
    expect(flat.stacks).toBe(1)
    expect(cone.stacks).toBe(3)
    expect(makeCanopyGeoms(0, 0, flat)).toHaveLength(1)
    expect(makeCanopyGeoms(0, 0, cone)).toHaveLength(3)

    // A cone is the only form that costs more than the one crown the game
    // drew before, and this is what says by how much: three crowns, not a
    // subdivided mesh. 20 triangles becomes 60.
    const tris = (geoms) =>
      geoms.reduce((n, g) => n + g.getAttribute('position').count / 3, 0)
    expect(tris(makeCanopyGeoms(0, 0, flat))).toBe(20)
    expect(tris(makeCanopyGeoms(0, 0, cone))).toBe(60)
  })

  it('builds the crown where the spec says, and above the walker', () => {
    for (const city of CITIES) {
      for (const s of CITY_TREES[city]) {
        const spec = treeSpec(s, 0.5)
        const geoms = makeCanopyGeoms(10, -4, spec)
        let minZ = Infinity
        let maxZ = -Infinity
        for (const g of geoms) {
          const a = g.getAttribute('position').array
          for (let i = 2; i < a.length; i += 3) {
            minZ = Math.min(minZ, a[i])
            maxZ = Math.max(maxZ, a[i])
          }
        }
        // Eye height is 1.7 m; nothing leafy may hang into it.
        expect(minZ, `${city} ${s.name} crown bottom`).toBeGreaterThan(1.7)
        expect(maxZ, `${city} ${s.name} crown top`).toBeGreaterThan(spec.baseM)
      }
    }
  })
})
