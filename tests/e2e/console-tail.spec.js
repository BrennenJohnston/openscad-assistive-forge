import { test, expect } from '@playwright/test';
import path from 'path';

// UF-19 (U-31) — the console shows its newest output, in both interfaces.
//
// The repo's first Classic console coverage. Until UF-19 no spec looked at the
// Classic console at all, which is how it shipped showing nothing: the Log
// view's box carried a fixed max-height, the Classic pane clipped it, and the
// scroll-to-newest drove every arriving message into the clipped part (D-27).
//
// Presence is not the assertion here — console-fidelity.spec.js already covers
// what reaches the log. These cases assert POSITION: that the newest line is
// inside the box a reader is looking at, that in Classic the box is inside the
// pane, and that a reader who has scrolled up is not yanked back.

const MANY_ECHO = path.join(
  process.cwd(),
  'tests',
  'fixtures',
  'console-many-echo.scad'
);

const WASM_READY_TIMEOUT = 180_000;
const PREVIEW_TIMEOUT = 120_000;
const NEWEST = 'tail-newest-marker';

/** Distance from the bottom still counted as "showing the newest line". */
const TAIL_SLACK = 4;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
  });
});

async function loadProject(page) {
  await page.goto('/');
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: WASM_READY_TIMEOUT,
  });

  await page.locator('#fileInput').setInputFiles(MANY_ECHO);
  await expect(page.locator('#welcomeScreen')).toBeHidden({ timeout: 30_000 });
  await expect(page.locator('#mainInterface')).toBeVisible({ timeout: 10_000 });

  const notNowBtn = page.locator('#saveProjectNotNow');
  try {
    await notNowBtn.waitFor({ state: 'visible', timeout: 3_000 });
    await notNowBtn.click();
  } catch {
    // Save-project modal did not appear; nothing to dismiss.
  }

  // The console is hidden in Simplified; Standard is where it lives.
  const toggle = page.locator('#uiModeToggle');
  await expect(toggle).toBeVisible({ timeout: 10_000 });
  if ((await toggle.getAttribute('aria-checked')) !== 'true') {
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
  }
}

async function openConsolePanel(page) {
  const details = page.locator('#consolePanel');
  if (!(await details.evaluate((el) => el.open))) {
    await details.locator('summary').click();
  }
  await expect(page.locator('#console-output')).toBeVisible();
}

async function waitForNewestLine(page) {
  await expect
    .poll(() => page.locator('#console-output').textContent(), {
      timeout: PREVIEW_TIMEOUT,
    })
    .toContain(NEWEST);
}

/**
 * Where the log is scrolled to, and whether its last entry is inside the box.
 * `paneSelector` additionally reports whether the box itself is inside the
 * pane that holds it, which is the Classic failure D-27 named.
 */
function readLogGeometry(page, paneSelector = null) {
  return page.evaluate((pane) => {
    const out = document.getElementById('console-output');
    const entries = [...out.querySelectorAll('.console-entry')];
    const last = entries[entries.length - 1];
    const outRect = out.getBoundingClientRect();
    const lastRect = last?.getBoundingClientRect();

    // Two consecutive entries, to catch injected blank lines between them.
    let gapBetweenEntries = null;
    if (entries.length >= 2) {
      const a = entries[entries.length - 2].getBoundingClientRect();
      gapBetweenEntries = Math.round(lastRect.top - a.bottom);
    }

    let logBottomBeyondPane = null;
    if (pane) {
      const paneEl = document.querySelector(pane);
      if (paneEl) {
        logBottomBeyondPane = Math.round(
          outRect.bottom - paneEl.getBoundingClientRect().bottom
        );
      }
    }

    return {
      distanceFromTail: Math.round(
        out.scrollHeight - out.scrollTop - out.clientHeight
      ),
      scrollTop: Math.round(out.scrollTop),
      entryCount: entries.length,
      lastEntryText: last?.textContent?.trim() ?? null,
      newestLineInsideBox: lastRect
        ? lastRect.top >= outRect.top - 1 && lastRect.bottom <= outRect.bottom + 1
        : false,
      gapBetweenEntries,
      logBottomBeyondPane,
      boxHeight: Math.round(outRect.height),
    };
  }, paneSelector);
}

test.describe('Console shows its newest output (UF-19, U-31)', () => {
  test('Assistive Forge: the log is scrolled to the newest line, single spaced', async ({
    page,
  }) => {
    test.setTimeout(240_000);

    await loadProject(page);
    await openConsolePanel(page);
    await waitForNewestLine(page);

    const geo = await readLogGeometry(page);

    // "Newest" is the last entry in the log, whatever it is. It is not the
    // echo marker: OpenSCAD prints its status lines (cache sizes, render time,
    // Facets) after the design's own echoes, and the desktop console shows
    // those too.
    expect(geo.lastEntryText, 'there is a newest entry').toBeTruthy();
    expect(
      geo.distanceFromTail,
      'the log is scrolled to its newest line'
    ).toBeLessThanOrEqual(TAIL_SLACK);
    expect(geo.newestLineInsideBox, 'the newest line is on screen').toBe(true);

    // The modal's stylesheet used to win on this element and gave it
    // white-space: pre-wrap, which rendered the entry generator's own
    // indentation as three blank lines between every message (63px measured).
    expect(
      geo.gapBetweenEntries,
      'no blank lines are injected between messages'
    ).toBeLessThanOrEqual(TAIL_SLACK);
  });

  test('Classic: the pane shows output and the newest line is inside it', async ({
    page,
  }) => {
    test.setTimeout(240_000);

    // A defined window, not whatever the lane defaults to. The Classic console
    // pane is a fixed slice of the window, and its filter row takes a fixed
    // amount off the top of that slice, so how many lines the log gets depends
    // on the window's HEIGHT. At 1280x720 with the wider fonts of a Linux CI
    // runner the filter row wraps to three rows and leaves the log less than
    // one line — a real residual of the pane's chrome density, reported to the
    // owner rather than tuned away here, and not what this case is about.
    await page.setViewportSize({ width: 1400, height: 900 });

    await loadProject(page);
    await waitForNewestLine(page);

    await page.locator('#classicModeToggle').click();
    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'classic',
      { timeout: 20_000 }
    );
    await expect(page.locator('#classicConsoleSlot')).toBeVisible({
      timeout: 20_000,
    });

    // The dock resizes the log, and following the tail has to survive that.
    await expect
      .poll(async () => (await readLogGeometry(page)).distanceFromTail, {
        timeout: 20_000,
        intervals: [250],
      })
      .toBeLessThanOrEqual(TAIL_SLACK);

    const geo = await readLogGeometry(page, '#classicConsoleSlot');

    expect(geo.entryCount, 'the pane has output in it').toBeGreaterThan(0);
    expect(geo.boxHeight, 'the log has a readable height').toBeGreaterThan(0);
    expect(
      geo.logBottomBeyondPane,
      'the log box does not hang out of the pane, where nothing can scroll to it'
    ).toBeLessThanOrEqual(0);
    expect(geo.newestLineInsideBox, 'the newest line is on screen').toBe(true);
    await expect(
      page.locator('#console-output'),
      "the design's own echoes reached the Classic pane"
    ).toContainText(NEWEST);

    // Narrowing the window re-wraps the lines and shrinks the box, which fires
    // a scroll event of its own. Reading that as the reader scrolling up turned
    // following off for good, so the pane sat on old output from then on.
    await page.setViewportSize({ width: 1024, height: 768 });
    await expect
      .poll(async () => (await readLogGeometry(page)).distanceFromTail, {
        timeout: 20_000,
        intervals: [250],
      })
      .toBeLessThanOrEqual(TAIL_SLACK);
  });

  test('Classic: arriving output does not close an open dock menu', async ({
    page,
  }) => {
    test.setTimeout(240_000);

    // The log follows its newest line by scrolling itself, and the dock's move
    // menus dismissed on any scroll anywhere in the app — a capturing window
    // listener that could not tell a pane scrolling its own content from the
    // page moving under the menu. Output arriving while a menu was open closed
    // it and threw focus back to the button mid-keystroke.
    await loadProject(page);
    await waitForNewestLine(page);

    await page.locator('#classicModeToggle').click();
    await expect(page.locator('body')).toHaveAttribute(
      'data-ui-mode',
      'classic',
      { timeout: 20_000 }
    );
    await expect(page.locator('#classicConsoleSlot')).toBeVisible({
      timeout: 20_000,
    });

    const menuBtn = page.getByRole('button', {
      name: 'Move Error-Log',
      exact: true,
    });
    await menuBtn.click();
    await expect(menuBtn).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.classic-panel-menu')).toBeVisible();

    await page.evaluate(() =>
      window.updateConsoleOutput('ECHO: "tail-arrived-with-menu-open"')
    );
    await page.waitForTimeout(600);

    await expect(
      page.locator('.classic-panel-menu'),
      'the menu is still open'
    ).toBeVisible();
    await expect(menuBtn).toHaveAttribute('aria-expanded', 'true');
    expect(
      await page.evaluate(
        () => document.activeElement?.getAttribute('role') === 'menuitem'
      ),
      'focus is still inside the menu'
    ).toBe(true);
  });

  test('a reader who has scrolled up is not dragged back by arriving output', async ({
    page,
  }) => {
    test.setTimeout(240_000);

    await loadProject(page);
    await openConsolePanel(page);
    await waitForNewestLine(page);

    // Scroll up to read something, the way a reader would.
    await page.evaluate(() => {
      document.getElementById('console-output').scrollTop = 100;
    });
    await page.waitForTimeout(300);

    // A second render arrives while they are reading.
    const firstGroup = page.locator('details.param-group').first();
    await expect(firstGroup).toBeVisible({ timeout: 15_000 });
    if (!(await firstGroup.evaluate((el) => el.open))) {
      await firstGroup.locator('summary').click();
    }
    const sizeInput = page.locator('.param-group input[type="number"]').first();
    await expect(sizeInput).toBeVisible({ timeout: 15_000 });
    await sizeInput.fill('20');
    await sizeInput.blur();

    await expect(page.locator('#console-output')).toContainText(
      '── Render 2 ──',
      { timeout: PREVIEW_TIMEOUT }
    );
    await page.waitForTimeout(500);

    const held = await readLogGeometry(page);
    expect(held.scrollTop, 'their place in the log is kept').toBe(100);

    // Scrolling back to the bottom resumes following the newest line.
    await page.evaluate(() => {
      const out = document.getElementById('console-output');
      out.scrollTop = out.scrollHeight;
    });
    await page.waitForTimeout(300);
    await page.evaluate(() =>
      window.updateConsoleOutput('ECHO: "tail-after-resume"')
    );
    await expect
      .poll(async () => (await readLogGeometry(page)).distanceFromTail, {
        timeout: 20_000,
        intervals: [250],
      })
      .toBeLessThanOrEqual(TAIL_SLACK);
  });
});
