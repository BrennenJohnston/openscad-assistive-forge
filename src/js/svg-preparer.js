/**
 * SVG Preparer Module
 *
 * Transforms multi-element SVGs into OpenSCAD-compatible compound-path SVGs.
 * OpenSCAD's import() renders all filled SVG elements as solid geometry with
 * no color-based subtraction, so multi-element SVGs that rely on overlapping
 * shapes with different fill colors must be flattened into a single compound
 * path with evenodd winding.
 *
 * Uses path-bool for boolean operations and svg-path-commander for
 * shape-to-path conversion.
 *
 * @license GPL-3.0-or-later
 */

import { parseLuminance } from './image-import.js';
import {
  parsePathString,
  pathToAbsolute,
  pathToCurve,
  pathToString,
  shapeToPathArray,
  splitPath,
  getPointAtLength,
  getTotalLength,
  getPathBBox,
} from 'svg-path-commander';
import {
  fromTransformAttribute,
  fromDefinition,
  compose,
  applyToPoint,
} from 'transformation-matrix';
import { offsetPath } from './svg-offset.js';
import {
  pathFromPathData,
  pathToPathData,
  pathBoolean,
  PathBooleanOperation,
  FillRule,
} from 'path-bool';

const SHAPE_TAGS = new Set([
  'path',
  'polygon',
  'polyline',
  'line',
  'circle',
  'ellipse',
  'rect',
]);

const NON_RENDERING_CONTAINERS = new Set([
  'defs',
  'clippath',
  'mask',
  'symbol',
  'marker',
  'pattern',
]);

/**
 * Element-count tiers, signed by the owner at DP-Q9 (2026-08-28) against the
 * DP-0 bench rather than assumed.
 *
 * The old single cap of 50 was documented as guarding path-bool, and DP-0's
 * measurement says that was exactly right - and that it was ALSO doing a job
 * it had no business doing. The two bills are wildly different:
 *
 *   count | table (parse+classify+analyze) | flattenToCompoundPath
 *         | desktop      4x throttle       | desktop
 *   ------+-------------------------------+-----------------------
 *      50 | 1.8-3.2 ms   10.8-20.8 ms     |   1.02 s
 *     100 | 2.7-7.7 ms   12.6-27.9 ms     |   7.53 s
 *     200 | 4.2-4.8 ms   19.6-23.6 ms     |  56.70 s
 *     400 | 8.5-10.0 ms  32.1-50.2 ms     | 447.90 s
 *     800 | 16.5-17.9 ms 71.5-86.4 ms     | ~59 min (extrapolated)
 *
 * and on the real file this round exists for, WATAP Logo HD.svg at 831
 * elements, the whole table builds in 24-27 ms desktop / 117-143 ms at 4x.
 * So the table is free and the boolean is everything: the cap was a BOOLEAN
 * cap wearing a TABLE cap's clothes, and refusing to show the table was
 * refusing the one thing that costs nothing.
 *
 * AUTO_RENDER_MAX (A): the whole chain runs on its own. 1.02 s desktop,
 *   4.9-5.3 s at 4x - right on the 5 s bar the plan set for the low end.
 * DEFER_FLATTEN_MAX (B): table and live preview stay; the boolean waits for
 *   a deliberate Apply, which costs 56.7 s desktop / 4 min 32 s at 4x and is
 *   said so in words.
 * TABLE_MAX (C): table only, preview on request. Admits the owner's 831.
 * Above C, a plain refusal that names the count and the cap.
 */
export const ELEMENT_TIERS = Object.freeze({
  autoRenderMax: 50,
  deferFlattenMax: 200,
  tableMax: 1000,
});

/**
 * Which tier a rendering-element count falls in.
 *
 * @param {number} count - Number of rendering elements
 * @returns {'auto'|'defer_flatten'|'manual_render'|'too_complex'}
 */
export function tierForCount(count) {
  if (count <= ELEMENT_TIERS.autoRenderMax) return 'auto';
  if (count <= ELEMENT_TIERS.deferFlattenMax) return 'defer_flatten';
  if (count <= ELEMENT_TIERS.tableMax) return 'manual_render';
  return 'too_complex';
}

// CSS Level 2 named colors → hex.
// parseLuminance() (image-import.js:130) handles rgb() and #hex only;
// named colors like "black"/"white" fall through to the default return 0.
const CSS_NAMED_COLORS = {
  black: '#000000',
  silver: '#c0c0c0',
  gray: '#808080',
  grey: '#808080',
  white: '#ffffff',
  maroon: '#800000',
  red: '#ff0000',
  purple: '#800080',
  fuchsia: '#ff00ff',
  green: '#008000',
  lime: '#00ff00',
  olive: '#808000',
  yellow: '#ffff00',
  navy: '#000080',
  blue: '#0000ff',
  teal: '#008080',
  aqua: '#00ffff',
  orange: '#ffa500',
  cyan: '#00ffff',
  magenta: '#ff00ff',
};

/**
 * Resolve a CSS fill value to a format parseLuminance() can handle.
 * @param {string} fillValue - Raw fill attribute value
 * @returns {string|null} Hex or rgb() string, or null for none/transparent
 */
function resolveColorToHex(fillValue) {
  if (!fillValue) return null;
  const lower = fillValue.trim().toLowerCase();
  if (lower === '' || lower === 'none' || lower === 'transparent') return null;
  if (lower in CSS_NAMED_COLORS) return CSS_NAMED_COLORS[lower];
  return fillValue;
}

/**
 * Convert a stroked (unfilled) SVG path into a filled outline path.
 *
 * Samples points along the path, computes perpendicular offsets at
 * ±strokeWidth/2, and builds a closed polygon approximating the
 * stroke outline. Handles butt, round, and square line caps.
 *
 * @param {string} pathData - SVG path `d` attribute
 * @param {number} strokeWidth - Stroke width
 * @param {string} [lineCap='butt'] - stroke-linecap value
 * @param {number} [sampleCount=64] - Number of sample points along the path
 * @returns {string} Filled outline path `d` string
 */
export function strokeToFill(
  pathData,
  strokeWidth,
  lineCap = 'butt',
  sampleCount = 64
) {
  const totalLen = getTotalLength(pathData);
  if (totalLen === 0 || strokeWidth <= 0) return pathData;

  const half = strokeWidth / 2;
  const dt = totalLen * 0.0005;
  const left = [];
  const right = [];

  for (let i = 0; i <= sampleCount; i++) {
    const t = (i / sampleCount) * totalLen;
    const pt = getPointAtLength(pathData, t);
    const prev = getPointAtLength(pathData, Math.max(0, t - dt));
    const next = getPointAtLength(pathData, Math.min(totalLen, t + dt));

    let dx = next.x - prev.x;
    let dy = next.y - prev.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) continue;
    dx /= len;
    dy /= len;

    left.push({ x: pt.x - dy * half, y: pt.y + dx * half });
    right.push({ x: pt.x + dy * half, y: pt.y - dx * half });
  }

  if (left.length === 0) return pathData;

  const r = (n) => Math.round(n * 1000) / 1000;
  let d = `M${r(left[0].x)},${r(left[0].y)}`;
  for (let i = 1; i < left.length; i++) {
    d += ` L${r(left[i].x)},${r(left[i].y)}`;
  }

  if (lineCap === 'round') {
    const endR = right[right.length - 1];
    d += ` A${r(half)},${r(half)} 0 0,1 ${r(endR.x)},${r(endR.y)}`;
  } else if (lineCap === 'square') {
    const lastL = left[left.length - 1];
    const lastR = right[right.length - 1];
    const endPt = getPointAtLength(pathData, totalLen);
    const prevPt = getPointAtLength(pathData, totalLen - dt);
    let ex = endPt.x - prevPt.x;
    let ey = endPt.y - prevPt.y;
    const el = Math.sqrt(ex * ex + ey * ey) || 1;
    ex /= el;
    ey /= el;
    d += ` L${r(lastL.x + ex * half)},${r(lastL.y + ey * half)}`;
    d += ` L${r(lastR.x + ex * half)},${r(lastR.y + ey * half)}`;
  }

  for (let i = right.length - 1; i >= 0; i--) {
    d += ` L${r(right[i].x)},${r(right[i].y)}`;
  }

  if (lineCap === 'round') {
    const startL = left[0];
    d += ` A${r(half)},${r(half)} 0 0,1 ${r(startL.x)},${r(startL.y)}`;
  } else if (lineCap === 'square') {
    const firstL = left[0];
    const firstR = right[0];
    const startPt = getPointAtLength(pathData, 0);
    const nextPt = getPointAtLength(pathData, dt);
    let sx = startPt.x - nextPt.x;
    let sy = startPt.y - nextPt.y;
    const sl = Math.sqrt(sx * sx + sy * sy) || 1;
    sx /= sl;
    sy /= sl;
    d += ` L${r(firstR.x + sx * half)},${r(firstR.y + sy * half)}`;
    d += ` L${r(firstL.x + sx * half)},${r(firstL.y + sy * half)}`;
  }

  d += ' Z';
  return d;
}

/**
 * Extract typed shape attributes from an SVG element for svg-path-commander.
 * @param {Element} element - SVG shape element (circle, rect, etc.)
 * @returns {object|null} Shape descriptor or null if unsupported
 */
function getShapeAttributes(element) {
  const type = element.tagName.toLowerCase();
  const num = (name) => parseFloat(element.getAttribute(name)) || 0;

  switch (type) {
    case 'circle':
      return { type, cx: num('cx'), cy: num('cy'), r: num('r') };
    case 'ellipse':
      return {
        type,
        cx: num('cx'),
        cy: num('cy'),
        rx: num('rx'),
        ry: num('ry'),
      };
    case 'rect':
      return {
        type,
        x: num('x'),
        y: num('y'),
        width: num('width'),
        height: num('height'),
        rx: num('rx'),
        ry: num('ry'),
      };
    case 'line':
      return {
        type,
        x1: num('x1'),
        y1: num('y1'),
        x2: num('x2'),
        y2: num('y2'),
      };
    case 'polygon':
    case 'polyline':
      return { type, points: element.getAttribute('points') || '' };
    default:
      return null;
  }
}

/**
 * Convert any SVG shape element to an SVG path `d` string.
 * @param {Element} element - SVG shape element
 * @returns {string} Path data string, or empty string on failure
 */
function elementToPathData(element) {
  const tag = element.tagName.toLowerCase();
  if (tag === 'path') return element.getAttribute('d') || '';

  const attrs = getShapeAttributes(element);
  if (!attrs) return '';

  const pathArr = shapeToPathArray(attrs);
  if (!pathArr || pathArr === false) return '';
  return pathToString(pathArr);
}

/**
 * Compose the transform matrices from an element and all its SVG ancestors.
 * Outermost transforms are applied first (standard SVG semantics).
 *
 * @param {Element} element - SVG DOM element
 * @returns {object|null} Composed affine matrix, or null if no transforms
 *   or a transform attribute could not be parsed (caller should keep the
 *   original path data and warn).
 */
function collectAncestorTransformMatrix(element) {
  const transformStrings = [];
  let node = element;
  while (node && node.tagName && node.tagName.toLowerCase() !== 'svg') {
    const t = node.getAttribute && node.getAttribute('transform');
    if (t && t.trim()) transformStrings.unshift(t);
    node = node.parentElement;
  }
  if (transformStrings.length === 0) return null;

  const definitions = [];
  for (const str of transformStrings) {
    // fromTransformAttribute throws on malformed input
    definitions.push(...fromDefinition(fromTransformAttribute(str)));
  }
  return compose(definitions);
}

/**
 * Bake an element's own and inherited `transform` attributes into its
 * path data so downstream boolean operations and previews see final
 * coordinates.
 *
 * Arcs are first converted to cubic curves (pathToCurve) so affine
 * matrices can be applied per coordinate pair safely.
 *
 * @param {Element} element - SVG DOM element the path came from
 * @param {string} pathData - Path `d` string in local coordinates
 * @returns {{pathData: string, baked: boolean, failed: boolean}}
 */
export function bakeElementTransforms(element, pathData) {
  if (!pathData) return { pathData, baked: false, failed: false };

  let matrix;
  try {
    matrix = collectAncestorTransformMatrix(element);
  } catch {
    return { pathData, baked: false, failed: true };
  }
  if (!matrix) return { pathData, baked: false, failed: false };

  try {
    const curve = pathToCurve(parsePathString(pathData));
    const transformed = curve.map((seg) => {
      const [cmd, ...nums] = seg;
      if (cmd === 'Z' || cmd === 'z') return [cmd];
      const out = [cmd];
      for (let i = 0; i + 1 < nums.length; i += 2) {
        const pt = applyToPoint(matrix, { x: nums[i], y: nums[i + 1] });
        out.push(
          Math.round(pt.x * 1000) / 1000,
          Math.round(pt.y * 1000) / 1000
        );
      }
      return out;
    });
    return { pathData: pathToString(transformed), baked: true, failed: false };
  } catch {
    return { pathData, baked: false, failed: true };
  }
}

/**
 * Resolve the effective paint (fill or stroke) for an element, honoring
 * the presentation attribute, the inline `style` attribute, and inherited
 * values from ancestor elements (e.g. `<g fill="red">`).
 *
 * @param {Element} element - SVG DOM element
 * @param {'fill'|'stroke'} prop - Paint property to resolve
 * @returns {string|null} Effective paint value, or null when unset anywhere
 *   (callers apply the SVG defaults: black fill, no stroke)
 */
/**
 * Declarations a document's <style> blocks give to each class and element
 * name, parsed once per document and cached.
 *
 * D-118 (DP-0, 2026-08-28): getEffectivePaint used to read the presentation
 * attribute, the `style` ATTRIBUTE and ancestors, and nothing else. Every CAD
 * and Illustrator export declares paint by CLASS instead:
 *
 *   <defs><style>.cls-1 { fill: none; stroke: #000 }</style></defs>
 *   <path class="cls-1" d="..."/>
 *
 * so `fill` resolved to null, the SVG default BLACK was assumed, and a
 * stroke-only line drawing became a page of solid black shapes. MEASURED on
 * the owner's own files: 70/70 and 831/831 elements classified `foreground`
 * with ZERO stroke conversions, which is why their art came out of the
 * stencil as one hole the shape of its outer boundary.
 *
 * Deliberately small: this resolves simple class, type and id selectors,
 * which is the shape every exporter emits. Anything with a combinator, a
 * pseudo-class or an attribute test is skipped rather than half-understood -
 * a wrong answer here silently changes geometry.
 */
const STYLESHEET_CACHE = new WeakMap();

/**
 * Parse a declaration block ("fill:none;stroke:#000") into a plain object.
 * @param {string} body
 * @returns {Object<string, string>}
 */
function parseDeclarations(body) {
  const out = {};
  for (const part of body.split(';')) {
    const colon = part.indexOf(':');
    if (colon === -1) continue;
    const name = part.slice(0, colon).trim().toLowerCase();
    const value = part.slice(colon + 1).trim();
    if (name && value) out[name] = value;
  }
  return out;
}

/**
 * Build {classes, types, ids} declaration maps from a document's <style>
 * blocks. Later rules win, matching CSS's own last-one-wins for equal
 * specificity.
 *
 * @param {Document} doc
 * @returns {{classes: Object, types: Object, ids: Object}}
 */
function buildStylesheetIndex(doc) {
  const index = { classes: {}, types: {}, ids: {} };
  const styles = doc.querySelectorAll ? doc.querySelectorAll('style') : [];
  for (const styleEl of styles) {
    // Comments first, so a commented-out rule cannot be read as live.
    const css = (styleEl.textContent || '').replace(/\/\*[\s\S]*?\*\//g, '');
    const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
    let match;
    while ((match = ruleRe.exec(css)) !== null) {
      const declarations = parseDeclarations(match[2]);
      if (Object.keys(declarations).length === 0) continue;
      for (const rawSelector of match[1].split(',')) {
        const selector = rawSelector.trim();
        if (!selector) continue;
        let bucket = null;
        let key = null;
        if (/^\.[A-Za-z_][\w-]*$/.test(selector)) {
          bucket = index.classes;
          key = selector.slice(1);
        } else if (/^#[A-Za-z_][\w-]*$/.test(selector)) {
          bucket = index.ids;
          key = selector.slice(1);
        } else if (/^[A-Za-z][\w-]*$/.test(selector)) {
          bucket = index.types;
          key = selector.toLowerCase();
        }
        // Anything else (combinators, pseudo-classes, attribute tests) is
        // left alone rather than guessed at.
        if (!bucket) continue;
        bucket[key] = { ...(bucket[key] || {}), ...declarations };
      }
    }
  }
  return index;
}

/**
 * The value a document's <style> rules give this element for one property,
 * in ascending specificity: type < class < id.
 *
 * @param {Element} element
 * @param {string} prop
 * @returns {string|null}
 */
function stylesheetValueFor(element, prop) {
  const doc = element.ownerDocument;
  if (!doc) return null;
  let index = STYLESHEET_CACHE.get(doc);
  if (!index) {
    index = buildStylesheetIndex(doc);
    STYLESHEET_CACHE.set(doc, index);
  }
  let value = null;
  const type = element.tagName ? element.tagName.toLowerCase() : null;
  if (type && index.types[type] && index.types[type][prop] !== undefined) {
    value = index.types[type][prop];
  }
  const classAttr = element.getAttribute && element.getAttribute('class');
  if (classAttr) {
    for (const name of classAttr.split(/\s+/)) {
      if (
        name &&
        index.classes[name] &&
        index.classes[name][prop] !== undefined
      ) {
        value = index.classes[name][prop];
      }
    }
  }
  const id = element.getAttribute && element.getAttribute('id');
  if (id && index.ids[id] && index.ids[id][prop] !== undefined) {
    value = index.ids[id][prop];
  }
  return value;
}

export function getEffectivePaint(element, prop) {
  const styleRe = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'i');
  let node = element;
  while (node && node.tagName && node.tagName.toLowerCase() !== 'svg') {
    // style attribute wins over the presentation attribute at the same level
    const styleAttr = node.getAttribute && node.getAttribute('style');
    if (styleAttr) {
      const m = styleAttr.match(styleRe);
      if (m) return m[1].trim();
    }
    // D-118: a <style> rule outranks a presentation attribute, and loses to
    // the style attribute above. Same order the browser uses.
    const fromSheet = stylesheetValueFor(node, prop);
    if (fromSheet !== null && fromSheet !== '') return fromSheet;
    const attr = node.getAttribute && node.getAttribute(prop);
    if (attr !== null && attr !== undefined && attr !== '') return attr;
    node = node.parentElement;
  }
  return null;
}

/**
 * Split a compound path `d` attribute into individual subpath strings.
 * Uses svg-path-commander's parser so each returned subpath starts with an
 * absolute `M`, preserving coordinates when any subset is later concatenated.
 *
 * @param {string} pathData - SVG path `d` attribute value
 * @returns {string[]} Individual subpath strings (length >= 1)
 */
function splitSubpaths(pathData) {
  if (!pathData) return [];
  const trimmed = pathData.trim();
  if (!trimmed) return [];
  try {
    const parsed = parsePathString(trimmed);
    const absolute = pathToAbsolute(parsed);
    const split = splitPath(absolute);
    const parts = split
      .map((subpath) => pathToString(subpath))
      .filter((s) => s.trim());
    return parts.length > 0 ? parts : [trimmed];
  } catch {
    // Fall back to the original string if parsing fails unexpectedly.
    return [trimmed];
  }
}

/**
 * Parse an SVG string into an array of shape element descriptors.
 *
 * Each descriptor contains the DOM element, its path data string,
 * fill/stroke values, and computed luminance for classification.
 *
 * Compound paths (a single `<path>` whose `d` attribute contains
 * multiple M-command subpaths) are expanded so each subpath becomes
 * its own descriptor. This lets analyzeSvg and the workspace treat
 * each visual subpath as an independent element.
 *
 * @param {string} svgString - Complete SVG markup
 * @returns {Array<{element: Element, pathData: string, fill: string, stroke: string, luminance: number|null, subpathIndex?: number}>}
 */
export function parseSvgElements(svgString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, 'image/svg+xml');
  const svg = doc.querySelector('svg');
  if (!svg) return [];

  // Use querySelectorAll('*') + filter for reliable document-order results.
  // Comma-separated selectors in querySelectorAll may not return document
  // order in all DOM implementations (observed in jsdom).
  const shapes = Array.from(svg.querySelectorAll('*')).filter((el) =>
    SHAPE_TAGS.has(el.tagName.toLowerCase())
  );

  const result = [];
  for (const element of shapes) {
    const rawPathData = elementToPathData(element);
    const baking = bakeElementTransforms(element, rawPathData);
    const pathData = baking.pathData;
    // Resolve paint from attribute, style attribute, or ancestors
    const rawFill = getEffectivePaint(element, 'fill');
    const fill = rawFill ?? '';
    const stroke = getEffectivePaint(element, 'stroke') ?? '';
    // SVG default fill is black when unset anywhere in the tree
    const resolvedFill =
      rawFill === null ? '#000000' : resolveColorToHex(rawFill);
    const luminance =
      resolvedFill !== null ? parseLuminance(resolvedFill) : null;

    const subpaths = splitSubpaths(pathData);
    if (subpaths.length > 1) {
      subpaths.forEach((sp, idx) => {
        result.push({
          element,
          pathData: sp,
          fill,
          stroke,
          luminance,
          subpathIndex: idx,
          transformBaked: baking.baked,
          transformBakeFailed: baking.failed,
        });
      });
    } else {
      result.push({
        element,
        pathData,
        fill,
        stroke,
        luminance,
        transformBaked: baking.baked,
        transformBakeFailed: baking.failed,
      });
    }
  }
  return result;
}

/**
 * Classify parsed SVG elements by their role in the compound path.
 *
 * - Elements with luminance > threshold → 'hole'
 * - Elements with luminance ≤ threshold → 'foreground'
 * - Elements with fill="none" and a stroke:
 *   - 'convert' (default): expand stroke to filled outline, classify by stroke color
 *   - 'ignore': exclude from compound path
 *   - 'foreground'/'hole': assign that role directly
 *
 * @param {Array} elements - Output of parseSvgElements()
 * @param {object} [options]
 * @param {string} [options.strokeHandling='convert'] - How to handle stroke-only elements
 * @param {number} [options.luminanceThreshold=200] - Luminance above this → hole
 * @param {object} [options.roleOverrides] - Map of element index → forced role
 * @returns {Array} Elements with added `role` property
 */
export function classifyElements(elements, options = {}) {
  const {
    strokeHandling = 'convert',
    luminanceThreshold = 200,
    roleOverrides = {},
  } = options;

  return elements.map((el, index) => {
    if (roleOverrides[index]) {
      return { ...el, role: roleOverrides[index] };
    }

    let role;
    const fillLower = (el.fill || '').toLowerCase();
    const hasFill = fillLower !== 'none' && fillLower !== 'transparent';
    const hasStroke = el.stroke !== '' && el.stroke.toLowerCase() !== 'none';

    if (!hasFill && hasStroke) {
      if (strokeHandling === 'convert') {
        const sw = parseFloat(el.element.getAttribute('stroke-width')) || 1;
        const cap = el.element.getAttribute('stroke-linecap') || 'butt';
        const expandedPath = strokeToFill(el.pathData, sw, cap);
        const strokeColor = resolveColorToHex(el.stroke);
        const strokeLum =
          strokeColor !== null ? parseLuminance(strokeColor) : null;
        role =
          strokeLum !== null && strokeLum > luminanceThreshold
            ? 'hole'
            : 'foreground';
        return { ...el, pathData: expandedPath, role, strokeConverted: true };
      }
      role = strokeHandling;
    } else if (el.luminance !== null && el.luminance > luminanceThreshold) {
      role = 'hole';
    } else {
      role = 'foreground';
    }

    return { ...el, role };
  });
}

/**
 * Apply per-element polygon offsets to classified SVG elements.
 *
 * For each element whose corresponding offset value is non-zero, the path
 * is inflated (positive) or deflated (negative) via clipper2-js. Elements
 * with role 'ignore' are never offset. The offset values are in SVG
 * coordinate units — callers convert from mm using mmToSvgUnits().
 *
 * @param {Array} classifiedElements - Output of classifyElements()
 * @param {number[]} offsets - Per-element offset in SVG units (parallel array)
 * @returns {Array} Elements with pathData replaced where offset was applied
 */
export function applyPerPathOffsets(classifiedElements, offsets) {
  if (!offsets || offsets.length === 0) return classifiedElements;

  return classifiedElements.map((el, i) => {
    const offset = offsets[i];
    if (!offset || offset === 0) return el;
    if (el.role === 'ignore') return el;

    const newPathData = offsetPath(el.pathData, offset);
    return { ...el, pathData: newPathData };
  });
}

/**
 * Flatten classified elements into a single compound-path SVG string.
 *
 * Unions all foreground paths, unions all hole paths, then subtracts
 * holes from foreground via path-bool Difference. The result is a
 * single `<path>` element with evenodd-compatible winding.
 *
 * Every boolean operation is individually guarded: if path-bool throws or
 * returns nothing, the offending shape is appended verbatim to the compound
 * path (evenodd rendering keeps holes working) and a warning is recorded.
 * Geometry is never dropped and this function never throws on bad input.
 *
 * @param {Array} classifiedElements - Output of classifyElements()
 * @param {object} [svgMeta] - SVG container attributes to preserve
 * @param {string} [svgMeta.viewBox]
 * @param {string} [svgMeta.width]
 * @param {string} [svgMeta.height]
 * @param {string[]} [warningsOut] - Optional sink for merge-fallback warnings
 * @returns {string|null} SVG string with one <path>, or null if no foreground
 */
export function flattenToCompoundPath(
  classifiedElements,
  svgMeta = {},
  warningsOut = null
) {
  const foreground = classifiedElements.filter(
    (el) => el.role === 'foreground' && el.pathData
  );
  const holes = classifiedElements.filter(
    (el) => el.role === 'hole' && el.pathData
  );
  if (foreground.length === 0) return null;

  // Keep all pieces a boolean op returns (differences can split shapes)
  const joinPieces = (pieces) => pieces.map(pathToPathData).join(' ');

  let fallbackCount = 0;

  // Union all foreground shapes into one d string
  let fgD = foreground[0].pathData;
  const fgFallbacks = [];
  for (let i = 1; i < foreground.length; i++) {
    try {
      const result = pathBoolean(
        pathFromPathData(fgD),
        FillRule.EvenOdd,
        pathFromPathData(foreground[i].pathData),
        FillRule.EvenOdd,
        PathBooleanOperation.Union
      );
      if (result.length > 0) {
        fgD = joinPieces(result);
      } else {
        fgFallbacks.push(foreground[i].pathData);
        fallbackCount++;
      }
    } catch {
      fgFallbacks.push(foreground[i].pathData);
      fallbackCount++;
    }
  }

  const nativeHoles = holes.filter((el) => !el.strokeConverted);
  const convertedHoles = holes.filter((el) => el.strokeConverted);

  // Union all hole shapes into one d string
  const holeFallbacks = [];
  if (nativeHoles.length > 0) {
    let holeD = nativeHoles[0].pathData;
    for (let i = 1; i < nativeHoles.length; i++) {
      try {
        const result = pathBoolean(
          pathFromPathData(holeD),
          FillRule.EvenOdd,
          pathFromPathData(nativeHoles[i].pathData),
          FillRule.EvenOdd,
          PathBooleanOperation.Union
        );
        if (result.length > 0) {
          holeD = joinPieces(result);
        } else {
          holeFallbacks.push(nativeHoles[i].pathData);
          fallbackCount++;
        }
      } catch {
        holeFallbacks.push(nativeHoles[i].pathData);
        fallbackCount++;
      }
    }

    // Subtract holes; on failure append them as evenodd subpaths instead
    try {
      const result = pathBoolean(
        pathFromPathData(fgD),
        FillRule.EvenOdd,
        pathFromPathData(holeD),
        FillRule.EvenOdd,
        PathBooleanOperation.Difference
      );
      if (result.length > 0) {
        fgD = joinPieces(result);
      }
    } catch {
      holeFallbacks.push(holeD);
      fallbackCount++;
    }
  }

  let compoundD = fgD;
  for (const d of fgFallbacks) {
    compoundD += ' ' + d;
  }
  for (const d of holeFallbacks) {
    compoundD += ' ' + d;
  }
  for (const ch of convertedHoles) {
    compoundD += ' ' + ch.pathData;
  }

  if (fallbackCount > 0 && Array.isArray(warningsOut)) {
    warningsOut.push(
      `${fallbackCount} shape(s) could not be merged and were appended as-is`
    );
  }
  const { viewBox, width, height } = svgMeta;

  let attrs = 'xmlns="http://www.w3.org/2000/svg"';
  if (viewBox) attrs += ` viewBox="${viewBox}"`;
  if (width) attrs += ` width="${width}"`;
  if (height) attrs += ` height="${height}"`;

  return `<svg ${attrs}><path d="${compoundD}" fill="black" fill-rule="evenodd"/></svg>`;
}

/**
 * Full SVG preparation pipeline.
 *
 * Parses, classifies, and flattens a multi-element SVG into a single
 * compound-path SVG suitable for OpenSCAD import(). Single-element SVGs
 * pass through unchanged.
 *
 * @param {string} svgString - Complete SVG markup
 * @param {object} [options] - Passed to classifyElements(). Additionally
 *   supports `warningsOut` (string[]) to receive flatten fallback warnings.
 * @returns {string} Prepared SVG string (compound path or original)
 */
export function prepareSvg(svgString, options = {}) {
  if (!needsPreparation(svgString)) return svgString;

  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, 'image/svg+xml');
  const svg = doc.querySelector('svg');
  if (!svg) return svgString;

  const svgMeta = {
    viewBox: svg.getAttribute('viewBox') || '',
    width: svg.getAttribute('width') || '',
    height: svg.getAttribute('height') || '',
  };

  const elements = parseSvgElements(svgString);
  const classified = classifyElements(elements, options);
  const result = flattenToCompoundPath(
    classified,
    svgMeta,
    options.warningsOut || null
  );
  return result || svgString;
}

/**
 * Check whether an SVG element is inside a non-rendering container
 * (<defs>, <clipPath>, <mask>, <symbol>, <marker>, <pattern>).
 * @param {Element} element - SVG DOM element
 * @returns {boolean}
 */
function isInsideNonRenderingScope(element) {
  let parent = element.parentElement;
  while (parent) {
    if (NON_RENDERING_CONTAINERS.has(parent.tagName.toLowerCase())) return true;
    parent = parent.parentElement;
  }
  return false;
}

/**
 * Measure the width-to-height ratio of an SVG's renderable geometry.
 *
 * OpenSCAD's resize([w, 0], auto) rescales the imported GEOMETRY bounding
 * box, so the ratio that matters for fit is the united bbox of every shape
 * OpenSCAD will render (it fills all shapes regardless of paint, so
 * stroke-only elements count too), excluding non-rendering scopes (defs,
 * clipPath, ...). Transforms are already baked by parseSvgElements.
 *
 * @param {string} svgString - Complete SVG markup
 * @returns {number|null} width/height (rounded to 4 decimals), or null when
 *   there is nothing measurable (no shapes, or degenerate zero extent)
 */
export function measureSvgAspect(svgString) {
  try {
    const elements = parseSvgElements(svgString);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const el of elements) {
      if (isInsideNonRenderingScope(el.element)) continue;
      if (!el.pathData) continue;
      const box = getPathBBox(el.pathData);
      if (
        !box ||
        !Number.isFinite(box.x) ||
        !Number.isFinite(box.y) ||
        !Number.isFinite(box.width) ||
        !Number.isFinite(box.height)
      ) {
        continue;
      }
      minX = Math.min(minX, box.x);
      minY = Math.min(minY, box.y);
      maxX = Math.max(maxX, box.x + box.width);
      maxY = Math.max(maxY, box.y + box.height);
    }
    if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
    const width = maxX - minX;
    const height = maxY - minY;
    if (width <= 0 || height <= 0) return null;
    return Math.round((width / height) * 10000) / 10000;
  } catch (err) {
    console.warn('[SVG Preparer] Aspect measurement failed:', err);
    return null;
  }
}

/**
 * Analyze an SVG for preparation complexity, element roles, and warnings.
 *
 * Replaces the boolean `needsPreparation()` as the primary entry point
 * for SVG assessment. Returns a structured analysis with confidence score,
 * per-element roles, warnings about unsupported features, and a
 * recommendation for how to proceed.
 *
 * @param {string} svgString - Complete SVG markup
 * @returns {{
 *   status: 'ready'|'needs_review'|'unsupported'|'too_complex',
 *   confidence: number,
 *   elements: Array<{element: Element, pathData: string, fill: string, stroke: string, luminance: number|null, autoRole: string, warnings: string[]}>,
 *   warnings: string[],
 *   unsupportedFeatures: string[],
 *   recommendation: 'auto_prepare'|'open_editor'|'pass_through'|'reject',
 *   singleElement: boolean,
 *   elementCount?: number,
 * }}
 */
export function analyzeSvg(svgString) {
  const passThrough = {
    status: 'ready',
    confidence: 1.0,
    elements: [],
    warnings: [],
    unsupportedFeatures: [],
    recommendation: 'pass_through',
    singleElement: true,
  };

  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, 'image/svg+xml');
  const svg = doc.querySelector('svg');
  if (!svg) return passThrough;

  const allElements = parseSvgElements(svgString);
  if (allElements.length === 0) return passThrough;

  const renderElements = [];
  const defsCount = { value: 0 };
  for (const el of allElements) {
    if (isInsideNonRenderingScope(el.element)) {
      defsCount.value++;
    } else {
      renderElements.push(el);
    }
  }

  const tier = tierForCount(renderElements.length);

  if (tier === 'too_complex') {
    return {
      status: 'too_complex',
      tier,
      confidence: 0,
      elements: [],
      warnings: [
        `This drawing has ${renderElements.length} shapes, and Forge can work with ${ELEMENT_TIERS.tableMax} at a time. ` +
          'Simplify it in a vector editor (merge paths, remove hidden layers) and try again.',
      ],
      unsupportedFeatures: [],
      recommendation: 'reject',
      singleElement: false,
      elementCount: renderElements.length,
    };
  }

  const filledElements = renderElements.filter((el) => {
    const fill = (el.fill || '').toLowerCase();
    return fill !== 'none' && fill !== 'transparent';
  });
  const strokedOnlyElements = renderElements.filter((el) => {
    const fill = (el.fill || '').toLowerCase();
    const hasStroke = el.stroke !== '' && el.stroke.toLowerCase() !== 'none';
    return (fill === 'none' || fill === 'transparent') && hasStroke;
  });
  const singleElement = filledElements.length + strokedOnlyElements.length <= 1;

  // A compound path is a single DOM <path> whose d attribute was decomposed
  // into multiple subpaths. It's already OpenSCAD-compatible and doesn't
  // need boolean flattening — only the workspace needs the decomposition.
  const uniqueDomElements = new Set(renderElements.map((el) => el.element));
  const isCompoundPathOnly =
    uniqueDomElements.size === 1 &&
    renderElements.length > 1 &&
    renderElements[0].subpathIndex !== undefined;

  const classified = classifyElements(renderElements);

  const warnings = [];
  const unsupportedFeatures = [];
  let confidence = 1.0;

  // Per-element analysis
  const elements = classified.map((el) => {
    const elWarnings = [];
    const fillLower = (el.fill || '').toLowerCase();
    const hasStroke = el.stroke !== '' && el.stroke.toLowerCase() !== 'none';

    if (el.strokeConverted) {
      elWarnings.push('Stroked path \u2014 converted to filled outline');
    } else if (fillLower === 'none' && hasStroke) {
      elWarnings.push(
        'Stroked path \u2014 not supported for boolean operations'
      );
    }
    if (fillLower.startsWith('url(')) {
      elWarnings.push(
        'Gradient or pattern fill \u2014 cannot classify by luminance'
      );
    }
    // Transforms are baked into pathData during parsing; only warn when
    // baking failed and coordinates are still in local space.
    if (el.transformBakeFailed) {
      elWarnings.push('Has transform \u2014 could not be baked');
    }
    if (el.element.hasAttribute('clip-path')) {
      elWarnings.push('Has clip-path reference');
    }

    return {
      element: el.element,
      pathData: el.pathData,
      fill: el.fill,
      stroke: el.stroke,
      luminance: el.luminance,
      autoRole: el.role,
      strokeConverted: el.strokeConverted || false,
      subpathIndex: el.subpathIndex,
      warnings: elWarnings,
    };
  });

  // Global warnings
  if (defsCount.value > 0) {
    warnings.push(`${defsCount.value} element(s) inside <defs> skipped`);
  }

  const convertedCount = elements.filter((el) => el.strokeConverted).length;
  if (convertedCount > 0) {
    warnings.push(
      `${convertedCount} stroked path(s) converted to filled outline(s)`
    );
  }

  const ignoredStrokedCount = elements.filter((el) =>
    el.warnings.some((w) => w.includes('not supported for boolean'))
  ).length;
  if (ignoredStrokedCount > 0) {
    warnings.push(
      `${ignoredStrokedCount} stroked path(s) ignored \u2014 stroke-to-fill not yet supported`
    );
  }

  // Unsupported feature detection
  const hasGradients = elements.some((el) =>
    el.warnings.some((w) => w.includes('Gradient or pattern'))
  );
  if (hasGradients) unsupportedFeatures.push('gradient or pattern fills');

  const hasClipPaths = elements.some((el) =>
    el.warnings.some((w) => w.includes('clip-path'))
  );
  if (hasClipPaths) unsupportedFeatures.push('clip-path references');

  // All-foreground SVGs need no flattening: OpenSCAD unions overlapping
  // filled shapes natively, so passing the original through is lossless.
  // Identical dark fills are unambiguous here, so no luminance penalty.
  const allForeground =
    elements.length > 0 &&
    unsupportedFeatures.length === 0 &&
    elements.every(
      (el) =>
        el.autoRole === 'foreground' &&
        !el.strokeConverted &&
        !el.transformBakeFailed
    );

  // Confidence scoring — penalize ambiguous or unsupported scenarios
  if (!allForeground && filledElements.length > 1) {
    const luminances = filledElements
      .filter((el) => el.luminance !== null)
      .map((el) => el.luminance);
    if (luminances.length > 1) {
      const min = Math.min(...luminances);
      const max = Math.max(...luminances);
      if (max - min < 50) {
        confidence -= 0.3;
        warnings.push(
          'All elements have similar luminance \u2014 classification may be ambiguous'
        );
      }
    }
  }
  if (hasGradients) confidence -= 0.2;
  if (hasClipPaths) confidence -= 0.1;
  const hasTransformFailures = elements.some((el) =>
    el.warnings.some((w) => w.includes('could not be baked'))
  );
  if (hasTransformFailures) confidence -= 0.1;
  confidence = Math.max(0, Math.min(1, confidence));

  // Status and recommendation
  let status, recommendation;
  if (singleElement || isCompoundPathOnly || allForeground) {
    status = 'ready';
    recommendation = 'pass_through';
  } else if (unsupportedFeatures.length > 0) {
    status = 'unsupported';
    recommendation = 'open_editor';
  } else if (hasTransformFailures) {
    status = 'needs_review';
    recommendation = 'open_editor';
  } else if (confidence >= 0.7) {
    status = 'ready';
    recommendation = 'auto_prepare';
  } else {
    status = 'needs_review';
    recommendation = 'open_editor';
  }

  // DP-3: above tier A, nothing may start a boolean flatten by itself.
  // `auto_prepare` is the only recommendation that does, so it becomes
  // `open_editor` and the person decides when to spend the time.
  // `pass_through` is left alone at every tier ON PURPOSE: it means the
  // shapes need no flattening at all (OpenSCAD unions overlapping fills
  // natively), so it costs nothing however many there are, and downgrading
  // it would send people to the editor for a file that is already fine.
  // The advisory copy for each tier lives in the UI, not here: this function
  // stays an analyzer, and `warnings` keeps meaning "something about this
  // drawing is off" for the code that already filters it.
  if (tier !== 'auto' && recommendation === 'auto_prepare') {
    recommendation = 'open_editor';
  }

  return {
    status,
    tier,
    confidence,
    elements,
    warnings,
    unsupportedFeatures,
    recommendation,
    singleElement,
    isCompoundPathOnly,
    elementCount: renderElements.length,
  };
}

/**
 * Quick check: does this SVG contain more than one filled shape element?
 *
 * Thin wrapper around analyzeSvg() for backward compatibility.
 * Prefer analyzeSvg() for richer analysis.
 *
 * @param {string} svgString - Complete SVG markup
 * @returns {boolean} true if the SVG has multiple filled shapes
 */
export function needsPreparation(svgString) {
  return analyzeSvg(svgString).recommendation !== 'pass_through';
}
