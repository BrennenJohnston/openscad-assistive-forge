// Canvas-based character painter module
//
// Replaces the <pre> textContent overlay with a <canvas> element so each
// character can be drawn with an individual phosphor colour derived from
// the source image luminance at that cell's centre.

/**
 * Detect whether the current mono theme is the amber (light) variant.
 *
 * Phase 1 guarantees `data-theme` is always 'light' or 'dark' (never absent),
 * but we fall back to the system color-scheme preference defensively in case
 * the attribute is read before theme-manager initializes.
 *
 * @returns {boolean}
 */
function _isAmberTheme() {
  const attr = document.documentElement.getAttribute('data-theme');
  if (attr === 'light' || attr === 'dark') return attr === 'light';
  return !window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * Map a source-image luminance value [0, 1] to a phosphor colour string.
 * Green theme : authentic P31 phosphor (pure green channel)
 * Amber theme : authentic P3 phosphor (warm amber — #FFB000 at full brightness)
 *
 * A small minimum luminance floor (0.08) keeps dark cells subtly visible so
 * the overlay does not produce invisible blank spots.
 *
 * @param {number} lum - perceived luminance in [0, 1]
 * @param {boolean} amber - true for amber phosphor, false for green
 * @returns {string} CSS colour string
 */
function _phosphorColor(lum, amber) {
  const l = Math.max(0.08, lum); // floor prevents invisible dark chars
  if (amber) {
    // #FFB000 at full: rgb(255, 176, 0)
    return `rgb(${Math.round(l * 255)},${Math.round(l * 176)},0)`;
  }
  return `rgb(0,${Math.round(l * 255)},0)`;
}

/**
 * Create and attach an accessible, pointer-transparent <canvas> overlay
 * positioned to cover the preview container identically to the old <pre>.
 *
 * Also creates a second off-screen persistence canvas used by §4d afterglow.
 * If the persistence canvas cannot be created (e.g. memory pressure) the
 * returned `persistCanvas`/`persistCtx` will be null — `paintFrame` degrades
 * gracefully to hard-clear in that case.
 *
 * @param {HTMLElement} container - the preview container element
 * @returns {{
 *   canvas: HTMLCanvasElement,
 *   ctx: CanvasRenderingContext2D,
 *   persistCanvas: HTMLCanvasElement|null,
 *   persistCtx: CanvasRenderingContext2D|null
 * }}
 */
export function createOverlay(container) {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = `
    position: absolute;
    inset: 0;
    margin: 0;
    padding: 0;
    overflow: hidden;
    background: var(--color-bg-primary, #000);
    user-select: none;
    pointer-events: none;
    display: none;
    z-index: 5;
  `;
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  let persistCanvas = null;
  let persistCtx = null;
  try {
    persistCanvas = document.createElement('canvas');
    persistCtx = persistCanvas.getContext('2d');
    if (!persistCtx) {
      persistCanvas = null;
    }
  } catch (_) {
    persistCanvas = null;
    persistCtx = null;
  }

  return { canvas, ctx, persistCanvas, persistCtx };
}

/**
 * Resize the overlay canvas (and optional persistence canvas) to match new
 * container dimensions. Should be called whenever the container resizes.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {number} width - container pixel width
 * @param {number} height - container pixel height
 * @param {HTMLCanvasElement|null} [persistCanvas]
 */
export function resizeOverlay(canvas, width, height, persistCanvas) {
  canvas.width = width;
  canvas.height = height;
  if (persistCanvas) {
    persistCanvas.width = width;
    persistCanvas.height = height;
  }
}

/**
 * Sample per-cell phosphor colour strings from the downsampled source image.
 *
 * Reads the average luminance at each cell's centre pixel from the flat
 * Uint8ClampedArray returned by ctx.getImageData().data.
 *
 * @param {Uint8ClampedArray} imgData - RGBA pixel data from the sample canvas
 * @param {number} imgW - width of the sample canvas in pixels
 * @param {number} cellW - cell width in sample-canvas pixels
 * @param {number} cellH - cell height in sample-canvas pixels
 * @param {number} cols
 * @param {number} rows
 * @param {boolean} [amber] - true for amber phosphor (defaults to theme detection)
 * @returns {string[]} flat array [row * cols + col] of css colour strings
 */
export const QUANT_LEVELS = 32;
const _QUANT_STEP = 1 / QUANT_LEVELS;

export function sampleColors(imgData, imgW, cellW, cellH, cols, rows, amber) {
  const useAmber = amber !== undefined ? amber : _isAmberTheme();
  const colors = new Array(rows * cols);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const px = Math.min(imgW - 1, Math.round((c + 0.5) * cellW));
      const py = Math.min(
        // imgH is implied by imgData.length / (imgW * 4)
        imgData.length / (imgW * 4) - 1,
        Math.round((r + 0.5) * cellH)
      );
      const idx = (py * imgW + px) * 4;
      // perceived luminance (ITU-R BT.709)
      const lum =
        (0.2126 * imgData[idx] +
          0.7152 * imgData[idx + 1] +
          0.0722 * imgData[idx + 2]) /
        255;
      // Quantize to QUANT_LEVELS discrete levels to collapse ~5K unique colors to ≤32
      const qLum = Math.round(lum / _QUANT_STEP) * _QUANT_STEP;
      colors[r * cols + c] = _phosphorColor(qLum, useAmber);
    }
  }
  return colors;
}

/**
 * Paint one frame of ASCII art onto the canvas.
 *
 * Each character in `chars` is rendered with the pre-computed phosphor colour
 * from the corresponding entry in `colors`. Assumes canvas dimensions have
 * already been set to (cols * charW) × (rows * charH) via resizeOverlay().
 *
 * §4d Phosphor afterglow: when `persistCanvas`/`persistCtx` are provided and
 * `persistFade` > 0, the previous frame stored in `persistCanvas` is composited
 * on top of the new frame at `persistFade` opacity, producing the characteristic
 * cool-retro-term trail. The result is then copied back to `persistCanvas`.
 *
 * Degrades gracefully: if `persistCanvas` is null, falls back to the original
 * hard-clear behaviour regardless of `persistFade`.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string[]} chars - flat array [row * cols + col] of single characters
 * @param {string[]} colors - flat array of CSS colour strings (same indexing)
 * @param {number} cols
 * @param {number} rows
 * @param {number} charW - character cell width in overlay pixels
 * @param {number} charH - character cell height in overlay pixels
 * @param {string} fontStr - full CSS font string, e.g. '10px ui-monospace'
 * @param {HTMLCanvasElement|null} [persistCanvas] - off-screen persistence canvas
 * @param {CanvasRenderingContext2D|null} [persistCtx]
 * @param {number} [persistFade=0] - blending factor 0 (no trail) → 1 (never fades)
 */
export function paintFrame(
  ctx,
  chars,
  colors,
  cols,
  rows,
  charW,
  charH,
  fontStr,
  persistCanvas,
  persistCtx,
  persistFade
) {
  const fade =
    persistCanvas && persistCtx && typeof persistFade === 'number'
      ? Math.max(0, Math.min(1, persistFade))
      : 0;

  // 1. Draw new frame
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.font = fontStr;
  ctx.textBaseline = 'top';

  // Group cells by color to minimize fillStyle switches (≤QUANT_LEVELS changes vs ~5K)
  const colorGroups = new Map();
  for (let i = 0; i < chars.length; i++) {
    const color = colors[i];
    let group = colorGroups.get(color);
    if (!group) {
      group = [];
      colorGroups.set(color, group);
    }
    group.push(i);
  }
  for (const [color, indices] of colorGroups) {
    ctx.fillStyle = color;
    for (const i of indices) {
      const col = i % cols;
      const row = (i / cols) | 0;
      ctx.fillText(chars[i], (col * charW) | 0, (row * charH) | 0);
    }
  }

  if (fade > 0) {
    // 2. Composite previous persistence frame on top at fade opacity
    const prevAlpha = ctx.globalAlpha;
    ctx.globalAlpha = fade;
    ctx.drawImage(persistCanvas, 0, 0);
    ctx.globalAlpha = prevAlpha;

    // 3. Copy combined result back to persistence canvas for next frame
    persistCtx.clearRect(0, 0, persistCanvas.width, persistCanvas.height);
    persistCtx.drawImage(ctx.canvas, 0, 0);
  }
}
