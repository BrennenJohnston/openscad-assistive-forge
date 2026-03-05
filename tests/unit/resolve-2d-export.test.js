/**
 * Unit tests for resolve2DExportParameters (src/main.js).
 *
 * Because resolve2DExportParameters is not exported from main.js, we test its
 * logic here using an inlined copy. Keep this copy in sync with main.js if the
 * implementation changes.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';

// ─── Inlined testable copy of resolve2DExportParameters ─────────────────────
// Mirrors src/main.js resolve2DExportParameters.
function resolve2DExportParameters(parameters, schema, format) {
  if (format !== 'svg' && format !== 'dxf') return parameters;
  const schemaParams = schema?.parameters;
  if (!schemaParams) return parameters;

  const resolved = { ...parameters };

  for (const [name, pDef] of Object.entries(schemaParams)) {
    const enumValues = pDef.enum;
    if (!Array.isArray(enumValues) || enumValues.length === 0) continue;

    if (name === 'generate') {
      const twoDEntry = enumValues.find((entry) => {
        const v = String(
          typeof entry === 'object' ? entry.value : entry
        ).toLowerCase();
        return (
          v.includes('svg') || v.includes('dxf') || v.includes('first layer')
        );
      });
      if (twoDEntry !== undefined) {
        resolved[name] =
          typeof twoDEntry === 'object' ? twoDEntry.value : twoDEntry;
      }
      continue;
    }

    if (name === 'type_of_keyguard') {
      const laserEntry = enumValues.find((entry) => {
        const v = String(
          typeof entry === 'object' ? entry.value : entry
        ).toLowerCase();
        return v.includes('laser');
      });
      if (laserEntry !== undefined) {
        resolved[name] =
          typeof laserEntry === 'object' ? laserEntry.value : laserEntry;
      }
      continue;
    }

    if (name === 'use_Laser_Cutting_best_practices') {
      const yesEntry = enumValues.find((entry) => {
        const v = String(
          typeof entry === 'object' ? entry.value : entry
        ).toLowerCase();
        return v === 'yes';
      });
      if (yesEntry !== undefined) {
        resolved[name] =
          typeof yesEntry === 'object' ? yesEntry.value : yesEntry;
      }
    }
  }

  return resolved;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('resolve2DExportParameters — passthrough for non-2D formats', () => {
  it('returns parameters unchanged for STL format', () => {
    const params = { width: 10, height: 20 };
    const schema = { parameters: { generate: { enum: ['SVG', '3D'] } } };
    const result = resolve2DExportParameters(params, schema, 'stl');
    expect(result).toBe(params);
  });

  it('returns parameters unchanged for OBJ format', () => {
    const params = { size: 5 };
    const result = resolve2DExportParameters(params, {}, 'obj');
    expect(result).toBe(params);
  });
});

describe('resolve2DExportParameters — missing schema', () => {
  it('returns parameters unchanged when schema is null', () => {
    const params = { width: 10 };
    const result = resolve2DExportParameters(params, null, 'svg');
    expect(result).toBe(params);
  });

  it('returns parameters unchanged when schema has no parameters', () => {
    const params = { width: 10 };
    const result = resolve2DExportParameters(params, {}, 'svg');
    expect(result).toBe(params);
  });
});

describe('resolve2DExportParameters — generate enum resolution', () => {
  it('selects the SVG entry from generate enum for SVG format', () => {
    const params = { generate: '3D Model' };
    const schema = {
      parameters: {
        generate: { enum: ['3D Model', 'SVG Export', 'Preview'] },
      },
    };
    const result = resolve2DExportParameters(params, schema, 'svg');
    expect(result.generate).toBe('SVG Export');
  });

  it('selects the DXF entry from generate enum for DXF format', () => {
    const params = { generate: '3D Model' };
    const schema = {
      parameters: {
        generate: { enum: ['3D Model', 'DXF Export'] },
      },
    };
    const result = resolve2DExportParameters(params, schema, 'dxf');
    expect(result.generate).toBe('DXF Export');
  });

  it('selects "first layer" entry from generate enum', () => {
    const params = { generate: '3D' };
    const schema = {
      parameters: {
        generate: { enum: ['3D', 'First Layer'] },
      },
    };
    const result = resolve2DExportParameters(params, schema, 'svg');
    expect(result.generate).toBe('First Layer');
  });

  it('handles object-style enum entries with value property', () => {
    const params = { generate: '3D Model' };
    const schema = {
      parameters: {
        generate: {
          enum: [{ value: '3D Model' }, { value: 'SVG Export' }],
        },
      },
    };
    const result = resolve2DExportParameters(params, schema, 'svg');
    expect(result.generate).toBe('SVG Export');
  });

  it('does not modify generate if no 2D entry exists', () => {
    const params = { generate: '3D Model' };
    const schema = {
      parameters: {
        generate: { enum: ['3D Model', 'Preview', 'Wireframe'] },
      },
    };
    const result = resolve2DExportParameters(params, schema, 'svg');
    expect(result.generate).toBe('3D Model');
  });
});

describe('resolve2DExportParameters — type_of_keyguard resolution', () => {
  it('selects laser entry for type_of_keyguard', () => {
    const params = { type_of_keyguard: '3D Printed' };
    const schema = {
      parameters: {
        type_of_keyguard: { enum: ['3D Printed', 'Laser Cut'] },
      },
    };
    const result = resolve2DExportParameters(params, schema, 'svg');
    expect(result.type_of_keyguard).toBe('Laser Cut');
  });
});

describe('resolve2DExportParameters — use_Laser_Cutting_best_practices', () => {
  it('selects "Yes" entry for laser cutting best practices', () => {
    const params = { use_Laser_Cutting_best_practices: 'No' };
    const schema = {
      parameters: {
        use_Laser_Cutting_best_practices: { enum: ['No', 'Yes'] },
      },
    };
    const result = resolve2DExportParameters(params, schema, 'dxf');
    expect(result.use_Laser_Cutting_best_practices).toBe('Yes');
  });
});

describe('resolve2DExportParameters — does not mutate input', () => {
  it('returns a new object without mutating the original parameters', () => {
    const params = { generate: '3D', width: 10 };
    const schema = {
      parameters: {
        generate: { enum: ['3D', 'SVG'] },
      },
    };
    const result = resolve2DExportParameters(params, schema, 'svg');
    expect(result).not.toBe(params);
    expect(params.generate).toBe('3D');
    expect(result.generate).toBe('SVG');
    expect(result.width).toBe(10);
  });
});

describe('resolve2DExportParameters — schema with no enum', () => {
  it('skips parameters without enum arrays', () => {
    const params = { width: 10, generate: '3D' };
    const schema = {
      parameters: {
        width: { type: 'number', minimum: 0 },
        generate: { enum: ['3D', 'SVG'] },
      },
    };
    const result = resolve2DExportParameters(params, schema, 'svg');
    expect(result.width).toBe(10);
    expect(result.generate).toBe('SVG');
  });

  it('skips parameters with empty enum arrays', () => {
    const params = { generate: '3D' };
    const schema = {
      parameters: {
        generate: { enum: [] },
      },
    };
    const result = resolve2DExportParameters(params, schema, 'svg');
    expect(result.generate).toBe('3D');
  });
});
