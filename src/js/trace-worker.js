/**
 * The picture-to-drawing worker.
 *
 * Everything between "here are the pixels" and "here are the paths" runs here,
 * off the main thread, so the page can always answer a click. That is the whole
 * point: a slow device stays a slow device, it never becomes a frozen page.
 *
 * What runs here and what does not, and why:
 *
 *   - `downscaleToCap`, `extractInk`, `separateColours` and imagetracerjs are
 *     all pure arithmetic over pixel buffers. They are the expensive part, and
 *     none of them touches the DOM.
 *   - `loadImageData` stays on the main thread: it needs `new Image()` and a
 *     canvas, neither of which exists here.
 *   - `filterForegroundPaths` stays on the main thread too: it parses the SVG
 *     with `DOMParser`, which a worker does not have. It measured 1 to 19 ms,
 *     so there is nothing to gain by moving it and no way to do so cheaply.
 *
 * The pixel buffer arrives by TRANSFER, so a 32 MB photograph changes owner
 * instead of being copied, and it is transferred back the same way when the
 * caller asked for the mask.
 *
 * Cancel is `terminate()` from the other side (`trace-runner.js`). Nothing here
 * polls a flag, because an `AbortSignal` cannot interrupt synchronous code and
 * every stage below is synchronous once it starts. MDN is plain about this:
 * `terminate()` stops the worker at once, with no cleanup opportunity, and that
 * is exactly what a person pressing Cancel means.
 *
 * Every message carries the job id it belongs to. A reply that arrives after a
 * new job has started is dropped by the runner rather than mistaken for the new
 * one.
 *
 * There are two tracing engines behind one message shape. `engine: 'potrace'`
 * takes the one-bit ink mask straight to the Forge-built Potrace wasm;
 * anything else goes to imagetracerjs. Potrace draws in one color, so it can
 * only answer for the ink modes - Standard keeps the picture's colors and
 * Colors is a different road entirely, and both stay with imagetracerjs. When
 * Potrace is asked for and cannot answer, the reply SAYS which engine ran
 * rather than quietly substituting one.
 *
 * @license GPL-3.0-or-later
 */

import ImageTracer from 'imagetracerjs';
import {
  downscaleToCap,
  IMAGE_IMPORT_LIMITS,
  TRACER_OPTIONS,
} from './image-import.js';
import {
  compositeOntoWhite,
  extractInk,
  lineWidthPercentiles,
} from './ink-extraction.js';
import { DEFAULT_TRACE_ENGINE } from './trace-engines.js';

/** The stages a caller can be told about, in the order they happen. */
export const TRACE_STAGES = Object.freeze(['reading', 'ink', 'tracing']);

/**
 * How much of a picture's bottom a credit line can occupy.
 *
 * The same share credit-line.js uses. It is repeated rather than imported
 * because that module needs a DOM parser and this one has no DOM; a number
 * crossing the wire is cheaper than a parser, and the two are pinned together
 * by a test.
 */
export const CREDIT_BAND_SHARE = 0.2;

/**
 * Rebuild the plain object a structured-clone transfer leaves behind into
 * something with the shape the pixel code expects. The buffer is the payload;
 * width and height ride beside it.
 */
function asPixels({ width, height, buffer }) {
  const data = new Uint8ClampedArray(buffer);
  // Checked rather than trusted. A typed array reads past its end as
  // `undefined` instead of throwing, so a message whose dimensions and buffer
  // disagree would not fail here: it would quietly produce a drawing made of
  // nothing, which is exactly the shape of defect this project keeps finding.
  if (!(width > 0) || !(height > 0) || data.length !== width * height * 4) {
    throw new Error(
      `Picture does not match its size: ${width}x${height} needs ` +
        `${width * height * 4} bytes, got ${data.length}`
    );
  }
  return { width, height, data };
}

/** A worker has ImageData, but building one by hand avoids depending on it. */
function makeImageData(width, height) {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

function post(message, transfer) {
  self.postMessage(message, transfer || []);
}

self.onmessage = async (event) => {
  const data = event.data || {};
  const { id, ink, tracerOverrides, potraceOverrides } = data;
  if (!id) return;

  try {
    let pixels = asPixels(data.image);
    post({
      id,
      type: 'stage',
      stage: 'reading',
      index: 0,
      total: TRACE_STAGES.length,
    });

    let downscale = null;
    if (pixels.width * pixels.height > IMAGE_IMPORT_LIMITS.maxPixels) {
      downscale = downscaleToCap(pixels, IMAGE_IMPORT_LIMITS.maxPixels);
      pixels = downscale.imageData;
    }

    // Colors is its own road: it separates the picture into flat colors and
    // returns regions with their fills, so there is no ink mask and no trace.
    // It lives here for the same reason the rest does - it is arithmetic over
    // pixels, and the stencil purpose should not be the one thing that still
    // freezes.
    if (ink && ink.mode === 'colours') {
      post({
        id,
        type: 'stage',
        stage: 'ink',
        index: 1,
        total: TRACE_STAGES.length,
      });
      const { separateColours } = await import('./colour-separation.js');
      const { colourLabel } = await import('./stencil-colours.js');
      const hexOf = (c) =>
        `#${[c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
      const options = {
        count: ink.colourCount ?? 6,
        mmPerPixel: ink.mmPerPixel ?? 0,
        // D-138. The worker builds its own options rather than forwarding
        // ink, so a setting the host passes has to be named here too - which
        // is exactly how the share floor reached the separation in a unit
        // test and nowhere in the app for an afternoon.
        shareFloor: ink.shareFloor ?? 0,
        nameFor: (c) => colourLabel(hexOf(c)),
      };
      const first = separateColours(pixels, options);
      const wall =
        ink.wallColour && ink.wallColour !== 'auto' ? ink.wallColour : null;
      const chosen = wall
        ? first.colours.findIndex(
            (c) => c.hex.toLowerCase() === wall.toLowerCase()
          )
        : -1;
      const result =
        chosen >= 0
          ? separateColours(pixels, {
              ...options,
              backgroundIndex: first.colours[chosen].index,
            })
          : first;
      post({
        id,
        type: 'done',
        svg: result.svg,
        filterForeground: false,
        // Colors is its own separator, not either tracing engine.
        engine: 'colours',
        summary: {
          mode: 'colours',
          colours: result.colours,
          droppedTotal: result.droppedTotal,
          ...(downscale ? { downscale: { factor: downscale.factor } } : {}),
        },
      });
      return;
    }

    let summary = null;
    let inkMask = null;
    if (ink && ink.mode && ink.mode !== 'standard') {
      post({
        id,
        type: 'stage',
        stage: 'ink',
        index: 1,
        total: TRACE_STAGES.length,
      });
      const extracted = extractInk(pixels, { ...ink, makeImageData });
      pixels = extracted.imageData;
      summary = extracted.summary;
      inkMask = extracted.mask;
      // How thin the thinnest lines are, so the editor can say whether they
      // will print. MEASURED at 15 to 20 ms on a picture at the 2 MP cap, so
      // it rides along with the stage that already has the mask rather than
      // costing a second pass over the picture later.
      if (inkMask) {
        // Two answers, because the caller does not know yet whether this
        // picture has a caption on it: that is decided on the other side,
        // where a DOM parser exists. The second leaves out the band a credit
        // line lives in, and the caller picks the one that matches the drawing
        // it ended up with.
        summary = {
          ...summary,
          lineWidthPx: lineWidthPercentiles(
            inkMask,
            pixels.width,
            pixels.height
          ),
          lineWidthPxBody: lineWidthPercentiles(
            inkMask,
            pixels.width,
            pixels.height,
            { ignoreBelowY: pixels.height * (1 - CREDIT_BAND_SHARE) }
          ),
        };
      }
    } else {
      // Standard keeps the picture's own colors and builds no mask, so a
      // see-through picture used to reach the tracer with its alpha and the
      // tracer decided what that meant. It is put on white first now, which is
      // what the person has already seen in every viewer they opened it in.
      const flat = compositeOntoWhite(pixels, makeImageData);
      pixels = flat.imageData;
      if (flat.composited) {
        summary = {
          mode: 'standard',
          applied: false,
          composited: true,
          warnings: ['composited-onto-white'],
        };
      }
    }

    post({
      id,
      type: 'stage',
      stage: 'tracing',
      index: 2,
      total: TRACE_STAGES.length,
    });

    // Potrace needs the one-bit mask, which only the ink modes produce. Asked
    // for without one, it is not silently swapped: the reply names the engine
    // that actually ran, so a census or a person can tell.
    const engine = data.engine || DEFAULT_TRACE_ENGINE;
    const usePotrace = engine === 'potrace' && !!inkMask;
    let svg;
    let filterForeground;
    if (usePotrace) {
      // Loaded only when it is used, so a visitor who never asks for it never
      // fetches the wasm.
      const { trace, pathDataToSvg, FORGE_POTRACE_SETTINGS } =
        await import('./potrace-trace.js');
      const pathData = await trace(inkMask, pixels.width, pixels.height, {
        ...FORGE_POTRACE_SETTINGS,
        ...(potraceOverrides || {}),
      });
      svg = pathDataToSvg(pathData, pixels.width, pixels.height);
      // One color: there is no lightest layer to drop, and dropping the only
      // path there is would erase the drawing.
      filterForeground = false;
    } else {
      svg = ImageTracer.imagedataToSVG(pixels, {
        ...TRACER_OPTIONS,
        ...(tracerOverrides || {}),
      });
      // The caller runs filterForegroundPaths, because DOMParser lives there.
      filterForeground = true;
    }

    post({
      id,
      type: 'done',
      svg,
      filterForeground,
      engine: usePotrace ? 'potrace' : 'imagetracer',
      summary:
        downscale && summary
          ? { ...summary, downscale: { factor: downscale.factor } }
          : summary,
    });
  } catch (err) {
    post({
      id,
      type: 'error',
      message: err && err.message ? err.message : String(err),
    });
  }
};
