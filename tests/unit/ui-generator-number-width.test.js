/**
 * How wide a Customizer number box is: as many characters as the
 * parameter's longest value needs, so the slider beside it keeps the rest of
 * the row.
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';
import { numberBoxChars } from '../../src/js/ui-generator.js';

describe('the number box is as wide as its longest value', () => {
  it('counts the longest of the minimum, maximum and default', () => {
    expect(
      numberBoxChars({ minimum: 10, maximum: 100, default: 50, step: 1 })
    ).toBe(3);
    expect(
      numberBoxChars({ minimum: 0, maximum: 10000, default: 500, step: 50 })
    ).toBe(5);
  });

  it("writes them at the step's decimals", () => {
    expect(
      numberBoxChars({ minimum: 0.2, maximum: 3, default: 0.8, step: 0.1 })
    ).toBe(3);
    expect(
      numberBoxChars({ minimum: 0, maximum: 1.5, default: 0, step: 0.05 })
    ).toBe(4);
  });

  it('counts a sign where the range goes below zero', () => {
    expect(
      numberBoxChars({ minimum: -50, maximum: 50, default: 0, step: 1 })
    ).toBe(3);
  });

  it('makes room for the wider range when the limits are unlocked', () => {
    const param = { minimum: 10, maximum: 100, default: 50, step: 1 };
    // 10 - 90 = -80 and 100 + 90 = 190
    expect(numberBoxChars(param, { unlocked: true })).toBe(3);
    expect(
      numberBoxChars(
        { minimum: 0, maximum: 900, default: 1, step: 1 },
        { unlocked: true }
      )
    ).toBe(4);
  });

  it('keeps at least two characters, and copes with a missing range', () => {
    expect(
      numberBoxChars({ minimum: 0, maximum: 5, default: 1, step: 1 })
    ).toBe(2);
    expect(numberBoxChars({ default: 120.5 })).toBe(5);
    expect(numberBoxChars({})).toBe(2);
  });
});
