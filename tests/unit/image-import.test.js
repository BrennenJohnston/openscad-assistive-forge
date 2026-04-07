/**
 * Unit tests for image-import.js
 *
 * Covers: dimension validation, import limits, luminance parsing,
 * foreground path filtering.
 *
 * Canvas/Image-dependent functions (loadImageData, convertPngToSvg)
 * require a real browser context and are covered by E2E tests.
 * Here we test all pure-function logic that does not depend on Canvas.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';
import {
  IMAGE_IMPORT_LIMITS,
  validateImageDimensions,
  parseLuminance,
  filterForegroundPaths,
} from '../../src/js/image-import.js';

// ---------------------------------------------------------------------------
// IMAGE_IMPORT_LIMITS
// ---------------------------------------------------------------------------

describe('IMAGE_IMPORT_LIMITS', () => {
  it('defines maxPixels as 2 million', () => {
    expect(IMAGE_IMPORT_LIMITS.maxPixels).toBe(2_000_000);
  });

  it('defines warnPixels as 500 thousand', () => {
    expect(IMAGE_IMPORT_LIMITS.warnPixels).toBe(500_000);
  });

  it('maxPixels is greater than warnPixels', () => {
    expect(IMAGE_IMPORT_LIMITS.maxPixels).toBeGreaterThan(
      IMAGE_IMPORT_LIMITS.warnPixels
    );
  });
});

// ---------------------------------------------------------------------------
// validateImageDimensions
// ---------------------------------------------------------------------------

describe('validateImageDimensions', () => {
  it('accepts a small image with ok=true and no warning', () => {
    const result = validateImageDimensions(100, 100);
    expect(result.ok).toBe(true);
    expect(result.warning).toBeUndefined();
    expect(result.pixels).toBe(10_000);
    expect(result.width).toBe(100);
    expect(result.height).toBe(100);
  });

  it('rejects an image exceeding maxPixels', () => {
    const result = validateImageDimensions(2000, 1001);
    expect(result.ok).toBe(false);
    expect(result.pixels).toBe(2_002_000);
  });

  it('accepts an image at exactly maxPixels', () => {
    const result = validateImageDimensions(2000, 1000);
    expect(result.ok).toBe(true);
    expect(result.pixels).toBe(2_000_000);
  });

  it('returns a warning for images above warnPixels but within maxPixels', () => {
    const result = validateImageDimensions(1000, 600);
    expect(result.ok).toBe(true);
    expect(result.warning).toBeDefined();
    expect(result.warning).toContain('megapixels');
    expect(result.pixels).toBe(600_000);
  });

  it('does not warn for images at or below warnPixels', () => {
    const result = validateImageDimensions(500, 1000);
    expect(result.ok).toBe(true);
    expect(result.warning).toBeUndefined();
    expect(result.pixels).toBe(500_000);
  });

  it('does not warn for images well below warnPixels', () => {
    const result = validateImageDimensions(100, 100);
    expect(result.ok).toBe(true);
    expect(result.warning).toBeUndefined();
  });

  it('handles zero dimensions', () => {
    const result = validateImageDimensions(0, 0);
    expect(result.ok).toBe(true);
    expect(result.pixels).toBe(0);
  });

  it('handles 1x1 image', () => {
    const result = validateImageDimensions(1, 1);
    expect(result.ok).toBe(true);
    expect(result.pixels).toBe(1);
  });

  it('warning includes megapixel count', () => {
    const result = validateImageDimensions(1000, 1000);
    expect(result.warning).toContain('1.0');
  });
});

// ---------------------------------------------------------------------------
// parseLuminance
// ---------------------------------------------------------------------------

describe('parseLuminance', () => {
  it('parses rgb(0,0,0) as luminance 0 (black)', () => {
    expect(parseLuminance('rgb(0,0,0)')).toBe(0);
  });

  it('parses rgb(255,255,255) as luminance ~255 (white)', () => {
    const lum = parseLuminance('rgb(255,255,255)');
    expect(lum).toBeCloseTo(255, 0);
  });

  it('parses rgb with spaces', () => {
    const lum = parseLuminance('rgb( 128 , 128 , 128 )');
    expect(lum).toBeGreaterThan(100);
    expect(lum).toBeLessThan(150);
  });

  it('computes ITU-R BT.601 luma correctly for pure red', () => {
    const lum = parseLuminance('rgb(255,0,0)');
    expect(lum).toBeCloseTo(0.299 * 255, 1);
  });

  it('computes ITU-R BT.601 luma correctly for pure green', () => {
    const lum = parseLuminance('rgb(0,255,0)');
    expect(lum).toBeCloseTo(0.587 * 255, 1);
  });

  it('computes ITU-R BT.601 luma correctly for pure blue', () => {
    const lum = parseLuminance('rgb(0,0,255)');
    expect(lum).toBeCloseTo(0.114 * 255, 1);
  });

  it('parses 6-digit hex white', () => {
    const lum = parseLuminance('#ffffff');
    expect(lum).toBeCloseTo(255, 0);
  });

  it('parses 6-digit hex black', () => {
    expect(parseLuminance('#000000')).toBe(0);
  });

  it('parses 3-digit hex black', () => {
    expect(parseLuminance('#000')).toBe(0);
  });

  it('parses 3-digit hex white', () => {
    const lum = parseLuminance('#fff');
    expect(lum).toBeCloseTo(255, 0);
  });

  it('parses hex #ff0000 (pure red)', () => {
    const lum = parseLuminance('#ff0000');
    expect(lum).toBeCloseTo(0.299 * 255, 0);
  });

  it('returns 0 for unrecognized formats', () => {
    expect(parseLuminance('blue')).toBe(0);
    expect(parseLuminance('')).toBe(0);
    expect(parseLuminance('none')).toBe(0);
  });

  it('returns 0 for named CSS colors', () => {
    expect(parseLuminance('red')).toBe(0);
    expect(parseLuminance('transparent')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// filterForegroundPaths
// ---------------------------------------------------------------------------

describe('filterForegroundPaths', () => {
  it('removes white background paths and keeps dark paths', () => {
    const svg = [
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">',
      '<path fill="rgb(255,255,255)" d="M 0 0 L 10 0 L 10 10 L 0 10 Z" />',
      '<path fill="rgb(0,0,0)" d="M 2 2 L 8 2 L 8 8 L 2 8 Z" />',
      '</svg>',
    ].join('');

    const result = filterForegroundPaths(svg);

    expect(result).not.toContain('rgb(255,255,255)');
    expect(result).toContain('rgb(0,0,0)');
    expect(result).toContain('<path');
  });

  it('keeps all paths when none are light enough to be background', () => {
    const svg = [
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">',
      '<path fill="rgb(50,50,50)" d="M 0 0 L 10 0 Z" />',
      '<path fill="rgb(0,0,0)" d="M 2 2 L 8 8 Z" />',
      '</svg>',
    ].join('');

    const result = filterForegroundPaths(svg);
    expect(result).toContain('rgb(50,50,50)');
    expect(result).toContain('rgb(0,0,0)');
  });

  it('returns the original string when no <svg> element is found', () => {
    const notSvg = '<div>not svg</div>';
    expect(filterForegroundPaths(notSvg)).toBe(notSvg);
  });

  it('returns the SVG unchanged when there are no path elements', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>';
    const result = filterForegroundPaths(svg);
    expect(result).toContain('<svg');
  });

  it('handles hex fill colors', () => {
    const svg = [
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">',
      '<path fill="#ffffff" d="M 0 0 L 10 0 L 10 10 L 0 10 Z" />',
      '<path fill="#000000" d="M 2 2 L 8 8 Z" />',
      '</svg>',
    ].join('');

    const result = filterForegroundPaths(svg);
    expect(result).not.toContain('#ffffff');
    expect(result).toContain('#000000');
  });

  it('preserves SVG dimensions and namespace', () => {
    const svg = [
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50">',
      '<path fill="rgb(255,255,255)" d="M 0 0 L 100 0 L 100 50 L 0 50 Z" />',
      '<path fill="rgb(30,30,30)" d="M 10 10 L 90 40 Z" />',
      '</svg>',
    ].join('');

    const result = filterForegroundPaths(svg);
    expect(result).toContain('width="100"');
    expect(result).toContain('height="50"');
    expect(result).toContain('xmlns');
  });

  it('handles multiple foreground paths', () => {
    const svg = [
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">',
      '<path fill="rgb(250,250,250)" d="M 0 0 L 10 0 L 10 10 L 0 10 Z" />',
      '<path fill="rgb(10,10,10)" d="M 1 1 L 3 1 L 3 3 Z" />',
      '<path fill="rgb(20,20,20)" d="M 5 5 L 8 5 L 8 8 Z" />',
      '</svg>',
    ].join('');

    const result = filterForegroundPaths(svg);
    expect(result).not.toContain('rgb(250,250,250)');
    expect(result).toContain('rgb(10,10,10)');
    expect(result).toContain('rgb(20,20,20)');
  });

  it('does not remove dark paths even if they have the highest luminance', () => {
    const svg = [
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">',
      '<path fill="rgb(100,100,100)" d="M 0 0 L 10 10 Z" />',
      '<path fill="rgb(50,50,50)" d="M 2 2 L 8 8 Z" />',
      '</svg>',
    ].join('');

    const result = filterForegroundPaths(svg);
    // Both are dark (max luminance ~100, below 200 threshold)
    expect(result).toContain('rgb(100,100,100)');
    expect(result).toContain('rgb(50,50,50)');
  });
});
