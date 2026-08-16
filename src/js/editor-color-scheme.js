/**
 * The desktop's editor colour schemes (U-37 ¶2, Q-60a).
 *
 * Transcribed from OpenSCAD 2021.01's own
 * `color-schemes/editor/light-background.json` and `dark-background.json`.
 * Qt resolves the named colours in those files through the SVG keyword list,
 * so "Green" is #008000 rather than #00ff00, "DarkCyan" is #008b8b, and so on.
 *
 * POLICY, signed as Q-60(a) and matching the Q-10 / Q-42a precedent already
 * used for the 3D preview: backgrounds and passing foregrounds go in verbatim;
 * the ones that measurably fail WCAG 1.4.3 are moved along their OWN hue until
 * they pass, and no further. `tests/unit/editor-colors-contrast.test.js` locks
 * every pair, so a future edit cannot quietly undo it.
 *
 * Each tuned value carries the measurement that forced it. Ratios are the
 * worst case of paper AND the active-line background, because the active line
 * is on by default and is where the cursor spends its time — the plan's
 * arithmetic only checked paper, which is why its estimates were optimistic.
 *
 * @license GPL-3.0-or-later
 */

/**
 * @typedef {Object} EditorScheme
 * @property {string} paper           document background
 * @property {string} text            default foreground
 * @property {string} caretLine       active-line background
 * @property {string} marginBackground  gutter background
 * @property {string} marginForeground  line numbers
 * @property {string} selectionBackground
 * @property {string} selectionForeground
 * @property {string} matchedBraceBackground
 * @property {string} matchedBraceForeground
 * @property {string} unmatchedBraceBackground
 * @property {string} unmatchedBraceForeground
 * @property {{keyword1: string, keyword2: string, keyword3: string, comment: string, number: string, string: string, operator: string}} tokens
 */

/** @type {EditorScheme} */
export const LIGHT_SCHEME = Object.freeze({
  paper: '#ffffff', // verbatim
  text: '#272822', // verbatim, 14.86:1
  caretLine: '#f8f8f8', // verbatim
  marginBackground: '#f8f8f8', // verbatim
  // TUNED: Gray #808080 measured 3.72:1 on #f8f8f8. Line numbers are text.
  marginForeground: '#727272', // 4.53:1
  // TUNED: #4a90d9 gave white 3.34:1. Selected code has to stay readable.
  selectionBackground: '#2a78ca', // 4.53:1 against white
  selectionForeground: '#ffffff', // verbatim
  matchedBraceBackground: '#c7f6cb', // verbatim, Blue on it = 7.15:1
  matchedBraceForeground: '#0000ff', // verbatim
  unmatchedBraceBackground: '#ffcdcc', // verbatim, Blue on it = 6.08:1
  unmatchedBraceForeground: '#0000ff', // verbatim
  tokens: Object.freeze({
    keyword1: '#008000', // Green, verbatim, 5.14 / 4.84
    keyword2: '#008000', // Green, verbatim
    keyword3: '#00008b', // DarkBlue, verbatim, 15.3 / 14.4
    // TUNED: DarkCyan #008b8b measured 4.15 on paper and 3.90 on the active
    // line. Comments are the most-read text in a file after the code itself.
    comment: '#007f7f', // 4.84 / 4.55
    number: '#8b0000', // DarkRed, verbatim, 10.01 / 9.43
    string: '#8b008b', // DarkMagenta, verbatim, 8.5 / 8.0
    operator: '#0000ff', // Blue, verbatim, 8.59 / 8.09
  }),
});

/** @type {EditorScheme} */
export const DARK_SCHEME = Object.freeze({
  // Verbatim, and NOT the #1E1E1E this editor used before: the desktop's dark
  // paper is #222222 and its text #e0e0e0.
  paper: '#222222',
  text: '#e0e0e0', // verbatim, 12.05:1
  caretLine: '#303030', // verbatim
  marginBackground: '#272822', // verbatim
  // TUNED: Gray #808080 measured 3.76:1 on #272822.
  marginForeground: '#8e8e8e', // 4.54:1
  // TUNED: same #4a90d9 problem as the light scheme.
  selectionBackground: '#2a78ca', // 4.53:1 against white
  selectionForeground: '#ffffff', // verbatim
  matchedBraceBackground: '#505050', // verbatim, white on it = 8.06:1
  matchedBraceForeground: '#ffffff', // verbatim
  // TUNED: #fdf6e3 on #dc322f measured 4.29:1, just under.
  unmatchedBraceBackground: '#da2925', // 4.50:1
  unmatchedBraceForeground: '#fdf6e3', // verbatim
  tokens: Object.freeze({
    keyword1: '#90ee90', // verbatim, 11.23 / 9.31
    keyword2: '#56dbf0', // verbatim, 9.69 / 8.04
    keyword3: '#add8e6', // verbatim, 10.41 / 8.64
    // TUNED: #808080 measured 4.03 on paper, 3.34 on the active line.
    comment: '#979797', // 5.45 / 4.52
    // TUNED: pure #ff0000 measured 3.98 / 3.30. Red on near-black cannot pass
    // without a real lightness move; this is the only tune above 10%.
    number: '#ff6262', // 5.44 / 4.51
    string: '#e6db74', // verbatim, 11.17 / 9.27
    operator: '#e8b609', // verbatim, 8.43 / 6.99
  }),
});

/** Every scheme, for tests that must cover all of them. */
export const EDITOR_SCHEMES = Object.freeze({
  light: LIGHT_SCHEME,
  dark: DARK_SCHEME,
});

/**
 * The backgrounds a foreground has to survive. The active line is included
 * because `highlightActiveLine` is on by default, so any token can find itself
 * on it.
 *
 * @param {EditorScheme} scheme
 * @returns {string[]}
 */
export function textBackgroundsOf(scheme) {
  return [scheme.paper, scheme.caretLine];
}
