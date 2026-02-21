/**
 * Edit Actions Controller
 *
 * Provides copy viewport image, copy camera values (translation, rotation,
 * distance, FOV), jump-to-error navigation, and font size controls.
 * Maps to the desktop OpenSCAD Edit menu, adapted for the panel-based web UI.
 *
 * @license GPL-3.0-or-later
 */

import { getAppPrefKey } from './storage-keys.js';
import { announceImmediate } from './announcer.js';

const FONT_SIZE_KEY = getAppPrefKey('editor-font-size');
const DEFAULT_FONT_SIZE = 14;
const MIN_FONT_SIZE = 8;
const MAX_FONT_SIZE = 32;
const FONT_SIZE_STEP = 2;

/**
 * EditActionsController manages edit-related UI actions.
 * Delegates heavy lifting (canvas access, error log access, editor commands)
 * back to callbacks provided during init.
 */
export class EditActionsController {
  /**
   * @param {Object} [options]
   * @param {Function} [options.getPreviewManager] - () => PreviewManager
   * @param {Function} [options.getErrorLogPanel]  - () => ErrorLogPanel
   * @param {Function} [options.onJumpToLine]       - (file, line) => void
   * @param {Function} [options.onFontSizeChange]   - (size: number) => void
   */
  constructor(options = {}) {
    this.getPreviewManager = options.getPreviewManager || (() => null);
    this.getErrorLogPanel = options.getErrorLogPanel || (() => null);
    this.onJumpToLine = options.onJumpToLine || (() => {});
    this.onFontSizeChange = options.onFontSizeChange || (() => {});

    /** @type {number} */
    this.fontSize = DEFAULT_FONT_SIZE;

    /** @type {number} Current index in filtered error list for jump cycling */
    this._errorIndex = -1;
  }

  init() {
    this._loadFontSize();
    this._wireButtons();
    this._updateFontSizeDisplay();
  }

  // ---------------------------------------------------------------------------
  // Viewport image
  // ---------------------------------------------------------------------------

  async copyViewportImage() {
    const pm = this.getPreviewManager();
    if (!pm?.renderer) {
      announceImmediate('No preview available to copy');
      return;
    }

    pm.renderer.render(pm.scene, pm.getActiveCamera());
    const canvas = pm.renderer.domElement;

    try {
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png');
      });
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob }),
      ]);
      announceImmediate('Viewport image copied to clipboard');
    } catch {
      announceImmediate('Could not copy image — try right-click and "Save image as"');
    }
  }

  // ---------------------------------------------------------------------------
  // Copy camera values
  // ---------------------------------------------------------------------------

  /** @returns {{x: number, y: number, z: number}|null} */
  _getTarget() {
    const pm = this.getPreviewManager();
    return pm?.controls?.target
      ? { x: pm.controls.target.x, y: pm.controls.target.y, z: pm.controls.target.z }
      : null;
  }

  /** @returns {{x: number, y: number, z: number}|null} */
  _getCameraPos() {
    const pm = this.getPreviewManager();
    const cam = pm?.getActiveCamera?.();
    return cam?.position
      ? { x: cam.position.x, y: cam.position.y, z: cam.position.z }
      : null;
  }

  async copyTranslation() {
    const t = this._getTarget();
    if (!t) { announceImmediate('No model loaded'); return; }
    const text = `[${t.x.toFixed(2)}, ${t.y.toFixed(2)}, ${t.z.toFixed(2)}]`;
    await this._copyText(text, 'Translation copied');
  }

  async copyRotation() {
    const pos = this._getCameraPos();
    const t = this._getTarget();
    if (!pos || !t) { announceImmediate('No model loaded'); return; }

    const dx = pos.x - t.x;
    const dy = pos.y - t.y;
    const dz = pos.z - t.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist < 1e-6) { announceImmediate('Camera at target — no rotation'); return; }

    const elevation = Math.asin(dz / dist) * (180 / Math.PI);
    const azimuth = Math.atan2(dx, -dy) * (180 / Math.PI);
    const text = `[${azimuth.toFixed(2)}, 0, ${elevation.toFixed(2)}]`;
    await this._copyText(text, 'Rotation copied');
  }

  async copyDistance() {
    const pos = this._getCameraPos();
    const t = this._getTarget();
    if (!pos || !t) { announceImmediate('No model loaded'); return; }

    const dx = pos.x - t.x;
    const dy = pos.y - t.y;
    const dz = pos.z - t.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    await this._copyText(dist.toFixed(2), 'Distance copied');
  }

  async copyFov() {
    const pm = this.getPreviewManager();
    const fov = pm?.camera?.fov;
    if (fov == null) { announceImmediate('No preview available'); return; }
    await this._copyText(String(fov.toFixed(1)), 'FOV copied');
  }

  // ---------------------------------------------------------------------------
  // Jump to error
  // ---------------------------------------------------------------------------

  jumpToNextError() {
    this._jumpError(1);
  }

  jumpToPrevError() {
    this._jumpError(-1);
  }

  /** @param {1|-1} direction */
  _jumpError(direction) {
    const panel = this.getErrorLogPanel();
    if (!panel) return;

    const entries = panel.getEntries(true);
    const navigable = entries.filter((e) => e.line != null);
    if (navigable.length === 0) {
      announceImmediate('No errors with line numbers');
      return;
    }

    this._errorIndex += direction;
    if (this._errorIndex >= navigable.length) this._errorIndex = 0;
    if (this._errorIndex < 0) this._errorIndex = navigable.length - 1;

    const entry = navigable[this._errorIndex];
    this.onJumpToLine(entry.file, entry.line);
    const pos = `${this._errorIndex + 1} of ${navigable.length}`;
    announceImmediate(`Error ${pos}: line ${entry.line} — ${entry.message}`);
  }

  // ---------------------------------------------------------------------------
  // Font size
  // ---------------------------------------------------------------------------

  increaseFontSize() {
    this._setFontSize(this.fontSize + FONT_SIZE_STEP);
  }

  decreaseFontSize() {
    this._setFontSize(this.fontSize - FONT_SIZE_STEP);
  }

  /** @param {number} size */
  _setFontSize(size) {
    const clamped = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, size));
    if (clamped === this.fontSize) return;
    this.fontSize = clamped;
    this._saveFontSize();
    this._updateFontSizeDisplay();
    this.onFontSizeChange(clamped);
    announceImmediate(`Font size: ${clamped}px`);
  }

  _loadFontSize() {
    try {
      const saved = localStorage.getItem(FONT_SIZE_KEY);
      if (saved) {
        const val = parseInt(saved, 10);
        if (!isNaN(val) && val >= MIN_FONT_SIZE && val <= MAX_FONT_SIZE) {
          this.fontSize = val;
        }
      }
    } catch {
      // ignore
    }
  }

  _saveFontSize() {
    try {
      localStorage.setItem(FONT_SIZE_KEY, String(this.fontSize));
    } catch {
      // quota exceeded — acceptable
    }
  }

  _updateFontSizeDisplay() {
    const display = document.getElementById('edit-font-size-value');
    if (display) display.textContent = `${this.fontSize}px`;
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  _wireButtons() {
    const bindings = {
      'edit-copy-viewport-btn': () => this.copyViewportImage(),
      'edit-copy-translation-btn': () => this.copyTranslation(),
      'edit-copy-rotation-btn': () => this.copyRotation(),
      'edit-copy-distance-btn': () => this.copyDistance(),
      'edit-copy-fov-btn': () => this.copyFov(),
      'edit-jump-next-error-btn': () => this.jumpToNextError(),
      'edit-jump-prev-error-btn': () => this.jumpToPrevError(),
      'edit-font-increase-btn': () => this.increaseFontSize(),
      'edit-font-decrease-btn': () => this.decreaseFontSize(),
    };
    for (const [id, handler] of Object.entries(bindings)) {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', handler);
    }
  }

  /**
   * @param {string} text
   * @param {string} successMsg
   */
  async _copyText(text, successMsg) {
    try {
      await navigator.clipboard.writeText(text);
      announceImmediate(successMsg);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      announceImmediate(successMsg);
    }
  }
}

// Singleton
let instance = null;

/**
 * Get or create the EditActionsController singleton.
 * @param {Object} [options]
 * @returns {EditActionsController}
 */
export function getEditActionsController(options = {}) {
  if (!instance) {
    instance = new EditActionsController(options);
  }
  return instance;
}

/**
 * Reset singleton (for testing).
 */
export function resetEditActionsController() {
  instance = null;
}
