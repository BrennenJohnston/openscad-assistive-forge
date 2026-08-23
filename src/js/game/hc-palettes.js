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

/**
 * CW-21 — the luminance at which a monochrome cell flips to reverse video.
 *
 * The densest printable ASCII glyph inks only 43-58% of its cell, so no
 * character can make a cell read as a LIT surface. Solid phosphor with the
 * glyph knocked out is the only way past that, and it is a highlight for the
 * few brightest cells rather than a tone in the ramp — a band of solid cells
 * stops reading as brightness and starts reading as a painted wall.
 *
 * 0.8 was chosen on the measured share of a real Seattle street, not by feel:
 *
 *     >= 0.95, 0.90       0 cells of 30,096 — it would never fire at all
 *     >= 0.85             5 cells (0.02%)   — indistinguishable from off
 *     >= 0.80           566 cells (1.88%)   — the lit sign faces, the
 *                                             billboard and the lamp heads
 *     >= 0.70         1,318 cells (4.38%)   — every lit window as well, and
 *                                             the signs stop being the
 *                                             brightest thing in the street
 *
 * The share barely moves with character size (1.88% at 50%, 1.86% at the 10%
 * floor), so one threshold serves the whole range.
 */
export const MONO_REVERSE_THRESHOLD = 0.8;

/**
 * CW-21 — how much of the previous frame a cell is still glowing with.
 *
 * A slow phosphor kept emitting after the beam had passed, which is why an
 * old terminal smeared when it scrolled. Each frame the leftover is multiplied
 * by this, so it is a decay rate rather than a length: 0.45 is gone inside
 * about three frames, which reads as a soft persistence behind movement and
 * not as a smear you have to wait out.
 *
 * Motion, so it follows prefers-reduced-motion and stops entirely when that is
 * set — the renderer refuses a fade in that state and the game re-applies this
 * when the preference changes mid-walk.
 */
export const MONO_GLOW_FADE = 0.45;

/**
 * Bloom radius in device pixels, haloed into each glyph when the atlas is
 * built — so it costs nothing per frame, and changing it rebuilds the atlas.
 *
 * The owner turned bloom on (CW-Q36) after seeing it photographed at their own
 * character size, the 10% floor, where a cell is about 2x4 px. The radius is
 * an absolute pixel count, so it means something quite different at the two
 * ends of the size range, and the floor is the end that constrains it: at 1 px
 * the lit shopfront panes stop having gaps between them, and separation
 * between characters is the whole readability of an ASCII picture. At 0.75 px
 * the panes stay apart along the full width and the halo is still plainly
 * there.
 *
 * ONE CONSTANT, deliberately, until the slider CW-Q36 records as future work
 * gives this a home in the interface.
 */
export const MONO_BLOOM_PX = 0.75;
