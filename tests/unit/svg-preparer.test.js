/**
 * SVG Preparer — Unit tests
 *
 * Phase 1: PoC tests validating path-bool and svg-path-commander.
 * Phase 2: Module tests for parseSvgElements, classifyElements,
 *          flattenToCompoundPath, prepareSvg, needsPreparation.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, vi } from 'vitest';
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
import {
  buildNestingTree,
  suggestLayers,
  layerLimit,
  polygonFromPathData,
  boundsOf,
  estimateRingPoints,
} from '../../src/js/svg-nesting.js';
import {
  parseSvgElements,
  classifyElements,
  flattenToCompoundPath,
  prepareSvg,
  needsPreparation,
  analyzeSvg,
  countTracedShapes,
  strokeToFill,
  applyPerPathOffsets,
  getEffectivePaint,
  measureSvgAspect,
  FLATTEN_BUDGET_MS,
  FLATTEN_CALIBRATION_FLOOR_MS,
  SHAPE_LIST_CAP,
  isOverListCap,
  predictFlattenMs,
  flattenCostFrom,
  flattenLayers,
  LAYER_EMIT_CAP,
  wallRoleOverrides,
  analyzeSvgAsync,
  parseSvgElementsAsync,
  nestingTreeNeeded,
  shapeCapRefusal,
} from '../../src/js/svg-preparer.js';
import { separateColours } from '../../src/js/colour-separation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SVG_DIR = join(
  __dirname,
  '../../public/examples/nasif-charm-maker/svg-library'
);

const SMILEY_SVG = readFileSync(join(SVG_DIR, 'smiley.svg'), 'utf-8');
const HEART_SVG = readFileSync(join(SVG_DIR, 'heart.svg'), 'utf-8');
const STAR_SVG = readFileSync(join(SVG_DIR, 'star.svg'), 'utf-8');

// ---------------------------------------------------------------------------
// Phase 1 — svg-path-commander: shape-to-path conversion
// ---------------------------------------------------------------------------

describe('svg-path-commander shape-to-path conversion', () => {
  it('converts a circle to a valid SVG path d string', () => {
    const pathArr = shapeToPathArray({
      type: 'circle',
      cx: 50,
      cy: 50,
      r: 45,
    });
    expect(pathArr).not.toBe(false);

    const d = pathToString(pathArr);
    expect(typeof d).toBe('string');
    expect(d.length).toBeGreaterThan(0);
    expect(d).toMatch(/^M/);
  });

  it('circle path data round-trips through path-bool', () => {
    const pathArr = shapeToPathArray({
      type: 'circle',
      cx: 50,
      cy: 50,
      r: 45,
    });
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
// Phase 1 — path-bool: boolean operations on SVG path data
// ---------------------------------------------------------------------------

describe('path-bool boolean operations', () => {
  it('unions two non-overlapping circles into separate subpaths', () => {
    const eyeL = pathToString(
      shapeToPathArray({ type: 'circle', cx: 35, cy: 38, r: 7 })
    );
    const eyeR = pathToString(
      shapeToPathArray({ type: 'circle', cx: 65, cy: 38, r: 7 })
    );

    const result = pathBoolean(
      pathFromPathData(eyeL),
      FillRule.EvenOdd,
      pathFromPathData(eyeR),
      FillRule.EvenOdd,
      PathBooleanOperation.Union
    );

    expect(result.length).toBe(1);
    const d = pathToPathData(result[0]);
    const mCount = (d.match(/M/g) || []).length;
    expect(mCount).toBe(2);
  });

  it('subtracts a smaller circle from a larger one', () => {
    const outer = pathToString(
      shapeToPathArray({ type: 'circle', cx: 50, cy: 50, r: 45 })
    );
    const inner = pathToString(
      shapeToPathArray({ type: 'circle', cx: 50, cy: 50, r: 20 })
    );

    const result = pathBoolean(
      pathFromPathData(outer),
      FillRule.EvenOdd,
      pathFromPathData(inner),
      FillRule.EvenOdd,
      PathBooleanOperation.Difference
    );

    expect(result.length).toBeGreaterThanOrEqual(1);
    const d = pathToPathData(result[0]);
    expect(d.length).toBeGreaterThan(0);
    expect(d).toMatch(/^M/);
  });
});

// ---------------------------------------------------------------------------
// Phase 1 — Smiley PoC: full pipeline (face circle minus eye circles)
// ---------------------------------------------------------------------------

describe('smiley.svg PoC pipeline', () => {
  it('smiley.svg exists and contains expected elements', () => {
    expect(SMILEY_SVG).toContain('<circle');
    expect(SMILEY_SVG).toContain('fill="black"');
    expect(SMILEY_SVG).toContain('fill="white"');
  });

  it('produces a compound path with exactly 3 subpaths (face + 2 eyes)', () => {
    const faceD = pathToString(
      shapeToPathArray({ type: 'circle', cx: 50, cy: 50, r: 45 })
    );
    const eyeLD = pathToString(
      shapeToPathArray({ type: 'circle', cx: 35, cy: 38, r: 7 })
    );
    const eyeRD = pathToString(
      shapeToPathArray({ type: 'circle', cx: 65, cy: 38, r: 7 })
    );

    const eyesUnion = pathBoolean(
      pathFromPathData(eyeLD),
      FillRule.EvenOdd,
      pathFromPathData(eyeRD),
      FillRule.EvenOdd,
      PathBooleanOperation.Union
    );
    expect(eyesUnion.length).toBe(1);

    const result = pathBoolean(
      pathFromPathData(faceD),
      FillRule.EvenOdd,
      eyesUnion[0],
      FillRule.EvenOdd,
      PathBooleanOperation.Difference
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
      shapeToPathArray({ type: 'circle', cx: 50, cy: 50, r: 45 })
    );
    const eyeLD = pathToString(
      shapeToPathArray({ type: 'circle', cx: 35, cy: 38, r: 7 })
    );
    const eyeRD = pathToString(
      shapeToPathArray({ type: 'circle', cx: 65, cy: 38, r: 7 })
    );

    const eyesUnion = pathBoolean(
      pathFromPathData(eyeLD),
      FillRule.EvenOdd,
      pathFromPathData(eyeRD),
      FillRule.EvenOdd,
      PathBooleanOperation.Union
    );
    const result = pathBoolean(
      pathFromPathData(faceD),
      FillRule.EvenOdd,
      eyesUnion[0],
      FillRule.EvenOdd,
      PathBooleanOperation.Difference
    );

    const compoundD = pathToPathData(result[0]);

    expect(compoundD).toMatch(/^M\s*[\d.-]/);
    expect(compoundD).not.toContain('NaN');
    expect(compoundD).not.toContain('undefined');
    expect(compoundD).not.toContain('Infinity');
  });
});

// ---------------------------------------------------------------------------
// Phase 1 — heart.svg: single-path SVG should not need preparation
// ---------------------------------------------------------------------------

describe('heart.svg single-path pass-through', () => {
  it('heart.svg has exactly one path element and no other shapes', () => {
    const pathMatches = HEART_SVG.match(/<path[\s/]/g) || [];
    const circleMatches = HEART_SVG.match(/<circle[\s/]/g) || [];
    const rectMatches = HEART_SVG.match(/<rect[\s/]/g) || [];
    const ellipseMatches = HEART_SVG.match(/<ellipse[\s/]/g) || [];

    expect(pathMatches.length).toBe(1);
    expect(circleMatches.length).toBe(0);
    expect(rectMatches.length).toBe(0);
    expect(ellipseMatches.length).toBe(0);
  });

  it('heart.svg path data round-trips through path-bool without error', () => {
    const dMatch = HEART_SVG.match(/d="([^"]+)"/);
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
// Phase 1 — Feature flag registration
// ---------------------------------------------------------------------------

describe('svg_preparer feature flag', () => {
  it('is registered in FLAGS with expected properties', async () => {
    const { FLAGS } = await import('../../src/js/feature-flags.js');

    expect(FLAGS.svg_preparer).toBeDefined();
    expect(FLAGS.svg_preparer.id).toBe('svg_preparer');
    expect(FLAGS.svg_preparer.name).toBe('SVG Preparer');
    expect(FLAGS.svg_preparer.default).toBe(true);
    expect(FLAGS.svg_preparer.rollout).toBe(100);
    expect(FLAGS.svg_preparer.userConfigurable).toBe(true);
    expect(FLAGS.svg_preparer.killSwitch).toBe(false);
  });

  it('is enabled by default (rollout 100, default true)', async () => {
    const { isEnabled } = await import('../../src/js/feature-flags.js');
    expect(isEnabled('svg_preparer')).toBe(true);
  });
});

// ===========================================================================
// Phase 2 — parseSvgElements
// ===========================================================================

describe('parseSvgElements', () => {
  it('parses smiley.svg into 4 elements', () => {
    const elements = parseSvgElements(SMILEY_SVG);
    expect(elements).toHaveLength(4);
  });

  it('returns correct tag names for smiley elements (document order)', () => {
    const elements = parseSvgElements(SMILEY_SVG);
    const tags = elements.map((el) => el.element.tagName.toLowerCase());
    expect(tags.filter((t) => t === 'circle')).toHaveLength(3);
    expect(tags.filter((t) => t === 'path')).toHaveLength(1);
    expect(tags).toHaveLength(4);
  });

  it('converts smiley circles to non-empty path data', () => {
    const elements = parseSvgElements(SMILEY_SVG);
    for (let i = 0; i < 3; i++) {
      expect(elements[i].pathData).toMatch(/^M/);
      expect(elements[i].pathData.length).toBeGreaterThan(0);
    }
  });

  it('preserves the existing path d attribute for path elements', () => {
    const elements = parseSvgElements(SMILEY_SVG);
    const smilePath = elements.find(
      (el) => el.element.tagName.toLowerCase() === 'path'
    );
    expect(smilePath.pathData).toBe('M28,58 Q50,82 72,58');
  });

  it('extracts fill and stroke attributes', () => {
    const elements = parseSvgElements(SMILEY_SVG);
    const face = elements.find((el) => el.fill === 'black');
    const eyes = elements.filter((el) => el.fill === 'white');
    const smile = elements.find((el) => el.fill === 'none');

    expect(face).toBeDefined();
    expect(eyes).toHaveLength(2);
    expect(smile).toBeDefined();
    expect(smile.stroke).toBe('white');
  });

  it('resolves named colors for luminance calculation', () => {
    const elements = parseSvgElements(SMILEY_SVG);
    const face = elements.find((el) => el.fill === 'black');
    const eyes = elements.filter((el) => el.fill === 'white');

    expect(face.luminance).toBe(0);
    expect(eyes[0].luminance).toBeCloseTo(255, 0);
    expect(eyes[1].luminance).toBeCloseTo(255, 0);
  });

  it('sets luminance to null for fill="none" elements', () => {
    const elements = parseSvgElements(SMILEY_SVG);
    const smile = elements.find((el) => el.fill === 'none');
    expect(smile.luminance).toBeNull();
  });

  it('parses heart.svg into 1 element', () => {
    const elements = parseSvgElements(HEART_SVG);
    expect(elements).toHaveLength(1);
    expect(elements[0].element.tagName.toLowerCase()).toBe('path');
    expect(elements[0].fill).toBe('black');
    expect(elements[0].luminance).toBe(0);
  });

  it('parses star.svg polygon into path data', () => {
    const elements = parseSvgElements(STAR_SVG);
    expect(elements).toHaveLength(1);
    expect(elements[0].element.tagName.toLowerCase()).toBe('polygon');
    expect(elements[0].pathData).toMatch(/^M/);
    expect(elements[0].pathData.length).toBeGreaterThan(0);
  });

  it('returns empty array for invalid SVG', () => {
    expect(parseSvgElements('')).toEqual([]);
    expect(parseSvgElements('<div>not svg</div>')).toEqual([]);
  });

  it('returns empty array for SVG with no shape elements', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg"><text>hello</text></svg>';
    expect(parseSvgElements(svg)).toEqual([]);
  });

  it('handles elements with hex color fills', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg">' +
      '<circle cx="10" cy="10" r="5" fill="#ff0000"/>' +
      '</svg>';
    const elements = parseSvgElements(svg);
    expect(elements).toHaveLength(1);
    expect(elements[0].luminance).toBeCloseTo(76.245, 0);
  });

  it('handles elements with rgb() fills', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg">' +
      '<rect x="0" y="0" width="10" height="10" fill="rgb(0,128,0)"/>' +
      '</svg>';
    const elements = parseSvgElements(svg);
    expect(elements).toHaveLength(1);
    expect(elements[0].luminance).toBeCloseTo(75.136, 0);
  });

  it('handles elements with no fill attribute (SVG default = black)', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg">' +
      '<circle cx="10" cy="10" r="5"/>' +
      '</svg>';
    const elements = parseSvgElements(svg);
    expect(elements).toHaveLength(1);
    expect(elements[0].fill).toBe('');
    expect(elements[0].luminance).toBe(0);
  });

  it('converts ellipse to path data', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg">' +
      '<ellipse cx="50" cy="50" rx="40" ry="20" fill="black"/>' +
      '</svg>';
    const elements = parseSvgElements(svg);
    expect(elements).toHaveLength(1);
    expect(elements[0].pathData).toMatch(/^M/);
  });

  it('converts rect to path data', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg">' +
      '<rect x="10" y="10" width="80" height="60" fill="black"/>' +
      '</svg>';
    const elements = parseSvgElements(svg);
    expect(elements).toHaveLength(1);
    expect(elements[0].pathData).toMatch(/^M/);
  });

  it('converts line to path data', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg">' +
      '<line x1="0" y1="0" x2="100" y2="100" stroke="black"/>' +
      '</svg>';
    const elements = parseSvgElements(svg);
    expect(elements).toHaveLength(1);
    expect(elements[0].pathData).toMatch(/^M/);
  });
});

// ===========================================================================
// Phase 2 — classifyElements
// ===========================================================================

describe('classifyElements', () => {
  it('classifies smiley elements correctly by default (stroke converted)', () => {
    const elements = parseSvgElements(SMILEY_SVG);
    const classified = classifyElements(elements);

    const face = classified.find((el) => el.fill === 'black');
    const eyes = classified.filter((el) => el.fill === 'white');
    const smile = classified.find(
      (el) => el.fill === 'none' || el.strokeConverted
    );

    expect(face.role).toBe('foreground');
    expect(eyes[0].role).toBe('hole');
    expect(eyes[1].role).toBe('hole');
    expect(smile.role).toBe('hole');
    expect(smile.strokeConverted).toBe(true);
  });

  it('respects strokeHandling: ignore option', () => {
    const elements = parseSvgElements(SMILEY_SVG);
    const classified = classifyElements(elements, {
      strokeHandling: 'ignore',
    });
    const smile = classified.find((el) => el.fill === 'none');
    expect(smile.role).toBe('ignore');
  });

  it('respects strokeHandling: foreground option', () => {
    const elements = parseSvgElements(SMILEY_SVG);
    const classified = classifyElements(elements, {
      strokeHandling: 'foreground',
    });
    const smile = classified.find((el) => el.fill === 'none');
    expect(smile.role).toBe('foreground');
  });

  it('respects custom luminanceThreshold', () => {
    const elements = parseSvgElements(SMILEY_SVG);
    const classified = classifyElements(elements, {
      luminanceThreshold: 300,
    });
    const face = classified.find((el) => el.fill === 'black');
    const eyes = classified.filter((el) => el.fill === 'white');
    expect(face.role).toBe('foreground');
    expect(eyes[0].role).toBe('foreground');
    expect(eyes[1].role).toBe('foreground');
  });

  it('respects roleOverrides by index', () => {
    const elements = parseSvgElements(SMILEY_SVG);
    const classified = classifyElements(elements, {
      roleOverrides: { 0: 'hole', 1: 'foreground' },
    });
    expect(classified[0].role).toBe('hole');
    expect(classified[1].role).toBe('foreground');
  });

  it('classifies heart.svg single element as foreground', () => {
    const elements = parseSvgElements(HEART_SVG);
    const classified = classifyElements(elements);
    expect(classified).toHaveLength(1);
    expect(classified[0].role).toBe('foreground');
  });

  it('classifies star.svg polygon as foreground', () => {
    const elements = parseSvgElements(STAR_SVG);
    const classified = classifyElements(elements);
    expect(classified).toHaveLength(1);
    expect(classified[0].role).toBe('foreground');
  });

  it('classifies elements with no fill as foreground (SVG default = black)', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg">' +
      '<circle cx="10" cy="10" r="5"/>' +
      '</svg>';
    const elements = parseSvgElements(svg);
    const classified = classifyElements(elements);
    expect(classified[0].role).toBe('foreground');
  });

  it('returns empty array for empty input', () => {
    expect(classifyElements([])).toEqual([]);
  });
});

// ===========================================================================
// Phase 2 — strokeToFill
// ===========================================================================

describe('strokeToFill', () => {
  it('converts a simple line to a closed filled polygon', () => {
    const d = strokeToFill('M0,0 L100,0', 10);
    expect(d).toContain('M');
    expect(d).toContain('Z');
    expect(d).not.toContain('NaN');
    expect(d).not.toContain('undefined');
  });

  it('converts a quadratic bezier (smiley smile) to a filled outline', () => {
    const d = strokeToFill('M28,58 Q50,82 72,58', 5);
    expect(d).toContain('M');
    expect(d).toContain('Z');
    expect(d.length).toBeGreaterThan(50);
  });

  it('returns original path for zero stroke width', () => {
    const original = 'M0,0 L100,0';
    expect(strokeToFill(original, 0)).toBe(original);
  });

  it('produces wider outline for larger stroke width', () => {
    const narrow = strokeToFill('M0,0 L100,0', 2);
    const wide = strokeToFill('M0,0 L100,0', 20);
    expect(wide.length).toBeGreaterThan(narrow.length);
  });

  it('handles round linecap', () => {
    const d = strokeToFill('M10,50 L90,50', 10, 'round');
    expect(d).toContain('A');
    expect(d).toContain('Z');
  });

  it('handles square linecap', () => {
    const d = strokeToFill('M10,50 L90,50', 10, 'square');
    expect(d).toContain('Z');
    expect(d).not.toContain('NaN');
  });
});

// ===========================================================================
// Phase 2 — flattenToCompoundPath
// ===========================================================================

describe('flattenToCompoundPath', () => {
  it('produces a compound path SVG from smiley elements', () => {
    const elements = parseSvgElements(SMILEY_SVG);
    const classified = classifyElements(elements);
    const result = flattenToCompoundPath(classified, {
      viewBox: '0 0 100 100',
    });

    expect(result).not.toBeNull();
    expect(result).toContain('<svg');
    expect(result).toContain('<path');
    expect(result).toContain('fill="black"');
    expect(result).toContain('viewBox="0 0 100 100"');
  });

  it('smiley compound path includes smile outline (4+ M-command subpaths)', () => {
    const elements = parseSvgElements(SMILEY_SVG);
    const classified = classifyElements(elements);
    const result = flattenToCompoundPath(classified, {
      viewBox: '0 0 100 100',
    });

    const dMatch = result.match(/d="([^"]+)"/);
    expect(dMatch).not.toBeNull();
    const mCount = (dMatch[1].match(/M/g) || []).length;
    expect(mCount).toBeGreaterThanOrEqual(4);
  });

  it('single foreground element with no holes produces single-path SVG', () => {
    const elements = parseSvgElements(HEART_SVG);
    const classified = classifyElements(elements);
    const result = flattenToCompoundPath(classified, {
      viewBox: '0 0 100 100',
    });

    expect(result).toContain('<path');
    const dMatch = result.match(/d="([^"]+)"/);
    const mCount = (dMatch[1].match(/M/g) || []).length;
    expect(mCount).toBe(1);
  });

  it('returns null when no foreground elements exist', () => {
    const classified = [
      { pathData: 'M0,0 L10,10', role: 'hole' },
      { pathData: 'M20,20 L30,30', role: 'ignore' },
    ];
    expect(flattenToCompoundPath(classified)).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(flattenToCompoundPath([])).toBeNull();
  });

  it('preserves width and height in SVG metadata', () => {
    const elements = parseSvgElements(HEART_SVG);
    const classified = classifyElements(elements);
    const result = flattenToCompoundPath(classified, {
      viewBox: '0 0 100 100',
      width: '200',
      height: '200',
    });

    expect(result).toContain('width="200"');
    expect(result).toContain('height="200"');
  });

  it('compound path data contains no NaN or undefined', () => {
    const elements = parseSvgElements(SMILEY_SVG);
    const classified = classifyElements(elements);
    const result = flattenToCompoundPath(classified);

    expect(result).not.toContain('NaN');
    expect(result).not.toContain('undefined');
    expect(result).not.toContain('Infinity');
  });

  it('handles multiple foreground elements via union', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
      '<circle cx="30" cy="50" r="25" fill="black"/>' +
      '<circle cx="70" cy="50" r="25" fill="black"/>' +
      '</svg>';
    const elements = parseSvgElements(svg);
    const classified = classifyElements(elements);
    const result = flattenToCompoundPath(classified, {
      viewBox: '0 0 100 100',
    });

    expect(result).toContain('<path');
    expect(result).not.toBeNull();
  });
});

// ===========================================================================
// Phase 2 — needsPreparation
// ===========================================================================

describe('needsPreparation', () => {
  it('returns true for smiley.svg (multi-element)', () => {
    expect(needsPreparation(SMILEY_SVG)).toBe(true);
  });

  it('returns false for heart.svg (single-path)', () => {
    expect(needsPreparation(HEART_SVG)).toBe(false);
  });

  it('returns false for star.svg (single-polygon)', () => {
    expect(needsPreparation(STAR_SVG)).toBe(false);
  });

  it('returns false for empty SVG', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
    expect(needsPreparation(svg)).toBe(false);
  });

  it('returns false for invalid input', () => {
    expect(needsPreparation('')).toBe(false);
    expect(needsPreparation('<div>not svg</div>')).toBe(false);
  });

  it('needs preparation when stroked element accompanies a filled element', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg">' +
      '<circle cx="10" cy="10" r="5" fill="black"/>' +
      '<line x1="0" y1="0" x2="10" y2="10" stroke="black" fill="none"/>' +
      '</svg>';
    expect(needsPreparation(svg)).toBe(true);
  });

  it('returns true for two filled elements', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg">' +
      '<circle cx="10" cy="10" r="5" fill="black"/>' +
      '<circle cx="20" cy="20" r="5" fill="white"/>' +
      '</svg>';
    expect(needsPreparation(svg)).toBe(true);
  });

  it('all-dark multi-element SVGs pass through (OpenSCAD unions natively)', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg">' +
      '<circle cx="10" cy="10" r="5"/>' +
      '<circle cx="20" cy="20" r="5"/>' +
      '</svg>';
    expect(needsPreparation(svg)).toBe(false);
  });
});

// ===========================================================================
// Phase 2 — prepareSvg (orchestrator)
// ===========================================================================

describe('prepareSvg', () => {
  it('transforms smiley.svg into a single-path compound SVG', () => {
    const result = prepareSvg(SMILEY_SVG);

    expect(result).toContain('<svg');
    expect(result).toContain('viewBox="0 0 100 100"');

    const pathMatches = result.match(/<path[\s/]/g) || [];
    expect(pathMatches).toHaveLength(1);

    const dMatch = result.match(/d="([^"]+)"/);
    expect(dMatch).not.toBeNull();
    const mCount = (dMatch[1].match(/M/g) || []).length;
    expect(mCount).toBeGreaterThanOrEqual(4);
  });

  it('prepared smiley does not need further preparation', () => {
    const result = prepareSvg(SMILEY_SVG);
    expect(needsPreparation(result)).toBe(false);
  });

  it('returns heart.svg unchanged (single element)', () => {
    const result = prepareSvg(HEART_SVG);
    expect(result).toBe(HEART_SVG);
  });

  it('returns star.svg unchanged (single element)', () => {
    const result = prepareSvg(STAR_SVG);
    expect(result).toBe(STAR_SVG);
  });

  it('preserves viewBox from original SVG', () => {
    const result = prepareSvg(SMILEY_SVG);
    expect(result).toContain('viewBox="0 0 100 100"');
  });

  it('converts stroked smile path to filled outline by default', () => {
    const result = prepareSvg(SMILEY_SVG);
    const dMatch = result.match(/d="([^"]+)"/);
    const mCount = (dMatch[1].match(/M/g) || []).length;
    expect(mCount).toBeGreaterThanOrEqual(4);
  });

  it('ignores stroked smile when strokeHandling is ignore', () => {
    const result = prepareSvg(SMILEY_SVG, { strokeHandling: 'ignore' });
    const dMatch = result.match(/d="([^"]+)"/);
    const mCount = (dMatch[1].match(/M/g) || []).length;
    expect(mCount).toBe(3);
  });

  it('handles empty string input gracefully', () => {
    const result = prepareSvg('');
    expect(result).toBe('');
  });

  it('handles malformed SVG gracefully', () => {
    const result = prepareSvg('<div>not svg</div>');
    expect(result).toBe('<div>not svg</div>');
  });

  it('passes classification options through', () => {
    const result = prepareSvg(SMILEY_SVG, { luminanceThreshold: 300 });
    const dMatch = result.match(/d="([^"]+)"/);
    expect(dMatch).not.toBeNull();
  });
});

// ===========================================================================
// Phase 6 — parseSvgElements edge cases
// ===========================================================================

describe('parseSvgElements edge cases', () => {
  it('handles SVG with only stroked elements (no fill)', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg">' +
      '<line x1="0" y1="0" x2="10" y2="10" stroke="red" fill="none"/>' +
      '<polyline points="0,0 10,10 20,0" stroke="blue" fill="none"/>' +
      '</svg>';
    const elements = parseSvgElements(svg);
    expect(elements).toHaveLength(2);
    elements.forEach((el) => {
      expect(el.fill).toBe('none');
      expect(el.luminance).toBeNull();
    });
  });

  it('handles SVG with gradient fill references', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg">' +
      '<defs><linearGradient id="g1"><stop offset="0" stop-color="red"/></linearGradient></defs>' +
      '<rect x="0" y="0" width="50" height="50" fill="url(#g1)"/>' +
      '</svg>';
    const elements = parseSvgElements(svg);
    expect(elements).toHaveLength(1);
    expect(elements[0].fill).toBe('url(#g1)');
    // url() fill is not a parseable color — luminance falls back to 0
    expect(typeof elements[0].luminance).toBe('number');
  });

  it('handles SVG with pattern fill references', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg">' +
      '<defs><pattern id="p1"><rect width="5" height="5" fill="red"/></pattern></defs>' +
      '<circle cx="25" cy="25" r="20" fill="url(#p1)"/>' +
      '</svg>';
    const elements = parseSvgElements(svg);
    // OBSERVED: querySelectorAll('*') finds the rect inside <pattern> too
    expect(elements).toHaveLength(2);
    const circle = elements.find(
      (el) => el.element.tagName.toLowerCase() === 'circle'
    );
    expect(circle).toBeDefined();
    expect(circle.fill).toBe('url(#p1)');
  });

  it('handles SVG with transform attributes on elements', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg">' +
      '<rect x="0" y="0" width="20" height="20" fill="black" transform="rotate(45 10 10)"/>' +
      '</svg>';
    const elements = parseSvgElements(svg);
    expect(elements).toHaveLength(1);
    expect(elements[0].pathData).toMatch(/^M/);
    expect(elements[0].fill).toBe('black');
  });

  it('handles SVG with clip-path on elements', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg">' +
      '<defs><clipPath id="c1"><rect x="0" y="0" width="50" height="50"/></clipPath></defs>' +
      '<circle cx="50" cy="50" r="40" fill="black" clip-path="url(#c1)"/>' +
      '</svg>';
    const elements = parseSvgElements(svg);
    // clipPath defs contain shape elements; only the non-defs circle should be parsed
    // The rect inside clipPath is also found by querySelectorAll('*')
    const circles = elements.filter(
      (el) => el.element.tagName.toLowerCase() === 'circle'
    );
    expect(circles).toHaveLength(1);
    expect(circles[0].fill).toBe('black');
  });

  it('handles SVG with nested groups', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg">' +
      '<g><g><circle cx="10" cy="10" r="5" fill="red"/></g></g>' +
      '</svg>';
    const elements = parseSvgElements(svg);
    expect(elements).toHaveLength(1);
    expect(elements[0].element.tagName.toLowerCase()).toBe('circle');
  });

  it('handles SVG with mixed shape types', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg">' +
      '<circle cx="20" cy="20" r="10" fill="black"/>' +
      '<rect x="40" y="10" width="20" height="20" fill="white"/>' +
      '<ellipse cx="80" cy="20" rx="10" ry="5" fill="gray"/>' +
      '<polygon points="10,80 30,80 20,60" fill="black"/>' +
      '</svg>';
    const elements = parseSvgElements(svg);
    expect(elements).toHaveLength(4);
    const tags = elements.map((el) => el.element.tagName.toLowerCase());
    expect(tags).toContain('circle');
    expect(tags).toContain('rect');
    expect(tags).toContain('ellipse');
    expect(tags).toContain('polygon');
    elements.forEach((el) => {
      expect(el.pathData).toMatch(/^M/);
    });
  });

  it('returns empty path data for path element with no d attribute', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg"><path fill="black"/></svg>';
    const elements = parseSvgElements(svg);
    expect(elements).toHaveLength(1);
    expect(elements[0].pathData).toBe('');
  });
});

// ===========================================================================
// Phase 6 — classifyElements edge cases
// ===========================================================================

describe('classifyElements edge cases', () => {
  it('classifies all-same-luminance elements as foreground when dark', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg">' +
      '<circle cx="20" cy="20" r="10" fill="black"/>' +
      '<circle cx="50" cy="20" r="10" fill="black"/>' +
      '<circle cx="80" cy="20" r="10" fill="black"/>' +
      '</svg>';
    const elements = parseSvgElements(svg);
    const classified = classifyElements(elements);
    classified.forEach((el) => expect(el.role).toBe('foreground'));
  });

  it('classifies all-same-luminance elements as hole when bright', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg">' +
      '<circle cx="20" cy="20" r="10" fill="white"/>' +
      '<circle cx="50" cy="20" r="10" fill="white"/>' +
      '</svg>';
    const elements = parseSvgElements(svg);
    const classified = classifyElements(elements);
    classified.forEach((el) => expect(el.role).toBe('hole'));
  });

  it('handles elements with url() fills by defaulting to foreground', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg">' +
      '<defs><linearGradient id="g1"><stop stop-color="red"/></linearGradient></defs>' +
      '<rect x="0" y="0" width="50" height="50" fill="url(#g1)"/>' +
      '</svg>';
    const elements = parseSvgElements(svg);
    const classified = classifyElements(elements);
    // url() fill returns luminance 0 from parseLuminance, so classified as foreground
    expect(classified[0].role).toBe('foreground');
  });

  it('handles mixed stroke-only and filled elements (stroke converted)', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg">' +
      '<circle cx="20" cy="20" r="10" fill="black"/>' +
      '<line x1="0" y1="0" x2="40" y2="40" stroke="red" fill="none"/>' +
      '<circle cx="60" cy="20" r="10" fill="white"/>' +
      '</svg>';
    const elements = parseSvgElements(svg);
    const classified = classifyElements(elements);
    expect(classified[0].role).toBe('foreground');
    // red stroke → luminance ~76 → below threshold → foreground
    expect(classified[1].role).toBe('foreground');
    expect(classified[1].strokeConverted).toBe(true);
    expect(classified[2].role).toBe('hole');
  });

  it('handles mixed stroke-only and filled elements (stroke ignored)', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg">' +
      '<circle cx="20" cy="20" r="10" fill="black"/>' +
      '<line x1="0" y1="0" x2="40" y2="40" stroke="red" fill="none"/>' +
      '<circle cx="60" cy="20" r="10" fill="white"/>' +
      '</svg>';
    const elements = parseSvgElements(svg);
    const classified = classifyElements(elements, { strokeHandling: 'ignore' });
    expect(classified[0].role).toBe('foreground');
    expect(classified[1].role).toBe('ignore');
    expect(classified[2].role).toBe('hole');
  });

  it('handles medium-luminance colors near the threshold', () => {
    // gray (#808080) has luminance ~128, below default threshold of 200
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg">' +
      '<circle cx="20" cy="20" r="10" fill="gray"/>' +
      '</svg>';
    const elements = parseSvgElements(svg);
    const classified = classifyElements(elements);
    expect(classified[0].role).toBe('foreground');
  });

  it('uses roleOverrides even for elements that would be stroke-only', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg">' +
      '<line x1="0" y1="0" x2="10" y2="10" stroke="red" fill="none"/>' +
      '</svg>';
    const elements = parseSvgElements(svg);
    const classified = classifyElements(elements, {
      roleOverrides: { 0: 'foreground' },
    });
    expect(classified[0].role).toBe('foreground');
  });
});

// ===========================================================================
// Phase 6 — flattenToCompoundPath edge cases
// ===========================================================================

describe('flattenToCompoundPath edge cases', () => {
  it('handles foreground-only elements (no holes)', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
      '<circle cx="30" cy="50" r="20" fill="black"/>' +
      '<circle cx="70" cy="50" r="20" fill="black"/>' +
      '</svg>';
    const elements = parseSvgElements(svg);
    const classified = classifyElements(elements);
    // Both should be foreground (both dark)
    expect(classified.every((el) => el.role === 'foreground')).toBe(true);

    const result = flattenToCompoundPath(classified, {
      viewBox: '0 0 100 100',
    });
    expect(result).toContain('<path');
    expect(result).not.toBeNull();
  });

  it('handles overlapping holes that merge', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
      '<circle cx="50" cy="50" r="45" fill="black"/>' +
      '<circle cx="40" cy="40" r="10" fill="white"/>' +
      '<circle cx="45" cy="40" r="10" fill="white"/>' +
      '</svg>';
    const elements = parseSvgElements(svg);
    const classified = classifyElements(elements);

    const holes = classified.filter((el) => el.role === 'hole');
    expect(holes).toHaveLength(2);

    const result = flattenToCompoundPath(classified, {
      viewBox: '0 0 100 100',
    });
    expect(result).toContain('<path');
    expect(result).not.toContain('NaN');
  });

  it('returns null when all elements are ignored', () => {
    const classified = [
      { pathData: 'M0,0 L10,10', role: 'ignore' },
      { pathData: 'M20,20 L30,30', role: 'ignore' },
    ];
    expect(flattenToCompoundPath(classified)).toBeNull();
  });

  it('handles single foreground with multiple holes', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
      '<rect x="0" y="0" width="100" height="100" fill="black"/>' +
      '<circle cx="25" cy="25" r="10" fill="white"/>' +
      '<circle cx="75" cy="25" r="10" fill="white"/>' +
      '<circle cx="25" cy="75" r="10" fill="white"/>' +
      '<circle cx="75" cy="75" r="10" fill="white"/>' +
      '</svg>';
    const elements = parseSvgElements(svg);
    const classified = classifyElements(elements);

    const foreground = classified.filter((el) => el.role === 'foreground');
    const holes = classified.filter((el) => el.role === 'hole');
    expect(foreground).toHaveLength(1);
    expect(holes).toHaveLength(4);

    const result = flattenToCompoundPath(classified, {
      viewBox: '0 0 100 100',
    });
    expect(result).toContain('<path');

    const dMatch = result.match(/d="([^"]+)"/);
    expect(dMatch).not.toBeNull();
    const mCount = (dMatch[1].match(/M/g) || []).length;
    // Rectangle + 4 holes = at least 5 M commands
    expect(mCount).toBeGreaterThanOrEqual(5);
  });

  it('handles elements with empty pathData gracefully', () => {
    const classified = [
      { pathData: '', role: 'foreground' },
      { pathData: 'M10,10 L20,20', role: 'foreground' },
    ];
    // Empty pathData elements should be filtered out (no pathData = falsy)
    const result = flattenToCompoundPath(classified);
    // Should produce output from the valid element only
    expect(result).not.toBeNull();
    expect(result).toContain('<path');
  });
});

// ===========================================================================
// Phase 6 — OpenSCAD output validation (compound path structure checks)
// ===========================================================================

describe('OpenSCAD output validation', () => {
  it('prepareSvg(smiley) produces exactly one <path> and no other shapes', () => {
    const result = prepareSvg(SMILEY_SVG);

    const pathCount = (result.match(/<path[\s/]/g) || []).length;
    expect(pathCount).toBe(1);

    expect(result).not.toMatch(/<circle[\s/]/);
    expect(result).not.toMatch(/<rect[\s/]/);
    expect(result).not.toMatch(/<ellipse[\s/]/);
    expect(result).not.toMatch(/<polygon[\s/]/);
    expect(result).not.toMatch(/<polyline[\s/]/);
    expect(result).not.toMatch(/<line[\s/]/);
  });

  it('prepared smiley compound path has multiple M-command subpaths', () => {
    const result = prepareSvg(SMILEY_SVG);
    const dMatch = result.match(/d="([^"]+)"/);
    expect(dMatch).not.toBeNull();

    const pathD = dMatch[1];
    const mCount = (pathD.match(/M/g) || []).length;
    // Face outline + 2 eye holes + smile outline = 4+ subpaths
    expect(mCount).toBeGreaterThanOrEqual(4);
  });

  it('prepared smiley preserves viewBox for OpenSCAD dimension mapping', () => {
    const result = prepareSvg(SMILEY_SVG);
    expect(result).toContain('viewBox="0 0 100 100"');
  });

  it('prepared smiley uses fill="black" (solid geometry)', () => {
    const result = prepareSvg(SMILEY_SVG);
    expect(result).toContain('fill="black"');
  });

  it('prepared smiley sets fill-rule="evenodd" for correct hole rendering', () => {
    const result = prepareSvg(SMILEY_SVG);
    expect(result).toContain('fill-rule="evenodd"');
  });

  it('prepared smiley path data contains only valid SVG commands', () => {
    const result = prepareSvg(SMILEY_SVG);
    const dMatch = result.match(/d="([^"]+)"/);
    const pathD = dMatch[1];

    // Valid SVG path commands: M, L, H, V, C, S, Q, T, A, Z (upper and lower)
    // path-bool output uses absolute commands
    expect(pathD).not.toContain('NaN');
    expect(pathD).not.toContain('undefined');
    expect(pathD).not.toContain('Infinity');
    expect(pathD).toMatch(/^M/);
    // Every command letter should be a valid SVG path command
    const commands = pathD.match(/[A-Za-z]/g);
    const validCommands = new Set('MmLlHhVvCcSsQqTtAaZz'.split(''));
    commands.forEach((cmd) => expect(validCommands.has(cmd)).toBe(true));
  });

  it('prepared smiley is well-formed XML', () => {
    const result = prepareSvg(SMILEY_SVG);
    expect(result).toMatch(/^<svg\s/);
    expect(result).toMatch(/<\/svg>$/);
    expect(result).toContain('xmlns="http://www.w3.org/2000/svg"');

    // Verify DOMParser can re-parse it without error
    const parser = new DOMParser();
    const doc = parser.parseFromString(result, 'image/svg+xml');
    const svg = doc.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(doc.querySelector('parsererror')).toBeNull();
  });

  it('single-path SVGs pass through as valid OpenSCAD input', () => {
    const heartResult = prepareSvg(HEART_SVG);
    expect(heartResult).toBe(HEART_SVG);

    const starResult = prepareSvg(STAR_SVG);
    expect(starResult).toBe(STAR_SVG);
  });

  it('prepared output is idempotent for OpenSCAD consumption', () => {
    const first = prepareSvg(SMILEY_SVG);
    const second = prepareSvg(first);
    expect(second).toBe(first);
    expect(needsPreparation(first)).toBe(false);
  });
});

// ===========================================================================
// Phase 3 — Pipeline integration: base64 round-trip and idempotency
// ===========================================================================

describe('pipeline integration (base64 round-trip)', () => {
  it('prepared SVG round-trips through base64 encoding', () => {
    const prepared = prepareSvg(SMILEY_SVG);
    const encoded = btoa(prepared);
    const decoded = atob(encoded);
    expect(decoded).toBe(prepared);
  });

  it('preparation is idempotent (double-prepare produces same result)', () => {
    const first = prepareSvg(SMILEY_SVG);
    const second = prepareSvg(first);
    expect(second).toBe(first);
  });

  it('needsPreparation returns false for already-prepared output', () => {
    const prepared = prepareSvg(SMILEY_SVG);
    expect(needsPreparation(prepared)).toBe(false);
  });

  it('single-element SVGs survive base64 round-trip unchanged', () => {
    const encoded = btoa(HEART_SVG);
    const decoded = atob(encoded);
    expect(decoded).toBe(HEART_SVG);
    expect(needsPreparation(decoded)).toBe(false);
    expect(prepareSvg(decoded)).toBe(decoded);
  });

  it('prepared smiley has exactly one <path> after base64 round-trip', () => {
    const prepared = prepareSvg(SMILEY_SVG);
    const encoded = btoa(prepared);
    const decoded = atob(encoded);
    const pathMatches = decoded.match(/<path[\s/]/g) || [];
    expect(pathMatches).toHaveLength(1);
  });

  it('prepared smiley data URL can be decoded back to valid SVG', () => {
    const prepared = prepareSvg(SMILEY_SVG);
    const dataUrl = 'data:image/svg+xml;base64,' + btoa(prepared);
    const decoded = atob(dataUrl.split(',')[1]);
    expect(decoded).toContain('<svg');
    expect(decoded).toContain('<path');
    expect(needsPreparation(decoded)).toBe(false);
  });

  it('star.svg (polygon) passes through without modification via base64', () => {
    const encoded = btoa(STAR_SVG);
    const decoded = atob(encoded);
    expect(decoded).toBe(STAR_SVG);
    expect(needsPreparation(decoded)).toBe(false);
    expect(prepareSvg(decoded)).toBe(decoded);
  });
});

// ===========================================================================
// Phase 1a — Blank square bug investigation and regression tests
// ===========================================================================

describe('blank square bug fix (fill-rule="evenodd")', () => {
  it('flattenToCompoundPath includes fill-rule="evenodd" on the path element', () => {
    const elements = parseSvgElements(SMILEY_SVG);
    const classified = classifyElements(elements);
    const result = flattenToCompoundPath(classified, {
      viewBox: '0 0 100 100',
    });

    expect(result).toContain('fill-rule="evenodd"');

    const parser = new DOMParser();
    const doc = parser.parseFromString(result, 'image/svg+xml');
    const path = doc.querySelector('path');
    expect(path).not.toBeNull();
    expect(path.getAttribute('fill-rule')).toBe('evenodd');
  });

  it('prepareSvg output includes fill-rule="evenodd" for multi-element SVGs', () => {
    const result = prepareSvg(SMILEY_SVG);
    expect(result).toContain('fill-rule="evenodd"');
  });

  it('single-element SVGs pass through without fill-rule injection', () => {
    const heartResult = prepareSvg(HEART_SVG);
    expect(heartResult).toBe(HEART_SVG);

    const starResult = prepareSvg(STAR_SVG);
    expect(starResult).toBe(STAR_SVG);
  });

  it('prepared smiley compound path has non-degenerate geometry', () => {
    const result = prepareSvg(SMILEY_SVG);
    const dMatch = result.match(/d="([^"]+)"/);
    expect(dMatch).not.toBeNull();

    const pathD = dMatch[1];
    const coords = pathD.match(/[\d.]+/g).map(Number);
    const xCoords = coords.filter((_, i) => i % 2 === 0);
    const yCoords = coords.filter((_, i) => i % 2 === 1);

    const xMin = Math.min(...xCoords);
    const xMax = Math.max(...xCoords);
    const yMin = Math.min(...yCoords);
    const yMax = Math.max(...yCoords);

    expect(xMax - xMin).toBeGreaterThan(10);
    expect(yMax - yMin).toBeGreaterThan(10);
  });

  it('prepared SVG viewBox matches the source SVG', () => {
    const result = prepareSvg(SMILEY_SVG);

    const parser = new DOMParser();
    const doc = parser.parseFromString(result, 'image/svg+xml');
    const svg = doc.querySelector('svg');

    expect(svg.getAttribute('viewBox')).toBe('0 0 100 100');
  });

  it('prepared SVG survives DOMParser round-trip as valid SVG', () => {
    const result = prepareSvg(SMILEY_SVG);

    const parser = new DOMParser();
    const doc = parser.parseFromString(result, 'image/svg+xml');

    expect(doc.querySelector('parsererror')).toBeNull();

    const svg = doc.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg.getAttribute('xmlns')).toBe('http://www.w3.org/2000/svg');

    const path = doc.querySelector('path');
    expect(path).not.toBeNull();
    expect(path.getAttribute('fill')).toBe('black');
    expect(path.getAttribute('fill-rule')).toBe('evenodd');
    expect(path.getAttribute('d')).toMatch(/^M/);
  });

  it('data URL encoding of prepared SVG preserves fill-rule', () => {
    const prepared = prepareSvg(SMILEY_SVG);
    const dataUrl = 'data:image/svg+xml;base64,' + btoa(prepared);
    const decoded = atob(dataUrl.split(',')[1]);

    expect(decoded).toContain('fill-rule="evenodd"');
    expect(decoded).toBe(prepared);
  });

  it('multi-foreground union also includes fill-rule="evenodd"', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
      '<circle cx="30" cy="50" r="25" fill="black"/>' +
      '<circle cx="70" cy="50" r="25" fill="black"/>' +
      '</svg>';
    const elements = parseSvgElements(svg);
    const classified = classifyElements(elements);
    const result = flattenToCompoundPath(classified, {
      viewBox: '0 0 100 100',
    });

    expect(result).toContain('fill-rule="evenodd"');
  });
});

// ===========================================================================
// Phase 1b — analyzeSvg() analysis model
// ===========================================================================

describe('analyzeSvg', () => {
  describe('return shape', () => {
    it('returns all required fields', () => {
      const result = analyzeSvg(SMILEY_SVG);
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('elements');
      expect(result).toHaveProperty('warnings');
      expect(result).toHaveProperty('unsupportedFeatures');
      expect(result).toHaveProperty('recommendation');
      expect(result).toHaveProperty('singleElement');
    });

    it('status is one of the allowed values', () => {
      const result = analyzeSvg(SMILEY_SVG);
      expect(['ready', 'needs_review', 'unsupported']).toContain(result.status);
    });

    it('recommendation is one of the allowed values', () => {
      const result = analyzeSvg(SMILEY_SVG);
      expect(['auto_prepare', 'open_editor', 'pass_through']).toContain(
        result.recommendation
      );
    });

    it('confidence is between 0 and 1', () => {
      const result = analyzeSvg(SMILEY_SVG);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('smiley.svg analysis', () => {
    it('detects multi-element SVG (singleElement = false)', () => {
      const result = analyzeSvg(SMILEY_SVG);
      expect(result.singleElement).toBe(false);
    });

    it('recommends auto_prepare for clear foreground/hole separation', () => {
      const result = analyzeSvg(SMILEY_SVG);
      expect(result.recommendation).toBe('auto_prepare');
    });

    it('status is ready for smiley (high confidence classification)', () => {
      const result = analyzeSvg(SMILEY_SVG);
      expect(result.status).toBe('ready');
    });

    it('has high confidence (luminance spread > 50)', () => {
      const result = analyzeSvg(SMILEY_SVG);
      expect(result.confidence).toBe(1.0);
    });

    it('returns 4 render-scope elements', () => {
      const result = analyzeSvg(SMILEY_SVG);
      expect(result.elements).toHaveLength(4);
    });

    it('classifies face as foreground, eyes as hole, smile as hole (converted)', () => {
      const result = analyzeSvg(SMILEY_SVG);
      const face = result.elements.find((el) => el.fill === 'black');
      const eyes = result.elements.filter((el) => el.fill === 'white');
      const smile = result.elements.find(
        (el) => el.fill === 'none' || el.strokeConverted
      );

      expect(face.autoRole).toBe('foreground');
      expect(eyes[0].autoRole).toBe('hole');
      expect(eyes[1].autoRole).toBe('hole');
      expect(smile.autoRole).toBe('hole');
      expect(smile.strokeConverted).toBe(true);
    });

    it('notes the stroked smile path was converted', () => {
      const result = analyzeSvg(SMILEY_SVG);
      const smile = result.elements.find((el) => el.strokeConverted);
      expect(smile.warnings.length).toBeGreaterThan(0);
      expect(smile.warnings[0]).toContain('converted');
    });

    it('has a global info about converted stroked paths', () => {
      const result = analyzeSvg(SMILEY_SVG);
      expect(result.warnings.some((w) => w.includes('converted'))).toBe(true);
    });

    it('has no unsupported features', () => {
      const result = analyzeSvg(SMILEY_SVG);
      expect(result.unsupportedFeatures).toHaveLength(0);
    });

    it('each element has pathData, fill, stroke, luminance, and autoRole', () => {
      const result = analyzeSvg(SMILEY_SVG);
      for (const el of result.elements) {
        expect(el).toHaveProperty('pathData');
        expect(el).toHaveProperty('fill');
        expect(el).toHaveProperty('stroke');
        expect(el).toHaveProperty('luminance');
        expect(el).toHaveProperty('autoRole');
        expect(el).toHaveProperty('warnings');
        expect(Array.isArray(el.warnings)).toBe(true);
      }
    });
  });

  describe('heart.svg analysis (single element)', () => {
    it('detects single-element SVG', () => {
      const result = analyzeSvg(HEART_SVG);
      expect(result.singleElement).toBe(true);
    });

    it('recommends pass_through', () => {
      const result = analyzeSvg(HEART_SVG);
      expect(result.recommendation).toBe('pass_through');
    });

    it('status is ready', () => {
      const result = analyzeSvg(HEART_SVG);
      expect(result.status).toBe('ready');
    });

    it('confidence is 1.0', () => {
      const result = analyzeSvg(HEART_SVG);
      expect(result.confidence).toBe(1.0);
    });

    it('returns 1 element', () => {
      const result = analyzeSvg(HEART_SVG);
      expect(result.elements).toHaveLength(1);
      expect(result.elements[0].autoRole).toBe('foreground');
    });
  });

  describe('star.svg analysis (single element)', () => {
    it('detects single-element SVG', () => {
      const result = analyzeSvg(STAR_SVG);
      expect(result.singleElement).toBe(true);
    });

    it('recommends pass_through', () => {
      const result = analyzeSvg(STAR_SVG);
      expect(result.recommendation).toBe('pass_through');
    });

    it('status is ready with full confidence', () => {
      const result = analyzeSvg(STAR_SVG);
      expect(result.status).toBe('ready');
      expect(result.confidence).toBe(1.0);
    });
  });

  describe('empty and invalid SVG', () => {
    it('returns pass_through for empty string', () => {
      const result = analyzeSvg('');
      expect(result.singleElement).toBe(true);
      expect(result.recommendation).toBe('pass_through');
      expect(result.status).toBe('ready');
      expect(result.confidence).toBe(1.0);
      expect(result.elements).toHaveLength(0);
    });

    it('returns pass_through for non-SVG markup', () => {
      const result = analyzeSvg('<div>not svg</div>');
      expect(result.singleElement).toBe(true);
      expect(result.recommendation).toBe('pass_through');
    });

    it('returns pass_through for SVG with no shapes', () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg"><text>hello</text></svg>';
      const result = analyzeSvg(svg);
      expect(result.singleElement).toBe(true);
      expect(result.recommendation).toBe('pass_through');
      expect(result.elements).toHaveLength(0);
    });
  });

  describe('gradient and pattern fills', () => {
    it('flags gradient fills as unsupported feature', () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg">' +
        '<defs><linearGradient id="g1"><stop offset="0" stop-color="red"/></linearGradient></defs>' +
        '<rect x="0" y="0" width="50" height="50" fill="url(#g1)"/>' +
        '<circle cx="75" cy="25" r="20" fill="black"/>' +
        '</svg>';
      const result = analyzeSvg(svg);
      expect(result.unsupportedFeatures).toContain('gradient or pattern fills');
    });

    it('reduces confidence for gradient fills', () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg">' +
        '<defs><linearGradient id="g1"><stop offset="0" stop-color="red"/></linearGradient></defs>' +
        '<rect x="0" y="0" width="50" height="50" fill="url(#g1)"/>' +
        '<circle cx="75" cy="25" r="20" fill="black"/>' +
        '</svg>';
      const result = analyzeSvg(svg);
      expect(result.confidence).toBeLessThan(1.0);
    });

    it('sets status to unsupported when gradients present in multi-element SVG', () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg">' +
        '<defs><linearGradient id="g1"><stop offset="0" stop-color="red"/></linearGradient></defs>' +
        '<rect x="0" y="0" width="50" height="50" fill="url(#g1)"/>' +
        '<circle cx="75" cy="25" r="20" fill="black"/>' +
        '</svg>';
      const result = analyzeSvg(svg);
      expect(result.status).toBe('unsupported');
      expect(result.recommendation).toBe('open_editor');
    });

    it('per-element warning on gradient-filled element', () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg">' +
        '<defs><linearGradient id="g1"><stop offset="0" stop-color="red"/></linearGradient></defs>' +
        '<rect x="0" y="0" width="50" height="50" fill="url(#g1)"/>' +
        '</svg>';
      const result = analyzeSvg(svg);
      const gradientEl = result.elements.find((el) =>
        el.fill.startsWith('url(')
      );
      expect(gradientEl).toBeDefined();
      expect(
        gradientEl.warnings.some((w) => w.includes('Gradient or pattern'))
      ).toBe(true);
    });
  });

  describe('transforms', () => {
    it('does not penalize confidence when transforms bake successfully', () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg">' +
        '<rect x="0" y="0" width="20" height="20" fill="black" transform="rotate(45 10 10)"/>' +
        '<circle cx="50" cy="50" r="15" fill="white"/>' +
        '</svg>';
      const result = analyzeSvg(svg);
      expect(result.confidence).toBe(1.0);
    });

    it('no per-element warning when the transform was baked', () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg">' +
        '<rect x="0" y="0" width="20" height="20" fill="black" transform="rotate(45 10 10)"/>' +
        '</svg>';
      const result = analyzeSvg(svg);
      expect(
        result.elements[0].warnings.some((w) => w.includes('transform'))
      ).toBe(false);
    });

    it('warns and reduces confidence when a transform cannot be parsed', () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg">' +
        '<rect x="0" y="0" width="20" height="20" fill="black" transform="bogus(1,2)"/>' +
        '<circle cx="50" cy="50" r="15" fill="white"/>' +
        '</svg>';
      const result = analyzeSvg(svg);
      expect(
        result.elements[0].warnings.some((w) =>
          w.includes('could not be baked')
        )
      ).toBe(true);
      expect(result.confidence).toBeLessThan(1.0);
      expect(result.recommendation).toBe('open_editor');
    });
  });

  describe('elements inside <defs>', () => {
    it('filters out elements inside <defs> from the elements array', () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg">' +
        '<defs><rect id="template" x="0" y="0" width="10" height="10" fill="red"/></defs>' +
        '<circle cx="50" cy="50" r="20" fill="black"/>' +
        '</svg>';
      const result = analyzeSvg(svg);
      expect(result.elements).toHaveLength(1);
      expect(result.elements[0].element.tagName.toLowerCase()).toBe('circle');
    });

    it('warns about skipped defs elements', () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg">' +
        '<defs><rect id="template" x="0" y="0" width="10" height="10" fill="red"/></defs>' +
        '<circle cx="50" cy="50" r="20" fill="black"/>' +
        '</svg>';
      const result = analyzeSvg(svg);
      expect(result.warnings.some((w) => w.includes('<defs> skipped'))).toBe(
        true
      );
    });

    it('filters out elements inside <clipPath>', () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg">' +
        '<defs><clipPath id="c1"><rect x="0" y="0" width="50" height="50"/></clipPath></defs>' +
        '<circle cx="50" cy="50" r="40" fill="black" clip-path="url(#c1)"/>' +
        '</svg>';
      const result = analyzeSvg(svg);
      const circles = result.elements.filter(
        (el) => el.element.tagName.toLowerCase() === 'circle'
      );
      expect(circles).toHaveLength(1);
      const rects = result.elements.filter(
        (el) => el.element.tagName.toLowerCase() === 'rect'
      );
      expect(rects).toHaveLength(0);
    });

    it('filters out elements inside <pattern>', () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg">' +
        '<defs><pattern id="p1"><rect width="5" height="5" fill="red"/></pattern></defs>' +
        '<circle cx="25" cy="25" r="20" fill="url(#p1)"/>' +
        '</svg>';
      const result = analyzeSvg(svg);
      const circles = result.elements.filter(
        (el) => el.element.tagName.toLowerCase() === 'circle'
      );
      expect(circles).toHaveLength(1);
    });
  });

  describe('similar luminance (ambiguous classification)', () => {
    it('does not penalize all-dark (all-foreground) SVGs — they pass through', () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg">' +
        '<circle cx="20" cy="20" r="10" fill="black"/>' +
        '<circle cx="50" cy="20" r="10" fill="black"/>' +
        '</svg>';
      const result = analyzeSvg(svg);
      expect(result.confidence).toBe(1.0);
      expect(result.recommendation).toBe('pass_through');
      expect(result.warnings.some((w) => w.includes('similar luminance'))).toBe(
        false
      );
    });

    it('reduces confidence for similar luminance when roles are mixed', () => {
      // Both fills are bright (holes) — similar luminance, not all-foreground
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg">' +
        '<circle cx="20" cy="20" r="10" fill="#eeeeee"/>' +
        '<circle cx="50" cy="20" r="10" fill="#ffffff"/>' +
        '</svg>';
      const result = analyzeSvg(svg);
      expect(result.confidence).toBeLessThan(1.0);
      expect(result.warnings.some((w) => w.includes('similar luminance'))).toBe(
        true
      );
    });

    it('does not penalize single-element SVGs for luminance', () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg">' +
        '<circle cx="20" cy="20" r="10" fill="black"/>' +
        '</svg>';
      const result = analyzeSvg(svg);
      expect(result.confidence).toBe(1.0);
    });

    it('does not penalize multi-element SVGs with wide luminance spread', () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg">' +
        '<circle cx="20" cy="20" r="10" fill="black"/>' +
        '<circle cx="50" cy="20" r="10" fill="white"/>' +
        '</svg>';
      const result = analyzeSvg(svg);
      expect(result.warnings.some((w) => w.includes('similar luminance'))).toBe(
        false
      );
    });
  });

  describe('clip-path references', () => {
    it('flags clip-path as unsupported feature on multi-element SVGs', () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg">' +
        '<circle cx="20" cy="20" r="15" fill="black" clip-path="url(#c1)"/>' +
        '<circle cx="50" cy="20" r="15" fill="white"/>' +
        '</svg>';
      const result = analyzeSvg(svg);
      expect(result.unsupportedFeatures).toContain('clip-path references');
    });

    it('per-element warning on clipped element', () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg">' +
        '<circle cx="20" cy="20" r="15" fill="black" clip-path="url(#c1)"/>' +
        '</svg>';
      const result = analyzeSvg(svg);
      expect(
        result.elements[0].warnings.some((w) => w.includes('clip-path'))
      ).toBe(true);
    });
  });

  describe('needsPreparation backward compatibility', () => {
    it('returns true for smiley.svg via analyzeSvg delegation', () => {
      expect(needsPreparation(SMILEY_SVG)).toBe(true);
    });

    it('returns false for heart.svg via analyzeSvg delegation', () => {
      expect(needsPreparation(HEART_SVG)).toBe(false);
    });

    it('returns false for star.svg via analyzeSvg delegation', () => {
      expect(needsPreparation(STAR_SVG)).toBe(false);
    });

    it('returns false for empty string via analyzeSvg delegation', () => {
      expect(needsPreparation('')).toBe(false);
    });

    it('returns true for two filled elements', () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg">' +
        '<circle cx="10" cy="10" r="5" fill="black"/>' +
        '<circle cx="20" cy="20" r="5" fill="white"/>' +
        '</svg>';
      expect(needsPreparation(svg)).toBe(true);
    });

    it('needs preparation when stroked element accompanies a filled element', () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg">' +
        '<circle cx="10" cy="10" r="5" fill="black"/>' +
        '<line x1="0" y1="0" x2="10" y2="10" stroke="black" fill="none"/>' +
        '</svg>';
      expect(needsPreparation(svg)).toBe(true);
    });
  });

  describe('combined confidence penalties', () => {
    it('stacks penalties from gradients + transforms + similar luminance', () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg">' +
        '<defs><linearGradient id="g1"><stop offset="0" stop-color="red"/></linearGradient></defs>' +
        '<rect x="0" y="0" width="30" height="30" fill="url(#g1)" transform="rotate(10)"/>' +
        '<rect x="40" y="0" width="30" height="30" fill="#050505"/>' +
        '</svg>';
      const result = analyzeSvg(svg);
      // gradient (-0.2) + transform (-0.1) = at least -0.3
      expect(result.confidence).toBeLessThanOrEqual(0.7);
    });

    it('confidence never goes below 0', () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg">' +
        '<defs><linearGradient id="g1"><stop offset="0" stop-color="red"/></linearGradient></defs>' +
        '<rect x="0" y="0" width="30" height="30" fill="url(#g1)" transform="rotate(10)" clip-path="url(#x)"/>' +
        '<rect x="40" y="0" width="30" height="30" fill="url(#g1)" transform="scale(2)" clip-path="url(#y)"/>' +
        '</svg>';
      const result = analyzeSvg(svg);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
    });
  });
});

// ===========================================================================
// Phase 4 — applyPerPathOffsets
// ===========================================================================

describe('applyPerPathOffsets', () => {
  const SQUARE = 'M10,10 L90,10 L90,90 L10,90 Z';

  it('applies offset to elements with non-zero values', () => {
    const elements = [
      { pathData: SQUARE, role: 'foreground' },
      { pathData: SQUARE, role: 'hole' },
    ];
    const result = applyPerPathOffsets(elements, [5, 0]);

    expect(result[0].pathData).not.toBe(SQUARE);
    expect(result[0].pathData).toMatch(/^M/);
    expect(result[1].pathData).toBe(SQUARE);
  });

  it('skips elements with role "ignore" even with non-zero offset', () => {
    const elements = [{ pathData: SQUARE, role: 'ignore' }];
    const result = applyPerPathOffsets(elements, [5]);

    expect(result[0].pathData).toBe(SQUARE);
    expect(result[0].role).toBe('ignore');
  });

  it('returns elements unchanged when offsets array is empty', () => {
    const elements = [{ pathData: SQUARE, role: 'foreground' }];
    const result = applyPerPathOffsets(elements, []);

    expect(result).toBe(elements);
  });

  it('returns elements unchanged when offsets is null', () => {
    const elements = [{ pathData: SQUARE, role: 'foreground' }];
    const result = applyPerPathOffsets(elements, null);

    expect(result).toBe(elements);
  });

  it('returns elements unchanged when offsets is undefined', () => {
    const elements = [{ pathData: SQUARE, role: 'foreground' }];
    const result = applyPerPathOffsets(elements, undefined);

    expect(result).toBe(elements);
  });

  it('preserves non-pathData properties on offset elements', () => {
    const elements = [
      { pathData: SQUARE, role: 'foreground', fill: 'black', luminance: 0 },
    ];
    const result = applyPerPathOffsets(elements, [3]);

    expect(result[0].role).toBe('foreground');
    expect(result[0].fill).toBe('black');
    expect(result[0].luminance).toBe(0);
    expect(result[0].pathData).not.toBe(SQUARE);
  });

  it('applies offsets selectively per index', () => {
    const elements = [
      { pathData: SQUARE, role: 'foreground' },
      { pathData: SQUARE, role: 'foreground' },
      { pathData: SQUARE, role: 'foreground' },
    ];
    const result = applyPerPathOffsets(elements, [0, 5, 0]);

    expect(result[0].pathData).toBe(SQUARE);
    expect(result[1].pathData).not.toBe(SQUARE);
    expect(result[2].pathData).toBe(SQUARE);
  });

  it('handles offsets array shorter than elements (extra elements unchanged)', () => {
    const elements = [
      { pathData: SQUARE, role: 'foreground' },
      { pathData: SQUARE, role: 'foreground' },
    ];
    const result = applyPerPathOffsets(elements, [5]);

    expect(result[0].pathData).not.toBe(SQUARE);
    expect(result[1].pathData).toBe(SQUARE);
  });

  it('works with real classified elements from parseSvgElements', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
      '<circle cx="50" cy="50" r="40" fill="black"/>' +
      '<circle cx="50" cy="50" r="15" fill="white"/>' +
      '</svg>';
    const elements = parseSvgElements(svg);
    const classified = classifyElements(elements);
    const offsets = [2, 0];
    const result = applyPerPathOffsets(classified, offsets);

    expect(result[0].pathData).not.toBe(classified[0].pathData);
    expect(result[1].pathData).toBe(classified[1].pathData);
    expect(result[0].role).toBe('foreground');
    expect(result[1].role).toBe('hole');
  });
});

// ===========================================================================
// Overhaul — transform baking
// ===========================================================================

describe('transform baking in parseSvgElements', () => {
  /** Extract min/max x from a path d string's numeric pairs. */
  function pathBounds(d) {
    const nums = (d.match(/-?[\d.]+/g) || []).map(Number);
    const xs = nums.filter((_, i) => i % 2 === 0);
    const ys = nums.filter((_, i) => i % 2 === 1);
    return {
      xMin: Math.min(...xs),
      xMax: Math.max(...xs),
      yMin: Math.min(...ys),
      yMax: Math.max(...ys),
    };
  }

  it('bakes a translate() into the path coordinates', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg">' +
      '<rect x="0" y="0" width="10" height="10" fill="black" transform="translate(40,50)"/>' +
      '</svg>';
    const [el] = parseSvgElements(svg);
    const b = pathBounds(el.pathData);
    expect(b.xMin).toBeCloseTo(40, 0);
    expect(b.xMax).toBeCloseTo(50, 0);
    expect(b.yMin).toBeCloseTo(50, 0);
    expect(b.yMax).toBeCloseTo(60, 0);
  });

  it('bakes a rotate() about a point', () => {
    // 90° rotation about (10,10): corner (0,0) maps to (20,0)
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg">' +
      '<rect x="0" y="0" width="20" height="20" fill="black" transform="rotate(90 10 10)"/>' +
      '</svg>';
    const [el] = parseSvgElements(svg);
    const b = pathBounds(el.pathData);
    // Square rotated 90° about its center occupies the same bounds
    expect(b.xMin).toBeCloseTo(0, 0);
    expect(b.xMax).toBeCloseTo(20, 0);
  });

  it('bakes a matrix() transform', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg">' +
      '<rect x="0" y="0" width="10" height="10" fill="black" transform="matrix(2 0 0 2 5 5)"/>' +
      '</svg>';
    const [el] = parseSvgElements(svg);
    const b = pathBounds(el.pathData);
    expect(b.xMin).toBeCloseTo(5, 0);
    expect(b.xMax).toBeCloseTo(25, 0);
  });

  it('bakes nested <g> transforms outermost-first', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg">' +
      '<g transform="translate(100,0)">' +
      '<g transform="scale(2)">' +
      '<rect x="0" y="0" width="10" height="10" fill="black"/>' +
      '</g></g>' +
      '</svg>';
    const [el] = parseSvgElements(svg);
    const b = pathBounds(el.pathData);
    // scale(2) then translate(100,0): x ∈ [100, 120]
    expect(b.xMin).toBeCloseTo(100, 0);
    expect(b.xMax).toBeCloseTo(120, 0);
  });

  it('keeps original path data when the transform is unparseable', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg">' +
      '<rect x="0" y="0" width="10" height="10" fill="black" transform="bogus(3)"/>' +
      '</svg>';
    const [el] = parseSvgElements(svg);
    expect(el.transformBakeFailed).toBe(true);
    const b = pathBounds(el.pathData);
    expect(b.xMin).toBeCloseTo(0, 0);
    expect(b.xMax).toBeCloseTo(10, 0);
  });

  it('transformed shapes survive the full prepareSvg pipeline in place', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
      '<rect x="0" y="0" width="100" height="100" fill="black"/>' +
      '<circle cx="0" cy="0" r="10" fill="white" transform="translate(50,50)"/>' +
      '</svg>';
    const result = prepareSvg(svg);
    const dMatch = result.match(/d="([^"]+)"/);
    expect(dMatch).not.toBeNull();
    // The hole must be cut at (50,50), not at the origin
    const b = pathBounds(dMatch[1]);
    expect(b.xMin).toBeGreaterThanOrEqual(-1);
    const mCount = (dMatch[1].match(/M/g) || []).length;
    expect(mCount).toBe(2);
  });
});

// ===========================================================================
// Overhaul — style attribute fills and inheritance
// ===========================================================================

describe('getEffectivePaint / style fills', () => {
  it('reads fill from the style attribute', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg">' +
      '<circle cx="10" cy="10" r="5" style="fill:#ffffff"/>' +
      '</svg>';
    const [el] = parseSvgElements(svg);
    expect(el.fill).toBe('#ffffff');
    expect(el.luminance).toBeCloseTo(255, 0);
  });

  it('style attribute wins over the presentation attribute', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg">' +
      '<circle cx="10" cy="10" r="5" fill="black" style="fill: white"/>' +
      '</svg>';
    const [el] = parseSvgElements(svg);
    expect(el.fill).toBe('white');
  });

  it('inherits fill from an ancestor <g>', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg">' +
      '<g fill="white"><circle cx="10" cy="10" r="5"/></g>' +
      '</svg>';
    const [el] = parseSvgElements(svg);
    expect(el.fill).toBe('white');
  });

  it('inherits stroke from an ancestor style attribute', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg">' +
      '<g style="stroke: red"><line x1="0" y1="0" x2="10" y2="10" fill="none"/></g>' +
      '</svg>';
    const [el] = parseSvgElements(svg);
    expect(el.stroke).toBe('red');
  });

  it('classifies style-filled white shapes as holes', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg">' +
      '<circle cx="50" cy="50" r="40" fill="black"/>' +
      '<circle cx="50" cy="50" r="15" style="fill:#fff"/>' +
      '</svg>';
    const classified = classifyElements(parseSvgElements(svg));
    expect(classified[0].role).toBe('foreground');
    expect(classified[1].role).toBe('hole');
  });

  it('getEffectivePaint returns null when unset anywhere', () => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(
      '<svg xmlns="http://www.w3.org/2000/svg"><circle cx="1" cy="1" r="1"/></svg>',
      'image/svg+xml'
    );
    const circle = doc.querySelector('circle');
    expect(getEffectivePaint(circle, 'fill')).toBeNull();
    expect(getEffectivePaint(circle, 'stroke')).toBeNull();
  });
});

// ===========================================================================
// Overhaul — flatten hardening
// ===========================================================================

describe('flattenToCompoundPath hardening', () => {
  it('never throws on malformed path data and keeps valid geometry', () => {
    const classified = [
      { pathData: 'M10,10 L90,10 L90,90 L10,90 Z', role: 'foreground' },
      { pathData: 'not a path', role: 'foreground' },
      { pathData: 'M20,20 L40,20 L40,40 Z', role: 'foreground' },
    ];
    const warnings = [];
    const result = flattenToCompoundPath(
      classified,
      { viewBox: '0 0 100 100' },
      warnings
    );
    expect(result).toContain('<path');
    // The unmergeable shape is appended verbatim, not dropped
    expect(result).toContain('not a path');
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toMatch(/could not be merged/);
  });

  it('appends holes verbatim when the difference operation fails', () => {
    const classified = [
      { pathData: 'M10,10 L90,10 L90,90 L10,90 Z', role: 'foreground' },
      { pathData: 'garbage hole', role: 'hole' },
    ];
    const warnings = [];
    const result = flattenToCompoundPath(
      classified,
      { viewBox: '0 0 100 100' },
      warnings
    );
    expect(result).toContain('<path');
    expect(result).toContain('garbage hole');
  });

  it('keeps all pieces when a difference splits the foreground', () => {
    // A horizontal white bar cuts the black square into two pieces
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
      '<rect x="10" y="10" width="80" height="80" fill="black"/>' +
      '<rect x="0" y="45" width="100" height="10" fill="white"/>' +
      '</svg>';
    const result = prepareSvg(svg);
    const dMatch = result.match(/d="([^"]+)"/);
    expect(dMatch).not.toBeNull();
    const mCount = (dMatch[1].match(/M/g) || []).length;
    expect(mCount).toBeGreaterThanOrEqual(2);

    const nums = (dMatch[1].match(/-?[\d.]+/g) || []).map(Number);
    const ys = nums.filter((_, i) => i % 2 === 1);
    // Both the top piece (y≈10) and bottom piece (y≈90) must survive
    expect(Math.min(...ys)).toBeLessThan(20);
    expect(Math.max(...ys)).toBeGreaterThan(80);
  });

  it('music-note.svg flattens without throwing in the editor path', () => {
    const musicNote = readFileSync(join(SVG_DIR, 'music-note.svg'), 'utf-8');
    const elements = parseSvgElements(musicNote);
    const classified = classifyElements(elements);
    const warnings = [];
    let result;
    expect(() => {
      result = flattenToCompoundPath(
        classified,
        { viewBox: '0 0 100 100' },
        warnings
      );
    }).not.toThrow();
    expect(result).toContain('<path');
    // All three shapes must be present in the output
    const dMatch = result.match(/d="([^"]+)"/);
    const mCount = (dMatch[1].match(/M/g) || []).length;
    expect(mCount).toBeGreaterThanOrEqual(2);
  });
});

describe('measureSvgAspect', () => {
  it('measures a single rect (width / height)', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300">' +
      '<rect x="10" y="20" width="200" height="100" fill="black"/></svg>';
    expect(measureSvgAspect(svg)).toBeCloseTo(2, 4);
  });

  it('measures a tall path as below 1', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300">' +
      '<path d="M0,0 L50,0 L50,200 L0,200 Z" fill="black"/></svg>';
    expect(measureSvgAspect(svg)).toBeCloseTo(0.25, 4);
  });

  it('unites the boxes of separate shapes', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
      '<rect x="0" y="0" width="10" height="10" fill="black"/>' +
      '<rect x="40" y="0" width="10" height="10" fill="black"/></svg>';
    expect(measureSvgAspect(svg)).toBeCloseTo(5, 4);
  });

  it('bakes transforms before measuring', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300">' +
      '<rect x="0" y="0" width="100" height="100" transform="scale(2,1)" fill="black"/></svg>';
    expect(measureSvgAspect(svg)).toBeCloseTo(2, 4);
  });

  it('ignores shapes inside defs', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
      '<defs><rect x="0" y="0" width="100" height="1" fill="black"/></defs>' +
      '<rect x="0" y="0" width="10" height="20" fill="black"/></svg>';
    expect(measureSvgAspect(svg)).toBeCloseTo(0.5, 4);
  });

  it('returns null when there is nothing to measure', () => {
    expect(
      measureSvgAspect('<svg xmlns="http://www.w3.org/2000/svg"/>')
    ).toBeNull();
    expect(measureSvgAspect('not svg at all')).toBeNull();
  });

  it('measures a real library file to a finite positive ratio', () => {
    const aspect = measureSvgAspect(HEART_SVG);
    expect(aspect).toBeGreaterThan(0.2);
    expect(aspect).toBeLessThan(5);
  });
});

/**
 * DP-37 P3: the flatten budget signed at DP-Q33 (2026-09-13), which retires
 * DP-Q9's 50 and 200 counts and keeps its 1,000 as a LIST cap.
 *
 * The values are pinned as VALUES, not as "whatever the constant says",
 * because they are an owner signature against a measured bench and drifting
 * them silently is the whole risk. What changed is the unit: a count could
 * not carry this decision, because MEASURED with the ring engine the same
 * 200 shapes cost 77 ms as rectangles and 593 ms as curves.
 */
describe('the flatten budget (DP-Q33)', () => {
  /** N filled rects, every 5th one a smaller white one nested in the last. */
  const syntheticSvg = (n) => {
    const parts = [];
    for (let i = 0; i < n; i++) {
      const x = (i % 20) * 24 + 2;
      const y = Math.floor(i / 20) * 24 + 2;
      parts.push(
        i % 5 === 4
          ? `<rect x="${x - 18}" y="${y + 6}" width="8" height="8" fill="#ffffff"/>`
          : `<rect x="${x}" y="${y}" width="20" height="20" fill="#111111"/>`
      );
    }
    const h = Math.ceil(n / 20) * 24 + 4;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 484 ${h}">${parts.join('')}</svg>`;
  };

  it('carries the signed values', () => {
    expect(FLATTEN_BUDGET_MS).toBe(300);
    expect(SHAPE_LIST_CAP).toBe(1000);
  });

  it.each([
    [1, false],
    [1000, false],
    [1001, true],
    [831, false],
  ])('isOverListCap(%i) is %s', (count, expected) => {
    expect(isOverListCap(count)).toBe(expected);
  });

  /**
   * The predictor against the bench that produced it.
   *
   * MEASURED 2026-09-14, desktop Node, median of three, against the ring
   * engine that ships. Each row is (shapes, ring points, real flatten), and
   * what is checked is that the prediction lands within the spread the
   * constant was chosen from, not that it hits a number, which it cannot:
   * the cost per (shape x point) spans five-fold between classes of drawing,
   * which is exactly why DP-Q33 signed a calibration as well.
   */
  it.each([
    ['100 rects', 100, 400, 23.8],
    ['800 rects', 800, 3200, 961.9],
    ['50 curvy', 50, 3200, 44.9],
    ['400 curvy', 400, 25600, 2551.1],
    ['100 lobed', 100, 19200, 708.9],
    ['400 lobed', 400, 76800, 13030.9],
    ['100 complex', 100, 64000, 6960.4],
  ])(
    'predicts %s within the measured spread',
    (_label, shapes, points, realMs) => {
      const predicted = predictFlattenMs(shapes, points);
      // Never UNDER: the default constant is the high end on purpose, so a
      // drawing is never let through the gate having been called cheaper
      // than it turns out to be.
      expect(predicted).toBeGreaterThanOrEqual(realMs);
      // And never wild: six and a half times is the whole spread of the bench.
      expect(predicted).toBeLessThan(realMs * 6.5);
    }
  );

  it('the prepped icons predict close to what they really cost', () => {
    // Read in place from the owner's own folder when the bench ran; only the
    // three numbers came back. activities: 9 shapes, 2,800 ring points,
    // 36.7 ms. Bathroom: 7 shapes, 863 points, 7.4 ms. Real artwork sits at
    // the high end of the constant, which is why the default is set there.
    expect(predictFlattenMs(9, 2800)).toBeCloseTo(37.8, 0);
    expect(predictFlattenMs(7, 863)).toBeCloseTo(9.1, 0);
  });

  it('a drawing with nothing in it predicts nothing, and never NaN', () => {
    expect(predictFlattenMs(0, 0)).toBe(0);
    expect(predictFlattenMs(10, 0)).toBe(0);
    expect(predictFlattenMs(0, 500)).toBe(0);
    expect(predictFlattenMs(NaN, NaN)).toBe(0);
  });

  it('calibration replaces the default with what a real flatten proved', () => {
    // 400 curvy shapes, 25,600 points, 2,551.1 ms measured -> 2.49e-4, which
    // is a sixth of the default. The next drawing of the same kind is then
    // predicted on the machine it is actually running on.
    const cost = flattenCostFrom(400, 25600, 2551.1);
    expect(cost).toBeCloseTo(2.49e-4, 6);
    expect(predictFlattenMs(400, 25600, cost)).toBeCloseTo(2551.1, 0);
  });

  it('refuses to calibrate on a flatten too small to have measured anything', () => {
    // Three squares combine in a fifth of a millisecond. That number is the
    // clock, not the drawing, and learning from it would teach the app that
    // everything is free.
    expect(flattenCostFrom(3, 12, 0.2)).toBeNull();
    expect(
      flattenCostFrom(3, 12, FLATTEN_CALIBRATION_FLOOR_MS - 0.01)
    ).toBeNull();
    expect(flattenCostFrom(3, 12, FLATTEN_CALIBRATION_FLOOR_MS)).not.toBeNull();
    expect(flattenCostFrom(0, 0, 500)).toBeNull();
  });

  it('ring points are estimated from the d string, and match the real rings', () => {
    // The cost bench's own row: 50 synthetic rects are 200 ring points, 4 each.
    expect(estimateRingPoints('M2 2 H38 V38 H2 Z')).toBe(4);
    // One command letter can carry many coordinate groups. Counting letters
    // undercounted the prepped icons by 40 to 46 per cent; counting groups
    // brought the same two to 0.1 and 0.8 per cent.
    expect(estimateRingPoints('M0 0c1 2 3 4 5 6 7 8 9 10 11 12')).toBe(33);
    expect(estimateRingPoints('')).toBe(0);
    expect(estimateRingPoints(null)).toBe(0);
  });

  it('analyzeSvg reports what it will cost to combine', () => {
    const result = analyzeSvg(syntheticSvg(100));
    expect(result.elementCount).toBe(100);
    expect(result.ringPoints).toBe(400);
    expect(result.predictedFlattenMs).toBeCloseTo(
      predictFlattenMs(100, 400),
      6
    );
  });

  it('RETURNS THE TABLE right up to the cap, instead of an empty refusal', () => {
    // The old behaviour returned elements: [] for anything over 50, which is
    // the exact inverse of being able to delete elements down to usable.
    for (const count of [51, 200, 201, 600]) {
      const result = analyzeSvg(syntheticSvg(count));
      expect(result.elements.length, `${count} elements`).toBe(count);
      expect(result.status, `${count} elements`).not.toBe('too_complex');
    }
  });

  it('refuses above the cap, naming the real count and the cap', () => {
    const result = analyzeSvg(syntheticSvg(1001));
    expect(result.status).toBe('too_complex');
    expect(result.recommendation).toBe('reject');
    expect(result.elements).toEqual([]);
    expect(result.elementCount).toBe(1001);
    expect(result.warnings[0]).toContain('1001');
    expect(result.warnings[0]).toContain('1000');
  });

  it('never auto-prepares over the budget, because that would start the boolean', () => {
    // No drawing whose combine is predicted to outrun the budget may set it
    // running without a deliberate act. These rects are 4 ring points each,
    // so the prediction is 6e-3 x count squared and the budget falls between
    // 223 and 224 of them.
    for (const count of [400, 600]) {
      const result = analyzeSvg(syntheticSvg(count));
      expect(result.predictedFlattenMs, count + ' elements').toBeGreaterThan(
        FLATTEN_BUDGET_MS
      );
    }
    for (const count of [400, 600]) {
      const result = analyzeSvg(syntheticSvg(count));
      expect(result.recommendation, `${count} elements`).not.toBe(
        'auto_prepare'
      );
    }
  });

  it('the counts DP-Q9 refused are cheap, which is why they retired', () => {
    // 51 of these rects were refused the automatic combine for being 51. They
    // are 204 ring points between them and the combine is predicted at under
    // 16 ms - MEASURED, 100 rects of this kind flatten in 23.8 ms. A count
    // was answering the question in the wrong unit, and this is the drawing
    // that shows it.
    const small = analyzeSvg(syntheticSvg(51));
    expect(small.predictedFlattenMs).toBeLessThan(FLATTEN_BUDGET_MS);
    const was200 = analyzeSvg(syntheticSvg(200));
    expect(was200.predictedFlattenMs).toBeLessThan(FLATTEN_BUDGET_MS);
  });

  it('leaves pass_through alone whatever the prediction: it costs no boolean at all', () => {
    // All-foreground shapes need no flattening - OpenSCAD unions them - so
    // sending them to the editor for their size would be a made-up cost.
    const manyDark = Array.from(
      { length: 300 },
      (_, i) =>
        `<rect x="${(i % 20) * 24}" y="${Math.floor(i / 20) * 24}" width="20" height="20" fill="#111111"/>`
    ).join('');
    const result = analyzeSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 484 400">${manyDark}</svg>`
    );
    expect(result.elementCount).toBe(300);
    expect(result.predictedFlattenMs).toBeGreaterThan(FLATTEN_BUDGET_MS);
    expect(result.recommendation).toBe('pass_through');
  });
});

/**
 * D-118: paint declared in a <style> block by class.
 *
 * Every CAD and Illustrator export writes paint this way. Before this fix the
 * parser saw no fill at all, assumed the SVG default black, and turned a
 * stroke-only line drawing into a page of solid shapes - which is why the
 * owner's own artwork came out of the stencil as one hole.
 */
describe('paint declared in a <style> block (D-118)', () => {
  const strokeOnly = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <defs><style>
      .cls-1, .cls-2 { fill: none; stroke: #000; stroke-width: .5px; }
    </style></defs>
    <circle class="cls-2" cx="50" cy="50" r="40"/>
    <path class="cls-1" d="M10,50 L90,50"/>
  </svg>`;

  it('reads fill and stroke from a class rule', () => {
    const els = parseSvgElements(strokeOnly);
    expect(els.length).toBe(2);
    for (const el of els) {
      expect(el.fill).toBe('none');
      expect(el.stroke).toBe('#000');
    }
  });

  it('no longer assumes black fill for a stroke-only drawing', () => {
    // The defect in one assertion: these used to classify as foreground with
    // zero stroke conversions, i.e. as solid black shapes.
    const classified = classifyElements(parseSvgElements(strokeOnly));
    expect(classified.every((c) => c.strokeConverted)).toBe(true);
  });

  it('the style ATTRIBUTE still outranks a class rule', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><defs><style>
      .a { fill: #ff0000 }
    </style></defs><rect class="a" style="fill:#00ff00" width="10" height="10"/></svg>`;
    const el = parseSvgElements(svg)[0];
    expect(el.fill).toBe('#00ff00');
  });

  it('a class rule outranks a presentation attribute', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><defs><style>
      .a { fill: #ff0000 }
    </style></defs><rect class="a" fill="#00ff00" width="10" height="10"/></svg>`;
    const el = parseSvgElements(svg)[0];
    expect(el.fill).toBe('#ff0000');
  });

  it('an id rule outranks a class rule, and a class rule a type rule', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><defs><style>
      rect { fill: #0000ff }
      .a { fill: #00ff00 }
      #mine { fill: #ff0000 }
    </style></defs><rect id="mine" class="a" width="10" height="10"/></svg>`;
    expect(parseSvgElements(svg)[0].fill).toBe('#ff0000');
  });

  it('a commented-out rule is not read as live', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><defs><style>
      /* .a { fill: none } */
      .a { fill: #123456 }
    </style></defs><rect class="a" width="10" height="10"/></svg>`;
    expect(parseSvgElements(svg)[0].fill).toBe('#123456');
  });

  it('skips selectors it does not fully understand rather than guessing', () => {
    // A wrong answer here silently changes geometry, so a descendant
    // combinator is left alone and the presentation attribute stands.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><defs><style>
      g .a { fill: #ff0000 }
    </style></defs><g><rect class="a" fill="#00ff00" width="10" height="10"/></g></svg>`;
    expect(parseSvgElements(svg)[0].fill).toBe('#00ff00');
  });

  it('a class rule on an ancestor group is inherited', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><defs><style>
      .wrap { fill: #ff0000 }
    </style></defs><g class="wrap"><rect width="10" height="10"/></g></svg>`;
    expect(parseSvgElements(svg)[0].fill).toBe('#ff0000');
  });

  it('leaves an SVG with no <style> block exactly as it was', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg"><rect fill="#abcdef" width="10" height="10"/></svg>';
    expect(parseSvgElements(svg)[0].fill).toBe('#abcdef');
  });
});

// ── DP-7 P3: per-layer emission ──────────────────────────────────────────────

describe('flattenLayers - the stacked-mask law', () => {
  /** The `d` string out of an emitted layer SVG. */
  const dOf = (svg) => svg.match(/ d="([^"]*)"/)[1];

  /** Bounds of an emitted layer, in user units. */
  function boundsOfLayer(svg) {
    const { points } = polygonFromPathData(dOf(svg));
    return boundsOf(points);
  }

  /** The DP-0 probe's own three squares, as one design. */
  const PROBE_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="40mm" height="40mm" ' +
    'viewBox="0 0 40 40">' +
    '<path d="M2 2 H38 V38 H2 Z" fill="#000"/>' +
    '<path d="M10 10 H30 V30 H10 Z" fill="#000"/>' +
    '<path d="M16 16 H24 V24 H16 Z" fill="#000"/></svg>';
  const PROBE_META = { viewBox: '0 0 40 40', width: '40mm', height: '40mm' };

  function emitProbe() {
    const els = classifyElements(parseSvgElements(PROBE_SVG));
    const tree = buildNestingTree(els);
    return flattenLayers(
      els,
      suggestLayers(tree),
      layerLimit(tree),
      PROBE_META
    );
  }

  it('reproduces the DP-0 probe, layer for layer', () => {
    // The probe stack was built and manifold-checked before this code existed.
    // Its layer files hold one square each; the stacked-mask law unions each
    // layer with everything deeper, and because the squares are NESTED that
    // union collapses back to the enclosing square. Same geometry, arrived at
    // by the law rather than by hand.
    const out = emitProbe();
    expect(out).toHaveLength(3);
    expect(boundsOfLayer(out[0])).toEqual({
      minX: 2,
      minY: 2,
      maxX: 38,
      maxY: 38,
    });
    expect(boundsOfLayer(out[1])).toEqual({
      minX: 10,
      minY: 10,
      maxX: 30,
      maxY: 30,
    });
    expect(boundsOfLayer(out[2])).toEqual({
      minX: 16,
      minY: 16,
      maxX: 24,
      maxY: 24,
    });
  });

  it('puts every layer on ONE normalized canvas, sized from layer 1', () => {
    // Three imports have to land in the same place at their true relative
    // sizes. OpenSCAD's resize() fits the CONTENT box, so fitting each layer
    // separately would scale the innermost square up to the outermost's size.
    // Instead every layer carries the SAME transform, computed from layer 1.
    const out = emitProbe();
    const transforms = out.map((s) => /<g transform="([^"]*)"/.exec(s)[1]);
    expect(new Set(transforms).size).toBe(1);

    for (const svg of out) {
      // The unit is written: a width with no unit is PIXELS, converted at
      // 72 dpi, and a 100-wide document came back 35.28 mm.
      expect(svg).toContain('width="100mm"');
      expect(svg).toContain('viewBox="0 0 100 100"');
      expect(svg).toContain('fill-rule="evenodd"');
      // minY is zero on purpose: OpenSCAD maps y as (height - minY) - y, so a
      // negative minY would shift the import by twice itself.
      expect(svg).toMatch(/viewBox="0 0 /);
    }
  });

  it('normalizes layer 1 to exactly the canvas span', () => {
    const svg = emitProbe()[0];
    const m = /translate\(([-\d.]+),([-\d.]+)\) scale\(([\d.]+)\)/.exec(svg);
    expect(m).toBeTruthy();
    const scale = parseFloat(m[3]);
    // The probe's outer square is 36 units wide and the canvas is 100.
    expect(scale).toBeCloseTo(100 / 36, 6);
    // translate puts the design's own minimum corner on the origin.
    expect(parseFloat(m[1])).toBeCloseTo(-scale * 2, 6);
  });

  it('a non-square design gets a canvas of its own aspect', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50">' +
      '<path d="M0 0 H80 V20 H0 Z" fill="#000"/></svg>';
    const els = classifyElements(parseSvgElements(svg));
    const out = flattenLayers(els, [1], 1, { viewBox: '0 0 100 50' });
    // 80 wide by 20 tall becomes 100 by 25.
    expect(out[0]).toContain('viewBox="0 0 100 25"');
    expect(out[0]).toContain('height="25mm"');
  });

  it('a single-shape layer passes through byte for byte', () => {
    // Nothing to union, so nothing is rewritten - the innermost layer is the
    // probe's own d string, character for character.
    expect(dOf(emitProbe()[2])).toBe('M16 16 H24 V24 H16 Z');
  });

  it('STACKS: a shallower layer carries the deeper ones too', () => {
    // The nested fixture cannot show this, because a union of nested squares
    // collapses to the outer one either way. Two shapes side by side can:
    // layer 1 must span BOTH, layer 2 only the second. (The assignment breaks
    // the containment law on purpose - the emitter's job is to emit, and the
    // law is enforced in the editor where a person can act on it.)
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 20">' +
      '<path d="M0 0 H10 V10 H0 Z" fill="#000"/>' +
      '<path d="M50 0 H60 V10 H50 Z" fill="#000"/></svg>';
    const els = classifyElements(parseSvgElements(svg));
    const out = flattenLayers(els, [1, 2], 2, { viewBox: '0 0 100 20' });

    expect(boundsOfLayer(out[0]).maxX).toBe(60);
    expect(boundsOfLayer(out[0]).minX).toBe(0);
    expect(boundsOfLayer(out[1]).minX).toBe(50);
    expect(boundsOfLayer(out[1]).maxX).toBe(60);
  });

  it('emits nothing for a layer no shape reached', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">' +
      '<path d="M0 0 H10 V10 H0 Z" fill="#000"/></svg>';
    const els = classifyElements(parseSvgElements(svg));
    const out = flattenLayers(els, [1], 3, { viewBox: '0 0 20 20' });
    expect(out).toHaveLength(3);
    expect(out[0]).toBeTruthy();
    expect(out[1]).toBeNull();
    expect(out[2]).toBeNull();
  });

  it('never writes a fourth file', () => {
    const els = classifyElements(parseSvgElements(PROBE_SVG));
    expect(flattenLayers(els, [1, 2, 3], 9, PROBE_META)).toHaveLength(
      LAYER_EMIT_CAP
    );
    expect(LAYER_EMIT_CAP).toBe(3);
  });

  it('keeps a hole cut on every layer it appears in', () => {
    // A counter that closed over as the stack rose would fill in the middle
    // of a letter at the second pass.
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">' +
      '<path d="M0 0 H40 V40 H0 Z" fill="#000"/>' +
      '<path d="M10 10 H30 V30 H10 Z" fill="#fff"/></svg>';
    const els = classifyElements(parseSvgElements(svg));
    expect(els.map((e) => e.role)).toEqual(['foreground', 'hole']);
    const out = flattenLayers(els, [1, 1], 2, { viewBox: '0 0 40 40' });
    // Both subpaths survive into the layer: the outer region and its hole.
    expect(dOf(out[0]).match(/M/gi).length).toBeGreaterThanOrEqual(2);
  });

  it('survives nonsense arguments rather than throwing at the caller', () => {
    expect(flattenLayers(null, [1], 3)).toEqual([]);
    expect(flattenLayers([], null, 3)).toEqual([]);
    expect(flattenLayers([], [], 0)).toEqual([]);
  });

  it('treats a missing assignment as layer 1', () => {
    const els = classifyElements(parseSvgElements(PROBE_SVG));
    const out = flattenLayers(els, [], 2, PROBE_META);
    // Everything defaulted to layer 1, so layer 2 has nothing to build.
    expect(out[0]).toBeTruthy();
    expect(out[1]).toBeNull();
  });
});

describe('countTracedShapes (DP-43)', () => {
  // ★ The number a person hears after a conversion has to be the number the
  // editor lists beside it. Counting <path> elements did not: imagetracerjs
  // folds a shape's holes into that shape's element, and Potrace returns the
  // whole drawing as one. Both engines' output is checked here, against
  // analyzeSvg - the thing the editor's own table is built from.
  const analysed = (svg) => (analyzeSvg(svg).elements || []).length;

  it('agrees with the analyser on a drawing with holes in one element', () => {
    // imagetracerjs's shape: one element, its hole folded in as a subpath.
    const svg =
      '<svg width="10" height="10" xmlns="http://www.w3.org/2000/svg">' +
      '<path fill="rgb(0,0,0)" d="M0 0L8 0L8 8L0 8ZM2 2L6 2L6 6L2 6Z"/>' +
      '</svg>';
    expect(countTracedShapes(svg)).toBe(2);
    expect(countTracedShapes(svg)).toBe(analysed(svg));
  });

  it('agrees on a drawing that is all one compound path', () => {
    // Potrace's shape: every closed shape in a single element, even-odd.
    const svg =
      '<svg width="10" height="10" xmlns="http://www.w3.org/2000/svg">' +
      '<path fill="rgb(0,0,0)" fill-rule="evenodd" ' +
      'd="M0 0L4 0L4 4L0 4ZM1 1L3 1L3 3L1 3ZM6 6L9 6L9 9L6 9Z"/>' +
      '</svg>';
    expect(countTracedShapes(svg)).toBe(3);
    expect(countTracedShapes(svg)).toBe(analysed(svg));
  });

  it('agrees on separate elements, the way it always did', () => {
    const svg =
      '<svg width="10" height="10" xmlns="http://www.w3.org/2000/svg">' +
      '<path fill="rgb(0,0,0)" d="M0 0L4 0L4 4Z"/>' +
      '<path fill="rgb(0,0,0)" d="M6 6L9 6L9 9Z"/>' +
      '</svg>';
    expect(countTracedShapes(svg)).toBe(2);
    expect(countTracedShapes(svg)).toBe(analysed(svg));
  });

  it('counts relative moves too, because a tracer may write either', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M0 0L4 0Zm6 6l3 0Z"/></svg>';
    expect(countTracedShapes(svg)).toBe(2);
  });

  it('says nothing about a picture with nothing in it', () => {
    expect(countTracedShapes('<svg xmlns="http://www.w3.org/2000/svg"/>')).toBe(0);
    expect(countTracedShapes('')).toBe(0);
    expect(countTracedShapes(null)).toBe(0);
  });

  it('does not mistake an M elsewhere in the document for a shape', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg">' +
      '<desc>Made by M. Someone</desc>' +
      '<path id="MMM" fill="#000" d="M0 0L1 0Z"/></svg>';
    expect(countTracedShapes(svg)).toBe(1);
  });
});


// ── D-137: what the Colours mode's wall becomes on a charm (DP-48 P1) ────────
//
// The owner's walk: a white logo on a navy ground came back as a black plate
// with the logo cut out of it. The separation had marked the navy
// data-background="true" and nothing read it; luminance alone decided, so the
// dark wall was "Raised" and the light lettering was "Hole".
//
// The rule is signed (DP-Q53): the wall is left out, a patch of wall enclosed
// by artwork is a hole, and every other color is raised.

/** A drawing shaped exactly as `separateColours` writes one. */
function separationSvg({ wallColor = '#4b2e83', inkColor = '#ffffff' } = {}) {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">' +
    // The wall: the whole canvas, and a counter inside the ring below.
    `<path fill="${wallColor}" fill-rule="evenodd" data-colour="${wallColor}" ` +
    'data-colour-name="Navy blue" data-background="true" ' +
    'd="M0 0 L100 0 L100 100 L0 100 Z"/>' +
    `<path fill="${wallColor}" fill-rule="evenodd" data-colour="${wallColor}" ` +
    'data-colour-name="Navy blue" data-background="true" ' +
    'd="M40 40 L60 40 L60 60 L40 60 Z"/>' +
    // The artwork: a light ring around that counter.
    `<path fill="${inkColor}" fill-rule="evenodd" data-colour="${inkColor}" ` +
    'data-colour-name="White" d="M30 30 L70 30 L70 70 L30 70 Z"/>' +
    '</svg>'
  );
}

/** A drawing shaped as the nine icons separate: ONE color, and it is "the wall". */
function oneColourSeparationSvg() {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">' +
    '<path fill="#000000" fill-rule="evenodd" data-colour="#000000" ' +
    'data-colour-name="Black" data-background="true" d="M10 10 L50 10 L50 50 L10 50 Z"/>' +
    '<path fill="#000000" fill-rule="evenodd" data-colour="#000000" ' +
    'data-colour-name="Black" data-background="true" d="M60 60 L90 60 L90 90 L60 90 Z"/>' +
    '</svg>'
  );
}

describe('the wall on a charm (D-137, DP-Q53)', () => {
  it('leaves the wall out, cuts the counter, raises the artwork', () => {
    const analysis = analyzeSvg(separationSvg());
    const roles = analysis.elements.map((el) => el.autoRole);
    // The canvas-sized wall path, the wall patch inside the ring, the ring.
    expect(roles).toEqual(['ignore', 'hole', 'foreground']);
  });

  it('raises light artwork that luminance alone would have cut', () => {
    // The whole defect in one assertion: white on navy. Before the rule, the
    // white ring was a hole (luminance 255) and the navy wall was raised.
    const analysis = analyzeSvg(separationSvg());
    const ring = analysis.elements[2];
    expect(ring.fill.toLowerCase()).toBe('#ffffff');
    expect(ring.autoRole).toBe('foreground');
  });

  it('★ does NOTHING when the only color IS the wall (the nine icons)', () => {
    // DP-48 P0, measured on all nine: a one-color drawing has the ARTWORK
    // flagged as the background, because pickBackground returns index 0 when
    // nothing polls better. A rule that fired here would empty them.
    const analysis = analyzeSvg(oneColourSeparationSvg());
    expect(analysis.elements.map((el) => el.autoRole)).toEqual([
      'foreground',
      'foreground',
    ]);
    expect(wallRoleOverrides(parseSvgElements(oneColourSeparationSvg()))).toEqual(
      {}
    );
  });

  it('★ keeps a wall path whole: its inner rings are ITS holes, not shapes', () => {
    // The bug this guard exists for, found by LOOKING at the render: a traced
    // region is one path whose inner rings are its holes, and the navy wall's
    // inner rings ARE the letters. Deciding ring by ring made those letter
    // rings "Hole", and the lettering came out drawn in outline. A path's
    // outermost ring says where the path sits and every ring of it follows.
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">' +
      // One wall path: the canvas, with a letter-shaped ring cut out of it.
      '<path fill="#4b2e83" fill-rule="evenodd" data-colour="#4b2e83" ' +
      'data-colour-name="Navy blue" data-background="true" ' +
      'd="M0 0 L100 0 L100 100 L0 100 Z M20 20 L80 20 L80 80 L20 80 Z"/>' +
      // The artwork that stands in that hole.
      '<path fill="#ffffff" fill-rule="evenodd" data-colour="#ffffff" ' +
      'data-colour-name="White" d="M20 20 L80 20 L80 80 L20 80 Z"/>' +
      '</svg>';
    const analysis = analyzeSvg(svg);
    // D-159 went one step further: a traced region is ONE row, its outer
    // ring, so the letter-shaped hole in the wall is not a row at all. Two
    // rows: the canvas and the letter.
    expect(analysis.elements).toHaveLength(2);
    const roles = analysis.elements.map((el) => el.autoRole);
    expect(roles[0]).toBe('ignore');
    expect(roles[1]).toBe('foreground');
    expect(
      (analysis.elements[0].pathData.match(/M/g) || []).length,
      'a hole in the wall must not become a shape'
    ).toBe(1);
  });

  it('leaves an ordinary drawing exactly as it was', () => {
    const plain =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
      '<path fill="#000" d="M0 0 L100 0 L100 100 L0 100 Z"/>' +
      '<path fill="#fff" d="M40 40 L60 40 L60 60 L40 60 Z"/></svg>';
    expect(wallRoleOverrides(parseSvgElements(plain))).toEqual({});
    const analysis = analyzeSvg(plain);
    // Luminance still decides: the black square is raised, the white one is
    // a hole. No drawing without the separation's attributes changes at all.
    expect(analysis.elements.map((el) => el.autoRole)).toEqual([
      'foreground',
      'hole',
    ]);
  });
});

describe('the shape cap refusal (DP-78, D-172)', () => {
  it('names the count and the cap with thousands separators, and what a charm host can try', () => {
    expect(shapeCapRefusal(3939)).toEqual({
      badge: 'Too many shapes to work with (3,939)',
      sentence:
        'This picture traced into 3,939 shapes, and the editor can work with 1,000 at a time. ' +
        'Try Solid shape, fewer colors, or a closer crop, then Convert again.',
    });
  });

  it('the door gets the crop alone: it has no Convert again, and no mode to choose before its editor is open', () => {
    expect(shapeCapRefusal(1270, 'door').sentence).toBe(
      'This picture traced into 1,270 shapes, and the editor can work with 1,000 at a time. ' +
        'Try a closer crop of the picture.'
    );
  });

  it('the cap in the sentence is SHAPE_LIST_CAP, not a number written twice', () => {
    expect(shapeCapRefusal(5).sentence).toContain(
      `${SHAPE_LIST_CAP.toLocaleString('en-US')} at a time`
    );
  });
});

describe('parseSvgElementsAsync: the parse in slices (DP-78 P3, D-171)', () => {
  // DOM elements from two parses are two objects; everything else must agree.
  const comparable = (list) =>
    list.map(({ element, ...rest }) => ({ ...rest, tag: element.tagName }));
  // A drawn compound path: nested rings under even-odd, and a stray one.
  const drawnRings =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
    '<path fill="#000" fill-rule="evenodd" d="M0 0 L100 0 L100 100 L0 100 Z ' +
    'M20 20 L80 20 L80 80 L20 80 Z M40 40 L60 40 L60 60 L40 60 Z ' +
    'M5 90 L10 90 L10 95 L5 95 Z"/></svg>';
  // Two traced regions, one with a hole folded in (D-159).
  const colourRegions =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
    '<path fill="#fff" data-colour="#ffffff" d="M0 0 L100 0 L100 100 L0 100 Z ' +
    'M20 20 L80 20 L80 80 L20 80 Z"/>' +
    '<path fill="#000" data-colour="#000000" d="M30 30 L70 30 L70 70 L30 70 Z"/>' +
    '</svg>';
  // Shapes under a transform, and a stroke-only one.
  const transformed =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
    '<g transform="translate(10 10)"><rect x="0" y="0" width="20" height="20"/>' +
    '<circle cx="50" cy="50" r="10" fill="#fff"/>' +
    '<path d="M0 90 L90 90" fill="none" stroke="#000"/></g></svg>';

  it('★ returns what parseSvgElements returns: rings, traced regions, transforms, the smiley, the separation', async () => {
    for (const svg of [
      drawnRings,
      colourRegions,
      transformed,
      SMILEY_SVG,
      separationSvg(),
    ]) {
      const whole = parseSvgElements(svg);
      const sliced = await parseSvgElementsAsync(svg, { every: 1 });
      expect(comparable(sliced)).toEqual(comparable(whole));
      expect(sliced.length).toBe(whole.length);
    }
  });

  it('checkpoints between elements, and between the rings of one compound path', async () => {
    // One element, four rings, slices of two: once while the rings are
    // measured (before the third) and once while they are judged.
    const inside = vi.fn(async () => {});
    await parseSvgElementsAsync(drawnRings, { checkpoint: inside, every: 2 });
    expect(inside).toHaveBeenCalledTimes(2);
    // Three single-ring elements, slices of one: before the second and the
    // third; no ring pass for a single ring.
    const between = vi.fn(async () => {});
    await parseSvgElementsAsync(transformed, { checkpoint: between, every: 1 });
    expect(between).toHaveBeenCalledTimes(2);
  });

  it('a text that is not an SVG parses to nothing, both ways', async () => {
    expect(await parseSvgElementsAsync('<html></html>')).toEqual([]);
    expect(parseSvgElements('<html></html>')).toEqual([]);
  });

  it('a Cancel thrown by the checkpoint ends the parse', async () => {
    await expect(
      parseSvgElementsAsync(drawnRings, {
        every: 1,
        checkpoint: async () => {
          throw new Error('stopped');
        },
      })
    ).rejects.toThrow('stopped');
  });
});

describe('analyzeSvgAsync: the analysis in slices (DP-78 P3, D-171)', () => {
  // DOM elements from two parses are two objects; everything else must agree.
  const comparable = (analysis) => ({
    ...analysis,
    elements: (analysis.elements || []).map(({ element, ...rest }) => ({
      ...rest,
      tag: element ? element.tagName : null,
    })),
  });
  const dark =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
    '<path fill="#000" d="M0 0 L100 0 L100 100 L0 100 Z"/>' +
    '<path fill="#222" d="M40 40 L60 40 L60 60 L40 60 Z"/></svg>';
  const plain =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
    '<path fill="#000" d="M0 0 L100 0 L100 100 L0 100 Z"/>' +
    '<path fill="#fff" d="M40 40 L60 40 L60 60 L40 60 Z"/></svg>';

  it('★ returns what analyzeSvg returns: the smiley, the separation, a plain drawing, a dark one', async () => {
    for (const svg of [SMILEY_SVG, separationSvg(), plain, dark]) {
      const whole = analyzeSvg(svg);
      const sliced = await analyzeSvgAsync(svg);
      expect(comparable(sliced)).toEqual(comparable(whole));
    }
  });

  it('checkpoints after the parse and after the tree, and carries the tree it built', async () => {
    const checkpoint = vi.fn(async () => {});
    const analysis = await analyzeSvgAsync(separationSvg(), { checkpoint });
    // A wall and something else: the tree is built (three elements, one
    // slice of it), and the analysis carries it for the editor's opening.
    expect(nestingTreeNeeded(parseSvgElements(separationSvg()))).toBe(true);
    expect(checkpoint).toHaveBeenCalledTimes(2);
    expect(analysis.nestingTree).not.toBeNull();
    expect(analysis.nestingTree.nodes).toHaveLength(analysis.elements.length);
    expect(analyzeSvg(separationSvg()).nestingTree).toEqual(
      analysis.nestingTree
    );
  });

  it('a drawing with no wall and no light fill needs no tree, and carries none', async () => {
    const checkpoint = vi.fn(async () => {});
    expect(nestingTreeNeeded(parseSvgElements(dark))).toBe(false);
    const analysis = await analyzeSvgAsync(dark, { checkpoint });
    expect(checkpoint).toHaveBeenCalledTimes(2);
    expect(analysis.nestingTree).toBeNull();
  });

  it('a Cancel thrown by the checkpoint ends the analysis', async () => {
    await expect(
      analyzeSvgAsync(SMILEY_SVG, {
        checkpoint: async () => {
          throw new Error('stopped');
        },
      })
    ).rejects.toThrow('stopped');
  });

  it('over the cap it refuses at the parse, with only the parse\'s own slices behind it, as analyzeSvg does', async () => {
    const rects = [];
    for (let i = 0; i <= SHAPE_LIST_CAP; i++) {
      rects.push(`<rect x="${(i % 50) * 2}" y="${Math.floor(i / 50) * 2}" width="1" height="1"/>`);
    }
    const many =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
      rects.join('') +
      '</svg>';
    const checkpoint = vi.fn(async () => {});
    const analysis = await analyzeSvgAsync(many, { checkpoint });
    expect(analysis.recommendation).toBe('reject');
    expect(analysis.elementCount).toBe(SHAPE_LIST_CAP + 1);
    // 1,001 elements in slices of a hundred: ten checkpoints inside the
    // parse, and none after the verdict (no tree, no classification).
    expect(checkpoint).toHaveBeenCalledTimes(10);
  });

  it('★ runs on what separateColours actually writes, not on a hand-made copy', () => {
    // The contract between the two modules, checked end to end: a light mark
    // on a dark ground goes in as pixels and comes back as roles.
    const w = 60;
    const h = 60;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const inMark = x >= 15 && x < 45 && y >= 15 && y < 45;
        const inCounter = x >= 25 && x < 35 && y >= 25 && y < 35;
        const light = inMark && !inCounter;
        const o = (y * w + x) * 4;
        data[o] = light ? 250 : 40;
        data[o + 1] = light ? 250 : 40;
        data[o + 2] = light ? 250 : 130;
        data[o + 3] = 255;
      }
    }
    const { svg, colours } = separateColours(
      { data, width: w, height: h },
      { count: 2 }
    );
    const wall = colours.find((c) => c.isBackground);
    expect(wall, 'the separation marked no background').toBeTruthy();
    const analysis = analyzeSvg(svg);
    const roles = analysis.elements.map((el) => el.autoRole);
    // Whatever the tracer's piece count, the dark ground is never raised and
    // the light mark never cut.
    expect(roles).toContain('ignore');
    expect(roles).toContain('foreground');
    expect(roles.filter((r) => r === 'ignore').length).toBeGreaterThan(0);

    const byIndex = analysis.elements.map((el, i) => ({
      i,
      role: el.autoRole,
      fill: (el.fill || '').toLowerCase(),
    }));
    const wallHex = wall.hex.toLowerCase();
    const lightOnes = byIndex.filter((e) => e.fill !== wallHex);
    expect(lightOnes.length).toBeGreaterThan(0);
    for (const e of lightOnes) expect(e.role).toBe('foreground');
  });
});
