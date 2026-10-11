/**
 * E2E tests for hiding and showing Classic's panes by keyboard: a pane
 * hidden with focus inside it hands focus to the control that brings it
 * back, never to the page body, and the Window menu keeps focus on its
 * button.
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test'
import path from 'node:path'
import process from 'node:process'

const SAMPLE = path.join(process.cwd(), 'tests', 'fixtures', 'sample.scad')

test.describe.configure({ timeout: 240_000 })

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
    localStorage.setItem(
      'openscad-forge-classic-panes',
      JSON.stringify({
        editorVisible: true,
        customizerVisible: true,
        consoleCollapsed: false,
        animateVisible: false,
        fontListVisible: false,
        viewportControlVisible: false,
      })
    )
  })
  await page.goto('/')
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: 180_000,
  })
  await page.locator('#fileInput').setInputFiles(SAMPLE)
  await expect(page.locator('#mainInterface')).toBeVisible({ timeout: 30_000 })
  try {
    await page.locator('#saveProjectNotNow').click({ timeout: 3_000 })
  } catch {
    // Not every load raises the save prompt
  }
  const ui = page.locator('#uiModeToggle')
  if ((await ui.getAttribute('aria-checked')) !== 'true') await ui.click()
  await page.locator('#classicModeToggle').click()
  await expect(page.locator('body')).toHaveAttribute('data-ui-mode', 'classic')
  const density = page.locator('#classicDensityToggle')
  if ((await density.getAttribute('aria-checked')) !== 'true') {
    await density.click()
  }
  await expect(page.locator('body')).toHaveAttribute(
    'data-classic-density',
    'standard'
  )
})

async function press(page, selector) {
  const control = page.locator(selector)
  await control.focus()
  await expect(control).toBeFocused()
  await page.keyboard.press('Enter')
}

/** Window ▸ <label>, by keyboard along the menu bar. */
async function windowItem(page, label) {
  await page.locator('#fileMenuBtn').focus()
  for (let k = 0; k < 10; k += 1) {
    const here = await page.evaluate(() => document.activeElement?.id)
    if (here === 'windowMenuBtn') break
    await page.keyboard.press('ArrowRight')
  }
  await expect(page.locator('#windowMenuBtn')).toBeFocused()
  await page.keyboard.press('Enter')
  for (let i = 0; i < 40; i += 1) {
    const text = await page.evaluate(() =>
      (
        document.activeElement?.querySelector?.('.menu-item-label')
          ?.textContent || ''
      ).trim()
    )
    if (text === label) break
    await page.keyboard.press('ArrowDown')
  }
  await page.keyboard.press('Enter')
}

test('the Editor hidden from its own title bar hands focus to the Window menu', async ({
  page,
}) => {
  await press(page, '#classicEditorCloseBtn')
  await expect(page.locator('body')).toHaveAttribute(
    'data-classic-editor-hidden',
    'true'
  )
  await expect(page.locator('#windowMenuBtn')).toBeFocused()
})

test('the Customizer hidden from its title bar or by shortcut hands focus to its toolbar button', async ({
  page,
}) => {
  const toggle = page.locator('#classicTbCustomizerBtn')
  await press(page, '#classicCustomizerCloseBtn')
  await expect(page.locator('body')).toHaveAttribute(
    'data-classic-customizer-hidden',
    'true'
  )
  await expect(toggle).toBeFocused()
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')

  await page.keyboard.press('Enter')
  await expect(page.locator('body')).toHaveAttribute(
    'data-classic-customizer-hidden',
    'false'
  )
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')

  await page.locator('#parametersContainer summary').first().focus()
  await page.keyboard.press('Control+Alt+4')
  await expect(page.locator('body')).toHaveAttribute(
    'data-classic-customizer-hidden',
    'true'
  )
  await expect(toggle).toBeFocused()
})

test('a pane shown and hidden from the Window menu keeps focus on Window', async ({
  page,
}) => {
  await windowItem(page, 'Animate')
  await expect(page.locator('body')).toHaveAttribute(
    'data-classic-animate-visible',
    'true'
  )
  await expect(page.locator('#windowMenuBtn')).toBeFocused()
  await windowItem(page, 'Animate')
  await expect(page.locator('body')).toHaveAttribute(
    'data-classic-animate-visible',
    'false'
  )
  await expect(page.locator('#windowMenuBtn')).toBeFocused()
})
