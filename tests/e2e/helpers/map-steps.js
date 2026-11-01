/**
 * The Tactile Map Designer's numbered steps in a browser test: a step's
 * controls can be pressed only while that step shows, so a test walks to it
 * as a person would, with Next forward and the list of steps back.
 *
 * @license GPL-3.0-or-later
 */
import { expect } from '@playwright/test';

/** The number of the step showing, from its heading ("Step 2 of 5: ..."). */
async function stepShowing(page) {
  const text =
    (await page.locator('#tactileMapSteps-heading').textContent()) || '';
  return Number(text.match(/^Step (\d+) of/)?.[1] || 0);
}

/**
 * Show step `n` of the map's steps.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} n - 1-based
 */
export async function goToStep(page, n) {
  const heading = page.locator('#tactileMapSteps-heading');
  if ((await stepShowing(page)) > n) {
    await page
      .locator('#tactileMapSteps nav li')
      .nth(n - 1)
      .locator('button')
      .click();
  }
  for (let now = await stepShowing(page); now < n; now = await stepShowing(page)) {
    await page.locator('#tactileMapSteps-next').click();
    await expect(heading).toHaveText(new RegExp(`^Step ${now + 1} of`));
  }
  await expect(heading).toHaveText(new RegExp(`^Step ${n} of`));
}
