import { test, expect } from '@playwright/test';
import {
  LOOKS,
  openPhoneProject,
  WASM_READY_TIMEOUT,
} from './helpers/phone-sheets.js';

// One drawer at a time, in any order (S6 in docs/specs/UI_STANDARDS.md,
// "Drawers, sheets and menus: the schema"): on a phone, opening the
// Customizer, Preview Settings & Info, the camera drawer or the Lens drawer
// first closes whichever is open, and the one asked for then opens at the
// size it has when opened alone, with the bar's controls in reach. Every
// ordered pair of the drawers the screen shows, at two phone heights and
// held sideways, in four looks. In the Alt View's look, where the drawers
// slide, the one asked for is also on its way at once: a drawer whose slide
// waits on the preview's redrawing arrives late.

const DRAWERS = [
  { name: 'the Customizer', toggle: '#mobileDrawerToggle', body: '#paramPanel' },
  {
    name: 'Preview Settings',
    toggle: '#previewDrawerToggle',
    body: '#previewInfoContent',
  },
  { name: 'the camera drawer', toggle: '#cameraDrawerToggle', body: '#cameraDrawerBody' },
  { name: 'the Lens drawer', toggle: '#asciiDrawerToggle', body: '#asciiDrawerBody' },
];

/** How far from its alone box a drawer's body may rest after another drawer: rounding. */
const SAME_BOX_PX = 2;

/**
 * In the look, how often the preview may be laid out again while a drawer
 * slides open over another: once, when the slide ends. Laid out on every
 * frame instead, the preview is drawn on every frame and the slide waits.
 */
const PREVIEW_LAYOUTS_PER_SLIDE = 1;
const SLIDE_WATCH_MS = 1_200;

/** The drawers whose toggles the screen shows, read in the page. */
function shownDrawers(list) {
  return list.filter((d) => {
    const el = document.querySelector(d.toggle);
    return (
      !!el &&
      el.checkVisibility({ visibilityProperty: true, opacityProperty: true }) &&
      el.getBoundingClientRect().width > 0
    );
  });
}

/**
 * Whether no finite animation or transition runs any more, read in the page.
 * Firefox keeps a visibility transition on an element under a hidden ancestor
 * running at time 0 for ever (the Customizer's library items behind its
 * sheet), so transitions of visibility and animations on elements that are
 * not rendered do not count.
 */
function nothingMoving() {
  return !document.getAnimations().some((a) => {
    if (a.playState !== 'running') return false;
    if (a.effect?.getTiming?.().iterations === Infinity) return false;
    if (a.transitionProperty === 'visibility') return false;
    const target = a.effect?.target;
    return !target || target.checkVisibility();
  });
}

/** A drawer body's resting box, rounded, read in the page. */
function readBody(sel) {
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return {
    top: Math.round(r.top),
    left: Math.round(r.left),
    width: Math.round(r.width),
    height: Math.round(r.height),
  };
}

/**
 * The bar's controls that the screen shows: each one's place against the
 * viewport and whether a press at its center reaches it. Read in the page.
 */
function readBar() {
  const out = [];
  for (const sel of [
    '#cameraDrawerToggle',
    '#asciiDrawerToggle',
    '#primaryActionBtn',
  ]) {
    const el = document.querySelector(sel);
    if (!el || !el.checkVisibility()) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0) continue;
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    out.push({
      sel,
      inside:
        r.top >= 0 &&
        r.left >= 0 &&
        r.bottom <= innerHeight + 0.5 &&
        r.right <= innerWidth + 0.5,
      hit: !!hit && (hit === el || el.contains(hit)),
    });
  }
  return out;
}

/** Each shown drawer's open state by its toggle, read in the page. */
function readOpen(list) {
  return Object.fromEntries(
    list.map((d) => [
      d.name,
      document.querySelector(d.toggle)?.getAttribute('aria-expanded'),
    ])
  );
}

/**
 * Press a drawer's toggle in the page and watch the preview for a while:
 * how many times its size changed (the preview is laid out and drawn on
 * each), and how far apart the page's frames came. Read in the page.
 */
function pressAndWatch({ toggle, watchMs }) {
  return new Promise((resolve) => {
    const container = document.getElementById('previewContainer');
    let changes = -1; // the observer's first call reports the size as it is
    const observer = new ResizeObserver(() => {
      changes += 1;
    });
    observer.observe(container);
    const t0 = performance.now();
    let lastFrame = t0;
    let longestGap = 0;
    document.querySelector(toggle).click();
    const step = (now) => {
      longestGap = Math.max(longestGap, now - lastFrame);
      lastFrame = now;
      if (now - t0 >= watchMs) {
        observer.disconnect();
        resolve({ changes, longestGap: Math.round(longestGap) });
        return;
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

const SIZES = [
  { width: 412, height: 915 },
  { width: 412, height: 810 },
  { width: 844, height: 390 },
];

for (const size of SIZES) {
  for (const look of LOOKS) {
    test.describe(`The phone drawers in any order, ${size.width} x ${size.height}, ${look.name}`, () => {
      // No isMobile: Firefox rejects it when the browser context is created.
      test.use({ viewport: size, hasTouch: true });

      test('S6: opening a drawer closes the open one, and the one asked for arrives at its own size', async ({
        page,
      }) => {
        test.setTimeout(WASM_READY_TIMEOUT + 240_000);
        await openPhoneProject(page, look);
        await page.waitForTimeout(500);
        const shown = await page.evaluate(shownDrawers, DRAWERS);
        if (shown.length < 2) {
          test.info().annotations.push({
            type: 'note',
            description: `fewer than two drawers shown here: ${shown.map((d) => d.name).join(', ') || 'none'}`,
          });
          return;
        }
        const settled = async () => {
          await page.waitForFunction(nothingMoving, null, { timeout: 8_000 });
          await page.waitForTimeout(150);
        };
        const open = async (d) => {
          const toggle = page.locator(d.toggle);
          if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
            await toggle.click();
          }
          await expect(toggle).toHaveAttribute('aria-expanded', 'true');
          await settled();
        };
        const close = async (d) => {
          const toggle = page.locator(d.toggle);
          if ((await toggle.getAttribute('aria-expanded')) === 'true') {
            await toggle.click();
          }
          await expect(toggle).toHaveAttribute('aria-expanded', 'false');
          await settled();
        };

        // Each drawer alone, on a page with nothing else open.
        const alone = {};
        for (const d of shown) {
          await open(d);
          alone[d.name] = await page.evaluate(readBody, d.body);
          await close(d);
        }

        for (const a of shown) {
          for (const b of shown) {
            if (a === b) continue;
            const pair = `${a.name} then ${b.name}`;
            await open(a);
            if (look.altView) {
              // The look slides its drawers, and the preview's room with
              // them: the preview is laid out once, when the slide ends,
              // not on every frame of it.
              const slide = await page.evaluate(pressAndWatch, {
                toggle: b.toggle,
                watchMs: SLIDE_WATCH_MS,
              });
              expect
                .soft(
                  slide.changes,
                  `${pair}: the preview laid out ${slide.changes} times while the drawer slid (frames up to ${slide.longestGap} ms apart)`
                )
                .toBeLessThanOrEqual(PREVIEW_LAYOUTS_PER_SLIDE);
              await expect(page.locator(b.toggle)).toHaveAttribute(
                'aria-expanded',
                'true'
              );
              await settled();
            } else {
              await open(b);
            }
            const body = await page.evaluate(readBody, b.body);
            for (const k of ['top', 'left', 'width', 'height']) {
              expect
                .soft(
                  Math.abs(body[k] - alone[b.name][k]),
                  `${pair}: the body's ${k} as when opened alone (${alone[b.name][k]} alone, ${body[k]} after)`
                )
                .toBeLessThanOrEqual(SAME_BOX_PX);
            }
            const states = await page.evaluate(readOpen, shown);
            for (const d of shown) {
              expect
                .soft(states[d.name], `${pair}: ${d.name} ${d === b ? 'open' : 'closed'}`)
                .toBe(d === b ? 'true' : 'false');
            }
            for (const c of await page.evaluate(readBar)) {
              expect.soft(c.inside, `${pair}: ${c.sel} inside the screen`).toBe(true);
              expect.soft(c.hit, `${pair}: ${c.sel} reached at its center`).toBe(true);
            }
            await close(b);
          }
        }
      });
    });
  }
}
