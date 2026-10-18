/**
 * Each of the Alt View's looks has cursors of its own, and no look inherits
 * another's: the green look's arrow and pointer, the amber look's, the DOS
 * look's in its yellow, and under forced colors the system's own. The
 * computed cursor names the file, so this reads it from the page, a button
 * and a text field in each look.
 * @license GPL-3.0-or-later
 */
import { test, expect } from '@playwright/test';
import { skipWithoutWebGL } from './helpers/webgl.js';

const WASM_READY_TIMEOUT = 180_000;

const LOOKS = [
  {
    name: 'green',
    theme: 'dark',
    mode: 'standard',
    arrow: 'cursor-mono.svg',
    pointer: 'cursor-mono-pointer.svg',
  },
  {
    name: 'amber',
    theme: 'light',
    mode: 'standard',
    arrow: 'cursor-mono-amber.svg',
    pointer: 'cursor-mono-amber-pointer.svg',
  },
  {
    name: 'DOS',
    theme: 'dark',
    mode: 'classic',
    arrow: 'cursor-dos.svg',
    pointer: 'cursor-dos-pointer.svg',
  },
];

async function openLook(page, { theme, mode }) {
  await page.addInitScript(
    ({ theme, mode }) => {
      localStorage.setItem('openscad-forge-first-visit-seen', 'true');
      localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
      localStorage.setItem('openscad-forge-theme', theme);
      localStorage.setItem('openscad-customizer-hfm-unlock', 'true');
      localStorage.setItem('openscad-forge-sounds', 'false');
      localStorage.setItem(
        'openscad-forge-ui-mode',
        JSON.stringify({ mode, lastCustomMode: 'standard' })
      );
    },
    { theme, mode }
  );
  await page.goto('/?example=simple-box');
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: WASM_READY_TIMEOUT,
  });
  await skipWithoutWebGL(
    page,
    'no WebGL: the Alt View draws from the 3D picture'
  );
  await page.waitForFunction(() => window.previewManager?.mesh, null, {
    timeout: WASM_READY_TIMEOUT,
  });
  const notNow = page.locator('#saveProjectNotNow');
  if (await notNow.isVisible()) await notNow.click();
  await page.locator('#_hfmToggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-ui-variant', 'mono');
}

/** The computed cursors of the page, a button and a text field. */
function readCursors(page) {
  return page.evaluate(() => {
    const cursor = (el) => (el ? getComputedStyle(el).cursor : null);
    return {
      page: cursor(document.body),
      button: cursor(document.getElementById('primaryActionBtn')),
      field: cursor(document.getElementById('paramSearchInput')),
    };
  });
}

test.describe("Each look's cursors", () => {
  for (const look of LOOKS) {
    test(`${look.name}: the page wears its arrow, a button its pointer, a field the text cursor`, async ({
      page,
    }) => {
      test.setTimeout(WASM_READY_TIMEOUT + 60_000);
      await openLook(page, look);
      const c = await readCursors(page);
      expect(c.page, `${look.name}: the arrow`).toContain(look.arrow);
      expect(c.button, `${look.name}: the pointer`).toContain(look.pointer);
      expect(c.field, `${look.name}: the text cursor`).toBe('text');
      for (const other of LOOKS) {
        if (other === look) continue;
        expect(c.page, `${look.name}: not ${other.name}'s arrow`).not.toContain(
          other.arrow
        );
        expect(
          c.button,
          `${look.name}: not ${other.name}'s pointer`
        ).not.toContain(other.pointer);
      }
    });
  }

  test('under forced colors the system keeps its own cursors', async ({
    page,
  }) => {
    test.setTimeout(WASM_READY_TIMEOUT + 60_000);
    await page.emulateMedia({ forcedColors: 'active' });
    await openLook(page, LOOKS[0]);
    const c = await readCursors(page);
    expect(c.page, 'the page').toBe('auto');
    expect(c.page).not.toContain('.svg');
  });
});
