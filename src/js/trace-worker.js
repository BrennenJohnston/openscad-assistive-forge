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
 * @license GPL-3.0-or-later
 */

import ImageTracer from 'imagetracerjs';
import {
  downscaleToCap,
  IMAGE_IMPORT_LIMITS,
  TRACER_OPTIONS,
} from './image-import.js';
import { extractInk } from './ink-extraction.js';

/** The stages a caller can be told about, in the order they happen. */
export const TRACE_STAGES = Object.freeze(['reading', 'ink', 'tracing']);

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
  const { id, ink, tracerOverrides } = data;
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

    // Colours is its own road: it separates the picture into flat colours and
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
    }

    post({
      id,
      type: 'stage',
      stage: 'tracing',
      index: 2,
      total: TRACE_STAGES.length,
    });
    const svg = ImageTracer.imagedataToSVG(pixels, {
      ...TRACER_OPTIONS,
      ...(tracerOverrides || {}),
    });

    post({
      id,
      type: 'done',
      svg,
      // The caller runs filterForegroundPaths, because DOMParser lives there.
      filterForeground: true,
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
