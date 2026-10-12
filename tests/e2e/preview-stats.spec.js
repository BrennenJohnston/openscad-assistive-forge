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
