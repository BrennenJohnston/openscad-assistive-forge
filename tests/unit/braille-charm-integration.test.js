/**
 * Integration tests for the Braille Charm example
 *
 * Validates (mirroring braille-card-integration.test.js):
 * - braille_charm.scad parses and exposes the expected parameters
 * - manifest.json is well-formed, including the charm-mode
 *   brailleTranslation block
 * - EXAMPLE_DEFINITIONS / PROGRAM_DEFINITIONS entries are consistent
 * - GPL-3.0-or-later licensing
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { extractParameters } from '../../src/js/parser.js';
import {
  EXAMPLE_DEFINITIONS,
  PROGRAM_DEFINITIONS,
} from '../../src/js/file-handler.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, '../../public');
const SCAD_PATH = join(PUBLIC_DIR, 'examples/braille-charm/braille_charm.scad');
const MANIFEST_PATH = join(PUBLIC_DIR, 'examples/braille-charm/manifest.json');

const readScad = () => readFileSync(SCAD_PATH, 'utf-8');
const readManifest = () => JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));

describe('braille_charm.scad parser integration', () => {
  it('scad file exists on disk', () => {
    expect(existsSync(SCAD_PATH)).toBe(true);
    expect(readScad().length).toBeGreaterThan(0);
  });

  it('parses without throwing', () => {
    expect(() => extractParameters(readScad())).not.toThrow();
  });

  it('extracts the braille_chars string parameter with a braille default', () => {
    const parsed = extractParameters(readScad());
    const param = parsed.parameters.braille_chars;
    expect(param).toBeDefined();
    expect(param.type).toBe('string');
    // Capital indicator + a (charm default "A")
    expect(param.default).toBe('\u2820\u2801');
  });

  it('extracts the charm shape parameters', () => {
    const parsed = extractParameters(readScad());
    expect(parsed.parameters.charm_width.default).toBe(30);
    expect(parsed.parameters.charm_thickness.default).toBe(3);
    expect(parsed.parameters.attachment_type.default).toBe('keychain_hole');
  });

  it('extracts the multi-charm layout parameters', () => {
    const parsed = extractParameters(readScad());
    expect(parsed.parameters.charm_layout).toBeDefined();
    expect(parsed.parameters.charm_layout.default).toBe('Single');
    expect(parsed.parameters.charm_layout.enum.map((e) => e.value)).toEqual([
      'Single',
      'All charms',
    ]);
    expect(parsed.parameters.charm_gap_mm.default).toBe(5);
    for (let i = 1; i <= 12; i++) {
      const param = parsed.parameters[`Charm_${i}`];
      expect(param, `Charm_${i}`).toBeDefined();
      expect(param.type).toBe('string');
      expect(param.default).toBe('');
    }
  });

  it('defaults to the bracelet_clip shape with its own clip parameters', () => {
    const parsed = extractParameters(readScad());
    expect(parsed.parameters.charm_shape.default).toBe('bracelet_clip');
    expect(parsed.parameters.charm_shape.enum[0].value).toBe('bracelet_clip');
    // Clip fit parameters mirror the Bracelet Clip Charm (q_charm.scad)
    expect(parsed.parameters.clip_channel_length.default).toBe(15);
    expect(parsed.parameters.clip_height.default).toBe(22);
    expect(parsed.parameters.clip_profile_depth.default).toBe(8.65);
    expect(parsed.parameters.clip_wall_thickness.default).toBe(2.25);
    expect(parsed.parameters.clip_gap_width.default).toBe(3);
    // Rounding mirrors q_charm's edge_radius / side_edge_radius defaults
    expect(parsed.parameters.clip_edge_radius.default).toBe(1.0);
    expect(parsed.parameters.clip_side_radius.default).toBe(2.5);
    // Clip params only show when the clip shape is selected
    expect(parsed.parameters.clip_height.dependency).toEqual({
      parameter: 'charm_shape',
      operator: '==',
      value: 'bracelet_clip',
    });
  });

  it('rotates the clip braille 90 degrees and centers it by default', () => {
    const parsed = extractParameters(readScad());
    expect(parsed.parameters.clip_braille_rotation.default).toBe(90);
    expect(
      parsed.parameters.clip_braille_rotation.enum.map((e) => Number(e.value))
    ).toEqual([90, -90]);
    expect(parsed.parameters.clip_braille_left_right.default).toBe(0);
    expect(parsed.parameters.clip_braille_up_down.default).toBe(0);
  });

  it('defaults to angled printing with a flat first-layer contact strip', () => {
    const parsed = extractParameters(readScad());
    expect(parsed.parameters.print_orientation.default).toBe('Angled');
    expect(
      parsed.parameters.print_orientation.enum.map((e) => e.value)
    ).toContain('Flat');
    expect(parsed.parameters.face_angle_deg.default).toBe(75);
    expect(parsed.parameters.support_fin.default).toBe('On');
    expect(parsed.parameters.bed_contact_mm.default).toBe(2.0);
  });

  it('uses a slimmer support fin than the wedge card with >= 3 bridges', () => {
    const parsed = extractParameters(readScad());
    expect(parsed.parameters.fin_thickness_mm.default).toBeLessThan(1.2);
    expect(parsed.parameters.bridge_count.default).toBeGreaterThanOrEqual(3);
    expect(parsed.parameters.brim_width_mm.default).toBeLessThan(2.0);
    // Taller charms auto-add bridges (~one per 10 mm of fin height)
    expect(readScad()).toContain('effective_bridge_count');
  });

  it('keeps ADA-friendly rounded dot defaults (total height <= 0.9 mm)', () => {
    const parsed = extractParameters(readScad());
    expect(parsed.parameters.dot_shape.default).toBe('Rounded');
    const total =
      parsed.parameters.rounded_dot_base_height.default +
      parsed.parameters.rounded_dot_dome_height.default;
    expect(total).toBeLessThanOrEqual(0.9);
  });

  it('carries a GPL-3.0-or-later header with attributions', () => {
    const content = readScad();
    expect(content).toContain('GPL-3.0-or-later');
    expect(content).toContain('Nasif');
    expect(content).toContain('braille-charm-openscad');
  });
});

describe('braille-charm manifest', () => {
  it('exists and is valid JSON', () => {
    expect(existsSync(MANIFEST_PATH)).toBe(true);
    expect(() => readManifest()).not.toThrow();
  });

  it('has required fields: name, main, files, license', () => {
    const manifest = readManifest();
    expect(typeof manifest.name).toBe('string');
    expect(manifest.main).toBe('braille_charm.scad');
    expect(manifest.files).toContain('braille_charm.scad');
    expect(manifest.license).toBe('GPL-3.0-or-later');
  });

  it('has program field set to braille-card-customizer', () => {
    expect(readManifest().program).toBe('braille-card-customizer');
  });

  it('declares charm-mode brailleTranslation with a real charParam', () => {
    const bt = readManifest().brailleTranslation;
    expect(bt).toBeDefined();
    expect(bt.mode).toBe('charm');
    expect(bt.maxCells).toBe(2);

    const parsed = extractParameters(readScad());
    expect(parsed.parameters[bt.charParam]).toBeDefined();
  });

  it('declares the default table and catalog URL', () => {
    const bt = readManifest().brailleTranslation;
    expect(bt.defaultTable).toBe('en-ueb-g1.ctb');
    expect(bt.tablesCatalog).toBe('/liblouis/tables.json');
  });

  it('declares multiCharmParams referencing real SCAD parameters', () => {
    const bt = readManifest().brailleTranslation;
    expect(bt.multiCharmParams).toBeDefined();
    expect(bt.multiCharmParams.charmParams).toEqual(
      Array.from({ length: 12 }, (_, i) => `Charm_${i + 1}`)
    );

    const parsed = extractParameters(readScad());
    for (const name of bt.multiCharmParams.charmParams) {
      expect(parsed.parameters[name], name).toBeDefined();
    }
    expect(parsed.parameters[bt.multiCharmParams.charmLayout]).toBeDefined();
    expect(parsed.parameters[bt.multiCharmParams.charmGap]).toBeDefined();
  });

  it('has inspired_by attribution', () => {
    const manifest = readManifest();
    expect(manifest.inspired_by).toBeDefined();
    expect(typeof manifest.inspired_by.name).toBe('string');
  });
});

describe('braille-charm bracelet clip presets', () => {
  const PRESET_DIR = join(PUBLIC_DIR, 'examples/braille-charm/presets');
  const presetFiles = ['large-charm.json', 'small-charm.json'];

  it.each(presetFiles)('%s is a valid Forge preset for this model', (file) => {
    const presetPath = join(PRESET_DIR, file);
    expect(existsSync(presetPath)).toBe(true);
    const data = JSON.parse(readFileSync(presetPath, 'utf-8'));
    expect(data.type).toBe('openscad-preset');
    expect(data.modelName).toBe('braille_charm.scad');
    expect(typeof data.preset.name).toBe('string');

    // Every preset parameter must exist in the SCAD schema
    const parsed = extractParameters(readScad());
    for (const paramName of Object.keys(data.preset.parameters)) {
      expect(parsed.parameters[paramName], paramName).toBeDefined();
    }
    expect(data.preset.parameters.charm_shape).toBe('bracelet_clip');
  });

  it('mirrors the q-charm Large/Small preset sizes', () => {
    const large = JSON.parse(
      readFileSync(join(PRESET_DIR, 'large-charm.json'), 'utf-8')
    ).preset.parameters;
    const small = JSON.parse(
      readFileSync(join(PRESET_DIR, 'small-charm.json'), 'utf-8')
    ).preset.parameters;
    // q-charm Large: width 22, height 8.65, length 15
    expect(large.clip_height).toBe(22);
    expect(large.clip_profile_depth).toBe(8.65);
    expect(large.clip_channel_length).toBe(15);
    // q-charm Small: width 16, height 6.5, length 12
    expect(small.clip_height).toBe(16);
    expect(small.clip_profile_depth).toBe(6.5);
    expect(small.clip_channel_length).toBe(12);
  });

  it('manifest and registry ship the preset files', () => {
    const manifest = readManifest();
    expect(manifest.files).toContain('presets/large-charm.json');
    expect(manifest.files).toContain('presets/small-charm.json');

    const def = EXAMPLE_DEFINITIONS['braille-charm'];
    expect(def.additionalFiles).toContain(
      '/examples/braille-charm/presets/large-charm.json'
    );
    expect(def.additionalFiles).toContain(
      '/examples/braille-charm/presets/small-charm.json'
    );
  });
});

describe('braille-charm registry entries', () => {
  it('EXAMPLE_DEFINITIONS entry resolves to real files', () => {
    const def = EXAMPLE_DEFINITIONS['braille-charm'];
    expect(def).toBeDefined();
    expect(def.name).toBe('braille_charm.scad');
    expect(def.description).toBe('Braille Charm');

    const scad = join(PUBLIC_DIR, def.path.replace(/^\//, ''));
    expect(existsSync(scad)).toBe(true);

    const manifest = join(PUBLIC_DIR, def.manifest.replace(/^\//, ''));
    expect(existsSync(manifest)).toBe(true);
  });

  it('PROGRAM_DEFINITIONS lists braille-charm under the braille program', () => {
    const program = PROGRAM_DEFINITIONS['braille-card-customizer'];
    expect(program.examples).toContain('braille-charm');
  });
});
