/**
 * Bake a bundled city extract for the ASCII City Walk game (CW-2).
 *
 * Dev-lane script (never runs in the browser): queries the public Overpass
 * API for building footprints and roads around a center point, trims the
 * response to the tags/geometry the game uses, stamps the OpenStreetMap
 * attribution required by ODbL, and writes a self-contained extract JSON
 * into public/examples/ascii-city/.
 *
 * Usage:
 *   node scripts/bake-city-extract.mjs --name seattle --center 47.6089,-122.3357 [--radius 500]
 *
 * Rerunning refreshes the extract against current OSM data; output is stable
 * for identical upstream data on the same day (the `generated` stamp has day
 * granularity).
 *
 * Map data © OpenStreetMap contributors, ODbL 1.0
 * https://www.openstreetmap.org/copyright
 *
 * @license GPL-3.0-or-later
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  trimOverpassElement,
  parseCityExtract,
  GREEN_LEISURE_VALUES,
  GREEN_LANDUSE_VALUES,
  MIN_PART_AREA_M2,
  ringAreaM2,
} from '../src/js/game/city-data.js';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const USER_AGENT =
  'openscad-assistive-forge bake-city-extract (https://github.com/BrennenJohnston/openscad-assistive-forge)';
// CW-Q9 doubled each city's AREA (bake radius 500 -> 707 m), which roughly
// doubles every extract. The warning is advisory - it marks a bake that has
// outgrown the deliberate size, not one that is broken.
const SIZE_WARN_BYTES = 1600 * 1024;

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key.startsWith('--')) {
      args[key.slice(2)] = argv[i + 1];
      i++;
    }
  }
  return args;
}

function usage(message) {
  if (message) console.error(`ERROR: ${message}\n`);
  console.error(
    'Usage: node scripts/bake-city-extract.mjs --name <slug> --center <lat,lon> [--radius <m>] [--out <dir>]'
  );
  process.exit(1);
}

const args = parseArgs(process.argv.slice(2));
const name = args.name;
if (!name || !/^[a-z0-9-]+$/.test(name)) {
  usage('--name is required (lowercase slug, e.g. "seattle")');
}
const centerParts = (args.center ?? '').split(',').map((s) => parseFloat(s));
if (centerParts.length !== 2 || centerParts.some((n) => !Number.isFinite(n))) {
  usage('--center is required as "lat,lon"');
}
const center = { lat: centerParts[0], lon: centerParts[1] };
const radiusM = Math.round(parseFloat(args.radius ?? '500'));
if (!Number.isFinite(radiusM) || radiusM < 50 || radiusM > 2000) {
  usage('--radius must be between 50 and 2000 meters');
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const outDir =
  args.out ?? join(scriptDir, '..', 'public', 'examples', 'ascii-city');

// CW-33: greenspace comes from a NAMED set of leisure and landuse values, not
// from every polygon carrying those keys. A downtown is wall to wall
// landuse=commercial/retail/industrial, and fetching those would multiply the
// extract for ground that is already drawn as ground. This is the list the
// plan's coverage table was measured against (plan section 1d): every one of
// the four cities has some, from 20 polygons in Seattle to 249 in Denver.
//
// Ways only this round. Some large parks are mapped as multipolygon RELATIONS
// and will be missed; that is a recorded future slice rather than an
// oversight, and the per-city counts in the release record say what it costs.
const GREEN_LEISURE = GREEN_LEISURE_VALUES.join('|');
const GREEN_LANDUSE = GREEN_LANDUSE_VALUES.join('|');

const query = `[out:json][timeout:90];
(
  way["building"](around:${radiusM},${center.lat},${center.lon});
  relation["building"]["type"="multipolygon"](around:${radiusM},${center.lat},${center.lon});
  way["building:part"](around:${radiusM},${center.lat},${center.lon});
  way["highway"](around:${radiusM},${center.lat},${center.lon});
  way["leisure"~"^(${GREEN_LEISURE})$"](around:${radiusM},${center.lat},${center.lon});
  way["landuse"~"^(${GREEN_LANDUSE})$"](around:${radiusM},${center.lat},${center.lon});
  node["natural"="tree"](around:${radiusM},${center.lat},${center.lon});
  node["shop"](around:${radiusM},${center.lat},${center.lon});
  node["amenity"](around:${radiusM},${center.lat},${center.lon});
);
out tags geom;`;

async function queryOverpass() {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const response = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: {
        'User-Agent': USER_AGENT,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `data=${encodeURIComponent(query)}`,
    });
    if (response.status === 429 && attempt === 1) {
      console.log('Rate limited (429) — pausing 30 s per Overpass policy…');
      await new Promise((r) => setTimeout(r, 30000));
      continue;
    }
    if (!response.ok) {
      throw new Error(`Overpass returned HTTP ${response.status}`);
    }
    return response.json();
  }
  throw new Error('Overpass rate limit persisted after retry');
}

console.log(
  `Querying Overpass: ${name} @ ${center.lat},${center.lon} r=${radiusM} m…`
);
const raw = await queryOverpass();
const rawElements = Array.isArray(raw.elements) ? raw.elements : [];

let droppedTinyParts = 0;
const elements = rawElements
  .map((el) => trimOverpassElement(el))
  .filter(Boolean)
  .filter((el) => {
    // CW-Q31: the part-area floor, applied HERE so the extract itself gets
    // smaller rather than the game filtering on every load. Denver is mapped
    // with thousands of building:part slivers - ledges and setbacks a few
    // centimetres across that no character cell could show - and they are
    // what kept it from having parts and roofs at all.
    if (el.type !== 'way' || !el.tags?.['building:part']) return true;
    if (ringAreaM2(el.geometry, center) >= MIN_PART_AREA_M2) return true;
    droppedTinyParts++;
    return false;
  });

const extract = {
  format: 'ascii-city-extract@1',
  name,
  center,
  radiusM,
  generated: new Date().toISOString().slice(0, 10),
  source: 'OpenStreetMap via Overpass API',
  attribution: 'Map data © OpenStreetMap contributors',
  license: 'ODbL 1.0 — https://www.openstreetmap.org/copyright',
  elements,
};

// Self-check: the game parser must accept what we just baked.
const model = parseCityExtract(extract);
if (model.stats.buildingCount === 0) {
  throw new Error(
    'Baked extract parses to zero buildings — wrong center, or empty area?'
  );
}

mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, `${name}.json`);
const json = JSON.stringify(extract);
writeFileSync(outPath, json);

const sizeKb = Math.round(json.length / 1024);
console.log(
  `Wrote ${outPath}\n` +
    `  ${sizeKb} KB · ${rawElements.length} raw elements → ${elements.length} kept\n` +
    `  parsed: ${model.stats.buildingCount} buildings, ${model.stats.roadCount} roads,` +
    ` ${model.stats.treeCount} trees` +
    ` (dropped ${model.stats.droppedRings} rings, ${model.stats.droppedElements} elements)`
);
if (json.length > SIZE_WARN_BYTES) {
  console.warn(
    `WARNING: extract exceeds ${Math.round(SIZE_WARN_BYTES / 1024)} KB — consider a smaller --radius`
  );
}
