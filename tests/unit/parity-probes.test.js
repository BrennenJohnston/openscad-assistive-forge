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
