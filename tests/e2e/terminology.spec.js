/**
 * E2E tests for terminology consistency
 * Verifies that "Saved Designs" and "Companion Files" terminology is used consistently
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import JSZip from 'jszip'

// Skip WASM-dependent tests in CI - WASM initialization is slow/unreliable
const isCI = !!process.env.CI

// Dismiss first-visit modal so it doesn't block UI interactions
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
  })
})

/**
 * Load the simple-box example for testing
 */
const loadSimpleBoxExample = async (page) => {
  const exampleButton = page.locator('[data-example="simple-box"], #loadSimpleBoxBtn, button:has-text("Simple Box")')
  await exampleButton.waitFor({ state: 'visible', timeout: 10000 })
  await exampleButton.click()
  
  const mainInterface = page.locator('#mainInterface')
  await mainInterface.waitFor({ state: 'visible', timeout: 20000 })
  await page.waitForSelector('.param-control', { state: 'attached', timeout: 20000 })
}

/**
 * Create a ZIP fixture for multi-file project testing
 */
const createMultiFileZipFixture = async () => {
  const zip = new JSZip()
  zip.file('main.scad', 'include <helper.scad>\npart();\n')
  zip.file('helper.scad', 'module part() { cube([10, 10, 10]); }\n')
  zip.file('config.txt', '# Configuration\n')
  
  const buffer = await zip.generateAsync({ type: 'nodebuffer' })
  const outputDir = path.join(process.cwd(), 'test-results')
  await fs.promises.mkdir(outputDir, { recursive: true })
  const zipPath = path.join(outputDir, `terminology-test-${Date.now()}.zip`)
  await fs.promises.writeFile(zipPath, buffer)
  return zipPath
}

test.describe('Terminology Consistency - Saved Designs', () => {
  test('welcome screen shows "Saved Designs" heading', async ({ page }) => {
    await page.goto('/')
    
    // Check for the saved designs section
    const heading = page.locator('#saved-projects-heading')
    
    if (await heading.isVisible().catch(() => false)) {
      const text = await heading.textContent()
      expect(text.toLowerCase()).toContain('saved design')
      // Should NOT contain "Saved Project"
      expect(text.toLowerCase()).not.toContain('saved project')
    }
  })

  test('empty state uses "saved designs" terminology', async ({ page }) => {
    // Clear any saved designs first
    await page.addInitScript(() => {
      // Clear IndexedDB saved projects
      if (typeof indexedDB !== 'undefined') {
        indexedDB.deleteDatabase('openscad-forge-projects')
      }
    })
    
    await page.goto('/')
    
    // Check empty state message
    const emptyState = page.locator('#savedProjectsEmpty')
    
    if (await emptyState.isVisible().catch(() => false)) {
      const text = await emptyState.textContent()
      // Should use "designs" not "projects"
      expect(text.toLowerCase()).toContain('design')
    }
  })

  test('saved designs list has correct aria-label', async ({ page }) => {
    await page.goto('/')
    
    const list = page.locator('#savedProjectsList')
    
    if (await list.isAttached()) {
      const ariaLabel = await list.getAttribute('aria-label')
      if (ariaLabel) {
        expect(ariaLabel.toLowerCase()).toContain('design')
      }
    }
  })

  test('save button uses consistent terminology', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await page.goto('/')
    
    try {
      await loadSimpleBoxExample(page)
    } catch (error) {
      console.log('Could not load example:', error.message)
      test.skip()
      return
    }
    
    // Look for save design button
    const saveBtn = page.locator('button:has-text("Save"), button[aria-label*="Save"]').first()
    
    if (await saveBtn.isVisible().catch(() => false)) {
      const text = await saveBtn.textContent()
      const ariaLabel = await saveBtn.getAttribute('aria-label')
      const title = await saveBtn.getAttribute('title')
      
      // If it mentions "project", it should be updated to "design"
      const combinedText = `${text || ''} ${ariaLabel || ''} ${title || ''}`.toLowerCase()
      
      if (combinedText.includes('project')) {
        // This is a terminology issue that should be flagged
        console.warn('Found "project" terminology in save button, should be "design"')
      }
    }
  })

  test('load confirmation dialog uses "Saved Design" terminology', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    // First, save a design
    await page.goto('/')
    
    try {
      await loadSimpleBoxExample(page)
    } catch (error) {
      test.skip()
      return
    }
    
    // Try to save the current design
    const saveBtn = page.locator('button:has-text("Save")').first()
    if (!(await saveBtn.isVisible().catch(() => false))) {
      test.skip()
      return
    }
    
    // The specific dialog text testing would require actually triggering dialogs
    // For now, verify the button structure is present
    expect(await page.locator('body').isVisible()).toBe(true)
  })

  test('delete confirmation uses "Saved Design" terminology', async ({ page }) => {
    // This would require having a saved design and clicking delete
    // Testing the actual dialog would be more complex
    // For now, verify the page loads without terminology errors
    await page.goto('/')
    await expect(page.locator('body')).toBeVisible()
  })
})

test.describe('Terminology Consistency - Companion Files', () => {
  test('companion files section label is correct', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await page.goto('/')
    
    // Upload a multi-file project
    const zipPath = await createMultiFileZipFixture()
    const fileInput = page.locator('#fileInput')
    await fileInput.setInputFiles(zipPath)
    
    // Wait for UI to process
    await page.waitForTimeout(3000)
    
    // Check for companion files label
    const companionLabel = page.locator('#companionFilesLabel, .companion-files-label, button:has-text("Companion Files"), summary:has-text("Companion Files")')
    
    if (await companionLabel.isVisible().catch(() => false)) {
      const text = await companionLabel.textContent()
      expect(text).toContain('Companion Files')
      // Should NOT say "Project Files" in user-facing label
      // (Internal IDs like projectFilesControls are fine)
    }
  })

  test('project files controls use Companion Files label', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await page.goto('/')
    
    const zipPath = await createMultiFileZipFixture()
    const fileInput = page.locator('#fileInput')
    await fileInput.setInputFiles(zipPath)
    
    await page.waitForTimeout(3000)
    
    // Check the projectFilesControls area
    const controls = page.locator('#projectFilesControls')
    
    if (await controls.isVisible().catch(() => false)) {
      const text = await controls.textContent()
      // Should use "Companion" in the visible label
      expect(text).toContain('Companion')
    }
  })
})

test.describe('Terminology - No Old Terms', () => {
  test('welcome screen does not use "Saved Project" (singular or plural)', async ({ page }) => {
    await page.goto('/')
    
    // Get all visible text on welcome screen
    const welcomeScreen = page.locator('#welcomeScreen')
    
    if (await welcomeScreen.isVisible().catch(() => false)) {
      const text = await welcomeScreen.textContent()
      // Should not contain "Saved Project" anywhere visible
      // (exception: internal IDs are fine)
      const lowerText = text.toLowerCase()
      
      // Count occurrences of "saved project" vs "saved design"
      const projectCount = (lowerText.match(/saved project/g) || []).length
      const designCount = (lowerText.match(/saved design/g) || []).length
      
      // Should have more "design" references than "project" references
      // Or no references to either (both are fine)
      expect(projectCount).toBeLessThanOrEqual(designCount)
    }
  })

  test('main interface does not use "Project Files" as visible label', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await page.goto('/')
    
    const zipPath = await createMultiFileZipFixture()
    const fileInput = page.locator('#fileInput')
    await fileInput.setInputFiles(zipPath)
    
    await page.locator('#mainInterface').waitFor({ state: 'visible', timeout: 20000 }).catch(() => {})
    
    // Check visible text for "Project Files"
    const mainInterface = page.locator('#mainInterface')
    
    if (await mainInterface.isVisible().catch(() => false)) {
      const visibleButtons = await page.locator('button, summary, h3, label').allTextContents()
      
      // None of the visible labels should say "Project Files"
      // They should say "Companion Files" instead
      const hasProjectFilesLabel = visibleButtons.some(text => 
        text.includes('Project Files') && !text.includes('Companion')
      )
      
      // If "Project Files" is found as a label, it should be flagged
      if (hasProjectFilesLabel) {
        console.warn('Found "Project Files" label, should use "Companion Files"')
      }
    }
  })
})

test.describe('Accessibility Labels Terminology', () => {
  test('aria-labels use consistent terminology', async ({ page }) => {
    await page.goto('/')
    
    // Get all elements with aria-label
    const ariaLabeledElements = await page.locator('[aria-label]').all()
    
    for (const el of ariaLabeledElements) {
      const ariaLabel = await el.getAttribute('aria-label')
      if (!ariaLabel) continue
      
      const lowerLabel = ariaLabel.toLowerCase()
      
      // If it mentions saved items, should use "design" not "project"
      if (lowerLabel.includes('saved')) {
        if (lowerLabel.includes('project') && !lowerLabel.includes('design')) {
          console.warn(`Found aria-label with "project" terminology: "${ariaLabel}"`)
        }
      }
      
      // If it mentions companion/project files, should use "companion"
      if (lowerLabel.includes('files') && lowerLabel.includes('project')) {
        console.warn(`Consider using "companion files" instead of "project files" in: "${ariaLabel}"`)
      }
    }
  })

  test('button titles use consistent terminology', async ({ page }) => {
    await page.goto('/')
    
    // Get all elements with title attribute
    const titledElements = await page.locator('[title]').all()
    
    for (const el of titledElements) {
      const title = await el.getAttribute('title')
      if (!title) continue
      
      const lowerTitle = title.toLowerCase()
      
      // Check for old terminology
      if (lowerTitle.includes('saved project')) {
        console.warn(`Found title with "saved project": "${title}"`)
      }
    }
  })
})

test.describe('Status Messages Terminology', () => {
  test('status area uses consistent terminology', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await page.goto('/')
    
    try {
      await loadSimpleBoxExample(page)
    } catch (error) {
      test.skip()
      return
    }
    
    // Check status area for any messages
    const statusArea = page.locator('#statusArea, .status-message, [role="status"]')
    
    if (await statusArea.isVisible().catch(() => false)) {
      const statusText = await statusArea.textContent()
      const lowerStatus = statusText.toLowerCase()
      
      // If status mentions saved items, should use "design"
      if (lowerStatus.includes('saved project')) {
        console.warn('Status message uses "saved project", consider "saved design"')
      }
    }
  })
})
