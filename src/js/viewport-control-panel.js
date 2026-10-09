/**
 * Viewport-Control panel — Classic's equivalent of desktop OpenSCAD's
 * Viewport-Control dock, transcribed from upstream ViewportControl.ui.
 *
 * It is a numeric read/write surface onto the camera: where it is looking
 * (translation), how it is oriented (rotation), how far away it is, and its
 * field of view. That matters beyond fidelity — orbiting is a pointer gesture,
 * and this panel is the only way to place the camera exactly without one.
 *
 * Two adaptations of upstream, both forced by the browser:
 *
 *   Width / Height   Read-only. Upstream sets a fixed render size; our canvas
 *                    is responsive and sized by its container, so these report
 *                    the live pixel size instead of setting it.
 *   Lock             Disabled. It locks upstream's aspect ratio while you type
 *                    a size; with no settable size there is nothing to lock.
 *   Rotation Y       Read-only, always 0. The rotation is OpenSCAD's $vpr,
 *                    [tilt, roll, turn], and this camera's up is locked to +Z,
 *                    so it never rolls.
 *
 * ## Why the update path looks the way it does
 *
 * Measured, since nothing else in this repo listens to OrbitControls: a
 * single mouse drag emits **118 'change' events**, median gap **16.5 ms**,
 * and they keep coming for **~1.8 s after the mouse is released** because
 * damping is on (preview.js). So:
 *
 *   - reads are throttled to UPDATE_THROTTLE_MS; unthrottled this would be six
 *     DOM writes per field per frame,
 *   - a field the user is typing in is never overwritten — the camera moving
 *     under their cursor would eat the digits,
 *   - and there is no aria-live anywhere on this panel. A live region on
 *     camera motion would fire a hundred times per drag; that is not a feature
 *     for a screen-reader user, it is a denial of service.
 *
 * Writing to the camera also emits 'change', so an echo guard keeps the
 * panel's own writes from bouncing back through the read path.
 *
 * @license GPL-3.0-or-later
 */

/** Changes arrive at ~60 Hz; a tenth of a second is plenty for readouts. */
export const UPDATE_THROTTLE_MS = 100;

/** Degrees per radian, kept once so the two conversions cannot disagree. */
const RAD_TO_DEG = 180 / Math.PI;

/**
 * Looking straight along Z leaves the camera no frame to aim by (its up and
 * its view line coincide), so a tilt of 0 or 180 is held this far off the
 * pole, as the Top and Bottom views are. Degrees.
 */
const POLE_DEG = 0.001;

/**
 * OpenSCAD's $vpr for a camera at this offset from its target: the tilt away
 * from looking straight down, no roll, and the turn about the vertical axis
 * from the front (-Y) toward +X. The numbers the desktop shows and a model
 * pastes.
 * @param {{x: number, y: number, z: number}} offset - camera minus target
 * @returns {{x: number, y: number, z: number}} degrees
 */
export function vprFromOffset({ x, y, z }) {
  const distance = Math.hypot(x, y, z);
  if (distance < 1e-9) return { x: 0, y: 0, z: 0 };
  return {
    x: Math.acos(Math.max(-1, Math.min(1, z / distance))) * RAD_TO_DEG,
    y: 0,
    z: Math.atan2(x, -y) * RAD_TO_DEG,
  };
}

/**
 * Where a camera sits, relative to its target, for a $vpr tilt and turn.
 * @param {number} tiltDeg
 * @param {number} turnDeg
 * @param {number} distance
 * @returns {{x: number, y: number, z: number}}
 */
export function offsetFromVpr(tiltDeg, turnDeg, distance) {
  const tilt =
    Math.min(180 - POLE_DEG, Math.max(POLE_DEG, tiltDeg)) / RAD_TO_DEG;
  const turn = turnDeg / RAD_TO_DEG;
  return {
    x: distance * Math.sin(tilt) * Math.sin(turn),
    y: -distance * Math.sin(tilt) * Math.cos(turn),
    z: distance * Math.cos(tilt),
  };
}

/**
 * The numeric fields, in upstream's grid order. `read` pulls a value out of
 * the live camera; `write` puts one back. Holding them as data means the
 * throttled refresh and the input handlers cannot drift apart.
 * @type {ReadonlyArray<{id: string, group: string}>}
 */
export const VIEWPORT_FIELDS = Object.freeze([
  { id: 'vpTx', group: 'translation', axis: 'x' },
  { id: 'vpTy', group: 'translation', axis: 'y' },
  { id: 'vpTz', group: 'translation', axis: 'z' },
  { id: 'vpRx', group: 'rotation', axis: 'x' },
  { id: 'vpRy', group: 'rotation', axis: 'y' },
  { id: 'vpRz', group: 'rotation', axis: 'z' },
  { id: 'vpDistance', group: 'distance' },
  { id: 'vpFov', group: 'fov' },
]);

/**
 * Round for display without pretending to a precision the camera does not
 * have. Three decimals is below what a pixel of orbit can express.
 * @param {number} value
 * @returns {string}
 */
export function formatCameraValue(value) {
  if (!Number.isFinite(value)) return '';
  return String(Number(value.toFixed(3)));
}

export class ViewportControlPanel {
  /**
   * @param {Object} [options]
   * @param {Element|null} [options.root]
   * @param {() => Object|null} [options.getPreviewManager]
   */
  constructor(options = {}) {
    this.root = options.root || document.getElementById('viewportControlPanel');
    this.getPreviewManager = options.getPreviewManager || (() => null);

    /** @type {Object|null} the manager we are listening to */
    this._connectedPm = null;
    /** @type {(() => void)|null} */
    this._onControlsChange = null;
    /** @type {number} last time the readouts were refreshed */
    this._lastRefresh = 0;
    /** @type {number|undefined} */
    this._trailingTimer = undefined;
    /** @type {boolean} true while the panel is writing to the camera */
    this._writing = false;

    /** @type {Record<string, HTMLInputElement|null>} */
    this.fields = {};

    if (this.root) this._bind();
  }

  /** @private */
  _bind() {
    const $ = (id) => this.root.querySelector(`#${id}`);

    for (const field of VIEWPORT_FIELDS) {
      const el = $(field.id);
      this.fields[field.id] = el;
      el?.addEventListener('change', () => this._writeFromInputs());
    }
    this.width = $('vpWidth');
    this.height = $('vpHeight');
    if (this.fields.vpRy) this.fields.vpRy.readOnly = true;

    // Switching to orthographic does not have to move the camera, so it emits
    // no OrbitControls 'change' — without this the FOV field would stay
    // enabled over a camera that has no field of view. Listening on document
    // rather than an ancestor keeps working after the dock moves the panel.
    document.addEventListener('preview-projection-change', () =>
      this.refresh()
    );

    this.refresh();
  }

  /**
   * Start listening to a PreviewManager's controls. Called when one appears —
   * the manager is built lazily after WASM is ready, so the panel cannot bind
   * at construction. Same shape as
   * DisplayOptionsController.connectPreviewManager.
   * @param {Object|null} pm
   * @returns {boolean} whether a new manager was connected
   */
  connectPreviewManager(pm = this.getPreviewManager()) {
    if (!pm || pm === this._connectedPm) return false;

    this.disconnect();
    this._connectedPm = pm;

    if (pm.controls?.addEventListener) {
      this._onControlsChange = () => this._onCameraMoved();
      pm.controls.addEventListener('change', this._onControlsChange);
    }
    this.refresh();
    return true;
  }

  /** Stop listening, so a replaced manager does not leak a listener. */
  disconnect() {
    if (
      this._connectedPm?.controls?.removeEventListener &&
      this._onControlsChange
    ) {
      this._connectedPm.controls.removeEventListener(
        'change',
        this._onControlsChange
      );
    }
    clearTimeout(this._trailingTimer);
    this._connectedPm = null;
    this._onControlsChange = null;
  }

  /**
   * Throttled entry point for the camera's change feed. A trailing call is
   * scheduled as well as the leading one, so the fields settle on the camera's
   * final pose rather than wherever it happened to be a tenth of a second
   * before the user let go.
   * @private
   */
  _onCameraMoved() {
    // The panel's own writes come back through here; ignore our own echo.
    if (this._writing) return;

    const now = Date.now();
    if (now - this._lastRefresh >= UPDATE_THROTTLE_MS) {
      this._lastRefresh = now;
      this.refresh();
      return;
    }
    clearTimeout(this._trailingTimer);
    this._trailingTimer = setTimeout(() => {
      this._lastRefresh = Date.now();
      this.refresh();
    }, UPDATE_THROTTLE_MS);
  }

  /**
   * The camera's current pose, or null when there is no renderer — CI runners
   * without WebGL create no canvas and therefore no controls at all.
   * @returns {Object|null}
   */
  readCamera() {
    const pm = this._connectedPm;
    const controls = pm?.controls;
    const camera = pm?.getActiveCamera?.();
    if (!controls || !camera) return null;

    return {
      translation: {
        x: controls.target.x,
        y: controls.target.y,
        z: controls.target.z,
      },
      rotation: vprFromOffset({
        x: camera.position.x - controls.target.x,
        y: camera.position.y - controls.target.y,
        z: camera.position.z - controls.target.z,
      }),
      distance: camera.position.distanceTo(controls.target),
      fov: typeof camera.fov === 'number' ? camera.fov : null,
      orthographic: pm.getProjectionMode?.() === 'orthographic',
    };
  }

  /** Pull the camera's pose into the fields. */
  refresh() {
    const pose = this.readCamera();
    const size = this._refreshCanvasSize();
    if (!pose) return;

    // The Classic status bar shows the same pose. It listens here rather
    // than subscribing to controls itself: this panel is connected whether or
    // not it is on screen, and it already owns the only throttle in front of a
    // feed that fires ~118 times per drag. Two subscribers would mean two
    // throttles that could drift.
    document.dispatchEvent(
      new CustomEvent('viewport-camera-change', {
        detail: { pose, width: size.width, height: size.height },
      })
    );

    this._set('vpTx', pose.translation.x);
    this._set('vpTy', pose.translation.y);
    this._set('vpTz', pose.translation.z);
    this._set('vpRx', pose.rotation.x);
    this._set('vpRy', pose.rotation.y);
    this._set('vpRz', pose.rotation.z);
    this._set('vpDistance', pose.distance);

    // An orthographic camera has no field of view, so the control is disabled
    // rather than left showing a number that means nothing: no control
    // quietly does nothing.
    const fov = this.fields.vpFov;
    if (fov) {
      fov.disabled = pose.orthographic;
      if (pose.orthographic) fov.value = '';
      else this._set('vpFov', pose.fov);
    }
  }

  /**
   * Report the canvas's live pixel size. Read-only: the canvas is sized by its
   * container, so there is nothing here for the user to set.
   * @private
   */
  _refreshCanvasSize() {
    const canvas = document.querySelector('.preview-panel canvas');
    const width = canvas ? canvas.clientWidth : null;
    const height = canvas ? canvas.clientHeight : null;
    if (this.width) this.width.value = canvas ? String(width) : '';
    if (this.height) this.height.value = canvas ? String(height) : '';
    return { width, height };
  }

  /**
   * Write one readout, unless the user is typing in it. The camera moves while
   * a field has focus every time someone orbits with the panel open; replacing
   * the text under their cursor would eat what they were typing.
   * @param {string} id
   * @param {number|null} value
   * @private
   */
  _set(id, value) {
    const el = this.fields[id];
    if (!el || el === document.activeElement) return;
    el.value = value === null ? '' : formatCameraValue(value);
  }

  /**
   * Apply the fields to the camera. Runs on `change`, so once per committed
   * edit rather than once per keystroke.
   * @private
   */
  _writeFromInputs() {
    const pm = this._connectedPm;
    const controls = pm?.controls;
    const camera = pm?.getActiveCamera?.();
    if (!controls || !camera) return;

    const num = (id, fallback) => {
      const raw = this.fields[id]?.value;
      const parsed = Number.parseFloat(raw);
      return Number.isFinite(parsed) ? parsed : fallback;
    };

    const pose = this.readCamera();
    if (!pose) return;

    this._writing = true;
    try {
      // Translation moves what the camera looks AT, keeping its direction and
      // distance — the same thing panning does.
      const target = controls.target;
      const nextTarget = {
        x: num('vpTx', pose.translation.x),
        y: num('vpTy', pose.translation.y),
        z: num('vpTz', pose.translation.z),
      };
      const offset = {
        x: camera.position.x - target.x,
        y: camera.position.y - target.y,
        z: camera.position.z - target.z,
      };
      target.set(nextTarget.x, nextTarget.y, nextTarget.z);
      camera.position.set(
        nextTarget.x + offset.x,
        nextTarget.y + offset.y,
        nextTarget.z + offset.z
      );

      // Rotation and distance are applied together: both describe where the
      // camera sits relative to the same target, so writing one at a time
      // would move the camera twice for one edit. The controls' update below
      // aims it back at the target with +Z up.
      const distance = Math.max(0.001, num('vpDistance', pose.distance));
      const seat = offsetFromVpr(
        num('vpRx', pose.rotation.x),
        num('vpRz', pose.rotation.z),
        distance
      );
      camera.position.set(
        target.x + seat.x,
        target.y + seat.y,
        target.z + seat.z
      );

      if (!pose.orthographic && typeof camera.fov === 'number') {
        const fov = num('vpFov', camera.fov);
        camera.fov = Math.min(179, Math.max(1, fov));
        camera.updateProjectionMatrix();
      }

      controls.update();
    } finally {
      this._writing = false;
    }

    // Re-read so the fields show what the camera actually accepted — clamped
    // values and the rounding that comes back out of the matrix.
    this.refresh();
  }
}

/** @type {ViewportControlPanel|null} */
let instance = null;

/**
 * @param {Object} [options]
 * @returns {ViewportControlPanel}
 */
export function initViewportControlPanel(options = {}) {
  if (!instance) instance = new ViewportControlPanel(options);
  return instance;
}

/** @returns {ViewportControlPanel|null} */
export function getViewportControlPanel() {
  return instance;
}

/** Reset the singleton. Used in unit tests. */
export function resetViewportControlPanel() {
  instance = null;
}
