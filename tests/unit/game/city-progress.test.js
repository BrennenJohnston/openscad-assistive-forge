import { describe, it, expect, beforeEach } from 'vitest';
import {
  readCityProgress,
  writeCityProgress,
} from '../../../src/js/game/city-progress.js';
import { getCityWalkProgressKey } from '../../../src/js/storage-keys.js';

/**
 * CW-62 (CW-Q56): the per-city visited store.
 *
 * What is guarded here is the two things a store like this gets wrong: it
 * loses progress on anything unexpected, or it eats a field a later release
 * added. CW-64's fireworks flag and CW-65's traveler are both meant to live
 * in this object.
 */
describe('city progress store (CW-62)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('a city nobody has played reads as a clean slate', () => {
    const p = readCityProgress('seattle');
    expect(p.visited.size).toBe(0);
    expect(p.allFound).toBe(false);
  });

  it('round-trips what was found', () => {
    writeCityProgress('seattle', {
      visited: new Set(['Space Needle', 'Smith Tower Observatory']),
      allFound: false,
    });
    const p = readCityProgress('seattle');
    expect([...p.visited].sort()).toEqual([
      'Smith Tower Observatory',
      'Space Needle',
    ]);
    expect(p.allFound).toBe(false);
  });

  it('★ keeps cities apart', () => {
    writeCityProgress('seattle', { visited: ['Space Needle'], allFound: true });
    writeCityProgress('denver', { visited: [], allFound: false });
    expect(readCityProgress('seattle').allFound).toBe(true);
    expect(readCityProgress('denver').allFound).toBe(false);
    expect(readCityProgress('burnaby').visited.size).toBe(0);
  });

  it('★★ PRESERVES A FIELD IT DOES NOT UNDERSTAND', () => {
    // CW-64 adds its fireworks flag to this same object rather than minting a
    // sibling key. An older build that read and rewrote progress must not
    // silently delete it - that is a data-loss bug that only shows up after
    // someone downgrades or opens two tabs.
    localStorage.setItem(
      getCityWalkProgressKey('seattle'),
      JSON.stringify({
        visited: ['Space Needle'],
        allFound: false,
        fireworksUnlocked: true,
        somethingCW65Adds: { seen: 3 },
      })
    );
    const p = readCityProgress('seattle');
    p.visited.add('Smith Tower Observatory');
    writeCityProgress('seattle', p);

    const after = JSON.parse(
      localStorage.getItem(getCityWalkProgressKey('seattle'))
    );
    expect(after.fireworksUnlocked).toBe(true);
    expect(after.somethingCW65Adds).toEqual({ seen: 3 });
    expect(after.visited.sort()).toEqual([
      'Smith Tower Observatory',
      'Space Needle',
    ]);
  });

  it('★ treats anything malformed as a clean slate rather than half-reading it', () => {
    const key = getCityWalkProgressKey('seattle');
    for (const junk of [
      'not json at all',
      '{"visited": "Space Needle"}',
      '[1,2,3]',
      'null',
      '{"visited": [1, 2, null, ""], "allFound": "yes"}',
    ]) {
      localStorage.setItem(key, junk);
      const p = readCityProgress('seattle');
      expect(p.visited.size, junk).toBe(0);
      // 'yes' is not true. Only the boolean counts, or a truthy string would
      // silently mark a city complete.
      expect(p.allFound, junk).toBe(false);
    }
  });

  it('writes a Set or an array, and drops empties either way', () => {
    writeCityProgress('denver', {
      visited: ['Union Station', '', null, 'Denver Art Museum'],
      allFound: false,
    });
    expect([...readCityProgress('denver').visited].sort()).toEqual([
      'Denver Art Museum',
      'Union Station',
    ]);
  });
});
