/**
 * E2E tests for how deep a model the browser engine can follow: a module
 * that calls itself 150 times, which desktop OpenSCAD renders at once. The
 * engine's old 64 KiB stack stopped it near 50 in every browser; with the
 * 8 MiB stack Firefox and Safari rendered 80, and Chrome's own script stack
 * still stopped it near 45. Built with WebAssembly's own exceptions, the
 * engine renders it in all three (measured in Chrome: 200 levels render,
 * 300 do not).
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test'
import { Buffer } from 'node:buffer'

const DEPTH = 150

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

test(`a model ${DEPTH} levels deep previews`, async ({ page }) => {
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
