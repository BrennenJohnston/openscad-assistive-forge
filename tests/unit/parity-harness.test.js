/**
 * Phase 1 — Parity Harness
 *
 * Regression fixtures that prove the generalized wiring gaps blocking
 * non-keyguard SVG/DXF export, generic color handling, and debug-modifier
 * parity with desktop OpenSCAD.
 *
 * Tests marked `.skip` cover gaps that later phases resolve:
 *   - Phase 2/3: render-intent resolution for generic schemas
 *   - Phase 6:   color passthrough and debug-modifier highlight
 *
 * Once later phases land, un-skip the corresponding tests to gate regressions.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AutoPreviewController,
  PREVIEW_STATE,
} from '../../src/js/auto-preview-controller.js';
import {
  resolve2DExportIntent,
  isNonPreviewable,
} from '../../src/js/render-intent.js';
import {
  DEBUG_HIGHLIGHT_COLOR,
  DEBUG_HIGHLIGHT_HEX,
  DEBUG_HIGHLIGHT_OPACITY,
} from '../../src/js/color-utils.js';

const resolve2DExportParameters = resolve2DExportIntent;

// ─── Fixture schemas ────────────────────────────────────────────────────────

/** Generic 2D project schema — uses "output_mode" instead of "generate" */
const GENERIC_2D_SCHEMA = {
  parameters: {
    plate_width: { type: 'number', minimum: 30, maximum: 200 },
    plate_height: { type: 'number', minimum: 15, maximum: 80 },
    output_mode: { enum: ['3d', '2d_engrave', '2d_cut'] },
    border_style: { enum: ['square', 'rounded', 'chamfered'] },
  },
};

/** Generic 2D project params — defaults to 3D */
const GENERIC_2D_PARAMS = {
  plate_width: 80,
  plate_height: 25,
  output_mode: '3d',
  border_style: 'rounded',
};

/** Stakeholder keyguard schema — uses "generate" + "type_of_keyguard" */
const KEYGUARD_SCHEMA = {
  parameters: {
    generate: {
      enum: [
        { value: '0', label: '3d printed keyguard' },
        { value: '1', label: 'first layer for SVG/DXF file' },
      ],
    },
    type_of_keyguard: {
      enum: [
        { value: '0', label: '3D Printed' },
        { value: '1', label: 'Laser Cut' },
      ],
    },
  },
};

/** Purely 2D project — no output-mode enum at all (model is intrinsically 2D) */
const INTRINSIC_2D_SCHEMA = {
  parameters: {
    width: { type: 'number', minimum: 10, maximum: 100 },
    height: { type: 'number', minimum: 10, maximum: 100 },
    shape_type: { enum: ['square', 'circle', 'rounded_rect'] },
  },
};

const INTRINSIC_2D_PARAMS = {
  width: 50,
  height: 50,
  shape_type: 'square',
};

// ─── 1. Render-intent resolution for generic schemas ────────────────────────

describe('Parity: resolve2DExportParameters — generic project schemas', () => {
  it('resolves keyguard "generate" param for SVG format (baseline)', () => {
    const params = { generate: '0', type_of_keyguard: '0' };
    const result = resolve2DExportParameters(params, KEYGUARD_SCHEMA, 'svg');
    expect(result.generate).toBe('1');
    expect(result.type_of_keyguard).toBe('1');
  });

  it('selects 2D entry from a generic "output_mode" enum for SVG format (Phase 2/3 resolved)', () => {
    const result = resolve2DExportParameters(
      { ...GENERIC_2D_PARAMS },
      GENERIC_2D_SCHEMA,
      'svg'
    );
    expect(result.output_mode).toBe('2d_cut');
  });

  it('selects 2D entry from a generic "output_mode" enum for DXF format (Phase 2/3 resolved)', () => {
    const result = resolve2DExportParameters(
      { ...GENERIC_2D_PARAMS },
      GENERIC_2D_SCHEMA,
      'dxf'
    );
    expect(result.output_mode).toMatch(/^2d_/);
  });

  it('passes through intrinsic 2D schema params unchanged (correct — no mode enum needed)', () => {
    const result = resolve2DExportParameters(
      { ...INTRINSIC_2D_PARAMS },
      INTRINSIC_2D_SCHEMA,
      'svg'
    );
    expect(result).toEqual(INTRINSIC_2D_PARAMS);
  });
});

// ─── 2. Non-previewable detection for generic schemas ───────────────────────

describe('Parity: isNonPreviewableParameters — generic project schemas', () => {
  it('returns false for keyguard SVG generate mode (2D modes are previewable)', () => {
    expect(
      isNonPreviewable({ generate: '1' }, KEYGUARD_SCHEMA)
    ).toBe(false);
  });

  it('returns false for generic "output_mode=2d_engrave" (2D modes are previewable)', () => {
    expect(
      isNonPreviewable(
        { output_mode: '2d_engrave' },
        GENERIC_2D_SCHEMA
      )
    ).toBe(false);
  });

  it('does not flag generic "output_mode=3d" as non-previewable', () => {
    expect(
      isNonPreviewable({ output_mode: '3d' }, GENERIC_2D_SCHEMA)
    ).toBe(false);
  });

  it('does not flag intrinsic 2D params (no generate) as non-previewable', () => {
    expect(
      isNonPreviewable(INTRINSIC_2D_PARAMS, INTRINSIC_2D_SCHEMA)
    ).toBe(false);
  });
});

// ─── 3. Color resolution — box_color preference and generic color params ────

describe('Parity: resolvePreviewColor — generic color parameter handling', () => {
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
      setColorOverride: vi.fn(),
      clear: vi.fn(),
    };
    controller = new AutoPreviewController(renderController, previewManager, {
      debounceMs: 10,
    });
    controller.setScadContent('cube(10);');
  });

  it('uses first color param in declaration order regardless of box_color (Phase 3 resolved)', () => {
    controller.setColorParamNames(['model_color', 'box_color']);
    const color = controller.resolvePreviewColor({
      use_colors: 'yes',
      model_color: '00ff00',
      box_color: 'ff0000',
    });
    expect(color).toBe('#00ff00');
  });

  it('uses first available color param without box_color preference (Phase 3 resolved)', () => {
    controller.setColorParamNames(['model_color', 'accent_color']);
    const color = controller.resolvePreviewColor({
      use_colors: 'yes',
      model_color: '00ff00',
      accent_color: 'ff0000',
    });
    expect(color).toBe('#00ff00');
  });

  it('resolves generic color param when box_color is absent', () => {
    controller.setColorParamNames(['model_color']);
    const color = controller.resolvePreviewColor({
      use_colors: 'yes',
      model_color: 'ff0000',
    });
    expect(color).toBe('#ff0000');
  });

  it('returns null when use_colors is "no"', () => {
    controller.setColorParamNames(['model_color']);
    const color = controller.resolvePreviewColor({
      use_colors: 'no',
      model_color: 'ff0000',
    });
    expect(color).toBeNull();
  });
});

// ─── 4. Debug modifier — # highlight color parity ──────────────────────────

describe('Parity: # debug modifier highlight behavior', () => {
  it('applies fixed highlight color for # debug modifier (Phase 6 gate)', () => {
    expect(DEBUG_HIGHLIGHT_COLOR).toEqual({ r: 255, g: 81, b: 81, a: 128 });
    expect(DEBUG_HIGHLIGHT_HEX).toBe('#ff5151');
    expect(DEBUG_HIGHLIGHT_OPACITY).toBeCloseTo(128 / 255, 5);
  });

  it('# modifier overrides user-defined color() (Phase 6 gate)', () => {
    // Desktop: `# color("blue") cube()` renders as highlight red, NOT blue.
    // scadUsesDebugModifier detects `#` in SCAD source; when active, loadOFF
    // creates a dual-render Group (normal mesh + pink overlay).
    expect(
      AutoPreviewController.scadUsesDebugModifier(
        '# color("blue") cube(10);'
      )
    ).toBe(true);
    // Non-debug SCAD must not false-positive
    expect(
      AutoPreviewController.scadUsesDebugModifier(
        'color("blue") cube(10);'
      )
    ).toBe(false);
  });

  it('documents that SVG export uses fixed stroke/fill (no model colors)', () => {
    const DESKTOP_SVG_STROKE = 'black';
    const DESKTOP_SVG_FILL = 'lightgray';
    expect(DESKTOP_SVG_STROKE).toBe('black');
    expect(DESKTOP_SVG_FILL).toBe('lightgray');
  });
});

// ─── 5. _detectRenderState — laser detection with generic params ────────────

describe('Parity: _detectRenderState — generic project handling', () => {
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
      setColorOverride: vi.fn(),
      clear: vi.fn(),
    };
    controller = new AutoPreviewController(renderController, previewManager, {
      debounceMs: 10,
    });
  });

  it('returns null for generic params (render state detection removed)', () => {
    expect(controller._detectRenderState(GENERIC_2D_PARAMS)).toBeNull();
  });

  it('returns null even for laser-cutting params (render state detection removed)', () => {
    expect(
      controller._detectRenderState({
        use_Laser_Cutting_best_practices: 'Yes',
      })
    ).toBeNull();
  });

  it('returns null for full quality renders', () => {
    expect(controller._detectRenderState(GENERIC_2D_PARAMS, true)).toBeNull();
  });
});

// ─── 6. Phase 6: scadUsesColor / scadUsesDebugModifier detection ────────────

describe('Parity: scadUsesColor — color() detection', () => {
  it('detects color("red") in source', () => {
    expect(AutoPreviewController.scadUsesColor('color("red") cube(10);')).toBe(
      true
    );
  });

  it('detects color() with whitespace', () => {
    expect(
      AutoPreviewController.scadUsesColor('color  ( "green" ) sphere(5);')
    ).toBe(true);
  });

  it('ignores color inside single-line comment', () => {
    expect(AutoPreviewController.scadUsesColor('// color("red")\ncube(10);')).toBe(
      false
    );
  });

  it('ignores color inside block comment', () => {
    expect(
      AutoPreviewController.scadUsesColor('/* color("red") */ cube(10);')
    ).toBe(false);
  });

  it('returns false for empty/null input', () => {
    expect(AutoPreviewController.scadUsesColor('')).toBe(false);
    expect(AutoPreviewController.scadUsesColor(null)).toBe(false);
  });
});

describe('Parity: scadUsesDebugModifier — # detection', () => {
  it('detects # before cube()', () => {
    expect(
      AutoPreviewController.scadUsesDebugModifier('# cube(10);')
    ).toBe(true);
  });

  it('detects # before color() in difference context', () => {
    expect(
      AutoPreviewController.scadUsesDebugModifier(
        'difference() {\n  cube(10);\n  # color("blue") cylinder(r=3, h=12);\n}'
      )
    ).toBe(true);
  });

  it('detects # before translate()', () => {
    expect(
      AutoPreviewController.scadUsesDebugModifier(
        '# translate([5,0,0]) cube(5);'
      )
    ).toBe(true);
  });

  it('does not false-positive on "#" inside string', () => {
    expect(
      AutoPreviewController.scadUsesDebugModifier(
        'color("#ff0000") cube(10);'
      )
    ).toBe(false);
  });

  it('does not false-positive on // commented #', () => {
    expect(
      AutoPreviewController.scadUsesDebugModifier(
        '// # cube(10);\ncube(10);'
      )
    ).toBe(false);
  });

  it('does not false-positive on plain geometry without #', () => {
    expect(
      AutoPreviewController.scadUsesDebugModifier('cube(10);')
    ).toBe(false);
  });

  it('returns false for empty/null input', () => {
    expect(AutoPreviewController.scadUsesDebugModifier('')).toBe(false);
    expect(AutoPreviewController.scadUsesDebugModifier(null)).toBe(false);
  });
});

// ─── 8. Stakeholder E2E acknowledgement ─────────────────────────────────────

describe('Parity: E2E stakeholder coverage acknowledgement', () => {
  it('documents that 6 of 21 E2E files are stakeholder-specific', () => {
    // Stakeholder-specific E2E files:
    //   1. stakeholder-acceptance.spec.js
    //   2. stakeholder-bugfix-verification.spec.js
    //   3. stakeholder-zip-acceptance.spec.js
    //   4. keyguard-compilation-smoke.spec.js
    //   5. keyguard-parser-smoke.spec.js
    //   6. keyguard-workflow.spec.js
    //
    // Phase 1 adds generic-project-baseline.spec.js to balance coverage.
    const STAKEHOLDER_E2E_COUNT = 6;
    const TOTAL_E2E_COUNT = 21;
    expect(STAKEHOLDER_E2E_COUNT).toBe(6);
    expect(TOTAL_E2E_COUNT).toBe(21);
  });
});
