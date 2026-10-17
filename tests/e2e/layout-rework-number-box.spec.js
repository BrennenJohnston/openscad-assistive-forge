import { test, expect } from '@playwright/test';
import path from 'path';

// The Customizer's number boxes are as wide as their longest value, and the
// slider beside each one keeps the rest of the row: on a desktop window, and
// in the Customizer that comes in from the left on a phone. A box never cuts
// off its own value.

const isCI = !!process.env.CI;
const WASM_READY_TIMEOUT = 180_000;
/** Three touch targets: the least a slider is given beside its box. */
const SLIDER_MIN_PX = 132;

async function openCharm(page) {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
    localStorage.setItem('openscad-forge-theme', 'dark');
    localStorage.setItem(
      'openscad-forge-ui-mode',
      JSON.stringify({ mode: 'standard', lastCustomMode: 'standard' })
    );
  });
  await page.goto('/?example=q-charm', { timeout: 60_000 });
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: WASM_READY_TIMEOUT,
  });
  await page
    .locator('.param-control')
    .first()
    .waitFor({ state: 'attached', timeout: 60_000 });
  const notNow = page.locator('#saveProjectNotNow');
  if (
    await notNow.waitFor({ state: 'visible', timeout: 3_000 }).then(
      () => true,
      () => false
    )
  ) {
    await notNow.click();
  }
}

/** Every shown slider row's slider and box, read in the page. */
function readRows() {
  for (const d of document.querySelectorAll('#parametersContainer details')) {
    d.open = true;
  }
  const out = [];
  for (const control of document.querySelectorAll(
    '#paramPanel .param-control'
  )) {
    const range = control.querySelector(
      '.slider-container input[type="range"]'
    );
    const box = control.querySelector('.slider-spinbox');
    if (!range || !box) continue;
    const r = range.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    if (!r.width || !b.width) continue;
    out.push({
      name: control.dataset.paramName,
      slider: r.width,
      box: b.width,
      sameRow: Math.abs(r.top + r.height / 2 - (b.top + b.height / 2)) < 8,
      clipped: box.scrollWidth > box.clientWidth + 1,
    });
  }
  return out;
}

function expectRows(rows) {
  expect(rows.length, 'slider rows on the page').toBeGreaterThan(10);
  const narrow = rows.filter((r) => r.slider + 0.5 < SLIDER_MIN_PX);
  const apart = rows.filter((r) => !r.sameRow);
  const clipped = rows.filter((r) => r.clipped);
  expect
    .soft(
      narrow.map((r) => `${r.name} ${Math.round(r.slider)} px`),
      `sliders under ${SLIDER_MIN_PX} px`
    )
    .toEqual([]);
  expect
    .soft(
      apart.map((r) => r.name),
      'sliders not on the row of their box'
    )
    .toEqual([]);
  expect
    .soft(
      clipped.map((r) => r.name),
      'boxes that cut off their value'
    )
    .toEqual([]);
  const wide = rows.filter((r) => r.box > r.slider);
  expect
    .soft(
      wide.map(
        (r) =>
          `${r.name} box ${Math.round(r.box)} slider ${Math.round(r.slider)}`
      ),
      'boxes wider than their slider'
    )
    .toEqual([]);
}

test.describe('The Customizer number box and its slider', () => {
  test.describe('on a desktop window, 1280 x 720', () => {
    test.use({ viewport: { width: 1280, height: 720 } });

    test('the box fits its value and the slider takes the rest of the row', async ({
      page,
    }) => {
      test.setTimeout(WASM_READY_TIMEOUT + 60_000);
      await openCharm(page);
      await page.waitForTimeout(500);
      expectRows(await page.evaluate(readRows));
    });
  });

  test.describe('on a phone held upright, 412 x 915', () => {
    // No isMobile: Firefox rejects it when the browser context is created.
    test.use({ viewport: { width: 412, height: 915 }, hasTouch: true });

    test('in the Customizer from the left, the box and the slider share a row', async ({
      page,
    }) => {
      test.setTimeout(WASM_READY_TIMEOUT + 60_000);
      await openCharm(page);
      const toggle = page.locator('#mobileDrawerToggle');
      await toggle.focus();
      await page.keyboard.press('Enter');
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await page.waitForTimeout(600);
      expectRows(await page.evaluate(readRows));
    });
  });

  test.describe('a number with no slider, 1280 x 720', () => {
    test.use({ viewport: { width: 1280, height: 720 } });

    test('is as wide as its value, not the whole row', async ({ page }) => {
      test.skip(
        isCI,
        'Opening a file of your own is slow and unreliable in CI'
      );
      test.setTimeout(WASM_READY_TIMEOUT + 60_000);
      await page.addInitScript(() => {
        localStorage.setItem('openscad-forge-first-visit-seen', 'true');
        localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
      });
      const ready = page.waitForEvent('console', {
        predicate: (msg) => msg.text().includes('OpenSCAD WASM ready'),
        timeout: 120_000,
      });
      await page.goto('/');
      await ready;
      await page.setInputFiles(
        '#fileInput',
        path.join(
          process.cwd(),
          'tests',
          'fixtures',
          'layout-rework-numbers.scad'
        )
      );
      const field = page.locator('#param-plain_length');
      await field.waitFor({ state: 'attached', timeout: 30_000 });
      const notNow = page.locator('#saveProjectNotNow');
      if (
        await notNow.waitFor({ state: 'visible', timeout: 3_000 }).then(
          () => true,
          () => false
        )
      ) {
        await notNow.click();
      }
      await page.evaluate(() => {
        for (const d of document.querySelectorAll(
          '#parametersContainer details'
        )) {
          d.open = true;
        }
      });
      await field.scrollIntoViewIfNeeded();
      const m = await field.evaluate((el) => {
        const row = el.closest('.param-control').getBoundingClientRect();
        return {
          width: el.getBoundingClientRect().width,
          row: row.width,
          clipped: el.scrollWidth > el.clientWidth + 1,
        };
      });
      expect
        .soft(
          m.width,
          `the field is ${Math.round(m.width)} px of a ${Math.round(m.row)} px row`
        )
        .toBeLessThan(m.row / 2);
      expect.soft(m.clipped, 'the field shows its whole value').toBe(false);
    });
  });
});
