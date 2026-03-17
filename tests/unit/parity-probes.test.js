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
import { isNonPreviewable, RENDER_STATE } from '../../src/js/render-intent.js';

// ── Inlined buildDefineArgs for testability (worker module excluded from vitest)
// Mirrors src/worker/openscad-worker.js:1050–1126. Keep in sync.
function buildDefineArgs(parameters, paramTypes = {}) {
  if (!parameters || Object.keys(parameters).length === 0) return [];
  const args = [];
  for (const [key, value] of Object.entries(parameters)) {
    if (value === null || value === undefined) continue;
    let formattedValue;
    if (typeof value === 'string') {
      const lowerValue = value.toLowerCase();
      const isBooleanParam = paramTypes[key] === 'boolean';
      if (isBooleanParam && (lowerValue === 'true' || lowerValue === 'yes')) {
        formattedValue = 'true';
      } else if (
        isBooleanParam &&
        (lowerValue === 'false' || lowerValue === 'no')
      ) {
        formattedValue = 'false';
      } else if (/^#?[0-9A-Fa-f]{6}$/.test(value)) {
        const rgb = hexToRgb(value);
        formattedValue = `[${rgb[0]},${rgb[1]},${rgb[2]}]`;
      } else if (
        (paramTypes[key] === 'integer' || paramTypes[key] === 'number') &&
        value.trim() !== '' &&
        !isNaN(Number(value))
      ) {
        formattedValue = String(Number(value));
      } else {
        const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        formattedValue = `"${escaped}"`;
      }
    } else if (typeof value === 'number') {
      formattedValue = String(value);
    } else if (typeof value === 'boolean') {
      formattedValue = value ? 'true' : 'false';
    } else {
      formattedValue = JSON.stringify(value);
    }
    args.push('-D');
    args.push(`${key}=${formattedValue}`);
  }
  return args;
}

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

describe('Probe 4: hex color serialization via buildDefineArgs', () => {
  it('converts #FF0000 to [255,0,0] (0–255 range)', () => {
    const args = buildDefineArgs({ keyguard_color: '#FF0000' });
    expect(args).toContain('-D');
    expect(args).toContain('keyguard_color=[255,0,0]');
  });

  it('converts FF0000 (no #) to [255,0,0]', () => {
    const args = buildDefineArgs({ keyguard_color: 'FF0000' });
    expect(args).toContain('keyguard_color=[255,0,0]');
  });

  it('converts #00FF00 to [0,255,0]', () => {
    const args = buildDefineArgs({ frame_color: '#00FF00' });
    expect(args).toContain('frame_color=[0,255,0]');
  });

  it('converts #0000FF to [0,0,255]', () => {
    const args = buildDefineArgs({ accent_color: '#0000FF' });
    expect(args).toContain('accent_color=[0,0,255]');
  });

  it('converts lowercase hex ff0000 correctly', () => {
    const args = buildDefineArgs({ keyguard_color: 'ff0000' });
    expect(args).toContain('keyguard_color=[255,0,0]');
  });

  it('converts mixed-case hex #FfAa00 correctly', () => {
    const args = buildDefineArgs({ keyguard_color: '#FfAa00' });
    expect(args).toContain('keyguard_color=[255,170,0]');
  });

  it('preserves non-color string values as quoted strings', () => {
    const args = buildDefineArgs({ generate: 'Customizer Settings' });
    expect(args).toContain('generate="Customizer Settings"');
  });

  it('does NOT treat 3-digit hex as color (regex requires 6 digits)', () => {
    const args = buildDefineArgs({ keyguard_color: '#F00' });
    // 3-digit hex does NOT match /^#?[0-9A-Fa-f]{6}$/
    expect(args).toContain('keyguard_color="#F00"');
  });

  it('serializes multiple color params independently', () => {
    const args = buildDefineArgs({
      keyguard_color: '#FF0000',
      frame_color: '#00FF00',
    });
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
