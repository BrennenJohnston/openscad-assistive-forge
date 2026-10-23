/**
 * @license GPL-3.0-or-later
 */
// The preview's axis lines, tick marks and numerals for the Alt View. The
// character look samples a few points of each cell, and a line one pixel
// wide falls between them, so the converter alone leaves only a few stray
// characters of an axis. Here the preview's own line parts are projected
// with the camera and stroked over the characters in the look's color, as
// the line drawing shows them.

// The axes and their marks against the model, in both of the Alt View's
// drawings.
export const AXES_OPACITY = 0.6;

// The display options add these groups to the preview's scene, at its top
// level, while Show Axes and Show Scale Markers are on.
const _AXES_GROUPS = new Set(['__displayAxes', '__axisTickOverlay']);

/**
 * A segment in view space (the camera looks down -z) cut to the near plane.
 * @param {number[]} a - [x, y, z]
 * @param {number[]} b - [x, y, z]
 * @param {number} near - the camera's near distance
 * @returns {Array<number[]>|null} the part in front of the plane, or null
 */
export function clipToNear(a, b, near) {
  const da = a[2] + near;
  const db = b[2] + near;
  if (da > 0 && db > 0) return null;
  if (da <= 0 && db <= 0) return [a, b];
  const t = da / (da - db);
  const cut = [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * t);
  return da > 0 ? [cut, b] : [a, cut];
}

/** `m` times the point (x, y, z, 1), for a column-major 4x4 matrix. */
function _transform(m, x, y, z) {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
    m[3] * x + m[7] * y + m[11] * z + m[15],
  ];
}

/**
 * The axes, tick marks and numerals the preview's scene holds, as the camera
 * sees them in a canvas of `width` by `height` pixels: one entry a line part,
 * its segments as x0, y0, x1, y1 in turn, dashed where the preview dashes it.
 * @param {Object} scene - the preview's scene
 * @param {Object} camera - its active camera
 * @param {number} width
 * @param {number} height
 * @returns {{dashed: boolean, segments: number[]}[]}
 */
export function axesSegments(scene, camera, width, height) {
  const groups = (scene?.children ?? []).filter(
    (child) => _AXES_GROUPS.has(child.name) && child.visible
  );
  if (!groups.length || !camera?.projectionMatrix) return [];
  camera.updateMatrixWorld();
  const view = camera.matrixWorldInverse.elements;
  const projection = camera.projectionMatrix.elements;
  const near = camera.near ?? 0;
  const toScreen = ([x, y, z]) => {
    const [cx, cy, , cw] = _transform(projection, x, y, z);
    return [((cx / cw + 1) / 2) * width, ((1 - cy / cw) / 2) * height];
  };
  const parts = [];
  for (const group of groups) {
    group.updateMatrixWorld();
    group.traverse((part) => {
      const position = part.geometry?.getAttribute?.('position');
      if (!position || !part.material || !part.visible) return;
      const world = part.matrixWorld.elements;
      const inView = (i) => {
        const [x, y, z] = _transform(
          world,
          position.getX(i),
          position.getY(i),
          position.getZ(i)
        );
        return _transform(view, x, y, z).slice(0, 3);
      };
      const step = part.isLineSegments ? 2 : 1;
      const segments = [];
      for (let i = 0; i + 1 < position.count; i += step) {
        const kept = clipToNear(inView(i), inView(i + 1), near);
        if (!kept) continue;
        segments.push(...toScreen(kept[0]), ...toScreen(kept[1]));
      }
      if (segments.length) {
        parts.push({
          dashed: Boolean(part.material.isLineDashedMaterial),
          segments,
        });
      }
    });
  }
  return parts;
}

/**
 * Stroke the parts over what the canvas already holds.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{dashed: boolean, segments: number[]}[]} parts
 * @param {{color: string, lineWidth?: number, dash?: number}} style - the
 *   look's line color, the width and the dash length in the canvas's pixels
 */
export function strokeAxes(ctx, parts, { color, lineWidth = 1, dash = 4 }) {
  if (!parts.length) return;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = AXES_OPACITY;
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  for (const part of parts) {
    ctx.setLineDash(part.dashed ? [dash, dash] : []);
    ctx.beginPath();
    const s = part.segments;
    for (let i = 0; i < s.length; i += 4) {
      ctx.moveTo(s[i], s[i + 1]);
      ctx.lineTo(s[i + 2], s[i + 3]);
    }
    ctx.stroke();
  }
  ctx.restore();
}
