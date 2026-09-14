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

// The Potrace engine is stood in for here, because this file is about the
// wiring: which engine is asked for, what it is handed, and what the reply
// says. The engine itself runs for real in tests/unit/potrace-trace.test.js,
// against the wasm that actually ships.
const potraceTrace = vi.fn(async () => 'M0 0L1 0L1 1Z')
vi.mock('../../src/js/potrace-trace.js', async (importActual) => {
  const actual = await importActual()
  return { ...actual, trace: (...args) => potraceTrace(...args) }
})

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

/** A picture with a see-through corner, for the Standard-mode composite. */
function seeThrough(width, height) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const clear = x < width / 2
      // Red underneath, so a composite that keeps the colour and drops the
      // alpha is visible as red rather than passing for white.
      data[i] = 255
      data[i + 1] = 0
      data[i + 2] = 0
      data[i + 3] = clear ? 0 : 255
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
    // Engine named on purpose: the hand-off this checks is imagetracerjs's,
    // where the caller still has a filtering step to do. DP-Q43 made Potrace
    // the default, and its hand-off is pinned in "choosing an engine" below.
    const out = await run({
      id: 7,
      image: picture(40, 40),
      ink: { mode: 'lineart' },
      engine: 'imagetracer',
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

describe('choosing an engine (DP-43)', () => {
  beforeEach(() => {
    posted.length = 0
    potraceTrace.mockClear()
  })

  it('★ uses Potrace when nobody chooses, as signed at DP-Q43', async () => {
    const out = await run({
      id: 1,
      image: picture(40, 40),
      ink: { mode: 'lineart' },
    })
    expect(done(out).engine).toBe('potrace')
    expect(potraceTrace).toHaveBeenCalledTimes(1)
  })

  it('still takes imagetracer when it is asked for by name', async () => {
    const out = await run({
      id: 1,
      image: picture(40, 40),
      ink: { mode: 'lineart' },
      engine: 'imagetracer',
    })
    expect(done(out).engine).toBe('imagetracer')
    expect(potraceTrace).not.toHaveBeenCalled()
  })

  it('★ hands Potrace the one-bit ink mask, not a picture of it', async () => {
    // The mask is what extractInk already computed. Painting it black on white
    // and reading the pixels back would be the same answer by a longer road,
    // and a lossier one.
    const out = await run({
      id: 2,
      image: picture(40, 40),
      ink: { mode: 'lineart' },
      engine: 'potrace',
    })
    expect(potraceTrace).toHaveBeenCalledTimes(1)
    const [mask, width, height] = potraceTrace.mock.calls[0]
    expect(mask).toBeInstanceOf(Uint8Array)
    expect(mask.length).toBe(40 * 40)
    expect(width).toBe(40)
    expect(height).toBe(40)
    // The blob is in there, and so is the paper around it.
    expect(mask.some((v) => v !== 0)).toBe(true)
    expect(mask.some((v) => v === 0)).toBe(true)
    expect(done(out).engine).toBe('potrace')
  })

  it('wraps the path data as one even-odd shape, and asks for no filtering', async () => {
    // filterForegroundPaths drops the lightest path. Potrace answers in one
    // colour, so the lightest path is the only path, and running it would
    // erase the drawing.
    const out = await run({
      id: 3,
      image: picture(40, 40),
      ink: { mode: 'silhouette' },
      engine: 'potrace',
    })
    const reply = done(out)
    expect(reply.filterForeground).toBe(false)
    expect(reply.svg).toContain('fill-rule="evenodd"')
    expect(reply.svg).toContain('d="M0 0L1 0L1 1Z"')
    expect(reply.svg).toContain('width="40" height="40"')
  })

  it('★ falls back for Standard, and says so instead of pretending', async () => {
    // Standard keeps the picture's own colours and produces no mask. Potrace
    // draws in one colour and cannot answer that question at all.
    const out = await run({
      id: 4,
      image: picture(40, 40),
      ink: { mode: 'standard' },
      engine: 'potrace',
    })
    expect(potraceTrace).not.toHaveBeenCalled()
    expect(done(out).engine).toBe('imagetracer')
    expect(done(out).filterForeground).toBe(true)
  })

  it('leaves Colours on its own road', async () => {
    const out = await run({
      id: 5,
      image: picture(40, 40),
      ink: { mode: 'colours', colourCount: 3 },
      engine: 'potrace',
    })
    expect(potraceTrace).not.toHaveBeenCalled()
    expect(done(out).engine).toBe('colours')
  })

  it('★ applies the signed curve tolerance, and lets a caller beat it', async () => {
    // DP-Q43 signed opttolerance 1.0 as what Forge asks Potrace for. It is
    // applied by default and overridden by name, in that order - a setting
    // nobody can override is a constant wearing a setting's clothes.
    await run({
      id: 6,
      image: picture(40, 40),
      ink: { mode: 'lineart' },
      engine: 'potrace',
      potraceOverrides: { turdsize: 12, alphamax: 0 },
    })
    expect(potraceTrace.mock.calls[0][3]).toEqual({
      opttolerance: 1.0,
      turdsize: 12,
      alphamax: 0,
    })

    potraceTrace.mockClear()
    await run({
      id: 7,
      image: picture(40, 40),
      ink: { mode: 'lineart' },
      engine: 'potrace',
      potraceOverrides: { opttolerance: 0.2 },
    })
    expect(potraceTrace.mock.calls[0][3]).toEqual({ opttolerance: 0.2 })
  })

  it('a Potrace failure comes back as a message, not a silence', async () => {
    potraceTrace.mockRejectedValueOnce(new Error('wasm did not load'))
    const out = await run({
      id: 7,
      image: picture(40, 40),
      ink: { mode: 'lineart' },
      engine: 'potrace',
    })
    expect(failed(out).message).toBe('wasm did not load')
    expect(done(out)).toBeUndefined()
  })
})

describe('Standard mode and see-through pictures (DP-36, audit 15)', () => {
  beforeEach(() => {
    posted.length = 0
  })

  it('★ says so when it put a see-through picture on white', async () => {
    const out = await run({
      id: 1,
      image: seeThrough(40, 40),
      ink: { mode: 'standard' },
    })
    const reply = done(out)
    expect(reply.summary).toMatchObject({
      mode: 'standard',
      applied: false,
      composited: true,
      warnings: ['composited-onto-white'],
    })
  })

  it('a picture with no transparency gets no note about one', async () => {
    const out = await run({
      id: 2,
      image: picture(40, 40),
      ink: { mode: 'standard' },
    })
    expect(done(out).summary).toBeNull()
  })

  it('the ink modes are untouched by it: they build a mask instead', async () => {
    const out = await run({
      id: 3,
      image: seeThrough(40, 40),
      ink: { mode: 'lineart' },
    })
    expect(done(out).summary.mode).toBe('lineart')
    expect(done(out).summary.warnings).not.toContain('composited-onto-white')
  })
})
