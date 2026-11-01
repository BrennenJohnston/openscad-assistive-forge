/**
 * Every control a finger lands on is at least 44 by 44 px: the project's
 * rule, above WCAG's 24. The walk measured help buttons at 20, reset buttons
 * at 21 by 26, camera view buttons at 32 tall, the file manager's close at
 * 32, the Keep checkbox at 20, the drawing editor's header buttons at 38,
 * and CodeMirror's search panel at 21 with 13 px checkboxes. On phones the
 * menu bar's buttons stood 32 tall upright, and the bottom bar's Camera and
 * Lens toggles 36 held sideways.
 *
 * @license GPL-3.0-or-later
 */
import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';
import { skipWithoutWebGL } from './helpers/webgl.js';

test.describe.configure({ timeout: 180_000 });

// A touch-first page: the token is 44 px for a coarse pointer (36 px for a
// fine one, which this is not). Desktop width, where the walk measured.
test.use({ viewport: { width: 1280, height: 800 }, hasTouch: true });

const MIN = 44;

// The touch rules key on the pointer the browser reports; Playwright's
// Firefox reports none for a touch context, so those cases need one.
async function skipUnless(page, query, what) {
  test.skip(
    !(await page.evaluate((q) => matchMedia(q).matches, query)),
    `this browser does not report ${what}`
  );
}
const SIDEWAYS =
  '(orientation: landscape) and (pointer: coarse) and (max-height: 500px)';

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

// The round mark is 20 px across inside its 44 px target: the padding and
// background-clip draw it so. A background shorthand after the clip resets
// the clip, and the color fills the whole target over the label beside it.
test('the help mark is drawn 20 px across inside its target, at rest, under the mouse and open', async ({
  page,
}) => {
  await openBox(page);
  await page.locator('#paramDetailLevel').selectOption('hide');
  await page.evaluate(() => {
    document
      .querySelectorAll('#parametersContainer details')
      .forEach((d) => (d.open = true));
  });
  const button = page.locator('.param-help-button').first();
  await button.scrollIntoViewIfNeeded();
  // From the first pixel of the mark's color to the last, across its middle.
  const markWidth = async () => {
    const color = await button.evaluate(
      (b) => getComputedStyle(b).backgroundColor
    );
    const [r, g, b] = color.match(/\d+/g).map(Number);
    const png = PNG.sync.read(
      await button.screenshot({ animations: 'disabled' })
    );
    const y = Math.floor(png.height / 2);
    const hits = [];
    for (let x = 0; x < png.width; x += 1) {
      const i = (y * png.width + x) * 4;
      const d =
        Math.abs(png.data[i] - r) +
        Math.abs(png.data[i + 1] - g) +
        Math.abs(png.data[i + 2] - b);
      if (d < 30) hits.push(x);
    }
    return hits.length ? hits[hits.length - 1] - hits[0] + 1 : 0;
  };
  const atRest = await markWidth();
  expect(
    atRest,
    `at rest the mark is ${atRest} px across`
  ).toBeGreaterThanOrEqual(18);
  expect(atRest, `at rest the mark is ${atRest} px across`).toBeLessThanOrEqual(
    22
  );
  await button.hover();
  const hovered = await markWidth();
  expect(hovered, `under the mouse it is ${hovered} px`).toBeLessThanOrEqual(
    24
  );
  await button.click();
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  const open = await markWidth();
  expect(open, `open it is ${open} px`).toBeLessThanOrEqual(24);
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
    .filter({
      has: page.getByRole('heading', { name: 'Reset the Customizer?' }),
    });
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

test.describe('the Alt View’s controls on a phone', () => {
  test.use({ viewport: { width: 412, height: 915 }, hasTouch: true });
  test('its sliders in the Lens drawer', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('openscad-customizer-hfm-unlock', 'true');
    });
    await openBox(page);
    await skipWithoutWebGL(
      page,
      'no WebGL: the Alt View draws its characters from the 3D picture'
    );
    const key = page.locator('#_hfmToggle');
    await expect(key).toBeVisible();
    await key.click();
    await expect(key).toHaveAttribute('aria-pressed', 'true');
    // On a phone the four sliders sit in the Lens drawer.
    await page.locator('#asciiDrawerToggle').click();
    await expectAtLeast(
      page,
      '#asciiDrawerBody input[type="range"]',
      'a Lens drawer slider'
    );
  });
});

test.describe('the menu bar on an upright phone', () => {
  test.use({ viewport: { width: 412, height: 915 }, hasTouch: true });
  for (const look of [
    { label: '' },
    { label: ', in high contrast', highContrast: true },
  ]) {
    test(`its menu buttons${look.label}`, async ({ page }) => {
      // The menu bar is Standard's.
      await page.addInitScript((l) => {
        localStorage.setItem(
          'openscad-forge-ui-mode',
          JSON.stringify({ mode: 'standard', lastCustomMode: 'standard' })
        );
        if (l.highContrast) {
          localStorage.setItem('openscad-forge-high-contrast', 'true');
        }
      }, look);
      await openBox(page);
      await skipUnless(page, '(pointer: coarse)', 'a touch screen');
      await expectAtLeast(
        page,
        '#toolbarMenuBar .toolbar-menu-btn',
        'a menu button'
      );
    });
  }
});

test.describe('the bottom bar on a phone held sideways', () => {
  test.use({ viewport: { width: 740, height: 360 }, hasTouch: true });
  test('the Camera toggle', async ({ page }) => {
    await openBox(page);
    await skipUnless(page, SIDEWAYS, 'a touch screen held sideways');
    await expectAtLeast(page, '#cameraDrawerToggle', 'the Camera toggle');
  });

  test('the Lens and Camera toggles in the Alt View', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('openscad-customizer-hfm-unlock', 'true');
    });
    await openBox(page);
    await skipUnless(page, SIDEWAYS, 'a touch screen held sideways');
    await skipWithoutWebGL(
      page,
      'no WebGL: the Alt View draws its characters from the 3D picture'
    );
    const key = page.locator('#_hfmToggle');
    await expect(key).toBeVisible();
    await key.click();
    await expect(key).toHaveAttribute('aria-pressed', 'true');
    await expectAtLeast(
      page,
      '#asciiDrawerToggle, #cameraDrawerToggle',
      'a bottom bar toggle'
    );
  });
});
