/**
 * The reopen key (DP-81, D-175): the same choices on the same drawing at the
 * same width give the same key; any one of them changing changes it.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';
import { choicesKeyOf, hashText } from '../../src/js/reopen-key.js';

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">' +
  '<circle cx="50" cy="50" r="10"/><circle cx="90" cy="50" r="10"/></svg>';

function parts(over = {}) {
  const roles = [];
  roles[0] = 'foreground';
  roles[1] = 'hole';
  const offsets = [];
  offsets[0] = 0;
  offsets[1] = 0.3;
  return {
    roles,
    offsets,
    deleted: [],
    layers: null,
    designWidthMm: 11.97,
    svg: SVG,
    ...over,
  };
}

describe('hashText', () => {
  it('is stable, eight hex digits, and tells strings apart', () => {
    expect(hashText('')).toMatch(/^[0-9a-f]{8}$/);
    expect(hashText('abc')).toBe(hashText('abc'));
    expect(hashText('abc')).not.toBe(hashText('abd'));
    expect(hashText(SVG)).not.toBe(hashText(SVG + ' '));
  });
});

describe('choicesKeyOf', () => {
  it('★ is the same for the same choices, drawing and width', () => {
    expect(choicesKeyOf(parts())).toBe(choicesKeyOf(parts()));
    // A copy with holes in the same places is the same choice.
    const roles = [];
    roles[0] = 'foreground';
    roles[1] = 'hole';
    expect(choicesKeyOf(parts({ roles }))).toBe(choicesKeyOf(parts()));
  });

  it('★ changes with a role, an offset, a deletion, a layer, the width or the drawing', () => {
    const base = choicesKeyOf(parts());
    const roles = [];
    roles[0] = 'ignore';
    roles[1] = 'hole';
    expect(choicesKeyOf(parts({ roles }))).not.toBe(base);
    const offsets = [];
    offsets[0] = 0.05;
    offsets[1] = 0.3;
    expect(choicesKeyOf(parts({ offsets }))).not.toBe(base);
    expect(choicesKeyOf(parts({ deleted: [1] }))).not.toBe(base);
    const layers = [];
    layers[0] = 2;
    layers[1] = 1;
    expect(choicesKeyOf(parts({ layers }))).not.toBe(base);
    expect(choicesKeyOf(parts({ designWidthMm: 14 }))).not.toBe(base);
    expect(choicesKeyOf(parts({ svg: SVG.replace('r="10"', 'r="11"') }))).not.toBe(
      base
    );
  });

  it('reads a width to a thousandth of a millimeter and treats a missing one as none', () => {
    expect(choicesKeyOf(parts({ designWidthMm: 11.9701 }))).toBe(
      choicesKeyOf(parts({ designWidthMm: 11.9704 }))
    );
    expect(choicesKeyOf(parts({ designWidthMm: NaN }))).toBe(
      choicesKeyOf(parts({ designWidthMm: undefined }))
    );
    expect(choicesKeyOf(parts({ designWidthMm: NaN }))).not.toBe(
      choicesKeyOf(parts())
    );
  });

  it('carries the drawing by its length and hash, never its text', () => {
    const key = choicesKeyOf(parts());
    expect(key.startsWith(`v1:${SVG.length}:`)).toBe(true);
    expect(key).not.toContain('<svg');
    expect(key.length).toBeLessThan(40);
  });
});
