/**
 * The two stencil numbers the app needs BEFORE it loads the stencil engine.
 *
 * Everything that turns a drawing into plates - the colour model, the ring
 * geometry, the plate builder, the jig - is a lazy chunk (DP-17): most people
 * never open a stencil, and putting it in the core bundle took the whole
 * budget. But the customizer has to know two things before any of that
 * arrives: how many plate parameters to look for, and what the jig numbers
 * are when a model does not name them.
 *
 * ★ THEY ARE DEFINED HERE, ONCE. `stencil-plates.js` and `stencil-jig.js`
 * re-export them rather than declaring their own, and the .scad's defaults are
 * pinned against these in `stencil-maker-integration.test.js`. A value that
 * exists in more than one file is this project's oldest bug.
 *
 * @license GPL-3.0-or-later
 */

/**
 * The most plates a stencil can be made of. The owner's number (DP-Q21).
 *
 * ★ NOT the same law as the charm engine's `LAYER_EMIT_CAP`, which is 3 and
 * lives in svg-preparer. That one caps how many RELIEF passes a tiered charm
 * builds, and three is what the model builds. This one caps how many PAINT
 * COLOURS a stencil can have, and the owner's own cat uses six. Two different
 * questions that happened to be answered with a number, which is exactly how
 * they got confused in the first place: walking the wrong cap stopped a
 * six-colour cat at three plates.
 */
export const STENCIL_PLATE_CAP = 8;

/**
 * The registration jig, measured off the base plate the owner printed, plus
 * the one number their CAD does not carry.
 *
 * `holeClearance` is a print-fit value and nobody can choose it from a screen:
 * 0.1 mm is a press fit that needs a push, 0.2 mm slides on by hand and is the
 * proposal, 0.3 mm drops on freely and lets the plate shift by a tenth of a
 * millimetre, which shows in a six-colour picture. The owner confirms it.
 */
export const JIG_DEFAULTS = Object.freeze({
  pegDiameter: 3.0,
  keyWidth: 3.0,
  keyDepth: 2.0,
  featureInset: 2.5,
  pegHeight: 4.4,
  holeClearance: 0.2,
});
