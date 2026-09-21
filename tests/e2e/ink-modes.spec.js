/**
 * E2E tests for ink extraction (IR-11).
 *
 * Professional communication symbols are black line work over a saturated
 * fill, and the fill colour carries meaning. Forge's tracer quantized to two
 * colours by luminance, which puts a blue field and the black glyph drawn on it
 * in the SAME bucket: MEASURED on `tests/fixtures/aac/blue-field-glyph.png`,
 * the shipped pipeline returns ONE path - the blue square - and the person is
 * gone. Nothing said so.
 *
 * These tests pin the fix by counting shapes, not pixels.
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';

const FIXTURES = path.join(process.cwd(), 'tests', 'fixtures');
const BLUE_FIELD = path.join(FIXTURES, 'aac', 'blue-field-glyph.png');
const FITZGERALD = path.join(FIXTURES, 'aac', 'fitzgerald-card.png');
const BIRD = path.join(FIXTURES, 'svg-edit', 'bird-drawing.png');
const RING_WITH_CAPTION = path.join(FIXTURES, 'icons', 'outline-ring.png');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
  });
});

/** Open the standalone drawing editor on a picture. */
async function openPicture(page, fixture) {
  await page.goto('/');
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    timeout: 90000,
  });
  await page.locator('#accessibilitySpotlights > summary').click();
  await page.locator('#svgEditFileInput').setInputFiles(fixture);
  await page
    .locator('.svg-prep-object')
    .first()
    .waitFor({ state: 'visible', timeout: 60000 });
  await expect(page.locator('.ink-controls')).toBeVisible();
  // The editor's focus trap takes focus on a short delay. Driving the keyboard
  // before it lands means the trap steals the first keypress back.
  // RE-PINNED at DP-19: the surface that hosts the editor puts focus on its
  // own name (the "Drawing editor" heading), not on a close button.
  await expect
    .poll(
      async () =>
        page.evaluate(() =>
          (document.activeElement?.className || '').includes(
            'drawing-editor-title'
          )
        ),
      { timeout: 15000 }
    )
    .toBe(true);
}

const shapeCount = (page) => page.locator('.svg-prep-object').count();
const summaryText = (page) =>
  page.locator('.ink-controls-summary').textContent();

/**
 * Switch mode and wait for the re-trace to REPORT, not merely to start.
 *
 * This used to wait for the summary to differ from what it said before, and
 * that was only ever reliable by accident: setBusy writes "Re-reading the
 * picture..." into the same element, and the trace used to finish inside the
 * same turn because it ran on the main thread, so the waiting line was
 * overwritten before Playwright could read it.
 *
 * Since the trace moved into a worker (DP-34) the gap is real, and this
 * returned on the waiting line with the PREVIOUS mode's shapes still on
 * screen - passing locally, failing on a slower CI runner. The waiting line is
 * not an answer; wait past it.
 */
const BUSY_LINE = /Re-reading the picture/;

/**
 * Wait for a re-trace to REPORT, given what the summary said before it started.
 *
 * Every wait on this element has to go through here. There were two copies of
 * the old "wait until it differs" idiom, and both broke the same way once the
 * trace stopped blocking the page.
 */
async function waitForRetrace(page, before) {
  await expect
    .poll(
      async () => {
        const now = await summaryText(page);
        return now !== before && !BUSY_LINE.test(now || '');
      },
      { timeout: 60000 }
    )
    .toBe(true);
}

/**
 * Press Start if the design control is offering it.
 *
 * A picture chosen on a file PARAMETER waits to be started unless it is both
 * small and quick on this device (DP-Q32). The drawing editor's own door has no
 * Start - opening the door is the deliberate act there - so only the file
 * parameter path needs this.
 *
 * It has to be conditional rather than an unconditional click: on a fast
 * machine a small picture converts by itself and the button is already reading
 * "Convert again", which a second press would re-run for nothing.
 */
async function startIfOffered(page) {
  const start = page.locator('.trace-progress-start').first();
  if (!(await start.isVisible().catch(() => false))) return false;
  if ((await start.textContent())?.trim() !== 'Start conversion') return false;
  await start.click();
  return true;
}

async function chooseMode(page, value) {
  const before = await summaryText(page);
  await page.locator(`#svg-edit-ink-mode-${value}`).check();
  await waitForRetrace(page, before);
}

test.describe('What to keep from a picture', () => {
  test('Line art keeps the glyph the coloured field used to swallow', async ({
    page,
  }) => {
    test.setTimeout(150000);
    await openPicture(page, BLUE_FIELD);

    // Line art is the default for a picture that had to be traced.
    await expect(page.locator('#svg-edit-ink-mode-lineart')).toBeChecked();

    const lineArtShapes = await shapeCount(page);
    console.log('[ink] line art shapes:', lineArtShapes);
    expect(lineArtShapes).toBeGreaterThan(1);
    expect(await summaryText(page)).toMatch(/shapes traced/);

    // The same picture through the old path: one shape, the field, glyph gone.
    await chooseMode(page, 'standard');
    const standardShapes = await shapeCount(page);
    console.log('[ink] standard shapes:', standardShapes);
    expect(standardShapes).toBe(1);
    expect(standardShapes).toBeLessThan(lineArtShapes);

    // And back, because a mode is a choice rather than a one-way door.
    await chooseMode(page, 'lineart');
    expect(await shapeCount(page)).toBe(lineArtShapes);
  });

  test('Solid shape returns one filled outline, and says it nearly filled the picture', async ({
    page,
  }) => {
    test.setTimeout(150000);
    await openPicture(page, BLUE_FIELD);
    await chooseMode(page, 'silhouette');

    expect(await shapeCount(page)).toBe(1);
    expect(await summaryText(page)).toMatch(/1 shape traced/);

    // A silhouette of a full-bleed symbol is nearly the whole rectangle, and
    // the panel says so rather than leaving someone to find out at the printer.
    const warnings = await page
      .locator('.ink-controls-warnings li')
      .allTextContents();
    console.log('[ink] silhouette warnings:', JSON.stringify(warnings));
    expect(warnings.join(' ')).toMatch(/solid block/);
  });

  test('a dark drawing on light paper survives both modes', async ({
    page,
  }) => {
    test.setTimeout(150000);
    await openPicture(page, BIRD);

    const lineArt = await shapeCount(page);
    await chooseMode(page, 'standard');
    const standard = await shapeCount(page);

    console.log('[ink] bird line art:', lineArt, 'standard:', standard);
    // The signed default changes behaviour for photographs, so the case that
    // already worked has to keep working. Both find the same drawing.
    expect(lineArt).toBeGreaterThan(1);
    expect(standard).toBeGreaterThan(1);
    expect(Math.abs(lineArt - standard)).toBeLessThanOrEqual(2);
  });

  test('the filament suggestion only appears when the picture has one fill colour', async ({
    page,
  }) => {
    test.setTimeout(150000);
    await openPicture(page, BLUE_FIELD);
    // One blue field: the suggestion is honest, and names a colour that is
    // actually in the picture.
    expect(await summaryText(page)).toMatch(/#1f5fbf/i);

    // openPicture navigates to '/' itself; an about:blank hop in between races
    // Firefox's own navigation and buys nothing.
    await openPicture(page, FITZGERALD);
    // Four different fills average to a colour that is in none of them, so
    // nothing is suggested.
    expect(await summaryText(page)).not.toMatch(/filament/i);
  });

  test('the thresholds are labelled, paired with a number, and change the result', async ({
    page,
  }) => {
    test.setTimeout(150000);
    await openPicture(page, BLUE_FIELD);

    const lightness = page.locator('#svg-edit-ink-lightness');
    await expect(lightness).toHaveAttribute('type', 'range');
    const labelText = await page
      .locator('label[for="svg-edit-ink-lightness"]')
      .textContent();
    expect(labelText).toBe('How dark counts as a line');

    const number = page.locator(
      'input[aria-label="How dark counts as a line, as a number"]'
    );
    await expect(number).toBeVisible();
    await expect(number).toHaveValue(await lightness.inputValue());

    // Typing into the number moves the slider: the two are one control.
    await number.fill('12');
    await number.dispatchEvent('change');
    await expect(lightness).toHaveValue('12');
    // And back, because the next step needs the lightness gate open. This
    // ordering is the point: a pixel has to pass BOTH gates to be ink, so
    // leaving lightness at 12 would keep the blue field out (L* about 42) no
    // matter what the colourfulness gate said.
    await number.fill(String(90));
    await number.dispatchEvent('change');
    await expect(lightness).toHaveValue('90');

    const before = await summaryText(page);
    const shapesBefore = await shapeCount(page);
    const chromaNumber = page.locator(
      'input[aria-label="How colorful is still a line, as a number"]'
    );
    await chromaNumber.fill('80');
    await chromaNumber.dispatchEvent('change');
    await expect(page.locator('#svg-edit-ink-chroma')).toHaveValue('80');
    await waitForRetrace(page, before);
    // With both gates wide open the field is ink again, and the picture
    // collapses. The editor lists SUBPATHS, which is not the same number as
    // the tracer's paths, so this asserts the collapse rather than a count.
    expect(await shapeCount(page)).toBeLessThan(shapesBefore);

    // The colourfulness gate belongs to Line art alone; offering it elsewhere
    // would be offering a control that changes nothing.
    await chooseMode(page, 'silhouette');
    await expect(page.locator('#svg-edit-ink-chroma')).toBeDisabled();
    await chooseMode(page, 'lineart');
    await expect(page.locator('#svg-edit-ink-chroma')).toBeEnabled();
  });

  test('the panel is reachable and operable by keyboard alone', async ({
    page,
  }) => {
    test.setTimeout(150000);
    await openPicture(page, BLUE_FIELD);

    await page.locator('#svg-edit-ink-mode-lineart').focus();
    const before = await summaryText(page);
    // A radio group moves AND selects on arrow.
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#svg-edit-ink-mode-silhouette')).toBeChecked();
    await waitForRetrace(page, before);

    // And the re-trace did not throw the keyboard out of the panel. Changing
    // the picture re-opens the editor underneath, which used to move the panel
    // in the DOM and blur whatever was focused - on every slider step.
    await expect(page.locator('#svg-edit-ink-mode-silhouette')).toBeFocused();
    // It also stayed expanded rather than dropping back behind the page.
    // RE-PINNED at DP-19: the door hosts the editor surface over the whole
    // page (#svgEditStandaloneHost); the workspace's own fullscreen class is
    // no longer how that happens, so the host staying visible is the pin.
    await expect(page.locator('#svgEditStandaloneHost')).toBeVisible();
    await expect(page.locator('.svg-prep-fullscreen')).toHaveCount(0);

    // Every control in the panel is a tab stop inside the editor's trap.
    const reachable = await page.evaluate(() => {
      const panel = document.querySelector('.ink-controls');
      return [...panel.querySelectorAll('input, a')].every(
        (el) => el.tabIndex >= 0
      );
    });
    expect(reachable).toBe(true);
  });

  test('the panel says the picture never leaves the browser, and where to find symbols', async ({
    page,
  }) => {
    test.setTimeout(150000);
    await openPicture(page, BLUE_FIELD);

    await expect(page.locator('.ink-controls-notice')).toContainText(
      'never uploaded'
    );
    await expect(page.locator('.ink-controls-notice')).toContainText(
      'responsible for having the right'
    );
    const links = page.locator('.ink-controls-signpost a');
    await expect(links).toHaveCount(3);
    // Signposts, not bundled assets: nothing from these sets is in the repo.
    for (const href of await links.evaluateAll((els) =>
      els.map((e) => e.getAttribute('href'))
    )) {
      expect(href).toMatch(/^https:\/\//);
    }
  });

  test('the panel passes an accessibility scan', async ({ page }) => {
    test.setTimeout(180000);
    await openPicture(page, BLUE_FIELD);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();

    const detail = results.violations
      .flatMap((v) =>
        v.nodes.map(
          (n) =>
            `${v.id} @ ${n.target.join(' ')} :: ${n.failureSummary.replace(/\s+/g, ' ')}`
        )
      )
      .join('\n');
    expect(
      results.violations.map((v) => v.id),
      `unexpected axe violations with the ink panel open:\n${detail}`
    ).toEqual([]);
  });
});

test.describe('A model that takes an image', () => {
  test('a picture dropped on a file parameter gets the same choice, defaulting to Line art', async ({
    page,
  }) => {
    test.setTimeout(180000);
    await page.goto('/?example=logo-plate');
    await page
      .locator('.param-control')
      .first()
      .waitFor({ state: 'attached', timeout: 60000 });
    const notNow = page.locator('#saveProjectNotNow');
    try {
      await notNow.waitFor({ state: 'visible', timeout: 3000 });
      await notNow.click();
    } catch {
      // no save prompt for this example
    }
    const expandAll = page.locator('#expandAllGroupsBtn');
    if (await expandAll.isVisible().catch(() => false)) {
      await expandAll.click();
    }

    // Nothing to decide until there is a picture to decide about.
    await expect(page.locator('.ink-controls')).toBeHidden();

    await page
      .locator('.param-control input[type="file"]')
      .first()
      .setInputFiles(BLUE_FIELD);

    await expect(page.locator('.ink-controls')).toBeVisible({ timeout: 60000 });
    await expect(
      page.locator('.ink-controls input[type="radio"][value="lineart"]')
    ).toBeChecked();

    // On this path the picture waits to be started unless it is small AND the
    // quick look calls it quick here - and a slower machine does not, which is
    // why this passed locally and failed on CI. Pressing Start when it is
    // offered is what a person does, and it is the same on either machine.
    await startIfOffered(page);

    await expect
      .poll(async () => page.locator('.ink-controls-summary').textContent(), {
        timeout: 120000,
      })
      .toMatch(/shapes traced/);

    // The model took the traced SVG as its parameter value.
    await expect(page.locator('.file-info')).toContainText(
      'blue-field-glyph.svg'
    );
  });
});

test.describe('the credit line a stock icon carries (DP-36)', () => {
  // The fixture is drawn by scripts/make-icon-fixtures.mjs: an outline under a
  // two-line caption of letter-sized marks, which is the shape measured across
  // nine real stock icons. No stock icon is in this repository.

  test('★ the icon converts to the icon, and the panel says what it took off', async ({
    page,
  }) => {
    test.setTimeout(120000);
    await openPicture(page, RING_WITH_CAPTION);

    // The sentence is one sentence: what was traced and what was removed.
    // DP-32's law - choosing a picture is one action, so it gets one
    // announcement, not a second arriving behind the first.
    await expect
      .poll(async () => summaryText(page), { timeout: 60000 })
      .toMatch(/small shapes from the bottom edge, most likely a credit line/);

    const said = await summaryText(page);
    const removed = Number(/Removed (\d+) small shapes/.exec(said)?.[1] ?? 0);
    expect(removed).toBeGreaterThanOrEqual(36);

    // And the drawing left is the drawing: an outline and its counter.
    await expect(page.locator('.svg-prep-object')).toHaveCount(2);
  });

  test('★ Undo is offered, named by the sentence, and puts the caption back', async ({
    page,
  }) => {
    test.setTimeout(120000);
    await openPicture(page, RING_WITH_CAPTION);
    await expect
      .poll(async () => summaryText(page), { timeout: 60000 })
      .toMatch(/most likely a credit line/);

    const undo = page.locator('.ink-controls-credit-undo');
    await expect(undo).toBeVisible();
    // "Undo" on its own says nothing about what it would undo. It points at
    // the sentence rather than carrying an aria-label that would replace its
    // own visible word.
    const describedBy = await undo.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    await expect(page.locator(`#${describedBy}`)).toHaveText(
      /most likely a credit line/
    );
    // It is a real button, reachable and operable by keyboard.
    const box = await undo.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);

    await undo.focus();
    await page.keyboard.press('Enter');

    // The caption is back, so the drawing is the whole traced picture again.
    await expect
      .poll(async () => page.locator('.svg-prep-object').count(), {
        timeout: 60000,
      })
      .toBeGreaterThan(30);
    // And the offer is withdrawn: there is nothing left to undo.
    await expect(undo).toBeHidden();
  });

  test('a drawing with no caption is not told one was removed', async ({
    page,
  }) => {
    test.setTimeout(120000);
    await openPicture(page, BIRD);
    await expect
      .poll(async () => summaryText(page), { timeout: 60000 })
      .toMatch(/shapes traced/);
    expect(await summaryText(page)).not.toContain('credit line');
    await expect(page.locator('.ink-controls-credit-undo')).toBeHidden();
  });

  test('the panel says removing a credit line removes no duty', async ({
    page,
  }) => {
    await openPicture(page, RING_WITH_CAPTION);
    await expect(page.locator('.ink-controls-notice')).toContainText(
      "does not remove any credit the icon's license asks of you"
    );
  });
});

test.describe('how thin the lines are (DP-36 P3)', () => {
  test('★ says the width in millimetres at the size it will be printed', async ({
    page,
  }) => {
    test.setTimeout(120000);
    // The bird is drawn with a thin stroke: about 9 px on a 600 px picture,
    // which is a fifth of a millimetre on a 14 mm charm and will not print.
    await openPicture(page, BIRD);
    const advisory = page.locator('.svg-prep-thin-lines');
    await expect(advisory).toBeVisible();
    await expect(advisory).toContainText(/Thin lines: about 0\.\d+ mm at 14 mm wide/);
    // It names the width it used, because the person did not choose it.
    await expect(advisory).toContainText("the editor's default width");
    // And it names the lever without pulling it.
    await expect(advisory).toContainText('Raise Design offset');
  });

  test('a thick-lined drawing is told it is fine', async ({ page }) => {
    test.setTimeout(120000);
    // The ring fixture is a 30 px stroke on 700 px: 0.6 mm at charm size.
    await openPicture(page, RING_WITH_CAPTION);
    await expect(page.locator('.svg-prep-thin-lines')).toHaveText(
      'Lines look thick enough to print.'
    );
  });

  test('★ nothing is changed by it: the advisory is a sentence, not an action', async ({
    page,
  }) => {
    test.setTimeout(120000);
    await openPicture(page, BIRD);
    await expect(page.locator('.svg-prep-thin-lines')).toBeVisible();
    // The offset control it names is still where it was, at zero.
    const offsets = await page
      .locator('.svg-prep-offset-input')
      .evaluateAll((els) => els.map((el) => el.value));
    for (const value of offsets) expect(Number(value)).toBe(0);
  });
});

// ── DP-79: a photograph of a printed symbol (D-173, D-176) ──────────────────
//
// The owner's sixth walk: a phone photo of a printed AAC panel "only resulted
// in either a too complicated to process shape, or a noisy result". MEASURED
// (DP-77, the panel photo through the app): Line art 1,270 shapes, Solid shape
// 341, Light and dark 3,686, Colors 3,939, and since DP-78 anything over 1,000
// is refused before the page's own stages. A camera picture is worked at the
// print's cell now, smoothed, and floored at 0.1 mm² (DP-79): the same panel
// measures 25 / 6 / 274 / 42 (build/dp-r6/dp-79/p0.log). The picture below is
// drawn in the test in the panel's own kind: lit paper with grain, and five
// filled crayon shapes with black outlines. RED on the build before DP-79:
// every mode traced its grain into thousands of shapes and the gate refused it.
test.describe('a photograph of a printed symbol (DP-79)', () => {
  /** Lit, grainy paper with five outlined crayon shapes, 1400 x 1200, as a File. */
  async function choosePanelPhoto(page) {
    await page.evaluate(async () => {
      const w = 1400;
      const h = 1200;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      // The paper: brighter on the left than the right, the way a lamp
      // lights a page, with per-pixel grain on top, and paper fibers: a
      // scatter of dark two-pixel clusters, the texture a camera sees in
      // crayon and paper. MEASURED (DP-77): that texture is what traced the
      // real panel into thousands of shapes; here it is what makes the build
      // before DP-79 refuse this picture, and what the median removes.
      const img = ctx.createImageData(w, h);
      let seed = 4242;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          seed = (seed * 1103515245 + 12345) & 0x7fffffff;
          const noise = ((seed >> 16) & 31) - 15;
          const base = 236 - Math.round((30 * x) / w);
          const i = (y * w + x) * 4;
          img.data[i] = base + noise;
          img.data[i + 1] = base + noise - 3;
          img.data[i + 2] = base + noise - 8;
          img.data[i + 3] = 255;
        }
      }
      for (let k = 0; k < 1500; k++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        const fx = (seed >> 8) % (w - 2);
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        const fy = (seed >> 8) % (h - 2);
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            const i = ((fy + dy) * w + fx + dx) * 4;
            img.data[i] = 70;
            img.data[i + 1] = 66;
            img.data[i + 2] = 60;
          }
        }
      }
      ctx.putImageData(img, 0, 0);
      const shape = (draw, fill) => {
        ctx.lineWidth = 14;
        ctx.strokeStyle = '#141414';
        ctx.fillStyle = fill;
        ctx.beginPath();
        draw();
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      };
      shape(() => ctx.rect(120, 140, 320, 420), '#c9a06a');
      shape(() => ctx.arc(760, 340, 190, 0, Math.PI * 2), '#6f8f5e');
      shape(() => {
        ctx.moveTo(1080, 160);
        ctx.lineTo(1300, 520);
        ctx.lineTo(880, 520);
      }, '#b04a3c');
      shape(() => ctx.rect(200, 700, 500, 300), '#5b6b8a');
      shape(() => ctx.arc(1000, 880, 200, 0, Math.PI * 2), '#8a6a9a');
      // Crayon crumbs: sixty dark dots twelve pixels across on the paper.
      // Worked 2.9 times smaller each is about four pixels across, under a
      // tenth of a square millimeter, which is what the floor exists to
      // leave out, and wide enough to outlive the median (the fibers above
      // are not, and the median is what takes them).
      ctx.fillStyle = '#2a2a2a';
      for (let k = 0; k < 60; k++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        const cx = 40 + ((seed >> 8) % (w - 80));
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        const cy = 40 + ((seed >> 8) % (h - 80));
        // Kept off the shapes: the crumbs are the paper's, not the drawing's.
        const onShape =
          (cx > 100 && cx < 460 && cy > 120 && cy < 580) ||
          Math.hypot(cx - 760, cy - 340) < 215 ||
          (cx > 860 && cx < 1320 && cy > 140 && cy < 540) ||
          (cx > 180 && cx < 720 && cy > 680 && cy < 1020) ||
          Math.hypot(cx - 1000, cy - 880) < 225;
        if (onShape) continue;
        ctx.beginPath();
        ctx.arc(cx, cy, 6, 0, Math.PI * 2);
        ctx.fill();
      }
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
      window.__testPicture = new File([blob], 'panel-photo.png', {
        type: 'image/png',
      });
    });
    await page.evaluate(() => {
      const input = document.querySelector('#param-design_file');
      const dt = new DataTransfer();
      dt.items.add(window.__testPicture);
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  /** The shape count the card says, in any of its words; "SVG Ready" is one. */
  const shapesOnCard = async (page) => {
    const badge = (await page.locator('.svg-prep-status-badge').first().textContent()) || '';
    if (/^SVG Ready/.test(badge)) return 1;
    const m = badge.match(/(\d[\d,]*) shapes?/);
    return m ? Number(m[1].replace(/,/g, '')) : null;
  };

  /**
   * A fingerprint of the design the charm holds, so a step waits for ITS
   * conversion's emit and never reads the card of the mode before it.
   */
  const designMark = (page) =>
    page.evaluate(() => {
      const v = window.stateManager?.getState()?.parameters?.design_file;
      if (!v || typeof v !== 'object') return v ?? null;
      const s = String(v.data || '');
      let h = 0;
      for (let i = 0; i < s.length; i += 7) h = (h * 31 + s.charCodeAt(i)) | 0;
      return `${v.name}:${v.size}:${h}`;
    });

  test('★ every mode gives tens of shapes, the panel says the worked size, and the editor is offered', async ({
    page,
  }) => {
    test.slow();
    test.setTimeout(300000);
    await page.addInitScript(() => {
      localStorage.setItem('openscad-forge-first-visit-seen', 'true');
      localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
    });
    await page.goto('/?example=q-charm');
    await page.waitForSelector('body[data-wasm-ready="true"]', {
      timeout: 120000,
    });
    await expect
      .poll(() => page.locator('#param-design_file').count(), {
        timeout: 120000,
      })
      .toBeGreaterThan(0);
    for (let i = 0; i < 3; i++) {
      const notNow = page.locator('#saveProjectNotNow');
      if (await notNow.isVisible().catch(() => false)) {
        await notNow.click();
        await page.waitForTimeout(200);
      }
    }
    await page.evaluate(() => {
      const input = document.querySelector('#param-design_file');
      let d = input?.closest('details');
      while (d) {
        d.open = true;
        d = d.parentElement?.closest('details');
      }
    });

    await choosePanelPhoto(page);
    const start = page.locator('.trace-progress-start').first();
    await expect(start).toBeVisible({ timeout: 120000 });
    await expect(start).toHaveText('Start conversion');
    await start.click();

    const summary = page.locator('.ink-controls-summary').first();
    const info = page.locator('.file-info').first();
    const badge = page.locator('.svg-prep-status-badge').first();
    // Line art. The defect first: before DP-79 this photo traced into
    // thousands of shapes and was refused at the gate, and the info line
    // never read "converted from". Either outcome ends the wait, so a RED
    // says the card's words instead of timing out.
    await expect
      .poll(async () => `${await info.textContent()} | ${await badge.textContent()}`, {
        timeout: 240000,
      })
      .toMatch(/converted from|too many shapes/i);
    await expect(info, `card: ${await badge.textContent()}`).toContainText('converted from');
    const lineArt = await shapesOnCard(page);
    expect(lineArt, 'Line art shapes on the card').not.toBeNull();
    expect(lineArt).toBeLessThan(60);
    await expect(badge).not.toContainText('Too many shapes');
    await expect(page.locator('.svg-prep-status .svg-prep-edit-btn')).toHaveCount(1);
    // What the panel says: the worked size, and the crumbs the floor left out.
    await expect(summary).toContainText(/Worked at \d+ px wide, the size a [\d.]+ mm design can use\./);
    await expect(summary).toContainText(/specks? smaller than 0\.1 mm² at [\d.]+ mm wide (was|were) left out\./);
    // The quick look called it a camera picture: both switches started on.
    await expect(page.locator('.ink-controls input[id$="-smooth"]')).toBeChecked();
    await expect(page.locator('.ink-controls input[id$="-specks"]')).toBeChecked();

    // Solid shape: the objects, whole. The card is read only once THIS
    // conversion has emitted, never the mode before's.
    const afterLineArt = await designMark(page);
    const silhouette = page.locator('.ink-controls input[type="radio"][value="silhouette"]');
    await silhouette.evaluate((el) => {
      el.checked = true;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await expect(start).toHaveText('Convert again', { timeout: 30000 });
    await start.click();
    await expect.poll(() => designMark(page), { timeout: 240000 }).not.toBe(afterLineArt);
    await expect(summary).toContainText(/shapes? traced/);
    const solid = await shapesOnCard(page);
    expect(solid, `Solid shape card: ${await badge.textContent()}`).not.toBeNull();
    expect(solid).toBeLessThanOrEqual(12);

    // Colors: the wall found, tens of paths.
    const afterSolid = await designMark(page);
    const colours = page.locator('.ink-controls input[type="radio"][value="colours"]');
    await colours.evaluate((el) => {
      el.checked = true;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await expect(start).toHaveText('Convert again', { timeout: 30000 });
    await start.click();
    await expect.poll(() => designMark(page), { timeout: 240000 }).not.toBe(afterSolid);
    await expect(summary).toContainText(/colors? in the artwork, and the wall/);
    await expect(summary).toContainText(/Worked at \d+ px wide/);
    const coloured = await shapesOnCard(page);
    expect(coloured, `Colors card: ${await badge.textContent()}`).not.toBeNull();
    expect(coloured).toBeLessThan(60);
    await expect(badge).not.toContainText('Too many shapes');
  });
});
