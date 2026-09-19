/**
 * Render Queue - Batch render management system
 * @license GPL-3.0-or-later
 */

/**
 * Job structure:
 * {
 *   id: string,
 *   name: string,
 *   parameters: object,
 *   outputFormat: string,
 *   result: { data: ArrayBuffer, stats: object } | null,
 *   state: 'queued' | 'rendering' | 'complete' | 'error' | 'canceled',
 *   error: string | null,
 *   timestamp: number,
 *   renderTime: number | null
 * }
 */

export class RenderQueue {
  constructor(renderController, options = {}) {
    this.renderController = renderController;
    this.maxQueueSize = options.maxQueueSize || 20;
    this.jobs = new Map(); // id -> job
    this.nextId = 1;
    this.listeners = [];
    this.scadContent = null;
    this.projectFiles = null;
    this.mainFile = null;
    this.libraries = [];
    this.isProcessing = false;
    this.currentJobId = null;
  }

  /**
   * Set the current SCAD content and project files
   */
  setProject(
    scadContent,
    projectFiles = null,
    mainFile = null,
    libraries = []
  ) {
    this.scadContent = scadContent;
    this.projectFiles = projectFiles;
    this.mainFile = mainFile;
    this.libraries = Array.isArray(libraries) ? libraries : [];
  }

  /**
   * Add a job to the queue
   * @param {string} name - Job name
   * @param {object} parameters - Parameter values
   * @param {string} outputFormat - Output format (stl, obj, etc.)
   * @returns {string} Job ID
   */
  addJob(name, parameters, outputFormat = 'stl') {
    if (this.jobs.size >= this.maxQueueSize) {
      throw new Error(`Maximum ${this.maxQueueSize} jobs allowed in queue`);
    }

    const id = `job-${this.nextId++}`;
    const job = {
      id,
      name: name || `Job ${this.jobs.size + 1}`,
      parameters: { ...parameters },
      outputFormat,
      result: null,
      state: 'queued',
      error: null,
      timestamp: Date.now(),
      renderTime: null,
    };

    this.jobs.set(id, job);
    this.notifyListeners('add', job);
    return id;
  }

  /**
   * Remove a job from the queue
   * @param {string} id - Job ID
   */
  removeJob(id) {
    const job = this.jobs.get(id);
    if (job) {
      // Can't remove currently rendering job
      if (job.state === 'rendering') {
        throw new Error('Cannot remove job that is currently rendering');
      }
      this.jobs.delete(id);
      this.notifyListeners('remove', job);
    }
  }

  /**
   * Cancel a job
   * @param {string} id - Job ID
   */
  cancelJob(id) {
    const job = this.jobs.get(id);
    if (job && job.state === 'queued') {
      this.updateJob(id, { state: 'cancelled' });
    }
  }

  /**
   * Update job properties
   * @param {string} id - Job ID
   * @param {object} updates - Properties to update
   */
  updateJob(id, updates) {
    const job = this.jobs.get(id);
    if (job) {
      Object.assign(job, updates);
      this.jobs.set(id, job);
      this.notifyListeners('update', job);
    }
  }

  /**
   * Rename a job
   * @param {string} id - Job ID
   * @param {string} name - New name
   */
  renameJob(id, name) {
    this.updateJob(id, { name });
  }

  /**
   * Update job parameters
   * @param {string} id - Job ID
   * @param {object} parameters - New parameter values
   */
  updateJobParameters(id, parameters) {
    this.updateJob(id, {
      parameters: { ...parameters },
      state: 'queued',
      result: null,
      error: null,
    });
  }

  /**
   * Change job output format
   * @param {string} id - Job ID
   * @param {string} outputFormat - New output format
   */
  updateJobFormat(id, outputFormat) {
    this.updateJob(id, {
      outputFormat,
      state: 'queued',
      result: null,
      error: null,
    });
  }

  /**
   * Render a specific job
   * @param {string} id - Job ID
   * @returns {Promise<void>}
   */
  async renderJob(id) {
    const job = this.jobs.get(id);
    if (!job) {
      throw new Error(`Job ${id} not found`);
    }

    if (job.state === 'rendering') {
      throw new Error(`Job ${id} is already rendering`);
    }

    if (!this.scadContent) {
      throw new Error('No SCAD content loaded');
    }

    // Update state to rendering
    this.currentJobId = id;
    const startTime = Date.now();
    this.updateJob(id, { state: 'rendering', error: null, renderTime: null });

    try {
      const result = await this.renderController.render(
        this.scadContent,
        job.parameters,
        {
          timeoutMs: 60000,
          outputFormat: job.outputFormat,
          files: this.projectFiles,
          mainFile: this.mainFile,
          libraries: this.libraries,
          onProgress: (percent, message) => {
            this.notifyListeners('progress', { jobId: id, percent, message });
          },
        }
      );

      const renderTime = Date.now() - startTime;

      this.updateJob(id, {
        state: 'complete',
        result: {
          data: result.data || result.stl,
          stats: result.stats,
        },
        error: null,
        renderTime,
      });

      this.currentJobId = null;
      return result;
    } catch (error) {
      this.updateJob(id, {
        state: 'error',
        error: error.message || 'Render failed',
        renderTime: null,
      });
      this.currentJobId = null;
      throw error;
    }
  }

  /**
   * Process all queued jobs
   * @returns {Promise<void>}
   */
  async processQueue() {
    if (this.isProcessing) {
      throw new Error('Queue is already processing');
    }

    const queued = Array.from(this.jobs.values()).filter(
      (job) => job.state === 'queued'
    );

    if (queued.length === 0) {
      return;
    }

    this.isProcessing = true;
    this.notifyListeners('processing-start', { total: queued.length });

    let completed = 0;
    let failed = 0;

    // Process jobs sequentially
    for (const job of queued) {
      // Skip canceled jobs
      if (job.state === 'cancelled') {
        continue;
      }

      try {
        await this.renderJob(job.id);
        completed++;
      } catch (error) {
        console.error(`Failed to render job ${job.id}:`, error);
        failed++;
        // Continue with next job
      }
    }

    this.isProcessing = false;
    this.notifyListeners('processing-complete', { completed, failed });
  }

  /**
   * Stop processing the queue
   */
  stopProcessing() {
    if (!this.isProcessing) {
      return;
    }

    this.isProcessing = false;

    // Cancel render controller if a job is currently rendering
    if (this.currentJobId) {
      this.renderController.cancel();
      this.updateJob(this.currentJobId, {
        state: 'cancelled',
        error: 'Processing stopped by user',
      });
      this.currentJobId = null;
    }

    this.notifyListeners('processing-stopped', {});
  }

  /**
   * Get a job by ID
   * @param {string} id - Job ID
   * @returns {object|null} Job object
   */
  getJob(id) {
    return this.jobs.get(id) || null;
  }

  /**
   * Get all jobs
   * @returns {Array} Array of job objects
   */
  getAllJobs() {
    return Array.from(this.jobs.values());
  }

  /**
   * Get job count
   * @returns {number}
   */
  getJobCount() {
    return this.jobs.size;
  }

  /**
   * Check if at max capacity
   * @returns {boolean}
   */
  isAtMaxCapacity() {
    return this.jobs.size >= this.maxQueueSize;
  }

  /**
   * Check if currently processing
   * @returns {boolean}
   */
  isQueueProcessing() {
    return this.isProcessing;
  }

  /**
   * Clear completed jobs
   */
  clearCompleted() {
    const completed = Array.from(this.jobs.values()).filter(
      (job) =>
        job.state === 'complete' ||
        job.state === 'error' ||
        job.state === 'cancelled'
    );

    for (const job of completed) {
      this.jobs.delete(job.id);
    }

    if (completed.length > 0) {
      this.notifyListeners('clear-completed', { count: completed.length });
    }
  }

  /**
   * Clear all jobs
   */
  clearAll() {
    if (this.isProcessing) {
      throw new Error('Cannot clear queue while processing');
    }

    const ids = Array.from(this.jobs.keys());
    this.jobs.clear();
    this.notifyListeners('clear', { ids });
  }

  /**
   * Export queue to JSON
   * @returns {object} Serializable queue data
   */
  exportQueue() {
    return {
      version: '1.0.0',
      timestamp: Date.now(),
      jobs: Array.from(this.jobs.values()).map((job) => ({
        id: job.id,
        name: job.name,
        parameters: job.parameters,
        outputFormat: job.outputFormat,
        stats: job.result?.stats || null,
        state: job.state,
        renderTime: job.renderTime,
        // Don't include result data (too large)
      })),
    };
  }

  /**
   * Import jobs from JSON
   * @param {object} data - Exported queue data
   */
  importQueue(data) {
    if (!data.jobs || !Array.isArray(data.jobs)) {
      throw new Error('Invalid queue data format');
    }

    for (const jobData of data.jobs) {
      if (this.jobs.size >= this.maxQueueSize) break;

      // Only import queued jobs (skip completed/error)
      if (jobData.state === 'queued') {
        this.addJob(jobData.name, jobData.parameters, jobData.outputFormat);
      }
    }
  }

  /**
   * Subscribe to queue changes
   * @param {Function} callback - (event, data) => void
   * @returns {Function} Unsubscribe function
   */
  subscribe(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }

  /**
   * Notify listeners of changes
   * @private
   */
  notifyListeners(event, data) {
    this.listeners.forEach((callback) => {
      try {
        callback(event, data);
      } catch (error) {
        console.error('Render queue listener error:', error);
      }
    });
  }

  /**
   * Get statistics about the queue
   * @returns {object} Statistics
   */
  getStatistics() {
    const jobs = this.getAllJobs();
    return {
      total: jobs.length,
      queued: jobs.filter((j) => j.state === 'queued').length,
      rendering: jobs.filter((j) => j.state === 'rendering').length,
      complete: jobs.filter((j) => j.state === 'complete').length,
      error: jobs.filter((j) => j.state === 'error').length,
      cancelled: jobs.filter((j) => j.state === 'cancelled').length,
      totalRenderTime: jobs
        .filter((j) => j.renderTime)
        .reduce((sum, j) => sum + j.renderTime, 0),
      averageRenderTime: (() => {
        const completed = jobs.filter((j) => j.renderTime);
        if (completed.length === 0) return 0;
        return (
          completed.reduce((sum, j) => sum + j.renderTime, 0) / completed.length
        );
      })(),
    };
  }
}
