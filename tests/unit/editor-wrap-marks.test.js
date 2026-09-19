/**
 * UF-28 wrap marks: the arrow placement arithmetic, and the two numbers this
 * feature borrows from somewhere else.
 *
 * The indent itself is CSS and is proven in the browser
 * (tests/e2e/editor-wrap-marks.spec.js) — there is no decoration builder to
 * test here, because CM6's own selection geometry reads `.cm-line`'s padding
 * and text-indent, which makes a theme rule the supported technique and a
 * per-line decoration the wrong one.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  wrapArrowPlacements,
  WRAP_INDENT_COLUMNS,
  ARROW_COLUMN_CH,
  CM_LINE_PADDING_LEFT_PX,
  CM_LINE_PADDING_RIGHT_PX,
} from '../../src/js/editor-wrap-marks.js';

const ROW = 20;
const RIGHT = 500;
const WIDTH = 16;

const place = (lines) =>
  wrapArrowPlacements({ lines, rowHeight: ROW, right: RIGHT, width: WIDTH });

describe('wrapArrowPlacements', () => {
  it('marks every row of a wrapped line except the last', () => {
    // Four rows continue three times: this is the whole rule, and it is what
    // the desktop draws (measured on the owner's screenshot, line 174 of the
    // universal-cuff file: four rows, three arrows).
    const marks = place([{ top: 100, rows: 4 }]);
    expect(marks).toHaveLength(3);
    expect(marks.map((m) => m.top)).toEqual([100, 120, 140]);
  });

  it('leaves an unwrapped line alone', () => {
    expect(place([{ top: 0, rows: 1 }])).toEqual([]);
  });

  it('treats a two-row line as exactly one mark', () => {
    const marks = place([{ top: 40, rows: 2 }]);
    expect(marks).toHaveLength(1);
    expect(marks[0].top).toBe(40);
  });

  it('hangs every mark off the right edge, whatever the row', () => {
    for (const mark of place([{ top: 0, rows: 3 }, { top: 200, rows: 5 }])) {
      expect(mark.left).toBe(RIGHT - WIDTH);
      expect(mark.width).toBe(WIDTH);
      expect(mark.height).toBe(ROW);
    }
  });

  it('counts across several lines independently', () => {
    const marks = place([
      { top: 0, rows: 1 },
      { top: 20, rows: 3 },
      { top: 80, rows: 1 },
      { top: 100, rows: 2 },
    ]);
    expect(marks).toHaveLength(3);
    expect(marks.map((m) => m.top)).toEqual([20, 40, 100]);
  });

  it('draws nothing rather than dividing by a row height of zero', () => {
    // A hidden editor measures every box at 0. Returning nothing is right;
    // returning Infinity marks is a hung tab.
    expect(
      wrapArrowPlacements({
        lines: [{ top: 0, rows: 4 }],
        rowHeight: 0,
        right: RIGHT,
        width: WIDTH,
      })
    ).toEqual([]);
  });

  it('ignores a line whose row count never got measured', () => {
    expect(place([{ top: 0, rows: NaN }])).toEqual([]);
    expect(place([{ top: 0, rows: 0 }])).toEqual([]);
  });
});

describe('the numbers borrowed from elsewhere', () => {
  it('indents four columns, as OpenSCAD 2021.01 does', () => {
    // settings.cc: lineWrapIndentationStyle "Fixed", lineWrapIndentation 4.
    expect(WRAP_INDENT_COLUMNS).toBe(4);
  });

  it('reserves a column wide enough for the glyph it holds', () => {
    expect(ARROW_COLUMN_CH).toBeGreaterThan(1);
  });

  it("still agrees with CodeMirror's own .cm-line padding", () => {
    // The hanging indent has to ADD to CodeMirror's padding, and CSS cannot
    // say "the inherited padding plus four columns", so the numbers are
    // copied into editor-wrap-marks.js. This is the guard that makes a
    // CodeMirror upgrade fail loudly here instead of quietly moving the
    // indent: if this breaks, re-read the baseTheme and update both.
    const source = readFileSync(
      join(process.cwd(), 'node_modules/@codemirror/view/dist/index.js'),
      'utf-8'
    );
    const rule = source.match(/"\.cm-line":\s*\{[^}]*\}/);
    expect(rule, '.cm-line rule not found in the installed baseTheme').not.toBe(
      null
    );
    const padding = rule[0].match(/padding:\s*"([^"]+)"/);
    expect(padding, '.cm-line has no padding in the installed baseTheme').not.toBe(
      null
    );
    expect(padding[1]).toBe(
      `0 ${CM_LINE_PADDING_RIGHT_PX}px 0 ${CM_LINE_PADDING_LEFT_PX}px`
    );
  });
});
