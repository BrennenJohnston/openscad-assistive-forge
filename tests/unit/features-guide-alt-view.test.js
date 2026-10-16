/**
 * The Features Guide's Alt View tab says where Edges, Characters and Glow
 * start. Those numbers live in the controller too, and must stay the same.
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

const RANGES = ['_HFM_CONTRAST_RANGE', '_HFM_FONT_SCALE_RANGE', '_HFM_PERSIST_FADE_RANGE'];

describe("the Features Guide's Alt View tab", () => {
  it('says where Edges, Characters and Glow start, as the controller does', () => {
    const said = /They start at Edges (\d+)%, Characters (\d+)% and Glow (\d+)%/.exec(html);
    expect(said, 'the sentence that says where they start').not.toBeNull();
    expect(said.slice(1).map(Number)).toEqual(RANGES.map((name) => rangeField(name, 'default')));
  });

  it('says how far each goes, as the controller does', () => {
    const said =
      /Edges go from (\d+)% to (\d+)%, Characters from (\d+)% to (\d+)%, and Glow from (\d+)% to (\d+)%/.exec(
        html
      );
    expect(said, 'the sentence that says how far they go').not.toBeNull();
    expect(said.slice(1).map(Number)).toEqual(
      RANGES.flatMap((name) => [rangeField(name, 'min'), rangeField(name, 'max')])
    );
  });
});
