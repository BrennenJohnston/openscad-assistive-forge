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
  STOREFRONT_AMENITY_VALUES,
  FURNITURE_AMENITY_VALUES,
  FURNITURE_HIGHWAY_VALUES,
  FURNITURE_EMERGENCY_VALUES,
  ATTRACTION_TOURISM_VALUES,
  PLANTER_MAN_MADE_VALUES,
  FLOWERBED_VALUES,
  PICNIC_LEISURE_VALUES,
  LAMP_HIGHWAY_VALUE,
} from '../src/js/game/city-data.js';
import {
  ELEVATION_STEP_M,
  gridPoints,
  sourceFor,
  sampleGrid,
  elevationBlock,
  cacheName,
  readJson,
} from './city-elevation.mjs';
import {
  fetchPoles,
  polesToElements,
  CITY_LIGHT_PROVENANCE,
} from './city-light-poles.mjs';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

/**
 * ★ THE GATE (the D-97 shape, and D-123's second helping of it). An engine
 * that says WARNING and a caller that says "converted, 2 shapes" is how this
 * project shipped a DXF with 31 of 34 entities silently missing. Overpass
 * reports trouble in a `remark` string and still returns HTTP 200 with a
 * partial body; the elevation sampler collects its own. Either one stops the
 * bake, because a bake that half-worked and said nothing is the failure mode
 * that costs a whole round.
 */
function assertNoWarnings(lines, where) {
  // ★ ANY entry is fatal, not only one that says the word. The first version
  // of this filtered for /WARNING:|ERROR:/ - and the elevation sampler's own
  // messages carry neither word, so the gate could not see the thing it was
  // written to catch: a run that lost points to a 503 would have written the
  // extract anyway, which is the exact D-97 shape. A list of problems IS the
  // problem. A unit test asked what the pattern actually matched, and that is
  // the only reason this was found before a bake ran.
  const bad = (lines ?? [])
    .filter(Boolean)
    .map(String)
    .filter((line) => line.trim().length > 0);
  if (bad.length > 0) {
    throw new Error(
      `${where} reported ${bad.length} problem(s), refusing to write a ` +
        `half-baked extract:\n  ${bad.join('\n  ')}`
    );
  }
}
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
// CW-77. The terrain sampler and the pole register are both OFF unless asked
// for: a rebake of the geometry alone must stay a cheap, obvious thing.
const wantElevation = args.elevation !== 'off';
const elevationStepM = Math.round(
  parseFloat(args['elevation-step'] ?? String(ELEVATION_STEP_M))
);
// Never committed (build/ is gitignored) and shared between runs, so a
// re-bake of the same circle costs no requests at all.
const cacheDir = args.cache ?? join(process.cwd(), 'build', 'elevation-cache');
// Seattle City Light's pole register, authorised at G1 (CW-Q76). Opt-in by
// name, because it is a Seattle dataset and nothing else has an equivalent.
const wantPoles = args.poles === 'city-light';
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
const STOREFRONT_AMENITY = STOREFRONT_AMENITY_VALUES.join('|');
// CW-43/CW-44: filtered unions ONLY, the CW-33 lesson — bare node["amenity"]
// timed the public instance out (HTTP 504, measured). kerb and
// tactile_paving are key-presence queries by design: the keys exist only on
// pedestrian nodes, and the plan §1f coverage table was measured exactly so.
const FURNITURE_AMENITY = FURNITURE_AMENITY_VALUES.join('|');
const FURNITURE_HIGHWAY = FURNITURE_HIGHWAY_VALUES.join('|');
const FURNITURE_EMERGENCY = FURNITURE_EMERGENCY_VALUES.join('|');
const ATTRACTION_TOURISM = ATTRACTION_TOURISM_VALUES.join('|');
// CW-55 (CW-Q55): the planting and resting seeds. Filtered unions, like
// everything else here - a planter is a node OR a way, a flowerbed is a way
// under either leisure or landuse, a picnic table is a node.
const PLANTER_MAN_MADE = PLANTER_MAN_MADE_VALUES.join('|');
const FLOWERBED = FLOWERBED_VALUES.join('|');
const PICNIC_LEISURE = PICNIC_LEISURE_VALUES.join('|');

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
  node["amenity"~"^(${STOREFRONT_AMENITY})$"](around:${radiusM},${center.lat},${center.lon});
  node["amenity"~"^(${FURNITURE_AMENITY})$"](around:${radiusM},${center.lat},${center.lon});
  node["highway"~"^(${FURNITURE_HIGHWAY})$"](around:${radiusM},${center.lat},${center.lon});
  node["highway"="${LAMP_HIGHWAY_VALUE}"](around:${radiusM},${center.lat},${center.lon});
  node["emergency"~"^(${FURNITURE_EMERGENCY})$"](around:${radiusM},${center.lat},${center.lon});
  node["kerb"](around:${radiusM},${center.lat},${center.lon});
  node["tactile_paving"](around:${radiusM},${center.lat},${center.lon});
  node["tourism"~"^(${ATTRACTION_TOURISM})$"](around:${radiusM},${center.lat},${center.lon});
  node["attraction"](around:${radiusM},${center.lat},${center.lon});
  node["man_made"~"^(${PLANTER_MAN_MADE})$"](around:${radiusM},${center.lat},${center.lon});
  way["man_made"~"^(${PLANTER_MAN_MADE})$"](around:${radiusM},${center.lat},${center.lon});
  way["leisure"~"^(${FLOWERBED})$"](around:${radiusM},${center.lat},${center.lon});
  way["landuse"~"^(${FLOWERBED})$"](around:${radiusM},${center.lat},${center.lon});
  node["leisure"~"^(${PICNIC_LEISURE})$"](around:${radiusM},${center.lat},${center.lon});
);
out tags geom;`;

async function queryOverpass() {
  const attempts = 4;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const response = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: {
        'User-Agent': USER_AGENT,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `data=${encodeURIComponent(query)}`,
    });
    if (response.ok) return response.json();

    // 429 is the documented rate limit. 502/503/504 are the public instance
    // being busy or giving up on a heavy query, which happens and clears -
    // retrying beats making the query smaller than the data needs to be.
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === attempts) {
      throw new Error(`Overpass returned HTTP ${response.status}`);
    }
    const waitS = response.status === 429 ? 30 : 20 * attempt;
    console.log(
      `Overpass returned HTTP ${response.status} — pausing ${waitS} s ` +
        `(attempt ${attempt} of ${attempts - 1})…`
    );
    await new Promise((r) => setTimeout(r, waitS * 1000));
  }
  throw new Error('Overpass did not answer after retries');
}

console.log(
  `Querying Overpass: ${name} @ ${center.lat},${center.lon} r=${radiusM} m…`
);
const raw = await queryOverpass();
// Overpass answers a query it could not finish with HTTP 200 and a `remark`.
assertNoWarnings([raw.remark], 'Overpass');
const rawElements = Array.isArray(raw.elements) ? raw.elements : [];

let droppedTinyParts = 0;
let droppedUnderground = 0;
const elements = rawElements
  .map((el) => trimOverpassElement(el))
  .filter(Boolean)
  .filter((el) => {
    // CW-77: a building below the street is not part of the street. `layer`
    // below zero or `location=underground` is how the map says so, and the
    // game was extruding those from z = 0 like any other - a car park under a
    // plaza standing up through it. Dropped HERE so the extract is smaller
    // rather than the game filtering on every load, which is where the
    // building:part floor already lives.
    const t = el.tags ?? {};
    if (typeof t.building === 'string' && t.building !== 'no') {
      const layer = Number.parseFloat(t.layer);
      if ((Number.isFinite(layer) && layer < 0) || t.location === 'underground') {
        droppedUnderground++;
        return false;
      }
    }
    return true;
  })
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

// CW-77 (CW-Q76): Seattle City Light's surveyed streetlight register, beside
// OpenStreetMap's own lamps. Negative ids mark every element that is not from
// OSM, so the ODbL statement on this file keeps meaning what it says.
let poleReport = null;
if (wantPoles) {
  console.log('Fetching the Seattle City Light pole register…');
  const { features, pages } = await fetchPoles({
    center,
    radiusM,
    fetchJson: (url) => readJson(url, USER_AGENT),
  });
  const poles = polesToElements(features, center, radiusM);
  elements.push(...poles.elements);
  poleReport = { ...poles, pages, fetched: features.length };
  console.log(
    `  ${features.length} poles over ${pages} page(s) → ${poles.kept} lit ` +
      `(${poles.notLit} carry no streetlight, ${poles.outside} outside the ` +
      `circle by measurement, ${poles.withHeight} with a height)`
  );
}

// CW-77 (CW-Q77): the terrain, from a national 1 m DEM point service.
let elevation = null;
let elevationReport = null;
if (wantElevation) {
  const source = sourceFor(center.lat, center.lon);
  const grid = gridPoints(center, radiusM, elevationStepM);
  const inCircle = grid.points.filter(Boolean).length;
  console.log(
    `Sampling terrain: ${grid.cols}x${grid.rows} grid at ${elevationStepM} m, ` +
      `${inCircle} points inside the circle, source ${source}…`
  );
  const t0 = Date.now();
  const sampled = await sampleGrid({
    grid,
    source,
    cacheDir,
    cacheFile: cacheName(name, center, radiusM, elevationStepM),
    fetchJson: (url) => readJson(url, USER_AGENT),
    onProgress: (done, total) =>
      console.log(`  …${done} of ${total} sampled`),
  });
  assertNoWarnings(sampled.warnings, 'the elevation sampler');
  elevation = elevationBlock({ grid, source, samples: sampled.samples });
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  elevationReport = { ...sampled, inCircle, secs, source, grid };
  console.log(
    `  ${sampled.filled} of ${inCircle} answered ` +
      `(${sampled.holes} holes, ${sampled.fromCache} already cached, ` +
      `${sampled.requested} requested) in ${secs} s`
  );
}

const extract = {
  // CW-77: v2 is ADDITIVE. Everything v1 carried is still here and in the
  // same shape; a v1 reader ignores `elevation` and the street-lamp nodes and
  // gets exactly the city it always got.
  format: 'ascii-city-extract@2',
  name,
  center,
  radiusM,
  generated: new Date().toISOString().slice(0, 10),
  source: 'OpenStreetMap via Overpass API',
  attribution: 'Map data © OpenStreetMap contributors',
  license: 'ODbL 1.0 — https://www.openstreetmap.org/copyright',
  ...(poleReport ? { poleSource: CITY_LIGHT_PROVENANCE } : {}),
  ...(elevation ? { elevation } : {}),
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
// The per-city table CW-33's record is built from: everything a reviewer
// would otherwise have to re-derive by reading the JSON.
// CW-55: the same courtesy for the planting seeds - a reviewer should not
// have to read the JSON to learn what a rebake actually brought back.
const plantingLine = Object.entries(model.stats.plantingByKind)
  .sort((a, b) => b[1] - a[1])
  .map(([kind, n]) => `${kind} ${n}`)
  .join(', ');
const furnitureLine = Object.entries(model.stats.furnitureByKind)
  .map(([kind, count]) => `${kind} ${count}`)
  .join(', ');
console.log(
  `Wrote ${outPath}\n` +
    `  ${sizeKb} KB · ${rawElements.length} raw elements → ${elements.length} kept` +
    ` (${droppedTinyParts} parts under ${MIN_PART_AREA_M2} m² dropped)\n` +
    `  parsed: ${model.stats.buildingCount} buildings, ${model.stats.roadCount} roads,` +
    ` ${model.stats.treeCount} trees, ${model.stats.partCount} parts` +
    ` (${model.stats.orphanParts} orphaned)\n` +
    `  CW-33: ${model.stats.greenCount} greens, ${model.stats.sidewalkCount} sidewalks,` +
    ` ${model.stats.surfacedRoadCount}/${model.stats.roadCount} roads with a surface tag\n` +
    `  CW-43: ${furnitureLine || 'no furniture'};` +
    ` ${model.stats.wayfindingCount} wayfinding nodes;` +
    ` ${model.stats.attractionCount} named attractions\n` +
    `  CW-55: ${plantingLine || 'no plantings'};` +
    ` ${model.stats.picnicTableCount} picnic tables;` +
    ` ${model.stats.leafTypedTreeCount} of ${model.stats.treeCount} trees have a leaf_type\n` +
    `  CW-77: ${model.stats.lampNodeCount} mapped lamps ` +
    `(${JSON.stringify(model.stats.lampNodesByOperator)});` +
    ` ${droppedUnderground} underground buildings dropped` +
    (model.elevation
      ? `; terrain ${model.elevation.cols}x${model.elevation.rows} @ ` +
        `${model.elevation.stepM} m, ` +
        `${(model.elevation.coverage * 100).toFixed(1)} % covered, ` +
        `${model.elevation.minM.toFixed(1)}..${model.elevation.maxM.toFixed(1)} m`
      : '; no terrain') +
    '\n' +
    `  dropped ${model.stats.droppedRings} rings, ${model.stats.droppedElements} elements`
);
if (json.length > SIZE_WARN_BYTES) {
  console.warn(
    `WARNING: extract exceeds ${Math.round(SIZE_WARN_BYTES / 1024)} KB — consider a smaller --radius`
  );
}
