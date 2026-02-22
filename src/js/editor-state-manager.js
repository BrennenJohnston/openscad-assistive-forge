/**
 * Editor State Manager - Handles state synchronization between Standard and Expert modes
 *
 * Manages bidirectional sync of:
 * - SCAD source code
 * - Parameter values
 * - Cursor/scroll position
 * - Selection state
 * - Dirty (unsaved) flag
 *
 * @license GPL-3.0-or-later
 */

/**
 * @typedef {Object} CursorPosition
 * @property {number} line - Line number (1-based)
 * @property {number} column - Column number (1-based)
 */

/**
 * @typedef {Object} Selection
 * @property {CursorPosition} start - Selection start
 * @property {CursorPosition} end - Selection end
 */

/**
 * @typedef {Object} EditorSnapshot
 * @property {string} source - Source code content
 * @property {CursorPosition} cursor - Cursor position
 * @property {Selection|null} selection - Current selection
 * @property {number} scrollLine - First visible line
 * @property {boolean} isDirty - Has unsaved changes
 * @property {Array<Object>} errors - Parse/syntax errors
 */

/**
 * EditorStateManager - Coordinates state between Standard Mode (Customizer) and Expert Mode (Code Editor)
 *
 * Design principles:
 * - Single source of truth for SCAD code
 * - Mode-specific state (cursor, scroll) preserved separately
 * - Changes in one mode sync to the other
 * - Focus management on mode switch
 */
export class EditorStateManager {
  constructor() {
    /** @type {string} */
    this.source = '';

    /** @type {Object} */
    this.parameters = {};

    /** @type {CursorPosition} */
    this.cursor = { line: 1, column: 1 };

    /** @type {Selection|null} */
    this.selection = null;

    /** @type {number} */
    this.scrollLine = 1;

    /** @type {boolean} */
    this.isDirty = false;

    /** @type {Array<Object>} */
    this.errors = [];

    /** @type {Object|null} - Reference to Monaco editor instance */
    this.monacoInstance = null;

    /** @type {HTMLTextAreaElement|null} - Reference to textarea element */
    this.textareaElement = null;

    /** @type {Object} - Mode-specific saved state */
    this._modeSnapshots = {
      standard: null,
      expert: null,
    };

    /** @type {Set<Function>} */
    this.subscribers = new Set();

    /** @type {Function|null} - Callback for announcing to screen readers */
    this.announceCallback = null;
  }

  /**
   * Set Monaco editor reference
   * @param {Object} monaco - Monaco editor instance
   */
  setMonacoInstance(monaco) {
    this.monacoInstance = monaco;
  }

  /**
   * Set textarea element reference
   * @param {HTMLTextAreaElement} textarea
   */
  setTextareaElement(textarea) {
    this.textareaElement = textarea;
  }

  /**
   * Set screen reader announcement callback
   * @param {Function} callback
   */
  setAnnounceCallback(callback) {
    this.announceCallback = callback;
  }

  /**
   * Subscribe to state changes
   * @param {Function} callback - Called with (newState, changeType)
   * @returns {Function} Unsubscribe function
   */
  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  /**
   * Get current source code
   * @returns {string}
   */
  getSource() {
    return this.source;
  }

  /**
   * Set source code
   * @param {string} code
   * @param {Object} options
   * @param {boolean} options.markDirty - Mark as having unsaved changes
   * @param {string} options.origin - Where the change originated ('standard' | 'expert' | 'external')
   */
  setSource(code, options = {}) {
    const { markDirty = true, origin = 'external' } = options;

    const previousSource = this.source;
    this.source = code;

    if (markDirty && code !== previousSource) {
      this.isDirty = true;
    }

    this._notifySubscribers({ type: 'source', origin, previousSource });
  }

  /**
   * Get current parameter values
   * @returns {Object}
   */
  getParameters() {
    return { ...this.parameters };
  }

  /**
   * Set parameter values
   * @param {Object} params
   */
  setParameters(params) {
    this.parameters = { ...params };
    this._notifySubscribers({ type: 'parameters' });
  }

  /**
   * Update a single parameter value
   * @param {string} name
   * @param {*} value
   */
  updateParameter(name, value) {
    this.parameters[name] = value;
    this._notifySubscribers({ type: 'parameter', name, value });
  }

  /**
   * Get dirty state
   * @returns {boolean}
   */
  getIsDirty() {
    return this.isDirty;
  }

  /**
   * Mark as clean (saved)
   */
  markClean() {
    this.isDirty = false;
    this._notifySubscribers({ type: 'dirty', isDirty: false });
  }

  /**
   * Mark as dirty (unsaved)
   */
  markDirty() {
    this.isDirty = true;
    this._notifySubscribers({ type: 'dirty', isDirty: true });
  }

  /**
   * Get parse/syntax errors
   * @returns {Array<Object>}
   */
  getErrors() {
    return [...this.errors];
  }

  /**
   * Set errors
   * @param {Array<Object>} errors
   */
  setErrors(errors) {
    this.errors = [...errors];
    this._notifySubscribers({ type: 'errors' });
  }

  /**
   * Capture current state from the active editor
   * Called before mode switch
   * @param {'standard' | 'expert'} fromMode
   */
  captureState(fromMode) {
    console.log(`[EditorStateManager] Capturing state from ${fromMode} mode`);

    if (fromMode === 'expert') {
      this._captureFromExpertMode();
    }
    // Standard mode state is captured via parameters

    // Save mode-specific snapshot
    this._modeSnapshots[fromMode] = this._createSnapshot();
  }

  /**
   * Restore state to the target editor
   * Called after mode switch
   * @param {'standard' | 'expert'} toMode
   */
  restoreState(toMode) {
    console.log(`[EditorStateManager] Restoring state to ${toMode} mode`);

    if (toMode === 'expert') {
      this._restoreToExpertMode();
    } else {
      this._restoreToStandardMode();
    }

    // Announce restoration
    this._announce(
      `Editor content restored. Cursor at line ${this.cursor.line}.`
    );
  }

  /**
   * Capture state from Expert Mode editor
   * @private
   */
  _captureFromExpertMode() {
    if (this.monacoInstance) {
      this._captureFromMonaco();
    } else if (this.textareaElement) {
      this._captureFromTextarea();
    }
  }

  /**
   * Capture state from Monaco editor
   * @private
   */
  _captureFromMonaco() {
    const editor = this.monacoInstance;
    if (!editor) return;

    this.source = editor.getValue();

    const position = editor.getPosition();
    if (position) {
      this.cursor = {
        line: position.lineNumber,
        column: position.column,
      };
    }

    const selection = editor.getSelection();
    if (selection && !selection.isEmpty()) {
      this.selection = {
        start: {
          line: selection.startLineNumber,
          column: selection.startColumn,
        },
        end: {
          line: selection.endLineNumber,
          column: selection.endColumn,
        },
      };
    } else {
      this.selection = null;
    }

    const visibleRanges = editor.getVisibleRanges();
    if (visibleRanges && visibleRanges.length > 0) {
      this.scrollLine = visibleRanges[0].startLineNumber;
    }
  }

  /**
   * Capture state from textarea
   * @private
   */
  _captureFromTextarea() {
    const textarea = this.textareaElement;
    if (!textarea) return;

    this.source = textarea.value;
    this.cursor = this._offsetToPosition(textarea.selectionStart);

    if (textarea.selectionStart !== textarea.selectionEnd) {
      this.selection = {
        start: this._offsetToPosition(textarea.selectionStart),
        end: this._offsetToPosition(textarea.selectionEnd),
      };
    } else {
      this.selection = null;
    }

    this.scrollLine = this._calculateScrollLine(textarea);
  }

  /**
   * Restore state to Expert Mode editor
   * @private
   */
  _restoreToExpertMode() {
    if (this.monacoInstance) {
      this._restoreToMonaco();
    } else if (this.textareaElement) {
      this._restoreToTextarea();
    }
  }

  /**
   * Restore state to Monaco editor
   * @private
   */
  _restoreToMonaco() {
    const editor = this.monacoInstance;
    if (!editor) return;

    // Set content
    editor.setValue(this.source);

    // Restore cursor
    editor.setPosition({
      lineNumber: this.cursor.line,
      column: this.cursor.column,
    });

    // Restore selection if any
    if (this.selection) {
      editor.setSelection({
        startLineNumber: this.selection.start.line,
        startColumn: this.selection.start.column,
        endLineNumber: this.selection.end.line,
        endColumn: this.selection.end.column,
      });
    }

    // Restore scroll position
    editor.revealLineInCenter(this.scrollLine);

    // Focus editor
    editor.focus();
  }

  /**
   * Restore state to textarea
   * @private
   */
  _restoreToTextarea() {
    const textarea = this.textareaElement;
    if (!textarea) return;

    // Set content
    textarea.value = this.source;

    // Restore cursor/selection
    const offset = this._positionToOffset(this.cursor);
    if (this.selection) {
      const startOffset = this._positionToOffset(this.selection.start);
      const endOffset = this._positionToOffset(this.selection.end);
      textarea.setSelectionRange(startOffset, endOffset);
    } else {
      textarea.setSelectionRange(offset, offset);
    }

    // Restore scroll position
    this._scrollToLine(textarea, this.scrollLine);

    // Focus textarea
    textarea.focus();
  }

  /**
   * Restore state to Standard Mode
   * This syncs parameters from code if needed
   * @private
   */
  _restoreToStandardMode() {
    // Focus first parameter input
    const firstInput = document.querySelector(
      '.param-control input, .param-control select'
    );
    if (firstInput) {
      firstInput.focus();
    }
  }

  /**
   * Convert character offset to line/column position
   * @param {number} offset
   * @returns {CursorPosition}
   * @private
   */
  _offsetToPosition(offset) {
    const lines = this.source.substring(0, offset).split('\n');
    return {
      line: lines.length,
      column: lines[lines.length - 1].length + 1,
    };
  }

  /**
   * Convert line/column position to character offset
   * @param {CursorPosition} position
   * @returns {number}
   * @private
   */
  _positionToOffset(position) {
    const lines = this.source.split('\n');
    let offset = 0;

    for (let i = 0; i < position.line - 1 && i < lines.length; i++) {
      offset += lines[i].length + 1; // +1 for newline
    }

    offset += Math.min(
      position.column - 1,
      lines[position.line - 1]?.length || 0
    );
    return offset;
  }

  /**
   * Calculate first visible line from textarea scroll
   * @param {HTMLTextAreaElement} textarea
   * @returns {number}
   * @private
   */
  _calculateScrollLine(textarea) {
    const lineHeight =
      parseInt(window.getComputedStyle(textarea).lineHeight, 10) || 20;
    return Math.floor(textarea.scrollTop / lineHeight) + 1;
  }

  /**
   * Scroll textarea to a specific line
   * @param {HTMLTextAreaElement} textarea
   * @param {number} line
   * @private
   */
  _scrollToLine(textarea, line) {
    const lineHeight =
      parseInt(window.getComputedStyle(textarea).lineHeight, 10) || 20;
    textarea.scrollTop = (line - 1) * lineHeight;
  }

  /**
   * Create a snapshot of current state
   * @returns {EditorSnapshot}
   * @private
   */
  _createSnapshot() {
    return {
      source: this.source,
      cursor: { ...this.cursor },
      selection: this.selection ? { ...this.selection } : null,
      scrollLine: this.scrollLine,
      isDirty: this.isDirty,
      errors: [...this.errors],
    };
  }

  /**
   * Notify subscribers of state change
   * @param {Object} change
   * @private
   */
  _notifySubscribers(change) {
    this.subscribers.forEach((callback) => {
      try {
        callback(this._createSnapshot(), change);
      } catch (error) {
        console.error('[EditorStateManager] Subscriber error:', error);
      }
    });
  }

  /**
   * Announce to screen reader
   * @param {string} message
   * @private
   */
  _announce(message) {
    if (this.announceCallback) {
      this.announceCallback(message);
    }
  }

  /**
   * Inject parameter value into SCAD code
   * Finds the parameter assignment and updates the value
   * @param {string} paramName
   * @param {*} newValue
   * @returns {boolean} True if injection was successful
   */
  injectParameterValue(paramName, newValue) {
    // Pattern to find: paramName = oldValue; with optional comment
    const pattern = new RegExp(
      `^(\\s*)(${this._escapeRegex(paramName)})\\s*=\\s*([^;]+)(;.*)$`,
      'm'
    );

    const formattedValue = this._formatValue(newValue);
    const match = this.source.match(pattern);

    if (match) {
      const newSource = this.source.replace(
        pattern,
        `$1$2 = ${formattedValue}$4`
      );
      this.setSource(newSource, { origin: 'standard' });
      return true;
    }

    console.warn(`[EditorStateManager] Could not find parameter: ${paramName}`);
    return false;
  }

  /**
   * Format a value for SCAD code
   * @param {*} value
   * @returns {string}
   * @private
   */
  _formatValue(value) {
    if (typeof value === 'string') {
      // Check if it's a "yes"/"no" boolean string
      if (value === 'yes' || value === 'no') {
        return value === 'yes' ? 'true' : 'false';
      }
      // String value - quote it
      return `"${value.replace(/"/g, '\\"')}"`;
    }

    if (Array.isArray(value)) {
      // Vector value
      return `[${value.map((v) => this._formatValue(v)).join(', ')}]`;
    }

    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }

    // Number or other
    return String(value);
  }

  /**
   * Escape string for regex
   * @param {string} str
   * @returns {string}
   * @private
   */
  _escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Compare parameters to detect structural changes
   * @param {Object} oldParams
   * @param {Object} newParams
   * @returns {Object} { added: string[], removed: string[], changed: string[], structuralChange: boolean }
   */
  compareParameters(oldParams, newParams) {
    const oldKeys = Object.keys(oldParams);
    const newKeys = Object.keys(newParams);

    const added = newKeys.filter((k) => !oldKeys.includes(k));
    const removed = oldKeys.filter((k) => !newKeys.includes(k));
    const changed = newKeys.filter(
      (k) => oldKeys.includes(k) && oldParams[k] !== newParams[k]
    );

    return {
      added,
      removed,
      changed,
      structuralChange: added.length > 0 || removed.length > 0,
    };
  }

  /**
   * Reset to initial state
   */
  reset() {
    this.source = '';
    this.parameters = {};
    this.cursor = { line: 1, column: 1 };
    this.selection = null;
    this.scrollLine = 1;
    this.isDirty = false;
    this.errors = [];
    this._modeSnapshots = { standard: null, expert: null };
  }
}

// Export singleton instance for convenience
let instance = null;

/**
 * Get or create EditorStateManager singleton
 * @returns {EditorStateManager}
 */
export function getEditorStateManager() {
  if (!instance) {
    instance = new EditorStateManager();
  }
  return instance;
}

/**
 * Reset EditorStateManager instance (for testing)
 */
export function resetEditorStateManager() {
  instance = null;
}
