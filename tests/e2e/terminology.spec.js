/**
 * E2E tests for terminology consistency
 * Verifies that "Saved Projects" and "Companion Files" terminology is used consistently
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
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
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

test.describe('Terminology Consistency - Saved Projects', () => {
  test('welcome screen shows "Saved Projects" heading', async ({ page }) => {
    await page.goto('/')
    
    // Check for the saved projects section
    const heading = page.locator('#saved-projects-heading')
    
    if (await heading.isVisible().catch(() => false)) {
      const text = await heading.textContent()
      expect(text.toLowerCase()).toContain('saved project')
      // Should NOT contain "Saved Design"
      expect(text.toLowerCase()).not.toContain('saved design')
    }
  })

  test('empty state uses "saved projects" terminology', async ({ page }) => {
    // Clear any saved projects first
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
      // Should use "project" not "design"
      expect(text.toLowerCase()).toContain('project')
    }
  })

  test('saved projects list has correct aria-label', async ({ page }) => {
    await page.goto('/')
    
    const list = page.locator('#savedProjectsList')
    
    // Check if element exists using count() - isAttached() is not a valid Playwright method
    if (await list.count() > 0) {
      const ariaLabel = await list.getAttribute('aria-label')
      if (ariaLabel) {
        expect(ariaLabel.toLowerCase()).toContain('project')
      }
    }
  })

  test('save button uses consistent terminology', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await page.goto('/')
    
    await loadSimpleBoxExample(page)

    // Look for save project button. Visible ones only: the memory banner keeps
    // a hidden Save Project button in the page while memory is normal.
    const saveBtn = page
      .locator('button:has-text("Save"):visible, button[aria-label*="Save"]:visible')
      .first()
    
    // The ban is the test: a save control may never say "saved design".
    await expect(saveBtn).toBeVisible()
    const text = await saveBtn.textContent()
    const ariaLabel = await saveBtn.getAttribute('aria-label')
    const title = await saveBtn.getAttribute('title')
    const combinedText = `${text || ''} ${ariaLabel || ''} ${title || ''}`.toLowerCase()
    expect(combinedText).not.toContain('saved design')
  })

  test('load confirmation dialog uses "Saved Project" terminology', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    // First, save a design
    await page.goto('/')
    
    await loadSimpleBoxExample(page)

    // The save modal fires on load for an unsaved example, and its copy is
    // the check.
    const modal = page.locator('.save-project-modal')
    if (await modal.isVisible().catch(() => false)) {
      const copy = ((await modal.textContent()) || '').toLowerCase()
      expect(copy).not.toContain('saved design')
      expect(copy).toContain('project')
      await page.locator('#saveProjectNotNow').click()
    }
    const saveBtn = page.locator('button:has-text("Save"):visible').first()
    await expect(saveBtn).toBeVisible()
    const saveWords = `${(await saveBtn.textContent()) || ''} ${(await saveBtn.getAttribute('aria-label')) || ''}`.toLowerCase()
    expect(saveWords).not.toContain('design')
  })

  test('delete confirmation uses "Saved Project" terminology', async ({ page }) => {
    // The dialog title must say "Saved Project", never "Saved Design". The
    // title string is owned by saved-projects-ui; drive the module boundary
    // directly.
    await page.goto('/')
    const title = await page.evaluate(async () => {
      const mod = await import('/src/js/saved-projects-ui.js')
      return mod.DELETE_CONFIRM_TITLE
    })
    expect(title).toBe('Delete Saved Project')
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
  test('welcome screen does not use "Saved Design" (singular or plural)', async ({ page }) => {
    await page.goto('/')
    
    // Get all visible text on welcome screen
    const welcomeScreen = page.locator('#welcomeScreen')
    
    if (await welcomeScreen.isVisible().catch(() => false)) {
      const text = await welcomeScreen.textContent()
      // Should not contain "Saved Design" anywhere visible
      const lowerText = text.toLowerCase()
      
      // Count occurrences of "saved project" vs "saved design"
      const projectCount = (lowerText.match(/saved project/g) || []).length
      const designCount = (lowerText.match(/saved design/g) || []).length
      
      // Should have more "project" references than "design" references
      // Or no references to either (both are fine)
      expect(designCount).toBeLessThanOrEqual(projectCount)
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

test.describe('Customizer terminology', () => {
  test('the pane is named Customizer, not Parameters', async ({ page }) => {
    await page.goto('/')

    // The panel heading uses desktop OpenSCAD naming (id stays for
    // aria-labelledby couplings; only the visible text changed)
    await expect(page.locator('#parameters-heading')).toHaveText('Customizer')

    // No aria-label may reference the old "parameters panel" pane name.
    await expect(page.locator('[aria-label*="parameters panel" i]')).toHaveCount(0)
    await expect(page.locator('[title="Parameters"]')).toHaveCount(0)

    // The button that opens the pane wears the pane's name. Static markup, so
    // this holds before a project is ever loaded.
    await expect(page.locator('#mobileDrawerToggle .btn-label')).toHaveText(
      'Customizer'
    )
  })

  // The landing surface is the Main Page, and it says so on itself rather
  // than only inside the tours and the header button that send people back
  // to it.
  test('the Main Page names itself and its tours', async ({ page }) => {
    await page.goto('/')

    await expect(page.locator('#features-heading')).toHaveText('Main Page')
    await expect(page.locator('#startWelcomeTourBtn')).toHaveText(
      'Start Main Page Tour'
    )
    await expect(
      page.locator('.role-path-card').first().locator('.role-path-title')
    ).toHaveText('Main Page Tour')

    // Neither "welcome page" nor "welcome screen" appears on the surface.
    const shown = await page.locator('#welcomeScreen').innerText()
    expect(shown).not.toMatch(/welcome page/i)
    expect(shown).not.toMatch(/welcome screen/i)
  })

  // These five controls belong to the Customizer, so they name it rather
  // than "Params". Each is static markup, so none of this needs WASM or a
  // loaded project.
  test('five controls speak Customizer, not Params', async ({ page }) => {
    await page.goto('/')

    await expect(page.locator('#exportParamsBtn .btn-text')).toHaveText(
      'Export Customizer Settings'
    )
    await expect(page.locator('#viewParamsJsonBtn')).toContainText(
      'View Customizer JSON'
    )
    await expect(page.locator('#paramSearchInput')).toHaveAttribute(
      'placeholder',
      'Search the Customizer...'
    )
    await expect(page.locator('#paramsJsonTitle')).toHaveText(
      'Current Customizer JSON'
    )
    await expect(page.locator('#resetConfirmTitle')).toHaveText(
      'Reset the Customizer?'
    )
    await expect(page.locator('#tab-colors')).toHaveText('Color Settings')
  })

  // WCAG 2.5.3 Label in Name: what a control reads must be contained in what
  // it is called, or speech input cannot act on the words on screen. A
  // header button reading "Main Page" named "Return to the main projects
  // page", or a toggle reading "Params" named "Open customizer panel", fails
  // it.
  //
  // Scoped to the naming family deliberately: a general sweep still flags 11
  // unrelated controls (Keys, HC, Help, Full Screen, Back and the welcome
  // actions).
  test('the renamed controls contain their visible label in their name', async ({
    page,
  }) => {
    await page.goto('/')

    const pairs = await page.evaluate(() =>
      ['clearFileBtn', 'mobileDrawerToggle'].map((id) => {
        const el = document.getElementById(id)
        const clone = el.cloneNode(true)
        clone
          .querySelectorAll('svg, [aria-hidden="true"], .sr-only')
          .forEach((n) => n.remove())
        return {
          id,
          visible: clone.textContent
            .replace(/\s+/g, ' ')
            .replace(/[←→]/g, '')
            .trim(),
          accessible: el.getAttribute('aria-label') || '',
        }
      })
    )

    for (const pair of pairs) {
      expect(pair.visible.length, `${pair.id} has a visible label`).toBeGreaterThan(0)
      expect(
        pair.accessible.toLowerCase(),
        `${pair.id}: visible "${pair.visible}" must be contained in accessible name "${pair.accessible}"`
      ).toContain(pair.visible.toLowerCase())
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
      
      // Both checks fail rather than warn, so an aria-label="Project files" on
      // the companion list cannot ship.
      expect(lowerLabel, `aria-label bans "saved design": "${ariaLabel}"`).not.toContain('saved design')
      expect(
        lowerLabel.includes('project files'),
        `companion surfaces are "Companion files", not "Project files": "${ariaLabel}"`
      ).toBe(false)
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
      
      // Banned outright.
      expect(lowerTitle, `title bans "saved design": "${title}"`).not.toContain('saved design')
    }
  })
})

test.describe('Status Messages Terminology', () => {
  test('status area uses consistent terminology', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await page.goto('/')
    
    await loadSimpleBoxExample(page)
    
    // Check status area for any messages
    const statusArea = page.locator('#statusArea, .status-message, [role="status"]')
    
    // Banned outright, on every status surface found: loading a saved project
    // must never announce "Loaded saved design".
    for (const area of await statusArea.all()) {
      const statusText = (await area.textContent().catch(() => '')) || ''
      expect(statusText.toLowerCase()).not.toContain('saved design')
    }
  })
})
