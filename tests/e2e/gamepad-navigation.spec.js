import { test, expect } from '@playwright/test';
import { skipWithoutWebGL } from './helpers/webgl.js';

// A game controller drives the interface as a keyboard would: the right
// bumper steps to the next control and its focus ring shows, A presses the
// File menu's button, B closes the menu again, and the right trigger jumps
// to the next part of the window. The pad is a stand-in the page reads
// through navigator.getGamepads().

const WASM_READY_TIMEOUT = 180_000;

/** The standard mapping's indexes for the buttons these cases press. */
const BUTTON = { a: 0, b: 1, rb: 5, rt: 7 };

async function openWithPad(page) {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
    localStorage.setItem('openscad-forge-theme', 'dark');
    localStorage.setItem(
      'openscad-forge-ui-mode',
      JSON.stringify({ mode: 'standard', lastCustomMode: 'standard' })
    );
    window.__padButtons = Array.from({ length: 17 }, () => ({
      pressed: false,
      touched: false,
      value: 0,
    }));
    const pad = {
      id: 'Test pad (STANDARD GAMEPAD Vendor: 045e Product: 02ea)',
      index: 0,
      connected: true,
      mapping: 'standard',
      timestamp: 0,
      axes: [0, 0, 0, 0],
      get buttons() {
        return window.__padButtons;
      },
    };
    Object.defineProperty(Navigator.prototype, 'getGamepads', {
      configurable: true,
      value: () => [pad, null, null, null],
    });
  });
  await page.goto('/?example=simple-box', { timeout: 60_000 });
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: WASM_READY_TIMEOUT,
  });
  await page
    .locator('.param-control')
    .first()
    .waitFor({ state: 'attached', timeout: 60_000 });
  const notNow = page.locator('#saveProjectNotNow');
  if (
    await notNow.waitFor({ state: 'visible', timeout: 3_000 }).then(
      () => true,
      () => false
    )
  ) {
    await notNow.click();
  }
  await page.evaluate(() => {
    const e = new Event('gamepadconnected');
    e.gamepad = navigator.getGamepads()[0];
    window.dispatchEvent(e);
  });
}

/** Press and release one button, a few frames each way. */
async function press(page, index) {
  await page.evaluate((i) => {
    window.__padButtons[i] = { pressed: true, touched: true, value: 1 };
  }, index);
  await page.waitForTimeout(120);
  await page.evaluate((i) => {
    window.__padButtons[i] = { pressed: false, touched: false, value: 0 };
  }, index);
  await page.waitForTimeout(120);
}

const activeId = (page) => page.evaluate(() => document.activeElement?.id);

test.describe('A game controller drives the interface', () => {
  test('the right bumper steps to the next control, its ring showing', async ({
    page,
  }) => {
    await openWithPad(page);
    // Where Tab goes from the File menu's button is where the bumper goes.
    await page.locator('#fileMenuBtn').focus();
    await page.keyboard.press('Tab');
    const expected = await activeId(page);
    expect(expected).toBeTruthy();
    await page.locator('#fileMenuBtn').focus();
    await press(page, BUTTON.rb);
    expect(await activeId(page)).toBe(expected);
    const ring = await page.evaluate(() => {
      const el = document.activeElement;
      const style = getComputedStyle(el);
      return {
        source: el.getAttribute('data-focus-source'),
        outline: style.outlineStyle,
        width: parseFloat(style.outlineWidth),
      };
    });
    expect(ring.source).toBe('gamepad');
    expect(ring.outline).not.toBe('none');
    expect(ring.width).toBeGreaterThanOrEqual(2);
  });

  test('A opens the File menu and B closes it', async ({ page }) => {
    await openWithPad(page);
    const file = page.locator('#fileMenuBtn');
    await file.focus();
    await press(page, BUTTON.a);
    await expect(file).toHaveAttribute('aria-expanded', 'true');
    await press(page, BUTTON.b);
    await expect(file).toHaveAttribute('aria-expanded', 'false');
    expect(await activeId(page)).toBe('fileMenuBtn');
  });

  test('the right trigger jumps from the preview to the camera panel', async ({
    page,
  }) => {
    await openWithPad(page);
    await skipWithoutWebGL(
      page,
      'no WebGL context: this browser draws no preview canvas to start from'
    );
    await page.locator('#previewContainer canvas').first().focus();
    await press(page, BUTTON.rt);
    const landed = await page.evaluate(() => {
      const el = document.activeElement;
      return {
        inCamera: !!el?.closest('#cameraPanel, #cameraDrawer'),
        label: el?.getAttribute('aria-label') || el?.textContent?.trim(),
      };
    });
    expect(landed.inCamera, `landed on ${landed.label}`).toBe(true);
  });
});
