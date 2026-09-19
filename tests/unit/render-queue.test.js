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

  describe('Constructor', () => {
    it('initializes with default options', () => {
      const q = new RenderQueue(renderController)
      
      expect(q.maxQueueSize).toBe(20)
      expect(q.jobs.size).toBe(0)
      expect(q.isProcessing).toBe(false)
    })

    it('initializes with custom options', () => {
      const q = new RenderQueue(renderController, { maxQueueSize: 5 })
      
      expect(q.maxQueueSize).toBe(5)
    })
  })

  describe('Project Setup', () => {
    it('sets project with all parameters', () => {
      const files = new Map([['main.scad', 'cube(10);']])
      const libraries = [{ id: 'BOSL2', path: '/lib/BOSL2' }]
      
      queue.setProject('cube(10);', files, 'main.scad', libraries)
      
      expect(queue.scadContent).toBe('cube(10);')
      expect(queue.projectFiles).toBe(files)
      expect(queue.mainFile).toBe('main.scad')
      expect(queue.libraries).toEqual(libraries)
    })

    it('handles non-array libraries', () => {
      queue.setProject('cube(10);', null, null, 'not an array')
      
      expect(queue.libraries).toEqual([])
    })
  })

  describe('Job Management', () => {
    it('adds jobs to the queue and assigns ids', () => {
      const id = queue.addJob('Job 1', { width: 1 }, 'stl')
      const job = queue.jobs.get(id)

      expect(id).toMatch(/job-\d+/)
      expect(job.name).toBe('Job 1')
      expect(job.state).toBe('queued')
    })

    it('assigns default name when not provided', () => {
      const id = queue.addJob(null, { width: 1 })
      const job = queue.jobs.get(id)
      
      expect(job.name).toBe('Job 1')
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

    it('does not cancel non-queued jobs', () => {
      const id = queue.addJob('Job 1', { width: 1 })
      queue.updateJob(id, { state: 'complete' })
      
      queue.cancelJob(id)
      
      expect(queue.jobs.get(id).state).toBe('complete')
    })

    it('updates job properties', () => {
      const id = queue.addJob('Job 1', { width: 1 })
      
      queue.updateJob(id, { name: 'Updated Name', state: 'rendering' })
      
      const job = queue.jobs.get(id)
      expect(job.name).toBe('Updated Name')
      expect(job.state).toBe('rendering')
    })

    it('ignores update for unknown job', () => {
      // Should not throw
      expect(() => queue.updateJob('unknown', { name: 'Test' })).not.toThrow()
    })

    it('renames a job', () => {
      const id = queue.addJob('Job 1', { width: 1 })
      
      queue.renameJob(id, 'New Name')
      
      expect(queue.jobs.get(id).name).toBe('New Name')
    })

    it('updates job parameters', () => {
      const id = queue.addJob('Job 1', { width: 1 })
      queue.updateJob(id, { state: 'complete' })
      
      queue.updateJobParameters(id, { width: 20, height: 10 })
      
      const job = queue.jobs.get(id)
      expect(job.parameters).toEqual({ width: 20, height: 10 })
      expect(job.state).toBe('queued')
      expect(job.result).toBeNull()
    })

    it('updates job format', () => {
      const id = queue.addJob('Job 1', { width: 1 }, 'stl')
      queue.updateJob(id, { state: 'complete' })
      
      queue.updateJobFormat(id, 'obj')
      
      const job = queue.jobs.get(id)
      expect(job.outputFormat).toBe('obj')
      expect(job.state).toBe('queued')
    })
  })

  describe('Job Rendering', () => {
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

    it('throws when job not found', async () => {
      await expect(queue.renderJob('unknown')).rejects.toThrow('Job unknown not found')
    })

    it('sets currentJobId during render', async () => {
      const id = queue.addJob('Job 1', { width: 1 })
      
      const renderPromise = queue.renderJob(id)
      
      // During render, currentJobId should be set
      expect(queue.currentJobId).toBe(id)
      
      await renderPromise
      
      // After render, currentJobId should be cleared
      expect(queue.currentJobId).toBeNull()
    })

    it('records render time', async () => {
      const id = queue.addJob('Job 1', { width: 1 })
      
      await queue.renderJob(id)
      
      const job = queue.jobs.get(id)
      expect(job.renderTime).toBeGreaterThanOrEqual(0)
    })
  })

  describe('Queue Processing', () => {
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

    it('counts failed jobs during processing', async () => {
      renderController.render
        .mockResolvedValueOnce({ data: new ArrayBuffer(2), stats: {} })
        .mockRejectedValueOnce(new Error('Failed'))
      
      queue.maxQueueSize = 5
      queue.addJob('Job 1', { width: 1 })
      queue.addJob('Job 2', { width: 2 })
      
      const listener = vi.fn()
      queue.subscribe(listener)
      
      await queue.processQueue()
      
      expect(listener).toHaveBeenCalledWith('processing-complete', { completed: 1, failed: 1 })
    })
  })

  describe('Subscription', () => {
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

    it('notifies listeners on job update', () => {
      const listener = vi.fn()
      queue.subscribe(listener)
      
      const id = queue.addJob('Job 1', { width: 1 })
      listener.mockClear()
      
      queue.updateJob(id, { name: 'Updated' })
      
      expect(listener).toHaveBeenCalledWith('update', expect.objectContaining({ name: 'Updated' }))
    })

    it('notifies listeners on job remove', () => {
      const listener = vi.fn()
      queue.subscribe(listener)
      
      const id = queue.addJob('Job 1', { width: 1 })
      listener.mockClear()
      
      queue.removeJob(id)
      
      expect(listener).toHaveBeenCalledWith('remove', expect.objectContaining({ id }))
    })
  })

  describe('Getters', () => {
    it('returns all jobs', () => {
      queue.addJob('Job 1', { width: 1 })
      queue.addJob('Job 2', { width: 2 })
      
      const jobs = queue.getAllJobs()
      
      expect(jobs).toHaveLength(2)
    })

    it('gets job by id', () => {
      const id = queue.addJob('Job 1', { width: 1 })
      
      const job = queue.getJob(id)
      
      expect(job.name).toBe('Job 1')
    })

    it('returns null for unknown job', () => {
      const job = queue.getJob('unknown')
      
      expect(job).toBeNull()
    })

    it('returns job count', () => {
      queue.addJob('Job 1', { width: 1 })
      queue.addJob('Job 2', { width: 2 })
      
      expect(queue.getJobCount()).toBe(2)
    })

    it('checks max capacity', () => {
      expect(queue.isAtMaxCapacity()).toBe(false)
      
      queue.addJob('Job 1', { width: 1 })
      queue.addJob('Job 2', { width: 2 })
      
      expect(queue.isAtMaxCapacity()).toBe(true)
    })

    it('checks if processing', () => {
      expect(queue.isQueueProcessing()).toBe(false)
      
      queue.isProcessing = true
      
      expect(queue.isQueueProcessing()).toBe(true)
    })

    it('returns statistics', () => {
      const id1 = queue.addJob('Job 1', { width: 1 })
      const id2 = queue.addJob('Job 2', { width: 2 })
      queue.updateJob(id1, { state: 'complete', renderTime: 1000 })
      
      const stats = queue.getStatistics()
      
      expect(stats.total).toBe(2)
      expect(stats.queued).toBe(1)
      expect(stats.complete).toBe(1)
      expect(stats.totalRenderTime).toBe(1000)
    })
  })

  describe('Clear Operations', () => {
    it('clears all jobs', () => {
      queue.addJob('Job 1', { width: 1 })
      queue.addJob('Job 2', { width: 2 })
      
      const listener = vi.fn()
      queue.subscribe(listener)
      
      queue.clearAll()
      
      expect(queue.jobs.size).toBe(0)
      expect(listener).toHaveBeenCalledWith('clear', expect.objectContaining({ ids: expect.any(Array) }))
    })

    it('throws when clearing while processing', () => {
      queue.addJob('Job 1', { width: 1 })
      queue.isProcessing = true
      
      expect(() => queue.clearAll()).toThrow('Cannot clear queue while processing')
    })

    it('clears completed jobs only', () => {
      const id1 = queue.addJob('Job 1', { width: 1 })
      const id2 = queue.addJob('Job 2', { width: 2 })
      queue.updateJob(id1, { state: 'complete' })
      
      queue.clearCompleted()
      
      expect(queue.jobs.size).toBe(1)
      expect(queue.jobs.has(id2)).toBe(true)
    })

    it('clears error and cancelled jobs too', () => {
      const id1 = queue.addJob('Job 1', { width: 1 })
      const id2 = queue.addJob('Job 2', { width: 2 })
      queue.updateJob(id1, { state: 'error' })
      queue.updateJob(id2, { state: 'cancelled' })
      
      queue.clearCompleted()
      
      expect(queue.jobs.size).toBe(0)
    })
  })

  describe('Export/Import', () => {
    it('exports queue state', () => {
      queue.addJob('Job 1', { width: 1 })
      queue.addJob('Job 2', { width: 2 })
      
      const exported = queue.exportQueue()
      
      expect(exported.jobs).toHaveLength(2)
      expect(exported.version).toBe('1.0.0')
      expect(exported.timestamp).toBeDefined()
    })

    it('imports queued jobs only', () => {
      queue.maxQueueSize = 5
      const data = {
        jobs: [
          { id: 'job-1', name: 'Imported 1', parameters: { width: 10 }, outputFormat: 'stl', state: 'queued' },
          { id: 'job-2', name: 'Imported 2', parameters: { width: 20 }, outputFormat: 'stl', state: 'complete' }
        ]
      }
      
      queue.importQueue(data)
      
      // Only queued jobs are imported, complete jobs are skipped
      expect(queue.jobs.size).toBe(1)
    })

    it('adds to existing jobs on import', () => {
      queue.maxQueueSize = 5
      queue.addJob('Existing', { width: 1 })
      
      const data = {
        jobs: [{ id: 'job-1', name: 'New', parameters: {}, outputFormat: 'stl', state: 'queued' }]
      }
      
      queue.importQueue(data)
      
      // Import adds to existing jobs
      expect(queue.jobs.size).toBe(2)
    })

    it('throws on invalid import data', () => {
      expect(() => queue.importQueue({})).toThrow('Invalid queue data format')
      expect(() => queue.importQueue({ jobs: 'not array' })).toThrow('Invalid queue data format')
    })

    it('respects max queue size on import', () => {
      const data = {
        jobs: [
          { id: 'job-1', name: 'Job 1', parameters: {}, outputFormat: 'stl', state: 'queued' },
          { id: 'job-2', name: 'Job 2', parameters: {}, outputFormat: 'stl', state: 'queued' },
          { id: 'job-3', name: 'Job 3', parameters: {}, outputFormat: 'stl', state: 'queued' }
        ]
      }
      
      queue.importQueue(data)
      
      // maxQueueSize is 2, so only 2 jobs should be imported
      expect(queue.jobs.size).toBe(2)
    })
  })
})
