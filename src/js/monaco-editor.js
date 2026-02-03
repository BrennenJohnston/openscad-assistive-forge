/**
 * Monaco Editor Integration - Advanced code editor with lazy loading
 *
 * Monaco provides VS Code-like editing experience with:
 * - Syntax highlighting for OpenSCAD
 * - IntelliSense/autocomplete
 * - Error highlighting
 * - Code folding
 * - Find/replace
 *
 * CSP Compatibility:
 * - Requires worker-src 'self' blob:
 * - Requires style-src 'unsafe-inline'
 *
 * @license GPL-3.0-or-later
 */

// OpenSCAD language definition for Monaco
const SCAD_LANGUAGE_DEF = {
  id: 'openscad',
  extensions: ['.scad'],
  aliases: ['OpenSCAD', 'openscad', 'scad'],
  mimetypes: ['text/x-openscad'],
};

// OpenSCAD syntax highlighting rules
const SCAD_MONARCH_TOKENS = {
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

  constants: ['true', 'false', 'undef', 'PI'],

  operators: [
    '=',
    '+',
    '-',
    '*',
    '/',
    '%',
    '^',
    '<',
    '>',
    '<=',
    '>=',
    '==',
    '!=',
    '&&',
    '||',
    '!',
    '?',
    ':',
  ],

  symbols: /[=><!~?:&|+\-*/^%]+/,

  escapes: /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,

  tokenizer: {
    root: [
      // Special variables ($fn, $fa, etc.)
      [/\$[a-zA-Z_]\w*/, 'variable.special'],

      // Identifiers and keywords
      [
        /[a-zA-Z_]\w*/,
        {
          cases: {
            '@keywords': 'keyword',
            '@builtins': 'type.builtin',
            '@functions': 'function.support',
            '@constants': 'constant',
            '@default': 'identifier',
          },
        },
      ],

      // Whitespace
      { include: '@whitespace' },

      // Numbers
      [/\d*\.\d+([eE][-+]?\d+)?/, 'number.float'],
      [/\d+/, 'number'],

      // Delimiters and operators
      [/[{}()[\]]/, '@brackets'],
      [/[;,.]/, 'delimiter'],
      [/@symbols/, 'operator'],

      // Strings
      [/"([^"\\]|\\.)*$/, 'string.invalid'],
      [/"/, 'string', '@string_double'],
    ],

    string_double: [
      [/[^\\"]+/, 'string'],
      [/@escapes/, 'string.escape'],
      [/\\./, 'string.escape.invalid'],
      [/"/, 'string', '@pop'],
    ],

    whitespace: [
      [/[ \t\r\n]+/, ''],
      [/\/\*/, 'comment', '@comment'],
      [/\/\/.*$/, 'comment'],
    ],

    comment: [
      [/[^/*]+/, 'comment'],
      [/\*\//, 'comment', '@pop'],
      [/[/*]/, 'comment'],
    ],
  },
};

// Editor theme optimized for accessibility
const SCAD_THEME = {
  base: 'vs', // Can be 'vs' (light) or 'vs-dark' (dark)
  inherit: true,
  rules: [
    { token: 'keyword', foreground: '0000FF', fontStyle: 'bold' },
    { token: 'type.builtin', foreground: '267F99' },
    { token: 'function.support', foreground: '795E26' },
    { token: 'constant', foreground: '0070C1' },
    { token: 'variable.special', foreground: '001080', fontStyle: 'italic' },
    { token: 'comment', foreground: '008000', fontStyle: 'italic' },
    { token: 'string', foreground: 'A31515' },
    { token: 'number', foreground: '098658' },
    { token: 'operator', foreground: '000000' },
  ],
  colors: {
    'editor.background': '#FFFFFF',
    'editor.foreground': '#000000',
    'editorLineNumber.foreground': '#237893',
    'editorLineNumber.activeForeground': '#0B216F',
    'editor.selectionBackground': '#ADD6FF',
    'editor.lineHighlightBackground': '#F8F8F8',
  },
};

const SCAD_DARK_THEME = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'keyword', foreground: '569CD6', fontStyle: 'bold' },
    { token: 'type.builtin', foreground: '4EC9B0' },
    { token: 'function.support', foreground: 'DCDCAA' },
    { token: 'constant', foreground: '4FC1FF' },
    { token: 'variable.special', foreground: '9CDCFE', fontStyle: 'italic' },
    { token: 'comment', foreground: '6A9955', fontStyle: 'italic' },
    { token: 'string', foreground: 'CE9178' },
    { token: 'number', foreground: 'B5CEA8' },
    { token: 'operator', foreground: 'D4D4D4' },
  ],
  colors: {
    'editor.background': '#1E1E1E',
    'editor.foreground': '#D4D4D4',
  },
};

/** @type {boolean} */
let monacoLoaded = false;

/** @type {Promise<void>|null} */
let loadingPromise = null;

/**
 * Load Monaco Editor lazily
 * @returns {Promise<void>}
 */
export async function loadMonaco() {
  if (monacoLoaded) {
    return Promise.resolve();
  }

  if (loadingPromise) {
    return loadingPromise;
  }

  loadingPromise = new Promise((resolve, reject) => {
    console.log('[MonacoEditor] Loading Monaco...');

    // Configure Monaco loader
    const require = window.require;

    if (typeof require === 'undefined') {
      // Load the Monaco loader script
      const loaderScript = document.createElement('script');
      loaderScript.src =
        'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs/loader.js';
      loaderScript.async = true;

      loaderScript.onload = () => {
        configureAndLoadMonaco(resolve, reject);
      };

      loaderScript.onerror = () => {
        reject(new Error('Failed to load Monaco loader'));
      };

      document.head.appendChild(loaderScript);
    } else {
      configureAndLoadMonaco(resolve, reject);
    }
  });

  return loadingPromise;
}

/**
 * Configure and load Monaco
 * @param {Function} resolve
 * @param {Function} reject
 */
function configureAndLoadMonaco(resolve, reject) {
  const require = window.require;

  require.config({
    paths: {
      vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs',
    },
  });

  // Configure worker URL with CSP-compatible blob
  window.MonacoEnvironment = {
    getWorkerUrl: function (_workerId, label) {
      // Use blob workers for CSP compatibility
      const workerSource = `
        self.MonacoEnvironment = {
          baseUrl: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/'
        };
        importScripts('https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs/base/worker/workerMain.js');
      `;

      const blob = new Blob([workerSource], { type: 'application/javascript' });
      return URL.createObjectURL(blob);
    },
  };

  require(['vs/editor/editor.main'], () => {
    console.log('[MonacoEditor] Monaco loaded successfully');

    // Register OpenSCAD language
    registerOpenSCADLanguage();

    monacoLoaded = true;
    resolve();
  }, (error) => {
    console.error('[MonacoEditor] Failed to load Monaco:', error);
    reject(error);
  });
}

/**
 * Register OpenSCAD language with Monaco
 */
function registerOpenSCADLanguage() {
  const monaco = window.monaco;
  if (!monaco) return;

  // Register language
  monaco.languages.register(SCAD_LANGUAGE_DEF);

  // Set tokenizer
  monaco.languages.setMonarchTokensProvider('openscad', SCAD_MONARCH_TOKENS);

  // Register light theme
  monaco.editor.defineTheme('openscad-light', SCAD_THEME);

  // Register dark theme
  monaco.editor.defineTheme('openscad-dark', SCAD_DARK_THEME);

  // Register completion provider
  monaco.languages.registerCompletionItemProvider('openscad', {
    provideCompletionItems: (model, position) => {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      const suggestions = [];

      // Add keywords
      SCAD_MONARCH_TOKENS.keywords.forEach((kw) => {
        suggestions.push({
          label: kw,
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: kw,
          range,
        });
      });

      // Add builtins
      SCAD_MONARCH_TOKENS.builtins.forEach((bi) => {
        suggestions.push({
          label: bi,
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: bi + '($0)',
          insertTextRules:
            monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
        });
      });

      // Add functions
      SCAD_MONARCH_TOKENS.functions.forEach((fn) => {
        suggestions.push({
          label: fn,
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: fn + '($0)',
          insertTextRules:
            monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
        });
      });

      return { suggestions };
    },
  });

  console.log('[MonacoEditor] OpenSCAD language registered');
}

/**
 * Check if Monaco is loaded
 * @returns {boolean}
 */
export function isMonacoLoaded() {
  return monacoLoaded;
}

/**
 * MonacoEditor wrapper class
 */
export class MonacoEditor {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.container - Container element
   * @param {Function} options.onChange - Content change callback
   * @param {Function} options.onSave - Ctrl+S callback
   * @param {Function} options.onRun - Ctrl+Enter callback
   * @param {Function} options.announce - Screen reader announcement
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

    /** @type {Object|null} */
    this.editor = null;

    /** @type {boolean} */
    this._isDark = false;

    /** @type {Array<Object>} */
    this._decorations = [];
  }

  /**
   * Initialize the Monaco editor
   * @returns {Promise<void>}
   */
  async initialize() {
    // Load Monaco if not already loaded
    await loadMonaco();

    const monaco = window.monaco;
    if (!monaco) {
      throw new Error('Monaco not available after loading');
    }

    // Detect dark mode
    this._isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    // Create editor
    this.editor = monaco.editor.create(this.container, {
      value: '',
      language: 'openscad',
      theme: this._isDark ? 'openscad-dark' : 'openscad-light',
      automaticLayout: true,
      minimap: { enabled: true },
      lineNumbers: 'on',
      renderLineHighlight: 'all',
      scrollBeyondLastLine: false,
      fontSize: 14,
      fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace",
      wordWrap: 'on',
      tabSize: 2,
      insertSpaces: true,
      // Accessibility options
      accessibilitySupport: 'auto',
      ariaLabel: 'OpenSCAD code editor',
    });

    // Set up event handlers
    this._setupEventHandlers();

    // Listen for theme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      this._isDark = e.matches;
      this.editor.updateOptions({
        theme: this._isDark ? 'openscad-dark' : 'openscad-light',
      });
    });

    console.log('[MonacoEditor] Editor initialized');
  }

  /**
   * Set up event handlers
   * @private
   */
  _setupEventHandlers() {
    const monaco = window.monaco;

    // Content change
    this.editor.onDidChangeModelContent(() => {
      this.onChange(this.editor.getValue());
    });

    // Keyboard shortcuts
    this.editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
      () => {
        this.onSave();
        this.announce('Saved');
      }
    );

    this.editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
      () => {
        this.onRun();
        this.announce('Generating preview');
      }
    );
  }

  /**
   * Get editor value
   * @returns {string}
   */
  getValue() {
    return this.editor?.getValue() || '';
  }

  /**
   * Set editor value
   * @param {string} value
   */
  setValue(value) {
    if (this.editor) {
      this.editor.setValue(value);
    }
  }

  /**
   * Focus the editor
   */
  focus() {
    if (this.editor) {
      this.editor.focus();
    }
  }

  /**
   * Get cursor position
   * @returns {{ line: number, column: number }}
   */
  getPosition() {
    const pos = this.editor?.getPosition();
    return pos ? { line: pos.lineNumber, column: pos.column } : { line: 1, column: 1 };
  }

  /**
   * Set cursor position
   * @param {number} line
   * @param {number} column
   */
  setPosition(line, column) {
    if (this.editor) {
      this.editor.setPosition({ lineNumber: line, column });
    }
  }

  /**
   * Get selection
   * @returns {Object|null}
   */
  getSelection() {
    return this.editor?.getSelection() || null;
  }

  /**
   * Set selection
   * @param {Object} selection
   */
  setSelection(selection) {
    if (this.editor && selection) {
      this.editor.setSelection(selection);
    }
  }

  /**
   * Get visible ranges
   * @returns {Array}
   */
  getVisibleRanges() {
    return this.editor?.getVisibleRanges() || [];
  }

  /**
   * Reveal line in center
   * @param {number} line
   */
  revealLineInCenter(line) {
    if (this.editor) {
      this.editor.revealLineInCenter(line);
    }
  }

  /**
   * Set error markers
   * @param {Array<{ line: number, column: number, message: string }>} errors
   */
  setErrors(errors) {
    if (!this.editor) return;

    const monaco = window.monaco;
    const model = this.editor.getModel();

    const markers = errors.map((error) => ({
      severity: monaco.MarkerSeverity.Error,
      startLineNumber: error.line,
      startColumn: error.column || 1,
      endLineNumber: error.line,
      endColumn: (error.column || 1) + 10,
      message: error.message,
    }));

    monaco.editor.setModelMarkers(model, 'openscad', markers);
  }

  /**
   * Clear error markers
   */
  clearErrors() {
    if (!this.editor) return;

    const monaco = window.monaco;
    const model = this.editor.getModel();
    monaco.editor.setModelMarkers(model, 'openscad', []);
  }

  /**
   * Update editor options
   * @param {Object} options
   */
  updateOptions(options) {
    if (this.editor) {
      this.editor.updateOptions(options);
    }
  }

  /**
   * Layout the editor (call after container resize)
   */
  layout() {
    if (this.editor) {
      this.editor.layout();
    }
  }

  /**
   * Dispose of the editor
   */
  dispose() {
    if (this.editor) {
      this.editor.dispose();
      this.editor = null;
    }
  }
}

/**
 * Verify Monaco works under CSP
 * @returns {Promise<boolean>}
 */
export async function verifyMonacoCSP() {
  console.log('[MonacoEditor] Verifying CSP compatibility...');

  try {
    await loadMonaco();

    const monaco = window.monaco;

    const tests = [
      {
        name: 'Monaco available',
        test: () => monaco !== undefined,
      },
      {
        name: 'Editor creates',
        test: () => {
          const container = document.createElement('div');
          container.style.cssText =
            'width:400px;height:300px;position:absolute;left:-9999px';
          document.body.appendChild(container);

          const editor = monaco.editor.create(container, {
            value: '// test',
            language: 'javascript',
          });

          const success = editor.getValue() === '// test';
          editor.dispose();
          container.remove();
          return success;
        },
      },
    ];

    for (const { name, test } of tests) {
      if (!test()) {
        console.error(`[MonacoEditor] CSP verification failed: ${name}`);
        return false;
      }
    }

    console.log('[MonacoEditor] CSP verification passed');
    return true;
  } catch (error) {
    console.error('[MonacoEditor] CSP verification error:', error);
    return false;
  }
}
