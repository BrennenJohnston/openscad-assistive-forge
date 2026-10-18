/**
 * The Alt View's look comes on with its drawers shut and opens the ones that
 * were open again after the picture has powered on; the page's root carries
 * `data-alt-view-drawers` until they are all back. A test that measures or
 * presses a drawer right after turning the look on waits for that first.
 *
 * @license GPL-3.0-or-later
 */

/**
 * @param {import('@playwright/test').Page} page
 */
export async function drawersBack(page) {
  await page.waitForFunction(
    () => !document.documentElement.hasAttribute('data-alt-view-drawers'),
    null,
    { timeout: 15_000 }
  );
}
