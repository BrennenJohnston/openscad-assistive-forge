/**
 * Unit tests for the axis tick + numeral overlay (UF-7 desktop
 * transcription).
 *
 * The mock deliberately mirrors what getThreeModule() actually hands out —
 * never more. The pre-UF-7 suite injected Sprite/CanvasTexture classes the
 * app did not export, which is how 20 green tests sat on top of an overlay
 * that threw on every real attempt (the R-IV lesson).
 *
 * Expected numbers are pinned at the two desktop reference poses
 * (distance 140 and 263.43, both `fov = 22.50` screenshots) so a drifted
 * formula fails loudly against the same ground truth the owner approved.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';
import {
  buildAxisTickOverlay,
  resolveAxisMarkColor,
  computeScale,
  __test,
} from '../../src/js/axis-tick-overlay.js';

function makeMockThree() {
  class MockGroup {
    constructor() {
      this.children = [];
      this.name = '';
      this.renderOrder = 0;
    }
    add(o) {
      this.children.push(o);
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
      this.array = Float32Array.from(array);
      this.itemSize = itemSize;
      this.count = this.array.length / itemSize;
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
  class MockLineSegments {
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
    LineSegments: MockLineSegments,
  };
}

describe('axis-tick-overlay (UF-7 transcription)', () => {
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

    it('reads --color-text-primary from body when present', () => {
      // The token is read off <body> (not <html>): Classic's remap is
      // body-scoped, and jsdom does not inherit custom properties, so
      // setting it here also proves which element the resolver queries.
      document.body.style.setProperty('--color-text-primary', '#ff5733');
      const result = resolveAxisMarkColor('light', document);
      expect(result.hex).toBe(0xff5733);
      document.body.style.removeProperty('--color-text-primary');
    });

    it('handles a forced-colors / system color fallback gracefully', () => {
      // CanvasText / WindowText etc. can't be parsed; the helper must
      // still return a usable fallback rather than throwing.
      document.body.style.setProperty('--color-text-primary', 'CanvasText');
      const result = resolveAxisMarkColor('light-hc', document);
      expect(typeof result.hex).toBe('number');
      expect(result.css).toMatch(/^#[0-9a-f]{6}$/);
      document.body.style.removeProperty('--color-text-primary');
    });

    it('classic resolves the transcribed Cornfield axes color, scheme-first', () => {
      // Even with a token present the scheme wins: the marks belong to the
      // viewport scheme, not to the app theme underneath (U-13).
      document.body.style.setProperty('--color-text-primary', '#ff5733');
      const result = resolveAxisMarkColor('classic', document);
      expect(result.hex).toBe(0x000000);
      expect(result.css).toBe('#000000');
      document.body.style.removeProperty('--color-text-primary');
    });

    it('a dark scheme keeps its own light axes without consulting tokens', () => {
      const result = resolveAxisMarkColor('starnight', document);
      expect(result.hex).toBe(0xe5e5e5);
    });

    it('prefers the body-scoped token over the html one (the U-13 shape)', () => {
      // The dark theme writes its token on <html>; Classic's remap lives
      // on <body>. Reading html is exactly the defect this fix removed.
      document.documentElement.style.setProperty(
        '--color-text-primary',
        '#edeef0'
      );
      document.body.style.setProperty('--color-text-primary', '#1a1a1a');
      const result = resolveAxisMarkColor('light', document);
      expect(result.hex).toBe(0x1a1a1a);
      document.documentElement.style.removeProperty('--color-text-primary');
      document.body.style.removeProperty('--color-text-primary');
    });
  });

  describe('computeScale (showScalemarkers step function)', () => {
    it('pins the close-up reference pose: distance 140', () => {
      expect(computeScale(140)).toEqual({
        distanceMm: 140,
        lAdjusted: 100,
        tickStepMm: 10,
        extraLabels: true,
      });
    });

    it('pins the wide reference pose: distance 263.43 (numbers every 20 mm)', () => {
      const s = computeScale(263.43);
      expect(s.tickStepMm).toBe(10);
      // 263.43 / 100 = 2.6343 < 3 → extra numbers every 2nd tick.
      expect(s.extraLabels).toBe(true);
    });

    it('turns the extra labels off once three majors fit (distance 500)', () => {
      const s = computeScale(500);
      expect(s.tickStepMm).toBe(10);
      expect(s.extraLabels).toBe(false);
    });

    it('changes decade exactly at powers of ten', () => {
      expect(computeScale(99).tickStepMm).toBe(1);
      expect(computeScale(100).tickStepMm).toBe(10);
      expect(computeScale(999).tickStepMm).toBe(10);
      expect(computeScale(1000).tickStepMm).toBe(100);
    });

    it('keeps working below 10 mm (sub-decade zooms label fractions)', () => {
      const s = computeScale(9.5);
      expect(s.tickStepMm).toBeCloseTo(0.1, 10);
      expect(s.extraLabels).toBe(false);
    });

    it('falls back to the default distance on nonsense', () => {
      for (const bad of [0, -5, NaN, Infinity, undefined, 'far']) {
        expect(computeScale(bad).distanceMm).toBe(__test.DEFAULT_DISTANCE_MM);
      }
    });
  });

  describe('formatMarkerNumber (C++ STR parity)', () => {
    it('never leaks float accumulation noise', () => {
      expect(__test.formatMarkerNumber(30.000000000000004)).toBe('30');
      expect(__test.formatMarkerNumber(0.30000000000000004)).toBe('0.3');
    });

    it('passes plain values through', () => {
      expect(__test.formatMarkerNumber(100)).toBe('100');
      expect(__test.formatMarkerNumber(0.5)).toBe('0.5');
    });
  });

  describe('buildMarkerGeometry', () => {
    it('pins tick and label counts at the wide reference pose (263.43)', () => {
      const g = __test.buildMarkerGeometry(263.43);
      // Ticks at k=0..26 (k·10 < 263.43): 27 positions × 6 half-axes.
      expect(g.tickCount).toBe(27 * 6);
      // Numbers: majors at 100 and 200, plus every 2nd tick because
      // 263.43/100 < 3 → labelled k = {2,4,…,26} = 13 positions × 6 axes.
      expect(g.labelCount).toBe(13 * 6);
      expect(g.solidTicks.length).toBe(27 * 3 * 6);
      expect(g.dashedTicks.length).toBe(27 * 3 * 6);
    });

    it('labels only every 10th tick when zoomed past the threshold (500)', () => {
      const g = __test.buildMarkerGeometry(500);
      // k·10 < 500 → k=0..49; majors at k=10,20,30,40 → 4 positions.
      expect(g.labelCount).toBe(4 * 6);
    });

    it('draws one-sided arms: X ticks toward −Y, Y and Z ticks toward −X', () => {
      const l = 263.43;
      const g = __test.buildMarkerGeometry(l);
      const minor = l / __test.SIZE_DIV_SM;
      const lift = __test.XY_LIFT_MM;
      // k=1 trio starts at float offset 1 × 3 segments × 6 floats.
      const at = (i) => Array.from(g.solidTicks.slice(i, i + 6));
      expect(at(18)).toEqual([10, 0, lift, 10, -minor, lift]);
      expect(at(24)).toEqual([0, 10, lift, -minor, 10, lift]);
      expect(at(30)).toEqual([0, 0, 10, -minor, 0, 10]);
    });

    it('doubles the arm length on every 10th tick (major = l/30)', () => {
      const l = 263.43;
      const g = __test.buildMarkerGeometry(l);
      const major = l / (__test.SIZE_DIV_SM / 2);
      // k=10 (i=100): trio at offset 10 × 18 floats; X segment end y = −major.
      const seg = Array.from(g.solidTicks.slice(180, 186));
      expect(seg[0]).toBe(100);
      expect(seg[4]).toBeCloseTo(-major, 10);
    });

    it('mirrors the negative ticks into the dashed buffer', () => {
      const g = __test.buildMarkerGeometry(263.43);
      const lift = __test.XY_LIFT_MM;
      const minor = 263.43 / __test.SIZE_DIV_SM;
      expect(Array.from(g.dashedTicks.slice(18, 24))).toEqual([
        -10,
        0,
        lift,
        -10,
        -minor,
        lift,
      ]);
    });

    it('keeps the Z axis content in the XZ plane with no grid lift', () => {
      const g = __test.buildMarkerGeometry(263.43);
      // Every 3rd solid segment is the Z tick: indices 12..17 within each 18.
      for (let base = 12; base < g.solidTicks.length; base += 18) {
        expect(g.solidTicks[base + 1]).toBe(0);
        expect(g.solidTicks[base + 4]).toBe(0);
      }
    });
  });

  describe('emitMarkerNumber (decodeMarkerValue transcription)', () => {
    const unit = 1; // buf=0.25, w=0.5, h=1.25, pitch=0.75

    it('draws "1" on +X as one vertical stroke in the XY plane', () => {
      const out = [];
      __test.emitMarkerNumber(out, '1', 20, 0, unit);
      const lift = __test.XY_LIFT_MM;
      // '1' is A→E on the box left edge: (cx−w/2, h) → (cx−w/2, buf).
      expect(out).toEqual([19.75, 1.25, lift, 19.75, 0.25, lift]);
    });

    it('closes "0" into a four-segment loop', () => {
      const out = [];
      __test.emitMarkerNumber(out, '0', 20, 0, unit);
      expect(out.length).toBe(4 * 6);
      // The loop's last segment returns to its first vertex.
      expect(out.slice(-3)).toEqual(out.slice(0, 3));
    });

    it('prefixes the minus and walks outward on the negative X axis', () => {
      const out = [];
      __test.emitMarkerNumber(out, '20', 100, 3, unit);
      // di=3 reverses "-20" to "02-": the minus is the farthest char, so
      // reading in +X order gives "-", "2", "0". All along-coords negative.
      const xs = out.filter((_, i) => i % 3 === 0);
      expect(Math.max(...xs)).toBeLessThan(0);
      // 3 chars: '0' loop (4 segs) + '2' strip (5 segs) + '-' (1 seg).
      expect(out.length).toBe((4 + 5 + 1) * 6);
    });

    it('stacks Z-axis digits along the axis in the XZ plane', () => {
      const out = [];
      __test.emitMarkerNumber(out, '20', 100, 2, unit);
      // Every vertex sits at y=0 (XZ plane, no grid lift on Z content).
      const ys = out.filter((_, i) => i % 3 === 1);
      expect(ys.every((y) => y === 0)).toBe(true);
      // The along-axis values land in Z; the glyph box height lands in X.
      const zs = out.filter((_, i) => i % 3 === 2);
      const xs = out.filter((_, i) => i % 3 === 0);
      expect(Math.min(...zs)).toBeGreaterThanOrEqual(100 - 0.5);
      expect(Math.max(...xs)).toBeLessThanOrEqual(1.25);
    });

    it('mirrors +Y glyph walks relative to +X (the or-table rows differ)', () => {
      const outX = [];
      const outY = [];
      __test.emitMarkerNumber(outX, '7', 20, 0, unit);
      __test.emitMarkerNumber(outY, '7', 20, 1, unit);
      // '7' on +X: A→B→E. On +Y the walk is B→A→F (mirrored). Compare the
      // along-axis coordinate of the first vertex: left edge vs right edge.
      expect(outX[0]).toBeCloseTo(19.75, 10); // x of A (left)
      expect(outY[1]).toBeCloseTo(20.25, 10); // y (along) of B (right)
    });

    it('skips characters the desktop font does not define', () => {
      const out = [];
      __test.emitMarkerNumber(out, '1+1', 20, 0, unit);
      // '+' has no glyph (desktop switch has no default): two "1" strokes.
      expect(out.length).toBe(2 * 6);
    });
  });

  describe('buildAxisTickOverlay', () => {
    it('throws without a Three.js module', () => {
      expect(() => buildAxisTickOverlay(null)).toThrow(/Three\.js/);
    });

    it('builds the three named depth-honest nodes', () => {
      const result = buildAxisTickOverlay(makeMockThree(), {
        themeKey: 'light',
        distanceMm: 263.43,
      });
      expect(result.group.name).toBe('__axisTickOverlay');
      const names = result.group.children.map((c) => c.name).sort();
      expect(names).toEqual([
        '__axisTickDigits',
        '__axisTickLines',
        '__axisTickLinesNeg',
      ]);
      // The pre-UF-7 overlay forced renderOrder=10 and killed depthTest on
      // its labels; both were the U-11 defect. Nothing may reintroduce them.
      expect(result.group.renderOrder).toBe(0);
      for (const child of result.group.children) {
        expect(child.material.depthTest).toBeUndefined();
        expect(child.material.transparent).toBeUndefined();
      }
    });

    it('dashes only the negative tick buffer, with zoom-scaled dashes', () => {
      const l = 263.43;
      const result = buildAxisTickOverlay(makeMockThree(), {
        distanceMm: l,
      });
      const dashed = result.group.children.filter((c) => c.material.dashed);
      expect(dashed.map((c) => c.name)).toEqual(['__axisTickLinesNeg']);
      expect(dashed[0].lineDistancesComputed).toBe(true);
      expect(dashed[0].material.dashSize).toBeCloseTo(
        l / __test.DASH_DIVISOR,
        10
      );
      const solid = result.group.children.filter((c) => !c.material.dashed);
      for (const node of solid) {
        expect(node.lineDistancesComputed).toBe(false);
      }
    });

    it('reports the adaptive scale on its contract', () => {
      const result = buildAxisTickOverlay(makeMockThree(), {
        distanceMm: 263.43,
      });
      expect(result.distanceMm).toBe(263.43);
      expect(result.tickStepMm).toBe(10);
      expect(result.tickCount).toBe(27 * 6);
      expect(result.labelCount).toBe(13 * 6);
    });

    it('uses the default distance when none is supplied', () => {
      const result = buildAxisTickOverlay(makeMockThree(), {});
      expect(result.distanceMm).toBe(__test.DEFAULT_DISTANCE_MM);
      expect(result.tickStepMm).toBe(10);
    });

    it('records the resolved color hex on the result', () => {
      document.body.style.setProperty('--color-text-primary', '#112233');
      const result = buildAxisTickOverlay(makeMockThree(), {
        themeKey: 'light',
      });
      expect(result.colorHex).toBe(0x112233);
      document.body.style.removeProperty('--color-text-primary');
    });

    it('shares one solid material between ticks and digits, and disposes everything', () => {
      const result = buildAxisTickOverlay(makeMockThree(), {
        distanceMm: 263.43,
      });
      const byName = (n) => result.group.children.find((c) => c.name === n);
      const ticks = byName('__axisTickLines');
      const digits = byName('__axisTickDigits');
      const dashed = byName('__axisTickLinesNeg');
      expect(digits.material).toBe(ticks.material);

      result.dispose();
      expect(ticks.geometry.disposed).toBe(true);
      expect(dashed.geometry.disposed).toBe(true);
      expect(digits.geometry.disposed).toBe(true);
      expect(ticks.material.disposed).toBe(true);
      expect(dashed.material.disposed).toBe(true);
    });
  });
});
