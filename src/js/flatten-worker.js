/**
 * The ring flatten, off the main thread.
 *
 * Folding a drawing's shapes into one printable region is the most expensive
 * thing this app does to a drawing, and until now it did it on the thread that
 * draws the page. MEASURED in Chromium over traced curves: 50 shapes took
 * 485 ms, 200 took 14.7 seconds, 800 took eight and a half minutes - and for
 * every one of those the tab was frozen. DP-34 moved the TRACE into a worker
 * for exactly this reason; this is the same defect one stage later.
 *
 * What crosses the wire is only what the flatten needs: each shape's path data
 * and the role a person gave it, plus the drawing's own size. No DOM, no
 * elements, nothing that would have to be rebuilt on the other side.
 *
 * There is one stage and no progress inside it. The union is a single call
 * into the ring engine and it cannot report where it has got to, so the bar
 * this feeds says "working" rather than "half way" - an honest bar with no
 * number beats a number that is made up.
 *
 * Cancel is `terminate()` from the other side, for the same reason it is there:
 * an AbortSignal cannot interrupt synchronous code, and this is synchronous
 * once it starts.
 *
 * @license GPL-3.0-or-later
 */

import { flattenWithRings } from './flatten-rings.js';

function post(message) {
  self.postMessage(message);
}

self.onmessage = async (event) => {
  const data = event.data || {};
  const { id, elements, svgMeta } = data;
  if (!id) return;

  try {
    if (!Array.isArray(elements)) {
      throw new Error('The flatten was given no shapes to combine.');
    }
    post({ id, type: 'stage', stage: 'combining' });

    // Loaded here rather than at the top so the worker starts before the
    // geometry chunk has landed, and so a failure to load it is reported as a
    // failure of this job rather than of the worker.
    const engine = await import('./ring-geometry.js');

    const warnings = [];
    // Timed HERE, around the union alone: the import above happens once per
    // worker and the postMessage either side is not the drawing's fault. What
    // goes back is what DP-37 P3 calibrates its budget on, so it has to be the
    // cost of the work and nothing else.
    const started = performance.now();
    const svg = flattenWithRings(engine, elements, svgMeta || {}, warnings);
    const ms = performance.now() - started;
    post({ id, type: 'done', svg, warnings, ms });
  } catch (err) {
    post({
      id,
      type: 'error',
      message: err && err.message ? err.message : String(err),
    });
  }
};
