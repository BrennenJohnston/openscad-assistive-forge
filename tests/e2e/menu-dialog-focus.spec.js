/**
 * E2E tests for the menus by keyboard: a dialog opened from a menu gives
 * focus back to that menu's button when it closes, and a grayed-out item is
 * reached by the arrow keys but does nothing.
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test'

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

const focusedText = (page) =>
  page.evaluate(() => (document.activeElement?.textContent || '').trim())

/** From the menu bar's first button, arrow along to a menu and open it. */
async function openMenuByKeyboard(page, menu) {
  await page.locator('#fileMenuBtn').focus()
  for (let k = 0; k < 8; k += 1) {
    const here = await page.evaluate(() => document.activeElement?.id)
    if (here === `${menu}MenuBtn`) break
    await page.keyboard.press('ArrowRight')
  }
  await expect(page.locator(`#${menu}MenuBtn`)).toBeFocused()
  await page.keyboard.press('Enter')
}

async function arrowTo(page, label) {
  for (let i = 0; i < 30; i += 1) {
    if ((await focusedText(page)).startsWith(label)) return
    await page.keyboard.press('ArrowDown')
  }
  throw new Error(`${label} was not reached by ArrowDown`)
}

test.describe('A dialog opened from a menu', () => {
  for (const [menu, label, dialog] of [
    ['help', 'About', '#aboutModal'],
    ['help', 'Library info', '.library-info-modal'],
    ['help', 'Features Guide', '#featuresGuideModal'],
    ['help', 'Keyboard Shortcuts', '#shortcutsModal'],
    ['edit', 'Preferences', '#preferencesModal'],
  ]) {
    test(`${label} gives focus back to the ${menu} menu button`, async ({
      page,
    }) => {
      await openMenuByKeyboard(page, menu)
      await arrowTo(page, label)
      await page.keyboard.press('Enter')
      await expect(page.locator(dialog)).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(page.locator(dialog)).toBeHidden()
      await expect(page.locator(`#${menu}MenuBtn`)).toBeFocused()
    })
  }
})

test('a grayed-out item is reached by the arrow keys and does nothing', async ({
  page,
}) => {
  await openMenuByKeyboard(page, 'help')
  await arrowTo(page, 'Offline Documentation')
  const item = page.locator(':focus')
  await expect(item).toHaveAttribute('aria-disabled', 'true')
  await page.keyboard.press('Enter')
  await expect(item).toBeFocused()
  await expect(page.locator('#helpMenuItems')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('#helpMenuBtn')).toBeFocused()
})
