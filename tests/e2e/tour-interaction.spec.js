/**
 * Tours that survive touch (UF-21: U-28, U-29, defects D-28 / D-32 / D-33).
 *
 * The walk this file pins is the one the owner reported: press the control a
 * tour is pointing at and the tour should still be there. MEASURED at the
 * release base 24b76a2, pressing every spotlighted control in both welcome
 * tours, exactly one press ended a tour - the Forge Simplified/Standard
 * switch at its own step.
 *
 * Q-50 (owner, 2026-08-14) sets the boundary: a change inside the tour's own
 * interface family keeps the tour, crossing between Forge and Classic still
 * closes it. Q-51 moved the Simplified/Standard teaching out of the two
 * welcome tours and into the two box tours, where pressing the switch does
 * something.
 *
 * Red-proven on 24b76a2 by in-tree revert of src/js/tutorial-sandbox.js,
 * src/styles/layout.css and src/styles/classic.css.
 *
 * @license GPL-3.0-or-later
 */
import { test, expect } from '@playwright/test';

const REGISTRY_KEY = 'openscad-forge-tutorial-state';
const CLASSIC_STAMP = JSON.stringify({
  mode: 'classic',
  lastCustomMode: 'standard',
});

/** Live regions clear themselves, so record every write instead of probing late. */
async function boot(page, { classic = false } = {}) {
  await page.addInitScript(
    ({ stamp, useClassic }) => {
      localStorage.setItem('openscad-forge-first-visit-seen', 'true');
      if (useClassic) localStorage.setItem('openscad-forge-ui-mode', stamp);
      window.__said = [];
      document.addEventListener('DOMContentLoaded', () => {
        for (const id of ['srAnnouncer', 'srAnnouncerAssertive']) {
          const el = document.getElementById(id);
          if (!el || el.__watched) continue;
          el.__watched = true;
          new MutationObserver(() => {
            const text = el.textContent.trim();
            if (text) window.__said.push(text);
          }).observe(el, {
            childList: true,
            characterData: true,
            subtree: true,
          });
        }
      });
    },
    { stamp: CLASSIC_STAMP, useClassic: classic }
  );
  await page.goto('/');
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 30_000 });
}

const said = (page) => page.evaluate(() => window.__said.slice());
const registry = (page) =>
  page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }, REGISTRY_KEY);

async function startWelcomeTour(page) {
  await page.locator('#startWelcomeTourBtn').click();
  await expect(page.locator('.tutorial-panel')).toBeVisible({ timeout: 15_000 });
}

/** Walk Next until the panel shows `title`. Welcome steps are all passive. */
async function walkTo(page, title, cap = 20) {
  for (let i = 0; i < cap; i++) {
    if ((await page.locator('#tutorial-step-title').textContent()) === title) {
      return;
    }
    await page.locator('#tutorialNextBtn').click();
    await page.waitForTimeout(250);
  }
  await expect(page.locator('#tutorial-step-title')).toHaveText(title);
}

/**
 * The box tour, on the project surface where it belongs. The Beginners card's
 * button carries both data-example and data-tutorial, so one click loads the
 * example and starts the tour 500ms later.
 */
async function startBoxTour(page, { classic = false } = {}) {
  await boot(page, { classic });
  await page.locator('.btn-role-try[data-tutorial="intro"]').click();
  await expect(page.locator('body')).toHaveAttribute(
    'data-app-surface',
    'project',
    { timeout: 180_000 }
  );
  await expect(page.locator('.tutorial-panel')).toBeVisible({ timeout: 60_000 });
}

/**
 * Jump to the density step without satisfying every completion gate between
 * here and there: End goes to the last step, one Back reaches step 16 of 17.
 */
async function jumpToDensityStep(page) {
  await page.keyboard.press('End');
  await expect(page.locator('#tutorial-step-title')).toHaveText(
    "You're ready!",
    { timeout: 15_000 }
  );
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#tutorial-step-title')).toHaveText(
    'Simplified or Standard',
    { timeout: 15_000 }
  );
}

test.describe('U-28: a tour survives the control it highlights', () => {
  test('Forge box tour: pressing Simplified/Standard keeps the tour on its step, and it still advances', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await startBoxTour(page);
    await jumpToDensityStep(page);

    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'simplified'
    );
    await page.locator('#uiModeToggle').click();
    await page.waitForTimeout(1500);

    // The whole point: still open, still on this step, still spotlighting it
    await expect(page.locator('.tutorial-overlay')).toBeAttached();
    await expect(page.locator('#tutorial-step-title')).toHaveText(
      'Simplified or Standard'
    );
    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'standard'
    );
    await expect(page.locator('#uiModeToggle')).toHaveClass(
      /tutorial-target-highlight/
    );
    expect((await said(page)).join(' | ')).not.toContain(
      'because the interface changed'
    );

    // and the tour is not merely alive, it still works
    await page.locator('#tutorialNextBtn').click();
    await expect(page.locator('#tutorial-step-title')).toHaveText(
      "You're ready!",
      { timeout: 15_000 }
    );
  });

  test('Classic box tour: pressing the density switch keeps the tour on its step', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await startBoxTour(page, { classic: true });
    await expect(page.locator('#tutorial-panel-title')).toHaveText(
      'Classic Getting Started'
    );
    await jumpToDensityStep(page);

    await page.locator('#classicDensityToggle').click();
    await page.waitForTimeout(1500);

    await expect(page.locator('.tutorial-overlay')).toBeAttached();
    await expect(page.locator('#tutorial-step-title')).toHaveText(
      'Simplified or Standard'
    );
    await expect(page.locator('body')).toHaveAttribute(
      'data-classic-density',
      'simplified'
    );
    await expect(page.locator('#classicDensityToggle')).toHaveClass(
      /tutorial-target-highlight/
    );
  });

  test('crossing between Forge and Classic still closes the tour (Q-28a preserved)', async ({
    page,
  }) => {
    await boot(page);
    await startWelcomeTour(page);
    await walkTo(page, 'Keyboard shortcuts');

    await page.locator('#classicModeToggle').click();
    await expect(page.locator('.tutorial-overlay')).toHaveCount(0, {
      timeout: 15_000,
    });
    expect((await said(page)).join(' | ')).toContain(
      'because the interface changed'
    );
    // progress saved, completion NOT recorded
    const state = await registry(page);
    expect(state.welcome.opened).toEqual(expect.any(Number));
    expect(state.welcome.completed).toBeUndefined();
  });

  test('Q-50c: a press that opens a dialog stands the tour aside, and closing it brings the tour back', async ({
    page,
  }) => {
    await boot(page);
    await startWelcomeTour(page);
    await walkTo(page, 'Keyboard shortcuts');

    await page.locator('#shortcutsToggle').click();
    await expect(page.locator('.tutorial-minimized')).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator('.tutorial-panel')).toBeHidden();
    await expect(page.locator('.tutorial-overlay')).toBeAttached();

    // Escape belongs to the dialog first
    await page.keyboard.press('Escape');
    await expect(page.locator('.tutorial-panel')).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator('#tutorial-step-title')).toHaveText(
      'Keyboard shortcuts'
    );

    // the next Escape is the tour's
    await page.keyboard.press('Escape');
    await expect(page.locator('.tutorial-overlay')).toHaveCount(0, {
      timeout: 10_000,
    });
  });
});

test.describe('the spotlight itself', () => {
  test('triage Table 1 #5: a tall target is scrolled clear of the chrome above its scroll container', async ({
    page,
  }) => {
    await boot(page)
    await startWelcomeTour(page)
    await walkTo(page, 'Open or start a project')

    // Push the target's top above the fold, still overlapping the viewport so
    // the engine can resolve it, and let the engine correct the scroll. This
    // drives the exact branch the defect lived in, instead of depending on
    // wherever the previous step happened to leave things. (Scrolling it out
    // of view entirely would make the target unresolvable and clear the
    // spotlight, which is a different path.)
    await page.evaluate(() => {
      document.getElementById('welcomeScreen').scrollTop = 600
      window.dispatchEvent(new Event('scroll'))
    })
    await page.waitForTimeout(900) // the engine scrolls smoothly

    const geometry = await page.evaluate(() => {
      const target = document.querySelector('.tutorial-target-highlight')
      const style = getComputedStyle(target)
      // the halo is drawn OUTSIDE the border box
      const halo =
        parseFloat(style.outlineOffset) + parseFloat(style.outlineWidth)
      const rect = target.getBoundingClientRect()
      const header = document.querySelector('.app-header')
      return {
        haloTop: Math.round(rect.top - halo),
        headerBottom: Math.round(header.getBoundingClientRect().bottom),
      }
    })

    // MEASURED at the base: haloTop 8 against a header bottom of 74, so the
    // top edge of the halo and the panel's own heading were both hidden.
    expect(geometry.haloTop).toBeGreaterThan(geometry.headerBottom)
  })
})

test.describe('UF-21 defects: a tour must not claim it finished', () => {
  test('D-28: a failure-driven skip past the last step does not record completion', async ({
    page,
  }) => {
    await boot(page);
    await startWelcomeTour(page);
    await walkTo(page, 'Your next step');

    await page.evaluate(() => {
      document.querySelector('.tutorial-target-highlight')?.remove();
    });
    await expect(page.locator('.tutorial-overlay')).toHaveCount(0, {
      timeout: 20_000,
    });

    const state = await registry(page);
    expect(state.welcome.opened).toEqual(expect.any(Number));
    expect(state.welcome.completed).toBeUndefined();
  });

  test('D-32: the X exits without recording completion and keeps the progress', async ({
    page,
  }) => {
    await boot(page);
    await startWelcomeTour(page);
    await page.locator('#tutorialNextBtn').click();
    await page.waitForTimeout(300);
    await page.locator('#tutorialNextBtn').click();
    await page.waitForTimeout(300);

    await page.locator('.tutorial-close').click();
    await expect(page.locator('.tutorial-overlay')).toHaveCount(0, {
      timeout: 10_000,
    });

    const state = await registry(page);
    expect(state.welcome.completed).toBeUndefined();
    // the saved progress survives, so Resume is still offered
    const progress = await page.evaluate(() =>
      sessionStorage.getItem('tutorialProgress')
    );
    expect(JSON.parse(progress)).toMatchObject({ tutorialId: 'welcome' });
    // and the spotlight has NOT handed over as though the tour were finished.
    // Starting the tour already stripped the tag (UF-17: the 'opened' write
    // does that), so the tell is that NO card wears it. MEASURED at the base,
    // where the false completion fired the chain: 'Beginners Start Here'.
    await expect(page.locator('.role-path-card.welcome-spotlight')).toHaveCount(
      0
    );
  });

  test('D-33: starting a second tour replaces the first instead of crashing', async ({
    page,
  }) => {
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));

    await boot(page);
    await startWelcomeTour(page);
    await page.locator('#tutorialNextBtn').click();
    await page.waitForTimeout(300);

    await page.evaluate(() => {
      void window.startTutorial('low-vision');
    });

    await expect(page.locator('#tutorial-panel-title')).toHaveText(
      'Visual Accessibility',
      { timeout: 20_000 }
    );
    await expect(page.locator('.tutorial-overlay')).toBeAttached();
    expect(pageErrors).toEqual([]);
  });
});

test.describe('U-29: the welcome page does not offer an inert switch', () => {
  test('Forge: Simplified/Standard is absent on the welcome surface and present once a project opens', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await boot(page);
    await expect(page.locator('body')).toHaveAttribute(
      'data-app-surface',
      'welcome'
    );
    await expect(page.locator('#uiModeToggle')).toBeHidden();
    // display:none, not merely invisible: it must not be a tab stop
    expect(
      await page.evaluate(
        () => document.getElementById('uiModeToggle').checkVisibility?.() ?? null
      )
    ).toBe(false);

    await page.locator('.btn-role-try[data-tutorial="intro"]').click();
    await expect(page.locator('body')).toHaveAttribute(
      'data-app-surface',
      'project',
      { timeout: 180_000 }
    );
    await expect(page.locator('#uiModeToggle')).toBeVisible({ timeout: 30_000 });
  });

  test('Classic: the density switch is absent on the welcome surface and present once a project opens', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await boot(page, { classic: true });
    await expect(page.locator('body')).toHaveAttribute(
      'data-app-surface',
      'welcome'
    );
    await expect(page.locator('#classicDensityToggle')).toBeHidden();
    expect(
      await page.evaluate(
        () =>
          document.getElementById('classicDensityToggle').checkVisibility?.() ??
          null
      )
    ).toBe(false);

    await page.locator('.btn-role-try[data-tutorial="intro"]').click();
    await expect(page.locator('body')).toHaveAttribute(
      'data-app-surface',
      'project',
      { timeout: 180_000 }
    );
    await expect(page.locator('#classicDensityToggle')).toBeVisible({
      timeout: 30_000,
    });
  });

  test('Q-51a: the welcome tours are one step shorter in both interfaces', async ({
    page,
  }) => {
    await boot(page);
    await startWelcomeTour(page);
    await expect(page.locator('.tutorial-progress')).toContainText(
      'Step 1 of 13'
    );
    await expect(page.locator('#tutorial-step-title')).toHaveText(
      'Welcome to the Forge!'
    );
    // and the step it lost is gone, not merely renumbered
    await walkTo(page, 'High contrast');
    expect(await page.locator('#tutorial-step-current').textContent()).toBe('3');
  });

  test('Q-51a: the Classic welcome tour is one step shorter too', async ({
    page,
  }) => {
    await boot(page, { classic: true });
    await startWelcomeTour(page);
    await expect(page.locator('.tutorial-progress')).toContainText(
      'Step 1 of 10'
    );
    await walkTo(page, 'Open or start a project');
    expect(await page.locator('#tutorial-step-current').textContent()).toBe('3');
  });
});
