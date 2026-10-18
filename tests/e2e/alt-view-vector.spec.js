/**
 * The Alt View's vector look: below 30% on the Characters slider the model is
 * drawn as its edges in lines of the look's color, in place of characters.
 * The line widens with the size and 0% still draws; the faces stay dark
 * until the Surfaces slider fills them; the green look glows and keeps a
 * fading trace while the view turns; Classic's DOS look draws crisp pixels
 * with no trace. Judged from the look's own screen, pixel by pixel.
 *
 * @license GPL-3.0-or-later
 */

import { test, expect } from '@playwright/test';
import { skipWithoutWebGL } from './helpers/webgl.js';
import { drawersBack } from './helpers/alt-view.js';

test.describe.configure({ timeout: 240_000 });

const WASM_READY_TIMEOUT = 180_000;

async function openBox(page, mode) {
  await page.addInitScript((mode) => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
    localStorage.setItem('openscad-forge-theme', 'dark');
    localStorage.setItem('openscad-customizer-hfm-unlock', 'true');
    localStorage.setItem('openscad-forge-sounds', 'false');
    localStorage.setItem(
      'openscad-forge-ui-mode',
      JSON.stringify({ mode, lastCustomMode: 'standard' })
    );
  }, mode);
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
  await drawersBack(page);
}

/** Set one of the look's sliders as a person dragging it would. */
async function slide(page, id, value) {
  await page.evaluate(
    ({ id, value }) => {
      const input = document.getElementById(id);
      input.value = String(value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    },
    { id, value }
  );
  // A few frames for the look to draw the change.
  await page.waitForTimeout(600);
}

/**
 * The look's screen as numbers. Each pixel is placed between the screen's
 * color (0) and the look's line color (1): lit at 0.6 and over, half-lit
 * between 0.1 and 0.6, dark under 0.1. `lit` and `half` count them. The
 * screen is kept in the page under `name` for the comparisons below; `mean`
 * is the average placement over a kept mask, when one is named.
 */
async function readScreen(page, name, maskName = null) {
  return page.evaluate(
    ({ name, maskName }) => {
      const canvas = document.querySelector('.hfm-overlay-canvas');
      const { width, height } = canvas;
      const data = canvas
        .getContext('2d')
        .getImageData(0, 0, width, height).data;
      const parse = (css) => {
        const probe = document.createElement('canvas').getContext('2d');
        probe.fillStyle = css;
        probe.fillRect(0, 0, 1, 1);
        return [...probe.getImageData(0, 0, 1, 1).data.slice(0, 3)];
      };
      const line = parse(
        getComputedStyle(document.body).getPropertyValue('--color-accent').trim()
      );
      const screen = parse(getComputedStyle(canvas).backgroundColor);
      const span = line.map((c, i) => c - screen[i]);
      const span2 = span.reduce((sum, c) => sum + c * c, 0);
      const kept = (window.__vectorScreens ??= {});
      const mask = maskName ? kept[maskName].mask : null;
      const placeAt = new Uint8Array(width * height);
      let lit = 0;
      let half = 0;
      let masked = 0;
      let sum = 0;
      for (let i = 0, p = 0; i < data.length; i += 4, p++) {
        let dot = 0;
        for (let c = 0; c < 3; c++) dot += (data[i + c] - screen[c]) * span[c];
        const t = Math.max(0, Math.min(1, dot / span2));
        placeAt[p] = Math.round(t * 255);
        if (t >= 0.6) lit++;
        else if (t >= 0.1) half++;
        if (mask && mask[p]) {
          masked++;
          sum += t;
        }
      }
      kept[name] = { placeAt };
      return { lit, half, mean: masked ? sum / masked : null };
    },
    { name, maskName }
  );
}

/** The share of one kept screen's lit pixels that another lights too. */
function covered(page, inner, outer) {
  return page.evaluate(
    ({ inner, outer }) => {
      const a = window.__vectorScreens[inner].placeAt;
      const b = window.__vectorScreens[outer].placeAt;
      const lit = 0.6 * 255;
      let count = 0;
      let hit = 0;
      for (let p = 0; p < a.length; p++) {
        if (a[p] < lit) continue;
        count++;
        if (b[p] >= lit) hit++;
      }
      return count ? hit / count : 0;
    },
    { inner, outer }
  );
}

/**
 * Keep as `faces` the pixels the model filled solid lights (0.2 and over)
 * that the faint screen leaves dark; returns how many.
 */
function keepFaces(page, solid, faint) {
  return page.evaluate(
    ({ solid, faint }) => {
      const kept = window.__vectorScreens;
      const a = kept[solid].placeAt;
      const b = kept[faint].placeAt;
      const mask = new Uint8Array(a.length);
      let count = 0;
      for (let p = 0; p < a.length; p++) {
        if (a[p] >= 0.2 * 255 && b[p] < 0.1 * 255) {
          mask[p] = 1;
          count++;
        }
      }
      kept.faces = { mask };
      return count;
    },
    { solid, faint }
  );
}

// The middle gap between frames, in ms, while `run` runs.
async function frameGap(page, run) {
  await page.evaluate(() => {
    const times = [];
    let on = true;
    const tick = (t) => {
      times.push(t);
      if (on) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    window.__stopFrames = () => {
      on = false;
      const gaps = times
        .slice(1)
        .map((t, n) => t - times[n])
        .sort((a, b) => a - b);
      return gaps.length ? gaps[Math.floor(gaps.length / 2)] : Infinity;
    };
  });
  const result = await run();
  const gap = await page.evaluate(() => window.__stopFrames());
  return { result, gap };
}

async function drag(page, steps, during) {
  const box = await page.locator('#previewContainer').boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 3;
  await page.mouse.move(x, y);
  await page.mouse.down();
  let seen = null;
  for (let n = 1; n <= steps; n++) {
    await page.mouse.move(x + n * 20, y);
    await page.waitForTimeout(16);
    if (n === steps) seen = await during();
  }
  await page.mouse.up();
  return seen;
}

test.describe('The vector look', () => {
  test('under 30% the model is lines of the look, widening with the size; 0% still draws; Surfaces fills the faces', async ({
    page,
  }) => {
    await openBox(page, 'standard');
    const strip = page.locator('#previewStatusAltAdjust');
    const size = page.locator('#_hfmFontScale');

    await slide(page, '_hfmFontScale', 0.3);
    await expect(strip).toContainText('SIZE 30%');
    await expect(size).toHaveAttribute('aria-valuetext', '30%');
    const characters = await readScreen(page, 'characters');

    await slide(page, '_hfmFontScale', 0.25);
    await expect(strip).toContainText('LINES 25%');
    await expect(size).toHaveAttribute('aria-valuetext', 'Vector lines, 25%');
    const wide = await readScreen(page, 'wide');
    await slide(page, '_hfmFontScale', 0.15);
    const middle = await readScreen(page, 'middle');
    await slide(page, '_hfmFontScale', 0);
    await expect(size).toHaveAttribute('aria-valuetext', 'Vector lines, 0%');
    const thin = await readScreen(page, 'thin');
    const thinCoveredByWide = await covered(page, 'thin', 'wide');

    // The faces: what the model filled solid lights and Surfaces 1% leaves
    // dark, away from the lines.
    await slide(page, '_hfmFontScale', 0.25);
    await readScreen(page, 'faint');
    await slide(page, '_hfmSurfaces', 1);
    await readScreen(page, 'solid');
    const faceCount = await keepFaces(page, 'solid', 'faint');
    await slide(page, '_hfmSurfaces', 0.5);
    const half = await readScreen(page, 'half', 'faces');
    await slide(page, '_hfmSurfaces', 0.01);
    await slide(page, '_hfmFontScale', 0.3);
    const charactersInFaces = await readScreen(page, 'again', 'faces');

    const numbers = {
      lit: { characters: characters.lit, wide: wide.lit, middle: middle.lit, thin: thin.lit },
      thinCoveredByWide,
      faces: { pixels: faceCount, half: half.mean, characters: charactersInFaces.mean },
    };
    test.info().annotations.push({ type: 'measured', description: JSON.stringify(numbers) });
    console.log('vector look:', JSON.stringify(numbers));

    expect(thin.lit, '0% still draws').toBeGreaterThan(500);
    expect(middle.lit, '15% wider than 0%').toBeGreaterThan(thin.lit);
    expect(wide.lit, '25% wider than 15%').toBeGreaterThan(middle.lit);
    expect(wide.lit / thin.lit, '25% at least twice 0%').toBeGreaterThanOrEqual(2);
    expect(thinCoveredByWide, 'the same lines, only wider').toBeGreaterThan(0.9);
    expect(faceCount, 'faces the lines leave dark').toBeGreaterThan(5000);
    expect(half.mean, 'Surfaces 50% fills them').toBeGreaterThan(0.3);
    expect(charactersInFaces.mean, 'characters fill them').toBeGreaterThan(0.3);
  });

  test("the green look's lines leave a fading trace as the view turns; the DOS look's pixels are crisp and leave none", async ({
    page,
  }) => {
    await openBox(page, 'standard');
    await slide(page, '_hfmFontScale', 0.25);
    const greenStill = await readScreen(page, 'still');
    const { result: greenTurning, gap } = await frameGap(page, () =>
      drag(page, 10, () => readScreen(page, 'turning'))
    );

    const classic = await page.context().newPage();
    await page.close();
    await openBox(classic, 'classic');
    await slide(classic, '_hfmFontScale', 0.25);
    const dosStill = await readScreen(classic, 'still');
    const dosTurning = await drag(classic, 10, () =>
      readScreen(classic, 'turning')
    );

    const numbers = {
      frameGapMs: Math.round(gap),
      green: { still: { lit: greenStill.lit, half: greenStill.half }, turning: { lit: greenTurning.lit, half: greenTurning.half } },
      dos: { still: { lit: dosStill.lit, half: dosStill.half }, turning: { lit: dosTurning.lit, half: dosTurning.half } },
    };
    test.info().annotations.push({ type: 'measured', description: JSON.stringify(numbers) });
    console.log('glow and trace:', JSON.stringify(numbers));

    expect(dosStill.lit, 'the DOS look draws').toBeGreaterThan(500);
    expect(dosTurning.half / dosTurning.lit, 'no half-lit pixels in DOS, turning').toBeLessThan(0.02);
    expect(dosStill.half / dosStill.lit, 'nor still').toBeLessThan(0.02);
    // The trace fades by the clock, the Glow's share every 33 ms, so a
    // machine that draws a frame only now and then (a test runner's software
    // drawing) shows little of it between frames. It is checked where the
    // frames come at least every 40 ms, and the gap is recorded either way.
    if (gap <= 40) {
      expect(greenTurning.half / greenTurning.lit, 'the green trace and glow').toBeGreaterThan(
        (greenStill.half / greenStill.lit) * 1.2
      );
    } else {
      test.info().annotations.push({
        type: 'not checked',
        description: `the green trace: frames ${Math.round(gap)} ms apart, too far apart for a trace that fades by the clock to show`,
      });
    }
  });
});
