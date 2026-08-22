/**
 * Retro colour palettes for the ASCII City Walk game (CW-6, reopened CW-18).
 *
 * Owner-signed under CW-Q5/CW-Q6 (2026-08-18) and amended by CW-Q16
 * (2026-08-21): colour is no longer tied to high contrast. The game carries
 * its own Colour toggle, and until the player touches it colour follows high
 * contrast exactly as it always did. Which SET applies still follows the
 * phosphor: the ANSI bright set in green (dark), the neon set in amber
 * (light).
 *
 * Every entry is guarded ≥ 4.5:1 against the black game background in
 * tests/unit/color-contrast.test.js — change a hex and the guard measures the
 * change. Turning colour OFF never drops a player below the floor they had:
 * the bare phosphors are 15.30:1 (green) and 11.46:1 (amber), above the worst
 * entry of their own set. They are NOT above every entry — cyan and yellow
 * both beat green — so the guard measures the floor, not the maximum.
 *
 * @license GPL-3.0-or-later
 */

/** CW-Q5 — green mode: the ANSI bright terminal set. */
export const HC_PALETTE_GREEN = [
  '#00ff00', // bright green
  '#00ffff', // cyan
  '#ffff00', // yellow
  '#ff00ff', // magenta
  // CW-Q11: the soft red was the busiest entry in this set, taking 27 of the
  // 88 scene tints because hues 0 AND 30 both fell to it. Saturating it hands
  // the warm-yellow hues back to the yellow entry (red 27 -> 25).
  '#ff3333', // red
  '#ffffff', // white
];

/** CW-Q6 — amber mode: the cyberpunk neon set. */
export const HC_PALETTE_AMBER = [
  '#ff2d95', // hot pink
  '#00ffff', // cyan
  '#aaff00', // lime
  // CW-Q11: foliage had no colour of its own here - a tree canopy and a
  // yellow-green building both fell to lime. A seventh entry gives the trees
  // green and leaves lime to the buildings; one more glyph atlas costs a
  // measured 0.2 ms to build.
  '#39ff5e', // foliage green
  '#bf5fff', // violet
  '#ff9f00', // neon orange
  '#ffffff', // white
];

/**
 * CW-21 — the monochrome intensity levels, dimmest first.
 *
 * A monochrome tube had ONE intensity bit, and this is it: a cell is either
 * driven fully or driven down. Nothing here is brighter than the bare
 * phosphor, so the peak the game has always had is unchanged and only the
 * darker half of the picture separates out from it.
 *
 * 0.65 is the floor the phosphors allow, not a taste: MEASURED on black,
 * green dims 15.30:1 -> 6.45:1 and amber 11.46:1 -> 5.03:1, both still over
 * the 4.5:1 this project holds itself to, while 0.55 drops amber to 3.82:1
 * and fails. tests/unit/color-contrast.test.js drives the same function the
 * renderer does and re-measures both phosphors at every level.
 *
 * Applies to MONOCHROME only — with colour on, each cell's atlas is already
 * chosen by its palette entry.
 */
export const MONO_INTENSITY_LEVELS = [0.65, 1];
