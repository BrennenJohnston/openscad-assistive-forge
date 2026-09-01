/**
 * The starter subset: which parameters a design says a beginner should meet
 * first.
 *
 * A manifest can declare `defaults.starterParameters: ["a", "b", ...]`. The
 * Customizer then shows those controls and nothing else, with one control that
 * reveals the rest. This is progressive DISCLOSURE, never removal: everything
 * stays in the DOM, stays reachable, and the reveal is a real button with a
 * real accessible name and state. Nothing is hidden from assistive technology
 * that is not equally hidden from everybody else.
 *
 * The reason it exists: a 174-parameter model with 32 groups is the truthful
 * shape of a keyguard design, and it is also an unusable first screen. The
 * dozen the workflow actually walks are a much better first screen, as long as
 * the other 162 are one honest action away.
 *
 * Everything here is pure. The DOM work lives in ui-generator.js.
 *
 * @license GPL-3.0-or-later
 */

/**
 * Clean a declared starter list into names we can look for.
 *
 * A manifest is somebody else's file: it can carry whitespace, duplicates, or
 * the wrong type entirely, and none of that is a reason to fail a load.
 *
 * @param {unknown} value  Whatever `defaults.starterParameters` held
 * @returns {string[]} Unique, trimmed, non-empty names, in the order given
 */
export function normalizeStarterList(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const name = entry.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

/**
 * Work out which of the declared names this design actually has.
 *
 * @param {Object} schema      The extracted schema ({ parameters, groups })
 * @param {string[]} declared  Names from the manifest, already normalized
 * @returns {{known: string[], unknown: string[], groupIds: Set<string>, total: number}}
 */
export function resolveStarterParameters(schema, declared) {
  const parameters = schema?.parameters || {};
  const known = [];
  const unknown = [];
  const groupIds = new Set();

  for (const name of declared) {
    const param = parameters[name];
    if (!param) {
      unknown.push(name);
      continue;
    }
    known.push(name);
    if (param.group) groupIds.add(param.group);
  }

  return {
    known,
    unknown,
    groupIds,
    total: Object.keys(parameters).length,
  };
}

/**
 * Should the starter view apply at all?
 *
 * Three ways the answer is no, and each of them matters:
 *   - the manifest did not ask for it;
 *   - it asked, but for a different project than the one on screen (a starter
 *     list belongs to the design it came with, and must not survive into the
 *     next file somebody opens);
 *   - it asked, but not one of the names is a parameter of this design, in
 *     which case a starter view would be an empty screen.
 *
 * @param {{names: string[], fileKey: string|null}} declaration
 * @param {string|null} activeFileKey
 * @param {number} knownCount
 * @returns {boolean}
 */
export function starterViewApplies(declaration, activeFileKey, knownCount) {
  if (!declaration || !Array.isArray(declaration.names)) return false;
  if (declaration.names.length === 0) return false;
  if (declaration.fileKey && declaration.fileKey !== activeFileKey)
    return false;
  return knownCount > 0;
}

// --- Text ------------------------------------------------------------------
// FLAGGED FOR OWNER REVIEW (D-35). Every sentence below is read or heard by
// somebody; none of it is final.

/** Label on the control while only the starter parameters are showing. */
export const SHOW_ALL_LABEL = 'Show all parameters';

/** Label once everything is showing. */
export const SHOW_STARTER_LABEL = 'Show only the starter settings';

/**
 * The sentence under the control, saying what is on screen and what is not.
 *
 * @param {number} shown
 * @param {number} total
 * @returns {string}
 */
export function starterHint(shown, total) {
  const hidden = Math.max(total - shown, 0);
  if (hidden === 0) return `Showing all ${total} settings.`;
  return `Showing the ${shown} settings this design starts with. ${hidden} more are available.`;
}

/**
 * What is announced when the reveal is used.
 *
 * @param {boolean} expanded
 * @param {number} shown
 * @param {number} total
 * @returns {string}
 */
export function starterAnnouncement(expanded, shown, total) {
  return expanded
    ? `Showing all ${total} settings.`
    : `Showing the ${shown} settings this design starts with.`;
}

/**
 * What the console says when a manifest names parameters this design does not
 * have. Never fatal: the rest of the list still works, and saying nothing would
 * leave the author guessing why their list looks short.
 *
 * @param {string[]} unknown
 * @returns {string|null}
 */
export function unknownStarterMessage(unknown) {
  if (!unknown || unknown.length === 0) return null;
  if (unknown.length === 1) {
    return `This link listed ${unknown[0]} as a starting setting, but this design does not have it.`;
  }
  return `This link listed ${unknown.length} starting settings this design does not have: ${unknown.join(', ')}.`;
}

/**
 * The same news, shaped for the notice that sits above the parameters.
 *
 * A status line would be the wrong place: IR-13 measured one standing for about
 * 660 ms before the render replaced it, which is not long enough for anyone to
 * read. This reuses the persistent notice that release built.
 *
 * @param {string[]} unknown
 * @returns {{title: string, lines: string[]}|null}
 */
export function describeUnknownStarter(unknown) {
  if (!unknown || unknown.length === 0) return null;
  return {
    title:
      unknown.length === 1
        ? 'One starting setting in this link is not part of this design'
        : `${unknown.length} starting settings in this link are not part of this design`,
    lines: unknown.map(
      (name) => `${name} is not a parameter of this design, so it was left out.`
    ),
  };
}
