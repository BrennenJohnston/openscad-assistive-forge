/**
 * Project ZIP + provenance
 *
 * Turns the loaded project into the list of entries a downloadable archive
 * should contain, and builds the `forge-provenance.json` that travels with it.
 * Pure and DOM-free: jszip assembly and the download itself stay in the caller,
 * so the contents of an export can be asserted without a browser.
 *
 * PROPOSED SCHEMA (IR-Q6): `forge-provenance.json` is new and additive, and
 * its shape is a proposal awaiting the owner's countersign. Nothing reads it
 * back yet; it exists so a file that comes home carries where it came from.
 *
 * @license GPL-3.0-or-later
 */

/** Name of the provenance sidecar inside an exported archive. */
export const PROVENANCE_FILE_NAME = 'forge-provenance.json';

/** Name of the manifest written into an exported archive. */
export const MANIFEST_FILE_NAME = 'forge-manifest.json';

/**
 * Build the provenance record for an export.
 *
 * @param {Object} input
 * @param {string|null} [input.manifestUrl] - Where the project was loaded from,
 *   when it came from a manifest link (state.manifestOrigin.url).
 * @param {string|null} [input.projectName]
 * @param {string|null} [input.author] - Author the manifest declared, if any.
 * @param {string} [input.appVersion]
 * @param {string|null} [input.presetName]
 * @param {Object} [input.parameters] - Values that differ from the defaults.
 * @param {string} input.generatedAt - ISO timestamp. Passed in rather than
 *   read from the clock so an export can be reproduced exactly in a test.
 * @returns {Object}
 */
export function buildProvenance({
  manifestUrl = null,
  projectName = null,
  author = null,
  appVersion = 'unknown',
  presetName = null,
  parameters = {},
  generatedAt,
}) {
  const record = {
    forgeProvenance: '1.0',
    generatedAt,
    appVersion,
    project: projectName || null,
    manifest: manifestUrl || null,
    preset:
      presetName && presetName !== 'design default values' ? presetName : null,
    parameters: { ...parameters },
  };
  if (author) {
    record.author = author;
  }
  return record;
}

/**
 * Split a data URL into the payload jszip needs.
 *
 * ZIP extraction stores images as `data:image/png;base64,...` strings, so
 * writing a project's files back out verbatim would put the text of a data URL
 * where a picture belongs.
 *
 * @param {string} value
 * @returns {{content: string, base64: boolean}}
 */
export function decodeProjectFileValue(value) {
  if (typeof value === 'string') {
    const match = value.match(/^data:[^;,]*;base64,(.*)$/s);
    if (match) {
      return { content: match[1], base64: true };
    }
  }
  return { content: value, base64: false };
}

/**
 * The entries a downloadable project archive should contain: the project's own
 * files, the manifest that describes them, and the provenance record.
 *
 * @param {Object} input
 * @param {Map<string, string>|null} [input.projectFiles]
 * @param {string} [input.mainFilePath] - Used when there are no project files
 *   (a single uploaded .scad).
 * @param {string|null} [input.mainContent]
 * @param {Object} input.manifest - Result of buildProjectManifest.
 * @param {Object} input.provenance - Result of buildProvenance.
 * @returns {Array<{path: string, content: string, base64: boolean}>}
 */
export function buildProjectZipEntries({
  projectFiles = null,
  mainFilePath = 'design.scad',
  mainContent = null,
  manifest,
  provenance,
}) {
  const entries = [];

  if (projectFiles && projectFiles.size > 0) {
    for (const [path, value] of projectFiles.entries()) {
      const { content, base64 } = decodeProjectFileValue(value);
      entries.push({ path, content, base64 });
    }
  } else if (mainContent !== null && mainContent !== undefined) {
    entries.push({
      path: mainFilePath || 'design.scad',
      content: mainContent,
      base64: false,
    });
  }

  entries.push({
    path: MANIFEST_FILE_NAME,
    content: JSON.stringify(manifest, null, 2),
    base64: false,
  });
  entries.push({
    path: PROVENANCE_FILE_NAME,
    content: JSON.stringify(provenance, null, 2),
    base64: false,
  });

  return entries;
}
