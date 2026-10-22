import { test } from '@playwright/test';
import { hasWebGL } from './webgl.js';

// The phone sheets' shared ground: the looks a case runs in, the simple box
// opened at a phone's size, the same project opened again, and readers of
// what the page shows. Used by ui-schema.spec.js and the sheet specs beside
// it, so that one spec file can stay inside the lane planner's shard budget.

export const WASM_READY_TIMEOUT = 180_000;

export const LOOKS = [
  { name: 'dark', theme: 'dark' },
  { name: 'light', theme: 'light' },
  { name: 'high contrast', theme: 'dark', highContrast: true },
  { name: 'Alt View', theme: 'dark', altView: true },
];

/** The simple box open in Standard at a phone's size, in a look. */
export async function openPhoneProject(page, look) {
  await page.addInitScript((l) => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
    localStorage.setItem('openscad-forge-theme', l.theme);
    if (l.highContrast) {
      localStorage.setItem('openscad-forge-high-contrast', 'true');
    }
    if (l.altView) {
      localStorage.setItem('openscad-customizer-hfm-unlock', 'true');
    }
    localStorage.setItem(
      'openscad-forge-ui-mode',
      JSON.stringify({ mode: 'standard', lastCustomMode: 'standard' })
    );
  }, look);
  await page.goto('/?example=simple-box', { timeout: 60_000 });
  if (look.altView) {
    test.skip(
      !(await hasWebGL(page)),
      'The Alt View draws from the 3D picture; this browser has no WebGL'
    );
  }
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
  if (look.altView) {
    await page.locator('#_hfmToggle').click();
    await page.waitForFunction(
      () => document.documentElement.getAttribute('data-ui-variant') === 'mono'
    );
  }
}

/**
 * The same project opened again in the same browser, the look as it was: a
 * new start of the page that keeps what was saved. (The page drops the
 * example from its address once it opens it, so a plain reload would land
 * on the Main Page.)
 */
export async function reloadPhoneProject(page, look) {
  await page.goto('/?example=simple-box', { timeout: 60_000 });
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
  if (look.altView) {
    const on = await page.evaluate(
      () => document.documentElement.getAttribute('data-ui-variant') === 'mono'
    );
    if (!on) {
      await page.locator('#_hfmToggle').click();
      await page.waitForFunction(
        () =>
          document.documentElement.getAttribute('data-ui-variant') === 'mono'
      );
    }
  }
  await page.waitForTimeout(500);
}

/** A computed background color's alpha: rgb(), rgba() or color(... / a). */
export function alphaOf(color) {
  const slash = /\/\s*([\d.]+)\s*\)$/.exec(color);
  if (slash) return Number(slash[1]);
  const rgba = /rgba\(([^)]+)\)/.exec(color);
  if (rgba) return Number(rgba[1].split(/[ ,]+/).filter(Boolean)[3]);
  return 1;
}

/** The preview canvas's box, rounded. Runs in the page. */
export function readPreviewBox() {
  const r = document
    .getElementById('previewCanvasSection')
    .getBoundingClientRect();
  return { width: Math.round(r.width), height: Math.round(r.height) };
}

/**
 * The open Preview Settings sheet on a phone held upright, read in the page:
 * its box and surface (the tint and blur come from a layer behind it when
 * one shows), the status line it starts under, the bar it ends above, and
 * the grip on its bottom edge.
 */
export function readSettingsSheet() {
  const content = document.getElementById('previewInfoContent');
  const r = content.getBoundingClientRect();
  const glass = document.querySelector(
    '.customizer-glass[data-sheet="settings"]'
  );
  const behind = glass && glass.checkVisibility() ? glass : content;
  const bcs = getComputedStyle(behind);
  const backdrop = bcs.backdropFilter || bcs.webkitBackdropFilter || '';
  const status = document.getElementById('previewStatusBar');
  const sb =
    status && status.checkVisibility() ? status.getBoundingClientRect() : null;
  const hit = sb
    ? document.elementFromPoint(sb.left + sb.width / 2, sb.top + sb.height / 2)
    : null;
  const bar = document.getElementById('actionsBar').getBoundingClientRect();
  const grip = document.getElementById('settingsHeightGrip');
  const gb = grip && grip.checkVisibility() ? grip.getBoundingClientRect() : null;
  return {
    viewportHeight: innerHeight,
    viewportWidth: innerWidth,
    position: getComputedStyle(content).position,
    top: r.top,
    bottom: r.bottom,
    height: r.height,
    statusBottom: sb ? sb.bottom : 0,
    statusCovered: !!hit?.closest(
      '#previewInfoContent, .customizer-glass, #settingsHeightGrip'
    ),
    barTop: bar.top,
    background: bcs.backgroundColor,
    backdrop,
    blurred: /blur\(/.test(backdrop),
    grip: gb
      ? {
          role: grip.getAttribute('role'),
          orientation: grip.getAttribute('aria-orientation'),
          name: grip.getAttribute('aria-label'),
          text: grip.getAttribute('aria-valuetext'),
          now: grip.getAttribute('aria-valuenow'),
          min: grip.getAttribute('aria-valuemin'),
          max: grip.getAttribute('aria-valuemax'),
          width: gb.width,
          height: gb.height,
          centerX: gb.left + gb.width / 2,
          centerY: gb.top + gb.height / 2,
        }
      : null,
  };
}
