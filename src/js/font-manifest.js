/**
 * Font manifest (F2) — the one description of the fonts OpenSCAD can actually
 * use for text().
 *
 * These four files are really present in public/fonts/ and are really mounted
 * into the WASM filesystem before a render; nothing here is a placeholder or a
 * plausible-looking list. Both the worker that mounts them and the Font List
 * panel that displays them read this module, so a font cannot be added, moved
 * or renamed on one side only — cross-file value drift is this project's most
 * expensive recurring bug.
 *
 * Family and style are the names the font files themselves carry, which are
 * also the names fontconfig resolves inside the WASM build, so `font =
 * "Liberation Sans:style=Bold"` in a .scad file matches the Bold row below.
 *
 * @license GPL-3.0-or-later
 */

/** Where the fonts are served from, relative to the app's asset base. */
export const FONT_ASSET_DIR = 'fonts';

/**
 * Where they are mounted inside the WASM filesystem. OpenSCAD's fontconfig
 * looks under /usr/share/fonts, so this path is not arbitrary.
 */
export const FONT_MOUNT_DIR = '/usr/share/fonts/truetype/liberation';

/**
 * @typedef {Object} FontManifestEntry
 * @property {string} file - filename, as served from FONT_ASSET_DIR
 * @property {string} family - fontconfig family name, e.g. "Liberation Sans"
 * @property {string} style - fontconfig style, e.g. "Regular"
 * @property {string} mountPath - absolute path inside the WASM filesystem
 */

/**
 * The mounted fonts, in mount order.
 * @type {ReadonlyArray<FontManifestEntry>}
 */
export const FONT_MANIFEST = Object.freeze(
  [
    {
      file: 'LiberationSans-Regular.ttf',
      family: 'Liberation Sans',
      style: 'Regular',
    },
    {
      file: 'LiberationSans-Bold.ttf',
      family: 'Liberation Sans',
      style: 'Bold',
    },
    {
      file: 'LiberationSans-Italic.ttf',
      family: 'Liberation Sans',
      style: 'Italic',
    },
    {
      file: 'LiberationMono-Regular.ttf',
      family: 'Liberation Mono',
      style: 'Regular',
    },
  ].map((entry) =>
    Object.freeze({ ...entry, mountPath: `${FONT_MOUNT_DIR}/${entry.file}` })
  )
);

/** The filenames alone, which is all the worker's mount loop needs. */
export const FONT_FILES = Object.freeze(FONT_MANIFEST.map((f) => f.file));

/**
 * How a font is named in OpenSCAD source — the string a user would paste into
 * `text(font = "...")`. A Regular face needs no style suffix.
 * @param {FontManifestEntry} entry
 * @returns {string}
 */
export function fontScadName(entry) {
  if (!entry) return '';
  return entry.style === 'Regular'
    ? entry.family
    : `${entry.family}:style=${entry.style}`;
}
