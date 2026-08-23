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
