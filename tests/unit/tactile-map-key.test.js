/**
 * The map key, listed from the plan: every symbol, line and area the map
 * draws, You are here first and the rest in order of importance (BANA 2022
 * 8.5.9; ISO 19028 6.4.2), each at its printed size; then the 2-cell keys of
 * the named places whose names do not fit a label, alphabetically, made by
 * BANA 2022 5.8.1's rules.
 *
 * @license GPL-3.0-or-later
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  keyFor,
  keyText,
  keySentence,
  keyLetters,
  labelCells,
  LABEL_CELLS,
} from '../../src/js/tactile-map/map-key.js';
import { emptyPlan } from '../../src/js/tactile-map/plan.js';
import { setActiveSet } from '../../src/js/tactile-map/symbol-library.js';
import { settingsForSet } from '../../src/js/tactile-map/levels-svg.js';

const point = (id, cls, at, extra = {}) => ({
  id,
  class: cls,
  kind: 'point',
  at,
  on: true,
  ...extra,
});
const line = (id, cls, extra = {}) => ({
  id,
  class: cls,
  kind: 'line',
  points: [
    [10, 10],
    [60, 10],
  ],
  on: true,
  ...extra,
});

function fixture() {
  const plan = emptyPlan(200, 150);
  plan.features.push(
    line('w', 'walkway'),
    line('c', 'crossing'),
    line('c2', 'crossing', { style: 'dashed' }),
    line('curb', 'curb', { on: false }),
    {
      id: 'b',
      class: 'area',
      kind: 'area',
      ring: [
        [100, 100],
        [120, 100],
        [120, 120],
      ],
      on: true,
    },
    point('cafe', 'landmark', [110, 80], {
      name: 'Plaza Cafe',
      what: 'Restaurant',
    }),
    point('clinic', 'landmark', [140, 90], {
      name: 'University of Washington Medical Center - Montlake',
      what: 'Clinic',
    }),
    point('stop', 'transit-stop', [90, 60], {
      name: 'NE Pacific St & Montlake Blvd NE',
      what: 'Bus stop',
      ref: '29405',
    }),
    point('bench', 'furniture', [30, 40], { what: 'Bench' }),
    point('door', 'entrance', [100, 70], { what: 'Entrance' }),
    point('stairs', 'stairs', [70, 70]),
    point('far', 'landmark', [190, 140], {
      name: 'Pine',
      what: 'Cafe',
      on: false,
    }),
    point('you-are-here', 'you-are-here', [100, 75], { name: 'You are here' }),
    point('destination', 'destination', [120, 60], {
      name: '3600 Ferry Place Northeast',
      size: 4.9,
    })
  );
  return plan;
}

describe('keyFor', () => {
  it('lists the destination with its address first, then You are here, then the symbols by importance, the lines, the areas; only what the map draws', () => {
    const { entries } = keyFor(fixture());
    expect(entries.map((e) => [e.kind, e.name])).toEqual([
      ['point', 'Destination, 3600 Ferry Place Northeast'],
      ['point', 'You are here'],
      ['point', 'Entrance'],
      ['point', 'Stairs'],
      ['point', 'Transit stop'],
      ['point', 'Landmark or Street furniture'],
      ['line', 'Walkway'],
      ['line', 'Crossing'],
      ['line', 'Crossing'],
      ['area', 'Area'],
    ]);
    const cone = entries[0];
    expect([cone.symbolKey, cone.sizeMm, cone.raised, cone.shape]).toEqual([
      'destination-cone',
      4.9,
      false,
      'a cone 4.9 mm across and 4.9 mm tall, flat at the top',
    ]);
    const here = entries[1];
    expect([here.symbolKey, here.sizeMm, here.raised]).toEqual([
      'you-are-here',
      10,
      true,
    ]);
    const crossings = entries.filter((e) => e.name === 'Crossing');
    expect(crossings.map((e) => e.style)).toEqual(['ticks', 'dashed']);
    expect(entries.find((e) => e.name === 'Walkway').widthMm).toBe(1.5);
  });

  it('gives each named place whose name does not fit a label a 2-cell key by BANA 5.8.1, alphabetically', () => {
    const { abbreviations } = keyFor(fixture());
    expect(abbreviations).toEqual([
      {
        key: 'np',
        featureId: 'stop',
        name: 'Bus stop 29405: NE Pacific St & Montlake Blvd NE',
      },
      { key: 'pc', featureId: 'cafe', name: 'Restaurant: Plaza Cafe' },
      {
        key: 'uw',
        featureId: 'clinic',
        name: 'Clinic: University of Washington Medical Center - Montlake',
      },
    ]);
  });

  it('leaves a name that fits its label unkeyed, and keys only what is on', () => {
    const plan = fixture();
    plan.features.find((f) => f.id === 'far').on = true;
    const { abbreviations } = keyFor(plan);
    expect(labelCells('Pine')).toBeLessThanOrEqual(LABEL_CELLS);
    expect(abbreviations.some((a) => a.featureId === 'far')).toBe(false);
    expect(abbreviations.some((a) => a.featureId === 'bench')).toBe(false);
  });

  it('names together the classes a finger cannot tell apart: one entry per printed shape', () => {
    const plan = emptyPlan(200, 150);
    plan.features.push(
      point('x', 'crossing', [20, 20]),
      point('l', 'landmark', [60, 20], { name: 'Pine', what: 'Cafe' }),
      point('s', 'stairs', [100, 20])
    );
    const { entries } = keyFor(plan);
    expect(entries.map((e) => e.name)).toEqual([
      'Stairs',
      'Crossing or Landmark',
    ]);
  });

  it('lists twelve entries for twelve kinds of thing drawn', () => {
    const plan = emptyPlan(400, 300);
    const points = [
      'you-are-here',
      'entrance',
      'stairs',
      'elevator-up',
      'elevator-down',
      'transit-stop',
      'landmark',
      'curb-ramp',
      'raised-curb',
    ];
    points.forEach((cls, i) =>
      plan.features.push(point(`p${i}`, cls, [20 + i * 30, 20]))
    );
    plan.features.push(
      line('w', 'walkway'),
      line('r', 'route'),
      line('t', 'track')
    );
    expect(keyFor(plan).entries).toHaveLength(12);
  });
});

describe('keyLetters', () => {
  it('takes the first letters of the words, one with dot 3 or 6, never a barred pair, each once', () => {
    const taken = new Set();
    const said = (name) => keyLetters(name, taken);
    expect(said('Plaza Cafe')).toBe('pc');
    // "ac" is barred (BANA 5.8.1.2), "ae" has no dot 3 or 6: "an".
    expect(said('Arts Center')).toBe('an');
    // "ab" is a shortform BANA does not allow, "aa" barred: "ak".
    expect(said('Alder Bakery')).toBe('ak');
    // A second "Plaza Cafe" gets the next letters.
    expect(said('Plaza Cafe')).toBe('pa');
    // A pair that contracted braille writes as one cell is never a key.
    expect(said('Chase Hall')).not.toBe('ch');
    for (const k of taken) {
      expect(k).toMatch(/^[a-z]{2}$/);
      expect(/[k-z]/.test(k)).toBe(true);
    }
    expect(taken.size).toBe(5);
  });
});

describe('the key as words', () => {
  it('reads as the README section and one sentence for the status', () => {
    const key = keyFor(fixture());
    const text = keyText(key);
    expect(text).toMatch(/^Key\n/);
    expect(text).toContain(
      'Destination, 3600 Ferry Place Northeast: a cone 4.9 mm across and 4.9 mm tall, flat at the top'
    );
    expect(text).toContain(
      'You are here: a disc 10 mm across with a center dot one step higher'
    );
    expect(text).toContain('pc: Restaurant: Plaza Cafe');
    expect(text).toContain('Walkway: a solid line 1.5 mm wide, low');
    expect(text).toContain('Area: a raised area, low');
    expect(keySentence(key)).toBe(
      'The key has 10 symbols and 3 abbreviations.'
    );
  });
});

describe('the key with a published set in use', () => {
  afterEach(() => setActiveSet('forge-basic'));

  it("names the set's shapes by their own names at the set's size, and names the set", () => {
    expect(keyFor(fixture()).set).toEqual({
      key: 'forge-basic',
      name: 'Forge basic shapes',
    });
    expect(keyText(keyFor(fixture()))).toMatch(
      /^Key\nSymbols: Forge basic shapes\.\n\n/
    );
    setActiveSet('oregon-2012');
    const key = keyFor(fixture(), settingsForSet('oregon-2012'));
    const entrance = key.entries.find((e) =>
      (e.classes || []).includes('entrance')
    );
    expect(entrance.shape).toBe('Entrance, 13 mm');
    expect(key.set).toEqual({
      key: 'oregon-2012',
      name: 'University of Oregon symbols',
    });
    expect(keyText(key)).toMatch(
      /^Key\nSymbols: University of Oregon symbols\.\n\n/
    );
  });
});
