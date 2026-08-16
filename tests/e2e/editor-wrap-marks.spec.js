import { test, expect } from '@playwright/test';
import path from 'path';
import { readFileSync } from 'fs';

/**
 * UF-28 — wrapped lines tell you where they go (U-37 ¶3).
 *
 * The desktop hangs continuation rows four columns in and marks every row
 * that continues with a return arrow at the right border. This proves both,
 * proves each preference really governs its own mark, and proves that neither
 * mark reaches the document text or the accessibility tree — which is the
 * whole reason the indent is CSS and the arrow lives in a layer outside
 * `.cm-content`.
 *
 * Measured against the owner's own file, because the behaviour only shows on
 * lines longer than the pane and sample.scad has none.
 */

const FIXTURE = path.join(
  process.cwd(),
  'tests',
  'fixtures',
  'universal-cuff',
  'universal_cuff_utensil_holder.scad'
);

/** Line 4 of the fixture: 69 characters, far wider than the Classic pane. */
const WRAPPING_LINE = readFileSync(FIXTURE, 'utf-8').split(/\r?\n/)[3];

const WASM_READY_TIMEOUT = 180_000;

test.use({ viewport: { width: 1400, height: 1000 } });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
  });
});

/** Classic, standard density, the owner's file open, editor on screen. */
async function openClassicEditor(page) {
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
    // No save-project modal to dismiss.
  }

  // Classic opens in Simplified, which hides the editor slot by design.
  await page.locator('#classicModeToggle').click();
  const density = page.locator('#classicDensityToggle');
  if ((await density.getAttribute('aria-checked')) !== 'true') {
    await density.click();
  }
  await expect(page.locator('body')).toHaveAttribute(
    'data-classic-density',
    'standard'
  );
  await expect(page.locator('#classicEditorSlot .cm-content')).toBeVisible({
    timeout: 20_000,
  });
  await page.waitForTimeout(500);
}

/** Flip one Editor-tab checkbox through the real dialog, then close it. */
async function setEditorPref(page, id, on) {
  await page.locator('#editMenuBtn').click();
  await page
    .locator('#editMenuItems')
    .getByText('Preferences…', { exact: true })
    .click();
  await expect(page.locator('#preferencesModal')).not.toHaveClass(/hidden/);
  await page.locator('#prefs-tab-editor').click();

  const box = page.locator(`#${id}`);
  await expect(box).toBeEnabled();
  if (on) await box.check();
  else await box.uncheck();

  await page.locator('#preferencesModalDone').click();
  await expect(page.locator('#preferencesModal')).toHaveClass(/hidden/);
  await page.waitForTimeout(400);
}

/**
 * Wrap geometry as rendered. Rows are grouped into bands half a row apart:
 * a rect's `top` is the INLINE TEXT box, which line-height insets a couple of
 * pixels inside its row, so exact tops would split one row into two.
 */
async function readWrap(page) {
  return page.evaluate(() => {
    const root = document.querySelector('#classicEditorSlot');
    const first = root.querySelector('.cm-line');
    const rowHeight = first.getBoundingClientRect().height;
    const style = getComputedStyle(first);

    const rowsOf = (el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const bands = [];
      for (const r of Array.from(range.getClientRects()).sort(
        (a, b) => a.top - b.top
      )) {
        if (r.width === 0 && r.height === 0) continue;
        const band = bands.find((b) => Math.abs(b.top - r.top) < rowHeight / 2);
        if (band) band.left = Math.min(band.left, r.left);
        else bands.push({ top: r.top, left: r.left });
      }
      return bands;
    };

    const lines = Array.from(root.querySelectorAll('.cm-line')).map((el) => ({
      text: el.textContent,
      rows: rowsOf(el),
    }));
    const arrows = Array.from(
      root.querySelectorAll('.cm-wrapReturnArrow')
    ).map((el) => el.getBoundingClientRect().top);

    // Every row that continues should own exactly one arrow, and no arrow
    // should sit on a row that does not continue.
    let expected = 0;
    const used = new Set();
    let unmatched = 0;
    for (const line of lines) {
      for (let i = 0; i < line.rows.length - 1; i++) {
        expected++;
        const hit = arrows.findIndex(
          (top, idx) =>
            !used.has(idx) && Math.abs(top - line.rows[i].top) < rowHeight / 2
        );
        if (hit === -1) unmatched++;
        else used.add(hit);
      }
    }

    return {
      rowHeight,
      paddingLeft: style.paddingLeft,
      paddingRight: style.paddingRight,
      textIndent: style.textIndent,
      arrowCount: arrows.length,
      expectedArrows: expected,
      unmatched,
      orphans: arrows.length - used.size,
      // Offsets of each continuation row from its own line's first row.
      offsets: lines
        .filter((l) => l.rows.length > 1)
        .map((l) => ({
          text: l.text,
          offsets: l.rows.slice(1).map((r) => r.left - l.rows[0].left),
        })),
    };
  });
}

/** One character cell, measured the way CodeMirror measures it. */
async function cellWidth(page) {
  return page.evaluate(() => {
    const content = document.querySelector('#classicEditorSlot .cm-content');
    const probe = document.createElement('span');
    probe.textContent = '0'.repeat(50);
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    probe.style.whiteSpace = 'pre';
    content.appendChild(probe);
    const width = probe.getBoundingClientRect().width / 50;
    probe.remove();
    return width;
  });
}

test('wrap-marks: continuations hang four columns in and every continuing row is marked', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await openClassicEditor(page);

  const cell = await cellWidth(page);
  const m = await readWrap(page);
  console.log('[wrap-marks] cell', cell, JSON.stringify(m, null, 2));

  expect(m.offsets.length, 'no line wrapped, so nothing was measured').toBeGreaterThan(0);

  // The indent: FIXED four columns from the left edge, so every continuation
  // row of every wrapped line sits the same distance in, whatever the line's
  // own indentation (settings.cc lineWrapIndentationStyle "Fixed").
  for (const line of m.offsets) {
    for (const offset of line.offsets) {
      expect(
        offset / cell,
        `continuation of "${line.text.slice(0, 30)}" is ${offset}px in, not 4 columns`
      ).toBeCloseTo(4, 1);
    }
  }
  // The hanging indent is what pulls the FIRST row back to column 0, so the
  // first row keeps the whole pane to wrap in, exactly as Fixed does.
  expect(parseFloat(m.textIndent) / cell).toBeCloseTo(-4, 1);

  // The arrows: one per continuing row, none anywhere else.
  expect(m.expectedArrows).toBeGreaterThan(0);
  expect(m.arrowCount).toBe(m.expectedArrows);
  expect(m.unmatched, 'a row continues with no arrow on it').toBe(0);
  expect(m.orphans, 'an arrow sits on a row that does not continue').toBe(0);
});

test('wrap-marks: the arrow preference governs the arrows and nothing else', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await openClassicEditor(page);

  const before = await readWrap(page);
  expect(before.arrowCount).toBeGreaterThan(0);

  await setEditorPref(page, 'prefsEditorWrapArrow', false);
  const off = await readWrap(page);

  expect(off.arrowCount, 'arrows survived their preference').toBe(0);
  // The column reserved for the arrow goes back with it.
  expect(off.paddingRight).not.toBe(before.paddingRight);
  // The indent is a separate setting and must not have moved.
  expect(off.paddingLeft).toBe(before.paddingLeft);
  expect(off.textIndent).toBe(before.textIndent);

  await setEditorPref(page, 'prefsEditorWrapArrow', true);
  const back = await readWrap(page);
  expect(back.arrowCount).toBeGreaterThan(0);
  expect(back.unmatched).toBe(0);
  expect(back.orphans).toBe(0);
});

test('wrap-marks: the indent preference governs the indent and nothing else', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await openClassicEditor(page);

  const before = await readWrap(page);
  expect(before.offsets.length).toBeGreaterThan(0);

  await setEditorPref(page, 'prefsEditorWrapIndent', false);
  const off = await readWrap(page);

  for (const line of off.offsets) {
    for (const offset of line.offsets) {
      expect(Math.abs(offset), 'a continuation stayed indented').toBeLessThan(1);
    }
  }
  expect(off.textIndent).toBe('0px');
  // The arrows are a separate setting and must still be there.
  expect(off.arrowCount).toBeGreaterThan(0);
  expect(off.unmatched).toBe(0);

  await setEditorPref(page, 'prefsEditorWrapIndent', true);
  const back = await readWrap(page);
  expect(back.textIndent).toBe(before.textIndent);
});

test('wrap-marks: neither mark reaches the document text or the accessibility tree', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await openClassicEditor(page);

  const proof = await page.evaluate((wrappingLine) => {
    const root = document.querySelector('#classicEditorSlot');
    const line = Array.from(root.querySelectorAll('.cm-line')).find(
      (el) => el.textContent === wrappingLine
    );
    if (!line) return { found: false };

    // How many visual rows this line really occupies. `Element.getClientRects`
    // gives ONE rect for a block box; per-row rects come from a Range over its
    // contents, grouped into bands because line-height insets each inline box
    // a couple of pixels inside its row.
    const rowHeight = root.querySelector('.cm-line').getBoundingClientRect()
      .height;
    const rowRange = document.createRange();
    rowRange.selectNodeContents(line);
    const bands = [];
    for (const r of Array.from(rowRange.getClientRects())) {
      if (r.width === 0 && r.height === 0) continue;
      if (!bands.some((top) => Math.abs(top - r.top) < rowHeight / 2)) {
        bands.push(r.top);
      }
    }

    // What a copy of this line yields: the browser serialises the selection,
    // and an indent made of characters or a glyph inside the text would show
    // up right here.
    const range = document.createRange();
    range.selectNodeContents(line);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    const copied = selection.toString();
    selection.removeAllRanges();

    const layer = root.querySelector('.cm-wrapReturnArrowLayer');
    return {
      found: true,
      copied,
      rendered: line.textContent,
      rows: bands.length,
      layerAriaHidden: layer?.getAttribute('aria-hidden') ?? null,
      // The layer must live OUTSIDE the contenteditable, or its DOM would be
      // part of the document a screen reader reads and a copy serialises.
      layerInsideContent: !!layer?.closest('.cm-content'),
      layerParent: layer?.parentElement?.className ?? null,
      arrowsWithText: Array.from(
        root.querySelectorAll('.cm-wrapReturnArrow')
      ).filter((el) => el.textContent.trim().length > 0).length,
    };
  }, WRAPPING_LINE);

  console.log('[wrap-marks] purity', JSON.stringify(proof, null, 2));

  expect(proof.found, 'the wrapping fixture line was not rendered').toBe(true);
  // It really is wrapped, so this is not a vacuous pass on a one-row line.
  expect(proof.rows).toBeGreaterThan(1);
  // Byte-identical: no injected spaces for the indent, no glyph for the arrow.
  expect(proof.copied).toBe(WRAPPING_LINE);
  expect(proof.rendered).toBe(WRAPPING_LINE);

  expect(proof.layerInsideContent, 'the arrow layer is inside .cm-content').toBe(
    false
  );
  expect(proof.layerParent).toContain('cm-scroller');
  expect(proof.layerAriaHidden).toBe('true');
  expect(proof.arrowsWithText, 'an arrow carries text').toBe(0);

  // And nothing the arrows draw reaches the accessibility tree.
  const names = await page
    .locator('#classicEditorSlot .cm-wrapReturnArrow')
    .count();
  expect(names).toBeGreaterThan(0);
  const exposed = await page
    .locator('#classicEditorSlot')
    .getByRole('img')
    .count();
  expect(exposed, 'an arrow is exposed as an image to assistive tech').toBe(0);
});
