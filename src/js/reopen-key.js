/**
 * The key a reopened editor trusts a stored result by (DP-81, D-175).
 *
 * Apply stores the combined drawing beside the choices it was made from. On
 * a reopen the workspace restores the choices and asks whether the stored
 * drawing is still THEIR result: the same roles, offsets, deletions and
 * layers, at the same design width, on the same raw drawing. When it is,
 * the drawing is painted from the store and Apply is ready at once; when
 * anything differs, the shapes are combined again as they always were.
 *
 * The key is a string so it can be saved with a project and compared with
 * one equality; nothing is ever decoded from it.
 *
 * @license GPL-3.0-or-later
 */

/** FNV-1a, 32-bit, as eight hex digits: enough to tell two drawings apart. */
export function hashText(text) {
  let h = 0x811c9dc5;
  const s = String(text ?? '');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * @param {object} parts
 * @param {Array} parts.roles - Role per ORIGINAL index (a sparse array)
 * @param {Array} parts.offsets - Offset in mm per ORIGINAL index (sparse)
 * @param {number[]} parts.deleted - Original indices removed from the list
 * @param {Array|null} parts.layers - Layer per ORIGINAL index, or null when
 *   no stack was built (D-142: a column of ones is not a stack)
 * @param {number} parts.designWidthMm - The width the editor measures at
 * @param {string} parts.svg - The raw drawing the choices belong to
 * @returns {string}
 */
export function choicesKeyOf({
  roles,
  offsets,
  deleted,
  layers,
  designWidthMm,
  svg,
}) {
  const list = (arr) =>
    Array.isArray(arr)
      ? Array.from(arr, (v) => (v === undefined ? null : v))
      : null;
  const facts = JSON.stringify({
    r: list(roles),
    o: list(offsets),
    d: Array.isArray(deleted) ? [...deleted] : [],
    l: list(layers),
    w: Number.isFinite(designWidthMm)
      ? +Number(designWidthMm).toFixed(3)
      : null,
  });
  const text = String(svg ?? '');
  return `v1:${text.length}:${hashText(text)}:${hashText(facts)}`;
}
