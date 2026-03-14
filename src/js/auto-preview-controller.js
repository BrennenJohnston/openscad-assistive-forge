/**
 * Auto-Preview Controller - Progressive enhancement for real-time visual feedback
 * @license GPL-3.0-or-later
 */

import {
  normalizeHexColor,
  DEBUG_HIGHLIGHT_HEX,
  DEBUG_HIGHLIGHT_OPACITY,
} from './color-utils.js';
import { getAppPrefKey } from './storage-keys.js';
import { isEnabled as isFlagEnabled } from './feature-flags.js';
import { isNonPreviewable, is2DGenerateValue } from './render-intent.js';

// Storage keys using standardized naming convention
const STORAGE_KEY_PERF_METRICS = getAppPrefKey('perf-metrics');
const STORAGE_KEY_METRICS_LOG = getAppPrefKey('metrics-log');

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

    // Parameter type metadata (schema types for boolean vs string disambiguation)
    this.paramTypes = {};

    // Full parsed schema for render-intent classification
    this.schema = null;

    // Color parameters for preview tinting
    this.colorParamNames = [];

    // Cache: paramHash -> { stl, stats, timestamp }
    this.previewCache = new Map();

    // Track whether initial preview for current file has been shown
    // Used to determine if camera should be preserved on subsequent loads
    this.initialPreviewDone = false;

    // Full quality output for download (separate from preview)
    this.fullQualitySTL = null;
    this.fullQualityFormat = null;
    this.fullQualityStats = null;
    this.fullQualityKey = null;
    // Console output from last full render (for echo() support)
    this.fullQualityConsoleOutput = null;

    // Callbacks
    this.onStateChange = options.onStateChange || (() => {});
    this.onPreviewReady = options.onPreviewReady || (() => {});
    this.onProgress = options.onProgress || (() => {});
    this.onError = options.onError || (() => {});
  }

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

  getPreviewCacheKey(paramHash, qualityKey) {
    return `${paramHash}|${qualityKey}`;
  }

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
   * Set parameter type metadata from schema
   * Used to distinguish boolean params from string "yes"/"no" dropdown params
   * @param {Object} paramTypes - Map of parameter names to schema types (e.g. { expose_home_button: 'string', MW_version: 'boolean' })
   */
  setParamTypes(paramTypes) {
    this.paramTypes = paramTypes || {};
  }

  /**
   * Set color parameter names for preview tinting
   * @param {string[]} names
   */
  setColorParamNames(names) {
    this.colorParamNames = Array.isArray(names) ? names.filter(Boolean) : [];
  }

  /**
   * Set the parsed schema for render-intent classification.
   * The shared render-intent module uses the full schema to detect 2D export
   * intent and non-previewable states across all enum parameters, not just
   * "generate".
   * @param {Object|null} schema - Parsed schema ({ parameters: { ... } })
   */
  setSchema(schema) {
    this.schema = schema || null;
    console.debug(
      '[AutoPreview] setSchema:',
      this.schema
        ? Object.keys(this.schema.parameters || {}).length + ' params'
        : 'null'
    );
  }

  /**
   * Detect the render state for model coloring based on parameters.
   * Delegates to the shared render-intent classifier and maps the result
   * to the legacy color-tinting values expected by the preview manager.
   *
   * Now a no-op that always returns null: the fabricated 'preview'/'laser'
   * tinting was removed because it does not correspond to any desktop
   * OpenSCAD behavior. Model color comes from COFF per-face data or the
   * theme default.
   *
   * @param {Object} parameters
   * @param {boolean} _isFullQuality
   * @returns {null}
   */
  _detectRenderState(parameters, _isFullQuality = false) {
    return null;
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

    const preferredKey = this.colorParamNames[0];
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
    // Reset initial preview flag - new file needs camera fit
    this.initialPreviewDone = false;
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

    // BUG-A fix: companion file content changes affect geometry even when
    // parameters stay the same (e.g., preset aliasing swaps openings files).
    // Clear the preview cache so the next render dispatches to the worker
    // with the updated file set rather than serving a stale cached result.
    this.clearPreviewCache();
    if (this.currentPreviewKey) {
      this.setState(PREVIEW_STATE.STALE);
    }

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
      if (
        this.previewManager?.setColorOverride &&
        this.previewManager.colorOverrideEnabled &&
        previewColor !== null
      ) {
        this.previewManager.setColorOverride(previewColor);
      }
      const params = (() => {
        try {
          return JSON.parse(paramHash);
        } catch {
          return null;
        }
      })();
      if (this.previewManager?.setRenderState) {
        this.previewManager.setRenderState(this._detectRenderState(params));
      }
      // Preserve camera position on subsequent loads (after initial preview)
      const cachedFormat = cached.format || 'stl';
      const loadResult =
        cachedFormat === 'off' && this.previewManager.loadOFF
          ? await this.previewManager.loadOFF(cached.stl, {
              preserveCamera: this.initialPreviewDone,
            })
          : await this.previewManager.loadSTL(cached.stl, {
              preserveCamera: this.initialPreviewDone,
            });
      this.previewParamHash = paramHash;
      this.previewCacheKey = cacheKey;
      // Mark initial preview as done after successful load
      this.initialPreviewDone = true;

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
        localStorage.getItem(STORAGE_KEY_PERF_METRICS) === 'true';
      if (metricsEnabled) {
        try {
          const metrics = JSON.parse(
            localStorage.getItem(STORAGE_KEY_METRICS_LOG) || '[]'
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

          localStorage.setItem(
            STORAGE_KEY_METRICS_LOG,
            JSON.stringify(metrics)
          );
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
   * Detect whether the current parameters produce output that cannot be
   * previewed as 3D geometry (2D-only formats, customizer-only modes, or
   * empty/whitespace generate values).
   *
   * Delegates to the shared render-intent module's `isNonPreviewable`.
   * Accepts either a full schema object or, for backward compatibility,
   * a generate enum entries array.
   *
   * @param {Object} parameters - Current parameter values
   * @param {Object|Array} [schemaOrEnumEntries] - Schema or generate enum entries
   * @returns {boolean}
   */
  static isNonPreviewableParameters(parameters, schemaOrEnumEntries) {
    let schema = schemaOrEnumEntries;
    if (Array.isArray(schemaOrEnumEntries)) {
      schema = { parameters: { generate: { enum: schemaOrEnumEntries } } };
    }
    return isNonPreviewable(parameters, schema);
  }

  /**
   * Detect whether a SCAD source file uses color() calls, which enables
   * COFF (Color OFF) format output from OpenSCAD for per-face color passthrough.
   *
   * This is a conservative regex scan — false negatives are safe (fallback to STL),
   * but false positives waste a slower text-format render with no benefit.
   * The regex avoids comments and strings on a best-effort basis.
   *
   * @param {string} scadContent - OpenSCAD source code
   * @returns {boolean} true if color() calls are likely present
   */
  static scadUsesColor(scadContent) {
    if (!scadContent || typeof scadContent !== 'string') return false;
    // Strip single-line // comments and block /* */ comments (approximate)
    const stripped = scadContent
      .replace(/\/\/[^\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    // Match color( with optional whitespace, including named colors like color("red")
    return /\bcolor\s*\(/.test(stripped);
  }

  /**
   * Strip comments and string literals while preserving overall structure.
   * This enables lightweight source scanning without false-positives from
   * `#` inside comments/strings.
   *
   * @param {string} scadContent
   * @returns {string}
   */
  static stripCommentsAndStrings(scadContent) {
    if (!scadContent || typeof scadContent !== 'string') return '';

    let result = '';
    let inLineComment = false;
    let inBlockComment = false;
    let inString = false;
    let stringQuote = '';
    let escapeNext = false;

    for (let i = 0; i < scadContent.length; i++) {
      const ch = scadContent[i];
      const next = scadContent[i + 1];

      if (inLineComment) {
        if (ch === '\n') {
          inLineComment = false;
          result += '\n';
        } else {
          result += ' ';
        }
        continue;
      }

      if (inBlockComment) {
        if (ch === '*' && next === '/') {
          inBlockComment = false;
          result += '  ';
          i += 1;
        } else {
          result += ch === '\n' ? '\n' : ' ';
        }
        continue;
      }

      if (inString) {
        if (escapeNext) {
          escapeNext = false;
          result += ' ';
          continue;
        }
        if (ch === '\\') {
          escapeNext = true;
          result += ' ';
          continue;
        }
        if (ch === stringQuote) {
          inString = false;
          stringQuote = '';
          result += ' ';
          continue;
        }
        result += ch === '\n' ? '\n' : ' ';
        continue;
      }

      if (ch === '/' && next === '/') {
        inLineComment = true;
        result += '  ';
        i += 1;
        continue;
      }

      if (ch === '/' && next === '*') {
        inBlockComment = true;
        result += '  ';
        i += 1;
        continue;
      }

      if (ch === '"' || ch === "'") {
        inString = true;
        stringQuote = ch;
        result += ' ';
        continue;
      }

      result += ch;
    }

    return result;
  }

  /**
   * Detect whether a SCAD source file uses the `#` debug modifier.
   *
   * Desktop OpenSCAD renders `#`-modified geometry with a fixed highlight
   * color {255, 81, 81, 128} that OVERRIDES any user-defined color().
   * In COFF export the face colors still carry the user color, so the
   * preview layer must apply the override when this modifier is detected.
   *
   * This detector is intentionally conservative: it only looks for direct
   * top-level `#` statements and ignores module bodies. Large projects can
   * contain dormant helper-module debug paths (for example `if(id=="#")`),
   * and treating those as active would incorrectly tint the entire preview.
   *
   * @param {string} scadContent - OpenSCAD source code
   * @returns {boolean} true if `#` debug modifier is likely present
   */
  static scadUsesDebugModifier(scadContent) {
    if (!scadContent || typeof scadContent !== 'string') return false;
    const stripped = AutoPreviewController.stripCommentsAndStrings(scadContent);
    const debugTargetPattern =
      /^\s*(?:color|cube|sphere|cylinder|translate|rotate|scale|union|difference|intersection|linear_extrude|rotate_extrude|hull|minkowski|polygon|circle|square|text|import|surface|resize|mirror|multmatrix|offset|projection|render|\{|\w+\s*\()/;

    let braceDepth = 0;
    const moduleBraceDepths = [];
    let pendingModuleDefinition = false;

    for (let i = 0; i < stripped.length; i++) {
      const ch = stripped[i];

      if (
        /[A-Za-z_]/.test(ch) &&
        stripped.slice(i, i + 6) === 'module' &&
        (i === 0 || !/[A-Za-z0-9_]/.test(stripped[i - 1])) &&
        !/[A-Za-z0-9_]/.test(stripped[i + 6] || '')
      ) {
        pendingModuleDefinition = true;
        i += 5;
        continue;
      }

      if (ch === '{') {
        braceDepth += 1;
        if (pendingModuleDefinition) {
          moduleBraceDepths.push(braceDepth);
          pendingModuleDefinition = false;
        }
        continue;
      }

      if (ch === '}') {
        if (moduleBraceDepths[moduleBraceDepths.length - 1] === braceDepth) {
          moduleBraceDepths.pop();
        }
        braceDepth = Math.max(0, braceDepth - 1);
        pendingModuleDefinition = false;
        continue;
      }

      if (ch === ';') {
        pendingModuleDefinition = false;
      }

      if (ch !== '#') continue;

      const prev = i === 0 ? '' : stripped[i - 1];
      const isStatementBoundary = i === 0 || /[;\s{}]/.test(prev);
      const insideModuleDefinition = moduleBraceDepths.length > 0;

      if (!isStatementBoundary || insideModuleDefinition) {
        continue;
      }

      if (debugTargetPattern.test(stripped.slice(i + 1))) {
        return true;
      }
    }

    return false;
  }

  /**
   * Render preview with reduced quality
   * @param {Object} parameters - Parameter values
   * @param {string} paramHash - Parameter hash
   */
  async renderPreview(parameters, paramHash) {
    if (isNonPreviewable(parameters, this.schema)) {
      console.log(
        '[AutoPreview] Skipping STL preview for non-previewable generate mode:',
        parameters.generate
      );

      // BUG-C fix: cancel any pending debounce timer so it cannot fire after
      // this mode-switch and trigger an unexpected render.
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = null;
      }
      // Also clear any pending parameters queued while a render was in progress.
      this.pendingParameters = null;
      this.pendingParamHash = null;
      this.pendingPreviewKey = null;

      const message =
        'The current generate setting does not produce geometry. ' +
        'The 3D preview is not available in this mode. ' +
        "Adjust the 'generate' parameter to a 3D output type to see a preview.";
      const error = new Error(message);
      error.code = 'NO_GEOMETRY';
      this.setState(PREVIEW_STATE.ERROR, { error: error.message });
      this.onError(error, 'preview');
      return;
    }

    const localScadVersion = this.scadVersion;
    const { quality, qualityKey } = this.resolvePreviewQualityInfo(parameters);
    const cacheKey = this.getPreviewCacheKey(paramHash, qualityKey);
    const previewParameters = this.resolvePreviewParametersForRender(
      parameters,
      qualityKey,
      quality
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

    // ENH-A: Use COFF (Color OFF) format when the flag is enabled and the
    // SCAD source contains color() calls OR the # debug modifier. The #
    // modifier needs OFF so the dual-render overlay can be applied even
    // when color() is absent from the source.
    const hasDebugModifier = AutoPreviewController.scadUsesDebugModifier(
      this.currentScadContent
    );
    const useColorPassthrough =
      isFlagEnabled('color_passthrough') &&
      (AutoPreviewController.scadUsesColor(this.currentScadContent) ||
        hasDebugModifier);
    const previewOutputFormat = useColorPassthrough ? 'off' : 'stl';

    let renderFailed = false;
    try {
      const startTime = Date.now();
      const result = await this.renderController.renderPreview(
        this.currentScadContent,
        previewParameters,
        {
          ...(quality ? { quality } : {}),
          outputFormat: previewOutputFormat,
          files: this.projectFiles,
          mainFile: this.mainFilePath,
          libraries: this.enabledLibraries,
          paramTypes: this.paramTypes,
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
      if (
        this.previewManager?.setColorOverride &&
        this.previewManager.colorOverrideEnabled
      ) {
        const previewColor = this.resolvePreviewColor(parameters);
        if (previewColor !== null) {
          this.previewManager.setColorOverride(previewColor);
        }
      }
      // Set render state so the model color reflects preview/laser quality
      if (this.previewManager?.setRenderState) {
        this.previewManager.setRenderState(this._detectRenderState(parameters));
      }
      // Preserve camera position on subsequent loads (after initial preview)
      const resultFormat = result.format || 'stl';
      const loadResult =
        resultFormat === 'off' && this.previewManager.loadOFF
          ? await this.previewManager.loadOFF(result.stl, {
              preserveCamera: this.initialPreviewDone,
              debugHighlight: hasDebugModifier
                ? {
                    hex: DEBUG_HIGHLIGHT_HEX,
                    opacity: DEBUG_HIGHLIGHT_OPACITY,
                  }
                : null,
            })
          : await this.previewManager.loadSTL(result.stl, {
              preserveCamera: this.initialPreviewDone,
            });
      // Mark initial preview as done after successful load
      this.initialPreviewDone = true;

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
          `${resultFormat === 'off' ? (loadResult?.hasColors ? 'COFF ✓' : 'OFF (no color)') : bytesPerTri < 80 ? 'Binary STL ✓' : bytesPerTri > 100 ? 'ASCII STL ⚠️' : 'Unknown'}` +
          `${hasDebugModifier ? ' [# debug highlight active]' : ''}`
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

      // Attempt draft SVG preview for 2D generate modes.
      // The WASM STL render can fail in multiple ways when the model is 2D:
      //  - MODEL_IS_2D  (graceful detection)
      //  - RENDER_FAILED (exit code 1 — common after preset changes)
      //  - EMPTY_GEOMETRY
      // Rather than matching only MODEL_IS_2D, also try when the generate
      // parameter itself indicates a 2D output mode (svg/dxf/first layer).
      const errMsg = (error?.message || String(error)).toLowerCase();
      const is2DError =
        error?.code === 'MODEL_IS_2D' ||
        errMsg.includes('model_is_2d') ||
        errMsg.includes('not a 3d object') ||
        errMsg.includes('top level object is a 2d');
      const is2DGenerateMode = is2DGenerateValue(previewParameters?.generate);
      if (is2DError || is2DGenerateMode) {
        const draft2DSuccess =
          await this.renderDraft2DPreview(previewParameters);
        if (draft2DSuccess) return;
      }

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
      format: result.format || 'stl',
      stats: result.stats,
      durationMs,
      timing: result.timing || {},
      timestamp: Date.now(),
    });
  }

  clearCache() {
    this.previewCache.clear();
    this.previewParamHash = null;
    this.previewCacheKey = null;
    this.fullRenderParamHash = null;
    this.fullQualitySTL = null;
    this.fullQualityFormat = null;
    this.fullQualityConsoleOutput = null;
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
        // Include console output even from cached results
        consoleOutput: this.fullQualityConsoleOutput || '',
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
        paramTypes: this.paramTypes,
        ...(quality ? { quality } : {}),
        onProgress: (percent, message) => {
          this.onProgress(percent, message, 'full');
        },
      }
    );

    // Store for reuse
    this.fullQualitySTL = result.stl;
    this.fullQualityFormat = result.format || 'stl';
    this.fullQualityStats = result.stats;
    this.fullRenderParamHash = paramHash;
    this.fullQualityKey = qualityKey;
    // Store console output for display in Console panel
    this.fullQualityConsoleOutput = result.consoleOutput || '';

    // Also update the preview with full quality result
    try {
      const resultFormat = result.format || 'stl';
      const currentPreviewHasColors = Boolean(
        this.previewManager?._getPrimaryGeometry?.()?.attributes?.color
      );
      const shouldPreserveColorPreview =
        resultFormat === 'stl' && currentPreviewHasColors;
      if (
        this.previewManager?.setColorOverride &&
        this.previewManager.colorOverrideEnabled
      ) {
        const previewColor = this.resolvePreviewColor(parameters);
        if (previewColor !== null) {
          this.previewManager.setColorOverride(previewColor);
        }
      }
      // Full quality render = theme default color (null clears preview/laser tint)
      if (this.previewManager?.setRenderState) {
        this.previewManager.setRenderState(
          this._detectRenderState(parameters, true)
        );
      }
      if (shouldPreserveColorPreview) {
        console.log(
          '[AutoPreview] Preserving current color preview during STL generate'
        );
      } else if (resultFormat === 'off' && this.previewManager?.loadOFF) {
        // Preserve camera position on subsequent loads (after initial preview)
        await this.previewManager.loadOFF(result.stl, {
          preserveCamera: this.initialPreviewDone,
        });
        this.previewParamHash = paramHash;
        this.previewCacheKey = cacheKey;
        this.initialPreviewDone = true;
      } else if (this.previewManager?.loadSTL) {
        // Preserve camera position on subsequent loads (after initial preview)
        await this.previewManager.loadSTL(result.stl, {
          preserveCamera: this.initialPreviewDone,
        });
        this.previewParamHash = paramHash;
        this.previewCacheKey = cacheKey;
        // Mark initial preview as done after successful load
        this.initialPreviewDone = true;
      }
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
   * Attempt a draft-quality SVG render for 2D models.
   * Called when renderPreview() catches a MODEL_IS_2D error from the WASM worker.
   * @param {Object} parameters - Parameter values used for the original render
   * @returns {Promise<boolean>} true if SVG preview was shown successfully
   */
  async renderDraft2DPreview(parameters) {
    try {
      const result = await this.renderController.renderPreview(
        this.currentScadContent,
        parameters,
        {
          outputFormat: 'svg',
          files: this.projectFiles,
          mainFile: this.mainFilePath,
          libraries: this.enabledLibraries,
          paramTypes: this.paramTypes,
          quality: { name: 'draft', $fn: 16 },
        }
      );
      if (result?.stl || result?.data) {
        let svgText =
          typeof result.stl === 'string'
            ? result.stl
            : new TextDecoder().decode(result.stl || result.data);

        // Pre-inject F5-draft parity styling into SVG before show2DPreview.
        // Desktop OpenSCAD F5 preview for 2D first-layer: #7A9F7A sage green.
        // Ref: Testing Round 7 color-codes.json preview_colors for laser-cut-first-layer.
        const draftStyle =
          '<style data-forge-preview="true">' +
          'path,polygon,polyline,circle,ellipse,rect{fill:#7A9F7A;stroke:#7A9F7A;stroke-width:0.25;fill-opacity:0.9}' +
          'line{stroke:#7A9F7A;stroke-width:0.25}' +
          '</style>';
        svgText = svgText.replace(
          /(<svg[^>]*>)/i,
          '$1' + draftStyle
        );

        if (typeof this.previewManager?.show2DPreviewAs3DPlane === 'function') {
          await this.previewManager.show2DPreviewAs3DPlane(svgText, { mode: 'draft' });
        } else {
          this.previewManager?.show2DPreview?.(svgText, { mode: 'draft' });
        }

        this.setState(PREVIEW_STATE.CURRENT, {
          code: 'DRAFT_2D',
          stats: result.stats,
        });
        return true;
      }
    } catch (svgError) {
      const msg = (svgError?.message || '').toLowerCase();
      if (svgError?.code === 'MODEL_NOT_2D' || msg.includes('not a 2d')) {
        try {
          const fallbackResult = await this.renderController.render2DFallback(
            this.currentScadContent,
            parameters,
            {
              outputFormat: 'svg',
              files: this.projectFiles,
              mainFile: this.mainFilePath,
              libraries: this.enabledLibraries,
            }
          );
          let svgText =
            typeof fallbackResult.stl === 'string'
              ? fallbackResult.stl
              : new TextDecoder().decode(
                  fallbackResult.stl || fallbackResult.data
                );
          const draftFallbackStyle =
            '<style data-forge-preview="true">' +
            'path,polygon,polyline,circle,ellipse,rect{fill:#7A9F7A;stroke:#7A9F7A;stroke-width:0.25;fill-opacity:0.9}' +
            'line{stroke:#7A9F7A;stroke-width:0.25}' +
            '</style>';
          svgText = svgText.replace(/(<svg[^>]*>)/i, '$1' + draftFallbackStyle);
          if (typeof this.previewManager?.show2DPreviewAs3DPlane === 'function') {
            await this.previewManager.show2DPreviewAs3DPlane(svgText, { mode: 'draft' });
          } else {
            this.previewManager?.show2DPreview?.(svgText, { mode: 'draft' });
          }
          this.setState(PREVIEW_STATE.CURRENT, {
            code: 'DRAFT_2D_FALLBACK',
            stats: fallbackResult.stats,
          });
          return true;
        } catch {
          /* fall through */
        }
      }
    }
    return false;
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
   * Format-agnostic accessor for the current full-quality output.
   * Returns data, format, and stats for any generated output type.
   * @param {Object} parameters - Current parameter values
   * @returns {Object|null} { data, format, stats } or null
   */
  getCurrentFullOutput(parameters) {
    const paramHash = this.hashParams(parameters);
    if (paramHash === this.fullRenderParamHash && this.fullQualitySTL) {
      return {
        data: this.fullQualitySTL,
        format: this.fullQualityFormat || 'stl',
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

  dispose() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    this.pendingParameters = null;
    this.pendingParamHash = null;
    this.pendingPreviewKey = null;
    this.clearCache();
    this.fullQualitySTL = null;
    this.fullQualityFormat = null;
    this.fullQualityStats = null;
    this.fullQualityKey = null;

    this.state = PREVIEW_STATE.IDLE;
    this.currentScadContent = null;
    this.currentParamHash = null;
    this.previewParamHash = null;
    this.previewCacheKey = null;
    this.currentPreviewKey = null;
    this.fullRenderParamHash = null;
    this.scadVersion = 0;
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
