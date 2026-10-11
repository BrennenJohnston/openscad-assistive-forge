/**
 * E2E tests for controls that disable or hide themselves while they have
 * focus: focus moves to the control a person would reach for next, never to
 * the page body.
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

/** Focus a control and press Enter on it, as a keyboard user does. */
async function press(page, selector) {
  const control = page.locator(selector).first()
  await control.focus()
  await expect(control).toBeFocused()
  await page.keyboard.press('Enter')
}

/** The first parameter control a person can reach (see firstParameterControl). */
const onFirstParameter = (page) =>
  page.evaluate(() => {
    const container = document.getElementById('parametersContainer')
    const drawn = (el) => el.checkVisibility()
    const first =
      [
        ...container.querySelectorAll(
          'input:not([type="hidden"]), select, textarea'
        ),
      ].find(drawn) || [...container.querySelectorAll('summary')].find(drawn)
    const active = document.activeElement
    return first && active === first
      ? true
      : `${active.tagName}#${active.id} "${(active.textContent || '').trim().slice(0, 30)}"`
  })

test('Undo and Redo hand focus to each other at the end of the history', async ({
  page,
}) => {
  await page.evaluate(() =>
    document
      .querySelectorAll('#parametersContainer details')
      .forEach((d) => {
        d.open = true
      })
  )
  const field = page.locator('#parametersContainer input[type="number"]').first()
  await field.fill('42')
  await field.press('Enter')
  await expect(page.locator('#undoBtn')).toBeEnabled()

  await press(page, '#undoBtn')
  await expect(page.locator('#undoBtn')).toBeDisabled()
  await expect(page.locator('#redoBtn')).toBeFocused()

  await page.keyboard.press('Enter')
  await expect(page.locator('#redoBtn')).toBeDisabled()
  await expect(page.locator('#undoBtn')).toBeFocused()
})

test('restoring a hidden group lands on its heading', async ({ page }) => {
  const hide = page.locator('.param-group-hide-btn').first()
  const groupId = await hide.evaluate(
    (btn) =>
      btn.closest('.forge-disclosure-row')?.querySelector('.param-group')
        ?.dataset.groupId
  )
  expect(groupId).toBeTruthy()
  await press(page, '.param-group-hide-btn')
  await expect(page.locator('.param-group-show-chip')).toHaveCount(1)

  await press(page, '.param-group-show-chip')
  await expect(page.locator('.param-group-show-chip')).toHaveCount(0)
  await expect(
    page.locator(`.param-group[data-group-id="${groupId}"] > summary`)
  ).toBeFocused()

  await press(page, '.param-group-hide-btn')
  await press(page, '.param-groups-show-all')
  await expect(page.locator('.param-groups-show-all')).toHaveCount(0)
  await expect(
    page.locator(`.param-group[data-group-id="${groupId}"] > summary`)
  ).toBeFocused()
})

test('Exit Code Editor lands on the first parameter a person can reach', async ({
  page,
}) => {
  await press(page, '#expertModeToggle')
  await expect(page.locator('#expertModeCloseBtn')).toBeVisible()
  await press(page, '#expertModeCloseBtn')
  await expect(page.locator('#expertModeCloseBtn')).toBeHidden()
  await expect.poll(() => onFirstParameter(page)).toBe(true)
})

test('Reset Group moves to its picker, and back after the reset', async ({
  page,
}) => {
  await page.evaluate(() => {
    document.getElementById('advancedMenu').open = true
  })
  await press(page, '#resetGroupBtn')
  await expect(page.locator('#resetGroupSelect')).toBeFocused()
  await press(page, '#confirmResetGroupBtn')
  await expect(page.locator('#resetGroupSelector')).toBeHidden()
  await expect(page.locator('#resetGroupBtn')).toBeFocused()
})

test('Generate keeps focus while it runs, and ends on the main button', async ({
  page,
}) => {
  await expect(page.locator('#primaryActionBtn')).toBeEnabled({
    timeout: 60_000,
  })
  await page.evaluate(() => {
    window.__bodyFocus = 0
    document.addEventListener(
      'focusout',
      (e) => {
        if (!e.relatedTarget) window.__bodyFocus += 1
      },
      true
    )
  })
  await press(page, '#primaryActionBtn')
  await expect(page.locator('#cancelRenderBtn')).toBeHidden({
    timeout: 90_000,
  })
  await expect(page.locator('#primaryActionBtn')).toBeEnabled()
  await expect(page.locator('#primaryActionBtn')).toBeFocused()
  expect(await page.evaluate(() => window.__bodyFocus)).toBe(0)
})

test('a grid preset saved or deleted leaves focus on the grid chooser', async ({
  page,
}) => {
  page.on('dialog', (dialog) => dialog.accept())
  const drawer = page.locator('#previewDrawerToggle')
  if ((await drawer.getAttribute('aria-expanded')) !== 'true') {
    await drawer.click()
  }
  const chooser = page.locator('#gridPresetSelect')
  await chooser.selectOption('custom')
  await page.locator('#gridPresetNameInput').fill('Walk bed')
  await press(page, '#saveGridPresetBtn')
  await expect(page.locator('#gridPresetSaveRow')).toBeHidden()
  await expect(chooser).toBeFocused()

  await press(page, '#deleteGridPresetBtn')
  await expect(page.locator('#gridPresetDeleteRow')).toBeHidden()
  await expect(chooser).toBeFocused()
})
