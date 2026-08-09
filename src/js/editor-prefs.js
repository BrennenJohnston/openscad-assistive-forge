/**
 * Code-editor preferences (Preferences ▸ Editor).
 *
 * One owner for the values and their persistence, because they have more
 * than one control each: font size is also Edit ▸ Increase/Decrease Font
 * Size and its own toolbar buttons, and every one of these survives the
 * editor being torn down and rebuilt on a mode switch. Cross-file default
 * drift is this project's most repeated bug, so the numbers live here and
 * nowhere else.
 *
 * The font-size key is the one `edit-actions-controller` has always used;
 * it is imported from storage-keys.js by both so the two cannot drift.
 *
 * Every setting here is backed by a real CodeMirror facility (a theme for
 * the font size, the indentUnit and tabSize facets, the lineWrapping
 * extension, highlightActiveLine). Settings the desktop offers that this
 * build has no facility for are NOT represented here — they ship visibly
 * disabled with a reason instead.
 *
 * @license GPL-3.0-or-later
 */

import {
  STORAGE_KEY_EDITOR_FONT_SIZE,
  STORAGE_KEY_EDITOR_INDENT_WIDTH,
  STORAGE_KEY_EDITOR_TAB_WIDTH,
  STORAGE_KEY_EDITOR_LINE_WRAP,
  STORAGE_KEY_EDITOR_HIGHLIGHT_LINE,
  safeGetItem,
  safeSetItem,
} from './storage-keys.js';

/**
 * Ranges are enforced on read as well as write: a hand-edited localStorage
 * value must not be able to set a 2px font on an app built for low-vision
 * users.
 */
export const EDITOR_PREF_SPEC = Object.freeze({
  fontSize: { key: STORAGE_KEY_EDITOR_FONT_SIZE, min: 8, max: 32, default: 14 },
  indentWidth: {
    key: STORAGE_KEY_EDITOR_INDENT_WIDTH,
    min: 1,
    max: 8,
    default: 4,
  },
  tabWidth: { key: STORAGE_KEY_EDITOR_TAB_WIDTH, min: 1, max: 8, default: 4 },
});

const BOOLEAN_PREF_SPEC = Object.freeze({
  // Desktop OpenSCAD wraps at word boundaries by default, and unwrapped long
  // lines fail WCAG 1.4.10 reflow, so this defaults on.
  lineWrapping: { key: STORAGE_KEY_EDITOR_LINE_WRAP, default: true },
  highlightActiveLine: {
    key: STORAGE_KEY_EDITOR_HIGHLIGHT_LINE,
    default: true,
  },
});

/** @param {number} value @param {{min: number, max: number}} spec */
function clamp(value, spec) {
  return Math.max(spec.min, Math.min(spec.max, value));
}

/**
 * @typedef {Object} EditorPrefs
 * @property {number} fontSize
 * @property {number} indentWidth
 * @property {number} tabWidth
 * @property {boolean} lineWrapping
 * @property {boolean} highlightActiveLine
 */

/** @returns {EditorPrefs} */
export function loadEditorPrefs() {
  /** @type {any} */
  const out = {};

  for (const [name, spec] of Object.entries(EDITOR_PREF_SPEC)) {
    const raw = safeGetItem(spec.key);
    const parsed = raw === null ? NaN : parseInt(raw, 10);
    out[name] = Number.isFinite(parsed) ? clamp(parsed, spec) : spec.default;
  }

  for (const [name, spec] of Object.entries(BOOLEAN_PREF_SPEC)) {
    const raw = safeGetItem(spec.key);
    out[name] = raw === null ? spec.default : raw === 'true';
  }

  return out;
}

/**
 * Persist one preference, clamped. Returns the value actually stored, which
 * is what the caller should apply — writing 200 and applying 200 while 32 is
 * stored is how a control and its effect come apart.
 *
 * @param {keyof EditorPrefs} name
 * @param {number|boolean} value
 * @returns {number|boolean}
 */
export function saveEditorPref(name, value) {
  if (name in EDITOR_PREF_SPEC) {
    const spec = EDITOR_PREF_SPEC[name];
    const clamped = clamp(Math.round(Number(value)) || spec.default, spec);
    safeSetItem(spec.key, String(clamped));
    return clamped;
  }
  if (name in BOOLEAN_PREF_SPEC) {
    const on = Boolean(value);
    safeSetItem(BOOLEAN_PREF_SPEC[name].key, String(on));
    return on;
  }
  return value;
}
