/**
 * Charm SVG library — pipeline sweep tests
 *
 * Runs analyzeSvg + prepareSvg over every bundled design in
 * public/examples/nasif-charm-maker/svg-library and asserts the
 * auto-import pipeline never throws and classifies each design
 * the way the Charm Customizer expects.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { analyzeSvg, prepareSvg } from '../../src/js/svg-preparer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SVG_DIR = join(
  __dirname,
  '../../public/examples/nasif-charm-maker/svg-library'
);

const ALL_DESIGNS = readdirSync(SVG_DIR).filter((f) => f.endsWith('.svg'));

// Single-shape or all-dark designs: flattening is unnecessary risk,
// OpenSCAD unions overlapping filled shapes natively.
const PASS_THROUGH_DESIGNS = [
  'heart.svg',
  'star.svg',
  'lightning.svg',
  'moon.svg',
  'paw.svg',
  'sun.svg',
  'flower.svg',
  'diamond.svg',
  'crown.svg',
  'music-note.svg',
];

// Designs with genuine holes / stroke conversions still get prepared.
const PREPARED_DESIGNS = ['smiley.svg', 'leaf.svg'];

function load(name) {
  return readFileSync(join(SVG_DIR, name), 'utf-8');
}

describe('charm SVG library sweep', () => {
  it('covers all 12 bundled designs', () => {
    expect(ALL_DESIGNS).toHaveLength(12);
    expect([...PASS_THROUGH_DESIGNS, ...PREPARED_DESIGNS].sort()).toEqual(
      [...ALL_DESIGNS].sort()
    );
  });

  for (const name of ALL_DESIGNS) {
    it(`${name}: analyzeSvg and prepareSvg run without throwing`, () => {
      const svg = load(name);
      let analysis, prepared;
      expect(() => {
        analysis = analyzeSvg(svg);
      }).not.toThrow();
      expect(() => {
        prepared = prepareSvg(svg);
      }).not.toThrow();
      expect(analysis.recommendation).not.toBe('reject');
      expect(prepared).toContain('<svg');
      expect(prepared).not.toContain('NaN');
      expect(prepared).not.toContain('undefined');
    });
  }

  for (const name of PASS_THROUGH_DESIGNS) {
    it(`${name}: passes through unchanged`, () => {
      const svg = load(name);
      const analysis = analyzeSvg(svg);
      expect(analysis.recommendation).toBe('pass_through');
      expect(prepareSvg(svg)).toBe(svg);
    });
  }

  for (const name of PREPARED_DESIGNS) {
    it(`${name}: still auto-prepared (has holes or strokes)`, () => {
      const svg = load(name);
      const analysis = analyzeSvg(svg);
      expect(analysis.recommendation).toBe('auto_prepare');
      const prepared = prepareSvg(svg);
      expect(prepared).not.toBe(svg);
      expect(prepared).toContain('fill-rule="evenodd"');
    });
  }

  it('smiley.svg prepared output keeps face + 2 eyes + smile subpaths', () => {
    const prepared = prepareSvg(load('smiley.svg'));
    const dMatch = prepared.match(/d="([^"]+)"/);
    expect(dMatch).not.toBeNull();
    const mCount = (dMatch[1].match(/M/g) || []).length;
    expect(mCount).toBeGreaterThanOrEqual(4);
  });

  it('paw.svg pass-through keeps all 5 shapes renderable', () => {
    const svg = load('paw.svg');
    const analysis = analyzeSvg(svg);
    expect(analysis.elements).toHaveLength(5);
    expect(analysis.elements.every((el) => el.autoRole === 'foreground')).toBe(
      true
    );
  });
});
