/**
 * Render Controller - Orchestrates OpenSCAD WASM rendering
 * @license GPL-3.0-or-later
 */

// Re-export quality tier system for convenience
export {
  COMPLEXITY_TIER,
  QUALITY_TIERS,
  HARDWARE_LEVEL,
  detectHardware,
  analyzeComplexity,
  getQualityPreset,
  getAdaptiveQualityConfig,
  getTierPresets,
  formatPresetDescription,
} from './quality-tiers.js';

/**
 * Legacy render quality presets (for backwards compatibility)
 *
 * NOTE: New code should use the adaptive quality tier system from quality-tiers.js
 * These presets are based on community standards for STANDARD complexity models.
 *
 * For adaptive quality based on model complexity and hardware, use:
 * - getAdaptiveQualityConfig(scadContent, parameters)
 * - getQualityPreset(tier, hardwareLevel, qualityLevel, mode)
 */
export const RENDER_QUALITY = {
  /**
   * Draft quality - very fast preview for any model
   */
  DRAFT: {
    name: 'draft',
    maxFn: 24,
    forceFn: true,
    minFa: 15,
    minFs: 3,
    timeoutMs: 20000,
  },
  /**
   * Low quality - fast exports, coarse tessellation
   */
  LOW: {
    name: 'low',
    maxFn: 32,
    forceFn: false,
    minFa: 15,
    minFs: 3,
    timeoutMs: 45000,
  },
  /**
   * Preview quality - balanced for interactive use
   */
  PREVIEW: {
    name: 'preview',
    maxFn: 48,
    forceFn: false,
    minFa: 12,
    minFs: 2,
    timeoutMs: 30000,
  },
  /**
   * Medium quality - community standard (STANDARD tier)
   */
  MEDIUM: {
    name: 'medium',
    maxFn: 128,
    forceFn: false,
    minFa: 6,
    minFs: 1,
    timeoutMs: 60000,
  },
  /**
   * High quality - community high standard (STANDARD tier)
   */
  HIGH: {
    name: 'high',
    maxFn: 256,
    forceFn: false,
    minFa: 2,
    minFs: 0.5,
    timeoutMs: 90000,
  },
  /**
   * Desktop-equivalent - respects model's settings
   */
  DESKTOP_DEFAULT: {
    name: 'desktop',
    maxFn: null,
    forceFn: false,
    minFa: 12,
    minFs: 2,
    timeoutMs: 60000,
  },
  /**
   * Full quality - for final export
   */
  FULL: {
    name: 'full',
    maxFn: null,
    forceFn: false,
    minFa: 12,
    minFs: 2,
    timeoutMs: 60000,
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
  /**
   * Create a new RenderController
   * @param {Object} options - Configuration options
   * @param {number} options.defaultTimeoutMs - Default render timeout in milliseconds (default: 60000)
   * @param {number} options.previewTimeoutMs - Preview render timeout in milliseconds (default: 30000)
   * @param {number} options.initTimeoutMs - WASM initialization timeout in milliseconds (default: 120000)
   */
  constructor(options = {}) {
    this.worker = null;
    this.requestId = 0;
    this.currentRequest = null;
    this.ready = false;
    this.initPromise = null;
    this.initTimeoutHandle = null;
    this.readyResolve = null;
    this.readyReject = null;
    this.renderQueue = Promise.resolve();
    this.memoryUsage = null;
    this.onMemoryWarning = null;

    // Configurable timeout settings
    this.timeoutConfig = {
      defaultTimeoutMs: options.defaultTimeoutMs || 60000,
      previewTimeoutMs: options.previewTimeoutMs || 30000,
      initTimeoutMs: options.initTimeoutMs || 120000,
    };
  }

  /**
   * Update timeout configuration
   * @param {Object} config - Timeout configuration
   * @param {number} config.defaultTimeoutMs - Default render timeout in milliseconds
   * @param {number} config.previewTimeoutMs - Preview render timeout in milliseconds
   * @param {number} config.initTimeoutMs - WASM initialization timeout in milliseconds
   */
  setTimeoutConfig(config) {
    if (config.defaultTimeoutMs)
      this.timeoutConfig.defaultTimeoutMs = config.defaultTimeoutMs;
    if (config.previewTimeoutMs)
      this.timeoutConfig.previewTimeoutMs = config.previewTimeoutMs;
    if (config.initTimeoutMs)
      this.timeoutConfig.initTimeoutMs = config.initTimeoutMs;
  }

  /**
   * Get current timeout configuration
   * @returns {Object} Current timeout settings
   */
  getTimeoutConfig() {
    return { ...this.timeoutConfig };
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

    const initPromise = new Promise((resolve, reject) => {
      let initSettled = false;
      const clearInitTimeout = () => {
        if (this.initTimeoutHandle) {
          clearTimeout(this.initTimeoutHandle);
          this.initTimeoutHandle = null;
        }
      };

      const settleInit = (settler, value) => {
        if (initSettled) {
          return;
        }
        initSettled = true;
        clearInitTimeout();
        this.readyResolve = null;
        this.readyReject = null;
        settler(value);
      };

      const failInit = (error) => {
        console.error('[RenderController] Init failed:', error);
        this.terminate();
        settleInit(reject, error);
      };

      const resolveInit = () => {
        settleInit(resolve);
      };

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
          const message =
            error?.message || 'Worker error during initialization';
          console.error('[RenderController] Worker error:', error);
          if (onProgress) {
            onProgress(-1, 'Failed to initialize: ' + message);
          }
          const initError = new Error(message);
          initError.event = error;
          failInit(initError);
        };

        // Report WASM download starting
        if (onProgress) {
          onProgress(5, 'Loading WASM module (~15-30MB)...');
        }

        // Send init message
        // Asset base URL is optional - worker will derive from self.location if not provided
        const assetBaseUrl = options.assetBaseUrl;
        this.worker.postMessage({
          type: 'INIT',
          payload: {
            ...(assetBaseUrl ? { assetBaseUrl } : {}),
          },
        });

        // Set up ready handler
        this.readyResolve = resolveInit;
        this.readyReject = failInit;

        // Timeout for initialization (configurable)
        this.initTimeoutHandle = setTimeout(() => {
          if (!this.ready) {
            if (onProgress) {
              onProgress(
                -1,
                'Initialization timeout - please refresh and try again'
              );
            }
            failInit(new Error('Worker initialization timeout'));
          }
        }, this.timeoutConfig.initTimeoutMs);
      } catch (error) {
        console.error('[RenderController] Failed to create worker:', error);
        if (onProgress) {
          onProgress(-1, 'Failed to create worker: ' + error.message);
        }
        failInit(error);
      }
    });

    this.initPromise = initPromise;
    return initPromise.catch((error) => {
      if (this.initPromise === initPromise) {
        this.initPromise = null;
      }
      throw error;
    });
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
          const error = new Error(payload.message);
          error.code = payload.code;
          error.details = payload.details;
          this.currentRequest.reject(error);
          this.currentRequest = null;
        } else if (payload.requestId === 'init' && this.readyReject) {
          const error = new Error(
            payload.message || 'Failed to initialize OpenSCAD engine'
          );
          if (payload.code) {
            error.code = payload.code;
          }
          if (payload.details) {
            error.details = payload.details;
          }
          this.readyReject(error);
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

      case 'WARNING':
        // Handle proactive warnings from worker (e.g., high memory before render)
        console.warn(`[RenderController] Warning: ${payload.message}`);

        // Trigger memory warning callback if this is a memory warning
        if (payload.code === 'HIGH_MEMORY' && this.onMemoryWarning) {
          this.onMemoryWarning(payload.memoryUsage || payload);
        }

        // Forward warning to current request's progress callback
        if (this.currentRequest && this.currentRequest.onProgress) {
          // Use negative percent to indicate warning state
          this.currentRequest.onProgress(-2, payload.message);
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
   *
   * Quality presets control tessellation through $fn, $fa, and $fs:
   * - $fn: Number of segments for full circles (0 = use $fa/$fs instead)
   * - $fa: Minimum angle (degrees) per segment (default 12°)
   * - $fs: Minimum size (mm) per segment (default 2mm)
   *
   * For FULL/DESKTOP_DEFAULT quality, we only SET defaults if the model
   * doesn't define them. For PREVIEW/DRAFT, we enforce constraints.
   *
   * @param {Object} parameters - Original parameters
   * @param {Object} quality - Quality preset (RENDER_QUALITY.PREVIEW or RENDER_QUALITY.FULL)
   * @returns {Object} Parameters with quality adjustments
   */
  applyQualitySettings(parameters, quality) {
    const adjusted = { ...parameters };
    const isFullQuality = quality.name === 'full' || quality.name === 'desktop';

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

    // Handle $fa (minimum angle)
    // For full quality: Only set if model doesn't define it (respect model's choices)
    // For preview/draft: Enforce minimum for performance
    if (quality.minFa !== null && quality.minFa !== undefined) {
      if (adjusted.$fa === undefined) {
        // Model doesn't define $fa - use our default
        adjusted.$fa = quality.minFa;
      } else if (!isFullQuality) {
        // For preview modes, enforce minimum $fa for performance
        adjusted.$fa = Math.max(adjusted.$fa, quality.minFa);
      }
      // For full quality, respect the model's $fa setting
    }

    // Handle $fs (minimum size)
    // Same logic as $fa
    if (quality.minFs !== null && quality.minFs !== undefined) {
      if (adjusted.$fs === undefined) {
        // Model doesn't define $fs - use our default
        adjusted.$fs = quality.minFs;
      } else if (!isFullQuality) {
        // For preview modes, enforce minimum $fs for performance
        adjusted.$fs = Math.max(adjusted.$fs, quality.minFs);
      }
      // For full quality, respect the model's $fs setting
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
      // Use explicit timeout if provided, then quality preset, then controller default
      const timeoutMs =
        options.timeoutMs ||
        quality.timeoutMs ||
        this.timeoutConfig.defaultTimeoutMs;

      const shouldRetryOnce = (err) => {
        const msg = err?.message || String(err);
        const code = err?.code;
        const details = err?.details;
        // Pattern we see in logs: "Failed to render model: 1101176" (numeric code, no stack)
        if (/^Failed to render model:\s*\d+/.test(msg)) return true;
        // Worker translates numeric callMain errors to INTERNAL_ERROR with raw numeric details.
        if (code === 'INTERNAL_ERROR') return true;
        if (typeof details === 'string' && /\b\d{6,}\b/.test(details))
          return true;
        return false;
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
        const shouldRetry = shouldRetryOnce(err);
        if (!shouldRetry) {
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
      quality: options.quality || RENDER_QUALITY.FULL,
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
