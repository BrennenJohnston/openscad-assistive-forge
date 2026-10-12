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
