/**
 * A dropped OpenStreetMap export for the Tactile Map Designer: an `.osm`
 * XML file (what openstreetmap.org's Export gives) or a `.geojson` file
 * becomes the same elements an Overpass pull gives (`{ type, id, tags,
 * geometry }` for a way, `{ type, id, lat, lon, tags }` for a node), trimmed
 * to the tags a map reads, so the draft is built one way whatever the
 * source. The file never leaves the device.
 *
 * Errors carry `code: 'not-osm'` when the text is neither.
 *
 * `DOMParser` is the one DOM piece (the browser's XML reader; jsdom's in
 * tests): this module is not for a worker.
 *
 * @license GPL-3.0-or-later
 */
import { trimElement } from './osm-geometry.js';

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

const num = (s) => {
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
};

/** The OSM XML: nodes first into a table, then ways with their points. */
function fromOsmXml(text, name) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror') || !doc.documentElement) {
    throw fail('not-osm', `${name} is not readable as OpenStreetMap XML.`);
  }
  if (doc.documentElement.tagName.toLowerCase() !== 'osm') {
    throw fail('not-osm', `${name} is XML, but not an OpenStreetMap export.`);
  }
  const tagsOf = (el) => {
    const tags = {};
    for (const t of el.children) {
      if (t.tagName.toLowerCase() === 'tag') {
        tags[t.getAttribute('k')] = t.getAttribute('v');
      }
    }
    return tags;
  };
  const places = new Map();
  const nodes = [];
  for (const n of doc.documentElement.children) {
    if (n.tagName.toLowerCase() !== 'node') continue;
    const id = n.getAttribute('id');
    const lat = num(n.getAttribute('lat'));
    const lon = num(n.getAttribute('lon'));
    if (lat === null || lon === null) continue;
    places.set(id, { lat, lon });
    const tags = tagsOf(n);
    if (Object.keys(tags).length > 0) {
      nodes.push({ type: 'node', id: num(id) ?? id, lat, lon, tags });
    }
  }
  const ways = [];
  for (const w of doc.documentElement.children) {
    if (w.tagName.toLowerCase() !== 'way') continue;
    const geometry = [];
    for (const nd of w.children) {
      if (nd.tagName.toLowerCase() !== 'nd') continue;
      const p = places.get(nd.getAttribute('ref'));
      if (p) geometry.push({ lat: p.lat, lon: p.lon });
    }
    const id = w.getAttribute('id');
    ways.push({ type: 'way', id: num(id) ?? id, tags: tagsOf(w), geometry });
  }
  return [...ways, ...nodes];
}

/** GeoJSON: a Polygon's outer ring and a LineString as ways, a Point as a node. */
function fromGeoJson(json, name) {
  const features =
    json.type === 'FeatureCollection' && Array.isArray(json.features)
      ? json.features
      : json.type === 'Feature'
        ? [json]
        : json.type && json.coordinates
          ? [{ type: 'Feature', geometry: json, properties: {} }]
          : null;
  if (!features) {
    throw fail('not-osm', `${name} is JSON, but not GeoJSON.`);
  }
  const toPoints = (coords) =>
    coords
      .map((c) =>
        Array.isArray(c) ? { lon: num(c[0]), lat: num(c[1]) } : null
      )
      .filter((p) => p && p.lat !== null && p.lon !== null);
  const out = [];
  features.forEach((f, i) => {
    const g = f?.geometry;
    if (!g || typeof g !== 'object') return;
    const tags =
      f.properties && typeof f.properties === 'object' ? f.properties : {};
    const id = f.id ?? `${name}#${i + 1}`;
    if (g.type === 'Point' && Array.isArray(g.coordinates)) {
      const [p] = toPoints([g.coordinates]);
      if (p) out.push({ type: 'node', id, lat: p.lat, lon: p.lon, tags });
    } else if (g.type === 'LineString' && Array.isArray(g.coordinates)) {
      out.push({ type: 'way', id, tags, geometry: toPoints(g.coordinates) });
    } else if (
      g.type === 'Polygon' &&
      Array.isArray(g.coordinates) &&
      Array.isArray(g.coordinates[0])
    ) {
      out.push({
        type: 'way',
        id,
        tags,
        geometry: toPoints(g.coordinates[0]),
      });
    } else if (g.type === 'MultiPolygon' && Array.isArray(g.coordinates)) {
      g.coordinates.forEach((poly, k) => {
        if (Array.isArray(poly?.[0])) {
          out.push({
            type: 'way',
            id: `${id}/${k + 1}`,
            tags,
            geometry: toPoints(poly[0]),
          });
        }
      });
    } else if (g.type === 'MultiLineString' && Array.isArray(g.coordinates)) {
      g.coordinates.forEach((line, k) => {
        out.push({
          type: 'way',
          id: `${id}/${k + 1}`,
          tags,
          geometry: toPoints(line),
        });
      });
    }
  });
  return out;
}

/**
 * The elements of a dropped export, trimmed to what a map reads.
 *
 * @param {string} text - the file's text
 * @param {string} [name] - the file's name, for the sentences
 * @returns {object[]}
 */
export function elementsFromText(text, name = 'the file') {
  const s = String(text ?? '').trim();
  if (!s) throw fail('not-osm', `${name} is empty.`);
  let raw;
  if (s.startsWith('{') || s.startsWith('[')) {
    let json;
    try {
      json = JSON.parse(s);
    } catch {
      throw fail('not-osm', `${name} is not readable as JSON.`);
    }
    raw = fromGeoJson(json, name);
  } else if (s.startsWith('<')) {
    raw = fromOsmXml(s, name);
  } else {
    throw fail(
      'not-osm',
      `${name} is not an OpenStreetMap export or a GeoJSON file.`
    );
  }
  return raw.map(trimElement).filter(Boolean);
}

/**
 * The middle of the box around every point of the elements, or null.
 *
 * @param {object[]} elements
 * @returns {{lat: number, lon: number}|null}
 */
export function centerOf(elements) {
  let minLat = Infinity;
  let minLon = Infinity;
  let maxLat = -Infinity;
  let maxLon = -Infinity;
  const take = (lat, lon) => {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
  };
  for (const el of elements || []) {
    if (!el) continue;
    if (el.type === 'node') take(el.lat, el.lon);
    else for (const p of el.geometry || []) take(p.lat, p.lon);
  }
  if (!Number.isFinite(minLat)) return null;
  return { lat: (minLat + maxLat) / 2, lon: (minLon + maxLon) / 2 };
}
