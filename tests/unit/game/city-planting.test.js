import { describe, it, expect } from 'vitest'
import {
  CITY_FLOWERS,
  flowerTableFor,
  pickFlower,
  planterBoxes,
  picnicTableBoxes,
  flowerbedPositions,
  PLANTER_L_M,
  PLANTER_W_M,
  PLANTER_H_M,
  TABLE_L_M,
  TABLE_W_M,
  TABLE_TOP_H_M,
} from '../../../src/js/game/city-planting.js'
import {
  pickPaletteIndex,
  normalizeChroma,
} from '../../../src/js/_hfm-paint.js'
import {
  HC_PALETTE_GREEN,
  HC_PALETTE_AMBER,
} from '../../../src/js/game/hc-palettes.js'

/**
 * CW-57 (CW-Q55): planters, flowerbeds and picnic tables.
 *
 * The flower tables are cited design data and the owner's to veto, so what is
 * guarded is not WHICH flowers - that is an argument - but that the tables are
 * well formed, that the shapes are the sizes they claim, and that the one
 * design claim worth making is true: the desert city's flowers read as desert
 * flowers.
 */
describe('plantings and their flowers (CW-57)', () => {
  const CITIES = Object.keys(CITY_FLOWERS)

  // D-112: the converter reads the frame AFTER the renderer's output
  // encoding, so a palette claim tested on the linear tint is a claim about
  // numbers nobody ever sees.
  const encode = (c) =>
    c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
  const parseHex = (h) =>
    [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
  const normalized = (p) => p.map((c) => normalizeChroma(parseHex(c)))
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
  const hueRgb = (deg) => {
    const h = ((((deg % 360) + 360) % 360) / 60) % 6
    const i = Math.floor(h) % 6
    const f = h - Math.floor(h)
    return [
      [1, f, 0],
      [1 - f, 1, 0],
      [0, 1, f],
      [0, 1 - f, 1],
      [f, 0, 1],
      [1, 0, 1 - f],
    ][i]
  }
  const tintOf = (tier, deg, chroma) => {
    const [hr, hg, hb] = hueRgb(deg)
    const hl = 0.2126 * hr + 0.7152 * hg + 0.0722 * hb
    return [
      clamp01(tier + (hr - hl) * chroma),
      clamp01(tier + (hg - hl) * chroma),
      clamp01(tier + (hb - hl) * chroma),
    ]
  }
  const landsOn = (hueDeg, palette) => {
    const e = tintOf(0.55, hueDeg, 0.35).map(encode)
    return palette[pickPaletteIndex(e[0], e[1], e[2], normalized(palette), 5)]
  }

  it('gives every city five well-formed rows', () => {
    expect(CITIES.sort()).toEqual([
      'albuquerque',
      'burnaby',
      'denver',
      'seattle',
    ])
    for (const city of CITIES) {
      const table = CITY_FLOWERS[city]
      expect(table, city).toHaveLength(5)
      for (const f of table) {
        expect(typeof f.name, city).toBe('string')
        expect(f.name.length).toBeGreaterThan(2)
        expect(f.hueDeg).toBeGreaterThanOrEqual(0)
        expect(f.hueDeg).toBeLessThan(360)
      }
    }
  })

  it('★ makes the desert city read as the desert, ENCODED (D-112)', () => {
    // The whole argument for per-city flower tables. Measured through the
    // encoded pipeline, not the linear tint: three of Albuquerque's five land
    // YELLOW, and not one of Seattle's does.
    const abqYellow = CITY_FLOWERS.albuquerque.filter(
      (f) => landsOn(f.hueDeg, HC_PALETTE_GREEN) === '#ffff00'
    )
    expect(abqYellow.map((f) => f.name)).toEqual([
      'yucca',
      'desert marigold',
      'chamisa',
    ])
    const seaYellow = CITY_FLOWERS.seattle.filter(
      (f) => landsOn(f.hueDeg, HC_PALETTE_GREEN) === '#ffff00'
    )
    expect(seaYellow).toEqual([])
    // And Seattle's are the pinks its parks plant.
    const seaMagenta = CITY_FLOWERS.seattle.filter(
      (f) => landsOn(f.hueDeg, HC_PALETTE_GREEN) === '#ff00ff'
    )
    expect(seaMagenta.length).toBeGreaterThanOrEqual(3)
  })

  it('records what the palettes do with a blue flower, rather than hiding it', () => {
    // ★ The ANSI set has SIX entries - green, cyan, yellow, magenta, red,
    // white - and NO BLUE. Colorado's columbine is blue-violet and British
    // Columbia's hydrangeas are blue. Neither can land on blue because there
    // is none; both land on their nearest neighbour there and on the neon
    // set's violet, which is right. Pinned so nobody later "fixes" the hue to
    // chase an entry that does not exist.
    expect(HC_PALETTE_GREEN).not.toContain('#0000ff')
    const columbine = CITY_FLOWERS.denver.find((f) => f.name === 'columbine')
    const hydrangea = CITY_FLOWERS.burnaby.find((f) => f.name === 'hydrangea')
    expect(landsOn(columbine.hueDeg, HC_PALETTE_AMBER)).toBe('#bf5fff')
    expect(landsOn(hydrangea.hueDeg, HC_PALETTE_AMBER)).toBe('#bf5fff')
    expect(landsOn(columbine.hueDeg, HC_PALETTE_GREEN)).toBe('#ff00ff')
    expect(landsOn(hydrangea.hueDeg, HC_PALETTE_GREEN)).toBe('#00ffff')
  })

  it('falls back to a table rather than to nothing', () => {
    expect(flowerTableFor('atlantis')).toBe(CITY_FLOWERS.seattle)
    expect(flowerTableFor('burnaby')).toBe(CITY_FLOWERS.burnaby)
    const drawn = new Set()
    for (let d = 0; d < 20; d++) {
      drawn.add(pickFlower(CITY_FLOWERS.denver, d).name)
    }
    expect(drawn.size).toBe(5)
  })

  it('builds a planter as a box with a separate flower lid', () => {
    const body = [0.3, 0.3, 0.3]
    const flower = [0.9, 0.2, 0.6]
    const boxes = planterBoxes(10, -4, 0, body, flower)
    expect(boxes).toHaveLength(2)
    const [box, lid] = boxes
    expect(box.l).toBe(PLANTER_L_M)
    expect(box.w).toBe(PLANTER_W_M)
    expect(box.tint).toBe(body)
    // The lid is INSET and SEPARATE, which is what lets the flowers change
    // colour without the box changing brightness: mono sees one shape.
    expect(lid.tint).toBe(flower)
    expect(lid.l).toBeLessThan(box.l)
    expect(lid.w).toBeLessThan(box.w)
    // Nothing pokes above the stated knee height.
    const top = lid.z + lid.h / 2
    expect(top).toBeCloseTo(PLANTER_H_M - 0.01, 5)
    // The two overlap rather than touching exactly - exactly-touching faces
    // are the coplanar fight D-110 is about.
    expect(lid.z - lid.h / 2).toBeLessThan(box.z + box.h / 2)
  })

  it('builds a picnic table you could sit at, at the height a table is', () => {
    const boxes = picnicTableBoxes(0, 0, 0, [0.4, 0.3, 0.2])
    expect(boxes).toHaveLength(5)
    const top = boxes[0]
    expect(top.z + top.h / 2).toBeCloseTo(TABLE_TOP_H_M, 5)
    expect(top.l).toBe(TABLE_L_M)
    // Two benches, one either side of the centre line, below the top.
    const benches = boxes.filter((b) => b.z > 0.4 && b.z < 0.5)
    expect(benches).toHaveLength(2)
    expect(Math.sign(benches[0].y)).toBe(-Math.sign(benches[1].y))
    // Nothing is wider than the stated footprint, which is what collision
    // stamps.
    for (const b of boxes) {
      expect(Math.abs(b.x)).toBeLessThanOrEqual(TABLE_L_M / 2 + 1e-9)
      expect(Math.abs(b.y)).toBeLessThanOrEqual(TABLE_W_M / 2 + 1e-9)
    }
  })

  it('sizes a flowerbed from its OWN area', () => {
    const small = flowerbedPositions(0, 0, 4, 1)
    const big = flowerbedPositions(0, 0, 60, 1)
    const tris = (a) => a.length / 9
    expect(tris(small)).toBeGreaterThan(0)
    // A 4 m2 bed and a 60 m2 bed are different objects, not the same stamp
    // twice - the parse kept the area precisely so this could be true.
    expect(tris(big)).toBeGreaterThan(tris(small) * 3)
    // Deterministic: the same bed is the same bed on every load.
    expect(flowerbedPositions(0, 0, 60, 1)).toEqual(big)
    expect(flowerbedPositions(0, 0, 60, 2)).not.toEqual(big)
    // A bed with no recorded area still gets something rather than nothing.
    expect(tris(flowerbedPositions(0, 0, 0, 3))).toBeGreaterThan(0)
    // Every patch lies flat, just off the ground.
    for (let i = 2; i < big.length; i += 3) {
      expect(big[i]).toBeGreaterThan(0)
      expect(big[i]).toBeLessThan(0.1)
    }
  })
})
