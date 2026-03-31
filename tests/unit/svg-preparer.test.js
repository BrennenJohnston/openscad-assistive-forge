/**
 * SVG Preparer — Unit tests
 *
 * Phase 1: PoC tests validating path-bool and svg-path-commander.
 * Phase 2: Module tests for parseSvgElements, classifyElements,
 *          flattenToCompoundPath, prepareSvg, needsPreparation.
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
import {
  parseSvgElements,
  classifyElements,
  flattenToCompoundPath,
  prepareSvg,
  needsPreparation,
  analyzeSvg,
  strokeToFill,
  applyPerPathOffsets,
} from '../../src/js/svg-preparer.js';

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
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text>hello</text></svg>';
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

  it('counts elements with no fill attr as filled (SVG default)', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg">' +
      '<circle cx="10" cy="10" r="5"/>' +
      '<circle cx="20" cy="20" r="5"/>' +
      '</svg>';
    expect(needsPreparation(svg)).toBe(true);
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
      const smile = result.elements.find(
        (el) => el.strokeConverted
      );
      expect(smile.warnings.length).toBeGreaterThan(0);
      expect(smile.warnings[0]).toContain('converted');
    });

    it('has a global info about converted stroked paths', () => {
      const result = analyzeSvg(SMILEY_SVG);
      expect(result.warnings.some((w) => w.includes('converted'))).toBe(
        true
      );
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
    it('reduces confidence when transforms are present', () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg">' +
        '<rect x="0" y="0" width="20" height="20" fill="black" transform="rotate(45 10 10)"/>' +
        '<circle cx="50" cy="50" r="15" fill="white"/>' +
        '</svg>';
      const result = analyzeSvg(svg);
      expect(result.confidence).toBeLessThan(1.0);
    });

    it('per-element warning on transformed element', () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg">' +
        '<rect x="0" y="0" width="20" height="20" fill="black" transform="rotate(45 10 10)"/>' +
        '</svg>';
      const result = analyzeSvg(svg);
      expect(
        result.elements[0].warnings.some((w) => w.includes('transform'))
      ).toBe(true);
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
    it('reduces confidence when all filled elements have similar luminance', () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg">' +
        '<circle cx="20" cy="20" r="10" fill="black"/>' +
        '<circle cx="50" cy="20" r="10" fill="black"/>' +
        '</svg>';
      const result = analyzeSvg(svg);
      expect(result.confidence).toBeLessThan(1.0);
      expect(
        result.warnings.some((w) => w.includes('similar luminance'))
      ).toBe(true);
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
      expect(
        result.warnings.some((w) => w.includes('similar luminance'))
      ).toBe(false);
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
