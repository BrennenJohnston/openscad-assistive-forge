/**
 * Shared fixtures for the ASCII City Walk suites (D-72).
 *
 * The City Walk's e2e cases used to live in one 3,000-line file that cost
 * eighteen CI minutes - a quarter of the whole browser lane, and half of one
 * shard once the lanes were packed by cost. Two workers then spent most of
 * that shard running 3D city sessions at the same time on a two-core runner
 * with software rendering, which made the city cases slower and flakier than
 * they had been. The suites are split so the packer can put them on different
 * shards; these helpers are what they had in common, moved verbatim.
 */
import { test, expect } from '@playwright/test'

/**
 * Same rule as accessibility.spec.js: the allowed-violations list is empty
 * and stays empty.
 */
export const ALLOWED_AXE_VIOLATIONS = []

export function expectOnlyAllowedViolations(results) {
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

/**
 * Every City Walk suite starts past the first-visit chrome, and with the
 * CW-42 entry calibration INERT: an empty forced-probe map makes the pass
 * abort on its first frame - no probing, no stored floor, no applied
 * default - so every spec that is not about calibration keeps the
 * deterministic pre-calibration world. CI renders in software and must
 * never time real frames. A calibration spec overrides the global with its
 * own forced readings in a later addInitScript (later scripts run later,
 * so a plain assignment wins).
 */
export function useCityWalkFixtures() {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('openscad-forge-first-visit-seen', 'true')
      localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
      window.__cityWalkCalibrationForce = {}
    })
  })
}

export async function launchGame(page) {
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
 */
export async function webglAvailable(page) {
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
export const hudHeading = (page) =>
  page
    .locator('#cityWalkHudStatus')
    .innerText()
    .then((t) => t.match(/facing (\w+)/)?.[1] ?? null)

export async function enterCity(page, cityName = 'Seattle, Washington') {
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
