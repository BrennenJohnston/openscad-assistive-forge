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
  pathToString,
  shapeToPathArray,
  splitPath,
  getPointAtLength,
  getTotalLength,
} from 'svg-path-commander';
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
 * Maximum rendering elements before an SVG is rejected as too complex.
 * Beyond this threshold path-bool operations become prohibitively slow
 * and produce unreliable output.
 */
const MAX_ELEMENT_COUNT = 50;

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
    const endL = left[left.length - 1];
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
    const startR = right[0];
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
    const pathData = elementToPathData(element);
    const rawFill = element.getAttribute('fill');
    const fill = rawFill || '';
    const stroke = element.getAttribute('stroke') || '';
    // SVG default fill is black when the attribute is absent
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
        });
      });
    } else {
      result.push({ element, pathData, fill, stroke, luminance });
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
 * @param {Array} classifiedElements - Output of classifyElements()
 * @param {object} [svgMeta] - SVG container attributes to preserve
 * @param {string} [svgMeta.viewBox]
 * @param {string} [svgMeta.width]
 * @param {string} [svgMeta.height]
 * @returns {string|null} SVG string with one <path>, or null if no foreground
 */
export function flattenToCompoundPath(classifiedElements, svgMeta = {}) {
  const foreground = classifiedElements.filter(
    (el) => el.role === 'foreground' && el.pathData
  );
  const holes = classifiedElements.filter(
    (el) => el.role === 'hole' && el.pathData
  );
  if (foreground.length === 0) return null;

  let fgPath = pathFromPathData(foreground[0].pathData);
  for (let i = 1; i < foreground.length; i++) {
    const result = pathBoolean(
      fgPath,
      FillRule.EvenOdd,
      pathFromPathData(foreground[i].pathData),
      FillRule.EvenOdd,
      PathBooleanOperation.Union
    );
    if (result.length > 0) fgPath = result[0];
  }

  const nativeHoles = holes.filter((el) => !el.strokeConverted);
  const convertedHoles = holes.filter((el) => el.strokeConverted);

  if (nativeHoles.length > 0) {
    let holePath = pathFromPathData(nativeHoles[0].pathData);
    for (let i = 1; i < nativeHoles.length; i++) {
      const result = pathBoolean(
        holePath,
        FillRule.EvenOdd,
        pathFromPathData(nativeHoles[i].pathData),
        FillRule.EvenOdd,
        PathBooleanOperation.Union
      );
      if (result.length > 0) holePath = result[0];
    }

    const result = pathBoolean(
      fgPath,
      FillRule.EvenOdd,
      holePath,
      FillRule.EvenOdd,
      PathBooleanOperation.Difference
    );
    if (result.length > 0) fgPath = result[0];
  }

  let compoundD = pathToPathData(fgPath);
  for (const ch of convertedHoles) {
    compoundD += ' ' + ch.pathData;
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
 * @param {object} [options] - Passed to classifyElements()
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
  const result = flattenToCompoundPath(classified, svgMeta);
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

  if (renderElements.length > MAX_ELEMENT_COUNT) {
    return {
      status: 'too_complex',
      confidence: 0,
      elements: [],
      warnings: [
        `This SVG has ${renderElements.length} elements — the maximum is ${MAX_ELEMENT_COUNT}. ` +
          'Simplify the SVG in a vector editor (e.g., merge paths, remove hidden layers) before importing.',
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
    if (el.element.hasAttribute('transform')) {
      elWarnings.push('Has transform \u2014 may affect visual stacking');
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

  // Confidence scoring — penalize ambiguous or unsupported scenarios
  if (filledElements.length > 1) {
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
  const hasTransforms = elements.some((el) =>
    el.warnings.some((w) => w.includes('transform'))
  );
  if (hasTransforms) confidence -= 0.1;
  confidence = Math.max(0, Math.min(1, confidence));

  // Status and recommendation
  let status, recommendation;
  if (singleElement || isCompoundPathOnly) {
    status = 'ready';
    recommendation = 'pass_through';
  } else if (unsupportedFeatures.length > 0) {
    status = 'unsupported';
    recommendation = 'open_editor';
  } else if (confidence >= 0.7) {
    status = 'ready';
    recommendation = 'auto_prepare';
  } else {
    status = 'needs_review';
    recommendation = 'open_editor';
  }

  return {
    status,
    confidence,
    elements,
    warnings,
    unsupportedFeatures,
    recommendation,
    singleElement,
    isCompoundPathOnly,
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
