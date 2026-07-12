/**
 * Integration tests for the Braille Sign example
 *
 * Validates (mirroring braille-card-integration.test.js):
 * - braille_sign.scad parses and exposes the expected parameters
 * - ADA 703 defaults (uppercase, 16 mm characters, 0.8 mm raise, 135%
 *   line spacing, Grade 2 braille default)
 * - manifest.json is well-formed, including the sign-mode
 *   brailleTranslation block with paired text/braille params
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
const SCAD_PATH = join(PUBLIC_DIR, 'examples/braille-sign/braille_sign.scad');
const MANIFEST_PATH = join(PUBLIC_DIR, 'examples/braille-sign/manifest.json');

const readScad = () => readFileSync(SCAD_PATH, 'utf-8');
const readManifest = () => JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));

describe('braille_sign.scad parser integration', () => {
  it('scad file exists on disk', () => {
    expect(existsSync(SCAD_PATH)).toBe(true);
    expect(readScad().length).toBeGreaterThan(0);
  });

  it('parses without throwing', () => {
    expect(() => extractParameters(readScad())).not.toThrow();
  });

  it('extracts paired raised-text and braille line parameters', () => {
    const parsed = extractParameters(readScad());
    for (let i = 1; i <= 6; i++) {
      expect(parsed.parameters[`sign_text_${i}`], `sign_text_${i}`).toBeDefined();
      expect(parsed.parameters[`Line_${i}`], `Line_${i}`).toBeDefined();
    }
    expect(parsed.parameters.sign_text_1.default).toBe('Room 101');
    // "Room 101" in UEB (capital indicator, r-o-o-m, blank, numeric, 1-0-1)
    expect(parsed.parameters.Line_1.default).toBe(
      '\u2820\u2817\u2815\u2815\u280D\u2800\u283C\u2801\u281A\u2801'
    );
  });

  it('auto-fits the sign to its rows by default', () => {
    const parsed = extractParameters(readScad());
    expect(parsed.parameters.auto_fit.default).toBe('Yes');
    expect(parsed.parameters.auto_fit.enum.map((e) => e.value)).toContain(
      'No'
    );
  });

  it('has two-part rendering with Both as the default', () => {
    const parsed = extractParameters(readScad());
    expect(parsed.parameters.sign_part.default).toBe('Both');
    const values = parsed.parameters.sign_part.enum.map((e) => e.value);
    expect(values).toContain('Letter plate');
    expect(values).toContain('Braille plate');
  });

  it('has ADA 703 lettering defaults', () => {
    const parsed = extractParameters(readScad());
    expect(parsed.parameters.force_uppercase.default).toBe('Yes');
    // 703.2.5: 5/8 in (15.9 mm) minimum character height
    expect(parsed.parameters.char_height_mm.default).toBeGreaterThanOrEqual(15.9);
    // 703.2.1: 1/32 in (0.8 mm) minimum raise
    expect(parsed.parameters.letter_raise_mm.default).toBeGreaterThanOrEqual(0.8);
    // 703.2.8: 135% line spacing
    expect(parsed.parameters.line_spacing_pct.default).toBe(135);
  });

  it('keeps ADA-friendly rounded dot defaults (1.6 mm base, <= 0.9 mm tall)', () => {
    const parsed = extractParameters(readScad());
    expect(parsed.parameters.dot_shape.default).toBe('Rounded');
    expect(parsed.parameters.rounded_dot_base_diameter.default).toBe(1.6);
    const total =
      parsed.parameters.rounded_dot_base_height.default +
      parsed.parameters.rounded_dot_dome_height.default;
    expect(total).toBeLessThanOrEqual(0.9);
  });

  it('braille plate defaults to angled with fins, with a Flat option', () => {
    const parsed = extractParameters(readScad());
    expect(parsed.parameters.print_orientation.default).toBe('Angled');
    expect(
      parsed.parameters.print_orientation.enum.map((e) => e.value)
    ).toContain('Flat');
    expect(parsed.parameters.support_fins.default).toBe('On');
  });

  it('carries a GPL-3.0-or-later header with the ADA disclaimer', () => {
    const content = readScad();
    expect(content).toContain('GPL-3.0-or-later');
    expect(content).toContain('does NOT guarantee compliance');
    expect(content).toContain('braille-wedge-card-openscad');
  });
});

describe('braille-sign manifest', () => {
  it('exists and is valid JSON', () => {
    expect(existsSync(MANIFEST_PATH)).toBe(true);
    expect(() => readManifest()).not.toThrow();
  });

  it('has required fields: name, main, files, license', () => {
    const manifest = readManifest();
    expect(typeof manifest.name).toBe('string');
    expect(manifest.main).toBe('braille_sign.scad');
    expect(manifest.files).toContain('braille_sign.scad');
    expect(manifest.license).toBe('GPL-3.0-or-later');
  });

  it('has program field set to braille-card-customizer', () => {
    expect(readManifest().program).toBe('braille-card-customizer');
  });

  it('declares sign-mode brailleTranslation with paired real params', () => {
    const bt = readManifest().brailleTranslation;
    expect(bt).toBeDefined();
    expect(bt.mode).toBe('sign');
    expect(bt.lineParams).toEqual([
      'Line_1',
      'Line_2',
      'Line_3',
      'Line_4',
      'Line_5',
      'Line_6',
    ]);
    expect(bt.textParams).toEqual([
      'sign_text_1',
      'sign_text_2',
      'sign_text_3',
      'sign_text_4',
      'sign_text_5',
      'sign_text_6',
    ]);
    expect(bt.lineParams.length).toBe(bt.textParams.length);

    const parsed = extractParameters(readScad());
    for (const name of [...bt.lineParams, ...bt.textParams]) {
      expect(parsed.parameters[name], name).toBeDefined();
    }
    for (const [role, paramName] of Object.entries(bt.capacityParams)) {
      expect(parsed.parameters[paramName], `${role} -> ${paramName}`).toBeDefined();
    }
  });

  it('defaults to contracted Grade 2 (ADA recommendation)', () => {
    const bt = readManifest().brailleTranslation;
    expect(bt.defaultTable).toBe('en-ueb-g2.ctb');
    expect(bt.tablesCatalog).toBe('/liblouis/tables.json');
  });

  it('description carries the not-a-compliance-guarantee disclaimer', () => {
    expect(readManifest().description).toMatch(/recommendations only/i);
  });
});

describe('braille-sign registry entries', () => {
  it('EXAMPLE_DEFINITIONS entry resolves to real files', () => {
    const def = EXAMPLE_DEFINITIONS['braille-sign'];
    expect(def).toBeDefined();
    expect(def.name).toBe('braille_sign.scad');
    expect(def.description).toBe('Braille Sign');

    const scad = join(PUBLIC_DIR, def.path.replace(/^\//, ''));
    expect(existsSync(scad)).toBe(true);

    const manifest = join(PUBLIC_DIR, def.manifest.replace(/^\//, ''));
    expect(existsSync(manifest)).toBe(true);
  });

  it('PROGRAM_DEFINITIONS lists braille-sign under the braille program', () => {
    const program = PROGRAM_DEFINITIONS['braille-card-customizer'];
    expect(program.examples).toContain('braille-sign');
  });
});
