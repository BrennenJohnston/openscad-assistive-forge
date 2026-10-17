/**
 * The sounds button: just before the Alt View's key, in the look only. The
 * key's row is right-aligned, so the key stays under the spot that pressed it
 * when the button appears beside it. A press turns the sounds off and on; it is the
 * same setting as Preferences > Play sounds, and the two always agree. The
 * press that turns sounds on plays a key, so a person hears that it worked;
 * the press that turns them off plays nothing.
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test';
import { skipWithoutWebGL } from './helpers/webgl.js';
import { canSound, listenForSound, probeSound } from './helpers/sound.js';

test.describe.configure({ timeout: 240_000 });

const WASM_READY_TIMEOUT = 180_000;

async function openBox(page) {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
    localStorage.setItem('openscad-forge-theme', 'dark');
    localStorage.setItem('openscad-customizer-hfm-unlock', 'true');
    localStorage.setItem(
      'openscad-forge-ui-mode',
      JSON.stringify({ mode: 'standard', lastCustomMode: 'standard' })
    );
  });
  await page.goto('/?example=simple-box');
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: WASM_READY_TIMEOUT,
  });
  await skipWithoutWebGL(
    page,
    'no WebGL: the Alt View draws its characters from the 3D picture'
  );
  await page.waitForFunction(() => window.previewManager?.mesh, null, {
    timeout: WASM_READY_TIMEOUT,
  });
  const notNow = page.locator('#saveProjectNotNow');
  try {
    await notNow.waitFor({ state: 'visible', timeout: 3_000 });
    await notNow.click();
  } catch {
    // No save-project prompt to dismiss.
  }
}

async function setLook(page, on) {
  const key = page.locator('#_hfmToggle');
  await key.waitFor({ state: 'attached', timeout: 60_000 });
  if ((await key.getAttribute('aria-pressed')) !== String(on)) await key.click();
  if (on) {
    await expect(page.locator('html')).toHaveAttribute('data-ui-variant', 'mono');
  } else {
    await expect(page.locator('html')).not.toHaveAttribute('data-ui-variant', 'mono');
  }
  // The draw-in moves the header while it plays: measure after it.
  await page.evaluate(() =>
    Promise.race([
      Promise.allSettled(
        document
          .getAnimations()
          .filter((animation) =>
            Number.isFinite(animation.effect?.getComputedTiming().endTime)
          )
          .map((animation) => animation.finished)
      ),
      new Promise((resolve) => setTimeout(resolve, 8_000)),
    ])
  );
}

const storedSetting = (page) =>
  page.evaluate(() => localStorage.getItem('openscad-forge-sounds'));

// The button against the key: in the same row, just before it.
async function besideTheKey(page) {
  const key = await page.locator('#_hfmToggle').boundingBox();
  const button = await page.locator('#_hfmSounds').boundingBox();
  return {
    rowOffset: Math.abs(key.y + key.height / 2 - (button.y + button.height / 2)),
    gap: key.x - (button.x + button.width),
    width: button.width,
    height: button.height,
    left: button.x,
  };
}

// The look turned on by a press on the key: the button under the spot that
// was pressed, once the look is on. The look's own font may move the key a
// few pixels; a second press there must still reach the key.
async function underThePress(page) {
  const box = await page.locator('#_hfmToggle').boundingBox();
  const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await setLook(page, true);
  return page.evaluate(
    ({ x, y }) => document.elementFromPoint(x, y)?.closest('button')?.id ?? null,
    at
  );
}

test.describe('The sounds button', () => {
  test('sits just before the key in the look only, named, pressed and reached by Tab; the key stays put', async ({
    page,
  }) => {
    await openBox(page);
    await expect(page.locator('#_hfmSounds'), 'not outside the look').toBeHidden();

    expect(await underThePress(page), 'under the spot that pressed the key').toBe(
      '_hfmToggle'
    );
    const button = page.getByRole('button', { name: 'Sounds', exact: true });
    await expect(button).toBeVisible();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    const place = await besideTheKey(page);
    expect(place.rowOffset, 'in the key row').toBeLessThanOrEqual(2);
    expect(place.gap, 'just before the key').toBeGreaterThanOrEqual(0);
    expect(place.gap).toBeLessThanOrEqual(16);
    expect(place.width, 'a 44 px target').toBeGreaterThanOrEqual(44);
    expect(place.height).toBeGreaterThanOrEqual(44);

    await page.locator('#themeToggle').focus();
    await page.keyboard.press('Tab');
    await expect(button, 'the next stop after the theme button').toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('#_hfmToggle'), 'then the key').toBeFocused();

    await setLook(page, false);
    await expect(page.locator('#_hfmSounds'), 'gone with the look').toBeHidden();
  });

  test('a press turns sounds off and on, and Preferences agrees both ways', async ({
    page,
  }) => {
    await openBox(page);
    await setLook(page, true);
    const button = page.locator('#_hfmSounds');

    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(await storedSetting(page)).toBe('false');

    await page.locator('#editMenuBtn').click();
    await page.getByRole('menuitem', { name: /Preferences/ }).first().click();
    await page.locator('#prefs-tab-advanced').click();
    const checkbox = page.getByRole('checkbox', { name: 'Play sounds' });
    await expect(checkbox, 'Preferences heard the button').not.toBeChecked();

    await checkbox.check();
    expect(await storedSetting(page)).toBe('true');
    await expect(button, 'the button heard Preferences').toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await checkbox.uncheck();
    await expect(button).toHaveAttribute('aria-pressed', 'false');
  });

  test('the press that turns sounds on plays a key; the one that turns them off, nothing', async ({
    page,
  }) => {
    await listenForSound(page);
    await openBox(page);
    await probeSound(page);
    await setLook(page, true);
    test.skip(
      !(await canSound(page)),
      'this machine has no sound device, so no sound can start'
    );
    // The look's own switch-on sound starts first; count from after it.
    await expect
      .poll(() => page.evaluate(() => window.__sounds.length), { timeout: 5_000 })
      .toBeGreaterThan(0);
    await page.evaluate(() => {
      window.__sounds = [];
    });
    const button = page.locator('#_hfmSounds');

    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => window.__sounds.length), 'turning off').toBe(0);

    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect
      .poll(() => page.evaluate(() => window.__sounds.length), { timeout: 2_000 })
      .toBe(1);
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => window.__sounds.length), 'one key').toBe(1);
  });

  test.describe('on a phone', () => {
    // No isMobile: Firefox rejects it when the browser context is created.
    test.use({ viewport: { width: 412, height: 915 }, hasTouch: true });

    test('it sits beside the key in its row, on the screen; the key stays put', async ({
      page,
    }) => {
      await openBox(page);
      expect(await underThePress(page), 'under the spot that pressed the key').toBe(
        '_hfmToggle'
      );
      await expect(page.locator('#_hfmSounds')).toBeVisible();
      const place = await besideTheKey(page);
      expect(place.rowOffset, 'in the key row').toBeLessThanOrEqual(2);
      expect(place.gap, 'just before the key').toBeGreaterThanOrEqual(0);
      expect(place.gap).toBeLessThanOrEqual(16);
      expect(place.width, 'a 44 px target').toBeGreaterThanOrEqual(44);
      expect(place.height).toBeGreaterThanOrEqual(44);
      expect(place.left, 'inside the screen').toBeGreaterThanOrEqual(0);
    });
  });
});
