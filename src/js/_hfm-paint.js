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
  normalizeTinyAlpha = false,
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

  if (normalizeTinyAlpha) _restoreTinyGlyphBrightness(ctx, canvas, charW);

  return { canvas, cellW, cellH, dpr, color };
}

/**
 * Give a tiny atlas back the brightness the rasterizer took from it (CW-12).
 *
 * A glyph drawn into a 2x4 pixel cell is almost entirely antialiasing: MEASURED
 * on the owner's machine, the strongest pixel in a 3 px atlas reaches alpha 164
 * of 255, and 188 at 4 px, against a solid 255 at 12 px and above. Everything
 * the converter paints at the smallest character sizes was therefore being
 * multiplied by roughly 0.64 — the city dimmed as the characters shrank, and
 * in amber the brightest pixel of a whole frame measured 4.08:1 on black,
 * under the 4.5:1 this project holds itself to elsewhere. Scaling each atlas so
 * its strongest pixel is fully opaque restores the intended mapping (amber's
 * floor measures 8.99:1 after, high-contrast dark 19.43:1).
 *
 * Scope: the CALLER must opt in (the City Walk does; the preview's Alt View
 * does not), AND the cell must be at most _TINY_BRIGHTNESS_MAX_CSS_PX wide. The
 * opt-in is what makes this game-only, and it is not decoration: Iosevka Term
 * advances at about half its size, so the preview slider's own 0.5 minimum
 * lands on a 7 px font and a 4 px cell — inside the width threshold. A width
 * test alone would have brightened the main app's Alt View by about 11% at its
 * smallest setting, which this release promised not to touch.
 *
 * @param {CanvasRenderingContext2D} ctx - the atlas context, already drawn
 * @param {HTMLCanvasElement} canvas
 * @param {number} charW - character cell width in CSS px
 */
function _restoreTinyGlyphBrightness(ctx, canvas, charW) {
  if (charW > _TINY_BRIGHTNESS_MAX_CSS_PX) return;

  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = img.data;
  let maxAlpha = 0;
  for (let i = 3; i < px.length; i += 4) {
    if (px[i] > maxAlpha) maxAlpha = px[i];
  }
  // Nothing drawn, or already fully opaque somewhere: leave it exactly alone.
  if (maxAlpha === 0 || maxAlpha === 255) return;

  const gain = 255 / maxAlpha;
  for (let i = 3; i < px.length; i += 4) {
    const lifted = px[i] * gain;
    px[i] = lifted > 255 ? 255 : Math.round(lifted);
  }
  ctx.putImageData(img, 0, 0);
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

// ---------------------------------------------------------------------------
// The composite paint path (CW-12, generalized in CW-22)
// ---------------------------------------------------------------------------
// The per-cell ctx.drawImage() call dominates the ASCII conversion — MEASURED
// at 271 ms of a 433 ms frame (63%) with 238k cells, because the cost is per
// CALL, not per pixel. Composing every glyph into one reusable buffer and
// handing the canvas a single putImageData replaces those calls with typed-
// array writes.
//
// CW-12 shipped this for cells up to 4 CSS px wide, where the win was largest.
// CW-22 measured the rest of the range with in-code stage timers and removed
// the size gate altogether, because the blit path lost EVERYWHERE (Seattle,
// same session, Intel Iris Xe, before -> after convert ms / rAF fps):
//
//     50% (charW 5, the shipped default)  40.7 -> 17.5   42.3 -> 59.5   2.33x
//     60% (charW 6)                       48.7 -> 15.6   37.6 -> 59.5   3.11x
//     80% (charW 7)                       25.9 -> 13.0   51.8 -> 59.6   1.99x
//    100% (charW 9)                       25.0 -> 12.9   51.3 -> 59.6   1.93x
//
// Cell COUNT is not what costs: 60% has fewer cells than 50% and was the
// slowest size in the game, purely because it fell off this path. Above charW
// ~12 the two paths converge to within noise, so there is no size worth gating
// back to the blit path for. The blit path stays as the afterglow path (fade >
// 0 composites the previous frame on top, which this one buffer cannot do) and
// as the reference implementation the parity test measures against.
//
// The paths are pixel-identical, which is the only reason this is allowed to
// reach the preview's Alt View as well: 40 of 40 full-frame comparisons across
// two cities, mono and palette, charW 2 through 12, differed in 0 of ~1.6M
// pixels on every channel (tests/e2e/ascii-city-walk.spec.js keeps this true).
// The brightness treatment, which IS visible, is gated separately — it keeps
// CW-12's 4 px scope, because widening it would brighten the game at its own
// default size and, since the shape vectors are read from the brightened
// atlas, change which glyph each cell picks. That is an art change, not a
// paint optimization; see _restoreTinyGlyphBrightness.

/** Brightness gate (CW-12 scope, deliberately NOT the paint gate). */
const _TINY_BRIGHTNESS_MAX_CSS_PX = 4;

/** One reusable frame buffer per overlay context, resized with the canvas. */
const _frameBuffers = new WeakMap();

function _frameBuffer(ctx, w, h) {
  const held = _frameBuffers.get(ctx);
  if (held && held.width === w && held.height === h) return held;
  const made = ctx.createImageData(w, h);
  _frameBuffers.set(ctx, made);
  return made;
}

/**
 * An atlas's pixels as one Uint32Array, computed once and cached on the atlas
 * object itself — atlases are rebuilt (and the cache thrown away with them)
 * whenever font metrics or theme colors change. The atlas canvas is already
 * created with willReadFrequently, so this read is the cheap direction.
 */
function _atlasPixels32(atlas) {
  if (atlas._pixels32) return atlas._pixels32;
  const ctx = atlas.canvas.getContext('2d', { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, atlas.canvas.width, atlas.canvas.height);
  atlas._pixels32 = new Uint32Array(img.data.buffer);
  return atlas._pixels32;
}

function _paintComposited(
  ctx,
  glyphIndices,
  cols,
  rows,
  atlas,
  stepX,
  stepY,
  colorIndices,
  colorAtlases
) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const img = _frameBuffer(ctx, w, h);
  const dst = new Uint32Array(img.data.buffer);
  dst.fill(0);

  const { cellW, cellH } = atlas;
  const basePixels = _atlasPixels32(atlas);
  const baseStride = atlas.canvas.width;

  for (let row = 0; row < rows; row++) {
    const rowBase = row * cols;
    const dy0 = (row * stepY) | 0;
    if (dy0 >= h) break;
    const runH = Math.min(cellH, h - dy0);

    for (let col = 0; col < cols; col++) {
      const cell = rowBase + col;
      const idx = glyphIndices[cell];
      if (idx === SPACE_INDEX) continue;

      const dx0 = (col * stepX) | 0;
      if (dx0 >= w) continue;
      const runW = Math.min(cellW, w - dx0);

      let src = basePixels;
      let stride = baseStride;
      if (colorAtlases && colorIndices) {
        const layer = colorAtlases[colorIndices[cell]];
        if (layer) {
          src = _atlasPixels32(layer);
          stride = layer.canvas.width;
        }
      }

      const sx0 = idx * cellW;
      for (let y = 0; y < runH; y++) {
        let s = y * stride + sx0;
        let d = (dy0 + y) * w + dx0;
        for (let x = 0; x < runW; x++, s++, d++) {
          // Fully transparent atlas pixels leave the buffer alone, which is
          // what source-over does. Cells never overlap here (charW is an
          // integer and stepX === cellW at every dpr we ship), so a copy and
          // a source-over composite produce the same pixels.
          const px = src[s];
          if (px !== 0) dst[d] = px;
        }
      }
    }
  }

  ctx.putImageData(img, 0, 0);
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

  if (fade === 0) {
    _paintComposited(
      ctx,
      glyphIndices,
      cols,
      rows,
      atlas,
      stepX,
      stepY,
      colorIndices,
      colorAtlases
    );
    return;
  }

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
// Phosphor drive levels (CW-21) — pure math, unit-tested directly
// ---------------------------------------------------------------------------

/**
 * A single phosphor driven harder or softer, the way a monochrome tube's
 * intensity attribute worked.
 *
 * Below full drive the beam is simply weaker, so every channel scales together
 * and the hue is unchanged. ABOVE full drive a real tube cannot make the
 * phosphor a new colour — it saturates and blooms toward white, and that is
 * what the extra energy looks like. So drive > 1 blends toward white rather
 * than multiplying, and green (already near maximum) gains very little from
 * it: MEASURED, #00ff00 is 15.30:1 on black while drive 1.5 reaches only
 * 16.53:1. The DOWNWARD range is the useful one — 6.45:1 at drive 0.65, a
 * 2.4x luminance span.
 *
 * The dim floor is 0.65 drive: at 0.55 amber measures 3.82:1 and fails the
 * 4.5:1 this project holds itself to. tests/unit/color-contrast.test.js
 * imports this function and re-measures every level the renderer ships.
 *
 * @param {string} css - #rrggbb phosphor colour
 * @param {number} drive - below 1 dims, 1 is the phosphor itself, above 1
 *   blooms toward white
 * @returns {string} #rrggbb
 */
export function driveColor(css, drive) {
  const [r, g, b] = parsePaletteColor(css);
  const d = Number.isFinite(drive) ? Math.max(0, drive) : 1;
  const out =
    d <= 1
      ? [r * d, g * d, b * d]
      : (() => {
          const t = Math.min(1, d - 1);
          return [r + (1 - r) * t, g + (1 - g) * t, b + (1 - b) * t];
        })();
  const hex = (v) =>
    Math.max(0, Math.min(255, Math.round(v * 255)))
      .toString(16)
      .padStart(2, '0');
  return `#${hex(out[0])}${hex(out[1])}${hex(out[2])}`;
}

/**
 * Pick an intensity level for a cell from its mean luminance.
 *
 * Levels are ordered dimmest first, so the brightest cells take the last
 * entry. The split is even across the luminance range: with two levels that is
 * the hardware's single intensity BIT, with four it is a smooth ramp.
 *
 * @param {number} lum - cell mean luminance in [0, 1]
 * @param {number} levelCount
 * @returns {number} index into the levels array
 */
export function pickIntensityIndex(lum, levelCount) {
  if (!(levelCount > 1)) return 0;
  const v = Number.isFinite(lum) ? lum : 0;
  const i = Math.floor(v * levelCount);
  return i < 0 ? 0 : i >= levelCount ? levelCount - 1 : i;
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
