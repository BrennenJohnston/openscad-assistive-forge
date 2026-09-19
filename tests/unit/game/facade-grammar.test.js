import { describe, it, expect } from 'vitest'
import { Shape, Vector2, ExtrudeGeometry } from 'three'
import {
  BLANK_WALL_MIN_BAY_FRACTION,
  BLANK_WALL_MIN_ROW_M,
  FACADE_FAMILIES,
  FACADE_FAMILY_BY_TYPE,
  FACADE_FAMILY_DEFAULT,
  FACADE_LEVEL_M_DEFAULT,
  facadeCandidates,
  facadeFamilyFor,
  fitBays,
  fitRows,
  groupWallRuns,
} from '../../../src/js/game/facade-grammar.js'
import {
  WINDOW_ARCHETYPE_NAMES,
  fitFacadeUv,
} from '../../../src/js/game/city-scene.js'

/**
 * CW-73. A facade used to be `hash % 9` laid onto the wall in world metres.
 * These are the two halves of what replaced it: a TABLE that reads the map
 * data's building type, and a FIT that makes the grid land on the wall
 * instead of on the world.
 */

/**
 * Every distinct `building` value in the four shipped extracts, counted at
 * HEAD on 2026-08-29. This list is the reason the table can be called
 * exhaustive, and it is written out rather than derived so that a rebake
 * bringing a new value reddens this file instead of quietly taking the
 * default.
 */
const CENSUS = [
  'yes',
  'apartments',
  'commercial',
  'retail',
  'roof',
  'office',
  'house',
  'semidetached_house',
  'hotel',
  'detached',
  'terrace',
  'parking',
  'civic',
  'residential',
  'shed',
  'school',
  'hospital',
  'church',
  'garage',
  'service',
  'university',
  'transportation',
  'train_station',
  'hut',
  'carport',
  'warehouse',
  'bridge',
  'government',
  'industrial',
  'cathedral',
  'greenhouse',
  'fire_station',
  'construction',
  'no',
  'tower',
  'museum',
  'pavilion',
  'kiosk',
  'supermarket',
  'data_center',
  'prefabricated',
  'public',
  'college',
]

/** The three the table leaves out ON PURPOSE: they carry no claim. */
const CENSUS_UNMAPPED = ['yes', 'roof', 'no']

describe('the family table', () => {
  it('names only archetypes that exist', () => {
    for (const [family, spec] of Object.entries(FACADE_FAMILIES)) {
      for (const name of spec.archetypes) {
        expect(
          WINDOW_ARCHETYPE_NAMES,
          `${family} asks for a glazing kind that is not in the table: ${name}`
        ).toContain(name)
      }
    }
  })

  it('gives every family at least one archetype and a sane storey height', () => {
    for (const [family, spec] of Object.entries(FACADE_FAMILIES)) {
      expect(spec.archetypes.length, family).toBeGreaterThan(0)
      // A storey no shorter than a door and no taller than a church.
      expect(spec.levelM, family).toBeGreaterThanOrEqual(2.5)
      expect(spec.levelM, family).toBeLessThanOrEqual(6)
    }
  })

  it('★ is exhaustive over the census, and the default is ALL NINE', () => {
    for (const type of CENSUS) {
      const family = facadeFamilyFor(type)
      expect(FACADE_FAMILIES[family], `${type} -> ${family}`).toBeDefined()
      if (CENSUS_UNMAPPED.includes(type)) {
        expect(family, type).toBe(FACADE_FAMILY_DEFAULT)
      } else {
        expect(
          FACADE_FAMILY_BY_TYPE.has(type),
          `${type} is in the census and not in the table`
        ).toBe(true)
      }
    }
    // `building=yes` is the commonest value in three of the four cities. If
    // the default ever narrows, most of Albuquerque wears one face.
    expect(FACADE_FAMILIES[FACADE_FAMILY_DEFAULT].archetypes).toHaveLength(
      WINDOW_ARCHETYPE_NAMES.length
    )
  })

  it('every family the table points at is a real family', () => {
    for (const family of FACADE_FAMILY_BY_TYPE.values()) {
      expect(FACADE_FAMILIES[family], family).toBeDefined()
    }
  })

  it('falls to the default for junk, and is not case-sensitive', () => {
    expect(facadeFamilyFor(undefined)).toBe(FACADE_FAMILY_DEFAULT)
    expect(facadeFamilyFor(null)).toBe(FACADE_FAMILY_DEFAULT)
    expect(facadeFamilyFor('')).toBe(FACADE_FAMILY_DEFAULT)
    expect(facadeFamilyFor('greengrocers_lock_up')).toBe(FACADE_FAMILY_DEFAULT)
    expect(facadeFamilyFor(' Apartments ')).toBe('apartments')
  })

  it('tells an apartment block from an office block', () => {
    // The whole point of the release, stated as an assertion: the two
    // shortlists must not overlap, or the ASCII cannot separate them.
    const flats = FACADE_FAMILIES[facadeFamilyFor('apartments')].archetypes
    const offices = FACADE_FAMILIES[facadeFamilyFor('office')].archetypes
    expect(flats.filter((n) => offices.includes(n))).toEqual([])
  })
})

describe('facadeCandidates', () => {
  it('is the family when no material is mapped', () => {
    expect(facadeCandidates('church', null)).toEqual(['slot'])
    expect(facadeCandidates('church', [])).toEqual(['slot'])
  })

  it('intersects the two where they agree', () => {
    expect(facadeCandidates('office', ['band', 'narrow'])).toEqual(['band'])
  })

  it('★ lets the MATERIAL win where they do not', () => {
    // A glass-walled block of flats has a curtain wall whatever the flats
    // inside it are for.
    expect(facadeCandidates('apartments', ['stripes', 'band'])).toEqual([
      'stripes',
      'band',
    ])
  })

  it('never returns nothing to choose from', () => {
    expect(facadeCandidates('nonexistent', null).length).toBeGreaterThan(0)
  })
})

describe('fitRows', () => {
  it('★ leaves no partial row at the top', () => {
    // The oracle's own case: 23.5 m at a 3.2 m pitch.
    const fit = fitRows({ heightM: 23.5, levelM: 3.2 })
    expect(fit.rows).toBe(7)
    expect(fit.rows * fit.rowHeightM).toBeCloseTo(23.5, 9)
    // 23.5 / 3.2 is 7.34: the eighth row is the one that used to be cut.
    expect(fit.rowHeightM).toBeCloseTo(23.5 / 7, 9)
  })

  it('★ takes building:levels over the height, whatever the height', () => {
    for (const heightM of [12, 25, 60]) {
      expect(fitRows({ heightM, levels: 6, levelM: 3.2 }).rows).toBe(6)
    }
  })

  it('gives a reserved ground floor one of the tagged levels', () => {
    const fit = fitRows({ heightM: 25, baseM: 4, levels: 6 })
    expect(fit.rows).toBe(5)
    expect(fit.baseM).toBe(4)
    expect(fit.usableM).toBe(21)
    expect(fit.rows * fit.rowHeightM).toBeCloseTo(21, 9)
  })

  it('fits the rows into what the reservation leaves, not the whole wall', () => {
    const fit = fitRows({ heightM: 23.5, baseM: 3.5, levelM: 3.2 })
    expect(fit.rows).toBe(6)
    expect(fit.rowHeightM).toBeCloseTo(20 / 6, 9)
  })

  it('never fits fewer than one row, however short the wall', () => {
    expect(fitRows({ heightM: 2, levelM: 3.2 }).rows).toBe(1)
    expect(fitRows({ heightM: 2, levels: 0.4 }).rows).toBe(1)
  })

  it('★ REPORTS a wall too short for a storey, which nothing acts on', () => {
    // Found in the fit sample on real data: the Space Needle's thirteen parts
    // include 0.9 m and 1.2 m bands between volumes, each given a whole row of
    // windows squashed into it. Blanking them was measured on all four cities
    // and REFUSED - it costs a fifth of Denver's facade - so this flag is a
    // counted measurement, not a rule. See the constant's comment.
    expect(fitRows({ heightM: 0.95, levelM: 4.5 }).tooShort).toBe(true)
    expect(
      fitRows({ heightM: 167.9, baseM: 166.95, levelM: 4.5 }).tooShort
    ).toBe(true)
    // ...and an ordinary storey is not.
    expect(fitRows({ heightM: 23.5, levelM: 3.2 }).tooShort).toBe(false)
    // The threshold is an absolute height, the same for every family: a
    // stacked slab in Denver is not a spandrel just because its family
    // happens to assume tall storeys.
    const edge = BLANK_WALL_MIN_ROW_M
    expect(fitRows({ heightM: edge - 0.01, levelM: 3.2 }).tooShort).toBe(true)
    expect(fitRows({ heightM: edge + 0.01, levelM: 3.2 }).tooShort).toBe(false)
    expect(fitRows({ heightM: edge + 0.01, levelM: 6 }).tooShort).toBe(false)
    // A 2.4 m band is a low storey and keeps its windows.
    expect(fitRows({ heightM: 2.44, levelM: 4.5 }).tooShort).toBe(false)
  })

  it('refuses a wall the reservation has swallowed', () => {
    expect(fitRows({ heightM: 3, baseM: 3.5 })).toBeNull()
    expect(fitRows({ heightM: 0 })).toBeNull()
    expect(fitRows({ heightM: Number.NaN })).toBeNull()
  })

  it('falls back to the documented pitch for junk', () => {
    expect(fitRows({ heightM: 32, levelM: 0 }).rows).toBe(
      Math.floor(32 / FACADE_LEVEL_M_DEFAULT)
    )
  })
})

describe('fitBays', () => {
  it('★ cuts no bay at a corner: the bays share the wall exactly', () => {
    // The oracle's own case: 17.3 m at a 4 m pitch.
    const fit = fitBays({ widthM: 17.3, pitchM: 4 })
    expect(fit.bays).toBe(4)
    expect(fit.bayWidthM).toBeCloseTo(4.325, 9)
    expect(fit.bays * fit.bayWidthM).toBeCloseTo(17.3, 9)
  })

  it('rounds to the nearest whole bay, both ways', () => {
    expect(fitBays({ widthM: 15.4, pitchM: 4 }).bays).toBe(4)
    expect(fitBays({ widthM: 18.4, pitchM: 4 }).bays).toBe(5)
  })

  it('★ leaves a wall too narrow for one bay BLANK', () => {
    // A stretched bay on a 2 m return is a window wider than the wall.
    expect(fitBays({ widthM: 2, pitchM: 4 })).toEqual({
      bays: 0,
      bayWidthM: 0,
    })
    // ...and the threshold is where the constant says it is.
    const edge = 4 * BLANK_WALL_MIN_BAY_FRACTION
    expect(fitBays({ widthM: edge - 0.01, pitchM: 4 }).bays).toBe(0)
    expect(fitBays({ widthM: edge + 0.01, pitchM: 4 }).bays).toBe(1)
  })

  it('refuses junk rather than dividing by it', () => {
    expect(fitBays({ widthM: 10, pitchM: 0 }).bays).toBe(0)
    expect(fitBays({ widthM: Number.NaN, pitchM: 4 }).bays).toBe(0)
  })
})

describe('groupWallRuns', () => {
  const seg = (ax, ay, bx, by) => [
    [ax, ay],
    [bx, by],
  ]

  it('★ joins a straight wall the data happened to split', () => {
    const runs = groupWallRuns([seg(0, 0, 6, 0), seg(6, 0, 16, 0)])
    expect(runs).toHaveLength(1)
    expect(runs[0]).toEqual({ start: 0, count: 2, lengthM: 16 })
  })

  it('breaks at a corner', () => {
    const runs = groupWallRuns([seg(0, 0, 10, 0), seg(10, 0, 10, 6)])
    expect(runs).toHaveLength(2)
    expect(runs.map((r) => r.lengthM)).toEqual([10, 6])
  })

  it('breaks when the edges do not touch, so a hole is never welded on', () => {
    // The extruder emits the outer contour and then each hole; the last edge
    // of one and the first of the next share no endpoint.
    const runs = groupWallRuns([seg(0, 0, 10, 0), seg(40, 0, 50, 0)])
    expect(runs).toHaveLength(2)
  })

  it('tolerates a slight bend and refuses a sharp one', () => {
    const small = Math.tan((6 * Math.PI) / 180) * 10
    expect(groupWallRuns([seg(0, 0, 10, 0), seg(10, 0, 20, small)])).toHaveLength(
      1
    )
    const big = Math.tan((30 * Math.PI) / 180) * 10
    expect(groupWallRuns([seg(0, 0, 10, 0), seg(10, 0, 20, big)])).toHaveLength(
      2
    )
  })

  it('a zero-length edge ends the run rather than welding across it', () => {
    const runs = groupWallRuns([
      seg(0, 0, 10, 0),
      seg(10, 0, 10, 0),
      seg(10, 0, 20, 0),
    ])
    expect(runs).toHaveLength(2)
  })

  it('has nothing to say about nothing', () => {
    expect(groupWallRuns([])).toEqual([])
  })
})

/**
 * The mesh half. `fitFacadeUv` rewrites the side-wall UVs of an extruded
 * building; these read them back out of a geometry built the same way the
 * city builds one.
 */
describe('fitFacadeUv', () => {
  const rect = (w, h) =>
    new Shape([
      new Vector2(0, 0),
      new Vector2(w, 0),
      new Vector2(w, h),
      new Vector2(0, h),
    ])

  const extrude = (shape, depth) =>
    new ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 })

  const FIT = {
    bayWM: 4,
    bayHM: 3,
    bayPitchM: 4,
    rowHeightM: 4,
    baseM: 0,
    phaseU: 0,
    phaseV: 0,
  }

  /** The side group is the second one; the first is the caps. */
  const sideRange = (geom) => geom.groups.find((g) => g.materialIndex === 1)

  it('★ lands the top of the wall on a whole row', () => {
    const geom = extrude(rect(10, 6), 12)
    const out = fitFacadeUv(geom, FIT)
    expect(out.blank).toBe(0)
    expect(out.runs).toBe(4)

    const pos = geom.getAttribute('position')
    const uv = geom.getAttribute('uv')
    const side = sideRange(geom)
    let topSeen = 0
    for (let i = side.start; i < side.start + side.count; i++) {
      // The texture's own offset makes (1 - v) / bayHM the row number, so an
      // integer here IS "the wall finishes on a row boundary".
      const rowsBelow = (1 - uv.getY(i)) / FIT.bayHM
      expect(Number.isInteger(Math.round(rowsBelow * 1e6) / 1e6)).toBe(
        pos.getZ(i) === 0 || pos.getZ(i) === 12
      )
      if (pos.getZ(i) === 12) topSeen++
    }
    // 12 m of wall at 4 m rows is three rows exactly.
    expect((1 - uv.getY(side.start + 2)) / FIT.bayHM).toBeCloseTo(3, 9)
    expect(topSeen).toBe(12)
  })

  it('★ lands a wall of any width on a whole number of bays', () => {
    const geom = extrude(rect(10, 6), 12)
    fitFacadeUv(geom, FIT)
    const uv = geom.getAttribute('uv')
    const side = sideRange(geom)
    // Wall 1 is 10 m at a 4 m pitch: round(2.5) is 3 bays of 3.333 m, and
    // the u across it is exactly 3 bay widths of texture.
    const u0 = uv.getX(side.start)
    const u1 = uv.getX(side.start + 1)
    expect(u1 - u0).toBeCloseTo(3 * FIT.bayWM, 9)
    // Wall 2 is 6 m: round(1.5) is 2 bays.
    const v0 = uv.getX(side.start + 6)
    const v1 = uv.getX(side.start + 7)
    expect(v1 - v0).toBeCloseTo(2 * FIT.bayWM, 9)
  })

  it('★ fits a straight wall the data split at a node as ONE wall', () => {
    // The red proof for the run merging IN THE MESH. Breaking `groupWallRuns`
    // out of fitFacadeUv leaves every other case in this file green, because
    // a plain rectangle has no split wall in it to notice.
    const split = new Shape([
      new Vector2(0, 0),
      new Vector2(6, 0),
      new Vector2(10, 0),
      new Vector2(10, 6),
      new Vector2(0, 6),
    ])
    const geom = extrude(split, 12)
    const out = fitFacadeUv(geom, FIT)
    // Five edges, four walls.
    expect(out.runs).toBe(4)

    const uv = geom.getAttribute('uv')
    const side = sideRange(geom)
    const uAt = (chunk, k) => uv.getX(side.start + chunk * 6 + k)
    // The two halves of the bottom wall carry ONE bay layout: the second
    // starts where the first ends, and the pair spans a whole number of bays
    // across the 10 m the wall really is (round(10 / 4) = 3).
    expect(uAt(1, 0)).toBeCloseTo(uAt(0, 1), 9)
    expect(uAt(1, 1) - uAt(0, 0)).toBeCloseTo(3 * FIT.bayWM, 9)
    // Fitted per edge instead, the 6 m half alone would take two whole bays.
    expect(uAt(0, 1) - uAt(0, 0)).not.toBeCloseTo(2 * FIT.bayWM, 6)
  })

  it('★ pins a wall too narrow for a bay to the tile corner, and counts it', () => {
    // A 2 m return at a 4 m pitch: blank, not squeezed.
    const geom = extrude(rect(10, 2), 12)
    const out = fitFacadeUv(geom, FIT)
    expect(out.blank).toBe(2)
    const uv = geom.getAttribute('uv')
    const side = sideRange(geom)
    for (let k = 0; k < 6; k++) {
      expect(uv.getX(side.start + 6 + k)).toBe(0)
      expect(uv.getY(side.start + 6 + k)).toBe(1)
    }
  })

  it('starts the grid above a reserved ground floor', () => {
    const geom = extrude(rect(10, 6), 12)
    fitFacadeUv(geom, { ...FIT, baseM: 4, rowHeightM: 4 })
    const uv = geom.getAttribute('uv')
    const pos = geom.getAttribute('position')
    const side = sideRange(geom)
    for (let i = side.start; i < side.start + side.count; i++) {
      if (pos.getZ(i) !== 4) continue
      // Nothing is at z = 4 on this box, so the reservation is proved by the
      // ROW NUMBER at the base instead: z = 0 is one row BELOW the grid.
    }
    expect((1 - uv.getY(side.start)) / FIT.bayHM).toBeCloseTo(-1, 9)
    expect((1 - uv.getY(side.start + 2)) / FIT.bayHM).toBeCloseTo(2, 9)
  })

  it('moves the phase in whole bays and whole rows', () => {
    const plain = extrude(rect(10, 6), 12)
    fitFacadeUv(plain, FIT)
    const shifted = extrude(rect(10, 6), 12)
    fitFacadeUv(shifted, {
      ...FIT,
      phaseU: 3 * FIT.bayWM,
      phaseV: 5 * FIT.bayHM,
    })
    const a = plain.getAttribute('uv')
    const b = shifted.getAttribute('uv')
    const side = sideRange(plain)
    for (let i = side.start; i < side.start + side.count; i++) {
      expect((b.getX(i) - a.getX(i)) / FIT.bayWM).toBeCloseTo(3, 9)
      expect((b.getY(i) - a.getY(i)) / FIT.bayHM).toBeCloseTo(5, 9)
    }
  })

  it('leaves the cap faces alone', () => {
    const before = extrude(rect(10, 6), 12)
    const after = extrude(rect(10, 6), 12)
    fitFacadeUv(after, FIT)
    const caps = after.groups.find((g) => g.materialIndex === 0)
    const a = before.getAttribute('uv')
    const b = after.getAttribute('uv')
    for (let i = caps.start; i < caps.start + caps.count; i++) {
      expect(b.getX(i)).toBe(a.getX(i))
      expect(b.getY(i)).toBe(a.getY(i))
    }
  })

  it('says so rather than throwing when there are no side walls', () => {
    expect(fitFacadeUv({ groups: undefined }, FIT)).toBeNull()
  })
})
