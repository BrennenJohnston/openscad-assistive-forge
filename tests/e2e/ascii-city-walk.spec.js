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

async function enterCity(page, cityName = 'Seattle, Washington') {
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
    await expect(page.locator('#cityWalkHudStatus')).toContainText(
      'facing north'
    )

    // Turning right for >1s moves the compass off north
    await page.keyboard.down('ArrowRight')
    await page.waitForTimeout(1300)
    await page.keyboard.up('ArrowRight')
    await expect(page.locator('#cityWalkHudStatus')).not.toContainText(
      'facing north'
    )

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

    // …and walking still walks.
    await page.keyboard.down('ArrowRight')
    await page.waitForTimeout(1300)
    await page.keyboard.up('ArrowRight')
    await expect(page.locator('#cityWalkHudStatus')).not.toContainText(
      'facing north'
    )

    await page.keyboard.press('Escape')
    await expect(page.locator('#cityWalkLayer')).toBeHidden()
  })
})

test.describe('ASCII City Walk — accessibility', () => {
  test('axe: city picker and in-game layer have no violations', async ({
    page,
  }) => {
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

    await enterCity(page)
    await page.keyboard.press('KeyH') // help open exercises the panel too

    const inGameResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .include('#cityWalkLayer')
      .analyze()
    expectOnlyAllowedViolations(inGameResults)
  })
})
