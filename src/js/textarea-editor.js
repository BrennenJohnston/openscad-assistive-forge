/**
 * Textarea Editor - Accessible code editor fallback
 *
 * This is the "accessibility-first" editor, not a degraded fallback.
 * Provides full feature parity for core operations with guaranteed AT compatibility.
 *
 * Features:
 * - Syntax highlighting via CSS overlays
 * - Line numbers with synchronized scrolling
 * - Error line highlighting
 * - Keyboard shortcuts (Ctrl+S, Ctrl+Enter, etc.)
 * - Full ARIA support for screen readers
 *
 * @license GPL-3.0-or-later
 */

const SCAD_TOKENS = {
  keywords: [
    'module',
    'function',
    'if',
    'else',
    'for',
    'let',
    'each',
    'intersection_for',
    'assert',
    'echo',
    'include',
    'use',
  ],
  builtins: [
    'cube',
    'sphere',
    'cylinder',
    'polyhedron',
    'circle',
    'square',
    'polygon',
    'text',
    'linear_extrude',
    'rotate_extrude',
    'surface',
    'import',
    'union',
    'difference',
    'intersection',
    'hull',
    'minkowski',
    'translate',
    'rotate',
    'scale',
    'mirror',
    'multmatrix',
    'color',
    'offset',
    'resize',
    'projection',
    'render',
    'children',
  ],
  functions: [
    'abs',
    'sign',
    'sin',
    'cos',
    'tan',
    'acos',
    'asin',
    'atan',
    'atan2',
    'floor',
    'round',
    'ceil',
    'ln',
    'log',
    'pow',
    'sqrt',
    'exp',
    'rands',
    'min',
    'max',
    'concat',
    'lookup',
    'str',
    'chr',
    'ord',
    'search',
    'version',
    'version_num',
    'len',
    'norm',
    'cross',
    'is_undef',
    'is_bool',
    'is_num',
    'is_string',
    'is_list',
    'is_function',
  ],
  specials: [
    '$fn',
    '$fa',
    '$fs',
    '$t',
    '$vpr',
    '$vpt',
    '$vpd',
    '$vpf',
    '$children',
  ],
  constants: ['true', 'false', 'undef', 'PI'],
};

/**
 * TextareaEditor - Accessible code editor implementation
 */
export class TextareaEditor {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.container - Container element to render into
   * @param {Function} options.onChange - Callback when content changes
   * @param {Function} options.onSave - Callback for Ctrl+S
   * @param {Function} options.onRun - Callback for Ctrl+Enter (run preview)
   * @param {Function} options.announce - Screen reader announcement function
   */
  constructor(options = {}) {
    /** @type {HTMLElement} */
    this.container = options.container;

    /** @type {Function} */
    this.onChange = options.onChange || (() => {});

    /** @type {Function} */
    this.onSave = options.onSave || (() => {});

    /** @type {Function} */
    this.onRun = options.onRun || (() => {});

    /** @type {Function} */
    this.announce = options.announce || (() => {});

    /** @type {HTMLTextAreaElement|null} */
    this.textarea = null;

    /** @type {HTMLElement|null} */
    this.lineNumbers = null;

    /** @type {HTMLElement|null} */
    this.highlightOverlay = null;

    /** @type {string} */
    this._value = '';

    /** @type {number} */
    this._debounceTimeout = null;

    /** @type {number} */
    this._highlightTimeout = null;

    /** @type {Set<number>} */
    this._errorLines = new Set();

    /** @type {boolean} */
    this._isInitialized = false;
  }

  /**
   * Initialize the editor in the container
   */
  initialize() {
    if (this._isInitialized) return;

    this._createDOM();
    this._attachEventListeners();
    this._isInitialized = true;

    console.log('[TextareaEditor] Initialized');
  }

  /**
   * Create the editor DOM structure
   * @private
   */
  _createDOM() {
    this.container.innerHTML = '';
    this.container.className = 'textarea-editor';

    const wrapper = document.createElement('div');
    wrapper.className = 'textarea-editor-wrapper';

    this.lineNumbers = document.createElement('div');
    this.lineNumbers.className = 'textarea-line-numbers';
    this.lineNumbers.setAttribute('aria-hidden', 'true');
    wrapper.appendChild(this.lineNumbers);

    const editorArea = document.createElement('div');
    editorArea.className = 'textarea-editor-area';

    this.highlightOverlay = document.createElement('pre');
    this.highlightOverlay.className = 'textarea-highlight-overlay';
    this.highlightOverlay.setAttribute('aria-hidden', 'true');
    editorArea.appendChild(this.highlightOverlay);

    this.textarea = document.createElement('textarea');
    this.textarea.className = 'textarea-editor-input';
    this.textarea.id = 'expert-mode-textarea';
    this.textarea.setAttribute('spellcheck', 'false');
    this.textarea.setAttribute('autocapitalize', 'off');
    this.textarea.setAttribute('autocomplete', 'off');
    this.textarea.setAttribute('autocorrect', 'off');
    this.textarea.setAttribute('aria-label', 'OpenSCAD code editor');
    this.textarea.setAttribute(
      'aria-describedby',
      'textarea-editor-instructions'
    );
    this.textarea.placeholder =
      '// Enter OpenSCAD code here\n// Use Ctrl+Enter to preview';
    editorArea.appendChild(this.textarea);

    wrapper.appendChild(editorArea);
    this.container.appendChild(wrapper);

    const instructions = document.createElement('div');
    instructions.id = 'textarea-editor-instructions';
    instructions.className = 'visually-hidden';
    instructions.textContent =
      'OpenSCAD code editor. Press Ctrl+Enter to preview. Press Ctrl+S to save. Press Escape then Tab to exit editor.';
    this.container.appendChild(instructions);

    const statusBar = document.createElement('div');
    statusBar.className = 'textarea-editor-status';
    statusBar.id = 'textarea-editor-status';

    const lineInfo = document.createElement('span');
    lineInfo.className = 'status-line-info';
    lineInfo.id = 'textarea-status-line';
    lineInfo.textContent = 'Line 1, Column 1';
    statusBar.appendChild(lineInfo);

    const charCount = document.createElement('span');
    charCount.className = 'status-char-count';
    charCount.id = 'textarea-status-chars';
    charCount.textContent = '0 characters';
    statusBar.appendChild(charCount);

    this.container.appendChild(statusBar);
    this._updateLineNumbers();
  }

  /**
   * Attach event listeners
   * @private
   */
  _attachEventListeners() {
    this.textarea.addEventListener('input', (e) => {
      this._value = e.target.value;
      this._scheduleHighlightUpdate();
      this._scheduleOnChange();
      this._updateLineNumbers();
      this._updateStatusBar();
    });

    this.textarea.addEventListener('scroll', () => {
      this._syncScroll();
    });

    this.textarea.addEventListener('keydown', (e) => {
      this._handleKeyDown(e);
    });

    this.textarea.addEventListener('select', () => {
      this._updateStatusBar();
    });

    this.textarea.addEventListener('click', () => {
      this._updateStatusBar();
    });

    this.textarea.addEventListener('keyup', (e) => {
      if (e.key.startsWith('Arrow')) {
        this._updateStatusBar();
      }
    });

    this.textarea.addEventListener('focus', () => {
      this.container.classList.add('focused');
    });

    this.textarea.addEventListener('blur', () => {
      this.container.classList.remove('focused');
    });
  }

  /**
   * Handle keyboard shortcuts
   * @param {KeyboardEvent} e
   * @private
   */
  _handleKeyDown(e) {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const modKey = isMac ? e.metaKey : e.ctrlKey;

    if (modKey && e.key === 's') {
      e.preventDefault();
      this.onSave();
      this.announce('Saved');
      return;
    }

    if (modKey && e.key === 'Enter') {
      e.preventDefault();
      this.onRun();
      this.announce('Generating preview');
      return;
    }

    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      this._insertAtCursor('  ');
      return;
    }

    if (e.key === 'Enter' && !modKey) {
      e.preventDefault();
      this._handleEnterKey();
      return;
    }

    if (modKey && e.key === '/') {
      e.preventDefault();
      this._toggleComment();
      return;
    }

    if (e.key === 'Escape') {
      this.announce('Press Tab to move to next element, or continue editing.');
    }
  }

  /**
   * Insert text at cursor position
   * @param {string} text
   * @private
   */
  _insertAtCursor(text) {
    const start = this.textarea.selectionStart;
    const end = this.textarea.selectionEnd;
    const value = this.textarea.value;

    this.textarea.value =
      value.substring(0, start) + text + value.substring(end);
    this.textarea.selectionStart = this.textarea.selectionEnd =
      start + text.length;

    this._value = this.textarea.value;
    this._scheduleHighlightUpdate();
    this._scheduleOnChange();
    this._updateLineNumbers();
  }

  /**
   * Handle Enter key with auto-indent
   * @private
   */
  _handleEnterKey() {
    const start = this.textarea.selectionStart;
    const value = this.textarea.value;

    // Find the current line
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const currentLine = value.substring(lineStart, start);

    // Get leading whitespace
    const leadingWhitespace = currentLine.match(/^(\s*)/)[1];

    // Check if we should increase indent (line ends with { or [)
    let indent = leadingWhitespace;
    const trimmedLine = currentLine.trimEnd();
    if (trimmedLine.endsWith('{') || trimmedLine.endsWith('[')) {
      indent += '  ';
    }

    this._insertAtCursor('\n' + indent);
  }

  /**
   * Toggle comment on current line
   * @private
   */
  _toggleComment() {
    const start = this.textarea.selectionStart;
    const value = this.textarea.value;

    // Find line boundaries
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    let lineEnd = value.indexOf('\n', start);
    if (lineEnd === -1) lineEnd = value.length;

    const line = value.substring(lineStart, lineEnd);
    const trimmedLine = line.trimStart();
    const leadingSpaces = line.length - trimmedLine.length;

    let newLine;
    if (trimmedLine.startsWith('//')) {
      // Remove comment
      newLine =
        line.substring(0, leadingSpaces) + trimmedLine.substring(2).trimStart();
    } else {
      // Add comment
      newLine = line.substring(0, leadingSpaces) + '// ' + trimmedLine;
    }

    // Replace line
    this.textarea.value =
      value.substring(0, lineStart) + newLine + value.substring(lineEnd);
    this.textarea.selectionStart = this.textarea.selectionEnd =
      lineStart + Math.min(start - lineStart, newLine.length);

    this._value = this.textarea.value;
    this._scheduleHighlightUpdate();
    this._scheduleOnChange();
  }

  /**
   * Schedule highlight overlay update (debounced)
   * @private
   */
  _scheduleHighlightUpdate() {
    if (this._highlightTimeout) {
      clearTimeout(this._highlightTimeout);
    }
    this._highlightTimeout = setTimeout(() => {
      this._updateHighlightOverlay();
    }, 50);
  }

  /**
   * Schedule onChange callback (debounced)
   * @private
   */
  _scheduleOnChange() {
    if (this._debounceTimeout) {
      clearTimeout(this._debounceTimeout);
    }
    this._debounceTimeout = setTimeout(() => {
      this.onChange(this._value);
    }, 300);
  }

  /**
   * Update syntax highlighting overlay
   * @private
   */
  _updateHighlightOverlay() {
    const highlighted = this._highlightCode(this._value);
    this.highlightOverlay.innerHTML = highlighted + '\n'; // Extra newline for scrolling
  }

  /**
   * Highlight OpenSCAD code
   * @param {string} code
   * @returns {string} HTML with highlighting spans
   * @private
   */
  _highlightCode(code) {
    let html = this._escapeHtml(code);

    html = html.replace(
      /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g,
      '<span class="hl-string">$&</span>'
    );

    html = html.replace(/\/\/.*$/gm, '<span class="hl-comment">$&</span>');
    html = html.replace(
      /\/\*[\s\S]*?\*\//g,
      '<span class="hl-comment">$&</span>'
    );

    html = html.replace(
      /\b-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?\b/g,
      '<span class="hl-number">$&</span>'
    );

    const keywordPattern = new RegExp(
      `\\b(${SCAD_TOKENS.keywords.join('|')})\\b`,
      'g'
    );
    html = html.replace(keywordPattern, '<span class="hl-keyword">$1</span>');

    const builtinPattern = new RegExp(
      `\\b(${SCAD_TOKENS.builtins.join('|')})\\b`,
      'g'
    );
    html = html.replace(builtinPattern, '<span class="hl-builtin">$1</span>');

    const functionPattern = new RegExp(
      `\\b(${SCAD_TOKENS.functions.join('|')})\\b`,
      'g'
    );
    html = html.replace(functionPattern, '<span class="hl-function">$1</span>');

    const specialPattern = new RegExp(
      `(${SCAD_TOKENS.specials.map((s) => s.replace('$', '\\$')).join('|')})\\b`,
      'g'
    );
    html = html.replace(specialPattern, '<span class="hl-special">$1</span>');

    const constantPattern = new RegExp(
      `\\b(${SCAD_TOKENS.constants.join('|')})\\b`,
      'g'
    );
    html = html.replace(constantPattern, '<span class="hl-constant">$1</span>');

    // Mark error lines
    if (this._errorLines.size > 0) {
      const lines = html.split('\n');
      html = lines
        .map((line, i) => {
          if (this._errorLines.has(i + 1)) {
            return `<span class="hl-error-line">${line}</span>`;
          }
          return line;
        })
        .join('\n');
    }

    return html;
  }

  /**
   * Escape HTML special characters
   * @param {string} text
   * @returns {string}
   * @private
   */
  _escapeHtml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /**
   * Update line numbers
   * @private
   */
  _updateLineNumbers() {
    const lineCount = (this._value.match(/\n/g) || []).length + 1;
    const numbers = [];

    for (let i = 1; i <= lineCount; i++) {
      const className = this._errorLines.has(i)
        ? 'line-number error'
        : 'line-number';
      numbers.push(`<span class="${className}">${i}</span>`);
    }

    this.lineNumbers.innerHTML = numbers.join('\n');
  }

  /**
   * Sync scroll between textarea and overlays
   * @private
   */
  _syncScroll() {
    this.lineNumbers.scrollTop = this.textarea.scrollTop;
    this.highlightOverlay.scrollTop = this.textarea.scrollTop;
    this.highlightOverlay.scrollLeft = this.textarea.scrollLeft;
  }

  /**
   * Update status bar with current position
   * @private
   */
  _updateStatusBar() {
    const lineInfo = document.getElementById('textarea-status-line');
    const charCount = document.getElementById('textarea-status-chars');

    if (lineInfo) {
      const pos = this._getCursorPosition();
      lineInfo.textContent = `Line ${pos.line}, Column ${pos.column}`;
    }

    if (charCount) {
      const chars = this._value.length;
      charCount.textContent = `${chars} character${chars !== 1 ? 's' : ''}`;
    }
  }

  /**
   * Get current cursor position as line/column
   * @returns {{ line: number, column: number }}
   * @private
   */
  _getCursorPosition() {
    const start = this.textarea.selectionStart;
    const textBefore = this._value.substring(0, start);
    const lines = textBefore.split('\n');

    return {
      line: lines.length,
      column: lines[lines.length - 1].length + 1,
    };
  }

  /**
   * Get editor value
   * @returns {string}
   */
  getValue() {
    return this._value;
  }

  /**
   * Set editor value
   * @param {string} value
   */
  setValue(value) {
    this._value = value;
    if (this.textarea) {
      this.textarea.value = value;
      this._updateHighlightOverlay();
      this._updateLineNumbers();
      this._updateStatusBar();
    }
  }

  /**
   * Focus the editor
   */
  focus() {
    if (this.textarea) {
      this.textarea.focus();
    }
  }

  /**
   * Get selection range
   * @returns {{ start: number, end: number }}
   */
  getSelection() {
    return {
      start: this.textarea?.selectionStart || 0,
      end: this.textarea?.selectionEnd || 0,
    };
  }

  /**
   * Set selection range
   * @param {number} start
   * @param {number} end
   */
  setSelection(start, end) {
    if (this.textarea) {
      this.textarea.setSelectionRange(start, end);
    }
  }

  /**
   * Set cursor position
   * @param {number} line - 1-based line number
   * @param {number} column - 1-based column number
   */
  setCursorPosition(line, column) {
    const lines = this._value.split('\n');
    let offset = 0;

    for (let i = 0; i < line - 1 && i < lines.length; i++) {
      offset += lines[i].length + 1;
    }
    offset += Math.min(column - 1, lines[line - 1]?.length || 0);

    this.setSelection(offset, offset);
    this._updateStatusBar();
  }

  /**
   * Set error lines for highlighting
   * @param {number[]} lineNumbers - Array of 1-based line numbers with errors
   */
  setErrorLines(lineNumbers) {
    this._errorLines = new Set(lineNumbers);
    this._updateHighlightOverlay();
    this._updateLineNumbers();
  }

  /**
   * Clear error highlighting
   */
  clearErrors() {
    this._errorLines.clear();
    this._updateHighlightOverlay();
    this._updateLineNumbers();
  }

  /**
   * Scroll to a specific line
   * @param {number} line - 1-based line number
   */
  scrollToLine(line) {
    if (!this.textarea) return;

    const lineHeight =
      parseInt(window.getComputedStyle(this.textarea).lineHeight, 10) || 20;
    this.textarea.scrollTop = (line - 1) * lineHeight;
  }

  /**
   * Dispose of the editor
   */
  dispose() {
    if (this._debounceTimeout) {
      clearTimeout(this._debounceTimeout);
    }
    if (this._highlightTimeout) {
      clearTimeout(this._highlightTimeout);
    }
    this.container.innerHTML = '';
    this._isInitialized = false;
  }
}
