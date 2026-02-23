/**
 * Stakeholder Acceptance Tests for newly implemented features
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test'

const loadSimpleBoxExample = async (page) => {
  const exampleButton = page.locator(
    'button[data-example="simple-box"][data-role="beginners"], #loadSimpleBoxBtn, button:has-text("Simple Box")'
  ).first()

  await exampleButton.waitFor({ state: 'visible', timeout: 10000 })
  await exampleButton.click()

  const mainInterface = page.locator('#mainInterface')
  try {
    await mainInterface.waitFor({ state: 'visible', timeout: 20000 })
  } catch (error) {
    await exampleButton.click()
    await mainInterface.waitFor({ state: 'visible', timeout: 20000 })
  }

  await page.waitForSelector('.param-control', { state: 'attached', timeout: 20000 })
}

test.describe('Stakeholder Acceptance Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear()
      localStorage.setItem('openscad-forge-first-visit-seen', 'true')
    })
    await page.goto('http://localhost:5173/')
  })

  test('TEST 1: Initial Page Load', async ({ page }) => {
    console.log('=== TEST 1: Initial Page Load ===')
    
    // Wait for page to load
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)
    
    // Take a screenshot
    await page.screenshot({ path: 'test-results/test1-initial-load.png', fullPage: true })
    
    // Look for file upload area
    const uploadArea = page.locator('#uploadArea, [data-testid="upload-area"], input[type="file"]')
    const uploadAreaExists = await uploadArea.count() > 0
    console.log('File upload area found:', uploadAreaExists)
    
    // Look for preset controls
    const presetControls = page.locator('#presetControls, [data-testid="preset-controls"]')
    const presetControlsExists = await presetControls.count() > 0
    console.log('Preset controls found:', presetControlsExists)
    
    // Look for viewer area
    const viewerArea = page.locator('#viewerContainer, #viewer, canvas')
    const viewerAreaExists = await viewerArea.count() > 0
    console.log('Viewer area found:', viewerAreaExists)
    
    expect(uploadAreaExists || presetControlsExists || viewerAreaExists).toBe(true)
  })

  test('TEST 2: Button Labels (Item 11)', async ({ page }) => {
    console.log('=== TEST 2: Button Labels ===')
    
    await loadSimpleBoxExample(page)
    await page.waitForTimeout(1000)
    
    // Check Save button accessible label (aria-label is stable; title changes with preset selection state)
    const saveBtn = page.locator('#savePresetBtn, button[aria-label*="Save preset"]')
    if (await saveBtn.isVisible()) {
      const ariaLabel = await saveBtn.getAttribute('aria-label')
      console.log('Save button aria-label:', ariaLabel)
      expect(ariaLabel).toContain('Save Preset')
      expect(ariaLabel).toContain('overwrites current preset')
    }
    
    // Check Add button title
    const addBtn = page.locator('#addPresetBtn, button[aria-label*="Add preset"]')
    if (await addBtn.isVisible()) {
      const title = await addBtn.getAttribute('title')
      console.log('Add button title:', title)
      expect(title).toContain('Add Preset')
    }
    
    // Check Manage button text
    const manageBtn = page.locator('#managePresetsBtn')
    if (await manageBtn.isVisible()) {
      const text = await manageBtn.textContent()
      console.log('Manage button text:', text)
      expect(text).toContain('Import / Export')
      expect(text).not.toContain('Manage')
    }
    
    // Take screenshot of preset controls
    const presetControls = page.locator('#presetControls')
    if (await presetControls.isVisible()) {
      await presetControls.screenshot({ path: 'test-results/test2-button-labels.png' })
    }
  })

  test('TEST 3: Load Example Model', async ({ page }) => {
    console.log('=== TEST 3: Load Example Model ===')
    
    await loadSimpleBoxExample(page)
    
    // Wait for model to render
    await page.waitForTimeout(2000)
    
    // Check if parameters are loaded
    const paramControls = page.locator('.param-control')
    const paramCount = await paramControls.count()
    console.log('Parameter controls loaded:', paramCount)
    
    expect(paramCount).toBeGreaterThan(0)
    
    await page.screenshot({ path: 'test-results/test3-model-loaded.png', fullPage: true })
  })

  test('TEST 4: Design Default Values (Item 13)', async ({ page }) => {
    console.log('=== TEST 4: Design Default Values ===')
    
    await loadSimpleBoxExample(page)
    await page.waitForTimeout(1000)
    
    // Check preset dropdown
    const presetSelect = page.locator('#presetSelect')
    if (await presetSelect.isVisible()) {
      const options = await presetSelect.locator('option').allTextContents()
      console.log('Preset dropdown options:', options)
      
      // Check if "design default values" is the first option after placeholder
      const firstRealOption = options.find(opt => !opt.includes('Select') && opt.trim() !== '')
      console.log('First real option:', firstRealOption)
      
      expect(firstRealOption?.toLowerCase()).toContain('design default')
      
      // Take screenshot showing dropdown
      await presetSelect.screenshot({ path: 'test-results/test4-design-defaults.png' })
    }
  })

  test('TEST 5: Import / Export Modal (Item 12)', async ({ page }) => {
    console.log('=== TEST 5: Import / Export Modal ===')
    
    await loadSimpleBoxExample(page)
    await page.waitForTimeout(1000)
    
    // Click Import / Export button
    const manageBtn = page.locator('#managePresetsBtn')
    if (await manageBtn.isVisible()) {
      await manageBtn.click()
      await page.waitForTimeout(500)
      
      // Check modal title
      const modalTitle = page.locator('.preset-modal h2, .modal-title')
      if (await modalTitle.isVisible()) {
        const titleText = await modalTitle.textContent()
        console.log('Modal title:', titleText)
        expect(titleText).toContain('Import / Export')
      }
      
      // Check for Import Presets button
      const importBtn = page.locator('button:has-text("Import Presets"), button[aria-label*="Import"]')
      const importBtnExists = await importBtn.count() > 0
      console.log('Import Presets button found:', importBtnExists)
      
      // Check for Export All Presets button
      const exportBtn = page.locator('button:has-text("Export All"), button:has-text("Export All Presets")')
      const exportBtnExists = await exportBtn.count() > 0
      console.log('Export All Presets button found:', exportBtnExists)
      
      // Take screenshot of modal
      await page.screenshot({ path: 'test-results/test5-import-export-modal.png', fullPage: true })
      
      // Close modal
      const closeBtn = page.locator('[data-action="close"], button:has-text("Close")').first()
      if (await closeBtn.isVisible()) {
        await closeBtn.click()
      }
    }
  })

  test('TEST 6: Console Panel (Item 4)', async ({ page }) => {
    console.log('=== TEST 6: Console Panel ===')
    
    await loadSimpleBoxExample(page)
    await page.waitForTimeout(1000)
    
    // Check for console panel
    const consolePanel = page.locator('#consoleDetails')
    const consolePanelExists = await consolePanel.count() > 0
    console.log('Console panel (#consoleDetails) found:', consolePanelExists)
    
    // Check for console badge
    const consoleBadge = page.locator('#console-badge')
    const consoleBadgeExists = await consoleBadge.count() > 0
    console.log('Console badge (#console-badge) found:', consoleBadgeExists)
    
    // Take screenshot
    await page.screenshot({ path: 'test-results/test6-console-panel.png', fullPage: true })
    
    expect(consolePanelExists || consoleBadgeExists).toBe(true)
  })

  test('TEST 7: Companion Files Section', async ({ page }) => {
    console.log('=== TEST 7: Companion Files Section ===')
    
    await loadSimpleBoxExample(page)
    await page.waitForTimeout(1000)
    
    // Look for Companion Files section
    const companionFiles = page.locator('#projectFilesControls')
    const companionFilesExists = await companionFiles.count() > 0
    console.log('Companion Files section (#projectFilesControls) found:', companionFilesExists)
    
    if (companionFilesExists) {
      const isVisible = await companionFiles.isVisible()
      console.log('Companion Files section visible:', isVisible)
      console.log('(Note: May be hidden if no multi-file project is loaded)')
    }
    
    // Take screenshot
    await page.screenshot({ path: 'test-results/test7-companion-files.png', fullPage: true })
  })
})
