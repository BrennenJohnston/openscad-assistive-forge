/**
 * Display Options Controller
 *
 * Toggles visual helpers in the 3D preview: axes, edges overlay,
 * crosshairs, scale markers, and wireframe mode.  Persists each
 * toggle to localStorage.
 *
 * Operates on the PreviewManager's Three.js scene via a lazily
 * obtained reference — no direct Three.js import needed.
 *
 * @license GPL-3.0-or-later
 */

import { getAppPrefKey, safeGetItem, safeSetItem } from './storage-keys.js';
import { announceImmediate } from './announcer.js';
import { buildAxisTickOverlay } from './axis-tick-overlay.js';

const PREF_PREFIX = 'display-';
const DEFAULTS = {
  axes: false,
  edges: false,
  crosshairs: false,
  wireframe: false,
  axisMarks: false,
};

/**
 * @typedef {'axes'|'edges'|'crosshairs'|'wireframe'|'axisMarks'} DisplayOption
 */

const HUMAN_LABELS = {
  axes: 'Axes',
  edges: 'Edges',
  crosshairs: 'Crosshairs',
  wireframe: 'Wireframe',
  axisMarks: 'Axis distance markings',
};

/**
 * DisplayOptionsController manages visual helper toggles in the 3D
 * preview scene.
 */
export class DisplayOptionsController {
  /**
   * @param {Object} [options]
   * @param {Function} [options.getPreviewManager] - () => PreviewManager
   * @param {Function} [options.getThree]          - () => THREE module ref
   */
  constructor(options = {}) {
    this.getPreviewManager = options.getPreviewManager || (() => null);
    this.getThree = options.getThree || (() => null);

    /** @type {Record<DisplayOption, boolean>} */
    this.state = { ...DEFAULTS };

    /** @type {Object|null} Three.js AxesHelper instance */
    this._axesHelper = null;
    /** @type {Object|null} Three.js LineSegments for edges overlay */
    this._edgesOverlay = null;
    /** @type {Object|null} Three.js Group for crosshair lines */
    this._crosshairGroup = null;
    /** @type {{ group: Object, dispose: () => void }|null} Axis tick overlay (F20) */
    this._axisTickOverlay = null;
  }

  init() {
    this._loadPreferences();
    this._wireCheckboxes();
    this._syncCheckboxes();
    this._applyAll();
    this._registerPostLoadListener();
  }

  /**
   * Subscribe to PreviewManager's post-load event so overlays
   * (edges, wireframe) are rebuilt whenever a model is loaded.
   * Also subscribe to theme changes so the axis tick overlay (F20)
   * refreshes its label color in light/dark/HC/forced-colors modes.
   * @private
   */
  _registerPostLoadListener() {
    const pm = this.getPreviewManager();
    if (pm?.addPostLoadListener) {
      this._boundRefresh = () => this.refreshOverlays();
      pm.addPostLoadListener(this._boundRefresh);
    }
    if (pm?.addThemeChangeListener) {
      this._boundThemeRefresh = () => this.refreshThemeSensitiveOverlays();
      pm.addThemeChangeListener(this._boundThemeRefresh);
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /** @param {DisplayOption} option */
  toggle(option) {
    if (!(option in this.state)) return;
    this.set(option, !this.state[option]);
  }

  /**
   * @param {DisplayOption} option
   * @param {boolean} enabled
   */
  set(option, enabled) {
    if (!(option in this.state)) return;
    this.state[option] = enabled;
    this._savePref(option, enabled);
    this._apply(option);
    this._syncCheckbox(option);
    const label =
      HUMAN_LABELS[option] ||
      option.charAt(0).toUpperCase() + option.slice(1);
    announceImmediate(`${label} ${enabled ? 'shown' : 'hidden'}`);
  }

  /** @param {DisplayOption} option  @returns {boolean} */
  get(option) {
    return !!this.state[option];
  }

  /**
   * Re-apply overlays after the mesh changes (call from main.js
   * after a successful render).
   */
  refreshOverlays() {
    this._apply('edges');
    this._apply('wireframe');
  }

  /**
   * Re-apply theme-sensitive overlays. The axis tick overlay reads its
   * color from the active theme's `--color-text-primary` token at
   * build time, so a theme switch needs a rebuild to stay legible.
   */
  refreshThemeSensitiveOverlays() {
    if (this.state.axisMarks) {
      // Rebuild from scratch so the new theme color is applied.
      this._tearDownAxisTickOverlay();
      this._apply('axisMarks');
    }
  }

  // ---------------------------------------------------------------------------
  // Preference persistence
  // ---------------------------------------------------------------------------

  _loadPreferences() {
    for (const key of Object.keys(DEFAULTS)) {
      const saved = safeGetItem(getAppPrefKey(PREF_PREFIX + key));
      if (saved !== null) this.state[key] = saved === 'true';
    }
  }

  /** @param {string} key @param {boolean} val */
  _savePref(key, val) {
    safeSetItem(getAppPrefKey(PREF_PREFIX + key), String(val));
  }

  // ---------------------------------------------------------------------------
  // DOM checkbox wiring
  // ---------------------------------------------------------------------------

  _wireCheckboxes() {
    for (const key of Object.keys(DEFAULTS)) {
      const cb = document.getElementById(`display-${key}`);
      if (cb) {
        cb.addEventListener('change', (e) => {
          this.set(
            /** @type {DisplayOption} */ (key),
            /** @type {HTMLInputElement} */ (e.target).checked
          );
        });
      }
    }
  }

  _syncCheckboxes() {
    for (const key of Object.keys(this.state)) {
      this._syncCheckbox(key);
    }
  }

  /** @param {string} key */
  _syncCheckbox(key) {
    const cb = /** @type {HTMLInputElement|null} */ (
      document.getElementById(`display-${key}`)
    );
    if (cb) cb.checked = this.state[key];
  }

  // ---------------------------------------------------------------------------
  // Scene manipulation
  // ---------------------------------------------------------------------------

  _applyAll() {
    for (const key of Object.keys(this.state)) {
      this._apply(key);
    }
  }

  /** @param {string} option */
  _apply(option) {
    const pm = this.getPreviewManager();
    if (!pm?.scene) return;

    switch (option) {
      case 'axes':
        this._applyAxes(pm);
        break;
      case 'edges':
        this._applyEdges(pm);
        break;
      case 'crosshairs':
        this._applyCrosshairs(pm);
        break;
      case 'wireframe':
        this._applyWireframe(pm);
        break;
      case 'axisMarks':
        this._applyAxisMarks(pm);
        break;
    }
  }

  _applyAxisMarks(pm) {
    const T = this.getThree();
    if (!T) return;

    if (this.state.axisMarks) {
      if (!this._axisTickOverlay) {
        try {
          this._axisTickOverlay = buildAxisTickOverlay(T, {
            themeKey: pm.currentTheme,
          });
        } catch (err) {
          console.warn(
            '[DisplayOptions] Failed to build axis tick overlay:',
            err
          );
          return;
        }
      }
      const group = this._axisTickOverlay.group;
      if (group && !pm.scene.getObjectByName(group.name)) {
        pm.scene.add(group);
      }
    } else {
      this._tearDownAxisTickOverlay();
    }
  }

  _tearDownAxisTickOverlay() {
    if (!this._axisTickOverlay) return;
    const pm = this.getPreviewManager();
    if (pm?.scene && this._axisTickOverlay.group) {
      pm.scene.remove(this._axisTickOverlay.group);
    }
    try {
      this._axisTickOverlay.dispose?.();
    } catch (err) {
      console.warn('[DisplayOptions] Axis tick overlay dispose error:', err);
    }
    this._axisTickOverlay = null;
  }

  _applyAxes(pm) {
    const T = this.getThree();
    if (this.state.axes) {
      if (!this._axesHelper && T) {
        this._axesHelper = new T.AxesHelper(50);
        this._axesHelper.name = '__displayAxes';
      }
      if (this._axesHelper && !pm.scene.getObjectByName('__displayAxes')) {
        pm.scene.add(this._axesHelper);
      }
    } else if (this._axesHelper) {
      pm.scene.remove(this._axesHelper);
    }
  }

  _applyEdges(pm) {
    const T = this.getThree();
    if (this._edgesOverlay) {
      pm.scene.remove(this._edgesOverlay);
      this._edgesOverlay.geometry?.dispose();
      this._edgesOverlay.material?.dispose();
      this._edgesOverlay = null;
    }

    if (this.state.edges && pm.mesh && T) {
      const edgesGeo = new T.EdgesGeometry(pm.mesh.geometry, 15);
      const mat = new T.LineBasicMaterial({
        color: pm.currentTheme === 'dark' ? 0xaaaaaa : 0x333333,
      });
      this._edgesOverlay = new T.LineSegments(edgesGeo, mat);
      this._edgesOverlay.name = '__displayEdges';
      this._edgesOverlay.position.copy(pm.mesh.position);
      this._edgesOverlay.rotation.copy(pm.mesh.rotation);
      this._edgesOverlay.scale.copy(pm.mesh.scale);
      pm.scene.add(this._edgesOverlay);
    }
  }

  _applyCrosshairs(pm) {
    const T = this.getThree();
    if (this._crosshairGroup) {
      pm.scene.remove(this._crosshairGroup);
      this._crosshairGroup.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
      this._crosshairGroup = null;
    }

    if (this.state.crosshairs && T) {
      const size = 1000;
      const color = pm.currentTheme === 'dark' ? 0x666666 : 0x999999;
      const mat = new T.LineBasicMaterial({ color });

      this._crosshairGroup = new T.Group();
      this._crosshairGroup.name = '__displayCrosshairs';

      const axes = [
        [new T.Vector3(-size, 0, 0), new T.Vector3(size, 0, 0)],
        [new T.Vector3(0, -size, 0), new T.Vector3(0, size, 0)],
        [new T.Vector3(0, 0, -size), new T.Vector3(0, 0, size)],
      ];

      for (const [a, b] of axes) {
        const geo = new T.BufferGeometry().setFromPoints([a, b]);
        this._crosshairGroup.add(new T.LineSegments(geo, mat));
      }
      pm.scene.add(this._crosshairGroup);
    }
  }

  _applyWireframe(pm) {
    if (pm.mesh?.material) {
      pm.mesh.material.wireframe = !!this.state.wireframe;
    }
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  dispose() {
    const pm = this.getPreviewManager();
    if (pm?.removePostLoadListener && this._boundRefresh) {
      pm.removePostLoadListener(this._boundRefresh);
    }
    if (pm?.removeThemeChangeListener && this._boundThemeRefresh) {
      pm.removeThemeChangeListener(this._boundThemeRefresh);
    }
    if (pm?.scene) {
      if (this._axesHelper) pm.scene.remove(this._axesHelper);
      if (this._edgesOverlay) pm.scene.remove(this._edgesOverlay);
      if (this._crosshairGroup) pm.scene.remove(this._crosshairGroup);
    }
    this._tearDownAxisTickOverlay();
    this._axesHelper = null;
    this._edgesOverlay = null;
    this._crosshairGroup = null;
    this._boundRefresh = null;
    this._boundThemeRefresh = null;
  }
}

// Singleton
let instance = null;

/** @param {Object} [options] @returns {DisplayOptionsController} */
export function getDisplayOptionsController(options = {}) {
  if (!instance) instance = new DisplayOptionsController(options);
  return instance;
}

export function resetDisplayOptionsController() {
  if (instance) instance.dispose();
  instance = null;
}
