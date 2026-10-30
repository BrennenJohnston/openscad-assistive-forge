/**
 * The terrain tiles behind the steepness check: a latitude and longitude
 * to a slippy tile and a pixel, the Terrarium height decoded, the tiles a
 * map's circle needs, the heights interpolated across tile edges, and the
 * tiles fetched once each.
 *
 * @license GPL-3.0-or-later
 */
import { describe, it, expect, vi } from 'vitest';
import {
  tileAt,
  tilesCovering,
  decodeTerrarium,
  encodeTerrarium,
  loadTiles,
  elevationSampler,
  TILE_URL,
  TILE_SIZE,
} from '../../src/js/tactile-map/terrain.js';

/** The SeaTac Link station on the planning's tile, read with pngjs (measurements\\G1\\tile-pixel.json). */
const STATION = {
  lat: 47.4447,
  lon: -122.2972,
  px: 60,
  py: 195,
  rgb: [128, 109, 6],
  heightM: 109.02,
};

describe('tileAt', () => {
  it('puts the SeaTac station on tile 15/5252/11465 at its pixel', () => {
    const t = tileAt(STATION.lat, STATION.lon, 15);
    expect([t.x, t.y]).toEqual([5252, 11465]);
    expect(t.px).toBe(STATION.px);
    expect(t.py).toBe(STATION.py);
    expect(t.px).toBeGreaterThanOrEqual(0);
    expect(t.px).toBeLessThan(256);
    expect(t.py).toBeGreaterThanOrEqual(0);
    expect(t.py).toBeLessThan(256);
  });
});

describe('decodeTerrarium', () => {
  it('reads the station pixel as 109.0 m, and the inverse encodes it back', () => {
    expect(decodeTerrarium(...STATION.rgb)).toBeCloseTo(STATION.heightM, 1);
    const [r, g, b] = encodeTerrarium(109.02);
    expect(decodeTerrarium(r, g, b)).toBeCloseTo(109.02, 2);
    expect(decodeTerrarium(128, 0, 0)).toBe(0);
  });
});

describe('tilesCovering', () => {
  it('names one tile at a tile center with 100 m and four at a corner', () => {
    const z = 15;
    const n = 2 ** z;
    const lonOf = (xf) => (xf / n) * 360 - 180;
    const latOf = (yf) =>
      (Math.atan(Math.sinh(Math.PI * (1 - (2 * yf) / n))) * 180) / Math.PI;
    const center = { lat: latOf(11465.5), lon: lonOf(5252.5) };
    expect(tilesCovering(center, 100, z)).toEqual([{ z, x: 5252, y: 11465 }]);
    const corner = { lat: latOf(11465), lon: lonOf(5252) };
    const four = tilesCovering(corner, 100, z);
    expect(four).toHaveLength(4);
    expect(four.map((t) => `${t.x}/${t.y}`).sort()).toEqual([
      '5251/11464',
      '5251/11465',
      '5252/11464',
      '5252/11465',
    ]);
  });
});

/** A plane of heights, 1 m per pixel east and 0.5 m per pixel south, encoded into a tile's pixels. */
function plane(x, y, z, east0, north0) {
  const data = new Uint8ClampedArray(TILE_SIZE * TILE_SIZE * 4);
  for (let py = 0; py < TILE_SIZE; py += 1) {
    for (let px = 0; px < TILE_SIZE; px += 1) {
      const h = 100 + (east0 + px) * 1 + (north0 + py) * 0.5;
      const [r, g, b] = encodeTerrarium(h);
      const i = (py * TILE_SIZE + px) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return { z, x, y, width: TILE_SIZE, height: TILE_SIZE, data };
}

describe('loadTiles and elevationSampler', () => {
  it('builds the four tile URLs and decodes each tile once through the injected reader', async () => {
    const addresses = [
      { z: 15, x: 5251, y: 11464 },
      { z: 15, x: 5252, y: 11464 },
      { z: 15, x: 5251, y: 11465 },
      { z: 15, x: 5252, y: 11465 },
    ];
    const fetched = [];
    const fetchImpl = vi.fn(async (url) => {
      fetched.push(url);
      return { ok: true, status: 200, blob: async () => ({ url }) };
    });
    const toImageData = vi.fn(async () => ({
      width: TILE_SIZE,
      height: TILE_SIZE,
      data: new Uint8ClampedArray(TILE_SIZE * TILE_SIZE * 4),
    }));
    const tiles = await loadTiles(addresses, { fetch: fetchImpl, toImageData });
    expect(fetched).toEqual([
      'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/15/5251/11464.png',
      'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/15/5252/11464.png',
      'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/15/5251/11465.png',
      'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/15/5252/11465.png',
    ]);
    expect(TILE_URL(15, 5252, 11465)).toBe(
      'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/15/5252/11465.png'
    );
    expect(toImageData).toHaveBeenCalledTimes(4);
    expect(tiles).toHaveLength(4);
    expect(tiles[3]).toMatchObject({ z: 15, x: 5252, y: 11465 });
  });

  it('refuses with no-answer when a tile does not come', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 403 }));
    await expect(
      loadTiles([{ z: 15, x: 1, y: 1 }], {
        fetch: fetchImpl,
        toImageData: vi.fn(),
      })
    ).rejects.toMatchObject({ code: 'no-answer' });
  });

  it('interpolates heights within 0.05 m on a plane, across a tile edge too', () => {
    const z = 15;
    // Two tiles side by side: the east one continues the plane 256 px on.
    const west = plane(5252, 11465, z, 0, 0);
    const east = plane(5253, 11465, z, TILE_SIZE, 0);
    const elevationAt = elevationSampler([west, east]);
    const n = 2 ** z;
    const lonOf = (xf) => (xf / n) * 360 - 180;
    const latOf = (yf) =>
      (Math.atan(Math.sinh(Math.PI * (1 - (2 * yf) / n))) * 180) / Math.PI;
    // The pixel centers: px + 0.5 within the tile.
    const at = (px, py) =>
      elevationAt(
        latOf(11465 + (py + 0.5) / TILE_SIZE),
        lonOf(5252 + (px + 0.5) / TILE_SIZE)
      );
    expect(at(10, 20)).toBeCloseTo(100 + 10 + 10, 1);
    expect(at(10.5, 20)).toBeCloseTo(100 + 10.5 + 10, 1);
    expect(at(255.5, 100)).toBeCloseTo(100 + 255.5 + 50, 1);
    expect(at(300, 7)).toBeCloseTo(100 + 300 + 3.5, 1);
    expect(elevationAt(0, 0)).toBeNull();
  });
});
