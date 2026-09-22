/**
 * Ink extraction: getting line work out of a colored picture.
 *
 * WHY THIS EXISTS. Forge traces a raster image by quantizing it to two colors
 * and keeping the darker bucket. That works for a dark drawing on light paper.
 * It fails, silently, on the pictures communication symbols are actually made
 * of: black line work over a saturated fill, where the fill color carries
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
 * work is dark AND gray; a blue fill is dark and very much not gray. Separating
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
 * - `lineart`: keep what is dark AND close to gray. Black strokes over a
 *   colored field survive; the field does not.
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
  /** C* at or below this may be ink. 0 is a perfect gray. */
  chromaMax: 25,
  chromaRange: [2, 80],
  // How many flat colors the Colors mode looks for. Six is what the
  // owner's own cat needs for its painted colors; the picture also has a
  // second black along its outlines, so seven finds every one of them. A
  // color that was never found cannot be taken out later, so the help
  // text says to ask for more rather than fewer.
  colourCount: 6,
  colourCountRange: [2, 8],
};

/**
 * A picture with this share of partly-transparent pixels is treated as having
 * a real alpha channel, so transparency decides the shape rather than color.
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
 * far more reliably than its colors do.
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
 * A 3x3 median over each color channel. JPEG ringing puts speckles of color
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

  // The nine values are sorted in place by insertion, with nothing allocated
  // per pixel. MEASURED (DP-79 P0b) on a 1331 x 1200 photograph: the sort by
  // Array.prototype.slice and sort took 8,847 ms, this 413 ms, the output
  // identical byte for byte. The median is on for every camera picture now,
  // and a photograph at the cap is 2 MP.
  for (let y = 0; y < height; y++) {
    const y0 = y > 0 ? y - 1 : 0;
    const y2 = y < height - 1 ? y + 1 : y;
    for (let x = 0; x < width; x++) {
      const x0 = x > 0 ? x - 1 : 0;
      const x2 = x < width - 1 ? x + 1 : x;
      const target = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        window[0] = data[(y0 * width + x0) * 4 + channel];
        window[1] = data[(y0 * width + x) * 4 + channel];
        window[2] = data[(y0 * width + x2) * 4 + channel];
        window[3] = data[(y * width + x0) * 4 + channel];
        window[4] = data[target + channel];
        window[5] = data[(y * width + x2) * 4 + channel];
        window[6] = data[(y2 * width + x0) * 4 + channel];
        window[7] = data[(y2 * width + x) * 4 + channel];
        window[8] = data[(y2 * width + x2) * 4 + channel];
        for (let i = 1; i < 9; i++) {
          const v = window[i];
          let j = i - 1;
          while (j >= 0 && window[j] > v) {
            window[j + 1] = window[j];
            j--;
          }
          window[j + 1] = v;
        }
        out.data[target + channel] = window[4];
      }
      out.data[target + 3] = data[target + 3];
    }
  }
  return out;
}

/**
 * The smallest region worth keeping, in PIXELS of the traced image.
 *
 * ★ Four is the floor, and it scales with how big a pixel is in millimeters.
 * A picture traced at 0.1 mm per pixel has a 4-pixel region 0.04 mm2 across,
 * which no printer or laser can make and no eye can see; the same 4 pixels at
 * 1 mm per pixel is 4 mm2, which is a real mark. The rule is therefore "at
 * least four pixels, and at least a tenth of a square millimeter", and the
 * second half is what a caller who knows the scale gets. Written for the
 * color separation, and since DP-79 the ink modes' speck floor as well; it
 * lives here so the trace worker's ink road reaches it without the tracer.
 *
 * @param {number} [mmPerPixel] - Millimeters one pixel will become
 * @returns {number} Area floor in square pixels
 */
export function floorPx(mmPerPixel = 0) {
  if (!(mmPerPixel > 0)) return 4;
  return Math.max(4, 0.1 / (mmPerPixel * mmPerPixel));
}

/**
 * Remove connected pieces smaller than the floor, BEFORE a mask grows.
 *
 * ★ Growth alone resurrected what the floor exists to drop: a stray
 * anti-alias pixel grew into a five-pixel cross and sailed over the
 * four-pixel floor - MEASURED on the owner's cat, the shape count exploded
 * from under eighty to 1,853. So the too-small pieces leave the MASK first,
 * counted, and only what was already worth keeping gets to grow.
 *
 * @param {Uint8Array} mask - Cleaned in place
 * @param {number} width
 * @param {number} height
 * @param {number} floorPx
 * @returns {number} How many pieces were removed
 */
export function dropSmallPieces(mask, width, height, floorPx) {
  const seen = new Uint8Array(mask.length);
  const stack = [];
  const piece = [];
  let dropped = 0;
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    stack.length = 0;
    piece.length = 0;
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop();
      piece.push(i);
      const x = i % width;
      if (x > 0 && mask[i - 1] && !seen[i - 1]) {
        seen[i - 1] = 1;
        stack.push(i - 1);
      }
      if (x + 1 < width && mask[i + 1] && !seen[i + 1]) {
        seen[i + 1] = 1;
        stack.push(i + 1);
      }
      if (i >= width && mask[i - width] && !seen[i - width]) {
        seen[i - width] = 1;
        stack.push(i - width);
      }
      if (i + width < mask.length && mask[i + width] && !seen[i + width]) {
        seen[i + width] = 1;
        stack.push(i + width);
      }
    }
    if (piece.length < floorPx) {
      for (const i of piece) mask[i] = 0;
      dropped += 1;
    }
  }
  return dropped;
}

/**
 * A morphological close: dilate `radius` times, then erode `radius` times,
 * four-connected. It bridges a gap up to twice the radius wide and fills a
 * hole up to that size, and leaves everything larger where it was. DP-79
 * runs it on a camera picture's Solid shape at 0.1 mm, where crayon leaves
 * gaps in a fill that the eye reads as one object.
 *
 * @param {Uint8Array} mask - 0 or 1 per pixel; not changed
 * @param {number} width
 * @param {number} height
 * @param {number} radius - Passes, in pixels
 * @returns {Uint8Array} A new mask
 */
export function closeMask(mask, width, height, radius) {
  const passes = Math.max(0, Math.round(radius));
  let current = mask;
  const dilate = (m) => {
    const out = new Uint8Array(m);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (m[i]) continue;
        if (
          (x > 0 && m[i - 1]) ||
          (x + 1 < width && m[i + 1]) ||
          (y > 0 && m[i - width]) ||
          (y + 1 < height && m[i + width])
        ) {
          out[i] = 1;
        }
      }
    }
    return out;
  };
  const erode = (m) => {
    const out = new Uint8Array(m);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (!m[i]) continue;
        if (
          x === 0 ||
          y === 0 ||
          x + 1 === width ||
          y + 1 === height ||
          !m[i - 1] ||
          !m[i + 1] ||
          !m[i - width] ||
          !m[i + width]
        ) {
          out[i] = 0;
        }
      }
    }
    return out;
  };
  for (let k = 0; k < passes; k++) current = dilate(current);
  for (let k = 0; k < passes; k++) current = erode(current);
  return current === mask ? new Uint8Array(mask) : current;
}

/**
 * Which pixels are ink, as a flat Uint8Array of 0 or 1.
 *
 * @param {ImageData} imageData
 * @param {Object} options
 * @param {number} options.lightnessMax
 * @param {number} options.chromaMax
 * @param {boolean} [options.useAlpha] - Treat transparency as the shape
 * @param {boolean} [options.invert] - The ink is the LIGHT side of the
 *   lightness line: a light drawing over a dark ground (D-139)
 * @returns {Uint8Array}
 */
export function inkMask(
  imageData,
  { lightnessMax, chromaMax, useAlpha = false, invert = false }
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
    // D-139: on a light drawing over a dark ground the INK is the light
    // side of the line. The chroma gate still runs, and runs on the side
    // that was chosen, which is the whole point: it used to throw the
    // colored ground away first, leaving nothing over half the picture for
    // the old inversion rule to notice.
    const dark = invert ? L > lightnessMax : L <= lightnessMax;
    mask[p] = dark && chroma <= chromaMax ? 1 : 0;
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
 * The color a picture's rejected fills were, so the app can suggest printing
 * the plate in it. Averages the pixels the ink gate turned down that were
 * colorful enough to be a fill rather than paper.
 *
 * `coherence` is what keeps the suggestion honest. A symbol with one blue
 * field averages to that blue. A card with yellow, blue, green and red fields
 * averages to mud - MEASURED on the Fitzgerald fixture: rgb(155,134,69), a
 * color that appears nowhere in it. Coherence is the share of rejected
 * pixels actually near the mean, so the caller can decline to suggest anything
 * when the picture has no single fill color.
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
 * @returns {{imageData: ImageData, mask: Uint8Array|null, summary: Object}}
 */
/**
 * Put a see-through picture on a white page before anybody traces it.
 *
 * Standard mode keeps a picture's own colors and does not build an ink mask,
 * so a PNG with transparency reached the tracer with its alpha intact and the
 * tracer decided for itself what a see-through pixel was. What it decided was
 * not white, and a logo saved on a transparent background came out with a
 * field around it that nobody drew. Compositing first is the signed answer
 * (DP-Q31, audit 15): the picture is put on white, which is what a person
 * looking at it in any viewer has already seen.
 *
 * Reports whether it did anything, because "see-through parts were treated as
 * white" is worth saying and is a lie on a picture that had none.
 *
 * @param {ImageData} imageData
 * @param {Function} [makeImageData] - (w, h) => ImageData
 * @returns {{imageData: ImageData, composited: boolean}}
 */
/**
 * How thin the thinnest lines in a drawing are, in picture pixels.
 *
 * A charm is fourteen millimeters across and a 0.4 mm nozzle cannot lay a line
 * thinner than about half a millimeter. MEASURED on nine stock icons, their
 * outlines land between 0.31 and 0.65 mm at that size - some of them print and
 * some of them do not, and nothing in the app said which was which.
 *
 * The measurement is a distance transform: for every ink pixel, how far it is
 * from the nearest paper. On the RIDGE of a stroke - the pixels that are local
 * maxima of that distance - twice the distance is the stroke's width there.
 * Taking the tenth percentile of those widths rather than the smallest guards
 * against a single ragged pixel deciding the answer for a whole drawing.
 *
 * Chamfer 3-4 rather than true Euclidean distance: two passes instead of a
 * search, about 4% error on the diagonal, and this number becomes "about 0.3
 * mm" in a sentence. Exactness here would cost time and change nothing said.
 *
 * @param {Uint8Array} mask one byte per pixel, non-zero is ink
 * @param {number} width
 * @param {number} height
 * @param {object} [options]
 * @param {number} [options.ignoreBelowY] leave rows at or below this out of
 *   the answer, for a picture whose bottom band is a caption
 * @returns {{p10: number, p50: number, ridgePx: number}} widths in pixels
 */
export function lineWidthPercentiles(mask, width, height, options = {}) {
  const none = { p10: 0, p50: 0, ridgePx: 0 };
  if (!mask || !(width > 0) || !(height > 0)) return none;
  // A band to leave out of the answer. The credit line a stock icon carries is
  // letter strokes a couple of pixels across, and it is the thinnest thing in
  // most icons - so without this the advisory describes a caption that has
  // already been taken off the drawing and says a charm will not print
  // because of lettering that is not on it. An e2e caught exactly that: the
  // ring fixture, whose stroke is thirty pixels, reported 0.06 mm.
  const ignoreBelowY =
    options.ignoreBelowY > 0 ? options.ignoreBelowY : Infinity;

  const INF = 1e9;
  const d = new Float32Array(width * height);
  for (let i = 0; i < d.length; i++) d[i] = mask[i] ? INF : 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!mask[i]) continue;
      let v = d[i];
      if (x > 0) v = Math.min(v, d[i - 1] + 3);
      if (y > 0) {
        v = Math.min(v, d[i - width] + 3);
        if (x > 0) v = Math.min(v, d[i - width - 1] + 4);
        if (x < width - 1) v = Math.min(v, d[i - width + 1] + 4);
      }
      d[i] = v;
    }
  }
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const i = y * width + x;
      if (!mask[i]) continue;
      let v = d[i];
      if (x < width - 1) v = Math.min(v, d[i + 1] + 3);
      if (y < height - 1) {
        v = Math.min(v, d[i + width] + 3);
        if (x < width - 1) v = Math.min(v, d[i + width + 1] + 4);
        if (x > 0) v = Math.min(v, d[i + width - 1] + 4);
      }
      d[i] = v;
    }
  }

  const widths = [];
  const lastRow = Math.min(height - 1, Math.ceil(ignoreBelowY));
  for (let y = 1; y < lastRow; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      if (!mask[i]) continue;
      const v = d[i];
      if (
        v < d[i - 1] ||
        v < d[i + 1] ||
        v < d[i - width] ||
        v < d[i + width]
      ) {
        continue;
      }
      // 2d - 1, not 2d. A distance transform measures centre-to-nearest-PAPER
      // PIXEL, so a stroke three pixels across reads d = 2 and 2d would call
      // it four. Subtracting one is exact on odd widths and one pixel low on
      // even ones, and low is the right direction for an advisory: this
      // number decides whether a person is warned that a line may not print,
      // and erring thick would let a line that cannot print go unmentioned.
      // One pixel is 0.02 mm on a 700 px icon at charm size.
      widths.push(Math.max(0, (2 * v) / 3 - 1));
    }
  }
  if (widths.length === 0) return none;
  widths.sort((a, b) => a - b);
  const at = (p) =>
    widths[Math.min(widths.length - 1, Math.floor(p * widths.length))];
  return {
    p10: +at(0.1).toFixed(2),
    p50: +at(0.5).toFixed(2),
    ridgePx: widths.length,
  };
}

export function compositeOntoWhite(
  imageData,
  makeImageData = defaultMakeImageData
) {
  const { width, height, data } = imageData;
  let sawAlpha = false;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 255) {
      sawAlpha = true;
      break;
    }
  }
  if (!sawAlpha) return { imageData, composited: false };

  const out = makeImageData(width, height);
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3] / 255;
    out.data[i] = Math.round(data[i] * a + 255 * (1 - a));
    out.data[i + 1] = Math.round(data[i + 1] * a + 255 * (1 - a));
    out.data[i + 2] = Math.round(data[i + 2] * a + 255 * (1 - a));
    out.data[i + 3] = 255;
  }
  return { imageData: out, composited: true };
}

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
      // Standard keeps the picture's own colors, so there is no one-bit mask
      // to hand anybody. Said with a null rather than left absent.
      mask: null,
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

  let mask =
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
  } else if (mode === 'lineart' && !useAlpha && coverage <= COVERAGE_WARN_LOW) {
    // ★ D-139: NOTHING PASSED BOTH GATES, so try the other side of the
    // lightness line before giving up.
    //
    // The rule above asks whether the ink covers more than half the picture,
    // and on the owner's CREATE logo - white lettering on a navy ground - it
    // could never fire: the chroma gate rejects the navy first (chroma 45
    // against a limit of 25), so the ink was nothing at all, 0 % coverage,
    // and the app emitted an 85-byte empty drawing and called it ready.
    //
    // Deciding on LIGHTNESS ALONE is not the answer either, and a measurement
    // says why: the AAC blue-field card is mostly dark by lightness, and
    // turning it around throws away the dark glyph that is its whole point.
    // What is special about the logo is not that it is dark - it is that
    // NOTHING SURVIVED, which is the one case where the other side is worth
    // a look. The swap is taken only when it finds a drawing rather than a
    // page: a blank picture's light side covers everything, and everything is
    // not a drawing.
    const other = inkMask(source, {
      lightnessMax,
      chromaMax,
      useAlpha,
      invert: true,
    });
    const otherCoverage = maskCoverage(other);
    if (otherCoverage > coverage && otherCoverage <= 0.5) {
      mask = other;
      coverage = otherCoverage;
      inverted = true;
    }
  }

  if (coverage <= COVERAGE_WARN_LOW) {
    warnings.push('near-empty');
  } else if (coverage >= COVERAGE_WARN_HIGH) {
    warnings.push('near-full');
  }

  return {
    imageData: maskToImageData(mask, width, height, makeImageData),
    // The mask itself, one byte per pixel, non-zero for ink. The picture above
    // is the same thing painted black on white for a tracer that wants pixels;
    // an engine that wants a bitmap should have the bitmap, not a round trip
    // through it.
    mask,
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
