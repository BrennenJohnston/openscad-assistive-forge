import { test, expect } from '@playwright/test';

// UF-5 (U-10): Classic is desktop-only for now. The header toggle gates on
// viewport shape — disabled-with-reason on phones/portrait/narrow windows,
// re-enabled live when a desktop-shaped window returns.
//
// Everything here drives the gated control with the KEYBOARD: Playwright
// refuses .click() on aria-disabled elements, and the keyboard is the path
// that matters anyway. State is asserted, never viewport visibility — the
// header row can wrap the button out of view at phone widths (UF-4).

const REASON_TEXT =
  'Classic is desktop-only for now. A mobile version is planned. ' +
  'Use the Assistive Forge interface on phones and narrow windows.';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
  });
});

async function pressToggle(page) {
  await page.locator('#classicModeToggle').focus();
  await page.keyboard.press('Enter');
}

test.describe('Classic gate: phone viewport (375x812)', () => {
  // Plain viewport only — Firefox rejects isMobile at context creation
  // (the mobile-viewport.spec.js lesson).
  test.use({ viewport: { width: 375, height: 812 } });

  test('gate-header-disabled: the toggle is disabled-with-reason and refuses by keyboard', async ({
    page,
  }) => {
    await page.goto('/');

    const toggle = page.locator('#classicModeToggle');
    await expect(toggle).toHaveAttribute('aria-disabled', 'true');
    await expect(toggle).toHaveAttribute(
      'aria-describedby',
      'classicModeToggleReason'
    );

    const reason = page.locator('#classicModeToggleReason');
    expect((await reason.textContent()).replace(/\s+/g, ' ').trim()).toBe(
      REASON_TEXT
    );

    await pressToggle(page);
    await expect(page.locator('body')).not.toHaveAttribute(
      'data-ui-mode',
      'classic'
    );
    // The refusal is spoken: name + reason through the polite live region.
    await expect(page.locator('#srAnnouncer')).toContainText(
      'Classic unavailable',
      { timeout: 3000 }
    );
  });

  test('gate-live-re-enable: a desktop-shaped resize unlocks the toggle without a reload', async ({
    page,
  }) => {
    await page.goto('/');

    const toggle = page.locator('#classicModeToggle');
    await expect(toggle).toHaveAttribute('aria-disabled', 'true');

    await page.setViewportSize({ width: 1280, height: 800 });
    // The availability subscription is debounced (150ms); the retrying
    // assertion absorbs it.
    await expect(toggle).not.toHaveAttribute('aria-disabled', 'true');
    await expect(toggle).not.toHaveAttribute('aria-describedby', /.+/);

    await pressToggle(page);
    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'classic'
    );
  });
});

test.describe('Classic gate: the way out is never locked', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('gate-exit-open: narrowing a live Classic session leaves the exit enabled; re-entry is gated', async ({
    page,
  }) => {
    await page.goto('/');

    const toggle = page.locator('#classicModeToggle');
    await pressToggle(page);
    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'classic'
    );

    await page.setViewportSize({ width: 375, height: 812 });
    // Inside Classic the button points OUT — it must stay usable.
    await expect(toggle).not.toHaveAttribute('aria-disabled', 'true');

    await pressToggle(page);
    await expect(page.locator('body')).not.toHaveAttribute(
      'data-ui-mode',
      'classic'
    );
    // Back in Forge on a phone-shaped window: re-entry is gated.
    await expect(toggle).toHaveAttribute('aria-disabled', 'true');
  });
});

test.describe('Classic gate: detection boundaries (Q-25)', () => {
  test.use({ viewport: { width: 1024, height: 768 } });

  test('gate-boundary: 1024px landscape is desktop; 1023px is not', async ({
    page,
  }) => {
    await page.goto('/');

    const toggle = page.locator('#classicModeToggle');
    await expect(toggle).not.toHaveAttribute('aria-disabled', 'true');

    await page.setViewportSize({ width: 1023, height: 768 });
    await expect(toggle).toHaveAttribute('aria-disabled', 'true');

    await page.setViewportSize({ width: 1024, height: 768 });
    await expect(toggle).not.toHaveAttribute('aria-disabled', 'true');
  });

  test('gate-portrait: a wide-enough portrait viewport is still gated; rotation unlocks it', async ({
    page,
  }) => {
    await page.goto('/');

    // The recorded Q-25 trade: 1080 wide but portrait counts as
    // mobile-shaped.
    await page.setViewportSize({ width: 1080, height: 1350 });
    const toggle = page.locator('#classicModeToggle');
    await expect(toggle).toHaveAttribute('aria-disabled', 'true');

    await page.setViewportSize({ width: 1350, height: 1080 });
    await expect(toggle).not.toHaveAttribute('aria-disabled', 'true');
  });
});
