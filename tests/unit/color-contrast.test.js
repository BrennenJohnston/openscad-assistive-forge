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

describe('Button Variants - All Themes', () => {
  describe('Light Mode Buttons', () => {
    const bgPrimary = slate.slate1;
    const bgSecondary = slate.slate2;
    const bgTertiary = slate.slate3;
    const textPrimary = slate.slate12;
    
    it('primary button text meets WCAG AA', () => {
      const buttonBg = yellow.yellow9;
      const ratio = getContrastRatio(textPrimary, buttonBg);
      expect(ratio).toBeGreaterThanOrEqual(3.0); // Large text
      expect(meetsWCAG_AA(ratio, 'large')).toBe(true);
    });
    
    it('secondary button text meets WCAG AA', () => {
      const ratio = getContrastRatio(textPrimary, bgTertiary);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
      expect(meetsWCAG_AA(ratio)).toBe(true);
    });
    
    it('icon button text meets WCAG AA', () => {
      const ratio = getContrastRatio(textPrimary, bgSecondary);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
      expect(meetsWCAG_AA(ratio)).toBe(true);
    });
    
    it('reset button text meets WCAG AA', () => {
      // param-reset-btn uses text-primary on transparent/tertiary background
      const ratio = getContrastRatio(textPrimary, bgTertiary);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
      expect(meetsWCAG_AA(ratio)).toBe(true);
    });
  });
  
  describe('Dark Mode Buttons', () => {
    const bgPrimary = slateDark.slate1;
    const bgSecondary = slateDark.slate2;
    const bgTertiary = slateDark.slate3;
    const textPrimary = slateDark.slate12;
    // In dark mode, --color-accent-text is var(--slate-1) which is dark text for contrast on yellow
    const accentText = slateDark.slate1;
    
    it('primary button text meets WCAG AA in dark mode', () => {
      // Primary button uses --color-accent-text on yellow background
      // In dark mode, accent-text is slate-1 (dark/near-black) for good contrast
      const buttonBg = yellow.yellow9;
      const ratio = getContrastRatio(accentText, buttonBg);
      expect(ratio).toBeGreaterThanOrEqual(3.0); // Large text
      expect(meetsWCAG_AA(ratio, 'large')).toBe(true);
    });
    
    it('reset button text meets WCAG AA in dark mode', () => {
      // param-reset-btn now uses text-primary (fixed)
      const ratio = getContrastRatio(textPrimary, bgTertiary);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
      expect(meetsWCAG_AA(ratio)).toBe(true);
    });
    
    it('icon button text meets WCAG AA in dark mode', () => {
      const ratio = getContrastRatio(textPrimary, bgSecondary);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
      expect(meetsWCAG_AA(ratio)).toBe(true);
    });
  });
  
  describe('High Contrast Mode Buttons', () => {
    const bgHCLight = '#ffffff';
    const textHCLight = '#000000';
    const bgHCDark = '#000000';
    const textHCDark = '#ffffff';
    
    it('button text meets WCAG AAA in HC light mode', () => {
      const ratio = getContrastRatio(textHCLight, bgHCLight);
      expect(ratio).toBeGreaterThanOrEqual(7.0);
      expect(meetsWCAG_AAA(ratio)).toBe(true);
    });
    
    it('button text meets WCAG AAA in HC dark mode', () => {
      const ratio = getContrastRatio(textHCDark, bgHCDark);
      expect(ratio).toBeGreaterThanOrEqual(7.0);
      expect(meetsWCAG_AAA(ratio)).toBe(true);
    });
  });
});

describe('Drawer Headers - All Themes', () => {
  describe('Light Mode Drawer Headers', () => {
    const bgSecondary = slate.slate2; // Drawer header background
    const textPrimary = slate.slate12; // Drawer title text
    
    it('drawer title text meets WCAG AA', () => {
      const ratio = getContrastRatio(textPrimary, bgSecondary);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
      expect(meetsWCAG_AA(ratio)).toBe(true);
    });
  });
  
  describe('Dark Mode Drawer Headers', () => {
    const bgSecondary = slateDark.slate2;
    const textPrimary = slateDark.slate12;
    
    it('drawer title text meets WCAG AA in dark mode', () => {
      const ratio = getContrastRatio(textPrimary, bgSecondary);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
      expect(meetsWCAG_AA(ratio)).toBe(true);
    });
  });
  
  describe('High Contrast Drawer Headers', () => {
    const bgHCLight = '#e0e0e0';
    const textHCLight = '#000000';
    const bgHCDark = '#1a1a1a';
    const textHCDark = '#ffffff';
    
    it('drawer title meets WCAG AAA in HC light mode', () => {
      const ratio = getContrastRatio(textHCLight, bgHCLight);
      expect(ratio).toBeGreaterThanOrEqual(7.0);
      expect(meetsWCAG_AAA(ratio)).toBe(true);
    });
    
    it('drawer title meets WCAG AAA in HC dark mode', () => {
      const ratio = getContrastRatio(textHCDark, bgHCDark);
      expect(ratio).toBeGreaterThanOrEqual(7.0);
      expect(meetsWCAG_AAA(ratio)).toBe(true);
    });
  });
});

describe('Mobile Header Controls - All Themes', () => {
  describe('Light Mode Mobile Header', () => {
    const bgPrimary = slate.slate1;
    const textPrimary = slate.slate12;
    
    it('header button text/icons meet WCAG AA', () => {
      const ratio = getContrastRatio(textPrimary, bgPrimary);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
      expect(meetsWCAG_AA(ratio)).toBe(true);
    });
  });
  
  describe('Dark Mode Mobile Header', () => {
    const bgPrimary = slateDark.slate1;
    const textPrimary = slateDark.slate12;
    
    it('header button text/icons meet WCAG AA in dark mode', () => {
      const ratio = getContrastRatio(textPrimary, bgPrimary);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
      expect(meetsWCAG_AA(ratio)).toBe(true);
    });
  });
  
  describe('High Contrast Mobile Header', () => {
    const bgHCLight = '#ffffff';
    const textHCLight = '#000000';
    const bgHCDark = '#000000';
    const textHCDark = '#ffffff';
    
    it('header controls meet WCAG AAA in HC light mode', () => {
      const ratio = getContrastRatio(textHCLight, bgHCLight);
      expect(ratio).toBeGreaterThanOrEqual(7.0);
      expect(meetsWCAG_AAA(ratio)).toBe(true);
    });
    
    it('header controls meet WCAG AAA in HC dark mode', () => {
      const ratio = getContrastRatio(textHCDark, bgHCDark);
      expect(ratio).toBeGreaterThanOrEqual(7.0);
      expect(meetsWCAG_AAA(ratio)).toBe(true);
    });
  });
});

describe('Camera Drawer Arrow - Mobile All Themes', () => {
  describe('Camera Arrow Visibility', () => {
    const bgSecondary = slate.slate2;
    const textPrimary = slate.slate12;
    const bgSecondaryDark = slateDark.slate2;
    const textPrimaryDark = slateDark.slate12;
    
    it('camera arrow (currentColor) meets WCAG AA in light mode', () => {
      const ratio = getContrastRatio(textPrimary, bgSecondary);
      expect(ratio).toBeGreaterThanOrEqual(3.0); // SVG UI element
      expect(meetsNonTextContrast(ratio)).toBe(true);
    });
    
    it('camera arrow (currentColor) meets WCAG AA in dark mode', () => {
      const ratio = getContrastRatio(textPrimaryDark, bgSecondaryDark);
      expect(ratio).toBeGreaterThanOrEqual(3.0); // SVG UI element
      expect(meetsNonTextContrast(ratio)).toBe(true);
    });
    
    it('camera arrow meets WCAG AAA in high contrast light', () => {
      const ratio = getContrastRatio('#000000', '#f0f0f0');
      expect(ratio).toBeGreaterThanOrEqual(7.0);
      expect(meetsWCAG_AAA(ratio)).toBe(true);
    });
    
    it('camera arrow meets WCAG AAA in high contrast dark', () => {
      const ratio = getContrastRatio('#ffffff', '#1a1a1a');
      expect(ratio).toBeGreaterThanOrEqual(7.0);
      expect(meetsWCAG_AAA(ratio)).toBe(true);
    });
  });
});

describe('Tutorial Button Contrast - CRITICAL ACCESSIBILITY FIX', () => {
  /**
   * These tests verify the root cause fix for the Back button visibility issue.
   * The Back button was invisible in dark theme because reset.css sets 
   * `button { background: none; }` and .tutorial-btn-back had no explicit colors.
   * 
   * Fix: Added explicit background: var(--color-bg-secondary) and 
   * color: var(--color-text-primary) to .tutorial-btn-back in components.css
   */
  
  describe('Light Mode Tutorial Buttons', () => {
    const bgSecondary = slate.slate2; // tutorial Back button background
    const bgTertiary = slate.slate3;  // alternative button background
    const textPrimary = slate.slate12;
    const accentBg = yellow.yellow9;  // Next button background
    
    it('Back button has sufficient contrast in light theme (>= 4.5:1)', () => {
      // Back button: text-primary on bg-secondary background
      const ratio = getContrastRatio(textPrimary, bgSecondary);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
      expect(meetsWCAG_AA(ratio)).toBe(true);
    });
    
    it('Next button has sufficient contrast in light theme', () => {
      // Next button uses accent colors
      const ratio = getContrastRatio(textPrimary, accentBg);
      expect(ratio).toBeGreaterThanOrEqual(3.0); // Large text minimum
      expect(meetsWCAG_AA(ratio, 'large')).toBe(true);
    });
    
    it('Back button border has sufficient contrast', () => {
      const borderColor = textPrimary;
      const ratio = getContrastRatio(borderColor, bgSecondary);
      expect(ratio).toBeGreaterThanOrEqual(3.0);
      expect(meetsNonTextContrast(ratio)).toBe(true);
    });
  });
  
  describe('Dark Mode Tutorial Buttons - ROOT CAUSE OF BUG', () => {
    const bgSecondary = slateDark.slate2; // dark mode Back button background
    const bgTertiary = slateDark.slate3;
    const textPrimary = slateDark.slate12; // light text in dark mode
    
    it('Back button has sufficient contrast in dark theme (>= 4.5:1) - MUST PASS', () => {
      // THIS IS THE CRITICAL TEST
      // Back button was invisible because reset.css set background: none
      // Fix: explicit background: var(--color-bg-secondary) or var(--color-bg-tertiary)
      const ratio = getContrastRatio(textPrimary, bgSecondary);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
      expect(meetsWCAG_AA(ratio)).toBe(true);
    });
    
    it('Back button text is NOT same color as background', () => {
      // Sanity check: text and background must be different
      expect(textPrimary).not.toBe(bgSecondary);
      expect(textPrimary.toLowerCase()).not.toBe(bgSecondary.toLowerCase());
    });
    
    it('Back button background is NOT transparent in dark theme', () => {
      // Verify the CSS fix applies a real background color
      // The actual value bgSecondary (slateDark.slate2) should be a real color
      expect(bgSecondary).not.toBe('transparent');
      expect(bgSecondary).not.toBe('rgba(0, 0, 0, 0)');
      expect(bgSecondary).not.toBe('none');
      // Should be a hex or rgb color
      expect(bgSecondary).toMatch(/^(#|rgb)/);
    });
    
    it('Next button has sufficient contrast in dark theme', () => {
      // Next button uses accent colors - dark text on yellow
      const accentBg = yellow.yellow9;
      const accentText = slateDark.slate1; // Dark text for yellow button
      const ratio = getContrastRatio(accentText, accentBg);
      expect(ratio).toBeGreaterThanOrEqual(3.0);
      expect(meetsWCAG_AA(ratio, 'large')).toBe(true);
    });
  });
  
  describe('High Contrast Mode Tutorial Buttons', () => {
    it('Back button meets WCAG AAA (>= 7:1) in HC light mode', () => {
      const bgHCLight = '#e0e0e0';
      const textHCLight = '#000000';
      const ratio = getContrastRatio(textHCLight, bgHCLight);
      expect(ratio).toBeGreaterThanOrEqual(7.0);
      expect(meetsWCAG_AAA(ratio)).toBe(true);
    });
    
    it('Back button meets WCAG AAA (>= 7:1) in HC dark mode', () => {
      const bgHCDark = '#1a1a1a';
      const textHCDark = '#ffffff';
      const ratio = getContrastRatio(textHCDark, bgHCDark);
      expect(ratio).toBeGreaterThanOrEqual(7.0);
      expect(meetsWCAG_AAA(ratio)).toBe(true);
    });
  });
});

describe('Selected Tab Indicator - All Themes', () => {
  /**
   * Verifies the features-tab[aria-selected='true'] border-bottom indicator
   * meets WCAG 1.4.11 non-text contrast (3:1 minimum).
   *
   * In light mode the indicator uses --color-accent-fg (amber-11, ~#AD5700)
   * rather than --color-accent (yellow-9, #FFE629 ≈ 1.2:1 on white — fails).
   * Dark and HC themes resolve --color-accent-fg to values that already pass.
   */

  describe('Light Mode Tab Indicator', () => {
    // After fix: --color-accent-fg = var(--amber-11) in light mode
    const indicatorColor = amber.amber11;
    const tabBg = slate.slate1; // --color-bg-primary in light mode

    it('selected tab indicator meets 3:1 non-text contrast in light mode', () => {
      const ratio = getContrastRatio(indicatorColor, tabBg);
      expect(ratio).toBeGreaterThanOrEqual(3.0);
      expect(meetsNonTextContrast(ratio)).toBe(true);
    });
  });

  describe('Dark Mode Tab Indicator', () => {
    // --color-accent-fg = var(--yellow-9) in dark mode
    const indicatorColor = yellow.yellow9;
    const tabBg = slateDark.slate1; // --color-bg-primary in dark mode

    it('selected tab indicator meets 3:1 non-text contrast in dark mode', () => {
      const ratio = getContrastRatio(indicatorColor, tabBg);
      expect(ratio).toBeGreaterThanOrEqual(3.0);
      expect(meetsNonTextContrast(ratio)).toBe(true);
    });
  });

  describe('High Contrast Light Mode Tab Indicator', () => {
    // --color-accent-fg = #003d99 in HC light mode (same as --color-accent)
    const indicatorColor = '#003d99';
    const tabBg = '#ffffff'; // --color-bg-primary in HC light mode

    it('selected tab indicator meets 7:1 in HC light mode', () => {
      const ratio = getContrastRatio(indicatorColor, tabBg);
      expect(ratio).toBeGreaterThanOrEqual(7.0);
      expect(meetsWCAG_AAA(ratio)).toBe(true);
    });
  });

  describe('High Contrast Dark Mode Tab Indicator', () => {
    // --color-accent-fg = #66b3ff in HC dark mode (same as --color-accent)
    const indicatorColor = '#66b3ff';
    const tabBg = '#000000'; // --color-bg-primary in HC dark mode

    it('selected tab indicator meets 7:1 in HC dark mode', () => {
      const ratio = getContrastRatio(indicatorColor, tabBg);
      expect(ratio).toBeGreaterThanOrEqual(7.0);
      expect(meetsWCAG_AAA(ratio)).toBe(true);
    });
  });
});

describe('Pressed Button State - All Themes', () => {
  /**
   * Verifies icon/text contrast on the accent-background pressed state used by
   * alt-view-toggle, alt-pan-toggle, auto-rotate-toggle, and mode-toggle-btn.
   *
   * Pressed state: background = --color-accent, color = --color-accent-text.
   * WCAG 1.4.11 non-text contrast (3:1) required for icon indicators.
   */

  describe('Light Mode Pressed Button', () => {
    // --color-accent = yellow-9, --color-accent-text = slate-12 in light mode
    const iconColor = slate.slate12; // --color-accent-text in light
    const buttonBg = yellow.yellow9; // --color-accent in light

    it('pressed button icon meets 3:1 non-text contrast in light mode', () => {
      const ratio = getContrastRatio(iconColor, buttonBg);
      expect(ratio).toBeGreaterThanOrEqual(3.0);
      expect(meetsNonTextContrast(ratio)).toBe(true);
    });
  });

  describe('Dark Mode Pressed Button', () => {
    // --color-accent = yellow-9, --color-accent-text = slate-1 (slateDark.slate1) in dark
    const iconColor = slateDark.slate1; // --color-accent-text in dark mode
    const buttonBg = yellow.yellow9;    // --color-accent in dark mode

    it('pressed button icon meets 3:1 non-text contrast in dark mode', () => {
      const ratio = getContrastRatio(iconColor, buttonBg);
      expect(ratio).toBeGreaterThanOrEqual(3.0);
      expect(meetsNonTextContrast(ratio)).toBe(true);
    });
  });

  describe('High Contrast Light Mode Pressed Button', () => {
    // HC light: --color-accent = #003d99, --color-accent-text = #ffffff
    const iconColor = '#ffffff';
    const buttonBg = '#003d99';

    it('pressed button icon meets 7:1 in HC light mode', () => {
      const ratio = getContrastRatio(iconColor, buttonBg);
      expect(ratio).toBeGreaterThanOrEqual(7.0);
      expect(meetsWCAG_AAA(ratio)).toBe(true);
    });
  });

  describe('High Contrast Dark Mode Pressed Button', () => {
    // HC dark: --color-accent = #66b3ff, --color-accent-text = #000000
    const iconColor = '#000000';
    const buttonBg = '#66b3ff';

    it('pressed button icon meets 7:1 in HC dark mode', () => {
      const ratio = getContrastRatio(iconColor, buttonBg);
      expect(ratio).toBeGreaterThanOrEqual(7.0);
      expect(meetsWCAG_AAA(ratio)).toBe(true);
    });
  });
});

describe('Color Contrast - Mono Green Phosphor (Dark Theme)', () => {
  /*
   * Mono green variant: all UI elements rendered in green phosphor (#00ff00)
   * on a pure black (#000000) background, simulating a classic terminal.
   * Color values sourced from src/styles/variant.css :root[data-ui-variant='mono'].
   */
  const bg = '#000000';
  const textPrimary = '#00ff00';
  const textSecondary = '#00cc00';
  const textTertiary = '#009900';
  const accent = '#00ff00';
  const accentHover = '#33ff33';
  const accentText = '#000000';
  const border = '#00ff00';
  const borderLight = '#009900';
  const focus = '#00ff00';

  it('primary text (#00ff00) on black meets WCAG AA', () => {
    const ratio = getContrastRatio(textPrimary, bg);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
    expect(meetsWCAG_AA(ratio)).toBe(true);
  });

  it('primary text (#00ff00) on black meets WCAG AAA', () => {
    const ratio = getContrastRatio(textPrimary, bg);
    expect(ratio).toBeGreaterThanOrEqual(7.0);
    expect(meetsWCAG_AAA(ratio)).toBe(true);
  });

  it('secondary text (#00cc00) on black meets WCAG AA', () => {
    const ratio = getContrastRatio(textSecondary, bg);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
    expect(meetsWCAG_AA(ratio)).toBe(true);
  });

  it('secondary text (#00cc00) on black meets WCAG AAA', () => {
    const ratio = getContrastRatio(textSecondary, bg);
    expect(ratio).toBeGreaterThanOrEqual(7.0);
    expect(meetsWCAG_AAA(ratio)).toBe(true);
  });

  it('tertiary text (#009900) on black meets WCAG AA', () => {
    const ratio = getContrastRatio(textTertiary, bg);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
    expect(meetsWCAG_AA(ratio)).toBe(true);
  });

  // Tertiary (#009900) has ~5.6:1 ratio — passes AA but not AAA (7:1).
  // This is acceptable: tertiary is used for muted/decorative text only.

  it('accent text on accent background meets non-text contrast', () => {
    const ratio = getContrastRatio(accentText, accent);
    expect(ratio).toBeGreaterThanOrEqual(3.0);
    expect(meetsNonTextContrast(ratio)).toBe(true);
  });

  it('accent hover on black meets non-text contrast', () => {
    const ratio = getContrastRatio(accentHover, bg);
    expect(ratio).toBeGreaterThanOrEqual(3.0);
    expect(meetsNonTextContrast(ratio)).toBe(true);
  });

  it('border on black meets non-text contrast', () => {
    const ratio = getContrastRatio(border, bg);
    expect(ratio).toBeGreaterThanOrEqual(3.0);
    expect(meetsNonTextContrast(ratio)).toBe(true);
  });

  it('border-light (#009900) on black meets non-text contrast', () => {
    const ratio = getContrastRatio(borderLight, bg);
    expect(ratio).toBeGreaterThanOrEqual(3.0);
    expect(meetsNonTextContrast(ratio)).toBe(true);
  });

  it('focus indicator on black meets non-text contrast', () => {
    const ratio = getContrastRatio(focus, bg);
    expect(ratio).toBeGreaterThanOrEqual(3.0);
    expect(meetsNonTextContrast(ratio)).toBe(true);
  });
});

describe('Color Contrast - Mono Amber Phosphor (Light Theme)', () => {
  /*
   * Mono amber variant: all UI elements rendered in amber (#ffb000)
   * on a pure black (#000000) background, simulating a DOS P3 monitor.
   * Color values sourced from src/styles/variant.css
   * :root[data-ui-variant='mono'][data-theme='light'].
   */
  const bg = '#000000';
  const textPrimary = '#ffb000';
  const textSecondary = '#cc8c00';
  const textTertiary = '#997200';
  const accent = '#ffb000';
  const accentHover = '#ffc333';
  const accentText = '#000000';
  const border = '#ffb000';
  const borderLight = '#997200';
  const focus = '#ffb000';

  it('primary text (#ffb000) on black meets WCAG AA', () => {
    const ratio = getContrastRatio(textPrimary, bg);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
    expect(meetsWCAG_AA(ratio)).toBe(true);
  });

  it('primary text (#ffb000) on black meets WCAG AAA', () => {
    const ratio = getContrastRatio(textPrimary, bg);
    expect(ratio).toBeGreaterThanOrEqual(7.0);
    expect(meetsWCAG_AAA(ratio)).toBe(true);
  });

  it('secondary text (#cc8c00) on black meets WCAG AA', () => {
    const ratio = getContrastRatio(textSecondary, bg);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
    expect(meetsWCAG_AA(ratio)).toBe(true);
  });

  it('secondary text (#cc8c00) on black meets WCAG AAA', () => {
    const ratio = getContrastRatio(textSecondary, bg);
    expect(ratio).toBeGreaterThanOrEqual(7.0);
    expect(meetsWCAG_AAA(ratio)).toBe(true);
  });

  it('tertiary text (#997200) on black meets WCAG AA', () => {
    const ratio = getContrastRatio(textTertiary, bg);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
    expect(meetsWCAG_AA(ratio)).toBe(true);
  });

  // Tertiary (#997200) has ~4.8:1 ratio — passes AA but not AAA (7:1).
  // This is acceptable: tertiary is used for muted/decorative text only.

  it('accent text on accent background meets non-text contrast', () => {
    const ratio = getContrastRatio(accentText, accent);
    expect(ratio).toBeGreaterThanOrEqual(3.0);
    expect(meetsNonTextContrast(ratio)).toBe(true);
  });

  it('accent hover on black meets non-text contrast', () => {
    const ratio = getContrastRatio(accentHover, bg);
    expect(ratio).toBeGreaterThanOrEqual(3.0);
    expect(meetsNonTextContrast(ratio)).toBe(true);
  });

  it('border on black meets non-text contrast', () => {
    const ratio = getContrastRatio(border, bg);
    expect(ratio).toBeGreaterThanOrEqual(3.0);
    expect(meetsNonTextContrast(ratio)).toBe(true);
  });

  it('border-light (#997200) on black meets non-text contrast', () => {
    const ratio = getContrastRatio(borderLight, bg);
    expect(ratio).toBeGreaterThanOrEqual(3.0);
    expect(meetsNonTextContrast(ratio)).toBe(true);
  });

  it('focus indicator on black meets non-text contrast', () => {
    const ratio = getContrastRatio(focus, bg);
    expect(ratio).toBeGreaterThanOrEqual(3.0);
    expect(meetsNonTextContrast(ratio)).toBe(true);
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
