/**
 * Integration tests for Bracelet Clip Charm and Charm Customizer program
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
      'Design',
      'Design Layer 2',
      'Text',
      'Text Layer 2',
      'Fit',
      'Rounding',
      'Attachment',
      'Quality',
    ];
    for (const group of expectedGroups) {
      expect(groupIds).toContain(group);
    }
  });

  it('extracts charm_width in Fit group (renamed from charm_length)', () => {
    scadContent = readFileSync(scadPath, 'utf-8');
    parsed = extractParameters(scadContent);

    expect(parsed.parameters.charm_width).toBeDefined();
    expect(parsed.parameters.charm_width.default).toBe(22);
    expect(parsed.parameters.charm_width.minimum).toBe(10);
    expect(parsed.parameters.charm_width.maximum).toBe(40);

    expect(parsed.parameters.extrude_width).toBeUndefined();

    const groupIds = parsed.groups.map((g) => g.id);
    expect(groupIds).not.toContain('Dimensions');
  });

  it('extracts Fit parameters added in Phase 2', () => {
    scadContent = readFileSync(scadPath, 'utf-8');
    parsed = extractParameters(scadContent);

    expect(parsed.parameters.charm_height).toBeDefined();
    expect(parsed.parameters.charm_height.default).toBe(8.65);

    expect(parsed.parameters.charm_thickness).toBeDefined();
    expect(parsed.parameters.charm_thickness.default).toBe(2.75);
    expect(parsed.parameters.charm_thickness.minimum).toBe(2.25);
    expect(parsed.parameters.charm_thickness.maximum).toBe(4);

    expect(parsed.parameters.charm_length).toBeDefined();
    expect(parsed.parameters.charm_length.default).toBe(15);

    expect(parsed.parameters.gap_offset).toBeDefined();
    expect(parsed.parameters.gap_offset.default).toBe(2);
    expect(parsed.parameters.gap_offset.minimum).toBe(-4);
    expect(parsed.parameters.gap_offset.maximum).toBe(4);

    expect(parsed.parameters.gap_width).toBeDefined();
    expect(parsed.parameters.gap_width.default).toBe(3);
    expect(parsed.parameters.gap_width.minimum).toBe(2);
    expect(parsed.parameters.gap_width.maximum).toBe(8);
  });

  it('extracts Design parameters with Phase 9 updates', () => {
    scadContent = readFileSync(scadPath, 'utf-8');
    parsed = extractParameters(scadContent);

    expect(parsed.parameters.design_file).toBeDefined();
    expect(parsed.parameters.design_file.default).toBe('');

    expect(parsed.parameters.design_style).toBeDefined();
    expect(parsed.parameters.design_style.default).toBe('raised');
    expect(parsed.parameters.design_raised).toBeUndefined();

    expect(parsed.parameters.design_offset).toBeDefined();
    expect(parsed.parameters.design_offset.default).toBe(0);
    expect(parsed.parameters.design_offset.minimum).toBe(0);
    expect(parsed.parameters.design_offset.maximum).toBe(1.5);
  });

  it('extracts design_left_right and design_up_down position parameters (Phase 7)', () => {
    scadContent = readFileSync(scadPath, 'utf-8');
    parsed = extractParameters(scadContent);

    expect(parsed.parameters.design_left_right).toBeDefined();
    expect(parsed.parameters.design_left_right.default).toBe(0);
    expect(parsed.parameters.design_left_right.minimum).toBe(-10);
    expect(parsed.parameters.design_left_right.maximum).toBe(10);
    expect(parsed.parameters.design_left_right.group).toBe('Design');

    expect(parsed.parameters.design_up_down).toBeDefined();
    expect(parsed.parameters.design_up_down.default).toBe(0);
    expect(parsed.parameters.design_up_down.minimum).toBe(-10);
    expect(parsed.parameters.design_up_down.maximum).toBe(10);
    expect(parsed.parameters.design_up_down.group).toBe('Design');

    expect(parsed.parameters.design_x).toBeUndefined();
    expect(parsed.parameters.design_y).toBeUndefined();
  });

  it('extracts design_rotation parameter for SVG rotation', () => {
    scadContent = readFileSync(scadPath, 'utf-8');
    parsed = extractParameters(scadContent);

    expect(parsed.parameters.design_rotation).toBeDefined();
    expect(parsed.parameters.design_rotation.default).toBe(0);
    expect(parsed.parameters.design_rotation.minimum).toBe(-180);
    expect(parsed.parameters.design_rotation.maximum).toBe(180);
    expect(parsed.parameters.design_rotation.group).toBe('Design');
  });

  it('Border group removed in Phase 9', () => {
    scadContent = readFileSync(scadPath, 'utf-8');
    parsed = extractParameters(scadContent);

    const groupIds = parsed.groups.map((g) => g.id);
    expect(groupIds).not.toContain('Border');
    expect(parsed.parameters.add_border).toBeUndefined();
    expect(parsed.parameters.border_width).toBeUndefined();
    expect(parsed.parameters.border_height).toBeUndefined();
  });

  it('extracts Rounding parameters updated in Phase 4 remediation', () => {
    scadContent = readFileSync(scadPath, 'utf-8');
    parsed = extractParameters(scadContent);

    expect(parsed.parameters.rounding_mode).toBeUndefined();
    expect(parsed.parameters.sidesonly).toBeUndefined();

    expect(parsed.parameters.edge_radius).toBeDefined();
    expect(parsed.parameters.edge_radius.default).toBe(1.0);
    expect(parsed.parameters.edge_radius.minimum).toBe(0);
    expect(parsed.parameters.edge_radius.maximum).toBe(3);

    expect(parsed.parameters.side_edge_radius).toBeDefined();
    expect(parsed.parameters.side_edge_radius.default).toBe(2.5);
    expect(parsed.parameters.side_edge_radius.minimum).toBe(0);
    expect(parsed.parameters.side_edge_radius.maximum).toBe(3);

    expect(parsed.parameters.profile_corner_radius).toBeDefined();
    expect(parsed.parameters.profile_corner_radius.default).toBe(2);
    expect(parsed.parameters.profile_corner_radius.minimum).toBe(0);
    expect(parsed.parameters.profile_corner_radius.maximum).toBe(4);

    expect(parsed.parameters.inner_corner_radius).toBeDefined();
    expect(parsed.parameters.inner_corner_radius.default).toBe(1);
    expect(parsed.parameters.inner_corner_radius.minimum).toBe(0);
    expect(parsed.parameters.inner_corner_radius.maximum).toBe(3);

    const groupIds = parsed.groups.map((g) => g.id);
    expect(groupIds).toContain('Rounding');
  });

  it('extracts Text parameters with updated defaults (Phase 9)', () => {
    scadContent = readFileSync(scadPath, 'utf-8');
    parsed = extractParameters(scadContent);

    expect(parsed.parameters.text_content).toBeDefined();
    expect(parsed.parameters.text_size).toBeDefined();
    expect(parsed.parameters.text_left_right).toBeDefined();
    expect(parsed.parameters.text_left_right.default).toBe(6);
    expect(parsed.parameters.text_up_down).toBeDefined();
    expect(parsed.parameters.text_up_down.default).toBe(5.5);
    expect(parsed.parameters.text_x).toBeUndefined();
    expect(parsed.parameters.text_y).toBeUndefined();
    expect(parsed.parameters.text_depth).toBeDefined();
    expect(parsed.parameters.text_style).toBeDefined();
    expect(parsed.parameters.text_style.default).toBe('raised');
    expect(parsed.parameters.text_raised).toBeUndefined();
  });

  it('extracts Attachment parameters including position and depth from Phase 7', () => {
    scadContent = readFileSync(scadPath, 'utf-8');
    parsed = extractParameters(scadContent);

    expect(parsed.parameters.attachment_type).toBeDefined();
    expect(parsed.parameters.hole_diameter).toBeDefined();
    expect(parsed.parameters.bail_thickness).toBeDefined();
    expect(parsed.parameters.bail_inner_radius).toBeDefined();

    expect(parsed.parameters.attachment_x).toBeDefined();
    expect(parsed.parameters.attachment_x.default).toBe(0);
    expect(parsed.parameters.attachment_x.minimum).toBe(-10);
    expect(parsed.parameters.attachment_x.maximum).toBe(10);

    expect(parsed.parameters.attachment_y).toBeDefined();
    expect(parsed.parameters.attachment_y.default).toBe(0);
    expect(parsed.parameters.attachment_y.minimum).toBe(-10);
    expect(parsed.parameters.attachment_y.maximum).toBe(10);

    expect(parsed.parameters.attachment_z).toBeDefined();
    expect(parsed.parameters.attachment_z.default).toBe(0);
    expect(parsed.parameters.attachment_z.minimum).toBe(-5);
    expect(parsed.parameters.attachment_z.maximum).toBe(5);

    expect(parsed.parameters.attachment_depth).toBeDefined();
    expect(parsed.parameters.attachment_depth.default).toBe(0);
    expect(parsed.parameters.attachment_depth.minimum).toBe(0);
    expect(parsed.parameters.attachment_depth.maximum).toBe(10);
  });

  it('extracts Design Layer 2 parameters including Z-offset added in Phase 5', () => {
    scadContent = readFileSync(scadPath, 'utf-8');
    parsed = extractParameters(scadContent);

    expect(parsed.parameters.design_file_2).toBeDefined();
    expect(parsed.parameters.design_scale_2).toBeDefined();
    expect(parsed.parameters.design_2_left_right).toBeDefined();
    expect(parsed.parameters.design_2_up_down).toBeDefined();
    expect(parsed.parameters.design_style_2).toBeDefined();

    expect(parsed.parameters.design_2_thickness).toBeDefined();
    expect(parsed.parameters.design_2_thickness.default).toBe(0);
    expect(parsed.parameters.design_2_thickness.minimum).toBe(-3);
    expect(parsed.parameters.design_2_thickness.maximum).toBe(3);

    expect(parsed.parameters.design_x_2).toBeUndefined();
    expect(parsed.parameters.design_y_2).toBeUndefined();
    expect(parsed.parameters.design_z_2).toBeUndefined();

    expect(parsed.parameters.design_rotation_2).toBeDefined();
    expect(parsed.parameters.design_rotation_2.default).toBe(0);
    expect(parsed.parameters.design_rotation_2.minimum).toBe(-180);
    expect(parsed.parameters.design_rotation_2.maximum).toBe(180);
    expect(parsed.parameters.design_rotation_2.group).toBe('Design Layer 2');
  });

  it('extracts Text Layer 2 parameters', () => {
    scadContent = readFileSync(scadPath, 'utf-8');
    parsed = extractParameters(scadContent);

    expect(parsed.parameters.text_content_2).toBeDefined();
    expect(parsed.parameters.text_content_2.default).toBe('');
    expect(parsed.parameters.text_content_2.group).toBe('Text Layer 2');

    expect(parsed.parameters.text_depth_2).toBeDefined();
    expect(parsed.parameters.text_style_2).toBeDefined();
    expect(parsed.parameters.text_style_2.default).toBe('raised');
    expect(parsed.parameters.text_size_2).toBeDefined();
    expect(parsed.parameters.text_size_2.default).toBe(5);

    expect(parsed.parameters.text_2_left_right).toBeDefined();
    expect(parsed.parameters.text_2_left_right.default).toBe(-6);
    expect(parsed.parameters.text_2_up_down).toBeDefined();
    expect(parsed.parameters.text_2_up_down.default).toBe(5.5);

    expect(parsed.parameters.text_rotation_2).toBeDefined();
    expect(parsed.parameters.text_rotation_2.default).toBe(90);
    expect(parsed.parameters.text_rotation_2.minimum).toBe(-180);
    expect(parsed.parameters.text_rotation_2.maximum).toBe(180);
    expect(parsed.parameters.text_rotation_2.group).toBe('Text Layer 2');

    expect(parsed.parameters.text_2_thickness).toBeDefined();
    expect(parsed.parameters.text_2_thickness.default).toBe(0);
    expect(parsed.parameters.text_2_thickness.minimum).toBe(-3);
    expect(parsed.parameters.text_2_thickness.maximum).toBe(3);
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

      it('has program field set to charm-customizer', () => {
        const fullPath = join(PUBLIC_DIR, path);
        manifest = JSON.parse(readFileSync(fullPath, 'utf-8'));

        expect(manifest.program).toBe('charm-customizer');
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

  it('q-charm manifest has svgLibrary array with design_file and design_file_2', () => {
    const raw = readFileSync(
      join(PUBLIC_DIR, 'examples/q-charm/manifest.json'),
      'utf-8'
    );
    const manifest = JSON.parse(raw);

    expect(Array.isArray(manifest.svgLibrary)).toBe(true);
    expect(manifest.svgLibrary.length).toBe(2);

    const layer1 = manifest.svgLibrary.find((l) => l.paramName === 'design_file');
    expect(layer1).toBeDefined();
    expect(Array.isArray(layer1.options)).toBe(true);
    expect(layer1.options.length).toBeGreaterThan(0);
    for (const opt of layer1.options) {
      expect(typeof opt.file).toBe('string');
      expect(typeof opt.label).toBe('string');
    }

    const layer2 = manifest.svgLibrary.find((l) => l.paramName === 'design_file_2');
    expect(layer2).toBeDefined();
    expect(Array.isArray(layer2.options)).toBe(true);
    expect(layer2.options.length).toBeGreaterThan(0);
    for (const opt of layer2.options) {
      expect(typeof opt.file).toBe('string');
      expect(typeof opt.label).toBe('string');
    }
  });

  it('nasif-charm-maker manifest has svgLibrary as object (backward compat)', () => {
    const raw = readFileSync(
      join(PUBLIC_DIR, 'examples/nasif-charm-maker/manifest.json'),
      'utf-8'
    );
    const manifest = JSON.parse(raw);

    expect(manifest.svgLibrary).toBeDefined();
    expect(Array.isArray(manifest.svgLibrary)).toBe(false);
    expect(manifest.svgLibrary.paramName).toBe('design_file');
    expect(Array.isArray(manifest.svgLibrary.options)).toBe(true);
    expect(manifest.svgLibrary.options.length).toBeGreaterThan(0);
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

  it('q-charm and nasif-charm-maker are program examples (F-25 save prompt)', () => {
    const programExampleKeys = new Set();
    for (const prog of Object.values(PROGRAM_DEFINITIONS)) {
      for (const key of prog.examples) {
        programExampleKeys.add(key);
      }
    }

    expect(programExampleKeys.has('q-charm')).toBe(true);
    expect(programExampleKeys.has('nasif-charm-maker')).toBe(true);
    expect(programExampleKeys.has('logo-plate')).toBe(true);

    expect(programExampleKeys.has('simple-box')).toBe(false);
    expect(programExampleKeys.has('cylinder')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// F-26: SVG gallery exports from ui-generator
// ---------------------------------------------------------------------------

describe('SVG gallery module exports (F-26)', () => {
  it('exports setGalleryOptions and clearGalleryOptions', async () => {
    const mod = await import('../../src/js/ui-generator.js');
    expect(typeof mod.setGalleryOptions).toBe('function');
    expect(typeof mod.clearGalleryOptions).toBe('function');
  });

  it('exports setFileUploadListener for SVG upload hooks', async () => {
    const mod = await import('../../src/js/ui-generator.js');
    expect(typeof mod.setFileUploadListener).toBe('function');
  });

  it('exports appendUserSvgToGallery for dynamic gallery updates', async () => {
    const mod = await import('../../src/js/ui-generator.js');
    expect(typeof mod.appendUserSvgToGallery).toBe('function');
  });

  it('exports getGalleryParamNames for discovering active galleries', async () => {
    const mod = await import('../../src/js/ui-generator.js');
    expect(typeof mod.getGalleryParamNames).toBe('function');
    expect(Array.isArray(mod.getGalleryParamNames())).toBe(true);
  });
});
