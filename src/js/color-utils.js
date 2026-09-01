/**
 * Color Utility Functions
 * Shared utilities for color validation and conversion
 * @license GPL-3.0-or-later
 */

/**
 * Desktop OpenSCAD `#` debug-modifier highlight color.
 * Source: openscad/src/glview/Renderer.cc — CGAL_HIGHLIGHT {255, 81, 81, 128}
 *
 * The `#` modifier OVERRIDES any user-defined `color()` call; it does not
 * blend. SVG/DXF export ignores model colors entirely (fixed stroke/fill).
 */
export const DEBUG_HIGHLIGHT_COLOR = Object.freeze({
  r: 255,
  g: 81,
  b: 81,
  a: 128,
});

export const DEBUG_HIGHLIGHT_HEX = '#ff5151';
export const DEBUG_HIGHLIGHT_OPACITY = 128 / 255;

/**
 * Normalize a hex color value to standard format (#RRGGBB)
 * @param {string} value - Color value (with or without #)
 * @returns {string|null} Normalized hex color or null if invalid
 */
export function normalizeHexColor(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  // Add # if missing
  const normalized = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;

  // Validate format (#RRGGBB)
  return /^#[0-9A-Fa-f]{6}$/.test(normalized) ? normalized : null;
}

/**
 * Convert hex color to RGB array [r, g, b] (0-255 range)
 * @param {string} hex - Hex color code (with or without #)
 * @returns {Array<number>|null} RGB array [r, g, b] or null if invalid
 */
export function hexToRgb(hex) {
  if (typeof hex !== 'string') return null;

  // Remove # if present
  hex = hex.replace(/^#/, '');

  // Convert 3-digit hex to 6-digit
  if (hex.length === 3) {
    hex = hex
      .split('')
      .map((c) => c + c)
      .join('');
  }

  // Validate 6-digit hex
  if (!/^[0-9A-Fa-f]{6}$/.test(hex)) {
    return null;
  }

  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  return [r, g, b];
}

/**
 * Validate if a string is a valid hex color
 * @param {string} value - Value to validate
 * @returns {boolean} True if valid hex color
 */
export function isValidHexColor(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  // Allow both #RRGGBB and RRGGBB formats
  return /^#?[0-9A-Fa-f]{6}$/.test(trimmed);
}

/**
 * WCAG relative luminance of a hex colour, 0 (black) to 1 (white).
 * @param {string} hex - #rgb or #rrggbb
 * @returns {number|null} Null when the value is not a hex colour
 */
export function relativeLuminance(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb;
  const channel = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * WCAG contrast ratio between two hex colours, 1 to 21.
 *
 * Added for the drawing editor's highlight (DP-21), whose two strokes have to
 * read on any region colour: the number this returns is what the record
 * quotes, so it is the app's own arithmetic and not a test's.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number|null} Null when either value is not a hex colour
 */
export function contrastRatio(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  if (la === null || lb === null) return null;
  const [light, dark] = la >= lb ? [la, lb] : [lb, la];
  return (light + 0.05) / (dark + 0.05);
}
