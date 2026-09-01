/**
 * Colours out of a picture, pinned against the owner's own photograph of
 * their cat and against three synthetic pictures whose answers are known.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { JSDOM } from 'jsdom'
import { PNG } from 'pngjs'
import {
  floorPx,
  modeDown,
  snapToPalette,
  quantise,
  keepLargest,
  pickBackground,
  masksFor,
  traceMask,
  separateColours,
  CLUSTER_OVERSHOOT,
  CLUSTER_SAMPLE_PIXELS,
} from '../../src/js/colour-separation.js'

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>')
globalThis.DOMParser = dom.window.DOMParser
globalThis.XMLSerializer = dom.window.XMLSerializer
globalThis.Node = dom.window.Node
globalThis.document = dom.window.document

/** Three flat colours side by side, with an anti-aliased seam between them. */
function threeStripes(w = 90, h = 30) {
  const data = new Uint8ClampedArray(w * h * 4)
  const bands = [
    [255, 255, 255],
    [20, 20, 20],
    [200, 60, 60],
  ]
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const band = Math.min(2, Math.floor((x / w) * 3))
      const edge = x % 30 === 0 && band > 0
      const c = edge
        ? bands[band].map((v, i) => Math.round((v + bands[band - 1][i]) / 2))
        : bands[band]
      const o = (y * w + x) * 4
      data[o] = c[0]
      data[o + 1] = c[1]
      data[o + 2] = c[2]
      data[o + 3] = 255
    }
  }
  return { width: w, height: h, data }
}

/** A dark square on a light ground, with a light hole in the square. */
function ringOnGround(size = 60) {
  const data = new Uint8ClampedArray(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const inSquare = x >= 10 && x < 50 && y >= 10 && y < 50
      const inHole = x >= 22 && x < 38 && y >= 22 && y < 38
      const dark = inSquare && !inHole
      const o = (y * size + x) * 4
      const v = dark ? 25 : 240
      data[o] = v
      data[o + 1] = v
      data[o + 2] = v
      data[o + 3] = 255
    }
  }
  return { width: size, height: size, data }
}

/** The owner's cat, flattened onto white the way a print would. */
function cat() {
  const png = PNG.sync.read(
    readFileSync(join('tests', 'fixtures', 'harley', 'sketch4.png'))
  )
  const data = new Uint8ClampedArray(png.data.length)
  for (let i = 0; i < png.data.length; i += 4) {
    const a = png.data[i + 3] / 255
    data[i] = Math.round(png.data[i] * a + 255 * (1 - a))
    data[i + 1] = Math.round(png.data[i + 1] * a + 255 * (1 - a))
    data[i + 2] = Math.round(png.data[i + 2] * a + 255 * (1 - a))
    data[i + 3] = 255
  }
  return { width: png.width, height: png.height, data }
}

const CAT = cat()
const near = (a, b, tol = 24) =>
  Math.abs(a.r - b[0]) < tol && Math.abs(a.g - b[1]) < tol && Math.abs(a.b - b[2]) < tol

describe('floorPx', () => {
  it('never goes below four pixels', () => {
    expect(floorPx(0)).toBe(4)
    expect(floorPx(10)).toBe(4)
  })

  it('rises when a pixel is going to be very small in millimetres', () => {
    // At 0.02 mm per pixel a 4-pixel mark is 0.0016 mm2, which nothing can cut.
    expect(floorPx(0.02)).toBeGreaterThan(4)
    expect(floorPx(0.02)).toBeCloseTo(250, 0)
  })
})

describe('quantise', () => {
  it('finds three flat colours in a picture of three flat colours', () => {
    const { palette, pixelCounts } = quantise(threeStripes(), 3)
    expect(palette).toHaveLength(3)
    expect(pixelCounts.reduce((a, b) => a + b, 0)).toBe(90 * 30)
    expect(palette.some((c) => near(c, [255, 255, 255]))).toBe(true)
    expect(palette.some((c) => near(c, [20, 20, 20]))).toBe(true)
    expect(palette.some((c) => near(c, [200, 60, 60]))).toBe(true)
  })

  it('gives the same answer twice, because there is no randomness in it', () => {
    const a = quantise(threeStripes(), 4)
    const b = quantise(threeStripes(), 4)
    expect(a.palette).toEqual(b.palette)
  })

  it('asks for more clusters when told to overshoot', () => {
    expect(quantise(threeStripes(), 3, 8, 2).palette.length).toBeGreaterThan(
      quantise(threeStripes(), 3, 8, 0).palette.length
    )
  })

  it('says nothing at all about a picture with no opaque pixels', () => {
    const blank = { width: 4, height: 4, data: new Uint8ClampedArray(64) }
    expect(quantise(blank, 4).palette).toEqual([])
  })
})

describe('snapToPalette', () => {
  it('puts every pixel on the nearest colour it was given', () => {
    const palette = [
      { r: 255, g: 255, b: 255 },
      { r: 0, g: 0, b: 0 },
    ]
    const { pixelCounts, assignments } = snapToPalette(ringOnGround(), palette)
    expect(pixelCounts[0] + pixelCounts[1]).toBe(60 * 60)
    expect(assignments[0]).toBe(0)
    expect(assignments[15 * 60 + 15]).toBe(1)
  })
})

describe('keepLargest', () => {
  it('folds the small clusters into their nearest big neighbour', () => {
    const q = quantise(threeStripes(), 3, 8, 3)
    const kept = keepLargest(q, 3)
    expect(kept.palette).toHaveLength(3)
    expect(kept.pixelCounts.reduce((a, b) => a + b, 0)).toBe(90 * 30)
  })

  it('leaves a result that is already small enough alone', () => {
    const q = quantise(threeStripes(), 3)
    expect(keepLargest(q, 5)).toBe(q)
  })
})

describe('pickBackground', () => {
  it('picks the colour that shows along the border', () => {
    const img = ringOnGround()
    const { palette, assignments } = quantise(img, 2)
    const bg = pickBackground(img, assignments, palette)
    expect(palette[bg].r).toBeGreaterThan(200)
  })

  it('has nothing to say about an empty palette', () => {
    expect(pickBackground({ width: 1, height: 1 }, new Int16Array(1), [])).toBe(-1)
  })
})

describe('modeDown', () => {
  it('leaves a picture already small enough exactly as it was', () => {
    const img = threeStripes()
    expect(modeDown(img, 1_000_000)).toBe(img)
  })

  it('shrinks a big picture and keeps its colours', () => {
    const small = modeDown(CAT, 40000)
    expect(small.width * small.height).toBeLessThanOrEqual(40000 * 1.3)
    expect(small).not.toBe(CAT)
  })

  it('★ is what makes a colour covering 1% of a picture findable', () => {
    // MEASURED on the cat, comparing palettes within 12 units per channel so
    // a desaturated grey cannot pass for a sage green:
    //   full image, six colours          finds NEITHER    93 ms
    //   mode-downsampled, six colours    finds the GREEN  13 ms
    //   mode-downsampled, seven          finds both       13 ms
    // Asked flat, the clustering spends its budget on the black-to-white ramp
    // anti-aliasing leaves along every edge. The mode of a block is a colour
    // that was really there, so the ramp goes and the small colours are what
    // is left to find - and it is seven times faster as well.
    const tight = (c, t) =>
      Math.abs(c.r - t[0]) < 12 &&
      Math.abs(c.g - t[1]) < 12 &&
      Math.abs(c.b - t[2]) < 12
    const green = [139, 151, 112]
    const flat = keepLargest(quantise(CAT, 6, 8, CLUSTER_OVERSHOOT), 6)
    const moded = keepLargest(
      quantise(modeDown(CAT, CLUSTER_SAMPLE_PIXELS), 6, 8, CLUSTER_OVERSHOOT),
      6
    )
    expect(flat.palette.some((c) => tight(c, green))).toBe(false)
    expect(moded.palette.some((c) => tight(c, green))).toBe(true)
  })
})

describe('masksFor and traceMask', () => {
  it('makes one mask per colour and puts every pixel in exactly one', () => {
    const img = ringOnGround()
    const { palette, assignments } = quantise(img, 2)
    const masks = masksFor(assignments, palette.length)
    expect(masks).toHaveLength(2)
    let total = 0
    for (const m of masks) total += m.reduce((a, b) => a + b, 0)
    expect(total).toBe(60 * 60)
  })

  it('traces a mask into shapes and drops what is too small to cut', () => {
    const img = ringOnGround()
    const { palette, assignments } = quantise(img, 2)
    const masks = masksFor(assignments, palette.length)
    const dark = palette[0].r < 128 ? 0 : 1
    const big = traceMask(masks[dark], img, { areaFloorPx: 4 })
    expect(big.paths.length).toBeGreaterThan(0)
    const strict = traceMask(masks[dark], img, { areaFloorPx: 5000 })
    expect(strict.paths).toHaveLength(0)
    expect(strict.dropped).toBeGreaterThan(0)
  })

  // DP-24 P3: the traced colour masks DID NOT TILE. Each mask is traced on
  // its own, the tracer pulls every boundary inward, and the hairline gaps
  // between neighbouring colours became 567 loose pieces on the owner's
  // cat. Grown under a pixel before tracing, neighbours MEET: together the
  // traced colours cover at least the whole canvas (overlap is fine - the
  // paint order paints over it; a gap is a sliver on a plate).
  it('★ grown masks tile: the traced colours cover the whole picture', () => {
    const img = threeStripes()
    const { palette, assignments } = quantise(img, 3)
    const masks = masksFor(assignments, palette.length)
    let covered = 0
    for (const mask of masks) {
      const { keptArea } = traceMask(mask, img, { areaFloorPx: 4 })
      covered += keptArea
    }
    expect(covered).toBeGreaterThanOrEqual(img.width * img.height)
  })
})

describe('separateColours on the owner cat', () => {
  const six = separateColours(CAT, { count: 6 })
  const seven = separateColours(CAT, { count: 7 })

  it('hands back an SVG whose paths carry their own colour', () => {
    expect(six.svg).toMatch(/^<svg /)
    expect(six.svg).toContain('fill="#')
    expect(six.svg).toContain('data-colour-name=')
    expect((six.svg.match(/<path/g) || []).length).toBeGreaterThan(10)
  })

  it('finds six colours and calls the paper the wall', () => {
    expect(six.colours).toHaveLength(6)
    const wall = six.colours.find((c) => c.isBackground)
    expect(wall).toBeDefined()
    expect(wall.share).toBeGreaterThan(0.3)
    expect(wall.hex.toLowerCase()).toMatch(/^#f[ed]/)
  })

  it('★ finds the green eyes at six, and the pink nose as well at seven', () => {
    // The picture has seven colours a person would name, because its outlines
    // are a second, purer black than its fur. Six finds the green; seven finds
    // the pink too. The panel says the share of each, so a person can see a
    // colour is missing and ask for one more.
    const has = (r, hex) => r.colours.some((c) => c.hex === hex)
    expect(has(six, '#8b9770')).toBe(true)
    expect(has(six, '#b0767d')).toBe(false)
    expect(has(seven, '#8b9770')).toBe(true)
    expect(has(seven, '#b0767d')).toBe(true)
  })

  it('★ cannot tell the white FUR from the white paper, and a named palette can', () => {
    // #fafbf8 and #ffffff are five units apart in RGB. No clustering will ever
    // separate them; a person naming their paint will.
    expect(seven.colours.some((c) => c.hex === '#fafbf8')).toBe(false)
    const named = separateColours(CAT, {
      palette: [
        { r: 255, g: 255, b: 255 },
        { r: 0x17, g: 0x14, b: 0x11 },
        { r: 0x99, g: 0x70, b: 0x48 },
        { r: 0xfa, g: 0xfb, b: 0xf8 },
        { r: 0x97, g: 0x8b, b: 0x84 },
        { r: 0x8b, g: 0x97, b: 0x70 },
        { r: 0xb0, g: 0x76, b: 0x7d },
      ],
    })
    const fur = named.colours.find((c) => c.hex === '#fafbf8')
    expect(fur).toBeDefined()
    expect(fur.share).toBeGreaterThan(0.1)
    expect(named.colours.find((c) => c.hex === '#ffffff').share).toBeGreaterThan(0.25)
  })

  it('melts the anti-alias slivers rather than shipping them as regions', () => {
    // The planning probe measured 181 paths for brown and 178 for grey with
    // the tracer left to quantise. One colour at a time plus an area floor
    // brings a whole picture down to tens. RESCOPED at DP-24 P3 from 80 to
    // 120: the floor is now applied to the mask's own pixels before the
    // grow (measured 105 kept) - the old 80 was the tracer's inward pull
    // accidentally under-measuring marginal four-to-six-pixel pieces and
    // killing shapes the floor's own definition keeps.
    const shapes = six.colours.reduce((sum, c) => sum + c.shapes, 0)
    expect(shapes).toBeLessThan(120)
    expect(six.droppedTotal).toBeGreaterThan(100)
  })

  it('takes the wall the caller names, over the one it would have picked', () => {
    const black = six.colours.find((c) => c.hex === '#171411')
    const forced = separateColours(CAT, { count: 6, backgroundIndex: black.index })
    expect(forced.colours.find((c) => c.isBackground).hex).toBe('#171411')
  })

  it('says nothing rather than guessing at a picture with nothing in it', () => {
    const blank = { width: 4, height: 4, data: new Uint8ClampedArray(64) }
    expect(separateColours(blank, { count: 3 }).colours).toEqual([])
  })
})
