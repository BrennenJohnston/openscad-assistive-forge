/**
 * Unit tests for the F20 axis tick overlay.
 *
 * The module is wrapped around a small Three.js stub so we can
 * exercise tick / label generation, color resolution, and disposal
 * without spinning up WebGL.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildAxisTickOverlay,
  resolveAxisMarkColor,
  __test,
} from '../../src/js/axis-tick-overlay.js';

function makeMockThree() {
  class MockGroup {
    constructor() {
      this.children = [];
      this.name = '';
      this.userData = {};
      this.renderOrder = 0;
    }
    add(o) {
      this.children.push(o);
    }
    remove(o) {
      this.children = this.children.filter((c) => c !== o);
    }
  }
  class MockBufferGeometry {
    constructor() {
      this.attributes = {};
      this.dispose = vi.fn();
    }
    setAttribute(name, attr) {
      this.attributes[name] = attr;
    }
  }
  class MockFloat32BufferAttribute {
    constructor(array, itemSize) {
      this.array = Float32Array.from(array);
      this.itemSize = itemSize;
      this.count = this.array.length / itemSize;
    }
  }
  class MockLineBasicMaterial {
    constructor(opts = {}) {
      Object.assign(this, opts);
      this.dispose = vi.fn();
    }
  }
  class MockLineSegments {
    constructor(geometry, material) {
      this.geometry = geometry;
      this.material = material;
      this.name = '';
    }
  }
  class MockSpriteMaterial {
    constructor(opts = {}) {
      Object.assign(this, opts);
      this.dispose = vi.fn();
    }
  }
  class MockSprite {
    constructor(material) {
      this.material = material;
      this.position = {
        x: 0,
        y: 0,
        z: 0,
        set(x, y, z) {
          this.x = x;
          this.y = y;
          this.z = z;
        },
      };
      this.scale = {
        x: 1,
        y: 1,
        z: 1,
        set(x, y, z) {
          this.x = x;
          this.y = y;
          this.z = z;
        },
      };
      this.userData = {};
      this.geometry = { dispose: vi.fn() };
    }
  }
  class MockCanvasTexture {
    constructor(canvas) {
      this.image = canvas;
      this.needsUpdate = false;
      this.dispose = vi.fn();
    }
  }
  return {
    Group: MockGroup,
    BufferGeometry: MockBufferGeometry,
    Float32BufferAttribute: MockFloat32BufferAttribute,
    LineBasicMaterial: MockLineBasicMaterial,
    LineSegments: MockLineSegments,
    SpriteMaterial: MockSpriteMaterial,
    Sprite: MockSprite,
    CanvasTexture: MockCanvasTexture,
  };
}

describe('axis-tick-overlay (F20)', () => {
  let mockThree;

  beforeEach(() => {
    mockThree = makeMockThree();
  });

  describe('parseCssColorToHex', () => {
    it('parses #rrggbb', () => {
      expect(__test.parseCssColorToHex('#abcdef')).toBe(0xabcdef);
    });

    it('parses #rgb shorthand', () => {
      expect(__test.parseCssColorToHex('#abc')).toBe(0xaabbcc);
    });

    it('parses rgb()', () => {
      expect(__test.parseCssColorToHex('rgb(10, 20, 30)')).toBe(
        (10 << 16) | (20 << 8) | 30
      );
    });

    it('parses rgba()', () => {
      expect(__test.parseCssColorToHex('rgba(255, 128, 0, 0.5)')).toBe(
        (255 << 16) | (128 << 8) | 0
      );
    });

    it('parses the modern rgb() whitespace+slash form', () => {
      expect(__test.parseCssColorToHex('rgb(255 0 0 / 0.5)')).toBe(0xff0000);
    });

    it('returns null on garbage input', () => {
      expect(__test.parseCssColorToHex('hsl(0, 0%, 0%)')).toBeNull();
      expect(__test.parseCssColorToHex('')).toBeNull();
      expect(__test.parseCssColorToHex('not a color')).toBeNull();
    });
  });

  describe('resolveAxisMarkColor', () => {
    it('falls back to a dark hex for dark themes when no token is set', () => {
      // jsdom's getComputedStyle returns empty for custom properties
      const result = resolveAxisMarkColor('dark', document);
      expect(result.hex).toBe(0xdddddd);
      expect(result.css).toBe('#dddddd');
    });

    it('falls back to a light hex for light themes when no token is set', () => {
      const result = resolveAxisMarkColor('light', document);
      expect(result.hex).toBe(0x222222);
    });

    it('reads --color-text-primary when present', () => {
      document.documentElement.style.setProperty(
        '--color-text-primary',
        '#ff5733'
      );
      const result = resolveAxisMarkColor('light', document);
      expect(result.hex).toBe(0xff5733);
      document.documentElement.style.removeProperty('--color-text-primary');
    });

    it('handles a forced-colors / system color fallback gracefully', () => {
      // CanvasText / WindowText etc. can't be parsed; the helper must
      // still return a usable fallback rather than throwing.
      document.documentElement.style.setProperty(
        '--color-text-primary',
        'CanvasText'
      );
      const result = resolveAxisMarkColor('light-hc', document);
      expect(typeof result.hex).toBe('number');
      expect(result.css).toMatch(/^#[0-9a-f]{6}$/);
      document.documentElement.style.removeProperty('--color-text-primary');
    });
  });

  describe('collectTickPositions', () => {
    it('produces 6 floats per tick segment', () => {
      const flat = __test.collectTickPositions({
        rangeMm: 30,
        tickStepMm: 10,
        labelStepMm: 50,
      });
      // Three ticks per direction (10, 20, 30) × 2 signs × 3 axes = 18 segments.
      // 18 * 6 floats = 108 entries.
      expect(flat.length).toBe(18 * 6);
    });

    it('uses longer ticks at labelled positions', () => {
      const flat = __test.collectTickPositions({
        rangeMm: 50,
        tickStepMm: 10,
        labelStepMm: 50,
      });
      // The labelled tick at mm=50 should be longer than at mm=10.
      // Find any X-axis tick at +10 (small) and +50 (long).
      const findHalf = (axisIndex, mm) => {
        for (let i = 0; i < flat.length; i += 6) {
          const v = flat[i + axisIndex];
          if (v === mm) {
            // Y-extent for X-axis ticks is at index 1 / 4
            const a = flat[i + 1];
            const b = flat[i + 4];
            return Math.abs(b - a) / 2;
          }
        }
        return null;
      };
      const small = findHalf(0, 10);
      const labelled = findHalf(0, 50);
      expect(labelled).toBeGreaterThan(small);
    });
  });

  describe('buildAxisTickOverlay', () => {
    it('throws without a Three.js module', () => {
      expect(() => buildAxisTickOverlay(null)).toThrow(/Three\.js/);
    });

    it('builds a Group named __axisTickOverlay with line segments + sprite labels', () => {
      const result = buildAxisTickOverlay(mockThree, {
        themeKey: 'light',
        rangeMm: 100,
        tickStepMm: 10,
        labelStepMm: 50,
      });

      expect(result.group.name).toBe('__axisTickOverlay');
      expect(result.group.children.length).toBeGreaterThanOrEqual(1);

      const lineSegments = result.group.children.find(
        (c) => c.name === '__axisTickLines'
      );
      expect(lineSegments).toBeDefined();

      // 50 + 100 mm labelled, 3 axes, 2 signs, prominent flag for both → 12 sprites.
      expect(result.labelCount).toBe(12);
    });

    it('places sprites at the correct mm offset along each axis', () => {
      const result = buildAxisTickOverlay(mockThree, {
        rangeMm: 100,
        tickStepMm: 10,
        labelStepMm: 50,
      });
      const sprites = result.group.children.filter((c) => c.userData?.axisMark);
      const positionsByAxis = {
        x: new Set(),
        y: new Set(),
        z: new Set(),
      };
      for (const s of sprites) {
        positionsByAxis[s.userData.axisMark.axis].add(
          s.userData.axisMark.mm
        );
      }
      for (const axis of ['x', 'y', 'z']) {
        expect([...positionsByAxis[axis]].sort((a, b) => a - b)).toEqual([
          -100, -50, 50, 100,
        ]);
      }
    });

    it('marks the 50/100 mm labels as prominent', () => {
      const result = buildAxisTickOverlay(mockThree, {
        rangeMm: 200,
        tickStepMm: 10,
        labelStepMm: 50,
      });
      const sprites = result.group.children.filter((c) => c.userData?.axisMark);
      for (const s of sprites) {
        const expected = Math.abs(s.userData.axisMark.mm) <= 100;
        expect(s.userData.axisMark.isProminent).toBe(expected);
      }
    });

    it('respects custom rangeMm and labelStepMm', () => {
      const result = buildAxisTickOverlay(mockThree, {
        rangeMm: 50,
        tickStepMm: 10,
        labelStepMm: 50,
      });
      // Only 50 mm labelled in each direction × 3 axes × 2 signs = 6 sprites.
      expect(result.labelCount).toBe(6);
    });

    it('clamps invalid sizing options to sensible defaults', () => {
      const result = buildAxisTickOverlay(mockThree, {
        rangeMm: -1,
        tickStepMm: 0,
        labelStepMm: NaN,
      });
      // Defaults: range=200, label step=50 → 4 labels per axis × 3 axes × 2 signs = 24
      expect(result.labelCount).toBe(24);
    });

    it('disposes line geometry, line material, sprite materials and textures', () => {
      const result = buildAxisTickOverlay(mockThree, {
        rangeMm: 50,
        tickStepMm: 10,
        labelStepMm: 50,
      });
      const lineSegments = result.group.children.find(
        (c) => c.name === '__axisTickLines'
      );
      const tickGeometry = lineSegments.geometry;
      const lineMaterial = lineSegments.material;
      const sprites = result.group.children.filter((c) => c.userData?.axisMark);

      result.dispose();

      expect(tickGeometry.dispose).toHaveBeenCalled();
      expect(lineMaterial.dispose).toHaveBeenCalled();
      // Each sprite material is a Mock with a vi.fn() dispose.
      sprites.forEach((s) => {
        expect(s.material.dispose).toHaveBeenCalled();
      });
    });

    it('records the resolved color hex on the result', () => {
      document.documentElement.style.setProperty(
        '--color-text-primary',
        '#112233'
      );
      const result = buildAxisTickOverlay(mockThree, {
        themeKey: 'light',
      });
      expect(result.colorHex).toBe(0x112233);
      document.documentElement.style.removeProperty('--color-text-primary');
    });
  });
});
