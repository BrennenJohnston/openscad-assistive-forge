/**
 * Unit tests for SVG validation (validateSVGOutput).
 *
 * Imports the real implementation from src/worker/svg-validation.js — the
 * shared module the render worker uses — so these tests fail when the
 * production logic changes.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';
import { validateSVGOutput } from '../../src/worker/svg-validation.js';

// ─── Test fixtures ──────────────────────────────────────────────────────────

const VALID_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <path d="M 10 10 L 90 10 L 90 90 L 10 90 Z" fill="none" stroke="black"/>
</svg>`;

const SVG_WITH_POLYGON = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50">
  <polygon points="25,5 45,45 5,45" fill="red"/>
</svg>`;

const SVG_NO_GEOMETRY = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <defs><style>.cls{fill:none}</style></defs>
</svg>`;

const SVG_ZERO_VIEWBOX = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 0 0" width="0" height="0">
  <path d="M 0 0"/>
</svg>`;

const SVG_DEGENERATE_VIEWBOX = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 0.0001 0.00005">
  <path d="M 0 0 L 0.0001 0.00005"/>
</svg>`;

const NOT_SVG = `<html><body><p>This is not SVG content at all, just some random HTML that is long enough.</p></body></html>`;

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('validateSVGOutput — valid SVG with geometry', () => {
  it('accepts a well-formed SVG with a <path> element', () => {
    const result = validateSVGOutput(VALID_SVG);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('accepts SVG with a <polygon> element', () => {
    const result = validateSVGOutput(SVG_WITH_POLYGON);
    expect(result.valid).toBe(true);
  });
});

describe('validateSVGOutput — empty or too-small input', () => {
  it('rejects null input', () => {
    const result = validateSVGOutput(null);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/empty or too small/i);
  });

  it('rejects empty string', () => {
    const result = validateSVGOutput('');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/empty or too small/i);
  });

  it('rejects string shorter than 50 characters', () => {
    const result = validateSVGOutput('<svg><path d="M0 0"/></svg>');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/empty or too small/i);
  });
});

describe('validateSVGOutput — missing <svg> element', () => {
  it('rejects non-SVG content', () => {
    const result = validateSVGOutput(NOT_SVG);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/missing <svg> element/i);
  });
});

describe('validateSVGOutput — SVG without geometry elements', () => {
  it('rejects SVG that contains no geometric elements', () => {
    const result = validateSVGOutput(SVG_NO_GEOMETRY);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/no geometry/i);
  });
});

describe('validateSVGOutput — degenerate viewBox', () => {
  it('rejects SVG with zero-size viewBox', () => {
    const result = validateSVGOutput(SVG_ZERO_VIEWBOX);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/zero-size viewBox/i);
  });

  it('rejects SVG with near-zero viewBox dimensions', () => {
    const result = validateSVGOutput(SVG_DEGENERATE_VIEWBOX);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/zero-size viewBox/i);
  });
});
