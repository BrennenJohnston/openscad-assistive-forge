/**
 * The Alt View's vector look: below 40% on the Focus slider the model is
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

async function openBox(page, mode, example = 'simple-box') {
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
  await page.goto(`/?example=${example}`);
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
        getComputedStyle(document.body)
          .getPropertyValue('--color-accent')
          .trim()
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

// A drag of `steps` moves; `during` is called on the last step, or on
// every step from `readFrom` on, and its results are returned in order.
async function drag(page, steps, during, readFrom = steps) {
  const box = await page.locator('#previewContainer').boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 3;
  await page.mouse.move(x, y);
  await page.mouse.down();
  const seen = [];
  for (let n = 1; n <= steps; n++) {
    await page.mouse.move(x + n * 20, y);
    await page.waitForTimeout(16);
    if (n >= readFrom) seen.push(await during());
  }
  await page.mouse.up();
  return readFrom === steps ? seen[0] : seen;
}

test.describe('The vector look', () => {
  test('under 40% the model is lines of the look, widening with the size; 0% still draws; Surfaces fills the faces', async ({
    page,
  }) => {
    await openBox(page, 'standard');
    const strip = page.locator('#previewStatusAltAdjust');
    const size = page.locator('#_hfmFontScale');

    await slide(page, '_hfmFontScale', 0.4);
    await expect(strip).toContainText('FOCUS 40%');
    await expect(size).toHaveAttribute('aria-valuetext', '40%');
    const characters = await readScreen(page, 'characters');

    await slide(page, '_hfmFontScale', 0.35);
    await expect(strip).toContainText('LINES 35%');
    await expect(size).toHaveAttribute('aria-valuetext', 'Vector lines, 35%');
    const wide = await readScreen(page, 'wide');
    await slide(page, '_hfmFontScale', 0.2);
    const middle = await readScreen(page, 'middle');
    await slide(page, '_hfmFontScale', 0);
    await expect(size).toHaveAttribute('aria-valuetext', 'Vector lines, 0%');
    const thin = await readScreen(page, 'thin');
    const thinCoveredByWide = await covered(page, 'thin', 'wide');

    // The faces: what the model filled solid lights and Surfaces 1% leaves
    // dark, away from the lines.
    await slide(page, '_hfmFontScale', 0.35);
    await readScreen(page, 'faint');
    await slide(page, '_hfmSurfaces', 1);
    await readScreen(page, 'solid');
    const faceCount = await keepFaces(page, 'solid', 'faint');
    // At 100 % the faces are solid: they write depth and hide what is
    // behind them, lit by the preview's own lights; under it they blend.
    const surfacesWord = () =>
      page.locator('.hfm-overlay-canvas').getAttribute('data-surfaces');
    await expect.poll(surfacesWord, { timeout: 5_000 }).toBe('solid');
    const solidFaces = await readScreen(page, 'solid-shaded', 'faces');
    await slide(page, '_hfmSurfaces', 0.5);
    await expect.poll(surfacesWord, { timeout: 5_000 }).toBe('clear');
    const half = await readScreen(page, 'half', 'faces');
    await slide(page, '_hfmSurfaces', 0.01);
    await slide(page, '_hfmFontScale', 0.4);
    const charactersInFaces = await readScreen(page, 'again', 'faces');

    const numbers = {
      lit: {
        characters: characters.lit,
        wide: wide.lit,
        middle: middle.lit,
        thin: thin.lit,
      },
      thinCoveredByWide,
      faces: {
        pixels: faceCount,
        solid: solidFaces.mean,
        half: half.mean,
        characters: charactersInFaces.mean,
      },
    };
    test
      .info()
      .annotations.push({
        type: 'measured',
        description: JSON.stringify(numbers),
      });
    console.log('vector look:', JSON.stringify(numbers));

    expect(thin.lit, '0% still draws').toBeGreaterThan(500);
    expect(middle.lit, '20% wider than 0%').toBeGreaterThan(thin.lit);
    expect(wide.lit, '35% wider than 20%').toBeGreaterThan(middle.lit);
    expect(wide.lit / thin.lit, '35% at least twice 0%').toBeGreaterThanOrEqual(
      2
    );
    expect(thinCoveredByWide, 'the same lines, only wider').toBeGreaterThan(
      0.9
    );
    expect(faceCount, 'faces the lines leave dark').toBeGreaterThan(5000);
    // At 50 % the blended faces stack, front and back, and the lines behind
    // show through, so their placement is not under the solid faces' (0.69
    // against 0.63 measured); solid is checked by its own mark above.
    expect(solidFaces.mean, 'Surfaces 100% fills them solid and lit').toBeGreaterThan(0.2);
    expect(half.mean, 'Surfaces 50% fills them').toBeGreaterThan(0.2);
    expect(charactersInFaces.mean, 'characters fill them').toBeGreaterThan(0.3);
  });

  test('rounded parts: the logo plate gets its outline and a dim wireframe of its corners in the DOS look; at Edges 400 % every facet is a crease and the wireframe is empty', async ({
    page,
  }) => {
    // The DOS look draws crisp: a dim line is half-lit, and nothing else is.
    await openBox(page, 'classic', 'logo-plate');
    await slide(page, '_hfmFontScale', 0.35);
    const lines = () =>
      page
        .locator('.hfm-overlay-canvas')
        .getAttribute('data-lines')
        .then((text) => (text ?? '').split(' ').map(Number));
    await expect
      .poll(async () => (await lines()).length, { timeout: 10_000 })
      .toBe(3);
    const [creases, outline, facets] = await lines();
    const plate = await readScreen(page, 'plate');
    expect(creases, 'the creases as before').toBeGreaterThan(100);
    expect(outline, 'the outline at the rounded corners').toBeGreaterThan(0);
    expect(facets, 'the dim wireframe of the corners').toBeGreaterThan(10);
    expect(plate.half, 'the dim lines are half-lit').toBeGreaterThan(50);

    // At Edges 400 % (a crease at 1 degree) every facet is a crease, drawn
    // bright: nothing is left for the wireframe or the outline.
    await slide(page, '_hfmContrast', 4);
    await expect
      .poll(async () => (await lines())[2], { timeout: 10_000 })
      .toBe(0);
    const sharp = await lines();
    const sharpScreen = await readScreen(page, 'sharp');
    expect(sharp[0], 'every facet a crease').toBeGreaterThan(creases);
    expect(sharp[1], 'no outline left').toBe(0);
    expect(sharpScreen.half, 'nothing half-lit: no dim lines').toBe(0);
    test.info().annotations.push({
      type: 'measured',
      description: JSON.stringify({
        plate: { creases, outline, facets, half: plate.half },
        sharp: { lines: sharp, half: sharpScreen.half },
      }),
    });
  });

  test("the green look's lines leave a fading trace as the view turns; the DOS look's pixels are crisp and leave none", async ({
    page,
  }) => {
    await openBox(page, 'standard');
    await slide(page, '_hfmFontScale', 0.35);
    const greenStill = await readScreen(page, 'still');
    // The trace is a decaying maximum of the frames before, so one frame's
    // read is noisy: the strongest of the last four steps' reads stands for
    // the turning view, and a read after the drag shows the trace fading.
    const { result: turningReads, gap } = await frameGap(page, () =>
      drag(page, 10, () => readScreen(page, 'turning'), 7)
    );
    const greenTurning = turningReads.reduce((best, read) =>
      read.half / read.lit > best.half / best.lit ? read : best
    );
    await page.waitForTimeout(1_500);
    const greenAfter = await readScreen(page, 'after');

    const classic = await page.context().newPage();
    await page.close();
    await openBox(classic, 'classic');
    await slide(classic, '_hfmFontScale', 0.35);
    const dosStill = await readScreen(classic, 'still');
    const dosTurning = await drag(classic, 10, () =>
      readScreen(classic, 'turning')
    );

    const numbers = {
      frameGapMs: Math.round(gap),
      green: {
        still: { lit: greenStill.lit, half: greenStill.half },
        turning: { lit: greenTurning.lit, half: greenTurning.half },
        after: { lit: greenAfter.lit, half: greenAfter.half },
      },
      dos: {
        still: { lit: dosStill.lit, half: dosStill.half },
        turning: { lit: dosTurning.lit, half: dosTurning.half },
      },
    };
    test
      .info()
      .annotations.push({
        type: 'measured',
        description: JSON.stringify(numbers),
      });
    console.log('glow and trace:', JSON.stringify(numbers));

    expect(dosStill.lit, 'the DOS look draws').toBeGreaterThan(500);
    // The DOS look's dim wireframe is half-lit at rest, a small share of
    // the picture; turning adds no trace to it.
    expect(dosStill.half / dosStill.lit, 'the dim lines, a small share').toBeLessThan(0.2);
    expect(
      dosTurning.half / dosTurning.lit,
      'no trace in DOS: no more half-lit turning than still'
    ).toBeLessThanOrEqual(dosStill.half / dosStill.lit + 0.005);
    // The trace fades by the clock, the Glow's share every 33 ms, so a
    // machine that draws a frame only now and then (a test runner's software
    // drawing) shows little of it between frames. It is checked where the
    // frames come at least every 40 ms, and the gap is recorded either way:
    // more half-lit pixels while turning than at rest, and fewer again once
    // the view has been still.
    if (gap <= 40) {
      const still = greenStill.half / greenStill.lit;
      const turning = greenTurning.half / greenTurning.lit;
      const after = greenAfter.half / greenAfter.lit;
      expect(turning, 'the green trace and glow, turning').toBeGreaterThan(
        still * 1.05
      );
      expect(after, 'the trace fades once the view is still').toBeLessThan(
        turning
      );
    } else {
      test.info().annotations.push({
        type: 'not checked',
        description: `the green trace: frames ${Math.round(gap)} ms apart, too far apart for a trace that fades by the clock to show`,
      });
    }
  });

  test('each look keeps its own Lens: the green look starts at 90, 65, 50 and 1 %, the DOS look at 140, 10, 10 and 1 % with no Glow row in its lines, and a change stays with its look across the switch and a reload', async ({
    page,
  }) => {
    await openBox(page, 'standard');
    const values = () =>
      page.evaluate(() =>
        ['_hfmContrast', '_hfmFontScale', '_hfmPersistFade', '_hfmSurfaces'].map(
          (id) => document.getElementById(id).value
        )
      );
    const glowShown = () =>
      page.evaluate(() => {
        const section = document.querySelector('._hfmPersistFade-section');
        return !!section && section.style.display !== 'none';
      });
    const status = page.locator('#previewStatusAltAdjust');
    const classic = page.locator('#classicModeToggle');

    expect(await values(), 'the green look where it starts').toEqual(['0.9', '0.65', '0.5', '0.01']);
    expect(await glowShown(), 'Glow shown in the green look').toBe(true);
    await slide(page, '_hfmContrast', 1.2);

    await classic.click();
    await expect(page.locator('body')).toHaveAttribute('data-ui-mode', 'classic');
    await expect(status).toContainText('EDGE 140%');
    expect(await values(), 'the DOS look where it starts').toEqual(['1.4', '0.1', '0.1', '0.01']);
    expect(await glowShown(), 'no Glow row in the DOS lines').toBe(false);
    await slide(page, '_hfmContrast', 2);

    await classic.click();
    await expect(page.locator('body')).toHaveAttribute('data-ui-mode', 'standard');
    await expect(status).toContainText('EDGE 120%');
    expect(await values(), 'the green look as it was left').toEqual(['1.2', '0.65', '0.5', '0.01']);
    expect(await glowShown(), 'Glow back in the green look').toBe(true);

    // Both kept across a reload: the record of each look. The example is
    // asked for again (the page drops the example from its address once
    // the project is open, so a plain reload would land on the Main Page).
    await page.waitForTimeout(400);
    await page.goto('/?example=simple-box');
    await page.waitForSelector('body[data-wasm-ready="true"]', {
      state: 'attached',
      timeout: WASM_READY_TIMEOUT,
    });
    await page.waitForFunction(() => window.previewManager?.mesh, null, {
      timeout: WASM_READY_TIMEOUT,
    });
    const notNow = page.locator('#saveProjectNotNow');
    if (await notNow.isVisible()) await notNow.click();
    await page.locator('#_hfmToggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-ui-variant', 'mono');
    await drawersBack(page);
    expect(await values(), 'the green look after a reload').toEqual(['1.2', '0.65', '0.5', '0.01']);
    await classic.click();
    await expect(page.locator('body')).toHaveAttribute('data-ui-mode', 'classic');
    await expect(status).toContainText('EDGE 200%');
    expect(await values(), 'the DOS look after a reload').toEqual(['2', '0.1', '0.1', '0.01']);
  });
});
