/**
 * The two stencil numbers the app needs before it loads the stencil engine.
 *
 * Everything that turns a drawing into plates - the color model, the ring
 * geometry, the plate builder, the jig - is a lazy chunk: most people
 * never open a stencil, and putting it in the core bundle would take the whole
 * budget. But the customizer has to know two things before any of that
 * arrives: how many plate parameters to look for, and what the jig numbers
 * are when a model does not name them.
 *
 * They are defined here, once. `stencil-plates.js` and `stencil-jig.js`
 * re-export them rather than declaring their own. A value that exists in
 * more than one file is this project's oldest bug.
 *
 * @license GPL-3.0-or-later
 */

/**
 * The most plates a stencil can be made of.
 *
 * Not the same law as the charm engine's `LAYER_EMIT_CAP`, which is 3 and
 * lives in svg-preparer. That one caps how many relief passes a tiered
 * charm builds, and three is what the model builds. This one caps how many
 * paint colors a stencil can have, and a six-colour cat needs six. Two
 * different questions that happen to be answered with a number: reading
 * the wrong cap would stop a six-colour cat at three plates.
 */
export const STENCIL_PLATE_CAP = 8;

/**
 * The registration jig, measured off a printed base plate, plus the one
 * number the CAD does not carry.
 *
 * `holeClearance` is a print-fit value and nobody can choose it from a
 * screen: 0.1 mm is a press fit that needs a push, 0.2 mm slides on by hand
 * and is the default, 0.3 mm drops on freely and lets the plate shift by a
 * tenth of a millimeter, which shows in a six-colour picture.
 */
export const JIG_DEFAULTS = Object.freeze({
  pegDiameter: 3.0,
  keyWidth: 3.0,
  keyDepth: 2.0,
  featureInset: 2.5,
  pegHeight: 4.4,
  holeClearance: 0.2,
});
