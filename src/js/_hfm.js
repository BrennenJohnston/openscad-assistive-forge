// Alternate rendering module (generic naming)
//
// Shape-vector character rendering technique inspired by external research
// (see attribution in CREDITS.md / THIRD_PARTY_NOTICES.md).
//
// This implementation is clean-room; technique concepts only, no code copied.
// The 6D shape vector approach and per-cell contrast enhancement are derived
// from the educational concepts described in that article.

import { buildLUTAsync, lookupChar } from './_hfm-lut.js';
import {
  createOverlay,
  resizeOverlay,
  sampleColors,
  paintFrame,
} from './_hfm-paint.js';

let isEnabled = false;
let canvasOpacity = null;

// Renderer state (module-level singleton)
let _overlayEl = null; // HTMLCanvasElement (was <pre>; name kept for minimal diff)
let _overlayCtx = null; // CanvasRenderingContext2D
let _persistCanvas = null; // §4d: off-screen persistence canvas
let _persistCtx = null; // §4d: 2D context for persistence canvas
let _sampleCanvas = null;
let _sampleCtx = null;
let _lastFrameMs = 0;
let _lastSizeKey = '';

// Character model cache (recomputed when font metrics change)
let _charModel = null;
let _lookupCache = new Map();

// Precomputed LUT — built asynchronously after each char model rebuild.
// _nearestChar() falls back to brute-force + Map cache while _lut is null.
let _lut = null;

// Tuning knobs
const _FRAME_INTERVAL_MS = 1000 / 30; // throttle text updates (still renders WebGL every frame)
const _GLYPH_SCALE = 4; // higher = better shape vectors, slower init
const _DEFAULT_CONTRAST_EXP = 3.2; // Harri-style per-cell contrast (>1 increases edge definition)
const _DEFAULT_DIR_CONTRAST_EXP = 5.0; // directional contrast for edge emphasis
const _CACHE_RANGE = 11; // quantization buckets per dimension (11^6 ~= 1.77M keys)

let _contrastScale = 1;
let _contrastExp = _DEFAULT_CONTRAST_EXP;
let _dirContrastExp = _DEFAULT_DIR_CONTRAST_EXP;
let _fontScale = 1;

// §4d: Phosphor afterglow / persistence (off by default; enable via setPersistFade())
const _DEFAULT_PERSIST_FADE = 0;
let _persistFade = 0; // 0 = disabled; set to default after motion check
let _reducedMotion = false; // mirrors prefers-reduced-motion at init time

// §P4: Adaptive frame-rate governor
const _MIN_INTERVAL_MS = 33; // ~30 fps (normal ceiling)
const _MAX_INTERVAL_MS = 250; // ~4 fps (absolute floor)
let _dynamicInterval = _FRAME_INTERVAL_MS;
let _consecutiveSlowFrames = 0;
let _afterglowAutoDisabled = false;

function _checkReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );
}

function _relLum01(r, g, b) {
  // relative luminance (sRGB) in [0,1] (gamma ignored; good enough for this use)
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function _clamp01(x) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function _setContrastScale(scale) {
  const next = Number.isFinite(scale) ? scale : 1;
  // Clamp to useful range based on Harri research:
  // - Min 0.5 → exponent ~0.9 (near identity, no visible enhancement)
  // - Max 4.0 → exponent ~7.2 (very sharp edges, before artifact threshold)
  _contrastScale = Math.max(0.5, Math.min(4.0, next));
  _contrastExp = _DEFAULT_CONTRAST_EXP * _contrastScale;
  _dirContrastExp = _DEFAULT_DIR_CONTRAST_EXP * _contrastScale;
  return _contrastScale;
}

function _getContrastScale() {
  return _contrastScale;
}

function _setFontScale(scale) {
  const next = Number.isFinite(scale) ? scale : 1;
  // Clamp to extended range:
  // - Min 0.5 → smaller chars, higher resolution (may be hard to read)
  // - Max 2.5 → larger chars, lower resolution (more legible)
  _fontScale = Math.max(0.5, Math.min(2.5, next));
  return _fontScale;
}

function _getFontScale() {
  return _fontScale;
}

function _getFontMetrics(fontFamily, fontSizePx) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  ctx.font = `${fontSizePx}px ${fontFamily}`;
  const m = ctx.measureText('M');
  const w = Math.max(1, Math.floor(m.width || fontSizePx * 0.6));
  const ascent =
    typeof m.actualBoundingBoxAscent === 'number'
      ? m.actualBoundingBoxAscent
      : fontSizePx * 0.8;
  const descent =
    typeof m.actualBoundingBoxDescent === 'number'
      ? m.actualBoundingBoxDescent
      : fontSizePx * 0.2;
  const h = Math.max(1, Math.floor(ascent + descent));
  return { charW: w, charH: h, ascent, descent };
}

function _getSixSamplePoints(cellW, cellH) {
  // 2x3 staggered pattern (roughly matching Harri's 6D layout)
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
  // Extended external ring of 10 sample points around the cell boundary
  // Harri's "widening" approach: external samples reach into neighboring cells
  // to detect boundaries and enhance edge definition
  const marginX = cellW * 0.25;
  const marginY = cellH * 0.18;
  return [
    // Left side (indices 0, 1, 2)
    [-marginX, cellH * 0.2], // 0: top-left
    [-marginX, cellH * 0.5], // 1: mid-left
    [-marginX, cellH * 0.8], // 2: bottom-left
    // Right side (indices 3, 4, 5)
    [cellW + marginX, cellH * 0.2], // 3: top-right
    [cellW + marginX, cellH * 0.5], // 4: mid-right
    [cellW + marginX, cellH * 0.8], // 5: bottom-right
    // Top side (indices 6, 7)
    [cellW * 0.32, -marginY], // 6: top (left column)
    [cellW * 0.68, -marginY], // 7: top (right column)
    // Bottom side (indices 8, 9)
    [cellW * 0.32, cellH + marginY], // 8: bottom (left column)
    [cellW * 0.68, cellH + marginY], // 9: bottom (right column)
  ];
}

// Mapping from each internal sampling point (0-5) to the external samples that affect it.
//
// This is a "widened" directional-contrast neighborhood (inspired by Harri's
// widened external sampling idea): a bright region adjacent to the cell should
// influence not just the nearest internal component, but also nearby components
// (helps reduce staircasing / abrupt transitions).
//
// External sample ordering in this file:
// - 0..2: left side (top/mid/bottom)
// - 3..5: right side (top/mid/bottom)
// - 6..7: top edge (left/right)
// - 8..9: bottom edge (left/right)
//
// Internal layout indices:
//   0  1
//   2  3
//   4  5
const _EXT_AFFECTING = [
  // Top row: influenced by top edge + whole corresponding side
  [0, 1, 2, 6], // internal 0 (top-left)
  [3, 4, 5, 7], // internal 1 (top-right)
  // Middle row: influenced by side + both top and bottom on that column
  [0, 1, 2, 6, 8], // internal 2 (mid-left)
  [3, 4, 5, 7, 9], // internal 3 (mid-right)
  // Bottom row: influenced by bottom edge + whole corresponding side
  [0, 1, 2, 8], // internal 4 (bot-left)
  [3, 4, 5, 9], // internal 5 (bot-right)
];

function _applyDirectionalContrast(v, extSamples) {
  // Component-wise directional contrast enhancement (Harri's technique)
  // For each internal component, find the max of affecting external samples
  // Then normalize internal to that max and apply contrast exponent
  if (extSamples.length < 10) return v;

  for (let i = 0; i < 6; i++) {
    let maxExt = v[i];
    const affecting = _EXT_AFFECTING[i];
    for (let j = 0; j < affecting.length; j++) {
      const extVal = extSamples[affecting[j]];
      if (extVal > maxExt) maxExt = extVal;
    }

    if (maxExt > v[i] && maxExt > 0.01) {
      const normalized = v[i] / maxExt;
      const enhanced = Math.pow(normalized, _dirContrastExp);
      v[i] = _clamp01(enhanced * maxExt);
    }
  }

  return v;
}

function _buildCharModel({ fontFamily, fontSizePx, charW, charH }) {
  // Printable ASCII 32–126 only (95 chars). Block elements and Braille
  // were removed per stakeholder directive for ASCII-only glyph rendering.
  const chars = [];
  for (let code = 32; code <= 126; code++)
    chars.push(String.fromCharCode(code));

  const cellW = Math.max(2, Math.ceil(charW * _GLYPH_SCALE));
  const cellH = Math.max(2, Math.ceil(charH * _GLYPH_SCALE));

  const canvas = document.createElement('canvas');
  canvas.width = cellW;
  canvas.height = cellH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  const samplePoints = _getSixSamplePoints(cellW, cellH);
  const r = Math.max(1, Math.min(cellW, cellH) * 0.18);

  // A small set of offsets inside a circle (fast approximation of overlap sampling)
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

  const vectors = new Array(chars.length);
  const maxPerDim = new Float32Array(6);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#000';
  ctx.font = `${fontSizePx * _GLYPH_SCALE}px ${fontFamily}`;

  for (let ci = 0; ci < chars.length; ci++) {
    const ch = chars[ci];

    ctx.fillRect(0, 0, cellW, cellH);
    ctx.fillStyle = '#fff';

    const mt = ctx.measureText(ch);
    const left =
      typeof mt.actualBoundingBoxLeft === 'number'
        ? mt.actualBoundingBoxLeft
        : 0;
    const right =
      typeof mt.actualBoundingBoxRight === 'number'
        ? mt.actualBoundingBoxRight
        : mt.width || cellW;
    const ascent =
      typeof mt.actualBoundingBoxAscent === 'number'
        ? mt.actualBoundingBoxAscent
        : cellH * 0.8;
    const descent =
      typeof mt.actualBoundingBoxDescent === 'number'
        ? mt.actualBoundingBoxDescent
        : cellH * 0.2;

    const glyphW = left + right;
    const glyphH = ascent + descent;
    const x = (cellW - glyphW) / 2 - left;
    const y = (cellH - glyphH) / 2 + ascent;

    ctx.fillText(ch, x, y);

    const img = ctx.getImageData(0, 0, cellW, cellH).data;
    const v = new Float32Array(6);

    for (let i = 0; i < 6; i++) {
      const [cx, cy] = samplePoints[i];
      let sum = 0;
      for (let k = 0; k < offsets.length; k++) {
        const ox = offsets[k][0] * r;
        const oy = offsets[k][1] * r;
        const sx = Math.min(cellW - 1, Math.max(0, Math.round(cx + ox)));
        const sy = Math.min(cellH - 1, Math.max(0, Math.round(cy + oy)));
        const idx = (sy * cellW + sx) * 4;
        sum += img[idx] / 255;
      }
      v[i] = sum / offsets.length;
      if (v[i] > maxPerDim[i]) maxPerDim[i] = v[i];
    }

    vectors[ci] = v;
    ctx.fillStyle = '#000';
  }

  // Normalize vectors per dimension (Harri normalization step)
  for (let ci = 0; ci < vectors.length; ci++) {
    const v = vectors[ci];
    for (let i = 0; i < 6; i++) {
      const denom = maxPerDim[i] || 1;
      v[i] = v[i] / denom;
    }
  }

  return { chars, vectors };
}

function _quantKey6(v0, v1, v2, v3, v4, v5) {
  // pack to a small integer in base _CACHE_RANGE
  // Kept for the brute-force fallback path used while the LUT is building.
  const r = _CACHE_RANGE;
  const q0 = Math.min(r - 1, Math.max(0, (v0 * r) | 0));
  const q1 = Math.min(r - 1, Math.max(0, (v1 * r) | 0));
  const q2 = Math.min(r - 1, Math.max(0, (v2 * r) | 0));
  const q3 = Math.min(r - 1, Math.max(0, (v3 * r) | 0));
  const q4 = Math.min(r - 1, Math.max(0, (v4 * r) | 0));
  const q5 = Math.min(r - 1, Math.max(0, (v5 * r) | 0));
  return (((((q0 * r + q1) * r + q2) * r + q3) * r + q4) * r + q5) | 0;
}

function _nearestChar(v, model) {
  // Fast path: O(1) LUT lookup once the async build has completed.
  if (_lut) return lookupChar(_lut, v, model.chars);

  // Fallback: brute-force + Map cache (used for the first ~250 ms of activation)
  const key = _quantKey6(v[0], v[1], v[2], v[3], v[4], v[5]);
  if (_lookupCache.has(key)) return _lookupCache.get(key);

  let best = ' ';
  let bestD = Infinity;
  const vectors = model.vectors;
  const chars = model.chars;

  for (let i = 0; i < vectors.length; i++) {
    const cv = vectors[i];
    const d0 = v[0] - cv[0];
    const d1 = v[1] - cv[1];
    const d2 = v[2] - cv[2];
    const d3 = v[3] - cv[3];
    const d4 = v[4] - cv[4];
    const d5 = v[5] - cv[5];
    const d = d0 * d0 + d1 * d1 + d2 * d2 + d3 * d3 + d4 * d4 + d5 * d5;
    if (d < bestD) {
      bestD = d;
      best = chars[i];
    }
  }

  _lookupCache.set(key, best);
  return best;
}

function _applyCellContrast(v) {
  const max = Math.max(v[0], v[1], v[2], v[3], v[4], v[5]);
  if (!(max > 0)) return v;
  for (let i = 0; i < 6; i++) {
    const n = v[i] / max;
    v[i] = _clamp01(Math.pow(_clamp01(n), _contrastExp) * max);
  }
  return v;
}

function _ensureOverlay(container) {
  if (_overlayEl) return;
  const { canvas, ctx, persistCanvas, persistCtx } = createOverlay(container);
  _overlayEl = canvas;
  _overlayCtx = ctx;
  _persistCanvas = persistCanvas;
  _persistCtx = persistCtx;
}

function _ensureSampler() {
  if (_sampleCanvas) return;
  _sampleCanvas = document.createElement('canvas');
  _sampleCtx = _sampleCanvas.getContext('2d', { willReadFrequently: true });
  _sampleCtx.imageSmoothingEnabled = false;
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
 * Targets approximately 6 sample pixels per character cell dimension, keeping
 * the sample canvas between 5 % and 35 % of viewport resolution for performance.
 *
 * @param {number} charW - character cell width in viewport pixels
 * @returns {number} scale in (0, 1]
 */
function _computeSampleScale(charW) {
  const TARGET_SAMPLE_PX = 6; // sample pixels per char-cell dimension
  return Math.max(0.05, Math.min(0.5, TARGET_SAMPLE_PX / Math.max(1, charW)));
}

function _renderFrame({
  renderer,
  scene,
  width,
  height,
  fontFamily,
  fontSizePx,
  charW,
  charH,
}) {
  _ensureSampler();

  const sampleScale = _computeSampleScale(charW);
  const sampleW = Math.max(1, Math.floor(width * sampleScale));
  const sampleH = Math.max(1, Math.floor(height * sampleScale));
  _sampleCanvas.width = sampleW;
  _sampleCanvas.height = sampleH;
  _sampleCtx.clearRect(0, 0, sampleW, sampleH);
  _sampleCtx.drawImage(renderer.domElement, 0, 0, sampleW, sampleH);

  const imgData = _sampleCtx.getImageData(0, 0, sampleW, sampleH).data;
  const invert = _computeInvertFromScene(scene);

  const cellW = Math.max(1, charW * sampleScale);
  const cellH = Math.max(1, charH * sampleScale);

  const cols = Math.max(8, Math.floor((width * sampleScale) / cellW));
  const rows = Math.max(6, Math.floor((height * sampleScale) / cellH));

  // Rebuild char model when font metrics change; schedule async LUT build
  const sizeKey = `${fontFamily}|${fontSizePx}|${Math.round(charW)}|${Math.round(charH)}`;
  if (!_charModel || _lastSizeKey !== sizeKey) {
    _charModel = _buildCharModel({ fontFamily, fontSizePx, charW, charH });
    _lookupCache = new Map();
    _lut = null;
    _lastSizeKey = sizeKey;
    buildLUTAsync(_charModel)
      .then((lut) => {
        _lut = lut;
      })
      .catch((err) => {
        console.error('LUT build failed:', err);
      });
  }

  const pts = _getSixSamplePoints(cellW, cellH);
  const extPts = _getExternalSamplePoints(cellW, cellH);

  const jit = [
    [0, 0],
    [0.25, -0.2],
    [-0.25, 0.2],
    [0.15, 0.25],
  ];
  const jr = Math.max(0.6, Math.min(cellW, cellH) * 0.08);

  const v = new Float32Array(6);
  const extSamples = new Float32Array(10);

  const totalCells = rows * cols;
  const chars = new Array(totalCells);
  let idx = 0;

  for (let y = 0; y < rows; y++) {
    const baseY = y * cellH;

    for (let x = 0; x < cols; x++) {
      const baseX = x * cellW;

      // Sample internal points (main shape vector)
      for (let i = 0; i < 6; i++) {
        const px = baseX + pts[i][0];
        const py = baseY + pts[i][1];

        let sum = 0;
        for (let s = 0; s < jit.length; s++) {
          const sx = Math.min(
            sampleW - 1,
            Math.max(0, Math.round(px + jit[s][0] * jr))
          );
          const sy = Math.min(
            sampleH - 1,
            Math.max(0, Math.round(py + jit[s][1] * jr))
          );
          const pidx = (sy * sampleW + sx) * 4;
          const lum = _relLum01(
            imgData[pidx],
            imgData[pidx + 1],
            imgData[pidx + 2]
          );
          sum += invert ? 1 - lum : lum;
        }

        v[i] = _clamp01(sum / jit.length);
      }

      // Sample external boundary points for edge detection (single sample — sub-pixel
      // precision is unnecessary for boundary detection at neighboring cells)
      for (let i = 0; i < extPts.length; i++) {
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

      _applyDirectionalContrast(v, extSamples);
      _applyCellContrast(v);

      chars[idx++] = _nearestChar(v, _charModel);
    }
  }

  // Sync overlay canvas dimensions to container
  if (_overlayEl.width !== width || _overlayEl.height !== height) {
    resizeOverlay(_overlayEl, width, height, _persistCanvas);
  }

  // Per-cell phosphor colours derived from source image luminance
  const cellW_sample = sampleW / cols;
  const cellH_sample = sampleH / rows;
  const colors = sampleColors(
    imgData,
    sampleW,
    cellW_sample,
    cellH_sample,
    cols,
    rows
  );

  const fontStr = `${fontSizePx}px ${fontFamily}`;
  paintFrame(
    _overlayCtx,
    chars,
    colors,
    cols,
    rows,
    charW,
    charH,
    fontStr,
    _persistCanvas,
    _persistCtx,
    _persistFade
  );
}

/**
 * Initialize alternate view
 * @param {Object} previewManager - PreviewManager instance
 * @returns {Object} API for controlling the alternate view
 */
export async function initAltView(previewManager) {
  const { renderer, scene, container } = previewManager;

  _ensureOverlay(container);

  // Pick a conservative font size for performance/readability.
  const fontFamily =
    '\'Iosevka Term\', ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';
  let fontSizePx = 10;
  let metrics = _getFontMetrics(fontFamily, fontSizePx);

  function _recomputeFontForSize(width, height) {
    // Adaptive quality: target 2000–8000 character cells depending on viewport area.
    // Larger viewports get more cells for better detail; smaller viewports get fewer
    // cells for performance.
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
    const scaled = Math.round(approxSize * _fontScale);
    fontSizePx = Math.max(6, Math.min(24, scaled));
    metrics = _getFontMetrics(fontFamily, fontSizePx);
  }

  _recomputeFontForSize(container.clientWidth, container.clientHeight);

  // §4d: Initialise reduced-motion state; afterglow off until first enable()
  _reducedMotion = _checkReducedMotion();

  return {
    enable() {
      // Re-check reduced-motion on every enable so media-query changes are respected
      _reducedMotion = _checkReducedMotion();
      _persistFade = _reducedMotion ? 0 : _DEFAULT_PERSIST_FADE;

      // Reset adaptive governor on each enable
      _dynamicInterval = _FRAME_INTERVAL_MS;
      _consecutiveSlowFrames = 0;
      _afterglowAutoDisabled = false;

      isEnabled = true;
      _overlayEl.style.display = 'block';
      if (canvasOpacity === null) {
        canvasOpacity = renderer.domElement.style.opacity || '';
      }
      renderer.domElement.style.opacity = '0';
    },
    disable() {
      isEnabled = false;
      _overlayEl.style.display = 'none';
      renderer.domElement.style.opacity = canvasOpacity ?? '';
      // Clear persistence canvas so stale afterglow does not show on next enable
      if (_persistCanvas && _persistCtx) {
        _persistCtx.clearRect(
          0,
          0,
          _persistCanvas.width,
          _persistCanvas.height
        );
      }
    },
    toggle() {
      isEnabled ? this.disable() : this.enable();
      return isEnabled;
    },
    render() {
      // Always render the underlying scene so controls + animation stay correct.
      renderer.render(scene, previewManager.getActiveCamera());

      if (!isEnabled) return;
      const now = performance.now();
      if (now - _lastFrameMs < _dynamicInterval) return;
      _lastFrameMs = now;

      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w <= 0 || h <= 0) return;

      const frameStart = performance.now();
      _renderFrame({
        renderer,
        scene,
        width: w,
        height: h,
        fontFamily,
        fontSizePx,
        charW: metrics.charW,
        charH: metrics.charH,
      });
      const frameDuration = performance.now() - frameStart;

      // §P4: Adaptive frame-rate governor
      if (frameDuration > _FRAME_INTERVAL_MS * 1.5) {
        _dynamicInterval = Math.min(_MAX_INTERVAL_MS, _dynamicInterval * 2);
        _consecutiveSlowFrames++;
        if (
          _consecutiveSlowFrames >= 3 &&
          frameDuration > 150 &&
          !_afterglowAutoDisabled
        ) {
          _afterglowAutoDisabled = true;
          _persistFade = 0;
          console.warn(
            '[Alt View] Afterglow auto-disabled due to sustained low frame rate'
          );
        }
      } else if (frameDuration < _FRAME_INTERVAL_MS * 0.75) {
        _dynamicInterval = Math.max(_MIN_INTERVAL_MS, _dynamicInterval / 2);
        _consecutiveSlowFrames = 0;
      }
    },
    resize(width, height) {
      _recomputeFontForSize(width, height);
    },
    setContrastScale(scale) {
      return _setContrastScale(scale);
    },
    getContrastScale() {
      return _getContrastScale();
    },
    setFontScale(scale) {
      _setFontScale(scale);
      _recomputeFontForSize(container.clientWidth, container.clientHeight);
      return _getFontScale();
    },
    getFontScale() {
      return _getFontScale();
    },
    dispose() {
      isEnabled = false;
      if (canvasOpacity !== null) {
        renderer.domElement.style.opacity = canvasOpacity;
      }
      _overlayEl?.remove();
      _overlayEl = null;
      _overlayCtx = null;
      _persistCanvas = null;
      _persistCtx = null;
      _sampleCanvas = null;
      _sampleCtx = null;
      _charModel = null;
      _lookupCache = new Map();
      _lut = null;
    },
    isEnabled: () => isEnabled,
    getEffectiveFps() {
      return Math.round(1000 / _dynamicInterval);
    },

    // §4d: Phosphor afterglow controls
    setPersistFade(value) {
      const clamped = Math.max(
        0,
        Math.min(1, Number.isFinite(value) ? value : 0)
      );
      // Never enable fade when reduced-motion is active
      _persistFade = _reducedMotion ? 0 : clamped;
      return _persistFade;
    },
    getPersistFade() {
      return _persistFade;
    },
    /**
     * Allow the caller to push the current prefers-reduced-motion state without
     * re-initialising the whole view.  Immediately forces fade to 0 when true.
     * @param {boolean} reduced
     */
    setReducedMotion(reduced) {
      _reducedMotion = Boolean(reduced);
      if (_reducedMotion) {
        _persistFade = 0;
        // Clear any stale persistence content
        if (_persistCanvas && _persistCtx) {
          _persistCtx.clearRect(
            0,
            0,
            _persistCanvas.width,
            _persistCanvas.height
          );
        }
      }
    },
    clearPersistence() {
      if (_persistCanvas && _persistCtx) {
        _persistCtx.clearRect(
          0,
          0,
          _persistCanvas.width,
          _persistCanvas.height
        );
      }
    },
  };
}
