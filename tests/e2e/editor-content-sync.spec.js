import { test, expect } from '@playwright/test';
import path from 'path';

// Editor content pipeline (R5, sub-plan A).
//
// The editor used to be severed from the app in both directions: a loaded
// project never reached it, and its edits never reached preview, render,
// export or save. These tests pin the two-way channel, in Standard and in
// Classic, on the CodeMirror path and on the textarea fallback.

const FIXTURE_A = path.join(process.cwd(), 'tests', 'fixtures', 'sample.scad');
const FIXTURE_B = path.join(
  process.cwd(),
  'tests',
  'fixtures',
  'sample-advanced.scad'
);

// Text unique to each fixture, used to tell them apart in the editor.
const MARKER_A = 'Simple Box';
const MARKER_B = 'Advanced Parameters';

const WASM_READY_TIMEOUT = 180_000;
// Write-back is debounced at 500ms; poll past it rather than sleeping.
const WRITE_BACK_TIMEOUT = 5_000;

// The camera test reads a value the app copies to the clipboard.
test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
  });
});

async function bootstrap(page) {
  await page.goto('/');
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: WASM_READY_TIMEOUT,
  });
}

async function loadProject(page, fixture) {
  await page.locator('#fileInput').setInputFiles(fixture);
  await expect(page.locator('#mainInterface')).toBeVisible({ timeout: 30_000 });

  const notNowBtn = page.locator('#saveProjectNotNow');
  try {
    await notNowBtn.waitFor({ state: 'visible', timeout: 3_000 });
    await notNowBtn.click();
  } catch {
    // Save-project modal did not appear; nothing to dismiss.
  }
  await expect(page.locator('.save-project-modal')).toHaveCount(0, {
    timeout: 10_000,
  });
}

/** Open the code editor in the Forge UI (Simplified -> Standard -> Expert). */
async function openEditor(page) {
  await page.locator('#uiModeToggle').click();
  await page.locator('#expertModeToggle').click();
  const editor = page
    .locator('#expertModeBody .cm-content, #expert-mode-textarea')
    .first();
  await expect(editor).toBeVisible({ timeout: 15_000 });
  return editor;
}

/**
 * Append text at the end of the document. The per-character delay keeps
 * CodeMirror from dropping keystrokes under Playwright's default speed.
 */
async function appendToEditor(page, editor, text) {
  await editor.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type(text, { delay: 25 });
}

/** The source every consumer reads: render, export, save, auto-preview. */
const stateContent = (page) =>
  page.evaluate(
    () => window.stateManager.getState()?.uploadedFile?.content || ''
  );

const editorText = (editor) =>
  editor.evaluate((el) =>
    el.tagName === 'TEXTAREA' ? el.value : el.textContent
  );

test.describe('Editor content sync (R5)', () => {
  test('standard-second-load: a second project replaces the open editor', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await bootstrap(page);
    await loadProject(page, FIXTURE_A);

    const editor = await openEditor(page);
    await expect(editor).toContainText(MARKER_A, { timeout: 15_000 });

    // The editor is already open — this is the case with no re-sync hook
    // outside Classic, so nothing used to replace the buffer here.
    await loadProject(page, FIXTURE_B);

    await expect(editor).toContainText(MARKER_B, { timeout: 15_000 });
    await expect(editor).not.toContainText(MARKER_A);
  });

  test('classic-second-load: the same holds in the Classic editor dock', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await page.addInitScript(() => {
      localStorage.setItem(
        'openscad-forge-ui-mode',
        JSON.stringify({ mode: 'classic', lastCustomMode: 'standard' })
      );
    });
    await bootstrap(page);
    await loadProject(page, FIXTURE_A);

    const editor = page.locator('#expertModeBody .cm-content');
    await expect(editor).toContainText(MARKER_A, { timeout: 15_000 });

    await loadProject(page, FIXTURE_B);

    await expect(editor).toContainText(MARKER_B, { timeout: 15_000 });
    await expect(editor).not.toContainText(MARKER_A);
  });

  test('direct-edit-then-preview: Preview renders the edit and never overflows the stack', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));

    await bootstrap(page);
    await loadProject(page, FIXTURE_A);
    const editor = await openEditor(page);

    await appendToEditor(page, editor, '\ntranslate([0,0,60]) sphere(12);');
    await expect(editor).toContainText('sphere(12);');

    // triggerPreviewFromEditor() used to call itself, throwing RangeError
    // on every use of this button and of Ctrl+Enter.
    await page.locator('#expertRunPreviewBtn').click();

    await expect(page.locator('.preview-state-indicator')).toContainText(
      'Preview ready',
      { timeout: 180_000 }
    );
    expect(pageErrors.join('\n')).toBe('');
    expect(await stateContent(page)).toContain('sphere(12);');
  });

  test('textarea-fallback-second-load: the non-CodeMirror editor refills too', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await page.addInitScript(() => {
      localStorage.setItem(
        'openscad-forge-mode-prefs',
        JSON.stringify({ preferredEditor: 'textarea' })
      );
    });
    await bootstrap(page);
    await loadProject(page, FIXTURE_A);

    const editor = await openEditor(page);
    await expect(editor).toHaveJSProperty('tagName', 'TEXTAREA');
    expect(await editorText(editor)).toContain(MARKER_A);

    await loadProject(page, FIXTURE_B);

    await expect
      .poll(() => editorText(editor), { timeout: 15_000 })
      .toContain(MARKER_B);
    expect(await editorText(editor)).not.toContain(MARKER_A);
  });

  test('stale-write-back: a pending edit never lands on the next project', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await bootstrap(page);
    await loadProject(page, FIXTURE_A);
    const editor = await openEditor(page);

    // Type, then load another project INSIDE the 500ms write-back window.
    // The queued timer must be cancelled, not fired against project B.
    await appendToEditor(page, editor, '\n// EDIT_TO_PROJECT_A');
    await page.locator('#fileInput').setInputFiles(FIXTURE_B);

    const dialog = page.locator('.confirm-modal');
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await dialog.getByRole('button', { name: 'Discard edits and load' }).click();

    await expect(editor).toContainText(MARKER_B, { timeout: 20_000 });

    // Well past the debounce: project A's edit must not have been written
    // into project B's source, which is what export and render read.
    await expect
      .poll(() => stateContent(page), { timeout: WRITE_BACK_TIMEOUT })
      .toContain(MARKER_B);
    expect(await stateContent(page)).not.toContain('EDIT_TO_PROJECT_A');
    await expect(editor).not.toContainText('EDIT_TO_PROJECT_A');
  });

  test('load-guard: unsaved edits are not discarded without asking', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await bootstrap(page);
    await loadProject(page, FIXTURE_A);
    const editor = await openEditor(page);

    await appendToEditor(page, editor, '\n// MY_UNSAVED_WORK');
    await expect(editor).toContainText('MY_UNSAVED_WORK');

    await page.locator('#fileInput').setInputFiles(FIXTURE_B);

    const dialog = page.locator('.confirm-modal');
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(dialog).toHaveAttribute('role', 'alertdialog');
    await dialog.getByRole('button', { name: 'Keep editing' }).click();

    await expect(editor).toContainText('MY_UNSAVED_WORK');
    await expect(editor).not.toContainText(MARKER_B);
    await expect
      .poll(() => stateContent(page), { timeout: WRITE_BACK_TIMEOUT })
      .toContain('MY_UNSAVED_WORK');
  });

  test('dirty-indicator: a load leaves it clean, typing sets it, saving clears it', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await bootstrap(page);

    await page.locator('#fileInput').setInputFiles(FIXTURE_A);
    await expect(page.locator('#mainInterface')).toBeVisible({
      timeout: 30_000,
    });
    // Save the project so File > Save updates it instead of prompting.
    await page.locator('#saveProjectCheckbox').waitFor({ timeout: 10_000 });
    await page.locator('#saveProjectCheckbox').check();
    await page.locator('#saveProjectSave').click();
    await expect(page.locator('.save-project-modal')).toHaveCount(0, {
      timeout: 10_000,
    });

    const editor = await openEditor(page);
    const dot = page.locator('#editorDirtyIndicator');

    // Loading is not an edit: the dot stays hidden until the user types.
    await expect(dot).toHaveAttribute('aria-hidden', 'true');

    await appendToEditor(page, editor, '\n// SAVED_EDIT');
    await expect(dot).toHaveAttribute('aria-hidden', 'false');

    await page.keyboard.press('Control+s');
    await expect(dot).toHaveAttribute('aria-hidden', 'true', {
      timeout: 15_000,
    });
    expect(await stateContent(page)).toContain('SAVED_EDIT');
  });

  test('typing letters that are also shortcuts reaches the document', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await bootstrap(page);
    await loadProject(page, FIXTURE_A);

    const editor = await openEditor(page);

    // Count activations of the destructive one rather than inspecting the
    // parameter panel, which the editor hides.
    await page.evaluate(() => {
      window.__resetClicks = 0;
      document
        .getElementById('resetBtn')
        ?.addEventListener('click', () => (window.__resetClicks += 1));
    });
    expect(await page.evaluate(() => typeof window.__resetClicks)).toBe(
      'number'
    );

    // r/d/g are bare global shortcuts (reset, download, generate). Their
    // guard checked tag names only, so CodeMirror's contenteditable div
    // lost these keystrokes — and 'r' reset every parameter.
    await appendToEditor(page, editor, '\n// rotate difference group');
    await expect(editor).toContainText('// rotate difference group');

    // 'r' must not have fired Reset Parameters
    expect(await page.evaluate(() => window.__resetClicks)).toBe(0);
  });

  test('post-edit preview keeps the camera where the user put it (D-11)', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await bootstrap(page);
    await loadProject(page, FIXTURE_A);
    await expect(page.locator('.preview-state-indicator')).toContainText(
      'Preview ready',
      { timeout: 180_000 }
    );

    // Standard mode so the full menu bar is available
    await page.locator('#uiModeToggle').click();

    const readDistance = async () => {
      await page.locator('#editMenuBtn').click();
      await page.getByRole('menuitem', { name: 'Copy Viewport Distance' }).click();
      return (await page.evaluate(() => navigator.clipboard.readText())).trim();
    };

    // Zoom, so the camera sits where the user put it, not at the fit default
    await page.locator('#viewMenuBtn').click();
    await page.getByRole('menuitem', { name: 'Zoom In' }).click();
    await page.waitForTimeout(500);
    const distanceBefore = await readDistance();
    expect(Number(distanceBefore)).toBeGreaterThan(0);

    await page.locator('#expertModeToggle').click();
    const editor = page.locator('#expertModeBody .cm-content').first();
    await expect(editor).toBeVisible({ timeout: 15_000 });
    await appendToEditor(page, editor, '\ntranslate([0,0,90]) sphere(20);');
    await expect(editor).toContainText('sphere(20);');

    await page.locator('#expertRunPreviewBtn').click();
    await expect(page.locator('.preview-state-indicator')).toContainText(
      'Preview ready',
      { timeout: 180_000 }
    );

    // The model grew a lot. Re-fitting would move the camera and throw away
    // a zoomed-in user's working position, so the distance must not change.
    expect(await readDistance()).toBe(distanceBefore);
  });
});
