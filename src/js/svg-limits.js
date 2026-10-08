/**
 * The three drawing numbers the parameter UI needs before it loads the
 * drawing geometry.
 *
 * Everything that reads, prepares and nests a drawing - the preparer, the
 * editor workspace, the nesting tree and the clipping library under them -
 * loads on demand (svg-geometry.js): a model with no picture parameter
 * never downloads it. But the customizer has to know three things while it
 * renders: how many layer parameters to look for, how many layers a design
 * may be split into, and what width a design prints at when nothing says.
 *
 * They are defined here, once. `svg-preparer.js`, `svg-nesting.js` and
 * `svg-preparer-workspace.js` re-export them rather than declaring their
 * own. A value that exists in more than one file is this project's oldest
 * bug.
 *
 * @license GPL-3.0-or-later
 */

/**
 * The tiered charm model builds three passes, so no more than three files
 * are ever written.
 */
export const LAYER_EMIT_CAP = 3;

/**
 * The layer cap. Three passes is what the tiered charm model builds, so the
 * editor never offers a fourth even when the artwork could support one. The
 * limit a file earns is its nesting depth; this is the ceiling applied to
 * it.
 */
export const LAYER_CAP = 3;

/**
 * How wide the editor takes a design to be printed when the model does not
 * say. The Design width control offers it and the thin-line advisory
 * measures against it.
 */
export const DEFAULT_DESIGN_WIDTH_MM = 14;
