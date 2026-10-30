import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import path from 'path'

// The welcome screen is one decluttered surface: a single "Main Page"
// heading over side-by-side start actions and saved projects, with the
// guide cards below.

const FIXTURE = path.join(process.cwd(), 'tests', 'fixtures', 'sample.scad')
const WASM_READY_TIMEOUT = 180_000

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
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

test.describe('welcome single surface', () => {
  // The heading is the surface's own name, so "one heading over both
  // halves" is asserted against "Main Page".
  test('one Main Page heading; actions and saved projects share the surface', async ({
    page,
  }) => {
    await page.goto('/')

    // Exact text: the "Main Page Tour" card heading is also an h3 on this
    // surface, and a substring match would count it as a second heading.
    const surfaceHeadings = page.locator('#welcomeScreen h2, #welcomeScreen h3', {
      hasText: /^\s*Main Page\s*$/,
    })
    await expect(surfaceHeadings).toHaveCount(1)
    await expect(page.locator('#features-heading')).toHaveText('Main Page')
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

// Classic's icon toolbar and status bar have nothing to act on while the
// welcome screen shows, so they hide there (the same truth the menu bar
// already models via applyToolbarModeVisibility) and return the moment a
// project opens. The surface signal is body[data-app-surface], stamped at
// every welcome/project flip site.
test.describe('Classic welcome chrome', () => {
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

test.describe('the page behind the welcome surface', () => {
  test.use({ viewport: { width: 412, height: 915 }, hasTouch: true })

  test('cannot scroll by code: the header stays when the heading is scrolled into view', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem('openscad-forge-first-visit-seen', 'true')
      localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
    })
    await page.goto('/')
    await expect(page.locator('#welcomeScreen')).toBeVisible()
    await expect(page.locator('#features-heading')).toBeVisible()

    // The welcome content scrolls inside its own region; the page itself has
    // nothing to scroll, so a focus move or a scroll-into-view can never
    // carry the header off the top (the page refuses finger scrolling, which
    // would leave it there).
    const pageScroll = () =>
      page.evaluate(() => ({
        page: document.documentElement.scrollHeight,
        viewport: window.innerHeight,
      }))
    const before = await pageScroll()
    expect(before.page, 'the page is no taller than the viewport').toBeLessThanOrEqual(before.viewport)

    await page.evaluate(() =>
      document.getElementById('features-heading').scrollIntoView({ block: 'start' })
    )
    await page.waitForTimeout(300)
    const header = await page.locator('.app-header').boundingBox()
    expect(header.y, 'the header stays at the top').toBe(0)
    expect(await page.evaluate(() => window.scrollY)).toBe(0)
  })

  // The cards' Tool menus are the one control on the welcome surface that
  // sat under the touch floor (36 px on every card); they stand at the
  // token's height, 44 px on a touch screen.
  test('every card Tool menu is at least 44 px tall on a touch screen', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem('openscad-forge-first-visit-seen', 'true')
      localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
    })
    await page.goto('/')
    await expect(page.locator('#welcomeScreen')).toBeVisible()
    const menus = page.locator('.charm-variant-select')
    const count = await menus.count()
    expect(count, 'the cards with a Tool menu').toBeGreaterThanOrEqual(3)
    for (let i = 0; i < count; i++) {
      await menus.nth(i).scrollIntoViewIfNeeded()
      const box = await menus.nth(i).boundingBox()
      // Firefox lays the box out in fractions (43.99997 for a 44 px rule);
      // half a pixel of slack keeps the floor without reading a layout
      // engine's rounding as a defect. Before the fix the menu was 36 px.
      expect(box.height, `Tool menu ${i + 1}`).toBeGreaterThanOrEqual(43.5)
    }
  })
})

// The Tactile Map Designer card: found by its heading, clean under axe, and
// its button opens the tile with the plates panel above the controls.
test.describe('the Tactile Map Designer card', () => {
  test('opens the tile from the welcome surface', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 10_000 })
    const card = page.locator('.role-path-card', {
      has: page.locator('.role-path-title', { hasText: 'Tactile Map Designer' }),
    })
    await expect(card).toHaveCount(1)
    await expect(card.locator('.role-path-meta')).toContainText(
      'built from my tactile station maps'
    )
    await expect(card.locator('.role-path-meta a')).toHaveCount(0)
    await card.locator('summary').click()
    await expect(card.locator('.role-path-tips li')).toHaveCount(4)
    const select = card.locator('#tactileMapVariantSelect')
    await expect(select).toHaveValue('tactile-map')
    const button = card.locator('#openTactileMapBtn')
    await expect(button).toHaveText('Open Tactile Map Designer')
    await expect(button).toHaveAttribute('data-example', 'tactile-map')

    const results = await new AxeBuilder({ page })
      .include('#welcomeScreen')
      .analyze()
    expect(
      results.violations,
      results.violations
        .map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)
        .join('\n')
    ).toEqual([])

    await button.click()
    await expect(page.locator('#mainInterface')).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('#tactileMapPanel h2')).toHaveText(
      'Tactile map plates',
      { timeout: 15_000 }
    )
  })
})
