import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  CITY_INK_FAMILY,
  HC_PALETTE_GREEN,
  HC_PALETTE_AMBER,
} from '../../../src/js/game/hc-palettes.js'
import { SURFACE_CLASS } from '../../../src/js/game/city-class-pass.js'
import {
  installCanvasMock,
  removeCanvasMock,
  createMockPreviewManager,
} from '../hfm-convert-fixture.js'

/**
 * CW-92 (D-127, CW-Q96): what colour each surface is.
 *
 * The release was briefed to take the family from each surface's own material
 * colour. It cannot: measured over all 60 materials in a Seattle session, 51
 * land on the palette's WHITE entry, because every material is white or
 * neutral grey, both scene lights are pure white and the fog is pure black.
 * There is no surface colour to read, so the owner asked for an authored table
 * instead (CW-Q96). These are the rules that table has to keep.
 */

const PALETTES = { green: HC_PALETTE_GREEN, amber: HC_PALETTE_AMBER }

describe('CW-92 the authored ink table', () => {
  it('★★ names only real surface classes, and never the sky', () => {
    // The ids are literals in hc-palettes.js to avoid closing an import cycle,
    // exactly as ANCHORED_CLASSES and CITY_BACKING_EXEMPT_CLASS_IDS are. This
    // is the guard that makes that safe: the test is outside the cycle.
    const real = new Set(Object.values(SURFACE_CLASS))
    for (const [name, table] of Object.entries(CITY_INK_FAMILY)) {
      for (const key of Object.keys(table)) {
        expect(real.has(Number(key)), `${name} names class ${key}`).toBe(true)
      }
      // The sky is not a surface and keeps the per-frame screen pick: it is
      // the one thing in the picture with no material to belong to.
      expect(table[SURFACE_CLASS.SKY]).toBeUndefined()
    }
  })

  it('★★ covers every surface class the class pass can emit', () => {
    // A class with no family falls back to the screen pick, which is the
    // defect this release exists to remove. A new class added to the pass has
    // to be given a colour here, and this is what says so.
    const surfaces = Object.values(SURFACE_CLASS).filter(
      (id) => id !== SURFACE_CLASS.SKY
    )
    for (const [name, table] of Object.entries(CITY_INK_FAMILY)) {
      for (const id of surfaces) {
        expect(table[id], `${name} has no colour for class ${id}`).toBeDefined()
      }
    }
  })

  it('★★★ never gives a surface the WHITE entry, which is CW-71 correctness', () => {
    // CW-71's ink budget gates the white entry on luminance and chroma, and
    // its guard rests on a surface family never being white. A white family
    // would walk straight past that gate. White belongs to the sky and to
    // anything the class pass could not name.
    for (const [name, table] of Object.entries(CITY_INK_FAMILY)) {
      const palette = PALETTES[name]
      const white = palette.findIndex((hex) => hex.toLowerCase() === '#ffffff')
      expect(white, `${name} has a white entry`).toBeGreaterThanOrEqual(0)
      for (const [cls, index] of Object.entries(table)) {
        expect(index, `${name} class ${cls} took white`).not.toBe(white)
      }
    }
  })

  it('★★ every family names an entry its own palette actually has', () => {
    // The two sets are different lengths - amber has seven entries because
    // CW-Q11 minted a foliage green - so a table copied between them would
    // index past the end.
    for (const [name, table] of Object.entries(CITY_INK_FAMILY)) {
      for (const [cls, index] of Object.entries(table)) {
        expect(index, `${name} class ${cls}`).toBeGreaterThanOrEqual(0)
        expect(index, `${name} class ${cls}`).toBeLessThan(PALETTES[name].length)
      }
    }
  })

  it('★ puts foliage on the entry CW-Q11 minted for it', () => {
    // Amber gained #39ff5e precisely because a tree canopy and a yellow-green
    // building both fell to lime. Using it for anything else would waste the
    // entry that answer bought.
    const foliage = HC_PALETTE_AMBER.indexOf('#39ff5e')
    expect(foliage).toBeGreaterThanOrEqual(0)
    expect(CITY_INK_FAMILY.amber[SURFACE_CLASS.TREE]).toBe(foliage)
    expect(CITY_INK_FAMILY.amber[SURFACE_CLASS.GREEN]).toBe(foliage)
    // And a building does NOT share it there, which is the whole point.
    expect(CITY_INK_FAMILY.amber[SURFACE_CLASS.BUILDING_WALL]).not.toBe(foliage)
  })

  it('★ separates the carriageway from the pavement beside it, in both sets', () => {
    // A walker has to be able to tell where they may walk. Shape does most of
    // that work since CW-23; the two floors are the case where colour is worth
    // spending on as well.
    for (const [name, table] of Object.entries(CITY_INK_FAMILY)) {
      expect(
        table[SURFACE_CLASS.ROAD],
        `${name}: road and pavement share an entry`
      ).not.toBe(table[SURFACE_CLASS.SIDEWALK])
    }
  })
})

describe('CW-92 the converter takes the family', () => {
  beforeEach(() => installCanvasMock())
  afterEach(() => {
    removeCanvasMock()
    vi.restoreAllMocks()
  })

  it('★★★ a classified cell takes its family, and the sky keeps the screen pick', async () => {
    vi.resetModules()
    const { initAltView } = await import('../../../src/js/_hfm.js')
    const pm = createMockPreviewManager()
    const WALL = SURFACE_CLASS.BUILDING_WALL
    const api = await initAltView(pm, {
      allowTinyCells: true,
      // Half the grid is wall, half is sky.
      classMapProvider: (cols, rows) => {
        const map = new Uint8Array(cols * rows)
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            map[r * cols + c] = c < cols / 2 ? WALL : SURFACE_CLASS.SKY
          }
        }
        return map
      },
    })
    api.setPalette(['#000000', '#ff0000', '#00ff00', '#0000ff', '#ffffff'])
    api.setCellProbe(true)
    const nowSpy = vi.spyOn(performance, 'now')
    api.enable()

    const draw = (t) => {
      api.invalidate()
      nowSpy.mockReturnValue(t)
      api.render()
      const probe = api.readCellProbe()
      const wall = []
      const sky = []
      for (let r = 0; r < probe.rows; r++) {
        for (let c = 0; c < probe.cols; c++) {
          const i = r * probe.cols + c
          const into = c < probe.cols / 2 ? wall : sky
          into.push(probe.colour[i])
        }
      }
      return { wall, sky }
    }

    const before = draw(10000)
    // The fixture must contain the thing it guards: a picture whose wall was
    // already all one colour would pass the assertion below and prove nothing.
    expect(new Set(before.wall).size).toBeGreaterThan(1)

    expect(api.inkFamiliesOn()).toBe(false)
    api.setInkFamilies({ [WALL]: 2 })
    expect(api.inkFamiliesOn()).toBe(true)
    const after = draw(20000)

    // Every wall cell took the family; not one is anything else.
    expect(new Set(after.wall)).toEqual(new Set([2]))
    // And the sky is untouched - it has no surface to belong to.
    expect(after.sky).toEqual(before.sky)

    // Cleared, the screen pick comes back exactly as it was.
    api.setInkFamilies(null)
    expect(api.inkFamiliesOn()).toBe(false)
    expect(draw(30000).wall).toEqual(before.wall)

    nowSpy.mockRestore()
    api.dispose()
  })

  it('refuses a table with nothing usable in it', async () => {
    vi.resetModules()
    const { initAltView } = await import('../../../src/js/_hfm.js')
    const api = await initAltView(createMockPreviewManager(), {
      allowTinyCells: true,
    })
    expect(api.setInkFamilies(null)).toBeNull()
    expect(api.setInkFamilies({})).toBeNull()
    expect(api.setInkFamilies({ 99: 1 })).toBeNull()
    expect(api.setInkFamilies({ 4: -1 })).toBeNull()
    expect(api.inkFamiliesOn()).toBe(false)
    api.dispose()
  })
})
