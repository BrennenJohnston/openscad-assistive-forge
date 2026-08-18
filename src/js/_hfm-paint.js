/**
 * @license GPL-3.0-or-later
 */
// Canvas painter for the alternate ASCII view.
//
// Glyphs are pre-rendered once into a single-row atlas tinted with the
// current phosphor color (--color-accent), then painted per frame with
// drawImage blits. The atlas is the single source of truth for glyph
// placement: shape vectors are computed from the same bitmap that gets
// painted, so glyphs always align with the shapes they were matched
// against.

/** Printable ASCII 32-126 (95 glyphs) — stakeholder directive: ASCII only. */
export const GLYPH_COUNT = 95;
export const FIRST_CHAR_CODE = 32;
/** Atlas index of the space character (blank cell — skipped when painting). */
export const SPACE_INDEX = 0;

/**
 * Read the phosphor color from the active theme.
 * Green (#00ff00) in the dark variant, amber (#ffb000) in light — both are
 * carried by --color-accent under [data-ui-variant='mono'].
 *
 * @returns {string} CSS color
 */
export function getPhosphorColor() {
  try {
    const val = getComputedStyle(document.documentElement)
      .getPropertyValue('--color-accent')
      .trim();
    if (val) return val;
  } catch (_) {
    // getComputedStyle unavailable (headless test environment)
  }
  return '#00ff00';
}

/**
 * Build a glyph atlas: one offscreen canvas containing all 95 printable
 * ASCII glyphs in a single row, each centered in its own cell and tinted
 * with the given color.
 *
 * Cells are sized at device-pixel resolution (charW/charH are CSS px,
 * multiplied by dpr) so painting is a 1:1 blit on HiDPI displays.
 *
 * @param {Object} opts
 * @param {string} opts.fontFamily
 * @param {number} opts.fontSizePx - font size in CSS px
 * @param {number} opts.charW - character cell width in CSS px
 * @param {number} opts.charH - character cell height in CSS px
 * @param {number} opts.dpr - device pixel ratio (clamp before calling)
 * @param {string} opts.color - phosphor tint color
 * @returns {{ canvas: HTMLCanvasElement, cellW: number, cellH: number,
 *             dpr: number, color: string }}
 */
export function buildGlyphAtlas({
  fontFamily,
  fontSizePx,
  charW,
  charH,
  dpr,
  color,
}) {
  const cellW = Math.max(1, Math.round(charW * dpr));
  const cellH = Math.max(1, Math.round(charH * dpr));

  const canvas = document.createElement('canvas');
  canvas.width = GLYPH_COUNT * cellW;
  canvas.height = cellH;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${fontSizePx * dpr}px ${fontFamily}`;

  for (let i = 0; i < GLYPH_COUNT; i++) {
    const ch = String.fromCharCode(FIRST_CHAR_CODE + i);
    ctx.fillText(ch, i * cellW + cellW / 2, cellH / 2);
  }

  return { canvas, cellW, cellH, dpr, color };
}

/**
 * Create and attach an accessible, pointer-transparent <canvas> overlay
 * positioned to cover the preview container.
 *
 * Also creates an off-screen persistence canvas used by the optional
 * afterglow effect. If it cannot be created the returned persistCanvas /
 * persistCtx are null and paintFrame degrades to hard-clear.
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
  canvas.className = 'hfm-overlay-canvas';
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
 * Resize the overlay canvas (and optional persistence canvas) with a
 * DPR-aware backing store: the bitmap is cssW*dpr x cssH*dpr while the
 * element is styled at CSS size, keeping glyphs crisp on HiDPI displays.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {number} cssW - container width in CSS px
 * @param {number} cssH - container height in CSS px
 * @param {number} dpr - device pixel ratio (clamp before calling)
 * @param {HTMLCanvasElement|null} [persistCanvas]
 */
export function resizeOverlay(canvas, cssW, cssH, dpr, persistCanvas) {
  const w = Math.max(1, Math.round(cssW * dpr));
  const h = Math.max(1, Math.round(cssH * dpr));
  canvas.width = w;
  canvas.height = h;
  if (canvas.style) {
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
  }
  if (persistCanvas) {
    persistCanvas.width = w;
    persistCanvas.height = h;
  }
}

/**
 * Paint one frame of ASCII art by blitting glyphs from the atlas.
 *
 * Blank cells (space) are skipped — typically most of the frame. Destination
 * coordinates are truncated to integers to keep glyph edges crisp.
 *
 * Afterglow: when persistCanvas/persistCtx are provided and persistFade > 0,
 * the previous frame is composited on top at persistFade opacity and the
 * combined result is copied back for the next frame. Degrades gracefully to
 * hard-clear when the persistence canvas is unavailable.
 *
 * Palette mode (CW-6): pass `colorLayers` and each cell blits from the atlas
 * of its palette color instead of the single-atlas argument. Callers without
 * it get the exact single-color behavior they always had.
 *
 * @param {CanvasRenderingContext2D} ctx - overlay 2D context (DPR-sized)
 * @param {Int16Array|number[]} glyphIndices - flat [row * cols + col] atlas indices
 * @param {number} cols
 * @param {number} rows
 * @param {{ canvas: HTMLCanvasElement, cellW: number, cellH: number, dpr: number }} atlas
 * @param {number} charW - character cell width in CSS px
 * @param {number} charH - character cell height in CSS px
 * @param {HTMLCanvasElement|null} [persistCanvas]
 * @param {CanvasRenderingContext2D|null} [persistCtx]
 * @param {number} [persistFade=0] - 0 (no trail) to 1 (never fades)
 * @param {{ indices: Int8Array|number[], atlases: Array<{canvas: HTMLCanvasElement}> }} [colorLayers]
 *   per-cell palette indices + one atlas per palette color (all atlases share
 *   the base atlas's cell metrics)
 */
export function paintFrame(
  ctx,
  glyphIndices,
  cols,
  rows,
  atlas,
  charW,
  charH,
  persistCanvas,
  persistCtx,
  persistFade,
  colorLayers
) {
  const fade =
    persistCanvas && persistCtx && typeof persistFade === 'number'
      ? Math.max(0, Math.min(1, persistFade))
      : 0;

  const { canvas: atlasCanvas, cellW, cellH, dpr } = atlas;
  const stepX = charW * dpr;
  const stepY = charH * dpr;
  const colorIndices = colorLayers?.indices ?? null;
  const colorAtlases = colorLayers?.atlases ?? null;

  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  for (let row = 0; row < rows; row++) {
    const base = row * cols;
    const dy = (row * stepY) | 0;
    for (let col = 0; col < cols; col++) {
      const cell = base + col;
      const idx = glyphIndices[cell];
      if (idx === SPACE_INDEX) continue;
      const source =
        colorAtlases && colorIndices
          ? (colorAtlases[colorIndices[cell]]?.canvas ?? atlasCanvas)
          : atlasCanvas;
      ctx.drawImage(
        source,
        idx * cellW,
        0,
        cellW,
        cellH,
        (col * stepX) | 0,
        dy,
        cellW,
        cellH
      );
    }
  }

  if (fade > 0) {
    const prevAlpha = ctx.globalAlpha;
    ctx.globalAlpha = fade;
    ctx.drawImage(persistCanvas, 0, 0);
    ctx.globalAlpha = prevAlpha;

    persistCtx.clearRect(0, 0, persistCanvas.width, persistCanvas.height);
    persistCtx.drawImage(ctx.canvas, 0, 0);
  }
}

// ---------------------------------------------------------------------------
// Palette mode helpers (CW-6) — pure math, unit-tested directly
// ---------------------------------------------------------------------------

/**
 * Parse a #rrggbb hex color into RGB in [0, 1].
 * @param {string} css
 * @returns {[number, number, number]}
 */
export function parsePaletteColor(css) {
  const m = /^#([0-9a-f]{6})$/i.exec(String(css).trim());
  if (!m) return [1, 1, 1];
  const v = parseInt(m[1], 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

/**
 * Normalize a color by its max component, so hue survives darkening —
 * a fog-dimmed red cell still points at the red palette entry.
 * @param {[number, number, number]} rgb
 * @returns {[number, number, number]}
 */
export function normalizeChroma([r, g, b]) {
  const max = Math.max(r, g, b);
  if (max < 1e-6) return [0, 0, 0];
  return [r / max, g / max, b / max];
}

/**
 * Nearest palette entry for a cell's average color, compared in
 * chroma-normalized space.
 *
 * `chromaBoost` (> 1) raises the normalized non-max channels to a power,
 * exaggerating mild tints before matching: a softly warm wall then lands on
 * the red entry instead of white, while genuinely achromatic cells
 * ([1,1,1]) are unchanged. Needed because scene tints keep their chroma
 * low so the MONOCHROME modes stay luminance-true.
 *
 * @param {number} r - cell average red in [0, 1]
 * @param {number} g
 * @param {number} b
 * @param {Array<[number, number, number]>} normalizedPalette - entries
 *   pre-normalized with normalizeChroma()
 * @param {number} [chromaBoost=1]
 * @returns {number} palette index
 */
export function pickPaletteIndex(r, g, b, normalizedPalette, chromaBoost = 1) {
  const max = Math.max(r, g, b);
  let nr = max < 1e-6 ? 0 : r / max;
  let ng = max < 1e-6 ? 0 : g / max;
  let nb = max < 1e-6 ? 0 : b / max;
  if (chromaBoost !== 1) {
    nr = Math.pow(nr, chromaBoost);
    ng = Math.pow(ng, chromaBoost);
    nb = Math.pow(nb, chromaBoost);
  }

  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < normalizedPalette.length; i++) {
    const [pr, pg, pb] = normalizedPalette[i];
    const dr = nr - pr;
    const dg = ng - pg;
    const db = nb - pb;
    const dist = dr * dr + dg * dg + db * db;
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}
