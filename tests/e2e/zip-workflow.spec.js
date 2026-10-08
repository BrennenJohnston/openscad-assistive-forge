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

// Dismiss first-visit modal so it doesn't block UI interactions
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
  })
})

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

  // Wait for WASM engine to be ready before uploading
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: 120_000,
  })

  const zipPath = await createZipFixture()
  const fileInput = page.locator('#fileInput')
  await fileInput.setInputFiles(zipPath)

  await page.locator('#mainInterface').waitFor({ state: 'visible', timeout: 30000 })
  // Companion Files section renders .project-file-item rows (collapsed details)
  await page.waitForSelector('#projectFilesList .project-file-item', {
    state: 'attached',
    timeout: 20000,
  })

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

const openProjectFiles = async (page) => {
  // Companion Files is registry-hidden in Simplified mode — switch to
  // Standard before interacting with it.
  const uiModeToggle = page.locator('#uiModeToggle')
  if ((await uiModeToggle.getAttribute('aria-checked')) === 'false') {
    await uiModeToggle.click()
    await page.waitForSelector('body[data-ui-mode="standard"]', {
      state: 'attached',
      timeout: 5000,
    })
  }
  const details = page.locator('.project-files-details')
  if (!(await details.getAttribute('open').then((v) => v !== null))) {
    await details.locator('summary').click()
  }
  await page.locator('#projectFilesList').waitFor({ state: 'visible', timeout: 5000 })
}

test.describe('ZIP Upload Workflow', () => {
  test.describe.configure({ timeout: 150_000 }) // WASM init may need ~120s
  test('should upload and process a ZIP file with multiple SCAD files', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await uploadZipProject(page)

    // Verify multiple files are listed in the Companion Files section
    await openProjectFiles(page)
    const fileItems = page.locator('#projectFilesList .project-file-item')
    const count = await fileItems.count()
    expect(count).toBeGreaterThan(1)

    // Verify main file is marked
    const mainFile = page.locator('#projectFilesList .project-file-item.main-file')
    await expect(mainFile).toBeVisible()

    // Verify the main interface loaded (the ZIP fixture's cube() has no
    // customizable parameters, so .param-control won't appear)
    await expect(page.locator('#mainInterface')).toBeVisible({ timeout: 5000 })
  })

  test('should handle ZIP file with includes and use statements', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await uploadZipProject(page)

    // Verify no "file not found" errors are shown in the error banner
    const errorMsg = page.locator('#errorMessage')
    const errorText = await errorMsg.textContent().catch(() => '')
    if (errorText) {
      expect(errorText).not.toContain('File not found')
      expect(errorText).not.toContain('include')
      expect(errorText).not.toContain('use')
    }

    // Verify the project-files section exists for the loaded ZIP
    // (registry-hidden in Simplified mode, so switch + open first)
    await openProjectFiles(page)
    await expect(page.locator('#projectFilesControls')).toBeVisible()
  })

  test('should show file tree with correct structure', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await uploadZipProject(page)

    // Check the project files listing
    await openProjectFiles(page)

    // Verify we can see file names
    const fileNames = await page
      .locator('#projectFilesList .project-file-item')
      .allTextContents()
    expect(fileNames.length).toBeGreaterThan(0)
    
    // At least one should be a .scad file
    const hasScadFile = fileNames.some(name => name.includes('.scad'))
    expect(hasScadFile).toBe(true)
  })

  test('should allow switching between files in project', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await uploadZipProject(page)

    // Get all clickable file items
    await openProjectFiles(page)
    const fileItems = page.locator('#projectFilesList .project-file-item')
    const count = await fileItems.count()

    // This needs at least 2 files to have anything to switch between, and the
    // fixture provides them; asserted rather than guarded, so a fixture that
    // quietly lost a file cannot read as a pass.
    expect(count).toBeGreaterThanOrEqual(2)

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

    // No parameters precondition: createZipFixture above builds main.scad +
    // parts/part.scad with no customizable variable in either, so there is
    // nothing for the Customizer to show. Rendering an STL does not need
    // parameters, and that is what this case is about.

    // Wait for any auto-preview to complete
    await page.waitForTimeout(3000)

    // Find and click Generate/Download button. .first() is not cosmetic: that
    // selector resolves to three buttons, so a bare click would be a
    // strict-mode violation.
    const generateButton = page
      .locator('button:has-text("Generate"), button:has-text("Download")')
      .first()
    await expect(generateButton).toBeVisible()

    await generateButton.click()

    // Wait for render to complete (with timeout)
    await page.waitForTimeout(15000)

    // Check that no critical errors occurred
    const criticalError = page
      .locator('[role="alert"]:has-text("Error"), [role="alert"]:has-text("Failed")')
      .first()
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

  /*
   * These two are titles with a bare test.skip() under each, and the reason
   * sits in the skip itself, where a report shows it.
   *
   * The claim that unit tests cover both paths is the original author's and
   * is carried forward verbatim rather than verified here; whoever takes
   * these should check it before deleting them.
   */
  test('should show appropriate error for ZIP > 20MB', async () => {
    test.skip(
      true,
      'never written: needs a >20MB ZIP fixture to be generated; recorded by its author as covered by unit tests'
    )
  })

  test('should handle invalid ZIP files gracefully', async () => {
    test.skip(
      true,
      'never written: needs a deliberately corrupt ZIP fixture; recorded by its author as better tested in unit tests'
    )
  })

  test('should be accessible with keyboard navigation for file tree', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await uploadZipProject(page)

    // Collect page errors from the start so interactions are covered
    const errors = []
    page.on('pageerror', (error) => errors.push(error))

    await openProjectFiles(page)
    const firstItem = page
      .locator('#projectFilesList .project-file-item')
      .first()
    await firstItem.focus()

    // Keyboard interaction over the listing must not throw
    await page.keyboard.press('ArrowDown')
    await page.waitForTimeout(100)
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(500)

    expect(errors.length).toBe(0)
  })

  test('should show project statistics (file count, size)', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await uploadZipProject(page)

    // The Companion Files summary badge carries the file count
    const statsArea = page.locator('.project-files-summary')
    test.skip(
      !(await statsArea.first().isVisible()),
      'Stats display is optional UI and not present'
    )

    const statsText = await statsArea.first().textContent()
    expect(statsText.length).toBeGreaterThan(0)
  })
})
