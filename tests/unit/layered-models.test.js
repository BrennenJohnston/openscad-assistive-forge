/**
 * The layered design, per model (DP-60, DP-61).
 *
 * The Bracelet Clip Charm built the stack first (DP-7, D-160, D-163) and the
 * other two shapes of the Charm Designer had none, so the Layer column, the
 * three heights and the thin check were one shape's. These cases read each
 * layered model's own source and pin the parts the app and the geometry
 * depend on: the twelve layer parameters under the model's own prefix, the
 * fit-box echo the thin check reads, the band modules, the gate that skips
 * the single design when layer files are present, the shared canvas, and the
 * example passes the registry carries.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { extractParameters } from '../../src/js/parser.js';
import { EXAMPLE_DEFINITIONS } from '../../src/js/file-handler.js';

const PUBLIC_DIR = join(process.cwd(), 'public');

/**
 * The models that build a stack, each under its own prefix: the host looks
 * for `<prefix>_layer_N` beside `<prefix>_file` (findLayerParams), and the
 * bands are clipped to each model's own flat face.
 */
const LAYERED = {
  'q-charm': {
    file: 'examples/q-charm/q_charm.scad',
    prefix: 'design',
    face: 'top_face_2d',
  },
  'logo-plate': {
    file: 'examples/logo-plate/logo_plate.scad',
    prefix: 'logo',
    face: 'plate_2d',
  },
  'nasif-charm-maker': {
    file: 'examples/nasif-charm-maker/nasif_charm_maker.scad',
    prefix: 'design',
    face: 'face_2d',
  },
};

const sourceOf = (key) =>
  readFileSync(join(PUBLIC_DIR, LAYERED[key].file), 'utf8');
const paramsOf = (key) => extractParameters(sourceOf(key)).parameters;
const dirOf = (key) => join(PUBLIC_DIR, LAYERED[key].file, '..');

describe.each(Object.keys(LAYERED))('the layered design on %s', (key) => {
  const { prefix, face } = LAYERED[key];

  it('declares three passes: a file, an aspect, a depth and a style each', () => {
    const p = paramsOf(key);
    for (const n of [1, 2, 3]) {
      const file = p[`${prefix}_layer_${n}`];
      expect(file, `${prefix}_layer_${n}`).toBeTruthy();
      expect(file.uiType).toBe('file');
      // Off by default: a model nobody has touched is the model that shipped.
      expect(file.default).toBe('');
      expect(p[`${prefix}_layer_${n}_aspect`], 'aspect').toBeTruthy();
      expect(p[`${prefix}_layer_${n}_depth`], 'depth').toBeTruthy();
      const style = p[`${prefix}_layer_${n}_style`];
      expect(style, 'style').toBeTruthy();
      expect(style.enum.map((e) => e.value).sort()).toEqual([
        'engraved',
        'raised',
      ]);
    }
  });

  it('says how wide it fits a design, so the editor can measure each shape (DP-54)', () => {
    // main.js reads exactly this line out of the render's echo and hands it to
    // every file control; a model that says nothing gets no thin check.
    expect(sourceOf(key)).toContain('echo(str("design fit box mm: w=');
  });

  it('builds each layer’s exact shapes once, in its own band (D-163)', () => {
    const source = sourceOf(key);
    expect(source).toContain('module layer_exact_2d(n) {');
    expect(source).toContain('module layer_band_2d(n, raised) {');
    for (const n of [1, 2, 3]) {
      expect(source).toContain(`layer_raised_band(${n});`);
      expect(source).toContain(`layer_engraved_band(${n});`);
    }
    // One slab per band, overlapping its neighbour by the epsilon so the
    // slabs are one body; an engraved band cuts its own depth plus the
    // epsilon through the floor above it.
    expect(source).toContain('layer_eps = 0.01;');
    expect(source).toContain('linear_extrude(height = up + layer_eps)');
    expect(source).toContain('linear_extrude(height = down + layer_eps)');
    expect(source).toContain(
      'echo(str("layer levels mm: top1=", layer_top_1'
    );
  });

  it('skips the single design when layer files are present, or it prints twice', () => {
    const source = sourceOf(key);
    expect(source).toContain(
      'layered_mode = layer_1_on || layer_2_on || layer_3_on;'
    );
    // Both styles of the single pass are gated, the raised one and the cut.
    expect(source.match(/!layered_mode/g).length).toBeGreaterThanOrEqual(2);
  });

  it('clips every raised band to its own flat face', () => {
    const source = sourceOf(key);
    const body = source.slice(
      source.indexOf('module layer_raised_band('),
      source.indexOf('module layer_engraved_band(')
    );
    // The clip is either in the band itself or in the helper it calls.
    const clipped =
      body.includes(`${face}()`) ||
      source.includes(`module layer_band_on_plate_2d(`) ||
      source.includes(`module layer_band_on_face_2d(`);
    expect(clipped, `${key}: raised bands are not clipped to ${face}`).toBe(
      true
    );
  });

  it('keeps the stack inside the material it is carved from', () => {
    expect(sourceOf(key)).toContain(
      'assert(!layered_mode || layer_stack_floor > 0,'
    );
  });

  it('names the canvas span the app writes, as a contract', () => {
    // src/js/svg-preparer.js normalizes every layer file to this width. The
    // two numbers are one number; a change to either is a change to both.
    expect(sourceOf(key)).toContain('layer_canvas_span = 100;');
  });

  it('scales the passes by ONE factor and never resizes them apart', () => {
    const source = sourceOf(key);
    const start = source.indexOf(`module ${prefix}_layer_2d(`);
    expect(start, `${prefix}_layer_2d`).toBeGreaterThan(0);
    const end = source.indexOf('module ', start + 10);
    const moduleBody = source.slice(start, end);
    expect(moduleBody).toContain('scale(fit)');
    expect(moduleBody).not.toContain('resize(');
    // center = false keeps the shared coordinate system; center = true would
    // re-centre each pass on its own bounding box and pull the stack apart.
    expect(moduleBody).toContain('center = false');
  });

  it('ships an example pass per layer, and the registry carries them', () => {
    const transforms = [];
    for (const n of [1, 2, 3]) {
      const file = join(dirOf(key), `${prefix}_layer_${n}.svg`);
      expect(existsSync(file), file).toBe(true);
      const svg = readFileSync(file, 'utf8');
      // The unit is written: a width with no unit is pixels at 72 dpi.
      expect(svg).toContain('width="100mm"');
      transforms.push(/<g transform="([^"]*)"/.exec(svg)?.[1]);
    }
    // ONE transform across the three, so the stack lines up.
    expect(new Set(transforms).size).toBe(1);
    const entry = EXAMPLE_DEFINITIONS[key];
    for (const n of [1, 2, 3]) {
      expect(entry.additionalFiles).toContain(
        `/examples/${key}/${prefix}_layer_${n}.svg`
      );
    }
  });
});

describe('the Logo Plate’s own rules (DP-60)', () => {
  const source = readFileSync(
    join(PUBLIC_DIR, LAYERED['logo-plate'].file),
    'utf8'
  );

  it('reports the box Logo width sets, when it is set', () => {
    // An exact width in millimeters is the more specific instruction and wins
    // over the auto-fit box, in the echo as in the geometry.
    expect(source).toContain(
      'fit_box_w = logo_width > 0 ? logo_width : scaled_fit_w;'
    );
    expect(source).toContain(
      'fit_box_h = logo_width > 0 ? logo_width / logo_file_aspect : scaled_fit_h;'
    );
  });

  it('cuts the keychain hole through whatever the stack raised over it', () => {
    expect(source).toContain('cylinder(d = hole_diameter, h = plate_top_z + 0.02);');
    expect(source).toMatch(/plate_top_z = plate_thickness[\s\S]*layer_stack_top - plate_thickness/);
  });

  it('places a layer pass at Logo width when that is set', () => {
    expect(source).toContain('? logo_width / layer_canvas_span');
  });
});

describe('the Flat Pendant\u2019s own rules (DP-61)', () => {
  const source = readFileSync(
    join(PUBLIC_DIR, LAYERED['nasif-charm-maker'].file),
    'utf8'
  );

  it('cuts the hole and the slot through whatever the stack raised over them', () => {
    expect(source).toContain('cylinder(d = hole_diameter, h = charm_top_z + 0.02);');
    expect(source).toContain('linear_extrude(height = charm_top_z + 0.02)');
    expect(source).toMatch(
      /charm_top_z = charm_thickness[\s\S]*layer_stack_top - charm_thickness/
    );
  });

  it('clips every band to the face inside the border ring, like the text', () => {
    const body = source.slice(
      source.indexOf('module layer_band_on_face_2d('),
      source.indexOf('module layer_raised_band(')
    );
    expect(body).toContain('face_2d()');
  });

  it('keeps the design-shaped pendant: the face follows the outline', () => {
    // face_2d() derives from charm_base_2d(), which is the silhouette when the
    // shape is "design"; the bands are clipped to that same face.
    expect(source).toContain('offset(r = -border_width) charm_base_2d();');
  });
});
