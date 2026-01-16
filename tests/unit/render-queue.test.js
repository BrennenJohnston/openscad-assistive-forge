import { describe, it, expect, beforeEach, vi } from 'vitest'
import { RenderQueue } from '../../src/js/render-queue.js'

describe('RenderQueue', () => {
  let renderController
  let queue

  beforeEach(() => {
    renderController = {
      render: vi.fn().mockResolvedValue({ data: new ArrayBuffer(2), stats: { triangles: 5 } })
    }
    queue = new RenderQueue(renderController, { maxQueueSize: 2 })
    queue.setProject('cube(1);')
  })

  it('adds jobs to the queue and assigns ids', () => {
    const id = queue.addJob('Job 1', { width: 1 }, 'stl')
    const job = queue.jobs.get(id)

    expect(id).toMatch(/job-\d+/)
    expect(job.name).toBe('Job 1')
    expect(job.state).toBe('queued')
  })

  it('throws when queue exceeds max size', () => {
    queue.addJob('Job 1', { width: 1 })
    queue.addJob('Job 2', { width: 2 })
    expect(() => queue.addJob('Job 3', { width: 3 })).toThrow('Maximum 2 jobs allowed in queue')
  })

  it('removes jobs that are not rendering', () => {
    const id = queue.addJob('Job 1', { width: 1 })
    queue.removeJob(id)

    expect(queue.jobs.has(id)).toBe(false)
  })

  it('prevents removing a rendering job', async () => {
    const id = queue.addJob('Job 1', { width: 1 })
    queue.updateJob(id, { state: 'rendering' })

    expect(() => queue.removeJob(id)).toThrow('Cannot remove job that is currently rendering')
  })

  it('ignores removing unknown jobs', () => {
    expect(() => queue.removeJob('missing')).not.toThrow()
  })

  it('cancels queued jobs', () => {
    const id = queue.addJob('Job 1', { width: 1 })
    queue.cancelJob(id)

    expect(queue.jobs.get(id).state).toBe('cancelled')
  })

  it('renders a job and updates state', async () => {
    const id = queue.addJob('Job 1', { width: 1 }, 'stl')

    await queue.renderJob(id)

    const job = queue.jobs.get(id)
    expect(job.state).toBe('complete')
    expect(job.result.data).toBeDefined()
    expect(renderController.render).toHaveBeenCalled()
  })

  it('throws when no SCAD content is set', async () => {
    const emptyQueue = new RenderQueue(renderController)
    const id = emptyQueue.addJob('Job', { width: 1 })
    await expect(emptyQueue.renderJob(id)).rejects.toThrow('No SCAD content loaded')
  })

  it('marks job as error when render fails', async () => {
    renderController.render.mockRejectedValueOnce(new Error('Boom'))
    const id = queue.addJob('Job 1', { width: 1 }, 'stl')

    await expect(queue.renderJob(id)).rejects.toThrow('Boom')
    expect(queue.jobs.get(id).state).toBe('error')
  })

  it('returns early when no queued jobs exist', async () => {
    await expect(queue.processQueue()).resolves.toBeUndefined()
  })

  it('throws if queue is already processing', async () => {
    queue.isProcessing = true
    await expect(queue.processQueue()).rejects.toThrow('Queue is already processing')
  })

  it('processes queued jobs sequentially', async () => {
    const id1 = queue.addJob('Job 1', { width: 1 }, 'stl')
    const id2 = queue.addJob('Job 2', { width: 2 }, 'stl')
    queue.cancelJob(id2)

    const listener = vi.fn()
    queue.subscribe(listener)

    await queue.processQueue()

    expect(queue.jobs.get(id1).state).toBe('complete')
    expect(queue.jobs.get(id2).state).toBe('cancelled')
    expect(listener).toHaveBeenCalledWith('processing-start', { total: 1 })
    expect(listener).toHaveBeenCalledWith('processing-complete', { completed: 1, failed: 0 })
  })

  it('stops processing when requested', () => {
    const listener = vi.fn()
    queue.subscribe(listener)
    queue.isProcessing = true

    queue.stopProcessing()

    expect(queue.isProcessing).toBe(false)
    expect(listener).toHaveBeenCalledWith('processing-stopped', {})
  })

  it('allows subscribing and unsubscribing listeners', () => {
    const listener = vi.fn()
    const unsubscribe = queue.subscribe(listener)

    queue.addJob('Job 1', { width: 1 })
    expect(listener).toHaveBeenCalled()

    listener.mockClear()
    unsubscribe()

    queue.addJob('Job 2', { width: 2 })
    expect(listener).not.toHaveBeenCalled()
  })
})
