import { describe, it, expect } from 'vitest'
import {
  parseCityExtract,
  projectLatLon,
  resolveBuildingHeight,
  signedArea,
  trimOverpassElement,
  LEVEL_HEIGHT_M,
  DEFAULT_BUILDING_HEIGHT_M,
  ROAD_WIDTHS_M,
  SIDEWALK_WIDTH_M,
  GREEN_LEISURE_VALUES,
  GREEN_LANDUSE_VALUES,
  isGreenTags,
  ringAreaM2,
  MIN_PART_AREA_M2,
} from '../../../src/js/game/city-data.js'

const CENTER = { lat: 40, lon: -100 }
const COS_LAT = Math.cos((CENTER.lat * Math.PI) / 180)

/** Build a lat/lon point from meter offsets around CENTER. */
function pt(xM, yM) {
  return {
    lat: CENTER.lat + yM / 110540,
    lon: CENTER.lon + xM / (111320 * COS_LAT),
  }
}

/** Closed square ring (first point repeated last), CCW in meters. */
function squareRing(cx, cy, half) {
  return [
    pt(cx - half, cy - half),
    pt(cx + half, cy - half),
    pt(cx + half, cy + half),
    pt(cx - half, cy + half),
    pt(cx - half, cy - half),
  ]
}

function extractOf(...elements) {
  return { elements }
}

describe('projectLatLon', () => {
  it('maps the center to the origin', () => {
    const [x, y] = projectLatLon(CENTER.lat, CENTER.lon, CENTER)
    expect(x).toBe(0)
    expect(y).toBe(0)
  })

  it('round-trips meter offsets within a centimeter', () => {
    const p = pt(250, -80)
    const [x, y] = projectLatLon(p.lat, p.lon, CENTER)
    expect(x).toBeCloseTo(250, 2)
    expect(y).toBeCloseTo(-80, 2)
  })
})

describe('resolveBuildingHeight', () => {
  it('prefers the height tag, in several spellings', () => {
    expect(resolveBuildingHeight({ height: '10' }).heightM).toBe(10)
    expect(resolveBuildingHeight({ height: '12.5' }).heightM).toBe(12.5)
    expect(resolveBuildingHeight({ height: '12,5' }).heightM).toBe(12.5)
    expect(resolveBuildingHeight({ height: '12 m' }).heightM).toBe(12)
    expect(resolveBuildingHeight({ height: '30 ft' }).heightM).toBeCloseTo(
      9.144,
      3
    )
    expect(resolveBuildingHeight({ height: "40'" }).heightM).toBeCloseTo(
      12.192,
      3
    )
    expect(resolveBuildingHeight({ 'building:height': '15' }).heightM).toBe(15)
  })

  it('falls back to building:levels x 3 m', () => {
    expect(resolveBuildingHeight({ 'building:levels': '2' }).heightM).toBe(
      2 * LEVEL_HEIGHT_M
    )
    expect(resolveBuildingHeight({ 'building:levels': '2.5' }).heightM).toBe(
      2.5 * LEVEL_HEIGHT_M
    )
  })

  it('falls back to the default for untagged or unparseable buildings', () => {
    expect(resolveBuildingHeight({}).heightM).toBe(DEFAULT_BUILDING_HEIGHT_M)
    expect(resolveBuildingHeight({ height: 'tall' }).heightM).toBe(
      DEFAULT_BUILDING_HEIGHT_M
    )
    expect(
      resolveBuildingHeight({ height: 'tall', 'building:levels': '4' }).heightM
    ).toBe(4 * LEVEL_HEIGHT_M)
  })

  it('caps absurd heights', () => {
    expect(resolveBuildingHeight({ height: '9999' }).heightM).toBe(700)
  })

  it('resolves min_height and keeps volume when height <= min_height', () => {
    const a = resolveBuildingHeight({ height: '10', min_height: '3' })
    expect(a.heightM).toBe(10)
    expect(a.minHeightM).toBe(3)

    const b = resolveBuildingHeight({ 'building:min_level': '2' })
    expect(b.minHeightM).toBe(2 * LEVEL_HEIGHT_M)

    const c = resolveBuildingHeight({ height: '2', min_height: '5' })
    expect(c.heightM).toBe(5.5)
    expect(c.minHeightM).toBe(5)
  })
})

describe('parseCityExtract — buildings from ways', () => {
  it('parses a closed way into a CCW footprint with the duplicate point dropped', () => {
    const model = parseCityExtract(
      extractOf({
        type: 'way',
        id: 1,
        tags: { building: 'yes', height: '20', name: 'Test Tower' },
        geometry: squareRing(0, 0, 5),
      }),
      { center: CENTER }
    )

    expect(model.stats.buildingCount).toBe(1)
    const b = model.buildings[0]
    expect(b.outer).toHaveLength(4)
    expect(signedArea(b.outer)).toBeGreaterThan(0)
    expect(Math.abs(signedArea(b.outer))).toBeCloseTo(100, 0)
    expect(b.heightM).toBe(20)
    expect(b.name).toBe('Test Tower')
  })

  it('normalizes clockwise input rings to CCW', () => {
    const cw = squareRing(0, 0, 5).slice().reverse()
    const model = parseCityExtract(
      extractOf({
        type: 'way',
        id: 1,
        tags: { building: 'yes' },
        geometry: cw,
      }),
      { center: CENTER }
    )
    expect(signedArea(model.buildings[0].outer)).toBeGreaterThan(0)
  })

  it('ignores building=no and drops degenerate footprints', () => {
    const model = parseCityExtract(
      extractOf(
        {
          type: 'way',
          id: 1,
          tags: { building: 'no' },
          geometry: squareRing(0, 0, 5),
        },
        {
          type: 'way',
          id: 2,
          tags: { building: 'yes' },
          geometry: [pt(0, 0), pt(10, 0), pt(20, 0)], // collinear, ~zero area
        }
      ),
      { center: CENTER }
    )
    expect(model.stats.buildingCount).toBe(0)
    expect(model.stats.droppedElements).toBe(1)
  })
})

describe('parseCityExtract — multipolygon relations', () => {
  it('parses an outer ring with a courtyard hole, winding normalized', () => {
    const model = parseCityExtract(
      extractOf({
        type: 'relation',
        id: 10,
        tags: { building: 'yes', 'building:levels': '4' },
        members: [
          {
            type: 'way',
            ref: 11,
            role: 'outer',
            geometry: squareRing(0, 0, 10),
          },
          {
            type: 'way',
            ref: 12,
            role: 'inner',
            geometry: squareRing(0, 0, 3),
          },
        ],
      }),
      { center: CENTER }
    )

    expect(model.stats.buildingCount).toBe(1)
    const b = model.buildings[0]
    expect(b.holes).toHaveLength(1)
    expect(signedArea(b.outer)).toBeGreaterThan(0)
    expect(signedArea(b.holes[0])).toBeLessThan(0)
    expect(b.heightM).toBe(4 * LEVEL_HEIGHT_M)
  })

  it('stitches an outer ring split across two member ways', () => {
    const full = squareRing(0, 0, 10)
    // Open halves: [p0..p2] and [p2..p4(=p0)]
    const halfA = full.slice(0, 3)
    const halfB = full.slice(2, 5)
    const model = parseCityExtract(
      extractOf({
        type: 'relation',
        id: 20,
        tags: { building: 'yes' },
        members: [
          { type: 'way', ref: 21, role: 'outer', geometry: halfA },
          { type: 'way', ref: 22, role: 'outer', geometry: halfB },
        ],
      }),
      { center: CENTER }
    )

    expect(model.stats.buildingCount).toBe(1)
    expect(model.buildings[0].outer).toHaveLength(4)
    expect(Math.abs(signedArea(model.buildings[0].outer))).toBeCloseTo(400, 0)
  })

  it('stitches members that connect in reversed orientation', () => {
    const full = squareRing(0, 0, 10)
    const halfA = full.slice(0, 3)
    const halfB = full.slice(2, 5).slice().reverse()
    const model = parseCityExtract(
      extractOf({
        type: 'relation',
        id: 25,
        tags: { building: 'yes' },
        members: [
          { type: 'way', ref: 26, role: 'outer', geometry: halfA },
          { type: 'way', ref: 27, role: 'outer', geometry: halfB },
        ],
      }),
      { center: CENTER }
    )
    expect(model.stats.buildingCount).toBe(1)
    expect(Math.abs(signedArea(model.buildings[0].outer))).toBeCloseTo(400, 0)
  })

  it('drops chains that never close and counts them', () => {
    const model = parseCityExtract(
      extractOf({
        type: 'relation',
        id: 30,
        tags: { building: 'yes' },
        members: [
          {
            type: 'way',
            ref: 31,
            role: 'outer',
            geometry: [pt(0, 0), pt(10, 0), pt(10, 10)], // open, no partner
          },
        ],
      }),
      { center: CENTER }
    )
    expect(model.stats.buildingCount).toBe(0)
    expect(model.stats.droppedRings).toBe(1)
    expect(model.stats.droppedElements).toBe(1)
  })

  it('does not extrude a tagged member way twice (old-style multipolygons)', () => {
    const ring = squareRing(0, 0, 10)
    const model = parseCityExtract(
      extractOf(
        {
          type: 'relation',
          id: 40,
          tags: { building: 'yes' },
          members: [{ type: 'way', ref: 41, role: 'outer', geometry: ring }],
        },
        { type: 'way', id: 41, tags: { building: 'yes' }, geometry: ring }
      ),
      { center: CENTER }
    )
    expect(model.stats.buildingCount).toBe(1)
  })
})

describe('parseCityExtract — roads', () => {
  it('maps highway classes to widths, with a default for unknown classes', () => {
    const model = parseCityExtract(
      extractOf(
        {
          type: 'way',
          id: 50,
          tags: { highway: 'residential' },
          geometry: [pt(-50, 0), pt(50, 0)],
        },
        {
          type: 'way',
          id: 51,
          tags: { highway: 'busway' },
          geometry: [pt(0, -50), pt(0, 50)],
        }
      ),
      { center: CENTER }
    )

    expect(model.stats.roadCount).toBe(2)
    expect(model.roads[0].widthM).toBe(ROAD_WIDTHS_M.residential)
    expect(model.roads[0].kind).toBe('residential')
    expect(model.roads[1].widthM).toBe(5)
  })
})

describe('parseCityExtract — envelope', () => {
  it('accepts the baked wrapper (center inside) and raw JSON with options.center', () => {
    const el = {
      type: 'way',
      id: 1,
      tags: { building: 'yes' },
      geometry: squareRing(100, 200, 5),
    }

    const fromWrapper = parseCityExtract({
      format: 'ascii-city-extract@1',
      center: CENTER,
      attribution: 'Map data © OpenStreetMap contributors',
      elements: [el],
    })
    expect(fromWrapper.stats.buildingCount).toBe(1)
    expect(fromWrapper.attribution).toContain('OpenStreetMap')

    const fromRaw = parseCityExtract(extractOf(el), { center: CENTER })
    expect(fromRaw.stats.buildingCount).toBe(1)
    expect(fromRaw.attribution).toBe('Map data © OpenStreetMap contributors')
  })

  it('throws without a projection center', () => {
    expect(() => parseCityExtract(extractOf())).toThrow(/center/)
  })

  it('computes bounds covering all geometry', () => {
    const model = parseCityExtract(
      extractOf({
        type: 'way',
        id: 1,
        tags: { building: 'yes' },
        geometry: squareRing(100, -200, 10),
      }),
      { center: CENTER }
    )
    expect(model.boundsM.maxX).toBeGreaterThanOrEqual(109)
    expect(model.boundsM.minY).toBeLessThanOrEqual(-209)
  })
})

describe('trimOverpassElement', () => {
  it('keeps only the needed tags and rounds coordinates to 6 decimals', () => {
    const trimmed = trimOverpassElement({
      type: 'way',
      id: 1,
      bounds: { minlat: 0 },
      tags: {
        building: 'tower',
        height: '184',
        'building:levels': '6',
        name: 'Space Needle',
        'contact:facebook': 'spaceneedle',
        charge: '$35-$39',
        'addr:street': 'Broad Street',
      },
      geometry: [{ lat: 47.62033641234, lon: -122.34931361234 }],
    })

    expect(trimmed.tags).toEqual({
      building: 'tower',
      height: '184',
      'building:levels': '6',
      name: 'Space Needle',
    })
    expect(trimmed.bounds).toBeUndefined()
    expect(trimmed.geometry[0]).toEqual({ lat: 47.620336, lon: -122.349314 })
  })

  it('returns null for elements the game cannot use', () => {
    // CW-33: a landuse way is admitted only for the GREEN values the game
    // draws. Everything else in a downtown - commercial, retail, industrial -
    // is ground that is already drawn as ground, and admitting it would
    // multiply the extract for nothing.
    expect(
      trimOverpassElement({
        type: 'way',
        id: 1,
        tags: { landuse: 'commercial' },
        geometry: [{ lat: 1, lon: 2 }],
      })
    ).toBeNull()
    expect(
      trimOverpassElement({
        type: 'way',
        id: 2,
        tags: { leisure: 'swimming_pool' },
        geometry: [{ lat: 1, lon: 2 }],
      })
    ).toBeNull()
    expect(trimOverpassElement({ type: 'node', id: 3 })).toBeNull()
  })

  it('admits the green ways CW-33 draws, by their tag values', () => {
    for (const tags of [
      { leisure: 'park' },
      { leisure: 'garden' },
      { leisure: 'pitch' },
      { leisure: 'playground' },
      { leisure: 'grass' },
      { landuse: 'grass' },
      { landuse: 'recreation_ground' },
      { landuse: 'forest' },
      { landuse: 'meadow' },
      { landuse: 'village_green' },
    ]) {
      const trimmed = trimOverpassElement({
        type: 'way',
        id: 4,
        tags,
        geometry: [{ lat: 1, lon: 2 }],
      })
      expect(trimmed, JSON.stringify(tags)).not.toBeNull()
      expect(trimmed.tags).toEqual(tags)
    }
  })

  it('keeps the ground and facade tags CW-33 rebaked for', () => {
    const trimmed = trimOverpassElement({
      type: 'way',
      id: 5,
      tags: {
        highway: 'footway',
        footway: 'sidewalk',
        surface: 'concrete',
        lanes: '2',
        width: '1.8',
      },
      geometry: [{ lat: 1, lon: 2 }],
    })
    expect(trimmed.tags).toEqual({
      highway: 'footway',
      footway: 'sidewalk',
      surface: 'concrete',
      lanes: '2',
      width: '1.8',
    })

    const building = trimOverpassElement({
      type: 'way',
      id: 6,
      tags: {
        building: 'yes',
        'building:material': 'brick',
        'building:colour': '#8b4513',
      },
      geometry: [{ lat: 1, lon: 2 }],
    })
    expect(building.tags['building:material']).toBe('brick')
    expect(building.tags['building:colour']).toBe('#8b4513')
  })

  it('keeps relation members with roles and refs', () => {
    const trimmed = trimOverpassElement({
      type: 'relation',
      id: 9,
      tags: { building: 'yes', type: 'multipolygon' },
      members: [
        { type: 'way', ref: 11, role: 'outer', geometry: [{ lat: 1, lon: 2 }] },
        { type: 'node', ref: 12, role: 'admin_centre' },
      ],
    })
    expect(trimmed.members).toHaveLength(1)
    expect(trimmed.members[0]).toMatchObject({ ref: 11, role: 'outer' })
  })
})

describe('extractLandmarks (CW-10)', () => {
  const buildingEl = (id, cx, tags, half = 10) => ({
    type: 'way',
    id,
    tags: { building: 'yes', ...tags },
    geometry: squareRing(cx, 0, half),
  })

  it('scores tagged sites and tall/large named buildings, skipping the unnamed', async () => {
    const { extractLandmarks } =
      await import('../../../src/js/game/city-data.js')
    const model = parseCityExtract(
      extractOf(
        buildingEl(1, 0, { name: 'Old Cathedral', historic: 'church' }),
        buildingEl(2, 50, { name: 'Big Tower', height: '120' }),
        buildingEl(3, 100, { name: 'Corner Shop', height: '6' }, 4),
        buildingEl(4, 150, { height: '200' }) // unnamed: never a landmark
      ),
      { center: CENTER }
    )
    const landmarks = extractLandmarks(model)

    const names = landmarks.map((l) => l.name)
    expect(names).toContain('Old Cathedral')
    expect(names).toContain('Big Tower')
    expect(names).not.toContain('Corner Shop')
    expect(landmarks).toHaveLength(2)

    // Centroid lands inside the footprint.
    const tower = landmarks.find((l) => l.name === 'Big Tower')
    expect(tower.x).toBeCloseTo(50, 0)
    expect(tower.y).toBeCloseTo(0, 0)
  })

  it('caps the list, orders by score then height, and dedupes names', async () => {
    const { extractLandmarks } =
      await import('../../../src/js/game/city-data.js')
    const many = []
    for (let i = 0; i < 20; i++) {
      many.push(
        buildingEl(100 + i, i * 40, { name: `Tower ${i}`, height: '80' })
      )
    }
    // A duplicate-name part must appear once.
    many.push(buildingEl(999, 900, { name: 'Tower 0', height: '80' }))
    // A tourism site outranks plain towers.
    many.push(buildingEl(1000, 950, { name: 'City Museum', tourism: 'museum' }))

    const model = parseCityExtract(extractOf(...many), { center: CENTER })
    const landmarks = extractLandmarks(model, { max: 12 })

    expect(landmarks).toHaveLength(12)
    expect(landmarks[0].name).toBe('City Museum')
    expect(landmarks.filter((l) => l.name === 'Tower 0')).toHaveLength(1)
  })
})

describe('nearestLandmarkName (CW-10)', () => {
  const landmarks = [
    { name: 'Library', x: 0, y: 0, heightM: 20, score: 3 },
    { name: 'Tower', x: 200, y: 0, heightM: 100, score: 4 },
  ]

  it('enters at 60 m and holds until 80 m (hysteresis)', async () => {
    const { nearestLandmarkName } =
      await import('../../../src/js/game/city-data.js')
    expect(nearestLandmarkName(landmarks, 70, 0, null)).toBeNull()
    expect(nearestLandmarkName(landmarks, 50, 0, null)).toBe('Library')
    // At 70 m out, still held...
    expect(nearestLandmarkName(landmarks, 70, 0, 'Library')).toBe('Library')
    // ...released past 80 m.
    expect(nearestLandmarkName(landmarks, 90, 0, 'Library')).toBeNull()
  })

  it('switches to a nearer landmark once the held one is out of range', async () => {
    const { nearestLandmarkName } =
      await import('../../../src/js/game/city-data.js')
    expect(nearestLandmarkName(landmarks, 170, 0, 'Library')).toBe('Tower')
    expect(nearestLandmarkName([], 0, 0, null)).toBeNull()
  })
})

describe('trimOverpassElement — tree nodes (CW-16)', () => {
  it('keeps a natural=tree node with rounded coordinates', () => {
    const trimmed = trimOverpassElement({
      type: 'node',
      id: 77,
      lat: 47.61234561234,
      lon: -122.34567891234,
      tags: {
        natural: 'tree',
        name: 'Big Leaf Maple',
        species: 'Acer macrophyllum',
        'addr:street': 'Pine Street',
      },
    })

    expect(trimmed).toEqual({
      type: 'node',
      id: 77,
      tags: { natural: 'tree', name: 'Big Leaf Maple' },
      lat: 47.612346,
      lon: -122.345679,
    })
  })

  it('drops nodes the game has no use for', () => {
    // A node with no tag the game reads at all.
    expect(
      trimOverpassElement({
        type: 'node',
        id: 78,
        lat: 47.6,
        lon: -122.3,
        tags: { barrier: 'bollard' },
      })
    ).toBeNull()
    // Tagged, but with nowhere to stand.
    expect(
      trimOverpassElement({
        type: 'node',
        id: 79,
        tags: { natural: 'tree' },
      })
    ).toBeNull()
  })

  it('keeps shop and amenity nodes, which CW-34 chooses storefronts from', () => {
    // Not drawn yet. They ride CW-33's rebake so that release does not have
    // to ask Overpass for all four cities a second time.
    for (const tags of [{ shop: 'bakery' }, { amenity: 'cafe' }]) {
      const trimmed = trimOverpassElement({
        type: 'node',
        id: 80,
        lat: 47.6,
        lon: -122.3,
        tags,
      })
      expect(trimmed, JSON.stringify(tags)).not.toBeNull()
      expect(trimmed.tags).toEqual(tags)
    }
  })
})

describe('parseCityExtract — trees (CW-16)', () => {
  it('projects tree nodes into meter points and counts them', () => {
    const model = parseCityExtract(
      extractOf(
        {
          type: 'node',
          id: 1,
          tags: { natural: 'tree' },
          ...pt(30, -40),
        },
        {
          type: 'node',
          id: 2,
          tags: { natural: 'peak' },
          ...pt(10, 10),
        }
      ),
      { center: CENTER }
    )

    expect(model.stats.treeCount).toBe(1)
    expect(model.trees).toHaveLength(1)
    expect(model.trees[0][0]).toBeCloseTo(30, 2)
    expect(model.trees[0][1]).toBeCloseTo(-40, 2)
  })

  it('leaves the building-derived bounds alone', () => {
    const building = {
      type: 'way',
      id: 5,
      tags: { building: 'yes' },
      geometry: squareRing(0, 0, 20),
    }
    const withoutTrees = parseCityExtract(extractOf(building), {
      center: CENTER,
    })
    const withTrees = parseCityExtract(
      extractOf(building, {
        type: 'node',
        id: 6,
        tags: { natural: 'tree' },
        ...pt(4000, 4000),
      }),
      { center: CENTER }
    )

    expect(withTrees.trees).toHaveLength(1)
    expect(withTrees.boundsM).toEqual(withoutTrees.boundsM)
  })
})

describe('the visited set and the proximity hysteresis (CW-20)', () => {
  let nearestLandmarkName
  beforeAll(async () => {
    ;({ nearestLandmarkName } =
      await import('../../../src/js/game/city-data.js'))
  })

  const landmarks = [
    { name: 'Library', x: 0, y: 0 },
    { name: 'Tower', x: 300, y: 0 },
  ]

  /** What the frame loop does: only a CHANGE of nearest landmark counts. */
  function walk(path) {
    const visited = new Set()
    let current = null
    for (const [x, y] of path) {
      const near = nearestLandmarkName(landmarks, x, y, current)
      if (near !== current) {
        current = near
        if (near) visited.add(near)
      }
    }
    return { visited, current }
  }

  it('counts a landmark once however long you stand beside it', () => {
    // The hysteresis is what makes this safe: while you are close, the same
    // name keeps coming back, so the transition never re-fires. Without it a
    // player idling by a landmark would tick it up forever.
    const { visited } = walk([
      [200, 0],
      [40, 0],
      [10, 0],
      [5, 0],
      [10, 0],
      [5, 0],
      [30, 0],
    ])
    expect([...visited]).toEqual(['Library'])
  })

  it('does not re-count a landmark you leave and come back to', () => {
    const { visited } = walk([
      [10, 0], // arrive
      [200, 0], // leave, past the 80 m exit
      [10, 0], // come back
    ])
    expect(visited.size).toBe(1)
  })

  it('counts each landmark as you reach it', () => {
    const { visited } = walk([
      [10, 0],
      [200, 0],
      [290, 0],
    ])
    expect([...visited].sort()).toEqual(['Library', 'Tower'])
  })

  it('holds the current landmark through the gap between enter and exit', () => {
    // Enter at 60 m, leave at 80: between the two, the answer must not flicker
    // to null, or a player walking the boundary would re-count endlessly.
    let current = nearestLandmarkName(landmarks, 10, 0, null)
    expect(current).toBe('Library')
    current = nearestLandmarkName(landmarks, 70, 0, current)
    expect(current).toBe('Library')
    current = nearestLandmarkName(landmarks, 100, 0, current)
    expect(current).toBeNull()
  })

  it('says nothing when there is nothing near', () => {
    expect(nearestLandmarkName(landmarks, 150, 500, null)).toBeNull()
    expect(nearestLandmarkName([], 0, 0, null)).toBeNull()
  })
})

describe('the bake keeps what the silhouettes need (CW-26)', () => {
  it('keeps building:part and the roof tags', async () => {
    const { trimOverpassElement } =
      await import('../../../src/js/game/city-data.js')
    const el = trimOverpassElement({
      type: 'way',
      id: 1,
      geometry: [{ lat: 0, lon: 0 }],
      tags: {
        'building:part': 'yes',
        'roof:shape': 'gabled',
        'roof:height': '4',
        'roof:levels': '1',
        'roof:orientation': 'along',
        height: '30',
        shop: 'bakery',
      },
    })
    // Whole-building roof:shape is nearly absent in US downtowns and the
    // silhouettes live in building:part instead, so BOTH have to survive the
    // bake or one kind of city loses its shape.
    expect(el.tags['building:part']).toBe('yes')
    expect(el.tags['roof:shape']).toBe('gabled')
    expect(el.tags['roof:height']).toBe('4')
    expect(el.tags['roof:levels']).toBe('1')
    expect(el.tags['roof:orientation']).toBe('along')
    expect(el.tags.shop).toBe('bakery')
    expect(el.tags.height).toBe('30')
  })

  it('still throws away everything it never needed', async () => {
    const { trimOverpassElement } =
      await import('../../../src/js/game/city-data.js')
    const el = trimOverpassElement({
      type: 'way',
      id: 2,
      geometry: [{ lat: 0, lon: 0 }],
      tags: {
        building: 'yes',
        'addr:housenumber': '12',
        'source:date': '2019',
        wikidata: 'Q1',
        operator: 'Someone',
      },
    })
    expect(el.tags.building).toBe('yes')
    expect(el.tags['addr:housenumber']).toBeUndefined()
    expect(el.tags['source:date']).toBeUndefined()
    expect(el.tags.wikidata).toBeUndefined()
    expect(el.tags.operator).toBeUndefined()
  })
})

describe('building parts become the silhouette (CW-26)', () => {
  const CENTER = { lat: 47.6062, lon: -122.3321 }
  // A 40 m square outline with two parts inside it: a low wing and a tower.
  const ring = (dLat, dLon, sLat, sLon) => [
    { lat: CENTER.lat + dLat, lon: CENTER.lon + dLon },
    { lat: CENTER.lat + dLat + sLat, lon: CENTER.lon + dLon },
    { lat: CENTER.lat + dLat + sLat, lon: CENTER.lon + dLon + sLon },
    { lat: CENTER.lat + dLat, lon: CENTER.lon + dLon + sLon },
    { lat: CENTER.lat + dLat, lon: CENTER.lon + dLon },
  ]
  const D = 0.00036 // ~40 m of latitude
  const extract = {
    center: CENTER,
    elements: [
      {
        type: 'way',
        id: 1,
        tags: { building: 'yes', name: 'Host' },
        geometry: ring(0, 0, D, D * 1.5),
      },
      {
        type: 'way',
        id: 2,
        tags: { 'building:part': 'yes', height: '12' },
        geometry: ring(D * 0.1, D * 0.15, D * 0.3, D * 0.4),
      },
      {
        type: 'way',
        id: 3,
        tags: { 'building:part': 'yes', height: '90', min_height: '12' },
        geometry: ring(D * 0.5, D * 0.6, D * 0.3, D * 0.4),
      },
    ],
  }

  it('files each part under the outline that contains it', async () => {
    const { parseCityExtract } =
      await import('../../../src/js/game/city-data.js')
    const model = parseCityExtract(extract)
    // One BUILDING, not three: the parts are its mass, not neighbours.
    expect(model.buildings).toHaveLength(1)
    expect(model.stats.partCount).toBe(2)
    expect(model.stats.orphanParts).toBe(0)
    const host = model.buildings[0]
    expect(host.name).toBe('Host')
    expect(host.parts).toHaveLength(2)
    expect(host.parts.map((p) => p.heightM).sort((a, b) => a - b)).toEqual([
      12, 90,
    ])
    // The tower part starts where the wing stops - that stepped profile IS
    // the silhouette this release exists to recover.
    const tower = host.parts.find((p) => p.heightM === 90)
    expect(tower.minHeightM).toBe(12)
  })

  it('keeps the OUTLINE for collision, whatever the parts do', async () => {
    const { parseCityExtract } =
      await import('../../../src/js/game/city-data.js')
    const { pointInRing } =
      await import('../../../src/js/game/walk-controls.js')
    const model = parseCityExtract(extract)
    const host = model.buildings[0]
    // Find a spot inside the outline that is in NO part - the gap between
    // the wing and the tower. If collision ever read parts instead of the
    // outline, a player would walk into the middle of a solid building here.
    const xs = host.outer.map((pt) => pt[0])
    const ys = host.outer.map((pt) => pt[1])
    const lo = [Math.min(...xs), Math.min(...ys)]
    const hi = [Math.max(...xs), Math.max(...ys)]
    let gap = null
    for (let gx = 0; gx <= 40 && !gap; gx++) {
      for (let gy = 0; gy <= 40 && !gap; gy++) {
        const x = lo[0] + ((hi[0] - lo[0]) * gx) / 40
        const y = lo[1] + ((hi[1] - lo[1]) * gy) / 40
        if (!pointInRing(x, y, host.outer)) continue
        if (host.parts.some((pt) => pointInRing(x, y, pt.outer))) continue
        gap = [x, y]
      }
    }
    expect(gap).not.toBeNull()
    expect(pointInRing(gap[0], gap[1], host.outer)).toBe(true)
    expect(host.parts.some((pt) => pointInRing(gap[0], gap[1], pt.outer))).toBe(
      false
    )
  })

  it('still draws a part whose outline is outside the extract', async () => {
    const { parseCityExtract } =
      await import('../../../src/js/game/city-data.js')
    const model = parseCityExtract({
      center: CENTER,
      elements: [extract.elements[1]],
    })
    expect(model.buildings).toHaveLength(1)
    expect(model.stats.orphanParts).toBe(1)
    expect(model.buildings[0].heightM).toBe(12)
    expect(model.buildings[0].parts).toEqual([])
  })

  it('treats a way tagged both building and building:part as an outline', async () => {
    const { parseCityExtract } =
      await import('../../../src/js/game/city-data.js')
    const model = parseCityExtract({
      center: CENTER,
      elements: [
        {
          type: 'way',
          id: 9,
          tags: { building: 'yes', 'building:part': 'yes', name: 'Self' },
          geometry: ring(0, 0, D, D),
        },
      ],
    })
    expect(model.buildings).toHaveLength(1)
    expect(model.buildings[0].name).toBe('Self')
    expect(model.stats.partCount).toBe(0)
    expect(model.stats.orphanParts).toBe(0)
  })
})

describe('a turret does not delete its hall (CW-26)', () => {
  const CENTER = { lat: 47.6062, lon: -122.3321 }
  const D = 0.00036
  const ring = (dLat, dLon, sLat, sLon) => [
    { lat: CENTER.lat + dLat, lon: CENTER.lon + dLon },
    { lat: CENTER.lat + dLat + sLat, lon: CENTER.lon + dLon },
    { lat: CENTER.lat + dLat + sLat, lon: CENTER.lon + dLon + sLon },
    { lat: CENTER.lat + dLat, lon: CENTER.lon + dLon + sLon },
    { lat: CENTER.lat + dLat, lon: CENTER.lon + dLon },
  ]
  const outline = {
    type: 'way',
    id: 1,
    tags: { building: 'yes', name: 'Hall' },
    geometry: ring(0, 0, D, D),
  }
  const parse = async (elements) => {
    const { parseCityExtract } =
      await import('../../../src/js/game/city-data.js')
    return parseCityExtract({ center: CENTER, elements })
  }

  it('leaves the outline standing when the parts barely cover it', async () => {
    // One small turret on a big hall - the Albuquerque shape.
    const model = await parse([
      outline,
      {
        type: 'way',
        id: 2,
        tags: { 'building:part': 'yes', height: '20' },
        geometry: ring(D * 0.4, D * 0.4, D * 0.12, D * 0.12),
      },
    ])
    const host = model.buildings[0]
    expect(host.parts).toHaveLength(1)
    expect(host.partsAreMass).toBe(false)
  })

  it('stands the outline down when the parts ARE the building', async () => {
    // Two halves tiling the whole footprint - the well-mapped downtown shape.
    const model = await parse([
      outline,
      {
        type: 'way',
        id: 3,
        tags: { 'building:part': 'yes', height: '40' },
        geometry: ring(0, 0, D * 0.5, D),
      },
      {
        type: 'way',
        id: 4,
        tags: { 'building:part': 'yes', height: '90' },
        geometry: ring(D * 0.5, 0, D * 0.5, D),
      },
    ])
    const host = model.buildings[0]
    expect(host.parts).toHaveLength(2)
    expect(host.partsAreMass).toBe(true)
  })

  it('sits exactly on the documented threshold deliberately', async () => {
    const { PART_COVERAGE_MIN } =
      await import('../../../src/js/game/city-data.js')
    expect(PART_COVERAGE_MIN).toBe(0.6)
  })

  it('never marks a partless building as mass', async () => {
    const model = await parse([outline])
    expect(model.buildings[0].partsAreMass).toBe(false)
  })
})

describe('roofs resolve from tags, or stay flat (CW-26)', () => {
  const load = () => import('../../../src/js/game/city-data.js')

  it('takes roof:height literally', async () => {
    const { resolveRoof } = await load()
    const r = resolveRoof({ 'roof:shape': 'gabled', 'roof:height': '4' }, 20, 0)
    expect(r).toEqual({
      shape: 'gabled',
      heightM: 4,
      orientation: undefined,
    })
  })

  it('falls back to roof:levels, then to a share of the body', async () => {
    const { resolveRoof, LEVEL_HEIGHT_M } = await load()
    expect(
      resolveRoof({ 'roof:shape': 'hipped', 'roof:levels': '1' }, 20, 0).heightM
    ).toBe(LEVEL_HEIGHT_M)
    // No roof height tagged at all: a quarter of the body.
    expect(resolveRoof({ 'roof:shape': 'hipped' }, 20, 0).heightM).toBe(5)
  })

  it('never lets the roof eat the building', async () => {
    const { resolveRoof } = await load()
    // A roof taller than the building is a tagging error, not a spire.
    const r = resolveRoof(
      { 'roof:shape': 'pyramidal', 'roof:height': '80' },
      20,
      0
    )
    expect(r.heightM).toBeLessThanOrEqual(12)
    expect(r.heightM).toBeLessThan(20)
  })

  it('treats flat and untagged as no roof at all', async () => {
    const { resolveRoof } = await load()
    expect(resolveRoof({ 'roof:shape': 'flat' }, 20, 0)).toBeNull()
    expect(resolveRoof({}, 20, 0)).toBeNull()
  })

  it('refuses a roof too shallow to be worth the triangles', async () => {
    const { resolveRoof } = await load()
    expect(
      resolveRoof({ 'roof:shape': 'gabled', 'roof:height': '0.4' }, 20, 0)
    ).toBeNull()
  })

  it('measures the roof against the BODY, not the ground', async () => {
    const { resolveRoof } = await load()
    // An elevated volume 10 m tall starting at 30 m: the quarter share is of
    // the 10, not the 40, or a skybridge would grow a mountain.
    expect(resolveRoof({ 'roof:shape': 'hipped' }, 40, 30).heightM).toBe(2.5)
  })

  it('carries roof:orientation through untouched', async () => {
    const { resolveRoof } = await load()
    expect(
      resolveRoof(
        { 'roof:shape': 'gabled', 'roof:orientation': 'across' },
        20,
        0
      ).orientation
    ).toBe('across')
  })
})

describe('road names survive parsing (CW-27)', () => {
  it('carries a named way through to the road record', async () => {
    const { parseCityExtract } =
      await import('../../../src/js/game/city-data.js')
    const center = { lat: 47.6062, lon: -122.3321 }
    const model = parseCityExtract({
      center,
      elements: [
        {
          type: 'way',
          id: 1,
          tags: { highway: 'residential', name: 'Pike Street' },
          geometry: [
            { lat: 47.6062, lon: -122.3321 },
            { lat: 47.6065, lon: -122.3321 },
          ],
        },
        {
          type: 'way',
          id: 2,
          tags: { highway: 'service' },
          geometry: [
            { lat: 47.607, lon: -122.3321 },
            { lat: 47.6072, lon: -122.3321 },
          ],
        },
      ],
    })
    expect(model.roads).toHaveLength(2)
    // The bake kept this name all along; the parser used to drop it.
    expect(model.roads[0].name).toBe('Pike Street')
    // An unnamed way stays unnamed rather than inheriting anything.
    expect(model.roads[1].name).toBeUndefined()
  })
})

describe('the street index answers where you are (CW-27)', () => {
  const load = () => import('../../../src/js/game/city-data.js')
  // A cross: Main Street east-west along y=0, Cross Road north-south at x=0.
  const roads = [
    {
      name: 'Main Street',
      kind: 'residential',
      points: [
        [-100, 0],
        [100, 0],
      ],
    },
    {
      name: 'Cross Road',
      kind: 'residential',
      points: [
        [0, -100],
        [0, 100],
      ],
    },
    {
      // Unnamed ways can never answer the question and are left out.
      kind: 'service',
      points: [
        [-100, 6],
        [100, 6],
      ],
    },
  ]

  it('names the street you are standing on', async () => {
    const { buildStreetIndex } = await load()
    const idx = buildStreetIndex(roads)
    const hit = idx.nearest(50, 2, 30)
    expect(hit.name).toBe('Main Street')
    expect(hit.distM).toBeCloseTo(2, 5)
  })

  it('says nothing rather than naming a street too far away', async () => {
    const { buildStreetIndex } = await load()
    const idx = buildStreetIndex(roads)
    expect(idx.nearest(50, 200, 30)).toBeNull()
  })

  it('leaves unnamed ways out of the index entirely', async () => {
    const { buildStreetIndex } = await load()
    const idx = buildStreetIndex(roads)
    // Stand right on the unnamed service road: the answer is the named
    // street 6 m away, never the way underfoot.
    const hit = idx.nearest(50, 6, 30)
    expect(hit.name).toBe('Main Street')
  })

  it('returns the runner-up so an intersection can be debounced', async () => {
    const { buildStreetIndex } = await load()
    const idx = buildStreetIndex(roads)
    // Near the crossing both streets are close, and the caller needs to see
    // the gap between them rather than only the winner.
    const hits = idx.query(3, 2, 30)
    const names = hits.map((h) => h.name)
    expect(names).toContain('Main Street')
    expect(names).toContain('Cross Road')
    expect(hits[0].name).toBe('Main Street')
    expect(hits[1].rank - hits[0].rank).toBeLessThan(4)
  })

  it('prefers the street to the cycletrack running beside it', async () => {
    const { buildStreetIndex } = await load()
    // The real Seattle case: the cycletrack is nearer, the street is what a
    // player would say they are on.
    const idx = buildStreetIndex([
      {
        name: '4th Avenue',
        kind: 'primary',
        points: [
          [-100, 0],
          [100, 0],
        ],
      },
      {
        name: '4th Avenue Cycletrack',
        kind: 'cycleway',
        points: [
          [-100, 4],
          [100, 4],
        ],
      },
    ])
    expect(idx.nearest(0, 5, 30).name).toBe('4th Avenue')
  })

  it('still lets a path win when you are genuinely on it', async () => {
    const { buildStreetIndex } = await load()
    const idx = buildStreetIndex([
      {
        name: 'Far Street',
        kind: 'primary',
        points: [
          [-100, 40],
          [100, 40],
        ],
      },
      {
        name: 'Park Trail',
        kind: 'footway',
        points: [
          [-100, 0],
          [100, 0],
        ],
      },
    ])
    expect(idx.nearest(0, 1, 60).name).toBe('Park Trail')
  })

  it('reports the true distance, not the ranking distance', async () => {
    const { buildStreetIndex } = await load()
    const idx = buildStreetIndex([
      {
        name: 'Park Trail',
        kind: 'footway',
        points: [
          [-100, 0],
          [100, 0],
        ],
      },
    ])
    const hit = idx.nearest(0, 3, 30)
    // Ranked at 11 by the path penalty, but the player really is 3 m away
    // and the announcement must not inherit the penalty.
    expect(hit.distM).toBeCloseTo(3, 5)
  })
})

describe('CW-33 — the greenspace list is one list', () => {
  it('is the set the coverage table was measured against', () => {
    // Pinned by value. Adding one means re-measuring what it costs per city
    // and rebaking; it is not a free edit.
    expect(GREEN_LEISURE_VALUES).toEqual([
      'park',
      'garden',
      'pitch',
      'playground',
      'grass',
    ])
    expect(GREEN_LANDUSE_VALUES).toEqual([
      'grass',
      'recreation_ground',
      'forest',
      'meadow',
      'village_green',
    ])
  })

  it('admits exactly those values and nothing else', () => {
    for (const v of GREEN_LEISURE_VALUES) {
      expect(isGreenTags({ leisure: v }), v).toBe(true)
    }
    for (const v of GREEN_LANDUSE_VALUES) {
      expect(isGreenTags({ landuse: v }), v).toBe(true)
    }
    expect(isGreenTags({ landuse: 'commercial' })).toBe(false)
    expect(isGreenTags({ landuse: 'retail' })).toBe(false)
    expect(isGreenTags({ leisure: 'swimming_pool' })).toBe(false)
    expect(isGreenTags({ building: 'yes' })).toBe(false)
    expect(isGreenTags(null)).toBe(false)
    expect(isGreenTags(undefined)).toBe(false)
  })
})

describe('CW-Q31 — the part-area floor', () => {
  const center = { lat: 47.6, lon: -122.33 }
  /** A square of `m` metres on a side, as a closed lat/lon ring. */
  const square = (m) => {
    const dLat = m / 111320
    const dLon = dLat / Math.cos((center.lat * Math.PI) / 180)
    return [
      { lat: center.lat, lon: center.lon },
      { lat: center.lat, lon: center.lon + dLon },
      { lat: center.lat + dLat, lon: center.lon + dLon },
      { lat: center.lat + dLat, lon: center.lon },
    ]
  }

  it('is the number the owner signed', () => {
    expect(MIN_PART_AREA_M2).toBe(10)
  })

  it('measures a ring in square metres', () => {
    // Projection is not exact at this latitude; a few percent either way is
    // the projection, not the maths.
    expect(ringAreaM2(square(10), center)).toBeGreaterThan(95)
    expect(ringAreaM2(square(10), center)).toBeLessThan(105)
    expect(ringAreaM2(square(2), center)).toBeGreaterThan(3.8)
    expect(ringAreaM2(square(2), center)).toBeLessThan(4.2)
  })

  it('puts the slivers below the floor and real parts above it', () => {
    // A 2 m square ledge is what Denver is full of; a 10 m square is a real
    // volume a character cell can show.
    expect(ringAreaM2(square(2), center)).toBeLessThan(MIN_PART_AREA_M2)
    expect(ringAreaM2(square(4), center)).toBeGreaterThan(MIN_PART_AREA_M2)
  })

  it('reports zero for a ring that is not one', () => {
    expect(ringAreaM2([], center)).toBe(0)
    expect(ringAreaM2([{ lat: 1, lon: 2 }], center)).toBe(0)
    expect(ringAreaM2(null, center)).toBe(0)
  })
})

describe('CW-33 — pavements, surfaces and greens reach the model', () => {
  const road = (id, tags) => ({
    type: 'way',
    id,
    tags,
    geometry: [pt(0, 0), pt(60, 0)],
  })

  it('tells a kerbside pavement apart from a path through a park', () => {
    const model = parseCityExtract(
      extractOf(
        road(1, { highway: 'footway', footway: 'sidewalk' }),
        road(2, { highway: 'footway' })
      ),
      { center: CENTER }
    )
    const [pavement, path] = model.roads
    expect(pavement.sidewalk).toBe(true)
    expect(pavement.widthM).toBe(SIDEWALK_WIDTH_M)
    // A footway with no sidewalk sub-tag keeps the wider path default, so a
    // park path does not become a kerb.
    expect(path.sidewalk).toBe(false)
    expect(path.widthM).toBe(ROAD_WIDTHS_M.footway)
    expect(model.stats.sidewalkCount).toBe(1)
  })

  it('carries the surface tag through, and leaves it undefined when OSM has none', () => {
    const model = parseCityExtract(
      extractOf(
        road(1, { highway: 'residential', surface: 'asphalt' }),
        road(2, { highway: 'residential' })
      ),
      { center: CENTER }
    )
    expect(model.roads[0].surface).toBe('asphalt')
    expect(model.roads[1].surface).toBeUndefined()
    expect(model.stats.surfacedRoadCount).toBe(1)
  })

  it('parses green ways into polygons that carry their kind', () => {
    const model = parseCityExtract(
      extractOf(
        {
          type: 'way',
          id: 1,
          tags: { leisure: 'park' },
          geometry: squareRing(0, 0, 20),
        },
        {
          type: 'way',
          id: 2,
          tags: { landuse: 'forest' },
          geometry: squareRing(80, 0, 15),
        }
      ),
      { center: CENTER }
    )
    expect(model.stats.greenCount).toBe(2)
    expect(model.greens.map((g) => g.kind)).toEqual(['park', 'forest'])
    // A projected 40 m square, as the scene will extrude it.
    expect(Math.abs(signedArea(model.greens[0].outer))).toBeCloseTo(1600, 0)
  })

  it('leaves greens out when there are none, rather than inventing a list', () => {
    const model = parseCityExtract(
      extractOf(road(1, { highway: 'residential' })),
      { center: CENTER }
    )
    expect(model.greens).toEqual([])
    expect(model.stats.greenCount).toBe(0)
  })
})
