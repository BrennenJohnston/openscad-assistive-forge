/**
 * Settings that belong to the person stay with the person; settings that
 * belong to a project leave with it. Automatic preview, switched off, is
 * still off after a reload. Reference Image, switched on for one project, is
 * off in the next. And a field the app fills with a fraction (Viewport
 * Control's Distance, 180.07) does not call its own value invalid.
 *
 * @license GPL-3.0-or-later
 */
import { test, expect } from '@playwright/test';

test.describe.configure({ timeout: 180_000 });

async function seed(page) {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
  });
}

async function openExample(page, key) {
  await page.goto(`/?example=${key}`);
  await expect(page.locator('.preview-state-indicator')).toHaveClass(
    /state-current|state-error/,
    { timeout: 120_000 }
  );
}

test('Automatic preview, switched off, is still off after a reload', async ({
  page,
}) => {
  await seed(page);
  await openExample(page, 'simple-box');
  const toggle = page.locator('#autoPreviewToggle');
  await expect(toggle).toBeChecked();
  await toggle.evaluate((box) => box.click());
  await expect(toggle).not.toBeChecked();

  await page.reload();
  await expect(page.locator('body')).toHaveAttribute(
    'data-wasm-ready',
    'true',
    {
      timeout: 120_000,
    }
  );
  await expect(page.locator('#autoPreviewToggle')).not.toBeChecked();
});

// Reference Image staying "On" into the next project was seen once on a
// Charm Designer that had its own picture; neither the Charm nor a Charm given
// a drawing does it here, so there is nothing yet to pin.

test('Viewport Control accepts the fractions the app writes', async ({
  page,
}) => {
  await seed(page);
  await openExample(page, 'simple-box');
  const valid = await page.evaluate(() => {
    const field = document.getElementById('vpDistance');
    field.value = '180.07';
    return { step: field.getAttribute('step'), valid: field.checkValidity() };
  });
  expect(valid).toEqual({ step: 'any', valid: true });
});
