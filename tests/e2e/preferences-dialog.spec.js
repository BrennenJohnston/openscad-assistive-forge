import { test, expect } from '@playwright/test';
import path from 'path';

const SAMPLE = path.join(process.cwd(), 'tests', 'fixtures', 'sample.scad');

/**
 * Preferences dialog — P11a shell.
 *
 * Desktop OpenSCAD's Preferences is a six-tab dialog; Edit ▸ Preferences here
 * used to open the keyboard-shortcuts editor under an honest but different
 * name. This covers the shell: the dialog, the APG tab bar, focus handling,
 * and every tab being present and honest about its own state.
 *
 * What it proves: structure, roles, keyboard behaviour and focus return in
 * Chromium against the dev server. What it does NOT prove: anything about
 * NVDA, or about the production build (the prod lane covers CSP separately).
 */

const WASM_READY_TIMEOUT = 180_000;

/** Upstream's six, then Keyboard — a Forge addition, documented as such. */
const TAB_ORDER = [
  '3D View',
  'Editor',
  '3D Print',
  'Advanced',
  'Axes',
  'Buttons',
  'Keyboard',
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
  });
});

async function gotoWithFile(page) {
  await page.goto('/');
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: WASM_READY_TIMEOUT,
  });
  // With no file the app sits on the welcome screen and #mainInterface — with
  // the menu bar in it — is hidden. The dialog is not about rendering, so the
  // cheap fixture is the right one here.
  await page.locator('#fileInput').setInputFiles(SAMPLE);
  await expect(page.locator('#mainInterface')).toBeVisible({ timeout: 30_000 });
  const notNow = page.locator('#saveProjectNotNow');
  try {
    await notNow.waitFor({ state: 'visible', timeout: 3_000 });
    await notNow.click();
  } catch {
    // No save-project modal to dismiss.
  }
  // The menu bar is hidden in the Simplified interface.
  await page.locator('#uiModeToggle').click();
  await expect(page.locator('#editMenuBtn')).toBeVisible();
}

async function openPreferences(page) {
  await gotoWithFile(page);

  await page.locator('#editMenuBtn').click();
  await page
    .locator('#editMenuItems')
    .getByText('Preferences…', { exact: true })
    .click();
  await expect(page.locator('#preferencesModal')).not.toHaveClass(/hidden/);
}

const tabState = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('#preferencesTablist [role="tab"]')].map(
      (t) => ({
        label: t.textContent.trim(),
        selected: t.getAttribute('aria-selected'),
        tabindex: t.getAttribute('tabindex'),
        disabled: t.getAttribute('aria-disabled') === 'true',
        describedby: t.getAttribute('aria-describedby'),
        panelHidden: document.getElementById(t.getAttribute('aria-controls'))
          ?.hidden,
      })
    )
  );

test('Edit ▸ Preferences opens a real dialog with upstream tab order', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await openPreferences(page);

  const modal = page.locator('#preferencesModal');
  await expect(modal).toHaveAttribute('role', 'dialog');
  await expect(modal).toHaveAttribute('aria-modal', 'true');
  await expect(modal).toHaveAttribute(
    'aria-labelledby',
    'preferencesModalTitle'
  );

  expect((await tabState(page)).map((t) => t.label)).toEqual(TAB_ORDER);
});

test('the tab bar follows the APG pattern', async ({ page }) => {
  test.setTimeout(240_000);
  await openPreferences(page);

  // Roving tabindex: exactly one tab is a page tab stop, never seven.
  const state = await tabState(page);
  expect(state.filter((t) => t.tabindex === '0')).toHaveLength(1);
  expect(state.filter((t) => t.selected === 'true')).toHaveLength(1);

  // Exactly one panel is showing.
  expect(state.filter((t) => t.panelHidden === false)).toHaveLength(1);

  // Arrows must not select a disabled tab: in the shell every tab but
  // Keyboard is disabled, so selection has nowhere to go and must stay put.
  await page.locator('#prefs-tab-keyboard').focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Home');
  const after = await tabState(page);
  expect(after.find((t) => t.selected === 'true').label).toBe('Keyboard');
  expect(after.filter((t) => t.panelHidden === false)).toHaveLength(1);
});

test('every unavailable tab is disabled and names its reason', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await openPreferences(page);

  for (const t of await tabState(page)) {
    if (!t.disabled) continue;
    // "Silently absent" is never acceptable — a disabled tab must say why.
    expect(t.describedby, `${t.label} must name a reason`).toBeTruthy();
    const reason = await page.locator(`#${t.describedby}`).textContent();
    expect(
      reason.trim().length,
      `${t.label}'s reason must not be empty`
    ).toBeGreaterThan(20);
  }

  // A disabled tab still takes focus, so a screen reader can reach and read
  // that reason. Removing it from the tab order is not the same as hiding it.
  await page.locator('#prefs-tab-3dview').focus();
  expect(await page.evaluate(() => document.activeElement.id)).toBe(
    'prefs-tab-3dview'
  );
});

test('Escape closes and returns focus to the menu that opened it', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await openPreferences(page);

  // The Escape handler sits on the modal, so the key only reaches it once
  // focus is inside. The focus trap activates asynchronously, so waiting for
  // that is part of the test, not a workaround.
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          !!document
            .getElementById('preferencesModal')
            ?.contains(document.activeElement)
      )
    )
    .toBe(true);

  await page.keyboard.press('Escape');
  await expect(page.locator('#preferencesModal')).toHaveClass(/hidden/);

  // openModal restores focus to whatever was focused when it opened, and a
  // menu item is destroyed when its menu closes — restoring to a detached
  // node drops the user on <body>. MEASURED before the fix.
  expect(await page.evaluate(() => document.activeElement.id)).toBe(
    'editMenuBtn'
  );
});

test('the Keyboard tab reaches the shortcuts editor', async ({ page }) => {
  test.setTimeout(240_000);
  await openPreferences(page);

  await page.locator('#preferencesOpenShortcuts').click();
  await expect(page.locator('#shortcutsModal')).not.toHaveClass(/hidden/);
  // One dialog on screen at a time.
  await expect(page.locator('#preferencesModal')).toHaveClass(/hidden/);
  await expect(page.locator('#shortcutsModalBody')).not.toBeEmpty();
});

test('Help ▸ Keyboard Shortcuts still opens the editor directly', async ({
  page,
}) => {
  // The shortcuts modal had FOUR copy-pasted open blocks; three survive the
  // Preferences change and now share one helper. This is the regression that
  // would catch a fix applied to some of them.
  test.setTimeout(240_000);
  await gotoWithFile(page);

  await page.locator('#helpMenuBtn').click();
  await page
    .locator('#helpMenuItems')
    .getByText('Keyboard Shortcuts…', { exact: true })
    .click();
  await expect(page.locator('#shortcutsModal')).not.toHaveClass(/hidden/);
  await expect(page.locator('#shortcutsModalBody')).not.toBeEmpty();
});
