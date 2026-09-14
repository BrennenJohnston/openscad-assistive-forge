import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * DP-34: the trace worker itself.
 *
 * The worker is a module that installs a handler on `self`, so the test
 * supplies a `self`, imports the module, and then drives the handler directly.
 * That is the honest way round: it exercises the real stages on real pixels
 * rather than a mock of them.
 *
 * What matters here: the stages happen in order and are reported; the pixel cap
 * is applied before any of the expensive work; the caller is told whether the
 * result still needs filtering; and a failure comes back as a message rather
 * than as a silence.
 */

const posted = []
const fakeSelf = {
  onmessage: null,
  postMessage: (message) => posted.push(message),
}
vi.stubGlobal('self', fakeSelf)

await import('../../src/js/trace-worker.js')
const { IMAGE_IMPORT_LIMITS } = await import('../../src/js/image-import.js')

/** A picture with a dark blob in it, so the ink step has something to find. */
function picture(width, height) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const dark = x > width / 4 && x < (width * 3) / 4 && y > height / 4 && y < (height * 3) / 4
      data[i] = data[i + 1] = data[i + 2] = dark ? 0 : 255
      data[i + 3] = 255
    }
  }
  return { width, height, buffer: data.buffer }
}

async function run(message) {
  posted.length = 0
  await fakeSelf.onmessage({ data: message })
  return posted
}

const stages = (messages) =>
  messages.filter((m) => m.type === 'stage').map((m) => m.stage)
const done = (messages) => messages.find((m) => m.type === 'done')
const failed = (messages) => messages.find((m) => m.type === 'error')

describe('the trace worker (DP-34)', () => {
  beforeEach(() => {
    posted.length = 0
  })

  it('installs a handler when it loads', () => {
    expect(typeof fakeSelf.onmessage).toBe('function')
  })

  it('ignores a message with no job id, rather than answering the wrong caller', async () => {
    const out = await run({ image: picture(8, 8), ink: { mode: 'lineart' } })
    expect(out).toEqual([])
  })

  it('traces a picture and reports its stages in order', async () => {
    const out = await run({
      id: 7,
      image: picture(40, 40),
      ink: { mode: 'lineart' },
    })
    expect(stages(out)).toEqual(['reading', 'ink', 'tracing'])
    const result = done(out)
    expect(result.id).toBe(7)
    expect(result.svg).toContain('<svg')
    // DOMParser is not available here, so the caller does the last step.
    expect(result.filterForeground).toBe(true)
    expect(result.summary.mode).toBe('lineart')
  })

  it('every message carries the job id it belongs to', async () => {
    const out = await run({
      id: 42,
      image: picture(24, 24),
      ink: { mode: 'lineart' },
    })
    expect(out.length).toBeGreaterThan(1)
    for (const message of out) expect(message.id).toBe(42)
  })

  it('★ applies the pixel cap before the expensive work', async () => {
    // 1800 x 1200 = 2.16 MP, just over the cap. If the cap were skipped here
    // the way it was on the main-thread path (D-131), this would be traced at
    // full size and the reported factor would be a lie.
    const big = picture(1800, 1200)
    expect(1800 * 1200).toBeGreaterThan(IMAGE_IMPORT_LIMITS.maxPixels)
    const out = await run({ id: 1, image: big, ink: { mode: 'lineart' } })
    expect(done(out).summary.downscale.factor).toBe(2)
  })

  it('leaves a picture under the cap alone', async () => {
    const out = await run({ id: 2, image: picture(40, 40), ink: { mode: 'lineart' } })
    expect(done(out).summary.downscale).toBeUndefined()
  })

  it('standard mode skips the ink stage but still traces', async () => {
    const out = await run({ id: 3, image: picture(40, 40), ink: { mode: 'standard' } })
    expect(stages(out)).toEqual(['reading', 'tracing'])
    expect(done(out).svg).toContain('<svg')
  })

  it('with no ink settings at all it still traces', async () => {
    const out = await run({ id: 4, image: picture(40, 40), ink: null })
    expect(done(out).svg).toContain('<svg')
  })

  it('Colours comes back unfiltered, because its lightest layer is the wall', async () => {
    const out = await run({
      id: 5,
      image: picture(40, 40),
      ink: { mode: 'colours', colourCount: 3 },
    })
    const result = done(out)
    expect(result.filterForeground).toBe(false)
    expect(result.summary.mode).toBe('colours')
    expect(Array.isArray(result.summary.colours)).toBe(true)
  })

  it('★ a failure is reported, never swallowed', async () => {
    // A buffer that cannot be the size the dimensions claim.
    const out = await run({
      id: 6,
      image: { width: 100, height: 100, buffer: new Uint8ClampedArray(4).buffer },
      ink: { mode: 'lineart' },
    })
    const error = failed(out)
    expect(error).toBeTruthy()
    expect(error.id).toBe(6)
    expect(typeof error.message).toBe('string')
    expect(error.message.length).toBeGreaterThan(0)
  })
})
