import { test, expect } from '@playwright/test'

// Echo drawer fold correctness (C9): class and aria never desync, manual
// folds survive re-renders with unchanged problems, echo-only output does
// not auto-expand. (Reopen-on-NEW-error is unit-covered logic — growing the
// problem count mid-test would need editor access.)

const isCI = !!process.env.CI

const WASM_READY_TIMEOUT = 180_000
const PREVIEW_TIMEOUT = 120_000

const WARNING_FIXTURE = {
  name: 'echo-warning.scad',
  mimeType: 'text/plain',
  buffer: Buffer.from(
    'size = 5; // [1:20]\ncube(size);\necho("marker");\necho(undefined_thing);\n'
  ),
}

const ECHO_ONLY_FIXTURE = {
  name: 'echo-only.scad',
  mimeType: 'text/plain',
  buffer: Buffer.from('size = 5; // [1:20]\ncube(size);\necho("hello");\n'),
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
  })
})

async function loadFixture(page, fixture) {
  await page.goto('/')
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: WASM_READY_TIMEOUT,
  })
  await page.locator('#fileInput').setInputFiles(fixture)
  await expect(page.locator('#mainInterface')).toBeVisible({
    timeout: 30_000,
  })
  const notNowBtn = page.locator('#saveProjectNotNow')
  try {
    await notNowBtn.waitFor({ state: 'visible', timeout: 3_000 })
    await notNowBtn.click()
  } catch {
    // Save-project modal did not appear; nothing to dismiss.
  }
  await expect(page.locator('.preview-state-indicator')).toHaveClass(
    /state-current/,
    { timeout: PREVIEW_TIMEOUT }
  )
}

async function nudgeParamAndRender(page) {
  const slider = page
    .locator('.param-group input[type="range"], .param-group input[type="number"]')
    .first()
  const group = page.locator('details.param-group').first()
  if (!(await group.evaluate((el) => el.open))) {
    await group.locator('summary').click()
  }
  await slider.waitFor({ state: 'visible', timeout: 10_000 })
  await slider.focus()
  await page.keyboard.press('ArrowUp')
  await expect(page.locator('.preview-state-indicator')).toHaveClass(
    /state-current/,
    { timeout: PREVIEW_TIMEOUT }
  )
}

test.describe('echo drawer fold state (C9)', () => {
  test('echo-only output stays collapsed with truthful aria', async ({
    page,
  }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    test.setTimeout(300_000)

    await loadFixture(page, ECHO_ONLY_FIXTURE)

    const drawer = page.locator('#echoDrawer')
    await expect(drawer).toHaveClass(/visible/)
    await expect(drawer).toHaveClass(/collapsed/)
    await expect(page.locator('#echoDrawerToggle')).toHaveAttribute(
      'aria-expanded',
      'false'
    )
    // The desync bug showed content while aria said collapsed
    await expect(page.locator('#echoMessages')).toBeHidden()
  })

  test('manual expand survives an echo-only re-render', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    test.setTimeout(300_000)

    await loadFixture(page, ECHO_ONLY_FIXTURE)

    const toggle = page.locator('#echoDrawerToggle')
    await toggle.click()
    await expect(page.locator('#echoDrawer')).not.toHaveClass(/collapsed/)
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')

    await nudgeParamAndRender(page)

    await expect(page.locator('#echoDrawer')).not.toHaveClass(/collapsed/)
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  })

  test('manual collapse survives a re-render with the same warnings', async ({
    page,
  }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    test.setTimeout(300_000)

    await loadFixture(page, WARNING_FIXTURE)

    // Warnings auto-expand on first appearance
    const drawer = page.locator('#echoDrawer')
    await expect(drawer).not.toHaveClass(/collapsed/)

    const toggle = page.locator('#echoDrawerToggle')
    await toggle.click()
    await expect(drawer).toHaveClass(/collapsed/)
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')

    // Same warning count on the next render: the user's fold is respected
    // (the old code force-reopened on every render)
    await nudgeParamAndRender(page)
    await expect(drawer).toHaveClass(/collapsed/)
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })
})
