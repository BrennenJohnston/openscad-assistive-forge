/**
 * Integration tests for the Stencil Maker tile.
 *
 * Validates:
 * - stencil_maker.scad parses and yields the expected parameter surface
 * - the design file param carries a D-108 aspect companion the UI hides
 * - manifest.json is well-formed and its gallery names only shipped files
 * - the registry ties the example to its program
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { extractParameters } from '../../src/js/parser.js';
import { isAspectCompanionParam } from '../../src/js/ui-generator.js';
import { programForExample, EXAMPLES } from '../../src/js/tile-registry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const EXAMPLE_DIR = join(__dirname, '../../public/examples/stencil-maker');

describe('stencil_maker.scad parser integration', () => {
  const scadContent = readFileSync(
    join(EXAMPLE_DIR, 'stencil_maker.scad'),
    'utf-8'
  );
  const parsed = extractParameters(scadContent);

  it('extracts the user-facing parameter groups', () => {
    const groupIds = parsed.groups.map((g) => g.id);
    for (const group of [
      'Output',
      'Design',
      'Plate',
      'Support bars',
      'Marks',
      'Laser',
      'Quality',
    ]) {
      expect(groupIds).toContain(group);
    }
  });

  it('offers the design as an image upload with an aspect companion', () => {
    const design = parsed.parameters.design_file;
    expect(design).toBeDefined();
    expect(design.uiType).toBe('file');
    expect(design.acceptedExtensions).toEqual(['svg', 'png', 'jpg']);
    expect(parsed.parameters.design_file_aspect).toBeDefined();
    expect(
      isAspectCompanionParam('design_file_aspect', parsed.parameters)
    ).toBe(true);
  });

  it('keeps the owner-approved physical defaults', () => {
    expect(parsed.parameters.plate_width.default).toBe(200);
    expect(parsed.parameters.plate_height.default).toBe(200);
    expect(parsed.parameters.plate_thickness.default).toBe(0.6);
    expect(parsed.parameters.margin.default).toBe(15);
  });

  it('scale means percent of the design area, 100 fills it', () => {
    const scale = parsed.parameters.design_scale;
    expect(scale.minimum).toBe(10);
    expect(scale.maximum).toBe(110);
  });

  it('support bars never go below the 1.2 mm sturdy web', () => {
    expect(parsed.parameters.bar_width.minimum).toBe(1.2);
    expect(parsed.parameters.bar_direction.enum.map((e) => e.value)).toEqual([
      'none',
      'horizontal',
      'vertical',
      'both',
    ]);
  });
});

describe('stencil-maker manifest and registry', () => {
  const manifest = JSON.parse(
    readFileSync(join(EXAMPLE_DIR, 'manifest.json'), 'utf-8')
  );

  it('gallery options all name files that ship with the tile', () => {
    expect(manifest.svgLibrary.paramName).toBe('design_file');
    for (const option of manifest.svgLibrary.options) {
      expect(manifest.files).toContain(option.file);
      expect(existsSync(join(EXAMPLE_DIR, option.file)), option.file).toBe(
        true
      );
    }
  });

  it('the default design ships beside the model (headless-safe)', () => {
    expect(existsSync(join(EXAMPLE_DIR, 'sample-design.svg'))).toBe(true);
    expect(EXAMPLES['stencil-maker'].additionalFiles).toContain(
      '/examples/stencil-maker/sample-design.svg'
    );
  });

  it('belongs to its own program', () => {
    expect(programForExample('stencil-maker')).toBe('stencil-maker');
  });
});
