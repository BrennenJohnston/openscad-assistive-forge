/**
 * The vector tile reader: a Mapbox Vector Tile decoded by hand, checked
 * against a real tile of the OpenStreetMap US Sourdough tiles over the Bill
 * & Melinda Gates Center (zoom 15, x 5251, y 11437, fetched 2026-11-01; map
 * data from OpenStreetMap contributors, ODbL). The expected numbers were
 * read from the same tile with an independent decoder (the Python
 * mapbox-vector-tile package, y down).
 *
 * @license GPL-3.0-or-later
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { decodeTile } from '../../src/js/tactile-map/vector-tile.js';

const BYTES = new Uint8Array(
  readFileSync('tests/fixtures/tactile-map/sourdough-15-5251-11437.mvt')
);

/** The GeoJSON-like type an independent decoder gives a feature. */
function shapeOf(feature) {
  const parts = feature.geometry.length;
  if (feature.type === 1) return parts > 1 ? 'MultiPoint' : 'Point';
  if (feature.type === 2) return parts > 1 ? 'MultiLineString' : 'LineString';
  const outers = feature.geometry.filter((p) => p.length > 0).length;
  return outers > 1 ? 'MultiPolygon' : 'Polygon';
}

const vertices = (feature) =>
  feature.type === 3
    ? feature.geometry.flat(2).length
    : feature.geometry.flat(1).length;

describe('decodeTile', () => {
  const tile = decodeTile(BYTES);

  it('reads every layer of the tile with its extent', () => {
    for (const name of ['highways', 'buildings', 'barriers', 'public_transport']) {
      expect(tile[name], name).toBeTruthy();
      expect(tile[name].extent).toBe(4096);
    }
  });

  it('reads the features of each layer, their kinds and their points, as an independent decoder does', () => {
    const expected = {
      highways: {
        count: 420,
        verts: 4964,
        types: { MultiPoint: 25, Point: 42, LineString: 222, MultiLineString: 124, Polygon: 5, MultiPolygon: 2 },
      },
      buildings: {
        count: 144,
        verts: 2596,
        types: { MultiPoint: 10, Point: 7, Polygon: 117, MultiPolygon: 10 },
      },
      barriers: {
        count: 41,
        verts: 643,
        types: { MultiPoint: 22, Point: 6, LineString: 5, MultiLineString: 8 },
      },
      public_transport: { count: 46, verts: 46, types: { Point: 46 } },
    };
    for (const [name, want] of Object.entries(expected)) {
      const features = tile[name].features;
      expect(features, name).toHaveLength(want.count);
      const types = {};
      for (const f of features) types[shapeOf(f)] = (types[shapeOf(f)] || 0) + 1;
      expect(types, name).toEqual(want.types);
      expect(
        features.reduce((n, f) => n + vertices(f), 0),
        name
      ).toBe(want.verts);
    }
  });

  it("reads a feature's id, its tags of every value type, and a point in tile units", () => {
    const stop = tile.public_transport.features[0];
    expect(stop.id).toBe(299728401);
    expect(stop.type).toBe(1);
    expect(stop.tags).toEqual({
      bus: 'yes',
      ref: '75406',
      name: 'East Stevens Way NE & Pend Oreille Rd',
      'network:wikidata': 'Q6411393',
      public_transport: 'stop_position',
      _minzoom: 15,
      operator: 'King County Metro',
      _reczoom: 17,
      network: 'King County Metro',
    });
    expect(stop.geometry).toEqual([[[2236, 678]]]);
  });

  it('reads a sidewalk as lines and a building as a closed ring', () => {
    const sidewalks = tile.highways.features.filter(
      (f) => f.tags.footway === 'sidewalk'
    );
    expect(sidewalks).toHaveLength(24);
    const first = sidewalks[0];
    expect(first.id).toBe(1146953530);
    expect(first.tags).toEqual({
      footway: 'sidewalk',
      highway: 'footway',
      surface: 'paved',
      lit: 'yes',
    });
    expect(first.geometry[0].slice(0, 2)).toEqual([
      [315, 459],
      [308, 451],
    ]);

    const gates = tile.buildings.features.find(
      (f) => f.tags.name === 'Bill & Melinda Gates Center'
    );
    expect(gates.id).toBe(14911550672);
    expect(gates.type).toBe(3);
    expect(gates.geometry).toHaveLength(1);
    const ring = gates.geometry[0][0];
    expect(ring).toHaveLength(21);
    expect(ring[20]).toEqual(ring[0]);
  });

  it('says what is wrong with bytes that are not a vector tile', () => {
    expect(() => decodeTile(new Uint8Array([0x1a, 0xff, 0xff]))).toThrow(
      /not a vector tile/
    );
  });
});
