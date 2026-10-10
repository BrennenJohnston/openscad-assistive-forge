import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

// An engine binary kept wrong in a cache.
//
// After the engine changed, browsers kept handing the old binary back from
// their own cache, and the engine could not start. A test cannot fill the
// browser's cache, but the service worker's cache is a real one too: here it
// holds a damaged engine, and the engine the app was built with must start.

const INTEGRITY = JSON.parse(
  fs.readFileSync(
    path.join(process.cwd(), 'public', 'wasm', 'openscad-official', 'INTEGRITY.json'),
    'utf8'
  )
);
const ENGINE_URL = `/wasm/openscad-official/openscad.wasm?v=${INTEGRITY.files[
  'openscad.wasm'
].sha256.slice(0, 16)}`;
const DAMAGED = 'a damaged engine';

test('prod-engine-cache: a damaged engine in the service worker cache is fetched again, and the engine starts', async ({
  page,
  context,
}) => {
  test.setTimeout(180_000);

  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
  });

  // While `damaged` is set, the network answers the engine with wrong bytes.
  let damaged = true;
  await context.route(
    (url) => url.pathname.endsWith('/wasm/openscad-official/openscad.wasm'),
    (route) =>
      damaged
        ? route.fulfill({
            status: 200,
            contentType: 'application/wasm',
            body: Buffer.from(DAMAGED),
          })
        : route.continue()
  );

  await page.goto('/');
  await page.waitForFunction(
    () => navigator.serviceWorker?.controller != null,
    null,
    { timeout: 60_000 }
  );
  // The service worker's cache-first fill stores the damaged copy.
  const cachedLength = await page.evaluate(async (url) => {
    const response = await fetch(url);
    return (await response.arrayBuffer()).byteLength;
  }, ENGINE_URL);
  expect(cachedLength).toBe(DAMAGED.length);
  damaged = false;

  await page.reload();
  const started = page
    .waitForSelector('body[data-wasm-ready="true"]', {
      state: 'attached',
      timeout: 150_000,
    })
    .then(() => 'started');
  const failed = page
    .locator('[data-testid="friendly-error-modal"]')
    .first()
    .waitFor({ timeout: 150_000 })
    .then(() => 'failed');
  expect(await Promise.race([started, failed])).toBe('started');
});
