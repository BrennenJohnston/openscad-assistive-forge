import { describe, it, expect } from 'vitest';
import { sameStreet, describeJunction } from '../../../src/js/game/city-junction.js';

/**
 * CW-61 (CW-Q58): naming the corner a traveler is about to land on.
 *
 * The sentence this feeds is accessibility-critical, and the two rules it
 * encodes were measured against the real Seattle road graph rather than
 * reasoned about. What is guarded here is that the rules do what those
 * measurements said they had to.
 */
const RADII = { onM: 12, junctionM: 12 };

describe('sameStreet (CW-61)', () => {
  it('★★ catches the suffixes the map actually uses', () => {
    // These pairs are REAL, from the Seattle extract. A cycletrack sits a
    // metre from its own avenue and is a separately named way, so without
    // this the dialog would offer "4th Avenue and 4th Avenue Cycletrack" as
    // a corner.
    expect(sameStreet('4th Avenue', '4th Avenue Cycletrack')).toBe(true);
    expect(sameStreet('8th Avenue', '8th Avenue Bike Path')).toBe(true);
    expect(sameStreet('Alaskan Way', 'Alaskan Way South')).toBe(true);
    expect(sameStreet('2nd Avenue', '2nd Avenue Cycletrack')).toBe(true);
    // Order must not matter.
    expect(sameStreet('4th Avenue Cycletrack', '4th Avenue')).toBe(true);
    // And a name is itself.
    expect(sameStreet('Pike Street', 'Pike Street')).toBe(true);
  });

  it('★★ does NOT merge two streets that merely share a spelling', () => {
    // The reason this compares WORDS and not characters. "21st Avenue"
    // literally contains "1st Avenue", so a substring test would throw away
    // a genuine cross street at any numbered corner.
    expect(sameStreet('21st Avenue', '1st Avenue')).toBe(false);
    expect(sameStreet('9th Avenue', '29th Avenue')).toBe(false);
    expect(sameStreet('Pine Street', 'Pike Street')).toBe(false);
    expect(sameStreet('4th Avenue', 'Union Street')).toBe(false);
    // A shared LAST word is not a shared street either.
    expect(sameStreet('Madison Street', 'Union Street')).toBe(false);
  });

  it('is unbothered by case and spacing, and refuses empties', () => {
    expect(sameStreet('4TH  AVENUE', '4th avenue')).toBe(true);
    expect(sameStreet('', 'Pike Street')).toBe(false);
    expect(sameStreet('Pike Street', '   ')).toBe(false);
    expect(sameStreet(null, undefined)).toBe(false);
  });
});

describe('describeJunction (CW-61)', () => {
  it('names both streets at a corner', () => {
    // Measured shape: at all 1,661 real crossings in the Seattle extract the
    // index put both streets first and second, at 0.0 m each.
    expect(
      describeJunction(
        [
          { name: '4th Avenue', distM: 0 },
          { name: 'Union Street', distM: 0 },
        ],
        RADII
      )
    ).toEqual({ primary: '4th Avenue', secondary: 'Union Street', on: true });
  });

  it('★★ names ONE street mid-block, where there is no corner to name', () => {
    // The runner-up's distance tracks how far you are from the junction, so
    // half a block along there is a second name in the list and it is not a
    // corner. Inventing one is the thing this release is most able to get
    // wrong.
    expect(
      describeJunction(
        [
          { name: 'Western Avenue', distM: 2.0 },
          { name: 'Pine Street', distM: 26.6 },
        ],
        RADII
      )
    ).toEqual({ primary: 'Western Avenue', secondary: null, on: true });
  });

  it('★ never offers a street its own cycletrack as a cross street', () => {
    // Real: 4th Avenue at 7.6 m with its own cycletrack at 1.0 m. Both are
    // well inside the junction radius, and they are not a corner.
    expect(
      describeJunction(
        [
          { name: '4th Avenue', distM: 7.6 },
          { name: '4th Avenue Cycletrack', distM: 1.0 },
        ],
        RADII
      )
    ).toEqual({ primary: '4th Avenue', secondary: null, on: true });
  });

  it('★ reaches PAST a same-street runner-up to a real cross street', () => {
    // The rejected name must not consume the slot: at Cherry Street and 4th
    // Avenue the cycletrack sits between them in the ranking.
    expect(
      describeJunction(
        [
          { name: '4th Avenue', distM: 0 },
          { name: '4th Avenue Cycletrack', distM: 8.5 },
          { name: 'Cherry Street', distM: 0 },
        ],
        RADII
      )
    ).toEqual({ primary: '4th Avenue', secondary: 'Cherry Street', on: true });
  });

  it('says ON or NEAR with the game’s existing vocabulary', () => {
    expect(describeJunction([{ name: 'Pike Street', distM: 11.9 }], RADII).on).toBe(
      true
    );
    expect(describeJunction([{ name: 'Pike Street', distM: 12.1 }], RADII).on).toBe(
      false
    );
  });

  it('says nothing rather than something wrong when no street is near', () => {
    expect(describeJunction([], RADII)).toEqual({
      primary: null,
      secondary: null,
      on: false,
    });
    expect(describeJunction(undefined, RADII).primary).toBe(null);
  });
});
