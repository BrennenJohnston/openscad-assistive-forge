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

import { analyzeSvg } from './svg-preparer.js';
import {
  convertImageDataToSvg,
  loadImageData,
  IMAGE_IMPORT_LIMITS,
} from './image-import.js';

/** Extensions the standalone door accepts. */
export const SVG_EDIT_ACCEPTED_EXTENSIONS = [
  'svg',
  'dxf',
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
export async function svgTextForFile(
  file,
  ink = { mode: 'lineart' },
  render = null
) {
  if (!file || !acceptsForEditing(file.name)) {
    throw new Error(
      `${file?.name || 'That file'} is not a drawing Forge can edit. ` +
        `Choose an SVG or DXF, or a photo saved as PNG or JPG.`
    );
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(
      `${file.name} is larger than ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB. ` +
        `Save a smaller copy and try again.`
    );
  }

  if (fileExtension(file.name) === 'dxf') {
    if (typeof render !== 'function') {
      throw new Error(
        `Forge cannot open ${file.name} right now: the drawing engine is not ` +
          `available. Reload the page and try again.`
      );
    }
    const { dxfToSvg, dxfSize } = await import('./dxf-convert.js');
    const dxfText = await readAsText(file);
    const { svg, ms, warnings } = await dxfToSvg({
      dxfText,
      fileName: file.name,
      render,
    });
    return {
      svg,
      traced: false,
      converted: true,
      ms,
      // D-123: the engine's WARNING lines, carried to the editor's own
      // warnings list instead of being swallowed at this door.
      warnings: warnings || [],
      // Kept so a saved file can be measured against what was opened.
      sourceSize: dxfSize(dxfText),
      imageData: null,
      summary: null,
    };
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
export function createSvgEditEntry({ announce, onError, render } = {}) {
  let container = null;
  let workspace = null;
  let open = false;
  // Kept between re-traces: a mode change re-reads these pixels rather than
  // the file, so the slider answers in about a tenth of a second.
  let currentImageData = null;
  let currentFileName = null;
  let inkControls = null;
  let retraceTimer = null;
  // The size the chosen DXF declared, kept so the saved file can be compared
  // against it rather than leaving the difference to be found at the machine.
  let sourceDxfSize = null;

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

  /**
   * The editor surface, hosted over the whole page. With no model behind it
   * there is nothing for a person to Tab out to, so this is the one host that
   * traps focus, and Escape is the way out (DP-19).
   */
  async function ensureWorkspace() {
    if (workspace) return workspace;
    const { createDrawingEditor } = await import('./drawing-editor/surface.js');
    if (workspace) return workspace;
    container = document.createElement('div');
    container.className = 'svg-edit-standalone-host drawing-editor-host';
    container.id = 'svgEditStandaloneHost';
    container.hidden = true;
    document.body.appendChild(container);
    workspace = createDrawingEditor({
      surfaceEl: container,
      fullscreen: true,
      announce: say,
    });
    return workspace;
  }

  /**
   * Show an SVG in the editor. Used for the first open and for every re-trace
   * after an ink setting changes.
   * @returns {boolean} false when the SVG has nothing the editor can work on
   */
  async function showSvg(svg, { announceOpen, summary, extraWarnings } = {}) {
    let analysis;
    try {
      analysis = analyzeSvg(svg);
      // D-123: the DXF converter's engine warnings join the analysis's own,
      // so the editor's warnings list shows what the engine said instead of
      // this door swallowing it.
      if (Array.isArray(extraWarnings) && extraWarnings.length > 0) {
        analysis = {
          ...analysis,
          warnings: [...(analysis.warnings || []), ...extraWarnings],
        };
      }
    } catch (error) {
      fail(
        `Forge could not read the shapes in ${currentFileName}: ${error.message}`
      );
      return false;
    }

    const shapeCount = analysis.elements ? analysis.elements.length : 0;
    if (shapeCount === 0) {
      // D-117: analyzeSvg returns an empty table for two different reasons,
      // and this used to tell the user the wrong one. When a drawing is over
      // the cap, the analyzer has already written the honest sentence - the
      // real count and the real cap - and throwing it away to say "no shapes
      // ... a photo needs dark lines" gave photo advice for a vector file and
      // named a cause that was not the cause. MEASURED before the fix on both
      // of the owner's SVGs and on Forge's own logo.
      const reason =
        analysis.warnings && analysis.warnings.length > 0
          ? analysis.warnings[0]
          : `${currentFileName} has no shapes Forge can work with. ` +
            `A photo needs dark lines on a light background to trace.`;
      fail(reason);
      return false;
    }

    const ws = await ensureWorkspace();
    ws.open(svg, analysis, {
      purpose: 'relief',
      mode: 'file',
      sourceName: currentFileName,
      tools: inkControls ? inkControls.element : null,
      // The surface announces its own opening; the door's sentence, which
      // names the file and counts its shapes, is the one worth hearing.
      openedSentence: announceOpen || undefined,
      onSave: (savedName) => {
        say(`${savedName} saved. Your original file is untouched.`);
      },
      onKeepOriginal: () => {
        open = false;
      },
      onSaveDxf: typeof render === 'function' ? saveAsDxf : undefined,
    });
    open = true;

    if (inkControls) inkControls.setSummary(summary, shapeCount);
    return true;
  }

  /**
   * Convert the edited drawing to DXF and hand it over as a file.
   * @param {string} editedSvg - The prepared SVG the editor is showing
   */
  async function saveAsDxf(editedSvg) {
    if (typeof render !== 'function') return;
    const name = `${dxfBaseName(currentFileName)}-edited.dxf`;
    say(`Converting to DXF. This takes a moment.`);
    try {
      const { svgToDxf, dxfSize } = await import('./dxf-convert.js');
      const { dxf } = await svgToDxf({
        svgText: editedSvg,
        fileName: currentFileName,
        render,
      });
      const blob = new Blob([dxf], { type: 'image/vnd.dxf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = name;
      link.click();
      URL.revokeObjectURL(url);

      // Say the size out loud. This is a file someone will cut, and a round
      // trip through the editor's flatten is not exact: MEASURED on a 40 by
      // 25 mm drawing, the saved file came back 40.3 by 25.4. Small, and far
      // too important to leave for them to discover at the machine.
      const saved = dxfSize(dxf);
      const mm = (n) => Number(n.toFixed(2));
      let sentence = `${name} saved. Your original file is untouched.`;
      if (saved) {
        sentence += ` It measures ${mm(saved.width)} by ${mm(saved.height)} millimetres.`;
        if (sourceDxfSize) {
          const dw = Math.abs(saved.width - sourceDxfSize.width);
          const dh = Math.abs(saved.height - sourceDxfSize.height);
          if (dw > 0.05 || dh > 0.05) {
            sentence +=
              ` The file you opened measured ${mm(sourceDxfSize.width)} by ` +
              `${mm(sourceDxfSize.height)}. Check the size before cutting.`;
          }
        }
      }
      say(sentence);
    } catch (error) {
      fail(error.message);
    }
  }

  async function retrace(settings) {
    if (!currentImageData) return;
    if (inkControls) inkControls.setBusy(true);
    try {
      const { svg, summary } = await convertImageDataToSvg(currentImageData, {
        ink: settings,
      });
      await showSvg(svg, { summary });
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
      if (fileExtension(file.name) === 'dxf') {
        say(`Converting ${file.name} to a drawing Forge can edit.`);
      }
      prepared = await svgTextForFile(file, { mode: 'lineart' }, render);
    } catch (error) {
      fail(error.message);
      return false;
    }

    currentFileName = file.name;
    currentImageData = prepared.imageData;
    sourceDxfSize = prepared.sourceSize || null;
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
      extraWarnings: prepared.warnings,
      announceOpen: prepared.traced
        ? `${file.name} traced into ${shapes()} shapes. Editor opened.`
        : prepared.converted
          ? `${file.name} converted in ${(prepared.ms / 1000).toFixed(1)} seconds, ${shapes()} shapes. Editor opened.`
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

/**
 * The stem a saved file is named after, without its extension or any path.
 * @param {string|null} name
 * @returns {string}
 */
export function dxfBaseName(name) {
  const base = String(name || 'drawing')
    .split(/[\\/]/)
    .pop()
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'drawing';
}

export { IMAGE_IMPORT_LIMITS };
