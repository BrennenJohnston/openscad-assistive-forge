/**
 * One conversion, start to finish, as stages a person can watch and a Cancel
 * that lands between them (DP-52).
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
 * a cancel flag at every yield. It owns no DOM: the host hands it the two
 * main-thread steps as functions, and a dialog listens to `onStage`.
 *
 * MEASURED before this (DP-48 P0b and DP-52 P0, session 3): on the owner's
 * logo nothing in the conversion path comes near blocking the page (worst
 * 509 ms at 6x CPU when the rows land), so the stages are not sliced. The job
 * is about a wait that can be read and stopped, not a thread to unblock.
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

/** A macrotask, so the dialog can paint and a Cancel click can land. */
const defaultYield = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * @param {object} deps
 * @param {{start: Function, cancel: Function}} deps.runner - A trace runner
 * @param {Function} [deps.onStage] - Called with {stage, index, total} as each
 *   stage begins; `index` counts from zero across CONVERSION_STAGES
 * @param {Function} [deps.yieldToPage] - Injected by the unit tests
 * @returns {{run: Function, cancel: Function, isRunning: Function}}
 */
export function createConversionJob({ runner, onStage, yieldToPage } = {}) {
  if (!runner || typeof runner.start !== 'function') {
    throw new Error('createConversionJob needs a trace runner');
  }
  const pause = typeof yieldToPage === 'function' ? yieldToPage : defaultYield;
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
   * Between two main-thread stages: let the page breathe, then honor a Cancel
   * that arrived while the previous stage ran.
   */
  async function checkpoint() {
    await pause();
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
   * @param {Function} steps.prepare - The main-thread work after the trace:
   *   `(traced) => prepared`, sync or async. The credit line, the analysis,
   *   the editor's rows and pictures
   * @param {Function} steps.update - The emit: `(prepared) => result`
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
      report('preparing');
      const prepared = await prepare(traced);
      await checkpoint();
      report('updating');
      return await update(prepared);
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
     * main thread it lands at the next checkpoint, which is never more than
     * one stage away.
     */
    cancel() {
      stop('cancelled');
    },
    isRunning: () => running,
  };
}
