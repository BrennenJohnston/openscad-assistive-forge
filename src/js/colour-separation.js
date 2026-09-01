/**
 * Colours out of a picture: the owner's own pipeline, in the app.
 *
 * Their route to a stencil was photograph, then Photoshop posterize, then
 * Illustrator, then Fusion. This is the first two steps: quantise a picture
 * into a handful of colours and hand back an SVG whose `<path fill="#...">`
 * elements ARE the regions. That is the same shape a coloured vector drawing
 * arrives in, so `paletteFromFills` and everything after it cannot tell the
 * two apart, and a photograph and a drawing meet in the same editor.
 *
 * PORTED FROM the owner's own stencil-forge repository,
 * src/js/color-separation.js (https://github.com/BrennenJohnston/stencil-forge,
 * GPL-3.0-or-later): the deterministic k-means with histogram-prefiltered
 * farthest-point seeding, and the border-vote background pick. Two things
 * changed on the way over: a FIXED palette path, so a person who knows their
 * paint can name it and get exactly those colours; and the tracing, which
 * stencil-forge does per mask with its own tracer and which here goes through
 * imagetracerjs, already a dependency.
 *
 * ★ EACH COLOUR IS TRACED AS ITS OWN BINARY MASK, not by letting the tracer
 * quantise. MEASURED on the owner's cat: automatic 8-colour quantisation gave
 * brown 181 paths and grey 178, nearly all of them anti-alias slivers along
 * the edges between colours. One colour at a time against a plain white
 * ground gives the tracer nothing to be uncertain about, and an area floor
 * removes what is left.
 *
 * ★ THE PAPER IS A COLOUR. `filterForegroundPaths` in image-import drops the
 * lightest layer, which is right when the question is "what is drawn here"
 * and wrong when it is "what colours is this". The wall behind a stencil is a
 * first-class part of the plan - it is what "Unpainted" means - so nothing is
 * dropped here.
 *
 * @license GPL-3.0-or-later
 */

import ImageTracer from 'imagetracerjs';
import { polygonFromPathData, signedArea } from './svg-nesting.js';
import { medianFilter3x3 } from './ink-extraction.js';

/** Below this alpha a pixel is not part of the picture. */
const ALPHA_OPAQUE_MIN = 128;

/** How many colours a person may ask for. */
export const COLOUR_COUNT_MIN = 2;
export const COLOUR_COUNT_MAX = 8;

/**
 * How many extra clusters to ask for before keeping the ones that matter.
 *
 * ★ MEASURED, and it is the difference between finding the owner's cat's eyes
 * and not. Asked for six colours flat, the clustering spends its whole budget
 * on the black-to-white ramp that anti-aliasing leaves along every edge:
 * white 43.6%, black 31.1%, brown 15.9%, grey 8.5%, and then two near-greys at
 * 0.6% and 0.3%. The green eyes (1.4% of the picture) and the pink nose (1.1%)
 * never get a cluster at all - not at six, not at eight. Asked for six PLUS
 * TWO, the eight clusters cover white, black, brown, grey, GREEN, PINK and two
 * remnants, and the remnants merge back into their nearest neighbour. Same
 * cost to a tenth of a second.
 */
export const CLUSTER_OVERSHOOT = 2;

/**
 * How many median passes flatten the anti-alias ramp before clustering.
 *
 * ★ Also measured on the cat, and also load-bearing: without it, overshooting
 * finds two more shades of grey rather than the green and the pink, because
 * the ramp has more distinct colours in it than the picture does. Two passes
 * of a 3x3 median collapse the ramp and leave every region's interior exactly
 * where it was. Single-pixel detail goes too, and a stencil could not cut it
 * anyway - the area floor drops it a step later.
 */
export const PREFILTER_PASSES = 2;

/**
 * How many pixels the CLUSTERING pass looks at.
 *
 * ★ Clustering is a question about COLOURS, not about pixels, and it does not
 * get a better answer from more of them. MEASURED on the cat: the two median
 * passes that make the small colours findable cost 3,692 ms on the full
 * 316,387-pixel image and 24 ms on a 40,000-pixel sample of it, and both find
 * the same six colours - the green is 1.5% of the picture either way, which is
 * 600 pixels at this size. So the clusters are found on a sample and every
 * pixel of the real picture is then snapped to the palette that came out.
 */
export const CLUSTER_SAMPLE_PIXELS = 40000;

/**
 * The smallest region worth keeping, in PIXELS of the traced image.
 *
 * ★ Four is the floor, and it scales with how big a pixel is in millimetres.
 * A picture traced at 0.1 mm per pixel has a 4-pixel region 0.04 mm2 across,
 * which no printer or laser can make and no eye can see; the same 4 pixels at
 * 1 mm per pixel is 4 mm2, which is a real mark. The rule is therefore "at
 * least four pixels, and at least a tenth of a square millimetre", and the
 * second half is what a caller who knows the scale gets.
 *
 * @param {number} [mmPerPixel] - Millimetres one pixel will become
 * @returns {number} Area floor in square pixels
 */
export function floorPx(mmPerPixel = 0) {
  if (!(mmPerPixel > 0)) return 4;
  return Math.max(4, 0.1 / (mmPerPixel * mmPerPixel));
}

const luminance = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

const hex = (c) =>
  `#${[c.r, c.g, c.b]
    .map((v) =>
      Math.max(0, Math.min(255, Math.round(v)))
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`;

/**
 * A smaller copy of a picture in which each output pixel is the MOST COMMON
 * colour of the block it came from, not the average and not a sample.
 *
 * ★ THIS IS THE STEP THAT MAKES SMALL COLOURS FINDABLE, and three ways of
 * doing it were measured on the owner's cat before this one:
 *
 *   full image, two median passes   finds green and pink   3,692 ms
 *   sample every nth pixel          MISSES both              24 ms
 *   most common colour per block    finds green and pink     31 ms
 *
 * Sampling misses them because it keeps the anti-aliased ramp between black
 * and white at exactly the proportion it had, and the clustering then spends
 * its whole budget on shades of grey; a median applied afterwards is filtering
 * a mosaic whose neighbours were never neighbours. Averaging would INVENT
 * colours between the real ones, which is the opposite of what a step looking
 * for the real ones wants. The mode of a block is a colour that was actually
 * there, and a block straddling an edge resolves to whichever side owns more
 * of it - which is what removing a ramp means.
 *
 * The modal colour is reported as the MEAN of the pixels in its own histogram
 * bin, so a region's true colour survives rather than being rounded to the
 * bin's corner.
 *
 * @param {{width: number, height: number, data: Uint8ClampedArray}} imageData
 * @param {number} maxPixels
 * @returns {{width: number, height: number, data: Uint8ClampedArray}}
 */
export function modeDown(imageData, maxPixels) {
  const { width, height, data } = imageData;
  const pixels = width * height;
  if (pixels <= maxPixels) return imageData;
  const step = Math.ceil(Math.sqrt(pixels / maxPixels));
  const w = Math.max(1, Math.ceil(width / step));
  const h = Math.max(1, Math.ceil(height / step));
  const out = new Uint8ClampedArray(w * h * 4);
  const bin = (r, g, b) => ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
  const count = new Map();
  const sum = new Map();
  for (let by = 0; by < h; by++) {
    for (let bx = 0; bx < w; bx++) {
      count.clear();
      sum.clear();
      let alpha = 0;
      for (let y = by * step; y < Math.min(height, (by + 1) * step); y++) {
        for (let x = bx * step; x < Math.min(width, (bx + 1) * step); x++) {
          const o = (y * width + x) * 4;
          const k = bin(data[o], data[o + 1], data[o + 2]);
          count.set(k, (count.get(k) || 0) + 1);
          const acc = sum.get(k) || [0, 0, 0];
          acc[0] += data[o];
          acc[1] += data[o + 1];
          acc[2] += data[o + 2];
          sum.set(k, acc);
          if (data[o + 3] > alpha) alpha = data[o + 3];
        }
      }
      let modeKey = -1;
      let modeCount = -1;
      for (const [k, n] of count) {
        if (n > modeCount) {
          modeCount = n;
          modeKey = k;
        }
      }
      const dst = (by * w + bx) * 4;
      if (modeKey < 0) {
        out[dst + 3] = 0;
        continue;
      }
      const acc = sum.get(modeKey);
      out[dst] = acc[0] / modeCount;
      out[dst + 1] = acc[1] / modeCount;
      out[dst + 2] = acc[2] / modeCount;
      out[dst + 3] = alpha;
    }
  }
  return { width: w, height: h, data: out };
}

/**
 * Snap every pixel to the nearest colour of a palette the caller supplies.
 *
 * The deterministic path: a person who knows their paint names it, and gets
 * exactly those colours rather than whatever k-means decides is nearby.
 *
 * @param {{width: number, height: number, data: Uint8ClampedArray}} imageData
 * @param {Array<{r: number, g: number, b: number}>} palette
 * @returns {{palette: Array, assignments: Int16Array, pixelCounts: number[]}}
 */
export function snapToPalette(imageData, palette) {
  const { width, height, data } = imageData;
  const pixelCount = width * height;
  const assignments = new Int16Array(pixelCount).fill(-1);
  const pixelCounts = new Array(palette.length).fill(0);
  for (let i = 0; i < pixelCount; i++) {
    const o = i * 4;
    if (data[o + 3] < ALPHA_OPAQUE_MIN) continue;
    let best = 0;
    let bestDist = Infinity;
    for (let c = 0; c < palette.length; c++) {
      const dr = data[o] - palette[c].r;
      const dg = data[o + 1] - palette[c].g;
      const db = data[o + 2] - palette[c].b;
      const dist = dr * dr + dg * dg + db * db;
      if (dist < bestDist) {
        bestDist = dist;
        best = c;
      }
    }
    assignments[i] = best;
    pixelCounts[best] += 1;
  }
  return { palette: palette.map((c) => ({ ...c })), assignments, pixelCounts };
}

/**
 * Deterministic k-means over the opaque pixels, in RGB.
 *
 * Ported unchanged in behaviour from stencil-forge. Seeding is
 * histogram-prefiltered farthest-point rather than luminance quantiles,
 * because quantile seeds collapse on a picture with one dominant colour -
 * measured there on an antialiased bullseye, where two seeds landed inside
 * the grey wall and a small orange accent never got a cluster at all. No
 * randomness anywhere: the same picture gives the same answer.
 *
 * @param {{width: number, height: number, data: Uint8ClampedArray}} imageData
 * @param {number} colourCount - 2 to 8
 * @param {number} [iterations]
 * @param {number} [overshoot] - Extra clusters beyond colourCount; see
 *   CLUSTER_OVERSHOOT for why asking for more and merging back is what finds
 *   a colour that covers 1% of a picture
 * @returns {{palette: Array, assignments: Int16Array, pixelCounts: number[]}}
 */
export function quantise(
  imageData,
  colourCount,
  iterations = 8,
  overshoot = 0
) {
  const { width, height, data } = imageData;
  const pixelCount = width * height;
  const k =
    Math.max(
      COLOUR_COUNT_MIN,
      Math.min(COLOUR_COUNT_MAX, Math.round(colourCount))
    ) + Math.max(0, Math.round(overshoot));

  const opaque = [];
  for (let i = 0; i < pixelCount; i++) {
    if (data[i * 4 + 3] >= ALPHA_OPAQUE_MIN) opaque.push(i);
  }
  const assignments = new Int16Array(pixelCount).fill(-1);
  if (opaque.length === 0) return { palette: [], assignments, pixelCounts: [] };

  // A 4-bit-per-channel histogram, so seeding looks at COLOURS rather than at
  // pixels and a thousand near-identical pixels do not outvote a small patch.
  const bin = (r, g, b) => ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
  const binCount = new Uint32Array(4096);
  const binSum = new Float64Array(4096 * 3);
  for (const i of opaque) {
    const o = i * 4;
    const b = bin(data[o], data[o + 1], data[o + 2]);
    binCount[b] += 1;
    binSum[b * 3] += data[o];
    binSum[b * 3 + 1] += data[o + 1];
    binSum[b * 3 + 2] += data[o + 2];
  }
  const floor = Math.max(4, Math.round(opaque.length * 0.0002));
  const gather = (min) => {
    const out = [];
    for (let b = 0; b < 4096; b++) {
      if (binCount[b] >= min) {
        out.push({
          r: binSum[b * 3] / binCount[b],
          g: binSum[b * 3 + 1] / binCount[b],
          b: binSum[b * 3 + 2] / binCount[b],
          count: binCount[b],
        });
      }
    }
    return out;
  };
  // A picture small enough that every colour is rarer than the floor still
  // has colours; fall back to the raw bins rather than to nothing.
  const candidates = gather(floor).length > 0 ? gather(floor) : gather(1);

  candidates.sort((a, b) => b.count - a.count);
  const centres = [[candidates[0].r, candidates[0].g, candidates[0].b]];
  while (centres.length < k && centres.length < candidates.length) {
    let pick = null;
    let bestDist = -1;
    for (const cand of candidates) {
      let minDist = Infinity;
      for (const centre of centres) {
        const dr = cand.r - centre[0];
        const dg = cand.g - centre[1];
        const db = cand.b - centre[2];
        const d = dr * dr + dg * dg + db * db;
        if (d < minDist) minDist = d;
      }
      if (minDist > bestDist) {
        bestDist = minDist;
        pick = cand;
      }
    }
    centres.push([pick.r, pick.g, pick.b]);
  }

  const kEff = centres.length;
  const sums = new Float64Array(kEff * 3);
  const counts = new Uint32Array(kEff);
  for (let iter = 0; iter < iterations; iter++) {
    sums.fill(0);
    counts.fill(0);
    for (const i of opaque) {
      const o = i * 4;
      let best = 0;
      let bestDist = Infinity;
      for (let c = 0; c < kEff; c++) {
        const dr = data[o] - centres[c][0];
        const dg = data[o + 1] - centres[c][1];
        const db = data[o + 2] - centres[c][2];
        const d = dr * dr + dg * dg + db * db;
        if (d < bestDist) {
          bestDist = d;
          best = c;
        }
      }
      assignments[i] = best;
      sums[best * 3] += data[o];
      sums[best * 3 + 1] += data[o + 1];
      sums[best * 3 + 2] += data[o + 2];
      counts[best] += 1;
    }
    for (let c = 0; c < kEff; c++) {
      if (counts[c] > 0) {
        centres[c][0] = sums[c * 3] / counts[c];
        centres[c][1] = sums[c * 3 + 1] / counts[c];
        centres[c][2] = sums[c * 3 + 2] / counts[c];
      }
    }
  }

  const remap = new Int16Array(kEff).fill(-1);
  const palette = [];
  const pixelCounts = [];
  for (let c = 0; c < kEff; c++) {
    if (counts[c] > 0) {
      remap[c] = palette.length;
      palette.push({
        r: Math.round(centres[c][0]),
        g: Math.round(centres[c][1]),
        b: Math.round(centres[c][2]),
      });
      pixelCounts.push(counts[c]);
    }
  }
  for (const i of opaque) assignments[i] = remap[assignments[i]];
  return { palette, assignments, pixelCounts };
}

/**
 * Keep the `keep` biggest clusters and fold the rest into their nearest
 * neighbour among them.
 *
 * The overshoot above exists so a small distinct colour gets a cluster of its
 * own; this is the other half of it, which puts the leftovers back. Merging by
 * NEAREST COLOUR rather than dropping them means no pixel is left unassigned
 * and the picture still adds up to the whole picture.
 *
 * @param {{palette: Array, assignments: Int16Array, pixelCounts: number[]}} q
 * @param {number} keep
 * @returns {{palette: Array, assignments: Int16Array, pixelCounts: number[]}}
 */
export function keepLargest(q, keep) {
  const { palette, assignments, pixelCounts } = q;
  if (palette.length <= keep) return q;
  const order = palette
    .map((_, i) => i)
    .sort((a, b) => (pixelCounts[b] || 0) - (pixelCounts[a] || 0));
  const kept = order.slice(0, keep);
  const keptSet = new Set(kept);
  const remap = new Int16Array(palette.length).fill(-1);
  kept.forEach((from, to) => {
    remap[from] = to;
  });
  for (let i = 0; i < palette.length; i++) {
    if (keptSet.has(i)) continue;
    let best = 0;
    let bestDist = Infinity;
    kept.forEach((j, to) => {
      const dr = palette[i].r - palette[j].r;
      const dg = palette[i].g - palette[j].g;
      const db = palette[i].b - palette[j].b;
      const d = dr * dr + dg * dg + db * db;
      if (d < bestDist) {
        bestDist = d;
        best = to;
      }
    });
    remap[i] = best;
  }
  const counts = new Array(keep).fill(0);
  for (let i = 0; i < assignments.length; i++) {
    const a = assignments[i];
    if (a < 0) continue;
    const to = remap[a];
    assignments[i] = to;
    counts[to] += 1;
  }
  return {
    palette: kept.map((i) => ({ ...palette[i] })),
    assignments,
    pixelCounts: counts,
  };
}

/**
 * Which colour is the wall behind the stencil.
 *
 * The one most present along the BORDER of the picture, because that is where
 * the wall shows, with the lighter of a tie winning. Colour cannot answer this
 * on its own - a dark background is still a background - which is the same
 * lesson the stencil layering learned about paper.
 *
 * @param {{width: number, height: number}} size
 * @param {Int16Array} assignments
 * @param {Array} palette
 * @returns {number} Palette index, or -1 when there is no palette
 */
export function pickBackground(size, assignments, palette) {
  if (!palette || palette.length === 0) return -1;
  const { width, height } = size;
  const border = new Uint32Array(palette.length);
  const tally = (x, y) => {
    const a = assignments[y * width + x];
    if (a >= 0) border[a] += 1;
  };
  for (let x = 0; x < width; x++) {
    tally(x, 0);
    tally(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    tally(0, y);
    tally(width - 1, y);
  }
  let best = 0;
  for (let c = 1; c < palette.length; c++) {
    const lum = (i) => luminance(palette[i].r, palette[i].g, palette[i].b);
    if (
      border[c] > border[best] ||
      (border[c] === border[best] && lum(c) > lum(best))
    ) {
      best = c;
    }
  }
  return best;
}

/**
 * One binary mask per colour. NOT stacked: stacking regions into plates is
 * the colour model's job, on rings, after the person has said what goes where.
 *
 * @param {Int16Array} assignments
 * @param {number} colourCount
 * @returns {Array<Uint8Array>}
 */
export function masksFor(assignments, colourCount) {
  const masks = [];
  for (let c = 0; c < colourCount; c++)
    masks.push(new Uint8Array(assignments.length));
  for (let i = 0; i < assignments.length; i++) {
    const a = assignments[i];
    if (a >= 0 && a < colourCount) masks[a][i] = 1;
  }
  return masks;
}

/** imagetracerjs, told to see two colours and only two. */
const MASK_TRACER = {
  colorsampling: 0,
  colorquantcycles: 1,
  numberofcolors: 2,
  pal: [
    { r: 0, g: 0, b: 0, a: 255 },
    { r: 255, g: 255, b: 255, a: 255 },
  ],
  ltres: 1,
  qtres: 1,
  rightangleenhance: true,
  strokewidth: 0,
  scale: 1,
  roundcoords: 2,
  viewbox: false,
  desc: false,
  blurradius: 0,
  layering: 0,
};

/**
 * Grow a mask by one pixel in the four directions.
 *
 * ★ DP-24 P3, THE SLIVER FIX. Each colour is traced as its own mask and the
 * tracer pulls every boundary inward, so two traced neighbours did not
 * quite touch: the hairline gaps between them became 567 loose pieces on
 * the owner's cat (236 on plate 1 alone). Grown under a pixel before
 * tracing, neighbours MEET - the overlap is harmless because the paint
 * order paints over it and every region is solid by design, while a gap is
 * a sliver on a plate that nothing can cut.
 *
 * @param {Uint8Array} mask
 * @param {number} width
 * @param {number} height
 * @returns {Uint8Array}
 */
export function growMask(mask, width, height) {
  const grown = new Uint8Array(mask);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (mask[i]) continue;
      if (
        (x > 0 && mask[i - 1]) ||
        (x + 1 < width && mask[i + 1]) ||
        (y > 0 && mask[i - width]) ||
        (y + 1 < height && mask[i + width])
      ) {
        grown[i] = 1;
      }
    }
  }
  return grown;
}

/**
 * Remove connected pieces smaller than the floor, BEFORE the mask grows.
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
 * Trace one mask, and keep only the shapes that are big enough to make.
 *
 * @param {Uint8Array} mask
 * @param {{width: number, height: number}} size
 * @param {{areaFloorPx?: number, grow?: boolean}} [options] - `grow`
 *   defaults on (the sliver fix above); pass false to measure the raw mask
 * @returns {{paths: string[], dropped: number, keptArea: number}}
 */
export function traceMask(mask, size, options = {}) {
  const { width, height } = size;
  const areaFloor = options.areaFloorPx ?? 4;
  let traced = mask;
  let droppedPieces = 0;
  if (options.grow !== false) {
    traced = new Uint8Array(mask);
    droppedPieces = dropSmallPieces(traced, width, height, areaFloor);
    traced = growMask(traced, width, height);
  }
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < traced.length; i++) {
    const v = traced[i] ? 0 : 255;
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  const svg = ImageTracer.imagedataToSVG({ width, height, data }, MASK_TRACER);

  // ★ A COLOUR REGION FROM A PICTURE IS SOLID, AND THAT IS ON PURPOSE.
  //
  // The tracer writes a hole as a separate path in the OTHER colour, drawn
  // over the shape it is a hole in, so keeping only the mask-coloured paths
  // fills every hole in. Two attempts at putting the holes back were measured
  // and both were worse than leaving them out: pairing each light path with
  // its smallest dark container summed 82.7% of the canvas in holes against a
  // 68.9% outer, which is a shape with negative area; handing every ring to
  // the ring tree under even-odd gave one region of 131 subpaths and 62
  // splinters.
  //
  // Leaving them solid is not a compromise, it is the model. Every pixel of
  // the picture belongs to exactly ONE colour, so whatever is inside the hole
  // has a region of its own, in its own colour, and the paint order is what
  // decides which of the two wins: largest area first, so a big field is laid
  // down and the small shapes inside it are painted over the top. That is how
  // spraying through a stack of stencils works, and it is what the owner did
  // by hand - their plate 1 cuts the whole silhouette, black, and every later
  // plate paints over part of it.
  //
  // Where it costs something: under the "this colour only" rule a solid
  // region paints over a colour that came BEFORE it in the order. The editor
  // is where a person moves a colour later, and the island report is where
  // they are told.
  const paths = [];
  let dropped = droppedPieces;
  let keptArea = 0;
  const re = /<path[^>]*fill="rgb\((\d+),(\d+),(\d+)\)"[^>]*\sd="([^"]*)"/g;
  let m;
  while ((m = re.exec(svg)) !== null) {
    if (Number(m[1]) > 127) continue;
    const d = m[4];
    const { points } = polygonFromPathData(d);
    const area = points.length >= 3 ? Math.abs(signedArea(points)) : 0;
    if (area < areaFloor) {
      dropped += 1;
      continue;
    }
    keptArea += area;
    paths.push(d);
  }
  return { paths, dropped, keptArea };
}

/**
 * A picture, separated into colours, as an SVG a person can paint from.
 *
 * @param {{width: number, height: number, data: Uint8ClampedArray}} imageData
 * @param {object} [options]
 * @param {number} [options.count] - How many colours to find
 * @param {Array<{r,g,b}>} [options.palette] - Or exactly which colours
 * @param {number|null} [options.backgroundIndex] - Or let the border decide
 * @param {number} [options.mmPerPixel] - For the area floor
 * @param {Function} [options.nameFor] - Colour to plain-language name
 * @returns {{svg: string, colours: Array, droppedTotal: number}}
 */
export function separateColours(imageData, options = {}) {
  const { width, height } = imageData;
  const wanted = options.count ?? 6;
  const passes = options.prefilterPasses ?? PREFILTER_PASSES;
  let quantised;
  if (options.palette) {
    quantised = snapToPalette(imageData, options.palette);
  } else {
    let sample = modeDown(
      imageData,
      options.samplePixels ?? CLUSTER_SAMPLE_PIXELS
    );
    // A median on top of the mode, for a picture already small enough that
    // modeDown returned it unchanged.
    if (sample === imageData && passes > 0) {
      const make = (w, h) => ({
        width: w,
        height: h,
        data: new Uint8ClampedArray(w * h * 4),
      });
      for (let i = 0; i < passes; i++) sample = medianFilter3x3(sample, make);
    }
    const found = keepLargest(
      quantise(sample, wanted, 8, options.overshoot ?? CLUSTER_OVERSHOOT),
      wanted
    );
    // Found on a sample, applied to every pixel: the palette is the answer,
    // and the sample was only ever a way to reach it.
    quantised = snapToPalette(imageData, found.palette);
  }
  const { palette, assignments, pixelCounts } = quantised;
  if (palette.length === 0) {
    return { svg: '', colours: [], droppedTotal: 0 };
  }
  const background =
    options.backgroundIndex === null || options.backgroundIndex === undefined
      ? pickBackground({ width, height }, assignments, palette)
      : options.backgroundIndex;
  const areaFloorPx = floorPx(options.mmPerPixel);
  const masks = masksFor(assignments, palette.length);

  const colours = [];
  let droppedTotal = 0;
  let body = '';
  // Largest first, so the biggest field is the first thing in the file and a
  // person reading the list meets the colours in the order they will paint.
  const order = palette
    .map((c, i) => i)
    .sort((a, b) => (pixelCounts[b] || 0) - (pixelCounts[a] || 0));
  for (const i of order) {
    const { paths, dropped, keptArea } = traceMask(
      masks[i],
      { width, height },
      {
        areaFloorPx,
        // Instrumentation only: growMasks: false measures the raw masks
        // the sliver fix exists for. The app never passes it.
        grow: options.growMasks !== false,
      }
    );
    droppedTotal += dropped;
    const fill = hex(palette[i]);
    const name = options.nameFor ? options.nameFor(palette[i]) : fill;
    colours.push({
      index: i,
      hex: fill,
      name,
      isBackground: i === background,
      pixels: pixelCounts[i] || 0,
      share: (pixelCounts[i] || 0) / (width * height),
      shapes: paths.length,
      dropped,
      areaPx: keptArea,
    });
    for (const d of paths) {
      body +=
        `<path fill="${fill}" fill-rule="evenodd" ` +
        `data-colour="${fill}" data-colour-name="${name}"` +
        (i === background ? ' data-background="true"' : '') +
        ` d="${d}"/>`;
    }
  }
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}">${body}</svg>`;
  return { svg, colours, droppedTotal };
}
