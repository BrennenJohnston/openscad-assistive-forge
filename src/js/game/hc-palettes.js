/**
 * High-contrast glyph palettes for the ASCII City Walk game (CW-6).
 *
 * Owner-signed under CW-Q5/CW-Q6 (2026-08-18): multicolor rendering exists
 * ONLY under high contrast. Green and amber normal modes stay single-color
 * phosphor forever (CW-Q2). Every entry is guarded ≥ 4.5:1 against the black
 * game background in tests/unit/color-contrast.test.js — change a hex and
 * the guard measures the change.
 *
 * @license GPL-3.0-or-later
 */

/** CW-Q5 — green mode + high contrast: the ANSI bright terminal set. */
export const HC_PALETTE_GREEN = [
  '#00ff00', // bright green
  '#00ffff', // cyan
  '#ffff00', // yellow
  '#ff00ff', // magenta
  '#ff5555', // soft red
  '#ffffff', // white
];

/** CW-Q6 — amber mode + high contrast: the cyberpunk neon set. */
export const HC_PALETTE_AMBER = [
  '#ff2d95', // hot pink
  '#00ffff', // cyan
  '#aaff00', // lime
  '#bf5fff', // violet
  '#ff9f00', // neon orange
  '#ffffff', // white
];
