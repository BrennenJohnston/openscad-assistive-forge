import { test, expect } from '@playwright/test';
import path from 'path';

const SAMPLE = path.join(process.cwd(), 'tests', 'fixtures', 'sample.scad');

/**
 * The camera bar's Preview must show what is typed, not what was last
 * published (E3-era defect, re-reported UF-1 §L, fixed UF-6 P6).
 *
 * Mechanism: editor edits publish through a 500 ms write-back debounce.
 * The plain preview path re-serves the cached preview of the last
 * PUBLISHED source, so pressing the camera-bar Preview inside that window
 * rendered the pre-edit model. The top toolbar's Preview always flushed
 * first; this pins the camera bar to the same trigger.
 *
 * Proven through the Console: the typed edit is an echo() marker, and the
 * render either carries it (flushed) or cannot (stale) — asserting on the
 * editor buffer would prove only that typing works.
 *
 * @license GPL-3.0-or-later
 */

const WASM_READY_TIMEOUT = 180_000;
const MARKER = 'UF6_P6_FLUSH_MARKER';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
  });
});

test('camera-bar Preview renders an unblurred edit typed moments before', async ({
  page,
}) => {
  test.setTimeout(240_000);

  await page.goto('/');
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: WASM_READY_TIMEOUT,
  });
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

  await page.locator('#uiModeToggle').click();
  await expect(page.locator('#editMenuBtn')).toBeVisible();
  await page.locator('#classicModeToggle').click();
  await expect(page.locator('body')).toHaveAttribute('data-ui-mode', 'classic');

  // The initial auto-preview must be CURRENT first: the defect path is a
  // cache hit re-serving exactly this render, so it has to exist.
  await expect(page.locator('#previewContainer')).toHaveClass(
    /preview-current/,
    { timeout: 120_000 }
  );

  const consoleLog = page.locator('#console-output');
  await expect(consoleLog).not.toContainText(MARKER);

  // Type the marker and press the camera-bar Preview immediately — well
  // inside the 500 ms write-back window, without blurring the editor.
  const editor = page.locator('.cm-content');
  await editor.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type(`\necho("${MARKER}");`);
  await page.locator('#classicPreviewBtn').click();

  // The render that follows carries the edit only if the button flushed
  // the write-back before previewing. CI's software renderer needs more
  // wall clock than local hardware for the same render (MEASURED: the
  // marker missed a 60 s window on a starved shard while the same walk
  // passes locally in seconds); the contract stays binary - a stale
  // render never contains the marker at any timeout.
  await expect(consoleLog).toContainText(MARKER, { timeout: 120_000 });
});
