import { test, expect } from '@playwright/test';
import path from 'path';

const SAMPLE = path.join(process.cwd(), 'tests', 'fixtures', 'sample.scad');

/**
 * Axis mark colors follow the viewport scheme, not the app theme (U-13).
 *
 * The defect: with the app theme resolved dark, entering Classic rebuilt
 * the axis lines and tick labels with the dark theme's light text color —
 * near-invisible on Cornfield's cream background, and no toggle could heal
 * it because every rebuild re-read the same html-scoped token. The fix
 * resolves scheme-first from the transcribed upstream axes colors, and
 * reads the app-theme token off body otherwise.
 *
 * Proven through `__forgeDebug.axisTickOverlay().colorHex` — the color the
 * overlay actually baked — not through any control state, and not through
 * screenshots (a material color is not reliably readable from pixels).
 *
 * @license GPL-3.0-or-later
 */

const WASM_READY_TIMEOUT = 180_000;

// The transcribed upstream values (pinned verbatim by the unit contrast
// suite): Cornfield axes are black, Starnight's are light gray.
const CORNFIELD_AXES = 0x000000;
const STARNIGHT_AXES = 0xe5e5e5;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
    // The dark leg of the owner's recipe, seeded instead of clicked so the
    // resolved theme is dark regardless of the machine running the test.
    localStorage.setItem('openscad-forge-theme', 'dark');
  });
});

test('dark Forge theme cannot bleed into Classic axis marks, and the scheme choice travels with them', async ({
  page,
}) => {
  test.setTimeout(240_000);

  await page.goto('/');
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: WASM_READY_TIMEOUT,
  });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.locator('#fileInput').setInputFiles(SAMPLE);
  await expect(page.locator('#mainInterface')).toBeVisible({
    timeout: 30_000,
  });
  const notNow = page.locator('#saveProjectNotNow');
  try {
    await notNow.waitFor({ state: 'visible', timeout: 3_000 });
    await notNow.click();
  } catch {
    // No save-project modal to dismiss.
  }

  // Standard first, so Classic enters Standard density with the menu bar
  // (the Preferences dialog is reached through Edit).
  await page.locator('#uiModeToggle').click();
  await expect(page.locator('#editMenuBtn')).toBeVisible();

  const scheme = () =>
    page.evaluate(() => window.__forgeDebug.previewColorScheme());
  const overlay = () =>
    page.evaluate(() => window.__forgeDebug.axisTickOverlay());

  // --- Enter Classic with the app theme dark -------------------------------
  await page.locator('#classicModeToggle').click();
  await expect(page.locator('body')).toHaveAttribute('data-ui-mode', 'classic');
  await expect.poll(scheme, { timeout: 10_000 }).toBe('classic');

  // Classic's first entry turns the desktop view defaults on, so the
  // overlay must be genuinely in the scene before its color means anything.
  await expect
    .poll(async () => (await overlay())?.inScene, { timeout: 10_000 })
    .toBe(true);

  // The U-13 assertion: Cornfield axes are the desktop's black, not the
  // dark theme's light foreground (the defect baked 0xedeef0 here).
  await expect
    .poll(async () => (await overlay())?.colorHex, { timeout: 10_000 })
    .toBe(CORNFIELD_AXES);

  // --- Pick a dark scheme: the marks follow the scheme's own axes color ----
  await page.locator('#editMenuBtn').click();
  await page
    .locator('#editMenuItems')
    .getByText('Preferences…', { exact: true })
    .click();
  await expect(page.locator('#preferencesModal')).not.toHaveClass(/hidden/);
  await page.locator('#prefs-tab-3dview').click();
  await page.locator('#prefsScheme-starnight').check();

  await expect.poll(scheme, { timeout: 5_000 }).toBe('starnight');
  await expect
    .poll(async () => (await overlay())?.colorHex, { timeout: 10_000 })
    .toBe(STARNIGHT_AXES);

  await page.locator('#preferencesModalDone').click();

  // --- Leave Classic: the dark app theme resolves its own light marks ------
  // Since UF-14 the marks are a PER-UI preference (U-25): Classic's
  // defaults no longer leak into Forge, so the overlay leaves the scene on
  // the flip and Forge shows marks only when Forge turns them on — which
  // is exactly what this leg does, through Forge's own View menu, before
  // judging the color the Forge rebuild bakes.
  await page.locator('#classicModeToggle').click();
  await expect(page.locator('body')).not.toHaveAttribute(
    'data-ui-mode',
    'classic'
  );
  await expect.poll(scheme, { timeout: 10_000 }).toBe('dark');
  await expect
    .poll(async () => (await overlay())?.inScene, { timeout: 10_000 })
    .toBe(false);

  await page.locator('#viewMenuBtn').click();
  await page
    .getByRole('menuitemcheckbox', { name: 'Show Scale Markers' })
    .click();
  await expect
    .poll(async () => (await overlay())?.inScene, { timeout: 10_000 })
    .toBe(true);

  // Absorb the rebuild before judging the color: Starnight's axes are also
  // light, so the brightness check alone could pass on the stale overlay.
  await expect
    .poll(async () => (await overlay())?.colorHex, { timeout: 10_000 })
    .not.toBe(STARNIGHT_AXES);

  // The dark theme's foreground token, not a scheme color. Pinned as
  // "light" (every channel high) rather than as the token's exact value,
  // so a design-token tweak cannot false-fail the regression.
  const hex = (await overlay())?.colorHex;
  expect(hex).not.toBe(CORNFIELD_AXES);
  const channels = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
  expect(Math.min(...channels)).toBeGreaterThanOrEqual(0xcc);
});
