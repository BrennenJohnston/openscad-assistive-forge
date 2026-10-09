import { test, expect } from '@playwright/test';
import { attachInvariants, expectNoPageErrors } from './helpers/invariants.js';

/**
 * A queue row shows a job's name and its error as text. A queue file can
 * come from anyone, so tags in a name stay visible characters: never a link,
 * never formatting, never a way out of a button's label.
 *
 * @license GPL-3.0-or-later
 */

const WASM_READY_TIMEOUT = 180_000;
const RENDER_TIMEOUT = 120_000;

const SOURCE = ['size = 10; // [5:50]', 'cube(size);', ''].join('\n');

const NAME = '<b>Bold</b> <a href="https://example.com/">a link</a> "quoted"';

const QUEUE_FILE = {
  name: 'queue.json',
  mimeType: 'application/json',
  buffer: Buffer.from(
    JSON.stringify({
      version: '1.0.0',
      timestamp: 0,
      jobs: [
        {
          id: 'job-1',
          name: NAME,
          parameters: {},
          // A cube has no 2D outline, so this job fails on purpose and its
          // error, which starts with the job's name, is on screen as well.
          outputFormat: 'svg',
          state: 'queued',
        },
      ],
    })
  ),
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
  });
});

test('an imported job keeps the tags in its name as text', async ({ page }) => {
  test.setTimeout(300_000);
  attachInvariants(page);
  await page.goto('/');
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: WASM_READY_TIMEOUT,
  });
  await page.locator('#fileInput').setInputFiles({
    name: 'queue-text.scad',
    mimeType: 'text/plain',
    buffer: Buffer.from(SOURCE),
  });
  await expect(page.locator('#mainInterface')).toBeVisible({ timeout: 30_000 });
  // An uploaded file is offered a place in Saved Projects.
  await page.locator('#saveProjectNotNow').click();
  await expect(page.locator('.save-project-modal')).toHaveCount(0);
  await expect(page.locator('#previewContainer')).toHaveClass(
    /preview-current/,
    { timeout: RENDER_TIMEOUT }
  );

  if (!(await page.locator('#addToQueueBtn').isVisible())) {
    await page.locator('#actionsDrawerToggle').click();
  }
  // An imported job renders the project the last Add to Queue handed over.
  await page.locator('#addToQueueBtn').click();
  await page.locator('#viewQueueBtn').click();
  const queue = page.locator('#renderQueueModal');
  await expect(queue).toBeVisible();

  await page.locator('#queueImportInput').setInputFiles(QUEUE_FILE);
  const rows = queue.locator('.queue-item');
  await expect(rows).toHaveCount(2);
  const row = rows.nth(1);

  await page.locator('#processQueueBtn').click();
  const error = row.locator('.queue-item-error');
  await expect(error).toBeVisible({ timeout: RENDER_TIMEOUT });

  expect.soft(await row.locator('.queue-item-name').textContent()).toBe(NAME);
  expect.soft(await error.textContent()).toContain(`${NAME} could not render:`);
  await expect.soft(row.locator('b, a')).toHaveCount(0);
  await expect
    .soft(row.locator('button[data-action="remove"]'))
    .toHaveAttribute('aria-label', `Remove ${NAME}`);
  expectNoPageErrors(page);
});
