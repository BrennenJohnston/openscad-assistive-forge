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
import {
  convertImageDataToSvg,
  loadImageData,
  IMAGE_IMPORT_LIMITS,
} from './image-import.js';

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
 * How long to wait after a slider moves before re-reading the picture.
 * Re-tracing takes about a tenth of a second; doing it per pixel of travel
 * would make the slider feel stuck.
 */
export const RETRACE_DEBOUNCE_MS = 180;

/**
 * Turn a chosen file into the SVG text the editor works on.
 *
 * For a photograph the pixels come back too, so a change of ink mode can
 * re-trace the same picture without reading the file again.
 *
 * @param {File} file
 * @param {Object} [ink] - Ink settings for a raster file
 * @returns {Promise<{svg: string, traced: boolean, imageData: ImageData|null, summary: Object|null}>}
 */
export async function svgTextForFile(file, ink = { mode: 'lineart' }) {
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
    const imageData = await loadImageData(dataUrl);
    // convertImageDataToSvg refuses anything past IMAGE_IMPORT_LIMITS.maxPixels
    // with its own message, which names the actual pixel count.
    const { svg, summary } = await convertImageDataToSvg(imageData, { ink });
    return { svg, traced: true, imageData, summary };
  }

  const svg = await readAsText(file);
  return { svg, traced: false, imageData: null, summary: null };
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
  // Kept between re-traces: a mode change re-reads these pixels rather than
  // the file, so the slider answers in about a tenth of a second.
  let currentImageData = null;
  let currentFileName = null;
  let inkControls = null;
  let retraceTimer = null;

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
  /**
   * Show an SVG in the editor. Used for the first open and for every re-trace
   * after an ink setting changes.
   * @returns {boolean} false when the SVG has nothing the editor can work on
   */
  function showSvg(svg, { announceOpen, summary } = {}) {
    let analysis;
    try {
      analysis = analyzeSvg(svg);
    } catch (error) {
      fail(
        `Forge could not read the shapes in ${currentFileName}: ${error.message}`
      );
      return false;
    }

    const shapeCount = analysis.elements ? analysis.elements.length : 0;
    if (shapeCount === 0) {
      fail(
        `${currentFileName} has no shapes Forge can work with. ` +
          `A photo needs dark lines on a light background to trace.`
      );
      return false;
    }

    const ws = ensureWorkspace();
    ws.open(svg, analysis, {
      mode: 'file',
      sourceName: currentFileName,
      tools: inkControls ? inkControls.element : null,
      onSave: (savedName) => {
        say(`${savedName} saved. Your original file is untouched.`);
      },
      onKeepOriginal: () => {
        open = false;
      },
    });
    if (!open) {
      // With no model behind it this is the whole screen's task, so it opens
      // expanded: that is also where the editor's own focus trap lives.
      ws.openFullscreen();
    }
    open = true;

    if (inkControls) inkControls.setSummary(summary, shapeCount);
    if (announceOpen) say(announceOpen);
    return true;
  }

  async function retrace(settings) {
    if (!currentImageData) return;
    if (inkControls) inkControls.setBusy(true);
    try {
      const { svg, summary } = await convertImageDataToSvg(currentImageData, {
        ink: settings,
      });
      showSvg(svg, { summary });
    } catch (error) {
      fail(`Forge could not re-read ${currentFileName}: ${error.message}`);
    } finally {
      if (inkControls) inkControls.setBusy(false);
    }
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

    currentFileName = file.name;
    currentImageData = prepared.imageData;
    open = false;

    if (prepared.traced) {
      // The controls only exist for a photograph: an SVG already knows which
      // of its shapes are which, so there is nothing to decide about ink.
      const { createInkControls } = await import('./ink-controls.js');
      inkControls = createInkControls({
        idPrefix: 'svg-edit-ink',
        announce: say,
        onChange: (settings) => {
          clearTimeout(retraceTimer);
          retraceTimer = setTimeout(
            () => retrace(settings),
            RETRACE_DEBOUNCE_MS
          );
        },
      });
    } else {
      inkControls = null;
    }

    const shapes = () => {
      try {
        return (analyzeSvg(prepared.svg).elements || []).length;
      } catch {
        return 0;
      }
    };

    return showSvg(prepared.svg, {
      summary: prepared.summary,
      announceOpen: prepared.traced
        ? `${file.name} traced into ${shapes()} shapes. Editor opened.`
        : `${file.name} opened for editing, ${shapes()} shapes.`,
    });
  }

  return {
    openFile,
    isOpen: () => open,
    destroy() {
      clearTimeout(retraceTimer);
      if (workspace) workspace.destroy();
      if (container?.parentNode) container.parentNode.removeChild(container);
      workspace = null;
      container = null;
      inkControls = null;
      currentImageData = null;
      open = false;
    },
  };
}

export { IMAGE_IMPORT_LIMITS };
