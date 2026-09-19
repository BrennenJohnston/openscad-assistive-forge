import { describe, it, expect } from 'vitest'
import {
  CITY_TREES,
  CANOPY_FORMS,
  CANOPY_BASE_MIN_M,
  BRANCHES_PER_RING_MAX,
  CROWN_CLUSTER,
  CONIFER_WHORLS,
  CROWN_TONE,
  treeTableFor,
  pickSpecies,
  treeSpec,
  treeBranches,
  crownCluster,
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

describe('the crown cluster (CW-97 - the canopy research, adapted)', () => {
  const oak = CITY_TREES.seattle.find((s) => s.name === 'oak')
  const hawthorn = CITY_TREES.seattle.find((s) => s.name === 'hawthorn')
  const fir = CITY_TREES.burnaby.find((s) => s.name === 'Douglas-fir')

  it('is deterministic: one seed, one crown, every time', () => {
    const spec = treeSpec(oak, 0.5)
    expect(crownCluster(spec, 4242)).toEqual(crownCluster(spec, 4242))
    expect(JSON.stringify(crownCluster(spec, 4242))).not.toBe(
      JSON.stringify(crownCluster(spec, 2424))
    )
  })

  it('fills the envelope and never leaves it', () => {
    // The crown SHAPE is the species' own numbers: every box centre inside
    // the spec's ellipsoid (with the sink and jitter margin), z between the
    // crown's base and top. The envelope is cue four - a crown outline the
    // eye can name - and a box outside it is a defect, not variety.
    for (const [species, t] of [
      [oak, 0.5],
      [hawthorn, 0.25],
      [oak, 1],
    ]) {
      const spec = treeSpec(species, t)
      const hr = spec.radiusM
      const hz = spec.crownM / 2
      const cz = spec.baseM + hz
      for (const b of crownCluster(spec, 7)) {
        const rn = Math.sqrt(
          (b.x / hr) ** 2 + (b.y / hr) ** 2 + ((b.z - cz) / hz) ** 2
        )
        expect(rn, `${species.name} t=${t}`).toBeLessThanOrEqual(1.05)
        expect(b.z).toBeGreaterThanOrEqual(spec.baseM - 1e-9)
        expect(b.z).toBeLessThanOrEqual(spec.topM + 1e-9)
      }
    }
  })

  it('is a hollow shell with sparse interior fill, and real punctures', () => {
    // The brief's 70-80% shell / 20-30% interior, held by construction and
    // guarded here: interior boxes are a minority, shell boxes actually sit
    // OUT at the envelope (radial share above 1 - sink, with the latitude
    // jitter's margin), and the claimed area leaves sky: total box footprint
    // stays meaningfully under the envelope's surface, and meaningfully
    // above confetti.
    const spec = treeSpec(oak, 0.5)
    const boxes = crownCluster(spec, 99)
    const shell = boxes.filter((b) => !b.interior)
    const inner = boxes.filter((b) => b.interior)
    expect(inner.length / boxes.length).toBeGreaterThan(0.1)
    expect(inner.length / boxes.length).toBeLessThanOrEqual(0.35)

    const hr = spec.radiusM
    const hz = spec.crownM / 2
    const cz = spec.baseM + hz
    for (const b of shell) {
      const rn = Math.sqrt(
        (b.x / hr) ** 2 + (b.y / hr) ** 2 + ((b.z - cz) / hz) ** 2
      )
      expect(rn).toBeGreaterThan(1 - CROWN_CLUSTER.shellSinkShare - 0.12)
    }
    for (const b of inner) {
      const rn = Math.sqrt(
        (b.x / hr) ** 2 + (b.y / hr) ** 2 + ((b.z - cz) / hz) ** 2
      )
      expect(rn).toBeLessThanOrEqual(CROWN_CLUSTER.innerRadial[1] + 1e-9)
    }

    // Coverage arithmetic: punctures exist (under ~90% of the surface is
    // claimed) and the crown is a mass (over ~40%).
    const surface =
      4 *
      Math.PI *
      Math.pow(
        ((hr * hr) ** 1.6075 + 2 * (hr * hz) ** 1.6075) / 3,
        1 / 1.6075
      )
    const claimed = shell.reduce((a, b) => a + b.sizeM ** 2, 0)
    expect(claimed / surface).toBeGreaterThan(0.4)
    expect(claimed / surface).toBeLessThan(0.9)
  })

  it('puts the larger masses low and the raggedest edge on top', () => {
    // Pooled across seeds - the jitter is +/-35%, so one tree proves
    // nothing; the GRADIENT is the law (the brief: larger low, smaller
    // high, which is what makes the top edge the ragged one).
    const low = []
    const high = []
    for (let seed = 1; seed <= 60; seed++) {
      const spec = treeSpec(oak, ((seed % 20) + 0.5) / 20)
      for (const b of crownCluster(spec, seed)) {
        if (b.interior) continue
        if (b.heightFrac < 0.33) low.push(b.sizeM)
        if (b.heightFrac > 0.67) high.push(b.sizeM)
      }
    }
    const mean = (xs) => xs.reduce((a, x) => a + x, 0) / xs.length
    expect(low.length).toBeGreaterThan(100)
    expect(high.length).toBeGreaterThan(100)
    expect(mean(low)).toBeGreaterThan(mean(high) * 1.15)
  })

  it('rotates freely in yaw and only gently in tilt', () => {
    // Free yaw breaks the crate-stack read (every box the same three
    // faces); the tilt cap keeps a mass from becoming a thrown die. The
    // tone jitter stays inside the band the palette promised.
    const spec = treeSpec(oak, 0.5)
    const yawSpread = new Set()
    for (const b of crownCluster(spec, 5)) {
      expect(b.yawRad).toBeGreaterThanOrEqual(0)
      expect(b.yawRad).toBeLessThan(Math.PI)
      expect(Math.abs(b.tiltARad)).toBeLessThanOrEqual(
        Math.max(CROWN_CLUSTER.tiltMaxRad, CONIFER_WHORLS.droopRad) + 1e-9
      )
      expect(Math.abs(b.tiltBRad)).toBeLessThanOrEqual(
        Math.max(CROWN_CLUSTER.tiltMaxRad, CONIFER_WHORLS.droopRad) + 1e-9
      )
      expect(Math.abs(b.toneJitter)).toBeLessThanOrEqual(CROWN_TONE.jitter)
      yawSpread.add(Math.round(b.yawRad * 10))
    }
    expect(yawSpread.size).toBeGreaterThan(4)
  })

  it('builds a conifer as tapering whorls with a tip, not a ball', () => {
    // The brief is explicit that a conifer is stacked layers. Guarded as
    // geometry: the top quarter's widest box sits well inside the bottom
    // quarter's, the tiers span the whole crown, and one apex box stands
    // at the top so the tree ends in a point.
    const spec = treeSpec(fir, 0.75)
    const boxes = crownCluster(spec, 31)
    const span = spec.topM - spec.baseM
    const radius = (b) => Math.hypot(b.x, b.y)
    const bottom = boxes.filter((b) => b.z < spec.baseM + span * 0.25)
    const top = boxes.filter(
      (b) => b.z > spec.topM - span * 0.25 && radius(b) > 0
    )
    expect(bottom.length).toBeGreaterThan(3)
    expect(top.length).toBeGreaterThan(0)
    expect(Math.max(...top.map(radius))).toBeLessThan(
      Math.max(...bottom.map(radius)) * 0.5
    )
    const apex = boxes[boxes.length - 1]
    expect(apex.x).toBe(0)
    expect(apex.y).toBe(0)
    expect(apex.z).toBeGreaterThan(spec.topM - 2)
    // No interior fill in a whorl system - the trunk is the interior.
    expect(boxes.every((b) => !b.interior)).toBe(true)
  })

  it('keeps every crown a bounded merge', () => {
    // The budget end of the design: the biggest tree in the tables stays
    // under the shell cap plus its interior share, and the smallest is
    // still a cluster rather than three crates.
    for (const city of Object.keys(CITY_TREES)) {
      for (const s of CITY_TREES[city]) {
        for (const t of [0, 1]) {
          const n = crownCluster(treeSpec(s, t), 17).length
          expect(n, `${city} ${s.name} t=${t}`).toBeGreaterThanOrEqual(10)
          expect(n, `${city} ${s.name} t=${t}`).toBeLessThanOrEqual(
            Math.round(CROWN_CLUSTER.shellMax * (1 + CROWN_CLUSTER.innerShare)) +
              120
          )
        }
      }
    }
  })
})
