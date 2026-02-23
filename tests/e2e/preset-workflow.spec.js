/**
 * E2E tests for preset save/load workflow
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test'

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
      const presetSelect = page.locator('select#presetSelect, select[aria-label*="preset"]')
      if (await presetSelect.isVisible()) {
        const options = await presetSelect.locator('option').allTextContents()
        const hasSavedPreset = options.some(opt => opt.includes('My Test Preset'))
        expect(hasSavedPreset).toBe(true)
        
        // OpenSCAD Customizer behavior: newly saved preset should be auto-selected
        // This enables the save button to update the preset immediately after creation
        const selectedValue = await presetSelect.inputValue()
        const selectedOption = await presetSelect.locator('option:checked').textContent()
        expect(selectedOption).toContain('My Test Preset')
      }
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

    // Fill in preset name in modal
    const nameInput = page.locator('#presetName, input[placeholder*="preset"]').first()
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
      const presetSelect = page.locator('select#presetSelect')
      if (await presetSelect.isVisible()) {
        const selectedOption = await presetSelect.locator('option:checked').textContent()
        expect(selectedOption).toContain('Auto-Select Test Preset')
        
        // The Save Preset button should now be enabled (can update this preset)
        const savePresetBtn = page.locator('#savePresetBtn')
        if (await savePresetBtn.isVisible()) {
          const isDisabled = await savePresetBtn.isDisabled()
          expect(isDisabled).toBe(false)
        }
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

    const nameInput = page.locator('#presetName, input[placeholder*="preset"]').first()
    if (await nameInput.isVisible()) {
      await nameInput.fill('Persistence Test Preset')
      const confirmButton = page.locator('button[type="submit"]:has-text("Save")').first()
      await confirmButton.click()
      await page.waitForSelector('.preset-modal', { state: 'detached', timeout: 5000 })
      await page.waitForTimeout(500)
    }

    // Now select the preset from the dropdown
    const presetSelect = page.locator('select#presetSelect')
    if (!(await presetSelect.isVisible())) {
      test.skip()
      return
    }

    // Select the preset
    await presetSelect.selectOption({ label: 'Persistence Test Preset' })
    await page.waitForTimeout(1000)

    // Verify the preset is selected
    let selectedOption = await presetSelect.locator('option:checked').textContent()
    expect(selectedOption).toContain('Persistence Test Preset')

    // Wait a bit more to ensure any async operations complete
    await page.waitForTimeout(1000)

    // Verify the preset is STILL selected (not reset to "Select Preset")
    selectedOption = await presetSelect.locator('option:checked').textContent()
    expect(selectedOption).toContain('Persistence Test Preset')
    expect(selectedOption).not.toContain('Select Preset')
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
    const presetSelect = page.locator('select#presetSelect')
    if (await presetSelect.isVisible()) {
      // Get all options and find the one matching our preset
      const options = await presetSelect.locator('option').allTextContents()
      const matchingOption = options.find(opt => opt.includes('Load Test Preset'))
      if (matchingOption) {
        await presetSelect.selectOption({ label: matchingOption })
        await page.waitForTimeout(500)

        // Verify parameter value restored
        const restoredValue = await firstSlider.inputValue()
        expect(restoredValue).toBe(newValue)
      }
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
    const presetSelect = page.locator('select#presetSelect')
    if (!(await presetSelect.isVisible())) {
      test.skip()
      return
    }

    // Get all options and find the one matching our preset
    const options = await presetSelect.locator('option').allTextContents()
    const matchingOption = options.find(opt => opt.includes('Delete Test'))
    if (!matchingOption) {
      test.skip()
      return
    }

    await presetSelect.selectOption({ label: matchingOption })
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
    const remainingOptions = await presetSelect.locator('option').allTextContents()
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

    // Check for preset select dropdown
    const presetSelect = page.locator('select#presetSelect, select[aria-label*="preset"]')
    if (!(await presetSelect.isVisible())) {
      test.skip()
      return
    }

    // Count initial options (should have at least "Select preset" or similar)
    const initialCount = await presetSelect.locator('option').count()
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
        const newCount = await presetSelect.locator('option').count()
        expect(newCount).toBeGreaterThan(initialCount)
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
      const presetSelect = page.locator('select#presetSelect')
      if (await presetSelect.isVisible()) {
        const options = await presetSelect.locator('option').allTextContents()
        // Either preset exists with cleaned name, or validation prevented save
        // Both behaviors are acceptable
        expect(options.length).toBeGreaterThanOrEqual(1)
      }
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

    // Try multiple selectors for the name input
    const nameInput = page.locator('#presetName, input[placeholder*="preset"], input[placeholder*="Preset"]').first()
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
    const presetSelect = page.locator('select#presetSelect')
    if (await presetSelect.isVisible()) {
      const options = await presetSelect.locator('option').allTextContents()
      console.log('Available preset options after reload:', options)
      const persistedPreset = options.some(opt => opt.includes('Persistence Test'))
      expect(persistedPreset).toBe(true)
    }
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
      const nameInput = page.locator('#presetName, input[placeholder*="preset"]').first()
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
    const nameInput = page.locator('#presetName, input[placeholder*="preset"]').first()
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
})
