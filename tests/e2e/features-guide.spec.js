import { test, expect } from '@playwright/test'
import path from 'path'

const isCI = !!process.env.CI

// Dismiss first-visit modal so it doesn't block UI interactions
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
  })
})

/**
 * No case here wraps its body in a try/catch whose catch calls a bare
 * test.skip(): such a case reports "skipped" on every run and asserts
 * nothing. The file input does not accept a file until WASM has
 * initialized, so every case waits for `body[data-wasm-ready="true"]`
 * first, through the shared wait, and the assertions can fail like
 * assertions.
 */
async function waitForWasmReady(page) {
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: 120_000,
  })
}

/** Load the sample model every modal case needs, and prove it loaded. */
async function loadSample(page) {
  await page.goto('/')
  await waitForWasmReady(page)

  const fileInput = page.locator('#fileInput')
  const fixturePath = path.join(process.cwd(), 'tests', 'fixtures', 'sample.scad')
  await fileInput.setInputFiles(fixturePath)

  // F5: parameter groups load collapsed, so the controls are attached long
  // before any of them is visible. Asking for 'visible' here is what the old
  // 15s timeout was really failing on once WASM was fixed.
  await page.waitForSelector('.param-control', {
    state: 'attached',
    timeout: 15000,
  })

  // Loading a file raises the "Save this file for quick access?" prompt, and
  // it sits directly over the Help button every case here needs to click.
  await page.waitForSelector('.save-project-modal', {
    state: 'visible',
    timeout: 30000,
  })
  await page.locator('#saveProjectNotNow').click()
  await expect(page.locator('.save-project-modal')).not.toBeVisible()
}

test.describe('Features Guide Modal', () => {
  test('should open Features Guide from Help button', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await loadSample(page)

    // Help button should be visible
    const helpBtn = page.locator('#featuresGuideBtn')
    await expect(helpBtn).toBeVisible()

    // Click Help button
    await helpBtn.click()

    // Modal should open
    const modal = page.locator('#featuresGuideModal')
    await expect(modal).not.toHaveClass(/hidden/)

    // Modal should have proper ARIA attributes
    await expect(modal).toHaveAttribute('role', 'dialog')
    await expect(modal).toHaveAttribute('aria-modal', 'true')
  })
  
  test('should close Features Guide on Escape key', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await loadSample(page)

    // Open modal
    const helpBtn = page.locator('#featuresGuideBtn')
    await helpBtn.click()

    const modal = page.locator('#featuresGuideModal')
    await expect(modal).not.toHaveClass(/hidden/)

    // Press Escape
    await page.keyboard.press('Escape')

    // Modal should close
    await expect(modal).toHaveClass(/hidden/)
  })
  
  test('should close Features Guide on close button click', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await loadSample(page)

    // Open modal
    const helpBtn = page.locator('#featuresGuideBtn')
    await helpBtn.click()

    const modal = page.locator('#featuresGuideModal')
    await expect(modal).not.toHaveClass(/hidden/)

    // Click close button
    const closeBtn = page.locator('#featuresGuideClose')
    await closeBtn.click()

    // Modal should close
    await expect(modal).toHaveClass(/hidden/)
  })
  
  test('should navigate tabs with arrow keys', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await loadSample(page)

    // Open modal
    const helpBtn = page.locator('#featuresGuideBtn')
    await helpBtn.click()

    // First tab should be focused and selected
    const librariesTab = page.locator('#tab-libraries')
    await expect(librariesTab).toHaveAttribute('aria-selected', 'true')
    await expect(librariesTab).toHaveAttribute('tabindex', '0')

    // Focus first tab
    await librariesTab.focus()

    // Press ArrowRight to move to next tab
    await page.keyboard.press('ArrowRight')

    // Second tab should be focused
    const colorsTab = page.locator('#tab-colors')
    const isFocused = await colorsTab.evaluate(el => el === document.activeElement)
    expect(isFocused).toBe(true)

    // Press Enter to activate
    await page.keyboard.press('Enter')

    // Second tab should be selected
    await expect(colorsTab).toHaveAttribute('aria-selected', 'true')

    // Press ArrowLeft to go back
    await page.keyboard.press('ArrowLeft')

    // First tab should be focused again
    const isLibrariesFocused = await librariesTab.evaluate(el => el === document.activeElement)
    expect(isLibrariesFocused).toBe(true)
  })
  
  test('should have proper tab ARIA attributes', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await loadSample(page)

    // Open modal
    const helpBtn = page.locator('#featuresGuideBtn')
    await helpBtn.click()

    // Check all tabs have proper attributes
    const tabs = page.locator('.features-tab')
    const tabCount = await tabs.count()

    // A zero-tab modal would walk this loop zero times and pass, asserting
    // nothing.
    expect(tabCount).toBeGreaterThan(0)

    for (let i = 0; i < tabCount; i++) {
      const tab = tabs.nth(i)

      // Should have role="tab"
      await expect(tab).toHaveAttribute('role', 'tab')

      // Should have aria-controls pointing to a panel
      const ariaControls = await tab.getAttribute('aria-controls')
      expect(ariaControls).toBeTruthy()

      // Panel should exist
      const panel = page.locator(`#${ariaControls}`)
      await expect(panel).toHaveAttribute('role', 'tabpanel')

      // Panel should have aria-labelledby pointing back to tab
      const tabId = await tab.getAttribute('id')
      await expect(panel).toHaveAttribute('aria-labelledby', tabId)
    }
  })
  
  test('should open from welcome screen "Learn more" button', async ({ page }) => {
    await page.goto('/')
    
    // "Learn More" buttons live on the welcome screen role cards
    const learnMoreBtn = page.locator('.btn-role-learn').first()
    await expect(learnMoreBtn).toBeVisible()
    
    // Click it
    await learnMoreBtn.click()
    
    // Modal should open - wait for it to be visible (class hidden should be removed)
    const modal = page.locator('#featuresGuideModal')
    await expect(modal).toBeVisible({ timeout: 5000 })
    
    console.log('Features Guide opened from welcome screen')
  })
})


test.describe('Features Guide focus', () => {
  // The guide focuses its tab once the dialog shows, and tries again 100 ms
  // later for a browser that dropped the first focus. The second try must not
  // pull focus back from a tab the person has already moved to. No model is
  // loaded, so this runs on CI too.
  test('a tab moved to before the second focus try keeps the focus', async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => typeof window.openFeaturesGuide === 'function')
    const focused = await page.evaluate(async () => {
      const frame = () => new Promise((resolve) => requestAnimationFrame(resolve))
      // The dialog queues its first focus for the next frame while it opens;
      // this frame callback is queued after it, so the focus has landed.
      document.getElementById('featuresGuideBtn').click()
      await frame()
      const first = document.activeElement?.id
      document.activeElement.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })
      )
      await new Promise((resolve) => setTimeout(resolve, 300))
      return { first, last: document.activeElement?.id }
    })
    expect(focused).toEqual({ first: 'tab-libraries', last: 'tab-colors' })
  })
})
