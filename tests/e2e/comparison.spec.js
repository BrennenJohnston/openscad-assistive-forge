/**
 * Comparison: a variant's Edit takes its values back to the Customizer.
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test'
import path from 'path'
import {
  announcementMark,
  announcementsSince,
  attachInvariants,
  expectNoPageErrors,
  recordAnnouncements,
} from './helpers/invariants.js'

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

async function start(page) {
  await page.goto('/')
  await page.waitForSelector('body[data-wasm-ready="true"]', { state: 'attached', timeout: 120_000 })
  await loadFixture(page, 'sample.scad')
}

/** The actions drawer holds Compare and Queue; open it if collapsed. */
async function addToComparison(page) {
  const btn = page.locator('#addToComparisonBtn')
  if (!(await btn.isVisible())) await page.locator('#actionsDrawerToggle').click()
  await btn.click()
  await expect(page.locator('#comparisonView')).toBeVisible()
}

async function setWidth(page, value) {
  await page.evaluate(() => {
    for (const group of document.querySelectorAll('details.param-group')) group.open = true
  })
  const box = page.locator('#param-width-spinbox')
  await box.fill(String(value))
  await box.press('Enter')
  await expect(box).toHaveValue(String(value))
}

const cards = (page) => page.locator('#comparisonView [id^="variant-card-"]')

test('Edit takes a variant back to the Customizer with its values', async ({ page }) => {
  test.setTimeout(300_000)
  attachInvariants(page)
  await recordAnnouncements(page)
  await start(page)

  await setWidth(page, 61)
  await addToComparison(page)
  await expect(cards(page).first().locator('.variant-status')).toContainText('triangles', {
    timeout: RENDER_TIMEOUT,
  })
  await page.getByRole('button', { name: 'Return to customizer' }).click()
  await setWidth(page, 50)
  await addToComparison(page)
  await expect(cards(page)).toHaveCount(2)

  const mark = await announcementMark(page)
  await cards(page).first().getByRole('button', { name: 'Edit parameters' }).click()

  await expect(page.locator('#mainInterface')).toBeVisible()
  await expect(page.locator('#param-width-spinbox')).toHaveValue('61')
  // The status line moves on to the preview's own news at once, so what was
  // said is read from the announcer's record rather than the line.
  await expect
    .poll(async () =>
      (await announcementsSince(page, mark)).some(
        (a) => a.region === '#srAnnouncer' && a.text === 'Editing Variant 1'
      )
    )
    .toBe(true)
  expectNoPageErrors(page)
})
