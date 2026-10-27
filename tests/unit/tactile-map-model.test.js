/**
 * The Tactile Map tile's model and manifest agree about the values a finger
 * reads.
 *
 * Every tactile parameter the manifest names has a documented range in the
 * .scad and an assert() that stops a value outside it, and the defaults are
 * the ones the printed station maps were built with. A wrong tactile number
 * exports, prints and looks right; only a test or a finger catches it.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractParameters } from '../../src/js/parser.js';

const TILE_DIR = join(process.cwd(), 'public', 'examples', 'tactile-map');
const SCAD = join(TILE_DIR, 'tactile_map.scad');
const MANIFEST = join(TILE_DIR, 'manifest.json');

const source = () => readFileSync(SCAD, 'utf8');
const manifest = () => JSON.parse(readFileSync(MANIFEST, 'utf8'));
const params = () => extractParameters(source()).parameters;

// The heights, sizes and spacings of the printed station maps, in millimeters
// (levels_used is a count).
const DEFAULTS = {
  base_thickness_mm: 0.4,
  level_step_mm: 0.6,
  symbol_step_mm: 0.8,
  levels_used: 3,
  title_char_height_mm: 16,
  title_raise_mm: 0.8,
  label_tape_width_mm: 12.7,
  label_channel_depth_mm: 0.3,
  map_width_mm: 480,
  map_height_mm: 360,
};

describe('the Tactile Map tile', () => {
  it('names every tactile value in its manifest', () => {
    const tactile = manifest().tactile;
    expect(Array.isArray(tactile)).toBe(true);
    for (const name of Object.keys(DEFAULTS)) {
      expect(tactile, `manifest "tactile" lacks ${name}`).toContain(name);
    }
  });

  it('gives every tactile parameter a documented range and an assert', () => {
    const src = source();
    const p = params();
    for (const name of manifest().tactile) {
      const param = p[name];
      expect(param, `${name} is not a parameter of the model`).toBeTruthy();
      const hasNumericRange =
        typeof param.minimum === 'number' && typeof param.maximum === 'number';
      const hasChoices = Array.isArray(param.enum) && param.enum.length > 1;
      expect(
        hasNumericRange || hasChoices,
        `${name} has neither a [minimum:maximum] range nor a list of allowed values`
      ).toBe(true);
      expect(
        new RegExp(`assert\\s*\\([^;]*\\b${name}\\b`, 's').test(src),
        `${name} is read by touch, but nothing asserts it`
      ).toBe(true);
    }
  });

  it('starts from the printed station maps: 0.4 base, 0.6 and 0.8 mm steps, three levels, 16 mm letters raised 0.8, 12.7 mm tape sunk 0.3, 480 x 360', () => {
    const p = params();
    for (const [name, value] of Object.entries(DEFAULTS)) {
      expect(p[name], `${name} is missing`).toBeTruthy();
      expect(Number(p[name].default), `${name} default`).toBe(value);
    }
  });

  it('imports the levels file by group id, never re-centered', () => {
    const src = source();
    // One levels file carries the heights as <g id="level1..3"> and
    // <g id="channels">; import(center = true) would re-center each group on
    // its own box and pull the levels apart.
    expect(src).toMatch(
      /import\s*\(\s*map_file\s*,\s*id\s*=\s*str\(\s*"level"/
    );
    expect(src).toMatch(/import\s*\(\s*map_file\s*,\s*id\s*=\s*"channels"/);
    expect(src).not.toMatch(/center\s*=\s*true/);
  });

  it('cuts a cutouts group through the plate, lets the panel switch the title and north cue per plate, and takes a plate down to 100 x 75', () => {
    const src = source();
    const p = params();
    // The plate's name as notches must be findable by a finger: a slot
    // through the plate, not a 0.3 mm recess, so it has a pass of its own.
    expect(src).toMatch(/import\s*\(\s*map_file\s*,\s*id\s*=\s*"cutouts"/);
    const choices = (param) => param.enum.map((o) => o.value ?? o);
    expect(choices(p.plate_shows_title)).toEqual(['yes', 'no']);
    expect(p.plate_shows_title.default).toBe('yes');
    expect(choices(p.plate_shows_north)).toEqual(['yes', 'no']);
    expect(p.plate_shows_north.default).toBe('yes');
    // The floor was set for a whole map; a plate of a split map may be a
    // quarter of that.
    expect(p.map_width_mm.minimum).toBe(100);
    expect(p.map_height_mm.minimum).toBe(75);
    expect(src).toMatch(/outside 100 to 600 mm/);
    expect(src).toMatch(/outside 75 to 450 mm/);
  });

  it('ships the sample levels file it defaults to', () => {
    const m = manifest();
    const p = params();
    expect(p.map_file.uiType).toBe('file');
    expect(m.files).toContain(p.map_file.default);
    expect(m.files).toContain(m.main);
    expect(m.program).toBe('tactile-map-designer');
    expect(m.license).toBe('GPL-3.0-or-later');
  });
});
