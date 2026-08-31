import { describe, it, expect } from 'vitest'
import {
  CITY_TREES,
  CANOPY_FORMS,
  CANOPY_BASE_MIN_M,
  BRANCHES_PER_RING_MAX,
  LEAF_CUBE_MIN_M,
  LEAF_CUBE_SHARE,
  LEAF_SPACING_SHARE,
  treeTableFor,
  pickSpecies,
  treeSpec,
  treeBranches,
  branchLeafCubes,
  trunkFlare,
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

describe("the ring-branch system (CW-94, CW-Q94 - the owner's own laws)", () => {
  const oak = CITY_TREES.seattle.find((s) => s.name === 'oak')
  const fir = CITY_TREES.burnaby.find((s) => s.name === 'Douglas-fir')

  it('stands trees at their FULL cited heights - the compression is retired', () => {
    // The squash halved the excess over 4 m; the ring system retires it.
    // An oak drawn at t=1 is the cited 25 m, not 14.5.
    expect(treeSpec(oak, 1).topM).toBe(25)
    expect(treeSpec(oak, 0).topM).toBe(15)
    expect(treeSpec(fir, 1).topM).toBe(30)
    // And the trunk is the leader: it runs the full height for the rings.
    expect(treeSpec(oak, 1).trunkHeightM).toBe(25)
  })

  it('never puts more than four branches on a ring, and uses its range', () => {
    let maxSeen = 0
    for (let seed = 1; seed <= 300; seed++) {
      const spec = treeSpec(oak, ((seed % 100) + 0.5) / 100)
      const byRing = new Map()
      for (const b of treeBranches(spec, seed)) {
        byRing.set(b.z0, (byRing.get(b.z0) ?? 0) + 1)
      }
      for (const [z0, n] of byRing) {
        expect(n, `seed ${seed} ring at ${z0}`).toBeLessThanOrEqual(
          BRANCHES_PER_RING_MAX
        )
        maxSeen = Math.max(maxSeen, n)
      }
    }
    // Non-vacuity: a cap nothing ever approaches guards nothing.
    expect(maxSeen).toBeGreaterThanOrEqual(3)
  })

  it('obeys the taper law: lower rings longer and thicker', () => {
    // Thickness carries no jitter, so it is strictly monotone in ringFrac;
    // length carries jitter, so the LAW is asserted on the envelope and on
    // the pooled means of the bottom versus top thirds.
    let low = []
    let high = []
    for (let seed = 1; seed <= 200; seed++) {
      const spec = treeSpec(oak, ((seed % 100) + 0.5) / 100)
      const branches = treeBranches(spec, seed)
      for (const b of branches) {
        for (const other of branches) {
          if (b.ringFrac < other.ringFrac - 1e-9) {
            expect(b.thickM).toBeGreaterThanOrEqual(other.thickM - 1e-9)
          }
        }
        if (b.ringFrac < 0.34) low.push(b.lengthM)
        if (b.ringFrac > 0.66) high.push(b.lengthM)
      }
    }
    const mean = (xs) => xs.reduce((a, x) => a + x, 0) / xs.length
    expect(low.length).toBeGreaterThan(50)
    expect(high.length).toBeGreaterThan(50)
    expect(mean(low)).toBeGreaterThan(mean(high) * 1.5)
  })

  it('wraps the outer run in cubes ~2x the member, with real gaps', () => {
    const spec = treeSpec(oak, 0.75)
    const [branch] = treeBranches(spec, 7)
    expect(branch).toBeDefined()
    const cubes = branchLeafCubes(branch)
    expect(cubes.length).toBeGreaterThan(1)
    const size = Math.max(LEAF_CUBE_MIN_M, branch.thickM * LEAF_CUBE_SHARE)
    for (const c of cubes) expect(c.sizeM).toBe(size)
    // The run ENVELOPS the branch (the owner's own words): successive cubes
    // overlap into one clump, so the step stays at or under the cube size.
    // The reference's sparseness lives BETWEEN runs, not inside one - the
    // bare inner share and the ring spacing carry the gaps. Photographed at
    // a 1.8-size step first, which read as winter buds on bare wood.
    for (let i = 1; i < cubes.length - 1; i++) {
      const step = cubes[i].alongM - cubes[i - 1].alongM
      expect(step).toBeGreaterThan(size * 0.5)
      expect(step).toBeLessThanOrEqual(size * 1.3)
    }
    // The tip always carries one - no branch ends in a bare spike.
    expect(cubes[cubes.length - 1].alongM).toBeGreaterThanOrEqual(
      branch.lengthM - size * LEAF_SPACING_SHARE * 0.5
    )
    // And the inner run stays bare (part budget, part head-height law).
    expect(cubes[0].alongM).toBeGreaterThanOrEqual(branch.lengthM * 0.3)
  })

  it('is deterministic: one seed, one tree, every time', () => {
    const spec = treeSpec(fir, 0.4)
    expect(treeBranches(spec, 12345)).toEqual(treeBranches(spec, 12345))
    // And a different seed is allowed to be a different tree.
    expect(JSON.stringify(treeBranches(spec, 12345))).not.toBe(
      JSON.stringify(treeBranches(spec, 54321))
    )
  })

  it('flares the base of big trees only', () => {
    expect(trunkFlare(treeSpec(oak, 1))).not.toBeNull()
    const hawthorn = CITY_TREES.seattle.find((s) => s.name === 'hawthorn')
    expect(trunkFlare(treeSpec(hawthorn, 0))).toBeNull()
    const flare = trunkFlare(treeSpec(oak, 1))
    expect(flare.sideM).toBeGreaterThan(treeSpec(oak, 1).trunkSideM)
  })
})
