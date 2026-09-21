/**
 * The print measure's cell: 0.025 mm, forty cells per printed millimeter.
 *
 * One number in one place. The shape thickness measure (DP-54) builds its
 * masks at this cell, and since DP-79 the trace worker resamples a camera
 * picture to this many pixels per printed millimeter before it looks for
 * ink, so a photograph is worked at the size a charm can print and not at
 * the size a phone took it. It lives apart from shape-thickness.js because
 * that module carries the geometry library, which the worker has no use for.
 *
 * @license GPL-3.0-or-later
 */
export const PRINT_CELL_MM = 0.025;
