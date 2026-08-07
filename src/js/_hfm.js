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

import { createLookup } from './_hfm-lookup.js';
import {
  createOverlay,
  resizeOverlay,
  buildGlyphAtlas,
  getPhosphorColor,
  paintFrame,
  GLYPH_COUNT,
} from './_hfm-paint.js';

let isEnabled = false;
let canvasOpacity = null;

// Renderer state (module-level singleton)
let _overlayCanvas = null; // HTMLCanvasElement
let _overlayCtx = null; // CanvasRenderingContext2D
let _persistCanvas = null; // off-screen afterglow persistence canvas
let _persistCtx = null;
let _sampleCanvas = null;
let _sampleCtx = null;

// Glyph atlas + shape-vector model (rebuilt when font metrics / theme change)
let _atlas = null;
let _glyphVectors = null;
let _lookup = null;
let _atlasKey = '';

// Render-on-demand scheduling
let _dirty = true;
let _lastFrameMs = 0;
let _lastConvertMs = 0;

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

let _dynamicInterval = _MIN_INTERVAL_MS;
let _contrastScale = 1;
let _contrastExp = _DEFAULT_CONTRAST_EXP;
let _dirContrastExp = _DEFAULT_DIR_CONTRAST_EXP;
let _fontScale = 1;

// Phosphor afterglow / persistence (off by default; enable via setPersistFade())
const _DEFAULT_PERSIST_FADE = 0;
let _persistFade = 0;
let _reducedMotion = false; // mirrors prefers-reduced-motion

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

function _setContrastScale(scale) {
  const next = Number.isFinite(scale) ? scale : 1;
  // Clamp to useful range based on the researched exponent windows:
  // - Min 0.5 → exponent ~0.9 (near identity, no visible enhancement)
  // - Max 4.0 → exponent ~7.2 (very sharp edges, before artifact threshold)
  _contrastScale = Math.max(0.5, Math.min(4.0, next));
  _contrastExp = _DEFAULT_CONTRAST_EXP * _contrastScale;
  _dirContrastExp = _DEFAULT_DIR_CONTRAST_EXP * _contrastScale;
  _dirty = true;
  return _contrastScale;
}

function _setFontScale(scale) {
  const next = Number.isFinite(scale) ? scale : 1;
  // - Min 0.5 → smaller chars, higher resolution (may be hard to read)
  // - Max 2.5 → larger chars, lower resolution (more legible)
  _fontScale = Math.max(0.5, Math.min(2.5, next));
  _dirty = true;
  return _fontScale;
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

function _applyDirectionalContrast(v, extSamples) {
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
      const enhanced = Math.pow(normalized, _dirContrastExp);
      v[i] = _clamp01(enhanced * maxExt);
    }
  }

  return v;
}

function _applyCellContrast(v) {
  // Global contrast: max-normalize the cell then apply the exponent.
  const max = Math.max(v[0], v[1], v[2], v[3], v[4], v[5]);
  if (!(max > 0)) return v;
  for (let i = 0; i < 6; i++) {
    const n = v[i] / max;
    v[i] = _clamp01(Math.pow(_clamp01(n), _contrastExp) * max);
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

function _ensureGlyphModel({ fontFamily, fontSizePx, charW, charH, dpr }) {
  const color = getPhosphorColor();
  const key = `${fontFamily}|${fontSizePx}|${charW}|${charH}|${dpr}|${color}`;
  if (_atlas && _atlasKey === key) return;

  _atlas = buildGlyphAtlas({
    fontFamily,
    fontSizePx,
    charW,
    charH,
    dpr,
    color,
  });
  _glyphVectors = _buildGlyphVectors(_atlas);
  _lookup = createLookup(_glyphVectors);
  _atlasKey = key;
}

function _ensureOverlay(container) {
  if (_overlayCanvas) return;
  const { canvas, ctx, persistCanvas, persistCtx } = createOverlay(container);
  _overlayCanvas = canvas;
  _overlayCtx = ctx;
  _persistCanvas = persistCanvas;
  _persistCtx = persistCtx;
}

function _ensureSampler() {
  if (_sampleCanvas) return;
  _sampleCanvas = document.createElement('canvas');
  _sampleCtx = _sampleCanvas.getContext('2d', { willReadFrequently: true });
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

  const dpr = _getDpr();
  _ensureGlyphModel({ fontFamily, fontSizePx, charW, charH, dpr });

  const sampleScale = _computeSampleScale(charW);
  const sampleW = Math.max(1, Math.floor(width * sampleScale));
  const sampleH = Math.max(1, Math.floor(height * sampleScale));
  // Resizing a canvas clears it and resets context state — only do it when
  // the dimensions actually change.
  if (_sampleCanvas.width !== sampleW || _sampleCanvas.height !== sampleH) {
    _sampleCanvas.width = sampleW;
    _sampleCanvas.height = sampleH;
  }
  // Bilinear downscale = GPU box filter, standing in for area-average
  // supersampling; one tap per sample point then suffices.
  _sampleCtx.imageSmoothingEnabled = true;
  _sampleCtx.clearRect(0, 0, sampleW, sampleH);
  _sampleCtx.drawImage(renderer.domElement, 0, 0, sampleW, sampleH);

  const imgData = _sampleCtx.getImageData(0, 0, sampleW, sampleH).data;
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
  let idx = 0;

  for (let y = 0; y < rows; y++) {
    const baseY = y * cellH;

    for (let x = 0; x < cols; x++) {
      const baseX = x * cellW;

      // Internal points (main shape vector) — single tap each
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

      _applyDirectionalContrast(v, extSamples);
      _applyCellContrast(v);

      glyphIndices[idx++] = _lookup.nearestIndex(v);
    }
  }

  // Sync overlay canvas backing store to container size at device resolution
  const backingW = Math.max(1, Math.round(width * dpr));
  const backingH = Math.max(1, Math.round(height * dpr));
  if (_overlayCanvas.width !== backingW || _overlayCanvas.height !== backingH) {
    resizeOverlay(_overlayCanvas, width, height, dpr, _persistCanvas);
  }

  paintFrame(
    _overlayCtx,
    glyphIndices,
    cols,
    rows,
    _atlas,
    charW,
    charH,
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
    const scaled = Math.round(approxSize * _fontScale);
    fontSizePx = Math.max(6, Math.min(24, scaled));
    metrics = _getFontMetrics(fontFamily, fontSizePx);
  }

  _recomputeFontForSize(container.clientWidth, container.clientHeight);

  _reducedMotion = _checkReducedMotion();

  const _onControlsChange = () => {
    _dirty = true;
  };

  return {
    enable() {
      // Re-check reduced-motion on every enable so media-query changes are respected
      _reducedMotion = _checkReducedMotion();
      _persistFade = _reducedMotion ? 0 : _DEFAULT_PERSIST_FADE;

      _dynamicInterval = _MIN_INTERVAL_MS;
      _dirty = true;

      // Camera changes (drag, damping decay, programmatic moves) mark the
      // frame dirty so conversion runs only while something moves.
      previewManager.controls?.addEventListener?.('change', _onControlsChange);

      isEnabled = true;
      _overlayCanvas.style.display = 'block';

      // One-shot CRT power-on flourish (pure CSS; skipped for reduced motion)
      if (!_reducedMotion) {
        _overlayCanvas.classList.remove('crt-power-on');
        void _overlayCanvas.offsetWidth; // restart animation if re-enabling
        _overlayCanvas.classList.add('crt-power-on');
        _overlayCanvas.addEventListener(
          'animationend',
          (e) => e.target.classList.remove('crt-power-on'),
          { once: true }
        );
      }

      if (canvasOpacity === null) {
        canvasOpacity = renderer.domElement.style.opacity || '';
      }
      renderer.domElement.style.opacity = '0';
    },
    disable() {
      isEnabled = false;
      previewManager.controls?.removeEventListener?.(
        'change',
        _onControlsChange
      );
      _overlayCanvas.style.display = 'none';
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

      // Auto-rotate moves the camera every frame without firing 'change'
      if (previewManager.isAutoRotateEnabled?.()) {
        _dirty = true;
      }

      const now = performance.now();
      if (now - _lastFrameMs < _dynamicInterval) return;
      // Skip conversion while clean; the fallback tick self-heals any missed
      // invalidation at ~1 Hz.
      if (!_dirty && now - _lastConvertMs <= _FALLBACK_TICK_MS) return;
      _lastFrameMs = now;

      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w <= 0 || h <= 0) return;

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
      _dirty = false;
      const after = performance.now();
      _lastConvertMs = after;

      // Frame governor: back off proportionally on slow conversions, decay
      // back toward 30 fps one step per fast conversion (no ping-ponging).
      const duration = after - now;
      if (duration > _MIN_INTERVAL_MS) {
        _dynamicInterval = Math.min(
          _MAX_INTERVAL_MS,
          Math.ceil(duration / _MIN_INTERVAL_MS) * _MIN_INTERVAL_MS
        );
      } else {
        _dynamicInterval = Math.max(
          _MIN_INTERVAL_MS,
          _dynamicInterval - _MIN_INTERVAL_MS
        );
      }
    },
    invalidate() {
      _dirty = true;
    },
    resize(width, height) {
      _recomputeFontForSize(width, height);
      _dirty = true;
    },
    /**
     * Rebuild the glyph atlas (re-reading --color-accent) — call after a
     * theme change so the phosphor tint follows the active variant.
     */
    rebuildGlyphs() {
      _atlasKey = '';
      _dirty = true;
    },
    setContrastScale(scale) {
      return _setContrastScale(scale);
    },
    getContrastScale() {
      return _contrastScale;
    },
    setFontScale(scale) {
      _setFontScale(scale);
      _recomputeFontForSize(container.clientWidth, container.clientHeight);
      return _fontScale;
    },
    getFontScale() {
      return _fontScale;
    },
    dispose() {
      isEnabled = false;
      previewManager.controls?.removeEventListener?.(
        'change',
        _onControlsChange
      );
      if (canvasOpacity !== null) {
        renderer.domElement.style.opacity = canvasOpacity;
      }
      _overlayCanvas?.remove();
      _overlayCanvas = null;
      _overlayCtx = null;
      _persistCanvas = null;
      _persistCtx = null;
      _sampleCanvas = null;
      _sampleCtx = null;
      _atlas = null;
      _glyphVectors = null;
      _lookup = null;
      _atlasKey = '';
      _dirty = true;
    },
    isEnabled: () => isEnabled,

    // Phosphor afterglow controls
    setPersistFade(value) {
      const clamped = Math.max(
        0,
        Math.min(1, Number.isFinite(value) ? value : 0)
      );
      // Never enable fade when reduced-motion is active
      _persistFade = _reducedMotion ? 0 : clamped;
      _dirty = true;
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
        _dirty = true;
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
        _dirty = true;
      }
    },
  };
}
