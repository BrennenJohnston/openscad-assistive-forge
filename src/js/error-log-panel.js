/**
 * Error Log Panel - Structured error display with filtering and line navigation
 *
 * Separate from ConsolePanel: this shows a structured table of parsed errors
 * with type filters, sortable columns, and click-to-line integration for
 * the code editor.  Maps to desktop OpenSCAD's ErrorLog.cc.
 *
 * @license GPL-3.0-or-later
 */

import { announceError, announceImmediate } from './announcer.js';

/**
 * Error entry types (matches desktop OpenSCAD ErrorLog groups)
 */
export const ERROR_LOG_TYPE = {
  ERROR: 'error',
  WARNING: 'warning',
  DEPRECATED: 'deprecated',
  TRACE: 'trace',
};

const TYPE_LABELS = {
  [ERROR_LOG_TYPE.ERROR]: 'Error',
  [ERROR_LOG_TYPE.WARNING]: 'Warning',
  [ERROR_LOG_TYPE.DEPRECATED]: 'Deprecated',
  [ERROR_LOG_TYPE.TRACE]: 'Trace',
};

/**
 * @typedef {Object} ErrorLogEntry
 * @property {string} type - One of ERROR_LOG_TYPE values
 * @property {string} group - Logical group (Compile, Geometry, Runtime, etc.)
 * @property {string} file - Source file name
 * @property {number|null} line - Line number (null if unknown)
 * @property {string} message - Human-readable error message
 * @property {number} timestamp - Date.now() when entry was created
 */

/**
 * ErrorLogPanel manages the structured error log UI.
 * Pattern follows ConsolePanel: class + singleton + announcer integration.
 */
export class ErrorLogPanel {
  /** @param {Object} [options] */
  constructor(options = {}) {
    /** @type {HTMLElement|null} */
    this.container =
      options.container || document.getElementById('error-log-output');
    /** @type {HTMLElement|null} */
    this.badge = options.badge || document.getElementById('error-log-badge');

    /** @type {ErrorLogEntry[]} */
    this.entries = [];

    /** @type {number} */
    this.maxEntries = options.maxEntries || 500;

    /** @type {Record<string, boolean>} */
    this.filters = {
      [ERROR_LOG_TYPE.ERROR]: true,
      [ERROR_LOG_TYPE.WARNING]: true,
      [ERROR_LOG_TYPE.DEPRECATED]: true,
      [ERROR_LOG_TYPE.TRACE]: false,
    };

    /**
     * The `Show [All ▾]` narrowing (U6b). null = no narrowing, so the Console's
     * per-type checkboxes decide, exactly as they did before this control
     * existed. A type here shows only that type, whatever the checkboxes say.
     * @type {string|null}
     */
    this.showOnly = null;

    /** @type {'timestamp'|'group'|'type'|'file'|'line'} */
    this.sortColumn = 'timestamp';
    /** @type {boolean} */
    this.sortAscending = true;

    /** @type {Record<string, number>} */
    this.counts = {
      [ERROR_LOG_TYPE.ERROR]: 0,
      [ERROR_LOG_TYPE.WARNING]: 0,
      [ERROR_LOG_TYPE.DEPRECATED]: 0,
      [ERROR_LOG_TYPE.TRACE]: 0,
    };

    /** @type {Function|null} Callback: (file, line) => void */
    this.onNavigate = options.onNavigate || null;

    this.lastAnnouncement = 0;
    this.announcementDebounce = 500;
    this.pendingAnnouncement = null;

    if (this.container) {
      this._initFilters();
    }
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Parse a raw OpenSCAD output line into a structured error entry.
   * @param {string} line
   * @param {string} [sourceFile='']
   * @returns {ErrorLogEntry|null}
   */
  parseLine(line, sourceFile = '') {
    if (!line || typeof line !== 'string') return null;
    const trimmed = line.trim();
    if (!trimmed) return null;

    let type = null;
    let group = 'General';
    let file = sourceFile;
    let lineNum = null;
    const message = trimmed;

    // ERROR: patterns
    if (/\bERROR:/i.test(trimmed)) {
      type = ERROR_LOG_TYPE.ERROR;
      group = 'Compile';
    } else if (/\bWARNING:/i.test(trimmed)) {
      type = ERROR_LOG_TYPE.WARNING;
      group = 'Compile';
    } else if (/\bDEPRECATED:/i.test(trimmed)) {
      type = ERROR_LOG_TYPE.DEPRECATED;
      group = 'Compile';
    } else if (/\bTRACE:/i.test(trimmed)) {
      type = ERROR_LOG_TYPE.TRACE;
      group = 'Runtime';
    } else if (
      /^Parser error/i.test(trimmed) ||
      /^Syntax error/i.test(trimmed)
    ) {
      type = ERROR_LOG_TYPE.ERROR;
      group = 'Parse';
    } else if (
      /^CGAL error/i.test(trimmed) ||
      // `|` binds looser than anything else in a regex, so the original
      // /^Mesh (is )?not|manifold/i read as (^Mesh (is )?not) OR (manifold) —
      // and that second alternative was UNANCHORED. Every line containing the
      // word "manifold" was therefore an ERROR, including OpenSCAD's healthy
      // status line "Top level object is a 3D object (manifold):", which the
      // Error-Log then showed as a red row while the Console showed nothing.
      /^Mesh (is )?not\b/i.test(trimmed) ||
      // A real complaint says the object is NOT manifold. The status line says
      // it IS one, so the negation is what tells them apart.
      /\bnot\b[^\n]*\bmanifold\b/i.test(trimmed)
    ) {
      type = ERROR_LOG_TYPE.ERROR;
      group = 'Geometry';
    } else if (/\[OpenSCAD ERR\]/i.test(trimmed) && !/ECHO:/i.test(trimmed)) {
      type = ERROR_LOG_TYPE.ERROR;
      group = 'Runtime';
    } else if (/MODEL_NOT_2D|MODEL_IS_2D|not a 2D object/i.test(trimmed)) {
      type = ERROR_LOG_TYPE.ERROR;
      group = 'Geometry';
    } else if (/^Generation failed/i.test(trimmed)) {
      type = ERROR_LOG_TYPE.ERROR;
      group = 'General';
    }

    if (!type) return null;

    // Extract file:line from patterns like "filename.scad, line 42" or "file.scad:42"
    const fileLineMatch =
      trimmed.match(/([^\s,]+\.scad)\s*,?\s*line\s+(\d+)/i) ||
      trimmed.match(/([^\s,]+\.scad):(\d+)/i);
    if (fileLineMatch) {
      file = fileLineMatch[1];
      lineNum = parseInt(fileLineMatch[2], 10);
    } else {
      const lineOnlyMatch = trimmed.match(/\bline\s+(\d+)\b/i);
      if (lineOnlyMatch) {
        lineNum = parseInt(lineOnlyMatch[1], 10);
      }
    }

    return { type, group, file, line: lineNum, message, timestamp: Date.now() };
  }

  /**
   * Add raw console output — each line is parsed and errors are extracted.
   * @param {string} output
   * @param {string} [sourceFile='']
   */
  addOutput(output, sourceFile = '') {
    if (!output) return;
    let added = false;
    for (const line of output.split('\n')) {
      const entry = this.parseLine(line, sourceFile);
      if (entry) {
        this._addEntry(entry);
        added = true;
      }
    }
    if (added) this.render();
  }

  /**
   * Add a pre-built entry directly.
   * @param {ErrorLogEntry} entry
   */
  addEntry(entry) {
    this._addEntry(entry);
    this.render();
  }

  /**
   * Remove all entries.
   */
  clear() {
    this.entries = [];
    for (const key of Object.keys(this.counts)) this.counts[key] = 0;
    this._updateBadge();
    this.render();
  }

  /**
   * Get all entries (optionally filtered).
   * @param {boolean} [filtered=false]
   * @returns {ErrorLogEntry[]}
   */
  getEntries(filtered = false) {
    if (!filtered) return [...this.entries];
    return this.entries.filter((e) => this.filters[e.type]);
  }

  /**
   * Get aggregate counts.
   * @returns {Record<string, number>}
   */
  getCounts() {
    return { ...this.counts };
  }

  /**
   * Set a single filter type externally (used by unified ConsolePanel).
   * @param {string} type - One of ERROR_LOG_TYPE values
   * @param {boolean} enabled
   */
  setFilter(type, enabled) {
    if (this.filters[type] === undefined) return;
    this.filters[type] = enabled;
    this.render();
  }

  /**
   * Whether any errors or warnings exist.
   * @returns {boolean}
   */
  hasIssues() {
    return (
      this.counts[ERROR_LOG_TYPE.ERROR] > 0 ||
      this.counts[ERROR_LOG_TYPE.WARNING] > 0
    );
  }

  /**
   * Export log as plain text.
   * @returns {string}
   */
  exportLog() {
    return this.entries
      .map((e) => {
        const ts = new Date(e.timestamp).toISOString();
        const loc =
          e.line !== null ? `${e.file || ''}:${e.line}` : e.file || '';
        return `[${ts}] [${e.type.toUpperCase()}] ${loc ? loc + ' — ' : ''}${e.message}`;
      })
      .join('\n');
  }

  // -----------------------------------------------------------------------
  // Rendering
  // -----------------------------------------------------------------------

  /** Re-render the panel contents. */
  render() {
    if (!this.container) return;

    const region = this._ensureRegion();
    const visible = this._sortedEntries(this.entries.filter(this._isVisible));

    // Only the region is rebuilt. The Show row above it keeps its element, so
    // rendering never steals focus from the select or re-announces it.
    region.textContent = '';

    if (visible.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'error-log-empty';
      empty.textContent = 'No errors. Compile or render to check for issues.';
      region.appendChild(empty);
      return;
    }

    const table = document.createElement('table');
    table.className = 'error-log-table';
    table.setAttribute('role', 'grid');
    table.setAttribute('aria-label', 'Error log entries');

    table.appendChild(this._buildThead());

    const tbody = document.createElement('tbody');
    for (const entry of visible) {
      tbody.appendChild(this._buildRow(entry));
    }
    table.appendChild(tbody);
    region.appendChild(table);
  }

  /**
   * Whether an entry passes both filters: the Console's per-type checkboxes,
   * and the Show select's narrowing on top of them.
   * @param {ErrorLogEntry} entry
   * @returns {boolean}
   * @private
   */
  _isVisible = (entry) =>
    this.showOnly ? entry.type === this.showOnly : this.filters[entry.type];

  /**
   * The live region the table renders into, plus the `Show [All ▾]` row above
   * it (U6b). Built once and kept, so the select survives every render.
   *
   * The row sits OUTSIDE the live region on purpose: role="log" belongs to the
   * content that changes, and a <select> rebuilt inside one would be read out
   * on every render.
   * @returns {HTMLElement}
   * @private
   */
  _ensureRegion() {
    let region = this.container.querySelector('.error-log-entries');
    if (region && this.container.querySelector('.error-log-show-row')) {
      return region;
    }

    if (!region) {
      region = document.createElement('div');
      region.className = 'error-log-entries';
      region.setAttribute('role', 'log');
      region.setAttribute('aria-label', 'Structured error log');
      region.setAttribute('aria-live', 'polite');
      this.container.appendChild(region);
    }

    const row = document.createElement('div');
    row.className = 'error-log-show-row';

    // A real <label>, not aria-label: the desktop shows the word, and a
    // visible label is the accessible name a sighted and a screen-reader user
    // can both refer to (WCAG 2.5.3).
    const label = document.createElement('label');
    label.className = 'error-log-show-label';
    label.htmlFor = 'error-log-show';
    label.textContent = 'Show';

    const select = document.createElement('select');
    select.id = 'error-log-show';
    select.className = 'error-log-show-select';

    // Owner-approved 2026-08-08: only the types this engine can actually emit.
    // Upstream's list also has UI-WARNING, FONT-WARNING, EXPORT-WARNING and
    // EXPORT-ERROR; those are desktop message SOURCES with no equivalent here,
    // so they are omitted rather than shipped as options that match nothing.
    // Trace is ours, not upstream's, and the panel already filters on it.
    for (const [value, text] of [
      ['all', 'All'],
      [ERROR_LOG_TYPE.ERROR, TYPE_LABELS[ERROR_LOG_TYPE.ERROR]],
      [ERROR_LOG_TYPE.WARNING, TYPE_LABELS[ERROR_LOG_TYPE.WARNING]],
      [ERROR_LOG_TYPE.DEPRECATED, TYPE_LABELS[ERROR_LOG_TYPE.DEPRECATED]],
      [ERROR_LOG_TYPE.TRACE, TYPE_LABELS[ERROR_LOG_TYPE.TRACE]],
    ]) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = text;
      select.appendChild(option);
    }
    select.value = this.showOnly || 'all';
    select.addEventListener('change', () => {
      this.showOnly = select.value === 'all' ? null : select.value;
      this.render();
      announceImmediate(
        this.showOnly
          ? `Showing ${TYPE_LABELS[this.showOnly]} entries only`
          : 'Showing all entries'
      );
    });

    row.appendChild(label);
    row.appendChild(select);
    this.container.insertBefore(row, region);
    return region;
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /** @param {ErrorLogEntry} entry */
  _addEntry(entry) {
    if (!entry) return;
    this.entries.push(entry);
    if (this.counts[entry.type] !== undefined) this.counts[entry.type]++;

    if (this.entries.length > this.maxEntries) {
      const removed = this.entries.shift();
      if (this.counts[removed.type] !== undefined) this.counts[removed.type]--;
    }

    this._updateBadge();
    this._announceIfImportant(entry);
  }

  _updateBadge() {
    if (!this.badge) return;
    const total =
      this.counts[ERROR_LOG_TYPE.ERROR] + this.counts[ERROR_LOG_TYPE.WARNING];
    if (total > 0) {
      this.badge.textContent = String(total);
      this.badge.classList.remove('hidden');
      this.badge.classList.toggle(
        'has-errors',
        this.counts[ERROR_LOG_TYPE.ERROR] > 0
      );
    } else {
      this.badge.classList.add('hidden');
    }
  }

  /** @param {ErrorLogEntry} entry */
  _announceIfImportant(entry) {
    if (
      entry.type !== ERROR_LOG_TYPE.ERROR &&
      entry.type !== ERROR_LOG_TYPE.WARNING
    )
      return;
    const now = Date.now();
    if (now - this.lastAnnouncement < this.announcementDebounce) {
      clearTimeout(this.pendingAnnouncement);
      this.pendingAnnouncement = setTimeout(
        () => this._doAnnounce(entry),
        this.announcementDebounce
      );
      return;
    }
    this._doAnnounce(entry);
  }

  /** @param {ErrorLogEntry} entry */
  _doAnnounce(entry) {
    this.lastAnnouncement = Date.now();
    this.pendingAnnouncement = null;
    const label = TYPE_LABELS[entry.type] || 'Issue';
    const loc = entry.line !== null ? ` at line ${entry.line}` : '';
    const msg = `${label}${loc}: ${entry.message}`;
    if (entry.type === ERROR_LOG_TYPE.ERROR) {
      announceError(msg);
    } else {
      announceImmediate(msg);
    }
  }

  _initFilters() {
    const map = {
      [ERROR_LOG_TYPE.ERROR]: 'error-log-filter-error',
      [ERROR_LOG_TYPE.WARNING]: 'error-log-filter-warn',
      [ERROR_LOG_TYPE.DEPRECATED]: 'error-log-filter-deprecated',
      [ERROR_LOG_TYPE.TRACE]: 'error-log-filter-trace',
    };

    for (const [type, id] of Object.entries(map)) {
      const cb = document.getElementById(id);
      if (cb) {
        /** @type {HTMLInputElement} */ (cb).checked = this.filters[type];
        cb.addEventListener('change', (e) => {
          this.filters[type] = /** @type {HTMLInputElement} */ (
            e.target
          ).checked;
          this.render();
        });
      }
    }

    const clearBtn = document.getElementById('error-log-clear-btn');
    if (clearBtn) clearBtn.addEventListener('click', () => this.clear());

    const copyBtn = document.getElementById('error-log-copy-btn');
    if (copyBtn)
      copyBtn.addEventListener('click', () => this._copyToClipboard());
  }

  /**
   * @param {ErrorLogEntry[]} entries
   * @returns {ErrorLogEntry[]}
   */
  _sortedEntries(entries) {
    const col = this.sortColumn;
    const dir = this.sortAscending ? 1 : -1;
    return [...entries].sort((a, b) => {
      const av = a[col] ?? '';
      const bv = b[col] ?? '';
      if (typeof av === 'number' && typeof bv === 'number')
        return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }

  /** @returns {HTMLElement} */
  _buildThead() {
    const thead = document.createElement('thead');
    const row = document.createElement('tr');

    // Upstream's headers (OpenSCAD_1). "Group" is real data — parseLine has
    // always computed Compile / Parse / Geometry / Runtime / General and never
    // shown it. Owner-approved 2026-08-08: the Group cell carries the severity
    // badge as well as the group name, so relabelling the column does not leave
    // severity to the red row colour alone (WCAG 1.4.1).
    const cols = [
      { key: 'group', label: 'Group' },
      { key: 'file', label: 'File' },
      { key: 'line', label: 'Line' },
      { key: 'message', label: 'Info' },
    ];

    for (const col of cols) {
      const th = document.createElement('th');
      th.setAttribute('scope', 'col');
      th.dataset.sortCol = col.key;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'error-log-sort-btn';
      btn.textContent = col.label;
      btn.setAttribute('aria-label', `Sort by ${col.label}`);
      if (this.sortColumn === col.key) {
        btn.setAttribute(
          'aria-sort',
          this.sortAscending ? 'ascending' : 'descending'
        );
      }
      btn.addEventListener('click', () => {
        if (this.sortColumn === col.key) {
          this.sortAscending = !this.sortAscending;
        } else {
          this.sortColumn = /** @type {any} */ (col.key);
          this.sortAscending = true;
        }
        this.render();
      });
      th.appendChild(btn);
      row.appendChild(th);
    }

    thead.appendChild(row);
    return thead;
  }

  /**
   * @param {ErrorLogEntry} entry
   * @returns {HTMLElement}
   */
  _buildRow(entry) {
    const row = document.createElement('tr');
    row.className = `error-log-row error-log-row--${entry.type}`;
    row.setAttribute('role', 'row');

    const groupCell = document.createElement('td');
    groupCell.className = 'error-log-cell--group';

    const typeBadge = document.createElement('span');
    typeBadge.className = `error-log-type-badge error-log-type-badge--${entry.type}`;
    typeBadge.textContent = TYPE_LABELS[entry.type] || entry.type;
    groupCell.appendChild(typeBadge);

    const groupName = document.createElement('span');
    groupName.className = 'error-log-group-name';
    groupName.textContent = entry.group || 'General';
    groupCell.appendChild(groupName);
    row.appendChild(groupCell);

    const fileCell = document.createElement('td');
    fileCell.className = 'error-log-cell--file';
    fileCell.textContent = entry.file || '—';
    row.appendChild(fileCell);

    const lineCell = document.createElement('td');
    lineCell.className = 'error-log-cell--line';
    if (entry.line !== null && this.onNavigate) {
      const link = document.createElement('button');
      link.type = 'button';
      link.className = 'error-log-line-link';
      link.textContent = String(entry.line);
      link.setAttribute('aria-label', `Go to line ${entry.line}`);
      link.addEventListener('click', () =>
        this.onNavigate(entry.file, entry.line)
      );
      lineCell.appendChild(link);
    } else {
      lineCell.textContent = entry.line !== null ? String(entry.line) : '—';
    }
    row.appendChild(lineCell);

    const msgCell = document.createElement('td');
    msgCell.className = 'error-log-cell--message';
    msgCell.textContent = entry.message;
    row.appendChild(msgCell);

    return row;
  }

  async _copyToClipboard() {
    const text = this.exportLog();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      const btn = document.getElementById('error-log-copy-btn');
      if (btn) {
        const orig = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => {
          btn.textContent = orig;
        }, 1500);
      }
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  }
}

// Singleton
let instance = null;

/**
 * Get or create the ErrorLogPanel singleton.
 * @param {Object} [options]
 * @returns {ErrorLogPanel}
 */
export function getErrorLogPanel(options = {}) {
  if (!instance) {
    instance = new ErrorLogPanel(options);
  }
  return instance;
}

/**
 * Reset singleton (for testing).
 */
export function resetErrorLogPanel() {
  if (instance) instance.clear();
  instance = null;
}

/**
 * Expose a global entry point so the generate catch block in main.js can push
 * structured errors directly into the panel without importing this module.
 * Called after getErrorLogPanel() has created the singleton.
 */
export function initAddStructuredError() {
  window.addStructuredError = (message) => {
    const panel = getErrorLogPanel();
    panel.addEntry({
      type: ERROR_LOG_TYPE.ERROR,
      group: 'General',
      file: '',
      line: null,
      message: message,
      timestamp: Date.now(),
    });
  };
}
