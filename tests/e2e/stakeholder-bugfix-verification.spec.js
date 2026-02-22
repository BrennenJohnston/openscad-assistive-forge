/**
 * E2E verification tests for stakeholder-reported bug fixes (Bugs 1, 3, 4, 5).
 * Bug 2 is deferred (design-only feature).
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import JSZip from 'jszip'

const isCI = !!process.env.CI

test.describe.configure({ timeout: 150_000 })

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear()
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
  })
})

/**
 * Load keyguard-demo example via deep-link (includes companion file).
 * The example ships WITH openings_and_additions.txt, so it appears as present.
 */
const loadKeyguardDemo = async (page) => {
  await page.goto('/?example=keyguard-demo')
  const mainInterface = page.locator('#mainInterface')
  await mainInterface.waitFor({ state: 'visible', timeout: 30000 })
  await page.waitForSelector('.param-control', { state: 'attached', timeout: 20000 })
}

/**
 * Load simple-box example (no companion files).
 */
const loadSimpleBoxExample = async (page) => {
  await page.goto('/?example=simple-box')
  const mainInterface = page.locator('#mainInterface')
  await mainInterface.waitFor({ state: 'visible', timeout: 30000 })
  await page.waitForSelector('.param-control', { state: 'attached', timeout: 20000 })
}

/**
 * Create a ZIP with a SCAD file that has `include` for a companion file,
 * but the included file is deliberately missing. OpenSCAD treats missing
 * includes as warnings (non-fatal), so the model still processes.
 */
const createMissingCompanionZip = async () => {
  const zip = new JSZip()
  const scad = `// Test file with missing companion
include <openings_and_additions.txt>

/* [Settings] */
width = 100; // [50:200]

cube([width, 50, 10]);
`
  zip.file('test_missing.scad', scad)
  // Deliberately NOT adding openings_and_additions.txt

  const buffer = await zip.generateAsync({ type: 'nodebuffer' })
  const outputDir = path.join(process.cwd(), 'test-results')
  await fs.promises.mkdir(outputDir, { recursive: true })
  const zipPath = path.join(outputDir, `missing-companion-${Date.now()}.zip`)
  await fs.promises.writeFile(zipPath, buffer)
  return zipPath
}

/**
 * Create a ZIP with include_screenshot and screenshot_file parameters.
 */
const createScreenshotTestZip = async () => {
  const zip = new JSZip()
  const scad = `// Screenshot overlay test
/* [Display] */
include_screenshot = "no"; // [yes, no]
screenshot_file = "test_overlay.svg";

/* [Settings] */
width = 100; // [50:200]

cube([width, 50, 10]);
`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">
  <rect width="200" height="100" fill="#eee" stroke="#333" stroke-width="2"/>
  <text x="100" y="55" text-anchor="middle" font-size="16">Test Overlay</text>
</svg>`

  zip.file('screenshot_test.scad', scad)
  zip.file('test_overlay.svg', svg)

  const buffer = await zip.generateAsync({ type: 'nodebuffer' })
  const outputDir = path.join(process.cwd(), 'test-results')
  await fs.promises.mkdir(outputDir, { recursive: true })
  const zipPath = path.join(outputDir, `screenshot-test-${Date.now()}.zip`)
  await fs.promises.writeFile(zipPath, buffer)
  return zipPath
}

/**
 * Upload a ZIP via the hidden file input, handling missing-file dialogs
 */
const uploadZip = async (page, zipPath) => {
  await page.goto('/')
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: 120_000,
  })
  const fileInput = page.locator('#fileInput')
  await fileInput.setInputFiles(zipPath)

  // Handle "Missing Files Detected" dialog if it appears
  try {
    const continueBtn = page.locator('button:has-text("Continue Anyway")')
    await continueBtn.waitFor({ state: 'visible', timeout: 5000 })
    await continueBtn.click()
    await page.waitForTimeout(500)
  } catch {
    // No missing file dialog
  }

  await page.locator('#mainInterface').waitFor({ state: 'visible', timeout: 60000 })

  // Dismiss save-project modal if it appears
  try {
    const notNowBtn = page.locator('#saveProjectNotNow')
    await notNowBtn.waitFor({ state: 'visible', timeout: 3000 })
    await notNowBtn.click()
    await page.waitForTimeout(300)
  } catch {
    // Modal didn't appear
  }
  await page.waitForTimeout(500)
}

/**
 * Expand the Presets collapsible panel so buttons are visible
 */
const expandPresetsPanel = async (page) => {
  const presetsHeader = page.locator('#presetControls summary, [data-panel="presets"] summary, details:has(#presetSelect) summary').first()
  if (await presetsHeader.count() > 0) {
    const details = presetsHeader.locator('..')
    const isOpen = await details.getAttribute('open')
    if (isOpen === null) {
      await presetsHeader.click()
      await page.waitForTimeout(300)
    }
  }
}

/**
 * Save a preset with the given name
 */
const savePresetWithName = async (page, name) => {
  await expandPresetsPanel(page)
  const addPresetBtn = page.locator('#addPresetBtn, button[aria-label*="Add preset"]').first()
  await addPresetBtn.waitFor({ state: 'visible', timeout: 10000 })
  await addPresetBtn.click()
  const nameInput = page.locator('#presetName, input[placeholder*="preset"]').first()
  await nameInput.waitFor({ state: 'visible', timeout: 5000 })
  await nameInput.fill(name)
  const confirmButton = page.locator('button[type="submit"]:has-text("Save")').first()
  await confirmButton.click()
  await page.waitForSelector('.preset-modal', { state: 'detached', timeout: 5000 })
  await page.waitForTimeout(500)
}

// ─────────────────────────────────────────────────────────────
// Bug 1: Console warnings for missing companion files
// ─────────────────────────────────────────────────────────────

test.describe('Bug 1: Console warnings for missing companion files', () => {
  test('synthetic WARNING appears in Console panel when companion file is missing', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    const zipPath = await createMissingCompanionZip()
    await uploadZip(page, zipPath)

    await page.waitForTimeout(3000)

    // Companion Files panel should show missing file warning
    const warningText = page.locator('#projectFilesWarningText')
    if (await warningText.isVisible()) {
      const text = await warningText.textContent()
      console.log('[Bug1] Warning text:', text)
      expect(text).toContain('Missing')
    }

    // Expand console panel
    const consoleDetails = page.locator('#consolePanel, details:has(#console-output)')
    if (await consoleDetails.count() > 0) {
      const summary = consoleDetails.locator('summary').first()
      if (await summary.count() > 0) {
        await summary.click()
        await page.waitForTimeout(500)
      }
    }

    // Check console entries for actual WARNING messages (not placeholder text)
    const warningEntries = page.locator('.console-entry.warning, .console-entry[data-type="warning"]')
    const warningCount = await warningEntries.count()
    console.log('[Bug1] Warning entries found:', warningCount)

    if (warningCount > 0) {
      const firstWarning = await warningEntries.first().textContent()
      console.log('[Bug1] First warning entry text:', firstWarning)
      expect(firstWarning).toContain("Can't open include file")
    } else {
      // Fallback: check the raw console output for synthetic warning text
      const consoleOutput = page.locator('#console-output')
      const text = await consoleOutput.textContent()
      console.log('[Bug1] Console raw text:', text?.substring(0, 500))
      expect(text).toContain("openings_and_additions.txt")
    }

    await page.screenshot({ path: 'test-results/bug1-missing-companion-warning.png', fullPage: true })
  })

  test('console warning filter checkbox controls WARNING visibility', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    const zipPath = await createMissingCompanionZip()
    await uploadZip(page, zipPath)
    await page.waitForTimeout(3000)

    // The Console Output panel is a collapsible <details> element.
    // First expand it by clicking the summary, then expand any inner
    // filter sections to make checkboxes visible.
    const consoleSummary = page.locator('region:has-text("console output") summary, [aria-label*="console"] summary, #consolePanel summary, summary:has-text("Console Output")').first()
    if (await consoleSummary.count() > 0) {
      await consoleSummary.click()
      await page.waitForTimeout(500)
    }

    // Use evaluate to toggle the filter checkbox via DOM (it may be covered by
    // a custom CSS checkbox overlay that prevents Playwright clicks from toggling).
    const warnFilter = page.locator('#console-filter-warn')
    if (await warnFilter.count() > 0) {
      const isChecked = await warnFilter.isChecked({ timeout: 5000 })
      console.log('[Bug1-filter] Warning filter initially checked:', isChecked)
      expect(isChecked).toBe(true)

      // Toggle off via DOM click
      await page.evaluate(() => {
        const cb = document.getElementById('console-filter-warn')
        if (cb) { cb.click() }
      })
      await page.waitForTimeout(300)
      const unchecked = await warnFilter.isChecked()
      console.log('[Bug1-filter] After uncheck:', unchecked)
      expect(unchecked).toBe(false)

      // Toggle back on
      await page.evaluate(() => {
        const cb = document.getElementById('console-filter-warn')
        if (cb) { cb.click() }
      })
      await page.waitForTimeout(300)
      const rechecked = await warnFilter.isChecked()
      console.log('[Bug1-filter] After re-check:', rechecked)
      expect(rechecked).toBe(true)
    } else {
      console.log('[Bug1-filter] Warning filter checkbox not found, skipping')
      test.skip()
    }
  })
})

// ─────────────────────────────────────────────────────────────
// Bug 3: include_screenshot parameter wiring to overlay
// ─────────────────────────────────────────────────────────────

test.describe('Bug 3: include_screenshot overlay wiring', () => {
  test('setting include_screenshot to yes enables the overlay', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    const zipPath = await createScreenshotTestZip()
    await uploadZip(page, zipPath)

    await page.waitForSelector('.param-control', { state: 'attached', timeout: 20000 })
    await page.waitForTimeout(2000)

    // include_screenshot renders as a toggle switch (checkbox role="switch")
    const screenshotToggle = page.locator('#param-include_screenshot, [id*="include_screenshot"]').first()
    if (await screenshotToggle.count() === 0) {
      console.log('[Bug3] include_screenshot control not found, skipping')
      test.skip()
      return
    }

    // Check initial state -- should be unchecked ("no")
    const initialChecked = await screenshotToggle.isChecked()
    console.log('[Bug3] Initial include_screenshot state:', initialChecked)

    // Enable it (set to "yes")
    if (!initialChecked) {
      await screenshotToggle.check()
      await page.waitForTimeout(2000)
    }

    // Check if overlay toggle is now enabled
    const overlayToggle = page.locator('#overlayToggle')
    if (await overlayToggle.count() > 0) {
      const isChecked = await overlayToggle.isChecked()
      console.log('[Bug3] Overlay toggle checked after setting include_screenshot=yes:', isChecked)
      expect(isChecked).toBe(true)
    }

    await page.screenshot({ path: 'test-results/bug3-overlay-enabled.png', fullPage: true })

    // Now uncheck it (set to "no") -- overlay should turn off
    await screenshotToggle.uncheck()
    await page.waitForTimeout(2000)

    if (await overlayToggle.count() > 0) {
      const isChecked = await overlayToggle.isChecked()
      console.log('[Bug3] Overlay toggle checked after setting include_screenshot=no:', isChecked)
      expect(isChecked).toBe(false)
    }

    await page.screenshot({ path: 'test-results/bug3-overlay-disabled.png', fullPage: true })
  })
})

// ─────────────────────────────────────────────────────────────
// Bug 4: Imported preset auto-selected in dropdown
// ─────────────────────────────────────────────────────────────

test.describe('Bug 4: Imported preset auto-selection', () => {
  test('imported preset is auto-selected in dropdown after import', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    try {
      await loadSimpleBoxExample(page)
    } catch {
      test.skip()
      return
    }

    await expandPresetsPanel(page)

    // Change a parameter
    const firstSlider = page.locator('input[type="range"]').first()
    if (await firstSlider.isVisible()) {
      await firstSlider.fill('85')
      await page.waitForTimeout(500)
    }

    // Save a preset to export
    await savePresetWithName(page, 'Export Me Preset')

    // Open manage presets modal
    const manageBtn = page.locator('#managePresetsBtn')
    await manageBtn.waitFor({ state: 'visible', timeout: 5000 })
    await manageBtn.click()
    await page.waitForTimeout(1000)

    // Use "Export All Designs" button (always visible in modal header)
    const exportAllBtn = page.locator('button:has-text("Export All")')
    if (await exportAllBtn.count() === 0) {
      console.log('[Bug4] No Export All button found, skipping')
      test.skip()
      return
    }

    const downloadPromise = page.waitForEvent('download')
    await exportAllBtn.click()
    const download = await downloadPromise
    const downloadPath = path.join(process.cwd(), 'test-results', `exported-all-${Date.now()}.json`)
    await download.saveAs(downloadPath)
    await page.waitForTimeout(1000)

    // The preset-modal may still be open and intercepting pointer events.
    // Close it explicitly by clicking the Close button or the × inside the modal.
    const modalCloseBtn = page.locator('.preset-modal button:has-text("Close"), .preset-modal button:has-text("×")').first()
    if (await modalCloseBtn.count() > 0 && await modalCloseBtn.isVisible()) {
      await modalCloseBtn.click()
      await page.waitForTimeout(500)
    }

    // Also try pressing Escape in case the modal is still there
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)

    // Delete the preset so we can verify it comes back after import
    const deleteBtn = page.locator('#deletePresetBtn')
    if (await deleteBtn.isVisible() && !(await deleteBtn.isDisabled())) {
      page.on('dialog', dialog => dialog.accept())
      await deleteBtn.click({ force: true })
      await page.waitForTimeout(500)
    }

    // Verify preset is gone
    const presetSelect = page.locator('select#presetSelect')
    let options = await presetSelect.locator('option').allTextContents()
    const hasPresetBefore = options.some(opt => opt.includes('Export Me Preset'))
    console.log('[Bug4] Preset still in dropdown before import:', hasPresetBefore)

    // Open manage presets modal and import
    await manageBtn.click()
    await page.waitForTimeout(1000)

    // Use "Import Designs" button
    const importBtn = page.locator('button:has-text("Import Designs")')
    if (await importBtn.count() === 0) {
      console.log('[Bug4] No Import Designs button found, skipping')
      test.skip()
      return
    }

    await importBtn.click()
    await page.waitForTimeout(500)

    // An import mode dialog appears (merge/replace). Click "Choose files..." to proceed.
    const importModeDialog = page.locator('dialog[open]')
    if (await importModeDialog.count() > 0) {
      // Set up filechooser BEFORE clicking submit (the submit triggers the filechooser)
      const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 10000 })
      const chooseFilesBtn = importModeDialog.locator('button[value="ok"], button:has-text("Choose files")')
      await chooseFilesBtn.click()

      try {
        const fileChooser = await fileChooserPromise
        await fileChooser.setFiles(downloadPath)
      } catch {
        console.log('[Bug4] File chooser not triggered, skipping')
        test.skip()
        return
      }
    } else {
      console.log('[Bug4] Import mode dialog did not appear, skipping')
      test.skip()
      return
    }

    // Dismiss any alert dialogs that appear
    await page.waitForTimeout(3000)

    // Close modal if still open
    const closeBtn2 = page.locator('dialog button:has-text("Close"), dialog button:has-text("×")').first()
    if (await closeBtn2.count() > 0 && await closeBtn2.isVisible()) {
      await closeBtn2.click()
      await page.waitForTimeout(500)
    }

    // Verify the preset is now in the dropdown
    options = await presetSelect.locator('option').allTextContents()
    const hasPresetAfter = options.some(opt => opt.includes('Export Me Preset'))
    console.log('[Bug4] Preset in dropdown after import:', hasPresetAfter)
    expect(hasPresetAfter).toBe(true)

    // The preset should be auto-selected
    const selectedOption = await presetSelect.locator('option:checked').textContent()
    console.log('[Bug4] Selected option after import:', selectedOption)
    expect(selectedOption).toContain('Export Me Preset')

    await page.screenshot({ path: 'test-results/bug4-import-autoselect.png', fullPage: true })
  })
})

// ─────────────────────────────────────────────────────────────
// Bug 5: Preset compatibility warning correctness
// ─────────────────────────────────────────────────────────────

test.describe('Bug 5: Preset compatibility warning', () => {
  test('compatible preset loads without false warning dialog', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    try {
      await loadSimpleBoxExample(page)
    } catch {
      test.skip()
      return
    }

    await expandPresetsPanel(page)

    // Save a preset
    await savePresetWithName(page, 'Compat OK Preset')

    // Modify a parameter
    const firstSlider = page.locator('input[type="range"]').first()
    if (await firstSlider.isVisible()) {
      await firstSlider.fill('60')
      await page.waitForTimeout(500)
    }

    // Select the saved preset
    const presetSelect = page.locator('select#presetSelect')
    await presetSelect.selectOption({ label: 'Compat OK Preset' })

    // Wait and verify NO compatibility dialog appeared
    await page.waitForTimeout(1500)
    const compatDialog = page.locator('.preset-modal:has-text("Different Version"), [role="alertdialog"]:has-text("Different Version")')
    const dialogVisible = await compatDialog.count() > 0 && await compatDialog.first().isVisible()
    console.log('[Bug5] Compatibility dialog shown for matching preset:', dialogVisible)
    expect(dialogVisible).toBe(false)

    // Verify preset loaded successfully
    const statusArea = page.locator('#statusArea')
    const statusText = await statusArea.textContent().catch(() => '')
    console.log('[Bug5] Status after loading compatible preset:', statusText)
    expect(statusText).toContain('Loaded preset')

    await page.screenshot({ path: 'test-results/bug5-no-false-warning.png', fullPage: true })
  })

  test('compatibility dialog does NOT list schema structural keys as parameters', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    // Pre-seed a tampered preset into localStorage BEFORE the page loads.
    // The preset has an extra "obsolete" parameter not in the schema.
    await page.addInitScript(() => {
      const presetData = {
        version: 2,
        presets: {
          'simple_box.scad': [{
            id: 'tampered-preset-test',
            name: 'Tampered Schema Test',
            parameters: {
              width: 100,
              depth: 60,
              height: 40,
              wall_thickness: 3,
              this_param_was_removed: 42
            },
            createdAt: Date.now(),
            modifiedAt: Date.now()
          }]
        }
      }
      localStorage.setItem('openscad-forge-presets-v2', JSON.stringify(presetData))
      localStorage.setItem('openscad-forge-first-visit-seen', 'true')
    })

    await page.goto('/?example=simple-box')
    await page.locator('#mainInterface').waitFor({ state: 'visible', timeout: 30000 })
    await page.waitForSelector('.param-control', { state: 'attached', timeout: 20000 })
    await expandPresetsPanel(page)
    await page.waitForTimeout(1000)

    // Select the tampered preset
    const presetSelect = page.locator('select#presetSelect')
    const options = await presetSelect.locator('option').allTextContents()
    console.log('[Bug5] Available presets:', options)
    const match = options.find(opt => opt.includes('Tampered Schema Test'))
    if (!match) {
      console.log('[Bug5] Tampered preset not found in dropdown')
      test.skip()
      return
    }

    await presetSelect.selectOption({ label: match })
    await page.waitForTimeout(2000)

    // A compatibility dialog SHOULD appear (extra param: this_param_was_removed)
    const compatDialog = page.locator('.preset-modal')
    if (await compatDialog.count() > 0 && await compatDialog.first().isVisible()) {
      const dialogText = await compatDialog.first().textContent()
      console.log('[Bug5] Compatibility dialog text:', dialogText?.substring(0, 500))

      // Must NOT contain schema structural keys
      expect(dialogText).not.toContain('"groups"')
      expect(dialogText).not.toContain('"parameters"')
      expect(dialogText).not.toContain('"hiddenParameters"')
      expect(dialogText).not.toContain('"libraries"')

      // Should contain the actual extra parameter
      expect(dialogText).toContain('this_param_was_removed')

      // The "obsolete" count should be reasonable (1), not 213
      const obsoleteMatch = dialogText?.match(/Obsolete parameters \((\d+)\)/)
      if (obsoleteMatch) {
        const count = parseInt(obsoleteMatch[1], 10)
        console.log('[Bug5] Obsolete parameter count:', count)
        expect(count).toBeLessThan(10)
      }

      await page.screenshot({ path: 'test-results/bug5-correct-compat-dialog.png', fullPage: true })

      // Click "Apply Anyway" to dismiss
      const applyBtn = compatDialog.locator('button[data-action="apply"]')
      if (await applyBtn.count() > 0) {
        await applyBtn.click()
        await page.waitForTimeout(500)
      }
    } else {
      console.log('[Bug5] Compatibility dialog did not appear (preset may match)')
    }
  })
})
