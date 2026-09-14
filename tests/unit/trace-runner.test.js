import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * DP-34: the runner that owns the trace worker.
 *
 * The behaviour worth pinning is not that a trace returns an SVG. It is that a
 * person who presses Cancel gets the page back, that a fast slider never
 * delivers the answer to a question nobody is asking any more, and that the
 * pixels change owner instead of being copied.
 *
 * The worker is faked here so all of that can be driven deterministically; the
 * real one is exercised in tests/e2e/trace-start-cancel.spec.js.
 */

const filterForegroundPaths = vi.fn((svg) => `filtered:${svg}`)
vi.mock('../../src/js/image-import.js', () => ({
  filterForegroundPaths: (...args) => filterForegroundPaths(...args),
}))

const { createTraceRunner, TraceCancelled } = await import(
  '../../src/js/trace-runner.js'
)

/** A worker that does nothing until the test tells it to answer. */
class FakeWorker {
  constructor() {
    this.posted = []
    this.transfers = []
    this.terminated = false
    this.onmessage = null
    this.onerror = null
    FakeWorker.instances.push(this)
  }

  postMessage(message, transfer) {
    this.posted.push(message)
    this.transfers.push(transfer)
  }

  terminate() {
    this.terminated = true
  }

  /** Deliver a message as the worker would. */
  reply(data) {
    if (this.onmessage) this.onmessage({ data })
  }

  fail(message) {
    if (this.onerror) this.onerror({ message })
  }

  get jobId() {
    return this.posted[0]?.id
  }
}
FakeWorker.instances = []

function runner() {
  return createTraceRunner({ createWorker: () => new FakeWorker() })
}

const picture = (w = 4, h = 4) => ({
  width: w,
  height: h,
  data: new Uint8ClampedArray(w * h * 4),
})

const latest = () => FakeWorker.instances[FakeWorker.instances.length - 1]

describe('the trace runner (DP-34)', () => {
  beforeEach(() => {
    FakeWorker.instances = []
    filterForegroundPaths.mockClear()
  })

  it('resolves with the traced drawing and its summary', async () => {
    const r = runner()
    const promise = r.start(picture(), { mode: 'lineart' })
    const w = latest()
    w.reply({
      id: w.jobId,
      type: 'done',
      svg: '<svg/>',
      filterForeground: true,
      summary: { mode: 'lineart' },
    })
    await expect(promise).resolves.toEqual({
      svg: 'filtered:<svg/>',
      summary: { mode: 'lineart' },
      engine: 'imagetracer',
    })
  })

  it('runs filterForegroundPaths on this side, because DOMParser lives here', async () => {
    const r = runner()
    const promise = r.start(picture(), { mode: 'lineart' })
    const w = latest()
    w.reply({ id: w.jobId, type: 'done', svg: '<svg/>', filterForeground: true })
    await promise
    expect(filterForegroundPaths).toHaveBeenCalledWith('<svg/>')
  })

  it('leaves the Colours result alone, which must not be filtered', async () => {
    // filterForegroundPaths drops the lightest layer, and for a stencil the
    // lightest layer is usually the wall - a first-class part of the plan.
    const r = runner()
    const promise = r.start(picture(), { mode: 'colours' })
    const w = latest()
    w.reply({
      id: w.jobId,
      type: 'done',
      svg: '<svg id="colours"/>',
      filterForeground: false,
    })
    await expect(promise).resolves.toEqual({
      svg: '<svg id="colours"/>',
      summary: null,
      engine: 'imagetracer',
    })
    expect(filterForegroundPaths).not.toHaveBeenCalled()
  })

  it('★ asks for the engine the caller chose, and says which one answered', async () => {
    // Potrace can only answer for the ink modes, so the worker is allowed to
    // fall back - but never silently. The engine in the reply is the engine
    // that ran, not the engine that was asked for.
    const r = runner()
    const promise = r.start(picture(), { mode: 'lineart' }, {
      engine: 'potrace',
    })
    const w = latest()
    expect(w.posted[0].engine).toBe('potrace')

    w.reply({
      id: w.jobId,
      type: 'done',
      svg: '<svg/>',
      filterForeground: false,
      engine: 'imagetracer',
    })
    await expect(promise).resolves.toMatchObject({ engine: 'imagetracer' })
  })

  it('asks for imagetracer when the caller does not choose', () => {
    const r = runner()
    const promise = r.start(picture(), { mode: 'lineart' })
    expect(latest().posted[0].engine).toBe('imagetracer')
    r.cancel()
    return expect(promise).rejects.toBeInstanceOf(TraceCancelled)
  })

  it('reports each stage as it is reached', async () => {
    const seen = []
    const r = runner()
    const promise = r.start(picture(), { mode: 'lineart' }, {
      onStage: (s) => seen.push(s.stage),
    })
    const w = latest()
    w.reply({ id: w.jobId, type: 'stage', stage: 'reading', index: 0, total: 3 })
    w.reply({ id: w.jobId, type: 'stage', stage: 'ink', index: 1, total: 3 })
    w.reply({ id: w.jobId, type: 'stage', stage: 'tracing', index: 2, total: 3 })
    w.reply({ id: w.jobId, type: 'done', svg: '<svg/>', filterForeground: true })
    await promise
    expect(seen).toEqual(['reading', 'ink', 'tracing'])
  })

  it('★ cancel terminates the worker and rejects, at any moment', async () => {
    const r = runner()
    const promise = r.start(picture(), { mode: 'lineart' })
    const w = latest()
    w.reply({ id: w.jobId, type: 'stage', stage: 'tracing', index: 2, total: 3 })
    expect(r.isRunning()).toBe(true)

    r.cancel()

    expect(w.terminated).toBe(true)
    expect(r.isRunning()).toBe(false)
    await expect(promise).rejects.toBeInstanceOf(TraceCancelled)
    await expect(promise).rejects.toMatchObject({ reason: 'cancelled' })
  })

  it('cancel on an idle runner does nothing and does not throw', () => {
    const r = runner()
    expect(() => r.cancel()).not.toThrow()
    expect(r.isRunning()).toBe(false)
  })

  it('★ a new start supersedes the one in flight rather than queueing behind it', async () => {
    const r = runner()
    const first = r.start(picture(), { mode: 'lineart' })
    const firstWorker = latest()
    const second = r.start(picture(), { mode: 'silhouette' })
    const secondWorker = latest()

    expect(firstWorker).not.toBe(secondWorker)
    expect(firstWorker.terminated).toBe(true)
    await expect(first).rejects.toMatchObject({ reason: 'superseded' })

    secondWorker.reply({
      id: secondWorker.jobId,
      type: 'done',
      svg: '<svg/>',
      filterForeground: true,
    })
    await expect(second).resolves.toMatchObject({ svg: 'filtered:<svg/>' })
  })

  it('★ drops a reply from a job that is no longer the one in flight', async () => {
    const r = runner()
    const first = r.start(picture(), { mode: 'lineart' })
    const firstWorker = latest()
    const firstId = firstWorker.jobId
    const second = r.start(picture(), { mode: 'lineart' })
    const secondWorker = latest()
    await expect(first).rejects.toBeInstanceOf(TraceCancelled)

    // The ghost: the old worker answers after being superseded.
    secondWorker.reply({ id: firstId, type: 'done', svg: '<ghost/>', filterForeground: true })
    expect(r.isRunning()).toBe(true)

    secondWorker.reply({
      id: secondWorker.jobId,
      type: 'done',
      svg: '<real/>',
      filterForeground: true,
    })
    await expect(second).resolves.toMatchObject({ svg: 'filtered:<real/>' })
  })

  it('transfers the pixel buffer rather than structured-cloning it', () => {
    const r = runner()
    const pic = picture(8, 8)
    r.start(pic, { mode: 'lineart' })
    const w = latest()
    expect(w.transfers[0]).toHaveLength(1)
    expect(w.transfers[0][0]).toBe(w.posted[0].image.buffer)
    expect(w.posted[0].image.width).toBe(8)
    expect(w.posted[0].image.height).toBe(8)
  })

  it("★ leaves the caller's own pixels intact, so a re-trace is possible", async () => {
    // Transferring the caller's buffer detaches it. The file control keeps its
    // decoded pixels so that changing an ink setting re-traces the SAME
    // picture; detaching them made every re-run fail with
    // "DataCloneError: ArrayBuffer at index 0 is already detached".
    const r = runner()
    const pic = picture(8, 8)
    // Every promise this test creates is claimed. A superseded job rejects, and
    // a rejection nobody is holding is an unhandled rejection - which passed
    // here and failed the whole file on CI, where the timing differs.
    const first = r.start(pic, { mode: 'lineart' })
    const firstSettled = expect(first).rejects.toMatchObject({
      reason: 'superseded',
    })

    expect(pic.data.buffer.detached).not.toBe(true)
    expect(pic.data.length).toBe(8 * 8 * 4)
    expect(w_transferred_is_a_copy(pic)).toBe(true)

    // And a second start still works, which is the behaviour that broke.
    let second
    expect(() => {
      second = r.start(pic, { mode: 'silhouette' })
    }).not.toThrow()
    await firstSettled

    const w = latest()
    w.reply({ id: w.jobId, type: 'done', svg: '<svg/>', filterForeground: true })
    await expect(second).resolves.toMatchObject({ svg: 'filtered:<svg/>' })
  })

  function w_transferred_is_a_copy(pic) {
    return latest().posted[0].image.buffer !== pic.data.buffer
  }

  it('a worker error rejects with the message and drops the worker', async () => {
    const r = runner()
    const promise = r.start(picture(), { mode: 'lineart' })
    const w = latest()
    w.reply({ id: w.jobId, type: 'error', message: 'ink failed' })
    await expect(promise).rejects.toThrow('ink failed')
    expect(w.terminated).toBe(true)
    expect(r.isRunning()).toBe(false)
  })

  it('a worker that dies outright rejects rather than hanging', async () => {
    const r = runner()
    const promise = r.start(picture(), { mode: 'lineart' })
    latest().fail('worker died')
    await expect(promise).rejects.toThrow('worker died')
  })

  it('destroy lets the worker go without rejecting into nowhere', () => {
    const r = runner()
    r.start(picture(), { mode: 'lineart' })
    const w = latest()
    r.destroy()
    expect(w.terminated).toBe(true)
    expect(r.isRunning()).toBe(false)
  })
})
