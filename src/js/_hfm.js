/**
 * @license GPL-3.0-or-later
 */
// Alternate rendering module (generic naming)
//
// Shape-vector character rendering technique inspired by external research
// (see attribution in CREDITS.md / THIRD_PARTY_NOTICES.md).
//
// This implementation is clean-room; technique concepts only, no code copied.
// The 6D shape vector approach, directional/global contrast enhancement, and
// lazily-populated lookup cache are derived from the educational concepts
// described in that article.
//
// Pipeline (on-demand): the WebGL scene renders every frame, but the ASCII
// conversion runs only when a dirty flag is set (camera change, auto-rotate,
// resize, setting change) or the 1 Hz fallback tick fires. Conversion:
// downscale the WebGL canvas (bilinear area-average), one getImageData
// readback, 6 internal + 10 external luminance taps per cell, directional +
// global contrast, lazy 6D-key lookup to a glyph index, then atlas blits in
// a single phosphor color at device-pixel resolution.
//
// Renderer state lives in a per-instance object created by initAltView(), so
// independent consumers (the model preview's Alt View, other alt-rendered
// surfaces) each hold their own overlay, atlas, and scheduling state without
// interfering. Pure helpers (sampling layouts, vector math) stay module-level.

import { createLookup } from './_hfm-lookup.js';
import {
  createOverlay,
  resizeOverlay,
  buildGlyphAtlas,
  getPhosphorColor,
  paintFrame,
  parsePaletteColor,
  normalizeChroma,
  pickPaletteIndex,
  driveColor,
  pickIntensityIndex,
  GLYPH_COUNT,
} from './_hfm-paint.js';

// Tuning knobs
// _MIN_INTERVAL_MS      — conversion throttle ceiling (~30 fps while dirty)
// _MAX_INTERVAL_MS      — governor floor (~4 fps) under sustained slowness
// _FALLBACK_TICK_MS     — 1 Hz keep-alive conversion self-heals any missed
//                         invalidation while idle
// _TARGET_SAMPLE_PX     — sample pixels per char-cell dimension; the bilinear
//                         downscale acts as area-average supersampling so one
//                         tap per point suffices
// _CONTRAST_EXP / _DIR_CONTRAST_EXP — global / directional contrast exponents
//                         (scaled by the user's contrast setting)
const _MIN_INTERVAL_MS = 33;
const _MAX_INTERVAL_MS = 250;
const _FALLBACK_TICK_MS = 1000;
const _TARGET_SAMPLE_PX = 4;
const _DEFAULT_CONTRAST_EXP = 3.2;
const _DEFAULT_DIR_CONTRAST_EXP = 5.0;

// Phosphor afterglow / persistence (off by default; enable via setPersistFade())
const _DEFAULT_PERSIST_FADE = 0;

/**
 * Per-instance renderer state. One of these is created for every
 * initAltView() call; all stateful helpers below take it as their first
 * argument.
 */
function _createInstanceState() {
  return {
    enabled: false,
    canvasOpacity: null,

    overlayCanvas: null, // HTMLCanvasElement
    overlayCtx: null, // CanvasRenderingContext2D
    persistCanvas: null, // off-screen afterglow persistence canvas
    persistCtx: null,
    sampleCanvas: null,
    sampleCtx: null,

    // Glyph atlas + shape-vector model (rebuilt when font metrics / theme change)
    atlas: null,
    glyphVectors: null,
    lookup: null,
    atlasKey: '',

    // Palette mode (CW-6): null = classic single phosphor. When set, one
    // atlas per palette color plus a per-cell color index buffer.
    palette: null, // string[] of #rrggbb, or null
    paletteChroma: null, // chroma-normalized [r,g,b] per entry
    paletteChromaBoost: 1,
    paletteAtlases: null,
    colorIndices: null, // Int8Array, rows*cols

    // CW-21 intensity: one atlas of the SAME phosphor per drive level, chosen
    // per cell by luminance. Monochrome only — in palette mode the per-cell
    // atlas selector is already spoken for by the colour, and colour carries
    // the identity intensity would have added.
    intensityLevels: null, // number[] drive factors, dimmest first, or null
    intensityAtlases: null,
    intensityIndices: null, // Int8Array, rows*cols

    // Render-on-demand scheduling
    dirty: true,
    lastFrameMs: 0,
    lastConvertMs: 0, // timestamp of the last conversion, not a duration
    dynamicInterval: _MIN_INTERVAL_MS,

    // CW-12 bench instrumentation: how long each conversion actually took.
    // Written on every frame; read only through the DEV-only getters.
    convertStats: { last: 0, sum: 0, max: 0, samples: 0 },

    // CW-12: caller opt-in for the small-character treatment. The City Walk
    // sets it; the preview's Alt View leaves it false so its own smallest
    // setting renders exactly as it always has.
    tinyCellsAllowed: false,

    contrastScale: 1,
    contrastExp: _DEFAULT_CONTRAST_EXP,
    dirContrastExp: _DEFAULT_DIR_CONTRAST_EXP,
    fontScale: 1,

    persistFade: 0,
    reducedMotion: false, // mirrors prefers-reduced-motion
  };
}

function _checkReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );
}

function _getDpr() {
  return Math.min(
    typeof window !== 'undefined' && window.devicePixelRatio
      ? window.devicePixelRatio
      : 1,
    2
  );
}

function _relLum01(r, g, b) {
  // relative luminance (sRGB) in [0,1] (gamma ignored; good enough for this use)
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function _clamp01(x) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function _setContrastScale(st, scale) {
  const next = Number.isFinite(scale) ? scale : 1;
  // Clamp to useful range based on the researched exponent windows:
  // - Min 0.5 → exponent ~0.9 (near identity, no visible enhancement)
  // - Max 4.0 → exponent ~7.2 (very sharp edges, before artifact threshold)
  st.contrastScale = Math.max(0.5, Math.min(4.0, next));
  st.contrastExp = _DEFAULT_CONTRAST_EXP * st.contrastScale;
  st.dirContrastExp = _DEFAULT_DIR_CONTRAST_EXP * st.contrastScale;
  st.dirty = true;
  return st.contrastScale;
}

function _setFontScale(st, scale) {
  const next = Number.isFinite(scale) ? scale : 1;
  // Instance floor is 0.05, not the preview slider's 0.5 (CW-12): the City
  // Walk asks for characters small enough to disappear into, and
  // _HFM_FONT_SCALE_RANGE in hfm-controller.js still holds the preview's
  // Alt View to 0.5-2.5. Below ~0.15 the fontSizePx floor takes over and
  // the glyphs stop shrinking.
  // - Max 2.5 → larger chars, lower resolution (more legible)
  st.fontScale = Math.max(0.05, Math.min(2.5, next));
  st.dirty = true;
  return st.fontScale;
}

function _getFontMetrics(fontFamily, fontSizePx) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  ctx.font = `${fontSizePx}px ${fontFamily}`;
  const m = ctx.measureText('M');
  // Advance width — matches the atlas cell the glyph is centered in.
  const charW = Math.max(1, Math.ceil(m.width || fontSizePx * 0.6));
  // Line box height so descenders (g, y, p) stay inside the row. Prefer the
  // font bounding box when the browser reports it; 1.2em is the classic
  // line-box approximation otherwise.
  const hasFontBox =
    typeof m.fontBoundingBoxAscent === 'number' &&
    typeof m.fontBoundingBoxDescent === 'number';
  const charH = Math.max(
    1,
    Math.round(
      hasFontBox
        ? m.fontBoundingBoxAscent + m.fontBoundingBoxDescent
        : fontSizePx * 1.2
    )
  );
  return { charW, charH };
}

function _getSixSamplePoints(cellW, cellH) {
  // 2x3 staggered internal pattern (matches the researched 6D layout).
  // Returned points are in cell-local coordinates.
  const xL = cellW * 0.32;
  const xR = cellW * 0.68;

  const y0 = cellH * 0.22;
  const y1 = cellH * 0.5;
  const y2 = cellH * 0.78;

  const stagger = cellH * 0.06;
  return [
    [xL, y0 + stagger],
    [xR, y0 - stagger],
    [xL, y1 + stagger * 0.4],
    [xR, y1 - stagger * 0.4],
    [xL, y2 + stagger * 0.1],
    [xR, y2 - stagger * 0.1],
  ];
}

function _getExternalSamplePoints(cellW, cellH) {
  // External ring of 10 sample points reaching into neighboring cells,
  // arranged per the researched layout: two above, three per side, two below.
  const mx = cellW * 0.3;
  const my = cellH * 0.2;
  return [
    [cellW * 0.32, -my], // 0: top-left
    [cellW * 0.68, -my], // 1: top-right
    [-mx, cellH * 0.25], // 2: upper-left
    [cellW + mx, cellH * 0.25], // 3: upper-right
    [-mx, cellH * 0.5], // 4: mid-left
    [cellW + mx, cellH * 0.5], // 5: mid-right
    [-mx, cellH * 0.75], // 6: lower-left
    [cellW + mx, cellH * 0.75], // 7: lower-right
    [cellW * 0.32, cellH + my], // 8: bottom-left
    [cellW * 0.68, cellH + my], // 9: bottom-right
  ];
}

// Mapping from each internal sampling point (0-5) to the external samples
// that affect it — each internal circle sees only a small local set of
// external circles, keeping edges crisp instead of crushing whole sides.
//
// Internal layout indices:      External indices:
//   0  1  (top)                   0  1        (top)
//   2  3  (middle)              2      3      (upper sides)
//   4  5  (bottom)              4      5      (mid sides)
//                               6      7      (lower sides)
//                                 8  9        (bottom)
const _EXT_AFFECTING = [
  [0, 1, 2, 4], // internal 0 (top-left)
  [0, 1, 3, 5], // internal 1 (top-right)
  [2, 4, 6], // internal 2 (mid-left)
  [3, 5, 7], // internal 3 (mid-right)
  [4, 6, 8, 9], // internal 4 (bottom-left)
  [5, 7, 8, 9], // internal 5 (bottom-right)
];

function _applyDirectionalContrast(st, v, extSamples) {
  // Component-wise directional contrast: normalize each internal component
  // to the max of its affecting external samples, then sharpen.
  for (let i = 0; i < 6; i++) {
    let maxExt = v[i];
    const affecting = _EXT_AFFECTING[i];
    for (let j = 0; j < affecting.length; j++) {
      const extVal = extSamples[affecting[j]];
      if (extVal > maxExt) maxExt = extVal;
    }

    if (maxExt > v[i] && maxExt > 0.01) {
      const normalized = v[i] / maxExt;
      const enhanced = Math.pow(normalized, st.dirContrastExp);
      v[i] = _clamp01(enhanced * maxExt);
    }
  }

  return v;
}

function _applyCellContrast(st, v) {
  // Global contrast: max-normalize the cell then apply the exponent.
  const max = Math.max(v[0], v[1], v[2], v[3], v[4], v[5]);
  if (!(max > 0)) return v;
  for (let i = 0; i < 6; i++) {
    const n = v[i] / max;
    v[i] = _clamp01(Math.pow(_clamp01(n), st.contrastExp) * max);
  }
  return v;
}

function _buildGlyphVectors(atlas) {
  // Compute 6D shape vectors directly from the atlas bitmap — the exact
  // pixels that get painted — so glyphs always align with their vectors.
  const { canvas, cellW, cellH } = atlas;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const stride = canvas.width;

  const samplePoints = _getSixSamplePoints(cellW, cellH);
  const r = Math.max(1, Math.min(cellW, cellH) * 0.18);

  // A small set of offsets inside a circle (fast approximation of disc sampling)
  const offsets = [
    [0, 0],
    [0.6, 0],
    [-0.6, 0],
    [0, 0.6],
    [0, -0.6],
    [0.42, 0.42],
    [0.42, -0.42],
    [-0.42, 0.42],
    [-0.42, -0.42],
  ];

  const vectors = new Array(GLYPH_COUNT);
  const maxPerDim = new Float32Array(6);

  for (let g = 0; g < GLYPH_COUNT; g++) {
    const x0 = g * cellW;
    const v = new Float32Array(6);

    for (let i = 0; i < 6; i++) {
      const [cx, cy] = samplePoints[i];
      let sum = 0;
      for (let k = 0; k < offsets.length; k++) {
        const sx = Math.min(
          cellW - 1,
          Math.max(0, Math.round(cx + offsets[k][0] * r))
        );
        const sy = Math.min(
          cellH - 1,
          Math.max(0, Math.round(cy + offsets[k][1] * r))
        );
        const idx = (sy * stride + x0 + sx) * 4;
        // Alpha channel = glyph coverage (atlas is tinted color on transparent)
        sum += img[idx + 3] / 255;
      }
      v[i] = sum / offsets.length;
      if (v[i] > maxPerDim[i]) maxPerDim[i] = v[i];
    }

    vectors[g] = v;
  }

  // Per-dimension max normalization
  for (let g = 0; g < vectors.length; g++) {
    const v = vectors[g];
    for (let i = 0; i < 6; i++) {
      const denom = maxPerDim[i] || 1;
      v[i] = v[i] / denom;
    }
  }

  return vectors;
}

function _ensureGlyphModel(st, { fontFamily, fontSizePx, charW, charH, dpr }) {
  const color = getPhosphorColor();
  const paletteKey = st.palette ? st.palette.join(',') : '';
  const intensityKey =
    !st.palette && st.intensityLevels ? st.intensityLevels.join(',') : '';
  const key = `${fontFamily}|${fontSizePx}|${charW}|${charH}|${dpr}|${color}|${paletteKey}|${intensityKey}`;
  if (st.atlas && st.atlasKey === key) return;

  if (st.palette) {
    // One atlas per palette color; glyph coverage (alpha) is identical
    // across tints, so shape vectors come from the first atlas.
    st.paletteAtlases = st.palette.map((paletteColor) =>
      buildGlyphAtlas({
        fontFamily,
        fontSizePx,
        charW,
        charH,
        dpr,
        color: paletteColor,
        normalizeTinyAlpha: st.tinyCellsAllowed,
      })
    );
    st.atlas = st.paletteAtlases[0];
    st.intensityAtlases = null;
  } else {
    st.paletteAtlases = null;
    const atlasAt = (tint) =>
      buildGlyphAtlas({
        fontFamily,
        fontSizePx,
        charW,
        charH,
        dpr,
        color: tint,
        normalizeTinyAlpha: st.tinyCellsAllowed,
      });
    if (st.intensityLevels) {
      // One atlas per drive level. Glyph coverage is alpha, which is identical
      // across tints, so the shape vectors below are unaffected by intensity —
      // a dim cell picks the same character it would have picked at full
      // drive, and only its brightness changes. MEASURED: about 0.2 ms per
      // atlas at any character size, so a handful of levels is not a cost.
      st.intensityAtlases = st.intensityLevels.map((drive) =>
        atlasAt(driveColor(color, drive))
      );
      // The base atlas stays the full-drive one, so everything that reads
      // st.atlas (cell metrics, the no-layers fallback) sees today's picture.
      st.atlas = st.intensityAtlases[st.intensityAtlases.length - 1];
    } else {
      st.intensityAtlases = null;
      st.atlas = atlasAt(color);
    }
  }
  st.glyphVectors = _buildGlyphVectors(st.atlas);
  st.lookup = createLookup(st.glyphVectors);
  st.atlasKey = key;
}

function _ensureOverlay(st, container) {
  if (st.overlayCanvas) return;
  const { canvas, ctx, persistCanvas, persistCtx } = createOverlay(container);
  st.overlayCanvas = canvas;
  st.overlayCtx = ctx;
  st.persistCanvas = persistCanvas;
  st.persistCtx = persistCtx;
}

function _ensureSampler(st) {
  if (st.sampleCanvas) return;
  st.sampleCanvas = document.createElement('canvas');
  st.sampleCtx = st.sampleCanvas.getContext('2d', {
    willReadFrequently: true,
  });
}

function _computeInvertFromScene(scene) {
  // Determine if we should invert luminance mapping.
  // For dark backgrounds: invert = false (bright model → characters, dark bg → spaces)
  // For light backgrounds: invert = true (dark model → characters, bright bg → spaces)
  //
  // The mono theme always uses black backgrounds, so default to false (no invert).
  const bg = scene?.background;
  if (!bg || typeof bg.r !== 'number') return false;
  const r = Math.round(_clamp01(bg.r) * 255);
  const g = Math.round(_clamp01(bg.g) * 255);
  const b = Math.round(_clamp01(bg.b) * 255);
  return _relLum01(r, g, b) > 0.55;
}

/**
 * Compute the adaptive sample-canvas downscale factor.
 *
 * Targets approximately _TARGET_SAMPLE_PX sample pixels per character cell
 * dimension, keeping the sample canvas between 5% and 50% of viewport
 * resolution for performance.
 *
 * @param {number} charW - character cell width in viewport pixels
 * @returns {number} scale in (0, 1]
 */
function _computeSampleScale(charW) {
  return Math.max(0.05, Math.min(0.5, _TARGET_SAMPLE_PX / Math.max(1, charW)));
}

function _renderFrame(
  st,
  { renderer, scene, width, height, fontFamily, fontSizePx, charW, charH }
) {
  _ensureSampler(st);

  const dpr = _getDpr();
  _ensureGlyphModel(st, { fontFamily, fontSizePx, charW, charH, dpr });

  const sampleScale = _computeSampleScale(charW);
  const sampleW = Math.max(1, Math.floor(width * sampleScale));
  const sampleH = Math.max(1, Math.floor(height * sampleScale));
  // Resizing a canvas clears it and resets context state — only do it when
  // the dimensions actually change.
  if (st.sampleCanvas.width !== sampleW || st.sampleCanvas.height !== sampleH) {
    st.sampleCanvas.width = sampleW;
    st.sampleCanvas.height = sampleH;
  }
  // Bilinear downscale = GPU box filter, standing in for area-average
  // supersampling; one tap per sample point then suffices.
  st.sampleCtx.imageSmoothingEnabled = true;
  st.sampleCtx.clearRect(0, 0, sampleW, sampleH);
  st.sampleCtx.drawImage(renderer.domElement, 0, 0, sampleW, sampleH);

  const imgData = st.sampleCtx.getImageData(0, 0, sampleW, sampleH).data;
  const invert = _computeInvertFromScene(scene);

  const cellW = Math.max(1, charW * sampleScale);
  const cellH = Math.max(1, charH * sampleScale);

  const cols = Math.max(8, Math.floor((width * sampleScale) / cellW));
  const rows = Math.max(6, Math.floor((height * sampleScale) / cellH));

  const pts = _getSixSamplePoints(cellW, cellH);
  const extPts = _getExternalSamplePoints(cellW, cellH);

  const v = new Float32Array(6);
  const extSamples = new Float32Array(10);
  const glyphIndices = new Int16Array(rows * cols);
  const usePalette = Boolean(st.palette && st.paletteChroma);
  if (usePalette && st.colorIndices?.length !== rows * cols) {
    st.colorIndices = new Int8Array(rows * cols);
  }
  const useIntensity = Boolean(!usePalette && st.intensityAtlases);
  if (useIntensity && st.intensityIndices?.length !== rows * cols) {
    st.intensityIndices = new Int8Array(rows * cols);
  }
  const intensityCount = useIntensity ? st.intensityAtlases.length : 0;
  let idx = 0;

  for (let y = 0; y < rows; y++) {
    const baseY = y * cellH;

    for (let x = 0; x < cols; x++) {
      const baseX = x * cellW;

      // Internal points (main shape vector) — single tap each. In palette
      // mode the same six taps also accumulate the cell's average color.
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let sumLum = 0;
      for (let i = 0; i < 6; i++) {
        const sx = Math.min(
          sampleW - 1,
          Math.max(0, Math.round(baseX + pts[i][0]))
        );
        const sy = Math.min(
          sampleH - 1,
          Math.max(0, Math.round(baseY + pts[i][1]))
        );
        const pidx = (sy * sampleW + sx) * 4;
        const lum = _relLum01(
          imgData[pidx],
          imgData[pidx + 1],
          imgData[pidx + 2]
        );
        v[i] = _clamp01(invert ? 1 - lum : lum);
        if (usePalette) {
          sumR += imgData[pidx];
          sumG += imgData[pidx + 1];
          sumB += imgData[pidx + 2];
        }
        if (useIntensity) sumLum += v[i];
      }
      if (useIntensity) {
        // The cell's brightness BEFORE the contrast curves reshape v for glyph
        // matching: intensity answers "how bright is this cell", the glyph
        // answers "what shape is it", and the two must not be the same signal
        // twice over.
        st.intensityIndices[idx] = pickIntensityIndex(
          sumLum / 6,
          intensityCount
        );
      }
      if (usePalette) {
        st.colorIndices[idx] = pickPaletteIndex(
          sumR / (6 * 255),
          sumG / (6 * 255),
          sumB / (6 * 255),
          st.paletteChroma,
          st.paletteChromaBoost
        );
      }

      // External boundary points for edge detection; out-of-bounds clamp to 0
      for (let i = 0; i < 10; i++) {
        const sx = Math.round(baseX + extPts[i][0]);
        const sy = Math.round(baseY + extPts[i][1]);
        if (sx >= 0 && sx < sampleW && sy >= 0 && sy < sampleH) {
          const pidx = (sy * sampleW + sx) * 4;
          const lum = _relLum01(
            imgData[pidx],
            imgData[pidx + 1],
            imgData[pidx + 2]
          );
          extSamples[i] = _clamp01(invert ? 1 - lum : lum);
        } else {
          extSamples[i] = 0;
        }
      }

      _applyDirectionalContrast(st, v, extSamples);
      _applyCellContrast(st, v);

      glyphIndices[idx++] = st.lookup.nearestIndex(v);
    }
  }

  // Sync overlay canvas backing store to container size at device resolution
  const backingW = Math.max(1, Math.round(width * dpr));
  const backingH = Math.max(1, Math.round(height * dpr));
  if (
    st.overlayCanvas.width !== backingW ||
    st.overlayCanvas.height !== backingH
  ) {
    resizeOverlay(st.overlayCanvas, width, height, dpr, st.persistCanvas);
  }

  paintFrame(
    st.overlayCtx,
    glyphIndices,
    cols,
    rows,
    st.atlas,
    charW,
    charH,
    st.persistCanvas,
    st.persistCtx,
    st.persistFade,
    usePalette
      ? { indices: st.colorIndices, atlases: st.paletteAtlases }
      : useIntensity
        ? { indices: st.intensityIndices, atlases: st.intensityAtlases }
        : undefined
  );
}

/**
 * Initialize alternate view
 * @param {Object} previewManager - PreviewManager instance
 * @param {{allowTinyCells?: boolean}} [options] - allowTinyCells opts this
 *   instance into the small-character treatment (CW-12): glyph atlases below
 *   a 4 px cell are normalized back to full opacity, so the picture does not
 *   dim as the characters shrink. The City Walk sets it; the preview's Alt
 *   View does not, and so renders exactly as it always has at every setting
 *   its own 0.5-2.5 slider can reach.
 * @returns {Object} API for controlling the alternate view
 */
export async function initAltView(previewManager, options = {}) {
  const { renderer, scene, container } = previewManager;

  const st = _createInstanceState();
  st.tinyCellsAllowed = Boolean(options.allowTinyCells);

  _ensureOverlay(st, container);

  // Pick a conservative font size for performance/readability.
  const fontFamily =
    '\'Iosevka Term\', ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';
  let fontSizePx = 10;
  let metrics = _getFontMetrics(fontFamily, fontSizePx);

  function _recomputeFontForSize(width, height) {
    // Adaptive quality: target 2000–8000 character cells depending on viewport
    // area. Larger viewports get more cells for better detail; smaller
    // viewports get fewer cells for performance.
    const viewportArea = width * height;
    const targetCells = Math.max(
      2000,
      Math.min(8000, (viewportArea / 120) | 0)
    );

    // Derive target charW so that (width/charW) * (height/charH) ≈ targetCells.
    // Using charH/charW ≈ 1.65 (typical monospace aspect ratio).
    const charAspect = 1.65;
    const targetCharW = Math.sqrt(viewportArea / (targetCells * charAspect));

    // Approximate fontSize from targetCharW (monospace: fontSize * 0.6 ≈ charW)
    const approxSize = Math.round(targetCharW / 0.6);
    const scaled = Math.round(approxSize * st.fontScale);
    // 3 px is the physical floor: below it a monospace cell is ~2x4 device
    // pixels and the glyph stops being a glyph (CW-12).
    fontSizePx = Math.max(3, Math.min(24, scaled));
    metrics = _getFontMetrics(fontFamily, fontSizePx);
  }

  _recomputeFontForSize(container.clientWidth, container.clientHeight);

  st.reducedMotion = _checkReducedMotion();

  const _onControlsChange = () => {
    st.dirty = true;
  };

  const api = {
    enable() {
      // Re-check reduced-motion on every enable so media-query changes are respected
      st.reducedMotion = _checkReducedMotion();
      st.persistFade = st.reducedMotion ? 0 : _DEFAULT_PERSIST_FADE;

      st.dynamicInterval = _MIN_INTERVAL_MS;
      st.dirty = true;

      // Camera changes (drag, damping decay, programmatic moves) mark the
      // frame dirty so conversion runs only while something moves.
      previewManager.controls?.addEventListener?.('change', _onControlsChange);

      st.enabled = true;
      st.overlayCanvas.style.display = 'block';

      // One-shot CRT power-on flourish (pure CSS; skipped for reduced motion)
      if (!st.reducedMotion) {
        st.overlayCanvas.classList.remove('crt-power-on');
        void st.overlayCanvas.offsetWidth; // restart animation if re-enabling
        st.overlayCanvas.classList.add('crt-power-on');
        st.overlayCanvas.addEventListener(
          'animationend',
          (e) => e.target.classList.remove('crt-power-on'),
          { once: true }
        );
      }

      if (st.canvasOpacity === null) {
        st.canvasOpacity = renderer.domElement.style.opacity || '';
      }
      renderer.domElement.style.opacity = '0';
    },
    disable() {
      st.enabled = false;
      previewManager.controls?.removeEventListener?.(
        'change',
        _onControlsChange
      );
      st.overlayCanvas.style.display = 'none';
      renderer.domElement.style.opacity = st.canvasOpacity ?? '';
      // Clear persistence canvas so stale afterglow does not show on next enable
      if (st.persistCanvas && st.persistCtx) {
        st.persistCtx.clearRect(
          0,
          0,
          st.persistCanvas.width,
          st.persistCanvas.height
        );
      }
    },
    toggle() {
      st.enabled ? this.disable() : this.enable();
      return st.enabled;
    },
    render() {
      // Always render the underlying scene so controls + animation stay correct.
      renderer.render(scene, previewManager.getActiveCamera());

      if (!st.enabled) return;

      // Auto-rotate moves the camera every frame without firing 'change'
      if (previewManager.isAutoRotateEnabled?.()) {
        st.dirty = true;
      }

      const now = performance.now();
      if (now - st.lastFrameMs < st.dynamicInterval) return;
      // Skip conversion while clean; the fallback tick self-heals any missed
      // invalidation at ~1 Hz.
      if (!st.dirty && now - st.lastConvertMs <= _FALLBACK_TICK_MS) return;
      st.lastFrameMs = now;

      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w <= 0 || h <= 0) return;

      _renderFrame(st, {
        renderer,
        scene,
        width: w,
        height: h,
        fontFamily,
        fontSizePx,
        charW: metrics.charW,
        charH: metrics.charH,
      });
      st.dirty = false;
      const after = performance.now();
      st.lastConvertMs = after;

      // Frame governor: back off proportionally on slow conversions, decay
      // back toward 30 fps one step per fast conversion (no ping-ponging).
      const duration = after - now;
      const cs = st.convertStats;
      cs.last = duration;
      cs.sum += duration;
      cs.samples += 1;
      if (duration > cs.max) cs.max = duration;

      if (duration > _MIN_INTERVAL_MS) {
        st.dynamicInterval = Math.min(
          _MAX_INTERVAL_MS,
          Math.ceil(duration / _MIN_INTERVAL_MS) * _MIN_INTERVAL_MS
        );
      } else {
        st.dynamicInterval = Math.max(
          _MIN_INTERVAL_MS,
          st.dynamicInterval - _MIN_INTERVAL_MS
        );
      }
    },
    invalidate() {
      st.dirty = true;
    },
    resize(width, height) {
      _recomputeFontForSize(width, height);
      st.dirty = true;
    },
    /**
     * Rebuild the glyph atlas (re-reading --color-accent) — call after a
     * theme change so the phosphor tint follows the active variant.
     */
    rebuildGlyphs() {
      st.atlasKey = '';
      st.dirty = true;
    },
    /**
     * Palette mode (CW-6). Pass an array of #rrggbb colors to render each
     * cell in the nearest palette color (one glyph atlas per entry);
     * pass null to restore the classic single-phosphor rendering.
     * @param {string[]|null} colors
     * @param {{chromaBoost?: number}} [options] - see pickPaletteIndex
     * @returns {string[]|null} the active palette
     */
    setPalette(colors, options = {}) {
      if (Array.isArray(colors) && colors.length > 0) {
        st.palette = colors.map(String);
        st.paletteChroma = st.palette.map((c) =>
          normalizeChroma(parsePaletteColor(c))
        );
        st.paletteChromaBoost = Number.isFinite(options.chromaBoost)
          ? Math.max(1, options.chromaBoost)
          : 1;
      } else {
        st.palette = null;
        st.paletteChroma = null;
        st.paletteAtlases = null;
        st.colorIndices = null;
      }
      st.atlasKey = '';
      st.dirty = true;
      return st.palette;
    },
    getPalette() {
      return st.palette ? st.palette.slice() : null;
    },
    /**
     * Per-cell intensity (CW-21). Pass drive factors DIMMEST FIRST — one glyph
     * atlas of the same phosphor is built per level and each cell takes the
     * level its luminance falls in. Pass null for the single-drive rendering
     * every caller had before.
     *
     * Callers opt in exactly as they do for setPalette: nothing changes for an
     * instance that never calls this, which is what keeps the main app's Alt
     * View untouched. Ignored while a palette is active — colour already gives
     * each cell an identity, and the per-cell atlas selector cannot serve two
     * masters.
     *
     * @param {number[]|null} levels - e.g. [0.65, 1] for the hardware's single
     *   intensity bit; values above 1 bloom toward white (see driveColor)
     * @returns {number[]|null} the active levels
     */
    setIntensityLevels(levels) {
      if (Array.isArray(levels) && levels.length > 1) {
        st.intensityLevels = levels
          .map(Number)
          .filter((n) => Number.isFinite(n) && n >= 0);
        if (st.intensityLevels.length < 2) st.intensityLevels = null;
      } else {
        st.intensityLevels = null;
      }
      if (!st.intensityLevels) {
        st.intensityAtlases = null;
        st.intensityIndices = null;
      }
      st.atlasKey = '';
      st.dirty = true;
      return st.intensityLevels;
    },
    getIntensityLevels() {
      return st.intensityLevels ? st.intensityLevels.slice() : null;
    },
    setContrastScale(scale) {
      return _setContrastScale(st, scale);
    },
    getContrastScale() {
      return st.contrastScale;
    },
    setFontScale(scale) {
      _setFontScale(st, scale);
      _recomputeFontForSize(container.clientWidth, container.clientHeight);
      return st.fontScale;
    },
    getFontScale() {
      return st.fontScale;
    },
    dispose() {
      st.enabled = false;
      previewManager.controls?.removeEventListener?.(
        'change',
        _onControlsChange
      );
      if (st.canvasOpacity !== null) {
        renderer.domElement.style.opacity = st.canvasOpacity;
      }
      st.overlayCanvas?.remove();
      st.overlayCanvas = null;
      st.overlayCtx = null;
      st.persistCanvas = null;
      st.persistCtx = null;
      st.sampleCanvas = null;
      st.sampleCtx = null;
      st.atlas = null;
      st.glyphVectors = null;
      st.lookup = null;
      st.atlasKey = '';
      st.paletteAtlases = null;
      st.colorIndices = null;
      st.dirty = true;
    },
    isEnabled: () => st.enabled,

    // Phosphor afterglow controls
    setPersistFade(value) {
      const clamped = Math.max(
        0,
        Math.min(1, Number.isFinite(value) ? value : 0)
      );
      // Never enable fade when reduced-motion is active
      st.persistFade = st.reducedMotion ? 0 : clamped;
      st.dirty = true;
      return st.persistFade;
    },
    getPersistFade() {
      return st.persistFade;
    },
    /**
     * Allow the caller to push the current prefers-reduced-motion state without
     * re-initialising the whole view.  Immediately forces fade to 0 when true.
     * @param {boolean} reduced
     */
    setReducedMotion(reduced) {
      st.reducedMotion = Boolean(reduced);
      if (st.reducedMotion) {
        st.persistFade = 0;
        // Clear any stale persistence content
        if (st.persistCanvas && st.persistCtx) {
          st.persistCtx.clearRect(
            0,
            0,
            st.persistCanvas.width,
            st.persistCanvas.height
          );
        }
        st.dirty = true;
      }
    },
    clearPersistence() {
      if (st.persistCanvas && st.persistCtx) {
        st.persistCtx.clearRect(
          0,
          0,
          st.persistCanvas.width,
          st.persistCanvas.height
        );
        st.dirty = true;
      }
    },
  };

  if (import.meta.env.DEV) {
    // CW-12 bench readout. Read-only; the production API is unchanged.
    // Call resetConvertStats() at the start of a measured walking loop and
    // read getConvertStats() at the end - polling `last` would miss frames.
    api.getConvertStats = () => {
      const cs = st.convertStats;
      return {
        lastMs: cs.last,
        avgMs: cs.samples ? cs.sum / cs.samples : 0,
        maxMs: cs.max,
        samples: cs.samples,
        // Where the frame governor settled: _MIN_INTERVAL_MS means it never
        // had to back off, _MAX_INTERVAL_MS is the 4 fps floor.
        dynamicIntervalMs: st.dynamicInterval,
        fontScale: st.fontScale,
        fontSizePx,
        charW: metrics.charW,
        charH: metrics.charH,
      };
    };
    api.resetConvertStats = () => {
      st.convertStats = { last: 0, sum: 0, max: 0, samples: 0 };
    };
  }

  return api;
}
