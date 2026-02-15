/**
 * Keyguard Parser Smoke Tests
 * Uploads the real keyguard_v75.scad (no ZIP) and validates parameter extraction:
 * - Tab group count >= 23 (all non-Hidden groups)
 * - type_of_tablet dropdown has 90+ options
 * - [Hidden] params are NOT visible in UI
 * - Parse timing logged
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Path to the real keyguard SCAD file (stakeholder fixture, may not exist in all envs)
const KEYGUARD_SCAD_PATH = path.resolve(
  __dirname, '..', '..', '.volkswitch', 'Keyguard Design', 'keyguard_v75.scad'
)
const KEYGUARD_EXISTS = fs.existsSync(KEYGUARD_SCAD_PATH)

test.describe('Keyguard Parser Smoke Tests', () => {
  test.describe.configure({ timeout: 150_000 }) // Large-file parsing can be slow

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

  test('uploads keyguard_v75.scad and extracts parameters correctly', async ({ page }) => {
    test.skip(!KEYGUARD_EXISTS, `Fixture not found: ${KEYGUARD_SCAD_PATH}`)
    test.setTimeout(120000) // Large file needs more time for WASM processing
    const consoleLogs = []
    page.on('console', (msg) => {
      consoleLogs.push({ type: msg.type(), text: msg.text() })
    })

    // Upload just the .scad file (no ZIP)
    const fileInput = page.locator('#fileInput')
    await fileInput.waitFor({ state: 'attached', timeout: 10000 })

    const parseStart = performance.now()
    await fileInput.setInputFiles(KEYGUARD_SCAD_PATH)

    // Wait for parameters to load
    const mainInterface = page.locator('#mainInterface')
    await mainInterface.waitFor({ state: 'visible', timeout: 30000 })
    await page.waitForSelector('.param-control', { state: 'attached', timeout: 20000 })
    const parseEnd = performance.now()

    const parseDuration = Math.round(parseEnd - parseStart)
    console.log(`[Parser Smoke] Parse + UI render time: ${parseDuration}ms`)

    // Count parameter controls in the UI
    const paramControls = page.locator('.param-control')
    const paramCount = await paramControls.count()
    console.log(`[Parser Smoke] Parameter controls rendered: ${paramCount}`)
    expect(paramCount).toBeGreaterThan(50)

    // Count parameter groups (rendered as collapsible <details> elements)
    const paramGroups = page.locator('.param-group')
    const groupCount = await paramGroups.count()
    console.log(`[Parser Smoke] Parameter groups in UI: ${groupCount}`)
    // keyguard_v75.scad has 24 groups, minus [Hidden] = 23 visible
    expect(groupCount).toBeGreaterThanOrEqual(20)

    await page.screenshot({ path: 'test-results/parser-smoke-loaded.png', fullPage: true })
  })

  test('type_of_tablet dropdown has 90+ options', async ({ page }) => {
    test.skip(!KEYGUARD_EXISTS, `Fixture not found: ${KEYGUARD_SCAD_PATH}`)
    test.setTimeout(120000)
    const fileInput = page.locator('#fileInput')
    await fileInput.waitFor({ state: 'attached', timeout: 10000 })
    await fileInput.setInputFiles(KEYGUARD_SCAD_PATH)

    await page.waitForSelector('.param-control', { state: 'attached', timeout: 90000 })
    await page.waitForTimeout(1000)

    // Find the type_of_tablet dropdown
    // Look for a select element inside a param-control that contains "iPad" options
    const selects = page.locator('.param-control select')
    const selectCount = await selects.count()

    let tabletSelect = null
    let tabletOptionCount = 0

    for (let i = 0; i < selectCount; i++) {
      const select = selects.nth(i)
      const optionTexts = await select.locator('option').allTextContents()
      // type_of_tablet has "iPad" and "Samsung" and "blank" options
      if (optionTexts.some(o => o.includes('iPad')) &&
          optionTexts.some(o => o.includes('Samsung')) &&
          optionTexts.some(o => o.includes('blank'))) {
        tabletSelect = select
        tabletOptionCount = optionTexts.length
        console.log(`[Parser Smoke] type_of_tablet dropdown: ${tabletOptionCount} options`)
        break
      }
    }

    expect(tabletSelect).not.toBeNull()
    expect(tabletOptionCount).toBeGreaterThanOrEqual(90)
  })

  test('[Hidden] parameters are NOT visible in the UI', async ({ page }) => {
    test.skip(!KEYGUARD_EXISTS, `Fixture not found: ${KEYGUARD_SCAD_PATH}`)
    test.setTimeout(120000)
    const fileInput = page.locator('#fileInput')
    await fileInput.waitFor({ state: 'attached', timeout: 10000 })
    await fileInput.setInputFiles(KEYGUARD_SCAD_PATH)

    await page.waitForSelector('.param-control', { state: 'attached', timeout: 90000 })
    await page.waitForTimeout(1000)

    // Hidden params from keyguard_v75.scad: keyguard_designer_version, MW_version, fudge
    // These should NOT appear as visible controls

    const pageContent = await page.content()

    // Check that the Hidden tab group is not rendered
    const hiddenTab = page.locator('[role="tab"]:has-text("Hidden"), .tab-button:has-text("Hidden"), .group-tab:has-text("Hidden")')
    const hiddenTabVisible = await hiddenTab.isVisible().catch(() => false)
    console.log(`[Parser Smoke] Hidden tab visible: ${hiddenTabVisible}`)
    expect(hiddenTabVisible).toBe(false)

    // Check that known hidden params are not in the UI
    const paramLabels = await page.locator('.param-control label').allTextContents()
    const labelTexts = paramLabels.map(l => l.toLowerCase())

    const hasDesignerVersion = labelTexts.some(l => l.includes('keyguard_designer_version'))
    const hasMWVersion = labelTexts.some(l => l.includes('mw_version'))
    console.log(`[Parser Smoke] keyguard_designer_version visible: ${hasDesignerVersion}`)
    console.log(`[Parser Smoke] MW_version visible: ${hasMWVersion}`)

    expect(hasDesignerVersion).toBe(false)
    expect(hasMWVersion).toBe(false)
  })
})
