/**
 * Render Controller - Orchestrates OpenSCAD WASM rendering
 * @license GPL-3.0-or-later
 */

import { getAppPrefKey } from './storage-keys.js';

// Storage keys using standardized naming convention
const STORAGE_KEY_PERF_METRICS = getAppPrefKey('perf-metrics');
const STORAGE_KEY_METRICS_LOG = getAppPrefKey('metrics-log');
const STORAGE_KEY_LAZY_UNION = getAppPrefKey('lazy-union');
const STORAGE_KEY_MANIFOLD = getAppPrefKey('manifold-engine');

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
 * MANIFOLD OPTIMIZED: These values have been recalibrated for the Manifold
 * rendering backend, which is 10-100x faster than CGAL for boolean operations.
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
    maxFn: 32,
    forceFn: false, // No need to force with Manifold speed
    minFa: 12,
    minFs: 2,
    timeoutMs: 8000, // Reduced from 20s
  },
  /**
   * Low quality - fast exports, coarse tessellation
   */
  LOW: {
    name: 'low',
    maxFn: 48,
    forceFn: false,
    minFa: 10,
    minFs: 2,
    timeoutMs: 15000, // Reduced from 45s
  },
  /**
   * Preview quality - balanced for interactive use (~50% of full quality)
   * Targets approximately 50% triangle count vs full render:
   * - For STANDARD models (export-medium $fn=192): $fn=96 gives ~50%
   * - For COMPLEX models: $fn=96 capped by their lower limits, still rounded
   */
  PREVIEW: {
    name: 'preview',
    maxFn: 96, // ~50% of STANDARD export-medium ($fn=192)
    forceFn: false,
    minFa: 8,
    minFs: 1.5,
    timeoutMs: 12000,
  },
  /**
   * Medium quality - community standard (STANDARD tier)
   */
  MEDIUM: {
    name: 'medium',
    maxFn: 192,
    forceFn: false,
    minFa: 4,
    minFs: 0.75,
    timeoutMs: 30000, // Reduced from 60s
  },
  /**
   * High quality - community high standard (STANDARD tier)
   */
  HIGH: {
    name: 'high',
    maxFn: 360,
    forceFn: false,
    minFa: 1,
    minFs: 0.25,
    timeoutMs: 45000, // Reduced from 90s
  },
  /**
   * Desktop-equivalent - respects model's settings (OpenSCAD defaults)
   * Matches native OpenSCAD behavior: $fn, $fa, $fs from model
   */
  DESKTOP_DEFAULT: {
    name: 'desktop',
    maxFn: null,
    forceFn: false,
    minFa: 12,
    minFs: 2,
    timeoutMs: 30000, // Reduced from 60s
  },
  /**
   * Full quality - for final export (respects model's settings)
   */
  FULL: {
    name: 'full',
    maxFn: null,
    forceFn: false,
    minFa: 12,
    minFs: 2,
    timeoutMs: 30000, // Reduced from 60s
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

  // Additional expensive operations (common in keyguards and complex models)
  const offsets = (scadContent.match(/offset\s*\(/g) || []).length;
  const surfaces = (scadContent.match(/surface\s*\(/g) || []).length;
  const polyhedrons = (scadContent.match(/polyhedron\s*\(/g) || []).length;
  const imports = (scadContent.match(/import\s*\(/g) || []).length;
  const projections = (scadContent.match(/projection\s*\(/g) || []).length;

  // File size signal
  const fileSize = scadContent.length;

  // Weighted complexity scoring
  complexityScore += forLoops * 10;
  // Multiple intersections/differences are exponentially expensive
  complexityScore +=
    intersections > 5 ? intersections * 30 : intersections * 20;
  complexityScore += differences > 10 ? differences * 20 : differences * 15;
  complexityScore += hulls * 30;
  complexityScore += minkowskis * 50; // Minkowski is very expensive
  complexityScore += linearExtrudes * 8;
  complexityScore += rotateExtrudes * 12;
  complexityScore += spheres * 5;
  complexityScore += cylinders * 3;

  // Additional expensive operations
  complexityScore += offsets * 25; // offset() is computationally expensive
  complexityScore += surfaces * 40; // surface() imports heightmaps
  complexityScore += polyhedrons * 15; // polyhedron() can be complex
  complexityScore += imports * 20; // import() external geometry
  complexityScore += projections * 35; // projection() is expensive

  // File size penalty (large SCAD files often correlate with complexity)
  if (fileSize > 10000) {
    const extraKB = Math.floor((fileSize - 10000) / 5000);
    complexityScore += extraKB * 8;
  }

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
  if (differences > 15) {
    warnings.push(
      `Many difference() operations (${differences}) - heavy boolean workload`
    );
  }
  if (offsets > 3) {
    warnings.push(
      `Multiple offset() operations (${offsets}) - computationally expensive`
    );
  }
  if (fileSize > 25000) {
    warnings.push(
      `Large file (${Math.round(fileSize / 1024)}KB) may indicate complex model`
    );
  }

  // Estimate time (in seconds)
  // MANIFOLD OPTIMIZED: Reduced base time and multiplier since Manifold
  // renders 10-100x faster than CGAL for boolean operations.
  // A complex keyguard that takes ~10s with CGAL takes ~0.2s with Manifold
  const baseTime = 0.5;
  const estimatedSeconds = Math.max(
    1,
    Math.round(baseTime + complexityScore * 0.03) // Much lower multiplier for Manifold
  );

  // Determine confidence level
  let confidence;
  if (complexityScore < 20) {
    confidence = 'high';
  } else if (complexityScore < 80) {
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
      offsets,
      surfaces,
      polyhedrons,
      imports,
      projections,
      fileSize,
    },
  };
}

/**
 * Memory warning threshold (percentage of 1GB warning threshold)
 * Since we can only measure allocated heap size (not actual usage),
 * the worker reports percent as (heapMB / 1024MB) * 100.
 * 80% of 1GB = 819MB, which is a reasonable warning threshold.
 */
const MEMORY_WARNING_THRESHOLD = 80;

export class RenderController {
  /**
   * Create a new RenderController
   * @param {Object} options - Configuration options
   * @param {number} options.defaultTimeoutMs - Default render timeout in milliseconds (default: 30000)
   * @param {number} options.previewTimeoutMs - Preview render timeout in milliseconds (default: 15000)
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
    this._moduleUsed = false;

    // Worker health monitoring
    this._heartbeatId = 0;
    this._lastPongTimestamp = 0;
    this._heartbeatInterval = null;
    this._workerCrashCount = 0;
    this.onWorkerHealthChange = null;

    // MANIFOLD OPTIMIZED: Reduced default timeouts since Manifold renders much faster
    // Configurable timeout settings
    this.timeoutConfig = {
      defaultTimeoutMs: options.defaultTimeoutMs || 30000, // Was 60000
      previewTimeoutMs: options.previewTimeoutMs || 15000, // Was 30000
      initTimeoutMs: options.initTimeoutMs || 120000, // Keep init timeout (WASM loading)
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
   * (Note: OpenSCAD WASM renderToStl blocks inside the worker, so we cannot interrupt it mid-render.)
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
    this._workerCrashCount++;
    console.warn(
      `[RenderController] Worker restart #${this._workerCrashCount}`
    );
    this.terminate(); // also stops health monitoring
    this.initPromise = null;
    this.ready = false;
    await this.init();
    // Resume health monitoring after reinit
    this.startHealthMonitoring();
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
        // Store WASM init timing if provided
        this.wasmInitDurationMs = payload?.wasmInitDurationMs || 0;

        // Store detected capabilities
        this.capabilities = payload?.capabilities || {
          hasManifold: false,
          hasFastCSG: false,
          hasLazyUnion: false,
          hasBinarySTL: false,
          version: 'unknown',
        };

        console.log(
          `[RenderController] Worker ready (WASM init: ${this.wasmInitDurationMs}ms, ` +
            `Manifold: ${this.capabilities.hasManifold}, ` +
            `fast-csg: ${this.capabilities.hasFastCSG})`
        );

        // Emit capability event for UI to handle
        if (this.onCapabilitiesDetected) {
          this.onCapabilitiesDetected(this.capabilities);
        }

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
            // Include timing info from worker
            timing: payload.timing || {},
          };
          this.currentRequest.resolve(result);
          this.currentRequest = null;

          // Collect performance metrics if enabled
          const metricsEnabled =
            localStorage.getItem(STORAGE_KEY_PERF_METRICS) === 'true';
          if (metricsEnabled && payload.timing) {
            try {
              const metrics = JSON.parse(
                localStorage.getItem(STORAGE_KEY_METRICS_LOG) || '[]'
              );
              metrics.push({
                timestamp: Date.now(),
                renderMs: payload.timing.renderMs || 0,
                wasmInitMs: payload.timing.wasmInitMs || 0,
                cached: false,
              });

              // Keep last 100 entries
              while (metrics.length > 100) {
                metrics.shift();
              }

              localStorage.setItem(STORAGE_KEY_METRICS_LOG, JSON.stringify(metrics));
              console.log('[Perf] Render timing:', payload.timing);
            } catch (error) {
              console.warn('[Perf] Failed to log metrics:', error);
            }
          }

          // Check memory after render completes
          this.checkMemoryUsage();
        }
        break;

      case 'ERROR':
        // Surface any console output captured before the error (warnings, echos)
        if (payload.consoleOutput && typeof window.updateConsoleOutput === 'function') {
          window.updateConsoleOutput(payload.consoleOutput);
        }
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

      case 'PONG':
        // Worker heartbeat response — update health tracking
        this._lastPongTimestamp = Date.now();
        break;

      case 'CONSOLE':
        // Runtime console output from the WASM engine (e.g. echo/warning during render)
        if (typeof window.updateConsoleOutput === 'function') {
          const text = payload?.output || payload?.message;
          if (text) window.updateConsoleOutput(text);
        }
        break;

      case 'DEBUG_LOG':
        break;

      default:
        console.warn('[RenderController] Unknown message type:', type);
    }
  }

  /**
   * Start worker health monitoring via heartbeat.
   * Sends periodic PING messages; if the worker is responsive, it replies PONG.
   * During a blocking WASM render the worker won't respond — that's expected.
   * The health callback fires only when the worker appears unresponsive
   * *outside* of a known render.
   * @param {number} intervalMs - Heartbeat interval (default 10000ms)
   */
  startHealthMonitoring(intervalMs = 10000) {
    this.stopHealthMonitoring();
    this._lastPongTimestamp = Date.now();
    this._heartbeatInterval = setInterval(() => {
      if (!this.worker || !this.ready) return;

      this.worker.postMessage({
        type: 'PING',
        payload: { id: ++this._heartbeatId },
      });

      // Check if last pong was too long ago AND we're not in a render
      const silenceMs = Date.now() - this._lastPongTimestamp;
      const isRendering = !!this.currentRequest;
      if (!isRendering && silenceMs > intervalMs * 3) {
        console.warn(
          `[RenderController] Worker unresponsive for ${Math.round(silenceMs / 1000)}s outside render`
        );
        if (this.onWorkerHealthChange) {
          this.onWorkerHealthChange({
            healthy: false,
            silenceMs,
            crashCount: this._workerCrashCount,
          });
        }
      }
    }, intervalMs);
  }

  /**
   * Stop worker health monitoring
   */
  stopHealthMonitoring() {
    if (this._heartbeatInterval) {
      clearInterval(this._heartbeatInterval);
      this._heartbeatInterval = null;
    }
  }

  /**
   * Get worker crash count since last init
   * @returns {number}
   */
  getWorkerCrashCount() {
    return this._workerCrashCount;
  }

  /**
   * Set callback for memory warnings
   * @param {Function} callback - Called when memory usage exceeds threshold
   */
  setMemoryWarningCallback(callback) {
    this.onMemoryWarning = callback;
  }

  /**
   * Set callback for when OpenSCAD capabilities are detected
   * @param {Function} callback - Called with capability info after init
   */
  setCapabilitiesCallback(callback) {
    this.onCapabilitiesDetected = callback;
  }

  /**
   * Get detected capabilities
   * @returns {Object} Capability flags
   */
  getCapabilities() {
    return (
      this.capabilities || {
        hasManifold: false,
        hasFastCSG: false,
        hasLazyUnion: false,
        hasBinarySTL: false,
        version: 'unknown',
      }
    );
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
   * @param {Object} options.paramTypes - Map of parameter names to schema types (e.g. { expose_home_button: 'string', MW_version: 'boolean' })
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

        // Don't retry CGAL geometry errors - these are real compilation failures
        if (msg.includes('CGAL error') || msg.includes('assertion violation')) {
          return false;
        }

        // Don't retry compilation failures with useful error messages
        if (
          msg.includes('OpenSCAD compilation failed') &&
          msg.includes('Output:')
        ) {
          return false;
        }

        // Pattern we see in logs: "Failed to render model: 1101176" (numeric code, no stack)
        if (/^Failed to render model:\s*\d+/.test(msg)) return true;
        // Worker translates numeric callMain errors to INTERNAL_ERROR with raw numeric details.
        if (code === 'INTERNAL_ERROR') return true;
        if (typeof details === 'string' && /\b\d{6,}\b/.test(details))
          return true;
        return false;
      };

      const renderOnce = async () => {
        if (this._moduleUsed) {
          console.log('[RenderController] Proactive restart: WASM module was used by previous render');
          await this.restart();
          this._moduleUsed = false;
        }

        if (!this.ready) {
          throw new Error('Worker not ready. Call init() first.');
        }

        const requestId = `render-${++this.requestId}`;
        const renderStartTime = performance.now();

        return new Promise((resolve, reject) => {
          this.currentRequest = {
            id: requestId,
            resolve: (result) => {
              const renderDurationMs = Math.round(performance.now() - renderStartTime);
              this._moduleUsed = true;
              console.debug('[Render] Compilation complete:', {
                requestId,
                durationMs: renderDurationMs,
                outputFormat: options.outputFormat || 'stl',
                triangles: result?.stats?.triangles,
                dataSize: result?.data?.length || result?.stl?.length || 0,
                quality: quality?.name || 'unknown',
              });
              resolve(result);
            },
            reject: (error) => {
              const renderDurationMs = Math.round(performance.now() - renderStartTime);
              console.debug('[Render] Compilation failed:', {
                requestId,
                durationMs: renderDurationMs,
                error: error?.message,
                code: error?.code,
              });
              reject(error);
            },
            onProgress: options.onProgress,
          };

          // Convert Map to plain object if files are provided
          const filesObject = options.files
            ? Object.fromEntries(options.files)
            : undefined;

          // Determine output format (default to stl)
          const outputFormat = options.outputFormat || 'stl';

          // Read performance options from localStorage (worker can't access localStorage)
          // Engine selection: manifold_engine feature flag controls Manifold vs CGAL backend
          // Default to true (Manifold) for performance, user can disable for compatibility
          const manifoldPref = localStorage.getItem(STORAGE_KEY_MANIFOLD);
          const useManifold = manifoldPref === null ? true : manifoldPref !== 'false';
          
          // CAUTION: lazy-union may produce incorrect geometry in WASM
          // (OpenSCAD #350, #4169, #6060, Playground #115).
          // Default is OFF. Only enable if user explicitly opts in via settings.
          // If exposing a UI toggle, add warning: "Lazy union may produce incorrect
          // geometry (wrong difference/union results). Use for preview speed only."
          const renderOptions = {
            enableLazyUnion:
              localStorage.getItem(STORAGE_KEY_LAZY_UNION) === 'true',
            useManifold,
          };

          this.worker.postMessage({
            type: 'RENDER',
            payload: {
              requestId,
              scadContent,
              parameters: adjustedParams,
              paramTypes: options.paramTypes || {},
              timeoutMs,
              outputFormat,
              files: filesObject,
              mainFile: options.mainFile,
              libraries: options.libraries,
              renderOptions,
            },
          });

          // Render-level watchdog: if the render exceeds timeout + 30s grace,
          // the worker is hung on a blocking callMain(). Hard-cancel it.
          // This is the last line of defense against unrecoverable WASM hangs.
          const WATCHDOG_GRACE_MS = 30000;
          const watchdogMs = timeoutMs + WATCHDOG_GRACE_MS;
          this._renderWatchdogHandle = setTimeout(() => {
            if (this.currentRequest?.id === requestId) {
              console.error(
                `[RenderController] Render watchdog fired after ${watchdogMs}ms — ` +
                `worker is hung. Hard cancelling.`
              );
              this.cancel({ hard: true });
            }
          }, watchdogMs);

          // Clean up watchdog when render completes (wrap resolve/reject)
          const origResolve = this.currentRequest.resolve;
          const origReject = this.currentRequest.reject;
          this.currentRequest.resolve = (result) => {
            clearTimeout(this._renderWatchdogHandle);
            origResolve(result);
          };
          this.currentRequest.reject = (error) => {
            clearTimeout(this._renderWatchdogHandle);
            origReject(error);
          };
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
   * Cancel current render.
   *
   * Strategy: First, attempt a soft cancel via postMessage. If the worker
   * doesn't respond within the grace period, perform a hard cancel by
   * terminating the worker and reinitializing it. This is the only reliable
   * cancellation contract because callMain() is a synchronous blocking call
   * inside the WASM worker — the message loop cannot process CANCEL while
   * WASM is executing.
   *
   * @param {Object} [options] - Cancel options
   * @param {number} [options.gracePeriodMs=5000] - Time to wait before hard cancel
   * @param {boolean} [options.hard=false] - Force immediate hard cancel (skip soft attempt)
   */
  cancel(options = {}) {
    const { gracePeriodMs = 5000, hard = false } = options;

    if (!this.currentRequest) return;

    const { id, reject } = this.currentRequest;

    if (hard) {
      // Immediate hard cancel — terminate and reinit
      console.warn('[RenderController] Hard cancel: terminating worker');
      reject(new Error('Render cancelled (hard cancel)'));
      this.currentRequest = null;
      this._hardCancelAndReinit();
      return;
    }

    // Soft cancel attempt — worker may or may not process this
    if (this.worker) {
      this.worker.postMessage({
        type: 'CANCEL',
        payload: { requestId: id },
      });
    }
    reject(new Error('Render cancelled'));
    this.currentRequest = null;

    // Watchdog: if the worker is still blocking after the grace period,
    // hard-cancel it. We detect this by checking if a new render has started
    // (meaning the worker responded) vs. still being stuck.
    this._cancelWatchdogHandle = setTimeout(() => {
      // If no new request has been submitted and the worker is still alive,
      // the worker is likely hung on a blocking callMain(). Terminate it.
      if (!this.currentRequest && this.worker) {
        console.warn(
          '[RenderController] Watchdog: worker may be hung after cancel; terminating'
        );
        this._hardCancelAndReinit();
      }
    }, gracePeriodMs);
  }

  /**
   * Hard cancel: terminate the worker and reinitialize it.
   * This is the nuclear option — the only way to stop a blocking callMain().
   * @private
   */
  async _hardCancelAndReinit() {
    this.terminate();
    try {
      await this.init();
    } catch (err) {
      console.error('[RenderController] Failed to reinitialize worker after hard cancel:', err);
    }
  }

  /**
   * Terminate the worker
   */
  terminate() {
    this.stopHealthMonitoring();
    if (this._cancelWatchdogHandle) {
      clearTimeout(this._cancelWatchdogHandle);
      this._cancelWatchdogHandle = null;
    }
    if (this.initTimeoutHandle) {
      clearTimeout(this.initTimeoutHandle);
      this.initTimeoutHandle = null;
    }
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.ready = false;
      this.currentRequest = null;
    }
  }
}
