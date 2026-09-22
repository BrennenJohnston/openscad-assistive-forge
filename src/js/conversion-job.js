/**
 * One conversion, start to finish, as stages a person can watch and a Cancel
 * that lands between them (DP-52), inside them (DP-78), and before a drawing
 * the editor could not hold is ever prepared (DP-78, D-172).
 *
 * The trace runner already owns the worker and its three stages (reading,
 * ink, tracing), and Cancel there is `terminate()`. What came AFTER the worker
 * - the credit line, the analysis, the nesting tree, the rows and the pictures
 * of the editor, then the emit - ran on the main thread in one unbroken
 * stretch with no stage a person could read and no moment a Cancel could land.
 * The label a person watched was painted from the worker's last message, so
 * it stood still at "Finding the ink" while the page did the rest.
 *
 * This job reports each stage as the page enters it, yields to the event loop
 * between the main-thread stages so a paint and a click can happen, and reads
 * a cancel flag at every yield. It owns no DOM: the host hands it the
 * main-thread steps as functions, and a dialog listens to `onStage`.
 *
 * ★ D-171 (DP-77, MEASURED 2026-09-20): on a photograph of a printed symbol
 * the "Preparing the drawing" stage was ONE task of 5.1 s on a 4x-throttled
 * CPU (the credit line, the parse, the nesting tree) and "Updating the charm"
 * another of 6.0 s (the emit), so a Cancel click could not land for two
 * seconds and the job finished with the drawing emitted. And the stage label
 * was written at the START of that task and painted only when it ENDED, so
 * the dialog read "Finding the ink" for the whole of preparing. Three things
 * changed for that:
 *
 *   - `refuse` runs first, before any main-thread work: a host that can tell
 *     from the traced text alone that the drawing is more than the editor
 *     can hold (the shape cap, D-172) says so, and the job ends there with
 *     a `TraceRefused`. Nothing is prepared, nothing is emitted.
 *   - `prepare` may be a LIST of steps; a checkpoint runs between each, and
 *     every step (and `update`) is handed the checkpoint so it can ask for one
 *     inside its own work, between the parse and the analysis, before the emit.
 *   - a PAINT follows each stage's report before its work begins, so the
 *     label is on the screen BEFORE the work it names, not after. A plain
 *     macrotask is not enough for that: the browser paints at the next frame,
 *     and a task that starts before the frame holds the paint until it ends.
 *     So the job waits for a frame (requestAnimationFrame, then a task after
 *     it) and, in a tab that gets no frames, for a tenth of a second.
 *
 * @license GPL-3.0-or-later
 */

import { TraceCancelled } from './trace-runner.js';

/** The stages, in the order a conversion passes through them. */
export const CONVERSION_STAGES = Object.freeze([
  'reading',
  'ink',
  'tracing',
  'preparing',
  'updating',
]);

/**
 * Thrown (as a rejection reason) when the host's `refuse` step turns a traced
 * drawing away before anything is prepared. Carries the sentence a person is
 * told and the traced result, so the host can still show what the worker
 * found (the colors, the count) beside the refusal.
 */
export class TraceRefused extends Error {
  constructor(sentence, traced = null) {
    super(sentence || 'Trace refused');
    this.name = 'TraceRefused';
    this.reason = 'refused';
    this.sentence = sentence || '';
    this.traced = traced;
  }
}

/** A macrotask, so a Cancel click can land. */
const defaultYield = () => new Promise((resolve) => setTimeout(resolve, 0));

/** How long to wait for a frame before going on without one (a hidden tab). */
const PAINT_WAIT_MS = 100;

/**
 * A task AFTER the next frame, so what was just written to the page is on
 * the screen before the next piece of work holds the thread.
 */
const defaultPaint = () =>
  new Promise((resolve) => {
    if (typeof requestAnimationFrame !== 'function') {
      setTimeout(resolve, 0);
      return;
    }
    const fallback = setTimeout(resolve, PAINT_WAIT_MS);
    requestAnimationFrame(() => {
      clearTimeout(fallback);
      setTimeout(resolve, 0);
    });
  });

/**
 * @param {object} deps
 * @param {{start: Function, cancel: Function}} deps.runner - A trace runner
 * @param {Function} [deps.onStage] - Called with {stage, index, total} as each
 *   stage begins; `index` counts from zero across CONVERSION_STAGES
 * @param {Function} [deps.yieldToPage] - Injected by the unit tests
 * @param {Function} [deps.yieldToPaint] - The wait after a stage's label;
 *   injected by the unit tests, and `yieldToPage` stands in when only that
 *   one is given
 * @returns {{run: Function, cancel: Function, isRunning: Function}}
 */
export function createConversionJob({
  runner,
  onStage,
  yieldToPage,
  yieldToPaint,
} = {}) {
  if (!runner || typeof runner.start !== 'function') {
    throw new Error('createConversionJob needs a trace runner');
  }
  const pause = typeof yieldToPage === 'function' ? yieldToPage : defaultYield;
  const paint =
    typeof yieldToPaint === 'function'
      ? yieldToPaint
      : typeof yieldToPage === 'function'
        ? yieldToPage
        : defaultPaint;
  let running = false;
  // false while nothing has stopped the run; otherwise why it was stopped,
  // which is the reason the run rejects with.
  let cancelled = false;
  let current = null;

  const report = (stage) => {
    if (typeof onStage !== 'function') return;
    const index = CONVERSION_STAGES.indexOf(stage);
    onStage({
      stage,
      index: index < 0 ? 0 : index,
      total: CONVERSION_STAGES.length,
    });
  };

  /**
   * Between two pieces of main-thread work: let the page breathe, then honor
   * a Cancel that arrived while the previous piece ran. Handed to every step
   * as well, so a host can put one wherever its own work has a seam.
   */
  async function checkpoint() {
    await pause();
    if (cancelled) throw new TraceCancelled(cancelled);
  }

  /**
   * After a stage's label is written: let the page paint it before the work
   * the label names begins, then honor a Cancel that arrived meanwhile.
   */
  async function painted() {
    await paint();
    if (cancelled) throw new TraceCancelled(cancelled);
  }

  /** Stop the run in flight, for the reason given. */
  function stop(reason) {
    cancelled = reason;
    if (typeof runner.cancel === 'function') runner.cancel();
  }

  /**
   * Run one conversion.
   *
   * @param {object} steps
   * @param {ImageData} steps.imageData - The picture's pixels
   * @param {object|null} steps.settings - The ink settings for the runner
   * @param {object} [steps.traceOptions] - The runner's other options
   * @param {Function} [steps.refuse] - `(traced) => string|null`, asked the
   *   moment the worker is done and before any main-thread work: a sentence
   *   refuses the drawing (the run rejects with a TraceRefused carrying it),
   *   nothing lets it through
   * @param {Function|Function[]} steps.prepare - The main-thread work after
   *   the trace: one function or a list of steps, each `(value, {checkpoint})
   *   => next`, sync or async, the first given the traced result and each
   *   after it the previous one's return. The credit line, the analysis, the
   *   editor's rows and pictures
   * @param {Function} steps.update - The emit: `(prepared, {checkpoint}) =>
   *   result`
   * @returns {Promise<*>} What `update` returned
   */
  async function run(steps) {
    if (running) {
      // D-151. A conversion asked for while one runs is the person changing
      // their mind - a setting moved, another mode chosen - and the newest
      // settings win, as the runner's own start() always had it. The one in
      // flight ends as superseded (never as a failure, never with a word),
      // and this one begins once it has let go. Refusing it lost the change:
      // "Conversion failed: A conversion is already running", and the old
      // result stood.
      stop('superseded');
      await current.catch(() => {});
    }
    running = true;
    cancelled = false;
    current = execute(steps);
    return current;
  }

  async function execute({
    imageData,
    settings,
    traceOptions,
    refuse,
    prepare,
    update,
  }) {
    try {
      report('reading');
      const traced = await runner.start(imageData, settings, {
        ...(traceOptions || {}),
        onStage: (s) => report(s && s.stage ? s.stage : 'reading'),
      });
      await checkpoint();
      if (typeof refuse === 'function') {
        const verdict = refuse(traced);
        if (verdict) throw new TraceRefused(verdict, traced);
      }
      report('preparing');
      // The label above reaches the screen at the next frame, and a task
      // that begins before the frame holds it back until the task ends
      // (D-171: "Finding the ink" stood for the whole of preparing). Wait
      // for the frame, so the stage a person reads is the one running.
      await painted();
      const list = Array.isArray(prepare) ? prepare : [prepare];
      let value = traced;
      for (let i = 0; i < list.length; i++) {
        if (i > 0) await checkpoint();
        value = await list[i](value, { checkpoint });
      }
      await checkpoint();
      report('updating');
      await painted();
      return await update(value, { checkpoint });
    } catch (err) {
      // The runner says "canceled" whatever the reason; the job knows which.
      if (
        cancelled &&
        err instanceof TraceCancelled &&
        err.reason !== cancelled
      ) {
        throw new TraceCancelled(cancelled);
      }
      throw err;
    } finally {
      running = false;
    }
  }

  return {
    run,
    /**
     * Stop the conversion. In the worker it is `terminate()`, at once; on the
     * main thread it lands at the next checkpoint, which is never further
     * away than one step of the host's own choosing.
     */
    cancel() {
      stop('cancelled');
    },
    isRunning: () => running,
  };
}
