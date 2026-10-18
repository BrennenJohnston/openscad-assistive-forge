/**
 * The drawers in the Alt View's look move like drawers: each slides in from
 * the edge it lives behind, at a desk drawer's pace (500 ms out, 450 ms
 * back), with its controls riding in it, and nothing of it is drawn past
 * that edge. A request for reduced motion keeps the change to one frame, and
 * outside the look every drawer keeps the motion it had.
 *
 * Each press is timed from inside the page: the drawer's box is read on
 * every frame after the press, from the first frame to the first one from
 * which it stays at rest.
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test';
import { skipWithoutWebGL } from './helpers/webgl.js';

test.describe.configure({ timeout: 300_000 });

const WASM_READY_TIMEOUT = 180_000;

async function openBox(page) {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
    localStorage.setItem('openscad-forge-theme', 'dark');
    localStorage.setItem('openscad-customizer-hfm-unlock', 'true');
    localStorage.setItem('openscad-forge-sounds', 'false');
    localStorage.setItem(
      'openscad-forge-ui-mode',
      JSON.stringify({ mode: 'standard', lastCustomMode: 'standard' })
    );
  });
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
}

// Every finite animation on the page done, or 8 s: the look's draw-in, a
// drawer still settling.
async function settled(page) {
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
}

async function setLook(page) {
  const key = page.locator('#_hfmToggle');
  await key.waitFor({ state: 'attached', timeout: 60_000 });
  if ((await key.getAttribute('aria-pressed')) !== 'true') await key.click();
  await expect(page.locator('html')).toHaveAttribute('data-ui-variant', 'mono');
  await settled(page);
}

/**
 * Press a toggle and read, on every frame for 1.2 s, the box of the part
 * that moves, a control inside it, the edge it moves behind, and its clip.
 * @returns {Promise<Array<{t: number, box: object, inside: object, frame: object|null, clip: string}>>}
 */
async function pressAndWatch(page, { press, box, inside, frame }) {
  const samples = await page.evaluate(
    async ({ press, box, inside, frame }) => {
      const rect = (selector) => {
        const el = selector && document.querySelector(selector);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      };
      // The control inside: the first one drawn, kept from then on.
      let control = null;
      const insideRect = () => {
        control ??= [...document.querySelectorAll(inside)].find(
          (el) => el.getBoundingClientRect().width > 0
        );
        if (!control) return null;
        const r = control.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      };
      const out = [];
      const t0 = performance.now();
      document.querySelector(press).click();
      await new Promise((resolve) => {
        const step = (now) => {
          const el = document.querySelector(box);
          out.push({
            t: now - t0,
            box: rect(box),
            inside: insideRect(),
            frame: rect(frame),
            clip: el ? getComputedStyle(el).clipPath : 'none',
            sideways:
              document.documentElement.scrollWidth -
              document.documentElement.clientWidth,
          });
          if (now - t0 < 1_200) requestAnimationFrame(step);
          else resolve();
        };
        requestAnimationFrame(step);
      });
      return out;
    },
    { press, box, inside, frame: frame ?? null }
  );
  await settled(page);
  return samples;
}

// At rest: within a tenth of a pixel. A drawer easing to its stop moves
// less than half a pixel in its last 50 ms, and the box reports fractions.
const sameBox = (a, b) =>
  ['x', 'y', 'w', 'h'].every((k) => Math.abs((a?.[k] ?? 0) - (b?.[k] ?? 0)) < 0.1);

/**
 * How a press moved the box: the frames before it came to rest, the time
 * from the first frame to the first one at rest, and to the last one
 * still moving.
 */
function motionOf(samples) {
  const end = samples[samples.length - 1].box;
  let rest = samples.length - 1;
  while (rest > 0 && sameBox(samples[rest - 1].box, end)) rest -= 1;
  const start = samples[0].t;
  // A motion is set going in the frame after the press, and on a slow
  // machine frames come far apart: the latest it can still be moving is its
  // time plus the first gap and the longest one.
  const gaps = samples.slice(1).map((s, i) => s.t - samples[i].t);
  return {
    moving: rest,
    toRest: samples[rest].t - start,
    lastMove: rest > 0 ? samples[rest - 1].t - start : 0,
    slack: (gaps[0] ?? 0) + Math.max(0, ...gaps),
  };
}

// A clip of inset(top right bottom left) in px, as the browser reports it.
function insetOf(clip) {
  const match = /^inset\(([^)]*)\)/.exec(clip || '');
  if (!match) return { top: 0, right: 0, bottom: 0, left: 0 };
  const v = match[1]
    .split(/\s+/)
    .filter((part) => /px$/.test(part))
    .map((part) => parseFloat(part));
  const [top = 0, right = top, bottom = top, left = right] = v;
  return { top, right, bottom, left };
}

/**
 * One press in the look: the drawer travels for its time, its controls ride
 * in it, and none of it is drawn past the edge it comes from.
 */
function expectDrawerMove(samples, { name, from, opening, edge }) {
  const motion = motionOf(samples);
  const [minMs, maxMs] = opening ? [450, 550] : [400, 500];
  expect(motion.moving, `${name}: seen on its way`).toBeGreaterThanOrEqual(3);
  expect(motion.toRest, `${name}: at rest no sooner than ${minMs} ms`).toBeGreaterThanOrEqual(
    minMs
  );
  expect(motion.lastMove, `${name}: still by ${maxMs} ms and a frame or two`).toBeLessThanOrEqual(
    maxMs + motion.slack
  );

  // A control keeps its place against the drawer's leading edge, the one
  // that moves: a panel that grows into its room is measured from its
  // growing edge, a drawer that slides from either.
  const riding = samples.filter((s) => s.box?.w > 0 && s.inside?.w > 0);
  const lead = (b) => ({
    x: from === 'left' ? b.x + b.w : b.x,
    y: from === 'top' ? b.y + b.h : b.y,
  });
  const offsets = riding.map((s) => ({
    x: s.inside.x - lead(s.box).x,
    y: s.inside.y - lead(s.box).y,
  }));
  const spread = (k) => Math.max(...offsets.map((o) => o[k])) - Math.min(...offsets.map((o) => o[k]));
  expect(riding.length, `${name}: drawn while it moves`).toBeGreaterThanOrEqual(2);
  expect(spread('x'), `${name}: a control rides in it (across)`).toBeLessThanOrEqual(1);
  expect(spread('y'), `${name}: a control rides in it (down)`).toBeLessThanOrEqual(1);

  for (const s of samples) {
    if (edge.window) {
      expect(s.sideways, `${name} at ${Math.round(s.t)} ms: the page does not scroll sideways`).toBeLessThanOrEqual(0);
      continue;
    }
    if (!(s.box?.w > 0)) continue;
    const cut = insetOf(s.clip);
    const seen = {
      top: s.box.y + cut.top,
      bottom: s.box.y + s.box.h - cut.bottom,
      left: s.box.x + cut.left,
      right: s.box.x + s.box.w - cut.right,
    };
    const at = `${name} at ${Math.round(s.t)} ms`;
    if (from === 'bottom') expect(seen.bottom, `${at}: not over ${edge.name}`).toBeLessThanOrEqual(edge.at(s) + 1);
    if (from === 'top') expect(seen.top, `${at}: not over ${edge.name}`).toBeGreaterThanOrEqual(edge.at(s) - 1);
  }
}

// Outside the look: the drawer keeps today's motion, a transition of `ms`
// or none at all.
function expectTodaysMotion(samples, { name, ms }) {
  const motion = motionOf(samples);
  if (ms === 0) {
    expect(motion.moving, `${name}: changes in one frame`).toBe(0);
    return;
  }
  expect(motion.moving, `${name}: seen on its way`).toBeGreaterThanOrEqual(2);
  expect(motion.toRest, `${name}: at rest no sooner than ${ms} ms`).toBeGreaterThanOrEqual(ms - 20);
  expect(motion.lastMove, `${name}: still by ${ms} ms and a frame or two`).toBeLessThanOrEqual(
    ms + motion.slack
  );
}

async function reduceMotion(page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(
    await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
    'the page sees the request for reduced motion'
  ).toBe(true);
}

// A drawer at the window's edge comes in from beyond it: what is past the
// edge is never drawn, but the page must not grow sideways while it moves.
const WINDOW = { window: true };

test.describe('Drawers in the Alt View', () => {
  test('desktop: the Customizer, Preview Settings and Camera slide from their edges', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openBox(page);

    const customizer = {
      press: '#collapseParamPanelBtn',
      box: '#paramPanel',
      inside: '#paramPanelBody select',
    };
    const camera = {
      press: '#cameraPanelToggle',
      box: '#cameraPanel',
      inside: '#cameraRotateLeft',
    };
    const settings = {
      press: '#previewDrawerToggle',
      box: '.preview-info-content',
      inside: '.preview-info-content input',
      frame: '.preview-drawer-header',
    };
    const header = {
      name: 'the Preview Settings row',
      at: (s) => s.frame.y + s.frame.h,
    };

    expectTodaysMotion(await pressAndWatch(page, customizer), { name: 'Customizer out of the look, closing', ms: 240 });
    // Outside the look the Customizer narrows over 240 ms but takes the
    // splitter's width at once, and the Camera panel changes in one frame.
    expectTodaysMotion(await pressAndWatch(page, customizer), { name: 'Customizer out of the look, opening', ms: 0 });
    expectTodaysMotion(await pressAndWatch(page, camera), { name: 'Camera out of the look, opening', ms: 0 });
    expectTodaysMotion(await pressAndWatch(page, camera), { name: 'Camera out of the look, closing', ms: 0 });

    await setLook(page);
    expectDrawerMove(await pressAndWatch(page, customizer), { name: 'Customizer closing', from: 'left', opening: false, edge: WINDOW });
    expectDrawerMove(await pressAndWatch(page, customizer), { name: 'Customizer opening', from: 'left', opening: true, edge: WINDOW });
    expectDrawerMove(await pressAndWatch(page, camera), { name: 'Camera opening', from: 'right', opening: true, edge: WINDOW });
    expectDrawerMove(await pressAndWatch(page, camera), { name: 'Camera closing', from: 'right', opening: false, edge: WINDOW });
    expectDrawerMove(await pressAndWatch(page, settings), { name: 'Preview Settings opening', from: 'top', opening: true, edge: header });
    expectDrawerMove(await pressAndWatch(page, settings), { name: 'Preview Settings closing', from: 'top', opening: false, edge: header });

    await reduceMotion(page);
    expectTodaysMotion(await pressAndWatch(page, camera), { name: 'Camera under reduced motion', ms: 0 });
    expectTodaysMotion(await pressAndWatch(page, settings), { name: 'Preview Settings under reduced motion', ms: 0 });
  });

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true });

    test('the Customizer from the left, Preview Settings from the top, Camera and ASCII from the bar', async ({
      page,
    }) => {
      await openBox(page);

      const popOut = {
        press: '#mobileDrawerToggle',
        box: '#paramPanel',
        inside: '#drawerCloseBtn',
      };
      const camera = {
        press: '#cameraDrawerToggle',
        box: '#cameraDrawerBody',
        inside: '#mobileCameraRotateLeft',
        frame: '.preview-panel .actions-bar',
      };
      const ascii = {
        press: '#asciiDrawerToggle',
        box: '#asciiDrawerBody',
        inside: '#asciiDrawerBody input',
        frame: '.preview-panel .actions-bar',
      };
      const settings = {
        press: '#previewDrawerToggle',
        box: '.preview-info-content',
        inside: '.preview-info-content input',
        frame: '.preview-drawer-header',
      };
      const bar = { name: 'the bar', at: (s) => s.frame.y };
      const header = {
        name: 'the Preview Settings row',
        at: (s) => s.frame.y + s.frame.h,
      };

      expectTodaysMotion(await pressAndWatch(page, popOut), { name: 'Customizer out of the look, opening', ms: 240 });
      expectTodaysMotion(await pressAndWatch(page, popOut), { name: 'Customizer out of the look, closing', ms: 240 });
      expectTodaysMotion(await pressAndWatch(page, camera), { name: 'Camera out of the look, opening', ms: 0 });
      expectTodaysMotion(await pressAndWatch(page, camera), { name: 'Camera out of the look, closing', ms: 0 });

      await setLook(page);
      expectDrawerMove(await pressAndWatch(page, camera), { name: 'Camera opening', from: 'bottom', opening: true, edge: bar });
      expectDrawerMove(await pressAndWatch(page, camera), { name: 'Camera closing', from: 'bottom', opening: false, edge: bar });
      expectDrawerMove(await pressAndWatch(page, ascii), { name: 'ASCII opening', from: 'bottom', opening: true, edge: bar });
      expectDrawerMove(await pressAndWatch(page, ascii), { name: 'ASCII closing', from: 'bottom', opening: false, edge: bar });
      expectDrawerMove(await pressAndWatch(page, popOut), { name: 'Customizer opening', from: 'left', opening: true, edge: WINDOW });
      expectDrawerMove(await pressAndWatch(page, popOut), { name: 'Customizer closing', from: 'left', opening: false, edge: WINDOW });
      expectDrawerMove(await pressAndWatch(page, settings), { name: 'Preview Settings opening', from: 'top', opening: true, edge: header });
      expectDrawerMove(await pressAndWatch(page, settings), { name: 'Preview Settings closing', from: 'top', opening: false, edge: header });

      await reduceMotion(page);
      expectTodaysMotion(await pressAndWatch(page, camera), { name: 'Camera under reduced motion', ms: 0 });
      expectTodaysMotion(await pressAndWatch(page, popOut), { name: 'Customizer under reduced motion', ms: 0 });
    });
  });
});
