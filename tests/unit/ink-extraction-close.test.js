/**
 * DP-79: the pieces added to ink-extraction.js for the photo defaults: the
 * median rewritten without allocation, the close, and the floor helpers that
 * moved in from the color separation.
 *
 * @license GPL-3.0-or-later
 */
import { describe, it, expect } from 'vitest';
import {
  medianFilter3x3,
  closeMask,
  componentCount,
  floorPx,
  dropSmallPieces,
} from '../../src/js/ink-extraction.js';

const makeImageData = (width, height) => ({
  width,
  height,
  data: new Uint8ClampedArray(width * height * 4),
});

describe('the median, rewritten without allocation (DP-79 P0b)', () => {
  it("★ gives the old sort's answer byte for byte on a noisy picture", () => {
    // The reference is the implementation this replaced: a slice and a sort
    // per channel per pixel, 8,847 ms on a 1331 x 1200 photograph against
    // 413 for the insertion sort, MEASURED.
    const reference = (imageData) => {
      const { width, height, data } = imageData;
      const out = makeImageData(width, height);
      const window = new Uint8Array(9);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const target = (y * width + x) * 4;
          for (let channel = 0; channel < 3; channel++) {
            let n = 0;
            for (let dy = -1; dy <= 1; dy++) {
              const sy = Math.min(height - 1, Math.max(0, y + dy));
              for (let dx = -1; dx <= 1; dx++) {
                const sx = Math.min(width - 1, Math.max(0, x + dx));
                window[n++] = data[(sy * width + sx) * 4 + channel];
              }
            }
            const sorted = Array.prototype.slice
              .call(window, 0, n)
              .sort((a, b) => a - b);
            out.data[target + channel] = sorted[4];
          }
          out.data[target + 3] = data[target + 3];
        }
      }
      return out;
    };
    const img = makeImageData(37, 29);
    let seed = 7;
    for (let i = 0; i < img.data.length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      img.data[i] = (seed >> 16) & 0xff;
    }
    const expected = reference(img);
    const actual = medianFilter3x3(img, makeImageData);
    expect(actual.width).toBe(37);
    expect(Array.from(actual.data)).toEqual(Array.from(expected.data));
  });
});

describe('closeMask (DP-79)', () => {
  it('bridges a gap up to twice its radius and leaves the rest where it was', () => {
    // Two 4-wide blocks with a 2-pixel gap in a 12 x 6 mask.
    const w = 12;
    const h = 6;
    const mask = new Uint8Array(w * h);
    for (let y = 1; y < 5; y++) {
      for (const x of [1, 2, 3, 4, 7, 8, 9, 10]) mask[y * w + x] = 1;
    }
    expect(componentCount(mask, w, h)).toBe(2);
    const closed = closeMask(mask, w, h, 1);
    expect(componentCount(closed, w, h)).toBe(1);
    // The outer edges did not move.
    expect(closed[1 * w + 1]).toBe(1);
    expect(closed[1 * w + 0]).toBe(0);
    expect(closed[0 * w + 1]).toBe(0);
    // The input is untouched.
    expect(componentCount(mask, w, h)).toBe(2);
  });

  it('a gap wider than twice the radius stays open; one under it is bridged', () => {
    // Two blocks eight rows tall with a four-pixel gap. The structuring
    // element is four-connected (a diamond), so the bridge it builds across
    // a gap is shorter than the blocks by the gap, and the blocks have to be
    // taller than the gap plus twice the radius for it to survive the erosion.
    // MEASURED here: radius 1 leaves it, radius 2 joins it.
    const w = 16;
    const h = 12;
    const mask = new Uint8Array(w * h);
    for (let y = 2; y < 10; y++) {
      for (const x of [1, 2, 3, 4, 9, 10, 11, 12]) mask[y * w + x] = 1;
    }
    expect(componentCount(closeMask(mask, w, h, 1), w, h)).toBe(2);
    expect(componentCount(closeMask(mask, w, h, 2), w, h)).toBe(1);
  });

  it('a radius of zero is a copy', () => {
    const mask = new Uint8Array([0, 1, 1, 0]);
    const out = closeMask(mask, 2, 2, 0);
    expect(out).not.toBe(mask);
    expect(Array.from(out)).toEqual([0, 1, 1, 0]);
  });
});

describe('the floor helpers live in ink-extraction.js now (DP-79)', () => {
  it('and still where they were, the same functions', async () => {
    expect(floorPx(0.025)).toBeCloseTo(160, 6);
    expect(floorPx(0)).toBe(4);
    const separation = await import('../../src/js/colour-separation.js');
    expect(separation.floorPx).toBe(floorPx);
    expect(separation.dropSmallPieces).toBe(dropSmallPieces);
  });

  it('dropSmallPieces counts what it removes', () => {
    // A lone pixel in the corner and a four-pixel block: four-connected, so
    // the corner touches nothing.
    const mask = new Uint8Array([1, 0, 0, 0, 1, 1, 0, 1, 1]);
    expect(dropSmallPieces(mask, 3, 3, 2)).toBe(1);
    expect(Array.from(mask)).toEqual([0, 0, 0, 0, 1, 1, 0, 1, 1]);
  });
});
