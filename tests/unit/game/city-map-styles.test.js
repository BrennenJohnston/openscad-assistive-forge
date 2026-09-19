import { describe, it, expect } from 'vitest';
import {
  MAP_STYLES,
  DEFAULT_MAP_STYLE,
  mapStyleById,
  mapStyleIndex,
  cycleMapStyle,
  mapStyleAnnouncement,
  wayfindMarkSizeM,
  wayfindTierOf,
  WAYFIND_KINDS,
  WAYFIND_MARK_SPAN_FRACTION,
  WAYFIND_ZOOM_MIN,
  WAYFIND_ZOOM_MAX,
} from '../../../src/js/game/city-map-styles.js';

/**
 * CW-60 (CW-Q57): four map styles.
 *
 * What is guarded here is the claim the styles make - that each one is a
 * SIMPLIFICATION rather than a palette swap - plus the arithmetic of the
 * wayfinding mark, which is the part no photograph can check.
 */
describe('map styles (CW-60)', () => {
  it('gives four well-formed styles, Standard first', () => {
    expect(MAP_STYLES).toHaveLength(4);
    expect(MAP_STYLES[0].id).toBe(DEFAULT_MAP_STYLE);
    const LAYERS = ['roads', 'sidewalks', 'buildings', 'greens', 'wayfinding'];
    for (const s of MAP_STYLES) {
      expect(typeof s.name, s.id).toBe('string');
      expect(s.name.length).toBeGreaterThan(2);
      expect(typeof s.hides, s.id).toBe('string');
      for (const layer of LAYERS) {
        expect(s[layer], `${s.id}.${layer}`).toBeDefined();
        expect(typeof s[layer].show, `${s.id}.${layer}.show`).toBe('boolean');
      }
    }
  });

  it('★★ makes every style a SIMPLIFICATION, not a palette swap', () => {
    // The whole argument for the feature. A style that only recoloured things
    // would be a repaint wearing a tactile-map citation, so each style after
    // Standard must either hide a layer outright or move one to a tone
    // Standard does not use. Standard itself is the baseline and changes
    // nothing, which is why it is exempt.
    const [standard, ...rest] = MAP_STYLES;
    for (const s of rest) {
      const hidesSomething = ['roads', 'sidewalks', 'buildings', 'greens'].some(
        (l) => !s[l].show
      );
      const retones = ['roads', 'sidewalks', 'buildings', 'greens'].some(
        (l) => s[l].tone !== null && s[l].tone !== standard[l].tone
      );
      expect(hidesSomething || retones, `${s.id} changes nothing`).toBe(true);
    }
    // And two of them hide a whole layer, which is what "one layer per
    // finger-load" actually asks for.
    const hiders = rest.filter((s) =>
      ['buildings', 'greens', 'roads'].some((l) => !s[l].show)
    );
    expect(hiders.map((s) => s.id)).toContain('roads');
  });

  it('★ only the Wayfinding style draws the wayfinding layer', () => {
    // CW-43 parsed crossings, kerbs and tactile paving and nothing has ever
    // drawn them. Seattle has 5,355 of them, so this layer is either the
    // subject of a style or it is a carpet over every other one.
    const showing = MAP_STYLES.filter((s) => s.wayfinding.show);
    expect(showing.map((s) => s.id)).toEqual(['wayfinding']);
  });

  it('★ keeps the roads visible in every style, even the one that buries them', () => {
    // A map with no network is not a map of a city. Buildings only dims the
    // roads to a hairline rather than removing them, so the shape of the
    // place survives.
    for (const s of MAP_STYLES) {
      expect(s.roads.show, `${s.id} hid the roads entirely`).toBe(true);
    }
  });

  it('cycles both ways and wraps', () => {
    expect(mapStyleIndex('standard')).toBe(0);
    expect(mapStyleIndex('nonsense')).toBe(0);
    expect(mapStyleById('nonsense').id).toBe('standard');

    let id = 'standard';
    const seen = [];
    for (let i = 0; i < MAP_STYLES.length; i++) {
      seen.push(id);
      id = cycleMapStyle(id, 1);
    }
    expect(seen).toEqual(MAP_STYLES.map((s) => s.id));
    expect(id).toBe('standard');
    // Backwards from the first wraps to the last.
    expect(cycleMapStyle('standard', -1)).toBe(MAP_STYLES.at(-1).id);
    expect(cycleMapStyle(MAP_STYLES.at(-1).id, 1)).toBe('standard');
  });

  it('★★ sizes a wayfinding mark on SCREEN, not in metres', () => {
    // ★ The first version used a fixed 2.6 m divided by the zoom. At zoom 1
    // the whole city is in frame and one pixel is about four metres, so the
    // marks were SUB-PIXEL and the style photographed as an empty map. Size
    // comes from the city's own span now, the same family the player marker
    // uses, so a small extract and a large one both work.
    const SEATTLE = 5000;
    const wide = wayfindMarkSizeM(0.25, SEATTLE);
    const mid = wayfindMarkSizeM(1, SEATTLE);
    const close = wayfindMarkSizeM(8, SEATTLE);
    expect(wide).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(close);
    // At zoom 1 it must be big enough to survive the converter's cells: one
    // pixel is roughly four metres there, so a sub-ten-metre mark is the bug
    // this test exists to catch.
    expect(mid).toBeGreaterThan(10);
    // Clamped at both ends of the zoom range, so neither extreme loses the
    // layer nor lets it swallow the map.
    expect(wayfindMarkSizeM(0.0001, SEATTLE)).toBe(
      SEATTLE * WAYFIND_MARK_SPAN_FRACTION * WAYFIND_ZOOM_MAX
    );
    expect(wayfindMarkSizeM(10000, SEATTLE)).toBe(
      SEATTLE * WAYFIND_MARK_SPAN_FRACTION * WAYFIND_ZOOM_MIN
    );
    // ★ A SMALL CITY GETS SMALLER MARKS, which is the point of tying this to
    // the span rather than to a constant: Albuquerque's extract is a fraction
    // of Seattle's and a Seattle-sized mark would cover it.
    expect(wayfindMarkSizeM(1, 1200)).toBeLessThan(mid);
    // A missing or absurd span falls back rather than producing zero.
    expect(wayfindMarkSizeM(1, 0)).toBeGreaterThan(0);
    expect(wayfindMarkSizeM(1, undefined)).toBeGreaterThan(0);
  });

  it('★★ says out loud what the picture just did (CW-60 P2)', () => {
    // ACCESSIBILITY-CRITICAL. A style change is a change to the whole
    // picture, and the picture is the one thing a screen-reader user cannot
    // check for themselves - so the sentence has to name the style AND say
    // what it did, not just announce that something happened.
    for (const s of MAP_STYLES) {
      const said = mapStyleAnnouncement(s.id);
      expect(said, s.id).toContain(s.name);
      expect(said, s.id).toContain(s.detail);
      // Two sentences, both finished. A truncated one reads as a glitch.
      expect(said.endsWith('.'), s.id).toBe(true);
      expect(s.detail.length, s.id).toBeGreaterThan(20);
      // UI text carries no em dashes in this project (UF-3).
      expect(said, s.id).not.toContain('—');
    }
    // Four distinct sentences: a style that borrowed another's words would
    // tell a listener the map changed to something it did not change to.
    expect(new Set(MAP_STYLES.map((s) => mapStyleAnnouncement(s.id))).size).toBe(
      MAP_STYLES.length
    );
    // An unrecognised id falls back to Standard here too, rather than saying
    // 'Map style: undefined'.
    expect(mapStyleAnnouncement('nonsense')).toBe(
      mapStyleAnnouncement(DEFAULT_MAP_STYLE)
    );
  });

  it('★ tells the three kinds apart by BRIGHTNESS, and orders them honestly', () => {
    // At one or two character cells a triangle and a square are the same
    // cell - the hydrant lesson - so shape cannot carry the difference and
    // brightness has to.
    expect(wayfindTierOf('crossing')).toBeGreaterThan(
      wayfindTierOf('tactile_paving')
    );
    expect(wayfindTierOf('tactile_paving')).toBeGreaterThan(
      wayfindTierOf('kerb')
    );
    // A crossing is where you cross, so it is the brightest thing on the
    // layer. An unknown kind falls to the quietest rather than to nothing.
    expect(wayfindTierOf('crossing')).toBe(WAYFIND_KINDS.crossing.tier);
    expect(wayfindTierOf('something-new')).toBe(WAYFIND_KINDS.kerb.tier);
    for (const k of Object.values(WAYFIND_KINDS)) {
      expect(k.tier).toBeGreaterThan(0);
      expect(k.tier).toBeLessThanOrEqual(1);
    }
  });
});
