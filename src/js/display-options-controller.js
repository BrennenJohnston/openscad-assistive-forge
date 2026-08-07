/**
 * Display Options Controller
 *
 * Toggles visual helpers in the 3D preview: axes, edges overlay,
 * crosshairs, scale markers, and wireframe mode.  Persists each
 * toggle to localStorage, along with the edge overlay's segment budget.
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
  edges: true,
  crosshairs: false,
  wireframe: false,
  axisMarks: false,
};

/**
 * Edge budget is a number, not a boolean, so it lives outside `DEFAULTS`
 * (whose loader coerces every value with `saved === 'true'`).
 */
const EDGE_BUDGET_PREF = 'edgeBudget';
const DEFAULT_EDGE_BUDGET = 75000;

/**
 * @typedef {'axes'|'edges'|'crosshairs'|'wireframe'|'axisMarks'} DisplayOption
 */

/**
 * @param {number|string} value
 * @returns {number} A non-negative integer budget, or the default.
 */
function _coerceEdgeBudget(value) {
  const n = Number.parseInt(String(value), 10);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_EDGE_BUDGET;
}

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

    /** @type {number} Max edge segments to draw; 0 means unlimited. */
    this._edgeBudget = DEFAULT_EDGE_BUDGET;
    /** @type {{ total: number, shown: number }} Last edge overlay build. */
    this._edgeStats = { total: 0, shown: 0 };

    /** @type {Object|null} The PreviewManager we are currently subscribed to */
    this._connectedPm = null;
    /** @type {boolean} Re-entrancy guard for connectPreviewManager() */
    this._connecting = false;
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
    this._wireControls();
    this._syncControls();
    // The PreviewManager does not exist until the first model loads, so this
    // is usually a no-op here; file-handler.js connects us once it is built.
    if (!this.connectPreviewManager()) {
      this._applyAll();
    }
  }

  /**
   * Subscribe to the PreviewManager's post-load event so overlays (edges,
   * wireframe) are rebuilt whenever a model is loaded, and to its theme
   * change event so the axis tick overlay (F20) and the edges overlay pick
   * up new theme colors.
   *
   * Idempotent and safe to call at any time: the PreviewManager is created
   * lazily on first file load, long after `init()` runs.
   *
   * @param {Object} [pm] - PreviewManager; defaults to the injected getter.
   * @returns {boolean} True if a new manager was connected (state applied).
   */
  connectPreviewManager(pm = this.getPreviewManager()) {
    if (!pm || pm === this._connectedPm || this._connecting) return false;

    this._connecting = true;
    try {
      this._unsubscribeFrom(this._connectedPm);
      this._connectedPm = pm;

      if (pm.addPostLoadListener) {
        if (!this._boundRefresh) {
          this._boundRefresh = () => this.refreshOverlays();
        }
        pm.addPostLoadListener(this._boundRefresh);
      }
      if (pm.addThemeChangeListener) {
        if (!this._boundThemeRefresh) {
          this._boundThemeRefresh = () => this.refreshThemeSensitiveOverlays();
        }
        pm.addThemeChangeListener(this._boundThemeRefresh);
      }

      this._applyAll();
    } finally {
      this._connecting = false;
    }
    return true;
  }

  /** @param {Object|null} pm @private */
  _unsubscribeFrom(pm) {
    if (!pm) return;
    if (pm.removePostLoadListener && this._boundRefresh) {
      pm.removePostLoadListener(this._boundRefresh);
    }
    if (pm.removeThemeChangeListener && this._boundThemeRefresh) {
      pm.removeThemeChangeListener(this._boundThemeRefresh);
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
    if (option === 'edges') this._updateEdgeBudgetStatus();
    const label =
      HUMAN_LABELS[option] || option.charAt(0).toUpperCase() + option.slice(1);
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
    // A manager connected for the first time here has already had every
    // overlay applied, so rebuilding them again would be wasted work.
    if (this.connectPreviewManager()) return;
    this._apply('edges');
    this._apply('wireframe');
  }

  /** @returns {number} Max edge segments drawn; 0 means unlimited. */
  getEdgeBudget() {
    return this._edgeBudget;
  }

  /**
   * Set the maximum number of edge segments the overlay may draw. When the
   * model has more, the longest (most structurally prominent) ones win.
   * @param {number|string} value - Segment cap, or 0 for unlimited.
   */
  setEdgeBudget(value) {
    this._edgeBudget = _coerceEdgeBudget(value);
    safeSetItem(
      getAppPrefKey(PREF_PREFIX + EDGE_BUDGET_PREF),
      String(this._edgeBudget)
    );
    this._syncEdgeBudgetSelect();
    this._apply('edges');
    this._updateEdgeBudgetStatus();
    announceImmediate(this._describeEdgeStats());
  }

  /**
   * Re-apply theme-sensitive overlays. The axis tick overlay reads its
   * color from the active theme's `--color-text-primary` token at
   * build time, and the edges overlay reads the theme's edge color from
   * PREVIEW_COLORS, so a theme switch rebuilds both to stay legible.
   */
  refreshThemeSensitiveOverlays() {
    if (this.state.edges) {
      this._apply('edges');
    }
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
    const savedBudget = safeGetItem(
      getAppPrefKey(PREF_PREFIX + EDGE_BUDGET_PREF)
    );
    if (savedBudget !== null) {
      this._edgeBudget = _coerceEdgeBudget(savedBudget);
    }
  }

  /** @param {string} key @param {boolean} val */
  _savePref(key, val) {
    safeSetItem(getAppPrefKey(PREF_PREFIX + key), String(val));
  }

  // ---------------------------------------------------------------------------
  // DOM control wiring
  // ---------------------------------------------------------------------------

  _wireControls() {
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

    const budgetSelect = document.getElementById('edgeBudgetSelect');
    if (budgetSelect) {
      budgetSelect.addEventListener('change', (e) => {
        this.setEdgeBudget(/** @type {HTMLSelectElement} */ (e.target).value);
      });
    }
  }

  _syncControls() {
    this._syncCheckboxes();
    this._syncEdgeBudgetSelect();
    this._updateEdgeBudgetStatus();
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

  _syncEdgeBudgetSelect() {
    const select = /** @type {HTMLSelectElement|null} */ (
      document.getElementById('edgeBudgetSelect')
    );
    if (select) select.value = String(this._edgeBudget);
  }

  /**
   * Human-readable summary of the last edge overlay build, used for both
   * the drawer readout and the screen-reader announcement.
   * @returns {string}
   */
  _describeEdgeStats() {
    if (!this.state.edges) return 'Edges hidden';
    const { total, shown } = this._edgeStats;
    if (!total) return 'No model loaded';
    if (shown >= total) {
      return `Showing all ${total.toLocaleString()} edges`;
    }
    return `Showing ${shown.toLocaleString()} of ${total.toLocaleString()} edges`;
  }

  _updateEdgeBudgetStatus() {
    const status = document.getElementById('edgeBudgetStatus');
    if (status) status.textContent = this._describeEdgeStats();
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
    // Self-heal if a manager appeared (or was replaced) through a path that
    // never called connectPreviewManager(). The guard keeps the _applyAll()
    // inside connectPreviewManager() from bouncing back here.
    if (pm !== this._connectedPm && !this._connecting) {
      this.connectPreviewManager(pm);
      return;
    }

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
    this._removeEdgesOverlay();
    this._edgeStats = { total: 0, shown: 0 };

    if (this.state.edges && pm.mesh?.geometry && T) {
      const edgesGeo = this._buildEdgeGeometry(T, pm.mesh.geometry);
      const mat = new T.LineBasicMaterial({
        color:
          typeof pm.getThemeEdgeColor === 'function'
            ? pm.getThemeEdgeColor()
            : 0x333333,
      });
      this._edgesOverlay = new T.LineSegments(edgesGeo, mat);
      this._edgesOverlay.name = '__displayEdges';
      // Parented to the mesh so it inherits every transform (recenter,
      // auto-bed, rotation centering). It was previously scene-parented
      // with a one-time copied transform and desynced whenever the mesh
      // moved afterwards.
      pm.mesh.add(this._edgesOverlay);
    }

    this._updateEdgeBudgetStatus();
  }

  /**
   * Build the edge geometry for `sourceGeometry`, clipped to the current
   * edge budget. Dense models (keyguards, lithophanes) can produce hundreds
   * of thousands of segments, which both costs GPU memory and visually
   * collapses the model into a dark mass. When over budget we keep the
   * longest segments: silhouettes and structural lines survive while short
   * tessellation facets on cylinders and fillets are dropped.
   *
   * @param {Object} T - Three.js module reference
   * @param {Object} sourceGeometry - The mesh geometry to outline
   * @returns {Object} A BufferGeometry of line segments
   * @private
   */
  _buildEdgeGeometry(T, sourceGeometry) {
    const edgesGeo = new T.EdgesGeometry(sourceGeometry, 15);

    const position = edgesGeo.attributes?.position;
    const total = position ? Math.floor(position.count / 2) : 0;
    this._edgeStats = { total, shown: total };

    const budget = this._edgeBudget;
    const canClip = T.BufferGeometry && T.Float32BufferAttribute;
    if (!total || budget <= 0 || total <= budget || !canClip) {
      return edgesGeo;
    }

    const src = position.array;
    const lengthsSq = new Float32Array(total);
    for (let i = 0; i < total; i++) {
      const a = i * 6;
      const dx = src[a + 3] - src[a];
      const dy = src[a + 4] - src[a + 1];
      const dz = src[a + 5] - src[a + 2];
      lengthsSq[i] = dx * dx + dy * dy + dz * dz;
    }

    // TypedArray.sort() is numeric by default. The cutoff is the length of
    // the shortest segment we can still afford to keep.
    const cutoff = lengthsSq.slice().sort()[total - budget];

    const kept = new Float32Array(budget * 6);
    let shown = 0;
    for (let i = 0; i < total && shown < budget; i++) {
      if (lengthsSq[i] < cutoff) continue;
      const a = i * 6;
      const o = shown * 6;
      for (let k = 0; k < 6; k++) kept[o + k] = src[a + k];
      shown++;
    }

    const clipped = new T.BufferGeometry();
    clipped.setAttribute(
      'position',
      new T.Float32BufferAttribute(
        shown === budget ? kept : kept.subarray(0, shown * 6),
        3
      )
    );
    edgesGeo.dispose?.();

    this._edgeStats = { total, shown };
    return clipped;
  }

  /** Detach and dispose the edges overlay (parented to the mesh). */
  _removeEdgesOverlay() {
    if (!this._edgesOverlay) return;
    this._edgesOverlay.parent?.remove(this._edgesOverlay);
    this._edgesOverlay.geometry?.dispose();
    this._edgesOverlay.material?.dispose();
    this._edgesOverlay = null;
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
    this._unsubscribeFrom(this._connectedPm || pm);
    this._connectedPm = null;
    if (pm?.scene) {
      if (this._axesHelper) pm.scene.remove(this._axesHelper);
      if (this._crosshairGroup) pm.scene.remove(this._crosshairGroup);
    }
    this._removeEdgesOverlay();
    this._tearDownAxisTickOverlay();
    this._axesHelper = null;
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
