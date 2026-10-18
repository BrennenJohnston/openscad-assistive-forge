/**
 * The Alt View's look comes on with its drawers shut: the drawers that were
 * open shut at once, the screen draws in and the picture powers on, and
 * then they open again one at a time, left to right, a short pause apart,
 * each ending as it was. Classic in Standard with the editor hidden and the
 * console and the Customizer open comes on as the console, then the
 * Customizer, the editor staying hidden. The mode is kept. A change of look
 * inside the theme keeps the drawers as they are, and so does a request for
 * reduced motion.
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test';
import { skipWithoutWebGL } from './helpers/webgl.js';

test.describe.configure({ timeout: 300_000 });

const WASM_READY_TIMEOUT = 180_000;

async function openBox(page, { classic = false, panes = null } = {}) {
  await page.addInitScript(
    ({ classic, panes }) => {
      localStorage.setItem('openscad-forge-first-visit-seen', 'true');
      localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
      localStorage.setItem('openscad-forge-theme', 'dark');
      localStorage.setItem('openscad-customizer-hfm-unlock', 'true');
      localStorage.setItem('openscad-forge-sounds', 'false');
      localStorage.setItem(
        'openscad-forge-ui-mode',
        JSON.stringify({
          mode: classic ? 'classic' : 'standard',
          lastCustomMode: 'standard',
        })
      );
      if (panes) {
        localStorage.setItem('openscad-forge-classic-panes', JSON.stringify(panes));
      }
    },
    { classic, panes }
  );
  await page.goto('/?example=simple-box');
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: WASM_READY_TIMEOUT,
  });
  await skipWithoutWebGL(
    page,
    'no WebGL: the Alt View draws its characters from the 3D picture'
  );
  await page.waitForFunction(() => window.previewManager?.mesh, null, {
    timeout: WASM_READY_TIMEOUT,
  });
  const notNow = page.locator('#saveProjectNotNow');
  try {
    await notNow.waitFor({ state: 'visible', timeout: 3_000 });
    await notNow.click();
  } catch {
    // No save-project prompt to dismiss.
  }
  await page.waitForTimeout(500);
}

async function setOpen(page, toggle, open) {
  const button = page.locator(toggle);
  if ((await button.getAttribute('aria-expanded')) !== String(open)) {
    await button.click();
  }
  await expect(button).toHaveAttribute('aria-expanded', String(open));
  await page.waitForTimeout(400);
}

/**
 * Press the key (or another button) and read every drawer's size on every
 * frame for `ms`: its width or height, 0 when it is not drawn.
 * @param {Record<string, {selector: string, axis: 'width'|'height'|'right'}>} drawers
 */
async function pressAndWatch(page, press, drawers, ms = 9_000) {
  return page.evaluate(
    async ({ press, drawers, ms }) => {
      const size = ({ selector, axis }) => {
        const el = document.querySelector(selector);
        if (!el || !el.checkVisibility()) return 0;
        const box = el.getBoundingClientRect();
        if (axis === 'right') return Math.max(0, box.right);
        return box[axis];
      };
      const read = () =>
        Object.fromEntries(
          Object.entries(drawers).map(([name, d]) => [name, size(d)])
        );
      const before = read();
      const samples = [];
      const t0 = performance.now();
      document.querySelector(press).click();
      await new Promise((resolve) => {
        const step = (now) => {
          samples.push({
            t: now - t0,
            look: document.documentElement.dataset.uiVariant === 'mono',
            sizes: read(),
          });
          if (now - t0 < ms) requestAnimationFrame(step);
          else resolve();
        };
        requestAnimationFrame(step);
      });
      return {
        before,
        samples,
        mode: document.body.dataset.uiMode,
        density: document.getElementById('classicDensityToggle')?.getAttribute('aria-checked') ?? null,
      };
    },
    { press, drawers, ms }
  );
}

/**
 * For each drawer: when it was first seen shut, when it began opening
 * again, and when it was open again for good.
 */
function timeline(run, names, shutBelow) {
  const out = {};
  for (const name of names) {
    // Open again at its own size in the look (the look's type can make a
    // drawer taller or shorter than it was outside it).
    const open = run.samples[run.samples.length - 1].sizes[name];
    const series = run.samples.map((s) => ({ t: s.t, look: s.look, v: s.sizes[name] }));
    const shut = series.find((s) => s.v <= shutBelow[name]);
    const firstLook = series.find((s) => s.look);
    const afterShut = shut ? series.filter((s) => s.t > shut.t) : [];
    const opening = afterShut.find((s) => s.v > shutBelow[name]);
    let rest = series.length - 1;
    while (rest > 0 && Math.abs(series[rest - 1].v - open) < 0.5) rest -= 1;
    out[name] = {
      before: run.before[name],
      open,
      end: series[series.length - 1].v,
      shutAt: shut?.t ?? null,
      atFirstLook: firstLook ? firstLook.v : null,
      opensAt: opening?.t ?? null,
      openAt: Math.abs(series[rest].v - open) < 0.5 ? series[rest].t : null,
    };
  }
  return out;
}

function expectStagedOpening(run, names, shutBelow) {
  const line = timeline(run, names, shutBelow);
  let previous = null;
  for (const name of names) {
    const d = line[name];
    expect(d.before, `${name} open before the key`).toBeGreaterThan(shutBelow[name]);
    expect(d.shutAt, `${name} shut at once`).not.toBeNull();
    // The look draws in with its drawers shut: no frame of it shows one open.
    expect(d.atFirstLook, `${name} shut in the look's first frame`).toBeLessThanOrEqual(
      shutBelow[name]
    );
    expect(d.opensAt, `${name} opens again`).not.toBeNull();
    expect(d.opensAt, `${name} opens after the picture has powered on`).toBeGreaterThanOrEqual(
      1_500
    );
    expect(d.end, `${name} ends open`).toBeGreaterThan(shutBelow[name]);
    expect(d.openAt, `${name} comes to rest open`).not.toBeNull();
    if (previous) {
      expect(
        d.opensAt - previous.openAt,
        `${name} starts a pause after the drawer to its left has stopped`
      ).toBeGreaterThanOrEqual(250);
    }
    previous = d;
  }
  return line;
}

function expectNeverShut(run, names, shutBelow, why) {
  for (const name of names) {
    const smallest = Math.min(...run.samples.map((s) => s.sizes[name]));
    expect(smallest, `${name} stays open ${why}`).toBeGreaterThan(shutBelow[name]);
  }
}

const DESKTOP = {
  customizer: { selector: '#paramPanel', axis: 'width' },
  settings: { selector: '#previewInfoSection', axis: 'height' },
  camera: { selector: '#cameraPanel', axis: 'width' },
};
const DESKTOP_SHUT = { customizer: 60, settings: 50, camera: 60 };

test.describe('The Alt View comes on with its drawers shut', () => {
  test('desktop: the Customizer, Preview Settings and Camera open again left to right', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openBox(page);
    await setOpen(page, '#previewDrawerToggle', true);
    await setOpen(page, '#cameraPanelToggle', true);

    const run = await pressAndWatch(page, '#_hfmToggle', DESKTOP);
    expect(run.mode, 'the mode is kept').toBe('standard');
    expectStagedOpening(run, ['customizer', 'settings', 'camera'], DESKTOP_SHUT);

    // A change of look inside the theme keeps them as they are.
    const look = await pressAndWatch(page, '#themeToggle', DESKTOP, 3_000);
    expectNeverShut(look, ['customizer', 'settings', 'camera'], DESKTOP_SHUT, 'when the look changes');

    // Asked for less motion, the look comes on with them open as they are.
    await page.locator('#_hfmToggle').click();
    await expect(page.locator('html')).not.toHaveAttribute('data-ui-variant', 'mono');
    await page.waitForTimeout(1_000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(
      await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
      'the page sees the request for reduced motion'
    ).toBe(true);
    const still = await pressAndWatch(page, '#_hfmToggle', DESKTOP, 4_000);
    expectNeverShut(still, ['customizer', 'settings', 'camera'], DESKTOP_SHUT, 'under reduced motion');
  });

  test('Classic Standard: editor hidden, the console then the Customizer', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openBox(page, {
      classic: true,
      panes: { editorVisible: false, customizerVisible: true, consoleCollapsed: false },
    });
    const drawers = {
      editor: { selector: '#classicFieldLeft', axis: 'width' },
      console: { selector: '#classicBottomStrip', axis: 'height' },
      customizer: { selector: '#classicFieldRightTop', axis: 'width' },
    };
    const run = await pressAndWatch(page, '#_hfmToggle', drawers);
    expect(run.mode, 'still Classic').toBe('classic');
    expect(run.density, 'still Standard').toBe('true');
    expect(run.before.editor, 'the editor hidden before').toBe(0);
    expect(
      Math.max(...run.samples.map((s) => s.sizes.editor)),
      'the editor stays hidden'
    ).toBe(0);
    expectStagedOpening(run, ['console', 'customizer'], { console: 10, customizer: 10 });
  });

  test.describe('on a phone', () => {
    // No isMobile: Firefox rejects it when the browser context is created.
    test.use({ viewport: { width: 412, height: 915 }, hasTouch: true });

    test('the open camera drawer shuts, and opens again once the picture is on; the ASCII drawer never opens', async ({
      page,
    }) => {
      await openBox(page);
      await setOpen(page, '#cameraDrawerToggle', true);
      const drawers = {
        camera: { selector: '#cameraDrawerBody', axis: 'height' },
        ascii: { selector: '#asciiDrawerBody', axis: 'height' },
      };
      const run = await pressAndWatch(page, '#_hfmToggle', drawers);
      expectStagedOpening(run, ['camera'], { camera: 1 });
      expect(
        Math.max(...run.samples.map((s) => s.sizes.ascii)),
        'the ASCII drawer never opens on its own'
      ).toBe(0);
    });
  });
});
