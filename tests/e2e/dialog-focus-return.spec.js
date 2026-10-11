/**
 * E2E tests for the dialogs of the main view by keyboard: each one takes
 * focus when it opens, closes on Escape, and gives focus back to the control
 * that opened it (or, when that control is gone, to a place a person
 * expects), never to the page body.
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test'
import { selectPreset } from './helpers/preset-helpers.js'
import {
  announcementMark,
  announcementsSince,
  recordAnnouncements,
} from './helpers/invariants.js'

test.describe.configure({ timeout: 120_000 })

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
  })
})

async function openExample(page) {
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
}

/** Focus a control and press Enter on it, as a keyboard user does. */
async function press(page, selector) {
  await page.locator(selector).focus()
  await expect(page.locator(selector)).toBeFocused()
  await page.keyboard.press('Enter')
}

test.describe('View Source and Customizer JSON', () => {
  for (const [opener, dialog, heading] of [
    ['#viewSourceBtn', '#sourceViewerModal', '#sourceViewerTitle'],
    ['#viewParamsJsonBtn', '#paramsJsonModal', '#paramsJsonTitle'],
  ]) {
    test(`${opener} opens on its heading, shown to assistive tech, and Escape goes back`, async ({
      page,
    }) => {
      await openExample(page)
      await page.evaluate(() => {
        document.getElementById('advancedMenu').open = true
      })
      await press(page, opener)
      await expect(page.locator(dialog)).toBeVisible()
      await expect(page.locator(heading)).toBeFocused()
      await expect(page.locator(dialog)).toHaveAttribute('aria-hidden', 'false')

      await page.keyboard.press('Escape')
      await expect(page.locator(dialog)).toBeHidden()
      await expect(page.locator(opener)).toBeFocused()
    })
  }
})

test('the full console takes focus, and Escape and Close go back to View Full Console', async ({
  page,
}) => {
  await recordAnnouncements(page)
  await openExample(page)
  const NL = String.fromCharCode(10)
  await page.locator('#fileInput').setInputFiles({
    name: 'echo.scad',
    mimeType: 'text/plain',
    buffer: Buffer.from(`echo("hello");${NL}cube(5);${NL}`),
  })
  const replace = page.locator('.confirm-modal button[data-action="confirm"]')
  try {
    await replace.click({ timeout: 3_000 })
  } catch {
    // No replace question
  }
  try {
    await page.locator('#saveProjectNotNow').click({ timeout: 8_000 })
  } catch {
    // Not every load raises the save prompt
  }
  const opener = page.locator('#echoViewConsoleBtn')
  await page.evaluate(() =>
    document.getElementById('echoDrawer')?.classList.remove('collapsed')
  )
  await expect(opener).toBeVisible({ timeout: 60_000 })

  const dialog = page.locator('#consoleOutputModal')
  const mark = await announcementMark(page)
  await press(page, '#echoViewConsoleBtn')
  await expect(dialog).toBeVisible()
  await expect(page.locator('#consoleOutputTitle')).toBeFocused()
  // The focused heading names the panel; nothing says it again.
  await page.waitForTimeout(300)
  const said = await announcementsSince(page, mark)
  expect(said.filter((a) => /panel opened/.test(a.text))).toEqual([])
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(opener).toBeFocused()

  await page.keyboard.press('Enter')
  await expect(dialog).toBeVisible()
  await press(page, '#consoleCloseBtn')
  await expect(dialog).toBeHidden()
  await expect(opener).toBeFocused()
})

test('going back to the Main Page lands on its heading', async ({ page }) => {
  await openExample(page)
  await press(page, '#clearFileBtn')
  const confirm = page.locator('.confirm-modal button[data-action="confirm"]')
  await expect(confirm).toBeVisible()
  await confirm.focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('#welcomeScreen')).toBeVisible()
  await expect(page.locator('#features-heading')).toBeFocused()
})

test('the Features Guide from Help on the Main Page goes back to Help', async ({
  page,
}) => {
  // Help sits in a bar classed "hidden" on the Main Page while it stays on
  // screen; Escape once sent focus to the main region instead.
  await page.goto('/')
  // The button is drawn before the app wires it up.
  await page.waitForFunction(() => typeof window.openFeaturesGuide === 'function', null, {
    timeout: 60_000,
  })
  await press(page, '#featuresGuideBtn')
  await expect(page.locator('#tab-libraries')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.locator('#featuresGuideModal')).toBeHidden()
  await expect(page.locator('#featuresGuideBtn')).toBeFocused()
})

test('Clear Cache reads its warning, holds Tab, and Escape and Cancel go back', async ({
  page,
}) => {
  await page.goto('/')
  await page.waitForSelector('#welcomeScreen', { state: 'visible' })
  const dialog = page.locator('.cache-clear-dialog')

  await press(page, '#clearStorageBtn')
  await expect(dialog).toBeVisible()
  await expect(page.locator('#cacheClearCancelBtn')).toBeFocused()
  const description = await dialog.evaluate((el) =>
    (el.getAttribute('aria-describedby') || '')
      .split(' ')
      .map((id) => document.getElementById(id)?.textContent || '')
      .join(' ')
  )
  expect(description).toContain('This will delete all saved projects')
  for (let i = 0; i < 6; i += 1) {
    await page.keyboard.press('Tab')
    expect(
      await page.evaluate(() =>
        Boolean(document.activeElement?.closest('.cache-clear-dialog'))
      )
    ).toBe(true)
  }

  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('#clearStorageBtn')).toBeFocused()

  await page.keyboard.press('Enter')
  await expect(dialog).toBeVisible()
  await press(page, '#cacheClearCancelBtn')
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('#clearStorageBtn')).toBeFocused()
})

test('Publish closes on Escape from its address field and goes back', async ({
  page,
}) => {
  await openExample(page)
  const opener = page.locator('#publishProjectBtn')
  if (!(await opener.isVisible())) await page.locator('#actionsDrawerToggle').click()
  await press(page, '#publishProjectBtn')
  const dialog = page.locator('#publishProjectModal')
  await expect(dialog).toBeVisible()
  await page.locator('#publishRepoUrl').focus()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(opener).toBeFocused()
})

test.describe('Deleting a preset', () => {
  async function addPreset(page, name) {
    await page.locator('#addPresetBtn').click()
    const modal = page.locator('.preset-modal')
    await modal.waitFor({ state: 'visible', timeout: 5_000 })
    await modal.locator('#presetName').first().fill(name)
    await modal.locator('button[type="submit"]').first().click()
    await modal.waitFor({ state: 'detached', timeout: 5_000 })
  }

  test('from the panel, focus moves to the preset chooser, not the body', async ({
    page,
  }) => {
    await openExample(page)
    await addPreset(page, 'Panel one')
    expect(await selectPreset(page, 'Panel one')).toBe(true)
    await press(page, '#deletePresetBtn')
    const confirm = page.locator('.confirm-modal button[data-action="confirm"]')
    await expect(confirm).toBeVisible()
    await confirm.focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('.confirm-modal')).toHaveCount(0)
    await expect(page.locator('#deletePresetBtn')).toBeDisabled()
    await expect
      .poll(() =>
        page.evaluate(() => {
          const el = document.activeElement
          return Boolean(
            el?.matches('#presetSelect, .preset-combobox-input') &&
              el.checkVisibility()
          )
        })
      )
      .toBe(true)
  })

  test('from Import and Export, the list stays open on the next row, and Escape goes back', async ({
    page,
  }) => {
    await openExample(page)
    for (const name of ['List one', 'List two', 'List three']) {
      await addPreset(page, name)
    }
    await press(page, '#managePresetsBtn')
    const dialog = page.locator('.preset-modal:not(.confirm-modal)')
    await expect(dialog).toBeVisible()
    await dialog.locator('.preset-list-details > summary').focus()
    await page.keyboard.press('Enter')

    const deletes = dialog.locator('button[data-action="delete"]')
    await expect(deletes).toHaveCount(3)
    const second = await deletes.nth(1).getAttribute('aria-label')
    const third = await deletes.nth(2).getAttribute('aria-label')
    expect(second).not.toBe(third)
    await deletes.nth(1).focus()
    await page.keyboard.press('Enter')
    const confirm = page.locator('.confirm-modal button[data-action="confirm"]')
    await expect(confirm).toBeVisible()
    await confirm.focus()
    await page.keyboard.press('Enter')

    await expect(deletes).toHaveCount(2)
    await expect(
      dialog.locator(`button[data-action="delete"][aria-label="${third}"]`)
    ).toBeFocused()

    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(page.locator('#managePresetsBtn')).toBeFocused()
  })
})
