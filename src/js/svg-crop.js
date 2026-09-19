/**
 * Cropping a vector drawing (DP-49).
 *
 * A drawing is cropped by clipping: every shape's rings intersected with the
 * kept rectangle through the ring engine, shapes the clip empties dropped,
 * the picture's box rewritten to the rectangle. The host owns the operation
 * (it owns the drawing and the engine); the editor only says the rectangle,
 * in the drawing's own units.
 *
 * A compound path's rings are first resolved into a region under the fill
 * rule the shape really has (evenodd or nonzero), so a hole is a hole before
 * the clip and after it, and the result is written the way the engine hands
 * it back: nonzero, holes wound against their outer ring.
 *
 * @license GPL-3.0-or-later
 */

import { getEffectivePaint, parseSvgElements } from './svg-preparer.js';
import { readDrawingBox } from './image-crop.js';

export { readDrawingBox };
import {
  evenOddUnion,
  intersect,
  ringsFromPathData,
  ringsToPathData,
  union,
} from './ring-geometry.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Attributes that carried the geometry; after the clip the geometry is `d`
 * alone, transforms baked in.
 */
const GEOMETRY_ATTRIBUTES = new Set([
  'd',
  'points',
  'x',
  'y',
  'width',
  'height',
  'r',
  'rx',
  'ry',
  'cx',
  'cy',
  'x1',
  'y1',
  'x2',
  'y2',
  'transform',
  'pathLength',
]);

/** Containers whose shapes never draw by themselves. */
const NON_RENDERING = new Set([
  'defs',
  'clippath',
  'mask',
  'marker',
  'pattern',
  'symbol',
  'metadata',
  'title',
  'desc',
]);

function isInsideNonRendering(element) {
  let parent = element.parentElement;
  while (parent) {
    if (NON_RENDERING.has(parent.tagName.toLowerCase())) return true;
    parent = parent.parentElement;
  }
  return false;
}

/**
 * Pull a rectangle back inside a box. Unlike the pixel clamp this keeps
 * fractions, since a drawing's units are whatever its author chose.
 *
 * @param {{x: number, y: number, width: number, height: number}} rect
 * @param {{x: number, y: number, width: number, height: number}} box
 * @returns {{x: number, y: number, width: number, height: number}}
 * @throws {Error} when nothing of the box would be kept
 */
export function clampRectToBox(rect, box) {
  const num = (v, fallback) => (Number.isFinite(v) ? v : fallback);
  const right = box.x + box.width;
  const bottom = box.y + box.height;
  const x = Math.min(Math.max(num(rect?.x, box.x), box.x), right);
  const y = Math.min(Math.max(num(rect?.y, box.y), box.y), bottom);
  const x2 = Math.min(Math.max(x + num(rect?.width, box.width), x), right);
  const y2 = Math.min(Math.max(y + num(rect?.height, box.height), y), bottom);
  const width = x2 - x;
  const height = y2 - y;
  if (!(width > 0 && height > 0)) {
    throw new Error('The crop would keep nothing of the drawing.');
  }
  return { x, y, width, height };
}

function formatNumber(n) {
  return String(+n.toFixed(4));
}

/**
 * Clip a drawing to a rectangle.
 *
 * @param {string} svgString
 * @param {{x: number, y: number, width: number, height: number}} rect - In the drawing's units
 * @returns {{svg: string, kept: number, dropped: number, rect: {x: number, y: number, width: number, height: number}}}
 * @throws {Error} when the string is not a drawing, or the rectangle keeps nothing
 */
export function cropSvgDrawing(svgString, rect) {
  const source = new DOMParser().parseFromString(svgString, 'image/svg+xml');
  const sourceRoot = source.querySelector('svg');
  const box = sourceRoot ? readDrawingBox(sourceRoot) : null;
  if (!box) throw new Error('The drawing has no size to crop within.');
  const clip = clampRectToBox(rect, box);
  const clipRing = [
    { x: clip.x, y: clip.y },
    { x: clip.x + clip.width, y: clip.y },
    { x: clip.x + clip.width, y: clip.y + clip.height },
    { x: clip.x, y: clip.y + clip.height },
  ];

  // The parser hands back one descriptor per subpath, transforms baked; a
  // shape is the element, so its subpaths are gathered back together here.
  const byElement = new Map();
  for (const descriptor of parseSvgElements(svgString)) {
    if (isInsideNonRendering(descriptor.element)) continue;
    let entry = byElement.get(descriptor.element);
    if (!entry) {
      entry = { descriptor, rings: [] };
      byElement.set(descriptor.element, entry);
    }
    entry.rings.push(...ringsFromPathData(descriptor.pathData));
  }

  const out = new DOMParser().parseFromString(
    `<svg xmlns="${SVG_NS}"></svg>`,
    'image/svg+xml'
  );
  const root = out.documentElement;
  root.setAttribute(
    'viewBox',
    [clip.x, clip.y, clip.width, clip.height].map(formatNumber).join(' ')
  );
  root.setAttribute('width', formatNumber(clip.width));
  root.setAttribute('height', formatNumber(clip.height));

  let kept = 0;
  let dropped = 0;
  for (const { descriptor, rings } of byElement.values()) {
    const rule = String(
      getEffectivePaint(descriptor.element, 'fill-rule') || 'nonzero'
    ).toLowerCase();
    const region = rule === 'evenodd' ? evenOddUnion(rings) : union(rings, []);
    const clipped = region.length ? intersect(region, [clipRing]) : [];
    if (!clipped.length) {
      dropped += 1;
      continue;
    }
    const path = out.createElementNS(SVG_NS, 'path');
    for (const attr of Array.from(descriptor.element.attributes)) {
      if (GEOMETRY_ATTRIBUTES.has(attr.name)) continue;
      path.setAttribute(attr.name, attr.value);
    }
    if (descriptor.fill) path.setAttribute('fill', descriptor.fill);
    if (descriptor.stroke) path.setAttribute('stroke', descriptor.stroke);
    path.setAttribute('d', ringsToPathData(clipped));
    root.appendChild(path);
    kept += 1;
  }

  return {
    svg: new XMLSerializer().serializeToString(out),
    kept,
    dropped,
    rect: clip,
  };
}
