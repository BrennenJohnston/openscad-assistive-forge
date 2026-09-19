import { describe, it, expect } from 'vitest'
import {
  quickLook,
  quickLookSentence,
  thumbnailOf,
  transparentShare,
  COST_MODEL,
  COST_BANDS,
  THUMBNAIL_EDGE,
} from '../../src/js/quick-look.js'
import { IMAGE_IMPORT_LIMITS } from '../../src/js/image-import.js'

/**
 * DP-35: the quick look.
 *
 * The point of these tests is that the sentence is HONEST. A cost estimate that
 * is confidently wrong is worse than none, so what is pinned here is the shape
 * of the reasoning: which ink path the cost is predicated on, that the pixel cap
 * is taken into account before the estimate rather than after, that the device
 * factor cannot run away, and that a photograph is never called a simple icon.
 */

const makeImageData = (width, height) => ({
  width,
  height,
  data: new Uint8ClampedArray(width * height * 4),
})

/** A picture with a dark blob on a transparent ground, like a library icon. */
function iconLike(size = 700) {
  const data = new Uint8ClampedArray(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      const inMark =
        x > size * 0.3 && x < size * 0.7 && y > size * 0.3 && y < size * 0.7
      data[i] = data[i + 1] = data[i + 2] = 0
      data[i + 3] = inMark ? 255 : 0
    }
  }
  return { width: size, height: size, data }
}

/** A picture with no transparency at all, like a camera photograph. */
function photoLike(width = 2000, height = 1500) {
  const data = new Uint8ClampedArray(width * height * 4)
  let seed = 99
  for (let i = 0; i < data.length; i += 4) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    const v = 40 + ((seed >> 16) & 0x7f)
    data[i] = v
    data[i + 1] = v
    data[i + 2] = v
    data[i + 3] = 255
  }
  return { width, height, data }
}

/** A small drawing on white paper: no transparency, mostly background. */
function drawingLike(size = 600) {
  const data = new Uint8ClampedArray(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      const onLine = Math.abs(x - y) < 4
      const v = onLine ? 20 : 250
      data[i] = data[i + 1] = data[i + 2] = v
      data[i + 3] = 255
    }
  }
  return { width: size, height: size, data }
}

/**
 * The device factor is pinned rather than measured, so these tests are about
 * the model rather than about how busy the machine happens to be.
 */
const look = (pixels, deviceFactor = 1) =>
  quickLook(pixels, { makeImageData, deviceFactor })

describe('the quick look (DP-35)', () => {
  describe('the thumbnail', () => {
    it('shrinks to the measured edge in whole-number steps', () => {
      const t = thumbnailOf(iconLike(700))
      expect(Math.max(t.width, t.height)).toBeLessThanOrEqual(THUMBNAIL_EDGE)
      expect(t.width).toBe(87) // 700 / ceil(700/96) = 700 / 8
      expect(t.data.length).toBe(t.width * t.height * 4)
    })

    it('leaves a picture already smaller than the thumbnail alone', () => {
      const small = { width: 40, height: 30, data: new Uint8ClampedArray(40 * 30 * 4) }
      const t = thumbnailOf(small)
      expect(t.width).toBe(40)
      expect(t.height).toBe(30)
    })
  })

  describe('transparency', () => {
    it('counts the see-through pixels', () => {
      expect(transparentShare(iconLike(100))).toBeGreaterThan(0.5)
      expect(transparentShare(photoLike(100, 100))).toBe(0)
    })
  })

  describe('what the picture is', () => {
    it('calls a transparent mark an icon', () => {
      expect(look(iconLike(700)).pictureClass).toBe('icon')
    })

    it('calls a big opaque picture a photo', () => {
      expect(look(photoLike(2000, 1500)).pictureClass).toBe('photo')
    })

    it('calls a small opaque drawing a drawing', () => {
      expect(look(drawingLike(600)).pictureClass).toBe('drawing')
    })

    it('★ never calls a photograph a simple icon', () => {
      const sentence = quickLookSentence(look(photoLike(3000, 2000)))
      expect(sentence).not.toContain('simple icon')
      expect(sentence).toContain('Icons and line drawings work best.')
    })
  })

  describe('the cost', () => {
    it('predicts from the CAPPED pixels, because the picture is scaled down first', () => {
      const eight = look(photoLike(3264, 2448))
      const twelve = look(photoLike(4000, 3000))
      expect(eight.willScaleDown).toBe(true)
      expect(twelve.willScaleDown).toBe(true)
      expect(eight.cappedMegapixels).toBeCloseTo(IMAGE_IMPORT_LIMITS.maxPixels / 1e6, 5)
      // Both become 2 MP, so both cost the same. A model built on the ORIGINAL
      // size would have told the 12 MP owner a number half as big again.
      expect(twelve.predictedMs).toBeCloseTo(eight.predictedMs, 5)
    })

    it('★ prices the two ink paths differently, because they cost differently', () => {
      // MEASURED in Chromium at about 200 ms per megapixel through the alpha
      // path and 450 through the colour path - a factor of 2.25. Using one
      // number for both would call a photograph quick.
      const icon = look(iconLike(1400)) // ~1.96 MP, transparent
      const photo = look(photoLike(1400, 1400)) // ~1.96 MP, opaque
      expect(icon.cappedMegapixels).toBeCloseTo(photo.cappedMegapixels, 1)
      expect(photo.predictedMs).toBeGreaterThan(icon.predictedMs * 1.8)
      expect(photo.predictedMs).toBeLessThan(icon.predictedMs * 3)
    })

    it('calls a library icon quick', () => {
      const l = look(iconLike(700))
      expect(l.costBand).toBe('quick')
      expect(quickLookSentence(l)).toContain('under a second')
    })

    it('does not call a big photograph quick', () => {
      expect(look(photoLike(3264, 2448)).costBand).not.toBe('quick')
    })

    it('says how many seconds only when it is going to be long', () => {
      const quick = quickLookSentence(look(iconLike(700)))
      expect(quick).not.toMatch(/\d+ seconds/)
      const slow = quickLookSentence(look(photoLike(3264, 2448), 12))
      expect(slow).toMatch(/about \d+ seconds on this device/)
    })

    it('★ a slow device raises the estimate', () => {
      const fast = look(photoLike(2000, 1500), 1)
      const slow = look(photoLike(2000, 1500), 6)
      expect(slow.predictedMs).toBeCloseTo(fast.predictedMs * 6, 5)
    })

    it('★ one unlucky sample cannot run the estimate away', () => {
      // A garbage collection landing inside the measurement must not turn a
      // one-second job into a two-minute warning, and a clock that reports zero
      // must not make everything look instant.
      const clock = (ms) => {
        let t = 0
        return () => {
          const out = t
          t += ms
          return out
        }
      }
      const absurd = quickLook(photoLike(800, 600), {
        makeImageData,
        now: clock(5000),
      })
      expect(absurd.deviceFactor).toBe(COST_MODEL.deviceFactorMax)

      const impossible = quickLook(photoLike(800, 600), {
        makeImageData,
        now: clock(0),
      })
      expect(impossible.deviceFactor).toBe(COST_MODEL.deviceFactorMin)
    })

    it('★ measures the MACHINE, not the picture', () => {
      // The first version of this timed the thumbnail's own ink extraction, and
      // which ink path that takes depends on whether the picture is
      // transparent - so the same machine reported 0.5 for an icon and 2.4 for
      // a photograph. The calibration is fixed work now, so two very different
      // pictures must agree about how fast the machine is.
      const iconFactor = quickLook(iconLike(700), { makeImageData }).deviceFactor
      const photoFactor = quickLook(photoLike(1200, 900), { makeImageData })
        .deviceFactor
      const ratio =
        Math.max(iconFactor, photoFactor) / Math.min(iconFactor, photoFactor)
      expect(ratio, `icon ${iconFactor} vs photo ${photoFactor}`).toBeLessThan(3)
    })

    it('the bands are in the order the sentences assume', () => {
      expect(COST_BANDS.quickMs).toBeLessThan(COST_BANDS.fewSecondsMs)
    })
  })

  describe('the sentence', () => {
    it('adds the scale-down clause only when the picture is over the cap', () => {
      expect(quickLookSentence(look(iconLike(700)))).not.toContain('scaled down')
      const big = quickLookSentence(look(photoLike(3264, 2448)))
      expect(big).toContain('scaled down first')
      expect(big).toContain('8.0 MP')
    })

    it('is one short sentence or two, never a wall', () => {
      for (const p of [iconLike(700), drawingLike(600), photoLike(3264, 2448)]) {
        const s = quickLookSentence(look(p))
        expect(s.length).toBeLessThan(200)
        expect(s).not.toContain('  ')
      }
    })

    it('has no em dashes, per the project rule', () => {
      for (const p of [iconLike(700), drawingLike(600), photoLike(3264, 2448)]) {
        expect(quickLookSentence(look(p))).not.toContain('—')
      }
    })
  })

  it('counts the thumbnail shapes when a tracer is supplied, and works without one', () => {
    // The file control does NOT supply one: tracing the thumbnail would pull
    // imagetracerjs back into the core bundle it has just left, and the
    // sentence does not use the count anyway. The hook stays for a caller that
    // already has the tracer in hand.
    const withTracer = quickLook(iconLike(700), {
      makeImageData,
      deviceFactor: 1,
      trace: () => '<svg><path d="M0 0"/><path d="M1 1"/></svg>',
    })
    expect(withTracer.thumbnailShapes).toBe(2)
    expect(look(iconLike(700)).thumbnailShapes).toBe(0)
  })
})
