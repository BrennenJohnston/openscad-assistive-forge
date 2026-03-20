/**
 * CodeMirror 6 Editor — CSP-compatible advanced code editor
 *
 * Provides syntax highlighting, autocomplete, and rich editing for OpenSCAD
 * without requiring style-src 'unsafe-inline' (uses constructable stylesheets).
 *
 * Public API matches TextareaEditor for drop-in substitution:
 *   constructor({ container, onChange, onSave, onRun, announce })
 *   initialize(), getValue(), setValue(v), focus(), dispose()
 *   getSelection(), setSelection(s,e), setCursorPosition(l,c), scrollToLine(l)
 *   setErrorLines(lines), clearErrors(), getAction()
 *
 * @license GPL-3.0-or-later
 */

import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  drawSelection,
  Decoration,
} from '@codemirror/view';
import { EditorState, Compartment, StateEffect, StateField } from '@codemirror/state';
import { StreamLanguage, syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { autocompletion } from '@codemirror/autocomplete';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';

// ─── OpenSCAD token lists (ported from textarea-editor.js / monaco-editor.js) ──

const SCAD_KEYWORDS = new Set([
  'module', 'function', 'if', 'else', 'for', 'let', 'each',
  'intersection_for', 'assert', 'echo', 'include', 'use',
]);

const SCAD_BUILTINS = new Set([
  'cube', 'sphere', 'cylinder', 'polyhedron', 'circle', 'square',
  'polygon', 'text', 'linear_extrude', 'rotate_extrude', 'surface',
  'import', 'union', 'difference', 'intersection', 'hull', 'minkowski',
  'translate', 'rotate', 'scale', 'mirror', 'multmatrix', 'color',
  'offset', 'resize', 'projection', 'render', 'children',
]);

const SCAD_FUNCTIONS = new Set([
  'abs', 'sign', 'sin', 'cos', 'tan', 'acos', 'asin', 'atan', 'atan2',
  'floor', 'round', 'ceil', 'ln', 'log', 'pow', 'sqrt', 'exp', 'rands',
  'min', 'max', 'concat', 'lookup', 'str', 'chr', 'ord', 'search',
  'version', 'version_num', 'len', 'norm', 'cross',
  'is_undef', 'is_bool', 'is_num', 'is_string', 'is_list', 'is_function',
]);

const SCAD_CONSTANTS = new Set(['true', 'false', 'undef', 'PI']);

// ─── StreamLanguage tokenizer ───────────────────────────────────────────────

const openscadStreamLanguage = StreamLanguage.define({
  startState() {
    return { inBlockComment: false };
  },

  token(stream, state) {
    if (state.inBlockComment) {
      if (stream.match('*/')) {
        state.inBlockComment = false;
      } else {
        stream.next();
      }
      return 'blockComment';
    }

    if (stream.match('/*')) {
      state.inBlockComment = true;
      return 'blockComment';
    }

    if (stream.match(/\/\/.*/)) {
      return 'lineComment';
    }

    if (stream.match(/"(?:[^"\\]|\\.)*"/)) {
      return 'string';
    }

    if (stream.match(/\d+\.?\d*(?:[eE][+-]?\d+)?/) || stream.match(/\.\d+(?:[eE][+-]?\d+)?/)) {
      return 'number';
    }

    if (stream.match(/\$[a-zA-Z_]\w*/)) {
      return 'special';
    }

    if (stream.match(/[a-zA-Z_]\w*/)) {
      const word = stream.current();
      if (SCAD_KEYWORDS.has(word)) return 'keyword';
      if (SCAD_BUILTINS.has(word)) return 'builtin';
      if (SCAD_FUNCTIONS.has(word)) return 'function';
      if (SCAD_CONSTANTS.has(word)) return 'constant';
      return 'variable';
    }

    stream.next();
    return null;
  },

  languageData: {
    commentTokens: { line: '//', block: { open: '/*', close: '*/' } },
  },
});

// ─── Highlight styles (light + dark) ────────────────────────────────────────
// Colors ported from SCAD_THEME / SCAD_DARK_THEME in monaco-editor.js

const lightHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: '#0000FF', fontWeight: 'bold' },
  { tag: tags.typeName, color: '#267F99' },
  { tag: tags.function(tags.variableName), color: '#795E26' },
  { tag: tags.bool, color: '#0070C1' },
  { tag: tags.null, color: '#0070C1' },
  { tag: tags.special(tags.variableName), color: '#001080', fontStyle: 'italic' },
  { tag: tags.comment, color: '#008000', fontStyle: 'italic' },
  { tag: tags.blockComment, color: '#008000', fontStyle: 'italic' },
  { tag: tags.string, color: '#A31515' },
  { tag: tags.number, color: '#098658' },
  { tag: tags.operator, color: '#000000' },
]);

const darkHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: '#569CD6', fontWeight: 'bold' },
  { tag: tags.typeName, color: '#4EC9B0' },
  { tag: tags.function(tags.variableName), color: '#DCDCAA' },
  { tag: tags.bool, color: '#4FC1FF' },
  { tag: tags.null, color: '#4FC1FF' },
  { tag: tags.special(tags.variableName), color: '#9CDCFE', fontStyle: 'italic' },
  { tag: tags.comment, color: '#6A9955', fontStyle: 'italic' },
  { tag: tags.blockComment, color: '#6A9955', fontStyle: 'italic' },
  { tag: tags.string, color: '#CE9178' },
  { tag: tags.number, color: '#B5CEA8' },
  { tag: tags.operator, color: '#D4D4D4' },
]);

const lightEditorTheme = EditorView.theme({
  '&': {
    backgroundColor: '#FFFFFF',
    color: '#000000',
  },
  '.cm-gutters': {
    backgroundColor: '#F8F8F8',
    color: '#237893',
    borderRight: '1px solid #ddd',
  },
  '.cm-activeLineGutter': {
    color: '#0B216F',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
    backgroundColor: '#ADD6FF',
  },
  '.cm-activeLine': {
    backgroundColor: '#F8F8F800',
  },
});

const darkEditorTheme = EditorView.theme({
  '&': {
    backgroundColor: '#1E1E1E',
    color: '#D4D4D4',
  },
  '.cm-gutters': {
    backgroundColor: '#1E1E1E',
    color: '#858585',
    borderRight: '1px solid #333',
  },
  '.cm-activeLineGutter': {
    color: '#C6C6C6',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
    backgroundColor: '#264F78',
  },
  '.cm-activeLine': {
    backgroundColor: '#ffffff0a',
  },
}, { dark: true });

// ─── Autocomplete for OpenSCAD ──────────────────────────────────────────────

function openscadCompletions(context) {
  const word = context.matchBefore(/[a-zA-Z_$]\w*/);
  if (!word || (word.from === word.to && !context.explicit)) return null;

  const options = [];

  for (const kw of SCAD_KEYWORDS) {
    options.push({ label: kw, type: 'keyword' });
  }
  for (const bi of SCAD_BUILTINS) {
    options.push({ label: bi, type: 'function', apply: bi + '()' });
  }
  for (const fn of SCAD_FUNCTIONS) {
    options.push({ label: fn, type: 'function', apply: fn + '()' });
  }
  for (const c of SCAD_CONSTANTS) {
    options.push({ label: c, type: 'constant' });
  }

  return { from: word.from, options };
}

// ─── Error line state (StateEffect + StateField) ────────────────────────────

const setErrorEffect = StateEffect.define();

const errorLineField = StateField.define({
  create() {
    return Decoration.none;
  },
  update(decorations, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setErrorEffect)) {
        return effect.value;
      }
    }
    return decorations.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

const errorLineTheme = EditorView.baseTheme({
  '.cm-error-line': {
    backgroundColor: 'rgba(255, 0, 0, 0.1)',
    outline: '1px solid rgba(255, 0, 0, 0.3)',
  },
});

// ─── CodeMirrorEditor class ─────────────────────────────────────────────────

export class CodeMirrorEditor {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.container
   * @param {Function} options.onChange
   * @param {Function} options.onSave
   * @param {Function} options.onRun
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

    /** @type {EditorView|null} */
    this._view = null;

    /** @type {Compartment} */
    this._themeCompartment = new Compartment();

    /** @type {Compartment} */
    this._highlightCompartment = new Compartment();

    /** @type {Set<number>} */
    this._errorLines = new Set();

    /** @type {boolean} */
    this._isInitialized = false;

    /** @type {MediaQueryList|null} */
    this._darkMediaQuery = null;

    /** @type {Function|null} */
    this._mediaListener = null;
  }

  initialize() {
    if (this._isInitialized) return;

    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    const onSave = this.onSave;
    const onRun = this.onRun;
    const announceRef = this.announce;

    const startState = EditorState.create({
      doc: '',
      extensions: [
        lineNumbers(),
        history(),
        drawSelection(),
        highlightActiveLine(),
        highlightSelectionMatches(),

        openscadStreamLanguage,
        this._highlightCompartment.of(
          syntaxHighlighting(isDark ? darkHighlightStyle : lightHighlightStyle)
        ),
        this._themeCompartment.of(isDark ? darkEditorTheme : lightEditorTheme),

        autocompletion({ override: [openscadCompletions] }),

        keymap.of([
          {
            key: 'Mod-s',
            run() {
              onSave();
              announceRef('Saved');
              return true;
            },
          },
          {
            key: 'Mod-Enter',
            run() {
              onRun();
              announceRef('Generating preview');
              return true;
            },
          },
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap,
        ]),

        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            this.onChange(update.state.doc.toString());
          }
        }),

        errorLineField,
        errorLineTheme,
      ],
    });

    this._view = new EditorView({
      state: startState,
      parent: this.container,
    });

    const cmContent = this._view.contentDOM;
    cmContent.setAttribute('aria-label', 'OpenSCAD code editor');

    this._darkMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    this._mediaListener = (e) => this._switchTheme(e.matches);
    this._darkMediaQuery.addEventListener('change', this._mediaListener);

    this._isInitialized = true;
    console.log('[CodeMirrorEditor] Initialized');
  }

  /** @private */
  _switchTheme(isDark) {
    if (!this._view) return;
    this._view.dispatch({
      effects: [
        this._themeCompartment.reconfigure(isDark ? darkEditorTheme : lightEditorTheme),
        this._highlightCompartment.reconfigure(
          syntaxHighlighting(isDark ? darkHighlightStyle : lightHighlightStyle)
        ),
      ],
    });
  }

  /** @returns {string} */
  getValue() {
    return this._view ? this._view.state.doc.toString() : '';
  }

  /** @param {string} value */
  setValue(value) {
    if (!this._view) return;
    this._view.dispatch({
      changes: { from: 0, to: this._view.state.doc.length, insert: value },
    });
  }

  focus() {
    if (this._view) {
      this._view.focus();
    }
  }

  /** @returns {{ start: number, end: number }} */
  getSelection() {
    if (!this._view) return { start: 0, end: 0 };
    const sel = this._view.state.selection.main;
    return { start: sel.from, end: sel.to };
  }

  /**
   * @param {number} start
   * @param {number} end
   */
  setSelection(start, end) {
    if (!this._view) return;
    this._view.dispatch({
      selection: { anchor: start, head: end },
    });
  }

  /**
   * @param {number} line - 1-based line number
   * @param {number} column - 1-based column number
   */
  setCursorPosition(line, column) {
    if (!this._view) return;
    const doc = this._view.state.doc;
    const clampedLine = Math.max(1, Math.min(line, doc.lines));
    const lineObj = doc.line(clampedLine);
    const clampedCol = Math.max(1, Math.min(column, lineObj.length + 1));
    const offset = lineObj.from + clampedCol - 1;
    this._view.dispatch({ selection: { anchor: offset } });
  }

  /**
   * @param {number} line - 1-based line number
   */
  scrollToLine(line) {
    if (!this._view) return;
    const doc = this._view.state.doc;
    const clampedLine = Math.max(1, Math.min(line, doc.lines));
    const lineObj = doc.line(clampedLine);
    this._view.dispatch({
      effects: EditorView.scrollIntoView(lineObj.from, { y: 'center' }),
    });
  }

  /**
   * @param {number[]} lineNumbers - Array of 1-based line numbers with errors
   */
  setErrorLines(lineNumbers) {
    this._errorLines = new Set(lineNumbers);
    this._applyErrorDecorations();
  }

  clearErrors() {
    this._errorLines.clear();
    this._applyErrorDecorations();
  }

  /** @private */
  _applyErrorDecorations() {
    if (!this._view) return;
    const doc = this._view.state.doc;
    const decorations = [];

    for (const lineNum of this._errorLines) {
      if (lineNum >= 1 && lineNum <= doc.lines) {
        const line = doc.line(lineNum);
        decorations.push(
          Decoration.line({ class: 'cm-error-line' }).range(line.from)
        );
      }
    }

    decorations.sort((a, b) => a.from - b.from);

    this._view.dispatch({
      effects: setErrorEffect.of(Decoration.set(decorations)),
    });
  }

  /**
   * Shim for Monaco-compatible getAction() — returns null.
   * @returns {null}
   */
  getAction() {
    return null;
  }

  dispose() {
    if (this._darkMediaQuery && this._mediaListener) {
      this._darkMediaQuery.removeEventListener('change', this._mediaListener);
      this._darkMediaQuery = null;
      this._mediaListener = null;
    }
    if (this._view) {
      this._view.destroy();
      this._view = null;
    }
    this._isInitialized = false;
  }
}
