/**
 * E2E baseline: Generic (non-keyguard) project workflow
 *
 * Phase 1 parity harness — establishes E2E coverage for a community-style
 * SCAD project that uses generic parameter names (no "generate",
 * "type_of_keyguard", or laser-cutting names).
 *
 * Acknowledges that 6 of 21 existing E2E files are stakeholder-specific;
 * this file adds the first generic-project baseline to balance coverage.
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import JSZip from 'jszip'

const isCI = !!process.env.CI

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
  })
})

/**
 * Build a ZIP containing the generic-2d-project fixture files.
 * Returns the path to the temporary ZIP.
 */
const createGenericProjectZip = async () => {
  const fixtureDir = path.join(
    process.cwd(),
    'tests',
    'fixtures',
    'generic-2d-project'
  )
  const zip = new JSZip()

  const mainScad = await fs.promises.readFile(
    path.join(fixtureDir, 'main.scad'),
    'utf-8'
  )
  const patternSvg = await fs.promises.readFile(
    path.join(fixtureDir, 'pattern.svg'),
    'utf-8'
  )

  zip.file('main.scad', mainScad)
  zip.file('pattern.svg', patternSvg)

  const buffer = await zip.generateAsync({ type: 'nodebuffer' })
  const outputDir = path.join(process.cwd(), 'test-results')
  await fs.promises.mkdir(outputDir, { recursive: true })
  const zipPath = path.join(
    outputDir,
    `generic-2d-project-${Date.now()}.zip`
  )
  await fs.promises.writeFile(zipPath, buffer)
  return zipPath
}

/**
 * Upload the single-file color-debug fixture SCAD.
 */
const getColorDebugFixturePath = () =>
  path.join(process.cwd(), 'tests', 'fixtures', 'color-debug-test.scad')

/**
 * Upload the single-file simple-2d fixture SCAD.
 */
const getSimple2dFixturePath = () =>
  path.join(process.cwd(), 'tests', 'fixtures', 'simple-2d.scad')

test.describe('Generic Project Baseline', () => {
  test.describe.configure({ timeout: 150_000 })

  test('uploads generic 2D project ZIP and renders parameter UI', async ({
    page,
  }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await page.goto('/')

    // Wait for WASM engine before uploading
    await page.waitForSelector('body[data-wasm-ready="true"]', {
      state: 'attached',
      timeout: 120_000,
    })

    const zipPath = await createGenericProjectZip()
    const fileInput = page.locator('#fileInput')
    await fileInput.setInputFiles(zipPath)

    // Welcome screen should hide, main interface should appear
    await expect(page.locator('#welcomeScreen')).toBeHidden({
      timeout: 15_000,
    })
    await expect(page.locator('#mainInterface')).toBeVisible({
      timeout: 5_000,
    })

    // Dismiss save-project modal if it appears
    try {
      const notNowBtn = page.locator('#saveProjectNotNow')
      await notNowBtn.waitFor({ state: 'visible', timeout: 3_000 })
      await notNowBtn.click()
      await page.waitForTimeout(300)
    } catch {
      // Modal didn't appear — expected for some flows
    }

    // Parameter controls should render — generic project has numeric params
    await expect(
      page
        .locator(
          '.param-group input[type="range"], .param-group input[type="number"]'
        )
        .first()
    ).toBeVisible({ timeout: 10_000 })

    // The companion files panel exists (hidden in Basic mode, visible in Advanced)
    const projectFilesControls = page.locator('#projectFilesControls')
    await expect(projectFilesControls).toBeAttached({ timeout: 5_000 })
  })

  test('uploads simple-2d fixture and shows parameter controls', async ({
    page,
  }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await page.goto('/')

    await page.waitForSelector('body[data-wasm-ready="true"]', {
      state: 'attached',
      timeout: 120_000,
    })

    const fixturePath = getSimple2dFixturePath()
    const fileInput = page.locator('#fileInput')
    await fileInput.setInputFiles(fixturePath)

    await expect(page.locator('#welcomeScreen')).toBeHidden({
      timeout: 15_000,
    })
    await expect(page.locator('#mainInterface')).toBeVisible({
      timeout: 5_000,
    })

    // Should show generic param controls (width, height, shape_type)
    await expect(
      page
        .locator(
          '.param-group input[type="range"], .param-group input[type="number"], .param-group select'
        )
        .first()
    ).toBeVisible({ timeout: 10_000 })
  })

  test('uploads color-debug fixture and shows parameter controls', async ({
    page,
  }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await page.goto('/')

    await page.waitForSelector('body[data-wasm-ready="true"]', {
      state: 'attached',
      timeout: 120_000,
    })

    const fixturePath = getColorDebugFixturePath()
    const fileInput = page.locator('#fileInput')
    await fileInput.setInputFiles(fixturePath)

    await expect(page.locator('#welcomeScreen')).toBeHidden({
      timeout: 15_000,
    })
    await expect(page.locator('#mainInterface')).toBeVisible({
      timeout: 5_000,
    })

    // Should show param controls including color-related params
    await expect(
      page.locator('.param-group .param-control').first()
    ).toBeVisible({ timeout: 10_000 })
  })
})
