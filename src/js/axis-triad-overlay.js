/**
 * Corner XYZ triad — desktop OpenSCAD 2021.01's `showSmallaxes()`
 * transcribed (UF-7 P3; R-IV-approved feature table rows, Q-26: lower-left).
 *
 * A separate miniature scene rendered as a second pass into a scissored
 * corner viewport (preview.js owns the pass). Matching the desktop:
 *
 *   - anchored 10% of the viewport width from the left and 10% of the
 *     height from the bottom (the desktop shifts its projection to
 *     normalized (−0.8, −0.8))
 *   - arm length = viewport height / 18 on screen (10·dpi units inside a
 *     ±90·dpi ortho frustum)
 *   - arms pure red (X), green (Y), blue (Z) — `glColor3d(1,0,0)` etc.
 *   - letters are little stroke glyphs (2–3 line segments each) drawn
 *     screen-upright at 1.2× the arm length, in the SCHEME'S AXES COLOR —
 *     the desktop passes its axescolor into showSmallaxes; the caller
 *     passes the same resolveAxisMarkColor() result here
 *   - the camera copies only the main camera's ROTATION: pan and zoom
 *     leave the triad untouched (both desktop references verify this)
 *
 * This module imports three directly: it is consumed only by preview.js,
 * which already holds first-class three imports — there is no injected
 * subset to under-export (the R-IV trap) and no import back into
 * preview.js (the cycle the plan warned about).
 *
 * @license GPL-3.0-or-later
 */

import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  OrthographicCamera,
  Scene,
} from 'three';

// Arm = 1 scene unit; letters at 1.2 (desktop: arms 10·dpi, labels read at
// 12·dpi). The ortho frustum leaves room for a rotated letter + stroke.
const FRUSTUM_HALF = 1.5;
const LETTER_ANCHOR = 1.2;
// The scissor box is square with side = 3 × the on-screen arm length, so
// the 1-unit arm maps to boxSide/3 px and the corner anchor sits at the
// box center.
const BOX_ARMS = 3;
// Desktop draws letters with half-extent 3·dpi px (GLView.cc `d = 3*dpi`).
const LETTER_HALF_PX = 3;
// Anchor: 10% in from the left and bottom edges (NDC −0.8, −0.8).
const ANCHOR_FRACTION = 0.1;
// Desktop arm = height/18 (10·dpi units of a 180·dpi-unit tall frustum).
const ARM_HEIGHT_DIVISOR = 18;

const ARM_COLORS = { x: 0xff0000, y: 0x00ff00, z: 0x0000ff };

// Letter strokes from showSmallaxes(), verbatim, in (x, y) around the
// anchor with half-extent d (y up, like GL screen space).
const LETTER_SEGMENTS = {
  x: [
    [-1, -1, 1, 1],
    [-1, 1, 1, -1],
  ],
  y: [
    [-1, -1, 1, 1],
    [-1, 1, 0, 0],
  ],
  z: [
    [-1, -1, 1, -1],
    [-1, 1, 1, 1],
    [-1, -1, 1, 1],
  ],
};

const AXIS_TIPS = {
  x: [1, 0, 0],
  y: [0, 1, 0],
  z: [0, 0, 1],
};

/**
 * Build the triad's scene, camera and layout helpers.
 *
 * @param {Object} [opts]
 * @param {number} [opts.letterColorHex] The scheme's axes color for the
 *   X/Y/Z letters. Default near-black (the Cornfield axes value is black).
 * @returns {{
 *   scene: Scene,
 *   camera: OrthographicCamera,
 *   letterColorHex: number,
 *   syncTo: (mainCamera: Object) => void,
 *   layout: (widthPx: number, heightPx: number) =>
 *     {x: number, y: number, size: number}|null,
 *   dispose: () => void,
 * }}
 */
export function buildAxisTriadOverlay(opts = {}) {
  const letterColorHex =
    typeof opts.letterColorHex === 'number' ? opts.letterColorHex : 0x222222;

  const scene = new Scene();
  const camera = new OrthographicCamera(
    -FRUSTUM_HALF,
    FRUSTUM_HALF,
    FRUSTUM_HALF,
    -FRUSTUM_HALF,
    -2,
    2
  );

  /** @type {Array<{geometry: any, material: any}>} */
  const parts = [];
  const letterGroups = [];

  const arms = new Group();
  arms.name = '__axisTriadArms';
  const letterMaterial = new LineBasicMaterial({ color: letterColorHex });
  parts.push({ geometry: null, material: letterMaterial });

  for (const axis of ['x', 'y', 'z']) {
    const tip = AXIS_TIPS[axis];

    const armGeometry = new BufferGeometry();
    armGeometry.setAttribute(
      'position',
      new Float32BufferAttribute([0, 0, 0, tip[0], tip[1], tip[2]], 3)
    );
    const armMaterial = new LineBasicMaterial({ color: ARM_COLORS[axis] });
    const arm = new LineSegments(armGeometry, armMaterial);
    arm.name = `__axisTriadArm-${axis}`;
    arms.add(arm);
    parts.push({ geometry: armGeometry, material: armMaterial });

    // The letter: strokes in a flat local (x, y) plane, kept screen-upright
    // by syncTo() copying the camera's quaternion onto the group — the
    // desktop projects the tip to 2D and draws in screen space; a
    // camera-aligned group at the tip is the scene-graph equivalent.
    const letterGeometry = new BufferGeometry();
    const flat = [];
    for (const [x0, y0, x1, y1] of LETTER_SEGMENTS[axis]) {
      flat.push(x0, y0, 0, x1, y1, 0);
    }
    letterGeometry.setAttribute(
      'position',
      new Float32BufferAttribute(flat, 3)
    );
    const letter = new LineSegments(letterGeometry, letterMaterial);
    letter.name = `__axisTriadLetter-${axis}`;
    const holder = new Group();
    holder.name = `__axisTriadLetterHolder-${axis}`;
    holder.position.set(
      tip[0] * LETTER_ANCHOR,
      tip[1] * LETTER_ANCHOR,
      tip[2] * LETTER_ANCHOR
    );
    holder.add(letter);
    scene.add(holder);
    letterGroups.push(holder);
    parts.push({ geometry: letterGeometry, material: null });
  }

  scene.add(arms);

  return {
    scene,
    camera,
    letterColorHex,

    syncTo(mainCamera) {
      if (!mainCamera?.quaternion) return;
      camera.quaternion.copy(mainCamera.quaternion);
      camera.updateMatrixWorld();
      for (const holder of letterGroups) {
        holder.quaternion.copy(mainCamera.quaternion);
      }
    },

    layout(widthPx, heightPx) {
      if (!(widthPx > 0) || !(heightPx > 0)) return null;
      const armPx = heightPx / ARM_HEIGHT_DIVISOR;
      const size = armPx * BOX_ARMS;
      const x = ANCHOR_FRACTION * widthPx - size / 2;
      // WebGL viewport origin is the bottom-left corner.
      const y = ANCHOR_FRACTION * heightPx - size / 2;
      // Letter strokes keep the desktop's fixed pixel half-extent: the
      // frustum maps size px to 2·FRUSTUM_HALF units.
      const halfUnits = (LETTER_HALF_PX / size) * (2 * FRUSTUM_HALF);
      for (const holder of letterGroups) {
        holder.scale.set(halfUnits, halfUnits, halfUnits);
      }
      return { x, y, size };
    },

    dispose() {
      for (const part of parts) {
        part.geometry?.dispose?.();
        part.material?.dispose?.();
      }
      parts.length = 0;
      letterGroups.length = 0;
    },
  };
}

// Exported for tests.
export const __test = {
  FRUSTUM_HALF,
  LETTER_ANCHOR,
  BOX_ARMS,
  LETTER_HALF_PX,
  ANCHOR_FRACTION,
  ARM_HEIGHT_DIVISOR,
  ARM_COLORS,
  LETTER_SEGMENTS,
};
