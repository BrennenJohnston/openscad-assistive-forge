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

  // Arrows reach EVERY tab, including the unavailable ones: their panel is
  // where the reason lives, so a keyboard user who cannot arrow onto them
  // cannot read it. (R-III skipped them; owner decision 2026-08-09 reversed
  // that once the reason became visible rather than description-only.)
  await page.locator('#prefs-tab-3dview').click();
  const walked = [];
  for (let i = 0; i < TAB_ORDER.length; i++) {
    walked.push(await page.evaluate(() => document.activeElement.id));
    await page.keyboard.press('ArrowRight');
  }
  expect(walked).toEqual(TAB_ORDER.map((_, i) =>
    ['3dview', 'editor', '3dprint', 'advanced', 'axes', 'buttons', 'keyboard'][i]
  ).map((s) => `prefs-tab-${s}`));

  // Wrapped back to the start.
  expect(await page.evaluate(() => document.activeElement.id)).toBe(
    'prefs-tab-3dview'
  );

  await page.keyboard.press('End');
  expect(await page.evaluate(() => document.activeElement.id)).toBe(
    'prefs-tab-keyboard'
  );
  await page.keyboard.press('Home');
  expect(await page.evaluate(() => document.activeElement.id)).toBe(
    'prefs-tab-3dview'
  );

  const after = await tabState(page);
  expect(after.filter((t) => t.panelHidden === false)).toHaveLength(1);
  expect(after.filter((t) => t.tabindex === '0')).toHaveLength(1);
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

  // The reason must be VISIBLE, not description-only. MEASURED in R-III:
  // selecting was refused, so the panel never showed and a sighted user got a
  // tab that did nothing. Being in the accessibility tree is not the same as
  // being on screen.
  // Reached with the arrow keys rather than .click(): Playwright treats
  // aria-disabled="true" as not-actionable and refuses to click it, though a
  // real browser dispatches the event. Arrowing is also the path that matters
  // here — it is how a keyboard user gets to the explanation at all.
  const STEPS = { '3dprint': 2, advanced: 3, axes: 4, buttons: 5 };
  for (const [id, steps] of Object.entries(STEPS)) {
    await page.locator('#prefs-tab-3dview').click();
    for (let i = 0; i < steps; i++) await page.keyboard.press('ArrowRight');

    await expect(page.locator(`#prefs-tab-${id}`)).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await expect(page.locator(`#prefs-reason-${id}`)).toBeVisible();
    // Still announced as unavailable — selectable is not the same as usable.
    await expect(page.locator(`#prefs-tab-${id}`)).toHaveAttribute(
      'aria-disabled',
      'true'
    );
  }
});

test('the 3D View tab is live and no longer says it is not built', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await openPreferences(page);

  const tab = page.locator('#prefs-tab-3dview');
  // A tab that works must not still carry a "not built yet" description.
  await expect(tab).not.toHaveAttribute('aria-disabled', 'true');
  expect(await tab.getAttribute('aria-describedby')).toBeNull();
  await expect(page.locator('#prefs-reason-3dview')).toHaveCount(0);

  await tab.click();
  await expect(page.locator('#prefsColorSchemeList')).toBeVisible();

  // The desktop's ten, in the desktop's order (OpenSCAD_2.png).
  const labels = await page
    .locator('#prefsColorSchemeList label')
    .allTextContents();
  expect(labels.map((l) => l.trim())).toEqual([
    'Cornfield',
    'Metallic',
    'Sunset',
    'Starnight',
    'BeforeDawn',
    'Nature',
    'DeepOcean',
    'Solarized',
    'Tomorrow',
    'Tomorrow Night',
  ]);

  // Warnings-in-3D-view has no engine here, so it is disabled and says why.
  const warn = page.locator('#prefsShowWarnings3D');
  await expect(warn).toBeDisabled();
  await expect(page.locator('#prefs-reason-warnings3d')).toBeVisible();

  // Mouse-centric zoom IS a real capability, so it ships live.
  await expect(page.locator('#prefsMouseCentricZoom')).toBeEnabled();
});

test('picking a scheme repaints the viewport, and it survives a reopen', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await openPreferences(page);

  // Classic is where the scheme applies; elsewhere the app theme drives the
  // viewport so that high contrast keeps working.
  await page.locator('#preferencesModalDone').click();
  await page.locator('#classicModeToggle').click();
  await expect(page.locator('body')).toHaveAttribute('data-ui-mode', 'classic');
  await page.waitForTimeout(1_000);

  const scheme = () =>
    page.evaluate(() => window.__forgeDebug.previewColorScheme());
  expect(await scheme()).toBe('classic'); // Cornfield paints with `classic`

  await page.locator('#editMenuBtn').click();
  await page
    .locator('#editMenuItems')
    .getByText('Preferences…', { exact: true })
    .click();
  await page.locator('#prefs-tab-3dview').click();
  await page.locator('#prefsScheme-starnight').check();

  // Proven through the SCENE, not through the control: asserting that the
  // radio moved would prove only that a radio moved.
  await expect.poll(scheme, { timeout: 5_000 }).toBe('starnight');

  // Reopening shows the choice, rather than resetting to the default.
  await page.locator('#preferencesModalDone').click();
  await page.locator('#editMenuBtn').click();
  await page
    .locator('#editMenuItems')
    .getByText('Preferences…', { exact: true })
    .click();
  await expect(page.locator('#prefsScheme-starnight')).toBeChecked();
});

test('the mouse-centric zoom checkbox and the viewport one stay in step', async ({
  page,
}) => {
  // One setting with two controls is this project's most repeated bug shape.
  test.setTimeout(240_000);
  await openPreferences(page);
  await page.locator('#prefs-tab-3dview').click();

  const inPrefs = page.locator('#prefsMouseCentricZoom');
  const before = await inPrefs.isChecked();
  await inPrefs.setChecked(!before);

  expect(
    await page.evaluate(
      () => document.getElementById('zoomToCursorToggle')?.checked
    )
  ).toBe(!before);
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

test('the Editor tab is live and reconfigures the running editor', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await openPreferences(page);

  const tab = page.locator('#prefs-tab-editor');
  await expect(tab).not.toHaveAttribute('aria-disabled', 'true');
  await expect(page.locator('#prefs-reason-editor')).toHaveCount(0);

  // Open the editor so there is something live to reconfigure.
  await page.locator('#preferencesModalDone').click();
  await page.locator('#expertModeToggle').click();
  const content = page.locator('#expertModeBody .cm-content').first();
  await expect(content).toBeVisible({ timeout: 15_000 });

  const measure = () =>
    content.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { fontSize: cs.fontSize, whiteSpace: cs.whiteSpace };
    });
  const before = await measure();

  await page.locator('#editMenuBtn').click();
  await page
    .locator('#editMenuItems')
    .getByText('Preferences…', { exact: true })
    .click();
  await page.locator('#prefs-tab-editor').click();

  await page.locator('#prefsEditorFontSize').fill('22');
  await page.locator('#prefsEditorFontSize').dispatchEvent('change');
  await page.locator('#prefsEditorLineWrap').uncheck();

  // Live reconfiguration: the document already open must change, not the
  // next one. Compartments are the facility that makes that possible.
  await expect.poll(async () => (await measure()).fontSize).toBe('22px');
  expect(before.whiteSpace).toMatch(/^break-spaces/);
  await expect.poll(async () => (await measure()).whiteSpace).toBe('pre');
});

test('an out-of-range editor value is clamped, and the field says so', async ({
  page,
}) => {
  // A field left reading 999 while the editor uses 32 is a control and its
  // effect come apart — the same shape as an announcement that lies.
  test.setTimeout(240_000);
  await openPreferences(page);
  await page.locator('#prefs-tab-editor').click();

  const field = page.locator('#prefsEditorFontSize');
  await field.fill('999');
  await field.dispatchEvent('change');
  await expect(field).toHaveValue('32');

  await field.fill('1');
  await field.dispatchEvent('change');
  await expect(field).toHaveValue('8');
});

test('the Editor tab names what it cannot do', async ({ page }) => {
  test.setTimeout(240_000);
  await openPreferences(page);
  await page.locator('#prefs-tab-editor').click();

  // Tab-key indenting is refused on purpose, not missing by accident: it
  // would trap keyboard and switch users inside the editor (WCAG 2.1.2).
  await expect(page.locator('#prefsEditorTabIndents')).toBeDisabled();
  await expect(page.locator('#prefs-reason-tabkey')).toBeVisible();
  await expect(page.locator('#prefs-reason-tabkey')).toContainText(
    /never trapped/i
  );

  for (const id of [
    'prefs-reason-syntax',
    'prefs-reason-whitespace',
    'prefs-reason-wrapmarkers',
  ]) {
    await expect(page.locator(`#${id}`)).toBeVisible();
  }
});

test('the input-device tabs describe the gamepad support that exists', async ({
  page,
}) => {
  // Both tabs used to say "This build has no input-device engine" while
  // gamepad-controller.js was running and bound to real handlers. A reason
  // that is false is worse than no reason: it tells a user to stop looking
  // for a feature they already have.
  test.setTimeout(240_000);
  await openPreferences(page);

  await page.locator('#prefs-tab-3dview').click();
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
  const axes = page.locator('#prefs-reason-axes');
  await expect(axes).toBeVisible();
  await expect(axes).not.toContainText(/no input-device engine/i);
  await expect(axes).toContainText(/stick/i);

  await page.keyboard.press('ArrowRight');
  const buttons = page.locator('#prefs-reason-buttons');
  await expect(buttons).toBeVisible();
  await expect(buttons).not.toContainText(/no input-device engine/i);
  await expect(buttons).toContainText(/D-pad/i);
});
