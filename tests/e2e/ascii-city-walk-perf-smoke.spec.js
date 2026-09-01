import { test, expect } from '@playwright/test'
import {
  useCityWalkFixtures,
  launchGame,
  enterCity,
} from './helpers/city-walk.js'

useCityWalkFixtures()

/**
 * ASCII City Walk - the acceptance path keeps running (CW-37).
 *
 * ★ THIS SPEC CANNOT TELL YOU THE GAME IS FAST, AND DOES NOT TRY.
 *
 * Round 5's bar (CW-Q28) is 30 frames a second at the smallest character size
 * with heavy rain, under a 4x CPU throttle. That number is measured by
 * `scripts/bench-city-walk.mjs`, HEADED, on a real GPU, with the renderer
 * string printed and read - because headless Chromium rasterises in software
 * through SwiftShader and reads about a third of the real frame rate. Three
 * separate confident wrong answers in this project have come from timing a
 * headless browser.
 *
 * So the division of labour is: **the local bench proves it is fast, and this
 * spec proves it still RUNS.** What CI can honestly check is that the hardest
 * configuration the round targets - the 10% floor, rain falling, a city
 * loaded - still converts frame after frame instead of stalling, throwing, or
 * silently falling back to nothing. That is a real regression guard: the
 * round rebuilt the converter's sampling (CW-31), moved glyph choice onto the
 * GPU (CW-32), and added two surface classes and new facades (CW-33, CW-34),
 * any of which could stop the pipeline dead without a single unit test
 * noticing.
 *
 * Every gate here counts FRAMES, never milliseconds. A loaded CI runner can
 * render zero frames inside a 700 ms window, which is exactly how an earlier
 * version of the City Walk suite went red on Edge while passing three times
 * over locally on the same browser.
 */

test.describe('ASCII City Walk — the acceptance path runs (CW-37)', () => {
  /** The converter's own counters, DEV-only, read from the page. */
  const stats = (page) =>
    page.evaluate(
      () => window.__cityWalkGame?.altView?.getConvertStats?.() ?? null
    )

  /** Wait until the converter has produced n more frames than it had.
   * CW-97: the outer bound widened 90 to 150 s - the slowest software
   * shard measured ~3.1 s per conversion at the floor with heavy rain on
   * the heavier crown-cluster city, and 30 frames at that pace is ~93 s.
   * The gate stays frames; only the outer bound moved, exactly as this
   * file's own header prescribes. */
  async function waitForConversions(page, n) {
    const from = (await stats(page))?.samples ?? 0
    await expect
      .poll(async () => (await stats(page))?.samples ?? 0, { timeout: 150000 })
      .toBeGreaterThanOrEqual(from + n)
  }

  /** Wind the character size down to its floor the way the key does. */
  async function goToCharFloor(page) {
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('Minus')
    }
    return page.evaluate(() => window.__cityWalkGame.altView.getFontScale())
  }

  test('the smallest characters with heavy rain keep converting', async ({
    page,
  }) => {
    // The wall clock here is an OUTER bound only, wide enough that the frame
    // gates decide - the default 60 s killed a green test mid-poll on a
    // loaded runner that had passed it in 30 s the run before. 150 s then
    // died the same death on the crown-cluster city (29 of 30 conversions
    // when the poll expired), so the bound follows the measured pace up.
    test.setTimeout(240_000)
    await launchGame(page)
    await enterCity(page)

    expect(
      await stats(page),
      'no converter counters - this build is not the dev server, so nothing here can be measured'
    ).not.toBeNull()

    const floor = await goToCharFloor(page)
    expect(floor).toBeCloseTo(0.1, 5)

    // Rain: off -> light -> heavy. It refuses to fall under reduced motion,
    // which is correct behaviour and not a failure - the run then measures
    // the floor without rain rather than pretending.
    await page.keyboard.press('KeyG')
    await page.keyboard.press('KeyG')
    const rain = await page.evaluate(() => window.__cityWalkGame.rainLevel)

    // Walk, so the street is being rebuilt as well as repainted - a converter
    // that only survives a static frame is not the thing the bar is about.
    await page.keyboard.down('ArrowUp')
    await waitForConversions(page, 30)
    await page.keyboard.up('ArrowUp')

    const after = await stats(page)
    console.log(
      `[cw37] floor=${floor} rain=${rain} cells=${after.cells} ` +
        `gpu=${after.usedGpu} avg=${after.avgMs.toFixed(1)}ms ` +
        `interval=${after.dynamicIntervalMs}ms`
    )

    // A frame with no cells is a blank screen that still ticks a counter.
    expect(after.cells).toBeGreaterThan(1000)
    // And the walker actually went somewhere, so those frames were work.
    const moved = await page.evaluate(() => {
      const w = window.__cityWalkGame.walkState
      return Math.hypot(w.x, w.y)
    })
    expect(moved).toBeGreaterThan(0)
  })

  test('the GPU glyph path is the one that ran, where there is a GPU', async ({
    page,
  }) => {
    test.setTimeout(150_000)
    await launchGame(page)
    await enterCity(page)
    // Enough frames that a pass which initialises lazily has certainly had
    // its chance - this asks which path the game SETTLES on, not which one
    // happened to draw the very first frame.
    await waitForConversions(page, 15)

    const s = await stats(page)
    console.log(
      `[cw37] gpuAvailable=${s.gpuAvailable} usedGpu=${s.usedGpu} ` +
        `failure=${s.gpuFailure || 'none'}`
    )

    // CW-32 put glyph choice in a fragment shader and made it the default.
    // On a runner whose GL cannot do it the CPU path is the correct answer,
    // so this asserts the CONSISTENCY of the two flags rather than demanding
    // a GPU that CI may not have: if the pass reports itself available, it
    // must actually be what converted the frame.
    if (s.gpuAvailable) {
      expect(s.usedGpu).toBe(true)
    } else {
      expect(s.gpuFailure).not.toBe('')
      expect(s.usedGpu).toBe(false)
    }
  })
})
