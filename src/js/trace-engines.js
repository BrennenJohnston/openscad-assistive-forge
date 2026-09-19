/**
 * Which tracing engines exist, and which one is used when nobody says.
 *
 * This lives on its own because both sides need it and neither can import the
 * other: the runner creates the worker, and the worker installs a handler on
 * `self` the moment it loads, which on the main thread would be the window.
 * One file, one answer, no way for the two to drift apart.
 *
 * @license GPL-3.0-or-later
 */

/** The engines a caller can ask for. */
export const TRACE_ENGINES = Object.freeze(['imagetracer', 'potrace']);

/**
 * The engine a trace uses when the caller does not choose.
 *
 * SIGNED BY THE OWNER at gate DP-Q43 (2026-09-14): Potrace, for Line art and
 * Solid shape. It is not a speed decision - the two engines draw the same
 * picture, to a region overlap of 0.87 to 0.99 across twelve pictures, the
 * same shape count, and a line width matching to a hundredth of a millimeter.
 * It is an edge decision. Magnified, imagetracerjs returns a stroke edge made
 * of straight segments with countable corners and a round dot as a ten-sided
 * polygon; Potrace returns one continuous curve and a circle. What is being
 * drawn here becomes an edge a finger runs along.
 *
 * Potrace draws in one color, so Standard keeps the picture's colors with
 * imagetracerjs and Colors is a separate road entirely. The worker decides
 * that, and its reply names the engine that actually ran.
 */
export const DEFAULT_TRACE_ENGINE = 'potrace';
