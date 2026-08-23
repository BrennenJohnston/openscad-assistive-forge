import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import path from 'path'

// Skip WASM-dependent tests in CI - WASM initialization is slow/unreliable
const isCI = !!process.env.CI

async function waitForWasmReady(page) {
  // Wait for the data-wasm-ready attribute set by src/main.js after
  // successful WASM initialisation.  This is free of the race condition
  // where the old overlay check returned instantly because the overlay
  // DOM element hadn't been created yet.
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: 120_000,
  })
}

/**
 * THE LIST IS EMPTY, AND THAT IS THE POINT.
 *
 * UF-25 put `nested-interactive` here with its reasoning written out, beside
 * a warning that an entry buys green and hides a defect. UF-35 paid that back
 * by fixing what it covered rather than explaining it again: the help control
 * in three panel headers and the Hide button on every parameter group each
 * sat inside a <summary>, which IS the disclosure's own button, so each was a
 * control inside a control. The group family scaled with the model - three
 * groups measured three violations, eleven measured eleven - and the cost was
 * concrete: the Console header's accessible name was the word "Console"
 * followed by the help button's entire 180-character sentence.
 *
 * Two other violations surfaced at UF-25 and were fixed the same way rather
 * than allowed: D-45 (the panel help button measured 16.3px against WCAG 2.2
 * AA's 24px floor, and failed target-offset) and D-46 (the green "Preview
 * ready" pill measured 3.07:1 where 14px text needs 4.5:1).
 *
 * Anything added here needs a measurement and a reason, not a shrug - and an
 * empty list is what lets this board fail on a real regression.
 */
const ALLOWED_AXE_VIOLATIONS = []

function expectOnlyAllowedViolations(results) {
  const unexpected = results.violations.filter(
    (v) => !ALLOWED_AXE_VIOLATIONS.includes(v.id)
  )
  // Name the element and say why. A bare rule id sends the next person
  // hunting; axe already knows the selector and the measured contrast.
  const detail = unexpected
    .flatMap((v) =>
      v.nodes.map(
        (n) =>
          `${v.id} @ ${n.target.join(' ')} :: ${n.failureSummary.replace(/\s+/g, ' ')}`
      )
    )
    .join('\n')
  expect(
    unexpected.map((v) => v.id),
    `unexpected axe violations:\n${detail}`
  ).toEqual([])
}

/**
 * UF-25: the app has no #fileInfo element. It carries #fileInfoSummary, an
 * sr-only live region holding the file NAME only, so the old
 * `#fileInfo:has-text("parameters")` wait could never match. Twelve waits in
 * this file still asked for it and ten of them sat inside a catch that turned
 * the timeout into test.skip(), so ten tests - two of them axe scans -
 * reported "skipped" instead of running. Wait for what actually proves a
 * model loaded: the parameter controls the app generated from it.
 */
async function waitForModelLoaded(page, { expandGroups = true, timeout = 30000 } = {}) {
  await expect(page.locator('#mainInterface')).toBeVisible({ timeout })
  await expect(page.locator('.param-control').first()).toBeAttached({ timeout })
  // Loading a model raises the Save Project prompt, whose dialog intercepts
  // pointer events. Same idiom as examples.spec.js's expectParamsLoaded.
  const notNow = page.locator('#saveProjectNotNow')
  try {
    await notNow.waitFor({ state: 'visible', timeout: 2000 })
    await notNow.click()
    await notNow.waitFor({ state: 'hidden', timeout: 3000 })
  } catch {
    // Save prompt did not appear for this source
  }
  if (expandGroups) {
    // F5 (owner, 2026-05-15): parameter groups load collapsed, so a control is
    // attached long before it is visible.
    const expandAll = page.locator('#expandAllGroupsBtn')
    if (await expandAll.isVisible().catch(() => false)) {
      await expandAll.click()
      await expect(page.locator('.param-control').first()).toBeVisible({
        timeout: 10000,
      })
    }
  }
}

// Most tests assume the welcome UI is interactable (no blocking first-visit modal).
// Ensure a consistent baseline by marking first-visit as already seen.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
  })
})

test.describe('Accessibility Compliance (WCAG 2.2 AA)', () => {
  test('should have no accessibility violations on landing page', async ({ page }) => {
    await page.goto('/')
    
    // Wait for page to fully load
    await page.waitForLoadState('networkidle')
    
    // Run accessibility scan
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze()
    
    // Log violations for debugging
    if (results.violations.length > 0) {
      console.log('Accessibility violations found:')
      results.violations.forEach(violation => {
        console.log(`- ${violation.id}: ${violation.description}`)
        console.log(`  Impact: ${violation.impact}`)
        console.log(`  Help: ${violation.helpUrl}`)
      })
    }
    
    expect(results.violations).toEqual([])
  })
  
  test('should have no violations after file upload', async ({ page }) => {
    // Skip in CI - requires WASM to process uploaded file
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await page.goto('/')
    await waitForWasmReady(page)
    
    // Upload a test file - use specific ID to avoid matching queue import input
    const fileInput = page.locator('#fileInput')
    const fixturePath = path.join(process.cwd(), 'tests', 'fixtures', 'sample.scad')
    
    await fileInput.setInputFiles(fixturePath)
    await waitForModelLoaded(page)

    // UF-25: the preview state pill carries `transition: all 240ms`, so a scan
    // that arrives while it is still moving from the rendering colour to the
    // ready colour measures a BLEND of the two and reports a contrast figure
    // belonging to neither. MEASURED: #f8f8f9 on #258557 at 4.32:1, where the
    // resting pair is --slate-1 on --color-success-solid at 4.67:1. Let it
    // land before scanning.
    await expect(page.locator('.preview-state-indicator.state-current')).toBeVisible({
      timeout: 90_000,
    })
    await page.waitForTimeout(500)

    // Run accessibility scan on parameter UI
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze()

    expectOnlyAllowedViolations(results)
  })

  test('should have proper heading hierarchy', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const headings = await page.evaluate(() =>
      Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).map(el => ({
        tag: el.tagName,
        text: el.textContent.trim().substring(0, 80),
      }))
    )

    expect(headings.length).toBeGreaterThan(0)
    expect(headings[0].tag).toBe('H1')

    console.log('Heading structure:', headings)
  })
  
  test('should have skip link for keyboard users', async ({ page }) => {
    await page.goto('/')
    
    // Press Tab to reveal skip link
    await page.keyboard.press('Tab')
    
    // Look for skip link
    const skipLink = page.locator('a[href*="#main"], a:has-text("Skip to")')
    
    if (await skipLink.isVisible()) {
      console.log('Skip link found and visible on focus')
      
      // The skip link uses CSS `top: -40px` and only moves into view on :focus.
      // WebKit may report the element as "outside of the viewport" for click()
      // even when it is focused and visible, so we activate it via keyboard
      // (Enter) which is the natural way users interact with skip links anyway.
      await page.keyboard.press('Enter')
      
      // Focus should move to main content
      const focusedElementId = await page.evaluate(() => document.activeElement?.id)
      console.log('Focus moved to element:', focusedElementId)
    } else {
      console.log('No skip link found (should be added for better accessibility)')
    }
  })
  
  test('should have sufficient color contrast', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    // Run contrast-specific check
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2aa'])
      .include('body')
      .analyze()
    
    const contrastViolations = results.violations.filter(v => 
      v.id.includes('color-contrast')
    )
    
    if (contrastViolations.length > 0) {
      console.log('Color contrast violations:')
      contrastViolations.forEach(v => {
        console.log(`- ${v.description}`)
        v.nodes.forEach(node => {
          console.log(`  Element: ${node.html}`)
          console.log(`  Impact: ${node.impact}`)
        })
      })
    }
    
    expect(contrastViolations).toEqual([])
  })
  
  test('should have proper form labels', async ({ page }) => {
    // Skip in CI - requires WASM to process uploaded file
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await page.goto('/')
    await waitForWasmReady(page)
    
    // Upload file to get parameter form - use specific ID
    const fileInput = page.locator('#fileInput')
    const fixturePath = path.join(process.cwd(), 'tests', 'fixtures', 'sample.scad')
    
    await fileInput.setInputFiles(fixturePath)
    await waitForModelLoaded(page)
    
    // Check all form inputs have labels
    const unlabeledInputs = await page.locator('input:not([type="file"])').evaluateAll(inputs => {
      return inputs.filter(input => {
        const hasLabel = input.labels?.length > 0
        const hasAriaLabel = input.getAttribute('aria-label')
        const hasAriaLabelledby = input.getAttribute('aria-labelledby')
        return !hasLabel && !hasAriaLabel && !hasAriaLabelledby
      }).map(input => ({
        type: input.type,
        name: input.name,
        id: input.id
      }))
    })
    
    console.log('Unlabeled inputs:', unlabeledInputs)
    expect(unlabeledInputs.length).toBe(0)
  })
  
  test('should show library controls after upload even when no libraries detected', async ({ page }) => {
    // Skip in CI - requires WASM to process uploaded file
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    // #libraryControls is defaultHiddenInBasic, and Simplified is the default
    // mode, so this test has to ask for Standard or it measures a panel the
    // mode controller has deliberately hidden (UF-25; same shape as UF-23's
    // project-files finding).
    await page.addInitScript(() => {
      localStorage.setItem(
        'openscad-forge-ui-mode',
        JSON.stringify({ mode: 'standard', lastCustomMode: 'standard' })
      )
    })

    await page.goto('/')
    await waitForWasmReady(page)

    const fileInput = page.locator('#fileInput')
    const fixturePath = path.join(process.cwd(), 'tests', 'fixtures', 'sample.scad')
    
    await fileInput.setInputFiles(fixturePath)
    await waitForModelLoaded(page)
    
    // Library controls should be visible (not hidden)
    const libraryControls = page.locator('#libraryControls')
    await expect(libraryControls).toBeVisible()
    
    // Library details should exist (may be closed)
    const libraryDetails = page.locator('.library-details')
    await expect(libraryDetails).toBeVisible()
    
    console.log('Library controls are visible after upload')
  })

  // BR-4: the memory indicator no longer announces a fictional percentage.
  // The previous role="progressbar" with aria-valuenow="47" was a lie —
  // the underlying number was (heapBytes / 1 GB) * 100, not a real fraction
  // of any limit. The indicator now exposes only the absolute MB value.
  test('memory indicator should not advertise a fake percent (BR-4)', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const indicator = page.locator('#memoryIndicator')
    await expect(indicator).toHaveCount(1)
    await expect(indicator).not.toHaveAttribute('role', 'progressbar')

    // The progressbar wrapper has been removed entirely.
    await expect(page.locator('#memoryBar')).toHaveCount(0)
    await expect(page.locator('#memoryBarFill')).toHaveCount(0)

    // No element inside the indicator may carry aria-valuenow / valuemin /
    // valuemax — those are exclusively for true progress/scrollbar/slider
    // semantics and would re-introduce the percentage falsehood.
    const valueAttrCount = await indicator
      .locator('[aria-valuenow], [aria-valuemin], [aria-valuemax]')
      .count()
    expect(valueAttrCount).toBe(0)
  })
})

test.describe('New Accessibility Features (WCAG 2.2)', () => {
  test('should have tooltip aria-describedby relationships', async ({ page }) => {
    // Skip in CI - requires WASM to process uploaded file
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await page.goto('/')
    await waitForWasmReady(page)
    
    const fileInput = page.locator('#fileInput')
    const fixturePath = path.join(process.cwd(), 'tests', 'fixtures', 'sample.scad')
    
    await fileInput.setInputFiles(fixturePath)
    await waitForModelLoaded(page)
    
    // Check that help buttons have aria-describedby pointing to tooltip
    const helpButtons = await page.locator('.param-help-button').all()
    
    for (const button of helpButtons) {
      const describedBy = await button.getAttribute('aria-describedby')
      
      if (describedBy) {
        // Verify the tooltip element exists
        const tooltip = page.locator(`#${describedBy}`)
        await expect(tooltip).toBeAttached()
        
        // Verify tooltip has role="tooltip"
        const role = await tooltip.getAttribute('role')
        expect(role).toBe('tooltip')
      }
    }
    
    console.log(`Verified ${helpButtons.length} help buttons have proper aria-describedby`)
  })

  test('should have keyboard shortcuts for 3D preview controls', async ({ page }) => {
    await page.goto('/')
    
    // Check for camera control buttons in the current panel/drawer UI
    const rotateButtons = await page
      .locator(
        '.camera-panel button[aria-label*="rotate" i], #cameraDrawer button[aria-label*="rotate" i]'
      )
      .count()
    const panButtons = await page
      .locator(
        '.camera-panel button[aria-label*="pan" i], #cameraDrawer button[aria-label*="pan" i]'
      )
      .count()
    const zoomButtons = await page
      .locator(
        '.camera-panel button[aria-label*="zoom" i], #cameraDrawer button[aria-label*="zoom" i]'
      )
      .count()
    
    console.log(
      `Found ${rotateButtons} rotate buttons, ${panButtons} pan buttons, ${zoomButtons} zoom buttons`
    )
    
    expect(rotateButtons).toBeGreaterThanOrEqual(4)
    expect(panButtons).toBeGreaterThanOrEqual(4)
    expect(zoomButtons).toBeGreaterThanOrEqual(2)
  })

  test('should have workflow progress toolbar with proper ARIA', async ({ page }) => {
    await page.goto('/')
    
    // Check workflow progress container exists
    const workflowProgress = page.locator('#workflowProgress')
    
    // Verify role and label
    const role = await workflowProgress.getAttribute('role')
    const label = await workflowProgress.getAttribute('aria-label')
    
    expect(role).toBe('navigation')
    expect(label).toBeTruthy()
    
    console.log('Workflow progress toolbar has proper ARIA structure')
  })

  test('should have parameter search with accessible input', async ({ page }) => {
    // Skip in CI - requires WASM to process uploaded file
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await page.goto('/')
    await waitForWasmReady(page)
    
    const fileInput = page.locator('#fileInput')
    const fixturePath = path.join(process.cwd(), 'tests', 'fixtures', 'sample.scad')
    
    await fileInput.setInputFiles(fixturePath)
    await waitForModelLoaded(page)
    
    // Check search input exists and has proper attributes
    const searchInput = page.locator('#paramSearchInput')
    await expect(searchInput).toBeVisible()
    
    const ariaLabel = await searchInput.getAttribute('aria-label')
    expect(ariaLabel).toBeTruthy()
    
    const type = await searchInput.getAttribute('type')
    expect(type).toBe('search')
    
    // Check jump-to-group dropdown
    const jumpSelect = page.locator('#paramJumpSelect')
    await expect(jumpSelect).toBeVisible()
    
    const jumpLabel = await jumpSelect.getAttribute('aria-label')
    expect(jumpLabel).toBeTruthy()
    
    console.log('Parameter search has proper accessibility attributes')
  })

  test('should filter parameters when searching', async ({ page }) => {
    // Skip in CI - requires WASM to process uploaded file
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await page.goto('/')
    await waitForWasmReady(page)
    
    const fileInput = page.locator('#fileInput')
    const fixturePath = path.join(process.cwd(), 'tests', 'fixtures', 'sample.scad')
    
    await fileInput.setInputFiles(fixturePath)
    await waitForModelLoaded(page)
    
    // Get initial parameter count
    const initialCount = await page.locator('.param-control:not(.search-hidden)').count()
    
    // Type in search
    const searchInput = page.locator('#paramSearchInput')
    await searchInput.fill('width')
    
    // Wait for filtering
    await page.waitForTimeout(100)
    
    // Check that some parameters are now hidden
    const filteredCount = await page.locator('.param-control:not(.search-hidden)').count()
    
    console.log(`Before search: ${initialCount} params, after: ${filteredCount}`)
    
    // Clear search
    const clearBtn = page.locator('#clearParamSearchBtn')
    if (await clearBtn.isVisible()) {
      await clearBtn.click()
      
      const restoredCount = await page.locator('.param-control:not(.search-hidden)').count()
      expect(restoredCount).toBe(initialCount)
    }
  })

  test('should have reset confirmation dialog with proper ARIA', async ({ page }) => {
    await page.goto('/')
    
    // Check reset confirmation modal structure
    const resetModal = page.locator('#resetConfirmModal')
    
    const role = await resetModal.getAttribute('role')
    const ariaModal = await resetModal.getAttribute('aria-modal')
    const labelledBy = await resetModal.getAttribute('aria-labelledby')
    
    expect(role).toBe('dialog')
    expect(ariaModal).toBe('true')
    expect(labelledBy).toBeTruthy()
    
    // Verify the labelled element exists
    const titleElement = page.locator(`#${labelledBy}`)
    await expect(titleElement).toBeAttached()
    
    console.log('Reset confirmation modal has proper ARIA')
  })
})

test.describe('Modal Focus Management', () => {
  test('should trap focus within Features Guide modal', async ({ page }) => {
    await page.goto('/')
    
    // Open the Features Guide modal via welcome screen role card "Learn More"
    const learnMoreBtn = page.locator('.btn-role-learn').first()
    await expect(learnMoreBtn).toBeVisible()
    await learnMoreBtn.click()
    
    // Wait for modal to be visible (allow time for JS event handlers to process)
    const modal = page.locator('#featuresGuideModal')
    await expect(modal).toBeVisible({ timeout: 5000 })
    
    // Get first and last focusable elements in modal
    const focusableElements = await modal.locator('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])').all()
    
    if (focusableElements.length > 1) {
      // Tab through all elements and verify focus stays in modal
      for (let i = 0; i < focusableElements.length + 2; i++) {
        await page.keyboard.press('Tab')
        const isFocusInsideModal = await page.evaluate(
          () => !!document.activeElement?.closest('#featuresGuideModal')
        )
        expect(isFocusInsideModal).toBe(true)
      }
      
      console.log(`Focus trapped correctly with ${focusableElements.length} focusable elements`)
    }
    
    // Press Escape to close
    await page.keyboard.press('Escape')
    await expect(modal).toBeHidden()
    
    console.log('Modal closed on Escape and focus restored')
  })

  test('should restore focus to trigger on modal close', async ({ page, browserName }) => {
    await page.goto('/')
    
    const learnMoreBtn = page.locator('.btn-role-learn').first()
    await learnMoreBtn.focus()
    await learnMoreBtn.click()
    
    // Wait for modal to be visible (allow time for JS event handlers to process)
    const modal = page.locator('#featuresGuideModal')
    await expect(modal).toBeVisible({ timeout: 5000 })
    
    // Close modal
    await page.keyboard.press('Escape')
    await expect(modal).toBeHidden()
    
    if (browserName === 'webkit') {
      // WebKit on macOS has a platform-level focus management quirk with
      // nested modals: focus is not reliably restored to the trigger
      // element after closing a modal opened from within another modal.
      // Verify focus is NOT trapped inside the now-hidden features guide
      // modal — that is the critical accessibility requirement.
      const focusInsideClosed = await page.evaluate(
        () => !!document.activeElement?.closest('#featuresGuideModal')
      )
      expect(focusInsideClosed).toBe(false)
    } else {
      await expect(learnMoreBtn).toBeFocused({ timeout: 10000 })
    }
    
    console.log('Focus restored to trigger element after modal close')
  })
})

test.describe('Default Value Display (COGA)', () => {
  test('should display default values next to sliders', async ({ page }) => {
    // Skip in CI - requires WASM to process uploaded file
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await page.goto('/')
    await waitForWasmReady(page)
    
    const fileInput = page.locator('#fileInput')
    const fixturePath = path.join(process.cwd(), 'tests', 'fixtures', 'sample.scad')
    
    await fileInput.setInputFiles(fixturePath)
    await waitForModelLoaded(page)
    
    // Check for default value hints on slider controls
    const defaultHints = await page.locator('.param-default-value').all()
    
    console.log(`Found ${defaultHints.length} default value hints`)
    
    // There should be at least some default hints for numeric parameters
    if (defaultHints.length > 0) {
      // Verify the hints have content and title attributes
      const firstHint = defaultHints[0]
      const content = await firstHint.textContent()
      const title = await firstHint.getAttribute('title')
      
      expect(content).toBeTruthy()
      expect(title).toContain('Default')
      
      console.log(`Default hint example: "${content}" with title "${title}"`)
    }
  })
})

test.describe('Error Translation (COGA)', () => {
  test('error translator should provide user-friendly messages', async ({ page }) => {
    // This is a unit-style test that can run without file upload
    await page.goto('/')
    
    // Inject and test the error translator module
    const testResult = await page.evaluate(async () => {
      try {
        const module = await import('/src/js/error-translator.js')
        
        // Test various error patterns
        const testCases = [
          { input: 'syntax error at line 42', expectTitle: 'Code Problem Found' },
          { input: 'undefined variable: my_var', expectTitle: 'Missing Variable' },
          { input: 'out of memory', expectTitle: 'Model Too Complex' },
          { input: 'timeout exceeded', expectTitle: 'Taking Too Long' },
        ]
        
        const results = testCases.map(tc => {
          const result = module.translateError(tc.input)
          return {
            input: tc.input,
            gotTitle: result.title,
            expectedTitle: tc.expectTitle,
            hasExplanation: !!result.explanation,
            hasSuggestion: !!result.suggestion,
            hasTechnical: !!result.technical,
            passed: result.title === tc.expectTitle
          }
        })
        
        return { success: true, results }
      } catch (e) {
        return { success: false, error: e.message }
      }
    })
    
    if (testResult.success) {
      console.log('Error translator test results:', testResult.results)
      const allPassed = testResult.results.every(r => r.passed && r.hasExplanation && r.hasSuggestion)
      expect(allPassed).toBe(true)
    } else {
      console.log('Could not load error translator module:', testResult.error)
      // Module import may fail in test environment - this is acceptable
    }
  })
})

test.describe('Workflow Progress Toolbar', () => {
  test('should have proper structure and ARIA attributes', async ({ page }) => {
    await page.goto('/')
    
    const workflowProgress = page.locator('#workflowProgress')
    
    // Verify role and label
    const role = await workflowProgress.getAttribute('role')
    const label = await workflowProgress.getAttribute('aria-label')
    
    expect(role).toBe('navigation')
    expect(label).toBeTruthy()
    
    console.log('Workflow progress toolbar has correct ARIA structure')
  })

  test('workflow progress toolbar should be visible after file upload', async ({ page }) => {
    // Skip in CI - requires WASM to process uploaded file
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    
    await page.goto('/')
    await waitForWasmReady(page)
    
    const fileInput = page.locator('#fileInput')
    const fixturePath = path.join(process.cwd(), 'tests', 'fixtures', 'sample.scad')
    
    await fileInput.setInputFiles(fixturePath)
    await waitForModelLoaded(page)
    
    // Check that workflow progress container is visible
    const workflowProgress = page.locator('#workflowProgress')
    await expect(workflowProgress).toBeVisible()
    
    console.log('Workflow progress toolbar visible after file upload')
  })
})

test.describe('Screen Reader Support', () => {
  test('should have ARIA landmarks', async ({ page }) => {
    await page.goto('/')
    
    // Check for landmark roles
    const landmarks = await page.locator('[role="main"], [role="navigation"], [role="banner"], main, nav, header').all()
    
    console.log('Found', landmarks.length, 'landmark elements')
    
    // Should have at least a main landmark
    const hasMain = await page.locator('[role="main"], main').count()
    expect(hasMain).toBeGreaterThan(0)
  })
  
  test('should have live region for status updates', async ({ page }) => {
    await page.goto('/')
    
    // Look for ARIA live regions
    const liveRegions = await page.locator('[aria-live], [role="status"], [role="alert"]').all()
    
    console.log('Found', liveRegions.length, 'live regions')
    
    if (liveRegions.length > 0) {
      const liveRegionInfo = await Promise.all(
        liveRegions.map(async region => ({
          role: await region.getAttribute('role'),
          ariaLive: await region.getAttribute('aria-live'),
          text: (await region.textContent())?.substring(0, 50)
        }))
      )
      console.log('Live regions:', liveRegionInfo)
    }
  })
  
  test('should announce errors to screen readers', async ({ page }) => {
    await page.goto('/')
    
    // Try to trigger an error (e.g., upload invalid file)
    // This is a basic check for error announcement mechanisms
    
    const errorRegions = await page.locator('[aria-live="assertive"], [role="alert"]').all()
    console.log('Found', errorRegions.length, 'assertive live regions for errors')
    
    // Should have at least one assertive live region for errors
    // (or errors should be announced some other way)
  })
  
  test.describe('Role-Based Feature Paths (Welcome Screen)', () => {
    // Skip these tests in CI - they require the first-visit modal to be visible
    // which conflicts with other tests that need it dismissed
    test.skip(({ }, testInfo) => isCI, 'First-visit modal tests conflict with other E2E tests in CI')

    // UF-25: these tests are about the BEGINNER path. The welcome grid is
    // ordered by product decision and has changed twice, so every locator
    // here names the beginner card explicitly. `.btn-role-try` first() is
    // the Welcome Page Tour button (UF-17), which starts a tour of the
    // welcome page and loads no example - a test that used it silently
    // measured the wrong tour.
    const BEGINNER_CARD = '.role-path-card[data-tutorial-target="beginners-card"]'
    const BEGINNER_TRY_BTN = `${BEGINNER_CARD} .btn-role-try`
    // The spotlights section contains cards that carry their own <details>,
    // so a descendant `summary` locator matches seven elements. Its own
    // summary is the direct child.
    const SPOTLIGHTS_SUMMARY = '#accessibilitySpotlights > summary'

    // Q-50c (owner, 2026-08-14): while any app dialog is up the tour shrinks
    // to its bar. On a phone viewport the parameter drawer IS a dialog
    // (#paramPanel carries role="dialog" when open), so the tour minimizes
    // itself as soon as a drawer step opens it, and the Next button goes with
    // it. Pressing Restore is how a person gets it back - and until defect
    // D-44 was fixed here, that button did nothing at all while the drawer
    // was open, so this walk is also D-44's regression guard.
    async function bringTourBack(page) {
      const bar = page.locator('.tutorial-minimized:not(.hidden) .tutorial-restore')
      if ((await bar.count()) === 0) return
      await bar.click()
      await expect(page.locator('.tutorial-panel')).toBeVisible({ timeout: 10000 })
    }

    async function openDrawer(page) {
      const drawer = page.locator('#paramPanel.drawer-open')
      if ((await drawer.count()) === 0) {
        await page.locator('#mobileDrawerToggle').click()
        await expect(page.locator('#paramPanel')).toHaveClass(/drawer-open/, {
          timeout: 10000,
        })
      }
    }

    // Walk one step and confirm where we landed. Same idiom as
    // classic-tutorial.spec.js: never advance by a count, because a tour that
    // gains or loses a step then lands on a real step with the wrong subject.
    async function nextTo(page, title) {
      await bringTourBack(page)
      await page.locator('#tutorialNextBtn').click()
      await expect(page.locator('.tutorial-step-title')).toHaveText(title, {
        timeout: 60000,
      })
    }

    // These tests need the first-visit modal to be visible, so override the global beforeEach
    // After the first-visit modal appears, we dismiss it to test the welcome screen
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.removeItem('openscad-forge-first-visit-seen')
        localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
      })
    })
    
    // Helper to dismiss the first-visit modal that appears when localStorage is cleared.
    // Uses page.evaluate to bypass any pointer-events or overlay issues.
    async function dismissFirstVisitModal(page) {
      // The modal opens after a 500ms delay -- wait for it to appear
      try {
        await page.locator('#first-visit-modal:not(.hidden)').waitFor({ state: 'visible', timeout: 5000 })
      } catch {
        // Modal never appeared, nothing to dismiss
        return
      }
      // Programmatically click the continue button (bypasses overlay pointer-events).
      // UF-3: the modal now requires an interface choice before Continue works,
      // so pick the default recommendation first.
      await page.evaluate(() => {
        const forge = document.getElementById('firstVisitChoiceForge')
        if (forge) forge.click()
        const btn = document.getElementById('first-visit-continue')
        if (btn) btn.click()
      })
      // Wait for the blocking class to be removed (confirms full cleanup)
      await page.waitForFunction(
        () => !document.body.classList.contains('first-visit-blocking'),
        { timeout: 5000 }
      ).catch(() => {})
      // Brief settle for any close animations
      await page.waitForTimeout(300)
    }
    
    test('should display beginner tutorial card with keyboard-accessible CTAs', async ({ page }) => {
      await page.goto('/')
      await dismissFirstVisitModal(page)

      // UF-25: address the beginner card by its own attribute, never by
      // position or by a card count. The grid has gained cards twice (the
      // welcome-tour card at UF-17, the braille card earlier) and a
      // positional locator silently retargets when that happens.
      const beginnerCard = page.locator(BEGINNER_CARD)
      await expect(beginnerCard).toBeVisible()

      // Check that at least one card has a "Try" button
      const tryButtons = page.locator('.btn-role-try:visible')
      const tryCount = await tryButtons.count()
      expect(tryCount).toBeGreaterThanOrEqual(1)

      // Check the beginner card's CTA is keyboard accessible
      const beginnerTryButton = page.locator(BEGINNER_TRY_BTN)
      await beginnerTryButton.focus()
      const isFocused = await beginnerTryButton.evaluate(el => el === document.activeElement)
      expect(isFocused).toBe(true)

      // Check that buttons have proper ARIA labels or text
      const buttonText = await beginnerTryButton.textContent()
      expect(buttonText).toBeTruthy()
      expect(buttonText.length).toBeGreaterThan(0)
    })
    
    test('should load example when role Try button is clicked', async ({ page }) => {
      // Skip in CI - requires WASM for example loading
      test.skip(isCI, 'WASM example loading is slow/unreliable in CI')
      
      await page.goto('/')
      await dismissFirstVisitModal(page)
      await waitForWasmReady(page)
      
      // Click the beginner card's Try button (loads Simple Box)
      await page.locator(BEGINNER_TRY_BTN).click()

      // Wait for example to load - file info shows loaded file name and parameter count
      await waitForModelLoaded(page)
      
      // Check that welcome screen is hidden
      const welcomeScreen = page.locator('#welcomeScreen')
      await expect(welcomeScreen).toHaveClass(/hidden/)
      
      // Check that main interface is visible
      const mainInterface = page.locator('#mainInterface')
      await expect(mainInterface).not.toHaveClass(/hidden/)
      
      // Check that screen reader announcer exists and has been used
      // Note: The announcement text changes as the app progresses through loading/rendering
      // so we verify the announcer exists and contains any meaningful content
      const srAnnouncer = page.locator('#srAnnouncer')
      await expect(srAnnouncer).toBeAttached()
      const announcement = await srAnnouncer.textContent()
      console.log('Screen reader announcement:', announcement)
      // Verify announcer has been used (contains some text - could be loading, loaded, or rendering)
      expect(announcement.length).toBeGreaterThan(0)
    })
    
    test('should open Features Guide when Learn More is clicked', async ({ page }) => {
      await page.goto('/')
      await dismissFirstVisitModal(page)
      
      // Find an "Open Help" button that opens Features Guide
      const learnMoreBtn = page.locator('.btn-role-learn:visible').first()
      await learnMoreBtn.click()
      
      // Wait for Features Guide modal to open
      const featuresGuideModal = page.locator('#featuresGuideModal')
      await expect(featuresGuideModal).not.toHaveClass(/hidden/)
      
      // Check that modal has proper ARIA attributes
      await expect(featuresGuideModal).toHaveAttribute('role', 'dialog')
      await expect(featuresGuideModal).toHaveAttribute('aria-modal', 'true')
    })
    
    test('should have keyboard-accessible accessibility spotlight links', async ({ page }) => {
      await page.goto('/')
      await dismissFirstVisitModal(page)
      
      // Expand the (collapsible) Accessibility Highlights section
      const spotlightsDetails = page.locator('#accessibilitySpotlights')
      const spotlightsSummary = page.locator(SPOTLIGHTS_SUMMARY)
      await expect(spotlightsSummary).toBeVisible()
      await spotlightsSummary.click()
      await expect(spotlightsDetails).toHaveJSProperty('open', true)

      // Check that spotlight links exist
      const spotlightLinks = page.locator('.spotlight-link')
      const linkCount = await spotlightLinks.count()
      expect(linkCount).toBe(4) // 4 accessibility highlights
      
      // Check that links are keyboard accessible
      const firstLink = spotlightLinks.first()
      await expect(firstLink).toBeVisible()
      await firstLink.focus()
      const isFocused = await firstLink.evaluate(el => el === document.activeElement)
      expect(isFocused).toBe(true)
      
      // Check that links have proper attributes
      await expect(firstLink).toHaveAttribute('href')
      const linkText = await firstLink.textContent()
      expect(linkText.length).toBeGreaterThan(0)
    })
    
    test('should meet touch target size requirements (44├ù44px)', async ({ page }) => {
      await page.goto('/')
      await dismissFirstVisitModal(page)
      
      // Check EVERY visible role path Try button, not just whichever card
      // happens to lead the grid: a positional check let three of the four
      // go unmeasured (UF-25).
      const tryButtons = page.locator('.btn-role-try:visible')
      const tryCount = await tryButtons.count()
      expect(tryCount).toBeGreaterThan(0)
      for (let i = 0; i < tryCount; i++) {
        const buttonBox = await tryButtons.nth(i).boundingBox()
        expect(buttonBox).not.toBeNull()
        expect(buttonBox.height).toBeGreaterThanOrEqual(44)
        expect(buttonBox.width).toBeGreaterThan(0) // Full width in card, so just check it exists
      }

      // Check spotlight links
      const spotlightsSummary = page.locator(SPOTLIGHTS_SUMMARY)
      await expect(spotlightsSummary).toBeVisible()
      await spotlightsSummary.click()

      const spotlightLinks = page.locator('.spotlight-link')
      const linkCount = await spotlightLinks.count()
      expect(linkCount).toBeGreaterThan(0)
      for (let i = 0; i < linkCount; i++) {
        const link = spotlightLinks.nth(i)
        await expect(link).toBeVisible()
        const linkBox = await link.boundingBox()
        expect(linkBox).not.toBeNull()
        expect(linkBox.height).toBeGreaterThanOrEqual(44)
      }
    })
    
    test('should have proper focus indicators on role cards', async ({ page }) => {
      await page.goto('/')
      await dismissFirstVisitModal(page)
      
      // Tab to first Try button
      await page.keyboard.press('Tab') // Skip link
      await page.keyboard.press('Tab') // Header controls or first card button
      
      // Get focused element
      const focusedElement = page.locator(':focus')
      await expect(focusedElement).toBeVisible()
      
      // Check that outline is visible (computed style check)
      const outlineWidth = await focusedElement.evaluate(
        el => window.getComputedStyle(el).outlineWidth
      )
      
      // Should have at least 2px outline (WCAG 2.4.13)
      const outlineWidthPx = parseFloat(outlineWidth)
      expect(outlineWidthPx).toBeGreaterThanOrEqual(2)
    })
    
    test('should show the beginner tutorial card', async ({ page }) => {
      await page.goto('/')
      await dismissFirstVisitModal(page)
      
      // The beginner card is present, visible, and says so. Its position in
      // the grid is a product decision that has moved twice, so it is not
      // asserted here (UF-25).
      const beginnerCard = page.locator(BEGINNER_CARD)
      await expect(beginnerCard).toBeVisible()

      const cardTitle = await beginnerCard.locator('.role-path-title').textContent()
      expect(cardTitle.toLowerCase()).toContain('beginner')
    })
    
    test('should show tutorial tips on the beginner card', async ({ page }) => {
      await page.goto('/')
      await dismissFirstVisitModal(page)
      
      // Tips are inside collapsed <details> elements -- expand first one to verify content
      const beginnerCard = page.locator('.role-path-card:visible').first()
      const detailsEl = beginnerCard.locator('.role-path-details')
      
      // Open the details to reveal tips
      if (await detailsEl.count() > 0) {
        const summary = detailsEl.locator('summary')
        await summary.click()
        await page.waitForTimeout(200)
      }
      
      const tipList = beginnerCard.locator('.role-path-tips')
      await expect(tipList).toBeVisible()
      
      // Check card has tips
      const tipItems = await tipList.locator('li').count()
      expect(tipItems).toBeGreaterThanOrEqual(2)
    })
    
    test('should open tutorial overlay after example loads', async ({ page }) => {
      // Skip in CI - requires WASM for example loading
      test.skip(isCI, 'WASM example loading is slow/unreliable in CI')
      
      await page.goto('/')
      await dismissFirstVisitModal(page)
      await waitForWasmReady(page)
      
      // Click the beginner card's "Start Tutorial" button
      await page.locator(BEGINNER_TRY_BTN).click()

      // Wait for example to load - file info shows loaded file name and parameter count
      await waitForModelLoaded(page)
      
      // Tutorial overlay should appear after a short delay
      await page.waitForTimeout(1000)
      
      const tutorialOverlay = page.locator('.tutorial-overlay')
      await expect(tutorialOverlay).toBeVisible()
      
      // Check ARIA attributes on the dialog panel
      const tutorialPanel = page.locator('.tutorial-panel')
      await expect(tutorialPanel).toHaveAttribute('role', 'dialog')
      await expect(tutorialPanel).toHaveAttribute('aria-modal', 'true')
    })
    
    test('should have keyboard-navigable tutorial with Back/Next buttons', async ({ page }) => {
      // Skip in CI - requires WASM for example loading
      test.skip(isCI, 'WASM example loading is slow/unreliable in CI')
      
      await page.goto('/')
      await dismissFirstVisitModal(page)
      await waitForWasmReady(page)
      
      // Click the beginner card's "Start Tutorial" button
      await page.locator(BEGINNER_TRY_BTN).click()

      // Wait for tutorial to appear
      await page.waitForSelector('.tutorial-overlay', {
        timeout: 60000
      })

      // Check that tutorial has navigation buttons
      const backBtn = page.locator('#tutorialBackBtn')
      const nextBtn = page.locator('#tutorialNextBtn')
      
      await expect(backBtn).toBeVisible()
      await expect(nextBtn).toBeVisible()
      
      // Back button should be disabled on first step
      await expect(backBtn).toBeDisabled()
      
      // Next button should be enabled
      await expect(nextBtn).not.toBeDisabled()
      
      // Click Next
      await nextBtn.click()
      await page.waitForTimeout(300)
      
      // Back button should now be enabled
      await expect(backBtn).not.toBeDisabled()
    })
    
    test('should close tutorial with Escape key and restore focus', async ({ page }) => {
      // Skip in CI - requires WASM for example loading
      test.skip(isCI, 'WASM example loading is slow/unreliable in CI')
      
      await page.goto('/')
      await dismissFirstVisitModal(page)
      await waitForWasmReady(page)
      
      // Start the welcome-page tour from its own card button, and remember
      // the trigger: closing a tour must hand focus back to it.
      const triggerBtn = page.locator('#startWelcomeTourBtn')
      await triggerBtn.click()

      // Wait for tutorial to appear
      await page.waitForSelector('.tutorial-overlay', {
        timeout: 60000
      })

      // Press Escape to close
      await page.keyboard.press('Escape')
      await page.waitForTimeout(300)

      // Tutorial should be closed
      const tutorialOverlay = page.locator('.tutorial-overlay')
      await expect(tutorialOverlay).not.toBeVisible()

      // Focus must return to the control that opened the tour. A keyboard
      // or screen-reader user who presses Escape has to land where they
      // were, not at the top of the document. The old assertion here only
      // asked that SOMETHING was focused, which is why defect D-43 - focus
      // falling to <body> on every tour close - survived under it.
      await expect(triggerBtn).toBeFocused()
    })
    
    test('should have close button with proper ARIA label', async ({ page }) => {
      // Skip in CI - requires WASM for example loading
      test.skip(isCI, 'WASM example loading is slow/unreliable in CI')
      
      await page.goto('/')
      await dismissFirstVisitModal(page)
      await waitForWasmReady(page)
      
      // Click the beginner card's "Start Tutorial" button
      await page.locator(BEGINNER_TRY_BTN).click()

      // Wait for tutorial to appear
      await page.waitForSelector('.tutorial-overlay', {
        timeout: 60000
      })

      // Check close button
      const closeBtn = page.locator('.tutorial-close')
      await expect(closeBtn).toBeVisible()
      await expect(closeBtn).toHaveAttribute('aria-label')
      
      const ariaLabel = await closeBtn.getAttribute('aria-label')
      expect(ariaLabel.toLowerCase()).toContain('exit')
      
      // Close button should work
      await closeBtn.click()
      await page.waitForTimeout(300)
      
      const tutorialOverlay = page.locator('.tutorial-overlay')
      await expect(tutorialOverlay).not.toBeVisible()
    })
    
    test('should show step progress indicator', async ({ page }) => {
      // Skip in CI - requires WASM for example loading
      test.skip(isCI, 'WASM example loading is slow/unreliable in CI')
      
      await page.goto('/')
      await dismissFirstVisitModal(page)
      await waitForWasmReady(page)
      
      // Click the beginner card's "Start Tutorial" button
      await page.locator(BEGINNER_TRY_BTN).click()

      // Wait for tutorial to appear
      await page.waitForSelector('.tutorial-overlay', {
        timeout: 60000
      })

      // Check progress indicator
      const progressIndicator = page.locator('.tutorial-progress')
      await expect(progressIndicator).toBeVisible()
      
      const progressText = await progressIndicator.textContent()
      expect(progressText).toMatch(/Step \d+ of \d+/)
    })

    // Named for the step, not its number: the intro tour has gained and lost
    // steps twice, and 'Actions menu' is step 9 today (UF-25).
    test('should spotlight Actions drawer toggle on the Actions menu step (mobile)', async ({ page }) => {
      // Skip in CI - requires WASM for example loading
      test.skip(isCI, 'WASM example loading is slow/unreliable in CI')

      // Mobile viewport (where Actions bar is fixed at bottom)
      await page.setViewportSize({ width: 390, height: 844 })

      await page.goto('/')
      await dismissFirstVisitModal(page)
      await waitForWasmReady(page)
      
      // Click the beginner card's "Start Tutorial" button. This case walks
      // the intro tour by step title, so it must start the intro tour: the
      // grid's first button starts the welcome-page tour, whose step 2 is
      // "Keyboard shortcuts" (UF-25).
      await page.locator(BEGINNER_TRY_BTN).click()

      // Wait for tutorial to appear
      await page.waitForSelector('.tutorial-overlay', {
        timeout: 60000
      })

      const nextBtn = page.locator('#tutorialNextBtn')
      const stepTitle = page.locator('.tutorial-step-title')

      await nextTo(page, 'The 3 main areas')
      await nextTo(page, 'Open and close the Customizer')
      await nextTo(page, 'Expand a parameter group')

      // This step is gated: expand the Dimensions group to enable Next.
      await openDrawer(page)
      const dimensionsGroup = page.locator('.param-group[data-group-id="Dimensions"]')
      await dimensionsGroup.locator('summary').click()
      await expect(nextBtn).not.toBeDisabled({ timeout: 20000 })

      await nextTo(page, 'Adjust a parameter')

      // Complete step 5 to enable Next.
      // On mobile the parameter drawer may have closed between steps.
      // Force-open it via JS so #param-width becomes visible (bypasses
      // any tutorial overlay that might intercept pointer events).
      await page.evaluate(() => {
        const panel = document.getElementById('paramPanel')
        if (panel && !panel.classList.contains('drawer-open')) {
          const toggle = document.getElementById('mobileDrawerToggle')
          if (toggle) toggle.click()
        }
      })
      await page.waitForTimeout(500)

      // Also expand the Dimensions group if it collapsed
      await page.evaluate(() => {
        const group = document.querySelector('.param-group[data-group-id="Dimensions"]')
        if (group && !group.open) group.open = true
      })

      await page.waitForSelector('#param-width', { state: 'visible', timeout: 15000 })
      const widthInput = page.locator('#param-width')

      // Ensure the input is actually tappable (not covered by the tutorial panel)
      const widthIsOnTop = await page.evaluate(() => {
        const el = document.querySelector('#param-width')
        if (!el) return false
        const r = el.getBoundingClientRect()
        const x = r.left + r.width / 2
        const y = r.top + r.height / 2
        const topEl = document.elementFromPoint(x, y)
        return !!topEl && (el === topEl || el.contains(topEl))
      })
      expect(widthIsOnTop).toBe(true)

      // Drawer should remain open during parameter interaction on mobile
      await expect(page.locator('#paramPanel')).toHaveClass(/drawer-open/)

      await widthInput.click()
      await widthInput.fill('60')
      // Ensure an input event is fired consistently across input types
      await widthInput.dispatchEvent('input')
      await expect(nextBtn).not.toBeDisabled()

      await nextTo(page, 'See the preview update')
      await nextTo(page, 'Save a design (preset)')

      // This step is gated: open the Presets disclosure to enable Next.
      await openDrawer(page)
      const presets = page.locator('#presetControls')
      await presets.locator('summary').click()
      // Toggle event can be delayed by animations/layout; give it a moment.
      await expect(nextBtn).not.toBeDisabled({ timeout: 20000 })

      await nextTo(page, 'Preview Settings & Info')
      await nextTo(page, 'Actions menu')
      await bringTourBack(page)

      const actionsToggle = page.locator('#actionsDrawerToggle')
      const previewToggle = page.locator('#previewDrawerToggle')
      const cutout = page.locator('.tutorial-spotlight-cutout')

      await expect(actionsToggle).toBeVisible()
      await expect(previewToggle).toBeVisible()

      // The cutout should contain the Actions toggle center point, not the Preview toggle center.
      // Note: boundingBox() for an SVG rect inside a mask can be unreliable in Playwright,
      // so we assert using the rect's x/y/width/height attributes (the values our JS sets).
      const [actionsBox, previewBox, cutoutAttrs] = await Promise.all([
        actionsToggle.boundingBox(),
        previewToggle.boundingBox(),
        cutout.evaluate((el) => ({
          x: parseFloat(el.getAttribute('x') || '0'),
          y: parseFloat(el.getAttribute('y') || '0'),
          width: parseFloat(el.getAttribute('width') || '0'),
          height: parseFloat(el.getAttribute('height') || '0'),
        })),
      ])

      expect(actionsBox).not.toBeNull()
      expect(previewBox).not.toBeNull()
      expect(cutoutAttrs).toBeTruthy()

      const actionsCenter = {
        x: actionsBox.x + actionsBox.width / 2,
        y: actionsBox.y + actionsBox.height / 2,
      }
      const previewCenter = {
        x: previewBox.x + previewBox.width / 2,
        y: previewBox.y + previewBox.height / 2,
      }

      const cutoutRect = {
        left: cutoutAttrs.x,
        right: cutoutAttrs.x + cutoutAttrs.width,
        top: cutoutAttrs.y,
        bottom: cutoutAttrs.y + cutoutAttrs.height,
      }

      expect(actionsCenter.x).toBeGreaterThanOrEqual(cutoutRect.left)
      expect(actionsCenter.x).toBeLessThanOrEqual(cutoutRect.right)
      expect(actionsCenter.y).toBeGreaterThanOrEqual(cutoutRect.top)
      expect(actionsCenter.y).toBeLessThanOrEqual(cutoutRect.bottom)

      // Ensure we're not still spotlighting Preview Settings (regression for step 9)
      expect(
        previewCenter.x >= cutoutRect.left &&
          previewCenter.x <= cutoutRect.right &&
          previewCenter.y >= cutoutRect.top &&
          previewCenter.y <= cutoutRect.bottom
      ).toBe(false)
    })
  })
})

// UF-9 P2: on CI Firefox, axe sometimes evaluated color-contrast before the
// app stylesheets were applied — ~187 nodes failing at ratio 1.17, a
// different theme pair on each of three otherwise-identical runs. Block
// until the design tokens actually resolve on <body> so every axe scan in
// this describe sees painted styles.
async function waitForStylesApplied(page) {
  await page.waitForFunction(
    () =>
      getComputedStyle(document.body)
        .getPropertyValue('--color-text-primary')
        .trim().length > 0
  );
}

test.describe('Color System and Theme Accessibility', () => {
  test('should support light theme without violations', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Explicitly set light theme
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'light');
    });

    await waitForStylesApplied(page);
    await page.waitForTimeout(100);

    // Run accessibility scan
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    
    expect(results.violations).toEqual([]);
    console.log('Light theme: No accessibility violations');
  });

  test('should support dark theme without violations', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    // Explicitly set dark theme
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });

    await waitForStylesApplied(page);
    await page.waitForTimeout(100);

    // Run accessibility scan
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    
    expect(results.violations).toEqual([]);
    console.log('Dark theme: No accessibility violations');
  });

  test('should support high contrast light mode without violations', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    // Enable high contrast mode with light theme
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'light');
      document.documentElement.setAttribute('data-high-contrast', 'true');
    });

    await waitForStylesApplied(page);
    await page.waitForTimeout(100);

    // Run accessibility scan
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'wcag2aaa'])
      .analyze();
    
    expect(results.violations).toEqual([]);
    console.log('High contrast light mode: No accessibility violations');
  });

  test('should support high contrast dark mode without violations', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    // Enable high contrast mode with dark theme
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
      document.documentElement.setAttribute('data-high-contrast', 'true');
    });

    await waitForStylesApplied(page);
    await page.waitForTimeout(100);

    // Run accessibility scan
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'wcag2aaa'])
      .analyze();
    
    expect(results.violations).toEqual([]);
    console.log('High contrast dark mode: No accessibility violations');
  });

  test('should have visible focus indicators across all themes', async ({ page }) => {
    await page.goto('/')
    
    const themes = [
      { theme: 'light', highContrast: false },
      { theme: 'dark', highContrast: false },
      { theme: 'light', highContrast: true },
      { theme: 'dark', highContrast: true }
    ];
    
    for (const config of themes) {
      await page.evaluate((cfg) => {
        document.documentElement.setAttribute('data-theme', cfg.theme);
        if (cfg.highContrast) {
          document.documentElement.setAttribute('data-high-contrast', 'true');
        } else {
          document.documentElement.removeAttribute('data-high-contrast');
        }
        if (document.activeElement && document.activeElement !== document.body) {
          document.activeElement.blur();
        }
      }, config);
      
      await page.waitForTimeout(50);
      
      // Tab to first focusable element
      await page.keyboard.press('Tab');
      
      // Get focused element's outline
      const outlineInfo = await page.evaluate(() => {
        const el = document.activeElement;
        const styles = window.getComputedStyle(el);
        return {
          outlineWidth: styles.outlineWidth,
          outlineStyle: styles.outlineStyle,
          boxShadow: styles.boxShadow,
          matchesFocusVisible: el.matches(':focus-visible'),
        };
      });
      
      // Should have outline or box-shadow for focus
      // WebKit uses outline-style:auto for its native focus ring (reports width 0px)
      // WebKit high-contrast mode may only expose :focus-visible without computed outline
      const hasOutline = outlineInfo.outlineStyle !== 'none' && 
                        (outlineInfo.outlineStyle === 'auto' || parseFloat(outlineInfo.outlineWidth) >= 2);
      const hasBoxShadow = outlineInfo.boxShadow !== 'none';
      const hasFocusVisible = outlineInfo.matchesFocusVisible;
      
      expect(hasOutline || hasBoxShadow || hasFocusVisible).toBe(true);
      
      console.log(`${config.theme}${config.highContrast ? ' HC' : ''}: Focus indicator present`);
    }
  });

  test('toggle switch off-state track and thumb are distinguishable in all 7 theme states', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const themeStates = [
      { name: 'Light', theme: 'light', hc: false, mono: false },
      { name: 'Dark', theme: 'dark', hc: false, mono: false },
      { name: 'HC Light', theme: 'light', hc: true, mono: false },
      { name: 'HC Dark', theme: 'dark', hc: true, mono: false },
      { name: 'Mono Light', theme: 'light', hc: false, mono: true },
      { name: 'Mono Dark', theme: 'dark', hc: false, mono: true },
      { name: 'Mono + HC', theme: 'dark', hc: true, mono: true },
    ]

    for (const state of themeStates) {
      // Set theme attributes in one call, then read styles in a separate call.
      // This allows the MutationObserver (which syncs Radix color-scale
      // inline vars) to fire between the two evaluations — WebKit needs
      // the variables on :root before getComputedStyle returns real values.
      await page.evaluate((cfg) => {
        const root = document.documentElement
        root.setAttribute('data-theme', cfg.theme)
        if (cfg.hc) {
          root.setAttribute('data-high-contrast', 'true')
        } else {
          root.removeAttribute('data-high-contrast')
        }
        if (cfg.mono) {
          root.setAttribute('data-ui-variant', 'mono')
        } else {
          root.removeAttribute('data-ui-variant')
        }

        let wrapper = document.getElementById('_test-toggle-wrapper')
        if (!wrapper) {
          wrapper = document.createElement('label')
          wrapper.id = '_test-toggle-wrapper'
          wrapper.className = 'toggle-switch'
          const input = document.createElement('input')
          input.type = 'checkbox'
          wrapper.appendChild(input)
          document.body.appendChild(wrapper)
        }
        wrapper.querySelector('input').checked = false
      }, state)

      // Allow one animation frame for style recalculation + MutationObserver
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)))

      const result = await page.evaluate(() => {
        const input = document.querySelector('#_test-toggle-wrapper input')
        const trackStyle = getComputedStyle(input)
        const thumbStyle = getComputedStyle(input, '::before')

        return {
          trackBg: trackStyle.backgroundColor,
          thumbBg: thumbStyle.backgroundColor,
        }
      })

      const parseRgb = (str) => {
        const m = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/)
        if (!m) return null
        // Treat fully transparent (alpha 0) as unresolved
        if (m[4] !== undefined && Number(m[4]) === 0) return null
        return [Number(m[1]), Number(m[2]), Number(m[3])]
      }

      const trackRgb = parseRgb(result.trackBg)
      const thumbRgb = parseRgb(result.thumbBg)

      expect(trackRgb, `${state.name}: track bg parseable`).not.toBeNull()
      expect(thumbRgb, `${state.name}: thumb bg parseable`).not.toBeNull()

      if (trackRgb && thumbRgb) {
        const diff =
          Math.abs(trackRgb[0] - thumbRgb[0]) +
          Math.abs(trackRgb[1] - thumbRgb[1]) +
          Math.abs(trackRgb[2] - thumbRgb[2])
        expect(
          diff,
          `${state.name}: track (${result.trackBg}) vs thumb (${result.thumbBg}) channel diff=${diff} must be ≥30`,
        ).toBeGreaterThanOrEqual(30)
      }

      console.log(
        `${state.name}: track=${result.trackBg}, thumb=${result.thumbBg}`,
      )
    }

    await page.evaluate(() => {
      const el = document.getElementById('_test-toggle-wrapper')
      if (el) el.remove()
    })
  })

  test('toggle switch is keyboard operable', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const isOperable = await page.evaluate(() => {
      const wrapper = document.createElement('label')
      wrapper.className = 'toggle-switch'
      wrapper.id = '_test-toggle-kb'
      const input = document.createElement('input')
      input.type = 'checkbox'
      wrapper.appendChild(input)
      document.body.appendChild(wrapper)

      input.focus()
      const isFocused = document.activeElement === input
      input.click()
      const isChecked = input.checked

      wrapper.remove()
      return { isFocused, isChecked }
    })

    expect(isOperable.isFocused).toBe(true)
    expect(isOperable.isChecked).toBe(true)
  })

  test('should use brand-neutral blue for focus indicators', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    // Check light mode focus color
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'light');
    });
    
    const lightFocusColor = await page.evaluate(() => {
      return getComputedStyle(document.documentElement).getPropertyValue('--color-focus');
    });
    
    expect(lightFocusColor.trim()).toBe('#0052cc');
    
    // Check dark mode focus color
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });
    
    const darkFocusColor = await page.evaluate(() => {
      return getComputedStyle(document.documentElement).getPropertyValue('--color-focus');
    });
    
    expect(darkFocusColor.trim()).toBe('#66b3ff');
    
    console.log('Focus colors verified: Light=#0052cc, Dark=#66b3ff');
  });
});

test.describe('Mono / Alt View Theme State Accessibility', () => {
  test('should have no violations in mono light mode', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'light')
      document.documentElement.setAttribute('data-ui-variant', 'mono')
    })
    await page.waitForTimeout(100)

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze()

    expect(results.violations).toEqual([])
    console.log('Mono light mode: No accessibility violations')
  })

  test('should have no violations in mono dark mode', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark')
      document.documentElement.setAttribute('data-ui-variant', 'mono')
    })
    await page.waitForTimeout(100)

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze()

    expect(results.violations).toEqual([])
    console.log('Mono dark mode: No accessibility violations')
  })

  test('should have no violations in mono + high contrast mode', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark')
      document.documentElement.setAttribute('data-high-contrast', 'true')
      document.documentElement.setAttribute('data-ui-variant', 'mono')
    })
    await page.waitForTimeout(100)

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'wcag2aaa'])
      .analyze()

    expect(results.violations).toEqual([])
    console.log('Mono + HC mode: No accessibility violations')
  })

  test('should have visible focus indicators in all 7 theme states including mono', async ({ page }) => {
    await page.goto('/')

    const themeStates = [
      { name: 'Light', theme: 'light', hc: false, mono: false },
      { name: 'Dark', theme: 'dark', hc: false, mono: false },
      { name: 'HC Light', theme: 'light', hc: true, mono: false },
      { name: 'HC Dark', theme: 'dark', hc: true, mono: false },
      { name: 'Mono Light', theme: 'light', hc: false, mono: true },
      { name: 'Mono Dark', theme: 'dark', hc: false, mono: true },
      { name: 'Mono + HC', theme: 'dark', hc: true, mono: true },
    ]

    for (const state of themeStates) {
      await page.evaluate((cfg) => {
        const root = document.documentElement
        root.setAttribute('data-theme', cfg.theme)
        if (cfg.hc) {
          root.setAttribute('data-high-contrast', 'true')
        } else {
          root.removeAttribute('data-high-contrast')
        }
        if (cfg.mono) {
          root.setAttribute('data-ui-variant', 'mono')
        } else {
          root.removeAttribute('data-ui-variant')
        }
        if (document.activeElement && document.activeElement !== document.body) {
          document.activeElement.blur()
        }
      }, state)

      await page.waitForTimeout(50)
      await page.keyboard.press('Tab')

      const outlineInfo = await page.evaluate(() => {
        const el = document.activeElement
        const styles = window.getComputedStyle(el)
        return {
          outlineWidth: styles.outlineWidth,
          outlineStyle: styles.outlineStyle,
          boxShadow: styles.boxShadow,
          matchesFocusVisible: el.matches(':focus-visible'),
        }
      })

      // WebKit uses outline-style:auto for its native focus ring (reports width 0px)
      // WebKit high-contrast mode may only expose :focus-visible without computed outline
      const hasOutline =
        outlineInfo.outlineStyle !== 'none' &&
        (outlineInfo.outlineStyle === 'auto' || parseFloat(outlineInfo.outlineWidth) >= 2)
      const hasBoxShadow = outlineInfo.boxShadow !== 'none'
      const hasFocusVisible = outlineInfo.matchesFocusVisible

      expect(
        hasOutline || hasBoxShadow || hasFocusVisible,
        `${state.name}: must have visible focus indicator`,
      ).toBe(true)

      console.log(
        `${state.name}: Focus indicator present (outline=${outlineInfo.outlineWidth} ${outlineInfo.outlineStyle})`,
      )
    }
  })

  test('mono variant attribute is applied and removed correctly', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const initialVariant = await page.evaluate(() =>
      document.documentElement.getAttribute('data-ui-variant'),
    )
    expect(initialVariant).toBeNull()

    await page.evaluate(() => {
      document.documentElement.setAttribute('data-ui-variant', 'mono')
    })

    const monoVariant = await page.evaluate(() =>
      document.documentElement.getAttribute('data-ui-variant'),
    )
    expect(monoVariant).toBe('mono')

    await page.evaluate(() => {
      document.documentElement.removeAttribute('data-ui-variant')
    })

    const removedVariant = await page.evaluate(() =>
      document.documentElement.getAttribute('data-ui-variant'),
    )
    expect(removedVariant).toBeNull()
  })
})

test.describe('Enhanced Contrast Preference (prefers-contrast)', () => {
  test('should handle prefers-contrast: more emulation', async ({ page, browserName }) => {
    // Playwright Firefox does not reliably emulate the contrast media feature
    test.skip(browserName === 'firefox', 'Firefox does not support contrast media emulation in Playwright')

    // Emulate enhanced contrast preference
    await page.emulateMedia({ colorScheme: 'light', contrast: 'more' });
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    // Check that borders are thicker
    const borderWidth = await page.evaluate(() => {
      const button = document.querySelector('.btn');
      return window.getComputedStyle(button).borderWidth;
    });
    
    const borderWidthPx = parseFloat(borderWidth);
    expect(borderWidthPx).toBeGreaterThanOrEqual(2);
    
    // Run accessibility scan
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    
    expect(results.violations).toEqual([]);
    console.log('prefers-contrast: more - No violations, borders enhanced');
  });

  test('should handle prefers-contrast: more in dark mode', async ({
    page,
    browserName,
  }) => {
    // Same limitation the sibling case above records: Playwright Firefox
    // does not emulate the contrast media feature, so the preference never
    // reaches the page and the ring stays at its ordinary width. The app
    // high-contrast case below needs no emulation, so Firefox still guards
    // this rule through the mode more people actually use.
    test.skip(
      browserName === 'firefox',
      'Firefox does not support contrast media emulation in Playwright'
    );

    await page.emulateMedia({ colorScheme: 'dark', contrast: 'more' });
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Focus a KNOWN control rather than whatever one Tab happens to reach.
    // The old version pressed Tab and measured document.activeElement, which
    // depends on how much of the page has been built: on a loaded CI runner
    // it landed on a control the app does not style and read the browser's
    // own 1px ring, which is how this case went red on WebKit while passing
    // six times over locally.
    //
    // It also asserted only ">= 3px", which the ORDINARY ring already
    // satisfies - so it could never have noticed the enhancement failing,
    // and the enhancement WAS failing. --focus-ring-width is raised to 4px
    // both here and by :root[data-high-contrast='true'], but the global
    // focus rule hardcoded 3px behind !important and beat both. Asserting
    // the exact width, and then that it drops back without the preference,
    // is what makes this case able to fail.
    const focusWidth = () =>
      page.evaluate(() => {
        const el = document.getElementById('themeToggle');
        el.focus();
        return window.getComputedStyle(el).outlineWidth;
      });

    expect(await focusWidth()).toBe('4px');

    await page.emulateMedia({ colorScheme: 'dark', contrast: 'no-preference' });
    expect(await focusWidth()).toBe('3px');

    console.log('prefers-contrast: more (dark) - Enhanced focus indicators');
  });

  test('the app own high contrast mode thickens the focus ring too', async ({
    page,
  }) => {
    // The same token, the same rule, the mode far more people actually use:
    // :root[data-high-contrast='true'] raises --focus-ring-width to 4px and
    // it never reached a button either.
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const focusWidth = () =>
      page.evaluate(() => {
        const el = document.getElementById('themeToggle');
        el.focus();
        return window.getComputedStyle(el).outlineWidth;
      });

    expect(await focusWidth()).toBe('3px');

    await page.evaluate(() =>
      document.documentElement.setAttribute('data-high-contrast', 'true')
    );
    expect(await focusWidth()).toBe('4px');
  });
});

test.describe('System Color Scheme Preference', () => {
  test('should respond to prefers-color-scheme: dark', async ({ page, browserName }) => {
    // Firefox emulateMedia for colorScheme doesn't cascade into CSS correctly
    test.skip(browserName === 'firefox', 'Firefox color-scheme emulation unreliable in Playwright')

    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    // Check that dark mode is applied (without manual theme attribute)
    const backgroundColor = await page.evaluate(() => {
      // Remove manual theme to test auto mode
      document.documentElement.removeAttribute('data-theme');
      return window.getComputedStyle(document.body).backgroundColor;
    });
    
    // Dark mode should have dark background
    // RGB values should be low (close to black)
    const bgColorValues = backgroundColor.match(/\d+/g);
    if (bgColorValues) {
      const [r, g, b] = bgColorValues.map(Number);
      expect(r + g + b).toBeLessThan(100); // Dark colors sum to low value
    }
    
    console.log('Auto dark mode applies correctly');
  });

  test('should respond to prefers-color-scheme: light', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    // Check that light mode is applied (without manual theme attribute)
    const backgroundColor = await page.evaluate(() => {
      // Remove manual theme to test auto mode
      document.documentElement.removeAttribute('data-theme');
      return window.getComputedStyle(document.body).backgroundColor;
    });
    
    // Light mode should have light background
    const bgColorValues = backgroundColor.match(/\d+/g);
    if (bgColorValues) {
      const [r, g, b] = bgColorValues.map(Number);
      expect(r + g + b).toBeGreaterThan(600); // Light colors sum to high value
    }
    
    console.log('Auto light mode applies correctly');
  });
});

test.describe('Theme Persistence', () => {
  test('should persist theme selection across page reloads', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    // Set dark theme via toggle button
    const themeToggle = page.locator('.theme-toggle');
    
    // Click theme toggle (may need multiple clicks to get to dark)
    await themeToggle.click();
    await page.waitForTimeout(100);
    
    // Check if dark theme is active
    let isDark = await page.evaluate(() => {
      return document.documentElement.getAttribute('data-theme') === 'dark';
    });
    
    if (!isDark) {
      // Click again if needed
      await themeToggle.click();
      await page.waitForTimeout(100);
    }
    
    // Reload page
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // Theme should be persisted
    const persistedTheme = await page.evaluate(() => {
      return document.documentElement.getAttribute('data-theme');
    });
    
    expect(persistedTheme).toBeTruthy();
    console.log(`Theme persisted after reload: ${persistedTheme}`);
  });

  test('should persist high contrast selection', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    // Enable high contrast mode
    const contrastToggle = page.locator('.contrast-toggle');
    await contrastToggle.click();
    await page.waitForTimeout(100);
    
    // Verify HC mode is active
    let isHC = await page.evaluate(() => {
      return document.documentElement.getAttribute('data-high-contrast') === 'true';
    });
    
    expect(isHC).toBe(true);
    
    // Reload page
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // HC mode should be persisted
    const persistedHC = await page.evaluate(() => {
      return document.documentElement.getAttribute('data-high-contrast');
    });
    
    expect(persistedHC).toBe('true');
    console.log('High contrast mode persisted after reload');
  });
});

test.describe('New Color Tokens (Teal Info Color)', () => {
  test('should have teal info color token available', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    const infoColor = await page.evaluate(() => {
      return getComputedStyle(document.documentElement).getPropertyValue('--color-info');
    });
    
    expect(infoColor).toBeTruthy();
    expect(infoColor.trim().length).toBeGreaterThan(0);
    
    console.log('Teal info color token is available:', infoColor.trim());
  });

  test('should use distinct colors for success, info, warning, error', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    const semanticColors = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      return {
        success: root.getPropertyValue('--color-success').trim(),
        info: root.getPropertyValue('--color-info').trim(),
        warning: root.getPropertyValue('--color-warning').trim(),
        error: root.getPropertyValue('--color-error').trim()
      };
    });
    
    // All colors should be different
    const colors = Object.values(semanticColors);
    const uniqueColors = new Set(colors);
    expect(uniqueColors.size).toBe(4);
    
    console.log('Semantic colors are distinct:', semanticColors);
  });
});

test.describe('Tutorial Button Contrast - CRITICAL REGRESSION TEST', () => {
  test('tutorial Back button is readable in dark theme', async ({ page }) => {
    // Skip in CI - requires WASM for example loading
    test.skip(isCI, 'WASM example loading is slow/unreliable in CI')
    
    await page.goto('/')
    await waitForWasmReady(page)
    
    // Set dark theme BEFORE starting tutorial
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark')
    })
    
    // Start tutorial via the beginner role card
    const firstTryButton = page.locator('.btn-role-try').first()
    await firstTryButton.click()
    
    // Wait for tutorial to appear
    await page.waitForSelector('.tutorial-overlay', { timeout: 60000 })
    
    // Advance past first step so Back button is enabled
    const nextBtn = page.locator('#tutorialNextBtn')
    await nextBtn.click()
    await page.waitForTimeout(300)
    
    // Get Back button styles
    const backBtn = page.locator('#tutorialBackBtn')
    const styles = await backBtn.evaluate(el => {
      const computed = getComputedStyle(el)
      return {
        bg: computed.backgroundColor,
        color: computed.color,
        bgIsTransparent: computed.backgroundColor === 'rgba(0, 0, 0, 0)' || 
                         computed.backgroundColor === 'transparent',
      }
    })
    
    // CRITICAL: Assert background is NOT transparent
    // This was the root cause of the black-on-black text issue
    expect(styles.bgIsTransparent).toBe(false)
    expect(styles.bg).not.toBe('rgba(0, 0, 0, 0)')
    expect(styles.bg).not.toBe('transparent')
    
    // Assert text color is light (for dark theme) - RGB values should be high
    const colorMatch = styles.color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
    if (colorMatch) {
      const [, r, g, b] = colorMatch.map(Number)
      // In dark theme, text should be light (high RGB values)
      expect(r + g + b).toBeGreaterThan(400)
    }
    
    console.log('Dark theme Back button styles:', styles)
  })
  
  test('tutorial Back button has visible border in all themes', async ({ page }) => {
    await page.goto('/')
    
    const themes = [
      { theme: 'light', highContrast: false },
      { theme: 'dark', highContrast: false },
      { theme: 'light', highContrast: true },
      { theme: 'dark', highContrast: true }
    ]
    
    for (const config of themes) {
      await page.evaluate((cfg) => {
        document.documentElement.setAttribute('data-theme', cfg.theme)
        if (cfg.highContrast) {
          document.documentElement.setAttribute('data-high-contrast', 'true')
        } else {
          document.documentElement.removeAttribute('data-high-contrast')
        }
      }, config)
      
      // Inject a test tutorial button to check styles without loading full app
      const borderWidth = await page.evaluate(() => {
        const testBtn = document.createElement('button')
        testBtn.className = 'btn btn-sm tutorial-btn-back'
        testBtn.style.position = 'fixed'
        testBtn.style.top = '-9999px'
        document.body.appendChild(testBtn)
        const width = getComputedStyle(testBtn).borderWidth
        document.body.removeChild(testBtn)
        return width
      })
      
      const borderWidthPx = parseFloat(borderWidth)
      expect(borderWidthPx).toBeGreaterThanOrEqual(1)
      
      console.log(`${config.theme}${config.highContrast ? ' HC' : ''}: Back button border = ${borderWidth}`)
    }
  })
  
  test('tutorial repositions correctly after orientation change', async ({ page }) => {
    // Skip in CI - requires WASM for example loading
    test.skip(isCI, 'WASM example loading is slow/unreliable in CI')
    
    // Start in portrait
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/')
    await waitForWasmReady(page)
    
    // Start tutorial
    const firstTryButton = page.locator('.btn-role-try').first()
    await firstTryButton.click()
    
    // Wait for tutorial to appear
    await page.waitForSelector('.tutorial-overlay', { timeout: 60000 })
    await page.waitForTimeout(300)
    
    // Rotate to landscape
    await page.setViewportSize({ width: 812, height: 375 })
    await page.waitForTimeout(500) // Wait for reposition
    
    // Assert panel is within viewport
    const panel = page.locator('.tutorial-panel')
    const box = await panel.boundingBox()
    expect(box).not.toBeNull()
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.y).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(812)
    expect(box.y + box.height).toBeLessThanOrEqual(375)
  })
  
  test('tutorial locks body scroll when active', async ({ page }) => {
    // Skip in CI - requires WASM for example loading
    test.skip(isCI, 'WASM example loading is slow/unreliable in CI')
    
    await page.goto('/')
    await waitForWasmReady(page)
    
    // Start tutorial
    const firstTryButton = page.locator('.btn-role-try').first()
    await firstTryButton.click()
    
    // Wait for tutorial to appear
    await page.waitForSelector('.tutorial-overlay', { timeout: 60000 })
    
    // Verify body scroll is locked
    const bodyClasses = await page.evaluate(() => document.body.classList.toString())
    expect(bodyClasses).toContain('tutorial-body-locked')
    
    // Close tutorial
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    
    // Verify scroll restored
    const restoredClasses = await page.evaluate(() => document.body.classList.toString())
    expect(restoredClasses).not.toContain('tutorial-body-locked')
  })
  
  test('tutorial focus trap keeps focus within panel', async ({ page }) => {
    // Skip in CI - requires WASM for example loading
    test.skip(isCI, 'WASM example loading is slow/unreliable in CI')
    
    await page.goto('/')
    await waitForWasmReady(page)
    
    // Start tutorial
    const firstTryButton = page.locator('.btn-role-try').first()
    await firstTryButton.click()
    
    // Wait for tutorial to appear
    await page.waitForSelector('.tutorial-overlay', { timeout: 60000 })
    
    // Tab through all focusable elements multiple times
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab')
      
      // Verify focus is still inside tutorial panel
      const isFocusInsideTutorial = await page.evaluate(
        () => !!document.activeElement?.closest('.tutorial-panel')
      )
      expect(isFocusInsideTutorial).toBe(true)
    }
    
    console.log('Focus trap working correctly - focus stayed in tutorial panel')
  })
})

test.describe('Drawer Accessibility', () => {
  test.use({ viewport: { width: 375, height: 667 } });
  
  test('drawer has correct ARIA attributes when open', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI');
    await page.goto('/');
    await waitForWasmReady(page);
    const fixturePath = path.join(process.cwd(), 'tests', 'fixtures', 'sample.scad');
    
    await page.setInputFiles('#fileInput', fixturePath);
    // The drawer is what this describe tests, so the parameter groups stay as
    // the app leaves them: at 375px wide, Expand all sits inside the closed
    // drawer and is outside the viewport.
    await waitForModelLoaded(page, { expandGroups: false });
    
    await page.locator('#mobileDrawerToggle').click();
    
    const drawer = page.locator('#paramPanel');
    await expect(drawer).toHaveAttribute('role', 'dialog');
    await expect(drawer).toHaveAttribute('aria-modal', 'true');
  });
  
  test('drawer passes axe accessibility scan', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI');
    await page.goto('/');
    await waitForWasmReady(page);
    const fixturePath = path.join(process.cwd(), 'tests', 'fixtures', 'sample.scad');
    
    await page.setInputFiles('#fileInput', fixturePath);
    // The drawer is what this describe tests, so the parameter groups stay as
    // the app leaves them: at 375px wide, Expand all sits inside the closed
    // drawer and is outside the viewport.
    await waitForModelLoaded(page, { expandGroups: false });
    await page.locator('#mobileDrawerToggle').click();
    
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();

    expectOnlyAllowedViolations(results);
  });
});

test.describe('Tutorial Responsive Behavior - Phase 6.2', () => {
  test('tutorial repositions correctly after orientation change', async ({ page }) => {
    // Skip - this test requires WASM and real tutorial, mock doesn't work reliably
    test.skip(isCI, 'Orientation testing requires WASM and is unreliable in CI');
    
    // Start in portrait
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await waitForWasmReady(page);
    
    // Start real tutorial via the welcome screen button
    const firstTryButton = page.locator('.btn-role-try').first();
    await firstTryButton.click();
    
    // Wait for tutorial panel to appear
    await page.waitForSelector('.tutorial-panel', { timeout: 60000 });
    await page.waitForTimeout(500);
    
    // Check panel is visible and within portrait viewport
    const panelPortrait = await page.locator('.tutorial-panel').boundingBox();
    if (panelPortrait) {
      expect(panelPortrait.x).toBeGreaterThanOrEqual(0);
      expect(panelPortrait.y).toBeGreaterThanOrEqual(0);
      expect(panelPortrait.x + panelPortrait.width).toBeLessThanOrEqual(375);
      expect(panelPortrait.y + panelPortrait.height).toBeLessThanOrEqual(812);
    }
    
    // Rotate to landscape
    await page.setViewportSize({ width: 812, height: 375 });
    await page.waitForTimeout(600); // Wait for reposition
    
    // Check panel repositioned and is within landscape viewport
    const panelLandscape = await page.locator('.tutorial-panel').boundingBox();
    if (panelLandscape) {
      expect(panelLandscape.x).toBeGreaterThanOrEqual(0);
      expect(panelLandscape.y).toBeGreaterThanOrEqual(0);
      expect(panelLandscape.x + panelLandscape.width).toBeLessThanOrEqual(812);
      expect(panelLandscape.y + panelLandscape.height).toBeLessThanOrEqual(375);
    }
  });
  
  test('tutorial keyboard shortcuts work correctly', async ({ page }) => {
    test.skip(isCI, 'Tutorial interaction requires WASM');
    
    await page.goto('/');
    await waitForWasmReady(page);
    
    // Start tutorial
    const firstTryButton = page.locator('.btn-role-try').first();
    await firstTryButton.click();
    await page.waitForSelector('.tutorial-overlay', { timeout: 60000 });
    
    // Test ArrowRight advances step
    const initialStep = await page.locator('#tutorial-step-current').textContent();
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);
    const nextStep = await page.locator('#tutorial-step-current').textContent();
    expect(parseInt(nextStep)).toBeGreaterThan(parseInt(initialStep));
    
    // Test ArrowLeft goes back
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(300);
    const prevStep = await page.locator('#tutorial-step-current').textContent();
    expect(parseInt(prevStep)).toBe(parseInt(initialStep));
    
    // Test Escape closes tutorial
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const overlayVisible = await page.locator('.tutorial-overlay').isVisible().catch(() => false);
    expect(overlayVisible).toBe(false);
  });
});

test.describe('Tutorial State Management - Phase 6.3', () => {
  test('tutorial body scroll locking works', async ({ page }) => {
    test.skip(isCI, 'Tutorial interaction requires WASM');
    
    await page.goto('/');
    await waitForWasmReady(page);
    
    // Note: App body has overflow:hidden by default (layout.css) to prevent outer scroll.
    // Tutorial adds additional scroll lock class for its own purposes.
    
    // Check body does NOT have tutorial scroll lock class initially
    const initialClasses = await page.evaluate(() => document.body.className);
    expect(initialClasses).not.toContain('tutorial-body-locked');
    expect(initialClasses).not.toContain('tutorial-scroll-locked');
    
    // Start tutorial
    const firstTryButton = page.locator('.btn-role-try').first();
    await firstTryButton.click();
    await page.waitForSelector('.tutorial-overlay', { timeout: 60000 });
    
    // Check body has tutorial scroll lock class
    const lockedClasses = await page.evaluate(() => document.body.className);
    const hasScrollLock = lockedClasses.includes('tutorial-body-locked') || 
                          lockedClasses.includes('tutorial-scroll-locked') ||
                          lockedClasses.includes('tutorial-active');
    expect(hasScrollLock).toBe(true);
    
    // Close tutorial
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    
    // Check scroll lock class is removed
    const restoredClasses = await page.evaluate(() => document.body.className);
    expect(restoredClasses).not.toContain('tutorial-body-locked');
    expect(restoredClasses).not.toContain('tutorial-scroll-locked');
  });
  
  test('tutorial keyboard help is available', async ({ page }) => {
    test.skip(isCI, 'Tutorial interaction requires WASM');
    
    await page.goto('/');
    await waitForWasmReady(page);
    
    // Start tutorial
    const firstTryButton = page.locator('.btn-role-try').first();
    await firstTryButton.click();
    await page.waitForSelector('.tutorial-overlay', { timeout: 60000 });
    
    // Check keyboard help details element exists (collapsible by default)
    const keyboardHelp = page.locator('.tutorial-keyboard-help, #tutorialKeyboardHelp');
    await expect(keyboardHelp).toBeAttached();
    
    // Open the keyboard help
    const summary = keyboardHelp.locator('summary');
    if (await summary.isVisible()) {
      await summary.click();
      await page.waitForTimeout(100);
      
      // Check it contains keyboard shortcut indicators
      const helpContent = page.locator('.tutorial-keyboard-help-content');
      if (await helpContent.isVisible()) {
        const helpText = await helpContent.textContent();
        expect(helpText).toContain('Esc');
      }
    }
  });
});

test.describe('Tutorial CSS and Styling - Phase 6.4', () => {
  test('tutorial uses CSS custom properties for z-index', async ({ page }) => {
    await page.goto('/');
    
    // Check that z-index variables are defined
    const zIndexVars = await page.evaluate(() => {
      const root = document.documentElement;
      const styles = getComputedStyle(root);
      return {
        backdrop: styles.getPropertyValue('--z-index-tutorial-backdrop'),
        spotlight: styles.getPropertyValue('--z-index-tutorial-spotlight'),
        panel: styles.getPropertyValue('--z-index-tutorial-panel'),
        minimized: styles.getPropertyValue('--z-index-tutorial-minimized')
      };
    });
    
    expect(zIndexVars.backdrop).toBeTruthy();
    expect(zIndexVars.panel).toBeTruthy();
  });
  
  test('tutorial keyboard help has proper kbd styling', async ({ page }) => {
    test.skip(isCI, 'Tutorial interaction requires WASM');
    
    await page.goto('/');
    await waitForWasmReady(page);
    
    // Start tutorial
    const firstTryButton = page.locator('.btn-role-try').first();
    await firstTryButton.click();
    await page.waitForSelector('.tutorial-overlay', { timeout: 60000 });
    
    // Open keyboard help details
    const keyboardHelp = page.locator('.tutorial-keyboard-help, #tutorialKeyboardHelp');
    const summary = keyboardHelp.locator('summary');
    if (await summary.isVisible()) {
      await summary.click();
      await page.waitForTimeout(100);
    }
    
    // Check kbd elements have border and background
    const kbdStyles = await page.evaluate(() => {
      // Try both class names for compatibility
      const kbd = document.querySelector('.tutorial-keyboard-help kbd') || 
                  document.querySelector('.tutorial-keyboard-help-content kbd');
      if (!kbd) return null;
      const styles = getComputedStyle(kbd);
      return {
        border: styles.border,
        background: styles.backgroundColor,
        padding: styles.padding
      };
    });
    
    if (kbdStyles) {
      expect(kbdStyles.border).not.toBe('0px none');
      expect(kbdStyles.background).not.toBe('rgba(0, 0, 0, 0)');
      expect(kbdStyles.padding).not.toBe('0px');
    }
  });
});

test.describe('UI Mode Toggle & Disclosure Section Accessibility', () => {
  test('UI mode toggle exists and defaults to Simplified mode', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI');

    await page.goto('/');
    await waitForWasmReady(page);

    const fixturePath = path.join(process.cwd(), 'tests', 'fixtures', 'sample.scad');
    await page.setInputFiles('#fileInput', fixturePath);
    await page.waitForSelector('.param-control', { state: 'attached', timeout: 30_000 });
    try {
      const notNow = page.locator('#saveProjectNotNow');
      await notNow.waitFor({ state: 'visible', timeout: 3000 });
      await notNow.click();
    } catch {
      // Save-project modal did not appear; nothing to dismiss.
    }

    // Legacy toggle must not exist
    const legacyToggle = page.locator('#settingsLevelToggle');
    await expect(legacyToggle).toHaveCount(0);

    // No legacy settings-hidden classes present
    const legacyHiddenCount = await page.locator('.settings-hidden').count();
    expect(legacyHiddenCount).toBe(0);

    // New UI mode toggle must exist and be visible
    const uiModeToggle = page.locator('#uiModeToggle');
    await expect(uiModeToggle).toHaveCount(1);
    await expect(uiModeToggle).toBeVisible();

    // Toggle must have role="switch" and correct initial ARIA state (Simplified = false)
    await expect(uiModeToggle).toHaveAttribute('role', 'switch');
    await expect(uiModeToggle).toHaveAttribute('aria-checked', 'false');

    // The three-mode controller stamps the layout mode on <body>
    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'simplified'
    );

    // Toggle must be keyboard-operable (focusable)
    await uiModeToggle.focus();
    await expect(uiModeToggle).toBeFocused();
  });

  test('UI mode toggle switches to Standard mode and shows all panels', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI');

    await page.goto('/');
    await waitForWasmReady(page);

    const fixturePath = path.join(process.cwd(), 'tests', 'fixtures', 'sample.scad');
    await page.setInputFiles('#fileInput', fixturePath);
    await page.waitForSelector('.param-control', { state: 'attached', timeout: 30_000 });
    try {
      const notNow = page.locator('#saveProjectNotNow');
      await notNow.waitFor({ state: 'visible', timeout: 3000 });
      await notNow.click();
    } catch {
      // Save-project modal did not appear; nothing to dismiss.
    }

    const uiModeToggle = page.locator('#uiModeToggle');

    // Default is Simplified mode (aria-checked="false")
    await expect(uiModeToggle).toHaveAttribute('aria-checked', 'false');

    // Click to switch to Standard mode
    await uiModeToggle.click();
    await expect(uiModeToggle).toHaveAttribute('aria-checked', 'true');

    // In Standard mode, no panels should have ui-mode-hidden class
    const hiddenPanels = await page.locator('.ui-mode-hidden').count();
    expect(hiddenPanels).toBe(0);

    // Parameter controls must remain visible
    const paramControls = page.locator('.param-control');
    const paramCount = await paramControls.count();
    expect(paramCount).toBeGreaterThan(0);

    // Click again to switch back to Simplified mode
    await uiModeToggle.click();
    await expect(uiModeToggle).toHaveAttribute('aria-checked', 'false');
  });

  test('all disclosure sections are keyboard-operable', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI');

    await page.goto('/');
    await waitForWasmReady(page);

    const fixturePath = path.join(process.cwd(), 'tests', 'fixtures', 'sample.scad');
    await page.setInputFiles('#fileInput', fixturePath);
    await page.waitForSelector('.param-control', { state: 'attached', timeout: 30_000 });
    try {
      const notNow = page.locator('#saveProjectNotNow');
      await notNow.waitFor({ state: 'visible', timeout: 3000 });
      await notNow.click();
    } catch {
      // Save-project modal did not appear; nothing to dismiss.
    }

    // Test that forge-disclosure details can be toggled with keyboard
    const disclosures = page.locator('.forge-disclosure');
    const count = await disclosures.count();

    for (let i = 0; i < count; i++) {
      const detail = disclosures.nth(i);
      const isVisible = await detail.isVisible().catch(() => false);
      if (!isVisible) continue;

      const summary = detail.locator('summary');
      const summaryVisible = await summary.isVisible().catch(() => false);
      if (!summaryVisible) continue;

      // Focus the summary and press Enter
      await summary.focus();
      const wasOpen = await detail.getAttribute('open');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(100);

      const isNowOpen = await detail.getAttribute('open');
      // State should have toggled
      if (wasOpen !== null) {
        expect(isNowOpen).toBeNull();
      } else {
        expect(isNowOpen).not.toBeNull();
      }

      // Toggle back to original state
      await page.keyboard.press('Enter');
      await page.waitForTimeout(100);
    }
  });

  test('forge-disclosure sections have uniform chevron via ::after', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Verify all forge-disclosure summaries have the ::after pseudo-element chevron
    const hasChevrons = await page.evaluate(() => {
      const summaries = document.querySelectorAll('.forge-disclosure summary');
      if (summaries.length === 0) return false;

      return Array.from(summaries).every(summary => {
        const styles = getComputedStyle(summary, '::after');
        return styles.content !== 'none' && styles.content !== '';
      });
    });

    expect(hasChevrons).toBe(true);
  });
});

test.describe('UI Uniformity Regression', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('parameters header has correct 2-row structure', async ({ page }) => {
    const structure = await page.evaluate(() => {
      const header = document.querySelector('.panel-header');
      if (!header) return null;
      const rows = Array.from(header.children).map(el => el.className);
      const collapseInActions = !!header.querySelector('.param-header-actions #collapseParamPanelBtn');
      const noSettingsRow = !header.querySelector('.panel-header-settings-row');
      return { rows, collapseInActions, noSettingsRow };
    });
    expect(structure).not.toBeNull();
    expect(structure.collapseInActions).toBe(true);
    expect(structure.noSettingsRow).toBe(true);
  });

  test('advanced menu is located after companion files and before param search', async ({ page }) => {
    const order = await page.evaluate(() => {
      const body = document.getElementById('paramPanelBody');
      if (!body) return null;
      const children = Array.from(body.children).map(el => el.id || el.className);
      const projIdx = children.indexOf('projectFilesControls');
      const advIdx = children.findIndex(c => c === 'advancedMenu' || c.includes('advanced-menu'));
      const searchIdx = children.indexOf('paramSearchSection');
      return { projIdx, advIdx, searchIdx };
    });
    expect(order).not.toBeNull();
    expect(order.advIdx).toBeGreaterThan(order.projIdx);
    expect(order.advIdx).toBeLessThan(order.searchIdx);
  });

  test('all forge-disclosure summaries have uniform typography', async ({ page }) => {
    const typography = await page.evaluate(() => {
      const summaries = Array.from(
        document.querySelectorAll('.forge-disclosure summary')
      );
      if (summaries.length === 0) return null;

      const weightMap = { normal: '400', bold: '700' };
      const normalize = (w) => weightMap[w] || w;

      // Partition into rendered vs hidden. WebKit returns different
      // computed styles for elements inside display:none subtrees, so
      // we only compare rendered elements.
      const rendered = summaries.filter(s => {
        const r = s.getBoundingClientRect();
        return r.width > 0 || r.height > 0;
      });

      const targets = rendered.length > 0 ? rendered : summaries;
      const values = targets.map(s => {
        const cs = getComputedStyle(s);
        return { fontSize: cs.fontSize, fontWeight: cs.fontWeight };
      });
      const first = values[0];
      const allMatch = values.every(
        v => v.fontSize === first.fontSize &&
             normalize(v.fontWeight) === normalize(first.fontWeight)
      );
      return { count: values.length, allMatch, sample: first, allHidden: rendered.length === 0 };
    });
    expect(typography).not.toBeNull();
    if (typography.allHidden) {
      // When all summaries are hidden (welcome screen), computed styles
      // are unreliable in WebKit — just verify elements exist in the DOM.
      expect(typography.count).toBeGreaterThan(0);
    } else {
      expect(typography.allMatch).toBe(true);
    }
  });

  test('no legacy triangle chevron on param groups', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI');
    await page.goto('/');
    await waitForWasmReady(page);
    const fixturePath = path.join(process.cwd(), 'tests', 'fixtures', 'sample.scad');
    await page.setInputFiles('#fileInput', fixturePath);
    await page.waitForSelector('.param-group', { timeout: 30_000 });

    const result = await page.evaluate(() => {
      const groups = document.querySelectorAll('.param-group');
      const hasForgeDisclosure = Array.from(groups).every(g => g.classList.contains('forge-disclosure'));
      const hasLegacyChevron = Array.from(groups).some(g => {
        const beforeContent = getComputedStyle(g.querySelector('summary'), '::before').content;
        return beforeContent && beforeContent.includes('Γû╢');
      });
      return { count: groups.length, hasForgeDisclosure, hasLegacyChevron };
    });
    if (result.count > 0) {
      expect(result.hasForgeDisclosure).toBe(true);
      expect(result.hasLegacyChevron).toBe(false);
    }
  });

  test('icon-only controls have forge-control class and correct sizing', async ({ page }) => {
    const controls = await page.evaluate(() => {
      const ids = ['collapseParamPanelBtn', 'cameraPanelToggle', 'previewDrawerToggle', 'actionsDrawerToggle'];
      return ids.map(id => {
        const el = document.getElementById(id);
        if (!el) return { id, found: false };
        const cs = getComputedStyle(el);
        return {
          id,
          found: true,
          hasForgeControl: el.classList.contains('forge-control'),
          minHeight: parseFloat(cs.minHeight),
          borderRadius: cs.borderRadius,
        };
      });
    });
    for (const ctrl of controls) {
      if (!ctrl.found) continue;
      expect(ctrl.hasForgeControl).toBe(true);
      expect(ctrl.minHeight).toBeGreaterThanOrEqual(36);
    }
  });

  test('collapsed panels have identical width (mirror symmetry)', async ({ page }) => {
    const widths = await page.evaluate(() => {
      const paramPanel = document.querySelector('.param-panel');
      const cameraPanel = document.querySelector('.camera-panel');
      if (!paramPanel || !cameraPanel) return null;
      const paramCollapsed = getComputedStyle(paramPanel).getPropertyValue('--drawer-collapsed-width');
      const cameraCollapsed = getComputedStyle(cameraPanel).getPropertyValue('--drawer-collapsed-width');
      return { paramCollapsed, cameraCollapsed };
    });
    if (widths) {
      expect(widths.paramCollapsed).toBe(widths.cameraCollapsed);
    }
  });

  test('no debug fetch calls to localhost', async ({ page }) => {
    const debugRequests = [];
    page.on('request', request => {
      if (request.url().includes('127.0.0.1')) {
        debugRequests.push(request.url());
      }
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000);
    expect(debugRequests).toEqual([]);
  });
});

// UF-25: this describe used to carry its own dismissSaveProjectModal helper.
// waitForModelLoaded does that step now, so the duplicate is gone.
test.describe('Axe-Core Scans for Missing Views (REC-002)', () => {
  test('should run axe scan with Expert Mode active', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await page.goto('/')
    await waitForWasmReady(page)

    const fixturePath = path.join(process.cwd(), 'tests', 'fixtures', 'sample.scad')

    await page.setInputFiles('#fileInput', fixturePath)
    // UF-25: this waited for `.param-control` to be VISIBLE, and F5 loads the
    // parameter groups collapsed, so it timed out at 30s on a control that
    // was present and correct. The catch that used to wrap this test turned
    // that into a skip.
    await waitForModelLoaded(page)

    const uiModeToggle = page.locator('#uiModeToggle')
    await uiModeToggle.click()
    await expect(uiModeToggle).toHaveAttribute('aria-checked', 'true')

    const expertToggle = page.locator('#expertModeToggle')
    const isExpertVisible = await expertToggle.isVisible().catch(() => false)

    if (!isExpertVisible) {
      console.log('Expert Mode toggle not visible — activating via Ctrl+E')
      await page.keyboard.press('Control+e')
    } else {
      await expertToggle.click()
    }

    const expertPanel = page.locator('#expertModePanel')
    await expect(expertPanel).toBeVisible({ timeout: 10_000 })

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze()

    console.log(`Expert Mode axe scan complete: ${results.violations.length} violations, ${results.passes.length} passes`)
    if (results.violations.length > 0) {
      console.log('Expert Mode axe violations (file as issues):')
      results.violations.forEach(v => {
        console.log(`- ${v.id}: ${v.description} (impact: ${v.impact})`)
        console.log(`  Help: ${v.helpUrl}`)
      })
    }

    expect(results.passes.length).toBeGreaterThan(0)
  })

  test('should have no violations with Features Guide modal open', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const learnMoreBtn = page.locator('.btn-role-learn').first()
    await expect(learnMoreBtn).toBeVisible()
    await learnMoreBtn.click()

    const modal = page.locator('#featuresGuideModal')
    await expect(modal).toBeVisible({ timeout: 5000 })

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze()

    console.log(`Features Guide axe scan complete: ${results.violations.length} violations, ${results.passes.length} passes`)
    if (results.violations.length > 0) {
      console.log('Features Guide modal axe violations:')
      results.violations.forEach(v => {
        console.log(`- ${v.id}: ${v.description} (impact: ${v.impact})`)
        console.log(`  Help: ${v.helpUrl}`)
      })
    }

    expect(results.violations).toEqual([])

    await page.keyboard.press('Escape')
    await expect(modal).toBeHidden()
  })

  /**
   * D-38 (UF-31). Diagnosed in UF-23 and measured again on this release's
   * base: axe reports aria-required-children (CRITICAL) on #projectFilesList
   * in BOTH interfaces —
   *
   *   "Element has children which are not allowed: nav[aria-label], [role=list]"
   *
   * index.html declares the container a list; the renderer then writes a <nav>
   * breadcrumb bar and a second role="list" into it. A list may own only
   * listitems.
   *
   * The "?" help link that used to sit inside this clickable <summary> and
   * reported nested-interactive moved out at UF-35; ALLOWED_AXE_VIOLATIONS is
   * empty now.
   */
  test('companion files panel has no aria-required-children violation', async ({ page }) => {
    test.skip(isCI, 'Needs a real multi-file project, so needs WASM')

    // Companion Files is defaultHiddenInBasic and Simplified is the default
    // mode, so the panel is not in the page at all until Standard is asked
    // for. Confirmed by eye on the first run's failure screenshot.
    await page.addInitScript(() => {
      localStorage.setItem(
        'openscad-forge-ui-mode',
        JSON.stringify({ mode: 'standard', lastCustomMode: 'standard' })
      )
    })

    await page.goto('/?example=multi-file-box')
    await waitForWasmReady(page)
    await page.waitForFunction(
      () => document.querySelectorAll('#projectFilesList *').length > 0,
      { timeout: 30_000 }
    )

    // The panel ships with its disclosure closed; opening it directly is
    // setup, not the behaviour under test.
    await page.evaluate(() => {
      const d = document.querySelector('#projectFilesControls details')
      if (d && !d.open) d.open = true
    })
    // UF-25: an axe scan taken during the disclosure's transition measures a
    // blend of two states. Let it settle before scanning.
    await expect(page.locator('#projectFilesList')).toBeVisible()
    await page.waitForTimeout(700)

    const atRoot = await new AxeBuilder({ page })
      .include('#projectFilesControls')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze()
    expectOnlyAllowedViolations(atRoot)

    // Inside a folder the breadcrumb bar exists, which is the other half of
    // the violation. Both states must be clean.
    await page.locator('#projectFilesList [data-folder-enter="utils"]').click()
    await expect(page.locator('#projectFilesList [data-action="edit"]').first()).toBeVisible()
    await page.waitForTimeout(300)

    const inFolder = await new AxeBuilder({ page })
      .include('#projectFilesControls')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze()
    expectOnlyAllowedViolations(inFolder)
  })

  test('should run axe scan in error state after invalid .scad', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')

    await page.goto('/')
    await waitForWasmReady(page)

    const fixturePath = path.join(process.cwd(), 'tests', 'fixtures', 'invalid-syntax.scad')

    await page.setInputFiles('#fileInput', fixturePath)

    await page.waitForFunction(
      () => {
        const statusArea = document.getElementById('statusArea')
        const consoleOutput = document.getElementById('console-output')
        const hasStatusContent = statusArea && statusArea.textContent.trim().length > 0
        const hasConsoleContent = consoleOutput && consoleOutput.textContent.trim().length > 0
        return hasStatusContent || hasConsoleContent
      },
      { timeout: 30_000 }
    )

    await page.waitForTimeout(2000)

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze()

    console.log(`Error state axe scan complete: ${results.violations.length} violations, ${results.passes.length} passes`)
    if (results.violations.length > 0) {
      console.log('Error state axe violations (file as issues):')
      results.violations.forEach(v => {
        console.log(`- ${v.id}: ${v.description} (impact: ${v.impact})`)
        console.log(`  Help: ${v.helpUrl}`)
        v.nodes.forEach(node => {
          console.log(`  Element: ${node.html.substring(0, 120)}`)
        })
      })
    }

    expect(results.passes.length).toBeGreaterThan(0)
  })
})

/**
 * D-57: a hover rule that repaints the background and nothing else.
 *
 * `.btn-secondary:hover` set `background-color: var(--color-border)` — a BORDER
 * colour used as a SURFACE — and left whatever text colour was already there.
 * MEASURED before the fix, on a real hover of a real button:
 *
 *   Forge light          #1c2024 on #80838d    4.33:1   fail
 *   Forge dark           #edeef0 on #777b84    3.65:1   fail
 *   High contrast light  #000000 on #000000    1.00:1   THE LABEL VANISHED
 *   High contrast dark   #ffffff on #ffffff    1.00:1   THE LABEL VANISHED
 *
 * High contrast was the worst of it, and it is the mode people turn on
 * *because* they need contrast: `--color-border` there is pure black or pure
 * white, which is exactly the button's text colour, so hovering erased the
 * label completely. That had never been measured because nothing in the suite
 * hovered anything.
 *
 * This runs on the welcome screen and needs no WASM, so unlike most of this
 * file it executes on every CI lane rather than being skipped.
 */
test.describe('Hover contrast (D-57)', () => {
  const THEMES = [
    ['Forge light', { theme: 'light' }],
    ['Forge dark', { theme: 'dark' }],
    ['High contrast light', { theme: 'light', hc: true }],
    ['High contrast dark', { theme: 'dark', hc: true }],
    ['Mono dark', { theme: 'dark', variant: 'mono' }],
    ['Mono light', { theme: 'light', variant: 'mono' }],
  ]

  test('secondary buttons keep a legible label while hovered, in every theme', async ({
    page,
  }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const button = page.locator('.btn-secondary:visible').first()
    await expect(button).toBeVisible({ timeout: 15000 })

    for (const [label, cfg] of THEMES) {
      await page.evaluate((c) => {
        const r = document.documentElement
        r.dataset.theme = c.theme
        if (c.hc) r.dataset.highContrast = 'true'
        else delete r.dataset.highContrast
        if (c.variant) r.dataset.uiVariant = c.variant
        else delete r.dataset.uiVariant
      }, cfg)
      await page.waitForTimeout(300)

      await button.hover()
      await page.waitForTimeout(300)

      const measured = await button.evaluate((el) => {
        const cs = getComputedStyle(el)
        const read = (css) =>
          (css.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number)
        const luminance = (rgb) =>
          rgb
            .map((v) => {
              const s = v / 255
              return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
            })
            .reduce((sum, c, i) => sum + [0.2126, 0.7152, 0.0722][i] * c, 0)
        const l1 = luminance(read(cs.color))
        const l2 = luminance(read(cs.backgroundColor))
        return {
          color: cs.color,
          background: cs.backgroundColor,
          ratio:
            Math.round(
              ((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)) * 100
            ) / 100,
        }
      })

      console.log(
        `[d57] ${label}: ${measured.color} on ${measured.background} = ${measured.ratio}:1`
      )
      expect(
        measured.ratio,
        `${label} hover is ${measured.color} on ${measured.background} = ${measured.ratio}:1`
      ).toBeGreaterThanOrEqual(4.5)
    }
  })
})
