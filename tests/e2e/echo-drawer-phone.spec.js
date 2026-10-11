/**
 * E2E tests for the preview's OpenSCAD Messages bar at phone width: it stays
 * above the Actions and Camera bar, open and folded, so the messages can be
 * folded, opened again and read in the full console; and the bar is named
 * by the words it shows.
 *
 * @license GPL-3.0-or-later
 */

import { test, expect, devices } from '@playwright/test'
import { Buffer } from 'node:buffer'

const WARNING_MODEL = {
  name: 'echo-warning.scad',
  mimeType: 'text/plain',
  buffer: Buffer.from(
    'size = 5; // [1:20]\ncube(size);\necho("marker");\necho(undefined_thing);\n'
  ),
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
  })
})

/** Whether a press at the middle of this element reaches it. */
async function reachable(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel)
    if (!el || !el.offsetParent) return `${sel} is not shown`
    const r = el.getBoundingClientRect()
    const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
    if (top && el.contains(top)) return true
    return `${sel} is under ${top?.id || top?.className || top?.tagName}`
  }, selector)
}

async function foldAndOpenTheMessages(page, press) {
  await page.goto('/')
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: 180_000,
  })
  await page.locator('#fileInput').setInputFiles(WARNING_MODEL)
  const notNow = page.locator('#saveProjectNotNow')
  try {
    await notNow.waitFor({ state: 'visible', timeout: 3_000 })
    await press(notNow)
  } catch {
    // Not every load raises the save prompt
  }
  await expect(page.locator('.preview-state-indicator')).toHaveClass(
    /state-current/,
    { timeout: 120_000 }
  )

  const bar = page.locator('#echoDrawerToggle')
  await expect(bar).toBeVisible({ timeout: 15_000 })
  // Named by what it shows, so saying the words reaches it.
  await expect(bar).toHaveAccessibleName(
    (await page.locator('#echoDrawerLabel').textContent()).trim()
  )
  await expect(bar).toHaveAccessibleName(/^OpenSCAD Messages \(/)
  // A warning opens the messages by itself.
  await expect(bar).toHaveAttribute('aria-expanded', 'true')
  expect(await reachable(page, '#echoDrawerToggle')).toBe(true)
  expect(await reachable(page, '#echoViewConsoleBtn')).toBe(true)

  await press(bar)
  await expect(bar).toHaveAttribute('aria-expanded', 'false')
  expect(await reachable(page, '#echoDrawerToggle')).toBe(true)

  await press(bar)
  await expect(bar).toHaveAttribute('aria-expanded', 'true')
  expect(await reachable(page, '#echoViewConsoleBtn')).toBe(true)
  await press(page.locator('#echoViewConsoleBtn'))
  await expect(page.locator('#consoleOutputModal')).toBeVisible()
}

test.describe('at 412 x 839', () => {
  test.use({ viewport: { width: 412, height: 839 } })

  test('the messages bar stays reachable when folded and opened again', async ({
    page,
  }) => {
    await foldAndOpenTheMessages(page, (locator) => locator.click())
  })
})

// The descriptor's own browser type would force a worker of its own.
// eslint-disable-next-line no-unused-vars
const { defaultBrowserType, ...pixel7 } = devices['Pixel 7']

test.describe('on a Pixel 7, by touch', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'only Chromium emulates a phone, with touch'
  )
  test.use(pixel7)

  test('the messages bar stays reachable when folded and opened again', async ({
    page,
  }) => {
    await foldAndOpenTheMessages(page, (locator) => locator.tap())
  })
})
