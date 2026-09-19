/**
 * Corner XYZ triad (UF-7 P3) — the showSmallaxes() transcription.
 *
 * These tests run against the REAL three module: the triad builder imports
 * three directly (it is consumed only by preview.js, which already does),
 * so there is no injected subset whose under-export a generous mock could
 * hide — the R-IV trap cannot exist here, and mocking would only weaken
 * the proof. Everything asserted is pure scene-graph work; no WebGL.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';
import { PerspectiveCamera, Quaternion } from 'three';
import {
  buildAxisTriadOverlay,
  __test,
} from '../../src/js/axis-triad-overlay.js';

const byName = (root, name) => root.getObjectByName(name);

describe('axis-triad-overlay (UF-7)', () => {
  it('builds three unit arms in the desktop RGB colors', () => {
    const triad = buildAxisTriadOverlay();
    const arms = byName(triad.scene, '__axisTriadArms');
    expect(arms.children).toHaveLength(3);

    for (const [axis, colorHex] of Object.entries(__test.ARM_COLORS)) {
      const arm = byName(arms, `__axisTriadArm-${axis}`);
      expect(arm.material.color.getHex()).toBe(colorHex);
      const pos = arm.geometry.getAttribute('position');
      expect(Array.from(pos.array.slice(0, 3))).toEqual([0, 0, 0]);
      const tip = Array.from(pos.array.slice(3, 6));
      expect(Math.max(...tip)).toBe(1);
      expect(tip.filter((v) => v === 0)).toHaveLength(2);
    }
    triad.dispose();
  });

  it('anchors a letter beyond each arm tip, all in the injected axes color', () => {
    const triad = buildAxisTriadOverlay({ letterColorHex: 0xe5e5e5 });
    expect(triad.letterColorHex).toBe(0xe5e5e5);

    const segmentCounts = { x: 2, y: 2, z: 3 };
    for (const axis of ['x', 'y', 'z']) {
      const holder = byName(triad.scene, `__axisTriadLetterHolder-${axis}`);
      const anchor = __test.LETTER_ANCHOR;
      const expected = {
        x: [anchor, 0, 0],
        y: [0, anchor, 0],
        z: [0, 0, anchor],
      }[axis];
      expect(holder.position.toArray()).toEqual(expected);

      const letter = byName(holder, `__axisTriadLetter-${axis}`);
      // The letters wear the scheme's axes color, not their arm's color —
      // GLView.cc colors the smallaxes letters with axescolor.
      expect(letter.material.color.getHex()).toBe(0xe5e5e5);
      const pos = letter.geometry.getAttribute('position');
      expect(pos.count).toBe(segmentCounts[axis] * 2);
    }
    triad.dispose();
  });

  it('syncTo copies only the rotation onto the camera and the letter billboards', () => {
    const triad = buildAxisTriadOverlay();
    const main = new PerspectiveCamera();
    main.position.set(100, -50, 80);
    main.quaternion.setFromAxisAngle({ x: 0, y: 0, z: 1 }, Math.PI / 5);

    triad.syncTo(main);

    expect(triad.camera.quaternion.equals(main.quaternion)).toBe(true);
    // Pan/zoom independence: the triad camera never takes the position.
    expect(triad.camera.position.toArray()).toEqual([0, 0, 0]);
    for (const axis of ['x', 'y', 'z']) {
      const holder = byName(triad.scene, `__axisTriadLetterHolder-${axis}`);
      expect(holder.quaternion.equals(main.quaternion)).toBe(true);
    }
    triad.dispose();
  });

  it('syncTo tolerates a missing camera', () => {
    const triad = buildAxisTriadOverlay();
    const before = new Quaternion().copy(triad.camera.quaternion);
    triad.syncTo(null);
    expect(triad.camera.quaternion.equals(before)).toBe(true);
    triad.dispose();
  });

  it('lays out the desktop corner box: 10% anchor, arm = height/18', () => {
    const triad = buildAxisTriadOverlay();
    const box = triad.layout(1280, 720);
    // Arm 40px on screen → box side 120px centered on (128, 72 from bottom).
    expect(box.size).toBeCloseTo(120, 10);
    expect(box.x).toBeCloseTo(0.1 * 1280 - 60, 10);
    expect(box.y).toBeCloseTo(0.1 * 720 - 60, 10);

    // Letters keep the desktop's fixed 3px half-extent: scale maps
    // LETTER_HALF_PX through the frustum regardless of box size.
    const holder = byName(triad.scene, '__axisTriadLetterHolder-x');
    const expectedScale =
      (__test.LETTER_HALF_PX / box.size) * (2 * __test.FRUSTUM_HALF);
    expect(holder.scale.x).toBeCloseTo(expectedScale, 10);
    triad.dispose();
  });

  it('layout refuses a dead viewport', () => {
    const triad = buildAxisTriadOverlay();
    expect(triad.layout(0, 720)).toBeNull();
    expect(triad.layout(1280, NaN)).toBeNull();
    triad.dispose();
  });

  it('dispose releases every geometry and material once', () => {
    const triad = buildAxisTriadOverlay();
    let disposed = 0;
    triad.scene.traverse((obj) => {
      obj.geometry?.addEventListener?.('dispose', () => disposed++);
      // Materials fire dispose too; the letters share one material, which
      // must be disposed exactly once, not once per letter.
      if (obj.material?.addEventListener) {
        obj.material.addEventListener('dispose', () => disposed++);
      }
    });
    triad.dispose();
    // 3 arm geometries + 3 arm materials + 3 letter geometries + 1 shared
    // letter material = 10 disposals. The shared material registered its
    // listener three times (once per letter), adding two extra fires.
    expect(disposed).toBe(12);
  });
});
