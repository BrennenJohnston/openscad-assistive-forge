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

test.describe('ASCII City Walk — trees and parked cars', () => {
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
    // This case waits up to 90 s for 150 rendered frames (the poll says why),
    // so the test's own budget covers that patience: at the default 60 s the
    // case would die in the cleanup line, not the assertion, on a loaded runner
    // that takes about 72 s. The bar is still the frame count; this only makes
    // the waiting possible.
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
      // Waiting on frames, never on the clock: a loaded runner renders them
      // slowly, but each frame still advances the walk by up to the 0.1 s step
      // clamp, so 150 frames is far more travel than the three meters it would
      // take to cross an unsolid car. A runner that renders nothing fails here
      // rather than passing vacuously.
      //
      // The patience is 90 s, not 30. CI renders through SwiftShader, where
      // triangle count is real time, and the street furniture keeps the
      // Chromium runner at about 4.1 fps. The bar is the frame count, which is
      // the invariant; the timeout is only how long we are willing to wait for
      // it, and on a software renderer drawing a furnished city it has to be
      // longer. On a real GPU this takes about 5 s.
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

test.describe('ASCII City Walk — the color toggle', () => {
  const colourBtn = (page) => page.locator('#cityWalkColourBtn')
  const contrastBtn = (page) => page.locator('#cityWalkContrastBtn')
  const announcer = (page) => page.locator('#cityWalkAnnouncer')

  /** The color flip rebuilds the glyph atlas synchronously, and on CI
   * software that handler can outlive even the 30 s action budget: dispatch
   * without waiting, then wait on the pressed state actually flipping, which
   * is the real post-condition. */
  const clickColour = async (page) => {
    const before = await colourBtn(page).getAttribute('aria-pressed')
    // force: even the dispatch's actionability checks starve when the
    // PREVIOUS flip's synchronous atlas rebuild stalls the thread (batch
    // 6, measured at 30 s on Edge). The aria wait below is the claim.
    await colourBtn(page).click({ force: true, noWaitAfter: true })
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

    // Nothing stored: high contrast off means a single phosphor.
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
    // The point of the toggle: color without high contrast.
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

    // Choose monochrome, then turn high contrast on: the city stays a single
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
    // The row's count is not fixed (Fireworks joins it), so the sentence
    // names the joiner and its condition instead of counting.
    await expect(help).toContainText(
      'High contrast, theme and color: buttons at the top of the screen, ' +
        'with Fireworks joining them once you have found every landmark'
    )

    // And the header really is what that sentence says it is: the three
    // toggles lead the row, in the order the help names them. The row has six
    // children (Fireworks, Help and Exit follow the three toggles), so the
    // check is on the leading slice. A Fireworks button leaking in early is
    // guarded where it can actually be exercised: 'finishing a city plays the
    // show, once, and leaves a button' in ascii-city-walk.spec.js drives a real
    // city from unfound to found. Repeating a toBeHidden() here would be
    // vacuous: this case never enters a city, and the button is created hidden.
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

    // Deliberately scan with a hovered primary button: a hover state is
    // invisible to a scan unless something happens to be hovering, and the
    // mono variant's primary-hover pair needs this scan to be measured.
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
 * The composite paint path is the paint path, at every character size, and
 * it reaches the main app's Alt View as well as the game. That is only
 * allowed because it paints the same pixels the per-cell blit path does,
 * so this suite owns the proof, not a one-off bench script.
 *
 * The reference here is written out by hand rather than taken from the module,
 * so the test cannot pass by comparing the code against itself.
 */
test.describe('ASCII City Walk — composite paint parity', () => {
  /** Sizes that straddle the old per-cell gate (charW 4 and below was
   * composited). */
  const SIZES = [
    { fontSizePx: 3, charW: 2, charH: 4 }, // the game's 10% floor
    { fontSizePx: 7, charW: 4, charH: 9 }, // the old gate's edge
    { fontSizePx: 10, charW: 5, charH: 12 }, // the 50% size
    { fontSizePx: 12, charW: 6, charH: 15 }, // the slowest size for the per-cell path
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

      // The first getImageData on a 2D canvas reads back from a GPU-backed
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
 * The signals are the only thing in this deliberately time-frozen city
 * that moves, so they are also the only thing that can move when it should
 * not — and the only thing that can stop looking like a signal when it stops.
 */
test.describe('ASCII City Walk — traffic signals', () => {
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
    // Wait for the signals to change rather than for eight seconds to pass.
    // The signals are advanced by the frame loop, so a fixed sleep asserts
    // that the runner rendered enough frames in eight seconds, which on a
    // loaded CI machine is not a fact about the signals at all.
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
 * Photo mode. The picture a player sees is the overlay canvas, so a
 * photo is that canvas composed onto black — not a second render path and not
 * a screenshot of the page.
 */
test.describe('ASCII City Walk — photo mode', () => {
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
 * A reason to wander. The HUD counts the landmarks this session has
 * walked past and the legend marks them off.
 */
test.describe('ASCII City Walk — landmark tracker', () => {
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
 * The weather belongs to the street.
 *
 * Seen from the overhead map the drops streak diagonally across the whole
 * picture and read as scratches on the screen rather than as rain.
 */
test.describe('ASCII City Walk — rain stays in the street', () => {
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
 * The thunder swell is driven frame by frame and only lands back on zero
 * when a frame arrives to bring it down. Both ways out of the rain skip
 * those frames (stopping the rain, and reduced motion turning on), so a
 * swell caught halfway through must still be let go, or the whole city
 * sits under a lifted ambient light until something unrelated resets it.
 *
 * The swell is a third of a second long, which is not a window a test can
 * aim at by hand. These cases lengthen it (the timing object is read fresh
 * every frame) and then take the two exits deliberately: the behavior is
 * about the exit, not about the swell's length.
 */
test.describe('ASCII City Walk — the thunder lets go', () => {
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
        // The media-change handler lands on a frame, and CI software's frames
        // are seconds apart.
        timeout: 60000,
      })
      .toBeCloseTo(base, 6)
  })
})

/**
 * Rain is motion, and G refuses to start it while reduced motion is on.
 * Rain already falling must stop too: otherwise the frames that move the
 * drops stop arriving, the shower freezes in mid-air as a field of static
 * diagonal streaks, and the Rain button sits on in a toolbar where it no
 * longer does anything.
 */
test.describe('ASCII City Walk — reduced motion ends the shower', () => {
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
 * The cities carry building:part volumes and pitched roofs, and both
 * have to survive all the way into the rendered scene — not merely into the
 * parsed model.
 */
test.describe('ASCII City Walk — real silhouettes', () => {
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
      // The building stands on its centroid's ground.
      const groundZ = g.surface?.terrain
        ? g.surface.terrain.heightAt(cx, cy)
        : 0
      const apexZ = target.heightM + groundZ

      let apexVerts = 0
      let above = 0
      let aboveEaves = 0
      g.scene.traverse((o) => {
        if (!o.isMesh || !o.geometry?.getAttribute) return
        // The buildings, and only the buildings. This case asks whether a
        // pitched roof caps its body or is stacked on a full-height box, a
        // question about one mesh, so it reads the `buildings` mesh alone: a
        // sweep of every mesh within 12 m finds a crow on a lamp head 6.8 m
        // from this house, at z 6.32 against the house's 6.00 m apex. A guard
        // that a bird can fail is not measuring a roof.
        if (o.name !== 'buildings') return
        const pos = o.geometry.getAttribute('position')
        if (!pos) return
        // The sweep is scoped to this building's own footprint (a ray-cast
        // against its outer ring, with a 0.3 m margin). On hills a disc around
        // the house takes in a neighbor's ground a meter higher, and its wall
        // vertices rise above this house's apex: a guard a neighbor can fail is
        // not measuring a roof.
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
 * The HUD knows where you are, and X says it out loud.
 */
test.describe('ASCII City Walk — where you are', () => {
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
      window.__announcerWrites = 0
      const el = document.querySelector('#cityWalkAnnouncer')
      // announceInLayer deliberately clears the region and sets it again on
      // the next frame, so a screen reader re-reads identical text. That is
      // TWO mutations for ONE announcement - count only the ones that put
      // words in, or this asserts the implementation instead of the promise.
      new MutationObserver(() => {
        if ((el.textContent ?? '').trim() !== '') window.__announcerWrites++
      }).observe(el, { childList: true, characterData: true, subtree: true })
    })

    await page.keyboard.press('x')
    /**
     * The where-sentence carries an appended warmer/colder clause while the
     * traveler is unfound, so an anchored `$` right after "facing north." does
     * not match.
     *
     * The anchor stays. What this case guards is that the where-sentence is
     * whole and well formed, so it still requires exactly that, and allows at
     * most one further sentence after it: the clause is appended to whichever
     * clause is true, never substituted for it. A player must never lose the
     * street name to the hint, and this is where that is enforced.
     */
    await expect(announcer).toHaveText(
      /^You are .*, facing [a-z]+\.(?: [A-Z][^.]*\.)?$/
    )
    const said = await announcer.textContent()
    await page.waitForTimeout(400)
    expect(await page.evaluate(() => window.__announcerWrites)).toBe(1)

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
    // Every key also has a button, and the button says
    // which key it is.
    await expect(btn).toHaveAttribute('title', /X/)
    await btn.click()
    // Same shape as the X case above, for the same reason.
    await expect(page.locator('#cityWalkAnnouncer')).toHaveText(
      /^You are .*, facing [a-z]+\.(?: [A-Z][^.]*\.)?$/
    )
  })

  test('the HUD stays one line at 1280 with the longest real names', async ({
    page,
  }) => {
    test.setTimeout(90000)
    await page.setViewportSize({ width: 1280, height: 800 })
    await launchGame(page)
    await enterCity(page, 'Denver, Colorado')
    await stepOnce(page)

    // Denver carries the longest landmark name in the four extracts, so it is
    // the one that would wrap this line.
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

test.describe('ASCII City Walk — people are people', () => {
  test('the Seattle census is exact, varied, and deterministic', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)

    // Hash-seeded placement against a versioned extract: these numbers are
    // facts until the next rebake, never noise, and the mix ratios are
    // one-line-reversible choices.
    //
    // When they move, find the cause before re-pinning; the seed does not
    // change between builds. Things that legitimately move them:
    //   - road widths (people stand at an offset from a road's centerline,
    //     and a spot that lands against a building is refused);
    //   - in-road refusals (a person 1.1 m outside their road's kerb can be
    //     the middle of the road that crosses it at a junction; a mapped bench
    //     inside a drawn roadway keeps its position but gets no sitter);
    //   - the collision grid (a `building=roof` is a slab overhead, not a
    //     solid from the pavement);
    //   - LAMP_ROAD_KINDS in city-scene.js, which gates `peopleRng` as well as
    //     `lampRng`: changing what it holds changes the population.
    // Run the builders on the old and new inputs, one cause at a time, and
    // the deltas should add up to the person. Sitters sit on mapped benches
    // at their true position, so road widths cannot reach them.
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
     * The traveler is a person in the world but not in this census, by
     * decision.
     *
     * The traveler is built standalone, beside the fireworks, because the city
     * group is built before the saved progress is read and because finding
     * them moves them. So they never pass through buildStreetProps, and
     * peopleCount, which counts what the city build planted, does not include
     * them.
     *
     * Asserted rather than assumed, both halves: the crowd did not gain
     * anybody, and the traveler exists all the same. A silent +1 here would
     * mean the traveler had been planted into a road's rng stream, which would
     * shift the pose and build of every figure planted after them, so this
     * pin is also how that mistake would surface.
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

  test('every zone of a figure carries a scheme color', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)

    // Read the tints the scene actually painted, not the pixels they end up
    // as. A pixel test cannot tell a scheme hue from a monochrome phosphor
    // (both are far from gray), and a sample box wide enough to cover a head
    // also catches its colored neighbors. The vertex colors have no such
    // ambiguity.
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
        // The single flat tone a head must not fall back to, to six decimals.
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

test.describe('ASCII City Walk — cars are cars', () => {
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
    // The six chosen classes and nothing else: 5.8/5.0/4.6/4.9/4.4/5.2 m.
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

    // Stand off the pickup's tail (the part a 4.4 m footprint would not
    // cover), facing it, and watch the approach in the pickup's own frame per
    // frame, the parked-car pattern above: an end-state distance check is not
    // slide-proof, since CI's dt-clamped frames cover ~6x the ground of a live
    // GPU's and can slide around the corner and away.
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
      // Arrival is a condition, not a frame quota. A dt-clamped software runner
      // covers the 2.5 m in ~17 frames where a 60 fps GPU needs ~100, and a
      // slow Edge runner paints about 130 frames in 90 s, so a fixed
      // frames-versus-clock gate starves there while proving nothing the
      // arrival itself does not.
      await expect
        .poll(() => page.evaluate(() => window.__cwPickup.closest), {
          timeout: 180_000,
        })
        .toBeLessThan(setup.halfLengthM + 1.0)
      // Then keep pushing on the tail for 40 more observed frames: a 4.4 m
      // footprint would let the walker into the bed within a handful, which the
      // watcher records as closest dipping under the tail plane. At CI
      // software's ~2 s per frame, 40 frames need about 80 s.
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
 * The streets are true to scale and the kerb is a real step. The eye
 * has to follow the ground under it, and the kerb must never be an obstacle.
 */
test.describe('ASCII City Walk — the kerb', () => {
  test('the eye follows the ground across a kerb, and the kerb never blocks', async ({
    page,
  }) => {
    // The crossing runs ~5-8 m at CI software's ~0.23 m/s, and the entry
    // itself costs tens of seconds there: the budget and the poll bound below
    // both follow that measured pace.
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
          // Everything here is decided from the road's own geometry, never from
          // the surface grid, so the setup does not depend on the thing under
          // test, and a failure is a camera that never moved rather than a
          // missing property.
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
          // The surface grid is the thing under test, so it is read here for
          // the record but never used to choose the spot.
          if (g.surface) s.groundZ = g.surface.heightAt(mx, my)
          g.altView.invalidate()
          return {
            x: mx,
            y: my,
            needM,
            startGroundZ: s.groundZ ?? null,
            // The roadway question by name: under terrain the roadway's
            // absolute height is the hill's, not a negative.
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
        // A frame before the walk begins is not a stall. This watcher is
        // installed a full round trip before the keypress, and on a slow runner
        // that gap is one or more frames (a 300 ms wait here counts five of
        // them). What the case is about is a walker who was moving and then
        // stopped, which is the only thing a kerb that blocks could look like.
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
      // Arrival is a condition, not a frame quota: the walker is done when they
      // have crossed clear of the roadway, however many frames that took on
      // this runner. Measured as distance from the start, which is a fact about
      // the walk rather than about the surface grid.
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
      // Then a few more observed frames, so the climb finishes on screen
      // (twelve frames at CI software's ~2 s per frame need more than 30 s).
      const from = await page.evaluate(() => window.__cwKerb.camZ.length)
      await expect
        .poll(() => page.evaluate(() => window.__cwKerb.camZ.length), {
          timeout: 120_000,
        })
        .toBeGreaterThan(from + 12)
    } finally {
      // The watcher stops before the key is let go, never after. Releasing
      // first leaves a full round trip in which the walker stands still because
      // nothing is asking it to move, and every frame of that gap would count
      // as a stall (twelve of them under a 6x CPU throttle with the release
      // first, none with the stop first). On a fast machine the gap is under
      // one frame, so the order only shows on a slow runner.
      await page.evaluate(() => {
        window.__cwKerb.stop = true
        cancelAnimationFrame(window.__cwKerbTick)
      })
      await page.keyboard.up('ArrowUp')
    }

    const watch = await page.evaluate(() => window.__cwKerb)
    const lo = Math.min(...watch.camZ)
    const hi = Math.max(...watch.camZ)

    // It climbed a whole kerb, and the climb showed on the camera: an eye at a
    // constant 1.7 m whatever it stands on would read lo and hi as the same
    // number.
    expect(hi - lo, `camera rose from ${lo} to ${hi}`).toBeGreaterThan(0.1)
    // It never stopped: a kerb is drawn and felt, but it is not an obstacle.
    // That half is not negotiable.
    //
    // The stall count only means anything once the walk has begun, so the
    // fact that it began is asserted first - a walker who never moved would
    // otherwise report zero stalls and pass while measuring nothing.
    expect(watch.started, 'the walker never moved at all').toBe(true)
    expect(watch.stalls).toBe(0)
    // And it eased rather than jumping: a single frame carrying the whole kerb
    // is the step-jolt the ease exists to avoid.
    let worstJump = 0
    for (let i = 1; i < watch.camZ.length; i++) {
      worstJump = Math.max(worstJump, Math.abs(watch.camZ[i] - watch.camZ[i - 1]))
    }
    expect(worstJump, `biggest single-frame rise ${worstJump}`).toBeLessThan(
      hi - lo
    )
    // And the walk really did start down in the roadway rather than already up
    // on a pavement, which is what makes the climb above a kerb. Asked by
    // name: on hills the roadway's absolute height is the hill's (+79 m here),
    // so a height threshold cannot tell roadway from pavement.
    expect(setup.startsOnPavement).toBe(false)
  })
})

/**
 * Lit surfaces must not flash while you move, the "fractured flashes" a
 * screenshot cannot show. A second, tiny render tells the converter what
 * each character cell is looking at, and that answer picks the cell's
 * glyph vocabulary. If that render dressed every mesh in a flat id
 * material without the mesh's polygon offset, deliberately coplanar
 * surfaces (a storefront strip on its wall) would be coplanar again in the
 * id buffer, and their winner would be re-rolled by any view change at
 * all.
 *
 * A cell that changes class once has swept across an edge. A cell that
 * changes again and again over a series of sub-cell turns is watching two
 * surfaces fight, and only the second is a defect, which is why this
 * counts repeats rather than changes.
 */
test.describe('ASCII City Walk — the surface map holds still', () => {
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

    // The signature, rather than a magnitude. How badly two coplanar surfaces
    // fight depends on the rasterizer's depth precision: unfixed, this pair is
    // 57% of every transition under CI's software renderer and 97% on a real
    // GPU; fixed, 9% and 0.3% of a much smaller total. A share is the
    // assertion that holds on both.
    const share = result.wallFront / result.transitions
    expect(
      share,
      `storefront/wall was ${result.wallFront} of ${result.transitions} ` +
        `surface changes; the three biggest were ` +
        `${result.top.map(([k, v]) => `${k}=${v}`).join(' ')}`
    ).toBeLessThan(0.25)
  })

  test('the ground plane is filtered for the angle it is seen at', async ({
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

test.describe('ASCII City Walk — the converter remembers the last frame', () => {
  /**
   * Convert N frames along a small step and count how many cells changed
   * their glyph between consecutive frames.
   *
   * The step is deliberately tiny (two centimeters) because the claim is
   * about a cell whose content barely moved. Everything else is held still:
   * the world's own clock is stopped first, so the only thing that differs
   * between two frames is the pose this sets.
   *
   * Several short creeps from places a few meters apart, pooled, rather
   * than one longer creep: the memory has a hold expiry, so a longer creep
   * lets more holds run out and reports a weaker lever (ten steps instead of
   * four moved the reading from 79.1 % to 92.2 %). Frame count is part of
   * the physics this case is about, not a precision knob, so the sample is
   * made wider instead: every creep is the identical experiment on a
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
      // The memory's population, counted separately. The memory holds a cell's
      // character; it does not decide whether a cell has one, so a cell going
      // blank or coming back is not a re-roll it was ever asked to prevent.
      let litChanges = 0
      // Anchored cells take their glyph from the surface and are deliberately
      // never held: holding one past the moment its lattice square slid would
      // be a trail. So they change identically with the memory on and off, and
      // counting them would dilute the share until it looked like a regression
      // in the memory. Tree cells are left out for a similar reason: a
      // leaf-cube edge under a 2 cm creep re-rolls because the geometry slid
      // across the cell, which is the anchoring question (trees are unanchored
      // by design), not the hold question, and the memory deliberately drops a
      // cell whose content moves under it.
      //
      // The bar stays where it is; what is narrowed is which cells the question
      // is asked about, the ones the memory still governs. Anchored and tree
      // numbers are counted beside the pool and logged, so the dilution stays
      // visible. Re-pinning the bar to match a result would leave it worth
      // nothing.
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
            // see the note above.
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
   * The margin matters, and it is not a taste. With the hold disabled in
   * the shader the memory prevents one glyph change out of 61,440
   * cell-frames, and a bare "fewer than" assertion passes on 930 against
   * 931. A lever that does nothing must fail this, so the bar is a share.
   *
   * The share is the fraction of the stateless re-rolls that survive with
   * the memory on (measured per path, at 30 %, at
   * the downtown pose). It depends on the memory's settings (a band of 0.06
   * and a hold of 5 frames, chosen to keep motion free of trails) and on how
   * many real edges the city puts in the frame, since the memory
   * deliberately drops a cell whose surface class moves under it. 0.8 fails
   * the do-nothing lever by a mile (it measures 99.9 per cent) while the
   * shipped lever passes with room for warm-up. The share is logged on
   * every run, so a reader sees the number without making the case fail.
   */
  const MUST_PREVENT = 0.8

  test('a cell whose content barely moved keeps the glyph it had', async ({
    page,
  }) => {
    // This instrument takes 128 real conversions (4 runs x 8 creeps x 4
    // steps), and a software-GL renderer takes seconds per conversion on the
    // full city, so the default test budget would cut the evaluate off
    // mid-sample. The per-step liveness deadline inside convert() (15 s) still
    // catches a genuinely stuck converter; this is time to measure, not
    // permission to hang.
    test.setTimeout(360000)
    await launchGame(page)
    await enterCity(page)
    await page.evaluate(() => {
      window.__cityWalkGame.motionReduced = true
      window.__cityWalkGame.altView.setCellProbe(true)
    })

    // The measurement scene is pinned. The bar was calibrated on a downtown
    // pose, and the share depends on the city under the creep: a different
    // spawn changes the reading with the converter unchanged. A guard must not
    // measure more than it means, and this one never meant "wherever the
    // spawn happens to be", so the creep runs at the pinned downtown pose,
    // whatever a later release does to spawns: (-17.26, 14.48) facing 315
    // degrees, findClearHeading over the props-stamped grid, derived offline
    // rather than guessed.
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

    // Both converter paths, in one session. Which one a browser takes is not
    // this test's to choose (CI renders in software and may land on either),
    // and the two carry the rules separately: the GPU path evaluates them in
    // its shader against the previous render target, the CPU path in
    // _hfm-hysteresis.js. Disabling either one alone leaves the other path
    // passing, so the case runs both.
    for (const cpuSample of [false, true]) {
      await page.evaluate(
        (cpu) => window.__cityWalkGame.altView.setBenchLegacy({ cpuSample: cpu }),
        cpuSample
      )
      // Eight creep places, not four: never lengthen the creep (frame count is
      // part of the physics), make the sample wider. With trees as real
      // structure, a four-place pool at this corner comes down to ~1,300
      // events, and the two converter paths flap either side of the bar on ~56
      // cells of pick noise.
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
      // Both numbers are logged, because the difference between them is what
      // the lit-cell scope removes, and a reader of this line should see it.
      console.log(
        `[glyph memory] ${path}: GOVERNED (unanchored, lit, non-tree) ` +
          `${withMemory.governedChanges} of ${without.governedChanges} ` +
          `stateless re-rolls survive = ` +
          `${((withMemory.governedChanges / without.governedChanges) * 100).toFixed(1)} % ` +
          `(bar < ${MUST_PREVENT * 100} %) over ${withMemory.governedCells} ` +
          `governed cell-frames; TREE cells counted apart: ` +
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
      // Scoped to lit cells, with the bar unchanged at 0.8. The memory holds a
      // cell's character; it does not decide whether a cell has one (a blank
      // answer is taken at once, in both paths), so a cell going blank or
      // coming back is not a re-roll this guard asks it to prevent. A guard
      // must not measure more than it means, and re-pinning the bar to match a
      // result would leave it worth nothing.
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

test.describe('ASCII City Walk — the solid bright layer, three ways', () => {
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

  test('the game draws capped solid cells, off draws none, stock draws most', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)
    await page.evaluate(() => {
      window.__cityWalkGame.motionReduced = true
      window.__cityWalkGame.altView.setCellProbe(true)
    })

    // What the game draws by default, chosen after playing it in motion:
    // `off` looks fine in stills and sad in motion.
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
    // What this pose cannot show, said out loud. `calm` differs from `stock`
    // only through its share cap, and a cap that is never exceeded is
    // indistinguishable from no cap. At this pose the solid share sits under
    // the 1 % cap, so calm and stock paint about the same count, and an
    // ordering assertion between them would measure frame noise. The cap's
    // effect is measured where it engages (the shopfront pose: 2,936 solid on
    // stock against 2,261 on calm) and pinned by the unit tests over
    // nextReverseLift, which need no GPU at all.

    // ...and back, so the switch is a switch and not a one-way door.
    //
    // Not the same count, and that is a property rather than a wobble: `calm`
    // carries a share cap whose lift settles over about five frames, so a
    // reading taken immediately after switching back is mid-settle by
    // construction. What has to be true is that the layer came back at all,
    // and still capped.
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

    // A name nobody knows must land on the shipped treatment, not on whatever
    // was set last: this switch is reachable from a script, and a typo in one
    // would otherwise quietly measure the previous run. It is asserted
    // against the default rather than a hard-coded name, so it stays true when
    // the default changes.
    await page.evaluate(() =>
      window.__cityWalkGame.setLuminanceLayer('brighter please')
    )
    expect(await read()).toEqual({ mode: 'calm', reverseAt: 0.8, cap: 0.01 })
  })
})

test.describe('ASCII City Walk — Day and Night', () => {
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

  test('the backing changes no glyph the converter chose', async ({
    page,
  }) => {
    // The whole layer rests on this. The backing is computed at PAINT time,
    // after every glyph is already picked, so it cannot reach the decision -
    // and that is a claim about the ORDER of the code, which is exactly the
    // kind of claim that quietly stops being true. Same pose, same frame,
    // Night then Day: the grids must match cell for cell.
    //
    // Red proof, by hand: let buildBacking write into the glyph array it is
    // handed, and this case names the first cell that moved.
    await launchGame(page)
    await enterCity(page)
    const configuredHysteresis = await page.evaluate(() =>
      window.__cityWalkGame.altView.getTemporalHysteresis()
    )
    await page.evaluate(() => {
      window.__cityWalkGame.motionReduced = true
      window.__cityWalkGame.altView.setCellProbe(true)
      window.__cityWalkGame.altView.setFontScale(0.3)
      // The converter's memory holds a glyph for five converted frames and then
      // lets it go, so two captures taken at different points in that cycle
      // differ by thousands of cells whatever else is true (with the memory on,
      // frames 1 and 2 after a toggle match and frame 3 moves 4,237 of 73,600;
      // with it off every frame matches). So it comes off for the measurement
      // and goes back after. This case asks whether the backing moves a
      // decision, and the memory's own clock is not an answer.
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

    // The same-code control first: two conversions of an unchanged scene,
    // nothing toggled. Whatever this reads is what a comparison in this
    // harness costs (before the scene settles it can be thousands of glyphs),
    // and the real measurement is only meaningful against it.
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

  test('Day paints a backing, and Night paints none', async ({ page }) => {
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
    // The claim is that Day paints a backing and Night paints none, and the
    // sibling case proves the backing changes no glyph, so with the pose
    // frozen, the pixels painted at day and black at night are the backing,
    // measured directly. A ratio of total painted pixels would entangle the
    // backing with the night city's own ink density, which moves with every
    // release and every rasterizer.
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

  test('B and the toolbar button agree, and the choice is remembered', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)
    const btn = page.locator('#cityWalkDaylightBtn')
    await expect(btn).toHaveAttribute('aria-pressed', 'false')

    await page.keyboard.press('KeyB')
    await expect(btn).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('#cityWalkAnnouncer')).toContainText('Day')

    // The button is the same action, not a second one: every key has a
    // button, and a button that disagreed with its key would be two features
    // wearing one name. force: the day flip's repaint from the KeyB above can
    // still be mid-frame on software rendering, starving the click's
    // actionability checks; the aria wait below is the claim.
    await btn.click({ force: true, noWaitAfter: true })
    await expect(btn).toHaveAttribute('aria-pressed', 'false', {
      timeout: 60000,
    })
    expect(
      await page.evaluate(() =>
        localStorage.getItem('openscad-forge-city-walk-daylight')
      )
    ).toBe('night')

    await page.keyboard.press('KeyB')
    // Leave the city the way a player does, rather than bouncing the tab
    // through about:blank: in Firefox the bounce races with a navigation of
    // its own ('Navigation to about:blank is interrupted by another navigation
    // to about:blank'). Escape closes the layer, and a same-URL navigation is
    // only a problem from inside the open layer. This is also the truer test,
    // because it is what a player actually does.
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

  test('an empty city takes the obstacles out with the people', async ({
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

    // What "nobody is in the way" can honestly mean. The collision grid is
    // 1 m and `blockRect` blocks every cell a rect touches, so somebody
    // standing beside a tree shares the tree's blocked cell, and that cell
    // stays blocked when they leave, correctly, because the tree is still
    // there. On Seattle: 7,359 population footprints, 7,315 freed, and every
    // one of the 44 survivors within a cell and a half of a bench, a basket,
    // a hydrant or a tree. So the claim is not "zero blocked": it is that
    // nothing stays blocked because of the population, and the survivors are
    // named rather than tolerated.
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

test.describe('ASCII City Walk — glyphs anchored to the surface', () => {
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

  test('it is on, and it runs on the GPU path', async ({ page }) => {
    // Anchoring is on and the converter is still on the GPU: the shader reads
    // the field byte out of the class texture's own green channel and indexes
    // the ladder itself. The two halves are one claim. Either alone would be
    // worthless: a build that turned anchoring on and quietly fell back to
    // the CPU (59.6 fps to 29.6) would pass "it is on" while giving every
    // player half the frame rate.
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

  test('it moves the ground and the facade, and nothing else', async ({
    page,
  }) => {
    // Anchoring covers the dithered surfaces and the facade, and the classes
    // outside that set must not move.
    await enter(page)
    // Hold the path constant, or this measures two changes at once. Both sides
    // are on the GPU by default; this line says so rather than assuming it.
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
      'the facade is anchored and must move'
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

  test('an anchored surface holds perfectly still while the walker does', async ({
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

test.describe('ASCII City Walk — ink belongs to its surface', () => {
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
    // A guard's fixture must contain the thing it guards: zero illegal
    // characters out of zero classified cells proves nothing.
    expect(res.classified).toBeGreaterThan(2000)
    expect(res.classesSeen).toBeGreaterThan(3)
    // And the picture must be drawing a real range of characters, not one
    // character everywhere - which would satisfy any subset test.
    expect(res.richest).toBeGreaterThan(3)
  }

  test('in color every classified cell draws its own surface\'s character', async ({
    page,
  }) => {
    // The defect, as a number. In color every classified cell must search its
    // own class vocabulary, not the full 95-glyph atlas: with the full atlas a
    // tree canopy and a building facade are drawn with the same alphabet, and
    // a window pattern lands on a tree's underside (69 % of the grid, unfixed).
    //
    // Color is reached by clicking the button, which is how a player reaches
    // it: that path must also set the GPU path's reverse-video threshold for
    // color, or bright cells are matched against an inverted vector and draw
    // from the whole atlas. Setting the mode before the page loads does not
    // show that, so do not "simplify" this into a localStorage seed.
    await enter(page)
    // noWaitAfter: the flip's synchronous atlas rebuild can outlive the
    // action budget on CI software; the aria wait below is the real
    // post-condition (batch 5).
    await page.locator('#cityWalkColourBtn').click({ force: true, noWaitAfter: true })
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

  test('and the two converter paths agree about it, in both modes', async ({
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

    await page.locator('#cityWalkColourBtn').click({ force: true, noWaitAfter: true })
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

test.describe('ASCII City Walk — color belongs to its surface', () => {
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

  test('a surface keeps its color while the camera moves', async ({
    page,
  }) => {
    // A wall must not flip wholesale between two palette entries as the player
    // walks toward it. A stateless nearest-palette match on the lit screen,
    // re-taken every frame, would do that: the city is achromatic, so the
    // match reads the last digit or two of a gray image. Each surface has an
    // authored color, and the lit screen decides only whether the cell is
    // inked.
    await launchGame(page)
    await enterCity(page)
    // noWaitAfter: the colour flip rebuilds the glyph atlas synchronously,
    // and right after entry - the far bake still running - that handler
    // outlived even the 30 s action budget on CI software (batch 4,
    // measured). The aria-pressed wait below is the real post-condition.
    await page.locator('#cityWalkColourBtn').click({ force: true, noWaitAfter: true })
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

    // Walk forward and ask, per class, how many cells changed color while the
    // class under them did not. That is the defect, exactly.
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

  test('no surface is ever painted white, which is what the ink budget guards', async ({
    page,
  }) => {
    // The ink budget gates the white entry on luminance and chroma, and
    // that guard rests on a surface family never being white. This is the same
    // rule checked against the real palette the game installs rather than
    // against the table alone.
    await launchGame(page)
    await enterCity(page)
    // noWaitAfter: the colour flip rebuilds the glyph atlas synchronously,
    // and right after entry - the far bake still running - that handler
    // outlived even the 30 s action budget on CI software (batch 4,
    // measured). The aria-pressed wait below is the real post-condition.
    await page.locator('#cityWalkColourBtn').click({ force: true, noWaitAfter: true })
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
