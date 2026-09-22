/**
 * The photo defaults (DP-79, D-173, D-176): the working resolution, the
 * median, the speck floor and the close, as the one module both roads to the
 * tracer call. Pure arithmetic over hand-built pictures small enough to read.
 *
 * @license GPL-3.0-or-later
 */
import { describe, it, expect } from 'vitest';
import {
  WORKING_MIN_PX,
  SPECK_FLOOR_MM2,
  workingFactor,
  resampleBy,
  workingPicture,
  inkStage,
} from '../../src/js/ink-prepare.js';
import { PRINT_CELL_MM } from '../../src/js/print-cell.js';
import { componentCount } from '../../src/js/ink-extraction.js';

const makeImageData = (width, height) => ({
  width,
  height,
  data: new Uint8ClampedArray(width * height * 4),
});

/** A white picture with black rectangles painted on it. */
function paper(width, height, rects) {
  const img = makeImageData(width, height);
  img.data.fill(255);
  for (const [x0, y0, w, h] of rects) {
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        const i = (y * width + x) * 4;
        img.data[i] = 0;
        img.data[i + 1] = 0;
        img.data[i + 2] = 0;
      }
    }
  }
  return img;
}

const INK = { mode: 'lineart', lightnessMax: 55, chromaMax: 25 };

describe('the working resolution (DP-79)', () => {
  it('forty pixels per printed millimeter: 1400 px at 14 mm shrinks by 2.5', () => {
    expect(PRINT_CELL_MM).toBe(0.025);
    expect(workingFactor(1400, 1000, 14)).toBeCloseTo(2.5, 5);
  });

  it('never grows a picture, and leaves one already at the cell alone', () => {
    expect(workingFactor(560, 400, 14)).toBe(1);
    expect(workingFactor(300, 300, 14)).toBe(1);
  });

  it('never goes under 400 px on the long side, whatever the print', () => {
    // 1400 px wide printing at 3 mm would want 120 px; the long side stays
    // at WORKING_MIN_PX instead, so the factor is 1400 / 400.
    expect(WORKING_MIN_PX).toBe(400);
    expect(workingFactor(1400, 500, 3)).toBeCloseTo(3.5, 5);
    // A tall picture: the long side is its height.
    expect(workingFactor(500, 1400, 3)).toBeCloseTo(3.5, 5);
  });

  it('a picture with no size or no printed width is left alone', () => {
    expect(workingFactor(0, 0, 14)).toBe(1);
    expect(workingFactor(1400, 1000, 0)).toBe(1);
  });
});

describe('resampleBy: a fractional box filter', () => {
  it('halving a checkerboard gives the mean of each block', () => {
    const img = makeImageData(4, 4);
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const v = (x + y) % 2 === 0 ? 0 : 255;
        const i = (y * 4 + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
    }
    const { imageData, factor } = resampleBy(img, 2);
    expect(factor).toBe(2);
    expect(imageData.width).toBe(2);
    expect(imageData.height).toBe(2);
    // 127.5 rounds to 128 in a clamped array.
    for (let p = 0; p < 4; p++) expect(imageData.data[p * 4]).toBe(128);
    expect(imageData.data[3]).toBe(255);
  });

  it('a flat color survives a fractional factor exactly, at the rounded size', () => {
    const img = makeImageData(600, 450);
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i] = 10;
      img.data[i + 1] = 200;
      img.data[i + 2] = 30;
      img.data[i + 3] = 255;
    }
    const { imageData } = resampleBy(img, 600 / 560);
    expect(imageData.width).toBe(560);
    expect(imageData.height).toBe(420);
    // One count, not a million assertions: the board runs this beside two
    // hundred other files.
    let wrong = 0;
    for (let i = 0; i < imageData.data.length; i += 4) {
      if (
        imageData.data[i] !== 10 ||
        imageData.data[i + 1] !== 200 ||
        imageData.data[i + 2] !== 30 ||
        imageData.data[i + 3] !== 255
      ) {
        wrong++;
      }
    }
    expect(wrong).toBe(0);
  });

  it('a factor of one or less hands the picture back untouched', () => {
    const img = makeImageData(10, 10);
    expect(resampleBy(img, 1).imageData).toBe(img);
    expect(resampleBy(img, 0.5).imageData).toBe(img);
  });

  it('an edge keeps its place: a half-black picture halved is half black', () => {
    const img = paper(200, 100, [[0, 0, 100, 100]]);
    const { imageData } = resampleBy(img, 2.5);
    expect(imageData.width).toBe(80);
    // Column 39 is still black, column 40 still white: the edge at x = 100
    // lands between output columns 39 and 40 (each 2.5 source pixels wide).
    expect(imageData.data[(20 * 80 + 39) * 4]).toBe(0);
    expect(imageData.data[(20 * 80 + 40) * 4]).toBe(255);
  });
});

describe('workingPicture: only a camera picture with a printed width', () => {
  it('★ resamples a camera picture to the cell and re-scales its millimeters per pixel', () => {
    const img = paper(1400, 1000, [[100, 100, 400, 400]]);
    const out = workingPicture(img, {
      ...INK,
      camera: true,
      mmPerPixel: 14 / 1400,
    });
    expect(out.pixels.width).toBe(560);
    expect(out.pixels.height).toBe(400);
    expect(out.mmPerPixel).toBeCloseTo(0.025, 6);
    expect(out.working).toEqual({
      from: 1400,
      width: 560,
      height: 400,
      factor: 2.5,
      printedWidthMm: 14,
    });
  });

  it('leaves a file at its own pixels, whatever its width', () => {
    const img = paper(1400, 1000, []);
    const out = workingPicture(img, { ...INK, camera: false, mmPerPixel: 0.01 });
    expect(out.pixels).toBe(img);
    expect(out.working).toBeNull();
    expect(out.mmPerPixel).toBe(0.01);
  });

  it('leaves a camera picture alone when nobody said how wide it prints', () => {
    const img = paper(1400, 1000, []);
    const out = workingPicture(img, { ...INK, camera: true });
    expect(out.pixels).toBe(img);
    expect(out.working).toBeNull();
    expect(out.mmPerPixel).toBe(0);
  });

  it('and with no ink settings at all', () => {
    const img = paper(40, 40, []);
    expect(workingPicture(img, null).pixels).toBe(img);
  });
});

describe('inkStage: the median, the floor and the close', () => {
  // A 200 x 200 picture at 0.025 mm per pixel (a 5 mm print): a 60 x 60
  // block and a 2 x 2 speck. The floor at that cell is 160 px.
  const scene = () =>
    paper(200, 200, [
      [50, 50, 60, 60],
      [150, 20, 2, 2],
    ]);
  const at = { camera: true, mmPerPixel: 0.025 };

  it('★ the floor drops the speck, counts it, and hands Potrace the same floor', () => {
    const out = inkStage(scene(), { ...INK, ...at, speckFloor: true }, {
      makeImageData,
    });
    expect(out.summary.specksDropped).toBe(1);
    expect(out.summary.speckFloorMm2).toBe(SPECK_FLOOR_MM2);
    expect(out.turdsize).toBe(160);
    expect(componentCount(out.mask, 200, 200)).toBe(1);
    // The speck is gone from the mask and from the painted picture alike.
    expect(out.mask[20 * 200 + 150]).toBe(0);
    expect(out.pixels.data[(20 * 200 + 150) * 4]).toBe(255);
    expect(out.summary.printedWidthMm).toBe(5);
  });

  it('with the switch off nothing is dropped and Potrace gets no floor', () => {
    const out = inkStage(scene(), { ...INK, ...at, speckFloor: false }, {
      makeImageData,
    });
    expect(out.summary.specksDropped).toBe(0);
    expect(out.summary.speckFloorMm2).toBeNull();
    expect(out.turdsize).toBeUndefined();
    expect(componentCount(out.mask, 200, 200)).toBe(2);
  });

  it('a file never gets the floor, even with the switch on', () => {
    const out = inkStage(
      scene(),
      { ...INK, camera: false, mmPerPixel: 0, speckFloor: true },
      { makeImageData }
    );
    expect(out.summary.specksDropped).toBe(0);
    expect(out.turdsize).toBeUndefined();
  });

  it('★ the close bridges a crayon gap on a Solid shape, and only there', () => {
    // Two blocks three pixels apart: at 0.025 mm per pixel the close's
    // radius is four, wide enough to join them.
    const gap = paper(120, 60, [
      [10, 10, 40, 40],
      [53, 10, 40, 40],
    ]);
    const solid = inkStage(
      { ...gap },
      { mode: 'silhouette', lightnessMax: 55, ...at },
      { makeImageData }
    );
    expect(solid.summary.closed).toBe(true);
    expect(componentCount(solid.mask, 120, 60)).toBe(1);
    const lines = inkStage(gap, { ...INK, ...at }, { makeImageData });
    expect(lines.summary.closed).toBe(false);
    expect(componentCount(lines.mask, 120, 60)).toBe(2);
  });

  it('the median runs through extractInk when the switch is on, and says so', () => {
    const speckled = paper(60, 60, [[30, 30, 1, 1]]);
    const smoothed = inkStage(speckled, { ...INK, ...at, smooth: true }, {
      makeImageData,
    });
    expect(smoothed.summary.denoised).toBe(true);
    expect(componentCount(smoothed.mask, 60, 60)).toBe(0);
    const raw = inkStage(speckled, { ...INK, ...at, smooth: false }, {
      makeImageData,
    });
    expect(raw.summary.denoised).toBe(false);
    expect(componentCount(raw.mask, 60, 60)).toBe(1);
  });
});
