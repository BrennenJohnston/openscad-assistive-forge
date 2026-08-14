/**
 * Parameter reconciliation after a hand edit to the code (UF-18, Q-45a).
 *
 * The Customizer's values and the code's own defaults are two accounts of the
 * same thing, and until UF-18 they could not disagree out loud: the schema was
 * parsed once when the file loaded, and every render then passed `-D` for
 * every parameter in it. Editing a default in the editor changed the source
 * the worker compiled but not the `-D` that overrode it, so the model never
 * moved (U-30).
 *
 * The rule the owner signed (Q-45a):
 *   - parameters the user explicitly changed keep their values, and ONLY
 *     those are passed as `-D`;
 *   - parameters the user never touched follow the edited code's defaults;
 *   - parameters the code gained appear; parameters it lost retire.
 *
 * Everything here is pure so the rule can be tested without a browser.
 *
 * @license GPL-3.0-or-later
 */

/**
 * OpenSCAD special variables ($fn, $fa, $fs). The app sets these itself to
 * cap preview cost, so they are engine knobs rather than user parameters and
 * are never withheld from a render.
 * @param {string} name
 * @returns {boolean}
 */
export function isEngineVariable(name) {
  return typeof name === 'string' && name.startsWith('$');
}

/**
 * Compare two parameter values the way the Customizer does.
 *
 * Controls hand back strings where the schema holds numbers ("10" vs 10), so
 * a strict compare would report every parameter as user-modified the moment
 * its control was rendered.
 *
 * @param {*} a
 * @param {*} b
 * @returns {boolean}
 */
export function parameterValuesEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return a == null && b == null;
  if (typeof a === 'object' || typeof b === 'object') {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return String(a) === String(b);
}

/**
 * The parameters whose values no longer match the defaults they loaded with.
 *
 * `defaults` is written once per load (and again after each reconcile) from
 * the code's own declarations, so a difference means a person moved a control,
 * applied a preset, or arrived with a URL parameter.
 *
 * @param {Object} parameters - Live values
 * @param {Object} defaults - Values the code declared
 * @returns {Set<string>}
 */
export function collectUserModifiedKeys(parameters = {}, defaults = {}) {
  const modified = new Set();
  const safeDefaults = defaults || {};
  for (const [key, value] of Object.entries(parameters || {})) {
    if (!Object.prototype.hasOwnProperty.call(safeDefaults, key)) {
      // A value with no recorded default did not come from the schema, so
      // withholding it would silently change the model.
      modified.add(key);
      continue;
    }
    if (!parameterValuesEqual(value, safeDefaults[key])) {
      modified.add(key);
    }
  }
  return modified;
}

/**
 * The schema-known parameters a render may leave out of its `-D` list.
 *
 * Only untouched ones, and never an engine variable: `$fn` is capped by the
 * quality preset before a preview runs, and dropping it would hand the
 * preview the model's full-resolution value instead.
 *
 * @param {Object} args
 * @param {Object} args.parameters - Live values
 * @param {Object} args.defaults - Values the code declared
 * @param {string[]} args.schemaNames - Parameter names the current schema has
 * @returns {Set<string>}
 */
export function collectWithheldDefineKeys({
  parameters = {},
  defaults = {},
  schemaNames = [],
}) {
  const modified = collectUserModifiedKeys(parameters, defaults);
  const withheld = new Set();
  for (const name of schemaNames) {
    if (modified.has(name)) continue;
    if (isEngineVariable(name)) continue;
    withheld.add(name);
  }
  return withheld;
}

/**
 * Fold a freshly parsed schema into the live values.
 *
 * @param {Object} args
 * @param {Object} args.nextSchema - extractParameters() output for the edited source
 * @param {Object|null} args.previousSchema - The schema the values were built from
 * @param {Object} args.parameters - Live values
 * @param {Object} args.defaults - Values the previous schema declared
 * @param {Object} [args.retiredValues] - User values kept from earlier removals
 * @returns {{
 *   ok: boolean,
 *   reason: string|null,
 *   parameters: Object,
 *   defaults: Object,
 *   added: string[],
 *   removed: string[],
 *   retained: string[],
 *   retiredValues: Object,
 *   changed: boolean
 * }}
 */
export function reconcileParameters({
  nextSchema,
  previousSchema = null,
  parameters = {},
  defaults = {},
  retiredValues = {},
}) {
  const nextDefs = nextSchema?.parameters || {};
  const nextNames = Object.keys(nextDefs);
  const previousNames = Object.keys(previousSchema?.parameters || {});

  // A parse that finds nothing where there used to be something is a
  // half-typed buffer, not a file without parameters. Retiring the whole
  // panel over a stray brace would lose every value the user had set.
  if (nextNames.length === 0 && previousNames.length > 0) {
    return {
      ok: false,
      reason: 'empty-parse',
      parameters,
      defaults,
      added: [],
      removed: [],
      retained: [],
      retiredValues,
      changed: false,
    };
  }

  const modified = collectUserModifiedKeys(parameters, defaults);
  const outParameters = {};
  const outDefaults = {};
  const added = [];
  const retained = [];

  for (const name of nextNames) {
    const codeDefault = nextDefs[name]?.default;
    outDefaults[name] = codeDefault;

    if (modified.has(name)) {
      outParameters[name] = parameters[name];
      retained.push(name);
    } else if (
      !previousNames.includes(name) &&
      Object.prototype.hasOwnProperty.call(retiredValues, name)
    ) {
      // The parameter is back after being edited away. Returning the value
      // the user had set beats resetting them for a round trip they may not
      // have meant to take.
      outParameters[name] = retiredValues[name];
      retained.push(name);
    } else {
      outParameters[name] = codeDefault;
    }

    if (!previousNames.includes(name)) added.push(name);
  }

  const removed = previousNames.filter((name) => !nextNames.includes(name));

  const nextRetired = { ...retiredValues };
  for (const name of removed) {
    if (modified.has(name)) nextRetired[name] = parameters[name];
  }
  for (const name of retained) delete nextRetired[name];

  const changed =
    added.length > 0 ||
    removed.length > 0 ||
    nextNames.some(
      (name) => !parameterValuesEqual(outParameters[name], parameters[name])
    ) ||
    nextNames.some(
      (name) => !parameterValuesEqual(outDefaults[name], defaults[name])
    );

  return {
    ok: true,
    reason: null,
    parameters: outParameters,
    defaults: outDefaults,
    added,
    removed,
    retained,
    retiredValues: nextRetired,
    changed,
  };
}
