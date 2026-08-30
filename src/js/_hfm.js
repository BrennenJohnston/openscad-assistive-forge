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

import { createGpuGlyphPass } from './_hfm-gpu.js';
import {
  driveWithMemory,
  ensureHistory,
  glyphWithMemory,
  normalizeHysteresis,
  reverseWithMemory,
  shapeDistance2,
} from './_hfm-hysteresis.js';
import { createLookup } from './_hfm-lookup.js';
import {
  clearAfterglow,
  createOverlay,
  resizeOverlay,
  buildGlyphAtlas,
  getPhosphorColor,
  paintFrame,
  parsePaletteColor,
  normalizeChroma,
  pickPaletteIndex,
  cellChroma,
  driveColor,
  nextReverseLift,
  normalizeInkBudget,
  pickIntensityIndex,
  whiteAllowed,
  GLYPH_COUNT,
  SPACE_INDEX,
  FIRST_CHAR_CODE,
} from './_hfm-paint.js';
import { anchoredGlyph, buildLadders } from './game/city-glyph-field.js';

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

    // CW-21 reverse video: an extra atlas at the END of intensityAtlases whose
    // cells are solid phosphor with the glyph knocked out. Only cells at or
    // above reverseThreshold take it, because a band of solid cells reads as a
    // painted wall rather than a city.
    reverseThreshold: null, // 0..1, or null for no reverse video
    reverseAtlasIndex: -1,

    // CW-21: carry the afterglow inside the composite path. Opt-in, because
    // it changes how a trail looks (a decaying maximum rather than a
    // source-over blend) as well as what it costs.
    glowInComposite: false,

    // CW-21 P4: CRT decoration, both off unless a caller asks.
    bloomPx: 0,
    scanlineDim: 0,

    // CW-23 surface classes: a per-cell class map supplied by the caller,
    // plus one glyph vocabulary per class. Both are handed IN so the
    // converter stays ignorant of what a "road" is — it only knows that
    // cells carrying class N choose from vocabulary N.
    classMapProvider: null,
    classVocabularies: null,
    classLookups: null,

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

    // CW-30 sampling plan: the distinct sample pixels a cell's sixteen taps
    // resolve to, deduped once per cell geometry rather than per cell.
    tapPlan: null,
    tapPlanKey: '',

    // CW-30 A/B switches, off in production and flipped only by the bench
    // (setBenchLegacy, DEV-only). Each one forces the pre-CW-30 path for one
    // step, so the old and the new can be measured in the SAME session — the
    // only comparison this machine's numbers support.
    benchLegacyTaps: false,
    benchLegacyContrast: false,
    benchLegacyCpuSample: false,

    // CW-52 sequence instrument, DEV-only and OFF unless a bench asks. The
    // fractured flashes the owner reported are a TEMPORAL defect, so the
    // measurement has to be what each cell decided on frame after frame -
    // its glyph, its drive level, and the luminance those were decided from.
    // Reading that out of the painted pixels cannot separate a dense glyph
    // from a reverse-video cell, so the decisions are retained here instead.
    // Off, nothing is written and no array is allocated.
    devCellProbe: false,
    lastCols: 0,
    lastRows: 0,
    lastGlyphIndices: null,
    lastProbeIntensity: null,
    lastCellLum: null,

    // CW-32 GPU glyph pick: caller opt-in, built lazily on the first frame
    // and disabled permanently for the session the moment anything fails.
    gpuSample: false,
    gpuPass: null,
    gpuInternal: null,
    gpuExternal: null,
    gpuClassTextureProvider: null,

    // CW-68 temporal hysteresis. OFF for every instance until a caller asks,
    // because it changes what the converter draws and the main app's Alt View
    // is a STILL: memory of a previous frame can only cost it. The game turns
    // it on for its own instance. See _hfm-hysteresis.js for the rules; the
    // history is per instance and is thrown away whenever the grid, the
    // palette, the drive levels or the atlas change, since a cell index then
    // means a different place or a different vocabulary.
    hysteresis: null,
    hysteresisHistory: null,

    // CW-70: an upper bound on the share of cells painted as solid phosphor.
    // null is OFF and is the default everywhere. The bound is held by lifting
    // the reverse-video threshold one conversion behind (nextReverseLift), so
    // it costs one comparison per frame and no readback.
    reverseShareCap: null,
    reverseLift: 0,
    reverseLiftMax: 0.19,

    // CW-71: the palette-mode ink budget. null is OFF and is the default for
    // every instance; the game turns it on for its own. See _hfm-paint.js.
    inkBudget: null,
    paletteWhiteIndex: -1,

    // CW-30 contrast curves: pow(t, exp) tabulated per exponent, rebuilt only
    // when the contrast setting moves.
    cellCurve: null,
    dirCurve: null,
    curveKey: '',

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

// Tap-plan packing: offsets are small (a sample-space cell is at most 4 px
// wide, because _computeSampleScale caps the scale at 0.5 and targets 4), so
// a bias of 1024 leaves room to spare while keeping the key a small integer.
const _TAP_PACK_BIAS = 1024;

/**
 * The distinct sample pixels a cell's 16 taps actually read (CW-30).
 *
 * The 6 internal and 10 external taps are named as 16 positions, but they are
 * ROUNDED to whole sample pixels, and at small character sizes several of
 * them round to the same pixel. At the 10% floor a cell is 1x2 sample pixels
 * and all sixteen taps land on SIX distinct pixels - the external ring reads
 * exactly the pixels the internal points already read. Reading each one once
 * and handing the value to every tap that asked for it is not an
 * approximation: every tap receives the number it would have computed.
 *
 * This only works when a cell lands on whole sample pixels, because then
 * `Math.round(base + p)` is exactly `base + Math.round(p)` and the offsets are
 * the same for every cell in the frame. Otherwise there is no shared plan and
 * the caller falls back to rounding per tap per cell.
 *
 * @returns {object|null} the plan, or null when the grid is not integral
 */
function _buildTapPlan(cellW, cellH) {
  if (!Number.isInteger(cellW) || !Number.isInteger(cellH)) return null;

  const pts = _getSixSamplePoints(cellW, cellH);
  const extPts = _getExternalSamplePoints(cellW, cellH);
  const dx = [];
  const dy = [];
  const slots = new Map();
  const slotFor = (ox, oy) => {
    const packed = (ox + _TAP_PACK_BIAS) * 4096 + (oy + _TAP_PACK_BIAS);
    let slot = slots.get(packed);
    if (slot === undefined) {
      slot = dx.length;
      dx.push(ox);
      dy.push(oy);
      slots.set(packed, slot);
    }
    return slot;
  };

  const internal = new Int32Array(6);
  for (let i = 0; i < 6; i++) {
    internal[i] = slotFor(Math.round(pts[i][0]), Math.round(pts[i][1]));
  }
  const external = new Int32Array(10);
  for (let i = 0; i < 10; i++) {
    external[i] = slotFor(Math.round(extPts[i][0]), Math.round(extPts[i][1]));
  }

  const count = dx.length;
  return {
    count,
    dx: Int32Array.from(dx),
    dy: Int32Array.from(dy),
    internal,
    external,
    lum: new Float32Array(count),
    // Internal taps CLAMP to the edge of the sample buffer; external taps read
    // as 0 when they fall outside it. One shared read serves both, so the
    // clamped value and the in-bounds answer are stored separately.
    inBounds: new Uint8Array(count),
    red: new Float32Array(count),
    green: new Float32Array(count),
    blue: new Float32Array(count),
  };
}

// Contrast curve resolution (CW-30). Both contrast passes raise a number in
// [0, 1] to a power that is constant for the whole frame, so the curve can be
// tabulated once and read instead of recomputed 12 times per cell. 2048 steps
// with linear interpolation keeps the worst-case error near 6e-7 - four
// orders of magnitude below the 1/11 quantization step the glyph key rounds
// to - while the two tables together stay inside 16 KB and so inside L1.
const _CURVE_STEPS = 2048;

/**
 * Tabulate pow(t, exp) for t in [0, 1].
 *
 * The array carries one extra entry past the end so that t === 1 lands on
 * index _CURVE_STEPS with a real neighbour to interpolate against; reading
 * one off the end of a Float32Array yields undefined, and undefined would
 * turn the whole cell into NaN.
 */
function _buildContrastCurve(exp) {
  const table = new Float32Array(_CURVE_STEPS + 2);
  for (let i = 0; i <= _CURVE_STEPS; i++) {
    table[i] = Math.pow(i / _CURVE_STEPS, exp);
  }
  table[_CURVE_STEPS + 1] = table[_CURVE_STEPS];
  return table;
}

function _ensureContrastCurves(st) {
  const key = `${st.contrastExp}|${st.dirContrastExp}`;
  if (st.curveKey === key) return;
  st.cellCurve = _buildContrastCurve(st.contrastExp);
  st.dirCurve = _buildContrastCurve(st.dirContrastExp);
  st.curveKey = key;
}

/**
 * Read a tabulated curve at t, which callers guarantee is within [0, 1].
 *
 * Both call sites divide by a value proven to be the larger, and every input
 * to them has been through _clamp01, so t cannot go negative or past one.
 */
function _curveAt(table, t) {
  const x = t * _CURVE_STEPS;
  const i = x | 0;
  const a = table[i];
  return a + (table[i + 1] - a) * (x - i);
}

function _applyDirectionalContrast(st, v, extSamples) {
  // Component-wise directional contrast: normalize each internal component
  // to the max of its affecting external samples, then sharpen.
  const curve = st.benchLegacyContrast ? null : st.dirCurve;
  for (let i = 0; i < 6; i++) {
    let maxExt = v[i];
    const affecting = _EXT_AFFECTING[i];
    for (let j = 0; j < affecting.length; j++) {
      const extVal = extSamples[affecting[j]];
      if (extVal > maxExt) maxExt = extVal;
    }

    if (maxExt > v[i] && maxExt > 0.01) {
      const normalized = v[i] / maxExt;
      const enhanced = curve
        ? _curveAt(curve, normalized)
        : Math.pow(normalized, st.dirContrastExp);
      v[i] = _clamp01(enhanced * maxExt);
    }
  }

  return v;
}

function _applyCellContrast(st, v) {
  // Global contrast: max-normalize the cell then apply the exponent.
  const max = Math.max(v[0], v[1], v[2], v[3], v[4], v[5]);
  if (!(max > 0)) return v;
  const curve = st.benchLegacyContrast ? null : st.cellCurve;
  for (let i = 0; i < 6; i++) {
    const n = v[i] / max;
    v[i] = _clamp01(
      (curve ? _curveAt(curve, n) : Math.pow(_clamp01(n), st.contrastExp)) * max
    );
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
  const effectKey = `${st.bloomPx}`;
  const intensityKey =
    !st.palette && st.intensityLevels ? st.intensityLevels.join(',') : '';
  const key = `${fontFamily}|${fontSizePx}|${charW}|${charH}|${dpr}|${color}|${paletteKey}|${intensityKey}|${effectKey}`;
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
        bloom: st.bloomPx,
      })
    );
    st.atlas = st.paletteAtlases[0];
    st.intensityAtlases = null;
  } else {
    st.paletteAtlases = null;
    const atlasAt = (tint, reverse = false) =>
      buildGlyphAtlas({
        fontFamily,
        fontSizePx,
        charW,
        charH,
        dpr,
        color: tint,
        normalizeTinyAlpha: st.tinyCellsAllowed,
        reverse,
        bloom: st.bloomPx,
      });
    const wantsReverse = st.reverseThreshold !== null;
    if (st.intensityLevels || wantsReverse) {
      // One atlas per drive level. Glyph coverage is alpha, which is identical
      // across tints, so the shape vectors below are unaffected by intensity —
      // a dim cell picks the same character it would have picked at full
      // drive, and only its brightness changes. MEASURED: about 0.2 ms per
      // atlas at any character size, so a handful of levels is not a cost.
      const levels = st.intensityLevels ?? [1];
      st.intensityAtlases = levels.map((drive) =>
        atlasAt(driveColor(color, drive))
      );
      // The full-drive atlas is what everything else reads (cell metrics, the
      // no-layers fallback, and the shape vectors below), so it must stay the
      // NORMAL one — vectors built from a reverse atlas would describe the
      // holes rather than the glyphs.
      st.atlas = st.intensityAtlases[st.intensityAtlases.length - 1];
      if (wantsReverse) {
        st.reverseAtlasIndex = st.intensityAtlases.length;
        st.intensityAtlases = st.intensityAtlases.concat([
          atlasAt(color, true),
        ]);
      } else {
        st.reverseAtlasIndex = -1;
      }
    } else {
      st.intensityAtlases = null;
      st.reverseAtlasIndex = -1;
      st.atlas = atlasAt(color);
    }
  }
  st.glyphVectors = _buildGlyphVectors(st.atlas);
  st.lookup = createLookup(st.glyphVectors);
  // The emptiest glyph that is not the space character. A reverse cell wants
  // the SPARSEST glyph it can get — the less is punched out, the brighter the
  // cell — but the painter skips SPACE_INDEX as a blank, so asking for space
  // would leave a hole exactly where the brightest cell should be solid.
  // Which glyph is emptiest depends on the font, so it is measured from the
  // vectors rather than assumed.
  let emptiest = -1;
  let emptiestInk = Infinity;
  for (let g = 0; g < st.glyphVectors.length; g++) {
    if (g === SPACE_INDEX) continue;
    const vec = st.glyphVectors[g];
    let ink = 0;
    for (let i = 0; i < vec.length; i++) ink += vec[i];
    if (ink < emptiestInk) {
      emptiestInk = ink;
      emptiest = g;
    }
  }
  st.sparsestNonSpace = emptiest >= 0 ? emptiest : SPACE_INDEX;
  st.classLookups = _buildClassLookups(st);
  // CW-86: one ladder per anchored class, from field step to glyph. Built
  // here and not on demand because it is derived from the atlas - the same
  // reason the lookups are - and a ladder indexing a stale atlas would draw
  // characters nobody chose.
  st.classLadders = buildLadders(st.classLookups, st.glyphVectors);
  st.atlasKey = key;
  // Every setter that changes the palette, the drive levels, the reverse
  // threshold or the vocabularies clears atlasKey to force this rebuild, so
  // this one line is where all of them forget the frame-to-frame memory. A
  // held glyph index means nothing once the atlas it indexes has changed.
  st.hysteresisHistory = null;
  st.gpuPass?.forget?.();
}

/**
 * One lookup per surface class, over the same shape vectors as the main one
 * but restricted to that class's allowed glyphs (CW-23).
 *
 * createLookup returns positions in the array it was handed, so each subset
 * carries an index table that maps its answer back to a real atlas index.
 * Rebuilt with the atlas, because the vectors it searches are read from the
 * atlas bitmap.
 *
 * A vocabulary that survives to here always contains the space character:
 * without it the darkest cells cannot stay empty and the black the picture is
 * built on fills in with texture. A row that omits it has one added rather
 * than being rejected — an art edit should not be able to break the render.
 *
 * @returns {Map<number, {nearestIndex: (v: Float32Array) => number}>|null}
 */
function _buildClassLookups(st) {
  if (!st.classVocabularies) return null;
  const lookups = new Map();
  for (const key of Object.keys(st.classVocabularies)) {
    const classId = Number(key);
    if (!Number.isFinite(classId)) continue;
    const chars = String(st.classVocabularies[key] ?? '');
    const indices = new Set([SPACE_INDEX]);
    for (const ch of chars) {
      const idx = ch.charCodeAt(0) - FIRST_CHAR_CODE;
      if (idx >= 0 && idx < GLYPH_COUNT) indices.add(idx);
    }
    // One usable glyph plus the space is not a vocabulary, it is a stamp.
    if (indices.size < 2) continue;
    const table = [...indices].sort((a, b) => a - b);
    const subset = table.map((i) => st.glyphVectors[i]);
    const inner = createLookup(subset);
    lookups.set(classId, {
      nearestIndex: (v) => table[inner.nearestIndex(v)],
      // The same list the CPU searches, for the shader's lookup texture —
      // so the two paths cannot end up with different vocabularies.
      glyphIds: table,
    });
  }
  return lookups.size > 0 ? lookups : null;
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

/**
 * Ask the GPU pass for this frame's glyphs, or get null and use the CPU.
 *
 * Everything the shader needs that the CPU already computes is handed over
 * rather than recomputed, so the two paths cannot drift on tap positions,
 * contrast exponents or the glyph vectors themselves.
 *
 * Palette mode goes through the shader too. The colour selector needs each
 * cell's mean tint, which the taps already have, so it is picked there and
 * rides back in the green channel — the one that otherwise carries only a
 * debug class byte. Without this the game's colour mode would have been the
 * one mode the release did not speed up, and it is the mode the owner's own
 * screenshots were taken in.
 */
function _sampleOnGpu(
  st,
  {
    renderer,
    scene,
    camera,
    sampleW,
    sampleH,
    cellW,
    cellH,
    cols,
    rows,
    pts,
    extPts,
    invert,
    usePalette,
  }
) {
  if (!_gpuPathInForce(st)) return null;
  if (!camera || !st.glyphVectors) return null;
  if (!st.gpuPass) {
    st.gpuPass = createGpuGlyphPass(renderer);
    if (!st.gpuPass.available && import.meta.env.DEV) {
      console.warn('[hfm] GPU glyph pass unavailable:', st.gpuPass.reason);
    }
  }
  if (!st.gpuPass.available) return null;

  const flat = (points, out) => {
    for (let i = 0; i < points.length; i++) {
      out[i * 2] = points[i][0];
      out[i * 2 + 1] = points[i][1];
    }
    return out;
  };
  st.gpuInternal ??= new Float32Array(12);
  st.gpuExternal ??= new Float32Array(20);

  const reverseAt =
    st.reverseAtlasIndex >= 0 && st.reverseThreshold !== null
      ? st.reverseThreshold + st.reverseLift
      : 2;

  return st.gpuPass.sample({
    scene,
    camera,
    cols,
    rows,
    sampleW,
    sampleH,
    cellW,
    cellH,
    internalPoints: flat(pts, st.gpuInternal),
    externalPoints: flat(extPts, st.gpuExternal),
    glyphVectors: st.glyphVectors,
    glyphKey: st.atlasKey,
    vocabLists: _gpuVocabLists(st),
    vocabKey: st.atlasKey,
    // CW-68: the class map is bound in palette mode as well, where it is not
    // a vocabulary but a RESET: a cell whose surface changed must drop the
    // glyph it was holding, and without the map the shader cannot tell. The
    // vocabulary is still mono-only, which is what useClassVocabularies says.
    classTexture: st.gpuClassTextureProvider?.(cols, rows) ?? null,
    useClassVocabularies: !usePalette,
    paletteChroma: usePalette ? st.paletteChroma : null,
    chromaBoost: st.paletteChromaBoost,
    contrastExp: st.contrastExp,
    dirContrastExp: st.dirContrastExp,
    invert,
    // The scene is rendered at FULL resolution, as it always was, and the
    // shader reads it the way the CPU's downscale would have. CW-31 measured
    // that rendering smaller saves nothing on this hardware and costs the
    // antialiasing the downscale was quietly providing.
    sourceW: renderer.domElement.width,
    sourceH: renderer.domElement.height,
    // Written in the same colour space the canvas is, so that the hardware's
    // linear filtering averages encoded values exactly as drawImage does.
    sceneColorSpace: renderer.outputColorSpace,
    reverseAt,
    spaceIndex: SPACE_INDEX,
    sparsestNonSpace: st.sparsestNonSpace ?? SPACE_INDEX,
    hysteresis: st.hysteresis,
    inkBudget: usePalette ? st.inkBudget : null,
    paletteWhiteIndex: st.paletteWhiteIndex,
  });
}

/**
 * The vocabularies as glyph-id lists for the shader's lookup texture.
 *
 * Span 0 is the full vocabulary, which is what a cell falls back to when its
 * class has no row and what a reverse-video cell always uses. Span N+1 is
 * class N, matching the shader's `int(classId) + 1`.
 */
function _gpuVocabLists(st) {
  const all = [];
  for (let g = 0; g < st.glyphVectors.length; g++) all.push(g);
  const lists = [{ spanIndex: 0, ids: all }];
  if (st.classLookups) {
    for (const [classId, lookup] of st.classLookups) {
      if (!lookup.glyphIds) continue;
      lists.push({ spanIndex: classId + 1, ids: lookup.glyphIds });
    }
  }
  return lists;
}

function _renderFrame(
  st,
  {
    renderer,
    scene,
    camera,
    width,
    height,
    fontFamily,
    fontSizePx,
    charW,
    charH,
  }
) {
  const dpr = _getDpr();
  _ensureGlyphModel(st, { fontFamily, fontSizePx, charW, charH, dpr });

  const sampleScale = _computeSampleScale(charW);
  const sampleW = Math.max(1, Math.floor(width * sampleScale));
  const sampleH = Math.max(1, Math.floor(height * sampleScale));

  const invert = _computeInvertFromScene(scene);

  const cellW = Math.max(1, charW * sampleScale);
  const cellH = Math.max(1, charH * sampleScale);

  const cols = Math.max(8, Math.floor((width * sampleScale) / cellW));
  const rows = Math.max(6, Math.floor((height * sampleScale) / cellH));

  const pts = _getSixSamplePoints(cellW, cellH);
  const extPts = _getExternalSamplePoints(cellW, cellH);

  const usePalette = Boolean(st.palette && st.paletteChroma);

  // CW-32: try the GPU first. It renders the scene into a texture and picks
  // every cell's glyph in one draw, so when it works none of the sampling
  // below happens at all — no downscale, no frame readback, no cell loop. It
  // returns null the moment anything is unavailable, and the CPU path then
  // runs exactly as it always has.
  const gpu = _sampleOnGpu(st, {
    renderer,
    scene,
    camera,
    sampleW,
    sampleH,
    cellW,
    cellH,
    cols,
    rows,
    pts,
    extPts,
    invert,
    usePalette,
  });

  let imgData = null;
  if (!gpu) {
    _ensureSampler(st);
    // Resizing a canvas clears it and resets context state — only do it when
    // the dimensions actually change.
    if (
      st.sampleCanvas.width !== sampleW ||
      st.sampleCanvas.height !== sampleH
    ) {
      st.sampleCanvas.width = sampleW;
      st.sampleCanvas.height = sampleH;
    }
    // Bilinear downscale = GPU box filter, standing in for area-average
    // supersampling; one tap per sample point then suffices.
    st.sampleCtx.imageSmoothingEnabled = true;
    st.sampleCtx.clearRect(0, 0, sampleW, sampleH);
    st.sampleCtx.drawImage(renderer.domElement, 0, 0, sampleW, sampleH);
    imgData = st.sampleCtx.getImageData(0, 0, sampleW, sampleH).data;
  }

  // CW-30: read each distinct sample pixel once per cell instead of once per
  // tap. Rebuilt only when the cell geometry changes.
  const planKey = `${cellW}x${cellH}`;
  if (st.tapPlanKey !== planKey) {
    st.tapPlan = _buildTapPlan(cellW, cellH);
    st.tapPlanKey = planKey;
  }
  const tapPlan = st.benchLegacyTaps ? null : st.tapPlan;
  _ensureContrastCurves(st);

  const v = new Float32Array(6);
  const extSamples = new Float32Array(10);
  const glyphIndices = new Int16Array(rows * cols);
  if (usePalette && st.colorIndices?.length !== rows * cols) {
    st.colorIndices = new Int8Array(rows * cols);
  }
  const useIntensity = Boolean(!usePalette && st.intensityAtlases);
  if (useIntensity && st.intensityIndices?.length !== rows * cols) {
    st.intensityIndices = new Int8Array(rows * cols);
  }
  const reverseIdx = useIntensity ? st.reverseAtlasIndex : -1;
  // The reverse atlas rides at the end of the array and is NOT one of the
  // drive levels, so it must not take a share of the luminance split.
  const intensityCount = useIntensity
    ? st.intensityAtlases.length - (reverseIdx >= 0 ? 1 : 0)
    : 0;
  const reverseAt =
    reverseIdx >= 0 ? st.reverseThreshold + st.reverseLift : Infinity;
  let reverseCells = 0;

  // CW-32: the shader already chose every glyph. All that is left is the
  // per-cell atlas selection, which stays on the CPU because it is what the
  // painter consumes — the shader hands back the pre-contrast brightness it
  // needs in the blue channel, so nothing is re-sampled to get it.
  const cellLumOut = st.devCellProbe ? _probeLumArray(st, rows * cols) : null;
  // CW-68: the frame-to-frame memory, when a caller has asked for one. The
  // GPU path decides the glyph and the reverse flag in the shader (it has to:
  // a reverse cell is matched against an INVERTED vector, so the flag is
  // needed before the pick) and hands both back; the drive level is decided
  // here, on both paths, because only the CPU ever needed it.
  const hysteresis = st.hysteresis;
  const history = hysteresis
    ? (st.hysteresisHistory = ensureHistory(st.hysteresisHistory, rows * cols))
    : null;
  if (gpu) {
    const cellCount = rows * cols;
    const gpuFlags = history ? gpu.flags : null;
    for (let i = 0; i < cellCount; i++) {
      glyphIndices[i] = gpu.indices[i];
      // In palette mode the green channel carries TWO things: the palette
      // index in the low nibble and the surface class in the high one, so
      // that the shader can compare a cell's class with the one it had
      // without a channel of its own. See _hfm-gpu.js.
      if (usePalette) st.colorIndices[i] = gpu.colors[i] & 15;
      if (useIntensity) {
        const cellLum = gpu.lum[i] / 255;
        if (cellLumOut) cellLumOut[i] = cellLum;
        // Reading the shader's own answer rather than recomputing the cliff
        // is the only way the painted cell can agree with the glyph that was
        // picked for it.
        const cellReversed = gpuFlags
          ? (gpuFlags[i] & 1) === 1
          : cellLum >= reverseAt;
        if (cellReversed) {
          st.intensityIndices[i] = reverseIdx;
          reverseCells++;
        } else {
          st.intensityIndices[i] = history
            ? driveWithMemory(
                cellLum,
                history.drive[i],
                intensityCount,
                hysteresis.drive
              )
            : pickIntensityIndex(cellLum, intensityCount);
        }
        if (history) {
          // A reverse cell has no drive level, so it forgets one: on the way
          // back out it takes the plain pick rather than a stale neighbour.
          history.drive[i] = cellReversed ? -1 : st.intensityIndices[i];
          history.reversed[i] = cellReversed ? 1 : 0;
        }
      }
    }
  } else {
    _convertOnCpu(st, {
      imgData,
      glyphIndices,
      cols,
      rows,
      cellW,
      cellH,
      sampleW,
      sampleH,
      pts,
      extPts,
      tapPlan,
      invert,
      v,
      extSamples,
      usePalette,
      useIntensity,
      reverseAt,
      reverseIdx,
      intensityCount,
      cellLumOut,
      onReverseCell: () => reverseCells++,
      hysteresis,
      history,
      inkBudget: st.inkBudget,
      paletteWhiteIndex: st.paletteWhiteIndex,
    });
  }

  // Sync overlay canvas backing store to container size at device resolution
  _paintConverted(st, {
    glyphIndices,
    cols,
    rows,
    width,
    height,
    dpr,
    charW,
    charH,
    usePalette,
    useIntensity,
  });

  // Bench readout only (DEV): how much of the frame reverse video claimed.
  // A rising share is the "carpeting" failure showing up as a number before
  // it shows up as a wall of solid cells.
  st.lastCellCount = rows * cols;
  st.lastCols = cols;
  st.lastRows = rows;
  st.lastReverseCells = reverseCells;
  // CW-70: the share cap, one conversion behind. Read the overshoot off the
  // instrument's per-frame reverse share rather than trusting this line.
  if (st.reverseShareCap !== null) {
    st.reverseLift = nextReverseLift(
      reverseCells / Math.max(1, rows * cols),
      st.reverseShareCap,
      st.reverseLift,
      { max: st.reverseLiftMax }
    );
  }
  st.lastUsedGpu = Boolean(gpu);
  if (st.devCellProbe) {
    // glyphIndices is freshly allocated per conversion, so holding the
    // reference costs nothing. The intensity array is the instance's own and
    // is reused, which is why readCellProbe copies on the way OUT - a caller
    // holding a snapshot must not watch it change under the next frame.
    st.lastGlyphIndices = glyphIndices;
    st.lastProbeIntensity = useIntensity ? st.intensityIndices : null;
  }
}

/**
 * CW-52: the probe's per-cell luminance buffer, grown only when the grid does.
 * @param {Object} st
 * @param {number} cellCount
 * @returns {Float32Array}
 */
/**
 * Is the GPU glyph path in force for this instance right now?
 *
 * ★★★ THERE MUST BE EXACTLY ONE ANSWER TO THIS, AND THIS IS IT. Two places
 * need it and they MUST agree: the sampler, which decides who converts the
 * frame, and render(), which skips drawing the scene to the canvas when the
 * glyph pass is going to render it instead. CW-86 first made the sampler fall
 * back to the CPU on its own, and the result was not a slower picture but an
 * EMPTY one - render() still believed the GPU was driving, never drew the
 * scene, and the CPU sampler read an untouched canvas. Every cell came back
 * black, and the instrument refused the run with 'not one cell was lit in the
 * whole sequence'. The symptom looked like a broken glyph decision and was
 * nothing of the kind.
 *
 * @param {Object} st
 * @returns {boolean}
 */
function _gpuPathInForce(st) {
  if (!st.gpuSample || st.benchLegacyCpuSample) return false;
  // CW-86: the anchored pick is an INDEX into a class's ladder from a byte the
  // shader would also have to be handed, not the nearest-shape search the
  // shader does - and that byte has no room in the packing the memory already
  // uses (_hfm-gpu.js). Carrying it means a second class texture, which is a
  // cost worth paying only once the anchored picture has earned its place.
  // This is CW-68's own precedent: ship the CPU path first and let the
  // instrument decide. A bench line taken with anchoring on is therefore a CPU
  // line, and says so - it is not the price of anchoring, it is the price of
  // anchoring before the shader learns it.
  if (st.anchoredGlyphs) return false;
  return st.gpuPass?.available !== false;
}
function _probeLumArray(st, cellCount) {
  if (st.lastCellLum?.length !== cellCount) {
    st.lastCellLum = new Float32Array(cellCount);
  }
  return st.lastCellLum;
}

/**
 * The CPU sampling loop: sixteen taps, two contrast curves and a
 * nearest-glyph search per cell. Unchanged in behaviour by CW-32 — it is now
 * one of two paths rather than the only one, and it remains the only path on
 * WebGL1 and wherever the GPU pass declines.
 */
function _convertOnCpu(
  st,
  {
    imgData,
    glyphIndices,
    cols,
    rows,
    cellW,
    cellH,
    sampleW,
    sampleH,
    pts,
    extPts,
    tapPlan,
    invert,
    v,
    extSamples,
    usePalette,
    useIntensity,
    reverseAt,
    reverseIdx,
    intensityCount,
    cellLumOut,
    onReverseCell,
    hysteresis,
    history,
    inkBudget,
    paletteWhiteIndex,
  }
) {
  // CW-71: palette mode never needed the cell's ABSOLUTE luminance, because
  // nothing used it. The ink budget does: it is the one thing the cell
  // contrast curve throws away.
  //
  const wantsLum = useIntensity || Boolean(inkBudget && usePalette);
  // CW-23: what each cell is looking at, if the caller can say. A provider
  // that returns the wrong size is ignored rather than trusted — a stale map
  // would hand cells the vocabulary of whatever used to be there.
  let classMap = null;
  if (st.classLookups && st.classMapProvider) {
    const supplied = st.classMapProvider(cols, rows);
    if (supplied && supplied.length === rows * cols) classMap = supplied;
  }
  // CW-86: the surface's own tone per cell, read the same guarded way. It is
  // only fetched when there is a class map to pair it with: the field says
  // WHICH STEP, the class says which ladder, and one without the other
  // cannot name a glyph.
  let fieldMap = null;
  if (
    st.anchoredGlyphs &&
    classMap &&
    st.classLadders &&
    st.glyphFieldProvider
  ) {
    const supplied = st.glyphFieldProvider(cols, rows);
    if (supplied && supplied.length === rows * cols) fieldMap = supplied;
  }
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

      if (tapPlan) {
        // Read every distinct pixel once, then hand each tap the value it
        // asked for. A pixel two taps share is still counted twice in the
        // colour average, exactly as sampling it twice would.
        const tCount = tapPlan.count;
        const tdx = tapPlan.dx;
        const tdy = tapPlan.dy;
        const tLum = tapPlan.lum;
        const tIn = tapPlan.inBounds;
        for (let t = 0; t < tCount; t++) {
          const rx = baseX + tdx[t];
          const ry = baseY + tdy[t];
          tIn[t] = rx >= 0 && rx < sampleW && ry >= 0 && ry < sampleH ? 1 : 0;
          const sx = rx < 0 ? 0 : rx >= sampleW ? sampleW - 1 : rx;
          const sy = ry < 0 ? 0 : ry >= sampleH ? sampleH - 1 : ry;
          const pidx = (sy * sampleW + sx) * 4;
          const r = imgData[pidx];
          const g = imgData[pidx + 1];
          const b = imgData[pidx + 2];
          const lum = _relLum01(r, g, b);
          tLum[t] = _clamp01(invert ? 1 - lum : lum);
          if (usePalette) {
            tapPlan.red[t] = r;
            tapPlan.green[t] = g;
            tapPlan.blue[t] = b;
          }
        }
        const internal = tapPlan.internal;
        for (let i = 0; i < 6; i++) {
          const t = internal[i];
          v[i] = tLum[t];
          if (usePalette) {
            sumR += tapPlan.red[t];
            sumG += tapPlan.green[t];
            sumB += tapPlan.blue[t];
          }
          if (wantsLum) sumLum += v[i];
        }
      } else {
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
      }
      // The cell's brightness BEFORE the contrast curves reshape v for glyph
      // matching: intensity answers "how bright is this cell", the glyph
      // answers "what shape is it", and the two must not be the same signal
      // twice over.
      const cellLum = wantsLum ? sumLum / 6 : 0;
      if (cellLumOut) cellLumOut[idx] = cellLum;
      // CW-68: `idx` walks on at the glyph assignment below, so the cell's own
      // index is taken here, once, and every history read uses it.
      const cell = idx;
      const cellReversed = history
        ? reverseWithMemory(
            cellLum,
            history.reversed[cell] === 1,
            reverseAt,
            hysteresis.reverse
          )
        : cellLum >= reverseAt;
      if (useIntensity) {
        st.intensityIndices[idx] = cellReversed
          ? reverseIdx
          : history
            ? driveWithMemory(
                cellLum,
                history.drive[cell],
                intensityCount,
                hysteresis.drive
              )
            : pickIntensityIndex(cellLum, intensityCount);
        if (cellReversed) onReverseCell();
      }
      // ★★★ GUARDED BY useIntensity, THE WAY THE GPU BRANCH ALWAYS HAS BEEN.
      // `st.intensityIndices` is only allocated when there are drive levels to
      // hold, and in COLOUR MODE there never are - useIntensity is
      // `!usePalette && ...`, so it is false for every palette frame. This line
      // read `st.intensityIndices[cell]` unconditionally and threw
      // 'Cannot read properties of null' on the first colour frame it ever saw.
      //
      // It had never seen one: colour mode has always taken the GPU path, and
      // the GPU branch guards the identical assignment. CW-86 forces the CPU
      // path, which is how a crash that has been sitting in this file since the
      // memory landed finally got to happen. The fix is to ask the same
      // question the other branch asks.
      if (history && useIntensity) {
        history.drive[cell] = cellReversed ? -1 : st.intensityIndices[cell];
      }
      let inkBlanked = false;
      if (usePalette) {
        const meanR = sumR / (6 * 255);
        const meanG = sumG / (6 * 255);
        const meanB = sumB / (6 * 255);
        let skip = -1;
        if (inkBudget) {
          inkBlanked = cellLum < inkBudget.floor;
          if (
            paletteWhiteIndex >= 0 &&
            !whiteAllowed(cellLum, cellChroma(meanR, meanG, meanB), inkBudget)
          ) {
            skip = paletteWhiteIndex;
          }
        }
        st.colorIndices[idx] = pickPaletteIndex(
          meanR,
          meanG,
          meanB,
          st.paletteChroma,
          st.paletteChromaBoost,
          skip
        );
      }

      // External boundary points for edge detection; out-of-bounds clamp to 0
      if (tapPlan) {
        const external = tapPlan.external;
        const tLum = tapPlan.lum;
        const tIn = tapPlan.inBounds;
        for (let i = 0; i < 10; i++) {
          const t = external[i];
          extSamples[i] = tIn[t] ? tLum[t] : 0;
        }
      } else {
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
      }

      _applyDirectionalContrast(st, v, extSamples);
      _applyCellContrast(st, v);

      const cellClass = classMap ? classMap[cell] : -1;
      if (inkBlanked) {
        // Below the floor the cell draws nothing at all, the way a mono cell
        // below the ladder's blank level does. The memory is told, so it does
        // not hold a glyph the cell is no longer allowed to draw.
        if (history) {
          history.glyph[cell] = SPACE_INDEX;
          history.hold[cell] = 0;
          history.reversed[cell] = 0;
          history.cls[cell] = cellClass;
        }
        glyphIndices[idx++] = SPACE_INDEX;
        continue;
      }
      if (cellReversed) {
        // In a reverse cell the phosphor is the BACKGROUND and the glyph is a
        // hole, so brightness is one minus coverage. Matching the cell against
        // the inverted shape puts the holes where the cell is dark and leaves
        // the lit part solid — ask for the same dense glyph a normal cell
        // would use and the cell comes back no brighter than it started.
        for (let i = 0; i < 6; i++) v[i] = 1 - v[i];
        const picked = st.lookup.nearestIndex(v);
        const chosen = picked === SPACE_INDEX ? st.sparsestNonSpace : picked;
        glyphIndices[idx++] = history
          ? _remember(st, history, cell, v, chosen, cellClass, true, hysteresis)
          : chosen;
        continue;
      }

      // CW-86: THE GLYPH COMES FROM THE SURFACE, THE LIGHT STILL COMES FROM
      // THE SCREEN. Everything above this line - the blank floor, the reverse
      // decision, the intensity level, the palette colour - has already been
      // decided from the lit cell and is untouched. All that changes is WHICH
      // character carries it, and for an anchored cell that is a property of
      // the wall rather than of where the camera is standing.
      const anchored = fieldMap
        ? anchoredGlyph(st.classLadders, cellClass, fieldMap[cell])
        : -1;
      if (anchored >= 0) {
        // ★ AND THE MEMORY IS SKIPPED HERE, DELIBERATELY. The memory exists to
        // hide a re-roll; an anchored cell has nothing to hide, and holding a
        // glyph past the moment its surface slid to the next lattice square is
        // exactly the trail CW-84 cut. The history is still WRITTEN so that a
        // cell moving between anchored and screen-picked does not read a stale
        // glyph on the way back.
        if (history) {
          history.glyph[cell] = anchored;
          history.hold[cell] = 0;
          history.reversed[cell] = 0;
          history.cls[cell] = cellClass;
        }
        glyphIndices[idx++] = anchored;
        continue;
      }
      const cellLookup = classMap
        ? (st.classLookups.get(classMap[cell]) ?? st.lookup)
        : st.lookup;
      const chosen = cellLookup.nearestIndex(v);
      glyphIndices[idx++] = history
        ? _remember(st, history, cell, v, chosen, cellClass, false, hysteresis)
        : chosen;
    }
  }
}

/**
 * CW-68, CPU path: hold this cell's previous glyph, or take the new one.
 *
 * The shader does the same arithmetic on its own copy of the rules; this is
 * the readable one, and the one the unit tests pin. Both distances are
 * measured against THIS frame's cell vector - the question is not how good the
 * old glyph was when it was chosen, it is how wrong it is now.
 *
 * @returns {number} the glyph to draw
 */
function _remember(st, history, cell, v, chosen, cellClass, reversed, bands) {
  const prevGlyph = history.glyph[cell];
  const reset =
    history.reversed[cell] !== (reversed ? 1 : 0) ||
    (cellClass >= 0 && history.cls[cell] !== cellClass);
  const { glyph, hold } = glyphWithMemory({
    candidate: chosen,
    candidateDist2: shapeDistance2(v, st.glyphVectors[chosen]),
    prevGlyph,
    prevDist2:
      prevGlyph >= 0 && prevGlyph < st.glyphVectors.length
        ? shapeDistance2(v, st.glyphVectors[prevGlyph])
        : Infinity,
    band: bands.glyph,
    hold: history.hold[cell],
    holdFrames: bands.holdFrames,
    reset,
  });
  history.glyph[cell] = glyph;
  history.hold[cell] = hold;
  history.reversed[cell] = reversed ? 1 : 0;
  history.cls[cell] = cellClass;
  return glyph;
}

/** Blit the chosen glyphs to the overlay. Identical for both sampling paths. */
function _paintConverted(
  st,
  {
    glyphIndices,
    cols,
    rows,
    width,
    height,
    dpr,
    charW,
    charH,
    usePalette,
    useIntensity,
  }
) {
  // Sync overlay canvas backing store to container size at device resolution
  const backingW = Math.max(1, Math.round(width * dpr));
  const backingH = Math.max(1, Math.round(height * dpr));
  if (
    st.overlayCanvas.width !== backingW ||
    st.overlayCanvas.height !== backingH
  ) {
    resizeOverlay(st.overlayCanvas, width, height, dpr, st.persistCanvas);
  }

  // CW-85: a provider that answers with the wrong length is ignored rather
  // than trusted, the same rule the class map is read under - a half-sized
  // backing would paint the top of the screen and leave the rest bare, which
  // reads as a rendering fault rather than as the bug it is.
  let backing = null;
  if (st.backingProvider) {
    const supplied = st.backingProvider(cols, rows, {
      usePalette,
      useIntensity,
      // CW-85 measured TWO tint sources before choosing one, and the second
      // needed the cell's OWN colour: this is the palette entry the glyph is
      // about to be drawn in. Handing it over costs nothing (the array
      // already exists for the paint) and it is the only way a provider
      // outside the converter can ask what colour a cell came out.
      colorIndices: usePalette ? st.colorIndices : null,
      palette: usePalette ? st.palette : null,
    });
    if (supplied && supplied.length === rows * cols) backing = supplied;
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
        : undefined,
    st.glowInComposite,
    st.scanlineDim,
    backing
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
  st.glowInComposite = Boolean(options.glowInComposite);
  st.gpuSample = Boolean(options.gpuSample);
  st.gpuClassTextureProvider =
    typeof options.gpuClassTextureProvider === 'function'
      ? options.gpuClassTextureProvider
      : null;
  // CW-23: surface classes. The provider is asked for a class map once per
  // conversion; the vocabularies say what each class may be drawn with. An
  // instance that passes neither behaves exactly as it did before.
  st.classMapProvider =
    typeof options.classMapProvider === 'function'
      ? options.classMapProvider
      : null;

  // CW-86: the GLYPH FIELD. One byte per cell saying what the SURFACE looks
  // like there - 0 for "no field, use the screen pick". Opt-in per instance
  // like the class map, and inert unless anchoredGlyphs is also on, so an
  // instance that supplies neither behaves exactly as it did.
  st.glyphFieldProvider =
    typeof options.glyphFieldProvider === 'function'
      ? options.glyphFieldProvider
      : null;
  st.anchoredGlyphs = options.anchoredGlyphs === true;
  st.classVocabularies = options.glyphVocabularies ?? null;
  // CW-85: the backing layer ("Day"). Opt-in per instance and asked once per
  // PAINT, not per rAF. It returns one opaque colour per cell (0 = leave this
  // cell alone) and CANNOT reach the glyph decision: by the time it is called
  // the glyphs are already chosen, which is what makes "the backing changes
  // no decision" a fact about the shape of the code rather than a promise.
  // An instance that passes nothing behaves exactly as it did before, and
  // that is every instance but the game's.
  st.backingProvider =
    typeof options.backingProvider === 'function'
      ? options.backingProvider
      : null;

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
      // On the GPU path the scene is rendered by the glyph pass, into its own
      // target, so drawing it to the canvas as well would be rendering the
      // city twice a frame for a canvas nobody can see (enable() sets it to
      // opacity 0). If the pass ever gives up, `available` turns false and
      // the canvas render resumes on the next frame.
      // CW-86: one question, one answer - see _gpuPathInForce. `available`
      // must still be strictly true here: before the first conversion there is
      // no pass at all, and a scene that went undrawn on that frame would be a
      // blank first paint.
      const gpuWillRender =
        st.enabled && _gpuPathInForce(st) && st.gpuPass?.available === true;
      if (!gpuWillRender) {
        // Always render the underlying scene so controls + animation stay
        // correct.
        renderer.render(scene, previewManager.getActiveCamera());
      }

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
        camera: previewManager.getActiveCamera(),
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
        // CW-71: which entry the ink budget may withhold. Found by hex rather
        // than by position, because a palette is art direction and its order
        // is not a contract.
        st.paletteWhiteIndex = st.palette.findIndex(
          (colour) => String(colour).trim().toLowerCase() === '#ffffff'
        );
      } else {
        st.palette = null;
        st.paletteChroma = null;
        st.paletteAtlases = null;
        st.colorIndices = null;
        st.paletteWhiteIndex = -1;
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
      if (!st.intensityLevels && st.reverseThreshold === null) {
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
    /**
     * Reverse video for the top of the ramp (CW-21), monochrome only.
     *
     * Pass a luminance threshold in [0, 1]: cells at or above it are painted
     * as solid phosphor with their glyph knocked out, which is the only way
     * past the ASCII coverage ceiling (the densest printable glyph inks
     * 43-58% of a cell). Pass null to switch it off.
     *
     * Keep the threshold HIGH. A band of solid cells stops reading as a
     * bright surface and starts reading as a painted wall — the recorded
     * "carpeting" failure — so this is a highlight for the few brightest
     * cells, not a tone in the ramp.
     *
     * @param {number|null} threshold
     * @returns {number|null} the active threshold
     */
    setReverseVideo(threshold) {
      st.reverseThreshold =
        Number.isFinite(threshold) && threshold >= 0 && threshold <= 1
          ? threshold
          : null;
      if (st.reverseThreshold === null) st.reverseAtlasIndex = -1;
      // A lift is relative to the threshold it was measured against.
      st.reverseLift = 0;
      st.atlasKey = '';
      st.dirty = true;
      return st.reverseThreshold;
    },
    getReverseVideo() {
      return st.reverseThreshold;
    },
    /**
     * CRT decoration (CW-21 P4), both off unless a caller asks.
     *
     * `bloomPx` halos each glyph at atlas-build time, so it costs nothing per
     * frame; `scanlineDim` takes that fraction of the alpha off every other
     * device-pixel row of the finished frame. Both COST LEGIBILITY by
     * definition — one spreads ink past the glyph, the other removes it — so
     * neither is on by default and the release record carries the measurement
     * that decided that.
     *
     * @param {{bloomPx?: number, scanlineDim?: number}} options
     */
    /**
     * CW-68: give this instance's per-cell decisions a memory of the last
     * converted frame, so that a cell whose content barely moved keeps the
     * glyph, drive level and reverse-video state it had.
     *
     * OFF by default and per instance, because it is a change to what the
     * converter draws and it can only cost a caller that converts one still
     * frame. The rules and their dead bands are documented in
     * `_hfm-hysteresis.js`; a cell forgets everything the moment its surface
     * class changes, its reverse-video state flips, or it has overridden the
     * plain pick for `holdFrames` conversions in a row.
     *
     * @param {{glyph?: number, drive?: number, holdFrames?: number}|null}
     *   options - null (or all-zero bands) turns it off
     * @returns {{glyph: number, drive: number, holdFrames: number}|null}
     */
    setTemporalHysteresis(options) {
      const next = normalizeHysteresis(options);
      const was = st.hysteresis;
      st.hysteresis = next;
      // Turning it on or off, or moving a band, invalidates every remembered
      // decision: the cells were decided under different rules.
      if (
        !was !== !next ||
        (was &&
          next &&
          (was.glyph !== next.glyph ||
            was.drive !== next.drive ||
            was.holdFrames !== next.holdFrames))
      ) {
        st.hysteresisHistory = null;
        st.gpuPass?.forget?.();
        st.dirty = true;
      }
      return st.hysteresis;
    },
    /**
     * @returns {{glyph: number, drive: number, reverse: number,
     *   holdFrames: number}|null}
     */
    getTemporalHysteresis() {
      return st.hysteresis;
    },
    /**
     * CW-85: swap the backing provider at run time, or turn it off with null.
     *
     * Setting it marks the frame dirty and nothing else: the backing is read
     * at PAINT time, after the glyphs are chosen, so there is no remembered
     * decision to invalidate and no history to forget. That is the same fact
     * the byte-identical guard rests on.
     *
     * @param {((cols: number, rows: number, ctx: {usePalette: boolean,
     *   useIntensity: boolean}) => Uint32Array|null)|null} provider
     */
    setBackingProvider(provider) {
      st.backingProvider = typeof provider === 'function' ? provider : null;
      st.dirty = true;
    },
    /** @returns {boolean} whether this instance paints a backing at all */
    hasBackingProvider() {
      return Boolean(st.backingProvider);
    },
    /**
     * CW-86: take anchored cells' glyphs from the surface, or from the
     * screen as every cell always has.
     *
     * Turning it on or off FORGETS the frame memory, because the two paths
     * disagree about what the previous frame's glyph meant: a held screen
     * pick is not a starting point for an anchored cell, and an anchored
     * glyph is not one the memory ever chose.
     *
     * @param {boolean} on
     */
    setAnchoredGlyphs(on) {
      const next = on === true;
      if (next === st.anchoredGlyphs) return;
      st.anchoredGlyphs = next;
      st.hysteresisHistory = null;
      st.gpuPass?.forget?.();
      st.dirty = true;
    },
    /** @returns {boolean} whether anchored glyphs are on */
    anchoredGlyphsOn() {
      return Boolean(st.anchoredGlyphs);
    },
    /**
     * CW-86: swap the glyph-field provider at run time, or clear it.
     *
     * @param {((cols: number, rows: number) => Uint8Array|null)|null} provider
     */
    setGlyphFieldProvider(provider) {
      st.glyphFieldProvider = typeof provider === 'function' ? provider : null;
      st.hysteresisHistory = null;
      st.dirty = true;
    },
    /**
     * CW-70: hold the share of solid (reverse-video) cells under `cap`.
     *
     * OFF (null) for every instance until a caller asks, and the main app's
     * Alt View never does. The bound is a controller rather than a clamp: the
     * reverse decision is made before the glyph is picked, per fragment on the
     * GPU path, so no cell can know the frame's total. See `nextReverseLift`.
     *
     * `maxLift` bounds how far the threshold may be lifted, and it is not a
     * detail: a surface painted at ONE luminance has no threshold that keeps
     * some of it and drops the rest, so an unbounded cap in front of such a
     * surface removes all of it. Bound the lift below the headroom between the
     * threshold and that surface's luminance and the cap can bound a sweep
     * without deleting a lit band.
     *
     * @param {number|null} cap share of all cells, e.g. 0.01
     * @param {{maxLift?: number}} [options]
     * @returns {number|null} the cap now in force
     */
    setReverseShareCap(cap, options = {}) {
      const next =
        typeof cap === 'number' && Number.isFinite(cap) && cap > 0 ? cap : null;
      const maxLift =
        typeof options.maxLift === 'number' &&
        Number.isFinite(options.maxLift) &&
        options.maxLift > 0
          ? options.maxLift
          : 0.19;
      if (next !== st.reverseShareCap || maxLift !== st.reverseLiftMax) {
        st.reverseShareCap = next;
        st.reverseLiftMax = maxLift;
        // A threshold left lifted after the cap is removed would keep the
        // layer suppressed with nothing saying so.
        st.reverseLift = 0;
        st.dirty = true;
      }
      return st.reverseShareCap;
    },
    /** @returns {number|null} */
    getReverseShareCap() {
      return st.reverseShareCap;
    },
    /**
     * CW-71: the palette-mode ink budget - an absolute-luminance floor below
     * which a cell draws nothing, and a gate on the white entry.
     *
     * OFF (null) for every instance until a caller asks, and the main app's
     * Alt View never does. It changes only WHICH palette entries a cell may
     * take and whether it draws at all; the sRGB match that measures the
     * distance is untouched. See `_hfm-paint.js` for the rules.
     *
     * @param {{floor?: number, whiteLum?: number, whiteChroma?: number}|null}
     *   options
     * @returns {{floor: number, whiteLum: number, whiteChroma: number}|null}
     */
    setPaletteInkBudget(options) {
      const next = normalizeInkBudget(options);
      const was = st.inkBudget;
      const changed =
        !was !== !next ||
        (was &&
          next &&
          (was.floor !== next.floor ||
            was.whiteLum !== next.whiteLum ||
            was.whiteChroma !== next.whiteChroma));
      st.inkBudget = next;
      if (changed) {
        // Cells decided under a different budget must not be held.
        st.hysteresisHistory = null;
        st.gpuPass?.forget?.();
        st.dirty = true;
      }
      return st.inkBudget;
    },
    /** @returns {{floor: number, whiteLum: number, whiteChroma: number}|null} */
    getPaletteInkBudget() {
      return st.inkBudget;
    },
    /**
     * DEV/instrument readout: how far the cap has currently lifted the
     * reverse-video threshold, in luminance.
     * @returns {number}
     */
    getReverseLift() {
      return st.reverseLift;
    },
    setCrtEffects(options = {}) {
      st.bloomPx = Math.max(0, Number(options.bloomPx) || 0);
      st.scanlineDim = Math.max(
        0,
        Math.min(1, Number(options.scanlineDim) || 0)
      );
      st.atlasKey = '';
      st.dirty = true;
      return { bloomPx: st.bloomPx, scanlineDim: st.scanlineDim };
    },
    getCrtEffects() {
      return { bloomPx: st.bloomPx, scanlineDim: st.scanlineDim };
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
    /**
     * CW-41: the painted cell's size in canvas pixels at the CURRENT font
     * scale. Read-only, so a caller can filter its scene for the cell
     * raster (the City Walk's facade textures do); previously this lived
     * only behind the DEV-gated stats.
     */
    getCellPx() {
      return { w: metrics.charW, h: metrics.charH };
    },
    /**
     * CW-42: the convert counters the frame loop already keeps, exposed
     * cumulatively so a caller can time a span by diffing two snapshots.
     * Read-only and allocation-light; the City Walk's entry calibration is
     * the customer. The richer getConvertStats readout stays DEV-only.
     */
    getConvertTotals() {
      return {
        sumMs: st.convertStats.sum,
        samples: st.convertStats.samples,
        cells: st.lastCellCount ?? 0,
      };
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
      st.tapPlan = null;
      st.tapPlanKey = '';
      st.gpuPass?.dispose();
      st.gpuPass = null;
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
    /**
     * Drop the afterglow, whichever path is carrying it.
     *
     * There are two. The per-cell blit path keeps the previous frame on a
     * persistence CANVAS; the composite path (glowInComposite, which the City
     * Walk uses) keeps it in a pixel buffer inside the painter and never
     * touches that canvas at all. This method used to clear only the first,
     * so for a composite-path caller it did nothing while looking like it had
     * worked - and the City Walk's map/street cut kept its double exposure
     * (D-81). Both are cleared now.
     */
    clearPersistence() {
      if (st.persistCanvas && st.persistCtx) {
        st.persistCtx.clearRect(
          0,
          0,
          st.persistCanvas.width,
          st.persistCanvas.height
        );
      }
      if (st.overlayCtx) clearAfterglow(st.overlayCtx);
      st.dirty = true;
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
        // CW-21: cells in the last converted frame, and how many of them
        // reverse video claimed.
        cells: st.lastCellCount ?? 0,
        // CW-52: the grid the cells were laid out on. A sequence instrument
        // that derives these from the cell count and the glyph aspect can be
        // one column out and silently measure a sheared grid.
        cols: st.lastCols ?? 0,
        rows: st.lastRows ?? 0,
        reverseCells: st.lastReverseCells ?? 0,
        // CW-32: which path actually converted the last frame, so a bench
        // cannot report a GPU number that the CPU produced.
        usedGpu: Boolean(st.lastUsedGpu),
        gpuAvailable: Boolean(st.gpuPass?.available),
        gpuFailure: st.gpuPass?.failure ?? '',
      };
    };
    api.resetConvertStats = () => {
      st.convertStats = { last: 0, sum: 0, max: 0, samples: 0 };
    };
    /**
     * CW-30: force the pre-CW-30 path for one step at a time, so a bench can
     * measure the old and the new back to back in ONE session. Numbers from
     * two different sessions on this machine are not comparable, so an A/B
     * that cannot be run side by side cannot be trusted; this is what makes
     * the comparison possible at all.
     *
     * @param {{taps?: boolean, contrast?: boolean}} flags
     */
    api.setBenchLegacy = (flags = {}) => {
      if ('taps' in flags) st.benchLegacyTaps = Boolean(flags.taps);
      if ('contrast' in flags) {
        st.benchLegacyContrast = Boolean(flags.contrast);
      }
      if ('cpuSample' in flags) {
        st.benchLegacyCpuSample = Boolean(flags.cpuSample);
      }
      st.dirty = true;
      return {
        taps: st.benchLegacyTaps,
        contrast: st.benchLegacyContrast,
        cpuSample: st.benchLegacyCpuSample,
      };
    };
    api.getBenchLegacy = () => ({
      taps: st.benchLegacyTaps,
      contrast: st.benchLegacyContrast,
      cpuSample: st.benchLegacyCpuSample,
    });
    /**
     * CW-52: retain what every cell DECIDED, so temporal stability can be
     * measured over a sequence of converted frames rather than inferred from
     * the painted picture. Off by default and never touched in production:
     * the extra per-cell luminance write would land inside the numbers the
     * performance bench reports, so it has to be asked for.
     *
     * @param {boolean} on
     * @returns {boolean} whether the probe is now recording
     */
    api.setCellProbe = (on) => {
      st.devCellProbe = Boolean(on);
      if (!st.devCellProbe) {
        st.lastGlyphIndices = null;
        st.lastProbeIntensity = null;
        st.lastCellLum = null;
      }
      st.dirty = true;
      return st.devCellProbe;
    };
    /**
     * CW-52: the last converted frame's per-cell decisions.
     *
     * `intensity` is an index into the drive levels, with the reverse-video
     * atlas riding at the end - so a cell that flips between the last drive
     * level and that index is the whole-cell flash the owner reported, told
     * apart from a cell that merely changed character.
     *
     * @returns {{cols: number, rows: number, glyphs: Int16Array,
     *   intensity: Int8Array|null, lum: Float32Array|null}|null}
     */
    api.readCellProbe = () => {
      if (!st.devCellProbe || !st.lastGlyphIndices) return null;
      return {
        cols: st.lastCols,
        rows: st.lastRows,
        glyphs: Int16Array.from(st.lastGlyphIndices),
        intensity: st.lastProbeIntensity
          ? Int8Array.from(st.lastProbeIntensity)
          : null,
        lum: st.lastCellLum ? Float32Array.from(st.lastCellLum) : null,
      };
    };
  }

  return api;
}
