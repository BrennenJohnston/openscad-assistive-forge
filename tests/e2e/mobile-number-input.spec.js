// Mobile number input text visibility regression tests
import { test, expect } from '@playwright/test';
import path from 'path';

const isCI = !!process.env.CI;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
  });
});

async function loadSampleFile(page) {
  const wasmReady = page.waitForEvent('console', {
    predicate: (msg) => msg.text().includes('OpenSCAD WASM ready'),
    timeout: 120_000,
  });

  await page.goto('/');
  await wasmReady;

  const fixturePath = path.join(
    process.cwd(),
    'tests',
    'fixtures',
    'sample.scad'
  );
  await page.setInputFiles('#fileInput', fixturePath);
  await page.waitForSelector('.param-control', { timeout: 30_000 });

  try {
    const notNowBtn = page.locator('#saveProjectNotNow');
    await notNowBtn.waitFor({ state: 'visible', timeout: 3000 });
    await notNowBtn.click();
    await page.waitForTimeout(300);
  } catch {
    // Modal never appeared – carry on
  }
}

async function openDrawer(page) {
  const toggle = page.locator('#mobileDrawerToggle');
  await toggle.click();
  await expect(page.locator('#paramPanel')).toHaveClass(/drawer-open/);
}

async function clearAndType(page, locator, value) {
  await locator.click();
  await locator.press('Control+a');
  await locator.press('Backspace');
  await locator.fill(String(value));
}

test.describe('Mobile Number Input Text Visibility', () => {
  test.use({ viewport: { width: 375, height: 812 } });
  test.describe.configure({ timeout: 150_000 });

  test('slider spinbox retains typed value after clear and retype', async ({
    page,
  }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI');
    await loadSampleFile(page);
    await openDrawer(page);

    const spinbox = page.locator('.slider-spinbox').first();
    await expect(spinbox).toBeVisible();

    await clearAndType(page, spinbox, '42');

    await expect(spinbox).toHaveValue('42');
  });

  test('number input retains typed value after clear and retype', async ({
    page,
  }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI');
    await loadSampleFile(page);
    await openDrawer(page);

    const numberInput = page
      .locator('.number-input-container input[type="number"]')
      .first();
    const hasNumberInput = await numberInput.count();

    if (hasNumberInput > 0) {
      await expect(numberInput).toBeVisible();
      await clearAndType(page, numberInput, '55');
      await expect(numberInput).toHaveValue('55');
    } else {
      const fallbackInput = page.locator('input[type="number"]').first();
      await expect(fallbackInput).toBeVisible();
      await clearAndType(page, fallbackInput, '55');
      await expect(fallbackInput).toHaveValue('55');
    }
  });

  test('vector input retains typed value after clear and retype', async ({
    page,
  }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI');
    await loadSampleFile(page);
    await openDrawer(page);

    const vectorInput = page.locator('.vector-input').first();
    const hasVector = await vectorInput.count();

    test.skip(hasVector === 0, 'No vector inputs in current fixture');

    await expect(vectorInput).toBeVisible();
    await clearAndType(page, vectorInput, '7');
    await expect(vectorInput).toHaveValue('7');
  });

  test('slider spinbox text is visually rendered (screenshot)', async ({
    page,
  }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI');
    await loadSampleFile(page);
    await openDrawer(page);

    const spinbox = page.locator('.slider-spinbox').first();
    await clearAndType(page, spinbox, '99');
    await expect(spinbox).toHaveValue('99');

    await expect(spinbox).toHaveScreenshot('spinbox-with-value.png', {
      maxDiffPixelRatio: 0.1,
    });
  });

  test('number input has -webkit-text-fill-color set', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI');
    await loadSampleFile(page);
    await openDrawer(page);

    const spinbox = page.locator('.slider-spinbox').first();
    const fillColor = await spinbox.evaluate((el) => {
      return window
        .getComputedStyle(el)
        .getPropertyValue('-webkit-text-fill-color');
    });

    expect(fillColor).not.toBe('');
    expect(fillColor).not.toBe('rgba(0, 0, 0, 0)');
  });

  test('typed value visible in dark theme', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI');
    await page.addInitScript(() => {
      localStorage.setItem('openscad-forge-theme', 'dark');
    });
    await loadSampleFile(page);
    await openDrawer(page);

    const spinbox = page.locator('.slider-spinbox').first();
    await clearAndType(page, spinbox, '33');
    await expect(spinbox).toHaveValue('33');

    const fillColor = await spinbox.evaluate((el) => {
      return window
        .getComputedStyle(el)
        .getPropertyValue('-webkit-text-fill-color');
    });
    expect(fillColor).not.toBe('');
    expect(fillColor).not.toBe('rgba(0, 0, 0, 0)');
  });

  test('typed value visible in light theme', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI');
    await page.addInitScript(() => {
      localStorage.setItem('openscad-forge-theme', 'light');
    });
    await loadSampleFile(page);
    await openDrawer(page);

    const spinbox = page.locator('.slider-spinbox').first();
    await clearAndType(page, spinbox, '77');
    await expect(spinbox).toHaveValue('77');

    const fillColor = await spinbox.evaluate((el) => {
      return window
        .getComputedStyle(el)
        .getPropertyValue('-webkit-text-fill-color');
    });
    expect(fillColor).not.toBe('');
    expect(fillColor).not.toBe('rgba(0, 0, 0, 0)');
  });

  test('typed value visible in mono variant', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI');
    await page.addInitScript(() => {
      localStorage.setItem('openscad-forge-variant', 'mono');
    });
    await loadSampleFile(page);
    await openDrawer(page);

    const spinbox = page.locator('.slider-spinbox').first();
    await clearAndType(page, spinbox, '12');
    await expect(spinbox).toHaveValue('12');

    const fillColor = await spinbox.evaluate((el) => {
      return window
        .getComputedStyle(el)
        .getPropertyValue('-webkit-text-fill-color');
    });
    expect(fillColor).not.toBe('');
    expect(fillColor).not.toBe('rgba(0, 0, 0, 0)');
  });

  test('input text-fill-color matches computed color', async ({ page }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI');
    await loadSampleFile(page);
    await openDrawer(page);

    const spinbox = page.locator('.slider-spinbox').first();
    const { color, fillColor } = await spinbox.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      return {
        color: styles.getPropertyValue('color'),
        fillColor: styles.getPropertyValue('-webkit-text-fill-color'),
      };
    });

    expect(fillColor).toBe(color);
  });
});

test.describe('Mobile Number Input at 480px', () => {
  test.use({ viewport: { width: 480, height: 854 } });
  test.describe.configure({ timeout: 150_000 });

  test('slider spinbox retains typed value at 480px viewport', async ({
    page,
  }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI');
    await loadSampleFile(page);
    await openDrawer(page);

    const spinbox = page.locator('.slider-spinbox').first();
    await clearAndType(page, spinbox, '64');
    await expect(spinbox).toHaveValue('64');
  });
});

test.describe('Mobile Number Input at 767px', () => {
  test.use({ viewport: { width: 767, height: 1024 } });
  test.describe.configure({ timeout: 150_000 });

  test('slider spinbox retains typed value at 767px viewport', async ({
    page,
  }) => {
    test.skip(isCI, 'WASM file processing is slow/unreliable in CI');
    await loadSampleFile(page);
    await openDrawer(page);

    const spinbox = page.locator('.slider-spinbox').first();
    await clearAndType(page, spinbox, '88');
    await expect(spinbox).toHaveValue('88');
  });
});
