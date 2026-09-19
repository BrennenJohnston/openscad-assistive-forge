/**
 * Where a keychain hole may go on a design-shaped pendant (DP-11).
 *
 * The cases below are all about a hole that WOULD render perfectly and print
 * as rubbish: outside the shape, or so near an edge that the ring tears out
 * the first time the charm is pulled. Neither is visible in a preview.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';
import {
  MIN_WEB_MM,
  outlineInMm,
  checkHolePlacement,
} from '../../src/js/hole-placement.js';

/** An outline companion the way the app writes one: a normalized canvas. */
const outlineSvg = (d, w = 100, h = 100) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" ` +
  `viewBox="0 0 ${w} ${h}"><path d="${d}" fill="black" ` +
  `fill-rule="evenodd"/></svg>`;

const SQUARE = outlineSvg('M0 0 H100 V100 H0 Z');

describe('outlineInMm', () => {
  it('scales the canvas to the width the model actually gives the body', () => {
    // The outline arrives 100 units wide whatever the design was. Measuring in
    // canvas units and comparing against a millimetre web would be wrong by
    // the scale factor - fine at one pendant size, broken at another.
    const r = outlineInMm(SQUARE, 40);
    expect(r.scale).toBeCloseTo(0.4, 6);
    const xs = r.polygon.map((p) => p.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(40, 6);
  });

  it('centres the outline on the origin, the way the model places it', () => {
    const r = outlineInMm(SQUARE, 40);
    const xs = r.polygon.map((p) => p.x);
    expect(Math.min(...xs)).toBeCloseTo(-20, 6);
    expect(Math.max(...xs)).toBeCloseTo(20, 6);
  });

  it('returns nothing rather than guessing', () => {
    expect(outlineInMm('', 40)).toBeNull();
    expect(outlineInMm(SQUARE, 0)).toBeNull();
    expect(outlineInMm('<svg></svg>', 40)).toBeNull();
  });
});

describe('checkHolePlacement', () => {
  const base = { outlineSvg: SQUARE, widthMm: 40, holeDiameterMm: 4 };

  it('accepts a hole with material all round it', () => {
    const r = checkHolePlacement({ ...base, offsetYMm: -10 });
    expect(r.ok).toBe(true);
    expect(r.message).toBeNull();
  });

  it('refuses a hole pushed off the shape, and says where it went', () => {
    const r = checkHolePlacement({ ...base, offsetXMm: 40 });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('outside');
    expect(r.message).toMatch(/outside the shape/);
    expect(r.message).not.toContain('—');
  });

  it('refuses a hole too near an edge, with both numbers in the sentence', () => {
    // Right against the left edge: inside, but nothing holding the ring.
    const r = checkHolePlacement({ ...base, offsetXMm: -18, offsetYMm: -10 });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('too-close');
    expect(r.message).toMatch(/2\.0 mm from the edge/);
    expect(r.message).toMatch(/needs 3\.2 mm/);
    expect(r.message).toMatch(/1\.2 mm of material/);
  });

  it('the web is 1.2 mm and the boundary is where it says it is', () => {
    expect(MIN_WEB_MM).toBe(1.2);
    // radius 2 + web 1.2 = 3.2 mm of clearance required.
    expect(
      checkHolePlacement({ ...base, offsetXMm: -16.7, offsetYMm: -10 }).ok
    ).toBe(true);
    expect(
      checkHolePlacement({ ...base, offsetXMm: -16.9, offsetYMm: -10 }).ok
    ).toBe(false);
  });

  it('a bigger hole needs more room, in the same place', () => {
    const spot = { ...base, offsetXMm: -15, offsetYMm: -10 };
    expect(checkHolePlacement(spot).ok).toBe(true);
    expect(checkHolePlacement({ ...spot, holeDiameterMm: 8 }).ok).toBe(false);
  });

  it('says nothing at all when there is no drawn outline', () => {
    // An ordinary circular pendant has no outline companion and needs no
    // warning. Silence here is correct; a warning would be noise.
    const r = checkHolePlacement({ ...base, outlineSvg: null });
    expect(r.ok).toBe(true);
    expect(r.message).toBeNull();
  });

  it('★ catches a hole in the gap of a concave shape', () => {
    // The whole reason this is geometry and not a bounding box. The middle of
    // a C's bounding box is thin air; a rectangle check would put the ring
    // there and the preview would look perfect.
    const c = outlineSvg(
      'M0 0 L75 0 L75 25 L25 25 L25 75 L75 75 L75 100 L0 100 Z'
    );
    const inGap = checkHolePlacement({
      outlineSvg: c,
      widthMm: 40,
      holeDiameterMm: 4,
      offsetXMm: 10,
      offsetYMm: 0,
      anchorYMm: 0,
    });
    expect(inGap.ok).toBe(false);
    expect(inGap.reason).toBe('outside');

    const inMaterial = checkHolePlacement({
      outlineSvg: c,
      widthMm: 40,
      holeDiameterMm: 4,
      offsetXMm: -14,
      offsetYMm: 0,
      anchorYMm: 0,
    });
    expect(inMaterial.ok).toBe(true);
  });

  it('never moves the hole it is complaining about', () => {
    const args = {
      ...base,
      offsetXMm: 40,
      offsetYMm: 0,
    };
    const before = { ...args };
    checkHolePlacement(args);
    expect(args).toEqual(before);
  });
});
