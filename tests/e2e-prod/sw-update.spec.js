import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

// The update banner's Refresh on a production build, where the service
// worker runs. A new deployment is a new sw.js: between two loads this case
// gives the built worker another cache version, the way a deploy would, so
// the page finds an update and shows the banner. Refresh must then load the
// new version, whether the new worker is waiting or already in charge.

const SW = path.join(process.cwd(), 'dist', 'sw.js');

test.describe('The update banner on a production build', () => {
  test('Refresh loads the new version within two seconds', async ({ page }) => {
    test.skip(!fs.existsSync(SW), 'needs a build in dist (npm run build)');
    const original = fs.readFileSync(SW, 'utf8');
    const match = original.match(/const CACHE_VERSION = '([^']*)'/);
    expect(match, 'the built worker names its cache version').not.toBeNull();
    try {
      await page.addInitScript(() => {
        localStorage.setItem('openscad-forge-first-visit-seen', 'true');
        localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
      });
      await page.goto('/');
      await page.waitForFunction(
        () => !!navigator.serviceWorker?.controller,
        null,
        {
          timeout: 60_000,
        }
      );

      fs.writeFileSync(
        SW,
        original.replace(match[0], `const CACHE_VERSION = '${match[1]}-next'`)
      );
      await page.reload();
      await expect(page.locator('#updateBanner')).toBeVisible({
        timeout: 30_000,
      });

      let loads = 0;
      page.on('load', () => {
        loads += 1;
      });
      const refresh = page.locator('#updateBannerRefresh');
      await refresh.click();
      await expect
        .poll(() => loads, {
          message: 'Refresh loaded the page again',
          timeout: 2_000,
        })
        .toBeGreaterThan(0);
    } finally {
      fs.writeFileSync(SW, original);
    }
  });
});
