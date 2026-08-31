import { describe, it, expect } from 'vitest'
import {
  CITY_LIGHT_PROVENANCE,
  metresFrom,
  pageUrl,
  fetchPoles,
  polesToElements,
} from '../../scripts/city-light-poles.mjs'

const CENTER = { lat: 47.612, lon: -122.34 }
const R = 1300
const noSleep = async () => {}

/** A pole feature, `dm` metres north of the centre. */
function pole(id, dm, { lit = true, heightFt = 0 } = {}) {
  return {
    attributes: {
      ASSET_ID: String(id),
      HEIGHT: heightFt,
      HasStreetlight: lit ? 'Yes' : 'No',
    },
    geometry: { x: CENTER.lon, y: CENTER.lat + dm / 110540 },
  }
}

describe('provenance', () => {
  it('says out loud that the source states no licence, and who authorised it', () => {
    // The whole reason this needed a gate question. A file that carried the
    // poles without saying this would be the dishonest version.
    expect(CITY_LIGHT_PROVENANCE.license).toMatch(/no licence is stated/i)
    expect(CITY_LIGHT_PROVENANCE.license).toContain('CW-Q76')
    expect(CITY_LIGHT_PROVENANCE.publisher).toBe('City of Seattle')
    expect(CITY_LIGHT_PROVENANCE.service).toContain('arcgis.com')
  })

  it('names no Google surface anywhere', () => {
    // Plan section 8.3, checked rather than assumed.
    const text = JSON.stringify(CITY_LIGHT_PROVENANCE)
    expect(/google/i.test(text)).toBe(false)
  })
})

describe('pageUrl', () => {
  it('asks the FEATURE endpoint, in metres, with geometry', () => {
    const u = pageUrl(CENTER, R, 2000)
    expect(u).toContain('/FeatureServer/0/query')
    expect(u).toContain('units=esriSRUnit_Meter')
    expect(u).toContain('returnGeometry=true')
    expect(u).toContain('outSR=4326')
    expect(u).toContain('resultOffset=2000')
    expect(u).not.toContain('returnCountOnly')
  })
})

describe('fetchPoles', () => {
  it('pages until a short page and stops', async () => {
    const pages = [
      Array.from({ length: 3 }, (_, i) => pole(i, 10)),
      Array.from({ length: 3 }, (_, i) => pole(100 + i, 20)),
      [pole(999, 30)],
    ]
    let n = 0
    const out = await fetchPoles({
      center: CENTER,
      radiusM: R,
      pageSize: 3,
      sleep: noSleep,
      fetchJson: async () => ({ ok: true, body: { features: pages[n++] } }),
    })
    expect(out.pages).toBe(3)
    expect(out.features).toHaveLength(7)
  })

  it('backs off a 429 and carries on', async () => {
    const waits = []
    let first = true
    const out = await fetchPoles({
      center: CENTER,
      radiusM: R,
      pageSize: 2,
      sleep: async (ms) => waits.push(ms),
      fetchJson: async () => {
        if (first) {
          first = false
          return { ok: false, status: 429 }
        }
        return { ok: true, body: { features: [pole(1, 5)] } }
      },
    })
    expect(waits).toEqual([30000])
    expect(out.features).toHaveLength(1)
  })

  it('throws on a status it cannot retry, rather than baking a partial city', async () => {
    await expect(
      fetchPoles({
        center: CENTER,
        radiusM: R,
        sleep: noSleep,
        fetchJson: async () => ({ ok: false, status: 403 }),
      })
    ).rejects.toThrow(/HTTP 403/)
  })
})

describe('polesToElements', () => {
  it('keeps only the poles that carry a streetlight', () => {
    const out = polesToElements(
      [pole(1, 10), pole(2, 20, { lit: false }), pole(3, 30)],
      CENTER,
      R
    )
    expect(out.kept).toBe(2)
    expect(out.notLit).toBe(1)
    expect(out.elements.every((e) => e.tags.highway === 'street_lamp')).toBe(true)
  })

  it('★ RE-MEASURES the radius, because the service own filter cannot be trusted', () => {
    // The service reports 21,703 poles inside this circle and returns 4,115.
    // Anything it hands back is checked here against the distance rather than
    // believed, and this is the case that proves the check is live.
    const out = polesToElements([pole(1, 10), pole(2, R + 400)], CENTER, R)
    expect(out.kept).toBe(1)
    expect(out.outside).toBe(1)
  })

  it('gives every pole a NEGATIVE id, so nothing is mistaken for OSM', () => {
    const out = polesToElements([pole(1353729, 10)], CENTER, R)
    expect(out.elements[0].id).toBe(-1353729)
    expect(out.elements[0].tags.ref).toBe('1353729')
    expect(out.elements[0].tags.operator).toBe('Seattle City Light')
  })

  it('converts a recorded height from feet, and carries none where it is zero', () => {
    // 1,736 of the 4,115 poles carry a height; the rest record 0, which means
    // "not surveyed" in this register and must never become a 0 m lamp post.
    const withH = polesToElements([pole(7, 10, { heightFt: 30 })], CENTER, R)
    expect(withH.elements[0].tags.height).toBe('9.1')
    expect(withH.withHeight).toBe(1)
    const withoutH = polesToElements([pole(8, 10, { heightFt: 0 })], CENTER, R)
    expect(withoutH.elements[0].tags.height).toBeUndefined()
    expect(withoutH.withHeight).toBe(0)
  })

  it('skips a feature with no usable geometry instead of emitting a NaN', () => {
    const out = polesToElements(
      [{ attributes: { HasStreetlight: 'Yes' }, geometry: null }, pole(9, 5)],
      CENTER,
      R
    )
    expect(out.kept).toBe(1)
  })

  it('metresFrom measures on the ground, not in degrees', () => {
    expect(metresFrom(CENTER, CENTER.lat + 100 / 110540, CENTER.lon)).toBeCloseTo(
      100,
      1
    )
  })
})
