/**
 * CodeMirror 6 Editor — CSP-compatible advanced code editor
 *
 * Provides syntax highlighting, autocomplete, and rich editing for OpenSCAD
 * without requiring style-src 'unsafe-inline'. CodeMirror itself injects its
 * CSS in a <style> element, which a strict style-src discards; the rules are
 * re-homed into a constructable stylesheet by codemirror-csp-styles.js.
 *
 * Public API matches TextareaEditor for drop-in substitution:
 *   constructor({ container, onChange, onSave, onRun, announce })
 *   initialize(), getValue(), setValue(v), focus(), dispose()
 *   getSelection(), setSelection(s,e), setCursorPosition(l,c), scrollToLine(l)
 *   setErrorLines(lines), clearErrors(), supportsAction(id),
 *   performAction(id), canUndo(), canRedo(), replaceSelection(text)
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
  gutter,
  GutterMarker,
} from '@codemirror/view';
import {
  EditorState,
  Compartment,
  StateEffect,
  StateField,
  RangeSet,
} from '@codemirror/state';
import {
  StreamLanguage,
  syntaxHighlighting,
  HighlightStyle,
  codeFolding,
  foldGutter,
  foldKeymap,
  foldAll,
  unfoldAll,
  foldService,
  indentUnit,
} from '@codemirror/language';
import { tags } from '@lezer/highlight';
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentMore,
  indentLess,
  lineComment,
  lineUncomment,
  undo,
  redo,
  undoDepth,
  redoDepth,
} from '@codemirror/commands';
import { autocompletion } from '@codemirror/autocomplete';
import {
  search,
  highlightSelectionMatches,
  searchKeymap,
  openSearchPanel,
  findNext,
  findPrevious,
  setSearchQuery,
  SearchQuery,
} from '@codemirror/search';
import { adoptCodeMirrorStyles } from './codemirror-csp-styles.js';
import { loadEditorPrefs } from './editor-prefs.js';

// ─── OpenSCAD token lists (ported from textarea-editor.js / monaco-editor.js) ──

const SCAD_KEYWORDS = new Set([
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
]);

const SCAD_BUILTINS = new Set([
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
]);

const SCAD_FUNCTIONS = new Set([
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

    if (
      stream.match(/\d+\.?\d*(?:[eE][+-]?\d+)?/) ||
      stream.match(/\.\d+(?:[eE][+-]?\d+)?/)
    ) {
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
  {
    tag: tags.special(tags.variableName),
    color: '#001080',
    fontStyle: 'italic',
  },
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
  {
    tag: tags.special(tags.variableName),
    color: '#9CDCFE',
    fontStyle: 'italic',
  },
  { tag: tags.comment, color: '#6A9955', fontStyle: 'italic' },
  { tag: tags.blockComment, color: '#6A9955', fontStyle: 'italic' },
  { tag: tags.string, color: '#CE9178' },
  { tag: tags.number, color: '#B5CEA8' },
  { tag: tags.operator, color: '#D4D4D4' },
]);

/**
 * CodeMirror has no font-size facility; a theme is the facility. Set on the
 * editor root and on .cm-gutters so the line numbers scale with the code —
 * sizing only the content leaves the gutter behind and the two stop lining
 * up. Given in px because the control is a px control (Edit ▸ Font Size has
 * always announced "Font size: 14px").
 *
 * The explicit line-height is not decoration. MEASURED: before anything set
 * a font size on the editor root, rows were 22px against 14px text — 1.57,
 * inherited by accident from the page. Setting the root to 14px recomputed
 * that inherited unitless line-height against a smaller number and rows fell
 * to 20px, i.e. 1.43, under the 1.5 that WCAG 2.2 SC 1.4.12 Text Spacing
 * asks for. Pinning it here keeps the ratio at every font size the user can
 * choose, instead of letting it drift out of range whenever the size changes.
 *
 * @param {number} px
 */
const EDITOR_LINE_HEIGHT = 1.6;

function fontSizeTheme(px) {
  return EditorView.theme({
    '&': { fontSize: `${px}px` },
    // The row height follows .cm-scroller, which carries CodeMirror's own
    // line-height: 1.4 — that is where the 1.43 came from, not the root.
    '.cm-scroller': { lineHeight: String(EDITOR_LINE_HEIGHT) },
    '.cm-gutters': { fontSize: `${px}px` },
  });
}

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

const darkEditorTheme = EditorView.theme(
  {
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
  },
  { dark: true }
);

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

// ─── Bookmarks ───────────────────────────────────────────────────────────────
// CodeMirror has no bookmark feature, so this is a small line-marker extension:
// a gutter dot per bookmarked line, plus toggle/next/previous commands. The
// marker is decorative — the state reaches a screen reader through the
// announcements in performAction(), not through the gutter.

class BookmarkMarker extends GutterMarker {
  toDOM() {
    const dot = document.createElement('span');
    dot.className = 'cm-bookmark-dot';
    dot.setAttribute('aria-hidden', 'true');
    dot.textContent = '●';
    return dot;
  }
}

const bookmarkMarker = new BookmarkMarker();

/** @type {StateEffectType<{line: number, on: boolean}>} */
const toggleBookmarkEffect = StateEffect.define();

const bookmarkField = StateField.define({
  create() {
    return RangeSet.empty;
  },
  update(marks, tr) {
    marks = marks.map(tr.changes);
    for (const effect of tr.effects) {
      if (!effect.is(toggleBookmarkEffect)) continue;
      const { doc } = tr.state;
      const lineNumber = effect.value.line;
      if (lineNumber < 1 || lineNumber > doc.lines) continue;
      if (effect.value.on) {
        marks = marks.update({
          add: [bookmarkMarker.range(doc.line(lineNumber).from)],
          sort: true,
        });
      } else {
        marks = marks.update({
          filter: (from) => lineNumberAt(doc, from) !== lineNumber,
        });
      }
    }
    return marks;
  },
});

function lineNumberAt(doc, pos) {
  return doc.lineAt(Math.max(0, Math.min(pos, doc.length))).number;
}

/**
 * Bookmarked line numbers, ascending. Edits can drag two marks onto the same
 * line, so the set is de-duplicated on read rather than on every change.
 * @param {EditorState} state
 * @returns {number[]}
 */
function bookmarkLines(state) {
  const lines = new Set();
  const iter = state.field(bookmarkField).iter();
  while (iter.value) {
    lines.add(lineNumberAt(state.doc, iter.from));
    iter.next();
  }
  return [...lines].sort((a, b) => a - b);
}

function cursorLine(state) {
  return state.doc.lineAt(state.selection.main.head).number;
}

const toggleBookmark = (view) => {
  const line = cursorLine(view.state);
  const on = !bookmarkLines(view.state).includes(line);
  view.dispatch({ effects: toggleBookmarkEffect.of({ line, on }) });
  return true;
};

function gotoBookmark(view, direction) {
  const lines = bookmarkLines(view.state);
  if (lines.length === 0) return false;
  const current = cursorLine(view.state);
  const target =
    direction > 0
      ? (lines.find((line) => line > current) ?? lines[0])
      : (lines.filter((line) => line < current).pop() ??
        lines[lines.length - 1]);
  const line = view.state.doc.line(target);
  view.dispatch({ selection: { anchor: line.from }, scrollIntoView: true });
  return true;
}

const nextBookmark = (view) => gotoBookmark(view, 1);
const previousBookmark = (view) => gotoBookmark(view, -1);

const bookmarkGutter = gutter({
  class: 'cm-bookmark-gutter',
  markers: (view) => view.state.field(bookmarkField),
  initialSpacer: () => bookmarkMarker,
});

const bookmarkTheme = EditorView.baseTheme({
  '.cm-bookmark-gutter': { width: '1em' },
  '.cm-bookmark-dot': { color: '#0b6bcb', fontSize: '0.7em', lineHeight: 1.6 },
  '&dark .cm-bookmark-dot': { color: '#78bafc' },
});

// ─── Code folding ────────────────────────────────────────────────────────────
// OpenSCAD is tokenized here by a StreamLanguage, which carries no structure —
// so foldGutter would draw nothing and Fold All would silently do nothing.
// This supplies the missing fold information: a foldable block is the text
// between a brace opened on a line and its match, with braces inside strings
// and comments ignored. Ranges are computed once per document version, since
// the fold service is asked about every visible line on every repaint.

const foldRangeCache = new WeakMap();

function computeFoldRanges(doc) {
  const text = doc.toString();
  const open = [];
  const pairs = [];
  let inLineComment = false;
  let inBlockComment = false;
  let inString = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (inLineComment) {
      if (char === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (char === '*' && next === '/') {
        inBlockComment = false;
        i++;
      }
      continue;
    }
    if (inString) {
      if (char === '\\') i++;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '/' && next === '/') {
      inLineComment = true;
      i++;
    } else if (char === '/' && next === '*') {
      inBlockComment = true;
      i++;
    } else if (char === '"') {
      inString = true;
    } else if (char === '{') {
      open.push(i);
    } else if (char === '}' && open.length > 0) {
      pairs.push([open.pop(), i]);
    }
  }

  const byLine = new Map();
  for (const [from, to] of pairs) {
    const startLine = doc.lineAt(from).number;
    // A block that opens and closes on one line has nothing to hide.
    if (doc.lineAt(to).number === startLine) continue;
    const existing = byLine.get(startLine);
    if (!existing || to > existing.to) {
      byLine.set(startLine, { from: from + 1, to });
    }
  }
  return byLine;
}

function foldRangesFor(doc) {
  let ranges = foldRangeCache.get(doc);
  if (!ranges) {
    ranges = computeFoldRanges(doc);
    foldRangeCache.set(doc, ranges);
  }
  return ranges;
}

const scadFoldService = foldService.of((state, lineStart) => {
  const line = state.doc.lineAt(lineStart);
  return foldRangesFor(state.doc).get(line.number) ?? null;
});

// ─── Whitespace and search helpers ───────────────────────────────────────────

/**
 * Expand every tab to the next tab stop, so the visible layout is unchanged.
 * A flat "one tab becomes N spaces" swap would shift indented code.
 */
const convertTabsToSpaces = (view) => {
  const { state } = view;
  if (!state.doc.toString().includes('\t')) return false;
  const tabSize = state.tabSize || 4;
  const changes = [];
  for (let n = 1; n <= state.doc.lines; n++) {
    const line = state.doc.line(n);
    if (!line.text.includes('\t')) continue;
    let column = 0;
    let expanded = '';
    for (const char of line.text) {
      if (char === '\t') {
        const width = tabSize - (column % tabSize);
        expanded += ' '.repeat(width);
        column += width;
      } else {
        expanded += char;
        column += 1;
      }
    }
    changes.push({ from: line.from, to: line.to, insert: expanded });
  }
  if (changes.length === 0) return false;
  view.dispatch({ changes });
  return true;
};

/**
 * Seed the search query from the selection and move to the next match, which
 * is what upstream's Use Selection for Find does. This only works because the
 * search() extension is installed below: without it CodeMirror adds its
 * search state field lazily when the panel first opens, so setSearchQuery
 * would be silently dropped and findNext would just open an empty panel.
 */
const useSelectionForFind = (view) => {
  const range = view.state.selection.main;
  if (range.empty) return false;
  view.dispatch({
    effects: setSearchQuery.of(
      new SearchQuery({ search: view.state.sliceDoc(range.from, range.to) })
    ),
  });
  return findNext(view);
};

// ─── CodeMirrorEditor class ─────────────────────────────────────────────────

// Named editor commands exposed to the Edit menu / keyboard shortcuts.
// All are stock CodeMirror commands; comment syntax comes from the
// commentTokens languageData on the OpenSCAD stream language above.
const EDITOR_COMMANDS = {
  // Text undo/redo, distinct from the app's parameter history. A full-document
  // programmatic setValue resets this history on purpose (A1), so Undo can
  // never resurrect a previously loaded project.
  undo,
  redo,
  indent: indentMore,
  unindent: indentLess,
  comment: lineComment,
  uncomment: lineUncomment,
  find: openSearchPanel,
  // CodeMirror's search panel includes the replace controls — verified in the
  // browser at R3b-1, so Find and Replace needs no separate panel.
  findReplace: openSearchPanel,
  findNext,
  findPrevious,
  useSelectionForFind,
  convertTabsToSpaces,
  toggleBookmark,
  nextBookmark,
  previousBookmark,
  foldAll,
  unfoldAll,
};

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

    /** @type {Compartment} - Holds history() so setValue can reset undo state */
    this._historyCompartment = new Compartment();

    // Preferences ▸ Editor reconfigures these live. Each is a real CodeMirror
    // facility: a theme for the font size, the indentUnit and tabSize facets,
    // the lineWrapping extension and highlightActiveLine. Anything the tab
    // offers that has no facility behind it ships disabled with a reason
    // rather than pretending.
    /** @type {Compartment} */
    this._fontSizeCompartment = new Compartment();
    /** @type {Compartment} */
    this._indentCompartment = new Compartment();
    /** @type {Compartment} */
    this._tabSizeCompartment = new Compartment();
    /** @type {Compartment} */
    this._wrapCompartment = new Compartment();
    /** @type {Compartment} */
    this._activeLineCompartment = new Compartment();

    /** @type {import('./editor-prefs.js').EditorPrefs} */
    this._editorPrefs = loadEditorPrefs();

    /**
     * True while setValue() replaces the document. A programmatic replace is
     * not a user edit: it must not reach onChange, or loading a project marks
     * the buffer dirty before the user has typed anything.
     * @type {boolean}
     */
    this._suppressOnChange = false;

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

    // Re-read on every initialize(): the editor is destroyed and rebuilt on
    // each mode switch, so settings applied in a previous life have to come
    // back from storage or they silently reset.
    this._editorPrefs = loadEditorPrefs();

    const startState = EditorState.create({
      doc: '',
      extensions: [
        // Desktop OpenSCAD wraps at word boundaries by default. Without this
        // a long line runs off the pane and has to be scrolled to sideways,
        // which also fails WCAG 1.4.10. CodeMirror keeps one line number per
        // logical line, against its first visual row, as the desktop does.
        this._wrapCompartment.of(
          this._editorPrefs.lineWrapping ? EditorView.lineWrapping : []
        ),
        this._fontSizeCompartment.of(fontSizeTheme(this._editorPrefs.fontSize)),
        this._indentCompartment.of(
          indentUnit.of(' '.repeat(this._editorPrefs.indentWidth))
        ),
        this._tabSizeCompartment.of(
          EditorState.tabSize.of(this._editorPrefs.tabWidth)
        ),
        lineNumbers(),
        bookmarkField,
        bookmarkGutter,
        bookmarkTheme,
        codeFolding(),
        scadFoldService,
        foldGutter(),
        this._historyCompartment.of(history()),
        drawSelection(),
        this._activeLineCompartment.of(
          this._editorPrefs.highlightActiveLine ? highlightActiveLine() : []
        ),
        highlightSelectionMatches(),
        // Installed explicitly so the search state exists from the start.
        // CodeMirror otherwise adds it only when the panel first opens, and
        // Use Selection for Find sets its query before that ever happens.
        search(),

        openscadStreamLanguage,
        this._highlightCompartment.of(
          syntaxHighlighting(isDark ? darkHighlightStyle : lightHighlightStyle)
        ),
        this._themeCompartment.of(isDark ? darkEditorTheme : lightEditorTheme),

        autocompletion({ override: [openscadCompletions] }),

        keymap.of([
          // Neither shortcut announces here: the keymap cannot know the
          // outcome. Saving announces "Project saved" once it succeeds and
          // toasts on failure; the preview state indicator is an aria-live
          // region that reports rendering and readiness on its own.
          {
            key: 'Mod-s',
            run() {
              onSave();
              return true;
            },
          },
          {
            key: 'Mod-Enter',
            run() {
              onRun();
              return true;
            },
          },
          // Upstream's bookmark keys (MainWindow.ui). They live in the
          // editor's own keymap rather than the app shortcut registry
          // because they only mean anything while the editor has focus.
          {
            key: 'Mod-F2',
            run: (view) => this._runAndAnnounce('toggleBookmark', view),
          },
          {
            key: 'F2',
            run: (view) => this._runAndAnnounce('nextBookmark', view),
          },
          {
            key: 'Shift-F2',
            run: (view) => this._runAndAnnounce('previousBookmark', view),
          },
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap,
          ...foldKeymap,
        ]),

        EditorView.updateListener.of((update) => {
          if (update.docChanged && !this._suppressOnChange) {
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

    // The view has mounted its styles by now, so there is something to adopt.
    adoptCodeMirrorStyles();

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
        this._themeCompartment.reconfigure(
          isDark ? darkEditorTheme : lightEditorTheme
        ),
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

  /**
   * Replace the whole document programmatically (project load, mode switch).
   * Not a user edit: onChange stays silent and the undo history is discarded,
   * so Undo cannot resurrect the previously loaded project — this matches
   * desktop OpenSCAD's behavior when opening a file.
   * @param {string} value
   */
  setValue(value) {
    if (!this._view) return;
    this._suppressOnChange = true;
    try {
      this._view.dispatch({
        changes: { from: 0, to: this._view.state.doc.length, insert: value },
      });
      this._resetHistory();
    } finally {
      this._suppressOnChange = false;
    }
  }

  /**
   * Discard undo/redo state by tearing the history field out of the
   * configuration and putting a fresh one back. Reconfiguring in a single
   * transaction would keep the existing field, so this needs two dispatches.
   * @private
   */
  _resetHistory() {
    if (!this._view) return;
    this._view.dispatch({ effects: this._historyCompartment.reconfigure([]) });
    this._view.dispatch({
      effects: this._historyCompartment.reconfigure(history()),
    });
  }

  focus() {
    if (this._view) {
      this._view.focus();
    }
  }

  // ---------------------------------------------------------------------------
  // Preferences ▸ Editor — live reconfiguration
  //
  // Each setter reconfigures one compartment on the running editor, so a
  // change is visible on the document already open rather than on the next
  // one. Values are clamped by editor-prefs before they arrive here.
  // ---------------------------------------------------------------------------

  /** @param {number} px */
  setFontSize(px) {
    this._editorPrefs.fontSize = px;
    this._view?.dispatch({
      effects: this._fontSizeCompartment.reconfigure(fontSizeTheme(px)),
    });
  }

  /** @param {number} width Spaces per indent step. */
  setIndentWidth(width) {
    this._editorPrefs.indentWidth = width;
    this._view?.dispatch({
      effects: this._indentCompartment.reconfigure(
        indentUnit.of(' '.repeat(width))
      ),
    });
  }

  /** @param {number} width Columns a literal tab character occupies. */
  setTabWidth(width) {
    this._editorPrefs.tabWidth = width;
    this._view?.dispatch({
      effects: this._tabSizeCompartment.reconfigure(
        EditorState.tabSize.of(width)
      ),
    });
  }

  /** @param {boolean} on */
  setLineWrapping(on) {
    this._editorPrefs.lineWrapping = on;
    this._view?.dispatch({
      effects: this._wrapCompartment.reconfigure(
        on ? EditorView.lineWrapping : []
      ),
    });
  }

  /** @param {boolean} on */
  setHighlightActiveLine(on) {
    this._editorPrefs.highlightActiveLine = on;
    this._view?.dispatch({
      effects: this._activeLineCompartment.reconfigure(
        on ? highlightActiveLine() : []
      ),
    });
  }

  /**
   * Re-measure the editor against its current container. CodeMirror caches
   * geometry from init time; after the panel is re-parented into a
   * different-width dock (Classic's editor slot) the cached width paints
   * wider than the pane until a measure runs.
   */
  refreshLayout() {
    if (this._view) {
      this._view.requestMeasure();
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
   * Whether performAction(actionId) can execute in this editor.
   * Consumed by the Edit menu to disable unsupported items honestly.
   * @param {string} actionId
   * @returns {boolean}
   */
  supportsAction(actionId) {
    return Boolean(this._view) && actionId in EDITOR_COMMANDS;
  }

  /**
   * Whether there is a text edit to undo. Lets the editor toolbar disable its
   * Undo button honestly rather than offering a no-op.
   * @returns {boolean}
   */
  canUndo() {
    return Boolean(this._view) && undoDepth(this._view.state) > 0;
  }

  /**
   * Whether there is an undone text edit to redo.
   * @returns {boolean}
   */
  canRedo() {
    return Boolean(this._view) && redoDepth(this._view.state) > 0;
  }

  /**
   * Run a named editor command (Edit-menu / keyboard-shortcut integration).
   * @param {string} actionId
   * @returns {boolean} True when the command executed
   */
  performAction(actionId) {
    const command = EDITOR_COMMANDS[actionId];
    if (!command || !this._view) return false;
    this._view.focus();
    return this._runAndAnnounce(actionId, this._view);
  }

  /**
   * Run a command and speak its outcome where the outcome is otherwise
   * invisible to a screen reader — a gutter dot appearing, or a jump that
   * looks like any other cursor move.
   * @private
   */
  _runAndAnnounce(actionId, view) {
    const ran = EDITOR_COMMANDS[actionId](view);

    if (actionId === 'toggleBookmark') {
      const line = cursorLine(view.state);
      const on = bookmarkLines(view.state).includes(line);
      this.announce(
        on ? `Bookmark added, line ${line}` : `Bookmark removed, line ${line}`
      );
    } else if (actionId === 'nextBookmark' || actionId === 'previousBookmark') {
      if (ran) {
        const lines = bookmarkLines(view.state);
        const line = cursorLine(view.state);
        this.announce(
          `Line ${line}, bookmark ${lines.indexOf(line) + 1} of ${lines.length}`
        );
      } else {
        this.announce('No bookmarks in this file');
      }
    } else if (actionId === 'convertTabsToSpaces' && !ran) {
      this.announce('No tabs to convert');
    }

    return ran;
  }

  /**
   * Whether the selection covers any text — the Edit menu uses this to keep
   * Use Selection for Find honest rather than silently doing nothing.
   * @returns {boolean}
   */
  hasSelection() {
    if (!this._view) return false;
    return !this._view.state.selection.main.empty;
  }

  /**
   * Replace the current selection (or insert at the cursor) with text.
   * Used by the Edit-menu Paste handler.
   * @param {string} text
   */
  replaceSelection(text) {
    if (!this._view) return;
    this._view.dispatch(this._view.state.replaceSelection(text));
    this._view.focus();
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
