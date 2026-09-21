import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * D-131: the 2 MP cap was dead code on the ink path.
 *
 * `convertImageDataToSvg` computes a downscale into `pixels` when a picture is
 * over `IMAGE_IMPORT_LIMITS.maxPixels`, and then handed `extractInk` the
 * ORIGINAL `imageData` instead. Every ink mode - which is every mode an icon or
 * a photo goes through - therefore extracted and traced at full size, while the
 * summary reported that the picture had been scaled down.
 *
 * The mask the tracer eventually sees is `extractInk`'s output, so the pixel
 * count it is given is decided entirely by what `extractInk` is given. That is
 * what these tests pin.
 */

const extractInk = vi.fn((imageData) => ({
  imageData,
  summary: { mode: 'lineart', applied: true, inkCoverage: 0.2, warnings: [] },
}))

// Only extractInk is stood in for; the rest of the module is real, because
// the photo defaults (DP-79, ink-prepare.js) reach it through the same door.
vi.mock('../../src/js/ink-extraction.js', async (importActual) => ({
  ...(await importActual()),
  extractInk: (...args) => extractInk(...args),
}))

const imagedataToSVG = vi.fn(() => '<svg><path d="M0 0 L1 0 L1 1 Z" fill="#000000"/></svg>')

vi.mock('imagetracerjs', () => ({
  default: { imagedataToSVG: (...args) => imagedataToSVG(...args) },
}))

const { convertImageDataToSvg, IMAGE_IMPORT_LIMITS } = await import(
  '../../src/js/image-import.js'
)

/** A plain ImageData-shaped object; the pipeline never needs the real class. */
function picture(width, height) {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) }
}

describe('the working resolution on the main-thread road, after the cap (DP-79)', () => {
  beforeEach(() => {
    extractInk.mockClear()
    imagedataToSVG.mockClear()
  })

  it('★ a camera picture over the cap is worked at the print, and extractInk gets the worked pixels', async () => {
    // 2000 x 1500 is 3 MP: capped by two to 1000 x 750, then worked at forty
    // pixels per printed millimeter of a 14 mm print: 560 x 420. The host's
    // mmPerPixel is for the source; the cap's factor is carried across so
    // the print, not the cap, decides (the sharpie photograph said "1.9 mm"
    // for a 7.6 mm print before this).
    const { summary } = await convertImageDataToSvg(picture(2000, 1500), {
      ink: { mode: 'lineart', camera: true, mmPerPixel: 14 / 2000 },
    })
    expect(extractInk).toHaveBeenCalledTimes(1)
    const given = extractInk.mock.calls[0][0]
    expect(given.width).toBe(560)
    expect(given.height).toBe(420)
    expect(summary.downscale.factor).toBe(2)
    expect(summary.working).toMatchObject({ from: 1000, width: 560, printedWidthMm: 14 })
    expect(summary.printedWidthMm).toBe(14)
  })

  it('a file over the cap is only capped, as before', async () => {
    await convertImageDataToSvg(picture(2000, 1500), {
      ink: { mode: 'lineart', camera: false, mmPerPixel: 14 / 2000 },
    })
    expect(extractInk.mock.calls[0][0].width).toBe(1000)
  })
})

describe('the pixel cap actually reaches the ink path (D-131)', () => {
  beforeEach(() => {
    extractInk.mockClear()
    imagedataToSVG.mockClear()
  })

  it('hands extractInk the DOWNSCALED picture, not the original', async () => {
    // 2000 x 1500 = 3 MP, comfortably over the 2 MP cap.
    const original = picture(2000, 1500)
    expect(original.width * original.height).toBeGreaterThan(
      IMAGE_IMPORT_LIMITS.maxPixels
    )

    await convertImageDataToSvg(original, { ink: { mode: 'lineart' } })

    expect(extractInk).toHaveBeenCalledTimes(1)
    const given = extractInk.mock.calls[0][0]
    expect(given).not.toBe(original)
    expect(given.width * given.height).toBeLessThanOrEqual(
      IMAGE_IMPORT_LIMITS.maxPixels
    )
    // The whole-number step the cap uses: 3 MP needs a factor of 2.
    expect(given.width).toBe(1000)
    expect(given.height).toBe(750)
  })

  it('traces the downscaled pixel count, not the original one', async () => {
    await convertImageDataToSvg(picture(2000, 1500), {
      ink: { mode: 'lineart' },
    })

    expect(imagedataToSVG).toHaveBeenCalledTimes(1)
    const traced = imagedataToSVG.mock.calls[0][0]
    expect(traced.width * traced.height).toBeLessThanOrEqual(
      IMAGE_IMPORT_LIMITS.maxPixels
    )
    expect(traced.width).toBe(1000)
    expect(traced.height).toBe(750)
  })

  it('leaves a picture under the cap alone', async () => {
    const small = picture(400, 300)
    await convertImageDataToSvg(small, { ink: { mode: 'lineart' } })
    expect(extractInk.mock.calls[0][0]).toBe(small)
  })

  it('still reports the downscale in the summary', async () => {
    const { summary } = await convertImageDataToSvg(picture(2000, 1500), {
      ink: { mode: 'lineart' },
    })
    // The sentence a person reads has to stay true, and now it is: the factor
    // it names is the factor that was actually applied.
    expect(summary.downscale).toBeTruthy()
    expect(summary.downscale.factor).toBe(2)
  })

  it('standard mode, which has no ink step, traces the downscale too', async () => {
    await convertImageDataToSvg(picture(2000, 1500), {
      ink: { mode: 'standard' },
    })
    expect(extractInk).not.toHaveBeenCalled()
    const traced = imagedataToSVG.mock.calls[0][0]
    expect(traced.width).toBe(1000)
    expect(traced.height).toBe(750)
  })
})
