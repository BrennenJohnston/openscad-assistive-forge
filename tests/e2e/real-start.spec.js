/**
 * The app started the way a person starts it: nothing written to storage
 * before the page loads. Every other browser suite marks the welcome dialog
 * as seen, so the first visit and the return visit only run here.
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test'
import { attachInvariants, expectNoNativeDialog, expectNoPageErrors } from './helpers/invariants.js'
import { draftQuestion } from './helpers/draft-question.js'

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

/** The draft is written two seconds after the last change. */
async function waitForDraft(page) {
  await page.waitForFunction(() => localStorage.getItem('openscad-forge-editor-draft') !== null, null, {
    timeout: 10_000,
  })
}

/**
 * The draft question, in the app's own dialog. It opens on "Restore draft":
 * its other answer throws the draft away, so Enter must not be the one that
 * loses work.
 */
async function restoreDraft(page) {
  const question = draftQuestion(page)
  await expect(question).toBeVisible({ timeout: 60_000 })
  await expect(question).toContainText('A draft of "simple_box.scad" from')
  const restore = question.getByRole('button', { name: 'Restore draft', exact: true })
  await expect(restore).toBeFocused()
  await restore.click()
  await expect(question).toHaveCount(0)
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

  test('a return visit without "Remember my choice" asks again and restores the draft', async ({ page }) => {
    attachInvariants(page)
    attachInvariants(page)
    await page.goto('/')
    await acceptWelcome(page, { remember: false })
    await declineTourOffer(page)
    await waitForEngine(page)
    await openSimpleBox(page)
    await waitForDraft(page)

    await page.reload()
    await acceptWelcome(page, { remember: false })
    await restoreDraft(page)
    const { params, failed } = await restoredOrFailed(page)
    await expect(failed).toHaveCount(0)
    await expect(params).toBeAttached()
    await waitForPreview(page)
    expectNoNativeDialog(page)
    expectNoPageErrors(page)
  })

  test('a return visit with "Remember my choice" restores the draft', async ({ page }) => {
    attachInvariants(page)
    attachInvariants(page)
    await page.goto('/')
    await acceptWelcome(page, { remember: true })
    await declineTourOffer(page)
    await waitForEngine(page)
    await openSimpleBox(page)
    await waitForDraft(page)

    await page.reload()
    await waitForEngine(page)
    await expect(page.locator('#first-visit-modal')).toBeHidden()
    await restoreDraft(page)
    const { params, failed } = await restoredOrFailed(page)
    await expect(failed).toHaveCount(0)
    await expect(params).toBeAttached()
    expectNoNativeDialog(page)
    expectNoPageErrors(page)
  })

  // The page keeps a changed value in its own address too, so a plain reload
  // would bring it back through the link. A return visit comes in through the
  // plain address, where only the draft holds the value.
  test('a restored draft keeps the values that were changed', async ({ page }) => {
    attachInvariants(page)
    attachInvariants(page)
    await page.goto('/')
    await acceptWelcome(page, { remember: true })
    await declineTourOffer(page)
    await waitForEngine(page)
    await openSimpleBox(page)
    await page.locator('details.param-group > summary').filter({ hasText: 'Dimensions' }).first().click()
    const width = page.locator('#param-width-spinbox')
    await width.fill('57')
    await width.press('Tab')
    await page.waitForFunction(
      () => /"width":"?57"?[,}]/.test(localStorage.getItem('openscad-forge-editor-draft') || ''),
      null,
      { timeout: 10_000 }
    )

    await page.evaluate(() => history.replaceState(null, '', '/'))
    await page.reload()
    await waitForEngine(page)
    await restoreDraft(page)
    const { params, failed } = await restoredOrFailed(page)
    await expect(failed).toHaveCount(0)
    await expect(params).toHaveValue('57')
    expectNoNativeDialog(page)
    expectNoPageErrors(page)
  })
})
