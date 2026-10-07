/**
 * The ring flatten, off the main thread.
 *
 * Folding a drawing's shapes into one printable region is the most expensive
 * thing this app does to a drawing - eight and a half minutes for 800 traced
 * shapes (the table is in flatten-rings.js) - and on the thread that draws
 * the page the tab would be frozen for all of it.
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

import { flattenWithRings, flattenCompoundRings } from './flatten-rings.js';

function post(message) {
  self.postMessage(message);
}

self.onmessage = async (event) => {
  const data = event.data || {};
  const { id, elements, svgMeta, compound } = data;
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
    // Timed here, around the union alone: the import above happens once per
    // worker and the postMessage either side is not the drawing's fault. What
    // goes back is what the caller's budget is calibrated on, so it has to be
    // the cost of the work and nothing else.
    const started = performance.now();
    // A traced drawing's rows with an offset among them take the
    // parity-aware combine; every other drawing the fold of regions.
    const svg = compound
      ? flattenCompoundRings(engine, elements, svgMeta || {}, warnings)
      : flattenWithRings(engine, elements, svgMeta || {}, warnings);
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
