/**
 * Wait for the preview's state pill to land before a whole-page axe scan.
 *
 * The pill carries `transition: all` (240 ms), so a scan that arrives while
 * it moves from the rendering color to the ready color measures a blend of
 * the two and reports a contrast figure belonging to neither. The same wait
 * stands in accessibility.spec.js.
 *
 * @license GPL-3.0-or-later
 */
import { expect } from '@playwright/test';

/** @param {import('@playwright/test').Page} page */
export async function previewSettled(page) {
  await expect(
    page.locator('.preview-state-indicator.state-current')
  ).toBeVisible({ timeout: 90_000 });
  await page.waitForTimeout(500);
}
