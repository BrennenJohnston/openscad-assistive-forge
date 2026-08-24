import { describe, it, expect } from 'vitest'
import {
  FIGURE_HEIGHT_MIN_M,
  FIGURE_HEIGHT_MAX_M,
  FIGURE_BUILD_MIN,
  FIGURE_BUILD_MAX,
  FIGURE_POSES,
  makeFigureSpec,
  makeFigureGeoms,
} from '../../../src/js/game/city-figures.js'

/** The same LCG shape the scene uses - deterministic across runs. */
function lcg(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0x100000000
  }
}

const boundsOf = (geoms) => {
  let minZ = Infinity
  let maxZ = -Infinity
  let minF = Infinity
  let maxF = Infinity * -1
  for (const g of geoms) {
    g.computeBoundingBox()
    minZ = Math.min(minZ, g.boundingBox.min.z)
    maxZ = Math.max(maxZ, g.boundingBox.max.z)
    minF = Math.min(minF, g.boundingBox.min.x)
    maxF = Math.max(maxF, g.boundingBox.max.x)
  }
  return { minZ, maxZ, minF, maxF }
}

const allOf = (zones) => [...zones.legs, ...zones.torso, ...zones.figure]

describe('makeFigureSpec (CW-45, CW-Q45)', () => {
  it('draws every figure inside the signed, documented ranges', () => {
    // Height 1.50-1.95 m ~ the adult 1st-99th percentile stature span
    // across sexes (CDC/NHANES anthropometric reference, Series 3 No. 46);
    // build 0.85-1.15x. 200 draws stay inside.
    const rng = lcg(7)
    for (let i = 0; i < 200; i++) {
      const spec = makeFigureSpec(rng, FIGURE_POSES[i % FIGURE_POSES.length])
      expect(spec.heightM).toBeGreaterThanOrEqual(FIGURE_HEIGHT_MIN_M)
      expect(spec.heightM).toBeLessThanOrEqual(FIGURE_HEIGHT_MAX_M)
      expect(spec.build).toBeGreaterThanOrEqual(FIGURE_BUILD_MIN)
      expect(spec.build).toBeLessThanOrEqual(FIGURE_BUILD_MAX)
      expect(Math.abs(spec.phase)).toBeLessThanOrEqual(1)
    }
  })

  it('the same seed always yields the same person in the same place', () => {
    const a = makeFigureSpec(lcg(42), 'walking')
    const b = makeFigureSpec(lcg(42), 'walking')
    expect(a).toEqual(b)

    const ga = allOf(makeFigureGeoms(3, -4, 0.7, a))
    const gb = allOf(makeFigureGeoms(3, -4, 0.7, b))
    expect(ga.length).toBe(gb.length)
    for (let i = 0; i < ga.length; i++) {
      expect(Array.from(ga[i].getAttribute('position').array)).toEqual(
        Array.from(gb[i].getAttribute('position').array)
      )
    }
  })
})

describe('makeFigureGeoms', () => {
  it('is a jointed figure: eleven boxes in three tint zones', () => {
    const zones = makeFigureGeoms(0, 0, 0, makeFigureSpec(lcg(1), 'walking'))
    // 2x(thigh+shin) + torso + 2x(upper+forearm) + shoulders + head.
    expect(zones.legs).toHaveLength(4)
    expect(zones.torso).toHaveLength(5)
    expect(zones.figure).toHaveLength(2)
  })

  it('stands on the ground and tops out at its own height', () => {
    for (const seed of [3, 9, 27]) {
      const spec = makeFigureSpec(lcg(seed), 'standing')
      const b = boundsOf(allOf(makeFigureGeoms(0, 0, 0, spec)))
      // The straighter leg's foot touches. Pelvis height comes from the
      // segment CENTERLINE, so a swung shin's bottom CORNER can dip a few
      // millimetres under z=0 - under the drawn ground, invisible - and
      // small pose bends may lift the other sole a couple of centimetres.
      expect(b.minZ).toBeGreaterThanOrEqual(-0.02)
      expect(b.minZ).toBeLessThan(0.06)
      expect(b.maxZ).toBeGreaterThan(spec.heightM * 0.9)
      expect(b.maxZ).toBeLessThan(spec.heightM * 1.05)
    }
  })

  it('a taller draw is a taller figure', () => {
    const short = makeFigureGeoms(0, 0, 0, {
      pose: 'standing',
      heightM: FIGURE_HEIGHT_MIN_M,
      build: 1,
      phase: 0.2,
      seatZ: 0.45,
    })
    const tall = makeFigureGeoms(0, 0, 0, {
      pose: 'standing',
      heightM: FIGURE_HEIGHT_MAX_M,
      build: 1,
      phase: 0.2,
      seatZ: 0.45,
    })
    expect(boundsOf(allOf(tall)).maxZ).toBeGreaterThan(
      boundsOf(allOf(short)).maxZ + 0.3
    )
  })

  it('build widens shoulders and torso, and only them', () => {
    const at = (build) =>
      makeFigureGeoms(0, 0, 0, {
        pose: 'standing',
        heightM: 1.72,
        build,
        phase: 0,
        seatZ: 0.45,
      })
    const slim = at(FIGURE_BUILD_MIN)
    const broad = at(FIGURE_BUILD_MAX)
    const widthOf = (g) => {
      g.computeBoundingBox()
      return g.boundingBox.max.y - g.boundingBox.min.y
    }
    // figure[0] is the shoulder slab.
    expect(widthOf(broad.figure[0])).toBeGreaterThan(
      widthOf(slim.figure[0]) * 1.25
    )
    // The head (figure[1]) does not change with build.
    expect(widthOf(broad.figure[1])).toBeCloseTo(widthOf(slim.figure[1]), 9)
  })

  it('sits at bench height with its shins down', () => {
    const seatZ = 0.45
    const spec = { pose: 'sitting', heightM: 1.72, build: 1, phase: 0, seatZ }
    const zones = makeFigureGeoms(0, 0, 0, spec)
    const torsoBox = zones.torso[0]
    torsoBox.computeBoundingBox()
    // The torso starts at the seat, not at the ground.
    expect(torsoBox.boundingBox.min.z).toBeGreaterThan(seatZ - 0.05)
    // Knees carry the thighs forward of the torso.
    const legB = boundsOf(zones.legs)
    expect(legB.maxF).toBeGreaterThan(0.3)
    // And nothing reaches the standing height.
    expect(boundsOf(allOf(zones)).maxZ).toBeLessThan(1.5)
  })

  it('a jogger leans; a walker barely does', () => {
    const at = (pose) => {
      const zones = makeFigureGeoms(0, 0, 0, {
        pose,
        heightM: 1.72,
        build: 1,
        phase: 0.8,
        seatZ: 0.45,
      })
      const head = zones.figure[1]
      head.computeBoundingBox()
      return (head.boundingBox.min.x + head.boundingBox.max.x) / 2
    }
    expect(at('jogging')).toBeGreaterThan(at('walking') + 0.02)
    expect(at('walking')).toBeGreaterThanOrEqual(at('standing'))
  })

  it('faces where it is told: the stride advances along the facing', () => {
    const east = boundsOf(
      allOf(
        makeFigureGeoms(0, 0, 0, {
          pose: 'jogging',
          heightM: 1.72,
          build: 1,
          phase: 1,
          seatZ: 0.45,
        })
      )
    )
    // Facing 0 = +X: the front leg reaches forward of the pelvis.
    expect(east.maxF).toBeGreaterThan(0.2)
  })
})
