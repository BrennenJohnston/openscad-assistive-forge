import { test, expect } from '@playwright/test'
import path from 'path'

// W3: the welcome screen is ONE decluttered surface — a single "Get Started"
// heading over side-by-side start actions and saved projects, with the guide
// cards demoted below. No functionality was removed.

const FIXTURE = path.join(process.cwd(), 'tests', 'fixtures', 'sample.scad')
const WASM_READY_TIMEOUT = 180_000

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
  })
})

async function seedClassic(page, { toolbarHiddenPref = false } = {}) {
  await page.addInitScript(
    ({ toolbarHiddenPref }) => {
      localStorage.setItem(
        'openscad-forge-ui-mode',
        JSON.stringify({ mode: 'classic', lastCustomMode: 'standard' })
      )
      if (toolbarHiddenPref) {
        localStorage.setItem('openscad-forge-classic-toolbar-hidden', 'true')
      }
    },
    { toolbarHiddenPref }
  )
}

async function loadSampleProject(page) {
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: WASM_READY_TIMEOUT,
  })
  await page.locator('#fileInput').setInputFiles(FIXTURE)
  await expect(page.locator('#mainInterface')).toBeVisible({ timeout: 30_000 })
  const notNow = page.locator('#saveProjectNotNow')
  try {
    await notNow.waitFor({ state: 'visible', timeout: 3_000 })
    await notNow.click()
  } catch {
    // Save-project modal did not appear; nothing to dismiss.
  }
}

async function returnToMainPage(page) {
  await page.locator('#clearFileBtn').click()
  try {
    const confirm = page.getByRole('button', { name: 'Confirm' })
    await confirm.waitFor({ state: 'visible', timeout: 2_000 })
    await confirm.click()
  } catch {
    // No confirm dialog; the flip already happened.
  }
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 10_000 })
}

test.describe('welcome single surface (W3)', () => {
  test('one Get Started heading; actions and saved projects share the surface', async ({
    page,
  }) => {
    await page.goto('/')

    const getStartedHeadings = page.locator('#welcomeScreen h2, #welcomeScreen h3', {
      hasText: 'Get Started',
    })
    await expect(getStartedHeadings).toHaveCount(1)
    await expect(page.locator('#features-heading')).toHaveText('Get Started')
    await expect(page.locator('#upload-panel-heading')).toHaveText(
      'Open or start a project'
    )

    // Both halves of the surface visible together inside the columns
    const columns = page.locator('.welcome-columns')
    await expect(columns).toBeVisible()
    await expect(columns.locator('#uploadZone')).toBeVisible()
    await expect(columns.locator('#savedProjectsPanel')).toBeVisible()

    // Nothing lost: primary controls all present
    for (const sel of [
      '#uploadZoneFolderBtn',
      '#startNewProjectBtn',
      '#exportAllProjectsBtn',
      '#importProjectsBtn',
    ]) {
      await expect(page.locator(sel)).toBeVisible()
    }

    // Guide cards demoted but intact below the columns
    const cards = page.locator('.role-paths-grid--compact .role-path-card')
    expect(await cards.count()).toBeGreaterThan(0)
    const columnsBox = await columns.boundingBox()
    const cardsBox = await page
      .locator('.role-paths-grid--compact')
      .boundingBox()
    expect(
      cardsBox.y,
      'cards render below the start columns'
    ).toBeGreaterThan(columnsBox.y)
  })
})

// U-22 (UF-13): Classic's icon toolbar and status bar have nothing to act on
// while the welcome screen shows, so they hide there — the same truth the
// menu bar already models via applyToolbarModeVisibility — and return the
// moment a project opens. The surface signal is body[data-app-surface],
// stamped at every welcome/project flip site. Status bar included per
// Q-39(a).
test.describe('Classic welcome chrome (U-22, UF-13)', () => {
  test('classic welcome hides toolbar and status bar; a project shows them; Main Page hides them again', async ({
    page,
  }) => {
    test.setTimeout(240_000)
    await seedClassic(page)
    await page.goto('/')

    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'classic'
    )
    await expect(page.locator('body')).toHaveAttribute(
      'data-app-surface',
      'welcome'
    )
    await expect(page.locator('#classicToolbar')).toBeHidden()
    await expect(page.locator('#classicStatusBar')).toBeHidden()

    await loadSampleProject(page)
    await expect(page.locator('body')).toHaveAttribute(
      'data-app-surface',
      'project'
    )
    await expect(page.locator('#classicToolbar')).toBeVisible()
    await expect(page.locator('#classicStatusBar')).toBeVisible()

    await returnToMainPage(page)
    await expect(page.locator('body')).toHaveAttribute(
      'data-app-surface',
      'welcome'
    )
    await expect(page.locator('#classicToolbar')).toBeHidden()
    await expect(page.locator('#classicStatusBar')).toBeHidden()
  })

  test('the hide-toolbar preference and the welcome hide stay separate', async ({
    page,
  }) => {
    test.setTimeout(240_000)
    await seedClassic(page, { toolbarHiddenPref: true })
    await page.goto('/')

    // On the welcome surface both bars hide, whatever the preference says.
    await expect(page.locator('#classicToolbar')).toBeHidden()
    await expect(page.locator('#classicStatusBar')).toBeHidden()

    await loadSampleProject(page)

    // The preference still governs the project surface: toolbar hidden by
    // the user's choice, status bar visible because only the toolbar has a
    // hide preference.
    await expect(page.locator('#classicToolbar')).toBeHidden()
    await expect(page.locator('#classicStatusBar')).toBeVisible()

    // The View menu tick reflects the stored preference, not the surface.
    await page.locator('#viewMenuBtn').click()
    const tick = page.getByRole('menuitemcheckbox', {
      name: 'Hide Classic Toolbar',
    })
    await expect(tick).toHaveAttribute('aria-checked', 'true')
    await page.keyboard.press('Escape')

    // A welcome round trip must not overwrite the stored preference.
    await returnToMainPage(page)
    await expect(page.locator('#classicToolbar')).toBeHidden()
    expect(
      await page.evaluate(() =>
        localStorage.getItem('openscad-forge-classic-toolbar-hidden')
      )
    ).toBe('true')
    expect(
      await page.evaluate(() => document.body.dataset.classicToolbarHidden)
    ).toBe('true')
  })

  test('the Forge welcome never shows the Classic chrome (guard)', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(page.locator('#welcomeScreen')).toBeVisible()
    await expect(page.locator('#classicToolbar')).toBeHidden()
    await expect(page.locator('#classicStatusBar')).toBeHidden()
  })
})
