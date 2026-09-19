/**
 * File Actions Controller
 *
 * Provides New, Reload, Save, Save As, Export Image, and Recent Files
 * tracking.  Maps to the desktop OpenSCAD File menu, adapted for the
 * panel-based web UI.
 *
 * @license GPL-3.0-or-later
 */

import { getAppPrefKey, safeGetItem, safeSetItem } from './storage-keys.js';
import { announceImmediate } from './announcer.js';
import { stateManager } from './state.js';
import { downloadFile, resolveDownloadFilename } from './download.js';
import { getBrailleDownloadName } from './braille-panel.js';
import { showErrorToast } from './error-translator.js';

const RECENT_FILES_KEY = getAppPrefKey('recent-files');
const MAX_RECENT = 10;

/**
 * Render pipeline hooks, injected from main.js, which owns it.
 * @type {{hasCurrentRender: Function|null, renderForExport: Function|null}}
 */
let exportDeps = { hasCurrentRender: null, renderForExport: null };

/**
 * @param {Object} deps
 * @param {(format: string, opts: Object) => boolean} deps.hasCurrentRender
 *        Whether the render already in hand is this format, for these
 *        parameters. Must be the app's single render-state source.
 * @param {(format: string, opts: Object) => Promise<'ready'|'downloaded'|false>}
 *        deps.renderForExport Runs a full render in the requested format.
 */
export function setExportDependencies(deps) {
  exportDeps = {
    hasCurrentRender: deps.hasCurrentRender || null,
    renderForExport: deps.renderForExport || null,
  };
}

/**
 * Export the model in the given format.
 *
 * Upstream's File > Export renders whatever you ask for. This used to refuse
 * with a "Format Mismatch" toast whenever the render in hand was a different
 * format — a dead end the user could only escape by finding the output-format
 * select and pressing Generate. It now renders on demand instead.
 *
 * @param {string} format - Format key from OUTPUT_FORMATS (e.g. 'stl', 'obj')
 * @param {Object} [options]
 * @param {boolean} [options.stlBinary=true] - STL encoding (upstream ships both)
 * @param {boolean} [options.renderIfNeeded=true] - Set false to export only
 *        what already exists. The memory banner needs this: it appears when
 *        memory is critical, and rendering is the operation it is warning
 *        about, so it must never start one.
 */
export async function exportFormatFromMenu(
  format,
  { stlBinary = true, renderIfNeeded = true } = {}
) {
  const state = stateManager.getState();
  if (!state.uploadedFile?.content) {
    showErrorToast({
      title: 'No File Open',
      message: 'Open a .scad file first.',
    });
    return;
  }

  if (exportDeps.hasCurrentRender?.(format, { stlBinary }) !== true) {
    if (!renderIfNeeded) {
      showErrorToast({
        title: 'No Rendered Model',
        message: 'No rendered model to export. Run Render first.',
      });
      return;
    }
    if (!exportDeps.renderForExport) {
      showErrorToast({
        title: 'Engine Not Ready',
        message:
          'The OpenSCAD engine has not initialized yet. Please wait or refresh the page.',
      });
      return;
    }
    const outcome = await exportDeps.renderForExport(format, { stlBinary });
    // 'downloaded' — the 2D path saves the file itself, so stop here.
    if (outcome !== 'ready') return;
  }

  const current = stateManager.getState();
  const outputData = current.generatedOutput?.data || current.stl;
  if (!outputData) return;
  const filename = resolveDownloadFilename(
    current.uploadedFile?.name || 'model',
    current.parameters || {},
    format,
    getBrailleDownloadName()
  );
  downloadFile(outputData, filename, format);
}

/**
 * @typedef {Object} RecentFileEntry
 * @property {string} name - File name
 * @property {number} timestamp - Date.now() of last open
 */

/**
 * FileActionsController manages file-related UI actions.
 * Delegates heavy lifting (parsing, rendering) back to callbacks
 * provided during init so it stays decoupled from main.js internals.
 */
export class FileActionsController {
  /**
   * @param {Object} [options]
   * @param {Function} [options.onNew]        - () => void — reset to blank state
   * @param {Function} [options.onReload]     - () => void — re-parse current file
   * @param {Function} [options.onSave]       - () => void — overwrite saved project or show save prompt
   * @param {Function} [options.onSaveAs]     - () => void — show save-as prompt for new named copy
   * @param {Function} [options.onSaveAll]    - () => void — overwrite all files in current project
   * @param {Function} [options.onExportImage]- () => void — capture canvas as PNG
   * @param {Function} [options.onExport2D]   - (format: 'svg'|'dxf') => Promise<void> — one-click 2D export
   * @param {Function} [options.onOpenRecent] - (entry: RecentFileEntry) => void
   */
  constructor(options = {}) {
    this.onNew = options.onNew || (() => {});
    this.onReload = options.onReload || (() => {});
    this.onSave = options.onSave || (() => {});
    this.onSaveAs = options.onSaveAs || (() => {});
    this.onSaveAll = options.onSaveAll || (() => {});
    this.onExportImage = options.onExportImage || (() => {});
    this.onExport2D = options.onExport2D || (() => {});
    this.onOpenRecent = options.onOpenRecent || (() => {});

    /** @type {RecentFileEntry[]} */
    this.recentFiles = [];
  }

  /**
   * Wire DOM elements and load recent files.
   */
  init() {
    this._loadRecent();
    this._wireButtons();
    this._renderRecentList();
  }

  /**
   * Record that a file was opened (call from main.js after handleFile).
   * @param {string} name
   */
  trackOpen(name) {
    if (!name) return;
    this.recentFiles = this.recentFiles.filter((r) => r.name !== name);
    this.recentFiles.unshift({ name, timestamp: Date.now() });
    if (this.recentFiles.length > MAX_RECENT) {
      this.recentFiles = this.recentFiles.slice(0, MAX_RECENT);
    }
    this._saveRecent();
    this._renderRecentList();
  }

  /**
   * Forget every recent file (File > Recent Files > Clear Recent).
   */
  clearRecent() {
    this.recentFiles = [];
    this._saveRecent();
    this._renderRecentList();
  }

  // -----------------------------------------------------------------------
  // Private
  // -----------------------------------------------------------------------

  _wireButtons() {
    const ids = {
      'file-new-btn': () => {
        this.onNew();
        announceImmediate('New file created');
      },
      'file-reload-btn': () => {
        this.onReload();
        announceImmediate('File reloaded');
      },
      'file-save-btn': () => {
        this.onSave();
      },
      'file-save-as-btn': () => {
        this.onSaveAs();
      },
      'file-export-image-btn': () => {
        this.onExportImage();
        announceImmediate('Image exported');
      },
    };
    for (const [id, handler] of Object.entries(ids)) {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', handler);
    }
  }

  _loadRecent() {
    try {
      // try/catch retained for JSON.parse of possibly-corrupt values
      const stored = safeGetItem(RECENT_FILES_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          this.recentFiles = parsed.slice(0, MAX_RECENT);
        }
      }
    } catch {
      // ignore
    }
  }

  _saveRecent() {
    safeSetItem(RECENT_FILES_KEY, JSON.stringify(this.recentFiles));
  }

  _renderRecentList() {
    const container = document.getElementById('file-recent-list');
    if (!container) return;

    container.textContent = '';

    if (this.recentFiles.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'file-recent-empty';
      empty.textContent = 'No recent files.';
      container.appendChild(empty);
      return;
    }

    const list = document.createElement('ul');
    list.className = 'file-recent-items';
    list.setAttribute('role', 'list');

    for (const entry of this.recentFiles) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'file-recent-btn';
      btn.textContent = entry.name;
      btn.setAttribute('aria-label', `Open recent file: ${entry.name}`);
      btn.addEventListener('click', () => {
        this.onOpenRecent(entry);
        announceImmediate(`Opening ${entry.name}`);
      });
      li.appendChild(btn);
      list.appendChild(li);
    }

    container.appendChild(list);
  }
}

// Singleton
let instance = null;

/**
 * Get or create the FileActionsController singleton.
 * @param {Object} [options]
 * @returns {FileActionsController}
 */
export function getFileActionsController(options = {}) {
  if (!instance) {
    instance = new FileActionsController(options);
  }
  return instance;
}

/**
 * Reset singleton (for testing).
 */
export function resetFileActionsController() {
  instance = null;
}
