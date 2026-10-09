/**
 * Loading another project: nothing of the one before it stays behind.
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test'
import path from 'path'
import { attachInvariants, expectNoPageErrors } from './helpers/invariants.js'

const RENDER_TIMEOUT = 120_000

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
  })
})

async function loadFixture(page, name) {
  await page.locator('#fileInput').setInputFiles(path.join(process.cwd(), 'tests', 'fixtures', name))
  await expect(page.locator('#mainInterface')).toBeVisible({ timeout: 30_000 })
  const notNow = page.locator('#saveProjectNotNow')
  if (await notNow.isVisible().catch(() => false)) await notNow.click()
  await expect(page.locator('.preview-state-indicator')).toHaveClass(/state-current/, {
    timeout: RENDER_TIMEOUT,
  })
}

/** The actions drawer holds Compare and Queue; open it if collapsed. */
async function addToComparison(page) {
  const btn = page.locator('#addToComparisonBtn')
  if (!(await btn.isVisible())) await page.locator('#actionsDrawerToggle').click()
  await btn.click()
  await expect(page.locator('#comparisonView')).toBeVisible()
}

const cards = (page) => page.locator('#comparisonView [id^="variant-card-"]')

test.describe('Loading another project', () => {
  test.setTimeout(300_000)

  // A variant renders the project the comparison holds, so one left over
  // from the last project would render as the new one under its old name.
  test("the comparison holds only the new project's variants", async ({ page }) => {
    attachInvariants(page)
    await page.goto('/')
    await page.waitForSelector('body[data-wasm-ready="true"]', { state: 'attached', timeout: 120_000 })
    await loadFixture(page, 'sample.scad')
    await addToComparison(page)
    await expect(cards(page)).toHaveCount(1)
    await page.getByRole('button', { name: 'Return to customizer' }).click()

    await loadFixture(page, 'sample-advanced.scad')
    await addToComparison(page)

    await expect(cards(page)).toHaveCount(1)
    expectNoPageErrors(page)
  })
})
