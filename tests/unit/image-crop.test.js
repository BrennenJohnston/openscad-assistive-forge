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
