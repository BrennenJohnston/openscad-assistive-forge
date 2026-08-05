import { test, expect } from '@playwright/test'
import path from 'path'

// Classic mode (desktop-OpenSCAD-style four-pane layout) — C4 acceptance.
//
// Classic is gated on the classic_mode feature flag (default off); these
// tests enable it via the URL override. Mode switching goes through the
// real UI: header toggle to Standard, then View > Interface Mode radios.

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

    // Presets pane: moved into its labelled slot and forced open
    const presetsSlot = page.locator('#classicPresetsSlot')
    await expect(presetsSlot).toBeVisible()
    await expect(presetsSlot.locator('#presetControls')).toHaveCount(1)

    // Display + customizer panes still present
    await expect(page.locator('.preview-panel')).toBeVisible()
    await expect(page.locator('#paramPanel')).toBeVisible()

    // Startup contract: every customizer group is collapsed on entry
    const openGroups = await page
      .locator('#parametersContainer details.param-group[open]')
      .count()
    expect(openGroups, 'all param groups collapsed in Classic').toBe(0)

    // Display strip (C4.5): visible in Classic with snap views, overlay
    // toggles, bed-size select, and Preview/Render
    const strip = page.locator('#classicDisplayStrip')
    await expect(strip).toBeVisible()
    await expect(strip.locator('[data-classic-view]')).toHaveCount(7)
    await expect(strip.locator('#classicRenderBtn')).toBeVisible()
    const bedOptions = await strip
      .locator('#classicGridSizeSelect option')
      .count()
    expect(bedOptions, 'bed-size select populated from grid presets').toBeGreaterThan(3)

    // Axes toggle reflects pressed state
    const axesToggle = strip.locator('#classicAxesToggle')
    const before = await axesToggle.getAttribute('aria-pressed')
    await axesToggle.click()
    await expect(axesToggle).toHaveAttribute(
      'aria-pressed',
      before === 'true' ? 'false' : 'true'
    )
    await axesToggle.click()

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
    await expect(page.locator('#classicPresetsSlot')).toHaveCount(0)
    await expect(page.locator('#classicDisplayStrip')).toBeHidden()
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
