import { describe, it, expect } from 'vitest'
import { Scene, PerspectiveCamera, Box3 } from 'three'
import {
  buildCityGroup,
  attachCityLighting,
  buildingTint,
  buildStreetProps,
  ROAD_TONES,
} from '../../../src/js/game/city-scene.js'
import { parseCityExtract } from '../../../src/js/game/city-data.js'
import { buildCollisionGrid } from '../../../src/js/game/walk-controls.js'

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
    expect(stats.roadTriangles).toBe(2) // one segment = two triangles

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

    // The strip stops at 3.5 m and starts at the ground.
    storefronts.geometry.computeBoundingBox()
    expect(storefronts.geometry.boundingBox.min.z).toBe(0)
    expect(storefronts.geometry.boundingBox.max.z).toBeCloseTo(3.5, 5)

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
    // Two curb ribbons per surface ribbon → 2× the triangle count.
    expect(curbs.geometry.getAttribute('position').count).toBe(
      roads.geometry.getAttribute('position').count * 2
    )

    setMapView(true)
    expect(roads.material.color.getHex()).toBe(ROAD_TONES.map)
    expect(curbs.visible).toBe(false)

    setMapView(false)
    expect(roads.material.color.getHex()).toBe(ROAD_TONES.street)
    expect(curbs.visible).toBe(true)

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
    // The residential road is 6 m wide, so its curb line runs at 2.5-3.0 m.
    // A car turned across the road, or parked on the sidewalk, breaks this.
    expect(maxAbsY).toBeLessThanOrEqual(2.5)
    expect(minAbsY).toBeGreaterThan(0.4)
    expect(maxZ).toBeCloseTo(1.35, 2)

    props.dispose()
  })

  it('is deterministic: the same extract lays out the same street twice', () => {
    const m = propsModel()
    const a = buildStreetProps(m, buildCollisionGrid(m))
    const b = buildStreetProps(m, buildCollisionGrid(m))

    for (const name of ['tree-trunks', 'tree-canopies', 'cars']) {
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

  it('hands back one obstacle per car and trunk, and none per canopy', () => {
    const m = propsModel()
    const props = buildStreetProps(m, buildCollisionGrid(m))

    expect(props.obstacles).toHaveLength(
      props.stats.carCount + props.stats.treeCount
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
