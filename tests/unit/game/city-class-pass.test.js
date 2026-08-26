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
