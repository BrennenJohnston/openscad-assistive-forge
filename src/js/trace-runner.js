/**
 * The runner that owns the trace worker.
 *
 * One runner per file control. It starts a job, reports the stage it has
 * reached, and can be canceled at any moment - including in the middle of a
 * trace that would otherwise have run for a minute.
 *
 * Why cancel is `terminate()` and not an `AbortController`: every stage of the
 * trace is synchronous once it begins, and an `AbortSignal` cannot interrupt
 * synchronous code - it only helps where the code yields or checks `aborted`.
 * MDN is explicit that `Worker.terminate()` stops the worker immediately, with
 * no cleanup opportunity, which is precisely what pressing Cancel means. The
 * runner keeps `AbortController`'s SHAPE (a `cancel()` that settles the promise
 * with a named reason) so callers read like ordinary async code.
 *
 * A terminated worker is gone, so the next job builds a fresh one. That is not
 * a cost worth avoiding: a worker starts in single-digit milliseconds, and the
 * alternative is a worker in an unknown state.
 *
 * Every message carries its job id. A reply from a job that has been superseded
 * is dropped rather than delivered to whoever is waiting now, which is the bug
 * a fast slider would otherwise produce every time.
 *
 * @license GPL-3.0-or-later
 */

import { filterForegroundPaths } from './image-import.js';
import { DEFAULT_TRACE_ENGINE } from './trace-engines.js';

/** Thrown (as a rejection reason) when a job is canceled or superseded. */
export class TraceCancelled extends Error {
  constructor(reason = 'cancelled') {
    super(reason === 'superseded' ? 'Trace superseded' : 'Trace canceled');
    this.name = 'TraceCancelled';
    this.reason = reason;
  }
}

let nextId = 1;

/**
 * @param {object} [options]
 * @param {Function} [options.createWorker] - Builds the worker; injected by the
 *   unit tests so the runner can be exercised without a real one.
 * @returns {{start: Function, cancel: Function, isRunning: Function, destroy: Function}}
 */
export function createTraceRunner(options = {}) {
  const createWorker =
    options.createWorker ||
    (() =>
      new Worker(new URL('./trace-worker.js', import.meta.url), {
        type: 'module',
      }));

  let worker = null;
  let current = null;

  function teardown() {
    if (worker) {
      worker.terminate();
      worker = null;
    }
  }

  /** End the job in flight, if any, with a named reason. */
  function settleCancelled(reason) {
    const job = current;
    current = null;
    teardown();
    if (job) job.reject(new TraceCancelled(reason));
  }

  function handleMessage(event) {
    const message = event.data || {};
    // A reply belonging to a job that is no longer the one in flight is not an
    // error and not an answer. It is a ghost, and it is dropped.
    if (!current || message.id !== current.id) return;

    if (message.type === 'stage') {
      if (current.onStage) {
        current.onStage({
          stage: message.stage,
          index: message.index,
          total: message.total,
        });
      }
      return;
    }

    if (message.type === 'done') {
      const job = current;
      current = null;
      // DOMParser lives on this side, so the last step happens here.
      const svg = message.filterForeground
        ? filterForegroundPaths(message.svg)
        : message.svg;
      job.resolve({
        svg,
        summary: message.summary ?? null,
        engine: message.engine ?? 'imagetracer',
      });
      return;
    }

    if (message.type === 'error') {
      const job = current;
      current = null;
      teardown();
      job.reject(new Error(message.message || 'Trace failed'));
    }
  }

  function handleError(event) {
    if (!current) return;
    const job = current;
    current = null;
    teardown();
    job.reject(
      new Error(
        event && event.message ? event.message : 'The picture worker stopped'
      )
    );
  }

  /**
   * Trace a picture. A second call supersedes the first: the worker in flight
   * is terminated and its promise rejects with reason 'superseded', so a fast
   * slider never queues work behind work nobody is waiting for any more.
   *
   * @param {{width: number, height: number, data: Uint8ClampedArray}} imageData
   * @param {object|null} ink
   * @param {object} [opts]
   * @param {Function} [opts.onStage] - Called with {stage, index, total}
   * @param {object} [opts.tracerOverrides]
   * @param {string} [opts.engine] - 'potrace' (the default, DEFAULT_TRACE_ENGINE)
   *   or 'imagetracer'. Potrace draws in one color, so it can only answer for
   *   the ink modes; the result says which engine actually ran.
   * @param {object} [opts.potraceOverrides]
   * @returns {Promise<{svg: string, summary: object|null, engine: string}>}
   */
  function start(imageData, ink, opts = {}) {
    if (current) settleCancelled('superseded');

    const id = nextId++;
    worker = createWorker();
    worker.onmessage = handleMessage;
    worker.onerror = handleError;

    const promise = new Promise((resolve, reject) => {
      current = { id, resolve, reject, onStage: opts.onStage || null };
    });

    // ★ A COPY is transferred, never the caller's own buffer.
    //
    // Transferring the caller's buffer DETACHES it, and the file control keeps
    // its decoded pixels on purpose, so that changing an ink setting re-traces
    // the same picture instead of re-reading the file. MEASURED the other way
    // round first: the trace worked once, and then every re-run died with
    // "DataCloneError: ArrayBuffer at index 0 is already detached" - so Convert
    // again, and every slider, was a dead end.
    //
    // One copy of the source is the price, and it is the right one: about 8 MB
    // for a 2 MP picture against a trace measured in seconds, and what the
    // worker then owns outright for the whole job, so nothing is copied again
    // inside it.
    const buffer = imageData.data.slice().buffer;

    worker.postMessage(
      {
        id,
        image: {
          width: imageData.width,
          height: imageData.height,
          buffer,
        },
        ink: ink || null,
        tracerOverrides: opts.tracerOverrides || null,
        engine: opts.engine || DEFAULT_TRACE_ENGINE,
        potraceOverrides: opts.potraceOverrides || null,
      },
      [buffer]
    );

    return promise;
  }

  return {
    start,
    /** Stop whatever is running. Safe to call when nothing is. */
    cancel: () => settleCancelled('cancelled'),
    isRunning: () => current !== null,
    /** Let the runner go; used when the control that owns it is destroyed. */
    destroy: () => {
      current = null;
      teardown();
    },
  };
}
