import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

/**
 * ASCII City Walk (CW-5): the hidden game behind the Alt View unlock.
 *
 * The game never touches the WASM engine — the welcome card, layer, and
 * three.js scene are all independent of it — so nothing here waits for
 * data-wasm-ready.
 *
 * Same rule as accessibility.spec.js: the allowed-violations list is empty
 * and stays empty.
 */
const ALLOWED_AXE_VIOLATIONS = []

function expectOnlyAllowedViolations(results) {
  const unexpected = results.violations.filter(
    (v) => !ALLOWED_AXE_VIOLATIONS.includes(v.id)
  )
  const detail = unexpected
    .flatMap((v) =>
      v.nodes.map(
        (n) =>
          `${v.id} @ ${n.target.join(' ')} :: ${n.failureSummary.replace(/\s+/g, ' ')}`
      )
    )
    .join('\n')
  expect(
    unexpected.map((v) => v.id),
    `unexpected axe violations:\n${detail}`
  ).toEqual([])
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
  })
})

async function launchGame(page) {
  await page.goto('/?hfm=unlock')
  await expect(page.locator('#cityWalkCard')).toBeVisible({ timeout: 30000 })
  await page.locator('#cityWalkLaunchBtn').click()
  await expect(page.locator('#cityWalkLayer')).toBeVisible({ timeout: 20000 })
}

/**
 * The game is WebGL-only: startGame() cannot build a scene without a GL
 * context, so the app shows its accessible fallback and leaves the viewport
 * hidden. Firefox on Linux CI has no WebGL AT ALL - the main 3D preview falls
 * back there too - so the in-city cases have nothing to exercise there.
 *
 * Gate on the CAPABILITY, never on a browser name. These cases run wherever
 * WebGL exists (local Firefox included, where they pass), and they start
 * running again by themselves if CI ever gains it - no stale skip to clean up.
 * Everything BEFORE entering a city still runs on every browser: the layer,
 * the picker, the modal semantics, and the axe scan.
 */
async function webglAvailable(page) {
  return page.evaluate(() => {
    try {
      const canvas = document.createElement('canvas')
      return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'))
    } catch {
      return false
    }
  })
}

/**
 * The compass word from the HUD line, exactly. Never assert headings with
 * substring matching: "northeast" and "northwest" CONTAIN "north" (and the
 * south pair contains "south"), so not.toContainText('facing north') fails
 * on a turn that lands one sector over - which is precisely what Edge's
 * frame cadence produced, and what reddened this suite three develop runs
 * in a row (AF-E).
 */
const hudHeading = (page) =>
  page
    .locator('#cityWalkHudStatus')
    .innerText()
    .then((t) => t.match(/facing (\w+)/)?.[1] ?? null)

async function enterCity(page, cityName = 'Seattle, Washington') {
  test.skip(
    !(await webglAvailable(page)),
    'This browser has no WebGL, so the 3D city cannot start.'
  )
  await page.getByRole('button', { name: cityName }).click()
  await expect(page.locator('#cityWalkViewport')).toBeVisible({
    timeout: 30000,
  })
  await expect(page.locator('#cityWalkHudStatus')).toContainText(
    'street view',
    { timeout: 15000 }
  )
}

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
    await expect.poll(() => hudHeading(page)).toBe('north')

    // Turning right for >1s moves the compass off north - to ANY other
    // sector. Exact label, not substring (see hudHeading).
    await page.keyboard.down('ArrowRight')
    await page.waitForTimeout(1300)
    await page.keyboard.up('ArrowRight')
    await expect.poll(() => hudHeading(page)).not.toBe('north')

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

    // Held Equal zooms in exponentially.
    await page.keyboard.down('Equal')
    await page.waitForTimeout(700)
    await page.keyboard.up('Equal')
    const hud = await page.textContent('#cityWalkHudStatus')
    const zoom = parseFloat(/zoom (\d+\.\d)x/.exec(hud)?.[1] ?? '0')
    expect(zoom).toBeGreaterThan(1.2)

    // Panning breaks player-follow (asserted via the DEV handle).
    await page.keyboard.down('ArrowRight')
    await page.waitForTimeout(400)
    await page.keyboard.up('ArrowRight')
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

    // …character size keys still work…
    await page.keyboard.press('Equal')
    await expect(page.locator('#cityWalkAnnouncer')).toHaveText(
      /Character size 110 percent/
    )

    // …and walking still walks. Exact label, not substring (see hudHeading).
    await page.keyboard.down('ArrowRight')
    await page.waitForTimeout(1300)
    await page.keyboard.up('ArrowRight')
    await expect.poll(() => hudHeading(page)).not.toBe('north')

    await page.keyboard.press('Escape')
    await expect(page.locator('#cityWalkLayer')).toBeHidden()
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
