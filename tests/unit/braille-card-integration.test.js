/**
 * Integration tests for the Braille Card Customizer program
 *
 * Validates (mirroring q-charm-integration.test.js):
 * - braille_wedge_card.scad parses and exposes the expected parameters
 * - manifest.json is well-formed, including the brailleTranslation block
 * - EXAMPLE_DEFINITIONS / PROGRAM_DEFINITIONS entries are consistent
 * - The brailleTranslation block agrees with the parsed SCAD parameters
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
const SCAD_PATH = join(
  PUBLIC_DIR,
  'examples/braille-wedge-card/braille_wedge_card.scad'
);
const MANIFEST_PATH = join(
  PUBLIC_DIR,
  'examples/braille-wedge-card/manifest.json'
);

const readScad = () => readFileSync(SCAD_PATH, 'utf-8');
const readManifest = () => JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));

describe('braille_wedge_card.scad parser integration', () => {
  it('scad file exists on disk', () => {
    expect(existsSync(SCAD_PATH)).toBe(true);
    expect(readScad().length).toBeGreaterThan(0);
  });

  it('parses without throwing', () => {
    expect(() => extractParameters(readScad())).not.toThrow();
  });

  it('extracts all 20 Line_N string parameters', () => {
    const parsed = extractParameters(readScad());
    for (let i = 1; i <= 20; i++) {
      const param = parsed.parameters[`Line_${i}`];
      expect(param, `Line_${i}`).toBeDefined();
      expect(param.type).toBe('string');
    }
    // Defaults contain Unicode braille (survives parsing)
    expect(parsed.parameters.Line_1.default).toBe(
      '\u2813\u2811\u2807\u2807\u2815'
    );
    expect(parsed.parameters.Line_2.default).toBe(
      '\u283A\u2815\u2817\u2807\u2819'
    );
  });

  it('extracts card size and spacing parameters used for capacity math', () => {
    const parsed = extractParameters(readScad());

    // Auto-size on by default: the card grows to fit the text; the manual
    // 200x100 sliders still govern the panel's capacity math.
    expect(parsed.parameters.auto_size_card).toBeDefined();
    expect(parsed.parameters.auto_size_card.default).toBe('On');
    expect(parsed.parameters.auto_size_margin_mm.default).toBe(6);
    expect(parsed.parameters.card_face_width_mm.default).toBe(200);
    expect(parsed.parameters.card_face_height_mm.default).toBe(100);
    expect(parsed.parameters.cell_spacing.default).toBe(7.0);
    expect(parsed.parameters.line_spacing.default).toBe(10.0);
    expect(parsed.parameters.grid_columns.default).toBe(26);
    expect(parsed.parameters.grid_rows.default).toBe(8);
  });

  it('defaults to a 1 mm card thickness', () => {
    const parsed = extractParameters(readScad());
    expect(parsed.parameters.card_thickness_mm.default).toBe(1);
  });

  it('extracts the multi-card layout parameters', () => {
    const parsed = extractParameters(readScad());
    expect(parsed.parameters.card_layout).toBeDefined();
    expect(parsed.parameters.card_layout.default).toBe('Single');
    expect(parsed.parameters.rows_per_card.default).toBe(8);
    expect(parsed.parameters.card_gap_mm.default).toBe(5);
  });

  it('has web-adapted defaults (warnings off, medium quality)', () => {
    const parsed = extractParameters(readScad());
    expect(parsed.parameters.show_warnings.default).toBe('Off');
    expect(parsed.parameters.render_quality.default).toBe('Medium');
  });

  it('keeps support fins on by default (print-support-free design)', () => {
    const parsed = extractParameters(readScad());
    expect(parsed.parameters.support_fins.default).toBe('On');
  });

  it('carries the GPL-3.0-or-later relicense header with upstream attribution', () => {
    const content = readScad();
    expect(content).toContain('GPL-3.0-or-later');
    expect(content).toContain('Relicensed by the copyright holder');
    expect(content).toContain('braille-wedge-card-openscad');
  });
});

describe('braille-wedge-card manifest', () => {
  it('exists and is valid JSON', () => {
    expect(existsSync(MANIFEST_PATH)).toBe(true);
    expect(() => readManifest()).not.toThrow();
  });

  it('has required fields: name, main, files', () => {
    const manifest = readManifest();
    expect(typeof manifest.name).toBe('string');
    expect(manifest.main).toBe('braille_wedge_card.scad');
    expect(Array.isArray(manifest.files)).toBe(true);
    expect(manifest.files).toContain('braille_wedge_card.scad');
  });

  it('has program field set to braille-card-customizer', () => {
    expect(readManifest().program).toBe('braille-card-customizer');
  });

  it('has inspired_by attribution', () => {
    const manifest = readManifest();
    expect(manifest.inspired_by).toBeDefined();
    expect(typeof manifest.inspired_by.name).toBe('string');
  });

  it('brailleTranslation.lineParams match parsed SCAD parameters, in order', () => {
    const manifest = readManifest();
    const bt = manifest.brailleTranslation;
    expect(bt).toBeDefined();
    expect(bt.lineParams).toHaveLength(20);
    expect(bt.lineParams).toEqual(
      Array.from({ length: 20 }, (_, i) => `Line_${i + 1}`)
    );

    const parsed = extractParameters(readScad());
    for (const name of bt.lineParams) {
      expect(parsed.parameters[name], name).toBeDefined();
    }
  });

  it('brailleTranslation.capacityParams reference real SCAD parameters', () => {
    const bt = readManifest().brailleTranslation;
    const parsed = extractParameters(readScad());
    for (const [role, paramName] of Object.entries(bt.capacityParams)) {
      expect(parsed.parameters[paramName], `${role} -> ${paramName}`).toBeDefined();
    }
  });

  it('brailleTranslation.multiCardParams reference real SCAD parameters', () => {
    const bt = readManifest().brailleTranslation;
    expect(bt.multiCardParams).toBeDefined();
    const parsed = extractParameters(readScad());
    for (const [role, paramName] of Object.entries(bt.multiCardParams)) {
      expect(parsed.parameters[paramName], `${role} -> ${paramName}`).toBeDefined();
    }
  });

  it('is relicensed GPL-3.0-or-later', () => {
    expect(readManifest().license).toBe('GPL-3.0-or-later');
  });

  it('brailleTranslation declares the default table and catalog URL', () => {
    const bt = readManifest().brailleTranslation;
    expect(bt.defaultTable).toBe('en-ueb-g1.ctb');
    expect(bt.tablesCatalog).toBe('/liblouis/tables.json');
  });
});

describe('braille-wedge-card registry entries', () => {
  it('EXAMPLE_DEFINITIONS entry resolves to real files', () => {
    const def = EXAMPLE_DEFINITIONS['braille-wedge-card'];
    expect(def).toBeDefined();
    expect(def.name).toBe('braille_wedge_card.scad');
    expect(def.description).toBe('Braille Card Designer');

    const scad = join(PUBLIC_DIR, def.path.replace(/^\//, ''));
    expect(existsSync(scad)).toBe(true);

    const manifest = join(PUBLIC_DIR, def.manifest.replace(/^\//, ''));
    expect(existsSync(manifest)).toBe(true);
  });

  it('PROGRAM_DEFINITIONS has braille-card-customizer with the example', () => {
    const program = PROGRAM_DEFINITIONS['braille-card-customizer'];
    expect(program).toBeDefined();
    expect(program.label).toBe('Braille Card Designer');
    expect(program.examples).toContain('braille-wedge-card');
  });

  it('braille-wedge-card is a program example (F-25 save prompt)', () => {
    const programExampleKeys = new Set();
    for (const prog of Object.values(PROGRAM_DEFINITIONS)) {
      for (const key of prog.examples) programExampleKeys.add(key);
    }
    expect(programExampleKeys.has('braille-wedge-card')).toBe(true);
  });
});

describe('braille panel module exports', () => {
  it('exports init/destroy/isActive', async () => {
    const mod = await import('../../src/js/braille-panel.js');
    expect(typeof mod.initBraillePanel).toBe('function');
    expect(typeof mod.destroyBraillePanel).toBe('function');
    expect(typeof mod.isBraillePanelActive).toBe('function');
    expect(mod.isBraillePanelActive()).toBe(false);
  });
});
