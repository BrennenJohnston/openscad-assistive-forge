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
