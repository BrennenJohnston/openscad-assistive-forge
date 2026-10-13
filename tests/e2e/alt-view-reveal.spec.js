/**
 * The Alt View's first moments in a page: the screen draws in from the top
 * and the status line types its greeting before the ordinary line, once.
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

// Everything the reveal attribute and the status line do, from now on.
async function watch(page) {
  await page.evaluate(() => {
    window.__altViewStart = { revealed: false, lines: [] };
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

test.describe('The Alt View draws in once', () => {
  test('the first time: the screen draws in and the greeting is typed', async ({
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

    // The second time in the same page: neither.
    await turnOff(page);
    await page.evaluate(() => {
      window.__altViewStart = { revealed: false, lines: [] };
    });
    await turnOn(page);
    await page.waitForTimeout(2_500);
    const again = await seen(page);
    expect(again.revealed, 'no second draw-in').toBe(false);
    expect(again.lines, 'no second greeting').not.toContain(GREETING);
    await expect(page.locator('#previewStatusAltAdjust')).toHaveText(/^\[ALT VIEW\] EDGE/);
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
    const { revealed, lines } = await seen(page);
    expect(revealed, 'no draw-in').toBe(false);
    const greeting = lines.indexOf(GREETING);
    expect(greeting, 'the greeting shown').toBeGreaterThanOrEqual(0);
    // Whole at once: nothing of it was shown before.
    expect(lines.slice(0, greeting).filter((l) => l && GREETING.startsWith(l))).toEqual(
      []
    );
  });
});
