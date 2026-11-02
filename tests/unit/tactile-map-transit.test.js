/**
 * Journeys from Transitous, the open journey planner: a walk, or a trip by
 * bus and train, each in words a person can hear, with its legs' shapes for
 * the map. The answers are Transitous's own for the Husky Union Building to
 * the Gates Center on foot and to downtown Seattle by transit, measured
 * 2026-11-01 and trimmed (OpenStreetMap contributors, ODbL; the transit
 * agencies' published schedules).
 *
 * @license GPL-3.0-or-later
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  TRANSIT_URL,
  TRANSIT_STRINGS,
  createTransitPlanner,
  decodePolyline,
} from '../../src/js/tactile-map/transit.js';

const WALK = readFileSync(
  'tests/fixtures/tactile-map/transitous-hub-gates-walk.json',
  'utf8'
);
const TRANSIT = readFileSync(
  'tests/fixtures/tactile-map/transitous-hub-downtown.json',
  'utf8'
);
const HUB = { lat: 47.6553685, lon: -122.3051021 };
const GATES = { lat: 47.652873, lon: -122.3044814 };
const DOWNTOWN = { lat: 47.6081, lon: -122.3363 };
const MONDAY = new Date('2026-11-02T16:30:00Z');

const answering = (body, status = 200) =>
  vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => JSON.parse(body),
  }));

describe('a journey from Transitous', () => {
  it('asks for a walk on foot only, at the time given, and reads the one direct journey: 342 m with its 31 turns', async () => {
    const fetch = answering(WALK);
    const planner = createTransitPlanner({ fetch });
    const journeys = await planner.planJourneys({
      from: HUB,
      to: GATES,
      when: MONDAY,
      mode: 'walk',
    });
    const url = new URL(fetch.mock.calls[0][0]);
    expect(`${url.origin}${url.pathname}`).toBe(TRANSIT_URL);
    expect(url.searchParams.get('fromPlace')).toBe(`${HUB.lat},${HUB.lon}`);
    expect(url.searchParams.get('toPlace')).toBe(`${GATES.lat},${GATES.lon}`);
    expect(url.searchParams.get('time')).toBe(MONDAY.toISOString());
    expect(url.searchParams.get('pedestrianProfile')).toBe('FOOT');
    expect(url.searchParams.get('directModes')).toBe('WALK');
    expect(url.searchParams.get('transitModes')).toBe('');
    expect(journeys).toHaveLength(1);
    const [walk] = journeys;
    expect(walk.legs).toHaveLength(1);
    expect(walk.legs[0].mode).toBe('WALK');
    expect(walk.legs[0].distanceM).toBe(342);
    expect(walk.legs[0].steps).toHaveLength(31);
    expect(walk.legs[0].steps[0]).toEqual({
      streetName: '',
      distanceM: 6,
      elevationUp: 0,
      elevationDown: 0,
    });
    expect(walk.minutes).toBe(5);
    expect(walk.changes).toBe(0);
    expect(walk.words).toBe('5 min on foot, 342 m.');
  });

  it("decodes a leg's shape at the answer's precision: the walk starts at the HUB", async () => {
    const planner = createTransitPlanner({ fetch: answering(WALK) });
    const [walk] = await planner.planJourneys({
      from: HUB,
      to: GATES,
      when: MONDAY,
      mode: 'walk',
    });
    const points = walk.legs[0].points;
    expect(points.length).toBeGreaterThan(10);
    expect(points[0][0]).toBeCloseTo(HUB.lat, 3);
    expect(points[0][1]).toBeCloseTo(HUB.lon, 3);
    const last = points[points.length - 1];
    expect(last[0]).toBeCloseTo(GATES.lat, 3);
    expect(last[1]).toBeCloseTo(GATES.lon, 3);
    // The format's own example, at precision 5.
    expect(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@', 5)).toEqual([
      [38.5, -120.2],
      [40.7, -120.95],
      [43.252, -126.453],
    ]);
  });

  it('asks for three journeys by transit and says each in words: its minutes, its changes and each ride to where it is left', async () => {
    const fetch = answering(TRANSIT);
    const planner = createTransitPlanner({ fetch });
    const journeys = await planner.planJourneys({
      from: HUB,
      to: DOWNTOWN,
      when: MONDAY,
      mode: 'transit',
    });
    const url = new URL(fetch.mock.calls[0][0]);
    expect(url.searchParams.get('numItineraries')).toBe('3');
    expect(url.searchParams.get('directModes')).toBeNull();
    // Six answers, three of them the same journey again later: three kept.
    expect(journeys.map((j) => j.words)).toEqual([
      '32 min, no change: the 1 Line to Symphony.',
      '32 min, no change: the 2 Line to Symphony.',
      '22 min, 1 change: the 72 to Stevens Way & Rainier Vista NE, then the 2 Line to Symphony.',
    ]);
    const ride = journeys[2].legs[1];
    expect(ride).toMatchObject({
      mode: 'BUS',
      routeShortName: '72',
      agencyName: 'Metro Transit',
    });
    expect(ride.from.name).toBe('East Stevens Way NE & Benton Ln');
    expect(typeof ride.from.stopId).toBe('string');
    expect(ride.points.length).toBeGreaterThan(1);
  });

  it('keeps the last answer for the same question: one request for the same places, time and mode', async () => {
    const fetch = answering(WALK);
    const planner = createTransitPlanner({ fetch });
    const ask = { from: HUB, to: GATES, when: MONDAY, mode: 'walk' };
    await planner.planJourneys(ask);
    await planner.planJourneys({ ...ask });
    expect(fetch).toHaveBeenCalledTimes(1);
    await planner.planJourneys({ ...ask, mode: 'transit' }).catch(() => {});
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('asks at the present moment when no time is given', async () => {
    const fetch = answering(WALK);
    const planner = createTransitPlanner({ fetch, now: () => MONDAY });
    await planner.planJourneys({ from: HUB, to: GATES, mode: 'walk' });
    expect(new URL(fetch.mock.calls[0][0]).searchParams.get('time')).toBe(
      MONDAY.toISOString()
    );
  });

  it('fails with a code: rate for 429, none-found for no journey, no-answer for an error or no answer at all', async () => {
    const ask = { from: HUB, to: GATES, when: MONDAY, mode: 'walk' };
    const codeOf = async (fetch) =>
      createTransitPlanner({ fetch })
        .planJourneys(ask)
        .then(
          () => 'none',
          (e) => e.code
        );
    expect(await codeOf(answering('{}', 429))).toBe('rate');
    expect(await codeOf(answering('{"direct":[],"itineraries":[]}'))).toBe(
      'none-found'
    );
    expect(await codeOf(answering('{}', 500))).toBe('no-answer');
    expect(
      await codeOf(
        vi.fn(async () => {
          throw new TypeError('Failed to fetch');
        })
      )
    ).toBe('no-answer');
  });

  it('credits Transitous and the map data it routes on', () => {
    expect(TRANSIT_STRINGS.attribution.join('')).toBe(
      'Routes from Transitous, on OpenStreetMap data.'
    );
    expect(TRANSIT_STRINGS.sourcesUrl).toBe('https://transitous.org/sources');
  });
});
