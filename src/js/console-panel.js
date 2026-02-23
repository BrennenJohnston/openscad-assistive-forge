/**
 * Console Panel - Display OpenSCAD echo/warning/error messages
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
};

/**
 * ConsolePanel manages the OpenSCAD console output UI
 * Implements:
 * - ECHO, WARNING, ERROR message parsing
 * - Filtering by message type
 * - Copy/download functionality
 * - Rate-limited screen reader announcements
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
    };

    // Rate limiting for screen reader announcements
    this.lastAnnouncement = 0;
    this.announcementDebounce = options.announcementDebounce || 500;
    this.pendingAnnouncement = null;

    // Counters for badge
    this.counts = {
      echo: 0,
      warning: 0,
      error: 0,
      info: 0,
    };

    // Initialize if container exists
    if (this.container) {
      this.initFilters();
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
    };

    for (const [type, id] of Object.entries(filterIds)) {
      const checkbox = document.getElementById(id);
      if (checkbox) {
        checkbox.checked = this.filters[type];
        checkbox.addEventListener('change', (e) => {
          this.filters[type] = e.target.checked;
          this.render();
        });
      }
    }

    // Copy button
    const copyBtn = document.getElementById('console-copy-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => this.copyToClipboard());
    }

    // Download button
    const downloadBtn = document.getElementById('console-download-btn');
    if (downloadBtn) {
      downloadBtn.addEventListener('click', () => this.downloadLog());
    }

    // Clear button
    const clearBtn = document.getElementById('console-clear-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => this.clear());
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

    // ECHO: messages (primary user-facing communication channel)
    if (trimmed.startsWith('ECHO:')) {
      return {
        type: CONSOLE_ENTRY_TYPE.ECHO,
        message: trimmed.substring(5).trim(),
        raw: trimmed,
        timestamp: Date.now(),
      };
    }

    // WARNING: messages
    if (trimmed.includes('WARNING:') || trimmed.includes('Warning:')) {
      return {
        type: CONSOLE_ENTRY_TYPE.WARNING,
        message: trimmed,
        raw: trimmed,
        timestamp: Date.now(),
      };
    }

    // ERROR: messages
    if (trimmed.includes('ERROR:') || trimmed.includes('Error:')) {
      return {
        type: CONSOLE_ENTRY_TYPE.ERROR,
        message: trimmed,
        raw: trimmed,
        timestamp: Date.now(),
      };
    }

    // Compile/render time info (useful context)
    if (trimmed.includes('Compiling') || trimmed.includes('Rendering')) {
      return {
        type: CONSOLE_ENTRY_TYPE.INFO,
        message: trimmed,
        raw: trimmed,
        timestamp: Date.now(),
      };
    }

    // Filter out internal noise by default
    return null;
  }

  /**
   * Add raw console output (may contain multiple lines)
   * @param {string} output - Raw console output
   */
  addOutput(output) {
    if (!output) return;

    const lines = output.split('\n');
    let hasNewEntries = false;
    let hasEchoOrImportant = false;

    for (const line of lines) {
      const entry = this.parseLine(line);
      if (entry) {
        this.addEntry(entry);
        hasNewEntries = true;
        // Track ECHO, WARNING, and ERROR messages for auto-expand
        if (
          entry.type === CONSOLE_ENTRY_TYPE.ECHO ||
          entry.type === CONSOLE_ENTRY_TYPE.WARNING ||
          entry.type === CONSOLE_ENTRY_TYPE.ERROR
        ) {
          hasEchoOrImportant = true;
        }
      }
    }

    if (hasNewEntries) {
      this.render();
    }

    // Auto-expand console when ECHO/WARNING/ERROR messages arrive
    // SCAD authors use echo() to communicate with end-users -- these must be visible
    if (hasEchoOrImportant) {
      this.autoExpandPanel();
    }
  }

  /**
   * Auto-expand the console <details> panel when important messages arrive
   * Sets the open attribute so the console becomes visible without user action
   */
  autoExpandPanel() {
    const consolePanel = document.getElementById('consolePanel');
    if (consolePanel && !consolePanel.open) {
      consolePanel.open = true;
      console.log(
        '[ConsolePanel] Auto-expanded: ECHO/WARNING/ERROR message detected'
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
    this.counts[entry.type]++;

    // Enforce max entries limit
    if (this.entries.length > this.maxEntries) {
      const removed = this.entries.shift();
      this.counts[removed.type]--;
    }

    // Update badge
    this.updateBadge();

    // Announce important messages to screen readers
    this.announceIfImportant(entry);
  }

  /**
   * Update the unread badge count
   */
  updateBadge() {
    if (!this.badge) return;

    const warningErrorCount = this.counts.warning + this.counts.error;
    // Include ECHO messages in badge count (user communication channel)
    const importantCount = warningErrorCount + this.counts.echo;
    const totalCount = this.entries.length;

    if (warningErrorCount > 0) {
      // Warnings/errors get special styling
      this.badge.textContent = importantCount;
      this.badge.classList.add('has-warnings');
      this.badge.classList.remove('hidden');
    } else if (importantCount > 0) {
      // ECHO-only messages still show badge (but without warning styling)
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
    // Announce ECHO, warnings, and errors to screen readers
    // SCAD authors use echo() to communicate important info to users
    if (
      entry.type !== CONSOLE_ENTRY_TYPE.ECHO &&
      entry.type !== CONSOLE_ENTRY_TYPE.WARNING &&
      entry.type !== CONSOLE_ENTRY_TYPE.ERROR
    ) {
      return;
    }

    const now = Date.now();
    if (now - this.lastAnnouncement < this.announcementDebounce) {
      // Debounce - queue this announcement
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
   * Actually perform the screen reader announcement.
   * Uses shared announcer.js utility with assertive region for errors/warnings.
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
      typeLabel = 'Message'; // ECHO messages
    }
    const message = `${typeLabel}: ${entry.message}`;

    // Errors use assertive region for immediate attention
    if (entry.type === CONSOLE_ENTRY_TYPE.ERROR) {
      announceError(message);
    } else {
      // Warnings and ECHO use polite announcement
      announceImmediate(message);
    }
  }

  /**
   * Render all entries to the container
   */
  render() {
    if (!this.container) return;

    // Filter entries based on current filter settings
    const visibleEntries = this.entries.filter((e) => this.filters[e.type]);

    if (visibleEntries.length === 0) {
      this.container.innerHTML = `
        <div class="console-empty">
          No console output yet. ECHO, WARNING, and ERROR messages will appear here.
        </div>
      `;
      return;
    }

    // Build HTML for visible entries
    const entriesHtml = visibleEntries
      .map((entry) => this.renderEntry(entry))
      .join('');

    this.container.innerHTML = entriesHtml;

    // Auto-scroll to bottom
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

    // Escape message for safe HTML rendering
    const safeMessage = this.escapeHtml(entry.message);

    // WARNING and ERROR entries get role="alert" for screen reader announcement (WCAG 4.1.3)
    const entryRole =
      entry.type === 'warning' || entry.type === 'error' ? 'alert' : 'listitem';

    return `
      <div class="console-entry ${typeClass}" role="${entryRole}">
        <time class="console-timestamp" datetime="${time.toISOString()}">${timeStr}</time>
        <span class="console-type" aria-hidden="true">${typeLabel}</span>
        <span class="console-message">${safeMessage}</span>
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
   * Clear all entries
   */
  clear() {
    this.entries = [];
    this.counts = { echo: 0, warning: 0, error: 0, info: 0 };
    this.updateBadge();
    this.render();
  }

  /**
   * Export log as plain text
   * @returns {string} Log text
   */
  exportLog() {
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

      // Visual feedback
      const copyBtn = document.getElementById('console-copy-btn');
      if (copyBtn) {
        const originalText = copyBtn.textContent;
        copyBtn.textContent = 'Copied!';
        setTimeout(() => {
          copyBtn.textContent = originalText;
        }, 1500);
      }
    } catch (_error) {
      // Fallback for older browsers
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

// Singleton instance for app-wide use
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
