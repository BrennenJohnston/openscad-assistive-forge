/**
 * E2E: a design built as a STACK of passes (DP-7, DP-8).
 *
 * The acceptance story: three nested squares go in as one drawing, the app
 * works out that they are nested three deep, writes one compound-path SVG per
 * pass, and q-charm builds them as a stepped pyramid on the charm face - each
 * pass standing on the one before it rather than on air.
 *
 * The thing worth guarding is not that files appear. It is that they appear
 * TOGETHER with their aspects, at their true relative sizes, and that the
 * charm actually renders from them.
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test';
import path from 'node:path';

const SQUARES = path.join(
  process.cwd(),
  'tests',
  'fixtures',
  'svg-edit',
  'nested-squares.svg'
);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
  });
});

async function openCharm(page) {
  await page.goto('/');
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    timeout: 120000,
  });
  await page.selectOption('#charmVariantSelect', 'q-charm');
  await page.click('#openCharmMakerBtn');
  await page.waitForFunction(
    () =>
      Object.keys(window.stateManager?.getState()?.parameters || {}).length > 0,
    null,
    { timeout: 120000 }
  );
  for (let i = 0; i < 2; i++) {
    const notNow = page.getByRole('button', { name: 'Not now', exact: true });
    if (await notNow.isVisible().catch(() => false)) {
      await notNow.click();
      await page.waitForTimeout(300);
    }
  }
}

const layerState = (page) =>
  page.evaluate(() => {
    const p = window.stateManager?.getState()?.parameters || {};
    const nm = (v) => (v && typeof v === 'object' ? v.name : v);
    return {
      design: nm(p.design_file),
      layers: [1, 2, 3].map((n) => nm(p[`design_layer_${n}`])),
      aspects: [1, 2, 3].map((n) => p[`design_layer_${n}_aspect`]),
    };
  });

/**
 * Build the stack the way a person does: open the editor, SET a layer on each
 * shape that is meant to stand on another, and apply.
 *
 * D-135 (the owner at DP-Q44) stopped the app assigning layers on the plain
 * upload path; D-142 (DP-51, the owner's second walk) finished the job in the
 * EDITOR, where the column used to arrive pre-filled from nesting depth. It
 * now starts at all ones, so building a stack means choosing the layers - and
 * this helper does what the person does, rather than pressing Apply over a
 * column the app filled in.
 */
async function openTheEditor(page) {
  // The editor's door lives in the design control's status card, inside the
  // Design group, which ships collapsed like every other parameter group.
  await page.evaluate(() => {
    const input = document.querySelector('#param-design_file');
    let d = input?.closest('details');
    while (d) {
      d.open = true;
      d = d.parentElement?.closest('details');
    }
  });
  const door = page
    .getByRole('button', { name: 'Open the drawing editor' })
    .first();
  await door.waitFor({ state: 'visible', timeout: 60000 });
  await door.scrollIntoViewIfNeeded();
  await door.click({ timeout: 30000 });
}

async function buildStackInTheEditor(page) {
  await openTheEditor(page);
  const layerSelects = page.locator('.svg-prep-layer-select');
  await expect
    .poll(() => layerSelects.count(), { timeout: 60000 })
    .toBeGreaterThan(0);
  // The column starts at all ones (D-142). The middle square goes on layer 2
  // and the inner one on layer 3, which is the stack the rest of this file
  // measures: each pass standing on the one before it.
  //
  // The select lives in the row's More panel, which is shut until it is
  // asked for - so this presses More first, exactly as a person has to.
  const rows = page.locator('.svg-prep-object');
  for (const [row, layer] of [
    [1, '2'],
    [2, '3'],
  ]) {
    await rows.nth(row).locator('.svg-prep-more-btn').click();
    await layerSelects.nth(row).selectOption(layer);
  }
  const chosen = await layerSelects.evaluateAll((els) =>
    els.map((e) => Number(e.value))
  );
  expect(chosen).toEqual([1, 2, 3]);
  await expect(page.getByRole('button', { name: /^Apply/ }).first())
    .toBeEnabled({ timeout: 90000 });
  await page
    .getByRole('button', { name: /^Apply/ })
    .first()
    .click();
  return chosen;
}

test.describe('A design built as a stack of passes (DP-7, DP-8)', () => {
  test('the charm declares three passes, and none is on by default', async ({
    page,
  }) => {
    await openCharm(page);
    const declared = await page.evaluate(() => {
      const p = window.stateManager?.getState()?.parameters || {};
      return Object.keys(p)
        .filter((k) => /^design_layer_\d(_aspect|_depth|_style)?$/.test(k))
        .sort();
    });
    // Three files, three aspects, three depths, three styles.
    expect(declared).toHaveLength(12);

    const before = await layerState(page);
    // Additive: the tiered mode is off until someone fills a pass in, so a
    // charm nobody has touched is the charm that shipped.
    expect(before.layers).toEqual(['', '', '']);
  });

  test('the generated companions are hidden from the Customizer', async ({
    page,
  }) => {
    await openCharm(page);
    // They carry values, never controls: the app writes them from the design,
    // and a person typing into one would be overwritten on the next change.
    for (const n of [1, 2, 3]) {
      await expect(page.locator(`#param-design_layer_${n}`)).toHaveCount(0);
      await expect(page.locator(`#param-design_layer_${n}_aspect`)).toHaveCount(
        0
      );
    }
    // The pass controls a person DOES set are present.
    await expect(page.locator('#param-design_layer_1_depth')).toHaveCount(1);
    await expect(page.locator('#param-design_layer_1_style')).toHaveCount(1);
  });

  test('★ a drawing nobody assigned layers to builds NO stack (D-135)', async ({
    page,
  }) => {
    test.slow();
    await openCharm(page);
    await page.setInputFiles('#param-design_file', SQUARES);

    // The design lands.
    await expect
      .poll(async () => (await layerState(page)).design, { timeout: 90000 })
      .toBe('nested-squares.svg');

    // And the passes stay empty. This used to fill them from nesting depth on
    // every upload, and the model treats any filled layer file as "the stack is
    // on" - so the charm printed 0.80 mm taller than it was asked for, measured
    // from the STL, with 17,742 extra facets. The depth suggestion is still
    // offered; it is just not applied on anyone's behalf.
    await page.waitForTimeout(1500);
    // Empty is empty whether it is the model's declared "" or the null the app
    // emits to CLEAR a previous design's stack. What matters is that no layer
    // carries a file name.
    const { layers } = await layerState(page);
    expect(layers.filter(Boolean), `layers: ${JSON.stringify(layers)}`).toEqual(
      []
    );
  });

  test('★ the editor opens on layer 1, and Apply alone builds NO stack (D-142)', async ({
    page,
  }) => {
    // The owner's second walk, 2026-09-16: "the inside of the R and the A in
    // CREATE came out as a layer 3 shape". MEASURED on their logo before the
    // fix, on this same host: 394 of 553 rows opened on layer 2, 158 on layer
    // 3, and an untouched Apply emitted three layer files of 197,898, 234,598
    // and 53,402 bytes. The column is where the phantom stack was built, so
    // the guard is here: open the editor on a drawing that nests three deep,
    // touch nothing, Apply, and the passes stay empty.
    test.slow();
    await openCharm(page);
    await page.setInputFiles('#param-design_file', SQUARES);
    await expect
      .poll(async () => (await layerState(page)).design, { timeout: 90000 })
      .toBe('nested-squares.svg');

    await openTheEditor(page);
    const layerSelects = page.locator('.svg-prep-layer-select');
    await expect
      .poll(() => layerSelects.count(), { timeout: 60000 })
      .toBeGreaterThan(0);

    // Every shape starts on layer 1, however deep the drawing nests.
    const onOpen = await layerSelects.evaluateAll((els) =>
      els.map((e) => Number(e.value))
    );
    expect(onOpen).toEqual([1, 1, 1]);
    // And it still OFFERS the three the artwork can carry.
    expect(
      await layerSelects.first().locator('option').count(),
      'the drawing nests three deep, so three layers are on offer'
    ).toBe(3);
    await expect(page.locator('.svg-prep-layer-summary')).toContainText(
      'Every shape starts on layer 1'
    );

    await expect(page.getByRole('button', { name: /^Apply/ }).first())
      .toBeEnabled({ timeout: 90000 });
    await page
      .getByRole('button', { name: /^Apply/ })
      .first()
      .click();

    // The design is applied...
    await expect
      .poll(async () => (await layerState(page)).design, { timeout: 90000 })
      .toBe('nested-squares.svg');
    await page.waitForTimeout(2000);
    // ...and not one pass was filled in on the person's behalf.
    const { layers } = await layerState(page);
    expect(
      layers.filter(Boolean),
      `layers after an untouched Apply: ${JSON.stringify(layers)}`
    ).toEqual([]);
  });

  test('★ Apply is not offered while the shapes are still being combined', async ({
    page,
  }) => {
    // Firefox on CI found this one by pressing Apply faster than the combine
    // could finish. The combine left the main thread at DP-37 P2, so between
    // the editor opening and the result landing there are now seconds of
    // worker start-up - and Apply's handler refuses a null result by
    // RETURNING. The button was enabled the whole time and did nothing at all
    // when pressed: no stack, no message, no closed editor.
    //
    // The window is milliseconds on a fast machine, so this watches the
    // MUTATION rather than polling for a state that would be over before the
    // first sample. The observer is armed before the editor exists.
    test.slow();
    await openCharm(page);
    await page.setInputFiles('#param-design_file', SQUARES);
    await expect
      .poll(async () => (await layerState(page)).design, { timeout: 90000 })
      .toBe('nested-squares.svg');

    await page.evaluate(() => {
      window.__combine = { sawBusy: false, applyLive: [], rowShown: false };
      new MutationObserver(() => {
        const pane = document.querySelector('.svg-prep-result-pane');
        if (!pane || pane.getAttribute('aria-busy') !== 'true') return;
        window.__combine.sawBusy = true;
        const apply = document.querySelector('button[data-action="apply"]');
        if (apply) window.__combine.applyLive.push(!apply.disabled);
        const row = document.querySelector('.svg-prep-render-row');
        if (row && !row.hidden) window.__combine.rowShown = true;
      }).observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['aria-busy', 'disabled', 'hidden'],
      });
    });

    await openTheEditor(page);
    await expect
      .poll(() => page.locator('.svg-prep-layer-select').count(), {
        timeout: 60000,
      })
      .toBeGreaterThan(0);

    const seen = await page.evaluate(() => window.__combine);
    expect(seen.sawBusy, 'the combine never reported itself as busy').toBe(
      true
    );
    // Never enabled with nothing behind it.
    expect(
      seen.applyLive.filter(Boolean).length,
      `Apply was pressable ${seen.applyLive.filter(Boolean).length} times while combining`
    ).toBe(0);
    // And a person can SEE the work: the bar and its Cancel live inside the
    // render row, which on a small drawing is hidden the rest of the time, so
    // unhiding the two of them alone showed nothing.
    expect(seen.rowShown, 'nothing on screen said it was combining').toBe(true);

    // Then it lands, and Apply means something again.
    await expect(page.getByRole('button', { name: /^Apply/ }).first())
      .toBeEnabled({ timeout: 90000 });
  });

  test('★ three nested squares become three passes when asked, and the charm renders', async ({
    page,
  }) => {
    test.slow();
    await openCharm(page);
    await page.setInputFiles('#param-design_file', SQUARES);
    await expect
      .poll(async () => (await layerState(page)).design, { timeout: 90000 })
      .toBe('nested-squares.svg');

    await buildStackInTheEditor(page);

    // All three passes arrive; the deepest is the slowest to appear because it
    // is written last.
    await expect
      .poll(
        async () => (await layerState(page)).layers.filter(Boolean).length,
        {
          timeout: 90000,
        }
      )
      .toBe(3);

    const after = await layerState(page);
    expect(after.design).toBe('nested-squares.svg');
    expect(after.layers).toEqual([
      'nested-squares_layer_1.svg',
      'nested-squares_layer_2.svg',
      'nested-squares_layer_3.svg',
    ]);
    // Every pass carries a measured aspect in the SAME state as its file
    // (D-108's law): a file whose companion has not caught up would be fitted
    // against the wrong ratio.
    for (const a of after.aspects) expect(a).toBeCloseTo(1, 2);

    // And the model builds from them. The engine is the judge here, not a
    // screenshot: a stack that does not close would not render at all.
    await expect(page.locator('text=Preview ready').first()).toBeVisible({
      timeout: 120000,
    });
  });

  test('the passes are written at their TRUE relative sizes', async ({
    page,
  }) => {
    test.slow();
    await openCharm(page);
    await page.setInputFiles('#param-design_file', SQUARES);
    await expect
      .poll(async () => (await layerState(page)).design, { timeout: 90000 })
      .toBe('nested-squares.svg');
    await buildStackInTheEditor(page);
    await expect
      .poll(
        async () => (await layerState(page)).layers.filter(Boolean).length,
        {
          timeout: 90000,
        }
      )
      .toBe(3);

    const geometry = await page.evaluate(() => {
      const p = window.stateManager?.getState()?.parameters || {};
      const read = (n) => {
        const v = p[`design_layer_${n}`];
        const text = atob(String(v.data).split(',')[1]);
        const transform = /<g transform="([^"]*)"/.exec(text)[1];
        const d = / d="([^"]*)"/.exec(text)[1];
        const nums = d.match(/-?\d+(\.\d+)?/g).map(Number);
        const xs = nums.filter((_, i) => i % 2 === 0);
        return {
          transform,
          width: Math.max(...xs) - Math.min(...xs),
          canvas: /viewBox="([^"]*)"/.exec(text)[1],
        };
      };
      return [1, 2, 3].map(read);
    });

    // ONE transform across all three. OpenSCAD's resize() fits the CONTENT
    // box, so a per-pass fit would scale the smallest square up to the size
    // of the largest and the stack would print as three identical slabs.
    expect(new Set(geometry.map((g) => g.transform)).size).toBe(1);
    expect(new Set(geometry.map((g) => g.canvas)).size).toBe(1);

    // 36, 20 and 8 units wide in the drawing, and still in that proportion.
    expect(geometry[0].width).toBeCloseTo(36, 3);
    expect(geometry[1].width).toBeCloseTo(20, 3);
    expect(geometry[2].width).toBeCloseTo(8, 3);
  });

  test('changing a pass depth re-renders without disturbing the others', async ({
    page,
  }) => {
    test.slow();
    await openCharm(page);
    await page.setInputFiles('#param-design_file', SQUARES);
    await expect
      .poll(async () => (await layerState(page)).design, { timeout: 90000 })
      .toBe('nested-squares.svg');
    await buildStackInTheEditor(page);
    await expect
      .poll(
        async () => (await layerState(page)).layers.filter(Boolean).length,
        {
          timeout: 90000,
        }
      )
      .toBe(3);

    const before = await layerState(page);
    // The group ships collapsed, like every other parameter group.
    await page.evaluate(() => {
      document
        .getElementById('param-design_layer_2_depth')
        ?.closest('details')
        ?.setAttribute('open', '');
    });
    const depth = page.locator('#param-design_layer_2_depth');
    await expect(depth).toBeVisible({ timeout: 10000 });
    await depth.fill('1.5');
    await depth.dispatchEvent('change');
    await page.waitForTimeout(1500);

    const after = await layerState(page);
    // A depth dial moves geometry, never the files.
    expect(after.layers).toEqual(before.layers);
    await expect(page.locator('text=Preview ready').first()).toBeVisible({
      timeout: 120000,
    });
  });

  test('a pass depth below the 0.4 mm floor is not offered', async ({
    page,
  }) => {
    await openCharm(page);
    // The floor is a printability limit, not a preference: below it a pass
    // does not survive a 0.4 mm nozzle. The assert in the .scad is the real
    // guard; this checks the app does not invite the mistake.
    for (const n of [1, 2, 3]) {
      const min = await page
        .locator(`#param-design_layer_${n}_depth`)
        .getAttribute('min');
      expect(Number(min)).toBe(0.4);
    }
  });
});
