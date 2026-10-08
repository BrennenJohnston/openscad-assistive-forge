import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import {
  expectOnlyAllowedViolations,
  useCityWalkFixtures,
  launchGame,
  hudHeading,
  enterCity,
} from './helpers/city-walk.js'

useCityWalkFixtures()

/**
 * ASCII City Walk: the hidden game behind the Alt View unlock - getting
 * in, moving about, and the controls that ride along with you.
 *
 * The game never touches the WASM engine - the welcome card, layer, and
 * three.js scene are all independent of it - so nothing here waits for
 * data-wasm-ready.
 *
 * Two sibling suites carry the rest: ascii-city-walk-controls.spec.js (the
 * pointer and keyboard surfaces) and ascii-city-walk-street.spec.js (what the
 * city itself does). They were split for the reason written up in
 * helpers/city-walk.js.
 */

test.describe('ASCII City Walk — gating', () => {
  test('the card does not exist for anyone without the unlock', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(page.locator('#welcomeScreen')).toBeVisible({
      timeout: 30000,
    })
    // hidden attribute -> display:none -> absent from the accessibility tree
    await expect(page.locator('#cityWalkCard')).toBeHidden()
    await expect(page.locator('#cityWalkLaunchBtn')).toBeHidden()
  })

  test('the unlock reveals the card alongside the other gated UI', async ({
    page,
  }) => {
    await page.goto('/?hfm=unlock')
    await expect(page.locator('#cityWalkCard')).toBeVisible({
      timeout: 30000,
    })
    await expect(
      page.locator('#cityWalkCard .role-path-title')
    ).toHaveText('ASCII City Walk')
  })
})

/**
 * The game is desktop-only, on the same viewport predicate as Classic.
 * Entry is what gates: a session already running survives any resize, and
 * Escape always leaves.
 *
 * Nothing here enters a city, so every case runs on every browser - no WebGL
 * capability gate needed.
 */
test.describe('ASCII City Walk — desktop-only gate', () => {
  const REASON_TEXT =
    'Desktop only for now. The city walk needs a wide landscape window. ' +
    'Try it on a computer, or widen this window.'

  test.describe('phone-shaped viewport', () => {
    // Plain viewport, set through test.use: isMobile is rejected by Firefox at
    // context creation, and a setViewportSize after load re-opens drawers.
    test.use({ viewport: { width: 390, height: 844 } })

    test('the launch button is gated, says why, and refuses to start the game', async ({
      page,
    }) => {
      await page.goto('/?hfm=unlock')
      await expect(page.locator('#cityWalkCard')).toBeVisible({
        timeout: 30000,
      })

      const btn = page.locator('#cityWalkLaunchBtn')
      await expect(btn).toHaveAttribute('aria-disabled', 'true')
      await expect(btn).toHaveAttribute(
        'aria-describedby',
        'cityWalkGateReason'
      )

      // On the card, not sr-only: a phone has no hover tooltip, so the reason
      // has to be readable by a sighted player too.
      const reason = page.locator('#cityWalkGateReason')
      await expect(reason).toBeVisible()
      expect((await reason.textContent()).replace(/\s+/g, ' ').trim()).toBe(
        REASON_TEXT
      )

      // Keyboard first: Playwright refuses .click() on aria-disabled elements,
      // and the keyboard is the path that matters anyway.
      await btn.focus()
      await page.keyboard.press('Enter')
      await expect(page.locator('#srAnnouncer')).toContainText(
        'ASCII City Walk unavailable',
        { timeout: 3000 }
      )
      await expect(page.locator('#cityWalkLayer')).toBeHidden()

      // A real mouse press is refused too. force: skips the actionability
      // check that would stop the click before the listener ever sees it.
      await btn.click({ force: true })
      await expect(page.locator('#cityWalkLayer')).toBeHidden()
    })

    test('axe: the gated card has no violations', async ({ page }) => {
      await page.goto('/?hfm=unlock')
      await expect(page.locator('#cityWalkCard')).toBeVisible({
        timeout: 30000,
      })
      await expect(page.locator('#cityWalkLaunchBtn')).toHaveAttribute(
        'aria-disabled',
        'true'
      )

      // Scanned with the gated button hovered: a hover state is invisible to a
      // scan unless something happens to be hovering.
      await page.locator('#cityWalkLaunchBtn').hover()

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .include('#cityWalkCard')
        .analyze()
      expectOnlyAllowedViolations(results)
    })

    /**
     * The gated button dims, so its label/surface pair is a composite over the
     * card: the token guards in tests/unit/color-contrast.test.js cannot see
     * it, and axe skips contrast checks on aria-disabled controls. A gated
     * hover background pinned to --color-accent measures 1:1 in the mono
     * variant, whose rule flips a primary label to the accent at a higher
     * specificity: amber on amber. Same shape as the hover-contrast guard in
     * accessibility.spec.js, plus the opacity.
     */
    test('the gated label stays legible at rest and hovered, in every theme', async ({
      page,
    }) => {
      const THEMES = [
        ['Forge light', { theme: 'light' }],
        ['Forge dark', { theme: 'dark' }],
        ['High contrast light', { theme: 'light', hc: true }],
        ['High contrast dark', { theme: 'dark', hc: true }],
        ['Mono light', { theme: 'light', variant: 'mono' }],
        ['Mono dark', { theme: 'dark', variant: 'mono' }],
      ]

      await page.goto('/?hfm=unlock')
      await expect(page.locator('#cityWalkCard')).toBeVisible({
        timeout: 30000,
      })
      const btn = page.locator('#cityWalkLaunchBtn')
      await expect(btn).toHaveAttribute('aria-disabled', 'true')

      for (const [label, cfg] of THEMES) {
        await page.evaluate((c) => {
          const r = document.documentElement
          r.dataset.theme = c.theme
          if (c.hc) r.dataset.highContrast = 'true'
          else delete r.dataset.highContrast
          if (c.variant) r.dataset.uiVariant = c.variant
          else delete r.dataset.uiVariant
        }, cfg)
        await page.waitForTimeout(300)

        for (const state of ['rest', 'hovered']) {
          if (state === 'hovered') await btn.hover()
          else await page.mouse.move(0, 0)
          await page.waitForTimeout(250)

          const measured = await btn.evaluate((el) => {
            const cs = getComputedStyle(el)
            const read = (css) =>
              (css.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number)
            const luminance = (rgb) =>
              rgb
                .map((v) => {
                  const s = v / 255
                  return s <= 0.03928
                    ? s / 12.92
                    : Math.pow((s + 0.055) / 1.055, 2.4)
                })
                .reduce((sum, c, i) => sum + [0.2126, 0.7152, 0.0722][i] * c, 0)
            // The dim composites the whole button over the first opaque
            // ancestor, so BOTH halves have to be mixed before measuring.
            let backdrop = [255, 255, 255]
            for (let n = el.parentElement; n; n = n.parentElement) {
              const bg = getComputedStyle(n).backgroundColor
              const parts = bg.match(/[\d.]+/g)
              if (parts && (parts.length < 4 || Number(parts[3]) > 0)) {
                backdrop = parts.slice(0, 3).map(Number)
                break
              }
            }
            const alpha = Number(cs.opacity)
            const mix = (rgb) =>
              rgb.map((v, i) => alpha * v + (1 - alpha) * backdrop[i])
            const l1 = luminance(mix(read(cs.color)))
            const l2 = luminance(mix(read(cs.backgroundColor)))
            return {
              color: cs.color,
              background: cs.backgroundColor,
              opacity: alpha,
              ratio:
                Math.round(
                  ((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)) * 100
                ) / 100,
            }
          })

          console.log(
            `[cw11] ${label} ${state}: ${measured.color} on ${measured.background} @ ${measured.opacity} = ${measured.ratio}:1`
          )
          expect(
            measured.ratio,
            `${label} ${state} is ${measured.color} on ${measured.background} at opacity ${measured.opacity} = ${measured.ratio}:1`
          ).toBeGreaterThanOrEqual(4.5)
        }
      }
    })
  })

  test.describe('desktop-shaped viewport', () => {
    test.use({ viewport: { width: 1280, height: 800 } })

    test('the gate is inert: no gate state on the button, and it opens the game', async ({
      page,
    }) => {
      await page.goto('/?hfm=unlock')
      await expect(page.locator('#cityWalkCard')).toBeVisible({
        timeout: 30000,
      })

      const btn = page.locator('#cityWalkLaunchBtn')
      await expect(btn).not.toHaveAttribute('aria-disabled', 'true')
      await expect(btn).not.toHaveAttribute('aria-describedby', /.+/)
      await expect(page.locator('#cityWalkGateReason')).toBeHidden()

      await btn.click()
      await expect(page.locator('#cityWalkLayer')).toBeVisible({
        timeout: 20000,
      })
    })

    test('narrowing a running game leaves it open; only re-entry is gated', async ({
      page,
    }) => {
      await launchGame(page)

      await page.setViewportSize({ width: 390, height: 844 })
      // The session stays. Nothing ejects a player mid-game.
      await expect(page.locator('#cityWalkLayer')).toBeVisible()
      // The trigger behind the layer is gated for the NEXT entry. The
      // subscription is debounced (150ms); the retrying assertion absorbs it.
      await expect(page.locator('#cityWalkLaunchBtn')).toHaveAttribute(
        'aria-disabled',
        'true'
      )

      // And the way out is never gated.
      await page.keyboard.press('Escape')
      await expect(page.locator('#cityWalkLayer')).toBeHidden()
    })
  })
})

test.describe('ASCII City Walk — playing', () => {
  test('launch, walk, turn, map view, and exit restore', async ({ page }) => {
    await launchGame(page)

    // Modal semantics + initial focus inside the layer
    await expect(page.locator('#cityWalkLayer')).toHaveAttribute(
      'role',
      'dialog'
    )
    await expect(page.locator('#cityWalkLayer')).toHaveAttribute(
      'aria-modal',
      'true'
    )
    await expect(
      page.getByRole('button', { name: 'Seattle, Washington' })
    ).toBeFocused()

    await enterCity(page)
    // The spawn faces the clearest street, so the compass reference
    // is captured, never assumed to be north.
    const spawnHeading = await hudHeading(page)
    expect(spawnHeading).not.toBeNull()

    // Held until the compass moves OFF the spawn sector, never for a fixed
    // 1300 ms: turning integrates per FRAME, and a wall-clock hold on a
    // loaded runner can deliver too few frames to cross a 45 degree sector.
    // Measured - that is exactly how the sibling case below went red on a
    // Chromium CI shard, still reading its start sector after the hold.
    // Exact label, not substring (see hudHeading).
    await page.keyboard.down('ArrowRight')
    try {
      await expect
        .poll(() => hudHeading(page), { timeout: 30000, intervals: [150] })
        .not.toBe(spawnHeading)
    } finally {
      await page.keyboard.up('ArrowRight')
    }

    // Map view toggle and back
    await page.keyboard.press('KeyM')
    await expect(page.locator('#cityWalkHudStatus')).toContainText('map view')
    await page.keyboard.press('KeyM')
    await expect(page.locator('#cityWalkHudStatus')).toContainText(
      'street view'
    )

    // Exit: layer hides, mono variant is restored off, focus returns to the
    // launch card (the trigger is captured explicitly).
    await page.keyboard.press('Escape')
    await expect(page.locator('#cityWalkLayer')).toBeHidden()
    await expect(page.locator('html')).not.toHaveAttribute(
      'data-ui-variant',
      'mono'
    )
    await expect(page.locator('#cityWalkLaunchBtn')).toBeFocused()
  })

  test('Escape closes the help panel before it closes the game', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)

    await page.keyboard.press('KeyH')
    await expect(page.locator('#cityWalkHelpPanel')).toBeVisible()
    await expect(page.locator('#cityWalkHelpBtn')).toHaveAttribute(
      'aria-expanded',
      'true'
    )

    await page.keyboard.press('Escape')
    await expect(page.locator('#cityWalkHelpPanel')).toBeHidden()
    await expect(page.locator('#cityWalkLayer')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.locator('#cityWalkLayer')).toBeHidden()
  })

  test('every city loads to a walkable street view', async ({ page }) => {
    await launchGame(page)
    await enterCity(page, 'Denver, Colorado')
    await expect(page.locator('#cityWalkHudStatus')).toContainText(
      'Denver, Colorado'
    )
    await page.keyboard.press('Escape')
    await expect(page.locator('#cityWalkLayer')).toBeHidden()

    // Relaunch into another city — the session teardown must be complete.
    await page.locator('#cityWalkLaunchBtn').click()
    await expect(page.locator('#cityWalkLayer')).toBeVisible()
    await enterCity(page, 'Burnaby, British Columbia')
    await expect(page.locator('#cityWalkHudStatus')).toContainText(
      'Burnaby, British Columbia'
    )
  })

  test('the OpenStreetMap attribution is visible while playing', async ({
    page,
  }) => {
    await launchGame(page)
    // Start panel attribution
    await expect(
      page
        .locator('#cityWalkStartPanel')
        .getByRole('link', { name: /OpenStreetMap contributors/ })
    ).toBeVisible()

    await enterCity(page)
    // HUD attribution stays on screen during play
    await expect(
      page
        .locator('.city-walk-hud')
        .getByRole('link', { name: /OpenStreetMap contributors/ })
    ).toBeVisible()
  })
})

test.describe('ASCII City Walk — map navigation and walking speed', () => {
  test('map view: keyboard zoom, pan breaks follow, Home recenters', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)

    await page.keyboard.press('KeyM')
    await expect(page.locator('#cityWalkHudStatus')).toContainText(
      'zoom 1.0x'
    )

    // Held PageUp zooms in exponentially.
    //
    // The hold ends on a condition, not on the clock. Zoom accrues per
    // rendered frame, so a fixed 700 ms buys however many frames the runner
    // happens to manage, and a heavier city can make a loaded Firefox miss the
    // bar. The wall clock is the outer bound, and the zoom itself is the quota.
    await page.keyboard.down('PageUp')
    try {
      await expect
        .poll(
          () => page.evaluate(() => window.__cityWalkGame.mapCam.zoom),
          { timeout: 20_000 }
        )
        .toBeGreaterThan(1.3)
    } finally {
      await page.keyboard.up('PageUp')
    }
    const hud = await page.textContent('#cityWalkHudStatus')
    const zoom = parseFloat(/zoom (\d+\.\d)x/.exec(hud)?.[1] ?? '0')
    expect(zoom).toBeGreaterThan(1.2)

    // Panning breaks player-follow (asserted via the DEV handle). Same shape:
    // held until follow actually breaks, rather than for a fixed 400 ms.
    await page.keyboard.down('ArrowRight')
    try {
      await expect
        .poll(
          () => page.evaluate(() => window.__cityWalkGame.mapCam.follow),
          { timeout: 20_000 }
        )
        .toBe(false)
    } finally {
      await page.keyboard.up('ArrowRight')
    }
    const afterPan = await page.evaluate(() => ({
      follow: window.__cityWalkGame.mapCam.follow,
      centerX: window.__cityWalkGame.mapCam.centerX,
    }))
    expect(afterPan.follow).toBe(false)

    // Home snaps back to the player and resumes follow.
    await page.keyboard.press('Home')
    await expect(page.locator('#cityWalkAnnouncer')).toHaveText(
      /Map centered on you/
    )
    const afterHome = await page.evaluate(
      () => window.__cityWalkGame.mapCam.follow
    )
    expect(afterHome).toBe(true)

    // Back on the street, walking keys still walk.
    await page.keyboard.press('KeyM')
    await expect(page.locator('#cityWalkHudStatus')).toContainText(
      'street view'
    )
  })

  test('Minus sizes characters in both views; PageUp and PageDown zoom the map', async ({
    page,
  }) => {
    // Minus over the map sizes the characters, as it does in the street; the
    // map zoom has its own keys, so one key never means two things depending
    // on a mode shown nowhere near it.
    await launchGame(page)
    await enterCity(page)

    const scaleOf = () =>
      page.evaluate(() => window.__cityWalkGame.altView.getFontScale())
    const zoomOf = () =>
      page.evaluate(() => window.__cityWalkGame.mapCam.zoom)

    await page.keyboard.press('KeyM')
    await expect(page.locator('#cityWalkHudStatus')).toContainText('map view')

    // Minus over the map changes the size and leaves the zoom alone: one step
    // down from the default of 30%.
    const zoomBefore = await zoomOf()
    await page.keyboard.press('Minus')
    await expect(page.locator('#cityWalkAnnouncer')).toHaveText(
      /Character size 20 percent/
    )
    expect(await scaleOf()).toBeCloseTo(0.2, 5)
    expect(await zoomOf()).toBeCloseTo(zoomBefore, 5)

    // Equals brings it back, still without touching the zoom.
    await page.keyboard.press('Equal')
    await expect(page.locator('#cityWalkAnnouncer')).toHaveText(
      /Character size 30 percent/
    )
    expect(await zoomOf()).toBeCloseTo(zoomBefore, 5)

    // PageDown is a held zoom-out key, and the keyup releases the hold:
    // after release the zoom stays where the key left it.
    await page.keyboard.down('PageDown')
    await expect.poll(zoomOf).toBeLessThan(zoomBefore - 0.05)
    await page.keyboard.up('PageDown')
    const zoomReleased = await zoomOf()
    // Let real animation frames pass, not wall-clock: a loaded machine can
    // render nothing in a fixed wait and vacuously "hold" the zoom.
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          let n = 0
          const tick = () => (++n >= 10 ? resolve() : requestAnimationFrame(tick))
          requestAnimationFrame(tick)
        })
    )
    expect(await zoomOf()).toBeCloseTo(zoomReleased, 5)

    // PageUp zooms back in.
    await page.keyboard.down('PageUp')
    await expect.poll(zoomOf).toBeGreaterThan(zoomReleased + 0.05)
    await page.keyboard.up('PageUp')

    // The toolbar teaches the new keys.
    await expect(page.locator('#cityWalkZoomInBtn')).toHaveAttribute(
      'title',
      'Keyboard: Page Up'
    )
    await expect(page.locator('#cityWalkZoomOutBtn')).toHaveAttribute(
      'title',
      'Keyboard: Page Down'
    )

    // And the street keeps the behaviour it always had.
    await page.keyboard.press('KeyM')
    await expect(page.locator('#cityWalkHudStatus')).toContainText(
      'street view'
    )
    await page.keyboard.press('Minus')
    await expect(page.locator('#cityWalkAnnouncer')).toHaveText(
      /Character size 20 percent/
    )
    expect(await scaleOf()).toBeCloseTo(0.2, 5)
  })

  test('walking speed adjusts, announces, and persists across sessions', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)
    await expect(page.locator('#cityWalkHudStatus')).toContainText(
      'speed 100%'
    )

    await page.keyboard.press('BracketRight')
    await page.keyboard.press('BracketRight')
    await expect(page.locator('#cityWalkAnnouncer')).toHaveText(
      /Walking speed 150 percent/
    )
    await expect(page.locator('#cityWalkHudStatus')).toContainText(
      'speed 150%'
    )

    // Persisted: a fresh session opens at the saved multiplier.
    await page.keyboard.press('Escape')
    await expect(page.locator('#cityWalkLayer')).toBeHidden()
    await page.locator('#cityWalkLaunchBtn').click()
    await expect(page.locator('#cityWalkLayer')).toBeVisible()
    await enterCity(page, 'Denver, Colorado')
    await expect(page.locator('#cityWalkHudStatus')).toContainText(
      'speed 150%'
    )
  })
})

/**
 * Bloom is on. This pins that it is on and that the radius stays under the
 * value where lit shopfront panes stop having gaps between them at the 10%
 * floor: separation between characters is the whole readability of an
 * ASCII picture.
 */
test.describe('ASCII City Walk — bloom is on', () => {
  test('the city lights have a halo, and not so much of one that they merge', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)

    const crt = await page.evaluate(() =>
      window.__cityWalkGame.altView.getCrtEffects()
    )
    expect(crt.bloomPx, 'bloom is off again').toBeGreaterThan(0)
    // 1px closes the shopfront gaps at 2x4px cells; 0.75 does not (measured
    // and photographed).
    expect(crt.bloomPx, 'bloom is wide enough to merge glyphs at the floor').toBeLessThan(1)
  })
})

/**
 * The phosphor trail lays each painted frame over a fading copy of the one
 * before, which is what gives movement a wake. Between the street and the
 * map those two pictures have nothing in common, so a carried-over wake is
 * a double exposure: the city shuttering over the map and back again.
 *
 * Measured rather than eyeballed: the frame right after the toggle is
 * compared with the settled frame a moment later. With the trail carried
 * over they differ; with it dropped they are the same picture.
 */
test.describe('ASCII City Walk — the view cuts, it does not cross-fade', () => {
  test('switching between map and street leaves no ghost of the other', async ({
    page,
  }) => {
    // Entry plus several screenshot comparisons at CI software's
    // seconds-per-frame pace need more than 120 s. The comparisons decide; the
    // budget follows the pace.
    test.setTimeout(300_000)
    await launchGame(page)
    await enterCity(page)
    await page.waitForTimeout(1500)
    await page.locator('#cityWalkViewport').click({ position: { x: 5, y: 5 } })
    // That focus click parks the pointer at the viewport's top-left corner,
    // which hover-look reads as a full-rate turn: the street then pans forever
    // and immediate-vs-settled measures scenery, not ghosting. Park the
    // pointer off the viewport so the camera holds still; the ghost this test
    // guards is unaffected.
    await page.mouse.move(0, 0)

    /** Mean absolute difference in level between two PNG buffers, 0-255. */
    const ghost = (a, b) =>
      page.evaluate(
        async ([x, y]) => {
          const load = async (u) => {
            const i = new Image()
            i.src = u
            await i.decode()
            const c = document.createElement('canvas')
            c.width = i.width
            c.height = i.height
            c.getContext('2d').drawImage(i, 0, 0)
            return c
              .getContext('2d')
              .getImageData(0, 0, c.width, c.height).data
          }
          const [p, q] = [await load(x), await load(y)]
          let sum = 0
          for (let i = 0; i < p.length; i += 4) {
            sum += Math.abs(
              Math.max(p[i], p[i + 1], p[i + 2]) -
                Math.max(q[i], q[i + 1], q[i + 2])
            )
          }
          return sum / (p.length / 4)
        },
        [a, b]
      )
    const url = (buf) => 'data:image/png;base64,' + buf.toString('base64')
    const shot = () => page.locator('#cityWalkViewport').screenshot()

    for (const into of ['map', 'street']) {
      await page.keyboard.press('m')
      // Wait for the converter to paint the new view before the 'immediate'
      // capture. Under session load the screenshot can land before the first
      // new-view frame exists, and the diff then measures map-vs-street instead
      // of any ghost. The ghost this test guards against lives in the painted
      // frames (the persistence canvas blends over several, so the first
      // painted frames still carry it): with the trap reinstated (fade 0.45,
      // clearPersistence commented out) this reads 0.87 carried levels against
      // the 0.5 bar with the wait in place.
      await page.evaluate(
        () =>
          new Promise((resolve) => {
            const g = window.__cityWalkGame
            const from = g.altView.getConvertStats?.()?.samples ?? 0
            const tick = () => {
              const now = g.altView.getConvertStats?.()?.samples ?? 0
              if (now >= from + 2) resolve()
              else requestAnimationFrame(tick)
            }
            requestAnimationFrame(tick)
          })
      )
      const immediate = await shot()
      await page.waitForTimeout(1400)
      const settled = await shot()
      const carried = await ghost(url(immediate), url(settled))
      // Measured on this pose: 2.68 into the map and 1.16 back to the street
      // with the trail carried, 0.00 both ways once it is dropped. The bar
      // sits between, nearer zero.
      expect(
        carried,
        `${into} view still carried ${carried.toFixed(2)} levels of the other view`
      ).toBeLessThan(0.5)
      await page.waitForTimeout(400)
    }
  })
})

test.describe('ASCII City Walk — character size', () => {
  const scaleOf = (page) =>
    page.evaluate(() => window.__cityWalkGame?.altView?.getFontScale() ?? null)

  test('steps in tens between the measured floor and 100%, and persists', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)

    // Opens at the one default of 30% with nothing saved. The default is where
    // everybody starts; the range a player may choose from still reaches the
    // 10% end.
    expect(await scaleOf(page)).toBeCloseTo(0.3, 5)

    await page.keyboard.press('Equal')
    await expect(page.locator('#cityWalkAnnouncer')).toHaveText(
      /Character size 40 percent/
    )

    // Down to the floor: 40 → 10 is three steps.
    for (let i = 0; i < 3; i++) await page.keyboard.press('Minus')
    await expect(page.locator('#cityWalkAnnouncer')).toHaveText(
      /Character size 10 percent/
    )
    expect(await scaleOf(page)).toBeCloseTo(0.1, 5)

    // The floor holds: another press announces the same value, and the
    // renderer never drops below it (its own instance clamp goes to 0.05).
    await page.keyboard.press('Minus')
    await expect(page.locator('#cityWalkAnnouncer')).toHaveText(
      /Character size 10 percent/
    )
    expect(await scaleOf(page)).toBeCloseTo(0.1, 5)

    // Up to the ceiling: 10 → 100 is nine steps, every one a whole ten.
    for (let i = 0; i < 9; i++) await page.keyboard.press('Equal')
    await expect(page.locator('#cityWalkAnnouncer')).toHaveText(
      /Character size 100 percent/
    )

    // The ceiling holds too: 250% is out of range.
    await page.keyboard.press('Equal')
    await expect(page.locator('#cityWalkAnnouncer')).toHaveText(
      /Character size 100 percent/
    )
    expect(await scaleOf(page)).toBeCloseTo(1, 5)

    // Persisted under the game's own key, and a fresh session opens there.
    expect(
      await page.evaluate(() =>
        localStorage.getItem('openscad-forge-city-walk-font-scale')
      )
    ).toBe('1')

    await page.keyboard.press('Escape')
    await expect(page.locator('#cityWalkLayer')).toBeHidden()
    await page.locator('#cityWalkLaunchBtn').click()
    await expect(page.locator('#cityWalkLayer')).toBeVisible()
    await enterCity(page, 'Denver, Colorado')
    expect(await scaleOf(page)).toBeCloseTo(1, 5)
  })

  test('the main app Alt View preference does not seed the game', async ({
    page,
  }) => {
    // The game has one default and decides its own size: a preview-slider
    // value must not arrive as the game's opening size. 2.5 is a legal slider
    // value; the game must ignore it entirely and open at 30%.
    await page.addInitScript(() => {
      localStorage.setItem('openscad-forge-hfm-font-scale', '2.5')
    })
    await launchGame(page)
    await enterCity(page)
    expect(await scaleOf(page)).toBeCloseTo(0.3, 5)
  })

  test('the help panel states the range it actually offers', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)
    await page.keyboard.press('KeyH')
    await expect(page.locator('#cityWalkHelpPanel')).toBeVisible()
    // The bottom of the range is per machine, and the help says so.
    await expect(page.locator('#cityWalkHelpPanel')).toContainText(
      'smaller or larger characters, up to 100% ' +
        "(the smallest size is set by this machine's own speed)"
    )
  })
})

test.describe('ASCII City Walk — looking around', () => {
  const DEG = Math.PI / 180

  /** The live gaze, straight off the DEV handle the game exposes. */
  const gaze = (page) =>
    page.evaluate(() => {
      const w = window.__cityWalkGame?.walkState
      return { pitch: w?.pitchRad ?? null, heading: w?.headingRad ?? null }
    })

  /** Where focus sits, and whether it is still inside the modal layer. */
  const focusState = (page) =>
    page.evaluate(() => ({
      id: document.activeElement?.id || document.activeElement?.tagName,
      inLayer: Boolean(
        document
          .getElementById('cityWalkLayer')
          ?.contains(document.activeElement)
      ),
    }))

  async function dragViewport(page, dx, dy, steps = 20) {
    const box = await page.locator('#cityWalkViewport').boundingBox()
    const x = box.x + box.width / 2
    const y = box.y + box.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    for (let i = 1; i <= steps; i++) {
      await page.mouse.move(x + (dx * i) / steps, y + (dy * i) / steps)
    }
    await page.mouse.up()
  }

  test('R and F tilt the gaze, the HUD says so, and V levels it', async ({
    page,
  }) => {
    // Holding a key to the 60 deg clamp takes as long as the renderer needs,
    // and CI's renderer is software.
    test.setTimeout(120_000)
    await launchGame(page)
    await enterCity(page)

    expect((await gaze(page)).pitch).toBe(0)
    // The spawn faces the clearest street, so the bearing reference
    // is captured, never assumed to be zero.
    const spawnBearing = (await gaze(page)).heading
    await expect(page.locator('#cityWalkHudStatus')).not.toContainText(
      'looking'
    )

    // Held R climbs - and the key is held until it HAS climbed, never for a
    // fixed 600 ms. Pitch integrates per FRAME with dt clamped to 0.1 s, so
    // one rendered frame is worth at most 4.5 deg and passing 5 needs at
    // least two of them; a 600 ms hold on a software renderer is not
    // guaranteed to deliver two. Measured: this is exactly how it went red on
    // an Edge shard in CI, having been green on the same branch before the
    // scene grew heavier. The clause below it already learned this lesson;
    // this one and the F case had not.
    await page.keyboard.down('KeyR')
    try {
      await expect
        .poll(async () => (await gaze(page)).pitch > 5 * DEG, {
          timeout: 30000,
          intervals: [100],
        })
        .toBe(true)
    } finally {
      await page.keyboard.up('KeyR')
    }
    // It CLIMBED rather than jumping to the stop, which is what the fixed
    // hold was really asserting: 5 deg arrives long before the 60 deg clamp.
    expect((await gaze(page)).pitch).toBeLessThan(60 * DEG)
    await expect(page.locator('#cityWalkHudStatus')).toContainText('looking up')

    // The bearing is untouched by looking up - pitch and yaw are separate.
    expect((await gaze(page)).heading).toBe(spawnBearing)

    // Held to the stop: the clamp is exactly 60 degrees, never beyond.
    //
    // The key is held until the gaze arrives, not for a fixed 2.2 s. Pitch
    // integrates per frame with dt clamped to 0.1 s, so on a slow renderer
    // wall time and simulated time come apart. Polling for exactly 60 still
    // proves the clamp: an uncapped gaze sails past it and never equals 60,
    // so this times out.
    await page.keyboard.down('KeyR')
    try {
      await expect
        .poll(async () => Math.round((await gaze(page)).pitch / DEG), {
          // CI software pitches at ~1.6 deg/s, so the bound is long; the clamp
          // still decides.
          timeout: 120000,
          intervals: [200],
        })
        .toBe(60)
    } finally {
      await page.keyboard.up('KeyR')
    }
    // And it stays there once the key is up.
    expect(Math.round((await gaze(page)).pitch / DEG)).toBe(60)

    await page.keyboard.press('KeyV')
    await expect(page.locator('#cityWalkAnnouncer')).toHaveText(/View level/)
    expect((await gaze(page)).pitch).toBe(0)
    await expect(page.locator('#cityWalkHudStatus')).not.toContainText(
      'looking'
    )

    // F goes the other way, and the HUD words it differently. Held until it
    // has fallen, for the same reason R is.
    await page.keyboard.down('KeyF')
    try {
      await expect
        .poll(async () => (await gaze(page)).pitch < -5 * DEG, {
          timeout: 30000,
          intervals: [100],
        })
        .toBe(true)
    } finally {
      await page.keyboard.up('KeyF')
    }
    expect((await gaze(page)).pitch).toBeGreaterThan(-60 * DEG)
    await expect(page.locator('#cityWalkHudStatus')).toContainText(
      'looking down'
    )
  })

  test('a mouse drag turns and tilts; a plain click does neither', async ({
    page,
  }) => {
    // Dragging is one of three look modes, so this case opts into drag
    // explicitly and keeps guarding the 0.25 deg/px contract. Eight mouse
    // steps rather than twenty keep it inside the CI time limit.
    await page.addInitScript(() =>
      localStorage.setItem('openscad-forge-city-walk-look', 'drag')
    )
    await launchGame(page)
    await enterCity(page)
    expect(
      await page.evaluate(() => window.__cityWalkGame.lookMode)
    ).toBe('drag')

    const before = await gaze(page)

    // Under the 4 px threshold this is a click, not a drag.
    const box = await page.locator('#cityWalkViewport').boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 2, box.y + box.height / 2 + 1)
    await page.mouse.up()
    expect(await gaze(page)).toEqual(before)

    // 200 px right and 100 px up at 0.25 deg/px: +50 deg of yaw, +25 of
    // pitch, relative to the spawn bearing, which faces the
    // clearest street rather than a fixed north.
    const TAU_DEG = 360
    const startDeg = Math.round(before.heading / DEG)
    await dragViewport(page, 200, -100, 8)
    await expect
      .poll(async () =>
        (Math.round((await gaze(page)).heading / DEG) - startDeg + TAU_DEG) %
        TAU_DEG
      )
      .toBe(50)
    expect(Math.round((await gaze(page)).pitch / DEG)).toBe(25)
    await expect(page.locator('#cityWalkHudStatus')).toContainText('looking up')
  })

  test('the map view ignores the look keys and the drag', async ({ page }) => {
    await launchGame(page)
    await enterCity(page)

    // Positive control first: without proof the same press works in street
    // view, "the map ignores it" would pass on a build that has no pitch at
    // all.
    //
    // Hold until the game's own pitch answers, not for a wall-clock 700 ms.
    // Look rates integrate per frame with dt clamped, so on a frame-starved
    // fresh entry (the first seconds after the city builds) a fixed wall-time
    // hold delivers a fraction of the turn. The claim is that R pitches; the
    // clock was only ever the measure.
    await page.keyboard.down('KeyR')
    await expect
      .poll(async () => (await gaze(page)).pitch > 5 * DEG, { timeout: 15000 })
      .toBe(true)
    await page.keyboard.up('KeyR')
    await page.keyboard.press('KeyV')
    expect((await gaze(page)).pitch).toBe(0)

    await page.keyboard.press('KeyM')
    await expect(page.locator('#cityWalkHudStatus')).toContainText('map view')
    const before = await gaze(page)

    await page.keyboard.down('KeyR')
    await page.waitForTimeout(700)
    await page.keyboard.up('KeyR')
    await dragViewport(page, 150, 80, 10)

    // Walking is suspended in the map view, and so is looking around.
    expect(await gaze(page)).toEqual(before)
    await expect(page.locator('#cityWalkHudStatus')).not.toContainText(
      'looking'
    )
  })

  test('a click in the viewport leaves the keyboard working', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)

    // The viewport is not focusable, so a plain click would send focus to
    // <body>, outside the layer the key listener is bound to, and every key
    // would die for the rest of the session.
    for (const view of ['street', 'map']) {
      if (view === 'map') {
        await page.keyboard.press('KeyM')
        await expect(page.locator('#cityWalkHudStatus')).toContainText(
          'map view'
        )
      }

      const box = await page.locator('#cityWalkViewport').boundingBox()
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)

      const focus = await focusState(page)
      expect(focus.inLayer, `focus left the layer in ${view} view`).toBe(true)

      // Proof the keyboard still reaches the game: H opens the help panel.
      await page.keyboard.press('KeyH')
      await expect(page.locator('#cityWalkHelpPanel')).toBeVisible()
      await page.keyboard.press('KeyH')
      await expect(page.locator('#cityWalkHelpPanel')).toBeHidden()

      if (view === 'map') await page.keyboard.press('KeyM')
    }
  })

  test('the help panel names the look controls', async ({ page }) => {
    await launchGame(page)
    await enterCity(page)
    await page.keyboard.press('KeyH')
    await expect(page.locator('#cityWalkHelpPanel')).toBeVisible()
    await expect(page.locator('#cityWalkHelpPanel')).toContainText(
      'R and F: look up and down'
    )
    await expect(page.locator('#cityWalkHelpPanel')).toContainText(
      'V: level the view'
    )
    // The default look mode is drag, so the help teaches the drag first, and
    // the Mouse look button's options ride their own line.
    await expect(page.locator('#cityWalkHelpPanel')).toContainText(
      'Drag with the mouse: look around in street view, move the map in map view'
    )
    await expect(page.locator('#cityWalkHelpPanel')).toContainText(
      'The Mouse look button can make the view follow the cursor'
    )
    await expect(page.locator('#cityWalkHelpPanel')).toContainText(
      'N: auto-walk forward, following the street, until something stops you'
    )
    // And the tour's line beside it.
    await expect(page.locator('#cityWalkHelpPanel')).toContainText(
      'I: walk to the selected landmark, turn by turn'
    )
    // And the map line teaches W A S D: those keys pan the map, the same
    // actions the street walk binds. Pinned here so the teaching cannot drift
    // away from the binding.
    await expect(page.locator('#cityWalkHelpPanel')).toContainText(
      'On the map: arrow keys or W A S D pan'
    )
  })
})

test.describe('ASCII City Walk — landmarks', () => {
  test('legend lists landmarks in map view; L cycles, announces, and highlights', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)

    // Legend is a map-view feature.
    await expect(page.locator('#cityWalkLegend')).toBeHidden()
    await page.keyboard.press('KeyM')
    await expect(page.locator('#cityWalkLegend')).toBeVisible()
    const items = page.locator('#cityWalkLegend li')
    expect(await items.count()).toBeGreaterThanOrEqual(1)
    // Rows carry a compass direction from the player.
    await expect(items.first()).toHaveText(/: (north|south|east|west)/)

    // L selects and announces the first landmark…
    await page.keyboard.press('KeyL')
    await expect(page.locator('#cityWalkAnnouncer')).toHaveText(
      /Landmark 1 of \d+: /
    )
    await expect(
      page.locator('#cityWalkLegend li[aria-current="true"]')
    ).toHaveCount(1)

    // …and Shift+L cycles backwards (wraps to the last).
    await page.keyboard.press('Shift+KeyL')
    await expect(page.locator('#cityWalkAnnouncer')).toHaveText(
      /Landmark \d+ of \d+: /
    )

    // Returning to the street resets the selection.
    await page.keyboard.press('KeyM')
    await expect(page.locator('#cityWalkLegend')).toBeHidden()
    await page.keyboard.press('KeyM')
    await expect(
      page.locator('#cityWalkLegend li[aria-current="true"]')
    ).toHaveCount(0)
  })

  test('L from street view opens the map and selects a landmark', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)

    await page.keyboard.press('KeyL')
    await expect(page.locator('#cityWalkHudStatus')).toContainText('map view')
    await expect(page.locator('#cityWalkAnnouncer')).toHaveText(
      /Landmark 1 of \d+: /
    )
  })
})

test.describe('ASCII City Walk — the curated legend and the waypoints', () => {
  test('the legend is the curated seven, and Seattle spawns facing the Wheel', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)

    const state = await page.evaluate(() => {
      const g = window.__cityWalkGame
      const wheel = g.landmarks[0]
      const dx = wheel.x - g.walkState.x
      const dy = wheel.y - g.walkState.y
      const facing = Math.atan2(dx, dy)
      let turn = facing - g.walkState.headingRad
      while (turn > Math.PI) turn -= 2 * Math.PI
      while (turn < -Math.PI) turn += 2 * Math.PI
      return {
        names: g.landmarks.map((l) => l.name),
        wheelDistM: Math.hypot(dx, dy),
        turnDeg: (Math.abs(turn) * 180) / Math.PI,
        waypoints: g.waypointSpots.map((s) => s.placement),
      }
    })

    // The seven, in TABLE order - the scorer put a Hyatt third and the
    // Needle eleventh; the registry leads with the two icons.
    expect(state.names).toEqual([
      'Seattle Great Wheel',
      'Space Needle',
      'Seattle Central Library',
      'Smith Tower',
      'Public Market Clock',
      'Paramount Theatre',
      'Arctic Building',
    ])
    // The spawn rule: within 200 m of the Wheel, facing it.
    expect(state.wheelDistM).toBeLessThan(200)
    expect(state.turnDeg).toBeLessThan(10)
    // And every landmark got its street-face mark, on pavement.
    expect(state.waypoints).toEqual(Array(7).fill('pavement'))

    await page.keyboard.press('KeyM')
    const items = page.locator('#cityWalkLegend li')
    await expect(items).toHaveCount(7)
    await expect(items.first()).toContainText('Seattle Great Wheel')
  })

  test('walking into a waypoint announces it and ticks the legend', async ({
    page,
  }) => {
    // CI renders in software and rides the dt clamp: below ~10 fps the walk
    // covers a FRACTION of real time, so the 8-14 m approach that takes two
    // seconds on a real GPU can take twenty-plus there. The first CI run
    // timed out at 15 s with the touch announcement arriving just after -
    // the retry's failure snapshot caught "Waypoint reached" already on the
    // live region. The window is sized for the slowest walker, not the
    // local one.
    test.setTimeout(120000)
    await launchGame(page)
    await enterCity(page)

    // Stand a few metres street-side of the Wheel's waypoint, facing it,
    // then WALK the rest - the touch must come from the real collision
    // walk pressing against the plinth, not from a poked flag.
    const posed = await page.evaluate(() => {
      const g = window.__cityWalkGame
      const spot = g.waypointSpots[0]
      for (const d of [8, 10, 12, 14]) {
        const x = spot.x + Math.sin(spot.facingRad) * d
        const y = spot.y + Math.cos(spot.facingRad) * d
        if (!g.collision.isBlocked(x, y)) {
          const st = g.walkState
          st.x = x
          st.y = y
          st.headingRad = Math.atan2(spot.x - x, spot.y - y)
          return { name: spot.name, d }
        }
      }
      return null
    })
    expect(posed?.name).toBe('Seattle Great Wheel')

    // The whole approach happens with the live region under watch: the walk is
    // real keys, and the sentence must arrive by itself.
    //
    // Watched by a MutationObserver accumulator (the teleport suite's
    // pattern), not by polling the current text. The arrival sentence is
    // transient (the slope sentences replace it within seconds when the walker
    // presses on up a grade), so a DOM poll can race it and lose while a
    // screen reader, which hears every change, does not. The observer is armed
    // before the walk so nothing can slip between.
    await page.evaluate(() => {
      window.__t7Heard = []
      const node = document.querySelector('#cityWalkAnnouncer')
      new MutationObserver(() => {
        const t = node.textContent ?? ''
        if (t) window.__t7Heard.push(t)
      }).observe(node, {
        childList: true,
        characterData: true,
        subtree: true,
      })
    })
    await page.keyboard.down('KeyW')
    try {
      await expect
        .poll(
          () =>
            page.evaluate(() =>
              (window.__t7Heard ?? []).some((t) =>
                t.includes('Waypoint reached: Seattle Great Wheel.')
              )
            ),
          // The 8-14 m approach at CI software's ~0.23 m/s needs a long bound;
          // the observer still decides.
          { timeout: 180000 }
        )
        .toBe(true)
    } finally {
      await page.keyboard.up('KeyW')
    }

    const touched = await page.evaluate(() => {
      const g = window.__cityWalkGame
      return {
        visited: [...g.visited],
        touching: g.touchedWaypoint,
      }
    })
    expect(touched.visited).toContain('Seattle Great Wheel')
    expect(touched.touching).toBe('Seattle Great Wheel')

    // The legend agrees - the tick and its screen-reader word.
    await page.keyboard.press('KeyM')
    const row = page.locator('#cityWalkLegend li').first()
    await expect(row).toContainText('✓')
    await expect(row).toContainText('Seattle Great Wheel')
  })
})

test.describe('ASCII City Walk — high contrast', () => {
  test('launches and plays under high contrast with the palette active', async ({
    page,
  }) => {
    await page.goto('/?hfm=unlock')
    await expect(page.locator('#cityWalkCard')).toBeVisible({ timeout: 30000 })
    await page.locator('#contrastToggle').click()
    await expect(page.locator('html')).toHaveAttribute(
      'data-high-contrast',
      'true'
    )

    await page.locator('#cityWalkLaunchBtn').click()
    await expect(page.locator('#cityWalkLayer')).toBeVisible({
      timeout: 20000,
    })
    await enterCity(page)

    // The dev handle proves the gate: palette active under HC…
    const paletteOn = await page.evaluate(
      () => window.__cityWalkGame?.altView?.getPalette()?.length ?? 0
    )
    expect(paletteOn).toBeGreaterThanOrEqual(4)

    // …character size keys still work. The game opens at the one default of
    // 30%, so one step up is 40.
    await page.keyboard.press('Equal')
    await expect(page.locator('#cityWalkAnnouncer')).toHaveText(
      /Character size 40 percent/
    )

    // …and walking still walks. Exact label, not substring (see hudHeading);
    // the reference heading is captured, never assumed north (the spawn faces
    // the clearest street).
    const sizeKeysHeading = await hudHeading(page)
    await page.keyboard.down('ArrowRight')
    try {
      await expect
        .poll(() => hudHeading(page), { timeout: 30000, intervals: [150] })
        .not.toBe(sizeKeysHeading)
    } finally {
      await page.keyboard.up('ArrowRight')
    }

    await page.keyboard.press('Escape')
    await expect(page.locator('#cityWalkLayer')).toBeHidden()
  })
})

test.describe('ASCII City Walk — accessibility toggles', () => {
  const contrastBtn = (page) => page.locator('#cityWalkContrastBtn')
  const themeBtn = (page) => page.locator('#cityWalkThemeBtn')
  const announcer = (page) => page.locator('#cityWalkAnnouncer')

  /** How many colours the converter is quantizing to, or null for phosphor. */
  const paletteSize = (page) =>
    page.evaluate(
      () => window.__cityWalkGame?.altView?.getPalette()?.length ?? null
    )

  /** The phosphor colour the ASCII painter reads (_hfm-paint getPhosphorColor). */
  const accent = (page) =>
    page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue('--color-accent')
        .trim()
    )

  test('the high contrast button turns the palette on and off mid-walk', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)

    await expect(contrastBtn(page)).toHaveAttribute('aria-pressed', 'false')
    await expect(contrastBtn(page)).toHaveAttribute(
      'aria-label',
      'Turn high contrast on'
    )
    await expect(page.locator('html')).not.toHaveAttribute(
      'data-high-contrast',
      'true'
    )
    expect(await paletteSize(page)).toBeNull()

    await contrastBtn(page).click()
    await expect(page.locator('html')).toHaveAttribute(
      'data-high-contrast',
      'true'
    )
    await expect(contrastBtn(page)).toHaveAttribute('aria-pressed', 'true')
    await expect(contrastBtn(page)).toHaveAttribute(
      'aria-label',
      'Turn high contrast off'
    )
    await expect(announcer(page)).toHaveText('High contrast on.')
    // Multicolor exists only under high contrast, and the game's
    // own MutationObserver is what applies it without a reload.
    await expect.poll(() => paletteSize(page)).toBeGreaterThanOrEqual(4)

    await contrastBtn(page).click()
    await expect(page.locator('html')).not.toHaveAttribute(
      'data-high-contrast',
      'true'
    )
    await expect(contrastBtn(page)).toHaveAttribute('aria-pressed', 'false')
    await expect(announcer(page)).toHaveText('High contrast off.')
    await expect.poll(() => paletteSize(page)).toBeNull()
  })

  test('the theme button cycles the app setting and swaps the phosphor', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)

    // A fresh profile starts on the app's default 'auto' setting.
    await expect(themeBtn(page)).toHaveText('Theme: Auto')
    await expect(themeBtn(page)).toHaveAttribute(
      'aria-label',
      'Theme: Auto. Press to cycle themes.'
    )

    // The hexes are the game's phosphor identity, documented in
    // _hfm-paint.js: green in the dark scheme, amber in the light one. If
    // either ever changes, this case should be the thing that notices.
    await themeBtn(page).click()
    await expect(themeBtn(page)).toHaveText('Theme: Light')
    await expect(page.locator('html')).toHaveAttribute(
      'data-theme-setting',
      'light'
    )
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await expect(announcer(page)).toHaveText('Theme: Light')
    expect(await accent(page)).toBe('#ffb000')

    await themeBtn(page).click()
    await expect(themeBtn(page)).toHaveText('Theme: Dark')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(announcer(page)).toHaveText('Theme: Dark')
    expect(await accent(page)).toBe('#00ff00')

    await themeBtn(page).click()
    await expect(themeBtn(page)).toHaveText('Theme: Auto')
    await expect(page.locator('html')).toHaveAttribute(
      'data-theme-setting',
      'auto'
    )
    await expect(announcer(page)).toHaveText('Theme: Auto (follows system)')

    // The game keeps playing through every flip.
    await expect(page.locator('#cityWalkHudStatus')).toContainText(
      'street view'
    )
  })

  test('high contrast switched on before launch opens the game already pressed', async ({
    page,
  }) => {
    await page.goto('/?hfm=unlock')
    await expect(page.locator('#cityWalkCard')).toBeVisible({ timeout: 30000 })
    await page.locator('#contrastToggle').click()
    await expect(page.locator('html')).toHaveAttribute(
      'data-high-contrast',
      'true'
    )

    await page.locator('#cityWalkLaunchBtn').click()
    await expect(page.locator('#cityWalkLayer')).toBeVisible({ timeout: 20000 })

    // Built pressed, before anything in the layer has been clicked.
    await expect(contrastBtn(page)).toHaveAttribute('aria-pressed', 'true')
    await expect(contrastBtn(page)).toHaveAttribute(
      'aria-label',
      'Turn high contrast off'
    )
  })

  test('a click on a header toggle leaves the keyboard working', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)

    await themeBtn(page).click()
    const focus = await page.evaluate(() => ({
      id: document.activeElement?.id || document.activeElement?.tagName,
      inLayer: Boolean(
        document
          .getElementById('cityWalkLayer')
          ?.contains(document.activeElement)
      ),
    }))
    expect(focus.id).toBe('cityWalkThemeBtn')
    expect(focus.inLayer).toBe(true)

    // The keys still reach the game: focus staying put is only worth
    // asserting if the city still answers to it. The reference heading is
    // captured, never assumed north.
    //
    // The key is held until the heading moves, never for a fixed 1300 ms.
    // Turning integrates per frame, so a wall-clock hold on a loaded runner
    // can deliver too few frames to cross a compass sector. Holding until it
    // moves asserts the same thing (the keys still reach the game) and cannot
    // be starved into a false negative; if the keys are dead it times out,
    // which is the failure this exists to catch.
    const themeFocusHeading = await hudHeading(page)
    await page.keyboard.down('ArrowRight')
    try {
      await expect
        .poll(() => hudHeading(page), { timeout: 30000, intervals: [150] })
        .not.toBe(themeFocusHeading)
    } finally {
      await page.keyboard.up('ArrowRight')
    }

    // And Tab does not escape the modal.
    await page.keyboard.press('Tab')
    const after = await page.evaluate(() =>
      Boolean(
        document
          .getElementById('cityWalkLayer')
          ?.contains(document.activeElement)
      )
    )
    expect(after).toBe(true)
  })

  test('the toggles stay legible at rest and hovered, in every in-game state', async ({
    page,
  }) => {
    // Four states x two buttons x rest/hovered is sixteen hover-and-measure
    // cycles with a city rendering behind them, and CI draws that city in
    // software. It is the length that overruns the default 60 s, not any one
    // step: the assertions below are unchanged and still fail fast.
    test.setTimeout(180_000)
    // Every interaction below pays a longer action timeout than the 10 s
    // default. That default is a budget for finding and reaching a control,
    // and it is not enough on this page: the city is converted to characters
    // every frame, and on a software-rendering CI runner both a click and a
    // hover have failed at 10 s with Playwright's own log saying the element
    // was already visible and stable - a starved main thread, not a control
    // anyone could not reach. Nothing being asserted changes.
    const SLOW = { timeout: 45000 }
    await launchGame(page)
    await enterCity(page)

    // The layer forces the mono variant on, so the states the game can
    // actually be in are theme x high contrast. Each is reached by clicking
    // the real buttons, so the tokens under test are the shipped ones.
    // The 30 s timeout is for the runner, not the assertion: this reads static
    // CSS, but CI renders the city through SwiftShader and the converter holds
    // the main thread in long stretches, which the default 10 s can miss.
    const measure = (locator) =>
      locator.evaluate((el) => {
        const cs = getComputedStyle(el)
        const read = (css) =>
          (css.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number)
        const luminance = (rgb) =>
          rgb
            .map((v) => {
              const s = v / 255
              return s <= 0.03928
                ? s / 12.92
                : Math.pow((s + 0.055) / 1.055, 2.4)
            })
            .reduce((sum, c, i) => sum + [0.2126, 0.7152, 0.0722][i] * c, 0)
        const l1 = luminance(read(cs.color))
        const l2 = luminance(read(cs.backgroundColor))
        return {
          color: cs.color,
          background: cs.backgroundColor,
          ratio:
            Math.round(
              ((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)) * 100
            ) / 100,
        }
      }, undefined, { timeout: 30000 })

    const check = async (label) => {
      for (const [name, locator] of [
        ['high contrast', contrastBtn(page)],
        ['theme', themeBtn(page)],
      ]) {
        for (const state of ['rest', 'hovered']) {
          // The 10 s default action timeout is a budget for finding and
          // reaching a control, and it is not enough here: this page is
          // converting a 3D city to characters every frame, and on a
          // software-rendering CI runner a hover has failed at 10 s with
          // Playwright's own log saying the element was already visible and
          // stable (a starved main thread, not an unreachable button). Nothing
          // about what is being asserted changes.
          if (state === 'hovered') await locator.hover(SLOW)
          else await page.mouse.move(0, 0)
          await page.waitForTimeout(200)
          const m = await measure(locator)
          console.log(
            `[cw14] ${label} / ${name} / ${state}: ${m.color} on ${m.background} = ${m.ratio}:1`
          )
          expect(
            m.ratio,
            `${label} / ${name} / ${state} is ${m.color} on ${m.background} = ${m.ratio}:1`
          ).toBeGreaterThanOrEqual(4.5)
        }
      }
    }

    await themeBtn(page).click(SLOW) // auto -> light
    await check('mono light, contrast off')
    await contrastBtn(page).click(SLOW)
    await check('mono light, contrast on')
    await themeBtn(page).click(SLOW) // light -> dark
    await check('mono dark, contrast on')
    await contrastBtn(page).click(SLOW)
    await check('mono dark, contrast off')
  })

  test('axe: the in-game layer has no violations with a toggle pressed and hovered', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)
    await contrastBtn(page).click()
    await expect(contrastBtn(page)).toHaveAttribute('aria-pressed', 'true')
    // Hovering matters: a hover state is invisible to a scan unless
    // something is hovering, and the pressed pair is repainted here.
    await contrastBtn(page).hover()

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .include('#cityWalkLayer')
      .analyze()
    expectOnlyAllowedViolations(results)
  })
})

test.describe('ASCII City Walk — the loading line', () => {
  test('a held-up city download shows its progress line, then clears it', async ({
    page,
  }) => {
    await launchGame(page)

    // Hold the extract at the door: while the fetch waits, the player must
    // see (and a screen reader hear - role=status) that loading is under
    // way. The 1,300 m Seattle measured 47 s on Slow 4G; a silent
    // aria-busy alone is a dead screen for that long.
    let release
    const gate = new Promise((resolve) => {
      release = resolve
    })
    await page.route('**/examples/ascii-city/seattle.json', async (route) => {
      await gate
      await route.continue()
    })

    await page.getByRole('button', { name: 'Seattle, Washington' }).click()
    const status = page.locator('#cityWalkLoadStatus')
    await expect(status).toBeVisible()
    await expect(status).toHaveText('Loading Seattle, Washington…')
    await expect(status).toHaveAttribute('role', 'status')

    release()
    // With WebGL the city starts and the line clears; without it the
    // fallback screen appears instead - either way the line must not
    // linger.
    await expect(status).toBeHidden({ timeout: 60000 })
  })

  test('a failed city load clears the progress line and speaks the error', async ({
    page,
  }) => {
    await launchGame(page)
    await page.route('**/examples/ascii-city/seattle.json', (route) =>
      route.fulfill({ status: 503, body: 'busy' })
    )
    await page.getByRole('button', { name: 'Seattle, Washington' }).click()
    await expect(page.locator('#cityWalkStartError')).toBeVisible()
    await expect(page.locator('#cityWalkStartError')).toContainText(
      'could not be loaded'
    )
    await expect(page.locator('#cityWalkLoadStatus')).toBeHidden()
    // The picker recovers for another try.
    await expect(
      page.getByRole('button', { name: 'Seattle, Washington' })
    ).toBeEnabled()
  })
})

test.describe('ASCII City Walk — landmarks you can find, and progress that lasts', () => {
  const hud = (page) => page.locator('#cityWalkHudStatus')
  const announcer = (page) => page.locator('#cityWalkAnnouncer')
  const KEY = 'openscad-forge-city-walk-progress-seattle'

  const stats = (page) =>
    page.evaluate(
      () => window.__cityWalkGame?.altView?.getConvertStats?.()?.samples ?? 0
    )
  async function waitForConversions(page, n) {
    const from = await stats(page)
    await expect
      .poll(() => stats(page), { timeout: 60000 })
      .toBeGreaterThanOrEqual(from + n)
  }

  /** What the map's landmark marks actually are, asked of the scene. */
  const marks = (page) =>
    page.evaluate(() => {
      const g = window.__cityWalkGame
      const group = g.beacons.group
      const out = []
      for (const root of group.children) {
        const [halo, frame, core] = root.children
        out.push({
          scale: root.scale.x,
          selected: halo.visible,
          frameR: frame.geometry.parameters.radius,
          coreR: core.geometry.parameters.radius,
          coreHex: core.material.color.getHexString(),
          frameHex: frame.material.color.getHexString(),
          depthTest: frame.material.depthTest,
        })
      }
      return { count: out.length, marks: out, visible: group.visible }
    })

  test('a landmark mark is a mark: bright, holed, and a constant footprint', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)
    await page.keyboard.press('KeyM')
    await expect(hud(page)).toContainText('map view')

    const m = await marks(page)
    expect(m.visible).toBe(true)
    expect(m.count, 'no landmark marks were built').toBeGreaterThan(4)

    for (const one of m.marks) {
      // A bright outline only reads when it is wrapped around exact black:
      // exact black is the one value the converter renders as an empty cell,
      // and an empty patch inside a mark is a footprint no building in any
      // palette has. A bare bright ring is invisible in three palettes of five
      // while owning up to 1% of the frame.
      expect(one.coreHex, 'a landmark mark lost its exact-black core').toBe(
        '000000'
      )
      expect(one.frameHex).not.toBe('000000')
      // Never occluded by a tall building, like every other map mark.
      expect(one.depthTest).toBe(false)
      // The hole is really a hole: the core is inside the frame, not over it.
      expect(one.coreR).toBeLessThan(one.frameR)
      expect(one.coreR).toBeGreaterThan(0)
    }

    // One scale for every map mark. The player's square, the travel circle
    // and these diamonds all take applyMapCamera's number, so a mark holds its
    // footprint in glyphs rather than in ground (a mark sized in meters, such
    // as a 7 m beacon, is 0.85 cells wide and unfindable).
    const playerScale = await page.evaluate(
      () => window.__cityWalkGame.marker.scale.x
    )
    for (const one of m.marks) expect(one.scale).toBeCloseTo(playerScale, 6)

    // And zooming keeps them in step rather than letting them drift.
    await page.keyboard.down('PageUp')
    await page.waitForTimeout(500)
    await page.keyboard.up('PageUp')
    await waitForConversions(page, 2)
    const zoomed = await marks(page)
    const after = await page.evaluate(
      () => window.__cityWalkGame.marker.scale.x
    )
    expect(after).not.toBeCloseTo(playerScale, 3)
    for (const one of zoomed.marks) expect(one.scale).toBeCloseTo(after, 6)
  })

  test('selected and visited are footprints, not tones', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)
    await page.keyboard.press('KeyM')
    await expect(hud(page)).toContainText('map view')

    // Nothing selected to begin with.
    expect((await marks(page)).marks.filter((m) => m.selected)).toHaveLength(0)

    await page.keyboard.press('KeyL')
    await expect(announcer(page)).toContainText(/Landmark 1 of/)
    const afterSelect = await marks(page)
    // Exactly one, and selection is a halo (an outline change) rather than a
    // color change: a mark that differs only in tone cannot be found.
    expect(afterSelect.marks.filter((m) => m.selected)).toHaveLength(1)

    // Visited is a smaller mark that keeps its brightness and its hole, not a
    // tone: a dimmer mark changed 0.46% of the frame against a 0.000% control,
    // a real and repeatable change, and still photographed as the marks
    // disappearing into the map's own glyph noise. Changed is not readable.
    const before = (await marks(page)).marks
    const name = await page.evaluate(() => window.__cityWalkGame.landmarks[0].name)
    await page.evaluate((n) => {
      const g = window.__cityWalkGame
      g.beacons.setVisited(new Set([n]))
      g.altView.invalidate()
    }, name)
    const after = (await marks(page)).marks

    const shrank = after.filter((m, i) => m.frameR < before[i].frameR)
    expect(shrank, 'visited changed nothing about the footprint').toHaveLength(1)
    const i = after.findIndex((m, k) => m.frameR < before[k].frameR)
    // Still bright, and still holed: a visited landmark is a lesser mark, not
    // an absent one.
    expect(after[i].frameHex).toBe(before[i].frameHex)
    expect(after[i].coreHex).toBe('000000')
    expect(after[i].coreR).toBeLessThan(after[i].frameR)
    expect(after[i].coreR).toBeGreaterThan(0)
  })

  test('what you found is still found when you come back', async ({
    page,
  }) => {
    // SEEDED: the store decides what the game opens with.
    await page.addInitScript(
      ([key, value]) => localStorage.setItem(key, value),
      [
        KEY,
        JSON.stringify({
          visited: ['Space Needle'],
          allFound: false,
          fireworksUnlocked: true,
        }),
      ]
    )
    await launchGame(page)
    await enterCity(page)

    await expect(hud(page)).toContainText('landmarks 1/')
    await page.keyboard.press('KeyM')
    await expect(hud(page)).toContainText('map view')
    const seeded = await marks(page)
    const smaller = seeded.marks.filter(
      (m) => m.frameR < Math.max(...seeded.marks.map((x) => x.frameR))
    )
    expect(smaller, 'the seeded visit did not reach the map').toHaveLength(1)

    // And the legend agrees, which is the sighted half of the same fact.
    await expect(page.locator('#cityWalkLegend')).toContainText('Space Needle')
  })

  test('a real re-entry keeps what a real walk found', async ({
    page,
  }) => {
    test.setTimeout(120000)
    // Seeded storage proves the read. Only a real round trip proves the
    // write, and the write is the half a seeded test can never reach.
    await launchGame(page)
    await enterCity(page)

    const name = await page.evaluate(() => {
      const g = window.__cityWalkGame
      // Mark one through the game's own path, not by writing storage.
      const lm = g.landmarks[0]
      window.__cwMark(lm.name)
      return lm.name
    })
    await expect(hud(page)).toContainText('landmarks 1/')

    const stored = await page.evaluate((k) => localStorage.getItem(k), KEY)
    expect(stored, 'nothing was written').toBeTruthy()
    expect(JSON.parse(stored).visited).toContain(name)

    // Leave the city and come back in, the way a player would.
    await page.keyboard.press('Escape')
    await expect(page.locator('#cityWalkCard')).toBeVisible({ timeout: 20000 })
    await launchGame(page)
    await enterCity(page)
    await expect(hud(page)).toContainText('landmarks 1/')
    expect(
      await page.evaluate(() => [...window.__cityWalkGame.visited]),
      'the walk was forgotten across a real re-entry'
    ).toContain(name)
  })

  test('a completed city does not re-announce itself', async ({
    page,
  }) => {
    await page.addInitScript(
      ([key, value]) => localStorage.setItem(key, value),
      [KEY, JSON.stringify({ visited: [], allFound: true })]
    )
    await launchGame(page)
    await enterCity(page)

    // Walk into every landmark. The all-found line is a reward, and a reward
    // that fires every time you walk back in stops being one, so a city the
    // store already calls complete stays quiet. The trigger wants the
    // transition, which is why the flag is seeded rather than recomputed.
    await page.evaluate(() => {
      const g = window.__cityWalkGame
      for (const lm of g.landmarks) window.__cwMark(lm.name)
    })
    await page.waitForTimeout(600)
    await expect(announcer(page)).not.toContainText('All landmarks found')
  })
})

test.describe('ASCII City Walk — fireworks over the city', () => {
  const announcer = (page) => page.locator('#cityWalkAnnouncer')
  const KEY = 'openscad-forge-city-walk-progress-seattle'
  const btn = (page) => page.locator('#cityWalkFireworksBtn')

  const show = (page) =>
    page.evaluate(() => {
      const g = window.__cityWalkGame
      return {
        running: g.fireworks.isRunning(),
        stars: g.fireworks.group.children.filter((m) => m.visible).length,
        marks: g.fireworks.mapGroup.children.filter((m) => m.visible).length,
        unlocked: Boolean(g.fireworksUnlocked),
        prm: Boolean(g.motionReduced),
      }
    })

  const findEverything = (page) =>
    page.evaluate(() => {
      const g = window.__cityWalkGame
      for (const lm of g.landmarks) window.__cwMark(lm.name)
    })

  test('finishing a city plays the show, once, and leaves a button', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)

    // Nothing before the city is finished: the key and the button are both a
    // reward, and a reward you can take early is not one.
    expect(await show(page)).toMatchObject({ running: false, unlocked: false })
    await expect(btn(page)).toBeHidden()
    await page.keyboard.press('KeyY')
    expect((await show(page)).running).toBe(false)

    await findEverything(page)
    await expect(announcer(page)).toContainText('Fireworks over the city')
    await expect(btn(page)).toBeVisible()
    const lit = await show(page)
    expect(lit.unlocked).toBe(true)
    expect(lit.running).toBe(true)
    expect(lit.stars).toBeGreaterThan(0)

    // The unlock rides in the progress store's own object, not a sibling key:
    // an older build reading this must still find its visited list where it
    // left it.
    const stored = await page.evaluate(
      (k) => JSON.parse(localStorage.getItem(k)),
      KEY
    )
    expect(stored.fireworksUnlocked).toBe(true)
    expect(stored.allFound).toBe(true)
    expect(stored.visited.length).toBeGreaterThan(0)
  })

  test('a finished city does not re-fire, but the button still works', async ({
    page,
  }) => {
    await page.addInitScript(
      ([key, value]) => localStorage.setItem(key, value),
      [
        KEY,
        JSON.stringify({
          visited: ['Space Needle'],
          allFound: true,
          fireworksUnlocked: true,
        }),
      ]
    )
    await launchGame(page)
    await enterCity(page)

    // The button is here because the store says so, and nothing is playing:
    // walking back into a city you finished last week is not an occasion.
    await expect(btn(page)).toBeVisible()
    expect((await show(page)).running).toBe(false)

    await btn(page).click()
    await expect(announcer(page)).toContainText('Fireworks')
    expect((await show(page)).running).toBe(true)
  })

  test('reduced motion gets a picture, not a refusal', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await launchGame(page)
    await enterCity(page)
    await findEverything(page)

    // "Never nothing" is a claim about a picture: the bursts are composed and
    // held still, so a player who has asked the machine to stop moving things
    // still gets to see that they finished.
    const still = await show(page)
    expect(still.prm).toBe(true)
    expect(still.unlocked).toBe(true)
    expect(still.stars).toBeGreaterThan(0)
    // Held, not running - nothing animates and the step loop never touches it.
    expect(still.running).toBe(false)
    await expect(announcer(page)).toContainText('reduced motion')
  })

  test('WCAG 2.3.1: no more than three general flashes in any one second', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)

    // Face the ring and look up. A 2.3.1 number taken from a view with no
    // fireworks in it would be a lie by omission.
    await page.evaluate(async () => {
      const g = window.__cityWalkGame
      const wc = await import('/src/js/game/walk-controls.js')
      g.walkState.pitchRad = (38 * Math.PI) / 180
      const p = wc.firstPersonPose(g.walkState)
      g.fpCamera.position.set(...p.eye)
      g.fpCamera.lookAt(...p.target)
      g.altView.invalidate()
    })

    /**
     * Sampled per rendered frame, and the buffer is cleared every time.
     *
     * The overlay canvas is glyphs on transparency (the WebGL canvas beneath
     * it carries the black), so drawing it repeatedly onto one offscreen
     * buffer without clearing accumulates every frame that ever passed: a
     * deliberate strobe whose star count toggles 28/0/28/0 then produces a
     * luminance trace that only ever climbs.
     *
     * The loop is gated on the show's own state, not a clock, with a generous
     * outer bound.
     */
    const measured = await page.evaluate(async () => {
      const g = window.__cityWalkGame
      const canvas = document.querySelector('canvas.hfm-overlay-canvas')
      const w = 200
      const h = 120
      const off = document.createElement('canvas')
      off.width = w
      off.height = h
      const cx = off.getContext('2d', { willReadFrequently: true })
      const lin = (v) => {
        const c = v / 255
        return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
      }
      const sample = () => {
        cx.clearRect(0, 0, w, h)
        cx.drawImage(canvas, 0, 0, w, h)
        const d = cx.getImageData(0, 0, w, h).data
        let sum = 0
        for (let i = 0; i < d.length; i += 4) {
          sum +=
            0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2])
        }
        return sum / (w * h)
      }
      const out = []
      return await new Promise((resolve) => {
        const t0 = performance.now()
        g.fireworks.start()
        const tick = () => {
          const t = performance.now() - t0
          out.push([t, sample()])
          if (g.fireworks.isRunning() && t < 40000) requestAnimationFrame(tick)
          else resolve(out)
        }
        requestAnimationFrame(tick)
      })
    })

    /**
     * The bound is the assertion and the count is the corroboration, because
     * at this frame rate the count cannot fail.
     *
     * 2.3.1's general flash is a pair of opposing relative-luminance changes
     * of at least 10% where the darker is below 0.80. So if the whole show's
     * luminance range never reaches 10%, no such pair can exist and the count
     * is provably zero rather than merely measured zero. The bound is a
     * sufficient condition, and it survives a slow sampler: a burst blooms
     * over 1.6 s, so a handful of samples still catches its peak.
     *
     * The count does not survive it. This sampler runs at about seven samples
     * a second here (the e2e renders through SwiftShader where a headed
     * browser gives sixty), and a flash lasting 90 ms is aliased away. With
     * the show turned into a deliberate strobe the range went to 0.123 and
     * then 0.517, and the count assertion passed both times while the bound
     * failed both times. A guard that cannot fail is not a guard, so the
     * bound goes first and the count rides behind it as a second opinion.
     *
     * A headed run can count: zero general flashes over 1,436 samples at
     * 59.8/s, and the same instrument reads 17 flashes with a worst second of
     * 6 on the strobe.
     */
    const t = measured.map((m) => m[0])
    const lum = measured.map((m) => m[1])
    const spanS = (t[t.length - 1] - t[0]) / 1000
    const rate = measured.length / spanS
    const how =
      `${measured.length} samples over ${spanS.toFixed(1)}s ` +
      `= ${rate.toFixed(1)}/s`

    /**
     * The stimulus before the detector. A luminance range of zero is a pass if
     * the show ran and a lie if it did not, and the two look identical in the
     * number. The loop exits on isRunning(), which reduced motion deliberately
     * answers false to, so a runner with reduced motion forced on would sample
     * a still frame and "pass".
     */
    expect(
      spanS,
      `the show has to have RUN for a flash bound to mean anything, and this ` +
        `sampled ${how}. A near-zero span means it never started, or reduced ` +
        `motion held it still, not that it did not flash.`
    ).toBeGreaterThan(1)

    /**
     * And then a capability gate, not a count. On a CI runner the suite
     * renders through SwiftShader, where this sampler runs at about seven a
     * second against a headed browser's sixty, so a sample count can fail on
     * the sampler's speed while the accessibility bound, the thing anybody
     * actually cares about, is never evaluated. The bound goes first.
     *
     * What replaces the count is a gate on capability, the way `enterCity`
     * gates on WebGL rather than on a browser name: a sampler too coarse to
     * catch a bloom's peak has not measured this, and saying so is honest
     * where passing would not be. A burst blooms over 1.6 s, so three samples
     * inside one bloom is the floor worth having. Locally this runs at ~7/s
     * and clears it by a wide margin; nothing skips on a real machine.
     */
    const SAMPLES_PER_BLOOM = 3
    test.skip(
      rate * 1.6 < SAMPLES_PER_BLOOM,
      `this runner samples the canvas at ${rate.toFixed(1)}/s (${how}), which ` +
        `is under ${SAMPLES_PER_BLOOM} samples per 1.6s bloom - too coarse to ` +
        `resolve a flash, so 2.3.1 is NOT MEASURED here rather than passed`
    )

    const TH = 0.1
    const swing = Math.max(...lum) - Math.min(...lum)
    expect(
      swing,
      `the show swung ${swing.toFixed(4)} of relative luminance over ` +
        `${spanS.toFixed(1)}s at ${rate.toFixed(1)} samples/s; a general flash ` +
        `needs a PAIR of opposing changes of at least ${TH}, so a range under ` +
        `that is zero flashes by construction`
    ).toBeLessThan(TH)

    // The literal count, found with a hysteresis zig-zag. Pairing adjacent
    // local extrema instead splits every real swing into micro-steps.
    const turns = []
    let dir = 0
    let ext = lum[0]
    let extAt = t[0]
    let runMin = lum[0]
    let runMax = lum[0]
    let minAt = t[0]
    let maxAt = t[0]
    for (let i = 1; i < lum.length; i++) {
      const v = lum[i]
      if (dir === 1) {
        if (v > ext) {
          ext = v
          extAt = t[i]
        } else if (ext - v >= TH) {
          turns.push({ at: extAt, v: ext })
          dir = -1
          ext = v
          extAt = t[i]
        }
      } else if (dir === -1) {
        if (v < ext) {
          ext = v
          extAt = t[i]
        } else if (v - ext >= TH) {
          turns.push({ at: extAt, v: ext })
          dir = 1
          ext = v
          extAt = t[i]
        }
      } else {
        if (v > runMax) {
          runMax = v
          maxAt = t[i]
        }
        if (v < runMin) {
          runMin = v
          minAt = t[i]
        }
        if (runMax - v >= TH) {
          turns.push({ at: maxAt, v: runMax })
          dir = -1
          ext = v
          extAt = t[i]
        } else if (v - runMin >= TH) {
          turns.push({ at: minAt, v: runMin })
          dir = 1
          ext = v
          extAt = t[i]
        }
      }
    }
    const flashes = []
    for (let k = 1; k < turns.length; k++) {
      if (Math.min(turns[k - 1].v, turns[k].v) < 0.8) flashes.push(turns[k].at)
    }
    let worst = 0
    for (const f of flashes) {
      worst = Math.max(
        worst,
        flashes.filter((x) => x >= f && x < f + 1000).length
      )
    }
    expect(
      worst,
      `worst one-second window held ${worst} general flashes`
    ).toBeLessThanOrEqual(3)
  })
})

test.describe('ASCII City Walk — find the traveler', () => {
  const KEY = 'openscad-forge-city-walk-progress-seattle'
  const announcer = (page) => page.locator('#cityWalkAnnouncer')
  const bubble = (page) => page.locator('#cityWalkFoundDialog')

  const state = (page) =>
    page.evaluate(() => {
      const g = window.__cityWalkGame
      const at = g.traveler.position()
      return {
        found: Boolean(g.travelerFound),
        spot: g.travelerSpot,
        placed: g.traveler.isPlaced(),
        at,
        fromSpawn: at
          ? Math.hypot(at[0] - g.spawn.x, at[1] - g.spawn.y)
          : null,
      }
    })

  /**
   * Stand the player `d` meters due south of the traveler and face them.
   * The camera is posed through the app's own firstPersonPose, never by
   * writing walkState and hoping it followed.
   */
  const standOff = (page, d) =>
    page.evaluate(async (dist) => {
      const g = window.__cityWalkGame
      const wc = await import('/src/js/game/walk-controls.js')
      const s = g.travelerSpot
      g.walkState.x = s.x
      g.walkState.y = s.y - dist
      g.walkState.headingRad = 0
      const p = wc.firstPersonPose(g.walkState)
      g.fpCamera.position.set(...p.eye)
      g.fpCamera.lookAt(...p.target)
      g.altView.invalidate()
    }, d)

  test('stands one traveler far from the spawn, and remembers where', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)

    const first = await state(page)
    expect(first.placed).toBe(true)
    expect(first.found).toBe(false)
    // The reward is walked to. 150 m is the floor the placement enforces;
    // finding them in the first ten seconds is not a search.
    expect(
      Math.hypot(
        first.spot.x - (await page.evaluate(() => window.__cityWalkGame.spawn.x)),
        first.spot.y - (await page.evaluate(() => window.__cityWalkGame.spawn.y))
      )
    ).toBeGreaterThan(150)

    // The spot is written on first entry, so closing the tab cannot re-roll
    // the traveler, and it rides in the progress store's object rather than a
    // sibling key.
    const stored = await page.evaluate(
      (k) => JSON.parse(localStorage.getItem(k)),
      KEY
    )
    expect(stored.traveler.found).toBe(false)
    expect(stored.traveler.x).toBeCloseTo(first.spot.x, 6)
    expect(Array.isArray(stored.visited)).toBe(true)

    // And a second visit finds them in the SAME place. Through launchGame,
    // not page.reload(): the unlock rides in ITS query string, and a bare
    // reload comes back to a gated card that never opens.
    await launchGame(page)
    await enterCity(page)
    const second = await state(page)
    expect(second.spot.x).toBeCloseTo(first.spot.x, 9)
    expect(second.spot.y).toBeCloseTo(first.spot.y, 9)
    expect(second.found).toBe(false)
  })

  test('walking up to them opens a focus-safe bubble that persists', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)

    /**
     * The radius has to mean something, and this case has to be able to tell:
     * with the radius check deleted (the find firing at any distance), it must
     * fail.
     *
     * Asserting the bubble hidden before walking proves nothing, since the
     * defect passes it trivially, and a short timed walk proves nothing
     * either: at the seven frames a second this suite renders at, the player
     * may not have moved at all, and standing 30 m due south of the traveler
     * can put them against a building, where holding the key moves them
     * nowhere.
     *
     * So the claim is: after a movement frame has demonstrably run, and while
     * still outside the radius, nothing has fired. The snapshot is taken
     * inside the page at the first frame that qualifies, so there is no race
     * between the check and the approach.
     */
    await standOff(page, 9)
    await expect(bubble(page)).toBeHidden()
    await page.locator('#cityWalkViewport').click({ position: { x: 400, y: 300 } })
    await page.evaluate(() => {
      const g = window.__cityWalkGame
      window.__cw65 = { from: { x: g.walkState.x, y: g.walkState.y }, seen: null }
    })
    await page.keyboard.down('ArrowUp')
    await page.waitForFunction(
      () => {
        const g = window.__cityWalkGame
        const p = window.__cw65
        if (p.seen) return true
        const moved = Math.hypot(
          g.walkState.x - p.from.x,
          g.walkState.y - p.from.y
        )
        const d = Math.hypot(
          g.travelerSpot.x - g.walkState.x,
          g.travelerSpot.y - g.walkState.y
        )
        // A frame that moved, taken while still clear of the radius.
        if (moved > 0.5 && d > 6.8) {
          p.seen = {
            moved,
            d,
            found: Boolean(g.travelerFound),
            hidden: document.getElementById('cityWalkFoundDialog').hidden,
          }
          return true
        }
        return false
      },
      undefined,
      { timeout: 25000 }
    )
    const outside = await page.evaluate(() => window.__cw65.seen)
    expect(outside, 'no movement frame was observed outside the radius').toBeTruthy()
    expect(outside.found, `fired at ${outside.d.toFixed(1)}m`).toBe(false)
    expect(outside.hidden, `bubble open at ${outside.d.toFixed(1)}m`).toBe(true)

    // Still held, and held until it opens rather than for a fixed time. A
    // wall-clock hold is a bet on the frame rate, and this suite renders at
    // about seven frames a second where a headed browser gives sixty. The walk
    // steps in hops of PLAYER_RADIUS_M / 2, so it cannot tunnel past a 6 m
    // radius however slow the frames are; only the wait varies.
    await expect(bubble(page)).toBeVisible({ timeout: 25000 })
    await page.keyboard.up('ArrowUp')
    await expect(announcer(page)).toContainText('You found the traveler')
    // Focus moves to the one control the bubble has, so a keyboard player is
    // not left hunting for it.
    expect(await page.evaluate(() => document.activeElement?.id)).toBe(
      'cityWalkFoundCloseBtn'
    )

    const stored = await page.evaluate(
      (k) => JSON.parse(localStorage.getItem(k)),
      KEY
    )
    expect(stored.traveler.found).toBe(true)

    // Escape closes the bubble and nothing else: it is the innermost thing on
    // screen, one layer inside the travel dialog.
    await page.keyboard.press('Escape')
    await expect(bubble(page)).toBeHidden()
    await expect(page.locator('#cityWalkLayer')).toBeVisible()
    // Focus lands on a real control rather than <body>, which would kill every
    // key for the rest of the session.
    const focus = await page.evaluate(() => document.activeElement?.id)
    expect(focus).toBeTruthy()
    expect(focus).not.toBe('')
  })

  test('a city already found greets you with the companion and the badge', async ({
    page,
  }) => {
    // Seeded rather than walked, so this case tests the RE-ENTRY path on its
    // own - the walk is the previous case's job.
    await page.addInitScript(
      ([key, value]) => localStorage.setItem(key, value),
      [
        KEY,
        JSON.stringify({
          visited: [],
          allFound: false,
          traveler: { x: 400, y: 500, facing: 0, found: true },
        }),
      ]
    )
    await launchGame(page)
    await enterCity(page)

    const s = await state(page)
    expect(s.found).toBe(true)
    expect(s.placed).toBe(true)
    // The companion stands BESIDE the spawn, not on it: a companion underfoot
    // is the first thing a player collides with.
    expect(s.fromSpawn).toBeGreaterThan(0.5)
    expect(s.fromSpawn).toBeLessThan(6)

    await page.keyboard.press('KeyM')
    const badge = page.locator('.city-walk-legend-badge')
    await expect(badge).toContainText('Traveler found')
    // A text row, never an icon, and outside the numbered list: refreshLegend
    // indexes that list by game.landmarks[i], so an extra <li> would shift
    // every landmark's compass direction by one.
    expect(
      await page.evaluate(
        () =>
          document.querySelector('.city-walk-legend-badge')?.closest('li') ===
          null
      )
    ).toBe(true)
  })

  test('X carries the search, and goes quiet once they are found', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)

    const say = async (d) => {
      await standOff(page, d)
      await page.evaluate(() => {
        document.getElementById('cityWalkAnnouncer').textContent = ''
      })
      await page.keyboard.press('KeyX')
      await expect(announcer(page)).not.toHaveText('')
      return page.evaluate(
        () => document.getElementById('cityWalkAnnouncer').textContent
      )
    }

    /**
     * This clause is the search, not an accessibility extra: a whole person is
     * 2.5 x 4.2 character cells at 30 m, the jacket stops separating them from
     * the crowd by about 20 m, and the city is 2.6 km across. Nobody finds one
     * figure in that by looking, so the bands have to genuinely track
     * distance.
     */
    const near = await say(25)
    const mid = await say(200)
    const far = await say(900)
    expect(near).not.toBe(mid)
    expect(mid).not.toBe(far)
    expect(near).toContain('very near the traveler')
    expect(far).toContain('a long way from here')
    // Every band still carries the WHERE sentence it is appended to, because
    // an announcement that replaced the street name would cost a blind player
    // the map to buy them the game.
    for (const said of [near, mid, far]) expect(said).toContain('facing')

    // Silent once found: "an empty clause is never spoken" is this
    // function's own standing rule, and a warmer/colder hint about somebody
    // standing beside you is noise.
    await page.evaluate(() => {
      window.__cityWalkGame.travelerFound = true
      document.getElementById('cityWalkAnnouncer').textContent = ''
    })
    await page.keyboard.press('KeyX')
    await expect(announcer(page)).not.toHaveText('')
    const after = await page.evaluate(
      () => document.getElementById('cityWalkAnnouncer').textContent
    )
    expect(after).not.toContain('traveler')
    expect(after).toContain('facing')
  })

  test('axe: the traveler bubble has no violations', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)
    await standOff(page, 9)
    await page.locator('#cityWalkViewport').click({ position: { x: 400, y: 300 } })
    await page.keyboard.down('ArrowUp')
    await expect(bubble(page)).toBeVisible({ timeout: 25000 })
    await page.keyboard.up('ArrowUp')

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .include('#cityWalkLayer')
      .analyze()
    expectOnlyAllowedViolations(results)
  })
})

test.describe('ASCII City Walk — the whole-map draw distance', () => {
  test('the far skyline puts real ink where the near mesh ends', async ({
    page,
  }) => {
    test.setTimeout(120000)
    await launchGame(page)
    await enterCity(page)

    // A waterfront vantage: open foreground,
    // First Hill and downtown standing well past the 260 m boundary.
    await page.evaluate(() => {
      const g = window.__cityWalkGame
      const st = g.walkState
      st.x = -157
      st.y = -629
      st.headingRad = Math.atan2(900 - st.x, -100 - st.y)
      st.pitchRad = (6 * Math.PI) / 180
      st.groundZ = g.surface ? g.surface.heightAt(st.x, st.y) : 0
      const eyeZ = 1.7 + (st.groundZ ?? 0)
      g.fpCamera.position.set(st.x, st.y, eyeZ)
      g.fpCamera.lookAt(
        st.x + Math.sin(st.headingRad),
        st.y + Math.cos(st.headingRad),
        eyeZ + Math.tan(st.pitchRad)
      )
      g.altView.invalidate()
    })
    await page.waitForTimeout(1500)

    // Same-code control, as every pixel comparison needs: the only difference
    // between the two frames is the far mesh.
    await page.evaluate(() => {
      const g = window.__cityWalkGame
      g.scene.traverse((o) => {
        if (o.name === 'buildings-far') o.visible = false
      })
      g.altView.invalidate()
    })
    await page.waitForTimeout(1200)
    const off = await page.locator('#cityWalkViewport').screenshot()
    await page.evaluate(() => {
      const g = window.__cityWalkGame
      g.scene.traverse((o) => {
        if (o.name === 'buildings-far') o.visible = true
      })
      g.altView.invalidate()
    })
    await page.waitForTimeout(1200)
    const on = await page.locator('#cityWalkViewport').screenshot()

    const gained = await page.evaluate(
      async ([a, b]) => {
        const load = async (u) => {
          const i = new Image()
          i.src = u
          await i.decode()
          const c = document.createElement('canvas')
          c.width = i.width
          c.height = i.height
          c.getContext('2d').drawImage(i, 0, 0)
          return c.getContext('2d').getImageData(0, 0, c.width, c.height).data
        }
        const [p, q] = [await load(a), await load(b)]
        // Count pixels that were black without the far mesh and lit with it
        // - ink the skyline ADDED, not ink that moved.
        let lit = 0
        for (let i = 0; i < p.length; i += 4) {
          const offMax = Math.max(p[i], p[i + 1], p[i + 2])
          const onMax = Math.max(q[i], q[i + 1], q[i + 2])
          if (offMax < 8 && onMax > 24) lit++
        }
        return lit
      },
      [
        'data:image/png;base64,' + off.toString('base64'),
        'data:image/png;base64,' + on.toString('base64'),
      ]
    )
    // Measured at this pose: the far towers light tens of thousands of
    // pixels. The bar is a SHARE-shaped floor well under that but far
    // above noise (a whole character cell is ~18 px at the default size).
    expect(gained).toBeGreaterThan(2000)
  })
})

test.describe('ASCII City Walk — the ground has height', () => {
  test('walking inland from the waterfront climbs, and the eye rides the ground', async ({
    page,
  }) => {
    test.setTimeout(180000)
    await launchGame(page)
    await enterCity(page)

    // The Seattle spawn is on the waterfront; everything east goes up. Face up
    // the grade and hold W: the walker's groundZ and the camera must rise
    // together, smoothly, by meters.
    const start = await page.evaluate(() => {
      const g = window.__cityWalkGame
      const st = g.walkState
      st.x = -120
      st.y = -580
      st.headingRad = (78 * Math.PI) / 180
      g.lookTarget.headingRad = st.headingRad
      st.groundZ = g.surface.heightAt(st.x, st.y)
      return { groundZ: st.groundZ }
    })
    await page.keyboard.down('KeyW')
    // Sample as it walks: the climb must be continuous, and no single frame
    // may step the eye more than the kerb-ease law allows.
    //
    // The profile ends at either 600 frames or four meters of proven climb. A
    // software renderer's frames are seconds apart (600 of them outlive the
    // whole test) while its dt-clamped strides climb whole decimeters per
    // frame, so the gain arrives in far fewer samples there. Every sampled
    // pair still answers the smoothness law; a walker that never climbs still
    // runs the full 600 and fails the gain honestly.
    const profile = await page.evaluate(
      (z0) =>
        new Promise((resolve) => {
          const g = window.__cityWalkGame
          const zs = []
          const tick = () => {
            zs.push(g.walkState.groundZ)
            if (zs.length >= 600 || zs[zs.length - 1] - z0 > 4)
              return resolve(zs)
            requestAnimationFrame(tick)
          }
          requestAnimationFrame(tick)
        }),
      start.groundZ
    )
    await page.keyboard.up('KeyW')

    const gained = profile[profile.length - 1] - start.groundZ
    expect(gained).toBeGreaterThan(3)
    let worstStep = 0
    for (let i = 1; i < profile.length; i++) {
      worstStep = Math.max(worstStep, Math.abs(profile[i] - profile[i - 1]))
    }
    // The ease law: ground covered per frame at sprintless walk is ~0.16 m,
    // and easeGroundZ closes at most CURB_HEIGHT_M per CURB_EASE_M of
    // travel... a hill's own grade is gentler than a kerb, so half a kerb
    // per frame is generous headroom against a teleporting eye.
    expect(worstStep).toBeLessThan(0.15)

    const eye = await page.evaluate(() => ({
      camZ: window.__cityWalkGame.fpCamera.position.z,
      groundZ: window.__cityWalkGame.walkState.groundZ,
    }))
    expect(eye.camZ).toBeCloseTo(eye.groundZ + 1.7, 1)
  })

  test('the hills census: a span of real metres, skirts where slopes are, holes only outside the circle', async ({
    page,
  }) => {
    test.setTimeout(120000)
    await launchGame(page)
    await enterCity(page)

    const census = await page.evaluate(() => {
      const g = window.__cityWalkGame
      return {
        spanM: g.surface.terrain.spanM,
        holes: g.surface.terrain.filledHoles,
        skirts: g.city3d.stats.skirtsAdded,
        waterfront: g.surface.heightAt(-157, -629),
        firstHillWay: g.surface.heightAt(260, -480),
        center: g.surface.heightAt(-698, 880),
      }
    })
    // Seattle's bake spans ~105 m of relief; the shoreline sits within a
    // couple of metres of the datum; 380 m inland the ground stands past
    // 25 m; Seattle Center past 35. Wide floors, not knife-edges: a rebake
    // may move each by metres, but a FLAT city or a broken datum cannot
    // pass any of them.
    expect(census.spanM).toBeGreaterThan(60)
    expect(census.waterfront).toBeLessThan(8)
    expect(census.firstHillWay).toBeGreaterThan(25)
    expect(census.center).toBeGreaterThan(35)
    // The DEM answered everywhere inside the circle: the filled holes are
    // exactly the grid corners the circle never asked for.
    expect(census.holes).toBe(2012)
    // Downtown is a hillside: hundreds of buildings need their skirt.
    expect(census.skirts).toBeGreaterThan(500)
  })
})

test.describe('ASCII City Walk — the spoken slope', () => {
  const announcer = (page) => page.locator('#cityWalkAnnouncer')
  const pose = (page, x, y, headingDeg) =>
    page.evaluate(
      (q) => {
        const g = window.__cityWalkGame
        const st = g.walkState
        st.x = q.x
        st.y = q.y
        st.headingRad = (q.headingDeg * Math.PI) / 180
        g.lookTarget.headingRad = st.headingRad
        st.groundZ = g.surface.heightAt(st.x, st.y)
        // A fresh tracker per pose: the first reading arms silently, which
        // is the spawn law this suite relies on below.
        g.slope = { cat: null, pct: null, sinceM: Infinity }
      },
      { x, y, headingDeg }
    )

  test('walking onto a grade says Uphill, about-face says Downhill, and standing says nothing', async ({
    page,
  }) => {
    test.setTimeout(180000)
    await launchGame(page)
    await enterCity(page)

    // Start at the toe of the First Hill grade, facing up it, about 9 m from
    // the measured turnover (Uphill is announced by about -122,-578 on this
    // heading). A software-GL renderer walks at a tenth speed or worse under
    // the dt clamp, so a longer approach would outrun the 60 s window there
    // while proving nothing extra.
    await pose(page, -130, -583, 60)
    await page.keyboard.down('KeyW')
    // Climb until the grade is at least 4 percent, not merely announced: a
    // slow walker's FIRST sentence is the 2 percent toe, and 2 percent
    // reversed sits under the level threshold - probed at 20x throttle,
    // the about-face then said "Level." and wandered ninety metres before
    // any true downhill. Four percent reversed is a Downhill sentence
    // wherever the about-face happens.
    await expect(announcer(page)).toContainText(
      /Uphill ([4-9]|[1-9]\d) percent\./,
      // ~9 m to the grade turnover at CI software's ~0.23 m/s, plus the
      // strides the tracker needs past it - the bound follows the pace.
      { timeout: 180000 }
    )
    // Keep walking PAST the announced ground before turning: the grade is
    // a six-metre LOOKAHEAD, so the sentence speaks for ground the walker
    // has not stood on yet - probed at 20x throttle, an about-face taken
    // at the sentence still stands on the flat toe and honestly reads
    // "Level." going back. Eight metres clears the probe length wherever
    // the sentence fired.
    const atSentence = await page.evaluate(() => ({
      x: window.__cityWalkGame.walkState.x,
      y: window.__cityWalkGame.walkState.y,
    }))
    await expect
      .poll(
        () =>
          page.evaluate(
            (p) => {
              const w = window.__cityWalkGame.walkState
              return Math.hypot(w.x - p.x, w.y - p.y)
            },
            atSentence
          ),
        { timeout: 120000 }
      )
      .toBeGreaterThan(8)
    await page.keyboard.up('KeyW')
    // The walk does not end on the key release: the walker coasts a stride
    // first (0.36 m inside the next 250 ms on Firefox at the grade, then
    // still), and the slope sentence follows the ground it coasts over.
    // Sampling "standing still" at the release therefore catches a reading
    // that is still moving (14 percent to 17 on this grade while the walker
    // came to rest), which is the sentence doing its job, not repeating
    // itself. Wait for the walk to actually stop, then sample. The pair is
    // spaced on purpose: two samples read back to back are the same sample.
    await expect
      .poll(
        async () => {
          const where = () =>
            page.evaluate(() => {
              const w = window.__cityWalkGame.walkState
              return `${w.x},${w.y}`
            })
          const before = await where()
          await page.waitForTimeout(250)
          return (await where()) === before
        },
        { timeout: 30000 }
      )
      .toBe(true)

    // Standing still on the grade: the sentence does not repeat.
    const said = await announcer(page).textContent()
    await page.waitForTimeout(1500)
    expect(await announcer(page).textContent()).toBe(said)

    // About-face, walk back down: the same street is downhill now.
    await page.evaluate(() => {
      const g = window.__cityWalkGame
      g.walkState.headingRad =
        (g.walkState.headingRad + Math.PI) % (2 * Math.PI)
      g.lookTarget.headingRad = g.walkState.headingRad
    })
    await page.keyboard.down('KeyW')
    await expect(announcer(page)).toContainText(/Downhill \d+ percent\./, {
      timeout: 180000,
    })
    await page.keyboard.up('KeyW')
  })

  test('X names the slope underfoot, and level ground adds no clause', async ({
    page,
  }) => {
    test.setTimeout(120000)
    await launchGame(page)
    await enterCity(page)

    // On the grade, facing up: the X sentence carries the slope clause.
    await pose(page, -60, -565, 60)
    await page.keyboard.press('KeyX')
    await expect(announcer(page)).toContainText(/Uphill \d+ percent\./)

    // On level ground: the clause is absent - an empty clause is never
    // spoken (the whereAmI family's standing rule). 'Level' is a bearing
    // as much as a place (the shore tilts toward the water), so the test
    // asks the game's own terrain for a bearing under the threshold
    // rather than trusting a guessed compass point.
    await page.evaluate(() => {
      const g = window.__cityWalkGame
      const st = g.walkState
      st.x = -160
      st.y = -629
      for (let deg = 0; deg < 360; deg += 10) {
        const rad = (deg * Math.PI) / 180
        const ahead = g.surface.terrain.heightAt(
          st.x + Math.sin(rad) * 6,
          st.y + Math.cos(rad) * 6
        )
        const here = g.surface.terrain.heightAt(st.x, st.y)
        if (Math.abs(((ahead - here) / 6) * 100) < 1.4) {
          st.headingRad = rad
          g.lookTarget.headingRad = rad
          break
        }
      }
      st.groundZ = g.surface.heightAt(st.x, st.y)
      g.slope = { cat: null, pct: null, sinceM: Infinity }
    })
    await page.keyboard.press('KeyX')
    // The live region clears before it speaks; wait for the sentence.
    await expect(announcer(page)).toContainText('facing', { timeout: 5000 })
    const text = await announcer(page).textContent()
    expect(text).not.toContain('percent')
    expect(text).not.toContain('Level')
  })
})
