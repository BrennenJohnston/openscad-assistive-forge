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
    await page.waitForSelector('.param-control', { state: 'attached', timeout: 30_000 })
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

    // Step 4: Verify the editor surface was created — CodeMirror's
    // contenteditable in the normal case, the textarea only as fallback
    const editor = page
      .locator('#expertModePanel .cm-content, #expert-mode-textarea')
      .first()
    await expect(editor).toBeVisible({ timeout: 5_000 })

    // Step 5: Type content and verify it appears in the editor
    const testCode = 'cube([10, 20, 30]);'
    const isTextarea = await editor.evaluate(
      (el) => el.tagName === 'TEXTAREA'
    )
    await editor.click()
    await editor.fill(testCode)
    if (isTextarea) {
      expect(await editor.inputValue()).toContain(testCode)
    } else {
      await expect(editor).toContainText('cube([10, 20, 30]);')
    }

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
    await page.waitForSelector('.param-control', { state: 'attached', timeout: 30_000 })
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
    await page.waitForSelector('.param-control', { state: 'attached', timeout: 30_000 })
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

    // Verify editor-surface accessibility (CodeMirror content in the normal
    // case; the plain textarea only when CM failed to load)
    const editor = page
      .locator('#expertModePanel .cm-content, #expert-mode-textarea')
      .first()
    await expect(editor).toBeVisible({ timeout: 5_000 })
    await expect(editor).toHaveAttribute(
      'aria-label',
      'OpenSCAD code editor'
    )
    const isTextarea = await editor.evaluate(
      (el) => el.tagName === 'TEXTAREA'
    )
    if (isTextarea) {
      await expect(editor).toHaveAttribute('aria-describedby')
      await expect(editor).toHaveAttribute('spellcheck', 'false')
      const describedById = await editor.getAttribute('aria-describedby')
      await expect(page.locator(`#${describedById}`)).toBeAttached()
    } else {
      // CodeMirror's editable surface is a native textbox
      await expect(editor).toHaveAttribute('role', 'textbox')
      await expect(editor).toHaveAttribute('contenteditable', 'true')
    }

    console.log(
      'Expert Mode accessibility test passed: ARIA attributes correct'
    )
  })
})

test.describe('D-15 — opening the editor must not steal focus from a menu', () => {
  /**
   * The editor is focused after a mode switch for WCAG 2.4.3, which is right
   * on its own. The defect is that it happens a frame later, unconditionally,
   * so a user who presses the editor toggle and then opens a menu ends up with
   * the menu open and focus back in the editor — the APG menu contract says
   * focus moves INTO an open menu and stays there.
   *
   * Both clicks fire in one task on purpose. That is what a fast keyboard or
   * switch user produces, and it is the only timing that reproduces it: with
   * ordinary click latency the menu wins the race anyway, which is why a test
   * that merely clicked twice could not tell the fix from the defect.
   */
  test('the Edit menu keeps focus when the editor opens under it', async ({
    page,
  }) => {
    test.setTimeout(240_000)

    await page.goto('/')
    await waitForWasmReady(page)
    await page.setInputFiles(
      '#fileInput',
      path.join(process.cwd(), 'tests', 'fixtures', 'sample.scad')
    )
    await page.waitForSelector('.param-control', {
      state: 'attached',
      timeout: 30_000,
    })
    await dismissSaveProjectModal(page)

    const uiToggle = page.locator('#uiModeToggle')
    if ((await uiToggle.getAttribute('aria-checked')) !== 'true') {
      await uiToggle.click()
    }
    await expect(page.locator('#expertModeToggle')).toBeVisible({
      timeout: 10_000,
    })

    await page.evaluate(() => {
      document.getElementById('expertModeToggle').click()
      document.getElementById('editMenuBtn').click()
    })

    // Long enough for both the rAF path and the 100ms timer to have run.
    await page.waitForTimeout(600)

    const state = await page.evaluate(() => {
      const active = document.activeElement
      return {
        menuOpen: !!document.querySelector('#editMenuModal:not([hidden])'),
        activeInMenu: !!active?.closest('#editMenuModal'),
        activeIsEditor: !!active?.classList?.contains('cm-content'),
      }
    })

    expect(state.menuOpen).toBe(true)
    // MEASURED on the parent commit: activeIsEditor true with the menu open,
    // from mode-manager's requestAnimationFrame focus, which had no guard.
    expect(state.activeIsEditor).toBe(false)
    expect(state.activeInMenu).toBe(true)
  })
})

test.describe('Edit ▸ Font Size actually changes the font', () => {
  /**
   * Found while building Preferences ▸ Editor. The handler called
   * `editor.updateOptions({ fontSize })` behind an `if (editor.updateOptions)`
   * guard, and no editor in this codebase has ever had that method — so the
   * control saved the number, updated its readout and announced the new size
   * while changing nothing on screen. That is the worst shape of defect for
   * the low-vision users the control exists for, and it is invisible to any
   * test that only checks the announcement or the stored value.
   */
  test('increasing the font size grows the rendered text', async ({ page }) => {
    test.setTimeout(240_000)

    await page.goto('/')
    await waitForWasmReady(page)
    await page.setInputFiles(
      '#fileInput',
      path.join(process.cwd(), 'tests', 'fixtures', 'sample.scad')
    )
    await page.waitForSelector('.param-control', {
      state: 'attached',
      timeout: 30_000,
    })
    await dismissSaveProjectModal(page)

    const uiToggle = page.locator('#uiModeToggle')
    if ((await uiToggle.getAttribute('aria-checked')) !== 'true') {
      await uiToggle.click()
    }
    await page.locator('#expertModeToggle').click()

    const surface = page.locator('#expertModeBody .cm-content, #expert-mode-textarea').first()
    await expect(surface).toBeVisible({ timeout: 15_000 })

    const fontSize = () =>
      surface.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
    const before = await fontSize()
    expect(before).toBeGreaterThan(0)

    await page.locator('#editMenuBtn').click()
    await page
      .locator('#editMenuModal [role="menuitem"]')
      .filter({ hasText: 'Increase Font Size' })
      .first()
      .click()

    // MEASURED on the parent commit: unchanged, because the method called
    // does not exist.
    await expect.poll(fontSize, { timeout: 5_000 }).toBeGreaterThan(before)
  })
})
