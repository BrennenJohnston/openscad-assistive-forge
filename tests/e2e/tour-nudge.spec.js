/**
 * Welcome tour nudge (U-27, UF-22)
 *
 * A centred dialog asks about the Welcome Page Tour on a fresh profile,
 * lights the tutorial menu behind it and outlines the Start button — which
 * MEASURED at P0 sits below the fold at 1400x1024 in Forge, the reason the
 * card's own tip was not noticed.
 *
 * Q-52 (owner, 2026-08-15, with the mock on screen): it shows while the
 * welcome family is not completed and not suppressed; once per app load;
 * the card's tip stands down underneath it and takes over when the dialog is
 * answered; "Dismiss tip" on the card counts as a no and stops it for good.
 *
 * The nudge must never appear while the first-visit gate holds #app inert.
 *
 * These cases deliberately do NOT carry the global nudge suppression that
 * every other spec seeds — the nudge is the subject here.
 *
 * @license GPL-3.0-or-later
 */
import { test, expect } from '@playwright/test';

const SEEN_KEY = 'openscad-forge-first-visit-seen';
const SUPPRESS_KEY = 'openscad-forge-tour-nudge-suppressed';
const REGISTRY_KEY = 'openscad-forge-tutorial-state';

const MODAL = '.tour-nudge-modal';
const BACKDROP = '.tour-nudge-backdrop';
const LIT = '.tour-nudge-lit';
const TARGET = '.tour-nudge-target';
const CARD_TIP = '.welcome-spotlight-tag';
const START_BTN = '#startWelcomeTourBtn';

const CLASSIC_STAMP = JSON.stringify({
  mode: 'classic',
  lastCustomMode: 'standard',
});

/**
 * Boot past the first-visit gate with the nudge left armed.
 * @param {import('@playwright/test').Page} page
 * @param {Object} [options]
 * @param {Object} [options.storage] - Extra localStorage entries to seed
 * @param {boolean} [options.classic] - Boot into the Classic interface
 */
async function bootWelcome(page, { storage = {}, classic = false } = {}) {
  await page.addInitScript(
    ({ seenKey, storage, stamp }) => {
      localStorage.setItem(seenKey, 'true');
      if (stamp) localStorage.setItem('openscad-forge-ui-mode', stamp);
      for (const [key, value] of Object.entries(storage)) {
        localStorage.setItem(key, value);
      }
    },
    { seenKey: SEEN_KEY, storage, stamp: classic ? CLASSIC_STAMP : null }
  );
  await page.goto('/');
  await page.waitForFunction(() => typeof window.startTutorial === 'function');
}

test.describe('Welcome tour nudge (U-27, UF-22)', () => {
  test.use({ viewport: { width: 1400, height: 1024 } });

  test('a fresh profile is asked, with the menu lit and the Start button brought on screen', async ({
    page,
  }) => {
    await bootWelcome(page);

    await expect(page.locator(MODAL)).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(BACKDROP)).toHaveCount(1);
    await expect(page.locator(LIT)).toHaveCount(1);
    await expect(page.locator(TARGET)).toHaveCount(1);

    // Q-52c: the card's own tip stands down while the dialog is asking.
    await expect(page.locator(CARD_TIP)).toHaveCount(0);

    // The whole point of the release. Without the scroll this button is at
    // y=1026 in a 1024px window.
    const onScreen = await page.evaluate((sel) => {
      const box = document.querySelector(sel).getBoundingClientRect();
      return { top: box.top, bottom: box.bottom, viewport: window.innerHeight };
    }, START_BTN);
    expect(onScreen.top).toBeGreaterThanOrEqual(0);
    expect(onScreen.bottom).toBeLessThanOrEqual(onScreen.viewport);

    // Named for assistive technology, and focus starts inside it.
    const dialog = page.locator(MODAL);
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(dialog).toHaveAttribute('role', 'dialog');
    await expect(page.locator('#tourNudgeTitle')).toHaveText(
      'Take a quick tour of this page?'
    );
    await expect(page.locator('.tour-nudge-start')).toBeFocused();
  });

  test('Start opens the tour, and a completed tour is never asked again', async ({
    page,
  }) => {
    await bootWelcome(page);
    await page.locator('.tour-nudge-start').click();

    await expect(page.locator('.tutorial-overlay')).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator('#tutorial-panel-title')).toHaveText(
      'Main Page Tour'
    );
    await expect(page.locator(MODAL)).toHaveCount(0);
    await expect(page.locator(BACKDROP)).toHaveCount(0);

    // Q-44a survives: a tour merely OPENED hands the tip over on the next
    // visit, so nothing is decorated over the running tour.
    await expect(page.locator(CARD_TIP)).toHaveCount(0);

    // And a completed family is not asked again on the next load.
    await page.evaluate(
      ([key]) =>
        localStorage.setItem(key, JSON.stringify({ welcome: { completed: 1 } })),
      [REGISTRY_KEY]
    );
    await page.reload();
    await page.waitForFunction(
      () => typeof window.startTutorial === 'function'
    );
    await expect(page.locator(CARD_TIP)).toHaveCount(1);
    await expect(page.locator(MODAL)).toHaveCount(0);
  });

  test('Not now hands over to the card tip, keeps focus, and asks again next load', async ({
    page,
  }) => {
    await bootWelcome(page);
    await expect(page.locator(MODAL)).toBeVisible({ timeout: 30_000 });
    await page.locator('.tour-nudge-dismiss').click();

    await expect(page.locator(MODAL)).toHaveCount(0);
    await expect(page.locator(CARD_TIP)).toHaveCount(1);
    await expect(page.locator(START_BTN)).toBeFocused();

    const suppressed = await page.evaluate(
      (key) => localStorage.getItem(key),
      SUPPRESS_KEY
    );
    expect(suppressed).toBeNull();

    // Q-52b: once per app load, so a reload asks again.
    await page.reload();
    await page.waitForFunction(
      () => typeof window.startTutorial === 'function'
    );
    await expect(page.locator(MODAL)).toBeVisible({ timeout: 30_000 });
  });

  test('Escape dismisses for now without suppressing', async ({ page }) => {
    await bootWelcome(page);
    await expect(page.locator(MODAL)).toBeVisible({ timeout: 30_000 });
    await page.keyboard.press('Escape');

    await expect(page.locator(MODAL)).toHaveCount(0);
    await expect(page.locator(CARD_TIP)).toHaveCount(1);
    const suppressed = await page.evaluate(
      (key) => localStorage.getItem(key),
      SUPPRESS_KEY
    );
    expect(suppressed).toBeNull();
  });

  test('the checkbox is permanent, and the card tip still appears', async ({
    page,
  }) => {
    await bootWelcome(page);
    await expect(page.locator(MODAL)).toBeVisible({ timeout: 30_000 });
    await page.locator('#tourNudgeNever').check();
    await page.locator('.tour-nudge-dismiss').click();

    const suppressed = await page.evaluate(
      (key) => localStorage.getItem(key),
      SUPPRESS_KEY
    );
    expect(suppressed).toBe('true');
    await expect(page.locator(CARD_TIP)).toHaveCount(1);

    await page.reload();
    await page.waitForFunction(
      () => typeof window.startTutorial === 'function'
    );
    await expect(page.locator(CARD_TIP)).toHaveCount(1);
    await expect(page.locator(MODAL)).toHaveCount(0);
  });

  test('the card tip dismissal counts as a no (Q-52c)', async ({ page }) => {
    // Asked as a contrast, so the case cannot pass merely because no such
    // dialog exists: the same boot with an untouched registry must be asked.
    await bootWelcome(page);
    await expect(page.locator(MODAL)).toBeVisible({ timeout: 30_000 });

    await page.evaluate(
      ([key]) =>
        localStorage.setItem(key, JSON.stringify({ welcome: { dismissed: 1 } })),
      [REGISTRY_KEY]
    );
    await page.reload();
    await page.waitForFunction(
      () => typeof window.startTutorial === 'function'
    );
    await page.waitForTimeout(2_000);
    await expect(page.locator(MODAL)).toHaveCount(0);
  });

  test('the nudge stays away while the first-visit gate holds #app inert', async ({
    page,
  }) => {
    // No first-visit stamp: the gate is up and #app is inert.
    await page.goto('/');
    await page
      .locator('#first-visit-modal:not(.hidden)')
      .waitFor({ state: 'visible', timeout: 15_000 });
    await expect(page.locator('#app')).toHaveAttribute('aria-hidden', 'true');

    await page.waitForTimeout(2_000);
    await expect(page.locator(MODAL)).toHaveCount(0);

    // ...and arrives once the choice is made.
    await page.locator('#firstVisitChoiceForge').check();
    await page.locator('#first-visit-continue').click();
    await expect(page.locator(MODAL)).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('#app')).not.toHaveAttribute(
      'aria-hidden',
      'true'
    );
  });

  test('it waits behind a full-screen overlay instead of opening underneath one', async ({
    page,
  }) => {
    // The first build of this release opened the dialog under the WASM
    // loading overlay (z-index 10000 against the dialog's 1000), with
    // "Loading OpenSCAD Engine" printed across its buttons. No ordinary spec
    // can catch that, because CI and local runs both boot with the engine
    // already cached and the overlay gone in milliseconds. So one is stood up
    // by hand. #processingOverlay is the app's own id for a covering overlay
    // and nothing creates it at boot.
    await page.addInitScript(() => {
      localStorage.setItem('openscad-forge-first-visit-seen', 'true');
      const plant = () => {
        const el = document.createElement('div');
        el.id = 'processingOverlay';
        el.className = 'processing-overlay';
        document.body.appendChild(el);
      };
      if (document.body) plant();
      else document.addEventListener('DOMContentLoaded', plant);
    });
    await page.goto('/');
    await page.waitForFunction(
      () => typeof window.startTutorial === 'function'
    );

    await page.waitForTimeout(2_000);
    await expect(page.locator(MODAL)).toHaveCount(0);

    await page.evaluate(() =>
      document.getElementById('processingOverlay').remove()
    );
    await expect(page.locator(MODAL)).toBeVisible({ timeout: 15_000 });
  });

  test('the pulse on the outlined button is off under reduced motion', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await bootWelcome(page);
    await expect(page.locator(TARGET)).toHaveCount(1);

    const animation = await page.evaluate(
      (sel) => getComputedStyle(document.querySelector(sel)).animationName,
      TARGET
    );
    expect(animation).toBe('none');
  });

  test('Classic gets the same dialog on its own welcome surface', async ({
    page,
  }) => {
    await bootWelcome(page, { classic: true });
    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'classic'
    );
    await expect(page.locator(MODAL)).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(LIT)).toHaveCount(1);
    await expect(page.locator(TARGET)).toHaveCount(1);

    await page.locator('.tour-nudge-start').click();
    await expect(page.locator('#tutorial-panel-title')).toHaveText(
      'Classic Main Page Tour',
      { timeout: 20_000 }
    );
  });

  test('every control in the dialog clears the 44px target floor', async ({
    page,
  }) => {
    await bootWelcome(page);
    await expect(page.locator(MODAL)).toBeVisible({ timeout: 30_000 });

    for (const sel of [
      '.tour-nudge-start',
      '.tour-nudge-dismiss',
      '.tour-nudge-never',
    ]) {
      const box = await page.locator(sel).boundingBox();
      expect(box.height, `${sel} height`).toBeGreaterThanOrEqual(44);
      expect(box.width, `${sel} width`).toBeGreaterThanOrEqual(44);
    }
  });
});
