/**
 * A native menu's focus ring, read from the pixels: the Plate name style
 * menu in the Tactile Map Designer panel, focused by Tab (a script's
 * focus() gives no :focus-visible), pictured at 2x in the dark and the light
 * look, and the ring's contrast against the ground around the menu read
 * from the picture, the way alt-view-icon-states.spec.js reads icons.
 * Before the fix the shared select style drew a translucent halo that read
 * 1.79:1 in the light look and 2.93:1 in the dark look.
 *
 * @license GPL-3.0-or-later
 */
import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });

const LOOKS = [
  { name: 'the dark look', theme: 'dark' },
  { name: 'the light look', theme: 'light' },
];

async function seed(page, theme) {
  await page.addInitScript((theme) => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
    localStorage.setItem('openscad-forge-theme', theme);
    localStorage.setItem('openscad-forge-sounds', 'false');
  }, theme);
}

async function openTile(page) {
  await page.goto('/?example=tactile-map');
  await expect(page.locator('#tactileMapPanel')).toBeVisible({ timeout: 60000 });
  const notNow = page.locator('#saveProjectNotNow');
  try {
    await notNow.waitFor({ state: 'visible', timeout: 5000 });
    await notNow.click();
  } catch {
    // No save-project prompt to dismiss.
  }
}

/** Focus the control before the target by script, then one Tab: a keyboard arrival. */
async function focusByTab(page, selector) {
  await page.locator(selector).scrollIntoViewIfNeeded();
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    const all = [
      ...document.querySelectorAll(
        'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
      ),
    ].filter((e) => !e.disabled && e.getClientRects().length > 0);
    const i = all.indexOf(el);
    if (i > 0) all[i - 1].focus();
  }, selector);
  for (let n = 0; n < 40; n++) {
    await page.keyboard.press('Tab');
    const landed = await page.evaluate(
      (sel) => document.activeElement === document.querySelector(sel),
      selector
    );
    if (landed) return true;
  }
  return false;
}

/**
 * The ring's contrast: the ground is the most common pixel in the band
 * around the control's box, the ring the strongest pixels in that band.
 */
async function ringContrast(page, png, box) {
  return page.evaluate(
    async ({ b64, box }) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const bitmap = await createImageBitmap(
        new Blob([bytes], { type: 'image/png' })
      );
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(bitmap, 0, 0);
      const { data, width } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
      const lin = (v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      const lum = ([r, g, b]) =>
        0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
      const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      const mostCommon = (list) => {
        const buckets = new Map();
        for (const [r, g, b] of list) {
          const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
          const e = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
          e.n += 1;
          e.r += r;
          e.g += g;
          e.b += b;
          buckets.set(key, e);
        }
        const m = [...buckets.values()].sort((a, b) => b.n - a.n)[0];
        return [m.r, m.g, m.b].map((v) => Math.round(v / m.n));
      };
      const px = (x, y) => {
        const i = (y * width + x) * 4;
        return [data[i], data[i + 1], data[i + 2]];
      };
      const { left, top, right, bottom } = box;
      const around = [];
      for (let y = top - 14; y < bottom + 14; y++) {
        for (let x = left - 14; x < right + 14; x++) {
          const inBox = x >= left && x < right && y >= top && y < bottom;
          if (!inBox && x >= 0 && y >= 0 && x < width && y < bitmap.height) {
            around.push(px(x, y));
          }
        }
      }
      const ground = mostCommon(around);
      const gl = lum(ground);
      const strongest = around
        .map((p) => ({ p, c: ratio(lum(p), gl) }))
        .sort((a, b) => b.c - a.c)
        .slice(0, 60);
      const middle = strongest[Math.floor(strongest.length / 2)];
      const hex = (p) =>
        '#' + p.map((v) => v.toString(16).padStart(2, '0')).join('');
      return {
        ground: hex(ground),
        ring: hex(middle.p),
        contrast: Math.round(middle.c * 100) / 100,
      };
    },
    { b64: png.toString('base64'), box }
  );
}

test.describe('a native menu focused by keyboard', () => {
  for (const look of LOOKS) {
    test(`shows a ring of at least 3:1 against its ground in ${look.name}`, async ({
      page,
    }) => {
      test.setTimeout(120_000);
      await seed(page, look.theme);
      await openTile(page);
      const selector = '#tactileMapIdStyle';
      expect(await focusByTab(page, selector), 'the menu took the focus by Tab').toBe(
        true
      );
      await page.waitForTimeout(350);
      const box = await page.locator(selector).boundingBox();
      const png = await page.screenshot();
      const read = await ringContrast(page, png, {
        left: Math.round(box.x * 2),
        top: Math.round(box.y * 2),
        right: Math.round((box.x + box.width) * 2),
        bottom: Math.round((box.y + box.height) * 2),
      });
      expect(
        read.contrast,
        `the ring ${read.ring} on the ground ${read.ground}`
      ).toBeGreaterThanOrEqual(3);
    });
  }
});
