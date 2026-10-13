/**
 * Every control a finger lands on is at least 44 by 44 px: the project's
 * rule, above WCAG's 24. The walk measured help buttons at 20, reset buttons
 * at 21 by 26, camera view buttons at 32 tall, the file manager's close at
 * 32, the Keep checkbox at 20, the drawing editor's header buttons at 38,
 * and CodeMirror's search panel at 21 with 13 px checkboxes.
 *
 * @license GPL-3.0-or-later
 */
import { test, expect } from '@playwright/test';

test.describe.configure({ timeout: 180_000 });

// A touch-first page: the token is 44 px for a coarse pointer (36 px for a
// fine one, which this is not). Desktop width, where the walk measured.
test.use({ viewport: { width: 1280, height: 800 }, hasTouch: true });

const MIN = 44;

async function openBox(page) {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
  });
  await page.goto('/?example=simple-box');
  await expect(page.locator('.preview-state-indicator')).toHaveClass(
    /state-current/,
    { timeout: 120_000 }
  );
}

/** Width and height of every drawn element matching the selector. */
function sizesOf(page, selector) {
  return page.evaluate((sel) => {
    return [...document.querySelectorAll(sel)]
      .filter((el) => el.checkVisibility())
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height) };
      });
  }, selector);
}

async function expectAtLeast(page, selector, what) {
  const sizes = await sizesOf(page, selector);
  expect(
    sizes.length,
    `${what}: nothing drawn for ${selector}`
  ).toBeGreaterThan(0);
  for (const { w, h } of sizes) {
    expect(w, `${what} is ${w} wide`).toBeGreaterThanOrEqual(MIN);
    expect(h, `${what} is ${h} tall`).toBeGreaterThanOrEqual(MIN);
  }
}

test('the Customizer’s help and reset buttons', async ({ page }) => {
  await openBox(page);
  // The "?" buttons are drawn at the Hide Details level (the default); at
  // Show Details the description is inline and the buttons are hidden.
  await page.locator('#paramDetailLevel').selectOption('hide');
  await page.evaluate(() => {
    document
      .querySelectorAll('#parametersContainer details')
      .forEach((d) => (d.open = true));
  });
  await expectAtLeast(page, '.param-help-button', 'a help button');
  await expectAtLeast(page, '.param-reset-btn', 'a reset button');
});

test('the Customizer’s one reset-all button, full size, still asks first', async ({
  page,
}) => {
  await openBox(page);
  await expect(page.locator('#resetBtn')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: /^Reset all parameters/ })
  ).toHaveCount(1);
  await expectAtLeast(page, '#resetAllBtn', 'Reset All');

  await page.evaluate(() => {
    document
      .querySelectorAll('#parametersContainer details')
      .forEach((d) => (d.open = true));
  });
  const width = page.locator('#param-width');
  await width.fill('60');
  await width.press('Tab');
  await page.locator('#resetAllBtn').click();
  const question = page
    .locator('[role="alertdialog"]')
    .filter({ has: page.getByRole('heading', { name: 'Reset the Customizer?' }) });
  await expect(question).toBeVisible();
  await question.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(width).toHaveValue('50');
});

test('the camera panel’s buttons', async ({ page }) => {
  await openBox(page);
  const toggle = page.locator('#cameraPanelToggle');
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute('aria-expanded')) !== 'true')
    await toggle.click();
  await expectAtLeast(page, '.camera-btn', 'a camera button');
  await expectAtLeast(page, '.camera-view-btn', 'a view button');
});

test('the Clear Cache dialog’s Keep checkbox', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
  });
  await page.goto('/');
  await expect(page.locator('#clearStorageBtn')).toBeVisible({
    timeout: 60_000,
  });
  await page.locator('#clearStorageBtn').click();
  await expect(page.locator('.cache-clear-option')).toHaveCount(2);
  await expectAtLeast(
    page,
    '.cache-clear-option input[type="checkbox"]',
    'the Keep checkbox'
  );
});

test('the code editor’s search panel', async ({ page }) => {
  // The drawing editor's own header is measured in drawing-editor.spec.js.
  await openBox(page);
  const mode = page.locator('#uiModeToggle');
  if ((await mode.getAttribute('aria-checked')) !== 'true') await mode.click();
  // The code editor's search panel is CodeMirror's own, opened by its key.
  await page.locator('#expertModeToggle').click();
  const content = page.locator('#expertModePanel .cm-content');
  await expect(content).toBeVisible({ timeout: 30_000 });
  await content.click();
  await page.keyboard.press('Control+f');
  await expect(page.locator('.cm-search')).toBeVisible();
  await expectAtLeast(page, '.cm-search button', 'a search panel button');
  await expectAtLeast(
    page,
    '.cm-search input[type="checkbox"]',
    'a search panel checkbox'
  );
  await expectAtLeast(
    page,
    '.cm-search input[type="text"], .cm-search .cm-textfield',
    'a search field'
  );
});

test.describe('the phone camera drawer', () => {
  test.use({ viewport: { width: 412, height: 915 }, hasTouch: true });
  test('its zoom column, View All included', async ({ page }) => {
    await openBox(page);
    const toggle = page.locator('#cameraDrawerToggle');
    await expect(toggle).toBeVisible();
    if ((await toggle.getAttribute('aria-expanded')) !== 'true')
      await toggle.click();
    await expectAtLeast(
      page,
      '.camera-drawer-zoom-controls .camera-drawer-btn',
      'a zoom button'
    );
  });
});

test.describe('the Alt View’s Characters control on a phone', () => {
  test.use({ viewport: { width: 412, height: 915 }, hasTouch: true });
  test('its smaller and larger buttons', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('openscad-customizer-hfm-unlock', 'true');
    });
    await openBox(page);
    const key = page.locator('#_hfmToggle');
    await expect(key).toBeVisible();
    await key.click();
    await expect(key).toHaveAttribute('aria-pressed', 'true');
    await expectAtLeast(page, '.alt-view-stepper-btn', 'a characters button');
    await expectAtLeast(page, '.alt-view-level-btn', 'an edges button');
  });
});
