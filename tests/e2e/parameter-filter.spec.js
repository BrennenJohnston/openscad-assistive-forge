/**
 * Searching the Customizer opens the groups that hold a match. Clearing the
 * search gives each group back the state it had before the search, instead
 * of leaving every group open.
 *
 * @license GPL-3.0-or-later
 */
import { test, expect } from '@playwright/test'

test('clearing the search restores each group as it was', async ({ page }) => {
  test.setTimeout(180_000)
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
  })
  await page.goto('/?example=simple-box')
  await page
    .locator('.param-control')
    .first()
    .waitFor({ state: 'attached', timeout: 60_000 })
  const mode = page.locator('#uiModeToggle')
  if ((await mode.getAttribute('aria-checked')) !== 'true') await mode.click()

  // One group closed, one open, before any search.
  const features = page.locator('details.param-group', { hasText: 'Features' })
  const dimensions = page.locator('details.param-group', { hasText: 'Dimensions' })
  await features.evaluate((d) => {
    d.open = false
  })
  await dimensions.evaluate((d) => {
    d.open = true
  })

  const search = page.locator('#paramSearchInput')
  await search.fill('ventilation')
  await expect(features).toHaveJSProperty('open', true)

  await search.fill('')
  await expect(features).toHaveJSProperty('open', false)
  await expect(dimensions).toHaveJSProperty('open', true)
})
