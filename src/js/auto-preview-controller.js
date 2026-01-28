/**
 * Auto-Preview Controller - Progressive enhancement for real-time visual feedback
 * @license GPL-3.0-or-later
 */

import { normalizeHexColor } from './color-utils.js';

/**
 * Preview state constants
 */
export const PREVIEW_STATE = {
  IDLE: 'idle', // No file loaded
  CURRENT: 'current', // Preview matches current parameters
  PENDING: 'pending', // Parameter changed, render scheduled
  RENDERING: 'rendering', // Preview render in progress
  STALE: 'stale', // Preview exists but from different params
  ERROR: 'error', // Last render failed
};

/**
 * Auto-Preview Controller
 * Manages debounced auto-rendering with caching for progressive enhancement
 */
export class AutoPreviewController {
  /**
   * Create an AutoPreviewController
   * @param {RenderController} renderController - The render controller instance
   * @param {PreviewManager} previewManager - The 3D preview manager instance
   * @param {Object} options - Configuration options
   */
  constructor(renderController, previewManager, options = {}) {
    this.renderController = renderController;
    this.previewManager = previewManager;

    // Configuration
    // MANIFOLD OPTIMIZED: Reduced debounce time for more responsive previews
    // Manifold renders most models in under 1 second, so we can respond faster
    this.debounceMs = options.debounceMs ?? 800; // Was 1500ms, now 800ms
    this.maxCacheSize = options.maxCacheSize ?? 10;
    this.enabled = options.enabled ?? true;
    // When enabled is false, this helps distinguish "user turned it off"
    // vs "auto-paused due to complexity". Used to decide whether param changes
    // should still schedule a debounced preview render.
    this.pauseReason = options.pauseReason ?? null; // 'user' | 'complexity' | null
    // MANIFOLD OPTIMIZED: Also reduced paused debounce time
    this.pausedDebounceMs =
      options.pausedDebounceMs ?? Math.max(this.debounceMs, 1500); // Was 2000ms
    this.previewQuality = options.previewQuality ?? null;
    this.resolvePreviewQuality = options.resolvePreviewQuality || null;
    this.resolvePreviewParameters = options.resolvePreviewParameters || null;
    this.resolvePreviewCacheKey = options.resolvePreviewCacheKey || null;

    // State
    this.state = PREVIEW_STATE.IDLE;
    this.debounceTimer = null;
    this.currentScadContent = null;
    this.currentParamHash = null;
    this.previewParamHash = null;
    this.previewCacheKey = null;
    this.currentPreviewKey = null;
    this.fullRenderParamHash = null;
    this.scadVersion = 0;

    // If params change while a render is in progress, keep the latest requested params here.
    this.pendingParameters = null;
    this.pendingParamHash = null;
    this.pendingPreviewKey = null;

    // Enabled libraries for rendering
    this.enabledLibraries = [];

    // Color parameters for preview tinting
    this.colorParamNames = [];

    // Cache: paramHash -> { stl, stats, timestamp }
    this.previewCache = new Map();

    // Full quality STL for download (separate from preview)
    this.fullQualitySTL = null;
    this.fullQualityStats = null;
    this.fullQualityKey = null;

    // Callbacks
    this.onStateChange = options.onStateChange || (() => {});
    this.onPreviewReady = options.onPreviewReady || (() => {});
    this.onProgress = options.onProgress || (() => {});
    this.onError = options.onError || (() => {});
  }

  /**
   * Simple hash function for parameter comparison
   * @param {Object} params - Parameters object
   * @returns {string} Hash string
   */
  hashParams(params) {
    return JSON.stringify(params);
  }

  /**
   * Resolve preview quality and cache key for current parameters
   * @param {Object} parameters
   * @returns {{quality: Object|null, qualityKey: string}}
   */
  resolvePreviewQualityInfo(parameters) {
    const quality = this.resolvePreviewQuality
      ? this.resolvePreviewQuality(parameters)
      : this.previewQuality;
    let qualityKey = this.resolvePreviewCacheKey
      ? this.resolvePreviewCacheKey(parameters, quality)
      : null;

    if (!qualityKey) {
      if (!quality) {
        qualityKey = 'model';
      } else if (quality.name) {
        qualityKey = quality.name;
      } else {
        qualityKey = 'custom';
      }
    }

    return { quality, qualityKey };
  }

  /**
   * Resolve preview parameter overrides
   * @param {Object} parameters
   * @param {string} qualityKey
   * @param {Object|null} quality
   * @returns {Object}
   */
  resolvePreviewParametersForRender(parameters, qualityKey, quality) {
    if (this.resolvePreviewParameters) {
      return this.resolvePreviewParameters(parameters, qualityKey, quality);
    }
    return parameters;
  }

  /**
   * Build a preview cache key
   * @param {string} paramHash
   * @param {string} qualityKey
   * @returns {string}
   */
  getPreviewCacheKey(paramHash, qualityKey) {
    return `${paramHash}|${qualityKey}`;
  }

  /**
   * Set the current state and notify listeners
   * @param {string} newState - New state value
   * @param {Object} extra - Extra data to pass to callback
   */
  setState(newState, extra = {}) {
    const prevState = this.state;
    this.state = newState;
    this.onStateChange(newState, prevState, extra);
  }

  /**
   * Enable or disable auto-preview
   * @param {boolean} enabled - Whether auto-preview is enabled
   * @param {'user'|'complexity'|null} [pauseReason] - Why auto-preview is disabled
   */
  setEnabled(enabled, pauseReason = null) {
    this.enabled = enabled;
    this.pauseReason = enabled ? null : pauseReason;
    if (!enabled && this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  /**
   * Set enabled libraries for rendering
   * @param {Array<{id: string, path: string}>} libraries - Enabled library configurations
   */
  setEnabledLibraries(libraries) {
    this.enabledLibraries = libraries || [];
  }

  /**
   * Set color parameter names for preview tinting
   * @param {string[]} names
   */
  setColorParamNames(names) {
    this.colorParamNames = Array.isArray(names) ? names.filter(Boolean) : [];
  }

  /**
   * Resolve a preview color override from parameters
   * @param {Object} parameters
   * @returns {string|null} Hex color (#RRGGBB) or null
   */
  resolvePreviewColor(parameters) {
    if (!parameters || this.colorParamNames.length === 0) {
      return null;
    }

    const useColors = parameters.use_colors;
    if (useColors === false) {
      return null;
    }
    if (typeof useColors === 'string' && useColors.toLowerCase() !== 'yes') {
      return null;
    }

    const preferredKey = this.colorParamNames.includes('box_color')
      ? 'box_color'
      : this.colorParamNames[0];
    const raw = parameters[preferredKey];

    // Use shared color normalization utility
    return normalizeHexColor(raw);
  }

  /**
   * Set the SCAD content (called when file is loaded)
   * @param {string} scadContent - OpenSCAD source code
   */
  setScadContent(scadContent) {
    // New file/content loaded: cancel any existing work and bump version so in-flight results are ignored.
    this.scadVersion += 1;
    this.cancelPending();
    this.currentScadContent = scadContent;
    this.clearCache();
    this.currentParamHash = null;
    this.pendingParameters = null;
    this.pendingParamHash = null;
    this.setState(PREVIEW_STATE.IDLE);
  }

  /**
   * Set project files for multi-file OpenSCAD projects
   * @param {Map<string, string>|null} projectFiles - Map of file paths to content
   * @param {string|null} mainFilePath - Path to the main .scad file
   */
  setProjectFiles(projectFiles, mainFilePath) {
    this.projectFiles = projectFiles;
    this.mainFilePath = mainFilePath;

    if (projectFiles && projectFiles.size > 0) {
      console.log(
        `[AutoPreview] Multi-file project: ${projectFiles.size} files, main: ${mainFilePath}`
      );
    }
  }

  /**
   * Set preview quality preset (preview-only; full-quality export unaffected)
   * Clears preview cache because geometry can change at same parameters.
   * @param {Object|null} qualityPreset - Render quality preset (e.g. RENDER_QUALITY.PREVIEW / DRAFT / HIGH)
   */
  setPreviewQuality(qualityPreset) {
    this.previewQuality = qualityPreset;
    this.clearPreviewCache();
    if (this.currentPreviewKey) {
      this.setState(PREVIEW_STATE.STALE);
    }
  }

  /**
   * Set resolver for adaptive preview quality
   * @param {Function|null} resolver
   */
  setPreviewQualityResolver(resolver) {
    this.resolvePreviewQuality = resolver || null;
    this.clearPreviewCache();
    if (this.currentPreviewKey) {
      this.setState(PREVIEW_STATE.STALE);
    }
  }

  /**
   * Set resolver for adaptive preview parameters
   * @param {Function|null} resolver
   */
  setPreviewParametersResolver(resolver) {
    this.resolvePreviewParameters = resolver || null;
    this.clearPreviewCache();
    if (this.currentPreviewKey) {
      this.setState(PREVIEW_STATE.STALE);
    }
  }

  /**
   * Set resolver for preview cache key
   * @param {Function|null} resolver
   */
  setPreviewCacheKeyResolver(resolver) {
    this.resolvePreviewCacheKey = resolver || null;
    this.clearPreviewCache();
    if (this.currentPreviewKey) {
      this.setState(PREVIEW_STATE.STALE);
    }
  }

  /**
   * Called when any parameter changes
   * Triggers debounced auto-preview if enabled
   * @param {Object} parameters - Current parameter values
   */
  onParameterChange(parameters) {
    if (!this.currentScadContent) return;

    const paramHash = this.hashParams(parameters);
    const { qualityKey } = this.resolvePreviewQualityInfo(parameters);
    const cacheKey = this.getPreviewCacheKey(paramHash, qualityKey);

    this.currentParamHash = paramHash;
    this.currentPreviewKey = cacheKey;

    // Check if preview is already current
    if (
      cacheKey === this.previewCacheKey &&
      this.state === PREVIEW_STATE.CURRENT
    ) {
      return;
    }

    // Check cache first
    if (this.previewCache.has(cacheKey)) {
      this.loadCachedPreview(paramHash, cacheKey, qualityKey);
      return;
    }

    // Mark preview as stale if we have one
    if (this.previewCacheKey && this.state === PREVIEW_STATE.CURRENT) {
      this.setState(PREVIEW_STATE.STALE);
    }

    // If auto-preview disabled (user off OR auto-paused for complex models),
    // do NOT show "pending" because no render will be scheduled.
    // Instead:
    // - If we have any preview, mark it stale
    // - If we have no preview, remain idle ("No preview")
    if (!this.enabled) {
      // If auto-paused due to complexity, still allow a debounced preview update
      // when the user changes parameters (otherwise the initial one-shot preview
      // can never update, which feels broken).
      if (this.pauseReason === 'complexity') {
        // Mark stale if a preview exists
        if (this.previewCacheKey && this.state === PREVIEW_STATE.CURRENT) {
          this.setState(PREVIEW_STATE.STALE);
        }
        // If a render is already in progress, store the latest requested params.
        if (this.renderController?.isBusy?.()) {
          if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
          }
          this.pendingParameters = parameters;
          this.pendingParamHash = paramHash;
          this.pendingPreviewKey = cacheKey;
          this.setState(PREVIEW_STATE.PENDING);
          return;
        }

        // Schedule a debounced preview render (slower debounce than normal).
        this.setState(PREVIEW_STATE.PENDING);
        if (this.debounceTimer) {
          clearTimeout(this.debounceTimer);
        }
        this.debounceTimer = setTimeout(() => {
          this.renderPreview(parameters, paramHash);
        }, this.pausedDebounceMs);
        return;
      }

      this.setState(
        this.previewCacheKey ? PREVIEW_STATE.STALE : PREVIEW_STATE.IDLE
      );
      return;
    }

    // If a render is already in progress, don't start another one (RenderController disallows it).
    // Instead, store the latest requested params and we'll render immediately when the current render completes.
    if (this.renderController?.isBusy?.()) {
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = null;
      }
      this.pendingParameters = parameters;
      this.pendingParamHash = paramHash;
      this.pendingPreviewKey = cacheKey;
      this.setState(PREVIEW_STATE.PENDING);
      return;
    }

    // Update state to pending
    this.setState(PREVIEW_STATE.PENDING);

    // Cancel existing debounce
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // Schedule new preview render
    this.debounceTimer = setTimeout(() => {
      this.renderPreview(parameters, paramHash);
    }, this.debounceMs);
  }

  /**
   * Load a cached preview
   * @param {string} paramHash - Parameter hash to load
   * @param {string} cacheKey - Cache key to load
   * @param {string} qualityKey - Quality key for state reporting
   */
  async loadCachedPreview(paramHash, cacheKey, qualityKey) {
    const cached = this.previewCache.get(cacheKey);
    if (!cached) return;

    try {
      let previewColor = null;
      try {
        const params = JSON.parse(paramHash);
        previewColor = this.resolvePreviewColor(params);
      } catch (_error) {
        previewColor = null;
      }
      // Only apply SCAD-derived color if one exists; don't clear user's manual color override
      if (this.previewManager?.setColorOverride && previewColor !== null) {
        this.previewManager.setColorOverride(previewColor);
      }
      const loadResult = await this.previewManager.loadSTL(cached.stl);
      this.previewParamHash = paramHash;
      this.previewCacheKey = cacheKey;

      // Include timing info (cached timing + fresh parse time)
      const timing = {
        totalMs: cached.durationMs,
        renderMs: cached.timing?.renderMs || 0,
        wasmInitMs: cached.timing?.wasmInitMs || 0,
        parseMs: loadResult?.parseMs || 0,
        cached: true,
      };

      // Collect performance metrics if enabled
      const metricsEnabled =
        localStorage.getItem('openscad-perf-metrics') === 'true';
      if (metricsEnabled) {
        try {
          const metrics = JSON.parse(
            localStorage.getItem('openscad-metrics-log') || '[]'
          );
          metrics.push({
            timestamp: Date.now(),
            renderMs: 0, // Cached, no render time
            wasmInitMs: 0,
            cached: true,
            parseMs: timing.parseMs || 0,
          });

          // Keep last 100 entries
          while (metrics.length > 100) {
            metrics.shift();
          }

          localStorage.setItem('openscad-metrics-log', JSON.stringify(metrics));
          console.log('[Perf] Cache hit');
        } catch (error) {
          console.warn('[Perf] Failed to log cached metrics:', error);
        }
      }

      this.setState(PREVIEW_STATE.CURRENT, {
        cached: true,
        stats: cached.stats,
        renderDurationMs: cached.durationMs,
        qualityKey,
        timing,
      });
      this.onPreviewReady(
        cached.stl,
        cached.stats,
        true,
        cached.durationMs,
        timing
      );
    } catch (error) {
      console.error('Failed to load cached preview:', error);
      // Remove from cache and try fresh render
      this.previewCache.delete(cacheKey);
      this.renderPreview(JSON.parse(paramHash), paramHash);
    }
  }

  /**
   * Render preview with reduced quality
   * @param {Object} parameters - Parameter values
   * @param {string} paramHash - Parameter hash
   */
  async renderPreview(parameters, paramHash) {
    const localScadVersion = this.scadVersion;
    const { quality, qualityKey } = this.resolvePreviewQualityInfo(parameters);
    const cacheKey = this.getPreviewCacheKey(paramHash, qualityKey);
    const previewParameters = this.resolvePreviewParametersForRender(
      parameters,
      qualityKey,
      quality
    );
    const _overrideKeys = Object.keys(previewParameters).filter(
      (key) => previewParameters[key] !== parameters[key]
    );

    // Check if this render is still relevant
    if (
      paramHash !== this.currentParamHash ||
      cacheKey !== this.currentPreviewKey
    ) {
      console.log('[AutoPreview] Skipping stale render request');
      return;
    }

    this.setState(PREVIEW_STATE.RENDERING);
    let renderFailed = false;
    try {
      const startTime = Date.now();
      const result = await this.renderController.renderPreview(
        this.currentScadContent,
        previewParameters,
        {
          ...(quality ? { quality } : {}),
          files: this.projectFiles,
          mainFile: this.mainFilePath,
          libraries: this.enabledLibraries,
          onProgress: (percent, message) => {
            this.onProgress(percent, message, 'preview');
          },
        }
      );
      const durationMs = Date.now() - startTime;

      // If the file changed mid-render, ignore this result.
      if (localScadVersion !== this.scadVersion) return;

      // Check if still relevant after render completes
      if (
        paramHash !== this.currentParamHash ||
        cacheKey !== this.currentPreviewKey
      ) {
        console.log('[AutoPreview] Discarding stale render result');
        return;
      }

      // Cache the result
      this.addToCache(cacheKey, result, durationMs);
      this.previewParamHash = paramHash;
      this.previewCacheKey = cacheKey;

      // Load into 3D preview
      // Only apply SCAD-derived color if one exists; don't clear user's manual color override
      if (this.previewManager?.setColorOverride) {
        const previewColor = this.resolvePreviewColor(parameters);
        if (previewColor !== null) {
          this.previewManager.setColorOverride(previewColor);
        }
      }
      const loadResult = await this.previewManager.loadSTL(result.stl);

      // Collect timing breakdown
      const timing = {
        totalMs: durationMs,
        renderMs: result.timing?.renderMs || 0,
        wasmInitMs: result.timing?.wasmInitMs || 0,
        parseMs: loadResult?.parseMs || 0,
      };

      // Log preview performance metrics
      const bytesPerTri =
        result.stats?.triangles > 0
          ? Math.round((result.stl?.byteLength || 0) / result.stats.triangles)
          : 0;
      console.log(
        `[Preview Performance] ${qualityKey} | ` +
          `${timing.renderMs}ms | ` +
          `${result.stats?.triangles || 0} triangles | ` +
          `${bytesPerTri < 80 ? 'Binary STL ✓' : bytesPerTri > 100 ? 'ASCII STL ⚠️' : 'Unknown'}`
      );

      this.setState(PREVIEW_STATE.CURRENT, {
        stats: result.stats,
        renderDurationMs: durationMs,
        qualityKey,
        timing,
      });
      this.onPreviewReady(result.stl, result.stats, false, durationMs, timing);
    } catch (error) {
      renderFailed = true;
      console.error('[AutoPreview] Preview render failed:', error);

      // If the file changed mid-render, ignore this error.
      if (localScadVersion !== this.scadVersion) return;

      // Treat cancellations as non-errors (common during rapid changes / file switching).
      const msg = (error?.message || String(error)).toLowerCase();
      if (msg.includes('cancel')) {
        return;
      }

      // Check if still relevant
      if (paramHash !== this.currentParamHash) return;

      this.setState(PREVIEW_STATE.ERROR, { error: error.message });
      this.onError(error, 'preview');
    } finally {
      // If the file changed mid-render, skip pending render scheduling.
      if (localScadVersion !== this.scadVersion) {
        // Do nothing - stale render result ignored
      } else if (
        this.pendingParamHash &&
        this.pendingParamHash === this.currentParamHash &&
        this.pendingPreviewKey === this.currentPreviewKey
      ) {
        // FIX: Don't retry pending renders if the render failed - this causes infinite loops
        // Only process pending renders after SUCCESSFUL renders
        if (renderFailed) {
          // Clear pending to avoid retry loop
          this.pendingParameters = null;
          this.pendingParamHash = null;
          this.pendingPreviewKey = null;
        } else {
          // If parameters changed during this render, immediately render the latest once we are free.
          // (OpenSCAD WASM render is blocking in the worker, so "cancel" can't interrupt mid-render.)
          const nextParams = this.pendingParameters;
          const nextHash = this.pendingParamHash;
          this.pendingParameters = null;
          this.pendingParamHash = null;
          this.pendingPreviewKey = null;

          // Avoid re-entrancy: render on next tick.
          setTimeout(() => {
            this.renderPreview(nextParams, nextHash);
          }, 0);
        }
      }
    }
  }

  /**
   * Add result to cache, evicting old entries if needed
   * @param {string} cacheKey - Preview cache key
   * @param {Object} result - Render result { stl, stats, timing }
   * @param {number} durationMs - Render duration in milliseconds
   */
  addToCache(cacheKey, result, durationMs = null) {
    // Evict oldest entries if cache is full
    while (this.previewCache.size >= this.maxCacheSize) {
      const oldestKey = this.previewCache.keys().next().value;
      this.previewCache.delete(oldestKey);
    }

    this.previewCache.set(cacheKey, {
      stl: result.stl,
      stats: result.stats,
      durationMs,
      timing: result.timing || {},
      timestamp: Date.now(),
    });
  }

  /**
   * Clear the preview cache
   */
  clearCache() {
    this.previewCache.clear();
    this.previewParamHash = null;
    this.previewCacheKey = null;
    this.fullRenderParamHash = null;
    this.fullQualitySTL = null;
    this.fullQualityStats = null;
    this.fullQualityKey = null;
  }

  /**
   * Clear only preview cache (keep full-quality export cache intact)
   */
  clearPreviewCache() {
    this.previewCache.clear();
    this.previewParamHash = null;
    this.previewCacheKey = null;
  }

  /**
   * Render full quality for download
   * @param {Object} parameters - Parameter values
   * @returns {Promise<Object>} Render result with STL and stats
   */
  async renderFull(parameters, options = {}) {
    const paramHash = this.hashParams(parameters);
    const quality = options.quality || null;
    const qualityKey = quality?.name ? `full-${quality.name}` : 'full';
    const cacheKey = this.getPreviewCacheKey(paramHash, qualityKey);

    // Check if we already have full quality for these params
    if (
      paramHash === this.fullRenderParamHash &&
      this.fullQualitySTL &&
      this.fullQualityKey === qualityKey
    ) {
      return {
        stl: this.fullQualitySTL,
        stats: this.fullQualityStats,
        cached: true,
      };
    }

    // Perform full render
    const result = await this.renderController.renderFull(
      this.currentScadContent,
      parameters,
      {
        files: this.projectFiles,
        mainFile: this.mainFilePath,
        libraries: this.enabledLibraries,
        ...(quality ? { quality } : {}),
        onProgress: (percent, message) => {
          this.onProgress(percent, message, 'full');
        },
      }
    );

    // Store for reuse
    this.fullQualitySTL = result.stl;
    this.fullQualityStats = result.stats;
    this.fullRenderParamHash = paramHash;
    this.fullQualityKey = qualityKey;

    // Also update the preview with full quality result
    try {
      // Only apply SCAD-derived color if one exists; don't clear user's manual color override
      if (this.previewManager?.setColorOverride) {
        const previewColor = this.resolvePreviewColor(parameters);
        if (previewColor !== null) {
          this.previewManager.setColorOverride(previewColor);
        }
      }
      await this.previewManager.loadSTL(result.stl);
      this.previewParamHash = paramHash;
      this.previewCacheKey = cacheKey;
      this.addToCache(cacheKey, result, null);
      this.setState(PREVIEW_STATE.CURRENT, {
        stats: result.stats,
        fullQuality: true,
        qualityKey,
      });
    } catch (error) {
      console.warn(
        '[AutoPreview] Failed to update preview with full render:',
        error
      );
    }

    return result;
  }

  /**
   * Check if we need a full render for the current parameters
   * @param {Object} parameters - Current parameter values
   * @returns {boolean} True if full render is needed
   */
  needsFullRender(parameters) {
    const paramHash = this.hashParams(parameters);
    return paramHash !== this.fullRenderParamHash || !this.fullQualitySTL;
  }

  /**
   * Get the current full quality STL if available and current
   * @param {Object} parameters - Current parameter values
   * @returns {Object|null} { stl, stats } or null if not available
   */
  getCurrentFullSTL(parameters) {
    const paramHash = this.hashParams(parameters);
    if (paramHash === this.fullRenderParamHash && this.fullQualitySTL) {
      return {
        stl: this.fullQualitySTL,
        stats: this.fullQualityStats,
      };
    }
    return null;
  }

  /**
   * Cancel any pending preview render (debounce/queued only)
   */
  cancelPending() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    this.pendingParameters = null;
    this.pendingParamHash = null;
    this.pendingPreviewKey = null;
  }

  /**
   * Force an immediate preview render
   * @param {Object} parameters - Parameter values
   * @returns {Promise<boolean>} True if render was initiated, false if skipped
   */
  async forcePreview(parameters) {
    // Defensive check: ensure we have content to render
    if (!this.currentScadContent) {
      console.warn('[AutoPreview] forcePreview called but no SCAD content set');
      return false;
    }
    this.cancelPending();

    // If a render is already in progress, queue this as pending
    if (this.renderController?.isBusy?.()) {
      console.log(
        '[AutoPreview] forcePreview: render in progress, queuing as pending'
      );
      const paramHash = this.hashParams(parameters);
      this.pendingParameters = parameters;
      this.pendingParamHash = paramHash;
      const { qualityKey } = this.resolvePreviewQualityInfo(parameters);
      this.pendingPreviewKey = this.getPreviewCacheKey(paramHash, qualityKey);
      this.currentParamHash = paramHash;
      this.currentPreviewKey = this.pendingPreviewKey;
      this.setState(PREVIEW_STATE.PENDING);
      return true; // Will render when current render completes
    }

    const paramHash = this.hashParams(parameters);
    this.currentParamHash = paramHash;
    const { qualityKey } = this.resolvePreviewQualityInfo(parameters);
    this.currentPreviewKey = this.getPreviewCacheKey(paramHash, qualityKey);
    await this.renderPreview(parameters, paramHash);
    return true;
  }

  /**
   * Dispose of the controller and clean up all resources
   * Clears timers, caches, and resets state
   */
  dispose() {
    // Clear any pending debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    // Clear pending render state
    this.pendingParameters = null;
    this.pendingParamHash = null;
    this.pendingPreviewKey = null;

    // Clear cache
    this.clearCache();

    // Clear full quality STL
    this.fullQualitySTL = null;
    this.fullQualityStats = null;
    this.fullQualityKey = null;

    // Reset state
    this.state = PREVIEW_STATE.IDLE;
    this.currentScadContent = null;
    this.currentParamHash = null;
    this.previewParamHash = null;
    this.previewCacheKey = null;
    this.currentPreviewKey = null;
    this.fullRenderParamHash = null;
    this.scadVersion = 0;

    // Clear references
    this.renderController = null;
    this.previewManager = null;
  }

  /**
   * Get current state information
   * @returns {Object} State info
   */
  getStateInfo() {
    return {
      state: this.state,
      enabled: this.enabled,
      hasPendingRender: !!this.debounceTimer,
      hasPreview: !!this.previewCacheKey,
      hasFullSTL: !!this.fullQualitySTL,
      cacheSize: this.previewCache.size,
      isPreviewCurrent: this.currentPreviewKey === this.previewCacheKey,
      isFullCurrent: this.currentParamHash === this.fullRenderParamHash,
    };
  }
}
