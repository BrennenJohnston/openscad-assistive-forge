import { test, expect } from '@playwright/test';
import path from 'path';

// Editor line wrapping (P2).
//
// Desktop OpenSCAD wraps at word boundaries by default and prints the line
// number once per logical line, against the first visual row. Ours had no
// wrapping extension at all, so long lines ran off the right edge of the
// editor pane and had to be scrolled to horizontally.
//
// Measured on the real 1,017-line fixture, because the behaviour only shows
// on lines longer than the pane: sample.scad has none.

const FIXTURE = path.join(
  process.cwd(),
  'tests',
  'fixtures',
  'universal-cuff',
  'universal_cuff_utensil_holder.scad'
);

// Line 4 of the fixture: 69 characters, far wider than the Classic editor
// pane, and the same line the desktop reference screenshot shows wrapped.
const WRAPPING_LINE =
  '// To the extent possible under law, the author(s) have dedicated all';
// Line 7: short, unique, and a reliable one-row height reference.
const SHORT_LINE = '// warranty.';

const WASM_READY_TIMEOUT = 180_000;

test.use({ viewport: { width: 1920, height: 1080 } });

test.describe('Editor line wrapping (P2)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('openscad-forge-first-visit-seen', 'true');
      localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
    });
  });

  test('editor-wrap: a long line occupies more than one visual row, numbered once', async ({
    page,
  }) => {
    test.setTimeout(240_000);

    await page.goto('/');
    await page.waitForSelector('body[data-wasm-ready="true"]', {
      state: 'attached',
      timeout: WASM_READY_TIMEOUT,
    });

    await page.locator('#fileInput').setInputFiles(FIXTURE);
    await expect(page.locator('#mainInterface')).toBeVisible({
      timeout: 30_000,
    });
    const notNowBtn = page.locator('#saveProjectNotNow');
    try {
      await notNowBtn.waitFor({ state: 'visible', timeout: 3_000 });
      await notNowBtn.click();
    } catch {
      // Save-project modal did not appear; nothing to dismiss.
    }

    // Classic opens in Simplified, which hides the editor slot by design.
    await page.locator('#classicModeToggle').click();
    const densityToggle = page.locator('#classicDensityToggle');
    if ((await densityToggle.getAttribute('aria-checked')) !== 'true') {
      await densityToggle.click();
    }
    await expect(page.locator('body')).toHaveAttribute(
      'data-classic-density',
      'standard'
    );
    await expect(
      page.locator('#classicEditorSlot .cm-content')
    ).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(500);

    const measured = await page.evaluate(
      ({ wrappingLine, shortLine }) => {
        const slot = document.getElementById('classicEditorSlot');
        const scroller = slot.querySelector('.cm-scroller');
        const lineFor = (text) =>
          Array.from(slot.querySelectorAll('.cm-line')).find(
            (el) => el.textContent.trim() === text
          );

        const long = lineFor(wrappingLine);
        const short = lineFor(shortLine);

        // CodeMirror's line-number gutter carries a hidden spacer sized to
        // the widest number; it is not one of the rendered rows.
        const numbers = Array.from(
          slot.querySelectorAll('.cm-lineNumbers .cm-gutterElement')
        )
          .filter((el) => /^\d+$/.test(el.textContent.trim()))
          .filter((el) => el.getBoundingClientRect().height > 0)
          .map((el) => ({
            n: Number(el.textContent.trim()),
            top: Math.round(el.getBoundingClientRect().top),
          }));

        return {
          longHeight: long ? Math.round(long.getBoundingClientRect().height) : null,
          longTop: long ? Math.round(long.getBoundingClientRect().top) : null,
          shortHeight: short
            ? Math.round(short.getBoundingClientRect().height)
            : null,
          scrollWidth: scroller.scrollWidth,
          clientWidth: scroller.clientWidth,
          numbers: numbers.slice(0, 12),
          duplicateNumbers:
            numbers.length !== new Set(numbers.map((x) => x.n)).size,
          lineFourTop:
            numbers.find((x) => x.n === 4)?.top ?? null,
        };
      },
      { wrappingLine: WRAPPING_LINE, shortLine: SHORT_LINE }
    );

    console.log('[editor-wrap] measured:', JSON.stringify(measured, null, 2));

    expect(measured.longHeight, 'the long line was not rendered').not.toBeNull();
    expect(measured.shortHeight, 'the short line was not rendered').not.toBeNull();

    // Wraps: the long line is at least two rows tall.
    expect(
      measured.longHeight,
      `line 4 is ${measured.longHeight}px tall against a ${measured.shortHeight}px row, so it is not wrapping`
    ).toBeGreaterThanOrEqual(measured.shortHeight * 2);

    // Numbered once per logical line, not once per visual row.
    expect(
      measured.duplicateNumbers,
      'a line number was rendered more than once'
    ).toBe(false);
    expect(
      measured.numbers.map((x) => x.n),
      'gutter numbers are not sequential from 1'
    ).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

    // The number sits against the first visual row of its line (desktop
    // behaviour), not centred over the wrapped block.
    expect(
      Math.abs(measured.lineFourTop - measured.longTop),
      "line 4's number is not aligned to the first row of the line"
    ).toBeLessThanOrEqual(measured.shortHeight);

    // WCAG 1.4.10: no horizontal scrolling to read code.
    expect(
      measured.scrollWidth,
      `the editor still scrolls horizontally (${measured.scrollWidth}px of content in ${measured.clientWidth}px)`
    ).toBeLessThanOrEqual(measured.clientWidth + 1);
  });
});
