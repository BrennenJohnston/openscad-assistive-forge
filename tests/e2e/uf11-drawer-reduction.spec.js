/**
 * UF-11 "Room to breathe" — proof of the Preview Settings & Info reduction.
 *
 * The owner-approved Q-34 mapping keeps eleven first-session controls in the
 * drawer (both densities) and moves everything else to its logical home:
 * View menu (grid/measurements/status-bar toggles, edge detail), Preferences
 * 3D View (grid appearance, auto-bed, zoom-to-cursor), Preferences Advanced
 * (engine, app cache), the Camera panel (auto-rotate speed) and the File
 * menu (export quality). These cases pin the survivor set in BOTH densities
 * and prove a relocated control stays keyboard-operable in its new home.
 */
import { test, expect } from '@playwright/test';
import { skipWithoutWebGL } from './helpers/webgl.js';
import path from 'path';

const FIXTURE = path.join(process.cwd(), 'tests', 'fixtures', 'sample.scad');

/** The approved Simplified/Standard survivor set (Q-34, 2026-08-11). */
const SURVIVORS = [
  '#autoPreviewToggle',
  '#previewQualitySelect',
  '#gridPresetSelect',
  '#modelAppearanceEnabled',
  '#modelOpacityInput',
  '#brightnessInput',
  '#contrastInput',
  '#resetAppearanceBtn',
  '#modelColorEnabled',
  '#modelColorPicker',
  '#modelColorReset',
];

/** Everything that left the drawer for a menu, Preferences or the Camera panel. */
const RELOCATED = [
  '#measurementsToggle',
  '#gridToggle',
  '#gridColorPicker',
  '#resetGridColorBtn',
  '#gridOpacityInput',
  '#edgeBudgetSelect',
  '#autoBedToggle',
  '#zoomToCursorToggle',
  '#statusBarToggle',
  '#manifoldEngineToggle',
  '#rotationSpeedInput',
  '#exportQualitySelect',
  '#clearCacheBtn',
  // P1: the live regions live outside every collapsible container now.
  '#statusArea',
  '#srAnnouncer',
  '#srAnnouncerAssertive',
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
  });
});

async function loadFixture(page) {
  await page.goto('/');
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: 120_000,
  });
  await page.setInputFiles('#fileInput', FIXTURE);
  await page.waitForSelector('.param-control', {
    state: 'attached',
    timeout: 30_000,
  });
  const notNow = page.locator('#saveProjectNotNow');
  if (await notNow.isVisible().catch(() => false)) {
    await notNow.click();
    await page.waitForTimeout(200);
  }
}

async function expandDrawer(page) {
  const toggle = page.locator('#previewDrawerToggle');
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
    await toggle.click();
  }
  await expect(page.locator('#previewInfoContent')).toBeVisible();
}

async function assertSurvivorSet(page) {
  for (const sel of SURVIVORS) {
    await expect(
      page.locator(`#previewInfoContent ${sel}`),
      `${sel} must stay in the drawer`
    ).toBeVisible();
  }
  for (const sel of RELOCATED) {
    await expect(
      page.locator(`#previewInfoContent ${sel}`),
      `${sel} must have left the drawer`
    ).toHaveCount(0);
  }
}

test('Simplified keeps exactly the approved survivor set', async ({
  page,
}) => {
  await loadFixture(page);
  // Boot lands in Simplified.
  await expect(page.locator('body')).toHaveAttribute(
    'data-ui-mode',
    'simplified'
  );
  await expandDrawer(page);
  await assertSurvivorSet(page);
});

test('Standard keeps the same survivor set; the rest lives in menus', async ({
  page,
}) => {
  await loadFixture(page);
  await page.locator('#uiModeToggle').click();
  await expect(page.locator('#viewMenuBtn')).toBeVisible();
  await expandDrawer(page);
  await assertSurvivorSet(page);

  // Spot-check the homes exist where the mapping says they are.
  await page.locator('#viewMenuBtn').click();
  for (const label of [
    'Show Grid',
    'Show Measurements',
    'Show Status Bar',
    'Edge Detail Limit',
  ]) {
    await expect(
      page
        .locator('#viewMenuItems button')
        .filter({ has: page.getByText(label, { exact: true }) })
        .first()
    ).toBeVisible();
  }
  await page.keyboard.press('Escape');
});

test('a relocated toggle stays keyboard-operable in its menu home', async ({
  page,
}) => {
  await loadFixture(page);
  await page.locator('#uiModeToggle').click();
  await expect(page.locator('#viewMenuBtn')).toBeVisible();
  // The grid toggle this case drives only enables once a model is on screen,
  // and no canvas is ever created where the browser cannot draw.
  await skipWithoutWebGL(
    page,
    'no WebGL context: no model canvas, so the grid toggle never enables'
  );
  // A model must exist before the grid toggle enables.
  await expect(page.locator('#previewContainer canvas')).toBeVisible({
    timeout: 90_000,
  });

  // Keyboard only. The menubar is a roving tab stop that lands on File —
  // focusing another menu button gets redirected there — so the real path
  // is: land on File, arrow across to View, Enter opens it.
  await page.locator('#fileMenuBtn').focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#viewMenuBtn')).toBeFocused();
  await page.keyboard.press('Enter');
  const gridItem = page.getByRole('menuitemcheckbox', { name: 'Show Grid' });
  await expect(gridItem).toBeVisible();
  for (let i = 0; i < 12; i++) {
    const onIt = await gridItem.evaluate(
      (el) => el === document.activeElement
    );
    if (onIt) break;
    await page.keyboard.press('ArrowDown');
  }
  // The announcement is TRANSIENT: the polite live region debounces, sets,
  // and then auto-clears itself (announcer.js clearDelayMs), so a poll of
  // its current text on a slow shard can begin after the wipe and only
  // ever read "" — measured on CI with the toggle itself working. Watch
  // with an observer armed BEFORE the toggle: what a screen reader hears,
  // accumulated.
  await page.evaluate(() => {
    window.__uf11Heard = [];
    const node = document.getElementById('srAnnouncer');
    new MutationObserver(() => {
      const t = node.textContent.trim();
      if (t) window.__uf11Heard.push(t);
    }).observe(node, { childList: true, characterData: true, subtree: true });
  });
  await page.keyboard.press('Enter');

  // The grid preference flipped from its default (on) and the change was
  // announced — state truth plus what a screen reader hears. Since UF-14
  // the toggle writes the Forge namespace's own copy (U-25).
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem('openscad-forge-grid--forge'))
    )
    .toBe('false');
  await expect
    .poll(() =>
      page.evaluate(() => (window.__uf11Heard ?? []).join(' | '))
    )
    .toContain('Grid hidden');
});
