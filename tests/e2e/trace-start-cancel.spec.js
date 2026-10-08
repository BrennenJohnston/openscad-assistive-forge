/**
 * E2E: the person starts the conversion, watches it, and can always stop it.
 *
 * A picture that began converting the moment it was chosen, on the main
 * thread, with no way to stop it, would leave a device that struggled with
 * a page that could not be used or recovered.
 *
 * What is guarded here is not that a conversion succeeds. It is that:
 *
 *   - nothing heavy starts until the person asks for it,
 *   - the page still answers while it works,
 *   - Cancel stops it at any moment and says so, once,
 *   - and a completed conversion speaks exactly once.
 *
 * The pictures are built inside the test and never stored: a fixture that
 * heavy has no business in the repository.
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
        // A light drawing on a dark, saturated ground, the navy taken from a
        // real logo.
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

/**
 * A grid of gears on white, one traced shape each and many curve points per
 * shape: a big picture (1400 px, 1.96 MP, so it waits to be started) whose
 * shape count a test can choose and whose parse is long. 30 x 30 with twelve
 * teeth is 900 shapes, under the cap of 1,000, so the whole conversion runs.
 * On the charm host: 900 shapes, an 870 KB trace of 248,000 ring points.
 * The noise field is the picture for a trace over the cap, which is
 * refused before the page's own stages.
 */
async function chooseGearGrid(page, perSide, teeth) {
  await page.evaluate(
    async ({ perSide, teeth }) => {
      const n = 1400;
      const canvas = document.createElement('canvas');
      canvas.width = n;
      canvas.height = n;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, n, n);
      ctx.fillStyle = '#000000';
      const cell = n / perSide;
      const rOut = cell * 0.42;
      const rIn = cell * 0.3;
      const steps = teeth * 2;
      for (let row = 0; row < perSide; row++) {
        for (let col = 0; col < perSide; col++) {
          const cx = (col + 0.5) * cell;
          const cy = (row + 0.5) * cell;
          ctx.beginPath();
          for (let k = 0; k < steps; k++) {
            const a = (k / steps) * Math.PI * 2;
            const r = k % 2 === 0 ? rOut : rIn;
            const x = cx + Math.cos(a) * r;
            const y = cy + Math.sin(a) * r;
            if (k === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.closePath();
          ctx.fill();
        }
      }
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
      window.__testPicture = new File([blob], 'gears.png', {
        type: 'image/png',
      });
    },
    { perSide, teeth }
  );
  await page.evaluate(() => {
    const input = document.querySelector('#param-design_file');
    const dt = new DataTransfer();
    dt.items.add(window.__testPicture);
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

/**
 * A grid of filled dots on flat white, one traced shape each: a file (no
 * grain, a flat ground, so the photo defaults leave it alone) whose shape
 * count a test can choose. 34 x 34 is 1,156, over the editor's cap of
 * 1,000, refused by construction. (White noise is a photograph by every
 * measure, so it is smoothed and floored before it is traced, and is not
 * a picture that is refused.)
 */
async function chooseDotGrid(page, perSide, size = 2000) {
  await page.evaluate(
    async ({ perSide, n }) => {
      const canvas = document.createElement('canvas');
      canvas.width = n;
      canvas.height = n;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, n, n);
      ctx.fillStyle = '#000000';
      const cell = n / perSide;
      for (let row = 0; row < perSide; row++) {
        for (let col = 0; col < perSide; col++) {
          ctx.beginPath();
          ctx.arc(
            (col + 0.5) * cell,
            (row + 0.5) * cell,
            cell * 0.28,
            0,
            Math.PI * 2
          );
          ctx.fill();
        }
      }
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
      window.__testPicture = new File([blob], 'dots.png', {
        type: 'image/png',
      });
    },
    { perSide, n: size }
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
// The bar, the stage sentence and Cancel live in the conversion
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
 * A picture under half a megapixel usually starts by itself, but the
 * quick look makes that call from a prediction, and on a slow machine it
 * declines and waits to be asked (at 6x CPU throttling the same picture
 * that converts by itself in 1.0 s at 4x sits at "Ready to convert" with
 * a Start button, ninety seconds later still). A test that presses Start
 * once, the instant the file goes in, passes on a fast machine and times
 * out on a CI runner.
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

test.describe('Start, a bar that moves, and Cancel', () => {
  // The mid-conversion checks use one run each: one to prove the page
  // answers while it works, one to prove Cancel stops it. All three in one
  // run would have to land inside a window a slower runner can miss, since
  // Potrace converts this picture in under two seconds.
  //
  // CPU throttling barely moves that number (1,872 ms at 4x, 1,677 at 10x,
  // 1,591 at 20x), because Emulation.setCPUThrottlingRate throttles the main
  // thread and the trace does not run there. Throttling is still the right
  // way to ask "does the page answer", which is what it is used for below;
  // it is not a way to make the conversion last longer.
  //
  // The stage sentence is collected by an observer from before the start,
  // because it is transient and sampling it is a race by construction.
  test('a big picture waits to be started, and answers a click while it works', async ({
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

    // A big picture that converts is the gear grid: 1.96 MP, so it waits to be
    // started, and 900 shapes. (The noise field traces into thousands of
    // shapes, over the editor's cap, and is refused before the page's own
    // stages run; its own guard is below.)
    await chooseGearGrid(page, 30, 12);
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
    // A press on Start shows the dialog at once, in front of an inert
    // page, with Cancel holding focus.
    await expect(p.running).toBeVisible({ timeout: 30_000 });
    await expect(p.dialog).toHaveAttribute('aria-modal', 'true');
    await expect(page.locator('#app')).toHaveAttribute('inert', '');
    await expect(p.cancel).toBeFocused();

    // The point: the page answers while the conversion runs.
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
    // The page's own stages are shown, not only the worker's.
    expect(stages, `stage line showed ${JSON.stringify(stages)}`).toContain(
      'Preparing the drawing'
    );
    // And the dialog is gone, and the page is live, once the charm has it.
    await expect(p.running).toBeHidden({ timeout: 30_000 });
    await expect(page.locator('#app')).not.toHaveAttribute('inert', '');
  });

  test('Cancel stops a conversion and says so, once', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'CPU throttling is a CDP feature');
    test.setTimeout(300_000);

    await openCharm(page);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

    // The gear grid, a file of 900 shapes: seconds of trace and sliced stages
    // at 4x, which is the window a Cancel needs. Noise would not do: it is a
    // photograph, smoothed and floored to almost nothing in the worker (which
    // the throttle does not slow), so the dialog can close before the click
    // lands.
    await chooseGearGrid(page, 30, 12);
    const p = panel(page);
    await expect(p.start).toBeVisible({ timeout: 120_000 });

    // Cancel is the first thing that happens after the bar appears: anything
    // else in front of the click spends the window.
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

  test('the quick look says what the picture is before anything is started, and never blocks it', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'CPU throttling is a CDP feature');
    test.setTimeout(300_000);

    // A person may choose a photograph without realising the work, or
    // that a simpler picture would give a better charm. The sentence says so
    // before Start, and it is a paragraph rather than anything that has to be
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

  test('a light drawing on a dark ground is turned around, not thrown away', async ({
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

    // The navy must not be thrown away by the chroma gate before the "more
    // than half is ink, turn it around" rule can fire, or this would emit an
    // empty drawing as the design.
    const summary = await page
      .locator('.ink-controls-summary')
      .first()
      .textContent();
    expect(summary).not.toMatch(/^0 shapes traced/);
    expect(summary).toMatch(/turned around/i);
  });

  test('a conversion that keeps nothing is not emitted, and not called ready', async ({
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

  test('a setting changed while a conversion runs starts it over with the new setting', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'CPU throttling is a CDP feature');
    test.setTimeout(300_000);

    // On a slow runner a Colors switch can land while the first conversion
    // still runs, and a job that refused it ("A conversion is already
    // running") would lose the switch and let the first conversion's result
    // stand. The job supersedes a running conversion, as the trace runner does.
    await openCharm(page);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

    await choosePicture(page, 2000, 'plain');
    const p = panel(page);
    await expect(p.start).toBeVisible({ timeout: 120_000 });
    await p.start.click();

    // Colors, dispatched right behind the press. When the change lands while
    // the first run is still going, the job supersedes it (the unit case pins
    // that); on a runner where the plain square is over before the change's
    // 180 ms debounce fires, the change waits for the person's press, and the
    // press is made here. Either way the conversion that finishes has to be
    // the Colors one, and nothing may say "already running".
    const colours = page.locator('input[type="radio"][value="colours"]');
    await colours.evaluate((el) => {
      el.checked = true;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const summary = page.locator('.ink-controls-summary');
    await page.waitForTimeout(2000);
    await expect(summary).not.toContainText(/already running/);
    await expect(p.info).not.toContainText(/already running/);
    await expect
      .poll(
        async () => {
          const text = (await summary.textContent().catch(() => '')) || '';
          if (/colors? in the artwork, and the wall/.test(text)) return 'done';
          const label = (await p.start.textContent().catch(() => '')) || '';
          const offered =
            (await p.start.isVisible().catch(() => false)) &&
            /Convert again/.test(label) &&
            !(await p.running.isVisible().catch(() => false));
          if (offered) await p.start.click({ noWaitAfter: true }).catch(() => {});
          return text.slice(0, 40);
        },
        { timeout: 240_000, intervals: [1000] }
      )
      .toBe('done');

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

    // At most 0.5 MP may start by itself, through the same job and the same
    // Cancel: there is no second, invisible path. A conversion nobody pressed
    // shows the dialog only once it has run for the quick band, so a
    // sub-second one never flashes it. 400 x 400 is 0.16 MP.
    await openCharm(page);
    await choosePicture(page, 400, 'plain');
    const p = panel(page);

    // The rule's other half: on a machine the quick look calls slow, nothing
    // starts by itself, so the auto-start cannot be observed there. A slow CI
    // runner is such a machine, and this test says so rather than fail for a
    // rule it is not about.
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
  test('the page keeps answering while the charm takes a heavy design', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'CPU throttling is a CDP feature');
    test.setTimeout(300_000);

    // A heavy design (a logo's Line art: 211,700 triangles) can hold the main
    // thread for seconds while the preview parses it, classifies its faces and
    // builds its edges. A grid of 400 filled circles is a 25 KB drawing that
    // renders to a mesh of the same kind (about 130,000 triangles at $fn=64),
    // so this measures the preview's stage alone; a traced noise picture would
    // add seconds of its own hand-off (data URL round trips, the URL hash sync
    // and the storage save) and hide the preview's stage behind them.
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

// ── A setting changed on a picture that is not quick waits for the press ─────
//
// Choosing Colors on a picture that is not quick must offer Convert again,
// not start a conversion by itself: the rule that keeps a chosen picture
// from starting by itself applies to a changed setting too.
test.describe('a changed setting waits for the press where the picture is not quick', () => {
  test('after a slow conversion, Colors chosen offers Convert again and starts nothing', async ({
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

    // The change: Colors, on the card.
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

// ── A changed setting never starts by itself, quick or not ───────────────────
//
// Choosing Colors after a conversion must not reprocess the image without
// the person's input, even on a small, quick picture: a change is a
// decision, and the press is the person's.
test.describe('a changed setting waits for the press, quick picture or not', () => {
  test('on a small quick picture, Colors chosen after a conversion starts nothing and offers Convert again', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'the quick look calls the picture quick on this lane; the others are slower and would prove less');
    test.skip(!!process.env.CI, 'D-191: a starved CI runner is not quick, so the picture waits for a press instead of converting by itself; this case runs on local boards');
    test.setTimeout(240_000);
    await openCharm(page);
    // 400 x 400 is 0.16 MP: under the half-megapixel line, and quick on a
    // desktop, so it converts by itself when chosen.
    await choosePicture(page, 400, 'plain');
    const p = panel(page);
    await expect(p.info).toContainText('converted from', { timeout: 120_000 });
    await expect(p.start).toHaveText('Convert again');

    const colours = page.locator('input[type="radio"][value="colours"]');
    await colours.evaluate((el) => {
      el.checked = true;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(2500);
    await expect(p.running).toBeHidden();
    await expect(page.locator('.ink-controls-summary')).not.toContainText(
      /and the wall|Re-reading/
    );
    await expect(p.start).toBeVisible();
    await expect(p.start).toHaveText('Convert again');
    await expect(p.note).toContainText('Press Convert again when you are ready.');

    // The press runs the Colors conversion, with the dialog in front.
    await p.start.click();
    await expect(page.locator('.ink-controls-summary')).toContainText(
      /colors? in the artwork, and the wall/,
      { timeout: 120_000 }
    );
  });
});

// ── The shape gate, and a Cancel that lands ──────────────────────────────────
//
// A Cancel must land while the drawing is being prepared, and a trace over
// the cap must be refused before anything is prepared. Preparing a large
// trace as one long task (5,144 ms at 4x) leaves a Cancel click nowhere to
// land for seconds, and analyzing a trace over the cap only to refuse it
// and emit it anyway wastes all of that work.
test.describe('the shape gate, and a Cancel that lands', () => {
  /** Every sentence the stage line shows, from before the dialog exists. */
  async function watchStages(page) {
    await page.evaluate(() => {
      window.__stages = [];
      window.__preparingSeen = false;
      const attach = () => {
        const el = document.querySelector('.conversion-dialog-stage');
        if (!el) return false;
        const note = () => {
          const t = (el.textContent || '').trim();
          if (t && !window.__stages.includes(t)) window.__stages.push(t);
          if (t === 'Preparing the drawing') window.__preparingSeen = true;
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
  }

  const designFile = (page) =>
    page.evaluate(() => {
      const v = window.stateManager?.getState()?.parameters?.design_file;
      return v && typeof v === 'object' ? v.name : v;
    });

  test('a trace over the cap is refused before anything is prepared: nothing emitted, the card says what to try', async ({
    page,
  }) => {
    test.slow();
    test.setTimeout(300_000);
    await openCharm(page);
    // The page's own start-up announcements ("Preview ready", then the
    // model's echo messages) must be over before the refusal is announced:
    // the polite announcer replaces a sentence still inside its 350 ms
    // debounce with the next one, and the dot grid below is refused within
    // two seconds of Start, while the first preview can still be landing.
    // Run alone, the refusal is announced into that window, and what is heard
    // is "Preview ready" and the echo lines, never the sentence.
    await expect(page.locator('#statusArea')).toContainText('Preview ready', {
      timeout: 240_000,
    });
    await page.waitForTimeout(2_000);
    await page.evaluate(() => {
      window.__heard = [];
      const node = document.getElementById('srAnnouncer');
      if (!node) return;
      new MutationObserver(() => {
        const t = node.textContent.trim();
        if (t) window.__heard.push(t);
      }).observe(node, { childList: true, characterData: true, subtree: true });
    });
    await watchStages(page);

    // 1,156 dots, a file over the cap. (Noise would not do: it is a
    // photograph, smoothed and floored first, so it comes in under the cap.)
    await chooseDotGrid(page, 34, 2000);
    const p = panel(page);
    await expect(p.start).toBeVisible({ timeout: 120_000 });
    await expect(p.start).toHaveText('Start conversion');
    await p.start.click();

    // The card says what happened, in the words of the text pack, with no
    // editor button: there is no drawing to open, and no design was emitted.
    const badge = page.locator('.svg-prep-status-badge').first();
    await expect(badge).toContainText('Too many shapes to work with (', {
      timeout: 240_000,
    });
    await expect(page.locator('.svg-prep-status-guidance').first()).toContainText(
      'and the editor can work with 1,000 at a time. Try Solid shape, fewer colors, or a closer crop, then Convert again.'
    );
    await expect(page.locator('.svg-prep-status .svg-prep-edit-btn')).toHaveCount(
      0
    );

    // Nothing was emitted: the model keeps whatever design it had.
    await expect(p.info).toContainText('too many shapes to work with');
    await expect(p.info).not.toContainText('converted from');
    const design = await designFile(page);
    expect(design, `design_file after a refused conversion: ${design}`).toBeFalsy();

    // The dialog is gone, the page is live, Convert again is the next press.
    await expect(p.running).toBeHidden();
    await expect(page.locator('#app')).not.toHaveAttribute('inert', '');
    await expect(p.start).toBeVisible();
    await expect(p.start).toHaveText('Convert again');
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);

    // The page's own stages were never entered: the refusal came before the
    // credit line and the parse.
    const stages = await page.evaluate(() => window.__stages);
    expect(stages, `stage line showed ${JSON.stringify(stages)}`).not.toContain(
      'Preparing the drawing'
    );
    expect(stages).not.toContain('Updating the charm');

    // One announcement, the sentence itself; never "Converted". Polled, then
    // judged with everything that WAS heard in the message, so a miss says
    // what took its place.
    const deadline = Date.now() + 15_000;
    let heard = [];
    while (Date.now() < deadline) {
      heard = await page.evaluate(() => window.__heard ?? []);
      if (heard.some((t) => t.startsWith('This picture traced into'))) break;
      await page.waitForTimeout(300);
    }
    expect(
      heard.filter((t) => t.startsWith('This picture traced into')).length,
      `heard: ${heard.join(' | ')}`
    ).toBe(1);
    expect(
      heard.filter((t) => t.startsWith('Converted: ')),
      `heard: ${heard.join(' | ')}`
    ).toEqual([]);
  });

  test('Cancel pressed while the drawing is being prepared lands within a second, and nothing is emitted', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'CPU throttling is a CDP feature');
    test.setTimeout(300_000);
    await openCharm(page);
    const cdp = await page.context().newCDPSession(page);
    // Eight times slower, not four: at 4x the whole stage on a single-task
    // build is under a second, so a Cancel there would land at an earlier
    // checkpoint and the guard could not tell a sliced build from an unsliced
    // one. At 8x an unsliced stage is one task of about 1.5 s with the emit's
    // task 1.7 s behind it, and a click waits for both; sliced, each slice is
    // a tenth of that, whatever the throttle, and the label is painted before
    // the first of them.
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 8 });

    await chooseGearGrid(page, 30, 12);
    const p = panel(page);
    await expect(p.start).toBeVisible({ timeout: 120_000 });
    await expect(p.start).toHaveText('Start conversion');
    await watchStages(page);

    await p.start.click();
    await expect
      .poll(() => page.evaluate(() => window.__preparingSeen === true), {
        timeout: 120_000,
        intervals: [25, 50, 100],
      })
      .toBe(true);

    // Cancel, the moment the page says it is preparing: a pointer press at the
    // button's center, with none of the actionability round trips a locator
    // click makes (each of those waits for the thread too, and can outlast
    // the stage). The press lands at the next checkpoint inside the stage,
    // and cancelConversion closes the dialog the instant it lands: how long
    // that takes is the measurement.
    const box = await p.cancel.boundingBox();
    expect(box, 'the Cancel button was on screen to be pressed').not.toBeNull();
    const pressedAt = Date.now();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(p.running).toBeHidden({ timeout: 15_000 });
    const gone = Date.now() - pressedAt;
    expect(
      gone,
      `the dialog was gone ${gone} ms after Cancel was pressed`
    ).toBeLessThan(1000);
    await expect(page.locator('#app')).not.toHaveAttribute('inert', '');
    await expect(p.info).toHaveText('Conversion canceled');
    await expect(p.start).toBeVisible();
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);

    // Nothing was emitted, then or a moment later: the job stopped at its
    // checkpoint and the emit never ran.
    await page.waitForTimeout(1500);
    const design = await designFile(page);
    expect(design, `design_file after a cancelled conversion: ${design}`).toBeFalsy();
    await expect(p.info).toHaveText('Conversion canceled');

    const stages = await page.evaluate(() => window.__stages);
    expect(stages, `stage line showed ${JSON.stringify(stages)}`).toContain(
      'Preparing the drawing'
    );
    expect(stages).not.toContain('Updating the charm');
  });
});
