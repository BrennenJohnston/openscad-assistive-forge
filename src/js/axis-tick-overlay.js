/**
 * Axis tick + numeral overlay — a transcription of desktop OpenSCAD
 * 2021.01's scale markers (U-11, UF-7; owner-approved feature table +
 * Amendment 1, 2026-08-11).
 *
 * Source of truth: GLView.cc `showScalemarkers()` + `decodeMarkerValue()`
 * (reference checkout `openscad-openscad-2021.01`). Everything scales from
 * one number, `l` = camera distance to the look-at point (the status bar's
 * `distance`; desktop `Camera::zoomValue()`):
 *
 *   - tick step   = 10^floor(log10(l)) / 10, ticks from 0 out to l on all
 *     six half-axes (negative halves dashed, numbers always solid)
 *   - a number on every 10th tick, plus one every 2nd tick while
 *     l / 10^floor(log10(l)) < 3 (the "few majors visible" rule)
 *   - minor tick length l/60, major l/30 — one-sided arms: X ticks extend
 *     toward −Y, Y and Z ticks toward −X; numbers sit on the OPPOSITE side
 *   - digits are line-segment glyphs (a pseudo-7-segment vector font, the
 *     `decodeMarkerValue` vertex tables verbatim): glyph height l/60 in a
 *     1.25·(l/60) box, width l/120, offset l/240 off the axis, char pitch
 *     0.75·(l/60). X numbers lie in XY along X; Y numbers in XY along Y
 *     (mirrored); Z numbers in XZ, digits rotated and stacked along the
 *     axis. There are no textures and no billboards: the numerals live in
 *     the world, foreshorten with the view, and depth-test behind solid
 *     geometry exactly like the ticks (the U-11 order).
 *
 * Colors are resolved scheme-first (U-13): a Classic viewport scheme
 * paints with its own transcribed desktop `axes` color from
 * PREVIEW_COLORS; app themes fall back to `--color-text-primary` read
 * from BODY at build time (Classic's token remap is body-scoped while the
 * theme attribute sits on <html> — an html-level read was the U-13
 * defect).
 *
 * The one deliberate deviation from desktop: XY-plane content is lifted
 * +0.05 mm because our scene can show a ground grid at z=0 (desktop has
 * none) and coplanar lines z-fight.
 *
 * @license GPL-3.0-or-later
 */

import { PREVIEW_COLORS, isViewportSchemeKey } from './preview.js';

// GLView.cc showScalemarkers(): size_div_sm and the labelling cadence.
const SIZE_DIV_SM = 60;
const MAJOR_EVERY = 10;
const MORE_LABELS_THRESHOLD = 3;
const MORE_LABELS_FREQ = 2;
// Fallback when no camera distance is supplied (≈ our default camera,
// |[150,-150,100]|). Callers pass the live distance. Shared with the
// axis-lines overlay so ticks and lines never disagree about scale.
export const DEFAULT_DISTANCE_MM = 234;
// Our grid draws at z=0; desktop has no grid. Coplanar lines z-fight.
const XY_LIFT_MM = 0.05;
// Desktop stipples negative halves at a fixed screen size; world-unit
// dashes must scale with the axis length instead. l/90 ≈ 2.9 mm at the
// reference distance, matching the shipped 3 mm look there. Shared with
// the axis-lines overlay (rule: one value, one home).
export const DASH_DIVISOR = 90;
const FALLBACK_LIGHT_HEX = 0x222222;
const FALLBACK_DARK_HEX = 0xdddddd;

/**
 * Resolve the color for axis marks.
 *
 * Scheme-first: when `themeKey` is a Classic viewport scheme, the scheme's
 * own transcribed `axes` color wins — the marks belong to the scheme, not
 * to the app theme (U-13). A scheme entry without a transcribed value
 * falls through to the token read below (recorded gap; none today).
 *
 * @param {string} themeKey         Current preview theme (e.g. 'dark', 'classic').
 * @param {Document} [docRef]       Injectable for tests.
 * @returns {{ hex: number, css: string }}
 */
export function resolveAxisMarkColor(themeKey, docRef) {
  if (typeof themeKey === 'string' && isViewportSchemeKey(themeKey)) {
    const axes = PREVIEW_COLORS[themeKey]?.axes;
    if (typeof axes === 'number') {
      return { hex: axes, css: hexToCss(axes) };
    }
  }

  const doc = docRef ?? globalThis.document;
  const fallbackHex =
    typeof themeKey === 'string' && themeKey.includes('dark')
      ? FALLBACK_DARK_HEX
      : FALLBACK_LIGHT_HEX;

  // Read the token off <body>, not <html>: theme tokens on <html> inherit
  // down into <body>, so the value is the same for the app themes — but
  // Classic's remap is body-scoped and only exists there (U-13). Body can
  // be briefly null while <head> is still parsing; fall back to <html>.
  const el = doc?.body ?? doc?.documentElement;
  if (!el?.ownerDocument?.defaultView?.getComputedStyle) {
    return { hex: fallbackHex, css: hexToCss(fallbackHex) };
  }

  try {
    const win = el.ownerDocument.defaultView;
    const cs = win.getComputedStyle(el);
    const raw = cs.getPropertyValue('--color-text-primary').trim();
    const parsed = parseCssColorToHex(raw);
    if (parsed != null) {
      return { hex: parsed, css: hexToCss(parsed) };
    }
  } catch {
    /* fall through */
  }
  return { hex: fallbackHex, css: hexToCss(fallbackHex) };
}

/**
 * The zoom-adaptive scale, exactly as showScalemarkers() computes it.
 *
 * @param {number} distanceMm Camera distance to the look-at point.
 * @returns {{distanceMm: number, lAdjusted: number, tickStepMm: number,
 *            extraLabels: boolean}}
 */
export function computeScale(distanceMm) {
  const l = clampPositive(distanceMm, DEFAULT_DISTANCE_MM);
  const lAdjusted = Math.pow(10, Math.floor(Math.log10(l)));
  return {
    distanceMm: l,
    lAdjusted,
    tickStepMm: lAdjusted / 10,
    extraLabels: l / lAdjusted < MORE_LABELS_THRESHOLD,
  };
}

/**
 * Build a fresh axis-tick overlay group. Caller is responsible for adding
 * it to a Three.js scene, for rebuilding it when the camera distance
 * changes (the whole overlay is a function of that distance), and for
 * calling `dispose()` on the returned controller when finished.
 *
 * @param {Object} three            Three.js module (getThreeModule()).
 * @param {Object} [opts]
 * @param {string} [opts.themeKey]  Preview theme key, used for color resolution.
 * @param {number} [opts.distanceMm] Camera distance to the look-at point.
 * @param {Document} [opts.document] Override `document` (tests).
 * @returns {{
 *   group: Object,
 *   labelCount: number,
 *   tickCount: number,
 *   colorHex: number,
 *   distanceMm: number,
 *   tickStepMm: number,
 *   dispose: () => void,
 * }}
 */
export function buildAxisTickOverlay(three, opts = {}) {
  if (!three)
    throw new Error('buildAxisTickOverlay requires a Three.js module');

  const themeKey = opts.themeKey || 'light';
  const docRef = opts.document ?? globalThis.document;
  const { hex: colorHex } = resolveAxisMarkColor(themeKey, docRef);

  const marker = buildMarkerGeometry(opts.distanceMm);

  const group = new three.Group();
  group.name = '__axisTickOverlay';
  // Deliberately NO renderOrder and no depth opt-outs anywhere below:
  // marks hidden behind solid geometry are the feature (U-11).

  const lineMat = new three.LineBasicMaterial({ color: colorHex });
  const dashMat = new three.LineDashedMaterial({
    color: colorHex,
    dashSize: marker.distanceMm / DASH_DIVISOR,
    gapSize: marker.distanceMm / DASH_DIVISOR,
  });

  const makeSegments = (positions, material, name) => {
    const geometry = new three.BufferGeometry();
    geometry.setAttribute(
      'position',
      new three.Float32BufferAttribute(positions, 3)
    );
    const segments = new three.LineSegments(geometry, material);
    segments.name = name;
    return { geometry, segments };
  };

  const solid = makeSegments(marker.solidTicks, lineMat, '__axisTickLines');
  const dashed = makeSegments(
    marker.dashedTicks,
    dashMat,
    '__axisTickLinesNeg'
  );
  // Dashes are computed from per-vertex distances; without this the
  // dashed material renders solid (the R-IV lesson).
  dashed.segments.computeLineDistances();
  const digits = makeSegments(marker.digits, lineMat, '__axisTickDigits');

  group.add(solid.segments);
  group.add(dashed.segments);
  group.add(digits.segments);

  return {
    group,
    labelCount: marker.labelCount,
    tickCount: marker.tickCount,
    colorHex,
    distanceMm: marker.distanceMm,
    tickStepMm: marker.tickStepMm,
    dispose: () => {
      solid.geometry.dispose?.();
      dashed.geometry.dispose?.();
      digits.geometry.dispose?.();
      lineMat.dispose?.();
      dashMat.dispose?.();
    },
  };
}

/* ------------------------------------------------------------------ *
 * decodeMarkerValue() transcription — the vector glyph font.
 *
 * Each character is drawn inside a six-vertex box (A..F):
 *   A--B      row A/B at height 1.25u ("dig_h")
 *   |  |      row C/D at 0.875u ("dig_h/2 + dig_buf")
 *   C--D      row E/F at 0.25u  ("dig_buf")
 *   |  |      width u/2, char pitch 0.75u, u = l/60
 *   E--F
 * laid out in "canonical" coordinates (along-axis, off-axis-height) and
 * then permuted per axis-direction by AX. The OR_* tables re-order the
 * stroke walk per direction — that is how the desktop mirrors glyphs for
 * the axes whose plane basis is left-handed, so numbers read correctly
 * from the canonical viewpoint. Transcribed verbatim, not re-derived.
 * ------------------------------------------------------------------ */

// Component order (canonical → world) per direction di:
// 0:+X, 1:+Y, 2:+Z, 3:−X, 4:−Y, 5:−Z.
const AX = [
  [0, 1, 2],
  [1, 0, 2],
  [1, 2, 0],
  [0, 1, 2],
  [1, 0, 2],
  [1, 2, 0],
];

const OR_2 = [
  [0, 1, 3, 2, 4, 5],
  [1, 0, 2, 3, 5, 4],
  [1, 0, 2, 3, 5, 4],
  [1, 0, 2, 3, 5, 4],
  [0, 1, 3, 2, 4, 5],
  [0, 1, 3, 2, 4, 5],
];

const OR_3 = [
  [0, 1, 3, 2, 3, 5, 4],
  [1, 0, 2, 3, 2, 4, 5],
  [1, 0, 2, 3, 2, 4, 5],
  [1, 0, 2, 3, 2, 4, 5],
  [0, 1, 3, 2, 3, 5, 4],
  [0, 1, 3, 2, 3, 5, 4],
];

const OR_4 = [
  [0, 2, 3, 1, 5],
  [1, 3, 2, 0, 4],
  [1, 3, 2, 0, 4],
  [1, 3, 2, 0, 4],
  [0, 2, 3, 1, 5],
  [0, 2, 3, 1, 5],
];

const OR_5 = [
  [1, 0, 2, 3, 5, 4],
  [0, 1, 3, 2, 4, 5],
  [0, 1, 3, 2, 4, 5],
  [0, 1, 3, 2, 4, 5],
  [1, 0, 2, 3, 5, 4],
  [1, 0, 2, 3, 5, 4],
];

const OR_6 = [
  [1, 0, 4, 5, 3, 2],
  [0, 1, 5, 4, 2, 3],
  [0, 1, 5, 4, 2, 3],
  [0, 1, 5, 4, 2, 3],
  [1, 0, 4, 5, 3, 2],
  [1, 0, 4, 5, 3, 2],
];

const OR_7 = [
  [0, 1, 4],
  [1, 0, 5],
  [1, 0, 5],
  [1, 0, 5],
  [0, 1, 4],
  [0, 1, 4],
];

const OR_9 = [
  [5, 1, 0, 2, 3],
  [4, 0, 1, 3, 2],
  [4, 0, 1, 3, 2],
  [4, 0, 1, 3, 2],
  [5, 1, 0, 2, 3],
  [5, 1, 0, 2, 3],
];

const OR_E = [
  [1, 0, 2, 3, 2, 4, 5],
  [0, 1, 3, 2, 3, 5, 4],
  [0, 1, 3, 2, 3, 5, 4],
  [0, 1, 3, 2, 3, 5, 4],
  [1, 0, 2, 3, 2, 4, 5],
  [1, 0, 2, 3, 2, 4, 5],
];

// Symmetric glyphs use one fixed vertex walk; the rest carry per-direction
// OR tables. mode: 'lines' = independent pairs, 'strip' = connected walk,
// 'loop' = strip closed back to its first vertex.
const GLYPHS = {
  1: { mode: 'lines', fixed: [0, 4] },
  2: { mode: 'strip', or: OR_2 },
  3: { mode: 'strip', or: OR_3 },
  4: { mode: 'strip', or: OR_4 },
  5: { mode: 'strip', or: OR_5 },
  6: { mode: 'strip', or: OR_6 },
  7: { mode: 'strip', or: OR_7 },
  8: { mode: 'strip', fixed: [2, 3, 1, 0, 4, 5, 3] },
  9: { mode: 'strip', or: OR_9 },
  0: { mode: 'loop', fixed: [0, 1, 5, 4] },
  '-': { mode: 'lines', fixed: [2, 3] },
  '.': { mode: 'lines', fixed: [4, 5] },
  e: { mode: 'strip', or: OR_E },
};

/**
 * Match C++ `STR(i)` (ostringstream, 6 significant digits): our loop
 * multiplies k·step, but callers still must never see "30.000000000000004".
 * @param {number} value
 */
function formatMarkerNumber(value) {
  return String(Number(value.toPrecision(6)));
}

/**
 * All tick + numeral vertex data for one camera distance.
 *
 * @param {number|undefined} distanceMm
 * @returns {{distanceMm: number, tickStepMm: number, solidTicks: number[],
 *            dashedTicks: number[], digits: number[], tickCount: number,
 *            labelCount: number}}
 */
function buildMarkerGeometry(distanceMm) {
  const { distanceMm: l, tickStepMm, extraLabels } = computeScale(distanceMm);
  const unit = l / SIZE_DIV_SM;
  const minor = unit;
  const major = l / (SIZE_DIV_SM / 2);

  const solidTicks = [];
  const dashedTicks = [];
  const digits = [];
  let tickCount = 0;
  let labelCount = 0;

  const nz = (v) => (v === 0 ? 0 : v);
  const pushTick = (out, sx, sy, sz, ex, ey, ez) => {
    out.push(nz(sx), nz(sy), nz(sz), nz(ex), nz(ey), nz(ez));
    tickCount++;
  };

  for (let k = 0; k * tickStepMm < l; k++) {
    const i = k * tickStepMm;
    const isMajor = k > 0 && k % MAJOR_EVERY === 0;
    const len = isMajor ? major : minor;

    // One-sided arms (GLView.cc "1 arm" form): X ticks toward −Y,
    // Y and Z ticks toward −X. XY-plane content carries the grid lift.
    pushTick(solidTicks, i, 0, XY_LIFT_MM, i, -len, XY_LIFT_MM);
    pushTick(solidTicks, 0, i, XY_LIFT_MM, -len, i, XY_LIFT_MM);
    pushTick(solidTicks, 0, 0, i, -len, 0, i);
    pushTick(dashedTicks, -i, 0, XY_LIFT_MM, -i, -len, XY_LIFT_MM);
    pushTick(dashedTicks, 0, -i, XY_LIFT_MM, -len, -i, XY_LIFT_MM);
    pushTick(dashedTicks, 0, 0, -i, -len, 0, -i);

    const labelled =
      isMajor || (extraLabels && k > 0 && k % MORE_LABELS_FREQ === 0);
    if (labelled) {
      const text = formatMarkerNumber(i);
      for (let di = 0; di < 6; di++) {
        emitMarkerNumber(digits, text, i, di, unit);
        labelCount++;
      }
    }
  }

  return {
    distanceMm: l,
    tickStepMm,
    solidTicks,
    dashedTicks,
    digits,
    tickCount,
    labelCount,
  };
}

/**
 * Emit one number's glyph strokes as line-segment pairs.
 *
 * @param {number[]} out    Flat vertex triplets, appended in place.
 * @param {string} text     Unsigned number text (e.g. "20", "0.5").
 * @param {number} i        Distance along the axis, always positive.
 * @param {number} di       Direction 0..5 (+X,+Y,+Z,−X,−Y,−Z).
 * @param {number} unit     l/60.
 */
function emitMarkerNumber(out, text, i, di, unit) {
  const polarity = di > 2 ? -1 : 1;
  let chars = di > 2 ? `-${text}` : text;
  if (di > 0 && di < 4) chars = [...chars].reverse().join('');

  const buf = unit / 4;
  const w = unit / 2;
  const h = unit + buf;
  const pitch = w + buf;
  const axMap = AX[di];
  // The grid lift applies to the XY-plane numbers (X and Y axes); the Z
  // axis's numbers live in XZ where there is no grid.
  const lift = di === 2 || di === 5 ? 0 : XY_LIFT_MM;

  for (let charNum = 0; charNum < chars.length; charNum++) {
    const glyph = GLYPHS[chars[charNum]];
    // Desktop's switch has no default: unknown characters draw nothing.
    if (!glyph) continue;

    const cx = i + charNum * pitch;
    // Canonical box vertices as (along, height) pairs, rows A/B, C/D, E/F.
    const box = [
      [cx - w / 2, h],
      [cx + w / 2, h],
      [cx - w / 2, h / 2 + buf],
      [cx + w / 2, h / 2 + buf],
      [cx - w / 2, buf],
      [cx + w / 2, buf],
    ];
    const vertex = (idx) => {
      const canonical = [polarity * box[idx][0], box[idx][1], 0];
      return [
        canonical[axMap[0]],
        canonical[axMap[1]],
        canonical[axMap[2]] + lift,
      ];
    };

    const seq = glyph.or ? glyph.or[di] : glyph.fixed;
    if (glyph.mode === 'lines') {
      for (let s = 0; s + 1 < seq.length; s += 2) {
        out.push(...vertex(seq[s]), ...vertex(seq[s + 1]));
      }
    } else {
      for (let s = 0; s + 1 < seq.length; s++) {
        out.push(...vertex(seq[s]), ...vertex(seq[s + 1]));
      }
      if (glyph.mode === 'loop') {
        out.push(...vertex(seq[seq.length - 1]), ...vertex(seq[0]));
      }
    }
  }
}

/** @param {unknown} v @param {number} fallback */
function clampPositive(v, fallback) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return fallback;
  return v;
}

/** @param {number} hex */
function hexToCss(hex) {
  const safe = Math.max(0, Math.min(0xffffff, Math.floor(hex)));
  return `#${safe.toString(16).padStart(6, '0')}`;
}

/**
 * Parse the most common CSS color forms emitted by `getPropertyValue`
 * into a 24-bit hex int. Returns `null` on anything we don't grok so
 * the caller can pick a theme-appropriate fallback.
 *
 * @param {string} value
 * @returns {number|null}
 */
function parseCssColorToHex(value) {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (v.length === 0) return null;

  // #rgb / #rrggbb
  const hashMatch = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (hashMatch) {
    const hex = hashMatch[1];
    if (hex.length === 3) {
      return parseInt(
        hex
          .split('')
          .map((c) => c + c)
          .join(''),
        16
      );
    }
    return parseInt(hex, 16);
  }

  // rgb()/rgba() — both legacy comma syntax and the new whitespace+slash form.
  const rgbMatch = v.match(
    /^rgba?\(\s*(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)/
  );
  if (rgbMatch) {
    const r = clamp255(rgbMatch[1]);
    const g = clamp255(rgbMatch[2]);
    const b = clamp255(rgbMatch[3]);
    return (r << 16) | (g << 8) | b;
  }

  return null;
}

/** @param {string} s */
function clamp255(s) {
  const n = Number(s);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(255, Math.round(n)));
}

// Exported for tests.
export const __test = {
  parseCssColorToHex,
  hexToCss,
  buildMarkerGeometry,
  emitMarkerNumber,
  formatMarkerNumber,
  AX,
  GLYPHS,
  SIZE_DIV_SM,
  MAJOR_EVERY,
  MORE_LABELS_THRESHOLD,
  MORE_LABELS_FREQ,
  XY_LIFT_MM,
  DASH_DIVISOR,
  DEFAULT_DISTANCE_MM,
};
