import { test, expect } from '@playwright/test';

// An official OpenSCAD engine, downloaded and kept: the download counts up
// and keeps the engine's three files, the chosen engine is the one that
// starts after a reload and draws the preview, and Remove gives the Forge
// engine back. The engines are served from public/wasm/engines/, which
// npm run setup-wasm writes.

const WASM_READY_TIMEOUT = 180_000;
const ID = 'official-2026-10-18';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
  });
});

/** Open the box and wait for its preview; return the engine's build line. */
async function openBox(page) {
  const builds = [];
  const listen = (message) => {
    const m = /WASM build: (.*)$/.exec(message.text());
    if (m) builds.push(m[1]);
  };
  page.on('console', listen);
  await page.goto('/?example=simple-box', { timeout: 60_000 });
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: WASM_READY_TIMEOUT,
  });
  const notNow = page.locator('#saveProjectNotNow');
  if (
    await notNow.waitFor({ state: 'visible', timeout: 3_000 }).then(
      () => true,
      () => false
    )
  ) {
    await notNow.click();
  }
  await expect(page.locator('.preview-state-indicator')).toHaveClass(
    /state-current/,
    { timeout: 90_000 }
  );
  page.off('console', listen);
  return builds;
}

test.describe('choosing an official engine', () => {
  test('download it, start with it, draw with it, and remove it', async ({
    page,
  }) => {
    test.setTimeout(WASM_READY_TIMEOUT * 3);
    expect((await openBox(page)).join(' ')).toMatch(/\+forge\.3/);

    const kept = await page.evaluate(async (id) => {
      const m = await import('/src/js/engine-choice.js');
      const manifest = await m.loadEnginesManifest();
      const progress = [];
      await m.download(manifest, id, {
        onProgress: (p) => progress.push(p),
        requestPersistence: async () => ({ granted: false }),
      });
      const cache = await caches.open(m.ENGINE_CACHE);
      return {
        progress,
        downloaded: await m.isDownloaded(manifest, id),
        files: (await cache.keys()).map((r) => new URL(r.url).pathname).sort(),
      };
    }, ID);
    expect(kept.downloaded).toBe(true);
    expect(kept.files).toEqual([
      `/wasm/engines/${ID}/INTEGRITY.json`,
      `/wasm/engines/${ID}/openscad.js`,
      `/wasm/engines/${ID}/openscad.wasm`,
    ]);
    expect(kept.progress.length).toBeGreaterThan(3);
    expect(kept.progress[kept.progress.length - 1]).toBe(100);

    await page.evaluate(
      (id) => localStorage.setItem('openscad-forge-engine', id),
      ID
    );
    expect((await openBox(page)).join(' ')).toMatch(
      /OpenSCAD snapshot 2026\.10\.18/
    );

    const afterRemove = await page.evaluate(async (id) => {
      const m = await import('/src/js/engine-choice.js');
      const manifest = await m.loadEnginesManifest();
      await m.remove(manifest, id);
      return {
        downloaded: await m.isDownloaded(manifest, id),
        chosen: m.getChosenEngineId(),
      };
    }, ID);
    expect(afterRemove).toEqual({ downloaded: false, chosen: 'forge' });
    expect((await openBox(page)).join(' ')).toMatch(/\+forge\.3/);
  });

  test('a chosen engine that is no longer kept starts the Forge engine', async ({
    page,
  }) => {
    test.setTimeout(WASM_READY_TIMEOUT * 2);
    await page.addInitScript(
      (id) => localStorage.setItem('openscad-forge-engine', id),
      ID
    );
    expect((await openBox(page)).join(' ')).toMatch(/\+forge\.3/);
    expect(
      await page.evaluate(() => localStorage.getItem('openscad-forge-engine'))
    ).toBe('forge');
  });
});
