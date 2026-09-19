import { test, expect } from '@playwright/test';
import path from 'path';

// Console fidelity (C4.3) — desktop-parity contract for the console log:
//   1. Litmus: a missing include file must surface "Can't open include file".
//   2. Append-only: a re-render never wipes the log; a "── Render N ──"
//      separator marks the new run and earlier output stays visible.

const ECHO_FIXTURE = path.join(
  process.cwd(),
  'tests',
  'fixtures',
  'console-echo.scad'
);
const MISSING_INCLUDE_FIXTURE = path.join(
  process.cwd(),
  'tests',
  'fixtures',
  'missing-include.scad'
);
const INVALID_SYNTAX_FIXTURE = path.join(
  process.cwd(),
  'tests',
  'fixtures',
  'invalid-syntax.scad'
);
/** The owner's real file — the one whose clean render was reported as an error. */
const UNIVERSAL_CUFF_FIXTURE = path.join(
  process.cwd(),
  'tests',
  'fixtures',
  'universal-cuff',
  'universal_cuff_utensil_holder.scad'
);

const WASM_READY_TIMEOUT = 180_000;
const PREVIEW_TIMEOUT = 120_000;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
  });
});

async function loadProject(page, fixturePath) {
  await page.goto('/');
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: WASM_READY_TIMEOUT,
  });

  await page.locator('#fileInput').setInputFiles(fixturePath);
  await expect(page.locator('#welcomeScreen')).toBeHidden({ timeout: 30_000 });
  await expect(page.locator('#mainInterface')).toBeVisible({ timeout: 10_000 });

  const notNowBtn = page.locator('#saveProjectNotNow');
  try {
    await notNowBtn.waitFor({ state: 'visible', timeout: 3_000 });
    await notNowBtn.click();
  } catch {
    // Save-project modal did not appear; nothing to dismiss.
  }

  // The console panel is hidden in Simplified mode; switch to Standard
  const toggle = page.locator('#uiModeToggle');
  await expect(toggle).toBeVisible({ timeout: 10_000 });
  if ((await toggle.getAttribute('aria-checked')) !== 'true') {
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
  }
}

async function waitForPreviewReady(page) {
  await expect(page.locator('.preview-state-indicator')).toHaveClass(
    /state-current/,
    { timeout: PREVIEW_TIMEOUT }
  );
}

/** The structured table lives in a hidden tabpanel until its tab is chosen. */
async function openStructuredView(page) {
  await page.locator('#console-tab-structured').click();
  await expect(page.locator('#console-view-structured')).toBeVisible();
}

async function openConsolePanel(page) {
  const details = page.locator('#consolePanel');
  if (!(await details.evaluate((el) => el.open))) {
    await details.locator('summary').click();
  }
  await expect(page.locator('#console-output')).toBeVisible();
}

test.describe('Console fidelity (C4.3)', () => {
  test('missing include file surfaces "Can\'t open include file"', async ({
    page,
  }) => {
    test.setTimeout(240_000);

    await loadProject(page, MISSING_INCLUDE_FIXTURE);

    // The warning may auto-expand the panel; open it if not
    await expect
      .poll(
        async () => {
          await openConsolePanel(page);
          return page.locator('#console-output').textContent();
        },
        { timeout: PREVIEW_TIMEOUT }
      )
      .toMatch(/can't open include file/i);
  });

  test('re-render appends with a separator instead of clearing the log', async ({
    page,
  }) => {
    test.setTimeout(240_000);

    await loadProject(page, ECHO_FIXTURE);
    await waitForPreviewReady(page);

    await openConsolePanel(page);
    await expect(page.locator('#console-output')).toContainText(
      'fidelity-marker',
      { timeout: 30_000 }
    );

    // Trigger a re-render by changing the size parameter
    const firstGroup = page.locator('details.param-group').first();
    await expect(firstGroup).toBeVisible({ timeout: 15_000 });
    if (!(await firstGroup.evaluate((el) => el.open))) {
      await firstGroup.locator('summary').click();
    }
    const sizeInput = page.locator('.param-group input[type="number"]').first();
    await expect(sizeInput).toBeVisible({ timeout: 15_000 });
    await sizeInput.fill('20');
    await sizeInput.blur();

    // Second run's echo arrives after the separator; the first run's echo
    // must still be present (append-only)
    await expect(page.locator('#console-output')).toContainText(
      '── Render 2 ──',
      { timeout: PREVIEW_TIMEOUT }
    );
    const echoCount = await page
      .locator('#console-output .console-entry--echo')
      .count();
    expect(echoCount, "both renders' echoes visible").toBeGreaterThanOrEqual(2);

    // Explicit Clear empties the log
    await page.locator('#console-clear-btn').click();
    await expect(page.locator('#console-output')).not.toContainText(
      'fidelity-marker'
    );
  });
});

// ─── P7: status chatter belongs to the Console, not the Error-Log ─────────────

test.describe('Renderer status routing (P7)', () => {
  test('a clean render fills the Console and leaves the Error-Log empty', async ({
    page,
  }) => {
    test.setTimeout(300_000);

    // The owner's real file. Its clean render is what the deployed site was
    // reporting as a red ERROR row — "Top level object is a 3D object
    // (manifold):" — while the Console read "No console output yet".
    await loadProject(page, UNIVERSAL_CUFF_FIXTURE);
    await waitForPreviewReady(page);
    await openConsolePanel(page);

    // The desktop's console shows the whole compile log. Ours dropped every
    // line it could not classify, so a clean render produced nothing at all.
    await expect
      .poll(() => page.locator('#console-output').textContent(), {
        timeout: PREVIEW_TIMEOUT,
      })
      .toMatch(/Top level object is a 3D object \(manifold\)/i);
    const consoleText = await page.locator('#console-output').textContent();
    for (const line of [/Geometries in cache/i, /Total rendering time/i]) {
      expect(consoleText, `console is missing ${line}`).toMatch(line);
    }

    // And the Error-Log has nothing to report, because nothing went wrong.
    const rows = await page.locator('#error-log-output tbody tr').count();
    const errorLogText = await page.locator('#error-log-output').textContent();
    expect(
      rows,
      `clean render produced ${rows} Error-Log row(s): ${errorLogText?.trim().slice(0, 200)}`
    ).toBe(0);
    expect(errorLogText).toMatch(/no errors/i);
  });

  test('a genuinely broken model still reports a real error', async ({
    page,
  }) => {
    test.setTimeout(300_000);

    // The other half of the same claim: quietening the status lines must not
    // quieten real ones.
    await loadProject(page, INVALID_SYNTAX_FIXTURE);
    await openConsolePanel(page);

    // Polled on the ROW COUNT, not on the text: "No errors. Compile or render
    // to check for issues." contains the word, so matching /error/i here was
    // satisfied by the empty state and measured nothing.
    await expect
      .poll(() => page.locator('#error-log-output tbody tr').count(), {
        timeout: PREVIEW_TIMEOUT,
      })
      .toBeGreaterThan(0);

    const row = page.locator('#error-log-output tbody tr').first();
    await expect(row).toContainText(/Parser error/i);
    // The line number is what makes the row worth having.
    await expect(row).toContainText('3');
    await expect(page.locator('#console-output')).toContainText(
      /Parser error/i
    );
  });
});

// ─── P7b: upstream column labels and the Show filter (U6b) ───────────────────

test.describe('Error-Log chrome (P7b)', () => {
  test('the columns read Group | File | Line | Info and Show narrows the table', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await loadProject(page, INVALID_SYNTAX_FIXTURE);
    await openConsolePanel(page);
    await expect
      .poll(() => page.locator('#error-log-output tbody tr').count(), {
        timeout: PREVIEW_TIMEOUT,
      })
      .toBeGreaterThan(0);

    // Upstream's headers (OpenSCAD_1).
    const headers = await page
      .locator('#error-log-output thead th')
      .allTextContents();
    expect(headers.map((h) => h.trim())).toEqual([
      'Group',
      'File',
      'Line',
      'Info',
    ]);

    // Owner-approved 2026-08-08: the Group cell keeps the severity word as well
    // as the group, so relabelling the column does not leave severity to the
    // red row colour alone (WCAG 1.4.1). "Group" alone would have done that.
    await openStructuredView(page);
    const groupCell = page.locator('#error-log-output tbody tr td').first();
    await expect(groupCell).toContainText('Error');
    // "Compile", not "Parse": parseLine reaches the ERROR: branch first, so
    // every prefixed error is grouped there whatever kind it is. Coarser than
    // upstream, pre-existing, and only now visible — asserted as it is rather
    // than as it ought to be, and reported to the owner instead.
    await expect(groupCell).toContainText('Compile');

    // The Show select: a real visible label, and every option can match a row.
    const select = page.locator('#error-log-show');
    await expect(select).toHaveValue('all');
    expect(
      (await select.locator('option').allTextContents()).map((t) => t.trim())
    ).toEqual(['All', 'Error', 'Warning', 'Deprecated', 'Trace']);
    // The <label for> is the accessible name — not an aria-label over the top.
    expect(
      await select.evaluate((el) => el.labels[0]?.textContent.trim())
    ).toBe('Show');

    // Narrowing to a type with no entries empties the table; back to All
    // restores it. This is the assertion that would catch a control that looks
    // right and does nothing.
    await select.selectOption('warning');
    await expect
      .poll(() => page.locator('#error-log-output tbody tr').count())
      .toBe(0);
    await select.selectOption('all');
    await expect
      .poll(() => page.locator('#error-log-output tbody tr').count())
      .toBeGreaterThan(0);
  });

  test('the Show control is not inside the live region', async ({ page }) => {
    test.setTimeout(300_000);
    await loadProject(page, UNIVERSAL_CUFF_FIXTURE);
    await openConsolePanel(page);
    await openStructuredView(page);
    await expect(page.locator('#error-log-show')).toBeVisible();

    // role="log" belongs to the rows, which change. A <select> rebuilt inside
    // one would be read out on every render — the reason the live region moved
    // off the wrapper and on to the entries.
    const placement = await page.evaluate(() => {
      const select = document.getElementById('error-log-show');
      const region = document.querySelector('.error-log-entries');
      return {
        selectInLiveRegion: Boolean(select.closest('[aria-live]')),
        regionRole: region?.getAttribute('role'),
        regionHasTable: Boolean(
          region?.querySelector('table, .error-log-empty')
        ),
        wrapperHasAriaLive: document
          .getElementById('error-log-output')
          .hasAttribute('aria-live'),
      };
    });
    expect(placement).toEqual({
      selectInLiveRegion: false,
      regionRole: 'log',
      regionHasTable: true,
      wrapperHasAriaLive: false,
    });
  });
});
