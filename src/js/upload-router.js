/**
 * Unified upload classification.
 *
 * One pure module decides what a drop/pick means so every upload surface
 * (welcome-zone drop, file picker, future folder connect) routes the same
 * way and shows the same accepted-types copy. No DOM, no side effects —
 * fully unit-testable.
 *
 * @license GPL-3.0-or-later
 */

/** Drop classification kinds. */
export const DROP_KIND = {
  SCAD: 'scad',
  ZIP: 'zip',
  STL: 'stl',
  PRESET_JSON: 'preset-json',
  FOLDER: 'folder',
  MULTI: 'multi',
  UNSUPPORTED: 'unsupported',
};

const EXT_KIND = new Map([
  ['scad', DROP_KIND.SCAD],
  ['zip', DROP_KIND.ZIP],
  ['stl', DROP_KIND.STL],
  ['json', DROP_KIND.PRESET_JSON],
]);

function extensionOf(name) {
  const match = /\.([^.\\/]+)$/.exec(String(name || '').toLowerCase());
  return match ? match[1] : '';
}

/**
 * Single source for the user-facing accepted-types copy.
 * @returns {string}
 */
export function describeAccepted() {
  return '.scad model · .zip project · project folder · .stl (view only) · .json presets';
}

/**
 * The `accept` attribute value for the unified file input.
 * @returns {string}
 */
export function acceptAttribute() {
  return '.scad,.zip,.stl,.json';
}

/**
 * Classify a drop or file selection.
 *
 * Accepts either a DataTransferItemList (drag & drop — enables folder
 * detection via webkitGetAsEntry) or a FileList/File[] (input pickers).
 *
 * @param {DataTransferItemList|FileList|File[]} input
 * @returns {{ kind: string, files: File[], directoryEntries: Array }}
 *   - kind: one of DROP_KIND
 *   - files: the plain File objects involved (empty for FOLDER drops)
 *   - directoryEntries: FileSystemDirectoryEntry[] for FOLDER drops
 */
export function classifyDrop(input) {
  const files = [];
  const directoryEntries = [];

  const items = Array.from(input || []);
  for (const item of items) {
    if (typeof DataTransferItem !== 'undefined' && item instanceof DataTransferItem) {
      if (item.kind !== 'file') continue;
      const entry = item.webkitGetAsEntry?.();
      if (entry?.isDirectory) {
        directoryEntries.push(entry);
        continue;
      }
      const file = item.getAsFile?.();
      if (file) files.push(file);
    } else if (item && typeof item.name === 'string') {
      // Plain File (from an <input> FileList or tests)
      files.push(item);
    } else if (item?.webkitGetAsEntry || item?.getAsFile) {
      // DataTransferItem-shaped object outside a browser realm (tests)
      const entry = item.webkitGetAsEntry?.();
      if (entry?.isDirectory) {
        directoryEntries.push(entry);
        continue;
      }
      const file = item.getAsFile?.();
      if (file) files.push(file);
    }
  }

  if (directoryEntries.length > 0) {
    return { kind: DROP_KIND.FOLDER, files: [], directoryEntries };
  }

  if (files.length === 0) {
    return { kind: DROP_KIND.UNSUPPORTED, files, directoryEntries };
  }

  if (files.length > 1) {
    // Loose multi-file drop: meaningful only when a .scad main file is
    // among them; the caller prompts for the main file and treats the
    // rest as companions.
    const hasScad = files.some((f) => extensionOf(f.name) === 'scad');
    return {
      kind: hasScad ? DROP_KIND.MULTI : DROP_KIND.UNSUPPORTED,
      files,
      directoryEntries,
    };
  }

  const kind = EXT_KIND.get(extensionOf(files[0].name)) ?? DROP_KIND.UNSUPPORTED;
  return { kind, files, directoryEntries };
}
