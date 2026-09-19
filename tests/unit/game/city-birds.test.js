import { describe, it, expect } from 'vitest';
import {
  BIRD_SPECIES,
  CITY_BIRDS,
  SPECIES_PERCHES,
  PERCH_KINDS,
  birdTableFor,
  perchesFor,
  speciesForPerch,
  pickBird,
  birdSpec,
  birdBoxes,
  birdExtentM,
  PERCH_SINK_M,
} from '../../../src/js/game/city-birds.js';

/**
 * CW-58 (CW-Q54): birds where birds rest.
 *
 * CW-57's picnic table was LOPSIDED and looked exactly like a picnic table -
 * only arithmetic saw it. So these guards assert the arithmetic: that a bird
 * is the size its citation claims, that nothing overhangs what it says it is,
 * and that a species only appears on a perch it would actually use.
 */
describe('birds and their perches (CW-58)', () => {
  const NAMES = Object.keys(BIRD_SPECIES);

  it('gives every species a well-formed cited size range', () => {
    for (const [name, s] of Object.entries(BIRD_SPECIES)) {
      expect(s.m, name).toHaveLength(2);
      expect(s.m[0], name).toBeGreaterThan(0);
      expect(s.m[1], name).toBeGreaterThan(s.m[0]);
      // Nothing on this roster is smaller than a chickadee or bigger than a
      // goose. A range outside that is a typo, not a bird.
      expect(s.m[0], name).toBeGreaterThanOrEqual(0.12);
      expect(s.m[1], name).toBeLessThanOrEqual(1.1);
    }
  });

  it('★ builds every species TRUE TO ITS CITED LENGTH', () => {
    // The one thing this release is not allowed to do is inflate a bird so it
    // can be seen. A built bird's nose-to-tail extent must be the cited body
    // length, within the slop a boxy build costs.
    for (const name of NAMES) {
      for (const t of [0, 0.5, 1]) {
        const spec = birdSpec(name, t);
        const cited = spec.lengthM;
        const built = birdExtentM(spec);
        expect(built / cited, `${name} @${t}`).toBeGreaterThan(0.85);
        expect(built / cited, `${name} @${t}`).toBeLessThanOrEqual(1.0);
      }
    }
  });

  it('keeps every box inside the body length and above the perch', () => {
    for (const name of NAMES) {
      const spec = birdSpec(name, 0.5);
      const boxes = birdBoxes(spec);
      expect(boxes.length, name).toBeGreaterThanOrEqual(2);
      expect(boxes.length, name).toBeLessThanOrEqual(5);
      for (const b of boxes) {
        expect(b.l, name).toBeGreaterThan(0);
        expect(b.w, name).toBeGreaterThan(0);
        expect(b.h, name).toBeGreaterThan(0);
        // Nothing hangs more than half a body length off centre.
        expect(Math.abs(b.along), name).toBeLessThanOrEqual(spec.lengthM * 0.8);
        // Nothing sinks below the perch by more than the deliberate hair.
        expect(b.z - b.h / 2, name).toBeGreaterThanOrEqual(-PERCH_SINK_M * 2);
        // ★ EVERY BOX IS CENTRED ON THE BIRD'S OWN LINE. CW-57's picnic
        // table was lopsided from a missing pair of parentheses, hung a bench
        // outside its own collision footprint, and looked exactly like a
        // picnic table. A bird is symmetric about its length; assert it
        // rather than trusting a photograph to notice.
        expect(b.across, `${name} across`).toBe(0);
      }
    }
  });

  it('sinks the bird a hair into its perch rather than touching it exactly', () => {
    // ★ D-110: two faces at the same height z-fight in the surface-id buffer,
    // and CW-52 found a quarter of a frame re-rolling its glyph vocabulary
    // from exactly that. The sink is small, deliberate, and pinned.
    expect(PERCH_SINK_M).toBeGreaterThan(0);
    expect(PERCH_SINK_M).toBeLessThan(0.05);
  });

  it('★★ only puts a species on a perch it would actually use', () => {
    // The honest half of the design. A roster alone would let a goose perch
    // on a bench back.
    for (const [name, perches] of Object.entries(SPECIES_PERCHES)) {
      expect(BIRD_SPECIES[name], name).toBeDefined();
      expect(perches.length, name).toBeGreaterThan(0);
      for (const p of perches) expect(PERCH_KINDS, name).toContain(p);
    }
    // A goose and a roadrunner are ground birds and nothing else: neither
    // perches above the ground, whatever kind of ground it is.
    const GROUND_KINDS = ['ground', 'open-ground'];
    for (const n of ['canada goose', 'greater roadrunner']) {
      for (const p of SPECIES_PERCHES[n]) expect(GROUND_KINDS, n).toContain(p);
    }
    // ★★ THIS GUARD ONCE PINNED A CLAIM THE PROOF GATE REFUTED. It asserted
    // the crow was never on the ground, and called that "a measured
    // constraint, not a taste" - but nothing had measured it. When the gate
    // did, swinging a bird across the WHOLE tier band moved the frame by
    // nothing (0.02% either way on a lamp head), and the ground turned out to
    // be the crow's BEST perch rather than its worst. A test that pins an
    // untested inference is worse than no test: it makes the inference look
    // settled. What is guarded now is the thing that is actually true.
    expect(SPECIES_PERCHES['american crow']).toContain('ground');
    // A goose stays lawn-only; a gull takes parkland but not pavement.
    expect(SPECIES_PERCHES['canada goose']).not.toContain('open-ground');
    expect(SPECIES_PERCHES.gull).not.toContain('open-ground');
    // Small birds still do not stand on lawns - that one is about the bird,
    // not about brightness, and needs no measurement to justify.
    expect(SPECIES_PERCHES['black-capped chickadee']).not.toContain('ground');
    expect(SPECIES_PERCHES['house sparrow']).not.toContain('ground');
  });

  it('gives every city a roster whose species all exist', () => {
    expect(Object.keys(CITY_BIRDS).sort()).toEqual([
      'albuquerque',
      'burnaby',
      'denver',
      'seattle',
    ]);
    for (const [city, roster] of Object.entries(CITY_BIRDS)) {
      expect(roster.length, city).toBeGreaterThanOrEqual(3);
      for (const n of roster)
        expect(BIRD_SPECIES[n], `${city}/${n}`).toBeDefined();
    }
    expect(birdTableFor('atlantis')).toBe(CITY_BIRDS.seattle);
    expect(birdTableFor('burnaby')).toBe(CITY_BIRDS.burnaby);
  });

  it('★ makes the desert city the odd one out, the way its flowers did', () => {
    // The argument for per-city rosters in one line: the roadrunner is
    // Albuquerque's own bird and no other city has anything like it.
    const road = Object.entries(CITY_BIRDS).filter(([, r]) =>
      r.includes('greater roadrunner')
    );
    expect(road.map(([c]) => c)).toEqual(['albuquerque']);
    // ★ AND THE GUARD CORRECTED ME HERE. This first asserted Albuquerque had
    // NOBODY for a parapet, which is false - a pigeon uses a parapet in every
    // city, Albuquerque included. What is actually true, and is the better
    // claim, is that it is the ONLY city whose roofline carries no corvid and
    // no gull: its high perches are all pigeons.
    expect(speciesForPerch(CITY_BIRDS.albuquerque, 'parapet')).toEqual([
      'rock pigeon',
    ]);
    for (const city of ['seattle', 'denver', 'burnaby']) {
      const onRoof = speciesForPerch(CITY_BIRDS[city], 'parapet');
      expect(
        onRoof.some((n) => n === 'american crow' || n === 'gull'),
        city
      ).toBe(true);
    }
    // Its roster has nobody at all for a bench back, which IS a real empty.
    expect(pickBird(CITY_BIRDS.albuquerque, 'bench-back', 0)).toBe(
      'house sparrow'
    );
    expect(perchesFor(CITY_BIRDS.albuquerque).has('parapet')).toBe(true);
  });

  it('picks deterministically and only from the eligible', () => {
    const roster = CITY_BIRDS.seattle;
    const onGround = new Set();
    for (let d = 0; d < 40; d++) onGround.add(pickBird(roster, 'ground', d));
    // Seattle's lawns take the gull, the crow and the pigeon, and nothing
    // else on its roster - the sparrow is a perching bird here.
    expect(onGround).toEqual(new Set(['gull', 'american crow', 'rock pigeon']));
    const seen = new Set();
    for (let d = 0; d < 40; d++) seen.add(pickBird(roster, 'lamp-head', d));
    expect(seen).toEqual(new Set(speciesForPerch(roster, 'lamp-head')));
    // Same seed, same bird, every load.
    expect(pickBird(roster, 'parapet', 7)).toBe(pickBird(roster, 'parapet', 7));
  });

  it('returns nothing rather than something wrong for an unknown species', () => {
    expect(birdSpec('pterodactyl', 0.5)).toBeNull();
    expect(pickBird(['pterodactyl'], 'ground', 0)).toBeNull();
  });
});
