import { describe, it, expect } from 'vitest'
import {
  srgbToLab,
  alphaShare,
  otsuThreshold,
  lightnessHistogram,
  medianFilter3x3,
  inkMask,
  silhouetteMask,
  componentCount,
  maskToImageData,
  dominantRejectedColor,
  extractInk,
  INK_DEFAULTS,
  MEANINGFUL_ALPHA_SHARE,
} from '../../src/js/ink-extraction.js'

// jsdom has no canvas, so ImageData is built by hand. Every function here is
// pure arithmetic over a flat array, which is the point: the maths can be
// checked on grids small enough to read.
const makeImageData = (width, height) => ({
  width,
  height,
  data: new Uint8ClampedArray(width * height * 4),
})

/**
 * Build an image from a picture drawn as strings, one character per pixel.
 * @param {string[]} rows
 * @param {Object} palette - character -> [r, g, b] or [r, g, b, a]
 */
function imageFrom(rows, palette) {
  const height = rows.length
  const width = rows[0].length
  const img = makeImageData(width, height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a = 255] = palette[rows[y][x]]
      const i = (y * width + x) * 4
      img.data[i] = r
      img.data[i + 1] = g
      img.data[i + 2] = b
      img.data[i + 3] = a
    }
  }
  return img
}

const BLACK = [0, 0, 0]
const WHITE = [255, 255, 255]
const BLUE = [31, 95, 191] // the fill on the AAC fixture
const YELLOW = [255, 212, 0]
const GREY = [74, 74, 74]
const CLEAR = [0, 0, 0, 0]

describe('srgbToLab', () => {
  it('puts black at 0 and white at 100, both with no colour in them', () => {
    const black = srgbToLab(0, 0, 0)
    const white = srgbToLab(255, 255, 255)
    expect(black.L).toBeCloseTo(0, 5)
    expect(black.chroma).toBeCloseTo(0, 5)
    expect(white.L).toBeCloseTo(100, 3)
    expect(white.chroma).toBeLessThan(0.02)
  })

  it('separates a dark grey from a dark blue that luma cannot tell apart', () => {
    // This is the whole reason the module exists. Rec.601 luma:
    //   grey  #4a4a4a -> 74
    //   blue  #1f5fbf -> 0.299*31 + 0.587*95 + 0.114*191 = ~87
    // Fourteen apart out of 255, which is why both land in the same bucket.
    const grey = srgbToLab(...GREY)
    const blue = srgbToLab(...BLUE)
    expect(Math.abs(grey.L - blue.L)).toBeLessThan(20)
    expect(grey.chroma).toBeLessThan(2)
    expect(blue.chroma).toBeGreaterThan(50)
  })

  it('reads yellow as light and very colourful', () => {
    const yellow = srgbToLab(...YELLOW)
    expect(yellow.L).toBeGreaterThan(80)
    expect(yellow.chroma).toBeGreaterThan(50)
  })
})

describe('alphaShare', () => {
  it('is zero for a fully opaque picture', () => {
    expect(alphaShare(imageFrom(['ww', 'ww'], { w: WHITE }))).toBe(0)
  })

  it('counts every pixel that is not fully opaque', () => {
    const img = imageFrom(['wc', 'ww'], { w: WHITE, c: CLEAR })
    expect(alphaShare(img)).toBeCloseTo(0.25, 5)
  })
})

describe('otsuThreshold', () => {
  it('splits two well-separated peaks between them', () => {
    const histogram = new Uint32Array(256)
    histogram[20] = 500
    histogram[200] = 500
    // Otsu returns the last value of the DARK class, so pixels <= t are dark.
    // Every t in [20, 199] separates these two peaks equally well; the loop
    // keeps the first, which is the darker peak's own value.
    const t = otsuThreshold(histogram)
    expect(t).toBeGreaterThanOrEqual(20)
    expect(t).toBeLessThan(200)
  })

  it('says -1 rather than guessing when every pixel is the same', () => {
    const histogram = new Uint32Array(256)
    histogram[128] = 1000
    expect(otsuThreshold(histogram)).toBe(-1)
  })

  it('says -1 for an empty histogram', () => {
    expect(otsuThreshold(new Uint32Array(256))).toBe(-1)
  })
})

describe('lightnessHistogram', () => {
  it('bins black at the bottom and white at the top', () => {
    const histogram = lightnessHistogram(
      imageFrom(['bw'], { b: BLACK, w: WHITE })
    )
    expect(histogram[0]).toBe(1)
    expect(histogram[255]).toBe(1)
  })
})

describe('inkMask', () => {
  const options = {
    lightnessMax: INK_DEFAULTS.lightnessMax,
    chromaMax: INK_DEFAULTS.chromaMax,
  }

  it('keeps black line work and rejects the coloured field under it', () => {
    // A black glyph inside a blue square: the case the shipped tracer loses.
    const img = imageFrom(['LLLL', 'LggL', 'LggL', 'LLLL'], {
      L: BLUE,
      g: BLACK,
    })
    const mask = inkMask(img, options)
    expect(Array.from(mask)).toEqual([
      0, 0, 0, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0,
    ])
  })

  it('rejects paper, and a light colourful fill too', () => {
    const img = imageFrom(['wy'], { w: WHITE, y: YELLOW })
    expect(Array.from(inkMask(img, options))).toEqual([0, 0])
  })

  it('keeps a dark grey, which is what a photographed pencil line is', () => {
    const img = imageFrom(['wG'], { w: WHITE, G: GREY })
    expect(Array.from(inkMask(img, options))).toEqual([0, 1])
  })

  it('treats a transparent pixel as paper when alpha is not the shape', () => {
    const img = imageFrom(['bc'], { b: BLACK, c: CLEAR })
    expect(Array.from(inkMask(img, options))).toEqual([1, 0])
  })

  it('uses alpha as the shape when told to, colour regardless', () => {
    const img = imageFrom(['yc'], { y: YELLOW, c: CLEAR })
    expect(Array.from(inkMask(img, { ...options, useAlpha: true }))).toEqual([
      1, 0,
    ])
  })
})

describe('silhouetteMask', () => {
  it('fills the whole outer shape, detail inside included', () => {
    // A ring: the hole in the middle is enclosed, so it belongs to the shape.
    const img = imageFrom(['wwwww', 'wbbbw', 'wbwbw', 'wbbbw', 'wwwww'], {
      w: WHITE,
      b: BLACK,
    })
    const mask = silhouetteMask(img, { lightnessMax: 55 })
    // The centre pixel is white but unreachable from the border.
    expect(mask[12]).toBe(1)
    // The corners are reachable, so they are outside.
    expect(mask[0]).toBe(0)
    expect(mask[24]).toBe(0)
  })

  it('treats transparency as outside', () => {
    const img = imageFrom(['ccc', 'cbc', 'ccc'], { c: CLEAR, b: BLACK })
    const mask = silhouetteMask(img, { lightnessMax: 55 })
    expect(Array.from(mask)).toEqual([0, 0, 0, 0, 1, 0, 0, 0, 0])
  })
})

describe('componentCount', () => {
  it('counts separate pieces, four-connected', () => {
    const mask = Uint8Array.from([1, 0, 1, 0, 0, 0, 1, 0, 1])
    expect(componentCount(mask, 3, 3)).toBe(4)
  })

  it('counts a connected shape once', () => {
    const mask = Uint8Array.from([1, 1, 1, 1])
    expect(componentCount(mask, 2, 2)).toBe(1)
  })

  it('counts nothing in an empty mask', () => {
    expect(componentCount(new Uint8Array(9), 3, 3)).toBe(0)
  })
})

describe('medianFilter3x3', () => {
  it('removes a single speckle without moving an edge', () => {
    const img = imageFrom(['www', 'wbw', 'www'], { w: WHITE, b: BLACK })
    const out = medianFilter3x3(img, makeImageData)
    // The lone dark pixel is outvoted by its eight white neighbours.
    expect(out.data[(1 * 3 + 1) * 4]).toBe(255)
  })

  it('erases a one-pixel stroke too, which is why it is not on by default', () => {
    // A 3x3 median removes anything thinner than half its window. On a
    // photograph that is the speckles; on a line drawing it is the drawing.
    const img = imageFrom(['wbw', 'wbw', 'wbw'], { w: WHITE, b: BLACK })
    const out = medianFilter3x3(img, makeImageData)
    expect(out.data[(1 * 3 + 1) * 4]).toBe(255)
  })

  it('keeps a stroke that is wide enough to outvote its neighbours', () => {
    const img = imageFrom(['wbbw', 'wbbw', 'wbbw', 'wbbw'], {
      w: WHITE,
      b: BLACK,
    })
    const out = medianFilter3x3(img, makeImageData)
    expect(out.data[(1 * 4 + 1) * 4]).toBe(0)
    expect(out.data[(2 * 4 + 2) * 4]).toBe(0)
  })

  it('extractInk leaves it off unless asked', () => {
    const img = imageFrom(['wbw', 'wbw', 'wbw'], { w: WHITE, b: BLACK })
    const kept = extractInk(img, { mode: 'lineart', lightnessMax: 55, makeImageData })
    expect(kept.summary.denoised).toBe(false)
    expect(kept.summary.inkCoverage).toBeCloseTo(3 / 9, 5)

    const smoothed = extractInk(img, {
      mode: 'lineart',
      lightnessMax: 55,
      denoise: true,
      makeImageData,
    })
    expect(smoothed.summary.denoised).toBe(true)
    expect(smoothed.summary.inkCoverage).toBe(0)
  })
})

describe('maskToImageData', () => {
  it('paints ink black on white, fully opaque', () => {
    const out = maskToImageData(
      Uint8Array.from([1, 0]),
      2,
      1,
      makeImageData
    )
    expect(Array.from(out.data)).toEqual([0, 0, 0, 255, 255, 255, 255, 255])
  })
})

describe('dominantRejectedColor', () => {
  it('names one field colour, and says it is coherent', () => {
    const img = imageFrom(['LLLL', 'LggL'], { L: BLUE, g: BLACK })
    const mask = inkMask(img, {
      lightnessMax: INK_DEFAULTS.lightnessMax,
      chromaMax: INK_DEFAULTS.chromaMax,
    })
    const found = dominantRejectedColor(img, mask)
    expect(found.r).toBe(BLUE[0])
    expect(found.g).toBe(BLUE[1])
    expect(found.b).toBe(BLUE[2])
    expect(found.coherence).toBe(1)
  })

  it('reports low coherence when the fills disagree, so nothing is suggested', () => {
    // Blue and yellow average to a colour that is in neither.
    const img = imageFrom(['LY', 'LY'], { L: BLUE, Y: YELLOW })
    const mask = inkMask(img, {
      lightnessMax: INK_DEFAULTS.lightnessMax,
      chromaMax: INK_DEFAULTS.chromaMax,
    })
    const found = dominantRejectedColor(img, mask)
    expect(found.coherence).toBeLessThan(0.6)
  })

  it('says nothing rather than nothing-coloured when the page is grey', () => {
    const img = imageFrom(['wb'], { w: WHITE, b: BLACK })
    const mask = inkMask(img, {
      lightnessMax: INK_DEFAULTS.lightnessMax,
      chromaMax: INK_DEFAULTS.chromaMax,
    })
    expect(dominantRejectedColor(img, mask)).toBeNull()
  })
})

describe('extractInk', () => {
  const blueFieldGlyph = () =>
    imageFrom(
      ['wwwwww', 'wLLLLw', 'wLggLw', 'wLggLw', 'wLLLLw', 'wwwwww'],
      { w: WHITE, L: BLUE, g: BLACK }
    )

  it('standard mode hands the pixels straight back, untouched', () => {
    const img = blueFieldGlyph()
    const { imageData, summary } = extractInk(img, {
      mode: 'standard',
      makeImageData,
    })
    expect(imageData).toBe(img)
    expect(summary.applied).toBe(false)
    expect(summary.inkCoverage).toBeNull()
  })

  it('line art keeps the glyph and drops the field', () => {
    const { imageData, summary } = extractInk(blueFieldGlyph(), {
      mode: 'lineart',
      lightnessMax: INK_DEFAULTS.lightnessMax,
      makeImageData,
    })
    // The four glyph pixels, and nothing else.
    expect(summary.inkCoverage).toBeCloseTo(4 / 36, 5)
    expect(summary.components).toBe(1)
    // A glyph pixel is black; a field pixel is white.
    const at = (x, y) => imageData.data[(y * 6 + x) * 4]
    expect(at(2, 2)).toBe(0)
    expect(at(1, 1)).toBe(255)
    expect(at(0, 0)).toBe(255)
  })

  it('line art reports the field colour it rejected', () => {
    const { summary } = extractInk(blueFieldGlyph(), {
      mode: 'lineart',
      lightnessMax: INK_DEFAULTS.lightnessMax,
      makeImageData,
    })
    expect(summary.rejectedColor).toMatchObject({ r: 31, g: 95, b: 191 })
    expect(summary.rejectedColor.coherence).toBe(1)
  })

  it('silhouette keeps the whole outer shape', () => {
    const { summary } = extractInk(blueFieldGlyph(), {
      mode: 'silhouette',
      lightnessMax: INK_DEFAULTS.lightnessMax,
      makeImageData,
    })
    // The 4x4 field plus the glyph inside it, none of the white border.
    expect(summary.inkCoverage).toBeCloseTo(16 / 36, 5)
    expect(summary.components).toBe(1)
    expect(summary.rejectedColor).toBeNull()
  })

  it('turns a light drawing on a dark page the right way up', () => {
    const img = imageFrom(['bbbb', 'bwwb', 'bwwb', 'bbbb'], {
      b: BLACK,
      w: WHITE,
    })
    const { summary } = extractInk(img, {
      mode: 'lineart',
      lightnessMax: INK_DEFAULTS.lightnessMax,
      makeImageData,
    })
    expect(summary.inverted).toBe(true)
    // The four light pixels become the drawing, not the twelve dark ones.
    expect(summary.inkCoverage).toBeCloseTo(4 / 16, 5)
  })

  it('warns when the result is very nearly empty', () => {
    const img = imageFrom(Array(20).fill('w'.repeat(20)), { w: WHITE })
    const { summary } = extractInk(img, {
      mode: 'lineart',
      lightnessMax: INK_DEFAULTS.lightnessMax,
      makeImageData,
    })
    expect(summary.warnings).toContain('near-empty')
  })

  it('warns when a silhouette swallows nearly the whole picture', () => {
    const img = imageFrom(Array(10).fill('b'.repeat(10)), { b: BLACK })
    const { summary } = extractInk(img, {
      mode: 'silhouette',
      lightnessMax: INK_DEFAULTS.lightnessMax,
      makeImageData,
    })
    expect(summary.warnings).toContain('near-full')
  })

  it('lets transparency decide the shape when a picture has a real alpha channel', () => {
    // Yellow on transparent: too light and too colourful for the colour gate,
    // so only alpha can find it.
    const img = imageFrom(['ccc', 'cYc', 'ccc'], { c: CLEAR, Y: YELLOW })
    expect(alphaShare(img)).toBeGreaterThan(MEANINGFUL_ALPHA_SHARE)
    const { summary } = extractInk(img, {
      mode: 'lineart',
      lightnessMax: INK_DEFAULTS.lightnessMax,
      makeImageData,
    })
    expect(summary.usedAlpha).toBe(true)
    expect(summary.inkCoverage).toBeCloseTo(1 / 9, 5)
  })

  it('picks its own lightness threshold when none is given', () => {
    const { summary } = extractInk(blueFieldGlyph(), {
      mode: 'lineart',
      makeImageData,
    })
    expect(summary.lightnessMax).toBeGreaterThan(0)
    expect(summary.lightnessMax).toBeLessThan(100)
  })
})
