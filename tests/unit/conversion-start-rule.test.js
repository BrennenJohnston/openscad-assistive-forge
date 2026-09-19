/**
 * The one rule for a conversion that starts itself (DP-Q32; DP-57, D-157).
 *
 * The owner's number, signed at DP-Q32: at most half a megapixel AND the
 * quick look calls it quick. Both, because a small picture on a very slow
 * phone is not quick. The rule lived inline in the file-choose branch and
 * nowhere else, so a settings change re-ran the conversion by itself on any
 * picture at any speed (MEASURED: Colors chosen at 6x, running 300 ms later,
 * where the same picture had just been refused a self-start).
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';
import {
  AUTO_START_MAX_PIXELS,
  startsBySelf,
} from '../../src/js/conversion-start-rule.js';

describe('startsBySelf (DP-Q32, D-157)', () => {
  it('a small picture the quick look calls quick starts by itself', () => {
    expect(startsBySelf({ pixelCount: 600 * 448, costBand: 'quick' })).toBe(
      true
    );
    expect(AUTO_START_MAX_PIXELS).toBe(500_000);
  });

  it('a slow quick look refuses, whatever the size', () => {
    expect(startsBySelf({ pixelCount: 600 * 448, costBand: 'moderate' })).toBe(
      false
    );
    expect(startsBySelf({ pixelCount: 10_000, costBand: 'slow' })).toBe(false);
    expect(startsBySelf({ pixelCount: 10_000, costBand: undefined })).toBe(
      false
    );
  });

  it('a big picture refuses, however quick', () => {
    expect(
      startsBySelf({ pixelCount: AUTO_START_MAX_PIXELS + 1, costBand: 'quick' })
    ).toBe(false);
    expect(
      startsBySelf({ pixelCount: AUTO_START_MAX_PIXELS, costBand: 'quick' })
    ).toBe(true);
  });

  it('a press somewhere else is a press, and always starts', () => {
    expect(
      startsBySelf({ pixelCount: 4_000_000, costBand: 'slow', asked: true })
    ).toBe(true);
  });

  it('no picture, no start', () => {
    expect(startsBySelf({ pixelCount: NaN, costBand: 'quick' })).toBe(false);
    expect(startsBySelf({})).toBe(false);
  });
});
