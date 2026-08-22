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

  it('hands back one obstacle per car and trunk, and none per canopy', () => {
    const m = propsModel()
    const props = buildStreetProps(m, buildCollisionGrid(m))

    expect(props.obstacles).toHaveLength(
      props.stats.carCount + props.stats.treeCount + props.stats.lampCount
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

    // The road runs along y = 0 at width 6, so every pole stands on the
    // 3.45 m sidewalk line of one side or the other and nowhere in between
    // (a vertex sits half the 0.15 m post off that line).
    const sides = new Set()
    for (const [, y] of poles) {
      expect(Math.abs(Math.abs(y) - 3.45)).toBeLessThanOrEqual(0.076)
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
      // Reaching back toward the centerline from the 3.45 m pole line.
      expect(Math.abs(y)).toBeLessThan(3.45)
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
