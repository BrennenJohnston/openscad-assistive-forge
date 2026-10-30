/**
 * Terrain tiles for the steepness check: Mapzen's Terrarium tiles on AWS
 * (public, no key), a slippy map at zoom 15 (about 3.2 m per pixel at
 * Seattle's latitude), each pixel a height encoded in its red, green and
 * blue. A map's circle needs one to four tiles; heights between pixels are
 * read by bilinear interpolation, across a tile edge too.
 *
 * No DOM except `browserToImageData`, the injectable piece that turns a
 * fetched PNG into pixels (createImageBitmap and an OffscreenCanvas); a
 * unit test hands in a synthesized array instead.
 *
 * @license GPL-3.0-or-later
 */

export const TILE_SIZE = 256;
export const TILE_ZOOM = 15;
const M_PER_DEG_LAT = 110540;
const M_PER_DEG_LON = 111320;

/** The tile's address on the terrain host. */
export const TILE_URL = (z, x, y) =>
  `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

/** The slippy map's fractional tile coordinates of a point. */
function tileCoords(lat, lon, z) {
  const n = 2 ** z;
  const latRad = (lat * Math.PI) / 180;
  const xf = ((lon + 180) / 360) * n;
  const yf =
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { xf, yf };
}

/**
 * The tile a point lies on and its pixel there.
 *
 * @param {number} lat
 * @param {number} lon
 * @param {number} [z]
 * @returns {{x: number, y: number, px: number, py: number, z: number}}
 */
export function tileAt(lat, lon, z = TILE_ZOOM) {
  const { xf, yf } = tileCoords(lat, lon, z);
  const x = Math.floor(xf);
  const y = Math.floor(yf);
  return {
    z,
    x,
    y,
    px: Math.min(TILE_SIZE - 1, Math.floor((xf - x) * TILE_SIZE)),
    py: Math.min(TILE_SIZE - 1, Math.floor((yf - y) * TILE_SIZE)),
  };
}

/**
 * The tiles a circle around a center needs: the tiles under the box's
 * four corners, one to four of them, in reading order.
 *
 * @param {{lat: number, lon: number}} center
 * @param {number} radiusM
 * @param {number} [z]
 * @returns {Array<{z: number, x: number, y: number}>}
 */
export function tilesCovering(center, radiusM, z = TILE_ZOOM) {
  const dLat = radiusM / M_PER_DEG_LAT;
  const dLon =
    radiusM / (M_PER_DEG_LON * Math.cos((center.lat * Math.PI) / 180));
  const corners = [
    [center.lat + dLat, center.lon - dLon],
    [center.lat + dLat, center.lon + dLon],
    [center.lat - dLat, center.lon - dLon],
    [center.lat - dLat, center.lon + dLon],
  ];
  const seen = new Set();
  const out = [];
  for (const [lat, lon] of corners) {
    const { x, y } = tileAt(lat, lon, z);
    const key = `${x}/${y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ z, x, y });
  }
  return out.sort((a, b) => a.y - b.y || a.x - b.x);
}

/** A Terrarium pixel's height in meters. */
export function decodeTerrarium(r, g, b) {
  return r * 256 + g + b / 256 - 32768;
}

/** The inverse, for synthesized tiles: a height to its red, green and blue. */
export function encodeTerrarium(heightM) {
  const v = heightM + 32768;
  const whole = Math.floor(v);
  const r = Math.floor(whole / 256);
  const g = whole - r * 256;
  const b = Math.min(255, Math.max(0, Math.round((v - whole) * 256)));
  return [r, g, b];
}

/** A fetched PNG to pixels in the browser: the one DOM-bound piece. */
export async function browserToImageData(blob) {
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);
  const image = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  bitmap.close?.();
  return image;
}

/**
 * The tiles fetched and decoded, one request each.
 *
 * @param {Array<{z: number, x: number, y: number}>} addresses
 * @param {{fetch?: Function, toImageData?: Function}} [options]
 * @returns {Promise<Array<{z: number, x: number, y: number, width: number, height: number, data: Uint8ClampedArray}>>}
 */
export async function loadTiles(
  addresses,
  { fetch: fetchImpl = globalThis.fetch, toImageData = browserToImageData } = {}
) {
  const tiles = [];
  for (const { z, x, y } of addresses) {
    const url = TILE_URL(z, x, y);
    let response;
    try {
      response = await fetchImpl(url);
    } catch (error) {
      throw fail(
        'no-answer',
        `The terrain tile did not arrive: ${error?.message || error}`
      );
    }
    if (!response?.ok) {
      throw fail(
        'no-answer',
        `The terrain host answered ${response?.status} for ${url}.`
      );
    }
    const image = await toImageData(await response.blob());
    tiles.push({
      z,
      x,
      y,
      width: image.width,
      height: image.height,
      data: image.data,
    });
  }
  return tiles;
}

/**
 * A height reader over loaded tiles: `elevationAt(lat, lon)` in meters, by
 * bilinear interpolation between pixel centers, across tile edges; null
 * where a needed pixel lies on no loaded tile.
 *
 * @param {Array<{z: number, x: number, y: number, width: number, data: Uint8ClampedArray}>} tiles
 * @returns {(lat: number, lon: number) => number|null}
 */
export function elevationSampler(tiles) {
  if (!tiles?.length) return () => null;
  const z = tiles[0].z;
  const byKey = new Map(tiles.map((t) => [`${t.x}/${t.y}`, t]));
  const pixel = (gx, gy) => {
    const tx = Math.floor(gx / TILE_SIZE);
    const ty = Math.floor(gy / TILE_SIZE);
    const tile = byKey.get(`${tx}/${ty}`);
    if (!tile) return null;
    const px = gx - tx * TILE_SIZE;
    const py = gy - ty * TILE_SIZE;
    const i = (py * tile.width + px) * 4;
    return decodeTerrarium(tile.data[i], tile.data[i + 1], tile.data[i + 2]);
  };
  return (lat, lon) => {
    const { xf, yf } = tileCoords(lat, lon, z);
    const gx = xf * TILE_SIZE - 0.5;
    const gy = yf * TILE_SIZE - 0.5;
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const fx = gx - x0;
    const fy = gy - y0;
    const h00 = pixel(x0, y0);
    const h10 = pixel(x0 + 1, y0);
    const h01 = pixel(x0, y0 + 1);
    const h11 = pixel(x0 + 1, y0 + 1);
    if ([h00, h10, h01, h11].some((h) => h === null)) return null;
    const top = h00 * (1 - fx) + h10 * fx;
    const bottom = h01 * (1 - fx) + h11 * fx;
    return top * (1 - fy) + bottom * fy;
  };
}
