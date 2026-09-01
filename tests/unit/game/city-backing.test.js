/**
 * CW-85 - the backing behind the characters ("Day"): its tables, and the one
 * thing it is not allowed to cost.
 *
 * Today every glyph in the City Walk sits on pure black. A backing paints
 * something behind it, which can only LOWER the contrast ratio, and lowering
 * contrast is the direction this project does not let a change go
 * (02-accessibility rule 1). So the tints are not a taste to be reviewed in a
 * screenshot: they are measured here, with colorjs.io, against every palette
 * entry the game can put on top of them, and against the dimmest drive the
 * mono ladder ships. A tint that reads nicely and measures 4.3 fails.
 *
 * The class table guard asks SURFACE_CLASS itself rather than a copied list,
 * so a class appended later (the ids are a wire format and are only ever
 * appended - CW-33) fails this file until it has a tint.
 */
import { describe, it, expect } from 'vitest'
import Color from 'colorjs.io'
import { readFileSync } from 'fs'
import { resolve as resolvePath, dirname } from 'path'
import { fileURLToPath } from 'url'
import {
  SURFACE_CLASS,
  CLASS_DEPTH_FAR_M,
} from '../../../src/js/game/city-class-pass.js'
import {
  depthMetres,
  backingFade,
  packRGBA,
  backingTable,
  buildBacking,
} from '../../../src/js/game/city-backing.js'
import { driveColor } from '../../../src/js/_hfm-paint.js'
import {
  HC_PALETTE_GREEN,
  HC_PALETTE_AMBER,
  MONO_INTENSITY_LEVELS,
  CITY_BACKING_COLOUR,
  CITY_BACKING_MONO_DRIVE,
  CITY_BACKING_EXEMPT_CLASS_IDS,
  CITY_BACKING_NEAR_M,
  CITY_BACKING_FAR_M,
} from '../../../src/js/game/hc-palettes.js'

/** The bar this project holds itself to for text. */
const AA_TEXT = 4.5

const contrast = (fg, bg) => new Color(fg).contrast(new Color(bg), 'WCAG21')

// The phosphors are CSS tokens, read at test time so this fails when the
// stylesheet moves rather than drifting against a copied hex.
const variantCss = readFileSync(
  resolvePath(
    dirname(fileURLToPath(import.meta.url)),
    '../../../src/styles/variant.css'
  ),
  'utf-8'
)
const tokenIn = (selectorStart, name) => {
  const start = variantCss.indexOf(selectorStart)
  if (start < 0) throw new Error(`no ${selectorStart} block in variant.css`)
  const block = variantCss.slice(start, variantCss.indexOf('}', start))
  const m = block.match(new RegExp(`${name}\\s*:\\s*([^;]+);`))
  if (!m) throw new Error(`no ${name} in ${selectorStart}`)
  return m[1].trim()
}
const PHOSPHOR_GREEN = tokenIn(":root[data-ui-variant='mono']", '--color-accent')
const PHOSPHOR_AMBER = tokenIn(
  ":root[data-ui-variant='mono'][data-theme='light']",
  '--color-accent'
)

const CLASS_IDS = Object.values(SURFACE_CLASS)

describe('CW-85 backing tables are TOTAL over the surface classes', () => {
  it('reads a real phosphor token for each theme', () => {
    expect(PHOSPHOR_GREEN).toMatch(/^#[0-9a-f]{6}$/i)
    expect(PHOSPHOR_AMBER).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('★★ every surface class has a mono drive', () => {
    // Asks the class list itself. A class appended to SURFACE_CLASS without a
    // tint would otherwise back as undefined and paint nothing, silently.
    expect(CLASS_IDS.length).toBeGreaterThan(0)
    for (const id of CLASS_IDS) {
      for (const phosphor of Object.keys(CITY_BACKING_MONO_DRIVE)) {
        expect(
          CITY_BACKING_MONO_DRIVE[phosphor][id],
          `${phosphor} has no mono backing drive for SURFACE_CLASS id ${id}`
        ).toEqual(expect.any(Number))
      }
    }
  })

  it('★★ every surface class has a tint in EVERY palette', () => {
    for (const palette of Object.keys(CITY_BACKING_COLOUR)) {
      for (const id of CLASS_IDS) {
        expect(
          CITY_BACKING_COLOUR[palette][id],
          `${palette} has no backing tint for SURFACE_CLASS id ${id}`
        ).toMatch(/^#[0-9a-f]{6}$/i)
      }
    }
  })

  it('carries no tint for a class that does not exist', () => {
    const known = new Set(CLASS_IDS.map(String))
    for (const palette of Object.keys(CITY_BACKING_COLOUR)) {
      for (const id of Object.keys(CITY_BACKING_COLOUR[palette])) {
        expect(known.has(id), `${palette} tints unknown class ${id}`).toBe(true)
      }
    }
    for (const phosphor of Object.keys(CITY_BACKING_MONO_DRIVE)) {
      for (const id of Object.keys(CITY_BACKING_MONO_DRIVE[phosphor])) {
        expect(known.has(id), `${phosphor} drives unknown class ${id}`).toBe(
          true
        )
      }
    }
  })

  it('exempts the sky, and nothing that is a surface', () => {
    expect(CITY_BACKING_EXEMPT_CLASS_IDS).toContain(SURFACE_CLASS.SKY)
    for (const id of CITY_BACKING_EXEMPT_CLASS_IDS) {
      expect(CLASS_IDS, `exempt id ${id} is not a class`).toContain(id)
    }
  })

  it('fades over a real distance, ending at the fog far', () => {
    expect(CITY_BACKING_NEAR_M).toBeGreaterThan(0)
    expect(CITY_BACKING_FAR_M).toBeGreaterThan(CITY_BACKING_NEAR_M)
    // city-scene.js builds Fog(0x000000, 40, 260). A backing that outlived
    // the fog would draw a skyline the scene has already faded to black.
    expect(CITY_BACKING_FAR_M).toBe(260)
  })
})

describe('★★★ CW-85 the backing never costs a glyph its contrast', () => {
  const dimmestDrive = Math.min(...MONO_INTENSITY_LEVELS)

  it('mono: the DIMMEST ink still clears 4.5:1 over every backing', () => {
    const rows = []
    for (const [name, phosphor] of [
      ['green', PHOSPHOR_GREEN],
      ['amber', PHOSPHOR_AMBER],
    ]) {
      const ink = driveColor(phosphor, dimmestDrive)
      for (const id of CLASS_IDS) {
        const drive = CITY_BACKING_MONO_DRIVE[name][id]
        if (drive === 0) continue
        const bg = driveColor(phosphor, drive)
        const ratio = contrast(ink, bg)
        rows.push(`${name} class ${id}: ${ratio.toFixed(2)}:1 on ${bg}`)
        expect(
          ratio,
          `${name} phosphor at drive ${dimmestDrive} over class ${id} backing ` +
            `(${bg}) measures ${ratio.toFixed(2)}:1`
        ).toBeGreaterThanOrEqual(AA_TEXT)
      }
    }
    // Printed so the record can quote the worst case without re-deriving it.
    const worst = rows
      .map((r) => [parseFloat(r.split(': ')[1]), r])
      .sort((a, b) => a[0] - b[0])[0]
    console.log(`[CW-85 backing] mono worst case ${worst[1]}`)
  })

  it('colour: EVERY palette entry clears 4.5:1 over every backing', () => {
    const palettes = { green: HC_PALETTE_GREEN, amber: HC_PALETTE_AMBER }
    let worst = { ratio: Infinity, where: '' }
    for (const [name, entries] of Object.entries(palettes)) {
      for (const ink of entries) {
        for (const id of CLASS_IDS) {
          if (CITY_BACKING_EXEMPT_CLASS_IDS.includes(id)) continue
          const bg = CITY_BACKING_COLOUR[name][id]
          const ratio = contrast(ink, bg)
          if (ratio < worst.ratio) {
            worst = { ratio, where: `${name} ${ink} on class ${id} (${bg})` }
          }
          expect(
            ratio,
            `${name}: ${ink} over class ${id} backing (${bg}) measures ` +
              `${ratio.toFixed(2)}:1`
          ).toBeGreaterThanOrEqual(AA_TEXT)
        }
      }
    }
    console.log(
      `[CW-85 backing] colour worst case ${worst.ratio.toFixed(2)}:1 - ${worst.where}`
    )
  })

  it('★ the backing is DARKER than the dimmest ink, in every palette', () => {
    // The bar above is the contrast the player reads. This is the separate
    // claim the layer rests on: a blank cell over backing must read as
    // SURFACE, never as a character that happens to be dim. If a tint were
    // ever brighter than ink, the two layers would swap meaning.
    const dimGreen = new Color(driveColor(PHOSPHOR_GREEN, dimmestDrive))
    const dimAmber = new Color(driveColor(PHOSPHOR_AMBER, dimmestDrive))
    for (const id of CLASS_IDS) {
      expect(CITY_BACKING_MONO_DRIVE.green[id]).toBeLessThan(dimmestDrive)
      expect(CITY_BACKING_MONO_DRIVE.amber[id]).toBeLessThan(dimmestDrive)
      const g = new Color(CITY_BACKING_COLOUR.green[id])
      const a = new Color(CITY_BACKING_COLOUR.amber[id])
      expect(g.luminance, `green class ${id}`).toBeLessThan(dimGreen.luminance)
      expect(a.luminance, `amber class ${id}`).toBeLessThan(dimAmber.luminance)
    }
  })
})

describe('CW-85 the backing arithmetic', () => {
  it('★ a depth byte round-trips to metres within one step', () => {
    // 260 m over 255 steps is 1.02 m a step, which is finer than the fade
    // needs and far finer than a 3x6 px cell can show.
    const step = CLASS_DEPTH_FAR_M / 255
    for (const m of [0, 10, 42, 60, 137.5, 200, 259]) {
      const byte = Math.round((m / CLASS_DEPTH_FAR_M) * 255)
      expect(Math.abs(depthMetres(byte) - m)).toBeLessThanOrEqual(step)
    }
    expect(depthMetres(0)).toBe(0)
    expect(depthMetres(255)).toBeCloseTo(CLASS_DEPTH_FAR_M, 6)
  })

  it('★ the fade is full to the near bound, gone at the fog far', () => {
    expect(backingFade(0)).toBe(1)
    expect(backingFade(CITY_BACKING_NEAR_M)).toBe(1)
    expect(backingFade(CITY_BACKING_NEAR_M - 1)).toBe(1)
    expect(backingFade(CITY_BACKING_FAR_M)).toBe(0)
    expect(backingFade(CITY_BACKING_FAR_M + 50)).toBe(0)
    // Straight-line between, so it agrees with the scene's own linear fog.
    const mid = (CITY_BACKING_NEAR_M + CITY_BACKING_FAR_M) / 2
    expect(backingFade(mid)).toBeCloseTo(0.5, 6)
    // and it never turns back up
    let previous = 1
    for (let m = 0; m <= CITY_BACKING_FAR_M + 10; m += 5) {
      const f = backingFade(m)
      expect(f).toBeLessThanOrEqual(previous + 1e-9)
      previous = f
    }
  })

  it('packs a colour the way a Uint32 view over RGBA bytes reads it', () => {
    // The frame buffer is a Uint32Array over ImageData bytes: 0xAABBGGRR.
    expect(packRGBA(0x12, 0x34, 0x56)).toBe(0xff563412 >>> 0)
    expect(packRGBA(255, 255, 255)).toBe(0xffffffff >>> 0)
    expect(packRGBA(0, 0, 0)).toBe(0xff000000 >>> 0)
    // and a packed byte survives the trip back out, which is what the fade
    // arithmetic in buildBacking relies on
    const p = packRGBA(9, 18, 27)
    expect(p & 255).toBe(9)
    expect((p >> 8) & 255).toBe(18)
    expect((p >> 16) & 255).toBe(27)
  })

  it('★★ backs a near surface, leaves the sky and the far skyline bare', () => {
    const table = backingTable({
      mono: false,
      palette: 'green',
      phosphor: PHOSPHOR_GREEN,
    })
    const near = Math.round((10 / CLASS_DEPTH_FAR_M) * 255)
    const far = Math.round((250 / CLASS_DEPTH_FAR_M) * 255)
    const classMap = Uint8Array.from([
      SURFACE_CLASS.SKY,
      SURFACE_CLASS.ROAD,
      SURFACE_CLASS.ROAD,
      SURFACE_CLASS.BUILDING_WALL,
    ])
    const depthMap = Uint8Array.from([0, near, far, near])
    const out = buildBacking({ classMap, depthMap, table })

    expect(out[0], 'the sky is never backed').toBe(0)
    expect(out[1], 'a road 10 m away is backed at full strength').toBe(
      table[SURFACE_CLASS.ROAD]
    )
    expect(out[2], 'the same road at 250 m is bare').toBe(0)
    expect(out[3]).toBe(table[SURFACE_CLASS.BUILDING_WALL])
    // A wall and a road do not share a tint: the surface says what it is.
    expect(table[SURFACE_CLASS.ROAD]).not.toBe(table[SURFACE_CLASS.BUILDING_WALL])
  })

  it('★★ a cell the city does not cover reads as sky, not as zero metres', () => {
    // The class pass clears to 0, which is SKY, so an uncovered cell arrives
    // with class 0 AND depth 0 - the one place "right against the lens" and
    // "nothing there" look identical. The exemption is what resolves it, and
    // it is the reason the sky is on the exempt list at all.
    const table = backingTable({
      mono: false,
      palette: 'green',
      phosphor: PHOSPHOR_GREEN,
    })
    const out = buildBacking({
      classMap: Uint8Array.from([SURFACE_CLASS.SKY]),
      depthMap: Uint8Array.from([0]),
      table,
    })
    expect(out[0]).toBe(0)
  })

  it('fades between the bounds rather than switching off', () => {
    const table = backingTable({
      mono: false,
      palette: 'green',
      phosphor: PHOSPHOR_GREEN,
    })
    const mid = Math.round((160 / CLASS_DEPTH_FAR_M) * 255)
    const out = buildBacking({
      classMap: Uint8Array.from([SURFACE_CLASS.BUILDING_WALL]),
      depthMap: Uint8Array.from([mid]),
      table,
    })
    const full = table[SURFACE_CLASS.BUILDING_WALL]
    expect(out[0]).not.toBe(0)
    expect(out[0]).not.toBe(full)
    expect(out[0] & 255).toBeLessThan(full & 255)
  })

  it('reuses the caller buffer when it fits, and never when it does not', () => {
    const table = backingTable({
      mono: false,
      palette: 'green',
      phosphor: PHOSPHOR_GREEN,
    })
    const classMap = Uint8Array.from([SURFACE_CLASS.ROAD, SURFACE_CLASS.ROAD])
    const depthMap = Uint8Array.from([10, 10])
    const out = new Uint32Array(2)
    expect(buildBacking({ classMap, depthMap, table, out })).toBe(out)
    const wrong = new Uint32Array(5)
    expect(buildBacking({ classMap, depthMap, table, out: wrong })).not.toBe(
      wrong
    )
  })

  it('★ mono backing is the phosphor, and every class differs from black', () => {
    const table = backingTable({
      mono: true,
      palette: 'amber',
      phosphor: PHOSPHOR_AMBER,
    })
    for (const id of CLASS_IDS) {
      if (CITY_BACKING_EXEMPT_CLASS_IDS.includes(id)) {
        expect(table[id]).toBe(0)
        continue
      }
      expect(table[id], `class ${id} backs as nothing`).not.toBe(0)
      // amber is #ffb000: red leads, blue is absent. A mono backing that had
      // gone through the colour table would not look like this.
      expect(table[id] & 255).toBeGreaterThan((table[id] >> 16) & 255)
    }
  })
})
