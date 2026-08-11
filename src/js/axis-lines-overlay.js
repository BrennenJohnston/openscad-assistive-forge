/**
 * Axis lines overlay (P12, zoom-length since UF-7).
 *
 * Desktop OpenSCAD draws each axis through the origin in BOTH directions,
 * with the negative half dashed so you can tell which way is which at a
 * glance (OpenSCAD_1.png). three.js's AxesHelper draws the positive halves
 * only, so the negative halves were not merely undashed — they were absent.
 *
 * Arm length is the camera distance `l` (GLView.cc `showAxes()`:
 * `auto l = cam.zoomValue()`), so at any zoom the axes span the view and
 * end together with the tick overlay's outermost marks — the caller
 * rebuilds this overlay when the zoom moves, same as the ticks. Dash size
 * scales with `l` for the same reason the ticks' does: desktop stipples in
 * screen pixels, and a fixed world-unit dash vanishes at far zoom.
 *
 * Colour follows the tick overlay's theme resolution (Q-22, owner decision
 * 2026-08-09): upstream's axes are black, and AxesHelper's red/green/blue
 * failed contrast — pure green measured 1.36:1 against the Cornfield
 * background where SC 1.4.11 wants 3:1. Resolving --color-text-primary gives
 * near-black on light themes (the desktop look) while dark themes keep
 * visible axes, and lines and ticks always match. Orientation reads from
 * the dashing (negative halves) and the corner triad's letters.
 *
 * @license GPL-3.0-or-later
 */

import {
  resolveAxisMarkColor,
  DEFAULT_DISTANCE_MM,
  DASH_DIVISOR,
} from './axis-tick-overlay.js';

const AXIS_VECTORS = {
  x: [1, 0, 0],
  y: [0, 1, 0],
  z: [0, 0, 1],
};

/**
 * Build the axis lines: three solid positive arms and three dashed negative
 * arms, all from the origin, each `distanceMm` long.
 *
 * @param {Object} three Three.js module (see getThreeModule).
 * @param {Object} [opts]
 * @param {number} [opts.distanceMm] Camera distance to the look-at point —
 *   the arm length, desktop `zoomValue()`. Defaults like the tick overlay.
 * @param {string} [opts.themeKey] Preview theme key, for the colour fallback.
 * @param {Document} [opts.document] Override `document` (tests).
 * @returns {{group: Object, distanceMm: number, dispose: () => void}}
 */
export function buildAxisLinesOverlay(three, opts = {}) {
  if (!three)
    throw new Error('buildAxisLinesOverlay requires a Three.js module');

  const distanceMm =
    typeof opts.distanceMm === 'number' &&
    Number.isFinite(opts.distanceMm) &&
    opts.distanceMm > 0
      ? opts.distanceMm
      : DEFAULT_DISTANCE_MM;

  const { hex: colorHex } = resolveAxisMarkColor(
    opts.themeKey || 'light',
    opts.document
  );

  const group = new three.Group();
  group.name = '__displayAxes';

  // 0 * -1 is -0, which is harmless in the buffer but makes the geometry
  // data awkward to read and to assert on.
  const noNegativeZero = (v) => (v === 0 ? 0 : v);

  /** @type {Array<{geometry: any, material: any}>} */
  const parts = [];

  for (const axis of ['x', 'y', 'z']) {
    const unit = AXIS_VECTORS[axis];
    for (const sign of [1, -1]) {
      const geometry = new three.BufferGeometry();
      geometry.setAttribute(
        'position',
        new three.Float32BufferAttribute(
          [
            0,
            0,
            0,
            noNegativeZero(unit[0] * distanceMm * sign),
            noNegativeZero(unit[1] * distanceMm * sign),
            noNegativeZero(unit[2] * distanceMm * sign),
          ],
          3
        )
      );

      const material =
        sign === 1
          ? new three.LineBasicMaterial({ color: colorHex })
          : new three.LineDashedMaterial({
              color: colorHex,
              dashSize: distanceMm / DASH_DIVISOR,
              gapSize: distanceMm / DASH_DIVISOR,
            });

      const line = new three.Line(geometry, material);
      line.name = `__displayAxis-${axis}${sign === 1 ? 'pos' : 'neg'}`;
      // Dashes are computed from per-vertex distances; without this the
      // dashed material renders as a solid line and the negative half
      // becomes indistinguishable from the positive one.
      if (sign === -1) line.computeLineDistances();

      group.add(line);
      parts.push({ geometry, material });
    }
  }

  return {
    group,
    distanceMm,
    dispose: () => {
      for (const part of parts) {
        part.geometry.dispose?.();
        part.material.dispose?.();
      }
      parts.length = 0;
    },
  };
}

// Exported for tests.
export const __test = {
  DEFAULT_DISTANCE_MM,
  DASH_DIVISOR,
};
