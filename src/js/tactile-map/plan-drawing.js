/**
 * A map plan into the drawing editor and back by index. A draft's geometry
 * is exact (it came from OpenStreetMap through a projection) and is never
 * re-traced: the editor only decides which features are on and what class
 * each has, and the plan keeps every point.
 *
 * `drawingFromPlan` writes ONE path per feature in feature order, each
 * marked `data-feature="<id>"`, off features included so the editor can
 * switch them on. The analyzer lists a path that carries `data-colour` as
 * one element (its outer ring) whatever its holes, so every path carries
 * it: a stroked loop or an area with holes stays one row, at the feature's
 * index. `applyRowsToPlan` reads the rows back by that index.
 *
 * No DOM here: a worker may import this file.
 *
 * @license GPL-3.0-or-later
 */

import { ringsToPathData, union } from '../ring-geometry.js';
import { activeLibrary } from './symbol-library.js';
import { featureNames } from './feature-names.js';
import {
  BUILTIN_SYMBOLS,
  DEFAULT_SETTINGS,
  LEVELS_BY_CLASS,
  strokePolyline,
  symbolMap,
  symbolRings,
} from './levels-svg.js';

const toPts = (pairs) => pairs.map(([x, y]) => ({ x, y }));
const rect = (x0, y0, x1, y1) => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

/** The rings that draw one feature, as the levels builder would raise it. */
function ringsOf(f, settings, symbols) {
  const cls = LEVELS_BY_CLASS[f.class] || {};
  if (f.kind === 'line') {
    const width = f.width ?? cls.width ?? 1.5;
    const pieces = strokePolyline(f.points, width);
    return pieces.length ? union(pieces) : [];
  }
  if (f.kind === 'area') {
    return [toPts(f.ring), ...(f.holes || []).map(toPts)];
  }
  if (f.kind === 'point') {
    const size = f.size ?? settings.symbolSizeMm;
    const key = f.symbol ?? cls.symbol ?? 'circle';
    const shape = symbols[key] || symbols.circle || BUILTIN_SYMBOLS.circle;
    return symbolRings(shape, size, f.at);
  }
  if (f.kind === 'text') {
    const size = f.size ?? settings.titleCharHeightMm;
    const [x, y] = f.at;
    return [
      rect(x, y, x + f.text.length * size * settings.letterAdvance, y + size),
    ];
  }
  if (f.kind === 'channel') {
    const across = settings.tapeWidthMm + settings.channelClearanceMm;
    const [cx, cy] = f.at;
    const half = f.vertical
      ? [across / 2, f.length / 2]
      : [f.length / 2, across / 2];
    return [rect(cx - half[0], cy - half[1], cx + half[0], cy + half[1])];
  }
  return [];
}

/**
 * The plan as a drawing for the editor's map purpose.
 *
 * @param {object} plan
 * @param {object} [settings] - the levels builder's settings (sizes)
 * @returns {string} SVG
 */
export function drawingFromPlan(plan, settings = {}) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const symbols = symbolMap(s.symbols || activeLibrary());
  const w = plan.size.w;
  const h = plan.size.h;
  const names = featureNames(plan.features || []);
  const paths = (plan.features || []).map((f, i) => {
    const rings = ringsOf(f, s, symbols).filter((r) => r && r.length >= 3);
    const d = ringsToPathData(rings);
    const fillRule = f.kind === 'area' ? ' fill-rule="evenodd"' : '';
    return (
      `<path data-feature="${escapeAttr(f.id)}" data-colour="draft"` +
      ` data-name="${escapeAttr(names[i])}"${fillRule} d="${d}"/>`
    );
  });
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" ` +
    `viewBox="0 0 ${w} ${h}">` +
    paths.join('') +
    '</svg>'
  );
}

/**
 * The editor's rows laid back over the plan by index: a row classed
 * `ignore` switches its feature off (the class kept, so switching it back
 * on restores it); any other class switches it on with that class. The
 * geometry is untouched; the plan returned is new.
 *
 * @param {object} plan
 * @param {Array<{index: number, class: string}>} regions
 * @returns {object}
 */
export function applyRowsToPlan(plan, regions) {
  const features = (plan.features || []).map((f) => ({ ...f }));
  for (const region of regions || []) {
    const i = Number(region?.index);
    const f = Number.isInteger(i) ? features[i] : null;
    if (!f) continue;
    const cls = typeof region.class === 'string' ? region.class : 'ignore';
    if (cls === 'ignore') {
      f.on = false;
    } else {
      f.on = true;
      f.class = cls;
    }
  }
  return { ...plan, features };
}
