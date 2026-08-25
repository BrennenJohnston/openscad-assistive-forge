/**
 * Saving into the connected folder, on purpose.
 *
 * Phase B of folder sync already watches a linked folder and re-renders when
 * another program edits a file in it. Phase C could only ever write ONE thing
 * back: a preset sidecar, automatically, on save. Exports and edited companion
 * files had no write path at all, so the loop only ran one way - the desktop
 * editor's changes reached Forge, and nothing of Forge's reached the folder.
 *
 * This closes it. Every write here is something the person asked for by
 * pressing a button, every write goes through FolderWriteBack (which tells the
 * watcher before any bytes land, so the loop cannot feed itself), and every
 * write is announced. Nothing is silent and nothing is automatic.
 *
 * Chromium-only, by feature detection: the File System Access API's directory
 * picker does not exist on Firefox or Safari, and the affordances stay hidden
 * there rather than failing when pressed.
 *
 * @license GPL-3.0-or-later
 */

/**
 * Strip any directory part from a path, leaving the file name.
 * @param {string} path
 * @returns {string}
 */
export function baseName(path) {
  return String(path || '')
    .split(/[\\/]/)
    .pop();
}

/**
 * Where an export should land inside the connected folder: beside the design
 * it came from, which is where a desktop tool would look for it.
 *
 * @param {string|null} mainFilePath - The project's main file, folder-relative
 * @param {string} fileName - The download's own name
 * @returns {string} A folder-relative path
 */
export function exportPathFor(mainFilePath, fileName) {
  const name = baseName(fileName);
  if (!mainFilePath) return name;
  const segments = String(mainFilePath).split('/').filter(Boolean);
  segments.pop();
  return segments.length > 0 ? `${segments.join('/')}/${name}` : name;
}

/**
 * The files a companion save should write: everything in the project EXCEPT
 * the main design, which Forge does not edit here and must not overwrite.
 *
 * @param {Map<string, string>|null} projectFiles
 * @param {string|null} mainFilePath
 * @returns {Array<[string, string]>}
 */
export function companionWrites(projectFiles, mainFilePath) {
  if (!projectFiles || projectFiles.size === 0) return [];
  return [...projectFiles.entries()].filter(([path]) => path !== mainFilePath);
}

/**
 * Create the save-to-folder actions.
 *
 * @param {Object} deps
 * @param {() => Object|null} deps.getWriteBack - The FolderWriteBack, or null
 * @param {() => boolean} deps.isEnabled - Whether the write-back flag is lit
 * @param {Function} deps.announce - Speak a sentence
 * @param {Function} deps.onStatus - Show a status line (message, level)
 * @returns {{canSave: Function, saveExport: Function, saveCompanions: Function}}
 */
export function createFolderSaveActions({
  getWriteBack,
  isEnabled,
  announce,
  onStatus,
}) {
  /**
   * Whether the folder-saving affordances should exist at all right now.
   * Three conditions, and all three have to hold: the flag is lit, a folder is
   * connected, and this browser can write to it.
   * @returns {boolean}
   */
  function canSave() {
    if (!isEnabled()) return false;
    const writeBack = getWriteBack();
    return Boolean(writeBack && writeBack.isAvailable());
  }

  const say = (message) => {
    if (typeof announce === 'function') announce(message);
  };
  const status = (message, level) => {
    if (typeof onStatus === 'function') onStatus(message, level);
  };

  /**
   * Write an already-generated export into the connected folder.
   *
   * The bytes come from the same place the download does; nothing re-renders.
   *
   * @param {Object} input
   * @param {string} input.fileName
   * @param {*} input.data - Whatever downloadFile would have been given
   * @param {string|null} [input.mainFilePath]
   * @returns {Promise<{ok: boolean, path?: string, error?: string}>}
   */
  async function saveExport({ fileName, data, mainFilePath = null }) {
    if (!canSave()) {
      return { ok: false, error: 'No connected folder to save into.' };
    }
    const path = exportPathFor(mainFilePath, fileName);
    try {
      await getWriteBack().writeFile(path, data);
      const message = `Saved ${path} to the connected folder.`;
      status(message, 'success');
      say(message);
      return { ok: true, path };
    } catch (err) {
      const message = `Could not save ${path} to the folder: ${err.message}`;
      status(message, 'warning');
      say(message);
      return { ok: false, error: err.message };
    }
  }

  /**
   * Write the project's companion files into the connected folder.
   *
   * The main design is deliberately left alone: Forge is not the editor of
   * record for it in this loop, and overwriting it is how a shared folder
   * turns into an argument.
   *
   * @param {Object} input
   * @param {Map<string, string>|null} input.projectFiles
   * @param {string|null} input.mainFilePath
   * @returns {Promise<{ok: boolean, written: string[], failed: string[]}>}
   */
  async function saveCompanions({ projectFiles, mainFilePath }) {
    const written = [];
    const failed = [];
    if (!canSave()) {
      return { ok: false, written, failed };
    }

    const writes = companionWrites(projectFiles, mainFilePath);
    if (writes.length === 0) {
      const message = 'There are no companion files to save.';
      status(message);
      say(message);
      return { ok: true, written, failed };
    }

    for (const [path, content] of writes) {
      try {
        await getWriteBack().writeFile(path, content);
        written.push(path);
      } catch (err) {
        console.warn('[FolderSave] companion write failed:', path, err);
        failed.push(path);
      }
    }

    // One announcement for the batch, naming the count and the failures.
    // Announcing per file would flood the live region on a large project.
    let message =
      written.length === 1
        ? `Saved ${written[0]} to the connected folder.`
        : `Saved ${written.length} companion files to the connected folder.`;
    if (failed.length > 0) {
      message += ` ${failed.length} could not be written: ${failed.join(', ')}.`;
    }
    status(message, failed.length > 0 ? 'warning' : 'success');
    say(message);
    return { ok: failed.length === 0, written, failed };
  }

  return { canSave, saveExport, saveCompanions };
}
