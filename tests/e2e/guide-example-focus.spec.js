/**
 * E2E test for an example loaded from the Features Guide by keyboard: the
 * guide closes and the question about replacing the open file takes focus at
 * once, so a screen reader hears that a question is waiting; Cancel gives
 * focus back to the control that opened the guide.
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test'

test.describe.configure({ timeout: 120_000 })

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
  })
  await page.goto('/?example=simple-box')
  await page
    .locator('.param-control')
    .first()
    .waitFor({ state: 'attached', timeout: 60_000 })
  const notNow = page.locator('#saveProjectNotNow')
  try {
    await notNow.waitFor({ state: 'visible', timeout: 3_000 })
    await notNow.click()
  } catch {
    // Not every load raises the save prompt
  }
  const toggle = page.locator('#uiModeToggle')
  if ((await toggle.getAttribute('aria-checked')) !== 'true') await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
})

test('a guide example asks with focus on Cancel, and Cancel goes back to the opener', async ({
  page,
}) => {
  await page.evaluate(() => {
    const help = document.getElementById('libraryHelpBtn')
    for (let el = help; el; el = el.parentElement) {
      if (el.tagName === 'DETAILS') el.open = true
    }
  })
  const opener = page.locator('#libraryHelpBtn')
  await opener.focus()
  await expect(opener).toBeFocused()
  await page.keyboard.press('Enter')
  const guide = page.locator('#featuresGuideModal')
  await expect(guide).toBeVisible()

  const example = guide.locator(
    '[data-feature-example][data-example="library-test"]'
  )
  await example.focus()
  await expect(example).toBeFocused()
  await page.keyboard.press('Enter')

  const confirm = page.locator('.confirm-modal')
  await expect(confirm).toBeVisible()
  await expect(guide).toBeHidden()
  const cancel = confirm.locator('button[data-action="cancel"]')
  await expect(cancel).toBeFocused()
  // Still there once the guide's own focus return has had its chance.
  await page.waitForTimeout(300)
  await expect(cancel).toBeFocused()

  await page.keyboard.press('Enter')
  await expect(confirm).toHaveCount(0)
  await expect(opener).toBeFocused()
})
