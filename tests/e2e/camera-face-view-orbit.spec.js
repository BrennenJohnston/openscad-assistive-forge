import { test, expect } from '@playwright/test';
import path from 'path';
import { skipWithoutWebGL } from './helpers/webgl.js';

// UF-26 / D-48 (U-36): "select a camera face angle, then try to adjust the view
// with a mouse ... instead of rotating around the z axes, it appears to rotate
// the camera at random, not tied to a specific axis to rotate around, making it
// un-navigable."
//
// The mechanism. Every face view funnelled into PreviewManager.setCameraView,
// and the CAMERA_VIEWS table gave Top up:[0,1,0] and Bottom up:[0,-1,0] while
// the other five kept world Z. OrbitControls reads camera.up ONCE, when it is
// constructed (the quat inside its update() IIFE), so a later up never reaches
// the orbit maths — but the lookAt(target) that ends every frame's update does
// read it. A left-behind up therefore could not re-aim the turntable; it only
// rolled the picture, and the roll GREW with every drag.
//
// The instrument, and why it needs no new debug hook. The Viewport-Control
// panel publishes the live camera pose on `viewport-camera-change` in BOTH
// interfaces (it is connected at project open, not at Classic entry), and its
// `rotation` is three's camera.rotation euler in XYZ order. Rebuilding the
// rotation matrix from that euler gives the camera's world basis, and three's
// lookAt() builds screen-right as normalize(up x forward) — so screen-right is
// ALWAYS perpendicular to camera.up. In a Z-up app that makes
//
//     |screenRight.z| == 0   <=>   the picture is not rolled
//
// and it is non-zero exactly when a stale up is steering the frame. MEASURED on
// the release base, dragging sideways in 25px steps after Top: 0.426, 0.644,
// 0.711. After the fix: 0 at every step, in both interfaces.

const STL_FIXTURE = path.join(
  process.cwd(),
  'tests',
  'fixtures',
  'parity',
  'cube10.stl'
);

const WASM_READY_TIMEOUT = 180_000;
const D2R = Math.PI / 180;

// Damping is on (dampingFactor 0.05), so the camera keeps easing after mouseup.
// A second is ~3 time constants; the residue is under a tenth of a degree.
const SETTLE_MS = 1200;

// The roll the release base produced was 0.16 rad and up. Anything above a
// thousandth here is a real frame tilt, not float noise.
const ROLL_TOLERANCE = 5e-3;

const ALL_VIEWS = ['top', 'bottom', 'front', 'back', 'left', 'right'];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('openscad-forge-first-visit-seen', 'true');
    localStorage.setItem('openscad-forge-tour-nudge-suppressed', 'true');
    // Read-only tap on a feed the app already publishes. Declared here rather
    // than added to the app: nothing in src/ changes to make this spec possible.
    window.__uf26Poses = [];
    document.addEventListener('viewport-camera-change', (ev) => {
      window.__uf26Poses.push(ev.detail.pose);
    });
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

/** three's Matrix4.makeRotationFromEuler, order XYZ — columns 1 and 2. */
function screenBasis({ x, y, z }) {
  const a = Math.cos(x * D2R);
  const b = Math.sin(x * D2R);
  const c = Math.cos(y * D2R);
  const d = Math.sin(y * D2R);
  const e = Math.cos(z * D2R);
  const f = Math.sin(z * D2R);
  return {
    right: [c * e, a * f + b * e * d, b * f - a * e * d],
    up: [-c * f, a * e - b * f * d, b * e + a * f * d],
  };
}

/**
 * The live camera as this spec judges it: how rolled the frame is, and where
 * the camera sits on its turntable.
 */
async function readCamera(page) {
  const raw = await page.evaluate(() => ({
    pose: window.__uf26Poses?.length
      ? window.__uf26Poses[window.__uf26Poses.length - 1]
      : null,
    cam: window.__forgeDebug?.cameraPose?.() ?? null,
  }));
  if (!raw.pose || !raw.cam) return null;
  const basis = screenBasis(raw.pose.rotation);
  const t = raw.cam.target || [0, 0, 0];
  const p = raw.cam.position;
  const off = [p[0] - t[0], p[1] - t[1], p[2] - t[2]];
  const len = Math.hypot(...off) || 1;
  return {
    roll: Math.abs(basis.right[2]),
    screenUp: basis.up,
    elevationDeg: Math.asin(off[2] / len) / D2R,
    azimuthDeg: Math.atan2(off[0], -off[1]) / D2R,
  };
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

test.describe('UF-26 — a camera you can steer after a face view (D-48)', () => {
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

test.describe('AF-11 - the pole is a door, not a wall', () => {
  test('Forge: from Top, the previously dead downward drag crosses over', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await openWithStl(page);

    await pressForgeView(page, 'top');
    const atTop = await readCamera(page);
    expect(atTop, 'no camera pose published at Top').not.toBeNull();
    expect(atTop.elevationDeg).toBeGreaterThan(89.5);

    // UF-26 recorded this exact gesture as pressing a dead clamp: from Top,
    // dragging DOWN did nothing while the desktop rolls straight over.
    await dragCanvas(page, 0, 40);
    const crossed = await readCamera(page);
    expect(
      crossed.elevationDeg,
      'the downward drag still presses a dead clamp instead of crossing'
    ).toBeLessThan(85);
    expect(crossed.elevationDeg).toBeGreaterThan(45);
    // Out the OTHER side: azimuth flipped half a turn (mod 360).
    let dAz = Math.abs(crossed.azimuthDeg - atTop.azimuthDeg) % 360;
    if (dAz > 180) dAz = 360 - dAz;
    expect(dAz, 'the crossing did not come out the far side').toBeGreaterThan(150);
    // And the frame is still a turntable: no roll (D-48 untouched).
    expect(crossed.roll).toBeLessThan(ROLL_TOLERANCE);
  });

  test('Forge: from Bottom, the previously dead upward drag crosses over', async ({
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

