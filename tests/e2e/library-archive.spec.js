/**
 * AF-12: a library mounts from ONE archive, not one request per file.
 *
 * Turning on dotSCAD used to be 695 sequential fetches. Each library now
 * ships an archive.zip (built by scripts/setup-libraries.js) that the
 * worker unpacks; the per-file path stays as the SPOKEN fallback, so an
 * old deployment keeps working.
 *
 * dotSCAD is the probe, deliberately: it is the 695-file poster child, and
 * an earlier render in the same page can leave MCAD-shaped leftovers
 * (mounted files plus a /tmp symlink) in the worker filesystem that make a
 * bare MCAD include resolve with no mount in sight - first misread as MCAD
 * being preloaded in the WASM image, actually the D-42 leftover-mount
 * defect fixed in this same release. dotSCAD keeps the measurement
 * unambiguous.
 *
 * These cases need the real downloaded bundles (public/libraries/ is
 * populated by the setup script and gitignored), so like the companion
 * suites they run where those exist - local - and skip in CI.
 *
 * @license GPL-3.0-or-later
 */
import { test, expect } from '@playwright/test';

const isCI = !!process.env.CI;

const FIXTURE = {
  name: 'af12-dotscad.scad',
  mimeType: 'text/plain',
  buffer: Buffer.from(
    'include <dotSCAD/src/arc.scad>\necho("AF12_MOUNTED");\ncube(3);\n'
  ),
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
  });
});

/** Load the fixture, enable dotSCAD, and render once. */
async function renderWithDotscad(page) {
  await page.goto('/');
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: 180_000,
  });
  await page.locator('#fileInput').setInputFiles(FIXTURE);
  await expect(page.locator('#mainInterface')).toBeVisible({
    timeout: 30_000,
  });
  const notNow = page.locator('#saveProjectNotNow');
  try {
    await notNow.waitFor({ state: 'visible', timeout: 3_000 });
    await notNow.click();
  } catch {
    /* no modal */
  }

  // Detection auto-enables dotSCAD during load (measured: checked=true
  // before any interaction), and the panel itself is density-hidden on this
  // surface - no UI dance needed. The render that follows carries the
  // enabled library to the worker, which is the mount under test.
  await page.locator('#primaryActionBtn').click();
  await expect
    .poll(() => page.locator('#console-output').textContent(), {
      timeout: 180_000,
    })
    .toContain('AF12_MOUNTED');
}

test('dotSCAD mounts from its archive: a handful of requests, not hundreds', async ({
  page,
  context,
}) => {
  test.skip(isCI, 'needs the downloaded library bundles (setup-libraries.js)');
  test.setTimeout(300_000);

  const libRequests = [];
  await context.route('**/libraries/dotSCAD/**', (route) => {
    libRequests.push(route.request().url());
    route.continue();
  });

  await renderWithDotscad(page);

  // Not exactly one: the worker's WASM module is re-created whenever a
  // render supersedes an in-flight one (hard cancel is the only way to stop
  // a blocking callMain), and each fresh module re-mounts - measured 1 to 3
  // archive fetches for this flow depending on timing. The property that
  // holds regardless is the CLASS of request: everything is the manifest or
  // the archive, never the per-file storm.
  const archiveHits = libRequests.filter((u) => u.endsWith('archive.zip'));
  const perFileFetches = libRequests.filter(
    (u) => !u.endsWith('archive.zip') && !u.endsWith('manifest.json')
  );
  expect(
    archiveHits.length,
    'the archive was never requested'
  ).toBeGreaterThanOrEqual(1);
  expect(
    perFileFetches,
    `every dotSCAD request must be the manifest or the archive; per-file fetches seen:\n${perFileFetches.join('\n')}`
  ).toEqual([]);
});

test('without the archive, the spoken per-file fallback still mounts', async ({
  page,
  context,
}) => {
  test.skip(isCI, 'needs the downloaded library bundles (setup-libraries.js)');
  test.setTimeout(300_000);

  const libRequests = [];
  const workerWarnings = [];
  page.on('console', (msg) => {
    if (msg.type() === 'warning') workerWarnings.push(msg.text());
  });
  await context.route('**/libraries/dotSCAD/**', (route) => {
    const url = route.request().url();
    if (url.endsWith('archive.zip')) return route.abort();
    libRequests.push(url);
    route.continue();
  });

  await renderWithDotscad(page);

  expect(
    libRequests.length,
    'the fallback should fetch the library file by file'
  ).toBeGreaterThan(20);
  expect(
    workerWarnings.some((t) => t.includes('falling back to per-file')),
    `the fallback must be SPOKEN; warnings seen:\n${workerWarnings.join('\n')}`
  ).toBe(true);
});
