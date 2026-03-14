/**
 * Render Intent Resolver
 *
 * Single source of truth for 2D export intent, previewability, and render
 * state classification.  Consumes JSON Schema parameter definitions and
 * current parameter values — works against any project schema, not just
 * keyguard-shaped names.
 *
 * Stakeholder-specific heuristics (type_of_keyguard, laser-cutting regex)
 * are preserved as backward-compatible inputs but are not required.
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
const LASER_VALUE_KEYWORDS = ['laser'];
const LASER_NAME_PATTERN = /laser.*(cut|cutting).*(best|pract)/i;

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
 * Resolve parameter adjustments for 2D export (SVG / DXF).
 *
 * Scans every enum parameter in the schema.  Parameters whose enum values
 * span both 2D and non-2D options are treated as output-mode selectors and
 * switched to the best 2D value.  Stakeholder-specific heuristics for
 * `type_of_keyguard` and the laser-cutting toggle are applied as well but
 * are not required by the API.
 *
 * @param {Object} parameters  Current UI parameter values
 * @param {Object|null} schema Parsed schema ({ parameters: { ... } })
 * @param {string} format      Target format ('svg' or 'dxf')
 * @returns {Object} Shallow copy of parameters with 2D-compatible overrides
 */
export function resolve2DExportIntent(parameters, schema, format) {
  if (format !== 'svg' && format !== 'dxf') return parameters;
  const schemaParams = schema?.parameters;
  if (!schemaParams) return parameters;

  const resolved = { ...parameters };

  for (const [name, pDef] of Object.entries(schemaParams)) {
    const enumValues = pDef.enum;
    if (!Array.isArray(enumValues) || enumValues.length === 0) continue;

    // ── Stakeholder heuristic: type_of_keyguard → pick laser entry ──
    if (name === 'type_of_keyguard') {
      const laserEntry = enumValues.find((e) => {
        const { value, label } = entryMeta(e);
        return LASER_VALUE_KEYWORDS.some(
          (kw) => value.includes(kw) || label.includes(kw)
        );
      });
      if (laserEntry !== undefined) {
        resolved[name] =
          typeof laserEntry === 'object' ? laserEntry.value : laserEntry;
      }
      continue;
    }

    // ── Stakeholder heuristic: laser-cutting best-practices toggle → Yes ──
    if (LASER_NAME_PATTERN.test(name)) {
      const yesEntry = enumValues.find((e) => {
        const { value, label } = entryMeta(e);
        return value === 'yes' || label === 'yes';
      });
      if (yesEntry !== undefined) {
        resolved[name] =
          typeof yesEntry === 'object' ? yesEntry.value : yesEntry;
      }
      continue;
    }

    // ── Generic: pick best 2D value from any mode-selector enum ──
    const best = pickBest2DValue(enumValues, format);
    if (best !== undefined) {
      resolved[name] = best;
    }
  }

  return resolved;
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
