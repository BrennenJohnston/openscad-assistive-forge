import { test, expect } from '@playwright/test'
import path from 'path'

const isCI = !!process.env.CI

async function waitForWasmReady(page) {
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: 120_000,
  })
}

async function dismissSaveProjectModal(page) {
  const notNowBtn = page.locator('#saveProjectNotNow')
  try {
    await notNowBtn.waitFor({ state: 'visible', timeout: 3000 })
    await notNowBtn.click()
    await page.waitForTimeout(300)
  } catch {
    // Modal did not appear
  }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
  })
})

test.describe('Expert Mode E2E Smoke Test (REC-003)', () => {
  test('should activate Expert Mode, show editor, accept input, and display typed content', async ({
    page,
  }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await page.goto('/')
    await waitForWasmReady(page)

    // Upload a test file to enter the main interface
    const fixturePath = path.join(
      process.cwd(),
      'tests',
      'fixtures',
      'sample.scad'
    )
    await page.setInputFiles('#fileInput', fixturePath)
    await page.waitForSelector('.param-control', { timeout: 30_000 })
    await dismissSaveProjectModal(page)

    // Step 1: Switch to Advanced mode via the UI mode toggle
    const uiModeToggle = page.locator('#uiModeToggle')
    await expect(uiModeToggle).toBeVisible()
    await uiModeToggle.click()
    await expect(uiModeToggle).toHaveAttribute('aria-checked', 'true')

    // Step 2: Activate Expert Mode via the toggle button
    const expertToggle = page.locator('#expertModeToggle')
    const isExpertVisible = await expertToggle
      .isVisible()
      .catch(() => false)

    if (isExpertVisible) {
      await expertToggle.click()
    } else {
      // Fallback: use Ctrl+E keyboard shortcut
      console.log(
        'Expert Mode toggle not visible — activating via Ctrl+E'
      )
      await page.keyboard.press('Control+e')
    }

    // Step 3: Verify the Expert Mode panel is visible
    const expertPanel = page.locator('#expertModePanel')
    await expect(expertPanel).toBeVisible({ timeout: 10_000 })
    await expect(expertPanel).toHaveClass(/active/)

    // Step 4: Verify the textarea editor was created
    const textarea = page.locator('#expert-mode-textarea')
    await expect(textarea).toBeVisible({ timeout: 5_000 })

    // Step 5: Type content and verify it appears in the textarea
    const testCode = 'cube([10, 20, 30]);'
    await textarea.focus()
    await textarea.fill(testCode)

    const currentValue = await textarea.inputValue()
    expect(currentValue).toContain(testCode)

    console.log(
      'Expert Mode smoke test passed: editor visible, input accepted'
    )
  })

  test('should toggle back to Standard mode and restore parameter panel', async ({
    page,
  }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await page.goto('/')
    await waitForWasmReady(page)

    const fixturePath = path.join(
      process.cwd(),
      'tests',
      'fixtures',
      'sample.scad'
    )
    await page.setInputFiles('#fileInput', fixturePath)
    await page.waitForSelector('.param-control', { timeout: 30_000 })
    await dismissSaveProjectModal(page)

    // Switch to Advanced → Expert Mode
    const uiModeToggle = page.locator('#uiModeToggle')
    await uiModeToggle.click()
    await expect(uiModeToggle).toHaveAttribute('aria-checked', 'true')

    const expertToggle = page.locator('#expertModeToggle')
    const isExpertVisible = await expertToggle
      .isVisible()
      .catch(() => false)

    if (isExpertVisible) {
      await expertToggle.click()
    } else {
      await page.keyboard.press('Control+e')
    }

    const expertPanel = page.locator('#expertModePanel')
    await expect(expertPanel).toBeVisible({ timeout: 10_000 })

    // Exit Expert Mode via the close button
    const closeBtn = page.locator('#expertModeCloseBtn')
    await expect(closeBtn).toBeVisible()
    await closeBtn.click()

    // Expert panel should be hidden
    await expect(expertPanel).not.toHaveClass(/active/)

    // Parameter panel body should be restored
    const paramPanelBody = page.locator('#paramPanelBody')
    await expect(paramPanelBody).toBeVisible({ timeout: 5_000 })

    // The toggle should reflect Standard mode
    await expect(expertToggle).toHaveAttribute('aria-pressed', 'false')

    console.log(
      'Expert Mode exit test passed: Standard mode restored'
    )
  })

  test('should have accessible editor with proper ARIA attributes', async ({
    page,
  }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await page.goto('/')
    await waitForWasmReady(page)

    const fixturePath = path.join(
      process.cwd(),
      'tests',
      'fixtures',
      'sample.scad'
    )
    await page.setInputFiles('#fileInput', fixturePath)
    await page.waitForSelector('.param-control', { timeout: 30_000 })
    await dismissSaveProjectModal(page)

    // Activate Expert Mode
    const uiModeToggle = page.locator('#uiModeToggle')
    await uiModeToggle.click()

    const expertToggle = page.locator('#expertModeToggle')
    const isExpertVisible = await expertToggle
      .isVisible()
      .catch(() => false)

    if (isExpertVisible) {
      await expertToggle.click()
    } else {
      await page.keyboard.press('Control+e')
    }

    await expect(page.locator('#expertModePanel')).toBeVisible({
      timeout: 10_000,
    })

    // Verify ARIA attributes on the editor region
    const panel = page.locator('#expertModePanel')
    await expect(panel).toHaveAttribute('role', 'region')
    await expect(panel).toHaveAttribute(
      'aria-label',
      'OpenSCAD code editor'
    )

    // Verify textarea accessibility
    const textarea = page.locator('#expert-mode-textarea')
    await expect(textarea).toHaveAttribute(
      'aria-label',
      'OpenSCAD code editor'
    )
    await expect(textarea).toHaveAttribute('aria-describedby')
    await expect(textarea).toHaveAttribute('spellcheck', 'false')

    // Verify the instructions element referenced by aria-describedby exists
    const describedById = await textarea.getAttribute('aria-describedby')
    await expect(page.locator(`#${describedById}`)).toBeAttached()

    console.log(
      'Expert Mode accessibility test passed: ARIA attributes correct'
    )
  })
})
