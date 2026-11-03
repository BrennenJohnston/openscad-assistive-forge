#!/usr/bin/env node
/**
 * Writes docs/guides/symbol-sheet/symbol_sheet_data.scad from the built-in
 * symbol sets, so the test-print sheet draws the same shapes the app does.
 * tests/unit/tactile-map-symbol-sets.test.js fails until it has run after a
 * set changes.
 *
 * Usage: node scripts/build-symbol-sheet.mjs
 *
 * @license GPL-3.0-or-later
 */

import { writeFileSync } from 'node:fs';
import { symbolSheetData } from '../src/js/tactile-map/symbol-sheet.js';

const OUT = 'docs/guides/symbol-sheet/symbol_sheet_data.scad';
const text = symbolSheetData();
writeFileSync(OUT, text);
console.log(`Wrote ${OUT} (${text.length} characters).`);
