/**
 * The app started the way a person starts it: nothing written to storage
 * before the page loads. Every other browser suite marks the welcome dialog
 * as seen, so the first visit and the return visit only run here.
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test'
import { attachInvariants, expectNoPageErrors } from './helpers/invariants.js'

const ENGINE_TIMEOUT = 240_000
const PREVIEW_TIMEOUT = 180_000

async function acceptWelcome(page, { remember }) {
  const dialog = page.locator('#first-visit-modal')
  await expect(dialog).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('#firstVisitChoiceForge')).toBeChecked()
  if (remember) await page.locator('#firstVisitRemember').check()
  await page.locator('#first-visit-continue').click()
  await expect(dialog).toBeHidden()
}

async function declineTourOffer(page) {
  const notNow = page.locator('.tour-nudge-dismiss')
  await expect(notNow).toBeVisible({ timeout: 10_000 })
  await notNow.click()
}

async function waitForEngine(page) {
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: ENGINE_TIMEOUT,
  })
}

async function waitForPreview(page) {
  await expect(page.locator('.preview-state-indicator')).toHaveClass(/state-current/, {
    timeout: PREVIEW_TIMEOUT,
  })
}

/** The simple box, the way the Main Page offers it: its tutorial, then closed. */
async function openSimpleBox(page) {
  await page.locator('[data-example="simple-box"]').click()
  await expect(page.locator('#mainInterface')).toBeVisible({ timeout: 60_000 })
  await waitForPreview(page)
  const closeTour = page.locator('.tutorial-close')
  await expect(closeTour).toBeVisible()
  await closeTour.click()
  await expect(closeTour).toBeHidden()
}

/** The actions drawer holds Compare and Queue; open it if collapsed. */
async function openActionsDrawer(page) {
  const btn = page.locator('#addToQueueBtn')
  if (!(await btn.isVisible())) {
    await page.locator('#actionsDrawerToggle').click()
  }
  await expect(btn).toBeVisible({ timeout: 10_000 })
}

/** The draft is written two seconds after the last change. */
async function waitForDraft(page) {
  await page.waitForFunction(() => localStorage.getItem('openscad-forge-editor-draft') !== null, null, {
    timeout: 10_000,
  })
}

/** The restored project, or the dialog that says it could not be read. */
async function restoredOrFailed(page) {
  const params = page.locator('#param-width-spinbox')
  const failed = page.getByText('Parameter Extraction Failed')
  await expect(params.or(failed).first()).toBeAttached({ timeout: 60_000 })
  return { params, failed }
}

test.describe('A real start-up', () => {
  test.setTimeout(300_000)

  test('a first visit: welcome, engine, the Main Page, then a project', async ({ page }) => {
    attachInvariants(page)
    await page.goto('/')
    await acceptWelcome(page, { remember: false })
    await declineTourOffer(page)
    await waitForEngine(page)
    await expect(page.locator('#welcomeScreen')).toBeVisible()
    await openSimpleBox(page)
    expectNoPageErrors(page)
  })

  // The queue is built at start-up, and on a first visit the engine is
  // built later, after the welcome: the queue has to find it when it runs.
  test('a first visit: the render queue renders, and an emptied queue is empty', async ({ page }) => {
    attachInvariants(page)
    await page.goto('/')
    await acceptWelcome(page, { remember: false })
    await declineTourOffer(page)
    await waitForEngine(page)
    await openSimpleBox(page)

    await openActionsDrawer(page)
    await page.locator('#addToQueueBtn').click()
    await page.locator('#viewQueueBtn').click()
    const queue = page.locator('#renderQueueModal')
    await expect(queue).toBeVisible()
    await page.locator('#processQueueBtn').click()
    const job = queue.locator('.queue-item')
    await expect(job.locator('.queue-item-stats')).toHaveText(/^[\d,]+ triangles$/, {
      timeout: PREVIEW_TIMEOUT,
    })
    await expect(job.locator('.queue-item-error')).toHaveCount(0)

    // Found by its action: the open dialog is still aria-hidden, so it
    // offers no roles to find the button by.
    await job.locator('button[data-action="remove"]').click()
    await expect(job).toHaveCount(0)
    await expect(page.locator('#queueEmpty')).toBeVisible()
    await expect(page.locator('#queueStatsTotal')).toHaveText('0')
    await expect(page.locator('#queueStatsComplete')).toHaveText('0')
    expectNoPageErrors(page)
  })

  test('a return visit without "Remember my choice" asks again and restores the draft', async ({ page }) => {
    attachInvariants(page)
    const questions = []
    page.on('dialog', async (dialog) => {
      questions.push(dialog.message())
      await dialog.accept()
    })
    await page.goto('/')
    await acceptWelcome(page, { remember: false })
    await declineTourOffer(page)
    await waitForEngine(page)
    await openSimpleBox(page)
    await waitForDraft(page)

    await page.reload()
    await acceptWelcome(page, { remember: false })
    const { params, failed } = await restoredOrFailed(page)
    await expect(failed).toHaveCount(0)
    await expect(params).toBeAttached()
    await waitForPreview(page)
    expect(questions.some((q) => /saved draft of "simple_box\.scad"/.test(q))).toBe(true)
    expectNoPageErrors(page)
  })

  test('a return visit with "Remember my choice" restores the draft', async ({ page }) => {
    attachInvariants(page)
    const questions = []
    page.on('dialog', async (dialog) => {
      questions.push(dialog.message())
      await dialog.accept()
    })
    await page.goto('/')
    await acceptWelcome(page, { remember: true })
    await declineTourOffer(page)
    await waitForEngine(page)
    await openSimpleBox(page)
    await waitForDraft(page)

    await page.reload()
    await waitForEngine(page)
    await expect(page.locator('#first-visit-modal')).toBeHidden()
    const { params, failed } = await restoredOrFailed(page)
    expect(questions.some((q) => /saved draft of "simple_box\.scad"/.test(q))).toBe(true)
    await expect(failed).toHaveCount(0)
    await expect(params).toBeAttached()
    expectNoPageErrors(page)
  })
})
