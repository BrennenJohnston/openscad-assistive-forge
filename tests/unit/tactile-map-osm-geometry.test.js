/**
 * The OpenStreetMap geometry helpers of the Tactile Map Designer: a point
 * on the earth to meters about a center, an Overpass element trimmed to the
 * tags a map reads, meters to millimeters at the map's scale.
 *
 * @license GPL-3.0-or-later
 */
import { describe, it, expect } from 'vitest';
import {
  projectLatLon,
  trimElement,
  mmPerMeter,
  toMm,
  KEPT_TAGS,
} from '../../src/js/tactile-map/osm-geometry.js';

const CENTER = { lat: 47.6, lon: -122.33 };

describe('projectLatLon', () => {
  it('puts a point a thousandth of a degree north and east at 110.5 m north and 75.1 m east of a center at 47.6 degrees', () => {
    const [east, north] = projectLatLon(47.601, -122.329, CENTER);
    expect(Math.abs(east - 75.1)).toBeLessThan(0.5);
    expect(Math.abs(north - 110.5)).toBeLessThan(0.5);
  });

  it('puts the center at the origin', () => {
    expect(projectLatLon(CENTER.lat, CENTER.lon, CENTER)).toEqual([0, 0]);
  });
});

describe('trimElement', () => {
  it('keeps the tags a map reads and drops the rest', () => {
    const el = trimElement({
      type: 'way',
      id: 1,
      tags: {
        highway: 'footway',
        footway: 'sidewalk',
        incline: '-6%',
        name: 'Pike Street',
        source: 'survey',
        created_by: 'JOSM',
      },
      geometry: [
        { lat: 47.6, lon: -122.33 },
        { lat: 47.601, lon: -122.33 },
      ],
    });
    expect(el.type).toBe('way');
    expect(el.id).toBe(1);
    expect(el.tags).toEqual({
      highway: 'footway',
      footway: 'sidewalk',
      incline: '-6%',
      name: 'Pike Street',
    });
    expect(el.geometry).toHaveLength(2);
    expect(KEPT_TAGS).toContain('footway');
    expect(KEPT_TAGS).not.toContain('source');
  });

  it('keeps a node with its place', () => {
    const el = trimElement({
      type: 'node',
      id: 7,
      lat: 47.6,
      lon: -122.33,
      tags: { entrance: 'main', level: '0' },
    });
    expect(el).toEqual({
      type: 'node',
      id: 7,
      lat: 47.6,
      lon: -122.33,
      tags: { entrance: 'main', level: '0' },
    });
  });

  it('answers null for an element with no tag a map reads', () => {
    expect(
      trimElement({
        type: 'way',
        id: 2,
        tags: { source: 'survey', note: 'nothing here' },
        geometry: [{ lat: 1, lon: 1 }],
      })
    ).toBeNull();
  });

  it('answers null for a way without geometry and a node without a place', () => {
    expect(
      trimElement({ type: 'way', id: 3, tags: { highway: 'footway' } })
    ).toBeNull();
    expect(
      trimElement({ type: 'node', id: 4, tags: { entrance: 'yes' } })
    ).toBeNull();
  });
});

describe('the map scale', () => {
  it('mmPerMeter: a 480 mm map that reaches 250 m each way is 0.96 mm per meter', () => {
    expect(mmPerMeter(480, 250)).toBeCloseTo(0.96, 6);
  });

  it('toMm: the center lands in the middle of the map and north runs up the page', () => {
    const size = { w: 480, h: 360 };
    expect(toMm([0, 0], size, 0.96)).toEqual([240, 180]);
    const [x, y] = toMm([100, 100], size, 0.96);
    expect(x).toBeCloseTo(336, 6);
    expect(y).toBeCloseTo(84, 6);
  });
});
