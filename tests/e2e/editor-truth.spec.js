import { test, expect } from '@playwright/test';

/**
 * The editor decides the model (UF-18, U-30).
 *
 * Every render used to pass `-D name=value` for every parameter in a schema
 * parsed once when the file loaded. Editing a parameter's default in the code
 * therefore reached the worker but was overridden by the stale `-D`, and the
 * model never moved. `editor-content-sync.spec.js` already pins that an edit
 * reaches `uploadedFile.content`; nothing pinned that the OUTPUT changed, so
 * the app shipped this for the editor's whole life.
 *
 * These assert on the produced geometry and on the compiler's own echo,
 * because those are the only witnesses that cannot agree with a stale value.
 *
 * @license GPL-3.0-or-later
 */

const WASM_READY_TIMEOUT = 180_000;
const RENDER_TIMEOUT = 120_000;

// The loop count is derived from `size`, so the parameter's live value shows
// up as a triangle count. A plain cube([size,size,size]) is 12 triangles at
// every size and could not tell a masked render from an applied one.
const BASE_SOURCE = [
  '/*[Dimensions]*/',
  'size = 10; // [5:50]',
  '',
  'echo(str("UF18_SIZE=", size));',
  '',
  '$fn = 16;',
  'for (i = [0 : floor(size / 10)]) {',
  '  translate([i * 15, 0, 0]) cube([10, 10, 10]);',
  '}',
  '',
].join('\n');

const EDITED_DEFAULT_SOURCE = BASE_SOURCE.replace(
  'size = 10; // [5:50]',
  'size = 40; // [5:50]'
);

const GEOMETRY_EDIT_SOURCE =
  BASE_SOURCE + 'translate([0, 0, 60]) sphere(r = 12, $fn = 48);\n';

const BASE_TRIANGLES = '24 triangles';
const EDITED_TRIANGLES = '60 triangles';

const FIXTURE = {
  name: 'uf18-editor-truth.scad',
  mimeType: 'text/plain',
  buffer: Buffer.from(BASE_SOURCE),
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
  });
});

async function loadFixture(page) {
  await page.goto('/');
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: WASM_READY_TIMEOUT,
  });
  await page.locator('#fileInput').setInputFiles(FIXTURE);
  await expect(page.locator('#mainInterface')).toBeVisible({ timeout: 30_000 });

  const notNow = page.locator('#saveProjectNotNow');
  try {
    await notNow.waitFor({ state: 'visible', timeout: 3_000 });
    await notNow.click();
  } catch {
    // Save-project modal did not appear; nothing to dismiss.
  }
  await expect(page.locator('.save-project-modal')).toHaveCount(0, {
    timeout: 10_000,
  });

  const toggle = page.locator('#uiModeToggle');
  await expect(toggle).toBeVisible({ timeout: 15_000 });
  if ((await toggle.getAttribute('aria-checked')) !== 'true') {
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
  }
}

async function enterClassic(page) {
  await expect(page.locator('#editMenuBtn')).toBeVisible({ timeout: 15_000 });
  await page.locator('#classicModeToggle').click();
  await expect(page.locator('body')).toHaveAttribute('data-ui-mode', 'classic', {
    timeout: 15_000,
  });
}

/** The first render must have landed before an edit can be shown to change it. */
async function waitForFirstPreview(page) {
  await expect(page.locator('#previewContainer')).toHaveClass(
    /preview-current/,
    { timeout: RENDER_TIMEOUT }
  );
  await expect(page.locator('#previewStatusStats')).toContainText(
    BASE_TRIANGLES,
    { timeout: RENDER_TIMEOUT }
  );
}

async function openForgeEditor(page) {
  await page.locator('#expertModeToggle').click();
  const editor = page.locator('#expertModeBody .cm-content').first();
  await expect(editor).toBeVisible({ timeout: 20_000 });
  return editor;
}

/** Replace the whole document in one transaction. */
async function replaceSource(page, editor, source) {
  await editor.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.insertText(source);
}

const statsText = (page) => page.locator('#previewStatusStats').textContent();
const echoText = (page) => page.locator('#echoMessages').textContent();

test.describe('The editor decides the model (UF-18)', () => {
  test('forge: an edited default changes the geometry, and a geometry edit still flows', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await loadFixture(page);
    await waitForFirstPreview(page);
    const editor = await openForgeEditor(page);

    // 1. The parameter default moves in code. The stale -D used to win here,
    //    leaving the model at 24 triangles while the code asked for 60.
    await replaceSource(page, editor, EDITED_DEFAULT_SOURCE);
    await page.locator('#expertRunPreviewBtn').click();

    await expect
      .poll(() => statsText(page), { timeout: RENDER_TIMEOUT })
      .toContain(EDITED_TRIANGLES);
    // The compiler's own report of the value it used.
    await expect.poll(() => echoText(page), { timeout: 15_000 }).toContain(
      'UF18_SIZE=40'
    );

    // 2. A geometry edit was never masked by -D; keep it that way.
    await replaceSource(page, editor, GEOMETRY_EDIT_SOURCE);
    await page.locator('#expertRunPreviewBtn').click();
    await expect
      .poll(() => statsText(page), { timeout: RENDER_TIMEOUT })
      .toContain('2,324 triangles');
  });

  test('classic: an edited default changes the geometry', async ({ page }) => {
    test.setTimeout(300_000);
    await loadFixture(page);
    await enterClassic(page);
    await waitForFirstPreview(page);

    const editor = page.locator('#expertModeBody .cm-content').first();
    await expect(editor).toBeVisible({ timeout: 20_000 });
    await replaceSource(page, editor, EDITED_DEFAULT_SOURCE);
    await page.locator('#classicPreviewBtn').click();

    await expect
      .poll(() => statsText(page), { timeout: RENDER_TIMEOUT })
      .toContain(EDITED_TRIANGLES);
    await expect.poll(() => echoText(page), { timeout: 15_000 }).toContain(
      'UF18_SIZE=40'
    );
  });

  test('a value the user set still beats a later code edit to the same parameter', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await loadFixture(page);
    await enterClassic(page);
    await waitForFirstPreview(page);

    // Set the parameter by hand. Classic shows the editor and the Customizer
    // together, so both halves of the claim are observable on one screen.
    const group = page
      .locator('#parametersContainer details.param-group')
      .first();
    if ((await group.count()) > 0 && !(await group.evaluate((el) => el.open))) {
      await group.locator('summary').click();
    }
    const sizeInput = page
      .locator('#parametersContainer input[type="number"]')
      .first();
    await sizeInput.waitFor({ state: 'visible', timeout: 20_000 });
    await sizeInput.fill('33');
    await sizeInput.blur();
    await expect
      .poll(() => echoText(page), { timeout: RENDER_TIMEOUT })
      .toContain('UF18_SIZE=33');

    // Now move the SAME parameter's default in code. The user's choice wins,
    // in the render and in the control.
    const editor = page.locator('#expertModeBody .cm-content').first();
    await replaceSource(
      page,
      editor,
      BASE_SOURCE.replace('size = 10; // [5:50]', 'size = 44; // [5:50]')
    );
    await page.locator('#classicPreviewBtn').click();

    await expect
      .poll(() => echoText(page), { timeout: RENDER_TIMEOUT })
      .toContain('UF18_SIZE=33');
    await expect(sizeInput).toHaveValue('33');
  });

  test('D-29: Render publishes an edit typed a moment earlier', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await loadFixture(page);
    await waitForFirstPreview(page);
    const editor = await openForgeEditor(page);

    // Type and press Render immediately, inside the 500 ms write-back window.
    // runFullRender read state without publishing first, so this was a race:
    // measured 1-in-5 for the Classic toolbar's Render before the fix.
    await editor.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.insertText('\necho("UF18_RENDER_MARKER");');
    await page.locator('#primaryActionBtn').click();

    await expect
      .poll(() => page.locator('#console-output').textContent(), {
        timeout: RENDER_TIMEOUT,
      })
      .toContain('UF18_RENDER_MARKER');
  });
});
