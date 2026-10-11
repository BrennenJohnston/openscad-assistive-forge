/**
 * E2E sweep of the dialogs no other focus test covers: each takes focus when
 * it opens and, once closed, leaves focus somewhere a keyboard or screen
 * reader user can carry on from, never the page body. The rest of the app's
 * dialogs are guarded where their own behavior is tested (the menu dialogs,
 * the saved projects', the main view's, the companion editor, the drawing
 * editor and Classic's panes).
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test'
import { expectFocusNotOnBody } from './helpers/invariants.js'
import { selectPreset } from './helpers/preset-helpers.js'

test.describe.configure({ timeout: 180_000 })

test('the first visit takes focus and leaves it on the Main Page heading', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
  })
  await page.goto('/')
  const dialog = page.locator('#first-visit-modal')
  await expect(dialog).toBeVisible({ timeout: 30_000 })
  expect(
    await dialog.evaluate((el) => el.contains(document.activeElement))
  ).toBe(true)

  const forge = page.locator('#firstVisitChoiceForge')
  if (await forge.isVisible()) {
    await forge.focus()
    await page.keyboard.press('Space')
  }
  await page.locator('#first-visit-continue').focus()
  await page.keyboard.press('Enter')
  await expect(dialog).toBeHidden({ timeout: 30_000 })
  await expectFocusNotOnBody(page)
  await expect(page.locator('#features-heading')).toBeFocused()
})

test.describe('with a model open', () => {
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
    if ((await toggle.getAttribute('aria-checked')) !== 'true') {
      await toggle.click()
    }
    await expect(toggle).toHaveAttribute('aria-checked', 'true')
  })

  async function addPreset(page, name) {
    await page.locator('#addPresetBtn').click()
    const modal = page.locator('.preset-modal')
    await modal.waitFor({ state: 'visible', timeout: 5_000 })
    await modal.locator('#presetName').first().fill(name)
    await modal.locator('button[type="submit"]').first().click()
    await modal.waitFor({ state: 'detached', timeout: 5_000 })
  }

  test('Add preset takes focus, closes on Escape, and goes back', async ({
    page,
  }) => {
    const opener = page.locator('#addPresetBtn')
    await opener.focus()
    await page.keyboard.press('Enter')
    const modal = page.locator('.preset-modal')
    await expect(modal).toBeVisible()
    expect(
      await modal.evaluate((el) => el.contains(document.activeElement))
    ).toBe(true)
    await page.keyboard.press('Escape')
    await expect(modal).toHaveCount(0)
    await expect(opener).toBeFocused()
  })

  test('Unsaved preset changes closes on Escape and leaves focus on the page', async ({
    page,
  }) => {
    await addPreset(page, 'Sweep one')
    await addPreset(page, 'Sweep two')
    expect(await selectPreset(page, 'Sweep one')).toBe(true)
    await page.evaluate(() =>
      document
        .querySelectorAll('#parametersContainer details')
        .forEach((d) => {
          d.open = true
        })
    )
    const field = page
      .locator('#parametersContainer input[type="number"]')
      .first()
    await field.fill('41')
    await field.press('Enter')
    await selectPreset(page, 'Sweep two')
    const dialog = page.locator('dialog.preset-import-mode-dialog')
    await expect(dialog).toBeVisible({ timeout: 10_000 })
    expect(
      await dialog.evaluate((el) => el.contains(document.activeElement))
    ).toBe(true)
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expectFocusNotOnBody(page)
  })
})
