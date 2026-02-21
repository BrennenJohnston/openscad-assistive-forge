/**
 * Design Panel Controller
 *
 * Provides Flush Caches, Display AST, Check Validity, and Geometry Info.
 * Maps to the desktop OpenSCAD Design menu, adapted for the panel-based
 * web UI.  Actions that require a loaded model gracefully report "no model"
 * when the preview is empty.
 *
 * @license GPL-3.0-or-later
 */

import { announceImmediate } from './announcer.js';
import { createModal, closeModal } from './modal-manager.js';

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
    announceImmediate('Caches flushed — files, libraries, and geometry cleared');
  }

  // ---------------------------------------------------------------------------
  // Display AST
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

    const text = JSON.stringify(params, null, 2);
    const { modal } = createModal({
      ariaLabel: 'Parsed parameter AST',
      className: 'design-ast-modal',
      closeOnOverlay: true,
      closeOnEscape: true,
    });

    const heading = document.createElement('h2');
    heading.className = 'design-ast-heading';
    heading.textContent = 'Parsed Parameters (AST)';

    const pre = document.createElement('pre');
    pre.className = 'design-ast-content';
    pre.textContent = text;

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'btn btn-primary design-ast-close';
    closeBtn.textContent = 'Close';
    closeBtn.setAttribute('aria-label', 'Close AST view');
    closeBtn.addEventListener('click', () => closeModal(modal));

    const body = modal.querySelector('.modal-body') || modal;
    body.appendChild(heading);
    body.appendChild(pre);
    body.appendChild(closeBtn);

    announceImmediate(`AST displayed with ${params.length} parameters`);
  }

  // ---------------------------------------------------------------------------
  // Check Validity
  // ---------------------------------------------------------------------------

  checkValidity() {
    const pm = this.getPreviewManager();
    if (!pm?.mesh) {
      announceImmediate('No model loaded — render first to check validity');
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

    const issues = [];
    if (vertexCount === 0) issues.push('mesh has no vertices');
    if (triangleCount === 0) issues.push('mesh has no faces');
    if (!geo.index && vertexCount % 3 !== 0) {
      issues.push('vertex count is not a multiple of 3 (non-manifold)');
    }

    const statusEl = document.getElementById('design-validity-status');
    if (issues.length === 0) {
      const msg = `Valid: ${triangleCount.toLocaleString()} triangles, ${vertexCount.toLocaleString()} vertices`;
      if (statusEl) {
        statusEl.textContent = msg;
        statusEl.dataset.state = 'valid';
      }
      announceImmediate(msg);
    } else {
      const msg = `Issues found: ${issues.join('; ')}`;
      if (statusEl) {
        statusEl.textContent = msg;
        statusEl.dataset.state = 'invalid';
      }
      announceImmediate(msg);
    }
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
      ['Volume', `${dims.volume.toLocaleString()} mm³`],
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

/**
 * Reset singleton (for testing).
 */
export function resetDesignPanelController() {
  instance = null;
}
