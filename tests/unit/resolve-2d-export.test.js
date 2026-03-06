/**
 * Unit tests for resolve2DExportParameters (src/main.js) and the
 * buildDefineArgs numeric-coercion path (src/worker/openscad-worker.js).
 *
 * Because these functions are not exported from their respective modules, we
 * test their logic here using inlined copies. Keep each copy in sync with its
 * source if the implementation changes.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, vi } from 'vitest';

// ─── Inlined testable copy of resolve2DExportParameters ─────────────────────
// Mirrors src/main.js resolve2DExportParameters.
// Phase 3 change: laser-cutting best-practices param matched by case-insensitive
// regex instead of exact name equality.
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
        const l =
          typeof entry === 'object' && entry.label
            ? String(entry.label).toLowerCase()
            : v;
        return (
          v.includes('svg') ||
          v.includes('dxf') ||
          v.includes('first layer') ||
          l.includes('svg') ||
          l.includes('dxf') ||
          l.includes('first layer')
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
        const l =
          typeof entry === 'object' && entry.label
            ? String(entry.label).toLowerCase()
            : v;
        return v.includes('laser') || l.includes('laser');
      });
      if (laserEntry !== undefined) {
        resolved[name] =
          typeof laserEntry === 'object' ? laserEntry.value : laserEntry;
      }
      continue;
    }

    // Case-insensitive partial match — resilient against minor naming variations
    // (e.g. use_Laser_Cutting_best_practices, use_laser_cutting_best_practices)
    if (/laser.*(cut|cutting).*(best|pract)/i.test(name)) {
      const yesEntry = enumValues.find((entry) => {
        const v = String(
          typeof entry === 'object' ? entry.value : entry
        ).toLowerCase();
        const l =
          typeof entry === 'object' && entry.label
            ? String(entry.label).toLowerCase()
            : v;
        return v === 'yes' || l === 'yes';
      });
      if (yesEntry !== undefined) {
        resolved[name] =
          typeof yesEntry === 'object' ? yesEntry.value : yesEntry;
      }
    }
  }

  return resolved;
}

// ─── Helper: does schema contain a laser-cut best-practices param? ──────────
function schemaHasLaserCutParam(schemaParams) {
  return Object.keys(schemaParams).some((name) =>
    /laser.*(cut|cutting).*(best|pract)/i.test(name)
  );
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

  it('resolves labeled enum where value is numeric and label contains "first layer for SVG/DXF file"', () => {
    // Exact format produced by OpenSCAD [0:3d printed keyguard, 1:first layer for SVG/DXF file]
    const params = { generate: '0' };
    const schema = {
      parameters: {
        generate: {
          enum: [
            { value: '0', label: '3d printed keyguard' },
            { value: '1', label: 'first layer for SVG/DXF file' },
          ],
        },
      },
    };
    const result = resolve2DExportParameters(params, schema, 'svg');
    expect(result.generate).toBe('1');
  });

  it('resolves labeled enum where label contains "svg"', () => {
    const params = { generate: '0' };
    const schema = {
      parameters: {
        generate: {
          enum: [
            { value: '0', label: '3D Model' },
            { value: '1', label: 'SVG output' },
          ],
        },
      },
    };
    const result = resolve2DExportParameters(params, schema, 'svg');
    expect(result.generate).toBe('1');
  });

  it('resolves labeled enum where label contains "dxf"', () => {
    const params = { generate: '0' };
    const schema = {
      parameters: {
        generate: {
          enum: [
            { value: '0', label: '3D print' },
            { value: '2', label: 'DXF laser cut' },
          ],
        },
      },
    };
    const result = resolve2DExportParameters(params, schema, 'dxf');
    expect(result.generate).toBe('2');
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

  it('selects laser entry via label for labeled enum type_of_keyguard', () => {
    const params = { type_of_keyguard: '0' };
    const schema = {
      parameters: {
        type_of_keyguard: {
          enum: [
            { value: '0', label: '3D printed keyguard' },
            { value: '1', label: 'Laser cut keyguard' },
          ],
        },
      },
    };
    const result = resolve2DExportParameters(params, schema, 'svg');
    expect(result.type_of_keyguard).toBe('1');
  });
});

describe('resolve2DExportParameters — use_Laser_Cutting_best_practices (case-insensitive regex)', () => {
  it('selects "Yes" entry with exact canonical name', () => {
    const params = { use_Laser_Cutting_best_practices: 'No' };
    const schema = {
      parameters: {
        use_Laser_Cutting_best_practices: { enum: ['No', 'Yes'] },
      },
    };
    const result = resolve2DExportParameters(params, schema, 'dxf');
    expect(result.use_Laser_Cutting_best_practices).toBe('Yes');
  });

  it('selects "yes" entry via label for labeled enum with canonical name', () => {
    const params = { use_Laser_Cutting_best_practices: '0' };
    const schema = {
      parameters: {
        use_Laser_Cutting_best_practices: {
          enum: [
            { value: '0', label: 'No' },
            { value: '1', label: 'Yes' },
          ],
        },
      },
    };
    const result = resolve2DExportParameters(params, schema, 'dxf');
    expect(result.use_Laser_Cutting_best_practices).toBe('1');
  });

  it('matches lowercase variant use_laser_cutting_best_practices', () => {
    const params = { use_laser_cutting_best_practices: 'no' };
    const schema = {
      parameters: {
        use_laser_cutting_best_practices: { enum: ['no', 'yes'] },
      },
    };
    const result = resolve2DExportParameters(params, schema, 'svg');
    expect(result.use_laser_cutting_best_practices).toBe('yes');
  });

  it('matches mixed-case variant useLaserCuttingBestPractices', () => {
    const params = { useLaserCuttingBestPractices: 'No' };
    const schema = {
      parameters: {
        useLaserCuttingBestPractices: { enum: ['No', 'Yes'] },
      },
    };
    const result = resolve2DExportParameters(params, schema, 'svg');
    expect(result.useLaserCuttingBestPractices).toBe('Yes');
  });
});

describe('schemaHasLaserCutParam — warning helper', () => {
  it('returns true for use_Laser_Cutting_best_practices', () => {
    expect(
      schemaHasLaserCutParam({ use_Laser_Cutting_best_practices: {} })
    ).toBe(true);
  });

  it('returns true for use_laser_cutting_best_practices (lowercase)', () => {
    expect(
      schemaHasLaserCutParam({ use_laser_cutting_best_practices: {} })
    ).toBe(true);
  });

  it('returns true for useLaserCuttingBestPractices (camelCase)', () => {
    expect(
      schemaHasLaserCutParam({ useLaserCuttingBestPractices: {} })
    ).toBe(true);
  });

  it('returns false when no laser-cutting param exists', () => {
    expect(
      schemaHasLaserCutParam({ generate: {}, type_of_keyguard: {} })
    ).toBe(false);
  });

  it('returns false for an empty schema', () => {
    expect(schemaHasLaserCutParam({})).toBe(false);
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

// ─── Inlined testable copy of buildDefineArgs (src/worker/openscad-worker.js) ─
// Mirrors the numeric-coercion path added in Phase 1 of the round-4+5 bugfix
// queue. Keep in sync with openscad-worker.js buildDefineArgs if the
// implementation changes.
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
      } else if (isBooleanParam && (lowerValue === 'false' || lowerValue === 'no')) {
        formattedValue = 'false';
      } else if (/^#?[0-9A-Fa-f]{6}$/.test(value)) {
        formattedValue = `"${value}"`;
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
    } else if (Array.isArray(value)) {
      formattedValue = JSON.stringify(value);
    } else {
      formattedValue = JSON.stringify(value);
    }
    args.push('-D');
    args.push(`${key}=${formattedValue}`);
  }
  return args;
}

// ─── buildDefineArgs: numeric-coercion tests ─────────────────────────────────

describe('buildDefineArgs — numeric paramType coercion (Phase 1 regression)', () => {
  it('emits unquoted integer when paramType is integer and value is a numeric string', () => {
    const args = buildDefineArgs({ generate: '1' }, { generate: 'integer' });
    expect(args).toContain('-D');
    expect(args).toContain('generate=1');
  });

  it('emits unquoted number when paramType is number and value is a numeric string', () => {
    const args = buildDefineArgs({ angle: '45' }, { angle: 'number' });
    expect(args).toContain('angle=45');
  });

  it('still quotes string value when paramType is string, even if value looks numeric', () => {
    const args = buildDefineArgs({ generate: '1' }, { generate: 'string' });
    expect(args).toContain('generate="1"');
  });

  it('still quotes yes/no when paramType is string (not boolean)', () => {
    const args = buildDefineArgs(
      { use_Laser_Cutting_best_practices: 'Yes' },
      { use_Laser_Cutting_best_practices: 'string' }
    );
    expect(args).toContain('use_Laser_Cutting_best_practices="Yes"');
  });

  it('emits true/false for boolean paramType with yes/no string values', () => {
    const args = buildDefineArgs({ flag: 'yes' }, { flag: 'boolean' });
    expect(args).toContain('flag=true');
  });

  it('end-to-end: resolve then build — numeric generate enum produces unquoted arg', () => {
    const params = { generate: '0' };
    const schema = {
      parameters: {
        generate: {
          enum: [
            { value: '0', label: '3d printed keyguard' },
            { value: '1', label: 'first layer for SVG/DXF file' },
          ],
        },
      },
    };
    const resolved = resolve2DExportParameters(params, schema, 'svg');
    expect(resolved.generate).toBe('1');
    const args = buildDefineArgs(resolved, { generate: 'integer' });
    expect(args).toContain('generate=1');
    expect(args).not.toContain('generate="1"');
  });

  it('end-to-end: resolve then build — string use_Laser_Cutting_best_practices stays quoted', () => {
    const params = { use_Laser_Cutting_best_practices: 'No' };
    const schema = {
      parameters: {
        use_Laser_Cutting_best_practices: { enum: ['No', 'Yes'] },
      },
    };
    const resolved = resolve2DExportParameters(params, schema, 'dxf');
    expect(resolved.use_Laser_Cutting_best_practices).toBe('Yes');
    const args = buildDefineArgs(resolved, {
      use_Laser_Cutting_best_practices: 'string',
    });
    expect(args).toContain('use_Laser_Cutting_best_practices="Yes"');
  });
});
