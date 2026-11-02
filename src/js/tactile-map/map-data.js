/**
 * Where a map's data comes from, in order: the OpenStreetMap US map tiles
 * first (prebuilt and cached, so a map does not wait on a busy database),
 * then the Overpass servers when the tiles fail, then, said by the panel,
 * the file door. The move from the tiles to the first Overpass server is
 * said the way a move between servers is: `onWait(0, next, { from, reason })`.
 *
 * Only a failure the sources name (a `code`) moves the pull on; anything
 * else is a fault of this code and is thrown, not hidden behind a fallback.
 *
 * No DOM here.
 *
 * @license GPL-3.0-or-later
 */
import { pullTiles, TILES_NAME } from './osm-tiles.js';
import { pullArea, OVERPASS_HOSTS } from './overpass.js';

/**
 * Pull the map data for a place (a circle) or two places (a box).
 *
 * @param {object} args - the pull's place or box, `fetch`, `signal`, `onWait`
 * @param {Function} [args.tiles] - the tile source, injected for tests
 * @param {Function} [args.overpass] - the Overpass source, injected for tests
 * @returns {Promise<{elements: object[], bytes: number, ms: number, attribution: string, host: string}>}
 */
export async function pullMapData({
  tiles = pullTiles,
  overpass = pullArea,
  onWait = () => {},
  online = () => globalThis.navigator?.onLine !== false,
  ...where
} = {}) {
  try {
    return await tiles({ ...where, online });
  } catch (error) {
    if (typeof error?.code !== 'string') throw error;
    if (where.signal?.aborted || !online()) throw error;
    onWait(0, OVERPASS_HOSTS[0].name, { from: TILES_NAME, reason: error.code });
    return overpass({ ...where, onWait, online });
  }
}
