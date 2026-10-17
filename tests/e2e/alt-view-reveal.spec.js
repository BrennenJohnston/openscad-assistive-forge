/**
 * The Alt View's moments: the screen draws in from the top, the status line
 * types its greeting before the ordinary line, and the picture rasters in
 * once the screen has drawn; every time the look comes on or changes.
 * With reduced motion nothing moves and the greeting shows whole.
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { skipWithoutWebGL } from './helpers/webgl.js';
import { canSound, listenForSound, probeSound } from './helpers/sound.js';

const GREETING = 'ALT VIEW ONLINE';
// The three switch sounds, in seconds, as public/sounds/ holds them.
const ON_SECONDS = 2.21;
const LOOK_SECONDS = 0.8;
const OFF_SECONDS = 2.17;
// The phosphor look's fifth dial click, in seconds: the file's data bytes
// over two (16-bit mono) over its rate. The browser decodes it at its own
// rate, so a played click is known by its length to a couple of
// milliseconds (the neighbouring tones are 15 ms longer and shorter).
const P5_SECONDS =
  readFileSync(fileURLToPath(new URL('../../public/sounds/dials/p5.wav', import.meta.url)))
    .readUInt32LE(40) /
  2 /
  32000;

async function openBox(page) {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
    localStorage.setItem('openscad-forge-theme', 'dark');
    localStorage.setItem('openscad-customizer-hfm-unlock', 'true');
  });
  await page.goto('/?example=simple-box');
  await skipWithoutWebGL(
    page,
    'no WebGL: the Alt View draws its characters from the 3D picture'
  );
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: 180_000,
  });
  await page.waitForFunction(() => window.previewManager?.mesh, null, {
    timeout: 180_000,
  });
  const notNow = page.locator('#saveProjectNotNow');
  try {
    await notNow.waitFor({ state: 'visible', timeout: 3_000 });
    await notNow.click();
  } catch {
    // No save-project prompt to dismiss.
  }
}

// Everything the reveal attribute, the status line and the picture's
// power-on do, from now on.
async function watch(page) {
  await page.evaluate(() => {
    window.__altViewStart = { revealed: false, revealedAt: null, lines: [], rasters: [] };
    let rastering = false;
    new MutationObserver(() => {
      const canvas = document.querySelector('.hfm-overlay-canvas');
      const on = Boolean(canvas?.classList.contains('alt-view-power-on'));
      if (on && !rastering) {
        const raster = canvas
          .getAnimations()
          .find((a) => a.animationName.startsWith('alt-view-power-on'));
        window.__altViewStart.rasters.push({
          delay: raster ? raster.effect.getTiming().delay : null,
          name: raster ? raster.animationName : null,
        });
      }
      rastering = on;
    }).observe(document.documentElement, {
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
    });
    new MutationObserver(() => {
      if (document.documentElement.hasAttribute('data-alt-view-reveal')) {
        window.__altViewStart.revealed = true;
        window.__altViewStart.revealedAt ??= performance.now();
      }
    }).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-alt-view-reveal'],
    });
    const line = document.getElementById('previewStatusAltAdjust');
    new MutationObserver(() => {
      window.__altViewStart.lines.push(line.textContent);
    }).observe(line, { childList: true, characterData: true, subtree: true });
  });
}

const seen = (page) => page.evaluate(() => window.__altViewStart);

async function turnOn(page) {
  const key = page.locator('#_hfmToggle');
  await key.click();
  await expect(key).toHaveAttribute('aria-pressed', 'true');
}

async function turnOff(page) {
  const key = page.locator('#_hfmToggle');
  await key.click();
  await expect(key).toHaveAttribute('aria-pressed', 'false');
}

// The three together, as the moment plays them, from a fresh watch.
async function expectTheMoment(page, when) {
  await expect
    .poll(async () => (await seen(page)).revealed, { timeout: 5_000 })
    .toBe(true);
  await expect(page.locator('html')).not.toHaveAttribute('data-alt-view-reveal', {
    timeout: 5_000,
  });
  await expect(page.locator('#previewStatusAltAdjust')).toHaveText(/^\[ALT VIEW\] EDGE/, {
    timeout: 6_000,
  });
  const { lines, rasters } = await seen(page);
  expect(lines, `${when}: the greeting typed`).toContain(GREETING);
  expect(rasters, `${when}: the picture powers on after the draw-in`).toEqual([
    { delay: 1000, name: 'alt-view-power-on' },
  ]);
}

const watchAgain = (page) =>
  page.evaluate(() => {
    window.__altViewStart = { revealed: false, revealedAt: null, lines: [], rasters: [] };
  });

// The sound first, then the screen: how long after the last sound started
// the draw-in began (negative: the screen came first).
const screenAfterSoundMs = (page) =>
  page.evaluate(() => {
    const sound = window.__sounds.at(-1);
    return sound ? window.__altViewStart.revealedAt - sound.at : null;
  });
const SOUND_LEAD_MAX_MS = 250;

test.describe('The Alt View draws in every time', () => {
  test('off and on again, and a theme change while on, each draw in with the greeting', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await openBox(page);
    await watch(page);
    await turnOn(page);
    await expectTheMoment(page, 'the first time');

    await turnOff(page);
    await watchAgain(page);
    await turnOn(page);
    await expectTheMoment(page, 'the second time');

    await watchAgain(page);
    await page.locator('#themeToggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expectTheMoment(page, 'after a theme change');
  });

  test('the first time: the screen draws in, the greeting is typed, the picture rasters in', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await openBox(page);
    await watch(page);
    await turnOn(page);

    await expect.poll(async () => (await seen(page)).revealed).toBe(true);
    // The draw-in finishes and leaves nothing behind.
    await expect(page.locator('html')).not.toHaveAttribute('data-alt-view-reveal', {
      timeout: 5_000,
    });
    // The ordinary line follows the greeting.
    await expect(page.locator('#previewStatusAltAdjust')).toHaveText(/^\[ALT VIEW\] EDGE/, {
      timeout: 6_000,
    });
    const { lines } = await seen(page);
    const greeting = lines.indexOf(GREETING);
    expect(greeting, 'the greeting shown').toBeGreaterThanOrEqual(0);
    // Typed: its first letters shown on their own before it.
    expect(lines.slice(0, greeting)).toContain('ALT');
    expect(lines.slice(0, greeting).every((l) => GREETING.startsWith(l))).toBe(true);
    // The picture powers on once, a CRT warming up, waiting the draw-in's
    // second first, and the class goes when it has.
    expect((await seen(page)).rasters).toEqual([{ delay: 1000, name: 'alt-view-power-on' }]);
    await expect(page.locator('.hfm-overlay-canvas')).not.toHaveClass(/alt-view-power-on/, {
      timeout: 5_000,
    });
  });

  test('in Classic the picture powers on in the DOS way', async ({ page }) => {
    test.setTimeout(240_000);
    await openBox(page);
    const uiToggle = page.locator('#uiModeToggle');
    if ((await uiToggle.getAttribute('aria-checked')) !== 'true') await uiToggle.click();
    await page.locator('#classicModeToggle').click();
    await expect(page.locator('body')).toHaveAttribute('data-ui-mode', 'classic');
    await watch(page);
    await turnOn(page);
    await expect.poll(async () => (await seen(page)).rasters.length, { timeout: 6_000 }).toBe(1);
    expect((await seen(page)).rasters).toEqual([{ delay: 1000, name: 'alt-view-power-on-dos' }]);
    await expect(page.locator('.hfm-overlay-canvas')).not.toHaveClass(/alt-view-power-on/, {
      timeout: 5_000,
    });
  });

  test('with reduced motion: nothing moves, the greeting shows whole', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openBox(page);
    expect(
      await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
      'the setting is on'
    ).toBe(true);
    await watch(page);
    await turnOn(page);

    await expect(page.locator('#previewStatusAltAdjust')).toHaveText(/^\[ALT VIEW\] EDGE/, {
      timeout: 6_000,
    });
    const { revealed, lines, rasters } = await seen(page);
    expect(revealed, 'no draw-in').toBe(false);
    expect(rasters, 'no raster-in').toEqual([]);
    const greeting = lines.indexOf(GREETING);
    expect(greeting, 'the greeting shown').toBeGreaterThanOrEqual(0);
    // Whole at once: nothing of it was shown before.
    expect(lines.slice(0, greeting).filter((l) => l && GREETING.startsWith(l))).toEqual(
      []
    );
  });
});

test.describe('The Alt View is heard', () => {
  test('switch-on, a look change and switch-off each play their sound once', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await listenForSound(page);
    await openBox(page);
    await watch(page);
    await probeSound(page);
    await turnOn(page);
    test.skip(
      !(await canSound(page)),
      'this browser cannot start a sound here (no sound device)'
    );
    // The long sounds in order, the key presses (each about 0.16 s) counted
    // apart, since a press's take varies, and the dial clicks (under 0.13 s)
    // by their length, which tells one click file from another.
    const heard = () =>
      page.evaluate(() => {
        const all = window.__sounds.map((s) => s.seconds);
        return {
          long: all.filter((s) => s > 0.5).map((s) => Number(s.toFixed(2))),
          keys: all.filter((s) => s >= 0.13 && s <= 0.2).length,
          clicks: all.filter((s) => s < 0.13).map((s) => Number(s.toFixed(4))),
        };
      });

    await expect.poll(async () => (await heard()).long, { timeout: 5_000 }).toEqual([ON_SECONDS]);
    await expect.poll(async () => (await seen(page)).revealed, { timeout: 5_000 }).toBe(true);
    const onLead = await screenAfterSoundMs(page);
    expect(onLead, 'switch-on: the sound first').toBeGreaterThanOrEqual(0);
    expect(onLead, 'switch-on: the screen right after it').toBeLessThan(SOUND_LEAD_MAX_MS);
    expect((await heard()).keys, 'the look\'s own key makes no key sound').toBe(0);

    // A button in the look: a key goes down, then up.
    await page.locator('#cameraPanelToggle').click();
    await expect.poll(async () => (await heard()).keys, { timeout: 5_000 }).toBe(2);

    // A slider in the look, dragged: a click as the steps go by, the same
    // file every time (the Characters slider's steps give it the fifth tone,
    // the file p5.wav), fifteen a second at most, and silence once let go.
    const characters = page.locator('#_hfmFontScale');
    await expect(characters).toBeVisible();
    await characters.scrollIntoViewIfNeeded();
    const box = await characters.boundingBox();
    const thumbX = box.x + (box.width * (0.6 - 0.3)) / (2.5 - 0.3);
    const y = box.y + box.height / 2;
    // The drag's clicks, once they have all started (each waits its turn on
    // the decoder): the count is read every half second until it holds.
    const settled = async (atLeast) => {
      let lastCount = -1;
      await expect
        .poll(
          async () => {
            const count = (await heard()).clicks.length;
            const held = count === lastCount;
            lastCount = count;
            return held && count >= atLeast;
          },
          { timeout: 10_000, intervals: [500] }
        )
        .toBe(true);
      return heard();
    };
    // A flick across eight moves as fast as the mouse goes: a ceiling of
    // fifteen a second allows two or three clicks in the time it takes.
    await page.mouse.move(thumbX, y);
    await page.mouse.down();
    const flickBegan = Date.now();
    for (let i = 1; i <= 8; i++) await page.mouse.move(thumbX + i * 6, y);
    const flickMs = Date.now() - flickBegan;
    await page.mouse.up();
    const flicked = await settled(1);
    expect(flicked.clicks.length, `a flick of ${flickMs} ms`).toBeLessThanOrEqual(
      Math.ceil(flickMs / 66) + 1
    );
    // A drag with a pause between moves: a click per move, the same file.
    await page.mouse.down();
    for (let i = 7; i >= 0; i--) {
      await page.mouse.move(thumbX + i * 6, y);
      await page.waitForTimeout(80);
    }
    await page.mouse.up();
    const dragged = await settled(flicked.clicks.length + 4);
    expect(new Set(dragged.clicks).size, 'one click file for the whole drag').toBe(1);
    expect(Math.abs(dragged.clicks[0] - P5_SECONDS), 'the fifth tone').toBeLessThan(0.002);
    expect(dragged.keys, 'a slider is not a key').toBe(2);
    await page.waitForTimeout(500);
    expect((await heard()).clicks.length, 'silence once let go').toBe(dragged.clicks.length);
    // The keyboard: an arrow is a step, so a click.
    await characters.focus();
    await page.keyboard.press('ArrowLeft');
    await expect
      .poll(async () => (await heard()).clicks.length, { timeout: 5_000 })
      .toBe(dragged.clicks.length + 1);
    expect((await heard()).clicks.at(-1), 'the same file').toBe(dragged.clicks[0]);
    await page.locator('#cameraPanelToggle').click();
    await expect.poll(async () => (await heard()).keys, { timeout: 5_000 }).toBe(4);

    await expect(page.locator('html')).not.toHaveAttribute('data-alt-view-reveal', {
      timeout: 5_000,
    });
    await watchAgain(page);
    await page.locator('#themeToggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect
      .poll(async () => (await heard()).long, { timeout: 5_000 })
      .toEqual([ON_SECONDS, LOOK_SECONDS]);
    expect((await heard()).keys, 'the theme button is a key too').toBe(6);
    await expect.poll(async () => (await seen(page)).revealed, { timeout: 5_000 }).toBe(true);
    const lookLead = await screenAfterSoundMs(page);
    expect(lookLead, 'a look change: the sound first').toBeGreaterThanOrEqual(0);
    expect(lookLead, 'a look change: the screen right after it').toBeLessThan(SOUND_LEAD_MAX_MS);

    await turnOff(page);
    await expect
      .poll(async () => (await heard()).long, { timeout: 5_000 })
      .toEqual([ON_SECONDS, LOOK_SECONDS, OFF_SECONDS]);
    // Nothing else follows: the moment is over, and the key made no key sound.
    await page.waitForTimeout(1_500);
    const last = await heard();
    expect(last.long).toEqual([ON_SECONDS, LOOK_SECONDS, OFF_SECONDS]);
    expect(last.keys).toBe(6);
    expect(last.clicks.length).toBe(dragged.clicks.length + 1);
  });
});
