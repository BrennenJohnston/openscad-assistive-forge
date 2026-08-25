import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import {
  expectOnlyAllowedViolations,
  useCityWalkFixtures,
  launchGame,
  webglAvailable,
  enterCity,
} from './helpers/city-walk.js'

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

    await colourBtn(page).click()
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

    await colourBtn(page).click()
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
    await colourBtn(page).click()
    await colourBtn(page).click()
    expect(await storedChoice(page)).toBe('off')

    await contrastBtn(page).click()
    await expect(page.locator('html')).toHaveAttribute(
      'data-high-contrast',
      'true'
    )
    await expect(colourBtn(page)).toHaveAttribute('aria-pressed', 'false')
    await expect.poll(() => paletteSize(page)).toBeNull()

    // And the other way: colour ON survives high contrast being turned off.
    await colourBtn(page).click()
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
    await expect(help).toContainText(
      'High contrast, theme and color: the three buttons at the top of the screen'
    )

    // The header really does carry all three, in the order the help names.
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
      const apexZ = target.heightM

      let apexVerts = 0
      let above = 0
      g.scene.traverse((o) => {
        if (!o.isMesh || !o.geometry?.getAttribute) return
        const pos = o.geometry.getAttribute('position')
        if (!pos) return
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i)
          const y = pos.getY(i)
          const z = pos.getZ(i)
          if (Math.hypot(x - cx, y - cy) > 12) continue
          if (z > apexZ + 0.05) above++
          if (Math.hypot(x - cx, y - cy) < 1.5 && Math.abs(z - apexZ) < 0.05) {
            apexVerts++
          }
        }
      })
      return { apexZ, apexVerts, above, roofM: target.roof.heightM }
    })

    expect(roof, 'Burnaby grew no pyramidal roof').not.toBeNull()
    // Vertices meet at a point directly over the footprint, at exactly the
    // height the building is tagged with.
    expect(roof.apexVerts).toBeGreaterThan(0)
    // The roof CAPS the body rather than being stacked on a full-height box:
    // nothing at all pokes above the tagged height.
    expect(roof.above, 'something is drawn above the roof apex').toBe(0)
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
    await expect(announcer).toHaveText(/^You are .*, facing [a-z]+\.$/)
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
    await expect(page.locator('#cityWalkAnnouncer')).toHaveText(
      /^You are .*, facing [a-z]+\.$/
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
    // outward, and twenty-five of the old spots landed against a building and
    // were refused: 3,060 became 3,035. The seed did not change and nothing
    // reshuffled - sitters are still exactly 105, because a sitter is placed
    // on a mapped bench at its true position rather than at an offset from a
    // road centreline, so the width could not reach them.
    const stats = await page.evaluate(() => window.__cityWalkGame.props.stats)
    expect(stats.figuresByPose).toEqual({
      sitting: 105,
      standing: 705,
      walking: 1884,
      jogging: 341,
    })
    expect(
      await page.evaluate(() => window.__cityWalkGame.props.peopleCount)
    ).toBe(3035)
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
          timeout: 60_000,
        })
        .toBeLessThan(setup.halfLengthM + 1.0)
      // Then keep pushing on the tail for 40 more OBSERVED frames - the
      // old 4.4 m footprint lets the walker into the bed within a handful,
      // which the watcher records as closest dipping under the tail plane.
      const arrived = await page.evaluate(() => window.__cwPickup.frames)
      await expect
        .poll(() => page.evaluate(() => window.__cwPickup.frames), {
          timeout: 60_000,
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
