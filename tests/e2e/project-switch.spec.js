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

async function waitForEngine(page) {
  await page.waitForSelector('body[data-wasm-ready="true"]', { state: 'attached', timeout: 120_000 })
}

async function setNumber(page, name, value) {
  await page.evaluate(() => {
    for (const group of document.querySelectorAll('details.param-group')) group.open = true
  })
  const box = page.locator(`#param-${name}-spinbox`)
  await box.fill(String(value))
  await box.press('Enter')
}

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

  // A link's values are for the design it opens with. The first design here
  // has no width, so the link's width is reported and ignored; the next
  // design must open at its own default with nothing reported.
  test("a link's values and notice stay with the project they arrived with", async ({ page }) => {
    attachInvariants(page)
    await page.goto('/#v=1&params={"width":61}')
    await waitForEngine(page)
    await loadFixture(page, 'console-echo.scad')
    await expect(page.locator('#parameterNotices')).toBeVisible()

    await loadFixture(page, 'sample-advanced.scad')

    await expect(page.locator('#param-width-spinbox')).toHaveValue('50')
    await expect(page.locator('#parameterNotices')).toBeHidden()
    expectNoPageErrors(page)
  })

  test("the last project's file is not offered for download", async ({ page }) => {
    attachInvariants(page)
    await page.goto('/')
    await waitForEngine(page)
    await loadFixture(page, 'sample.scad')
    await page.locator('#primaryActionBtn').click()
    await expect(page.locator('#primaryActionBtn')).toHaveAttribute('data-action', 'download', {
      timeout: RENDER_TIMEOUT,
    })

    await loadFixture(page, 'sample-advanced.scad')

    await expect(page.locator('#downloadFallbackLink')).toBeHidden()
    await expect(page.locator('#primaryActionBtn')).toHaveAttribute('data-action', 'generate')
    expectNoPageErrors(page)
  })

  // The messages under the preview are the shown preview's messages. Going
  // back to values already previewed reuses that preview, and must bring
  // back its messages too, not keep the failed render's error.
  test('a preview of earlier values shows their messages, not the last error', async ({ page }) => {
    attachInvariants(page)
    await page.goto('/')
    await waitForEngine(page)
    const scad = ['width = 50; // [10:100]', 'assert(width < 80, "width must stay under 80");', 'cube([width, 10, 10]);', ''].join('\n')
    await page.locator('#fileInput').setInputFiles({ name: 'guarded.scad', mimeType: 'text/plain', buffer: Buffer.from(scad) })
    const notNow = page.locator('#saveProjectNotNow')
    if (await notNow.isVisible().catch(() => false)) await notNow.click()
    const indicator = page.locator('.preview-state-indicator')
    await expect(indicator).toHaveClass(/state-current/, { timeout: RENDER_TIMEOUT })
    const messages = page.locator('#echoDrawerLabel')

    await setNumber(page, 'width', 90)
    await expect(messages).toContainText('error', { timeout: RENDER_TIMEOUT })
    await setNumber(page, 'width', 50)
    await expect(indicator).toHaveClass(/state-current/, { timeout: RENDER_TIMEOUT })

    await expect(messages).not.toContainText('error')
  })
})

test.describe('Closing a project', () => {
  test('the Main Page names no file after Close Project', async ({ page }) => {
    attachInvariants(page)
    await page.goto('/')
    await waitForEngine(page)
    await loadFixture(page, 'sample.scad')
    await expect(page.locator('#fileInfoSummary')).toHaveText('sample.scad')
    const mode = page.locator('#uiModeToggle')
    if ((await mode.getAttribute('aria-checked')) !== 'true') await mode.click()

    await page.locator('#fileMenuBtn').click()
    await page
      .locator('#fileMenuItems button')
      .filter({ has: page.getByText('Close Project', { exact: true }) })
      .first()
      .click()
    await page
      .getByRole('alertdialog', { name: 'Go back to the Main Page?' })
      .getByRole('button', { name: 'Confirm' })
      .click()
    await expect(page.locator('#welcomeScreen')).toBeVisible()

    await expect(page.locator('#fileInfoSummary')).toHaveText('')
    expectNoPageErrors(page)
  })
})
