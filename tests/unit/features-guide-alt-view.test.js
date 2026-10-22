/**
 * The Features Guide's Alt View tab says where Edges, Focus and Glow start
 * in each look. Those numbers live in the controller too, and must stay the
 * same.
 *
 * @license GPL-3.0-or-later
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve as resolvePath, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolvePath(dirname(fileURLToPath(import.meta.url)), '../..');
const html = readFileSync(resolvePath(root, 'index.html'), 'utf-8').replace(/\s+/g, ' ');
const controller = readFileSync(resolvePath(root, 'src/js/hfm-controller.js'), 'utf-8');

/** One field of a range in the controller, as a whole percentage. */
function rangeField(name, field) {
  const m = new RegExp(`const ${name} = \\{[^}]*\\b${field}: ([0-9.]+)`).exec(controller);
  if (!m) throw new Error(`No ${field} of ${name} in the controller`);
  return Math.round(Number(m[1]) * 100);
}

/** Where a look's Edges, Focus and Glow start in the controller's table, as whole percentages. */
function lookStarts(set) {
  const table = /const _HFM_LOOK_DEFAULTS = \{([\s\S]*?)\n\};/.exec(controller);
  if (!table) throw new Error('No look table in the controller');
  const m = new RegExp(`\\b${set}: \\{ edges: ([0-9.]+), focus: ([0-9.]+), glow: ([0-9.]+)`).exec(table[1]);
  if (!m) throw new Error(`No ${set} row in the look table`);
  return m.slice(1).map((n) => Math.round(Number(n) * 100));
}

const RANGES = ['_HFM_CONTRAST_RANGE', '_HFM_FONT_SCALE_RANGE', '_HFM_PERSIST_FADE_RANGE'];

describe("the Features Guide's Alt View tab", () => {
  it('says where Edges, Focus and Glow start in the green and amber looks, as the controller does', () => {
    const said = /In the green and amber looks they start at Edges (\d+)%, Focus (\d+)% and Glow (\d+)%/.exec(
      html
    );
    expect(said, 'the sentence that says where the phosphor looks start').not.toBeNull();
    expect(said.slice(1).map(Number)).toEqual(lookStarts('p'));
  });

  it("says where they start in Classic's look, as the controller does", () => {
    const said = /in Classic's look at Edges (\d+)%, Focus (\d+)% and Glow (\d+)%/.exec(html);
    expect(said, "the sentence that says where Classic's look starts").not.toBeNull();
    expect(said.slice(1).map(Number)).toEqual(lookStarts('d'));
  });

  it("says a phone's starting characters, as the controller does", () => {
    const said = /\(on a phone, Focus (\d+)%\)/.exec(html);
    expect(said, "the phone's starting size").not.toBeNull();
    const m = /const _HFM_FONT_SCALE_PHONE_DEFAULT = ([0-9.]+)/.exec(controller);
    expect(m, 'the phone default in the controller').not.toBeNull();
    expect(Number(said[1])).toBe(Math.round(Number(m[1]) * 100));
  });

  it('says how far each goes, as the controller does', () => {
    const said =
      /Edges go from (\d+)% to (\d+)%, Focus from (\d+)% to (\d+)%, and Glow from (\d+)% to (\d+)%/.exec(
        html
      );
    expect(said, 'the sentence that says how far they go').not.toBeNull();
    expect(said.slice(1).map(Number)).toEqual(
      RANGES.flatMap((name) => [rangeField(name, 'min'), rangeField(name, 'max')])
    );
  });
});
