import { test, expect } from '@playwright/test';
import path from 'path';
import { skipWithoutWebGL } from './helpers/webgl.js';

// After a face view, dragging with the mouse must orbit around the Z axis,
// not turn the camera about no particular axis at all.
//
// The mechanism. Every face view goes through PreviewManager.setCameraView,
// and a view that leaves camera.up off world Z (Top with up:[0,1,0], Bottom
// with up:[0,-1,0]) breaks the orbit. OrbitControls reads camera.up once,
// when it is constructed (the quat inside its update() IIFE), so a later up
// never reaches the orbit math, but the lookAt(target) that ends every
// frame's update does read it. A left-behind up therefore cannot re-aim the
// turntable; it only rolls the picture, and the roll grows with every drag.
//
// The instrument. `__forgeDebug.cameraPose()` gives the camera's own world
// axes, right and up, read from its matrix. (The rotation the Viewport-Control
// panel publishes is OpenSCAD's $vpr, worked out from where the camera sits,
// so it cannot show a roll.) three's lookAt() builds screen-right as
// normalize(up x forward), so screen-right is always perpendicular to
// camera.up. In a Z-up app that makes
//
//     |screenRight.z| == 0   <=>   the picture is not rolled
//
// and it is non-zero exactly when a stale up is steering the frame. Dragged
// sideways in 25px steps after Top, a stale up reads 0.426, 0.644 and
// 0.711; a correct frame reads 0 at every step, in both interfaces.

const STL_FIXTURE = path.join(
  process.cwd(),
  'tests',
  'fixtures',
  'parity',
  'cube10.stl'
);

const WASM_READY_TIMEOUT = 180_000;
const D2R = Math.PI / 180;

// Damping is on (dampingFactor 0.05), so the camera keeps easing after mouseup,
// a fixed share per frame. Measured after a 40 px pull: still 0.4 degrees from
// rest at 1.2 s at 60 frames a second, and 1.9 degrees at 34. A slow runner is
// further off still, so readCamera() waits for the pose to hold still.
const SETTLE_MS = 1200;
const STILL_DEG = 0.02;
const STILL_TIMEOUT_MS = 15_000;

// A stale up rolls the frame by 0.16 rad and more. Anything above five
// thousandths here is a real frame tilt, not float noise.
const ROLL_TOLERANCE = 5e-3;

const ALL_VIEWS = ['top', 'bottom', 'front', 'back', 'left', 'right'];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
  });
});

async function openWithStl(page) {
  await page.goto('/');
  await page.waitForSelector('body[data-wasm-ready="true"]', {
    state: 'attached',
    timeout: WASM_READY_TIMEOUT,
  });
  await skipWithoutWebGL(
    page,
    'no WebGL context: this browser creates no camera to orbit'
  );
  await page.locator('#fileInput').setInputFiles(STL_FIXTURE);
  await expect(page.locator('#welcomeScreen')).toBeHidden({ timeout: 30_000 });
  const notNow = page.locator('#saveProjectNotNow');
  try {
    await notNow.waitFor({ state: 'visible', timeout: 3_000 });
    await notNow.click();
  } catch {
    // No save-project prompt in this configuration; nothing to dismiss.
  }
  await expect(page.locator('.preview-panel canvas').first()).toBeVisible({
    timeout: 30_000,
  });
}

async function enterClassic(page) {
  const toggle = page.locator('#uiModeToggle');
  await expect(toggle).toBeVisible({ timeout: 10_000 });
  if ((await toggle.getAttribute('aria-checked')) !== 'true') {
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
  }
  await page.locator('#classicModeToggle').click();
  await expect(page.locator('body')).toHaveAttribute('data-ui-mode', 'classic');
  await page.waitForTimeout(600);
}

/**
 * The live camera as this spec judges it: how rolled the frame is, and where
 * the camera sits on its turntable.
 */
async function readPose(page) {
  const cam = await page.evaluate(
    () => window.__forgeDebug?.cameraPose?.() ?? null
  );
  if (!cam?.right || !cam?.up) return null;
  const t = cam.target || [0, 0, 0];
  const p = cam.position;
  const off = [p[0] - t[0], p[1] - t[1], p[2] - t[2]];
  const len = Math.hypot(...off) || 1;
  return {
    roll: Math.abs(cam.right[2]),
    screenUp: cam.up,
    elevationDeg: Math.asin(off[2] / len) / D2R,
    azimuthDeg: Math.atan2(off[0], -off[1]) / D2R,
  };
}

/**
 * The pose once the camera has stopped easing: two reads 100 ms apart that
 * agree. Every check then compares resting poses, however slow the machine.
 */
async function readCamera(page) {
  let last = await readPose(page);
  if (!last) return null;
  const deadline = Date.now() + STILL_TIMEOUT_MS;
  for (;;) {
    await page.waitForTimeout(100);
    const now = await readPose(page);
    if (!now) return null;
    if (
      Math.abs(now.elevationDeg - last.elevationDeg) < STILL_DEG &&
      Math.abs(now.azimuthDeg - last.azimuthDeg) < STILL_DEG
    ) {
      return now;
    }
    if (Date.now() > deadline) {
      throw new Error(
        `the camera was still moving after ${STILL_TIMEOUT_MS} ms ` +
          `(elevation ${now.elevationDeg}, azimuth ${now.azimuthDeg})`
      );
    }
    last = now;
  }
}

/**
 * Drag on the canvas. OrbitControls maps dy px to 2*PI*dy/clientHeight radians,
 * so these are small deliberate steps: a 40px pull is roughly 45 degrees of
 * tilt on this canvas, and 25px sideways is roughly 28 degrees of azimuth.
 * Dragging UP is what leaves the Top pose — dragging down only pushes the polar
 * angle against OrbitControls' own clamp.
 */
async function dragCanvas(page, dx, dy) {
  const box = await page.locator('.preview-panel canvas').first().boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(cx + (dx * i) / 12, cy + (dy * i) / 12);
  }
  await page.mouse.up();
  await page.waitForTimeout(SETTLE_MS);
}

async function pressClassicView(page, view) {
  await page.locator(`[data-classic-view="${view}"]`).click();
  await page.waitForTimeout(SETTLE_MS);
}

// #cameraPanel ships collapsed in Forge, so its view buttons are hidden until
// the header toggle is pressed.
async function pressForgeView(page, view) {
  const collapsed = await page.evaluate(
    () =>
      document.getElementById('cameraPanel')?.classList.contains('collapsed') ??
      null
  );
  if (collapsed) {
    await page.locator('#cameraPanelToggle').click();
    await page.waitForTimeout(400);
  }
  await page
    .locator(`#cameraPanel .camera-view-btn[data-view="${view}"]`)
    .first()
    .click();
  await page.waitForTimeout(SETTLE_MS);
}

/**
 * The claim, once, so both interfaces make exactly the same one: tilt off the
 * face pose, then walk sideways three times. Every sample must be roll-free,
 * and the elevation must hold — that is what "spins around global z" means.
 */
async function assertTurntableAfter(page, label) {
  await dragCanvas(page, 0, -40);
  const tilted = await readCamera(page);
  expect(tilted, `${label}: no camera pose published`).not.toBeNull();
  expect(
    tilted.roll,
    `${label}: tilting off the face view already rolled the frame`
  ).toBeLessThan(ROLL_TOLERANCE);

  const azimuths = [tilted.azimuthDeg];
  for (const step of [1, 2, 3]) {
    await dragCanvas(page, 25, 0);
    const now = await readCamera(page);
    expect(
      now.roll,
      `${label}: horizontal drag ${step} rolled the frame by ${now.roll}`
    ).toBeLessThan(ROLL_TOLERANCE);
    // Screen-up must still point along world +Z, not lie flat in XY — that is
    // the difference a user sees between orbiting and tumbling.
    expect(
      Math.abs(now.screenUp[2]),
      `${label}: screen-up left the vertical after drag ${step}`
    ).toBeGreaterThan(0.3);
    expect(
      Math.abs(now.elevationDeg - tilted.elevationDeg),
      `${label}: horizontal drag ${step} changed the elevation`
    ).toBeLessThan(2);
    azimuths.push(now.azimuthDeg);
  }

  // Sensitivity: if the drags moved nothing, everything above passes vacuously.
  const swept = Math.abs(azimuths[3] - azimuths[0]);
  expect(swept, `${label}: the drags never moved the camera`).toBeGreaterThan(30);
}

test.describe('A camera you can steer after a face view', () => {
  test('Classic: Top then drag orbits around global Z without rolling', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await openWithStl(page);
    await enterClassic(page);

    await pressClassicView(page, 'top');
    const atTop = await readCamera(page);
    expect(atTop, 'no camera pose published at the Top view').not.toBeNull();
    // The Top view still looks like Top: straight down, +Y up the screen.
    expect(atTop.elevationDeg).toBeGreaterThan(89.5);
    expect(atTop.screenUp[1]).toBeGreaterThan(0.999);

    await assertTurntableAfter(page, 'Classic Top');
  });

  test('Classic: Bottom then drag orbits around global Z without rolling', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await openWithStl(page);
    await enterClassic(page);

    await pressClassicView(page, 'bottom');
    const atBottom = await readCamera(page);
    expect(atBottom, 'no camera pose published at the Bottom view').not.toBeNull();
    // Bottom still looks like Bottom: straight up, +Y DOWN the screen.
    expect(atBottom.elevationDeg).toBeLessThan(-89.5);
    expect(atBottom.screenUp[1]).toBeLessThan(-0.999);

    // Bottom's usable tilt is downward: at the -Z pole an upward pull only
    // pushes the polar angle against OrbitControls' clamp.
    await dragCanvas(page, 0, 40);
    const tilted = await readCamera(page);
    expect(tilted.roll, 'tilting off Bottom rolled the frame').toBeLessThan(
      ROLL_TOLERANCE
    );
    for (const step of [1, 2, 3]) {
      await dragCanvas(page, 25, 0);
      const now = await readCamera(page);
      expect(
        now.roll,
        `Classic Bottom: horizontal drag ${step} rolled the frame by ${now.roll}`
      ).toBeLessThan(ROLL_TOLERANCE);
      expect(
        Math.abs(now.elevationDeg - tilted.elevationDeg),
        `Classic Bottom: horizontal drag ${step} changed the elevation`
      ).toBeLessThan(2);
    }
  });

  test('Forge: Top then drag orbits around global Z without rolling', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await openWithStl(page);

    await pressForgeView(page, 'top');
    const atTop = await readCamera(page);
    expect(atTop, 'no camera pose published at the Top view').not.toBeNull();
    expect(atTop.elevationDeg).toBeGreaterThan(89.5);

    await assertTurntableAfter(page, 'Forge Top');
  });

  test('every face view leaves the frame upright, and drags keep it there', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await openWithStl(page);
    await enterClassic(page);

    for (const view of ALL_VIEWS) {
      await pressClassicView(page, view);
      const atPose = await readCamera(page);
      expect(atPose, `no pose published at the ${view} view`).not.toBeNull();
      expect(atPose.roll, `${view} view is already rolled`).toBeLessThan(
        ROLL_TOLERANCE
      );

      // Tilt first. At an exact pole a sideways drag cannot expose a stale up
      // — the orientation is the same at every azimuth — so a sweep that only
      // dragged sideways would pass on the broken build too. Bottom's usable
      // tilt is the other way; every other view can be pulled upward.
      await dragCanvas(page, 0, view === 'bottom' ? 40 : -40);
      const tilted = await readCamera(page);
      expect(
        tilted.roll,
        `tilting off the ${view} view rolled the frame by ${tilted.roll}`
      ).toBeLessThan(ROLL_TOLERANCE);

      await dragCanvas(page, 25, 0);
      const dragged = await readCamera(page);
      expect(
        dragged.roll,
        `a sideways drag after the ${view} view rolled the frame by ${dragged.roll}`
      ).toBeLessThan(ROLL_TOLERANCE);
    }
  });

  test('the default pose still orbits — the guard is not passing vacuously', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await openWithStl(page);
    await enterClassic(page);

    const start = await readCamera(page);
    expect(start, 'no camera pose published at startup').not.toBeNull();
    expect(start.roll, 'the startup pose is rolled').toBeLessThan(
      ROLL_TOLERANCE
    );

    await dragCanvas(page, 25, 0);
    const dragged = await readCamera(page);
    expect(
      Math.abs(dragged.azimuthDeg - start.azimuthDeg),
      'a sideways drag from the default pose did not orbit at all'
    ).toBeGreaterThan(10);
    expect(
      Math.abs(dragged.elevationDeg - start.elevationDeg),
      'a sideways drag from the default pose changed the elevation'
    ).toBeLessThan(2);
    expect(dragged.roll, 'a drag from the default pose rolled the frame').toBeLessThan(
      ROLL_TOLERANCE
    );
  });
});

test.describe('The pole is a door, not a wall', () => {
  test('Forge: from Top, the downward drag crosses over', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await openWithStl(page);

    await pressForgeView(page, 'top');
    const atTop = await readCamera(page);
    expect(atTop, 'no camera pose published at Top').not.toBeNull();
    expect(atTop.elevationDeg).toBeGreaterThan(89.5);

    // From Top, dragging down must not press a dead clamp: the desktop rolls
    // straight over.
    await dragCanvas(page, 0, 40);
    const crossed = await readCamera(page);
    expect(
      crossed.elevationDeg,
      'the downward drag still presses a dead clamp instead of crossing'
    ).toBeLessThan(85);
    expect(crossed.elevationDeg).toBeGreaterThan(45);
    // Out the other side: azimuth flipped half a turn (mod 360).
    let dAz = Math.abs(crossed.azimuthDeg - atTop.azimuthDeg) % 360;
    if (dAz > 180) dAz = 360 - dAz;
    expect(dAz, 'the crossing did not come out the far side').toBeGreaterThan(150);
    // And the frame is still a turntable: no roll.
    expect(crossed.roll).toBeLessThan(ROLL_TOLERANCE);
  });

  test('Forge: from Bottom, the upward drag crosses over', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await openWithStl(page);

    await pressForgeView(page, 'bottom');
    const atBottom = await readCamera(page);
    expect(atBottom, 'no camera pose published at Bottom').not.toBeNull();
    expect(atBottom.elevationDeg).toBeLessThan(-89.5);

    await dragCanvas(page, 0, -40);
    const crossed = await readCamera(page);
    expect(
      crossed.elevationDeg,
      'the upward drag still presses a dead clamp instead of crossing'
    ).toBeGreaterThan(-85);
    expect(crossed.elevationDeg).toBeLessThan(-45);
    let dAz = Math.abs(crossed.azimuthDeg - atBottom.azimuthDeg) % 360;
    if (dAz > 180) dAz = 360 - dAz;
    expect(dAz, 'the crossing did not come out the far side').toBeGreaterThan(150);
    expect(crossed.roll).toBeLessThan(ROLL_TOLERANCE);
  });
});

