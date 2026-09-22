/**
 * DP-79: a camera made it. The photo defaults follow this verdict, and a
 * FILE must never get them: MEASURED (build/dp-r6/dp-79, dp79-ground.mjs)
 * the four camera pictures spread 9.5 to 27.4 at the thumbnail scale, every
 * library icon, the owner's logo and the repo's fixtures 0 to 1.9, as PNGs
 * and re-saved as JPEGs. Grain could not tell them apart: the logo saved as
 * a JPEG rings around its lettering as much as a photograph's paper grains.
 *
 * @license GPL-3.0-or-later
 */
import { describe, it, expect } from 'vitest';
import {
  quickLook,
  thumbnailOf,
  groundSpread,
  grainShare,
  CAMERA_GROUND_SPREAD_MIN,
  CAMERA_GRAIN_MIN,
} from '../../src/js/quick-look.js';

const makeImageData = (width, height) => ({
  width,
  height,
  data: new Uint8ClampedArray(width * height * 4),
});

/** A picture with a dark blob on a transparent ground, like a library icon. */
function iconLike(size = 700) {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const inMark =
        x > size * 0.3 && x < size * 0.7 && y > size * 0.3 && y < size * 0.7;
      data[i] = data[i + 1] = data[i + 2] = 0;
      data[i + 3] = inMark ? 255 : 0;
    }
  }
  return { width: size, height: size, data };
}

/** A small drawing on white paper from a program: one number everywhere. */
function drawingLike(size = 600) {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const onLine = Math.abs(x - y) < 4;
      const v = onLine ? 20 : 250;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return { width: size, height: size, data };
}

/**
 * Paper under a lamp, photographed: bright at one edge, dimmer at the
 * other, grain on every pixel, a mark on it. `grain` false gives the same
 * lighting from a program: a smooth gradient with no grain at all.
 */
function litPaper(size = 600, { grain = true } = {}) {
  const data = new Uint8ClampedArray(size * size * 4);
  let seed = 31;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const inMark =
        x > size * 0.4 && x < size * 0.6 && y > size * 0.4 && y < size * 0.6;
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const noise = grain ? ((seed >> 16) % 13) - 6 : 0;
      const v = inMark ? 20 : 200 + Math.round((35 * x) / size) + noise;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return { width: size, height: size, data };
}

/** A clean file with a dense pattern: a grid of dots, flat white between. */
function dotGrid(size = 600, perSide = 12) {
  const data = new Uint8ClampedArray(size * size * 4);
  data.fill(255);
  const cell = size / perSide;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cx = (Math.floor(x / cell) + 0.5) * cell;
      const cy = (Math.floor(y / cell) + 0.5) * cell;
      if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= cell * 0.4) {
        const i = (y * size + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = 0;
      }
    }
  }
  return { width: size, height: size, data };
}

const look = (pixels) => quickLook(pixels, { makeImageData, deviceFactor: 1 });

describe('a camera made it (DP-79)', () => {
  it('the rule is written down: both signals, and the numbers', () => {
    expect(CAMERA_GROUND_SPREAD_MIN).toBe(5);
    expect(CAMERA_GRAIN_MIN).toBe(0.1);
  });

  it('a flat ground spreads nothing, a lit one spreads', () => {
    expect(groundSpread(thumbnailOf(drawingLike(600)))).toBe(0);
    expect(groundSpread(thumbnailOf(litPaper(600)))).toBeGreaterThan(20);
  });

  it('a clean file has no grain, a photograph has', () => {
    expect(grainShare(drawingLike(600))).toBeLessThan(0.05);
    expect(grainShare(dotGrid(600))).toBeLessThan(0.05);
    expect(grainShare(litPaper(600))).toBeGreaterThan(0.5);
  });

  it("★ calls photographed paper a camera picture, and a program's drawing a file", () => {
    const lit = look(litPaper(600));
    expect(lit.camera).toBe(true);
    expect(lit.groundSpread).toBeGreaterThanOrEqual(CAMERA_GROUND_SPREAD_MIN);
    expect(lit.grain).toBeGreaterThanOrEqual(CAMERA_GRAIN_MIN);
    expect(look(drawingLike(600)).camera).toBe(false);
    expect(look(drawingLike(600)).groundSpread).toBe(0);
    expect(look(iconLike(700)).camera).toBe(false);
  });

  it('★ one signal alone is not enough: a dense clean pattern, a smooth gradient', () => {
    // MEASURED on the gear grid the Start-and-Cancel guard draws: a clean
    // file whose dots make the thumbnail's ground look lit (spread 19) with
    // no grain at all; on the spread alone it was worked at 560 px and the
    // floor dropped all 900 of its gears. And the owner's logo saved as a
    // JPEG has grain (0.24, the ringing around its letters) and a flat
    // ground (1.9): the spread alone would have kept it, the grain alone
    // would not.
    const grid = look(dotGrid(600));
    expect(grid.groundSpread).toBeGreaterThanOrEqual(CAMERA_GROUND_SPREAD_MIN);
    expect(grid.grain).toBeLessThan(CAMERA_GRAIN_MIN);
    expect(grid.camera).toBe(false);
    const gradient = look(litPaper(600, { grain: false }));
    expect(gradient.groundSpread).toBeGreaterThanOrEqual(CAMERA_GROUND_SPREAD_MIN);
    expect(gradient.grain).toBeLessThan(CAMERA_GRAIN_MIN);
    expect(gradient.camera).toBe(false);
  });

  it('a see-through picture is never a camera picture, however unevenly lit', () => {
    const lit = litPaper(300);
    for (let y = 0; y < 100; y++) {
      for (let x = 0; x < 300; x++) lit.data[(y * 300 + x) * 4 + 3] = 0;
    }
    expect(look(lit).camera).toBe(false);
  });

  it('the classes the sentences use are as they were', () => {
    expect(look(iconLike(700)).pictureClass).toBe('icon');
    expect(look(drawingLike(600)).pictureClass).toBe('drawing');
    expect(look(litPaper(600)).pictureClass).toBe('drawing');
  });
});
