/**
 * Bake-time terrain sampling for the ASCII City Walk extracts (CW-77).
 *
 * Dev-lane only: this never runs in the browser. It samples a national 1 m
 * digital elevation model on a regular grid clipped to a city's circle and
 * hands back the block `ascii-city-extract@2` carries, so CW-79 can build a
 * heightfield from data rather than from a guess.
 *
 * WHY A GRID AND NOT THE VERTICES. The obvious thing is to sample every road
 * vertex and building centroid, which is what the plan first proposed. A grid
 * is better for the thing that consumes it: a walker's height has to be
 * defined EVERYWHERE, including in the middle of a plaza and inside a block,
 * and a scatter of vertices leaves those to an interpolation nobody measured.
 * A grid is also cacheable and resumable by construction - its points do not
 * move when the map data does.
 *
 * WHY THE POINT SERVICES AND NOT A GEOTIFF (CW-Q77, owner-signed): no new
 * dependency, and the services are fast enough if you ask them properly.
 *
 * ★ A BURST IS NOT A THROUGHPUT. A 40-sample burst against USGS EPQS measured
 * 21 samples/s at concurrency 8 and 41/s at 16, and both numbers are useless:
 * they are the connection pool warming up. Two hundred sustained samples on
 * the same machine, the same minute, measure 1.2/s at concurrency 4, 1.8/s at
 * 8 and 4.3/s at 16 - the service answers every request with HTTP 200 and is
 * simply SLOW and variable (latency p50 2.0-3.6 s, p95 up to 11.5 s, worst
 * 24.4 s). Nothing is rate-limited; 600 sustained requests drew zero non-200
 * responses. The grid step and the concurrency below are both chosen against
 * the sustained number, not the burst.
 *
 * SOURCES AND LICENCES (plan §1.6, fetched 2026-08-28):
 *   - USGS 3DEP via the EPQS point service, for the three US cities. The
 *     National Map: "free and in the public domain. There are no
 *     restrictions." Requested credit is written into every extract.
 *   - NRCan CDEM/HRDEM altitude service, for Burnaby, under the Open
 *     Government Licence - Canada.
 *
 * GOOGLE SURFACES ARE PROHIBITED as a source for anything that enters this
 * repository (plan §8.3). Nothing here touches one.
 *
 * @license GPL-3.0-or-later
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * The grid step, in metres.
 *
 * The DEM under it is 1 m, so this is a choice about how much the game needs
 * against what a bake can afford. Seattle's circle spans 103 m of elevation,
 * its steepest measured grid-neighbour slope is 9 % and real street grades
 * there reach 15-19 %: at 30 m even a 19 % grade is 5.7 m between samples,
 * which a walker reads as a smooth hill, and a downtown block is 80 m, so
 * every block still gets two or three samples across it.
 *
 * The cost is what fixes it. At the measured 4.3 samples/s, Seattle's circle
 * is 5,913 points at 30 m (about 23 minutes) against 13,273 at 20 m (about
 * 51 minutes), for a difference no 3x6 pixel character cell can show. Every
 * answer is cached on disk, so only the first bake pays.
 */
export const ELEVATION_STEP_M = 30;

/** Metres per degree, at the latitudes these cities sit at. */
const M_PER_DEG_LAT = 110540;
const M_PER_DEG_LON = 111320;

export const ELEVATION_SOURCES = {
  usgs: {
    id: 'USGS 3DEP (EPQS point service)',
    license:
      'Public domain. The National Map: "free and in the public domain. ' +
      'There are no restrictions."',
    attribution:
      'Map services and data available from U.S. Geological Survey, ' +
      'National Geospatial Program',
  },
  nrcan: {
    id: 'Natural Resources Canada CDEM/HRDEM (altitude service)',
    license: 'Open Government Licence - Canada',
    attribution:
      'Contains information licensed under the Open Government Licence - ' +
      'Canada',
  },
};

/** Which service covers a city, by the country its circle sits in. */
export function sourceFor(lat, lon) {
  // The four baked circles are Seattle, Denver, Albuquerque and Burnaby. The
  // only non-US one is Burnaby, and 49 N is the border.
  return lat >= 49 && lon < -110 ? 'nrcan' : 'usgs';
}

/**
 * The sample points of a grid clipped to a circle, in row-major order.
 *
 * The grid is anchored on the centre so that two bakes of the same city with
 * the same step ask for the SAME points and share a cache. Points outside the
 * circle are still emitted, as nulls, so the grid stays rectangular - a
 * heightfield wants a rectangle, and the corners are simply never walked.
 *
 * @param {{lat:number, lon:number}} center
 * @param {number} radiusM
 * @param {number} stepM
 * @returns {{originX:number, originY:number, stepM:number, cols:number, rows:number, points:Array<{lat:number, lon:number}|null>}}
 */
export function gridPoints(center, radiusM, stepM = ELEVATION_STEP_M) {
  const half = Math.ceil(radiusM / stepM);
  const cols = half * 2 + 1;
  const rows = cols;
  const originX = -half * stepM;
  const originY = -half * stepM;
  const cosLat = Math.cos((center.lat * Math.PI) / 180);
  const points = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = originX + c * stepM;
      const y = originY + r * stepM;
      if (Math.hypot(x, y) > radiusM) {
        points.push(null);
        continue;
      }
      points.push({
        lat: center.lat + y / M_PER_DEG_LAT,
        lon: center.lon + x / (M_PER_DEG_LON * cosLat),
      });
    }
  }
  return { originX, originY, stepM, cols, rows, points };
}

/** The URL each service answers a point with. */
export function sampleUrl(source, p) {
  if (source === 'nrcan') {
    return (
      'https://geogratis.gc.ca/services/elevation/cdem/altitude' +
      `?lat=${p.lat.toFixed(7)}&lon=${p.lon.toFixed(7)}`
    );
  }
  return (
    'https://epqs.nationalmap.gov/v1/json' +
    `?x=${p.lon.toFixed(7)}&y=${p.lat.toFixed(7)}&units=Meters&wkid=4326`
  );
}

/**
 * The metres in one service answer, or null where it had no data.
 *
 * EPQS answers a point outside its coverage with a large negative sentinel
 * rather than an error, so that is filtered here and not left for a
 * heightfield to discover as a cliff.
 */
export function readSample(source, body) {
  if (source === 'nrcan') {
    const v = Number(body?.altitude);
    return Number.isFinite(v) ? v : null;
  }
  const v = Number(body?.value);
  if (!Number.isFinite(v)) return null;
  return v <= -1000 ? null : v;
}

/**
 * One JSON fetch, with the failure the DEM service actually produces.
 *
 * ★ HTTP 200 IS NOT AN ANSWER. USGS EPQS returns 200 with an EMPTY BODY often
 * enough to matter - once in the first 2,000 points of a Seattle bake - and
 * `await r.json()` then throws out of the worker, out of Promise.all and out
 * of the whole script, killing a bake that had been running for twenty
 * minutes. An unreadable body is a transient service failure like any other,
 * so it is reported as one and retried, with the real HTTP status kept in the
 * reason so a warning line never lies about what happened.
 */
export async function readJson(url, userAgent = '', doFetch = fetch) {
  let r;
  try {
    r = await doFetch(url, { headers: { 'User-Agent': userAgent } });
  } catch (err) {
    return { ok: false, status: 599, reason: `network: ${err.message}` };
  }
  if (!r.ok) return { ok: false, status: r.status };
  try {
    return { ok: true, body: await r.json() };
  } catch (err) {
    return {
      ok: false,
      status: 502,
      reason: `HTTP ${r.status} with an unreadable body: ${err.message}`,
    };
  }
}

/** A stable cache name: the same city, centre, radius and step share a file. */
export function cacheName(name, center, radiusM, stepM) {
  return (
    `${name}-${center.lat.toFixed(4)}_${center.lon.toFixed(4)}` +
    `-r${radiusM}-s${stepM}.json`
  );
}

/**
 * Sample a whole grid, resuming from and writing to a disk cache.
 *
 * `fetchJson` is injected so the tests can drive every path - a 429, a 500, a
 * body with no value in it - without a network. `sleep` likewise.
 *
 * Failures: 429 and 5xx back off 5 s, 15 s, then 45 s, and a fourth failure
 * gives that point up as a HOLE rather than stopping the bake - but it also
 * records a warning, and the bake gate refuses to write an extract that
 * collected any. A hole is never a zero: sea level is a real height and "no
 * answer" is not.
 *
 * @returns {{samples:Array<number|null>, filled:number, holes:number, requested:number, fromCache:number, warnings:Array<string>}}
 */
export async function sampleGrid({
  grid,
  source,
  cacheDir,
  cacheFile,
  fetchJson,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  // 16 measured fastest of 4 / 8 / 16 against EPQS, and drew no rate limit
  // over 600 sustained requests. Higher was not tried: the service is a
  // public good and this is already a bake-time script that runs four times.
  concurrency = 16,
  onProgress = null,
}) {
  const warnings = [];
  const cachePath = cacheDir && cacheFile ? join(cacheDir, cacheFile) : null;

  /** key -> metres|null, keyed on the rounded coordinate the URL asked for. */
  const cache = new Map();
  if (cachePath && existsSync(cachePath)) {
    try {
      const raw = JSON.parse(readFileSync(cachePath, 'utf8'));
      for (const [k, v] of Object.entries(raw.samples ?? {})) {
        cache.set(k, v === null ? null : Number(v));
      }
    } catch (err) {
      // A corrupt cache is re-sampled, never trusted and never silently
      // treated as empty data.
      warnings.push(`elevation cache unreadable, re-sampling: ${err.message}`);
      cache.clear();
    }
  }
  const before = cache.size;

  const key = (p) => `${p.lat.toFixed(7)},${p.lon.toFixed(7)}`;
  const todo = [];
  grid.points.forEach((p, i) => {
    if (p && !cache.has(key(p))) todo.push(i);
  });

  const flush = () => {
    if (!cachePath) return;
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(
      cachePath,
      JSON.stringify({ samples: Object.fromEntries(cache) })
    );
  };

  let done = 0;
  let cursor = 0;
  const worker = async () => {
    for (;;) {
      const k = cursor++;
      if (k >= todo.length) return;
      const i = todo[k];
      const p = grid.points[i];
      let value = null;
      for (let attempt = 0; attempt < 4; attempt++) {
        const res = await fetchJson(sampleUrl(source, p));
        if (res.ok) {
          value = readSample(source, res.body);
          break;
        }
        const retryable = res.status === 429 || res.status >= 500;
        if (!retryable || attempt === 3) {
          warnings.push(
            `elevation sample HTTP ${res.status} at ` +
              `${p.lat.toFixed(5)},${p.lon.toFixed(5)} - left as a hole` +
              (res.reason ? ` (${res.reason})` : '')
          );
          break;
        }
        // Shorter than Overpass's ladder ON PURPOSE. Overpass 429s mean a
        // shared query budget and want minutes; these services never rate-
        // limited across 600 sustained samples, so a non-200 here is an
        // outage or a blip and is worth re-asking soon.
        await sleep([5000, 15000, 45000][attempt]);
      }
      cache.set(key(p), value);
      done++;
      // ★ FLUSH AS WE GO. Written only at the end, a crash 20 minutes into a
      // 5,909-point city threw away every answer - which is exactly what
      // happened on the first real Seattle bake, and the cache exists so that
      // cannot cost anything.
      if (done % 250 === 0) flush();
      if (onProgress && done % 500 === 0) onProgress(done, todo.length);
    }
  };
  await Promise.all(
    Array.from({ length: Math.max(1, concurrency) }, () => worker())
  );

  flush();

  const samples = grid.points.map((p) =>
    p ? (cache.get(key(p)) ?? null) : null
  );
  const inCircle = grid.points.filter(Boolean).length;
  const filled = samples.filter((v) => v !== null).length;
  return {
    samples,
    inCircle,
    filled,
    holes: inCircle - filled,
    requested: todo.length,
    fromCache: before,
    warnings,
  };
}

/**
 * The block an extract carries. Returns null when nothing answered, because
 * an empty terrain must not look like a flat one.
 */
export function elevationBlock({ grid, source, samples }) {
  const meta = ELEVATION_SOURCES[source];
  const finite = samples.filter((v) => typeof v === 'number');
  if (finite.length === 0) return null;
  return {
    originX: grid.originX,
    originY: grid.originY,
    stepM: grid.stepM,
    cols: grid.cols,
    rows: grid.rows,
    // How many of the grid's cells are inside the circle at all. Without it
    // a reader cannot tell a city that answered everything from one that
    // answered half: a 30 m grid over a circle fills only about 61 % of its
    // own bounding square, and the corners were never asked.
    inCircle: grid.points.filter(Boolean).length,
    // Centimetre precision: the DEM's own vertical accuracy is far coarser,
    // and full float text would add megabytes to every extract.
    samples: samples.map((v) => (v === null ? null : Math.round(v * 100) / 100)),
    source: meta.id,
    license: meta.license,
    attribution: meta.attribution,
  };
}
