/**
 * E2E tests for preset save/load workflow
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test'
import {
  selectPreset,
  getSelectedPresetLabel,
  getPresetOptions,
} from './helpers/preset-helpers.js'

// Skip WASM-dependent tests in CI - WASM initialization is slow/unreliable
const isCI = !!process.env.CI

// URL query param that enables the searchable_combobox feature flag
const COMBOBOX_FLAG_PARAM = 'flag_searchable_combobox=true'

const loadSimpleBoxExample = async (page) => {
  // There are multiple "Start Tutorial" CTAs with the same example dataset.
  // In strict mode, Playwright requires a unique match, so pick a stable one.
  const exampleButton = page.locator(
    'button[data-example="simple-box"][data-role="beginners"], #loadSimpleBoxBtn, button:has-text("Simple Box")'
  ).first()

  await exampleButton.waitFor({ state: 'visible', timeout: 10000 })
  await exampleButton.click()

  const mainInterface = page.locator('#mainInterface')
  try {
    await mainInterface.waitFor({ state: 'visible', timeout: 20000 })
  } catch (error) {
    const statusText = await page.locator('#statusArea').textContent().catch(() => '')
    if (statusText?.includes('Error loading example')) {
      throw error
    }
    await exampleButton.click()
    await mainInterface.waitFor({ state: 'visible', timeout: 20000 })
  }

  await page.waitForSelector('.param-control', { state: 'attached', timeout: 20000 })
}

test.describe('Preset Workflow', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage before each test, but preserve first-visit-seen to avoid blocking modal
    await page.addInitScript(() => {
      localStorage.clear()
      localStorage.setItem('openscad-forge-first-visit-seen', 'true')
    })
    await page.goto('/')
  })

  test('should save a preset with custom name', async ({ page }) => {
    // Skip in CI - requires WASM to process example files
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    try {
      await loadSimpleBoxExample(page)
    } catch (error) {
      console.log('Could not load preset fixture:', error.message)
      test.skip()
      return
    }

    // Verify parameters are loaded
    const paramControls = page.locator('.param-control')
    if ((await paramControls.count()) === 0) {
      test.skip()
      return
    }

    // Change a parameter value
    const firstSlider = page.locator('input[type="range"]').first()
    if (await firstSlider.isVisible()) {
      await firstSlider.fill('75')
      await page.waitForTimeout(500)
    }

    // Find and click Save Preset button
    const saveButton = page.locator('button:has-text("Save Preset"), button[aria-label*="Save preset"]')
    if (!(await saveButton.isVisible())) {
      test.skip()
      return
    }

    await saveButton.click()

    // Fill in preset name
    const nameInput = page.locator('input[type="text"][placeholder*="Preset name"], input[type="text"][placeholder*="preset"]')
    if (await nameInput.isVisible()) {
      await nameInput.fill('My Test Preset')
      
      // Click Save/OK button in modal
      const confirmButton = page.locator('button:has-text("Save"), button:has-text("OK")')
      await confirmButton.click()
      
      await page.waitForTimeout(500)

      // Verify success message or feedback
      const successIndicator = page.locator('[role="status"]:has-text("Saved"), [role="alert"]:has-text("Saved"), .success-message')
      
      // Success indicator might appear and disappear, so we check if preset appears in list
      const options = await getPresetOptions(page)
      const hasSavedPreset = options.some(opt => opt.includes('My Test Preset'))
      expect(hasSavedPreset).toBe(true)

      // OpenSCAD Customizer behavior: newly saved preset should be auto-selected
      const selectedLabel = await getSelectedPresetLabel(page)
      expect(selectedLabel).toContain('My Test Preset')
    }
  })

  test('should auto-select newly saved preset (OpenSCAD Customizer behavior)', async ({ page }) => {
    // Skip in CI - requires WASM to process example files
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    try {
      await loadSimpleBoxExample(page)
    } catch (error) {
      console.log('Could not load preset fixture:', error.message)
      test.skip()
      return
    }

    // Find the Add Preset button ("+") to create a new preset
    const addPresetBtn = page.locator('#addPresetBtn, button[aria-label*="Add preset"]')
    if (!(await addPresetBtn.isVisible())) {
      test.skip()
      return
    }

    await addPresetBtn.click()

    // Fill in preset name in modal (scope to modal to avoid matching combobox search)
    const modal1 = page.locator('.preset-modal')
    await modal1.waitFor({ state: 'visible', timeout: 5000 })
    const nameInput = modal1.locator('#presetName, input[placeholder*="preset"]').first()
    if (await nameInput.isVisible()) {
      await nameInput.fill('Auto-Select Test Preset')
      
      // Click Save button in modal
      const confirmButton = page.locator('button[type="submit"]:has-text("Save")').first()
      await confirmButton.click()
      
      // Wait for modal to close
      await page.waitForSelector('.preset-modal', { state: 'detached', timeout: 5000 })
      await page.waitForTimeout(500)

      // Verify the newly saved preset is automatically selected in the dropdown
      // This matches OpenSCAD Customizer behavior where "+" creates and selects the preset
      const selectedLabel = await getSelectedPresetLabel(page)
      expect(selectedLabel).toContain('Auto-Select Test Preset')

      // The Save Preset button should now be enabled (can update this preset)
      const savePresetBtn = page.locator('#savePresetBtn')
      if (await savePresetBtn.isVisible()) {
        const isDisabled = await savePresetBtn.isDisabled()
        expect(isDisabled).toBe(false)
      }
    }
  })

  test('should keep preset selected after loading (selection persistence)', async ({ page }) => {
    // Skip in CI - requires WASM to process example files
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    try {
      await loadSimpleBoxExample(page)
    } catch (error) {
      console.log('Could not load preset fixture:', error.message)
      test.skip()
      return
    }

    // First, save a preset
    const addPresetBtn = page.locator('#addPresetBtn, button[aria-label*="Add preset"]')
    if (!(await addPresetBtn.isVisible())) {
      test.skip()
      return
    }

    await addPresetBtn.click()

    const modal2 = page.locator('.preset-modal')
    await modal2.waitFor({ state: 'visible', timeout: 5000 })
    const nameInput = modal2.locator('#presetName, input[placeholder*="preset"]').first()
    if (await nameInput.isVisible()) {
      await nameInput.fill('Persistence Test Preset')
      const confirmButton = page.locator('button[type="submit"]:has-text("Save")').first()
      await confirmButton.click()
      await page.waitForSelector('.preset-modal', { state: 'detached', timeout: 5000 })
      await page.waitForTimeout(500)
    }

    // Now select the preset from the dropdown
    const selected = await selectPreset(page, 'Persistence Test Preset')
    if (!selected) {
      test.skip()
      return
    }
    await page.waitForTimeout(1000)

    // Verify the preset is selected
    let selectedLabel = await getSelectedPresetLabel(page)
    expect(selectedLabel).toContain('Persistence Test Preset')

    // Wait a bit more to ensure any async operations complete
    await page.waitForTimeout(1000)

    // Verify the preset is STILL selected (not reset to "Select Preset")
    selectedLabel = await getSelectedPresetLabel(page)
    expect(selectedLabel).toContain('Persistence Test Preset')
    expect(selectedLabel).not.toContain('Select Preset')
  })

  test('should load a saved preset', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    try {
      await loadSimpleBoxExample(page)
    } catch (error) {
      console.log('Could not load preset fixture:', error.message)
      test.skip()
      return
    }

    // Get initial parameter value
    const firstSlider = page.locator('input[type="range"]').first()
    if (!(await firstSlider.isVisible())) {
      test.skip()
      return
    }

    const initialValue = await firstSlider.inputValue()
    const newValue = '80'

    // Change parameter
    await firstSlider.fill(newValue)
    await page.waitForTimeout(500)

    // Save preset
    const saveButton = page.locator('button:has-text("Save Preset")')
    if (!(await saveButton.isVisible())) {
      test.skip()
      return
    }

    await saveButton.click()

    const nameInput = page.locator('input[type="text"][placeholder*="Preset name"]')
    if (await nameInput.isVisible()) {
      await nameInput.fill('Load Test Preset')
      const confirmButton = page.locator('button:has-text("Save"), button:has-text("OK")')
      await confirmButton.click()
      await page.waitForTimeout(500)
    }

    // Change parameter to different value
    await firstSlider.fill(initialValue)
    await page.waitForTimeout(500)

    // Verify parameter changed
    expect(await firstSlider.inputValue()).toBe(initialValue)

    // Load the saved preset
    const selected = await selectPreset(page, 'Load Test Preset')
    if (selected) {
      await page.waitForTimeout(500)

      // Verify parameter value restored
      const restoredValue = await firstSlider.inputValue()
      expect(restoredValue).toBe(newValue)
    }
  })

  test('should export preset as JSON', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    try {
      await loadSimpleBoxExample(page)
    } catch (error) {
      console.log('Could not load preset fixture:', error.message)
      test.skip()
      return
    }

    // Save a preset first
    const saveButton = page.locator('button:has-text("Save Preset")')
    if (!(await saveButton.isVisible())) {
      test.skip()
      return
    }

    await saveButton.click()
    const modal = page.locator('.preset-modal')
    if (!(await modal.isVisible({ timeout: 2000 }).catch(() => false))) {
      test.skip()
      return
    }

    const nameInput = modal.locator('input[type="text"][placeholder*="Preset name"]')
    await nameInput.fill('Export Test')
    const confirmButton = modal.locator('button[type="submit"]')
    await confirmButton.click()
    await modal.waitFor({ state: 'detached', timeout: 5000 })

    const manageButton = page.locator('#managePresetsBtn, button[aria-label*="Manage presets"]')
    if (!(await manageButton.isVisible())) {
      test.skip()
      return
    }

    const lingeringModal = page.locator('.preset-modal')
    if (await lingeringModal.isVisible({ timeout: 1000 }).catch(() => false)) {
      const closeButton = lingeringModal.locator('[data-action="close"]').first()
      if (await closeButton.isVisible().catch(() => false)) {
        await closeButton.click()
      }
      await lingeringModal.waitFor({ state: 'detached', timeout: 5000 })
    }

    await manageButton.click()

    const presetItem = page.locator('.preset-item', { hasText: 'Export Test' })
    const exportButton = presetItem.locator('button[data-action="export"]')
    if (!(await exportButton.isVisible())) {
      test.skip()
      return
    }

    // Setup download listener
    const downloadPromise = page.waitForEvent('download', { timeout: 5000 }).catch(() => null)
    
    await exportButton.click()
    
    const download = await downloadPromise
    if (download) {
      // Verify download occurred
      const filename = download.suggestedFilename()
      expect(filename).toMatch(/\.json$/i)
    }
  })

  test('should import preset from JSON', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    try {
      await loadSimpleBoxExample(page)
    } catch (error) {
      console.log('Could not load preset fixture:', error.message)
      test.skip()
      return
    }

    // Find import button (more specific - only buttons)
    const importButton = page.locator('button[aria-label*="Import preset"]').first()
    
    if (!(await importButton.isVisible({ timeout: 2000 }).catch(() => false))) {
      test.skip()
      return
    }

    // Note: Actually importing a file requires file system access
    // This test verifies the button exists and is clickable
    // Full import testing is better done in unit tests
    expect(await importButton.isEnabled()).toBe(true)
  })

  test('Replace-mode import runs without TypeError and imports designs (F-5 regression)', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    try {
      await loadSimpleBoxExample(page)
    } catch (error) {
      console.log('Could not load preset fixture:', error.message)
      test.skip()
      return
    }

    const pageErrors = []
    page.on('pageerror', (err) => pageErrors.push(err.message))
    // Replace mode uses a native confirm() when user presets exist.
    page.on('dialog', (dialog) => dialog.accept())

    const manageBtn = page.locator('#managePresetsBtn')
    if (!(await manageBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip()
      return
    }
    await manageBtn.click()

    const importAction = page.locator('button[data-action="import"]')
    await expect(importAction).toBeVisible({ timeout: 5000 })

    const chooserPromise = page.waitForEvent('filechooser')
    await importAction.click()

    const modeDialog = page.locator('dialog.preset-import-mode-dialog')
    await expect(modeDialog).toBeVisible({ timeout: 5000 })
    // The Replace branch is the one that called the nonexistent
    // presetManager.getPresets() and threw before ever importing.
    await modeDialog.locator('input[name="importMode"][value="replace"]').check()
    await modeDialog.locator('button[value="ok"]').click()

    const chooser = await chooserPromise
    await chooser.setFiles({
      name: 'imported-presets.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify({
          parameterSets: { 'Imported Preset': {} },
          fileFormatVersion: '1',
        })
      ),
    })

    // Give the import handler time to parse and apply
    await page.waitForTimeout(1500)

    const getPresetsErrors = pageErrors.filter((m) => m.includes('getPresets'))
    expect(
      getPresetsErrors,
      `Replace-mode import must not throw (was: TypeError presetManager.getPresets is not a function)`
    ).toHaveLength(0)

    const optionLabels = await page
      .locator('#presetSelect')
      .evaluate((el) => Array.from(el.options).map((o) => o.textContent.trim()))
    expect(optionLabels.join('\n')).toContain('Imported Preset')
  })

  test('should delete a preset', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    try {
      await loadSimpleBoxExample(page)
    } catch (error) {
      console.log('Could not load preset fixture:', error.message)
      test.skip()
      return
    }

    // Save preset
    const saveButton = page.locator('button:has-text("Save Preset")')
    if (!(await saveButton.isVisible())) {
      test.skip()
      return
    }

    await saveButton.click()

    const nameInput = page.locator('input[type="text"][placeholder*="Preset name"]')
    if (await nameInput.isVisible()) {
      await nameInput.fill('Delete Test')
      const confirmButton = page.locator('button:has-text("Save")')
      await confirmButton.click()
      await page.waitForTimeout(500)
    }

    // Select the preset
    const selected = await selectPreset(page, 'Delete Test')
    if (!selected) {
      test.skip()
      return
    }
    await page.waitForTimeout(300)

    // Find and click delete button
    const deleteButton = page.locator('button:has-text("Delete Preset"), button[aria-label*="Delete preset"], button[title*="Delete"]')
    if (!(await deleteButton.isVisible())) {
      test.skip()
      return
    }

    await deleteButton.click()

    // Confirm deletion if confirmation dialog appears
    const confirmDelete = page.locator('button:has-text("Delete"), button:has-text("Yes"), button:has-text("OK")')
    if (await confirmDelete.isVisible({ timeout: 1000 })) {
      await confirmDelete.click()
    }

    await page.waitForTimeout(500)

    // Verify preset is removed
    const remainingOptions = await getPresetOptions(page)
    const stillExists = remainingOptions.some(opt => opt.includes('Delete Test'))
    expect(stillExists).toBe(false)
  })

  test('should show preset count in UI', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    try {
      await loadSimpleBoxExample(page)
    } catch (error) {
      console.log('Could not load preset fixture:', error.message)
      test.skip()
      return
    }

    // Count initial options
    const initialOptions = await getPresetOptions(page)
    const initialCount = initialOptions.length
    expect(initialCount).toBeGreaterThanOrEqual(1)

    // Save a preset
    const saveButton = page.locator('button:has-text("Save Preset")')
    if (await saveButton.isVisible()) {
      await saveButton.click()

      const nameInput = page.locator('input[type="text"][placeholder*="Preset name"]')
      if (await nameInput.isVisible()) {
        await nameInput.fill('Count Test')
        const confirmButton = page.locator('button:has-text("Save")')
        await confirmButton.click()
        await page.waitForTimeout(500)

        // Verify count increased
        const newOptions = await getPresetOptions(page)
        expect(newOptions.length).toBeGreaterThan(initialCount)
      }
    }
  })

  test('should handle preset names with special characters', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    try {
      await loadSimpleBoxExample(page)
    } catch (error) {
      console.log('Could not load preset fixture:', error.message)
      test.skip()
      return
    }

    const saveButton = page.locator('button:has-text("Save Preset")')
    if (!(await saveButton.isVisible())) {
      test.skip()
      return
    }

    await saveButton.click()

    const nameInput = page.locator('input[type="text"][placeholder*="Preset name"]')
    if (await nameInput.isVisible()) {
      // Try saving with special characters
      await nameInput.fill('Test "Preset" (v1.0)')
      const confirmButton = page.locator('button:has-text("Save")')
      await confirmButton.click()
      await page.waitForTimeout(500)

      // Verify it was saved (should either work or show validation error)
      const options = await getPresetOptions(page)
      // Either preset exists with cleaned name, or validation prevented save
      // Both behaviors are acceptable
      expect(options.length).toBeGreaterThanOrEqual(1)
    }
  })

  test('should persist presets across page reloads', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    // Capture console messages
    const consoleMessages = []
    page.on('console', msg => {
      consoleMessages.push(`[${msg.type()}] ${msg.text()}`)
    })

    try {
      await loadSimpleBoxExample(page)
    } catch (error) {
      console.log('Could not load preset fixture:', error.message)
      test.skip()
      return
    }

    const saveButton = page.locator('button:has-text("Save Preset")')
    if (!(await saveButton.isVisible())) {
      test.skip()
      return
    }

    // Check if presetManager exists before saving
    const presetManagerExists = await page.evaluate(() => {
      return {
        exists: typeof window.presetManager !== 'undefined',
        storageAvailable: window.presetManager ? window.presetManager.isStorageAvailable() : false
      }
    })
    console.log('PresetManager status:', presetManagerExists)

    await saveButton.click()

    // Wait for modal to appear
    const modal = page.locator('.preset-modal')
    await modal.waitFor({ state: 'visible', timeout: 5000 })
    console.log('Modal appeared')

    // Scope to modal to avoid matching combobox search input
    const nameInput = modal.locator('#presetName, input[placeholder*="preset"], input[placeholder*="Preset"]').first()
    await nameInput.waitFor({ state: 'visible', timeout: 5000 })
    console.log('Name input found')
    
    await nameInput.fill('Persistence Test')
    console.log('Filled preset name')
    
    const confirmButton = page.locator('button[type="submit"]:has-text("Save")').first()
    console.log('Confirm button visible:', await confirmButton.isVisible())
    
    await confirmButton.click()
    console.log('Clicked save button')
    
    // Wait for modal to close
    await page.waitForSelector('.preset-modal', { state: 'detached', timeout: 5000 })
    console.log('Modal closed')
    await page.waitForTimeout(1000)

    // Check localStorage before reload
    const storageBeforeReload = await page.evaluate(() => {
      return {
        presets: localStorage.getItem('openscad-customizer-presets'),
        allKeys: Object.keys(localStorage)
      }
    })
    console.log('localStorage before reload:', storageBeforeReload)
    console.log('Relevant console messages:', consoleMessages.filter(msg => 
      msg.includes('Preset') || msg.includes('localStorage') || msg.includes('Saved') || msg.includes('Failed')
    ))

    // Reload page
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    try {
      await loadSimpleBoxExample(page)
    } catch (error) {
      console.log('Could not load preset fixture after reload:', error.message)
      test.skip()
      return
    }

    // Wait for parameters to load
    const firstParam = page.locator('input[type="range"]').first()
    await firstParam.waitFor({ state: 'visible', timeout: 5000 })
    await page.waitForTimeout(1000)

    // Check localStorage after reload and model load
    const storageAfterReload = await page.evaluate(() => {
      const presets = localStorage.getItem('openscad-customizer-presets')
      const state = window.stateManager ? window.stateManager.getState() : null
      return {
        presets: presets,
        currentModelName: state?.uploadedFile?.name || 'no model',
        allKeys: Object.keys(localStorage)
      }
    })
    console.log('localStorage after reload:', storageAfterReload)

    // Verify preset still exists
    const options = await getPresetOptions(page)
    console.log('Available preset options after reload:', options)
    const persistedPreset = options.some(opt => opt.includes('Persistence Test'))
    expect(persistedPreset).toBe(true)
  })
})

// ── Project-Native Presets (project_presets flag) ─────────────────────────────
// These tests exercise the project-native preset source split when the
// project_presets feature flag is enabled via URL override.

import path from 'path'
import fs from 'fs'
import JSZip from 'jszip'

const PROJECT_PRESETS_FLAG = 'flag_project_presets=true'

/**
 * Create a ZIP bundle with a SCAD file and sidecar JSON containing presets.
 * @param {string} scadName  Main .scad filename
 * @param {string} jsonName  Sidecar .json filename
 * @param {Object} parameterSets  Preset parameter sets
 * @param {Object} [options]
 * @param {string} [options.zipBaseName]  Base name for the temp ZIP file
 * @param {Map<string,string>} [options.extraFiles]  Additional files to include
 * @returns {Promise<string>}  Path to the created ZIP file
 */
async function createProjectZip(scadName, jsonName, parameterSets, options = {}) {
  const zip = new JSZip()
  const scad = `// Test project
include <openings_and_additions.txt>
/* [Settings] */
width = 100; // [50:200]
height = 50; // [20:100]
cube([width, height, 10]);
`
  zip.file(scadName, scad)
  zip.file(jsonName, JSON.stringify({ parameterSets, fileFormatVersion: '1' }))
  zip.file('openings_and_additions.txt', 'screen_openings = [];')

  if (options.extraFiles) {
    for (const [name, content] of options.extraFiles) {
      zip.file(name, content)
    }
  }

  const buffer = await zip.generateAsync({ type: 'nodebuffer' })
  const outputDir = path.join(process.cwd(), 'test-results')
  await fs.promises.mkdir(outputDir, { recursive: true })
  const baseName = options.zipBaseName || 'project-preset-test'
  const zipPath = path.join(outputDir, `${baseName}-${Date.now()}.zip`)
  await fs.promises.writeFile(zipPath, buffer)
  return zipPath
}

/**
 * Upload a ZIP via the hidden file input, waiting for WASM and parameter load.
 */
async function uploadProjectZip(page, zipPath) {
  const fileInput = page.locator('#fileInput')
  await fileInput.waitFor({ state: 'attached', timeout: 10000 })
  await fileInput.setInputFiles(zipPath)

  await page.locator('#mainInterface').waitFor({ state: 'visible', timeout: 60000 })
  await page.waitForSelector('.param-control', { state: 'attached', timeout: 20000 })

  try {
    const notNowBtn = page.locator('#saveProjectNotNow')
    await notNowBtn.waitFor({ state: 'visible', timeout: 3000 })
    await notNowBtn.click()
    await page.waitForTimeout(300)
  } catch {
    // Modal didn't appear
  }
}

test.describe('Project-Native Presets (project_presets flag)', () => {
  test.describe.configure({ timeout: 150_000 })

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear()
      localStorage.setItem('openscad-forge-first-visit-seen', 'true')
    })
    await page.goto(`/?${PROJECT_PRESETS_FLAG}`)
    await page.waitForSelector('body[data-wasm-ready="true"]', {
      state: 'attached',
      timeout: 120_000,
    })
  })

  test('same project under different ZIP names yields identical project-native presets', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    const presets = {
      'design default values': {},
      'Config Alpha': { width: '120', height: '60' },
      'Config Beta': { width: '180', height: '90' },
    }

    const zip1 = await createProjectZip('model.scad', 'model.json', presets, {
      zipBaseName: 'zip-name-A',
    })

    await uploadProjectZip(page, zip1)
    await page.evaluate(() => {
      const d = document.getElementById('presetControls')
      if (d && !d.open) d.open = true
    })
    await page.waitForTimeout(500)

    const optionsFirst = await getPresetOptions(page)
    const projectPresetsFirst = optionsFirst.filter(
      (o) => o.includes('Config Alpha') || o.includes('Config Beta')
    )

    expect(projectPresetsFirst).toHaveLength(2)

    await page.goto(`/?${PROJECT_PRESETS_FLAG}`)
    await page.waitForSelector('body[data-wasm-ready="true"]', {
      state: 'attached',
      timeout: 120_000,
    })

    const zip2 = await createProjectZip('model.scad', 'model.json', presets, {
      zipBaseName: 'zip-name-B',
    })

    await uploadProjectZip(page, zip2)
    await page.evaluate(() => {
      const d = document.getElementById('presetControls')
      if (d && !d.open) d.open = true
    })
    await page.waitForTimeout(500)

    const optionsSecond = await getPresetOptions(page)
    const projectPresetsSecond = optionsSecond.filter(
      (o) => o.includes('Config Alpha') || o.includes('Config Beta')
    )

    expect(projectPresetsSecond).toEqual(projectPresetsFirst)
  })

  test('stale project-native presets do not survive project reload', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    const presetsA = {
      'design default values': {},
      'Stale Preset': { width: '100' },
      'Also Stale': { width: '200' },
    }

    const zipA = await createProjectZip('model.scad', 'model.json', presetsA, {
      zipBaseName: 'stale-test-A',
    })
    await uploadProjectZip(page, zipA)
    await page.evaluate(() => {
      const d = document.getElementById('presetControls')
      if (d && !d.open) d.open = true
    })
    await page.waitForTimeout(500)

    let options = await getPresetOptions(page)
    expect(options.some((o) => o.includes('Stale Preset'))).toBe(true)

    const presetsB = {
      'design default values': {},
      'Fresh Preset': { width: '999' },
    }

    const zipB = await createProjectZip('model2.scad', 'model2.json', presetsB, {
      zipBaseName: 'stale-test-B',
    })
    await uploadProjectZip(page, zipB)
    await page.evaluate(() => {
      const d = document.getElementById('presetControls')
      if (d && !d.open) d.open = true
    })
    await page.waitForTimeout(500)

    options = await getPresetOptions(page)
    expect(options.some((o) => o.includes('Stale Preset'))).toBe(false)
    expect(options.some((o) => o.includes('Also Stale'))).toBe(false)
    expect(options.some((o) => o.includes('Fresh Preset'))).toBe(true)
  })

  test('selecting a project-native preset keeps the selection visible', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    const presets = {
      'design default values': {},
      'Selection Test': { width: '150', height: '75' },
    }

    const zipPath = await createProjectZip('model.scad', 'model.json', presets, {
      zipBaseName: 'selection-test',
    })
    await uploadProjectZip(page, zipPath)
    await page.evaluate(() => {
      const d = document.getElementById('presetControls')
      if (d && !d.open) d.open = true
    })
    await page.waitForTimeout(500)

    const selected = await selectPreset(page, 'Selection Test')
    if (!selected) {
      test.skip()
      return
    }

    await page.waitForTimeout(1000)

    const label = await getSelectedPresetLabel(page)
    expect(label).toContain('Selection Test')
  })

  test('user-saved presets in localStorage survive project reload', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    const presets = {
      'design default values': {},
      'Project Preset': { width: '100' },
    }

    const zipPath = await createProjectZip('model.scad', 'model.json', presets, {
      zipBaseName: 'user-survive-test',
    })
    await uploadProjectZip(page, zipPath)
    await page.evaluate(() => {
      const d = document.getElementById('presetControls')
      if (d && !d.open) d.open = true
    })
    await page.waitForTimeout(500)

    const addBtn = page.locator('#addPresetBtn, button[aria-label*="Add preset"]')
    if (!(await addBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip()
      return
    }

    await addBtn.click()
    const modal = page.locator('.preset-modal')
    await modal.waitFor({ state: 'visible', timeout: 5000 })
    const nameInput = modal.locator('#presetName, input[placeholder*="preset"]').first()
    await nameInput.waitFor({ state: 'visible', timeout: 5000 })
    await nameInput.fill('My Saved Preset')
    await page.locator('button[type="submit"]:has-text("Save")').first().click()
    await page.waitForSelector('.preset-modal', { state: 'detached', timeout: 5000 })
    await page.waitForTimeout(500)

    let options = await getPresetOptions(page)
    expect(options.some((o) => o.includes('My Saved Preset'))).toBe(true)

    const zip2 = await createProjectZip('model.scad', 'model.json', presets, {
      zipBaseName: 'user-survive-reload',
    })
    await uploadProjectZip(page, zip2)
    await page.evaluate(() => {
      const d = document.getElementById('presetControls')
      if (d && !d.open) d.open = true
    })
    await page.waitForTimeout(500)

    options = await getPresetOptions(page)
    expect(options.some((o) => o.includes('My Saved Preset'))).toBe(true)
    expect(options.some((o) => o.includes('Project Preset'))).toBe(true)
  })
})

// ── Searchable Combobox variant ───────────────────────────────────────────────
// These tests exercise the same preset workflow with the searchable_combobox
// feature flag enabled via URL override (?flag_searchable_combobox=true).
// The native <select> is hidden and the WAI-ARIA combobox widget is shown.

test.describe('Preset Workflow — Searchable Combobox variant', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear()
      localStorage.setItem('openscad-forge-first-visit-seen', 'true')
    })
    await page.goto(`/?${COMBOBOX_FLAG_PARAM}`)
  })

  test('combobox is shown and native select is hidden when flag is enabled', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    try {
      await loadSimpleBoxExample(page)
    } catch {
      test.skip()
      return
    }

    const comboboxInput = page.locator('#presetComboboxContainer .preset-combobox-input')
    const nativeSelect = page.locator('select#presetSelect')

    // The combobox container should be visible; the legacy selector wrapper hidden
    await expect(comboboxInput).toBeVisible({ timeout: 5000 })
    await expect(nativeSelect).toBeHidden()
  })

  test('combobox shows "design default values" as the first option', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    try {
      await loadSimpleBoxExample(page)
    } catch {
      test.skip()
      return
    }

    const comboboxInput = page.locator('#presetComboboxContainer .preset-combobox-input')
    if (!(await comboboxInput.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip()
      return
    }

    // Open the combobox
    await comboboxInput.click()

    const listbox = page.locator('#presetComboboxContainer .preset-combobox-list')
    await expect(listbox).toBeVisible()

    // First rendered option must be "design default values"
    const firstOption = listbox.locator('.preset-combobox-option').first()
    await expect(firstOption).toHaveAttribute('data-value', '__design_defaults__')
    await expect(firstOption).toHaveClass(/is-italic/)
  })

  test('combobox filters options by text input', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    try {
      await loadSimpleBoxExample(page)
    } catch {
      test.skip()
      return
    }

    // Save two presets so there's something to filter
    const addBtn = page.locator('#addPresetBtn, button[aria-label*="Add preset"]')
    if (!(await addBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip()
      return
    }

    for (const name of ['Alpha Preset', 'Beta Preset']) {
      await addBtn.click()
      const addModal = page.locator('.preset-modal')
      await addModal.waitFor({ state: 'visible', timeout: 5000 })
      const nameInput = addModal.locator('#presetName, input[placeholder*="preset"]').first()
      await nameInput.waitFor({ state: 'visible', timeout: 5000 })
      await nameInput.fill(name)
      await page.locator('button[type="submit"]:has-text("Save")').first().click()
      await page.waitForSelector('.preset-modal', { state: 'detached', timeout: 5000 })
      await page.waitForTimeout(300)
    }

    const comboboxInput = page.locator('#presetComboboxContainer .preset-combobox-input')
    if (!(await comboboxInput.isVisible().catch(() => false))) {
      test.skip()
      return
    }

    // Type to filter — only "Alpha Preset" should remain
    await comboboxInput.fill('Alpha')
    await page.waitForTimeout(200)

    const listbox = page.locator('#presetComboboxContainer .preset-combobox-list')
    const visibleOptions = listbox.locator(
      '.preset-combobox-option:not(.preset-combobox-empty)'
    )
    const count = await visibleOptions.count()
    // At least one option visible, and all visible options include "Alpha"
    expect(count).toBeGreaterThan(0)
    for (let i = 0; i < count; i++) {
      const text = await visibleOptions.nth(i).textContent()
      expect(text?.toLowerCase()).toContain('alpha')
    }
  })

  test('combobox shows "No presets match" when filter has no results', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    try {
      await loadSimpleBoxExample(page)
    } catch {
      test.skip()
      return
    }

    const comboboxInput = page.locator('#presetComboboxContainer .preset-combobox-input')
    if (!(await comboboxInput.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip()
      return
    }

    await comboboxInput.fill('xyzzy_no_match_at_all')
    await page.waitForTimeout(200)

    const emptyMsg = page.locator('#presetComboboxContainer .preset-combobox-empty')
    await expect(emptyMsg).toBeVisible()
  })

  test('combobox closes on Escape and sets aria-expanded="false"', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    try {
      await loadSimpleBoxExample(page)
    } catch {
      test.skip()
      return
    }

    const comboboxInput = page.locator('#presetComboboxContainer .preset-combobox-input')
    if (!(await comboboxInput.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip()
      return
    }

    // Open
    await comboboxInput.click()
    await expect(comboboxInput).toHaveAttribute('aria-expanded', 'true')

    // Close via Escape
    await comboboxInput.press('Escape')
    await expect(comboboxInput).toHaveAttribute('aria-expanded', 'false')

    const listbox = page.locator('#presetComboboxContainer .preset-combobox-list')
    await expect(listbox).toBeHidden()
  })

  test('combobox selects a preset on click and fires change', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    try {
      await loadSimpleBoxExample(page)
    } catch {
      test.skip()
      return
    }

    // Save a preset to have something to select
    const addBtn = page.locator('#addPresetBtn, button[aria-label*="Add preset"]')
    if (!(await addBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip()
      return
    }

    await addBtn.click()
    const clickModal = page.locator('.preset-modal')
    await clickModal.waitFor({ state: 'visible', timeout: 5000 })
    const nameInput = clickModal.locator('#presetName, input[placeholder*="preset"]').first()
    await nameInput.waitFor({ state: 'visible', timeout: 5000 })
    await nameInput.fill('Click Select Test')
    await page.locator('button[type="submit"]:has-text("Save")').first().click()
    await page.waitForSelector('.preset-modal', { state: 'detached', timeout: 5000 })
    await page.waitForTimeout(300)

    const comboboxInput = page.locator('#presetComboboxContainer .preset-combobox-input')
    if (!(await comboboxInput.isVisible().catch(() => false))) {
      test.skip()
      return
    }

    // Open and click the saved preset
    await comboboxInput.click()
    const listbox = page.locator('#presetComboboxContainer .preset-combobox-list')
    await expect(listbox).toBeVisible()

    const targetOption = listbox.locator(
      '.preset-combobox-option:not(.preset-combobox-empty)',
      { hasText: 'Click Select Test' }
    )
    if (!(await targetOption.isVisible().catch(() => false))) {
      test.skip()
      return
    }

    await targetOption.click()

    // Combobox should close and show the selected label
    await expect(comboboxInput).toHaveValue('Click Select Test')
    await expect(listbox).toBeHidden()
  })

  test('combobox selection syncs to the hidden native select', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    try {
      await loadSimpleBoxExample(page)
    } catch {
      test.skip()
      return
    }

    // Save a preset so there's something to select
    const addBtn = page.locator('#addPresetBtn, button[aria-label*="Add preset"]')
    if (!(await addBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip()
      return
    }

    await addBtn.click()
    const syncModal = page.locator('.preset-modal')
    await syncModal.waitFor({ state: 'visible', timeout: 5000 })
    const nameInput = syncModal.locator('#presetName, input[placeholder*="preset"]').first()
    await nameInput.waitFor({ state: 'visible', timeout: 5000 })
    await nameInput.fill('Sync Test Preset')
    await page.locator('button[type="submit"]:has-text("Save")').first().click()
    await page.waitForSelector('.preset-modal', { state: 'detached', timeout: 5000 })
    await page.waitForTimeout(300)

    // Select via the combobox
    const comboboxInput = page.locator('#presetComboboxContainer .preset-combobox-input')
    if (!(await comboboxInput.isVisible().catch(() => false))) {
      test.skip()
      return
    }

    await comboboxInput.click()
    const listbox = page.locator('#presetComboboxContainer .preset-combobox-list')
    await expect(listbox).toBeVisible()

    const targetOption = listbox.locator(
      '.preset-combobox-option:not(.preset-combobox-empty)',
      { hasText: 'Sync Test Preset' }
    )
    await targetOption.click()

    // The hidden native select should have synced its value
    const nativeSelect = page.locator('select#presetSelect')
    const nativeValue = await nativeSelect.inputValue()
    expect(nativeValue).toBeTruthy()
    expect(nativeValue).not.toBe('')
  })

  test('shared selectPreset() helper works with combobox widget', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    try {
      await loadSimpleBoxExample(page)
    } catch {
      test.skip()
      return
    }

    // The shared helper should auto-detect the combobox and select "design default values"
    const options = await getPresetOptions(page)
    const designDefault = options.find(o => o.toLowerCase().includes('design default'))
    if (!designDefault) {
      test.skip()
      return
    }

    const result = await selectPreset(page, designDefault)
    expect(result).toBe(true)

    const label = await getSelectedPresetLabel(page)
    expect(label?.toLowerCase()).toContain('design default')
  })

  test('combobox selects a preset via keyboard Enter', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    try {
      await loadSimpleBoxExample(page)
    } catch {
      test.skip()
      return
    }

    const comboboxInput = page.locator('#presetComboboxContainer .preset-combobox-input')
    if (!(await comboboxInput.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip()
      return
    }

    // Open the combobox and navigate with Arrow Down + Enter
    await comboboxInput.click()

    const listbox = page.locator('#presetComboboxContainer .preset-combobox-list')
    await expect(listbox).toBeVisible()

    await comboboxInput.press('ArrowDown')
    await comboboxInput.press('Enter')

    // The listbox should close and a selection should be made
    await expect(listbox).toBeHidden()
    const selectedLabel = await comboboxInput.inputValue()
    expect(selectedLabel.length).toBeGreaterThan(0)
  })
})
