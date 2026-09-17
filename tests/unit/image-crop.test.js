/**
 * Cropping a reference image (DP-5).
 *
 * The geometry is tested apart from the dialog because a wrong rectangle is
 * not something a screenshot reveals - it just quietly traces the wrong part
 * of the picture. Every field in the dialog is a number someone can type, so
 * every one of these cases is reachable by hand.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';
import {
  croppedName,
  clampCropRect,
  fullImageRect,
  cropImageDataRect,
  insetRect,
  readDrawingBox,
  imageDataToDataUrl,
} from '../../src/js/image-crop.js';

describe('croppedName', () => {
  it('keeps the source recognisable, and the extension', () => {
    expect(croppedName('bird.png')).toBe('bird-crop.png');
    expect(croppedName('Screen Shot 2026.jpeg')).toBe(
      'Screen Shot 2026-crop.jpeg'
    );
  });

  it('handles a name with no extension, and a dotfile', () => {
    expect(croppedName('sketch')).toBe('sketch-crop');
    expect(croppedName('.hidden')).toBe('.hidden-crop');
  });

  it('only the LAST dot is the extension', () => {
    expect(croppedName('my.photo.v2.png')).toBe('my.photo.v2-crop.png');
  });

  it('never produces an empty name', () => {
    expect(croppedName('')).toBe('image-crop');
    expect(croppedName(null)).toBe('image-crop');
  });
});

describe('clampCropRect', () => {
  it('leaves a rectangle that already fits', () => {
    expect(clampCropRect({ x: 10, y: 20, width: 30, height: 40 }, 100, 100)).toEqual(
      { x: 10, y: 20, width: 30, height: 40 }
    );
  });

  it('pulls a rectangle back inside the image', () => {
    expect(clampCropRect({ x: 90, y: 90, width: 50, height: 50 }, 100, 100)).toEqual(
      { x: 90, y: 90, width: 10, height: 10 }
    );
  });

  it('refuses negative origins', () => {
    expect(clampCropRect({ x: -20, y: -5, width: 30, height: 30 }, 100, 100)).toEqual(
      { x: 0, y: 0, width: 30, height: 30 }
    );
  });

  it('always keeps at least one pixel, whatever is typed', () => {
    // A zero or negative size is easy to type and impossible to draw.
    for (const bad of [0, -1, -999, NaN]) {
      const r = clampCropRect({ x: 5, y: 5, width: bad, height: bad }, 50, 50);
      expect(r.width).toBeGreaterThanOrEqual(1);
      expect(r.height).toBeGreaterThanOrEqual(1);
    }
  });

  it('an origin on the far edge still leaves a pixel to crop', () => {
    const r = clampCropRect({ x: 999, y: 999, width: 10, height: 10 }, 40, 30);
    expect(r.x).toBe(39);
    expect(r.y).toBe(29);
    expect(r.width).toBe(1);
    expect(r.height).toBe(1);
  });

  it('rounds to whole pixels, because that is what drawImage will do anyway', () => {
    expect(clampCropRect({ x: 1.6, y: 2.4, width: 9.5, height: 9.4 }, 100, 100)).toEqual(
      { x: 2, y: 2, width: 10, height: 9 }
    );
  });

  it('survives a missing rectangle by selecting everything', () => {
    expect(clampCropRect(null, 80, 60)).toEqual({
      x: 0,
      y: 0,
      width: 80,
      height: 60,
    });
  });

  it('survives a nonsense image size rather than dividing by zero', () => {
    const r = clampCropRect({ x: 0, y: 0, width: 10, height: 10 }, 0, -5);
    expect(r).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });
});

describe('fullImageRect', () => {
  it('starts on the whole picture, so the first thing shown is what you have', () => {
    expect(fullImageRect(120, 90)).toEqual({
      x: 0,
      y: 0,
      width: 120,
      height: 90,
    });
  });
});

// ── DP-49: the crop as pixels, before the trace ────────────────────────────
//
// A traced picture is cropped in its pixels and traced again, so the crop
// has to be a pure copy of a rectangle out of typed arrays: it runs on the
// page before the worker starts, and a wrong row stride would quietly trace
// a smeared picture.
describe('cropImageDataRect', () => {
  // A 4 by 3 picture where every pixel's red channel is its index, so a
  // misplaced row or column shows in the numbers.
  function picture() {
    const width = 4;
    const height = 3;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      data[i * 4] = i;
      data[i * 4 + 1] = 100 + i;
      data[i * 4 + 2] = 200;
      data[i * 4 + 3] = 255;
    }
    return { width, height, data };
  }
  const reds = (img) =>
    Array.from({ length: img.width * img.height }, (_, i) => img.data[i * 4]);

  it('★ copies exactly the rectangle, row by row', () => {
    const out = cropImageDataRect(picture(), {
      x: 1,
      y: 1,
      width: 2,
      height: 2,
    });
    expect(out.width).toBe(2);
    expect(out.height).toBe(2);
    expect(out.data.length).toBe(16);
    // Row 1 is pixels 4..7, row 2 is 8..11; columns 1 and 2 of each.
    expect(reds(out)).toEqual([5, 6, 9, 10]);
    expect(out.data[1]).toBe(105);
    expect(out.data[3]).toBe(255);
  });

  it('pulls a rectangle past the edge back inside, keeping one pixel at least', () => {
    const out = cropImageDataRect(picture(), {
      x: 3,
      y: 2,
      width: 10,
      height: 10,
    });
    expect(out.width).toBe(1);
    expect(out.height).toBe(1);
    expect(reds(out)).toEqual([11]);
  });

  it('leaves the source untouched and hands back a fresh buffer', () => {
    const src = picture();
    const before = Array.from(src.data);
    const out = cropImageDataRect(src, { x: 0, y: 0, width: 4, height: 3 });
    expect(Array.from(src.data)).toEqual(before);
    expect(out.data).not.toBe(src.data);
    expect(reds(out)).toEqual(reds(src));
  });
});

// ── DP-49: four insets to a rectangle ──────────────────────────────────────
//
// The crop view's rows are Top, Bottom, Left and Right, each a share of the
// picture's height or width; both the picture crop (pixels) and the drawing
// crop (viewBox units) start from the same rectangle.
describe('insetRect', () => {
  it('★ turns percentages into the kept rectangle, in the box\'s own units', () => {
    const rect = insetRect(
      { x: 0, y: 0, width: 400, height: 300 },
      { top: 10, bottom: 20, left: 25, right: 0 }
    );
    expect(rect).toEqual({ x: 100, y: 30, width: 300, height: 210 });
  });

  it('starts from the box\'s own origin', () => {
    const rect = insetRect(
      { x: 50, y: 20, width: 200, height: 100 },
      { top: 50, bottom: 0, left: 0, right: 50 }
    );
    expect(rect).toEqual({ x: 50, y: 70, width: 100, height: 50 });
  });

  it('holds every inset to 0..90 and keeps a sliver when they meet', () => {
    const full = insetRect(
      { x: 0, y: 0, width: 100, height: 100 },
      { top: -5, bottom: 200, left: 0, right: 0 }
    );
    expect(full.y).toBe(0);
    expect(full.height).toBeCloseTo(10, 6);
    const met = insetRect(
      { x: 0, y: 0, width: 100, height: 100 },
      { top: 90, bottom: 90, left: 90, right: 90 }
    );
    expect(met.width).toBeGreaterThan(0);
    expect(met.height).toBeGreaterThan(0);
    expect(met.x + met.width).toBeLessThanOrEqual(100);
    expect(met.y + met.height).toBeLessThanOrEqual(100);
  });

  it('missing insets mean none', () => {
    expect(insetRect({ x: 0, y: 0, width: 10, height: 10 }, {})).toEqual({
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    });
  });
});

// ── DP-49: the box a drawing is cropped within, and pixels as a picture ────
describe('readDrawingBox', () => {
  const root = (s) =>
    new DOMParser().parseFromString(s, 'image/svg+xml').documentElement;
  it('reads the viewBox, else the width and height, else nothing', () => {
    expect(
      readDrawingBox(root('<svg xmlns="http://www.w3.org/2000/svg" viewBox="5 8 60 40" width="600"/>'))
    ).toEqual({ x: 5, y: 8, width: 60, height: 40 });
    expect(
      readDrawingBox(root('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"/>'))
    ).toEqual({ x: 0, y: 0, width: 200, height: 100 });
    expect(readDrawingBox(root('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
  });
});

describe('imageDataToDataUrl', () => {
  it('answers null where there is no canvas to draw on', () => {
    expect(
      imageDataToDataUrl({ width: 1, height: 1, data: new Uint8ClampedArray(4) })
    ).toBeNull();
  });
});
