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
 * CW-68 - the converter's frame-to-frame memory, for the GAME's instance only.
 *
 * Measured before it was chosen: walking a Seattle street at the real 4.8 m/s
 * re-rolled 9 to 11 per cent of facade glyphs every converted frame, and mean
 * glyph persistence was 6 to 8 frames. The pick is stateless, so a texel
 * scrolling one pixel is enough to choose a different character, and the
 * reverse-video cliff at MONO_REVERSE_THRESHOLD turns a one per cent drift
 * into a whole solid cell appearing and vanishing.
 *
 * `glyph` is a dead band in squared 6-D shape distance: the previous glyph is
 * kept unless the new candidate is closer than it by more than this. `drive`
 * is a half-width in luminance around the intensity ladder's 0.5 boundary,
 * and `reverse` the same around MONO_REVERSE_THRESHOLD, so reverse video is
 * entered above 0.82 and left below 0.78. The two are separate because the
 * mistakes are different sizes: a drive step changes a cell's brightness,
 * while the reverse cliff turns it into a solid block, and moving THAT is a
 * decision about the look of the game rather than about steadiness.
 * `holdFrames` bounds the smear: no cell may override the plain pick for more
 * than this many conversions in a row, which at the converter's 30/s governor
 * is a second.
 *
 * The main app's Alt View does NOT get this - it converts one still frame, and
 * a memory of a previous frame can only cost it. See src/js/_hfm-hysteresis.js.
 */
/**
 * CW-70 - three treatments of the SOLID BRIGHT LAYER, measured side by side.
 *
 * What "the luminance layer" is, measured: cells at or above
 * MONO_REVERSE_THRESHOLD are painted as solid phosphor with the glyph knocked
 * out of them, and the shopfront bands are painted at 0.93-0.95 luminance,
 * which is the brightest thing in the picture and lands on WHITE in colour.
 * At the spawn that is eight solid bands in a row; a lamp cone paints a solid
 * block on whatever wall it touches; a lamp post two metres away is a solid bar
 * from the pavement to the top of the frame.
 *
 * Three columns, one row each:
 *
 *   stock   what the game has always drawn. The comparison, and the default
 *           until the owner chooses.
 *   calm    the solid layer kept, but bounded: the share of solid cells is
 *           held under `reverseShareCap` by lifting the threshold (see
 *           nextReverseLift), and the shopfront bands come down to about 0.87
 *           so they are still lit without being the whitest thing on screen.
 *   off     no solid cells at all in the game - the intensity ladder only -
 *           and the shopfront bands at about 0.78, below the cliff, so they
 *           read as bright characters rather than slabs.
 *
 * The band scales are multipliers on the painted shopfront canvas, whose
 * brightest paint is 0xef (0.937): 0.93 puts it at 0.871 and 0.83 at 0.777.
 * The cap is 1 % because the lamp-lit pose measures 0.39 % standing and climbs
 * past 2 % during a look - so 1 % bounds the sweep without touching a standing
 * street.
 *
 * ★ `reverseLiftMax` is what keeps `calm` from quietly becoming `off`, and it
 * was measured before it was chosen. A wall of shopfronts is painted at ONE
 * luminance, so no threshold divides "some of them" from "all of them": at a
 * shopfront pose the natural solid share is 4.3 %, four times the cap, and an
 * unbounded cap lifted the threshold until every band had gone - a slow fade
 * to `off` over about twenty frames, which is not a middle option, it is a
 * worse way of choosing the other one. The lift is therefore bounded BELOW the
 * headroom between the cliff and the lit band (0.871 - 0.80 = 0.071), so the
 * cap can bound a sweeping lamp cone and can never delete a lit ground floor.
 * Deleting them is what `off` is for.
 *
 * ONE of `calm` and `off` is deleted in CW-72, once the owner has seen both.
 * Deleting a column and its `setLuminanceLayer` case is the whole removal.
 */
export const LUMINANCE_LAYER = Object.freeze({
  stock: Object.freeze({
    reverseAt: MONO_REVERSE_THRESHOLD,
    reverseShareCap: null,
    reverseLiftMax: 0,
    storefrontScale: 1,
  }),
  calm: Object.freeze({
    reverseAt: MONO_REVERSE_THRESHOLD,
    reverseShareCap: 0.01,
    reverseLiftMax: 0.06,
    storefrontScale: 0.93,
  }),
  off: Object.freeze({
    reverseAt: null,
    reverseShareCap: null,
    reverseLiftMax: 0,
    storefrontScale: 0.83,
  }),
});

/** The treatment the game starts in. The owner chooses the winner at G1. */
export const LUMINANCE_LAYER_DEFAULT = 'stock';

export const CITY_TEMPORAL_HYSTERESIS = Object.freeze({
  glyph: 0.4,
  drive: 0.1,
  reverse: 0.02,
  holdFrames: 30,
});

/**
 * CW-21 — how much of the previous frame a cell is still glowing with.
 *
 * A slow phosphor kept emitting after the beam had passed, which is why an
 * old terminal smeared when it scrolled. Each frame the leftover is multiplied
 * by this, so it is a decay rate rather than a length.
 *
 * CW-39 (CW-Q37): RETIRED at 0. The trail cost 22.3% of every throttled
 * frame — the afterglow pass costs the same at any fade above zero, so
 * retuning recovers nothing; only zero does, because the paint guard skips
 * the pass entirely. The owner played Round 5, called the double-exposure
 * ghosts distracting, and signed the retirement. The machinery all stays:
 * the converter keeps the capability for the main app's Alt View slider,
 * the game still applies this constant (so one number here brings the
 * trail back), and the bench re-enables it per run for A/B through the
 * DEV handle. Reduced-motion handling is unchanged and now vacuous here.
 */
export const MONO_GLOW_FADE = 0;

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
