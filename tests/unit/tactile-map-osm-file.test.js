/**
 * A dropped OpenStreetMap export for the Tactile Map Designer: an `.osm`
 * XML file or a `.geojson` file becomes the same elements an Overpass pull
 * gives, so the draft is built one way whatever the source.
 *
 * @license GPL-3.0-or-later
 */
import { describe, it, expect } from 'vitest';
import {
  elementsFromText,
  centerOf,
} from '../../src/js/tactile-map/osm-file.js';

/** Two sidewalks of four nodes each (one node shared), three tagged nodes. */
const OSM = `<?xml version="1.0" encoding="UTF-8"?>
<osm version="0.6" generator="CGImap 0.9.4">
  <bounds minlat="47.6060" minlon="-122.3380" maxlat="47.6110" maxlon="-122.3330"/>
  <node id="1" lat="47.6070" lon="-122.3370" version="1"/>
  <node id="2" lat="47.6075" lon="-122.3365" version="1"/>
  <node id="3" lat="47.6080" lon="-122.3360" version="1"/>
  <node id="4" lat="47.6085" lon="-122.3355" version="1"/>
  <node id="5" lat="47.6090" lon="-122.3350" version="1"/>
  <node id="6" lat="47.6095" lon="-122.3345" version="1"/>
  <node id="7" lat="47.6100" lon="-122.3340" version="1"/>
  <node id="11" lat="47.6072" lon="-122.3368" version="1">
    <tag k="highway" v="crossing"/>
    <tag k="crossing" v="marked"/>
    <tag k="source" v="survey"/>
  </node>
  <node id="12" lat="47.6082" lon="-122.3358" version="1">
    <tag k="entrance" v="main"/>
  </node>
  <node id="13" lat="47.6092" lon="-122.3348" version="1">
    <tag k="highway" v="bus_stop"/>
    <tag k="name" v="4th Ave &amp; Pike St"/>
  </node>
  <node id="14" lat="47.6099" lon="-122.3341" version="1">
    <tag k="note" v="nothing a map reads"/>
  </node>
  <way id="100" version="3">
    <nd ref="1"/><nd ref="2"/><nd ref="3"/><nd ref="4"/>
    <tag k="highway" v="footway"/>
    <tag k="footway" v="sidewalk"/>
    <tag k="created_by" v="JOSM"/>
  </way>
  <way id="101" version="2">
    <nd ref="4"/><nd ref="5"/><nd ref="6"/><nd ref="7"/>
    <tag k="highway" v="footway"/>
    <tag k="footway" v="sidewalk"/>
  </way>
  <way id="102" version="1">
    <nd ref="1"/><nd ref="7"/>
    <tag k="note" v="a way nobody classes"/>
  </way>
</osm>`;

const GEOJSON = JSON.stringify({
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      id: 'way/200',
      properties: { building: 'yes', name: 'Station' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-122.337, 47.607],
            [-122.336, 47.607],
            [-122.336, 47.608],
            [-122.337, 47.608],
            [-122.337, 47.607],
          ],
          [
            [-122.3368, 47.6072],
            [-122.3362, 47.6072],
            [-122.3362, 47.6078],
            [-122.3368, 47.6072],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      id: 'way/201',
      properties: { highway: 'footway', footway: 'sidewalk' },
      geometry: {
        type: 'LineString',
        coordinates: [
          [-122.337, 47.609],
          [-122.336, 47.6095],
          [-122.335, 47.61],
        ],
      },
    },
    {
      type: 'Feature',
      id: 'node/202',
      properties: { entrance: 'yes' },
      geometry: { type: 'Point', coordinates: [-122.3365, 47.608] },
    },
    {
      type: 'Feature',
      properties: { amenity: 'bench' },
      geometry: { type: 'Point', coordinates: [-122.335, 47.6085] },
    },
    {
      type: 'Feature',
      properties: { note: 'nothing a map reads' },
      geometry: { type: 'Point', coordinates: [-122.334, 47.609] },
    },
  ],
});

describe('elementsFromText: an .osm export', () => {
  it('gives the ways with their nodes resolved in order and the tagged nodes, trimmed', () => {
    const elements = elementsFromText(OSM, 'downtown.osm');
    const ways = elements.filter((e) => e.type === 'way');
    const nodes = elements.filter((e) => e.type === 'node');
    expect(ways.map((w) => w.id)).toEqual([100, 101]);
    expect(ways[0].geometry).toEqual([
      { lat: 47.607, lon: -122.337 },
      { lat: 47.6075, lon: -122.3365 },
      { lat: 47.608, lon: -122.336 },
      { lat: 47.6085, lon: -122.3355 },
    ]);
    expect(ways[0].tags).toEqual({ highway: 'footway', footway: 'sidewalk' });
    expect(nodes.map((n) => n.id)).toEqual([11, 12, 13]);
    expect(nodes[0]).toEqual({
      type: 'node',
      id: 11,
      lat: 47.6072,
      lon: -122.3368,
      tags: { highway: 'crossing', crossing: 'marked' },
    });
    expect(nodes[2].tags.name).toBe('4th Ave & Pike St');
  });

  it('reads a way whose node comes after it in the file', () => {
    const text = OSM.replace(
      '<node id="7" lat="47.6100" lon="-122.3340" version="1"/>',
      ''
    ).replace(
      '</osm>',
      '<node id="7" lat="47.6100" lon="-122.3340" version="1"/></osm>'
    );
    const way = elementsFromText(text, 'late.osm').find((e) => e.id === 101);
    expect(way.geometry).toHaveLength(4);
    expect(way.geometry[3]).toEqual({ lat: 47.61, lon: -122.334 });
  });
});

describe('elementsFromText: a .geojson file', () => {
  it("gives a polygon's outer ring as a way, a line as a way and a point as a node, with the properties as tags", () => {
    const elements = elementsFromText(GEOJSON, 'downtown.geojson');
    expect(elements).toHaveLength(4);
    const [building, sidewalk, entrance, bench] = elements;
    expect(building.type).toBe('way');
    expect(building.geometry).toHaveLength(5);
    expect(building.geometry[0]).toEqual({ lat: 47.607, lon: -122.337 });
    expect(building.tags).toEqual({ building: 'yes', name: 'Station' });
    expect(sidewalk).toMatchObject({
      type: 'way',
      tags: { highway: 'footway', footway: 'sidewalk' },
    });
    expect(sidewalk.geometry).toHaveLength(3);
    expect(entrance).toEqual({
      type: 'node',
      id: 'node/202',
      lat: 47.608,
      lon: -122.3365,
      tags: { entrance: 'yes' },
    });
    expect(bench.type).toBe('node');
    expect(bench.tags).toEqual({ amenity: 'bench' });
    expect(bench.id).toBeTruthy();
  });

  it('reads a bare Feature and a bare geometry too', () => {
    const one = elementsFromText(
      JSON.stringify({
        type: 'Feature',
        properties: { shop: 'bakery' },
        geometry: { type: 'Point', coordinates: [-122.33, 47.6] },
      }),
      'one.geojson'
    );
    expect(one).toHaveLength(1);
    expect(one[0]).toMatchObject({ type: 'node', lat: 47.6, lon: -122.33 });
  });
});

describe('elementsFromText: anything else', () => {
  it('refuses plain text, broken XML, and JSON that is not GeoJSON', () => {
    for (const [text, name] of [
      ['hello', 'notes.txt'],
      ['<osm><node id="1" lat="1"', 'broken.osm'],
      ['{"a": 1}', 'thing.json'],
      ['', 'empty.osm'],
    ]) {
      expect(() => elementsFromText(text, name)).toThrow(
        expect.objectContaining({ code: 'not-osm' })
      );
    }
  });
});

describe('centerOf', () => {
  it('is the middle of the box around every point', () => {
    // The kept elements reach from node 1 (47.607, -122.337) to node 7
    // (47.61, -122.334), the end of the second sidewalk; the note-only node
    // beyond them was dropped by the trimmer and does not count.
    const elements = elementsFromText(OSM, 'downtown.osm');
    const c = centerOf(elements);
    expect(c.lat).toBeCloseTo((47.607 + 47.61) / 2, 6);
    expect(c.lon).toBeCloseTo((-122.337 + -122.334) / 2, 6);
  });

  it('is null with nothing to center on', () => {
    expect(centerOf([])).toBeNull();
  });
});

describe('a large export', () => {
  // jsdom's XML reader is the slow part here (about 2.5 s for this file on
  // the development machine; a browser's DOMParser reads the same text in a
  // fraction of that, measured in the phase's record). The floor catches a
  // reader that has gone quadratic, not the browser's speed.
  it('parses 5,000 nodes and 500 ways, and says how long it took', () => {
    const nodes = [];
    for (let i = 1; i <= 5000; i++) {
      nodes.push(
        `<node id="${i}" lat="${(47.6 + i * 0.00001).toFixed(7)}" lon="${(-122.33 + i * 0.00001).toFixed(7)}" version="1"/>`
      );
    }
    const ways = [];
    for (let w = 0; w < 500; w++) {
      const refs = [];
      for (let k = 0; k < 10; k++) refs.push(`<nd ref="${w * 10 + k + 1}"/>`);
      ways.push(
        `<way id="${10000 + w}" version="1">${refs.join('')}<tag k="highway" v="footway"/><tag k="footway" v="sidewalk"/></way>`
      );
    }
    const text = `<?xml version="1.0"?><osm version="0.6">${nodes.join('')}${ways.join('')}</osm>`;
    const t0 = performance.now();
    const elements = elementsFromText(text, 'big.osm');
    const ms = performance.now() - t0;
    console.log(
      `large export: ${(text.length / 1024).toFixed(0)} KB, ${elements.length} elements in ${ms.toFixed(0)} ms`
    );
    expect(elements).toHaveLength(500);
    expect(elements[499].geometry).toHaveLength(10);
    expect(ms).toBeLessThan(10000);
  });
});
