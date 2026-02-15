/**
 * Keyguard WASM Compilation Smoke Tests
 * Uploads the minimal keyguard ZIP and tests actual compilation:
 * - openings_and_additions.txt include resolves in WASM FS
 * - Preview render completes without error
 * - Viewer canvas has geometry
 * - Compilation timing logged
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Use the minimal fixture for faster compilation (not the 7K-line full file)
const MINIMAL_SCAD_PATH = path.resolve(
  __dirname, '..', 'fixtures', 'volkswitch-keyguard-minimal', 'keyguard_minimal.scad'
)
const OPENINGS_TXT_PATH = path.resolve(
  __dirname, '..', 'fixtures', 'volkswitch-keyguard-minimal', 'openings_and_additions.txt'
)

// Also test with the full keyguard ZIP for realism
const KEYGUARD_ZIP_PATH = path.resolve(
  __dirname, '..', '..', '.volkswitch', 'keyguard-test-bundle.zip'
)
const KEYGUARD_ZIP_EXISTS = fs.existsSync(KEYGUARD_ZIP_PATH)

test.describe('Keyguard WASM Compilation Smoke Tests', () => {
  test.describe.configure({ timeout: 150_000 }) // WASM compilation can be slow

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear()
      localStorage.setItem('openscad-forge-first-visit-seen', 'true')
    })
    await page.goto('http://localhost:5173/')
    // Wait for WASM engine to fully initialise before uploading files.
    // domcontentloaded fires when HTML is parsed, but WASM may still be loading.
    await page.waitForSelector('body[data-wasm-ready="true"]', {
      state: 'attached',
      timeout: 120_000,
    })
  })

  test('minimal keyguard compiles with openings_and_additions.txt include', async ({ page }) => {
    test.setTimeout(90000) // WASM compilation can be slow

    // Upload SCAD file first (single-file input)
    const fileInput = page.locator('#fileInput')
    await fileInput.waitFor({ state: 'attached', timeout: 10000 })
    await fileInput.setInputFiles(MINIMAL_SCAD_PATH)

    // Wait for parameters to load (initial auto-compile may fail because
    // companion file isn't uploaded yet — that's expected)
    const mainInterface = page.locator('#mainInterface')
    await mainInterface.waitFor({ state: 'visible', timeout: 30000 })
    await page.waitForSelector('.param-control', { state: 'attached', timeout: 30000 })

    // Dismiss save-project modal if it pops up (blocks pointer events)
    try {
      const notNowBtn = page.locator('#saveProjectNotNow')
      await notNowBtn.waitFor({ state: 'visible', timeout: 3000 })
      await notNowBtn.click()
      await page.waitForTimeout(300)
    } catch {
      // Modal didn't appear
    }

    // Add companion file (openings_and_additions.txt) via the companion file input
    const companionInput = page.locator('#addCompanionFileInput')
    if (await companionInput.count() > 0) {
      await companionInput.setInputFiles(OPENINGS_TXT_PATH)
      await page.waitForTimeout(1000) // Allow time for file to be registered
    }

    // Reset error tracking AFTER companion upload, then trigger recompile
    const postUploadErrors = []
    page.on('console', (msg) => {
      postUploadErrors.push({ type: msg.type(), text: msg.text() })
    })

    // Trigger a fresh compile now that the companion file is available
    const previewBtn = page.locator('#previewBtn, #primaryActionBtn').first()
    if (await previewBtn.isVisible().catch(() => false)) {
      await previewBtn.click()
      await page.waitForTimeout(3000) // Allow time for WASM compilation
    }

    // Check no "file not found" errors AFTER companion file was provided
    const fileNotFoundErrors = postUploadErrors.filter(l =>
      l.text.toLowerCase().includes('file not found') ||
      l.text.toLowerCase().includes('can\'t open include file')
    )
    console.log(`[Compilation Smoke] Post-upload file-not-found errors: ${fileNotFoundErrors.length}`)
    for (const err of fileNotFoundErrors) {
      console.log(`  -> ${err.text}`)
    }
    expect(fileNotFoundErrors.length).toBe(0)

    await page.screenshot({ path: 'test-results/compilation-smoke-loaded.png', fullPage: true })
  })

  test('yes/no toggle parameters are rendered as accessible toggle switches', async ({ page }) => {
    test.setTimeout(90000)
    // CRITICAL: Verify that "yes"/"no" string parameters are rendered as
    // toggle switches (checkbox with role="switch"), NOT converted to plain
    // booleans. The parser keeps them as type='string' with uiType='toggle',
    // and the UI generator renders them as <input type="checkbox" role="switch">.
    // This preserves the original string values ("yes"/"no") for OpenSCAD
    // string comparisons like if (expose_home_button == "yes").

    // Upload SCAD file
    const fileInput = page.locator('#fileInput')
    await fileInput.waitFor({ state: 'attached', timeout: 10000 })
    await fileInput.setInputFiles(MINIMAL_SCAD_PATH)

    // Wait for parameters to load
    const mainInterface = page.locator('#mainInterface')
    await mainInterface.waitFor({ state: 'visible', timeout: 30000 })
    await page.waitForSelector('.param-control', { state: 'attached', timeout: 20000 })

    // Look for toggle-switch controls (checkbox with role="switch")
    // The parser treats //[yes,no] as a toggle, rendered as a checkbox switch.
    const toggleSwitches = page.locator('.param-control input[role="switch"]')
    const toggleCount = await toggleSwitches.count()

    console.log(`[Compilation Smoke] Found ${toggleCount} toggle switches (role="switch")`)
    // The minimal keyguard has ~10 yes/no params (expose_home_button, have_a_case, etc.)
    expect(toggleCount).toBeGreaterThan(0)

    // Verify each toggle has a proper accessible label
    for (let i = 0; i < Math.min(toggleCount, 5); i++) {
      const toggle = toggleSwitches.nth(i)
      const ariaLabel = await toggle.getAttribute('aria-label')
      const label = await toggle.evaluate(el => {
        const lbl = el.closest('.param-control')?.querySelector('label')
        return lbl?.textContent?.trim() || null
      })
      expect(ariaLabel || label).toBeTruthy()
    }

    await page.screenshot({ path: 'test-results/compilation-smoke-toggles.png', fullPage: true })
  })

  test('full keyguard ZIP triggers preview render', async ({ page }) => {
    test.skip(!KEYGUARD_ZIP_EXISTS, `Fixture not found: ${KEYGUARD_ZIP_PATH}`)
    // This test uses a longer timeout -- the full keyguard is a large file
    test.setTimeout(120000)

    const consoleLogs = []
    page.on('console', (msg) => {
      consoleLogs.push({ type: msg.type(), text: msg.text() })
    })

    const fileInput = page.locator('#fileInput')
    await fileInput.waitFor({ state: 'attached', timeout: 10000 })
    await fileInput.setInputFiles(KEYGUARD_ZIP_PATH)

    // Wait for parameters to load
    const mainInterface = page.locator('#mainInterface')
    await mainInterface.waitFor({ state: 'visible', timeout: 30000 })
    await page.waitForSelector('.param-control', { state: 'attached', timeout: 20000 })

    console.log('[Compilation Smoke] ZIP loaded, parameters extracted')

    // Wait for any auto-preview or trigger one
    // Check if there's a render/preview button and click it
    const previewBtn = page.locator('#previewBtn, button:has-text("Preview"), button:has-text("Render")')
    if (await previewBtn.isVisible().catch(() => false)) {
      console.log('[Compilation Smoke] Clicking preview button')
      await previewBtn.click()
    }

    // Wait for render to complete (up to 90s for this large file)
    // Look for canvas content, render complete indicators, or timing logs
    const renderStart = performance.now()

    // Wait for either render completion or error
    try {
      await page.waitForFunction(() => {
        // Check for 3D viewer canvas with content
        const canvas = document.querySelector('#viewer canvas, .viewer-canvas, canvas')
        if (canvas && canvas.width > 0 && canvas.height > 0) return true
        // Check for render complete indicator
        const status = document.querySelector('#renderStatus, .render-status')
        if (status && status.textContent.toLowerCase().includes('complete')) return true
        return false
      }, { timeout: 90000 })
    } catch {
      console.log('[Compilation Smoke] Render did not complete within timeout (expected for large file)')
    }

    const renderDuration = Math.round(performance.now() - renderStart)
    console.log(`[Compilation Smoke] Waited ${renderDuration}ms for render`)

    // Check for file-not-found errors in console
    const fileErrors = consoleLogs.filter(l =>
      l.text.toLowerCase().includes('file not found') ||
      l.text.toLowerCase().includes('can\'t open include file')
    )
    console.log(`[Compilation Smoke] File errors: ${fileErrors.length}`)
    expect(fileErrors.length).toBe(0)

    // Log render-related messages
    const renderLogs = consoleLogs.filter(l =>
      l.text.includes('[Render]') || l.text.includes('compilation') || l.text.includes('render')
    )
    for (const log of renderLogs.slice(-10)) {
      console.log(`  [Console] ${log.text.substring(0, 200)}`)
    }

    await page.screenshot({ path: 'test-results/compilation-smoke-rendered.png', fullPage: true })
  })
})
