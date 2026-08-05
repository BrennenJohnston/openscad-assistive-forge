import { test, expect } from '@playwright/test'
import path from 'path'

// Console fidelity (C4.3) — desktop-parity contract for the console log:
//   1. Litmus: a missing include file must surface "Can't open include file".
//   2. Append-only: a re-render never wipes the log; a "── Render N ──"
//      separator marks the new run and earlier output stays visible.

const ECHO_FIXTURE = path.join(
  process.cwd(),
  'tests',
  'fixtures',
  'console-echo.scad'
)
const MISSING_INCLUDE_FIXTURE = path.join(
  process.cwd(),
  'tests',
  'fixtures',
  'missing-include.scad'
)

const WASM_READY_TIMEOUT = 180_000
const PREVIEW_TIMEOUT = 120_000

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
  })
})

async function loadProject(page, fixturePath) {
  await page.goto('/')
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: WASM_READY_TIMEOUT,
  })

  await page.locator('#fileInput').setInputFiles(fixturePath)
  await expect(page.locator('#welcomeScreen')).toBeHidden({ timeout: 30_000 })
  await expect(page.locator('#mainInterface')).toBeVisible({ timeout: 10_000 })

  const notNowBtn = page.locator('#saveProjectNotNow')
  try {
    await notNowBtn.waitFor({ state: 'visible', timeout: 3_000 })
    await notNowBtn.click()
  } catch {
    // Save-project modal did not appear; nothing to dismiss.
  }

  // The console panel is hidden in Simplified mode; switch to Standard
  const toggle = page.locator('#uiModeToggle')
  await expect(toggle).toBeVisible({ timeout: 10_000 })
  if ((await toggle.getAttribute('aria-checked')) !== 'true') {
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-checked', 'true')
  }
}

async function waitForPreviewReady(page) {
  await expect(page.locator('.preview-state-indicator')).toHaveClass(
    /state-current/,
    { timeout: PREVIEW_TIMEOUT }
  )
}

async function openConsolePanel(page) {
  const details = page.locator('#consolePanel')
  if (!(await details.evaluate((el) => el.open))) {
    await details.locator('summary').click()
  }
  await expect(page.locator('#console-output')).toBeVisible()
}

test.describe('Console fidelity (C4.3)', () => {
  test('missing include file surfaces "Can\'t open include file"', async ({
    page,
  }) => {
    test.setTimeout(240_000)

    await loadProject(page, MISSING_INCLUDE_FIXTURE)

    // The warning may auto-expand the panel; open it if not
    await expect
      .poll(
        async () => {
          await openConsolePanel(page)
          return page.locator('#console-output').textContent()
        },
        { timeout: PREVIEW_TIMEOUT }
      )
      .toMatch(/can't open include file/i)
  })

  test('re-render appends with a separator instead of clearing the log', async ({
    page,
  }) => {
    test.setTimeout(240_000)

    await loadProject(page, ECHO_FIXTURE)
    await waitForPreviewReady(page)

    await openConsolePanel(page)
    await expect(page.locator('#console-output')).toContainText(
      'fidelity-marker',
      { timeout: 30_000 }
    )

    // Trigger a re-render by changing the size parameter
    const firstGroup = page.locator('details.param-group').first()
    await expect(firstGroup).toBeVisible({ timeout: 15_000 })
    if (!(await firstGroup.evaluate((el) => el.open))) {
      await firstGroup.locator('summary').click()
    }
    const sizeInput = page.locator('.param-group input[type="number"]').first()
    await expect(sizeInput).toBeVisible({ timeout: 15_000 })
    await sizeInput.fill('20')
    await sizeInput.blur()

    // Second run's echo arrives after the separator; the first run's echo
    // must still be present (append-only)
    await expect(page.locator('#console-output')).toContainText(
      '── Render 2 ──',
      { timeout: PREVIEW_TIMEOUT }
    )
    const echoCount = await page
      .locator('#console-output .console-entry--echo')
      .count()
    expect(echoCount, 'both renders\' echoes visible').toBeGreaterThanOrEqual(2)

    // Explicit Clear empties the log
    await page.locator('#console-clear-btn').click()
    await expect(page.locator('#console-output')).not.toContainText(
      'fidelity-marker'
    )
  })
})
