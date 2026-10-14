/**
 * The Alt View where the browser draws no 3D picture: WebGL switched off, as
 * on some locked-down or older machines. Pressing the key with a project open
 * says why once, shows it under the preview, and leaves the page as it was.
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test'
import {
  recordAnnouncements,
  announcementMark,
  announcementsSince,
} from './helpers/invariants.js'

const SENTENCE = 'Alt View needs 3D graphics, which this browser has turned off.'

test.use({ launchOptions: { args: ['--disable-webgl', '--disable-3d-apis'] } })

test('the key says why it cannot start, once, and stays off', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    "the flags that switch WebGL off are Chromium's"
  )
  test.setTimeout(240_000)
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(String(error)))
  await recordAnnouncements(page)
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
    localStorage.setItem('openscad-customizer-hfm-unlock', 'true')
  })
  await page.goto('/?example=simple-box')
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: 120_000,
  })
  await expect(page.locator('#mainInterface')).toBeVisible({ timeout: 60_000 })
  const notNow = page.locator('#saveProjectNotNow')
  if (await notNow.isVisible().catch(() => false)) await notNow.click()
  // The browser made no 3D canvas: the condition this case is about.
  expect(await page.locator('#previewContainer canvas').count()).toBe(0)

  const key = page.locator('#_hfmToggle')
  await expect(key).toBeVisible()
  const mark = await announcementMark(page)
  await key.click()
  await page.waitForTimeout(1500)

  const said = (await announcementsSince(page, mark)).filter(
    (w) => w.text === SENTENCE
  )
  expect(said, JSON.stringify(said)).toHaveLength(1)
  await expect(page.locator('#previewStatusAltAdjust')).toHaveText(SENTENCE)
  await expect(page.locator('#previewStatusAltAdjust')).toBeVisible()
  await expect(key).toHaveAttribute('aria-pressed', 'false')
  expect(
    await page.evaluate(() =>
      document.documentElement.hasAttribute('data-ui-variant')
    )
  ).toBe(false)
  expect(pageErrors, pageErrors.join('\n')).toEqual([])
})
