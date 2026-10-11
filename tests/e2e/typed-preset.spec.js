/**
 * E2E tests for a preset chosen while a text field still holds an edit that
 * was typed but not applied: the render must carry every value of the
 * preset, and the typed text too.
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test'
import path from 'node:path'
import process from 'node:process'

const PROJECT = path.join(process.cwd(), 'tests', 'fixtures', 'typed-preset')

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
    window.__renders = []
    const post = Worker.prototype.postMessage
    Worker.prototype.postMessage = function (message, ...rest) {
      if (message?.type === 'RENDER') {
        window.__renders.push({ ...message.payload.parameters })
      }
      return post.call(this, message, ...rest)
    }
  })
  await page.goto('/')
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: 120_000,
  })
})

test('a preset chosen during a typed edit renders the whole preset', async ({
  page,
}) => {
  await page.locator('#importFolderInput').setInputFiles(PROJECT)
  const notNow = page.locator('#saveProjectNotNow')
  try {
    await notNow.waitFor({ state: 'visible', timeout: 3_000 })
    await notNow.click()
  } catch {
    // Not every load raises the save prompt
  }
  const indicator = page.locator('.preview-state-indicator')
  await expect(indicator).toHaveClass(/state-current/, { timeout: 90_000 })
  const expandAll = page.locator('#expandAllGroupsBtn')
  if (await expandAll.isVisible()) await expandAll.click()

  // Typed, not applied: no Enter, and the focus stays in the field.
  const label = page.locator('#param-label')
  await label.click()
  await label.press('Control+a')
  await label.pressSequentially('ABCDEFG')
  await expect(label).toBeFocused()

  // A preset chosen without the field losing focus first, as a script, a
  // shortcut or a link can do.
  const presetValue = await page.evaluate(() => {
    const select = document.getElementById('presetSelect')
    return [...select.options].find((o) => o.textContent.trim() === 'Big')
      ?.value
  })
  expect(presetValue).toBeTruthy()
  const before = await page.evaluate(() => window.__renders.length)
  await page.evaluate((value) => {
    const select = document.getElementById('presetSelect')
    select.value = value
    select.dispatchEvent(new Event('change', { bubbles: true }))
  }, presetValue)

  await expect
    .poll(() => page.evaluate(() => window.__renders.length), {
      timeout: 30_000,
    })
    .toBeGreaterThan(before)
  await expect(indicator).toHaveClass(/state-current/, { timeout: 90_000 })
  await page.waitForTimeout(1_500)

  const last = await page.evaluate(() => window.__renders.at(-1))
  expect(last).toMatchObject({
    width: 100,
    height: 50,
    depth: 8,
    label: 'ABCDEFG',
  })
  await expect(page.locator('#param-width-spinbox')).toHaveValue('100')
  await expect(page.locator('#param-label')).toHaveValue('ABCDEFG')
})
