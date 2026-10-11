/**
 * Console Panel - Unified OpenSCAD output display (desktop parity)
 *
 * Single panel with two views:
 *   - Log: chronological ECHO/WARNING/ERROR/DEPRECATED/TRACE messages
 *   - Structured: sortable error table (delegated to ErrorLogPanel)
 *
 * Programs use echo() to communicate with users; these messages must be visible.
 * @license GPL-3.0-or-later
 */

import { announceError, announceImmediate } from './announcer.js';
import { showErrorToast } from './error-translator.js';
import { escapeHtml } from './html-utils.js';

/**
 * How long the log stays quiet after it is rebuilt: long enough for a screen
 * reader to take the rebuilt rows as the page, not as new messages.
 */
export const LIVE_RESTORE_MS = 200;

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
  SEPARATOR: 'separator',
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
      // On, to match the desktop console, which shows the whole compile log and
      // offers no way to hide it. Off was unreachable rather than a choice: the
      // filter row has ECHO / Warnings / Errors / Deprecated / Trace and no INFO
      // checkbox, so nothing could ever switch it back on.
      info: true,
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

    // Append-only log (desktop parity): renders never clear the log; a
    // "── Render N ──" separator marks each new run instead. The separator
    // is lazy — it is only inserted when the new run actually produces
    // output, so silent renders do not fill the log with bare separators.
    this.renderSection = 1;
    this._pendingSeparator = false;

    // The log is a live region, so it only ever grows by the rows that are
    // new: rebuilding it made a screen reader read every message again as
    // one utterance. The entries shown as rows, in order; the last entry
    // render() has looked at; entries trimmed off the front since.
    this._rowEntries = [];
    this._lastConsidered = null;
    this._dropped = [];
    this._quietTimer = null;

    // Auto-expand etiquette: a panel the user closed stays closed for
    // WARNINGs; only ERRORs force it back open. _programmaticOpen keeps our
    // own open from being misread as a user action.
    this._userCollapsed = false;
    this._programmaticOpen = false;
    const consolePanel = document.getElementById('consolePanel');
    if (consolePanel && typeof consolePanel.addEventListener === 'function') {
      consolePanel.addEventListener('toggle', () => {
        if (this._programmaticOpen) return;
        this._userCollapsed = !consolePanel.open;
      });
    }

    // Follow the tail, the way the desktop console does: new output scrolls
    // the log to the newest line. It stops following the moment the user
    // scrolls up to read something, and starts again when they scroll back to
    // the bottom, so arriving output never yanks a reader away mid-line.
    this._followTail = true;

    if (this.container) {
      this.initFilters();
      this._initViewTabs();
      this._initTailFollowing();
    }
  }

  /** Distance from the bottom, in px, still counted as "at the bottom". */
  static get TAIL_THRESHOLD() {
    return 4;
  }

  /**
   * Wire the follow-the-tail behavior to the log container.
   * @private
   */
  _initTailFollowing() {
    this._noteGeometry();

    this.container.addEventListener('scroll', () => {
      // Only a reader moving inside a box that is the shape we last left it
      // means "stop following". Resizing the window fires a scroll event of
      // its own, with the log at a completely different offset because the box
      // is a different height and the lines have re-wrapped (in Classic, 1400
      // to 1024 wide: scrollTop 1002 to 1945, clientHeight 132 to 46,
      // scrollHeight 1134 to 2309). Reading that as a reader scrolling up would
      // turn following off for good.
      //
      // The comparison is against the shape at our last write, not at the last
      // scroll event, so growing the log with new output while a reader is
      // paused cannot make their next real scroll look like a resize.
      const { scrollHeight, clientHeight } = this.container;
      const resized =
        scrollHeight !== this._lastGeometry.scrollHeight ||
        clientHeight !== this._lastGeometry.clientHeight;
      this._noteGeometry();
      if (resized) return;

      // Our own scroll writes land at the bottom, so they re-assert following
      // rather than canceling it; no programmatic-scroll flag is needed.
      this._followTail = this.isScrolledToTail();
    });

    // Docking into Classic resizes the log from 400px to the height of its
    // pane, which parks a scrollTop that was the bottom in the middle of the
    // log. Re-pin on resize, but only while following.
    if (typeof ResizeObserver === 'function') {
      this._resizeObserver = new ResizeObserver(() => {
        if (this._followTail) this.scrollToTail();
      });
      this._resizeObserver.observe(this.container);
    }
  }

  /**
   * Is the log currently showing its newest line?
   * @returns {boolean}
   */
  isScrolledToTail() {
    if (!this.container) return true;
    const { scrollHeight, scrollTop, clientHeight } = this.container;
    return (
      scrollHeight - scrollTop - clientHeight <= ConsolePanel.TAIL_THRESHOLD
    );
  }

  /** Scroll the log to its newest line. */
  scrollToTail() {
    if (!this.container) return;
    this.container.scrollTop = this.container.scrollHeight;
    this._noteGeometry();
  }

  /**
   * Remember the log's shape as we are leaving it, so the scroll handler can
   * tell a resize apart from a reader.
   * @private
   */
  _noteGeometry() {
    if (!this.container) return;
    this._lastGeometry = {
      scrollHeight: this.container.scrollHeight,
      clientHeight: this.container.clientHeight,
    };
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
          this._rebuild();
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
    } else {
      // Everything else OpenSCAD prints is status, and status belongs in the
      // console, as on the desktop: cache sizes, "Normalized tree has 31
      // elements!", the render time. Dropping it would leave a clean render
      // reading "No console output yet".
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
    const parsed = [];
    let hasWarningOrError = false;
    let hasError = false;

    for (const line of lines) {
      const entry = this.parseLine(line);
      if (entry) {
        parsed.push(entry);
        if (
          entry.type === CONSOLE_ENTRY_TYPE.WARNING ||
          entry.type === CONSOLE_ENTRY_TYPE.ERROR
        ) {
          hasWarningOrError = true;
        }
        if (entry.type === CONSOLE_ENTRY_TYPE.ERROR) {
          hasError = true;
        }
      }
    }

    if (parsed.length === 0) return;

    if (this._pendingSeparator) {
      this._pendingSeparator = false;
      this.renderSection++;
      this.addEntry({
        type: CONSOLE_ENTRY_TYPE.SEPARATOR,
        message: `── Render ${this.renderSection} ──`,
        file: null,
        line: null,
        timestamp: Date.now(),
      });
    }

    for (const entry of parsed) {
      this.addEntry(entry);
    }

    this.render();

    if (hasWarningOrError) {
      this.autoExpandPanel({ force: hasError });
    }
  }

  /**
   * Mark the start of a new render run. The log stays append-only; if this
   * run produces output, a "── Render N ──" separator is inserted before it.
   */
  beginRenderSection() {
    this._pendingSeparator = this.entries.length > 0;
  }

  /**
   * Append an app-generated status line (e.g. "Detected change in X —
   * re-rendering"). Uses the separator entry type so it is always visible
   * regardless of message-type filters and clearly not engine output.
   * @param {string} message
   */
  addSystemLine(message) {
    if (!message) return;
    this.addEntry({
      type: CONSOLE_ENTRY_TYPE.SEPARATOR,
      message: `── ${message} ──`,
      file: null,
      line: null,
      timestamp: Date.now(),
    });
    this.render();
  }

  /**
   * Auto-expand the console <details> panel when important messages arrive.
   * Respects a user's manual collapse unless forced (errors always surface).
   * @param {Object} [options]
   * @param {boolean} [options.force] - Reopen even after a manual collapse
   */
  autoExpandPanel(options = {}) {
    if (this._userCollapsed && !options.force) return;
    const consolePanel = document.getElementById('consolePanel');
    if (consolePanel && !consolePanel.open) {
      this._programmaticOpen = true;
      consolePanel.open = true;
      this._programmaticOpen = false;
      if (options.force) this._userCollapsed = false;
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
      this._dropped.push(removed);
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
    const totalCount = this.entries.filter(
      (e) => e.type !== CONSOLE_ENTRY_TYPE.SEPARATOR
    ).length;

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
    // An error line ends the run, and the run's failure is announced with
    // that line (previewFailureSentence, the Generate error); said here too,
    // a failure was heard up to four times.
    if (
      entry.type !== CONSOLE_ENTRY_TYPE.ECHO &&
      entry.type !== CONSOLE_ENTRY_TYPE.WARNING
    ) {
      return;
    }

    // On screen, the log is a live region and says the line itself; a second
    // voice would say it twice. Decided as the line arrives: by the time a
    // deferred announcement runs, the panel may have opened for it.
    if (this._logOnScreen()) return;

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
    // OpenSCAD's own lines name their level ("WARNING: ..."); a label in
    // front of that said it twice.
    const message = entry.message.startsWith(`${entry.type.toUpperCase()}:`)
      ? entry.message
      : `${typeLabel}: ${entry.message}`;

    if (entry.type === CONSOLE_ENTRY_TYPE.ERROR) {
      announceError(message);
    } else {
      announceImmediate(message);
    }
  }

  /**
   * Is the log where a screen reader would hear it: the Log view, drawn?
   * @returns {boolean}
   * @private
   */
  _logOnScreen() {
    return (
      this.activeView === 'log' &&
      Boolean(this.container?.isConnected) &&
      this.container.checkVisibility?.() === true
    );
  }

  /**
   * Show the entries that arrived since the last call (Log view). Rows
   * already shown stay as they are.
   */
  render() {
    if (!this.container) return;

    // Rows for entries trimmed off the front of the log go with them.
    if (this._dropped.length > 0) {
      const dropped = new Set(this._dropped);
      this._dropped = [];
      while (this._rowEntries.length > 0 && dropped.has(this._rowEntries[0])) {
        this._rowEntries.shift();
        this.container.querySelector('.console-entry')?.remove();
      }
    }

    const from = this._lastConsidered
      ? this.entries.indexOf(this._lastConsidered) + 1
      : 0;
    if (this._lastConsidered && from === 0) {
      // More arrived at once than the log keeps: nothing left to append to.
      this._rebuild();
      return;
    }
    const fresh = this.entries
      .slice(from)
      .filter(
        (e) => e.type === CONSOLE_ENTRY_TYPE.SEPARATOR || this.filters[e.type]
      );
    this._lastConsidered = this.entries[this.entries.length - 1] || null;

    if (fresh.length === 0) {
      if (
        this._rowEntries.length === 0 &&
        !this.container.querySelector('.console-empty')
      ) {
        this.container.innerHTML = `
        <div class="console-empty">
          No console output yet. ECHO, WARNING, and ERROR messages will appear here.
        </div>
      `;
        this._noteGeometry();
      }
      return;
    }

    // A reader who has scrolled up keeps their place; rows only append.
    const previousScrollTop = this.container.scrollTop;
    const wasFollowing = this._followTail;

    if (this._rowEntries.length === 0) this.container.replaceChildren();
    this.container.insertAdjacentHTML(
      'beforeend',
      fresh.map((entry) => this.renderEntry(entry)).join('')
    );
    this._rowEntries.push(...fresh);

    if (wasFollowing) {
      this.scrollToTail();
    } else {
      this.container.scrollTop = previousScrollTop;
      this._noteGeometry();
    }
  }

  /**
   * Rebuild the whole log (a filter changed, or the log was cleared). The
   * region is quiet while it is rebuilt: the rows are not new messages.
   * @private
   */
  _rebuild() {
    if (!this.container) return;
    this._quietFor(LIVE_RESTORE_MS);
    const previousScrollTop = this.container.scrollTop;
    this._rowEntries = [];
    this._lastConsidered = null;
    this._dropped = [];
    this.container.replaceChildren();
    this.render();
    if (!this._followTail) {
      this.container.scrollTop = previousScrollTop;
      this._noteGeometry();
    }
  }

  /**
   * Turn the log's live region off for a while, then back to what it was.
   * @param {number} ms
   * @private
   */
  _quietFor(ms) {
    if (this._quietTimer) {
      clearTimeout(this._quietTimer);
    } else {
      this._liveValue = this.container.getAttribute('aria-live');
    }
    if (this._liveValue === null) return;
    this.container.setAttribute('aria-live', 'off');
    this._quietTimer = setTimeout(() => {
      this._quietTimer = null;
      this.container.setAttribute('aria-live', this._liveValue);
    }, ms);
  }

  /**
   * Render a single entry to HTML
   * @param {Object} entry - Console entry
   * @returns {string} HTML string
   */
  renderEntry(entry) {
    if (entry.type === CONSOLE_ENTRY_TYPE.SEPARATOR) {
      return `
      <div class="console-entry console-entry--separator" role="separator">
        <span class="console-message">${escapeHtml(entry.message)}</span>
      </div>
    `;
    }

    const time = new Date(entry.timestamp);
    const timeStr = time.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const typeClass = `console-entry--${entry.type}`;
    const typeLabel = entry.type.toUpperCase();

    const safeMessage = escapeHtml(entry.message);

    // No role for any line: role="listitem" would need a list parent, and
    // #console-output is role="log", which already says "messages, newest
    // last". A warning or error row once carried role="alert", and each was
    // spoken as an alert on top of the log's own reading.

    const hasLocation = entry.line !== null && this.onNavigate;
    const lineLink = hasLocation
      ? ` <button type="button" class="console-line-link" data-file="${escapeHtml(entry.file || '')}" data-line="${entry.line}" aria-label="Go to line ${entry.line}">:${entry.line}</button>`
      : '';

    // OpenSCAD's own lines start with their level ("WARNING: ..."), which the
    // label beside them already shows. The words stay for a screen reader,
    // which does not hear the label; on screen the level shows once.
    const prefix = `${typeLabel}:`;
    const messageHtml = entry.message.startsWith(prefix)
      ? `<span class="sr-only">${prefix} </span>${escapeHtml(
          entry.message.slice(prefix.length).trimStart()
        )}`
      : safeMessage;

    return `
      <div class="console-entry ${typeClass}">
        <time class="console-timestamp" datetime="${time.toISOString()}">${timeStr}</time>
        <span class="console-type" aria-hidden="true">${typeLabel}</span>
        <span class="console-message">${messageHtml}${lineLink}</span>
      </div>
    `;
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
    this.renderSection = 1;
    this._pendingSeparator = false;
    this._followTail = true;
    this.updateBadge();
    this._rebuild();
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
        if (e.type === CONSOLE_ENTRY_TYPE.SEPARATOR) {
          return e.message;
        }
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
      showErrorToast({
        title: 'Nothing to Copy',
        message: 'No console output to copy.',
      });
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
      showErrorToast({
        title: 'Nothing to Download',
        message: 'No console output to download.',
      });
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
