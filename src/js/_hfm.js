// Alternate rendering module (generic naming)
//
// Shape-vector character rendering technique inspired by external research
// (see attribution in CREDITS.md / THIRD_PARTY_NOTICES.md).
//
// This implementation is clean-room; technique concepts only, no code copied.
// The 6D shape vector approach and per-cell contrast enhancement are derived
// from the educational concepts described in that article.

let isEnabled = false;
let canvasOpacity = null;

// Renderer state (module-level singleton)
let _overlayEl = null;
let _sampleCanvas = null;
let _sampleCtx = null;
let _lastFrameMs = 0;
let _lastSizeKey = '';

// Character model cache (recomputed when font metrics change)
let _charModel = null;
let _lookupCache = new Map();

// Tuning knobs (kept small; chosen for speed)
const _FRAME_INTERVAL_MS = 1000 / 15; // throttle text updates (still renders WebGL every frame)
const _SAMPLE_SCALE = 0.22; // how aggressively we downsample the WebGL canvas
const _GLYPH_SCALE = 4; // higher = better shape vectors, slower init
const _DEFAULT_CONTRAST_EXP = 1.8; // Harri-style per-cell contrast shaping (>1 increases edge definition)
const _DEFAULT_DIR_CONTRAST_EXP = 2.5; // directional contrast for edge emphasis
const _CACHE_RANGE = 11; // quantization buckets per dimension (11^6 ~= 1.77M keys)

let _contrastScale = 1;
let _contrastExp = _DEFAULT_CONTRAST_EXP;
let _dirContrastExp = _DEFAULT_DIR_CONTRAST_EXP;
let _fontScale = 1;

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
  const w = Math.max(1, m.width || fontSizePx * 0.6);
  const ascent =
    typeof m.actualBoundingBoxAscent === 'number'
      ? m.actualBoundingBoxAscent
      : fontSizePx * 0.8;
  const descent =
    typeof m.actualBoundingBoxDescent === 'number'
      ? m.actualBoundingBoxDescent
      : fontSizePx * 0.2;
  const h = Math.max(1, ascent + descent);
  return { charW: w, charH: h, ascent, descent };
}

function _getSixSamplePoints(cellW, cellH) {
  // 2x3 staggered pattern (roughly matching Harri’s 6D layout)
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
    // Find max external value affecting this internal component
    let maxExt = v[i];
    const affecting = _EXT_AFFECTING[i];
    for (let j = 0; j < affecting.length; j++) {
      const extVal = extSamples[affecting[j]];
      if (extVal > maxExt) maxExt = extVal;
    }

    // Apply component-wise contrast enhancement
    // Only enhance if external is brighter (indicating boundary)
    if (maxExt > v[i] && maxExt > 0.01) {
      const normalized = v[i] / maxExt;
      const enhanced = Math.pow(normalized, _dirContrastExp);
      v[i] = _clamp01(enhanced * maxExt);
    }
  }

  return v;
}

function _buildCharModel({ fontFamily, fontSizePx, charW, charH }) {
  // Build shape vectors for printable characters 32..126 (95 chars)
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

  // Draw white glyphs on black and measure per-region coverage.
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#000';
  ctx.font = `${fontSizePx * _GLYPH_SCALE}px ${fontFamily}`;

  for (let ci = 0; ci < chars.length; ci++) {
    const ch = chars[ci];

    // clear bg
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
        // red channel is enough (white on black)
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
  const el = document.createElement('pre');
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText = `
    position: absolute;
    inset: 0;
    margin: 0;
    padding: 6px;
    overflow: hidden;
    background: var(--color-bg-primary, #000);
    color: var(--color-text-primary, #0f0);
    font-family: var(--font-family-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace);
    font-variant-ligatures: none;
    line-height: 1;
    letter-spacing: 0;
    user-select: none;
    pointer-events: none;
    display: none;
    z-index: 5;
  `;
  container.appendChild(el);
  _overlayEl = el;
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

function _renderToText({
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

  const sampleW = Math.max(1, Math.floor(width * _SAMPLE_SCALE));
  const sampleH = Math.max(1, Math.floor(height * _SAMPLE_SCALE));
  _sampleCanvas.width = sampleW;
  _sampleCanvas.height = sampleH;
  _sampleCtx.clearRect(0, 0, sampleW, sampleH);
  _sampleCtx.drawImage(renderer.domElement, 0, 0, sampleW, sampleH);

  const img = _sampleCtx.getImageData(0, 0, sampleW, sampleH).data;
  const invert = _computeInvertFromScene(scene);

  const scale = _SAMPLE_SCALE;
  const cellW = Math.max(1, charW * scale);
  const cellH = Math.max(1, charH * scale);

  const cols = Math.max(8, Math.floor((width * scale) / cellW));
  const rows = Math.max(6, Math.floor((height * scale) / cellH));

  // Recompute char model when font metrics change
  const sizeKey = `${fontFamily}|${fontSizePx}|${Math.round(charW)}|${Math.round(charH)}`;
  if (!_charModel || _lastSizeKey !== sizeKey) {
    _charModel = _buildCharModel({ fontFamily, fontSizePx, charW, charH });
    _lookupCache = new Map();
    _lastSizeKey = sizeKey;
  }

  const pts = _getSixSamplePoints(cellW, cellH);
  const extPts = _getExternalSamplePoints(cellW, cellH);

  // small multisample around each point (helps reduce aliasing)
  const jit = [
    [0, 0],
    [0.35, 0.1],
    [-0.25, -0.15],
    [0.1, -0.3],
  ];
  const jr = Math.max(0.6, Math.min(cellW, cellH) * 0.08);

  const v = new Float32Array(6);
  const extSamples = new Float32Array(10); // 10 external sample points
  const lines = new Array(rows);

  for (let y = 0; y < rows; y++) {
    let line = '';
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
          const idx = (sy * sampleW + sx) * 4;
          const lum = _relLum01(img[idx], img[idx + 1], img[idx + 2]);
          sum += invert ? 1 - lum : lum;
        }

        v[i] = _clamp01(sum / jit.length);
      }

      // Sample external boundary points for edge detection
      for (let i = 0; i < extPts.length; i++) {
        const px = baseX + extPts[i][0];
        const py = baseY + extPts[i][1];

        let sum = 0;
        let count = 0;
        for (let s = 0; s < jit.length; s++) {
          // IMPORTANT: do NOT clamp before bounds-checking.
          // Directional contrast relies on truly sampling outside the cell.
          const sx = Math.round(px + jit[s][0] * jr);
          const sy = Math.round(py + jit[s][1] * jr);
          if (sx >= 0 && sx < sampleW && sy >= 0 && sy < sampleH) {
            const idx = (sy * sampleW + sx) * 4;
            const lum = _relLum01(img[idx], img[idx + 1], img[idx + 2]);
            sum += invert ? 1 - lum : lum;
            count++;
          }
        }

        extSamples[i] = count > 0 ? _clamp01(sum / count) : 0;
      }

      // Apply directional contrast first (edge enhancement)
      _applyDirectionalContrast(v, extSamples);

      // Then apply per-cell contrast (Harri's technique)
      _applyCellContrast(v);

      const ch = _nearestChar(v, _charModel);
      line += ch;
    }

    lines[y] = line;
  }

  // Update overlay font each time (keeps it consistent across resizes)
  _overlayEl.style.fontFamily = fontFamily;
  _overlayEl.style.fontSize = `${fontSizePx}px`;

  // Text update
  _overlayEl.textContent = lines.join('\n');
}

/**
 * Initialize alternate view
 * @param {Object} previewManager - PreviewManager instance
 * @returns {Object} API for controlling the alternate view
 */
export async function initAltView(previewManager) {
  const { renderer, scene, camera, container } = previewManager;

  _ensureOverlay(container);

  // Pick a conservative font size for performance/readability.
  // (We intentionally do not add UI controls for tuning here.)
  const fontFamily =
    'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';
  let fontSizePx = 10;
  let metrics = _getFontMetrics(fontFamily, fontSizePx);

  function _recomputeFontForSize(width, _height) {
    // Auto-adjust size to keep a reasonable character count on different viewport sizes.
    const targetCols = Math.max(70, Math.min(140, Math.floor(width / 7)));
    const approxSize = Math.max(
      8,
      Math.min(14, Math.floor(width / targetCols))
    );
    const scaled = Math.round(approxSize * _fontScale);
    fontSizePx = Math.max(6, Math.min(24, scaled));
    metrics = _getFontMetrics(fontFamily, fontSizePx);
  }

  _recomputeFontForSize(container.clientWidth, container.clientHeight);

  return {
    enable() {
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
    },
    toggle() {
      isEnabled ? this.disable() : this.enable();
      return isEnabled;
    },
    render() {
      // Always render the underlying scene so controls + animation stay correct.
      // Auto-rotation is handled by the main PreviewManager's OrbitControls.
      renderer.render(scene, camera);

      if (!isEnabled) return;
      const now = performance.now();
      if (now - _lastFrameMs < _FRAME_INTERVAL_MS) return;
      _lastFrameMs = now;

      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w <= 0 || h <= 0) return;

      _renderToText({
        renderer,
        scene,
        width: w,
        height: h,
        fontFamily,
        fontSizePx,
        charW: metrics.charW,
        charH: metrics.charH,
      });
    },
    resize(width, height) {
      // Keep the text grid roughly stable across resizes.
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
      _sampleCanvas = null;
      _sampleCtx = null;
      _charModel = null;
      _lookupCache = new Map();
    },
    isEnabled: () => isEnabled,
  };
}
