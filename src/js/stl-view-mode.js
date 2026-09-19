/**
 * STL view-only mode state.
 *
 * A dropped/picked .stl loads straight into the three.js preview with the
 * camera, measurement, and grid tools active — no WASM render, no
 * parameters, nothing to generate. This tiny module holds that mode flag
 * so main.js and file-handler.js can consult it without circular imports.
 *
 * @license GPL-3.0-or-later
 */

let activeFileName = null;

/** @returns {boolean} True while an STL is open for view-only display */
export function isStlViewActive() {
  return activeFileName !== null;
}

/** @returns {string|null} The viewed STL's file name, or null */
export function getStlViewFileName() {
  return activeFileName;
}

/**
 * @param {boolean} active
 * @param {string|null} [fileName]
 */
export function setStlViewActive(active, fileName = null) {
  activeFileName = active ? fileName : null;
}
