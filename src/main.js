/**
 * OpenSCAD Assistive Forge - Main Entry Point
 * @license GPL-3.0-or-later
 */

import './styles/main.css';
import { extractParameters } from './js/parser.js';
import {
  renderParameterUI,
  setLimitsUnlocked,
  getAllDefaults,
  focusParameter,
  locateParameterKey,
  setParameterValue as _setParameterValue,
} from './js/ui-generator.js';
import { stateManager } from './js/state.js';
import {
  downloadSTL,
  downloadFile,
  generateFilename,
  formatFileSize,
  sanitizeFilename,
  OUTPUT_FORMATS,
} from './js/download.js';
import {
  RenderController,
  RENDER_QUALITY,
  estimateRenderTime,
} from './js/render-controller.js';
import {
  escapeHtml,
  isValidServiceWorkerMessage,
} from './js/html-utils.js';
import {
  getQualityPreset,
  COMPLEXITY_TIER,
} from './js/quality-tiers.js';
import { getThreeModule } from './js/preview.js';
import { normalizeHexColor } from './js/color-utils.js';
import {
  AutoPreviewController,
  PREVIEW_STATE,
} from './js/auto-preview-controller.js';
import { resolve2DExportIntent, isNonPreviewable } from './js/render-intent.js';
import {
  applyCompanionAliases,
  getOverlaySvgTarget,
} from './js/zip-handler.js';
import { loadManifest, ManifestError } from './js/manifest-loader.js';
import { getConsolePanel } from './js/console-panel.js';
import {
  getErrorLogPanel,
  initAddStructuredError,
} from './js/error-log-panel.js';
import { themeManager, initThemeToggle } from './js/theme-manager.js';
import {
  presetManager,
  extractScadVersion,
  checkMigrationAvailable,
  migrateFromLegacyStorage,
  dismissMigrationOffer,
  coercePresetValues,
} from './js/preset-manager.js';
import { ComparisonController } from './js/comparison-controller.js';
import { ComparisonView } from './js/comparison-view.js';
import { libraryManager, LIBRARY_DEFINITIONS } from './js/library-manager.js';
import { RenderQueue } from './js/render-queue.js';
import {
  openModal,
  closeModal,
  initStaticModals,
  isAnyModalOpen,
} from './js/modal-manager.js';
import { translateError } from './js/error-translator.js';
import {
  getStorageEstimate,
  clearCachedData as _clearCachedData,
  isFirstVisit,
  markFirstVisitComplete,
  updateStoragePrefs,
  shouldDeferLargeDownloads,
  formatBytes as _formatBytes,
  // v2: Persistence and backup
  checkPersistentStorage as _checkPersistentStorage,
  requestPersistentStorage as _requestPersistentStorage,
  clearCacheWithOptions,
  getDetailedStorageInfo,
  exportProjectsBackup,
  exportSingleProject,
  importProjectsBackup,
} from './js/storage-manager.js';
// showWorkflowProgress / hideWorkflowProgress moved to hfm-controller.js (applyToolbarModeVisibility)
import { startTutorial } from './js/tutorial-sandbox.js';
import { initDrawerController } from './js/drawer-controller.js';
import { initPreviewSettingsDrawer } from './js/preview-settings-drawer.js';
import { initCameraPanelController } from './js/camera-panel-controller.js';
import { initSequenceDetector } from './js/_seq.js';
import {
  createGamepadController,
  isGamepadSupported,
} from './js/gamepad-controller.js';
import {
  initKeyboardShortcuts,
  keyboardConfig,
  initShortcutsModal,
} from './js/keyboard-config.js';
import {
  isEnabled as _isEnabled,
  debugFlags,
  FLAGS as _FLAGS,
} from './js/feature-flags.js';
import { initSearchableCombobox } from './js/searchable-combobox.js';
import { initCompanionFilesController } from './js/companion-files-controller.js';
import { initCSPReporter } from './js/csp-reporter.js';
import {
  migrateStorageKeys,
  getAppPrefKey,
  getDrawerStateKey,
} from './js/storage-keys.js';
import {
  initImageMeasurement,
  openFullscreen as measureOpenFullscreen,
  closeFullscreen as measureCloseFullscreen,
  loadImageFromDataURL,
  setMeasureMode,
  clearRulerPoints,
  getCalibDistancePx,
} from './js/image-measurement.js';
import * as SharedImageStore from './js/shared-image-store.js';
import {
  getUnit,
  setUnit,
  getScaleFactor,
  setScaleFactor,
  onUnitChange,
  onScaleChange,
} from './js/unit-sync.js';

// Storage keys using standardized naming convention
const STORAGE_KEY_AUTO_PREVIEW_ENABLED = getAppPrefKey('auto-preview-enabled');
const STORAGE_KEY_PREVIEW_QUALITY = getAppPrefKey('preview-quality-mode');
const STORAGE_KEY_RECOVERY_SOURCE = getAppPrefKey('recovery-source');
const STORAGE_KEY_RECOVERY_TIMESTAMP = getAppPrefKey('recovery-timestamp');
const STORAGE_KEY_STATUS_BAR = getAppPrefKey('status-bar');
// Overlay, grid, and auto-rotate storage keys moved to overlay-grid-controller.js
const STORAGE_KEY_MODEL_COLOR = getAppPrefKey('model-color');
const STORAGE_KEY_MODEL_COLOR_ENABLED = getAppPrefKey('model-color-enabled');
const STORAGE_KEY_MODEL_OPACITY = getAppPrefKey('model-opacity');
const STORAGE_KEY_BRIGHTNESS = getAppPrefKey('brightness');
const STORAGE_KEY_CONTRAST = getAppPrefKey('contrast');
const STORAGE_KEY_MODEL_APPEARANCE_ENABLED = getAppPrefKey(
  'model-appearance-enabled'
);
const STORAGE_KEY_PARAM_PANEL_COLLAPSED = getDrawerStateKey('parameters');
const STORAGE_KEY_LAYOUT_SIZES = getAppPrefKey('layout-sizes');
import {
  announce as _announce,
  announceImmediate,
  announceCameraAction,
  announceError as _announceError,
  POLITENESS as _POLITENESS,
} from './js/announcer.js';
// Expert Mode (M2) - Code editor integration
import { getModeManager } from './js/mode-manager.js';
// UI Mode Controller - Basic/Advanced interface layout switching
import { getUIModeController } from './js/ui-mode-controller.js';
// Toolbar Menu Controller - File|Edit|Design|View|Window|Help menu bar
import { getToolbarMenuController } from './js/toolbar-menu-controller.js';
import { initParamDetailController } from './js/param-detail-controller.js';
import { initOverlayGridController } from './js/overlay-grid-controller.js';
import { initSavedProjectsUI } from './js/saved-projects-ui.js';
import { getFileActionsController } from './js/file-actions-controller.js';
import { getEditActionsController } from './js/edit-actions-controller.js';
import { getDesignPanelController } from './js/design-panel-controller.js';
import { getDisplayOptionsController } from './js/display-options-controller.js';
// Animation controller import preserved for future development â€” see ./js/animation-controller.js
// import { getAnimationController } from './js/animation-controller.js';
import { getEditorStateManager } from './js/editor-state-manager.js';
import { TextareaEditor } from './js/textarea-editor.js';
import { showConfirmDialog } from './js/dialogs.js';
import {
  initHfmController,
  exportFormatFromMenu,
  applyToolbarModeVisibility,
} from './js/hfm-controller.js';
import {
  EXAMPLE_DEFINITIONS,
  showProcessingOverlay,
  initFileHandler,
} from './js/file-handler.js';
import {
  initMemoryMonitor,
  getMemoryMonitor as _getMemoryMonitor,
  MemoryState as _MemoryState,
  MemoryRecovery as _MemoryRecovery,
} from './js/memory-monitor.js';
import {
  initSavedProjectsDB,
  updateProject,
  getSavedProjectsSummary as _getSavedProjectsSummary,
  clearAllSavedProjects as _clearAllSavedProjects,
  getStorageDiagnostics,
  // v2: Folder operations
  createFolder as _createFolder,
  moveFolder as _moveFolder,
} from './js/saved-projects-manager.js';
import Split from 'split.js';

/**
 * Resolve parameters for 2D export (SVG/DXF) using the parsed parameter schema.
 * For each parameter that has an enum with a 2D-compatible value, overrides the
 * current value so the model produces 2D geometry for the export.
 *
 * Replaces the worker-side hardcoded approach (which only handled keyguard-specific
 * parameters and missed the critical `generate` parameter).
 *
 * @param {Object} parameters - Current UI parameter values
 * @param {Object|null} schema - Parsed schema from extractParameters() (schema.parameters)
 * @param {string} format - Output format ('svg' or 'dxf')
 * @returns {Object} Parameter object with 2D-compatible overrides applied
 */
function resolve2DExportParameters(parameters, schema, format) {
  const resolved = resolve2DExportIntent(parameters, schema, format);

  if (resolved !== parameters) {
    const adjustments = Object.entries(resolved).filter(
      ([k, v]) => parameters[k] !== v
    );
    if (adjustments.length > 0) {
      console.debug(
        '[resolve2D] Auto-adjusted parameters for 2D export:',
        adjustments
      );
    } else {
      console.debug(
        '[resolve2D] No parameter adjustments needed for 2D export'
      );
    }
  }

  return resolved;
}

// EXAMPLE_DEFINITIONS moved to file-handler.js

// Feature detection
function checkBrowserSupport() {
  const checks = {
    wasm: typeof WebAssembly !== 'undefined',
    worker: typeof Worker !== 'undefined',
    fileApi: typeof FileReader !== 'undefined',
    modules: 'noModule' in HTMLScriptElement.prototype,
  };

  const missing = Object.entries(checks)
    .filter(([_, supported]) => !supported)
    .map(([feature]) => feature);

  return { supported: missing.length === 0, missing };
}

// Show unsupported browser message
function showUnsupportedBrowser(missing) {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="unsupported-browser" role="alert" style="padding: 2rem; max-width: 600px; margin: 2rem auto;">
      <h2>Browser Not Supported</h2>
      <p>This application requires a modern browser with WebAssembly support.</p>
      <p>Please use one of the following:</p>
      <ul>
        <li>Chrome 67 or newer</li>
        <li>Firefox 79 or newer</li>
        <li>Safari 15.2 or newer</li>
        <li>Edge 79 or newer</li>
      </ul>
      <p><strong>Missing features:</strong> ${missing.join(', ')}</p>
    </div>
  `;
}

// Global render controller, preview manager, and auto-preview controller
let renderController = null;
let previewManager = null;
let autoPreviewController = null;
let comparisonController = null;
let comparisonView = null;
let renderQueue = null;

// Track which saved project is currently loaded (for auto-saving companion files)
let currentSavedProjectId = null;

// companionCurrentPath moved to companion-files-controller.js

// Screen reader announcer - now uses centralized announcer.js
// (Local implementation removed - use imported announce/announceImmediate/announceError)

// HFM/Alt View state and functions moved to hfm-controller.js
// Dialog functions moved to dialogs.js
// sanitizeUrlParams, exportFormatFromMenu, applyToolbarModeVisibility moved to hfm-controller.js

// Initialize app
async function initApp() {
  console.log('OpenSCAD Assistive Forge v4.1.0');
  console.log('Initializing...');

  // Initialize Milestone 0 Foundation systems early
  // Feature flags: Enable controlled rollout of new features
  debugFlags(); // Log flag states for debugging

  // CSP Reporter: Monitor Content-Security-Policy violations (report-only mode)
  initCSPReporter();

  // Storage key migration: One-time migration of localStorage keys to standardized naming
  // Must run before any localStorage reads to ensure consistent key access
  migrateStorageKeys();

  // Recovery Mode: Detect if we're recovering from a memory-related crash
  const urlParams = new URLSearchParams(window.location.search);
  const isRecoveryMode = urlParams.get('recovery') === 'true';

  // Crash detection: If WASM init started but never completed, we may have crashed.
  // The flag is set before WASM init and cleared after success.
  const wasmCrashDetected =
    localStorage.getItem('openscad-forge-wasm-init-started') === 'true' &&
    localStorage.getItem('openscad-forge-wasm-init-completed') !== 'true';

  if (wasmCrashDetected && !isRecoveryMode) {
    console.warn(
      '[Recovery] Detected unclean WASM shutdown â€” offering recovery mode'
    );
    // Clear the flags so we don't loop
    localStorage.removeItem('openscad-forge-wasm-init-started');
    localStorage.removeItem('openscad-forge-wasm-init-completed');
    // Auto-enter recovery mode
    window.location.href = window.location.pathname + '?recovery=true';
    return; // stop initialization
  }

  if (isRecoveryMode) {
    console.log('[Recovery] Recovery mode activated');

    // Apply conservative settings per B.5.4 Recovery Mode Specification:
    // - Auto-preview OFF (no automatic renders)
    // - Quality set to fast (minimum quality settings)
    // - Monaco disabled (use textarea only â€” less memory overhead)
    localStorage.setItem(STORAGE_KEY_AUTO_PREVIEW_ENABLED, 'false');
    localStorage.setItem(STORAGE_KEY_PREVIEW_QUALITY, 'fast');
    // Disable Monaco in recovery mode to reduce memory footprint.
    // The user can re-enable it manually from settings after recovery.
    localStorage.setItem('openscad-forge-flag-monaco_editor', 'false');

    // Clean up crash detection flags
    localStorage.removeItem('openscad-forge-wasm-init-started');
    localStorage.removeItem('openscad-forge-wasm-init-completed');

    // Check for recovery data
    const recoverySource = localStorage.getItem(STORAGE_KEY_RECOVERY_SOURCE);
    const recoveryTimestamp = localStorage.getItem(
      STORAGE_KEY_RECOVERY_TIMESTAMP
    );

    if (recoverySource && recoveryTimestamp) {
      const elapsed = Date.now() - parseInt(recoveryTimestamp, 10);
      // Only restore if recovery data is less than 1 hour old
      if (elapsed < 3600000) {
        console.log('[Recovery] Found recovery data, will restore after init');
        // Store for later restoration after UI is ready
        window._recoverySource = recoverySource;
      }
      // Clear recovery data
      localStorage.removeItem(STORAGE_KEY_RECOVERY_SOURCE);
      localStorage.removeItem(STORAGE_KEY_RECOVERY_TIMESTAMP);
    }

    // Remove recovery param from URL without reloading
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete('recovery');
    window.history.replaceState({}, document.title, cleanUrl.toString());

    // Show recovery notice
    setTimeout(() => {
      const statusArea = document.getElementById('statusArea');
      if (statusArea) {
        statusArea.innerHTML = `
          <div class="status-notice status-warning" role="alert">
            <strong>Recovery Mode:</strong> Running with reduced settings.
            Auto-preview is disabled, quality is set to fast, and the code editor uses a lightweight textarea.
            <button class="btn btn-sm btn-secondary" onclick="this.parentElement.remove()">Dismiss</button>
          </div>
        `;
      }
    }, 1000);
  }

  // Memory Monitor: Track memory usage and graceful degradation
  // Will be connected to render controller after WASM init
  // Note: Monitor is initialized here and callbacks fire on state changes

  /**
   * Update memory UI elements based on current state
   * @param {string} state - Memory state (normal, warning, critical, emergency)
   * @param {Object} usage - Memory usage info
   */
  function updateMemoryUI(state, usage) {
    const badge = document.getElementById('memoryStatusBadge');
    const badgeText = document.getElementById('memoryStatusText');
    const banner = document.getElementById('memoryBanner');
    const bannerText = document.getElementById('memoryBannerText');

    if (!badge || !banner) return;

    // Update badge
    badge.dataset.state = state;
    if (badgeText) {
      badgeText.textContent = `${usage.heapMB} MB`;
    }

    // Show badge when not normal (or always show if user prefers)
    if (state === 'normal') {
      badge.classList.add('hidden');
    } else {
      badge.classList.remove('hidden');
    }

    // Update banner for critical/emergency states
    if (state === 'critical' || state === 'emergency') {
      banner.dataset.state = state;
      banner.dataset.visible = 'true';

      if (bannerText) {
        if (state === 'emergency') {
          bannerText.textContent =
            'Critical memory usage! Auto-preview disabled. Please save your work immediately.';
        } else {
          bannerText.textContent =
            'High memory usage detected. Consider reducing model complexity or saving your work.';
        }
      }
    } else {
      banner.dataset.visible = 'false';
    }
  }

  const _memoryMonitor = initMemoryMonitor({
    onWarning: (usage) => {
      console.log(`[Memory] Warning state: ${usage.heapMB}MB`);
      updateMemoryUI('warning', usage);
    },
    onCritical: (usage) => {
      console.log(`[Memory] Critical state: ${usage.heapMB}MB`);
      updateMemoryUI('critical', usage);
    },
    onEmergency: (usage) => {
      console.log(`[Memory] Emergency state: ${usage.heapMB}MB`);
      updateMemoryUI('emergency', usage);
      _announceError(
        `Memory emergency: usage at ${usage.heapMB} megabytes. Auto-preview has been disabled.`
      );
      // Disable auto-preview at emergency level
      if (typeof autoPreviewUserEnabled !== 'undefined') {
        autoPreviewUserEnabled = false;
        const autoPreviewToggle = document.getElementById('autoPreviewToggle');
        if (autoPreviewToggle) {
          autoPreviewToggle.checked = false;
        }
      }
    },
    onRecovery: (usage) => {
      console.log(`[Memory] Recovered to normal: ${usage.heapMB}MB`);
      updateMemoryUI('normal', usage);
    },
  });

  // Memory banner action handlers
  document
    .getElementById('memoryBannerDismiss')
    ?.addEventListener('click', () => {
      const banner = document.getElementById('memoryBanner');
      if (banner) banner.dataset.visible = 'false';
    });

  document.getElementById('memoryBannerSave')?.addEventListener('click', () => {
    // Trigger project save - dispatch event that saved-projects system listens for
    document.getElementById('saveProjectBtn')?.click();
  });

  document
    .getElementById('memoryBannerReduceFn')
    ?.addEventListener('click', () => {
      // Reduce quality by switching to low quality mode
      const qualitySelect = document.getElementById('qualityPreset');
      if (qualitySelect) {
        qualitySelect.value = 'low';
        qualitySelect.dispatchEvent(new Event('change'));
      }
      // Also reduce auto-preview quality
      const previewQualitySelect =
        document.getElementById('previewQualityMode');
      if (previewQualitySelect) {
        previewQualitySelect.value = 'fast';
        previewQualitySelect.dispatchEvent(new Event('change'));
      }
      console.log('[Memory] Quality reduced to conserve memory');
    });

  document
    .getElementById('memoryBannerDisableAuto')
    ?.addEventListener('click', () => {
      // Disable auto-preview
      const autoPreviewToggle = document.getElementById('autoPreviewToggle');
      if (autoPreviewToggle && autoPreviewToggle.checked) {
        autoPreviewToggle.checked = false;
        autoPreviewToggle.dispatchEvent(new Event('change'));
      }
      console.log('[Memory] Auto-preview disabled to conserve memory');
    });

  document
    .getElementById('memoryBannerExport')
    ?.addEventListener('click', () => {
      // Trigger STL export
      const exportBtn = document.getElementById('renderExportButton');
      if (exportBtn) {
        exportBtn.click();
      }
      console.log('[Memory] STL export triggered for emergency save');
    });

  document
    .getElementById('memoryBannerReload')
    ?.addEventListener('click', () => {
      // Save current state to localStorage before reload
      try {
        const currentCode =
          document.getElementById('openscadSource')?.value || '';
        if (currentCode) {
          localStorage.setItem(STORAGE_KEY_RECOVERY_SOURCE, currentCode);
          localStorage.setItem(
            STORAGE_KEY_RECOVERY_TIMESTAMP,
            Date.now().toString()
          );
        }
      } catch (e) {
        console.error('[Memory] Failed to save recovery state:', e);
      }
      // Reload in recovery mode
      window.location.href = window.location.pathname + '?recovery=true';
    });

  // Listen for storage-quota-exceeded events dispatched by preset-manager
  // when localStorage is full, so the user gets visible + audible feedback.
  window.addEventListener('storage-quota-exceeded', (e) => {
    const msg =
      e.detail?.message || 'Storage is full. Data could not be saved.';
    updateStatus(msg, 'error');
    _announceError(msg);
  });

  let statusArea = null;
  let cameraPanelController = null; // Declared here, initialized later
  let autoPreviewEnabled = true;
  // Runtime mapping from preset name to companion file paths (built on ZIP load).
  // Stores path references only â€” content is resolved lazily on preset activation.
  let presetCompanionMap = null;
  // Canonical project files snapshot used as the clean base when applying presets.
  // This prevents alias-mounted companion files from one preset bleeding into the next.
  let canonicalProjectFiles = null;
  // Preset tracking state â€” must be declared before handleFile (which calls
  // forceClearPresetSelection) to avoid a TDZ error during draft restoration.
  let isLoadingPreset = false;
  let currentPresetSignature = null;
  let isPresetDirty = false;
  let autoPreviewUserEnabled = true;
  let previewQuality = RENDER_QUALITY.PREVIEW;

  // CRITICAL: Declare DOM element variables early to avoid Temporal Dead Zone errors
  // These will be assigned actual values later when DOM queries are performed
  let previewStatusBar = null;
  let previewStatusText = null;
  let previewStatusStats = null;

  // CRITICAL: Declare memoryPollInterval early to avoid TDZ in startMemoryPolling()
  let memoryPollInterval = null;

  // CRITICAL: Import validation constants early to avoid TDZ in handleFile()
  let FILE_SIZE_LIMITS = null;
  let validateFileUpload = null;
  try {
    const validationModule = await import('./js/validation-constants.js');
    FILE_SIZE_LIMITS = validationModule.FILE_SIZE_LIMITS;
  } catch (e) {
    console.error('Failed to import validation constants:', e);
  }

  // File handler controller -- declared early so wrappers can reference it;
  // assigned after all const deps are available (see initFileHandler call below).
  let fileHandler; // eslint-disable-line prefer-const

  function cloneProjectFiles(files) {
    return files ? new Map(files) : null;
  }

  function setCanonicalProjectFiles(files) {
    canonicalProjectFiles = cloneProjectFiles(files);
  }
  let previewQualityMode = 'auto';

  const AUTO_PREVIEW_FORCE_FAST_MS = 2 * 60 * 1000;
  // MANIFOLD OPTIMIZED: Raised threshold since Manifold renders much faster
  // Previously 5s, now 15s to avoid unnecessary fast-mode triggers
  const AUTO_PREVIEW_SLOW_RENDER_MS = 15000;
  // MANIFOLD OPTIMIZED: Raised threshold since Manifold handles high polygon counts efficiently
  // Previously 150K, now 300K as Manifold can handle complex geometry
  const AUTO_PREVIEW_TRIANGLE_THRESHOLD = 300000;
  const autoPreviewHints = {
    forceFastUntil: 0,
    lastPreviewDurationMs: null,
    lastPreviewTriangles: null,
  };
  let adaptivePreviewMemo = { key: null, info: null };

  const updateBanner = document.getElementById('updateBanner');
  const updateBannerRefreshBtn = document.getElementById('updateBannerRefresh');
  const updateBannerDismissBtn = document.getElementById('updateBannerDismiss');

  // Register Service Worker for PWA support
  // In development, avoid Service Worker caching/stale assets which can break testing.
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
      });
      console.log('[PWA] Service Worker registered:', registration.scope);

      let waitingWorker = registration.waiting || null;
      let refreshRequested = false;
      let cacheClearPending = false;

      const showUpdateBanner = (worker) => {
        if (!updateBanner) return;
        waitingWorker = worker;
        updateBanner.classList.remove('hidden');
      };

      const hideUpdateBanner = () => {
        if (!updateBanner) return;
        updateBanner.classList.add('hidden');
      };

      const requestUpdate = () => {
        if (!waitingWorker) return;
        refreshRequested = true;
        updateStatus('Updating app... Reloading soon.');
        waitingWorker.postMessage({ type: 'SKIP_WAITING' });
      };

      const CACHE_CLEAR_TIMEOUT = 10000; // 10 seconds before showing recovery dialog
      const CACHE_CLEAR_EXPECTED = 3000; // Expected time for cache clear

      const requestCacheClear = async () => {
        if (!navigator.serviceWorker?.controller) {
          updateStatus('Cache clear unavailable', 'error');
          return;
        }
        if (cacheClearPending) return;
        cacheClearPending = true;

        // Update button to show progress
        const clearCacheBtn = document.getElementById('clearCacheBtn');
        const originalBtnText = clearCacheBtn?.textContent;
        if (clearCacheBtn) {
          clearCacheBtn.disabled = true;
          clearCacheBtn.textContent = 'Clearing...';
          clearCacheBtn.setAttribute('aria-busy', 'true');
        }

        updateStatus('Clearing cache...');
        navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_CACHE' });

        // Track completion via message event
        let cacheCleared = false;
        const onCacheCleared = (event) => {
          // Validate message type against allowlist
          if (!isValidServiceWorkerMessage(event, ['CACHE_CLEARED'])) {
            return; // Ignore invalid messages
          }
          if (event.data.type === 'CACHE_CLEARED') {
            cacheCleared = true;
            navigator.serviceWorker.removeEventListener(
              'message',
              onCacheCleared
            );
          }
        };
        navigator.serviceWorker.addEventListener('message', onCacheCleared);

        // Wait for expected time, then check progress
        await new Promise((resolve) =>
          setTimeout(resolve, CACHE_CLEAR_EXPECTED)
        );

        if (cacheCleared || !cacheClearPending) {
          // Cache was cleared successfully
          cacheClearPending = false;
          updateStatus('Cache cleared. Reloading...', 'success');
          window.location.reload();
          return;
        }

        // Cache clear is taking longer - wait until timeout
        const remainingTime = CACHE_CLEAR_TIMEOUT - CACHE_CLEAR_EXPECTED;
        await new Promise((resolve) => setTimeout(resolve, remainingTime));

        if (cacheCleared || !cacheClearPending) {
          // Cleared during extended wait
          cacheClearPending = false;
          updateStatus('Cache cleared. Reloading...', 'success');
          window.location.reload();
          return;
        }

        // Show recovery dialog - cache clear is hanging
        navigator.serviceWorker.removeEventListener('message', onCacheCleared);

        if (clearCacheBtn) {
          clearCacheBtn.disabled = false;
          clearCacheBtn.textContent = originalBtnText || 'Clear Cache';
          clearCacheBtn.removeAttribute('aria-busy');
        }

        const action = await showCacheRecoveryDialog();
        cacheClearPending = false;

        if (action === 'force') {
          updateStatus('Force reloading...', 'success');
          window.location.reload();
        } else if (action === 'wait') {
          // User chose to wait - just reset state
          updateStatus('Cache clear may still be in progress');
        }
      };

      /**
       * Show recovery dialog when cache clear takes too long
       * @returns {Promise<string>} 'force', 'wait', or null
       */
      function showCacheRecoveryDialog() {
        return new Promise((resolve) => {
          const modal = document.createElement('div');
          modal.className = 'preset-modal confirm-modal';
          modal.setAttribute('role', 'alertdialog');
          modal.setAttribute('aria-labelledby', 'cacheRecoveryTitle');
          modal.setAttribute('aria-describedby', 'cacheRecoveryMessage');
          modal.setAttribute('aria-modal', 'true');

          modal.innerHTML = `
            <div class="preset-modal-content confirm-modal-content">
              <div class="preset-modal-header">
                <h3 id="cacheRecoveryTitle">Cache Clear Taking Longer Than Expected</h3>
              </div>
              <div class="modal-body">
                <p id="cacheRecoveryMessage">
                  The cache clearing operation is taking longer than usual. This can happen 
                  if there are many cached files or if the browser is busy.
                </p>
                <p>What would you like to do?</p>
              </div>
              <div class="preset-modal-footer">
                <button type="button" class="btn btn-outline" data-action="wait">Continue Waiting</button>
                <button type="button" class="btn btn-primary" data-action="force">Force Reload</button>
              </div>
            </div>
          `;

          const handleAction = (action) => {
            document.body.removeChild(modal);
            resolve(action);
          };

          modal.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-action]');
            if (btn) {
              handleAction(btn.dataset.action);
            } else if (e.target === modal) {
              handleAction(null);
            }
          });

          modal.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
              handleAction(null);
            }
          });

          document.body.appendChild(modal);
          modal.querySelector('button[data-action="force"]')?.focus();
        });
      }

      if (updateBannerRefreshBtn) {
        updateBannerRefreshBtn.addEventListener('click', requestUpdate);
      }
      if (updateBannerDismissBtn) {
        updateBannerDismissBtn.addEventListener('click', hideUpdateBanner);
      }

      const clearCacheBtn = document.getElementById('clearCacheBtn');
      if (clearCacheBtn) {
        clearCacheBtn.addEventListener('click', requestCacheClear);
        if (!navigator.serviceWorker.controller) {
          clearCacheBtn.disabled = true;
          clearCacheBtn.title =
            'Cache clearing is available after the service worker activates.';
        }
      }

      if (registration.waiting && navigator.serviceWorker.controller) {
        showUpdateBanner(registration.waiting);
      }

      // Handle updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        console.log('[PWA] Update found, installing new service worker');

        newWorker.addEventListener('statechange', () => {
          if (
            newWorker.state === 'installed' &&
            navigator.serviceWorker.controller
          ) {
            console.log('[PWA] New version available - waiting to activate');
            showUpdateBanner(newWorker);
          }
        });
      });

      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (clearCacheBtn) {
          clearCacheBtn.disabled = false;
          clearCacheBtn.title = '';
        }
        if (refreshRequested) {
          refreshRequested = false;
          window.location.reload();
        }
      });

      navigator.serviceWorker.addEventListener('message', (event) => {
        // Validate message type against allowlist
        if (!isValidServiceWorkerMessage(event, ['CACHE_CLEARED'])) {
          console.warn(
            '[SW] Ignoring invalid or unexpected message:',
            event.data
          );
          return;
        }

        if (event.data.type === 'CACHE_CLEARED') {
          cacheClearPending = false;
          updateStatus('Cache cleared. Reloading...', 'success');
          window.location.reload();
        }
      });

      // Check for updates periodically (every hour)
      setInterval(
        () => {
          registration.update();
        },
        60 * 60 * 1000
      );
    } catch (error) {
      console.error('[PWA] Service Worker registration failed:', error);
      const clearCacheBtn = document.getElementById('clearCacheBtn');
      if (clearCacheBtn) {
        clearCacheBtn.disabled = true;
        clearCacheBtn.title = 'Cache clearing is unavailable right now.';
      }
    }
  } else {
    console.log('[PWA] Service Worker disabled (dev) or not supported');
    const clearCacheBtn = document.getElementById('clearCacheBtn');
    if (clearCacheBtn) {
      clearCacheBtn.disabled = true;
      clearCacheBtn.title = 'Cache clearing is available in the installed app.';
    }
  }

  // Note: App is installable via browser-native prompts (Chrome address bar, iOS Share menu)
  // No custom install UI needed

  // Show success message for native installation
  window.addEventListener('appinstalled', () => {
    console.log('[PWA] App installed successfully via browser');

    const statusArea = document.getElementById('statusArea');
    if (statusArea) {
      const originalText = statusArea.textContent;
      statusArea.textContent = 'âœ… App installed! You can now use it offline.';
      setTimeout(() => {
        statusArea.textContent = originalText;
      }, 5000);
    }
  });

  // B1 fix: Terminate WASM worker before page unload to prevent browser freeze.
  // Without this, a mid-render worker blocks the unload sequence on some browsers.
  window.addEventListener('beforeunload', () => {
    if (renderController) {
      renderController.terminate();
    }
  });

  // Initialize theme (before any UI rendering)
  themeManager.init();

  // Initialize static modal focus management (WCAG 2.2 SC 2.4.11 Focus Not Obscured)
  initStaticModals();

  // Initialize configurable keyboard shortcuts
  initKeyboardShortcuts();

  // Initialize saved projects UI controller
  // updateCompanionSaveButton is wrapped because companionFilesCtrl is
  // created later (after DOM element queries); the wrapper defers safely
  // since savedProjectsUI only invokes it after user interaction.
  const savedProjectsUI = initSavedProjectsUI({
    showConfirmDialog,
    showProcessingOverlay,
    handleFile: (...args) => fileHandler.handleFile(...args),
    updateStatus,
    updateCompanionSaveButton: (...args) => companionFilesCtrl.updateCompanionSaveButton(...args),
    downloadSingleProject,
    setCurrentSavedProjectId: (id) => {
      currentSavedProjectId = id;
    },
  });

  // Initialize saved projects database
  try {
    const { type } = await initSavedProjectsDB();
    console.log(`[Saved Projects] Initialized with ${type}`);

    // Log diagnostics in development mode or if there are potential issues
    const diagnostics = await getStorageDiagnostics();
    if (
      diagnostics.indexedDbProjectCount !== diagnostics.localStorageProjectCount
    ) {
      console.warn('[Saved Projects] Storage mismatch detected:', {
        indexedDb: diagnostics.indexedDbProjectCount,
        localStorage: diagnostics.localStorageProjectCount,
      });
    }

    // Render saved projects list on welcome screen
    await savedProjectsUI.renderSavedProjectsList();
  } catch (error) {
    console.error('[Saved Projects] Initialization failed:', error);
    // Still try to render from localStorage as fallback
    try {
      await savedProjectsUI.renderSavedProjectsList();
    } catch (renderError) {
      console.error(
        '[Saved Projects] Render fallback also failed:',
        renderError
      );
    }
  }

  // Initialize gamepad controller (if supported)
  let gamepadController = null;
  if (isGamepadSupported()) {
    gamepadController = createGamepadController({
      cameraSensitivity: 2.0,
      parameterSensitivity: 1.0,
      deadzone: 0.15,
    });
    console.log('[Input] Gamepad controller initialized');
  }

  // Storage UI - Update storage display
  const formatStorageUsage = (usage) => {
    if (typeof usage !== 'number' || !Number.isFinite(usage) || usage < 0) {
      return 'Unknown';
    }
    if (usage === 0) {
      return '0 MB';
    }

    const gb = 1024 * 1024 * 1024;
    const mb = 1024 * 1024;
    const useGb = usage >= gb;
    const value = useGb ? usage / gb : usage / mb;
    const unit = useGb ? 'GB' : 'MB';
    const decimals = useGb ? 1 : value < 1 ? 3 : value < 10 ? 2 : 1;

    return `${parseFloat(value.toFixed(decimals))} ${unit}`;
  };

  async function updateStorageDisplay() {
    const estimate = await getStorageEstimate();

    if (!estimate.supported) {
      // Hide storage panel if not supported
      const storagePanel = document.querySelector('.storage-panel');
      const notSupported = document.getElementById('storageNotSupported');
      if (storagePanel) storagePanel.style.display = 'none';
      if (notSupported) notSupported.classList.remove('hidden');
      return;
    }

    const meterFill = document.querySelector('.storage-meter-fill');
    const usedEl = document.getElementById('storage-used');
    const meter = document.querySelector('.storage-meter');

    if (meterFill && meter) {
      meterFill.style.width = `${estimate.percentUsed}%`;
      meter.setAttribute('aria-valuenow', estimate.percentUsed);

      // Set warning level
      if (estimate.percentUsed > 90) {
        meterFill.setAttribute('data-warning', 'high');
      } else if (estimate.percentUsed > 75) {
        meterFill.setAttribute('data-warning', 'medium');
      } else {
        meterFill.removeAttribute('data-warning');
      }
    }

    const usageText = formatStorageUsage(estimate.usage);

    // Add context about what's being measured
    let displayText = `${usageText} used`;
    const isDevMode = import.meta.env.DEV;
    const hasServiceWorker =
      'serviceWorker' in navigator && navigator.serviceWorker.controller;

    // Show helpful context when storage is minimal
    if (estimate.usage < 1024 * 1024 && isDevMode && !hasServiceWorker) {
      displayText += ' (dev mode: assets not cached)';
    } else if (estimate.usage < 1024 * 1024 && !hasServiceWorker) {
      displayText += ' (service worker inactive)';
    }

    if (usedEl) usedEl.textContent = displayText;
  }

  // Smart Cache Clear Dialog (v2)
  async function showSmartCacheClearDialog() {
    try {
      const storageInfo = await getDetailedStorageInfo();

      const modal = document.createElement('div');
      modal.className = 'preset-modal cache-clear-dialog';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-labelledby', 'cacheClearTitle');
      modal.setAttribute('aria-modal', 'true');

      const hasProjects = storageInfo.savedDesignsCount > 0;

      modal.innerHTML = `
        <div class="preset-modal-content">
          <div class="preset-modal-header">
            <h3 id="cacheClearTitle" class="preset-modal-title">Clear Cache</h3>
          </div>

          <div class="preset-modal-body">
            <div class="cache-clear-warning">
              <span class="cache-clear-warning-icon" aria-hidden="true">âš ï¸</span>
              <div class="cache-clear-warning-text">
                <strong>Warning:</strong> This will delete all saved projects and cached app data by default.
                Check the box below if you want to keep your saved projects.
              </div>
            </div>

            <div class="cache-clear-sizes">
              <div class="cache-size-item">
                <div class="cache-size-label">App Cache</div>
                <div class="cache-size-value">${storageInfo.appCacheFormatted}</div>
              </div>
              <div class="cache-size-item">
                <div class="cache-size-label">Saved Projects</div>
                <div class="cache-size-value">${storageInfo.savedDesignsCount} project${storageInfo.savedDesignsCount !== 1 ? 's' : ''}</div>
              </div>
            </div>

            <div class="cache-clear-options">
              <label class="cache-clear-option">
                <input type="checkbox" id="clearAppCaches" checked />
                <div class="cache-clear-option-content">
                  <div class="cache-clear-option-label">Clear app caches (recommended)</div>
                  <div class="cache-clear-option-desc">Remove outdated app versions and cached resources</div>
                </div>
              </label>

              <label class="cache-clear-option preservation-off" id="preserveOption">
                <input type="checkbox" id="preserveSavedDesigns" />
                <div class="cache-clear-option-content">
                  <div class="cache-clear-option-label">
                    Keep my Saved Projects
                    <span class="preservation-indicator danger" id="preserveIndicator">
                      <span aria-hidden="true">âš ï¸</span> Will be deleted
                    </span>
                  </div>
                  <div class="cache-clear-option-desc">
                    ${hasProjects ? `Preserve ${storageInfo.savedDesignsCount} project${storageInfo.savedDesignsCount !== 1 ? 's' : ''} and ${storageInfo.foldersCount} folder${storageInfo.foldersCount !== 1 ? 's' : ''}` : 'No projects to preserve'}
                  </div>
                </div>
              </label>
            </div>

            ${
              hasProjects
                ? `
              <div class="cache-clear-backup-prompt">
                <span>ðŸ’¾</span>
                <span>Export a backup before clearing?</span>
                <button type="button" class="btn btn-sm btn-outline" id="exportBeforeClearBtn">
                  Export Backup
                </button>
              </div>
            `
                : ''
            }
          </div>

          <div class="preset-modal-footer">
            <button class="btn btn-secondary" id="cacheClearCancelBtn">Cancel</button>
            <button class="btn btn-danger" id="cacheClearConfirmBtn">Clear Cache</button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      // Wire up preserve checkbox visual feedback
      const preserveCheckbox = modal.querySelector('#preserveSavedDesigns');
      const preserveOption = modal.querySelector('#preserveOption');
      const preserveIndicator = modal.querySelector('#preserveIndicator');

      preserveCheckbox.addEventListener('change', () => {
        if (preserveCheckbox.checked) {
          preserveOption.classList.remove('preservation-off');
          preserveOption.classList.add('preservation-on');
          preserveIndicator.className = 'preservation-indicator safe';
          preserveIndicator.innerHTML =
            '<span aria-hidden="true">âœ“</span> Will be kept';
        } else {
          preserveOption.classList.remove('preservation-on');
          preserveOption.classList.add('preservation-off');
          preserveIndicator.className = 'preservation-indicator danger';
          preserveIndicator.innerHTML =
            '<span aria-hidden="true">âš ï¸</span> Will be deleted';
        }
      });

      // Export backup button
      const exportBtn = modal.querySelector('#exportBeforeClearBtn');
      if (exportBtn) {
        exportBtn.addEventListener('click', async () => {
          exportBtn.disabled = true;
          exportBtn.textContent = 'Exporting...';
          try {
            await handleExportBackup();
          } finally {
            exportBtn.disabled = false;
            exportBtn.textContent = 'Export Backup';
          }
        });
      }

      // Wait for user action
      return new Promise((resolve) => {
        const cancelBtn = modal.querySelector('#cacheClearCancelBtn');
        const confirmBtn = modal.querySelector('#cacheClearConfirmBtn');

        cancelBtn.addEventListener('click', () => {
          document.body.removeChild(modal);
          resolve(false);
        });

        confirmBtn.addEventListener('click', async () => {
          const clearAppCaches = modal.querySelector('#clearAppCaches').checked;
          const preserveDesigns = modal.querySelector(
            '#preserveSavedDesigns'
          ).checked;

          confirmBtn.disabled = true;
          confirmBtn.textContent = 'Clearing...';
          confirmBtn.setAttribute('aria-busy', 'true');

          // Add timeout to prevent freeze during cache clearing
          const CACHE_CLEAR_TIMEOUT = 8000; // 8 seconds max before force reload

          try {
            // Race between cache clear and timeout
            const result = await Promise.race([
              clearCacheWithOptions({
                clearAppCaches,
                preserveSavedDesigns: preserveDesigns,
              }),
              new Promise((_, reject) =>
                setTimeout(
                  () => reject(new Error('Cache clear timeout')),
                  CACHE_CLEAR_TIMEOUT
                )
              ),
            ]);

            document.body.removeChild(modal);

            if (result.appCachesCleared || result.userDataCleared) {
              const msg = preserveDesigns
                ? 'App cache cleared. Your saved designs are preserved. Reloading...'
                : 'All data cleared. Reloading...';
              updateStatus(msg, 'success');
              await updateStorageDisplay();
              setTimeout(() => {
                window.location.reload();
              }, 500);
            }

            resolve(true);
          } catch (error) {
            // Timeout or error occurred
            console.warn(
              '[Cache Clear] Operation timed out or failed:',
              error.message
            );

            // Force reload anyway - the cache clear may have partially succeeded
            // and reloading is the safest recovery action
            document.body.removeChild(modal);
            updateStatus(
              'Cache clear taking too long, forcing reload...',
              'warning'
            );
            setTimeout(() => {
              window.location.reload();
            }, 300);
            resolve(true);
          }
        });

        // Close on escape
        modal.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') {
            document.body.removeChild(modal);
            resolve(false);
          }
        });

        // Focus first interactive element
        setTimeout(() => cancelBtn.focus(), 100);
      });
    } catch (error) {
      console.error('[Storage] Smart cache clear error:', error);
      updateStatus('Error showing cache dialog', 'error');
    }
  }

  // Export backup handler
  async function handleExportBackup() {
    const dismissOverlay = showProcessingOverlay(
      'Exporting projects backup...',
      {
        hint: 'Packaging all projects. Please do not close or refresh the page.',
      }
    );
    try {
      updateStatus('Creating backup...', 'info');
      const result = await exportProjectsBackup();
      dismissOverlay();

      if (result.success && result.blob) {
        // Download the file
        const url = URL.createObjectURL(result.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = result.fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        updateStatus(`Backup exported: ${result.fileName}`, 'success');
        stateManager.announceChange('Backup exported successfully');
      } else {
        updateStatus(`Export failed: ${result.error}`, 'error');
      }
    } catch (error) {
      dismissOverlay();
      console.error('[Storage] Export error:', error);
      updateStatus('Failed to export backup', 'error');
    }
  }

  // Download a single project as a ZIP
  async function downloadSingleProject(projectId) {
    const dismissOverlay = showProcessingOverlay('Preparing download...', {
      hint: 'Packaging project files. Please do not close or refresh the page.',
    });
    try {
      const result = await exportSingleProject(projectId);
      dismissOverlay();

      if (result.success && result.blob) {
        const url = URL.createObjectURL(result.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = result.fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        updateStatus(`Project downloaded: ${result.fileName}`, 'success');
        stateManager.announceChange('Project downloaded successfully');
      } else {
        updateStatus(`Download failed: ${result.error}`, 'error');
      }
    } catch (error) {
      dismissOverlay();
      console.error('[Storage] Single-project download error:', error);
      updateStatus('Failed to download project', 'error');
    }
  }

  // Import backup handler
  async function handleImportBackup(file) {
    try {
      updateStatus('Importing backup...', 'info');
      const result = await importProjectsBackup(file);

      if (result.success) {
        await savedProjectsUI.renderSavedProjectsList();
        const msg = `Imported ${result.imported} project${result.imported !== 1 ? 's' : ''}`;
        updateStatus(msg, 'success');
        stateManager.announceChange(msg);

        if (result.errors.length > 0) {
          console.warn('[Storage] Import errors:', result.errors);
        }
      } else {
        updateStatus(`Import failed: ${result.errors.join(', ')}`, 'error');
      }
    } catch (error) {
      console.error('[Storage] Import error:', error);
      updateStatus('Failed to import backup', 'error');
    }
  }

  // Wire up storage clear button (now uses smart dialog)
  const clearStorageBtn = document.getElementById('clearStorageBtn');
  if (clearStorageBtn) {
    clearStorageBtn.addEventListener('click', showSmartCacheClearDialog);
  }

  // Wire up export button
  const exportAllProjectsBtn = document.getElementById('exportAllProjectsBtn');
  if (exportAllProjectsBtn) {
    exportAllProjectsBtn.addEventListener('click', handleExportBackup);
  }

  // Wire up import button and hidden file input
  const importProjectsBtn = document.getElementById('importProjectsBtn');
  const importBackupInput = document.getElementById('importBackupInput');
  if (importProjectsBtn && importBackupInput) {
    importProjectsBtn.addEventListener('click', () => {
      importBackupInput.click();
    });

    importBackupInput.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (file) {
        await handleImportBackup(file);
        importBackupInput.value = ''; // Reset for next import
      }
    });
  }

  // Folder import â€” gated behind feature flag and webkitdirectory feature detection
  if (
    _isEnabled('folder_import') &&
    'webkitdirectory' in document.createElement('input')
  ) {
    const importFolderBtn = document.getElementById('importFolderBtn');
    const importFolderInput = document.getElementById('importFolderInput');

    if (importFolderBtn) importFolderBtn.hidden = false;

    if (importFolderBtn && importFolderInput) {
      importFolderBtn.addEventListener('click', async () => {
        // Use the modern File System Access API if available (more reliable than webkitdirectory)
        if ('showDirectoryPicker' in window) {
          let dismissOverlay = () => {};
          try {
            const dirHandle = await window.showDirectoryPicker();
            dismissOverlay = showProcessingOverlay(
              `Reading folder "${dirHandle.name}"â€¦`,
              'Scanning files and subfolders. Please do not close or refresh the page.'
            );
            const files = [];
            try {
              await fileHandler.collectFilesFromDir(dirHandle, dirHandle.name, files);
            } catch (collectErr) {
              dismissOverlay();
              alert(`Error reading folder contents: ${collectErr.message}`);
              return;
            }
            if (files.length === 0) {
              dismissOverlay();
              alert(
                'No files found in the selected folder. The folder may be empty.'
              );
              return;
            }
            dismissOverlay();
            await fileHandler.handleFolderImport(files);
          } catch (err) {
            dismissOverlay();
            if (err.name === 'AbortError') {
              updateStatus('Folder selection cancelled');
              return;
            }
            alert(`Folder import error: ${err.message}`);
          }
        } else {
          // Fallback to webkitdirectory input
          importFolderInput.value = '';
          importFolderInput.click();
        }
      });

      // Fallback: webkitdirectory input change handler
      importFolderInput.addEventListener('change', async (e) => {
        try {
          const files = e.target.files;
          if (!files || files.length === 0) {
            updateStatus('No files in selected folder');
            return;
          }
          await fileHandler.handleFolderImport(files);
          importFolderInput.value = '';
        } catch (err) {
          alert(`Folder import error: ${err.message}`);
        }
      });
    }
  }

  // _collectFilesFromDir moved to file-handler.js

  // handleFolderImport moved to file-handler.js

  // _promptScadSelection moved to file-handler.js

  let storageUpdateTimeout = null;
  const scheduleStorageUpdate = (delayMs = 2500) => {
    if (storageUpdateTimeout) {
      clearTimeout(storageUpdateTimeout);
    }
    storageUpdateTimeout = setTimeout(() => {
      updateStorageDisplay();
    }, delayMs);
  };

  // Update storage display on init
  updateStorageDisplay();

  // Keep storage usage fresh after state changes (localStorage saves are debounced)
  stateManager.subscribe((state, prevState) => {
    if (
      state.uploadedFile !== prevState.uploadedFile ||
      state.parameters !== prevState.parameters ||
      state.defaults !== prevState.defaults
    ) {
      scheduleStorageUpdate();
    }
  });

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // FIRST-VISIT GATE â€” Critical Initialization Barrier
  //
  // On the very first visit the app shows a blocking disclosure modal that
  // the user must accept before any downloads (WASM, manifest files, etc.)
  // can begin. Several subsystems depend on this gate:
  //
  //   â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
  //   â”‚  Z-INDEX STACK (highest on top)                                 â”‚
  //   â”‚                                                                 â”‚
  //   â”‚  z: 10000  Processing overlay  (.processing-overlay)            â”‚
  //   â”‚  z: 10000  Tutorial panel      (--z-index-tutorial-panel)       â”‚
  //   â”‚  z:  9999  Skip-link / Tutorial spotlight                       â”‚
  //   â”‚  z:  1000  Modals              (--z-index-modal)                â”‚
  //   â”‚  z:   950  Modal backdrop      (--z-index-modal-backdrop)       â”‚
  //   â”‚  z:   900  Drawers             (--z-index-drawer)               â”‚
  //   â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
  //
  // INVARIANT: The processing overlay (z: 10000) MUST NEVER be shown while
  // the first-visit modal (z: 1000) is open. Because the overlay sits
  // above the modal, it would cover the "Download & Continue" button and
  // trap the user in an infinite spinner. All code paths that call
  // showProcessingOverlay() must first await waitForFirstVisitAcceptance().
  //
  // Subsystems that respect this gate:
  //   - Manifest deep-link handler  (?manifest=<url>)
  //   - WASM initialization         (ensureWasmInitialized)
  //   - Draft restoration           (pendingDraft)
  //   - Save-copy modal             (showManifestSaveCopyModal)
  //
  // See also: the per-step lifecycle comments in the manifest deep-link
  // handler below for the exact required ordering of overlay â†’ download â†’
  // process â†’ dismiss â†’ save-copy.
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  const appRoot = document.getElementById('app');
  let firstVisitBlocking = false;
  let hasUserAcceptedDownload = !isFirstVisit();
  let pendingWasmInit = false;
  let pendingDraft = null;
  const firstVisitReadyResolvers = [];

  const setFirstVisitBlocking = (blocked) => {
    firstVisitBlocking = blocked;
    if (appRoot) {
      if (blocked) {
        appRoot.setAttribute('aria-hidden', 'true');
      } else {
        appRoot.removeAttribute('aria-hidden');
      }
      if ('inert' in appRoot) {
        appRoot.inert = blocked;
      }
    }
    document.body.classList.toggle('first-visit-blocking', blocked);
  };

  const waitForFirstVisitAcceptance = () => {
    if (!firstVisitBlocking && hasUserAcceptedDownload) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      firstVisitReadyResolvers.push(resolve);
    });
  };

  // First-visit modal check
  const firstVisitModal = document.getElementById('first-visit-modal');
  const firstVisitCheck = isFirstVisit();
  if (firstVisitCheck && firstVisitModal) {
    setFirstVisitBlocking(true);
    // Delay slightly to ensure DOM is ready
    setTimeout(() => {
      openModal(firstVisitModal);
    }, 500);
  }

  // First-visit modal handlers
  if (!isFirstVisit()) {
    setFirstVisitBlocking(false);
  }

  const firstVisitContinue = document.getElementById('first-visit-continue');

  const handleFirstVisitClose = async (_source = 'unknown') => {
    hasUserAcceptedDownload = true;
    updateStoragePrefs({ allowLargeDownloads: true, seenDisclosure: true });
    markFirstVisitComplete();
    closeModal(firstVisitModal);
    setFirstVisitBlocking(false);
    if (firstVisitReadyResolvers.length > 0) {
      const resolvers = firstVisitReadyResolvers.splice(0);
      resolvers.forEach((resolve) => resolve());
    }
    if (pendingWasmInit) {
      pendingWasmInit = false;
      await ensureWasmInitialized();
    }

    // If a project was loaded while WASM was still initializing (e.g. manifest
    // deep-link on first visit), the auto-preview controller could not be created
    // at handleFile time. Now that WASM is ready, retroactively set it up and
    // trigger the initial preview so the 3D object appears.
    const postInitState = stateManager.getState();
    if (
      postInitState.uploadedFile &&
      !autoPreviewController &&
      renderController
    ) {
      await initAutoPreviewController(false);
      if (autoPreviewController) {
        const colorParamNames = Object.values(
          postInitState.schema?.parameters || {}
        )
          .filter((p) => p.uiType === 'color')
          .map((p) => p.name);
        autoPreviewController.setColorParamNames(colorParamNames);
        autoPreviewController.setParamTypes(postInitState.paramTypes || {});
        autoPreviewController.setSchema(postInitState.schema || null);
        autoPreviewController.setScadContent(
          postInitState.uploadedFile.content
        );
        autoPreviewController.setProjectFiles(
          postInitState.projectFiles || null,
          postInitState.mainFilePath || postInitState.uploadedFile.name
        );
        const libsForRender = getEnabledLibrariesForRender();
        autoPreviewController.setEnabledLibraries(libsForRender);
        if (autoPreviewEnabled) {
          autoPreviewController
            .forcePreview(postInitState.parameters)
            .then((initiated) => {
              if (initiated) {
                console.log('[FirstVisit] Deferred initial preview started');
              }
            })
            .catch((error) => {
              console.error(
                '[FirstVisit] Deferred initial preview failed:',
                error
              );
            });
        }
      }
    }

    // Restore pending draft if one was deferred
    if (pendingDraft) {
      const draftToRestore = pendingDraft;
      pendingDraft = null;

      const shouldRestore = confirm(
        `Found a saved draft of "${draftToRestore.fileName}" from ${new Date(draftToRestore.timestamp).toLocaleString()}.\n\nWould you like to restore it?`
      );

      if (shouldRestore) {
        console.log('Restoring deferred draft...');
        fileHandler.handleFile(
          { name: draftToRestore.fileName },
          draftToRestore.fileContent,
          null,
          null,
          'saved'
        );
        updateStatus('Draft restored');
      } else {
        stateManager.clearLocalStorage();
      }
    }
  };

  if (firstVisitContinue && firstVisitModal) {
    firstVisitContinue.addEventListener('click', () =>
      handleFirstVisitClose('continue')
    );
  }

  // Initialize UI mode controller (Basic/Advanced interface layout)
  getUIModeController().init();

  // Initialize toolbar menu bar (File|Edit|Design|View|Window|Help)
  getToolbarMenuController().init();
  applyToolbarModeVisibility(getUIModeController().getMode());
  getUIModeController().subscribe((newMode) => {
    applyToolbarModeVisibility(newMode);
  });

  // Initialize HFM/Alt View controller (hidden feature mode)
  const hfmCtrl = initHfmController({
    getPreviewManager: () => previewManager,
    getDisplayOptionsController,
  });

  // Initialize parameter detail level controller (Show/Inline/Hide/Desc-only)
  initParamDetailController();

  async function _saveCurrentProject(successMessage) {
    const state = stateManager.getState();
    if (!state.uploadedFile?.content) return;
    if (currentSavedProjectId) {
      const { projectFiles } = state;
      const projectFilesObj = projectFiles
        ? Object.fromEntries(projectFiles)
        : null;
      const result = await updateProject({
        id: currentSavedProjectId,
        content: state.uploadedFile.content,
        projectFiles:
          projectFilesObj !== null
            ? JSON.stringify(projectFilesObj)
            : undefined,
      });
      if (result.success) {
        companionFilesCtrl.updateCompanionSaveButton();
        stateManager.announceChange(successMessage);
        updateStatus(successMessage);
        await savedProjectsUI.renderSavedProjectsList();
      } else {
        alert(`Failed to save: ${result.error}`);
      }
    } else {
      await savedProjectsUI.showSaveProjectPrompt(state, { preSave: true });
    }
  }

  /**
   * One-click 2D export (SVG / DXF).
   *
   * Mirrors desktop OpenSCAD's File > Export > Export as SVG/DXF:
   * switches the output format, auto-adjusts parameters for 2D geometry,
   * runs the full render, and downloads the result.
   *
   * @param {string} format - 'svg' or 'dxf'
   */
  async function _export2DOneClick(format) {
    const state = stateManager.getState();
    if (!state.uploadedFile) {
      alert('Open a SCAD file first.');
      return;
    }
    if (!renderController) {
      alert('OpenSCAD engine not initialized.');
      return;
    }

    const formatName = OUTPUT_FORMATS[format]?.name || format.toUpperCase();

    const outputFormatSelect = document.getElementById('outputFormat');
    if (outputFormatSelect) {
      outputFormatSelect.value = format;
      outputFormatSelect.dispatchEvent(new Event('change'));
    }

    getToolbarMenuController().closeAll();

    const renderParameters = resolve2DExportParameters(
      state.parameters,
      state.schema,
      format
    );

    updateStatus(`Generating ${formatName}\u2026`);

    if (autoPreviewController) {
      autoPreviewController.cancelPending();
    }

    try {
      const libsForRender = getEnabledLibrariesForRender();
      const startTime = Date.now();

      const oneClickOpts = {
        outputFormat: format,
        paramTypes: state.paramTypes || {},
        files: state.projectFiles,
        mainFile: state.mainFilePath,
        libraries: libsForRender,
        onProgress: () => updateStatus(`Generating ${formatName}\u2026`),
      };
      let result;
      try {
        result = await renderController.renderFull(
          state.uploadedFile.content,
          renderParameters,
          oneClickOpts
        );
      } catch (renderErr) {
        if (renderErr.code === 'MODEL_NOT_2D') {
          updateStatus(
            `Model produces 3D geometry â€” projecting to ${formatName}...`
          );
          result = await renderController.render2DFallback(
            state.uploadedFile.content,
            renderParameters,
            oneClickOpts
          );
        } else {
          throw renderErr;
        }
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      const data = result.data || result.stl;
      const resolvedFormat = result.format || format;

      stateManager.setState({
        generatedOutput: {
          data,
          format: resolvedFormat,
          stats: result.stats,
          paramsHash: hashParams(state.parameters),
        },
        stl: data,
        outputFormat: resolvedFormat,
        stlStats: result.stats,
        lastRenderTime: duration,
      });

      // Show rendered 2D preview for SVG output
      if (resolvedFormat === 'svg' && previewManager) {
        try {
          let svgText =
            typeof data === 'string' ? data : new TextDecoder().decode(data);

          const renderStyle =
            '<style data-forge-preview="true">' +
            'path,polygon,polyline,circle,ellipse,rect{fill:#07D0A7;stroke:#FF0603;stroke-width:0.5;fill-opacity:1}' +
            'line{stroke:#FF0603;stroke-width:0.5}' +
            '</style>';
          svgText = svgText.replace(/(<svg[^>]*>)/i, '$1' + renderStyle);

          if (typeof previewManager.show2DPreviewAs3DPlane === 'function') {
            await previewManager.show2DPreviewAs3DPlane(svgText, {
              mode: 'rendered',
            });
          } else {
            previewManager.show2DPreview(svgText, { mode: 'rendered' });
          }
        } catch (previewErr) {
          console.warn('[Export2D] Failed to show 2D preview:', previewErr);
        }
      }

      const filename = generateFilename(
        state.uploadedFile.name,
        state.parameters,
        format
      );
      downloadFile(data, filename, format);
      updateStatus(`${formatName} exported (${duration}s): ${filename}`);
      announceImmediate(`${formatName} file exported and downloaded.`);
    } catch (error) {
      console.error(`[Export2D] ${formatName} export failed:`, error);
      updateStatus(`${formatName} export failed: ${error.message || error}`);
      announceImmediate(`${formatName} export failed.`);
    }
  }

  // Initialize file actions controller (New, Reload, Save, Save As, Export Image, Recent)
  const fileActionsController = getFileActionsController({
    onNew: () => {
      stateManager.resetState();
      const container = document.getElementById('parametersContainer');
      if (container) container.textContent = '';
      if (previewManager) previewManager.clearScene();
    },
    onReload: () => {
      const state = stateManager.getState();
      if (state.uploadedFile) {
        fileHandler.handleFile(
          null,
          state.uploadedFile.content,
          state.projectFiles || null,
          state.mainFilePath || null,
          'user',
          state.uploadedFile.name
        );
      }
    },
    onSave: () => _saveCurrentProject('Project saved'),
    onSaveAs: async () => {
      const state = stateManager.getState();
      if (!state.uploadedFile?.content) return;
      await savedProjectsUI.showSaveProjectPrompt(state, { preSave: true });
    },
    onSaveAll: () => _saveCurrentProject('All changes saved'),
    onExportImage: () => {
      const canvas = document.querySelector('#previewContainer canvas');
      if (!canvas) return;
      if (previewManager?.renderer && previewManager?.scene) {
        const cam = previewManager.getActiveCamera?.() ?? previewManager.camera;
        if (cam) previewManager.renderer.render(previewManager.scene, cam);
      }
      const dataUrl = canvas.toDataURL('image/png');
      if (!dataUrl || dataUrl.length < 100) return;
      const link = document.createElement('a');
      link.download = 'openscad-preview.png';
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    },
    onExport2D: (format) => _export2DOneClick(format),
  });
  fileActionsController.init();

  // â”€â”€ Toolbar: File menu â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  getToolbarMenuController().registerMenuBuilder('file', () => {
    const state = stateManager.getState();
    const hasFile = Boolean(state.uploadedFile);
    const hasRender = Boolean(state.stl);
    // Full render = Generate button has been pressed and output matches current params
    const stateOutputFormat = (state.outputFormat || '').toLowerCase();
    const selectedFormat = (
      document.getElementById('outputFormat')?.value || 'stl'
    ).toLowerCase();
    const hasNonSTLRender =
      hasRender &&
      stateOutputFormat === selectedFormat &&
      stateOutputFormat !== 'stl';
    const hasFullRender =
      hasNonSTLRender ||
      Boolean(
        autoPreviewController?.getCurrentFullSTL(state.parameters) &&
        !autoPreviewController?.needsFullRender(state.parameters)
      );

    // Recent Files submenu items (filenames only; actual re-open via onOpenRecent callback)
    const recentItems =
      fileActionsController.recentFiles.length > 0
        ? fileActionsController.recentFiles.map((entry) => ({
            type: 'action',
            label: entry.name,
            handler: () => fileActionsController.onOpenRecent(entry),
          }))
        : [{ type: 'action', label: 'No recent files', disabled: true }];

    // Export submenu: one-click 2D exports + re-download of current render + Export as Image
    const exportItems = [
      // One-click 2D exports (auto-adjust params, render, download)
      {
        type: 'action',
        label: 'Export as SVG\u2026',
        enabled: hasFile,
        tooltip: hasFile
          ? 'One-click: auto-adjusts parameters, generates 2D geometry, and downloads SVG'
          : 'Open a file first',
        handler: () => fileActionsController.onExport2D('svg'),
      },
      {
        type: 'action',
        label: 'Export as DXF\u2026',
        enabled: hasFile,
        tooltip: hasFile
          ? 'One-click: auto-adjusts parameters, generates 2D geometry, and downloads DXF'
          : 'Open a file first',
        handler: () => fileActionsController.onExport2D('dxf'),
      },
      { type: 'separator' },
      // Re-download current render in its original format
      ...(!hasFullRender
        ? [
            {
              type: 'action',
              label: '\u24D8  Press Generate to enable file exports',
              disabled: true,
              tooltip:
                'Use the Generate button to fully render the model, then file export options will become available.',
            },
            { type: 'separator' },
          ]
        : []),
      ...Object.entries(OUTPUT_FORMATS).map(([key, fmt]) => ({
        type: 'action',
        label: fmt.name,
        enabled: hasFullRender,
        tooltip: hasFullRender
          ? fmt.description
          : 'Press Generate first to enable this export',
        handler: () => exportFormatFromMenu(key),
      })),
      { type: 'separator' },
      {
        type: 'action',
        label: 'Export as Image\u2026',
        shortcutAction: 'exportImage',
        enabled: hasRender,
        tooltip: hasRender
          ? 'Save the current viewport as a PNG image'
          : 'Load and preview a file first',
        handler: () => fileActionsController.onExportImage(),
      },
    ];

    return [
      {
        type: 'action',
        label: 'New File',
        shortcutAction: 'newFile',
        handler: () => fileActionsController.onNew(),
      },
      {
        type: 'action',
        label: 'Open File\u2026',
        handler: () => document.getElementById('fileInput')?.click(),
      },
      {
        type: 'action',
        label: 'Recent File',
        disabled: true,
        tooltip:
          'Previously opened files appear in the Recent Files submenu below',
      },
      { type: 'submenu', label: 'Recent Files', items: recentItems },
      { type: 'separator' },
      {
        type: 'submenu',
        label: 'Examples',
        items: Object.entries(EXAMPLE_DEFINITIONS).map(([key, def]) => ({
          type: 'action',
          label: def.description || def.name,
          handler: () => fileHandler.loadExampleByKey(key),
        })),
      },
      {
        type: 'action',
        label: 'Reload',
        shortcutAction: 'reloadFile',
        enabled: hasFile,
        tooltip: hasFile ? undefined : 'Open a file first',
        handler: () => fileActionsController.onReload(),
      },
      { type: 'separator' },
      {
        type: 'action',
        label: 'Close',
        handler: () => document.getElementById('clearFileBtn')?.click(),
      },
      { type: 'separator' },
      {
        type: 'action',
        label: 'Save',
        shortcutAction: 'saveFile',
        enabled: hasFile,
        tooltip: hasFile ? undefined : 'Open a file first',
        handler: () => fileActionsController.onSave(),
      },
      {
        type: 'action',
        label: 'Save As\u2026',
        shortcutAction: 'saveFileAs',
        enabled: hasFile,
        tooltip: hasFile ? undefined : 'Open a file first',
        handler: () => fileActionsController.onSaveAs(),
      },
      {
        type: 'action',
        label: 'Save All',
        enabled: hasFile,
        tooltip: hasFile
          ? 'Save all changes to current project'
          : 'Open a file first',
        handler: () => fileActionsController.onSaveAll(),
      },
      { type: 'separator' },
      { type: 'submenu', label: 'Export', items: exportItems },
      { type: 'separator' },
      {
        type: 'action',
        label: 'Show Library Folder',
        disabled: true,
        tooltip:
          'Libraries are managed in-browser \u2014 use the Libraries panel (Window menu) to add or remove libraries',
      },
    ];
  });

  // Initialize edit actions controller (Copy viewport, camera values, error nav, font size)
  const editActionsController = getEditActionsController({
    getPreviewManager: () => previewManager,
    getErrorLogPanel: () => errorLogPanel,
    onJumpToLine: (file, line) => {
      const modeManager = getModeManager();
      if (modeManager?.isExpertMode?.() && modeManager.getEditorInstance?.()) {
        const editor = modeManager.getEditorInstance();
        if (editor.revealLineInCenter) editor.revealLineInCenter(line);
        if (editor.setPosition)
          editor.setPosition({ lineNumber: line, column: 1 });
        if (editor.focus) editor.focus();
      }
    },
    onFontSizeChange: (size) => {
      const modeManager = getModeManager();
      if (modeManager?.isExpertMode?.() && modeManager.getEditorInstance?.()) {
        const editor = modeManager.getEditorInstance();
        if (editor.updateOptions) editor.updateOptions({ fontSize: size });
      }
    },
  });
  editActionsController.init();

  // â”€â”€ Toolbar: Edit menu â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  getToolbarMenuController().registerMenuBuilder('edit', () => {
    const state = stateManager.getState();
    const hasFile = Boolean(state.uploadedFile);
    const canUndo = stateManager.canUndo();
    const canRedo = stateManager.canRedo();

    const modeManager = getModeManager();
    const editor = modeManager?.getEditorInstance?.();
    const expertMode = modeManager?.isExpertMode?.();
    const canEdit = expertMode && editor;
    const editorTip = 'Available in Expert Mode with Code Editor';

    function editorAction(label, monacoActionId) {
      return {
        type: 'action',
        label,
        disabled: !canEdit,
        tooltip: canEdit ? undefined : editorTip,
        handler: canEdit
          ? () => {
              const action = editor.getAction(monacoActionId);
              if (action) action.run();
            }
          : undefined,
      };
    }

    return [
      {
        type: 'action',
        label: 'Undo',
        enabled: canUndo,
        tooltip: canUndo ? undefined : 'Nothing to undo',
        handler: () => performUndo(),
      },
      {
        type: 'action',
        label: 'Redo',
        enabled: canRedo,
        tooltip: canRedo ? undefined : 'Nothing to redo',
        handler: () => performRedo(),
      },
      { type: 'separator' },
      {
        type: 'action',
        label: 'Cut',
        disabled: !canEdit,
        tooltip: canEdit ? undefined : editorTip,
        handler: canEdit ? () => document.execCommand('cut') : undefined,
      },
      {
        type: 'action',
        label: 'Copy',
        disabled: !canEdit,
        tooltip: canEdit ? undefined : editorTip,
        handler: canEdit ? () => document.execCommand('copy') : undefined,
      },
      {
        type: 'action',
        label: 'Paste',
        disabled: !canEdit,
        tooltip: canEdit ? undefined : editorTip,
        handler: canEdit ? () => document.execCommand('paste') : undefined,
      },
      { type: 'separator' },
      editorAction('Indent', 'editor.action.indentLines'),
      editorAction('Unindent', 'editor.action.outdentLines'),
      editorAction('Comment', 'editor.action.commentLine'),
      editorAction('Uncomment', 'editor.action.removeCommentLine'),
      editorAction(
        'Convert Tabs to Spaces',
        'editor.action.indentationToSpaces'
      ),
      { type: 'separator' },
      {
        type: 'action',
        label: 'Copy Viewport Image',
        shortcutAction: 'copyViewportImage',
        enabled: hasFile,
        tooltip: hasFile ? undefined : 'Open a file first',
        handler: () => editActionsController.copyViewportImage(),
      },
      {
        type: 'action',
        label: 'Copy Viewport Translation',
        enabled: hasFile,
        tooltip: hasFile ? undefined : 'Open a file first',
        handler: () => editActionsController.copyTranslation(),
      },
      {
        type: 'action',
        label: 'Copy Viewport Rotation',
        enabled: hasFile,
        tooltip: hasFile ? undefined : 'Open a file first',
        handler: () => editActionsController.copyRotation(),
      },
      {
        type: 'action',
        label: 'Copy Viewport Distance',
        enabled: hasFile,
        tooltip: hasFile ? undefined : 'Open a file first',
        handler: () => editActionsController.copyDistance(),
      },
      {
        type: 'action',
        label: 'Copy Viewport FOV',
        enabled: hasFile,
        tooltip: hasFile ? undefined : 'Open a file first',
        handler: () => editActionsController.copyFov(),
      },
      { type: 'separator' },
      editorAction('Find\u2026', 'actions.find'),
      editorAction(
        'Find and Replace\u2026',
        'editor.action.startFindReplaceAction'
      ),
      editorAction('Find Next', 'editor.action.nextMatchFindAction'),
      editorAction('Find Previous', 'editor.action.previousMatchFindAction'),
      {
        type: 'action',
        label: 'Use Selection for Find',
        disabled: !canEdit,
        tooltip: canEdit ? undefined : editorTip,
      },
      { type: 'separator' },
      {
        type: 'action',
        label: 'Jump to Next Error',
        shortcutAction: 'jumpNextError',
        handler: () => editActionsController.jumpToNextError(),
      },
      { type: 'separator' },
      {
        type: 'action',
        label: 'Increase Font Size',
        shortcutAction: 'increaseFontSize',
        handler: () => editActionsController.increaseFontSize(),
      },
      {
        type: 'action',
        label: 'Decrease Font Size',
        shortcutAction: 'decreaseFontSize',
        handler: () => editActionsController.decreaseFontSize(),
      },
      {
        type: 'action',
        label: 'Preferences\u2026',
        handler: () => {
          const modal = document.getElementById('shortcutsModal');
          const modalBody = document.getElementById('shortcutsModalBody');
          if (modal && modalBody) {
            if (!modal.dataset.initialized) {
              initShortcutsModal(modalBody, () => closeModal(modal));
              modal.dataset.initialized = 'true';
            }
            openModal(modal);
          }
        },
      },
    ];
  });

  // Initialize design panel controller (Flush Caches, Display AST, Check Validity, Geometry Info)
  const designPanelController = getDesignPanelController({
    getPreviewManager: () => previewManager,
    getWorker: () => renderController?.worker || null,
    getScadContent: () => stateManager.getState()?.uploadedFile?.content || '',
    extractParameters,
    onFlushComplete: () => {
      stateManager.resetState();
      const container = document.getElementById('parametersContainer');
      if (container) container.textContent = '';
    },
  });
  designPanelController.init();

  // â”€â”€ Toolbar: Design menu â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  getToolbarMenuController().registerMenuBuilder('design', () => {
    const state = stateManager.getState();
    const hasFile = Boolean(state.uploadedFile);
    return [
      {
        type: 'toggle',
        label: 'Automatic Reload and Preview',
        disabled: true,
        tooltip: 'Planned for future release',
      },
      {
        type: 'action',
        label: 'Reload and Preview',
        enabled: hasFile,
        tooltip: hasFile ? undefined : 'Open a file first',
        handler: () => {
          fileActionsController.onReload();
          setTimeout(() => {
            if (autoPreviewController) {
              autoPreviewController.onParameterChange(
                stateManager.getState().parameters
              );
            }
          }, 200);
        },
      },
      {
        type: 'action',
        label: 'Preview',
        shortcutAction: 'preview',
        enabled: hasFile,
        tooltip: hasFile ? undefined : 'Open a file first',
        handler: () => {
          if (autoPreviewController) {
            autoPreviewController.onParameterChange(state.parameters);
          }
        },
      },
      {
        type: 'action',
        label: 'Render',
        shortcutAction: 'render',
        enabled: hasFile,
        tooltip: hasFile ? undefined : 'Open a file first',
        handler: () => {
          const btn = document.getElementById('primaryActionBtn');
          if (btn && !btn.disabled) btn.click();
        },
      },
      {
        type: 'action',
        label: 'Cancel Render',
        shortcutAction: 'cancelRender',
        enabled: renderController?.isBusy?.(),
        tooltip: renderController?.isBusy?.()
          ? undefined
          : 'No render in progress',
        handler: () => {
          if (renderController?.isBusy?.()) renderController.cancel();
        },
      },
      {
        type: 'action',
        label: '3D Print',
        disabled: true,
        tooltip:
          'Not available in browser \u2014 export the model as STL and open it in your slicer application (e.g. PrusaSlicer, Cura)',
      },
      { type: 'separator' },
      {
        type: 'action',
        label: 'Check Validity',
        disabled: true,
        tooltip: 'Planned for future release',
      },
      {
        type: 'action',
        label: 'Display AST\u2026',
        shortcutAction: 'showAST',
        enabled: hasFile,
        tooltip: hasFile ? undefined : 'Open a file first',
        handler: () => designPanelController.showAST(),
      },
      {
        type: 'action',
        label: 'Geometry Info',
        disabled: true,
        tooltip: 'Planned for future release',
      },
      { type: 'separator' },
      {
        type: 'action',
        label: 'Flush Caches',
        shortcutAction: 'flushCaches',
        handler: () => designPanelController.flushCaches(),
      },
    ];
  });

  // Initialize display options controller (Axes, Edges, Crosshairs, Wireframe)
  const displayOptionsController = getDisplayOptionsController({
    getPreviewManager: () => previewManager,
    getThree: getThreeModule,
  });
  displayOptionsController.init();

  // â”€â”€ Toolbar: View menu â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  getToolbarMenuController().registerMenuBuilder('view', () => {
    const state = stateManager.getState();
    const hasRender = Boolean(state.stl);
    const projMode = previewManager?.getProjectionMode?.() ?? 'perspective';

    function cameraViewHandler(view) {
      return () => {
        if (previewManager) {
          previewManager.setCameraView(view);
          announceCameraAction(`${view} view`);
        }
      };
    }

    return [
      // -- Display Toggles --
      {
        type: 'toggle',
        label: 'Show Edges',
        shortcutAction: 'toggleEdges',
        checked: displayOptionsController.get('edges'),
        handler: () => displayOptionsController.toggle('edges'),
      },
      {
        type: 'toggle',
        label: 'Show Axes',
        shortcutAction: 'toggleAxes',
        checked: displayOptionsController.get('axes'),
        handler: () => displayOptionsController.toggle('axes'),
      },
      {
        type: 'toggle',
        label: 'Show Crosshairs',
        checked: displayOptionsController.get('crosshairs'),
        handler: () => displayOptionsController.toggle('crosshairs'),
      },
      { type: 'separator' },
      // -- Camera Views --
      {
        type: 'action',
        label: 'Top',
        shortcutAction: 'viewTop',
        handler: cameraViewHandler('top'),
      },
      {
        type: 'action',
        label: 'Bottom',
        shortcutAction: 'viewBottom',
        handler: cameraViewHandler('bottom'),
      },
      {
        type: 'action',
        label: 'Left',
        shortcutAction: 'viewLeft',
        handler: cameraViewHandler('left'),
      },
      {
        type: 'action',
        label: 'Right',
        shortcutAction: 'viewRight',
        handler: cameraViewHandler('right'),
      },
      {
        type: 'action',
        label: 'Front',
        shortcutAction: 'viewFront',
        handler: cameraViewHandler('front'),
      },
      {
        type: 'action',
        label: 'Back',
        shortcutAction: 'viewBack',
        handler: cameraViewHandler('back'),
      },
      {
        type: 'action',
        label: 'Diagonal',
        shortcutAction: 'viewDiagonal',
        handler: cameraViewHandler('diagonal'),
      },
      {
        type: 'action',
        label: 'Center',
        shortcutAction: 'viewCenter',
        enabled: hasRender,
        tooltip: hasRender ? undefined : 'Render a model first',
        handler: () => {
          if (previewManager) {
            previewManager.resetCamera();
            announceCameraAction('View centered');
          }
        },
      },
      {
        type: 'action',
        label: 'View All',
        shortcutAction: 'viewAll',
        enabled: hasRender,
        tooltip: hasRender ? undefined : 'Render a model first',
        handler: () => {
          if (previewManager) {
            previewManager.fitCameraToModel();
            announceCameraAction('View fitted to model');
          }
        },
      },
      {
        type: 'action',
        label: 'Reset View',
        shortcutAction: 'resetView',
        enabled: hasRender,
        tooltip: hasRender ? undefined : 'Render a model first',
        handler: () => {
          if (previewManager) {
            previewManager.fitCameraToModel();
            announceCameraAction('reset');
          }
        },
      },
      { type: 'separator' },
      // -- Zoom --
      {
        type: 'action',
        label: 'Zoom In',
        handler: () => {
          if (previewManager) {
            previewManager.zoomCamera(1);
            announceCameraAction('zoom-in');
          }
        },
      },
      {
        type: 'action',
        label: 'Zoom Out',
        handler: () => {
          if (previewManager) {
            previewManager.zoomCamera(-1);
            announceCameraAction('zoom-out');
          }
        },
      },
      { type: 'separator' },
      // -- Projection Radio Group --
      {
        type: 'radio',
        label: 'Perspective',
        group: 'projection',
        value: 'perspective',
        checked: projMode === 'perspective',
        onChange: () => {
          if (previewManager && projMode !== 'perspective') {
            previewManager.toggleProjection();
          }
        },
      },
      {
        type: 'radio',
        label: 'Orthogonal',
        group: 'projection',
        value: 'orthographic',
        checked: projMode === 'orthographic',
        onChange: () => {
          if (previewManager && projMode !== 'orthographic') {
            previewManager.toggleProjection();
          }
        },
      },
      { type: 'separator' },
      // -- Toolbar toggles --
      {
        type: 'toggle',
        label: 'Hide Editor toolbar',
        disabled: true,
        tooltip:
          'Not yet implemented \u2014 panels can be shown or hidden via the Window menu',
      },
      {
        type: 'toggle',
        label: 'Hide 3D View toolbar',
        disabled: true,
        tooltip:
          'Not yet implemented \u2014 panels can be shown or hidden via the Window menu',
      },
    ];
  });

  // â”€â”€ Toolbar: Window menu â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  getToolbarMenuController().registerMenuBuilder('window', () => {
    const uiCtrl = getUIModeController();
    const hidden = new Set(
      uiCtrl.getPreferencesForExport().hiddenPanelsInBasic
    );

    /**
     * @param {string} panelId
     * @param {string} label
     * @param {string|undefined} shortcutAction
     */
    function panelToggle(panelId, label, shortcutAction) {
      const isVisible = !hidden.has(panelId);
      return {
        type: 'toggle',
        label,
        checked: isVisible,
        ...(shortcutAction ? { shortcutAction } : {}),
        handler: () => {
          uiCtrl.togglePanelVisibility(panelId);
          _announce(isVisible ? `${label} hidden` : `${label} shown`);
        },
      };
    }

    return [
      // -- Desktop-parity panel toggles --
      panelToggle('codeEditor', 'Editor', 'toggleCodeEditor'),
      panelToggle('consoleOutput', 'Console', 'toggleConsole'),
      {
        type: 'toggle',
        label: 'Customizer',
        disabled: true,
        tooltip:
          'Planned for future release \u2014 use the collapse button on the parameters panel instead',
      },
      { type: 'separator' },
      {
        type: 'action',
        label: 'Font List',
        disabled: true,
        tooltip:
          'Not available in browser \u2014 see openscad.org/documentation.html for font information',
      },
      {
        type: 'action',
        label: 'Viewport-Control',
        handler: () => {
          const panel = document.getElementById('cameraPanel');
          if (panel) {
            panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
            const focusable = panel.querySelector('button, input, select');
            if (focusable) focusable.focus();
          }
        },
      },
      { type: 'separator' },
      // -- Web-only panel toggles --
      // fileActions, editTools, designTools, displayOptions removed â€” now in toolbar menus
      panelToggle('libraries', 'Libraries'),
      panelToggle('companionFileManagement', 'Companion Files'),
      panelToggle('imageMeasurement', 'Image Measurement'),
      panelToggle('referenceOverlay', 'Reference Image'),
    ];
  });

  // â”€â”€ Toolbar: Help menu â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  getToolbarMenuController().registerMenuBuilder('help', () => {
    function _openFeaturesTab(tabId) {
      const modal = document.getElementById('featuresGuideModal');
      if (!modal) return;
      openModal(modal);
      const tab = document.getElementById(tabId);
      if (tab) tab.click();
    }

    return [
      {
        type: 'action',
        label: 'About',
        handler: () => _openFeaturesTab('tab-accessibility'),
      },
      {
        type: 'action',
        label: 'OpenSCAD Homepage',
        tooltip: 'Opens in a new window',
        handler: () =>
          window.open('https://openscad.org', '_blank', 'noopener,noreferrer'),
      },
      {
        type: 'action',
        label: 'Documentation',
        tooltip: 'Opens in a new window',
        handler: () =>
          window.open(
            'https://openscad.org/documentation.html',
            '_blank',
            'noopener,noreferrer'
          ),
      },
      {
        type: 'action',
        label: 'Cheat Sheet',
        tooltip: 'Opens in a new window',
        handler: () =>
          window.open(
            'https://openscad.org/cheatsheet/',
            '_blank',
            'noopener,noreferrer'
          ),
      },
      {
        type: 'action',
        label: 'Library Info',
        handler: () => _openFeaturesTab('tab-libraries'),
      },
      {
        type: 'action',
        label: 'Font List',
        disabled: true,
        tooltip:
          'Not available in browser \u2014 see openscad.org/documentation.html for font information',
      },
      { type: 'separator' },
      {
        type: 'action',
        label: 'Features Guide',
        shortcutAction: 'showHelp',
        handler: () => _openFeaturesTab('tab-libraries'),
      },
      {
        type: 'action',
        label: 'Keyboard Shortcuts\u2026',
        shortcutAction: 'showShortcutsModal',
        handler: () => {
          const modal = document.getElementById('shortcutsModal');
          const modalBody = document.getElementById('shortcutsModalBody');
          if (modal && modalBody) {
            if (!modal.dataset.initialized) {
              initShortcutsModal(modalBody, () => closeModal(modal));
              modal.dataset.initialized = 'true';
            }
            openModal(modal);
          }
        },
      },
      {
        type: 'action',
        label: 'Report Issue',
        tooltip: 'Opens in a new window',
        handler: () =>
          window.open(
            'https://github.com/BrennenJohnston/openscad-assistive-forge/issues',
            '_blank',
            'noopener,noreferrer'
          ),
      },
    ];
  });

  // Animation controller ($t) initialization removed from UI wiring â€” see animation-controller.js for future re-integration

  // Listen for "Save to Project" events from UI preferences panel
  document.addEventListener('ui-mode-save-to-project', (e) => {
    const prefs = e.detail?.uiPreferences;
    if (!prefs) return;

    const state = stateManager.getState();
    const modelName = state.uploadedFile?.name;
    if (modelName) {
      // Primary path: persist uiPreferences into the IndexedDB project record
      if (currentSavedProjectId) {
        updateProject({ id: currentSavedProjectId, uiPreferences: prefs })
          .then((result) => {
            if (result.success) {
              console.log(
                `[App] UI preferences saved to project record: ${modelName}`
              );
            } else {
              console.warn(
                '[App] Could not save UI preferences to project record:',
                result.error
              );
            }
          })
          .catch((err) => {
            console.error('[App] Project update failed:', err);
          });
      }

      // Fallback path: keep the legacy localStorage key in sync for one release
      // so that projects loaded before this change still have preferences available.
      try {
        const key = `openscad-forge-ui-prefs-${modelName}`;
        localStorage.setItem(key, JSON.stringify(prefs));
        console.log(`[App] UI preferences saved for project: ${modelName}`);
        updateStatus('UI preferences saved to project');
      } catch (error) {
        if (error.name === 'QuotaExceededError') {
          console.warn(
            '[App] localStorage quota exceeded â€” UI prefs not saved'
          );
        } else {
          console.warn('[App] Could not save UI preferences:', error);
        }
      }
    } else {
      updateStatus('Load a project first to save preferences');
    }
  });

  // Initialize theme toggle button
  initThemeToggle('themeToggle', (theme, activeTheme, message) => {
    console.log(`[App] ${message}`);
    // Optional: Show brief toast notification
    updateStatus(message);
    setTimeout(() => {
      const state = stateManager.getState();
      if (state.uploadedFile) {
        updateStatus('Ready');
      }
    }, 2000);
  });

  // ============================================================================
  // Preset migration check: detect legacy presets for versioned format migration
  // Check for legacy presets that can be migrated to the new versioned format
  // ============================================================================
  const checkPresetMigration = () => {
    try {
      const migrationInfo = checkMigrationAvailable();

      if (migrationInfo.available && !migrationInfo.alreadyOffered) {
        console.log('[App] Legacy presets detected:', {
          presets: migrationInfo.legacyPresetCount,
          models: migrationInfo.legacyModelCount,
        });

        // Show migration prompt (non-blocking, user can dismiss)
        const message =
          `Found ${migrationInfo.legacyPresetCount} preset(s) from a previous version. ` +
          `Would you like to migrate them to preserve your work?`;

        const shouldMigrate = confirm(message);

        if (shouldMigrate) {
          const result = migrateFromLegacyStorage({ createBackup: true });

          if (result.success) {
            updateStatus(
              `Migrated ${result.migratedPresets} preset(s) successfully!`,
              'success'
            );
            console.log('[App] Migration complete:', result);
          } else {
            updateStatus(
              'Migration encountered issues. Your original presets are preserved.',
              'warning'
            );
            console.warn('[App] Migration issues:', result.errors);
          }
        } else {
          // User declined - don't ask again
          dismissMigrationOffer();
          console.log('[App] User declined preset migration');
        }
      }
    } catch (error) {
      console.warn('[App] Error checking preset migration:', error);
    }
  };

  // Check migration after a short delay (after first-visit modal if present)
  setTimeout(checkPresetMigration, 1500);

  // Initialize high contrast toggle button
  const contrastBtn = document.getElementById('contrastToggle');
  if (contrastBtn) {
    contrastBtn.addEventListener('click', () => {
      const enabled = themeManager.toggleHighContrast();
      const message = enabled ? 'High Contrast: ON' : 'High Contrast: OFF';
      console.log(`[App] ${message}`);
      updateStatus(message);

      // Update ARIA label
      contrastBtn.setAttribute(
        'aria-label',
        `High contrast mode: ${enabled ? 'ON' : 'OFF'}. Click to ${enabled ? 'disable' : 'enable'}.`
      );

      setTimeout(() => {
        const state = stateManager.getState();
        if (state.uploadedFile) {
          updateStatus('Ready');
        }
      }, 2000);
    });

    // Set initial ARIA label
    const initialState = themeManager.highContrast;
    contrastBtn.setAttribute(
      'aria-label',
      `High contrast mode: ${initialState ? 'ON' : 'OFF'}. Click to ${initialState ? 'disable' : 'enable'}.`
    );
  }

  // Initialize keyboard shortcuts toggle button
  const shortcutsBtn = document.getElementById('shortcutsToggle');
  if (shortcutsBtn) {
    shortcutsBtn.addEventListener('click', () => {
      const modal = document.getElementById('shortcutsModal');
      const modalBody = document.getElementById('shortcutsModalBody');
      if (modal && modalBody) {
        // Initialize modal wiring once to avoid duplicate listeners.
        if (!modal.dataset.initialized) {
          initShortcutsModal(modalBody, () => closeModal(modal));
          modal.dataset.initialized = 'true';
        }
        openModal(modal);
      }
    });
  }

  // Declare format selector elements
  const outputFormatSelect = document.getElementById('outputFormat');
  const formatInfo = document.getElementById('formatInfo');
  const format2dGuidance = document.getElementById('format2dGuidance');

  // Initialize output format selector
  if (outputFormatSelect && formatInfo) {
    outputFormatSelect.addEventListener('change', () => {
      const format = outputFormatSelect.value;
      const formatDef = OUTPUT_FORMATS[format];

      if (formatDef) {
        formatInfo.textContent = formatDef.description;

        // Update button text
        const formatName = formatDef.name;
        if (primaryActionBtn.dataset.action === 'generate') {
          primaryActionBtn.textContent = `Generate ${formatName}`;
          primaryActionBtn.setAttribute(
            'aria-label',
            `Generate ${formatName} file from current parameters`
          );
        } else {
          primaryActionBtn.textContent = `ðŸ“¥ Download ${formatName}`;
          primaryActionBtn.setAttribute(
            'aria-label',
            `Download generated ${formatName} file`
          );
        }

        // Show/hide 2D format guidance for SVG/DXF laser cutting workflows
        if (format2dGuidance) {
          if (formatDef.is2D) {
            const wasHidden = format2dGuidance.classList.contains('hidden');
            format2dGuidance.classList.remove('hidden');
            if (wasHidden) {
              format2dGuidance.classList.remove('guidance-enter');
              void format2dGuidance.offsetWidth; // reflow to restart animation
              format2dGuidance.classList.add('guidance-enter');
              format2dGuidance.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest',
              });
            }
            announceImmediate(
              `${formatName} is a 2D format. See guidance below the format selector.`
            );

            // UX-B: Show "What will be auto-adjusted" indicator
            const state = stateManager.getState();
            const autoAdjustDiv = document.getElementById('format2dAutoAdjust');
            const autoAdjustList = document.getElementById(
              'format2dAutoAdjustList'
            );
            if (
              autoAdjustDiv &&
              autoAdjustList &&
              state?.parameters &&
              state?.schema
            ) {
              const resolved = resolve2DExportParameters(
                state.parameters,
                state.schema,
                format
              );
              const adjustments = Object.entries(resolved).filter(
                ([k, v]) => state.parameters[k] !== v
              );
              if (adjustments.length > 0) {
                autoAdjustList.innerHTML = adjustments
                  .map(
                    ([k, v]) =>
                      `<li><code>${escapeHtml(k)}</code>: currently <em>${escapeHtml(String(state.parameters[k]))}</em> â†’ will use <strong>${escapeHtml(String(v))}</strong></li>`
                  )
                  .join('');
                autoAdjustDiv.classList.remove('hidden');
              } else {
                autoAdjustDiv.classList.add('hidden');
              }
            }
          } else {
            format2dGuidance.classList.add('hidden');
          }
        }

        // Ensure primary action button reflects selected format
        updatePrimaryActionButton();
      }
    });

    // Set initial format info
    const initialFormat = outputFormatSelect.value;
    formatInfo.textContent = OUTPUT_FORMATS[initialFormat]?.description || '';

    // Hide 2D guidance initially (STL is default)
    if (format2dGuidance && !OUTPUT_FORMATS[initialFormat]?.is2D) {
      format2dGuidance.classList.add('hidden');
    }
  }

  // Check browser support
  const support = checkBrowserSupport();
  if (!support.supported) {
    showUnsupportedBrowser(support.missing);
    return;
  }

  // Track WASM initialization state
  let wasmInitialized = false;

  /**
   * Ensure WASM is initialized before operations that need it
   * @returns {Promise<boolean>} True if initialized successfully
   */
  async function ensureWasmInitialized() {
    const deferDownloads = shouldDeferLargeDownloads();
    if (!hasUserAcceptedDownload) {
      if (firstVisitModal && firstVisitModal.classList.contains('hidden')) {
        setFirstVisitBlocking(true);
        openModal(firstVisitModal);
      }
      updateStatus(
        'Please review and accept the welcome notice before continuing.',
        'info'
      );
      return false;
    }
    if (wasmInitialized) return true;

    // Check if we should defer large downloads on metered connections
    if (deferDownloads) {
      const proceed = confirm(
        'This app requires downloading ~15MB of WebAssembly files.\n\n' +
          'You appear to be on a metered or slow connection.\n\n' +
          'Do you want to proceed with the download?'
      );
      if (!proceed) {
        updateStatus('WASM download deferred', 'info');
        return false;
      }
    }

    // Initialize if not yet done
    if (!renderController) {
      renderController = new RenderController();

      // Set up memory warning callback
      renderController.setMemoryWarningCallback((memoryInfo) => {
        console.warn(
          `[Memory] High usage: ${memoryInfo.usedMB}MB / ${memoryInfo.limitMB}MB (${memoryInfo.percent}%)`
        );
        // Update memory indicator
        updateMemoryIndicator(memoryInfo);
        // Feed into MemoryMonitor for badge updates
        const monitor = _getMemoryMonitor();
        if (monitor) {
          monitor.updateFromWorker(memoryInfo);
        }
        showMemoryWarning(memoryInfo);
        if (previewQualityMode === 'auto') {
          autoPreviewHints.forceFastUntil =
            Date.now() + AUTO_PREVIEW_FORCE_FAST_MS;
          adaptivePreviewMemo = { key: null, info: null };
          if (autoPreviewController) {
            autoPreviewController.clearPreviewCache();
            const state = stateManager.getState();
            if (state?.uploadedFile) {
              autoPreviewController.onParameterChange(state.parameters);
            }
          }
        }
      });

      // Handle capability detection - notify user about performance limitations
      renderController.setCapabilitiesCallback((capabilities) => {
        console.log('[Main] OpenSCAD capabilities detected:', capabilities);

        // Store for debugging/display
        window.__openscadCapabilities = capabilities;

        // Show warning if Manifold is not available
        if (!capabilities.hasManifold) {
          const warningMessage =
            'Advanced rendering optimization (Manifold) is not available in this OpenSCAD build. ' +
            'Complex models may render slower than expected.';

          // Announce warning to screen readers
          announceImmediate(warningMessage);

          // Also log to console with helpful context
          console.warn(
            '[Performance] Manifold not detected. Expected speedups:\n' +
              '- With Manifold: 5-30x faster for complex boolean operations\n' +
              '- Current: Using slower CGAL/nef backend\n' +
              'Check that official OpenSCAD WASM is loading from /wasm/openscad-official/'
          );
        }

        // Show info about binary STL support
        if (!capabilities.hasBinarySTL) {
          console.warn(
            '[Performance] Binary STL export may not be supported. ' +
              'ASCII STL is ~18x slower.'
          );
        }
      });

      // Show WASM loading progress indicator
      const wasmLoadingOverlay = showWasmLoadingIndicator();

      try {
        // Set crash detection flag BEFORE WASM init.
        // If the page crashes during init, the flag remains set and
        // recovery mode will auto-activate on next load.
        localStorage.setItem('openscad-forge-wasm-init-started', 'true');
        localStorage.removeItem('openscad-forge-wasm-init-completed');

        const assetBaseUrl = new URL(
          import.meta.env.BASE_URL,
          window.location.origin
        )
          .toString()
          .replace(/\/$/, '');
        await renderController.init({
          assetBaseUrl,
          onProgress: (percent, message) => {
            console.log(`[WASM Init] ${percent}% - ${message}`);
            updateWasmLoadingProgress(wasmLoadingOverlay, percent, message);
          },
        });
        console.log('OpenSCAD WASM ready');
        hideWasmLoadingIndicator(wasmLoadingOverlay);
        wasmInitialized = true;

        // Clear crash detection flag â€” WASM init succeeded
        localStorage.setItem('openscad-forge-wasm-init-completed', 'true');

        // Start worker health monitoring
        renderController.startHealthMonitoring();
        // Expose WASM readiness as a DOM attribute so E2E tests
        // can wait for it without race-prone overlay checks.
        document.body.setAttribute('data-wasm-ready', 'true');
        // Start memory usage polling
        startMemoryPolling();
        return true;
      } catch (error) {
        console.error('Failed to initialize OpenSCAD WASM:', error);
        hideWasmLoadingIndicator(wasmLoadingOverlay);
        updateStatus('OpenSCAD engine failed to initialize');
        _announceError(
          'OpenSCAD engine failed to initialize. Some features may not work.'
        );
        const details = error?.details ? ` Details: ${error.details}` : '';
        alert(
          'Failed to initialize OpenSCAD engine. Some features may not work. Error: ' +
            error.message +
            details
        );
        return false;
      }
    }

    return wasmInitialized;
  }

  // Initialize render controller immediately for now (future: can be deferred)
  if (hasUserAcceptedDownload) {
    console.log('Initializing OpenSCAD WASM...');
    await ensureWasmInitialized();
  } else {
    pendingWasmInit = true;
    console.log('WASM init deferred until user consent.');
  }

  /**
   * Show WASM loading progress indicator
   * @returns {HTMLElement} The loading overlay element
   */
  function showWasmLoadingIndicator() {
    const overlay = document.createElement('div');
    overlay.id = 'wasmLoadingOverlay';
    overlay.className = 'wasm-loading-overlay';
    overlay.setAttribute('role', 'status');
    overlay.setAttribute('aria-live', 'polite');
    overlay.setAttribute('aria-label', 'Loading OpenSCAD engine');

    overlay.innerHTML = `
      <div class="wasm-loading-content">
        <div class="wasm-loading-spinner">
          <div class="spinner spinner-large"></div>
        </div>
        <h2 class="wasm-loading-title">Loading OpenSCAD Engine</h2>
        <p class="wasm-loading-message">Initializing...</p>
        <div class="wasm-loading-progress-container">
          <div class="wasm-loading-progress-bar">
            <div class="wasm-loading-progress-fill" style="width: 0%"></div>
          </div>
          <span class="wasm-loading-progress-text">0%</span>
        </div>
        <p class="wasm-loading-hint">This may take a moment on first load (~15-30MB download)</p>
      </div>
    `;

    document.body.appendChild(overlay);
    return overlay;
  }

  /**
   * Update WASM loading progress indicator
   * @param {HTMLElement} overlay - The loading overlay element
   * @param {number} percent - Progress percentage (-1 for indeterminate)
   * @param {string} message - Progress message
   */
  function updateWasmLoadingProgress(overlay, percent, message) {
    if (!overlay) return;

    const messageEl = overlay.querySelector('.wasm-loading-message');
    const progressFill = overlay.querySelector('.wasm-loading-progress-fill');
    const progressText = overlay.querySelector('.wasm-loading-progress-text');

    if (messageEl) messageEl.textContent = message;

    if (percent < 0) {
      // Indeterminate progress
      if (progressFill) {
        progressFill.classList.add('indeterminate');
        progressFill.style.width = '100%';
      }
      if (progressText) progressText.textContent = '';
    } else {
      if (progressFill) {
        progressFill.classList.remove('indeterminate');
        progressFill.style.width = `${percent}%`;
      }
      if (progressText) progressText.textContent = `${percent}%`;
    }
  }

  /**
   * Hide WASM loading indicator
   * @param {HTMLElement} overlay - The loading overlay element
   */
  function hideWasmLoadingIndicator(overlay) {
    if (!overlay) return;

    // Fade out animation
    overlay.classList.add('fade-out');
    setTimeout(() => {
      if (overlay.parentElement) {
        overlay.remove();
      }
    }, 300);
  }

  /**
   * Show memory usage warning notification
   * @param {Object} memoryInfo - Memory usage info from worker
   */
  function showMemoryWarning(memoryInfo) {
    // Remove any existing warning
    const existingWarning = document.getElementById('memoryWarning');
    if (existingWarning) {
      existingWarning.remove();
    }

    const warning = document.createElement('div');
    warning.id = 'memoryWarning';
    warning.className = 'memory-warning';
    warning.setAttribute('role', 'alert');
    warning.innerHTML = `
      <div class="memory-warning-content">
        <span class="memory-warning-icon">âš ï¸</span>
        <div class="memory-warning-text">
          <strong>High Memory Usage</strong>
          <p>Memory: ${memoryInfo.usedMB}MB / ${memoryInfo.limitMB}MB (${memoryInfo.percent}%)</p>
          <p class="memory-warning-hint">
            This warning is about the OpenSCAD engineâ€™s allocated memory (it may stay high until the engine is restarted).
            If you also see an error like â€œproduces no geometryâ€, fix that firstâ€”memory may not be the cause.
          </p>
          <div class="memory-warning-actions" role="group" aria-label="Memory warning actions">
            <button type="button" class="btn btn-sm btn-outline" data-action="preview-fast">
              Use Fast preview
            </button>
            <button type="button" class="btn btn-sm btn-outline" data-action="export-low">
              Set Export quality: Low
            </button>
            <button type="button" class="btn btn-sm btn-outline" data-action="focus-resolution">
              Find resolution setting
            </button>
            <button type="button" class="btn btn-sm btn-outline" data-action="restart-engine">
              Restart engine
            </button>
          </div>
        </div>
        <button class="btn btn-sm btn-outline memory-warning-dismiss" aria-label="Dismiss warning">Ã—</button>
      </div>
    `;

    document.body.appendChild(warning);

    // Handle dismiss
    warning
      .querySelector('.memory-warning-dismiss')
      .addEventListener('click', () => {
        warning.remove();
      });

    // Action buttons
    warning.addEventListener('click', async (e) => {
      const btn = e.target?.closest?.('button[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;

      if (action === 'preview-fast') {
        const select = document.getElementById('previewQualitySelect');
        if (select) {
          select.value = 'fast';
          select.dispatchEvent(new Event('change', { bubbles: true }));
          updateStatus('Preview quality set to Fast', 'success');
        }
      } else if (action === 'export-low') {
        const select = document.getElementById('exportQualitySelect');
        if (select) {
          select.value = 'low';
          select.dispatchEvent(new Event('change', { bubbles: true }));
          updateStatus('Export quality set to Low', 'success');
        }
      } else if (action === 'focus-resolution') {
        const candidates = [
          '$fn',
          'smoothness_of_circles_and_arcs',
          '$fa',
          '$fs',
        ];
        let found = false;
        for (const name of candidates) {
          const res = focusParameter(name);
          if (res.found) {
            updateStatus(`Adjust "${name}" to reduce resolution`, 'info');
            found = true;
            break;
          }
        }
        if (!found) {
          updateStatus(
            'Try searching parameters for â€œ$fnâ€, â€œsmoothnessâ€, â€œresolutionâ€, or â€œqualityâ€.',
            'info'
          );
        }
      } else if (action === 'restart-engine') {
        try {
          if (renderController) {
            updateStatus('Restarting engine...', 'info');
            await renderController.restart();
            updateStatus('Engine restarted. Try generating again.', 'success');
          }
        } catch (err) {
          console.error('Failed to restart engine:', err);
          updateStatus(
            'Could not restart engine. Try refreshing the page.',
            'error'
          );
        }
      }
    });

    // Auto-dismiss after 15 seconds
    setTimeout(() => {
      if (warning.parentElement) {
        warning.remove();
      }
    }, 15000);
  }

  /**
   * Provide actionable guidance for configuration-dependent â€œno geometryâ€ errors.
   * Returns true if it handled the error.
   */
  function updateMemoryIndicator(memoryInfo) {
    const indicator = document.getElementById('memoryIndicator');
    const text = document.getElementById('memoryText');
    const barFill = document.getElementById('memoryBarFill');
    const bar = document.getElementById('memoryBar');

    if (!indicator || !memoryInfo) return;

    indicator.classList.remove('hidden');

    if (text) {
      text.textContent = `${memoryInfo.usedMB || 0}MB`;
    }

    const percent = memoryInfo.percent || 0;
    if (barFill) {
      barFill.style.width = `${Math.min(percent, 100)}%`;
    }
    if (bar) {
      bar.setAttribute('aria-valuenow', percent);
    }

    indicator.classList.remove('warning', 'critical');
    if (percent >= 90) {
      indicator.classList.add('critical');
    } else if (percent >= 75) {
      indicator.classList.add('warning');
    }

    const tips = [];
    if (percent >= 90) {
      tips.push('Memory very high - consider refreshing');
    } else if (percent >= 75) {
      tips.push('Memory usage elevated');
    }
    if (memoryInfo.limitMB) {
      tips.push(`${memoryInfo.usedMB}MB of ~${memoryInfo.limitMB}MB`);
    }
    indicator.title = tips.join('\n') || 'WASM memory usage';
  }

  // memoryPollInterval is now declared at the top of initApp() to avoid TDZ
  function startMemoryPolling() {
    if (memoryPollInterval) return;

    memoryPollInterval = setInterval(async () => {
      if (renderController && renderController.ready) {
        try {
          const memoryInfo = await renderController.getMemoryUsage();
          if (memoryInfo && memoryInfo.available !== false) {
            updateMemoryIndicator(memoryInfo);
            // Feed worker memory data into the MemoryMonitor so the
            // badge reflects actual WASM heap, not main-thread JS heap.
            const monitor = _getMemoryMonitor();
            if (monitor) {
              monitor.updateFromWorker(memoryInfo);
            }
          }
        } catch (_e) {
          // Silently ignore polling errors
        }
      }
    }, 10000);
  }

  // Prefixed with _ to indicate intentionally unused (reserved for future cleanup)
  function _stopMemoryPolling() {
    if (memoryPollInterval) {
      clearInterval(memoryPollInterval);
      memoryPollInterval = null;
    }
  }

  function handleConfigDependencyError(error) {
    const code = error?.code;
    const msg = error?.message || '';
    const details = error?.details || '';
    const detailsStr = String(details || '');

    // BUG-B fix: handle NO_GEOMETRY â€” emitted by isNonPreviewableParameters() when
    // generate=Customizer Settings (or similar non-previewable mode). The previous mesh
    // must be cleared so the 3D canvas is empty, matching the expectation that
    // "Customizer Settings" produces no visible geometry.
    if (code === 'NO_GEOMETRY') {
      if (previewManager) {
        previewManager.clear();
      }
      updateStatus(
        "No geometry in this mode. Adjust 'generate' to see a 3D preview.",
        'success'
      );
      previewStateIndicator.className = 'preview-state-indicator state-current';
      previewStateIndicator.textContent = 'â€” No geometry (Customizer mode)';
      previewContainer.classList.remove('preview-error');
      previewContainer.classList.add('preview-current');
      return true;
    }

    // Handle 2D model case â€” applies to any project producing 2D output
    const is2DModel =
      code === 'MODEL_IS_2D' ||
      /MODEL_IS_2D|not a 3D object|Top level object is a 2D object/i.test(
        msg
      ) ||
      /not a 3D object|2D object/i.test(detailsStr);

    if (is2DModel) {
      if (previewManager) {
        previewManager.clear();
      }
      // Show guidance for 2D model â€” this is informational, not an error
      // Use 'success' not 'error' to avoid alarming red warnings on a correct workflow path
      updateStatus(
        'Your model produces 2D geometry. Select SVG or DXF output format to export.',
        'success'
      );

      // Override the preview state badge: auto-preview-controller already set it to ERROR
      // before this handler fired. Replace with a non-alarming "2D Model" indicator.
      previewStateIndicator.className = 'preview-state-indicator state-current';
      previewStateIndicator.textContent = 'âœ“ 2D Model â€” use SVG/DXF';
      previewContainer.classList.remove('preview-error');
      previewContainer.classList.add('preview-current');

      // Dismiss any memory warning that may have been triggered by the failed 2Dâ†’STL render.
      // The high memory is a side effect of the expected 2D path, not a real memory issue.
      const memWarning = document.getElementById('memoryWarning');
      if (memWarning) memWarning.remove();

      return true;
    }

    const hasDependencyHint =
      /'[^']+?'\s+is set to\s+'(no|off)'/i.test(detailsStr) ||
      /Current top[ -]?level object is empty|top-level object is empty/i.test(
        detailsStr
      );
    const isEmpty =
      code === 'EMPTY_GEOMETRY' ||
      /produces no geometry|top level object is empty/i.test(msg) ||
      hasDependencyHint;

    if (!isEmpty) return false;

    // Clear the 3D preview when geometry is empty so no stale mesh is shown.
    if (previewManager) {
      previewManager.clear();
    }

    // Hide memory warning so the real root cause is not obscured
    const existingWarning = document.getElementById('memoryWarning');
    if (existingWarning) existingWarning.remove();

    // Extract all toggle hints from OpenSCAD output (there can be multiple).
    const matches = Array.from(
      detailsStr.matchAll(/'([^']+?)'\s+is set to\s+'([^']+?)'/gi)
    ).map((m) => ({
      label: m?.[1] ? m[1].trim() : null,
      current: m?.[2] ? m[2].trim() : null,
    }));

    const invertToggleValue = (value) => {
      const v = String(value || '')
        .trim()
        .toLowerCase();
      if (v === 'no') return 'yes';
      if (v === 'yes') return 'no';
      if (v === 'off') return 'on';
      if (v === 'on') return 'off';
      return null;
    };

    let chosen =
      matches.length > 0 ? matches[0] : { label: null, current: null };
    let targetKey = null;

    // Prefer a match we can actually find in the UI (prevents â€œwrong toggleâ€ guidance).
    for (const candidate of matches) {
      if (!candidate.label) continue;
      const keyGuess = candidate.label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
      const foundKey = locateParameterKey(keyGuess, {
        labelHint: candidate.label,
      });
      if (foundKey) {
        chosen = candidate;
        targetKey = foundKey;
        break;
      }
    }

    const label = chosen.label;
    const current = chosen.current;
    const suggested = invertToggleValue(current);

    const headline = label
      ? `This selection is blocked because "${label}" is currently "${current ?? 'unknown'}".`
      : 'This selection produces no geometry with the current settings.';

    const nextStep = label
      ? suggested
        ? `Change it to "${suggested}" and try again.`
        : `Change that option (toggle it) and try again.`
      : 'Look for a required option (often â€œenable/show/include/hasâ€¦â€) and try again.';

    const findHint = label
      ? `Tip: use the â€œSearch parametersâ€ box and type "${label}".`
      : '';

    updateStatus(`${headline} ${nextStep} ${findHint}`.trim(), 'error');
    showDependencyGuidanceModal({
      label,
      current,
      suggested,
      targetKey,
    });
    return true;
  }

  /**
   * Show an accessible modal that guides the user to a blocking toggle/setting.
   * @param {Object} info
   * @param {string|null} info.label
   * @param {string|null} info.current
   * @param {string|null} info.suggested
   * @param {string|null} info.targetKey - Param key to focus/highlight
   */
  function showDependencyGuidanceModal(info) {
    if (isAnyModalOpen()) {
      console.log('[DependencyGuidance] Suppressed â€” another modal is active');
      return;
    }

    const { label, current, suggested, targetKey } = info || {};

    // Reuse a single modal instance
    let modal = document.getElementById('dependencyGuidanceModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'dependencyGuidanceModal';
      modal.className =
        'preset-modal confirm-modal dependency-guidance-modal hidden';
      modal.setAttribute('role', 'alertdialog');
      modal.setAttribute('aria-modal', 'true');
      modal.setAttribute('aria-labelledby', 'dependencyGuidanceTitle');
      modal.setAttribute('aria-describedby', 'dependencyGuidanceMessage');
      modal.style.zIndex = '10005';
      modal.innerHTML = `
        <div class="preset-modal-content confirm-modal-content">
          <div class="preset-modal-header">
            <h3 id="dependencyGuidanceTitle" class="preset-modal-title">Action needed</h3>
          </div>
          <div class="confirm-modal-body">
            <p id="dependencyGuidanceMessage"></p>
          </div>
          <div class="preset-form-actions">
            <button type="button" class="btn btn-primary" data-action="goto">Take me to the setting</button>
            <button type="button" class="btn btn-secondary" data-action="search">Search for it</button>
            <button type="button" class="btn btn-outline" data-action="close">Close</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      modal.addEventListener('click', (e) => {
        const btn = e.target?.closest?.('button[data-action]');
        if (!btn) return;
        const action = btn.dataset.action;
        if (action === 'close') {
          closeModal(modal);
          return;
        }
        if (action === 'goto') {
          closeModal(modal);
          if (modal._targetKey) {
            focusParameter(modal._targetKey);
          }
          return;
        }
        if (action === 'search') {
          closeModal(modal);
          const searchInput = document.getElementById('paramSearchInput');
          if (searchInput && modal._label) {
            searchInput.value = modal._label;
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
            searchInput.focus();
          }
          return;
        }
      });

      // Click outside closes
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal(modal);
      });
    }

    const messageEl = modal.querySelector('#dependencyGuidanceMessage');
    const gotoBtn = modal.querySelector('button[data-action="goto"]');
    const searchBtn = modal.querySelector('button[data-action="search"]');

    const hasTarget = Boolean(targetKey);
    if (gotoBtn) gotoBtn.disabled = !hasTarget;
    if (searchBtn) searchBtn.disabled = !label;

    modal._targetKey = targetKey || null;
    modal._label = label || null;

    const parts = [];
    if (label) {
      parts.push(`"${label}" is currently "${current ?? 'unknown'}".`);
      if (suggested) {
        parts.push(`Change it to "${suggested}" to continue.`);
      } else {
        parts.push('Change that option (toggle it) to continue.');
      }
    } else {
      parts.push(
        'This selection produces no geometry with the current settings. A required option may be off/on.'
      );
    }
    parts.push('Then try again.');

    if (messageEl) {
      messageEl.textContent = parts.join(' ');
    }

    openModal(modal, { focusTarget: gotoBtn || searchBtn || undefined });
  }

  /**
   * Show render time estimate to user
   * @param {Object} estimate - Result from estimateRenderTime()
   */
  function showRenderEstimate(estimate) {
    if (!estimate || estimate.seconds < 5) return; // Only show for longer renders

    let message = `Estimated render time: ~${estimate.seconds}s`;
    if (estimate.warning) {
      message += ` âš ï¸ ${estimate.warning}`;
    }
    updateStatus(message);
  }
  // Export for potential future use (avoids unused warning)
  window._showRenderEstimate = showRenderEstimate;

  // Get DOM elements
  const welcomeScreen = document.getElementById('welcomeScreen');
  const mainInterface = document.getElementById('mainInterface');
  const uploadZone = document.getElementById('uploadZone');
  const fileInput = document.getElementById('fileInput');
  const clearFileBtn = document.getElementById('clearFileBtn');
  statusArea = document.getElementById('statusArea');
  // previewStatusBar, previewStatusText, previewStatusStats are declared at top of initApp() to avoid TDZ
  previewStatusBar = document.getElementById('previewStatusBar');
  previewStatusText = document.getElementById('previewStatusText');
  previewStatusStats = document.getElementById('previewStatusStats');
  const primaryActionBtn = document.getElementById('primaryActionBtn');
  const cancelRenderBtn = document.getElementById('cancelRenderBtn');
  const downloadFallbackLink = document.getElementById('downloadFallbackLink');
  const statsArea = document.getElementById('stats');
  const previewContainer = document.getElementById('previewContainer');
  const autoPreviewToggle = document.getElementById('autoPreviewToggle');
  const previewQualitySelect = document.getElementById('previewQualitySelect');
  const exportQualitySelect = document.getElementById('exportQualitySelect');
  const measurementsToggle = document.getElementById('measurementsToggle');
  const gridToggle = document.getElementById('gridToggle');
  const autoBedToggle = document.getElementById('autoBedToggle');
  const dimensionsDisplay = document.getElementById('dimensionsDisplay');
  // Note: outputFormatSelect and formatInfo already declared above

  // Reference overlay controls (used by preset load, back-to-welcome reset, etc.)
  const overlaySourceSelect = document.getElementById('overlaySourceSelect');
  const overlayToggle = document.getElementById('overlayToggle');

  // Create preview state indicator element
  const previewStateIndicator = document.createElement('div');
  previewStateIndicator.className = 'preview-state-indicator state-idle';
  previewStateIndicator.textContent = 'No preview';
  previewStateIndicator.setAttribute('aria-live', 'polite');

  // Create rendering overlay
  const renderingOverlay = document.createElement('div');
  renderingOverlay.className = 'preview-rendering-overlay';
  renderingOverlay.innerHTML =
    '<div class="spinner"></div><span class="rendering-text">Generating preview\u2026</span>';

  // Track last generated parameters for comparison
  let lastGeneratedParamsHash = null;

  // Auto-preview enabled by default (values initialized earlier)
  const getSelectedPreviewQualityMode = () => {
    return previewQualitySelect?.value || 'balanced';
  };

  const getSelectedExportQualityMode = () => {
    return exportQualitySelect?.value || 'model';
  };

  const getManualPreviewQuality = (mode) => {
    switch (mode) {
      case 'fast':
        return RENDER_QUALITY.DRAFT;
      case 'fidelity':
        // Use desktop-equivalent quality - matches OpenSCAD F6 render
        // Respects model's tessellation settings while ensuring OpenSCAD defaults
        return RENDER_QUALITY.DESKTOP_DEFAULT;
      case 'balanced':
      default:
        return RENDER_QUALITY.PREVIEW;
    }
  };

  /**
   * Get export quality preset using adaptive tier system
   * @param {string} mode - Quality mode (low, medium, high, model)
   * @returns {Object|null} Quality preset or null for model default
   */
  const getExportQualityPreset = (mode) => {
    if (mode === 'model') {
      // null = use model's own quality settings (FULL quality with no overrides)
      return null;
    }

    // Get current complexity tier from state
    const state = stateManager.getState();
    const tier = state?.complexityTier || COMPLEXITY_TIER.STANDARD;
    const hardware = state?.adaptiveQualityConfig?.hardware || {
      level: 'medium',
    };

    // Get tier-appropriate preset
    return getQualityPreset(tier, hardware.level, mode, 'export');
  };

  /**
   * Get adaptive preview info using tier system
   * @param {Object} parameters - Current parameters
   * @returns {Object} { quality, qualityKey }
   */
  const getAdaptivePreviewInfo = (parameters) => {
    const state = stateManager.getState();
    const scadContent = state?.uploadedFile?.content || '';
    const tier = state?.complexityTier || COMPLEXITY_TIER.STANDARD;
    const hardware = state?.adaptiveQualityConfig?.hardware || {
      level: 'medium',
    };

    const scadSignature = state?.uploadedFile
      ? `${state.uploadedFile.name}|${scadContent.length}|${tier}`
      : 'none';
    const memoKey = `${hashParams(parameters)}|${scadSignature}|${autoPreviewHints.forceFastUntil}|${autoPreviewHints.lastPreviewDurationMs}|${autoPreviewHints.lastPreviewTriangles}`;
    if (adaptivePreviewMemo.key === memoKey) {
      return adaptivePreviewMemo.info;
    }

    const now = Date.now();
    const forceFast = now < autoPreviewHints.forceFastUntil;
    const slowRender =
      autoPreviewHints.lastPreviewDurationMs &&
      autoPreviewHints.lastPreviewDurationMs >= AUTO_PREVIEW_SLOW_RENDER_MS;
    const heavyTriangles =
      autoPreviewHints.lastPreviewTriangles &&
      autoPreviewHints.lastPreviewTriangles >= AUTO_PREVIEW_TRIANGLE_THRESHOLD;

    let estimatedSlow = false;
    if (scadContent) {
      const estimate = estimateRenderTime(scadContent, parameters);
      // Lower thresholds to trigger auto-fast more promptly for heavy models
      // Also consider file size as a signal (large SCAD files often correlate with complexity)
      const fileSizeHeavy = scadContent.length > 15000; // 15KB+ SCAD file
      estimatedSlow =
        estimate.warning ||
        estimate.seconds >= 8 || // Lowered from 12s to 8s
        estimate.complexity >= 80 || // Lowered from 120 to 80
        fileSizeHeavy;
    }

    // Determine preview quality level based on conditions
    const useFast = forceFast || slowRender || heavyTriangles || estimatedSlow;
    const qualityLevel = useFast ? 'low' : 'medium';

    // Get tier-appropriate preview preset
    const quality = getQualityPreset(
      tier,
      hardware.level,
      qualityLevel,
      'preview'
    );
    const qualityKey = useFast ? `auto-fast-${tier}` : `auto-balanced-${tier}`;

    const info = { quality, qualityKey };
    adaptivePreviewMemo = { key: memoKey, info };
    return info;
  };

  const applyAutoPreviewOverrides = (parameters, qualityKey) => {
    if (!qualityKey?.startsWith('auto-fast')) {
      return parameters;
    }

    const adjusted = { ...parameters };
    if (Object.prototype.hasOwnProperty.call(adjusted, 'render_quality')) {
      adjusted.render_quality = 'Low';
    }
    if (Object.prototype.hasOwnProperty.call(adjusted, 'cone_segments')) {
      const raw = Number(adjusted.cone_segments);
      if (Number.isFinite(raw)) {
        adjusted.cone_segments = Math.max(8, Math.min(12, raw));
      } else {
        adjusted.cone_segments = 12;
      }
    }

    return adjusted;
  };

  const resolveAdaptiveQuality = (parameters) =>
    getAdaptivePreviewInfo(parameters).quality;
  const resolveAdaptiveCacheKey = (parameters) =>
    getAdaptivePreviewInfo(parameters).qualityKey;
  const resolveAdaptiveParameters = (parameters, qualityKey) =>
    applyAutoPreviewOverrides(parameters, qualityKey);

  const applyPreviewQualityMode = () => {
    previewQualityMode = getSelectedPreviewQualityMode();
    adaptivePreviewMemo = { key: null, info: null };

    if (previewQualityMode === 'auto') {
      previewQuality = null;
      if (autoPreviewController) {
        autoPreviewController.setPreviewQualityResolver(resolveAdaptiveQuality);
        autoPreviewController.setPreviewCacheKeyResolver(
          resolveAdaptiveCacheKey
        );
        autoPreviewController.setPreviewParametersResolver(
          resolveAdaptiveParameters
        );
        autoPreviewController.setPreviewQuality(null);
      }
      return;
    }

    previewQuality = getManualPreviewQuality(previewQualityMode);
    if (autoPreviewController) {
      autoPreviewController.setPreviewQualityResolver(null);
      autoPreviewController.setPreviewCacheKeyResolver(null);
      autoPreviewController.setPreviewParametersResolver(null);
      autoPreviewController.setPreviewQuality(previewQuality);
    }
  };

  let exportQualityMode = getSelectedExportQualityMode();
  let exportQualityPreset = getExportQualityPreset(exportQualityMode);

  const applyExportQualityMode = () => {
    exportQualityMode = getSelectedExportQualityMode();
    exportQualityPreset = getExportQualityPreset(exportQualityMode);
  };

  // Wire preview settings UI
  if (autoPreviewToggle) {
    autoPreviewToggle.checked = autoPreviewEnabled;
    autoPreviewToggle.addEventListener('change', () => {
      autoPreviewUserEnabled = autoPreviewToggle.checked;
      autoPreviewEnabled = autoPreviewUserEnabled;
      if (autoPreviewController) {
        autoPreviewController.setEnabled(
          autoPreviewEnabled,
          autoPreviewEnabled ? null : 'user'
        );
      }
    });
  }

  if (previewQualitySelect) {
    if (previewQualitySelect.querySelector('option[value="auto"]')) {
      previewQualitySelect.value = 'auto';
    }
    applyPreviewQualityMode();
    previewQualitySelect.addEventListener('change', () => {
      applyPreviewQualityMode();
      if (autoPreviewController) {
        const state = stateManager.getState();
        if (state?.uploadedFile) {
          autoPreviewController.onParameterChange(state.parameters);
        }
      }
    });
  }

  if (exportQualitySelect) {
    if (exportQualitySelect.querySelector('option[value="model"]')) {
      exportQualitySelect.value = 'model';
    }
    applyExportQualityMode();
    exportQualitySelect.addEventListener('change', () => {
      applyExportQualityMode();
    });
  }

  // Wire measurements toggle
  if (measurementsToggle) {
    // Initialize from localStorage (after preview manager is created)
    // The checkbox will be set when preview manager is initialized

    measurementsToggle.addEventListener('change', () => {
      const enabled = measurementsToggle.checked;
      if (previewManager) {
        previewManager.toggleMeasurements(enabled);
        updateDimensionsDisplay();
      }
      console.log(`[App] Measurements ${enabled ? 'enabled' : 'disabled'}`);
    });
  }

  // Wire grid toggle
  if (gridToggle) {
    gridToggle.addEventListener('change', () => {
      const enabled = gridToggle.checked;
      if (previewManager) {
        previewManager.toggleGrid(enabled);
      }
      console.log(`[App] Grid ${enabled ? 'enabled' : 'disabled'}`);
    });
  }

  // Initialize overlay/grid/auto-rotate controller (extracted module)
  const overlayGridCtrl = initOverlayGridController({
    getPreviewManager: () => previewManager,
    updateStatus,
  });

  // Initialize companion files controller (extracted module)
  const companionFilesCtrl = initCompanionFilesController({
    getPreviewManager: () => previewManager,
    getAutoPreviewController: () => autoPreviewController,
    overlayGridCtrl,
    updateStatus,
    getCurrentSavedProjectId: () => currentSavedProjectId,
    setCanonicalProjectFiles,
  });

  // Wire auto-bed toggle
  if (autoBedToggle) {
    autoBedToggle.addEventListener('change', () => {
      const enabled = autoBedToggle.checked;
      if (previewManager) {
        const needsRerender = previewManager.toggleAutoBed(enabled);
        // If model is loaded and setting changed, trigger re-render
        const currentStl = stateManager.getState()?.stl;
        if (needsRerender && currentStl) {
          // Re-render to apply the new auto-bed setting
          // Preserve camera position since user is just toggling a display setting
          previewManager.loadSTL(currentStl, { preserveCamera: true });
          updateDimensionsDisplay();
        }
      }
      console.log(`[App] Auto-bed ${enabled ? 'enabled' : 'disabled'}`);
    });
  }

  // Wire status bar toggle
  const statusBarToggle = document.getElementById('statusBarToggle');
  if (statusBarToggle && previewStatusBar) {
    // Initialize from localStorage
    const savedStatusBarPref = localStorage.getItem(STORAGE_KEY_STATUS_BAR);
    const statusBarEnabled = savedStatusBarPref !== 'false'; // Default to true
    statusBarToggle.checked = statusBarEnabled;
    if (!statusBarEnabled) {
      previewStatusBar.classList.add('user-hidden');
    }

    statusBarToggle.addEventListener('change', () => {
      const enabled = statusBarToggle.checked;
      if (enabled) {
        previewStatusBar.classList.remove('user-hidden');
      } else {
        previewStatusBar.classList.add('user-hidden');
      }
      localStorage.setItem(STORAGE_KEY_STATUS_BAR, enabled ? 'true' : 'false');
      console.log(`[App] Status bar ${enabled ? 'shown' : 'hidden'}`);
    });
  }

  // ============================================================================
  // Engine toggle: switch between Manifold (fast) and CGAL (stable, max compatibility)
  // Toggle between Manifold (fast, 5-30x speedup) and CGAL (stable, maximum compatibility)
  // ============================================================================
  const manifoldEngineToggle = document.getElementById('manifoldEngineToggle');
  const manifoldEngineHint = document.getElementById('manifoldEngineHint');
  const STORAGE_KEY_MANIFOLD_ENGINE = 'openscad-forge-manifold-engine';

  if (manifoldEngineToggle) {
    // Initialize from localStorage (default to true for performance)
    const savedManifoldPref = localStorage.getItem(STORAGE_KEY_MANIFOLD_ENGINE);
    const manifoldEnabled =
      savedManifoldPref === null ? true : savedManifoldPref !== 'false';
    manifoldEngineToggle.checked = manifoldEnabled;

    // Update hint text based on initial state
    if (manifoldEngineHint) {
      manifoldEngineHint.textContent = manifoldEnabled
        ? '5-30Ã— faster. Disable if models fail to render.'
        : 'Using stable engine. Enable for faster rendering.';
    }

    manifoldEngineToggle.addEventListener('change', () => {
      const enabled = manifoldEngineToggle.checked;
      localStorage.setItem(
        STORAGE_KEY_MANIFOLD_ENGINE,
        enabled ? 'true' : 'false'
      );

      // Update hint text
      if (manifoldEngineHint) {
        manifoldEngineHint.textContent = enabled
          ? '5-30Ã— faster. Disable if models fail to render.'
          : 'Using stable engine. Enable for faster rendering.';
      }

      // Announce change for screen readers
      announceImmediate(
        enabled
          ? 'Manifold engine enabled. Faster rendering with good compatibility.'
          : 'Stable engine enabled. Maximum compatibility, slower rendering.'
      );

      console.log(
        `[App] Render engine: ${enabled ? 'Manifold (fast)' : 'CGAL (stable)'}`
      );

      // Note: Changes take effect on next render - no need to re-render current model
      // Show a subtle status message
      updateStatus(
        enabled
          ? 'Fast engine enabled - changes apply to next render'
          : 'Stable engine enabled - changes apply to next render',
        'success'
      );
    });
  }


  // Wire model color picker and override toggle
  const modelColorPicker = document.getElementById('modelColorPicker');
  const modelColorReset = document.getElementById('modelColorReset');
  const modelColorEnabled = document.getElementById('modelColorEnabled');
  const modelColorPickerWrapper = modelColorPicker?.closest(
    '.model-color-picker'
  );

  // Load saved state
  const savedModelColor = localStorage.getItem(STORAGE_KEY_MODEL_COLOR);
  const savedColorEnabled =
    localStorage.getItem(STORAGE_KEY_MODEL_COLOR_ENABLED) === 'true';

  if (savedModelColor && modelColorPicker) {
    modelColorPicker.value = savedModelColor;
  }

  const updatePickerDisabledState = (enabled) => {
    if (modelColorPickerWrapper) {
      modelColorPickerWrapper.classList.toggle('disabled', !enabled);
    }
  };

  const getSelectedModelColor = () =>
    modelColorPicker?.value ||
    localStorage.getItem(STORAGE_KEY_MODEL_COLOR) ||
    getThemeDefaultColor();

  const syncPreviewModelColorOverride = () => {
    if (!previewManager) return;

    const enabled = modelColorEnabled?.checked === true;
    const selectedColor = getSelectedModelColor();

    if (enabled) {
      previewManager.setColorOverride(selectedColor);
      previewManager.setColorOverrideEnabled(true);
    } else {
      previewManager.setColorOverrideEnabled(false);
      previewManager.setColorOverride(selectedColor);
    }
  };

  if (modelColorEnabled) {
    modelColorEnabled.checked = savedColorEnabled;
    updatePickerDisabledState(savedColorEnabled);
    if (previewManager) {
      syncPreviewModelColorOverride();
    }

    modelColorEnabled.addEventListener('change', () => {
      const enabled = modelColorEnabled.checked;
      localStorage.setItem(STORAGE_KEY_MODEL_COLOR_ENABLED, String(enabled));
      updatePickerDisabledState(enabled);
      if (previewManager) {
        syncPreviewModelColorOverride();
      }
      console.log(
        `[App] Model color override ${enabled ? 'enabled' : 'disabled'}`
      );
    });
  }

  let colorChangeTimeout;

  if (modelColorPicker) {
    modelColorPicker.addEventListener('input', () => {
      const color = modelColorPicker.value;
      clearTimeout(colorChangeTimeout);

      colorChangeTimeout = setTimeout(() => {
        if (previewManager && modelColorEnabled?.checked) {
          previewManager.setColorOverride(color);
        }
        localStorage.setItem(STORAGE_KEY_MODEL_COLOR, color);
        console.log(`[App] Model color changed to ${color}`);
      }, 150);
    });
  }

  if (modelColorReset) {
    modelColorReset.addEventListener('click', () => {
      if (previewManager) {
        previewManager.setColorOverride(null);
      }
      if (modelColorPicker) {
        const themeDefault = getThemeDefaultColor();
        modelColorPicker.value = themeDefault;
      }
      localStorage.removeItem(STORAGE_KEY_MODEL_COLOR);
      console.log('[App] Model color reset to theme default');
    });
  }

  // --- Model Appearance Controls (Opacity, Brightness, Contrast) ---
  const modelOpacityInput = document.getElementById('modelOpacityInput');
  const modelOpacityValue = document.getElementById('modelOpacityValue');
  const brightnessInput = document.getElementById('brightnessInput');
  const brightnessValue = document.getElementById('brightnessValue');
  const contrastInput = document.getElementById('contrastInput');
  const contrastValue = document.getElementById('contrastValue');
  const resetAppearanceBtn = document.getElementById('resetAppearanceBtn');
  const modelAppearanceEnabled = document.getElementById(
    'modelAppearanceEnabled'
  );
  const modelAppearanceSlidersWrapper = document.querySelector(
    '.model-appearance-sliders'
  );

  // Restore persisted values
  const savedOpacity = localStorage.getItem(STORAGE_KEY_MODEL_OPACITY);
  const savedBrightness = localStorage.getItem(STORAGE_KEY_BRIGHTNESS);
  const savedContrast = localStorage.getItem(STORAGE_KEY_CONTRAST);
  const savedAppearanceEnabled =
    localStorage.getItem(STORAGE_KEY_MODEL_APPEARANCE_ENABLED) === 'true';
  if (savedOpacity && modelOpacityInput) {
    modelOpacityInput.value = savedOpacity;
    if (modelOpacityValue) modelOpacityValue.textContent = `${savedOpacity}%`;
  }
  if (savedBrightness && brightnessInput) {
    brightnessInput.value = savedBrightness;
    if (brightnessValue) brightnessValue.textContent = `${savedBrightness}%`;
  }
  if (savedContrast && contrastInput) {
    contrastInput.value = savedContrast;
    if (contrastValue) contrastValue.textContent = `${savedContrast}%`;
  }

  const updateAppearanceSlidersDisabledState = (enabled) => {
    if (modelAppearanceSlidersWrapper) {
      modelAppearanceSlidersWrapper.classList.toggle('disabled', !enabled);
    }
  };

  function applyAppearanceToPreview() {
    if (!previewManager) return;
    previewManager.setModelOpacity(
      parseInt(modelOpacityInput?.value || '100', 10)
    );
    previewManager.setBrightness(parseInt(brightnessInput?.value || '100', 10));
    previewManager.setContrast(parseInt(contrastInput?.value || '100', 10));
  }

  const syncPreviewAppearanceOverride = () => {
    if (!previewManager) return;

    const enabled = modelAppearanceEnabled?.checked === true;

    if (enabled) {
      applyAppearanceToPreview();
      previewManager.setAppearanceOverrideEnabled(true);
    } else {
      previewManager.setAppearanceOverrideEnabled(false);
    }
  };

  if (modelAppearanceEnabled) {
    modelAppearanceEnabled.checked = savedAppearanceEnabled;
    updateAppearanceSlidersDisabledState(savedAppearanceEnabled);

    modelAppearanceEnabled.addEventListener('change', () => {
      const enabled = modelAppearanceEnabled.checked;
      localStorage.setItem(
        STORAGE_KEY_MODEL_APPEARANCE_ENABLED,
        String(enabled)
      );
      updateAppearanceSlidersDisabledState(enabled);
      syncPreviewAppearanceOverride();
    });
  }

  if (modelOpacityInput) {
    modelOpacityInput.addEventListener('input', () => {
      const v = modelOpacityInput.value;
      if (modelOpacityValue) modelOpacityValue.textContent = `${v}%`;
      localStorage.setItem(STORAGE_KEY_MODEL_OPACITY, v);
      if (previewManager && modelAppearanceEnabled?.checked) {
        previewManager.setModelOpacity(parseInt(v, 10));
      }
    });
  }
  if (brightnessInput) {
    brightnessInput.addEventListener('input', () => {
      const v = brightnessInput.value;
      if (brightnessValue) brightnessValue.textContent = `${v}%`;
      localStorage.setItem(STORAGE_KEY_BRIGHTNESS, v);
      if (previewManager && modelAppearanceEnabled?.checked) {
        previewManager.setBrightness(parseInt(v, 10));
      }
    });
  }
  if (contrastInput) {
    contrastInput.addEventListener('input', () => {
      const v = contrastInput.value;
      if (contrastValue) contrastValue.textContent = `${v}%`;
      localStorage.setItem(STORAGE_KEY_CONTRAST, v);
      if (previewManager && modelAppearanceEnabled?.checked) {
        previewManager.setContrast(parseInt(v, 10));
      }
    });
  }
  if (resetAppearanceBtn) {
    resetAppearanceBtn.addEventListener('click', () => {
      if (modelOpacityInput) {
        modelOpacityInput.value = '100';
        if (modelOpacityValue) modelOpacityValue.textContent = '100%';
      }
      if (brightnessInput) {
        brightnessInput.value = '100';
        if (brightnessValue) brightnessValue.textContent = '100%';
      }
      if (contrastInput) {
        contrastInput.value = '100';
        if (contrastValue) contrastValue.textContent = '100%';
      }
      localStorage.removeItem(STORAGE_KEY_MODEL_OPACITY);
      localStorage.removeItem(STORAGE_KEY_BRIGHTNESS);
      localStorage.removeItem(STORAGE_KEY_CONTRAST);
      if (previewManager && modelAppearanceEnabled?.checked) {
        previewManager.resetAppearance();
      }
    });
  }

  /**
   * Get the theme default model color
   */
  function getThemeDefaultColor() {
    const root = document.documentElement;
    const uiVariant = root.getAttribute('data-ui-variant');
    const highContrast = themeManager.isHighContrastEnabled();

    // Check for mono variant first
    if (uiVariant === 'mono') {
      // Light theme = amber, dark theme = green
      return hfmCtrl.isLightThemeActive() ? '#ffb000' : '#00ff00';
    }

    const activeTheme = themeManager.getActiveTheme();
    const themeKey = highContrast ? `${activeTheme}-hc` : activeTheme;

    // Match PREVIEW_COLORS from preview.js
    const PREVIEW_COLORS = {
      light: 0x2196f3,
      dark: 0x4d9fff,
      'light-hc': 0x0052cc,
      'dark-hc': 0x66b3ff,
    };

    const colorHex = PREVIEW_COLORS[themeKey] || PREVIEW_COLORS.light;
    return '#' + colorHex.toString(16).padStart(6, '0');
  }

  /**
   * Update the dimensions display panel
   */
  function updateDimensionsDisplay() {
    if (!previewManager || !dimensionsDisplay) return;

    const dimensions = previewManager.calculateDimensions();

    if (dimensions && measurementsToggle?.checked) {
      // Show dimensions panel
      dimensionsDisplay.classList.remove('hidden');

      // Update values
      const dimXEl = document.getElementById('dimX');
      const dimYEl = document.getElementById('dimY');
      const dimZEl = document.getElementById('dimZ');
      const dimVolumeEl = document.getElementById('dimVolume');
      if (dimXEl) dimXEl.textContent = `${dimensions.x} mm`;
      if (dimYEl) dimYEl.textContent = `${dimensions.y} mm`;
      if (dimZEl) dimZEl.textContent = `${dimensions.z} mm`;
      if (dimVolumeEl)
        dimVolumeEl.textContent = `${dimensions.volume.toLocaleString()} mmÂ³`;
    } else {
      // Hide dimensions panel
      dimensionsDisplay.classList.add('hidden');
    }
  }

  /**
   * Simple hash function for parameter comparison
   */
  function hashParams(params) {
    return JSON.stringify(params);
  }

  /**
   * Update preview state UI indicator
   * @param {string} state - PREVIEW_STATE value
   * @param {Object} extra - Extra data (stats, etc.)
   */
  function updatePreviewStateUI(state, extra = {}) {
    // Update indicator badge
    previewStateIndicator.className = `preview-state-indicator state-${state}`;

    // Update indicator text
    const stateMessages = {
      [PREVIEW_STATE.IDLE]: 'No preview',
      [PREVIEW_STATE.CURRENT]: extra.cached
        ? 'âœ“ Preview (cached)'
        : 'âœ“ Preview ready',
      [PREVIEW_STATE.PENDING]: 'â³ Changes pending...',
      [PREVIEW_STATE.RENDERING]: 'âŸ³ Generating...',
      [PREVIEW_STATE.STALE]: 'âš  Preview outdated',
      [PREVIEW_STATE.ERROR]: 'âœ— Preview failed',
    };
    previewStateIndicator.textContent = stateMessages[state] || state;

    // Update preview container border state
    previewContainer.classList.remove(
      'preview-pending',
      'preview-stale',
      'preview-rendering',
      'preview-current',
      'preview-error'
    );
    previewContainer.classList.add(`preview-${state}`);

    // Show/hide rendering overlay
    if (state === PREVIEW_STATE.RENDERING) {
      renderingOverlay.classList.add('visible');
    } else {
      renderingOverlay.classList.remove('visible');
    }

    // Update stats if provided
    if (extra.stats && state === PREVIEW_STATE.CURRENT) {
      let previewPercentText = '';
      if (!extra.fullQuality && autoPreviewController) {
        const currentParams = stateManager.getState()?.parameters;
        const fullStats =
          autoPreviewController.getCurrentFullSTL(currentParams)?.stats;
        if (
          typeof fullStats?.triangles === 'number' &&
          fullStats.triangles > 0 &&
          typeof extra.stats.triangles === 'number'
        ) {
          const ratio = Math.max(
            0,
            Math.min(1, extra.stats.triangles / fullStats.triangles)
          );
          previewPercentText = ` (${Math.round(ratio * 100)}% of full)`;
        }
      }

      const qualityLabel = extra.fullQuality
        ? '<span class="stats-quality full">Full Quality</span>'
        : `<span class="stats-quality preview">Preview Quality${previewPercentText}</span>`;
      statsArea.innerHTML = `${qualityLabel} Size: ${formatFileSize(extra.stats.size)} | Triangles: ${extra.stats.triangles.toLocaleString()}`;

      // Also update the preview status bar stats with timing breakdown
      updatePreviewStats(
        extra.stats,
        extra.fullQuality,
        previewPercentText,
        extra.timing
      );
    }
  }

  /**
   * Format timing duration for display
   * @param {number} ms - Duration in milliseconds
   * @returns {string} Formatted duration string
   */
  function _formatTimingMs(ms) {
    if (typeof ms !== 'number' || ms <= 0) return '';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  /**
   * Update the preview status bar stats display
   * Simplified: only shows essential info (file size and triangle count)
   * @param {Object} stats - Stats object with size and triangles
   * @param {boolean} fullQuality - Whether this is full quality render
   * @param {string} percentText - Unused, kept for API compatibility
   * @param {Object} timing - Unused, kept for API compatibility
   */
  function updatePreviewStats(
    stats,
    _fullQuality = false,
    _percentText = '',
    _timing = null
  ) {
    if (!previewStatusStats || !previewStatusBar) return;

    if (!stats) {
      previewStatusStats.textContent = '';
      previewStatusBar.classList.add('no-stats');
      return;
    }

    // Simplified stats: just size and triangle count
    previewStatusStats.textContent = `${formatFileSize(stats.size)} | ${stats.triangles.toLocaleString()} triangles`;
    previewStatusBar.classList.remove('no-stats');
  }

  /**
   * Clear the preview status bar stats
   */
  function clearPreviewStats() {
    if (previewStatusStats) {
      previewStatusStats.textContent = '';
    }
    if (previewStatusBar) {
      previewStatusBar.classList.add('no-stats');
    }
  }

  /**
   * Initialize or reinitialize the AutoPreviewController
   * @param {boolean} deferIfNotReady - If true, will attempt to init WASM first if not ready
   */
  async function initAutoPreviewController(deferIfNotReady = false) {
    if (!renderController || !previewManager) {
      if (deferIfNotReady && previewManager) {
        // WASM not ready yet - try to initialize it first
        console.log('[AutoPreview] Deferring init until WASM is ready...');
        const wasmReady = await ensureWasmInitialized();
        if (!wasmReady || !renderController) {
          console.warn(
            '[AutoPreview] Cannot init - WASM initialization failed or was declined'
          );
          return;
        }
      } else {
        console.warn(
          '[AutoPreview] Cannot init - missing controller or preview manager'
        );
        return;
      }
    }

    autoPreviewController = new AutoPreviewController(
      renderController,
      previewManager,
      {
        // Lower debounce to reduce perceived "delay" after slider changes.
        // Scheduling logic in AutoPreviewController avoids overlapping renders.
        debounceMs: 350,
        maxCacheSize: 10,
        enabled: autoPreviewEnabled,
        pauseReason: autoPreviewUserEnabled ? null : 'user',
        pausedDebounceMs: 2000,
        previewQuality: previewQualityMode === 'auto' ? null : previewQuality,
        resolvePreviewQuality:
          previewQualityMode === 'auto' ? resolveAdaptiveQuality : null,
        resolvePreviewCacheKey:
          previewQualityMode === 'auto' ? resolveAdaptiveCacheKey : null,
        resolvePreviewParameters:
          previewQualityMode === 'auto' ? resolveAdaptiveParameters : null,
        onStateChange: (newState, prevState, extra) => {
          console.log(
            `[AutoPreview] State: ${prevState} -> ${newState}`,
            extra
          );
          if (newState === PREVIEW_STATE.CURRENT) {
            if (typeof extra?.renderDurationMs === 'number') {
              autoPreviewHints.lastPreviewDurationMs = extra.renderDurationMs;
              adaptivePreviewMemo = { key: null, info: null };
            }
            if (typeof extra?.stats?.triangles === 'number') {
              autoPreviewHints.lastPreviewTriangles = extra.stats.triangles;
              adaptivePreviewMemo = { key: null, info: null };
            }
            hfmCtrl.clearPersistence();
          }
          updatePreviewStateUI(newState, extra);
        },
        onPreviewReady: (stl, stats, cached) => {
          console.log('[AutoPreview] Preview ready, cached:', cached);
          // Update status to ready (use 'success' type to keep visible)
          updateStatus('Preview ready', 'success');
          // Update button state - preview available but may need full render for download
          updatePrimaryActionButton();
          // Update dimensions display
          updateDimensionsDisplay();
        },
        onProgress: (percent, message, type) => {
          // Simplified status: just show what's happening, no confusing percentages
          if (type === 'preview') {
            updateStatus('Rendering preview...');
          } else {
            // Get current output format from selector for correct progress text
            const outputFormatSelect = document.getElementById('outputFormat');
            const outputFormat = outputFormatSelect?.value || 'stl';
            const formatName =
              OUTPUT_FORMATS[outputFormat]?.name || outputFormat.toUpperCase();
            updateStatus(`Generating ${formatName}...`);
          }
        },
        onError: (error, type) => {
          if (type === 'preview') {
            console.error('[AutoPreview] Preview error:', error);
            // If the backend indicates a blocked/empty-geometry configuration,
            // guide the user to the required toggle instead of a generic failure.
            if (handleConfigDependencyError(error)) {
              return;
            }

            const friendly = translateError(error?.message || String(error));
            updateStatus(`Preview failed: ${friendly.title}`, 'error');
            _announceError(`Preview failed: ${friendly.title}`);
          }
        },
      }
    );

    console.log('[AutoPreview] Controller initialized');

    // Subscribe to library manager changes
    libraryManager.subscribe((action, libraryId) => {
      console.log(`[Library] ${action}: ${libraryId}`);
      // Update auto-preview controller with new library list
      if (autoPreviewController) {
        autoPreviewController.setEnabledLibraries(
          getEnabledLibrariesForRender()
        );
      }
    });
  }

  /**
   * Update the primary action button based on current state.
   * With auto-preview, the button has two states:
   * - "Download" when full-quality output is ready for current params
   * - "Generate" when no full render exists yet or params changed
   * Also shows/hides the fallback download link.
   */
  function updatePrimaryActionButton() {
    const state = stateManager.getState();
    const hasGeneratedFile = !!state.stl;
    const currentParamsHash = hashParams(state.parameters);
    const paramsChanged = currentParamsHash !== lastGeneratedParamsHash;
    const outputFormatSelect = document.getElementById('outputFormat');
    const selectedFormat = (
      outputFormatSelect?.value ||
      state.outputFormat ||
      'stl'
    ).toLowerCase();

    const formatName =
      OUTPUT_FORMATS[selectedFormat]?.name || selectedFormat.toUpperCase();
    const isStlFormat = selectedFormat === 'stl';

    // Check auto-preview controller state (works for any 3D format routed
    // through the controller; 2D formats bypass it)
    const hasFullQualitySTL = autoPreviewController?.getCurrentFullSTL(
      state.parameters
    );
    const needsFullRender =
      !hasFullQualitySTL ||
      autoPreviewController?.needsFullRender(state.parameters);

    const stateOutputFormat = (state.outputFormat || '').toLowerCase();
    const hasMatchingOutput =
      hasGeneratedFile &&
      stateOutputFormat === selectedFormat &&
      !paramsChanged;

    if (isStlFormat && hasFullQualitySTL && !needsFullRender) {
      primaryActionBtn.textContent = 'ðŸ“¥ Download';
      primaryActionBtn.dataset.action = 'download';
      primaryActionBtn.classList.remove('btn-primary');
      primaryActionBtn.classList.add('btn-success');
      primaryActionBtn.setAttribute(
        'aria-label',
        `Download generated ${formatName} file (full quality)`
      );
      downloadFallbackLink.classList.add('hidden');
    } else if (hasMatchingOutput) {
      primaryActionBtn.textContent = 'ðŸ“¥ Download';
      primaryActionBtn.dataset.action = 'download';
      primaryActionBtn.classList.remove('btn-primary');
      primaryActionBtn.classList.add('btn-success');
      primaryActionBtn.setAttribute(
        'aria-label',
        `Download generated ${formatName} file`
      );
      downloadFallbackLink.classList.add('hidden');
    } else {
      primaryActionBtn.textContent = 'Generate';
      primaryActionBtn.dataset.action = 'generate';
      primaryActionBtn.classList.remove('btn-success');
      primaryActionBtn.classList.add('btn-primary');
      primaryActionBtn.setAttribute(
        'aria-label',
        `Generate ${formatName} file from current parameters`
      );

      if (isStlFormat && hasGeneratedFile && paramsChanged) {
        downloadFallbackLink.classList.remove('hidden');
      } else {
        downloadFallbackLink.classList.add('hidden');
      }
    }
  }

  // Import shared validation schemas (FILE_SIZE_LIMITS is now imported at top of initApp() to avoid TDZ)
  ({ validateFileUpload } = await import('./js/validation-schemas.js'));

  // Initialize file handler controller (extracted from main.js)
  fileHandler = initFileHandler({
    getPreviewManager: () => previewManager,
    setPreviewManager: (pm) => { previewManager = pm; },
    getAutoPreviewController: () => autoPreviewController,
    getAutoPreviewEnabled: () => autoPreviewEnabled,
    setCurrentSavedProjectId: (id) => { currentSavedProjectId = id; },
    setPresetCompanionMap: (map) => { presetCompanionMap = map; },
    getFileSizeLimits: () => FILE_SIZE_LIMITS,
    getValidateFileUpload: () => validateFileUpload,
    getCameraPanelController: () => cameraPanelController,
    getOverlayGridCtrl: () => overlayGridCtrl,
    getCompanionFilesCtrl: () => companionFilesCtrl,
    getHfmCtrl: () => hfmCtrl,
    getSavedProjectsUI: () => savedProjectsUI,
    getFileActionsController: () => fileActionsController,
    getLibraryManager: () => libraryManager,
    getPreviewContainer: () => previewContainer,
    getPreviewStateIndicator: () => previewStateIndicator,
    getRenderingOverlay: () => renderingOverlay,
    updateStatus,
    updatePreviewDrawer,
    updatePrimaryActionButton,
    updateColorLegend: _updateColorLegend,
    updatePreviewStateUI,
    clearPresetSelection,
    forceClearPresetSelection,
    updatePresetDropdown,
    syncPreviewModelColorOverride,
    syncPreviewAppearanceOverride,
    initAutoPreviewController,
    setCanonicalProjectFiles,
    renderLibraryUI,
    getEnabledLibrariesForRender,
  });

  // Check for saved draft - but only if first-visit modal is not blocking
  // If first-visit is blocking, defer draft restoration until user accepts
  // IMPORTANT: Skip draft restoration if a manifest or project URL is specified --
  // the URL intent takes priority over any cached draft (fixes race condition)
  const hasManifestParam = urlParams.get('manifest');
  const hasProjectParam = urlParams.get('project') || urlParams.get('scad');
  const draft =
    !hasManifestParam && !hasProjectParam
      ? await stateManager.loadFromLocalStorage()
      : null;

  if (draft) {
    // If first-visit modal is blocking, defer draft restoration
    if (firstVisitBlocking) {
      console.log(
        'Draft found, but deferring until first-visit modal is dismissed'
      );
      pendingDraft = draft; // Will be restored in handleFirstVisitClose
    } else {
      const shouldRestore = confirm(
        `Found a saved draft of "${draft.fileName}" from ${new Date(draft.timestamp).toLocaleString()}.\n\nWould you like to restore it?`
      );

      if (shouldRestore) {
        console.log('Restoring draft...');
        // Treat draft as uploaded file
        fileHandler.handleFile(
          { name: draft.fileName },
          draft.fileContent,
          null,
          null,
          'saved'
        );
        updateStatus('Draft restored');
      } else {
        stateManager.clearLocalStorage();
      }
    }
  }

  /**
   * Load embedded model from scaffolded app HTML
   * Scaffolded apps embed the schema and scad source in script tags
   * @returns {boolean} True if embedded model was loaded
   */
  function loadEmbeddedModel() {
    const schemaEl = document.getElementById('param-schema');
    const scadEl = document.getElementById('scad-source');

    // Check if both elements exist and have content
    if (!schemaEl || !scadEl) {
      return false;
    }

    const schemaText = schemaEl.textContent?.trim();
    const scadContent = scadEl.textContent?.trim();

    if (!schemaText || !scadContent) {
      return false;
    }

    try {
      // Parse the embedded schema (it's JSON)
      const schema = JSON.parse(schemaText);

      // Validate basic schema structure
      if (!schema.properties || typeof schema.properties !== 'object') {
        console.warn(
          '[Embedded] Invalid schema structure, falling back to file upload'
        );
        return false;
      }

      // Derive filename from schema or default
      const fileName =
        (schema.title || 'embedded-model')
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '_') + '.scad';

      console.log(`[Embedded] Loading embedded model: ${fileName}`);
      console.log(
        `[Embedded] Found ${Object.keys(schema.properties).length} parameters`
      );

      // Process the embedded content using handleFile
      fileHandler.handleFile({ name: fileName }, scadContent, null, null, 'example');

      return true;
    } catch (e) {
      console.warn('[Embedded] Failed to load embedded model:', e.message);
      return false;
    }
  }

  // Try to load embedded model (for scaffolded apps)
  // Only attempt if no draft was restored
  if (!draft || !stateManager.getState()?.uploadedFile) {
    const embeddedLoaded = loadEmbeddedModel();
    if (embeddedLoaded) {
      console.log('[App] Loaded embedded model from scaffolded app');
    }
  }

  /**
   * Log render performance metrics to console
   * @param {Object} result - Render result with timing, stats, and data
   */
  function logRenderPerformance(result) {
    if (!result) return;

    const timing = result.timing || {};
    const stats = result.stats || {};
    const capabilities = renderController?.getCapabilities() || {};

    // Calculate bytes per triangle (indicator of ASCII vs Binary)
    const dataSize = result.data?.byteLength || result.stl?.byteLength || 0;
    const bytesPerTri =
      stats.triangles > 0 ? Math.round(dataSize / stats.triangles) : 0;

    const isLikelyBinary = bytesPerTri > 0 && bytesPerTri < 80;
    const isLikelyASCII = bytesPerTri > 100;

    // Detect SVG/DXF by inspecting the first bytes of the output buffer
    let detectedFormat = null;
    const rawData = result.data || result.stl;
    if (rawData && rawData.byteLength > 0) {
      const header = new Uint8Array(
        rawData,
        0,
        Math.min(16, rawData.byteLength)
      );
      const prefix = String.fromCharCode(...header).toLowerCase();
      if (prefix.startsWith('<?xml') || prefix.startsWith('<svg')) {
        detectedFormat = 'SVG';
      } else if (
        prefix.startsWith('0\nsection') ||
        prefix.startsWith('0\r\nsection')
      ) {
        detectedFormat = 'DXF';
      }
    }

    const formatLabel = detectedFormat
      ? detectedFormat
      : isLikelyBinary
        ? 'Binary STL âœ“'
        : isLikelyASCII
          ? 'ASCII STL âš ï¸'
          : 'Unknown';

    console.log(
      `[Render Stats] ` +
        `Time: ${timing.renderMs || 0}ms | ` +
        `Triangles: ${stats.triangles?.toLocaleString() || 0} | ` +
        `Size: ${(dataSize / 1024).toFixed(1)}KB | ` +
        `Format: ${formatLabel}`
    );

    // Warn if ASCII STL detected
    if (isLikelyASCII && stats.triangles > 1000) {
      console.warn(
        '[Performance Warning] ASCII STL detected! ' +
          'Add --export-format=binstl for ~18x faster exports.'
      );
    }

    // Log Manifold status for slow renders
    if (!capabilities.hasManifold && timing.renderMs > 5000) {
      console.warn(
        `[Performance Warning] Render took ${timing.renderMs}ms without Manifold. ` +
          'With Manifold enabled, complex models can be 5-30x faster.'
      );
    }

    // Log overall performance status
    if (isLikelyBinary && capabilities.hasManifold) {
      console.log(
        '[Performance] âœ“ Optimal settings: Binary STL + Manifold enabled'
      );
    } else if (!isLikelyBinary || !capabilities.hasManifold) {
      const issues = [];
      if (!isLikelyBinary) issues.push('Binary STL not active');
      if (!capabilities.hasManifold) issues.push('Manifold not available');
      console.log(`[Performance] âš ï¸ Suboptimal settings: ${issues.join(', ')}`);
    }
  }

  let _activeColorParamNames = [];

  function _updateColorLegend(colorNames) {
    if (colorNames !== undefined) _activeColorParamNames = colorNames || [];
    if (!previewManager) return;
    if (_activeColorParamNames.length < 2) {
      previewManager.hideColorLegend();
      return;
    }
    const state = stateManager.getState();
    const params = state?.parameters || {};
    const entries = _activeColorParamNames.map((name) => ({
      name,
      value: normalizeHexColor(params[name]) || '#888888',
    }));
    previewManager.showColorLegend(entries);
  }

  // Update status
  function updateStatus(message, statusType = 'default') {
    // Update the drawer status area (hidden but kept for screen readers)
    if (statusArea) {
      statusArea.textContent = message;

      // Add/remove idle class
      if (message === 'Ready' || message === '') {
        statusArea.classList.add('idle');
      } else {
        statusArea.classList.remove('idle');
      }
    }

    // Update the preview status bar overlay
    if (previewStatusBar && previewStatusText) {
      previewStatusText.textContent = message;

      // Reset all state classes
      previewStatusBar.classList.remove(
        'idle',
        'processing',
        'success',
        'error'
      );

      // Determine state class based on message content or explicit type
      const isIdle = message === 'Ready' || message === '';
      const isProcessing =
        /processing|generating|rendering|loading|compiling|\d+%/i.test(message);
      const isError =
        /error|failed|invalid/i.test(message) || statusType === 'error';
      const isSuccess =
        (/complete|success|ready|generated/i.test(message) && !isIdle) ||
        statusType === 'success';

      if (isIdle) {
        previewStatusBar.classList.add('idle');
      } else if (isError) {
        previewStatusBar.classList.add('error');
      } else if (isProcessing) {
        previewStatusBar.classList.add('processing');
      } else if (isSuccess) {
        previewStatusBar.classList.add('success');
      }
    }

    // Announce status changes via dedicated SR live region.
    // Debounce progress-style updates (percent text) to avoid announcement spam.
    const shouldDebounce = /\d+%/.test(message);
    stateManager.announceChange(message, shouldDebounce);
  }

  /**
   * Announce message to screen readers (for Welcome screen example loading, etc.)
   * @param {string} message - Message to announce
   */
  function announceToScreenReader(message) {
    stateManager.announceChange(message);
  }

  // Companion file functions (detectIncludeUse, detectRequiredCompanionFiles,
  // autoSaveCompanionFiles, updateCompanionSaveButton, renderProjectFilesList,
  // syncOverlayWithScreenshotParam, autoSelectOverlaySource, getFileIcon,
  // handleProjectFileAction, handleAddCompanionFile, removeProjectFile,
  // editProjectFile, applyTextFileEditorChanges, updateProjectFilesUI)
  // moved to companion-files-controller.js

  // showProcessingOverlay moved to file-handler.js

  // handleFile moved to file-handler.js

  // File input change
  fileInput.addEventListener('change', (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;
    fileHandler.handleFile(selectedFile);
    // Allow re-selecting the same file if needed
    e.target.value = '';
  });

  // Companion file input (Project Files Manager)
  const addCompanionFileInput = document.getElementById(
    'addCompanionFileInput'
  );
  if (addCompanionFileInput) {
    addCompanionFileInput.addEventListener('change', async (e) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      for (const file of files) {
        await companionFilesCtrl.handleAddCompanionFile(file);
      }

      // Reset input for potential re-selection
      e.target.value = '';
    });
  }

  // Missing files warning button: direct action to add missing dependency files
  // Provides a direct action to add missing dependency files
  const addMissingFilesBtn = document.getElementById('addMissingFilesBtn');
  if (addMissingFilesBtn) {
    addMissingFilesBtn.addEventListener('click', () => {
      // Trigger the companion file input
      if (addCompanionFileInput) {
        addCompanionFileInput.click();
      }
    });
  }

  // Companion files Save/Update Project button
  const companionSaveBtn = document.getElementById('companionSaveBtn');
  if (companionSaveBtn) {
    companionSaveBtn.addEventListener('click', async () => {
      if (currentSavedProjectId) {
        // Update existing saved project
        await companionFilesCtrl.autoSaveCompanionFiles();
      } else {
        // Route to save prompt for new projects
        const state = stateManager.getState();
        if (state.uploadedFile) {
          await savedProjectsUI.showSaveProjectPrompt(state);
        }
      }
    });
  }

  // Text File Editor Modal handlers
  const textFileEditorModal = document.getElementById('textFileEditorModal');
  const textFileEditorApply = document.getElementById('textFileEditorApply');
  const textFileEditorCancel = document.getElementById('textFileEditorCancel');
  const textFileEditorClose = document.getElementById('textFileEditorClose');
  const textFileEditorOverlay = document.getElementById(
    'textFileEditorOverlay'
  );

  if (textFileEditorApply) {
    textFileEditorApply.addEventListener('click', () => companionFilesCtrl.applyTextFileEditorChanges());
  }

  // Ctrl+S / Cmd+S keyboard shortcut to save and apply changes
  const textFileEditorContent = document.getElementById(
    'textFileEditorContent'
  );
  if (textFileEditorContent && textFileEditorModal) {
    textFileEditorContent.addEventListener('keydown', (e) => {
      // Ctrl+S or Cmd+S to save and apply
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        companionFilesCtrl.applyTextFileEditorChanges();
      }
      // Escape to cancel
      if (e.key === 'Escape') {
        e.preventDefault();
        closeModal(textFileEditorModal);
      }
    });
  }

  if (textFileEditorCancel && textFileEditorModal) {
    textFileEditorCancel.addEventListener('click', () =>
      closeModal(textFileEditorModal)
    );
  }

  if (textFileEditorClose && textFileEditorModal) {
    textFileEditorClose.addEventListener('click', () =>
      closeModal(textFileEditorModal)
    );
  }

  if (textFileEditorOverlay && textFileEditorModal) {
    textFileEditorOverlay.addEventListener('click', () =>
      closeModal(textFileEditorModal)
    );
  }

  // Back button - returns to welcome screen
  if (clearFileBtn) {
    clearFileBtn.addEventListener('click', async () => {
      // Confirm before going back - warn about unsaved changes
      if (
        confirm(
          'Go back to the welcome screen?\n\nAny unsaved changes to your current project will be lost.'
        )
      ) {
        // Reset file input
        fileInput.value = '';

        // Clear state (including preset selection so it doesn't survive reload)
        stateManager.setState({
          uploadedFile: null,
          projectFiles: null,
          mainFilePath: null,
          schema: null,
          parameters: {},
          defaults: {},
          stl: null,
          outputFormat: 'stl',
          stlStats: null,
          detectedLibraries: [],
          currentPresetId: null,
          currentPresetName: null,
        });

        // Sync the dropdown element and fire change so the format info panel,
        // 2D guidance, and button labels all reset to their STL defaults.
        if (outputFormatSelect) {
          outputFormatSelect.value = 'stl';
          outputFormatSelect.dispatchEvent(new Event('change'));
        }

        // Clear history
        stateManager.clearHistory();

        // Hide main interface, show welcome screen
        mainInterface.classList.add('hidden');
        welcomeScreen.classList.remove('hidden');
        updateStorageDisplay();

        // Refresh saved projects list when returning to welcome screen
        await savedProjectsUI.renderSavedProjectsList();

        // Reset workflow step state, then re-apply slot visibility.
        // applyToolbarModeVisibility sees mainInterface.hidden=true and hides both
        // the toolbar and the workflow progress (welcome-screen branch).
        applyToolbarModeVisibility(getUIModeController().getMode());

        // Exit focus mode if active
        const focusModeBtn = document.getElementById('focusModeBtn');
        if (
          focusModeBtn &&
          mainInterface &&
          mainInterface.classList.contains('focus-mode')
        ) {
          mainInterface.classList.remove('focus-mode');
          focusModeBtn.setAttribute('aria-pressed', 'false');
        }

        // Close Features Guide modal if open
        const featuresGuideModal =
          document.getElementById('featuresGuideModal');
        if (
          featuresGuideModal &&
          !featuresGuideModal.classList.contains('hidden')
        ) {
          closeFeaturesGuide();
        }

        // Clear preview and remove any loaded overlay from the previous project
        if (previewManager) {
          previewManager.clear();
          previewManager.setReferenceOverlaySource({
            kind: null,
            name: null,
            dataUrlOrText: null,
          });
          previewManager.setOverlayEnabled(false);
        }

        // Reset overlay UI controls so the previous project's state doesn't linger
        if (overlayToggle) overlayToggle.checked = false;
        if (overlaySourceSelect) overlaySourceSelect.value = '';
        overlayGridCtrl.updateOverlaySourceDropdown();
        overlayGridCtrl.updateOverlayStatus();

        // Reset echo drawer so stale warnings don't persist into the
        // next project load (prevents layout shift from expanded drawer).
        updatePreviewDrawer([]);
        if (typeof window.clearConsoleState === 'function') {
          window.clearConsoleState();
        }

        // Reset status
        updateStatus('Ready');
        statsArea.textContent = '';
        clearPreviewStats();

        // Remove compact header
        const appHeader = document.querySelector('.app-header');
        if (appHeader) {
          appHeader.classList.remove('compact');
        }

        console.log('[App] File cleared, returned to welcome screen');
      }
    });
  }

  // Drag and drop
  uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('drag-over');
  });

  uploadZone.addEventListener('dragleave', () => {
    uploadZone.classList.remove('drag-over');
  });

  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('drag-over');
    fileHandler.handleFile(e.dataTransfer.files[0]);
  });

  // Click to upload is handled by the label wrapping the input.

  // Keyboard support for upload zone
  uploadZone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput.click();
    }
  });

  // ========== START NEW PROJECT ==========
  // Stakeholder feedback: Users want a way to start a new project from scratch
  const startNewProjectBtn = document.getElementById('startNewProjectBtn');
  if (startNewProjectBtn) {
    startNewProjectBtn.addEventListener('click', async () => {
      // Create a starter template
      const starterTemplate = `// New OpenSCAD Project
// Created with OpenSCAD Assistive Forge
// https://github.com/BrennenJohnston/openscad-assistive-forge

/* [Basic Settings] */
// Width of the object
width = 50; // [10:200]

// Height of the object
height = 30; // [10:200]

// Depth of the object
depth = 20; // [10:200]

/* [Advanced] */
// Enable rounded corners
rounded = true;

// Corner radius (when rounded is enabled)
corner_radius = 5; // [1:20]

// Main shape
if (rounded) {
    minkowski() {
        cube([width - corner_radius*2, depth - corner_radius*2, height - corner_radius*2]);
        sphere(r = corner_radius, $fn = 32);
    }
} else {
    cube([width, depth, height]);
}
`;

      try {
        const fileName = 'new_project.scad';
        // Process it like a regular file upload, but pass content directly.
        // `handleFile()` uses FileReader for `File`/Blob inputs; passing a plain object
        // without content will throw. This path intentionally avoids FileReader.
        await fileHandler.handleFile(
          { name: fileName },
          starterTemplate,
          null,
          null,
          'user',
          fileName
        );

        // Announce to screen readers
        announceImmediate(
          'New project created. You can customize the parameters or edit the code.'
        );

        console.log('[App] New project created from template');
      } catch (error) {
        console.error('[App] Failed to create new project:', error);
        updateStatus('Failed to create new project', 'error');
      }
    });
  }

  // loadExampleByKey moved to file-handler.js

  // Load examples - unified handler
  // IMPORTANT: Keep this as the single click handler for all example buttons.
  // Having multiple click handlers (e.g. role-specific + unified) causes duplicate example loads,
  // which can interrupt auto-preview and leave the preview in a pending/blank state.
  // NOTE: Exclude Features Guide example buttons (`data-feature-example`) because the
  // Features Guide has its own click handler that loads examples and closes the modal.
  // If we attach here too, the same example loads twice and can interrupt preview.
  const exampleButtons = document.querySelectorAll(
    '[data-example]:not([data-feature-example])'
  );
  exampleButtons.forEach((button) => {
    button.addEventListener('click', async () => {
      const exampleType = button.dataset.example;
      const tutorialId = button.dataset.tutorial;

      // Load the example first
      await fileHandler.loadExampleByKey(exampleType);

      if (exampleType) {
        // Screen reader confirmation that an example was loaded
        announceToScreenReader(
          `${EXAMPLE_DEFINITIONS[exampleType]?.name || 'Example'} loaded and ready to customize`
        );
      }

      // Launch tutorial if specified (after a short delay to let example load)
      if (tutorialId) {
        setTimeout(() => {
          startTutorial(tutorialId, { triggerEl: button });
        }, 500);
      }
    });
  });

  // =========================================
  // Deep-linking: URL parameter support for external website integration
  // Allows external sites to link directly to Forge with a specific example loaded
  // Usage: ?example=simple-box or ?load=colored-box
  // Note: ?load= is an alias for ?example= (for website embedding convenience)
  // =========================================
  const initUrlParams = new URLSearchParams(window.location.search);
  // Support both ?example= and ?load= (alias for website embedding)
  const exampleParam =
    initUrlParams.get('example') || initUrlParams.get('load');

  if (exampleParam) {
    console.log(`[DeepLink] Loading example from URL: ${exampleParam}`);

    // Check if example exists
    if (EXAMPLE_DEFINITIONS[exampleParam]) {
      // Load the example after a short delay to ensure UI is ready
      setTimeout(async () => {
        try {
          await fileHandler.loadExampleByKey(exampleParam);

          // Clean up URL to avoid reloading on refresh
          initUrlParams.delete('example');
          initUrlParams.delete('load'); // Also remove ?load= alias
          const cleanUrl = initUrlParams.toString()
            ? `${window.location.pathname}?${initUrlParams}`
            : window.location.pathname;
          history.replaceState(null, '', cleanUrl);

          console.log(`[DeepLink] Successfully loaded: ${exampleParam}`);
          announceImmediate(
            `${EXAMPLE_DEFINITIONS[exampleParam]?.name || 'Example'} loaded from URL link`
          );
        } catch (error) {
          console.error('[DeepLink] Failed to load example:', error);
          updateStatus(`Failed to load example: ${exampleParam}`);
        }
      }, 500);
    } else {
      console.warn(`[DeepLink] Unknown example: ${exampleParam}`);
      console.log(
        '[DeepLink] Available examples:',
        Object.keys(EXAMPLE_DEFINITIONS)
      );
      updateStatus(`Unknown example: ${exampleParam}`);
    }
  }

  // --- Manifest info banner helpers ---
  function showManifestInfoBanner(name, author) {
    const banner = document.getElementById('manifestInfoBanner');
    const text = document.getElementById('manifestInfoText');
    if (!banner) return;
    const parts = ['Shared project'];
    if (name) parts[0] = `Shared project: <strong>${name}</strong>`;
    if (author) parts.push(`by ${author}`);
    if (text) text.innerHTML = parts.join(' ');
    const saveBtn = document.getElementById('manifestSaveCopyBtn');
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save My Copy';
    }
    banner.classList.remove('hidden');
  }

  /**
   * Show an inline overwrite confirmation when saving a manifest copy
   * that conflicts with an existing project name.
   * Returns a Promise resolving to 'overwrite', 'new-copy', or 'cancel'.
   */
  function showManifestOverwriteConfirm(projectName) {
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'preset-modal';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-labelledby', 'manifestOverwriteTitle');
      modal.setAttribute('aria-modal', 'true');

      modal.innerHTML = `
        <div class="preset-modal-content">
          <div class="preset-modal-header">
            <h3 id="manifestOverwriteTitle" class="preset-modal-title">Project Already Exists</h3>
            <button class="preset-modal-close" aria-label="Close dialog">&times;</button>
          </div>
          <div class="modal-body">
            <div style="margin-top: var(--space-md); padding: var(--space-sm) var(--space-md); border-radius: var(--radius-sm); background: color-mix(in srgb, var(--color-warning, #f59e0b) 15%, transparent); border: 1px solid var(--color-warning, #f59e0b);">
              <p style="margin: 0 0 var(--space-sm); font-weight: 600; color: var(--color-text-primary);">
                &#9888; A project named &ldquo;${escapeHtml(projectName)}&rdquo; already exists.
              </p>
              <p style="margin: 0; color: var(--color-text-secondary); font-size: var(--text-sm);">
                Do you want to overwrite it, or save this as a new copy?
              </p>
            </div>
          </div>
          <div class="preset-modal-footer">
            <button class="btn btn-secondary" id="manifestOverwriteCancel">Cancel</button>
            <button class="btn btn-secondary" id="manifestOverwriteNewCopy">Save as New Copy</button>
            <button class="btn btn-danger" id="manifestOverwriteReplace">Overwrite Existing</button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      const cleanup = (result) => {
        closeModal(modal);
        modal.remove();
        resolve(result);
      };

      modal
        .querySelector('.preset-modal-close')
        .addEventListener('click', () => cleanup('cancel'));
      modal
        .querySelector('#manifestOverwriteCancel')
        .addEventListener('click', () => cleanup('cancel'));
      modal
        .querySelector('#manifestOverwriteNewCopy')
        .addEventListener('click', () => cleanup('new-copy'));
      modal
        .querySelector('#manifestOverwriteReplace')
        .addEventListener('click', () => cleanup('overwrite'));

      modal.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          cleanup('cancel');
        }
      });

      openModal(modal);
    });
  }

  /**
   * Show the manifest save-copy modal after a shared project loads.
   * Returns a Promise that resolves to 'save' or 'skip'.
   *
   * If the first-visit modal is still blocking, this function polls until
   * it closes before showing the save-copy modal. In the normal manifest
   * deep-link flow this should never happen because step 1 of the lifecycle
   * already awaits waitForFirstVisitAcceptance(), but the guard is kept as
   * a defensive fallback for any future code paths that call this directly.
   */
  function showManifestSaveCopyModal(projectName, author) {
    return new Promise((resolve) => {
      const doShow = () => {
        const modal = document.getElementById('manifest-save-copy-modal');
        if (!modal) {
          resolve('skip');
          return;
        }

        const nameEl = document.getElementById('manifestSaveCopyProjectName');
        const authorLine = document.getElementById(
          'manifestSaveCopyAuthorLine'
        );
        const authorEl = document.getElementById('manifestSaveCopyAuthor');
        const saveBtn = document.getElementById('manifestSaveCopySave');
        const skipBtn = document.getElementById('manifestSaveCopySkip');

        if (nameEl) nameEl.textContent = projectName || 'Untitled Project';
        if (author && authorEl && authorLine) {
          authorEl.textContent = author;
          authorLine.style.display = '';
        }

        const cleanup = (result) => {
          closeModal(modal);
          resolve(result);
        };

        saveBtn.addEventListener('click', () => cleanup('save'), {
          once: true,
        });
        skipBtn.addEventListener('click', () => cleanup('skip'), {
          once: true,
        });

        modal.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            cleanup('skip');
          }
        });

        openModal(modal, { focusTarget: saveBtn });
      };

      if (firstVisitBlocking) {
        const waitForFirstVisit = setInterval(() => {
          if (!firstVisitBlocking) {
            clearInterval(waitForFirstVisit);
            setTimeout(doShow, 300);
          }
        }, 200);
      } else {
        doShow();
      }
    });
  }

  // Wire manifest banner buttons
  const manifestBanner = document.getElementById('manifestInfoBanner');
  const manifestSaveCopyBtn = document.getElementById('manifestSaveCopyBtn');
  const manifestResetBtn = document.getElementById('manifestResetBtn');
  const manifestDismissBanner = document.getElementById(
    'manifestDismissBanner'
  );

  if (manifestDismissBanner) {
    manifestDismissBanner.addEventListener('click', () => {
      if (manifestBanner) manifestBanner.classList.add('hidden');
    });
  }

  if (manifestSaveCopyBtn) {
    manifestSaveCopyBtn.addEventListener('click', async () => {
      const state = stateManager.getState();
      if (!state.uploadedFile) return;

      if (manifestSaveCopyBtn.disabled) return;
      manifestSaveCopyBtn.disabled = true;

      const origin = state.manifestOrigin;
      const projectName = state.uploadedFile.name.replace('.scad', '');
      const forkedFrom = origin
        ? {
            manifestUrl: origin.url,
            originalName: origin.name,
            originalAuthor: origin.author,
            forkDate: Date.now(),
          }
        : null;
      try {
        const { saveProject, listSavedProjects, updateProject } =
          await import('./js/saved-projects-manager.js');
        const projectFilesObj =
          state.projectFiles instanceof Map
            ? Object.fromEntries(state.projectFiles)
            : state.projectFiles || null;

        const existingProjects = await listSavedProjects();
        const duplicate = existingProjects.find((p) => p.name === projectName);

        if (duplicate) {
          const overwrite = await showManifestOverwriteConfirm(projectName);
          if (overwrite === 'cancel') {
            manifestSaveCopyBtn.disabled = false;
            return;
          }
          if (overwrite === 'overwrite') {
            const result = await updateProject({
              id: duplicate.id,
              content: state.uploadedFile.content,
              projectFiles:
                projectFilesObj !== null
                  ? JSON.stringify(projectFilesObj)
                  : undefined,
            });
            if (result.success) {
              currentSavedProjectId = duplicate.id;
            } else {
              updateStatus(`Save failed: ${result.error}`, 'error');
              manifestSaveCopyBtn.disabled = false;
              return;
            }
          } else {
            const result = await saveProject({
              name: projectName,
              originalName: state.uploadedFile.name,
              kind: state.projectFiles ? 'zip' : 'scad',
              mainFilePath: state.mainFilePath || state.uploadedFile.name,
              content: state.uploadedFile.content,
              projectFiles: projectFilesObj,
              forkedFrom,
            });
            if (result.success) {
              currentSavedProjectId = result.id;
            } else {
              updateStatus(`Save failed: ${result.error}`, 'error');
              manifestSaveCopyBtn.disabled = false;
              return;
            }
          }
        } else {
          const result = await saveProject({
            name: projectName,
            originalName: state.uploadedFile.name,
            kind: state.projectFiles ? 'zip' : 'scad',
            mainFilePath: state.mainFilePath || state.uploadedFile.name,
            content: state.uploadedFile.content,
            projectFiles: projectFilesObj,
            forkedFrom,
          });
          if (result.success) {
            currentSavedProjectId = result.id;
          } else {
            updateStatus(`Save failed: ${result.error}`, 'error');
            manifestSaveCopyBtn.disabled = false;
            return;
          }
        }

        manifestSaveCopyBtn.textContent = 'Saved!';
        updateStatus('Local copy saved');
        announceImmediate('Local copy saved to browser storage');
        await savedProjectsUI.renderSavedProjectsList();

        if (manifestBanner) manifestBanner.classList.add('hidden');
      } catch (err) {
        console.error('[Manifest] Save copy failed:', err);
        updateStatus('Failed to save local copy', 'error');
        manifestSaveCopyBtn.disabled = false;
      }
    });
  }

  if (manifestResetBtn) {
    manifestResetBtn.addEventListener('click', async () => {
      const origin = stateManager.getState().manifestOrigin;
      if (!origin?.url) return;
      const confirmed = confirm(
        'Reset to the original shared project? Your unsaved changes will be lost.'
      );
      if (!confirmed) return;
      try {
        updateStatus('Reloading original project...');
        const result = await loadManifest(origin.url, {
          onProgress: ({ message }) => updateStatus(message),
        });
        await fileHandler.handleFile(
          null,
          result.mainContent,
          result.projectFiles,
          result.mainFile,
          'manifest',
          result.manifest.name
        );
        stateManager.setState({
          manifestOrigin: { ...origin, loadedAt: Date.now() },
        });
        updateStatus(`Reset to original: ${origin.name || 'project'}`);
      } catch (err) {
        console.error('[Manifest] Reset failed:', err);
        updateStatus('Failed to reload original project', 'error');
      }
    });
  }

  // =========================================
  // Manifest deep-link: ?manifest=<url> support
  // Loads a full project from a forge-manifest.json hosted externally.
  // This is the primary "one-link sharing" path for external project authors
  // Usage: ?manifest=https://raw.githubusercontent.com/user/repo/main/forge-manifest.json
  // Optional companions: ?preset=<name>, ?skipWelcome=true
  // =========================================
  const manifestParam = initUrlParams.get('manifest');

  if (manifestParam && !exampleParam) {
    console.log(`[DeepLink] Loading project from manifest: ${manifestParam}`);
    updateStatus('Loading project from manifest...');

    // Skip the welcome screen immediately when loading from a manifest
    const shouldSkipWelcome =
      initUrlParams.get('skipWelcome') === 'true' ||
      initUrlParams.get('skipwelcome') === 'true';

    if (shouldSkipWelcome || manifestParam) {
      // Hide welcome screen early so the user sees a loading state, not the landing page
      welcomeScreen.classList.add('hidden');
      mainInterface.classList.remove('hidden');
    }

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // MANIFEST DEEP-LINK LIFECYCLE â€” ORDER OF OPERATIONS
    //
    // The steps below MUST execute in this exact order. Reordering them
    // causes hard-to-diagnose bugs (e.g. the processing overlay covering
    // the first-visit modal, trapping the user in an infinite spinner).
    //
    //  1. GATE: Wait for first-visit acceptance (if needed).
    //     The first-visit modal (z-index 1000) must be resolved before
    //     anything else. No overlay or download may start while it is open.
    //
    //  2. OVERLAY: Show the processing overlay (z-index 10000).
    //     Only shown AFTER the first-visit gate clears. This prevents the
    //     overlay from stacking on top of the first-visit modal and making
    //     the "Download & Continue" button unreachable.
    //
    //  3. DOWNLOAD: Fetch manifest and project files via loadManifest().
    //     Progress messages update both the status bar and the overlay.
    //
    //  4. PROCESS: Call handleFile() to parse and load the project.
    //
    //  5. DISMISS OVERLAY: Remove the processing overlay so the editor
    //     is visible before the save-copy modal appears.
    //
    //  6. SAVE-COPY MODAL: Prompt the user to save a local copy.
    //     This modal has its own first-visit guard, but by this point
    //     the gate has already been cleared in step 1.
    //
    // ERROR PATH: If any step after the overlay is shown throws, the
    // catch block dismisses the overlay to prevent it from getting stuck.
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    setTimeout(async () => {
      let dismissOverlay = null;
      try {
        // Step 1 â€” GATE: first-visit acceptance must complete before we
        // show any overlay or start any network requests. The first-visit
        // modal sits at z-index 1000; the processing overlay at z-index
        // 10000. Showing the overlay first would bury the modal and trap
        // the user in an infinite spinner.
        if (firstVisitBlocking || !hasUserAcceptedDownload) {
          updateStatus('Waiting for download acceptance...');
          await waitForFirstVisitAcceptance();
        }

        // Step 2 â€” OVERLAY: safe to show now that no blocking modal is open
        dismissOverlay = showProcessingOverlay(
          'Loading project from manifest...',
          {
            hint: 'Downloading project files. Please do not close or refresh the page.',
          }
        );

        // Step 3 â€” DOWNLOAD
        const result = await loadManifest(manifestParam, {
          onProgress: ({ message }) => {
            updateStatus(message);
            const msgEl = document.querySelector(
              '#processingOverlay .processing-message'
            );
            if (msgEl) msgEl.textContent = message;
          },
        });

        const { projectFiles, mainFile, mainContent, manifest, defaults } =
          result;
        const projectName = manifest.name || mainFile;

        console.log(
          `[DeepLink] Manifest loaded: "${projectName}" (${projectFiles.size} files)`
        );
        announceImmediate(`Loading project: ${projectName}`);

        // Step 4 â€” PROCESS: parse and load the project into the editor
        await fileHandler.handleFile(
          null,
          mainContent,
          projectFiles,
          mainFile,
          'manifest',
          projectName
        );

        // Step 5 â€” DISMISS OVERLAY before showing the save-copy modal
        if (dismissOverlay) dismissOverlay();

        // Store manifest origin in state for provenance tracking
        stateManager.setState({
          manifestOrigin: {
            url: manifestParam,
            name: manifest.name || null,
            author: manifest.author || null,
            loadedAt: Date.now(),
          },
        });

        // Show the manifest info banner
        showManifestInfoBanner(manifest.name, manifest.author);

        // --- ?uiMode= or manifest defaults.uiMode / defaults.hiddenPanels ---
        const manifestUiMode = initUrlParams.get('uiMode') || defaults?.uiMode;
        const manifestHiddenPanels = defaults?.hiddenPanels;
        if (manifestUiMode || manifestHiddenPanels) {
          getUIModeController().importPreferences({
            defaultMode: manifestUiMode || undefined,
            hiddenPanelsInBasic: manifestHiddenPanels || undefined,
          });
          console.log(`[DeepLink] Applied UI preferences from manifest:`, {
            manifestUiMode,
            manifestHiddenPanels,
          });
        }

        // --- ?preset=<name> or manifest defaults.preset -----------------
        const presetName = initUrlParams.get('preset') || defaults?.preset;
        if (presetName) {
          // After handleFile, presets have been auto-imported from JSON files.
          // Find the matching preset by name and programmatically select it.
          const state = stateManager.getState();
          const modelName = state.uploadedFile?.name;
          if (modelName) {
            const presets = presetManager.getPresetsForModel(modelName);
            const match = presets.find(
              (p) => p.name.toLowerCase() === presetName.toLowerCase()
            );
            if (match) {
              console.log(
                `[DeepLink] Applying preset: "${match.name}" (${match.id})`
              );

              // Merge preset parameters onto current state (desktop OpenSCAD parity)
              const mergedParams = { ...state.parameters, ...match.parameters };
              stateManager.setState({ parameters: mergedParams });

              // Re-render UI with preset values
              const parametersContainer = document.getElementById(
                'parametersContainer'
              );
              renderParameterUI(
                state.schema,
                parametersContainer,
                (values) => {
                  stateManager.setState({ parameters: values });
                  if (autoPreviewController) {
                    autoPreviewController.onParameterChange(values);
                  }
                  updatePrimaryActionButton();
                },
                mergedParams
              );

              // Update preset dropdown to reflect selection
              const presetSelect = document.getElementById('presetSelect');
              if (presetSelect) {
                presetSelect.value = match.id;
              }
              stateManager.setState({
                currentPresetId: match.id,
                currentPresetName: match.name,
              });

              // Trigger auto-preview with preset parameters
              if (autoPreviewController) {
                autoPreviewController.onParameterChange(mergedParams);
              }
              updatePrimaryActionButton();

              updateStatus(`Loaded: ${projectName} â€” preset: ${match.name}`);
              announceImmediate(
                `${projectName} loaded with preset ${match.name}`
              );
            } else {
              console.warn(
                `[DeepLink] Preset not found: "${presetName}". Available:`,
                presets.map((p) => p.name)
              );
              updateStatus(
                `Loaded: ${projectName} (preset "${presetName}" not found)`
              );
              announceImmediate(`${projectName} loaded from manifest`);
            }
          }
        } else {
          updateStatus(`Loaded: ${projectName}`);
          announceImmediate(`${projectName} loaded from manifest`);
        }

        // Auto-preview if manifest requests it
        if (defaults?.autoPreview && autoPreviewController) {
          autoPreviewController.onParameterChange(
            stateManager.getState().parameters
          );
        }

        // Clean up URL parameters
        initUrlParams.delete('manifest');
        initUrlParams.delete('preset');
        initUrlParams.delete('skipWelcome');
        initUrlParams.delete('skipwelcome');
        const cleanUrl = initUrlParams.toString()
          ? `${window.location.pathname}?${initUrlParams}`
          : window.location.pathname;
        history.replaceState(null, '', cleanUrl);

        console.log(`[DeepLink] Manifest load complete: ${projectName}`);

        // Step 6 â€” SAVE-COPY MODAL: prompt user to save a local copy
        const saveCopyChoice = await showManifestSaveCopyModal(
          projectName,
          manifest.author
        );
        if (saveCopyChoice === 'save' && manifestSaveCopyBtn) {
          manifestSaveCopyBtn.click();
        }
      } catch (error) {
        // ERROR PATH: dismiss overlay if it was shown (it's null if the
        // error occurred before step 2, e.g. during first-visit wait)
        if (dismissOverlay) dismissOverlay();
        console.error('[DeepLink] Manifest load failed:', error);

        let friendlyMsg;
        if (error instanceof ManifestError) {
          switch (error.code) {
            case 'INVALID_URL':
              friendlyMsg =
                error.message +
                ' Open the Manifest Sharing Guide for step-by-step instructions.';
              break;
            case 'CORS_ERROR':
              friendlyMsg =
                "Couldn't reach the file server. The manifest or its files may not be publicly " +
                "accessible, or the server doesn't support CORS. Try hosting on GitHub.";
              break;
            case 'VALIDATION_ERROR':
              friendlyMsg = `The manifest file has errors: ${error.details?.errors?.join('; ') || error.message}`;
              break;
            case 'TIMEOUT':
              friendlyMsg =
                'The request timed out. Check your internet connection and try again.';
              break;
            default:
              friendlyMsg = error.message;
          }
        } else {
          friendlyMsg =
            error.name === 'TypeError'
              ? "Couldn't reach the server. The manifest may not be publicly accessible, or CORS may be blocking the request."
              : error.message;
        }

        updateStatus(
          `Couldn't load the project from manifest. ${friendlyMsg} You can still upload a file manually.`,
          'error'
        );

        // Clean up URL so the user isn't stuck in a reload loop
        initUrlParams.delete('manifest');
        initUrlParams.delete('preset');
        initUrlParams.delete('skipWelcome');
        initUrlParams.delete('skipwelcome');
        const failCleanUrl = initUrlParams.toString()
          ? `${window.location.pathname}?${initUrlParams}`
          : window.location.pathname;
        history.replaceState(null, '', failCleanUrl);

        // Show welcome screen again on failure so the user isn't stuck
        welcomeScreen.classList.remove('hidden');
        mainInterface.classList.add('hidden');
      }
    }, 500);
  }

  // =========================================
  // Direct launch link: ?project=<url> support (Item 7)
  // Allows linking directly to any .scad or .zip file hosted on the web
  // Usage: ?project=https://example.com/keyguard.zip or ?scad=https://example.com/box.scad
  // =========================================
  const projectParam =
    initUrlParams.get('project') || initUrlParams.get('scad');

  if (projectParam && !exampleParam && !manifestParam) {
    console.log(`[DeepLink] Loading project from URL: ${projectParam}`);
    updateStatus('Loading project from URL...');

    setTimeout(async () => {
      try {
        // Validate URL
        const projectUrl = new URL(projectParam);
        const urlFileName =
          projectUrl.pathname.split('/').pop() || 'project.scad';
        const isZipUrl = urlFileName.toLowerCase().endsWith('.zip');

        console.log(
          `[DeepLink] Fetching: ${projectParam} (type: ${isZipUrl ? 'ZIP' : 'SCAD'})`
        );

        const response = await fetch(projectParam);
        if (!response.ok) {
          throw new Error(
            `Server returned ${response.status}: ${response.statusText}`
          );
        }

        if (isZipUrl) {
          // Handle ZIP file: convert response to blob, create File object, pass to handleFile
          const blob = await response.blob();
          const file = new File([blob], urlFileName, {
            type: 'application/zip',
          });
          await fileHandler.handleFile(file, null, null, null, 'user');
        } else {
          // Handle single .scad file
          const scadContent = await response.text();
          await fileHandler.handleFile(
            { name: urlFileName },
            scadContent,
            null,
            null,
            'user'
          );
        }

        // Clean up URL after loading
        initUrlParams.delete('project');
        initUrlParams.delete('scad');
        const cleanUrl = initUrlParams.toString()
          ? `${window.location.pathname}?${initUrlParams}`
          : window.location.pathname;
        history.replaceState(null, '', cleanUrl);

        console.log(`[DeepLink] Successfully loaded project: ${urlFileName}`);
        updateStatus(`Loaded ${urlFileName} from URL`);
        announceImmediate(`${urlFileName} loaded from URL link`);
      } catch (error) {
        console.error('[DeepLink] Failed to load project:', error);
        const friendlyMsg =
          error.name === 'TypeError'
            ? "Couldn't reach the server. The file may not be publicly accessible, or CORS may be blocking the request."
            : `${error.message}`;
        updateStatus(
          `Couldn't load the project from URL. ${friendlyMsg} You can still upload a file manually.`,
          'error'
        );
      }
    }, 500);
  }

  /**
   * Perform undo: restores previous parameter state, re-renders UI, and
   * triggers auto-preview.  Called by Edit toolbar menu, Undo button,
   * and keyboard shortcut.
   */
  function performUndo() {
    const previousParams = stateManager.undo();
    if (previousParams) {
      const state = stateManager.getState();

      const parametersContainer = document.getElementById(
        'parametersContainer'
      );
      renderParameterUI(
        state.schema,
        parametersContainer,
        (values) => {
          stateManager.recordParameterState();
          stateManager.setState({ parameters: values });
          clearPresetSelection(values);
          if (autoPreviewController && state.uploadedFile) {
            autoPreviewController.onParameterChange(values);
          }
          updatePrimaryActionButton();
        },
        previousParams
      );

      if (autoPreviewController && state.uploadedFile) {
        autoPreviewController.onParameterChange(previousParams);
      }

      updatePrimaryActionButton();
    }
  }

  /**
   * Perform redo: restores next parameter state, re-renders UI, and
   * triggers auto-preview.  Called by Edit toolbar menu, Redo button,
   * and keyboard shortcut.
   */
  function performRedo() {
    const nextParams = stateManager.redo();
    if (nextParams) {
      const state = stateManager.getState();

      const parametersContainer = document.getElementById(
        'parametersContainer'
      );
      renderParameterUI(
        state.schema,
        parametersContainer,
        (values) => {
          stateManager.recordParameterState();
          stateManager.setState({ parameters: values });
          clearPresetSelection(values);
          if (autoPreviewController && state.uploadedFile) {
            autoPreviewController.onParameterChange(values);
          }
          updatePrimaryActionButton();
        },
        nextParams
      );

      if (autoPreviewController && state.uploadedFile) {
        autoPreviewController.onParameterChange(nextParams);
      }

      updatePrimaryActionButton();
    }
  }

  // Undo/Redo buttons in Parameters header â€” delegates to shared logic
  const undoBtn = document.getElementById('undoBtn');
  const redoBtn = document.getElementById('redoBtn');

  undoBtn?.addEventListener('click', () => {
    const state = stateManager.getState();
    if (state.uploadedFile && stateManager.canUndo()) {
      performUndo();
    }
  });

  redoBtn?.addEventListener('click', () => {
    const state = stateManager.getState();
    if (state.uploadedFile && stateManager.canRedo()) {
      performRedo();
    }
  });

  // Reset button - performs the actual reset (used internally)
  const performReset = () => {
    const state = stateManager.getState();
    if (state.defaults) {
      // Record current state before reset for undo
      stateManager.recordParameterState();

      stateManager.setState({ parameters: { ...state.defaults } });

      // Clear preset selection when resetting to defaults
      clearPresetSelection(state.defaults);

      // Re-render UI with defaults
      const parametersContainer = document.getElementById(
        'parametersContainer'
      );
      renderParameterUI(state.schema, parametersContainer, (values) => {
        stateManager.recordParameterState();
        stateManager.setState({ parameters: values });
        // Clear preset selection when parameters are manually changed
        clearPresetSelection(values);
        // Trigger auto-preview on parameter change
        if (autoPreviewController && state.uploadedFile) {
          autoPreviewController.onParameterChange(values);
        }
        updatePrimaryActionButton();
      });

      // Trigger auto-preview with reset params
      if (autoPreviewController && state.uploadedFile) {
        autoPreviewController.onParameterChange(state.defaults);
      }

      updateStatus('Parameters reset to defaults');
      // Update button state after reset
      updatePrimaryActionButton();
    }
  };

  // Reset button - with COGA-compliant confirmation dialog
  const resetBtn = document.getElementById('resetBtn');
  resetBtn.addEventListener('click', async () => {
    const state = stateManager.getState();
    if (!state.defaults) return;

    // Check if there are unsaved changes (parameters differ from defaults)
    const hasChanges = Object.keys(state.parameters).some(
      (key) => state.parameters[key] !== state.defaults[key]
    );

    if (hasChanges) {
      // Show confirmation dialog for COGA compliance
      const confirmed = await showConfirmDialog(
        'This will reset all parameters to their default values. Any unsaved changes will be lost. You can undo this action.',
        'Reset All Parameters?',
        'Reset',
        'Keep Changes'
      );

      if (!confirmed) return;
    }

    performReset();
  });

  // Collapsible Parameter Panel (Desktop only)
  const collapseParamPanelBtn = document.getElementById(
    'collapseParamPanelBtn'
  );
  const paramPanel = document.getElementById('paramPanel');
  const paramPanelBody = document.getElementById('paramPanelBody');

  // Declare toggleParamPanel at module scope so it can be referenced by Split.js code
  let toggleParamPanel = null;

  if (collapseParamPanelBtn && paramPanel && paramPanelBody) {
    // Load saved collapsed state (desktop only)
    // (Storage key defined at module level as STORAGE_KEY_PARAM_PANEL_COLLAPSED)
    let isCollapsed = false;

    try {
      const savedState = localStorage.getItem(
        STORAGE_KEY_PARAM_PANEL_COLLAPSED
      );
      if (savedState === 'true' && window.innerWidth >= 768) {
        isCollapsed = true;
      }
    } catch (e) {
      console.warn('Could not access localStorage:', e);
    }

    // Apply initial state
    if (isCollapsed) {
      paramPanel.classList.add('collapsed');
      collapseParamPanelBtn.setAttribute('aria-expanded', 'false');
      collapseParamPanelBtn.setAttribute(
        'aria-label',
        'Expand parameters panel'
      );
      collapseParamPanelBtn.title = 'Expand panel';
    }

    // Toggle function (assigned to outer scope variable)
    toggleParamPanel = function () {
      // Only allow collapse on desktop (>= 768px)
      if (window.innerWidth < 768) {
        return;
      }

      isCollapsed = !isCollapsed;

      if (isCollapsed) {
        // Check if focus is inside the panel body
        const activeElement = document.activeElement;
        const isFocusInBody = paramPanelBody.contains(activeElement);

        // Collapse panel
        paramPanel.classList.add('collapsed');
        collapseParamPanelBtn.setAttribute('aria-expanded', 'false');
        collapseParamPanelBtn.setAttribute(
          'aria-label',
          'Expand parameters panel'
        );
        collapseParamPanelBtn.title = 'Expand panel';

        // If focus was inside body, move it to the toggle button
        if (isFocusInBody) {
          collapseParamPanelBtn.focus();
        }
      } else {
        // Expand panel
        paramPanel.classList.remove('collapsed');
        collapseParamPanelBtn.setAttribute('aria-expanded', 'true');
        collapseParamPanelBtn.setAttribute(
          'aria-label',
          'Collapse parameters panel'
        );
        collapseParamPanelBtn.title = 'Collapse panel';
      }

      // Persist state
      try {
        localStorage.setItem(
          STORAGE_KEY_PARAM_PANEL_COLLAPSED,
          String(isCollapsed)
        );
      } catch (e) {
        console.warn('Could not save to localStorage:', e);
      }

      // Trigger preview resize after transition
      setTimeout(() => {
        if (previewManager) {
          previewManager.handleResize();
        }
      }, 300); // Match CSS transition duration
    };

    // Add click listener
    collapseParamPanelBtn.addEventListener('click', toggleParamPanel);

    // Handle window resize - reset collapsed state on mobile
    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        if (window.innerWidth < 768 && isCollapsed) {
          // Reset to expanded on mobile
          isCollapsed = false;
          paramPanel.classList.remove('collapsed');
          collapseParamPanelBtn.setAttribute('aria-expanded', 'true');
          collapseParamPanelBtn.setAttribute(
            'aria-label',
            'Collapse parameters panel'
          );
          collapseParamPanelBtn.title = 'Collapse panel';
        }
      }, 150);
    });
  }

  // =========================================================================
  // Expert Mode Integration (M2)
  // =========================================================================
  const expertModeToggle = document.getElementById('expertModeToggle');
  const expertModePanel = document.getElementById('expertModePanel');
  const expertModeBody = document.getElementById('expertModeBody');
  const expertRunPreviewBtn = document.getElementById('expertRunPreviewBtn');
  const expertModeCloseBtn = document.getElementById('expertModeCloseBtn');
  const editorDirtyIndicator = document.getElementById('editorDirtyIndicator');

  // Check if Expert Mode feature flag is enabled
  const isExpertModeEnabled = _isEnabled('expert_mode');
  let currentEditor = null;
  let modeManager = null;
  let editorStateManager = null;

  if (
    isExpertModeEnabled &&
    expertModeToggle &&
    expertModePanel &&
    expertModeBody
  ) {
    console.log('[Expert Mode] Feature enabled, initializing...');

    // Show the toggle button
    expertModeToggle.classList.remove('hidden');

    // Initialize managers
    modeManager = getModeManager({
      announceToScreenReader: (msg) => announceToScreenReader(msg),
      onModeChange: handleModeChange,
    });
    editorStateManager = getEditorStateManager();

    // Expose modeManager globally for keyboard shortcut handler
    window._modeManager = modeManager;

    /**
     * Handle mode change between Standard and Expert
     * @param {string} newMode - 'standard' or 'expert'
     * @param {string} oldMode - Previous mode
     */
    function handleModeChange(newMode, oldMode) {
      console.log(`[Expert Mode] Switching from ${oldMode} to ${newMode}`);

      if (newMode === 'expert') {
        // Show Expert Mode panel, hide standard param body
        if (paramPanelBody) paramPanelBody.classList.add('hidden');
        expertModePanel.classList.add('active');
        expertModeToggle.setAttribute('aria-pressed', 'true');

        // Initialize editor if not already done
        if (!currentEditor) {
          initExpertEditor();
        } else {
          // Sync code from state to editor
          const currentCode = editorStateManager.getSource();
          if (currentCode) {
            currentEditor.setValue(currentCode);
          }
        }

        // Focus the editor
        if (currentEditor && currentEditor.focus) {
          setTimeout(() => currentEditor.focus(), 100);
        }
      } else {
        // Hide Expert Mode panel, show standard param body
        expertModePanel.classList.remove('active');
        if (paramPanelBody) paramPanelBody.classList.remove('hidden');
        expertModeToggle.setAttribute('aria-pressed', 'false');

        // Capture state from editor before switching
        if (currentEditor) {
          const code = currentEditor.getValue();
          editorStateManager.setSource(code, { markDirty: false });
        }

        // Clear editor instance so Edit menu items disable in Standard Mode
        modeManager.setEditorInstance(null);
      }
    }

    /**
     * Initialize the Expert Mode code editor
     */
    function initExpertEditor() {
      // Determine which editor to use based on preference
      const editorType = modeManager.resolveEditorType();
      console.log(`[Expert Mode] Using ${editorType} editor`);

      // For now, always use textarea editor (Monaco integration in future iteration)
      // This ensures CSP compatibility and accessibility-first approach
      currentEditor = new TextareaEditor({
        container: expertModeBody,
        onChange: (code) => {
          // Update state manager with new code
          editorStateManager.setSource(code, { markDirty: true });

          // Update dirty indicator
          updateDirtyIndicator();
        },
        onSave: () => {
          // Trigger save action
          const saveBtn = document.getElementById('saveProjectBtn');
          if (saveBtn) saveBtn.click();
        },
        onRun: () => {
          // Trigger preview render
          triggerPreviewFromEditor();
        },
        announce: (msg) => announceToScreenReader(msg),
      });

      currentEditor.initialize();

      // Sync initial code from state
      const initialCode =
        editorStateManager.getSource() || window._currentSCADCode || '';
      if (initialCode) {
        currentEditor.setValue(initialCode);
      }

      // Register editor with state manager
      if (editorStateManager.setTextareaElement && currentEditor.textarea) {
        editorStateManager.setTextareaElement(currentEditor.textarea);
      }

      // Register editor instance with ModeManager for Edit menu wiring
      modeManager.setEditorInstance(currentEditor);
    }

    /**
     * Update the dirty indicator visibility
     */
    function updateDirtyIndicator() {
      if (editorDirtyIndicator && editorStateManager) {
        if (editorStateManager.getIsDirty()) {
          editorDirtyIndicator.classList.add('visible');
        } else {
          editorDirtyIndicator.classList.remove('visible');
        }
      }
    }

    /**
     * Trigger preview render from editor code
     */
    function triggerPreviewFromEditor() {
      if (!currentEditor) return;

      const code = currentEditor.getValue();
      if (!code || code.trim() === '') {
        announceToScreenReader('No code to preview');
        return;
      }

      // Update global code variable
      window._currentSCADCode = code;

      // Trigger preview update
      if (typeof triggerPreviewFromEditor === 'function') {
        triggerPreviewFromEditor();
      } else if (previewManager) {
        previewManager.render(code);
      }

      // Mark as clean after preview
      editorStateManager.markClean();
      updateDirtyIndicator();
      announceToScreenReader('Preview update triggered');
    }

    // Toggle button click handler
    expertModeToggle.addEventListener('click', () => {
      modeManager.toggleMode();
    });

    // Run preview button handler
    if (expertRunPreviewBtn) {
      expertRunPreviewBtn.addEventListener('click', triggerPreviewFromEditor);
    }

    // Close/exit button handler
    if (expertModeCloseBtn) {
      expertModeCloseBtn.addEventListener('click', () => {
        modeManager.switchMode('standard');
      });
    }

    // Keyboard shortcut: Ctrl+E to toggle Expert Mode (registered via keyboard config below)

    // Sync code changes from parameter panel to editor state
    // This happens when parameters are modified in Standard mode
    window.addEventListener('scadCodeUpdated', (e) => {
      const newCode = e.detail?.code || window._currentSCADCode;
      if (newCode && editorStateManager) {
        editorStateManager.setSource(newCode, { markDirty: false });

        // Update editor if in Expert Mode
        if (modeManager.getMode() === 'expert' && currentEditor) {
          currentEditor.setValue(newCode);
        }
      }
    });

    console.log('[Expert Mode] Initialization complete');
  } else if (!isExpertModeEnabled) {
    console.log('[Expert Mode] Feature flag disabled');
  }

  // Resizable Split Panels (Desktop only - horizontal split between params and preview)
  let splitInstance = null;
  const previewPanel = document.querySelector('.preview-panel');

  // Note: Vertical split (preview info vs canvas) is now handled by the overlay drawer
  // in preview-settings-drawer.js - no Split.js needed for that anymore

  if (paramPanel && previewPanel) {
    // (Storage key defined at module level as STORAGE_KEY_LAYOUT_SIZES)

    // Load saved split sizes
    let initialSizes = [40, 60]; // Default: 40% params, 60% preview
    try {
      const savedSizes = localStorage.getItem(STORAGE_KEY_LAYOUT_SIZES);
      if (savedSizes) {
        const parsed = JSON.parse(savedSizes);
        if (Array.isArray(parsed) && parsed.length === 2) {
          initialSizes = parsed;
        }
      }
    } catch (e) {
      console.warn('Could not load split sizes:', e);
    }

    const minSizes = [280, 300];

    // Initialize Split.js (only if not collapsed and not on mobile)
    const initSplit = function () {
      // Don't initialize on mobile (drawer pattern is used instead)
      if (window.innerWidth < 768) {
        return;
      }

      if (splitInstance || paramPanel.classList.contains('collapsed')) {
        return;
      }

      let splitResizePending = false;
      splitInstance = Split([paramPanel, previewPanel], {
        sizes: initialSizes,
        minSize: minSizes,
        gutterSize: 8,
        cursor: 'col-resize',
        onDragStart: () => {
          document.body.classList.add('split-dragging');
        },
        onDrag: () => {
          if (previewManager && !splitResizePending) {
            splitResizePending = true;
            requestAnimationFrame(() => {
              splitResizePending = false;
              previewManager.handleResize();
            });
          }
        },
        onDragEnd: (sizes) => {
          document.body.classList.remove('split-dragging');
          // Persist sizes
          try {
            localStorage.setItem(
              STORAGE_KEY_LAYOUT_SIZES,
              JSON.stringify(sizes)
            );
          } catch (e) {
            console.warn('Could not save split sizes:', e);
          }

          // Final resize after drag
          if (previewManager) {
            previewManager.handleResize();
          }
        },
      });

      // Add keyboard accessibility to gutter
      setTimeout(() => {
        const gutter = document.querySelector('.gutter');
        if (gutter) {
          // Make gutter focusable
          gutter.setAttribute('tabindex', '0');
          gutter.setAttribute('role', 'separator');
          gutter.setAttribute('aria-orientation', 'vertical');
          gutter.setAttribute('aria-label', 'Resize panels');
          const controlIds = [paramPanel.id, previewPanel.id]
            .filter(Boolean)
            .join(' ');
          if (controlIds) {
            gutter.setAttribute('aria-controls', controlIds);
          }

          // Get current sizes
          const getCurrentSizes = () => {
            const paramWidth = paramPanel.offsetWidth;
            const previewWidth = previewPanel.offsetWidth;
            const totalWidth = paramWidth + previewWidth;
            if (!totalWidth) {
              return [50, 50];
            }
            return [
              (paramWidth / totalWidth) * 100,
              (previewWidth / totalWidth) * 100,
            ];
          };

          const getAriaRange = () => {
            const totalWidth =
              paramPanel.offsetWidth + previewPanel.offsetWidth;
            if (!totalWidth) {
              return { min: 0, max: 100 };
            }
            const minParam = Math.round((minSizes[0] / totalWidth) * 100);
            const maxParam = Math.round((1 - minSizes[1] / totalWidth) * 100);
            return {
              min: Math.max(0, Math.min(minParam, maxParam)),
              max: Math.min(100, Math.max(minParam, maxParam)),
            };
          };

          // Set aria-value attributes
          const updateAriaValues = () => {
            const sizes = getCurrentSizes();
            const { min, max } = getAriaRange();
            gutter.setAttribute('aria-valuenow', Math.round(sizes[0]));
            gutter.setAttribute('aria-valuemin', String(min));
            gutter.setAttribute('aria-valuemax', String(max));
            gutter.setAttribute(
              'aria-valuetext',
              `Parameters: ${Math.round(sizes[0])}%, Preview: ${Math.round(sizes[1])}%`
            );
          };

          updateAriaValues();

          // Keyboard navigation
          gutter.addEventListener('keydown', (e) => {
            if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
              e.preventDefault();

              const sizes = getCurrentSizes();
              let newParamSize = sizes[0];
              const { min, max } = getAriaRange();

              // Calculate step size
              const smallStep = 2; // 2%
              const largeStep = 5; // 5% with Shift
              const step = e.shiftKey ? largeStep : smallStep;

              // Adjust size based on key
              switch (e.key) {
                case 'ArrowLeft':
                  newParamSize = Math.max(min, sizes[0] - step);
                  break;
                case 'ArrowRight':
                  newParamSize = Math.min(max, sizes[0] + step);
                  break;
                case 'Home':
                  newParamSize = min;
                  break;
                case 'End':
                  newParamSize = max;
                  break;
              }

              const newPreviewSize = 100 - newParamSize;

              // Apply new sizes
              if (splitInstance) {
                splitInstance.setSizes([newParamSize, newPreviewSize]);

                // Save to localStorage
                try {
                  localStorage.setItem(
                    STORAGE_KEY_LAYOUT_SIZES,
                    JSON.stringify([newParamSize, newPreviewSize])
                  );
                } catch (err) {
                  console.warn('Could not save split sizes:', err);
                }

                // Update ARIA values
                updateAriaValues();

                // Trigger preview resize
                if (previewManager) {
                  previewManager.handleResize();
                }
              }
            }
          });

          // Update ARIA values after drag
          gutter.addEventListener('mouseup', updateAriaValues);
          gutter.addEventListener('touchend', updateAriaValues);
        }
      }, 100);
    };

    // Destroy Split.js and clean up
    const destroySplit = function () {
      if (splitInstance) {
        splitInstance.destroy();
        splitInstance = null;
      }

      // Clean up leftover gutters and inline styles
      const gutters = document.querySelectorAll('.gutter-horizontal');
      gutters.forEach((gutter) => gutter.remove());

      // Clear inline styles that Split.js may have applied
      if (paramPanel) {
        paramPanel.style.removeProperty('width');
        paramPanel.style.removeProperty('flex-basis');
      }
      if (previewPanel) {
        previewPanel.style.removeProperty('width');
        previewPanel.style.removeProperty('flex-basis');
      }
    };

    // Initialize if not collapsed
    if (!paramPanel.classList.contains('collapsed')) {
      initSplit();
    }

    // Initialize mobile drawer controller
    initDrawerController();

    // Initialize image measurement tool
    initImageMeasurement({
      onCoordinateCopied: (axis, value) => {
        // GAP 7: populate focused parameter field with copied coordinate
        const active = document.activeElement;
        if (
          active &&
          active.tagName === 'INPUT' &&
          (active.type === 'number' || active.type === 'text')
        ) {
          active.value = value;
          active.dispatchEvent(new Event('input', { bubbles: true }));
          active.dispatchEvent(new Event('change', { bubbles: true }));
        }
      },
    });

    // Wire measurement fullscreen expand/close buttons
    const measureExpandBtn = document.getElementById('measureExpandBtn');
    const measureFsClose = document.getElementById('measureFullscreenClose');
    const measureFsBackdrop = document.getElementById(
      'measureFullscreenBackdrop'
    );
    if (measureExpandBtn)
      measureExpandBtn.addEventListener('click', measureOpenFullscreen);
    if (measureFsClose)
      measureFsClose.addEventListener('click', measureCloseFullscreen);
    if (measureFsBackdrop)
      measureFsBackdrop.addEventListener('click', measureCloseFullscreen);

    // --- Measurement mode toggle (radiogroup with roving tabindex) ---
    const modeBtns = [
      document.getElementById('measureModePoint'),
      document.getElementById('measureModeRuler'),
      document.getElementById('measureModeCalibrate'),
    ].filter(Boolean);
    const modeNames = ['point', 'ruler', 'calibrate'];
    const measureDistRow = document.getElementById('measureDistRow');
    const measureCalibRow = document.getElementById('measureCalibRow');
    const measureCoordRow = document.querySelector('.measure-coord-row');

    function activateModeBtn(idx) {
      modeBtns.forEach((btn, i) => {
        const isActive = i === idx;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-checked', String(isActive));
        btn.tabIndex = isActive ? 0 : -1;
      });
      setMeasureMode(modeNames[idx]);
      // Show/hide mode-specific rows
      if (measureDistRow)
        measureDistRow.classList.toggle('hidden', modeNames[idx] !== 'ruler');
      if (measureCalibRow)
        measureCalibRow.classList.toggle(
          'hidden',
          modeNames[idx] !== 'calibrate'
        );
      if (measureCoordRow)
        measureCoordRow.classList.toggle(
          'hidden',
          modeNames[idx] === 'calibrate'
        );
    }

    modeBtns.forEach((btn, i) => {
      btn.addEventListener('click', () => {
        activateModeBtn(i);
        btn.focus();
      });
      btn.addEventListener('keydown', (e) => {
        let nextIdx = -1;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          nextIdx = (i + 1) % modeBtns.length;
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          nextIdx = (i - 1 + modeBtns.length) % modeBtns.length;
        }
        if (nextIdx >= 0) {
          e.preventDefault();
          activateModeBtn(nextIdx);
          modeBtns[nextIdx].focus();
        }
      });
    });

    // --- Measurement scale factor input ---
    const measureScaleInput = document.getElementById('measureScaleInput');
    if (measureScaleInput) {
      const currentSf = getScaleFactor();
      measureScaleInput.value = currentSf > 0 ? currentSf : '';
      measureScaleInput.addEventListener('change', () => {
        setScaleFactor(parseFloat(measureScaleInput.value) || 0);
      });
    }

    // --- Calibration Apply handler ---
    const measureCalibApply = document.getElementById('measureCalibApply');
    const measureCalibMm = document.getElementById('measureCalibMm');
    const measureCalibError = document.getElementById('measureCalibError');
    if (measureCalibApply && measureCalibMm) {
      measureCalibApply.addEventListener('click', () => {
        const pixelDist = getCalibDistancePx();
        const mmVal = parseFloat(measureCalibMm.value);

        // Validation
        if (!pixelDist || pixelDist <= 0) {
          showCalibError('Place two points on the canvas first.');
          return;
        }
        if (!Number.isFinite(mmVal) || mmVal <= 0) {
          showCalibError('Enter a valid distance greater than 0.');
          return;
        }

        hideCalibError();
        const sf = pixelDist / mmVal;
        setScaleFactor(sf);
        announceImmediate(
          `Calibration applied: ${sf.toFixed(2)} pixels per millimeter`
        );

        // Switch back to Ruler mode after calibration
        activateModeBtn(1);
        modeBtns[1]?.focus();
      });
    }

    function showCalibError(msg) {
      if (measureCalibError) {
        measureCalibError.textContent = msg;
        measureCalibError.classList.remove('hidden');
      }
    }
    function hideCalibError() {
      if (measureCalibError) {
        measureCalibError.textContent = '';
        measureCalibError.classList.add('hidden');
      }
    }

    // --- Distance copy and clear handlers ---
    const measureCopyDist = document.getElementById('measureCopyDist');
    const measureClearRuler = document.getElementById('measureClearRuler');
    if (measureCopyDist) {
      measureCopyDist.addEventListener('click', () => {
        const el = document.getElementById('measureDistValue');
        if (el && el.textContent !== '--') {
          navigator.clipboard
            .writeText(el.textContent)
            .then(() => {
              announceImmediate(`Distance ${el.textContent} copied`);
            })
            .catch(() => {});
        }
      });
    }
    if (measureClearRuler) {
      measureClearRuler.addEventListener('click', () => clearRulerPoints());
    }

    // --- Shared Image Store: intercept measurement uploads ---
    const measureFileInput = document.getElementById('measureFileInput');
    const measureImageSelect = document.getElementById('measureImageSelect');
    if (measureFileInput) {
      measureFileInput.addEventListener('change', async (e) => {
        try {
          const file = e.target.files?.[0];
          if (!file || !file.type.startsWith('image/')) return;
          const record = await SharedImageStore.addImage(file);

          // Persist screenshot to projectFiles under Screenshots/ folder
          const state = stateManager.getState();
          let { projectFiles, mainFilePath, uploadedFile: uf } = state;

          // Initialize projectFiles Map if needed (single-file â†’ multi-file)
          if (!projectFiles && uf) {
            projectFiles = new Map();
            const mainPath = mainFilePath || uf.name;
            projectFiles.set(mainPath, uf.content);
            mainFilePath = mainPath;
            stateManager.setState({ projectFiles, mainFilePath });
            setCanonicalProjectFiles(projectFiles);
          }

          if (projectFiles) {
            projectFiles.set(`Screenshots/${record.name}`, record.dataUrl);
            stateManager.setState({ projectFiles });
            setCanonicalProjectFiles(projectFiles);

            // Auto-save to IndexedDB so screenshots persist across sessions
            await companionFilesCtrl.autoSaveCompanionFiles();
          }

          // Select the newly uploaded image in the dropdown
          if (measureImageSelect) {
            measureImageSelect.value = String(record.id);
            if (measureImageSelect.value !== String(record.id)) {
              setTimeout(() => {
                if (measureImageSelect)
                  measureImageSelect.value = String(record.id);
              }, 0);
            }
          }

          // Update overlay dropdown with the new screenshot
          overlayGridCtrl.updateOverlaySourceDropdown();
        } catch (err) {
          console.error('[App] Measurement image upload failed:', err);
        }
      });
    }
    // Populate image recall dropdown when store changes
    SharedImageStore.onImagesChange(() => {
      const imgs = SharedImageStore.getImages();
      if (measureImageSelect) {
        const currentVal = measureImageSelect.value;
        measureImageSelect.innerHTML =
          '<option value="">-- No screenshots --</option>';
        for (const [id, rec] of imgs) {
          const opt = document.createElement('option');
          opt.value = id;
          opt.textContent = `${rec.name} (${rec.width}\u00d7${rec.height})`;
          measureImageSelect.appendChild(opt);
        }
        measureImageSelect.value = currentVal;
      }
      // Also add shared images to overlay source dropdown
      if (overlaySourceSelect) {
        // Preserve current selection before removing/re-adding shared options
        const overlayCurrentVal = overlaySourceSelect.value;
        // Remove previous shared-image entries
        for (const opt of [...overlaySourceSelect.options]) {
          if (opt.dataset.shared) opt.remove();
        }
        for (const [, rec] of imgs) {
          const opt = document.createElement('option');
          opt.value = `screenshot:${rec.name}`;
          opt.textContent = `\uD83D\uDCF7 ${rec.name}`;
          opt.dataset.shared = '1';
          overlaySourceSelect.appendChild(opt);
        }
        // Restore selection (removing the old option cleared it)
        if (overlayCurrentVal) {
          overlaySourceSelect.value = overlayCurrentVal;
        }
      }
    });
    if (measureImageSelect) {
      measureImageSelect.addEventListener('change', () => {
        const id = parseInt(measureImageSelect.value, 10);
        if (!id) return;
        const rec = SharedImageStore.getImages().get(id);
        if (rec) loadImageFromDataURL(rec.dataUrl, rec.name);
      });
    }

    // --- Unit Sync: wire both unit selects ---
    const measureUnitSelect = document.getElementById('measureUnitSelect');
    const overlayUnitSelect = document.getElementById('overlayUnitSelect');
    const scaleFactorInput = document.getElementById('scaleFactorInput');
    const overlaySizeUnit = document.getElementById('overlaySizeUnit');
    const overlayOffsetUnit = document.getElementById('overlayOffsetUnit');

    // Set initial state from persisted values
    if (measureUnitSelect) measureUnitSelect.value = getUnit();
    if (overlayUnitSelect) overlayUnitSelect.value = getUnit();
    if (scaleFactorInput && getScaleFactor() > 0)
      scaleFactorInput.value = getScaleFactor();

    function updateUnitLabels(unit) {
      if (overlaySizeUnit) overlaySizeUnit.textContent = unit;
      if (overlayOffsetUnit) overlayOffsetUnit.textContent = unit;
      const overlayWidthInput = document.getElementById('overlayWidthInput');
      const overlayHeightInput = document.getElementById('overlayHeightInput');
      const overlayOffsetXInput = document.getElementById(
        'overlayOffsetXInput'
      );
      const overlayOffsetYInput = document.getElementById(
        'overlayOffsetYInput'
      );
      if (overlayWidthInput)
        overlayWidthInput.setAttribute(
          'aria-label',
          `Overlay width in ${unit === 'mm' ? 'millimeters' : 'pixels'}`
        );
      if (overlayHeightInput)
        overlayHeightInput.setAttribute(
          'aria-label',
          `Overlay height in ${unit === 'mm' ? 'millimeters' : 'pixels'}`
        );
      if (overlayOffsetXInput)
        overlayOffsetXInput.setAttribute(
          'aria-label',
          `Overlay X offset in ${unit === 'mm' ? 'millimeters' : 'pixels'}`
        );
      if (overlayOffsetYInput)
        overlayOffsetYInput.setAttribute(
          'aria-label',
          `Overlay Y offset in ${unit === 'mm' ? 'millimeters' : 'pixels'}`
        );
    }

    function syncBothUnitSelects(unit) {
      if (measureUnitSelect) measureUnitSelect.value = unit;
      if (overlayUnitSelect) overlayUnitSelect.value = unit;
      updateUnitLabels(unit);
    }

    if (measureUnitSelect) {
      measureUnitSelect.addEventListener('change', () =>
        setUnit(measureUnitSelect.value)
      );
    }
    if (overlayUnitSelect) {
      overlayUnitSelect.addEventListener('change', () =>
        setUnit(overlayUnitSelect.value)
      );
    }
    if (scaleFactorInput) {
      scaleFactorInput.addEventListener('change', () => {
        setScaleFactor(parseFloat(scaleFactorInput.value) || 0);
      });
    }

    onUnitChange(({ unit }) => syncBothUnitSelects(unit));
    onScaleChange(({ scaleFactor: sf }) => {
      if (scaleFactorInput && sf > 0) scaleFactorInput.value = sf;
      if (measureScaleInput && sf > 0) measureScaleInput.value = sf;
    });

    // Initialize preview settings drawer (overlay with resize functionality)
    initPreviewSettingsDrawer({
      onResize: () => {
        if (previewManager) {
          previewManager.handleResize();
        }
      },
    });

    // Initialize camera panel controller (right-side drawer)
    cameraPanelController = initCameraPanelController({
      previewManager: null, // Will be set after preview manager is initialized
      onPanControl: (params) => hfmCtrl.onPanControl(params),
    });

    // Dev bypass: check localStorage or URL param before sequence detector
    const HFM_UNLOCK_KEY = 'openscad-customizer-hfm-unlock';
    const devUnlockFlag = localStorage.getItem(HFM_UNLOCK_KEY) === 'true';
    const urlParams = new URLSearchParams(window.location.search);
    const urlUnlock = urlParams.get('hfm') === 'unlock';

    if (urlUnlock) {
      // Strip param to avoid accidental sharing
      urlParams.delete('hfm');
      const newUrl = urlParams.toString()
        ? `${window.location.pathname}?${urlParams}`
        : window.location.pathname;
      history.replaceState(null, '', newUrl);
    }

    if (devUnlockFlag || urlUnlock) {
      hfmCtrl.handleUnlock();
    }

    // Initialize input sequence detector (still works for non-dev users)
    initSequenceDetector(() => hfmCtrl.handleUnlock());

    // Expose DevTools helper for manual unlock
    window.__unlockAltView = () => {
      localStorage.setItem(HFM_UNLOCK_KEY, 'true');
      hfmCtrl.handleUnlock();
      return 'Alt View unlocked. Refresh to persist.';
    };

    // Expose startTutorial globally for E2E test automation
    window.startTutorial = (tutorialId) => startTutorial(tutorialId);

    // Initialize actions drawer toggle
    const initActionsDrawer = () => {
      const toggleBtn = document.getElementById('actionsDrawerToggle');
      const drawer = document.getElementById('actionsDrawer');
      const STORAGE_KEY = 'openscad-drawer-actions-state';

      if (!toggleBtn || !drawer) return;

      // Load saved state
      const loadState = () => {
        try {
          const saved = localStorage.getItem(STORAGE_KEY);
          return saved === 'expanded';
        } catch (e) {
          console.warn('Could not load actions drawer state:', e);
          return false; // Default collapsed
        }
      };

      // Save state
      const saveState = (isExpanded) => {
        try {
          localStorage.setItem(
            STORAGE_KEY,
            isExpanded ? 'expanded' : 'collapsed'
          );
        } catch (e) {
          console.warn('Could not save actions drawer state:', e);
        }
      };

      // Set initial state
      const shouldExpand = loadState();
      if (shouldExpand) {
        drawer.classList.remove('collapsed');
        toggleBtn.setAttribute('aria-expanded', 'true');
        toggleBtn.setAttribute('aria-label', 'Collapse actions menu');
      } else {
        drawer.classList.add('collapsed');
        toggleBtn.setAttribute('aria-expanded', 'false');
        toggleBtn.setAttribute('aria-label', 'Expand actions menu');
      }

      // Toggle handler
      toggleBtn.addEventListener('click', () => {
        const isExpanded = !drawer.classList.contains('collapsed');

        if (isExpanded) {
          // Collapse drawer
          drawer.classList.add('collapsed');
          toggleBtn.setAttribute('aria-expanded', 'false');
          toggleBtn.setAttribute('aria-label', 'Expand actions menu');
          saveState(false);
        } else {
          // Mobile portrait: close camera drawer first (mutual exclusion)
          const cameraDrawer = document.getElementById('cameraDrawer');
          const cameraToggle = document.getElementById('cameraDrawerToggle');
          if (cameraDrawer && !cameraDrawer.classList.contains('collapsed')) {
            cameraDrawer.classList.add('collapsed');
            if (cameraToggle) {
              cameraToggle.setAttribute('aria-expanded', 'false');
              cameraToggle.setAttribute('aria-label', 'Expand camera controls');
            }
            // Remove preview panel camera drawer class
            const previewPanel = document.querySelector('.preview-panel');
            if (previewPanel) {
              previewPanel.classList.remove('camera-drawer-open');
            }
          }

          // Expand drawer
          drawer.classList.remove('collapsed');
          toggleBtn.setAttribute('aria-expanded', 'true');
          toggleBtn.setAttribute('aria-label', 'Collapse actions menu');
          saveState(true);
        }

        // Retain focus on toggle button
        toggleBtn.focus();
      });

      // On mobile, collapse drawer automatically
      window.addEventListener('resize', () => {
        const isMobile = window.innerWidth < 768;
        if (isMobile && !drawer.classList.contains('collapsed')) {
          drawer.classList.add('collapsed');
          toggleBtn.setAttribute('aria-expanded', 'false');
          toggleBtn.setAttribute('aria-label', 'Expand actions menu');
          saveState(false);
        }
      });
    };

    initActionsDrawer();

    // Collapse details sections on mobile by default
    const initMobileDetailsCollapse = () => {
      if (window.innerWidth >= 768) return;

      const detailsToCollapse = ['.advanced-menu'];

      detailsToCollapse.forEach((selector) => {
        const el = document.querySelector(selector);
        if (el && el.tagName === 'DETAILS') {
          el.removeAttribute('open');
        }
      });
    };

    // Call on load
    initMobileDetailsCollapse();

    // Re-initialize/destroy split when collapse state changes
    const originalToggleParamPanel = toggleParamPanel;
    if (typeof originalToggleParamPanel === 'function') {
      toggleParamPanel = function () {
        const wasCollapsed = paramPanel.classList.contains('collapsed');
        originalToggleParamPanel.call(this);

        if (wasCollapsed) {
          // Just expanded - initialize split
          setTimeout(initSplit, 350); // Wait for transition
        } else {
          // Just collapsed - destroy split
          destroySplit();
        }
      };

      // Re-bind the event listener
      collapseParamPanelBtn.removeEventListener(
        'click',
        originalToggleParamPanel
      );
      collapseParamPanelBtn.addEventListener('click', toggleParamPanel);
    }

    // Handle window resize - destroy/reinit split on mobile
    let splitResizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(splitResizeTimeout);
      splitResizeTimeout = setTimeout(() => {
        if (window.innerWidth < 768) {
          destroySplit();
        } else if (
          !splitInstance &&
          !paramPanel.classList.contains('collapsed')
        ) {
          initSplit();
        }
      }, 150);
    });
  }

  // Focus Mode - Maximize 3D preview
  const focusModeBtn = document.getElementById('focusModeBtn');
  const cameraDrawer = document.getElementById('cameraDrawer');
  // mainInterface is already declared at line 484
  // comparisonView container is accessed via DOM query

  if (focusModeBtn && mainInterface) {
    let isFocusMode = false;
    let cameraFocusExitBtn = null;
    // Assigned below; used by the camera focus exit button handler.
    let toggleFocusMode = () => {};

    /**
     * Check if we're in mobile portrait mode
     */
    const isMobilePortrait = () => {
      return (
        window.innerWidth <= 480 &&
        window.matchMedia('(orientation: portrait)').matches
      );
    };

    /**
     * Check if camera drawer is expanded
     */
    const isCameraDrawerExpanded = () => {
      return cameraDrawer && !cameraDrawer.classList.contains('collapsed');
    };

    /**
     * Calculate the bottom offset for camera focus mode
     * based on camera drawer height + primary action bar
     */
    const calculateCameraFocusBottomOffset = () => {
      const actionsBar = document.getElementById('actionsBar');
      const cameraDrawerBody = document.getElementById('cameraDrawerBody');

      if (actionsBar) {
        let totalHeight = 0;

        // When camera drawer is expanded, calculate distance from viewport bottom
        // to the top of the camera drawer body
        if (isCameraDrawerExpanded() && cameraDrawerBody) {
          // Get the bounding rect of the camera drawer body
          const bodyRect = cameraDrawerBody.getBoundingClientRect();
          // The offset should be from viewport bottom to the top of the drawer body
          totalHeight = window.innerHeight - bodyRect.top;

          // Add a small buffer for visual separation
          totalHeight += 2;
        } else {
          // Fallback to actions bar height when drawer is collapsed
          totalHeight = actionsBar.offsetHeight;
        }

        document.documentElement.style.setProperty(
          '--camera-focus-bottom-offset',
          `${totalHeight}px`
        );
      }
    };

    /**
     * Create floating exit button for camera focus mode
     */
    const createCameraFocusExitBtn = () => {
      if (cameraFocusExitBtn) return cameraFocusExitBtn;

      cameraFocusExitBtn = document.createElement('button');
      cameraFocusExitBtn.id = 'cameraFocusExitBtn';
      cameraFocusExitBtn.className = 'btn camera-focus-exit-btn';
      cameraFocusExitBtn.setAttribute('aria-label', 'Exit focus mode');
      cameraFocusExitBtn.title = 'Exit focus mode (Esc)';
      cameraFocusExitBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path>
        </svg>
        <span>Exit</span>
      `;

      cameraFocusExitBtn.addEventListener('click', () => toggleFocusMode());

      // Insert after the main interface
      document.getElementById('app').appendChild(cameraFocusExitBtn);

      return cameraFocusExitBtn;
    };

    /**
     * Enter camera focus mode (mobile portrait with camera drawer open)
     */
    const enterCameraFocusMode = () => {
      mainInterface.classList.add('camera-focus-mode');
      createCameraFocusExitBtn();

      // Calculate offset after a short delay to ensure layout has settled
      requestAnimationFrame(() => {
        calculateCameraFocusBottomOffset();
        // Recalculate again after animations complete
        setTimeout(() => {
          calculateCameraFocusBottomOffset();
        }, 100);
      });
    };

    /**
     * Exit camera focus mode
     */
    const exitCameraFocusMode = () => {
      mainInterface.classList.remove('camera-focus-mode');
    };

    /**
     * Update camera focus mode state based on current conditions
     */
    const updateCameraFocusMode = () => {
      if (isFocusMode && isMobilePortrait() && isCameraDrawerExpanded()) {
        enterCameraFocusMode();
      } else {
        exitCameraFocusMode();
      }
    };

    // Toggle focus mode
    toggleFocusMode = function () {
      // Don't allow focus mode when comparison view is active
      const comparisonViewEl = document.getElementById('comparisonView');
      if (comparisonViewEl && !comparisonViewEl.classList.contains('hidden')) {
        return;
      }

      isFocusMode = !isFocusMode;

      if (isFocusMode) {
        // Enter focus mode
        mainInterface.classList.add('focus-mode');
        focusModeBtn.setAttribute('aria-pressed', 'true');
        focusModeBtn.setAttribute('aria-label', 'Exit focus mode');
        focusModeBtn.title = 'Exit focus mode (Esc)';

        // Check for camera focus mode (mobile portrait + camera drawer open)
        updateCameraFocusMode();
      } else {
        // Exit focus mode
        mainInterface.classList.remove('focus-mode');
        exitCameraFocusMode();
        focusModeBtn.setAttribute('aria-pressed', 'false');
        focusModeBtn.setAttribute('aria-label', 'Enter focus mode');
        focusModeBtn.title = 'Focus mode (maximize preview)';
      }

      // Trigger preview resize after mode change
      setTimeout(() => {
        if (previewManager) {
          previewManager.handleResize();
        }
      }, 100);
    };

    // Add click listener
    focusModeBtn.addEventListener('click', toggleFocusMode);

    // Watch for camera drawer state changes to update camera focus mode
    if (cameraDrawer) {
      const cameraDrawerObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.attributeName === 'class') {
            updateCameraFocusMode();
            // Trigger resize when camera drawer state changes in focus mode
            if (isFocusMode) {
              // Delay calculation to allow layout to settle after drawer toggle
              requestAnimationFrame(() => {
                calculateCameraFocusBottomOffset();
                setTimeout(() => {
                  calculateCameraFocusBottomOffset();
                  if (previewManager) {
                    previewManager.handleResize();
                  }
                }, 150);
              });
            }
          }
        });
      });
      cameraDrawerObserver.observe(cameraDrawer, { attributes: true });
    }

    // Watch for window resize/orientation changes
    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        if (isFocusMode) {
          updateCameraFocusMode();
          calculateCameraFocusBottomOffset();
        }
      }, 150);
    });

    // Add Escape key listener to exit focus mode
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isFocusMode) {
        // Only exit focus mode if no modals are open
        const modals = document.querySelectorAll('.modal:not(.hidden)');
        if (modals.length === 0) {
          toggleFocusMode();
        }
      }
    });

    // Auto-exit focus mode when comparison view is shown
    const comparisonViewEl = document.getElementById('comparisonView');
    if (comparisonViewEl) {
      // Watch for comparison view becoming visible
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.attributeName === 'class') {
            if (!comparisonViewEl.classList.contains('hidden') && isFocusMode) {
              // Exit focus mode when comparison view opens
              toggleFocusMode();
            }
          }
        });
      });

      observer.observe(comparisonViewEl, { attributes: true });
    }
  }

  // Primary Action Button (transforms between Generate and Download)
  primaryActionBtn.addEventListener('click', async () => {
    const action = primaryActionBtn.dataset.action;
    const state = stateManager.getState();

    if (action === 'download') {
      // Get selected output format
      const outputFormat =
        outputFormatSelect?.value || state.outputFormat || 'stl';

      // Download action - get full quality file from auto-preview controller
      const fullSTL = autoPreviewController?.getCurrentFullSTL(
        state.parameters
      );

      if (fullSTL && outputFormat === 'stl') {
        // Use cached full quality STL
        const filename = generateFilename(
          state.uploadedFile.name,
          state.parameters,
          outputFormat
        );
        downloadFile(fullSTL.stl, filename, outputFormat);
        updateStatus(`Downloaded: ${filename}`);
        return;
      }

      // Fallback to state.stl
      if (!state.stl) {
        alert('No file generated yet');
        return;
      }

      const filename = generateFilename(
        state.uploadedFile.name,
        state.parameters,
        outputFormat
      );

      downloadFile(state.stl, filename, outputFormat);
      updateStatus(`Downloaded: ${filename}`);
      return;
    }

    // Generate action - perform full quality render for download
    if (!state.uploadedFile) {
      alert('No file uploaded');
      return;
    }

    if (!renderController) {
      alert('OpenSCAD engine not initialized');
      return;
    }

    try {
      // Get selected output format
      let outputFormat = outputFormatSelect?.value || 'stl';
      let formatName =
        OUTPUT_FORMATS[outputFormat]?.name || outputFormat.toUpperCase();

      primaryActionBtn.disabled = true;
      primaryActionBtn.textContent = `â³ Generating ${formatName}...`;

      // Show cancel button
      cancelRenderBtn.classList.remove('hidden');

      // Disable undo/redo during rendering to prevent state mismatches
      stateManager.setHistoryEnabled(false);

      // Cancel any pending preview renders
      if (autoPreviewController) {
        autoPreviewController.cancelPending();
      }

      updatePreviewStateUI(PREVIEW_STATE.RENDERING);

      // Show render time estimate for complex models
      const estimate = estimateRenderTime(
        state.uploadedFile.content,
        state.parameters
      );
      if (estimate.seconds >= 5 || estimate.warning) {
        const estimateMsg = `Generating ${formatName}... (est. ~${estimate.seconds}s)`;
        if (estimate.warning) {
          console.warn('[Render] Complexity warning:', estimate.warning);
        }
        updateStatus(estimateMsg);
      }

      const startTime = Date.now();

      let result;

      // Auto-detect 2D parameters with a 3D format and switch to SVG.
      // When the user has e.g. generate="first layer for SVG/DXF file" but
      // the format dropdown is still STL, rendering will fail with MODEL_IS_2D.
      // Proactively switch to SVG so the render succeeds.
      if (
        !OUTPUT_FORMATS[outputFormat]?.is2D &&
        typeof state.parameters?.generate === 'string' &&
        /svg|dxf|2d|first layer/i.test(state.parameters.generate)
      ) {
        outputFormat = 'svg';
        formatName = 'SVG';
        if (outputFormatSelect) {
          outputFormatSelect.value = 'svg';
          outputFormatSelect.dispatchEvent(new Event('change'));
        }
        stateManager.setState({ outputFormat: 'svg' });
        updateStatus('Generating SVGâ€¦ (auto-switched from STL for 2D output)');
      }

      // Use auto-preview controller for full render if available (STL only for now)
      if (autoPreviewController && outputFormat === 'stl') {
        result = await autoPreviewController.renderFull(state.parameters, {
          ...(exportQualityPreset ? { quality: exportQualityPreset } : {}),
        });

        if (result.cached) {
          console.log('[Download] Using cached full quality render');
        }
      } else {
        // Direct render with specified format
        // Pass files/mainFile/libraries for multi-file projects
        const libsForRender = getEnabledLibrariesForRender();
        // For 2D formats, use schema-aware parameter resolution so models that
        // require a specific 'generate' (or equivalent) value produce 2D geometry.
        const renderParameters = resolve2DExportParameters(
          state.parameters,
          state.schema,
          outputFormat
        );
        const renderOptions = {
          outputFormat,
          paramTypes: state.paramTypes || {},
          files: state.projectFiles,
          mainFile: state.mainFilePath,
          libraries: libsForRender,
          ...(exportQualityPreset ? { quality: exportQualityPreset } : {}),
          onProgress: (_percent, _message) => {
            const fn =
              OUTPUT_FORMATS[outputFormat]?.name || outputFormat.toUpperCase();
            updateStatus(`Generating ${fn}...`);
          },
        };
        try {
          result = await renderController.renderFull(
            state.uploadedFile.content,
            renderParameters,
            renderOptions
          );
        } catch (renderErr) {
          if (renderErr.code === 'MODEL_NOT_2D') {
            updateStatus(
              `Model produces 3D geometry â€” projecting to ${outputFormat.toUpperCase()}...`
            );
            result = await renderController.render2DFallback(
              state.uploadedFile.content,
              renderParameters,
              renderOptions
            );
          } else {
            throw renderErr;
          }
        }
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);

      // Store the hash of parameters used for this generation
      lastGeneratedParamsHash = hashParams(state.parameters);

      const outputData = result.data || result.stl;
      const resolvedFormat = result.format || outputFormat;
      stateManager.setState({
        generatedOutput: {
          data: outputData,
          format: resolvedFormat,
          stats: result.stats,
          paramsHash: lastGeneratedParamsHash,
        },
        stl: outputData,
        outputFormat: resolvedFormat,
        stlStats: result.stats,
        lastRenderTime: duration,
      });

      // Display the result in the preview panel.
      // 2D formats (SVG) get a native rendered SVG viewer;
      // 3D formats are loaded into the Three.js viewer.
      const is2DFormat = OUTPUT_FORMATS[outputFormat]?.is2D;
      if (is2DFormat && resolvedFormat === 'svg' && previewManager) {
        try {
          let svgText =
            typeof outputData === 'string'
              ? outputData
              : new TextDecoder().decode(outputData);

          // Pre-inject F6-render parity styling: #07D0A7 teal fill, #FF0603 red outlines.
          const renderStyle =
            '<style data-forge-preview="true">' +
            'path,polygon,polyline,circle,ellipse,rect{fill:#07D0A7;stroke:#FF0603;stroke-width:0.5;fill-opacity:1}' +
            'line{stroke:#FF0603;stroke-width:0.5}' +
            '</style>';
          svgText = svgText.replace(/(<svg[^>]*>)/i, '$1' + renderStyle);

          if (typeof previewManager.show2DPreviewAs3DPlane === 'function') {
            await previewManager.show2DPreviewAs3DPlane(svgText, {
              mode: 'rendered',
            });
          } else {
            previewManager.show2DPreview(svgText, { mode: 'rendered' });
          }
        } catch (previewErr) {
          console.warn('[Generate] Failed to show 2D preview:', previewErr);
        }
      } else if (
        !autoPreviewController &&
        previewManager &&
        outputData &&
        !is2DFormat
      ) {
        try {
          if (previewManager.setRenderState) {
            previewManager.setRenderState(null);
          }
          previewManager.hide2DPreview();
          await previewManager.loadSTL(outputData, { preserveCamera: false });
          hfmCtrl.clearPersistence();
        } catch (loadErr) {
          console.warn('[Generate] Failed to load STL into preview:', loadErr);
        }
      } else if (previewManager && !is2DFormat) {
        previewManager.hide2DPreview();
      }

      // Store console output for the Console panel (echo/warning/error display)
      if (
        result.consoleOutput &&
        typeof window.updateConsoleOutput === 'function'
      ) {
        window.updateConsoleOutput(result.consoleOutput);
      }

      // Update detailed stats in drawer (not in status bar overlay)
      const triangleInfo =
        result.stats.triangles > 0
          ? ` | Triangles: ${result.stats.triangles.toLocaleString()}`
          : '';
      statsArea.innerHTML = `<span class="stats-quality full">Full Quality ${formatName}</span> Size: ${formatFileSize(result.stats.size)}${triangleInfo} | Time: ${duration}s`;

      // Update the preview status bar with minimal stats
      updatePreviewStats(result.stats, true);

      console.log('Full render complete:', result.stats);

      // Log performance metrics
      logRenderPerformance(result);

      // Simple status - ready to download (use 'success' type to keep visible)
      // Use correct format name instead of hardcoded "STL"
      updateStatus(`${formatName} ready`, 'success');

      // Update preview state to show full quality
      updatePreviewStateUI(PREVIEW_STATE.CURRENT, {
        stats: result.stats,
        fullQuality: true,
      });
    } catch (error) {
      console.error('Generation failed:', error);
      updatePreviewStateUI(PREVIEW_STATE.ERROR, {
        error: error.message,
      });
      if (typeof window.addStructuredError === 'function') {
        window.addStructuredError(error?.message || 'Generation failed');
      }

      // Extract OpenSCAD console output embedded in error.details and surface it
      // to the Console panel. This is how missing-include warnings reach the user.
      if (error.details && typeof window.updateConsoleOutput === 'function') {
        const outputMarker = '[OpenSCAD output]';
        const markerIdx = error.details.indexOf(outputMarker);
        if (markerIdx !== -1) {
          const embeddedOutput = error.details
            .slice(markerIdx + outputMarker.length)
            .trim();
          if (embeddedOutput) {
            window.updateConsoleOutput(embeddedOutput);
          }
        }
      }

      // Special-case: configuration dependency / empty geometry guidance
      if (handleConfigDependencyError(error)) {
        return;
      }

      // Special-case: SVG/DXF export failures â€” 3D geometry produced when 2D is required.
      // Guide the user to the specific 'generate' parameter that controls the output mode.
      const currentFormat = outputFormatSelect?.value || 'stl';
      if (currentFormat === 'svg' || currentFormat === 'dxf') {
        const msg = (error?.message || '').toLowerCase();
        const is2DGeometryError =
          error?.code === 'MODEL_NOT_2D' ||
          msg.includes('not a 2d') ||
          msg.includes('3d geometry but svg') ||
          msg.includes('3d geometry but dxf') ||
          msg.includes('no geometry') ||
          msg.includes('empty') ||
          msg.includes('missing') ||
          msg.includes('svgcontains no geometry') ||
          msg.includes('svg output is empty') ||
          msg.includes('dxf output is empty');
        if (is2DGeometryError) {
          const currentState = stateManager.getState();
          const schemaParams = currentState.schema?.parameters || {};
          const generateParam = schemaParams.generate;
          const currentParams = currentState.parameters || {};

          // Determine the actual generate value from state (more reliable than echo parsing)
          const actualGenerateValue = currentParams.generate ?? null;

          // Locate the generate parameter in the UI for the "Take me to the setting" button.
          const generateTargetKey = locateParameterKey('generate', {
            labelHint: 'generate',
          });

          let twoDDisplayName = null;
          if (generateParam?.enum) {
            const twoDOption = generateParam.enum.find((entry) => {
              const v = String(
                typeof entry === 'object' ? entry.value : entry
              ).toLowerCase();
              const l =
                typeof entry === 'object' && entry.label
                  ? String(entry.label).toLowerCase()
                  : v;
              return (
                v.includes('svg') ||
                v.includes('dxf') ||
                v.includes('first layer') ||
                l.includes('svg') ||
                l.includes('dxf') ||
                l.includes('first layer')
              );
            });
            if (twoDOption) {
              twoDDisplayName =
                typeof twoDOption === 'object' && twoDOption.label
                  ? twoDOption.label
                  : typeof twoDOption === 'object'
                    ? twoDOption.value
                    : twoDOption;
            }
          }

          // Check if generate is already set to a 2D-compatible value.
          // If so, the issue is a rendering engine limitation, not a settings problem.
          const actualLower = String(actualGenerateValue ?? '').toLowerCase();
          const alreadySet2D =
            actualLower.includes('svg') ||
            actualLower.includes('dxf') ||
            actualLower.includes('first layer');

          updateStatus(
            `Error: ${currentFormat.toUpperCase()} export requires 2D geometry`
          );

          if (alreadySet2D) {
            const userMessage =
              `${currentFormat.toUpperCase()} Export Issue\n\n` +
              `The "${actualGenerateValue}" setting is selected, but the rendering engine ` +
              `could not produce 2D geometry. This can happen due to browser-based rendering ` +
              `limitations with complex models.\n\n` +
              `Try: Re-generate, or export the 3D model as STL and use desktop OpenSCAD ` +
              `for SVG/DXF export.`;
            alert(userMessage);
          } else {
            showDependencyGuidanceModal({
              label: 'generate',
              current: actualGenerateValue,
              suggested: twoDDisplayName,
              targetKey: generateTargetKey,
            });
          }
          return;
        }
      }

      // Use COGA-compliant friendly error translation
      const friendlyError = translateError(error.message);
      updateStatus(`Error: ${friendlyError.title}`);
      _announceError(
        `Error: ${friendlyError.title}. ${friendlyError.explanation}`
      );

      // Show user-friendly error in alert (using translated message)
      const userMessage = `${friendlyError.title}\n\n${friendlyError.explanation}\n\nTry: ${friendlyError.suggestion}`;

      alert(userMessage);
    } finally {
      primaryActionBtn.disabled = false;
      // Hide cancel button
      cancelRenderBtn.classList.add('hidden');
      // Re-enable undo/redo after rendering
      stateManager.setHistoryEnabled(true);
      // Always restore button to correct state based on current conditions
      updatePrimaryActionButton();
    }
  });

  // Cancel render button
  cancelRenderBtn.addEventListener('click', () => {
    if (renderController) {
      renderController.cancel();
      updateStatus('Generation cancelled by user');
      cancelRenderBtn.classList.add('hidden');
      primaryActionBtn.disabled = false;
      // Re-enable undo/redo after cancellation
      stateManager.setHistoryEnabled(true);
      updatePrimaryActionButton();
    }
  });

  // Fallback download link (for when parameters changed but old STL still exists)
  downloadFallbackLink.addEventListener('click', (e) => {
    e.preventDefault();
    const state = stateManager.getState();

    if (!state.stl) {
      return;
    }

    const filename = generateFilename(
      state.uploadedFile.name,
      state.parameters
    );

    downloadSTL(state.stl, filename);
    updateStatus(`Downloaded (previous STL): ${filename}`);
  });

  // Export Parameters button
  const exportParamsBtn = document.getElementById('exportParamsBtn');
  if (exportParamsBtn) {
    exportParamsBtn.addEventListener('click', () => {
      const state = stateManager.getState();

      if (!state.uploadedFile) {
        alert('No file uploaded yet');
        return;
      }

      // Create JSON snapshot
      const snapshot = {
        version: '1.0.0',
        model: state.uploadedFile.name,
        timestamp: new Date().toISOString(),
        parameters: state.parameters,
      };

      const json = JSON.stringify(snapshot, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `${state.uploadedFile.name.replace('.scad', '')}-params.json`;
      a.click();

      URL.revokeObjectURL(url);
      updateStatus(`Parameters exported to JSON`);
    });
  }

  // ========== PUBLISH PROJECT ==========

  const publishProjectBtn = document.getElementById('publishProjectBtn');
  const publishProjectModal = document.getElementById('publishProjectModal');
  const publishModalClose = document.getElementById('publishModalClose');
  const publishModalOverlay = document.getElementById('publishModalOverlay');
  const publishManifestOutput = document.getElementById(
    'publishManifestOutput'
  );
  const copyManifestBtn = document.getElementById('copyManifestBtn');
  const publishRepoUrl = document.getElementById('publishRepoUrl');
  const publishShareLinkContainer = document.getElementById(
    'publishShareLinkContainer'
  );
  const publishShareLink = document.getElementById('publishShareLink');
  const copyShareLinkBtn = document.getElementById('copyShareLinkBtn');

  /**
   * Generate a forge-manifest.json from the current project state.
   * @returns {Object} Manifest object
   */
  function generateManifestFromProject() {
    const state = stateManager.getState();
    const fileName = state.uploadedFile?.name || 'design.scad';

    const manifest = {
      forgeManifest: '1.0',
      name: fileName.replace(/\.scad$/i, ''),
      files: {
        main: fileName,
      },
    };

    // Add companion files from the project
    if (state.projectFiles && state.projectFiles.size > 0) {
      const companions = [];
      const presets = [];

      for (const filePath of state.projectFiles.keys()) {
        // Skip the main .scad file
        if (filePath === fileName) continue;

        if (filePath.toLowerCase().endsWith('.json')) {
          presets.push(filePath);
        } else if (!filePath.toLowerCase().endsWith('.scad')) {
          companions.push(filePath);
        } else {
          // Secondary .scad files are companions (included via use/include)
          companions.push(filePath);
        }
      }

      if (companions.length > 0) {
        manifest.files.companions = companions;
      }
      if (presets.length > 0) {
        manifest.files.presets = presets.length === 1 ? presets[0] : presets;
      }
    }

    // Add defaults
    manifest.defaults = {
      autoPreview: true,
    };

    // If a preset is currently selected, include it as the default
    if (
      state.currentPresetName &&
      state.currentPresetName !== 'design default values'
    ) {
      manifest.defaults.preset = state.currentPresetName;
    }

    // Include UI mode preferences so shared links apply the same panel visibility
    const uiModePrefs = getUIModeController().getPreferencesForExport();
    if (uiModePrefs.defaultMode !== 'advanced') {
      manifest.defaults.uiMode = uiModePrefs.defaultMode;
    }
    const registryDefaults = getUIModeController()
      .getRegistry()
      .filter((p) => p.defaultHiddenInBasic)
      .map((p) => p.id);
    const prefsChanged =
      JSON.stringify(uiModePrefs.hiddenPanelsInBasic.sort()) !==
      JSON.stringify(registryDefaults.sort());
    if (prefsChanged) {
      manifest.defaults.hiddenPanels = uiModePrefs.hiddenPanelsInBasic;
    }

    return manifest;
  }

  if (publishProjectBtn && publishProjectModal) {
    publishProjectBtn.addEventListener('click', () => {
      const state = stateManager.getState();
      if (!state.uploadedFile) {
        alert('No file uploaded yet. Upload a .scad or .zip file first.');
        return;
      }

      const manifest = generateManifestFromProject();
      const manifestJson = JSON.stringify(manifest, null, 2);

      if (publishManifestOutput) {
        publishManifestOutput.textContent = manifestJson;
      }

      // Reset the shareable link section
      if (publishShareLinkContainer) {
        publishShareLinkContainer.classList.add('hidden');
      }
      if (publishRepoUrl) {
        publishRepoUrl.value = '';
      }

      openModal(publishProjectModal);
    });

    // Close handlers
    if (publishModalClose) {
      publishModalClose.addEventListener('click', () =>
        closeModal(publishProjectModal)
      );
    }
    if (publishModalOverlay) {
      publishModalOverlay.addEventListener('click', () =>
        closeModal(publishProjectModal)
      );
    }

    // Copy manifest button
    if (copyManifestBtn && publishManifestOutput) {
      copyManifestBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(
            publishManifestOutput.textContent
          );
          const textSpan =
            copyManifestBtn.querySelector('.btn-text') || copyManifestBtn;
          const original = textSpan.textContent;
          textSpan.textContent = 'Copied!';
          setTimeout(() => {
            textSpan.textContent = original;
          }, 2000);
          updateStatus('Manifest copied to clipboard');
        } catch (_err) {
          prompt('Copy this manifest JSON:', publishManifestOutput.textContent);
        }
      });
    }

    // Generate shareable link when repo URL changes
    if (publishRepoUrl && publishShareLink && publishShareLinkContainer) {
      publishRepoUrl.addEventListener('input', () => {
        let baseUrl = publishRepoUrl.value.trim();
        if (!baseUrl) {
          publishShareLinkContainer.classList.add('hidden');
          return;
        }

        // Ensure trailing slash
        if (!baseUrl.endsWith('/')) {
          baseUrl += '/';
        }

        const manifestUrl = `${baseUrl}forge-manifest.json`;
        const forgeBase = window.location.origin + window.location.pathname;
        const shareUrl = `${forgeBase}?manifest=${encodeURIComponent(manifestUrl)}`;

        publishShareLink.value = shareUrl;
        publishShareLinkContainer.classList.remove('hidden');
      });
    }

    // Copy shareable link button
    if (copyShareLinkBtn && publishShareLink) {
      copyShareLinkBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(publishShareLink.value);
          copyShareLinkBtn.textContent = 'Copied!';
          setTimeout(() => {
            copyShareLinkBtn.textContent = 'Copy';
          }, 2000);
          updateStatus('Shareable link copied to clipboard');
        } catch (_err) {
          prompt('Copy this link:', publishShareLink.value);
        }
      });
    }
  }

  // ========== RENDER QUEUE ==========

  // Initialize render queue
  renderQueue = new RenderQueue(renderController, {
    maxQueueSize: 20,
  });

  // Render Queue UI elements
  const queueBadge = document.getElementById('queueBadge');
  const addToQueueBtn = document.getElementById('addToQueueBtn');
  const viewQueueBtn = document.getElementById('viewQueueBtn');
  const queueModal = document.getElementById('renderQueueModal');
  const queueModalClose = document.getElementById('queueModalClose');
  const queueModalOverlay = document.getElementById('queueModalOverlay');
  const queueList = document.getElementById('queueList');
  const queueEmpty = document.getElementById('queueEmpty');
  const processQueueBtn = document.getElementById('processQueueBtn');
  const stopQueueBtn = document.getElementById('stopQueueBtn');
  const clearCompletedBtn = document.getElementById('clearCompletedBtn');
  const clearQueueBtn = document.getElementById('clearQueueBtn');
  const exportQueueBtn = document.getElementById('exportQueueBtn');
  const importQueueBtn = document.getElementById('importQueueBtn');
  const queueImportInput = document.getElementById('queueImportInput');
  const queueStatsTotal = document.getElementById('queueStatsTotal');
  const queueStatsQueued = document.getElementById('queueStatsQueued');
  const queueStatsRendering = document.getElementById('queueStatsRendering');
  const queueStatsComplete = document.getElementById('queueStatsComplete');
  const queueStatsError = document.getElementById('queueStatsError');

  // Update queue badge
  function updateQueueBadge() {
    const count = renderQueue.getJobCount();
    if (queueBadge) {
      queueBadge.textContent = count;
    }
  }

  // Update queue statistics
  function updateQueueStats() {
    const stats = renderQueue.getStatistics();
    if (queueStatsTotal) queueStatsTotal.textContent = stats.total;
    if (queueStatsQueued) queueStatsQueued.textContent = stats.queued;
    if (queueStatsRendering) queueStatsRendering.textContent = stats.rendering;
    if (queueStatsComplete) queueStatsComplete.textContent = stats.complete;
    if (queueStatsError) queueStatsError.textContent = stats.error;
  }

  // Render queue list UI
  function renderQueueList() {
    if (!queueList) return;

    const jobs = renderQueue.getAllJobs();

    if (jobs.length === 0) {
      queueEmpty.classList.remove('hidden');
      return;
    }

    queueEmpty.classList.add('hidden');

    // Clear existing items
    Array.from(queueList.children).forEach((child) => {
      if (!child.classList.contains('queue-empty')) {
        child.remove();
      }
    });

    // Render each job
    jobs.forEach((job) => {
      const jobElement = createQueueJobElement(job);
      queueList.appendChild(jobElement);
    });

    updateQueueStats();
  }

  // Create a queue job element
  function createQueueJobElement(job) {
    const div = document.createElement('div');
    div.className = `queue-item queue-item-${job.state}`;
    div.setAttribute('role', 'listitem');
    div.dataset.jobId = job.id;

    const stateIcon =
      {
        queued: 'â³',
        rendering: 'âš™ï¸',
        complete: 'âœ…',
        error: 'âŒ',
        cancelled: 'â¹ï¸',
      }[job.state] || 'â“';

    const formatName =
      OUTPUT_FORMATS[job.outputFormat]?.name || job.outputFormat.toUpperCase();

    div.innerHTML = `
      <div class="queue-item-header">
        <span class="queue-item-icon">${stateIcon}</span>
        <span class="queue-item-name" contenteditable="${job.state === 'queued' ? 'true' : 'false'}" data-job-id="${job.id}">${job.name}</span>
        <span class="queue-item-format">${formatName}</span>
        <span class="queue-item-state">${job.state}</span>
      </div>
      <div class="queue-item-body">
        ${job.error ? `<div class="queue-item-error">${job.error}</div>` : ''}
        ${job.renderTime ? `<div class="queue-item-time">Render time: ${(job.renderTime / 1000).toFixed(1)}s</div>` : ''}
        ${job.result?.stats?.triangles ? `<div class="queue-item-stats">${job.result.stats.triangles.toLocaleString()} triangles</div>` : ''}
      </div>
      <div class="queue-item-actions">
        ${job.state === 'complete' ? `<button class="btn btn-sm btn-primary" data-action="download" data-job-id="${job.id}" aria-label="Download ${job.name}">ðŸ“¥ Download</button>` : ''}
        ${job.state === 'queued' ? `<button class="btn btn-sm btn-outline" data-action="edit" data-job-id="${job.id}" aria-label="Edit ${job.name} parameters">âœï¸ Edit</button>` : ''}
        ${job.state === 'queued' ? `<button class="btn btn-sm btn-outline" data-action="cancel" data-job-id="${job.id}" aria-label="Cancel ${job.name}">â¹ï¸ Cancel</button>` : ''}
        ${job.state !== 'rendering' ? `<button class="btn btn-sm btn-outline" data-action="remove" data-job-id="${job.id}" aria-label="Remove ${job.name}">ðŸ—‘ï¸ Remove</button>` : ''}
      </div>
    `;

    return div;
  }

  // Subscribe to queue changes
  renderQueue.subscribe((event, data) => {
    updateQueueBadge();

    if (queueModal && !queueModal.classList.contains('hidden')) {
      renderQueueList();
    }

    // Handle processing events
    if (event === 'processing-start') {
      if (processQueueBtn) {
        processQueueBtn.classList.add('hidden');
      }
      if (stopQueueBtn) {
        stopQueueBtn.classList.remove('hidden');
      }
    } else if (
      event === 'processing-complete' ||
      event === 'processing-stopped'
    ) {
      if (processQueueBtn) {
        processQueueBtn.classList.remove('hidden');
      }
      if (stopQueueBtn) {
        stopQueueBtn.classList.add('hidden');
      }

      if (event === 'processing-complete') {
        updateStatus(
          `Queue processing complete: ${data.completed} succeeded, ${data.failed} failed`
        );
      }
    }
  });

  // Add to Queue button
  addToQueueBtn?.addEventListener('click', () => {
    const state = stateManager.getState();

    if (!state.uploadedFile) {
      alert('No file uploaded yet');
      return;
    }

    if (renderQueue.isAtMaxCapacity()) {
      alert('Queue is full (maximum 20 jobs)');
      return;
    }

    // Get current output format
    const outputFormat = outputFormatSelect?.value || 'stl';
    const count = renderQueue.getJobCount() + 1;
    const jobName = `Job ${count}`;

    // Set project for queue
    const libsForRender = getEnabledLibrariesForRender();
    renderQueue.setProject(
      state.uploadedFile.content,
      state.projectFiles,
      state.mainFilePath,
      libsForRender
    );

    // Add job
    const jobId = renderQueue.addJob(jobName, state.parameters, outputFormat);
    console.log(`Added job ${jobId} to queue`);

    updateStatus(`Added "${jobName}" to render queue`);
  });

  // View Queue button
  viewQueueBtn?.addEventListener('click', () => {
    if (queueModal) {
      queueModal.classList.remove('hidden');
      renderQueueList();
    }
  });

  // Close modal handlers
  queueModalClose?.addEventListener('click', () => {
    if (queueModal) {
      queueModal.classList.add('hidden');
    }
  });

  queueModalOverlay?.addEventListener('click', () => {
    if (queueModal) {
      queueModal.classList.add('hidden');
    }
  });

  // Process Queue button
  processQueueBtn?.addEventListener('click', async () => {
    try {
      await renderQueue.processQueue();
    } catch (error) {
      console.error('Queue processing error:', error);
      updateStatus(`Queue processing error: ${error.message}`);
    }
  });

  // Stop Queue button
  stopQueueBtn?.addEventListener('click', () => {
    renderQueue.stopProcessing();
    updateStatus('Queue processing stopped');
  });

  // Clear Completed button
  clearCompletedBtn?.addEventListener('click', () => {
    renderQueue.clearCompleted();
    renderQueueList();
    updateStatus('Cleared completed jobs');
  });

  // Clear All button
  clearQueueBtn?.addEventListener('click', () => {
    if (renderQueue.isQueueProcessing()) {
      alert('Cannot clear queue while processing');
      return;
    }

    if (renderQueue.getJobCount() === 0) {
      return;
    }

    if (confirm('Are you sure you want to clear all jobs from the queue?')) {
      renderQueue.clearAll();
      renderQueueList();
      updateStatus('Cleared all jobs');
    }
  });

  // Export Queue button
  exportQueueBtn?.addEventListener('click', () => {
    const data = renderQueue.exportQueue();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `render-queue-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    updateStatus('Exported queue to JSON');
  });

  // Import Queue button
  importQueueBtn?.addEventListener('click', () => {
    queueImportInput?.click();
  });

  // Queue import handler
  queueImportInput?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      renderQueue.importQueue(data);
      renderQueueList();
      updateStatus('Imported queue from JSON');
    } catch (error) {
      console.error('Queue import error:', error);
      alert('Failed to import queue: ' + error.message);
    }

    // Clear file input
    queueImportInput.value = '';
  });

  // Queue item action handlers (event delegation)
  queueList?.addEventListener('click', async (e) => {
    const button = e.target.closest('button[data-action]');
    if (!button) return;

    const action = button.dataset.action;
    const jobId = button.dataset.jobId;
    const job = renderQueue.getJob(jobId);

    if (!job) return;

    switch (action) {
      case 'download':
        if (job.result?.data) {
          const state = stateManager.getState();
          const filename = generateFilename(
            `${state.uploadedFile.name.replace('.scad', '')}-${job.name}`,
            job.parameters,
            job.outputFormat
          );
          downloadFile(job.result.data, filename, job.outputFormat);
          updateStatus(`Downloaded: ${filename}`);
        }
        break;

      case 'edit': {
        // Close modal and load job parameters
        queueModal.classList.add('hidden');
        stateManager.setState({ parameters: { ...job.parameters } });

        // Re-render parameter UI
        const editState = stateManager.getState();
        if (editState.schema) {
          const parametersContainer = document.getElementById(
            'parametersContainer'
          );
          renderParameterUI(editState.schema, parametersContainer, (values) => {
            stateManager.setState({ parameters: values });
            if (autoPreviewController && editState.uploadedFile) {
              autoPreviewController.onParameterChange(values);
            }
            updatePrimaryActionButton();
          });
        }

        updateStatus(`Editing ${job.name} parameters`);
        break;
      }

      case 'cancel':
        renderQueue.cancelJob(jobId);
        renderQueueList();
        break;

      case 'remove':
        try {
          renderQueue.removeJob(jobId);
          renderQueueList();
        } catch (error) {
          alert(error.message);
        }
        break;
    }
  });

  // Job name editing (contenteditable)
  queueList?.addEventListener(
    'blur',
    (e) => {
      if (
        e.target.classList.contains('queue-item-name') &&
        e.target.hasAttribute('contenteditable')
      ) {
        const jobId = e.target.dataset.jobId;
        const newName = e.target.textContent.trim();

        if (newName) {
          renderQueue.renameJob(jobId, newName);
        } else {
          // Restore original name if empty
          const job = renderQueue.getJob(jobId);
          e.target.textContent = job.name;
        }
      }
    },
    true
  );

  // ========== COMPARISON MODE ==========

  // Initialize comparison controller
  // Pass getter function to handle lazy renderController initialization
  comparisonController = new ComparisonController(
    stateManager,
    () => renderController,
    {
      maxVariants: 10,
    }
  );

  const comparisonViewContainer = document.getElementById('comparisonView');
  comparisonView = new ComparisonView(
    comparisonViewContainer,
    comparisonController,
    {
      theme: themeManager.getActiveTheme(),
      highContrast: themeManager.highContrast,
    }
  );

  // Listen to theme changes and update comparison view
  themeManager.addListener((_themePref, activeTheme, highContrast) => {
    if (comparisonView) {
      comparisonView.updateTheme(activeTheme, highContrast);
    }
  });

  // Add to Comparison button
  const addToComparisonBtn = document.getElementById('addToComparisonBtn');
  addToComparisonBtn?.addEventListener('click', () => {
    const state = stateManager.getState();

    if (!state.uploadedFile) {
      alert('No file uploaded yet');
      return;
    }

    // Check if at max capacity - if so, just enter comparison mode without adding
    if (comparisonController.isAtMaxCapacity()) {
      enterComparisonMode();
      updateStatus('Entered comparison mode (at max variants)');
      return;
    }

    // CRITICAL: Set project content BEFORE adding variant to avoid race condition
    // The ComparisonView subscription will try to auto-render when variant is added
    const libsForRender = getEnabledLibrariesForRender();
    comparisonController.setProject(
      state.uploadedFile.content,
      state.projectFiles,
      state.mainFilePath,
      libsForRender
    );

    // Generate variant name
    const count = comparisonController.getVariantCount() + 1;
    const variantName = `Variant ${count}`;

    // Add variant (now safe because project is already set)
    const variantId = comparisonController.addVariant(
      variantName,
      state.parameters
    );
    console.log(`Added variant ${variantId}:`, variantName);

    // Switch to comparison mode (setProject will be called again but that's fine)
    enterComparisonMode();

    updateStatus(`Added "${variantName}" to comparison`);
  });

  // Comparison mode event listeners
  window.addEventListener('comparison:add-variant', (e) => {
    const state = stateManager.getState();
    if (!state.uploadedFile) return;

    // Ensure project is set before adding variant (in case called from comparison view)
    const libsForRender = getEnabledLibrariesForRender();
    comparisonController.setProject(
      state.uploadedFile.content,
      state.projectFiles,
      state.mainFilePath,
      libsForRender
    );

    const count = comparisonController.getVariantCount() + 1;
    const providedName = e?.detail?.variantName;
    const variantName =
      typeof providedName === 'string' && providedName.trim()
        ? providedName.trim()
        : `Variant ${count}`;

    comparisonController.addVariant(variantName, state.parameters);

    updateStatus(`Added "${variantName}" to comparison`);
  });

  window.addEventListener('comparison:exit', () => {
    exitComparisonMode();
  });

  window.addEventListener('comparison:download-variant', (e) => {
    const { variant } = e.detail;
    if (variant && variant.stl) {
      const state = stateManager.getState();
      const filename = generateFilename(
        `${state.uploadedFile.name.replace('.scad', '')}-${variant.name}`,
        variant.parameters
      );

      // Get selected output format
      const format = outputFormatSelect ? outputFormatSelect.value : 'stl';
      downloadFile(variant.stl, filename, format);
      updateStatus(`Downloaded: ${filename}`);
    }
  });

  window.addEventListener('comparison:edit-variant', (e) => {
    const { variantId } = e.detail;
    const variant = comparisonController.getVariant(variantId);

    if (variant) {
      // Exit comparison mode and load variant parameters
      exitComparisonMode();
      stateManager.setState({ parameters: { ...variant.parameters } });

      // Re-render parameter UI
      const state = stateManager.getState();
      if (state.schema) {
        renderParameterUI(state.schema, state.parameters);
      }

      updateStatus(`Editing ${variant.name}`);
    }
  });

  function enterComparisonMode() {
    const state = stateManager.getState();
    stateManager.setState({ comparisonMode: true });

    // Set project content for comparison controller
    const libsForRender = getEnabledLibrariesForRender();
    comparisonController.setProject(
      state.uploadedFile.content,
      state.projectFiles,
      state.mainFilePath,
      libsForRender
    );

    // Hide main interface, show comparison view
    mainInterface.classList.add('hidden');
    comparisonViewContainer.classList.remove('hidden');

    // Initialize comparison view
    comparisonView.init();

    console.log('[Comparison] Entered comparison mode');
  }

  function exitComparisonMode() {
    const state = stateManager.getState();
    stateManager.setState({ comparisonMode: false });

    // Always hide comparison view
    comparisonViewContainer.classList.add('hidden');

    // Show appropriate screen based on whether a file is loaded
    if (state.uploadedFile) {
      // File is loaded - show main interface, hide welcome screen
      mainInterface.classList.remove('hidden');
      welcomeScreen.classList.add('hidden');
    } else {
      // No file loaded - show welcome screen, hide main interface
      mainInterface.classList.add('hidden');
      welcomeScreen.classList.remove('hidden');
    }

    // Optionally clear variants or keep them
    // comparisonController.clearAll();

    console.log('[Comparison] Exited comparison mode');
    updateStatus('Exited comparison mode');
  }

  // Handle browser back/forward button while in comparison mode
  window.addEventListener('popstate', () => {
    const state = stateManager.getState();
    if (state.comparisonMode) {
      // Exit comparison mode when user navigates back
      exitComparisonMode();
    }
  });

  // ========== PRESET SYSTEM ==========
  // OpenSCAD Customizer-compatible preset management
  // Preset controls: Save = update current, + = new, - = delete

  // "design default values" -- always first in preset dropdown (desktop OpenSCAD parity)
  // Virtual preset ID for the immutable defaults entry (not stored in PresetManager)
  const DESIGN_DEFAULTS_ID = '__design_defaults__';
  const PRESET_SORT_KEY = 'openscad-forge-preset-sort';

  // Searchable combobox instance (non-null only when searchable_combobox flag is on)
  let _presetCombobox = null;

  const stableStringify = (value) => {
    const seen = new WeakSet();
    const normalize = (val) => {
      if (Array.isArray(val)) {
        return val.map(normalize);
      }
      if (val && typeof val === 'object') {
        if (seen.has(val)) {
          return null;
        }
        seen.add(val);
        return Object.keys(val)
          .sort()
          .reduce((acc, key) => {
            acc[key] = normalize(val[key]);
            return acc;
          }, {});
      }
      return val;
    };
    return JSON.stringify(normalize(value));
  };

  function buildPresetSignature(params) {
    if (!params) return null;
    const state = stateManager.getState();
    const schemaParams = state.schema?.parameters;
    const normalized = schemaParams
      ? coercePresetValues(params, schemaParams)
      : params;
    return stableStringify(normalized);
  }

  function setCurrentPresetSignature(params) {
    currentPresetSignature = buildPresetSignature(params);
  }

  function doesPresetMatchParams(params) {
    if (!currentPresetSignature || !params) {
      return false;
    }
    return buildPresetSignature(params) === currentPresetSignature;
  }

  function updatePresetDirtyState(currentValues = null) {
    const state = stateManager.getState();
    if (!state.currentPresetId) {
      isPresetDirty = false;
      return;
    }

    const valuesToCheck = currentValues || state.parameters;
    if (!valuesToCheck || !currentPresetSignature) {
      isPresetDirty = true;
      return;
    }

    isPresetDirty = !doesPresetMatchParams(valuesToCheck);
  }

  function forceClearPresetSelection() {
    const state = stateManager.getState();
    const presetSelect = document.getElementById('presetSelect');
    const hasSelection =
      state.currentPresetId || state.currentPresetName || presetSelect?.value;

    // Debug logging to help identify unexpected clears
    if (hasSelection) {
      console.log('[Preset] Clearing selection:', {
        currentPresetId: state.currentPresetId,
        currentPresetName: state.currentPresetName,
        dropdownValue: presetSelect?.value,
        callerStack: new Error().stack?.split('\n').slice(1, 4).join('\n'),
      });
    }

    currentPresetSignature = null;
    isPresetDirty = false;

    if (hasSelection) {
      stateManager.setState({ currentPresetId: null, currentPresetName: null });
      if (presetSelect) {
        presetSelect.value = '';
      }
      updatePresetControlStates();
    }
  }

  /**
   * Update preset control button states based on current selection
   * Implements OpenSCAD Customizer semantics: Save/Delete need selection, Add always works
   */
  function updatePresetControlStates() {
    const state = stateManager.getState();
    const presetSelect = document.getElementById('presetSelect');
    const savePresetBtn = document.getElementById('savePresetBtn');
    const addPresetBtn = document.getElementById('addPresetBtn');
    const deletePresetBtn = document.getElementById('deletePresetBtn');

    const hasPresetSelected = presetSelect && presetSelect.value !== '';
    const hasModel = !!state.uploadedFile;
    // "design default values" is immutable -- save/delete should be disabled
    const isDesignDefaults = presetSelect?.value === DESIGN_DEFAULTS_ID;

    // Save button: enabled when a user preset is selected (not design defaults)
    if (savePresetBtn) {
      savePresetBtn.disabled =
        !hasPresetSelected || !hasModel || isDesignDefaults;
      savePresetBtn.title = isDesignDefaults
        ? 'Design default values cannot be overwritten'
        : !hasPresetSelected
          ? 'Select a preset first to save changes'
          : isPresetDirty
            ? 'Save Preset \u2014 overwrites current preset (unsaved changes)'
            : 'Save Preset \u2014 overwrites current preset';
      savePresetBtn.dataset.dirty = isPresetDirty ? 'true' : 'false';
    }

    // Add button: always enabled when model is loaded
    if (addPresetBtn) {
      addPresetBtn.disabled = !hasModel;
    }

    // Delete button: enabled when a user preset is selected (not design defaults)
    if (deletePresetBtn) {
      deletePresetBtn.disabled =
        !hasPresetSelected || !hasModel || isDesignDefaults;
      deletePresetBtn.title = isDesignDefaults
        ? 'Design default values cannot be deleted'
        : hasPresetSelected
          ? 'Delete current preset'
          : 'Select a preset first to delete';
    }
  }

  function clearPresetSelection(currentValues = null) {
    // OpenSCAD Customizer behavior:
    // Changing parameters does NOT clear the selected preset.
    // We only update whether the current preset has unsaved changes.
    if (isLoadingPreset) {
      return;
    }

    updatePresetDirtyState(currentValues);
    updatePresetControlStates();
  }

  /**
   * Single entry point for applying a preset's parameters AND companion files.
   * Called by both the Manage Presets modal and the preset dropdown so the two
   * code paths stay identical in behaviour (Bug D fix).
   *
   * Responsibilities:
   *  1. Merge visible preset parameters onto current state
   *  2. Re-render parameter UI
   *  3. Apply explicit preset.companionFiles (embedded content, legacy path)
   *  4. Alias-mount preset-specific files from presetCompanionMap (ZIP path)
   *  5. Update auto-preview controller
   *  6. Sync screenshot overlay
   *  7. Track current preset selection and update status
   *
   * @param {Object} preset - Loaded preset with .parameters, .name, .id
   */
  function applyPresetParametersAndCompanions(preset) {
    isLoadingPreset = true;

    const state = stateManager.getState();
    const hiddenNames = new Set(
      Object.keys(state.schema?.hiddenParameters || {})
    );

    // Merge visible preset params onto current state (desktop OpenSCAD parity)
    const visiblePresetParams = {};
    for (const [k, v] of Object.entries(preset.parameters)) {
      if (!hiddenNames.has(k)) visiblePresetParams[k] = v;
    }
    const mergedParams = { ...state.parameters, ...visiblePresetParams };
    stateManager.setState({ parameters: mergedParams });

    // Re-render UI with merged parameters
    const parametersContainer = document.getElementById('parametersContainer');
    renderParameterUI(
      state.schema,
      parametersContainer,
      (values) => {
        stateManager.setState({ parameters: values });
        clearPresetSelection(values);
        if (autoPreviewController) {
          autoPreviewController.onParameterChange(values);
        }
        updatePrimaryActionButton();
        companionFilesCtrl.syncOverlayWithScreenshotParam(values);
      },
      mergedParams
    );

    // Build updated projectFiles from the canonical project snapshot rather than
    // the currently aliased working set, so preset-specific companion files do
    // not bleed into the next preset selection.
    const curState = stateManager.getState();
    const currentProjectFilesForLog = curState.projectFiles
      ? new Map(curState.projectFiles)
      : new Map();
    const newProjectFiles = canonicalProjectFiles
      ? new Map(canonicalProjectFiles)
      : currentProjectFilesForLog;

    // E2: Merge explicit preset.companionFiles (saved presets with embedded content)
    if (
      preset.companionFiles &&
      Object.keys(preset.companionFiles).length > 0
    ) {
      for (const [filename, content] of Object.entries(preset.companionFiles)) {
        newProjectFiles.set(filename, content);
      }
    }

    const companionMapping = presetCompanionMap?.get(preset.name);
    // Alias-mount preset-specific companion files from the ZIP mapping.
    const aliasedFiles = applyCompanionAliases(
      newProjectFiles,
      companionMapping
    );
    if (companionMapping?.aliases) {
      for (const [target, source] of Object.entries(companionMapping.aliases)) {
        if (aliasedFiles.has(target)) {
          console.log(`[Preset] Alias-mounted: ${source} â†’ ${target}`);
        }
      }
    } else {
      // COMPATIBILITY FALLBACK â€” legacy logging for {openingsPath, svgPath}
      if (
        companionMapping?.openingsPath &&
        aliasedFiles.has('openings_and_additions.txt')
      ) {
        console.log(
          `[Preset] Alias-mounted openings: ${companionMapping.openingsPath}`
        );
      }
      if (companionMapping?.svgPath && aliasedFiles.has('default.svg')) {
        console.log(`[Preset] Alias-mounted SVG: ${companionMapping.svgPath}`);
      }
    }

    stateManager.setState({ projectFiles: aliasedFiles });

    // Reset output format to STL when loading a preset whose parameters
    // produce 3D geometry.  Check both the dropdown AND the state because
    // they can desync (e.g. dropdown shows STL but state still says SVG
    // after a welcome-screen round-trip).
    const _fmtSelect = document.getElementById('outputFormat');
    const _stateNeedsReset =
      (stateManager.getState().outputFormat || 'stl') !== 'stl';
    if (_fmtSelect && (_fmtSelect.value !== 'stl' || _stateNeedsReset)) {
      const is2DPreset =
        isNonPreviewable(mergedParams, state.schema) ||
        (typeof mergedParams.generate === 'string' &&
          /svg|dxf|2d|first layer/i.test(mergedParams.generate));
      if (!is2DPreset) {
        _fmtSelect.value = 'stl';
        _fmtSelect.dispatchEvent(new Event('change'));
        stateManager.setState({ outputFormat: 'stl' });
      }
    }

    if (autoPreviewController) {
      autoPreviewController.setProjectFiles(
        aliasedFiles,
        curState.mainFilePath
      );
      autoPreviewController.onParameterChange(mergedParams);
    }

    updatePrimaryActionButton();
    companionFilesCtrl.updateProjectFilesUI();

    // When the preset has a mapped SVG, force-select the aliased overlay
    // in the dropdown. Without this, the dropdown retains the previous
    // preset's SVG path (which still exists in the Map) and autoSelectOverlaySource
    // returns early, leaving the overlay stale.
    const svgTarget = getOverlaySvgTarget(companionMapping);
    if (svgTarget && aliasedFiles.has(svgTarget)) {
      if (overlaySourceSelect) {
        overlaySourceSelect.value = svgTarget;
      }
      overlayGridCtrl.loadOverlayFromProjectFile(svgTarget)
        .then(() => {
          // SVG 96 DPI size applied; SCAD case-opening / screen dims override.
          overlayGridCtrl.autoApplyScreenDimensionsFromParams(mergedParams);
          overlayGridCtrl.updateOverlayUIFromConfig();
        })
        .catch((err) => {
          console.warn('[Preset] Failed to load preset SVG overlay:', err);
        });
    }

    companionFilesCtrl.syncOverlayWithScreenshotParam(mergedParams);
    setCurrentPresetSelection(preset);

    isLoadingPreset = false;

    const applied = Object.keys(visiblePresetParams).length;
    const total = Object.keys(preset.parameters).length;
    if (applied < total) {
      updateStatus(
        `Loaded preset: ${preset.name} (${applied} of ${total} parameters applied)`
      );
    } else {
      updateStatus(`Loaded preset: ${preset.name}`);
    }
  }

  function setCurrentPresetSelection(preset) {
    if (!preset) {
      forceClearPresetSelection();
      return;
    }

    console.log('[Preset] Setting selection:', {
      id: preset.id,
      name: preset.name,
      paramCount: Object.keys(preset.parameters || {}).length,
    });

    setCurrentPresetSignature(preset.parameters);
    isPresetDirty = false;
    stateManager.setState({
      currentPresetId: preset.id,
      currentPresetName: preset.name,
    });
    const presetSelect = document.getElementById('presetSelect');
    if (presetSelect) {
      presetSelect.value = preset.id;
    }
    updatePresetControlStates();
  }

  // Update preset dropdown based on current model
  // Preserves current selection if the preset still exists
  // Applies the user's saved sort preference (shared with Import/Export modal)
  function updatePresetDropdown() {
    const state = stateManager.getState();
    const presetSelect = document.getElementById('presetSelect');

    if (!state.uploadedFile) {
      presetSelect.disabled = true;
      presetSelect.innerHTML =
        '<option value="">-- No model loaded --</option>';
      if (_presetCombobox) {
        _presetCombobox.update([], null);
        _presetCombobox.setDisabled(true);
      }
      currentPresetSignature = null;
      isPresetDirty = false;
      updatePresetControlStates();
      return;
    }

    const modelName = state.uploadedFile.name;
    const currentSortOrder =
      localStorage.getItem(PRESET_SORT_KEY) || 'name-asc';
    const presets = presetManager.getSortedPresets(modelName, currentSortOrder);

    // Remember current selection from state (survives dropdown rebuilds)
    const currentPresetId = state.currentPresetId;

    // Clear and rebuild native select dropdown
    presetSelect.innerHTML = '<option value="">-- Select Preset --</option>';

    // "design default values" is ALWAYS first in dropdown (desktop OpenSCAD parity)
    // This is a virtual preset derived from the .scad source defaults, not stored in PresetManager
    const defaultsOption = document.createElement('option');
    defaultsOption.value = DESIGN_DEFAULTS_ID;
    defaultsOption.textContent = 'design default values';
    defaultsOption.style.fontStyle = 'italic';
    presetSelect.appendChild(defaultsOption);

    if (presets.length > 0) {
      presets.forEach((preset) => {
        if (preset.id === 'design-defaults') return;
        const option = document.createElement('option');
        option.value = preset.id;
        option.textContent = preset.name;
        presetSelect.appendChild(option);
      });
    }

    presetSelect.disabled = false;

    // Sync the sort toolbar dropdown to reflect the active sort order
    const sortSelect = document.getElementById('presetDropdownSort');
    if (sortSelect && sortSelect.value !== currentSortOrder) {
      sortSelect.value = currentSortOrder;
    }

    // Update combobox if the feature flag is on
    if (_presetCombobox) {
      const comboOptions = [
        {
          id: DESIGN_DEFAULTS_ID,
          label: 'design default values',
          italic: true,
        },
        ...presets
          .filter((p) => p.id !== 'design-defaults')
          .map((p) => ({ id: p.id, label: p.name })),
      ];
      _presetCombobox.update(comboOptions, currentPresetId || null);
      _presetCombobox.setDisabled(false);
    }

    // Restore selection if the preset still exists in the list
    if (currentPresetId) {
      const currentPreset = presets.find(
        (preset) => preset.id === currentPresetId
      );
      if (currentPreset) {
        presetSelect.value = currentPresetId;
        setCurrentPresetSignature(currentPreset.parameters);
      } else {
        forceClearPresetSelection();
      }
    } else {
      currentPresetSignature = null;
      isPresetDirty = false;
    }

    updatePresetDirtyState();
    updatePresetControlStates();
  }

  // Show save preset modal
  function showSavePresetModal() {
    const state = stateManager.getState();

    if (!state.uploadedFile) {
      alert('No model loaded');
      return;
    }

    const modal = document.createElement('div');
    modal.className = 'preset-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-labelledby', 'savePresetTitle');
    modal.setAttribute('aria-modal', 'true');

    modal.innerHTML = `
      <div class="preset-modal-content">
        <div class="preset-modal-header">
          <h3 id="savePresetTitle" class="preset-modal-title">Save Preset</h3>
          <button class="preset-modal-close" aria-label="Close dialog" data-action="close">&times;</button>
        </div>
        <form class="preset-form" id="savePresetForm">
          <div class="preset-form-group">
            <label for="presetName" class="preset-form-label">Preset Name *</label>
            <input 
              type="text" 
              id="presetName" 
              class="preset-form-input" 
              placeholder="e.g., Large Handle"
              required
              autofocus
            />
            <span class="preset-form-hint">Give this preset a descriptive name</span>
          </div>
          <div class="preset-form-group">
            <label for="presetDescription" class="preset-form-label">Description (Optional)</label>
            <textarea 
              id="presetDescription" 
              class="preset-form-textarea" 
              placeholder="Optional description of this configuration..."
            ></textarea>
          </div>
          <div class="preset-form-actions">
            <button type="button" class="btn btn-secondary" data-action="close">Cancel</button>
            <button type="submit" class="btn btn-primary">Save Preset</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(modal);

    // Close handler for dynamic modal
    const closeSavePresetModal = () => {
      closeModal(modal);
      document.body.removeChild(modal);
    };

    // Handle form submission
    const form = modal.querySelector('#savePresetForm');
    form?.addEventListener('submit', (e) => {
      e.preventDefault();

      const name = modal.querySelector('#presetName')?.value.trim();
      const description = modal
        .querySelector('#presetDescription')
        ?.value.trim();

      if (!name) {
        alert('Please enter a preset name');
        return;
      }

      // Auto-rename duplicates: "test1" â†’ "test1 (1)" â†’ "test1 (2)" etc.
      const existingPresets = presetManager.getPresetsForModel(
        state.uploadedFile.name
      );
      let finalName = name;
      const existingNames = new Set(existingPresets.map((p) => p.name));
      if (existingNames.has(name)) {
        let counter = 1;
        while (existingNames.has(`${name} (${counter})`)) {
          counter++;
        }
        finalName = `${name} (${counter})`;
      }

      try {
        // E2: Capture companion files (text-only, exclude images and main file)
        const companionSnapshot = {};
        if (state.projectFiles) {
          for (const [path, content] of state.projectFiles.entries()) {
            if (
              path !== state.mainFilePath &&
              typeof content === 'string' &&
              !content.startsWith('data:')
            ) {
              companionSnapshot[path] = content;
            }
          }
        }

        // Save preset and capture returned object (contains id and name)
        const savedPreset = presetManager.savePreset(
          state.uploadedFile.name,
          finalName,
          state.parameters,
          {
            description,
            companionFiles:
              Object.keys(companionSnapshot).length > 0
                ? companionSnapshot
                : null,
          }
        );

        updateStatus(`Preset "${finalName}" saved`);

        // OpenSCAD Customizer behavior:
        // - "+" creates a new preset AND selects it in the dropdown
        // - Save button immediately becomes available to overwrite that preset
        //
        // In practice, the preset dropdown may be rebuilt by subscribers and other UI
        // events around the save; ensure selection is applied after any rebuilds.
        setCurrentPresetSelection(savedPreset);
        updatePresetDropdown();

        const ensurePresetSelected = (presetId) => {
          const presetSelectEl = document.getElementById('presetSelect');
          if (!presetSelectEl) return;

          presetSelectEl.value = presetId;
          updatePresetControlStates();

          // If the option isn't present yet (or a subsequent rebuild overwrote it),
          // retry on the next frame.
          if (presetSelectEl.value !== presetId) {
            console.warn(
              '[Preset] Auto-select did not stick, retrying after rebuild'
            );
            requestAnimationFrame(() => {
              const el = document.getElementById('presetSelect');
              if (!el) return;
              el.value = presetId;
              updatePresetControlStates();
            });
          }
        };

        ensurePresetSelected(savedPreset.id);

        closeSavePresetModal();
      } catch (error) {
        alert(`Failed to save preset: ${error.message}`);
      }
    });

    // Handle close buttons
    modal.querySelectorAll('[data-action="close"]').forEach((btn) => {
      btn.addEventListener('click', closeSavePresetModal);
    });

    // Close on backdrop click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeSavePresetModal();
      }
    });

    // Open modal with focus management (WCAG 2.2 focus trapping)
    openModal(modal, {
      focusTarget: modal.querySelector('#presetName'),
    });
  }

  // Handle the result from importAndMergePresets and refresh the UI
  function _handleImportResult(result, _modelName) {
    if (result.imported > 0 || result.skipped > 0) {
      let message = `Imported ${result.imported} design${result.imported !== 1 ? 's' : ''}`;
      if (result.skipped > 0) {
        message += ` (${result.skipped} skipped â€” duplicate names)`;
      }
      if (result.errors?.length > 0) {
        message += `\n\nErrors:\n${result.errors.join('\n')}`;
      }
      alert(message);
      updatePresetDropdown();
      if (result.presets?.length > 0) {
        const last = result.presets[result.presets.length - 1];
        if (last?.id) setCurrentPresetSelection(last);
      }
      // Close and reopen the manage modal to reflect new list
      const existingModal = document.querySelector('.preset-modal');
      if (existingModal) {
        closeModal(existingModal);
        document.body.removeChild(existingModal);
      }
      showManagePresetsModal();
    } else {
      const errorMsg = result.errors?.length
        ? `Import failed:\n${result.errors.join('\n')}`
        : 'No valid designs found in the selected file(s).';
      alert(errorMsg);
    }
  }

  // Show manage presets modal
  function showManagePresetsModal() {
    const state = stateManager.getState();

    if (!state.uploadedFile) {
      alert('No model loaded');
      return;
    }

    const modelName = state.uploadedFile.name;
    let currentSortOrder = localStorage.getItem(PRESET_SORT_KEY) || 'name-asc';
    const presets = presetManager.getSortedPresets(modelName, currentSortOrder);

    const modal = document.createElement('div');
    modal.className = 'preset-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-labelledby', 'managePresetsTitle');
    modal.setAttribute('aria-modal', 'true');

    const formatDate = (timestamp) => {
      return new Date(timestamp).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    };

    const presetsHTML =
      presets.length === 0
        ? '<div class="preset-empty">No presets saved for this model</div>'
        : presets
            .map(
              (preset) => `
          <div class="preset-item" data-preset-id="${preset.id}">
            <div class="preset-item-info">
              <h4 class="preset-item-name">${preset.name}</h4>
              <p class="preset-item-meta">
                ${preset.description || 'No description'} â€¢ 
                Created ${formatDate(preset.created)}
              </p>
            </div>
            <div class="preset-item-actions">
              <button class="btn btn-sm btn-primary" data-action="load" data-preset-id="${preset.id}" aria-label="Load preset ${preset.name}">
                Load
              </button>
              <button class="btn btn-sm btn-secondary" data-action="export" data-preset-id="${preset.id}" aria-label="Export preset ${preset.name}">
                Export
              </button>
              <button class="btn btn-sm btn-outline" data-action="delete" data-preset-id="${preset.id}" aria-label="Delete preset ${preset.name}">
                Delete
              </button>
            </div>
          </div>
        `
            )
            .join('');

    modal.innerHTML = `
      <div class="preset-modal-content">
        <div class="preset-modal-header">
          <h3 id="managePresetsTitle" class="preset-modal-title">Import / Export Designs (Presets)</h3>
          <button class="preset-modal-close" aria-label="Close dialog" data-action="close">&times;</button>
        </div>
        <div class="preset-import-export-actions" style="display:flex;gap:12px;padding:16px;border-bottom:1px solid var(--border-color, #e0e0e0);">
          <button class="btn btn-primary" data-action="import" style="flex:1;padding:12px;font-size:1em;">
            ðŸ“‚ Import Designs
          </button>
          <button class="btn btn-primary" data-action="export-all" style="flex:1;padding:12px;font-size:1em;">
            ðŸ’¾ Export All Designs
          </button>
        </div>
        ${
          presets.length > 0
            ? `
        <details class="preset-list-details" style="padding:0 16px 16px;">
          <summary style="padding:8px 0;cursor:pointer;color:var(--text-secondary, #666);">
            Individual presets (${presets.length})
          </summary>
          <div class="preset-list-toolbar">
            <label class="preset-sort-label" for="presetSortSelect">Sort</label>
            <select id="presetSortSelect" class="preset-sort-select" aria-label="Sort presets by">
              <option value="name-asc"${currentSortOrder === 'name-asc' ? ' selected' : ''}>Name (Aâ€“Z)</option>
              <option value="name-desc"${currentSortOrder === 'name-desc' ? ' selected' : ''}>Name (Zâ€“A)</option>
              <option value="date-created"${currentSortOrder === 'date-created' ? ' selected' : ''}>Date created (newest)</option>
              <option value="date-modified"${currentSortOrder === 'date-modified' ? ' selected' : ''}>Date modified (newest)</option>
            </select>
          </div>
          <div class="preset-list" id="presetListContainer">
            ${presetsHTML}
          </div>
        </details>
        `
            : '<div class="preset-empty" style="padding:16px;">No designs saved for this model yet. Import a design file or use the + button to create one.</div>'
        }
        <div class="preset-modal-footer">
          <button class="btn btn-outline" data-action="close">Close</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Wire sort selector
    const presetSortSelect = modal.querySelector('#presetSortSelect');
    const presetListContainer = modal.querySelector('#presetListContainer');
    if (presetSortSelect && presetListContainer) {
      presetSortSelect.addEventListener('change', () => {
        currentSortOrder = presetSortSelect.value;
        localStorage.setItem(PRESET_SORT_KEY, currentSortOrder);
        const sorted = presetManager.getSortedPresets(
          modelName,
          currentSortOrder
        );
        presetListContainer.innerHTML = sorted
          .map(
            (preset) => `
          <div class="preset-item" data-preset-id="${preset.id}">
            <div class="preset-item-info">
              <h4 class="preset-item-name">${preset.name}</h4>
              <p class="preset-item-meta">
                ${preset.description || 'No description'} â€¢
                Created ${formatDate(preset.created)}
              </p>
            </div>
            <div class="preset-item-actions">
              <button class="btn btn-sm btn-primary" data-action="load" data-preset-id="${preset.id}" aria-label="Load design ${preset.name}">Load</button>
              <button class="btn btn-sm btn-secondary" data-action="export" data-preset-id="${preset.id}" aria-label="Export design ${preset.name}">Export</button>
              <button class="btn btn-sm btn-outline" data-action="delete" data-preset-id="${preset.id}" aria-label="Delete design ${preset.name}">Delete</button>
            </div>
          </div>`
          )
          .join('');
        // Keep the main preset dropdown in sync with the new sort order
        updatePresetDropdown();
        const label =
          presetSortSelect.options[presetSortSelect.selectedIndex]?.text || '';
        announceImmediate(`Designs sorted by ${label}`);
      });
    }

    // Close handler for dynamic modal
    const closeManagePresetsModalHandler = () => {
      closeModal(modal);
      document.body.removeChild(modal);
    };

    // Handle actions
    modal.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;

      const action = btn.dataset.action;
      const presetId = btn.dataset.presetId;

      if (action === 'close') {
        closeManagePresetsModalHandler();
      } else if (action === 'load') {
        const preset = presetManager.loadPreset(modelName, presetId);
        if (preset) {
          applyPresetParametersAndCompanions(preset);
          closeManagePresetsModalHandler();
        }
      } else if (action === 'delete') {
        const presetToDelete = presetManager.loadPreset(modelName, presetId);
        const presetLabel = presetToDelete?.name || 'this preset';
        const confirmed = await showConfirmDialog(
          `Are you sure you want to delete "<strong>${presetLabel}</strong>"?<br><br>This action <strong>cannot be undone</strong>.`,
          'Delete Preset',
          'Delete',
          'Cancel',
          { destructive: true }
        );
        if (confirmed) {
          presetManager.deletePreset(modelName, presetId);
          updatePresetDropdown();
          closeManagePresetsModalHandler();
          showManagePresetsModal();
        }
      } else if (action === 'export') {
        const json = presetManager.exportPreset(modelName, presetId);
        if (json) {
          const preset = presetManager.loadPreset(modelName, presetId);
          const blob = new Blob([json], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${sanitizeFilename(preset.name)}.json`;
          a.click();
          URL.revokeObjectURL(url);
          updateStatus(`Exported design: ${preset.name}`);
        }
      } else if (action === 'export-all') {
        // Export in OpenSCAD native format (includes "design default values" as first entry)
        // Pass hidden parameters for desktop parity (included in export but not in UI)
        const currentState = stateManager.getState();
        const hiddenParams = currentState.schema?.hiddenParameters || {};
        const json = presetManager.exportOpenSCADNativeFormat(
          modelName,
          hiddenParams
        );
        if (json) {
          const blob = new Blob([json], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${modelName.replace('.scad', '')}-presets.json`;
          a.click();
          URL.revokeObjectURL(url);
          updateStatus('Exported all designs (OpenSCAD native format)');
        } else {
          updateStatus(
            'No designs to export. Create some designs first using the + button.'
          );
        }
      } else if (action === 'import') {
        // Ask user whether to merge with existing presets or replace them all.
        // "Replace" is destructive and always requires confirmation.
        // Import mode dialog: three options mapped to importAndMergePresets strategies
        const importModeDialog = document.createElement('dialog');
        importModeDialog.className = 'preset-import-mode-dialog';
        importModeDialog.setAttribute('aria-labelledby', 'importModeTitle');
        importModeDialog.innerHTML = `
          <form method="dialog" class="import-mode-form">
            <h3 id="importModeTitle" class="import-mode-title">Import designs</h3>
            <fieldset class="import-mode-fieldset">
              <legend class="import-mode-legend">Import mode</legend>
              <label class="import-mode-option">
                <input type="radio" name="importMode" value="merge" checked />
                <span class="import-mode-label">
                  <strong>Merge</strong>
                  <span class="import-mode-desc">Add imported designs; skip any with the same name as existing ones</span>
                </span>
              </label>
              <label class="import-mode-option">
                <input type="radio" name="importMode" value="replace" />
                <span class="import-mode-label">
                  <strong>Replace</strong>
                  <span class="import-mode-desc">Delete all existing designs for this model, then import</span>
                </span>
              </label>
              <label class="import-mode-option">
                <input type="radio" name="importMode" value="copies" />
                <span class="import-mode-label">
                  <strong>Import as copies</strong>
                  <span class="import-mode-desc">Import all designs; rename duplicates with (2), (3)â€¦ suffixes</span>
                </span>
              </label>
            </fieldset>
            <div class="import-mode-actions">
              <button type="submit" value="ok" class="btn btn-primary">Choose filesâ€¦</button>
              <button type="submit" value="cancel" class="btn btn-outline">Cancel</button>
            </div>
          </form>`;
        document.body.appendChild(importModeDialog);
        importModeDialog.showModal();

        const importMode = await new Promise((resolve) => {
          importModeDialog.addEventListener(
            'close',
            () => {
              const returnValue = importModeDialog.returnValue;
              const mode =
                importModeDialog.querySelector(
                  'input[name="importMode"]:checked'
                )?.value || 'merge';
              document.body.removeChild(importModeDialog);
              resolve(returnValue === 'ok' ? mode : null);
            },
            { once: true }
          );
        });

        if (!importMode) return; // user cancelled

        // Create file input for import
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.multiple = true;
        input.onchange = async (e) => {
          const files = e.target.files;
          if (!files || files.length === 0) return;

          try {
            const currentState = stateManager.getState();
            const currentModelName = currentState.uploadedFile?.name || null;
            const paramSchema = currentState.schema?.parameters || {};

            if (!currentModelName) {
              const proceed = confirm(
                'No model is currently loaded. Presets will be saved as "Unknown Model" and may not appear in the dropdown until you load a matching model.\n\nContinue with import?'
              );
              if (!proceed) return;
            }

            // Replace mode: confirm and clear existing presets first
            if (importMode === 'replace' && currentModelName) {
              const existing = presetManager.getPresets(currentModelName) || [];
              const realCount = existing.filter(
                (p) => p.id !== 'design-defaults'
              ).length;

              // Reject if import files are empty to avoid silent data loss
              const fileTexts = await Promise.all(
                Array.from(files).map((f) => f.text())
              );
              const hasValidContent = fileTexts.some((t) => {
                try {
                  return !!JSON.parse(t);
                } catch {
                  return false;
                }
              });
              if (!hasValidContent) {
                alert(
                  'The selected file(s) contain no valid preset data. Import cancelled to protect your existing designs.'
                );
                return;
              }

              if (realCount > 0) {
                const confirmed = confirm(
                  `Replace all designs? This will permanently delete ${realCount} existing design${realCount !== 1 ? 's' : ''} for "${currentModelName}". This cannot be undone.\n\nContinue?`
                );
                if (!confirmed) return;
                presetManager.clearPresetsForModel(currentModelName, {
                  preserveDefaults: true,
                });
              }

              // After clearing, import with overwrite strategy
              const result = presetManager.importAndMergePresets(
                fileTexts,
                currentModelName,
                paramSchema,
                'overwrite'
              );
              _handleImportResult(result, currentModelName);
              return;
            }

            // Map UI modes to importAndMergePresets conflictStrategy
            // merge â†’ 'keep' (skip duplicates by name)
            // copies â†’ 'rename' (append (2), (3) suffix)
            const conflictStrategy =
              importMode === 'copies' ? 'rename' : 'keep';

            const fileTexts = await Promise.all(
              Array.from(files).map((f) => f.text())
            );
            const result = presetManager.importAndMergePresets(
              fileTexts,
              currentModelName,
              paramSchema,
              conflictStrategy
            );
            _handleImportResult(result, currentModelName);
          } catch (error) {
            alert(`Failed to import designs: ${error.message}`);
          }
        };
        input.click();
      }
    });

    // Close on backdrop click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeManagePresetsModalHandler();
      }
    });

    // Open modal with focus management (WCAG 2.2 focus trapping)
    openModal(modal, {
      focusTarget: modal.querySelector('.preset-modal-close'),
    });
  }

  // Preset button handlers - OpenSCAD Customizer semantics
  // Save: update selected preset, Add: create new, Delete: remove selected
  const savePresetBtn = document.getElementById('savePresetBtn');
  const addPresetBtn = document.getElementById('addPresetBtn');
  const deletePresetBtn = document.getElementById('deletePresetBtn');
  const managePresetsBtn = document.getElementById('managePresetsBtn');
  const presetSelect = document.getElementById('presetSelect');

  // Save button: Update currently selected preset (not create new)
  // "Pressing 'Save Preset' creates a new preset. It should simply save any parameter changes to the current preset"
  savePresetBtn.addEventListener('click', () => {
    const state = stateManager.getState();
    const selectedPresetId = presetSelect?.value;

    if (!state.uploadedFile) {
      updateStatus('No model loaded', 'error');
      return;
    }

    if (!selectedPresetId) {
      // Fallback: if no preset selected, show dialog (shouldn't happen if button is disabled)
      updateStatus('Select a preset first, or use + to create new', 'warning');
      return;
    }

    // Block saving over "design default values" (immutable, desktop parity)
    if (selectedPresetId === DESIGN_DEFAULTS_ID) {
      updateStatus(
        'Design default values cannot be overwritten. Use + to create a new preset.',
        'warning'
      );
      return;
    }

    // Get the preset to update
    const preset = presetManager.loadPreset(
      state.uploadedFile.name,
      selectedPresetId
    );
    if (!preset) {
      updateStatus('Preset not found', 'error');
      return;
    }

    try {
      // E2: Capture companion files (text-only, exclude images and main file)
      const companionSnapshot = {};
      if (state.projectFiles) {
        for (const [path, content] of state.projectFiles.entries()) {
          if (
            path !== state.mainFilePath &&
            typeof content === 'string' &&
            !content.startsWith('data:')
          ) {
            companionSnapshot[path] = content;
          }
        }
      }

      // Save/overwrite the current preset with current parameters
      const savedPreset = presetManager.savePreset(
        state.uploadedFile.name,
        preset.name, // Use existing name - this will overwrite
        state.parameters,
        {
          description: preset.description,
          companionFiles:
            Object.keys(companionSnapshot).length > 0
              ? companionSnapshot
              : null,
        }
      );

      updateStatus(`Preset "${preset.name}" saved`, 'success');
      setCurrentPresetSelection(savedPreset);

      // Brief visual feedback on button
      savePresetBtn.textContent = 'âœ“';
      setTimeout(() => {
        savePresetBtn.textContent = 'ðŸ’¾';
      }, 1500);
    } catch (error) {
      updateStatus(`Failed to save preset: ${error.message}`, 'error');
    }
  });

  // Add button: Create new preset (shows dialog)
  // "You use the '+' button to create a new preset based on the current customizer parameter settings"
  addPresetBtn.addEventListener('click', showSavePresetModal);

  // Delete button: Delete currently selected preset
  deletePresetBtn.addEventListener('click', async () => {
    const state = stateManager.getState();
    const selectedPresetId = presetSelect?.value;

    if (!state.uploadedFile || !selectedPresetId) {
      return;
    }

    // Block deleting "design default values" (immutable, desktop parity)
    if (selectedPresetId === DESIGN_DEFAULTS_ID) {
      updateStatus('Design default values cannot be deleted.', 'warning');
      return;
    }

    // Get preset info for confirmation
    const preset = presetManager.loadPreset(
      state.uploadedFile.name,
      selectedPresetId
    );
    if (!preset) {
      updateStatus('Preset not found', 'error');
      return;
    }

    // Show warning modal â€” deletion is irreversible
    const confirmed = await showConfirmDialog(
      `Are you sure you want to delete the preset "<strong>${preset.name}</strong>"?<br><br>This action <strong>cannot be undone</strong>.`,
      'Delete Preset',
      'Delete',
      'Cancel',
      { destructive: true }
    );

    if (!confirmed) {
      return;
    }

    try {
      const deleted = presetManager.deletePreset(
        state.uploadedFile.name,
        selectedPresetId
      );
      if (deleted) {
        updateStatus(`Deleted preset: ${preset.name}`, 'success');
        updatePresetDropdown(); // Refresh dropdown
        forceClearPresetSelection(); // Clear state
      } else {
        updateStatus('Failed to delete preset', 'error');
      }
    } catch (error) {
      updateStatus(`Failed to delete preset: ${error.message}`, 'error');
    }
  });

  // Manage button: Import/export modal
  managePresetsBtn.addEventListener('click', showManagePresetsModal);

  // Preset sort control: re-sort dropdown when sort order changes
  const presetDropdownSort = document.getElementById('presetDropdownSort');
  if (presetDropdownSort) {
    presetDropdownSort.addEventListener('change', () => {
      try {
        localStorage.setItem(PRESET_SORT_KEY, presetDropdownSort.value);
      } catch (_) {
        /* localStorage overflow â€” continue with in-memory value */
      }
      updatePresetDropdown();
      const label =
        presetDropdownSort.options[presetDropdownSort.selectedIndex]?.text ||
        '';
      announceImmediate(`Presets sorted by ${label}`);
    });
  }

  // Phase 9: Preset search/filter
  const presetSearchInput = document.getElementById('presetSearchInput');
  const presetSearchClear = document.getElementById('presetSearchClear');
  const presetSearchStatus = document.getElementById('presetSearchStatus');

  if (presetSearchInput && presetSearchClear && presetSearchStatus) {
    let _searchDebounce = null;

    function _applyPresetFilter() {
      const term = presetSearchInput.value.trim().toLowerCase();
      const options = Array.from(presetSelect.options);
      let visible = 0;

      for (const opt of options) {
        if (!opt.value) {
          // Keep the placeholder option always visible
          opt.hidden = false;
          continue;
        }
        const match = !term || opt.text.toLowerCase().includes(term);
        opt.hidden = !match;
        if (match) visible++;
      }

      presetSearchClear.hidden = !presetSearchInput.value;

      const total = options.filter((o) => o.value).length;
      if (!term) {
        presetSearchStatus.textContent = '';
      } else {
        presetSearchStatus.textContent = `${visible} of ${total} presets match`;
      }
    }

    presetSearchInput.addEventListener('input', () => {
      clearTimeout(_searchDebounce);
      _searchDebounce = setTimeout(_applyPresetFilter, 150);
    });

    presetSearchClear.addEventListener('click', () => {
      presetSearchInput.value = '';
      _applyPresetFilter();
      presetSearchStatus.textContent = 'Search cleared, all presets shown';
      presetSearchInput.focus();
    });
  }

  // Searchable combobox (searchable_combobox feature flag)
  if (_isEnabled('searchable_combobox')) {
    const comboContainer = document.getElementById('presetComboboxContainer');
    const presetSearchLegacy = document.getElementById('presetSearchLegacy');
    const presetSelectorLegacy = document.getElementById('presetSelector');

    if (comboContainer) {
      // Show combobox, hide legacy elements
      comboContainer.hidden = false;
      if (presetSearchLegacy) presetSearchLegacy.hidden = true;
      if (presetSelectorLegacy) presetSelectorLegacy.hidden = true;

      _presetCombobox = initSearchableCombobox({
        container: comboContainer,
        placeholder: 'Search presetsâ€¦',
        inputId: 'presetComboboxInput',
        disabled: true,
      });

      // Mirror combobox selection to the hidden native select for shared event handlers
      comboContainer.addEventListener('change', (e) => {
        const id = e.detail?.value;
        if (id != null) {
          // Update the native select value so existing change handlers fire
          if (presetSelect) {
            presetSelect.value = id;
            presetSelect.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
      });
    }
  }

  // Update button states when preset selection changes
  presetSelect.addEventListener('change', () => {
    updatePresetControlStates();
  });

  // Initialize button states
  updatePresetControlStates();

  // Library help button handler (bind once, not in renderLibraryUI)
  const libraryHelpBtn = document.getElementById('libraryHelpBtn');
  if (libraryHelpBtn) {
    libraryHelpBtn.addEventListener('click', () => {
      openFeaturesGuide({ tab: 'libraries' });
    });
  }

  // Welcome screen role path "Learn More" buttons
  const roleLearnButtons = document.querySelectorAll('.btn-role-learn');
  roleLearnButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      // Check what type of action to take
      if (btn.dataset.featureTab) {
        // Open Features Guide to specific tab
        openFeaturesGuide({ tab: btn.dataset.featureTab });
      } else if (btn.dataset.tour) {
        // Open guided tour
        openGuidedTour(btn.dataset.tour);
      } else if (btn.dataset.doc) {
        // Open documentation (for now, just open Features Guide)
        openFeaturesGuide();
      }
    });
  });

  // Accessibility spotlight links
  const spotlightLinks = document.querySelectorAll('.spotlight-link');
  spotlightLinks.forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();

      if (link.dataset.featureTab) {
        openFeaturesGuide({ tab: link.dataset.featureTab });
      } else if (link.dataset.doc) {
        // For now, open Features Guide; in future could show docs
        openFeaturesGuide();
      }
    });
  });

  // Handle preset selection
  presetSelect.addEventListener('change', async (e) => {
    const presetId = e.target.value;
    if (!presetId) return;

    const state = stateManager.getState();

    // Handle "design default values" virtual preset (desktop OpenSCAD parity)
    if (presetId === DESIGN_DEFAULTS_ID) {
      isLoadingPreset = true;

      const defaultParams = { ...state.defaults };
      stateManager.setState({ parameters: defaultParams });

      // Re-render UI with default parameters
      const parametersContainer = document.getElementById(
        'parametersContainer'
      );
      renderParameterUI(
        state.schema,
        parametersContainer,
        (values) => {
          stateManager.setState({ parameters: values });
          clearPresetSelection(values);
          if (autoPreviewController) {
            autoPreviewController.onParameterChange(values);
          }
          updatePrimaryActionButton();
        },
        defaultParams
      );

      // Reset output format to STL when loading design defaults (3D preset)
      const _fmtSelectDefaults = document.getElementById('outputFormat');
      if (_fmtSelectDefaults && _fmtSelectDefaults.value !== 'stl') {
        const is2DDefaults =
          isNonPreviewable(defaultParams, state.schema) ||
          (typeof defaultParams.generate === 'string' &&
            /svg|dxf|2d|first layer/i.test(defaultParams.generate));
        if (!is2DDefaults) {
          _fmtSelectDefaults.value = 'stl';
          _fmtSelectDefaults.dispatchEvent(new Event('change'));
          stateManager.setState({ outputFormat: 'stl' });
        }
      }

      if (autoPreviewController) {
        autoPreviewController.onParameterChange(defaultParams);
      }
      updatePrimaryActionButton();

      // Track as current selection (virtual preset)
      currentPresetSignature = null;
      isPresetDirty = false;
      stateManager.setState({
        currentPresetId: DESIGN_DEFAULTS_ID,
        currentPresetName: 'design default values',
      });

      isLoadingPreset = false;
      updatePresetControlStates();
      updateStatus('Loaded design default values');
      return;
    }

    const preset = presetManager.loadPreset(state.uploadedFile.name, presetId);

    if (preset) {
      // Log compatibility info (desktop OpenSCAD parity: silently skip extras)
      const hiddenParamNames = new Set(
        Object.keys(state.schema?.hiddenParameters || {})
      );
      const compatibility = presetManager.analyzePresetCompatibility(
        preset.parameters,
        state.schema?.parameters || state.schema,
        [...hiddenParamNames]
      );
      if (
        compatibility.extraParams.length > 0 ||
        compatibility.missingParams.length > 0
      ) {
        console.info(
          `[Preset] "${preset.name}": ${compatibility.compatibleCount} params applied, ` +
            `${compatibility.extraParams.length} skipped (not in current file), ` +
            `${compatibility.missingParams.length} kept at defaults (not in preset)`
        );
      }

      applyPresetParametersAndCompanions(preset);
      // Keep showing the preset name in dropdown (don't reset)
      // The dropdown will reset when parameters change (handled in onChange callback)
    }
  });

  /**
   * Show preset compatibility warning dialog
   * @param {Object} preset - The preset being loaded
   * @param {Object} compatibility - Compatibility analysis result
   * @param {Object} state - Current app state
   * @returns {Promise<string>} 'apply' or 'cancel'
   */
  function _showPresetCompatibilityWarning(preset, compatibility, state) {
    return new Promise((resolve) => {
      // Check for SCAD version info
      const scadVersion = state.uploadedFile?.content
        ? extractScadVersion(state.uploadedFile.content)
        : null;

      const modal = document.createElement('div');
      modal.className = 'preset-modal';
      modal.setAttribute('role', 'alertdialog');
      modal.setAttribute('aria-labelledby', 'presetCompatTitle');
      modal.setAttribute('aria-describedby', 'presetCompatMessage');
      modal.setAttribute('aria-modal', 'true');

      // Build issue list
      let issueHtml = '';

      if (compatibility.extraParams.length > 0) {
        issueHtml += `
          <div class="preset-compat-section">
            <h4>âš ï¸ Obsolete parameters (${compatibility.extraParams.length})</h4>
            <p>These preset parameters don't exist in the current file (may have been removed or renamed):</p>
            <ul class="preset-compat-list">
              ${compatibility.extraParams.map((p) => `<li><code>${escapeHtml(p)}</code></li>`).join('')}
            </ul>
          </div>
        `;
      }

      if (compatibility.missingParams.length > 0) {
        issueHtml += `
          <div class="preset-compat-section">
            <h4>â„¹ï¸ New parameters (${compatibility.missingParams.length})</h4>
            <p>These file parameters aren't in the preset (will use defaults):</p>
            <ul class="preset-compat-list">
              ${compatibility.missingParams
                .slice(0, 10)
                .map((p) => `<li><code>${escapeHtml(p)}</code></li>`)
                .join('')}
              ${compatibility.missingParams.length > 10 ? `<li>...and ${compatibility.missingParams.length - 10} more</li>` : ''}
            </ul>
          </div>
        `;
      }

      const versionNote = scadVersion
        ? `<p class="preset-compat-note">Current file version: <strong>${scadVersion.version}</strong></p>`
        : '';

      modal.innerHTML = `
        <div class="preset-modal-content modal-medium">
          <div class="preset-modal-header">
            <h3 id="presetCompatTitle">Preset May Be From Different Version</h3>
            <button class="preset-modal-close" aria-label="Close">&times;</button>
          </div>
          <div class="modal-body">
            <p id="presetCompatMessage">
              The preset "<strong>${escapeHtml(preset.name)}</strong>" may have been created for a different version 
              of this file. Some parameters don't match.
            </p>
            ${versionNote}
            ${issueHtml}
            <p>
              <strong>${compatibility.compatibleCount}</strong> of <strong>${compatibility.totalPresetParams}</strong> 
              preset parameters can be applied.
            </p>
          </div>
          <div class="preset-modal-footer">
            <button type="button" class="btn btn-outline" data-action="cancel">Cancel</button>
            <button type="button" class="btn btn-primary" data-action="apply">Apply Anyway</button>
          </div>
        </div>
      `;

      const handleAction = (action) => {
        document.body.removeChild(modal);
        resolve(action);
      };

      modal.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-action]');
        const closeBtn = e.target.closest('.preset-modal-close');

        if (btn) {
          handleAction(btn.dataset.action);
        } else if (closeBtn || e.target === modal) {
          handleAction('cancel');
        }
      });

      modal.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          handleAction('cancel');
        }
      });

      document.body.appendChild(modal);
      modal.querySelector('button[data-action="apply"]').focus();
    });
  }

  // Subscribe to preset changes
  presetManager.subscribe((action, _preset, _modelName) => {
    // Update dropdown only when the preset LIST changes.
    // IMPORTANT: presetManager emits a 'load' event too; rebuilding the <select> on 'load'
    // resets selection back to "-- Select Preset --" (confirmed by logs: updatePresetDropdown exit newValue="").
    if (action === 'load') {
      return;
    }

    updatePresetDropdown();
  });

  // Refresh preset dropdown whenever the loaded project changes (including
  // switching from one project to another, not just the initial load).
  stateManager.subscribe((state, prevState) => {
    if (
      state.uploadedFile &&
      state.uploadedFile.name !== prevState.uploadedFile?.name
    ) {
      updatePresetDropdown();
    }
  });

  // ========== END PRESET SYSTEM ==========

  // ========== ADVANCED MENU ==========

  // View Source Button
  const viewSourceBtn = document.getElementById('viewSourceBtn');
  const copySourceBtn = document.getElementById('copySourceBtn');
  const sourceViewerModal = document.getElementById('sourceViewerModal');
  const sourceViewerClose = document.getElementById('sourceViewerClose');
  const sourceViewerOverlay = document.getElementById('sourceViewerOverlay');
  const sourceViewerContent = document.getElementById('sourceViewerContent');
  const sourceViewerCopy = document.getElementById('sourceViewerCopy');
  const sourceViewerInfo = document.getElementById('sourceViewerInfo');

  viewSourceBtn?.addEventListener('click', () => {
    const state = stateManager.getState();
    if (!state.uploadedFile) {
      announceImmediate('Upload a file first to view source code');
      return;
    }

    sourceViewerModal.classList.remove('hidden');
    sourceViewerContent.value = state.uploadedFile.content;

    const lineCount = state.uploadedFile.content.split('\n').length;
    const charCount = state.uploadedFile.content.length;
    sourceViewerInfo.innerHTML = `
      <span>ðŸ“„ ${state.uploadedFile.name}</span>
      <span>ðŸ“ ${lineCount.toLocaleString()} lines</span>
      <span>ðŸ“Š ${charCount.toLocaleString()} characters</span>
    `;

    setTimeout(() => sourceViewerContent.focus(), 100);
  });

  copySourceBtn?.addEventListener('click', async () => {
    const state = stateManager.getState();
    if (!state.uploadedFile) {
      announceImmediate('Upload a file first to copy source code');
      return;
    }

    try {
      await navigator.clipboard.writeText(state.uploadedFile.content);
      copySourceBtn.textContent = 'âœ… Copied!';
      updateStatus('Source code copied to clipboard');
      setTimeout(() => {
        copySourceBtn.textContent = 'ðŸ“‹ Copy Source';
      }, 2000);
    } catch (error) {
      console.error('Failed to copy source:', error);
      const textarea = document.createElement('textarea');
      textarea.value = state.uploadedFile.content;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      copySourceBtn.textContent = 'âœ… Copied!';
      setTimeout(() => {
        copySourceBtn.textContent = 'ðŸ“‹ Copy Source';
      }, 2000);
    }
  });

  sourceViewerClose?.addEventListener('click', () => {
    sourceViewerModal.classList.add('hidden');
  });

  sourceViewerOverlay?.addEventListener('click', () => {
    sourceViewerModal.classList.add('hidden');
  });

  sourceViewerCopy?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(sourceViewerContent.value);
      sourceViewerCopy.textContent = 'âœ… Copied!';
      setTimeout(() => {
        sourceViewerCopy.textContent = 'ðŸ“‹ Copy';
      }, 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  });

  // =========================================
  // Console output display for ECHO/WARNING/ERROR messages
  // =========================================
  const viewConsoleBtn = document.getElementById('viewConsoleBtn');
  const consoleOutputModal = document.getElementById('consoleOutputModal');
  const consoleOutputClose = document.getElementById('consoleOutputClose');
  const consoleOutputOverlay = document.getElementById('consoleOutputOverlay');
  const consoleOutput = document.getElementById('consoleOutput');
  const consoleCopyBtn = document.getElementById('consoleCopyBtn');
  const consoleClearBtn = document.getElementById('consoleClearBtn');
  const consoleCloseBtn = document.getElementById('consoleCloseBtn');
  const consoleBadge = document.getElementById('consoleBadge');

  // State for console output
  let lastConsoleOutput = '';

  const BENIGN_OPENSCAD_CONSOLE_PATTERNS = [
    /Could not initialize localization \(application path is '\/'\)\.?/i,
    /WARNING:\s*Viewall and autocenter disabled in favor of \$vp\*/i,
  ];

  function normalizeOpenSCADConsoleOutput(output) {
    if (!output || typeof output !== 'string') return '';

    const normalizedLines = output
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        if (line.startsWith('[ERR] ')) return line.substring(6).trim();
        if (line.startsWith('[ERR]')) return line.substring(5).trim();
        return line;
      })
      .filter(
        (line) =>
          !BENIGN_OPENSCAD_CONSOLE_PATTERNS.some((pattern) =>
            pattern.test(line)
          )
      );

    return normalizedLines.join('\n');
  }

  // Initialize ErrorLogPanel first (renders into structured view tab)
  const errorLogPanel = getErrorLogPanel();
  initAddStructuredError();

  // Initialize unified ConsolePanel with structured sub-panel
  const consolePanel = getConsolePanel({ structuredPanel: errorLogPanel });

  /**
   * Update console output display
   * Display ECHO/WARNING/ERROR messages for user communication
   * @param {string} output - Console output from OpenSCAD render
   */
  function updateConsoleOutput(output, { append = false } = {}) {
    if (!output || output.trim() === '') return;
    const normalizedOutput = normalizeOpenSCADConsoleOutput(output);

    if (!append) {
      consolePanel.clear();
    }

    if (!normalizedOutput || normalizedOutput.trim() === '') {
      lastConsoleOutput = '';
      updatePreviewDrawer([]);
      if (consoleOutput && !consoleOutputModal?.classList.contains('hidden')) {
        renderConsoleOutput('');
      }
      if (consoleBadge) {
        consoleBadge.classList.add('hidden');
      }
      return;
    }

    lastConsoleOutput = normalizedOutput;

    // Show badge to indicate new output
    if (consoleBadge) {
      consoleBadge.classList.remove('hidden');
    }

    // If modal is open, update it
    if (consoleOutput && !consoleOutputModal?.classList.contains('hidden')) {
      renderConsoleOutput(normalizedOutput);
    }

    // Feed both panels with parsed console output
    consolePanel.addOutput(normalizedOutput);
    errorLogPanel.addOutput(normalizedOutput);

    // Extract ECHO/WARNING/ERROR messages and display in preview drawer
    const consoleMessages = extractConsoleMessages(normalizedOutput);
    updatePreviewDrawer(consoleMessages);

    const echoCount = consoleMessages.filter((m) => m.type === 'echo').length;
    if (echoCount > 0) {
      console.log(`[Console] ${echoCount} ECHO statement(s) captured`);
    }
  }

  /**
   * Extract ECHO, WARNING, and ERROR messages from console output.
   * @param {string} output - Raw console output
   * @returns {{ type: 'echo'|'warning'|'error', text: string }[]}
   */
  const _ERR_INFO_PATTERNS =
    /^(?:Geometries in cache|Geometry cache size|CGAL Polyhedrons in cache|CGAL cache size|Total rendering time|Top level object is|Status:\s|Genus:\s|Vertices:\s|Facets:\s|Could not initialize localization|Compiling design|Rendering design)/i;

  function extractConsoleMessages(output) {
    if (!output) return [];

    return output
      .split('\n')
      .map((line) => {
        const trimmed = line.trim();
        if (!trimmed) return null;

        if (trimmed.startsWith('ECHO:')) {
          const match = trimmed.match(/ECHO:\s*"?([^"]*)"?/);
          const text = match
            ? match[1].trim()
            : trimmed.replace(/.*ECHO:\s*/, '').trim();
          return text.length > 0 ? { type: 'echo', text } : null;
        }

        if (trimmed.includes('WARNING:') || trimmed.includes('Warning:')) {
          const warnText = trimmed.startsWith('[ERR] ')
            ? trimmed.substring(6)
            : trimmed;
          return { type: 'warning', text: warnText };
        }

        if (trimmed.includes('ERROR:') || trimmed.includes('Error:')) {
          const errText = trimmed.startsWith('[ERR] ')
            ? trimmed.substring(6)
            : trimmed;
          return { type: 'error', text: errText };
        }

        if (trimmed.startsWith('[ERR]')) {
          const text = trimmed
            .substring(trimmed.startsWith('[ERR] ') ? 6 : 5)
            .trim();
          if (!text || _ERR_INFO_PATTERNS.test(text)) {
            return null;
          }
          return { type: 'error', text };
        }

        return null;
      })
      .filter(Boolean);
  }

  /**
   * Update the preview drawer to show ECHO, WARNING, and ERROR messages.
   * @param {{ type: 'echo'|'warning'|'error', text: string }[]} messages
   */
  function updatePreviewDrawer(messages) {
    const echoDrawer = document.getElementById('echoDrawer');
    const echoDrawerLabel = document.getElementById('echoDrawerLabel');
    const echoMessagesEl = document.getElementById('echoMessages');

    if (!echoDrawer || !echoDrawerLabel || !echoMessagesEl) return;

    if (messages.length === 0) {
      echoDrawer.classList.remove(
        'visible',
        'echo-drawer--warning',
        'echo-drawer--error'
      );
      echoDrawer.classList.add('collapsed');
      echoDrawerLabel.textContent = 'No messages';
      echoMessagesEl.innerHTML = '';
      return;
    }

    const echoCount = messages.filter((m) => m.type === 'echo').length;
    const warnCount = messages.filter((m) => m.type === 'warning').length;
    const errorCount = messages.filter((m) => m.type === 'error').length;

    // Build label describing the mix of message types
    const parts = [];
    if (echoCount > 0) parts.push(`${echoCount} echo`);
    if (warnCount > 0)
      parts.push(`${warnCount} warning${warnCount > 1 ? 's' : ''}`);
    if (errorCount > 0)
      parts.push(`${errorCount} error${errorCount > 1 ? 's' : ''}`);
    echoDrawerLabel.textContent = `OpenSCAD Messages (${parts.join(', ')})`;

    // Set severity class on the drawer for toggle-bar tinting
    echoDrawer.classList.remove('echo-drawer--warning', 'echo-drawer--error');
    if (errorCount > 0) {
      echoDrawer.classList.add('echo-drawer--error');
    } else if (warnCount > 0) {
      echoDrawer.classList.add('echo-drawer--warning');
    }

    // Render each message as a color-coded line (text-only, no user HTML)
    const escHtml = (s) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    echoMessagesEl.innerHTML = messages
      .map((m) => {
        const cls = `echo-msg-line echo-msg-line--${m.type}`;
        const prefix =
          m.type === 'echo' ? 'ECHO: ' : m.type === 'warning' ? '' : '';
        return `<span class="${cls}">${escHtml(prefix + m.text)}</span>`;
      })
      .join('\n');

    // Show the drawer: always mark it visible so the badge/label appears,
    // but only auto-expand (remove 'collapsed') when there are warnings or errors
    echoDrawer.classList.add('visible');
    if (warnCount > 0 || errorCount > 0) {
      echoDrawer.classList.remove('collapsed');
    }

    const toggleBtn = document.getElementById('echoDrawerToggle');
    if (toggleBtn) {
      const isExpanded = warnCount > 0 || errorCount > 0;
      toggleBtn.setAttribute('aria-expanded', String(isExpanded));
    }

    // Build accessible announcement
    const summary = [];
    if (errorCount > 0)
      summary.push(`${errorCount} error${errorCount > 1 ? 's' : ''}`);
    if (warnCount > 0)
      summary.push(`${warnCount} warning${warnCount > 1 ? 's' : ''}`);
    if (echoCount > 0)
      summary.push(`${echoCount} echo message${echoCount > 1 ? 's' : ''}`);
    announceImmediate(`Model has ${summary.join(', ')}`);
  }

  /**
   * Render console output with highlighted ECHO lines
   * @param {string} output - Raw console output
   */
  function renderConsoleOutput(output) {
    if (!consoleOutput) return;

    if (!output || output.trim() === '') {
      consoleOutput.textContent =
        'No console output yet. Generate a model to see output.';
      return;
    }

    // Split into lines and highlight ECHO lines
    const lines = output.split('\n');
    const highlightedLines = lines.map((line) => {
      if (line.includes('ECHO:')) {
        return `<span class="echo-line">${escapeHtml(line)}</span>`;
      }
      return escapeHtml(line);
    });

    consoleOutput.innerHTML = highlightedLines.join('\n');
  }

  // Open console modal
  const openConsoleModal = () => {
    if (!consoleOutputModal) return;

    // Clear the "new output" badge
    if (consoleBadge) {
      consoleBadge.classList.add('hidden');
    }

    // Render current console output
    renderConsoleOutput(lastConsoleOutput);

    // Show modal
    consoleOutputModal.classList.remove('hidden');

    // Announce to screen readers
    announceImmediate('Console output panel opened');
  };

  viewConsoleBtn?.addEventListener('click', openConsoleModal);

  // Echo drawer toggle
  const echoDrawerToggleBtn = document.getElementById('echoDrawerToggle');
  const echoDrawerEl = document.getElementById('echoDrawer');

  echoDrawerToggleBtn?.addEventListener('click', () => {
    if (!echoDrawerEl) return;
    const isCollapsed = echoDrawerEl.classList.contains('collapsed');
    echoDrawerEl.classList.toggle('collapsed');
    echoDrawerToggleBtn.setAttribute(
      'aria-expanded',
      isCollapsed ? 'true' : 'false'
    );
  });

  // Echo drawer "View Full Console" button
  const echoViewConsoleBtn = document.getElementById('echoViewConsoleBtn');
  echoViewConsoleBtn?.addEventListener('click', openConsoleModal);

  // Close handlers
  const closeConsoleModal = () => {
    if (consoleOutputModal) {
      consoleOutputModal.classList.add('hidden');
    }
  };

  consoleOutputClose?.addEventListener('click', closeConsoleModal);
  consoleOutputOverlay?.addEventListener('click', closeConsoleModal);
  consoleCloseBtn?.addEventListener('click', closeConsoleModal);

  // Escape key closes console modal (accessibility)
  consoleOutputModal?.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeConsoleModal();
      e.preventDefault();
    }
  });

  // Copy to clipboard
  consoleCopyBtn?.addEventListener('click', async () => {
    if (!lastConsoleOutput) {
      consoleCopyBtn.textContent = 'Nothing to copy';
      setTimeout(() => {
        consoleCopyBtn.innerHTML = `
          <svg class="btn-icon-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
          Copy to Clipboard
        `;
      }, 2000);
      return;
    }

    try {
      await navigator.clipboard.writeText(lastConsoleOutput);
      consoleCopyBtn.textContent = 'âœ… Copied!';
      announceImmediate('Console output copied to clipboard');
      setTimeout(() => {
        consoleCopyBtn.innerHTML = `
          <svg class="btn-icon-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
          Copy to Clipboard
        `;
      }, 2000);
    } catch (error) {
      console.error('Failed to copy console output:', error);
      consoleCopyBtn.textContent = 'Copy failed';
    }
  });

  // Download console log for troubleshooting
  const consoleDownloadBtn = document.getElementById('consoleDownloadBtn');
  consoleDownloadBtn?.addEventListener('click', () => {
    if (!lastConsoleOutput) {
      updateStatus('No console output to download', 'warning');
      return;
    }

    // Generate filename with timestamp
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, 19);
    const state = stateManager.getState();
    const modelName =
      state.uploadedFile?.name?.replace('.scad', '') || 'console';
    const filename = `${modelName}-console-${timestamp}.txt`;

    // Create blob and download
    const blob = new Blob([lastConsoleOutput], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    updateStatus(`Downloaded: ${filename}`, 'success');
    announceImmediate('Console log downloaded');
  });

  // Clear console
  consoleClearBtn?.addEventListener('click', () => {
    clearConsoleState();
    announceImmediate('Console output cleared');
  });

  /**
   * Reset all console/warning display state to a clean slate.
   * Called on project switch and by the manual clear button.
   */
  function clearConsoleState() {
    lastConsoleOutput = '';
    if (consoleBadge) {
      consoleBadge.classList.add('hidden');
    }
    renderConsoleOutput('');
    consolePanel.clear();
    const consolePanelDetails = document.getElementById('consolePanel');
    if (consolePanelDetails) {
      consolePanelDetails.open = false;
    }
  }

  // Make updateConsoleOutput available globally for the render result handler
  window.updateConsoleOutput = updateConsoleOutput;
  window.clearConsoleState = clearConsoleState;

  // Unlock Limits Toggle
  const unlockLimitsToggle = document.getElementById('unlockLimitsToggle');
  unlockLimitsToggle?.addEventListener('change', (e) => {
    const unlocked = e.target.checked;
    setLimitsUnlocked(unlocked);

    if (unlocked) {
      updateStatus(
        'âš ï¸ Parameter limits unlocked - values outside normal range allowed'
      );
    } else {
      updateStatus('Parameter limits restored to defaults');
    }
  });

  // Reset All Button (in customizer header)
  const resetAllBtn = document.getElementById('resetAllBtn');
  resetAllBtn?.addEventListener('click', () => {
    resetBtn?.click();
  });

  // Reset Group Button
  const resetGroupBtn = document.getElementById('resetGroupBtn');
  const resetGroupSelector = document.getElementById('resetGroupSelector');
  const resetGroupSelect = document.getElementById('resetGroupSelect');
  const confirmResetGroupBtn = document.getElementById('confirmResetGroupBtn');

  resetGroupBtn?.addEventListener('click', () => {
    const state = stateManager.getState();
    if (!state.schema || !state.schema.groups) {
      alert('No model loaded');
      return;
    }

    resetGroupSelect.innerHTML = '';
    state.schema.groups.forEach((group) => {
      const option = document.createElement('option');
      option.value = group.id;
      option.textContent = group.label;
      resetGroupSelect.appendChild(option);
    });

    resetGroupSelector.classList.remove('hidden');
  });

  confirmResetGroupBtn?.addEventListener('click', () => {
    const state = stateManager.getState();
    const groupId = resetGroupSelect.value;

    if (!groupId || !state.schema) return;

    stateManager.recordParameterState();

    const defaults = getAllDefaults();
    const newParams = { ...state.parameters };
    let resetCount = 0;

    Object.values(state.schema.parameters).forEach((param) => {
      if (param.group === groupId && defaults[param.name] !== undefined) {
        newParams[param.name] = defaults[param.name];
        resetCount++;
      }
    });

    stateManager.setState({ parameters: newParams });

    const parametersContainer = document.getElementById('parametersContainer');
    renderParameterUI(
      state.schema,
      parametersContainer,
      (values) => {
        stateManager.recordParameterState();
        stateManager.setState({ parameters: values });
        clearPresetSelection(values);
        if (autoPreviewController && state.uploadedFile) {
          autoPreviewController.onParameterChange(values);
        }
        updatePrimaryActionButton();
      },
      newParams
    );

    if (autoPreviewController && state.uploadedFile) {
      autoPreviewController.onParameterChange(newParams);
    }

    resetGroupSelector.classList.add('hidden');
    const groupLabel =
      state.schema.groups.find((g) => g.id === groupId)?.label || groupId;
    updateStatus(
      `Reset ${resetCount} parameters in "${groupLabel}" to defaults`
    );
    updatePrimaryActionButton();
  });

  // View Params JSON Button
  const viewParamsJsonBtn = document.getElementById('viewParamsJsonBtn');
  const paramsJsonModal = document.getElementById('paramsJsonModal');
  const paramsJsonClose = document.getElementById('paramsJsonClose');
  const paramsJsonOverlay = document.getElementById('paramsJsonOverlay');
  const paramsJsonContent = document.getElementById('paramsJsonContent');
  const paramsJsonCopy = document.getElementById('paramsJsonCopy');

  viewParamsJsonBtn?.addEventListener('click', () => {
    const state = stateManager.getState();
    if (!state.uploadedFile) {
      alert('No file uploaded');
      return;
    }

    const json = JSON.stringify(state.parameters, null, 2);
    paramsJsonContent.value = json;
    paramsJsonModal.classList.remove('hidden');

    setTimeout(() => paramsJsonContent.focus(), 100);
  });

  paramsJsonClose?.addEventListener('click', () => {
    paramsJsonModal.classList.add('hidden');
  });

  paramsJsonOverlay?.addEventListener('click', () => {
    paramsJsonModal.classList.add('hidden');
  });

  paramsJsonCopy?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(paramsJsonContent.value);
      paramsJsonCopy.textContent = 'âœ… Copied!';
      updateStatus('Parameters JSON copied to clipboard');
      setTimeout(() => {
        paramsJsonCopy.textContent = 'ðŸ“‹ Copy';
      }, 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  });

  // =========================================
  // Export Changed Settings (troubleshooting and sharing support)
  // =========================================
  const exportChangedBtn = document.getElementById('exportChangedBtn');

  exportChangedBtn?.addEventListener('click', () => {
    const state = stateManager.getState();
    if (!state.uploadedFile || !state.schema) {
      alert('No file uploaded');
      return;
    }

    const defaultParams = state.schema.parameters || {};

    const changedJson = presetManager.exportChangedParametersJSON(
      state.parameters,
      defaultParams,
      state.currentModelName || 'Unknown Model'
    );

    const parsed = JSON.parse(changedJson);

    if (parsed.message && parsed.changeCount === undefined) {
      updateStatus('All parameters are at default values');
      announceImmediate(
        'All parameters are at default values. Nothing to export.'
      );
      return;
    }

    const blob = new Blob([changedJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');

    const baseName = (state.currentModelName || 'model').replace(
      /\.(scad|zip)$/i,
      ''
    );
    const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
    a.href = url;
    a.download = `${baseName}-changed-params-${date}.json`;
    a.click();
    URL.revokeObjectURL(url);

    const changeCount = parsed.changeCount || 0;
    updateStatus(`Exported ${changeCount} changed parameter(s)`);
    announceImmediate(
      `Downloaded ${changeCount} changed parameters as JSON file`
    );
  });

  // Close modals on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const featuresGuideModal = document.getElementById('featuresGuideModal');
      if (!sourceViewerModal.classList.contains('hidden')) {
        sourceViewerModal.classList.add('hidden');
      }
      if (!paramsJsonModal.classList.contains('hidden')) {
        paramsJsonModal.classList.add('hidden');
      }
      if (
        featuresGuideModal &&
        !featuresGuideModal.classList.contains('hidden')
      ) {
        closeFeaturesGuide();
      }
    }
  });

  // ========== END ADVANCED MENU ==========

  // ========== GUIDED TOURS ==========

  /**
   * Open a minimal guided tour modal (for Welcome screen role paths)
   * Tours are skippable, focus-safe, and respect prefers-reduced-motion
   * @param {string} tourType - Type of tour ('screen-reader', 'voice-input', 'intro')
   */
  function openGuidedTour(tourType) {
    // TODO: Implement guided tours in a separate task
    // For now, fall back to opening the Features Guide
    console.log('[Guided Tours] Tour requested:', tourType);
    openFeaturesGuide();
  }

  // ========== END GUIDED TOURS ==========

  // ========== FEATURES GUIDE MODAL ==========

  // Open Features Guide modal with optional tab selection
  function openFeaturesGuide({ tab = 'libraries' } = {}) {
    const featuresGuideModal = document.getElementById('featuresGuideModal');
    if (!featuresGuideModal) return;

    // Show modal with focus trap + automatic focus restoration
    openModal(featuresGuideModal, {
      // Focus will be moved to the requested tab (or first focusable)
      focusTarget: document.getElementById(`tab-${tab}`) || undefined,
    });

    // Switch to requested tab
    const tabId = `tab-${tab}`;
    const tabButton = document.getElementById(tabId);
    if (tabButton) {
      switchFeaturesTab(tabId);
      // Focus the active tab
      setTimeout(() => tabButton.focus(), 100);
    }
  }

  // Expose openFeaturesGuide to window for module-level functions
  if (typeof window !== 'undefined') {
    window.openFeaturesGuide = openFeaturesGuide;
  }

  // Close Features Guide modal
  function closeFeaturesGuide() {
    const featuresGuideModal = document.getElementById('featuresGuideModal');
    if (!featuresGuideModal) return;

    closeModal(featuresGuideModal);
  }

  // Switch between tabs
  function switchFeaturesTab(tabId) {
    const allTabs = document.querySelectorAll('.features-tab');
    const allPanels = document.querySelectorAll('.features-panel');

    allTabs.forEach((tab) => {
      const isActive = tab.id === tabId;
      tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
      tab.setAttribute('tabindex', isActive ? '0' : '-1');
    });

    allPanels.forEach((panel) => {
      const panelId = panel.id;
      const associatedTab = document.querySelector(
        `[aria-controls="${panelId}"]`
      );
      if (associatedTab && associatedTab.id === tabId) {
        panel.hidden = false;
      } else {
        panel.hidden = true;
      }
    });
  }

  // Features Guide close button
  const featuresGuideClose = document.getElementById('featuresGuideClose');
  featuresGuideClose?.addEventListener('click', closeFeaturesGuide);

  // Features Guide overlay click
  const featuresGuideOverlay = document.getElementById('featuresGuideOverlay');
  featuresGuideOverlay?.addEventListener('click', closeFeaturesGuide);

  // Features Guide main button handler
  const featuresGuideBtn = document.getElementById('featuresGuideBtn');
  if (featuresGuideBtn) {
    featuresGuideBtn.addEventListener('click', () => {
      openFeaturesGuide();
    });
  }

  // Tab keyboard navigation
  const featuresTabs = document.querySelectorAll('.features-tab');
  featuresTabs.forEach((tab, _index) => {
    // Click to activate tab
    tab.addEventListener('click', () => {
      switchFeaturesTab(tab.id);
    });

    // Keyboard navigation
    tab.addEventListener('keydown', (e) => {
      // Filter out hidden tabs (e.g., gated Alt View tab)
      const tabs = Array.from(featuresTabs).filter((t) => !t.hidden);
      const currentIndex = tabs.indexOf(tab);
      if (currentIndex === -1) return; // Current tab is hidden, skip navigation
      let nextIndex = currentIndex;

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          nextIndex = currentIndex > 0 ? currentIndex - 1 : tabs.length - 1;
          tabs[nextIndex].focus();
          break;
        case 'ArrowRight':
          e.preventDefault();
          nextIndex = currentIndex < tabs.length - 1 ? currentIndex + 1 : 0;
          tabs[nextIndex].focus();
          break;
        case 'Home':
          e.preventDefault();
          tabs[0].focus();
          break;
        case 'End':
          e.preventDefault();
          tabs[tabs.length - 1].focus();
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          switchFeaturesTab(tab.id);
          break;
      }
    });
  });

  // Example buttons within Features Guide
  document.addEventListener('click', (e) => {
    const exampleBtn = e.target.closest('[data-feature-example]');
    if (exampleBtn && exampleBtn.dataset.example) {
      e.preventDefault();
      const exampleKey = exampleBtn.dataset.example;
      fileHandler.loadExampleByKey(exampleKey, {
        closeFeaturesGuideModal: true,
      });
    }
  });

  // ========== END FEATURES GUIDE MODAL ==========

  // ========== CONFIGURABLE KEYBOARD SHORTCUTS ==========
  // Register handlers for configurable keyboard actions
  // These complement the existing shortcuts and provide customization

  keyboardConfig.on('render', () => {
    const state = stateManager.getState();
    if (state.uploadedFile && !primaryActionBtn.disabled) {
      primaryActionBtn.click();
    }
  });

  keyboardConfig.on('preview', () => {
    const state = stateManager.getState();
    if (state.uploadedFile && autoPreviewController) {
      autoPreviewController.onParameterChange(state.parameters);
    }
  });

  keyboardConfig.on('reloadAndPreview', () => {
    const state = stateManager.getState();
    if (state.uploadedFile) {
      fileActionsController.onReload();
      if (autoPreviewController) {
        autoPreviewController.onParameterChange(
          stateManager.getState().parameters
        );
      }
    }
  });

  keyboardConfig.on('cancelRender', () => {
    if (renderController && renderController.isRendering()) {
      renderController.cancel();
    }
  });

  keyboardConfig.on('download', () => {
    const state = stateManager.getState();
    if (state.stl) {
      primaryActionBtn.click();
    }
  });

  keyboardConfig.on('focusMode', () => {
    const focusModeBtn = document.getElementById('focusModeBtn');
    focusModeBtn?.click();
  });

  keyboardConfig.on('toggleParameters', () => {
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) {
      sidebar.classList.toggle('collapsed');
    }
  });

  keyboardConfig.on('resetView', () => {
    if (previewManager) {
      previewManager.resetCamera();
    }
  });

  // Camera view presets (Ctrl+numpad to match OpenSCAD desktop)
  keyboardConfig.on('viewTop', () => {
    if (previewManager) previewManager.setCameraView('top');
  });

  keyboardConfig.on('viewBottom', () => {
    if (previewManager) previewManager.setCameraView('bottom');
  });

  keyboardConfig.on('viewFront', () => {
    if (previewManager) previewManager.setCameraView('front');
  });

  keyboardConfig.on('viewBack', () => {
    if (previewManager) previewManager.setCameraView('back');
  });

  keyboardConfig.on('viewLeft', () => {
    if (previewManager) previewManager.setCameraView('left');
  });

  keyboardConfig.on('viewRight', () => {
    if (previewManager) previewManager.setCameraView('right');
  });

  keyboardConfig.on('viewDiagonal', () => {
    if (previewManager) previewManager.setCameraView('diagonal');
  });

  keyboardConfig.on('viewCenter', () => {
    if (previewManager) {
      previewManager.resetCamera();
      announceImmediate('View centered');
    }
  });

  keyboardConfig.on('toggleProjection', () => {
    if (previewManager) {
      const newMode = previewManager.toggleProjection();
      const isPerspective = newMode === 'perspective';

      // Update desktop toggle button state
      const projToggle = document.getElementById('projectionToggle');
      if (projToggle) {
        projToggle.setAttribute(
          'aria-pressed',
          isPerspective ? 'false' : 'true'
        );
        projToggle.title = isPerspective
          ? 'Switch to Orthographic (P)'
          : 'Switch to Perspective (P)';
        const labelSpan = projToggle.querySelector('span');
        if (labelSpan) {
          labelSpan.textContent = isPerspective
            ? 'Perspective'
            : 'Orthographic';
        }
      }

      // Update mobile toggle button state
      const mobileProjToggle = document.getElementById(
        'mobileProjectionToggle'
      );
      if (mobileProjToggle) {
        mobileProjToggle.setAttribute(
          'aria-pressed',
          isPerspective ? 'false' : 'true'
        );
        mobileProjToggle.title = isPerspective
          ? 'Switch to Orthographic'
          : 'Switch to Perspective';
        const mobileLabelSpan = mobileProjToggle.querySelector('span');
        if (mobileLabelSpan) {
          mobileLabelSpan.textContent = isPerspective
            ? 'Perspective'
            : 'Orthographic';
        }
      }
    }
  });

  keyboardConfig.on('focusSavedProjects', () => {
    const savedProjectsList = document.getElementById('savedProjectsList');
    const welcomeScreen = document.getElementById('welcomeScreen');

    // Only focus if on welcome screen
    if (welcomeScreen && !welcomeScreen.classList.contains('hidden')) {
      if (savedProjectsList) {
        // Scroll to saved projects section
        savedProjectsList.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
        });

        // Focus first project card if available
        const firstCard = savedProjectsList.querySelector(
          '.saved-project-card'
        );
        if (firstCard) {
          firstCard.focus();
        } else {
          savedProjectsList.focus();
        }
      }
    }
  });

  keyboardConfig.on('resetAllParams', () => {
    const state = stateManager.getState();
    if (state.uploadedFile) {
      resetBtn?.click();
    }
  });

  keyboardConfig.on('toggleTheme', () => {
    themeManager.cycleTheme();
  });

  keyboardConfig.on('showShortcutsModal', () => {
    const modal = document.getElementById('shortcutsModal');
    const modalBody = document.getElementById('shortcutsModalBody');
    if (modal && modalBody) {
      // Initialize modal wiring once to avoid duplicate listeners.
      if (!modal.dataset.initialized) {
        initShortcutsModal(modalBody, () => closeModal(modal));
        modal.dataset.initialized = 'true';
      }
      openModal(modal);
    }
  });

  // File action shortcuts
  keyboardConfig.on('newFile', () => fileActionsController.onNew());
  keyboardConfig.on('saveFile', () => fileActionsController.onSave());
  keyboardConfig.on('saveFileAs', () => fileActionsController.onSaveAs());
  keyboardConfig.on('reloadFile', () => fileActionsController.onReload());
  keyboardConfig.on('exportImage', () => fileActionsController.onExportImage());

  // Edit action shortcuts
  keyboardConfig.on('copyViewportImage', () =>
    editActionsController.copyViewportImage()
  );
  keyboardConfig.on('jumpNextError', () =>
    editActionsController.jumpToNextError()
  );
  keyboardConfig.on('jumpPrevError', () =>
    editActionsController.jumpToPrevError()
  );
  keyboardConfig.on('increaseFontSize', () =>
    editActionsController.increaseFontSize()
  );
  keyboardConfig.on('decreaseFontSize', () =>
    editActionsController.decreaseFontSize()
  );
  // Design action shortcuts
  keyboardConfig.on('flushCaches', () => designPanelController.flushCaches());
  keyboardConfig.on('showAST', () => designPanelController.showAST());
  keyboardConfig.on('checkValidity', () =>
    designPanelController.checkValidity()
  );

  // Display action shortcuts
  keyboardConfig.on('viewAll', () => {
    if (previewManager?.mesh) {
      previewManager.fitCameraToModel();
      announceImmediate('View fitted to model');
    }
  });
  keyboardConfig.on('toggleAxes', () =>
    displayOptionsController.toggle('axes')
  );
  keyboardConfig.on('toggleEdges', () =>
    displayOptionsController.toggle('edges')
  );
  keyboardConfig.on('toggleCrosshairs', () =>
    displayOptionsController.toggle('crosshairs')
  );
  keyboardConfig.on('toggleConsole', () =>
    getUIModeController().togglePanelVisibility('consoleOutput')
  );
  keyboardConfig.on('toggleErrorLog', () =>
    getUIModeController().togglePanelVisibility('errorLog')
  );
  keyboardConfig.on('toggleCodeEditor', () =>
    getUIModeController().togglePanelVisibility('codeEditor')
  );
  keyboardConfig.on('toggleCustomizer', () => {
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) sidebar.classList.toggle('collapsed');
  });
  keyboardConfig.on('nextPanel', () => getUIModeController().cyclePanel(1));
  keyboardConfig.on('prevPanel', () => getUIModeController().cyclePanel(-1));

  keyboardConfig.on('find', () => {
    const modeManager = getModeManager();
    if (modeManager?.isExpertMode?.() && modeManager.getEditorInstance?.()) {
      const editor = modeManager.getEditorInstance();
      if (editor.getAction) {
        const action = editor.getAction('actions.find');
        if (action) action.run();
      }
    }
  });

  keyboardConfig.on('findNext', () => {
    const modeManager = getModeManager();
    if (modeManager?.isExpertMode?.() && modeManager.getEditorInstance?.()) {
      const editor = modeManager.getEditorInstance();
      if (editor.getAction) {
        const action = editor.getAction('editor.action.nextMatchFindAction');
        if (action) action.run();
      }
    }
  });

  keyboardConfig.on('findPrevious', () => {
    const modeManager = getModeManager();
    if (modeManager?.isExpertMode?.() && modeManager.getEditorInstance?.()) {
      const editor = modeManager.getEditorInstance();
      if (editor.getAction) {
        const action = editor.getAction(
          'editor.action.previousMatchFindAction'
        );
        if (action) action.run();
      }
    }
  });

  keyboardConfig.on('findReplace', () => {
    const modeManager = getModeManager();
    if (modeManager?.isExpertMode?.() && modeManager.getEditorInstance?.()) {
      const editor = modeManager.getEditorInstance();
      if (editor.getAction) {
        const action = editor.getAction('editor.action.startFindReplaceAction');
        if (action) action.run();
      }
    }
  });

  // Expert Mode toggle (Ctrl+E) -- only in Advanced UI mode per COGA principle
  keyboardConfig.on('toggleExpertMode', () => {
    if (
      _isEnabled('expert_mode') &&
      window._modeManager &&
      getUIModeController()?.getMode() === 'advanced'
    ) {
      window._modeManager.toggleMode();
    }
  });

  // ========== GAMEPAD CONTROLLER INTEGRATION ==========
  if (gamepadController) {
    // Camera controls - use rotateHorizontal/rotateVertical for orbit
    gamepadController.on('camera:rotate', ({ x, y }) => {
      if (previewManager) {
        previewManager.rotateHorizontal(x * 0.02);
        previewManager.rotateVertical(y * 0.02);
      }
    });

    gamepadController.on('camera:zoom', ({ delta }) => {
      if (previewManager) {
        previewManager.zoomCamera(delta * 0.1);
      }
    });

    gamepadController.on('camera:pan', ({ x }) => {
      if (previewManager) {
        previewManager.panCamera(x * 0.5, 0);
      }
    });

    // Action buttons
    gamepadController.on('action:render', () => {
      const state = stateManager.getState();
      if (state.uploadedFile && !primaryActionBtn.disabled) {
        primaryActionBtn.click();
      }
    });

    gamepadController.on('action:download', () => {
      const state = stateManager.getState();
      if (state.stl && primaryActionBtn.dataset.action === 'download') {
        primaryActionBtn.click();
      }
    });

    gamepadController.on('action:cancel', () => {
      if (renderController && renderController.isRendering()) {
        renderController.cancel();
      }
    });

    // Gamepad connection feedback
    gamepadController.on('connected', (info) => {
      updateStatus(`Gamepad connected: ${info.id.split(' (')[0]}`);
    });

    gamepadController.on('disconnected', () => {
      updateStatus('Gamepad disconnected');
    });
  }

  // Global keyboard shortcuts (legacy - kept for backward compatibility)
  document.addEventListener('keydown', (e) => {
    const state = stateManager.getState();
    if (firstVisitBlocking) {
      return;
    }

    // Ctrl/Cmd + Z: Undo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      if (state.uploadedFile && stateManager.canUndo()) {
        e.preventDefault();
        performUndo();
      }
    }

    // Ctrl/Cmd + Shift + Z: Redo (also Ctrl/Cmd + Y)
    if (
      (e.ctrlKey || e.metaKey) &&
      ((e.key === 'z' && e.shiftKey) || e.key === 'y')
    ) {
      if (state.uploadedFile && stateManager.canRedo()) {
        e.preventDefault();
        performRedo();
      }
    }

    // Ctrl/Cmd + Enter: Trigger primary action (generate or download)
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      if (state.uploadedFile && !primaryActionBtn.disabled) {
        e.preventDefault();
        primaryActionBtn.click();
      }
    }

    // R key: Reset parameters (when not in input field)
    if (e.key === 'r' && !e.ctrlKey && !e.metaKey) {
      const target = e.target;
      if (
        target.tagName !== 'INPUT' &&
        target.tagName !== 'TEXTAREA' &&
        target.tagName !== 'SELECT'
      ) {
        if (state.uploadedFile) {
          e.preventDefault();
          resetBtn.click();
        }
      }
    }

    // D key: Download (when button is in download mode)
    if (e.key === 'd' && !e.ctrlKey && !e.metaKey) {
      const target = e.target;
      if (
        target.tagName !== 'INPUT' &&
        target.tagName !== 'TEXTAREA' &&
        target.tagName !== 'SELECT'
      ) {
        if (state.stl && primaryActionBtn.dataset.action === 'download') {
          e.preventDefault();
          primaryActionBtn.click();
        }
      }
    }

    // G key: Generate (when button is in generate mode)
    if (e.key === 'g' && !e.ctrlKey && !e.metaKey) {
      const target = e.target;
      if (
        target.tagName !== 'INPUT' &&
        target.tagName !== 'TEXTAREA' &&
        target.tagName !== 'SELECT'
      ) {
        if (
          state.uploadedFile &&
          primaryActionBtn.dataset.action === 'generate' &&
          !primaryActionBtn.disabled
        ) {
          e.preventDefault();
          primaryActionBtn.click();
        }
      }
    }
  });

  updateStatus('Ready - Upload a file to begin');
}

// Library UI Rendering
function renderLibraryUI(detectedLibraries) {
  const libraryControls = document.getElementById('libraryControls');
  const libraryList = document.getElementById('libraryList');
  const libraryBadge = document.getElementById('libraryBadge');
  const libraryDetails = libraryControls?.querySelector('.library-details');
  const libraryHelp = libraryControls?.querySelector('.library-help');

  if (!libraryControls || !libraryList || !libraryBadge) {
    console.warn('Library UI elements not found');
    return;
  }

  // Always show library controls
  libraryControls.classList.remove('hidden');

  // Update badge count
  libraryBadge.textContent = libraryManager.getEnabled().length;

  // Update help text based on whether libraries were detected
  if (libraryHelp) {
    if (detectedLibraries.length === 0) {
      libraryHelp.textContent =
        'No libraries detected in this model. You can still enable library bundles to use external functions and modules.';
    } else {
      libraryHelp.textContent = 'Enable libraries used by this model:';
    }
  }

  // Auto-expand only when libraries are detected
  if (libraryDetails) {
    if (detectedLibraries.length > 0) {
      libraryDetails.open = true;
    } else {
      libraryDetails.open = false;
    }
  }

  // Clear existing list
  libraryList.innerHTML = '';

  // Get all libraries
  const allLibraries = Object.values(LIBRARY_DEFINITIONS);

  // Render library checkboxes
  allLibraries.forEach((lib) => {
    const isDetected = detectedLibraries.includes(lib.id);
    const isEnabled = libraryManager.isEnabled(lib.id);

    const libraryItem = document.createElement('label');
    libraryItem.className = 'library-item';
    if (isDetected) {
      libraryItem.classList.add('library-detected');
    }

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `library-${lib.id}`;
    checkbox.checked = isEnabled;
    checkbox.setAttribute('data-library-id', lib.id);

    const icon = document.createElement('span');
    icon.className = 'library-icon';
    icon.textContent = lib.icon;
    icon.setAttribute('aria-hidden', 'true');

    const info = document.createElement('span');
    info.className = 'library-info';

    const name = document.createElement('strong');
    name.className = 'library-name';
    name.textContent = lib.name;
    if (isDetected) {
      const badge = document.createElement('span');
      badge.className = 'library-required-badge';
      badge.textContent = 'required';
      badge.setAttribute('aria-label', 'Required by this model');
      name.appendChild(badge);
    }

    const desc = document.createElement('span');
    desc.className = 'library-description';
    desc.textContent = lib.description;

    info.appendChild(name);
    info.appendChild(desc);

    libraryItem.appendChild(checkbox);
    libraryItem.appendChild(icon);
    libraryItem.appendChild(info);

    libraryList.appendChild(libraryItem);

    // Add event listener
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        libraryManager.enable(lib.id);
      } else {
        libraryManager.disable(lib.id);
      }
      libraryBadge.textContent = libraryManager.getEnabled().length;
      // Update status area with library toggle feedback
      const statusArea = document.getElementById('statusArea');
      if (statusArea) {
        statusArea.textContent = `${lib.name} ${checkbox.checked ? 'enabled' : 'disabled'}`;
      }
    });
  });
}

// Update auto-preview to include libraries
function getEnabledLibrariesForRender() {
  const paths = libraryManager.getMountPaths();
  return paths;
}

// Expose key managers to window for testing and debugging
if (typeof window !== 'undefined') {
  window.stateManager = stateManager;
  window.presetManager = presetManager;
  window.themeManager = themeManager;
  window.libraryManager = libraryManager;
}

// Global error handlers â€” catch uncaught exceptions and unhandled promise
// rejections so screen reader users receive audible feedback.
window.onerror = (message) => {
  console.error('[Global]', message);
  _announceError('An unexpected error occurred.');
};

window.addEventListener('unhandledrejection', (event) => {
  console.error('[Global] Unhandled promise rejection:', event.reason);
  _announceError('An unexpected error occurred.');
});

// Start the app
initApp();
