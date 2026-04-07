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
 * @returns {Promise<string>} Clean SVG string with foreground paths only
 */
export async function convertPngToSvg(dataUrl, options = {}) {
  const imageData = await loadImageData(dataUrl);

  const validation = validateImageDimensions(imageData.width, imageData.height);
  if (!validation.ok) {
    throw new Error(
      `Image too large: ${validation.pixels.toLocaleString()} pixels ` +
        `(max ${IMAGE_IMPORT_LIMITS.maxPixels.toLocaleString()})`
    );
  }

  const tracerOptions = { ...TRACER_OPTIONS, ...options };
  const svgString = ImageTracer.imagedataToSVG(imageData, tracerOptions);

  return filterForegroundPaths(svgString);
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
    let hex = fillString.slice(1);
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
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
