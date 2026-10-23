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

// A downloaded official engine is kept in its own cache, which a new service
// worker leaves alone when it clears the old version's caches: a person who
// downloaded one does not download it again after the app updates.
//
// No route may stay in place while the kept engine is read: with any route
// installed, Chromium sends the page's requests past the service worker. The
// worker's script is routed only for the update, and the kept engine is
// proven by starting it offline.

const KEPT_ENGINE = 'official-2026-10-18';
const ENGINE_CACHE = 'forge-engines-v1';
const KEPT_FILES = [
  `/wasm/engines/${KEPT_ENGINE}/INTEGRITY.json`,
  `/wasm/engines/${KEPT_ENGINE}/openscad.js`,
  `/wasm/engines/${KEPT_ENGINE}/openscad.wasm`,
];

/**
 * Run `read` in the page; while a new worker's takeover reloads it, answer
 * `fallback` and let the next poll read it again.
 */
async function readPage(page, read, fallback, arg) {
  try {
    return await page.evaluate(read, arg);
  } catch (error) {
    if (/context was destroyed|navigat/i.test(error.message)) return fallback;
    throw error;
  }
}

const cacheNames = (page) => readPage(page, () => caches.keys(), []);

const keptFiles = (page) =>
  readPage(
    page,
    async (name) => {
      const cache = await caches.open(name);
      return (await cache.keys()).map((r) => new URL(r.url).pathname).sort();
    },
    [],
    ENGINE_CACHE
  );

/** One worker in charge, nothing installing or waiting, one app cache. */
const workerSettled = (page) =>
  readPage(
    page,
    async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      const appCaches = (await caches.keys()).filter((n) =>
        n.startsWith('openscad-forge-')
      );
      return (
        !!reg?.active &&
        !reg.installing &&
        !reg.waiting &&
        navigator.serviceWorker.controller?.scriptURL === reg.active.scriptURL &&
        appCaches.length === 1
      );
    },
    false
  );

/**
 * A page that reloads itself when a newer worker takes charge can abort a
 * navigation started in the same moment (the test's next-version worker is
 * registered under two addresses in turn, so it takes charge twice); after
 * that load the second try lands.
 */
async function gotoSettled(page, url) {
  for (let attempt = 1; ; attempt++) {
    try {
      await page.goto(url);
      return;
    } catch (error) {
      const selfReload = /ERR_ABORTED|interrupted by another navigation/.test(
        error.message
      );
      if (!selfReload || attempt >= 4) throw error;
      await page.waitForLoadState('load').catch(() => {});
      await page.waitForTimeout(500);
    }
  }
}

async function waitForEngine(page) {
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: 150_000,
  });
}

test('prod-engine-cache: a downloaded engine stays through a service worker update', async ({
  page,
  context,
}) => {
  test.setTimeout(300_000);

  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
  });
  const builds = [];
  page.on('console', (message) => {
    const m = /WASM build: (.*)$/.exec(message.text());
    if (m) builds.push(m[1]);
  });

  await page.goto('/');
  await waitForEngine(page);
  await expect.poll(() => workerSettled(page), { timeout: 60_000 }).toBe(true);
  const oldCache = (await cacheNames(page)).find((n) =>
    n.startsWith('openscad-forge-')
  );

  await page.evaluate(
    (id) => window.__forgeEngineChoice.download(id, () => {}),
    KEPT_ENGINE
  );
  expect(await keptFiles(page)).toEqual(KEPT_FILES);

  // The next version of the app: the same worker with another version name,
  // which makes it a new worker with a cache of its own. The browser fetches
  // the script again only for a new address (update() alone fetched nothing),
  // so the test registers it with a query.
  const builtWorker = fs.readFileSync(
    path.join(process.cwd(), 'dist', 'sw.js'),
    'utf8'
  );
  const version = /const CACHE_VERSION = '([^']+)'/.exec(builtWorker)?.[1];
  expect(version).toBeTruthy();
  const nextVersion = `${version}-next`;
  await context.route('**/sw.js*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/javascript',
      body: builtWorker.replace(
        `const CACHE_VERSION = '${version}'`,
        `const CACHE_VERSION = '${nextVersion}'`
      ),
    })
  );
  // The next version's worker takes charge of this page, which is of the
  // version before: on the Main Page the page reloads itself (sw-update.js),
  // so the test waits for that load before it reads anything more.
  const reloaded = page.waitForEvent('load', { timeout: 60_000 });
  await page.evaluate(() =>
    navigator.serviceWorker.register('/sw.js?next=1', { scope: '/' })
  );
  await reloaded;
  await expect
    .poll(() => cacheNames(page), { timeout: 60_000 })
    .toContain(`openscad-forge-${nextVersion}`);
  await expect
    .poll(() => cacheNames(page), { timeout: 30_000 })
    .not.toContain(oldCache);
  expect(await keptFiles(page)).toEqual(KEPT_FILES);
  await context.unroute('**/sw.js*');

  // Chosen, then loaded online until one worker is in charge again (the
  // page registers its own address, an update of its own), so the app's
  // files are in that worker's cache; the kept engine is still there.
  await page.evaluate(
    (id) => localStorage.setItem('openscad-forge-engine', id),
    KEPT_ENGINE
  );
  await gotoSettled(page, '/');
  await waitForEngine(page);
  await expect.poll(() => workerSettled(page), { timeout: 60_000 }).toBe(true);
  expect(await keptFiles(page)).toEqual(KEPT_FILES);
  await gotoSettled(page, '/');
  await waitForEngine(page);

  // With no network at all, the chosen engine starts from the kept cache.
  await context.setOffline(true);
  builds.length = 0;
  await gotoSettled(page, '/');
  await waitForEngine(page);
  await context.setOffline(false);
  expect(builds.join(' ')).toMatch(/OpenSCAD snapshot 2026\.10\.18/);
  expect(
    await page.evaluate(() => window.__forgeEngineChoice.enginePath())
  ).toBe(`/wasm/engines/${KEPT_ENGINE}`);
});
