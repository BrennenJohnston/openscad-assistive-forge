/**
 * The Alt View's moments: the screen draws in from the top, the status line
 * types its greeting before the ordinary line, and the picture rasters in
 * once the screen has drawn; every time the look comes on or changes.
 * With reduced motion nothing moves and the greeting shows whole.
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test';
import { skipWithoutWebGL } from './helpers/webgl.js';

const GREETING = 'ALT VIEW ONLINE';

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
// raster-in do, from now on.
async function watch(page) {
  await page.evaluate(() => {
    window.__altViewStart = { revealed: false, lines: [], rasters: [] };
    let rastering = false;
    new MutationObserver(() => {
      const canvas = document.querySelector('.hfm-overlay-canvas');
      const on = Boolean(canvas?.classList.contains('alt-view-raster-in'));
      if (on && !rastering) {
        const raster = canvas
          .getAnimations()
          .find((a) => a.animationName === 'alt-view-raster-in');
        window.__altViewStart.rasters.push({
          delay: raster ? raster.effect.getTiming().delay : null,
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
  expect(rasters, `${when}: the picture rasters in after the draw-in`).toEqual([
    { delay: 1000 },
  ]);
}

const watchAgain = (page) =>
  page.evaluate(() => {
    window.__altViewStart = { revealed: false, lines: [], rasters: [] };
  });

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
    // The picture rasters in once, waiting the draw-in's second first.
    expect((await seen(page)).rasters).toEqual([{ delay: 1000 }]);
    await expect(page.locator('.hfm-overlay-canvas')).not.toHaveClass(/alt-view-raster-in/, {
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
