/**
 * Image Import Module
 *
 * PNG/JPG-to-SVG vectorization for the file parameter pipeline.
 * Uses imagetracerjs (Unlicense) for raster-to-vector conversion.
 *
 * Library selection rationale (OSS-first search, 2026-03-18):
 *   - potrace-js 0.0.6: unmaintained since 2017, 127 downloads/wk
 *   - imagetracerjs 1.2.6: 41.8K downloads/wk, Unlicense, pure JS, sync API
 *   - esm-potrace-wasm 0.4.1: 2.5K downloads/wk, GPL-2.0, WASM dependency
 *   Selected imagetracerjs for broad adoption, permissive license, and
 *   synchronous imagedataToSVG() that avoids WASM init complexity.
 *
 * @license GPL-3.0-or-later
 */

import ImageTracer from 'imagetracerjs';
import { hexToRgb } from './color-utils.js';

/**
 * Hard and soft limits for image pixel counts.
 * maxPixels: reject outright. warnPixels: show advisory to user.
 */
export const IMAGE_IMPORT_LIMITS = {
  maxPixels: 2_000_000,
  warnPixels: 500_000,
};

/**
 * imagetracerjs options tuned for monochrome logo tracing.
 * posterized1 preset (2 colors) with stroke disabled.
 */
const TRACER_OPTIONS = {
  colorsampling: 0,
  numberofcolors: 2,
  pathomit: 8,
  ltres: 1,
  qtres: 1,
  rightangleenhance: true,
  strokewidth: 0,
  scale: 1,
  roundcoords: 1,
  viewbox: false,
  desc: false,
  blurradius: 0,
};

/**
 * Validate image dimensions against import limits.
 *
 * @param {number} width
 * @param {number} height
 * @returns {{ width: number, height: number, pixels: number, ok: boolean, warning?: string }}
 */
export function validateImageDimensions(width, height) {
  const pixels = width * height;
  const ok = pixels <= IMAGE_IMPORT_LIMITS.maxPixels;
  const warning =
    pixels > IMAGE_IMPORT_LIMITS.warnPixels && ok
      ? `Image is large (${(pixels / 1_000_000).toFixed(1)} megapixels). Conversion may take a moment.`
      : undefined;
  return { width, height, pixels, ok, warning };
}

/**
 * Convert a raster image (PNG/JPG) data URL to an SVG string.
 *
 * The pipeline: data URL → Image → Canvas → ImageData → imagetracerjs → SVG.
 * Background paths (the lightest color layer) are stripped so OpenSCAD
 * imports only the foreground geometry.
 *
 * @param {string} dataUrl - Image as a data URL
 * @param {Object} [options] - Override tracer options (merged with defaults)
 * @param {Object} [options.ink] - Ink-extraction settings; see convertImageDataToSvg
 * @returns {Promise<string>} Clean SVG string with foreground paths only
 */
export async function convertPngToSvg(dataUrl, options = {}) {
  const imageData = await loadImageData(dataUrl);
  const { svg } = await convertImageDataToSvg(imageData, options);
  return svg;
}

/**
 * Trace already-loaded pixels, optionally deciding what counts as ink first.
 *
 * Split out from convertPngToSvg so a mode change can re-trace the SAME pixels
 * without re-decoding the file, and so the ink summary can reach the UI.
 *
 * @param {ImageData} imageData
 * @param {Object} [options] - Tracer overrides
 * @param {Object|null} [options.ink] - Passed to extractInk; omit or set
 *   `{ mode: 'standard' }` for the original behaviour
 * @returns {Promise<{svg: string, summary: Object|null}>}
 */
export async function convertImageDataToSvg(imageData, options = {}) {
  const { ink, ...tracerOverrides } = options;

  // ★ A PICTURE TOO BIG TO TRACE IS MADE SMALLER, NOT REFUSED. The cap exists
  // because tracing cost grows with pixels, and a photograph off a phone is
  // several times over it. Refusing it made the person go and find an image
  // editor; scaling it down loses detail no stencil could cut anyway. The
  // factor is SAID, because a person who scaled their own picture on purpose
  // needs to know it was scaled again.
  let pixels = imageData;
  let downscale = null;
  if (imageData.width * imageData.height > IMAGE_IMPORT_LIMITS.maxPixels) {
    downscale = downscaleToCap(imageData);
    pixels = downscale.imageData;
  }

  const validation = validateImageDimensions(pixels.width, pixels.height);
  if (!validation.ok) {
    throw new Error(
      `Image too large: ${validation.pixels.toLocaleString()} pixels ` +
        `(max ${IMAGE_IMPORT_LIMITS.maxPixels.toLocaleString()})`
    );
  }

  // The Colours mode does not trace ink at all: it separates the picture into
  // flat colours and hands back regions with their fills, which is the shape a
  // coloured vector drawing already arrives in. filterForegroundPaths is
  // deliberately NOT applied - it drops the lightest layer, and here the
  // lightest layer is usually the wall, which is a first-class part of a
  // stencil plan rather than something to throw away.
  if (ink && ink.mode === 'colours') {
    const { separateColours } = await import('./colour-separation.js');
    const { colourLabel } = await import('./stencil-colours.js');
    const wall =
      ink.wallColour && ink.wallColour !== 'auto' ? ink.wallColour : null;
    const first = separateColours(pixels, {
      count: ink.colourCount ?? 6,
      mmPerPixel: ink.mmPerPixel ?? 0,
      nameFor: (c) =>
        colourLabel(
          `#${[c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`
        ),
    });
    // A wall the person chose is applied by re-running with that colour named
    // as the background, so the separation and the choice cannot disagree.
    const chosen = wall
      ? first.colours.findIndex(
          (c) => c.hex.toLowerCase() === wall.toLowerCase()
        )
      : -1;
    const result =
      chosen >= 0
        ? separateColours(pixels, {
            count: ink.colourCount ?? 6,
            mmPerPixel: ink.mmPerPixel ?? 0,
            backgroundIndex: first.colours[chosen].index,
            nameFor: (c) =>
              colourLabel(
                `#${[c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`
              ),
          })
        : first;
    return {
      svg: result.svg,
      summary: {
        mode: 'colours',
        colours: result.colours,
        droppedTotal: result.droppedTotal,
        ...(downscale ? { downscale } : {}),
      },
    };
  }

  let summary = null;

  if (ink && ink.mode && ink.mode !== 'standard') {
    // Lazy: nobody pays for the extractor until a picture actually needs it.
    const { extractInk } = await import('./ink-extraction.js');
    const extracted = extractInk(imageData, ink);
    pixels = extracted.imageData;
    summary = extracted.summary;
  }

  const tracerOptions = { ...TRACER_OPTIONS, ...tracerOverrides };
  const svgString = ImageTracer.imagedataToSVG(pixels, tracerOptions);

  return {
    svg: filterForegroundPaths(svgString),
    summary: downscale && summary ? { ...summary, downscale } : summary,
  };
}

/**
 * Shrink a picture until it is inside the pixel cap, by whole-number steps.
 *
 * Whole-number steps and a box average: a fractional resample would need a
 * canvas, and this has to work in a worker and in a test as well as in a
 * page. The average is right here, unlike in the colour clustering, because
 * what comes out is going to be TRACED - a blend along an edge is a softer
 * edge, not a phantom colour that gets its own plate.
 *
 * @param {{width: number, height: number, data: Uint8ClampedArray}} imageData
 * @param {number} [cap]
 * @returns {{imageData: object, factor: number, from: number, to: number}}
 */
export function downscaleToCap(imageData, cap = IMAGE_IMPORT_LIMITS.maxPixels) {
  const { width, height, data } = imageData;
  const from = width * height;
  const factor = Math.ceil(Math.sqrt(from / cap));
  const w = Math.max(1, Math.floor(width / factor));
  const h = Math.max(1, Math.floor(height / factor));
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
        if (sy >= height) break;
        for (let dx = 0; dx < factor; dx++) {
          const sx = x * factor + dx;
          if (sx >= width) break;
          const o = (sy * width + sx) * 4;
          r += data[o];
          g += data[o + 1];
          b += data[o + 2];
          a += data[o + 3];
          n += 1;
        }
      }
      const dst = (y * w + x) * 4;
      out[dst] = r / n;
      out[dst + 1] = g / n;
      out[dst + 2] = b / n;
      out[dst + 3] = a / n;
    }
  }
  return {
    imageData: { width: w, height: h, data: out },
    factor,
    from,
    to: w * h,
  };
}

/**
 * Load a data URL into an ImageData object via an off-screen canvas.
 * Requires main-thread execution (Canvas API).
 *
 * @param {string} dataUrl
 * @returns {Promise<ImageData>}
 */
export function loadImageData(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas 2D context unavailable'));
          return;
        }
        ctx.drawImage(img, 0, 0);
        resolve(ctx.getImageData(0, 0, img.width, img.height));
      } catch (err) {
        reject(new Error(`Failed to extract image data: ${err.message}`));
      }
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = dataUrl;
  });
}

/**
 * Compute perceptual luminance from an rgb() or hex fill string.
 * Uses the ITU-R BT.601 luma formula.
 *
 * @param {string} fillString - CSS color value (rgb(...) or #hex)
 * @returns {number} Luminance 0-255
 */
export function parseLuminance(fillString) {
  const rgbMatch = fillString.match(
    /rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i
  );
  if (rgbMatch) {
    const r = Number(rgbMatch[1]);
    const g = Number(rgbMatch[2]);
    const b = Number(rgbMatch[3]);
    return 0.299 * r + 0.587 * g + 0.114 * b;
  }

  if (fillString.startsWith('#')) {
    const rgb = hexToRgb(fillString);
    if (rgb) {
      const [r, g, b] = rgb;
      return 0.299 * r + 0.587 * g + 0.114 * b;
    }
  }

  return 0;
}

/**
 * Filter an SVG string to keep only foreground (dark) paths.
 *
 * imagetracerjs outputs paths for all color layers including the background.
 * For OpenSCAD import, we want only the foreground geometry.
 * Paths whose fill luminance exceeds 200 and matches the lightest layer
 * are removed.
 *
 * @param {string} svgString - Raw SVG from imagetracerjs
 * @returns {string} SVG with background paths removed
 */
export function filterForegroundPaths(svgString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, 'image/svg+xml');
  const svg = doc.querySelector('svg');
  if (!svg) return svgString;

  const paths = Array.from(svg.querySelectorAll('path'));
  if (paths.length === 0) return svgString;

  const luminances = paths.map((path) => ({
    path,
    luminance: parseLuminance(path.getAttribute('fill') || ''),
  }));

  const maxLuminance = Math.max(...luminances.map((p) => p.luminance));

  luminances.forEach(({ path, luminance }) => {
    if (luminance >= maxLuminance && luminance > 200) {
      path.parentNode.removeChild(path);
    }
  });

  const serializer = new XMLSerializer();
  return serializer.serializeToString(svg);
}
