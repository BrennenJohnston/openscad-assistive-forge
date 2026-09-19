/**
 * Axis lines overlay (P12) — both halves of each axis, negatives dashed;
 * zoom-length arms since UF-7.
 *
 * The mock deliberately mirrors what getThreeModule() actually hands out —
 * never more. A mock more generous than production is a mock that proves
 * nothing (the R-IV lesson; the tick overlay's pre-UF-7 suite showed it).
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';
import {
  buildAxisLinesOverlay,
  __test,
} from '../../src/js/axis-lines-overlay.js';

function makeThree() {
  class MockGroup {
    constructor() {
      this.children = [];
      this.name = '';
    }
    add(child) {
      this.children.push(child);
    }
  }
  class MockBufferGeometry {
    constructor() {
      this.attributes = {};
      this.disposed = false;
    }
    setAttribute(name, attr) {
      this.attributes[name] = attr;
    }
    dispose() {
      this.disposed = true;
    }
  }
  class MockFloat32BufferAttribute {
    constructor(array, itemSize) {
      this.array = array;
      this.itemSize = itemSize;
    }
  }
  class MockLineBasicMaterial {
    constructor(opts = {}) {
      Object.assign(this, opts);
      this.dashed = false;
      this.disposed = false;
    }
    dispose() {
      this.disposed = true;
    }
  }
  class MockLineDashedMaterial extends MockLineBasicMaterial {
    constructor(opts = {}) {
      super(opts);
      this.dashed = true;
    }
  }
  class MockLine {
    constructor(geometry, material) {
      this.geometry = geometry;
      this.material = material;
      this.name = '';
      this.lineDistancesComputed = false;
    }
    computeLineDistances() {
      this.lineDistancesComputed = true;
    }
  }

  return {
    Group: MockGroup,
    BufferGeometry: MockBufferGeometry,
    Float32BufferAttribute: MockFloat32BufferAttribute,
    LineBasicMaterial: MockLineBasicMaterial,
    LineDashedMaterial: MockLineDashedMaterial,
    Line: MockLine,
  };
}

const positions = (line) => line.geometry.attributes.position.array;
const endpoint = (line) => positions(line).slice(3);

describe('buildAxisLinesOverlay', () => {
  it('refuses to build without a Three.js module', () => {
    expect(() => buildAxisLinesOverlay(null)).toThrow(/requires a Three\.js/);
  });

  it('draws six arms: a positive and a negative for each axis', () => {
    const { group } = buildAxisLinesOverlay(makeThree());
    expect(group.name).toBe('__displayAxes');
    expect(group.children).toHaveLength(6);
    expect(group.children.map((l) => l.name).sort()).toEqual(
      [
        '__displayAxis-xpos',
        '__displayAxis-xneg',
        '__displayAxis-ypos',
        '__displayAxis-yneg',
        '__displayAxis-zpos',
        '__displayAxis-zneg',
      ].sort()
    );
  });

  it('dashes the negative halves and only those', () => {
    const { group } = buildAxisLinesOverlay(makeThree());
    const dashed = group.children.filter((l) => l.material.dashed);
    const solid = group.children.filter((l) => !l.material.dashed);
    expect(dashed.map((l) => l.name).sort()).toEqual([
      '__displayAxis-xneg',
      '__displayAxis-yneg',
      '__displayAxis-zneg',
    ]);
    expect(solid).toHaveLength(3);
  });

  it('computes line distances on every dashed arm', () => {
    // Without this a LineDashedMaterial renders solid, and the negative half
    // becomes indistinguishable from the positive one — the whole point.
    const { group } = buildAxisLinesOverlay(makeThree());
    for (const line of group.children) {
      expect(line.lineDistancesComputed).toBe(line.material.dashed);
    }
  });

  it('runs each arm from the origin to the camera distance (zoom-length)', () => {
    const { group, distanceMm } = buildAxisLinesOverlay(makeThree(), {
      distanceMm: 263.43,
    });
    expect(distanceMm).toBe(263.43);
    const by = (name) => group.children.find((l) => l.name === name);

    for (const line of group.children) {
      expect(Array.from(positions(line)).slice(0, 3)).toEqual([0, 0, 0]);
    }
    const d = 263.43;
    expect(Array.from(endpoint(by('__displayAxis-xpos')))).toEqual([d, 0, 0]);
    expect(Array.from(endpoint(by('__displayAxis-xneg')))).toEqual([-d, 0, 0]);
    expect(Array.from(endpoint(by('__displayAxis-ypos')))).toEqual([0, d, 0]);
    expect(Array.from(endpoint(by('__displayAxis-yneg')))).toEqual([0, -d, 0]);
    expect(Array.from(endpoint(by('__displayAxis-zpos')))).toEqual([0, 0, d]);
    expect(Array.from(endpoint(by('__displayAxis-zneg')))).toEqual([0, 0, -d]);
  });

  it('shares the tick overlay scale so lines and marks never disagree', () => {
    // Desktop showAxes() and showScalemarkers() both read cam.zoomValue().
    // Ours share one default and one dash divisor from axis-tick-overlay.
    expect(__test.DEFAULT_DISTANCE_MM).toBe(234);
    expect(__test.DASH_DIVISOR).toBe(90);
  });

  it('scales the dash with the zoom (desktop stipples in screen pixels)', () => {
    const { group } = buildAxisLinesOverlay(makeThree(), { distanceMm: 900 });
    const dashed = group.children.filter((l) => l.material.dashed);
    for (const line of dashed) {
      expect(line.material.dashSize).toBeCloseTo(10, 10);
      expect(line.material.gapSize).toBeCloseTo(10, 10);
    }
  });

  it('draws every arm in the one theme-resolved colour (Q-22)', () => {
    // Upstream's axes are black; ours resolve --color-text-primary like the
    // tick overlay, so lines and ticks always match. In jsdom the token is
    // absent and the theme fallbacks apply: near-black light, light dark.
    const light = buildAxisLinesOverlay(makeThree());
    for (const line of light.group.children) {
      expect(line.material.color).toBe(0x222222);
    }

    const dark = buildAxisLinesOverlay(makeThree(), { themeKey: 'dark' });
    for (const line of dark.group.children) {
      expect(line.material.color).toBe(0xdddddd);
    }
  });

  it('falls back to the default distance for a nonsense value', () => {
    for (const bad of [0, -5, NaN, Infinity, 'big', null]) {
      const { group } = buildAxisLinesOverlay(makeThree(), {
        distanceMm: bad,
      });
      const x = group.children.find((l) => l.name === '__displayAxis-xpos');
      expect(Array.from(endpoint(x))).toEqual([
        __test.DEFAULT_DISTANCE_MM,
        0,
        0,
      ]);
    }
  });

  it('disposes every geometry and material it made', () => {
    const three = makeThree();
    const overlay = buildAxisLinesOverlay(three);
    const parts = overlay.group.children;
    overlay.dispose();
    for (const line of parts) {
      expect(line.geometry.disposed).toBe(true);
      expect(line.material.disposed).toBe(true);
    }
  });
});
