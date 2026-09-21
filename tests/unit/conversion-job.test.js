/**
 * The conversion job (DP-52 P1): one conversion as stages a person can watch,
 * with a Cancel that lands between them; and since DP-78 a refusal before any
 * main-thread work, prepare as a list of checkpointed steps, a checkpoint the
 * host can call inside its own work, and a paint before each stage's work.
 *
 * The runner is faked: `start` returns a promise the test settles, `cancel`
 * records the call and rejects the promise the way the real runner does.
 * @license GPL-3.0-or-later
 */
import { describe, it, expect, vi } from 'vitest';
import {
  createConversionJob,
  CONVERSION_STAGES,
  TraceRefused,
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

/** Release every yield as it comes, until the run settles. */
async function releaseUntilSettled(pause, promise) {
  let settled = false;
  promise.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    }
  );
  for (let i = 0; i < 50 && !settled; i++) {
    pause.release();
    await flush();
  }
}

describe('the conversion job (DP-52)', () => {
  it("names five stages in order, the worker's three first", () => {
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
    // Every step and the update are handed the checkpoint beside their value.
    expect(prepare).toHaveBeenCalledWith(
      { svg: '<svg/>', summary: null },
      expect.objectContaining({ checkpoint: expect.any(Function) })
    );
    expect(update).toHaveBeenCalledWith(
      { prepared: '<svg/>' },
      expect.objectContaining({ checkpoint: expect.any(Function) })
    );
    expect(stages).toEqual([
      { stage: 'reading', index: 0, total: 5 },
      { stage: 'ink', index: 1, total: 5 },
      { stage: 'tracing', index: 2, total: 5 },
      { stage: 'preparing', index: 3, total: 5 },
      { stage: 'updating', index: 4, total: 5 },
    ]);
    expect(job.isRunning()).toBe(false);
  });

  it('★ yields before each main-thread stage AND again after its label, so the label paints before the work (D-171)', async () => {
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
    // The label is reported, and the job yields AGAIN before the work: this
    // is the wait that lets "Preparing the drawing" reach the screen. Before
    // DP-78 the work ran in the same task as the label and the label was
    // painted only when the work was over.
    expect(order).toEqual(['stage:reading', 'stage:preparing']);
    expect(pause).toHaveBeenCalledTimes(2);
    pause.release();
    await flush();
    expect(order).toEqual(['stage:reading', 'stage:preparing', 'prepare']);
    // After prepare: a checkpoint, the label, another paint, then update.
    pause.release();
    await flush();
    expect(order).toEqual([
      'stage:reading',
      'stage:preparing',
      'prepare',
      'stage:updating',
    ]);
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

  it('the wait after a label is its own yield when one is given, and it follows the label and precedes the work', async () => {
    const runner = fakeRunner();
    const order = [];
    const job = createConversionJob({
      runner,
      onStage: (s) => order.push(`stage:${s.stage}`),
      yieldToPage: () => Promise.resolve(),
      yieldToPaint: () => {
        order.push('paint');
        return Promise.resolve();
      },
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
    await expect(result).resolves.toBe('u');
    expect(order).toEqual([
      'stage:reading',
      'stage:preparing',
      'paint',
      'prepare',
      'stage:updating',
      'paint',
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
    await releaseUntilSettled(pause, result);
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
    await releaseUntilSettled(pause, result);
    await expect(result).rejects.toBeInstanceOf(TraceCancelled);
    expect(update).not.toHaveBeenCalled();
  });

  it("a runner failure is the job's failure, and the job is over", async () => {
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

  it('★ a second run supersedes the first: the first ends as superseded, the second runs (D-151)', async () => {
    const runner = fakeRunner();
    const job = createConversionJob({ runner, yieldToPage: () => Promise.resolve() });
    const first = job.run({ imageData: {}, settings: { a: 1 }, prepare: () => 1, update: () => 1 });
    const second = job.run({ imageData: {}, settings: { a: 2 }, prepare: () => 2, update: () => 2 });
    await expect(first).rejects.toMatchObject({ name: 'TraceCancelled', reason: 'superseded' });
    // The runner was stopped once, and the second trace began only after the
    // first had let go, with the second's own settings.
    expect(runner.cancelled).toBe(1);
    expect(runner.calls).toHaveLength(2);
    expect(runner.calls[1].settings).toEqual({ a: 2 });
    expect(job.isRunning()).toBe(true);
    runner.pending.resolve({ svg: '' });
    await expect(second).resolves.toBe(2);
    expect(job.isRunning()).toBe(false);
  });

  it('a Cancel pressed by a person keeps its own reason', async () => {
    const runner = fakeRunner();
    const job = createConversionJob({ runner, yieldToPage: () => Promise.resolve() });
    const run = job.run({ imageData: {}, settings: null, prepare: () => 1, update: () => 1 });
    job.cancel();
    await expect(run).rejects.toMatchObject({ name: 'TraceCancelled', reason: 'cancelled' });
    expect(job.isRunning()).toBe(false);
  });
});

describe('the refusal, the steps and the checkpoint inside (DP-78, D-171, D-172)', () => {
  it('★ a refusal ends the job before any main-thread work: no prepare, no emit, and the sentence and the trace travel with it', async () => {
    const runner = fakeRunner();
    const stages = [];
    const prepare = vi.fn();
    const update = vi.fn();
    const job = createConversionJob({
      runner,
      onStage: (s) => stages.push(s.stage),
      yieldToPage: () => Promise.resolve(),
    });
    const result = job.run({
      imageData: {},
      settings: null,
      refuse: (traced) =>
        traced.svg.length > 10 ? 'Too many shapes to work with.' : null,
      prepare,
      update,
    });
    runner.pending.resolve({
      svg: '<svg>' + 'M0,0z '.repeat(5) + '</svg>',
      summary: { mode: 'lineart' },
    });
    await expect(result).rejects.toBeInstanceOf(TraceRefused);
    await expect(result).rejects.toMatchObject({
      name: 'TraceRefused',
      reason: 'refused',
      sentence: 'Too many shapes to work with.',
      message: 'Too many shapes to work with.',
    });
    const err = await result.catch((e) => e);
    expect(err.traced.summary).toEqual({ mode: 'lineart' });
    expect(prepare).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    // The page stages were never entered: the dialog never read "Preparing".
    expect(stages).toEqual(['reading']);
    expect(job.isRunning()).toBe(false);
  });

  it('a refusal that returns nothing lets the drawing through', async () => {
    const runner = fakeRunner();
    const refuse = vi.fn(() => null);
    const job = createConversionJob({ runner, yieldToPage: () => Promise.resolve() });
    const result = job.run({
      imageData: {},
      settings: null,
      refuse,
      prepare: (traced) => traced.svg,
      update: (svg) => `emitted:${svg}`,
    });
    runner.pending.resolve({ svg: '<svg/>' });
    await expect(result).resolves.toBe('emitted:<svg/>');
    expect(refuse).toHaveBeenCalledWith({ svg: '<svg/>' });
  });

  it("★ prepare may be a list of steps, each fed the last one's result, with a checkpoint between them where a Cancel lands", async () => {
    const runner = fakeRunner();
    const pause = manualYield();
    const order = [];
    let job;
    const stepB = vi.fn();
    const update = vi.fn();
    const result = (job = createConversionJob({ runner, yieldToPage: pause })).run({
      imageData: {},
      settings: null,
      prepare: [
        (traced) => {
          order.push(`a:${traced.svg}`);
          // The person presses Cancel while the first step runs.
          job.cancel();
          return 'from-a';
        },
        (value) => {
          stepB(value);
          return 'from-b';
        },
      ],
      update,
    });
    runner.pending.resolve({ svg: 'S' });
    await flush();
    await releaseUntilSettled(pause, result);
    await expect(result).rejects.toMatchObject({ name: 'TraceCancelled', reason: 'cancelled' });
    expect(order).toEqual(['a:S']);
    // The second step never ran: the checkpoint between the two took the
    // Cancel. Before DP-78 prepare was one function and the Cancel waited
    // for all of it.
    expect(stepB).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('the steps chain their results and the update gets the last one', async () => {
    const runner = fakeRunner();
    const job = createConversionJob({ runner, yieldToPage: () => Promise.resolve() });
    const result = job.run({
      imageData: {},
      settings: null,
      prepare: [
        (traced) => `${traced.svg}+a`,
        (value) => `${value}+b`,
        async (value) => `${value}+c`,
      ],
      update: (value) => `${value}+emit`,
    });
    runner.pending.resolve({ svg: 'S' });
    await expect(result).resolves.toBe('S+a+b+c+emit');
  });

  it('★ the update can ask for a checkpoint before its emit, and a Cancel pressed by then stops the emit', async () => {
    const runner = fakeRunner();
    const pause = manualYield();
    const emit = vi.fn();
    let job;
    const result = (job = createConversionJob({ runner, yieldToPage: pause })).run({
      imageData: {},
      settings: null,
      prepare: () => 'prepared',
      update: async (value, { checkpoint }) => {
        // The data URL is built, the person presses Cancel, and the host
        // asks the job before it writes anything.
        job.cancel();
        await checkpoint();
        emit(value);
        return 'emitted';
      },
    });
    runner.pending.resolve({ svg: 'S' });
    await flush();
    await releaseUntilSettled(pause, result);
    await expect(result).rejects.toMatchObject({ name: 'TraceCancelled', reason: 'cancelled' });
    expect(emit).not.toHaveBeenCalled();
    expect(job.isRunning()).toBe(false);
  });

  it('a step can ask for a checkpoint inside its own work and go on when nothing was pressed', async () => {
    const runner = fakeRunner();
    const seen = [];
    const job = createConversionJob({ runner, yieldToPage: () => Promise.resolve() });
    const result = job.run({
      imageData: {},
      settings: null,
      prepare: async (traced, { checkpoint }) => {
        seen.push('parse');
        await checkpoint();
        seen.push('analyze');
        return traced.svg;
      },
      update: (svg) => svg,
    });
    runner.pending.resolve({ svg: 'S' });
    await expect(result).resolves.toBe('S');
    expect(seen).toEqual(['parse', 'analyze']);
  });
});
