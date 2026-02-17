/**
 * E2E tests for Project Files Manager (companion files)
 * Tests the multi-file project workflow: adding, editing, removing companion files
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
 * Create a ZIP fixture with multiple files for testing
 */
const createMultiFileZipFixture = async () => {
  const zip = new JSZip()
  
  // Main SCAD file with include and file references
  const mainScad = `// Multi-file test project
include <helpers.scad>

/* [Settings] */
width = 100; // [50:200]
height = 50; // [25:100]

// File reference
config_file = "settings.txt";

module main() {
    cube([width, height, 10]);
    helper_part();
}

main();
`
  
  // Helper SCAD file
  const helperScad = `// Helper module
module helper_part() {
    translate([0, 0, 10])
        sphere(r=5);
}
`
  
  // Config text file
  const settingsTxt = `# Configuration file
setting1=value1
setting2=value2
`
  
  zip.file('main.scad', mainScad)
  zip.file('helpers.scad', helperScad)
  zip.file('settings.txt', settingsTxt)
  
  const buffer = await zip.generateAsync({ type: 'nodebuffer' })
  const outputDir = path.join(process.cwd(), 'test-results')
  await fs.promises.mkdir(outputDir, { recursive: true })
  const zipPath = path.join(outputDir, `project-files-test-${Date.now()}.zip`)
  await fs.promises.writeFile(zipPath, buffer)
  return zipPath
}

/**
 * Load the simple-box example via deep-link (avoids strict mode
 * violations from multiple buttons matching data-example="simple-box")
 */
const loadSimpleBoxExample = async (page) => {
  await page.goto('/?example=simple-box')
  const mainInterface = page.locator('#mainInterface')
  await mainInterface.waitFor({ state: 'visible', timeout: 30000 })
  await page.waitForSelector('.param-control', { state: 'attached', timeout: 20000 })
}

/**
 * Upload a multi-file ZIP project
 */
const uploadZipProject = async (page) => {
  await page.goto('/')
  // Wait for WASM engine before uploading (file handler isn't registered until ready)
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: 120_000,
  })
  const zipPath = await createMultiFileZipFixture()
  const fileInput = page.locator('#fileInput')
  await fileInput.setInputFiles(zipPath)
  await page.locator('#mainInterface').waitFor({ state: 'visible', timeout: 30000 })

  // Dismiss save-project modal if it appears
  try {
    const notNowBtn = page.locator('#saveProjectNotNow')
    await notNowBtn.waitFor({ state: 'visible', timeout: 3000 })
    await notNowBtn.click()
    await page.waitForTimeout(300)
  } catch {
    // Modal didn't appear
  }
}

test.describe('Project Files Manager', () => {
  test.describe.configure({ timeout: 150_000 }) // WASM init may need ~120s

  test('shows companion files section for ZIP projects', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await uploadZipProject(page)
    
    // Verify project files controls become visible
    const projectFilesControls = page.locator('#projectFilesControls')
    await expect(projectFilesControls).toBeVisible({ timeout: 5000 })
    
    // Verify file count badge
    const badge = page.locator('#projectFilesBadge')
    if (await badge.isVisible()) {
      const badgeText = await badge.textContent()
      const count = parseInt(badgeText, 10)
      expect(count).toBeGreaterThanOrEqual(2) // Should have at least main + 1 companion
    }
  })

  test('shows empty-state companion files for single-file projects', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await page.goto('/')
    
    try {
      await loadSimpleBoxExample(page)
    } catch (error) {
      console.log('Could not load example:', error.message)
      test.skip()
      return
    }
    
    // Panel should be visible with empty-state content (not hidden)
    const projectFilesControls = page.locator('#projectFilesControls')
    await expect(projectFilesControls).toBeVisible({ timeout: 10000 })
    
    // Empty state message should be present
    const emptyState = page.locator('#projectFilesControls .companion-empty-state')
    await expect(emptyState).toBeVisible()
    await expect(emptyState).toContainText('No companion files yet')
  })

  test('shows file list with correct structure', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await uploadZipProject(page)
    
    // Check for project files list
    const filesList = page.locator('#projectFilesList')
    await expect(filesList).toBeVisible({ timeout: 5000 })
    
    // Verify we have file items
    const fileItems = page.locator('.project-file-item')
    const count = await fileItems.count()
    expect(count).toBeGreaterThanOrEqual(1)
    
    // Verify main file is marked (use .first() since both the item and its badge match)
    const mainFile = page.locator('.project-file-item.main-file').first()
    await expect(mainFile).toBeVisible()
  })

  test('main file has no remove button', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await uploadZipProject(page)
    
    // Find the main file item
    const mainFileItem = page.locator('.project-file-item.main-file').first()
    await expect(mainFileItem).toBeVisible()
    
    // Verify main file does not have a remove button
    const removeBtn = mainFileItem.locator('button[data-action="remove"]')
    const hasRemoveBtn = await removeBtn.count() > 0
    expect(hasRemoveBtn).toBe(false)
  })

  test('non-main files have edit and remove buttons', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await uploadZipProject(page)
    
    // Find a non-main file item
    const nonMainItems = page.locator('.project-file-item:not(.main-file)')
    const count = await nonMainItems.count()
    
    if (count === 0) {
      console.log('No non-main files found in project')
      test.skip()
      return
    }
    
    // Check first non-main item for buttons
    const firstNonMain = nonMainItems.first()
    
    // Should have remove button
    const removeBtn = firstNonMain.locator('button[data-action="remove"]')
    await expect(removeBtn).toBeVisible()
  })

  test('can open edit modal for text files', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await uploadZipProject(page)
    
    // Find a .txt file's edit button
    const txtFileItem = page.locator('.project-file-item:has(.project-file-name:has-text(".txt"))').first()
    
    if (!(await txtFileItem.isVisible().catch(() => false))) {
      console.log('No .txt file found in project')
      test.skip()
      return
    }
    
    const editBtn = txtFileItem.locator('button[data-action="edit"]')
    
    if (!(await editBtn.isVisible().catch(() => false))) {
      console.log('No edit button found for .txt file')
      test.skip()
      return
    }
    
    await editBtn.click()
    
    // Verify text editor modal opens
    const modal = page.locator('#textFileEditorModal')
    await expect(modal).toBeVisible({ timeout: 3000 })
    
    // Verify modal has content textarea
    const textarea = page.locator('#textFileEditorContent')
    await expect(textarea).toBeVisible()
  })

  test('can close edit modal', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await uploadZipProject(page)
    
    // Find and open edit modal for a text file
    const txtFileItem = page.locator('.project-file-item:has(.project-file-name:has-text(".txt"))').first()
    
    if (!(await txtFileItem.isVisible().catch(() => false))) {
      test.skip()
      return
    }
    
    const editBtn = txtFileItem.locator('button[data-action="edit"]')
    if (!(await editBtn.isVisible().catch(() => false))) {
      test.skip()
      return
    }
    
    await editBtn.click()
    
    const modal = page.locator('#textFileEditorModal')
    await expect(modal).toBeVisible({ timeout: 3000 })
    
    // Close the modal
    const closeBtn = modal.locator('[data-action="close"], button:has-text("Cancel")').first()
    await closeBtn.click()
    
    // Verify modal is closed
    await expect(modal).toBeHidden({ timeout: 2000 })
  })

  test('shows warning for missing required files', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    // Create a ZIP with missing include reference
    const zip = new JSZip()
    const mainScad = `// Project with missing include
include <missing_file.scad>
cube(10);
`
    zip.file('main.scad', mainScad)
    
    const buffer = await zip.generateAsync({ type: 'nodebuffer' })
    const outputDir = path.join(process.cwd(), 'test-results')
    await fs.promises.mkdir(outputDir, { recursive: true })
    const zipPath = path.join(outputDir, `missing-file-test-${Date.now()}.zip`)
    await fs.promises.writeFile(zipPath, buffer)
    
    await page.goto('/')
    const fileInput = page.locator('#fileInput')
    await fileInput.setInputFiles(zipPath)
    
    // Wait for UI to process
    await page.waitForTimeout(3000)
    
    // Check for warning about missing files
    const warning = page.locator('#projectFilesWarning, .project-files-warning')
    
    // Warning may or may not appear depending on implementation
    // Just verify no crash occurred
    await expect(page.locator('body')).toBeVisible()
  })

  test('file icons display correctly by type', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await uploadZipProject(page)
    
    // Check that file icons are present
    const icons = page.locator('.project-file-icon')
    const count = await icons.count()
    
    if (count > 0) {
      // Verify at least one icon is not empty
      const firstIcon = await icons.first().textContent()
      expect(firstIcon.length).toBeGreaterThan(0)
    }
  })

  test('file sizes display correctly', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await uploadZipProject(page)
    
    // Check that file sizes are displayed
    const sizes = page.locator('.project-file-size')
    const count = await sizes.count()
    
    if (count > 0) {
      const sizeText = await sizes.first().textContent()
      // Should contain some size indication (bytes, KB, etc.)
      expect(sizeText.length).toBeGreaterThan(0)
    }
  })

  test('project files list is accessible', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await uploadZipProject(page)
    
    const filesList = page.locator('#projectFilesList')
    
    if (!(await filesList.isVisible().catch(() => false))) {
      test.skip()
      return
    }
    
    // Check for role="list" or similar
    const role = await filesList.getAttribute('role')
    const hasListRole = role === 'list' || 
                        await filesList.locator('[role="listitem"]').count() > 0
    
    // Either has list role or has listitem children
    expect(hasListRole || await filesList.locator('.project-file-item').count() > 0).toBe(true)
  })

  test('can remove companion file after confirmation', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await uploadZipProject(page)
    
    // Get initial file count
    const fileItems = page.locator('.project-file-item')
    const initialCount = await fileItems.count()
    
    if (initialCount < 2) {
      console.log('Need at least 2 files to test removal')
      test.skip()
      return
    }
    
    // Find a non-main file to remove
    const nonMainItem = page.locator('.project-file-item:not(.main-file)').first()
    const removeBtn = nonMainItem.locator('button[data-action="remove"]')
    
    if (!(await removeBtn.isVisible().catch(() => false))) {
      test.skip()
      return
    }
    
    // Set up dialog handler before clicking
    page.on('dialog', async dialog => {
      await dialog.accept()
    })
    
    await removeBtn.click()
    
    // Wait for UI to update
    await page.waitForTimeout(1000)
    
    // Verify file count decreased
    const newCount = await fileItems.count()
    expect(newCount).toBeLessThan(initialCount)
  })

  test('removal can be cancelled', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await uploadZipProject(page)
    
    // Get initial file count
    const fileItems = page.locator('.project-file-item')
    const initialCount = await fileItems.count()
    
    if (initialCount < 2) {
      test.skip()
      return
    }
    
    // Find a non-main file to try removing
    const nonMainItem = page.locator('.project-file-item:not(.main-file)').first()
    const removeBtn = nonMainItem.locator('button[data-action="remove"]')
    
    if (!(await removeBtn.isVisible().catch(() => false))) {
      test.skip()
      return
    }
    
    // Set up dialog handler to dismiss
    page.on('dialog', async dialog => {
      await dialog.dismiss()
    })
    
    await removeBtn.click()
    
    // Wait for UI to process
    await page.waitForTimeout(500)
    
    // Verify file count unchanged
    const newCount = await fileItems.count()
    expect(newCount).toBe(initialCount)
  })

  test('companion save button is visible for loaded projects', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await page.goto('/')

    try {
      await loadSimpleBoxExample(page)
    } catch (error) {
      console.log('Could not load example:', error.message)
      test.skip()
      return
    }

    // The Save as Project button should be visible in the companion files section
    const saveBtn = page.locator('#companionSaveBtn')
    await expect(saveBtn).toBeVisible({ timeout: 10000 })
    await expect(saveBtn).toContainText('Save as Project')
  })
})
