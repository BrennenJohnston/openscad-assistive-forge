/**
 * Ink extraction: getting line work out of a coloured picture.
 *
 * WHY THIS EXISTS. Forge traces a raster image by quantizing it to two colours
 * and keeping the darker bucket. That works for a dark drawing on light paper.
 * It fails, silently, on the pictures communication symbols are actually made
 * of: black line work over a saturated fill, where the fill colour carries
 * meaning (Fitzgerald coding). MEASURED on the shipped tracer with the fixtures
 * in `tests/fixtures/aac/`: a black person glyph inside a blue rounded square
 * traced to ONE path - the blue square. The glyph was gone, and nothing said
 * so.
 *
 * The mechanism is luminance. Rec.601 luma puts yellow near 226 and blue near
 * 88, so a yellow fill lands in the paper bucket (its line work survives, by
 * luck) while blue, green and red land in the ink bucket alongside the black
 * drawn on top of them, and the two become one shape.
 *
 * WHAT THIS DOES. It runs BEFORE the tracer and decides what counts as ink,
 * using lightness and colourfulness rather than luminance alone. Black line
 * work is dark AND grey; a blue fill is dark and very much not grey. Separating
 * on both keeps the drawing and rejects the field.
 *
 * The output is an ImageData of black on white, which the existing
 * imagetracerjs -> SVG -> preparer chain consumes unchanged. There is no new
 * dependency, no grid emitter, and nothing here touches the vector path.
 *
 * @license GPL-3.0-or-later
 */

/**
 * How a picture is turned into ink.
 *
 * - `lineart`: keep what is dark AND close to grey. Black strokes over a
 *   coloured field survive; the field does not.
 * - `silhouette`: keep the whole outer shape, filled. Detail inside is lost on
 *   purpose - for very small pieces where detail could not be felt anyway.
 * - `standard`: no extraction at all. What Forge did before this existed.
 */
export const INK_MODES = ['lineart', 'silhouette', 'standard', 'colours'];

/** The starting point for the two thresholds, and the limits a slider allows. */
export const INK_DEFAULTS = {
  /** L* at or below this may be ink. 0 is black, 100 is white. */
  lightnessMax: 55,
  lightnessRange: [10, 90],
  /** C* at or below this may be ink. 0 is a perfect grey. */
  chromaMax: 25,
  chromaRange: [2, 80],
  // How many flat colours the Colours mode looks for. Six is what the
  // owner's own cat needs for its painted colours; the picture also has a
  // second black along its outlines, so seven finds every one of them. A
  // colour that was never found cannot be taken out later, so the help
  // text says to ask for more rather than fewer.
  colourCount: 6,
  colourCountRange: [2, 8],
};

/**
 * A picture with this share of partly-transparent pixels is treated as having
 * a real alpha channel, so transparency decides the shape rather than colour.
 */
export const MEANINGFUL_ALPHA_SHARE = 0.02;

/** Warn when the result is almost nothing or almost everything. */
export const COVERAGE_WARN_LOW = 0.002;
export const COVERAGE_WARN_HIGH = 0.6;

const SRGB_TO_XYZ = [
  [0.4124564, 0.3575761, 0.1804375],
  [0.2126729, 0.7151522, 0.072175],
  [0.0193339, 0.119192, 0.9503041],
];

// D65, the white point sRGB is defined against.
const WHITE_X = 0.95047;
const WHITE_Y = 1.0;
const WHITE_Z = 1.08883;

function srgbChannelToLinear(value) {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function labF(t) {
  return t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29;
}

/**
 * Convert an sRGB triple to CIE L*a*b*.
 *
 * Lightness and colourfulness are what this module separates on, and sRGB
 * gives neither directly: #1f5fbf and #4a4a4a have similar luma and could not
 * be more different to look at.
 *
 * @param {number} r 0-255
 * @param {number} g 0-255
 * @param {number} b 0-255
 * @returns {{L: number, a: number, b: number, chroma: number}}
 */
export function srgbToLab(r, g, b) {
  const rl = srgbChannelToLinear(r);
  const gl = srgbChannelToLinear(g);
  const bl = srgbChannelToLinear(b);

  const x =
    (SRGB_TO_XYZ[0][0] * rl + SRGB_TO_XYZ[0][1] * gl + SRGB_TO_XYZ[0][2] * bl) /
    WHITE_X;
  const y =
    (SRGB_TO_XYZ[1][0] * rl + SRGB_TO_XYZ[1][1] * gl + SRGB_TO_XYZ[1][2] * bl) /
    WHITE_Y;
  const z =
    (SRGB_TO_XYZ[2][0] * rl + SRGB_TO_XYZ[2][1] * gl + SRGB_TO_XYZ[2][2] * bl) /
    WHITE_Z;

  const fx = labF(x);
  const fy = labF(y);
  const fz = labF(z);

  const L = 116 * fy - 16;
  const A = 500 * (fx - fy);
  const B = 200 * (fy - fz);
  return { L, a: A, b: B, chroma: Math.sqrt(A * A + B * B) };
}

/**
 * The share of pixels that are neither fully opaque nor fully transparent, or
 * fully transparent. A picture cut out on transparency says what its shape is
 * far more reliably than its colours do.
 *
 * @param {ImageData} imageData
 * @returns {number} 0-1
 */
export function alphaShare(imageData) {
  const { data } = imageData;
  let counted = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 250) counted++;
  }
  return counted / (data.length / 4);
}

/**
 * Otsu's threshold over a 256-bin histogram: the split that leaves the two
 * sides as internally similar as possible.
 *
 * @param {number[]|Uint32Array} histogram - 256 counts
 * @returns {number} 0-255, or -1 when every pixel is the same value
 */
export function otsuThreshold(histogram) {
  let total = 0;
  let sum = 0;
  for (let i = 0; i < 256; i++) {
    total += histogram[i];
    sum += i * histogram[i];
  }
  if (total === 0) return -1;

  let sumB = 0;
  let weightB = 0;
  let best = -1;
  let bestVariance = -1;

  for (let t = 0; t < 256; t++) {
    weightB += histogram[t];
    if (weightB === 0) continue;
    const weightF = total - weightB;
    if (weightF === 0) break;

    sumB += t * histogram[t];
    const meanB = sumB / weightB;
    const meanF = (sum - sumB) / weightF;
    const variance = weightB * weightF * (meanB - meanF) ** 2;
    if (variance > bestVariance) {
      bestVariance = variance;
      best = t;
    }
  }
  return best;
}

/**
 * Lightness histogram of an image, in 0-255 bins over L*.
 * @param {ImageData} imageData
 * @returns {Uint32Array}
 */
export function lightnessHistogram(imageData) {
  const { data } = imageData;
  const histogram = new Uint32Array(256);
  for (let i = 0; i < data.length; i += 4) {
    const { L } = srgbToLab(data[i], data[i + 1], data[i + 2]);
    const bin = Math.max(0, Math.min(255, Math.round((L / 100) * 255)));
    histogram[bin]++;
  }
  return histogram;
}

/**
 * A 3x3 median over each colour channel. JPEG ringing puts speckles of colour
 * along a black stroke, and a chroma gate would otherwise punch holes in it.
 *
 * NOT on by default, and this is why: a median over a 3x3 window removes any
 * feature thinner than half the window, so it erases a one-pixel stroke along
 * with the speckles. On a line drawing that is the whole picture. It is offered
 * as `denoise` for photographs, where strokes are many pixels wide and the
 * ringing is real.
 *
 * @param {ImageData} imageData
 * @param {Function} makeImageData - (w, h) => ImageData
 * @returns {ImageData}
 */
export function medianFilter3x3(imageData, makeImageData) {
  const { width, height, data } = imageData;
  const out = makeImageData(width, height);
  const window = new Uint8Array(9);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const target = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const sy = Math.min(height - 1, Math.max(0, y + dy));
          for (let dx = -1; dx <= 1; dx++) {
            const sx = Math.min(width - 1, Math.max(0, x + dx));
            window[n++] = data[(sy * width + sx) * 4 + channel];
          }
        }
        const sorted = Array.prototype.slice
          .call(window, 0, n)
          .sort((a, b) => a - b);
        out.data[target + channel] = sorted[4];
      }
      out.data[target + 3] = data[target + 3];
    }
  }
  return out;
}

/**
 * Which pixels are ink, as a flat Uint8Array of 0 or 1.
 *
 * @param {ImageData} imageData
 * @param {Object} options
 * @param {number} options.lightnessMax
 * @param {number} options.chromaMax
 * @param {boolean} [options.useAlpha] - Treat transparency as the shape
 * @returns {Uint8Array}
 */
export function inkMask(
  imageData,
  { lightnessMax, chromaMax, useAlpha = false }
) {
  const { data } = imageData;
  const mask = new Uint8Array(data.length / 4);

  for (let p = 0, i = 0; i < data.length; i += 4, p++) {
    const alpha = data[i + 3];
    if (useAlpha) {
      mask[p] = alpha >= 128 ? 1 : 0;
      continue;
    }
    if (alpha < 128) {
      // Flatten what is left over white: a transparent pixel shows paper.
      mask[p] = 0;
      continue;
    }
    const { L, chroma } = srgbToLab(data[i], data[i + 1], data[i + 2]);
    mask[p] = L <= lightnessMax && chroma <= chromaMax ? 1 : 0;
  }
  return mask;
}

/**
 * Everything the outside cannot reach, filled in. A four-way flood from the
 * border over pixels that look like background; whatever is left is the shape.
 *
 * @param {ImageData} imageData
 * @param {Object} options
 * @param {number} options.lightnessMax - Above this, a pixel may be background
 * @returns {Uint8Array} 0 or 1 per pixel
 */
export function silhouetteMask(imageData, { lightnessMax }) {
  const { width, height, data } = imageData;
  const count = width * height;
  const outside = new Uint8Array(count);
  const backgroundish = new Uint8Array(count);

  for (let p = 0, i = 0; p < count; p++, i += 4) {
    if (data[i + 3] < 128) {
      backgroundish[p] = 1;
      continue;
    }
    const { L } = srgbToLab(data[i], data[i + 1], data[i + 2]);
    backgroundish[p] = L > lightnessMax ? 1 : 0;
  }

  const stack = [];
  const push = (p) => {
    if (!outside[p] && backgroundish[p]) {
      outside[p] = 1;
      stack.push(p);
    }
  };
  for (let x = 0; x < width; x++) {
    push(x);
    push((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    push(y * width);
    push(y * width + width - 1);
  }

  while (stack.length > 0) {
    const p = stack.pop();
    const x = p % width;
    const y = (p - x) / width;
    if (x > 0) push(p - 1);
    if (x < width - 1) push(p + 1);
    if (y > 0) push(p - width);
    if (y < height - 1) push(p + width);
  }

  const mask = new Uint8Array(count);
  for (let p = 0; p < count; p++) mask[p] = outside[p] ? 0 : 1;
  return mask;
}

/**
 * How many separate pieces a mask has, four-connected.
 * @param {Uint8Array} mask
 * @param {number} width
 * @param {number} height
 * @returns {number}
 */
export function componentCount(mask, width, height) {
  const seen = new Uint8Array(mask.length);
  let components = 0;
  const stack = [];

  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    components++;
    seen[start] = 1;
    stack.push(start);
    while (stack.length > 0) {
      const p = stack.pop();
      const x = p % width;
      const y = (p - x) / width;
      const visit = (q) => {
        if (mask[q] && !seen[q]) {
          seen[q] = 1;
          stack.push(q);
        }
      };
      if (x > 0) visit(p - 1);
      if (x < width - 1) visit(p + 1);
      if (y > 0) visit(p - width);
      if (y < height - 1) visit(p + width);
    }
  }
  return components;
}

/**
 * Paint a mask as black on white, which is what the tracer expects.
 *
 * @param {Uint8Array} mask
 * @param {number} width
 * @param {number} height
 * @param {Function} makeImageData - (w, h) => ImageData
 * @returns {ImageData}
 */
export function maskToImageData(mask, width, height, makeImageData) {
  const out = makeImageData(width, height);
  for (let p = 0, i = 0; p < mask.length; p++, i += 4) {
    const value = mask[p] ? 0 : 255;
    out.data[i] = value;
    out.data[i + 1] = value;
    out.data[i + 2] = value;
    out.data[i + 3] = 255;
  }
  return out;
}

/** How close to the mean a rejected pixel must be to count as the same fill. */
export const REJECTED_COLOR_TOLERANCE = 30;

/**
 * The colour a picture's rejected fills were, so the app can suggest printing
 * the plate in it. Averages the pixels the ink gate turned down that were
 * colourful enough to be a fill rather than paper.
 *
 * `coherence` is what keeps the suggestion honest. A symbol with one blue
 * field averages to that blue. A card with yellow, blue, green and red fields
 * averages to mud - MEASURED on the Fitzgerald fixture: rgb(155,134,69), a
 * colour that appears nowhere in it. Coherence is the share of rejected
 * pixels actually near the mean, so the caller can decline to suggest anything
 * when the picture has no single fill colour.
 *
 * @param {ImageData} imageData
 * @param {Uint8Array} mask - The ink mask; rejected pixels are the 0s
 * @param {number} [minChroma]
 * @returns {{r: number, g: number, b: number, share: number, coherence: number}|null}
 */
export function dominantRejectedColor(imageData, mask, minChroma = 25) {
  const { data } = imageData;
  const labs = [];
  let r = 0;
  let g = 0;
  let b = 0;

  for (let p = 0, i = 0; p < mask.length; p++, i += 4) {
    if (mask[p] || data[i + 3] < 128) continue;
    const lab = srgbToLab(data[i], data[i + 1], data[i + 2]);
    if (lab.chroma < minChroma) continue;
    labs.push(lab);
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
  }
  const n = labs.length;
  if (n === 0) return null;

  const mean = srgbToLab(
    Math.round(r / n),
    Math.round(g / n),
    Math.round(b / n)
  );
  let near = 0;
  for (const lab of labs) {
    const dL = lab.L - mean.L;
    const da = lab.a - mean.a;
    const db = lab.b - mean.b;
    if (Math.sqrt(dL * dL + da * da + db * db) <= REJECTED_COLOR_TOLERANCE) {
      near++;
    }
  }

  return {
    r: Math.round(r / n),
    g: Math.round(g / n),
    b: Math.round(b / n),
    share: n / mask.length,
    coherence: near / n,
  };
}

/**
 * Turn a picture into the black-on-white the tracer wants, and say what
 * happened while doing it.
 *
 * @param {ImageData} imageData
 * @param {Object} [options]
 * @param {'lineart'|'silhouette'|'standard'} [options.mode]
 * @param {number} [options.lightnessMax] - Omit for an automatic threshold
 * @param {number} [options.chromaMax]
 * @param {boolean} [options.denoise] - Run a 3x3 median first. For photographs
 *   only: it erases strokes thinner than two pixels. See medianFilter3x3.
 * @param {Function} [options.makeImageData] - (w, h) => ImageData, for tests
 * @returns {{imageData: ImageData, summary: Object}}
 */
export function extractInk(imageData, options = {}) {
  const {
    mode = 'lineart',
    chromaMax = INK_DEFAULTS.chromaMax,
    denoise = false,
    makeImageData = defaultMakeImageData,
  } = options;

  if (mode === 'standard') {
    return {
      imageData,
      summary: {
        mode,
        applied: false,
        inkCoverage: null,
        components: null,
        warnings: [],
        rejectedColor: null,
        lightnessMax: null,
        chromaMax: null,
      },
    };
  }

  const { width, height } = imageData;
  const useAlpha = alphaShare(imageData) >= MEANINGFUL_ALPHA_SHARE;
  const source = denoise
    ? medianFilter3x3(imageData, makeImageData)
    : imageData;

  let lightnessMax = options.lightnessMax;
  if (lightnessMax === undefined || lightnessMax === null) {
    const otsu = otsuThreshold(lightnessHistogram(source));
    lightnessMax = otsu < 0 ? INK_DEFAULTS.lightnessMax : (otsu / 255) * 100;
  }

  const mask =
    mode === 'silhouette'
      ? silhouetteMask(source, { lightnessMax })
      : inkMask(source, { lightnessMax, chromaMax, useAlpha });

  const warnings = [];
  let coverage = maskCoverage(mask);

  // A picture drawn light-on-dark comes out inside-out. Flipping it is right
  // far more often than keeping a nearly-solid page of ink.
  let inverted = false;
  if (mode === 'lineart' && !useAlpha && coverage > 0.5) {
    for (let p = 0; p < mask.length; p++) mask[p] = mask[p] ? 0 : 1;
    coverage = maskCoverage(mask);
    inverted = true;
  }

  if (coverage <= COVERAGE_WARN_LOW) {
    warnings.push('near-empty');
  } else if (coverage >= COVERAGE_WARN_HIGH) {
    warnings.push('near-full');
  }

  return {
    imageData: maskToImageData(mask, width, height, makeImageData),
    summary: {
      mode,
      applied: true,
      inkCoverage: coverage,
      components: componentCount(mask, width, height),
      warnings,
      inverted,
      usedAlpha: useAlpha,
      denoised: denoise,
      rejectedColor:
        mode === 'lineart' ? dominantRejectedColor(source, mask) : null,
      lightnessMax,
      chromaMax,
    },
  };
}

function maskCoverage(mask) {
  let n = 0;
  for (let p = 0; p < mask.length; p++) n += mask[p];
  return n / mask.length;
}

function defaultMakeImageData(width, height) {
  if (typeof ImageData === 'function') {
    return new ImageData(width, height);
  }
  throw new Error(
    'No ImageData constructor available; pass options.makeImageData'
  );
}
