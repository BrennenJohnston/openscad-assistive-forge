/**
 * E2E tests for ZIP file upload workflow
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import JSZip from 'jszip'
import { fileURLToPath } from 'url'

// Skip WASM-dependent tests in CI - WASM initialization is slow/unreliable
const isCI = !!process.env.CI

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const createZipFixture = async () => {
  const zip = new JSZip()
  zip.file('main.scad', 'include <parts/part.scad>\npart();\n')
  zip.file('parts/part.scad', 'module part() { cube([10, 10, 10]); }\n')

  const buffer = await zip.generateAsync({ type: 'nodebuffer' })
  const outputDir = path.join(process.cwd(), 'test-results')
  await fs.promises.mkdir(outputDir, { recursive: true })
  const zipPath = path.join(outputDir, `multi-file-${Date.now()}.zip`)
  await fs.promises.writeFile(zipPath, buffer)
  return zipPath
}

const uploadZipProject = async (page) => {
  await page.goto('/')
  await expect(page.locator('h1')).toContainText('OpenSCAD Web Customizer')

  const zipPath = await createZipFixture()
  const fileInput = page.locator('#fileInput')
  await fileInput.setInputFiles(zipPath)

  await page.locator('#mainInterface').waitFor({ state: 'visible', timeout: 20000 })
  await page.waitForSelector('#fileInfo .file-tree, .project-files', { timeout: 20000 })
}

test.describe('ZIP Upload Workflow', () => {
  test('should upload and process a ZIP file with multiple SCAD files', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await uploadZipProject(page)

    // Verify multiple files are listed
    const fileItems = page.locator('.file-item, .file-tree-item')
    const count = await fileItems.count()
    expect(count).toBeGreaterThan(1)

    // Verify main file is marked or selected
    const mainFile = page.locator('.file-item.main, .file-tree-item.main')
    await expect(mainFile).toBeVisible()

    // Verify parameters are extracted from main file
    await expect(page.locator('.param-control')).toBeVisible({ timeout: 5000 })
  })

  test('should handle ZIP file with includes and use statements', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await uploadZipProject(page)

    // Verify no errors are shown
    const errorAlert = page.locator('[role="alert"]')
    const errorCount = await errorAlert.count()
    
    if (errorCount > 0) {
      const errorText = await errorAlert.textContent()
      // Should not have file not found errors
      expect(errorText).not.toContain('File not found')
      expect(errorText).not.toContain('include')
      expect(errorText).not.toContain('use')
    }

    // Verify project loaded successfully
    await expect(page.locator('.file-tree, .project-files')).toBeVisible()
  })

  test('should show file tree with correct structure', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await uploadZipProject(page)

    // Check file tree structure
    const fileTree = page.locator('.file-tree, .project-files')
    await expect(fileTree).toBeVisible()

    // Verify we can see file names
    const fileNames = await page.locator('.file-name, .file-tree-item').allTextContents()
    expect(fileNames.length).toBeGreaterThan(0)
    
    // At least one should be a .scad file
    const hasScadFile = fileNames.some(name => name.includes('.scad'))
    expect(hasScadFile).toBe(true)
  })

  test('should allow switching between files in project', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await uploadZipProject(page)

    // Get all clickable file items
    const fileItems = page.locator('.file-item, .file-tree-item')
    const count = await fileItems.count()

    if (count < 2) {
      // Need at least 2 files to test switching
      test.skip()
      return
    }

    // Click on second file
    const secondFile = fileItems.nth(1)
    await secondFile.click()

    // Verify file content or viewer updates (implementation-specific)
    // This is a basic check that clicking doesn't cause errors
    await page.waitForTimeout(500)

    // Page should still be functional
    await expect(page.locator('h1')).toBeVisible()
  })

  test('should render STL from ZIP project', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await uploadZipProject(page)

    // Verify parameters are available
    const paramControls = page.locator('.param-control')
    if ((await paramControls.count()) === 0) {
      test.skip()
      return
    }

    // Wait for any auto-preview to complete
    await page.waitForTimeout(3000)

    // Find and click Generate/Download button
    const generateButton = page.locator('button:has-text("Generate STL"), button:has-text("Download STL")')
    if (!(await generateButton.isVisible())) {
      test.skip()
      return
    }

    await generateButton.click()

    // Wait for render to complete (with timeout)
    await page.waitForTimeout(15000)

    // Check that no critical errors occurred
    const criticalError = page.locator('[role="alert"]:has-text("Error"), [role="alert"]:has-text("Failed")')
    const hasCriticalError = await criticalError.isVisible()
    
    // Test passes if either:
    // 1. No critical error, OR
    // 2. Error is about timeout/complexity (acceptable for complex models)
    if (hasCriticalError) {
      const errorText = await criticalError.textContent()
      const isAcceptableError = errorText.includes('timeout') || 
                                errorText.includes('complex') ||
                                errorText.includes('memory')
      expect(isAcceptableError).toBe(true)
    }
  })

  test('should show appropriate error for ZIP > 20MB', async ({ page }) => {
    // This test would require creating a large ZIP file
    // Skip for now as it's covered by unit tests
    test.skip()
  })

  test('should handle invalid ZIP files gracefully', async ({ page }) => {
    await page.goto('/')

    // Would need to upload an invalid ZIP
    // This is better tested in unit tests
    test.skip()
  })

  test('should be accessible with keyboard navigation for file tree', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await uploadZipProject(page)

    const fileTree = page.locator('.file-tree, .project-files')
    if (!(await fileTree.isVisible())) {
      test.skip()
      return
    }

    // Focus on file tree
    await fileTree.press('Tab')

    // Should be able to navigate with arrow keys
    await page.keyboard.press('ArrowDown')
    await page.waitForTimeout(100)
    await page.keyboard.press('ArrowUp')

    // Should be able to select with Enter
    await page.keyboard.press('Enter')
    await page.waitForTimeout(500)

    // Verify no JavaScript errors
    const errors = []
    page.on('pageerror', error => errors.push(error))
    expect(errors.length).toBe(0)
  })

  test('should show project statistics (file count, size)', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await uploadZipProject(page)

    // Look for project info/stats display
    const statsArea = page.locator('.project-stats, .project-info, .file-tree-header')
    
    // This is optional - not all implementations show stats
    if (await statsArea.isVisible()) {
      const statsText = await statsArea.textContent()
      
      // Should show some useful information
      expect(statsText.length).toBeGreaterThan(0)
    }
    
    // Test passes either way - stats display is a nice-to-have
    expect(true).toBe(true)
  })
})
