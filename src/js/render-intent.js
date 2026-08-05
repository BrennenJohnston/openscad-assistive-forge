/**
 * Render Intent Resolver
 *
 * Single source of truth for 2D export intent, previewability, and render
 * state classification.  Consumes JSON Schema parameter definitions and
 * current parameter values — works against any project schema, not just
 * keyguard-shaped names.
 *
 * 2D-export parameter adjustments are PROPOSED, never applied silently:
 * propose2DExportAdjustments() returns a change list the UI presents for
 * user consent. Project-specific heuristics (e.g. the keyguard family's
 * type_of_keyguard / laser-cutting toggles) arrive as data via the
 * export2D section of forge.project.json (see project-manifest.js) instead
 * of being hardcoded here.
 *
 * This module is a leaf dependency: it must NOT import from main.js or
 * auto-preview-controller.js.
 *
 * @license GPL-3.0-or-later
 */


// ── Render state constants ──────────────────────────────────────────────────

export const RENDER_STATE = {
  PREVIEW: 'preview',
  RENDER_3D: 'render-3d',
  RENDER_2D: 'render-2d',
  INFORMATIONAL: 'informational',
};

// ── Internal constants ──────────────────────────────────────────────────────

const TWO_D_KEYWORDS = ['svg', 'dxf', '2d', 'first layer'];
const INFORMATIONAL_KEYWORDS = ['customizer'];

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Normalise an enum entry (plain string or {value,label} object) to
 * lowercase value/label strings plus the original raw value.
 */
function entryMeta(entry) {
  if (typeof entry === 'object' && entry !== null) {
    const value = String(entry.value ?? '').toLowerCase();
    const label = entry.label ? String(entry.label).toLowerCase() : value;
    return { value, label, raw: entry.value };
  }
  const s = String(entry).toLowerCase();
  return { value: s, label: s, raw: entry };
}

function has2DKeyword(v, l) {
  return TWO_D_KEYWORDS.some((kw) => v.includes(kw) || l.includes(kw));
}

function hasInfoKeyword(v, l) {
  return INFORMATIONAL_KEYWORDS.some((kw) => v.includes(kw) || l.includes(kw));
}

/**
 * Score an enum value's relevance as a 2D export target for the given format.
 * Higher score = better match.
 */
function score2D(value, label, format) {
  let s = 0;
  if (value.includes(format) || label.includes(format)) s += 10;
  if (value.includes('cut') || label.includes('cut')) s += 5;
  if (value.includes('2d') || label.includes('2d')) s += 3;
  if (value.includes('first layer') || label.includes('first layer')) s += 3;
  if (value.includes('engrave') || label.includes('engrave')) s += 1;
  return s;
}

/**
 * From an enum array, pick the best 2D-producing value for `format`.
 * Returns the raw value to assign, or undefined if none qualifies.
 */
function pickBest2DValue(enumValues, format) {
  const metas = enumValues.map((e) => entryMeta(e));
  const twoDMetas = metas.filter((m) => has2DKeyword(m.value, m.label));
  if (twoDMetas.length === 0) return undefined;

  // Only resolve if enum also contains non-2D / non-informational entries
  // (i.e. it is genuinely an output-mode selector, not a list of 2D-only options).
  const hasNormal = metas.some(
    (m) => !has2DKeyword(m.value, m.label) && !hasInfoKeyword(m.value, m.label)
  );
  if (!hasNormal) return undefined;

  let best = twoDMetas[0];
  let bestScore = score2D(best.value, best.label, format);
  for (let i = 1; i < twoDMetas.length; i++) {
    const s = score2D(twoDMetas[i].value, twoDMetas[i].label, format);
    if (s > bestScore) {
      bestScore = s;
      best = twoDMetas[i];
    }
  }
  return best.raw;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Propose parameter adjustments for 2D export (SVG / DXF).
 *
 * Two rule sources, in precedence order:
 * 1. Project rules from the export2D section of forge.project.json —
 *    `{ param, toValueMatching }` picks the enum entry whose value/label
 *    contains the needle; `{ paramMatching, toValue }` sets every
 *    name-matching enum param to the exact enum value.
 * 2. Generic: any enum whose values span both 2D and non-2D options is
 *    treated as an output-mode selector and its best 2D value is proposed.
 *
 * Nothing is applied silently: callers present `changes` for user consent
 * and use `resolvedParameters` only when the user accepts.
 *
 * @param {Object} parameters  Current UI parameter values
 * @param {Object|null} schema Parsed schema ({ parameters: { ... } })
 * @param {string} format      Target format ('svg' or 'dxf')
 * @param {Object|null} [export2D] export2D section of the project manifest
 * @returns {{ changes: Array<{name: string, from: *, to: *, reason: string}>,
 *             resolvedParameters: Object }}
 *   changes is empty (and resolvedParameters === parameters) when nothing
 *   would change.
 */
export function propose2DExportAdjustments(
  parameters,
  schema,
  format,
  export2D = null
) {
  const noChange = { changes: [], resolvedParameters: parameters };
  if (format !== 'svg' && format !== 'dxf') return noChange;
  const schemaParams = schema?.parameters;
  if (!schemaParams || !parameters) return noChange;

  const changes = [];
  const handled = new Set();
  const propose = (name, to, reason) => {
    handled.add(name);
    if (parameters[name] !== to) {
      changes.push({ name, from: parameters[name], to, reason });
    }
  };
  const rawValue = (entry) =>
    typeof entry === 'object' && entry !== null ? entry.value : entry;

  for (const rule of export2D?.rules || []) {
    if (rule.param && rule.toValueMatching !== undefined) {
      const enumValues = schemaParams[rule.param]?.enum;
      if (!Array.isArray(enumValues)) continue;
      const needle = String(rule.toValueMatching).toLowerCase();
      const entry = enumValues.find((e) => {
        const { value, label } = entryMeta(e);
        return value.includes(needle) || label.includes(needle);
      });
      if (entry !== undefined) {
        propose(rule.param, rawValue(entry), 'project 2D-export rule');
      }
    } else if (rule.paramMatching && rule.toValue !== undefined) {
      let namePattern;
      try {
        namePattern = new RegExp(rule.paramMatching, 'i');
      } catch {
        console.warn(
          `[RenderIntent] Ignoring export2D rule with invalid pattern: ${rule.paramMatching}`
        );
        continue;
      }
      const target = String(rule.toValue).toLowerCase();
      for (const [name, pDef] of Object.entries(schemaParams)) {
        if (handled.has(name) || !namePattern.test(name)) continue;
        const enumValues = pDef.enum;
        if (!Array.isArray(enumValues)) continue;
        const entry = enumValues.find((e) => {
          const { value, label } = entryMeta(e);
          return value === target || label === target;
        });
        if (entry !== undefined) {
          propose(name, rawValue(entry), 'project 2D-export rule');
        }
      }
    }
  }

  for (const [name, pDef] of Object.entries(schemaParams)) {
    if (handled.has(name)) continue;
    const enumValues = pDef.enum;
    if (!Array.isArray(enumValues) || enumValues.length === 0) continue;
    const best = pickBest2DValue(enumValues, format);
    if (best !== undefined) {
      propose(name, best, `2D output mode for ${format.toUpperCase()}`);
    }
  }

  if (changes.length === 0) return noChange;

  const resolvedParameters = { ...parameters };
  for (const change of changes) {
    resolvedParameters[change.name] = change.to;
  }
  return { changes, resolvedParameters };
}

/**
 * Determine whether the current parameter state is non-previewable.
 *
 * Returns `true` only for purely informational modes (e.g. "Customizer
 * Settings") that produce no renderable geometry at all.
 *
 * 2D-export generate modes (e.g. "first layer for SVG/DXF file") are
 * NOT non-previewable: the SCAD code still produces a thin 3D slice
 * that serves as a visual preview of the shape to be cut.  The actual
 * 2D flattening happens at export time via projection().
 *
 * @param {Object} parameters   Current UI parameter values
 * @param {Object|null} schema  Parsed schema ({ parameters: { ... } })
 * @returns {boolean}
 */
export function isNonPreviewable(parameters, schema) {
  if (!parameters) return false;

  const schemaParams = schema?.parameters;

  if (typeof parameters.generate === 'string') {
    const lower = parameters.generate.trim().toLowerCase();
    if (lower.length === 0) return true;

    let label = lower;
    const genEnum = schemaParams?.generate?.enum;
    if (Array.isArray(genEnum)) {
      const match = genEnum.find(
        (e) =>
          typeof e === 'object' &&
          String(e.value) === parameters.generate.trim()
      );
      if (match?.label) label = String(match.label).toLowerCase();
    }

    if (hasInfoKeyword(lower, label)) return true;
  }

  if (schemaParams) {
    for (const [name, pDef] of Object.entries(schemaParams)) {
      if (name === 'generate') continue;
      const enumValues = pDef.enum;
      if (!Array.isArray(enumValues) || enumValues.length === 0) continue;

      const current = parameters[name];
      if (current === undefined || current === null) continue;

      const metas = enumValues.map((e) => entryMeta(e));

      const currentLower = String(current).trim().toLowerCase();
      const directHit = hasInfoKeyword(currentLower, currentLower);

      let labelHit = false;
      const matched = metas.find((m) => String(m.raw) === String(current));
      if (matched) {
        labelHit = hasInfoKeyword(matched.value, matched.label);
      }

      if (directHit || labelHit) {
        const hasNormal = metas.some(
          (m) =>
            !has2DKeyword(m.value, m.label) && !hasInfoKeyword(m.value, m.label)
        );
        if (hasNormal) return true;
      }
    }
  }

  return false;
}

/**
 * Classify the overall render state from parameters, schema, and context.
 *
 * @param {Object} parameters        Current UI parameter values
 * @param {Object|null} schema       Parsed schema
 * @param {Object} [options]
 * @param {boolean} [options.isFullQuality=false] Full-quality render request
 * @param {string|null} [options.format=null]     Target export format
 * @returns {string} One of RENDER_STATE values
 */
export function classifyRenderState(parameters, schema, options = {}) {
  const { isFullQuality = false, format = null } = options;

  if (format === 'svg' || format === 'dxf') return RENDER_STATE.RENDER_2D;

  if (isNonPreviewable(parameters, schema)) {
    return RENDER_STATE.INFORMATIONAL;
  }

  if (isFullQuality) return RENDER_STATE.RENDER_3D;
  return RENDER_STATE.PREVIEW;
}

/**
 * Parameters for the projection fallback's 3D pass: drop a 2D-mode
 * `generate` value so the model renders its default 3D geometry. Only
 * `generate` is targeted — parameters that merely contain "svg" (like
 * screenshot_file="default.svg") are untouched.
 *
 * @param {Object} parameters
 * @returns {Object} Copy with a 2D-mode generate removed, or the original
 */
export function strip2DGenerateForFallback(parameters) {
  if (
    typeof parameters?.generate === 'string' &&
    is2DGenerateValue(parameters.generate)
  ) {
    const stripped = { ...parameters };
    delete stripped.generate;
    return stripped;
  }
  return parameters;
}

/**
 * Check whether a generate-parameter value indicates a 2D export mode
 * (SVG, DXF, first-layer, etc.).
 *
 * Uses the same keyword list that the rest of this module relies on
 * (`TWO_D_KEYWORDS`), so any future additions automatically propagate.
 *
 * @param {string} generateValue - Raw generate parameter value
 * @returns {boolean}
 */
export function is2DGenerateValue(generateValue) {
  if (!generateValue) return false;
  const lower = String(generateValue).toLowerCase();
  return has2DKeyword(lower, lower);
}
