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

import {
  analyzeSvg,
  countTracedShapes,
  isOverListCap,
  shapeCapRefusal,
} from './svg-preparer.js';
import { removeCreditLine } from './credit-line.js';
import { loadImageData, IMAGE_IMPORT_LIMITS } from './image-import.js';
import { createTraceRunner, TraceCancelled } from './trace-runner.js';
import { createConversionJob, TraceRefused } from './conversion-job.js';
import { createConversionDialog } from './conversion-dialog.js';
import { COST_BANDS, quickLook } from './quick-look.js';
import { cropImageDataRect, imageDataToDataUrl } from './image-crop.js';
import { EDITOR_STRINGS as EDITOR_S } from './drawing-editor/strings.js';
import { DEFAULT_DESIGN_WIDTH_MM } from './svg-preparer-workspace.js';

// DP-34: the door's FIRST trace, the one that happens while the editor is
// still being opened. It runs in the worker like every other trace, so a big
// picture at this door no longer blocks the page while it converts. One runner
// for the module, because svgTextForFile is a free function and there is only
// ever one door open.
let doorRunner = null;

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
    // A picture past IMAGE_IMPORT_LIMITS.maxPixels is SCALED DOWN rather than
    // refused, and the worker says by how much in its summary.
    if (!doorRunner) doorRunner = createTraceRunner();
    const { svg, summary } = await doorRunner.start(imageData, ink || null);
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
  // DP-34: the door's traces run in the worker too, so opening a big picture
  // here does not freeze the page either. The door has no Start button yet -
  // the person already chose Edit Drawing, which IS the deliberate action -
  // and no Cancel surface, because there is nothing on screen to put one on
  // until the editor exists. DP-37 gives this door a picture first, and the
  // bar and Cancel belong with it.
  let traceRunner = null;
  // DP-52: the door's traces run through the same job and dialog as the
  // charm host's. The dialog closes BEFORE the editor opens: the editor traps
  // focus itself and says it has opened, neither of which can happen behind an
  // inert page. So its last stage is not shown here, and the sentence for it
  // stays proposed.
  let conversionDialog = null;
  let conversionJob = null;
  const ensureConversion = () => {
    if (!traceRunner) traceRunner = createTraceRunner();
    if (!conversionDialog) {
      conversionDialog = createConversionDialog({
        onCancel: () => {
          if (conversionJob) conversionJob.cancel();
          say('Conversion canceled');
        },
      });
    }
    if (!conversionJob) {
      conversionJob = createConversionJob({
        runner: traceRunner,
        onStage: (s) => conversionDialog.stage(s),
      });
    }
    return { job: conversionJob, dialog: conversionDialog };
  };
  /**
   * Trace pixels behind the dialog. `startedBy` follows the charm host's
   * rule: a person's own act shows the dialog at once, a re-trace after a
   * slider move shows it only once it has run for the quick band.
   */
  const runTrace = async (imageData, ink, { startedBy = 'person' } = {}) => {
    const { job, dialog } = ensureConversion();
    const show = () => {
      if (!dialog.isOpen()) dialog.open(currentFileName);
    };
    let graceTimer = null;
    if (startedBy === 'person') show();
    else {
      graceTimer = setTimeout(() => {
        if (job.isRunning()) show();
      }, COST_BANDS.quickMs);
    }
    // D-151. A run superseded by a newer one (a slider moved while it ran)
    // leaves the dialog to that newer run.
    let superseded = false;
    try {
      return await job.run({
        imageData,
        settings: ink,
        // DP-78 (D-172): a trace with more shapes than the editor lists is
        // turned away here, the moment the worker is done. It used to reach
        // showSvg, be parsed for seconds, and be refused there with a vector
        // editor's advice for a photograph.
        refuse: ({ svg }) => {
          const count = countTracedShapes(svg);
          return isOverListCap(count)
            ? shapeCapRefusal(count, 'door').sentence
            : null;
        },
        prepare: (traced) => traced,
        update: (traced) => traced,
      });
    } catch (error) {
      superseded =
        error instanceof TraceCancelled && error.reason === 'superseded';
      throw error;
    } finally {
      clearTimeout(graceTimer);
      if (!superseded) dialog.close();
    }
  };
  let container = null;
  let workspace = null;
  let open = false;
  // Kept between re-traces: a mode change re-reads these pixels rather than
  // the file, so the slider answers in about a tenth of a second.
  let currentImageData = null;
  let currentFileName = null;
  // DP-79: the quick look's verdict on the picture in hand. A camera picture
  // is worked at the print's cell and starts with the photo defaults on;
  // this door has no charm to size to, so the editor's default width is the
  // printed width it works at.
  let currentCamera = false;
  const withPicture = (settings) =>
    currentImageData
      ? {
          ...settings,
          camera: currentCamera,
          mmPerPixel: DEFAULT_DESIGN_WIDTH_MM / currentImageData.width,
        }
      : settings;
  // DP-49: the picture the pixels came from (for the crop view), the drawing
  // as last shown (what a crop clips), and what a crop replaced (one undo).
  let currentSourceDataUrl = null;
  let currentShown = null;
  let cropUndo = null;
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
  async function showSvg(
    svg,
    { announceOpen, summary, extraWarnings, removeCredit = false } = {}
  ) {
    // Only a TRACED picture has its credit line taken off. A vector file the
    // person chose is a file they made or picked deliberately, and quietly
    // deleting part of it is a different act from cleaning up after a tracer.
    // The caller says which this is rather than this guessing.
    let shown = svg;
    let creditLine = null;
    currentShown = { input: svg, summary, extraWarnings, removeCredit };
    if (removeCredit) {
      const credit = removeCreditLine(svg);
      if (credit.removed > 0) {
        shown = credit.svg;
        creditLine = {
          removed: credit.removed,
          onUndo: () => showSvg(credit.original, { summary, extraWarnings }),
        };
      }
    }

    let analysis;
    try {
      analysis = analyzeSvg(shown);
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
      // D-139: a picture that was just traced gets the sentence for THAT, not
      // the vector-file one. "A photo needs dark lines on a light background"
      // was also the wrong advice as of this release: a light drawing on a
      // dark ground is turned around and traced, so what is left to say is
      // which lever to move.
      const reason =
        analysis.warnings && analysis.warnings.length > 0
          ? analysis.warnings[0]
          : removeCredit
            ? `Nothing was kept from ${currentFileName}. ` +
              `Try another mode, or move "How dark counts as a line", and convert again.`
            : `${currentFileName} has no shapes Forge can work with. ` +
              `A photo needs dark lines on a light background to trace.`;
      fail(reason);
      return false;
    }

    const ws = await ensureWorkspace();
    ws.open(shown, analysis, {
      purpose: 'relief',
      mode: 'file',
      sourceName: currentFileName,
      // The editor says how thin the thinnest lines are at the width it will
      // be printed. The measurement rides in with the trace; the width is the
      // editor's own control. Nothing is changed by it - it names the lever.
      //
      // When a credit line was taken off, the figure that leaves the bottom
      // band out is the one that describes what is left. Letter strokes are
      // the thinnest thing in most icons, so using the other number would warn
      // about lettering that is no longer on the drawing.
      lineWidthPx:
        summary && (creditLine ? summary.lineWidthPxBody : summary.lineWidthPx),
      designWidthKnown: false,
      tools: inkControls ? inkControls.element : null,
      // DP-49: the crop. The door owns the pixels and the drawing, so it owns
      // the operation; the editor says the rectangle.
      onCrop: handleCrop,
      ...(cropUndo ? { onUndoCrop: handleUndoCrop, cropUndoable: true } : {}),
      ...(currentImageData && currentSourceDataUrl
        ? { cropPreviewHref: currentSourceDataUrl }
        : {}),
      // The surface announces its own opening; the door's sentence, which
      // names the file and counts its shapes, is the one worth hearing.
      openedSentence:
        typeof announceOpen === 'function'
          ? announceOpen(shapeCount)
          : announceOpen || undefined,
      onSave: (savedName) => {
        say(`${savedName} saved. Your original file is untouched.`);
      },
      onKeepOriginal: () => {
        open = false;
      },
      onSaveDxf: typeof render === 'function' ? saveAsDxf : undefined,
    });
    open = true;

    if (inkControls)
      inkControls.setSummary(summary, shapeCount, { creditLine });
    return true;
  }

  /**
   * DP-49: crop the source to the rectangle the editor said and show the
   * result. A picture is cropped in its pixels and traced again, through the
   * same dialog as the first trace; a drawing is clipped, the clip loading
   * with the ring engine on demand. One level of undo, this session.
   */
  async function handleCrop(rect) {
    if (!currentShown) return;
    const before = {
      imageData: currentImageData,
      sourceDataUrl: currentSourceDataUrl,
      shown: currentShown,
    };
    if (currentImageData) {
      const cropped = cropImageDataRect(currentImageData, rect);
      currentImageData = cropped;
      currentSourceDataUrl = imageDataToDataUrl(cropped);
      const settings = inkControls
        ? inkControls.getSettings()
        : { mode: 'lineart' };
      if (inkControls) inkControls.setBusy(true);
      try {
        const { svg, summary } = await runTrace(
          currentImageData,
          withPicture(settings),
          { startedBy: 'person' }
        );
        cropUndo = before;
        await showSvg(svg, {
          summary,
          removeCredit: true,
          announceOpen: (shapes) => EDITOR_S.cropped(shapes),
        });
      } catch (error) {
        // Stopped, or failed: the pixels go back to what they were and the
        // editor is still showing the drawing it showed.
        currentImageData = before.imageData;
        currentSourceDataUrl = before.sourceDataUrl;
        if (error instanceof TraceCancelled) return;
        if (error instanceof TraceRefused) {
          // DP-78: the crop traced into more than the editor lists. The
          // sentence is the whole report; the waiting line in the panel
          // would otherwise stand (D-119).
          fail(error.sentence);
          if (inkControls) inkControls.setFailed(error.sentence);
          return;
        }
        fail(`Forge could not re-read ${currentFileName}: ${error.message}`);
      } finally {
        if (inkControls) inkControls.setBusy(false);
      }
      return;
    }
    const { cropSvgDrawing } = await import('./svg-crop.js');
    const shownSvg = currentShown.removeCredit
      ? removeCreditLine(currentShown.input).svg
      : currentShown.input;
    let clipped;
    try {
      clipped = cropSvgDrawing(shownSvg, rect);
    } catch (error) {
      say(EDITOR_S.cropNothing);
      console.warn('[SVG Edit] crop refused:', error.message);
      return;
    }
    cropUndo = before;
    await showSvg(clipped.svg, {
      summary: currentShown.summary,
      extraWarnings: currentShown.extraWarnings,
      announceOpen: (shapes) => EDITOR_S.cropped(shapes),
    });
  }

  /** DP-49: put back what the last crop replaced. */
  async function handleUndoCrop() {
    if (!cropUndo) return;
    const before = cropUndo;
    cropUndo = null;
    currentImageData = before.imageData;
    currentSourceDataUrl = before.sourceDataUrl;
    await showSvg(before.shown.input, {
      summary: before.shown.summary,
      extraWarnings: before.shown.extraWarnings,
      removeCredit: before.shown.removeCredit,
      announceOpen: (shapes) => EDITOR_S.cropUndone(shapes),
    });
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
        sentence += ` It measures ${mm(saved.width)} by ${mm(saved.height)} millimeters.`;
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
      const { svg, summary } = await runTrace(
        currentImageData,
        withPicture(settings),
        { startedBy: 'self' }
      );
      await showSvg(svg, { summary, removeCredit: true });
    } catch (error) {
      // A trace the person superseded by moving another slider is not a
      // failure and must not be reported as one.
      if (error instanceof TraceCancelled) return;
      if (error instanceof TraceRefused) {
        // DP-78: this setting traced into more than the editor lists. The
        // drawing on show stays the one from before; the sentence says what
        // to try, and replaces the waiting line (D-119).
        fail(error.sentence);
        if (inkControls) inkControls.setFailed(error.sentence);
        return;
      }
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
      if (RASTER_EXTENSIONS.includes(fileExtension(file.name))) {
        // A picture: through the job and the dialog. Choosing Edit Drawing
        // IS the deliberate act, so the dialog opens at once.
        currentFileName = file.name;
        const dataUrl = await readAsDataUrl(file);
        currentSourceDataUrl = dataUrl;
        cropUndo = null;
        const imageData = await loadImageData(dataUrl);
        // DP-79: the first trace already knows what the picture is. A camera
        // picture gets the photo defaults from the start; the panel built
        // below starts with the same switches on.
        currentCamera = !!quickLook(imageData).camera;
        const { svg, summary } = await runTrace(
          imageData,
          {
            mode: 'lineart',
            camera: currentCamera,
            smooth: currentCamera,
            speckFloor: currentCamera,
            mmPerPixel: DEFAULT_DESIGN_WIDTH_MM / imageData.width,
          },
          { startedBy: 'person' }
        );
        prepared = { svg, traced: true, imageData, summary };
      } else {
        prepared = await svgTextForFile(file, { mode: 'lineart' }, render);
      }
    } catch (error) {
      // The person stopped it; the dialog's own Cancel has already said so.
      if (error instanceof TraceCancelled) return false;
      // A refusal (DP-78, a trace over the cap) carries its sentence as its
      // message, and the toast is the door's one place to say it.
      fail(error.message);
      return false;
    }

    currentFileName = file.name;
    currentImageData = prepared.imageData;
    if (!prepared.imageData) currentSourceDataUrl = null;
    cropUndo = null;
    sourceDxfSize = prepared.sourceSize || null;
    open = false;

    if (prepared.traced) {
      // The controls only exist for a photograph: an SVG already knows which
      // of its shapes are which, so there is nothing to decide about ink.
      const { createInkControls } = await import('./ink-controls.js');
      inkControls = createInkControls({
        idPrefix: 'svg-edit-ink',
        announce: say,
        purpose: 'relief',
        onChange: (settings) => {
          clearTimeout(retraceTimer);
          retraceTimer = setTimeout(
            () => retrace(settings),
            RETRACE_DEBOUNCE_MS
          );
        },
      });
      inkControls.setPictureClass({ camera: currentCamera });
    } else {
      inkControls = null;
    }

    // The count is taken from what the editor actually shows, not from the
    // drawing on the way in: with a credit line removed those are different
    // numbers, and announcing the one nobody can see would be a lie the person
    // could check.
    return showSvg(prepared.svg, {
      summary: prepared.summary,
      extraWarnings: prepared.warnings,
      removeCredit: prepared.traced,
      announceOpen: (shapes) =>
        prepared.traced
          ? `${file.name} traced into ${shapes} shapes. Editor opened.`
          : prepared.converted
            ? `${file.name} converted in ${(prepared.ms / 1000).toFixed(1)} seconds, ${shapes} shapes. Editor opened.`
            : `${file.name} opened for editing, ${shapes} shapes.`,
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
