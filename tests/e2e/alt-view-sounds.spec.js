/**
 * The sounds button: just before the Alt View's key, in the look only. The
 * key's row is right-aligned, so the key stays under the spot that pressed it
 * when the button appears beside it. A press turns the sounds off and on; it is the
 * same setting as Preferences > Play sounds, and the two always agree. The
 * press that turns sounds on plays a key, so a person hears that it worked;
 * the press that turns them off plays nothing. In the look a drag of the
 * view ticks, and so does a camera button that turns, tilts or zooms it; a
 * drawer's own button is heard as the drawer, a latch, a roll and a stop in
 * time with its slide; and a menu latches.
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test';
import { skipWithoutWebGL } from './helpers/webgl.js';
import { canSound, listenForSound, probeSound } from './helpers/sound.js';
import { drawersBack } from './helpers/alt-view.js';

test.describe.configure({ timeout: 240_000 });

const WASM_READY_TIMEOUT = 180_000;
// The 3D view's four ticks, in seconds, as public/sounds/camera/ holds
// them. The browser decodes at its own rate, so a played tick is known by
// its length to a few milliseconds (a key is 160 ms).
const TURN_SECONDS = 0.102;
const TILT_SECONDS = 0.03;
const ZOOM_SECONDS = 0.018;
const PAN_SECONDS = 0.12;
const oneTick = (heard, seconds) =>
  heard.length === 1 && Math.abs(heard[0] - seconds) < 0.005;
// The drawer's parts, in seconds, as public/sounds/drawers/ holds them.
const DRAWER_PARTS = {
  'latch-open': 0.172,
  'slide-open': 0.4,
  'stop-open': 0.26,
  'grip-close': 0.285,
  'slide-close': 0.45,
  'stop-close': 0.24,
  'latch-close': 0.3,
};
// The lever's flips and the scroll's ticks, in seconds, as
// public/sounds/switches/ and public/sounds/scroll/ hold them.
const LEVER_ON_SECONDS = 0.13;
const LEVER_OFF_SECONDS = 0.12;
const PLATEN_SECONDS = 0.055;
const PLATEN_END_SECONDS = 0.0824;
const near = (seconds, target) => Math.abs(seconds - target) < 0.005;
const partOf = (seconds) =>
  Object.keys(DRAWER_PARTS).find((name) => Math.abs(DRAWER_PARTS[name] - seconds) < 0.005) ??
  `${seconds} s`;

async function openBox(page, mode = 'standard') {
  await page.addInitScript((mode) => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
    localStorage.setItem('openscad-forge-theme', 'dark');
    localStorage.setItem('openscad-customizer-hfm-unlock', 'true');
    localStorage.setItem(
      'openscad-forge-ui-mode',
      JSON.stringify({ mode, lastCustomMode: 'standard' })
    );
  }, mode);
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

  test('Preferences lists each kind of sound; one turned off stays silent while a key still plays, and the choice survives a reload', async ({
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
    await page.locator('#editMenuBtn').click();
    await page.getByRole('menuitem', { name: /Preferences/ }).first().click();
    await page.locator('#prefs-tab-advanced').click();
    const group = page.getByRole('group', { name: 'Sounds in Alt View' });
    await expect(group).toBeVisible();
    for (const name of [
      'Keys',
      'Sliders and grips',
      '3D view',
      'Drawers',
      'Switches and lists',
      'Menus and dialogs',
      'Typing',
      'Scrolling',
    ]) {
      await expect(group.getByRole('checkbox', { name }), name).toBeChecked();
    }
    await group.getByRole('checkbox', { name: 'Sliders and grips' }).uncheck();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);

    const heard = async (act) => {
      await page.waitForTimeout(400);
      const before = await page.evaluate(() => window.__sounds.length);
      await act();
      await page.waitForTimeout(700);
      return page.evaluate((from) => window.__sounds.slice(from).map((s) => s.seconds), before);
    };
    // The Focus slider is in the Lens drawer; its drawer sound, still on,
    // is let finish before the count starts.
    await page.locator('#lensDrawerToggle').click();
    await page.waitForTimeout(1500);
    const characters = page.locator('#_hfmFontScale');
    await expect(characters).toBeVisible();
    const box = await characters.boundingBox();
    const y = box.y + box.height / 2;
    const dragged = await heard(async () => {
      await page.mouse.move(box.x + box.width * 0.24, y);
      await page.mouse.down();
      for (let n = 1; n <= 8; n++) {
        await page.mouse.move(box.x + box.width * (0.24 + n * 0.03), y);
        await page.waitForTimeout(40);
      }
      await page.mouse.up();
    });
    expect(dragged, 'the slider is silent').toEqual([]);
    const pressed = await heard(() => page.locator('#expandAllGroupsBtn').click());
    expect(pressed, 'a key still plays, down and up').toHaveLength(2);

    // The page loaded again, as any case begins.
    await openBox(page);
    await page.locator('#editMenuBtn').click();
    await page.getByRole('menuitem', { name: /Preferences/ }).first().click();
    await page.locator('#prefs-tab-advanced').click();
    await expect(
      page.getByRole('group', { name: 'Sounds in Alt View' }).getByRole('checkbox', { name: 'Sliders and grips' }),
      'kept across a reload'
    ).not.toBeChecked();
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

  test("a drag of the view ticks as it turns, without sawing; a camera button that turns, tilts, zooms or pans ticks as the view", async ({
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

    // Each camera button pressed: the view's own tick for its move and no
    // key, by the tick's length; a pan button the lead screw's step.
    const lengths = () => page.evaluate(() => window.__sounds.map((s) => s.seconds));
    const heard = async (id) => {
      await page.waitForTimeout(500);
      const before = (await lengths()).length;
      await page.locator(`#${id}`).click();
      await page.waitForTimeout(800);
      return (await lengths()).slice(before);
    };
    const left = await heard('cameraRotateLeft');
    expect(oneTick(left, TURN_SECONDS), `rotate left, the turn: ${left}`).toBe(true);
    const down = await heard('cameraRotateDown');
    expect(oneTick(down, TILT_SECONDS), `rotate down, the tilt: ${down}`).toBe(true);
    const zoom = await heard('cameraZoomIn');
    expect(oneTick(zoom, ZOOM_SECONDS), `zoom in, the zoom: ${zoom}`).toBe(true);
    const pan = await heard('cameraPanLeft');
    expect(oneTick(pan, PAN_SECONDS), `pan left, the pan: ${pan}`).toBe(true);
  });

  test("in Classic the 3D view toolbar's zoom buttons tick as the view's zoom", async ({
    page,
  }) => {
    await listenForSound(page);
    await openBox(page, 'classic');
    await probeSound(page);
    await setLook(page, true);
    test.skip(
      !(await canSound(page)),
      'this machine has no sound device, so no sound can start'
    );
    // The panes slide back in after the look comes on, each with its sound.
    await drawersBack(page);
    for (const id of ['classicZoomInBtn', 'classicZoomOutBtn']) {
      await page.waitForTimeout(500);
      const before = await page.evaluate(() => window.__sounds.length);
      await page.locator(`#${id}`).click();
      await page.waitForTimeout(800);
      const heard = await page.evaluate(
        (from) => window.__sounds.slice(from).map((s) => s.seconds),
        before
      );
      expect(oneTick(heard, ZOOM_SECONDS), `${id}: ${heard}`).toBe(true);
    }
  });

  test("a drawer's own button is heard as the drawer alone: shut, the latch gripped, the glide, the muffled thump as it stops and the latch released; open, the latch and glide, the thump at its stop; a menu latches", async ({
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
      // Timed from the press as the page has it, which the drawer's slide
      // starts from.
      await page.evaluate(() => {
        document.addEventListener(
          'click',
          () => {
            window.__pressAt = performance.now();
          },
          { capture: true, once: true }
        );
      });
      await press();
      await page.waitForTimeout(1_200);
      return page.evaluate(() =>
        window.__sounds.map((s) => ({
          plays: s.at - window.__pressAt + s.delay * 1000,
          seconds: s.seconds,
        }))
      );
    };

    const button = page.locator('#collapseParamPanelBtn');
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    // Shut: no key; the latch gripped and the glide with the press, the
    // thump as the 450 ms slide ends, the latch released 120 ms after it.
    const closing = await heard(() => button.click());
    expect(closing.map((s) => partOf(s.seconds))).toEqual([
      'grip-close',
      'slide-close',
      'stop-close',
      'latch-close',
    ]);
    const [grip, roll, thump, latch] = closing.map((s) => s.plays);
    expect(grip, 'the grip with the press, ms').toBeLessThan(150);
    expect(Math.abs(roll - grip), 'together, ms').toBeLessThan(15);
    expect(thump, 'the thump as the 450 ms slide ends, ms').toBeGreaterThan(430);
    expect(thump, 'the thump as the 450 ms slide ends, ms').toBeLessThan(480);
    expect(latch - thump, 'the release after the thump, ms').toBeGreaterThan(105);
    expect(latch - thump, 'the release after the thump, ms').toBeLessThan(135);
    // Open: the latch and the roll with the press, the thump as the drawer
    // meets its stop, four fifths into its 500 ms slide.
    const opening = await heard(() => button.click());
    expect(opening.map((s) => partOf(s.seconds))).toEqual([
      'latch-open',
      'slide-open',
      'stop-open',
    ]);
    const [letGo, rollOut, stop] = opening.map((s) => s.plays);
    expect(letGo, 'the latch with the press, ms').toBeLessThan(150);
    expect(Math.abs(rollOut - letGo), 'together, ms').toBeLessThan(15);
    expect(stop, 'the thump at the stop, 400 ms in, ms').toBeGreaterThan(380);
    expect(stop, 'the thump at the stop, 400 ms in, ms').toBeLessThan(430);

    const menu = await heard(() => page.locator('#editMenuBtn').click());
    expect(menu.length, 'the key, down and up, and the latch').toBe(3);
    const shut = await heard(() => page.keyboard.press('Escape'));
    expect(shut, 'the latch shut').toHaveLength(1);
    expect(shut[0].seconds).toBeLessThan(0.25);
  });

  test("a switch in the Customizer flips a lever, down for off and up for on; the wheel over it ticks a line at a time and the end of the list once", async ({
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
    await page.locator('#expandAllGroupsBtn').click();
    await page.waitForTimeout(600);
    const heard = async (act) => {
      await page.waitForTimeout(500);
      const before = await page.evaluate(() => window.__sounds.length);
      await act();
      await page.waitForTimeout(800);
      return page.evaluate(
        (from) => window.__sounds.slice(from).map((s) => s.seconds),
        before
      );
    };

    // The lid starts on: off first, then on; the lever alone, no key.
    const lid = page.locator('label[for="param-include_lid"]');
    await lid.scrollIntoViewIfNeeded();
    const off = await heard(() => lid.click());
    expect(off.length === 1 && near(off[0], LEVER_OFF_SECONDS), `off: ${off}`).toBe(true);
    const on = await heard(() => lid.click());
    expect(on.length === 1 && near(on[0], LEVER_ON_SECONDS), `on: ${on}`).toBe(true);

    // The Customizer scrolled back to its top by the page: silent.
    const scroller = await page.evaluateHandle(() => {
      let el = document.getElementById('parametersContainer');
      while (
        el &&
        !(el.scrollHeight > el.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(el).overflowY))
      ) {
        el = el.parentElement;
      }
      return el;
    });
    const quiet = await heard(() => scroller.evaluate((el) => el.scrollTo(0, 0)));
    expect(quiet, "the page's own scroll").toEqual([]);

    // The wheel, a few notches down: a platen line a tick.
    const box = await scroller.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    const ticks = await heard(async () => {
      for (let n = 0; n < 4; n++) {
        await page.mouse.wheel(0, 60);
        await page.waitForTimeout(150);
      }
    });
    expect(ticks.length, `a tick a line: ${ticks}`).toBeGreaterThanOrEqual(3);
    expect(ticks.every((s) => near(s, PLATEN_SECONDS)), `the platen: ${ticks}`).toBe(true);
    // A long turn of the wheel to the bottom: the end of the list, last.
    const end = await heard(() => page.mouse.wheel(0, 5000));
    expect(near(end.at(-1) ?? 0, PLATEN_END_SECONDS), `the end: ${end}`).toBe(true);
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
