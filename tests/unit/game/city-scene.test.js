import { describe, it, expect } from 'vitest'
import { Scene, PerspectiveCamera, Box3 } from 'three'
import {
  buildCityGroup,
  attachCityLighting,
  buildingTint,
  buildStreetProps,
  ROAD_TONES,
  trafficLightState,
  buildRain,
  tintOf,
  inGamutChroma,
  hashSpot,
  CITY_PAVING,
  STOREFRONT_BAND_NAMES,
  storefrontBandFor,
  CAR_HEADLAMP_TINT,
  CAR_TAILLAMP_TINT,
  glassTint,
  CAR_TIERS,
  CAR_CABIN_LIFT,
  TRAVELER_LOOK,
  TRAVELER_MIN_FROM_SPAWN_M,
  buildTraveler,
  pickTravelerSpot,
  lampLayoutFor,
} from '../../../src/js/game/city-scene.js'
import {
  pickPaletteIndex,
  parsePaletteColor,
  normalizeChroma,
} from '../../../src/js/_hfm-paint.js'
import {
  HC_PALETTE_GREEN,
  HC_PALETTE_AMBER,
} from '../../../src/js/game/hc-palettes.js'
import {
  parseCityExtract,
  ROAD_WIDTHS_M,
} from '../../../src/js/game/city-data.js'
import {
  buildCollisionGrid,
  pointInRing,
  buildRoadwayIndex,
  rectsOverlap,
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

function model() {
  return parseCityExtract(
    {
      elements: [
        {
          type: 'way',
          id: 1,
          tags: { building: 'yes', height: '25' },
          geometry: squareRing(0, 0, 5),
        },
        {
          type: 'way',
          id: 2,
          // CW-76: the skybridge this fixture has always meant, tagged the
          // way all four extracts tag one. As `building=yes` it was a mass
          // with an empty column under it and is now drawn to the street.
          tags: { building: 'bridge', height: '10', min_height: '4' },
          geometry: squareRing(30, 0, 5),
        },
        {
          type: 'way',
          id: 3,
          tags: { highway: 'residential' },
          geometry: [pt(-50, 20), pt(50, 20)],
        },
      ],
    },
    { center: CENTER }
  )
}

describe('buildCityGroup', () => {
  it('builds merged buildings, a ground plane, and road ribbons', () => {
    const { group, stats, dispose } = buildCityGroup(model())

    const names = group.children.map((c) => c.name)
    expect(names).toContain('buildings')
    expect(names).toContain('ground')
    expect(names).toContain('roads')
    expect(stats.buildingTriangles).toBeGreaterThan(0)
    // One segment is two triangles of roadway plus two more for each of its
    // pavement aprons (CW-50): every street carries a pavement now, not only
    // the ones OpenStreetMap maps a pavement for.
    expect(stats.roadTriangles).toBe(6)

    dispose()
  })

  it('extrudes along +Z to the tagged height, honoring min_height', () => {
    const { group, dispose } = buildCityGroup(model())
    const buildings = group.children.find((c) => c.name === 'buildings')

    buildings.geometry.computeBoundingBox()
    const box = buildings.geometry.boundingBox
    expect(box.min.z).toBe(0) // grounded building starts at 0
    expect(box.max.z).toBeCloseTo(25, 5) // tallest building's roof

    dispose()
  })

  it('sizes the ground to cover the model bounds with margin', () => {
    const { group, dispose } = buildCityGroup(model())
    const ground = group.children.find((c) => c.name === 'ground')

    const box = new Box3().setFromObject(ground)
    const m = model()
    expect(box.min.x).toBeLessThan(m.boundsM.minX)
    expect(box.max.x).toBeGreaterThan(m.boundsM.maxX)

    dispose()
  })

  it('builds an empty-safe group when the model has no geometry', () => {
    const empty = parseCityExtract({ elements: [] }, { center: CENTER })
    const { group, stats, dispose } = buildCityGroup(empty)
    expect(group.children.map((c) => c.name)).toContain('ground')
    expect(stats.buildingTriangles).toBe(0)
    dispose()
  })
})

describe('lampLayoutFor (CW-77)', () => {
  it('★ lights an ordinary street every 18 m, which is HALF A SENTENCE more than 55', () => {
    // Seattle Streets Illustrated 3.6 in full: "street lights alternating
    // every 180 ft, PEDESTRIAN LIGHTS BETWEEN THEM AT 60 FT". 55 m is the
    // interval of one kind of lamp; 18 m is the interval at which a walker
    // meets one, and this game draws one kind of pole. Both checkable facts
    // agree: City Light's surveyed register measures a 16.7 m median, and at
    // 55 m the CW-45 roadrunner pin starves (13 -> 5 against a 40 % lamp
    // cut, where 18 m gives 23).
    for (const kind of ['residential', 'tertiary', 'secondary', 'primary']) {
      const l = lampLayoutFor({ kind, widthM: ROAD_WIDTHS_M[kind] })
      expect(l).toEqual({ spacingM: 18, paired: false })
    }
  })

  it('gives a pedestrian street luminaires every 18 m', () => {
    // 60 ft, and the reason a shopping street reads as lit.
    expect(lampLayoutFor({ kind: 'pedestrian', widthM: 8 })).toEqual({
      spacingM: 18,
      paired: false,
    })
    expect(lampLayoutFor({ kind: 'living_street', widthM: 6 })).toEqual({
      spacingM: 18,
      paired: false,
    })
  })

  it('★ pairs the sides on a street wider than 15.2 m - a rule NO CITY HERE REACHES', () => {
    // 250 ft opposite pairs. The widest class this game lights is 14 m, and
    // the two that would qualify - motorway and trunk - have been unlit since
    // CW-18. So nothing in the four extracts exercises this, and without a
    // synthetic road the rule would ship untested (CW-74's lesson: a guard
    // that cannot fail is not a guard).
    expect(lampLayoutFor({ kind: 'primary', widthM: 18 })).toEqual({
      spacingM: 76,
      paired: true,
    })
    expect(
      Object.entries(ROAD_WIDTHS_M).filter(([, w]) => w > 15.2).map(([k]) => k)
    ).toEqual(['motorway'])
  })

  it('reads the WIDTH, not the class name', () => {
    // So a future width change reaches the rule without anyone remembering.
    expect(lampLayoutFor({ kind: 'residential', widthM: 20 }).paired).toBe(true)
    expect(lampLayoutFor({ kind: 'motorway', widthM: 9 }).paired).toBe(false)
  })
})

describe('buildStreetProps - mapped lamps (CW-77)', () => {
  /** A straight secondary street, with mapped lamps placed against it. */
  function lampModel(lamps) {
    return parseCityExtract(
      {
        elements: [
          {
            type: 'way',
            id: 1,
            tags: { highway: 'secondary' },
            geometry: [pt(-200, 0), pt(200, 0)],
          },
          // Two far buildings, only to stretch the playable core: prop
          // placement is clipped to the BUILDING bounds, so a street with no
          // buildings near it gets no props at all.
          {
            type: 'way',
            id: 2,
            tags: { building: 'yes', height: '10' },
            geometry: squareRing(-220, 60, 10),
          },
          {
            type: 'way',
            id: 3,
            tags: { building: 'yes', height: '10' },
            geometry: squareRing(220, -60, 10),
          },
          {
            type: 'way',
            id: 4,
            tags: { building: 'yes', height: '10' },
            geometry: squareRing(0, 120, 20),
          },
          ...lamps.map((l, i) => ({
            type: 'node',
            id: 1000 + i,
            tags: { highway: 'street_lamp', ...(l.tags ?? {}) },
            lat: pt(l.x, l.y).lat,
            lon: pt(l.x, l.y).lon,
          })),
        ],
      },
      { center: CENTER }
    )
  }

  const propsOf = (model) =>
    buildStreetProps(model, buildCollisionGrid(model))

  it('parses a mapped lamp into its own stream, not into the furniture', () => {
    const m = lampModel([{ x: -50, y: 9 }])
    expect(m.lamps).toHaveLength(1)
    expect(m.stats.lampNodeCount).toBe(1)
    // ★ CW-43's furniture counts are e2e-pinned; a lamp must not touch them.
    expect(m.stats.furnitureByKind.street_lamp).toBeUndefined()
    expect(m.furniture.some((f) => f.kind === 'street_lamp')).toBe(false)
  })

  /**
   * A street with enough perches on it to actually carry birds. The lamp
   * fixture above carries NONE - 19 lamp heads at a 0.06 rate is a hash that
   * never fires - and a test written on it passed with the accounting
   * deliberately broken. Measured on this one: three birds over two perch
   * kinds, which is what makes the assertions below able to fail.
   */
  function perchModel() {
    const lamps = []
    for (let x = -180; x <= 180; x += 12) lamps.push(x)
    return parseCityExtract(
      {
        elements: [
          {
            type: 'way',
            id: 1,
            tags: { highway: 'secondary' },
            geometry: [pt(-200, 0), pt(200, 0)],
          },
          {
            type: 'way',
            id: 2,
            tags: { building: 'yes', height: '10' },
            geometry: squareRing(-220, 60, 10),
          },
          {
            type: 'way',
            id: 3,
            tags: { building: 'yes', height: '10' },
            geometry: squareRing(220, -60, 10),
          },
          {
            type: 'way',
            id: 4,
            tags: { building: 'yes', height: '10' },
            geometry: squareRing(0, 120, 20),
          },
          {
            type: 'way',
            id: 5,
            tags: { leisure: 'park' },
            geometry: squareRing(0, 60, 35),
          },
          ...Array.from({ length: 12 }, (_, i) => ({
            type: 'node',
            id: 2000 + i,
            tags: { amenity: 'bench', backrest: 'yes' },
            lat: pt(-150 + i * 25, 8).lat,
            lon: pt(-150 + i * 25, 8).lon,
          })),
          ...lamps.map((x, i) => ({
            type: 'node',
            id: 1000 + i,
            tags: { highway: 'street_lamp' },
            lat: pt(x, 9).lat,
            lon: pt(x, 9).lon,
          })),
        ],
      },
      { center: CENTER }
    )
  }

  it('★ counts every bird by the perch it took, and the parts sum to the whole', () => {
    // ★ A TOTAL CANNOT ANSWER A QUESTION ABOUT COMPETITION. Only one perch
    // kind - a mapped lawn - is open to a goose, while a crow works parapets,
    // lamp heads and the open ground beside a pole as well. A guard written
    // on the TOTALS therefore moves with the city's lamp count: CW-77 doubled
    // Denver's lamps, the crow's total passed the goose's, and the goose had
    // lost nothing at all (ground perch: goose 51, crow 8). `birdsByPerch` is
    // what lets that question be asked where it can be answered.
    //
    // Nothing here pins a species to a perch - that is `city-birds.js`'s
    // table and its own tests. This pins the ACCOUNTING: every bird the
    // builder placed is counted once, under the pass that placed it.
    const props = propsOf(perchModel())
    const { birdsByPerch, birdsPlaced } = props.stats

    // Not vacuous: there are birds, and they came from more than one pass.
    const total = Object.values(birdsPlaced).reduce((a, c) => a + c, 0)
    expect(total).toBeGreaterThan(0)
    expect(Object.keys(birdsByPerch).length).toBeGreaterThan(1)
    // Every bucket is a real perch kind, never the initial placeholder.
    expect(Object.keys(birdsByPerch)).not.toContain('unknown')

    const summed = {}
    for (const names of Object.values(birdsByPerch)) {
      for (const [name, n] of Object.entries(names)) {
        summed[name] = (summed[name] ?? 0) + n
      }
    }
    expect(summed).toEqual(birdsPlaced)

    props.dispose()
  })

  it('stands a mapped lamp where the map put it', () => {
    const { stats } = propsOf(lampModel([{ x: -50, y: 9 }]))
    expect(stats.lampsMapped).toBe(1)
    expect(stats.lampsMappedNudged).toBe(0)
    expect(stats.lampsMappedInRoad).toBe(0)
  })

  it('★ NUDGES a surveyed pole out of our ribbon rather than deleting it', () => {
    // A 12 m secondary means a ribbon from -6 to +6. A pole at 5 m is one
    // metre inside it - which is what 572 of Seattle City Light's 3,679 poles
    // look like, and City Light does not stand poles in traffic lanes. Our
    // ribbon is the approximation, so it yields.
    const { stats } = propsOf(lampModel([{ x: -50, y: 5 }]))
    expect(stats.lampsMapped).toBe(1)
    expect(stats.lampsMappedNudged).toBe(1)
    expect(stats.lampsMappedInRoad).toBe(0)
  })

  it('...but DROPS one too deep to be a disagreement about a kerb', () => {
    // A pole on the centre line is 6 m in. On the real freeway that is I-5
    // running below a flat 16 m band, and moving it 6 m would be inventing a
    // position, not correcting one.
    const { stats } = propsOf(lampModel([{ x: -50, y: 0 }]))
    expect(stats.lampsMappedConsidered).toBe(1)
    expect(stats.lampsMapped).toBe(0)
    expect(stats.lampsMappedNudged).toBe(0)
    expect(stats.lampsMappedInRoad).toBe(1)
  })

  it('★ a mapped lamp CLAIMS its stretch, so nothing is invented beside it', () => {
    // Two runs of the same street: one bare, one with lamps mapped every
    // 25 m along it. The mapped run must not end up with the procedural
    // lamps as well - that is the whole meaning of "seed".
    const bare = propsOf(lampModel([]))
    // Every 25 m: WIDER than the 18 m the stream would use, so the claim has
    // to reach a full interval to cover the gaps between them. At 0.6 of an
    // interval it did not, and the stream lit an already-lit street.
    const mapped = []
    for (let x = -180; x <= 180; x += 25) mapped.push({ x, y: 8 })
    const seeded = propsOf(lampModel(mapped))
    expect(bare.stats.lampsMapped).toBe(0)
    expect(bare.stats.lampsProcedural).toBeGreaterThan(0)
    expect(seeded.stats.lampsMapped).toBe(mapped.length)
    expect(seeded.stats.lampsProcedural).toBe(0)
  })

  it('fills the gaps where the map is silent', () => {
    // One lamp at one end leaves the rest of the street to the stream.
    const { stats } = propsOf(lampModel([{ x: -180, y: 8 }]))
    expect(stats.lampsMapped).toBe(1)
    expect(stats.lampsProcedural).toBeGreaterThan(0)
  })

  it('counts every mapped lamp it could not use, rather than losing it', () => {
    const { stats } = propsOf(
      lampModel([
        { x: -50, y: 9 },
        // inside the building at (0, 120)
        { x: 0, y: 120 },
        // on the centre line
        { x: 50, y: 0 },
      ])
    )
    // ★ OFFERED is not STOOD. Three lamps were offered, one stood, and the
    // other two are accounted for by name rather than lost - a counter whose
    // label does not match what it counts is how a report comes to say "520
    // stood" beside "36 refused" out of 520 offered.
    expect(stats.lampsMappedConsidered).toBe(3)
    expect(stats.lampsMapped).toBe(1)
    expect(
      stats.lampsMappedInRoad +
        stats.lampsMappedBlocked +
        stats.lampsMappedCrowded
    ).toBe(2)
    expect(
      stats.lampsMapped +
        stats.lampsMappedInRoad +
        stats.lampsMappedBlocked +
        stats.lampsMappedCrowded
    ).toBe(stats.lampsMappedConsidered)
  })
})

describe('buildCityGroup - canopy legs (CW-76)', () => {
  /** A canopy `cy` metres off an east-west secondary at y = 0. */
  function canopyModel(cy) {
    return parseCityExtract(
      {
        elements: [
          {
            type: 'way',
            id: 900,
            tags: { highway: 'secondary' },
            geometry: [pt(-80, 0), pt(80, 0)],
          },
          {
            type: 'way',
            id: 901,
            tags: { building: 'roof' },
            geometry: squareRing(0, cy, 4),
          },
        ],
      },
      { center: CENTER }
    )
  }

  it('puts legs under a canopy standing on open ground', () => {
    // 60 m off the centreline of a 12 m secondary is well clear of it.
    const { stats, dispose } = buildCityGroup(canopyModel(60))
    expect(stats.canopyColumns).toBe(4)
    expect(stats.canopyColumnsRefused).toBe(0)
    expect(stats.canopyUnsupported).toBe(0)
    dispose()
  })

  it('refuses every leg that would stand in the road, and says so', () => {
    // CW-75's law: nothing of the city stands in a roadway. A canopy across
    // a street gets NO legs rather than a post in a traffic lane, and the
    // count is the record of it - a canopy quietly left bare and one that
    // could not legally be supported look identical without it.
    const { stats, dispose } = buildCityGroup(canopyModel(0))
    expect(stats.canopyColumns).toBe(0)
    expect(stats.canopyColumnsRefused).toBe(4)
    expect(stats.canopyUnsupported).toBe(1)
    dispose()
  })

  it('thins the legs to a colonnade, not a fence', () => {
    // ★ THE RED PROOF SAID THIS GUARD DID NOT EXIST. A four-corner square
    // places a leg at every vertex with or without the spacing rule, so the
    // first version of this suite proved nothing about it. A twelve-sided
    // canopy has vertices 3.1 m apart, which is where the rule bites.
    const sides = 12
    const radiusM = 6
    const ring = []
    for (let i = 0; i <= sides; i++) {
      const a = (i / sides) * Math.PI * 2
      ring.push(pt(Math.cos(a) * radiusM, 60 + Math.sin(a) * radiusM))
    }
    const model = parseCityExtract(
      {
        elements: [
          {
            type: 'way',
            id: 930,
            tags: { highway: 'secondary' },
            geometry: [pt(-80, 0), pt(80, 0)],
          },
          { type: 'way', id: 931, tags: { building: 'roof' }, geometry: ring },
        ],
      },
      { center: CENTER }
    )
    const { stats, dispose } = buildCityGroup(model)
    expect(model.buildings[0].outer.length).toBe(sides)
    expect(stats.canopyColumns).toBe(6)
    expect(stats.canopyColumnsRefused).toBe(0)
    dispose()
  })

  it('gives a canopy sitting on a building no legs at all', () => {
    // The building under it IS the support; posts through its roof would be
    // the invention.
    const model = parseCityExtract(
      {
        elements: [
          {
            type: 'way',
            id: 910,
            tags: { building: 'yes', height: '8' },
            geometry: squareRing(0, 0, 30),
          },
          {
            type: 'way',
            id: 911,
            tags: { building: 'roof' },
            geometry: squareRing(0, 0, 8),
          },
        ],
      },
      { center: CENTER }
    )
    const { stats, dispose } = buildCityGroup(model)
    expect(stats.canopyColumns).toBe(0)
    expect(stats.canopyColumnsRefused).toBe(0)
    // Not "unsupported": the building holds it.
    expect(stats.canopyUnsupported).toBe(0)
    dispose()
  })

  it('draws the podium CW-76 put under a tower whose parts all float', () => {
    const model = parseCityExtract(
      {
        elements: [
          {
            type: 'way',
            id: 920,
            tags: { building: 'yes', height: '120' },
            geometry: squareRing(0, 0, 30),
          },
          {
            type: 'way',
            id: 921,
            tags: { 'building:part': 'yes', height: '120', min_height: '45' },
            geometry: squareRing(0, 0, 29),
          },
        ],
      },
      { center: CENTER }
    )
    const { group, stats, dispose } = buildCityGroup(model)
    const buildings = group.children.find((c) => c.name === 'buildings')
    buildings.geometry.computeBoundingBox()
    // Without the podium the mesh would start at 45 m.
    expect(buildings.geometry.boundingBox.min.z).toBe(0)
    expect(buildings.geometry.boundingBox.max.z).toBeCloseTo(120, 5)
    expect(stats.podiumsDrawn).toBe(1)
    dispose()
  })
})

describe('buildCityGroup — CW-8 distinctness', () => {
  it('buildings carry a per-vertex color attribute and vertex-color material', () => {
    const { group, dispose } = buildCityGroup(model())
    const buildings = group.children.find((c) => c.name === 'buildings')

    expect(buildings.geometry.getAttribute('color')).toBeDefined()
    expect(buildings.geometry.getAttribute('color').itemSize).toBe(3)
    expect(buildings.material.vertexColors).toBe(true)

    dispose()
  })

  it('grounded buildings get a storefront strip; elevated parts do not', () => {
    // model(): one grounded 25 m building, one min_height=4 skybridge.
    const { group, stats, dispose } = buildCityGroup(model())
    const storefronts = group.children.find((c) => c.name === 'storefronts')

    expect(storefronts).toBeDefined()
    expect(stats.storefrontTriangles).toBeGreaterThan(0)

    // The strip starts at the ground and stops at the building's OWN
    // ground-floor height - per building since CW-46, hash-drawn within
    // the documented 3.2-5.0 m range (the directive's "same size first
    // floor" complaint).
    storefronts.geometry.computeBoundingBox()
    expect(storefronts.geometry.boundingBox.min.z).toBe(0)
    expect(storefronts.geometry.boundingBox.max.z).toBeGreaterThanOrEqual(3.2)
    expect(storefronts.geometry.boundingBox.max.z).toBeLessThanOrEqual(5.0)

    // Exactly one of the two buildings qualifies, and WHICH one is the
    // claim: the grounded building spans x -5..5 and the skybridge 25..35,
    // so a strip that stopped short of 25 is the grounded one alone. CW-76
    // put legs under the skybridge, which is why this no longer counts
    // triangles against a whole-city total.
    storefronts.geometry.computeBoundingBox()
    expect(storefronts.geometry.boundingBox.max.x).toBeLessThan(25)
    expect(stats.canopyColumns).toBeGreaterThan(0)

    dispose()
  })

  it('setMapView swaps road tone and curb visibility between views', () => {
    const { group, setMapView, dispose } = buildCityGroup(model())
    const roads = group.children.find((c) => c.name === 'roads')
    const curbs = group.children.find((c) => c.name === 'curbs')

    // Street view: black surfaces, visible curb lines.
    expect(roads.material.color.getHex()).toBe(ROAD_TONES.street)
    expect(curbs).toBeDefined()
    expect(curbs.visible).toBe(true)
    // Each side of a roadway carries a curb TOP and a curb FACE (CW-50), so
    // four ribbons' worth against the one roadway ribbon.
    expect(curbs.geometry.getAttribute('position').count).toBe(
      roads.geometry.getAttribute('position').count * 4
    )

    setMapView(true)
    expect(roads.material.color.getHex()).toBe(ROAD_TONES.map)
    expect(curbs.visible).toBe(false)

    setMapView(false)
    expect(roads.material.color.getHex()).toBe(ROAD_TONES.street)
    expect(curbs.visible).toBe(true)

    dispose()
  })

  it('setCellRaster biases every textured facade material for the cell grid (CW-41)', () => {
    // The shimmer fix: facade textures are filtered for the CELL raster,
    // so the bias is log2 of the cell height and follows the character
    // size. At a cell height of 1 the filtering is exactly stock (bias 0)
    // - which is also what the bench's no-cellraster variant relies on.
    const { group, setCellRaster, dispose } = buildCityGroup(model())
    const biased = []
    group.traverse((o) => {
      if (o.isMesh && o.material?.userData?.cellLodBias) {
        biased.push(o.material)
      }
    })
    // Buildings and storefronts carry the filter; this model builds both.
    expect(biased.length).toBeGreaterThanOrEqual(2)

    setCellRaster(4)
    for (const m of biased) expect(m.userData.cellLodBias.value).toBe(2)
    setCellRaster(10)
    for (const m of biased) {
      expect(m.userData.cellLodBias.value).toBeCloseTo(Math.log2(10), 6)
    }
    setCellRaster(1)
    for (const m of biased) expect(m.userData.cellLodBias.value).toBe(0)

    dispose()
  })

  it('drives the cell raster on every surface that opts into it (D-111)', () => {
    // The test above can only see materials that already carry the uniform,
    // and it never asks WHICH ones do. A material that opts into the filter
    // and is then left out of the driven list carries a bias uniform nothing
    // ever writes: its shader says it is filtered for the cell grid while it
    // renders at stock filtering at every character size. That is how the
    // pavement shipped in CW-51, and only a check by NAME can see it.
    const { group, setCellRaster, dispose } = buildCityGroup(model())
    const opted = []
    group.traverse((o) => {
      if (o.isMesh && o.material?.userData?.cellLodBias) opted.push(o.name)
    })
    expect([...new Set(opted)].sort()).toEqual([
      'buildings',
      'ground',
      'sidewalks',
      'storefronts',
    ])

    setCellRaster(8)
    const undriven = []
    group.traverse((o) => {
      const bias = o.isMesh ? o.material?.userData?.cellLodBias : null
      if (bias && bias.value !== 3) undriven.push(o.name)
    })
    expect(undriven).toEqual([])

    dispose()
  })
})

describe('buildingTint', () => {
  it('is deterministic for the same building identity', () => {
    expect(buildingTint(7, 'Test Tower')).toEqual(buildingTint(7, 'Test Tower'))
    expect(buildingTint(3)).toEqual(buildingTint(3))
  })

  it('varies across buildings', () => {
    const distinct = new Set()
    for (let i = 0; i < 24; i++) {
      distinct.add(JSON.stringify(buildingTint(i, `b${i}`)))
    }
    expect(distinct.size).toBeGreaterThan(4)
  })

  it('keeps luminance inside the tier band so mono density stays readable', () => {
    for (let i = 0; i < 24; i++) {
      const [r, g, b] = buildingTint(i, `b${i}`)
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
      expect(lum).toBeGreaterThanOrEqual(0.42)
      expect(lum).toBeLessThanOrEqual(1.0)
      for (const ch of [r, g, b]) {
        expect(ch).toBeGreaterThanOrEqual(0)
        expect(ch).toBeLessThanOrEqual(1)
      }
    }
  })
})

describe('attachCityLighting', () => {
  it('adds ambient to the scene and parents the headlight to the camera', () => {
    const scene = new Scene()
    const camera = new PerspectiveCamera()
    const lighting = attachCityLighting(scene, camera)

    expect(scene.children.some((c) => c.isAmbientLight)).toBe(true)
    expect(scene.children).toContain(camera)
    expect(camera.children.some((c) => c.isDirectionalLight)).toBe(true)

    lighting.detach()
    expect(scene.children.some((c) => c.isAmbientLight)).toBe(false)
    expect(camera.children.some((c) => c.isDirectionalLight)).toBe(false)
  })

  it('setMapBoost raises ambient for the overhead view and restores it', () => {
    const scene = new Scene()
    const camera = new PerspectiveCamera()
    const lighting = attachCityLighting(scene, camera)
    const ambient = scene.children.find((c) => c.isAmbientLight)

    const street = ambient.intensity
    lighting.setMapBoost(true)
    expect(ambient.intensity).toBeGreaterThan(street)
    lighting.setMapBoost(false)
    expect(ambient.intensity).toBe(street)

    lighting.detach()
  })

  /**
   * D-74. The drift used to be read straight off the session clock, so it
   * only ran while it was raining and was wherever that clock had reached
   * whenever it was next asked. Two things went wrong: a shower that ended on
   * a murky night left the murk there for good, and the next shower snapped
   * the fog to a thickness nothing had walked into.
   */
  describe('fog drift (D-74)', () => {
    const lit = () => {
      const scene = new Scene()
      const lighting = attachCityLighting(scene, new PerspectiveCamera())
      return { lighting, timing: lighting.weatherTiming }
    }

    it('resuming reproduces the fog that is on screen, at every thickness', () => {
      const { lighting } = lit()
      for (const density of [0, 0.13, 0.5, 0.87, 1]) {
        lighting.setFogDensity(density)
        const before = lighting.getFogFar()
        // Anchor at an arbitrary point on the clock, then ask for that very
        // instant back: the first driven frame must not move the fog at all.
        lighting.beginFogDrift(1234567)
        lighting.stepFogDrift(1234567)
        expect(lighting.getFogFar()).toBeCloseTo(before, 6)
      }
    })

    it('resumes on the thickening branch, so fog that was closing in keeps closing in', () => {
      const { lighting, timing } = lit()
      lighting.setFogDensity(0.5)
      lighting.beginFogDrift(0)
      const half = lighting.getFogFar()
      lighting.stepFogDrift(timing.fogDriftPeriodMs * 0.05)
      expect(lighting.getFogFar()).toBeLessThan(half)
    })

    it('never leaves the clear/murky band, whatever the clock says', () => {
      const { lighting, timing } = lit()
      lighting.beginFogDrift(0)
      for (let t = -timing.fogDriftPeriodMs; t <= timing.fogDriftPeriodMs * 3; t += 5000) {
        lighting.stepFogDrift(t)
        expect(lighting.getFogFar()).toBeGreaterThanOrEqual(timing.fogFarMurky - 1e-9)
        expect(lighting.getFogFar()).toBeLessThanOrEqual(timing.fogFarClear + 1e-9)
      }
    })

    it('a shower that ends on a murky night hands back a clear one', () => {
      const { lighting, timing } = lit()
      lighting.beginFogDrift(0)
      lighting.stepFogDrift(timing.fogDriftPeriodMs / 2)
      expect(lighting.getFogFar()).toBeCloseTo(timing.fogFarMurky, 6)

      // What the controller does when the rain goes off.
      lighting.setFogDensity(0)
      expect(lighting.getFogFar()).toBe(timing.fogFarClear)
    })
  })
})

// ---------------------------------------------------------------------------
// Street props (CW-16)
// ---------------------------------------------------------------------------

/**
 * Two far-apart buildings set the playable bounds (props are culled to the
 * building core), one straight residential road along y = 0 carries the
 * infill and the parked cars, and one mapped OSM tree sits at (10, 6).
 */
function propsModel(extraElements = []) {
  return parseCityExtract(
    {
      elements: [
        {
          type: 'way',
          id: 1,
          tags: { building: 'yes', height: '20' },
          geometry: squareRing(-60, -60, 6),
        },
        {
          type: 'way',
          id: 2,
          tags: { building: 'yes', height: '20' },
          geometry: squareRing(60, 60, 6),
        },
        {
          type: 'way',
          id: 3,
          tags: { highway: 'residential' },
          geometry: [pt(-50, 0), pt(50, 0)],
        },
        { type: 'node', id: 4, tags: { natural: 'tree' }, ...pt(10, 6) },
        ...extraElements,
      ],
    },
    { center: CENTER }
  )
}

function positionsOf(group, name) {
  const mesh = group.children.find((c) => c.name === name)
  return mesh ? mesh.geometry.getAttribute('position').array : null
}

/** Any vertex of the named mesh within `tol` meters of (x, y) in plan. */
function hasVertexNear(group, name, x, y, tol) {
  const a = positionsOf(group, name)
  if (!a) return false
  for (let i = 0; i < a.length; i += 3) {
    if (Math.hypot(a[i] - x, a[i + 1] - y) <= tol) return true
  }
  return false
}

/** Any vertex of the named mesh inside the axis-aligned rect. */
function hasVertexInRect(group, name, minX, minY, maxX, maxY) {
  const a = positionsOf(group, name)
  if (!a) return false
  for (let i = 0; i < a.length; i += 3) {
    if (a[i] >= minX && a[i] <= maxX && a[i + 1] >= minY && a[i + 1] <= maxY) {
      return true
    }
  }
  return false
}

describe('buildStreetProps (CW-16)', () => {
  it('plants the trees the map actually records', () => {
    const m = propsModel()
    const props = buildStreetProps(m, buildCollisionGrid(m))

    expect(props.stats.treeCount).toBeGreaterThan(0)
    // The mapped tree is 6 m off the centerline; the procedural infill line
    // sits on the curb at 4.2 m, so a trunk out at y = 6 can only be the
    // OSM one.
    expect(hasVertexNear(props.group, 'tree-trunks', 10, 6, 0.5)).toBe(true)
    expect(props.stats.mappedTreeCount).toBe(1)

    props.dispose()
  })

  it('walks under the leaves but not through the trunk', () => {
    // CW-94: the blob crown became the ring-branch system, and the law this
    // case holds did not move - CW-16's walk-under rule now binds the LEAF
    // CUBES (constraint e): no cube's underside below CANOPY_BASE_MIN_M.
    // Branches may pass lower, bare - a bare member is not a wall of leaves
    // at head height - and only the trunk blocks a cane.
    const m = propsModel()
    const props = buildStreetProps(m, buildCollisionGrid(m))
    const trunks = props.group.children.find((c) => c.name === 'tree-trunks')
    const leaves = props.group.children.find((c) => c.name === 'tree-leaves')

    trunks.geometry.computeBoundingBox()
    leaves.geometry.computeBoundingBox()
    expect(trunks.geometry.boundingBox.min.z).toBeCloseTo(0, 5)
    // Eye height is 1.7 m: every leaf cube starts above it.
    expect(leaves.geometry.boundingBox.min.z).toBeGreaterThan(1.9)

    props.dispose()
  })

  it('parks cars parallel to the curb, inside the curb line', () => {
    const m = propsModel()
    const props = buildStreetProps(m, buildCollisionGrid(m))
    const cars = props.group.children.find((c) => c.name === 'cars')

    expect(props.stats.carCount).toBeGreaterThan(0)
    expect(cars).toBeDefined()
    const a = cars.geometry.getAttribute('position').array
    let maxAbsY = 0
    let minAbsY = Infinity
    let maxZ = 0
    for (let i = 0; i < a.length; i += 3) {
      maxAbsY = Math.max(maxAbsY, Math.abs(a[i + 1]))
      minAbsY = Math.min(minAbsY, Math.abs(a[i + 1]))
      maxZ = Math.max(maxZ, a[i + 2])
    }
    // Parked cars sit inside the curb ribbon, whose inner edge runs half a
    // road width in, less the 0.5 m ribbon. Derived from the width rather
    // than written out, because CW-50 moved it and will not be the last to.
    // What this catches - a car turned across the road, or parked on the
    // pavement - stays the same whatever the class is worth.
    const curbInnerM = ROAD_WIDTHS_M.residential / 2 - 0.5
    expect(maxAbsY).toBeLessThanOrEqual(curbInnerM + 1e-3)
    expect(minAbsY).toBeGreaterThan(0.4)
    // CW-46: parked cars are CLASSES now - the tallest (pickup/SUV) tops
    // out at 1.9 m and nothing exceeds the class table.
    expect(maxZ).toBeGreaterThan(1.3)
    expect(maxZ).toBeLessThanOrEqual(1.9 + 1e-3)

    props.dispose()
  })

  it('is deterministic: the same extract lays out the same street twice', () => {
    const m = propsModel()
    const a = buildStreetProps(m, buildCollisionGrid(m))
    const b = buildStreetProps(m, buildCollisionGrid(m))

    for (const name of [
      'tree-trunks',
      // CW-94: the blob crown's mesh became the ring system's two kinds.
      'tree-branches',
      'tree-leaves',
      'cars',
      'lamp-poles',
      'lamp-heads',
    ]) {
      const pa = positionsOf(a.group, name)
      const pb = positionsOf(b.group, name)
      expect(pa).not.toBeNull()
      expect(Array.from(pa)).toEqual(Array.from(pb))
    }
    expect(a.obstacles).toEqual(b.obstacles)

    a.dispose()
    b.dispose()
  })

  it('never plants a prop where a building already stands', () => {
    // A block sitting on the +y sidewalk, x in [6, 14], y in [3, 11].
    const blocker = {
      type: 'way',
      id: 7,
      tags: { building: 'yes', height: '12' },
      geometry: squareRing(10, 7, 4),
    }
    const clear = propsModel()
    const built = propsModel([blocker])

    const withoutBlocker = buildStreetProps(clear, buildCollisionGrid(clear))
    const withBlocker = buildStreetProps(built, buildCollisionGrid(built))

    // Not vacuous: that stretch of sidewalk IS furnished when it is empty.
    expect(
      hasVertexInRect(withoutBlocker.group, 'tree-trunks', 6, 3, 14, 11)
    ).toBe(true)
    expect(
      hasVertexInRect(withBlocker.group, 'tree-trunks', 6, 3, 14, 11)
    ).toBe(false)
    expect(hasVertexInRect(withBlocker.group, 'cars', 6, 3, 14, 11)).toBe(false)

    withoutBlocker.dispose()
    withBlocker.dispose()
  })

  it('hands back one obstacle per solid thing, and none per canopy', () => {
    const m = propsModel()
    const props = buildStreetProps(m, buildCollisionGrid(m))

    // Everything a walker would bump into is here: parked cars, tree trunks,
    // lamp posts, and since CW-19 the signal posts and the standing figures.
    // FROZEN TRAFFIC IS DELIBERATELY ABSENT — a car standing in a travel lane
    // is scenery, and walling off the lanes would turn the street into a maze
    // (decided and recorded in CW-19). This count is what proves that.
    expect(props.obstacles).toHaveLength(
      props.stats.carCount +
        props.stats.treeCount +
        props.stats.lampCount +
        props.trafficLights.count +
        props.peopleCount
    )
    for (const o of props.obstacles) {
      expect(Number.isFinite(o.x)).toBe(true)
      expect(Number.isFinite(o.y)).toBe(true)
      expect(o.halfLengthM).toBeGreaterThan(0)
      expect(o.halfWidthM).toBeGreaterThan(0)
      expect(Number.isFinite(o.rotationRad)).toBe(true)
    }

    props.dispose()
  })

  it('keeps the map view clean and disposes with the group', () => {
    const m = propsModel()
    const props = buildStreetProps(m, buildCollisionGrid(m))

    expect(props.group.visible).toBe(true)
    props.setMapView(true)
    expect(props.group.visible).toBe(false)
    props.setMapView(false)
    expect(props.group.visible).toBe(true)

    props.dispose()
    expect(props.group.children).toHaveLength(0)
  })

  it('survives a model with no roads and no trees', () => {
    const bare = parseCityExtract(
      {
        elements: [
          {
            type: 'way',
            id: 1,
            tags: { building: 'yes', height: '9' },
            geometry: squareRing(0, 0, 8),
          },
        ],
      },
      { center: CENTER }
    )
    const props = buildStreetProps(bare, buildCollisionGrid(bare))

    expect(props.stats.treeCount).toBe(0)
    expect(props.stats.carCount).toBe(0)
    expect(props.obstacles).toEqual([])

    props.dispose()
  })
})

// ---------------------------------------------------------------------------
// Street life, standing still (CW-18)
// ---------------------------------------------------------------------------

/** Every vertex of a named mesh, as [x, y, z] triples. */
function verticesOf(group, name) {
  const a = positionsOf(group, name)
  if (!a) return []
  const out = []
  for (let i = 0; i < a.length; i += 3) out.push([a[i], a[i + 1], a[i + 2]])
  return out
}

describe('buildStreetProps — streetlights (CW-18)', () => {
  it('marches lamps down the street, alternating sides', () => {
    const m = propsModel()
    const props = buildStreetProps(m, buildCollisionGrid(m))

    expect(props.stats.lampCount).toBeGreaterThan(1)
    const poles = verticesOf(props.group, 'lamp-poles')
    expect(poles.length).toBeGreaterThan(0)

    // The road runs along y = 0, so every pole stands 0.45 m beyond its edge
    // on one side or the other and nowhere in between (a vertex sits half the
    // 0.15 m post off that line). Derived from the class width, which CW-50
    // moved: the invariant is that poles line up on the pavement, not the
    // particular metre they line up on.
    const poleLineM = ROAD_WIDTHS_M.residential / 2 + 0.45
    const sides = new Set()
    for (const [, y] of poles) {
      expect(Math.abs(Math.abs(y) - poleLineM)).toBeLessThanOrEqual(0.076)
      sides.add(Math.sign(y))
    }
    expect(sides.size).toBe(2)

    props.dispose()
  })

  it('hangs the head above head height and out over the roadway', () => {
    const m = propsModel()
    const props = buildStreetProps(m, buildCollisionGrid(m))

    const heads = verticesOf(props.group, 'lamp-heads')
    expect(heads.length).toBeGreaterThan(0)
    for (const [, y, z] of heads) {
      // 5.8 m give or take half the head's thickness: clear of the 1.7 m eye
      // line by more than three metres.
      expect(z).toBeGreaterThan(5.7)
      expect(z).toBeLessThan(5.9)
      // Reaching back toward the centerline from the pole line.
      expect(Math.abs(y)).toBeLessThan(ROAD_WIDTHS_M.residential / 2 + 0.45)
    }

    for (const [, , z] of verticesOf(props.group, 'lamp-poles')) {
      expect(z).toBeGreaterThanOrEqual(0)
      expect(z).toBeLessThanOrEqual(6)
    }

    props.dispose()
  })

  it('blocks the pole so a walker cannot pass through it', () => {
    const m = propsModel()
    const collision = buildCollisionGrid(m)
    const props = buildStreetProps(m, collision)

    const poles = verticesOf(props.group, 'lamp-poles')
    const lampObstacles = props.obstacles.filter((o) =>
      poles.some((v) => Math.hypot(v[0] - o.x, v[1] - o.y) < 0.2)
    )
    expect(lampObstacles).toHaveLength(props.stats.lampCount)

    const spot = lampObstacles[0]
    expect(collision.isBlocked(spot.x, spot.y)).toBe(false)
    collision.blockRect(spot)
    expect(collision.isBlocked(spot.x, spot.y)).toBe(true)

    props.dispose()
  })

  it('never stands a lamp inside a building', () => {
    const blocker = {
      type: 'way',
      id: 8,
      tags: { building: 'yes', height: '12' },
      geometry: squareRing(-20, 4, 3),
    }
    const built = propsModel([blocker])
    const props = buildStreetProps(built, buildCollisionGrid(built))

    // The footprint covers x in [-23, -17], y in [1, 7] — the sidewalk line
    // at y = 3.45 runs straight through it.
    expect(hasVertexInRect(props.group, 'lamp-poles', -23, 1, -17, 7)).toBe(
      false
    )

    props.dispose()
  })
})

/** One tower, one shed, and a row of shopfronts to hang signs on. */
function dressingModel() {
  const elements = [
    {
      type: 'way',
      id: 1,
      tags: { building: 'yes', height: '60', name: 'Tower' },
      geometry: squareRing(0, 0, 12),
    },
    {
      type: 'way',
      id: 2,
      tags: { building: 'yes', height: '5', name: 'Shed' },
      geometry: squareRing(60, 0, 5),
    },
  ]
  for (let i = 0; i < 10; i++) {
    elements.push({
      type: 'way',
      id: 10 + i,
      tags: { building: 'yes', height: '9', name: 'Shop ' + i },
      geometry: squareRing(-80 + i * 16, 40, 6),
    })
  }
  return parseCityExtract({ elements }, { center: CENTER })
}

describe('buildCityGroup — signs and rooftop masts (CW-18)', () => {
  it('hangs signs on the outside of the wall, never inside the footprint', () => {
    const m = dressingModel()
    const { group, stats, dispose } = buildCityGroup(m)

    expect(stats.signCount).toBeGreaterThan(0)
    const plates = verticesOf(group, 'sign-plates')
    expect(plates.length).toBeGreaterThan(0)
    for (const [x, y] of plates) {
      for (const building of m.buildings) {
        expect(pointInRing(x, y, building.outer)).toBe(false)
      }
    }

    dispose()
  })

  it('lays a tinted face inside the plate, standing proud of it', () => {
    const m = dressingModel()
    const { group, dispose } = buildCityGroup(m)

    const zOf = (name) => verticesOf(group, name).map(([, , z]) => z)
    const plateZ = zOf('sign-plates')
    const faceZ = zOf('sign-faces')
    expect(faceZ.length).toBeGreaterThan(0)

    // The face is inset by the frame at the top and the bottom...
    expect(Math.min(...faceZ)).toBeGreaterThan(Math.min(...plateZ))
    expect(Math.max(...faceZ)).toBeLessThan(Math.max(...plateZ))

    // ...and it is the coloured one: the plate is near-neutral, so only the
    // face gives the high-contrast quantizer a hue to find.
    const spread = (name) => {
      const c = group.children.find((x) => x.name === name).geometry.attributes
        .color.array
      return Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2])
    }
    expect(spread('sign-plates')).toBeLessThan(0.01)
    expect(spread('sign-faces')).toBeGreaterThan(0.1)

    dispose()
  })

  it('puts the sign on the wall that faces the street', () => {
    // A 40 x 24 m block: the long walls run north-south along x = ±20, the
    // short ones east-west along y = ±12, and the only road runs past the
    // SHORT south wall. Both clear the length rule, so the street decides.
    const withRoad = parseCityExtract(
      {
        elements: [
          {
            type: 'way',
            id: 1,
            tags: { building: 'yes', height: '40', name: 'Block' },
            geometry: [
              pt(-20, -12),
              pt(20, -12),
              pt(20, 12),
              pt(-20, 12),
              pt(-20, -12),
            ],
          },
          {
            type: 'way',
            id: 2,
            tags: { highway: 'secondary' },
            geometry: [pt(-60, -20), pt(60, -20)],
          },
        ],
      },
      { center: CENTER }
    )
    const { group, dispose } = buildCityGroup(withRoad)
    const plates = verticesOf(group, 'sign-plates')
    expect(plates.length).toBeGreaterThan(0)
    for (const [, y] of plates) {
      // Hanging off the south wall, on the road side of it.
      expect(y).toBeLessThan(-12)
    }
    dispose()
  })

  it('gives masts to the tower and none to the shed', () => {
    const m = dressingModel()
    const { group, stats, dispose } = buildCityGroup(m)

    expect(stats.antennaCount).toBeGreaterThan(0)
    const masts = verticesOf(group, 'antennas')
    expect(masts.length).toBeGreaterThan(0)
    for (const [x, y, z] of masts) {
      // Only the 60 m tower clears the cutoff, so every mast stands on its
      // roof and inside its footprint.
      expect(z).toBeGreaterThanOrEqual(60)
      expect(Math.abs(x)).toBeLessThanOrEqual(12)
      expect(Math.abs(y)).toBeLessThanOrEqual(12)
    }

    dispose()
  })

  it('leaves a city of sheds undressed', () => {
    const sheds = parseCityExtract(
      {
        elements: [
          {
            type: 'way',
            id: 1,
            tags: { building: 'yes', height: '3' },
            geometry: squareRing(0, 0, 5),
          },
          {
            type: 'way',
            id: 2,
            tags: { building: 'yes', height: '3.2' },
            geometry: squareRing(30, 0, 5),
          },
        ],
      },
      { center: CENTER }
    )
    const { group, stats, dispose } = buildCityGroup(sheds)

    expect(stats.signCount).toBe(0)
    expect(stats.antennaCount).toBe(0)
    const names = group.children.map((c) => c.name)
    expect(names).not.toContain('sign-plates')
    expect(names).not.toContain('antennas')

    dispose()
  })

  it('hides the dressing overhead and restores it in the street', () => {
    const { group, setMapView, dispose } = buildCityGroup(dressingModel())
    const dressing = ['sign-plates', 'sign-faces', 'antennas'].map((n) =>
      group.children.find((c) => c.name === n)
    )
    expect(dressing.every(Boolean)).toBe(true)

    setMapView(true)
    for (const mesh of dressing) expect(mesh.visible).toBe(false)
    setMapView(false)
    for (const mesh of dressing) expect(mesh.visible).toBe(true)

    dispose()
  })

  it('is deterministic: the same city dresses itself the same way twice', () => {
    const m = dressingModel()
    const a = buildCityGroup(m)
    const b = buildCityGroup(m)

    for (const name of ['sign-plates', 'sign-faces', 'antennas']) {
      expect(Array.from(positionsOf(a.group, name))).toEqual(
        Array.from(positionsOf(b.group, name))
      )
    }
    expect(a.stats.signCount).toBe(b.stats.signCount)
    expect(a.stats.antennaCount).toBe(b.stats.antennaCount)

    a.dispose()
    b.dispose()
  })
})

describe('buildCityGroup — CW-24 the far city', () => {
  /**
   * The fog fades to BLACK, and only exact black reads as an empty cell, so
   * every tower past 260 m was being deleted from the picture rather than
   * pushed into the distance. Buildings now keep a floor of their own tone at
   * any range; everything else must still vanish, because a dim carpet across
   * the lower half of the frame is the recorded round-1 failure.
   */
  const shaderFor = (material) => {
    const shader = {
      uniforms: {},
      fragmentShader:
        '#include <fog_pars_fragment>\nvoid main(){\n#include <fog_fragment>\n}',
    }
    material.onBeforeCompile(shader)
    return shader
  }

  it('gives the buildings a fog floor, and nothing else one', () => {
    const { group, dispose } = buildCityGroup(model())

    const buildings = group.children.find((c) => c.name === 'buildings')
    expect(typeof buildings.material.onBeforeCompile).toBe('function')

    for (const name of ['ground', 'roads', 'curbs']) {
      const mesh = group.children.find((c) => c.name === name)
      if (!mesh) continue
      // An untouched material has three.js's own empty hook.
      const patched = shaderFor(mesh.material)
      expect(
        patched.uniforms.uMaxFogFactor,
        `${name} must keep the stock fog and fade to black`
      ).toBeUndefined()
    }

    dispose()
  })

  it('clamps the fog factor below one, so far faces keep some tone', () => {
    const { group, dispose } = buildCityGroup(model())
    const buildings = group.children.find((c) => c.name === 'buildings')
    const shader = shaderFor(buildings.material)

    expect(shader.uniforms.uMaxFogFactor).toBeDefined()
    const max = shader.uniforms.uMaxFogFactor.value
    // Exactly 1 would be the stock fog: fully faded, i.e. exactly black,
    // i.e. an empty cell — the whole defect this release exists to fix.
    expect(max).toBeGreaterThan(0)
    expect(max).toBeLessThan(1)
    // The floor is a silhouette, not a haze: most of the fade must survive.
    expect(max).toBeGreaterThan(0.5)

    expect(shader.fragmentShader).toContain('uniform float uMaxFogFactor;')
    expect(shader.fragmentShader).toContain('min( fogFactor, uMaxFogFactor )')
    // The clamp has to come BEFORE the mix, or it changes nothing.
    expect(shader.fragmentShader.indexOf('min( fogFactor')).toBeLessThan(
      shader.fragmentShader.indexOf('mix( gl_FragColor.rgb, fogColor')
    )

    dispose()
  })

  it('keeps a distinct program cache key so the patch cannot be shared away', () => {
    const { group, dispose } = buildCityGroup(model())
    const buildings = group.children.find((c) => c.name === 'buildings')
    expect(typeof buildings.material.customProgramCacheKey).toBe('function')
    expect(buildings.material.customProgramCacheKey()).toContain(
      'farSilhouette'
    )
    dispose()
  })
})

describe('buildCityGroup — CW-25 letter-family facades', () => {
  it('splits the buildings into one mesh per facade family', () => {
    const { group, dispose } = buildCityGroup(model())
    const meshes = group.children.filter((c) => c.name === 'buildings')
    // The texture is a property of the material, so a facade look needs a
    // mesh to carry it. Every one of them keeps the name the surface-class
    // pass and the map-view swap both key on.
    expect(meshes.length).toBeGreaterThan(1)
    // Textures are painted on a canvas, which this environment does not have,
    // so they all come back null here. What CAN be asserted without a canvas
    // is that each family got its own material to hang a texture on.
    const materials = meshes.map((m) => m.material)
    expect(new Set(materials).size, 'two families share a material').toBe(
      materials.length
    )
    const maps = materials.map((m) => m.map).filter(Boolean)
    expect(new Set(maps).size, 'two families share a texture').toBe(maps.length)
    dispose()
  })

  it('keeps every building, and counts them all exactly once', () => {
    const { group, stats, dispose } = buildCityGroup(model())
    const meshes = group.children.filter((c) => c.name === 'buildings')
    const tris = meshes.reduce(
      (n, m) => n + m.geometry.getAttribute('position').count / 3,
      0
    )
    // Splitting geometry across meshes must not lose or duplicate any of it.
    expect(tris).toBe(stats.buildingTriangles)
    expect(tris).toBeGreaterThan(0)
    dispose()
  })

  it('gives a building the same facade every time the city is built', () => {
    const a = buildCityGroup(model())
    const b = buildCityGroup(model())
    const shape = (r) =>
      r.group.children
        .filter((c) => c.name === 'buildings')
        .map((m) => m.geometry.getAttribute('position').count)
    // Facade choice rides the same hash as the colour, so a tower keeps both
    // for as long as the extract does.
    expect(shape(a)).toEqual(shape(b))
    a.dispose()
    b.dispose()
  })

  it('strips the facade textures in map view and puts them back', () => {
    const { group, setMapView, dispose } = buildCityGroup(model())
    const meshes = group.children.filter((c) => c.name === 'buildings')
    const before = meshes.map((m) => m.material.map)

    setMapView(true)
    for (const m of meshes) expect(m.material.map).toBeNull()

    setMapView(false)
    expect(meshes.map((m) => m.material.map)).toEqual(before)
    dispose()
  })
})

describe('trafficLightState (CW-19)', () => {
  it('runs green, then amber, then red, and comes back round', () => {
    const seen = new Set()
    for (let t = 0; t < 20000; t += 100) seen.add(trafficLightState(t, 0))
    expect([...seen].sort()).toEqual(['amber', 'green', 'red'])
  })

  it('holds every state for at least two seconds', () => {
    // A state SWAP, never a strobe: WCAG 2.3.1 stays untriggered because
    // nothing here can change faster than this.
    let last = trafficLightState(0, 0)
    let since = 0
    for (let t = 100; t <= 60000; t += 100) {
      const now = trafficLightState(t, 0)
      if (now !== last) {
        expect(since, `${last} lasted only ${since} ms`).toBeGreaterThanOrEqual(
          2000
        )
        last = now
        since = 0
      }
      since += 100
    }
  })

  it('never lets both phases show green at once', () => {
    // The whole point of a phase group: when this street goes, the cross
    // street stops.
    for (let t = 0; t < 30000; t += 50) {
      const a = trafficLightState(t, 0)
      const b = trafficLightState(t, 1)
      expect(
        a === 'green' && b === 'green',
        `both phases green at ${t} ms`
      ).toBe(false)
      // Nor may both be mid-change at the same moment.
      expect(a === 'amber' && b === 'amber').toBe(false)
    }
  })

  it('is stable for a negative or huge elapsed time', () => {
    expect(['red', 'amber', 'green']).toContain(trafficLightState(-5000, 0))
    expect(['red', 'amber', 'green']).toContain(trafficLightState(1e9, 1))
  })
})

describe('buildRain (CW-20)', () => {
  const drops = (rain) => rain.group.children.filter((m) => m.visible)

  it('starts dry, and shows more drops the heavier it gets', () => {
    const rain = buildRain()
    expect(rain.group.visible).toBe(false)
    expect(drops(rain)).toHaveLength(0)

    rain.setLevel(0)
    const light = drops(rain).length
    rain.setLevel(1)
    const heavy = drops(rain).length
    expect(light).toBeGreaterThan(0)
    expect(heavy).toBeGreaterThan(light)

    rain.setLevel(null)
    expect(rain.group.visible).toBe(false)
    expect(drops(rain)).toHaveLength(0)
    rain.dispose()
  })

  it('recycles drops instead of allocating them', () => {
    // The pool is built once at the heaviest size and only ever changes which
    // drops are VISIBLE, so switching intensity mid-storm cannot stutter.
    const rain = buildRain()
    const total = rain.group.children.length
    rain.setLevel(0)
    rain.update(0.1, 0, 0)
    rain.setLevel(1)
    rain.update(0.1, 0, 0)
    expect(rain.group.children).toHaveLength(total)
    rain.dispose()
  })

  it('lifts a drop back to the top once it has fallen through', () => {
    const rain = buildRain()
    rain.setLevel(0)
    // Long enough that every drop must have passed the bottom at least once.
    for (let i = 0; i < 60; i++) rain.update(0.1, 0, 0)
    for (const m of drops(rain)) {
      expect(m.position.z).toBeGreaterThan(0)
    }
    rain.dispose()
  })

  it('keeps the rain around the player instead of leaving it behind', () => {
    const rain = buildRain()
    rain.setLevel(0)
    rain.update(0.016, 0, 0)
    rain.update(0.016, 400, -250)
    // The box follows, so a player who walks across the city is still in it.
    expect(rain.group.position.x).toBe(400)
    expect(rain.group.position.y).toBe(-250)
    for (const m of drops(rain)) {
      expect(Math.abs(m.position.x)).toBeLessThanOrEqual(40)
      expect(Math.abs(m.position.y)).toBeLessThanOrEqual(40)
    }
    rain.dispose()
  })

  it('does nothing at all while it is not raining', () => {
    const rain = buildRain()
    const before = rain.group.children.map((m) => m.position.z)
    rain.update(1, 10, 10)
    expect(rain.group.children.map((m) => m.position.z)).toEqual(before)
    rain.dispose()
  })
})

describe('street furniture props (CW-43)', () => {
  // Nodes stand a pavement's width off the E-W residential road at y=0.
  const furnitureModel = (extra = []) =>
    propsModel([
      {
        type: 'node',
        id: 100,
        tags: { highway: 'bus_stop', shelter: 'yes' },
        ...pt(15, 6),
      },
      {
        type: 'node',
        id: 101,
        tags: { amenity: 'bench', backrest: 'yes' },
        ...pt(-15, 6),
      },
      { type: 'node', id: 102, tags: { amenity: 'waste_basket' }, ...pt(0, 7) },
      {
        type: 'node',
        id: 103,
        tags: { amenity: 'bicycle_parking' },
        ...pt(25, 6),
      },
      {
        type: 'node',
        id: 104,
        tags: { emergency: 'fire_hydrant' },
        ...pt(-25, 6),
      },
      ...extra,
    ])

  it('stands every class at its true node position, typed and counted', () => {
    const m = furnitureModel()
    const props = buildStreetProps(m, buildCollisionGrid(m))

    expect(props.stats.furnitureByKind).toEqual({
      bus_stop: 1,
      bench: 1,
      waste_basket: 1,
      bicycle_parking: 1,
      fire_hydrant: 1,
    })
    expect(hasVertexNear(props.group, 'bus-stop-poles', 15, 6, 0.8)).toBe(true)
    expect(hasVertexNear(props.group, 'benches', -15, 6, 1.2)).toBe(true)
    expect(hasVertexNear(props.group, 'waste-baskets', 0, 7, 0.5)).toBe(true)
    expect(hasVertexNear(props.group, 'bike-racks', 25, 6, 0.8)).toBe(true)
    expect(hasVertexNear(props.group, 'hydrants', -25, 6, 0.4)).toBe(true)

    props.dispose()
  })

  it('gives the sheltered stop its shelter, and only then', () => {
    const withShelter = furnitureModel()
    const p1 = buildStreetProps(withShelter, buildCollisionGrid(withShelter))
    expect(p1.group.children.some((c) => c.name === 'bus-stop-shelters')).toBe(
      true
    )
    p1.dispose()

    const bare = propsModel([
      { type: 'node', id: 100, tags: { highway: 'bus_stop' }, ...pt(15, 6) },
    ])
    const p2 = buildStreetProps(bare, buildCollisionGrid(bare))
    expect(p2.group.children.some((c) => c.name === 'bus-stop-poles')).toBe(
      true
    )
    expect(p2.group.children.some((c) => c.name === 'bus-stop-shelters')).toBe(
      false
    )
    p2.dispose()
  })

  it('faces the street: the bench lies along the road, the rack across it', () => {
    const m = furnitureModel()
    const props = buildStreetProps(m, buildCollisionGrid(m))

    // The road runs E-W. A bench's long side follows it; a staple rack's
    // hoop stands across it.
    const bench = positionsOf(props.group, 'benches')
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (let i = 0; i < bench.length; i += 3) {
      minX = Math.min(minX, bench[i])
      maxX = Math.max(maxX, bench[i])
      minY = Math.min(minY, bench[i + 1])
      maxY = Math.max(maxY, bench[i + 1])
    }
    expect(maxX - minX).toBeGreaterThan(1.5)
    expect(maxY - minY).toBeLessThan(0.8)

    const rack = positionsOf(props.group, 'bike-racks')
    let rMinX = Infinity
    let rMaxX = -Infinity
    let rMinY = Infinity
    let rMaxY = -Infinity
    for (let i = 0; i < rack.length; i += 3) {
      rMinX = Math.min(rMinX, rack[i])
      rMaxX = Math.max(rMaxX, rack[i])
      rMinY = Math.min(rMinY, rack[i + 1])
      rMaxY = Math.max(rMaxY, rack[i + 1])
    }
    expect(rMaxY - rMinY).toBeGreaterThan(0.7)
    expect(rMaxX - rMinX).toBeLessThan(0.3)

    props.dispose()
  })

  it('every prop is solid: the obstacles carry each footprint', () => {
    const m = furnitureModel()
    const props = buildStreetProps(m, buildCollisionGrid(m))

    const near = (x, y) =>
      props.obstacles.filter((o) => Math.hypot(o.x - x, o.y - y) < 1.6)
    // The stop contributes its pole AND its shelter.
    expect(near(15, 6).length).toBeGreaterThanOrEqual(2)
    expect(near(-15, 6).length).toBeGreaterThanOrEqual(1) // bench
    expect(near(0, 7).length).toBeGreaterThanOrEqual(1) // basket
    expect(near(-25, 6).length).toBeGreaterThanOrEqual(1) // hydrant
    // The bench's footprint is the seat, rotated with the street.
    const benchOb = near(-15, 6)[0]
    expect(benchOb.halfLengthM).toBeCloseTo(0.9, 5)
    expect(benchOb.halfWidthM).toBeCloseTo(0.25, 5)

    props.dispose()
  })

  it('collapses duplicate nodes and yields to a mapped tree', () => {
    const m = propsModel([
      { type: 'node', id: 100, tags: { amenity: 'bench' }, ...pt(15, 6) },
      { type: 'node', id: 101, tags: { amenity: 'bench' }, ...pt(15.2, 6) },
      { type: 'node', id: 102, tags: { natural: 'tree' }, ...pt(-15, 6) },
      { type: 'node', id: 103, tags: { amenity: 'bench' }, ...pt(-15.1, 6) },
    ])
    const props = buildStreetProps(m, buildCollisionGrid(m))
    // Two nodes for one bench are one bench; a bench under a mapped tree is
    // no bench at all - both are real data, and the tree planted first.
    expect(props.stats.furnitureByKind).toEqual({ bench: 1 })
    props.dispose()
  })

  it('a model with no furniture builds exactly as before', () => {
    const m = propsModel()
    const props = buildStreetProps(m, buildCollisionGrid(m))
    expect(props.stats.furnitureCount).toBe(0)
    expect(props.group.children.some((c) => c.name === 'benches')).toBe(false)
    props.dispose()
  })
})

describe('cars are cars (CW-46, CW-Q46)', () => {
  it('ships the signed class table exactly, weights summing to 100', async () => {
    const { CAR_CLASSES } = await import('../../../src/js/game/city-scene.js')
    expect(CAR_CLASSES.map((c) => [c.kind, c.lenM, c.widM, c.hM])).toEqual([
      ['pickup', 5.8, 2.0, 1.9],
      ['suv', 5.0, 1.98, 1.9],
      ['crossover', 4.6, 1.85, 1.65],
      ['sedan', 4.9, 1.85, 1.45],
      ['hatch', 4.4, 1.8, 1.5],
      ['minivan', 5.2, 2.0, 1.75],
    ])
    expect(CAR_CLASSES.reduce((s, c) => s + c.weight, 0)).toBe(100)
  })

  it('picks classes deterministically across the whole draw range', async () => {
    const { pickCarClass, CAR_CLASSES } = await import(
      '../../../src/js/game/city-scene.js'
    )
    expect(pickCarClass(0).kind).toBe('pickup')
    expect(pickCarClass(0.9999).kind).toBe('minivan')
    // Every class is reachable, and the same draw always answers the same.
    const seen = new Set()
    for (let i = 0; i < 1000; i++) {
      const cls = pickCarClass(i / 1000)
      expect(pickCarClass(i / 1000)).toBe(cls)
      seen.add(cls.kind)
    }
    expect(seen.size).toBe(CAR_CLASSES.length)
  })

  it('stamps each parked car with its own class footprint, and no two overlap along the curb', () => {
    const m = propsModel()
    const props = buildStreetProps(m, buildCollisionGrid(m))
    const legalHalves = new Set([2.9, 2.5, 2.3, 2.45, 2.2, 2.6])
    const cars = props.obstacles.filter((o) => o.halfLengthM > 1.5)
    expect(cars.length).toBeGreaterThan(0)
    for (const car of cars) {
      expect(legalHalves.has(Math.round(car.halfLengthM * 100) / 100)).toBe(
        true
      )
    }
    // Along the (x-axis) road, successive parked footprints keep clear of
    // one another - a 5.8 m pickup in the old 6 m slots would not have.
    const sameSide = (side) =>
      cars
        .filter((o) => Math.sign(o.y) === side && Math.abs(o.rotationRad) < 0.1)
        .sort((a, b) => a.x - b.x)
    for (const side of [-1, 1]) {
      const row = sameSide(side)
      for (let i = 1; i < row.length; i++) {
        const gap =
          row[i].x -
          row[i - 1].x -
          row[i].halfLengthM -
          row[i - 1].halfLengthM
        expect(gap).toBeGreaterThanOrEqual(0)
      }
    }
    props.dispose()
  })
})

describe('figure tones follow the colour scheme (CW-49)', () => {
  // sRGB luma, the same weights tintOf balances against.
  const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b
  const HUES = [0, 30, 60, 120, 180, 270, 300, 330]

  it('keeps a tone at its tier for EVERY hue, which is what mono reads', () => {
    // tintOf holds luminance at the tier by moving channels apart, but it
    // clamps, and a clamped channel silently breaks that. The monochrome
    // schemes have only luminance to go on, so a tone that drifts off its
    // tier moves them - which the head tone must never do.
    for (const tier of [0.45, 0.65, 0.82, 0.9]) {
      for (const hue of HUES) {
        const c = inGamutChroma(tier, hue, 0.5)
        expect(c, `tier ${tier} hue ${hue}`).toBeLessThanOrEqual(0.5)
        expect(lum(tintOf(tier, hue, c)), `tier ${tier} hue ${hue}`).toBeCloseTo(
          tier,
          12
        )
      }
    }
  })

  it('shows that the unlimited chroma really would have drifted', () => {
    // The control for the test above: without the limit, a warm hue at the
    // head tier lands measurably off its tier. A guard nobody has watched
    // fail is a guard nobody should trust.
    const drifted = lum(tintOf(0.82, 0, 0.5))
    expect(drifted).toBeLessThan(0.8)
    expect(lum(tintOf(0.82, 0, inGamutChroma(0.82, 0, 0.5)))).toBeCloseTo(
      0.82,
      12
    )
  })

  it('gives a spot the same hue every time, and spreads hues over spots', () => {
    // The head hue comes from the spot, not from a draw on the shared prop
    // stream, so it must be stable per spot and varied across them.
    expect(hashSpot(12.5, -8.25)).toBe(hashSpot(12.5, -8.25))
    expect(hashSpot(12.5, -8.25)).not.toBe(hashSpot(-8.25, 12.5))

    const seen = new Map()
    for (let i = 0; i < 4000; i++) {
      const h = HUES[hashSpot(i * 0.37, i * -0.61) % HUES.length]
      seen.set(h, (seen.get(h) ?? 0) + 1)
    }
    expect(seen.size).toBe(HUES.length)
    for (const [hue, n] of seen) {
      // Even coverage would be 500; this only rejects a hash that collapses.
      expect(n, `hue ${hue} drawn ${n} times`).toBeGreaterThan(200)
    }
  })
})

describe('road lines (CW-51)', () => {
  /** A long arterial and a long residential, on one model. */
  function linesModel() {
    return parseCityExtract(
      {
        elements: [
          {
            type: 'way',
            id: 1,
            tags: { building: 'yes', height: '12' },
            geometry: squareRing(-90, -90, 5),
          },
          {
            type: 'way',
            id: 2,
            tags: { highway: 'primary' },
            geometry: [pt(-60, 0), pt(60, 0)],
          },
          {
            type: 'way',
            id: 3,
            tags: { highway: 'residential' },
            geometry: [pt(-60, 40), pt(60, 40)],
          },
        ],
      },
      { center: CENTER }
    )
  }

  const lineMesh = (group) =>
    group.children.find((c) => c.name === 'road-lines')

  it('paints arterials and leaves residential streets bare', () => {
    const { group, dispose } = buildCityGroup(linesModel())
    const lines = lineMesh(group)
    expect(lines, 'the arterial got no paint at all').toBeDefined()

    // Every painted vertex sits on the arterial at y=0, never on the
    // residential street at y=40. OpenStreetMap carries no road_marking tags
    // in any baked circle, so the CLASS is the only signal there is, and this
    // is what pins that it is being read.
    const a = lines.geometry.getAttribute('position').array
    let maxAbsY = 0
    for (let i = 0; i < a.length; i += 3) {
      maxAbsY = Math.max(maxAbsY, Math.abs(a[i + 1]))
    }
    expect(maxAbsY).toBeLessThan(1)

    dispose()
  })

  it('dashes rather than running an unbroken stripe', () => {
    const { group, dispose } = buildCityGroup(linesModel())
    const a = lineMesh(group).geometry.getAttribute('position').array
    // Total painted length along the road, from the triangles themselves.
    // Two triangles per dash, six vertices; the run is the x-spread.
    let painted = 0
    for (let i = 0; i + 17 < a.length; i += 18) {
      let lo = Infinity
      let hi = -Infinity
      for (let v = 0; v < 6; v++) {
        const x = a[i + v * 3]
        lo = Math.min(lo, x)
        hi = Math.max(hi, x)
      }
      painted += hi - lo
    }
    // The arterial is 120 m long and the skip line is 3 m painted in every
    // 12 m, so about a quarter of it carries paint. A builder that forgot to
    // leave gaps would report the whole 120.
    expect(painted).toBeGreaterThan(20)
    expect(painted).toBeLessThan(45)

    dispose()
  })

  it('lies flat on the roadway, below the pavement it runs between', () => {
    const { group, dispose } = buildCityGroup(linesModel())
    const a = lineMesh(group).geometry.getAttribute('position').array
    for (let i = 2; i < a.length; i += 3) {
      // Paint is on the road, which CW-50 cut a curb's depth below pavement.
      expect(a[i]).toBeLessThan(0)
    }
    dispose()
  })
})

describe('per-city paving (CW-51, CW-Q51)', () => {
  it('gives each city the finish its own municipality specifies', () => {
    // Two of these are the owner's words and two were fetched from the
    // cities' own standards. Denver and Burnaby SHARE a finish because they
    // genuinely specify the same one - Denver Parks and Recreation requires a
    // broom finish on all concrete walkways, and Burnaby's Supplementary
    // Specifications adopt MMCD 03 30 20, which specifies broom finish too.
    // Inventing a difference so four cities looked four ways would have been
    // the dishonest option, so this pins the sharing on purpose.
    expect(CITY_PAVING.seattle).toBe('aggregate')
    expect(CITY_PAVING.albuquerque).toBe('cracked')
    expect(CITY_PAVING.denver).toBe('broom')
    expect(CITY_PAVING.burnaby).toBe('broom')
    expect(CITY_PAVING.denver).toBe(CITY_PAVING.burnaby)
  })

  it('carries the city name out of the extract so the scene can read it', () => {
    // The extract has always had it; the model was dropping it on the floor.
    const named = parseCityExtract(
      { name: 'denver', elements: [] },
      { center: CENTER }
    )
    expect(named.name).toBe('denver')
    // An extract without one still parses, and the scene falls back.
    expect(parseCityExtract({ elements: [] }, { center: CENTER }).name).toBeNull()
  })

  it('gives pavements real-world UVs so paving keeps one scale', () => {
    const { group, dispose } = buildCityGroup(model())
    const walks = group.children.find((c) => c.name === 'sidewalks')
    expect(walks, 'the model grew no pavement').toBeDefined()

    const uv = walks.geometry.getAttribute('uv')
    expect(uv, 'pavements have no UVs, so no paving can land on them').toBeDefined()
    expect(uv.count).toBe(walks.geometry.getAttribute('position').count)

    // UVs are in METRES along the ribbon, not normalized 0..1: the road in
    // this fixture is 100 m long, so v has to run far past 1. Normalized UVs
    // would stretch one paving tile over a whole street.
    let maxV = 0
    for (let i = 0; i < uv.count; i++) maxV = Math.max(maxV, uv.getY(i))
    expect(maxV).toBeGreaterThan(50)

    dispose()
  })
})


/**
 * CW-53: twenty ground floors instead of five, and the map data decides which
 * one a corner wears wherever the map knows.
 *
 * The band index is baked into every storefront's UVs, so it can be read back
 * out of the built geometry - which is what these cases do rather than
 * trusting the table they are meant to be guarding.
 */
describe('buildCityGroup — twenty storefront bands (CW-53)', () => {
  const STOREFRONT_HEIGHT_M = 3.5

  /** One building, optionally with a POI node beside it and its own tags. */
  function oneBuilding({ buildingTags = { building: 'yes', height: '25' }, poi } = {}) {
    const elements = [
      { type: 'way', id: 1, tags: buildingTags, geometry: squareRing(0, 0, 5) },
      {
        type: 'way',
        id: 3,
        tags: { highway: 'residential' },
        geometry: [pt(-50, 20), pt(50, 20)],
      },
    ]
    if (poi) {
      const [x, y] = poi.at ?? [8, 0]
      elements.push({ type: 'node', id: 900, tags: poi.tags, ...pt(x, y) })
    }
    return parseCityExtract({ elements }, { center: CENTER })
  }

  /**
   * The band a built city put its one storefront on.
   *
   * The band is applied as a UV OFFSET of band x STOREFRONT_HEIGHT_M, and the
   * strip's own v is centred on zero for a building at the origin - so it is
   * the CENTRE of the v range that names the band, not its minimum. Measured:
   * a bakery node beside this fixture puts the range at 57.53..68.47, whose
   * centre is exactly 18 x 3.5.
   */
  function bandOf(m) {
    const { group, dispose } = buildCityGroup(m)
    const mesh = group.children.find((c) => c.name === 'storefronts')
    expect(mesh, 'this fixture grew no storefront at all').toBeDefined()
    const uv = mesh.geometry.getAttribute('uv')
    expect(uv, 'the storefront strip carries no UVs').toBeTruthy()
    let minV = Infinity
    let maxV = -Infinity
    for (let i = 0; i < uv.count; i++) {
      minV = Math.min(minV, uv.getY(i))
      maxV = Math.max(maxV, uv.getY(i))
    }
    dispose()
    const band = (minV + maxV) / 2 / STOREFRONT_HEIGHT_M
    // If the UV scheme ever changes shape, this readout stops meaning a band
    // and every case below would quietly agree with itself instead.
    expect(
      Math.abs(band - Math.round(band)),
      `the storefront v range ${minV}..${maxV} is not centred on a band`
    ).toBeLessThan(0.01)
    return Math.round(band)
  }

  it('names its twenty bands, in the order their indices mean', () => {
    // Design data the owner can veto row by row. The index is baked into
    // shipped UVs, so a reordering is not a cosmetic change.
    expect(STOREFRONT_BAND_NAMES).toEqual([
      'glass',
      'awning',
      'shutter',
      'arcade',
      'service',
      'cafe-tables',
      'barfront',
      'market',
      'lobby',
      'roller',
      'restaurant',
      'fastfood',
      'clothes',
      'salon',
      'grocer',
      'hotel',
      'bank',
      'vacant',
      'bakery',
      'marquee',
    ])
  })

  it('sends each kind the map knows to the band that was measured for it', () => {
    const bandNamed = (name) => STOREFRONT_BAND_NAMES.indexOf(name)
    expect(storefrontBandFor('restaurant')).toBe(bandNamed('restaurant'))
    expect(storefrontBandFor('fast_food')).toBe(bandNamed('fastfood'))
    expect(storefrontBandFor('cafe')).toBe(bandNamed('cafe-tables'))
    expect(storefrontBandFor('bar')).toBe(bandNamed('barfront'))
    expect(storefrontBandFor('pub')).toBe(bandNamed('barfront'))
    expect(storefrontBandFor('bank')).toBe(bandNamed('bank'))
    expect(storefrontBandFor('theatre')).toBe(bandNamed('marquee'))
    expect(storefrontBandFor('cinema')).toBe(bandNamed('marquee'))
    expect(storefrontBandFor('marketplace')).toBe(bandNamed('market'))
    expect(storefrontBandFor('library')).toBe(bandNamed('lobby'))
    expect(storefrontBandFor('hotel')).toBe(bandNamed('hotel'))
    expect(storefrontBandFor('shop:clothes')).toBe(bandNamed('clothes'))
    expect(storefrontBandFor('shop:hairdresser')).toBe(bandNamed('salon'))
    expect(storefrontBandFor('shop:convenience')).toBe(bandNamed('grocer'))
    expect(storefrontBandFor('shop:bakery')).toBe(bandNamed('bakery'))
    expect(storefrontBandFor('shop:vacant')).toBe(bandNamed('vacant'))
  })

  it('keeps an unlisted shop as a shop instead of dropping it to the hash', () => {
    // shop=gift is 57 nodes across the four extracts and has no band of its
    // own. Letting it fall through would throw away the one thing the map
    // recorded about that corner, which is the opposite of what keeping the
    // shop value was for.
    expect(storefrontBandFor('shop:gift')).toBe(
      STOREFRONT_BAND_NAMES.indexOf('glass')
    )
    expect(storefrontBandFor('shop:jewelry')).toBe(
      STOREFRONT_BAND_NAMES.indexOf('glass')
    )
    // A kind nobody mapped falls to the hash, and says so with null.
    expect(storefrontBandFor('townhall')).toBeNull()
    expect(storefrontBandFor(null)).toBeNull()
  })

  it('dresses a corner as what the map says stands on it', () => {
    expect(bandOf(oneBuilding({ poi: { tags: { shop: 'bakery' } } }))).toBe(
      STOREFRONT_BAND_NAMES.indexOf('bakery')
    )
    expect(bandOf(oneBuilding({ poi: { tags: { amenity: 'restaurant' } } }))).toBe(
      STOREFRONT_BAND_NAMES.indexOf('restaurant')
    )
    expect(bandOf(oneBuilding({ poi: { tags: { shop: 'vacant' } } }))).toBe(
      STOREFRONT_BAND_NAMES.indexOf('vacant')
    )
    // And an unlisted shop still reads as a shop rather than as a dice roll.
    expect(bandOf(oneBuilding({ poi: { tags: { shop: 'gift' } } }))).toBe(
      STOREFRONT_BAND_NAMES.indexOf('glass')
    )
  })

  it("lets a hotel's own tag beat the shop next door", () => {
    // Every one of the 75 hotels in the four extracts is a WAY, never a node,
    // so the POI index can never see one - a hotel has to be read off the
    // building itself.
    const m = oneBuilding({
      buildingTags: { building: 'yes', height: '25', tourism: 'hotel' },
      poi: { tags: { shop: 'bakery' } },
    })
    expect(bandOf(m)).toBe(STOREFRONT_BAND_NAMES.indexOf('hotel'))
  })

  it('counts what landed on each band, so a dead band can be seen', () => {
    // A band nobody uses and a band everybody uses look identical in a
    // texture. Measured on the real extracts with this counter: all twenty
    // bands are used in all four cities, and each city's shape is its own -
    // Seattle restaurant 12.7% against Albuquerque's much flatter spread,
    // which is what a city with fewer mapped POIs should look like.
    const { stats, dispose } = buildCityGroup(model())
    expect(stats.storefrontBands).toHaveLength(STOREFRONT_BAND_NAMES.length)
    // This model has two buildings and only one of them is grounded, so the
    // counter must total exactly one - a count that merely exceeded zero
    // would pass just as happily if it were counting something else.
    expect(stats.storefrontBands.reduce((a, b) => a + b, 0)).toBe(1)
    dispose()

    // And a POI moves the count onto its own band rather than anywhere else.
    const withBakery = buildCityGroup(
      oneBuilding({ poi: { tags: { shop: 'bakery' } } })
    )
    const bakery = STOREFRONT_BAND_NAMES.indexOf('bakery')
    expect(withBakery.stats.storefrontBands[bakery]).toBe(1)
    expect(
      withBakery.stats.storefrontBands.reduce((a, b) => a + b, 0)
    ).toBe(1)
    withBakery.dispose()
  })

  it('is deterministic, and a building with no POI still varies', () => {
    // THE SEED LAW: the hash draw is the same draw it has always been, so the
    // same city dresses the same way twice.
    const plain = () => bandOf(oneBuilding())
    const first = plain()
    expect(plain()).toBe(first)
    expect(first).toBeGreaterThanOrEqual(0)
    expect(first).toBeLessThan(STOREFRONT_BAND_NAMES.length)
  })
})


/**
 * CW-54: cars have wheels and the driving ones have their lights on.
 *
 * The lamp numbers are decided by the luminance ladder, not by taste, so what
 * has to be guarded is that they still SIT on it after tintOf has had its way
 * with them - and that a converter in colour mode still reads the hue out of a
 * tint whose chroma had to be cut to almost nothing to stay in gamut.
 */
describe('buildStreetProps — car anatomy and lamps (CW-54)', () => {
  const LUM = [0.2126, 0.7152, 0.0722]
  const luminance = (t) => t[0] * LUM[0] + t[1] * LUM[1] + t[2] * LUM[2]

  it('keeps the lamp luminances the ladder was told they would be', () => {
    // tintOf CLAMPS, and a clamped channel silently voids the luminance it
    // promised - which is the whole reason inGamutChroma exists. A head lamp
    // has to stay clear of the 0.80 reverse-video threshold to read as a lit
    // POINT and clear of the 0.93-0.95 storefront reserve so it does not
    // invade it; a tail lamp is dimmer because a tail light is.
    expect(luminance(CAR_HEADLAMP_TINT)).toBeCloseTo(0.92, 4)
    expect(luminance(CAR_TAILLAMP_TINT)).toBeCloseTo(0.82, 4)
    // The tail lamp also has a CEILING, which is the whole of D-112: past
    // about 0.837 its in-gamut red is so pale that the encoded canvas reads it
    // as white. 0.82 is the middle of the window between that and the 0.80
    // floor below.
    expect(luminance(CAR_TAILLAMP_TINT)).toBeLessThan(0.835)
    // Both cross the reverse-video threshold, so both read as lit POINTS
    // rather than as bright grey.
    expect(luminance(CAR_HEADLAMP_TINT)).toBeGreaterThan(0.8)
    expect(luminance(CAR_TAILLAMP_TINT)).toBeGreaterThan(0.8)
    // And the head lamp is at least as bright as the brightest paint a car
    // can wear - a top-tier cabin, 0.8 + 0.12 - without reaching the 0.93
    // floor of the storefront reserve. That window is one hundredth wide,
    // which is why the number is measured rather than chosen.
    const brightestCabin = Math.max(...CAR_TIERS) + CAR_CABIN_LIFT
    expect(luminance(CAR_HEADLAMP_TINT)).toBeGreaterThanOrEqual(
      brightestCabin - 1e-6
    )
    expect(luminance(CAR_HEADLAMP_TINT)).toBeLessThan(0.93)
  })

  it('still lands the colour each lamp is meant to be, ENCODED (D-112)', () => {
    // The tail lamp's chroma had to fall from the 0.75 asked for to about 0.18
    // to keep its luminance where the ladder wants it - a saturated red simply
    // is not that bright - and what survives is a pale pink. Whether a
    // converter can still read RED out of that depends entirely on WHICH
    // NUMBERS IT IS HANDED.
    //
    // This is D-112. The tint is linear light; the canvas the converter samples
    // has been through the renderer's output encoding, and sRGB's toe lifts the
    // green and blue channels much closer to the red one. Handed the linear
    // tint, pickPaletteIndex says red at every tier this lamp could plausibly
    // take, which is why the first version of this guard was green while a
    // photograph of the same lamp came back white. Encode first, and the guard
    // has an opinion: at 0.85 it says #ffffff, at 0.82 it says #ff3333.
    const encode = (c) =>
      c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
    const normalized = (p) => p.map((c) => normalizeChroma(parsePaletteColor(c)))
    const entry = (tint, palette) => {
      const e = tint.map(encode)
      return palette[pickPaletteIndex(e[0], e[1], e[2], normalized(palette), 5)]
    }
    expect(entry(CAR_TAILLAMP_TINT, HC_PALETTE_GREEN)).toBe('#ff3333')
    expect(entry(CAR_TAILLAMP_TINT, HC_PALETTE_AMBER)).toBe('#ff2d95')
    // A head lamp is white, and lands white. The linear-space reading called
    // it yellow; the encoded one, which is the one the frame agrees with, does
    // not.
    expect(entry(CAR_HEADLAMP_TINT, HC_PALETTE_GREEN)).toBe('#ffffff')
    expect(entry(CAR_HEADLAMP_TINT, HC_PALETTE_AMBER)).toBe('#ffffff')
  })

  it('glazes every car the same cool colour without moving mono (CW-54)', () => {
    // The cabin used to take the car's own paint hue, so a red car had red
    // windows. It takes one fixed cool tint now - and the whole point of the
    // exercise is that a MONOCHROME screen cannot tell, because luminance
    // alone is what it reads. That promise only holds while nothing clamps,
    // which is why glassTint goes through inGamutChroma: pin the four cabin
    // luminances exactly, and the promise is a fact rather than an intention.
    const cabins = CAR_TIERS.map((t) => Math.min(1, t + CAR_CABIN_LIFT))
    const tints = CAR_TIERS.map((t) => glassTint(t))
    tints.forEach((tint, i) => {
      expect(luminance(tint)).toBeCloseTo(cabins[i], 6)
      // Cool: blue above green above red, on every tier.
      expect(tint[2]).toBeGreaterThan(tint[1])
      expect(tint[1]).toBeGreaterThan(tint[0])
    })
    // ENCODED (D-112), the three lower cabins read cool and the brightest one
    // cannot: at 0.92 the gamut caps the chroma at 0.204, under the 0.235 it
    // would need. That is the ladder's arithmetic, not a tuning choice, and it
    // is pinned so a later change to the tiers cannot quietly whiten the rest.
    const encode = (c) =>
      c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
    const normalized = (p) => p.map((c) => normalizeChroma(parsePaletteColor(c)))
    const landed = tints.map((tint) => {
      const e = tint.map(encode)
      return HC_PALETTE_GREEN[
        pickPaletteIndex(e[0], e[1], e[2], normalized(HC_PALETTE_GREEN), 5)
      ]
    })
    expect(landed).toEqual(['#00ffff', '#00ffff', '#00ffff', '#ffffff'])

    // And it is WIRED IN, not merely available. Without this the whole case
    // passes with both call sites still handing the cabin the paint hue.
    const m = propsModel()
    const props = buildStreetProps(m, buildCollisionGrid(m))
    const cars = props.group.children.find((c) => c.name === 'cars')
    const col = cars.geometry.getAttribute('color')
    const wears = (tint) => {
      for (let i = 0; i < col.count; i++) {
        if (
          Math.abs(col.getX(i) - tint[0]) < 1e-4 &&
          Math.abs(col.getY(i) - tint[1]) < 1e-4 &&
          Math.abs(col.getZ(i) - tint[2]) < 1e-4
        ) {
          return true
        }
      }
      return false
    }
    expect(tints.some(wears), 'no parked cabin wears a glass tint').toBe(true)
    props.dispose()
  })

  it('lights the traffic and leaves the parked cars dark', () => {
    // A parked car is parked. Lighting the kerbside rows would also string
    // bright points down every street, which is the carpet law's territory.
    //
    // Asked as "does this mesh CONTAIN a lamp tint", not "which mesh is
    // brighter" - the first form of this compared brightest luminances and
    // failed, because a top-tier parked cabin is already 0.92 and the lamps
    // sit in the same neighbourhood on purpose. Presence is the fact; the
    // brightness ordering never was one.
    // The plain fixture's road is 100 m of residential, which is 0.8 traffic
    // cars and therefore none - and the first form of this case guarded the
    // traffic half with `if (traffic)`, so it passed happily with the lamps
    // removed entirely.
    //
    // The road added here is 120 m of secondary and it is INSIDE THE MODEL
    // BOUNDS, which the buildings set at plus or minus 66 m. Props are placed
    // only within those bounds, so a longer road laid across them grows no
    // traffic at all - measured: 400 m at y=40 gives zero, 120 m at y=25
    // gives five.
    const m = propsModel([
      {
        type: 'way',
        id: 99,
        tags: { highway: 'secondary' },
        geometry: [pt(-60, 25), pt(60, 25)],
      },
    ])
    const props = buildStreetProps(m, buildCollisionGrid(m))
    const parked = props.group.children.find((c) => c.name === 'cars')
    const traffic = props.group.children.find((c) => c.name === 'traffic-cars')
    expect(parked, 'this fixture parked no cars').toBeDefined()
    expect(
      traffic,
      'this fixture grew no frozen traffic, so the lamp half would measure nothing'
    ).toBeDefined()

    const hasTint = (mesh, tint) => {
      const c = mesh.geometry.getAttribute('color')
      for (let i = 0; i < c.count; i++) {
        if (
          Math.abs(c.getX(i) - tint[0]) < 1e-4 &&
          Math.abs(c.getY(i) - tint[1]) < 1e-4 &&
          Math.abs(c.getZ(i) - tint[2]) < 1e-4
        ) {
          return true
        }
      }
      return false
    }
    expect(hasTint(parked, CAR_HEADLAMP_TINT)).toBe(false)
    expect(hasTint(parked, CAR_TAILLAMP_TINT)).toBe(false)
    expect(hasTint(traffic, CAR_HEADLAMP_TINT)).toBe(true)
    expect(hasTint(traffic, CAR_TAILLAMP_TINT)).toBe(true)
    props.dispose()
  })

  it('stands every car on its wheels, with the body lifted clear', () => {
    // The body used to sit flush on the ground, which is why a parked row read
    // as a low dotted mass.
    //
    // The tell is not how MANY vertices reach the ground - four wheel boxes
    // put more there than one flush body did, measured 0.30 against 0.19, so
    // that ratio moves the wrong way. It is that a box has vertices only at
    // its two ends in z, so a car whose body starts at a ride height has
    // vertices AT that ride height and a flush one has none. Both clearances
    // in the table are checked because both classes park here.
    const m = propsModel()
    const props = buildStreetProps(m, buildCollisionGrid(m))
    const cars = props.group.children.find((c) => c.name === 'cars')
    const a = cars.geometry.getAttribute('position').array
    let minZ = Infinity
    let atClearance = 0
    for (let i = 2; i < a.length; i += 3) {
      minZ = Math.min(minZ, a[i])
      if (Math.abs(a[i] - 0.2) < 1e-3 || Math.abs(a[i] - 0.28) < 1e-3) {
        atClearance++
      }
    }
    // Something still touches the ground, and it is the wheels.
    expect(minZ).toBeCloseTo(0, 5)
    // And a body starts at a ride height, which is what a flush car has none
    // of.
    expect(
      atClearance,
      'no car body starts at a ride height - they are still sitting on the ground'
    ).toBeGreaterThan(0)
    props.dispose()
  })
})

/**
 * CW-56 (CW-Q55): the species reach the city, and the map's own leaf gets a
 * say.
 *
 * The table guards live in city-trees.test.js, where they belong. What has to
 * be guarded HERE is the wiring - because a perfect species table that nothing
 * calls looks exactly like a perfect species table that everything calls, and
 * the seed law is the alarm that would otherwise go unheard.
 */
describe('buildStreetProps — species trees (CW-56)', () => {
  it('plants more than one kind of tree, and counts what it planted', () => {
    const m = propsModel()
    const props = buildStreetProps(m, buildCollisionGrid(m))
    const planted = props.stats.speciesPlanted
    expect(planted, 'nothing recorded a species').toBeDefined()
    const total = Object.values(planted).reduce((a, b) => a + b, 0)
    expect(total).toBe(props.stats.treeCount)
    // A table nobody uses and a table everybody uses look identical inside a
    // merged mesh (CW-53's lesson), so the build counts its own.
    expect(Object.keys(planted).length).toBeGreaterThan(1)
    props.dispose()
  })

  it('lets a needleleaved tree in the DATA become a conifer', () => {
    // The wiring guard. Two models identical but for one tag, so what is
    // being measured is the tag and nothing else: a mapped needleleaved tree
    // must come out as a cone, which is three stacked crowns rather than one
    // and therefore 40 more triangles on that tree.
    const plain = propsModel([
      { type: 'node', id: 900, tags: { natural: 'tree' }, ...pt(-20, 6) },
    ])
    const needled = propsModel([
      {
        type: 'node',
        id: 900,
        tags: { natural: 'tree', leaf_type: 'needleleaved' },
        ...pt(-20, 6),
      },
    ])
    const a = buildStreetProps(plain, buildCollisionGrid(plain))
    const b = buildStreetProps(needled, buildCollisionGrid(needled))
    expect(a.stats.treeCount).toBe(b.stats.treeCount)
    const conifersOf = (s) => s.conifer ?? 0
    expect(
      conifersOf(b.stats.speciesPlanted),
      'the leaf_type never reached the planter'
    ).toBeGreaterThan(conifersOf(a.stats.speciesPlanted))
    a.dispose()
    b.dispose()
  })

  it('adds five species without moving one other count (the seed law)', () => {
    // The species draw takes DIFFERENT BITS of the seed the canopy tier
    // already uses, rather than a new random stream, so nothing is inserted
    // into an existing draw order. If that ever stops being true, these
    // counts are what says so first.
    const m = propsModel()
    const props = buildStreetProps(m, buildCollisionGrid(m))
    expect(props.stats.treeCount).toBeGreaterThan(0)
    expect(props.stats.carCount).toBeGreaterThan(0)
    expect(props.stats.lampCount).toBeGreaterThan(0)
    const again = buildStreetProps(m, buildCollisionGrid(m))
    expect(again.stats.speciesPlanted).toEqual(props.stats.speciesPlanted)
    expect(again.stats.carCount).toBe(props.stats.carCount)
    props.dispose()
    again.dispose()
  })
})

/**
 * CW-57 (CW-Q55): plantings and picnic tables in the city.
 *
 * The shapes are guarded in city-planting.test.js. What has to be guarded HERE
 * is the law the CW-43 record set and this release could most easily break:
 * REAL DATA WINS. A fallback that fires where the map already answered would
 * be decorative scatter standing on top of a real position, which is exactly
 * what the owner's mission sentence forbids.
 */
describe('buildStreetProps — plantings (CW-57)', () => {
  const plantingModel = (extra = []) =>
    propsModel([
      { type: 'way', id: 80, tags: { leisure: 'park' }, geometry: squareRing(35, 0, 25) },
      ...extra,
    ])

  it('stands a mapped planter at its own position, and calls it data', () => {
    const m = plantingModel([
      { type: 'node', id: 81, tags: { man_made: 'planter' }, ...pt(-30, 5) },
    ])
    const props = buildStreetProps(m, buildCollisionGrid(m))
    expect(props.stats.plantingPlaced.planter).toBeGreaterThan(0)
    // ★ REAL DATA WINS: a city with a mapped planter never reaches the
    // fallback, so nothing invented stands beside something real.
    expect(
      props.stats.fallbackPlanters,
      'the fallback fired in a city that had real planters'
    ).toBe(0)
    expect(hasVertexNear(props.group, 'planters', -30, 5, 1.2)).toBe(true)
    props.dispose()
  })

  it('fills a city that has NO planters, and says that it did', () => {
    // Denver and Albuquerque have zero mapped planters and zero flowerbeds -
    // measured in CW-55's rebake, not assumed. The directive licenses filling
    // that gap; what this pins is that the count is reported SEPARATELY, so a
    // reader can always tell design from data.
    const m = plantingModel()
    const props = buildStreetProps(m, buildCollisionGrid(m))
    expect(props.stats.fallbackPlanters).toBeGreaterThan(0)
    expect(props.stats.plantingPlaced.planter).toBe(
      props.stats.fallbackPlanters
    )
    props.dispose()
  })

  it('gives a picnic table a footprint, and no one sitting at it', () => {
    const m = plantingModel([
      { type: 'node', id: 82, tags: { leisure: 'picnic_table' }, ...pt(-25, 5) },
    ])
    const props = buildStreetProps(m, buildCollisionGrid(m))
    expect(props.stats.plantingPlaced.picnic_table).toBe(1)
    const stamped = props.obstacles.filter(
      (o) => Math.hypot(o.x + 25, o.y - 5) < 0.5 && o.halfLengthM > 0.8
    )
    expect(stamped, 'a picnic table nobody can walk into').toHaveLength(1)
    // Sitters are bench-only. That is CW-45's settled law and no signed
    // question has extended it, so picnic tables ship unoccupied.
    expect(props.stats.sitterCount).toBe(0)
    props.dispose()
  })

  it('lays a flowerbed flat and lets you walk over it', () => {
    const m = plantingModel([
      {
        type: 'way',
        id: 83,
        tags: { leisure: 'flowerbed' },
        geometry: squareRing(-35, 8, 3),
      },
    ])
    const props = buildStreetProps(m, buildCollisionGrid(m))
    expect(props.stats.plantingPlaced.flowerbed).toBe(1)
    // A bed of flowers is not an obstacle: nothing here should stop a cane.
    const nearBed = props.obstacles.filter(
      (o) => Math.hypot(o.x + 35, o.y - 8) < 3
    )
    expect(nearBed, 'a flowerbed became something to walk into').toEqual([])
    props.dispose()
  })
})

/**
 * CW-65 (CW-Q60): what the traveler is actually identified BY.
 *
 * ★★ THE ANSWER IS SHAPE, NOT COLOUR, AND THE MEASUREMENT OVERTURNED MY OWN
 * ASSUMPTION. The high-visibility jacket sits at tier 0.92 against the
 * brightest ordinary torso's 0.8, and photographed at 8 m that is a real
 * +55% in mean luminance. But in COLOUR mode the palette quantizes both to the
 * SAME entry, and the green set has only six entries which ordinary figures
 * reach ALL SIX of - 3,029 figures saturate it. So no colour anywhere in that
 * palette belongs to the traveler alone, the jacket included.
 *
 * What is left, and what CW-Q60 signed from the start, is the CANE: a bright
 * diagonal reaching the ground, which no other figure in the city has. These
 * assertions pin the claims that survive rather than the one that did not.
 */
describe('the traveler is identified by shape, not by colour (CW-65)', () => {
  const encode = (c) =>
    c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
  const normalized = (p) => p.map((c) => normalizeChroma(parsePaletteColor(c)))
  // D-112: the converter reads the frame AFTER the renderer's output
  // encoding, so a palette claim tested on the linear tint is a claim about
  // numbers nobody ever sees.
  const landsOn = (tint, palette) => {
    const e = tint.map(encode)
    return palette[pickPaletteIndex(e[0], e[1], e[2], normalized(palette), 5)]
  }
  const lumOf = (t) => 0.2126 * t[0] + 0.7152 * t[1] + 0.0722 * t[2]
  const jacket = () =>
    tintOf(
      TRAVELER_LOOK.jacketTier,
      TRAVELER_LOOK.jacketHueDeg,
      inGamutChroma(
        TRAVELER_LOOK.jacketTier,
        TRAVELER_LOOK.jacketHueDeg,
        TRAVELER_LOOK.jacketChroma
      )
    )

  it('wears a jacket brighter than the brightest ordinary torso', () => {
    // FIGURE_TIERS tops out at 0.8 and the head sits at 0.82; a jacket that
    // does not beat those is another bright shirt. This is the claim that
    // carries in MONO, which is the default and the high-contrast mode.
    expect(TRAVELER_LOOK.jacketTier).toBeGreaterThan(0.82)
    // inGamutChroma, because tintOf CLAMPS and a clamped channel silently
    // voids the luminance promise the mono schemes read (CW-49).
    expect(lumOf(jacket())).toBeCloseTo(TRAVELER_LOOK.jacketTier, 3)
  })

  it('cannot be told from the crowd by COLOUR, and the record says so', () => {
    // Not a wish - a measurement, kept here so a future release that "fixes"
    // the jacket's hue knows what it is up against. Ordinary figures draw
    // from eight hues over three tiers; between them they reach every entry
    // the green set has.
    const HUES = [0, 30, 60, 120, 180, 270, 300, 330]
    const TIERS = [0.5, 0.65, 0.8, 0.45]
    const reachable = new Set()
    for (const h of HUES) {
      for (const t of TIERS) reachable.add(landsOn(tintOf(t, h, 0.5), HC_PALETTE_GREEN))
      reachable.add(landsOn(tintOf(0.82, h, inGamutChroma(0.82, h, 0.5)), HC_PALETTE_GREEN))
    }
    expect(reachable.size).toBe(HC_PALETTE_GREEN.length)
    // Including the jacket's own colour, and the cane's white.
    expect(reachable.has(landsOn(jacket(), HC_PALETTE_GREEN))).toBe(true)
    expect(
      reachable.has(landsOn(tintOf(TRAVELER_LOOK.caneTier, 0, 0), HC_PALETTE_GREEN))
    ).toBe(true)
  })

  it('lands a real yellow in both sets rather than clipping to white', () => {
    // The one thing the hue choice DOES buy: high-visibility yellow is the
    // colour the thing is in life, and at 0.92 it survives the gamut cap.
    expect(landsOn(jacket(), HC_PALETTE_GREEN)).toBe('#ffff00')
    expect(landsOn(jacket(), HC_PALETTE_AMBER)).toBe('#aaff00')
  })

  it('draws the glasses in the one true dark this medium has', () => {
    // Exact black is rendered as an EMPTY CELL (CW-5). These palettes carry no
    // dark neutral at all (CW-58), so a band drawn "dark" would land on a
    // colour that is not dark.
    const t = buildTraveler('seattle')
    t.place(0, 0, 0)
    const mesh = t.group.children.find((c) => c.isMesh)
    const colors = mesh.geometry.getAttribute('color').array
    let exactBlack = 0
    for (let i = 0; i < colors.length; i += 3) {
      if (colors[i] === 0 && colors[i + 1] === 0 && colors[i + 2] === 0)
        exactBlack++
    }
    // A box is 24 vertices; the glasses band is exactly one box.
    expect(exactBlack).toBe(24)
    t.dispose()
  })

  it('is one mesh, named so the class pass can find it', () => {
    // A name on the GROUP dresses nothing: the class pass traverses with
    // `if (!obj.isMesh) return` and reads obj.name. That is D-115, and it is
    // why this asserts the MESH.
    const t = buildTraveler('seattle')
    expect(t.isPlaced()).toBe(false)
    t.place(12, -3, 1)
    const meshes = []
    t.group.traverse((o) => {
      if (o.isMesh) meshes.push(o.name)
    })
    expect(meshes).toEqual(['traveler'])
    expect(t.position()).toEqual([12, -3])
    t.dispose()
  })

  it('gives two cities two different travelers, and one city the same one', () => {
    const a = buildTraveler('seattle').spec
    const b = buildTraveler('seattle').spec
    const c = buildTraveler('denver').spec
    expect(a.heightM).toBe(b.heightM)
    expect(a.build).toBe(b.build)
    expect(c.heightM).not.toBe(a.heightM)
  })
})

/**
 * CW-65: where the traveler stands.
 *
 * ★★ THESE EXIST BECAUSE THE E2E COULD NOT SEE THE MECHANISM. The e2e asserts
 * that Seattle's traveler is more than 150 m from the spawn, and that is TRUE
 * WITH THE FLOOR DELETED - the busiest pavement in Seattle happens to be 358 m
 * away regardless. Red-proven: removing the floor outright left that case
 * green. An outcome that holds by luck is not a guard, so the floor, the
 * determinism and the never-null fallback are tested on the pure function
 * where a defect has nowhere to hide.
 */
describe('pickTravelerSpot (CW-65)', () => {
  const walkers = (list) =>
    list.map(([x, y]) => ({ x, y, pose: 'walking', facing: 0 }))

  it('keeps the traveler away from the spawn even when the crowd is there', () => {
    // The densest cluster sits ON the spawn, and one lone spot is far away.
    // With the floor, the far one has to win despite being the sparsest.
    const near = []
    for (let i = 0; i < 40; i++) near.push([i % 7, Math.floor(i / 7)])
    const spots = walkers([...near, [900, 900]])
    const got = pickTravelerSpot(spots, 'seattle', { spawnX: 0, spawnY: 0 })
    expect(got).not.toBeNull()
    expect(Math.hypot(got.x, got.y)).toBeGreaterThanOrEqual(
      TRAVELER_MIN_FROM_SPAWN_M
    )
    expect([got.x, got.y]).toEqual([900, 900])
  })

  it('prefers the busier pavement when both are far enough away', () => {
    // ★★ THE FIRST VERSION OF THIS PASSED WITH THE DENSITY SORT DELETED, by
    // luck: it asserted the pick was near the crowd, and the hash happened to
    // land there anyway. Asserting the pick is AS BUSY AS ANYTHING AVAILABLE
    // is the claim the sort actually makes, and it cannot be satisfied by
    // accident.
    const busy = []
    for (let i = 0; i < 30; i++)
      busy.push([500 + (i % 5), 500 + Math.floor(i / 5)])
    // Lone spots spread far apart, each with a neighbourhood of exactly one.
    const lonely = [
      [-600, -600],
      [-900, 300],
      [800, -900],
      [-300, 900],
    ]
    const spots = walkers([...busy, ...lonely])
    const got = pickTravelerSpot(spots, 'seattle', { spawnX: 0, spawnY: 0 })
    // Every lonely spot scores 1; the crowd scores 30. A pick that is not the
    // busiest means the bias is gone.
    expect(got.neighbours).toBe(30)
    expect(Math.hypot(got.x - 502, got.y - 502)).toBeLessThan(50)
  })

  it('gives the same city the same spot and different cities different ones', () => {
    const spots = walkers(
      Array.from({ length: 60 }, (_, i) => [400 + i * 13, 400 + ((i * 29) % 97)])
    )
    const a = pickTravelerSpot(spots, 'seattle', { spawnX: 0, spawnY: 0 })
    const b = pickTravelerSpot(spots, 'seattle', { spawnX: 0, spawnY: 0 })
    const c = pickTravelerSpot(spots, 'denver', { spawnX: 0, spawnY: 0 })
    expect([a.x, a.y]).toEqual([b.x, b.y])
    expect([c.x, c.y]).not.toEqual([a.x, a.y])
  })

  it('never strands a city that has people, even with nowhere far enough', () => {
    // ★ The DISTANCE is what gives way, not the traveler. A small extract, or
    // a spawn in the middle of everything, must still get one.
    const spots = walkers([
      [1, 1],
      [2, 2],
      [3, 1],
    ])
    const got = pickTravelerSpot(spots, 'burnaby', { spawnX: 0, spawnY: 0 })
    expect(got).not.toBeNull()
    expect(Number.isFinite(got.x)).toBe(true)
  })

  it('never strands a city whose only figures are SITTING', () => {
    // ★★ THE LAST-RESORT FALLBACK HAD NO TEST AT ALL, and deleting it left
    // every case green: the case above is rescued by the FIRST fallback (drop
    // the distance rule) and never reaches the second. Only a city where every
    // figure is on a bench exercises it - and a city with people in it must
    // never come back empty-handed.
    const spots = [
      { x: 1, y: 1, pose: 'sitting', facing: 0 },
      { x: 2, y: 2, pose: 'sitting', facing: 0 },
    ]
    const got = pickTravelerSpot(spots, 'denver', { spawnX: 0, spawnY: 0 })
    expect(got).not.toBeNull()
    expect(Number.isFinite(got.x)).toBe(true)
  })

  it('refuses a bench: a sitter is not standing on the pavement', () => {
    const spots = [
      { x: 500, y: 500, pose: 'sitting', facing: 0 },
      { x: 900, y: 900, pose: 'walking', facing: 1 },
    ]
    const got = pickTravelerSpot(spots, 'seattle', { spawnX: 0, spawnY: 0 })
    expect([got.x, got.y]).toEqual([900, 900])
  })

  it('has nothing to place in a city with no figures at all', () => {
    expect(pickTravelerSpot([], 'seattle', {})).toBeNull()
    expect(pickTravelerSpot(null, 'seattle', {})).toBeNull()
  })
})

describe('nothing stands in the road (CW-75)', () => {
  // An 8 m residential street east-west along y = 0, crossed by a 12 m
  // secondary north-south at x = 40, with buildings far enough away that
  // the collision grid never decides anything on its own.
  function crossroadsModel(extraElements = []) {
    return parseCityExtract(
      {
        elements: [
          {
            type: 'way',
            id: 1,
            tags: { building: 'yes', height: '20' },
            geometry: squareRing(-120, -120, 6),
          },
          {
            type: 'way',
            id: 2,
            tags: { building: 'yes', height: '20' },
            geometry: squareRing(120, 120, 6),
          },
          {
            type: 'way',
            id: 3,
            tags: { highway: 'residential' },
            geometry: [pt(-100, 0), pt(100, 0)],
          },
          {
            type: 'way',
            id: 4,
            tags: { highway: 'secondary' },
            geometry: [pt(40, -100), pt(40, 100)],
          },
          ...extraElements,
        ],
      },
      { center: CENTER }
    )
  }

  /** Every rectangle a build placed a car in, parked and moving alike. */
  function overlappingCarPairs(props, wanted) {
    const cars = props.carFootprints
    let pairs = 0
    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) {
        if (wanted && !wanted(cars[i], cars[j])) continue
        if (rectsOverlap(cars[i], cars[j])) pairs++
      }
    }
    return pairs
  }

  it('steps a mapped tree in the roadway back onto its own pavement', () => {
    // A tree node the map puts 1 m off the residential centreline - inside
    // an 8 m ribbon by 3 m, on the north side.
    const m = crossroadsModel([
      { type: 'node', id: 90, tags: { natural: 'tree' }, ...pt(-20, 1) },
    ])
    const props = buildStreetProps(m, buildCollisionGrid(m))

    expect(props.stats.treesDemoted).toBe(1)
    expect(props.stats.treesDropped).toBe(0)
    // It kept the side of the street it was already on, and landed on the
    // pavement: the kerb is 4 m out, the tree line 1.2 m beyond that.
    const halfM = ROAD_WIDTHS_M.residential / 2
    expect(
      hasVertexNear(props.group, 'tree-trunks', -20, halfM + 1.2, 0.3)
    ).toBe(true)
    expect(hasVertexNear(props.group, 'tree-trunks', -20, 1, 0.3)).toBe(false)

    props.dispose()
  })

  it('drops a mapped tree with no pavement to take it, and counts it', () => {
    // In the middle of the junction, where stepping out of the residential
    // ribbon only lands inside the secondary one.
    const m = crossroadsModel([
      { type: 'node', id: 91, tags: { natural: 'tree' }, ...pt(40, 0) },
    ])
    const props = buildStreetProps(m, buildCollisionGrid(m))

    expect(props.stats.treesDropped).toBe(1)
    expect(props.stats.treesDemoted).toBe(0)
    expect(hasVertexNear(props.group, 'tree-trunks', 40, 0, 1)).toBe(false)

    props.dispose()
  })

  it('plants no trunk and stands no pole on tarmac', () => {
    const m = crossroadsModel()
    const props = buildStreetProps(m, buildCollisionGrid(m))
    const roadways = buildRoadwayIndex(m.roads)

    for (const o of props.obstacles) {
      const side = o.halfLengthM * 2
      const square = Math.abs(o.halfLengthM - o.halfWidthM) < 1e-6
      if (!square || side > 0.7) continue
      expect(roadways.insideRoadway(o.x, o.y, -side / 2)).toBeNull()
    }
    // The junction is where the streams cross, so it has to have refused
    // something - a guard that never fires proves nothing (CW-73).
    expect(
      props.stats.treesSkippedInRoad + props.stats.lampsSkippedInRoad
    ).toBeGreaterThan(0)

    props.dispose()
  })

  it('never parks a car where a moving one already is', () => {
    const m = crossroadsModel()
    const props = buildStreetProps(m, buildCollisionGrid(m))

    expect(props.carFootprints.length).toBeGreaterThan(0)
    expect(props.carFootprints.some((c) => c.stream === 'traffic')).toBe(true)
    expect(props.carFootprints.some((c) => c.stream === 'parked')).toBe(true)
    expect(overlappingCarPairs(props, (a, b) => a.stream !== b.stream)).toBe(0)
    expect(overlappingCarPairs(props)).toBe(0)

    props.dispose()
  })

  it('gives an 8 m street one shared lane, clear of the parked rows', () => {
    const m = crossroadsModel()
    const props = buildStreetProps(m, buildCollisionGrid(m))

    // Residential traffic runs along y = 0; the road is 8 m, so its free
    // strip either side of the centreline is 1.5 m - one car wide only.
    const onResidential = props.carFootprints.filter(
      (c) => Math.abs(c.y) < ROAD_WIDTHS_M.residential / 2 && c.x < 30
    )
    const traffic = onResidential.filter((c) => c.stream === 'traffic')
    const parked = onResidential.filter((c) => c.stream === 'parked')
    expect(traffic.length).toBeGreaterThan(0)
    expect(parked.length).toBeGreaterThan(0)
    for (const car of traffic) expect(Math.abs(car.y)).toBeCloseTo(0, 6)
    // ...and the parked rows keep the place they have always had.
    const parkedOffset = ROAD_WIDTHS_M.residential / 2 - 0.5 - 1
    for (const car of parked) {
      expect(Math.abs(car.y)).toBeCloseTo(parkedOffset, 6)
    }
    // Which is the whole point: a lane and a bay, not one slot for both.
    expect(parkedOffset - 1).toBeGreaterThanOrEqual(1)

    props.dispose()
  })

  it('parks nobody on a 6 m living street, and says how many', () => {
    const m = parseCityExtract(
      {
        elements: [
          {
            type: 'way',
            id: 1,
            tags: { building: 'yes', height: '20' },
            geometry: squareRing(-800, -800, 6),
          },
          {
            type: 'way',
            id: 2,
            tags: { building: 'yes', height: '20' },
            geometry: squareRing(800, 800, 6),
          },
          {
            // Long enough that a living street's own 4 cars per kilometre
            // is a number this road can actually show.
            type: 'way',
            id: 3,
            tags: { highway: 'living_street' },
            geometry: [pt(-700, 0), pt(700, 0)],
          },
        ],
      },
      { center: CENTER }
    )
    const props = buildStreetProps(m, buildCollisionGrid(m))

    // 6 m leaves 2.5 m of tarmac each side of the centreline once the kerb
    // is taken off - a parking bay would leave a car half a metre of lane.
    expect(props.stats.roadsWithoutParking).toBe(1)
    expect(props.stats.carCount).toBe(0)
    // It is still a street, so it still carries traffic.
    expect(props.frozenTrafficCount).toBeGreaterThan(0)

    props.dispose()
  })

  it('stands nobody in the road unless the map maps a crossing there', () => {
    const m = crossroadsModel()
    const props = buildStreetProps(m, buildCollisionGrid(m))
    const roadways = buildRoadwayIndex(m.roads)

    expect(props.figureSpots.length).toBeGreaterThan(0)
    for (const f of props.figureSpots) {
      expect(roadways.insideRoadway(f.x, f.y, 0)).toBeNull()
    }
    expect(props.stats.peopleSkippedInRoad).toBeGreaterThan(0)

    props.dispose()
  })

  it('lets somebody stand in the road where a crossing IS mapped', () => {
    const plain = crossroadsModel()
    const withCrossing = crossroadsModel([
      { type: 'node', id: 92, tags: { highway: 'crossing' }, ...pt(40, 0) },
    ])
    const before = buildStreetProps(plain, buildCollisionGrid(plain))
    const after = buildStreetProps(
      withCrossing,
      buildCollisionGrid(withCrossing)
    )

    // One mapped crossing is the only difference, and it buys back people
    // the junction had been refusing.
    expect(after.stats.peopleSkippedInRoad).toBeLessThan(
      before.stats.peopleSkippedInRoad
    )

    before.dispose()
    after.dispose()
  })
})

describe('a side street sharing a corridor with an arterial (CW-75)', () => {
  // ★ The shape the census found 373 Seattle lamp poles standing in: two
  // ways whose ribbons overlap end to end, most of them along the I-5
  // trench. A lamp planted 0.45 m outside ITS road's kerb is metres inside
  // the next one's, and a parked slot measured off ITS kerb is somebody
  // else's travel lane. One crossing at a junction cannot show either; a
  // shared corridor shows both on every metre of it.
  function corridorModel(mainTags, sideY) {
    return parseCityExtract(
      {
        elements: [
          {
            type: 'way',
            id: 1,
            tags: { building: 'yes', height: '20' },
            geometry: squareRing(-300, -300, 6),
          },
          {
            type: 'way',
            id: 2,
            tags: { building: 'yes', height: '20' },
            geometry: squareRing(300, 300, 6),
          },
          {
            type: 'way',
            id: 3,
            tags: mainTags,
            geometry: [pt(-200, 0), pt(200, 0)],
          },
          {
            type: 'way',
            id: 4,
            tags: { highway: 'residential' },
            geometry: [pt(-200, sideY), pt(200, sideY)],
          },
        ],
      },
      { center: CENTER }
    )
  }

  it('stands no pole in the roadway running alongside', () => {
    // A residential street 9 m off a 14 m primary: the residential lamp line
    // at 4.45 m is 4.55 m inside the primary's ribbon.
    const m = corridorModel({ highway: 'primary' }, 9)
    const props = buildStreetProps(m, buildCollisionGrid(m))
    const roadways = buildRoadwayIndex(m.roads)

    expect(props.stats.lampsSkippedInRoad).toBeGreaterThan(0)
    for (const o of props.obstacles) {
      const side = o.halfLengthM * 2
      if (Math.abs(o.halfLengthM - o.halfWidthM) > 1e-6) continue
      if (Math.abs(side - 0.15) > 0.005) continue
      expect(roadways.insideRoadway(o.x, o.y, -side / 2)).toBeNull()
    }

    props.dispose()
  })

  it('refuses a parked slot a moving car already fills', () => {
    // The primary's outer travel lane runs at 3.25 m; a residential street
    // at 5.75 m puts its near parked row on exactly that line. The primary
    // parks nobody, so nothing but the footprint registry stands between
    // the two.
    const m = corridorModel({ highway: 'primary' }, 5.75)
    const props = buildStreetProps(m, buildCollisionGrid(m))

    expect(props.stats.carsRefusedOverlap).toBeGreaterThan(0)
    const cars = props.carFootprints
    let pairs = 0
    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) {
        if (rectsOverlap(cars[i], cars[j])) pairs++
      }
    }
    expect(pairs).toBe(0)

    props.dispose()
  })
})
