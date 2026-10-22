/**
 * Icons drawn as strokes alone keep their shape under Windows High Contrast
 * (forced colors). The forced-colors rules give every svg the text color
 * for its fill and its stroke, so an icon that is only lines, like the Main
 * Page's upload arrow, must say so with `fill="none"` and be left open, or
 * its arrowhead and tray fill in and the arrow becomes a solid tray.
 *
 * The shape is read from a picture at 2x: the share of the icon's box that
 * carries ink. Lines leave most of the box empty; a filled arrowhead and
 * tray cover a good part of it. The browser does not paint the system's own
 * colors the way Windows does, so the measure is the shape, not a color.
 *
 * @license GPL-3.0-or-later
 */

import fs from 'node:fs';
import { test, expect } from '@playwright/test';

test.use({ deviceScaleFactor: 2 });

// Lines alone leave the box mostly empty; a filled arrowhead and tray do
// not (measured at 2x: 0.18 for the lines, 0.33 for the fill).
const MAX_INK_SHARE = 0.25;

async function inkShare(page, locator, file) {
  // The icon's own picture; the Main Page fades in, so its animations are
  // run to their end first.
  const png = await locator.screenshot({ animations: 'disabled' });
  if (file) fs.writeFileSync(file, png);
  return page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const bitmap = await createImageBitmap(
      new Blob([bytes], { type: 'image/png' })
    );
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0);
    const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    const buckets = new Map();
    const pixels = [];
    for (let i = 0; i < data.length; i += 4) {
      const p = [data[i], data[i + 1], data[i + 2]];
      pixels.push(p);
      const key = ((p[0] >> 4) << 8) | ((p[1] >> 4) << 4) | (p[2] >> 4);
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    const groundKey = [...buckets.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const ground = [
      ((groundKey >> 8) & 15) << 4,
      ((groundKey >> 4) & 15) << 4,
      (groundKey & 15) << 4,
    ];
    const ink = pixels.filter(
      (p) =>
        Math.abs(p[0] - ground[0]) +
          Math.abs(p[1] - ground[1]) +
          Math.abs(p[2] - ground[2]) >
        96
    ).length;
    return Math.round((ink / pixels.length) * 1000) / 1000;
  }, png.toString('base64'));
}

test('under forced colors the upload arrow stays lines, not a tray', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ forcedColors: 'active' });
  // The emulation applies the page's forced-colors rules but keeps the
  // theme's own text color where Windows would force it: the light theme
  // draws the icon dark on the Canvas white, where its shape can be read.
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
    localStorage.setItem('openscad-forge-theme', 'light');
  });
  await page.goto('/');
  const icon = page.locator('#uploadZone .upload-icon');
  await expect(icon).toBeVisible();
  // The Main Page draws in after it loads: the icon carries ink only then.
  await expect
    .poll(() => inkShare(page, icon), {
      timeout: 15_000,
      message: 'the upload arrow drawn',
    })
    .toBeGreaterThan(0);
  const file = testInfo.outputPath('upload-arrow.png');
  const share = await inkShare(page, icon, file);
  await testInfo.attach('upload-arrow.png', {
    path: file,
    contentType: 'image/png',
  });
  testInfo.annotations.push({ type: 'ink share', description: String(share) });
  console.log(`upload arrow ink share under forced colors: ${share}`);
  expect(
    share,
    `ink over the upload arrow's box under forced colors (${share}): a tray, not lines`
  ).toBeLessThanOrEqual(MAX_INK_SHARE);
});
