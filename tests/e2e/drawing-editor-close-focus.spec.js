/**
 * E2E test for leaving the drawing editor by keyboard: Close gives focus back
 * to "Open the drawing editor", the button that opened it, never to the page
 * body.
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test'
import path from 'node:path'
import process from 'node:process'

const NESTED = path.join(
  process.cwd(),
  'tests',
  'fixtures',
  'svg-edit',
  'nested-squares.svg'
)

test('Close returns focus to "Open the drawing editor"', async ({ page }) => {
  test.setTimeout(300_000)
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
  })
  await page.goto('/')
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    timeout: 240_000,
  })
  await page.selectOption('#charmVariantSelect', 'q-charm')
  await page.click('#openCharmMakerBtn')
  await page.waitForFunction(
    () =>
      Object.keys(window.stateManager?.getState()?.parameters || {}).length > 0,
    null,
    { timeout: 120_000 }
  )
  for (let i = 0; i < 2; i++) {
    const notNow = page.getByRole('button', { name: 'Not now', exact: true })
    if (await notNow.isVisible().catch(() => false)) {
      await notNow.click()
      await page.waitForTimeout(300)
    }
  }
  await page.setInputFiles('#param-design_file', NESTED)
  await page.evaluate(() => {
    let d = document.querySelector('#param-design_file')?.closest('details')
    while (d) {
      d.open = true
      d = d.parentElement?.closest('details')
    }
  })
  const control = page.locator('.param-control--file', {
    has: page.locator('#param-design_file'),
  })
  const door = control.getByRole('button', { name: 'Open the drawing editor' })
  await door.waitFor({ state: 'visible', timeout: 60_000 })
  await door.focus()
  await expect(door).toBeFocused()
  await page.keyboard.press('Enter')

  const surface = page.locator('#drawingEditorSurface')
  await expect(surface).toBeVisible({ timeout: 90_000 })
  const close = surface.locator('.drawing-editor-close')
  await close.focus()
  await expect(close).toBeFocused()
  await page.keyboard.press('Enter')

  await expect(surface).toBeHidden({ timeout: 30_000 })
  await expect(door).toBeFocused()
})
