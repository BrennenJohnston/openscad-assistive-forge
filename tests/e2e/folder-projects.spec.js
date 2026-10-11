/**
 * E2E tests for opening one project from a folder that holds several: the
 * main-file prompt offers every model, grouped by folder, and the chosen
 * project renders, including a part whose file name has two dots in it.
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test'
import path from 'node:path'
import process from 'node:process'

const FOLDER = path.join(process.cwd(), 'tests', 'fixtures', 'many-projects')

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
  })
  await page.goto('/')
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: 120_000,
  })
})

test.describe('A folder of several projects', () => {
  test('offers every model by folder, and opens the one chosen by keyboard', async ({
    page,
  }) => {
    await page.locator('#importFolderInput').setInputFiles(FOLDER)

    const dialog = page.locator('dialog.folder-scad-select-dialog')
    await expect(dialog).toBeVisible({ timeout: 30_000 })
    await expect(dialog.locator('input[name="scadFile"]')).toHaveCount(5)
    await expect(dialog.locator('fieldset fieldset legend')).toHaveText([
      'many-projects',
      'lamp',
      'robot',
    ])

    // The folder's own files come first, so the lamp is two arrows down.
    const checked = dialog.locator('input[name="scadFile"]:checked')
    await expect(checked).toHaveValue('many-projects/extra.scad')
    await checked.focus()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await expect(checked).toHaveValue('many-projects/lamp/main.scad')
    await expect(checked).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(dialog.getByRole('button', { name: 'Import' })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(dialog).toBeHidden()

    const notNow = page.locator('#saveProjectNotNow')
    try {
      await notNow.waitFor({ state: 'visible', timeout: 3_000 })
      await notNow.click()
    } catch {
      // Not every load raises the save prompt
    }
    await expect(page.locator('.preview-state-indicator')).toHaveClass(
      /state-current/,
      { timeout: 90_000 }
    )
    await expect(page.locator('#param-height-spinbox')).toBeAttached()
    // The stem alone renders too; only the whole lamp, its two-dot part
    // included, has this many triangles.
    await expect(page.locator('#previewStatusStats')).toContainText(
      '156 triangles'
    )
  })

  test('Escape closes the main-file prompt, opens nothing, and returns focus', async ({
    page,
  }) => {
    await page.locator('#importFolderBtn').focus()
    await page.locator('#importFolderInput').setInputFiles(FOLDER)

    const dialog = page.locator('dialog.folder-scad-select-dialog')
    await expect(dialog).toBeVisible({ timeout: 30_000 })
    await expect(dialog.locator('input[name="scadFile"]:checked')).toBeFocused()
    await page.keyboard.press('Escape')

    await expect(dialog).toHaveCount(0)
    await expect(page.locator('#welcomeScreen')).toBeVisible()
    await expect(page.locator('#importFolderBtn')).toBeFocused()
  })
})
