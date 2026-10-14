/**
 * The size and triangle count under the preview belong to the model on
 * screen. A preview that fails leaves no model, so they go too; and a
 * format with no triangles (a 2D drawing) is not told it has none.
 *
 * @license GPL-3.0-or-later
 */
import { test, expect } from '@playwright/test'
import path from 'path'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
  })
})

async function upload(page, fixture) {
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: 120_000,
  })
  await page.setInputFiles(
    '#fileInput',
    path.join(process.cwd(), 'tests', 'fixtures', fixture)
  )
  const notNow = page.locator('#saveProjectNotNow')
  if (await notNow.waitFor({ timeout: 15_000 }).then(() => true, () => false)) {
    await notNow.click()
  }
}

test('a failed preview clears the size and triangle count', async ({ page }) => {
  test.setTimeout(240_000)
  await page.goto('/?example=simple-box')
  await expect(page.locator('.preview-state-indicator')).toHaveClass(
    /state-current/,
    { timeout: 120_000 }
  )
  await expect(page.locator('#previewStatusStats')).toContainText('triangles')
  await upload(page, 'invalid-syntax.scad')
  await expect(page.locator('.preview-state-indicator')).toHaveClass(
    /state-error/,
    { timeout: 120_000 }
  )
  await expect(page.locator('#previewStatusStats')).toHaveText('')
  await expect(page.locator('#stats')).toHaveText('')
})

test("a return to a preview drawn before brings back that preview's messages", async ({
  page,
}) => {
  test.setTimeout(240_000)
  await page.goto('/?example=braille-sign')
  const state = page.locator('.preview-state-indicator')
  const drawer = page.locator('#echoDrawerLabel')
  await expect(state).toHaveClass(/state-current/, { timeout: 120_000 })
  const notNow = page.locator('#saveProjectNotNow')
  if (await notNow.isVisible().catch(() => false)) await notNow.click()
  await expect(drawer).toHaveText(/^OpenSCAD Messages \(\d+ echo\)$/)
  const shown = await drawer.textContent()

  const param = 'rounded_dot_base_diameter'
  await page.evaluate((name) => {
    let group = document
      .querySelector(`.param-control[data-param-name="${name}"]`)
      ?.closest('details')
    while (group) {
      group.open = true
      group = group.parentElement?.closest('details')
    }
  }, param)
  const box = page
    .locator(`.param-control[data-param-name="${param}"] input[type="number"]`)
    .first()
  const drawn = await box.inputValue()

  // The model's own range check stops the run, and says why.
  await box.fill('1.4')
  await box.press('Enter')
  await expect(state).toHaveClass(/state-error/, { timeout: 120_000 })
  await expect(drawer).toHaveText('OpenSCAD Messages (1 error)')

  // Back to the value drawn at load: the cached preview, with its own messages.
  await box.fill(drawn)
  await box.press('Enter')
  await expect(state).toHaveText(/Preview \(cached\)/, { timeout: 120_000 })
  await expect(drawer).toHaveText(shown)
})
