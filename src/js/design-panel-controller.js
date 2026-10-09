/**
 * Design Panel Controller
 *
 * Provides Flush Caches, Display Parameters, Check Validity, and Geometry Info.
 * Maps to the desktop OpenSCAD Design menu, adapted for the panel-based
 * web UI.  Actions that require a loaded model gracefully report "no model"
 * when the preview is empty.
 *
 * @license GPL-3.0-or-later
 */

import { announceImmediate } from './announcer.js';
import { getConsolePanel } from './console-panel.js';
import { createModal } from './modal-manager.js';

/**
 * DesignPanelController manages design-tool UI actions.
 * Delegates renderer, worker, and parser access through callbacks.
 */
export class DesignPanelController {
  /**
   * @param {Object} [options]
   * @param {Function} [options.getPreviewManager]  - () => PreviewManager
   * @param {Function} [options.getWorker]           - () => Worker
   * @param {Function} [options.getScadContent]      - () => string
   * @param {Function} [options.extractParameters]   - (scad) => param[]
   * @param {Function} [options.onFlushComplete]     - () => void
   */
  constructor(options = {}) {
    this.getPreviewManager = options.getPreviewManager || (() => null);
    this.getWorker = options.getWorker || (() => null);
    this.getScadContent = options.getScadContent || (() => '');
    this.extractParameters = options.extractParameters || (() => []);
    this.onFlushComplete = options.onFlushComplete || (() => {});
    // The dialog each action has open, so asking again does not stack copies.
    this._open = new Map();
  }

  init() {
    this._wireButtons();
  }

  // ---------------------------------------------------------------------------
  // Flush Caches
  // ---------------------------------------------------------------------------

  flushCaches() {
    const worker = this.getWorker();
    if (worker) {
      worker.postMessage({ type: 'CLEAR_FILES' });
      worker.postMessage({ type: 'CLEAR_LIBRARIES' });
    }

    const pm = this.getPreviewManager();
    if (pm?.clearScene) pm.clearScene();

    this.onFlushComplete();
    this._updateGeometryDisplay(null);
    announceImmediate('Caches flushed: files, libraries, and geometry cleared');
  }

  // ---------------------------------------------------------------------------
  // Display Parameters
  // ---------------------------------------------------------------------------

  showAST() {
    const scad = this.getScadContent();
    if (!scad) {
      announceImmediate('No SCAD file loaded');
      return;
    }

    let params;
    try {
      params = this.extractParameters(scad);
    } catch (e) {
      announceImmediate('Parse error: ' + (e.message || 'unknown'));
      return;
    }

    const count = Object.keys(params?.parameters || {}).length;
    const pre = document.createElement('pre');
    pre.className = 'design-ast-content';
    pre.textContent = JSON.stringify(params, null, 2);
    this._showDialog('ast', 'Parameter Schema', pre);

    announceImmediate(
      `Parameter schema shown: ${count} ${count === 1 ? 'parameter' : 'parameters'}`
    );
  }

  // ---------------------------------------------------------------------------
  // Check Validity
  // ---------------------------------------------------------------------------

  checkValidity() {
    const pm = this.getPreviewManager();
    if (!pm?.mesh) {
      announceImmediate('No model loaded. Render first to check validity');
      return;
    }

    const geo = pm.mesh.geometry;
    const positionAttr = geo?.attributes?.position;
    if (!positionAttr) {
      announceImmediate('Geometry has no vertex data');
      return;
    }

    const vertexCount = positionAttr.count;
    const indexCount = geo.index ? geo.index.count : vertexCount;
    const triangleCount = Math.floor(indexCount / 3);
    // The mesh repeats a corner for every triangle that meets there; the
    // engine's console counts each corner once, and so does this.
    const corners = new Set();
    const xyz = positionAttr.array;
    const stride = positionAttr.itemSize || 3;
    for (let i = 0; i < vertexCount; i += 1) {
      const at = i * stride;
      corners.add(`${xyz[at]},${xyz[at + 1]},${xyz[at + 2]}`);
    }

    const issues = [];
    if (vertexCount === 0) issues.push('mesh has no vertices');
    if (triangleCount === 0) issues.push('mesh has no faces');

    const statusEl = document.getElementById('design-validity-status');
    const valid = issues.length === 0;
    const msg = valid
      ? `Valid mesh: ${triangleCount.toLocaleString()} triangles, ${corners.size.toLocaleString()} unique vertices`
      : `Issues found: ${issues.join('; ')}`;
    if (statusEl) {
      statusEl.textContent = msg;
      statusEl.dataset.state = valid ? 'valid' : 'invalid';
    }
    const result = document.createElement('p');
    result.className = 'design-validity-result';
    result.textContent = msg;
    this._showDialog('validity', 'Check Validity', result);
    getConsolePanel().addSystemLine(msg);
    announceImmediate(msg);
  }

  // ---------------------------------------------------------------------------
  // Geometry Info
  // ---------------------------------------------------------------------------

  updateGeometryInfo() {
    const pm = this.getPreviewManager();
    if (!pm?.mesh) {
      this._updateGeometryDisplay(null);
      return;
    }
    const dims = pm.calculateDimensions?.();
    this._updateGeometryDisplay(dims);
  }

  /** @param {Object|null} dims */
  _updateGeometryDisplay(dims) {
    const el = document.getElementById('design-geometry-info');
    if (!el) return;

    if (!dims) {
      el.textContent = 'No geometry loaded.';
      return;
    }

    el.textContent = '';
    const rows = [
      ['Size X', `${dims.x} mm`],
      ['Size Y', `${dims.y} mm`],
      ['Size Z', `${dims.z} mm`],
      ['Bounding Box Volume', `${dims.volume.toLocaleString()} mm³`],
      ['Triangles', dims.triangles.toLocaleString()],
    ];

    const dl = document.createElement('dl');
    dl.className = 'design-geometry-dl';
    for (const [label, value] of rows) {
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.textContent = value;
      dl.appendChild(dt);
      dl.appendChild(dd);
    }
    el.appendChild(dl);
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  /**
   * Open a dialog for one action, replacing that action's dialog if it is
   * already open.
   * @param {string} key - The action
   * @param {string} title - Visible title, also the dialog's name
   * @param {HTMLElement} body - What the dialog shows
   */
  _showDialog(key, title, body) {
    this._open.get(key)?.cleanup(null);
    const { modal, promise, cleanup } = createModal({
      className: `preset-modal design-${key}-modal`,
      titleId: `design-${key}-title`,
      title,
      buttons: [
        { label: 'Close', className: 'btn btn-primary', action: 'close' },
      ],
    });
    modal.querySelector('.modal-body').appendChild(body);
    this._open.set(key, { cleanup });
    promise.then(() => {
      if (this._open.get(key)?.cleanup === cleanup) this._open.delete(key);
    });
  }

  _wireButtons() {
    const bindings = {
      'design-flush-btn': () => this.flushCaches(),
      'design-ast-btn': () => this.showAST(),
      'design-validity-btn': () => this.checkValidity(),
      'design-geometry-btn': () => this.updateGeometryInfo(),
    };
    for (const [id, handler] of Object.entries(bindings)) {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', handler);
    }
  }
}

// Singleton
let instance = null;

/**
 * Get or create the DesignPanelController singleton.
 * @param {Object} [options]
 * @returns {DesignPanelController}
 */
export function getDesignPanelController(options = {}) {
  if (!instance) {
    instance = new DesignPanelController(options);
  }
  return instance;
}
