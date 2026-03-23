/**
 * SVG Preparer — Proof of Concept tests
 *
 * Validates that path-bool and svg-path-commander can transform the
 * smiley.svg multi-element SVG into a single compound path suitable
 * for OpenSCAD import.
 *
 * Phase 1 scope: library integration PoC only.
 * Phase 2 will add the svg-preparer.js module and expand these tests.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { shapeToPathArray, pathToString } from 'svg-path-commander';
import {
  pathFromPathData,
  pathToPathData,
  pathBoolean,
  PathBooleanOperation,
  FillRule,
} from 'path-bool';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SVG_DIR = join(__dirname, '../../public/examples/nasif-charm-maker/svg-library');

// ---------------------------------------------------------------------------
// svg-path-commander: shape-to-path conversion
// ---------------------------------------------------------------------------

describe('svg-path-commander shape-to-path conversion', () => {
  it('converts a circle to a valid SVG path d string', () => {
    const pathArr = shapeToPathArray({ type: 'circle', cx: 50, cy: 50, r: 45 });
    expect(pathArr).not.toBe(false);

    const d = pathToString(pathArr);
    expect(typeof d).toBe('string');
    expect(d.length).toBeGreaterThan(0);
    expect(d).toMatch(/^M/);
  });

  it('circle path data round-trips through path-bool', () => {
    const pathArr = shapeToPathArray({ type: 'circle', cx: 50, cy: 50, r: 45 });
    const d = pathToString(pathArr);

    const parsed = pathFromPathData(d);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);

    const roundTripped = pathToPathData(parsed);
    expect(typeof roundTripped).toBe('string');
    expect(roundTripped).toMatch(/^M/);
  });

  it('converts circles at different positions correctly', () => {
    const positions = [
      { cx: 35, cy: 38, r: 7 },
      { cx: 65, cy: 38, r: 7 },
      { cx: 0, cy: 0, r: 1 },
    ];

    for (const pos of positions) {
      const pathArr = shapeToPathArray({ type: 'circle', ...pos });
      expect(pathArr).not.toBe(false);

      const d = pathToString(pathArr);
      expect(d).toMatch(/^M/);
      expect(d.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// path-bool: boolean operations on SVG path data
// ---------------------------------------------------------------------------

describe('path-bool boolean operations', () => {
  it('unions two non-overlapping circles into separate subpaths', () => {
    const eyeL = pathToString(shapeToPathArray({ type: 'circle', cx: 35, cy: 38, r: 7 }));
    const eyeR = pathToString(shapeToPathArray({ type: 'circle', cx: 65, cy: 38, r: 7 }));

    const result = pathBoolean(
      pathFromPathData(eyeL), FillRule.EvenOdd,
      pathFromPathData(eyeR), FillRule.EvenOdd,
      PathBooleanOperation.Union,
    );

    expect(result.length).toBe(1);
    const d = pathToPathData(result[0]);
    const mCount = (d.match(/M/g) || []).length;
    expect(mCount).toBe(2);
  });

  it('subtracts a smaller circle from a larger one', () => {
    const outer = pathToString(shapeToPathArray({ type: 'circle', cx: 50, cy: 50, r: 45 }));
    const inner = pathToString(shapeToPathArray({ type: 'circle', cx: 50, cy: 50, r: 20 }));

    const result = pathBoolean(
      pathFromPathData(outer), FillRule.EvenOdd,
      pathFromPathData(inner), FillRule.EvenOdd,
      PathBooleanOperation.Difference,
    );

    expect(result.length).toBeGreaterThanOrEqual(1);
    const d = pathToPathData(result[0]);
    expect(d.length).toBeGreaterThan(0);
    expect(d).toMatch(/^M/);
  });
});

// ---------------------------------------------------------------------------
// Smiley PoC: full pipeline (face circle minus eye circles)
// ---------------------------------------------------------------------------

describe('smiley.svg PoC pipeline', () => {
  const smileyPath = join(SVG_DIR, 'smiley.svg');
  let smileyContent;

  it('smiley.svg exists and contains expected elements', () => {
    smileyContent = readFileSync(smileyPath, 'utf-8');
    expect(smileyContent).toContain('<circle');
    expect(smileyContent).toContain('fill="black"');
    expect(smileyContent).toContain('fill="white"');
  });

  it('produces a compound path with exactly 3 subpaths (face + 2 eyes)', () => {
    const faceD = pathToString(
      shapeToPathArray({ type: 'circle', cx: 50, cy: 50, r: 45 }),
    );
    const eyeLD = pathToString(
      shapeToPathArray({ type: 'circle', cx: 35, cy: 38, r: 7 }),
    );
    const eyeRD = pathToString(
      shapeToPathArray({ type: 'circle', cx: 65, cy: 38, r: 7 }),
    );

    const eyesUnion = pathBoolean(
      pathFromPathData(eyeLD), FillRule.EvenOdd,
      pathFromPathData(eyeRD), FillRule.EvenOdd,
      PathBooleanOperation.Union,
    );
    expect(eyesUnion.length).toBe(1);

    const result = pathBoolean(
      pathFromPathData(faceD), FillRule.EvenOdd,
      eyesUnion[0], FillRule.EvenOdd,
      PathBooleanOperation.Difference,
    );

    expect(result.length).toBe(1);

    const compoundD = pathToPathData(result[0]);
    expect(typeof compoundD).toBe('string');
    expect(compoundD.length).toBeGreaterThan(0);

    const mCount = (compoundD.match(/M/g) || []).length;
    expect(mCount).toBe(3);
  });

  it('compound path output is a valid SVG path d attribute', () => {
    const faceD = pathToString(
      shapeToPathArray({ type: 'circle', cx: 50, cy: 50, r: 45 }),
    );
    const eyeLD = pathToString(
      shapeToPathArray({ type: 'circle', cx: 35, cy: 38, r: 7 }),
    );
    const eyeRD = pathToString(
      shapeToPathArray({ type: 'circle', cx: 65, cy: 38, r: 7 }),
    );

    const eyesUnion = pathBoolean(
      pathFromPathData(eyeLD), FillRule.EvenOdd,
      pathFromPathData(eyeRD), FillRule.EvenOdd,
      PathBooleanOperation.Union,
    );
    const result = pathBoolean(
      pathFromPathData(faceD), FillRule.EvenOdd,
      eyesUnion[0], FillRule.EvenOdd,
      PathBooleanOperation.Difference,
    );

    const compoundD = pathToPathData(result[0]);

    expect(compoundD).toMatch(/^M\s*[\d.-]/);
    expect(compoundD).not.toContain('NaN');
    expect(compoundD).not.toContain('undefined');
    expect(compoundD).not.toContain('Infinity');
  });
});

// ---------------------------------------------------------------------------
// heart.svg: single-path SVG should not need preparation
// ---------------------------------------------------------------------------

describe('heart.svg single-path pass-through', () => {
  const heartPath = join(SVG_DIR, 'heart.svg');

  it('heart.svg has exactly one path element and no other shapes', () => {
    const content = readFileSync(heartPath, 'utf-8');
    const pathMatches = content.match(/<path[\s/]/g) || [];
    const circleMatches = content.match(/<circle[\s/]/g) || [];
    const rectMatches = content.match(/<rect[\s/]/g) || [];
    const ellipseMatches = content.match(/<ellipse[\s/]/g) || [];

    expect(pathMatches.length).toBe(1);
    expect(circleMatches.length).toBe(0);
    expect(rectMatches.length).toBe(0);
    expect(ellipseMatches.length).toBe(0);
  });

  it('heart.svg path data round-trips through path-bool without error', () => {
    const content = readFileSync(heartPath, 'utf-8');
    const dMatch = content.match(/d="([^"]+)"/);
    expect(dMatch).not.toBeNull();

    const d = dMatch[1];
    const parsed = pathFromPathData(d);
    expect(parsed.length).toBeGreaterThan(0);

    const roundTripped = pathToPathData(parsed);
    expect(typeof roundTripped).toBe('string');
    expect(roundTripped).toMatch(/^M/);
  });
});

// ---------------------------------------------------------------------------
// Feature flag registration
// ---------------------------------------------------------------------------

describe('svg_preparer feature flag', () => {
  it('is registered in FLAGS with expected properties', async () => {
    const { FLAGS } = await import('../../src/js/feature-flags.js');

    expect(FLAGS.svg_preparer).toBeDefined();
    expect(FLAGS.svg_preparer.id).toBe('svg_preparer');
    expect(FLAGS.svg_preparer.name).toBe('SVG Preparer');
    expect(FLAGS.svg_preparer.default).toBe(false);
    expect(FLAGS.svg_preparer.rollout).toBe(0);
    expect(FLAGS.svg_preparer.userConfigurable).toBe(true);
    expect(FLAGS.svg_preparer.killSwitch).toBe(false);
  });

  it('is disabled by default (rollout 0, default false)', async () => {
    const { isEnabled } = await import('../../src/js/feature-flags.js');
    expect(isEnabled('svg_preparer')).toBe(false);
  });
});
