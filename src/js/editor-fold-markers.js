/**
 * Desktop-parity fold markers for the CodeMirror editor.
 *
 * OpenSCAD 2021.01 draws QScintilla's BoxedTreeFoldStyle in the fold margin: a
 * bordered square holding a minus where a block is open and a plus where it is
 * collapsed, where CodeMirror's default draws chevrons. Folding itself
 * works either way; this is fidelity, not capability.
 *
 * Measured off desktop screenshots rather than guessed: the box is 12px
 * square against a 19px row, with a 2px border, a centered stroke, and the
 * plus's vertical arm the same length as its horizontal one.
 *
 * What is deliberately not built here is the guide line: the desktop runs a
 * vertical rule through the boxes linking a block to its children, and CM6 has
 * no gutter facility for a mark that spans lines. That deviation is recorded
 * rather than faked.
 *
 * The markers are decoration on a control that already works by keyboard —
 * `foldKeymap` and the Edit menu's Fold/Unfold are untouched — so nothing here
 * is the only way to reach folding.
 *
 * @license GPL-3.0-or-later
 */

import { EditorView } from '@codemirror/view';
import { foldGutter } from '@codemirror/language';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * One marker. `open` is true when the block is expanded, which is when the
 * desktop shows a minus — the glyph says what pressing it does.
 *
 * Built with DOM calls and presentation attributes, never an inline `style`
 * block or a data: URI, so the strict `style-src 'self'` the app ships under
 * has nothing to refuse.
 *
 * @param {boolean} open
 * @returns {HTMLElement}
 */
export function foldMarkerDOM(open) {
  const wrapper = document.createElement('span');
  wrapper.className = `cm-foldBox ${open ? 'cm-foldBox-open' : 'cm-foldBox-closed'}`;

  // CodeMirror's DEFAULT marker sets this title; supplying `markerDOM` replaces
  // that element wholesale and it never gets set (`FoldMarker.toDOM` returns
  // the custom node before it reaches the `span.title = ...` line), so a
  // custom marker has to carry its accessible name itself;
  // `menu-parity.spec.js` asserts the fold gutter holds something with a
  // title. Same strings CodeMirror uses.
  wrapper.title = open ? 'Fold line' : 'Unfold line';

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 12 12');
  svg.setAttribute('focusable', 'false');
  // The drawing is decoration; the wrapper's title is what names the control.
  svg.setAttribute('aria-hidden', 'true');

  const box = document.createElementNS(SVG_NS, 'rect');
  box.setAttribute('x', '0.75');
  box.setAttribute('y', '0.75');
  box.setAttribute('width', '10.5');
  box.setAttribute('height', '10.5');
  box.setAttribute('fill', 'none');
  box.setAttribute('stroke', 'currentColor');
  box.setAttribute('stroke-width', '1.5');
  svg.appendChild(box);

  const horizontal = document.createElementNS(SVG_NS, 'path');
  horizontal.setAttribute('d', 'M3.25 6 H8.75');
  horizontal.setAttribute('stroke', 'currentColor');
  horizontal.setAttribute('stroke-width', '1.5');
  svg.appendChild(horizontal);

  if (!open) {
    const vertical = document.createElementNS(SVG_NS, 'path');
    vertical.setAttribute('d', 'M6 3.25 V8.75');
    vertical.setAttribute('stroke', 'currentColor');
    vertical.setAttribute('stroke-width', '1.5');
    svg.appendChild(vertical);
  }

  wrapper.appendChild(svg);
  return wrapper;
}

/**
 * Sized in `em` so the box tracks the font-size preference, and colored from
 * the gutter's own foreground so it follows the theme and forced-colors mode.
 */
const foldBoxTheme = EditorView.theme({
  '.cm-foldGutter .cm-gutterElement': {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 2px',
  },
  '.cm-foldBox': {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    '& svg': {
      width: '0.85em',
      height: '0.85em',
      display: 'block',
    },
  },
});

/**
 * The fold gutter, drawn the desktop's way.
 *
 * @returns {import('@codemirror/state').Extension}
 */
export function boxedFoldGutter() {
  return [foldGutter({ markerDOM: foldMarkerDOM }), foldBoxTheme];
}
