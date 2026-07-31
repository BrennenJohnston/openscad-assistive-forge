/**
 * Computational WCAG contrast verification for the 3D preview palette.
 *
 * The model is a non-text graphical object, so every theme's `model` and
 * `modelBack` must reach 3:1 against `background` (WCAG 2.2 SC 1.4.11,
 * Non-text Contrast). The `edges` overlay renders 1px lines, so per W3C
 * Low Vision Task Force guidance for thin strokes it is held to the
 * 4.5:1 text threshold against the model color it is drawn on.
 *
 * The light theme previously used the desktop Cornfield pair
 * (#f9d72c / #9dcb51), which measured 1.3:1 / 1.7:1 and failed — these
 * tests keep that regression from coming back.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';
import { PREVIEW_COLORS } from '../../src/js/preview.js';

/** WCAG relative luminance of a 0xRRGGBB color. */
function relativeLuminance(hex) {
  const [r, g, b] = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map(
    (v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two 0xRRGGBB colors. */
function contrastRatio(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

const THEMES = Object.keys(PREVIEW_COLORS);

describe('PREVIEW_COLORS non-text contrast (WCAG 2.2 SC 1.4.11)', () => {
  it('covers all eight themes', () => {
    expect(THEMES.sort()).toEqual(
      [
        'light',
        'dark',
        'light-hc',
        'dark-hc',
        'mono',
        'mono-light',
        'mono-hc',
        'mono-light-hc',
      ].sort()
    );
  });

  it.each(THEMES)('%s: model vs background >= 3:1', (theme) => {
    const { model, background } = PREVIEW_COLORS[theme];
    expect(contrastRatio(model, background)).toBeGreaterThanOrEqual(3);
  });

  it.each(THEMES)('%s: modelBack vs background >= 3:1', (theme) => {
    const { modelBack, background } = PREVIEW_COLORS[theme];
    expect(contrastRatio(modelBack, background)).toBeGreaterThanOrEqual(3);
  });

  it.each(THEMES)(
    '%s: edges vs model >= 4.5:1 (thin 1px strokes)',
    (theme) => {
      const { edges, model } = PREVIEW_COLORS[theme];
      expect(edges).toBeTypeOf('number');
      expect(contrastRatio(edges, model)).toBeGreaterThanOrEqual(4.5);
    }
  );

  it('light theme no longer uses the failing Cornfield pair', () => {
    // #f9d72c (1.3:1) and #9dcb51 (1.7:1) fail SC 1.4.11 on #f5f5f5.
    expect(PREVIEW_COLORS.light.model).not.toBe(0xf9d72c);
    expect(PREVIEW_COLORS.light.modelBack).not.toBe(0x9dcb51);
  });
});
