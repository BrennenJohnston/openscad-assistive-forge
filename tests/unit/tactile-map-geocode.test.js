/**
 * Geocoding for the Tactile Map Designer: a typed address becomes up to five
 * places from Nominatim, under its usage policy (one request a second, no
 * autocomplete, no email in the request, the page's origin as the Referer).
 *
 * The fetch and the clock are injected; the fixture is trimmed from a real
 * jsonv2 answer of 2026-10-29 for "1000 4th Ave, Seattle, WA".
 *
 * @license GPL-3.0-or-later
 */
import { describe, it, expect, vi } from 'vitest';
import { createGeocoder } from '../../src/js/tactile-map/geocode.js';

const FIXTURE = [
  {
    place_id: 324484117,
    osm_type: 'way',
    osm_id: 37056442,
    lat: '47.6067142',
    lon: '-122.3326983',
    category: 'amenity',
    type: 'library',
    importance: 0.371773638720501,
    name: 'The Seattle Public Library - Central Library',
    display_name:
      'The Seattle Public Library - Central Library, 1000, 4th Avenue, Central Business District, First Hill, Seattle, King County, Washington, 98104, United States',
  },
  {
    place_id: 324437071,
    osm_type: 'node',
    osm_id: 3435946993,
    lat: '47.6065451',
    lon: '-122.3322194',
    category: 'amenity',
    type: 'cafe',
    importance: 7.72983901731444e-5,
    name: "Howdy Y'all Coffee",
    display_name:
      "Howdy Y'all Coffee, 1000, 4th Avenue, West Edge, First Hill, Seattle, King County, Washington, 98164, United States",
  },
  {
    place_id: 324435838,
    osm_type: 'node',
    osm_id: 7684336148,
    lat: '47.6064367',
    lon: '-122.3328731',
    category: 'amenity',
    type: 'toilets',
    importance: 7.72983901731444e-5,
    name: '',
    display_name:
      '1000, 4th Avenue, Central Business District, First Hill, Seattle, King County, Washington, 98104, United States',
  },
  {
    place_id: 324442535,
    osm_type: 'node',
    osm_id: 4098502007,
    lat: '47.6066918',
    lon: '-122.3332238',
    category: 'amenity',
    type: 'waste_basket',
    importance: 7.72983901731444e-5,
    name: '',
    display_name:
      '1000, 4th Avenue, Central Business District, First Hill, Seattle, King County, Washington, 98104, United States',
  },
  {
    place_id: 324496608,
    osm_type: 'node',
    osm_id: 3211770150,
    lat: '47.6063082',
    lon: '-122.3328230',
    category: 'amenity',
    type: 'fountain',
    importance: 7.72983901731444e-5,
    name: 'Fountain of Wisdom',
    display_name:
      'Fountain of Wisdom, 1000, 4th Avenue, Central Business District, First Hill, Seattle, King County, Washington, 98104, United States',
  },
];

const answer = (body, status = 200) =>
  vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  }));

describe('createGeocoder().searchPlaces', () => {
  it('maps up to five answers to places in order, with numbers for lat and lon', async () => {
    const fetch = answer(FIXTURE);
    const { searchPlaces } = createGeocoder({ fetch, now: () => 10_000 });
    const places = await searchPlaces('1000 4th Ave, Seattle, WA');
    expect(places).toHaveLength(5);
    expect(places[0]).toEqual({
      name: FIXTURE[0].display_name,
      lat: 47.6067142,
      lon: -122.3326983,
      kind: 'library',
    });
    expect(places.map((p) => p.kind)).toEqual([
      'library',
      'cafe',
      'toilets',
      'waste_basket',
      'fountain',
    ]);
  });

  it('asks Nominatim for jsonv2, five results and the encoded query, with no email and no custom header', async () => {
    const fetch = answer(FIXTURE);
    const { searchPlaces } = createGeocoder({ fetch, now: () => 10_000 });
    await searchPlaces('Pike St & 1st Ave, Seattle');
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url.startsWith('https://nominatim.openstreetmap.org/search?')).toBe(
      true
    );
    const params = new URL(url).searchParams;
    expect(params.get('format')).toBe('jsonv2');
    expect(params.get('limit')).toBe('5');
    expect(params.get('q')).toBe('Pike St & 1st Ave, Seattle');
    expect(params.has('email')).toBe(false);
    expect(init?.headers).toBeUndefined();
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('refuses a second search within a second of the last, without a request', async () => {
    const fetch = answer(FIXTURE);
    let t = 10_000;
    const { searchPlaces } = createGeocoder({ fetch, now: () => t });
    await searchPlaces('one');
    t = 10_400;
    await expect(searchPlaces('two')).rejects.toMatchObject({ code: 'rate' });
    expect(fetch).toHaveBeenCalledTimes(1);
    t = 11_100;
    await expect(searchPlaces('three')).resolves.toHaveLength(5);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('says no-answer for a 503 and for a fetch that throws', async () => {
    const down = createGeocoder({
      fetch: answer('Service Unavailable', 503),
      now: () => 10_000,
    });
    await expect(down.searchPlaces('x')).rejects.toMatchObject({
      code: 'no-answer',
    });
    const broken = createGeocoder({
      fetch: vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
      now: () => 10_000,
    });
    await expect(broken.searchPlaces('x')).rejects.toMatchObject({
      code: 'no-answer',
    });
  });

  it('resolves an empty list when nothing is found', async () => {
    const { searchPlaces } = createGeocoder({
      fetch: answer([]),
      now: () => 10_000,
    });
    await expect(searchPlaces('zzzz')).resolves.toEqual([]);
  });

  it('refuses an empty query without a request', async () => {
    const fetch = answer(FIXTURE);
    const { searchPlaces } = createGeocoder({ fetch, now: () => 10_000 });
    await expect(searchPlaces('   ')).rejects.toMatchObject({ code: 'empty' });
    expect(fetch).not.toHaveBeenCalled();
  });
});
