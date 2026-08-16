/**
 * Desktop-parity wrap marks for the CodeMirror editor (U-37 ¶3).
 *
 * Two marks, both from OpenSCAD 2021.01's own defaults in `src/settings.cc`:
 *
 *   lineWrapIndentationStyle = "Fixed", lineWrapIndentation = 4
 *       continuation rows start a FIXED four columns from the left edge of
 *       the text area, regardless of how far the logical line is itself
 *       indented. Measured off the owner's desktop screenshot: a line
 *       indented twelve columns and a line indented none put their
 *       continuations at the same x.
 *
 *   lineWrapVisualizationEnd = "Border"  (Begin = "None")
 *       a return arrow at the right border of every subline that continues,
 *       i.e. on all but the last row of a wrapped line. Parked at a fixed x
 *       at the border, not next to where the text happens to stop.
 *
 * NEITHER mark is made of characters. The indent is CSS padding and the
 * arrow is DOM in CodeMirror's own `layer()`, which mounts outside
 * `.cm-content`. Copying a wrapped line therefore yields the original bytes,
 * and a screen reader reading the document never meets either mark.
 *
 * They ship as two independent extensions because the owner's answer to Q-58
 * was (c): two Preferences toggles, mirroring the desktop, where
 * `lineWrapIndentationStyle` and `lineWrapVisualizationEnd` really are
 * separate settings. So the arrow's reserved column travels with the ARROW
 * rather than with the indent — switch the indent off on its own and the text
 * must still leave the arrow somewhere to sit; switch the arrow off and the
 * full pane width comes back.
 *
 * Why the indent is a theme rule rather than a per-line decoration: CM6's
 * selection geometry (`rectanglesForRange`, @codemirror/view) reads
 * `.cm-line`'s own computed `paddingLeft`, `paddingRight` and negative
 * `textIndent` to work out where a selection rectangle starts and ends. Put
 * the hanging indent anywhere else — on `.cm-content`, say — and selection
 * highlighting silently mis-draws by the indent width. Putting it on
 * `.cm-line` is the technique CodeMirror compensates for, so selection,
 * cursor placement and click-to-position all stay correct for free.
 *
 * @license GPL-3.0-or-later
 */

import { EditorView, layer } from '@codemirror/view';

/** settings.cc: `lineWrapIndentation` default. Columns, not pixels. */
export const WRAP_INDENT_COLUMNS = 4;

/**
 * CodeMirror's own `.cm-line` padding, from its baseTheme (`padding: 0 2px 0
 * 6px`). The hanging indent has to ADD to these rather than replace them, and
 * CSS has no way to say "the inherited padding plus four columns", so the
 * numbers are repeated here. `tests/unit/editor-wrap-marks.test.js` reads the
 * installed package and fails if either ever changes, so a CodeMirror upgrade
 * cannot quietly move the indent instead.
 */
export const CM_LINE_PADDING_LEFT_PX = 6;
export const CM_LINE_PADDING_RIGHT_PX = 2;

/**
 * Width of the column reserved at the right border for the arrow, in `ch`.
 * Reserving it is what keeps text from running underneath the glyph: the
 * desktop's Scintilla wraps early to leave the marker room, and CM6 wraps at
 * the content box, so the content box is what has to get narrower.
 *
 * Two columns, sized by eye against the desktop: its marker is about one
 * character cell wide with clear air either side of it, and at one and a half
 * columns ours sat hard against the pane border.
 */
export const ARROW_COLUMN_CH = 2;

/**
 * Glyph size, in `em` so it tracks the font-size preference.
 *
 * MEASURED off the owner's desktop screenshot: the marker is 10px wide and
 * 11px tall against a 19px row, so it reads at a little over half the row.
 * Ours renders at 0.85em — 11.9px in the 14px default against a 22.4px row —
 * which lands in the same place. Sized at one character cell it came out
 * around 4px of actual ink and was an indistinct blob rather than an arrow.
 */
const ARROW_GLYPH_EM = 0.85;

/**
 * The hanging indent.
 *
 * `padding-left` pushes the whole line block right by four columns;
 * `text-indent` pulls only its FIRST row back to where it was. Rows two and
 * on therefore start four columns in, and the first row keeps the full pane
 * width to wrap in — which is exactly what Fixed means and what the desktop
 * draws.
 *
 * `ch` is the advance width of "0", so in the editor's monospace face it is
 * one character cell, and the indent tracks the font-size preference without
 * anything recomputing it.
 *
 * Scoped to `.cm-lineWrapping`, the class `EditorView.lineWrapping` puts on
 * the content, so with wrapping switched off there is nothing to indent and
 * the rule stops applying by itself — no second piece of state to keep in
 * step with the line-wrap preference.
 */
const wrapIndentTheme = EditorView.theme({
  '.cm-content.cm-lineWrapping .cm-line': {
    paddingLeft: `calc(${CM_LINE_PADDING_LEFT_PX}px + ${WRAP_INDENT_COLUMNS}ch)`,
    textIndent: `-${WRAP_INDENT_COLUMNS}ch`,
  },
});

/**
 * The column the arrow lives in, reserved by narrowing the line rather than by
 * drawing over it. The desktop's Scintilla wraps early to leave its marker
 * room; CM6 wraps at the content box, so the content box is what has to give.
 *
 * This belongs to the arrow and not to the indent (Q-58c): with the arrow
 * switched off there is nothing to reserve room for, and the line should get
 * the width back.
 */
const arrowColumnTheme = EditorView.theme({
  '.cm-content.cm-lineWrapping .cm-line': {
    paddingRight: `calc(${CM_LINE_PADDING_RIGHT_PX}px + ${ARROW_COLUMN_CH}ch)`,
  },
});

/**
 * Where the arrows go, as pure arithmetic so it can be tested without a
 * browser.
 *
 * A wrapped line is exactly `rows * rowHeight` tall and its rows are evenly
 * spaced. Every row but the last one continues, so every row but the last one
 * gets an arrow — a line of N rows gets N-1, which is what the desktop draws.
 *
 * Coordinates come back in the layer's own space; the caller converts.
 *
 * @param {{lines: ReadonlyArray<{top: number, rows: number}>, rowHeight: number, right: number, width: number}} geometry
 * @returns {Array<{left: number, top: number, width: number, height: number}>}
 */
export function wrapArrowPlacements({ lines, rowHeight, right, width }) {
  const out = [];
  if (!(rowHeight > 0)) return out;

  for (const line of lines) {
    if (!(line.rows >= 2)) continue;
    for (let row = 0; row < line.rows - 1; row++) {
      out.push({
        left: right - width,
        top: line.top + row * rowHeight,
        width,
        height: rowHeight,
      });
    }
  }
  return out;
}

/**
 * The `.cm-line` element holding a position, or null if it is not rendered.
 *
 * @param {EditorView} view
 * @param {number} pos
 * @returns {HTMLElement|null}
 */
function lineElementAt(view, pos) {
  const { node } = view.domAtPos(pos);
  const element = node.nodeType === 3 ? node.parentElement : node;
  return element?.closest?.('.cm-line') ?? null;
}

/**
 * The return-arrow glyph, traced from the desktop's own marker: right along
 * the top, down at the border, back left along the bottom, ending in a
 * left-pointing arrowhead whose lower arm dips below the bottom stroke.
 *
 * Built with DOM calls and presentation attributes, never an inline `style`
 * block or a data: URI, so the strict `style-src 'self'` the app ships under
 * has nothing to refuse. `currentColor` takes the editor theme's own
 * foreground, which also makes the mark follow forced-colors mode.
 */
function drawArrow() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 12 12');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('aria-hidden', 'true');

  // Traced to fill the box: the earlier path used barely half its viewBox and
  // rendered as a smudge once scaled down to the arrow column.
  const hook = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  hook.setAttribute('d', 'M1 1.6 H11 V8 H3');
  const head = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  head.setAttribute('d', 'M5.4 5 L1.8 8 L5.4 11');

  for (const path of [hook, head]) {
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '1.6');
    path.setAttribute('stroke-linecap', 'square');
    path.setAttribute('stroke-linejoin', 'miter');
    svg.appendChild(path);
  }
  return svg;
}

/** One arrow. `eq` keeps CodeMirror from redrawing markers that have not moved. */
class WrapArrowMarker {
  /** @param {{left: number, top: number, width: number, height: number}} rect */
  constructor(rect) {
    this.left = rect.left;
    this.top = rect.top;
    this.width = rect.width;
    this.height = rect.height;
  }

  /** @param {WrapArrowMarker} other */
  eq(other) {
    return (
      other instanceof WrapArrowMarker &&
      this.left === other.left &&
      this.top === other.top &&
      this.width === other.width &&
      this.height === other.height
    );
  }

  draw() {
    const element = document.createElement('div');
    element.className = 'cm-wrapReturnArrow';
    element.appendChild(drawArrow());
    this.place(element);
    return element;
  }

  /** @param {HTMLElement} element @param {WrapArrowMarker} previous */
  update(element, previous) {
    if (!(previous instanceof WrapArrowMarker)) return false;
    this.place(element);
    return true;
  }

  /** @param {HTMLElement} element */
  place(element) {
    element.style.left = `${this.left}px`;
    element.style.top = `${this.top}px`;
    element.style.width = `${this.width}px`;
    element.style.height = `${this.height}px`;
  }
}

/**
 * Read the layer's coordinate origin the same way @codemirror/view's own
 * `getBase` does, so these markers and CodeMirror's selection rectangles
 * agree about where zero is.
 *
 * @param {EditorView} view
 */
function layerGeometry(view) {
  const scroller = view.scrollDOM;
  const scrollerRect = scroller.getBoundingClientRect();
  const baseLeft = scrollerRect.left - scroller.scrollLeft;
  const baseTop = scrollerRect.top - scroller.scrollTop;
  const contentRect = view.contentDOM.getBoundingClientRect();

  return {
    right: contentRect.right - baseLeft,
    baseTop,
  };
}

/**
 * Build the arrow layer. One per editor rather than one per module: the
 * closure remembers the content width it last drew for, and two editors
 * sharing that number would each undo the other's bookkeeping.
 */
function buildWrapArrowLayer() {
  let lastContentWidth = -1;

  return layer({
    // Below the text, so a stray overlap can never hide a character and the
    // layer can never take a click away from the editor.
    above: false,
    class: 'cm-wrapReturnArrowLayer',

    update(update) {
      // A width change re-wraps every line, so which rows continue changes
      // wholesale. CodeMirror does not report that as `geometryChanged` —
      // the browser re-wraps the text in CSS without the doc view being
      // redrawn — so the width is compared here instead. MEASURED: without
      // this, taking the Classic pane from 213px to 701px left the arrows
      // drawn for the old width, and `markers()` was never called again.
      const width = update.view.contentDOM.clientWidth;
      if (width !== lastContentWidth) {
        lastContentWidth = width;
        return true;
      }
      return (
        update.docChanged || update.viewportChanged || update.geometryChanged
      );
    },

    markers(view) {
      if (!view.lineWrapping) return [];

      lastContentWidth = view.contentDOM.clientWidth;

      const rowHeight = view.defaultLineHeight;
      const { right, baseTop } = layerGeometry(view);
      const width = arrowColumnWidth(view);

      // Row counts come from the rendered elements, NOT from
      // `BlockInfo.height`. The height map is CodeMirror's cached measurement
      // and can be a cycle behind: a pane resize re-wraps the text in CSS
      // immediately, so by the time this runs the DOM is already right while
      // the height map may not be. MEASURED — reading the map here drew the
      // old width's arrows and, having recorded the new width, never
      // corrected itself. The line boxes are always current.
      const lines = [];
      for (const block of view.viewportLineBlocks) {
        const element = lineElementAt(view, block.from);
        if (!element) continue;
        const rect = element.getBoundingClientRect();
        lines.push({
          top: rect.top - baseTop,
          rows: Math.round(rect.height / rowHeight),
        });
      }

      return wrapArrowPlacements({ lines, rowHeight, right, width }).map(
        (rect) => new WrapArrowMarker(rect)
      );
    },
  });
}

/**
 * The reserved column in pixels. `ARROW_COLUMN_CH` is declared in `ch` for the
 * CSS that narrows the line; here the same width is needed as a number, and
 * `defaultCharacterWidth` is CodeMirror's own measurement of the cell.
 *
 * @param {EditorView} view
 */
function arrowColumnWidth(view) {
  return ARROW_COLUMN_CH * view.defaultCharacterWidth;
}

const wrapArrowTheme = EditorView.theme({
  '.cm-wrapReturnArrowLayer': {
    pointerEvents: 'none',
  },
  '.cm-wrapReturnArrow': {
    display: 'flex',
    alignItems: 'center',
    // Centred in the reserved column rather than pushed hard right, which put
    // the glyph's own border stroke against the pane's border stroke.
    justifyContent: 'center',
    pointerEvents: 'none',
    '& svg': {
      width: `${ARROW_GLYPH_EM}em`,
      height: `${ARROW_GLYPH_EM}em`,
    },
  },
});

/**
 * Hanging indent for continuation rows, on its own (desktop
 * `lineWrapIndentationStyle = Fixed`, `lineWrapIndentation = 4`).
 *
 * @returns {import('@codemirror/state').Extension}
 */
export function wrapIndent() {
  return wrapIndentTheme;
}

/**
 * Return arrows at the right border, on their own, with the column they need
 * (desktop `lineWrapVisualizationEnd = Border`).
 *
 * @returns {import('@codemirror/state').Extension}
 */
export function wrapReturnArrows() {
  return [arrowColumnTheme, wrapArrowTheme, buildWrapArrowLayer()];
}
