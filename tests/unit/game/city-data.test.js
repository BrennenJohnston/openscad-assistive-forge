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
    expect(resolveBuildingHeight({ height: '30 ft' }).heightM).toBeCloseTo(9.144, 3)
    expect(resolveBuildingHeight({ height: "40'" }).heightM).toBeCloseTo(12.192, 3)
    expect(
      resolveBuildingHeight({ 'building:height': '15' }).heightM
    ).toBe(15)
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
      extractOf({ type: 'way', id: 1, tags: { building: 'yes' }, geometry: cw }),
      { center: CENTER }
    )
    expect(signedArea(model.buildings[0].outer)).toBeGreaterThan(0)
  })

  it('ignores building=no and drops degenerate footprints', () => {
    const model = parseCityExtract(
      extractOf(
        { type: 'way', id: 1, tags: { building: 'no' }, geometry: squareRing(0, 0, 5) },
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
          { type: 'way', ref: 11, role: 'outer', geometry: squareRing(0, 0, 10) },
          { type: 'way', ref: 12, role: 'inner', geometry: squareRing(0, 0, 3) },
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
    expect(
      trimOverpassElement({ type: 'way', id: 1, tags: { landuse: 'grass' }, geometry: [] })
    ).toBeNull()
    expect(trimOverpassElement({ type: 'node', id: 2 })).toBeNull()
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
    const { extractLandmarks } = await import(
      '../../../src/js/game/city-data.js'
    )
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
    const { extractLandmarks } = await import(
      '../../../src/js/game/city-data.js'
    )
    const many = []
    for (let i = 0; i < 20; i++) {
      many.push(
        buildingEl(100 + i, i * 40, { name: `Tower ${i}`, height: '80' })
      )
    }
    // A duplicate-name part must appear once.
    many.push(buildingEl(999, 900, { name: 'Tower 0', height: '80' }))
    // A tourism site outranks plain towers.
    many.push(
      buildingEl(1000, 950, { name: 'City Museum', tourism: 'museum' })
    )

    const model = parseCityExtract(extractOf(...many), { center: CENTER })
    const landmarks = extractLandmarks(model, { max: 12 })

    expect(landmarks).toHaveLength(12)
    expect(landmarks[0].name).toBe('City Museum')
    expect(
      landmarks.filter((l) => l.name === 'Tower 0')
    ).toHaveLength(1)
  })
})

describe('nearestLandmarkName (CW-10)', () => {
  const landmarks = [
    { name: 'Library', x: 0, y: 0, heightM: 20, score: 3 },
    { name: 'Tower', x: 200, y: 0, heightM: 100, score: 4 },
  ]

  it('enters at 60 m and holds until 80 m (hysteresis)', async () => {
    const { nearestLandmarkName } = await import(
      '../../../src/js/game/city-data.js'
    )
    expect(nearestLandmarkName(landmarks, 70, 0, null)).toBeNull()
    expect(nearestLandmarkName(landmarks, 50, 0, null)).toBe('Library')
    // At 70 m out, still held...
    expect(nearestLandmarkName(landmarks, 70, 0, 'Library')).toBe('Library')
    // ...released past 80 m.
    expect(nearestLandmarkName(landmarks, 90, 0, 'Library')).toBeNull()
  })

  it('switches to a nearer landmark once the held one is out of range', async () => {
    const { nearestLandmarkName } = await import(
      '../../../src/js/game/city-data.js'
    )
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
    expect(
      trimOverpassElement({
        type: 'node',
        id: 78,
        lat: 47.6,
        lon: -122.3,
        tags: { amenity: 'cafe' },
      })
    ).toBeNull()
    expect(
      trimOverpassElement({
        type: 'node',
        id: 79,
        tags: { natural: 'tree' },
      })
    ).toBeNull()
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
