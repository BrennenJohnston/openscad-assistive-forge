import { test, expect } from '@playwright/test';
import path from 'path';
import {
  announcementMark,
  announcementsSince,
  recordAnnouncements,
} from './helpers/invariants.js';

/**
 * Auto-preview, proved observably.
 *
 * With the 28-line sample fixture a render is so cheap and so quiet that a
 * suite cannot tell "auto-preview is off" from "auto-preview ran and
 * finished before we looked". A real 1,017-line file renders 2,562 facets
 * and reports every stage, so the difference is observable, which is the
 * only reason this spec can exist at all.
 *
 * What it proves: turning auto-preview off stops a parameter change from
 * starting a render, and turning it back on starts one again. What it does
 * not prove: anything about NVDA, or about the production build.
 */

const FIXTURE = path.join(
  process.cwd(),
  'tests',
  'fixtures',
  'universal-cuff',
  'universal_cuff_utensil_holder.scad'
);

const WASM_READY_TIMEOUT = 180_000;
const PREVIEW_TIMEOUT = 180_000;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
  });
});

async function loadRealFixture(page) {
  await page.goto('/');
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: WASM_READY_TIMEOUT,
  });
  await page.locator('#fileInput').setInputFiles(FIXTURE);
  await expect(page.locator('#mainInterface')).toBeVisible({ timeout: 30_000 });

  const notNow = page.locator('#saveProjectNotNow');
  try {
    await notNow.waitFor({ state: 'visible', timeout: 3_000 });
    await notNow.click();
  } catch {
    // No save-project modal to dismiss.
  }

  const toggle = page.locator('#uiModeToggle');
  if ((await toggle.getAttribute('aria-checked')) !== 'true') {
    await toggle.click();
  }
}

/** The auto-preview that fires on load is itself the first piece of evidence. */
async function waitForPreviewReady(page) {
  await expect(page.locator('.preview-state-indicator')).toHaveClass(
    /state-current/,
    { timeout: PREVIEW_TIMEOUT }
  );
}

/** Count render starts off the status text the user actually watches. */
async function watchRenders(page) {
  await page.evaluate(() => {
    window.__renderStarts = 0;
    const el = document.getElementById('previewStatusText');
    new MutationObserver(() => {
      if (/rendering|generating/i.test(el.textContent || ''))
        window.__renderStarts++;
    }).observe(el, { childList: true, subtree: true, characterData: true });
  });
}

/**
 * Nudge the first numeric parameter. Param groups ship CLOSED, so the group
 * has to be opened before its inputs can be driven.
 */
async function changeAParameter(page) {
  const changed = await page.evaluate(() => {
    for (const group of document.querySelectorAll('details.param-group')) {
      group.open = true;
    }
    const input = document.querySelector(
      '.param-control input[type="number"], .param-control input[type="range"]'
    );
    if (!input) return null;
    const before = input.value;
    const step = Number(input.step) || 1;
    const next = Number(before) + step;
    if (input.max !== '' && next > Number(input.max)) return null;
    input.value = String(next);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return { id: input.id, before, after: input.value };
  });
  expect(changed, 'a numeric parameter must be drivable').not.toBeNull();
  return changed;
}

test('auto-preview off stops a parameter change from rendering; on starts one', async ({
  page,
}) => {
  test.setTimeout(420_000);
  await loadRealFixture(page);
  await waitForPreviewReady(page);

  // #autoPreviewToggle OWNS the state but is not on screen — it sits inside
  // the Preview Settings panel, and the Classic Customizer checkbox and the
  // Design menu item both drive it. Drive the menu item: it is the surface a
  // user reaches, and its documented effect is what is asserted.
  const toggle = page.locator('#autoPreviewToggle');
  await expect(toggle).toBeChecked();

  const menuItem = () =>
    page
      .locator('#designMenuItems button')
      .filter({ hasText: /^Automatic Reload and Preview$/ })
      .first();

  const flip = async () => {
    await page.locator('#designMenuBtn').click();
    await expect(menuItem()).toBeVisible();
    await menuItem().click();
    await page.waitForTimeout(300);
  };

  // ── OFF ────────────────────────────────────────────────────────────────
  await flip();
  await expect(toggle).not.toBeChecked();
  await page.waitForTimeout(1_000);
  await watchRenders(page);

  const off = await changeAParameter(page);
  expect(off.after).not.toBe(off.before);
  // Generous: the auto-preview debounce plus a real render of this file is
  // well inside this, so a render that was going to happen has happened.
  await page.waitForTimeout(8_000);
  expect(
    await page.evaluate(() => window.__renderStarts),
    'auto-preview is OFF, so a parameter change must not start a render'
  ).toBe(0);

  // ── ON ─────────────────────────────────────────────────────────────────
  await flip();
  await expect(toggle).toBeChecked();
  await page.waitForTimeout(500);
  await watchRenders(page);

  const on = await changeAParameter(page);
  expect(on.after).not.toBe(on.before);
  await expect
    .poll(() => page.evaluate(() => window.__renderStarts), {
      timeout: 60_000,
    })
    .toBeGreaterThan(0);
});

/** A Design menu item, by its visible label. */
async function designMenu(page, label) {
  await page.locator('#designMenuBtn').click();
  const item = page
    .locator('#designMenuItems button')
    .filter({ has: page.getByText(label, { exact: true }) })
    .first();
  await expect(item).toBeVisible();
  await item.click();
}

async function turnAutoPreviewOff(page) {
  await designMenu(page, 'Automatic Reload and Preview');
  await expect(page.locator('#autoPreviewToggle')).not.toBeChecked();
}

async function expectOutdated(page) {
  await expect(page.locator('.preview-state-indicator')).toHaveClass(
    /state-stale/
  );
}

test.describe('Preview with Automatic preview off', () => {
  test('Design > Preview and F5 bring an outdated preview up to date', async ({
    page,
  }) => {
    test.setTimeout(420_000);
    await loadRealFixture(page);
    await waitForPreviewReady(page);
    await turnAutoPreviewOff(page);

    await changeAParameter(page);
    await expectOutdated(page);
    await designMenu(page, 'Preview');
    await waitForPreviewReady(page);

    await changeAParameter(page);
    await expectOutdated(page);
    await page.keyboard.press('F5');
    await waitForPreviewReady(page);
  });

  test('turning Automatic preview back on renders the change made while it was off', async ({
    page,
  }) => {
    test.setTimeout(420_000);
    await loadRealFixture(page);
    await waitForPreviewReady(page);
    await turnAutoPreviewOff(page);

    await changeAParameter(page);
    await expectOutdated(page);
    await designMenu(page, 'Automatic Reload and Preview');
    await expect(page.locator('#autoPreviewToggle')).toBeChecked();
    await waitForPreviewReady(page);
  });

  test('a Preview with nothing changed says so, once', async ({ page }) => {
    test.setTimeout(420_000);
    await recordAnnouncements(page);
    await loadRealFixture(page);
    await waitForPreviewReady(page);

    const mark = await announcementMark(page);
    await designMenu(page, 'Preview');
    await expect(page.locator('#previewStatusText')).toHaveText(
      'Preview is current'
    );
    await page.waitForTimeout(1_500);
    // Counted on the announcer, the voice meant to speak status. The status
    // bars are live regions as well and repeat every status message today,
    // a separate problem with its own fix.
    const said = (await announcementsSince(page, mark)).filter(
      (a) => a.region === '#srAnnouncer' && a.text === 'Preview is current'
    );
    expect(said, JSON.stringify(said)).toHaveLength(1);
  });
});
