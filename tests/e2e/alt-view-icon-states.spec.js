/**
 * Icon buttons, measured as they are drawn. Every state an icon button shows
 * (at rest, under a mouse, pressed, with keyboard focus, and just after a
 * finger lifts) is an icon on a ground, and the icon has to stand out from
 * its ground at 3:1 or more in each Alt View look and in the standard
 * themes, with and without high contrast, on a desktop and on a phone.
 *
 * A tap leaves the browser's hover state on the button until the next tap,
 * so a hover color on a phone is a highlight that outlives the press: it
 * shows a state the button does not have. One camera drawer button of each
 * kind (a pad arrow, a pad's center, a zoom button, a view) is tapped and
 * must be back at rest once the finger lifts; the buttons of a kind share
 * their rules.
 *
 * Colors are read from a picture of each button, not from computed styles:
 * an icon may be a stroke, a fill, a background image or a text glyph, and
 * only the pixels say which. Forcing :hover and :active needs the browser's
 * DevTools protocol, so the cases skip in a browser without it. Each case
 * also scans the camera controls with axe, at rest.
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { skipWithoutWebGL } from './helpers/webgl.js';

test.describe.configure({ timeout: 300_000 });

const WASM_READY_TIMEOUT = 180_000;
const MIN_CONTRAST = 3;
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const LOOKS = [
  { name: 'the green look', theme: 'dark', alt: true },
  { name: 'the amber look', theme: 'light', alt: true },
  { name: 'the DOS look', theme: 'dark', alt: true, classic: true },
  { name: 'the dark theme', theme: 'dark', alt: false },
  { name: 'the light theme', theme: 'light', alt: false },
];

// Pictures at twice the size, so a one-pixel stroke still has whole pixels
// of its own color.
const DEVICES = [
  {
    name: 'desktop',
    use: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 },
  },
  // No isMobile: Firefox rejects it when the browser context is created.
  {
    name: 'phone',
    use: {
      viewport: { width: 412, height: 915 },
      hasTouch: true,
      deviceScaleFactor: 2,
    },
  },
];

const STATES = [
  { name: 'at rest', forced: [] },
  { name: 'hovered', forced: ['hover'] },
  { name: 'pressed', forced: ['hover', 'active'] },
  { name: 'focused', forced: ['focus', 'focus-visible'] },
];

async function seed(page, { theme, classic, highContrast }) {
  await page.addInitScript(
    ({ theme, classic, highContrast }) => {
      localStorage.setItem('openscad-forge-first-visit-seen', 'true');
      localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
      localStorage.setItem('openscad-forge-theme', theme);
      localStorage.setItem('openscad-customizer-hfm-unlock', 'true');
      localStorage.setItem('openscad-forge-sounds', 'false');
      if (highContrast) {
        localStorage.setItem('openscad-forge-high-contrast', 'true');
      } else {
        localStorage.removeItem('openscad-forge-high-contrast');
      }
      localStorage.setItem(
        'openscad-forge-ui-mode',
        JSON.stringify({
          mode: classic ? 'classic' : 'standard',
          lastCustomMode: 'standard',
        })
      );
    },
    { theme, classic, highContrast }
  );
}

async function openProject(page) {
  await page.goto('/?example=simple-box');
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: WASM_READY_TIMEOUT,
  });
  await skipWithoutWebGL(page, 'no WebGL: the camera controls need the 3D view');
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
}

// The look on, and its draw-in finished: every animation that ends has ended.
async function lookOn(page, look) {
  const key = page.locator('#_hfmToggle');
  await key.waitFor({ state: 'attached', timeout: 60_000 });
  if ((await key.getAttribute('aria-pressed')) !== 'true') await key.click();
  await expect(page.locator('html')).toHaveAttribute('data-ui-variant', 'mono');
  if (look.classic) {
    await expect(page.locator('body')).toHaveAttribute('data-ui-mode', 'classic');
  }
  await page.evaluate(() =>
    Promise.race([
      Promise.allSettled(
        document
          .getAnimations()
          .filter((animation) =>
            Number.isFinite(animation.effect?.getComputedTiming().endTime)
          )
          .map((animation) => animation.finished)
      ),
      new Promise((resolve) => setTimeout(resolve, 8_000)),
    ])
  );
  await page.waitForTimeout(500);
}

// The camera controls a person reaches in this layout: Classic's 3D view
// toolbar, the phone's camera drawer, or the desktop's camera panel.
function cameraControls(device, look) {
  if (look.classic) return '#classicCameraBar';
  return device.name === 'phone' ? '#cameraDrawer' : '#cameraPanel';
}

async function cameraControlsOpen(page, device, look) {
  if (look.classic) return;
  const toggle = page.locator(
    device.name === 'phone' ? '#cameraDrawerToggle' : '#cameraPanelToggle'
  );
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
    await toggle.click();
  }
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.waitForTimeout(400);
}

/**
 * In the page: every icon button a person can see and reach, marked with a
 * number for the protocol to find. An icon button shows a picture (an svg,
 * or Classic's icon image) or a glyph, with two characters of text or fewer.
 * A disabled button is left out: contrast asks nothing of an inactive
 * control; so is one drawn fully transparent until its group is hovered.
 */
function markIconButtons() {
  const found = [];
  for (const el of document.querySelectorAll('button')) {
    if (!el.checkVisibility({ visibilityProperty: true, opacityProperty: true })) {
      continue;
    }
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') continue;
    const words = el.cloneNode(true);
    words.querySelectorAll('.sr-only, .visually-hidden').forEach((n) => n.remove());
    const text = words.textContent.replace(/\s+/g, '');
    if (text.length > 2) continue;
    if (!el.querySelector('svg, .classic-icon') && text.length === 0) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 16 || r.height < 16) continue;
    if (r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight) {
      continue;
    }
    const hit = document.elementFromPoint(
      r.left + r.width / 2,
      r.top + r.height / 2
    );
    if (!hit || !el.contains(hit)) continue;
    const key = String(found.length + 1);
    el.dataset.iconAudit = key;
    found.push({
      key,
      name: (el.getAttribute('aria-label') || el.title || el.id || text).slice(0, 40),
      toggle: el.hasAttribute('aria-pressed') || el.hasAttribute('aria-expanded'),
      inCameraDrawer: !!el.closest('.camera-drawer'),
      kind: el.matches('.camera-view-btn')
        ? 'view'
        : el.matches('.dpad-center')
          ? 'center'
          : el.closest('.camera-drawer-zoom-controls')
            ? 'zoom'
            : 'pad',
      border: parseFloat(getComputedStyle(el).borderTopWidth) || 0,
    });
  }
  return found;
}

/**
 * In the page: decode one picture of the screen and measure each button in
 * it: its ground (the most common color, to 16 levels a channel), its icon
 * (of the pixels that stand out most from the ground, the middle of the six
 * strongest, so one stray pixel cannot decide) with their contrast, and its
 * edge, the most common color of the border band. One picture for every
 * button keeps the screen captured once a state, which matters where the 3D
 * view is drawn in software.
 */
async function readPictures(page, png, boxes) {
  return page.evaluate(
    async ({ b64, boxes }) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const bitmap = await createImageBitmap(
        new Blob([bytes], { type: 'image/png' })
      );
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(bitmap, 0, 0);
      const { data, width } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
      const lin = (v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
      const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      const mostCommon = (list) => {
        const buckets = new Map();
        for (const [r, g, b] of list) {
          const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
          const entry = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
          entry.n += 1;
          entry.r += r;
          entry.g += g;
          entry.b += b;
          buckets.set(key, entry);
        }
        const most = [...buckets.values()].sort((a, b) => b.n - a.n)[0];
        return [most.r, most.g, most.b].map((v) => Math.round(v / most.n));
      };
      const hex = (p) =>
        '#' + p.map((v) => v.toString(16).padStart(2, '0')).join('');
      const seen = {};
      for (const { key, left, top, right, bottom, inset, band } of boxes) {
        const pixels = [];
        const edgePixels = [];
        for (let y = top; y < bottom; y += 1) {
          for (let x = left; x < right; x += 1) {
            const i = (y * width + x) * 4;
            const p = [data[i], data[i + 1], data[i + 2]];
            if (
              x >= left + inset &&
              x < right - inset &&
              y >= top + inset &&
              y < bottom - inset
            ) {
              pixels.push(p);
            } else if (
              x < left + band ||
              x >= right - band ||
              y < top + band ||
              y >= bottom - band
            ) {
              edgePixels.push(p);
            }
          }
        }
        const ground = mostCommon(pixels);
        const groundLum = lum(ground);
        const strongest = pixels
          .map((p) => ({ p, c: ratio(lum(p), groundLum) }))
          .sort((a, b) => b.c - a.c)
          .slice(0, 6);
        const middle = strongest[Math.floor(strongest.length / 2)];
        seen[key] = {
          ground: hex(ground),
          icon: hex(middle.p),
          contrast: Math.round(middle.c * 100) / 100,
          edge: hex(mostCommon(edgePixels)),
        };
      }
      return seen;
    },
    { b64: png.toString('base64'), boxes }
  );
}

// A forced state draws at once in the Alt View, which turns transitions off;
// in the standard themes a color eases in over up to 240 ms. An animation
// that never ends (a spinner) is not waited for.
async function settled(page) {
  await page.evaluate(() =>
    Promise.race([
      Promise.allSettled(
        [...document.querySelectorAll('[data-icon-audit]')]
          .flatMap((el) => el.getAnimations({ subtree: true }))
          .filter((animation) =>
            Number.isFinite(animation.effect?.getComputedTiming().endTime)
          )
          .map((animation) => animation.finished)
      ),
      new Promise((resolve) => setTimeout(resolve, 1_000)),
    ])
  );
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      )
  );
}

/** Each button as drawn now, from one picture of the screen. */
async function picturesOf(page, buttons, scale) {
  const boxes = await page.evaluate(
    ({ list, scale }) =>
      list.map(({ key, border }) => {
        const r = document
          .querySelector(`[data-icon-audit="${key}"]`)
          .getBoundingClientRect();
        const edge = Math.max(1, Math.ceil(border));
        return {
          key,
          left: Math.round(r.left * scale),
          top: Math.round(r.top * scale),
          right: Math.round(r.right * scale),
          bottom: Math.round(r.bottom * scale),
          inset: (edge + 2) * scale,
          band: edge * scale,
        };
      }),
    { list: buttons.map(({ key, border }) => ({ key, border })), scale }
  );
  const png = await page.screenshot();
  return readPictures(page, png, boxes);
}

const sameColor = (a, b) =>
  [1, 3, 5].every(
    (i) =>
      Math.abs(parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16)) <=
      24
  );

for (const device of DEVICES) {
  test.describe(`Icon buttons on a ${device.name}`, () => {
    test.use(device.use);

    for (const look of LOOKS) {
      if (look.classic && device.name === 'phone') continue;
      for (const highContrast of [false, true]) {
        const title = `${look.name}${highContrast ? ' in high contrast' : ''}`;
        test(title, async ({ page, context }, testInfo) => {
          let cdp = null;
          try {
            cdp = await context.newCDPSession(page);
          } catch {
            // No DevTools protocol in this browser.
          }
          test.skip(!cdp, 'forcing :hover and :active needs the DevTools protocol');

          await seed(page, { ...look, highContrast });
          await openProject(page);
          if (look.alt) await lookOn(page, look);
          await cameraControlsOpen(page, device, look);
          if (highContrast) {
            await expect(page.locator('html')).toHaveAttribute(
              'data-high-contrast',
              'true'
            );
          }

          // The pointer rests on the preview, over no button, or the button
          // it was left on would be read hovered "at rest".
          const preview = await page.locator('#previewContainer').boundingBox();
          await page.mouse.move(
            preview.x + preview.width / 2,
            preview.y + preview.height / 2
          );

          // A rule a tag set leaves out is switched on through the options,
          // set before withTags(): withRules() would replace the tags.
          const scan = await new AxeBuilder({ page })
            .include(cameraControls(device, look))
            .options({
              rules: { 'label-content-name-mismatch': { enabled: true } },
            })
            .withTags(WCAG_TAGS)
            .analyze();
          expect
            .soft(
              scan.violations.flatMap((v) =>
                v.nodes.map((n) => `${v.id} @ ${n.target.join(' ')}`)
              ),
              'axe on the camera controls'
            )
            .toEqual([]);

          const scale = await page.evaluate(() => devicePixelRatio);
          const buttons = await page.evaluate(markIconButtons);
          expect(buttons.length, 'icon buttons on the screen').toBeGreaterThan(1);

          await cdp.send('DOM.enable');
          await cdp.send('CSS.enable');
          const { root } = await cdp.send('DOM.getDocument', { depth: 0 });

          const nodes = [];
          for (const button of buttons) {
            const { nodeId } = await cdp.send('DOM.querySelector', {
              nodeId: root.nodeId,
              selector: `[data-icon-audit="${button.key}"]`,
            });
            nodes.push(nodeId);
          }
          const forceAll = async (forced) => {
            for (const nodeId of nodes) {
              await cdp.send('CSS.forcePseudoState', {
                nodeId,
                forcedPseudoClasses: forced,
              });
            }
            await settled(page);
          };

          const measured = [];
          const failures = [];
          const rest = new Map();
          // Every button in one state at once, then one picture of them all.
          for (const state of STATES) {
            await forceAll(state.forced);
            const pictures = await picturesOf(page, buttons, scale);
            for (const button of buttons) {
              const seen = pictures[button.key];
              if (state.forced.length === 0) rest.set(button.key, seen);
              measured.push({ button: button.name, state: state.name, ...seen });
              if (seen.contrast < MIN_CONTRAST) {
                failures.push(
                  `${button.name} ${state.name}: ${seen.contrast}:1 (icon ${seen.icon} on ${seen.ground})`
                );
              }
            }
          }
          await forceAll([]);

          if (device.name === 'phone') {
            const tapped = ['pad', 'center', 'zoom', 'view'].map((kind) =>
              buttons.find(
                (button) =>
                  button.inCameraDrawer && !button.toggle && button.kind === kind
              )
            );
            expect(
              tapped.map((button) => button?.kind),
              'one camera drawer button of each kind to tap'
            ).toEqual(['pad', 'center', 'zoom', 'view']);
            for (const button of tapped) {
              await page.locator(`[data-icon-audit="${button.key}"]`).tap();
              await page.waitForTimeout(150);
              await settled(page);
              const seen = (await picturesOf(page, [button], scale))[button.key];
              const before = rest.get(button.key);
              measured.push({ button: button.name, state: 'after a tap', ...seen });
              if (seen.contrast < MIN_CONTRAST) {
                failures.push(
                  `${button.name} after a tap: ${seen.contrast}:1 (icon ${seen.icon} on ${seen.ground})`
                );
              }
              if (
                !sameColor(seen.ground, before.ground) ||
                !sameColor(seen.icon, before.icon) ||
                !sameColor(seen.edge, before.edge)
              ) {
                failures.push(
                  `${button.name} after a tap: still lit, icon ${seen.icon} on ${seen.ground} edged ${seen.edge} (at rest ${before.icon} on ${before.ground} edged ${before.edge})`
                );
              }
            }
          }

          await testInfo.attach('measured.json', {
            body: JSON.stringify(measured, null, 1),
            contentType: 'application/json',
          });
          expect(
            failures,
            `${failures.length} states under ${MIN_CONTRAST}:1 or lit after a tap`
          ).toEqual([]);
        });
      }
    }
  });
}
