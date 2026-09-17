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
      } else if (kind === 'lightOnDark') {
        // The class of picture the owner brought (D-139): a light drawing on
        // a dark, SATURATED ground. The navy is the one from their logo.
        ctx.fillStyle = '#4b2e83';
        ctx.fillRect(0, 0, n, n);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(n * 0.2, n * 0.4, n * 0.6, n * 0.2);
        ctx.fillRect(n * 0.4, n * 0.2, n * 0.2, n * 0.6);
      } else if (kind === 'blank') {
        // A picture with nothing in it at all.
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, n, n);
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
// DP-52: the bar, the stage sentence and Cancel live in the conversion
// dialog, which stands in front of the page while a job runs. `running` is
// the dialog itself, on screen.
const panel = (page) => ({
  note: page.locator('.trace-progress-note').first(),
  start: page.locator('.trace-progress-start').first(),
  cancel: page.locator('.conversion-dialog-cancel').first(),
  bar: page.locator('.conversion-dialog-bar').first(),
  stage: page.locator('.conversion-dialog-stage').first(),
  running: page.locator('.conversion-dialog:not(.hidden)').first(),
  dialog: page.locator('.conversion-dialog').first(),
  info: page.locator('.file-info').first(),
});

/**
 * Get a picture converted, whichever way this machine goes about it.
 *
 * A picture under half a megapixel usually starts by itself (DP-Q32) - but the
 * quick look makes that call from a PREDICTION, and on a slow machine it
 * declines and waits to be asked. MEASURED at 6x CPU throttling: the same
 * picture that converts by itself in 1.0 s at 4x sits at "Ready to convert"
 * with a Start button, ninety seconds later still. A test that presses Start
 * once, the instant the file goes in, is a test that passes on a fast machine
 * and times out on a CI runner - which is exactly what it did.
 */
async function convertNow(page, p, timeout = 180_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const info = (await p.info.textContent().catch(() => '')) || '';
    if (/converted from|nothing was kept/i.test(info)) return;
    const offered =
      (await p.start.isVisible().catch(() => false)) &&
      (await p.start.textContent().catch(() => '')) === 'Start conversion';
    if (offered) await p.start.click({ noWaitAfter: true }).catch(() => {});
    await page.waitForTimeout(1000);
  }
}

test.describe('Start, a bar that moves, and Cancel (DP-34)', () => {
  // ★ RE-WRITTEN at DP-43, and the reason is a measurement worth keeping.
  //
  // This used to do both of its mid-conversion checks in one run: probe that
  // the page answers a click, read the stage sentence, then press Cancel. That
  // worked while a 2000 x 2000 noise picture took about thirteen seconds. With
  // Potrace it takes under two, so all three had to land inside a window a
  // slower runner could miss - and CI did miss it, reading an empty stage and
  // then finding Cancel already gone.
  //
  // MEASURED in the browser, the same picture, 4x CPU throttling:
  //
  //   imagetracerjs   13,401 ms       Potrace   1,872 ms
  //
  // And a second thing fell out of it: CPU throttling barely moves that number
  // any more (1,872 ms at 4x, 1,677 at 10x, 1,591 at 20x), because
  // Emulation.setCPUThrottlingRate throttles the MAIN THREAD and the trace no
  // longer runs there. Throttling is still the right way to ask "does the page
  // answer", which is what it is used for below; it is no longer a way to make
  // the conversion last longer.
  //
  // So the window is used for one thing at a time: one run to prove the page
  // answers while it works, one to prove Cancel stops it. The stage sentence
  // is collected by an observer from before the start, because it is transient
  // and sampling it is a race by construction.
  test('★ a big picture waits to be started, and answers a click while it works', async ({
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

    // Every sentence the stage line ever shows, collected from the moment the
    // dialog exists (it is built on first use, so the observer waits for it).
    // A transient sentence cannot be sampled after the fact.
    await page.evaluate(() => {
      window.__stages = [];
      const attach = () => {
        const el = document.querySelector('.conversion-dialog-stage');
        if (!el) return false;
        const note = () => {
          const t = (el.textContent || '').trim();
          if (t && !window.__stages.includes(t)) window.__stages.push(t);
        };
        new MutationObserver(note).observe(el, {
          childList: true,
          characterData: true,
          subtree: true,
        });
        note();
        return true;
      };
      if (!attach()) {
        new MutationObserver((_, obs) => {
          if (attach()) obs.disconnect();
        }).observe(document.body, { childList: true });
      }
    });

    await p.start.click();
    // DP-52: a press on Start shows the dialog at once, in front of an inert
    // page, with Cancel holding focus.
    await expect(p.running).toBeVisible({ timeout: 30_000 });
    await expect(p.dialog).toHaveAttribute('aria-modal', 'true');
    await expect(page.locator('#app')).toHaveAttribute('inert', '');
    await expect(p.cancel).toBeFocused();

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

    // The bar carries a name: the dialog's own heading.
    await expect(p.bar).toHaveAttribute('aria-labelledby', /conversion-dialog/);

    // Let it finish, then read what the stage line said along the way.
    await expect(p.info).toContainText('converted from', { timeout: 120_000 });
    const stages = await page.evaluate(() => window.__stages);
    expect(stages.length, `stage line showed ${JSON.stringify(stages)}`)
      .toBeGreaterThan(0);
    for (const said of stages) {
      expect(
        [
          'Reading the picture',
          'Finding the ink',
          'Tracing the shapes',
          'Preparing the drawing',
          'Updating the charm',
        ],
        `stage read "${said}"`
      ).toContain(said);
    }
    // DP-52: the page's own stages are shown, not only the worker's.
    expect(stages, `stage line showed ${JSON.stringify(stages)}`).toContain(
      'Preparing the drawing'
    );
    // And the dialog is gone, and the page is live, once the charm has it.
    await expect(p.running).toBeHidden({ timeout: 30_000 });
    await expect(page.locator('#app')).not.toHaveAttribute('inert', '');
  });

  test('★ Cancel stops a conversion and says so, once', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'CPU throttling is a CDP feature');
    test.setTimeout(300_000);

    await openCharm(page);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

    await choosePicture(page, 2000, 'noise');
    const p = panel(page);
    await expect(p.start).toBeVisible({ timeout: 120_000 });

    // Cancel is the first thing that happens after the bar appears: the whole
    // conversion is under two seconds now, and anything else in front of the
    // click spends that window.
    await p.start.click();
    await expect(p.cancel).toBeVisible({ timeout: 30_000 });
    await p.cancel.click({ timeout: 10_000 });

    await expect(p.running).toBeHidden({ timeout: 15_000 });
    await expect(page.locator('#app')).not.toHaveAttribute('inert', '');
    await expect(p.start).toBeVisible();
    await expect(p.info).toHaveText('Conversion canceled');
    // Nothing is left claiming to be busy.
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
    // And nothing was converted: a cancelled job leaves no file behind.
    await expect(p.info).not.toContainText('converted from');
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
        /Finding the ink|Tracing the shapes|Reading the picture|Preparing the drawing|Updating the charm/.test(
          t
        )
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

  test('★ a light drawing on a dark ground is turned around, not thrown away (D-139)', async ({
    page,
  }) => {
    test.slow();
    test.setTimeout(300_000);
    await openCharm(page);
    await choosePicture(page, 600, 'lightOnDark');
    const p = panel(page);
    await convertNow(page, p);

    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const v = window.stateManager?.getState()?.parameters?.design_file;
            return v && typeof v === 'object' ? v.name : v;
          }),
        { timeout: 120_000 }
      )
      .toContain('.svg');

    // Before D-139 this traced to NOTHING: the chroma gate threw the navy
    // away first, so the old "more than half is ink, turn it around" rule
    // never fired, and an 85-byte empty drawing was emitted as the design.
    const summary = await page
      .locator('.ink-controls-summary')
      .first()
      .textContent();
    expect(summary).not.toMatch(/^0 shapes traced/);
    expect(summary).toMatch(/turned around/i);
  });

  test('★ a conversion that keeps nothing is not emitted, and not called ready (D-139)', async ({
    page,
  }) => {
    test.slow();
    test.setTimeout(300_000);
    await openCharm(page);
    await choosePicture(page, 600, 'blank');
    const p = panel(page);
    await convertNow(page, p);

    // The control says what happened...
    await expect
      .poll(async () => (await p.info.textContent()) || '', {
        timeout: 120_000,
      })
      .toMatch(/nothing was kept/i);

    // ...the design is untouched, so the charm is still whatever it was...
    const design = await page.evaluate(() => {
      const v = window.stateManager?.getState()?.parameters?.design_file;
      return v && typeof v === 'object' ? v.name : v;
    });
    expect(design, `design_file after an empty conversion: ${design}`).toBeFalsy();

    // ...and nothing anywhere calls an empty drawing ready.
    const badges = await page
      .locator('.svg-prep-status-badge')
      .allTextContents();
    expect(badges.join(' | ')).not.toMatch(/SVG Ready/);
  });

  test('★ a setting changed while a conversion runs starts it over with the new setting (D-151)', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'CPU throttling is a CDP feature');
    test.setTimeout(300_000);

    // MEASURED on PR #238's board: on a slow runner the Stencil Maker's
    // Colors switch landed while the first conversion still ran, and the job
    // refused it - "Conversion failed: A conversion is already running" - so
    // the switch was lost and the first conversion's result stood. The trace
    // runner always superseded a running trace; the job must too.
    await openCharm(page);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

    await choosePicture(page, 2000, 'plain');
    const p = panel(page);
    await expect(p.start).toBeVisible({ timeout: 120_000 });
    await p.start.click();
    await expect(p.running).toBeVisible({ timeout: 30_000 });

    // Colors, while the first conversion is still at work.
    const colours = page.locator('input[type="radio"][value="colours"]');
    await colours.evaluate((el) => {
      el.checked = true;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const summary = page.locator('.ink-controls-summary');
    await page.waitForTimeout(2000);
    await expect(summary).not.toContainText(/already running/);
    await expect(p.info).not.toContainText(/already running/);

    // The conversion that finishes is the Colors one.
    await expect(summary).toContainText(/colors? in the artwork, and the wall/, {
      timeout: 240_000,
    });
    await expect(p.info).toContainText('converted from');
    await expect(p.running).toBeHidden();
    await expect(page.locator('#app')).not.toHaveAttribute('inert', '');
    await expect(p.start).toHaveText('Convert again');
  });

  test('a picture small enough to be over in a moment starts itself, and the dialog waits to see if it takes a while', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'CPU throttling is a CDP feature');
    test.setTimeout(300_000);

    // DP-Q32, the owner's rule: at most 0.5 MP may start by itself, through
    // the same job and the same Cancel - there is no second, invisible path.
    // DP-52's grace: a conversion nobody pressed shows the dialog only once
    // it has run for the quick band, so a sub-second one never flashes it.
    // 400 x 400 is 0.16 MP.
    await openCharm(page);
    await choosePicture(page, 400, 'plain');
    const p = panel(page);

    // DP-Q32's other half: on a machine the quick look calls slow, nothing
    // starts by itself, so the auto-start cannot be observed there. A slow
    // CI runner is such a machine (PR #238's board, three attempts), and this
    // test says so rather than fail for a rule it is not about.
    let outcome = 'pending';
    const deadline = Date.now() + 240_000;
    while (outcome === 'pending' && Date.now() < deadline) {
      const text = (await p.info.textContent()) || '';
      if (/converted from/.test(text)) outcome = 'converted';
      else if (/Ready to convert\./.test(text)) outcome = 'offered';
      else await page.waitForTimeout(250);
    }
    test.skip(
      outcome === 'offered',
      "this machine's quick look called the picture slow (DP-Q32), so nothing starts by itself here"
    );
    expect(outcome).toBe('converted');
    // Whatever the dialog did, it is gone and the page is live once the charm
    // has the drawing.
    await expect(p.running).toBeHidden();
    await expect(page.locator('#app')).not.toHaveAttribute('inert', '');
    // And Start stays, so a re-run after changing a setting is one click.
    await expect(p.start).toBeVisible();
    await expect(p.start).toHaveText('Convert again');
  });
  test('★ the page keeps answering while the charm takes a heavy design (D-143, DP-52 P4)', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'CPU throttling is a CDP feature');
    test.setTimeout(300_000);

    // MEASURED before this: the logo's Line art design (211,700 triangles)
    // held the main thread for 6.4 s at 4x while the preview parsed it,
    // classified its faces and built its edges. A grid of 400 filled circles
    // is a 25 KB drawing that renders to a mesh of the same kind (about
    // 130,000 triangles at $fn=64), so this measures the preview's stage
    // alone. A traced noise picture was tried first: its multi-megabyte SVG
    // pays seconds more for its own hand-off (the data URL round trips, the
    // URL hash sync and the storage save, D-150), which hid the preview's
    // stage behind another defect.
    await openCharm(page);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

    const circles = [];
    for (let row = 0; row < 20; row++) {
      for (let col = 0; col < 20; col++) {
        const cx = 25 + col * 50;
        const cy = 25 + row * 50;
        circles.push(
          `<path d="M${cx - 18},${cy} a18,18 0 1,0 36,0 a18,18 0 1,0 -36,0 z"/>`
        );
      }
    }
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="0 0 1000 1000">' +
      `<g fill="#000000">${circles.join('')}</g></svg>`;
    await page.locator('#param-design_file').setInputFiles({
      name: 'dots.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from(svg),
    });

    // From the moment the drawing goes in until the preview says ready
    // again, ask the page a trivial question every 100 ms and keep the
    // longest wait for an answer.
    let worst = 0;
    let sawWork = false;
    const deadline = Date.now() + 240_000;
    while (Date.now() < deadline) {
      const sent = Date.now();
      const state = await page.evaluate(
        () =>
          document
            .querySelector('.preview-state-indicator')
            ?.textContent?.trim() || ''
      );
      const took = Date.now() - sent;
      if (took > worst) worst = took;
      if (!/ready/i.test(state)) sawWork = true;
      else if (sawWork) break;
      await page.waitForTimeout(100);
    }
    expect(
      sawWork,
      'the preview never left ready, so the design was not rendered'
    ).toBe(true);
    expect(
      worst,
      `the page took ${worst} ms to answer while the charm took the design`
    ).toBeLessThan(1500);
  });
});

// ── DP-57: a setting changed on a picture that is not quick waits for the
// press (D-157) ──────────────────────────────────────────────────────────────
//
// The owner's fourth walk: "The colors processing option … is still auto
// processing rather than prompting the user to start the process which
// results in long processing times that are not user driven." MEASURED at 6x
// on a phone-sized page: Colors chosen, a conversion running 300 ms later,
// with no dialog for its first second (a self-start's grace), on a picture
// the same rule had just refused to start by itself when chosen. One rule
// now, in both places. RED on the build before this release.
test.describe('a changed setting waits for the press where the picture is not quick (DP-57, D-157)', () => {
  test('★ D-157: after a slow conversion, Colors chosen offers Convert again and starts nothing', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'CPU throttling is a CDP feature');
    test.setTimeout(300_000);
    await openCharm(page);
    await page.evaluate(() => {
      window.__heard = [];
      const node = document.getElementById('srAnnouncer');
      if (!node) return;
      new MutationObserver(() => {
        const t = node.textContent.trim();
        if (t) window.__heard.push(t);
      }).observe(node, { childList: true, characterData: true, subtree: true });
    });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

    // 2000 x 2000 is 4 MP: never quick, always the person's press.
    await choosePicture(page, 2000, 'plain');
    const p = panel(page);
    await expect(p.start).toBeVisible({ timeout: 120_000 });
    await p.start.click();
    await expect(p.info).toContainText('converted from', { timeout: 240_000 });
    await expect(p.running).toBeHidden();
    await expect(p.start).toHaveText('Convert again');

    // The change: Colors, on the card, as the owner did.
    const colours = page.locator('input[type="radio"][value="colours"]');
    await colours.evaluate((el) => {
      el.checked = true;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    // Nothing starts: no dialog, no re-read, and the summary is still the
    // Line art sentence; a run would have replaced it with the Colors one.
    await page.waitForTimeout(2500);
    await expect(p.running).toBeHidden();
    await expect(page.locator('.ink-controls-summary')).toContainText(
      /shapes? traced/
    );
    await expect(page.locator('.ink-controls-summary')).not.toContainText(
      /and the wall|Re-reading/
    );
    await expect(p.start).toBeVisible();
    await expect(p.start).toHaveText('Convert again');
    await expect(p.note).toContainText('Convert again when you are ready.');
    const heard = await page.evaluate(() => window.__heard ?? []);
    expect(
      heard.some((t) => /^Colors\. .*Convert again when you are ready\.$/.test(t)),
      `heard: ${heard.join(' | ')}`
    ).toBe(true);

    // The press is the person's: the dialog stands at once, and the run is
    // the Colors one.
    await p.start.click();
    await expect(p.running).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.ink-controls-summary')).toContainText(
      /colors? in the artwork, and the wall/,
      { timeout: 240_000 }
    );
    await expect(p.note).not.toContainText('Convert again when you are ready.');
  });
});
