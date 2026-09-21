/**
 * A quick look at a picture, before anyone commits to converting it.
 *
 * The second thing the directive asks for: a person may choose a photograph
 * without realizing how much work it is, or that a simpler picture would give a
 * better charm. So before Start, one sentence about what the picture looks like
 * and roughly what it will cost ON THIS DEVICE. It never blocks and it never
 * refuses; it informs, and the person decides.
 *
 * ── What it is built on, and what it deliberately is NOT ──────────────────
 *
 * It does NOT predict the shape count. That was measured and it does not work:
 * a 96 px thumbnail of a Noun Project icon traces into 2 to 12 shapes while the
 * full picture traces into 34 to 59, because the credit caption's letters
 * vanish at thumbnail scale. A number that wrong is worse than no number.
 *
 * What a thumbnail DOES carry honestly is the main mark's complexity and the ink
 * coverage. How fast the machine is gets measured separately, on a FIXED piece
 * of work, for the reason recorded above `calibrationPicture` below.
 *
 * ── The cost model, measured ──────────────────────────────────────────────
 *
 * The dominant cost is the ink extraction, and which extraction runs is decided
 * by whether the picture has a transparent background. `extractInk` uses the
 * ALPHA channel when enough of the picture is see-through, which is cheap; with
 * no alpha it classifies every pixel by lightness and color, which is not.
 *
 * MEASURED IN CHROMIUM, which is where this runs - the first version of these
 * numbers was measured in Node and told a person a photograph would take six
 * seconds when it took one and a half. Line art, this machine at full speed,
 * over the nine Noun Project icons and two opaque pictures
 * (build/dp-r4/harness/browser-cost.mjs):
 *
 *   the nine icons   0.49 MP, 44-92 % transparent    83-114 ms   170-233 per MP
 *   a plain drawing  0.64 MP, 0 % transparent           240 ms   375 per MP
 *   WATAP Paint v2   7.99 MP, 0 % transparent         1,046 ms   524 per MP
 *
 * All measured against the CAPPED pixel count, because a picture over
 * IMAGE_IMPORT_LIMITS.maxPixels is scaled down before any of this runs. That is
 * why an 8 MP photograph and a 12 MP one cost the same: both become 2 MP first.
 *
 * With the device factor at 1 the model lands close on every one of them: the
 * icons predict 98 ms against 83-114 measured, the drawing 288 against 240, and
 * the 8 MP photograph 900 against 1,046.
 *
 * @license GPL-3.0-or-later
 */

import { IMAGE_IMPORT_LIMITS } from './image-import.js';
import {
  extractInk,
  INK_DEFAULTS,
  MEANINGFUL_ALPHA_SHARE,
} from './ink-extraction.js';

/** The thumbnail's long edge. 96 px was measured as enough and cheap. */
export const THUMBNAIL_EDGE = 96;

/**
 * The calibration, all measured 2026-09-13 on the machine named above. Each is
 * a rate against the capped megapixel count, in milliseconds.
 */
export const COST_MODEL = Object.freeze({
  /** A picture with a transparent background: extractInk takes the alpha path. */
  msPerMegapixelAlpha: 200,
  /** A picture with no transparency: every pixel is classified. */
  msPerMegapixelColour: 450,
  /**
   * How long the fixed calibration workload below takes on the reference
   * machine. MEASURED there; a machine that takes twice as long is called twice
   * as slow, and the estimate moves with it.
   */
  referenceCalibrationMs: 2.5,
  /** How far the device factor is allowed to move the answer. */
  deviceFactorMin: 0.5,
  deviceFactorMax: 20,
});

/**
 * Where one band ends and the next begins, in milliseconds.
 *
 * `quickMs` is deliberately BELOW a second rather than at it. The estimate is
 * approximate, and being told "under a second" for something that takes one and
 * a half is the kind of small dishonesty that stops people trusting the rest of
 * the sentence. Erring towards "a few seconds" costs nothing.
 */
export const COST_BANDS = Object.freeze({ quickMs: 700, fewSecondsMs: 5000 });

/**
 * How see-through a picture has to be before extractInk reads its alpha, taken
 * FROM extractInk rather than copied: the quick look has to predict the path
 * the conversion will actually take, and a second copy of that number would
 * drift the first time anyone tuned it.
 */
const ALPHA_PATH_SHARE = MEANINGFUL_ALPHA_SHARE;

/**
 * A FIXED piece of work, for measuring the machine rather than the picture.
 *
 * The first version of this timed the thumbnail's own ink extraction, and that
 * was wrong in a way worth recording: which ink path runs depends on whether
 * the picture has transparency, so the SAME machine reported a factor of 0.5
 * for a library icon and 2.4 for a photograph. It was measuring the picture.
 *
 * This is 96 x 96 pixels of opaque gray ramp - no alpha, so it always takes the
 * classifying path, and always exactly the same amount of it.
 */
function calibrationPicture() {
  const n = 96;
  const data = new Uint8ClampedArray(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = (y * n + x) * 4;
      const v = (x * 2 + y) % 256;
      data[i] = v;
      data[i + 1] = (v + 85) % 256;
      data[i + 2] = (v + 170) % 256;
      data[i + 3] = 255;
    }
  }
  return { width: n, height: n, data };
}

/**
 * How fast is this machine, against the reference? Clamped, because one sample
 * landing on a garbage collection must not turn a one-second job into a scary
 * sentence.
 */
function measureDeviceFactor(now, makeImageData) {
  const picture = calibrationPicture();
  const t0 = now();
  extractInk(picture, {
    mode: 'lineart',
    lightnessMax: INK_DEFAULTS.lightnessMax,
    chromaMax: INK_DEFAULTS.chromaMax,
    makeImageData,
  });
  const ms = now() - t0;
  return Math.min(
    COST_MODEL.deviceFactorMax,
    Math.max(COST_MODEL.deviceFactorMin, ms / COST_MODEL.referenceCalibrationMs)
  );
}

/**
 * Box-average a picture down to a thumbnail, in whole-number steps.
 *
 * The same method the pixel cap uses, for the same reason: no canvas, so it
 * works in a worker and in a test as well as in a page.
 *
 * @param {{width: number, height: number, data: Uint8ClampedArray}} pixels
 * @param {number} [edge]
 * @returns {{width: number, height: number, data: Uint8ClampedArray}}
 */
export function thumbnailOf(pixels, edge = THUMBNAIL_EDGE) {
  const factor = Math.max(
    1,
    Math.ceil(Math.max(pixels.width, pixels.height) / edge)
  );
  const w = Math.max(1, Math.floor(pixels.width / factor));
  const h = Math.max(1, Math.floor(pixels.height / factor));
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let dy = 0; dy < factor; dy++) {
        const sy = y * factor + dy;
        if (sy >= pixels.height) break;
        for (let dx = 0; dx < factor; dx++) {
          const sx = x * factor + dx;
          if (sx >= pixels.width) break;
          const o = (sy * pixels.width + sx) * 4;
          r += pixels.data[o];
          g += pixels.data[o + 1];
          b += pixels.data[o + 2];
          a += pixels.data[o + 3];
          n += 1;
        }
      }
      const d = (y * w + x) * 4;
      out[d] = r / n;
      out[d + 1] = g / n;
      out[d + 2] = b / n;
      out[d + 3] = a / n;
    }
  }
  return { width: w, height: h, data: out };
}

/** The share of pixels that are effectively see-through. */
export function transparentShare(pixels) {
  let clear = 0;
  const { data } = pixels;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 16) clear += 1;
  return data.length === 0 ? 0 : clear / (data.length / 4);
}

/**
 * A ground whose luminance spreads this much at the thumbnail scale was lit
 * by a lamp, not filled by a program (DP-79). MEASURED on every picture in
 * hand (build/dp-r6/dp-79, `dp79-ground.mjs`): the four camera pictures
 * spread 9.5 to 27.4; the nine library icons, the owner's logo and the five
 * fixtures spread 0 to 1.9, as PNGs and re-saved as JPEGs.
 */
export const CAMERA_GROUND_SPREAD_MIN = 5;

/**
 * Grain: the share of neighboring pixel pairs that differ a little (1 to 24
 * levels), the way a sensor's noise and paper's texture make every pixel
 * differ from the next, where a program's fill makes none differ and an
 * edge makes them differ a lot. MEASURED: the four camera pictures 0.22 to
 * 0.76; the icons, the logo and the fixtures 0 to 0.03 as PNGs.
 *
 * Neither signal is enough alone, and both are asked for. The logo saved as
 * a JPEG grains to 0.24 (the ringing around its lettering) with a flat
 * ground of 1.9; a clean grid of gears (the Start-and-Cancel guard's own
 * picture) has a ground that spreads 19 at the thumbnail scale, because its
 * dots mix into every thumbnail pixel, and no grain at all. On the spread
 * alone that grid was worked at 560 px and the floor dropped all 900 gears.
 */
export const CAMERA_GRAIN_MIN = 0.1;

/**
 * The grain share of a picture, from about fifty thousand sampled pairs.
 *
 * @param {{width: number, height: number, data: Uint8ClampedArray}} pixels
 * @param {number} [samples]
 * @returns {number} 0 to 1
 */
export function grainShare(pixels, samples = 50000) {
  const { width, height, data } = pixels;
  const total = width * height;
  if (!(width > 1) || !(height > 0)) return 0;
  const step = Math.max(1, Math.floor(total / samples)) | 1;
  let looked = 0;
  let grainy = 0;
  for (let p = 0; p + 1 < total; p += step) {
    if (p % width === width - 1) continue;
    const o = p * 4;
    if (data[o + 3] < 16 || data[o + 7] < 16) continue;
    const d = Math.max(
      Math.abs(data[o] - data[o + 4]),
      Math.abs(data[o + 1] - data[o + 5]),
      Math.abs(data[o + 2] - data[o + 6])
    );
    looked++;
    if (d >= 1 && d <= 24) grainy++;
  }
  return looked ? grainy / looked : 0;
}

/**
 * How unevenly the ground is lit: the luminance spread (the 10th to the 90th
 * percentile) of the thumbnail pixels within a band of the most common
 * luminance. A photograph's paper is brighter under the lamp than in the
 * corner; a drawing program's background is one number everywhere, and JPEG
 * ringing, which is a few pixels wide, is gone at the thumbnail's scale.
 *
 * @param {{width: number, height: number, data: Uint8ClampedArray}} thumb
 * @returns {number} In luminance units, 0 for a flat ground
 */
export function groundSpread(thumb) {
  const { data } = thumb;
  const lum = [];
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    lum.push(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]);
  }
  if (lum.length === 0) return 0;
  const bins = new Map();
  for (const l of lum) {
    const b = Math.round(l / 8);
    bins.set(b, (bins.get(b) || 0) + 1);
  }
  let mode = 0;
  let best = -1;
  for (const [b, n] of bins) {
    if (n > best) {
      best = n;
      mode = b;
    }
  }
  const center = mode * 8;
  const ground = lum.filter((l) => Math.abs(l - center) <= 24);
  ground.sort((a, b) => a - b);
  const at = (p) =>
    ground[Math.min(ground.length - 1, Math.floor(p * ground.length))];
  return at(0.9) - at(0.1);
}

/**
 * What kind of picture this looks like.
 *
 * Three classes, because three is what the sentences need and what the evidence
 * supports. MEASURED on the nine icons (0.49 MP, 44-92 % transparent) and an
 * 8 MP photograph (0 % transparent).
 */
function classify({ megapixels, clearShare, inkCoverage }) {
  // A transparent background is what a library icon has and a photograph never
  // does, and it is the single most reliable signal here.
  if (clearShare >= 0.2 && megapixels <= 2) return 'icon';
  // No transparency and big: a camera made it.
  if (clearShare < 0.05 && megapixels >= 2) return 'photo';
  // Drawn on paper: no transparency, but small and mostly background.
  if (clearShare < 0.05 && inkCoverage <= 0.4) return 'drawing';
  return megapixels >= 2 ? 'photo' : 'drawing';
}

/**
 * Look at a picture and say what it is and what it will cost here.
 *
 * Cheap on purpose: the thumbnail is the only pass over every pixel, and the
 * ink and trace run on about 9,000 pixels rather than millions.
 *
 * @param {{width: number, height: number, data: Uint8ClampedArray}} pixels
 * @param {object} [options]
 * @param {Function} [options.trace] - (imageData) => string; the tracer, injected
 *   so this module never pulls imagetracerjs into whatever imports it
 * @param {Function} [options.now] - clock, for tests
 * @param {number} [options.deviceFactor] - skip the calibration and use this
 * @param {Function} [options.makeImageData] - for a context with no ImageData
 * @returns {{pictureClass: string, costBand: string, seconds: number,
 *   megapixels: number, cappedMegapixels: number, clearShare: number,
 *   inkCoverage: number, thumbnailShapes: number, deviceFactor: number,
 *   willScaleDown: boolean, scaleFactor: number|null, predictedMs: number}}
 */
export function quickLook(pixels, options = {}) {
  const now = options.now || (() => performance.now());
  const makeImageData =
    options.makeImageData ||
    ((width, height) => ({
      width,
      height,
      data: new Uint8ClampedArray(width * height * 4),
    }));

  const megapixels = (pixels.width * pixels.height) / 1e6;
  const cap = IMAGE_IMPORT_LIMITS.maxPixels;
  const willScaleDown = pixels.width * pixels.height > cap;
  const scaleFactor = willScaleDown
    ? Math.ceil(Math.sqrt((pixels.width * pixels.height) / cap))
    : null;
  const cappedMegapixels = Math.min(megapixels, cap / 1e6);

  const clearShare = transparentShare(pixels);
  const thumb = thumbnailOf(pixels);

  const ink = extractInk(thumb, {
    mode: 'lineart',
    lightnessMax: INK_DEFAULTS.lightnessMax,
    chromaMax: INK_DEFAULTS.chromaMax,
    makeImageData,
  });
  let thumbnailShapes = 0;
  if (typeof options.trace === 'function') {
    const svg = options.trace(ink.imageData) || '';
    thumbnailShapes = (svg.match(/<path/g) || []).length;
  }

  const deviceFactor =
    typeof options.deviceFactor === 'number'
      ? options.deviceFactor
      : measureDeviceFactor(now, makeImageData);

  const rate =
    clearShare >= ALPHA_PATH_SHARE
      ? COST_MODEL.msPerMegapixelAlpha
      : COST_MODEL.msPerMegapixelColour;
  const predictedMs = deviceFactor * cappedMegapixels * rate;

  const costBand =
    predictedMs < COST_BANDS.quickMs
      ? 'quick'
      : predictedMs < COST_BANDS.fewSecondsMs
        ? 'few'
        : 'long';

  // DP-79: a camera made it when nothing is see-through and the ground is
  // not flat. The photo defaults (the working resolution, the median, the
  // speck floor) follow this verdict, and a file, whatever its class, never
  // gets them.
  const spread = groundSpread(thumb);
  const grain = grainShare(pixels);
  const camera =
    clearShare < 0.05 &&
    grain >= CAMERA_GRAIN_MIN &&
    spread >= CAMERA_GROUND_SPREAD_MIN;

  return {
    pictureClass: classify({
      megapixels,
      clearShare,
      inkCoverage: ink.summary.inkCoverage,
    }),
    camera,
    groundSpread: +spread.toFixed(1),
    grain: +grain.toFixed(3),
    costBand,
    seconds: Math.max(1, Math.round(predictedMs / 1000)),
    megapixels,
    cappedMegapixels,
    clearShare,
    inkCoverage: ink.summary.inkCoverage,
    thumbnailShapes,
    deviceFactor,
    willScaleDown,
    scaleFactor,
    predictedMs,
  };
}

/**
 * The sentence a person reads, built from a quick look.
 *
 * Two clauses at most, and never a warning about something they cannot act on.
 * The scale-down clause folds in the note the file control used to show
 * separately, so one sentence says the whole thing.
 *
 * STRINGS: owner review pending (DP-R4 text pack rows 9-15).
 *
 * @param {ReturnType<typeof quickLook>} look
 * @returns {string}
 */
export function quickLookSentence(look) {
  const what =
    look.pictureClass === 'icon'
      ? 'Looks like a simple icon.'
      : look.pictureClass === 'drawing'
        ? 'Looks like a line drawing.'
        : 'Looks like a photo. Icons and line drawings work best.';

  const cost =
    look.costBand === 'quick'
      ? 'Converting should take under a second.'
      : look.costBand === 'few'
        ? 'Converting should take a few seconds.'
        : `Converting may take about ${look.seconds} seconds on this device.`;

  const scaled = look.willScaleDown
    ? ` This picture is large (${look.megapixels.toFixed(1)} MP), so it will be scaled down first.`
    : '';

  return `${what} ${cost}${scaled}`;
}
