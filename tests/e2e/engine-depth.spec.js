/**
 * E2E tests for how deep a model the browser engine can follow: a module
 * that calls itself 80 times, which desktop OpenSCAD renders at once and
 * which ran past the engine's old 64 KiB stack in every browser (it stopped
 * near 50). With the 8 MiB stack Firefox and Safari render it.
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test'
import { Buffer } from 'node:buffer'

const DEPTH = 80

const DEEP_MODEL = {
  name: `deep-${DEPTH}.scad`,
  mimeType: 'text/plain',
  buffer: Buffer.from(
    [
      'module step(n) {',
      '  if (n > 0) translate([1, 0, 0]) rotate([0, 0, 7]) step(n - 1);',
      '  else cube(1);',
      '}',
      `step(${DEPTH});`,
      '',
    ].join('\n')
  ),
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
  })
})

test(`a model ${DEPTH} levels deep previews`, async ({ page, browserName }) => {
  test.skip(
    browserName === 'chromium',
    "Chromium's own script stack stops this model near 45 levels, whatever the engine's stack"
  )
  test.setTimeout(240_000)
  await page.goto('/')
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: 180_000,
  })
  await page.locator('#fileInput').setInputFiles(DEEP_MODEL)
  const notNow = page.locator('#saveProjectNotNow')
  try {
    await notNow.waitFor({ state: 'visible', timeout: 3_000 })
    await notNow.click()
  } catch {
    // Not every load raises the save prompt
  }
  const indicator = page.locator('.preview-state-indicator')
  await expect(indicator).toHaveClass(/state-current|state-error/, {
    timeout: 180_000,
  })
  await expect(indicator).toHaveClass(/state-current/)
  await expect(page.locator('#previewStatusStats')).toContainText('6 triangles')
})
