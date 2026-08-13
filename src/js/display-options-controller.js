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

import { getAppPrefKey } from './storage-keys.js';
import { readScopedPref, writeScopedPref } from './ui-scoped-prefs.js';
import { announceImmediate } from './announcer.js';
import {
  buildAxisTickOverlay,
  resolveAxisMarkColor,
} from './axis-tick-overlay.js';
import { buildAxisLinesOverlay } from './axis-lines-overlay.js';

const PREF_PREFIX = 'display-';
/**
 * Forge defaults. Classic's differ for axes and axisMarks (the desktop's
 * out-of-the-box look: black axes with tick marks on) — those live in
 * ui-scoped-prefs.js NAMESPACE_DEFAULTS, which readScopedPref serves when
 * the Classic namespace has no saved value. UF-14 replaced the old
 * first-entry stamp (classic-view-defaults-v2) with that per-namespace
 * fallback, so each interface keeps its own saved copy of every toggle
 * and neither can overwrite the other's again (U-25).
 */
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
    this._axesOverlay = null;
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
      // The axis overlays are functions of the camera distance (UF-7:
      // desktop's showScalemarkers rebuilds per frame; ours rebuild when
      // the zoom actually moves). Orbit and pan keep the target distance,
      // so this only fires real rebuilds while zooming.
      if (pm.controls?.addEventListener) {
        if (!this._boundZoomRefresh) {
          this._boundZoomRefresh = () => this._queueZoomRebuild();
        }
        pm.controls.addEventListener('change', this._boundZoomRefresh);
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
    if (pm.controls?.removeEventListener && this._boundZoomRefresh) {
      pm.controls.removeEventListener('change', this._boundZoomRefresh);
    }
  }

  /**
   * Camera distance to the orbit target — desktop `Camera::zoomValue()`,
   * the number every UF-7 overlay dimension derives from.
   * @param {Object} pm
   * @returns {number|null}
   * @private
   */
  _cameraDistanceMm(pm) {
    const cam = pm?.camera;
    if (!cam?.position) return null;
    const target = pm?.controls?.target;
    const base =
      target && typeof cam.position.distanceTo === 'function'
        ? cam.position.distanceTo(target)
        : typeof cam.position.length === 'function'
          ? cam.position.length()
          : null;
    if (base == null) return null;
    // Orthographic zoom scales the frustum, not the position — desktop's
    // one viewer_distance drives both projections, so the effective
    // distance here is the base divided by that zoom (zoom 2 ≙ half the
    // visible world ≙ half the distance).
    if (pm.getProjectionMode?.() === 'orthographic' && pm.orthoCamera) {
      return base / (pm.orthoCamera.zoom || 1);
    }
    return base;
  }

  /** Coalesce controls 'change' bursts to one rebuild check per frame. @private */
  _queueZoomRebuild() {
    if (this._zoomRebuildQueued) return;
    this._zoomRebuildQueued = true;
    const raf =
      typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame
        : (fn) => setTimeout(fn, 16);
    raf(() => {
      this._zoomRebuildQueued = false;
      this._rebuildForZoom();
    });
  }

  /** @private */
  _rebuildForZoom() {
    const pm = this.getPreviewManager();
    if (!pm?.scene) return;
    const distance = this._cameraDistanceMm(pm);
    if (!distance) return;
    // 0.5% is invisible at these sizes; anything larger re-derives the
    // whole overlay from the new distance, exactly as the desktop would.
    const stale = (built) =>
      typeof built === 'number' && Math.abs(distance - built) / built >= 0.005;
    if (this.state.axisMarks && stale(this._axisTickOverlay?.distanceMm)) {
      this._tearDownAxisTickOverlay();
      this._applyAxisMarks(pm);
    }
    if (this.state.axes && stale(this._axesOverlay?.distanceMm)) {
      this._tearDownAxesOverlay();
      this._applyAxes(pm);
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
  set(option, enabled, { announce = true } = {}) {
    if (!(option in this.state)) return;
    this.state[option] = enabled;
    this._savePref(option, enabled);
    this._apply(option);
    this._syncCheckbox(option);
    if (option === 'edges') this._updateEdgeBudgetStatus();

    // Several surfaces show the same flag — the View menu, the Classic 3D
    // view toolbar, the camera panel. Without this they only learned about
    // their own clicks, so toggling from the menu left the toolbar button's
    // aria-pressed stale and a screen reader reporting the wrong state.
    document.dispatchEvent(
      new CustomEvent('display-option-change', {
        detail: { option, enabled },
      })
    );

    // Silent only for the Classic first-entry stamp: two or three of these in
    // one go would talk over the mode change the user actually asked for. Every
    // user-driven call still speaks.
    if (!announce) return;
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
    // U-3 hardening: any path that replaces or clears scene content lost
    // axes and ticks with nothing to restore them — this list re-applied
    // only what a mesh swap invalidates. Both are idempotent re-adds
    // (getObjectByName guards), so the common case costs nothing.
    this._apply('axes');
    this._apply('axisMarks');
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
    writeScopedPref(
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
    if (this.state.axes) {
      // The axis lines resolve the same theme color as the ticks (Q-22),
      // so they rebuild on the same events.
      this._tearDownAxesOverlay();
      this._apply('axes');
    }
  }

  // ---------------------------------------------------------------------------
  // Preference persistence
  // ---------------------------------------------------------------------------

  _loadPreferences() {
    for (const key of Object.keys(DEFAULTS)) {
      const saved = readScopedPref(getAppPrefKey(PREF_PREFIX + key));
      if (saved !== null) this.state[key] = saved === 'true';
      else this.state[key] = DEFAULTS[key];
    }
    const savedBudget = readScopedPref(
      getAppPrefKey(PREF_PREFIX + EDGE_BUDGET_PREF)
    );
    this._edgeBudget =
      savedBudget !== null
        ? _coerceEdgeBudget(savedBudget)
        : DEFAULT_EDGE_BUDGET;
  }

  /** @param {string} key @param {boolean} val */
  _savePref(key, val) {
    writeScopedPref(getAppPrefKey(PREF_PREFIX + key), String(val));
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
            distanceMm: this._cameraDistanceMm(pm) ?? undefined,
          });
        } catch (err) {
          // Do NOT just log and return. That is what hid this for a whole
          // release: the option read as on, the camera-bar button read as
          // pressed, and nothing was ever drawn. If the overlay cannot be
          // built, the control has to stop claiming otherwise.
          console.error(
            '[DisplayOptions] Failed to build axis tick overlay:',
            err
          );
          this.state.axisMarks = false;
          // Deliberately NOT persisted (U-3): writing the preference off
          // here is what poisoned profiles permanently — every pre-#59
          // session did it, and the once-ever defaults marker meant nothing
          // ever turned it back on. In-memory off keeps the controls honest
          // for this session; the saved preference stays intact so the next
          // session (or a manual re-toggle) retries the build.
          this._syncCheckbox('axisMarks');
          document.dispatchEvent(
            new CustomEvent('display-option-change', {
              detail: { option: 'axisMarks', enabled: false },
            })
          );
          announceImmediate('Axis distance markings are unavailable');
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
      if (!this._axesOverlay && T) {
        // Was AxesHelper(50): positive halves only, and 50mm short of where
        // the tick overlay puts its outermost marks, so ticks at -200..-50
        // and +100..+200 had no line under them at all.
        this._axesOverlay = buildAxisLinesOverlay(T, {
          themeKey: pm.currentTheme,
          distanceMm: this._cameraDistanceMm(pm) ?? undefined,
        });
      }
      if (this._axesOverlay && !pm.scene.getObjectByName('__displayAxes')) {
        pm.scene.add(this._axesOverlay.group);
      }
    } else if (this._axesOverlay) {
      pm.scene.remove(this._axesOverlay.group);
    }
    this._syncAxisTriad(pm);
  }

  _tearDownAxesOverlay() {
    if (!this._axesOverlay) return;
    const pm = this.getPreviewManager();
    if (pm?.scene) {
      pm.scene.remove(this._axesOverlay.group);
    }
    this._axesOverlay.dispose?.();
    this._axesOverlay = null;
  }

  /**
   * The corner triad follows the Axes toggle exactly as the desktop's
   * smallaxes follow Show Axes (UF-7 P3), and its letters wear the same
   * scheme-resolved color as the axis lines and ticks.
   * @param {Object} pm
   * @private
   */
  _syncAxisTriad(pm) {
    if (typeof pm?.setAxisTriad !== 'function') return;
    pm.setAxisTriad({
      visible: this.state.axes,
      letterColorHex: resolveAxisMarkColor(pm.currentTheme).hex,
    });
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
      if (this._axesOverlay) pm.scene.remove(this._axesOverlay.group);
      if (this._crosshairGroup) pm.scene.remove(this._crosshairGroup);
    }
    if (typeof pm?.setAxisTriad === 'function') {
      pm.setAxisTriad({ visible: false });
    }
    this._removeEdgesOverlay();
    this._tearDownAxisTickOverlay();
    this._axesOverlay?.dispose?.();
    this._axesOverlay = null;
    this._crosshairGroup = null;
    this._boundRefresh = null;
    this._boundThemeRefresh = null;
    this._boundZoomRefresh = null;
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
