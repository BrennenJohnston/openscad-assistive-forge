/**
 * Console Panel - Unified OpenSCAD output display (S-010 desktop parity)
 *
 * Single panel with two views:
 *   - Log: chronological ECHO/WARNING/ERROR/DEPRECATED/TRACE messages
 *   - Structured: sortable error table (delegated to ErrorLogPanel)
 *
 * Programs use echo() to communicate with users; these messages must be visible.
 * @license GPL-3.0-or-later
 */

import { announceError, announceImmediate } from './announcer.js';

/**
 * Console entry types
 */
export const CONSOLE_ENTRY_TYPE = {
  ECHO: 'echo',
  WARNING: 'warning',
  ERROR: 'error',
  INFO: 'info',
  DEPRECATED: 'deprecated',
  TRACE: 'trace',
};

/**
 * ConsolePanel manages the unified OpenSCAD console output UI.
 * Implements:
 * - ECHO, WARNING, ERROR, DEPRECATED, TRACE message parsing
 * - Filtering by message type
 * - Log/Structured view toggle
 * - Copy/download functionality
 * - Rate-limited screen reader announcements
 * - Coordination with ErrorLogPanel (structured sub-view)
 */
export class ConsolePanel {
  constructor(options = {}) {
    this.container =
      options.container || document.getElementById('console-output');
    this.badge = options.badge || document.getElementById('console-badge');
    this.entries = [];
    this.maxEntries = options.maxEntries || 1000;
    this.filters = {
      echo: true,
      warning: true,
      error: true,
      info: false,
      deprecated: true,
      trace: false,
    };

    this.lastAnnouncement = 0;
    this.announcementDebounce = options.announcementDebounce || 500;
    this.pendingAnnouncement = null;

    this.counts = {
      echo: 0,
      warning: 0,
      error: 0,
      info: 0,
      deprecated: 0,
      trace: 0,
    };

    /** @type {import('./error-log-panel.js').ErrorLogPanel|null} */
    this.structuredPanel = options.structuredPanel || null;

    /** @type {Function|null} (file, line) => void */
    this.onNavigate = options.onNavigate || null;

    /** @type {'log'|'structured'} */
    this.activeView = 'log';

    if (this.container) {
      this.initFilters();
      this._initViewTabs();
    }
  }

  /**
   * Initialize filter checkboxes
   */
  initFilters() {
    const filterIds = {
      echo: 'console-filter-echo',
      warning: 'console-filter-warn',
      error: 'console-filter-error',
      deprecated: 'console-filter-deprecated',
      trace: 'console-filter-trace',
    };

    for (const [type, id] of Object.entries(filterIds)) {
      const checkbox = document.getElementById(id);
      if (checkbox) {
        checkbox.checked = this.filters[type];
        checkbox.addEventListener('change', (e) => {
          this.filters[type] = e.target.checked;
          this.render();
          this._syncStructuredFilters(type, e.target.checked);
        });
      }
    }

    const copyBtn = document.getElementById('console-copy-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => this.copyToClipboard());
    }

    const downloadBtn = document.getElementById('console-download-btn');
    if (downloadBtn) {
      downloadBtn.addEventListener('click', () => this.downloadLog());
    }

    const clearBtn = document.getElementById('console-clear-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => this.clear());
    }
  }

  /**
   * Initialize the Log/Structured view toggle tabs
   */
  _initViewTabs() {
    const logTab = document.getElementById('console-tab-log');
    const structuredTab = document.getElementById('console-tab-structured');
    const logPanel = document.getElementById('console-view-log');
    const structuredPanel = document.getElementById('console-view-structured');

    if (!logTab || !structuredTab) return;

    logTab.addEventListener('click', () => {
      this.activeView = 'log';
      logTab.classList.add('active');
      logTab.setAttribute('aria-selected', 'true');
      structuredTab.classList.remove('active');
      structuredTab.setAttribute('aria-selected', 'false');
      if (logPanel) logPanel.hidden = false;
      if (structuredPanel) structuredPanel.hidden = true;
    });

    structuredTab.addEventListener('click', () => {
      this.activeView = 'structured';
      structuredTab.classList.add('active');
      structuredTab.setAttribute('aria-selected', 'true');
      logTab.classList.remove('active');
      logTab.setAttribute('aria-selected', 'false');
      if (structuredPanel) structuredPanel.hidden = false;
      if (logPanel) logPanel.hidden = true;
    });
  }

  /**
   * Propagate a filter change to the structured sub-panel.
   * Maps ConsolePanel filter names to ErrorLogPanel filter names.
   */
  _syncStructuredFilters(type, enabled) {
    if (!this.structuredPanel) return;
    const mapping = {
      warning: 'warning',
      error: 'error',
      deprecated: 'deprecated',
      trace: 'trace',
    };
    const errorLogType = mapping[type];
    if (errorLogType && this.structuredPanel.setFilter) {
      this.structuredPanel.setFilter(errorLogType, enabled);
    }
  }

  /**
   * Parse OpenSCAD console output line
   * @param {string} line - Raw console line
   * @returns {Object|null} Parsed entry or null if filtered
   */
  parseLine(line) {
    if (!line || typeof line !== 'string') return null;

    const trimmed = line.trim();
    if (!trimmed) return null;

    let type = null;
    let file = '';
    let lineNum = null;

    if (trimmed.startsWith('ECHO:')) {
      type = CONSOLE_ENTRY_TYPE.ECHO;
    } else if (trimmed.includes('WARNING:') || trimmed.includes('Warning:')) {
      type = CONSOLE_ENTRY_TYPE.WARNING;
    } else if (trimmed.includes('ERROR:') || trimmed.includes('Error:')) {
      type = CONSOLE_ENTRY_TYPE.ERROR;
    } else if (/\bDEPRECATED:/i.test(trimmed)) {
      type = CONSOLE_ENTRY_TYPE.DEPRECATED;
    } else if (/\bTRACE:/i.test(trimmed)) {
      type = CONSOLE_ENTRY_TYPE.TRACE;
    } else if (trimmed.includes('Compiling') || trimmed.includes('Rendering')) {
      type = CONSOLE_ENTRY_TYPE.INFO;
    }

    if (!type) return null;

    // Extract file:line for navigable entries
    if (
      type === CONSOLE_ENTRY_TYPE.WARNING ||
      type === CONSOLE_ENTRY_TYPE.ERROR ||
      type === CONSOLE_ENTRY_TYPE.DEPRECATED
    ) {
      const fileLineMatch =
        trimmed.match(/([\w.\-/\\]+\.scad)['"]?\s*,?\s*line\s+(\d+)/i) ||
        trimmed.match(/([\w.\-/\\]+\.scad):(\d+)/i);
      if (fileLineMatch) {
        file = fileLineMatch[1];
        lineNum = parseInt(fileLineMatch[2], 10);
      } else {
        const lineOnlyMatch = trimmed.match(/\bline\s+(\d+)\b/i);
        if (lineOnlyMatch) {
          lineNum = parseInt(lineOnlyMatch[1], 10);
        }
      }
    }

    const message =
      type === CONSOLE_ENTRY_TYPE.ECHO ? trimmed.substring(5).trim() : trimmed;

    return {
      type,
      message,
      raw: trimmed,
      file,
      line: lineNum,
      timestamp: Date.now(),
    };
  }

  /**
   * Add raw console output (may contain multiple lines)
   * @param {string} output - Raw console output
   */
  addOutput(output) {
    if (!output) return;

    const lines = output.split('\n');
    let hasNewEntries = false;
    let hasWarningOrError = false;

    for (const line of lines) {
      const entry = this.parseLine(line);
      if (entry) {
        this.addEntry(entry);
        hasNewEntries = true;
        if (
          entry.type === CONSOLE_ENTRY_TYPE.WARNING ||
          entry.type === CONSOLE_ENTRY_TYPE.ERROR
        ) {
          hasWarningOrError = true;
        }
      }
    }

    if (hasNewEntries) {
      this.render();
    }

    if (hasWarningOrError) {
      this.autoExpandPanel();
    }
  }

  /**
   * Auto-expand the console <details> panel when important messages arrive
   */
  autoExpandPanel() {
    const consolePanel = document.getElementById('consolePanel');
    if (consolePanel && !consolePanel.open) {
      consolePanel.open = true;
      console.log(
        '[ConsolePanel] Auto-expanded: WARNING or ERROR message detected'
      );
    }
  }

  /**
   * Add a single entry
   * @param {Object} entry - Console entry
   */
  addEntry(entry) {
    if (!entry) return;

    this.entries.push(entry);
    if (this.counts[entry.type] !== undefined) {
      this.counts[entry.type]++;
    }

    if (this.entries.length > this.maxEntries) {
      const removed = this.entries.shift();
      if (this.counts[removed.type] !== undefined) {
        this.counts[removed.type]--;
      }
    }

    this.updateBadge();
    this.announceIfImportant(entry);
  }

  /**
   * Update the unified badge count (warnings + errors + deprecated)
   */
  updateBadge() {
    if (!this.badge) return;

    const issueCount =
      this.counts.warning + this.counts.error + this.counts.deprecated;
    const importantCount = issueCount + this.counts.echo;
    const totalCount = this.entries.length;

    if (issueCount > 0) {
      this.badge.textContent = importantCount;
      this.badge.classList.add('has-warnings');
      this.badge.classList.remove('hidden');
    } else if (importantCount > 0) {
      this.badge.textContent = importantCount;
      this.badge.classList.remove('has-warnings');
      this.badge.classList.remove('hidden');
    } else if (totalCount > 0) {
      this.badge.textContent = totalCount;
      this.badge.classList.remove('has-warnings');
      this.badge.classList.remove('hidden');
    } else {
      this.badge.classList.add('hidden');
    }
  }

  /**
   * Rate-limited screen reader announcement for important messages
   * @param {Object} entry - Console entry
   */
  announceIfImportant(entry) {
    if (
      entry.type !== CONSOLE_ENTRY_TYPE.ECHO &&
      entry.type !== CONSOLE_ENTRY_TYPE.WARNING &&
      entry.type !== CONSOLE_ENTRY_TYPE.ERROR
    ) {
      return;
    }

    const now = Date.now();
    if (now - this.lastAnnouncement < this.announcementDebounce) {
      if (this.pendingAnnouncement) {
        clearTimeout(this.pendingAnnouncement);
      }
      this.pendingAnnouncement = setTimeout(() => {
        this.doAnnounce(entry);
      }, this.announcementDebounce);
      return;
    }

    this.doAnnounce(entry);
  }

  /**
   * Perform the screen reader announcement.
   * @param {Object} entry - Console entry
   */
  doAnnounce(entry) {
    this.lastAnnouncement = Date.now();
    this.pendingAnnouncement = null;

    let typeLabel;
    if (entry.type === CONSOLE_ENTRY_TYPE.WARNING) {
      typeLabel = 'Warning';
    } else if (entry.type === CONSOLE_ENTRY_TYPE.ERROR) {
      typeLabel = 'Error';
    } else {
      typeLabel = 'Message';
    }
    const message = `${typeLabel}: ${entry.message}`;

    if (entry.type === CONSOLE_ENTRY_TYPE.ERROR) {
      announceError(message);
    } else {
      announceImmediate(message);
    }
  }

  /**
   * Render all entries to the container (Log view)
   */
  render() {
    if (!this.container) return;

    const visibleEntries = this.entries.filter((e) => this.filters[e.type]);

    if (visibleEntries.length === 0) {
      this.container.innerHTML = `
        <div class="console-empty">
          No console output yet. ECHO, WARNING, and ERROR messages will appear here.
        </div>
      `;
      return;
    }

    const entriesHtml = visibleEntries
      .map((entry) => this.renderEntry(entry))
      .join('');

    this.container.innerHTML = entriesHtml;
    this.container.scrollTop = this.container.scrollHeight;
  }

  /**
   * Render a single entry to HTML
   * @param {Object} entry - Console entry
   * @returns {string} HTML string
   */
  renderEntry(entry) {
    const time = new Date(entry.timestamp);
    const timeStr = time.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const typeClass = `console-entry--${entry.type}`;
    const typeLabel = entry.type.toUpperCase();

    const safeMessage = this.escapeHtml(entry.message);

    const entryRole =
      entry.type === 'warning' || entry.type === 'error' ? 'alert' : 'listitem';

    const hasLocation = entry.line !== null && this.onNavigate;
    const lineLink = hasLocation
      ? ` <button type="button" class="console-line-link" data-file="${this.escapeHtml(entry.file || '')}" data-line="${entry.line}" aria-label="Go to line ${entry.line}">:${entry.line}</button>`
      : '';

    return `
      <div class="console-entry ${typeClass}" role="${entryRole}">
        <time class="console-timestamp" datetime="${time.toISOString()}">${timeStr}</time>
        <span class="console-type" aria-hidden="true">${typeLabel}</span>
        <span class="console-message">${safeMessage}${lineLink}</span>
      </div>
    `;
  }

  /**
   * Escape HTML special characters
   * @param {string} str - String to escape
   * @returns {string} Escaped string
   */
  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * Clear all entries and the structured sub-panel
   */
  clear() {
    this.entries = [];
    this.counts = {
      echo: 0,
      warning: 0,
      error: 0,
      info: 0,
      deprecated: 0,
      trace: 0,
    };
    this.updateBadge();
    this.render();
    if (this.structuredPanel) {
      this.structuredPanel.clear();
    }
  }

  /**
   * Export log as plain text (from active view)
   * @returns {string} Log text
   */
  exportLog() {
    if (this.activeView === 'structured' && this.structuredPanel) {
      return this.structuredPanel.exportLog();
    }
    return this.entries
      .map((e) => {
        const time = new Date(e.timestamp).toISOString();
        return `[${time}] [${e.type.toUpperCase()}] ${e.message}`;
      })
      .join('\n');
  }

  /**
   * Copy log to clipboard
   */
  async copyToClipboard() {
    const text = this.exportLog();
    if (!text) {
      alert('No console output to copy');
      return;
    }

    try {
      await navigator.clipboard.writeText(text);

      const copyBtn = document.getElementById('console-copy-btn');
      if (copyBtn) {
        const originalText = copyBtn.textContent;
        copyBtn.textContent = 'Copied!';
        setTimeout(() => {
          copyBtn.textContent = originalText;
        }, 1500);
      }
    } catch (_error) {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
  }

  /**
   * Download log as text file
   */
  downloadLog() {
    const text = this.exportLog();
    if (!text) {
      alert('No console output to download');
      return;
    }

    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `openscad-console-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Get entry counts by type
   * @returns {Object} Counts by type
   */
  getCounts() {
    return { ...this.counts };
  }

  /**
   * Check if there are any warnings or errors
   * @returns {boolean}
   */
  hasIssues() {
    return this.counts.warning > 0 || this.counts.error > 0;
  }
}

let consolePanelInstance = null;

/**
 * Get or create the console panel singleton
 * @param {Object} options - Panel options
 * @returns {ConsolePanel}
 */
export function getConsolePanel(options = {}) {
  if (!consolePanelInstance) {
    consolePanelInstance = new ConsolePanel(options);
  }
  return consolePanelInstance;
}

/**
 * Reset the console panel singleton (for testing)
 */
export function resetConsolePanel() {
  if (consolePanelInstance) {
    consolePanelInstance.clear();
  }
  consolePanelInstance = null;
}
