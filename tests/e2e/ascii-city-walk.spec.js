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
 * ASCII City Walk (CW-5): the hidden game behind the Alt View unlock - getting
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
 * CW-11: the game is desktop-only, on the same viewport predicate as Classic
 * (U-10/Q-24a). ENTRY is what gates: a session already running survives any
 * resize, and Escape always leaves.
 *
 * Nothing here enters a city, so every case runs on every browser - no WebGL
 * capability gate needed.
 */
test.describe('ASCII City Walk — desktop-only gate (CW-11)', () => {
  const REASON_TEXT =
    'Desktop only for now. The city walk needs a wide landscape window. ' +
    'Try it on a computer, or widen this window.'

  test.describe('phone-shaped viewport', () => {
    // Plain viewport, set through test.use: isMobile is rejected by Firefox at
    // context creation, and a setViewportSize after load re-opens drawers
    // (UF-32).
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

      // Scanned WITH the gated button hovered (D-55): a hover state is
      // invisible to a scan unless something happens to be hovering.
      await page.locator('#cityWalkLaunchBtn').hover()

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .include('#cityWalkCard')
        .analyze()
      expectOnlyAllowedViolations(results)
    })

    /**
     * The gated button dims, so its label/surface pair is a COMPOSITE over the
     * card: the token guards in tests/unit/color-contrast.test.js cannot see
     * it, and axe skips contrast checks on aria-disabled controls. Nothing
     * would have caught this while writing CW-11: pinning the gated hover
     * background to --color-accent measured 1:1 in the mono variant, whose
     * D-58 rule flips a primary label TO the accent at a higher specificity -
     * amber on amber, the same erasure D-55/D-57/D-58 each found once. Same
     * shape as the D-57 guard in accessibility.spec.js, plus the opacity.
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
      // Q-24a's shape: the session STAYS. Nothing ejects a player mid-game.
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
    // CW-44: the spawn faces the clearest street, so the compass reference
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
    // launch card (UF-23 lesson: the trigger is captured explicitly).
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

test.describe('ASCII City Walk — map navigation and walking speed (CW-9)', () => {
  test('map view: keyboard zoom, pan breaks follow, Home recenters', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)

    await page.keyboard.press('KeyM')
    await expect(page.locator('#cityWalkHudStatus')).toContainText(
      'zoom 1.0x'
    )

    // Held PageUp zooms in exponentially (CW-Q41 moved map zoom here).
    //
    // The hold ends on a CONDITION, not on the clock. Zoom accrues per
    // rendered frame, so a fixed 700 ms buys however many frames the runner
    // happens to manage - and CW-50's kerbs added 22% more city geometry,
    // which was enough to make a loaded Firefox miss the bar once in a
    // seventeen-minute suite. The wall clock is the outer bound now, and the
    // zoom itself is the quota (the #148 shape).
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

  test('Minus sizes characters in BOTH views; PageUp and PageDown zoom the map (CW-38, CW-Q41)', async ({
    page,
  }) => {
    // The owner pressed Minus over the map to shrink the characters and got
    // a zoomed-out map instead - the same key meant two things depending on
    // a mode not shown anywhere near the key. CW-Q41 separates them.
    await launchGame(page)
    await enterCity(page)

    const scaleOf = () =>
      page.evaluate(() => window.__cityWalkGame.altView.getFontScale())
    const zoomOf = () =>
      page.evaluate(() => window.__cityWalkGame.mapCam.zoom)

    await page.keyboard.press('KeyM')
    await expect(page.locator('#cityWalkHudStatus')).toContainText('map view')

    // Minus over the map changes SIZE now, and leaves the zoom alone.
    const zoomBefore = await zoomOf()
    await page.keyboard.press('Minus')
    await expect(page.locator('#cityWalkAnnouncer')).toHaveText(
      /Character size 40 percent/
    )
    expect(await scaleOf()).toBeCloseTo(0.4, 5)
    expect(await zoomOf()).toBeCloseTo(zoomBefore, 5)

    // Equals brings it back, still without touching the zoom.
    await page.keyboard.press('Equal')
    await expect(page.locator('#cityWalkAnnouncer')).toHaveText(
      /Character size 50 percent/
    )
    expect(await zoomOf()).toBeCloseTo(zoomBefore, 5)

    // PageDown is a HELD zoom-out key, and the keyup releases the hold:
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
      /Character size 40 percent/
    )
    expect(await scaleOf()).toBeCloseTo(0.4, 5)
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
 * CW-Q36: the owner turned bloom on after seeing it photographed at their own
 * character size, and chose it over the alternative of leaving it built but
 * disabled. It had been off since Round 4. This pins that it is on and that
 * the radius stays under the value where lit shopfront panes stop having gaps
 * between them at the 10% floor - separation between characters being the
 * whole readability of an ASCII picture.
 */
test.describe('ASCII City Walk — bloom is on (CW-Q36)', () => {
  test('the city lights have a halo, and not so much of one that they merge', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)

    const crt = await page.evaluate(() =>
      window.__cityWalkGame.altView.getCrtEffects()
    )
    expect(crt.bloomPx, 'bloom is off again').toBeGreaterThan(0)
    // 1px closes the shopfront gaps at 2x4px cells; 0.75 does not. Measured,
    // photographed and chosen at the owner's size.
    expect(crt.bloomPx, 'bloom is wide enough to merge glyphs at the floor').toBeLessThan(1)
  })
})

/**
 * D-81: the phosphor trail lays each painted frame over a fading copy of the
 * one before, which is what gives movement a wake. Between the street and the
 * map those two pictures have nothing in common, so the wake became a double
 * exposure - the city shuttering over the map and back again, which is how
 * the owner reported it.
 *
 * Measured rather than eyeballed: the frame right after the toggle is
 * compared with the settled frame a moment later. With the trail carried over
 * they differ; with it dropped they are the same picture.
 */
test.describe('ASCII City Walk — the view cuts, it does not cross-fade (D-81)', () => {
  test('switching between map and street leaves no ghost of the other', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    await launchGame(page)
    await enterCity(page)
    await page.waitForTimeout(1500)
    await page.locator('#cityWalkViewport').click({ position: { x: 5, y: 5 } })

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
      // Wait for the converter to PAINT the new view before the 'immediate'
      // capture. Under session load the screenshot repeatedly landed before
      // the first new-view frame existed, and the diff then measured
      // map-vs-street (18.27 levels, three false reds in one day) instead
      // of any ghost. The ghost this test guards against lives IN the
      // painted frames - the persistence canvas blends over several, so the
      // first painted frames still carry it: re-proven by reinstating the
      // trap (fade 0.45, clearPersistence commented out), which reads a
      // MEASURED 0.87 carried levels against the 0.5 bar with this wait in
      // place.
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

test.describe('ASCII City Walk — character size (CW-12)', () => {
  const scaleOf = (page) =>
    page.evaluate(() => window.__cityWalkGame?.altView?.getFontScale() ?? null)

  test('steps in tens between the measured floor and 100%, and persists', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)

    // Opens at the game's own 50% default with nothing saved.
    expect(await scaleOf(page)).toBeCloseTo(0.5, 5)

    await page.keyboard.press('Equal')
    await expect(page.locator('#cityWalkAnnouncer')).toHaveText(
      /Character size 60 percent/
    )

    // Down to the floor: 60 → 10 is five steps.
    for (let i = 0; i < 5; i++) await page.keyboard.press('Minus')
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

    // The ceiling holds too — 250% is gone (CW-Q10).
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

  test('a saved Alt View preference seeds the game, snapped into range', async ({
    page,
  }) => {
    // 2.5 is a legal preview-slider value and far outside the game's range;
    // it must arrive as the game's 100% ceiling, not as 250%.
    await page.addInitScript(() => {
      localStorage.setItem('openscad-forge-hfm-font-scale', '2.5')
    })
    await launchGame(page)
    await enterCity(page)
    expect(await scaleOf(page)).toBeCloseTo(1, 5)
  })

  test('the help panel states the range it actually offers', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)
    await page.keyboard.press('KeyH')
    await expect(page.locator('#cityWalkHelpPanel')).toBeVisible()
    // CW-42: the bottom of the range is per machine, and the help says so.
    await expect(page.locator('#cityWalkHelpPanel')).toContainText(
      'smaller or larger characters, up to 100% ' +
        "(the smallest size is set by this machine's own speed)"
    )
  })
})

test.describe('ASCII City Walk — looking around (CW-13)', () => {
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
    // CW-44: the spawn faces the clearest street, so the bearing reference
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
    // The key is held until the gaze ARRIVES, not for a fixed 2.2 s. Pitch
    // integrates per FRAME with dt clamped to 0.1 s, so on a slow renderer
    // wall time and simulated time come apart: CI reached 45 deg in the 2.2 s
    // this used to allow. Polling for exactly 60 still proves the clamp - an
    // uncapped gaze sails past it and never equals 60, so this times out.
    await page.keyboard.down('KeyR')
    try {
      await expect
        .poll(async () => Math.round((await gaze(page)).pitch / DEG), {
          timeout: 30000,
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
    await launchGame(page)
    await enterCity(page)

    const before = await gaze(page)

    // Under the 4 px threshold this is a click, not a drag.
    const box = await page.locator('#cityWalkViewport').boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 2, box.y + box.height / 2 + 1)
    await page.mouse.up()
    expect(await gaze(page)).toEqual(before)

    // 200 px right and 100 px up at 0.25 deg/px: +50 deg of yaw, +25 of
    // pitch - RELATIVE to the CW-44 spawn bearing, which faces the
    // clearest street rather than a fixed north.
    const TAU_DEG = 360
    const startDeg = Math.round(before.heading / DEG)
    await dragViewport(page, 200, -100)
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

    // Positive control first: without proof the same press WORKS in street
    // view, "the map ignores it" would pass on a build that has no pitch at
    // all - which is exactly what the release base is.
    await page.keyboard.down('KeyR')
    await page.waitForTimeout(700)
    await page.keyboard.up('KeyR')
    await expect
      .poll(async () => (await gaze(page)).pitch > 5 * DEG)
      .toBe(true)
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

  test('D-59: a click in the viewport leaves the keyboard working', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)

    // Pre-existing since CW-4: the viewport is not focusable, so a plain
    // click sent focus to <body> - outside the layer the key listener is
    // bound to - and every key died for the rest of the session.
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
    await expect(page.locator('#cityWalkHelpPanel')).toContainText(
      'Drag with the mouse in street view: look around'
    )
  })
})

test.describe('ASCII City Walk — landmarks (CW-10)', () => {
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
    await expect(items.first()).toContainText('—')

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

test.describe('ASCII City Walk — high contrast (CW-6)', () => {
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

    // The dev handle proves the CW-Q2 gate: palette active under HC…
    const paletteOn = await page.evaluate(
      () => window.__cityWalkGame?.altView?.getPalette()?.length ?? 0
    )
    expect(paletteOn).toBeGreaterThanOrEqual(4)

    // …character size keys still work. The game opens at its own 50%
    // default now (CW-12), so one step up is 60, not 110.
    await page.keyboard.press('Equal')
    await expect(page.locator('#cityWalkAnnouncer')).toHaveText(
      /Character size 60 percent/
    )

    // …and walking still walks. Exact label, not substring (see
    // hudHeading); the reference heading is captured, never assumed north
    // (CW-44 spawns facing the clearest street).
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

test.describe('ASCII City Walk — accessibility toggles (CW-14)', () => {
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
    // CW-Q2: multicolour exists only under high contrast, and the game's
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

  test('a click on a header toggle leaves the keyboard working (D-59 pattern)', async ({
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
    // asserting if the city still answers to it (CW-13's lesson). The
    // reference heading is captured, never assumed north (CW-44).
    //
    // The key is held until the heading MOVES, never for a fixed 1300 ms.
    // Turning integrates per FRAME, so a wall-clock hold on a loaded runner
    // can deliver too few frames to cross a compass sector - measured, this
    // is exactly how it went red on a Chromium shard, still reading
    // "southeast" after the hold. Holding until it moves asserts the same
    // thing (the keys still reach the game) and cannot be starved into a
    // false negative; if the keys are dead it times out, which is the
    // failure this exists to catch.
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
    // anyone could not reach (D-79). Nothing being asserted changes.
    const SLOW = { timeout: 45000 }
    await launchGame(page)
    await enterCity(page)

    // The layer forces the mono variant on, so the states the game can
    // actually be in are theme x high contrast. Each is reached by clicking
    // the real buttons, so the tokens under test are the shipped ones.
    // The 30 s timeout is for the RUNNER, not the assertion: this reads static
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
          // stable - a starved main thread, not an unreachable button
          // (D-79). Nothing about what is being asserted changes.
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
    // something is hovering (D-55), and the pressed pair is repainted here.
    await contrastBtn(page).hover()

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .include('#cityWalkLayer')
      .analyze()
    expectOnlyAllowedViolations(results)
  })
})

test.describe('ASCII City Walk — the loading line (CW-44)', () => {
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
