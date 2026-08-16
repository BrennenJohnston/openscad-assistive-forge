import { test, expect } from '@playwright/test';
import path from 'path';

/**
 * UF-29 — the fold gutter drawn the desktop's way (U-37 ¶1, Q-59a).
 *
 * Folding already worked; this is fidelity. What matters to guard is that
 * restyling the marker did not make the marker the ONLY way to fold — a
 * pointer-only control would be an accessibility regression, not a cosmetic
 * one — and that the glyph really does say what pressing it will do.
 */

const FIXTURE = path.join(
  process.cwd(),
  'tests',
  'fixtures',
  'universal-cuff',
  'universal_cuff_utensil_holder.scad'
);

const WASM_READY_TIMEOUT = 180_000;

test.use({ viewport: { width: 1400, height: 1000 } });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
  });
});

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
  await page.locator('#classicModeToggle').click();
  const density = page.locator('#classicDensityToggle');
  if ((await density.getAttribute('aria-checked')) !== 'true') {
    await density.click();
  }
  await expect(page.locator('#classicEditorSlot .cm-content')).toBeVisible({
    timeout: 20_000,
  });
  await scrollToFoldableBlocks(page);
}

/**
 * Scroll down until an EXPANDED fold marker is on screen.
 *
 * Deliberately not a pixel offset. The fixture's first blocks are ~170 lines
 * down, but converting that to a scrollTop needs a row height, and the row
 * height depends on the platform's fonts — a hardcoded offset passed on
 * Windows and landed somewhere else entirely on the Linux CI runner. Stepping
 * until the thing we need is actually visible is environment-independent, and
 * it reports what it saw when it gives up.
 */
async function scrollToFoldableBlocks(page) {
  const openBoxes = () =>
    page.evaluate(
      () =>
        document.querySelectorAll(
          '#classicEditorSlot .cm-foldBox.cm-foldBox-open'
        ).length
    );

  for (let step = 0; step < 30; step++) {
    if ((await openBoxes()) > 0) return;
    const moved = await page.evaluate(() => {
      const s = document.querySelector('#classicEditorSlot .cm-scroller');
      const before = s.scrollTop;
      s.scrollTop = before + s.clientHeight;
      return s.scrollTop !== before;
    });
    await page.waitForTimeout(250);
    if (!moved) break;
  }

  const diagnosis = await page.evaluate(() => {
    const s = document.querySelector('#classicEditorSlot .cm-scroller');
    const all = document.querySelectorAll('#classicEditorSlot .cm-foldBox');
    return {
      scrollTop: Math.round(s.scrollTop),
      scrollHeight: Math.round(s.scrollHeight),
      clientHeight: Math.round(s.clientHeight),
      boxes: all.length,
      open: document.querySelectorAll('.cm-foldBox-open').length,
      closed: document.querySelectorAll('.cm-foldBox-closed').length,
    };
  });
  throw new Error(
    'never found an expanded fold marker while scrolling: ' +
      JSON.stringify(diagnosis)
  );
}

const boxes = (page) => page.locator('#classicEditorSlot .cm-foldBox');

test('fold-markers: the gutter draws boxes, and the glyph says what it will do', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await openClassicEditor(page);

  await expect(boxes(page).first()).toBeAttached();
  const before = await page.evaluate(() => {
    const all = Array.from(
      document.querySelectorAll('#classicEditorSlot .cm-foldBox')
    );
    // Measured rather than assumed: every marker rendered here is a real,
    // visible one (hiddenSpacers came back 0). The count is kept so that a
    // future CodeMirror version growing a hidden sizing marker shows up as a
    // number instead of as a mysterious failure.
    const visible = all.filter((b) => b.checkVisibility());
    return {
      total: all.length,
      visible: visible.length,
      hiddenSpacers: all.length - visible.length,
      open: all.filter((b) => b.classList.contains('cm-foldBox-open')).length,
      // The plus arm exists only on a collapsed marker: an open one draws the
      // minus alone. Two paths versus one is the whole distinction.
      strokesOnFirstOpen: all
        .find((b) => b.classList.contains('cm-foldBox-open'))
        ?.querySelectorAll('path').length,
      // Nothing inside the marker may reach assistive tech as content.
      svgHidden: all.every(
        (b) => b.querySelector('svg')?.getAttribute('aria-hidden') === 'true'
      ),
      textInside: all.filter((b) => b.textContent.trim().length > 0).length,
      // Every marker must keep a title. CodeMirror's default marker sets one;
      // supplying markerDOM replaces that element and silently drops it, which
      // is how this restyle first shipped with no accessible name on the
      // control at all.
      titled: all.filter((b) => (b.getAttribute('title') || '').trim()).length,
      openTitle: all
        .find((b) => b.classList.contains('cm-foldBox-open'))
        ?.getAttribute('title'),
    };
  });

  console.log('[fold-markers] ' + JSON.stringify(before, null, 2));

  expect(before.visible, 'no fold marker is on screen to press').toBeGreaterThan(0);
  expect(before.open, 'no block was expanded to begin with').toBeGreaterThan(0);
  expect(before.strokesOnFirstOpen, 'an open box should draw one stroke').toBe(1);
  expect(before.svgHidden, 'a marker drawing is exposed to assistive tech').toBe(
    true
  );
  expect(before.textInside, 'a marker carries text').toBe(0);
  expect(
    before.titled,
    'a fold marker has no title, so the control has no accessible name'
  ).toBe(before.total);
  expect(before.openTitle, 'an expanded marker should offer to fold').toBe(
    'Fold line'
  );
});

test('fold-markers: pressing a marker collapses, and the box becomes a plus', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await openClassicEditor(page);

  const openBox = page
    .locator('#classicEditorSlot .cm-foldBox.cm-foldBox-open')
    .first();
  await expect(openBox).toBeVisible();

  /** Gutter line numbers, in order. A collapsed block makes them skip. */
  const lineNumbers = () =>
    page.evaluate(() =>
      Array.from(
        document.querySelectorAll(
          '#classicEditorSlot .cm-lineNumbers .cm-gutterElement'
        )
      )
        .map((el) => Number(el.textContent.trim()))
        .filter((n) => Number.isFinite(n) && n > 0)
    );

  const numbersBefore = await lineNumbers();
  await openBox.click();
  await page.waitForTimeout(500);

  const after = await page.evaluate(() => {
    const all = Array.from(
      document.querySelectorAll('#classicEditorSlot .cm-foldBox')
    );
    const closed = all.find((b) => b.classList.contains('cm-foldBox-closed'));
    return {
      closed: all.filter((b) => b.classList.contains('cm-foldBox-closed')).length,
      strokesOnClosed: closed?.querySelectorAll('path').length,
      placeholders: document.querySelectorAll(
        '#classicEditorSlot .cm-foldPlaceholder'
      ).length,
    };
  });

  console.log('[fold-markers] after press: ' + JSON.stringify(after, null, 2));

  expect(after.closed, 'pressing the marker collapsed nothing').toBeGreaterThan(0);
  // A collapsed box adds the vertical arm, making the plus.
  expect(after.strokesOnClosed, 'a closed box should draw two strokes').toBe(2);
  expect(after.placeholders, 'no fold placeholder appeared').toBeGreaterThan(0);

  // Content really went away, shown the way the desktop shows it: the gutter's
  // numbers skip across the hidden block (the owner's screenshot 122650 has
  // them jumping 177 to 185). Counting rendered lines does NOT work here —
  // CodeMirror simply renders further down the file to refill the viewport.
  const numbersAfter = await lineNumbers();
  const gapsBefore = numbersBefore.filter(
    (n, i) => i > 0 && n !== numbersBefore[i - 1] + 1
  ).length;
  const gapsAfter = numbersAfter.filter(
    (n, i) => i > 0 && n !== numbersAfter[i - 1] + 1
  ).length;
  console.log(
    `[fold-markers] gutter gaps before ${gapsBefore}, after ${gapsAfter}`
  );
  expect(gapsAfter, 'the gutter numbers never skipped, so nothing was hidden').toBeGreaterThan(
    gapsBefore
  );
});

test('fold-markers: folding still works from the keyboard, with no marker pressed', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await openClassicEditor(page);

  // This is the guard that matters. The markers are decoration on a control
  // that must remain operable without a pointer.
  await page.locator('#classicEditorSlot .cm-content').click();
  await page.keyboard.press('Control+Alt+BracketLeft');
  await page.waitForTimeout(600);

  const folded = await page.evaluate(
    () =>
      document.querySelectorAll('#classicEditorSlot .cm-foldPlaceholder').length
  );

  if (folded === 0) {
    // Fall back to the command CodeMirror's own fold keymap binds, so a failure
    // here means folding is unreachable by keyboard rather than that this spec
    // guessed the wrong chord.
    await page.keyboard.press('Control+Shift+BracketLeft');
    await page.waitForTimeout(600);
  }

  const placeholders = await page.evaluate(
    () =>
      document.querySelectorAll('#classicEditorSlot .cm-foldPlaceholder').length
  );
  console.log('[fold-markers] placeholders after keyboard fold: ' + placeholders);
  expect(placeholders, 'no keyboard route folded anything').toBeGreaterThan(0);

  // And what a screen reader meets at the folded range.
  const placeholder = await page.evaluate(() => {
    const el = document.querySelector('#classicEditorSlot .cm-foldPlaceholder');
    return {
      text: el?.textContent ?? null,
      label: el?.getAttribute('aria-label') ?? null,
    };
  });
  console.log('[fold-markers] placeholder: ' + JSON.stringify(placeholder));
  expect(placeholder.label, 'the folded range has no accessible name').toBeTruthy();
});
