/**
 * The address an engine file is fetched from.
 *
 * `openscad.wasm` keeps one name across engine builds, and the server lets
 * browsers keep it for a year without asking again. A browser that kept an
 * older engine would pair it with a newer loader, and the engine aborts while
 * it starts. Naming the build in the address, from INTEGRITY.json (fetched
 * fresh on every visit), means a changed engine is never answered from an old
 * copy.
 *
 * @license GPL-3.0-or-later
 */

/**
 * @param {string} baseUrl - The engine folder's address, without a trailing slash
 * @param {Object|null} integrity - INTEGRITY.json, or null when it could not be read
 * @param {string} [name='openscad.wasm'] - The file's name in the folder
 * @returns {string}
 */
export function engineFileUrl(baseUrl, integrity, name = 'openscad.wasm') {
  const url = `${baseUrl}/${name}`;
  const sha256 = integrity?.files?.[name]?.sha256;
  if (typeof sha256 !== 'string' || !/^[0-9a-f]{16,}$/i.test(sha256)) {
    return url;
  }
  return `${url}?v=${sha256.slice(0, 16).toLowerCase()}`;
}
