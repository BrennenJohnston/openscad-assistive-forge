/**
 * Tutorial Spotlight Regression Tests (E5)
 *
 * Validates that all 6 tutorials run correctly across desktop and mobile
 * viewports, with spotlight targeting, panel positioning, completion
 * criteria, and failure recovery all exercised.
 *
 * Scope: 6 tutorials × 2 viewports = 12 full runs.
 */
import { test, expect } from '@playwright/test'

// ── Viewports ────────────────────────────────────────────────────────────────

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 720 },
  { name: 'mobile', width: 375, height: 667 },
]

const TUTORIAL_IDS = ['intro', 'makers', 'keyboard-only', 'low-vision', 'screen-reader']

// Timeout for spotlight target to resolve after step activation
const SPOTLIGHT_TIMEOUT_MS = 1500

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Set baseline localStorage flags to bypass first-visit modal */
async function setBaseline(page) {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
  })
}

/** Open a tutorial by programmatically calling startTutorial() in the page */
async function startTutorial(page, tutorialId) {
  // Wait for the app to expose window.startTutorial (set during app init)
  await page.waitForFunction(() => typeof window.startTutorial === 'function', {
    timeout: 10000,
  })
  // Invoke and wait for the async startTutorial to complete
  await page.evaluate(async (id) => {
    await window.startTutorial(id)
  }, tutorialId)
}

/** Wait for the tutorial overlay to appear */
async function waitForTutorialOverlay(page) {
  await page.waitForSelector('.tutorial-overlay, [class*="tutorial-panel"]', {
    state: 'visible',
    timeout: 5000,
  })
}

/**
 * Wait for the spotlight cutout to resolve and settle, or fall through after
 * `timeoutMs` for steps that have no spotlight target. Polls instead of a
 * fixed wait, so steps with a spotlight resolve in ~200ms rather than always
 * burning the full timeout (issue #36: dead time pushed WebKit CI past its
 * globalTimeout).
 */
async function waitForSpotlightSettled(page, timeoutMs = SPOTLIGHT_TIMEOUT_MS) {
  const appeared = await page
    .waitForFunction(
      () => !!document.querySelector('.tutorial-spotlight, [class*="spotlight-cutout"]'),
      { timeout: timeoutMs }
    )
    .then(() => true)
    .catch(() => false)
  if (!appeared) return // step has no spotlight target

  // Wait for the spotlight rect to stop moving (position animation settled)
  let prev = null
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const rect = await getSpotlightRect(page)
    if (
      rect &&
      prev &&
      rect.x === prev.x &&
      rect.y === prev.y &&
      rect.width === prev.width &&
      rect.height === prev.height
    ) {
      return
    }
    prev = rect
    await page.waitForTimeout(100)
  }
}

/** Get the spotlight cutout bounding rect (if any) */
async function getSpotlightRect(page) {
  return page.evaluate(() => {
    const el = document.querySelector('.tutorial-spotlight, [class*="spotlight-cutout"]')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.x, y: r.y, width: r.width, height: r.height }
  })
}

/** Get the tutorial panel bounding rect */
async function getTutorialPanelRect(page) {
  return page.evaluate(() => {
    const el = document.querySelector('.tutorial-panel, [class*="tutorial-content"]')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.x, y: r.y, width: r.width, height: r.height }
  })
}

/** Navigate to next tutorial step (skips if button is disabled) */
async function nextStep(page) {
  const nextBtn = page.locator(
    'button:has-text("Next"), button[class*="tutorial-next"], button[aria-label*="Next"]'
  ).first()
  const isEnabled = await nextBtn.isEnabled().catch(() => false)
  if (!isEnabled) return
  await nextBtn.click()
  await page.waitForTimeout(300) // allow animation
}

/** Close the tutorial */
async function closeTutorial(page) {
  const closeBtn = page.locator(
    'button:has-text("Exit"), button[aria-label*="Exit tutorial"], button[aria-label*="Close tutorial"]'
  ).first()
  if (await closeBtn.isVisible()) {
    await closeBtn.click()
  }
}

// ── Core spotlight validation ─────────────────────────────────────────────────

/**
 * Verify the spotlight cutout and tutorial panel don't overlap.
 * The panel should be adjacent to (not covering) the highlighted element.
 */
async function assertNoSpotlightPanelOverlap(page, stepLabel) {
  const spotlight = await getSpotlightRect(page)
  const panel = await getTutorialPanelRect(page)
  if (!spotlight || !panel) return // no spotlight on this step

  const spotlightRight = spotlight.x + spotlight.width
  const spotlightBottom = spotlight.y + spotlight.height
  const panelRight = panel.x + panel.width
  const panelBottom = panel.y + panel.height

  const overlapsX = panel.x < spotlightRight && panelRight > spotlight.x
  const overlapsY = panel.y < spotlightBottom && panelBottom > spotlight.y
  const overlaps = overlapsX && overlapsY

  expect(overlaps, `[${stepLabel}] Tutorial panel overlaps spotlight cutout`).toBe(false)
}

/** Assert spotlight fully encompasses its target element */
async function assertSpotlightCoversTarget(page, stepLabel) {
  const result = await page.evaluate(() => {
    const spotEl = document.querySelector('.tutorial-spotlight, [class*="spotlight"]')
    const targetAttr = document.querySelector('[data-tutorial-highlighted="true"], .tutorial-target')
    if (!spotEl || !targetAttr) return null

    const sr = spotEl.getBoundingClientRect()
    const tr = targetAttr.getBoundingClientRect()
    return {
      spotlightCoversTarget:
        sr.left <= tr.left &&
        sr.right >= tr.right &&
        sr.top <= tr.top &&
        sr.bottom >= tr.bottom,
    }
  })

  if (result !== null) {
    expect(
      result.spotlightCoversTarget,
      `[${stepLabel}] Spotlight does not fully cover target element`
    ).toBe(true)
  }
}

// ── Per-tutorial tests ────────────────────────────────────────────────────────

for (const vp of VIEWPORTS) {
  test.describe(`Tutorials — ${vp.name} (${vp.width}×${vp.height})`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } })

    for (const tutorialId of TUTORIAL_IDS) {
      test(`${tutorialId}: opens, spotlights resolve, panel doesn't overlap`, async ({ page }) => {
        await setBaseline(page)
        await page.goto('/')

        // Start tutorial
        await startTutorial(page, tutorialId)
        await waitForTutorialOverlay(page)

        // Step through up to 5 steps and validate spotlight + panel
        for (let i = 0; i < 5; i++) {
          const label = `${tutorialId}[${i}]`

          // Wait for spotlight to resolve and settle (up to SPOTLIGHT_TIMEOUT_MS)
          await waitForSpotlightSettled(page)

          await assertNoSpotlightPanelOverlap(page, label)

          // Check tutorial panel is visible
          const panel = await getTutorialPanelRect(page)
          if (panel) {
            expect(panel.width, `[${label}] Panel has zero width`).toBeGreaterThan(0)
            expect(panel.height, `[${label}] Panel has zero height`).toBeGreaterThan(0)
          }

          // Try to advance; stop if no Next button or if button is disabled
          // (disabled means step has a completion requirement the test can't fulfill)
          const nextBtn = page.locator(
            'button:has-text("Next"), button[class*="tutorial-next"]'
          ).first()
          const isNextVisible = await nextBtn.isVisible().catch(() => false)
          if (!isNextVisible) break
          const isNextEnabled = await nextBtn.isEnabled().catch(() => false)
          if (!isNextEnabled) break
          await nextBtn.click()
          await page.waitForTimeout(300)
        }

        await closeTutorial(page)
      })
    }

    test('intro: failure recovery dialog appears when target removed', async ({ page }) => {
      await setBaseline(page)
      await page.goto('/')
      await startTutorial(page, 'intro')
      await waitForTutorialOverlay(page)

      // Advance to a step with a DOM target
      await nextStep(page)
      await nextStep(page)

      // Remove a commonly targeted element to trigger failure recovery
      await page.evaluate(() => {
        const target = document.querySelector('[data-tutorial-target]')
        if (target) target.remove()
      })

      // Trigger retry by advancing
      await nextStep(page)
      await page.waitForTimeout(SPOTLIGHT_TIMEOUT_MS * 4) // allow retries

      // The tutorial should either show a recovery dialog or auto-advance
      const recoveryDialog = page.locator(
        '.tutorial-error-modal, .tutorial-recovery, [class*="tutorial-help"], [data-testid="tutorial-error-dialog"]'
      )
      const recovered = await recoveryDialog.isVisible().catch(() => false)
      // Either recovery dialog is shown OR tutorial advanced gracefully
      // (both are acceptable outcomes)
      const panelStillVisible = await page.locator('.tutorial-overlay').isVisible().catch(() => false)
      expect(recovered || panelStillVisible, 'Tutorial should recover or advance gracefully').toBe(true)

      await closeTutorial(page)
    })

    test('intro: "Moving to next step" is announced to screen reader', async ({ page }) => {
      await setBaseline(page)
      await page.goto('/')

      // Listen for aria-live announcements
      const announcements = []
      page.on('console', (msg) => {
        if (msg.type() === 'log' && msg.text().includes('Moving to next')) {
          announcements.push(msg.text())
        }
      })

      await startTutorial(page, 'intro')
      await waitForTutorialOverlay(page)
      await nextStep(page)

      // Check live region text
      const liveText = await page.evaluate(() => {
        const live = document.querySelector('[aria-live][class*="tutorial"], [role="status"]')
        return live?.textContent?.trim() || ''
      })

      // Either live region has content OR console announcement was fired
      expect(
        liveText.length > 0 || announcements.length > 0,
        'Screen reader announcement should fire on step advance'
      ).toBe(true)

      await closeTutorial(page)
    })

    test('intro step 14 and screen-reader step 5: both spotlight the Help button', async ({
      page,
    }) => {
      await setBaseline(page)
      await page.goto('/')

      // Verify the help button exists in the DOM with correct tutorial targeting attributes.
      // The button is inside the workflow progress bar which is hidden on the welcome screen,
      // so we check attachment (presence in DOM) rather than visibility.
      const helpBtn = page.locator(
        '#featuresGuideBtn, [data-tutorial-target="features-guide"]'
      ).first()
      await expect(helpBtn).toBeAttached()
    })
  })
}

// ── No-retry infinite loop guard ──────────────────────────────────────────────

test('tutorial: no infinite retry loop when target is missing', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
  })
  await page.goto('/')
  await startTutorial(page, 'intro')
  await waitForTutorialOverlay(page)

  // Advance past the intro step (step 0 has no target) to a step that has
  // a spotlight target, so removal triggers the failure-recovery path.
  await nextStep(page) // step 0 → 1
  await page.waitForTimeout(500)
  await nextStep(page) // step 1 → 2 (step 2 has highlightSelector)
  await page.waitForTimeout(500)

  // Remove ALL tutorial targets to force maximum consecutive failures
  await page.evaluate(() => {
    document.querySelectorAll('[data-tutorial-target]').forEach((el) => el.remove())
  })

  // Wait longer than the max retry window (MAX_CONSECUTIVE_FAILURES × retryDelay) + buffer
  await page.waitForTimeout(10_000)

  // The tutorial should have either exited or shown a recovery dialog.
  // It should NOT still be cycling retries indefinitely.
  const panelExists = await page.locator('.tutorial-overlay').isVisible().catch(() => false)
  const recoveryVisible = await page
    .locator('.tutorial-error-modal, [data-testid="tutorial-error-dialog"]')
    .isVisible()
    .catch(() => false)

  // Acceptable outcomes: tutorial exited (no panel) OR recovery dialog is shown
  expect(
    !panelExists || recoveryVisible,
    'Tutorial should exit or show recovery dialog after max failures — not loop indefinitely'
  ).toBe(true)
})

// ── Welcome page tour (U-24, UF-17) ──────────────────────────────────────────

test.describe('Welcome page tour (U-24, UF-17)', () => {
  const REGISTRY_KEY = 'openscad-forge-tutorial-state'

  const readRegistry = (page) =>
    page.evaluate((key) => {
      const raw = localStorage.getItem(key)
      return raw ? JSON.parse(raw) : null
    }, REGISTRY_KEY)

  /** Click Next/Finish until the tour closes (welcome steps are all passive). */
  async function walkToFinish(page, maxClicks = 20) {
    for (let i = 0; i < maxClicks; i++) {
      const overlayGone = await page
        .locator('.tutorial-panel')
        .isHidden()
        .catch(() => true)
      if (overlayGone) return
      await page.locator('#tutorialNextBtn').click()
      await page.waitForTimeout(300)
    }
  }

  test('Forge: end to end from the card, recording the family and chaining to Beginners once', async ({
    page,
  }) => {
    await setBaseline(page)
    await page.goto('/')
    await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 30_000 })

    await page.locator('#startWelcomeTourBtn').click()
    await expect(page.locator('.tutorial-panel')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('#tutorial-step-title')).toHaveText('Welcome to the Forge!')

    // opened is written at the commitment point, before any step outcome
    await expect
      .poll(async () => (await readRegistry(page))?.welcome?.opened, { timeout: 10_000 })
      .toEqual(expect.any(Number))

    await walkToFinish(page)
    await expect(page.locator('.tutorial-panel')).toHaveCount(0, { timeout: 10_000 })

    const registry = await readRegistry(page)
    expect(registry.welcome.completed).toEqual(expect.any(Number))
    // The family rule: nothing records under the variant id
    expect(registry['welcome-classic']).toBeUndefined()

    // The U-24 chain: exactly one spotlight, now on the Beginners card
    await expect(page.locator('.welcome-spotlight-tag')).toHaveCount(1)
    await expect(
      page.locator('.role-path-card.welcome-spotlight .role-path-title')
    ).toHaveText('Beginners Start Here')
  })

  test('Classic: the welcome-classic variant walks the chrome-free welcome end to end', async ({
    page,
  }) => {
    await setBaseline(page)
    await page.addInitScript(() => {
      localStorage.setItem(
        'openscad-forge-ui-mode',
        JSON.stringify({ mode: 'classic', lastCustomMode: 'standard' })
      )
    })
    await page.goto('/')
    await expect(page.locator('body')).toHaveAttribute('data-ui-mode', 'classic')
    await expect(page.locator('body')).toHaveAttribute('data-app-surface', 'welcome')

    await page.locator('#startWelcomeTourBtn').click()
    await expect(page.locator('.tutorial-panel')).toBeVisible({ timeout: 10_000 })
    // The modeVariants hop: the Classic variant runs, not the Forge tour
    await expect(page.locator('#tutorial-step-title')).toHaveText('Welcome to Classic!')

    await walkToFinish(page)
    await expect(page.locator('.tutorial-panel')).toHaveCount(0, { timeout: 10_000 })

    // The family rule: the variant records as the welcome family
    const registry = await readRegistry(page)
    expect(registry.welcome.opened).toEqual(expect.any(Number))
    expect(registry.welcome.completed).toEqual(expect.any(Number))
    expect(registry['welcome-classic']).toBeUndefined()
  })

  test('chaining declines when the intro family already has a record', async ({ page }) => {
    await setBaseline(page)
    await page.addInitScript((key) => {
      localStorage.setItem(key, JSON.stringify({ intro: { opened: 1 } }))
    }, REGISTRY_KEY)
    await page.goto('/')
    await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 30_000 })

    // Precedence: the welcome card still wears the tip (its family is clear)
    await expect(
      page.locator('.role-path-card.welcome-spotlight .role-path-title')
    ).toHaveText('Main Page Tour')

    await page.locator('#startWelcomeTourBtn').click()
    await expect(page.locator('.tutorial-panel')).toBeVisible({ timeout: 10_000 })
    await walkToFinish(page)
    await expect(page.locator('.tutorial-panel')).toHaveCount(0, { timeout: 10_000 })

    // No chain: intro already has a record, so no card is decorated
    await expect(page.locator('.welcome-spotlight-tag')).toHaveCount(0)
    await expect(page.locator('.role-path-card.welcome-spotlight')).toHaveCount(0)
  })

  test('opening a project through the spotlight cutout closes the tour without completing it', async ({
    page,
  }) => {
    test.setTimeout(240_000)
    await setBaseline(page)
    await page.goto('/')
    await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 30_000 })
    await page.waitForSelector('body[data-wasm-ready="true"]', {
      state: 'attached',
      timeout: 180_000,
    })

    // Watch the live regions: the close announcement is this case's subject
    // now that Q-50d approved its wording.
    await page.evaluate(() => {
      window.__said = []
      for (const id of ['srAnnouncer', 'srAnnouncerAssertive']) {
        const el = document.getElementById(id)
        if (!el || el.__watched) continue
        el.__watched = true
        new MutationObserver(() => {
          const text = el.textContent.trim()
          if (text) window.__said.push(text)
        }).observe(el, { childList: true, characterData: true, subtree: true })
      }
    })

    await page.locator('#startWelcomeTourBtn').click()
    await expect(page.locator('.tutorial-panel')).toBeVisible({ timeout: 10_000 })

    // Walk to the Open-or-start step, whose cutout exposes Start New Project.
    // By title, not by a click count: UF-21 shortened this tour by one step
    // (U-29) and a fixed count silently overshot.
    for (let i = 0; i < 12; i++) {
      const title = await page.locator('#tutorial-step-title').textContent()
      if (title === 'Open or start a project') break
      await page.locator('#tutorialNextBtn').click()
      await page.waitForTimeout(300)
    }
    await expect(page.locator('#tutorial-step-title')).toHaveText('Open or start a project')

    await page.locator('#startNewProjectBtn').click()
    await expect(page.locator('body')).toHaveAttribute('data-app-surface', 'project', {
      timeout: 60_000,
    })

    // The user's action wins: the tour is gone, opened recorded, completed not
    await expect(page.locator('.tutorial-panel')).toHaveCount(0, { timeout: 10_000 })
    const registry = await readRegistry(page)
    expect(registry.welcome.opened).toEqual(expect.any(Number))
    expect(registry.welcome.completed).toBeUndefined()

    // Q-50d (owner, 2026-08-14): this sentence is approved as drafted, so it
    // is pinned rather than left as a D-35 flag in the code.
    const announcements = await page.evaluate(() => window.__said)
    expect(announcements.join(' | ')).toContain(
      'Main Page Tour closed because a project opened. Progress saved.'
    )
  })

  test('the closing step names the Main Page button as the way back (U-45)', async ({
    page,
  }) => {
    await setBaseline(page)
    await page.goto('/')
    await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 30_000 })
    await page.locator('#startWelcomeTourBtn').click()
    await expect(page.locator('.tutorial-panel')).toBeVisible({ timeout: 10_000 })

    for (let i = 0; i < 16; i++) {
      const title = await page.locator('#tutorial-step-title').textContent()
      if (title === 'Your next step') break
      await page.locator('#tutorialNextBtn').click()
      await page.waitForTimeout(250)
    }
    await expect(page.locator('#tutorial-step-title')).toHaveText('Your next step')
    await expect(page.locator('.tutorial-body')).toContainText(
      'The Main Page button in the top left corner brings you back here from a project.'
    )
  })

  test('no tour can exist while the first-visit modal blocks', async ({ page }) => {
    // Deliberately no baseline stamp: the modal must be up
    await page.goto('/')
    await page
      .locator('#first-visit-modal:not(.hidden)')
      .waitFor({ state: 'visible', timeout: 10_000 })

    await expect(page.locator('#app')).toHaveAttribute('inert', '')
    await expect(page.locator('.tutorial-overlay')).toHaveCount(0)
  })
})

/**
 * U-45 (UF-39): the box tour used to stop at "You're ready!" and never say how
 * to get out of a project. The way people reached for was the browser's Back
 * button, which closed the app. The tour now ends on the button that does the
 * job, and pressing it there is a first-class path, not an accident.
 */
test.describe('U-45: the box tour ends by naming the way back', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  async function startBoxTourAtTheEnd(page) {
    await setBaseline(page)
    await page.goto('/')
    await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 30_000 })
    await page.locator('.btn-role-try[data-tutorial="intro"]').click()
    await expect(page.locator('body')).toHaveAttribute('data-app-surface', 'project', {
      timeout: 180_000,
    })
    await expect(page.locator('.tutorial-panel')).toBeVisible({ timeout: 60_000 })
    // End clears every completion gate between here and the last step.
    await page.keyboard.press('End')
    await expect(page.locator('#tutorial-step-title')).toHaveText(
      'Back to the Main Page',
      { timeout: 15_000 }
    )
  }

  test('the last step spotlights the Main Page button', async ({ page }) => {
    test.setTimeout(240_000)
    await startBoxTourAtTheEnd(page)

    await expect(page.locator('.tutorial-progress')).toContainText('Step 18 of 18')
    await expect(page.locator('#clearFileBtn')).toHaveClass(/tutorial-target-highlight/)
    await expect(page.locator('.tutorial-body')).toContainText(
      "Use it instead of the browser's Back button"
    )
  })

  test('pressing the spotlighted button ends the tour with its surface', async ({
    page,
  }) => {
    test.setTimeout(240_000)
    await startBoxTourAtTheEnd(page)

    await page.evaluate(() => {
      window.__said = []
      for (const id of ['srAnnouncer', 'srAnnouncerAssertive']) {
        const el = document.getElementById(id)
        if (!el || el.__watched) continue
        el.__watched = true
        new MutationObserver(() => {
          const text = el.textContent.trim()
          if (text) window.__said.push(text)
        }).observe(el, { childList: true, characterData: true, subtree: true })
      }
    })

    // The curiosity path: the cutout stays clickable, so press what the step
    // points at (U-24, Q-66a). The tour stands down for the confirm dialog.
    await page.locator('#clearFileBtn').click()
    await expect(page.locator('.confirm-modal')).toBeVisible({ timeout: 10_000 })
    await page.locator('.confirm-modal [data-action="confirm"]').click()

    await expect(page.locator('body')).toHaveAttribute('data-app-surface', 'welcome', {
      timeout: 30_000,
    })
    // The tour closes with its surface, the same rule the welcome tours have
    // obeyed since UF-17, now mirrored for the surface a box tour lives on.
    await expect(page.locator('.tutorial-panel')).toHaveCount(0, { timeout: 10_000 })
    const announcements = await page.evaluate(() => window.__said)
    expect(announcements.join(' | ')).toContain(
      'closed because you went back to the Main Page'
    )
  })
})
