/**
 * Viewport-Control speaks OpenSCAD's $vpr: [tilt, 0, turn].
 *
 * The camera's up is locked to +Z, so it never rolls and has two free
 * angles. The desktop names them as $vpr does: tilt away from looking
 * straight down, and turn about the vertical axis from the front.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';

vi.mock('../../src/js/announcer.js', () => ({ announceImmediate: vi.fn() }));

import {
  ViewportControlPanel,
  vprFromOffset,
  offsetFromVpr,
} from '../../src/js/viewport-control-panel.js';
import { EditActionsController } from '../../src/js/edit-actions-controller.js';

const FIELDS = ['vpTx', 'vpTy', 'vpTz', 'vpRx', 'vpRy', 'vpRz', 'vpDistance', 'vpFov'];

/** A camera and orbit controls as the preview has them: up is +Z. */
function previewManagerAt(vpr, distance = 100) {
  const camera = new PerspectiveCamera(45, 1, 0.1, 10000);
  camera.up.set(0, 0, 1);
  const target = new Vector3(0, 0, 0);
  const controls = {
    target,
    // OrbitControls ends every update by aiming the camera at the target.
    update: () => camera.lookAt(target),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  // Placed by its own arithmetic, not the code under test: tilt from +Z,
  // turn from the front (-Y) toward +X.
  const tilt = (vpr[0] * Math.PI) / 180;
  const turn = (vpr[2] * Math.PI) / 180;
  camera.position.set(
    distance * Math.sin(tilt) * Math.sin(turn),
    -distance * Math.sin(tilt) * Math.cos(turn),
    distance * Math.cos(tilt)
  );
  controls.update();
  return { controls, getActiveCamera: () => camera, camera };
}

function mountPanel(pm) {
  document.body.innerHTML = `<div id="viewportControlPanel">${FIELDS.map(
    (id) => `<input type="number" id="${id}" />`
  ).join('')}<input id="vpWidth" readonly /><input id="vpHeight" readonly /></div>`;
  const panel = new ViewportControlPanel({ getPreviewManager: () => pm });
  panel.connectPreviewManager(pm);
  return panel;
}

const close = (a, b) => Math.abs(a - b) < 1e-6;

describe('$vpr from where the camera sits', () => {
  it('reads the desktop default view as [55, 0, 25]', () => {
    // fitCameraToModel's diagonal: 25 degrees round from the front, 35 up.
    const az = (25 * Math.PI) / 180;
    const el = (35 * Math.PI) / 180;
    const rot = vprFromOffset({
      x: Math.cos(el) * Math.sin(az),
      y: -Math.cos(el) * Math.cos(az),
      z: Math.sin(el),
    });
    expect(close(rot.x, 55)).toBe(true);
    expect(rot.y).toBe(0);
    expect(close(rot.z, 25)).toBe(true);
  });

  it('round-trips through the position it describes', () => {
    const offset = offsetFromVpr(70, -130, 40);
    const back = vprFromOffset(offset);
    expect(close(back.x, 70)).toBe(true);
    expect(close(back.z, -130)).toBe(true);
    expect(close(Math.hypot(offset.x, offset.y, offset.z), 40)).toBe(true);
  });
});

describe('the Viewport-Control panel', () => {
  let pm;
  let panel;
  beforeEach(() => {
    pm = previewManagerAt([55, 0, 25]);
    panel = mountPanel(pm);
  });

  it('shows the rotation as the desktop does', () => {
    const { rotation } = panel.readCamera();
    expect(close(rotation.x, 55)).toBe(true);
    expect(close(rotation.y, 0)).toBe(true);
    expect(close(rotation.z, 25)).toBe(true);
  });

  it('turns the view to a typed Rotation Z, keeping the tilt', () => {
    const rz = document.getElementById('vpRz');
    rz.value = '120';
    rz.dispatchEvent(new Event('change'));

    const { rotation, distance } = panel.readCamera();
    expect(close(rotation.z, 120)).toBe(true);
    expect(close(rotation.x, 55)).toBe(true);
    expect(close(distance, 100)).toBe(true);
  });

  it('tilts the view to a typed Rotation X, keeping the turn', () => {
    const rx = document.getElementById('vpRx');
    rx.value = '80';
    rx.dispatchEvent(new Event('change'));

    const { rotation } = panel.readCamera();
    expect(close(rotation.x, 80)).toBe(true);
    expect(close(rotation.z, 25)).toBe(true);
  });

  it('offers Rotation Y read-only: this camera never rolls', () => {
    expect(document.getElementById('vpRy').readOnly).toBe(true);
  });
});

describe('Edit > Copy viewport rotation', () => {
  it('copies the $vpr a model can paste', async () => {
    const pm = previewManagerAt([55, 0, 25]);
    const controller = new EditActionsController({ getPreviewManager: () => pm });
    const copied = vi.spyOn(controller, '_copyText').mockResolvedValue();

    await controller.copyRotation();

    expect(copied).toHaveBeenCalledWith('[55.00, 0, 25.00]', 'Rotation copied');
  });
});
