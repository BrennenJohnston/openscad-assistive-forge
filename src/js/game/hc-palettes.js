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
 * Two columns, one row each:
 *
 *   off     THE GAME'S DEFAULT since CW-72, on the owner's answer to CW-Q74 at
 *           G1: no solid cells at all - the intensity ladder only - and the
 *           shopfront bands at about 0.78, below the cliff, so they read as
 *           bright characters rather than slabs. Measured at a shopfront pose:
 *           the solid cells go 2,936 to 0 while the shopfronts' LIT cells only
 *           move 4,162 to 4,042, so it costs three per cent of the ink and all
 *           of the solidity.
 *   stock   what the game drew before. Kept as the comparison an instrument
 *           run can switch back to, not as anything a player can reach.
 *
 * A third column, `calm`, was built and measured for this choice and DELETED
 * here when the owner picked `off`. It bounded the SHARE of solid cells with a
 * controller instead of removing them; its measurement is in the CW-70 record,
 * and the one thing worth carrying forward is that a cap on a share must be
 * bounded below the lit band's headroom or it becomes `off` by a slower route.
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
  // ★★★ CALM IS BACK, AND WHY IT LEFT MATTERS. CW-70 built these three
  // treatments and photographed them; the owner read the pictures at G1 and
  // chose `off`, so CW-72 deleted this column. Playing the deployed build,
  // they said the result was "sad" - and the pictures they chose from were
  // STILLS. This round wrote down that a still is not a filmstrip (T-CW) and
  // then let a GATE question be answered from stills anyway.
  //
  // `reverseShareCap` bounds how much of the frame may go solid; the LIFT
  // bound below it is what keeps this from quietly becoming `off` (CW-70
  // measured an unbounded cap oscillating 10,164 solid crossings over 47
  // STANDING frames). Measured at the shopfront pose, standing, at the
  // default size: 2,936 solid cells on `stock`, 2,261 here, 0 on `off`.
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
    // ★ AND THIS 0.83 IS THE PART NOBODY ASKED FOR. `off` was chosen as "no
    // solid cells"; it also dims every lit shopfront band by 17 %, because
    // the three treatments always moved both halves together. Kept here so
    // the column still means what it meant, but it is no longer the default.
    storefrontScale: 0.83,
  }),
});

/**
 * CW-71 - the palette-mode INK BUDGET the game asks for.
 *
 * Measured before it was chosen. At the Seattle spawn, in colour, 70 to 83 per
 * cent of ALL cells carry ink and 54 to 62 per cent of them are WHITE, against
 * 3 to 7 per cent inked in monochrome. The cause is structural: palette mode
 * has no intensity ladder, the cell contrast curve normalises every cell to
 * full scale before its glyph is chosen, and a colour is then put on whatever
 * came out - so a cell's ABSOLUTE brightness never reaches the picture.
 *
 * `floor` is the monochrome ladder's own blank level, applied to colour. Its
 * consequence is deliberate and large: colour mode inks about as much of the
 * screen as monochrome does, because that is what the same rule produces.
 * `whiteLum` and `whiteChroma` are the gate on the white entry, which is what
 * a low-chroma highlight lands on through the D-112 sRGB match.
 *
 * ★ THE FLOOR IS 0.3, ANSWERED BY THE OWNER AT G1 (CW-Q79), not the 0.5 that
 * CW-71 shipped. Measured at the Seattle spawn, standing, at the default size:
 *
 *   no budget        89.3 % inked, 61.8 % white   flat white fields
 *   white gate only  89.2 % inked,  0.01 % white  the SAME fields, in teal
 *   floor 0.3        28.5 % inked,  0.01 % white  a street again  <- chosen
 *   floor 0.5         3.1 % inked,  0.01 % white  near-black, lights only
 *
 * The white gate alone removes every white cell and changes nothing else,
 * which is how it is known that the flatness was never only about white. 0.3
 * keeps a street you can read; 0.5 is the monochrome rule and empties it.
 */
export const CITY_PALETTE_INK_BUDGET = Object.freeze({
  // ★★★ THE FLOOR IS OFF, AND THE WHITE GATE STAYS. Answered by the owner
  // after playing the deployed build: at 0.3 the screen is 28.5 % inked where
  // it used to be 89.3 %, and seven cells in ten are simply black. The two
  // halves of this budget were always separable and the measurement above
  // says which one did which job - the white gate ALONE takes white from
  // 61.8 % to 0.01 % and changes nothing else, so it is the gate that killed
  // the flat white fields and the floor that made the city dark. The gate
  // stays; the floor goes. `normalizeInkBudget` keeps the gate alive at
  // floor 0 and only returns null when BOTH are off.
  floor: 0,
  whiteLum: 0.9,
  whiteChroma: 0.12,
});

/** The treatment the game draws, answered by the owner at G1 (CW-Q74). */
// The owner's second answer, given after playing the build rather than
// reading a photograph of it: solid cells back, but capped.
export const LUMINANCE_LAYER_DEFAULT = 'calm';

export const CITY_TEMPORAL_HYSTERESIS = Object.freeze({
  // ★★★ THE MEMORY IS THE TRAIL. CW-68 bought the strobe fix with a smear and
  // nobody said so out loud, because its own "ghost rate" metric asked a
  // narrower question - inked cells that changed SURFACE and kept their glyph
  // - than the one an owner walking through the city was asking. The number
  // that answers theirs is mean glyph PERSISTENCE while walking, measured at
  // the spawn, 30 %, mono, 24 frames, on an RTX 3080 Ti:
  //
  //   memory off        6.69 frames   glyph flip 1.14 %   churn cells 3.11 %
  //   0.4 / 30 (was)   13.06          flip 0.17           churn 0
  //   0.15 / 8         10.86          flip 0.26           churn 0
  //   0.06 / 5          9.41          flip 0.48           churn 0   <- shipped
  //
  // At 0.4 a cell had to see its brightness move 40 % of the whole range
  // before it was allowed a new glyph - twenty times the module's own default
  // - and failing that it held for 30 conversions, about ONE SECOND at the
  // converter's governor. That is frames blending together, and it is what
  // the owner reported on the deployed build.
  //
  // ★ IT CANNOT BE TUNED AWAY, ONLY TRADED: persistence and flicker move
  // together on this one knob, and the separation experiment says neither
  // half owns it (holding the band at 0.4 and cutting the hold to 4 gives
  // 10.98; cutting the band to 0.08 and holding 30 gives 10.24). The real fix
  // is a THIRD reset - drop the memory when the cell's geometry moves under
  // it, not only when its surface CLASS changes - which keeps the memory
  // exactly where the picture is genuinely still. That is follow-up work and
  // it is written down rather than half-done here.
  glyph: 0.06,
  drive: 0.03,
  reverse: 0.02,
  holdFrames: 5,
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
