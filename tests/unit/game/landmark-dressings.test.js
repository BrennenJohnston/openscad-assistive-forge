import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  dressingFor,
  LANDMARK_DRESSINGS,
  LIBRARY_DIAGRID,
  LIBRARY_PLATFORMS,
  LIBRARY_TOWARD_4TH_AVE_DEG,
  LIBRARY_WAY_ID,
  libraryPlatformRing,
  needleLegPoint,
  NEEDLE_LEG,
  NEEDLE_LEG_BEARINGS_RAD,
  NEEDLE_WAY_ID,
} from '../../../src/js/game/landmark-dressings.js'
import { parseCityExtract } from '../../../src/js/game/city-data.js'
import { buildCityGroup } from '../../../src/js/game/city-scene.js'

function seattle() {
  return parseCityExtract(
    JSON.parse(
      readFileSync(
        join(process.cwd(), 'public', 'examples', 'ascii-city', 'seattle.json'),
        'utf8'
      )
    )
  )
}

function ringCentroid(ring) {
  let a = 0
  let cx = 0
  let cy = 0
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i]
    const [x2, y2] = ring[(i + 1) % ring.length]
    const c = x1 * y2 - x2 * y1
    a += c
    cx += (x1 + x2) * c
    cy += (y1 + y2) * c
  }
  a /= 2
  return [cx / (6 * a), cy / (6 * a)]
}

describe('the dressing table', () => {
  it('is two named rows and nothing else', () => {
    expect([...LANDMARK_DRESSINGS.keys()].sort()).toEqual(
      [NEEDLE_WAY_ID, LIBRARY_WAY_ID].sort()
    )
    expect(dressingFor(NEEDLE_WAY_ID).legs).toBe('needle-tripod')
    expect(dressingFor(LIBRARY_WAY_ID).massing).toBe('library-platforms')
    // A building with no row takes the generic path, and so does one with no
    // id at all - a synthesized volume must never match a landmark.
    expect(dressingFor(1)).toBeNull()
    expect(dressingFor(undefined)).toBeNull()
    // Every row carries its source, because that is what makes the suspension
    // of the no-special-casing law auditable.
    for (const row of LANDMARK_DRESSINGS.values()) {
      expect(row.name).toBeTruthy()
      expect(row.source).toContain('published')
    }
  })

  it("keeps the Needle's tripod inside its published envelope", () => {
    for (const bearing of NEEDLE_LEG_BEARINGS_RAD) {
      const foot = needleLegPoint(bearing, 0)
      const waist = needleLegPoint(bearing, 1)
      expect(Math.hypot(foot[0], foot[1])).toBeCloseTo(NEEDLE_LEG.footRadiusM, 6)
      expect(Math.hypot(waist[0], waist[1])).toBeCloseTo(
        NEEDLE_LEG.waistRadiusM,
        6
      )
      expect(waist[2]).toBeCloseTo(NEEDLE_LEG.waistHeightM, 6)
      // The taper only ever draws IN. A leg that bulged outward on the way up
      // would not be an hourglass.
      let previous = Infinity
      for (let i = 0; i <= NEEDLE_LEG.segments; i++) {
        const p = needleLegPoint(bearing, i / NEEDLE_LEG.segments)
        const radius = Math.hypot(p[0], p[1])
        expect(radius).toBeLessThanOrEqual(previous + 1e-9)
        previous = radius
      }
    }
  })
})

describe('the Library platforms', () => {
  it('rise in order and leave a gap for each of the four planes', () => {
    expect(LIBRARY_PLATFORMS).toHaveLength(5)
    for (let i = 0; i < LIBRARY_PLATFORMS.length; i++) {
      const p = LIBRARY_PLATFORMS[i]
      expect(p.toH).toBeGreaterThan(p.fromH)
      if (i === 0) continue
      // ★ THE GAPS ARE THE FOUR FLOWING PLANES. Contiguous bands would make a
      // wedding cake of setbacks, which is the one shape the published
      // building is not, so a gap is a requirement and not a rounding.
      const gap = p.fromH - LIBRARY_PLATFORMS[i - 1].toH
      expect(gap).toBeGreaterThan(0.02)
    }
    expect(LIBRARY_PLATFORMS[0].fromH).toBe(0)
    expect(LIBRARY_PLATFORMS.at(-1).toH).toBe(1)
    // The plinth meets all four sidewalks; every platform above it is smaller.
    expect(LIBRARY_PLATFORMS[0].scale).toEqual([1, 1])
    for (const p of LIBRARY_PLATFORMS.slice(1)) {
      expect(p.scale[0]).toBeLessThan(1)
      expect(p.scale[1]).toBeLessThan(1)
    }
    // The book spiral is the one that throws itself back out over 4th Avenue,
    // and it is the only platform that does.
    const spiral = LIBRARY_PLATFORMS.find((p) => p.name === 'book spiral')
    expect(spiral.toward4thM).toBeGreaterThan(0)
    for (const p of LIBRARY_PLATFORMS) {
      if (p === spiral) continue
      expect(p.toward4thM).toBeLessThanOrEqual(0)
    }
  })

  it('keeps the outline vertex count, which is what the lofts ride on', () => {
    const outer = [
      [0, 0],
      [10, 0],
      [10, 10],
      [4, 14],
      [0, 10],
    ]
    const centre = ringCentroid(outer)
    for (const platform of LIBRARY_PLATFORMS) {
      expect(libraryPlatformRing(outer, centre, platform)).toHaveLength(
        outer.length
      )
    }
  })

  it('draws a diagrid the character grid can actually resolve', () => {
    // ★ A MEMBER THINNER THAN A CHARACTER CELL CANNOT MAKE A CELL DARK. The
    // published members are ~0.3 m and photographed as nothing at all from
    // 4th Avenue; the shipped width is a diagram at the resolution this
    // medium has. The cell is 4 px wide, so at the 90 m gate distance a
    // member must clear one cell across with room to spare.
    const PX_PER_M_AT_90M = 900 / (2 * 90 * Math.tan(Math.PI / 6))
    expect(LIBRARY_DIAGRID.memberM * PX_PER_M_AT_90M).toBeGreaterThan(8)
    // ★ AND THE DIAMOND IS TALLER THAN IT IS WIDE, because the cell is 9 px
    // tall against 4 px wide and the vertical axis is the starved one.
    expect(LIBRARY_DIAGRID.heightM / LIBRARY_DIAGRID.widthM).toBeGreaterThan(
      1.5
    )
    // The glass is EXACT black and the steel is the bright thing (CW-40's
    // law): a bright web wrapped around empty cells is what photographed, and
    // dark members on lit glass photographed as a textured wall.
    expect(LIBRARY_DIAGRID.paneLevel).toEqual([0, 0])
    expect(LIBRARY_DIAGRID.memberLevel).toBeGreaterThan(200)
  })
})

describe('the shipped Seattle extract, pinned', () => {
  it('still puts 4th Avenue where the platform offsets say it is', () => {
    // ★ THE OFFSETS ARE MEANINGLESS IF THE BLOCK MOVES. A rebake that shifts
    // or re-traces this block would silently point the cantilever at the
    // wrong street, and no photograph anyone takes afterwards would say so.
    const model = seattle()
    const lib = model.buildings.find((b) => b.id === LIBRARY_WAY_ID)
    expect(lib).toBeTruthy()
    const [cx, cy] = ringCentroid(lib.outer)
    const bearing = (LIBRARY_TOWARD_4TH_AVE_DEG * Math.PI) / 180
    const fx = Math.sin(bearing)
    const fy = Math.cos(bearing)

    const nearest = (name) => {
      let best = null
      for (const road of model.roads) {
        if (road.name !== name) continue
        for (const [x, y] of road.points) {
          const d = Math.hypot(x - cx, y - cy)
          if (!best || d < best.d) best = { d, along: (x - cx) * fx + (y - cy) * fy }
        }
      }
      return best
    }

    const fourth = nearest('4th Avenue')
    const fifth = nearest('5th Avenue')
    expect(fourth).toBeTruthy()
    expect(fifth).toBeTruthy()
    // 4th Avenue lies in the direction the table calls "toward 4th"; 5th lies
    // the other way. Both within a block of the centroid.
    expect(fourth.along).toBeGreaterThan(40)
    expect(fifth.along).toBeLessThan(-40)
    expect(fourth.d).toBeLessThan(70)
    expect(fifth.d).toBeLessThan(70)
  })

  it('still has the four roof planes the massing exists to replace', () => {
    // ★ THE PROMPT, THE STATUS FILE AND THE R6 RECORD ALL SAID THIS BUILDING
    // HAS NO `building:part` VOLUMES. It has four, every one of them tagged
    // `building:part=roof` with no height, so each takes the parser default
    // and stands as a slab inside the box. They are why the dressing
    // REPLACES rather than adds - and if a rebake ever gives them real
    // heights, that decision is worth revisiting rather than inheriting.
    const lib = seattle().buildings.find((b) => b.id === LIBRARY_WAY_ID)
    expect(lib.parts).toHaveLength(4)
    expect(lib.partsAreMass).toBe(false)
    for (const part of lib.parts) expect(part.minHeightM).toBe(0)
  })
})

describe('the one hook in the building path', () => {
  const CENTER = { lat: 47.612, lon: -122.34 }

  function cityWith(id) {
    const lib = JSON.parse(
      readFileSync(
        join(process.cwd(), 'public', 'examples', 'ascii-city', 'seattle.json'),
        'utf8'
      )
    ).elements.find((e) => e.id === 37056442)
    return parseCityExtract(
      {
        elements: [
          { ...lib, id },
          {
            type: 'way',
            id: 99,
            tags: { highway: 'residential' },
            geometry: [
              { lat: 47.6, lon: -122.35 },
              { lat: 47.6, lon: -122.33 },
            ],
          },
        ],
      },
      { center: CENTER }
    )
  }

  const buildingTriangles = (model) => {
    const { group, dispose } = buildCityGroup(model)
    const total = group.children
      .filter((c) => c.name === 'buildings')
      .reduce((n, m) => n + m.geometry.getAttribute('position').count / 3, 0)
    dispose()
    return total
  }

  it('replaces the box with five platforms and four planes', () => {
    // The outline is a 12-gon: extruded it is 12 side quads and two caps -
    // 44 triangles. Five platforms of the same ring is 220, and each of the
    // four lofts is one quad per edge, 96 more. 316.
    //
    // ★ THE THREE WAYS THIS CAN GO WRONG ALL LAND ON DIFFERENT NUMBERS. 44 is
    // the dressing not firing; 360 is it ADDING instead of replacing, which
    // would leave the box buried inside the platforms; 220 is the flowing
    // planes missing and the building back to a wedding cake.
    expect(buildingTriangles(cityWith(37056442))).toBe(316)
  })

  it('leaves a building with no row on the generic path', () => {
    // The same outline, the same tags, one digit different in the id.
    expect(buildingTriangles(cityWith(37056443))).toBe(44)
  })

  it('gives the whole of Seattle exactly one diagrid', () => {
    // ★ THE FACADE FAMILY IS RESERVED, AND THIS IS WHAT SAYS SO. The diagrid
    // sits after the nine archetypes in every array the buildings loop
    // indexes, and the generic hash divides by the nine, so no ordinary
    // building can land on it. Appending it to WINDOW_ARCHETYPES instead
    // would give roughly one building in ten a diamond skin, in every city,
    // and nothing else in the suite would notice - so this asks a real
    // 4,000-building city rather than a fixture.
    const { group, dispose } = buildCityGroup(seattle())
    const meshes = group.children.filter((c) => c.name === 'buildings')
    const tris = meshes.map(
      (m) => m.geometry.getAttribute('position').count / 3
    )
    // The dressing buckets come last, so the diagrid is the final mesh, and
    // it holds the Library's platforms and planes and nothing else.
    expect(tris.at(-1)).toBe(316)
    // Every other family is a real share of the city, not a stray landmark.
    for (const n of tris.slice(0, -1)) expect(n).toBeGreaterThan(1000)
    dispose()
  })
})
