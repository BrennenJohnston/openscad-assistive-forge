import { describe, it, expect } from 'vitest'
import {
  parseCityExtract,
  resolveCanopy,
  resolveMassing,
  taggedHeightM,
  isCanopyBuilding,
  CANOPY_THICKNESS_M,
  CANOPY_MIN_CLEAR_M,
  CANOPY_DEFAULT_BASE_M,
  PART_GROUND_MAX_M,
  SUPPORT_GAP_TOLERANCE_M,
} from '../../../src/js/game/city-data.js'
import {
  buildCollisionGrid,
  EYE_HEIGHT_M,
} from '../../../src/js/game/walk-controls.js'

const CENTER = { lat: 40, lon: -100 }
const COS_LAT = Math.cos((CENTER.lat * Math.PI) / 180)

function pt(xM, yM) {
  return {
    lat: CENTER.lat + yM / 110540,
    lon: CENTER.lon + xM / (111320 * COS_LAT),
  }
}

function squareRing(cx, cy, half) {
  return [
    pt(cx - half, cy - half),
    pt(cx + half, cy - half),
    pt(cx + half, cy + half),
    pt(cx - half, cy + half),
    pt(cx - half, cy - half),
  ]
}

function way(id, tags, cx, cy, half) {
  return { type: 'way', id, tags, geometry: squareRing(cx, cy, half) }
}

function extractOf(...elements) {
  return { elements }
}

/** The building this id parsed into. */
function byId(model, id) {
  return model.buildings.find((b) => b.id === id)
}

/** Every volume the scene would draw for a building, as [base, top]. */
function drawn(b) {
  const list = []
  if (b.partsAreMass) {
    if (b.podiumToM > 0) list.push([0, b.podiumToM])
  } else {
    list.push([b.minHeightM, b.heightM])
  }
  for (const p of b.parts ?? []) list.push([p.minHeightM, p.heightM])
  return list
}

describe('taggedHeightM', () => {
  it('reads height, building:height and levels, in that order', () => {
    expect(taggedHeightM({ height: '18' })).toBe(18)
    expect(taggedHeightM({ 'building:height': '12 m' })).toBe(12)
    expect(taggedHeightM({ 'building:levels': '3' })).toBe(9)
    expect(taggedHeightM({ height: '18', 'building:levels': '99' })).toBe(18)
  })

  it('returns null when nothing is tagged, where resolveBuildingHeight substitutes 8 m', () => {
    // THE WHOLE POINT of this helper. Two thirds of the roof ways in the four
    // shipped extracts carry no height at all, and resolveBuildingHeight
    // hands back the same 8 m it hands a tagged one.
    expect(taggedHeightM({ building: 'roof' })).toBeNull()
    expect(taggedHeightM({})).toBeNull()
  })
})

describe('isCanopyBuilding', () => {
  it('takes roof and bridge and nothing else', () => {
    expect(isCanopyBuilding({ building: 'roof' })).toBe(true)
    expect(isCanopyBuilding({ building: 'bridge' })).toBe(true)
    expect(isCanopyBuilding({ building: 'yes' })).toBe(false)
    expect(isCanopyBuilding({ 'building:part': 'roof' })).toBe(false)
    expect(isCanopyBuilding({})).toBe(false)
  })
})

describe('resolveCanopy', () => {
  it('keeps the mapper own min_height and height: the Convention Center Arch', () => {
    const c = resolveCanopy({ building: 'roof', height: '18', min_height: '10' })
    expect(c.baseM).toBe(10)
    expect(c.topM).toBe(18)
    expect(c.source).toBe('min_height')
  })

  it('sits on the building it covers when no min_height is tagged', () => {
    const c = resolveCanopy({ building: 'roof' }, 8)
    expect(c.baseM).toBe(8)
    expect(c.topM).toBeCloseTo(8 + CANOPY_THICKNESS_M, 6)
    expect(c.source).toBe('covered')
  })

  it('reads a tagged height as the SURFACE, so the slab hangs under it', () => {
    const c = resolveCanopy({ building: 'roof', 'building:levels': '1' })
    expect(c.topM).toBe(3)
    expect(c.baseM).toBeCloseTo(3 - CANOPY_THICKNESS_M, 6)
    expect(c.source).toBe('height')
  })

  it('falls back to the shelter default with nothing tagged and nothing under it', () => {
    const c = resolveCanopy({ building: 'roof' })
    expect(c.baseM).toBe(CANOPY_DEFAULT_BASE_M)
    expect(c.topM).toBeCloseTo(CANOPY_DEFAULT_BASE_M + CANOPY_THICKNESS_M, 6)
    expect(c.source).toBe('default')
  })

  it('never puts a slab below walking clearance', () => {
    // A canopy tagged 1 m tall is a wall across the pavement if it is
    // believed, and the collision grid would start blocking it.
    const c = resolveCanopy({ building: 'roof', height: '1' })
    expect(c.baseM).toBe(CANOPY_MIN_CLEAR_M)
    expect(c.topM).toBeCloseTo(CANOPY_MIN_CLEAR_M + CANOPY_THICKNESS_M, 6)
  })

  it('clears the collision grid head height with room to spare', () => {
    // CROSS-FILE: the clearance lives in city-data and the rule that lets a
    // walker under it lives in walk-controls. Nothing else ties them
    // together, so this does.
    expect(CANOPY_MIN_CLEAR_M).toBeGreaterThan(EYE_HEIGHT_M + 0.3)
  })
})

describe('resolveMassing - canopies', () => {
  it('turns a roof way from a solid into a slab', () => {
    const model = parseCityExtract(
      extractOf(way(1, { building: 'roof' }, 0, 0, 10)),
      { center: CENTER }
    )
    const roof = byId(model, 1)
    expect(roof.canopy).toBeTruthy()
    expect(roof.minHeightM).toBe(CANOPY_DEFAULT_BASE_M)
    expect(roof.heightM - roof.minHeightM).toBeCloseTo(CANOPY_THICKNESS_M, 6)
    expect(model.stats.canopyCount).toBe(1)
    expect(model.stats.floatingMass).toBe(0)
  })

  it('the Arch keeps the 10 to 18 m volume its mapper described', () => {
    const model = parseCityExtract(
      extractOf(
        way(
          169510052,
          { building: 'roof', height: '18', min_height: '10', name: 'Arch' },
          0,
          0,
          12
        )
      ),
      { center: CENTER }
    )
    const arch = byId(model, 169510052)
    expect(arch.minHeightM).toBe(10)
    expect(arch.heightM).toBe(18)
    expect(arch.canopy.source).toBe('min_height')
  })

  it('a roof over a building of height 8 sits at 8 m', () => {
    const model = parseCityExtract(
      extractOf(
        way(10, { building: 'yes', height: '8' }, 0, 0, 30),
        way(11, { building: 'roof' }, 0, 0, 10)
      ),
      { center: CENTER }
    )
    const roof = byId(model, 11)
    expect(roof.minHeightM).toBe(8)
    expect(roof.canopy.source).toBe('covered')
    expect(model.stats.canopyCovered).toBe(1)
  })

  it('takes the TALLEST outline it stands inside, not the first', () => {
    const model = parseCityExtract(
      extractOf(
        way(20, { building: 'yes', height: '6' }, 0, 0, 30),
        way(21, { building: 'yes', height: '20' }, 0, 0, 25),
        way(22, { building: 'roof' }, 0, 0, 8)
      ),
      { center: CENTER }
    )
    expect(byId(model, 22).minHeightM).toBe(20)
  })

  it('drops a pitched roof from a canopy, which is 0.3 m of body', () => {
    // resolveRoof was answered against an 8 m body and would cap a slab with
    // a 1.5 m pyramid.
    const model = parseCityExtract(
      extractOf(way(30, { building: 'roof', 'roof:shape': 'pyramidal' }, 0, 0, 10)),
      { center: CENTER }
    )
    expect(byId(model, 30).roof).toBeNull()
  })

  it('lets a walker under a canopy that used to block the pavement', () => {
    const model = parseCityExtract(
      extractOf(way(40, { building: 'roof' }, 0, 0, 10)),
      { center: CENTER }
    )
    const grid = buildCollisionGrid(model)
    expect(grid.isBlocked(0, 0)).toBe(false)
  })

  it('still blocks an ordinary building on the same footprint', () => {
    const model = parseCityExtract(
      extractOf(way(41, { building: 'yes' }, 0, 0, 10)),
      { center: CENTER }
    )
    expect(buildCollisionGrid(model).isBlocked(0, 0)).toBe(true)
  })
})

describe('resolveMassing - the podium under floating parts', () => {
  const metPark = () =>
    parseCityExtract(
      extractOf(
        way(100, { building: 'yes', height: '120', name: 'West Tower' }, 0, 0, 30),
        {
          type: 'way',
          id: 101,
          tags: { 'building:part': 'yes', height: '80', min_height: '45' },
          geometry: squareRing(0, 0, 29),
        }
      ),
      { center: CENTER }
    )

  it('draws the outline from the pavement to the lowest part', () => {
    const b = byId(metPark(), 100)
    expect(b.partsAreMass).toBe(true)
    expect(b.podiumToM).toBe(45)
    expect(drawn(b)).toEqual([
      [0, 45],
      [45, 80],
    ])
  })

  it('counts the podium, and leaves nothing floating', () => {
    const model = metPark()
    expect(model.stats.podiumCount).toBe(1)
    expect(model.stats.floatingMass).toBe(0)
  })

  it('leaves parts-as-mass alone when one part reaches the ground', () => {
    const model = parseCityExtract(
      extractOf(
        way(110, { building: 'yes', height: '120' }, 0, 0, 30),
        {
          type: 'way',
          id: 111,
          tags: { 'building:part': 'yes', height: '40' },
          geometry: squareRing(0, 0, 20),
        },
        {
          type: 'way',
          id: 112,
          tags: { 'building:part': 'yes', height: '120', min_height: '40' },
          geometry: squareRing(0, 0, 18),
        }
      ),
      { center: CENTER }
    )
    const b = byId(model, 110)
    expect(b.partsAreMass).toBe(true)
    expect(b.podiumToM).toBe(0)
    expect(drawn(b)).toEqual([
      [0, 40],
      [40, 120],
    ])
    expect(model.stats.podiumCount).toBe(0)
  })
})

describe('resolveMassing - the empty column', () => {
  it('draws a lone floating volume down to the pavement', () => {
    const model = parseCityExtract(
      extractOf(way(200, { building: 'yes', height: '20', min_height: '6' }, 0, 0, 15)),
      { center: CENTER }
    )
    expect(byId(model, 200).minHeightM).toBe(0)
    expect(model.stats.groundedToZero).toBe(1)
    expect(model.stats.floatingMass).toBe(0)
  })

  it('CLOSES THE GAP rather than doubling what is already there', () => {
    // An 8 m podium with a slab starting at 14 m: the slab grows by 6 m, it
    // does not sprout a second copy of the podium.
    const model = parseCityExtract(
      extractOf(
        way(210, { building: 'yes', height: '8' }, 0, 0, 30),
        way(211, { building: 'yes', height: '30', min_height: '14' }, 0, 0, 20)
      ),
      { center: CENTER }
    )
    expect(byId(model, 211).minHeightM).toBe(8)
    expect(byId(model, 210).heightM).toBe(8)
    expect(model.stats.groundedVolumes).toBe(1)
    expect(model.stats.groundedToZero).toBe(0)
  })

  it('leaves a volume alone when the gap under it is within tolerance', () => {
    const model = parseCityExtract(
      extractOf(
        way(220, { building: 'yes', height: '8' }, 0, 0, 30),
        way(221, { building: 'yes', height: '30', min_height: '9' }, 0, 0, 20)
      ),
      { center: CENTER }
    )
    expect(9 - 8).toBeLessThanOrEqual(SUPPORT_GAP_TOLERANCE_M)
    expect(byId(model, 221).minHeightM).toBe(9)
    expect(model.stats.groundedVolumes).toBe(0)
  })

  it('reads a STACK of orphan parts as one building standing on the street', () => {
    // Seattle's extract carries a stack running 8.2 -> 9.8 -> 15.8 -> 121.9 m
    // at one footprint, its outline outside the radius. A per-way test calls
    // every slice above the first floating; nothing here is.
    const model = parseCityExtract(
      extractOf(
        {
          type: 'way',
          id: 300,
          tags: { 'building:part': 'yes', height: '8' },
          geometry: squareRing(0, 0, 20),
        },
        {
          type: 'way',
          id: 301,
          tags: { 'building:part': 'yes', height: '16', min_height: '8' },
          geometry: squareRing(0, 0, 18),
        },
        {
          type: 'way',
          id: 302,
          tags: { 'building:part': 'yes', height: '120', min_height: '16' },
          geometry: squareRing(0, 0, 15),
        }
      ),
      { center: CENTER }
    )
    expect(model.stats.orphanParts).toBe(3)
    expect(model.stats.groundedVolumes).toBe(0)
    expect(model.stats.floatingMass).toBe(0)
    expect(model.buildings.map((b) => b.minHeightM).sort((a, z) => a - z)).toEqual([
      0, 8, 16,
    ])
  })

  it('fixes a stack BOTTOM UP, so four slabs become one building', () => {
    // Denver has four thin slabs at one footprint, 19 -> 19.5 -> 20 -> 20.5,
    // with nothing under any of them. Top-down would draw four nested boxes.
    const model = parseCityExtract(
      extractOf(
        way(400, { building: 'yes', height: '19.5', min_height: '19' }, 0, 0, 30),
        way(401, { building: 'yes', height: '20', min_height: '19.5' }, 0, 0, 28),
        way(402, { building: 'yes', height: '20.5', min_height: '20' }, 0, 0, 26),
        way(403, { building: 'yes', height: '21', min_height: '20.5' }, 0, 0, 24)
      ),
      { center: CENTER }
    )
    expect(byId(model, 400).minHeightM).toBe(0)
    expect(byId(model, 401).minHeightM).toBe(19.5)
    expect(byId(model, 402).minHeightM).toBe(20)
    expect(byId(model, 403).minHeightM).toBe(20.5)
    expect(model.stats.groundedVolumes).toBe(1)
    expect(model.stats.floatingMass).toBe(0)
  })

  it('never grounds a canopy: hanging is what a canopy is for', () => {
    const model = parseCityExtract(
      extractOf(way(500, { building: 'roof' }, 0, 0, 10)),
      { center: CENTER }
    )
    expect(byId(model, 500).minHeightM).toBe(CANOPY_DEFAULT_BASE_M)
    expect(model.stats.groundedVolumes).toBe(0)
  })

  it('is a no-op on a city with nothing floating in it', () => {
    const out = resolveMassing([])
    expect(out).toMatchObject({ canopies: 0, podiums: 0, floatingMass: 0 })
    expect(PART_GROUND_MAX_M).toBe(0.5)
  })
})

describe('★★★ CW-90 (D-126): nothing hovers, and every gap is closed', () => {
  // The owner photographed a building with a floating half hanging above its
  // lower half. CW-76 already grounded floaters and could not see this one:
  // it asked only about each building's LOWEST volume, and a part sitting
  // above a lower part is not the lowest thing its building draws, so the
  // pass walked straight past it. CW-Q89 answered "close every gap".

  it('★★★ a part hovering above a LOWER part is brought down to meet it', () => {
    // The owner's picture, as a fixture: an outline 0-10 m with a part that
    // starts at 25 m. Nothing else is anywhere near, so the only thing that
    // could hold the part up is the building's own lower mass, 15 m below.
    //
    // RED PROOF (run by hand, CW-90): narrow the floaters loop back to each
    // building's lowest volume and this case leaves the part at 25 m. Over the
    // four shipped extracts the same revert leaves 65 volumes hanging
    // (Seattle 34, Denver 28, Albuquerque 1, Burnaby 2) where CW-90 leaves 0.
    const model = parseCityExtract(
      extractOf(
        way(1, { building: 'yes', height: '10' }, 0, 0, 12),
        {
          type: 'way',
          id: 2,
          tags: { 'building:part': 'yes', height: '40', min_height: '25' },
          geometry: squareRing(0, 0, 4),
        }
      ),
      { center: CENTER }
    )
    expect(model.stats.floatingMass).toBe(0)
    // And the fixture really did contain a part - a model with none would
    // report zero floating masses while proving nothing at all.
    const volumes = model.buildings.flatMap((b) => drawn(b))
    expect(volumes.length).toBeGreaterThan(1)
    // The part now starts where the mass below it ends, not 15 m above it.
    const high = volumes.filter(([base]) => base > PART_GROUND_MAX_M)
    for (const [base] of high) {
      expect(base, `a volume still starts at ${base} m with nothing under it`)
        .toBeLessThanOrEqual(10 + SUPPORT_GAP_TOLERANCE_M)
    }
  })

  it('★★ leaves a part that ALREADY sits on something exactly where it is', () => {
    // The guard against over-correcting. A part starting at 10 m on top of a
    // 10 m mass is supported, and CW-90 must not drag it to the ground - that
    // would be the "drop it" option the owner did not choose.
    const model = parseCityExtract(
      extractOf(
        way(1, { building: 'yes', height: '10' }, 0, 0, 12),
        {
          type: 'way',
          id: 2,
          tags: { 'building:part': 'yes', height: '40', min_height: '10' },
          geometry: squareRing(0, 0, 4),
        }
      ),
      { center: CENTER }
    )
    expect(model.stats.floatingMass).toBe(0)
    const bases = model.buildings
      .flatMap((b) => drawn(b))
      .map(([base]) => base)
      .sort((a, z) => a - z)
    // One volume on the ground, one starting at 10 m and staying there.
    expect(bases.some((b) => Math.abs(b - 10) < 0.001)).toBe(true)
  })
})
