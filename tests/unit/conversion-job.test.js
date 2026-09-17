/**
 * The conversion job (DP-52 P1): one conversion as stages a person can watch,
 * with a Cancel that lands between them.
 *
 * The runner is faked: `start` returns a promise the test settles, `cancel`
 * records the call and rejects the promise the way the real runner does.
 * @license GPL-3.0-or-later
 */
import { describe, it, expect, vi } from 'vitest';
import {
  createConversionJob,
  CONVERSION_STAGES,
} from '../../src/js/conversion-job.js';
import { TraceCancelled } from '../../src/js/trace-runner.js';

function fakeRunner() {
  const runner = {
    calls: [],
    cancelled: 0,
    pending: null,
    start: vi.fn((imageData, settings, opts) => {
      runner.calls.push({ imageData, settings, opts });
      return new Promise((resolve, reject) => {
        runner.pending = { resolve, reject, opts };
      });
    }),
    cancel: vi.fn(() => {
      runner.cancelled += 1;
      if (runner.pending) {
        runner.pending.reject(new TraceCancelled('cancelled'));
        runner.pending = null;
      }
    }),
  };
  return runner;
}

/** Yields the test can count and release one at a time. */
function manualYield() {
  const waiting = [];
  const fn = vi.fn(() => new Promise((resolve) => waiting.push(resolve)));
  fn.release = () => {
    const next = waiting.shift();
    if (next) next();
  };
  fn.waiting = () => waiting.length;
  return fn;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('the conversion job (DP-52)', () => {
  it('names five stages in order, the worker\'s three first', () => {
    expect(CONVERSION_STAGES).toEqual([
      'reading',
      'ink',
      'tracing',
      'preparing',
      'updating',
    ]);
  });

  it('refuses to exist without a runner', () => {
    expect(() => createConversionJob({})).toThrow(/runner/);
  });

  it('★ reports every stage as the page enters it, numbered across the whole job', async () => {
    const runner = fakeRunner();
    const stages = [];
    const job = createConversionJob({
      runner,
      onStage: (s) => stages.push(s),
      yieldToPage: () => Promise.resolve(),
    });
    const prepare = vi.fn(async (traced) => ({ prepared: traced.svg }));
    const update = vi.fn(async (prepared) => ({ done: prepared.prepared }));

    const result = job.run({
      imageData: { width: 1, height: 1, data: new Uint8ClampedArray(4) },
      settings: { mode: 'lineart' },
      traceOptions: { engine: 'potrace' },
      prepare,
      update,
    });
    expect(job.isRunning()).toBe(true);
    // The runner got the settings and the options, plus the job's own onStage.
    expect(runner.calls[0].settings).toEqual({ mode: 'lineart' });
    expect(runner.calls[0].opts.engine).toBe('potrace');

    // The worker's own stage messages pass through, re-numbered.
    runner.pending.opts.onStage({ stage: 'ink', index: 1, total: 3 });
    runner.pending.opts.onStage({ stage: 'tracing', index: 2, total: 3 });
    runner.pending.resolve({ svg: '<svg/>', summary: null });

    await expect(result).resolves.toEqual({ done: '<svg/>' });
    expect(prepare).toHaveBeenCalledWith({ svg: '<svg/>', summary: null });
    expect(update).toHaveBeenCalledWith({ prepared: '<svg/>' });
    expect(stages).toEqual([
      { stage: 'reading', index: 0, total: 5 },
      { stage: 'ink', index: 1, total: 5 },
      { stage: 'tracing', index: 2, total: 5 },
      { stage: 'preparing', index: 3, total: 5 },
      { stage: 'updating', index: 4, total: 5 },
    ]);
    expect(job.isRunning()).toBe(false);
  });

  it('★ yields to the page before each main-thread stage, so a paint and a click can happen', async () => {
    const runner = fakeRunner();
    const pause = manualYield();
    const order = [];
    const job = createConversionJob({
      runner,
      onStage: (s) => order.push(`stage:${s.stage}`),
      yieldToPage: pause,
    });
    const result = job.run({
      imageData: {},
      settings: null,
      prepare: () => {
        order.push('prepare');
        return 'p';
      },
      update: () => {
        order.push('update');
        return 'u';
      },
    });
    runner.pending.resolve({ svg: '<svg/>' });
    await flush();
    // The trace is back, and the job is waiting on its first yield: nothing
    // of the main-thread work has run yet.
    expect(pause).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['stage:reading']);
    pause.release();
    await flush();
    expect(order).toEqual(['stage:reading', 'stage:preparing', 'prepare']);
    expect(pause).toHaveBeenCalledTimes(2);
    pause.release();
    await expect(result).resolves.toBe('u');
    expect(order).toEqual([
      'stage:reading',
      'stage:preparing',
      'prepare',
      'stage:updating',
      'update',
    ]);
  });

  it('★ Cancel during the worker stops the worker and nothing after it runs', async () => {
    const runner = fakeRunner();
    const prepare = vi.fn();
    const update = vi.fn();
    const job = createConversionJob({ runner, yieldToPage: () => Promise.resolve() });
    const result = job.run({ imageData: {}, settings: null, prepare, update });
    job.cancel();
    await expect(result).rejects.toBeInstanceOf(TraceCancelled);
    await expect(result).rejects.toMatchObject({ reason: 'cancelled' });
    expect(runner.cancel).toHaveBeenCalledTimes(1);
    expect(prepare).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(job.isRunning()).toBe(false);
  });

  it('★ Cancel after the worker lands at the next checkpoint: the drawing is never emitted', async () => {
    const runner = fakeRunner();
    const pause = manualYield();
    const update = vi.fn();
    const job = createConversionJob({ runner, yieldToPage: pause });
    const result = job.run({
      imageData: {},
      settings: null,
      prepare: () => 'prepared',
      update,
    });
    runner.pending.resolve({ svg: '<svg/>' });
    await flush();
    // The worker is done; the person presses Cancel while the page prepares.
    job.cancel();
    pause.release();
    await expect(result).rejects.toBeInstanceOf(TraceCancelled);
    expect(update).not.toHaveBeenCalled();
    expect(job.isRunning()).toBe(false);
  });

  it('Cancel during prepare stops before the emit', async () => {
    const runner = fakeRunner();
    const pause = manualYield();
    const update = vi.fn();
    let job;
    const result = (job = createConversionJob({ runner, yieldToPage: pause })).run({
      imageData: {},
      settings: null,
      prepare: () => {
        // The person presses Cancel while the rows are being built.
        job.cancel();
        return 'prepared';
      },
      update,
    });
    runner.pending.resolve({ svg: '<svg/>' });
    await flush();
    pause.release();
    await flush();
    pause.release();
    await expect(result).rejects.toBeInstanceOf(TraceCancelled);
    expect(update).not.toHaveBeenCalled();
  });

  it('a runner failure is the job\'s failure, and the job is over', async () => {
    const runner = fakeRunner();
    const job = createConversionJob({ runner, yieldToPage: () => Promise.resolve() });
    const result = job.run({
      imageData: {},
      settings: null,
      prepare: () => 'p',
      update: () => 'u',
    });
    runner.pending.reject(new Error('The picture worker stopped'));
    await expect(result).rejects.toThrow('The picture worker stopped');
    expect(job.isRunning()).toBe(false);
  });

  it('runs one conversion at a time', async () => {
    const runner = fakeRunner();
    const job = createConversionJob({ runner, yieldToPage: () => Promise.resolve() });
    const first = job.run({ imageData: {}, settings: null, prepare: () => 1, update: () => 1 });
    await expect(
      job.run({ imageData: {}, settings: null, prepare: () => 2, update: () => 2 })
    ).rejects.toThrow(/already running/);
    runner.pending.resolve({ svg: '' });
    await expect(first).resolves.toBe(1);
  });
});
