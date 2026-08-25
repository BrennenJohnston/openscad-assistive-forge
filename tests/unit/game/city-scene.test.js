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
} from '../../../src/js/game/city-scene.js'
import {
  parseCityExtract,
  ROAD_WIDTHS_M,
} from '../../../src/js/game/city-data.js'
import {
  buildCollisionGrid,
  pointInRing,
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
          tags: { building: 'yes', height: '10', min_height: '4' },
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
    // model(): one grounded 25 m building, one min_height=4 skybridge part.
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

    // Exactly one of the two buildings qualifies (the skybridge is skipped),
    // so the strip has the same triangle count as one extruded square.
    const perBuilding = stats.buildingTriangles / 2
    expect(stats.storefrontTriangles).toBe(perBuilding)

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

  it('walks under the crown but not through the trunk', () => {
    const m = propsModel()
    const props = buildStreetProps(m, buildCollisionGrid(m))
    const trunks = props.group.children.find((c) => c.name === 'tree-trunks')
    const canopies = props.group.children.find(
      (c) => c.name === 'tree-canopies'
    )

    trunks.geometry.computeBoundingBox()
    canopies.geometry.computeBoundingBox()
    expect(trunks.geometry.boundingBox.min.z).toBeCloseTo(0, 5)
    // Eye height is 1.7 m: the canopy must start above it.
    expect(canopies.geometry.boundingBox.min.z).toBeGreaterThan(1.9)

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
      'tree-canopies',
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
