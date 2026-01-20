/**
 * Color Contrast Tests
 * 
 * Automated testing of color contrast ratios to ensure WCAG 2.2 AA/AAA compliance.
 * Uses Color.js for accurate contrast calculations.
 * 
 * Requirements:
 * - Normal themes (light/dark/auto): WCAG AA (4.5:1 for normal text, 3:1 for large text and UI)
 * - High contrast mode: WCAG AAA (7:1 for text, 4.5:1 for large text)
 * - Non-text contrast (borders, icons, states): 3:1 minimum
 */

import { describe, it, expect } from 'vitest';
import Color from 'colorjs.io';
import { amber, green, red, slate, slateDark, teal, yellow } from '@radix-ui/colors';

/**
 * Calculate WCAG 2.x contrast ratio between two colors
 * @param {string} foreground - Foreground color (CSS color string)
 * @param {string} background - Background color (CSS color string)
 * @returns {number} - Contrast ratio
 */
function getContrastRatio(foreground, background) {
  const fg = new Color(foreground);
  const bg = new Color(background);
  return fg.contrast(bg, 'WCAG21');
}

/**
 * Check if contrast meets WCAG AA requirements
 * @param {number} ratio - Contrast ratio
 * @param {string} textSize - 'normal' or 'large'
 * @returns {boolean}
 */
function meetsWCAG_AA(ratio, textSize = 'normal') {
  return textSize === 'normal' ? ratio >= 4.5 : ratio >= 3.0;
}

/**
 * Check if contrast meets WCAG AAA requirements
 * @param {number} ratio - Contrast ratio
 * @param {string} textSize - 'normal' or 'large'
 * @returns {boolean}
 */
function meetsWCAG_AAA(ratio, textSize = 'normal') {
  return textSize === 'normal' ? ratio >= 7.0 : ratio >= 4.5;
}

/**
 * Check if contrast meets non-text requirements (3:1)
 * @param {number} ratio - Contrast ratio
 * @returns {boolean}
 */
function meetsNonTextContrast(ratio) {
  return ratio >= 3.0;
}

describe('Color Contrast - Light Mode (Normal Theme)', () => {
  // Radix Slate light mode colors (source of truth)
  const bg = {
    primary: slate.slate1,
    secondary: slate.slate2,
    tertiary: slate.slate3,
  };
  
  const text = {
    primary: slate.slate12,
    secondary: slate.slate11,
    tertiary: slate.slate10,
  };
  
  const accent = yellow.yellow9;
  const border = slate.slate10;

  it('primary text on primary background meets WCAG AA', () => {
    const ratio = getContrastRatio(text.primary, bg.primary);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
    expect(meetsWCAG_AA(ratio)).toBe(true);
  });

  it('secondary text on primary background meets WCAG AA', () => {
    const ratio = getContrastRatio(text.secondary, bg.primary);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
    expect(meetsWCAG_AA(ratio)).toBe(true);
  });

  it('tertiary text on primary background meets WCAG AA (large text)', () => {
    const ratio = getContrastRatio(text.tertiary, bg.primary);
    expect(ratio).toBeGreaterThanOrEqual(3.0);
    expect(meetsWCAG_AA(ratio, 'large')).toBe(true);
  });

  it('success text on success background meets WCAG AA', () => {
    const successBg = green.green3;
    const successText = green.green12;
    const ratio = getContrastRatio(successText, successBg);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
    expect(meetsWCAG_AA(ratio)).toBe(true);
  });

  it('error text on error background meets WCAG AA', () => {
    const errorBg = red.red3;
    const errorText = red.red12;
    const ratio = getContrastRatio(errorText, errorBg);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
    expect(meetsWCAG_AA(ratio)).toBe(true);
  });

  it('warning text on warning background meets WCAG AA', () => {
    const warningBg = amber.amber3;
    const warningText = amber.amber12;
    const ratio = getContrastRatio(warningText, warningBg);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
    expect(meetsWCAG_AA(ratio)).toBe(true);
  });

  it('info text on info background meets WCAG AA', () => {
    const infoBg = teal.teal3;
    const infoText = teal.teal12;
    const ratio = getContrastRatio(infoText, infoBg);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
    expect(meetsWCAG_AA(ratio)).toBe(true);
  });

  it('borders meet non-text contrast requirement', () => {
    const ratio = getContrastRatio(border, bg.primary);
    expect(ratio).toBeGreaterThanOrEqual(3.0);
    expect(meetsNonTextContrast(ratio)).toBe(true);
  });

  it('accent button (yellow-9) has sufficient contrast', () => {
    // Yellow-9 on slate-1 for button background
    const ratio = getContrastRatio(text.primary, accent);
    expect(ratio).toBeGreaterThanOrEqual(3.0); // Large text on buttons
    expect(meetsWCAG_AA(ratio, 'large')).toBe(true);
  });
});

describe('Color Contrast - Dark Mode (Normal Theme)', () => {
  // Radix Slate dark mode colors (source of truth)
  const bg = {
    primary: slateDark.slate1,
    secondary: slateDark.slate2,
    tertiary: slateDark.slate3,
  };
  
  const text = {
    primary: slateDark.slate12,
    secondary: slateDark.slate11,
    tertiary: slateDark.slate10,
  };
  
  const border = slateDark.slate10;

  it('primary text on primary background meets WCAG AA', () => {
    const ratio = getContrastRatio(text.primary, bg.primary);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
    expect(meetsWCAG_AA(ratio)).toBe(true);
  });

  it('secondary text on primary background meets WCAG AA', () => {
    const ratio = getContrastRatio(text.secondary, bg.primary);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
    expect(meetsWCAG_AA(ratio)).toBe(true);
  });

  it('borders meet non-text contrast requirement', () => {
    const ratio = getContrastRatio(border, bg.primary);
    expect(ratio).toBeGreaterThanOrEqual(3.0);
    expect(meetsNonTextContrast(ratio)).toBe(true);
  });
});

describe('Color Contrast - High Contrast Light Mode (AAA Target)', () => {
  const bg = '#ffffff';
  const text = '#000000';
  // Keep in sync with `src/styles/variables.css` high contrast light mode tokens
  const accent = '#003d99';
  const success = '#08651a';
  const info = '#005b61';
  const error = '#b30000';
  const warning = '#664700';
  const border = '#000000';

  it('primary text meets WCAG AAA', () => {
    const ratio = getContrastRatio(text, bg);
    expect(ratio).toBeGreaterThanOrEqual(7.0);
    expect(meetsWCAG_AAA(ratio)).toBe(true);
  });

  it('accent color meets WCAG AAA', () => {
    const ratio = getContrastRatio(accent, bg);
    expect(ratio).toBeGreaterThanOrEqual(7.0);
    expect(meetsWCAG_AAA(ratio)).toBe(true);
  });

  it('success color meets WCAG AAA', () => {
    const ratio = getContrastRatio(success, bg);
    expect(ratio).toBeGreaterThanOrEqual(7.0);
    expect(meetsWCAG_AAA(ratio)).toBe(true);
  });

  it('info color meets WCAG AAA', () => {
    const ratio = getContrastRatio(info, bg);
    expect(ratio).toBeGreaterThanOrEqual(7.0);
    expect(meetsWCAG_AAA(ratio)).toBe(true);
  });

  it('error color meets WCAG AAA', () => {
    const ratio = getContrastRatio(error, bg);
    expect(ratio).toBeGreaterThanOrEqual(7.0);
    expect(meetsWCAG_AAA(ratio)).toBe(true);
  });

  it('warning color meets WCAG AAA', () => {
    const ratio = getContrastRatio(warning, bg);
    expect(ratio).toBeGreaterThanOrEqual(7.0);
    expect(meetsWCAG_AAA(ratio)).toBe(true);
  });

  it('borders have maximum contrast', () => {
    const ratio = getContrastRatio(border, bg);
    expect(ratio).toBeGreaterThanOrEqual(3.0);
    expect(meetsNonTextContrast(ratio)).toBe(true);
  });
});

describe('Color Contrast - High Contrast Dark Mode (AAA Target)', () => {
  const bg = '#000000';
  const text = '#ffffff';
  const accent = '#66b3ff';
  const success = '#66ff66';
  const info = '#44d9e6';
  const error = '#ff6666';
  const warning = '#ffcc00';
  const border = '#ffffff';

  it('primary text meets WCAG AAA', () => {
    const ratio = getContrastRatio(text, bg);
    expect(ratio).toBeGreaterThanOrEqual(7.0);
    expect(meetsWCAG_AAA(ratio)).toBe(true);
  });

  it('accent color meets WCAG AAA', () => {
    const ratio = getContrastRatio(accent, bg);
    expect(ratio).toBeGreaterThanOrEqual(7.0);
    expect(meetsWCAG_AAA(ratio)).toBe(true);
  });

  it('success color meets WCAG AAA', () => {
    const ratio = getContrastRatio(success, bg);
    expect(ratio).toBeGreaterThanOrEqual(7.0);
    expect(meetsWCAG_AAA(ratio)).toBe(true);
  });

  it('info color meets WCAG AAA', () => {
    const ratio = getContrastRatio(info, bg);
    expect(ratio).toBeGreaterThanOrEqual(7.0);
    expect(meetsWCAG_AAA(ratio)).toBe(true);
  });

  it('error color meets WCAG AAA', () => {
    const ratio = getContrastRatio(error, bg);
    expect(ratio).toBeGreaterThanOrEqual(7.0);
    expect(meetsWCAG_AAA(ratio)).toBe(true);
  });

  it('warning color meets WCAG AAA', () => {
    const ratio = getContrastRatio(warning, bg);
    expect(ratio).toBeGreaterThanOrEqual(7.0);
    expect(meetsWCAG_AAA(ratio)).toBe(true);
  });

  it('borders have maximum contrast', () => {
    const ratio = getContrastRatio(border, bg);
    expect(ratio).toBeGreaterThanOrEqual(3.0);
    expect(meetsNonTextContrast(ratio)).toBe(true);
  });
});

describe('Focus Indicators - Brand-Neutral Blue', () => {
  // Focus colors from variables.css
  const focusLight = '#0052cc';
  const focusDark = '#66b3ff';
  const bgLight = slate.slate1;
  const bgDark = slateDark.slate1;
  const accentLight = yellow.yellow9;

  it('light mode focus indicator meets 3:1 against light background', () => {
    const ratio = getContrastRatio(focusLight, bgLight);
    expect(ratio).toBeGreaterThanOrEqual(3.0);
    expect(meetsNonTextContrast(ratio)).toBe(true);
  });

  it('dark mode focus indicator meets 3:1 against dark background', () => {
    const ratio = getContrastRatio(focusDark, bgDark);
    expect(ratio).toBeGreaterThanOrEqual(3.0);
    expect(meetsNonTextContrast(ratio)).toBe(true);
  });

  it('light mode focus indicator distinguishable from accent color', () => {
    const ratio = getContrastRatio(focusLight, accentLight);
    // Should be noticeably different (at least 2:1 difference for perceptibility)
    expect(ratio).toBeGreaterThanOrEqual(2.0);
  });
});

describe('APCA Contrast (Future WCAG 3.0) - Informational', () => {
  /**
   * APCA (Accessible Perceptual Contrast Algorithm) is the proposed method
   * for WCAG 3.0. We include informational tests here for future-proofing.
   * 
   * Note: APCA is not yet standardized, but colorjs.io provides support.
   */
  
  it('can calculate APCA contrast values', () => {
    const fg = new Color('#11181c'); // slate-12 light
    const bg = new Color('#fcfcfd'); // slate-1 light
    
    // APCA returns signed value (positive = dark text on light bg)
    const apcaContrast = Math.abs(fg.contrast(bg, 'APCA'));
    
    // APCA thresholds (informational):
    // 90+ = AAA equivalent
    // 75+ = AA equivalent  
    // 60+ = large text AA equivalent
    // 45+ = non-text / graphics
    
    expect(apcaContrast).toBeGreaterThan(0);
    console.log(`APCA Contrast (informational): ${apcaContrast.toFixed(1)}Lc`);
  });
});
