import { test, expect } from '@playwright/test'
import path from 'path'

// Parameter-group accordion geometry (C12): the hide '✕' is a full 44px
// target anchored far right (chevron moved LEFT of the label), mis-presses
// no longer hide groups, focus lands on the restore bar after hiding, and
// per-group chips restore a single group. Hidden sets persist per model.

const isCI = !!process.env.CI

const FIXTURE = path.join(process.cwd(), 'tests', 'fixtures', 'sample.scad')
const WASM_READY_TIMEOUT = 180_000

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
  })
})

/**
 * UF-35: the ✕ moved out of the <summary>. A <summary> IS the disclosure's
 * own button, so a control inside it was a control inside a control - axe's
 * nested-interactive, once per group, so the count grew with the model. It
 * now sits in an actions layer beside the <details>, and the two share one
 * .forge-disclosure-row, so the button is reached through the row rather than
 * through the group. Its box and its place in the header are unchanged; the
 * geometry assertions below are what proves that.
 */
function groupRow(page, index = 0) {
  return page
    .locator('.forge-disclosure-row', {
      has: page.locator('details.param-group'),
    })
    .nth(index)
}

async function loadSample(page) {
  await page.goto('/')
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: WASM_READY_TIMEOUT,
  })
  await page.locator('#fileInput').setInputFiles(FIXTURE)
  await expect(page.locator('#mainInterface')).toBeVisible({ timeout: 30_000 })
  const notNowBtn = page.locator('#saveProjectNotNow')
  try {
    await notNowBtn.waitFor({ state: 'visible', timeout: 3_000 })
    await notNowBtn.click()
  } catch {
    // Save-project modal did not appear; nothing to dismiss.
  }
  await page.waitForSelector('details.param-group', {
    state: 'attached',
    timeout: 15_000,
  })
}

test.describe('param group hide geometry (C12)', () => {
  test('hide button is 44px, far right, and does not collide with the toggle', async ({
    page,
  }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    test.setTimeout(300_000)

    await loadSample(page)

    const row = groupRow(page)
    const group = row.locator('details.param-group')
    const summary = group.locator('summary')
    const hideBtn = row.locator('.param-group-hide-btn')

    // The repair's own guard: the control must NOT be inside the summary.
    await expect(summary.locator('.param-group-hide-btn')).toHaveCount(0)

    // Full token-sized hit target regardless of the hover-reveal opacity.
    // --size-touch-target is 44px on touch and (by existing app-wide design)
    // 36px on fine-pointer desktop — either way a huge jump from the old
    // 24px ✕ that caused the mis-presses.
    const target = await page.evaluate(() =>
      parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(
          '--size-touch-target'
        )
      )
    )
    expect(target, 'token floor').toBeGreaterThanOrEqual(36)
    const btnBox = await hideBtn.boundingBox()
    expect(btnBox.width, 'hide button width').toBeGreaterThanOrEqual(target)
    expect(btnBox.height, 'hide button height').toBeGreaterThanOrEqual(target)

    // Anchored at the summary's right edge
    const summaryBox = await summary.boundingBox()
    expect(
      summaryBox.x + summaryBox.width - (btnBox.x + btnBox.width),
      'hide button hugs the right edge'
    ).toBeLessThan(24)

    // Clicking at the LEFT side of the summary (label/chevron zone, the old
    // mis-press area) toggles open/closed and never hides the group
    const wasOpen = await group.evaluate((el) => el.open)
    await summary.click({ position: { x: 16, y: summaryBox.height / 2 } })
    await expect(group).toHaveJSProperty('open', !wasOpen)
    await expect(group).not.toHaveAttribute('hidden', '')
  })

  test('hide moves focus to the restore bar; a chip restores just that group', async ({
    page,
  }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    test.setTimeout(300_000)

    await loadSample(page)

    const groups = page.locator('details.param-group')
    const groupCount = await groups.count()
    const firstGroup = groups.first()
    const label = (
      await firstGroup.locator('summary span').first().textContent()
    ).trim()

    await groupRow(page).locator('.param-group-hide-btn').click()
    await expect(firstGroup).toBeHidden()

    // Focus lands on the restore bar (the pressed ✕ left the tree)
    await expect(page.locator('.param-groups-show-all')).toBeFocused()
    await expect(page.locator('.param-groups-show-all')).toContainText(
      '1 group hidden'
    )

    // The per-group chip restores exactly this group
    const chip = page.locator('.param-group-show-chip', {
      hasText: `Show ${label}`,
    })
    await expect(chip).toBeVisible()
    await chip.click()
    await expect(firstGroup).not.toHaveAttribute('hidden', '')
    await expect(page.locator('.param-groups-hidden-bar')).toHaveCount(0)
    expect(await groups.count()).toBe(groupCount)
  })

  test('hidden groups persist across reload', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI')
    test.setTimeout(300_000)

    await loadSample(page)

    const firstGroup = page.locator('details.param-group').first()
    await groupRow(page).locator('.param-group-hide-btn').click()
    await expect(firstGroup).toBeHidden()

    await page.reload()
    await page.waitForSelector('body[data-wasm-ready="true"]', {
      state: 'attached',
      timeout: WASM_READY_TIMEOUT,
    })
    await page.locator('#fileInput').setInputFiles(FIXTURE)
    await expect(page.locator('#mainInterface')).toBeVisible({
      timeout: 30_000,
    })
    await page.waitForSelector('details.param-group', {
      state: 'attached',
      timeout: 15_000,
    })

    await expect(page.locator('details.param-group').first()).toBeHidden()
    await expect(page.locator('.param-groups-show-all')).toContainText(
      'hidden'
    )
  })
})
