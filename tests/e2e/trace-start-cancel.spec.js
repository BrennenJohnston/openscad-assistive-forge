/**
 * E2E: the person starts the conversion, watches it, and can always stop it.
 *
 * The acceptance story is the owner's own report, inverted. Before this, a
 * picture began converting the moment it was chosen, on the main thread, with
 * no way to stop it - so a device that struggled produced a page that could not
 * be used and could not be recovered, and a reload on a phone did not help.
 *
 * What is guarded here is not that a conversion succeeds. It is that:
 *
 *   - nothing heavy starts until the person asks for it,
 *   - the page still ANSWERS while it works, which is the thing that was
 *     actually broken,
 *   - Cancel stops it at any moment and says so, once,
 *   - and a completed conversion speaks exactly once.
 *
 * The picture is a 2000 x 2000 noise PNG built inside the test. It is never
 * stored: a fixture that heavy has no business in the repository, and noise is
 * the honest worst case because it traces into thousands of shapes.
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test';

// Chromium only, like drawing-editor.spec.js: CPU throttling is a CDP feature,
// and this spec's whole point is behaviour under a slow device.
test.describe.configure({ mode: 'serial' });

/**
 * Build a PNG in the page and hand it to the file input.
 *
 * `noise` is the honest worst case - it traces into thousands of shapes, which
 * is what makes a slow device freeze. `plain` is a black square on white, which
 * traces into one or two shapes: the right picture when what is being measured
 * is the announcement rather than the load.
 */
async function choosePicture(page, size = 2000, kind = 'noise') {
  await page.evaluate(
    async ({ n, kind }) => {
      const canvas = document.createElement('canvas');
      canvas.width = n;
      canvas.height = n;
      const ctx = canvas.getContext('2d');
      if (kind === 'plain') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, n, n);
        ctx.fillStyle = '#000000';
        ctx.fillRect(n * 0.25, n * 0.25, n * 0.5, n * 0.5);
      } else {
        const img = ctx.createImageData(n, n);
        // A deterministic pseudo-random field: the same picture every run, so a
        // failure is reproducible rather than a different picture each time.
        let seed = 12345;
        for (let i = 0; i < img.data.length; i += 4) {
          seed = (seed * 1103515245 + 12345) & 0x7fffffff;
          const v = (seed >> 16) & 0xff;
          img.data[i] = v;
          img.data[i + 1] = v;
          img.data[i + 2] = v;
          img.data[i + 3] = 255;
        }
        ctx.putImageData(img, 0, 0);
      }
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
      window.__testPicture = new File([blob], `${kind}.png`, {
        type: 'image/png',
      });
    },
    { n: size, kind }
  );

  await page.evaluate(() => {
    const input = document.querySelector('#param-design_file');
    const dt = new DataTransfer();
    dt.items.add(window.__testPicture);
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

async function openCharm(page) {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
  });
  await page.goto('/?example=q-charm');
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    timeout: 120_000,
  });
  await expect
    .poll(() => page.locator('#param-design_file').count(), {
      timeout: 120_000,
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
}

/** The design control's own panel; q-charm declares two design files. */
const panel = (page) => ({
  note: page.locator('.trace-progress-note').first(),
  start: page.locator('.trace-progress-start').first(),
  cancel: page.locator('.trace-progress-cancel').first(),
  bar: page.locator('.trace-progress-bar').first(),
  stage: page.locator('.trace-progress-stage').first(),
  running: page.locator('.trace-progress-running').first(),
  info: page.locator('.file-info').first(),
});

test.describe('Start, a bar that moves, and Cancel (DP-34)', () => {
  test('★ a big picture waits to be started, answers a click while it works, and cancels', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'CPU throttling is a CDP feature');
    test.setTimeout(300_000);

    await openCharm(page);
    const cdp = await page.context().newCDPSession(page);
    // Four times slower is Chrome DevTools' own stand-in for a mid-tier phone,
    // which is the device the report came from.
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

    await choosePicture(page, 2000, 'noise');
    const p = panel(page);
    await expect(p.start).toBeVisible({ timeout: 120_000 });
    await expect(p.start).toHaveText('Start conversion');

    // Nothing converted itself. This is the directive's first sentence.
    await page.waitForTimeout(1500);
    await expect(p.info).not.toContainText('converted from');
    await expect(p.running).toBeHidden();

    await p.start.click();
    await expect(p.running).toBeVisible({ timeout: 30_000 });

    // ★ THE POINT: the page answers while the conversion runs. Before DP-34
    // this was a frozen tab for as long as the trace took.
    const answered = await page.evaluate(async () => {
      const t0 = performance.now();
      document.getElementById('themeToggle')?.click();
      await new Promise((r) => requestAnimationFrame(r));
      return performance.now() - t0;
    });
    expect(
      answered,
      `the page took ${Math.round(answered)} ms to answer a click mid-conversion`
    ).toBeLessThan(1000);

    // The bar carries a name and the stage sentence says something real.
    await expect(p.bar).toHaveAttribute('aria-labelledby', /trace-progress/);
    const stageText = await p.stage.textContent();
    expect(
      ['Reading the picture', 'Finding the ink', 'Tracing the shapes'],
      `stage read "${stageText}"`
    ).toContain((stageText || '').trim());

    await p.cancel.click();

    await expect(p.running).toBeHidden({ timeout: 15_000 });
    await expect(p.start).toBeVisible();
    await expect(p.info).toHaveText('Conversion cancelled');
    // Nothing is left claiming to be busy.
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  });

  test('a finished conversion speaks once, and only about its completion', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'CPU throttling is a CDP feature');
    test.setTimeout(300_000);

    await openCharm(page);
    // Watch the live region from BEFORE the click: the announcer clears itself,
    // so a poll can easily start after the wipe and see nothing.
    await page.evaluate(() => {
      window.__heard = [];
      const node = document.getElementById('srAnnouncer');
      if (!node) return;
      new MutationObserver(() => {
        const t = node.textContent.trim();
        if (t) window.__heard.push(t);
      }).observe(node, { childList: true, characterData: true, subtree: true });
    });

    // 800 x 800 is 0.64 MP, above the 0.5 MP that may start by itself, so this
    // case deterministically needs Start pressing. A plain square rather than
    // noise, because what is measured here is the announcement, not the load.
    await choosePicture(page, 800, 'plain');
    const p = panel(page);
    await expect(p.start).toBeVisible({ timeout: 120_000 });
    await expect(p.start).toHaveText('Start conversion');
    await p.start.click();

    await expect(p.info).toContainText('converted from', { timeout: 240_000 });

    // The announcer debounces by 350 ms and then waits a frame, so the file
    // info is updated BEFORE the live region is. Reading once here measured
    // only what came earlier; poll for it instead.
    await expect
      .poll(
        async () => {
          const heard = await page.evaluate(() => window.__heard ?? []);
          return heard.filter((t) => /^Converted: \d+ shapes?$/.test(t)).length;
        },
        { timeout: 15_000, intervals: [200, 400, 800] }
      )
      .toBeGreaterThanOrEqual(1);

    const heard = await page.evaluate(() => window.__heard ?? []);
    const completions = heard.filter((t) => /^Converted: \d+ shapes?$/.test(t));
    expect(completions.length, `heard: ${heard.join(' | ')}`).toBe(1);
    // The stages are VISIBLE, never spoken: one action, one announcement.
    expect(
      heard.filter((t) =>
        /Finding the ink|Tracing the shapes|Reading the picture/.test(t)
      ),
      `heard: ${heard.join(' | ')}`
    ).toEqual([]);
  });

  test('★ the quick look says what the picture is before anything is started, and never blocks it', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'CPU throttling is a CDP feature');
    test.setTimeout(300_000);

    // DP-35. A person may choose a photograph without realising the work, or
    // that a simpler picture would give a better charm. The sentence says so
    // BEFORE Start, and it is a paragraph rather than anything that has to be
    // dismissed.
    await openCharm(page);
    await choosePicture(page, 2000, 'noise');
    const p = panel(page);

    await expect(p.note).toBeVisible({ timeout: 120_000 });
    await expect(p.note).toContainText('Looks like');
    await expect(p.note).toContainText('Converting');

    // Never a modal, never a refusal: Start is right there and usable.
    await expect(p.start).toBeVisible();
    await expect(p.start).toBeEnabled();
    await expect(
      page.locator('dialog[open], [role="alertdialog"]')
    ).toHaveCount(0);

    // A 4 MP noise picture is over the cap, and the sentence says so rather
    // than leaving a separate warning to say it somewhere else.
    await expect(p.note).toContainText('scaled down first');

    // And it is a paragraph, not a live region shouting on every file choice.
    await expect(p.note).toHaveJSProperty('tagName', 'P');
    expect(await p.note.getAttribute('aria-live')).toBeNull();
    expect(await p.note.getAttribute('role')).toBeNull();
  });

  test('a picture small enough to be over in a moment starts itself, through the same bar', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'CPU throttling is a CDP feature');
    test.setTimeout(300_000);

    // DP-Q32, the owner's rule: at most 0.5 MP may start by itself, and it goes
    // through the same panel and the same Cancel - there is no second,
    // invisible path. 400 x 400 is 0.16 MP.
    await openCharm(page);
    await choosePicture(page, 400, 'plain');
    const p = panel(page);

    await expect(p.info).toContainText('converted from', { timeout: 240_000 });
    // And Start stays, so a re-run after changing a setting is one click.
    await expect(p.start).toBeVisible();
    await expect(p.start).toHaveText('Convert again');
  });
});
