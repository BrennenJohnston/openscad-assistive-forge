import { describe, it, expect } from 'vitest'
import { Color, Mesh, Scene } from 'three'
import { createClassPass, SURFACE_CLASS } from '../../../src/js/game/city-class-pass.js'

/**
 * The class pass needs a GL context to produce a picture, so what CAN be
 * pinned without one is the contract around it: which material each named mesh
 * is dressed in, what that material's shader is asked to compute, and that the
 * readback is turned the right way up.
 *
 * D-73 is the reason the shader assertion exists. The roof test asks which way
 * a face points, and it was asking relative to the CAMERA rather than to the
 * world, so a wall the walker stood square to classified as a rooftop and was
 * drawn with the horizontal roof glyphs - venetian blinds across every facade
 * you looked straight at. Nothing failed: the picture was merely wrong. The
 * guard below fails if a normal ever goes through a matrix on its way into
 * vUp again.
 */

/** A renderer stub that records the calls and hands back canned pixels. */
function fakeRenderer(fill) {
  const calls = []
  return {
    calls,
    getRenderTarget: () => null,
    getClearColor: (c) => c.set(0x123456),
    getClearAlpha: () => 1,
    setRenderTarget: (t) => calls.push(['setRenderTarget', t]),
    setClearColor: (c, a) => calls.push(['setClearColor', new Color(c).getHex(), a]),
    clear: () => calls.push(['clear']),
    render: () => calls.push(['render']),
    readRenderTargetPixels: (_t, _x, _y, w, h, out) => {
      for (let i = 0; i < w * h; i++) out[i * 4] = fill(i % w, Math.floor(i / w))
    },
  }
}

function sceneWith(names) {
  const scene = new Scene()
  for (const name of names) {
    const mesh = new Mesh()
    mesh.name = name
    mesh.material = { tag: `original:${name}` }
    scene.add(mesh)
  }
  return scene
}

/** A scene whose meshes wear the depth bias their real materials wear. */
function sceneWithOffsets(spec) {
  const scene = new Scene()
  for (const [name, offset] of Object.entries(spec)) {
    const mesh = new Mesh()
    mesh.name = name
    mesh.material = offset
      ? {
          tag: `original:${name}`,
          polygonOffset: true,
          polygonOffsetFactor: offset[0],
          polygonOffsetUnits: offset[1],
        }
      : { tag: `original:${name}` }
    scene.add(mesh)
  }
  return scene
}

/**
 * The class material each named mesh wears WHILE the pass is rendering - the
 * only moment it can be caught, since the pass puts the originals back.
 */
function materialsDuringPass(scene) {
  const seen = new Map()
  const renderer = fakeRenderer(() => 0)
  renderer.render = () =>
    scene.traverse((o) => {
      if (o.isMesh) seen.set(o.name, o.material)
    })
  const pass = createClassPass(renderer, scene)
  pass.read({}, 4, 3)
  pass.dispose()
  return seen
}

describe('city-class-pass', () => {
  it('asks which way a face points in the WORLD, never relative to the camera (D-73)', () => {
    const seen = materialsDuringPass(sceneWith(['buildings']))
    const vertex = seen.get('buildings').vertexShader
    const vUpLine = vertex
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.startsWith('vUp'))

    expect(vUpLine).toBe('vUp = normalize(normal).z;')
    // normalMatrix is built from modelViewMatrix, so it answers a question
    // about the camera. viewMatrix and modelViewMatrix are the same trap.
    expect(vertex).not.toMatch(/vUp[^;]*\b(normalMatrix|viewMatrix|modelViewMatrix)\b/)
  })

  it('only buildings get a roof id; everything else has the split switched off', () => {
    const seen = materialsDuringPass(sceneWith(['buildings', 'roads', 'people']))
    expect(seen.get('buildings').uniforms.uId.value).toBe(SURFACE_CLASS.BUILDING_WALL)
    expect(seen.get('buildings').uniforms.uRoofId.value).toBe(SURFACE_CLASS.BUILDING_ROOF)
    expect(seen.get('roads').uniforms.uId.value).toBe(SURFACE_CLASS.ROAD)
    expect(seen.get('roads').uniforms.uRoofId.value).toBe(0)
    expect(seen.get('people').uniforms.uId.value).toBe(SURFACE_CLASS.PERSON)
  })

  it('dresses an unknown mesh as sky rather than leaving it in its own colours', () => {
    const seen = materialsDuringPass(sceneWith(['confetti']))
    expect(seen.get('confetti').uniforms.uId.value).toBe(SURFACE_CLASS.SKY)
  })

  it('dresses the CW-43 street furniture in the voices of what it resembles', () => {
    // Zero new class ids on purpose: the span table is exactly full, and at
    // playable sizes a hydrant is a few cells - a distinct vocabulary could
    // not show (the CW-43 record's photographs check this call).
    const seen = materialsDuringPass(
      sceneWith([
        'bus-stop-poles',
        'bus-stop-shelters',
        'benches',
        'waste-baskets',
        'bike-racks',
        'hydrants',
      ])
    )
    expect(seen.get('bus-stop-poles').uniforms.uId.value).toBe(
      SURFACE_CLASS.MAST
    )
    expect(seen.get('bus-stop-shelters').uniforms.uId.value).toBe(
      SURFACE_CLASS.BUILDING_WALL
    )
    // A shelter is a box, not a tower: no roof split.
    expect(seen.get('bus-stop-shelters').uniforms.uRoofId.value).toBe(0)
    expect(seen.get('benches').uniforms.uId.value).toBe(SURFACE_CLASS.CAR)
    expect(seen.get('waste-baskets').uniforms.uId.value).toBe(
      SURFACE_CLASS.CAR
    )
    expect(seen.get('bike-racks').uniforms.uId.value).toBe(SURFACE_CLASS.CAR)
    expect(seen.get('hydrants').uniforms.uId.value).toBe(SURFACE_CLASS.LAMP)
  })

  it('carries each mesh own depth bias into the class material (D-110)', () => {
    // Several of this city surfaces are deliberately coplanar with the one
    // behind them and are pulled forward by a polygon offset rather than by a
    // gap. Dressing them in a material that DROPS that offset makes them
    // coplanar again here, in the id buffer, where the winner is then decided
    // by floating-point luck and re-rolled by any view change - and the class
    // id is what picks the cell glyph vocabulary. MEASURED before the fix,
    // over a 20-frame sub-cell turn at the Seattle spawn: 104,180 class
    // transitions, 101,263 of them the storefront/wall pair.
    const seen = materialsDuringPass(
      sceneWithOffsets({
        buildings: null,
        storefronts: [-2, -2],
        roads: [-1, -1],
        'road-lines': [-4, -4],
      })
    )
    const wall = seen.get('buildings')
    expect(wall.polygonOffset).toBe(false)
    expect(wall.polygonOffsetFactor).toBe(0)

    const front = seen.get('storefronts')
    expect(front.polygonOffset).toBe(true)
    expect(front.polygonOffsetFactor).toBe(-2)
    expect(front.polygonOffsetUnits).toBe(-2)

    // Not one shared offset for everything: paint sits in front of its
    // roadway by a different amount than a storefront sits off its wall.
    expect(seen.get('roads').polygonOffsetFactor).toBe(-1)
    expect(seen.get('road-lines').polygonOffsetFactor).toBe(-4)

    // And the storefront must actually WIN against the wall it covers - a
    // matching pair of numbers proves nothing if both are zero.
    expect(front.polygonOffsetFactor).toBeLessThan(wall.polygonOffsetFactor)
  })

  it('gives two meshes of one class different materials when their bias differs', () => {
    // The material cache is keyed on the offset as well as the class, or the
    // first mesh of a class would lend its depth bias to every later one.
    // Curbs and painted lines share the CURB voice (CW-51) but sit at
    // different depths above the roadway.
    const seen = materialsDuringPass(
      sceneWithOffsets({ curbs: [-2, -2], 'road-lines': [-4, -4] })
    )
    expect(seen.get('curbs').uniforms.uId.value).toBe(SURFACE_CLASS.CURB)
    expect(seen.get('road-lines').uniforms.uId.value).toBe(SURFACE_CLASS.CURB)
    expect(seen.get('curbs')).not.toBe(seen.get('road-lines'))
    expect(seen.get('curbs').polygonOffsetFactor).toBe(-2)
    expect(seen.get('road-lines').polygonOffsetFactor).toBe(-4)
  })

  it('puts every material back after the pass', () => {
    const scene = sceneWith(['buildings', 'roads'])
    const pass = createClassPass(fakeRenderer(() => 0), scene)
    pass.read({}, 4, 3)
    const tags = []
    scene.traverse((o) => {
      if (o.isMesh) tags.push(o.material.tag)
    })
    expect(tags).toEqual(['original:buildings', 'original:roads'])
    pass.dispose()
  })

  it('turns the readback the right way up: row 0 is the TOP of the picture', () => {
    // readRenderTargetPixels hands back rows bottom-up. Fill row y with y+1 so
    // an unflipped map would come back starting at the largest value.
    const pass = createClassPass(fakeRenderer((_x, y) => y + 1), sceneWith(['roads']))
    const map = pass.read({}, 2, 3)
    expect(Array.from(map)).toEqual([3, 3, 2, 2, 1, 1])
    pass.dispose()
  })

  it('refuses a degenerate grid and refuses to work once disposed', () => {
    const pass = createClassPass(fakeRenderer(() => 0), sceneWith(['roads']))
    expect(pass.read({}, 0, 3)).toBeNull()
    expect(pass.read({}, 4, 0)).toBeNull()
    pass.dispose()
    expect(pass.read({}, 4, 3)).toBeNull()
  })
})

/**
 * ★ CW-56: the question this map keeps failing.
 *
 * A mesh name missing from CLASS_BY_MESH_NAME is not an error anywhere. The
 * pass simply leaves that mesh out, and it reads as SKY - a safe default for
 * a mesh nobody added, and a silent, invisible defect for one somebody just
 * did. CW-56 built a ground mesh that would have been dressed in the sky's
 * voice, and nothing anywhere would have said so.
 *
 * So this does not copy the list. It BUILDS a city, enumerates the meshes the
 * builders actually made, and asks the map about each one. A future release
 * that adds a mesh and forgets this map fails here rather than in a
 * photograph nobody takes.
 */
describe('every mesh the city builds has a class (CW-56)', () => {
  it('asks the builders, not a copy of the list', async () => {
    const [
      { CLASS_BY_MESH_NAME },
      { buildStreetProps, buildFireworks, buildTraveler },
      data,
      walk,
    ] = await Promise.all([
      import('../../../src/js/game/city-class-pass.js'),
      import('../../../src/js/game/city-scene.js'),
      import('../../../src/js/game/city-data.js'),
      import('../../../src/js/game/walk-controls.js'),
    ])
    const { buildCollisionGrid } = walk
    const CENTER = { lat: 40, lon: -100 }
    const COS = Math.cos((CENTER.lat * Math.PI) / 180)
    const pt = (xM, yM) => ({
      lat: CENTER.lat + yM / 110540,
      lon: CENTER.lon + xM / (111320 * COS),
    })
    const ring = (cx, cy, h) => [
      pt(cx - h, cy - h),
      pt(cx + h, cy - h),
      pt(cx + h, cy + h),
      pt(cx - h, cy + h),
      pt(cx - h, cy - h),
    ]
    const model = data.parseCityExtract(
      {
        elements: [
          {
            type: 'way',
            id: 1,
            tags: { building: 'yes', height: '20' },
            geometry: ring(-60, -60, 6),
          },
          {
            type: 'way',
            id: 2,
            tags: { building: 'yes', height: '20' },
            geometry: ring(60, 60, 6),
          },
          {
            type: 'way',
            id: 3,
            tags: { highway: 'residential' },
            geometry: [pt(-50, 0), pt(50, 0)],
          },
          { type: 'node', id: 4, tags: { natural: 'tree' }, ...pt(10, 6) },
          {
            type: 'node',
            id: 5,
            tags: { highway: 'bus_stop', shelter: 'yes' },
            ...pt(-14, 3),
          },
          { type: 'node', id: 6, tags: { amenity: 'bench' }, ...pt(-8, 3) },
          {
            type: 'node',
            id: 7,
            tags: { emergency: 'fire_hydrant' },
            ...pt(-4, 3),
          },
        ],
      },
      { center: CENTER }
    )
    const props = buildStreetProps(model, buildCollisionGrid(model))
    const built = props.group.children.filter((c) => c.isMesh).map((c) => c.name)
    expect(built.length).toBeGreaterThan(4)

    /**
     * ★★ CW-65: THE GUARD HAD A HOLE THE SIZE OF EVERY STANDALONE BUILDER.
     * It enumerated buildStreetProps and nothing else, so `fireworks` (CW-64)
     * and `traveler` (CW-65) were both outside what it could see - and a mesh
     * it cannot see is exactly the mesh that gets forgotten. Ask THEM too.
     */
    const fireworks = buildFireworks(1000)
    const traveler = buildTraveler('seattle')
    traveler.place(0, 0, 0)
    const standalone = [
      ...fireworks.group.children,
      ...traveler.group.children,
    ]
      .filter((c) => c.isMesh)
      .map((c) => c.name)
    expect(standalone).toContain('fireworks')
    expect(standalone).toContain('traveler')
    built.push(...standalone)
    const orphans = built.filter((n) => !CLASS_BY_MESH_NAME.has(n))
    expect(
      orphans,
      `these meshes would be dressed as SKY: ${orphans.join(', ')}`
    ).toEqual([])
    // The fixture is built so the props include a spread of classes, not one:
    // a guard that only ever sees tree trunks would pass with every other
    // mesh unclassified.
    expect(built).toContain('tree-trunks')
    expect(built).toContain('cars')
    expect(built).toContain('people')
    expect(CLASS_BY_MESH_NAME.get('tree-trunks')).toBe(SURFACE_CLASS.TREE)
    props.dispose()
  })
})
