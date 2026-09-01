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
import {
  isAspectCompanionParam,
  isLayerCompanionParam,
} from '../../src/js/ui-generator.js';
import { JIG_DEFAULTS } from '../../src/js/stencil-jig.js';
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

  it('offers eight plates, which is the paint-colour cap and not the relief one', () => {
    // LAYER_EMIT_CAP is 3 and belongs to the charm relief engine.
    // STENCIL_PLATE_CAP is 8 and belongs here: the owner's own cat is six
    // colours, and walking the wrong cap stopped it at three plates.
    for (let n = 1; n <= 8; n++) {
      const param = parsed.parameters[`stencil_plate_${n}`];
      expect(param, `stencil_plate_${n}`).toBeDefined();
      expect(param.uiType).toBe('file');
      expect(isLayerCompanionParam(`stencil_plate_${n}`, parsed.parameters)).toBe(
        true
      );
    }
    expect(parsed.parameters.stencil_plate_9).toBeUndefined();
    expect(parsed.parameters.plate_number.maximum).toBe(8);
  });

  it('can make the jig base as well as a plate', () => {
    expect(parsed.parameters.output_part.enum.map((e) => e.value)).toEqual([
      'plate',
      'jig_base',
    ]);
    expect(parsed.parameters.registration.enum.map((e) => e.value)).toEqual([
      'crosses',
      'pegs',
      'both',
    ]);
    expect(parsed.parameters.plate_label.enum.map((e) => e.value)).toEqual([
      'cut',
      'none',
    ]);
  });

  it("carries the jig numbers measured off the owner's own base plate", () => {
    expect(parsed.parameters.peg_diameter.default).toBe(3.0);
    expect(parsed.parameters.key_width.default).toBe(3.0);
    expect(parsed.parameters.key_depth.default).toBe(2.0);
    expect(parsed.parameters.feature_inset.default).toBe(2.5);
    expect(parsed.parameters.peg_height.default).toBe(4.4);
    // The one number the reference does NOT carry: their holes are exactly
    // the size of their pegs, which is a CAD fit and not a print fit.
    expect(parsed.parameters.hole_clearance.default).toBe(0.2);
    expect(parsed.parameters.hole_clearance.minimum).toBe(0);
    expect(parsed.parameters.hole_clearance.maximum).toBe(0.5);
  });

  it('asserts every jig range, so a bad number stops the render', () => {
    for (const name of [
      'peg_diameter',
      'key_width',
      'key_depth',
      'feature_inset',
      'peg_height',
      'hole_clearance',
      'plate_number',
    ]) {
      expect(scadContent, name).toContain(`assert(${name} >= `);
    }
    expect(scadContent).toContain('the registration holes would break the edge');
    expect(scadContent).toContain('the plate number does not fit in the margin');
  });

  it('agrees with stencil-jig.js about the numbers, in both places', () => {
    expect(parsed.parameters.peg_diameter.default).toBe(JIG_DEFAULTS.pegDiameter);
    expect(parsed.parameters.key_width.default).toBe(JIG_DEFAULTS.keyWidth);
    expect(parsed.parameters.key_depth.default).toBe(JIG_DEFAULTS.keyDepth);
    expect(parsed.parameters.feature_inset.default).toBe(
      JIG_DEFAULTS.featureInset
    );
    expect(parsed.parameters.peg_height.default).toBe(JIG_DEFAULTS.pegHeight);
    expect(parsed.parameters.hole_clearance.default).toBe(
      JIG_DEFAULTS.holeClearance
    );
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
