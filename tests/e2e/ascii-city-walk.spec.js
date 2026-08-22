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
    await expect(page.locator('#cityWalkHelpPanel')).toContainText(
      'smaller or larger characters (10% to 100%)'
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
    await expect(page.locator('#cityWalkHudStatus')).not.toContainText(
      'looking'
    )

    // Held R climbs; 45 deg/s means half a second cannot reach the clamp, so
    // this asserts real integration rather than a jump to the limit.
    await page.keyboard.down('KeyR')
    await page.waitForTimeout(600)
    await page.keyboard.up('KeyR')
    await expect
      .poll(async () => (await gaze(page)).pitch > 5 * DEG)
      .toBe(true)
    await expect(page.locator('#cityWalkHudStatus')).toContainText('looking up')

    // The bearing is untouched by looking up - pitch and yaw are separate.
    expect((await gaze(page)).heading).toBe(0)

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

    // F goes the other way, and the HUD words it differently.
    await page.keyboard.down('KeyF')
    await page.waitForTimeout(600)
    await page.keyboard.up('KeyF')
    await expect
      .poll(async () => (await gaze(page)).pitch < -5 * DEG)
      .toBe(true)
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

    // 200 px right and 100 px up at 0.25 deg/px: +50 deg of yaw, +25 of pitch.
    await dragViewport(page, 200, -100)
    await expect
      .poll(async () => Math.round((await gaze(page)).heading / DEG))
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

    // …and walking still walks. Exact label, not substring (see hudHeading).
    await page.keyboard.down('ArrowRight')
    await page.waitForTimeout(1300)
    await page.keyboard.up('ArrowRight')
    await expect.poll(() => hudHeading(page)).not.toBe('north')

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
    // asserting if the city still answers to it (CW-13's lesson).
    await page.keyboard.down('ArrowRight')
    await page.waitForTimeout(1300)
    await page.keyboard.up('ArrowRight')
    await expect.poll(() => hudHeading(page)).not.toBe('north')

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
          if (state === 'hovered') await locator.hover()
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

    await themeBtn(page).click() // auto -> light
    await check('mono light, contrast off')
    await contrastBtn(page).click()
    await check('mono light, contrast on')
    await themeBtn(page).click() // light -> dark
    await check('mono dark, contrast on')
    await contrastBtn(page).click()
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

test.describe('ASCII City Walk — the mouse-only toolbar (CW-15)', () => {
  const announcer = (page) => page.locator('#cityWalkAnnouncer')
  const btn = (page, id) => page.locator('#' + id)

  const walkPos = (page) =>
    page.evaluate(() => {
      const w = window.__cityWalkGame?.walkState
      return w ? { x: w.x, y: w.y } : null
    })

  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

  /** A counter that ticks with the game's own render loop. */
  const startFrameCounter = (page) =>
    page.evaluate(() => {
      window.__cwFrames = 0
      const tick = () => {
        window.__cwFrames++
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })

  const frameCount = (page) => page.evaluate(() => window.__cwFrames ?? 0)

  /** Wait until the game has rendered n more animation frames. */
  async function waitForFrames(page, n) {
    const from = await frameCount(page)
    await expect
      .poll(() => frameCount(page), { timeout: 20000 })
      .toBeGreaterThanOrEqual(from + n)
  }

  /** Settle function: hold for a fixed number of the game's own frames. */
  const forFrames = (page, n) => () => waitForFrames(page, n)

  /**
   * Press and hold a toolbar button with the real mouse until `settle`
   * resolves, then release and park the pointer clear of everything.
   *
   * NEVER hold for a wall-clock duration and then assert. The game only
   * moves inside animation frames, and a loaded CI runner can render NONE
   * inside a 700 ms window - which is exactly how the first version of this
   * suite went red on Edge in CI while passing three times over locally, on
   * the same browser, and again under a 25x CPU throttle. Parking the mouse
   * matters too: Playwright leaves it where it last acted, and an overlay
   * flow silently hovers whatever is under it.
   */
  async function holdButton(page, id, settle) {
    await btn(page, id).hover()
    await page.mouse.down()
    try {
      await settle()
    } finally {
      await page.mouse.up()
      await page.mouse.move(2, 2)
    }
  }

  test('a mouse alone walks, turns, and opens the map', async ({ page }) => {
    await launchGame(page)
    await enterCity(page)
    await expect(page.locator('#cityWalkToolbar')).toBeVisible()
    await startFrameCounter(page)
    await waitForFrames(page, 3)

    const start = await walkPos(page)
    await holdButton(page, 'cityWalkForwardBtn', () =>
      expect
        .poll(async () => distance(start, await walkPos(page)), {
          timeout: 15000,
        })
        .toBeGreaterThan(0.5)
    )

    // Holding Turn right moves the compass off north - to ANY other sector.
    // Exact label, not substring (see hudHeading).
    await expect.poll(() => hudHeading(page)).toBe('north')
    await holdButton(page, 'cityWalkTurnRightBtn', () =>
      expect.poll(() => hudHeading(page), { timeout: 15000 }).not.toBe('north')
    )

    await btn(page, 'cityWalkMapBtn').click()
    await expect(btn(page, 'cityWalkMapBtn')).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    await expect(page.locator('#cityWalkHudStatus')).toContainText('map view')
    await expect(announcer(page)).toHaveText(
      /The toolbar now shows the map buttons/
    )

    await btn(page, 'cityWalkMapBtn').click()
    await expect(btn(page, 'cityWalkMapBtn')).toHaveAttribute(
      'aria-pressed',
      'false'
    )
    await expect(page.locator('#cityWalkHudStatus')).toContainText(
      'street view'
    )
  })

  test('the map buttons arrive with the map, and the street buttons leave', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)
    await startFrameCounter(page)
    await waitForFrames(page, 3)

    const streetOnly = [
      'cityWalkLookUpBtn',
      'cityWalkLookDownBtn',
      'cityWalkFastBtn',
    ]
    const mapOnly = [
      'cityWalkCenterBtn',
      'cityWalkZoomOutBtn',
      'cityWalkZoomInBtn',
    ]

    for (const id of streetOnly) await expect(btn(page, id)).toBeVisible()
    for (const id of mapOnly) await expect(btn(page, id)).toBeHidden()

    await page.keyboard.press('KeyM')
    await expect(page.locator('#cityWalkHudStatus')).toContainText('map view')
    for (const id of streetOnly) await expect(btn(page, id)).toBeHidden()
    for (const id of mapOnly) await expect(btn(page, id)).toBeVisible()

    // The map buttons drive the map: held Zoom in zooms exponentially…
    const zoom = () => page.evaluate(() => window.__cityWalkGame.mapCam.zoom)
    await holdButton(page, 'cityWalkZoomInBtn', () =>
      expect.poll(zoom, { timeout: 15000 }).toBeGreaterThan(1.2)
    )
    await expect(page.locator('#cityWalkHudStatus')).not.toContainText(
      'zoom 1.0x'
    )

    // …a pan breaks follow mode, and Center on you restores it.
    const follow = () =>
      page.evaluate(() => window.__cityWalkGame.mapCam.follow)
    await holdButton(page, 'cityWalkStepRightBtn', () =>
      expect.poll(follow, { timeout: 15000 }).toBe(false)
    )

    // The 250 ms minimum step keeps the pan running for a moment after
    // the release - and a pan is what turns follow OFF - so let it finish
    // before asking Center on you to turn it back on.
    await page.waitForTimeout(400)
    await waitForFrames(page, 2)

    await btn(page, 'cityWalkCenterBtn').click()
    await expect(announcer(page)).toHaveText(/Map centered on you/)
    expect(await follow()).toBe(true)

    // Back on the street the swap reverses, and the toolbar says so.
    await btn(page, 'cityWalkMapBtn').click()
    await expect(announcer(page)).toHaveText(
      /The toolbar now shows the walking buttons/
    )
    for (const id of streetOnly) await expect(btn(page, id)).toBeVisible()
    for (const id of mapOnly) await expect(btn(page, id)).toBeHidden()
  })

  test('Enter on a hold button takes one step and then stops', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)

    await startFrameCounter(page)
    await waitForFrames(page, 3)

    const before = await walkPos(page)
    await btn(page, 'cityWalkForwardBtn').focus()
    await expect(btn(page, 'cityWalkForwardBtn')).toBeFocused()

    await page.keyboard.press('Enter')
    await expect
      .poll(async () => distance(before, await walkPos(page)), {
        timeout: 15000,
      })
      .toBeGreaterThan(0.15)

    // A key press has no release, so the step has to end by itself. If it
    // did not, the player would still be walking here. Measured in frames,
    // not milliseconds - a stalled runner would otherwise "prove" it
    // stopped simply by rendering nothing.
    await page.waitForTimeout(1000)
    await waitForFrames(page, 2)
    const settled = await walkPos(page)
    await waitForFrames(page, 10)
    expect(distance(settled, await walkPos(page))).toBeLessThan(0.05)
  })

  test('the speed, size, level and landmark buttons announce what they did', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)
    await expect(page.locator('#cityWalkHudStatus')).toContainText('speed 100%')

    await btn(page, 'cityWalkSpeedUpBtn').click()
    await expect(announcer(page)).toHaveText(/Walking speed 125 percent/)
    await expect(page.locator('#cityWalkHudStatus')).toContainText('speed 125%')
    await btn(page, 'cityWalkSpeedDownBtn').click()
    await expect(announcer(page)).toHaveText(/Walking speed 100 percent/)

    // The game opens at its own 50% default (CW-12), in ten-point steps.
    await btn(page, 'cityWalkCharDownBtn').click()
    await expect(announcer(page)).toHaveText(/Character size 40 percent/)
    await btn(page, 'cityWalkCharUpBtn').click()
    await expect(announcer(page)).toHaveText(/Character size 50 percent/)

    await btn(page, 'cityWalkLevelBtn').click()
    await expect(announcer(page)).toHaveText(/View level/)

    // Landmarks live on the map, so Next opens it exactly as L does.
    await btn(page, 'cityWalkLandmarkNextBtn').click()
    await expect(page.locator('#cityWalkHudStatus')).toContainText('map view')
    await expect(announcer(page)).toHaveText(/Landmark 1 of \d+: /)
    await btn(page, 'cityWalkLandmarkPrevBtn').click()
    await expect(announcer(page)).toHaveText(/Landmark \d+ of \d+: /)
  })

  test('Fast is a sticky toggle, because a mouse cannot hold Shift', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)

    await startFrameCounter(page)
    await waitForFrames(page, 3)

    const fast = btn(page, 'cityWalkFastBtn')
    await expect(fast).toHaveAttribute('aria-pressed', 'false')

    // The two legs are matched by FRAME COUNT, not by wall clock: distance
    // is a function of frames rendered, so comparing two fixed-duration
    // holds on a runner whose frame rate wanders compares nothing.
    const a = await walkPos(page)
    await holdButton(page, 'cityWalkForwardBtn', forFrames(page, 12))
    const b = await walkPos(page)
    const strolled = distance(a, b)
    expect(strolled).toBeGreaterThan(0.1)

    await fast.click()
    await page.mouse.move(2, 2)
    await expect(fast).toHaveAttribute('aria-pressed', 'true')
    await expect(announcer(page)).toHaveText('Fast walking on.')

    // FAST_SPEED_MPS is 2.5x WALK_SPEED_MPS; 1.5x is the margin that still
    // fails loudly if the toggle never reaches stepWalk.
    await holdButton(page, 'cityWalkForwardBtn', forFrames(page, 12))
    const hurried = distance(b, await walkPos(page))
    expect(
      hurried,
      `strolled ${strolled.toFixed(2)} m, hurried ${hurried.toFixed(2)} m`
    ).toBeGreaterThan(strolled * 1.5)

    await fast.click()
    await page.mouse.move(2, 2)
    await expect(fast).toHaveAttribute('aria-pressed', 'false')
    await expect(announcer(page)).toHaveText('Fast walking off.')
  })

  test('a click in the toolbar leaves the keyboard working (D-59 pattern)', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)

    await btn(page, 'cityWalkLevelBtn').click()
    const focus = await page.evaluate(() => ({
      id: document.activeElement?.id || document.activeElement?.tagName,
      inLayer: Boolean(
        document
          .getElementById('cityWalkLayer')
          ?.contains(document.activeElement)
      ),
    }))
    expect(focus.id).toBe('cityWalkLevelBtn')
    expect(focus.inLayer).toBe(true)

    await page.keyboard.down('ArrowRight')
    await page.waitForTimeout(1300)
    await page.keyboard.up('ArrowRight')
    await expect.poll(() => hudHeading(page)).not.toBe('north')
  })

  test('a hidden button hands its focus back instead of dropping it', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)

    // Focus a street-only button, then switch views with the key. The
    // button disappears under the focus; if focus fell to <body> every key
    // would die for the rest of the session (D-59).
    await btn(page, 'cityWalkLookUpBtn').focus()
    await page.keyboard.press('KeyM')
    await expect(page.locator('#cityWalkHudStatus')).toContainText('map view')

    const landed = await page.evaluate(
      () => document.activeElement?.id || document.activeElement?.tagName
    )
    expect(landed).toBe('cityWalkMapBtn')

    await page.keyboard.press('KeyM')
    await expect(page.locator('#cityWalkHudStatus')).toContainText(
      'street view'
    )
  })

  test('the height a session measured does not outlive it', async ({ page }) => {
    await launchGame(page)
    await enterCity(page)

    const measured = () =>
      page.evaluate(() =>
        document
          .getElementById('cityWalkLayer')
          .style.getPropertyValue('--city-walk-toolbar-height')
      )
    expect(parseInt(await measured(), 10)).toBeGreaterThan(40)

    await page.keyboard.press('Escape')
    await expect(page.locator('#cityWalkLayer')).toBeHidden()
    await page.locator('#cityWalkLaunchBtn').click()
    await expect(page.locator('#cityWalkLayer')).toBeVisible()

    // Back on the picker there is no toolbar, and the layer element
    // outlives the session that measured one - so the help panel must not
    // be shortened here by the last strip.
    expect(await measured()).toBe('0px')
  })

  test('the toolbar stays legible at rest and hovered, in every in-game state', async ({
    page,
  }) => {
    // The longest measurement in the lane - four states across three targets,
    // most of them hovered too. Same reason as CW-14's: length, not a step.
    test.setTimeout(180_000)
    await launchGame(page)
    await enterCity(page)

    // Measured against the layer's own background, because the group
    // captions have none of their own - a transparent element reports
    // rgba(0,0,0,0) and would score itself against black by accident.
    // The 30 s timeout is for the RUNNER, not the assertion: this reads
    // static CSS, but CI renders the city through SwiftShader and the
    // converter holds the main thread in long stretches.
    const measure = (locator) =>
      locator.evaluate((el) => {
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
        const cs = getComputedStyle(el)
        const own = cs.backgroundColor
        const opaque = own && !/rgba\(0, 0, 0, 0\)|transparent/.test(own)
        const background = opaque
          ? own
          : getComputedStyle(document.querySelector('.city-walk-layer'))
              .backgroundColor
        const l1 = luminance(read(cs.color))
        const l2 = luminance(read(background))
        return {
          color: cs.color,
          background,
          ratio:
            Math.round(
              ((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)) * 100
            ) / 100,
        }
      }, undefined, { timeout: 30000 })

    const check = async (label) => {
      const targets = [
        ['plain button', btn(page, 'cityWalkTurnLeftBtn'), true],
        ['pressed Fast', btn(page, 'cityWalkFastBtn'), true],
        ['group caption', page.locator('#cityWalkToolbarCameraLabel'), false],
      ]
      for (const [name, locator, hoverable] of targets) {
        for (const state of hoverable ? ['rest', 'hovered'] : ['rest']) {
          if (state === 'hovered') await locator.hover()
          else await page.mouse.move(2, 2)
          await page.waitForTimeout(200)
          const m = await measure(locator)
          console.log(
            `[cw15] ${label} / ${name} / ${state}: ${m.color} on ${m.background} = ${m.ratio}:1`
          )
          expect(
            m.ratio,
            `${label} / ${name} / ${state} is ${m.color} on ${m.background} = ${m.ratio}:1`
          ).toBeGreaterThanOrEqual(4.5)
        }
      }
    }

    // Fast is measured in its pressed state, which is the pair CW-14's rule
    // repaints and the one nothing else in the suite covers.
    await btn(page, 'cityWalkFastBtn').click()
    await expect(btn(page, 'cityWalkFastBtn')).toHaveAttribute(
      'aria-pressed',
      'true'
    )

    const contrastBtn = page.locator('#cityWalkContrastBtn')
    const themeBtn = page.locator('#cityWalkThemeBtn')

    await themeBtn.click() // auto -> light
    await check('mono light, contrast off')
    await contrastBtn.click()
    await check('mono light, contrast on')
    await themeBtn.click() // light -> dark
    await check('mono dark, contrast on')
    await contrastBtn.click()
    await check('mono dark, contrast off')
  })

  test('axe: the in-game layer has no violations with a toolbar button hovered', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)
    // A hover state is invisible to a scan unless something is hovering
    // (D-55), and the pressed pair is repainted on hover.
    await btn(page, 'cityWalkMapBtn').click()
    await expect(btn(page, 'cityWalkMapBtn')).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    await btn(page, 'cityWalkMapBtn').hover()

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .include('#cityWalkLayer')
      .analyze()
    expectOnlyAllowedViolations(results)
  })
})

test.describe('ASCII City Walk — C and T reach the toggles (CW-Q15)', () => {
  const announcer = (page) => page.locator('#cityWalkAnnouncer')

  const paletteSize = (page) =>
    page.evaluate(
      () => window.__cityWalkGame?.altView?.getPalette()?.length ?? null
    )

  test('C flips high contrast, and the button follows', async ({ page }) => {
    await launchGame(page)
    await enterCity(page)

    const contrastBtn = page.locator('#cityWalkContrastBtn')
    await expect(contrastBtn).toHaveAttribute('aria-pressed', 'false')
    expect(await paletteSize(page)).toBeNull()

    await page.keyboard.press('KeyC')
    await expect(page.locator('html')).toHaveAttribute(
      'data-high-contrast',
      'true'
    )
    await expect(contrastBtn).toHaveAttribute('aria-pressed', 'true')
    await expect(contrastBtn).toHaveAttribute(
      'aria-label',
      'Turn high contrast off'
    )
    await expect(announcer(page)).toHaveText('High contrast on.')
    await expect.poll(() => paletteSize(page)).toBeGreaterThanOrEqual(4)

    await page.keyboard.press('KeyC')
    await expect(page.locator('html')).not.toHaveAttribute(
      'data-high-contrast',
      'true'
    )
    await expect(contrastBtn).toHaveAttribute('aria-pressed', 'false')
    await expect(announcer(page)).toHaveText('High contrast off.')
    await expect.poll(() => paletteSize(page)).toBeNull()
  })

  test('T cycles the theme, and the visible label follows', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)

    const themeBtn = page.locator('#cityWalkThemeBtn')
    await expect(themeBtn).toHaveText('Theme: Auto')

    await page.keyboard.press('KeyT')
    await expect(themeBtn).toHaveText('Theme: Light')
    await expect(page.locator('html')).toHaveAttribute(
      'data-theme-setting',
      'light'
    )
    await expect(announcer(page)).toHaveText('Theme: Light')

    await page.keyboard.press('KeyT')
    await expect(themeBtn).toHaveText('Theme: Dark')
    await expect(announcer(page)).toHaveText('Theme: Dark')

    await page.keyboard.press('KeyT')
    await expect(themeBtn).toHaveText('Theme: Auto')
    await expect(announcer(page)).toHaveText('Theme: Auto (follows system)')

    // The game keeps playing through every flip.
    await expect(page.locator('#cityWalkHudStatus')).toContainText(
      'street view'
    )
  })

  test('both keys work on the city picker, before any city is loaded', async ({
    page,
  }) => {
    await launchGame(page)

    await page.keyboard.press('KeyC')
    await expect(page.locator('html')).toHaveAttribute(
      'data-high-contrast',
      'true'
    )
    await expect(announcer(page)).toHaveText('High contrast on.')

    await page.keyboard.press('KeyT')
    await expect(page.locator('#cityWalkThemeBtn')).toHaveText('Theme: Light')
    await expect(announcer(page)).toHaveText('Theme: Light')
  })

  test('Ctrl+T still belongs to the browser and the app, not the game', async ({
    page,
  }) => {
    await launchGame(page)
    await enterCity(page)

    await page.keyboard.press('KeyT')
    await expect(announcer(page)).toHaveText('Theme: Light')

    // The game's guard drops every ctrl/meta/alt combo before reaching its
    // own keys. The app's own chords are Ctrl+Shift+T and Ctrl+Shift+H — the
    // unshifted pair below was never bound to anything — so nothing at all
    // moves, and above all the GAME never answers a modified combo.
    await page.keyboard.press('Control+KeyT')
    await page.waitForTimeout(400)
    await expect(page.locator('html')).toHaveAttribute(
      'data-theme-setting',
      'light'
    )
    await expect(announcer(page)).toHaveText('Theme: Light')

    await page.keyboard.press('Control+KeyH')
    await page.waitForTimeout(400)
    await expect(page.locator('html')).not.toHaveAttribute(
      'data-high-contrast',
      'true'
    )
    await expect(announcer(page)).toHaveText('Theme: Light')
  })
})

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
      'Colour off. Press to show the city in colour.'
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
      'Colour on. The city is drawn in the retro palette.'
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
      'Colour off. The city is drawn in a single phosphor.'
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
      'Colour on. Press for a single-colour screen.'
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
      'O: colour on or off (off is a single-colour retro screen)'
    )
    await expect(help).toContainText(
      'High contrast, theme and colour: the three buttons at the top of the screen'
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
    // Longer than one green-plus-amber, so a change MUST have happened.
    await page.waitForTimeout(8000)
    const second = await headColours(page)
    expect(second, 'the signals never changed').not.toBe(first)

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
