/**
 * The sounds button: just before the Alt View's key, in the look only. The
 * key's row is right-aligned, so the key stays under the spot that pressed it
 * when the button appears beside it. A press turns the sounds off and on; it is the
 * same setting as Preferences > Play sounds, and the two always agree. The
 * press that turns sounds on plays a key, so a person hears that it worked;
 * the press that turns them off plays nothing. In the look a drag of the
 * view ticks, a drawer slides with a sound of its own, and a menu latches.
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test';
import { skipWithoutWebGL } from './helpers/webgl.js';
import { canSound, listenForSound, probeSound } from './helpers/sound.js';
import { drawersBack } from './helpers/alt-view.js';

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

  test('a drag of the view ticks as it turns, without sawing; a camera button sounds only its key', async ({
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
    const panel = page.locator('#cameraPanelToggle');
    if ((await panel.getAttribute('aria-expanded')) !== 'true') await panel.click();
    await page.waitForTimeout(500);
    const started = () => page.evaluate(() => window.__sounds.map((s) => s.at));

    // A slow drag across the view: about two turns' worth of ticks.
    const view = await page.locator('#previewContainer').boundingBox();
    const y = view.y + view.height / 2;
    const from = view.x + view.width * 0.3;
    await page.waitForTimeout(500);
    const before = (await started()).length;
    await page.mouse.move(from, y);
    await page.mouse.down();
    for (let n = 1; n <= 30; n++) {
      await page.mouse.move(from + n * 8, y);
      await page.waitForTimeout(30);
    }
    await page.mouse.up();
    await page.waitForTimeout(1_500);
    const ticks = (await started()).slice(before);
    expect(ticks.length, 'ticks while turning').toBeGreaterThanOrEqual(2);
    const gaps = ticks.slice(1).map((at, n) => at - ticks[n]);
    expect(Math.min(...gaps), 'never closer than the ceiling allows, ms').toBeGreaterThanOrEqual(
      60
    );

    // Rotate left, pressed: its key's press and release, and no tick.
    await page.waitForTimeout(500);
    const beforeButton = (await started()).length;
    await page.locator('#cameraRotateLeft').click();
    await page.waitForTimeout(800);
    expect((await started()).length - beforeButton, 'the key, down and up').toBe(2);
  });

  test("a drawer's button plays its key, then the drawer's own slide as long as the slide; a menu latches open and shut", async ({
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
    await drawersBack(page);
    const heard = async (press) => {
      await page.waitForTimeout(600);
      await page.evaluate(() => {
        window.__sounds = [];
      });
      const at = await page.evaluate(() => performance.now());
      await press();
      await page.waitForTimeout(900);
      return page.evaluate(
        (from) => window.__sounds.map((s) => ({ after: s.at - from, seconds: s.seconds })),
        at
      );
    };
    const slides = (sounds) => sounds.filter((s) => s.seconds > 0.3);

    const button = page.locator('#collapseParamPanelBtn');
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    const closing = await heard(() => button.click());
    expect(slides(closing), 'one slide shut').toHaveLength(1);
    expect(slides(closing)[0].seconds, 'as long as the slide shut, s').toBeCloseTo(0.45, 2);
    expect(slides(closing)[0].after, 'with the press, ms').toBeLessThan(300);
    expect(closing.length - 1, 'and the key, down and up').toBe(2);
    const opening = await heard(() => button.click());
    expect(slides(opening), 'one slide open').toHaveLength(1);
    expect(slides(opening)[0].seconds, 'as long as the slide open, s').toBeCloseTo(0.5, 2);

    const menu = await heard(() => page.locator('#editMenuBtn').click());
    expect(menu.length, 'the key, down and up, and the latch').toBe(3);
    const shut = await heard(() => page.keyboard.press('Escape'));
    expect(shut, 'the latch shut').toHaveLength(1);
    expect(shut[0].seconds).toBeLessThan(0.25);
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
