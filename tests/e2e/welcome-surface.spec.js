import { test, expect } from '@playwright/test'

// W3: the welcome screen is ONE decluttered surface — a single "Get Started"
// heading over side-by-side start actions and saved projects, with the guide
// cards demoted below. No functionality was removed.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
  })
})

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
