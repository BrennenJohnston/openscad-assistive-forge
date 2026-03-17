/**
 * Unit tests for the shared render-intent resolver (src/js/render-intent.js).
 *
 * Coverage areas required by Phase 2:
 *   - Generic 2D fixture (output_mode enum)
 *   - Keyguard-shaped parameters (generate + type_of_keyguard)
 *   - Unknown-project parameters (no 2D indicators at all)
 *   - Intrinsic 2D (model is always 2D, no mode enum)
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';
import {
  RENDER_STATE,
  resolve2DExportIntent,
  isNonPreviewable,
  classifyRenderState,
} from '../../src/js/render-intent.js';

// ── Fixture schemas (mirrored from parity-harness.test.js) ──────────────────

const GENERIC_2D_SCHEMA = {
  parameters: {
    plate_width: { type: 'number', minimum: 30, maximum: 200 },
    plate_height: { type: 'number', minimum: 15, maximum: 80 },
    output_mode: { enum: ['3d', '2d_engrave', '2d_cut'] },
    border_style: { enum: ['square', 'rounded', 'chamfered'] },
  },
};

const GENERIC_2D_PARAMS = {
  plate_width: 80,
  plate_height: 25,
  output_mode: '3d',
  border_style: 'rounded',
};

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
    use_Laser_Cutting_best_practices: {
      enum: ['No', 'Yes'],
    },
  },
};

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

const UNKNOWN_PROJECT_SCHEMA = {
  parameters: {
    size: { type: 'number', minimum: 1, maximum: 100 },
    material: { enum: ['wood', 'metal', 'plastic'] },
  },
};

const UNKNOWN_PROJECT_PARAMS = { size: 20, material: 'wood' };

// ── RENDER_STATE constants ──────────────────────────────────────────────────

describe('RENDER_STATE', () => {
  it('exposes the four expected state values', () => {
    expect(RENDER_STATE.PREVIEW).toBe('preview');
    expect(RENDER_STATE.RENDER_3D).toBe('render-3d');
    expect(RENDER_STATE.RENDER_2D).toBe('render-2d');
    expect(RENDER_STATE.INFORMATIONAL).toBe('informational');
  });
});

// ── resolve2DExportIntent ───────────────────────────────────────────────────

describe('resolve2DExportIntent — passthrough for non-2D formats', () => {
  it('returns parameters unchanged for STL format', () => {
    const params = { width: 10 };
    expect(resolve2DExportIntent(params, GENERIC_2D_SCHEMA, 'stl')).toBe(params);
  });

  it('returns parameters unchanged for OBJ format', () => {
    const params = { size: 5 };
    expect(resolve2DExportIntent(params, UNKNOWN_PROJECT_SCHEMA, 'obj')).toBe(params);
  });
});

describe('resolve2DExportIntent — missing / null schema', () => {
  it('returns parameters unchanged when schema is null', () => {
    const params = { width: 10 };
    expect(resolve2DExportIntent(params, null, 'svg')).toBe(params);
  });

  it('returns parameters unchanged when schema.parameters is missing', () => {
    const params = { width: 10 };
    expect(resolve2DExportIntent(params, {}, 'svg')).toBe(params);
  });
});

describe('resolve2DExportIntent — generic output_mode enum', () => {
  it('selects 2d_cut for SVG format', () => {
    const result = resolve2DExportIntent(
      { ...GENERIC_2D_PARAMS },
      GENERIC_2D_SCHEMA,
      'svg'
    );
    expect(result.output_mode).toBe('2d_cut');
  });

  it('selects a 2d_ entry for DXF format', () => {
    const result = resolve2DExportIntent(
      { ...GENERIC_2D_PARAMS },
      GENERIC_2D_SCHEMA,
      'dxf'
    );
    expect(result.output_mode).toMatch(/^2d_/);
  });

  it('does not touch params without 2D enum values', () => {
    const result = resolve2DExportIntent(
      { ...GENERIC_2D_PARAMS },
      GENERIC_2D_SCHEMA,
      'svg'
    );
    expect(result.border_style).toBe('rounded');
    expect(result.plate_width).toBe(80);
  });
});

describe('resolve2DExportIntent — keyguard-shaped parameters', () => {
  it('selects the 2D generate entry via labeled enum', () => {
    const params = { generate: '0', type_of_keyguard: '0', use_Laser_Cutting_best_practices: 'No' };
    const result = resolve2DExportIntent(params, KEYGUARD_SCHEMA, 'svg');
    expect(result.generate).toBe('1');
  });

  it('selects laser type_of_keyguard', () => {
    const params = { generate: '0', type_of_keyguard: '0' };
    const result = resolve2DExportIntent(params, KEYGUARD_SCHEMA, 'svg');
    expect(result.type_of_keyguard).toBe('1');
  });

  it('selects Yes for laser-cutting best practices', () => {
    const params = { use_Laser_Cutting_best_practices: 'No' };
    const result = resolve2DExportIntent(
      params,
      KEYGUARD_SCHEMA,
      'dxf'
    );
    expect(result.use_Laser_Cutting_best_practices).toBe('Yes');
  });

  it('handles DXF format for labeled generate enum', () => {
    const params = { generate: '0' };
    const result = resolve2DExportIntent(params, KEYGUARD_SCHEMA, 'dxf');
    expect(result.generate).toBe('1');
  });
});

describe('resolve2DExportIntent — intrinsic 2D schema', () => {
  it('passes through params unchanged (no mode-selector enum)', () => {
    const result = resolve2DExportIntent(
      { ...INTRINSIC_2D_PARAMS },
      INTRINSIC_2D_SCHEMA,
      'svg'
    );
    expect(result).toEqual(INTRINSIC_2D_PARAMS);
  });
});

describe('resolve2DExportIntent — unknown project (no 2D indicators)', () => {
  it('returns params unchanged when no enum has 2D keywords', () => {
    const result = resolve2DExportIntent(
      { ...UNKNOWN_PROJECT_PARAMS },
      UNKNOWN_PROJECT_SCHEMA,
      'svg'
    );
    expect(result).toEqual(UNKNOWN_PROJECT_PARAMS);
  });
});

describe('resolve2DExportIntent — does not mutate input', () => {
  it('returns a new object', () => {
    const params = { ...GENERIC_2D_PARAMS };
    const result = resolve2DExportIntent(params, GENERIC_2D_SCHEMA, 'svg');
    expect(result).not.toBe(params);
    expect(params.output_mode).toBe('3d');
  });
});

// ── isNonPreviewable ────────────────────────────────────────────────────────

describe('isNonPreviewable — null / missing parameters', () => {
  it('returns false for null', () => {
    expect(isNonPreviewable(null, GENERIC_2D_SCHEMA)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isNonPreviewable(undefined, null)).toBe(false);
  });
});

describe('isNonPreviewable — generate param (backward compat)', () => {
  it('returns true for empty generate', () => {
    expect(isNonPreviewable({ generate: '' }, null)).toBe(true);
  });

  it('returns true for whitespace-only generate', () => {
    expect(isNonPreviewable({ generate: '   ' }, null)).toBe(true);
  });

  it('returns false for "SVG" generate (2D modes are previewable)', () => {
    expect(isNonPreviewable({ generate: 'SVG' }, null)).toBe(false);
  });

  it('returns false for "DXF" generate (2D modes are previewable)', () => {
    expect(isNonPreviewable({ generate: 'DXF' }, null)).toBe(false);
  });

  it('returns false for "First Layer" generate (2D modes are previewable)', () => {
    expect(isNonPreviewable({ generate: 'First Layer' }, null)).toBe(false);
  });

  it('returns true for "Customizer Settings" generate', () => {
    expect(isNonPreviewable({ generate: 'Customizer Settings' }, null)).toBe(true);
  });

  it('returns false for "3D Printed" generate', () => {
    expect(isNonPreviewable({ generate: '3D Printed' }, null)).toBe(false);
  });

  it('returns false for numeric generate without schema context', () => {
    expect(isNonPreviewable({ generate: '1' }, null)).toBe(false);
  });
});

describe('isNonPreviewable — labeled generate enum resolution', () => {
  it('returns false for numeric "1" → "first layer for SVG/DXF file" (2D modes are previewable)', () => {
    expect(
      isNonPreviewable(
        { generate: '1' },
        KEYGUARD_SCHEMA
      )
    ).toBe(false);
  });

  it('returns false for numeric "0" → "3d printed keyguard"', () => {
    expect(
      isNonPreviewable(
        { generate: '0' },
        KEYGUARD_SCHEMA
      )
    ).toBe(false);
  });
});

describe('isNonPreviewable — generic output_mode enum', () => {
  it('returns false for output_mode=2d_engrave (2D modes are previewable)', () => {
    expect(
      isNonPreviewable(
        { ...GENERIC_2D_PARAMS, output_mode: '2d_engrave' },
        GENERIC_2D_SCHEMA
      )
    ).toBe(false);
  });

  it('returns false for output_mode=2d_cut (2D modes are previewable)', () => {
    expect(
      isNonPreviewable(
        { ...GENERIC_2D_PARAMS, output_mode: '2d_cut' },
        GENERIC_2D_SCHEMA
      )
    ).toBe(false);
  });

  it('returns false for output_mode=3d', () => {
    expect(
      isNonPreviewable(
        { ...GENERIC_2D_PARAMS },
        GENERIC_2D_SCHEMA
      )
    ).toBe(false);
  });
});

describe('isNonPreviewable — intrinsic 2D', () => {
  it('returns false (no mode selector to flag)', () => {
    expect(isNonPreviewable(INTRINSIC_2D_PARAMS, INTRINSIC_2D_SCHEMA)).toBe(false);
  });
});

describe('isNonPreviewable — unknown project', () => {
  it('returns false (no 2D keywords in any enum)', () => {
    expect(isNonPreviewable(UNKNOWN_PROJECT_PARAMS, UNKNOWN_PROJECT_SCHEMA)).toBe(false);
  });
});

// ── classifyRenderState ─────────────────────────────────────────────────────

describe('classifyRenderState', () => {
  it('returns RENDER_2D when format is svg', () => {
    expect(classifyRenderState({}, null, { format: 'svg' })).toBe(RENDER_STATE.RENDER_2D);
  });

  it('returns RENDER_2D when format is dxf', () => {
    expect(classifyRenderState({}, null, { format: 'dxf' })).toBe(RENDER_STATE.RENDER_2D);
  });

  it('returns INFORMATIONAL for "Customizer Settings" generate', () => {
    expect(
      classifyRenderState({ generate: 'Customizer Settings' }, null)
    ).toBe(RENDER_STATE.INFORMATIONAL);
  });

  it('returns PREVIEW for SVG generate mode (2D modes are previewable)', () => {
    expect(
      classifyRenderState({ generate: 'SVG' }, null)
    ).toBe(RENDER_STATE.PREVIEW);
  });

  it('returns PREVIEW for generic 2D output_mode (2D modes are previewable)', () => {
    expect(
      classifyRenderState(
        { ...GENERIC_2D_PARAMS, output_mode: '2d_cut' },
        GENERIC_2D_SCHEMA
      )
    ).toBe(RENDER_STATE.PREVIEW);
  });

  it('returns RENDER_3D for full-quality 3D render', () => {
    expect(
      classifyRenderState(
        { ...GENERIC_2D_PARAMS },
        GENERIC_2D_SCHEMA,
        { isFullQuality: true }
      )
    ).toBe(RENDER_STATE.RENDER_3D);
  });

  it('returns PREVIEW for default draft render', () => {
    expect(
      classifyRenderState(
        { ...GENERIC_2D_PARAMS },
        GENERIC_2D_SCHEMA
      )
    ).toBe(RENDER_STATE.PREVIEW);
  });

  it('returns PREVIEW for unknown project with no 2D indicators', () => {
    expect(
      classifyRenderState(UNKNOWN_PROJECT_PARAMS, UNKNOWN_PROJECT_SCHEMA)
    ).toBe(RENDER_STATE.PREVIEW);
  });

  it('returns INFORMATIONAL for labeled-enum customizer setting', () => {
    const customizerSchema = {
      parameters: {
        generate: {
          enum: [
            { value: '0', label: '3D Model' },
            { value: '1', label: 'Customizer Settings' },
          ],
        },
      },
    };
    expect(
      classifyRenderState({ generate: '1' }, customizerSchema)
    ).toBe(RENDER_STATE.INFORMATIONAL);
  });
});
