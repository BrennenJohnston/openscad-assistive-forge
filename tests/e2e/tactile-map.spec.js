/**
 * The Tactile Map tile in the app: its panel above the controls, a preview
 * that renders, and an axe scan of the page.
 *
 * @license GPL-3.0-or-later
 */
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const ALLOWED_AXE_VIOLATIONS = []
const WASM_READY_TIMEOUT = 180_000
const PREVIEW_TIMEOUT = 120_000

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
  })
})

async function dismissSavePrompt(page) {
  const notNow = page.locator('#saveProjectNotNow')
  try {
    await notNow.waitFor({ state: 'visible', timeout: 5000 })
    await notNow.click()
    await notNow.waitFor({ state: 'hidden', timeout: 5000 })
  } catch {
    // Prompt didn't appear
  }
}

async function openTactileMap(page) {
  await page.goto('/?example=tactile-map')
  await expect(page.locator('#mainInterface')).toBeVisible({ timeout: 20000 })
  await expect(page.locator('#tactileMapPanel')).toBeVisible({ timeout: 15000 })
  await dismissSavePrompt(page)
}

test.describe('Tactile Map tile', () => {
  test('the panel sits above the controls and names the plates', async ({ page }) => {
    await openTactileMap(page)
    await expect(page.locator('#tactileMapPanel h2')).toHaveText('Tactile map plates')
    await expect(page.locator('#tactileMapSummary')).toHaveText(
      '4 plates of 240 x 180 mm, A1 to B2.',
      { timeout: 10000 }
    )
    const radios = page.locator('#tactileMapPlates input[type="radio"]')
    await expect(radios).toHaveCount(5)
  })

  test('the preview renders the whole map, then plate A1 at 240 x 180', async ({ page }) => {
    test.setTimeout(240_000)
    await openTactileMap(page)
    await page.waitForSelector('body[data-wasm-ready="true"]', {
      state: 'attached',
      timeout: WASM_READY_TIMEOUT,
    })
    await expect(page.locator('.preview-state-indicator')).toHaveClass(/state-current/, {
      timeout: PREVIEW_TIMEOUT,
    })
    await page.locator('#tactileMapPlates input[value="A1"]').check()
    await expect(page.locator('#param-map_width_mm-spinbox')).toHaveValue('240', {
      timeout: 10000,
    })
    await expect(page.locator('.preview-state-indicator')).toHaveClass(/state-current/, {
      timeout: PREVIEW_TIMEOUT,
    })
    await expect(page.locator('#previewStatusStats')).toContainText('triangles')
  })

  test('the page with the panel passes an axe scan', async ({ page }) => {
    await openTactileMap(page)
    const results = await new AxeBuilder({ page }).analyze()
    const violations = results.violations.filter(
      (v) => !ALLOWED_AXE_VIOLATIONS.includes(v.id)
    )
    expect(
      violations,
      violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`).join('\n')
    ).toEqual([])
  })
})
