import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import {
  STOREFRONT_BAND_NAMES,
  storefrontBandFor,
  storefrontBandForBuilding,
} from '../../../src/js/game/city-scene.js'

/**
 * CW-74. The storefront picker read POI NODES within 35 m and nothing else, so
 * a building carrying `amenity=library` was never asked what it was: its
 * ground floor fell through to a hash of its index. The order is now the
 * building's OWN TAG, then the nearest POI, then the hash.
 */

const bandOf = (name) => {
  const i = STOREFRONT_BAND_NAMES.indexOf(name)
  expect(i, `no band called ${name}`).toBeGreaterThanOrEqual(0)
  return i
}

describe('storefrontBandForBuilding', () => {
  it('★ the building own tag beats a nearer POI of another kind', () => {
    // A bakery with a restaurant next door is a bakery. Before CW-74 the
    // restaurant won, because the building was never asked.
    const choice = storefrontBandForBuilding({ shop: 'bakery' }, 'restaurant')
    expect(choice).toEqual({
      band: bandOf('bakery'),
      kind: 'shop:bakery',
      source: 'own',
    })
  })

  it('falls to the nearest POI when the building says nothing', () => {
    const choice = storefrontBandForBuilding({ building: 'yes' }, 'cafe')
    expect(choice).toEqual({
      band: bandOf('cafe-tables'),
      kind: 'cafe',
      source: 'poi',
    })
  })

  it('falls to the hash when neither knows anything', () => {
    expect(storefrontBandForBuilding({ building: 'yes' }, null)).toEqual({
      band: undefined,
      kind: null,
      source: 'hash',
    })
    expect(storefrontBandForBuilding(undefined, null).source).toBe('hash')
  })

  it('a hotel keeps its lobby band (CW-53)', () => {
    const choice = storefrontBandForBuilding({ tourism: 'hotel' }, 'restaurant')
    expect(choice.band).toBe(bandOf('hotel'))
    expect(choice.source).toBe('own')
    // A hotel is a WAY in every one of the four extracts, never a node, so
    // the POI index could never see one.
    expect(storefrontBandFor('hotel')).toBe(bandOf('hotel'))
  })

  it('★ a building with no shopfront gets NO BAND, not a hashed one', () => {
    // 65 `amenity=parking` buildings across the four extracts were taking a
    // hashed shop window across their base.
    for (const amenity of ['parking', 'shelter', 'place_of_worship', 'fuel']) {
      expect(storefrontBandForBuilding({ amenity }, 'cafe')).toEqual({
        band: null,
        kind: null,
        source: 'own',
      })
    }
    expect(storefrontBandForBuilding({ shop: 'no' }, 'cafe').band).toBeNull()
  })

  it('a civic building gets a lobby, and the lobby speaks the temperature vocabulary', () => {
    for (const amenity of ['courthouse', 'townhall', 'police', 'school']) {
      const choice = storefrontBandForBuilding({ amenity }, null)
      expect(choice.band, amenity).toBe(bandOf('lobby'))
      // ★ `kind` is what the CW-46 warm/cool bias is keyed on, and the table
      // has no word for a courthouse. A band NAME is a different vocabulary
      // and putting one here loses the bias silently.
      expect(choice.kind, amenity).toBe('library')
    }
  })

  it('an unlisted shop value still reads as a shop (CW-53)', () => {
    const choice = storefrontBandForBuilding({ shop: 'car_repair' }, null)
    expect(choice.band).toBe(bandOf('glass'))
    expect(choice.kind).toBe('shop')
  })

  it('★ shop beats amenity beats tourism', () => {
    expect(
      storefrontBandForBuilding({ shop: 'bakery', amenity: 'cafe' }, null).band
    ).toBe(bandOf('bakery'))
    // ★ THE AMENITY/TOURISM HALF IS A CONVENTION, NOT A MEASUREMENT. Only
    // three buildings in the four extracts carry two of the three tags and
    // none of them distinguishes this order (the Library is a lobby either
    // way), so the case below is SYNTHETIC and pins the convention: what a
    // building IS beats what it is a destination FOR. The `shop` half is real
    // and is pinned against the extract further down.
    expect(
      storefrontBandForBuilding({ amenity: 'cafe', tourism: 'museum' }, null)
        .band
    ).toBe(bandOf('cafe-tables'))
  })

  it('ignores an empty tag rather than treating it as an answer', () => {
    expect(storefrontBandForBuilding({ shop: '' }, 'cafe').source).toBe('poi')
    expect(storefrontBandForBuilding({ amenity: '' }, null).source).toBe('hash')
  })
})

describe('the Central Library, pinned against the shipped extract', () => {
  // CW-63 left this on the ledger: the Library's ground floor was picked by a
  // coin toss. The pin reads the extract the game actually loads, so a rebake
  // that drops the tag reddens here rather than silently returning the
  // building to the hash.
  const extract = JSON.parse(
    readFileSync(
      resolve(process.cwd(), 'public/examples/ascii-city/seattle.json'),
      'utf-8'
    )
  )
  const library = extract.elements.find((e) => e.id === 37056442)

  it('is still in the extract, still tagged as a library', () => {
    expect(library, 'way 37056442 is not in the Seattle extract').toBeDefined()
    expect(library.tags.amenity).toBe('library')
    // It also carries `tourism=attraction`, which is why the ORDER matters.
    expect(library.tags.tourism).toBe('attraction')
  })

  it('★ gets a lobby rather than a coin toss', () => {
    const choice = storefrontBandForBuilding(library.tags, null)
    expect(choice.source).toBe('own')
    expect(choice.band).toBe(bandOf('lobby'))
  })
})

describe('the one building in four cities where the tag order decides', () => {
  const abq = JSON.parse(
    readFileSync(
      resolve(process.cwd(), 'public/examples/ascii-city/albuquerque.json'),
      'utf-8'
    )
  )
  const gallery = abq.elements.find((e) => e.id === 437189766)

  it('★ the Richard Levy Gallery is a SHOP, not a gallery lobby', () => {
    // `shop=art` + `tourism=gallery`. It is the only building in the four
    // extracts whose ground floor changes if `shop` stops going first, which
    // is what makes this the guard for that half of the order.
    expect(gallery, 'way 437189766 is not in the extract').toBeDefined()
    expect(gallery.tags.shop).toBe('art')
    expect(gallery.tags.tourism).toBe('gallery')
    const choice = storefrontBandForBuilding(gallery.tags, null)
    expect(choice.source).toBe('own')
    expect(choice.band).toBe(bandOf('glass'))
    expect(choice.band).not.toBe(bandOf('lobby'))
  })
})
