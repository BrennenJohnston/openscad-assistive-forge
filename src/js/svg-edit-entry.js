/**
 * Edit an image or SVG, with no OpenSCAD project behind it.
 *
 * Forge's SVG Preparation Editor already does the hard part: it shows every
 * shape in a drawing as a list item with Foreground / Hole / Ignore radios, so
 * someone working by keyboard and screen reader alone can strip the interior
 * detail a laser cutter or a tactile printer can never show. Until now the only
 * way in was through a model's file parameter, and there was no way out at all:
 * the cleaned SVG lived in memory as a parameter's value.
 *
 * This module is the other two halves - a door with no project behind it, and a
 * file at the end. It does not fork the editor; it hosts the existing one and
 * gives its Save action somewhere to go.
 *
 * @license GPL-3.0-or-later
 */

import { createSvgPrepWorkspace } from './svg-preparer-workspace.js';
import { analyzeSvg } from './svg-preparer.js';
import { convertPngToSvg, IMAGE_IMPORT_LIMITS } from './image-import.js';

/** Extensions the standalone door accepts. */
export const SVG_EDIT_ACCEPTED_EXTENSIONS = [
  'svg',
  'png',
  'jpg',
  'jpeg',
  'bmp',
  'gif',
];

/** File types the door treats as a picture to trace rather than a drawing. */
const RASTER_EXTENSIONS = ['png', 'jpg', 'jpeg', 'bmp', 'gif'];

/** Anything past this is refused before it can hang the tab. */
const MAX_FILE_BYTES = 20 * 1024 * 1024;

/**
 * The extension of a file name, lowercased, without the dot.
 * @param {string} name
 * @returns {string}
 */
export function fileExtension(name) {
  const match = String(name || '').match(/\.([^.\\/]+)$/);
  return match ? match[1].toLowerCase() : '';
}

/**
 * Whether the standalone door accepts this file.
 * @param {string} name
 * @returns {boolean}
 */
export function acceptsForEditing(name) {
  return SVG_EDIT_ACCEPTED_EXTENSIONS.includes(fileExtension(name));
}

function readAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () =>
      reject(new Error(`Could not read ${file.name} from your computer.`));
    reader.readAsText(file);
  });
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () =>
      reject(new Error(`Could not read ${file.name} from your computer.`));
    reader.readAsDataURL(file);
  });
}

/**
 * Turn a chosen file into the SVG text the editor works on.
 *
 * @param {File} file
 * @returns {Promise<{svg: string, traced: boolean}>}
 */
export async function svgTextForFile(file) {
  if (!file || !acceptsForEditing(file.name)) {
    throw new Error(
      `${file?.name || 'That file'} is not a drawing Forge can edit. ` +
        `Choose an SVG, or a photo saved as PNG or JPG.`
    );
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(
      `${file.name} is larger than ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB. ` +
        `Save a smaller copy and try again.`
    );
  }

  if (RASTER_EXTENSIONS.includes(fileExtension(file.name))) {
    const dataUrl = await readAsDataUrl(file);
    // convertPngToSvg refuses anything past IMAGE_IMPORT_LIMITS.maxPixels with
    // its own message, which names the actual pixel count.
    const svg = await convertPngToSvg(dataUrl);
    return { svg, traced: true };
  }

  const svg = await readAsText(file);
  return { svg, traced: false };
}

/**
 * Create the standalone editing door. The workspace and its host container are
 * built on first use, not at boot: this surface costs nothing until someone
 * opens it.
 *
 * @param {Object} deps
 * @param {Function} deps.announce - Speak a message to the live region
 * @param {Function} [deps.onError] - Show an error the person cannot miss
 * @returns {{ openFile: Function, isOpen: Function, destroy: Function }}
 */
export function createSvgEditEntry({ announce, onError } = {}) {
  let container = null;
  let workspace = null;
  let open = false;

  const say = (message) => {
    if (typeof announce === 'function') announce(message);
  };

  const fail = (message) => {
    if (typeof onError === 'function') {
      onError(message);
    } else {
      console.error('[SVG Edit]', message);
    }
    say(message);
  };

  function ensureWorkspace() {
    if (workspace) return workspace;
    container = document.createElement('div');
    container.className = 'svg-edit-standalone-host';
    container.id = 'svgEditStandaloneHost';
    document.body.appendChild(container);
    workspace = createSvgPrepWorkspace(container);
    return workspace;
  }

  /**
   * Open the editor on a file the person chose.
   * @param {File} file
   * @returns {Promise<boolean>} true when the editor is showing the file
   */
  async function openFile(file) {
    let prepared;
    try {
      prepared = await svgTextForFile(file);
    } catch (error) {
      fail(error.message);
      return false;
    }

    let analysis;
    try {
      analysis = analyzeSvg(prepared.svg);
    } catch (error) {
      fail(`Forge could not read the shapes in ${file.name}: ${error.message}`);
      return false;
    }

    if (!analysis.elements || analysis.elements.length === 0) {
      fail(
        `${file.name} has no shapes Forge can work with. ` +
          `A photo needs dark lines on a light background to trace.`
      );
      return false;
    }

    const ws = ensureWorkspace();
    ws.open(prepared.svg, analysis, {
      mode: 'file',
      sourceName: file.name,
      onSave: (savedName) => {
        say(`${savedName} saved. Your original file is untouched.`);
      },
      onKeepOriginal: () => {
        open = false;
      },
    });
    // With no model behind it this is the whole screen's task, so it opens
    // expanded: that is also where the editor's own focus trap lives.
    ws.openFullscreen();
    open = true;

    say(
      prepared.traced
        ? `${file.name} traced into ${analysis.elements.length} shapes. Editor opened.`
        : `${file.name} opened for editing, ${analysis.elements.length} shapes.`
    );
    return true;
  }

  return {
    openFile,
    isOpen: () => open,
    destroy() {
      if (workspace) workspace.destroy();
      if (container?.parentNode) container.parentNode.removeChild(container);
      workspace = null;
      container = null;
      open = false;
    },
  };
}

export { IMAGE_IMPORT_LIMITS };
