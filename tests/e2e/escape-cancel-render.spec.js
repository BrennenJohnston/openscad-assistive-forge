/**
 * Escape is the key that stops a render. Its handler once asked the render
 * controller for a method it does not have, so every Escape on a project
 * logged a TypeError and no Generate was ever stopped by the keyboard. It
 * stops a Generate the way the Cancel button does; an Escape that closes
 * something else, such as the Customizer on a phone, stops nothing.
 *
 * @license GPL-3.0-or-later
 */
import { test, expect } from '@playwright/test';

// The engine's own log lines, which say when a render is under way, reach
// the page's console from its worker in Chromium only.
test.skip(
  ({ browserName }) => browserName !== 'chromium',
  'needs worker console messages, which only Chromium passes to the page'
);

// Slow on purpose: a render still running when Escape is pressed.
const SLOW_MODEL = `
rounding = 2;
minkowski() {
  difference() {
    cube(20, center = true);
    sphere(13, $fn = 24);
  }
  sphere(rounding / 2, $fn = 12);
}
`;

function watchConsole(page) {
  const seen = { handlerErrors: [], cancels: [] };
  page.on('console', (msg) => {
    const text = msg.text().slice(0, 200);
    if (msg.type() === 'error' && text.includes('cancelRender')) {
      seen.handlerErrors.push(text);
    }
    if (/cancel/i.test(text)) seen.cancels.push(text);
  });
  return seen;
}

async function openSlowModel(page) {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
  });
  await page.goto('/');
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: 180_000,
  });
  await page.locator('#fileInput').setInputFiles({
    name: 'slow.scad',
    mimeType: 'text/plain',
    buffer: Buffer.from(SLOW_MODEL),
  });
  await page.locator('#saveProjectNotNow').click({ timeout: 30_000 });
  const indicator = page.locator('.preview-state-indicator');
  await expect(indicator).toHaveClass(/state-current/, { timeout: 180_000 });
  return indicator;
}

// The engine restarts before each render, and an Escape during the restart
// has nothing to stop yet: wait for the render itself.
function engineAtWork(page, argument) {
  return page.waitForEvent('console', {
    predicate: (msg) =>
      msg.text().includes('Calling OpenSCAD') && msg.text().includes(argument),
    timeout: 60_000,
  });
}

test('Escape stops a Generate the way its Cancel button does', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const seen = watchConsole(page);
  await openSlowModel(page);
  // The finished preview is already an STL to download; an OBJ is generated.
  await page.locator('#outputFormat').selectOption('obj');
  await expect(page.locator('#primaryActionBtn')).toHaveAttribute(
    'data-action',
    'generate'
  );

  const working = engineAtWork(page, '.obj');
  await page.locator('#primaryActionBtn').click();
  await working;
  await expect(page.locator('#cancelRenderBtn')).toBeVisible();

  await page.keyboard.press('Escape');
  // The stopped render settles after the key's own handler; a frame later,
  // the page says what it will go on saying.
  await page.evaluate(() => new Promise(requestAnimationFrame));

  await expect(page.locator('#statusArea')).toHaveText(
    'Generation canceled by user'
  );
  await expect(page.getByTestId('friendly-error-modal')).toHaveCount(0);
  await expect(page.locator('.preview-state-indicator')).toHaveClass(
    /state-current/
  );
  await expect(page.locator('#cancelRenderBtn')).toBeHidden();
  await expect(page.locator('#primaryActionBtn')).toBeEnabled();
  expect(seen.handlerErrors).toEqual([]);
});

test('on a phone, Escape that closes the Customizer leaves a running preview to finish', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 412, height: 915 });
  const seen = watchConsole(page);
  const indicator = await openSlowModel(page);

  await page.locator('#mobileDrawerToggle').click();
  await page.locator('#paramPanel summary', { hasText: 'General' }).click();
  const field = page.getByRole('spinbutton', { name: /rounding/i }).first();
  await field.fill('3');
  const working = engineAtWork(page, 'rounding=3');
  await field.press('Enter');
  await working;

  await field.press('Escape');

  await expect(page.locator('#paramPanel')).not.toHaveClass(/drawer-open/);
  await expect(indicator).toHaveClass(/state-current/, { timeout: 180_000 });
  expect(seen.cancels).toEqual([]);
  expect(seen.handlerErrors).toEqual([]);
});
