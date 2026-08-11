/**
 * Axis tick mark overlay (F20).
 *
 * Builds a Three.js Group containing:
 *   - Short tick marks at every 10 mm along the +X, +Y and +Z axes
 *   - Sprite labels at every 50 mm (first label at 50 mm, then 100, 150…)
 *     with the axis letter included on the prominent 50/100 mm ticks
 *
 * Colors are resolved scheme-first (U-13): a Classic viewport scheme
 * paints with its own transcribed desktop `axes` color from
 * PREVIEW_COLORS, so the marks match the scheme it belongs to no matter
 * which app theme is active underneath. App themes fall back to the
 * `--color-text-primary` custom property, read from BODY at build time —
 * Classic's token remap is body-scoped while the theme attribute sits on
 * <html>, and custom properties only inherit downward, so an html-level
 * read could bake a dark theme's light foreground into Classic's light
 * scene (the U-13 defect). The body read tracks Light, Dark,
 * High-Contrast, and forced-colors modes without per-theme branches.
 *
 * The overlay is a *child* concept — the existing AxesHelper still
 * draws the coloured axis arms; this module adds metric scale
 * decoration on top. They can be toggled independently per F20.
 *
 * @license GPL-3.0-or-later
 */

import { PREVIEW_COLORS, isViewportSchemeKey } from './preview.js';

const DEFAULT_RANGE_MM = 200; // ± along each axis
const DEFAULT_TICK_STEP_MM = 10; // small tick every 10 mm
const DEFAULT_LABEL_STEP_MM = 50; // labelled tick every 50 mm
const TICK_SHORT_MM = 1.5; // perpendicular length of small ticks
const TICK_LONG_MM = 3.5; // perpendicular length of labelled ticks
// Canvas pixels per scene millimetre for the label sprites. Sprites are
// sized in world units, so this fixes a label's height in mm: at 12, the
// 48px prominent labels stand 4mm tall against ticks every 10mm and labels
// every 50mm, which reads without covering the model.
//
// This is the first release in which the overlay has ever drawn (it threw on
// every attempt before — see getThreeModule), so the previous value of 5 had
// never been seen. It put the labels 9.6mm tall, about 37px on screen at the
// default camera, large enough to sit over the model itself. No test pins
// this number; it was set by looking at the rendered viewport against
// OpenSCAD_1.png.
const SPRITE_PIXELS_PER_MM = 12;
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
 * Build a fresh axis-tick overlay group. Caller is responsible for
 * adding it to a Three.js scene and for calling `dispose()` on the
 * returned controller when finished.
 *
 * @param {Object} three            Three.js module (THREE).
 * @param {Object} [opts]
 * @param {string} [opts.themeKey]  Preview theme key, used for color fallback.
 * @param {number} [opts.rangeMm]   Half-extent along each axis. Default 200 mm.
 * @param {number} [opts.tickStepMm] Spacing between small ticks. Default 10 mm.
 * @param {number} [opts.labelStepMm] Spacing between labelled ticks. Default 50 mm.
 * @param {Document} [opts.document] Override `document` (tests).
 * @returns {{
 *   group: Object,
 *   labelCount: number,
 *   tickCount: number,
 *   colorHex: number,
 *   dispose: () => void,
 * }}
 */
export function buildAxisTickOverlay(three, opts = {}) {
  if (!three)
    throw new Error('buildAxisTickOverlay requires a Three.js module');

  const themeKey = opts.themeKey || 'light';
  const rangeMm = clampPositive(opts.rangeMm, DEFAULT_RANGE_MM);
  const tickStepMm = clampPositive(opts.tickStepMm, DEFAULT_TICK_STEP_MM);
  const labelStepMm = clampPositive(opts.labelStepMm, DEFAULT_LABEL_STEP_MM);
  const docRef = opts.document ?? globalThis.document;

  const { hex: colorHex, css: colorCss } = resolveAxisMarkColor(
    themeKey,
    docRef
  );

  const group = new three.Group();
  group.name = '__axisTickOverlay';
  // Make sure ticks render above the build plate but stay below the
  // model. Tiny Z lift avoids z-fighting with the gridplane on Z=0.
  group.renderOrder = 10;

  const lineMat = new three.LineBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity: 1,
  });
  const tickGeometry = new three.BufferGeometry();
  const positions = collectTickPositions({
    rangeMm,
    tickStepMm,
    labelStepMm,
  });
  tickGeometry.setAttribute(
    'position',
    new three.Float32BufferAttribute(positions, 3)
  );
  const tickLines = new three.LineSegments(tickGeometry, lineMat);
  tickLines.name = '__axisTickLines';
  group.add(tickLines);

  /** @type {Array<{ texture: any, material: any, sprite: any, canvas: any }>} */
  const labels = [];

  // Build labelled sprites. Include the axis letter on the prominent
  // 50 / 100 mm ticks per the F20 acceptance criteria; bare numbers
  // for ≥150 mm to keep the scene readable.
  for (let mm = labelStepMm; mm <= rangeMm; mm += labelStepMm) {
    const isProminent = mm === 50 || mm === 100;
    for (const axis of ['x', 'y', 'z']) {
      for (const sign of [1, -1]) {
        const label = isProminent
          ? `${sign === -1 ? '-' : ''}${mm} ${axis.toUpperCase()}`
          : `${sign === -1 ? '-' : ''}${mm}`;
        const sprite = makeLabelSprite(three, {
          text: label,
          colorCss,
          docRef,
          isProminent,
        });
        if (!sprite) continue;
        const offset = TICK_LONG_MM * 1.6;
        if (axis === 'x') {
          sprite.sprite.position.set(sign * mm, offset, 0);
        } else if (axis === 'y') {
          sprite.sprite.position.set(0, sign * mm, offset);
        } else {
          sprite.sprite.position.set(offset, 0, sign * mm);
        }
        sprite.sprite.userData.axisMark = { axis, mm: sign * mm, isProminent };
        group.add(sprite.sprite);
        labels.push(sprite);
      }
    }
  }

  return {
    group,
    labelCount: labels.length,
    tickCount: positions.length / 6,
    colorHex,
    dispose: () => {
      tickGeometry.dispose?.();
      lineMat.dispose?.();
      labels.forEach(({ texture, material, sprite, canvas }) => {
        texture?.dispose?.();
        material?.dispose?.();
        sprite?.geometry?.dispose?.();
        if (canvas?.width != null) canvas.width = 0;
      });
      labels.length = 0;
    },
  };
}

/**
 * @param {Object} three
 * @param {{ text: string, colorCss: string, docRef: Document, isProminent: boolean }} opts
 */
function makeLabelSprite(three, { text, colorCss, docRef, isProminent }) {
  const doc = docRef;
  if (!doc?.createElement) return null;
  const canvas = doc.createElement('canvas');
  // jsdom lacks 2D context; bail out so unit tests in node don't choke.
  const ctx =
    typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
  if (!ctx) {
    // Without a 2D context we cannot rasterise text — return a
    // placeholder Sprite with no texture so the count assertions in
    // tests still hold and the visible scene degrades gracefully.
    const placeholderMat = new three.SpriteMaterial({
      transparent: true,
      opacity: 0,
    });
    const placeholderSprite = new three.Sprite(placeholderMat);
    placeholderSprite.scale.set(0, 0, 0);
    return {
      sprite: placeholderSprite,
      texture: null,
      material: placeholderMat,
      canvas,
    };
  }

  const fontSize = isProminent ? 36 : 28;
  const padding = 6;
  ctx.font = `${isProminent ? '600' : '400'} ${fontSize}px sans-serif`;
  const metrics = ctx.measureText(text);
  const textWidth = Math.ceil(metrics.width);
  canvas.width = textWidth + padding * 2;
  canvas.height = fontSize + padding * 2;

  // Re-set font after resize (canvas state resets on dimension change).
  ctx.font = `${isProminent ? '600' : '400'} ${fontSize}px sans-serif`;
  ctx.textBaseline = 'top';
  ctx.fillStyle = colorCss;
  ctx.fillText(text, padding, padding);

  const texture = new three.CanvasTexture(canvas);
  texture.needsUpdate = true;
  const material = new three.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new three.Sprite(material);
  // Convert canvas dimensions to scene units so the sprite reads the
  // same physical size at the current camera distance regardless of
  // model scale.
  sprite.scale.set(
    canvas.width / SPRITE_PIXELS_PER_MM,
    canvas.height / SPRITE_PIXELS_PER_MM,
    1
  );
  return { sprite, texture, material, canvas };
}

/**
 * @param {{rangeMm: number, tickStepMm: number, labelStepMm: number}} opts
 * @returns {number[]} Flat array of triplets: x0,y0,z0, x1,y1,z1, ...
 */
function collectTickPositions({ rangeMm, tickStepMm, labelStepMm }) {
  const out = [];
  for (let mm = tickStepMm; mm <= rangeMm; mm += tickStepMm) {
    const isLabelled = mm % labelStepMm === 0;
    const half = (isLabelled ? TICK_LONG_MM : TICK_SHORT_MM) / 2;
    for (const sign of [1, -1]) {
      const v = sign * mm;
      // X-axis ticks: line in Y direction (small perpendicular dash)
      out.push(v, -half, 0, v, half, 0);
      // Y-axis ticks: line in X direction
      out.push(-half, v, 0, half, v, 0);
      // Z-axis ticks: line in X direction (perpendicular off Z)
      out.push(-half, 0, v, half, 0, v);
    }
  }
  return out;
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
  collectTickPositions,
  hexToCss,
  TICK_SHORT_MM,
  TICK_LONG_MM,
};
