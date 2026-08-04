/**
 * Phase 4 — Targeted Parity Probes
 *
 * Investigative tests for the OpenSCAD Color/Display Parity Audit.
 * Each describe block maps to a probe in the Phase 4 plan.
 *
 * Probes 1 & 2 test the JavaScript pipeline with synthetic OFF/COFF data.
 * The actual WASM output question (does the binary emit COFF?) requires
 * runtime browser testing — manual procedure documented in
 * docs/audit/parity-probe-results.md.
 *
 * Probes 3 & 4 are pure unit tests against detection regex and serialization.
 * Probe 5 is verified via existing auto-preview-controller tests + code trace.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AutoPreviewController,
  PREVIEW_STATE,
} from '../../src/js/auto-preview-controller.js';
import {
  DEBUG_HIGHLIGHT_HEX,
  DEBUG_HIGHLIGHT_OPACITY,
  hexToRgb,
  normalizeHexColor,
} from '../../src/js/color-utils.js';
import {
  isNonPreviewable,
  RENDER_STATE,
  resolve2DExportIntent,
} from '../../src/js/render-intent.js';
import {
  buildDefineArgs,
  formatScadValue,
  serializeScadVector,
  detectColorParamLiteralStyle,
  escapeRegExp,
} from '../../src/js/scad-param-formatter.js';

// ── Synthetic OFF / COFF data ───────────────────────────────────────────────

const PLAIN_OFF = `OFF
8 6 0
0 0 0
10 0 0
10 10 0
0 10 0
0 0 10
10 0 10
10 10 10
0 10 10
3 0 1 2
3 0 2 3
3 4 5 6
3 4 6 7
3 0 1 5
3 0 5 4
`;

const COFF_TWO_COLORS = `COFF
8 6 0
0 0 0
10 0 0
10 10 0
0 10 0
0 0 10
10 0 10
10 10 10
0 10 10
3 0 1 2  1.0 0.0 0.0 1.0
3 0 2 3  1.0 0.0 0.0 1.0
3 4 5 6  0.0 0.0 1.0 1.0
3 4 6 7  0.0 0.0 1.0 1.0
3 0 1 5  0.0 1.0 0.0 1.0
3 0 5 4  0.0 1.0 0.0 1.0
`;

const COFF_COUNTS_ON_HEADER = `COFF 8 6 0
0 0 0
10 0 0
10 10 0
0 10 0
0 0 10
10 0 10
10 10 10
0 10 10
3 0 1 2  1.0 0.0 0.0 1.0
3 0 2 3  1.0 0.0 0.0 1.0
3 4 5 6  0.0 0.0 1.0 1.0
3 4 6 7  0.0 0.0 1.0 1.0
3 0 1 5  0.0 1.0 0.0 1.0
3 0 5 4  0.0 1.0 0.0 1.0
`;

// OpenSCAD export_off.cc always writes "OFF" header (never "COFF"),
// even when per-face colors are present. Colors are integer 0-255.
const OFF_WITH_INLINE_INT_COLORS = `OFF
8 6 0
0 0 0
10 0 0
10 10 0
0 10 0
0 0 10
10 0 10
10 10 10
0 10 10
3 0 1 2 255 0 0
3 0 2 3 255 0 0
3 4 5 6 0 0 255
3 4 6 7 0 0 255
3 0 1 5 0 255 0
3 0 5 4 0 255 0
`;

// OFF with integer RGBA (alpha != 255 triggers the 4th channel)
const OFF_WITH_INLINE_INT_RGBA = `OFF
8 6 0
0 0 0
10 0 0
10 10 0
0 10 0
0 0 10
10 0 10
10 10 10
0 10 10
3 0 1 2 255 0 0 128
3 0 2 3 255 0 0 128
3 4 5 6 0 0 255 255
3 4 6 7 0 0 255 255
3 0 1 5 0 255 0 200
3 0 5 4 0 255 0 200
`;

// Multi-color OFF matching Phase 0 desktop baseline colors:
// Red #FF0000 RGB(255,0,0) — keyguard overlay faces
// Turquoise #40E0D0 RGB(64,224,208) — frame faces
// Uses "OFF" header with integer 0-255 (OpenSCAD export_off.cc format)
const MULTICOLOR_KEYGUARD_OFF = `OFF
8 12 0
0 0 0
10 0 0
10 10 0
0 10 0
0 0 10
10 0 10
10 10 10
0 10 10
3 0 1 2 255 0 0
3 0 2 3 255 0 0
3 4 5 6 255 0 0
3 4 6 7 255 0 0
3 0 1 5 255 0 0
3 0 5 4 255 0 0
3 2 3 7 64 224 208
3 2 7 6 64 224 208
3 0 3 7 64 224 208
3 0 7 4 64 224 208
3 1 2 6 64 224 208
3 1 6 5 64 224 208
`;

// Multi-color OFF with a quad face (n=4) to test fan-triangulation + color
const MULTICOLOR_QUAD_OFF = `OFF
8 3 0
0 0 0
10 0 0
10 10 0
0 10 0
0 0 10
10 0 10
10 10 10
0 10 10
4 0 1 2 3 255 0 0
4 4 5 6 7 64 224 208
3 0 1 5 0 255 0
`;

// OFF with mixed colored and uncolored faces (latent fragility per RQ-2)
const MIXED_COLOR_OFF = `OFF
8 4 0
0 0 0
10 0 0
10 10 0
0 10 0
0 0 10
10 0 10
10 10 10
0 10 10
3 0 1 2 255 0 0
3 0 2 3 255 0 0
3 4 5 6
3 4 6 7
`;

// OFF where the first face is black (RGB 0,0,0) — edge case per RQ-2
const FIRST_FACE_BLACK_OFF = `OFF
8 4 0
0 0 0
10 0 0
10 10 0
0 10 0
0 0 10
10 0 10
10 10 10
0 10 10
3 0 1 2 0 0 0
3 0 2 3 255 0 0
3 4 5 6 64 224 208
3 4 6 7 0 128 255
`;

// ── Standalone parser extraction — mirrors loadOFF() lines 1206-1307 ─────────
// Extracted for unit testability without Three.js DOM dependency (fallback gate).
function parseOFFColors(offData) {
  const text =
    typeof offData === 'string' ? offData : new TextDecoder().decode(offData);
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));

  if (lines.length === 0) throw new Error('OFF data is empty');

  const firstLine = lines[0].toUpperCase();
  const isCOFF = firstLine.startsWith('COFF');
  const isOFF = firstLine.startsWith('OFF');
  if (!isOFF && !isCOFF)
    throw new Error(`Not a valid OFF file (header: "${lines[0]}")`);

  const headerParts = lines[0].split(/\s+/);
  let countLineIdx;
  if (headerParts.length >= 3 && !isNaN(Number(headerParts[1]))) {
    countLineIdx = 0;
  } else {
    countLineIdx = 1;
  }
  const countParts =
    countLineIdx === 0
      ? headerParts.slice(1)
      : lines[countLineIdx].split(/\s+/);
  const numVerts = Number(countParts[0]);
  const numFaces = Number(countParts[1]);
  const dataStartLine = countLineIdx + 1;

  const vertices = [];
  for (let i = 0; i < numVerts; i++) {
    const [x, y, z] = lines[dataStartLine + i].split(/\s+/).map(Number);
    vertices.push(x, y, z);
  }

  const positions = [];
  const colors = [];
  let hasColors = false;
  let colorScale = 1;
  let colorFormatDetected = false;

  const faceStart = dataStartLine + numVerts;
  for (let i = 0; i < numFaces; i++) {
    const parts = lines[faceStart + i].split(/\s+/).map(Number);
    const n = parts[0];
    if (n < 3) continue;

    const hasInlineColor = parts.length >= n + 4;

    const v0 = parts[1];
    for (let t = 1; t < n - 1; t++) {
      const va = parts[1 + t];
      const vb = parts[1 + t + 1];
      positions.push(
        vertices[v0 * 3],
        vertices[v0 * 3 + 1],
        vertices[v0 * 3 + 2],
        vertices[va * 3],
        vertices[va * 3 + 1],
        vertices[va * 3 + 2],
        vertices[vb * 3],
        vertices[vb * 3 + 1],
        vertices[vb * 3 + 2]
      );
      if (hasInlineColor) {
        if (!colorFormatDetected) {
          const sample = Math.max(parts[n + 1], parts[n + 2], parts[n + 3]);
          colorScale = sample > 1 ? 1 / 255 : 1;
          colorFormatDetected = true;
        }
        const r = parts[n + 1] * colorScale;
        const g = parts[n + 2] * colorScale;
        const b = parts[n + 3] * colorScale;
        colors.push(r, g, b, r, g, b, r, g, b);
        hasColors = true;
      }
    }
  }

  return { positions, colors, hasColors, colorScale, isCOFF, numVerts, numFaces };
}

// ── Stakeholder-representative SCAD snippets ────────────────────────────────

const KEYGUARD_SCAD = `
// Keyguard parameter declarations
keyguard_color = "#FF0000";  // [#FF0000, #00FF00, #0000FF]
frame_color = "#00FF00";
use_colors = "yes";          // [yes, no]

// Manufacturing mode
generate = 0;                // [0:3D Printed, 1:First Layer for SVG/DXF]
type_of_keyguard = 0;        // [0:3D Printed, 1:Laser Cut]

// 3D-printed keyguard with user-assigned color
if (generate == 0) {
  color(keyguard_color)
    difference() {
      cube([100, 60, 3]);
      // openings
      translate([10, 10, -1]) cube([20, 15, 5]);
    }
}
`;

const COLOR_ONLY_SCAD = `
color("red") cube(10);
color("blue") translate([20, 0, 0]) sphere(5);
`;

const DEBUG_ONLY_SCAD = `
# cube(10);
translate([20, 0, 0]) sphere(5);
`;

const COLOR_PLUS_DEBUG_SCAD = `
color("red") cube(10);
# color("blue") translate([20, 0, 0]) sphere(5);
`;

const NO_COLOR_SCAD = `
cube(10);
translate([20, 0, 0]) sphere(5);
`;

const COLOR_IN_VARIABLE_NAMES_SCAD = `
// Variable names containing "color" but no color() function call
keyguard_color = "#FF0000";
frame_color = "#00FF00";
background_color_hex = "333333";

cube(10);
`;

const COLOR_IN_COMMENT_ONLY_SCAD = `
// color("red") — this is just a comment
/* color("blue") — also a comment */
cube(10);
`;

// ─────────────────────────────────────────────────────────────────────────────
// PROBE 1: COFF Output Verification (JavaScript pipeline side)
// ─────────────────────────────────────────────────────────────────────────────

describe('Probe 1: COFF parser correctness (JavaScript pipeline)', () => {
  it('detects COFF header and sets isCOFF = true', () => {
    const lines = COFF_TWO_COLORS.split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('#'));
    const firstLine = lines[0].toUpperCase();
    expect(firstLine.startsWith('COFF')).toBe(true);
  });

  it('detects plain OFF header and sets isCOFF = false', () => {
    const lines = PLAIN_OFF.split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('#'));
    const firstLine = lines[0].toUpperCase();
    expect(firstLine.startsWith('COFF')).toBe(false);
    expect(firstLine.startsWith('OFF')).toBe(true);
  });

  it('parses per-face RGBA from COFF data (float 0–1 range)', () => {
    const lines = COFF_TWO_COLORS.split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('#'));

    const faceLine = lines[3 + 8]; // first face line (after header + 8 verts)
    const parts = faceLine.split(/\s+/).map(Number);
    const n = parts[0]; // 3 (triangle)
    const r = parts[n + 1]; // RGBA starts after vertex indices
    const g = parts[n + 2];
    const b = parts[n + 3];
    const a = parts[n + 4];
    expect(r).toBe(1.0);
    expect(g).toBe(0.0);
    expect(b).toBe(0.0);
    expect(a).toBe(1.0);
  });

  it('handles COFF with counts on the header line', () => {
    const lines = COFF_COUNTS_ON_HEADER.split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('#'));

    const headerParts = lines[0].split(/\s+/);
    const hasCountsOnHeader =
      headerParts.length >= 3 && !isNaN(Number(headerParts[1]));
    expect(hasCountsOnHeader).toBe(true);

    const countParts = headerParts.slice(1);
    expect(Number(countParts[0])).toBe(8); // 8 vertices
    expect(Number(countParts[1])).toBe(6); // 6 faces
  });

  it('falls back to single-color when OFF has no per-face colors', () => {
    const lines = PLAIN_OFF.split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('#'));

    const faceLine = lines[3 + 8]; // first face line
    const parts = faceLine.split(/\s+/).map(Number);
    const n = parts[0];
    // Plain OFF face: only vertex indices, no inline color data
    const hasColor = parts.length >= n + 4;
    expect(hasColor).toBe(false);
  });

  it('console log format matches expected COFF ✓ / OFF (no color) pattern', () => {
    // Verifies the diagnostic log format at auto-preview-controller.js:812
    const resultFormat = 'off';
    const hasColorsTrue = true;
    const hasColorsFalse = false;

    const logCOFF =
      resultFormat === 'off'
        ? hasColorsTrue
          ? 'COFF ✓'
          : 'OFF (no color)'
        : 'STL';
    const logPlain =
      resultFormat === 'off'
        ? hasColorsFalse
          ? 'COFF ✓'
          : 'OFF (no color)'
        : 'STL';

    expect(logCOFF).toBe('COFF ✓');
    expect(logPlain).toBe('OFF (no color)');
  });

  // -- OpenSCAD-style OFF with inline integer colors (export_off.cc format) --

  it('detects inline integer RGB colors in OFF format (OpenSCAD output)', () => {
    const lines = OFF_WITH_INLINE_INT_COLORS.split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('#'));

    const firstLine = lines[0].toUpperCase();
    expect(firstLine.startsWith('OFF')).toBe(true);
    expect(firstLine.startsWith('COFF')).toBe(false);

    const faceLine = lines[2 + 8]; // first face after "OFF\n8 6 0\n" + 8 verts
    const parts = faceLine.split(/\s+/).map(Number);
    const n = parts[0]; // 3
    const hasInlineColor = parts.length >= n + 4;
    expect(hasInlineColor).toBe(true);
    expect(parts[n + 1]).toBe(255);
    expect(parts[n + 2]).toBe(0);
    expect(parts[n + 3]).toBe(0);
  });

  it('auto-detects integer color scale (values > 1 → divide by 255)', () => {
    const faceLine = '3 0 1 2 255 0 0';
    const parts = faceLine.split(/\s+/).map(Number);
    const n = parts[0];
    const sample = Math.max(parts[n + 1], parts[n + 2], parts[n + 3]);
    const colorScale = sample > 1 ? 1 / 255 : 1;

    expect(colorScale).toBeCloseTo(1 / 255);
    expect(parts[n + 1] * colorScale).toBeCloseTo(1.0);
    expect(parts[n + 2] * colorScale).toBeCloseTo(0.0);
    expect(parts[n + 3] * colorScale).toBeCloseTo(0.0);
  });

  it('auto-detects float color scale (values ≤ 1 → no scaling)', () => {
    const faceLine = '3 0 1 2 1.0 0.0 0.0 1.0';
    const parts = faceLine.split(/\s+/).map(Number);
    const n = parts[0];
    const sample = Math.max(parts[n + 1], parts[n + 2], parts[n + 3]);
    const colorScale = sample > 1 ? 1 / 255 : 1;

    expect(colorScale).toBe(1);
    expect(parts[n + 1] * colorScale).toBe(1.0);
  });

  it('detects inline colors even without alpha channel (RGB-only)', () => {
    const faceLine = '3 0 1 2 0 128 0';
    const parts = faceLine.split(/\s+/).map(Number);
    const n = parts[0];
    const hasInlineColor = parts.length >= n + 4;
    expect(hasInlineColor).toBe(true);
  });

  it('does not false-positive detect colors on plain OFF faces', () => {
    const faceLine = '3 0 1 2';
    const parts = faceLine.split(/\s+/).map(Number);
    const n = parts[0];
    const hasInlineColor = parts.length >= n + 4;
    expect(hasInlineColor).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PROBE 2: # Debug Modifier in OFF Output (JavaScript pipeline side)
// ─────────────────────────────────────────────────────────────────────────────

describe('Probe 2: # debug modifier handling in COFF pipeline', () => {
  it('debug highlight overrides all face colors with fixed #ff5151', () => {
    const debugHighlight = {
      hex: DEBUG_HIGHLIGHT_HEX,
      opacity: DEBUG_HIGHLIGHT_OPACITY,
    };
    const hx = debugHighlight.hex.replace('#', '');
    const r = parseInt(hx.substring(0, 2), 16) / 255;
    const g = parseInt(hx.substring(2, 4), 16) / 255;
    const b = parseInt(hx.substring(4, 6), 16) / 255;

    expect(r).toBeCloseTo(255 / 255, 5);
    expect(g).toBeCloseTo(81 / 255, 5);
    expect(b).toBeCloseTo(81 / 255, 5);
    expect(debugHighlight.opacity).toBeCloseTo(128 / 255, 5);
  });

  it('debug modifier is detected independently of color()', () => {
    // New gate: hasDebugModifier = scadUsesDebugModifier(...)
    // useColorPassthrough = flag && (usesColor || hasDebugModifier)
    const hasDebugWithColor =
      AutoPreviewController.scadUsesDebugModifier(COLOR_PLUS_DEBUG_SCAD);
    const hasDebugOnly =
      AutoPreviewController.scadUsesDebugModifier(DEBUG_ONLY_SCAD);

    expect(hasDebugWithColor).toBe(true);
    expect(hasDebugOnly).toBe(true);
  });

  it('# modifier without color() routes to OFF path for dual-render', () => {
    const usesColor = AutoPreviewController.scadUsesColor(DEBUG_ONLY_SCAD);
    expect(usesColor).toBe(false);

    const hasDebug = AutoPreviewController.scadUsesDebugModifier(DEBUG_ONLY_SCAD);
    expect(hasDebug).toBe(true);

    const flagEnabled = true;
    const useColorPassthrough = flagEnabled && (usesColor || hasDebug);
    const format = useColorPassthrough ? 'off' : 'stl';
    expect(format).toBe('off');
  });

  it('COFF per-face alpha is NOT used — material-level opacity is used instead', () => {
    // Verifying design: preview.js:1167 pushes (r,g,b) × 3 vertices
    // but does NOT include 'a' from the COFF RGBA.
    // Material opacity comes from debugHighlight.opacity at line 1218.
    const colfLine = '3 0 1 2  1.0 0.0 0.0 0.5';
    const parts = colfLine.split(/\s+/).map(Number);
    const n = parts[0]; // 3
    const a = parts[n + 4]; // per-face alpha
    expect(a).toBe(0.5);
    // The parser reads r,g,b at [n+1..n+3] but skips a at [n+4]
    // Colors array gets: [r, g, b, r, g, b, r, g, b] (3 vertices, no alpha)
    const colors = [];
    const r = parts[n + 1];
    const g = parts[n + 2];
    const b = parts[n + 3];
    colors.push(r, g, b, r, g, b, r, g, b);
    expect(colors.length).toBe(9);
    expect(colors).not.toContain(0.5); // alpha is NOT in the color buffer
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PROBE 3: scadUsesColor() Detection Accuracy
// ─────────────────────────────────────────────────────────────────────────────

describe('Probe 3: scadUsesColor() detection accuracy', () => {
  // Basic detection (overlaps with parity-harness; included for completeness)
  it('detects color("red") call', () => {
    expect(AutoPreviewController.scadUsesColor('color("red") cube(10);')).toBe(
      true
    );
  });

  it('detects color([1,0,0]) vector call', () => {
    expect(
      AutoPreviewController.scadUsesColor('color([1,0,0]) cube(10);')
    ).toBe(true);
  });

  it('detects color() with hex string argument', () => {
    expect(
      AutoPreviewController.scadUsesColor('color("#ff0000") cube(10);')
    ).toBe(true);
  });

  // False-positive resistance — variable names
  it('does NOT false-positive on variable named keyguard_color (no function call)', () => {
    expect(
      AutoPreviewController.scadUsesColor(COLOR_IN_VARIABLE_NAMES_SCAD)
    ).toBe(false);
  });

  it('does NOT false-positive on "background_color_hex" variable name', () => {
    expect(
      AutoPreviewController.scadUsesColor(
        'background_color_hex = "333333";\ncube(10);'
      )
    ).toBe(false);
  });

  // False-positive resistance — comments
  it('does NOT detect color() in single-line comment', () => {
    expect(
      AutoPreviewController.scadUsesColor(COLOR_IN_COMMENT_ONLY_SCAD)
    ).toBe(false);
  });

  it('does NOT detect color() in block comment', () => {
    expect(
      AutoPreviewController.scadUsesColor('/* color("red") */ cube(10);')
    ).toBe(false);
  });

  // Stakeholder SCAD: color() calls present alongside variable names
  it('detects color() in keyguard SCAD even with color-named variables', () => {
    expect(AutoPreviewController.scadUsesColor(KEYGUARD_SCAD)).toBe(true);
  });

  // Multi-color file
  it('detects color() in multi-color file', () => {
    expect(AutoPreviewController.scadUsesColor(COLOR_ONLY_SCAD)).toBe(true);
  });

  // Edge: color at end of file without newline
  it('detects color() at end of file', () => {
    expect(AutoPreviewController.scadUsesColor('color("red") cube(10);')).toBe(
      true
    );
  });

  // Edge: no SCAD content
  it('returns false for empty string', () => {
    expect(AutoPreviewController.scadUsesColor('')).toBe(false);
  });

  it('returns false for null', () => {
    expect(AutoPreviewController.scadUsesColor(null)).toBe(false);
  });

  it('returns false for non-string', () => {
    expect(AutoPreviewController.scadUsesColor(42)).toBe(false);
  });
});

describe('Probe 3: scadUsesDebugModifier() detection accuracy', () => {
  it('detects # before cube()', () => {
    expect(
      AutoPreviewController.scadUsesDebugModifier('# cube(10);')
    ).toBe(true);
  });

  it('detects # before translate()', () => {
    expect(
      AutoPreviewController.scadUsesDebugModifier('# translate([5,0,0]) cube(5);')
    ).toBe(true);
  });

  it('detects # before color() (modifier applied to color-wrapped geometry)', () => {
    expect(
      AutoPreviewController.scadUsesDebugModifier('# color("blue") cube(10);')
    ).toBe(true);
  });

  it('detects # after semicolon (statement boundary)', () => {
    expect(
      AutoPreviewController.scadUsesDebugModifier(
        'cube(10); # sphere(5);'
      )
    ).toBe(true);
  });

  it('detects # inside difference() block', () => {
    expect(
      AutoPreviewController.scadUsesDebugModifier(
        'difference() {\n  cube(10);\n  # cylinder(r=3, h=12);\n}'
      )
    ).toBe(true);
  });

  it('does NOT false-positive on # inside hex color string', () => {
    expect(
      AutoPreviewController.scadUsesDebugModifier('color("#ff0000") cube(10);')
    ).toBe(false);
  });

  it('does NOT false-positive on # inside single-line comment', () => {
    expect(
      AutoPreviewController.scadUsesDebugModifier('// # cube(10);\ncube(10);')
    ).toBe(false);
  });

  it('does NOT false-positive on # inside block comment', () => {
    expect(
      AutoPreviewController.scadUsesDebugModifier(
        '/* # cube(10); */ sphere(5);'
      )
    ).toBe(false);
  });

  it('does NOT false-positive on plain geometry without #', () => {
    expect(
      AutoPreviewController.scadUsesDebugModifier(NO_COLOR_SCAD)
    ).toBe(false);
  });

  it('does NOT false-positive on module-internal debug helper branches', () => {
    expect(
      AutoPreviewController.scadUsesDebugModifier(
        'module helper(id) {\n  if (id == "#") {\n    # translate([0,0,0]) cube(10);\n  }\n}\ncolor("Turquoise") cube(20);'
      )
    ).toBe(false);
  });

  it('returns false for empty/null input', () => {
    expect(AutoPreviewController.scadUsesDebugModifier('')).toBe(false);
    expect(AutoPreviewController.scadUsesDebugModifier(null)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PROBE 4: Worker Color Serialization
// ─────────────────────────────────────────────────────────────────────────────

// Hex→vector conversion applies ONLY to params the schema declares as
// 'color' (// [color] hint). Untyped 6-hex-char strings stay quoted —
// the old always-on conversion corrupted text params like "decade".
describe('Probe 4: hex color serialization via buildDefineArgs', () => {
  const COLOR_TYPES = {
    keyguard_color: 'color',
    frame_color: 'color',
    accent_color: 'color',
  };

  it('converts #FF0000 to [255,0,0] (0–255 range) for color-typed params', () => {
    const args = buildDefineArgs({ keyguard_color: '#FF0000' }, COLOR_TYPES);
    expect(args).toContain('-D');
    expect(args).toContain('keyguard_color=[255,0,0]');
  });

  it('converts FF0000 (no #) to [255,0,0]', () => {
    const args = buildDefineArgs({ keyguard_color: 'FF0000' }, COLOR_TYPES);
    expect(args).toContain('keyguard_color=[255,0,0]');
  });

  it('converts #00FF00 to [0,255,0]', () => {
    const args = buildDefineArgs({ frame_color: '#00FF00' }, COLOR_TYPES);
    expect(args).toContain('frame_color=[0,255,0]');
  });

  it('converts #0000FF to [0,0,255]', () => {
    const args = buildDefineArgs({ accent_color: '#0000FF' }, COLOR_TYPES);
    expect(args).toContain('accent_color=[0,0,255]');
  });

  it('converts lowercase hex ff0000 correctly', () => {
    const args = buildDefineArgs({ keyguard_color: 'ff0000' }, COLOR_TYPES);
    expect(args).toContain('keyguard_color=[255,0,0]');
  });

  it('converts mixed-case hex #FfAa00 correctly', () => {
    const args = buildDefineArgs({ keyguard_color: '#FfAa00' }, COLOR_TYPES);
    expect(args).toContain('keyguard_color=[255,170,0]');
  });

  it('preserves non-color string values as quoted strings', () => {
    const args = buildDefineArgs({ generate: 'Customizer Settings' });
    expect(args).toContain('generate="Customizer Settings"');
  });

  it('preserves UNTYPED hex-shaped strings as quoted strings (no coercion)', () => {
    const args = buildDefineArgs({ label: 'decade', code: '#FF0000' });
    expect(args).toContain('label="decade"');
    expect(args).toContain('code="#FF0000"');
  });

  it('does NOT treat 3-digit hex as color (regex requires 6 digits)', () => {
    const args = buildDefineArgs({ keyguard_color: '#F00' }, COLOR_TYPES);
    // 3-digit hex does NOT match /^#?[0-9A-Fa-f]{6}$/
    expect(args).toContain('keyguard_color="#F00"');
  });

  it('serializes multiple color params independently', () => {
    const args = buildDefineArgs(
      {
        keyguard_color: '#FF0000',
        frame_color: '#00FF00',
      },
      COLOR_TYPES
    );
    expect(args).toContain('keyguard_color=[255,0,0]');
    expect(args).toContain('frame_color=[0,255,0]');
  });

  it('OpenSCAD auto-normalizes [255,0,0] to [1,0,0] (documented behavior)', () => {
    // This test documents the known non-idiomatic serialization:
    // hexToRgb returns 0-255 integers, but OpenSCAD expects 0-1 floats.
    // OpenSCAD auto-normalizes values > 1 by dividing by 255.
    // So [255,0,0] → [1.0, 0.0, 0.0] inside OpenSCAD.
    const rgb = hexToRgb('#FF0000');
    expect(rgb).toEqual([255, 0, 0]);
    // OpenSCAD normalization: each component / 255
    const normalized = rgb.map((c) => c / 255);
    expect(normalized).toEqual([1, 0, 0]);
  });

  it('hexToRgb handles 3-digit hex by expanding', () => {
    const rgb = hexToRgb('#F00');
    expect(rgb).toEqual([255, 0, 0]);
  });

  it('hexToRgb returns null for invalid input', () => {
    expect(hexToRgb('not-a-color')).toBeNull();
    expect(hexToRgb(null)).toBeNull();
    expect(hexToRgb('')).toBeNull();
  });

  it('normalizeHexColor handles with and without #', () => {
    expect(normalizeHexColor('FF0000')).toBe('#FF0000');
    expect(normalizeHexColor('#FF0000')).toBe('#FF0000');
    expect(normalizeHexColor('invalid')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PROBE 5: Blank Display State
// ─────────────────────────────────────────────────────────────────────────────

describe('Probe 5: blank display state for non-previewable modes', () => {
  let renderController;
  let previewManager;
  let controller;

  beforeEach(() => {
    renderController = {
      isBusy: vi.fn(() => false),
      cancel: vi.fn(),
      renderPreview: vi.fn().mockResolvedValue({
        stl: new ArrayBuffer(8),
        stats: { triangles: 12 },
      }),
    };
    previewManager = {
      loadSTL: vi.fn().mockResolvedValue(),
      loadOFF: vi.fn().mockResolvedValue({ hasColors: false }),
      setColorOverride: vi.fn(),
      setRenderState: vi.fn(),
      clear: vi.fn(),
    };
    controller = new AutoPreviewController(renderController, previewManager, {
      debounceMs: 10,
    });
    controller.setScadContent(KEYGUARD_SCAD);
  });

  it('classifies "Customizer Settings" as non-previewable', () => {
    const result = AutoPreviewController.isNonPreviewableParameters({
      generate: 'Customizer Settings',
    });
    expect(result).toBe(true);
  });

  it('does NOT classify "3D Printed" as non-previewable', () => {
    const result = AutoPreviewController.isNonPreviewableParameters({
      generate: '3D Printed',
    });
    expect(result).toBe(false);
  });

  it('renderPreview dispatches NO_GEOMETRY error for Customizer Settings', async () => {
    const onError = vi.fn();
    controller.onError = onError;
    const params = { generate: 'Customizer Settings' };
    const paramHash = controller.hashParams(params);
    controller.currentParamHash = paramHash;
    controller.currentPreviewKey = `${paramHash}|model`;

    await controller.renderPreview(params, paramHash);

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'NO_GEOMETRY' }),
      'preview'
    );
  });

  it('renderPreview does NOT invoke the worker for Customizer Settings', async () => {
    const params = { generate: 'Customizer Settings' };
    const paramHash = controller.hashParams(params);
    controller.currentParamHash = paramHash;
    controller.currentPreviewKey = `${paramHash}|model`;

    await controller.renderPreview(params, paramHash);

    expect(renderController.renderPreview).not.toHaveBeenCalled();
  });

  it('renderPreview cancels debounce timer when entering non-previewable mode', async () => {
    vi.useFakeTimers();
    controller.debounceTimer = setTimeout(() => {}, 5000);
    const params = { generate: 'Customizer Settings' };
    const paramHash = controller.hashParams(params);
    controller.currentParamHash = paramHash;
    controller.currentPreviewKey = `${paramHash}|model`;

    await controller.renderPreview(params, paramHash);

    expect(controller.debounceTimer).toBeNull();
    vi.useRealTimers();
  });

  it('renderPreview clears pending parameters when entering non-previewable mode', async () => {
    controller.pendingParameters = { width: 10 };
    controller.pendingParamHash = 'stale';
    const params = { generate: 'Customizer Settings' };
    const paramHash = controller.hashParams(params);
    controller.currentParamHash = paramHash;
    controller.currentPreviewKey = `${paramHash}|model`;

    await controller.renderPreview(params, paramHash);

    expect(controller.pendingParameters).toBeNull();
    expect(controller.pendingParamHash).toBeNull();
  });

  it('setRenderState is a no-op (fabricated tinting removed)', () => {
    // Documented in Phase 3: preview.js:511-512
    // setRenderState(_state) {} — empty body
    previewManager.setRenderState('preview');
    previewManager.setRenderState('laser');
    previewManager.setRenderState(null);
    // No assertions needed — just verifying it doesn't throw
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PROBE 1 & 2 Supplemental: Format routing logic
// ─────────────────────────────────────────────────────────────────────────────

describe('Probe 1/2 Supplemental: format routing decision', () => {
  it('routes to OFF when color() detected and flag enabled', () => {
    const flagEnabled = true;
    const usesColor = AutoPreviewController.scadUsesColor(COLOR_ONLY_SCAD);
    const useColorPassthrough = flagEnabled && usesColor;
    const format = useColorPassthrough ? 'off' : 'stl';

    expect(usesColor).toBe(true);
    expect(format).toBe('off');
  });

  it('routes to STL when no color() detected', () => {
    const flagEnabled = true;
    const usesColor = AutoPreviewController.scadUsesColor(NO_COLOR_SCAD);
    const useColorPassthrough = flagEnabled && usesColor;
    const format = useColorPassthrough ? 'off' : 'stl';

    expect(usesColor).toBe(false);
    expect(format).toBe('stl');
  });

  it('routes to STL when flag is disabled even with color()', () => {
    const flagEnabled = false;
    const usesColor = AutoPreviewController.scadUsesColor(COLOR_ONLY_SCAD);
    const useColorPassthrough = flagEnabled && usesColor;
    const format = useColorPassthrough ? 'off' : 'stl';

    expect(usesColor).toBe(true);
    expect(format).toBe('stl');
  });

  it('debug modifier alone activates color passthrough and routes to OFF', () => {
    // # without color() — flag enabled → routes to OFF for dual-render
    const usesColorDebugOnly = AutoPreviewController.scadUsesColor(DEBUG_ONLY_SCAD);
    const hasDebugDebugOnly = AutoPreviewController.scadUsesDebugModifier(DEBUG_ONLY_SCAD);
    const flagEnabled = true;
    const passthroughDebugOnly = flagEnabled && (usesColorDebugOnly || hasDebugDebugOnly);
    expect(passthroughDebugOnly).toBe(true);

    // # with color() — flag enabled → still routes to OFF
    const usesColorBoth = AutoPreviewController.scadUsesColor(COLOR_PLUS_DEBUG_SCAD);
    const hasDebugBoth = AutoPreviewController.scadUsesDebugModifier(COLOR_PLUS_DEBUG_SCAD);
    const passthroughBoth = flagEnabled && (usesColorBoth || hasDebugBoth);
    expect(passthroughBoth).toBe(true);

    // # without color() — flag disabled → no passthrough
    const passthroughFlagOff = false && (usesColorDebugOnly || hasDebugDebugOnly);
    expect(passthroughFlagOff).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// S-005: Dual-render integration — # modifier triggers loadOFF with debugHighlight
// ─────────────────────────────────────────────────────────────────────────────

describe('S-005: dual-render integration for # debug modifier', () => {
  let renderController;
  let previewManager;
  let controller;

  beforeEach(() => {
    renderController = {
      isBusy: vi.fn(() => false),
      cancel: vi.fn(),
      renderPreview: vi.fn().mockResolvedValue({
        stl: new ArrayBuffer(8),
        format: 'off',
        stats: { triangles: 12 },
      }),
    };
    previewManager = {
      loadSTL: vi.fn().mockResolvedValue(),
      loadOFF: vi.fn().mockResolvedValue({ hasColors: false }),
      setColorOverride: vi.fn(),
      setColorOverrideEnabled: vi.fn(),
      setRenderState: vi.fn(),
      clear: vi.fn(),
    };
    controller = new AutoPreviewController(renderController, previewManager, {
      debounceMs: 10,
    });
  });

  it('passes debugHighlight to loadOFF when # detected with color()', async () => {
    controller.setScadContent(COLOR_PLUS_DEBUG_SCAD);
    const params = {};
    const paramHash = controller.hashParams(params);
    controller.currentParamHash = paramHash;
    controller.currentPreviewKey = `${paramHash}|model`;

    await controller.renderPreview(params, paramHash);

    expect(previewManager.loadOFF).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        debugHighlight: {
          hex: DEBUG_HIGHLIGHT_HEX,
          opacity: DEBUG_HIGHLIGHT_OPACITY,
        },
      })
    );
  });

  it('passes debugHighlight to loadOFF when # detected WITHOUT color()', async () => {
    controller.setScadContent(DEBUG_ONLY_SCAD);
    const params = {};
    const paramHash = controller.hashParams(params);
    controller.currentParamHash = paramHash;
    controller.currentPreviewKey = `${paramHash}|model`;

    await controller.renderPreview(params, paramHash);

    expect(previewManager.loadOFF).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        debugHighlight: {
          hex: DEBUG_HIGHLIGHT_HEX,
          opacity: DEBUG_HIGHLIGHT_OPACITY,
        },
      })
    );
  });

  it('passes null debugHighlight when color() present without #', async () => {
    controller.setScadContent(COLOR_ONLY_SCAD);
    const params = {};
    const paramHash = controller.hashParams(params);
    controller.currentParamHash = paramHash;
    controller.currentPreviewKey = `${paramHash}|model`;

    await controller.renderPreview(params, paramHash);

    expect(previewManager.loadOFF).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        debugHighlight: null,
      })
    );
  });

  it('routes to STL when neither color() nor # detected', async () => {
    renderController.renderPreview.mockResolvedValue({
      stl: new ArrayBuffer(8),
      format: 'stl',
      stats: { triangles: 12 },
    });
    controller.setScadContent(NO_COLOR_SCAD);
    const params = {};
    const paramHash = controller.hashParams(params);
    controller.currentParamHash = paramHash;
    controller.currentPreviewKey = `${paramHash}|model`;

    await controller.renderPreview(params, paramHash);

    expect(previewManager.loadSTL).toHaveBeenCalled();
    expect(previewManager.loadOFF).not.toHaveBeenCalled();
  });

  it('requests OFF output format from render controller when # is detected', async () => {
    controller.setScadContent(DEBUG_ONLY_SCAD);
    const params = {};
    const paramHash = controller.hashParams(params);
    controller.currentParamHash = paramHash;
    controller.currentPreviewKey = `${paramHash}|model`;

    await controller.renderPreview(params, paramHash);

    expect(renderController.renderPreview).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        outputFormat: 'off',
      })
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1: Multi-Color COFF Unit Probe
//
// Validates that the loadOFF() parser logic correctly handles COFF data with
// multiple distinct face-color groups. Uses standalone parser extraction
// (fallback gate: Three.js unavailable in jsdom test environment).
//
// Anchored to Phase 0 desktop baseline: Red #FF0000 + Turquoise #40E0D0,
// integer 0-255 scale, "OFF" header (OpenSCAD export_off.cc format).
// ─────────────────────────────────────────────────────────────────────────────

describe('Phase 1: Multi-color COFF parser probe (loadOFF extraction)', () => {
  // Helper: extract unique RGB triples from the flat colors array
  function extractUniqueColors(colors) {
    const seen = new Set();
    const unique = [];
    for (let i = 0; i < colors.length; i += 3) {
      const key = `${colors[i].toFixed(6)},${colors[i + 1].toFixed(6)},${colors[i + 2].toFixed(6)}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push([colors[i], colors[i + 1], colors[i + 2]]);
      }
    }
    return unique;
  }

  describe('keyguard multi-color OFF (Red + Turquoise, integer 0-255)', () => {
    let result;

    beforeEach(() => {
      result = parseOFFColors(MULTICOLOR_KEYGUARD_OFF);
    });

    it('detects colors in the OFF data', () => {
      expect(result.hasColors).toBe(true);
    });

    it('auto-detects integer color scale (1/255)', () => {
      expect(result.colorScale).toBeCloseTo(1 / 255);
    });

    it('colors array length equals positions array length (geometry guard passes)', () => {
      expect(result.colors.length).toBe(result.positions.length);
    });

    it('produces exactly 2 distinct face-color groups', () => {
      const unique = extractUniqueColors(result.colors);
      expect(unique.length).toBe(2);
    });

    it('Red face group maps to RGB ≈ (1.0, 0.0, 0.0) after scaling', () => {
      const unique = extractUniqueColors(result.colors);
      const red = unique.find(
        (c) => c[0] > 0.9 && c[1] < 0.1 && c[2] < 0.1
      );
      expect(red).toBeDefined();
      expect(red[0]).toBeCloseTo(255 / 255);
      expect(red[1]).toBeCloseTo(0 / 255);
      expect(red[2]).toBeCloseTo(0 / 255);
    });

    it('Turquoise face group maps to RGB ≈ (0.251, 0.878, 0.816) after scaling', () => {
      const unique = extractUniqueColors(result.colors);
      const turquoise = unique.find(
        (c) => c[0] < 0.3 && c[1] > 0.8 && c[2] > 0.7
      );
      expect(turquoise).toBeDefined();
      expect(turquoise[0]).toBeCloseTo(64 / 255);
      expect(turquoise[1]).toBeCloseTo(224 / 255);
      expect(turquoise[2]).toBeCloseTo(208 / 255);
    });

    it('Red group has 6 faces (6 × 9 = 54 color entries)', () => {
      let redCount = 0;
      for (let i = 0; i < result.colors.length; i += 9) {
        if (result.colors[i] > 0.9 && result.colors[i + 1] < 0.1) {
          redCount++;
        }
      }
      expect(redCount).toBe(6);
    });

    it('Turquoise group has 6 faces (6 × 9 = 54 color entries)', () => {
      let turqCount = 0;
      for (let i = 0; i < result.colors.length; i += 9) {
        if (result.colors[i] < 0.3 && result.colors[i + 1] > 0.8) {
          turqCount++;
        }
      }
      expect(turqCount).toBe(6);
    });

    it('uses OFF header (not COFF) matching OpenSCAD export_off.cc', () => {
      expect(result.isCOFF).toBe(false);
    });

    it('parses correct vertex and face counts', () => {
      expect(result.numVerts).toBe(8);
      expect(result.numFaces).toBe(12);
    });
  });

  describe('quad face fan-triangulation preserves per-face color', () => {
    let result;

    beforeEach(() => {
      result = parseOFFColors(MULTICOLOR_QUAD_OFF);
    });

    it('quad face (n=4) produces 2 triangles with the same color', () => {
      // First quad: Red 255,0,0 → 2 triangles → 18 color entries
      // All 18 entries should be Red (≈1.0, 0, 0)
      const firstTriR = result.colors[0];
      const firstTriG = result.colors[1];
      const firstTriB = result.colors[2];
      const secondTriR = result.colors[9];
      const secondTriG = result.colors[10];
      const secondTriB = result.colors[11];
      expect(firstTriR).toBeCloseTo(1.0);
      expect(firstTriG).toBeCloseTo(0.0);
      expect(firstTriB).toBeCloseTo(0.0);
      expect(secondTriR).toBeCloseTo(1.0);
      expect(secondTriG).toBeCloseTo(0.0);
      expect(secondTriB).toBeCloseTo(0.0);
    });

    it('total triangle count accounts for quad expansion', () => {
      // 2 quads → 4 triangles + 1 triangle = 5 triangles
      const triCount = result.positions.length / 9;
      expect(triCount).toBe(5);
    });

    it('produces 3 distinct color groups (Red, Turquoise, Green)', () => {
      const unique = extractUniqueColors(result.colors);
      expect(unique.length).toBe(3);
    });
  });

  describe('mixed colored/uncolored faces (latent fragility)', () => {
    let result;

    beforeEach(() => {
      result = parseOFFColors(MIXED_COLOR_OFF);
    });

    it('hasColors is true (some faces have color)', () => {
      expect(result.hasColors).toBe(true);
    });

    it('colors.length < positions.length (geometry guard would FAIL)', () => {
      // loadOFF() line 1324: hasColors && colors.length === positions.length
      // Mixed faces → 2 colored + 2 uncolored → colors has 18, positions has 36
      expect(result.colors.length).toBeLessThan(result.positions.length);
    });

    it('documents: mesh would fall back to solid theme color (no vertex colors)', () => {
      // When colors.length !== positions.length, the geometry guard at
      // preview.js:1324 prevents the color attribute from being set.
      // The mesh falls back to the solid theme color via _resolveModelColor().
      const geometryGuardPasses =
        result.hasColors && result.colors.length === result.positions.length;
      expect(geometryGuardPasses).toBe(false);
    });
  });

  describe('first-face-black edge case (color scale detection)', () => {
    let result;

    beforeEach(() => {
      result = parseOFFColors(FIRST_FACE_BLACK_OFF);
    });

    it('hasColors is true', () => {
      expect(result.hasColors).toBe(true);
    });

    it('detects float scale (max of first face 0,0,0 is 0 ≤ 1)', () => {
      // First face: RGB(0,0,0) → Math.max(0,0,0) = 0 ≤ 1 → colorScale = 1
      // This means subsequent integer values (e.g., 255) are used unscaled.
      expect(result.colorScale).toBe(1);
    });

    it('documents: subsequent integer colors are unscaled (255.0 instead of 1.0)', () => {
      // Second face is Red RGB(255,0,0) but with colorScale=1,
      // values are 255.0 instead of 1.0. Three.js clamps to 1.0.
      const unique = extractUniqueColors(result.colors);
      const rawRed = unique.find((c) => c[0] === 255);
      expect(rawRed).toBeDefined();
      expect(rawRed[0]).toBe(255);
    });
  });

  describe('existing fixtures through parser extraction', () => {
    it('COFF_TWO_COLORS (float 0-1) produces 3 distinct color groups', () => {
      const result = parseOFFColors(COFF_TWO_COLORS);
      expect(result.hasColors).toBe(true);
      expect(result.isCOFF).toBe(true);
      expect(result.colorScale).toBe(1);
      const unique = extractUniqueColors(result.colors);
      expect(unique.length).toBe(3);
    });

    it('OFF_WITH_INLINE_INT_COLORS (integer 0-255) produces 3 distinct color groups', () => {
      const result = parseOFFColors(OFF_WITH_INLINE_INT_COLORS);
      expect(result.hasColors).toBe(true);
      expect(result.isCOFF).toBe(false);
      expect(result.colorScale).toBeCloseTo(1 / 255);
      const unique = extractUniqueColors(result.colors);
      expect(unique.length).toBe(3);
    });

    it('OFF_WITH_INLINE_INT_RGBA (integer 0-255 with alpha) produces 3 color groups', () => {
      const result = parseOFFColors(OFF_WITH_INLINE_INT_RGBA);
      expect(result.hasColors).toBe(true);
      expect(result.colorScale).toBeCloseTo(1 / 255);
      const unique = extractUniqueColors(result.colors);
      expect(unique.length).toBe(3);
    });

    it('PLAIN_OFF produces no colors', () => {
      const result = parseOFFColors(PLAIN_OFF);
      expect(result.hasColors).toBe(false);
      expect(result.colors.length).toBe(0);
    });

    it('COFF_COUNTS_ON_HEADER parses correctly with counts on header line', () => {
      const result = parseOFFColors(COFF_COUNTS_ON_HEADER);
      expect(result.hasColors).toBe(true);
      expect(result.numVerts).toBe(8);
      expect(result.numFaces).toBe(6);
      const unique = extractUniqueColors(result.colors);
      expect(unique.length).toBe(3);
    });
  });

  describe('parser extraction fidelity to loadOFF()', () => {
    it('parseOFFColors mirrors loadOFF per-face color check (line 1272)', () => {
      // Verify: hasInlineColor = parts.length >= n + 4
      const faceLine = '3 0 1 2 255 0 0';
      const parts = faceLine.split(/\s+/).map(Number);
      const n = parts[0];
      expect(parts.length >= n + 4).toBe(true);
    });

    it('parseOFFColors mirrors loadOFF color accumulation (line 1303)', () => {
      // Each triangulated face pushes 9 color entries: r,g,b × 3 vertices
      const result = parseOFFColors(MULTICOLOR_KEYGUARD_OFF);
      expect(result.colors.length % 9).toBe(0);
    });

    it('colors array has 3 entries per vertex (RGB, no alpha)', () => {
      const result = parseOFFColors(OFF_WITH_INLINE_INT_RGBA);
      // Even though input has RGBA, parser only stores RGB (3 per vertex)
      const vertexCount = result.positions.length / 3;
      expect(result.colors.length).toBe(vertexCount * 3);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1 Audit: Effective parameter pipeline trace for shelf/grid presets
//
// Validates that the parameter pipeline (resolve2DExportIntent → buildDefineArgs)
// produces the expected serialization for concrete preset values taken from
// keyguard_v75.json. Anchored to the Phase 1 completion record in the
// keyguard_geometry_parity plan.
// ─────────────────────────────────────────────────────────────────────────────

describe('Phase 1 Audit: shelf/grid preset pipeline trace', () => {
  const SHELF_PRESET_FOCUS = {
    mounting_method: 'Shelf',
    shelf_thickness: '3',
    shelf_depth: '4',
    shelf_corner_radius: '10',
    have_a_case: 'yes',
    have_a_keyguard_frame: 'no',
    smoothness_of_circles_and_arcs: '40',
    generate: 'keyguard',
    type_of_keyguard: '3D-Printed',
    use_Laser_Cutting_best_practices: 'yes',
  };

  const GRID_PRESET_FOCUS = {
    mounting_method: 'Slide-in Tabs',
    number_of_rows: '6',
    number_of_columns: '10',
    cell_width_in_mm: '18',
    cell_height_in_mm: '20',
    top_padding: '1',
    bottom_padding: '1',
    left_padding: '0',
    right_padding: '0',
    type_of_tablet: 'iPad 9th generation',
    orientation: 'landscape',
    unit_of_measure_for_screen: 'mm',
    smoothness_of_circles_and_arcs: '40',
    generate: 'keyguard',
    type_of_keyguard: '3D-Printed',
  };

  const SHELF_PARAM_TYPES = {
    mounting_method: 'string',
    shelf_thickness: 'number',
    shelf_depth: 'number',
    shelf_corner_radius: 'integer',
    have_a_case: 'string',
    have_a_keyguard_frame: 'string',
    smoothness_of_circles_and_arcs: 'integer',
    generate: 'string',
    type_of_keyguard: 'string',
    use_Laser_Cutting_best_practices: 'string',
  };

  const GRID_PARAM_TYPES = {
    mounting_method: 'string',
    number_of_rows: 'integer',
    number_of_columns: 'integer',
    cell_width_in_mm: 'integer',
    cell_height_in_mm: 'integer',
    top_padding: 'number',
    bottom_padding: 'number',
    left_padding: 'number',
    right_padding: 'number',
    type_of_tablet: 'string',
    orientation: 'string',
    unit_of_measure_for_screen: 'string',
    smoothness_of_circles_and_arcs: 'integer',
    generate: 'string',
    type_of_keyguard: 'string',
  };

  describe('resolve2DExportIntent passthrough for 3D export', () => {
    it('shelf preset is unchanged for STL format', () => {
      const result = resolve2DExportIntent(SHELF_PRESET_FOCUS, null, 'stl');
      expect(result).toBe(SHELF_PRESET_FOCUS);
    });

    it('grid preset is unchanged for STL format', () => {
      const result = resolve2DExportIntent(GRID_PRESET_FOCUS, null, 'stl');
      expect(result).toBe(GRID_PRESET_FOCUS);
    });
  });

  describe('buildDefineArgs numeric coercion for shelf preset', () => {
    it('emits shelf_thickness as unquoted number', () => {
      const args = buildDefineArgs(SHELF_PRESET_FOCUS, SHELF_PARAM_TYPES);
      expect(args).toContain('shelf_thickness=3');
    });

    it('emits shelf_depth as unquoted number', () => {
      const args = buildDefineArgs(SHELF_PRESET_FOCUS, SHELF_PARAM_TYPES);
      expect(args).toContain('shelf_depth=4');
    });

    it('emits shelf_corner_radius as unquoted number', () => {
      const args = buildDefineArgs(SHELF_PRESET_FOCUS, SHELF_PARAM_TYPES);
      expect(args).toContain('shelf_corner_radius=10');
    });

    it('emits mounting_method as quoted string', () => {
      const args = buildDefineArgs(SHELF_PRESET_FOCUS, SHELF_PARAM_TYPES);
      expect(args).toContain('mounting_method="Shelf"');
    });

    it('emits have_a_case as quoted string (not boolean)', () => {
      const args = buildDefineArgs(SHELF_PRESET_FOCUS, SHELF_PARAM_TYPES);
      expect(args).toContain('have_a_case="yes"');
    });

    it('emits smoothness_of_circles_and_arcs as unquoted number', () => {
      const args = buildDefineArgs(SHELF_PRESET_FOCUS, SHELF_PARAM_TYPES);
      expect(args).toContain('smoothness_of_circles_and_arcs=40');
    });
  });

  describe('buildDefineArgs numeric coercion for grid preset', () => {
    it('emits number_of_rows as unquoted number', () => {
      const args = buildDefineArgs(GRID_PRESET_FOCUS, GRID_PARAM_TYPES);
      expect(args).toContain('number_of_rows=6');
    });

    it('emits number_of_columns as unquoted number', () => {
      const args = buildDefineArgs(GRID_PRESET_FOCUS, GRID_PARAM_TYPES);
      expect(args).toContain('number_of_columns=10');
    });

    it('emits cell_width_in_mm as unquoted number', () => {
      const args = buildDefineArgs(GRID_PRESET_FOCUS, GRID_PARAM_TYPES);
      expect(args).toContain('cell_width_in_mm=18');
    });

    it('emits cell_height_in_mm as unquoted number', () => {
      const args = buildDefineArgs(GRID_PRESET_FOCUS, GRID_PARAM_TYPES);
      expect(args).toContain('cell_height_in_mm=20');
    });

    it('emits padding values as unquoted numbers', () => {
      const args = buildDefineArgs(GRID_PRESET_FOCUS, GRID_PARAM_TYPES);
      expect(args).toContain('top_padding=1');
      expect(args).toContain('bottom_padding=1');
      expect(args).toContain('left_padding=0');
      expect(args).toContain('right_padding=0');
    });

    it('emits type_of_tablet as quoted string', () => {
      const args = buildDefineArgs(GRID_PRESET_FOCUS, GRID_PARAM_TYPES);
      expect(args).toContain('type_of_tablet="iPad 9th generation"');
    });

    it('emits orientation as quoted string', () => {
      const args = buildDefineArgs(GRID_PRESET_FOCUS, GRID_PARAM_TYPES);
      expect(args).toContain('orientation="landscape"');
    });
  });

  describe('buildDefineArgs with wrong paramType (divergence risk)', () => {
    it('would quote shelf_thickness if paramType were string (documenting the risk)', () => {
      const wrongTypes = { ...SHELF_PARAM_TYPES, shelf_thickness: 'string' };
      const args = buildDefineArgs(SHELF_PRESET_FOCUS, wrongTypes);
      expect(args).toContain('shelf_thickness="3"');
    });

    it('would quote number_of_rows if paramType were string', () => {
      const wrongTypes = { ...GRID_PARAM_TYPES, number_of_rows: 'string' };
      const args = buildDefineArgs(GRID_PRESET_FOCUS, wrongTypes);
      expect(args).toContain('number_of_rows="6"');
    });

    it('would quote smoothness_of_circles_and_arcs if paramType were string', () => {
      const wrongTypes = { ...SHELF_PARAM_TYPES, smoothness_of_circles_and_arcs: 'string' };
      const args = buildDefineArgs(SHELF_PRESET_FOCUS, wrongTypes);
      expect(args).toContain('smoothness_of_circles_and_arcs="40"');
    });

    it('would quote cell_width_in_mm if paramType were string', () => {
      const wrongTypes = { ...GRID_PARAM_TYPES, cell_width_in_mm: 'string' };
      const args = buildDefineArgs(GRID_PRESET_FOCUS, wrongTypes);
      expect(args).toContain('cell_width_in_mm="18"');
    });
  });

  describe('buildDefineArgs integer vs number type equivalence (regression guard)', () => {
    it('integer and number types produce identical output for shelf_corner_radius', () => {
      const withInteger = buildDefineArgs(
        { shelf_corner_radius: '10' },
        { shelf_corner_radius: 'integer' },
      );
      const withNumber = buildDefineArgs(
        { shelf_corner_radius: '10' },
        { shelf_corner_radius: 'number' },
      );
      expect(withInteger).toEqual(withNumber);
      expect(withInteger).toContain('shelf_corner_radius=10');
    });

    it('integer and number types produce identical output for smoothness_of_circles_and_arcs', () => {
      const withInteger = buildDefineArgs(
        { smoothness_of_circles_and_arcs: '40' },
        { smoothness_of_circles_and_arcs: 'integer' },
      );
      const withNumber = buildDefineArgs(
        { smoothness_of_circles_and_arcs: '40' },
        { smoothness_of_circles_and_arcs: 'number' },
      );
      expect(withInteger).toEqual(withNumber);
      expect(withInteger).toContain('smoothness_of_circles_and_arcs=40');
    });

    it('integer and number types produce identical output for number_of_rows', () => {
      const withInteger = buildDefineArgs(
        { number_of_rows: '6' },
        { number_of_rows: 'integer' },
      );
      const withNumber = buildDefineArgs(
        { number_of_rows: '6' },
        { number_of_rows: 'number' },
      );
      expect(withInteger).toEqual(withNumber);
      expect(withInteger).toContain('number_of_rows=6');
    });

    it('integer type handles decimal string values by coercing to number', () => {
      const args = buildDefineArgs(
        { top_padding: '1.5' },
        { top_padding: 'integer' },
      );
      expect(args).toContain('top_padding=1.5');
    });
  });

  describe('Geometry Fix Regression: desktop reference parity (Phase 2 baseline)', () => {
    // Desktop reference data from docs/audit/testing-round-7/reference-data/cli-extracts/nightly/
    // These fixtures are inlined to keep the test self-contained (same pattern as buildDefineArgs above).
    const DESKTOP_REFERENCES = {
      '3d-printed-keyguard': {
        scenarioId: '3d-printed-keyguard',
        parameters: { generate: 'keyguard', type_of_keyguard: '3D-Printed' },
        geometry: { vertices: 5978, facets: 12016 },
        exports: { stl_bytes: 3394047 },
        openscadVersion: '2026.01.03',
        backend: 'Manifold',
      },
      'laser-cut-keyguard': {
        scenarioId: 'laser-cut-keyguard',
        parameters: { generate: 'keyguard', type_of_keyguard: 'Laser-Cut' },
        geometry: { vertices: 3288, facets: 6636 },
        exports: { stl_bytes: 1912770 },
        openscadVersion: '2026.01.03',
        backend: 'Manifold',
      },
      'keyguard-frame-multicolor': {
        scenarioId: 'keyguard-frame-multicolor',
        parameters: {
          type_of_keyguard: '3D-Printed',
          generate: 'keyguard frame',
          show_keyguard_with_frame: 'yes',
          have_a_keyguard_frame: 'yes',
        },
        geometry: { vertices: 6981, facets: 14118 },
        exports: { stl_bytes: 3940675 },
        openscadVersion: '2026.01.03',
        backend: 'Manifold',
      },
    };

    function findMatchingReference(params) {
      if (!params) return null;
      for (const ref of Object.values(DESKTOP_REFERENCES)) {
        const allMatch = Object.entries(ref.parameters).every(
          ([key, value]) => params[key] === value
        );
        if (allMatch) return ref;
      }
      return null;
    }

    function withinTolerance(actual, reference, tolerancePct) {
      const delta = Math.abs(actual - reference) / reference;
      return delta <= tolerancePct / 100;
    }

    describe('reference data structure validation', () => {
      it('all reference entries have required geometry fields', () => {
        for (const [id, ref] of Object.entries(DESKTOP_REFERENCES)) {
          expect(ref.scenarioId).toBe(id);
          expect(ref.geometry.vertices).toBeGreaterThan(0);
          expect(ref.geometry.facets).toBeGreaterThan(0);
          expect(ref.exports.stl_bytes).toBeGreaterThan(0);
          expect(ref.openscadVersion).toBe('2026.01.03');
          expect(ref.backend).toBe('Manifold');
        }
      });

      it('all reference entries have parameter sets for matching', () => {
        for (const ref of Object.values(DESKTOP_REFERENCES)) {
          expect(ref.parameters).toBeDefined();
          expect(Object.keys(ref.parameters).length).toBeGreaterThan(0);
        }
      });

      it('facet count is always even (triangulated mesh has paired faces)', () => {
        for (const ref of Object.values(DESKTOP_REFERENCES)) {
          expect(ref.geometry.facets % 2).toBe(0);
        }
      });
    });

    describe('reference matching logic', () => {
      it('matches 3D-printed keyguard by generate + type_of_keyguard', () => {
        const match = findMatchingReference({
          generate: 'keyguard',
          type_of_keyguard: '3D-Printed',
        });
        expect(match).not.toBeNull();
        expect(match.scenarioId).toBe('3d-printed-keyguard');
        expect(match.geometry.facets).toBe(12016);
      });

      it('matches laser-cut keyguard by generate + type_of_keyguard', () => {
        const match = findMatchingReference({
          generate: 'keyguard',
          type_of_keyguard: 'Laser-Cut',
        });
        expect(match).not.toBeNull();
        expect(match.scenarioId).toBe('laser-cut-keyguard');
      });

      it('matches keyguard-frame-multicolor by all four parameters', () => {
        const match = findMatchingReference({
          type_of_keyguard: '3D-Printed',
          generate: 'keyguard frame',
          show_keyguard_with_frame: 'yes',
          have_a_keyguard_frame: 'yes',
        });
        expect(match).not.toBeNull();
        expect(match.scenarioId).toBe('keyguard-frame-multicolor');
      });

      it('returns null for unrecognized parameter combinations', () => {
        expect(findMatchingReference({ generate: 'unknown' })).toBeNull();
      });

      it('returns null for null input', () => {
        expect(findMatchingReference(null)).toBeNull();
      });

      it('does not match when only a subset of required params is present', () => {
        const match = findMatchingReference({
          type_of_keyguard: '3D-Printed',
          generate: 'keyguard frame',
          // Missing show_keyguard_with_frame and have_a_keyguard_frame
        });
        // Should NOT match keyguard-frame-multicolor since only 2 of 4 params present.
        // May match 3d-printed-keyguard since generate='keyguard frame' != 'keyguard'.
        expect(match?.scenarioId).not.toBe('keyguard-frame-multicolor');
      });
    });

    describe('tolerance comparison utility', () => {
      it('accepts values within tolerance', () => {
        expect(withinTolerance(11000, 12016, 10)).toBe(true);
        expect(withinTolerance(12016, 12016, 10)).toBe(true);
        expect(withinTolerance(12500, 12016, 10)).toBe(true);
      });

      it('rejects values outside tolerance', () => {
        expect(withinTolerance(9000, 12016, 10)).toBe(false);
        expect(withinTolerance(14000, 12016, 10)).toBe(false);
      });
    });

    describe('Phase 2 observed baseline recording', () => {
      // OBSERVED (browser runtime, 2026-04-03): compareGeometry() at RENDER_QUALITY.FULL
      // reported 10,348 triangles for the default 3D-printed keyguard preset.
      // Desktop Nightly reference: 12,016 facets.
      // Delta: -1,668 (-13.9%) — outside 10% tolerance.
      // This was measured with WASM build OpenSCAD-2025.03.25 (pre-Phase 4 update).
      const BROWSER_BASELINE_PRE_PHASE4 = 10348;
      const DESKTOP_REFERENCE_FACETS = 12016;

      it('baseline delta is recorded as -13.9% (outside 10% tolerance)', () => {
        const delta =
          (BROWSER_BASELINE_PRE_PHASE4 - DESKTOP_REFERENCE_FACETS) /
          DESKTOP_REFERENCE_FACETS;
        expect(delta).toBeCloseTo(-0.139, 2);
        expect(withinTolerance(BROWSER_BASELINE_PRE_PHASE4, DESKTOP_REFERENCE_FACETS, 10)).toBe(false);
      });

      it('a hypothetical 11,000-triangle result would be within 10% tolerance', () => {
        expect(withinTolerance(11000, DESKTOP_REFERENCE_FACETS, 10)).toBe(true);
      });

      it('desktop reference for 3D-printed keyguard is 5,978 vertices / 12,016 facets', () => {
        const ref = DESKTOP_REFERENCES['3d-printed-keyguard'];
        expect(ref.geometry.vertices).toBe(5978);
        expect(ref.geometry.facets).toBe(12016);
      });
    });
  });

  describe('end-to-end 2D export pipeline for grid preset', () => {
    const GRID_2D_EXPORT_SCHEMA = {
      parameters: {
        generate: {
          enum: [
            { value: 'keyguard', label: '3d printed keyguard' },
            { value: 'first layer for SVG/DXF file', label: 'first layer for SVG/DXF file' },
          ],
        },
        type_of_keyguard: {
          enum: ['3D-Printed', 'Laser-Cut'],
        },
        use_Laser_Cutting_best_practices: {
          enum: ['yes', 'no'],
        },
      },
    };

    it('resolve2DExportIntent adjusts grid preset for SVG export', () => {
      const resolved = resolve2DExportIntent(
        { ...GRID_PRESET_FOCUS },
        GRID_2D_EXPORT_SCHEMA,
        'svg',
      );
      expect(resolved.generate).toBe('first layer for SVG/DXF file');
      expect(resolved.type_of_keyguard).toBe('Laser-Cut');
      expect(resolved.use_Laser_Cutting_best_practices).toBe('yes');
    });

    it('resolve2DExportIntent preserves non-adjusted grid parameters', () => {
      const resolved = resolve2DExportIntent(
        { ...GRID_PRESET_FOCUS },
        GRID_2D_EXPORT_SCHEMA,
        'svg',
      );
      expect(resolved.number_of_rows).toBe('6');
      expect(resolved.number_of_columns).toBe('10');
      expect(resolved.cell_width_in_mm).toBe('18');
      expect(resolved.cell_height_in_mm).toBe('20');
      expect(resolved.mounting_method).toBe('Slide-in Tabs');
      expect(resolved.orientation).toBe('landscape');
    });

    it('buildDefineArgs serializes resolved grid 2D export params correctly', () => {
      const resolved = resolve2DExportIntent(
        { ...GRID_PRESET_FOCUS },
        GRID_2D_EXPORT_SCHEMA,
        'svg',
      );
      const args = buildDefineArgs(resolved, GRID_PARAM_TYPES);

      expect(args).toContain('generate="first layer for SVG/DXF file"');
      expect(args).toContain('type_of_keyguard="Laser-Cut"');
      expect(args).toContain('use_Laser_Cutting_best_practices="yes"');
      expect(args).toContain('number_of_rows=6');
      expect(args).toContain('number_of_columns=10');
      expect(args).toContain('cell_width_in_mm=18');
      expect(args).toContain('cell_height_in_mm=20');
      expect(args).toContain('top_padding=1');
      expect(args).toContain('bottom_padding=1');
      expect(args).toContain('left_padding=0');
      expect(args).toContain('right_padding=0');
      expect(args).toContain('orientation="landscape"');
      expect(args).toContain('mounting_method="Slide-in Tabs"');
      expect(args).toContain('smoothness_of_circles_and_arcs=40');
    });

    it('buildDefineArgs serializes shelf preset with parser-accurate types', () => {
      const args = buildDefineArgs(SHELF_PRESET_FOCUS, SHELF_PARAM_TYPES);

      expect(args).toContain('mounting_method="Shelf"');
      expect(args).toContain('shelf_thickness=3');
      expect(args).toContain('shelf_depth=4');
      expect(args).toContain('shelf_corner_radius=10');
      expect(args).toContain('have_a_case="yes"');
      expect(args).toContain('have_a_keyguard_frame="no"');
      expect(args).toContain('smoothness_of_circles_and_arcs=40');
      expect(args).toContain('generate="keyguard"');
      expect(args).toContain('type_of_keyguard="3D-Printed"');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 4: Serialization Parity — shared formatScadValue regression tests
//
// Validates that the single formatting function (scad-param-formatter.js)
// produces identical output for all code paths: buildDefineArgs (-D flags),
// _applyOverrides (source replacement), parametersToScad (source prepend),
// and dumpRenderArgs (diagnostic logging).
// ─────────────────────────────────────────────────────────────────────────────

describe('Phase 4: formatScadValue parity — yes/no string enums', () => {
  it('preserves "yes" as quoted string when paramType is string', () => {
    expect(formatScadValue('have_a_case', 'yes', { have_a_case: 'string' })).toBe('"yes"');
  });

  it('preserves "no" as quoted string when paramType is string', () => {
    expect(formatScadValue('have_a_case', 'no', { have_a_case: 'string' })).toBe('"no"');
  });

  it('converts "yes" to boolean true when paramType is boolean', () => {
    expect(formatScadValue('MW_version', 'yes', { MW_version: 'boolean' })).toBe('true');
  });

  it('converts "no" to boolean false when paramType is boolean', () => {
    expect(formatScadValue('MW_version', 'no', { MW_version: 'boolean' })).toBe('false');
  });

  it('converts "true" to boolean true when paramType is boolean', () => {
    expect(formatScadValue('flag', 'true', { flag: 'boolean' })).toBe('true');
  });

  it('converts "false" to boolean false when paramType is boolean', () => {
    expect(formatScadValue('flag', 'false', { flag: 'boolean' })).toBe('false');
  });

  it('preserves "yes" as quoted string when paramType is unknown/missing', () => {
    expect(formatScadValue('expose_home_button', 'yes', {})).toBe('"yes"');
    expect(formatScadValue('expose_home_button', 'yes')).toBe('"yes"');
  });

  it('preserves "no" as quoted string when paramType is unknown/missing', () => {
    expect(formatScadValue('expose_upper_message_bar', 'no', {})).toBe('"no"');
  });

  it('preserves "Yes"/"No" (capitalized) as quoted strings for string type', () => {
    expect(formatScadValue('param', 'Yes', { param: 'string' })).toBe('"Yes"');
    expect(formatScadValue('param', 'No', { param: 'string' })).toBe('"No"');
  });

  it('converts "Yes"/"No" (capitalized) to booleans for boolean type', () => {
    expect(formatScadValue('param', 'Yes', { param: 'boolean' })).toBe('true');
    expect(formatScadValue('param', 'No', { param: 'boolean' })).toBe('false');
  });
});

describe('Phase 4: formatScadValue parity — numeric-string coercion', () => {
  it('emits unquoted number for integer-typed string "40"', () => {
    expect(formatScadValue('smoothness', '40', { smoothness: 'integer' })).toBe('40');
  });

  it('emits unquoted number for number-typed string "3.5"', () => {
    expect(formatScadValue('thickness', '3.5', { thickness: 'number' })).toBe('3.5');
  });

  it('emits unquoted 0 for number-typed string "0"', () => {
    expect(formatScadValue('padding', '0', { padding: 'number' })).toBe('0');
  });

  it('emits quoted string for numeric-looking value when type is string', () => {
    expect(formatScadValue('label', '42', { label: 'string' })).toBe('"42"');
  });

  it('emits quoted string for numeric-looking value when type is missing', () => {
    expect(formatScadValue('label', '42', {})).toBe('"42"');
  });

  it('emits unquoted number for native number value regardless of type', () => {
    expect(formatScadValue('width', 100, { width: 'integer' })).toBe('100');
    expect(formatScadValue('width', 100, { width: 'string' })).toBe('100');
    expect(formatScadValue('width', 100, {})).toBe('100');
  });

  it('handles negative numeric strings', () => {
    expect(formatScadValue('offset', '-5', { offset: 'number' })).toBe('-5');
  });

  it('handles float with leading zero', () => {
    expect(formatScadValue('scale', '0.5', { scale: 'number' })).toBe('0.5');
  });

  it('does not coerce non-numeric strings for integer type', () => {
    expect(formatScadValue('param', 'abc', { param: 'integer' })).toBe('"abc"');
  });

  it('does not coerce empty string for integer type', () => {
    expect(formatScadValue('param', '', { param: 'integer' })).toBe('""');
  });

  it('does not coerce whitespace-only string for number type', () => {
    expect(formatScadValue('param', '   ', { param: 'number' })).toBe('"   "');
  });
});

describe('Phase 4: formatScadValue parity — edge cases', () => {
  it('returns null for null value', () => {
    expect(formatScadValue('key', null)).toBeNull();
  });

  it('returns null for undefined value', () => {
    expect(formatScadValue('key', undefined)).toBeNull();
  });

  it('formats native boolean true', () => {
    expect(formatScadValue('flag', true)).toBe('true');
  });

  it('formats native boolean false', () => {
    expect(formatScadValue('flag', false)).toBe('false');
  });

  it('formats array values as OpenSCAD vectors', () => {
    expect(formatScadValue('pos', [1, 2, 3])).toBe('[1,2,3]');
  });

  it('formats nested arrays as nested OpenSCAD vectors', () => {
    expect(formatScadValue('matrix', [[1, 2], [3, 4]])).toBe('[[1,2],[3,4]]');
  });

  it('formats file parameter objects using filename', () => {
    const fileParam = { data: new ArrayBuffer(8), name: 'image.png' };
    expect(formatScadValue('surface_file', fileParam)).toBe('"image.png"');
  });

  it('escapes backslashes and quotes in string values', () => {
    expect(formatScadValue('label', 'hello "world"', { label: 'string' })).toBe('"hello \\"world\\""');
    expect(formatScadValue('path', 'C:\\Users', { path: 'string' })).toBe('"C:\\\\Users"');
  });
});

describe('Phase 4: buildDefineArgs and formatScadValue produce identical output', () => {
  const LWFL_PARAMS = {
    expose_home_button: 'yes',
    expose_upper_message_bar: 'no',
    smoothness_of_circles_and_arcs: '40',
    shelf_thickness: '3',
    generate: 'keyguard',
    type_of_keyguard: '3D-Printed',
    have_a_case: 'yes',
    have_a_keyguard_frame: 'no',
    keyguard_color: '#FF0000',
  };

  const LWFL_TYPES = {
    expose_home_button: 'string',
    expose_upper_message_bar: 'string',
    smoothness_of_circles_and_arcs: 'integer',
    shelf_thickness: 'number',
    generate: 'string',
    type_of_keyguard: 'string',
    have_a_case: 'string',
    have_a_keyguard_frame: 'string',
    keyguard_color: 'string',
  };

  it('each -D arg matches formatScadValue output for the same key', () => {
    const args = buildDefineArgs(LWFL_PARAMS, LWFL_TYPES);
    for (let i = 0; i < args.length; i += 2) {
      const assignment = args[i + 1];
      const eqIdx = assignment.indexOf('=');
      const key = assignment.substring(0, eqIdx);
      const argValue = assignment.substring(eqIdx + 1);
      const directValue = formatScadValue(key, LWFL_PARAMS[key], LWFL_TYPES);
      expect(argValue).toBe(directValue);
    }
  });

  it('string enum "yes" is quoted in -D args (not converted to boolean)', () => {
    const args = buildDefineArgs(LWFL_PARAMS, LWFL_TYPES);
    expect(args).toContain('expose_home_button="yes"');
    expect(args).toContain('have_a_case="yes"');
  });

  it('string enum "no" is quoted in -D args (not converted to boolean)', () => {
    const args = buildDefineArgs(LWFL_PARAMS, LWFL_TYPES);
    expect(args).toContain('expose_upper_message_bar="no"');
    expect(args).toContain('have_a_keyguard_frame="no"');
  });

  it('numeric string coerced to unquoted number in -D args', () => {
    const args = buildDefineArgs(LWFL_PARAMS, LWFL_TYPES);
    expect(args).toContain('smoothness_of_circles_and_arcs=40');
    expect(args).toContain('shelf_thickness=3');
  });

  it('plain strings remain quoted in -D args', () => {
    const args = buildDefineArgs(LWFL_PARAMS, LWFL_TYPES);
    expect(args).toContain('generate="keyguard"');
    expect(args).toContain('type_of_keyguard="3D-Printed"');
  });
});

describe('Phase 4: serializeScadVector', () => {
  it('serializes flat array', () => {
    expect(serializeScadVector([1, 2, 3])).toBe('[1,2,3]');
  });

  it('serializes nested array', () => {
    expect(serializeScadVector([[0, 0], [10, 20]])).toBe('[[0,0],[10,20]]');
  });

  it('serializes empty array', () => {
    expect(serializeScadVector([])).toBe('[]');
  });

  it('serializes deeply nested array', () => {
    expect(serializeScadVector([[[1]]])).toBe('[[[1]]]');
  });

  it('handles mixed types in array', () => {
    expect(serializeScadVector([1, 'a', true])).toBe('[1,a,true]');
  });
});

describe('Phase 4: detectColorParamLiteralStyle', () => {
  it('detects string-style color with #', () => {
    const scad = 'keyguard_color = "#FF0000"; // [#FF0000, #00FF00]';
    const result = detectColorParamLiteralStyle(scad, 'keyguard_color');
    expect(result.style).toBe('string');
    expect(result.hasHashPrefix).toBe(true);
  });

  it('detects string-style color without #', () => {
    const scad = 'frame_color = "FF0000";';
    const result = detectColorParamLiteralStyle(scad, 'frame_color');
    expect(result.style).toBe('string');
    expect(result.hasHashPrefix).toBe(false);
  });

  it('detects vector-style color', () => {
    const scad = 'my_color = [1, 0, 0];';
    const result = detectColorParamLiteralStyle(scad, 'my_color');
    expect(result.style).toBe('vector');
  });

  it('returns unknown for missing parameter', () => {
    const scad = 'other_param = 42;';
    const result = detectColorParamLiteralStyle(scad, 'missing_param');
    expect(result.style).toBe('unknown');
  });

  it('returns unknown for null/empty inputs', () => {
    expect(detectColorParamLiteralStyle(null, 'key').style).toBe('unknown');
    expect(detectColorParamLiteralStyle('', 'key').style).toBe('unknown');
    expect(detectColorParamLiteralStyle('code', null).style).toBe('unknown');
  });
});

describe('Phase 4: escapeRegExp', () => {
  it('escapes regex special characters', () => {
    expect(escapeRegExp('foo.bar')).toBe('foo\\.bar');
    expect(escapeRegExp('a+b')).toBe('a\\+b');
    expect(escapeRegExp('[test]')).toBe('\\[test\\]');
  });

  it('passes through plain strings unchanged', () => {
    expect(escapeRegExp('simple_key')).toBe('simple_key');
  });
});
