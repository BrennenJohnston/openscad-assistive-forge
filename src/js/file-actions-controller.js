/**
 * File Actions Controller
 *
 * Provides New, Reload, Save, Save As, Export Image, and Recent Files
 * tracking.  Maps to the desktop OpenSCAD File menu, adapted for the
 * panel-based web UI.
 *
 * @license GPL-3.0-or-later
 */

import { getAppPrefKey } from './storage-keys.js';
import { announceImmediate } from './announcer.js';

const RECENT_FILES_KEY = getAppPrefKey('recent-files');
const MAX_RECENT = 10;

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
   * @param {Function} [options.onSave]       - () => void — trigger .scad download
   * @param {Function} [options.onSaveAs]     - () => void — prompt filename then download
   * @param {Function} [options.onExportImage]- () => void — capture canvas as PNG
   * @param {Function} [options.onOpenRecent] - (entry: RecentFileEntry) => void
   */
  constructor(options = {}) {
    this.onNew = options.onNew || (() => {});
    this.onReload = options.onReload || (() => {});
    this.onSave = options.onSave || (() => {});
    this.onSaveAs = options.onSaveAs || (() => {});
    this.onExportImage = options.onExportImage || (() => {});
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

  // -----------------------------------------------------------------------
  // Private
  // -----------------------------------------------------------------------

  _wireButtons() {
    const ids = {
      'file-new-btn': () => { this.onNew(); announceImmediate('New file created'); },
      'file-reload-btn': () => { this.onReload(); announceImmediate('File reloaded'); },
      'file-save-btn': () => { this.onSave(); },
      'file-save-as-btn': () => { this.onSaveAs(); },
      'file-export-image-btn': () => { this.onExportImage(); announceImmediate('Image exported'); },
    };
    for (const [id, handler] of Object.entries(ids)) {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', handler);
    }
  }

  _loadRecent() {
    try {
      const stored = localStorage.getItem(RECENT_FILES_KEY);
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
    try {
      localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(this.recentFiles));
    } catch {
      // quota exceeded — acceptable
    }
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
