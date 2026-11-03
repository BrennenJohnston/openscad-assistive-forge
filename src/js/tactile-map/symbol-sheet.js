/**
 * The symbol sheet's data: every symbol of each built-in set laid out on one
 * plate at its size, as OpenSCAD polygons, for a test print
 * (docs/guides/symbol-sheet/symbol_sheet.scad). The sets are the one copy;
 * scripts/build-symbol-sheet.mjs writes this text to symbol_sheet_data.scad,
 * and a unit test fails while the written file differs from it.
 *
 * Each symbol is drawn at its own published size, never under its set's
 * symbol size, in rows no wider than a 256 mm bed allows, with a gap of
 * 12 mm between symbols (four times the 3 mm a map keeps) and its number
 * under it.
 *
 * No DOM here.
 *
 * @license GPL-3.0-or-later
 */

import { ringsFromPathData } from '../ring-geometry.js';
import { BUILT_IN_SETS } from './symbol-library.js';

export const SHEET_MARGIN_MM = 10;
export const SHEET_GAP_MM = 12;
export const SHEET_MAX_ROW_MM = 236;
/** Room under a symbol for its number: the gap and the digits' height. */
export const SHEET_NUMBER_ROOM_MM = 6 + 8;

const r2 = (n) => Math.round(n * 100) / 100;

/** A path's rings in mm, centered on [cx, cy], y up, as points and paths. */
function polygonOf(pathData, size, cx, cy) {
  const points = [];
  const paths = [];
  for (const ring of ringsFromPathData(pathData)) {
    const start = points.length;
    for (const p of ring) {
      points.push([r2(cx + (p.x - 0.5) * size), r2(cy + (0.5 - p.y) * size)]);
    }
    paths.push(ring.map((_, i) => start + i));
  }
  return { points, paths };
}

/**
 * One set's sheet: its symbols in rows, the plate's size, each symbol's
 * number and name.
 *
 * @param {{ key: string, name: string, symbolSizeMm: number, symbols: object[] }} set
 */
export function sheetLayout(set) {
  const cells = set.symbols.map((s, i) => ({
    number: i + 1,
    name: s.name,
    size: Math.max(s.minSizeMm ?? 0, set.symbolSizeMm),
    symbol: s,
  }));
  const rows = [];
  let row = [];
  let width = 0;
  for (const cell of cells) {
    const next = width + (row.length ? SHEET_GAP_MM : 0) + cell.size;
    if (row.length && next > SHEET_MAX_ROW_MM) {
      rows.push(row);
      row = [];
      width = 0;
    }
    width += (row.length ? SHEET_GAP_MM : 0) + cell.size;
    row.push(cell);
  }
  if (row.length) rows.push(row);
  const rowWidth = (r) =>
    r.reduce((w, c) => w + c.size, 0) + SHEET_GAP_MM * (r.length - 1);
  const rowHeight = (r) => Math.max(...r.map((c) => c.size));
  const plateW = r2(Math.max(...rows.map(rowWidth)) + 2 * SHEET_MARGIN_MM);
  const plateH = r2(
    rows.reduce((h, r) => h + rowHeight(r) + SHEET_NUMBER_ROOM_MM, 0) +
      SHEET_GAP_MM * (rows.length - 1) +
      2 * SHEET_MARGIN_MM
  );
  let top = plateH - SHEET_MARGIN_MM;
  const placed = [];
  for (const r of rows) {
    const h = rowHeight(r);
    let x = SHEET_MARGIN_MM;
    const cy = top - h / 2;
    for (const c of r) {
      const cx = x + c.size / 2;
      placed.push({
        ...c,
        at: [r2(cx), r2(cy)],
        numberAt: [r2(cx), r2(top - h - 6)],
        shape: polygonOf(c.symbol.pathData, c.size, cx, cy),
        raised:
          typeof c.symbol.raisedPathData === 'string'
            ? polygonOf(c.symbol.raisedPathData, c.size, cx, cy)
            : null,
      });
      x += c.size + SHEET_GAP_MM;
    }
    top -= h + SHEET_NUMBER_ROOM_MM + SHEET_GAP_MM;
  }
  return { key: set.key, name: set.name, plateW, plateH, cells: placed };
}

const list = (a) => JSON.stringify(a);

/**
 * The text of symbol_sheet_data.scad for the built-in sets.
 *
 * @param {object[]} [sets]
 * @returns {string}
 */
export function symbolSheetData(sets = BUILT_IN_SETS) {
  const lines = [
    "// The symbol sheet's data, written by scripts/build-symbol-sheet.mjs from",
    '// the built-in symbol sets (src/js/tactile-map/symbol-library.js). Do not',
    '// edit by hand: change a set, then run the script.',
    '//',
    '// Each set: [name, plate width, plate height, cells]; each cell: [number,',
    '// name, number position, points, paths, raised points, raised paths].',
    '',
    'SHEET_SETS = [',
  ];
  const blocks = sets.map((set) => {
    const layout = sheetLayout(set);
    const cells = layout.cells.map((c) => {
      const raised = c.raised || { points: [], paths: [] };
      return `    [${c.number}, ${list(c.name)}, ${list(c.numberAt)}, ${list(c.shape.points)}, ${list(c.shape.paths)}, ${list(raised.points)}, ${list(raised.paths)}]`;
    });
    return `  [${list(layout.name)}, ${layout.plateW}, ${layout.plateH}, [\n${cells.join(',\n')}\n  ]]`;
  });
  lines.push(blocks.join(',\n'), '];', '');
  return lines.join('\n');
}
