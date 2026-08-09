/**
 * Axis lines overlay (P12).
 *
 * Desktop OpenSCAD draws each axis through the origin in BOTH directions,
 * with the negative half dashed so you can tell which way is which at a
 * glance (OpenSCAD_1.png). three.js's AxesHelper draws the positive halves
 * only, so the negative halves were not merely undashed — they were absent,
 * and the tick marks at -50, -100, -150 and -200 sat in empty space with no
 * axis under them.
 *
 * Arm length matches the tick overlay's range for that reason: ticks and the
 * line they mark have to end together.
 *
 * Colours are AxesHelper's own (red X, green Y, blue Z) so the two halves of
 * an axis match. Upstream's axes are black; keeping the colours is the
 * smaller change and they carry orientation information a single colour
 * cannot.
 *
 * @license GPL-3.0-or-later
 */

/** Matches DEFAULT_RANGE_MM in axis-tick-overlay.js — ticks and lines end together. */
const DEFAULT_AXIS_RANGE_MM = 200;

/** Dash and gap in scene millimetres. */
const DASH_MM = 3;
const GAP_MM = 3;

/** AxesHelper's convention, so a negative half matches its positive half. */
const AXIS_COLORS = { x: 0xff0000, y: 0x00ff00, z: 0x0000ff };

const AXIS_VECTORS = {
  x: [1, 0, 0],
  y: [0, 1, 0],
  z: [0, 0, 1],
};

/**
 * Build the axis lines: three solid positive arms and three dashed negative
 * arms, all from the origin.
 *
 * @param {Object} three Three.js module (see getThreeModule).
 * @param {Object} [opts]
 * @param {number} [opts.rangeMm] Half-extent along each axis. Default 200 mm.
 * @returns {{group: Object, dispose: () => void}}
 */
export function buildAxisLinesOverlay(three, opts = {}) {
  if (!three)
    throw new Error('buildAxisLinesOverlay requires a Three.js module');

  const rangeMm =
    typeof opts.rangeMm === 'number' &&
    Number.isFinite(opts.rangeMm) &&
    opts.rangeMm > 0
      ? opts.rangeMm
      : DEFAULT_AXIS_RANGE_MM;

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
            noNegativeZero(unit[0] * rangeMm * sign),
            noNegativeZero(unit[1] * rangeMm * sign),
            noNegativeZero(unit[2] * rangeMm * sign),
          ],
          3
        )
      );

      const material =
        sign === 1
          ? new three.LineBasicMaterial({ color: AXIS_COLORS[axis] })
          : new three.LineDashedMaterial({
              color: AXIS_COLORS[axis],
              dashSize: DASH_MM,
              gapSize: GAP_MM,
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
  DEFAULT_AXIS_RANGE_MM,
  DASH_MM,
  GAP_MM,
  AXIS_COLORS,
};
