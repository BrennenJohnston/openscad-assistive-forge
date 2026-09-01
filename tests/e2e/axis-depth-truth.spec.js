import { test, expect } from '@playwright/test';
import path from 'path';

// UF-7 (U-11) — "Axes that lie flat and tell the truth."
//
// Two mechanical proofs the desktop references demand:
//
// 1. DEPTH: marks behind solid geometry do not draw over it. The pre-UF-7
//    overlay billboarded its labels with depthTest:false and renderOrder=10,
//    so every number drew THROUGH the model. The probe toggles the marks and
//    compares canvas pixels inside a region the model occludes — honest depth
//    means the toggle changes nothing there, while a sky region where labels
//    live must change (that second assertion keeps the first from passing
//    vacuously on a mispositioned box).
//
// 2. ZOOM ADAPTATION: the overlay is a function of the camera distance
//    (desktop showScalemarkers: tick = 10^floor(log10 l)/10). Driving the
//    Viewport-Control panel's distance field through a decade boundary must
//    rebuild the overlay with the new step — through the real controls
//    'change' path, not by calling the builder.
//
// The camera pose is the desktop close-up reference (Screenshot 2026-08-10
// 154809: translate [3.83 18.81 -4.09], rotate [71.80 0 14.50], distance
// 140, fov 22.5), converted to the panel's euler exactly as UF-6 P0
// validated: vpRx/Ry/Rz = 71.2425/13.7599/0.

const UNIVERSAL_CUFF = path.join(
  process.cwd(),
  'tests',
  'fixtures',
  'universal-cuff',
  'universal_cuff_utensil_holder.scad'
);

const WASM_READY_TIMEOUT = 180_000;

const REFERENCE_POSE = {
  tx: 3.83,
  ty: 18.81,
  tz: -4.09,
  rx: 71.2425,
  ry: 13.7599,
  rz: 0,
  distance: 140,
  fov: 22.5,
};

function seedClassicPanes(page) {
  return page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
    localStorage.setItem(
      'openscad-forge-classic-panes',
      JSON.stringify({
        editorVisible: true,
        customizerVisible: true,
        consoleCollapsed: true,
        animateVisible: false,
        fontListVisible: false,
        viewportControlVisible: true,
      })
    );
  });
}

async function loadProject(page, fixture) {
  await page.goto('/');
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: WASM_READY_TIMEOUT,
  });
  await page.locator('#fileInput').setInputFiles(fixture);
  await expect(page.locator('#welcomeScreen')).toBeHidden({ timeout: 30_000 });
  const notNowBtn = page.locator('#saveProjectNotNow');
  try {
    await notNowBtn.waitFor({ state: 'visible', timeout: 3_000 });
    await notNowBtn.click();
  } catch {
    // Save-project modal did not appear; nothing to dismiss.
  }
}

async function enterClassicStandard(page) {
  const toggle = page.locator('#uiModeToggle');
  await expect(toggle).toBeVisible({ timeout: 10_000 });
  if ((await toggle.getAttribute('aria-checked')) !== 'true') {
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
  }
  await page.locator('#classicModeToggle').click();
  await expect(page.locator('body')).toHaveAttribute('data-ui-mode', 'classic');
  const densityToggle = page.locator('#classicDensityToggle');
  await expect(densityToggle).toBeVisible({ timeout: 10_000 });
  if ((await densityToggle.getAttribute('aria-checked')) !== 'true') {
    await densityToggle.click();
  }
}

async function skipWithoutRenderer(page) {
  const canvases = await page.locator('.preview-panel canvas').count();
  test.skip(canvases === 0, 'no WebGL renderer: nothing draws, nothing hides');
}

/**
 * The depth probe needs a MODEL in the scene — the whole claim is that
 * geometry occludes marks. CI WebKit's preview render fails environment-
 * wide (red on develop's own runs long before UF-7: auto-preview and
 * classic-mode show the same "Preview failed" there), and with no mesh
 * the occlusion box correctly finds zero model pixels. Skip on the
 * app's own error state instead of failing on the sanity guard; the
 * required Chromium and Edge lanes do render and do assert.
 */
async function skipWithoutRenderedModel(page) {
  const indicator = page.locator('.preview-state-indicator');
  await expect
    .poll(
      async () => (await indicator.getAttribute('class').catch(() => '')) ?? '',
      { timeout: 120_000 }
    )
    .toMatch(/state-current|state-error/);
  const cls = (await indicator.getAttribute('class').catch(() => '')) ?? '';
  test.skip(
    /state-error/.test(cls),
    'preview render failed in this environment: no model, nothing occludes'
  );
}

const overlay = (page) =>
  page.evaluate(() => window.__forgeDebug.axisTickOverlay());

async function waitForOverlayInScene(page) {
  await expect
    .poll(() => overlay(page), { timeout: 120_000 })
    .toMatchObject({ enabled: true, inScene: true });
}

async function setPose(page, pose) {
  for (const [id, value] of [
    ['vpTx', pose.tx],
    ['vpTy', pose.ty],
    ['vpTz', pose.tz],
    ['vpRx', pose.rx],
    ['vpRy', pose.ry],
    ['vpRz', pose.rz],
    ['vpDistance', pose.distance],
    ['vpFov', pose.fov],
  ]) {
    await page.locator(`#${id}`).fill(String(value));
  }
  await page.locator('#vpFov').dispatchEvent('change');
  await page.waitForTimeout(500);
}

async function toggleMarks(page) {
  await page.evaluate(() => document.getElementById('viewMenuBtn')?.click());
  await page.waitForTimeout(300);
  await page
    .getByRole('menuitemcheckbox', { name: /scale marker|axis distance/i })
    .first()
    .click();
  await page.waitForTimeout(300);
}

/**
 * Sample a normalized region of the WebGL canvas ((0,0) = top-left CSS
 * fractions) on a coarse grid. Reads inside requestAnimationFrame so the
 * draw buffer is valid without preserveDrawingBuffer (the pattern
 * full-render-color.spec.js established). Returns flat [r,g,b,...].
 */
function sampleRegion(page, box) {
  return page.evaluate((b) => {
    return new Promise((resolve) => {
      // UF-9 P3: nested double-rAF — on CI WebKit a single rAF once ran
      // BEFORE the app's render pass (run 31528677140, triad case, "no red
      // arm pixels", retry-green), so the sample must follow a full frame.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const canvas = document.querySelector('.preview-panel canvas');
          const gl =
            canvas &&
            (canvas.getContext('webgl2') || canvas.getContext('webgl'));
          if (!gl) {
            resolve(null);
            return;
          }
          const w = canvas.width;
          const h = canvas.height;
          const grid = 24;
          const out = [];
          const px = new Uint8Array(4);
          for (let gy = 0; gy < grid; gy++) {
            for (let gx = 0; gx < grid; gx++) {
              const fx = b.x0 + ((gx + 0.5) / grid) * (b.x1 - b.x0);
              const fy = b.y0 + ((gy + 0.5) / grid) * (b.y1 - b.y0);
              const x = Math.floor(fx * w);
              // readPixels row 0 is the BOTTOM of the buffer.
              const y = Math.floor((1 - fy) * h);
              gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
              out.push(px[0], px[1], px[2]);
            }
          }
          resolve(out);
        });
      });
    });
  }, box);
}

function changedSamples(a, b) {
  let changed = 0;
  for (let i = 0; i < a.length; i += 3) {
    const delta =
      Math.abs(a[i] - b[i]) +
      Math.abs(a[i + 1] - b[i + 1]) +
      Math.abs(a[i + 2] - b[i + 2]);
    if (delta > 12) changed++;
  }
  return changed;
}

/**
 * Read EVERY pixel of a normalized box and count strongly red, green and
 * blue ones. The triad arms are 1px lines — grid sampling would mostly
 * miss them, so this scans the full rectangle in one readPixels call.
 */
function countBoxColors(page, box) {
  return page.evaluate((b) => {
    return new Promise((resolve) => {
      // UF-9 P3: nested double-rAF, same reason as sampleRegion above.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const canvas = document.querySelector('.preview-panel canvas');
          const gl =
            canvas &&
            (canvas.getContext('webgl2') || canvas.getContext('webgl'));
          if (!gl) {
            resolve(null);
            return;
          }
          const w = canvas.width;
          const h = canvas.height;
          const x0 = Math.floor(b.x0 * w);
          const y0 = Math.floor((1 - b.y1) * h);
          const bw = Math.max(1, Math.floor((b.x1 - b.x0) * w));
          const bh = Math.max(1, Math.floor((b.y1 - b.y0) * h));
          const px = new Uint8Array(bw * bh * 4);
          gl.readPixels(x0, y0, bw, bh, gl.RGBA, gl.UNSIGNED_BYTE, px);
          let red = 0;
          let green = 0;
          let blue = 0;
          for (let i = 0; i < px.length; i += 4) {
            const r = px[i];
            const g = px[i + 1];
            const bl = px[i + 2];
            if (r > 140 && r - g > 60 && r - bl > 60) red++;
            else if (g > 140 && g - r > 60 && g - bl > 60) green++;
            else if (bl > 140 && bl - r > 60 && bl - g > 60) blue++;
          }
          resolve({ red, green, blue, total: bw * bh });
        });
      });
    });
  }, box);
}

// The cuff's front band fills the canvas center-left at the reference pose;
// the -Z axis and its numbers pass BEHIND it. The sky box sits upper-right
// where the +Y numbers march away from the ring.
const OCCLUDED_BOX = { x0: 0.3, y0: 0.52, x1: 0.42, y1: 0.64 };
const SKY_BOX = { x0: 0.55, y0: 0.06, x1: 0.85, y1: 0.32 };

test.describe('UF-7 axis depth truth', () => {
  test('marks behind the model stay hidden; marks in the open stay visible', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await seedClassicPanes(page);
    await loadProject(page, UNIVERSAL_CUFF);
    await enterClassicStandard(page);
    await skipWithoutRenderer(page);
    await skipWithoutRenderedModel(page);
    await waitForOverlayInScene(page);

    await setPose(page, REFERENCE_POSE);

    const state = await overlay(page);
    expect(state.nodes).toEqual([
      '__axisTickDigits',
      '__axisTickLines',
      '__axisTickLinesNeg',
    ]);
    expect(state.tickStepMm).toBe(10);

    const onModel = await sampleRegion(page, OCCLUDED_BOX);
    const onSky = await sampleRegion(page, SKY_BOX);
    test.skip(onModel === null, 'WebGL context not readable');

    // The occluded box must actually be ON the model: the preview mesh wears
    // the WASM-baked Cornfield yellow under every scheme, so warm pixels
    // (r,g high, b low) prove the box is not floating in the sky.
    const warm = [];
    for (let i = 0; i < onModel.length; i += 3) {
      if (
        onModel[i] > 120 &&
        onModel[i + 1] > 100 &&
        onModel[i] - onModel[i + 2] > 40
      ) {
        warm.push(i);
      }
    }
    expect(
      warm.length,
      'occlusion box missed the model — pose or layout drifted'
    ).toBeGreaterThan((onModel.length / 3) * 0.5);

    await toggleMarks(page);
    await expect.poll(() => overlay(page)).toMatchObject({ enabled: false });

    const offModel = await sampleRegion(page, OCCLUDED_BOX);
    const offSky = await sampleRegion(page, SKY_BOX);

    const skyChanged = changedSamples(onSky, offSky);
    const modelChanged = changedSamples(onModel, offModel);

    // Sensitivity: the sky box watched real marks disappear.
    expect(
      skyChanged,
      'toggling marks changed nothing in the sky box — probe is blind'
    ).toBeGreaterThan(5);

    // The claim itself: nothing behind the model ever drew over it, so
    // removing the marks changes nothing there. The pre-UF-7 sprites drew
    // straight through and fail this. ≤1% tolerates antialiasing flicker.
    expect(
      modelChanged,
      `depth violated: ${modelChanged} model-region samples changed when marks toggled`
    ).toBeLessThanOrEqual((onModel.length / 3) * 0.01);

    await toggleMarks(page);
  });

  test('the overlay re-derives its scale when the camera distance moves', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await seedClassicPanes(page);
    await loadProject(page, UNIVERSAL_CUFF);
    await enterClassicStandard(page);
    await skipWithoutRenderer(page);
    await waitForOverlayInScene(page);

    await setPose(page, REFERENCE_POSE);
    await expect
      .poll(() => overlay(page))
      .toMatchObject({ tickStepMm: 10, enabled: true });

    // Cross a decade boundary through the real panel → controls path.
    await page.locator('#vpDistance').fill('1000');
    await page.locator('#vpDistance').dispatchEvent('change');

    await expect
      .poll(() => overlay(page), { timeout: 15_000 })
      .toMatchObject({ tickStepMm: 100 });
    const far = await overlay(page);
    expect(far.distanceMm).toBeGreaterThan(990);
    // k·100 < 1000 → ticks at k=0..9 on six half-axes; no 10th tick, so the
    // numbers all come from the every-2nd rule (l/lAdjusted = 1 < 3).
    expect(far.ticks).toBe(10 * 6);
    expect(far.labels).toBe(4 * 6);

    // And back down two decades.
    await page.locator('#vpDistance').fill('42');
    await page.locator('#vpDistance').dispatchEvent('change');
    await expect
      .poll(() => overlay(page), { timeout: 15_000 })
      .toMatchObject({ tickStepMm: 1 });
  });

  test('the corner triad paints its RGB arms lower-left and follows the Axes toggle', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await seedClassicPanes(page);
    await loadProject(page, UNIVERSAL_CUFF);
    await enterClassicStandard(page);
    await skipWithoutRenderer(page);
    await waitForOverlayInScene(page);
    await setPose(page, REFERENCE_POSE);

    const triad = () => page.evaluate(() => window.__forgeDebug.axisTriad());
    await expect
      .poll(triad, { timeout: 20_000 })
      .toMatchObject({ enabled: true, present: true });
    // Cornfield's axes are black — the letters carry the scheme color.
    expect((await triad()).letterColorHex).toBe(0x000000);

    // The corner box: anchor at (10% W, 10% up from the bottom), side =
    // 3 × height/18 → generous margins either way.
    const CORNER = { x0: 0.0, y0: 0.76, x1: 0.22, y1: 1.0 };
    const withTriad = await countBoxColors(page, CORNER);
    test.skip(withTriad === null, 'WebGL context not readable');

    // All three arms are in the corner: red, green AND blue pixels. The
    // model is Cornfield yellow and the marks are black, so nothing else
    // in the scene can satisfy these thresholds.
    expect(withTriad.red, 'no red arm pixels in the corner').toBeGreaterThan(5);
    expect(withTriad.green, 'no green arm pixels').toBeGreaterThan(5);
    expect(withTriad.blue, 'no blue arm pixels').toBeGreaterThan(5);

    // The triad follows the Axes toggle, exactly as desktop smallaxes
    // follow Show Axes.
    await page.evaluate(() => document.getElementById('viewMenuBtn')?.click());
    await page.waitForTimeout(300);
    await page
      .getByRole('menuitemcheckbox', { name: /show axes/i })
      .first()
      .click();
    await expect
      .poll(triad, { timeout: 10_000 })
      .toMatchObject({ enabled: false, present: false });

    const withoutTriad = await countBoxColors(page, CORNER);
    expect(withoutTriad.red).toBeLessThanOrEqual(1);
    expect(withoutTriad.green).toBeLessThanOrEqual(1);
    expect(withoutTriad.blue).toBeLessThanOrEqual(1);

    // Leave the world as found.
    await page.evaluate(() => document.getElementById('viewMenuBtn')?.click());
    await page.waitForTimeout(300);
    await page
      .getByRole('menuitemcheckbox', { name: /show axes/i })
      .first()
      .click();
    await expect.poll(triad).toMatchObject({ enabled: true, present: true });
  });
});
