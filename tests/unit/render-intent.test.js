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
  propose2DExportAdjustments,
  isNonPreviewable,
  classifyRenderState,
} from '../../src/js/render-intent.js';
import { getBuiltinManifest } from '../../src/js/project-manifest.js';

const BUILTIN_EXPORT_2D = getBuiltinManifest().export2D;

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

// ── propose2DExportAdjustments ──────────────────────────────────────────────

describe('propose2DExportAdjustments — passthrough for non-2D formats', () => {
  it('proposes nothing for STL format', () => {
    const params = { width: 10 };
    const result = propose2DExportAdjustments(params, GENERIC_2D_SCHEMA, 'stl');
    expect(result.changes).toEqual([]);
    expect(result.resolvedParameters).toBe(params);
  });

  it('proposes nothing for OBJ format', () => {
    const params = { size: 5 };
    const result = propose2DExportAdjustments(
      params,
      UNKNOWN_PROJECT_SCHEMA,
      'obj'
    );
    expect(result.changes).toEqual([]);
    expect(result.resolvedParameters).toBe(params);
  });
});

describe('propose2DExportAdjustments — missing / null schema', () => {
  it('proposes nothing when schema is null', () => {
    const params = { width: 10 };
    const result = propose2DExportAdjustments(params, null, 'svg');
    expect(result.changes).toEqual([]);
    expect(result.resolvedParameters).toBe(params);
  });

  it('proposes nothing when schema.parameters is missing', () => {
    const params = { width: 10 };
    const result = propose2DExportAdjustments(params, {}, 'svg');
    expect(result.changes).toEqual([]);
    expect(result.resolvedParameters).toBe(params);
  });
});

describe('propose2DExportAdjustments — generic output_mode enum', () => {
  it('proposes 2d_cut for SVG format with from/to detail', () => {
    const result = propose2DExportAdjustments(
      { ...GENERIC_2D_PARAMS },
      GENERIC_2D_SCHEMA,
      'svg'
    );
    expect(result.resolvedParameters.output_mode).toBe('2d_cut');
    expect(result.changes).toEqual([
      {
        name: 'output_mode',
        from: '3d',
        to: '2d_cut',
        reason: '2D output mode for SVG',
      },
    ]);
  });

  it('proposes a 2d_ entry for DXF format', () => {
    const result = propose2DExportAdjustments(
      { ...GENERIC_2D_PARAMS },
      GENERIC_2D_SCHEMA,
      'dxf'
    );
    expect(result.resolvedParameters.output_mode).toMatch(/^2d_/);
  });

  it('does not touch params without 2D enum values', () => {
    const result = propose2DExportAdjustments(
      { ...GENERIC_2D_PARAMS },
      GENERIC_2D_SCHEMA,
      'svg'
    );
    expect(result.resolvedParameters.border_style).toBe('rounded');
    expect(result.resolvedParameters.plate_width).toBe(80);
  });

  it('proposes nothing when the parameter is already 2D', () => {
    const params = { ...GENERIC_2D_PARAMS, output_mode: '2d_cut' };
    const result = propose2DExportAdjustments(params, GENERIC_2D_SCHEMA, 'svg');
    expect(result.changes).toEqual([]);
    expect(result.resolvedParameters).toBe(params);
  });
});

describe('propose2DExportAdjustments — keyguard rules via builtin manifest', () => {
  it('proposes the 2D generate entry via labeled enum (generic rule)', () => {
    const params = {
      generate: '0',
      type_of_keyguard: '0',
      use_Laser_Cutting_best_practices: 'No',
    };
    const result = propose2DExportAdjustments(
      params,
      KEYGUARD_SCHEMA,
      'svg',
      BUILTIN_EXPORT_2D
    );
    expect(result.resolvedParameters.generate).toBe('1');
  });

  it('proposes laser type_of_keyguard (project rule)', () => {
    const params = { generate: '0', type_of_keyguard: '0' };
    const result = propose2DExportAdjustments(
      params,
      KEYGUARD_SCHEMA,
      'svg',
      BUILTIN_EXPORT_2D
    );
    expect(result.resolvedParameters.type_of_keyguard).toBe('1');
    expect(
      result.changes.find((c) => c.name === 'type_of_keyguard')?.reason
    ).toBe('project 2D-export rule');
  });

  it('proposes Yes for laser-cutting best practices (project rule)', () => {
    const params = { use_Laser_Cutting_best_practices: 'No' };
    const result = propose2DExportAdjustments(
      params,
      KEYGUARD_SCHEMA,
      'dxf',
      BUILTIN_EXPORT_2D
    );
    expect(result.resolvedParameters.use_Laser_Cutting_best_practices).toBe(
      'Yes'
    );
  });

  it('does NOT apply keyguard rules without the manifest (no hardcoding)', () => {
    const params = { generate: '0', type_of_keyguard: '0' };
    const result = propose2DExportAdjustments(params, KEYGUARD_SCHEMA, 'svg');
    // generate still flips via the generic 2D-enum rule; type_of_keyguard
    // has no 2D keyword in its values so only the project rule targets it.
    expect(result.resolvedParameters.type_of_keyguard).toBe('0');
  });

  it('handles DXF format for labeled generate enum', () => {
    const params = { generate: '0' };
    const result = propose2DExportAdjustments(
      params,
      KEYGUARD_SCHEMA,
      'dxf',
      BUILTIN_EXPORT_2D
    );
    expect(result.resolvedParameters.generate).toBe('1');
  });

  it('ignores invalid paramMatching patterns without throwing', () => {
    const params = { use_Laser_Cutting_best_practices: 'No' };
    const result = propose2DExportAdjustments(params, KEYGUARD_SCHEMA, 'svg', {
      rules: [{ paramMatching: '(unclosed', toValue: 'yes' }],
    });
    expect(result.resolvedParameters.use_Laser_Cutting_best_practices).toBe(
      'No'
    );
  });
});

describe('propose2DExportAdjustments — intrinsic 2D schema', () => {
  it('proposes nothing (no mode-selector enum)', () => {
    const result = propose2DExportAdjustments(
      { ...INTRINSIC_2D_PARAMS },
      INTRINSIC_2D_SCHEMA,
      'svg'
    );
    expect(result.changes).toEqual([]);
  });
});

describe('propose2DExportAdjustments — unknown project (no 2D indicators)', () => {
  it('proposes nothing when no enum has 2D keywords', () => {
    const result = propose2DExportAdjustments(
      { ...UNKNOWN_PROJECT_PARAMS },
      UNKNOWN_PROJECT_SCHEMA,
      'svg'
    );
    expect(result.changes).toEqual([]);
  });
});

describe('propose2DExportAdjustments — does not mutate input', () => {
  it('returns a new resolvedParameters object when changes exist', () => {
    const params = { ...GENERIC_2D_PARAMS };
    const result = propose2DExportAdjustments(params, GENERIC_2D_SCHEMA, 'svg');
    expect(result.resolvedParameters).not.toBe(params);
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
