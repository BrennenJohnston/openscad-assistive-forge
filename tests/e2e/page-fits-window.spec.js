/**
 * The page never grows past the window. The app is a single screen whose
 * panels scroll inside it; if the document itself gets taller than the
 * window, the browser can scroll the header out of view and the page "slides
 * up". Each layout is checked at a desktop and a laptop size with every
 * panel that can open in the Customizer column open: the Console section,
 * the Preview Settings drawer, and the OpenSCAD messages drawer.
 *
 * @license GPL-3.0-or-later
 */
import { test, expect } from '@playwright/test';
import path from 'path';
import { expectPageFitsViewport } from './helpers/invariants.js';

const SIZES = [
  { width: 1920, height: 889 },
  { width: 1280, height: 720 },
];
const LAYOUTS = ['standard', 'simplified', 'classic'];

async function openEchoFixture(page) {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
  });
  await page.goto('/');
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: 120_000,
  });
  await page.setInputFiles(
    '#fileInput',
    path.join(process.cwd(), 'tests', 'fixtures', 'console-echo.scad')
  );
  const notNow = page.locator('#saveProjectNotNow');
  if (
    await notNow.waitFor({ timeout: 15_000 }).then(
      () => true,
      () => false
    )
  ) {
    await notNow.click();
  }
  await page.waitForSelector('.param-control', {
    state: 'attached',
    timeout: 60_000,
  });
  await page
    .locator('.preview-state-indicator.state-current')
    .waitFor({ timeout: 120_000 });
}

async function switchTo(page, layout) {
  const mode = page.locator('#uiModeToggle');
  if (layout === 'classic') {
    await page.locator('#classicModeToggle').click();
    await page
      .locator('body[data-ui-mode="classic"]')
      .waitFor({ timeout: 10_000 });
    return;
  }
  const wantStandard = layout === 'standard';
  if (((await mode.getAttribute('aria-checked')) === 'true') !== wantStandard) {
    await mode.click();
  }
  await page
    .locator(`body[data-ui-mode="${layout}"]`)
    .waitFor({ timeout: 10_000 });
}

/** Open a disclosure or drawer if its control is shown; say whether it was. */
async function openIfShown(page, selector, open) {
  const control = page.locator(selector);
  if (!(await control.isVisible().catch(() => false))) return false;
  await open(control);
  await page.waitForTimeout(400);
  return true;
}

for (const size of SIZES) {
  for (const layout of LAYOUTS) {
    test(`${layout} at ${size.width} x ${size.height}: the page fits the window with every panel open`, async ({
      page,
    }) => {
      test.setTimeout(240_000);
      await page.setViewportSize(size);
      await openEchoFixture(page);
      await switchTo(page, layout);
      await page.waitForTimeout(600);
      await expectPageFitsViewport(page);

      // The Customizer's Console section (hidden in Simplified).
      const consoleOpened = await openIfShown(page, '#consolePanel', (d) =>
        d.evaluate((el) => {
          el.open = true;
        })
      );
      await expectPageFitsViewport(page);
      if (consoleOpened) {
        await page.locator('#consolePanel').evaluate((el) => {
          el.open = false;
        });
      }

      // The Preview Settings drawer.
      await openIfShown(page, '#previewDrawerToggle', async (btn) => {
        if ((await btn.getAttribute('aria-expanded')) !== 'true')
          await btn.click();
      });
      await expectPageFitsViewport(page);

      // The OpenSCAD messages drawer under the preview.
      await openIfShown(page, '#echoDrawerToggle', async (btn) => {
        if ((await btn.getAttribute('aria-expanded')) !== 'true')
          await btn.click();
      });
      await expectPageFitsViewport(page);

      // Everything open at once.
      if (consoleOpened) {
        await page.locator('#consolePanel').evaluate((el) => {
          el.open = true;
        });
        await page.waitForTimeout(400);
      }
      await expectPageFitsViewport(page);
      // Simplified hides the section; Classic shows the console in its own dock.
      expect(consoleOpened, 'the Console section belongs to Standard').toBe(
        layout === 'standard'
      );
    });
  }
}
