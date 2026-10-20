import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// When the engine itself may be at fault, the error dialog offers another
// engine: the newest official one first, and when that fails too, the older
// official snapshots or the Forge engine again. A damaged engine binary makes
// the start fail. No model is known to break any of the engines, so for a
// render the worker's answer is replaced, for the renders a case asks for,
// by the error an engine fault sends; everything around it is the app's own.
// The official engines are served from public/wasm/engines/, which
// npm run setup-wasm writes.

const WASM_READY_TIMEOUT = 180_000;
const NEWEST = 'official-2026-10-18';
const DAMAGED = 'a damaged engine';
const FIRST_OFFER =
  'This may be a fault in the rendering engine rather than in the model. You can try the official OpenSCAD engine (snapshot 2026.10.18, about 3.4 MB to download, 11.1 MB kept in this browser).';
const SECOND_OFFER =
  'The official engine failed on this model too. The other three official snapshots are here to try, or you can go back to the Forge engine.';
const SNAPSHOT_ROWS = [
  /^OpenSCAD snapshot 2026\.04\.03 \(official\), \d+\.\d MB$/,
  /^OpenSCAD snapshot 2026\.01\.03 \(official\), \d+\.\d MB$/,
  /^OpenSCAD snapshot 2025\.03\.25 \(official\), \d+\.\d MB$/,
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
  });
});

/** Every build line the engine logs, and every text the status line shows. */
async function watch(page) {
  const seen = { builds: [], status: [] };
  page.on('console', (message) => {
    const m = /WASM build: (.*)$/.exec(message.text());
    if (m) seen.builds.push(m[1]);
  });
  await page.exposeFunction('__statusSeen', (text) => seen.status.push(text));
  await page.addInitScript(() => {
    new MutationObserver(() => {
      const area = document.getElementById('statusArea');
      if (area) window.__statusSeen(area.textContent);
    }).observe(document, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  });
  return seen;
}

/**
 * Answer an engine binary with damaged bytes while `state.damaged` holds;
 * `state.passFirst` lets that many requests through first.
 */
async function damage(context, folder, state) {
  let seen = 0;
  await context.route(
    (url) => url.pathname.endsWith(`/wasm/${folder}/openscad.wasm`),
    (route) => {
      seen += 1;
      return state.damaged && seen > (state.passFirst ?? 0)
        ? route.fulfill({
            status: 200,
            contentType: 'application/wasm',
            body: Buffer.from(DAMAGED),
          })
        : route.continue();
    }
  );
}

/**
 * The next `window.__engineFaults` render requests are answered, in place of
 * the worker, with the error a CGAL assertion inside the engine sends.
 */
async function standInEngineFaults(page) {
  await page.addInitScript(() => {
    window.__engineFaults = 0;
    const RealWorker = window.Worker;
    window.Worker = class extends RealWorker {
      postMessage(message, ...rest) {
        if (message?.type === 'RENDER' && window.__engineFaults > 0) {
          window.__engineFaults -= 1;
          const { requestId } = message.payload;
          setTimeout(() =>
            this.onmessage?.({
              data: {
                type: 'ERROR',
                payload: {
                  requestId,
                  code: 'CGAL_ASSERTION',
                  message: 'CGAL ERROR: assertion violation',
                  details: 'CGAL ERROR: assertion violation',
                  needsRestart: true,
                },
              },
            })
          );
          return;
        }
        super.postMessage(message, ...rest);
      }
    };
  });
}

const errorDialog = (page) =>
  page.locator('[data-testid="friendly-error-modal"]').first();

async function dismissSavePrompt(page) {
  const notNow = page.locator('#saveProjectNotNow');
  if (
    await notNow.waitFor({ state: 'visible', timeout: 3_000 }).then(
      () => true,
      () => false
    )
  ) {
    await notNow.click();
  }
}

async function expectPreviewCurrent(page) {
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: WASM_READY_TIMEOUT,
  });
  await expect(page.locator('.preview-state-indicator')).toHaveClass(
    /state-current/,
    { timeout: 90_000 }
  );
}

const buttonsOf = (dialog) =>
  dialog.locator('.friendly-error-modal-footer button');

const enginePath = (page) =>
  page.evaluate(() => window.__forgeEngineChoice.enginePath());

const chosenId = (page) =>
  page.evaluate(() => window.__forgeEngineChoice.chosenId());

/** Open the box, wait for its preview, and fail the next `count` renders. */
async function openBoxThenFail(page, count) {
  await page.goto('/?example=simple-box', { timeout: 60_000 });
  await dismissSavePrompt(page);
  await expectPreviewCurrent(page);
  await page.evaluate((n) => (window.__engineFaults = n), count);
}

/** Press Generate and wait for the render's error dialog. */
async function generateAndFail(page) {
  await page.locator('#primaryActionBtn').click();
  const dialog = errorDialog(page);
  await expect(dialog).toBeVisible({ timeout: 120_000 });
  return dialog;
}

test.describe('another engine after an engine fault', () => {
  test('a damaged engine at the start: the dialog offers the newest official engine, which starts and draws', async ({
    page,
    context,
  }) => {
    test.setTimeout(WASM_READY_TIMEOUT * 2);
    const seen = await watch(page);
    await damage(context, 'openscad-official', { damaged: true });

    await page.goto('/?example=simple-box', { timeout: 60_000 });
    const dialog = errorDialog(page);
    await expect(dialog).toBeVisible({ timeout: WASM_READY_TIMEOUT });
    await expect(dialog).toContainText('Engine Initialization Failed');
    await expect(dialog).toContainText(FIRST_OFFER);
    await expect(buttonsOf(dialog)).toHaveText([
      'Download and try it',
      'Not now',
    ]);
    await expect(dialog.getByRole('button', { name: 'Not now' })).toBeFocused();

    // The dialog with its offer passes the WCAG 2.2 A and AA rules, and the
    // rule that a control's visible words are in its name.
    const results = await new AxeBuilder({ page })
      .options({ rules: { 'label-content-name-mismatch': { enabled: true } } })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .include('[data-testid="friendly-error-modal"]')
      .analyze();
    expect(
      results.violations.map(
        (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`
      )
    ).toEqual([]);

    // Reached and pressed from the keyboard.
    await page.keyboard.press('Shift+Tab');
    await expect(
      dialog.getByRole('button', { name: 'Download and try it' })
    ).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(dialog).toHaveCount(0);

    await dismissSavePrompt(page);
    await expectPreviewCurrent(page);
    expect(await enginePath(page)).toBe(`/wasm/engines/${NEWEST}`);
    expect(seen.builds.join(' ')).toMatch(/OpenSCAD snapshot 2026\.10\.18/);
    expect(seen.status).toContainEqual(
      expect.stringMatching(
        /^Downloading the OpenSCAD snapshot 2026\.10\.18 engine: \d+%$/
      )
    );
    expect(seen.status).toContain(
      'Trying the model again with the OpenSCAD snapshot 2026.10.18 engine.'
    );
  });

  test('when the official engine fails too: the other snapshots, and Back to the Forge engine starts it again', async ({
    page,
    context,
  }) => {
    test.setTimeout(WASM_READY_TIMEOUT * 3);
    const seen = await watch(page);
    const forge = { damaged: true };
    // The download's own request passes; the engine's start gets damaged
    // bytes.
    const official = { damaged: true, passFirst: 1 };
    await damage(context, 'openscad-official', forge);
    await damage(context, `engines/${NEWEST}`, official);

    await page.goto('/?example=simple-box', { timeout: 60_000 });
    const first = errorDialog(page);
    await expect(first).toContainText(FIRST_OFFER, {
      timeout: WASM_READY_TIMEOUT,
    });
    await first.getByRole('button', { name: 'Download and try it' }).click();

    const second = errorDialog(page);
    await expect(second).toContainText(SECOND_OFFER, {
      timeout: WASM_READY_TIMEOUT,
    });
    await expect(second).toContainText('Engine Initialization Failed');
    await expect(buttonsOf(second)).toHaveText([
      ...SNAPSHOT_ROWS,
      'Back to the Forge engine',
      'Keep the official engine',
    ]);
    await expect(
      second.getByRole('button', { name: 'Keep the official engine' })
    ).toBeFocused();
    expect(await chosenId(page)).toBe(NEWEST);

    forge.damaged = false;
    official.damaged = false;
    await second
      .getByRole('button', { name: 'Back to the Forge engine' })
      .click();
    await dismissSavePrompt(page);
    await expectPreviewCurrent(page);
    expect(await enginePath(page)).toBe('/wasm/openscad-official');
    expect(await chosenId(page)).toBe('forge');
    expect(seen.builds.at(-1)).toMatch(/\+forge\.3/);
  });

  test('a failed render: the offer, the same render again on the official engine, the other snapshots, and Back renders', async ({
    page,
  }) => {
    test.setTimeout(WASM_READY_TIMEOUT * 3);
    await standInEngineFaults(page);
    await openBoxThenFail(page, 2);

    const first = await generateAndFail(page);
    await expect(first).toContainText(FIRST_OFFER);
    await first.getByRole('button', { name: 'Download and try it' }).click();

    // The same render runs again on the official engine and fails again.
    const second = errorDialog(page);
    await expect(second).toContainText(SECOND_OFFER, { timeout: 180_000 });
    expect(await enginePath(page)).toBe(`/wasm/engines/${NEWEST}`);
    await expect(buttonsOf(second)).toHaveText([
      ...SNAPSHOT_ROWS,
      'Back to the Forge engine',
      'Keep the official engine',
    ]);

    // Back on the Forge engine the same render runs once more, and works.
    await second
      .getByRole('button', { name: 'Back to the Forge engine' })
      .click();
    await expect(page.locator('#primaryActionBtn')).toHaveAttribute(
      'data-action',
      'download',
      { timeout: 180_000 }
    );
    await expect(errorDialog(page)).toHaveCount(0);
    expect(await enginePath(page)).toBe('/wasm/openscad-official');
    expect(await chosenId(page)).toBe('forge');
  });

  test('Not now holds for the file: the next failure has no offer, and a new file offers again', async ({
    page,
  }) => {
    test.setTimeout(WASM_READY_TIMEOUT * 2);
    await standInEngineFaults(page);
    await openBoxThenFail(page, 2);

    const first = await generateAndFail(page);
    await expect(first).toContainText(FIRST_OFFER);
    await first.getByRole('button', { name: 'Not now' }).click();
    await expect(first).toHaveCount(0);
    // Back on the button that started the render, not the page body.
    await expect(page.locator('#primaryActionBtn')).toBeFocused();
    expect(
      await page.evaluate(() =>
        window.__forgeEngineChoice.isDownloaded('official-2026-10-18')
      )
    ).toBe(false);

    const plain = await generateAndFail(page);
    await expect(plain).not.toContainText('rendering engine rather than');
    await expect(buttonsOf(plain)).toHaveText(['OK']);
    await plain.getByRole('button', { name: 'OK' }).click();
    await expect(plain).toHaveCount(0);
    await expect(page.locator('#primaryActionBtn')).toBeFocused();

    await page.locator('#fileInput').setInputFiles({
      name: 'plate.scad',
      mimeType: 'text/plain',
      buffer: Buffer.from('cube([20, 20, 2]);\n'),
    });
    await dismissSavePrompt(page);
    await expect(page.locator('.preview-state-indicator')).toHaveClass(
      /state-current/,
      { timeout: 90_000 }
    );
    await page.evaluate(() => (window.__engineFaults = 1));
    const again = await generateAndFail(page);
    await expect(again).toContainText(FIRST_OFFER);
  });
});
