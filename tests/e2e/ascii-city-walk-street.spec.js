import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import {
  expectOnlyAllowedViolations,
  useCityWalkFixtures,
  launchGame,
  webglAvailable,
  enterCity,
} from './helpers/city-walk.js'
import { SURFACE_CLASS } from '../../src/js/game/city-class-pass.js'
import { ANCHORED_CLASSES } from '../../src/js/game/city-glyph-field.js'

useCityWalkFixtures()

/**
 * ASCII City Walk - the city itself: what it grows, how it is painted, what
 * the weather does to it, and what it tells you about where you are.
 *
 * Split out of ascii-city-walk.spec.js; see helpers/city-walk.js for why.
 */

test.describe('ASCII City Walk — trees and parked cars (CW-16)', () => {
  const propStats = (page) =>
    page.evaluate(() => window.__cityWalkGame?.props?.stats ?? null)

  test('Seattle is furnished with real map trees, infill, and parked cars', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)

    const stats = await propStats(page)
    expect(stats).not.toBeNull()
    // Seattle's extract carries 119 natural=tree nodes; the rest of the
    // trees are the deterministic curbside infill.
    expect(stats.mappedTreeCount).toBeGreaterThan(50)
    expect(stats.treeCount).toBeGreaterThan(stats.mappedTreeCount)
    expect(stats.carCount).toBeGreaterThan(50)
  })

  test('a parked car is solid: you press against it, never through it', async ({
    page,
  }) => {
    // This case waits up to 90 s for 150 rendered frames, and says why in the
    // comment at that poll. It never got to spend them: the test's own budget
    // is 60 s by default, so the 90 s patience was unreachable and the case
    // died at 60 with `keyboard.up: Test timeout of 60000ms exceeded` - the
    // cleanup line, not the assertion. It measured 72 s on a loaded runner.
    // The budget now covers the patience the poll asks for (D-79). The BAR is
    // still the frame count; this only makes the waiting possible.
    test.setTimeout(150_000)
    await launchGame(page)
    await enterCity(page)

    // Stand the player on the roadway three meters off a parked car's flank,
    // facing it, and watch every frame of the walk from inside the page. The
    // approach side is chosen by asking the collision grid which one is open,
    // so the walk starts on clear tarmac.
    const setup = await page.evaluate(() => {
      const game = window.__cityWalkGame
      const cars = game.props.obstacles.filter((o) => o.halfLengthM > 1)
      for (const car of cars) {
        // Across the car, not along it.
        const wx = -Math.sin(car.rotationRad)
        const wy = Math.cos(car.rotationRad)
        for (const side of [1, -1]) {
          const x = car.x + wx * 3 * side
          const y = car.y + wy * 3 * side
          if (game.collision.isBlocked(x, y)) continue
          if (
            game.collision.isBlocked(
              car.x + wx * 2 * side,
              car.y + wy * 2 * side
            )
          ) {
            continue
          }
          const w = game.walkState
          w.x = x
          w.y = y
          // Heading is a compass bearing: 0 faces +Y, increasing clockwise.
          w.headingRad = Math.atan2(car.x - x, car.y - y)
          w.pitchRad = 0

          // Watch the approach in the car's own frame: lx runs along the car,
          // ly across it. Sampled per frame rather than polled on a clock.
          const cos = Math.cos(car.rotationRad)
          const sin = Math.sin(car.rotationRad)
          const startSide = Math.sign(-(x - car.x) * sin + (y - car.y) * cos)
          window.__cwCar = {
            frames: 0,
            walked: 0,
            closest: 99,
            crossings: 0,
          }
          let px = x
          let py = y
          const tick = () => {
            const p = game.walkState
            const watch = window.__cwCar
            watch.frames++
            watch.walked += Math.hypot(p.x - px, p.y - py)
            px = p.x
            py = p.y
            const dx = p.x - car.x
            const dy = p.y - car.y
            const lx = dx * cos + dy * sin
            const ly = -dx * sin + dy * cos
            if (Math.abs(lx) <= car.halfLengthM) {
              watch.closest = Math.min(watch.closest, Math.abs(ly))
              if (Math.sign(ly) !== startSide) watch.crossings++
            }
            window.__cwCarTick = requestAnimationFrame(tick)
          }
          window.__cwCarTick = requestAnimationFrame(tick)
          return { x, y }
        }
      }
      return null
    })

    expect(
      setup,
      'no parked car with an open approach was found'
    ).not.toBeNull()

    await page.keyboard.down('ArrowUp')
    try {
      // Waiting on FRAMES, never on the clock: a loaded runner renders them
      // slowly, but each frame still advances the walk by up to the 0.1 s
      // step clamp, so 150 frames is far more travel than the three meters
      // it would take to cross an unsolid car. A runner that renders nothing
      // fails here rather than passing vacuously.
      //
      // The patience is 90 s, not 30. CI renders through SwiftShader, where
      // triangle count is real time, and CW-18's street furniture took the
      // Chromium runner from comfortably over 150 frames to 123 - about
      // 4.1 fps where the old budget needed 5. The BAR is the frame count,
      // which is the invariant; the timeout is only how long we are willing
      // to wait for it, and on a software renderer drawing a furnished city
      // it has to be longer. On a real GPU this takes about 5 s.
      await expect
        .poll(() => page.evaluate(() => window.__cwCar?.frames ?? 0), {
          timeout: 90000,
          intervals: [200],
        })
        .toBeGreaterThan(150)
    } finally {
      await page.keyboard.up('ArrowUp')
    }

    const watch = await page.evaluate(() => {
      cancelAnimationFrame(window.__cwCarTick)
      return window.__cwCar
    })

    // The walk really happened, and it really arrived at the car's flank.
    expect(watch.walked).toBeGreaterThan(1.5)
    expect(watch.closest).toBeLessThan(1.3)
    // ...and stopped outside it. The car is 1.8 m across, so its own surface
    // is at 0.9 m; the collision grid's 1 m cells hold the player a little
    // further out than that, and never let them reach the far side.
    expect(watch.closest).toBeGreaterThan(0.5)
    expect(watch.crossings).toBe(0)
  })

  test('the map view stays a clean street network', async ({ page }) => {
    await launchGame(page)
    await enterCity(page)

    const propsVisible = () =>
      page.evaluate(() => window.__cityWalkGame?.props?.group?.visible ?? null)

    expect(await propsVisible()).toBe(true)

    await page.keyboard.press('KeyM')
    await expect(page.locator('#cityWalkHudStatus')).toContainText('map view')
    expect(await propsVisible()).toBe(false)

    await page.keyboard.press('KeyM')
    await expect(page.locator('#cityWalkHudStatus')).toContainText('street view')
    expect(await propsVisible()).toBe(true)
  })
})

test.describe('ASCII City Walk — the colour toggle (CW-Q16)', () => {
  const colourBtn = (page) => page.locator('#cityWalkColourBtn')
  const contrastBtn = (page) => page.locator('#cityWalkContrastBtn')
  const announcer = (page) => page.locator('#cityWalkAnnouncer')

  /** CW-97 batch 5: the colour flip rebuilds the glyph atlas
   * synchronously, and on CI software that handler can outlive even the
   * 30 s action budget - dispatch without waiting, then wait on the
   * pressed state actually flipping, which is the real post-condition. */
  const clickColour = async (page) => {
    const before = await colourBtn(page).getAttribute('aria-pressed')
    await colourBtn(page).click({ noWaitAfter: true })
    await expect(colourBtn(page)).toHaveAttribute(
      'aria-pressed',
      before === 'true' ? 'false' : 'true',
      { timeout: 120000 }
    )
  }

  /** How many colours the converter is quantizing to, or null for phosphor. */
  const paletteSize = (page) =>
    page.evaluate(
      () => window.__cityWalkGame?.altView?.getPalette()?.length ?? null
    )

  const storedChoice = (page) =>
    page.evaluate(() =>
      localStorage.getItem('openscad-forge-city-walk-colour')
    )

  test('starts by following high contrast, and stores nothing until you press it', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)

    // Nothing stored: the shipped behaviour is exactly what CW-Q2 gave -
    // high contrast off means a single phosphor.
    expect(await storedChoice(page)).toBeNull()
    await expect(colourBtn(page)).toHaveAttribute('aria-pressed', 'false')
    await expect(colourBtn(page)).toHaveAttribute(
      'aria-label',
      'Color off. Press to show the city in color.'
    )
    expect(await paletteSize(page)).toBeNull()

    // High contrast alone still brings the palette, and the colour button
    // follows it without being touched.
    await contrastBtn(page).click()
    await expect.poll(() => paletteSize(page)).toBeGreaterThanOrEqual(4)
    await expect(colourBtn(page)).toHaveAttribute('aria-pressed', 'true')
    expect(await storedChoice(page)).toBeNull()
  })

  test('turns the palette on with high contrast off, and says so', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)

    await clickColour(page)
    await expect(colourBtn(page)).toHaveAttribute('aria-pressed', 'true')
    await expect(announcer(page)).toHaveText(
      'Color on. The city is drawn in the retro palette.'
    )
    await expect.poll(() => paletteSize(page)).toBeGreaterThanOrEqual(4)
    // The point of CW-Q16: colour without high contrast.
    await expect(page.locator('html')).not.toHaveAttribute(
      'data-high-contrast',
      'true'
    )
    expect(await storedChoice(page)).toBe('on')

    await clickColour(page)
    await expect(colourBtn(page)).toHaveAttribute('aria-pressed', 'false')
    await expect(announcer(page)).toHaveText(
      'Color off. The city is drawn in a single phosphor.'
    )
    await expect.poll(() => paletteSize(page)).toBeNull()
    expect(await storedChoice(page)).toBe('off')
  })

  test('O works the button, on the picker as well as in the city', async ({
    page,
  }) => {
    await launchGame(page)

    // Above the game guard, like C and T: it works before a city loads.
    await page.keyboard.press('KeyO')
    await expect(colourBtn(page)).toHaveAttribute('aria-pressed', 'true')
    expect(await storedChoice(page)).toBe('on')

    await enterCity(page)
    await expect.poll(() => paletteSize(page)).toBeGreaterThanOrEqual(4)

    await page.keyboard.press('KeyO')
    await expect(colourBtn(page)).toHaveAttribute('aria-pressed', 'false')
    await expect.poll(() => paletteSize(page)).toBeNull()
  })

  test('a choice you made yourself outranks high contrast, both ways', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)

    // Choose monochrome, then turn high contrast ON: the city stays a single
    // phosphor, because the player asked for it. This is the whole point of
    // storing the choice, and it is the case that would silently regress if
    // colourIsOn() ever read the attribute first.
    await clickColour(page)
    await clickColour(page)
    expect(await storedChoice(page)).toBe('off')

    await contrastBtn(page).click()
    await expect(page.locator('html')).toHaveAttribute(
      'data-high-contrast',
      'true'
    )
    await expect(colourBtn(page)).toHaveAttribute('aria-pressed', 'false')
    await expect.poll(() => paletteSize(page)).toBeNull()

    // And the other way: colour ON survives high contrast being turned off.
    await clickColour(page)
    await contrastBtn(page).click()
    await expect(page.locator('html')).not.toHaveAttribute(
      'data-high-contrast',
      'true'
    )
    await expect.poll(() => paletteSize(page)).toBeGreaterThanOrEqual(4)
  })

  test('a stored choice is honoured on the next visit', async ({ page }) => {
    // Seeded before the first script runs, which is what a returning player's
    // browser looks like. Reloading in-place would not do: the app restores
    // its last surface, so the second load lands on Get Started and the
    // Classic welcome card is not on the page at all.
    await page.addInitScript(() => {
      localStorage.setItem('openscad-forge-city-walk-colour', 'on')
    })
    await launchGame(page)

    await expect(colourBtn(page)).toHaveAttribute('aria-pressed', 'true')
    await expect(colourBtn(page)).toHaveAttribute(
      'aria-label',
      'Color on. Press for a single-color screen.'
    )
    await enterCity(page)
    // Colour from the stored choice alone - high contrast never touched.
    await expect(page.locator('html')).not.toHaveAttribute(
      'data-high-contrast',
      'true'
    )
    await expect.poll(() => paletteSize(page)).toBeGreaterThanOrEqual(4)
  })

  test('the help panel and the header agree about the three toggles', async ({
    page,
  }) => {
    await launchGame(page)
    await page.locator('#cityWalkHelpBtn').click()

    const help = page.locator('#cityWalkHelpPanel')
    await expect(help).toBeVisible()
    await expect(help).toContainText(
      'O: color on or off (off is a single-color retro screen)'
    )
    // CW-64 moved this line: the row's count stopped being fixed when
    // Fireworks joined it, so the sentence names the joiner and its
    // condition instead of counting.
    await expect(help).toContainText(
      'High contrast, theme and color: buttons at the top of the screen, ' +
        'with Fireworks joining them once you have found every landmark'
    )

    // And the header really is what that sentence says it is: the three
    // toggles LEAD the row, in the order the help names them.
    //
    // ★★ THE PREVIOUS VERSION OF THIS ASSERTION TIGHTENED THE SLICE TO THE
    // WHOLE ROW AND WAS WRONG ON A FACT ANYBODY COULD HAVE READ. Its reasoning
    // was sound - a sliced check cannot notice a Fireworks button that leaked
    // in early - but it was written without opening the row, which has SIX
    // children: Fireworks, Help and Exit follow the three toggles and always
    // have. It failed on both engines, which is the tell that a red is the
    // code and not the runner.
    //
    // The leak it wanted to catch is guarded where it can actually be
    // exercised: 'finishing a city plays the show, once, and leaves a button'
    // in ascii-city-walk.spec.js drives a REAL city from unfound to found and
    // asserts the button hidden before and visible after. Repeating a
    // toBeHidden() here would be vacuous - this case never enters a city, and
    // the button is created hidden, so it would pass with syncFireworksButton
    // deleted entirely.
    const ids = await page.evaluate(() =>
      Array.from(
        document.querySelectorAll('.city-walk-header-actions button')
      ).map((b) => b.id)
    )
    expect(ids.slice(0, 3)).toEqual([
      'cityWalkContrastBtn',
      'cityWalkThemeBtn',
      'cityWalkColourBtn',
    ])
  })
})

test.describe('ASCII City Walk — without WebGL', () => {
  test('says so accessibly, and Escape still leaves as promised', async ({
    page,
  }) => {
    await launchGame(page)
    test.skip(
      await webglAvailable(page),
      'This browser has WebGL, so the fallback never appears.'
    )

    await page.getByRole('button', { name: 'Seattle, Washington' }).click()

    // The promise the fallback makes must be kept: it is the only thing a
    // player without WebGL ever sees, and it tells them how to get out.
    const startError = page.locator('#cityWalkStartError')
    await expect(startError).toBeVisible()
    await expect(startError).toHaveAttribute('role', 'alert')
    await expect(startError).toContainText('3D rendering is not available')
    await expect(page.locator('#cityWalkViewport')).toBeHidden()

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .include('#cityWalkLayer')
      .analyze()
    expectOnlyAllowedViolations(results)

    await page.keyboard.press('Escape')
    await expect(page.locator('#cityWalkLayer')).toBeHidden()
  })
})

test.describe('ASCII City Walk — accessibility', () => {
  test('axe: the city picker has no violations', async ({ page }) => {
    await launchGame(page)

    // Deliberately scan WITH a hovered primary button: a hover state is
    // invisible to a scan unless something happens to be hovering (D-55),
    // and this scan is what caught the mono variant's primary-hover pair
    // measuring 1.11:1 before variant.css completed the pair.
    await page.getByRole('button', { name: 'Denver, Colorado' }).hover()

    const pickerResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .include('#cityWalkLayer')
      .analyze()
    expectOnlyAllowedViolations(pickerResults)
  })

  test('axe: the in-game layer has no violations', async ({ page }) => {
    await launchGame(page)
    await enterCity(page)
    await page.keyboard.press('KeyH') // help open exercises the panel too

    const inGameResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .include('#cityWalkLayer')
      .analyze()
    expectOnlyAllowedViolations(inGameResults)
  })
})

/**
 * CW-22: the composite paint path is now THE paint path, at every character
 * size, and it reaches the main app's Alt View as well as the game. That is
 * only allowed because it paints the same pixels the per-cell blit path did —
 * so this suite owns the proof, not a one-off bench script.
 *
 * The reference here is written out by hand rather than taken from the module,
 * so the test cannot pass by comparing the code against itself.
 */
test.describe('ASCII City Walk — composite paint parity (CW-22)', () => {
  /** charW is what used to choose the path; 4 and below was composited. */
  const SIZES = [
    { fontSizePx: 3, charW: 2, charH: 4 }, // the game's 10% floor
    { fontSizePx: 7, charW: 4, charH: 9 }, // the old gate's edge
    { fontSizePx: 10, charW: 5, charH: 12 }, // the shipped 50% default
    { fontSizePx: 12, charW: 6, charH: 15 }, // the slowest size before CW-22
    { fontSizePx: 18, charW: 9, charH: 22 }, // the game's 100%
    { fontSizePx: 25, charW: 12, charH: 30 }, // the preview slider's ceiling
  ]

  test('composited frames match per-cell blits exactly, at every size', async ({
    page,
  }) => {
    test.setTimeout(90000)
    await page.goto('/?hfm=unlock')
    await expect(page.locator('#cityWalkCard')).toBeVisible({ timeout: 30000 })

    const results = await page.evaluate(async (sizes) => {
      const { buildGlyphAtlas, paintFrame, SPACE_INDEX, GLYPH_COUNT } =
        await import('/src/js/_hfm-paint.js')
      const fontFamily = "'Iosevka Term', ui-monospace, monospace"
      const dpr = 1
      const cols = 40
      const rows = 20

      // The FIRST getImageData on a 2D canvas reads back from a GPU-backed
      // surface and can round a channel by one; the canvas is CPU-backed from
      // then on. Warm every canvas before it is measured, or this comparison
      // reports the readback rather than the painter.
      const warm = (ctx) => ctx.getImageData(0, 0, 1, 1)

      const out = []
      for (const size of sizes) {
        const { fontSizePx, charW, charH } = size
        const atlas = buildGlyphAtlas({
          fontFamily,
          fontSizePx,
          charW,
          charH,
          dpr,
          color: '#00ff00',
        })
        const w = cols * charW * dpr
        const h = rows * charH * dpr
        const glyphs = new Int16Array(cols * rows)
        for (let i = 0; i < glyphs.length; i++) {
          // A deterministic mix that includes blank cells, which the painter
          // must skip rather than paint as a space glyph.
          glyphs[i] = i % 7 === 0 ? SPACE_INDEX : (i * 37) % GLYPH_COUNT
        }

        const composited = document.createElement('canvas')
        composited.width = w
        composited.height = h
        const cctx = composited.getContext('2d')
        warm(cctx)
        paintFrame(cctx, glyphs, cols, rows, atlas, charW, charH, null, null, 0)

        // The hand-written reference: one drawImage per non-blank cell.
        const blitted = document.createElement('canvas')
        blitted.width = w
        blitted.height = h
        const bctx = blitted.getContext('2d')
        warm(bctx)
        bctx.clearRect(0, 0, w, h)
        const stepX = charW * dpr
        const stepY = charH * dpr
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const idx = glyphs[r * cols + c]
            if (idx === SPACE_INDEX) continue
            bctx.drawImage(
              atlas.canvas,
              idx * atlas.cellW,
              0,
              atlas.cellW,
              atlas.cellH,
              (c * stepX) | 0,
              (r * stepY) | 0,
              atlas.cellW,
              atlas.cellH
            )
          }
        }

        const da = cctx.getImageData(0, 0, w, h).data
        const db = bctx.getImageData(0, 0, w, h).data
        let differing = 0
        let inked = 0
        for (let i = 0; i < da.length; i += 4) {
          if (da[i + 3] !== 0) inked++
          if (
            da[i] !== db[i] ||
            da[i + 1] !== db[i + 1] ||
            da[i + 2] !== db[i + 2] ||
            da[i + 3] !== db[i + 3]
          ) {
            differing++
          }
        }

        // Prove the comparison can see a difference at all: shift one cell's
        // glyph and the same arithmetic must report a mismatch.
        const broken = document.createElement('canvas')
        broken.width = w
        broken.height = h
        const brctx = broken.getContext('2d')
        warm(brctx)
        const nudged = Int16Array.from(glyphs)
        nudged[1] = ((nudged[1] + 5) % (GLYPH_COUNT - 1)) + 1
        paintFrame(
          brctx,
          nudged,
          cols,
          rows,
          atlas,
          charW,
          charH,
          null,
          null,
          0
        )
        const dn = brctx.getImageData(0, 0, w, h).data
        let brokenDiffering = 0
        for (let i = 0; i < da.length; i += 4) {
          if (
            da[i] !== dn[i] ||
            da[i + 1] !== dn[i + 1] ||
            da[i + 2] !== dn[i + 2] ||
            da[i + 3] !== dn[i + 3]
          ) {
            brokenDiffering++
          }
        }

        out.push({
          charW,
          charH,
          totalPixels: da.length / 4,
          differing,
          inked,
          brokenDiffering,
        })
      }
      return out
    }, SIZES)

    expect(results).toHaveLength(SIZES.length)
    for (const r of results) {
      // A blank frame would compare equal while proving nothing.
      expect(r.inked, `charW ${r.charW} painted nothing`).toBeGreaterThan(0)
      expect(
        r.differing,
        `charW ${r.charW}: ${r.differing} of ${r.totalPixels} pixels differ ` +
          `between the composited frame and the per-cell blits`
      ).toBe(0)
      expect(
        r.brokenDiffering,
        `charW ${r.charW}: the comparison cannot detect a changed glyph`
      ).toBeGreaterThan(0)
    }
  })

  test('palette cells composite from their own atlas, blit for blit', async ({
    page,
  }) => {
    test.setTimeout(90000)
    await page.goto('/?hfm=unlock')
    await expect(page.locator('#cityWalkCard')).toBeVisible({ timeout: 30000 })

    const result = await page.evaluate(async () => {
      const { buildGlyphAtlas, paintFrame, SPACE_INDEX, GLYPH_COUNT } =
        await import('/src/js/_hfm-paint.js')
      const fontFamily = "'Iosevka Term', ui-monospace, monospace"
      const dpr = 1
      const charW = 6
      const charH = 15
      const cols = 30
      const rows = 16
      const palette = ['#00ff00', '#00ffff', '#ffff00', '#ff00ff', '#ffffff']
      const atlases = palette.map((color) =>
        buildGlyphAtlas({
          fontFamily,
          fontSizePx: 12,
          charW,
          charH,
          dpr,
          color,
        })
      )
      const glyphs = new Int16Array(cols * rows)
      const indices = new Int8Array(cols * rows)
      for (let i = 0; i < glyphs.length; i++) {
        glyphs[i] = i % 9 === 0 ? SPACE_INDEX : (i * 23) % GLYPH_COUNT
        indices[i] = i % palette.length
      }

      const w = cols * charW * dpr
      const h = rows * charH * dpr
      const warm = (ctx) => ctx.getImageData(0, 0, 1, 1)

      const a = document.createElement('canvas')
      a.width = w
      a.height = h
      const actx = a.getContext('2d')
      warm(actx)
      paintFrame(
        actx,
        glyphs,
        cols,
        rows,
        atlases[0],
        charW,
        charH,
        null,
        null,
        0,
        { indices, atlases }
      )

      const b = document.createElement('canvas')
      b.width = w
      b.height = h
      const bctx = b.getContext('2d')
      warm(bctx)
      bctx.clearRect(0, 0, w, h)
      const stepX = charW * dpr
      const stepY = charH * dpr
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const cell = r * cols + c
          const idx = glyphs[cell]
          if (idx === SPACE_INDEX) continue
          const src = atlases[indices[cell]] ?? atlases[0]
          bctx.drawImage(
            src.canvas,
            idx * src.cellW,
            0,
            src.cellW,
            src.cellH,
            (c * stepX) | 0,
            (r * stepY) | 0,
            src.cellW,
            src.cellH
          )
        }
      }

      const da = actx.getImageData(0, 0, w, h).data
      const db = bctx.getImageData(0, 0, w, h).data
      let differing = 0
      const hues = new Set()
      for (let i = 0; i < da.length; i += 4) {
        if (da[i + 3] !== 0) hues.add(`${da[i]},${da[i + 1]},${da[i + 2]}`)
        if (
          da[i] !== db[i] ||
          da[i + 1] !== db[i + 1] ||
          da[i + 2] !== db[i + 2] ||
          da[i + 3] !== db[i + 3]
        ) {
          differing++
        }
      }
      return { differing, totalPixels: da.length / 4, distinctHues: hues.size }
    })

    // More than one hue proves the frame really used several palette atlases.
    expect(result.distinctHues).toBeGreaterThan(1)
    expect(
      result.differing,
      `${result.differing} of ${result.totalPixels} palette pixels differ`
    ).toBe(0)
  })
})

/**
 * CW-19: the signals are the only thing in this deliberately time-frozen city
 * that moves, so they are also the only thing that can move when it should
 * not — and the only thing that can stop looking like a signal when it stops.
 */
test.describe('ASCII City Walk — traffic signals (CW-19)', () => {
  /** The colour of every signal head, as one comparable string. */
  const headColours = (page) =>
    page.evaluate(() => {
      const out = []
      window.__cityWalkGame.props.group.traverse((o) => {
        if (o.isMesh && o.name === 'light-heads') {
          out.push(o.material.color.getHexString())
        }
      })
      return out.join(',')
    })

  test('the signals cycle, and never show both directions green', async ({
    page,
  }) => {
    test.setTimeout(90000)
    await launchGame(page)
    await enterCity(page)

    const lit = await page.evaluate(
      () => window.__cityWalkGame.props.trafficLights.count
    )
    // No signals means nothing below is testing anything.
    expect(lit, 'the city grew no traffic signals').toBeGreaterThan(0)

    const first = await headColours(page)
    // Wait for the signals to CHANGE rather than for eight seconds to pass.
    // The old fixed sleep was a wall-clock gate wearing a disguise: the
    // signals are advanced by the frame loop, so sleeping asserts that the
    // runner rendered enough frames in eight seconds, which on a loaded CI
    // machine is not a fact about the signals at all. It has been the
    // flakiest case in this suite for three rounds, and it went from flaky to
    // failing outright the moment the shard around it got busier (D-78).
    let second = first
    await expect
      .poll(async () => (second = await headColours(page)), {
        message: 'the signals never changed',
        timeout: 60000,
      })
      .not.toBe(first)

    // Exactly one head lit per phase group at any moment: a signal showing two
    // colours at once, or a junction letting both directions go, is the
    // failure that matters here rather than a cosmetic one.
    for (const frame of [first, second]) {
      const heads = frame.split(',')
      const lightsOn = heads.filter((c) => c !== '2b2b2b')
      expect(
        lightsOn.length,
        `expected one lit head per phase, saw ${frame}`
      ).toBeLessThanOrEqual(2)
      // Green appears at most once across the phase groups.
      const greens = heads.filter((c) => c.startsWith('21ff'))
      expect(greens.length, `two directions green at once: ${frame}`).toBeLessThanOrEqual(1)
    }
  })

  test('reduced motion stops the cycle without killing the signals', async ({
    page,
  }) => {
    test.setTimeout(90000)
    // The defect this guards: with no initial paint the heads all sat at their
    // dark tint, so the people who asked for less movement got a city of dead
    // traffic lights instead of still ones.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await launchGame(page)
    await enterCity(page)

    const before = await headColours(page)
    await page.waitForTimeout(8000)
    const after = await headColours(page)

    expect(after, 'the signals cycled under reduced motion').toBe(before)
    expect(
      before.split(',').some((c) => c !== '2b2b2b'),
      `every head is dark under reduced motion: ${before}`
    ).toBe(true)
  })
})

/**
 * CW-20: photo mode. The picture a player sees is the overlay canvas, so a
 * photo is that canvas composed onto black — not a second render path and not
 * a screenshot of the page.
 */
test.describe('ASCII City Walk — photo mode (CW-20)', () => {
  test('P saves a PNG of the city, named for the city and the day', async ({
    page,
  }) => {
    test.setTimeout(90000)
    await launchGame(page)
    await enterCity(page)
    // Give the converter a frame to paint before photographing it.
    await page.waitForTimeout(1200)

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 20000 }),
      page.keyboard.press('KeyP'),
    ])

    expect(download.suggestedFilename()).toMatch(
      /^ascii-city-seattle-\d{4}-\d{2}-\d{2}\.png$/
    )

    // A file that exists is not the same as a file with a picture in it: an
    // empty or truncated canvas would still download happily.
    const path = await download.path()
    expect(path).toBeTruthy()
    const { readFileSync } = await import('node:fs')
    const bytes = readFileSync(path)
    expect(bytes.length).toBeGreaterThan(2000)
    expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])

    await expect(page.locator('#cityWalkAnnouncer')).toHaveText('Photo saved.')
  })

  test('the photo button is in the toolbar in both views', async ({ page }) => {
    await launchGame(page)
    await enterCity(page)
    const btn = page.locator('#cityWalkPhotoBtn')
    await expect(btn).toBeVisible()
    await expect(btn).toHaveAccessibleName('Photo')

    // The map is a view of the same city; it deserves a photo too.
    await page.keyboard.press('KeyM')
    await expect(page.locator('#cityWalkHudStatus')).toContainText('map view')
    await expect(btn).toBeVisible()
  })
})

/**
 * CW-20: a reason to wander. The HUD counts the landmarks this session has
 * walked past and the legend marks them off.
 */
test.describe('ASCII City Walk — landmark tracker (CW-20)', () => {
  test('walking to a landmark counts it and marks the legend', async ({
    page,
  }) => {
    test.setTimeout(90000)
    await launchGame(page)
    await enterCity(page)

    const hud = page.locator('#cityWalkHudStatus')
    await expect(hud).toContainText('landmarks 0/')

    // Stand on open ground near a landmark and take a real step: the count
    // rides the same movement branch a walking player uses, so teleporting
    // alone would prove nothing.
    const placed = await page.evaluate(() => {
      const g = window.__cityWalkGame
      if (!g.landmarks.length) return false
      const lm = g.landmarks[0]
      const ang = Math.atan2(lm.y - g.walkState.y, lm.x - g.walkState.x)
      g.walkState.x = lm.x - Math.cos(ang) * 45
      g.walkState.y = lm.y - Math.sin(ang) * 45
      return true
    })
    test.skip(!placed, 'this extract has no landmarks to walk to')

    await page.keyboard.down('ArrowUp')
    await page.waitForTimeout(600)
    await page.keyboard.up('ArrowUp')

    await expect(hud).not.toContainText('landmarks 0/')
    await expect(hud).toContainText(/landmarks [1-9]\d*\//)

    // The legend belongs to the map view, so that is where the marks are
    // read. It marks with real TEXT, so a screen reader and a high-contrast
    // theme both carry the information rather than a colour doing it alone.
    await page.keyboard.press('KeyM')
    await expect(hud).toContainText('map view')
    const marked = page.locator('.city-walk-legend-list li', { hasText: '✓' })
    await expect(marked.first()).toBeVisible()
    await expect(marked.first()).toContainText('visited')
  })
})

/**
 * CW-20: the weather belongs to the street.
 *
 * Seen from the overhead map the drops streak diagonally across the whole
 * picture and read as scratches on the screen rather than as rain — this was
 * caught by eye in the four-city tour, not by a test, which is why there is
 * now a test.
 */
test.describe('ASCII City Walk — rain stays in the street (CW-20)', () => {
  test('the map view has no rain in it, and the street gets it back', async ({
    page,
  }) => {
    test.setTimeout(90000)
    await launchGame(page)
    await enterCity(page)

    await page.keyboard.press('KeyG')
    await expect(page.locator('#cityWalkAnnouncer')).toContainText('Rain')
    expect(
      await page.evaluate(() => window.__cityWalkGame.rain.group.visible)
    ).toBe(true)

    await page.keyboard.press('KeyM')
    await expect(page.locator('#cityWalkHudStatus')).toContainText('map view')
    expect(
      await page.evaluate(() => window.__cityWalkGame.rain.group.visible),
      'rain is still drawn over the map'
    ).toBe(false)

    await page.keyboard.press('KeyM')
    await expect(page.locator('#cityWalkHudStatus')).toContainText('street view')
    expect(
      await page.evaluate(() => window.__cityWalkGame.rain.group.visible),
      'rain did not come back when the street did'
    ).toBe(true)
  })
})

/**
 * D-75: the thunder swell is driven frame by frame and only lands back on
 * zero when a frame arrives to bring it down. Both ways out of the rain skip
 * those frames - stopping the rain, and reduced motion turning on - so a
 * swell caught halfway through used to leave the whole city sitting under a
 * lifted ambient light until something unrelated happened to reset it.
 *
 * The swell is a third of a second long, which is not a window a test can aim
 * at by hand. These cases lengthen it (the timing object is read fresh every
 * frame) and then take the two exits deliberately, which is the honest
 * reproduction: the bug is about the exit, not about the swell's length.
 */
test.describe('ASCII City Walk — the thunder lets go (D-75)', () => {
  const ambient = (page) =>
    page.evaluate(
      () =>
        window.__cityWalkGame.scene.children.find((c) => c.isAmbientLight)
          .intensity
    )

  /** Start a swell that will still be rising in a second's time. */
  async function beginLongSwell(page) {
    await page.evaluate(() => {
      const g = window.__cityWalkGame
      g.lighting.weatherTiming.thunderMs = 60000
      g.thunderStartMs = performance.now() - g.startedAtMs
    })
    await page.waitForTimeout(900)
  }

  const rainLevel = (page) =>
    page.evaluate(() => window.__cityWalkGame.rainLevel)

  /**
   * G cycles: off -> light -> ... -> off. Read the level rather than the
   * announcer, which clears itself once it has spoken.
   */
  async function rainUntilOff(page) {
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('KeyG')
      if ((await rainLevel(page)) === null) return
    }
    throw new Error('the rain never cycled back to off')
  }

  test('rain stopping mid-swell puts the ambient light back down', async ({
    page,
  }) => {
    test.setTimeout(90000)
    await launchGame(page)
    await enterCity(page)

    const base = await ambient(page)
    await page.keyboard.press('KeyG')
    await expect(page.locator('#cityWalkAnnouncer')).toContainText('Rain')
    await beginLongSwell(page)

    const lifted = await ambient(page)
    expect(lifted, 'the swell never lifted the ambient light').toBeGreaterThan(
      base
    )

    await rainUntilOff(page)
    expect(
      await ambient(page),
      'the city stayed lit by a thunderclap that had already stopped'
    ).toBeCloseTo(base, 6)
    expect(
      await page.evaluate(() => window.__cityWalkGame.thunderStartMs),
      'a finished swell is still recorded as in progress'
    ).toBe(0)
  })

  test('reduced motion arriving mid-swell puts the ambient light back down', async ({
    page,
  }) => {
    test.setTimeout(90000)
    await launchGame(page)
    await enterCity(page)

    const base = await ambient(page)
    await page.keyboard.press('KeyG')
    await expect(page.locator('#cityWalkAnnouncer')).toContainText('Rain')
    await beginLongSwell(page)
    expect(await ambient(page)).toBeGreaterThan(base)

    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect
      .poll(() => ambient(page), {
        message: 'asking for less movement left the thunder lift on screen',
        // The media-change handler lands on a FRAME (the D-76 rain case's
        // own lesson), and CI software's frames are seconds apart.
        timeout: 60000,
      })
      .toBeCloseTo(base, 6)
  })
})

/**
 * D-76: rain is motion, and G has always refused to START it while reduced
 * motion is on. Rain that was already falling was another matter: the frames
 * that move the drops simply stopped arriving, so the shower froze in mid-air
 * as a field of static diagonal streaks - the scratches-on-the-picture look
 * CW-20 took out of the map view, arriving in the street instead - and the
 * Rain button sat on in a toolbar where it no longer did anything.
 */
test.describe('ASCII City Walk — reduced motion ends the shower (D-76)', () => {
  test('turning reduced motion on mid-rain stops the rain and says so', async ({
    page,
  }) => {
    test.setTimeout(90000)
    await launchGame(page)
    await enterCity(page)

    await page.keyboard.press('KeyG')
    await expect(page.locator('#cityWalkAnnouncer')).toContainText('Rain')
    await expect(page.locator('#cityWalkRainBtn')).toBeVisible()
    expect(
      await page.evaluate(() => window.__cityWalkGame.rain.group.visible),
      'the rain never started, so nothing below is testing anything'
    ).toBe(true)

    await page.emulateMedia({ reducedMotion: 'reduce' })

    await expect
      .poll(() => page.evaluate(() => window.__cityWalkGame.rainLevel), {
        message: 'the rain kept falling after reduced motion came on',
        // The media-change handler lands on a FRAME, and CI software's
        // frames are seconds apart - the 5 s default poll expired first.
        timeout: 60000,
      })
      .toBe(null)
    expect(
      await page.evaluate(() => window.__cityWalkGame.rain.group.visible),
      'the drops are still on screen, frozen where they stood'
    ).toBe(false)
    await expect(
      page.locator('#cityWalkRainBtn'),
      'the Rain button stayed in a toolbar where it does nothing'
    ).toBeHidden()
    await expect(page.locator('#cityWalkAnnouncer')).toContainText(
      'Rain is off because reduced motion is on.'
    )
  })

  test('a shower ended this way hands back a clear night, not a murky one', async ({
    page,
  }) => {
    test.setTimeout(90000)
    await launchGame(page)
    await enterCity(page)

    await page.keyboard.press('KeyG')
    await expect(page.locator('#cityWalkAnnouncer')).toContainText('Rain')
    // Drive the fog to its murky end so there is something to hand back.
    const murky = await page.evaluate(() => {
      const g = window.__cityWalkGame
      g.lighting.setFogDensity(1)
      return g.lighting.getFogFar()
    })
    const clear = await page.evaluate(
      () => window.__cityWalkGame.lighting.weatherTiming.fogFarClear
    )
    expect(murky).toBeLessThan(clear)

    await page.emulateMedia({ reducedMotion: 'reduce' })

    await expect
      .poll(() => page.evaluate(() => window.__cityWalkGame.lighting.getFogFar()), {
        message: 'the murk outlived the rain that brought it',
        timeout: 60000,
      })
      .toBeCloseTo(clear, 6)
  })
})

/**
 * CW-26: the cities carry building:part volumes and pitched roofs, and both
 * have to survive all the way into the rendered scene — not merely into the
 * parsed model.
 */
test.describe('ASCII City Walk — real silhouettes (CW-26)', () => {
  test('a part-mapped tower is drawn as its parts, not as one box', async ({
    page,
  }) => {
    test.setTimeout(90000)
    await launchGame(page)
    await enterCity(page)

    const shape = await page.evaluate(() => {
      const g = window.__cityWalkGame
      const hosts = g.model.buildings.filter((b) => b.parts?.length > 0)
      const best = hosts.sort((a, b) => b.parts.length - a.parts.length)[0]
      if (!best) return null
      const heights = best.parts
        .map((p) => p.heightM)
        .sort((a, b) => b - a)
      return {
        hostCount: hosts.length,
        parts: best.parts.length,
        partsAreMass: best.partsAreMass,
        tallest: heights[0],
        shortest: heights[heights.length - 1],
        outline: best.heightM,
      }
    })

    expect(shape, 'Seattle carries no building:part volumes').not.toBeNull()
    // The bake keeps them and the parser files them under their outline.
    expect(shape.hostCount).toBeGreaterThan(20)
    expect(shape.parts).toBeGreaterThan(1)
    // This tower's parts cover it, so they ARE its mass and the plain
    // outline box stands down.
    expect(shape.partsAreMass).toBe(true)
    // A stepped tower: the parts are not all one height, which is the whole
    // reason for shipping them.
    expect(shape.tallest - shape.shortest).toBeGreaterThan(10)
  })

  test('a pitched roof caps its building instead of sitting on top', async ({
    page,
  }) => {
    test.setTimeout(90000)
    await launchGame(page)
    await enterCity(page, 'Burnaby, British Columbia')

    const roof = await page.evaluate(() => {
      const g = window.__cityWalkGame
      const target = g.model.buildings.find(
        (b) => b.roof && b.roof.shape === 'pyramidal'
      )
      if (!target) return null
      const xs = target.outer.map((p) => p[0])
      const ys = target.outer.map((p) => p[1])
      const cx = xs.reduce((a, c) => a + c, 0) / xs.length
      const cy = ys.reduce((a, c) => a + c, 0) / ys.length
      // CW-79: the building stands on its centroid's ground now.
      const groundZ = g.surface?.terrain
        ? g.surface.terrain.heightAt(cx, cy)
        : 0
      const apexZ = target.heightM + groundZ

      let apexVerts = 0
      let above = 0
      let aboveEaves = 0
      g.scene.traverse((o) => {
        if (!o.isMesh || !o.geometry?.getAttribute) return
        // ★ THE BUILDINGS, AND ONLY THE BUILDINGS. This case asks whether a
        // pitched roof CAPS its body or is stacked on a full-height box -
        // a question about one mesh - and it used to answer it by sweeping
        // every mesh in the city within 12 m. CW-77 nearly doubled Burnaby's
        // lamps (531 -> 929) and put a crow on a lamp head 6.8 m from this
        // house, at z 6.32 against the house's 6.00 m apex: 72 vertices
        // "drawn above the roof apex", none of them the roof's. Measured, the
        // `buildings` mesh's own maximum inside the radius is EXACTLY 6.00.
        // A guard that a bird can fail is not measuring a roof.
        if (o.name !== 'buildings') return
        const pos = o.geometry.getAttribute('position')
        if (!pos) return
        // CW-79: the sweep is scoped to THIS building's own footprint (a
        // ray-cast against its outer ring, with a 0.3 m margin). The 12 m
        // disc was tight enough on flat ground once the birds were
        // excluded, but the hills put a NEIGHBOUR's ground a metre higher,
        // and four of its wall vertices rose above this house's apex - the
        // CW-77 bird lesson again, wearing a hill: a guard a neighbour can
        // fail is not measuring a roof.
        const inFootprint = (x, y) => {
          let inside = false
          const ring = target.outer
          for (let a2 = 0, b2 = ring.length - 1; a2 < ring.length; b2 = a2++) {
            const [xa, ya] = ring[a2]
            const [xb, yb] = ring[b2]
            if (
              ya > y !== yb > y &&
              x < ((xb - xa) * (y - ya)) / (yb - ya) + xa
            ) {
              inside = !inside
            }
          }
          return inside
        }
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i)
          const y = pos.getY(i)
          const z = pos.getZ(i)
          if (Math.hypot(x - cx, y - cy) > 12) continue
          if (!inFootprint(x, y)) continue
          if (z > apexZ + 0.05) above++
          // The same sweep with the bar lowered to the eaves. If this is 0
          // the sweep is looking at nothing and the line above is vacuous.
          if (z > apexZ - target.roof.heightM + 0.05) aboveEaves++
          if (Math.hypot(x - cx, y - cy) < 1.5 && Math.abs(z - apexZ) < 0.05) {
            apexVerts++
          }
        }
      })
      return {
        apexZ,
        apexVerts,
        above,
        aboveEaves,
        roofM: target.roof.heightM,
      }
    })

    expect(roof, 'Burnaby grew no pyramidal roof').not.toBeNull()
    // Vertices meet at a point directly over the footprint, at exactly the
    // height the building is tagged with.
    expect(roof.apexVerts).toBeGreaterThan(0)
    // The roof CAPS the body rather than being stacked on a full-height box:
    // no part of the BUILDING pokes above the tagged height. Proved able to
    // fail: drop the threshold by the roof's own height and the same sweep
    // counts 8 vertices, so the building's geometry is genuinely in view.
    expect(roof.above, 'the building is drawn above its own apex').toBe(0)
    expect(
      roof.aboveEaves,
      'the sweep cannot see the building at all'
    ).toBeGreaterThan(0)
    expect(roof.roofM).toBeGreaterThan(0)
  })
})

/**
 * CW-27: the HUD knows where you are, and X says it out loud.
 */
test.describe('ASCII City Walk — where you are (CW-27)', () => {
  // Walk one real step so the street lookup, which runs on movement frames,
  // has actually run. Teleporting alone never moves the camera or the HUD.
  const stepOnce = async (page) => {
    await page.keyboard.down('ArrowUp')
    await page.waitForTimeout(220)
    await page.keyboard.up('ArrowUp')
    await page.waitForTimeout(260)
  }

  const standOn = async (page, name) =>
    page.evaluate((want) => {
      const g = window.__cityWalkGame
      for (const road of g.model.roads) {
        if (road.name !== want || road.points.length < 2) continue
        const [x, y] = road.points[Math.floor(road.points.length / 2)]
        g.walkState.x = x
        g.walkState.y = y
        return true
      }
      return false
    }, name)

  test('the HUD names the street, and names a different one after moving', async ({
    page,
  }) => {
    test.setTimeout(90000)
    await launchGame(page)
    await enterCity(page)

    const two = await page.evaluate(() => {
      const named = window.__cityWalkGame.model.roads
        .filter((r) => r.name && r.points.length > 2 && r.kind !== 'cycleway')
        .map((r) => r.name)
      return [...new Set(named)].slice(0, 40)
    })
    expect(two.length).toBeGreaterThan(1)

    const hud = page.locator('#cityWalkHudStatus')
    const seen = []
    for (const name of two) {
      if (!(await standOn(page, name))) continue
      await stepOnce(page)
      const text = await hud.textContent()
      const match = text.match(/ · (?:on|near) ([^·]+?) · /)
      if (match) seen.push(match[1].trim())
      if (seen.length >= 2 && seen[0] !== seen[seen.length - 1]) break
    }

    // The clause appears at all...
    expect(seen.length, 'the HUD never showed a street clause').toBeGreaterThan(
      0
    )
    // ...and it FOLLOWS the player rather than sticking to the first answer.
    expect(
      new Set(seen).size,
      `the street clause never changed: ${JSON.stringify(seen)}`
    ).toBeGreaterThan(1)
  })

  test('never claims a street when there is none nearby', async ({ page }) => {
    test.setTimeout(90000)
    await launchGame(page)
    await enterCity(page)

    // Far outside the extract there is no named way within the honesty
    // radius, and the HUD must say nothing rather than name the last one.
    await page.evaluate(() => {
      const g = window.__cityWalkGame
      g.walkState.x = 9000
      g.walkState.y = 9000
    })
    await stepOnce(page)
    const text = await page.locator('#cityWalkHudStatus').textContent()
    expect(text).not.toMatch(/ · (?:on|near) /)
  })

  test('X says where you are, once, through the in-layer announcer', async ({
    page,
  }) => {
    test.setTimeout(90000)
    await launchGame(page)
    await enterCity(page)
    await stepOnce(page)

    const announcer = page.locator('#cityWalkAnnouncer')
    // Count how many times the live region is written, not just its value:
    // two announcements per press would be read out twice.
    await page.evaluate(() => {
      window.__cw27Writes = 0
      const el = document.querySelector('#cityWalkAnnouncer')
      // announceInLayer deliberately clears the region and sets it again on
      // the next frame, so a screen reader re-reads identical text. That is
      // TWO mutations for ONE announcement - count only the ones that put
      // words in, or this asserts the implementation instead of the promise.
      new MutationObserver(() => {
        if ((el.textContent ?? '').trim() !== '') window.__cw27Writes++
      }).observe(el, { childList: true, characterData: true, subtree: true })
    })

    await page.keyboard.press('x')
    /**
     * ★★ CW-65 CHANGED THE SHAPE OF THIS SENTENCE AND THIS PIN CAUGHT IT - on
     * BOTH engines, which is the tell that a red is the code and not the
     * runner. The where-sentence now carries an appended warmer/colder clause
     * while the traveler is unfound, so an anchored `$` after "facing north."
     * could no longer match.
     *
     * The fix is NOT to drop the anchor. What this case guards is that the
     * where-sentence is WHOLE and well formed, so it still requires exactly
     * that, and allows AT MOST one further sentence after it - which is the
     * composition CW-65 promises ("appended to whichever clause is true, never
     * substituted for it"). A player must never lose the street name to the
     * hint, and this is where that is enforced.
     */
    await expect(announcer).toHaveText(
      /^You are .*, facing [a-z]+\.(?: [A-Z][^.]*\.)?$/
    )
    const said = await announcer.textContent()
    await page.waitForTimeout(400)
    expect(await page.evaluate(() => window.__cw27Writes)).toBe(1)

    // The sentence is a real one: no empty clause, no dangling comma.
    expect(said).not.toMatch(/,\s*,/)
    expect(said).not.toMatch(/\bnear\s*,/)
    expect(said).not.toMatch(/\bon\s*,/)
  })

  test('the toolbar carries the same question for a mouse-only player', async ({
    page,
  }) => {
    test.setTimeout(90000)
    await launchGame(page)
    await enterCity(page)
    await stepOnce(page)

    const btn = page.locator('#cityWalkWhereBtn')
    await expect(btn).toBeVisible()
    // The CW-15 promise: every key also has a button, and the button says
    // which key it is.
    await expect(btn).toHaveAttribute('title', /X/)
    await btn.click()
    // Same shape as the X case above, and the same reason (CW-65's clause).
    await expect(page.locator('#cityWalkAnnouncer')).toHaveText(
      /^You are .*, facing [a-z]+\.(?: [A-Z][^.]*\.)?$/
    )
  })

  test('the HUD stays one line at 1280 with the longest real names (D-71)', async ({
    page,
  }) => {
    test.setTimeout(90000)
    await page.setViewportSize({ width: 1280, height: 800 })
    await launchGame(page)
    await enterCity(page, 'Denver, Colorado')
    await stepOnce(page)

    // Denver carries the longest landmark name in the four extracts, and it
    // wrapped this line to two lines before CW-27 shortened both names.
    await page.evaluate(() => {
      const g = window.__cityWalkGame
      g.nearLandmark = g.landmarks.reduce((a, b) =>
        b.name.length > a.name.length ? b : a
      ).name
    })
    await stepOnce(page)

    const box = await page.locator('#cityWalkHudStatus').evaluate((el) => {
      const lineH = parseFloat(getComputedStyle(el).lineHeight || '20')
      return {
        lines: Math.round(el.getBoundingClientRect().height / lineH),
        text: el.textContent,
      }
    })
    expect(box.lines, `HUD wrapped: ${box.text}`).toBe(1)
  })
})

test.describe('ASCII City Walk — people are people (CW-45)', () => {
  test('the Seattle census is exact, varied, and deterministic', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)

    // Hash-seeded placement against a versioned extract: these numbers are
    // facts until the next rebake, never noise. The mix ratios are the
    // CW-45 record's one-line-reversible choices.
    //
    // CW-50 re-pinned them. Widening the roads moved every pavement position
    // outward, and thirty-one of the old spots landed against a building and
    // were refused: 3,060 became 3,029. The seed did not change and nothing
    // reshuffled - sitters are still exactly 105, because a sitter is placed
    // on a mapped bench at its true position rather than at an offset from a
    // road centreline, so no width could reach them. Standing is unmoved
    // between the two width passes for the same reason it moved at all: it
    // is the offsets, not the seed, that decide.
    //
    // CW-75 re-pinned them a second time, and for the same KIND of reason.
    // A person is placed 1.1 m outside THEIR road's kerb, which at a junction
    // is the middle of the road that crosses it: 141 figures stood on tarmac
    // with no crossing mapped near them, and they are now refused. 3,029
    // became 2,890, the refusals fall across all four poses, and sitters move
    // for the first time (105 -> 102): FOURTEEN of Seattle's 280 mapped
    // benches stand inside a drawn roadway, and three of them had been given
    // a sitter. The bench stays where the map put it - CW-43 never invents or
    // moves mapped furniture - and the sitter this build invents for it does
    // not get to sit on tarmac. The seed still did not change: 2,890 is
    // exactly what the shipped census reports for Seattle
    // (scripts/census-city-walk.mjs), and the four poses sum to it.
    //
    // CW-76 re-pinned them a THIRD time, and this one is not a placement
    // change at all: it is the collision grid. 42 of Seattle's canopies stop
    // blocking their footprint (a `building=roof` is a slab overhead now, not
    // a solid from the pavement) and one volume that used to hang in the air
    // is drawn down to the street and starts blocking. 43 of 1,421 buildings
    // changed their collision base, and PROVING that is the whole cause: the
    // new model run against the OLD collision bases reproduces 2,890 and this
    // exact pose table to the person. So 2,890 becomes 2,895, and the five
    // are people standing where a canopy used to be a wall.
    //
    // ★★★ CW-77 RE-PINNED THEM A FOURTH TIME, AND THE RELEASE THAT DID IT
    // WAS ABOUT LAMPS. `LAMP_ROAD_KINDS` in city-scene.js is a set named for
    // one thing that gates two: `lampRng` AND `peopleRng`. CW-77 added
    // `pedestrian` to it so that Post Alley would be lit - and Post Alley
    // got its crowd in the same line. A four-cell run of the builders
    // separates the three causes to the person:
    //
    //   pre-CW-77 code, pre-CW-77 extracts                    2895 <- the pin
    //   CW-77 code, pedestrian NOT in the set, old extracts   2885
    //   CW-77 code, pedestrian NOT in the set, new extracts   2652
    //   CW-77 code as shipped, new extracts                   2999
    //
    // so: -10 people stand too close to the denser procedural poles, -233
    // stand where City Light's surveyed register puts a real pole, and +347
    // are the pedestrian streets that had nobody on them until this release.
    // The seed law still holds - each road's people stream is its own - and
    // a pedestrian street with lamps and no people would have been the
    // stranger city. But the crowd arrived through a set named for lamps,
    // which is worth a reader's minute: if you change what LAMP_ROAD_KINDS
    // holds, you are changing the population.
    // ★★ CW-95 RE-PINNED THEM A FIFTH TIME, by exactly the four people the
    // release freed. Platform, corridor and construction ways stopped being
    // roadways, so Seattle's in-road refusals fell 167 -> 163 - and all
    // four of the freed spots planted: one sitter (a streetcar-platform
    // bench), two standing, one jogging. Walking did not move. 2,999
    // becomes 3,003, and the probe that measured the refusal delta
    // (167 - 163 = 4) and this census delta (+4) agree to the person.
    const stats = await page.evaluate(() => window.__cityWalkGame.props.stats)
    expect(stats.figuresByPose).toEqual({
      sitting: 102,
      standing: 730,
      walking: 1824,
      jogging: 347,
    })
    expect(
      await page.evaluate(() => window.__cityWalkGame.props.peopleCount)
    ).toBe(3003)

    /**
     * ★★ CW-65 ADDS A PERSON TO THE WORLD AND NOT TO THIS CENSUS, AND THAT IS
     * A DECISION RATHER THAN AN OVERSIGHT.
     *
     * The traveler is built STANDALONE, beside the fireworks, because the city
     * group is built before the saved progress is read and because finding
     * them MOVES them. So they never pass through buildStreetProps and
     * peopleCount - which counts what the CITY BUILD planted - does not gain
     * the traveler, whatever the pin above happens to read. (It read 3,029
     * when this was written; five re-pins later it reads 3,003, and not one
     * of the five was the traveler.)
     *
     * Asserted rather than assumed, both halves: the crowd did not gain
     * anybody, and the traveler exists all the same. A silent +1 here would
     * mean the traveler had been planted into a road's rng stream, which would
     * shift the pose and build of every figure planted after them (the
     * CW-45/46 seed law) - so this pin is also how that mistake would surface.
     */
    expect(
      await page.evaluate(() =>
        Boolean(window.__cityWalkGame.traveler?.isPlaced())
      )
    ).toBe(true)
  })

  test('sitting happens only where a real bench stands', async ({ page }) => {
    await launchGame(page)
    await enterCity(page)

    const check = await page.evaluate(() => {
      const g = window.__cityWalkGame
      const benches = g.model.furniture.filter((f) => f.kind === 'bench')
      const sitters = g.props.figureSpots.filter((f) => f.pose === 'sitting')
      let orphans = 0
      for (const s of sitters) {
        const seated = benches.some(
          (b) => Math.hypot(b.x - s.x, b.y - s.y) < 1.5
        )
        if (!seated) orphans++
      }
      return { sitters: sitters.length, benches: benches.length, orphans }
    })
    // Never a scattered seat: every sitter is on a mapped bench, and there
    // are fewer sitters than benches (at most one each, hash-decided).
    expect(check.orphans).toBe(0)
    expect(check.sitters).toBeGreaterThan(0)
    expect(check.sitters).toBeLessThanOrEqual(check.benches)
  })

  test('every zone of a figure carries a scheme colour (CW-49)', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)

    // Read the tints the scene actually painted, not the pixels they end up
    // as. A pixel test was tried first and could not tell a scheme hue from a
    // monochrome phosphor - both are far from grey - and a sample box wide
    // enough to cover a head also caught its coloured neighbours, so it
    // passed on the release base. The vertex colours have no such ambiguity.
    const tints = await page.evaluate(() => {
      const g = window.__cityWalkGame
      let mesh = null
      g.props.group.traverse((o) => {
        if (o.isMesh && o.name === 'people') mesh = o
      })
      if (!mesh) return null
      const col = mesh.geometry.getAttribute('color')
      let neutral = 0
      const distinct = new Set()
      for (let i = 0; i < col.count; i++) {
        const r = col.getX(i)
        const gg = col.getY(i)
        const b = col.getZ(i)
        // The one flat tone heads used to wear, to six decimals.
        if (
          Math.abs(r - gg) < 1e-6 &&
          Math.abs(gg - b) < 1e-6 &&
          Math.abs(r - 0.82) < 1e-6
        )
          neutral++
        distinct.add(`${r.toFixed(3)},${gg.toFixed(3)},${b.toFixed(3)}`)
      }
      return {
        vertices: col.count,
        neutral,
        pctNeutral: (100 * neutral) / col.count,
        distinct: distinct.size,
      }
    })
    expect(tints, 'the merged people mesh was not found').not.toBeNull()

    // Head and shoulders were 18.1% of this mesh when they were one flat
    // tone; with every zone hued, the only neutral geometry left in it is the
    // dogs, at 0.95%. Measured both ways on this extract.
    expect(
      tints.pctNeutral,
      `${tints.neutral} of ${tints.vertices} vertices are the flat tone`
    ).toBeLessThan(3)

    // The control, in the same reading: some neutral geometry SURVIVES. If
    // this ever reaches zero the colour attribute is not being read at all,
    // and the assertion above would pass for the wrong reason.
    expect(tints.neutral, 'no neutral geometry at all').toBeGreaterThan(0)
    expect(tints.distinct).toBeGreaterThan(34)
  })
})

test.describe('ASCII City Walk — cars are cars (CW-46)', () => {
  test('the parked classes stamp their own true footprints', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)

    const check = await page.evaluate(() => {
      const cars = window.__cityWalkGame.props.obstacles.filter(
        (o) => o.halfLengthM > 1.5
      )
      const halves = {}
      for (const c of cars) {
        const key = (Math.round(c.halfLengthM * 100) / 100).toFixed(2)
        halves[key] = (halves[key] ?? 0) + 1
      }
      return { total: cars.length, halves }
    })
    // The six signed classes and nothing else: 5.8/5.0/4.6/4.9/4.4/5.2 m.
    expect(Object.keys(check.halves).sort()).toEqual([
      '2.20',
      '2.30',
      '2.45',
      '2.50',
      '2.60',
      '2.90',
    ])
    // Pickups are COMMON (the US mix), not a garnish.
    expect(check.halves['2.90']).toBeGreaterThan(check.total * 0.1)
  })

  test('a pickup is solid at its full bed length', async ({ page }) => {
    test.setTimeout(150_000)
    await launchGame(page)
    await enterCity(page)

    // Stand off the pickup's TAIL - the part the old 4.4 m footprint did
    // not cover - facing it, and watch the approach in the pickup's OWN
    // frame per frame, exactly the parked-car pattern above: an end-state
    // distance check is not slide-proof (CI's dt-clamped frames cover ~6x
    // the ground of a live GPU's, slid around the corner and away, and
    // went red on two browsers - this watcher replaced it).
    const setup = await page.evaluate(() => {
      const game = window.__cityWalkGame
      const pickups = game.props.obstacles.filter(
        (o) => Math.abs(o.halfLengthM - 2.9) < 1e-6
      )
      for (const car of pickups) {
        const ux = Math.cos(car.rotationRad)
        const uy = Math.sin(car.rotationRad)
        for (const dir of [-1, 1]) {
          const sx = car.x + ux * (car.halfLengthM + 2.5) * dir
          const sy = car.y + uy * (car.halfLengthM + 2.5) * dir
          if (game.collision.isBlocked(sx, sy)) continue
          const w = game.walkState
          w.x = sx
          w.y = sy
          w.headingRad = Math.atan2(car.x - sx, car.y - sy)
          w.pitchRad = 0

          // lx runs along the pickup (the axis we approach on), ly across.
          const startEnd = Math.sign(
            (sx - car.x) * ux + (sy - car.y) * uy
          )
          window.__cwPickup = { frames: 0, walked: 0, closest: 99, crossings: 0 }
          let px = sx
          let py = sy
          const tick = () => {
            const p = game.walkState
            const watch = window.__cwPickup
            watch.frames++
            watch.walked += Math.hypot(p.x - px, p.y - py)
            px = p.x
            py = p.y
            const dx = p.x - car.x
            const dy = p.y - car.y
            const lx = dx * ux + dy * uy
            const ly = -dx * uy + dy * ux
            if (Math.abs(ly) <= car.halfWidthM) {
              watch.closest = Math.min(watch.closest, Math.abs(lx))
              if (Math.sign(lx) !== startEnd) watch.crossings++
            }
            window.__cwPickupTick = requestAnimationFrame(tick)
          }
          window.__cwPickupTick = requestAnimationFrame(tick)
          return { halfLengthM: car.halfLengthM }
        }
      }
      return null
    })
    expect(setup).not.toBeNull()

    await page.keyboard.down('ArrowUp')
    try {
      // Arrival is a CONDITION, not a frame quota. A dt-clamped software
      // runner covers the 2.5 m in ~17 frames where a 60 fps GPU needs
      // ~100, and the slowest Edge runner painted 130 frames in 90 s - a
      // fixed frames-versus-clock gate starves there while proving nothing
      // the arrival itself does not.
      await expect
        .poll(() => page.evaluate(() => window.__cwPickup.closest), {
          timeout: 180_000,
        })
        .toBeLessThan(setup.halfLengthM + 1.0)
      // Then keep pushing on the tail for 40 more OBSERVED frames - the
      // old 4.4 m footprint lets the walker into the bed within a handful,
      // which the watcher records as closest dipping under the tail plane.
      // (CW-97 batch 3: 40 frames at CI software's measured ~2 s/frame is
      // 80 s - the old 60 s bound starved a frame-gated wait.)
      const arrived = await page.evaluate(() => window.__cwPickup.frames)
      await expect
        .poll(() => page.evaluate(() => window.__cwPickup.frames), {
          timeout: 180_000,
        })
        .toBeGreaterThan(arrived + 40)
    } finally {
      await page.keyboard.up('ArrowUp')
      await page.evaluate(() => cancelAnimationFrame(window.__cwPickupTick))
    }

    const watch = await page.evaluate(() => window.__cwPickup)
    // The walk genuinely moved, came close to the tail while aligned with
    // the bed, and NEVER crossed the tail plane - through-the-bed is the
    // only way to flip ends while inside the pickup's width.
    expect(watch.walked).toBeGreaterThan(1)
    expect(watch.closest).toBeLessThan(setup.halfLengthM + 1.2)
    expect(watch.closest).toBeGreaterThan(setup.halfLengthM - 0.05)
    expect(watch.crossings).toBe(0)
  })
})

/**
 * CW-50: the streets are true to scale and the kerb is a real step. The eye
 * has to follow the ground under it, and the kerb must never be an obstacle.
 */
test.describe('ASCII City Walk — the kerb (CW-50)', () => {
  test('the eye follows the ground across a kerb, and the kerb never blocks', async ({
    page,
  }) => {
    // CW-97 batch 3: the crossing runs ~5-8 m at CI software's ~0.23 m/s
    // and the entry itself costs tens of seconds there - the budget and
    // the poll bound below both follow that measured pace.
    test.setTimeout(300000)
    await launchGame(page)
    await enterCity(page)

    // Stand in the middle of a real roadway, square on to its kerb, with a
    // clear run at it. Anything else measures a wall rather than a kerb.
    const setup = await page.evaluate(() => {
      const g = window.__cityWalkGame
      for (const road of g.model.roads) {
        if (road.sidewalk || road.kind !== 'residential') continue
        for (let i = 0; i < road.points.length - 1; i++) {
          const [x1, y1] = road.points[i]
          const [x2, y2] = road.points[i + 1]
          const mx = (x1 + x2) / 2
          const my = (y1 + y2) / 2
          // Face square across the roadway.
          const across = Math.atan2(x2 - x1, y2 - y1) + Math.PI / 2
          const sin = Math.sin(across)
          const cos = Math.cos(across)
          // Everything here is decided from the ROAD's own geometry, never
          // from the surface grid, so this setup runs identically on the
          // release base where no such grid exists. That is what lets the
          // case fail on base for the right reason - a camera that never
          // moved - instead of on a missing property.
          //
          // The midpoint of a segment is roadway by definition; pavement
          // begins past half its width. The run across has to be open, or
          // this measures a wall rather than a kerb.
          const needM = road.widthM / 2 + 2.5
          let blocked = false
          for (let d = 0; d <= needM + 2; d += 0.25) {
            if (g.collision.isBlocked(mx + sin * d, my + cos * d))
              blocked = true
          }
          if (blocked) continue
          const s = g.walkState
          s.x = mx
          s.y = my
          s.headingRad = ((across % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
          s.pitchRad = 0
          // The surface grid is the thing under test, so it is READ here for
          // the record but never used to choose the spot.
          if (g.surface) s.groundZ = g.surface.heightAt(mx, my)
          g.altView.invalidate()
          return {
            x: mx,
            y: my,
            needM,
            startGroundZ: s.groundZ ?? null,
            // CW-79: the roadway question BY NAME - under terrain the
            // roadway's absolute height is the hill's, not a negative.
            startsOnPavement: g.surface?.isPavement
              ? g.surface.isPavement(mx, my)
              : null,
          }
        }
      }
      return null
    })
    // A skip here would be a pass that measured nothing, so it says loudly
    // what it could not find rather than going quietly green.
    expect(
      setup,
      'no residential roadway in Seattle had an open run to a kerb'
    ).not.toBeNull()


    // Watch from inside the page: the eye height every frame, and whether the
    // walker ever stopped moving. A kerb that blocks looks exactly like a
    // stall, and only a per-frame watcher can tell them apart.
    await page.evaluate(() => {
      const g = window.__cityWalkGame
      const s = {
        camZ: [],
        stalls: 0,
        started: false,
        px: g.walkState.x,
        py: g.walkState.y,
      }
      window.__cwKerb = s
      const tick = () => {
        if (s.stop) return
        const moved = Math.hypot(g.walkState.x - s.px, g.walkState.y - s.py)
        if (moved > 0) s.started = true
        // A frame BEFORE the walk begins is not a stall. This watcher is
        // installed a full round trip before the keypress, and on a slow
        // runner that gap is one or more frames - which is what made this
        // case red in CI on Chromium and Edge while it stayed green on a
        // fast machine and on Firefox. MEASURED: inserting a 300 ms wait
        // between the two here counts five of them. What the case is
        // actually about is a walker who was MOVING and then stopped, which
        // is the only thing a kerb that blocks could look like.
        else if (s.started) s.stalls++
        s.px = g.walkState.x
        s.py = g.walkState.y
        s.camZ.push(g.fpCamera.position.z)
        window.__cwKerbTick = requestAnimationFrame(tick)
      }
      window.__cwKerbTick = requestAnimationFrame(tick)
    })

    await page.keyboard.down('ArrowUp')
    try {
      // Arrival is a CONDITION, not a frame quota: the walker is done when
      // they have crossed clear of the roadway, however many frames that took
      // on this runner. Measured as DISTANCE from the start, which is a fact
      // about the walk rather than about the surface grid - so this waits the
      // same way on the release base, and the case reaches its assertions
      // there instead of dying early on a property that does not exist.
      await expect
        .poll(
          () =>
            page.evaluate(
              (start) => {
                const w = window.__cityWalkGame.walkState
                return Math.hypot(w.x - start.x, w.y - start.y)
              },
              { x: setup.x, y: setup.y }
            ),
          { timeout: 180_000 }
        )
        .toBeGreaterThan(setup.needM)
      // Then a few more observed frames, so the climb finishes on screen.
      // (CW-97 batch 4: twelve frames at CI software's ~2 s/frame is only
      // 24 samples inside the old 30 s - measured exactly there.)
      const from = await page.evaluate(() => window.__cwKerb.camZ.length)
      await expect
        .poll(() => page.evaluate(() => window.__cwKerb.camZ.length), {
          timeout: 120_000,
        })
        .toBeGreaterThan(from + 12)
    } finally {
      // The watcher stops BEFORE the key is let go, never after. Releasing
      // first leaves a full round trip in which the walker is standing still
      // because nothing is asking it to move, and every frame of that gap was
      // being counted as a stall. MEASURED under a 6x CPU throttle: twelve of
      // them with the release first, none with the stop first, and the same
      // at 10x. On a fast machine the gap is under one frame, which is why
      // this was green locally and on Firefox and red on CI's Chromium and
      // Edge.
      await page.evaluate(() => {
        window.__cwKerb.stop = true
        cancelAnimationFrame(window.__cwKerbTick)
      })
      await page.keyboard.up('ArrowUp')
    }

    const watch = await page.evaluate(() => window.__cwKerb)
    const lo = Math.min(...watch.camZ)
    const hi = Math.max(...watch.camZ)

    // It climbed a whole kerb, and the climb showed on the camera. This is
    // the assertion the release base fails: there the eye is a constant
    // 1.7 m whatever it is standing on, so lo and hi are the same number.
    expect(hi - lo, `camera rose from ${lo} to ${hi}`).toBeGreaterThan(0.1)
    // It never stopped: a kerb is drawn and felt, but it is not an obstacle.
    // This is the directive's non-negotiable half.
    //
    // The stall count only means anything once the walk has begun, so the
    // fact that it began is asserted first - a walker who never moved would
    // otherwise report zero stalls and pass while measuring nothing.
    expect(watch.started, 'the walker never moved at all').toBe(true)
    expect(watch.stalls).toBe(0)
    // And it EASED rather than jumping. A single frame carrying the whole
    // kerb is the step-jolt this release exists to avoid.
    let worstJump = 0
    for (let i = 1; i < watch.camZ.length; i++) {
      worstJump = Math.max(worstJump, Math.abs(watch.camZ[i] - watch.camZ[i - 1]))
    }
    expect(worstJump, `biggest single-frame rise ${worstJump}`).toBeLessThan(
      hi - lo
    )
    // And the walk really did start down in the roadway rather than already
    // up on a pavement, which is what makes the climb above a kerb.
    // CW-79: asked by name - the old 'groundZ < 0' read the kerb cut off an
    // absolute height, and the hills put the roadway at +79 m here.
    expect(setup.startsOnPavement).toBe(false)
  })
})

/**
 * CW-52: the owner's report is that lit surfaces flash while you move -
 * "distracting, unintended sloppy... fractured flashes" that a screenshot
 * cannot show. The cause was not brightness. A second, tiny render tells the
 * converter what each character cell is LOOKING AT, and that answer picks the
 * cell's glyph vocabulary; it dressed every mesh in a flat id material that
 * dropped the mesh's polygon offset, so surfaces that are deliberately
 * coplanar - a storefront strip on its wall - were coplanar again in the id
 * buffer and their winner was re-rolled by any view change at all.
 *
 * A cell that changes class ONCE has swept across an edge. A cell that changes
 * again and again over a series of sub-cell turns is watching two surfaces
 * fight, and only the second is a defect - which is why this counts repeats
 * rather than changes.
 */
test.describe('ASCII City Walk — the surface map holds still (CW-52, D-110)', () => {
  test('the storefront strip and the wall behind it stop trading places', async ({
    page,
  }) => {
    test.skip(!(await webglAvailable(page)), 'no WebGL on this machine')
    await launchGame(page)
    await enterCity(page)

    const result = await page.evaluate((ids) => {
      const g = window.__cityWalkGame
      const stats = g.altView.getConvertStats()
      const cols = stats.cols
      const rows = stats.rows
      if (!(cols > 0 && rows > 0)) return { cells: 0 }
      const s = g.walkState
      const eyeZ = 1.7 + (Number.isFinite(s.groundZ) ? s.groundZ : 0)
      const aim = (heading) => {
        g.fpCamera.position.set(s.x, s.y, eyeZ)
        g.fpCamera.lookAt(
          s.x + Math.sin(heading),
          s.y + Math.cos(heading),
          eyeZ
        )
      }
      const cells = cols * rows
      const pairs = new Map()
      let prev = null
      let transitions = 0
      const STEPS = 8
      for (let i = 0; i < STEPS; i++) {
        // A twentieth of a degree: about one screen pixel, well inside a
        // single character cell at any size the game offers.
        aim(s.headingRad + (i * 0.05 * Math.PI) / 180)
        const map = g.classPass.read(g.fpCamera, cols, rows)
        if (!map || map.length !== cells) return { cells: 0 }
        if (prev) {
          for (let c = 0; c < cells; c++) {
            if (map[c] === prev[c]) continue
            transitions++
            const lo = Math.min(map[c], prev[c])
            const hi = Math.max(map[c], prev[c])
            const key = `${lo}>${hi}`
            pairs.set(key, (pairs.get(key) ?? 0) + 1)
          }
        }
        prev = Uint8Array.from(map)
      }
      aim(s.headingRad)
      const ranked = [...pairs.entries()].sort((a, b) => b[1] - a[1])
      const lo = Math.min(ids.wall, ids.storefront)
      const hi = Math.max(ids.wall, ids.storefront)
      const wallFront = pairs.get(`${lo}>${hi}`) ?? 0
      return { cells, transitions, wallFront, top: ranked.slice(0, 3) }
    }, { wall: SURFACE_CLASS.BUILDING_WALL, storefront: SURFACE_CLASS.STOREFRONT })

    // Non-vacuity, both directions: a grid that never formed would pass every
    // ratio below, and so would a turn that never reached the camera.
    expect(
      result.cells,
      'the converter reported no character grid'
    ).toBeGreaterThan(1000)
    expect(
      result.transitions,
      'not one cell changed surface over the whole series - the view never moved'
    ).toBeGreaterThan(0)

    // The signature, rather than a magnitude. How BADLY two coplanar surfaces
    // fight depends on the rasteriser's depth precision - measured over these
    // eight steps at the Seattle spawn, this pair is 57% of every transition
    // on the release base under CI's software renderer and 97% on a real GPU.
    // Either way it is the pair that must not be fighting, and after the fix
    // it is 9% and 0.3% of a much smaller total. A share is the assertion that
    // holds on both.
    const share = result.wallFront / result.transitions
    expect(
      share,
      `storefront/wall was ${result.wallFront} of ${result.transitions} ` +
        `surface changes; the three biggest were ` +
        `${result.top.map(([k, v]) => `${k}=${v}`).join(' ')}`
    ).toBeLessThan(0.25)
  })

  test('the ground plane is filtered for the angle it is seen at (CW-52)', async ({
    page,
  }) => {
    test.skip(!(await webglAvailable(page)), 'no WebGL on this machine')
    await launchGame(page)
    await enterCity(page)

    const ground = await page.evaluate(() => {
      const mesh = window.__cityWalkGame.scene.getObjectByName('ground')
      if (!mesh) return null
      return {
        anisotropy: mesh.material.map?.anisotropy ?? null,
        cellLodBias: mesh.material.userData?.cellLodBias?.value ?? null,
      }
    })
    expect(ground, 'no ground plane in the scene').not.toBeNull()
    // The ground is the one surface here seen almost edge-on, and it needs
    // BOTH knobs: the cell-raster bias alone measured no better than nothing,
    // and so did anisotropy alone.
    expect(ground.anisotropy, 'the ground reads isotropically').toBeGreaterThan(1)
    expect(
      ground.cellLodBias,
      'the ground carries no cell-raster bias, or none is being driven'
    ).toBeGreaterThan(0)
  })
})

test.describe('ASCII City Walk — the converter remembers the last frame (CW-68)', () => {
  /**
   * Convert N frames along a small step and count how many cells changed
   * their glyph between consecutive frames.
   *
   * The step is deliberately tiny (two centimetres, the CW-52 creep) because
   * the claim is about a cell whose content BARELY moved. Everything else is
   * held still: the world's own clock is stopped first, so the only thing
   * that differs between two frames is the pose this sets.
   */
  /**
   * ★★ FOUR CREEPS FROM FOUR PLACES, NOT ONE LONGER CREEP (CW-91). Anchoring
   * took most of this guard's subject away: with it on the stateless pick
   * re-rolls 790 lit cells over one creep where it re-rolled 3,881 before,
   * because an anchored cell does not re-roll at all. Narrowing the population
   * to the cells the memory still governs is right, and it leaves a few
   * hundred events - not enough to read a 20 per cent effect off steadily.
   *
   * ★★★ AND LENGTHENING THE CREEP IS NOT THE WAY TO FIX THAT, WHICH WAS
   * MEASURED RATHER THAN ASSUMED. Ten steps instead of four took the reading
   * from 79.1 % to 92.2 %: the memory has a HOLD EXPIRY, so a longer creep
   * lets more holds run out and reports a weaker lever. Frame count is part of
   * the physics this case is about, not a precision knob. So the sample is
   * made WIDER instead - the same four-step creep, repeated from places a few
   * metres apart, pooled. Every creep is the identical experiment on a
   * different piece of city.
   */
  async function glyphChangesOverCreep(page, steps = 4, creeps = 4, gapM = 4) {
    return page.evaluate(async ({ n, anchoredIds, creeps, gapM, TREE_ID }) => {
      const ANCHORED = new Set(anchoredIds)
      const game = window.__cityWalkGame
      const convert = async () => {
        const before = game.altView.getConvertTotals().samples
        game.altView.invalidate()
        const deadline = Date.now() + 15000
        while (game.altView.getConvertTotals().samples <= before) {
          if (Date.now() > deadline) throw new Error('no conversion in 15 s')
          await new Promise((r) => requestAnimationFrame(r))
        }
        const probe = game.altView.readCellProbe()
        if (!probe) throw new Error('the cell probe is empty')
        return probe
      }
      const start = { ...game.walkState }
      let changes = 0
      // ★★★ CW-89: the memory's population, counted separately. The memory
      // holds a cell's CHARACTER; since CW-89 it explicitly does not decide
      // whether a cell has one, so a cell going blank or coming back is not a
      // re-roll it was ever asked to prevent. Counting those made this guard
      // measure more than it means - it read 81.8 % against its own 80 % bar
      // the moment CW-89 stopped the trail, which would have looked like a
      // regression and was the guard's population going stale.
      let litChanges = 0
      // ★★★ CW-91: THE MEMORY'S POPULATION WENT STALE AGAIN, FOR THE SAME
      // REASON AS AT CW-89 - the guard was measuring more than it means.
      // Anchored cells take their glyph from the SURFACE and are deliberately
      // never held (plan §10.3): holding one past the moment its lattice
      // square slid is exactly the trail CW-84 cut. So they change identically
      // with the memory on and off, and once the facade joined the anchored
      // set at CW-91 they are most of the picture - the guard read 13 % of
      // stateless re-rolls prevented against its own 20 % bar, which looks
      // like a regression in the memory and is nothing of the kind.
      //
      // ★ THE BAR DID NOT MOVE. It has been re-pinned once already (CW-77,
      // 0.6 -> 0.8) and re-pinning it to match a result would leave it worth
      // nothing. What moved is WHICH CELLS the question is asked about: the
      // ones the memory still governs. Both numbers are logged so the
      // dilution stays visible.
      // ★★★ CW-94: THE POPULATION WENT STALE A THIRD TIME, SAME LESSON.
      // The blob crowns became sparse ring-branch trees, and a leaf-cube
      // edge under a 2 cm creep re-rolls because the GEOMETRY slid across
      // the cell - which is the ANCHORING question (trees are unanchored by
      // design, CW-91's set), not the hold question. The memory deliberately
      // drops a cell whose content moves under it, so tree cells joined the
      // pool as re-rolls no memory may hold: the guard read 81.0 % against
      // its 80 % bar the day the trees landed, with the converter unchanged.
      // TREE cells leave the governed pool as the anchored classes did at
      // CW-91; their numbers are counted BESIDE the pool so the dilution
      // stays visible, and the bar still does not move.
      let governedChanges = 0
      let governedCells = 0
      let treeChanges = 0
      let treeCells = 0
      let cells = 0
      let previous = null
      let previousCls = null
      for (let k = 0; k < creeps; k++) {
        // Each creep starts its own run: the previous creep's last frame is a
        // different place, and a pair spanning that jump is not a 2 cm step.
        previous = null
        previousCls = null
        for (let i = 0; i < n; i++) {
        const d = k * gapM + 0.02 * i
        const s = game.walkState
        s.x = start.x + Math.sin(start.headingRad) * d
        s.y = start.y + Math.cos(start.headingRad) * d
        const eyeZ = 1.7 + (s.groundZ ?? 0)
        game.fpCamera.position.set(s.x, s.y, eyeZ)
        game.fpCamera.lookAt(
          s.x + Math.sin(s.headingRad),
          s.y + Math.cos(s.headingRad),
          eyeZ
        )
        const probe = await convert()
        cells = probe.cols * probe.rows
        const cls = game.classPass.read(game.fpCamera, probe.cols, probe.rows)
        if (previous) {
          for (let c = 0; c < cells; c++) {
            // A pair counts as governed only if the cell was unanchored in
            // BOTH frames: one that crossed the boundary is not evidence
            // about the memory either way. Tree cells are counted apart -
            // see the CW-94 note above.
            const isTree = cls[c] === TREE_ID || previousCls[c] === TREE_ID
            const unanchored =
              !ANCHORED.has(cls[c]) && !ANCHORED.has(previousCls[c])
            const governed = unanchored && !isTree
            if (governed) governedCells++
            if (unanchored && isTree) treeCells++
            if (probe.glyphs[c] === previous[c]) continue
            changes++
            if (probe.glyphs[c] !== 0 && previous[c] !== 0) {
              litChanges++
              if (governed) governedChanges++
              if (unanchored && isTree) treeChanges++
            }
          }
        }
        previous = Int16Array.from(probe.glyphs)
        previousCls = Uint8Array.from(cls)
        }
      }
      Object.assign(game.walkState, start)
      return {
        changes,
        litChanges,
        governedChanges,
        governedCells,
        treeChanges,
        treeCells,
        cells,
        pairs: (n - 1) * creeps,
        usedGpu: game.altView.getConvertStats().usedGpu,
      }
    }, { n: steps, anchoredIds: [...ANCHORED_CLASSES], creeps, gapM, TREE_ID: SURFACE_CLASS.TREE })
  }

  /**
   * The margin matters, and it is not a taste. RED-PROOFED by disabling the
   * hold in the shader: the memory then prevented ONE glyph change out of
   * 61,440 cell-frames, and a bare "fewer than" assertion passed on 930
   * against 931. A lever that does nothing must fail this, so the bar is a
   * SHARE. Measured on this machine with the lever working: 256 and 124
   * against 931, i.e. 13 to 28 per cent.
   *
   * ★★ RE-PINNED IN CW-77, AND THE BAR HAD STOPPED MEASURING THE LEVER.
   * 0.6 was set against a memory that no longer ships and a city with a
   * third of the edges, and by CW-77 the guard was reading 58 per cent
   * against a 60 per cent bar - close enough that it passed or failed on how
   * many frames had converted before the creep started, which is warm-up and
   * not the thing this case is about. The four-cell probe
   * (build/cw77-memory.mjs, Iris Xe, 30 %, the Seattle spawn, share of the
   * stateless re-rolls that survive, default path / cpu path):
   *
   *                          pre-CW-77 map      CW-77 map
   *   glyph 0.4, hold 30      5.1 / 4.5 %      18.0 / 14.8 %
   *   glyph 0.06, hold 5     35.6 / 22.4 %     58.1 / 53.6 %   <- ships
   *
   * Both moved it and they compound. CW-84 cut the band 0.4 -> 0.06 and the
   * hold 30 -> 5 ON PURPOSE, to buy back the trail the owner saw on the
   * deployed build; a weaker memory prevents less, by design. CW-77 nearly
   * TRIPLED the stateless baseline at this pose (2,156 -> 6,210 re-rolls
   * over the same 2 cm creep) because it put thousands of lamps and a
   * terrain grid into the frame, and the memory deliberately drops a cell
   * whose surface class moves under it - so more real edges mean more real
   * re-rolls that no memory may hold.
   *
   * The bar is therefore re-pinned to the lever that SHIPS, with room for
   * the warm-up: 0.8 still fails the do-nothing lever by a mile (it measured
   * 99.9 per cent) while the shipped one has 18 points of margin. The share
   * is logged on every run so the next session reads the number without
   * having to make the case fail first.
   */
  const MUST_PREVENT = 0.8

  test('a cell whose content barely moved keeps the glyph it had', async ({
    page,
  }) => {
    // CW-97: this instrument takes 128 real conversions (4 runs x 8 creeps
    // x 4 steps), and a software-GL renderer takes seconds per conversion
    // on the full city - the default test budget cut the evaluate off
    // mid-sample. The per-step liveness deadline inside convert() (15 s)
    // still catches a genuinely stuck converter; this is time to MEASURE,
    // not permission to hang.
    test.setTimeout(360000)
    await launchGame(page)
    await enterCity(page)
    await page.evaluate(() => {
      window.__cityWalkGame.motionReduced = true
      window.__cityWalkGame.altView.setCellProbe(true)
    })

    // ★★ CW-78: THE MEASUREMENT SCENE IS PINNED. This guard's bar was
    // calibrated on the downtown spawn (CW-89's rescope; CW-91's widened
    // pool read 74.6 % there). CW-78 moved the SPAWN to the waterfront and
    // the first board after it read 83 % of re-rolls surviving - the
    // converter had not changed one line, the CITY under the creep had. A
    // guard must not measure more than it means, and this one never meant
    // "wherever the spawn happens to be", so the creep runs at the pinned
    // downtown pose from here on, whatever a later release does to spawns.
    // The pose is the OLD spawn exactly as the old flow produced it:
    // (-17.26, 14.48) facing 315 degrees - findClearHeading over the
    // props-stamped grid, re-derived offline rather than guessed.
    await page.evaluate(() => {
      const st = window.__cityWalkGame.walkState
      st.x = -17.26
      st.y = 14.48
      st.headingRad = (315 * Math.PI) / 180
    })

    // The game configures its own instance at startup; this is what it chose.
    const configured = await page.evaluate(() =>
      window.__cityWalkGame.altView.getTemporalHysteresis()
    )
    expect(configured, 'the game turns the memory on for its instance').toEqual(
      expect.objectContaining({ glyph: expect.any(Number) })
    )

    // BOTH converter paths, in one session. Which one a browser takes is not
    // this test's to choose - CI renders in software and may land on either -
    // and the two carry the rules separately: the GPU path evaluates them in
    // its shader against the previous render target, the CPU path in
    // _hfm-hysteresis.js. Each was red-proofed by disabling it alone, and
    // each time the OTHER path still passed the test, which is how this case
    // came to run both.
    for (const cpuSample of [false, true]) {
      await page.evaluate(
        (cpu) => window.__cityWalkGame.altView.setBenchLegacy({ cpuSample: cpu }),
        cpuSample
      )
      // ★ CW-94 widened the pool from four creep places to eight - CW-91's
      // own precedent, and for CW-91's own reason: never lengthen the creep
      // (frame count is part of the physics), make the SAMPLE wider. With
      // trees now real structure, a four-place pool at this corner came
      // down to ~1,300 events and the two converter paths flapped either
      // side of the bar on ~56 cells of pick noise (T50).
      const withMemory = await glyphChangesOverCreep(page, 4, 8)
      await page.evaluate(() =>
        window.__cityWalkGame.altView.setTemporalHysteresis(null)
      )
      const without = await glyphChangesOverCreep(page, 4, 8)
      await page.evaluate(
        (h) => window.__cityWalkGame.altView.setTemporalHysteresis(h),
        configured
      )

      const path = `${cpuSample ? 'cpu' : 'default'} path (usedGpu ${withMemory.usedGpu})`
      // BOTH numbers are logged, because the difference between them is the
      // whole of CW-89 and a reader of this line should be able to see it.
      console.log(
        `[CW-68 memory] ${path}: GOVERNED (unanchored, lit, non-tree) ` +
          `${withMemory.governedChanges} of ${without.governedChanges} ` +
          `stateless re-rolls survive = ` +
          `${((withMemory.governedChanges / without.governedChanges) * 100).toFixed(1)} % ` +
          `(bar < ${MUST_PREVENT * 100} %) over ${withMemory.governedCells} ` +
          `governed cell-frames; TREE cells counted apart (CW-94): ` +
          `${withMemory.treeChanges} of ${without.treeChanges} re-rolls over ` +
          `${withMemory.treeCells} cell-frames; every LIT cell including ` +
          `anchored ones ${withMemory.litChanges} of ${without.litChanges} = ` +
          `${((withMemory.litChanges / without.litChanges) * 100).toFixed(1)} % ` +
          `over ${withMemory.cells * withMemory.pairs} cell-frames`
      )
      expect(without.cells, path).toBe(withMemory.cells)
      expect(
        without.governedChanges,
        `${path}: the stateless pick re-rolls glyphs over a 2 cm step`
      ).toBeGreaterThan(100)
      // The population must not have collapsed to nothing: a guard whose
      // fixture is empty reads a perfect zero and means nothing.
      expect(
        withMemory.governedCells,
        `${path}: cells the memory still governs`
      ).toBeGreaterThan(10000)
      // ★★★ SCOPED TO LIT CELLS BY CW-89, AND THE BAR IS UNCHANGED AT 0.8.
      // The memory holds a cell's CHARACTER. Since CW-89 it explicitly does
      // not decide whether a cell HAS one - a blank answer is taken at once,
      // in both paths - so a cell going blank or coming back was never a
      // re-roll this guard was asking it to prevent. Counting those made the
      // number jump to 81.8 % the moment the trail stopped, which reads as a
      // regression and is nothing of the kind. This is CW-77's own trap paid
      // again: a guard must not measure more than it means. The BAR did not
      // move - it has been re-pinned once already (CW-77, 0.6 -> 0.8) and
      // re-pinning it to match a result would leave it worth nothing.
      expect(
        withMemory.governedChanges,
        `${path}: memory ${withMemory.governedChanges} of ` +
          `${without.governedChanges} stateless changes between two REAL ` +
          `characters, over ${withMemory.governedCells} cell-frames the ` +
          `memory still governs`
      ).toBeLessThan(without.governedChanges * MUST_PREVENT)
    }

    await page.evaluate(() => {
      window.__cityWalkGame.altView.setBenchLegacy({ cpuSample: false })
      window.__cityWalkGame.altView.setCellProbe(false)
    })
  })

  test('the memory can be turned off and back on at run time', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)
    const cycle = await page.evaluate(() => {
      const view = window.__cityWalkGame.altView
      const start = view.getTemporalHysteresis()
      const off = view.setTemporalHysteresis(null)
      const back = view.setTemporalHysteresis(start)
      return { start, off, back, after: view.getTemporalHysteresis() }
    })
    expect(cycle.off).toBeNull()
    expect(cycle.back).toEqual(cycle.start)
    expect(cycle.after).toEqual(cycle.start)
  })
})

test.describe('ASCII City Walk — the solid bright layer, three ways (CW-70)', () => {
  /** How many cells the converter painted solid in the frame on screen. */
  const solidCells = (page) =>
    page.evaluate(async () => {
      const game = window.__cityWalkGame
      const before = game.altView.getConvertTotals().samples
      game.altView.invalidate()
      const deadline = Date.now() + 15000
      while (game.altView.getConvertTotals().samples <= before) {
        if (Date.now() > deadline) throw new Error('no conversion in 15 s')
        await new Promise((r) => requestAnimationFrame(r))
      }
      const probe = game.altView.readCellProbe()
      const levels = game.altView.getIntensityLevels()
      if (!probe?.intensity || !levels) return null
      // The reverse-video atlas rides one past the last drive level.
      let solid = 0
      for (const value of probe.intensity) if (value === levels.length) solid++
      return { solid, cells: probe.cols * probe.rows }
    })

  test('the game draws CAPPED solid cells, off draws none, stock draws most', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)
    await page.evaluate(() => {
      window.__cityWalkGame.motionReduced = true
      window.__cityWalkGame.altView.setCellProbe(true)
    })

    // ★ What the game draws since CW-84: the owner's SECOND answer, given
    // after playing the deployed build rather than reading photographs of it.
    // `off` was chosen at G1 from stills and called sad in motion.
    expect(
      await page.evaluate(() => window.__cityWalkGame.getLuminanceLayer())
    ).toBe('calm')
    const calm = await solidCells(page)
    expect(calm, 'this browser has no intensity ladder').not.toBeNull()
    expect(
      calm.solid,
      `calm painted ${calm.solid} of ${calm.cells} cells solid`
    ).toBeGreaterThan(0)

    // `off` must still remove the layer completely, or the switch is not a
    // switch and every "fewer solid cells" assertion here rests on nothing.
    await page.evaluate(() => window.__cityWalkGame.setLuminanceLayer('off'))
    const off = await solidCells(page)
    expect(off.cells).toBe(calm.cells)
    expect(off.solid).toBe(0)

    // `stock` must still paint the layer, or this case could not tell a
    // treatment that works from one that removed the layer by accident - and
    // every "fewer solid cells" assertion in this file would pass on nothing.
    await page.evaluate(() => window.__cityWalkGame.setLuminanceLayer('stock'))
    const stock = await solidCells(page)
    expect(stock.cells).toBe(off.cells)
    expect(
      stock.solid,
      `stock painted ${stock.solid} of ${stock.cells} cells solid`
    ).toBeGreaterThan(0)
    // ★ WHAT THIS POSE CANNOT SHOW, SAID OUT LOUD. `calm` differs from
    // `stock` only through its share CAP, and a cap that is never exceeded is
    // indistinguishable from no cap. At this pose the solid share sits under
    // the 1 % cap, so calm and stock paint about the same count and an
    // ordering assertion between them would be measuring frame noise - it
    // passed once here and then failed on a re-read of the same scene. The
    // cap's effect is measured where it actually engages (the shopfront pose:
    // 2,936 solid on stock against 2,261 on calm) and pinned by the unit
    // tests over nextReverseLift, which need no GPU at all.

    // ...and back, so the switch is a switch and not a one-way door.
    //
    // ★ NOT the same COUNT, and that is a property rather than a wobble.
    // `calm` carries a share cap whose lift settles over about five frames
    // (CW-70), so a reading taken immediately after switching back is
    // mid-settle by construction. Asserting the exact number here would have
    // pinned one moment of a controller that is designed to move; what has to
    // be true is that the layer came back at all, and still capped.
    await page.evaluate(() => window.__cityWalkGame.setLuminanceLayer('calm'))
    expect((await solidCells(page)).solid).toBeGreaterThan(0)

    await page.evaluate(() => window.__cityWalkGame.altView.setCellProbe(false))
  })

  test('each treatment sets both halves, and an unknown name falls back', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)
    const read = () =>
      page.evaluate(() => ({
        mode: window.__cityWalkGame.getLuminanceLayer(),
        reverseAt: window.__cityWalkGame.altView.getReverseVideo(),
        cap: window.__cityWalkGame.altView.getReverseShareCap(),
      }))

    expect(await read()).toEqual({ mode: 'calm', reverseAt: 0.8, cap: 0.01 })

    await page.evaluate(() => window.__cityWalkGame.setLuminanceLayer('stock'))
    expect(await read()).toEqual({ mode: 'stock', reverseAt: 0.8, cap: null })

    await page.evaluate(() => window.__cityWalkGame.setLuminanceLayer('off'))
    expect(await read()).toEqual({ mode: 'off', reverseAt: null, cap: null })

    // A name nobody knows must land on the SHIPPED treatment, not on whatever
    // was set last: this switch is reachable from a script and a typo in one
    // would otherwise quietly measure the previous run.
    // The fallback is the SHIPPED treatment, so it moved with it: this is
    // deliberately asserted against the default rather than against a
    // hard-coded name, because the point of the case is "a typo lands on what
    // ships", and hard-coding the old answer would have made it pass while
    // meaning the opposite.
    await page.evaluate(() =>
      window.__cityWalkGame.setLuminanceLayer('brighter please')
    )
    expect(await read()).toEqual({ mode: 'calm', reverseAt: 0.8, cap: 0.01 })
  })
})

test.describe('ASCII City Walk — Day and Night (CW-85, CW-Q83)', () => {
  /** Convert one frame and hand back the glyph grid the converter chose. */
  const glyphsNow = (page) =>
    page.evaluate(async () => {
      const g = window.__cityWalkGame
      const before = g.altView.getConvertTotals().samples
      g.altView.invalidate()
      const deadline = Date.now() + 15000
      while (g.altView.getConvertTotals().samples <= before) {
        if (Date.now() > deadline) throw new Error('no conversion in 15 s')
        await new Promise((r) => requestAnimationFrame(r))
      }
      const probe = g.altView.readCellProbe()
      if (!probe) throw new Error('the cell probe is empty')
      return Array.from(probe.glyphs)
    })

  const settle = (page) =>
    page.evaluate(async () => {
      const g = window.__cityWalkGame
      for (let i = 0; i < 2; i++) {
        const before = g.altView.getConvertTotals().samples
        g.altView.invalidate()
        const deadline = Date.now() + 15000
        while (g.altView.getConvertTotals().samples <= before) {
          if (Date.now() > deadline) throw new Error('no conversion')
          await new Promise((r) => requestAnimationFrame(r))
        }
      }
    })

  test('★★★ the backing changes NO glyph the converter chose', async ({
    page,
  }) => {
    // The whole layer rests on this. The backing is computed at PAINT time,
    // after every glyph is already picked, so it cannot reach the decision -
    // and that is a claim about the ORDER of the code, which is exactly the
    // kind of claim that quietly stops being true. Same pose, same frame,
    // Night then Day: the grids must match cell for cell.
    //
    // RED PROOF (run by hand, CW-85): let buildBacking write into the glyph
    // array it is handed, and this case names the first cell that moved.
    await launchGame(page)
    await enterCity(page)
    const configuredHysteresis = await page.evaluate(() =>
      window.__cityWalkGame.altView.getTemporalHysteresis()
    )
    await page.evaluate(() => {
      window.__cityWalkGame.motionReduced = true
      window.__cityWalkGame.altView.setCellProbe(true)
      window.__cityWalkGame.altView.setFontScale(0.3)
      // The CW-68 memory HOLDS a glyph for five converted frames and then
      // lets it go, so two captures taken at different points in that cycle
      // differ by thousands of cells whatever else is true. Measured while
      // writing this case: with the memory on, frames 1 and 2 after a toggle
      // match and frame 3 moves 4,237 of 73,600 - the hold expiring, not the
      // backing; with the memory off every frame matches. So it comes off for
      // the measurement and goes back after. This case asks whether the
      // BACKING moves a decision, and the memory's own clock is not an answer.
      window.__cityWalkGame.altView.setTemporalHysteresis(null)
    })
    await settle(page)

    const countDiff = (a, b) => {
      let n = 0
      let first = -1
      for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) {
          n++
          if (first < 0) first = i
        }
      }
      return { n, first }
    }

    // ★★ THE SAME-CODE CONTROL FIRST (CW-31's rule, and this case needed it
    // - written without one it blamed Day for 4,237 glyphs that the harness
    // moved on its own before the scene had settled). Two conversions of an
    // unchanged scene, nothing toggled: whatever this reads is what a
    // comparison in this harness costs, and the real measurement is only
    // meaningful against it.
    const nightA = await glyphsNow(page)
    const nightB = await glyphsNow(page)
    const control = countDiff(nightA, nightB)
    expect(nightA.length).toBeGreaterThan(1000)
    expect(
      control.n,
      `the control moved ${control.n} glyphs with nothing changed, so this ` +
        'case cannot say anything about Day'
    ).toBe(0)

    await page.keyboard.press('KeyB')
    await settle(page)
    const day = await glyphsNow(page)
    expect(day.length).toBe(nightB.length)
    const moved = countDiff(nightB, day)
    expect(
      moved.n,
      `Day moved ${moved.n} of ${nightB.length} glyphs (first at cell ` +
        `${moved.first}) against a control of ${control.n}`
    ).toBe(control.n)

    await page.evaluate((h) => {
      window.__cityWalkGame.altView.setCellProbe(false)
      window.__cityWalkGame.altView.setTemporalHysteresis(h)
    }, configuredHysteresis)
  })

  test('★★ Day paints a backing, and Night paints none', async ({ page }) => {
    // The companion to the case above. Proving nothing CHANGED would pass
    // just as well if the layer did nothing at all, so this one measures that
    // it does something. Painted PIXELS are the measure, because a backing is
    // pixels and not characters.
    await launchGame(page)
    await enterCity(page)
    await page.evaluate(() => {
      window.__cityWalkGame.motionReduced = true
      window.__cityWalkGame.altView.setFontScale(0.3)
    })

    await settle(page)
    // CW-97: the old measure was a RATIO of total painted pixels, which
    // entangles the backing with the night city's own ink density - a
    // number that moves with every release and every rasteriser (Edge on
    // CI's software renderer read 69.9 against a 73.7 bar with the
    // backing working perfectly). The claim is that DAY paints a backing
    // and NIGHT paints none, and the sibling case proves the backing
    // changes no glyph - so with the pose frozen, the pixels painted at
    // day and black at night ARE the backing, measured directly.
    await page.evaluate(() => {
      const cv = document.querySelector('canvas.hfm-overlay-canvas')
      const cx = cv.getContext('2d', { willReadFrequently: true })
      window.__nightPixels = cx.getImageData(0, 0, cv.width, cv.height).data
    })
    await page.keyboard.press('KeyB')
    await settle(page)
    const shares = await page.evaluate(() => {
      const cv = document.querySelector('canvas.hfm-overlay-canvas')
      const cx = cv.getContext('2d', { willReadFrequently: true })
      const day = cx.getImageData(0, 0, cv.width, cv.height).data
      const night = window.__nightPixels
      let dayOnly = 0
      let nightOnly = 0
      const total = day.length / 4
      for (let i = 0; i < day.length; i += 4) {
        const d = day[i] || day[i + 1] || day[i + 2]
        const n = night[i] || night[i + 1] || night[i + 2]
        if (d && !n) dayOnly++
        if (n && !d) nightOnly++
      }
      delete window.__nightPixels
      return { dayOnly: dayOnly / total, nightOnly: nightOnly / total }
    })

    expect(
      shares.dayOnly,
      `the backing (day-only pixels) covers ${(shares.dayOnly * 100).toFixed(1)} % of the canvas`
    ).toBeGreaterThan(0.08)
    // And night paints nothing of its own: the glyphs are pinned by the
    // sibling case, so night-only pixels should be noise at most.
    expect(
      shares.nightOnly,
      `night-only pixels ${(shares.nightOnly * 100).toFixed(1)} %`
    ).toBeLessThan(0.01)
  })

  test('★★ B and the toolbar button agree, and the choice is remembered', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)
    const btn = page.locator('#cityWalkDaylightBtn')
    await expect(btn).toHaveAttribute('aria-pressed', 'false')

    await page.keyboard.press('KeyB')
    await expect(btn).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('#cityWalkAnnouncer')).toContainText('Day')

    // The button is the same action, not a second one: CW-60's promise is
    // that every key has a button, and a button that disagreed with its key
    // would be two features wearing one name.
    await btn.click()
    await expect(btn).toHaveAttribute('aria-pressed', 'false')
    expect(
      await page.evaluate(() =>
        localStorage.getItem('openscad-forge-city-walk-daylight')
      )
    ).toBe('night')

    await page.keyboard.press('KeyB')
    // ★ LEAVE THE CITY THE WAY A PLAYER DOES, rather than bouncing the tab
    // through about:blank. The bounce is this suite's usual second-visit
    // recipe, but in Firefox it raced with a navigation of its own -
    // 'Navigation to about:blank is interrupted by another navigation to
    // about:blank' - and failed on every run. Escape closes the layer, which
    // is what the calibration precedent's blank page was really buying: a
    // same-URL navigation is only a problem from INSIDE the open layer.
    // This is also the truer test, because it is what a player actually does.
    await expect
      .poll(() =>
        page.evaluate(() =>
          localStorage.getItem('openscad-forge-city-walk-daylight')
        )
      )
      .toBe('day')
    await page.keyboard.press('Escape')
    await expect(page.locator('#cityWalkLayer')).toBeHidden()
    await launchGame(page)
    await enterCity(page)
    await expect(page.locator('#cityWalkDaylightBtn')).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  })

  test('★★★ an empty city takes the obstacles out with the people (CW-Q86)', async ({
    page,
  }) => {
    // The half that is easy to forget. Hiding a car and leaving its footprint
    // in the collision grid makes an empty street you cannot walk down, which
    // is a worse city than the busy one it replaced.
    await launchGame(page)
    await enterCity(page)

    const survey = () =>
      page.evaluate(() => {
        const g = window.__cityWalkGame
        const names = ['people', 'cars', 'traffic-cars']
        let visible = 0
        let meshes = 0
        g.props.group.traverse((o) => {
          if (o.isMesh && names.includes(o.name)) {
            meshes++
            if (o.visible) visible++
          }
        })
        let blocked = 0
        for (const o of g.props.obstacles) {
          if (g.collision.isBlocked(o.x, o.y)) blocked++
        }
        const population = g.props.obstacles.filter((o) => o.population)
        const stillBlocked = population.filter((o) =>
          g.collision.isBlocked(o.x, o.y)
        )
        // A footprint within a cell and a half of a NON-population rect is
        // blocked by that thing, not by anybody who has just left. The margin
        // is the grid's own rasterisation: cellM is 1 m and blockRect blocks
        // every cell a rect touches.
        const others = g.props.obstacles.filter((o) => !o.population)
        const near = (pt, r) => {
          const dx = pt.x - r.x
          const dy = pt.y - r.y
          const c = Math.cos(-r.rotationRad)
          const sn = Math.sin(-r.rotationRad)
          const lx = dx * c - dy * sn
          const ly = dx * sn + dy * c
          return (
            Math.abs(lx) <= r.halfLengthM + 1.5 &&
            Math.abs(ly) <= r.halfWidthM + 1.5
          )
        }
        const unexplainedBlocked = stillBlocked.filter(
          (o) => !others.some((r) => near(o, r))
        ).length
        return {
          meshes,
          visible,
          blocked,
          population: population.length,
          populationBlocked: stillBlocked.length,
          unexplainedBlocked,
        }
      })

    const busy = await survey()
    expect(busy.meshes, 'the city has people and cars to hide').toBeGreaterThan(
      0
    )
    expect(busy.visible).toBe(busy.meshes)
    expect(
      busy.population,
      'people and parked cars are tagged as population'
    ).toBeGreaterThan(100)
    expect(
      busy.populationBlocked,
      'a busy city blocks the ground every one of them stands on'
    ).toBe(busy.population)

    await page.keyboard.press('KeyU')
    const empty = await survey()
    expect(empty.visible, 'nobody is drawn').toBe(0)

    // ★★ WHAT "NOBODY IS IN THE WAY" CAN HONESTLY MEAN. The collision grid is
    // 1 m and `blockRect` blocks every cell a rect TOUCHES, so somebody
    // standing beside a tree shares the tree's blocked cell and that cell
    // stays blocked when they leave - correctly, because the tree is still
    // there. Measured on Seattle: 7,359 population footprints, 7,315 freed,
    // and every one of the 44 survivors within a cell and a half of a bench,
    // a basket, a hydrant or a tree. So the claim is not "zero blocked" - it
    // is that nothing stays blocked BECAUSE OF the population, and the
    // survivors are named rather than tolerated.
    const freed = busy.populationBlocked - empty.populationBlocked
    expect(
      freed / busy.population,
      `emptying freed ${freed} of ${busy.population} footprints`
    ).toBeGreaterThan(0.99)
    expect(
      empty.unexplainedBlocked,
      `${empty.unexplainedBlocked} footprints are still blocked with nothing ` +
        'but a hidden person or car to explain them'
    ).toBe(0)

    // The rest of the street furniture is untouched: a bench is still a bench.
    expect(empty.blocked).toBeLessThan(busy.blocked)
    expect(empty.blocked).toBeGreaterThan(0)

    await page.keyboard.press('KeyU')
    const back = await survey()
    expect(back.visible).toBe(back.meshes)
    expect(back.populationBlocked).toBe(busy.populationBlocked)
  })
})

test.describe('ASCII City Walk — glyphs anchored to the surface (CW-86, CW-91)', () => {
  const settle = (page) =>
    page.evaluate(async () => {
      const g = window.__cityWalkGame
      for (let i = 0; i < 2; i++) {
        const before = g.altView.getConvertTotals().samples
        g.altView.invalidate()
        const deadline = Date.now() + 15000
        while (g.altView.getConvertTotals().samples <= before) {
          if (Date.now() > deadline) throw new Error('no conversion')
          await new Promise((r) => requestAnimationFrame(r))
        }
      }
    })

  const enter = async (page) => {
    await launchGame(page)
    await enterCity(page)
    await page.evaluate(() => {
      window.__cityWalkGame.motionReduced = true
      window.__cityWalkGame.altView.setCellProbe(true)
      window.__cityWalkGame.altView.setFontScale(0.3)
    })
    await settle(page)
  }

  test('★★★ it is ON, and it runs on the GPU path (CW-91)', async ({ page }) => {
    // CW-86 built this and asserted the OPPOSITE here, because anchoring
    // forced the CPU glyph path and halved the frame rate - 59.6 fps to 29.6,
    // measured A-B-B-A. CW-91 taught the shader to read the field byte out of
    // the class texture's own green channel and index the ladder itself, so
    // that reason is gone and the owner's pick (CW-Q90) ships.
    //
    // The two halves of this case are one claim: anchoring is on AND the
    // converter is still on the GPU. Either alone would be worthless - a
    // release that turned anchoring on and quietly fell back to the CPU would
    // pass "it is on" while giving every player half the frame rate.
    await enter(page)
    expect(
      await page.evaluate(() => window.__cityWalkGame.getAnchoredGlyphs())
    ).toBe(true)
    expect(
      await page.evaluate(() =>
        window.__cityWalkGame.altView.anchoredGlyphsOn()
      )
    ).toBe(true)
    expect(
      await page.evaluate(
        () => window.__cityWalkGame.altView.getConvertStats().usedGpu
      ),
      'anchoring must not force the CPU path any more'
    ).toBe(true)
    // And the class pass really is rendering a field: with it on, some cells
    // carry a non-zero field byte. Zero everywhere is what "off" looks like,
    // and it would make every assertion above true and meaningless.
    const field = await page.evaluate(() => {
      const g = window.__cityWalkGame
      const probe = g.altView.readCellProbe()
      g.classPass.read(g.fpCamera, probe.cols, probe.rows)
      const f = g.classPass.lastField()
      let nonZero = 0
      for (let i = 0; i < f.length; i++) if (f[i]) nonZero++
      return { cells: f.length, nonZero }
    })
    expect(field.cells).toBeGreaterThan(1000)
    expect(field.nonZero).toBeGreaterThan(100)
  })

  test('★★★ it moves the GROUND and the FACADE, and nothing else (CW-91)', async ({
    page,
  }) => {
    // The release's whole verdict in one case. CW-86 scoped anchoring to the
    // surfaces whose texture is a dither and asserted here that the facade did
    // NOT move; the owner then looked at the lattice photographs and picked 64
    // for the facade as well (CW-Q90), knowing from CW-86's own table that it
    // does not steady a wall. So the facade moves now - and the classes that
    // were never in the set still must not.
    await enter(page)
    // ★★★ HOLD THE PATH CONSTANT, OR THIS MEASURES TWO CHANGES AT ONCE. Since
    // CW-91 both sides are on the GPU by default, which is the whole point;
    // this line says so rather than assuming it.
    expect(
      await page.evaluate(
        () => window.__cityWalkGame.altView.getConvertStats().usedGpu
      )
    ).toBe(true)

    const grab = async () =>
      page.evaluate(() => {
        const game = window.__cityWalkGame
        const probe = game.altView.readCellProbe()
        const cls = game.classPass.read(game.fpCamera, probe.cols, probe.rows)
        return { glyphs: Array.from(probe.glyphs), cls: Array.from(cls) }
      })

    // Off first, then on, so "before" is the picture without anchoring.
    await page.evaluate(() => window.__cityWalkGame.setAnchoredGlyphs(false))
    await settle(page)
    const before = await grab()
    await page.evaluate(() => window.__cityWalkGame.setAnchoredGlyphs(true))
    await settle(page)
    const after = await grab()
    expect(after.glyphs.length).toBe(before.glyphs.length)

    const KEYS = {
      1: 'ground',
      13: 'paving',
      4: 'wall',
      6: 'storefront',
      2: 'road',
      9: 'tree',
    }
    const moved = {
      ground: 0,
      paving: 0,
      wall: 0,
      storefront: 0,
      road: 0,
      tree: 0,
    }
    const total = { ...moved }
    for (let i = 0; i < before.glyphs.length; i++) {
      if (before.cls[i] !== after.cls[i]) continue
      const key = KEYS[before.cls[i]]
      if (!key) continue
      total[key]++
      if (before.glyphs[i] !== after.glyphs[i]) moved[key]++
    }

    // The fixture has to contain the thing it guards.
    expect(total.ground + total.paving).toBeGreaterThan(200)
    expect(total.wall + total.storefront).toBeGreaterThan(200)
    expect(total.road + total.tree).toBeGreaterThan(200)

    // Every anchored surface took its glyphs from somewhere else.
    expect(moved.ground + moved.paving).toBeGreaterThan(0)
    expect(
      moved.wall + moved.storefront,
      'the facade is anchored since CW-91 and must move'
    ).toBeGreaterThan(0)
    // And the classes that are NOT in the set did not move one cell. The road
    // carries neither a uv attribute nor a map, so it could not be anchored
    // even if somebody added it to the list; a tree is simply not in it.
    expect(
      moved.road,
      `${moved.road} road cells moved, and the road is not anchored`
    ).toBe(0)
    expect(moved.tree).toBe(0)
  })

  test('★★ an anchored surface holds perfectly still while the walker does', async ({
    page,
  }) => {
    // The standing control, which is the row that makes every other row
    // readable: if the picture moves while the world does not, nothing else
    // measured here means anything.
    await enter(page)
    await page.evaluate(() => window.__cityWalkGame.setAnchoredGlyphs(true))
    await settle(page)

    const snap = () =>
      page.evaluate(() => {
        const g = window.__cityWalkGame
        const probe = g.altView.readCellProbe()
        const cls = g.classPass.read(g.fpCamera, probe.cols, probe.rows)
        const out = []
        for (let i = 0; i < cls.length; i++) {
          if (cls[i] === 1 || cls[i] === 13) out.push([i, probe.glyphs[i]])
        }
        return out
      })

    const a = await snap()
    await settle(page)
    const b = await snap()
    expect(a.length).toBeGreaterThan(200)
    expect(b.length).toBe(a.length)
    let moved = 0
    for (let i = 0; i < a.length; i++) {
      if (a[i][0] !== b[i][0] || a[i][1] !== b[i][1]) moved++
    }
    expect(moved, `${moved} anchored cells changed while standing still`).toBe(0)

    await page.evaluate(() => window.__cityWalkGame.setAnchoredGlyphs(false))
  })
})

test.describe('ASCII City Walk — ink belongs to its surface (CW-93, D-128, D-129)', () => {
  const settle = (page) =>
    page.evaluate(async () => {
      const g = window.__cityWalkGame
      for (let i = 0; i < 2; i++) {
        const before = g.altView.getConvertTotals().samples
        g.altView.invalidate()
        const deadline = Date.now() + 15000
        while (g.altView.getConvertTotals().samples <= before) {
          if (Date.now() > deadline) throw new Error('no conversion')
          await new Promise((r) => requestAnimationFrame(r))
        }
      }
    })

  const enter = async (page) => {
    await launchGame(page)
    await enterCity(page)
    await page.evaluate(() => {
      window.__cityWalkGame.motionReduced = true
      window.__cityWalkGame.altView.setCellProbe(true)
      window.__cityWalkGame.altView.setFontScale(0.3)
    })
    await settle(page)
  }

  /**
   * Every cell whose DRAWN glyph is not in its own class's ladder.
   *
   * The same arithmetic the sequence instrument prints as its MISMATCH column
   * (src/js/game/seq-metrics.js), read here against the REAL shader - which
   * unit tests cannot reach, and which is where the defect lived.
   *
   * Reverse-video cells are exempt because both paths match them against the
   * inverted shape and the full atlas on purpose; palette mode has no reverse
   * video at all, so in colour the exempt count is zero.
   */
  const audit = (page) =>
    page.evaluate(() => {
      const g = window.__cityWalkGame
      const probe = g.altView.readCellProbe()
      const cls = g.classPass.read(g.fpCamera, probe.cols, probe.rows)
      const vocab = g.altView.getClassVocabularies()
      const levels = g.altView.getIntensityLevels()
      const reverseIndex = probe.intensity && levels ? levels.length : -1
      const allowed = new Map(
        Object.entries(vocab).map(([id, ids]) => [Number(id), new Set(ids)])
      )
      const distinct = new Map()
      const examples = []
      let classified = 0
      let mismatch = 0
      let exempt = 0
      for (let i = 0; i < cls.length; i++) {
        const legal = allowed.get(cls[i])
        if (!legal) continue
        classified++
        if (probe.intensity && probe.intensity[i] === reverseIndex) {
          exempt++
          continue
        }
        let seen = distinct.get(cls[i])
        if (!seen) {
          seen = new Set()
          distinct.set(cls[i], seen)
        }
        seen.add(probe.glyphs[i])
        if (legal.has(probe.glyphs[i])) continue
        mismatch++
        if (examples.length < 6) {
          examples.push(
            `"${String.fromCharCode(32 + probe.glyphs[i])}" on class ${cls[i]}`
          )
        }
      }
      return {
        classified,
        mismatch,
        exempt,
        examples,
        richest: Math.max(0, ...[...distinct.values()].map((s) => s.size)),
        classesSeen: distinct.size,
        palette: Boolean(g.altView.getPalette()),
        usedGpu: g.altView.getConvertStats().usedGpu,
      }
    })

  /** What a run must contain before its zero means anything. */
  const expectRealFixture = (res) => {
    // ★ A GUARD'S FIXTURE MUST CONTAIN THE THING IT GUARDS. Nought illegal
    // characters out of nought classified cells is the shape of every guard
    // this round has had to un-ship.
    expect(res.classified).toBeGreaterThan(2000)
    expect(res.classesSeen).toBeGreaterThan(3)
    // And the picture must be drawing a real range of characters, not one
    // character everywhere - which would satisfy any subset test.
    expect(res.richest).toBeGreaterThan(3)
  }

  test('★★★ in COLOUR every classified cell draws its own surface\'s character', async ({
    page,
  }) => {
    // The owner's defect, as a number. Until CW-93 the GPU path was handed
    // `useClassVocabularies: !usePalette`, so in colour every classified cell
    // searched the full 95-glyph atlas: a tree canopy and a building facade
    // were drawn with the same alphabet, and a window pattern landed on a
    // tree's underside. Measured at 69 % of the grid before the fix.
    //
    // ★ AND THIS CASE EARNED ITS KEEP THE DAY IT WAS WRITTEN. It went red on
    // a SECOND defect the first fix uncovered (D-129): reaching colour by
    // CLICKING the button - which is how a player reaches it, and what this
    // case does - left the GPU path's reverse-video threshold set to the mono
    // value, so 119 bright cells were matched against an inverted vector and
    // drew from the whole atlas. Setting the mode before the page loads never
    // showed it. Do not "simplify" this into a localStorage seed.
    await enter(page)
    // noWaitAfter: the flip's synchronous atlas rebuild can outlive the
    // action budget on CI software; the aria wait below is the real
    // post-condition (batch 5).
    await page.locator('#cityWalkColourBtn').click({ noWaitAfter: true })
    await expect(page.locator('#cityWalkColourBtn')).toHaveAttribute(
      'aria-pressed',
      'true',
      { timeout: 120000 }
    )
    await settle(page)

    const res = await audit(page)
    expect(res.palette, 'the game is in palette mode').toBe(true)
    expect(res.usedGpu, 'colour takes the GPU path on this machine').toBe(true)
    expectRealFixture(res)
    expect(res.exempt, 'palette mode has no reverse video').toBe(0)
    expect(
      res.mismatch,
      `${res.mismatch} of ${res.classified} classified cells drew a character ` +
        `their surface does not own: ${res.examples.join(', ')}`
    ).toBe(0)
  })

  test('★★ and the two converter paths agree about it, in both modes', async ({
    page,
  }) => {
    // The defect was one path disagreeing with the other, which is the one
    // thing a converter with two implementations must never do. So the case
    // asks all four corners rather than the one the machine happens to pick.
    await enter(page)
    const mono = await audit(page)
    expect(mono.palette).toBe(false)
    expectRealFixture(mono)
    expect(mono.mismatch, `mono, GPU: ${mono.examples.join(', ')}`).toBe(0)

    await page.evaluate(() =>
      window.__cityWalkGame.altView.setBenchLegacy({ cpuSample: true })
    )
    await settle(page)
    const monoCpu = await audit(page)
    expect(monoCpu.usedGpu).toBe(false)
    expectRealFixture(monoCpu)
    expect(monoCpu.mismatch, `mono, CPU: ${monoCpu.examples.join(', ')}`).toBe(0)

    await page.locator('#cityWalkColourBtn').click({ noWaitAfter: true })
    await expect(page.locator('#cityWalkColourBtn')).toHaveAttribute(
      'aria-pressed',
      'true',
      { timeout: 120000 }
    )
    await settle(page)
    const colourCpu = await audit(page)
    expect(colourCpu.palette).toBe(true)
    expect(colourCpu.usedGpu).toBe(false)
    expectRealFixture(colourCpu)
    expect(
      colourCpu.mismatch,
      `colour, CPU: ${colourCpu.examples.join(', ')}`
    ).toBe(0)

    await page.evaluate(() =>
      window.__cityWalkGame.altView.setBenchLegacy({ cpuSample: false })
    )
  })
})

test.describe('ASCII City Walk — colour belongs to its surface (CW-92, D-127)', () => {
  const settle = (page) =>
    page.evaluate(async () => {
      const g = window.__cityWalkGame
      for (let i = 0; i < 2; i++) {
        const before = g.altView.getConvertTotals().samples
        g.altView.invalidate()
        const deadline = Date.now() + 15000
        while (g.altView.getConvertTotals().samples <= before) {
          if (Date.now() > deadline) throw new Error('no conversion')
          await new Promise((r) => requestAnimationFrame(r))
        }
      }
    })

  test('★★★ a surface keeps its colour while the camera moves', async ({
    page,
  }) => {
    // D-127: the owner watched a wall flip wholesale between two palette
    // entries as they walked toward it. The cause was that the colour index
    // was a stateless nearest-palette match on the lit screen, re-taken every
    // frame - and the city is achromatic, so that match was reading the last
    // digit or two of a grey image. Each surface has an authored colour now
    // (CW-Q96), and the lit screen decides only whether the cell is inked.
    await launchGame(page)
    await enterCity(page)
    // noWaitAfter: the colour flip rebuilds the glyph atlas synchronously,
    // and right after entry - the far bake still running - that handler
    // outlived even the 30 s action budget on CI software (batch 4,
    // measured). The aria-pressed wait below is the real post-condition.
    await page.locator('#cityWalkColourBtn').click({ noWaitAfter: true })
    await expect(page.locator('#cityWalkColourBtn')).toHaveAttribute(
      'aria-pressed',
      'true',
      { timeout: 120000 }
    )
    await page.evaluate(() => {
      window.__cityWalkGame.motionReduced = true
      window.__cityWalkGame.altView.setCellProbe(true)
      window.__cityWalkGame.altView.setFontScale(0.3)
    })
    await settle(page)

    expect(
      await page.evaluate(() => window.__cityWalkGame.altView.inkFamiliesOn()),
      'the game installs an authored table in colour mode'
    ).toBe(true)

    // Walk forward and ask, per class, how many cells changed COLOUR while the
    // class under them did not. That is the owner's defect, exactly.
    const flips = await page.evaluate(async () => {
      const g = window.__cityWalkGame
      const s = g.walkState
      const start = { x: s.x, y: s.y, h: s.headingRad }
      const step = async (d) => {
        s.x = start.x + Math.sin(start.h) * d
        s.y = start.y + Math.cos(start.h) * d
        const eyeZ = 1.7 + (s.groundZ ?? 0)
        g.fpCamera.position.set(s.x, s.y, eyeZ)
        g.fpCamera.lookAt(
          s.x + Math.sin(start.h),
          s.y + Math.cos(start.h),
          eyeZ
        )
        const before = g.altView.getConvertTotals().samples
        g.altView.invalidate()
        const deadline = Date.now() + 15000
        while (g.altView.getConvertTotals().samples <= before) {
          if (Date.now() > deadline) throw new Error('no conversion')
          await new Promise((r) => requestAnimationFrame(r))
        }
        const probe = g.altView.readCellProbe()
        const cls = g.classPass.read(g.fpCamera, probe.cols, probe.rows)
        return {
          colour: Int8Array.from(probe.colour),
          glyphs: Int16Array.from(probe.glyphs),
          cls: Uint8Array.from(cls),
        }
      }
      let held = 0
      let flipped = 0
      let previous = await step(0)
      for (let i = 1; i <= 6; i++) {
        const now = await step(i * 0.8)
        for (let c = 0; c < now.colour.length; c++) {
          // Only cells still looking at the same NAMED surface, and only while
          // they carry ink: a blank cell has no colour to flip, and the sky
          // keeps the screen pick because it has no surface to belong to.
          if (now.cls[c] !== previous.cls[c] || now.cls[c] === 0) continue
          if (now.glyphs[c] === 0 || previous.glyphs[c] === 0) continue
          held++
          if (now.colour[c] !== previous.colour[c]) flipped++
        }
        previous = now
      }
      Object.assign(s, { x: start.x, y: start.y, headingRad: start.h })
      return { held, flipped }
    })

    // The fixture must contain the thing it guards: no held, inked cells at
    // all would report a perfect zero and mean nothing.
    expect(flips.held, 'inked cells whose surface stayed put').toBeGreaterThan(
      5000
    )
    expect(
      flips.flipped,
      `${flips.flipped} of ${flips.held} cells changed colour while their surface did not`
    ).toBe(0)
  })

  test('★★ no surface is ever painted white, which is what CW-71 guards', async ({
    page,
  }) => {
    // CW-71's ink budget gates the white entry on luminance and chroma, and
    // that guard rests on a surface family never being white. This is the same
    // rule checked against the real palette the game installs rather than
    // against the table alone.
    await launchGame(page)
    await enterCity(page)
    // noWaitAfter: the colour flip rebuilds the glyph atlas synchronously,
    // and right after entry - the far bake still running - that handler
    // outlived even the 30 s action budget on CI software (batch 4,
    // measured). The aria-pressed wait below is the real post-condition.
    await page.locator('#cityWalkColourBtn').click({ noWaitAfter: true })
    await expect(page.locator('#cityWalkColourBtn')).toHaveAttribute(
      'aria-pressed',
      'true',
      { timeout: 120000 }
    )
    await page.evaluate(() => {
      window.__cityWalkGame.motionReduced = true
      window.__cityWalkGame.altView.setCellProbe(true)
      window.__cityWalkGame.altView.setFontScale(0.3)
    })
    await settle(page)

    const seen = await page.evaluate(() => {
      const g = window.__cityWalkGame
      const palette = g.altView.getPalette()
      const white = palette.findIndex((h) => h.toLowerCase() === '#ffffff')
      const probe = g.altView.readCellProbe()
      const cls = g.classPass.read(g.fpCamera, probe.cols, probe.rows)
      let classified = 0
      let whiteOnSurface = 0
      for (let i = 0; i < probe.colour.length; i++) {
        if (cls[i] === 0 || probe.glyphs[i] === 0) continue
        classified++
        if (probe.colour[i] === white) whiteOnSurface++
      }
      return { classified, whiteOnSurface, white }
    })
    expect(seen.white).toBeGreaterThanOrEqual(0)
    expect(seen.classified).toBeGreaterThan(2000)
    expect(
      seen.whiteOnSurface,
      `${seen.whiteOnSurface} classified cells took the white entry`
    ).toBe(0)
  })
})
