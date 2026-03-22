/**
 * Integration tests for Q-Charm and Nasif's Charm Maker program
 *
 * Validates:
 * - q_charm.scad parses without errors and yields expected parameters
 * - All three program manifest.json files are well-formed
 * - Every additionalFiles path in EXAMPLE_DEFINITIONS resolves to a real file
 * - PROGRAM_DEFINITIONS only references valid EXAMPLE_DEFINITIONS keys
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { extractParameters } from '../../src/js/parser.js';
import {
  EXAMPLE_DEFINITIONS,
  PROGRAM_DEFINITIONS,
} from '../../src/js/file-handler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PUBLIC_DIR = join(__dirname, '../../public');

// ---------------------------------------------------------------------------
// q_charm.scad parser integration
// ---------------------------------------------------------------------------

describe('q_charm.scad parser integration', () => {
  const scadPath = join(PUBLIC_DIR, 'examples/q-charm/q_charm.scad');
  let scadContent;
  let parsed;

  it('scad file exists on disk', () => {
    expect(existsSync(scadPath)).toBe(true);
    scadContent = readFileSync(scadPath, 'utf-8');
    expect(scadContent.length).toBeGreaterThan(0);
  });

  it('parses without throwing', () => {
    scadContent = readFileSync(scadPath, 'utf-8');
    expect(() => {
      parsed = extractParameters(scadContent);
    }).not.toThrow();
  });

  it('extracts user-facing parameter groups', () => {
    scadContent = readFileSync(scadPath, 'utf-8');
    parsed = extractParameters(scadContent);

    const groupIds = parsed.groups.map((g) => g.id);
    const expectedGroups = [
      'Dimensions',
      'Fit',
      'Design',
      'Design Layer 2',
      'Text',
      'Border',
      'Rounding',
      'Attachment',
      'Quality',
    ];
    for (const group of expectedGroups) {
      expect(groupIds).toContain(group);
    }
  });

  it('extracts core Dimensions parameters', () => {
    scadContent = readFileSync(scadPath, 'utf-8');
    parsed = extractParameters(scadContent);

    expect(parsed.parameters.extrude_width).toBeDefined();
    expect(parsed.parameters.extrude_width.default).toBe(20);
    expect(parsed.parameters.extrude_width.minimum).toBe(10);
    expect(parsed.parameters.extrude_width.maximum).toBe(40);
  });

  it('extracts Fit parameters added in Phase 2', () => {
    scadContent = readFileSync(scadPath, 'utf-8');
    parsed = extractParameters(scadContent);

    expect(parsed.parameters.charm_height).toBeDefined();
    expect(parsed.parameters.charm_height.default).toBe(8.5);

    expect(parsed.parameters.charm_thickness).toBeDefined();
    expect(parsed.parameters.charm_thickness.default).toBe(3);
    expect(parsed.parameters.charm_thickness.maximum).toBe(4);

    expect(parsed.parameters.bracelet_width).toBeDefined();
    expect(parsed.parameters.bracelet_width.default).toBe(14);

    expect(parsed.parameters.gap_offset).toBeDefined();
    expect(parsed.parameters.gap_offset.default).toBe(0);
    expect(parsed.parameters.gap_offset.minimum).toBe(-4);
    expect(parsed.parameters.gap_offset.maximum).toBe(4);

    expect(parsed.parameters.gap_width).toBeDefined();
    expect(parsed.parameters.gap_width.default).toBe(4);
    expect(parsed.parameters.gap_width.minimum).toBe(2);
    expect(parsed.parameters.gap_width.maximum).toBe(8);
  });

  it('extracts design_offset parameter added in Phase 3', () => {
    scadContent = readFileSync(scadPath, 'utf-8');
    parsed = extractParameters(scadContent);

    expect(parsed.parameters.design_offset).toBeDefined();
    expect(parsed.parameters.design_offset.default).toBe(0.6);
    expect(parsed.parameters.design_offset.minimum).toBe(0);
    expect(parsed.parameters.design_offset.maximum).toBe(1.5);
  });

  it('extracts Text parameters added in Phase 4', () => {
    scadContent = readFileSync(scadPath, 'utf-8');
    parsed = extractParameters(scadContent);

    expect(parsed.parameters.text_content).toBeDefined();
    expect(parsed.parameters.text_size).toBeDefined();
    expect(parsed.parameters.text_x).toBeDefined();
    expect(parsed.parameters.text_y).toBeDefined();
    expect(parsed.parameters.text_depth).toBeDefined();
    expect(parsed.parameters.text_raised).toBeDefined();
  });

  it('extracts Attachment parameters added in Phase 6', () => {
    scadContent = readFileSync(scadPath, 'utf-8');
    parsed = extractParameters(scadContent);

    expect(parsed.parameters.attachment_type).toBeDefined();
    expect(parsed.parameters.hole_diameter).toBeDefined();
    expect(parsed.parameters.bail_thickness).toBeDefined();
    expect(parsed.parameters.bail_inner_radius).toBeDefined();
  });

  it('extracts Design Layer 2 parameters added in Phase 7', () => {
    scadContent = readFileSync(scadPath, 'utf-8');
    parsed = extractParameters(scadContent);

    expect(parsed.parameters.design_file_2).toBeDefined();
    expect(parsed.parameters.design_scale_2).toBeDefined();
    expect(parsed.parameters.design_x_2).toBeDefined();
    expect(parsed.parameters.design_y_2).toBeDefined();
    expect(parsed.parameters.design_raised_2).toBeDefined();
  });

  it('has at least 20 user-facing parameters', () => {
    scadContent = readFileSync(scadPath, 'utf-8');
    parsed = extractParameters(scadContent);

    const paramCount = Object.keys(parsed.parameters).length;
    expect(paramCount).toBeGreaterThanOrEqual(20);
  });
});

// ---------------------------------------------------------------------------
// Manifest.json schema validity
// ---------------------------------------------------------------------------

describe('Charm Maker program manifests', () => {
  const manifests = [
    { key: 'q-charm', path: 'examples/q-charm/manifest.json' },
    {
      key: 'nasif-charm-maker',
      path: 'examples/nasif-charm-maker/manifest.json',
    },
    { key: 'logo-plate', path: 'examples/logo-plate/manifest.json' },
  ];

  for (const { key, path } of manifests) {
    describe(`${key} manifest`, () => {
      let manifest;

      it('exists on disk', () => {
        const fullPath = join(PUBLIC_DIR, path);
        expect(existsSync(fullPath)).toBe(true);
      });

      it('is valid JSON', () => {
        const fullPath = join(PUBLIC_DIR, path);
        const raw = readFileSync(fullPath, 'utf-8');
        expect(() => {
          manifest = JSON.parse(raw);
        }).not.toThrow();
      });

      it('has required fields: name, main, files', () => {
        const fullPath = join(PUBLIC_DIR, path);
        manifest = JSON.parse(readFileSync(fullPath, 'utf-8'));

        expect(typeof manifest.name).toBe('string');
        expect(manifest.name.length).toBeGreaterThan(0);
        expect(typeof manifest.main).toBe('string');
        expect(manifest.main.endsWith('.scad')).toBe(true);
        expect(Array.isArray(manifest.files)).toBe(true);
        expect(manifest.files.length).toBeGreaterThan(0);
      });

      it('has program field set to nasifs-charm-maker', () => {
        const fullPath = join(PUBLIC_DIR, path);
        manifest = JSON.parse(readFileSync(fullPath, 'utf-8'));

        expect(manifest.program).toBe('nasifs-charm-maker');
      });

      it('has inspired_by attribution', () => {
        const fullPath = join(PUBLIC_DIR, path);
        manifest = JSON.parse(readFileSync(fullPath, 'utf-8'));

        expect(manifest.inspired_by).toBeDefined();
        expect(typeof manifest.inspired_by.name).toBe('string');
      });

      it('main scad file listed in files array exists on disk', () => {
        const fullPath = join(PUBLIC_DIR, path);
        manifest = JSON.parse(readFileSync(fullPath, 'utf-8'));

        const exampleDir = join(PUBLIC_DIR, path, '..');
        const mainPath = join(exampleDir, manifest.main);
        expect(existsSync(mainPath)).toBe(true);
      });
    });
  }

  it('q-charm manifest has svgLibrary with options', () => {
    const raw = readFileSync(
      join(PUBLIC_DIR, 'examples/q-charm/manifest.json'),
      'utf-8'
    );
    const manifest = JSON.parse(raw);

    expect(manifest.svgLibrary).toBeDefined();
    expect(manifest.svgLibrary.paramName).toBe('design_file');
    expect(Array.isArray(manifest.svgLibrary.options)).toBe(true);
    expect(manifest.svgLibrary.options.length).toBeGreaterThan(0);

    for (const opt of manifest.svgLibrary.options) {
      expect(typeof opt.file).toBe('string');
      expect(typeof opt.label).toBe('string');
    }
  });
});

// ---------------------------------------------------------------------------
// EXAMPLE_DEFINITIONS additionalFiles path resolution
// ---------------------------------------------------------------------------

describe('EXAMPLE_DEFINITIONS file path resolution', () => {
  const examplesWithAdditionalFiles = Object.entries(EXAMPLE_DEFINITIONS)
    .filter(([, def]) => def.additionalFiles?.length > 0);

  for (const [key, def] of examplesWithAdditionalFiles) {
    describe(`${key}`, () => {
      it('main scad path resolves to a real file', () => {
        const filePath = join(PUBLIC_DIR, def.path.replace(/^\/examples\//, 'examples/'));
        expect(existsSync(filePath)).toBe(true);
      });

      for (const additionalFile of def.additionalFiles) {
        it(`additionalFile ${additionalFile.split('/').pop()} exists`, () => {
          const filePath = join(
            PUBLIC_DIR,
            additionalFile.replace(/^\/examples\//, 'examples/')
          );
          expect(existsSync(filePath)).toBe(true);
        });
      }

      if (def.manifest) {
        it('manifest path resolves to a real file', () => {
          const filePath = join(
            PUBLIC_DIR,
            def.manifest.replace(/^\/examples\//, 'examples/')
          );
          expect(existsSync(filePath)).toBe(true);
        });
      }
    });
  }
});

// ---------------------------------------------------------------------------
// PROGRAM_DEFINITIONS validity
// ---------------------------------------------------------------------------

describe('PROGRAM_DEFINITIONS', () => {
  it('is a non-empty object', () => {
    expect(typeof PROGRAM_DEFINITIONS).toBe('object');
    expect(Object.keys(PROGRAM_DEFINITIONS).length).toBeGreaterThan(0);
  });

  for (const [programKey, programDef] of Object.entries(PROGRAM_DEFINITIONS)) {
    describe(`program "${programKey}"`, () => {
      it('has a label string', () => {
        expect(typeof programDef.label).toBe('string');
        expect(programDef.label.length).toBeGreaterThan(0);
      });

      it('has a non-empty examples array', () => {
        expect(Array.isArray(programDef.examples)).toBe(true);
        expect(programDef.examples.length).toBeGreaterThan(0);
      });

      for (const exKey of programDef.examples) {
        it(`references valid example key "${exKey}"`, () => {
          expect(EXAMPLE_DEFINITIONS).toHaveProperty(exKey);
        });
      }
    });
  }
});
