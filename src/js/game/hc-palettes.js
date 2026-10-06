/**
 * Retro color palettes for the ASCII City Walk game.
 *
 * Color is not tied to high contrast. The game carries its own Color toggle,
 * and until the player touches it color follows high contrast. Which set
 * applies follows the phosphor: the ANSI bright set in green (dark), the
 * neon set in amber (light).
 *
 * Every entry is guarded ≥ 4.5:1 against the black game background in
 * tests/unit/color-contrast.test.js — change a hex and the guard measures the
 * change. Turning color OFF never drops a player below the floor they had:
 * the bare phosphors are 15.30:1 (green) and 11.46:1 (amber), above the worst
 * entry of their own set. They are NOT above every entry — cyan and yellow
 * both beat green — so the guard measures the floor, not the maximum.
 *
 * @license GPL-3.0-or-later
 */

/** Green mode: the ANSI bright terminal set. */
export const HC_PALETTE_GREEN = [
  '#00ff00', // bright green
  '#00ffff', // cyan
  '#ffff00', // yellow
  '#ff00ff', // magenta
  // A softer red would be the busiest entry in this set, taking 27 of the 88
  // scene tints because hues 0 and 30 both fall to it. Saturating it hands
  // the warm-yellow hues back to the yellow entry (red 27 -> 25).
  '#ff3333', // red
  '#ffffff', // white
];

/** Amber mode: the cyberpunk neon set. */
export const HC_PALETTE_AMBER = [
  '#ff2d95', // hot pink
  '#00ffff', // cyan
  '#aaff00', // lime
  // Foliage needs a color of its own here - without it a tree canopy and a
  // yellow-green building both fall to lime. A seventh entry gives the trees
  // green and leaves lime to the buildings; one more glyph atlas costs a
  // measured 0.2 ms to build.
  '#39ff5e', // foliage green
  '#bf5fff', // violet
  '#ff9f00', // neon orange
  '#ffffff', // white
];

/**
 * The monochrome intensity levels, dimmest first.
 *
 * A monochrome tube had ONE intensity bit, and this is it: a cell is either
 * driven fully or driven down. Nothing here is brighter than the bare
 * phosphor, so the peak the game has always had is unchanged and only the
 * darker half of the picture separates out from it.
 *
 * 0.65 is the floor the phosphors allow, not a taste: measured on black,
 * green dims 15.30:1 -> 6.45:1 and amber 11.46:1 -> 5.03:1, both still over
 * the 4.5:1 this project holds itself to, while 0.55 drops amber to 3.82:1
 * and fails. tests/unit/color-contrast.test.js drives the same function the
 * renderer does and re-measures both phosphors at every level.
 *
 * Applies to MONOCHROME only — with color on, each cell's atlas is already
 * chosen by its palette entry.
 */
export const MONO_INTENSITY_LEVELS = [0.65, 1];

/**
 * The luminance at which a monochrome cell flips to reverse video.
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
 * The converter's frame-to-frame memory, for the game's instance only.
 *
 * Without it, walking a Seattle street at the real 4.8 m/s re-rolls 9 to 11
 * per cent of facade glyphs every converted frame, and mean glyph
 * persistence is 6 to 8 frames. The pick is stateless, so a texel
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
 * Three treatments of the solid bright layer.
 *
 * The layer: cells at or above MONO_REVERSE_THRESHOLD are painted as solid
 * phosphor with the glyph knocked out of them, and the shopfront bands are
 * painted at 0.93-0.95 luminance, which is the brightest thing in the
 * picture and lands on white in color. At the spawn that is eight solid
 * bands in a row; a lamp cone paints a solid block on whatever wall it
 * touches; a lamp post two meters away is a solid bar from the pavement to
 * the top of the frame.
 *
 *   stock   every cell over the threshold goes solid, shopfronts at full
 *           scale.
 *   calm    the default: solid cells, but their share of the frame is
 *           capped.
 *   off     no solid cells at all - the intensity ladder only - and the
 *           shopfront bands at about 0.78, below the cliff, so they read as
 *           bright characters rather than slabs.
 *
 * The band scales are multipliers on the painted shopfront canvas, whose
 * brightest paint is 0xef (0.937): 0.93 puts it at 0.871 and 0.83 at 0.777.
 * The cap is 1 % because the lamp-lit pose measures 0.39 % standing and climbs
 * past 2 % during a look - so 1 % bounds the sweep without touching a standing
 * street.
 *
 * `reverseLiftMax` is what keeps `calm` from quietly becoming `off`. A wall
 * of shopfronts is painted at one luminance, so no threshold divides "some
 * of them" from "all of them": at a shopfront pose the natural solid share
 * is 4.3 %, four times the cap, and an unbounded cap lifts the threshold
 * until every band has gone - a slow fade to `off` over about twenty frames.
 * The lift is therefore bounded below the headroom between the cliff and
 * the lit band (0.871 - 0.80 = 0.071), so the cap can bound a sweeping lamp
 * cone and can never delete a lit ground floor.
 */
export const LUMINANCE_LAYER = Object.freeze({
  stock: Object.freeze({
    reverseAt: MONO_REVERSE_THRESHOLD,
    reverseShareCap: null,
    reverseLiftMax: 0,
    storefrontScale: 1,
  }),
  // `reverseShareCap` bounds how much of the frame may go solid; the lift
  // bound below it is what keeps this from quietly becoming `off`. At the
  // shopfront pose, standing, at the default size: 2,936 solid cells on
  // `stock`, 2,261 here, 0 on `off`.
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
    // `off` also dims every lit shopfront band by 17 %, not only the solid
    // cells.
    storefrontScale: 0.83,
  }),
});

/**
 * The palette-mode ink budget the game asks for.
 *
 * At the Seattle spawn, in color, with no budget, 70 to 83 per cent of all
 * cells carry ink and 54 to 62 per cent of them are white, against 3 to 7
 * per cent inked in monochrome. The cause is structural: palette mode has no
 * intensity ladder, the cell contrast curve normalizes every cell to full
 * scale before its glyph is chosen, and a color is then put on whatever came
 * out - so a cell's absolute brightness never reaches the picture.
 *
 * `floor` is the monochrome ladder's own blank level, applied to color.
 * `whiteLum` and `whiteChroma` are the gate on the white entry, which is what
 * a low-chroma highlight lands on through the sRGB match. Measured at the
 * Seattle spawn, standing, at the default size:
 *
 *   no budget        89.3 % inked, 61.8 % white   flat white fields
 *   white gate only  89.2 % inked,  0.01 % white  the same fields, in teal
 *   floor 0.3        28.5 % inked,  0.01 % white  seven cells in ten black
 *   floor 0.5         3.1 % inked,  0.01 % white  near-black, lights only
 *
 * The two halves are separable: the white gate alone removes every white
 * cell and changes nothing else, and the floor is what makes the city dark.
 */
export const CITY_PALETTE_INK_BUDGET = Object.freeze({
  // The floor is off and the white gate stays: the gate is what removes the
  // flat white fields, and a floor leaves most of the screen black.
  // `normalizeInkBudget` keeps the gate alive at floor 0 and only returns
  // null when both are off.
  floor: 0,
  whiteLum: 0.9,
  whiteChroma: 0.12,
});

/**
 * What color each surface is.
 *
 * The city is achromatic end to end. Over all 60 materials in a Seattle
 * session, almost every `material.color` is 1,1,1; the per-mesh textures are
 * neutral gray (buildings 0.269, storefronts 0.309, ground 0.034, sidewalks
 * 0.053, r = g = b); both scene lights are pure white; the fog is pure black.
 * Fed through `pickPaletteIndex`, 51 of the 60 land on the palette's white
 * entry. So there is no surface color to read, and a hue taken from the
 * picture would be manufactured out of the last digit or two of a gray
 * image - a whole face would cross a palette boundary together as the camera
 * moved. The palette is authored here instead.
 *
 * Six entries for fifteen classes, so surfaces share - and that is safe
 * because color does not carry identity on its own: shape identifies, and
 * every surface has its own character set in color mode. A tree and the
 * building behind it can share the green phosphor here because one is drawn
 * with `@ v o O` and the other with `| [ ] ( ) { }`.
 *
 * No surface takes white, and that is a correctness rule rather than a taste:
 * the ink budget gates the white entry on luminance and chroma, and its
 * guard is written on the assumption that a surface family is never white. A
 * white family would walk straight past that gate. White is left to the sky and
 * to anything the class pass could not name, which keep the screen pick.
 *
 * The amber set has seven entries, not six: `#39ff5e` exists because a tree
 * canopy and a yellow-green building would both fall to lime, and it is used
 * here for foliage.
 *
 * Keyed by `SURFACE_CLASS` id, as literals for the same reason
 * `CITY_BACKING_EXEMPT_CLASS_IDS` and `ANCHORED_CLASSES` are: importing the
 * enum here would close a cycle. A unit case asserts every id is the class it
 * claims to be.
 */
export const CITY_INK_FAMILY = Object.freeze({
  // green: 0 green, 1 cyan, 2 yellow, 3 magenta, 4 red, 5 white
  green: Object.freeze({
    1: 2, // GROUND, bare earth, warm
    2: 1, // ROAD, asphalt, cool
    3: 1, // CURB, the road's own material
    4: 0, // BUILDING_WALL, the fabric of the city on a green phosphor
    5: 0, // BUILDING_ROOF
    6: 2, // STOREFRONT, lit glass
    7: 3, // SIGN, the brightest markers on the street
    8: 1, // MAST, metal
    9: 0, // TREE, foliage - told from a wall by its characters, not its hue
    10: 4, // CAR
    11: 2, // LAMP, warm metal and warm light
    12: 4, // PERSON, the other moving thing
    13: 2, // SIDEWALK, concrete, warmer than the carriageway beside it
    14: 0, // GREEN, planting
  }),
  // amber: 0 hot pink, 1 cyan, 2 lime, 3 foliage green, 4 violet,
  //        5 neon orange, 6 white
  amber: Object.freeze({
    1: 5, // GROUND
    2: 1, // ROAD
    3: 1, // CURB
    4: 2, // BUILDING_WALL, the entry left to the buildings
    5: 2, // BUILDING_ROOF
    6: 5, // STOREFRONT
    7: 0, // SIGN
    8: 1, // MAST
    9: 3, // TREE, the entry minted for foliage
    10: 4, // CAR
    11: 5, // LAMP
    12: 4, // PERSON
    13: 5, // SIDEWALK
    14: 3, // GREEN
  }),
});

/** The treatment the game draws: solid cells, but capped. */
export const LUMINANCE_LAYER_DEFAULT = 'calm';

// ---------------------------------------------------------------------------
// The backing behind the characters ("Day")
// ---------------------------------------------------------------------------
//
// A blank cell in this game is the page's black, and the only solid paint is
// the bright reverse-video layer. The backing fills the black gaps on nearby
// surfaces with a dark, material-coloured tint under the glyphs - road slate,
// pavement tan, a trunk brown - while the sky stays black and the far skyline
// stays bare. That is what makes a car read as a solid mass rather than as
// characters in front of nothing.
//
// The backing takes contrast away. Without it every glyph sits on pure
// black, the most contrast a screen can give. Painting anything behind it
// lowers the ratio, so every tint below is bounded by measurement rather than
// by taste: the guard in tests/unit/game/city-backing.test.js drives
// colorjs.io over every palette entry against every tint, at the dimmest
// drive the mono ladder ships, and holds the 4.5:1 this project holds itself
// to. A tint that reads nicely and measures 4.3 is not a tint this file may
// carry.
//
// The numbers are deliberately dark for that reason. They say "a surface is
// here" and must never read as ink.

/** Full-strength backing out to here, in meters. */
export const CITY_BACKING_NEAR_M = 60;

/**
 * Gone by here. It is the fog's own far plane (city-scene.js), so the tint
 * and the fog agree about where the world ends; a backing that outlived the
 * fog would draw a skyline the scene has already faded to black.
 */
export const CITY_BACKING_FAR_M = 260;

/**
 * Classes that are never backed, by SURFACE_CLASS id.
 *
 * Only the sky, for two reasons: it is not a surface, and a cell the city
 * does not cover reads depth 0, which would otherwise back the entire sky at
 * full strength as though it were a wall against the lens.
 *
 * Numeric rather than imported so this module stays a leaf with no imports at
 * all - the converter, the controller and eight test files load it. The guard
 * that every id here is a real class lives in the test, which is free to
 * import the class list.
 */
export const CITY_BACKING_EXEMPT_CLASS_IDS = Object.freeze([0]);

/**
 * Monochrome backing: the phosphor itself, driven down.
 *
 * A single-phosphor tube has one color, so a mono backing cannot be a
 * material tint - it is the same phosphor at a low drive, which is what a
 * dark surface looked like on the hardware this game imitates. Values are the
 * `drive` argument to driveColor(), the same function the renderer paints
 * with.
 *
 * The two phosphors cannot carry the same backing, and amber is the
 * binding one. Measured through driveColor and colorjs.io against the dimmest
 * ink the ladder ships (drive 0.65): green (#00ff00) holds 4.6:1 up to a
 * backing drive of **0.180**, amber (#ffb000) only to **0.080** - amber's ink
 * is itself much darker, so the gap between ink and backing closes more than
 * twice as fast. A single table would either waste green or fail amber, so
 * each phosphor gets the brightest backing it can carry and the guard
 * measures both. The consequence is worth saying out loud: in monochrome the
 * backing is a good deal fainter in amber than in green, and fainter in both
 * than in color. It is a contrast bound, not a taste, and it cannot be
 * turned up without taking legibility off a player who has no other cue.
 *
 * Every value is far below the ladder's dimmest ink level (0.65), so a blank
 * cell over backing reads as surface and can never be taken for a character
 * that happens to be dim.
 *
 * Keyed by SURFACE_CLASS id; the names are in the comments because this file
 * has no imports.
 */
export const CITY_BACKING_MONO_DRIVE = Object.freeze({
  green: Object.freeze({
    0: 0, // SKY - exempt; the row exists so the table is total over the classes
    1: 0.06, // GROUND
    2: 0.07, // ROAD
    3: 0.09, // CURB
    4: 0.1, // BUILDING_WALL
    5: 0.08, // BUILDING_ROOF
    6: 0.12, // STOREFRONT
    7: 0.12, // SIGN
    8: 0.08, // MAST
    9: 0.08, // TREE
    10: 0.11, // CAR
    11: 0.09, // LAMP
    12: 0.11, // PERSON
    13: 0.09, // SIDEWALK
    14: 0.07, // GREEN
  }),
  // The same shape, scaled to amber's measured ceiling of 0.08. The ORDER is
  // kept exactly: a road still reads darker than a storefront.
  amber: Object.freeze({
    0: 0, // SKY - exempt
    1: 0.04, // GROUND
    2: 0.045, // ROAD
    3: 0.06, // CURB
    4: 0.065, // BUILDING_WALL
    5: 0.055, // BUILDING_ROOF
    6: 0.08, // STOREFRONT
    7: 0.08, // SIGN
    8: 0.055, // MAST
    9: 0.055, // TREE
    10: 0.075, // CAR
    11: 0.06, // LAMP
    12: 0.075, // PERSON
    13: 0.06, // SIDEWALK
    14: 0.045, // GREEN
  }),
});

/**
 * Color backing: a dark material tint per class, per palette.
 *
 * The reference's own way of doing it - the surface says what it is made of,
 * not what color the glyph on it happens to be. The two palettes get their
 * own rows because a green-phosphor city and a neon-amber one are different
 * worlds and a slate that sits right in one reads cold in the other. The
 * tints are NOT palette entries: a backing is painted straight into the frame
 * buffer and never goes through a glyph atlas.
 */
export const CITY_BACKING_COLOUR = Object.freeze({
  green: Object.freeze({
    0: '#000000', // SKY - exempt
    1: '#0d0f0c', // GROUND, dark earth
    2: '#0e1012', // ROAD, slate
    3: '#111310', // CURB
    4: '#101211', // BUILDING_WALL
    5: '#0c0e0d', // BUILDING_ROOF
    6: '#12120c', // STOREFRONT, warm
    7: '#110e12', // SIGN
    8: '#0e0e0e', // MAST
    9: '#0a0f0a', // TREE, dark foliage
    10: '#0f1113', // CAR, body
    11: '#12110b', // LAMP, warm metal
    12: '#100e11', // PERSON
    13: '#12110d', // SIDEWALK, tan
    14: '#090e09', // GREEN, dark planting
  }),
  amber: Object.freeze({
    0: '#000000', // SKY - exempt
    1: '#100d0a', // GROUND
    2: '#0f1013', // ROAD, slate
    3: '#131110', // CURB
    4: '#121011', // BUILDING_WALL
    5: '#0e0c0d', // BUILDING_ROOF
    6: '#14110b', // STOREFRONT
    7: '#120d13', // SIGN
    8: '#0f0e0e', // MAST
    9: '#0b0f0b', // TREE
    10: '#101113', // CAR
    11: '#14110a', // LAMP
    12: '#110e12', // PERSON
    13: '#13110c', // SIDEWALK
    14: '#0a0e0a', // GREEN
  }),
});

export const CITY_TEMPORAL_HYSTERESIS = Object.freeze({
  // The memory is also a trail: persistence and flicker move together on
  // this one knob. Mean glyph persistence while walking, at the spawn, 30 %,
  // mono, 24 frames, on an RTX 3080 Ti:
  //
  //   memory off        6.69 frames   glyph flip 1.14 %   churn cells 3.11 %
  //   0.4 / 30         13.06          flip 0.17           churn 0
  //   0.15 / 8         10.86          flip 0.26           churn 0
  //   0.06 / 5          9.41          flip 0.48           churn 0   <- in use
  //
  // At 0.4 a cell has to see its brightness move 40 % of the whole range
  // before it is allowed a new glyph, and failing that it holds for 30
  // conversions, about one second at the converter's governor. That is
  // frames blending together.
  //
  // It cannot be tuned away, only traded (holding the band at 0.4 and
  // cutting the hold to 4 gives 10.98; cutting the band to 0.08 and holding
  // 30 gives 10.24). The real fix would be a third reset - drop the memory
  // when the cell's geometry moves under it, not only when its surface class
  // changes - which keeps the memory exactly where the picture is genuinely
  // still.
  glyph: 0.06,
  drive: 0.03,
  reverse: 0.02,
  holdFrames: 5,
});

/**
 * How much of the previous frame a cell is still glowing with.
 *
 * A slow phosphor kept emitting after the beam had passed, which is why an
 * old terminal smeared when it scrolled. Each frame the leftover is multiplied
 * by this, so it is a decay rate rather than a length.
 *
 * Off at 0. The trail costs 22.3% of every throttled frame — the afterglow
 * pass costs the same at any fade above zero, so only zero recovers it,
 * because the paint guard skips the pass entirely — and its double-exposure
 * ghosts are distracting. The machinery stays: the converter keeps the
 * capability for the main app's Alt View slider, the game still applies
 * this constant (so one number here brings the trail back), and the bench
 * re-enables it per run through the DEV handle. Reduced-motion handling is
 * unchanged, and has nothing to do while this is 0.
 */
export const MONO_GLOW_FADE = 0;

/**
 * Bloom radius in device pixels, haloed into each glyph when the atlas is
 * built — so it costs nothing per frame, and changing it rebuilds the atlas.
 *
 * The radius is an absolute pixel count, so it means something quite
 * different at the two ends of the size range, and the 10% floor, where a
 * cell is about 2x4 px, is the end that constrains it: at 1 px the lit
 * shopfront panes stop having gaps between them, and separation between
 * characters is the whole readability of an ASCII picture. At 0.75 px the
 * panes stay apart along the full width and the halo is still plainly there.
 *
 * One constant, deliberately; there is no slider for it in the interface.
 */
export const MONO_BLOOM_PX = 0.75;
