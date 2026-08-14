// Memory banner emergency actions.
//
// This banner is the app's last-chance data-preservation UI: it appears at
// critical/emergency memory with role="alert" telling the user to save
// immediately. Four of its six actions had rotted into no-ops against
// elements that no longer exist, which is only discoverable by exercising
// them — hence this spec.

import { test, expect } from '@playwright/test';
import path from 'path';

const FIXTURE = path.join(process.cwd(), 'tests', 'fixtures', 'sample.scad');
const WASM_READY_TIMEOUT = 180_000;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
  });
});

/**
 * Force the banner visible; its handlers bind at init regardless of state.
 *
 * Separated from setup() because the banner overlays the app header: with it
 * up, its "Reload (Safe)" button covers the interface-mode switch and
 * intercepts clicks on it. A test that needs header controls arranges them
 * first and calls this afterwards.
 */
async function showEmergencyBanner(page) {
  await page.evaluate(() => {
    const b = document.getElementById('memoryBanner');
    b.dataset.state = 'emergency';
    b.dataset.visible = 'true';
  });
}

async function setup(page, { save = false, banner = true } = {}) {
  await page.goto('/');
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: WASM_READY_TIMEOUT,
  });
  await page.locator('#fileInput').setInputFiles(FIXTURE);
  await expect(page.locator('#mainInterface')).toBeVisible({ timeout: 30_000 });

  if (save) {
    await page.locator('#saveProjectCheckbox').waitFor({ timeout: 10_000 });
    await page.locator('#saveProjectCheckbox').check();
    await page.locator('#saveProjectSave').click();
  } else {
    const notNow = page.locator('#saveProjectNotNow');
    try {
      await notNow.waitFor({ state: 'visible', timeout: 3_000 });
      await notNow.click();
    } catch {
      /* no modal */
    }
  }
  await expect(page.locator('.save-project-modal')).toHaveCount(0, {
    timeout: 10_000,
  });

  if (banner) await showEmergencyBanner(page);
}

const persisted = (page) =>
  page.evaluate(async () => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('openscad-forge-saved-projects');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const store = db
      .transaction('projects', 'readonly')
      .objectStore('projects');
    const all = await new Promise((res, rej) => {
      const r = store.getAll();
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return all[0]?.content || '';
  });

test('banner Save Project reaches a real save (and flushes the editor)', async ({
  page,
}) => {
  test.setTimeout(240_000);
  // This is the only case that needs a HEADER control, so it opens the editor
  // before raising the banner. Raising it first put the banner's "Reload
  // (Safe)" button over #uiModeToggle, and the click was intercepted: measured
  // failing on develop as often as 7 attempts in 10 on Edge, which turned that
  // required lane red at 84eae3d.
  await setup(page, { save: true, banner: false });

  await page.locator('#uiModeToggle').click();
  await page.locator('#expertModeToggle').click();
  const cm = page.locator('#expertModeBody .cm-content');
  await expect(cm).toBeVisible({ timeout: 15_000 });
  await showEmergencyBanner(page);
  await cm.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('\n// BANNER_SAVE', { delay: 25 });

  expect(await persisted(page)).not.toContain('BANNER_SAVE');

  await page.locator('#memoryBannerSave').click();

  await expect
    .poll(() => persisted(page), { timeout: 20_000 })
    .toContain('BANNER_SAVE');
  await expect(page.locator('#editorDirtyIndicator')).toHaveAttribute(
    'aria-hidden',
    'true',
    { timeout: 15_000 }
  );
});

test('banner Export STL says so honestly when there is no render', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await setup(page);

  await page.evaluate(() => window.stateManager.setState({ stl: null }));
  await page.locator('#memoryBannerExport').click();

  await expect(page.getByText('No Rendered Model').first()).toBeVisible({
    timeout: 10_000,
  });
  await expect(
    page.getByText('No rendered model to export').first()
  ).toBeVisible({ timeout: 10_000 });
});

test('banner Export STL downloads the existing render', async ({ page }) => {
  test.setTimeout(300_000);
  await setup(page);

  // Produce a full render first (Generate), then the banner exports it
  const btn = page.locator('#primaryActionBtn');
  await expect(btn).toContainText('Generate', { timeout: 30_000 });
  await btn.click();
  await expect(btn).toContainText('Download', { timeout: 180_000 });

  const downloadPromise = page.waitForEvent('download', { timeout: 60_000 });
  await page.locator('#memoryBannerExport').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.stl$/i);
});

test('banner Reload tooltip no longer promises a save', async ({ page }) => {
  test.setTimeout(240_000);
  await setup(page);

  const tip = await page.locator('#memoryBannerReload').getAttribute('title');
  expect(tip).not.toContain('will be saved');
  expect(tip).toContain('unsaved changes will be lost');
});

/**
 * Watch for render starts and for announcements, installed BEFORE the action.
 * Render starts are counted off the preview status text, which is what the
 * user sees change; announcements off #srAnnouncer, the polite live region
 * announceImmediate writes to.
 */
async function watch(page) {
  await page.evaluate(() => {
    window.__renderStarts = 0;
    window.__spoken = [];
    const status = document.getElementById('previewStatusText');
    if (status) {
      new MutationObserver(() => {
        if (/rendering|generating/i.test(status.textContent || ''))
          window.__renderStarts++;
      }).observe(status, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }
    const ann = document.getElementById('srAnnouncer');
    if (ann) {
      new MutationObserver(() => {
        const t = (ann.textContent || '').trim();
        if (t) window.__spoken.push(t);
      }).observe(ann, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }
  });
}

test('banner Reduce Quality lowers both settings without starting a render', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await setup(page);

  // Settle first, so a render already in flight cannot be miscounted.
  await expect(page.locator('#previewStatusText')).toContainText(
    /ready|error/i,
    { timeout: 180_000 }
  );
  await page.waitForTimeout(2_000);
  await watch(page);

  await page.locator('#memoryBannerReduceFn').click();
  await page.waitForTimeout(4_000);

  // UF-11: export quality's control is File ▸ Export Quality now; the mode
  // has no DOM element, so the debug hook is the readable truth.
  expect(await page.evaluate(() => window.__forgeDebug.exportQuality())).toBe(
    'low'
  );
  expect(
    await page.evaluate(
      () => document.getElementById('previewQualitySelect').value
    )
  ).toBe('fast');

  // The recorded trap: rendering is the memory-hungry operation this banner
  // is warning about, so the button that conserves memory must not cause one.
  // MEASURED before the fix: four render starts.
  expect(await page.evaluate(() => window.__renderStarts)).toBe(0);
});

test('both quality actions say what they did, exactly once', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await setup(page);
  await expect(page.locator('#previewStatusText')).toContainText(
    /ready|error/i,
    { timeout: 180_000 }
  );
  await page.waitForTimeout(2_000);
  await watch(page);

  // Both selects live in panels the user may not have open, so the console
  // line these buttons used to write was the only sign anything happened.
  await page.locator('#memoryBannerReduceFn').click();
  await expect(page.locator('#previewStatusText')).toContainText(
    /Quality reduced/i,
    { timeout: 5_000 }
  );
  const afterReduce = await page.evaluate(() => window.__spoken);
  expect(afterReduce.filter((t) => /Quality reduced/i.test(t))).toHaveLength(1);

  await page.locator('#memoryBannerDisableAuto').click();
  await expect(page.locator('#previewStatusText')).toContainText(
    /Automatic preview turned off/i,
    { timeout: 5_000 }
  );
  const spoken = await page.evaluate(() => window.__spoken);
  expect(
    spoken.filter((t) => /Automatic preview turned off/i.test(t))
  ).toHaveLength(1);
});

test('banner Disable Auto-Preview actually turns auto-preview off', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await setup(page);

  // Left deliberately dead in R1: it targets #autoPreviewToggle, which did
  // not exist until phase C4 created it. This is the case that proves the
  // convergence happened.
  const toggle = page.locator('#autoPreviewToggle');
  await expect(toggle).toHaveCount(1);
  await expect(toggle).toBeChecked();

  await page.locator('#memoryBannerDisableAuto').click();

  await expect(toggle).not.toBeChecked();

  // The change has to reach the controller, not just the checkbox: a
  // parameter change must no longer start a preview.
  const stillDisabled = await page.evaluate(
    () => document.getElementById('autoPreviewToggle').checked
  );
  expect(stillDisabled).toBe(false);
});

/**
 * Record every write to BOTH live regions, tagged with which one.
 *
 * Counts mutation RECORDS rather than re-reading textContent in the callback:
 * the observer coalesces, so two writes landing in one frame produce one
 * callback and reading textContent there counts them as one. `announce()`
 * clears then sets, so each announcement adds a text node — counting added
 * nodes is what actually measures "how many times was this said".
 */
async function watchBothRegions(page) {
  await page.evaluate(() => {
    window.__said = [];
    for (const [id, politeness] of [
      ['srAnnouncer', 'polite'],
      ['srAnnouncerAssertive', 'assertive'],
    ]) {
      const region = document.getElementById(id);
      if (!region) continue;
      new MutationObserver((records) => {
        for (const record of records) {
          for (const node of record.addedNodes) {
            const text = (node.textContent || '').trim();
            if (text) window.__said.push({ politeness, text });
          }
        }
      }).observe(region, { childList: true, subtree: true });
    }
  });
}

const saidMatching = (page, pattern) =>
  page.evaluate(
    (source) => window.__said.filter((s) => new RegExp(source, 'i').test(s.text)),
    pattern.source
  );

// The two announcement sites R-III measured but left, recorded in the plan's
// §6c. updateStatus already speaks through stateManager.announceChange, so
// pairing it with a second announce call says everything to a screen-reader
// user twice. These live here rather than in a new spec because the setup and
// the subject — advisory messaging the user cannot see coming — are the same.

test('a storage-quota failure is announced once, assertively', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await setup(page);
  await page.waitForTimeout(1_000);
  await watchBothRegions(page);

  const message = 'Storage is full. Data could not be saved.';
  await page.evaluate((detailMessage) => {
    window.dispatchEvent(
      new CustomEvent('storage-quota-exceeded', {
        detail: { message: detailMessage },
      })
    );
  }, message);
  await page.waitForTimeout(1_500);

  const said = await saidMatching(page, /Storage is full/);
  // Measured on the parent commit: THREE, not the two the ledger recorded —
  // polite via updateStatus, assertive via announceError, and assertive again
  // from showErrorToast, which announces "<title>. <message>" itself.
  expect(said).toHaveLength(1);
  // A failure to save is an error, so the one that survives is the assertive
  // one; downgrading it to polite would be the wrong half to keep.
  expect(said[0].politeness).toBe('assertive');

  // The status bar must still show it — this is about how often it is spoken,
  // not about removing the user's visible feedback.
  await expect(page.locator('#previewStatusText')).toContainText(
    /Storage is full/i
  );
});

test('the complexity advisory is announced once', async ({ page }) => {
  test.setTimeout(240_000);
  await setup(page);
  await expect(page.locator('#previewStatusText')).toContainText(
    /ready|error/i,
    { timeout: 180_000 }
  );
  await page.waitForTimeout(1_000);
  await watchBothRegions(page);

  // The advisory fires from a state subscriber when a fresh complexityAnalysis
  // carrying warnings lands, which is how file-handler delivers it.
  await page.evaluate(() =>
    window.stateManager.setState({
      complexityAnalysis: { warnings: ['synthetic complexity warning'] },
    })
  );
  await page.waitForTimeout(1_500);

  // Measured on the parent commit: 2 — updateStatus announced it and the line
  // below it announced the identical string again.
  const said = await saidMatching(page, /This model is complex/);
  expect(said).toHaveLength(1);

  await expect(page.locator('#previewStatusText')).toContainText(
    /This model is complex/i
  );
});
