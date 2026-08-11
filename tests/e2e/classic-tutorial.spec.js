import { test, expect } from '@playwright/test';

// UF-8 (U-12): a tutorial that belongs to Classic. The intro launched from
// Classic runs the Classic tour in place (Q-29 entry decision); Forge-only
// tours ask before switching interfaces (D-35 dialog); a mid-tutorial
// interface switch wins, and a tutorial's forced mode never sticks to
// Classic's density or the saved preference (Q-28a, the U-12 poisoning).
//
// All five cases were proven red on the release parent 5e81dd4 by
// reverting src/js/tutorial-sandbox.js in-tree (the UF-4 method:
// git checkout <parent> -- <file>, restore with git checkout HEAD -- ).

const CLASSIC_STAMP = JSON.stringify({
  mode: 'classic',
  lastCustomMode: 'standard',
});

async function bootClassicWelcome(page) {
  await page.addInitScript((stamp) => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
    localStorage.setItem('openscad-forge-ui-mode', stamp);
  }, CLASSIC_STAMP);
  await page.goto('/');
  await page.waitForFunction(() => typeof window.startTutorial === 'function');
}

/** Advance one step and wait for its title (Next is disabled while navigating). */
async function nextTo(page, title) {
  await page.locator('#tutorialNextBtn').click();
  await expect(page.locator('.tutorial-step-title')).toHaveText(title, {
    timeout: 10000,
  });
}

test.describe('Classic tutorial (UF-8, U-12)', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('classic-tutorial-in-place: Start Tutorial from Classic runs the Classic tour with no interface switch', async ({
    page,
  }) => {
    await bootClassicWelcome(page);
    await page.locator('.btn-role-try[data-tutorial="intro"]').click();

    await expect(page.locator('.tutorial-overlay')).toBeVisible({
      timeout: 15000,
    });
    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'classic'
    );
    await expect(page.locator('#tutorial-panel-title')).toHaveText(
      'Classic Getting Started'
    );
    await expect(
      page.locator('[data-testid="tutorial-mode-choice-dialog"]')
    ).toHaveCount(0);
    await expect(page.locator('.tutorial-progress')).toContainText(
      'Step 1 of 16'
    );
  });

  test('classic-tutorial-spotlights: the tour spotlights real Classic chrome', async ({
    page,
  }) => {
    await bootClassicWelcome(page);
    // Load the example first (the welcome card path), cancel nothing: the
    // direct id keeps this case independent of the card's variant hop.
    await page.locator('.btn-role-try[data-tutorial="intro"]').click();
    await expect(page.locator('.tutorial-overlay')).toBeVisible({
      timeout: 15000,
    });

    await nextTo(page, 'The Classic layout');
    await nextTo(page, 'The menu bar');
    // The menu bar cutout spans the window width
    await expect
      .poll(
        async () =>
          Number(
            await page
              .locator('.tutorial-spotlight-cutout')
              .getAttribute('width')
          ),
        { timeout: 5000 }
      )
      .toBeGreaterThan(1000);

    await nextTo(page, 'The toolbar');
    await nextTo(page, 'The Customizer');
    // The dock column cutout is tall
    await expect
      .poll(
        async () =>
          Number(
            await page
              .locator('.tutorial-spotlight-cutout')
              .getAttribute('height')
          ),
        { timeout: 5000 }
      )
      .toBeGreaterThan(400);
  });

  test('classic-tutorial-switch-wins: pressing A. Forge mid-tour closes it and the switch stands', async ({
    page,
  }) => {
    await bootClassicWelcome(page);
    await page.locator('.btn-role-try[data-tutorial="intro"]').click();
    await expect(page.locator('.tutorial-overlay')).toBeVisible({
      timeout: 15000,
    });
    await nextTo(page, 'The Classic layout');

    await page.locator('#classicModeToggle').click();

    await expect(page.locator('.tutorial-overlay')).toHaveCount(0, {
      timeout: 4000,
    });
    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'standard'
    );
    const progress = await page.evaluate(() =>
      sessionStorage.getItem('tutorialProgress')
    );
    expect(JSON.parse(progress).tutorialId).toBe('classic-intro');
  });

  test('classic-tutorial-choice-dialog: a Forge-only tour from Classic asks first and Stay keeps everything', async ({
    page,
  }) => {
    await bootClassicWelcome(page);
    // Fire-and-forget: startTutorial's promise resolves only after the
    // dialog is answered, and evaluate would await it into a deadlock.
    await page.evaluate(() => {
      void window.startTutorial('makers');
    });

    const dialog = page.locator('[data-testid="tutorial-mode-choice-dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await expect(dialog).toContainText('This tour runs in Assistive Forge');
    await expect(dialog).toContainText(
      'The Advanced Features tour is designed for the Assistive Forge interface'
    );

    await dialog.locator('button[data-action="stay"]').click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('.tutorial-overlay')).toHaveCount(0);
    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'classic'
    );
    await expect(page.locator('body')).toHaveAttribute(
      'data-classic-density',
      'standard'
    );
  });

  test('classic-tutorial-density-heals: the intro tour forced Simplified never sticks to Classic', async ({
    page,
  }) => {
    // The exact U-12 poisoning chain, from a Forge Standard start: the intro
    // forces Simplified; choosing Classic mid-tour must close the tour AND
    // hand back the user's own density, dock layout and saved preference.
    await page.addInitScript(() => {
      localStorage.setItem('openscad-forge-first-visit-seen', 'true');
      localStorage.setItem(
        'openscad-forge-ui-mode',
        JSON.stringify({ mode: 'standard', lastCustomMode: 'standard' })
      );
    });
    await page.goto('/');
    await page.waitForFunction(
      () => typeof window.startTutorial === 'function'
    );
    await page.locator('.btn-role-try[data-tutorial="intro"]').click();
    await expect(page.locator('.tutorial-overlay')).toBeVisible({
      timeout: 15000,
    });
    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'simplified'
    );

    await page.locator('#classicModeToggle').click();

    await expect(page.locator('.tutorial-overlay')).toHaveCount(0, {
      timeout: 4000,
    });
    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'classic'
    );
    await expect(page.locator('body')).toHaveAttribute(
      'data-classic-density',
      'standard'
    );
    await expect(page.locator('#classicEditorSlot')).toBeVisible();
    const stored = JSON.parse(
      await page.evaluate(() => localStorage.getItem('openscad-forge-ui-mode'))
    );
    expect(stored.mode).toBe('classic');
    expect(stored.lastCustomMode).toBe('standard');
  });
});
