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

const loadSimpleBoxExample = async (page, { expandGroups = false } = {}) => {
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

  // F5 (owner, 2026-05-15): parameter groups load collapsed, so controls are
  // attached long before they are visible. Tests that reach for a slider ask
  // for this; the rest are left with the app's own default state (UF-9
  // established the idiom, UF-25 applies it here).
  if (expandGroups) {
    const expandAll = page.locator('#expandAllGroupsBtn')
    if (await expandAll.isVisible().catch(() => false)) {
      await expandAll.click()
      await expect(page.locator('.param-control').first()).toBeVisible({
        timeout: 10000,
      })
    }
  }
}

/**
 * UF-25: seven tests in this file looked for the Save Preset control with
 * `button:has-text("Save Preset"), button[aria-label*="Save preset"]`, and that
 * matches nothing. #savePresetBtn is icon-only, so it carries no such text, and
 * its aria-label reads "Save Preset - overwrites current preset" - CSS
 * attribute matching is case-sensitive, so the lowercase "preset" in the old
 * selector missed it too. It is also disabled until a preset is selected, since
 * it OVERWRITES. Each of those tests then hit `if (!visible) test.skip()` and
 * stopped running, reporting skipped rather than red.
 *
 * Creating a new named preset is the "+" button, which is what the two tests
 * that kept working already used. This helper is that flow, asserted rather
 * than guarded.
 */
const createPreset = async (page, name) => {
  const addPresetBtn = page.locator('#addPresetBtn')
  await expect(addPresetBtn).toBeVisible()
  await addPresetBtn.click()

  const modal = page.locator('.preset-modal')
  await modal.waitFor({ state: 'visible', timeout: 5000 })
  const nameInput = modal.locator('#presetName').first()
  await expect(nameInput).toBeVisible()
  await nameInput.fill(name)
  await modal.locator('button[type="submit"]').first().click()
  await modal.waitFor({ state: 'detached', timeout: 5000 })
}

test.describe('Preset Workflow', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage before each test, but preserve first-visit-seen to avoid blocking modal.
    // UF-25: the clear is ONE-SHOT. addInitScript runs before EVERY document
    // load, including page.reload(), so an unguarded clear wiped the saved
    // presets that the reload-persistence test then went looking for - the
    // test destroyed its own subject and the failure read like a lost-data
    // bug in the app. sessionStorage survives a reload in the same tab, so it
    // is what remembers that this context has already been cleared.
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('pw-storage-cleared')) {
        localStorage.clear()
        sessionStorage.setItem('pw-storage-cleared', '1')
      }
      localStorage.setItem('openscad-forge-first-visit-seen', 'true')
      localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
    })
    await page.goto('/')
  })

  test('should save a preset with custom name', async ({ page }) => {
    // Skip in CI - requires WASM to process example files
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await loadSimpleBoxExample(page, { expandGroups: true })

    // Verify parameters are loaded
    await expect(page.locator('.param-control').first()).toBeAttached()

    // Change a parameter value
    const firstSlider = page.locator('.param-control input[type="range"]').first()
    await expect(firstSlider).toBeVisible()
    await firstSlider.fill('75')
    await page.waitForTimeout(500)

    await createPreset(page, 'My Test Preset')

    const options = await getPresetOptions(page)
    const hasSavedPreset = options.some(opt => opt.includes('My Test Preset'))
    expect(hasSavedPreset).toBe(true)

    // OpenSCAD Customizer behavior: newly saved preset should be auto-selected
    const selectedLabel = await getSelectedPresetLabel(page)
    expect(selectedLabel).toContain('My Test Preset')
  })

  test('should auto-select newly saved preset (OpenSCAD Customizer behavior)', async ({ page }) => {
    // Skip in CI - requires WASM to process example files
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await loadSimpleBoxExample(page)

    await createPreset(page, 'Auto-Select Test Preset')
    await page.waitForTimeout(500)

    // Verify the newly saved preset is automatically selected in the dropdown.
    // This matches OpenSCAD Customizer behavior where "+" creates and selects it.
    const selectedLabel = await getSelectedPresetLabel(page)
    expect(selectedLabel).toContain('Auto-Select Test Preset')

    // The Save Preset button (overwrite) should now be usable
    const savePresetBtn = page.locator('#savePresetBtn')
    await expect(savePresetBtn).toBeVisible()
    await expect(savePresetBtn).toBeEnabled()
  })

  test('should keep preset selected after loading (selection persistence)', async ({ page }) => {
    // Skip in CI - requires WASM to process example files
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await loadSimpleBoxExample(page)

    // First, save a preset
    await createPreset(page, 'Persistence Test Preset')
    await page.waitForTimeout(500)

    // Now select the preset from the dropdown
    const selected = await selectPreset(page, 'Persistence Test Preset')
    expect(selected, 'saved preset must be selectable').toBe(true)
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
    
    await loadSimpleBoxExample(page, { expandGroups: true })

    // Get initial parameter value
    const firstSlider = page.locator('.param-control input[type="range"]').first()
    await expect(firstSlider).toBeVisible()

    const initialValue = await firstSlider.inputValue()
    const newValue = '80'

    // Change parameter, then capture it in a preset
    await firstSlider.fill(newValue)
    await page.waitForTimeout(500)
    await createPreset(page, 'Load Test Preset')

    // Change parameter to a different value
    await firstSlider.fill(initialValue)
    await page.waitForTimeout(500)
    expect(await firstSlider.inputValue()).toBe(initialValue)

    // Load the saved preset: the value must come back
    const selected = await selectPreset(page, 'Load Test Preset')
    expect(selected, 'saved preset must be selectable').toBe(true)
    await page.waitForTimeout(500)
    expect(await firstSlider.inputValue()).toBe(newValue)
  })

  test('should export preset as JSON', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await loadSimpleBoxExample(page)

    // Save a preset first
    await createPreset(page, 'Export Test')

    const manageButton = page.locator('#managePresetsBtn')
    await expect(manageButton).toBeVisible()

    const lingeringModal = page.locator('.preset-modal')
    if (await lingeringModal.isVisible({ timeout: 1000 }).catch(() => false)) {
      const closeButton = lingeringModal.locator('[data-action="close"]').first()
      if (await closeButton.isVisible().catch(() => false)) {
        await closeButton.click()
      }
      await lingeringModal.waitFor({ state: 'detached', timeout: 5000 })
    }

    await manageButton.click()

    // The per-preset rows live inside a collapsed "Individual presets"
    // disclosure, so the export button is present but not visible until it is
    // opened (UF-25; same shape as the collapsed parameter groups).
    const listDetails = page.locator('details.preset-list-details')
    await expect(listDetails).toBeVisible()
    await listDetails.locator('summary').click()
    await expect(listDetails).toHaveJSProperty('open', true)

    const presetItem = page.locator('.preset-item', { hasText: 'Export Test' })
    const exportButton = presetItem.locator('button[data-action="export"]')
    await expect(exportButton).toBeVisible()

    // Setup download listener
    const downloadPromise = page.waitForEvent('download', { timeout: 10000 })

    await exportButton.click()

    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/\.json$/i)
  })

  test('should import preset from JSON', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await loadSimpleBoxExample(page)

    // Import lives inside the Manage Presets modal, as data-action="import".
    // The old `button[aria-label*="Import preset"]` matched nothing on the
    // page, so this test skipped itself rather than checking anything (UF-25).
    const manageBtn = page.locator('#managePresetsBtn')
    await expect(manageBtn).toBeVisible()
    await manageBtn.click()

    const importAction = page.locator('button[data-action="import"]')
    await expect(importAction).toBeVisible({ timeout: 5000 })
    await expect(importAction).toBeEnabled()
  })

  test('Replace-mode import runs without TypeError and imports designs (F-5 regression)', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await loadSimpleBoxExample(page)

    const pageErrors = []
    page.on('pageerror', (err) => pageErrors.push(err.message))
    // Replace mode uses a native confirm() when user presets exist.
    page.on('dialog', (dialog) => dialog.accept())

    const manageBtn = page.locator('#managePresetsBtn')
    await expect(manageBtn).toBeVisible({ timeout: 3000 })
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
    
    await loadSimpleBoxExample(page)

    await createPreset(page, 'Delete Test')

    // Select the preset
    const selected = await selectPreset(page, 'Delete Test')
    expect(selected, 'saved preset must be selectable').toBe(true)
    await page.waitForTimeout(300)

    // #deletePresetBtn is icon-only and enables once a deletable preset is
    // selected. The old text/aria selectors matched nothing (UF-25).
    const deleteButton = page.locator('#deletePresetBtn')
    await expect(deleteButton).toBeVisible()
    await expect(deleteButton).toBeEnabled()

    // Deletion asks for confirmation through the app's own dialog
    // (dialogs.js builds .confirm-modal with data-action="confirm"), not a
    // native confirm().
    await deleteButton.click()
    const confirmModal = page.locator('.confirm-modal')
    await expect(confirmModal).toBeVisible({ timeout: 5000 })
    await confirmModal.locator('button[data-action="confirm"]').click()
    await confirmModal.waitFor({ state: 'detached', timeout: 5000 })

    await page.waitForTimeout(500)

    // Verify preset is removed
    const remainingOptions = await getPresetOptions(page)
    const stillExists = remainingOptions.some(opt => opt.includes('Delete Test'))
    expect(stillExists).toBe(false)
  })

  test('should show preset count in UI', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await loadSimpleBoxExample(page)

    // Count initial options
    const initialOptions = await getPresetOptions(page)
    const initialCount = initialOptions.length
    expect(initialCount).toBeGreaterThanOrEqual(1)

    // Save a preset. This block used to sit inside `if (saveButton.isVisible())`
    // against a selector that matched nothing, so the test passed having
    // asserted only the initial count (UF-25).
    await createPreset(page, 'Count Test')

    const newOptions = await getPresetOptions(page)
    expect(newOptions.length).toBeGreaterThan(initialCount)
  })

  test('should handle preset names with special characters', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await loadSimpleBoxExample(page)

    // UF-25: this used to accept any outcome ("either the preset exists or
    // validation prevented it, both are acceptable") and assert only that at
    // least one option existed, which is true before the test does anything.
    // A name with quotes and brackets has to round-trip intact - that is the
    // property worth guarding, and it is where an escaping bug would show.
    const trickyName = 'Test "Preset" (v1.0) & <b>'
    await createPreset(page, trickyName)

    const options = await getPresetOptions(page)
    expect(options.some((opt) => opt.includes(trickyName))).toBe(true)

    const selectedLabel = await getSelectedPresetLabel(page)
    expect(selectedLabel).toContain(trickyName)
  })

  test('should persist presets across page reloads', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    // Capture console messages
    const consoleMessages = []
    page.on('console', msg => {
      consoleMessages.push(`[${msg.type()}] ${msg.text()}`)
    })

    await loadSimpleBoxExample(page)

    // Check if presetManager exists before saving
    const presetManagerExists = await page.evaluate(() => {
      return {
        exists: typeof window.presetManager !== 'undefined',
        storageAvailable: window.presetManager ? window.presetManager.isStorageAvailable() : false
      }
    })
    console.log('PresetManager status:', presetManagerExists)

    await createPreset(page, 'Persistence Test')
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

    await loadSimpleBoxExample(page, { expandGroups: true })

    // Wait for parameters to load
    const firstParam = page.locator('.param-control input[type="range"]').first()
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
      localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
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
    expect(selected).toBe(true)

    await page.waitForTimeout(1000)

    const label = await getSelectedPresetLabel(page)
    expect(label).toContain('Selection Test')
  })

  /*
   * KNOWN RED, and deliberately left red: defect D-47, reported to the owner
   * on 2026-08-15 and not fixed here.
   *
   * User-saved presets are filed under state.uploadedFile.name, and for a ZIP
   * that is the ARCHIVE's filename - file-handler.js passes `file.name` as
   * originalFileName on the ZIP path. This test opens the same project from
   * two differently named archives, so the second upload looks up a different
   * key and cannot see the preset saved under the first. The presets are not
   * lost; they are filed elsewhere.
   *
   * The sibling case above proves project-NATIVE presets (from the sidecar
   * JSON) DO follow the project across a rename, so the two kinds of preset
   * behave differently. Whether a user's own presets should follow a project
   * across a rename is a product decision about how people organise their
   * work, and it needs a storage migration, so it is the owner's call and its
   * own release. This test states the behaviour it expects; when D-47 is
   * settled it either goes green or is rewritten to the decision.
   */
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
    await expect(addBtn).toBeVisible({ timeout: 5000 })

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
      localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
    })
    await page.goto(`/?${COMBOBOX_FLAG_PARAM}`)
  })

  test('AF-10: the resting selection is design default values, like the desktop', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await loadSimpleBoxExample(page)

    // R-II P5b: before any choice, the desktop's combobox shows the active
    // "design default values" - not a search placeholder. Display parity
    // only: nothing is applied, and Save stays disabled (defaults are
    // immutable, desktop-correct).
    await expect(page.locator('#presetComboboxInput')).toHaveValue(
      'design default values'
    )
    await expect(page.locator('#savePresetBtn')).toBeDisabled()
  })

  test('AF-10: the save control is a text button, like the desktop', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await loadSimpleBoxExample(page)

    // R-II P10: the desktop has a text "save preset" button where we shipped
    // a floppy icon. The accessible name never changed; the VISIBLE label is
    // the parity subject.
    await expect(page.locator('#savePresetBtn')).toHaveText('Save Preset')
  })

  test('combobox is shown and native select is hidden when flag is enabled', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await loadSimpleBoxExample(page)

    const comboboxInput = page.locator('#presetComboboxContainer .preset-combobox-input')
    const nativeSelect = page.locator('select#presetSelect')

    // The combobox container should be visible; the legacy selector wrapper hidden
    await expect(comboboxInput).toBeVisible({ timeout: 5000 })
    await expect(nativeSelect).toBeHidden()
  })

  test('combobox shows "design default values" as the first option', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await loadSimpleBoxExample(page)

    const comboboxInput = page.locator('#presetComboboxContainer .preset-combobox-input')
    await expect(comboboxInput).toBeVisible({ timeout: 5000 })

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

    await loadSimpleBoxExample(page)

    // Save two presets so there's something to filter
    const addBtn = page.locator('#addPresetBtn, button[aria-label*="Add preset"]')
    await expect(addBtn).toBeVisible({ timeout: 5000 })

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
    await expect(comboboxInput).toBeVisible()

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

    await loadSimpleBoxExample(page)

    const comboboxInput = page.locator('#presetComboboxContainer .preset-combobox-input')
    await expect(comboboxInput).toBeVisible({ timeout: 5000 })

    await comboboxInput.fill('xyzzy_no_match_at_all')
    await page.waitForTimeout(200)

    const emptyMsg = page.locator('#presetComboboxContainer .preset-combobox-empty')
    await expect(emptyMsg).toBeVisible()
  })

  test('combobox closes on Escape and sets aria-expanded="false"', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await loadSimpleBoxExample(page)

    const comboboxInput = page.locator('#presetComboboxContainer .preset-combobox-input')
    await expect(comboboxInput).toBeVisible({ timeout: 5000 })

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

    await loadSimpleBoxExample(page)

    // Save a preset to have something to select
    const addBtn = page.locator('#addPresetBtn, button[aria-label*="Add preset"]')
    await expect(addBtn).toBeVisible({ timeout: 5000 })

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
    await expect(comboboxInput).toBeVisible()

    // Open and click the saved preset
    await comboboxInput.click()
    const listbox = page.locator('#presetComboboxContainer .preset-combobox-list')
    await expect(listbox).toBeVisible()

    const targetOption = listbox.locator(
      '.preset-combobox-option:not(.preset-combobox-empty)',
      { hasText: 'Click Select Test' }
    )
    await expect(targetOption).toBeVisible()

    await targetOption.click()

    // Combobox should close and show the selected label
    await expect(comboboxInput).toHaveValue('Click Select Test')
    await expect(listbox).toBeHidden()
  })

  test('combobox selection syncs to the hidden native select', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await loadSimpleBoxExample(page)

    // Save a preset so there's something to select
    const addBtn = page.locator('#addPresetBtn, button[aria-label*="Add preset"]')
    await expect(addBtn).toBeVisible({ timeout: 5000 })

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
    await expect(comboboxInput).toBeVisible()

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

    await loadSimpleBoxExample(page)

    // The shared helper should auto-detect the combobox and select "design default values"
    const options = await getPresetOptions(page)
    const designDefault = options.find(o => o.toLowerCase().includes('design default'))
    expect(designDefault).toBeTruthy()

    const result = await selectPreset(page, designDefault)
    expect(result).toBe(true)

    const label = await getSelectedPresetLabel(page)
    expect(label?.toLowerCase()).toContain('design default')
  })

  test('combobox selects a preset via keyboard Enter', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await loadSimpleBoxExample(page)

    const comboboxInput = page.locator('#presetComboboxContainer .preset-combobox-input')
    await expect(comboboxInput).toBeVisible({ timeout: 5000 })

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
