// Canvas-based character painter module
//
// Replaces the <pre> textContent overlay with a <canvas> element so each
// character can be drawn with an individual phosphor colour derived from
// the source image luminance at that cell's centre.

/**
 * Detect whether the current mono theme is the amber (light) variant.
 * @returns {boolean}
 */
function _isAmberTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light'
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
  const l = Math.max(0.08, lum) // floor prevents invisible dark chars
  if (amber) {
    // #FFB000 at full: rgb(255, 176, 0)
    return `rgb(${Math.round(l * 255)},${Math.round(l * 176)},0)`
  }
  return `rgb(0,${Math.round(l * 255)},0)`
}

/**
 * Create and attach an accessible, pointer-transparent <canvas> overlay
 * positioned to cover the preview container identically to the old <pre>.
 *
 * @param {HTMLElement} container - the preview container element
 * @returns {{ canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D }}
 */
export function createOverlay(container) {
  const canvas = document.createElement('canvas')
  canvas.setAttribute('aria-hidden', 'true')
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
  `
  container.appendChild(canvas)
  const ctx = canvas.getContext('2d')
  return { canvas, ctx }
}

/**
 * Resize the overlay canvas to match new container dimensions.
 * Should be called whenever the container resizes.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {number} width - container pixel width
 * @param {number} height - container pixel height
 */
export function resizeOverlay(canvas, width, height) {
  canvas.width = width
  canvas.height = height
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
export function sampleColors(imgData, imgW, cellW, cellH, cols, rows, amber) {
  const useAmber = amber !== undefined ? amber : _isAmberTheme()
  const colors = new Array(rows * cols)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const px = Math.min(imgW - 1, Math.round((c + 0.5) * cellW))
      const py = Math.min(
        // imgH is implied by imgData.length / (imgW * 4)
        (imgData.length / (imgW * 4)) - 1,
        Math.round((r + 0.5) * cellH)
      )
      const idx = (py * imgW + px) * 4
      // perceived luminance (ITU-R BT.709)
      const lum = (0.2126 * imgData[idx] + 0.7152 * imgData[idx + 1] + 0.0722 * imgData[idx + 2]) / 255
      colors[r * cols + c] = _phosphorColor(lum, useAmber)
    }
  }
  return colors
}

/**
 * Paint one frame of ASCII art onto the canvas.
 *
 * Each character in `chars` is rendered with the pre-computed phosphor colour
 * from the corresponding entry in `colors`. Assumes canvas dimensions have
 * already been set to (cols * charW) × (rows * charH) via resizeOverlay().
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string[]} chars - flat array [row * cols + col] of single characters
 * @param {string[]} colors - flat array of CSS colour strings (same indexing)
 * @param {number} cols
 * @param {number} rows
 * @param {number} charW - character cell width in overlay pixels
 * @param {number} charH - character cell height in overlay pixels
 * @param {string} fontStr - full CSS font string, e.g. '10px ui-monospace'
 */
export function paintFrame(ctx, chars, colors, cols, rows, charW, charH, fontStr) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  ctx.font = fontStr
  ctx.textBaseline = 'top'

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c
      ctx.fillStyle = colors[i]
      ctx.fillText(chars[i], c * charW, r * charH)
    }
  }
}
