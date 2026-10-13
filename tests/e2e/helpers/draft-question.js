/**
 * The question a visit asks when a draft is kept in the browser. It is the
 * app's own dialog, so it waits for an answer: a test that reloads after an
 * edit has to give one.
 *
 * @license GPL-3.0-or-later
 */

import { expect } from '@playwright/test'

export const draftQuestion = (page) =>
  page
    .locator('[role="alertdialog"]')
    .filter({ has: page.getByRole('heading', { name: 'Restore a saved draft?', exact: true }) })

/** Answer with "Restore draft" or "Discard draft". */
export async function answerDraftQuestion(page, answer) {
  const question = draftQuestion(page)
  await expect(question).toBeVisible({ timeout: 60_000 })
  await question.getByRole('button', { name: answer, exact: true }).click()
  await expect(question).toHaveCount(0)
}

const DRAFT_KEY = 'openscad-forge-editor-draft'

/**
 * Change one parameter through the page: the first number field, one up.
 * Written through the DOM, since the field can sit in a closed drawer. A
 * draft (and the Main Page question) exist only once something changed.
 */
export async function changeOneParameter(page) {
  await expect
    .poll(() => page.locator('#parametersContainer input[type="number"]').count(), {
      timeout: 30_000,
    })
    .toBeGreaterThan(0)
  await page.evaluate(() => {
    const field = document.querySelector('#parametersContainer input[type="number"]')
    field.value = String((Number(field.value) || 0) + 1)
    field.dispatchEvent(new Event('input', { bubbles: true }))
    field.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

/** The draft writer's debounce has passed and a draft is in storage. */
export async function waitForDraft(page) {
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key) !== null, DRAFT_KEY), {
      timeout: 15_000,
    })
    .toBe(true)
}

/**
 * Reload a page that has a project open, and answer the question that brings.
 * The app keeps a draft of the open project a moment after any change, edit
 * or not, so whether a plain reload asks depends on how long the test took
 * to get there. Waiting for the draft first makes it ask every time.
 * "Discard draft" leaves the Main Page, as a reload did before.
 */
export async function reloadAnsweringDraft(page, answer = 'Discard draft') {
  // A changed project is what leaves a draft and raises the question.
  await changeOneParameter(page)
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key) !== null, DRAFT_KEY), {
      timeout: 15_000,
    })
    .toBe(true)
  await page.reload()
  await answerDraftQuestion(page, answer)
}
