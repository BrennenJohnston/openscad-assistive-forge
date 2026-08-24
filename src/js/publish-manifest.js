/**
 * Publish Manifest Builder
 *
 * Turns the loaded project's state into a `forge-manifest.json` object for the
 * Publish dialog. Pure and DOM-free so the shape it emits can be pinned by
 * tests: the dialog used to hand out manifests the app's own loader refused,
 * and nothing checked (D-95).
 *
 * The result is validated by the caller with the loader's own
 * `validateManifest`, so this module and the loader can never drift apart
 * without something going red.
 *
 * @license GPL-3.0-or-later
 */

/**
 * Build a forge manifest describing the currently loaded project.
 *
 * @param {Object} input
 * @param {string} [input.uploadName] - Name of the file the user loaded. For a
 *   ZIP project this is the ARCHIVE name, which is why it is never used as
 *   files.main.
 * @param {string|null} [input.mainFilePath] - Path of the main .scad file
 *   inside the project (state.mainFilePath).
 * @param {Map<string, *>|null} [input.projectFiles] - The project's files.
 * @param {string|null} [input.presetName] - Currently selected preset, if any.
 * @param {{defaultMode: string, hiddenPanelsInBasic: string[]}|null} [input.uiModePrefs]
 * @param {string[]} [input.registryHiddenDefaults] - Panel ids hidden by
 *   default in basic mode, so an unchanged set is not emitted.
 * @returns {Object} A forge-manifest object
 */
export function buildProjectManifest({
  uploadName = 'design.scad',
  mainFilePath = null,
  projectFiles = null,
  presetName = null,
  uiModePrefs = null,
  registryHiddenDefaults = [],
} = {}) {
  const name = uploadName || 'design.scad';
  // D-47's rule (see presetModelKey in main.js): a project's identity is the
  // main .scad path INSIDE it, never the archive that delivered it.
  const mainPath = mainFilePath || name;
  const isBundle = name.toLowerCase().endsWith('.zip');

  const manifest = {
    forgeManifest: '1.0',
    name: name.replace(/\.(scad|zip)$/i, ''),
    files: isBundle ? { bundle: name, main: mainPath } : { main: mainPath },
  };

  // A bundle carries its own files. Listing them beside it would ask the
  // author to host the same content twice, and the loader ignores companions
  // when files.bundle is set.
  if (!isBundle && projectFiles && projectFiles.size > 0) {
    const companions = [];
    const presets = [];

    for (const filePath of projectFiles.keys()) {
      if (filePath === mainPath) continue;

      if (filePath.toLowerCase().endsWith('.json')) {
        presets.push(filePath);
      } else {
        // Secondary .scad files are companions too (included via use/include)
        companions.push(filePath);
      }
    }

    if (companions.length > 0) {
      manifest.files.companions = companions;
    }
    if (presets.length > 0) {
      manifest.files.presets = presets.length === 1 ? presets[0] : presets;
    }
  }

  manifest.defaults = {
    autoPreview: true,
  };

  if (presetName && presetName !== 'design default values') {
    manifest.defaults.preset = presetName;
  }

  if (uiModePrefs) {
    if (uiModePrefs.defaultMode && uiModePrefs.defaultMode !== 'standard') {
      manifest.defaults.uiMode = uiModePrefs.defaultMode;
    }
    const hidden = uiModePrefs.hiddenPanelsInBasic || [];
    // Copy before sorting: these arrays belong to the ui-mode controller.
    const changed =
      JSON.stringify([...hidden].sort()) !==
      JSON.stringify([...registryHiddenDefaults].sort());
    if (changed) {
      manifest.defaults.hiddenPanels = hidden;
    }
  }

  return manifest;
}
