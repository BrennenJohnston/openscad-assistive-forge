/**
 * Axis lines overlay (P12) — both halves of each axis, negatives dashed.
 *
 * The mock deliberately mirrors what getThreeModule() actually hands out.
 * The axis-TICK overlay's suite injects a richer fake than the app provides,
 * which is how 20 green tests sat on top of an overlay that threw on every
 * real attempt; a mock that is more generous than production is a mock that
 * proves nothing.
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

  it('runs each arm from the origin to its own axis end', () => {
    const { group } = buildAxisLinesOverlay(makeThree(), { rangeMm: 200 });
    const by = (name) => group.children.find((l) => l.name === name);

    for (const line of group.children) {
      expect(Array.from(positions(line)).slice(0, 3)).toEqual([0, 0, 0]);
    }
    expect(Array.from(endpoint(by('__displayAxis-xpos')))).toEqual([200, 0, 0]);
    expect(Array.from(endpoint(by('__displayAxis-xneg')))).toEqual([-200, 0, 0]);
    expect(Array.from(endpoint(by('__displayAxis-ypos')))).toEqual([0, 200, 0]);
    expect(Array.from(endpoint(by('__displayAxis-yneg')))).toEqual([0, -200, 0]);
    expect(Array.from(endpoint(by('__displayAxis-zpos')))).toEqual([0, 0, 200]);
    expect(Array.from(endpoint(by('__displayAxis-zneg')))).toEqual([0, 0, -200]);
  });

  it('reaches as far as the tick overlay does', () => {
    // Ticks are drawn to ±200mm. An axis shorter than its own tick marks
    // leaves the outermost ones floating in space, which is what AxesHelper(50)
    // did to every tick beyond 50mm.
    expect(__test.DEFAULT_AXIS_RANGE_MM).toBe(200);
  });

  it('gives both halves of an axis the same colour', () => {
    const { group } = buildAxisLinesOverlay(makeThree());
    for (const axis of ['x', 'y', 'z']) {
      const pos = group.children.find((l) => l.name === `__displayAxis-${axis}pos`);
      const neg = group.children.find((l) => l.name === `__displayAxis-${axis}neg`);
      expect(pos.material.color).toBe(neg.material.color);
      expect(pos.material.color).toBe(__test.AXIS_COLORS[axis]);
    }
  });

  it('falls back to the default range for a nonsense value', () => {
    for (const bad of [0, -5, NaN, Infinity, 'big', null]) {
      const { group } = buildAxisLinesOverlay(makeThree(), { rangeMm: bad });
      const x = group.children.find((l) => l.name === '__displayAxis-xpos');
      expect(Array.from(endpoint(x))).toEqual([
        __test.DEFAULT_AXIS_RANGE_MM,
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
