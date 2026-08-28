/**
 * Feature parity across the charm-program models (DP-9).
 *
 * The Bracelet Clip Charm grew features that the Flat Pendant and the Logo
 * Plate never got, and nothing noticed. These cases are the noticing: they
 * read each model's own parameter surface and compare it against the signed
 * matrix, so a feature added to one model and forgotten on the others fails
 * here rather than in someone's hands.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { extractParameters } from '../../src/js/parser.js';

const PUBLIC_DIR = join(process.cwd(), 'public');

const MODELS = {
  'q-charm': 'examples/q-charm/q_charm.scad',
  'nasif-charm-maker': 'examples/nasif-charm-maker/nasif_charm_maker.scad',
};

const sourceOf = (key) => readFileSync(join(PUBLIC_DIR, MODELS[key]), 'utf8');
const paramsOf = (key) => extractParameters(sourceOf(key)).parameters;

describe('D-116 - the aspect companion the app actually writes', () => {
  it('every design file parameter has a "<name>_aspect" beside it', () => {
    // The app sets `${fileParam}_aspect`. The Flat Pendant called its one
    // design_aspect, so every measured ratio went into a parameter nothing
    // read, and a tall design was fitted against a square assumption. The
    // stripe in the DP-0 A/B cut off both rims because of exactly this.
    for (const key of Object.keys(MODELS)) {
      const params = paramsOf(key);
      const files = Object.values(params).filter((p) => p.uiType === 'file');
      expect(files.length).toBeGreaterThan(0);
      for (const f of files) {
        expect(
          params[`${f.name}_aspect`],
          `${key}: ${f.name} has no ${f.name}_aspect companion`
        ).toBeTruthy();
      }
    }
  });

  it('the Flat Pendant no longer carries the old name anywhere', () => {
    const src = sourceOf('nasif-charm-maker');
    expect(src).not.toMatch(/\bdesign_aspect\b/);
    expect(src).toContain('design_file_aspect');
  });
});

describe('a default design file desktop OpenSCAD can actually open', () => {
  it('resolves beside the .scad, not only in a subfolder', () => {
    // import() looks in the model's own folder. The Flat Pendant defaulted to
    // "heart.svg" with the only copy in svg-library/, so desktop printed
    // "ERROR: Can't open file ... heart.svg" and then rendered a blank charm
    // ANYWAY - Status: NoError, an STL written, no design on it.
    for (const [key, rel] of Object.entries(MODELS)) {
      const dir = join(PUBLIC_DIR, rel, '..');
      for (const p of Object.values(paramsOf(key))) {
        if (p.uiType !== 'file') continue;
        const value = String(p.default || '');
        if (!value) continue;
        expect(
          existsSync(join(dir, value)),
          `${key}: default "${value}" does not resolve beside the .scad`
        ).toBe(true);
      }
    }
  });
});

describe('raised text is clamped to the face, like designs', () => {
  it.each(Object.keys(MODELS))('%s clamps every raised text layer', (key) => {
    // MEASURED on the Bracelet Clip Charm before the repair: text at size 7
    // pushed sideways reached X 34.09 on a charm whose body ends at 11.01 -
    // material floating in mid-air. Clamped, the whole model measures
    // -11.01 to 11.01 and 29,760 facets against 31,424.
    const src = sourceOf(key);
    // Every place a text module is extruded must sit inside an intersection
    // with the face. Reading it this way, rather than by matching whole
    // if-blocks, keeps the guard from depending on brace layout - which is
    // how the first version of it went green for nothing.
    const sites = [...src.matchAll(/\btext_2d(_layer2)?\(\)/g)]
      // The module's own definition is not a call site.
      .filter((m) => !/module\s+$/.test(src.slice(0, m.index)))
      .map((m) => src.slice(Math.max(0, m.index - 220), m.index + 120));
    expect(sites.length).toBeGreaterThanOrEqual(4);
    for (const around of sites) {
      expect(around).toMatch(/intersection\(\)/);
      expect(around).toMatch(/(top_)?face_2d\(\)/);
    }
  });
});

describe('the signed parity matrix, per model', () => {
  const PLACEMENT = [
    'design_offset',
    'design_left_right',
    'design_up_down',
    'design_rotation',
  ];
  const TEXT = [
    'text_content',
    'text_depth',
    'text_style',
    'text_size',
    'text_rotation',
    'text_content_2',
    'text_depth_2',
    'text_style_2',
    'text_size_2',
    'text_rotation_2',
    'text_2_thickness',
  ];

  it.each(Object.keys(MODELS))('%s offers design placement', (key) => {
    const params = paramsOf(key);
    for (const name of PLACEMENT) {
      expect(params[name], `${key} is missing ${name}`).toBeTruthy();
    }
  });

  it.each(Object.keys(MODELS))('%s offers two text layers', (key) => {
    const params = paramsOf(key);
    for (const name of TEXT) {
      expect(params[name], `${key} is missing ${name}`).toBeTruthy();
    }
  });

  it.each(Object.keys(MODELS))('%s offers a lanyard slot', (key) => {
    // A slot takes a flat strap where a round hole takes a ring. Someone who
    // needs the strap needs it on whichever model they chose.
    const values = paramsOf(key).attachment_type.enum.map((e) => e.value);
    expect(values).toContain('lanyard_slot');
  });

  it.each(Object.keys(MODELS))('%s ships a large and a small preset', (key) => {
    const dir = join(PUBLIC_DIR, MODELS[key], '..', 'presets');
    const files = existsSync(dir)
      ? readFileSync(join(dir, '..', 'manifest.json'), 'utf8')
      : '';
    expect(files).toMatch(/presets\/[a-z-]*large[a-z-]*\.json/);
    expect(files).toMatch(/presets\/[a-z-]*small[a-z-]*\.json/);
  });

  it.each(Object.keys(MODELS))('%s presets name their own model', (key) => {
    const manifest = JSON.parse(
      readFileSync(join(PUBLIC_DIR, MODELS[key], '..', 'manifest.json'), 'utf8')
    );
    const modelFile = MODELS[key].split('/').pop();
    for (const rel of manifest.files.filter((f) => f.startsWith('presets/'))) {
      const preset = JSON.parse(
        readFileSync(join(PUBLIC_DIR, MODELS[key], '..', rel), 'utf8')
      );
      expect(preset.modelName).toBe(modelFile);
      // A preset that names a parameter the model does not have is a preset
      // that silently does nothing.
      const params = paramsOf(key);
      for (const name of Object.keys(preset.preset.parameters)) {
        if (name === '$fn') continue;
        expect(params[name], `${rel} sets unknown ${name}`).toBeTruthy();
      }
    }
  });
});
