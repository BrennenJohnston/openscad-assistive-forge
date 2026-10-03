/**
 * Integration tests for the Braille Sign example
 *
 * Validates (mirroring braille-card-integration.test.js):
 * - braille_sign.scad parses and exposes the expected parameters
 * - ADA 703 defaults (uppercase, 16 mm characters, 0.8 mm raise, 135%
 *   line spacing, Grade 2 braille default)
 * - manifest.json is well-formed, including the sign-mode
 *   brailleTranslation block with raised-text + braille line params
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

  it('extracts raised-text and braille line parameters', () => {
    const parsed = extractParameters(readScad());
    for (let i = 1; i <= 6; i++) {
      expect(parsed.parameters[`sign_text_${i}`], `sign_text_${i}`).toBeDefined();
      expect(parsed.parameters[`Line_${i}`], `Line_${i}`).toBeDefined();
    }
    expect(parsed.parameters.sign_text_1.default).toBe('Room 101');
    // "Room 101" in UEB with the sign's capitals off (r-o-o-m, blank,
    // numeric, 1-0-1)
    expect(parsed.parameters.Line_1.default).toBe(
      '\u2817\u2815\u2815\u280D\u2800\u283C\u2801\u281A\u2801'
    );
    expect(parsed.parameters.Line_1.description).toBe(
      'Braille for line 1 (Unicode braille). The translation panel fills this in.'
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

  it('defaults to 1 mm plates (slider allows down to 1 mm)', () => {
    const parsed = extractParameters(readScad());
    expect(parsed.parameters.plate_thickness_mm.default).toBe(1);
    expect(parsed.parameters.plate_thickness_mm.minimum).toBe(1);
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

  it('makes the letter height setting the height of the capital I, with the panel in step', async () => {
    // Liberation Sans's capital I is 0.9555 of OpenSCAD's text size
    // (15.288 mm at size 16, measured from the exported model), so the
    // model divides by it; the panel's letter widths must use the same.
    const scad = readScad();
    const factor = Number(scad.match(/^LETTER_CAP_FACTOR = ([\d.]+);/m)?.[1]);
    expect(factor).toBe(0.9555);
    expect(scad).toMatch(/size = char_height_mm \/ LETTER_CAP_FACTOR,/);
    const { SIGN_LETTER_CAP_FACTOR } = await import(
      '../../src/js/sign-letter-metrics.js'
    );
    expect(SIGN_LETTER_CAP_FACTOR).toBe(factor);
    expect(extractParameters(scad).parameters.char_height_mm.description).toBe(
      'Height of the capital I (mm). ADA 703.2.5 asks for 16 mm (5/8 in) to 51 mm (2 in).'
    );
  });

  it('sizes its rows of raised letters from the same measured table as the panel', async () => {
    // The panel wraps rows with the table the model sizes its plates from,
    // so a row the panel lays out is a row the plate holds
    const scad = readScad();
    const body =
      scad.match(/^function sign_letter_metrics\(\) = \[\n([\s\S]*?)\n\];/m)?.[1] ?? '';
    const rows = [...body.matchAll(/^ {4}\["((?:\\.|[^"\\])*)", (.*)\],?$/gm)].map(
      ([, ch, nums]) => [ch.replace(/\\(.)/g, '$1'), nums.split(', ').map(Number)]
    );
    const { SIGN_LETTER_METRICS, SIGN_LETTER_UNKNOWN } = await import(
      '../../src/js/sign-letter-metrics.js'
    );
    expect(rows.length).toBe(78);
    expect(Object.fromEntries(rows)).toEqual(SIGN_LETTER_METRICS);
    const unknown = scad.match(/^function sign_letter_unknown\(\) = \[(.*)\];/m)?.[1];
    expect(unknown?.split(', ').map(Number)).toEqual(SIGN_LETTER_UNKNOWN);
    // The per-character estimate the table replaced is gone from both files
    expect(scad).not.toMatch(/CHAR_ADVANCE_FACTOR/);
    const panel = await import('../../src/js/braille-panel.js');
    expect(panel.SIGN_CHAR_ADVANCE_FACTOR).toBeUndefined();
  });

  it('keeps letters and braille 3/8 in (9.525 mm) inside its border, with the panel in step (ADA 703.2.7, 703.3.2)', async () => {
    // ADA prints 3/8 inch as 9.5 mm; the sign meets both figures
    const scad = readScad();
    const clearance = Number(scad.match(/^BORDER_CLEARANCE_MM = ([\d.]+);/m)?.[1]);
    expect(clearance).toBe(9.525);
    expect(scad).toMatch(
      /^_plate_pad = \(border_on \? border_width_mm : 0\) \+ BORDER_CLEARANCE_MM;/m
    );
    const { SIGN_BORDER_CLEARANCE_MM } = await import(
      '../../src/js/braille-panel.js'
    );
    expect(SIGN_BORDER_CLEARANCE_MM).toBe(clearance);
    const { add_border, sign_width_mm } = extractParameters(scad).parameters;
    expect(add_border.description).toBe(
      'Raised split border: top and sides on the letter plate, bottom and sides on the braille plate. Letters and braille stay at least 9.525 mm (3/8 in) inside it (ADA 703.2.7 and 703.3.2).'
    );
    // "ROOM 101" needs 142.3 mm of letters at the default spacing, plus the
    // clearance and the 2 mm border on each side
    expect(sign_width_mm.default).toBe(166);
  });

  it('spaces its braille lines inside ADA\'s range in inches and in millimeters (Table 703.3.1)', () => {
    // 0.395 to 0.400 inch is 10.033 to 10.16 mm; ADA prints 10 to 10.2 mm
    const { line_spacing } = extractParameters(readScad()).parameters;
    expect(line_spacing.default).toBe(10.1);
  });

  it('keeps each ADA setting inside its range, the stricter of the inch and metric figures', () => {
    const scad = readScad();
    const params = extractParameters(scad).parameters;
    // [slider, the range the model enforces], from the standards page
    const ranges = {
      char_height_mm: [[16, 50.8], 'ADA_CAP_HEIGHT_MM', [16, 50.8]],
      line_spacing_pct: [[135, 170], 'ADA_LINE_SPACING_PCT', [135, 170]],
      letter_spacing: [[1.21, 1.22], 'SIGN_LETTER_SPACING', [1.21, 1.22]],
      rounded_dot_base_diameter: [[1.5, 1.6], 'ADA_DOT_BASE_MM', [1.5, 1.6]],
      dot_spacing: [[2.3, 2.5], 'ADA_DOT_SPACING_MM', [2.3, 2.5]],
      cell_spacing: [[6.13, 7.6], 'ADA_CELL_SPACING_MM', [6.1214, 7.6]],
      line_spacing: [[10.04, 10.16], 'ADA_LINE_SPACING_MM', [10.033, 10.16]],
    };
    for (const [name, [slider, constant, enforced]] of Object.entries(ranges)) {
      const p = params[name];
      expect([p.minimum, p.maximum], `${name} slider`).toEqual(slider);
      expect(p.default, `${name} default`).toBeGreaterThanOrEqual(slider[0]);
      expect(p.default, `${name} default`).toBeLessThanOrEqual(slider[1]);
      const declared = scad.match(new RegExp(`^${constant} += \\[([\\d.]+), ([\\d.]+)\\];`, 'm'));
      expect(declared?.slice(1).map(Number), constant).toEqual(enforced);
      expect(scad, `${name} is checked`).toMatch(
        new RegExp(`^assert\\(in_range\\(${name}, ${constant}\\),`, 'm')
      );
    }
    expect(params.letter_raise_mm.minimum).toBe(0.8);
    expect(scad).toMatch(/^ADA_LETTER_RAISE_MIN_MM += 0\.8;/m);
    expect(scad).toMatch(/^assert\(letter_raise_mm >= ADA_LETTER_RAISE_MIN_MM,/m);
    expect(scad).toMatch(/^ADA_DOT_HEIGHT_MM += \[0\.635, 0\.9\];/m);
    expect(scad).toMatch(
      /^assert\(in_range\(rounded_dot_base_height \+ rounded_dot_dome_height - DOT_FACE_EMBED, ADA_DOT_HEIGHT_MM\),/m
    );
  });

  it('spaces its letters at 1.21, with the panel in step (ADA 703.2.7)', async () => {
    // At 1.21 every pair of capitals and every pair of digits is 3.2 mm to
    // four strokes apart at the letters' true height; at 1.2 A-A is 3.19 mm
    const { letter_spacing } = extractParameters(readScad()).parameters;
    expect(letter_spacing.default).toBe(1.21);
    // A range slider snaps its value to the step, so the step must reach 1.21
    expect(letter_spacing.step).toBe(0.01);
    expect(letter_spacing.description).toBe(
      'Letter spacing. At 1.21 every pair of adjacent capital letters, and every pair of adjacent digits, is 3.2 mm to four stroke widths apart (ADA 703.2.7).'
    );
    const { SIGN_DEFAULT_LETTER_SPACING } = await import(
      '../../src/js/braille-panel.js'
    );
    expect(SIGN_DEFAULT_LETTER_SPACING).toBe(letter_spacing.default);
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
    expect(content).toContain('braille-sign-openscad');
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

  it('declares sign-mode brailleTranslation with matching real params', () => {
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

  it('turns braille capitals off by default (ADA 703.3.1)', () => {
    expect(readManifest().brailleTranslation.capitals).toBe('off');
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
