/**
 * First-visit interface choice (U-9, UF-3b)
 *
 * The first-visit modal carries a Forge/Classic choice: two labelled radio
 * cards with screenshots, no pre-selection, a remember-my-choice checkbox
 * (default checked), and one Download & Continue action that still gates the
 * WASM download. These cases deliberately do NOT stamp
 * openscad-forge-first-visit-seen — the modal appearing is the point — and
 * none of them needs WASM, so they assert against the blocked state only.
 *
 * @license GPL-3.0-or-later
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const MODAL = '#first-visit-modal';

async function waitForModal(page) {
  // main.js opens the modal on a 500ms timer after load
  await page
    .locator(`${MODAL}:not(.hidden)`)
    .waitFor({ state: 'visible', timeout: 10_000 });
}

test.describe('First-visit interface choice', () => {
  test('modal appears with both options unchosen and the app blocked', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForModal(page);

    await expect(page.locator('body')).toHaveClass(/first-visit-blocking/);
    await expect(page.locator('#app')).toHaveAttribute('aria-hidden', 'true');

    await expect(page.locator('#firstVisitChoiceForge')).not.toBeChecked();
    await expect(page.locator('#firstVisitChoiceClassic')).not.toBeChecked();
    await expect(page.locator('#firstVisitRemember')).toBeChecked();

    // Both screenshots actually load from public/screenshots/
    for (const id of ['#firstVisitForgeShot', '#firstVisitClassicShot']) {
      const width = await page
        .locator(id)
        .evaluate((img) => img.naturalWidth);
      expect(width, `${id} must load`).toBeGreaterThan(0);
    }

    // The gate has no escape hatch: Escape leaves the modal open
    await page.keyboard.press('Escape');
    await expect(page.locator(MODAL)).toBeVisible();
    await expect(page.locator('body')).toHaveClass(/first-visit-blocking/);
  });

  test('continue without a choice blocks with a visible, announced message', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForModal(page);

    await page.locator('#first-visit-continue').click();

    const error = page.locator('#firstVisitChoiceError');
    await expect(error).toBeVisible();
    await expect(error).toHaveText('Choose an interface to continue.');
    await expect(error).toHaveAttribute('role', 'alert');
    await expect(page.locator(MODAL)).toBeVisible();
    await expect(page.locator('body')).toHaveClass(/first-visit-blocking/);
    await expect(page.locator('#firstVisitChoiceForge')).toBeFocused();

    // Picking an option clears the message; Continue then proceeds
    await page.locator('#firstVisitChoiceForge').check();
    await expect(error).toBeHidden();
    await page.locator('#first-visit-continue').click();
    await expect(page.locator(MODAL)).toBeHidden();
    await expect(page.locator('body')).not.toHaveClass(/first-visit-blocking/);
  });

  test('choosing Assistive Forge stays in the default UI and remembers', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForModal(page);

    await page.locator('#firstVisitChoiceForge').check();
    await page.locator('#first-visit-continue').click();
    await expect(page.locator(MODAL)).toBeHidden();

    await expect(page.locator('body')).not.toHaveAttribute(
      'data-ui-mode',
      'classic'
    );
    const seen = await page.evaluate(() =>
      localStorage.getItem('openscad-forge-first-visit-seen')
    );
    expect(seen).toBe('true');
  });

  test('choosing Classic applies the existing ui-mode switch after acceptance', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForModal(page);

    await page.locator('#firstVisitChoiceClassic').check();
    await page.locator('#first-visit-continue').click();
    await expect(page.locator(MODAL)).toBeHidden();

    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'classic'
    );
    const stored = await page.evaluate(() => ({
      seen: localStorage.getItem('openscad-forge-first-visit-seen'),
      uiMode: localStorage.getItem('openscad-forge-ui-mode'),
    }));
    expect(stored.seen).toBe('true');
    expect(JSON.parse(stored.uiMode).mode).toBe('classic');
  });

  test('unchecked remember proceeds this session and prompts again next visit', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForModal(page);

    await page.locator('#firstVisitRemember').uncheck();
    await page.locator('#firstVisitChoiceForge').check();
    await page.locator('#first-visit-continue').click();
    await expect(page.locator(MODAL)).toBeHidden();
    await expect(page.locator('body')).not.toHaveClass(/first-visit-blocking/);

    const seen = await page.evaluate(() =>
      localStorage.getItem('openscad-forge-first-visit-seen')
    );
    expect(seen).toBeNull();

    await page.reload();
    await waitForModal(page);
    await expect(page.locator('body')).toHaveClass(/first-visit-blocking/);
  });

  test('the open modal has no axe violations', async ({ page }) => {
    await page.goto('/');
    await waitForModal(page);

    const results = await new AxeBuilder({ page })
      .include(MODAL)
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();

    if (results.violations.length > 0) {
      console.log(JSON.stringify(results.violations, null, 2));
    }
    expect(results.violations).toEqual([]);
  });
});
