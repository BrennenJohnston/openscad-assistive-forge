import { test, expect } from '@playwright/test'
import path from 'path'

// Classic mode (desktop-OpenSCAD-style layout) — C4 acceptance.
//
// Classic is gated on the classic_mode feature flag (default ON since C4.6);
// flag-off behavior is covered via the URL override. Mode switching goes
// through the real UI: the header Classic toggle, the Simplified/Standard
// switch, and View > Interface Mode radios.

const FIXTURE = path.join(process.cwd(), 'tests', 'fixtures', 'sample.scad')

const WASM_READY_TIMEOUT = 180_000

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
  })
})

async function loadSampleProject(page, { query = '' } = {}) {
  await page.goto(`/${query}`)
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: WASM_READY_TIMEOUT,
  })

  await page.locator('#fileInput').setInputFiles(FIXTURE)
  await expect(page.locator('#welcomeScreen')).toBeHidden({ timeout: 30_000 })
  await expect(page.locator('#mainInterface')).toBeVisible({ timeout: 10_000 })

  const notNowBtn = page.locator('#saveProjectNotNow')
  try {
    await notNowBtn.waitFor({ state: 'visible', timeout: 3_000 })
    await notNowBtn.click()
  } catch {
    // Save-project modal did not appear; nothing to dismiss.
  }
}

async function switchToStandardMode(page) {
  const toggle = page.locator('#uiModeToggle')
  await expect(toggle).toBeVisible({ timeout: 10_000 })
  if ((await toggle.getAttribute('aria-checked')) !== 'true') {
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-checked', 'true')
  }
}

async function pickInterfaceMode(page, radioName) {
  await page.locator('#viewMenuBtn').click()
  const radio = page.getByRole('menuitemradio', { name: radioName })
  await expect(radio).toBeVisible({ timeout: 5_000 })
  await radio.click()
}

test.describe('Classic header toggle (C1)', () => {
  test('classic-header-toggle: always-visible button enters classic and returns to the remembered custom mode', async ({
    page,
  }) => {
    test.setTimeout(240_000)

    await loadSampleProject(page)

    const classicToggle = page.locator('#classicModeToggle')
    await expect(classicToggle).toBeVisible()
    await expect(classicToggle).toHaveAttribute('aria-pressed', 'false')

    // Enter classic straight from the default Simplified mode
    await classicToggle.click()
    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'classic'
    )
    await expect(classicToggle).toHaveAttribute('aria-pressed', 'true')

    // The View menu radio agrees with the header toggle
    await page.locator('#viewMenuBtn').click()
    await expect(
      page.getByRole('menuitemradio', { name: /Classic/ })
    ).toHaveAttribute('aria-checked', 'true')
    await page.keyboard.press('Escape')

    // Exiting returns to the mode the user came FROM (simplified, not standard)
    await classicToggle.click()
    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'simplified'
    )
    await expect(classicToggle).toHaveAttribute('aria-pressed', 'false')

    // From Standard, the round-trip remembers standard
    await switchToStandardMode(page)
    await classicToggle.click()
    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'classic'
    )
    await classicToggle.click()
    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'standard'
    )
  })

  test('classic mode persists across reload and exit still returns to the remembered mode', async ({
    page,
  }) => {
    test.setTimeout(240_000)

    await loadSampleProject(page)
    await switchToStandardMode(page)

    const classicToggle = page.locator('#classicModeToggle')
    await classicToggle.click()
    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'classic'
    )

    await page.reload()
    await page.waitForSelector('body[data-wasm-ready="true"]', {
      state: 'attached',
      timeout: WASM_READY_TIMEOUT,
    })
    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'classic'
    )
    await expect(classicToggle).toHaveAttribute('aria-pressed', 'true')

    await classicToggle.click()
    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'standard'
    )
  })

  test('header toggle is hidden when the classic_mode flag is off', async ({
    page,
  }) => {
    test.setTimeout(240_000)

    await page.goto('/?flag_classic_mode=false')
    await page.waitForSelector('body[data-wasm-ready="true"]', {
      state: 'attached',
      timeout: WASM_READY_TIMEOUT,
    })

    await expect(page.locator('#classicModeToggle')).toHaveClass(/hidden/)
  })
})

test.describe('Classic chrome strip (C3)', () => {
  test('classic-strips-custom-chrome: Forge chrome hides in classic and returns on exit', async ({
    page,
  }) => {
    test.setTimeout(240_000)

    await loadSampleProject(page)
    await switchToStandardMode(page)

    // Sanity: the chrome exists in the custom modes
    for (const sel of [
      '#uiModeToggle',
      '#actionsBar',
      '#paramPanel > .panel-header',
      '#clearFileBtn',
    ]) {
      await expect(page.locator(sel)).toBeVisible()
    }

    await page.locator('#classicModeToggle').click()
    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'classic'
    )

    const hiddenInClassic = [
      '#uiModeToggle',
      '#focusModeBtn',
      '#featuresGuideBtn',
      '#clearFileBtn',
      '#actionsBar',
      '#previewInfoSection',
      '#previewDrawerToggle',
      '#paramSearchSection',
      '.output-format-section',
      '#paramPanel > .panel-header',
      '#cameraPanel',
    ]
    for (const sel of hiddenInClassic) {
      await expect(
        page.locator(sel).first(),
        `${sel} must be hidden in classic`
      ).toBeHidden()
    }

    // The desktop-style menu bar and all six menus stay visible
    await expect(page.locator('#toolbarMenuBar')).toBeVisible()
    for (const id of [
      '#fileMenuBtn',
      '#editMenuBtn',
      '#designMenuBtn',
      '#viewMenuBtn',
      '#windowMenuBtn',
      '#helpMenuBtn',
    ]) {
      await expect(page.locator(id)).toBeVisible()
    }

    // Exit restores the chrome
    await page.locator('#classicModeToggle').click()
    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'standard'
    )
    for (const sel of [
      '#uiModeToggle',
      '#actionsBar',
      '#paramPanel > .panel-header',
      '#clearFileBtn',
    ]) {
      await expect(page.locator(sel)).toBeVisible()
    }
  })
})

test.describe('Classic acceptance (C13)', () => {
  test('classic-menu-reachability: every hidden control has a menu home', async ({
    page,
  }) => {
    test.setTimeout(240_000)

    await loadSampleProject(page)
    await page.locator('#classicModeToggle').click()
    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'classic'
    )

    // No "(planned)" stubs anywhere in the menus
    for (const menuBtn of [
      '#fileMenuBtn',
      '#designMenuBtn',
      '#viewMenuBtn',
      '#windowMenuBtn',
    ]) {
      await page.locator(menuBtn).click()
      const menuText = await page
        .locator('.toolbar-menu-modal:not(.hidden)')
        .textContent()
      expect(menuText, `${menuBtn} has no planned stubs`).not.toContain(
        '(planned)'
      )
      await page.keyboard.press('Escape')
    }

    // Design > Automatic Reload and Preview is a real, checkable toggle
    await page.locator('#designMenuBtn').click()
    await expect(
      page.getByRole('menuitemcheckbox', {
        name: 'Automatic Reload and Preview',
      })
    ).toBeVisible()
    await page.keyboard.press('Escape')

    // Window > Customizer hides and restores the dock
    await page.locator('#windowMenuBtn').click()
    await page.getByRole('menuitemcheckbox', { name: 'Customizer' }).click()
    await expect(page.locator('#paramPanel')).toBeHidden()
    await page.locator('#windowMenuBtn').click()
    await page.getByRole('menuitemcheckbox', { name: 'Customizer' }).click()
    await expect(page.locator('#paramPanel')).toBeVisible()

    // View > Preview Quality submenu proxies the real select
    await page.locator('#viewMenuBtn').click()
    const qualitySubmenu = page.getByRole('menuitem', {
      name: 'Preview Quality',
    })
    await expect(qualitySubmenu).toBeVisible()
    await page.keyboard.press('Escape')

    // File > Close returns to the welcome screen (accept the unsaved-changes
    // confirmation the #clearFileBtn handler shows)
    await page.locator('#fileMenuBtn').click()
    await page.getByRole('menuitem', { name: 'Close', exact: true }).click()
    await page
      .locator('button:has-text("Confirm")')
      .first()
      .click({ timeout: 5_000 })
    await expect(page.locator('#welcomeScreen')).toBeVisible({
      timeout: 10_000,
    })
  })

  test('classic-midwidth: 900px classic stacks with all panes reachable', async ({
    page,
  }) => {
    test.setTimeout(240_000)

    await page.setViewportSize({ width: 900, height: 800 })
    await loadSampleProject(page)
    await page.locator('#classicModeToggle').click()
    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'classic'
    )

    await expect(page.locator('.preview-panel')).toBeVisible()
    await expect(page.locator('#paramPanel')).toBeVisible()
    await expect(page.locator('#classicConsoleSlot')).toBeVisible()
    await expect(page.locator('#classicEditorSlot')).toBeVisible()
    await expect(page.locator('#cameraPanel')).toBeHidden()

    // No horizontal page scroll in the stacked layout
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth
    )
    expect(overflow, 'no horizontal overflow').toBeLessThanOrEqual(1)
  })

  test('reduced-motion: classic folds complete instantly', async ({
    page,
  }) => {
    test.setTimeout(240_000)

    await page.emulateMedia({ reducedMotion: 'reduce' })
    await loadSampleProject(page)
    await page.locator('#classicModeToggle').click()
    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'classic'
    )

    // The app-wide reduced-motion rule clamps durations to ~0.01ms (the
    // standard can't-observe trick), so assert "effectively instant".
    const duration = await page
      .locator('#classicConsoleSlot .classic-fold')
      .evaluate((el) => parseFloat(getComputedStyle(el).transitionDuration))
    expect(
      duration,
      'fold transition effectively instant under reduced motion'
    ).toBeLessThan(0.005)
  })
})

test.describe('Classic mode layout (C4)', () => {
  test('entering Classic moves console and presets into pane slots, exiting restores them', async ({
    page,
  }) => {
    test.setTimeout(240_000)

    await loadSampleProject(page, { query: '?flag_classic_mode=true' })
    await switchToStandardMode(page)

    // Open a parameter group so the Classic startup contract (all groups
    // collapsed) is observable rather than trivially true
    const firstGroup = page.locator('details.param-group').first()
    await expect(firstGroup).toBeVisible({ timeout: 15_000 })
    if (!(await firstGroup.evaluate((el) => el.open))) {
      await firstGroup.locator('summary').click()
    }
    await expect(firstGroup).toHaveJSProperty('open', true)

    // Record the original DOM location of the panes to be moved
    const originalParents = await page.evaluate(() => ({
      console: document.getElementById('consolePanel')?.parentElement?.id,
      presets: document.getElementById('presetControls')?.parentElement?.id,
    }))
    expect(originalParents.console).toBeTruthy()
    expect(originalParents.presets).toBeTruthy()

    await pickInterfaceMode(page, 'Classic (Desktop Layout)')

    await expect(page.locator('body')).toHaveAttribute('data-ui-mode', 'classic')

    // Console pane: moved into its labelled slot and forced open
    const consoleSlot = page.locator('#classicConsoleSlot')
    await expect(consoleSlot).toBeVisible()
    await expect(consoleSlot.locator('#consolePanel')).toHaveCount(1)
    await expect(page.locator('#consolePanel')).toHaveAttribute('open', '')

    // Presets: moved INTO the Customizer dock's preset row (C7); the old
    // standalone presets slot no longer exists
    await expect(page.locator('#classicPresetsSlot')).toHaveCount(0)
    await expect(
      page.locator('#classicPresetRow #presetControls')
    ).toHaveCount(1)
    await expect(page.locator('#classicCustomizerBar')).toBeVisible()

    // Editor pane (C5): visible by default alongside the customizer
    const editorSlot = page.locator('#classicEditorSlot')
    await expect(editorSlot).toBeVisible()
    await expect(editorSlot.locator('#expertModePanel')).toHaveCount(1)
    await expect(page.locator('#parametersContainer')).toBeVisible()

    // Display + customizer panes still present
    await expect(page.locator('.preview-panel')).toBeVisible()
    await expect(page.locator('#paramPanel')).toBeVisible()

    // Startup contract: every customizer group is collapsed on entry
    const openGroups = await page
      .locator('#parametersContainer details.param-group[open]')
      .count()
    expect(openGroups, 'all param groups collapsed in Classic').toBe(0)

    // Icon toolbar (C6): docked under the menu bar with snap views, overlay
    // toggles, bed-size select, and Preview/Render — chokusen icons render
    const toolbar = page.locator('#classicToolbar')
    await expect(toolbar).toBeVisible()
    await expect(toolbar.locator('[data-classic-view]')).toHaveCount(7)
    await expect(toolbar.locator('#classicRenderBtn')).toBeVisible()
    const toolbarBox = await toolbar.boundingBox()
    const menuBox = await page.locator('#toolbarMenuBar').boundingBox()
    expect(
      toolbarBox.y,
      'toolbar sits below the menu bar'
    ).toBeGreaterThanOrEqual(menuBox.y)
    const iconImage = await toolbar
      .locator('.classic-icon[data-icon="render"]')
      .evaluate((el) => getComputedStyle(el).backgroundImage)
    expect(iconImage, 'vendored icon resolves').toContain('openscad-icons')
    const bedOptions = await toolbar
      .locator('#classicGridSizeSelect option')
      .count()
    expect(bedOptions, 'bed-size select populated from grid presets').toBeGreaterThan(3)

    // Axes toggle reflects pressed state
    const axesToggle = toolbar.locator('#classicAxesToggle')
    const before = await axesToggle.getAttribute('aria-pressed')
    await axesToggle.click()
    await expect(axesToggle).toHaveAttribute(
      'aria-pressed',
      before === 'true' ? 'false' : 'true'
    )
    await axesToggle.click()

    // Window-bottom status bar (C8): visible at the bottom, mirroring the
    // hidden in-viewport overlay's text; only one aria-live status source
    const statusBar = page.locator('#classicStatusBar')
    await expect(statusBar).toBeVisible()
    await expect(page.locator('#previewStatusBar')).toBeHidden()
    const barBox = await statusBar.boundingBox()
    const viewport = page.viewportSize()
    expect(
      barBox.y + barBox.height,
      'status bar sits at the window bottom'
    ).toBeGreaterThan(viewport.height * 0.8)
    await expect
      .poll(async () =>
        page.locator('#classicStatusText').evaluate((el) => el.textContent)
      )
      .toBe(
        await page
          .locator('#previewStatusText')
          .evaluate((el) => el.textContent)
      )

    // Console fold (C10): the titlebar button folds the console pane and
    // the display pane grows into the freed row
    const consoleFold = page.locator('#classicConsoleFoldBtn')
    await expect(consoleFold).toBeVisible()
    const displayBefore = await page
      .locator('.preview-panel')
      .boundingBox()
    await consoleFold.click()
    await expect(page.locator('body')).toHaveAttribute(
      'data-classic-console-collapsed',
      'true'
    )
    await expect
      .poll(
        async () => (await page.locator('.preview-panel').boundingBox()).height
      )
      .toBeGreaterThan(displayBefore.height)
    await consoleFold.click()
    await expect(page.locator('body')).toHaveAttribute(
      'data-classic-console-collapsed',
      'false'
    )

    // Exit back to Standard: exact DOM restore, slots removed
    await pickInterfaceMode(page, 'Standard')
    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'standard'
    )

    const restoredParents = await page.evaluate(() => ({
      console: document.getElementById('consolePanel')?.parentElement?.id,
      presets: document.getElementById('presetControls')?.parentElement?.id,
    }))
    expect(restoredParents.console).toBe(originalParents.console)
    expect(restoredParents.presets).toBe(originalParents.presets)
    await expect(page.locator('#classicConsoleSlot')).toHaveCount(0)
    await expect(page.locator('#classicEditorSlot')).toHaveCount(0)
    await expect(page.locator('#classicToolbar')).toBeHidden()
    await expect(page.locator('#classicCustomizerBar')).toBeHidden()
  })

  test('preset copy and unsaved-changes guard (C4.4)', async ({ page }) => {
    test.setTimeout(240_000)

    // Legacy native select (combobox flag off) so the test can drive the
    // preset dropdown directly
    await loadSampleProject(page, {
      query: '?flag_classic_mode=true&flag_searchable_combobox=false',
    })
    await switchToStandardMode(page)
    await pickInterfaceMode(page, 'Classic (Desktop Layout)')
    await expect(page.locator('body')).toHaveAttribute('data-ui-mode', 'classic')

    const presetSelect = page.locator('#presetSelect')

    // Ken's contract: "design default values" is the first real entry
    await expect(presetSelect.locator('option').nth(1)).toHaveText(
      'design default values'
    )

    // Copy design defaults into a new preset; it becomes the selection
    await presetSelect.selectOption('__design_defaults__')
    await page.locator('#copyPresetBtn').click()
    await expect(
      presetSelect.locator('option', {
        hasText: 'design default values (copy)',
      })
    ).toHaveCount(1)
    const copyValue = await presetSelect.inputValue()
    expect(copyValue).not.toBe('__design_defaults__')
    expect(copyValue).not.toBe('')

    // Dirty the copy: change a parameter
    const firstGroup = page.locator('details.param-group').first()
    await firstGroup.locator('summary').click()
    const widthInput = page.locator('.param-group input[type="number"]').first()
    await expect(widthInput).toBeVisible({ timeout: 15_000 })
    await widthInput.fill('77')
    await widthInput.blur()

    // Switching away now prompts; Cancel keeps the dirty preset selected
    await presetSelect.selectOption('__design_defaults__')
    const dialog = page.locator('dialog', {
      hasText: 'Unsaved preset changes',
    })
    await expect(dialog).toBeVisible({ timeout: 10_000 })
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(presetSelect).toHaveValue(copyValue)

    // Switching again and discarding completes the switch
    await presetSelect.selectOption('__design_defaults__')
    await expect(dialog).toBeVisible({ timeout: 10_000 })
    await dialog.getByRole('button', { name: 'Discard changes' }).click()
    await expect(presetSelect).toHaveValue('__design_defaults__')
  })

  test('Classic radio is absent when the classic_mode flag is off', async ({
    page,
  }) => {
    test.setTimeout(240_000)

    // classic_mode defaults on since C4.6; force it off via URL override
    await loadSampleProject(page, { query: '?flag_classic_mode=false' })
    await switchToStandardMode(page)

    await page.locator('#viewMenuBtn').click()
    await expect(
      page.getByRole('menuitemradio', { name: 'Standard' })
    ).toBeVisible({ timeout: 5_000 })
    await expect(
      page.getByRole('menuitemradio', { name: 'Classic (Desktop Layout)' })
    ).toHaveCount(0)
  })
})
