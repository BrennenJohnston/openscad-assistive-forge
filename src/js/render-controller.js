/**
 * Render Controller - Orchestrates OpenSCAD WASM rendering
 * @license GPL-3.0-or-later
 */

/**
 * Render quality presets
 */
export const RENDER_QUALITY = {
  DRAFT: {
    name: 'draft',
    maxFn: 16, // Force a lower $fn for faster interactive preview
    forceFn: true,
    minFa: 12, // Increase $fa (min angle) to reduce tessellation
    minFs: 2, // Increase $fs (min size) to reduce tessellation
    timeoutMs: 20000, // Shorter timeout for draft preview
  },
  PREVIEW: {
    name: 'preview',
    maxFn: 24, // Cap $fn at 24 for faster preview
    forceFn: false, // Don't force $fn unless the model/user already sets it
    minFa: null,
    minFs: null,
    timeoutMs: 30000, // 30 second timeout for preview
  },
  HIGH: {
    name: 'high',
    maxFn: 64, // Higher cap for smoother preview (can be slower)
    forceFn: false,
    minFa: null,
    minFs: null,
    timeoutMs: 45000,
  },
  FULL: {
    name: 'full',
    maxFn: null, // No cap, use model's $fn
    forceFn: false,
    minFa: null,
    minFs: null,
    timeoutMs: 60000, // 60 second timeout for full render
  },
};

/**
 * Estimate render time based on SCAD content complexity
 * @param {string} scadContent - OpenSCAD source code
 * @param {Object} parameters - Current parameter values
 * @returns {Object} Estimated render info { seconds, complexity, confidence, warning }
 */
export function estimateRenderTime(scadContent, parameters = {}) {
  if (!scadContent) {
    return { seconds: 0, complexity: 0, confidence: 'unknown', warning: null };
  }

  let complexityScore = 0;
  const warnings = [];

  // Count expensive operations
  const forLoops = (scadContent.match(/for\s*\(/g) || []).length;
  const intersections = (scadContent.match(/intersection\s*\(/g) || []).length;
  const differences = (scadContent.match(/difference\s*\(/g) || []).length;
  const hulls = (scadContent.match(/hull\s*\(/g) || []).length;
  const minkowskis = (scadContent.match(/minkowski\s*\(/g) || []).length;
  const linearExtrudes = (scadContent.match(/linear_extrude\s*\(/g) || [])
    .length;
  const rotateExtrudes = (scadContent.match(/rotate_extrude\s*\(/g) || [])
    .length;
  const spheres = (scadContent.match(/sphere\s*\(/g) || []).length;
  const cylinders = (scadContent.match(/cylinder\s*\(/g) || []).length;

  // Weighted complexity scoring
  complexityScore += forLoops * 10;
  complexityScore += intersections * 20;
  complexityScore += differences * 15;
  complexityScore += hulls * 30;
  complexityScore += minkowskis * 50; // Minkowski is very expensive
  complexityScore += linearExtrudes * 8;
  complexityScore += rotateExtrudes * 12;
  complexityScore += spheres * 5;
  complexityScore += cylinders * 3;

  // Check $fn value (affects tessellation complexity)
  const fn = parameters.$fn || parameters.fn;
  if (fn !== undefined) {
    if (fn > 100) {
      complexityScore += fn * 0.8;
      warnings.push(
        `High $fn value (${fn}) may significantly increase render time`
      );
    } else if (fn > 50) {
      complexityScore += fn * 0.4;
    } else {
      complexityScore += fn * 0.2;
    }
  }

  // Warn about known expensive operations
  if (minkowskis > 0) {
    warnings.push(
      `${minkowskis} minkowski() operation(s) detected - these are very expensive`
    );
  }
  if (hulls > 2) {
    warnings.push(`Multiple hull() operations (${hulls}) may slow rendering`);
  }
  if (forLoops > 5) {
    warnings.push(`Many for loops (${forLoops}) detected`);
  }

  // Estimate time (in seconds)
  // Base time + complexity factor
  // These constants are calibrated based on typical models
  const baseTime = 2;
  const estimatedSeconds = Math.max(
    2,
    Math.round(baseTime + complexityScore * 0.15)
  );

  // Determine confidence level
  let confidence;
  if (complexityScore < 20) {
    confidence = 'high';
  } else if (complexityScore < 100) {
    confidence = 'medium';
  } else {
    confidence = 'low'; // Complex models are harder to predict
  }

  return {
    seconds: estimatedSeconds,
    complexity: complexityScore,
    confidence,
    warning: warnings.length > 0 ? warnings.join('. ') : null,
    details: {
      forLoops,
      intersections,
      differences,
      hulls,
      minkowskis,
      linearExtrudes,
      rotateExtrudes,
      spheres,
      cylinders,
    },
  };
}

/**
 * Memory warning threshold (percentage)
 */
const MEMORY_WARNING_THRESHOLD = 80;

export class RenderController {
  constructor() {
    this.worker = null;
    this.requestId = 0;
    this.currentRequest = null;
    this.ready = false;
    this.initPromise = null;
    this.renderQueue = Promise.resolve();
    this.memoryUsage = null;
    this.onMemoryWarning = null;
  }

  /**
   * Whether a render is currently in progress.
   * (Note: OpenSCAD WASM renderToStl is blocking inside the worker, so we can't truly interrupt it mid-render.)
   * @returns {boolean}
   */
  isBusy() {
    return !!this.currentRequest;
  }

  /**
   * Set callback for WASM initialization progress
   * @param {Function} callback - Called with progress updates during init
   */
  setInitProgressCallback(callback) {
    this.onInitProgress = callback;
  }

  /**
   * Initialize the Web Worker
   * @param {Object} options - Initialization options
   * @param {Function} options.onProgress - Progress callback
   * @returns {Promise<void>}
   */
  async init(options = {}) {
    if (this.initPromise) {
      return this.initPromise;
    }

    const onProgress = options.onProgress || this.onInitProgress;

    this.initPromise = new Promise((resolve, reject) => {
      try {
        // Report start of initialization
        if (onProgress) {
          onProgress(0, 'Starting OpenSCAD engine...');
        }

        // Create worker (inline URL keeps Vite worker bundling intact).
        this.worker = new Worker(
          new URL('../worker/openscad-worker.js', import.meta.url),
          { type: 'module' }
        );

        // Set up message handler
        this.worker.onmessage = (e) => {
          this.handleMessage(e.data, onProgress);
        };

        this.worker.onerror = (error) => {
          console.error('[RenderController] Worker error:', error);
          if (onProgress) {
            onProgress(-1, 'Failed to initialize: ' + error.message);
          }
          reject(error);
        };

        // Report WASM download starting
        if (onProgress) {
          onProgress(5, 'Loading WASM module (~15-30MB)...');
        }

        // Send init message
        // Asset base URL is optional - worker will derive from self.location if not provided
        this.worker.postMessage({
          type: 'INIT',
          payload: {
            // assetBaseUrl: '/', // Optional: specify if assets are served from a different origin
          },
        });

        // Set up ready handler
        this.readyResolve = resolve;
        this.readyReject = reject;

        // Timeout for initialization
        setTimeout(() => {
          if (!this.ready) {
            if (onProgress) {
              onProgress(
                -1,
                'Initialization timeout - please refresh and try again'
              );
            }
            reject(new Error('Worker initialization timeout'));
          }
        }, 60000); // 60 second timeout for init (larger WASM may take longer)
      } catch (error) {
        console.error('[RenderController] Failed to create worker:', error);
        if (onProgress) {
          onProgress(-1, 'Failed to create worker: ' + error.message);
        }
        reject(error);
      }
    });

    return this.initPromise;
  }

  /**
   * Restart the worker (workaround for OpenSCAD WASM state corruption between renders)
   * @returns {Promise<void>}
   */
  async restart() {
    this.terminate();
    this.initPromise = null;
    this.ready = false;
    await this.init();
  }

  /**
   * Handle messages from worker
   * @param {Object} message - Message from worker
   * @param {Function} onInitProgress - Optional init progress callback
   */
  handleMessage(message, onInitProgress) {
    const { type, payload } = message;

    switch (type) {
      case 'READY':
        this.ready = true;
        console.log('[RenderController] Worker ready');
        if (onInitProgress) {
          onInitProgress(100, 'OpenSCAD engine ready');
        }
        if (this.readyResolve) {
          this.readyResolve();
        }
        break;

      case 'PROGRESS':
        // Handle init progress (requestId === 'init')
        if (payload.requestId === 'init' && onInitProgress) {
          // Map init progress: 0-100 based on stages
          // Worker sends 0% at start, we map to reasonable progress
          const initPercent = Math.min(90, payload.percent + 10); // 10-90% during init
          onInitProgress(initPercent, payload.message);
        } else if (this.currentRequest && this.currentRequest.onProgress) {
          this.currentRequest.onProgress(payload.percent, payload.message);
        }
        break;

      case 'COMPLETE':
        if (
          this.currentRequest &&
          payload.requestId === this.currentRequest.id
        ) {
          // Normalize payload: add 'stl' alias for backwards compatibility with consumers
          const result = {
            ...payload,
            stl: payload.data, // Alias data as stl for backwards compatibility
          };
          this.currentRequest.resolve(result);
          this.currentRequest = null;

          // Check memory after render completes
          this.checkMemoryUsage();
        }
        break;

      case 'ERROR':
        if (
          this.currentRequest &&
          payload.requestId === this.currentRequest.id
        ) {
          this.currentRequest.reject(new Error(payload.message));
          this.currentRequest = null;
        } else if (payload.requestId === 'init' && this.readyReject) {
          this.readyReject(new Error(payload.message));
        }
        break;

      case 'MEMORY_USAGE':
        this.memoryUsage = payload;
        console.log(
          `[RenderController] Memory: ${payload.usedMB}MB / ${payload.limitMB}MB (${payload.percent}%)`
        );

        // Trigger warning callback if above threshold
        if (
          payload.percent >= MEMORY_WARNING_THRESHOLD &&
          this.onMemoryWarning
        ) {
          this.onMemoryWarning(payload);
        }

        // Resolve pending memory request if any
        if (this.memoryResolve) {
          this.memoryResolve(payload);
          this.memoryResolve = null;
        }
        break;

      default:
        console.warn('[RenderController] Unknown message type:', type);
    }
  }

  /**
   * Set callback for memory warnings
   * @param {Function} callback - Called when memory usage exceeds threshold
   */
  setMemoryWarningCallback(callback) {
    this.onMemoryWarning = callback;
  }

  /**
   * Request memory usage from worker
   * @returns {Promise<Object>} Memory usage info
   */
  async getMemoryUsage() {
    if (!this.worker || !this.ready) {
      return {
        used: 0,
        limit: 512 * 1024 * 1024,
        percent: 0,
        available: false,
      };
    }

    return new Promise((resolve) => {
      this.memoryResolve = resolve;
      this.worker.postMessage({ type: 'GET_MEMORY_USAGE' });

      // Timeout after 5 seconds
      setTimeout(() => {
        if (this.memoryResolve) {
          this.memoryResolve({
            used: 0,
            limit: 512 * 1024 * 1024,
            percent: 0,
            available: false,
          });
          this.memoryResolve = null;
        }
      }, 5000);
    });
  }

  /**
   * Check memory usage and trigger warning if needed
   */
  async checkMemoryUsage() {
    if (!this.worker || !this.ready) return;
    this.worker.postMessage({ type: 'GET_MEMORY_USAGE' });
  }

  /**
   * Apply quality settings to parameters
   * @param {Object} parameters - Original parameters
   * @param {Object} quality - Quality preset (RENDER_QUALITY.PREVIEW or RENDER_QUALITY.FULL)
   * @returns {Object} Parameters with quality adjustments
   */
  applyQualitySettings(parameters, quality) {
    const adjusted = { ...parameters };

    // Cap $fn if quality has a maxFn limit
    if (quality.maxFn !== null && adjusted.$fn !== undefined) {
      adjusted.$fn = Math.min(adjusted.$fn, quality.maxFn);
    }

    // Optionally force $fn even if the model didn't set it (useful for draft/fast previews)
    if (
      quality.maxFn !== null &&
      adjusted.$fn === undefined &&
      quality.forceFn
    ) {
      adjusted.$fn = quality.maxFn;
    }

    // $fa: smaller = smoother, larger = faster. For faster preview, enforce a minimum $fa.
    if (quality.minFa !== null && quality.minFa !== undefined) {
      if (adjusted.$fa === undefined) {
        adjusted.$fa = quality.minFa;
      } else {
        adjusted.$fa = Math.max(adjusted.$fa, quality.minFa);
      }
    }

    // $fs: smaller = smoother, larger = faster. For faster preview, enforce a minimum $fs.
    if (quality.minFs !== null && quality.minFs !== undefined) {
      if (adjusted.$fs === undefined) {
        adjusted.$fs = quality.minFs;
      } else {
        adjusted.$fs = Math.max(adjusted.$fs, quality.minFs);
      }
    }

    return adjusted;
  }

  /**
   * Render OpenSCAD to specified format
   * @param {string} scadContent - OpenSCAD source code
   * @param {Object} parameters - Parameter overrides
   * @param {Object} options - Render options
   * @param {number} options.timeoutMs - Timeout in milliseconds
   * @param {Function} options.onProgress - Progress callback
   * @param {Object} options.quality - Quality preset (optional, defaults to FULL)
   * @param {string} options.outputFormat - Output format (stl, obj, off, amf, 3mf)
   * @param {Map<string, string>} options.files - Additional files for multi-file projects
   * @param {string} options.mainFile - Main file path (for multi-file projects)
   * @param {Array<{id: string, path: string}>} options.libraries - Library bundles to mount
   * @returns {Promise<Object>} Render result with data and stats
   */
  async render(scadContent, parameters = {}, options = {}) {
    const run = async () => {
      const quality = options.quality || RENDER_QUALITY.FULL;
      const adjustedParams = this.applyQualitySettings(parameters, quality);
      const timeoutMs = options.timeoutMs || quality.timeoutMs;

      const shouldRetryOnce = (err) => {
        const msg = err?.message || String(err);
        // Pattern we see in logs: "Failed to render model: 1101176" (numeric code, no stack)
        return /^Failed to render model:\s*\d+/.test(msg);
      };

      const renderOnce = async () => {
        if (!this.ready) {
          throw new Error('Worker not ready. Call init() first.');
        }

        const requestId = `render-${++this.requestId}`;

        return new Promise((resolve, reject) => {
          this.currentRequest = {
            id: requestId,
            resolve,
            reject,
            onProgress: options.onProgress,
          };

          // Convert Map to plain object if files are provided
          const filesObject = options.files
            ? Object.fromEntries(options.files)
            : undefined;

          // Determine output format (default to stl)
          const outputFormat = options.outputFormat || 'stl';

          this.worker.postMessage({
            type: 'RENDER',
            payload: {
              requestId,
              scadContent,
              parameters: adjustedParams,
              timeoutMs,
              outputFormat,
              files: filesObject,
              mainFile: options.mainFile,
              libraries: options.libraries,
            },
          });
        });
      };

      try {
        return await renderOnce();
      } catch (err) {
        if (!shouldRetryOnce(err)) {
          throw err;
        }
        await this.restart();
        return await renderOnce();
      }
    };

    const queued = this.renderQueue.then(run, run);
    this.renderQueue = queued.catch(() => {});
    return queued;
  }

  /**
   * Render preview with reduced quality for faster feedback
   * @param {string} scadContent - OpenSCAD source code
   * @param {Object} parameters - Parameter overrides
   * @param {Object} options - Render options
   * @returns {Promise<Object>} Render result with STL data and stats
   */
  async renderPreview(scadContent, parameters = {}, options = {}) {
    const previewQuality = options.quality || RENDER_QUALITY.PREVIEW;
    return this.render(scadContent, parameters, {
      ...options,
      quality: previewQuality,
    });
  }

  /**
   * Render full quality for final export
   * @param {string} scadContent - OpenSCAD source code
   * @param {Object} parameters - Parameter overrides
   * @param {Object} options - Render options
   * @returns {Promise<Object>} Render result with STL data and stats
   */
  async renderFull(scadContent, parameters = {}, options = {}) {
    return this.render(scadContent, parameters, {
      ...options,
      quality: RENDER_QUALITY.FULL,
    });
  }

  /**
   * Cancel current render
   */
  cancel() {
    if (this.currentRequest) {
      const { id, reject } = this.currentRequest;
      this.worker.postMessage({
        type: 'CANCEL',
        payload: { requestId: id },
      });
      // Worker-side OpenSCAD render is blocking; we can't truly interrupt it mid-render.
      // But we must settle the promise to avoid leaks / hung awaits.
      reject(new Error('Render cancelled'));
      this.currentRequest = null;
    }
  }

  /**
   * Terminate the worker
   */
  terminate() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.ready = false;
      this.currentRequest = null;
    }
  }
}
