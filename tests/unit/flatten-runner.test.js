import { describe, it, expect, beforeEach } from 'vitest'

/**
 * DP-37 P2: the runner that owns the flatten worker.
 *
 * The worker is faked here so cancelling, superseding and a dead worker can be
 * driven at will. What is pinned is not that a flatten returns an SVG - the
 * flatten itself is tested in relief-flatten.test.js against the real ring
 * engine - but that a person who presses Cancel gets the page back, that a
 * second press never delivers the answer to a question nobody is asking any
 * more, and that the caller's own shapes come back untouched so a re-run does
 * not have to re-read anything.
 */

const { createFlattenRunner, FlattenCancelled } = await import(
  '../../src/js/flatten-runner.js'
)

/** A worker that does nothing until the test tells it to answer. */
class FakeWorker {
  constructor() {
    this.posted = []
    this.terminated = false
    this.onmessage = null
    this.onerror = null
    FakeWorker.instances.push(this)
  }

  postMessage(message) {
    this.posted.push(message)
  }

  terminate() {
    this.terminated = true
  }

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

const runner = () =>
  createFlattenRunner({ createWorker: () => new FakeWorker() })

const latest = () => FakeWorker.instances[FakeWorker.instances.length - 1]

const shapes = (n = 3) =>
  Array.from({ length: n }, (_, i) => ({
    pathData: `M${i} 0L${i + 1} 0L${i + 1} 1Z`,
    role: i === 0 ? 'foreground' : 'hole',
    element: { tagName: 'path' },
    luminance: 0,
  }))

const META = { viewBox: '0 0 10 10', width: '10', height: '10' }

describe('the flatten runner (DP-37 P2)', () => {
  beforeEach(() => {
    FakeWorker.instances = []
  })

  it('resolves with the combined drawing and whatever it had to warn about', async () => {
    const r = runner()
    const promise = r.start(shapes(), META)
    const w = latest()
    w.reply({
      id: w.jobId,
      type: 'done',
      svg: '<svg/>',
      warnings: ['1 cut-out(s) would have erased the whole drawing'],
      ms: 412.5,
    })
    await expect(promise).resolves.toEqual({
      svg: '<svg/>',
      warnings: ['1 cut-out(s) would have erased the whole drawing'],
      ms: 412.5,
    })
  })

  it('★ carries what the union COST, which is what the budget learns from', async () => {
    // DP-37 P3: the caller predicts the next combine from the last one it
    // measured, so a reply with no timing in it has to come back as null
    // rather than as a zero somebody could divide by and believe.
    const r = runner()
    const timed = r.start(shapes(), META)
    let w = latest()
    w.reply({ id: w.jobId, type: 'done', svg: '<svg/>', ms: 87.25 })
    await expect(timed).resolves.toMatchObject({ ms: 87.25 })

    const untimed = r.start(shapes(), META)
    w = latest()
    w.reply({ id: w.jobId, type: 'done', svg: '<svg/>' })
    await expect(untimed).resolves.toMatchObject({ ms: null })
  })

  it('★ sends only what the flatten reads, because the rest cannot be cloned', () => {
    // A classified element carries its DOM node. structuredClone throws on one,
    // so posting the elements whole would fail at the boundary rather than in
    // any test that stubs the worker - which is exactly the kind of defect that
    // only shows up in a browser.
    const r = runner()
    // Every promise this file creates is CLAIMED. A cancelled job rejects, and
    // a rejection nobody is holding is an unhandled rejection - which passes
    // locally and fails the whole file on CI, where the timing differs. DP-34
    // learned this the hard way in the trace runner's tests.
    const promise = r.start(shapes(2), META)
    const settled = expect(promise).rejects.toMatchObject({
      reason: 'cancelled',
    })
    const sent = latest().posted[0]
    expect(sent.elements).toEqual([
      { pathData: 'M0 0L1 0L1 1Z', role: 'foreground' },
      { pathData: 'M1 0L2 0L2 1Z', role: 'hole' },
    ])
    expect(sent.svgMeta).toEqual(META)
    r.cancel()
    return settled
  })

  it("★ leaves the caller's own shapes alone, so a re-run needs no re-read", () => {
    const els = shapes(2)
    const before = els.map((el) => ({ ...el }))
    const r = runner()
    const promise = r.start(els, META)
    expect(els).toEqual(before)
    r.cancel()
    return expect(promise).rejects.toBeInstanceOf(FlattenCancelled)
  })

  it('reports the one stage it has', async () => {
    const seen = []
    const r = runner()
    const promise = r.start(shapes(), META, { onStage: (s) => seen.push(s.stage) })
    const w = latest()
    w.reply({ id: w.jobId, type: 'stage', stage: 'combining' })
    w.reply({ id: w.jobId, type: 'done', svg: '<svg/>' })
    await promise
    expect(seen).toEqual(['combining'])
  })

  it('★ cancel terminates the worker and rejects, at any moment', async () => {
    const r = runner()
    const promise = r.start(shapes(), META)
    const w = latest()
    w.reply({ id: w.jobId, type: 'stage', stage: 'combining' })
    expect(r.isRunning()).toBe(true)

    r.cancel()

    expect(w.terminated).toBe(true)
    expect(r.isRunning()).toBe(false)
    await expect(promise).rejects.toBeInstanceOf(FlattenCancelled)
    await expect(promise).rejects.toMatchObject({ reason: 'cancelled' })
  })

  it('★ names WHY a job ended, because the pane answers the three differently', async () => {
    // A person's Cancel says so and offers the render again; a job replaced by
    // a newer one must not touch the pane at all, because the newer one owns
    // it; a job abandoned because the choices changed under it has already
    // been spoken for by whoever changed them. One reason, three states.
    const r = runner()
    const abandoned = r.start(shapes(), META)
    const w = latest()
    r.cancel('stale')
    expect(w.terminated).toBe(true)
    await expect(abandoned).rejects.toMatchObject({ reason: 'stale' })
    await expect(abandoned).rejects.toThrow(/changed under it/)

    const dropped = r.start(shapes(), META)
    r.cancel('closed')
    await expect(dropped).rejects.toMatchObject({ reason: 'closed' })
    await expect(dropped).rejects.toThrow(/the editor closed/)

    // And the default is still the person's own Cancel.
    const stopped = r.start(shapes(), META)
    r.cancel()
    await expect(stopped).rejects.toMatchObject({ reason: 'cancelled' })
  })

  it('cancel on an idle runner does nothing and does not throw', () => {
    const r = runner()
    expect(() => r.cancel()).not.toThrow()
    expect(r.isRunning()).toBe(false)
  })

  it('★ a new start supersedes the one in flight rather than queueing behind it', async () => {
    const r = runner()
    const first = r.start(shapes(), META)
    const firstWorker = latest()
    const second = r.start(shapes(), META)
    const secondWorker = latest()

    expect(firstWorker).not.toBe(secondWorker)
    expect(firstWorker.terminated).toBe(true)
    await expect(first).rejects.toMatchObject({ reason: 'superseded' })

    secondWorker.reply({ id: secondWorker.jobId, type: 'done', svg: '<svg/>' })
    await expect(second).resolves.toMatchObject({ svg: '<svg/>' })
  })

  it('★ drops a reply from a job that is no longer the one in flight', async () => {
    const r = runner()
    const first = r.start(shapes(), META)
    const firstId = latest().jobId
    const second = r.start(shapes(), META)
    const w = latest()
    await expect(first).rejects.toBeInstanceOf(FlattenCancelled)

    // The ghost: the superseded job answers late.
    w.reply({ id: firstId, type: 'done', svg: '<ghost/>' })
    expect(r.isRunning()).toBe(true)

    w.reply({ id: w.jobId, type: 'done', svg: '<real/>' })
    await expect(second).resolves.toMatchObject({ svg: '<real/>' })
  })

  it('a drawing with nothing to combine comes back as null, not as a failure', async () => {
    // flattenWithRings returns null when there is no foreground. That is an
    // answer about the drawing, not an error, and the caller tells the person
    // so in its own words.
    const r = runner()
    const promise = r.start(shapes(), META)
    const w = latest()
    w.reply({ id: w.jobId, type: 'done', svg: null, warnings: [], ms: 1.5 })
    await expect(promise).resolves.toEqual({ svg: null, warnings: [], ms: 1.5 })
  })

  it('a worker error rejects with the message and drops the worker', async () => {
    const r = runner()
    const promise = r.start(shapes(), META)
    const w = latest()
    w.reply({ id: w.jobId, type: 'error', message: 'the engine would not load' })
    await expect(promise).rejects.toThrow('the engine would not load')
    expect(w.terminated).toBe(true)
    expect(r.isRunning()).toBe(false)
  })

  it('a worker that dies outright rejects rather than hanging', async () => {
    const r = runner()
    const promise = r.start(shapes(), META)
    latest().fail('worker died')
    await expect(promise).rejects.toThrow('worker died')
  })

  it('destroy lets the worker go without rejecting into nowhere', () => {
    const r = runner()
    r.start(shapes(), META)
    const w = latest()
    r.destroy()
    expect(w.terminated).toBe(true)
    expect(r.isRunning()).toBe(false)
  })
})
