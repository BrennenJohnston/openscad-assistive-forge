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
  it('classifies smiley elements correctly by default', () => {
    const elements = parseSvgElements(SMILEY_SVG);
    const classified = classifyElements(elements);

    const face = classified.find((el) => el.fill === 'black');
    const eyes = classified.filter((el) => el.fill === 'white');
    const smile = classified.find((el) => el.fill === 'none');

    expect(face.role).toBe('foreground');
    expect(eyes[0].role).toBe('hole');
    expect(eyes[1].role).toBe('hole');
    expect(smile.role).toBe('ignore');
  });

  it('respects strokeHandling option', () => {
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

  it('smiley compound path has exactly 3 M-command subpaths', () => {
    const elements = parseSvgElements(SMILEY_SVG);
    const classified = classifyElements(elements);
    const result = flattenToCompoundPath(classified, {
      viewBox: '0 0 100 100',
    });

    const dMatch = result.match(/d="([^"]+)"/);
    expect(dMatch).not.toBeNull();
    const mCount = (dMatch[1].match(/M/g) || []).length;
    expect(mCount).toBe(3);
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

  it('excludes fill="none" elements from filled count', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg">' +
      '<circle cx="10" cy="10" r="5" fill="black"/>' +
      '<line x1="0" y1="0" x2="10" y2="10" stroke="black" fill="none"/>' +
      '</svg>';
    expect(needsPreparation(svg)).toBe(false);
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
    expect(mCount).toBe(3);
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

  it('ignores stroked smile path by default (fallback gate)', () => {
    const result = prepareSvg(SMILEY_SVG);
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
