/**
 * Loading another project: nothing of the one before it stays behind.
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test'
import path from 'path'
import { attachInvariants, expectNoPageErrors } from './helpers/invariants.js'

const RENDER_TIMEOUT = 120_000

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true')
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true')
  })
})

async function loadFixture(page, name) {
  await page.locator('#fileInput').setInputFiles(path.join(process.cwd(), 'tests', 'fixtures', name))
  await expect(page.locator('#mainInterface')).toBeVisible({ timeout: 30_000 })
  // Every upload is offered a place in Saved Projects, and the offer can open
  // a moment after the project shows; wait for it rather than glance once.
  await page.locator('#saveProjectNotNow').click()
  await expect(page.locator('.save-project-modal')).toHaveCount(0)
  await expect(page.locator('.preview-state-indicator')).toHaveClass(/state-current/, {
    timeout: RENDER_TIMEOUT,
  })
}

async function waitForEngine(page) {
  await page.waitForSelector('body[data-wasm-ready="true"]', { state: 'attached', timeout: 120_000 })
}

async function setNumber(page, name, value) {
  await page.evaluate(() => {
    for (const group of document.querySelectorAll('details.param-group')) group.open = true
  })
  const box = page.locator(`#param-${name}-spinbox`)
  await box.fill(String(value))
  await box.press('Enter')
}

test.describe('Loading another project', () => {
  test.setTimeout(300_000)

  // A link's values are for the design it opens with. The first design here
  // has no width, so the link's width is reported and ignored; the next
  // design must open at its own default with nothing reported.
  test("a link's values and notice stay with the project they arrived with", async ({ page }) => {
    attachInvariants(page)
    await page.goto('/#v=1&params={"width":61}')
    await waitForEngine(page)
    await loadFixture(page, 'console-echo.scad')
    await expect(page.locator('#parameterNotices')).toBeVisible()

    await loadFixture(page, 'sample-advanced.scad')

    await expect(page.locator('#param-width-spinbox')).toHaveValue('50')
    await expect(page.locator('#parameterNotices')).toBeHidden()
    expectNoPageErrors(page)
  })

  test("the last project's file is not offered for download", async ({ page }) => {
    attachInvariants(page)
    await page.goto('/')
    await waitForEngine(page)
    await loadFixture(page, 'sample.scad')
    await page.locator('#primaryActionBtn').click()
    await expect(page.locator('#primaryActionBtn')).toHaveAttribute('data-action', 'download', {
      timeout: RENDER_TIMEOUT,
    })

    await loadFixture(page, 'sample-advanced.scad')

    await expect(page.locator('#downloadFallbackLink')).toBeHidden()
    await expect(page.locator('#primaryActionBtn')).toHaveAttribute('data-action', 'generate')
    expectNoPageErrors(page)
  })

  // The messages under the preview are the shown preview's messages. Going
  // back to values already previewed reuses that preview, and must bring
  // back its messages too, not keep the failed render's error.
  test('a preview of earlier values shows their messages, not the last error', async ({ page }) => {
    attachInvariants(page)
    await page.goto('/')
    await waitForEngine(page)
    const scad = ['width = 50; // [10:100]', 'assert(width < 80, "width must stay under 80");', 'cube([width, 10, 10]);', ''].join('\n')
    await page.locator('#fileInput').setInputFiles({ name: 'guarded.scad', mimeType: 'text/plain', buffer: Buffer.from(scad) })
    const notNow = page.locator('#saveProjectNotNow')
    if (await notNow.isVisible().catch(() => false)) await notNow.click()
    const indicator = page.locator('.preview-state-indicator')
    await expect(indicator).toHaveClass(/state-current/, { timeout: RENDER_TIMEOUT })
    const messages = page.locator('#echoDrawerLabel')

    await setNumber(page, 'width', 90)
    await expect(messages).toContainText('error', { timeout: RENDER_TIMEOUT })
    await setNumber(page, 'width', 50)
    await expect(indicator).toHaveClass(/state-current/, { timeout: RENDER_TIMEOUT })

    await expect(messages).not.toContainText('error')
  })
})

test.describe('Closing a project', () => {
  test('the Main Page names no file after Close Project', async ({ page }) => {
    attachInvariants(page)
    await page.goto('/')
    await waitForEngine(page)
    await loadFixture(page, 'sample.scad')
    await expect(page.locator('#fileInfoSummary')).toHaveText('sample.scad')
    const mode = page.locator('#uiModeToggle')
    if ((await mode.getAttribute('aria-checked')) !== 'true') await mode.click()
    // A change, so that closing has something to ask about.
    await setNumber(page, 'width', 60)

    await page.locator('#fileMenuBtn').click()
    await page
      .locator('#fileMenuItems button')
      .filter({ has: page.getByText('Close Project', { exact: true }) })
      .first()
      .click()
    await page
      .getByRole('alertdialog', { name: 'Go back to the Main Page?' })
      .getByRole('button', { name: 'Confirm' })
      .click()
    await expect(page.locator('#welcomeScreen')).toBeVisible()

    await expect(page.locator('#fileInfoSummary')).toHaveText('')
    expectNoPageErrors(page)
  })
})

test.describe('Arriving with a kept draft', () => {
  test.setTimeout(300_000)

  // Counts every moment the draft question and the Save prompt are both on
  // screen, from the first page load on.
  async function watchForTwoDialogs(page) {
    await page.addInitScript(() => {
      window.__twoDialogs = 0
      const shown = (selector) => {
        const el = document.querySelector(selector)
        return !!el && el.getClientRects().length > 0
      }
      setInterval(() => {
        if (shown('.confirm-modal') && shown('.save-project-modal')) window.__twoDialogs++
      }, 50)
    })
  }

  // A value changed in an uploaded file leaves a draft of it in the browser.
  async function keepDraft(page) {
    await page.goto('/')
    await waitForEngine(page)
    await loadFixture(page, 'sample.scad')
    await setNumber(page, 'width', 61)
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('openscad-forge-editor-draft') || ''), {
        timeout: 15_000,
      })
      .toContain('61')
  }

  // One of the program's examples offers a place in Saved Projects when it
  // opens; the draft of the other file is asked about at the same arrival.
  async function arriveAtExample(page) {
    await page.goto('/?example=braille-sign')
    const question = page.locator('.confirm-modal', { hasText: 'Restore a saved draft?' })
    await expect(question).toBeVisible({ timeout: 120_000 })
    await page.locator('.param-control').first().waitFor({ state: 'attached', timeout: 120_000 })
    await page.waitForTimeout(2_000)
    return question
  }

  test('the draft question comes first and the Save prompt after it', async ({ page }) => {
    attachInvariants(page)
    await watchForTwoDialogs(page)
    await keepDraft(page)

    const question = await arriveAtExample(page)
    expect(await page.evaluate(() => window.__twoDialogs), 'both dialogs on screen at once').toBe(0)

    await question.locator('[data-action="cancel"]').click()
    await expect(page.locator('.save-project-modal')).toBeVisible({ timeout: 30_000 })
    await page.locator('#saveProjectNotNow').click()
    await expect(page.locator('.save-project-modal')).toHaveCount(0)
    expect(await page.evaluate(() => window.__twoDialogs), 'both dialogs on screen at once').toBe(0)
    expectNoPageErrors(page)
  })

  test('a restored draft opens with its value and no Save prompt over it', async ({ page }) => {
    attachInvariants(page)
    await watchForTwoDialogs(page)
    await keepDraft(page)

    const question = await arriveAtExample(page)
    expect(await page.evaluate(() => window.__twoDialogs), 'both dialogs on screen at once').toBe(0)

    await question.locator('[data-action="confirm"]').click()
    await expect(page.locator('#param-width-spinbox')).toHaveValue('61', { timeout: 60_000 })
    await page.waitForTimeout(2_000)
    await expect(page.locator('.save-project-modal')).toHaveCount(0)
    expect(await page.evaluate(() => window.__twoDialogs), 'both dialogs on screen at once').toBe(0)
    expectNoPageErrors(page)
  })
})
