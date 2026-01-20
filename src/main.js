/**
 * OpenSCAD Web Customizer - Main Entry Point
 * @license GPL-3.0-or-later
 */

import './styles/main.css';
import { extractParameters } from './js/parser.js';
import {
  renderParameterUI,
  setLimitsUnlocked,
  getAllDefaults,
} from './js/ui-generator.js';
import { stateManager, getShareableURL } from './js/state.js';
import {
  downloadSTL,
  downloadFile,
  generateFilename,
  formatFileSize,
  OUTPUT_FORMATS,
} from './js/download.js';
import {
  RenderController,
  RENDER_QUALITY,
  estimateRenderTime,
} from './js/render-controller.js';
import {
  analyzeComplexity,
  getAdaptiveQualityConfig,
  getQualityPreset,
  COMPLEXITY_TIER,
} from './js/quality-tiers.js';
import { PreviewManager } from './js/preview.js';
import {
  AutoPreviewController,
  PREVIEW_STATE,
} from './js/auto-preview-controller.js';
import {
  extractZipFiles,
  validateZipFile,
  createFileTree,
  getZipStats,
} from './js/zip-handler.js';
import { themeManager, initThemeToggle } from './js/theme-manager.js';
import { presetManager } from './js/preset-manager.js';
import { ComparisonController } from './js/comparison-controller.js';
import { ComparisonView } from './js/comparison-view.js';
import { libraryManager, LIBRARY_DEFINITIONS } from './js/library-manager.js';
import { RenderQueue } from './js/render-queue.js';
import {
  openModal,
  closeModal,
  initStaticModals,
} from './js/modal-manager.js';
import {
  translateError,
} from './js/error-translator.js';
import {
  showWorkflowProgress,
  hideWorkflowProgress,
  setWorkflowStep,
  completeWorkflowStep,
  resetWorkflowProgress,
} from './js/workflow-progress.js';
import { startTutorial, closeTutorial } from './js/tutorial-sandbox.js';
import { initDrawerController } from './js/drawer-controller.js';
import { initPreviewSettingsDrawer } from './js/preview-settings-drawer.js';
import { initCameraPanelController } from './js/camera-panel-controller.js';
import Split from 'split.js';

// Example definitions (used by welcome screen and Features Guide)
const EXAMPLE_DEFINITIONS = {
  'simple-box': {
    path: '/examples/simple-box/simple_box.scad',
    name: 'simple_box.scad',
  },
  cylinder: {
    path: '/examples/parametric-cylinder/parametric_cylinder.scad',
    name: 'parametric_cylinder.scad',
  },
  'library-test': {
    path: '/examples/library-test/library_test.scad',
    name: 'library_test.scad',
  },
  'colored-box': {
    path: '/examples/colored-box/colored_box.scad',
    name: 'colored_box.scad',
  },
};

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

/**
 * Show an accessible confirmation dialog (WCAG COGA compliant)
 * Prevents accidental destructive actions by requiring explicit confirmation
 * @param {string} message - Confirmation message
 * @param {string} [title='Confirm Action'] - Dialog title
 * @param {string} [confirmLabel='Confirm'] - Label for confirm button
 * @param {string} [cancelLabel='Cancel'] - Label for cancel button
 * @returns {Promise<boolean>} True if confirmed, false if cancelled
 */
function showConfirmDialog(
  message,
  title = 'Confirm Action',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel'
) {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.className = 'preset-modal confirm-modal';
    modal.setAttribute('role', 'alertdialog');
    modal.setAttribute('aria-labelledby', 'confirmDialogTitle');
    modal.setAttribute('aria-describedby', 'confirmDialogMessage');
    modal.setAttribute('aria-modal', 'true');

    modal.innerHTML = `
      <div class="preset-modal-content confirm-modal-content">
        <div class="preset-modal-header">
          <h3 id="confirmDialogTitle" class="preset-modal-title">${title}</h3>
        </div>
        <div class="confirm-modal-body">
          <p id="confirmDialogMessage">${message}</p>
        </div>
        <div class="preset-form-actions">
          <button type="button" class="btn btn-secondary" data-action="cancel">${cancelLabel}</button>
          <button type="button" class="btn btn-primary" data-action="confirm">${confirmLabel}</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const cleanup = (result) => {
      closeModal(modal);
      document.body.removeChild(modal);
      resolve(result);
    };

    // Handle button clicks
    modal.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;

      if (btn.dataset.action === 'confirm') {
        cleanup(true);
      } else if (btn.dataset.action === 'cancel') {
        cleanup(false);
      }
    });

    // Close on backdrop click (cancel)
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        cleanup(false);
      }
    });

    // Escape closes (cancel) for consistent keyboard behavior
    modal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cleanup(false);
      }
    });

    // Open modal with focus management
    openModal(modal, {
      focusTarget: modal.querySelector('[data-action="cancel"]'),
    });
  });
}

// Sanitize URL parameters against extracted schema
function sanitizeUrlParams(extracted, urlParams) {
  const sanitized = {};
  const adjustments = {};

  for (const [key, value] of Object.entries(urlParams || {})) {
    const schema = extracted?.parameters?.[key];
    if (!schema) {
      adjustments[key] = { reason: 'unknown-param', value };
      continue;
    }

    // Enum validation
    if (Array.isArray(schema.enum)) {
      if (!schema.enum.includes(value)) {
        adjustments[key] = { reason: 'enum', value, allowed: schema.enum };
        continue;
      }
      sanitized[key] = value;
      continue;
    }

    // Numeric validation/clamping
    if (typeof value === 'number') {
      let nextValue = value;
      if (schema.minimum !== undefined && nextValue < schema.minimum) {
        adjustments[key] = {
          reason: 'min',
          value,
          minimum: schema.minimum,
          maximum: schema.maximum,
        };
        nextValue = schema.minimum;
      }
      if (schema.maximum !== undefined && nextValue > schema.maximum) {
        adjustments[key] = {
          reason: 'max',
          value,
          minimum: schema.minimum,
          maximum: schema.maximum,
        };
        nextValue = schema.maximum;
      }
      if (schema.type === 'integer') {
        nextValue = Math.round(nextValue);
      }
      sanitized[key] = nextValue;
      continue;
    }

    // Booleans and strings (non-enum) pass through
    sanitized[key] = value;
  }

  return { sanitized, adjustments };
}

// Initialize app
async function initApp() {
  console.log('OpenSCAD Web Customizer v2.9.0 (WASM Progress & Mobile)');
  console.log('Initializing...');

  let statusArea = null;
  let cameraPanelController = null; // Declared here, initialized later
  let autoPreviewEnabled = true;
  let previewQuality = RENDER_QUALITY.PREVIEW;
  let previewQualityMode = 'balanced';

  const AUTO_PREVIEW_FORCE_FAST_MS = 2 * 60 * 1000;
  const AUTO_PREVIEW_SLOW_RENDER_MS = 7000;
  const AUTO_PREVIEW_TRIANGLE_THRESHOLD = 200000;
  const autoPreviewHints = {
    forceFastUntil: 0,
    lastPreviewDurationMs: null,
    lastPreviewTriangles: null,
  };
  let adaptivePreviewMemo = { key: null, info: null };

  // Register Service Worker for PWA support
  // In development, avoid Service Worker caching/stale assets which can break testing.
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
      });
      console.log('[PWA] Service Worker registered:', registration.scope);

      // Handle updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        console.log('[PWA] Update found, installing new service worker');

        newWorker.addEventListener('statechange', () => {
          if (
            newWorker.state === 'installed' &&
            navigator.serviceWorker.controller
          ) {
            // New version available - silent background update
            console.log(
              '[PWA] New version available - will activate on next reload'
            );
          }
        });
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
    }
  } else {
    console.log('[PWA] Service Worker disabled (dev) or not supported');
  }

  // Note: App is installable via browser-native prompts (Chrome address bar, iOS Share menu)
  // No custom install UI needed

  // Show success message for native installation
  window.addEventListener('appinstalled', () => {
    console.log('[PWA] App installed successfully via browser');

    const statusArea = document.getElementById('statusArea');
    if (statusArea) {
      const originalText = statusArea.textContent;
      statusArea.textContent = '✅ App installed! You can now use it offline.';
      setTimeout(() => {
        statusArea.textContent = originalText;
      }, 5000);
    }
  });

  // Initialize theme (before any UI rendering)
  themeManager.init();

  // Initialize static modal focus management (WCAG 2.2 SC 2.4.11 Focus Not Obscured)
  initStaticModals();

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

  // Declare format selector elements
  const outputFormatSelect = document.getElementById('outputFormat');
  const formatInfo = document.getElementById('formatInfo');

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
          primaryActionBtn.textContent = `📥 Download ${formatName}`;
          primaryActionBtn.setAttribute(
            'aria-label',
            `Download generated ${formatName} file`
          );
        }
      }
    });

    // Set initial format info
    const initialFormat = outputFormatSelect.value;
    formatInfo.textContent = OUTPUT_FORMATS[initialFormat]?.description || '';
  }

  // Check browser support
  const support = checkBrowserSupport();
  if (!support.supported) {
    showUnsupportedBrowser(support.missing);
    return;
  }

  // Initialize render controller
  console.log('Initializing OpenSCAD WASM...');
  renderController = new RenderController();

  // Set up memory warning callback
  renderController.setMemoryWarningCallback((memoryInfo) => {
    console.warn(
      `[Memory] High usage: ${memoryInfo.usedMB}MB / ${memoryInfo.limitMB}MB (${memoryInfo.percent}%)`
    );
    showMemoryWarning(memoryInfo);
    if (previewQualityMode === 'auto') {
      autoPreviewHints.forceFastUntil = Date.now() + AUTO_PREVIEW_FORCE_FAST_MS;
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

  // Show WASM loading progress indicator
  const wasmLoadingOverlay = showWasmLoadingIndicator();

  try {
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
  } catch (error) {
    console.error('Failed to initialize OpenSCAD WASM:', error);
    hideWasmLoadingIndicator(wasmLoadingOverlay);
    updateStatus('OpenSCAD engine failed to initialize');
    const details = error?.details ? ` Details: ${error.details}` : '';
    alert(
      'Failed to initialize OpenSCAD engine. Some features may not work. Error: ' +
        error.message +
        details
    );
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
        <span class="memory-warning-icon">⚠️</span>
        <div class="memory-warning-text">
          <strong>High Memory Usage</strong>
          <p>Memory: ${memoryInfo.usedMB}MB / ${memoryInfo.limitMB}MB (${memoryInfo.percent}%)</p>
          <p class="memory-warning-hint">Consider simplifying your model or reducing $fn value.</p>
        </div>
        <button class="btn btn-sm btn-outline memory-warning-dismiss" aria-label="Dismiss warning">×</button>
      </div>
    `;

    document.body.appendChild(warning);

    // Handle dismiss
    warning
      .querySelector('.memory-warning-dismiss')
      .addEventListener('click', () => {
        warning.remove();
      });

    // Auto-dismiss after 15 seconds
    setTimeout(() => {
      if (warning.parentElement) {
        warning.remove();
      }
    }, 15000);
  }

  /**
   * Show render time estimate to user
   * @param {Object} estimate - Result from estimateRenderTime()
   */
  function showRenderEstimate(estimate) {
    if (!estimate || estimate.seconds < 5) return; // Only show for longer renders

    let message = `Estimated render time: ~${estimate.seconds}s`;
    if (estimate.warning) {
      message += ` ⚠️ ${estimate.warning}`;
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
  const previewStatusBar = document.getElementById('previewStatusBar');
  const previewStatusText = document.getElementById('previewStatusText');
  const previewStatusStats = document.getElementById('previewStatusStats');
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
  const dimensionsDisplay = document.getElementById('dimensionsDisplay');
  // Note: outputFormatSelect and formatInfo already declared above

  // Create preview state indicator element
  const previewStateIndicator = document.createElement('div');
  previewStateIndicator.className = 'preview-state-indicator state-idle';
  previewStateIndicator.textContent = 'No preview';
  previewStateIndicator.setAttribute('aria-live', 'polite');

  // Create rendering overlay
  const renderingOverlay = document.createElement('div');
  renderingOverlay.className = 'preview-rendering-overlay';
  renderingOverlay.innerHTML = `
    <div class="spinner spinner-large"></div>
    <span class="rendering-text">Generating preview...</span>
  `;

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
      estimatedSlow =
        estimate.warning ||
        estimate.seconds >= 12 ||
        estimate.complexity >= 120;
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
      autoPreviewEnabled = autoPreviewToggle.checked;
      if (autoPreviewController) {
        autoPreviewController.setEnabled(autoPreviewEnabled);
      }
    });
  }

  if (previewQualitySelect) {
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

  // Wire status bar toggle
  const statusBarToggle = document.getElementById('statusBarToggle');
  if (statusBarToggle && previewStatusBar) {
    // Initialize from localStorage
    const savedStatusBarPref = localStorage.getItem(
      'openscad-customizer-status-bar'
    );
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
      localStorage.setItem(
        'openscad-customizer-status-bar',
        enabled ? 'true' : 'false'
      );
      console.log(`[App] Status bar ${enabled ? 'shown' : 'hidden'}`);
    });
  }

  // Wire model color picker
  const modelColorPicker = document.getElementById('modelColorPicker');
  const modelColorReset = document.getElementById('modelColorReset');

  // Load saved model color from localStorage
  const savedModelColor = localStorage.getItem(
    'openscad-customizer-model-color'
  );
  if (savedModelColor && modelColorPicker) {
    modelColorPicker.value = savedModelColor;
  }

  if (modelColorPicker) {
    modelColorPicker.addEventListener('input', () => {
      const color = modelColorPicker.value;
      if (previewManager) {
        previewManager.setColorOverride(color);
      }
      // Save to localStorage
      localStorage.setItem('openscad-customizer-model-color', color);
      console.log(`[App] Model color changed to ${color}`);
    });
  }

  if (modelColorReset) {
    modelColorReset.addEventListener('click', () => {
      if (previewManager) {
        previewManager.setColorOverride(null);
      }
      // Reset picker to theme default and clear localStorage
      if (modelColorPicker) {
        // Get the theme default color
        const themeDefault = getThemeDefaultColor();
        modelColorPicker.value = themeDefault;
      }
      localStorage.removeItem('openscad-customizer-model-color');
      console.log('[App] Model color reset to theme default');
    });
  }

  /**
   * Get the theme default model color
   */
  function getThemeDefaultColor() {
    const activeTheme = themeManager.getActiveTheme();
    const highContrast = themeManager.isHighContrastEnabled();
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
      document.getElementById('dimX').textContent = `${dimensions.x} mm`;
      document.getElementById('dimY').textContent = `${dimensions.y} mm`;
      document.getElementById('dimZ').textContent = `${dimensions.z} mm`;
      document.getElementById('dimVolume').textContent =
        `${dimensions.volume.toLocaleString()} mm³`;
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
        ? '✓ Preview (cached)'
        : '✓ Preview ready',
      [PREVIEW_STATE.PENDING]: '⏳ Changes pending...',
      [PREVIEW_STATE.RENDERING]: '⟳ Generating...',
      [PREVIEW_STATE.STALE]: '⚠ Preview outdated',
      [PREVIEW_STATE.ERROR]: '✗ Preview failed',
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

      // Also update the preview status bar stats
      updatePreviewStats(extra.stats, extra.fullQuality, previewPercentText);
    }
  }

  /**
   * Update the preview status bar stats display
   * @param {Object} stats - Stats object with size and triangles
   * @param {boolean} fullQuality - Whether this is full quality render
   * @param {string} percentText - Optional percentage text for preview quality
   */
  function updatePreviewStats(stats, fullQuality = false, percentText = '') {
    if (!previewStatusStats || !previewStatusBar) return;

    if (!stats) {
      previewStatusStats.textContent = '';
      previewStatusBar.classList.add('no-stats');
      return;
    }

    const qualityText = fullQuality ? 'Full' : `Preview${percentText}`;
    previewStatusStats.textContent = `${qualityText} | ${formatFileSize(stats.size)} | ${stats.triangles.toLocaleString()} triangles`;
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
   */
  function initAutoPreviewController() {
    if (!renderController || !previewManager) {
      console.warn(
        '[AutoPreview] Cannot init - missing controller or preview manager'
      );
      return;
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
          }
          updatePreviewStateUI(newState, extra);
        },
        onPreviewReady: (stl, stats, cached) => {
          console.log('[AutoPreview] Preview ready, cached:', cached);
          // Update button state - preview available but may need full render for download
          updatePrimaryActionButton();
          // Update dimensions display
          updateDimensionsDisplay();
        },
        onProgress: (percent, message, type) => {
          if (type === 'preview') {
            if (percent < 0) {
              updateStatus(`Preview: ${message}`);
            } else {
              updateStatus(`Preview: ${message} (${Math.round(percent)}%)`);
            }
          } else {
            // Full render progress
            if (percent < 0) {
              updateStatus(message);
            } else {
              updateStatus(`${message} (${Math.round(percent)}%)`);
            }
          }
        },
        onError: (error, type) => {
          if (type === 'preview') {
            console.error('[AutoPreview] Preview error:', error);
            updateStatus(`Preview failed: ${error.message}`);
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
   * Update the primary action button based on current state
   * With auto-preview, the button has three states:
   * - "Download STL" when full-quality STL is ready for current params
   * - "Generate & Download" when we have a preview but need full render
   * - "Generate STL" when no preview exists yet
   * Also shows/hides the fallback download link
   */
  function updatePrimaryActionButton() {
    const state = stateManager.getState();
    const hasLegacySTL = !!state.stl;
    const currentParamsHash = hashParams(state.parameters);
    const paramsChanged = currentParamsHash !== lastGeneratedParamsHash;

    // Check auto-preview controller state
    const hasFullQualitySTL = autoPreviewController?.getCurrentFullSTL(
      state.parameters
    );
    const needsFullRender =
      !hasFullQualitySTL ||
      autoPreviewController?.needsFullRender(state.parameters);

    if (hasFullQualitySTL && !needsFullRender) {
      // Full quality STL is ready and matches current parameters - show Download
      primaryActionBtn.textContent = '📥 Download STL';
      primaryActionBtn.dataset.action = 'download';
      primaryActionBtn.classList.remove('btn-primary');
      primaryActionBtn.classList.add('btn-success');
      primaryActionBtn.setAttribute(
        'aria-label',
        'Download generated STL file (full quality)'
      );
      // Hide fallback since primary button is download
      downloadFallbackLink.classList.add('hidden');
    } else {
      // Need to generate (no full STL yet, or params changed)
      primaryActionBtn.textContent = 'Generate STL';
      primaryActionBtn.dataset.action = 'generate';
      primaryActionBtn.classList.remove('btn-success');
      primaryActionBtn.classList.add('btn-primary');
      primaryActionBtn.setAttribute(
        'aria-label',
        'Generate STL file from current parameters'
      );

      // Show fallback download link if STL exists but params changed
      if (hasLegacySTL && paramsChanged) {
        downloadFallbackLink.classList.remove('hidden');
      } else {
        downloadFallbackLink.classList.add('hidden');
      }
    }
  }

  // Check for saved draft
  const draft = stateManager.loadFromLocalStorage();
  if (draft) {
    const shouldRestore = confirm(
      `Found a saved draft of "${draft.fileName}" from ${new Date(draft.timestamp).toLocaleString()}.\n\nWould you like to restore it?`
    );

    if (shouldRestore) {
      console.log('Restoring draft...');
      // Treat draft as uploaded file
      handleFile({ name: draft.fileName }, draft.fileContent);
      updateStatus('Draft restored');
    } else {
      stateManager.clearLocalStorage();
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
      handleFile({ name: fileName }, scadContent);

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

  // Upload size limits (configurable)
  const UPLOAD_SIZE_LIMITS = {
    SINGLE_FILE_MB: 5,
    ZIP_FILE_MB: 10,
  };

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

  /**
   * Detect include/use statements in SCAD content
   * @param {string} scadContent - OpenSCAD source code
   * @returns {Object} Detection result with hasIncludes, hasUse, and files array
   */
  function detectIncludeUse(scadContent) {
    // Match include <...> and use <...> statements
    const includePattern = /^\s*include\s*<([^>]+)>/gm;
    const usePattern = /^\s*use\s*<([^>]+)>/gm;

    const includes = [];
    const uses = [];

    let match;
    while ((match = includePattern.exec(scadContent)) !== null) {
      includes.push(match[1]);
    }

    while ((match = usePattern.exec(scadContent)) !== null) {
      uses.push(match[1]);
    }

    return {
      hasIncludes: includes.length > 0,
      hasUse: uses.length > 0,
      includes,
      uses,
      files: [...includes, ...uses],
    };
  }

  // Handle file upload (supports both .scad and .zip files)
  async function handleFile(
    file,
    content = null,
    extractedFiles = null,
    mainFilePathArg = null
  ) {
    if (!file && !content) return;

    let fileName = file ? file.name : 'example.scad';
    let fileContent = content;
    let projectFiles = extractedFiles; // Map of additional files for multi-file projects
    let mainFilePath = mainFilePathArg; // Path to main file in multi-file project (passed from ZIP extraction)

    if (file) {
      const isZip = file.name.toLowerCase().endsWith('.zip');
      const isScad = file.name.toLowerCase().endsWith('.scad');

      if (!isZip && !isScad) {
        alert('Please upload a .scad or .zip file');
        return;
      }

      // Handle ZIP files
      if (isZip) {
        const validation = validateZipFile(file);
        if (!validation.valid) {
          alert(validation.error);
          return;
        }

        try {
          updateStatus('Extracting ZIP file...');
          const { files, mainFile } = await extractZipFiles(file);

          // Get statistics
          const stats = getZipStats(files);
          console.log('[ZIP] Statistics:', stats);

          // Show file tree
          const fileTreeHtml = createFileTree(files, mainFile);
          const infoArea = document.getElementById('fileInfo');
          if (infoArea) {
            infoArea.innerHTML = `${file.name} → ${mainFile}<br>${fileTreeHtml}`;
          }

          // Get main file content
          fileContent = files.get(mainFile);
          fileName = mainFile;
          mainFilePath = mainFile;

          // Store all files except the main one (main is passed as scadContent)
          projectFiles = new Map(files);
          // Note: We keep the main file in projectFiles for include/use resolution

          console.log(
            `[ZIP] Loaded multi-file project: ${mainFile} (${stats.totalFiles} files)`
          );

          // Continue with extracted content, passing mainFilePath as 4th argument
          handleFile(null, fileContent, projectFiles, mainFilePath);
          return;
        } catch (error) {
          console.error('[ZIP] Extraction failed:', error);
          updateStatus('Failed to extract ZIP file');
          alert(error.message);
          return;
        }
      }

      // Handle single .scad files (existing logic)
      if (file.size > UPLOAD_SIZE_LIMITS.SINGLE_FILE_MB * 1024 * 1024) {
        alert(`File size exceeds ${UPLOAD_SIZE_LIMITS.SINGLE_FILE_MB}MB limit`);
        return;
      }
    }

    if (file && !content) {
      const reader = new FileReader();
      reader.onload = (e) => {
        handleFile(null, e.target.result, extractedFiles, mainFilePath);
      };
      reader.readAsText(file);
      return;
    }

    console.log('File loaded:', fileName, fileContent.length, 'bytes');

    // Extract parameters
    updateStatus('Extracting parameters...');
    try {
      const extracted = extractParameters(fileContent);
      console.log('Extracted parameters:', extracted);

      const paramCount = Object.keys(extracted.parameters).length;
      console.log(
        `Found ${paramCount} parameters in ${extracted.groups.length} groups`
      );
      const colorParamNames = Object.values(extracted.parameters)
        .filter((param) => param.uiType === 'color')
        .map((param) => param.name);

      // Analyze file complexity to determine quality tier
      const complexityAnalysis = analyzeComplexity(fileContent, {});
      const adaptiveConfig = getAdaptiveQualityConfig(fileContent, {});

      console.log('[Complexity] Analysis:', {
        tier: adaptiveConfig.tierName,
        score: complexityAnalysis.score,
        curvedFeatures: complexityAnalysis.estimatedCurvedFeatures,
        hardware: adaptiveConfig.hardware.level,
        warnings: complexityAnalysis.warnings,
      });

      // Show complexity warnings if any
      if (complexityAnalysis.warnings.length > 0) {
        complexityAnalysis.warnings.forEach((w) =>
          console.warn('[Complexity]', w)
        );
      }

      // Store in state (including project files for multi-file support)
      stateManager.setState({
        uploadedFile: { name: fileName, content: fileContent },
        projectFiles: projectFiles || null, // Map of additional files (null for single-file projects)
        mainFilePath: mainFilePath || fileName, // Track main file path
        schema: extracted,
        parameters: {},
        defaults: {},
        // Adaptive quality configuration
        complexityTier: adaptiveConfig.tier,
        complexityAnalysis: complexityAnalysis,
        adaptiveQualityConfig: adaptiveConfig,
      });

      // Clear undo/redo history on new file upload
      stateManager.clearHistory();

      // Show main interface
      welcomeScreen.classList.add('hidden');
      mainInterface.classList.remove('hidden');

      // Update workflow progress (C3: COGA breadcrumbs)
      showWorkflowProgress();
      completeWorkflowStep('upload');
      setWorkflowStep('customize');

      // Detect include/use statements for single-file uploads
      let includeUseWarning = '';
      if (!projectFiles || projectFiles.size <= 1) {
        const detection = detectIncludeUse(fileContent);
        if (detection.hasIncludes || detection.hasUse) {
          const fileList = detection.files.join(', ');
          includeUseWarning = `\n⚠️ Note: This file references external files (${fileList}). For multi-file projects, upload a ZIP containing all files.`;
          console.warn(
            '[Upload] Single-file upload with include/use detected:',
            detection.files
          );
        }
      }

      // Calculate file size
      const fileSizeBytes = file ? file.size : fileContent.length;
      const fileSizeStr = formatFileSize(fileSizeBytes);

      // Update file info (preserve file tree for multi-file projects)
      const fileInfo = document.getElementById('fileInfo');
      const fileInfoSummary = document.getElementById('fileInfoSummary');
      const fileInfoDetails = document.getElementById('fileInfoDetails');
      const fileInfoTree = document.getElementById('fileInfoTree');

      if (fileInfo && fileInfoSummary) {
        // Always show compact summary
        const summaryText = `${fileName} (${paramCount} parameters, ${fileSizeStr})`;
        fileInfoSummary.textContent = summaryText;
        fileInfoSummary.title = summaryText; // Full text in tooltip

        // Show file tree in disclosure if multi-file project
        if (
          projectFiles &&
          projectFiles.size > 1 &&
          fileInfoDetails &&
          fileInfoTree
        ) {
          const treeHtml = createFileTree(
            projectFiles,
            mainFilePath || fileName
          );
          fileInfoTree.innerHTML = treeHtml;
          fileInfoDetails.classList.remove('hidden');
        } else if (fileInfoDetails) {
          fileInfoDetails.classList.add('hidden');
        }
      }

      // Enable compact header after file is loaded
      const appHeader = document.querySelector('.app-header');
      if (appHeader) {
        appHeader.classList.add('compact');
      }

      // Update complexity tier indicator
      const complexityTierLabel = document.getElementById(
        'complexityTierLabel'
      );
      if (complexityTierLabel) {
        const tierName = adaptiveConfig.tierName;
        const tierIcon =
          {
            Beginner: '🟢',
            Standard: '🔵',
            Complex: '🟡',
          }[tierName] || '⚪';

        complexityTierLabel.textContent = `${tierIcon} ${tierName}`;
        complexityTierLabel.className = `complexity-tier-label tier-${adaptiveConfig.tier}`;
        complexityTierLabel.title =
          `${adaptiveConfig.tierDescription}\n` +
          `Curved features: ~${complexityAnalysis.estimatedCurvedFeatures}\n` +
          `Hardware: ${adaptiveConfig.hardware.level}\n` +
          `Preview: ${adaptiveConfig.defaultPreviewLevel}, Export: ${adaptiveConfig.defaultExportLevel}`;
      }

      // Show include/use warning in status if detected
      if (includeUseWarning) {
        updateStatus(`File loaded. ${includeUseWarning.trim()}`);
      }

      // Handle detected libraries
      const detectedLibraries = extracted.libraries || [];
      console.log('Detected libraries:', detectedLibraries);
      stateManager.setState({
        detectedLibraries,
      });

      // Auto-enable detected libraries
      if (detectedLibraries.length > 0) {
        const autoEnabled = libraryManager.autoEnable(fileContent);
        if (autoEnabled.length > 0) {
          console.log('Auto-enabled libraries:', autoEnabled);
          updateStatus(`Enabled ${autoEnabled.length} required libraries`);
        }
      }

      // Always show library UI (even when no libraries detected)
      renderLibraryUI(detectedLibraries);

      // Render parameter UI
      const parametersContainer = document.getElementById(
        'parametersContainer'
      );
      const currentValues = renderParameterUI(
        extracted,
        parametersContainer,
        (values) => {
          // Record state for undo before applying change
          stateManager.recordParameterState();
          stateManager.setState({ parameters: values });
          // Clear preset selection when parameters are manually changed
          clearPresetSelection();
          // Trigger auto-preview on parameter change
          if (autoPreviewController) {
            autoPreviewController.onParameterChange(values);
          }
          // Update button state when parameters change
          updatePrimaryActionButton();
        }
      );

      // Store default values
      stateManager.setState({
        parameters: currentValues,
        defaults: { ...currentValues },
      });

      // Load URL parameters if present (after defaults are set)
      const urlParams = stateManager.loadFromURL();
      if (urlParams && Object.keys(urlParams).length > 0) {
        console.log('Loaded parameters from URL:', urlParams);

        const { sanitized, adjustments } = sanitizeUrlParams(
          extracted,
          urlParams
        );

        // Re-render UI with URL parameters - MUST include updatePrimaryActionButton in callback!
        const updatedValues = renderParameterUI(
          extracted,
          parametersContainer,
          (values) => {
            // Record state for undo before applying change
            stateManager.recordParameterState();
            stateManager.setState({ parameters: values });
            // Clear preset selection when parameters are manually changed
            clearPresetSelection();
            // Trigger auto-preview on parameter change
            if (autoPreviewController) {
              autoPreviewController.onParameterChange(values);
            }
            // Update button state when parameters change
            updatePrimaryActionButton();
          },
          sanitized
        );

        // Ensure state matches sanitized UI values
        stateManager.setState({ parameters: updatedValues });

        if (Object.keys(adjustments).length > 0) {
          updateStatus(
            'Some URL parameters were adjusted to fit allowed ranges.'
          );
        }

        // Trigger initial auto-preview with URL params
        if (autoPreviewController) {
          autoPreviewController.onParameterChange(updatedValues);
        }

        updateStatus(
          `Ready - ${paramCount} parameters loaded (${Object.keys(urlParams).length} from URL)`
        );
      } else {
        updateStatus(`Ready - ${paramCount} parameters loaded`);
      }

      // Initialize 3D preview (lazy loads Three.js)
      if (!previewManager) {
        previewManager = new PreviewManager(previewContainer);
        await previewManager.init();

        // Sync measurements toggle with saved preference
        if (measurementsToggle) {
          measurementsToggle.checked = previewManager.measurementsEnabled;
        }

        // Sync grid toggle with saved preference
        if (gridToggle) {
          gridToggle.checked = previewManager.gridEnabled;
        }

        // Update camera panel controller with preview manager reference
        if (cameraPanelController) {
          cameraPanelController.setPreviewManager(previewManager);
        }

        // Apply saved model color if exists
        const savedModelColor = localStorage.getItem(
          'openscad-customizer-model-color'
        );
        if (savedModelColor) {
          previewManager.setColorOverride(savedModelColor);
        }

        // Listen for theme changes and update preview
        themeManager.addListener((theme, activeTheme, highContrast) => {
          if (previewManager) {
            previewManager.updateTheme(activeTheme, highContrast);

            // Update color picker to show theme default when no custom color is set
            const modelColorPicker =
              document.getElementById('modelColorPicker');
            const hasSavedColor = localStorage.getItem(
              'openscad-customizer-model-color'
            );
            if (modelColorPicker && !hasSavedColor) {
              const themeKey = highContrast ? `${activeTheme}-hc` : activeTheme;
              const PREVIEW_COLORS = {
                light: 0x2196f3,
                dark: 0x4d9fff,
                'light-hc': 0x0052cc,
                'dark-hc': 0x66b3ff,
              };
              const colorHex = PREVIEW_COLORS[themeKey] || PREVIEW_COLORS.light;
              modelColorPicker.value =
                '#' + colorHex.toString(16).padStart(6, '0');
            }
          }
        });

        // Add preview state indicator and rendering overlay to container
        previewContainer.style.position = 'relative';
        previewContainer.appendChild(previewStateIndicator);
        previewContainer.appendChild(renderingOverlay);
      }

      // Initialize or update AutoPreviewController
      if (!autoPreviewController) {
        initAutoPreviewController();
      }
      if (autoPreviewController) {
        autoPreviewController.setColorParamNames(colorParamNames);
      }

      // Set the SCAD content and project files for auto-preview
      if (autoPreviewController) {
        autoPreviewController.setScadContent(fileContent);
        autoPreviewController.setProjectFiles(projectFiles, mainFilePath);
        // CRITICAL: Set enabled libraries BEFORE triggering initial preview
        const libsForRender = getEnabledLibrariesForRender();
        autoPreviewController.setEnabledLibraries(libsForRender);
        updatePreviewStateUI(PREVIEW_STATE.IDLE);

        // Trigger initial preview immediately on first load (and also for URL-param loads).
        // This makes the app feel responsive without requiring a first parameter change.
        if (autoPreviewEnabled) {
          // Use .then()/.catch() to handle errors without blocking file load completion
          autoPreviewController
            .forcePreview(stateManager.getState().parameters)
            .then((initiated) => {
              if (initiated) {
                console.log('[Init] Initial preview render started');
              } else {
                console.warn('[Init] Initial preview render was skipped');
              }
            })
            .catch((error) => {
              console.error('[Init] Initial preview render failed:', error);
              updatePreviewStateUI(PREVIEW_STATE.ERROR, {
                error: error.message,
              });
              updateStatus(`Initial preview failed: ${error.message}`);
            });
        }
      }
    } catch (error) {
      console.error('Failed to extract parameters:', error);
      updateStatus('Error: Failed to extract parameters');
      alert(
        'Failed to extract parameters from file. Please check the file format.'
      );
    }
  }

  // File input change
  fileInput.addEventListener('change', (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;
    handleFile(selectedFile);
    // Allow re-selecting the same file if needed
    e.target.value = '';
  });

  // Back button - returns to welcome screen
  if (clearFileBtn) {
    clearFileBtn.addEventListener('click', () => {
      // Confirm before going back - warn about unsaved changes
      if (
        confirm(
          'Go back to the welcome screen?\n\nAny unsaved changes to your current project will be lost.'
        )
      ) {
        // Reset file input
        fileInput.value = '';

        // Clear state
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
        });

        // Clear history
        stateManager.clearHistory();

        // Hide main interface, show welcome screen
        mainInterface.classList.add('hidden');
        welcomeScreen.classList.remove('hidden');

        // Reset and hide workflow progress
        resetWorkflowProgress();
        hideWorkflowProgress();

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

        // Clear preview
        if (previewManager) {
          previewManager.clear();
        }

        // Reset status
        updateStatus('Ready');
        statsArea.textContent = '';
        clearPreviewStats();

        // Clear file info
        const fileInfoSummary = document.getElementById('fileInfoSummary');
        const fileInfoDetails = document.getElementById('fileInfoDetails');
        if (fileInfoSummary) {
          fileInfoSummary.textContent = '';
        }
        if (fileInfoDetails) {
          fileInfoDetails.classList.add('hidden');
        }

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
    handleFile(e.dataTransfer.files[0]);
  });

  // Click to upload is handled by the label wrapping the input.

  // Keyboard support for upload zone
  uploadZone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput.click();
    }
  });

  // Shared example loader (reusable by welcome buttons and Features Guide)
  async function loadExampleByKey(
    exampleKey,
    { closeFeaturesGuideModal = false } = {}
  ) {
    const example = EXAMPLE_DEFINITIONS[exampleKey];
    if (!example) {
      console.error('Unknown example type:', exampleKey);
      return;
    }

    // If a tutorial is open, close it before switching context.
    // This prevents stale highlights/listeners from referencing the previous UI state.
    try {
      closeTutorial();
    } catch {
      // ignore (tutorial module may not be initialized)
    }

    // Confirm before replacing if file already uploaded
    const state = stateManager.getState();
    if (state.uploadedFile) {
      if (!confirm('Load example? This will replace the current file.')) {
        return;
      }
    }

    try {
      updateStatus('Loading example...');
      const response = await fetch(example.path);
      if (!response.ok) throw new Error('Failed to fetch example');

      const content = await response.text();
      console.log('Example loaded:', example.name, content.length, 'bytes');

      // Close modal if requested
      if (closeFeaturesGuideModal) {
        const featuresGuideModal =
          document.getElementById('featuresGuideModal');
        if (featuresGuideModal) {
          // Use shared modal manager so focus restores correctly
          closeModal(featuresGuideModal);
        }
      }

      // Treat as uploaded file
      handleFile({ name: example.name }, content);
    } catch (error) {
      console.error('Failed to load example:', error);
      updateStatus('Error loading example');
      alert(
        'Failed to load example file. The file may not be available in the public directory.'
      );
    }
  }

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
      await loadExampleByKey(exampleType);

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

  // Undo/Redo buttons
  const undoBtn = document.getElementById('undoBtn');
  const redoBtn = document.getElementById('redoBtn');

  undoBtn?.addEventListener('click', () => {
    const previousParams = stateManager.undo();
    if (previousParams) {
      const state = stateManager.getState();

      // Re-render UI with undone parameters
      const parametersContainer = document.getElementById(
        'parametersContainer'
      );
      renderParameterUI(
        state.schema,
        parametersContainer,
        (values) => {
          stateManager.recordParameterState();
          stateManager.setState({ parameters: values });
          clearPresetSelection();
          if (autoPreviewController && state.uploadedFile) {
            autoPreviewController.onParameterChange(values);
          }
          updatePrimaryActionButton();
        },
        previousParams
      );

      // Trigger auto-preview with undone params
      if (autoPreviewController && state.uploadedFile) {
        autoPreviewController.onParameterChange(previousParams);
      }

      updatePrimaryActionButton();
    }
  });

  redoBtn?.addEventListener('click', () => {
    const nextParams = stateManager.redo();
    if (nextParams) {
      const state = stateManager.getState();

      // Re-render UI with redone parameters
      const parametersContainer = document.getElementById(
        'parametersContainer'
      );
      renderParameterUI(
        state.schema,
        parametersContainer,
        (values) => {
          stateManager.recordParameterState();
          stateManager.setState({ parameters: values });
          clearPresetSelection();
          if (autoPreviewController && state.uploadedFile) {
            autoPreviewController.onParameterChange(values);
          }
          updatePrimaryActionButton();
        },
        nextParams
      );

      // Trigger auto-preview with redone params
      if (autoPreviewController && state.uploadedFile) {
        autoPreviewController.onParameterChange(nextParams);
      }

      updatePrimaryActionButton();
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
      clearPresetSelection();

      // Re-render UI with defaults
      const parametersContainer = document.getElementById(
        'parametersContainer'
      );
      renderParameterUI(state.schema, parametersContainer, (values) => {
        stateManager.recordParameterState();
        stateManager.setState({ parameters: values });
        // Clear preset selection when parameters are manually changed
        clearPresetSelection();
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
    const STORAGE_KEY_COLLAPSED = 'openscad-customizer-param-panel-collapsed';
    let isCollapsed = false;

    try {
      const savedState = localStorage.getItem(STORAGE_KEY_COLLAPSED);
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
        localStorage.setItem(STORAGE_KEY_COLLAPSED, String(isCollapsed));
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

  // Resizable Split Panels (Desktop only - horizontal split between params and preview)
  let splitInstance = null;
  const previewPanel = document.querySelector('.preview-panel');

  // Note: Vertical split (preview info vs canvas) is now handled by the overlay drawer
  // in preview-settings-drawer.js - no Split.js needed for that anymore

  if (paramPanel && previewPanel) {
    const STORAGE_KEY_SPLIT = 'openscad-customizer-split-sizes';

    // Load saved split sizes
    let initialSizes = [40, 60]; // Default: 40% params, 60% preview
    try {
      const savedSizes = localStorage.getItem(STORAGE_KEY_SPLIT);
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

      splitInstance = Split([paramPanel, previewPanel], {
        sizes: initialSizes,
        minSize: minSizes,
        gutterSize: 8,
        cursor: 'col-resize',
        onDrag: () => {
          // Trigger preview resize during drag (throttled by RAF)
          if (previewManager) {
            requestAnimationFrame(() => {
              previewManager.handleResize();
            });
          }
        },
        onDragEnd: (sizes) => {
          // Persist sizes
          try {
            localStorage.setItem(STORAGE_KEY_SPLIT, JSON.stringify(sizes));
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
                    STORAGE_KEY_SPLIT,
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
    });

    // Initialize actions drawer toggle
    const initActionsDrawer = () => {
      const toggleBtn = document.getElementById('actionsDrawerToggle');
      const drawer = document.getElementById('actionsDrawer');

      if (!toggleBtn || !drawer) return;

      toggleBtn.addEventListener('click', () => {
        const isExpanded = !drawer.classList.contains('collapsed');

        if (isExpanded) {
          // Collapse drawer
          drawer.classList.add('collapsed');
          toggleBtn.setAttribute('aria-expanded', 'false');
          toggleBtn.setAttribute('aria-label', 'Expand actions menu');
        } else {
          // Expand drawer
          drawer.classList.remove('collapsed');
          toggleBtn.setAttribute('aria-expanded', 'true');
          toggleBtn.setAttribute('aria-label', 'Collapse actions menu');
        }
      });

      // Keep drawer collapsed on resize if screen is small
      window.addEventListener('resize', () => {
        // On mobile, keep drawer behavior consistent
        // On desktop, drawer can stay expanded
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
  // mainInterface is already declared at line 484
  // comparisonView container is accessed via DOM query

  if (focusModeBtn && mainInterface) {
    let isFocusMode = false;

    // Toggle focus mode
    const toggleFocusMode = function () {
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
      } else {
        // Exit focus mode
        mainInterface.classList.remove('focus-mode');
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
        // Mark workflow download step as complete
        completeWorkflowStep('download');
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
      // Mark workflow download step as complete
      completeWorkflowStep('download');
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
      const outputFormat = outputFormatSelect?.value || 'stl';
      const formatName =
        OUTPUT_FORMATS[outputFormat]?.name || outputFormat.toUpperCase();

      primaryActionBtn.disabled = true;
      primaryActionBtn.textContent = `⏳ Generating ${formatName}...`;

      // Show cancel button
      cancelRenderBtn.classList.remove('hidden');

      // Disable undo/redo during rendering to prevent state mismatches
      stateManager.setHistoryEnabled(false);

      // Cancel any pending preview renders
      if (autoPreviewController) {
        autoPreviewController.cancelPending();
      }

      // Update workflow progress to render step
      setWorkflowStep('render');

      // Show render time estimate for complex models
      const estimate = estimateRenderTime(
        state.uploadedFile.content,
        state.parameters
      );
      if (estimate.seconds >= 5 || estimate.warning) {
        let estimateMsg = `Generating ${formatName}... (est. ~${estimate.seconds}s)`;
        if (estimate.warning) {
          console.warn('[Render] Complexity warning:', estimate.warning);
        }
        updateStatus(estimateMsg);
      }

      const startTime = Date.now();

      let result;

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
        result = await renderController.renderFull(
          state.uploadedFile.content,
          state.parameters,
          {
            outputFormat,
            files: state.projectFiles,
            mainFile: state.mainFilePath,
            libraries: libsForRender,
            ...(exportQualityPreset ? { quality: exportQualityPreset } : {}),
            onProgress: (percent, message) => {
              if (percent < 0) {
                updateStatus(message);
              } else {
                updateStatus(`${message} (${Math.round(percent)}%)`);
              }
            },
          }
        );
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);

      // Store the hash of parameters used for this generation
      lastGeneratedParamsHash = hashParams(state.parameters);

      stateManager.setState({
        stl: result.data || result.stl,
        outputFormat: result.format || outputFormat,
        stlStats: result.stats,
        lastRenderTime: duration,
      });

      updateStatus(`Full quality ${formatName} generated in ${duration}s`);

      const triangleInfo =
        result.stats.triangles > 0
          ? ` | Triangles: ${result.stats.triangles.toLocaleString()}`
          : '';
      statsArea.innerHTML = `<span class="stats-quality full">Full Quality ${formatName}</span> Size: ${formatFileSize(result.stats.size)}${triangleInfo} | Time: ${duration}s`;

      // Also update the preview status bar stats
      updatePreviewStats(result.stats, true);

      console.log('Full render complete:', result.stats);

      // Update workflow progress to render complete
      completeWorkflowStep('render');
      setWorkflowStep('download');

      // Do NOT auto-download. User must explicitly click Download.
      updateStatus(
        `${formatName} generated successfully in ${duration}s (click Download to save)`
      );

      // Update preview state to show full quality
      updatePreviewStateUI(PREVIEW_STATE.CURRENT, {
        stats: result.stats,
        fullQuality: true,
      });
    } catch (error) {
      console.error('Generation failed:', error);

      // Use COGA-compliant friendly error translation
      const friendlyError = translateError(error.message);
      updateStatus(`Error: ${friendlyError.title}`);

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
    // Mark workflow download step as complete
    completeWorkflowStep('download');
  });

  // Copy Share Link button
  const shareBtn = document.getElementById('shareBtn');
  if (shareBtn) {
    shareBtn.addEventListener('click', async () => {
      const state = stateManager.getState();

      if (!state.uploadedFile) {
        alert('No file uploaded yet');
        return;
      }

      // Get only non-default parameters for sharing
      const nonDefaultParams = {};
      for (const [key, value] of Object.entries(state.parameters)) {
        if (state.defaults[key] !== value) {
          nonDefaultParams[key] = value;
        }
      }

      const shareUrl = getShareableURL(nonDefaultParams);

      try {
        // Try modern clipboard API
        await navigator.clipboard.writeText(shareUrl);
        updateStatus('Share link copied to clipboard!');

        // Visual feedback
        const textSpan = shareBtn.querySelector('.btn-text');
        if (textSpan) {
          const originalText = textSpan.textContent;
          textSpan.textContent = '✅ Copied!';
          setTimeout(() => {
            textSpan.textContent = originalText;
          }, 2000);
        }
      } catch (error) {
        // Fallback for older browsers
        console.error('Failed to copy to clipboard:', error);
        prompt('Copy this link to share:', shareUrl);
        updateStatus('Share link ready');
      }
    });
  }

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
        queued: '⏳',
        rendering: '⚙️',
        complete: '✅',
        error: '❌',
        cancelled: '⏹️',
      }[job.state] || '❓';

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
        ${job.state === 'complete' ? `<button class="btn btn-sm btn-primary" data-action="download" data-job-id="${job.id}" aria-label="Download ${job.name}">📥 Download</button>` : ''}
        ${job.state === 'queued' ? `<button class="btn btn-sm btn-outline" data-action="edit" data-job-id="${job.id}" aria-label="Edit ${job.name} parameters">✏️ Edit</button>` : ''}
        ${job.state === 'queued' ? `<button class="btn btn-sm btn-outline" data-action="cancel" data-job-id="${job.id}" aria-label="Cancel ${job.name}">⏹️ Cancel</button>` : ''}
        ${job.state !== 'rendering' ? `<button class="btn btn-sm btn-outline" data-action="remove" data-job-id="${job.id}" aria-label="Remove ${job.name}">🗑️ Remove</button>` : ''}
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
  comparisonController = new ComparisonController(
    stateManager,
    renderController,
    {
      maxVariants: 4,
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

    // Generate variant name
    const count = comparisonController.getVariantCount() + 1;
    const variantName = `Variant ${count}`;

    // Add variant
    const variantId = comparisonController.addVariant(
      variantName,
      state.parameters
    );
    console.log(`Added variant ${variantId}:`, variantName);

    // Switch to comparison mode
    enterComparisonMode();

    updateStatus(`Added "${variantName}" to comparison`);
  });

  // Comparison mode event listeners
  window.addEventListener('comparison:add-variant', (e) => {
    const state = stateManager.getState();
    if (!state.uploadedFile) return;

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
    stateManager.setState({ comparisonMode: false });

    // Show main interface, hide comparison view
    mainInterface.classList.remove('hidden');
    comparisonViewContainer.classList.add('hidden');

    // Optionally clear variants or keep them
    // comparisonController.clearAll();

    console.log('[Comparison] Exited comparison mode');
    updateStatus('Exited comparison mode');
  }

  // ========== PRESET SYSTEM ==========

  // Clear preset selection when parameters are manually changed
  // Track if we're currently loading a preset (to avoid clearing during load)
  let isLoadingPreset = false;

  function clearPresetSelection() {
    // Don't clear if we're in the middle of loading a preset
    if (isLoadingPreset) {
      return;
    }

    const state = stateManager.getState();
    if (state.currentPresetId) {
      stateManager.setState({ currentPresetId: null, currentPresetName: null });
      const presetSelect = document.getElementById('presetSelect');
      if (presetSelect) {
        presetSelect.value = '';
      }
    }
  }

  // Update preset dropdown based on current model
  function updatePresetDropdown() {
    const state = stateManager.getState();
    const presetSelect = document.getElementById('presetSelect');

    if (!state.uploadedFile) {
      presetSelect.disabled = true;
      presetSelect.innerHTML =
        '<option value="">-- No model loaded --</option>';
      return;
    }

    const modelName = state.uploadedFile.name;
    const presets = presetManager.getPresetsForModel(modelName);

    // Clear and rebuild dropdown
    presetSelect.innerHTML = '<option value="">-- Select Preset --</option>';

    if (presets.length === 0) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = '-- No presets saved --';
      option.disabled = true;
      presetSelect.appendChild(option);
    } else {
      presets.forEach((preset) => {
        const option = document.createElement('option');
        option.value = preset.id;
        option.textContent = preset.name;
        presetSelect.appendChild(option);
      });
    }

    presetSelect.disabled = false;
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
    form.addEventListener('submit', (e) => {
      e.preventDefault();

      const name = modal.querySelector('#presetName').value.trim();
      const description = modal
        .querySelector('#presetDescription')
        .value.trim();

      if (!name) {
        alert('Please enter a preset name');
        return;
      }

      try {
        presetManager.savePreset(
          state.uploadedFile.name,
          name,
          state.parameters,
          { description }
        );

        updateStatus(`Preset "${name}" saved`);
        updatePresetDropdown();
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

  // Show manage presets modal
  function showManagePresetsModal() {
    const state = stateManager.getState();

    if (!state.uploadedFile) {
      alert('No model loaded');
      return;
    }

    const modelName = state.uploadedFile.name;
    const presets = presetManager.getPresetsForModel(modelName);

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
                ${preset.description || 'No description'} • 
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
          <h3 id="managePresetsTitle" class="preset-modal-title">Manage Presets</h3>
          <button class="preset-modal-close" aria-label="Close dialog" data-action="close">&times;</button>
        </div>
        <div class="preset-list">
          ${presetsHTML}
        </div>
        <div class="preset-modal-footer">
          <button class="btn btn-secondary" data-action="import">Import Preset</button>
          <button class="btn btn-secondary" data-action="export-all">Export All</button>
          <button class="btn btn-outline" data-action="close">Close</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Close handler for dynamic modal
    const closeManagePresetsModalHandler = () => {
      closeModal(modal);
      document.body.removeChild(modal);
    };

    // Handle actions
    modal.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;

      const action = btn.dataset.action;
      const presetId = btn.dataset.presetId;

      if (action === 'close') {
        closeManagePresetsModalHandler();
      } else if (action === 'load') {
        const preset = presetManager.loadPreset(modelName, presetId);
        if (preset) {
          // Set flag to prevent clearPresetSelection during load
          isLoadingPreset = true;

          const state = stateManager.getState();
          stateManager.setState({ parameters: { ...preset.parameters } });

          // Re-render UI with preset parameters (FIX: UI wasn't updating before)
          const parametersContainer = document.getElementById(
            'parametersContainer'
          );
          renderParameterUI(
            state.schema,
            parametersContainer,
            (values) => {
              stateManager.setState({ parameters: values });
              // Clear preset selection when parameters are manually changed
              clearPresetSelection();
              if (autoPreviewController) {
                autoPreviewController.onParameterChange(values);
              }
              updatePrimaryActionButton();
            },
            preset.parameters // Pass preset values as initial values
          );

          // Trigger auto-preview with new parameters
          if (autoPreviewController) {
            autoPreviewController.onParameterChange(preset.parameters);
          }
          updatePrimaryActionButton();

          // Track the currently loaded preset and update dropdown to show it
          stateManager.setState({
            currentPresetId: presetId,
            currentPresetName: preset.name,
          });
          const presetSelect = document.getElementById('presetSelect');
          if (presetSelect) {
            presetSelect.value = presetId;
          }

          // Clear the loading flag
          isLoadingPreset = false;

          updateStatus(`Loaded preset: ${preset.name}`);
          closeManagePresetsModalHandler();
        }
      } else if (action === 'delete') {
        if (confirm('Are you sure you want to delete this preset?')) {
          presetManager.deletePreset(modelName, presetId);
          updatePresetDropdown();
          // Refresh the modal
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
          a.download = `preset-${preset.name.toLowerCase().replace(/\s+/g, '-')}.json`;
          a.click();
          URL.revokeObjectURL(url);
          updateStatus(`Exported preset: ${preset.name}`);
        }
      } else if (action === 'export-all') {
        const json = presetManager.exportAllPresets(modelName);
        if (json) {
          const blob = new Blob([json], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${modelName.replace('.scad', '')}-presets.json`;
          a.click();
          URL.revokeObjectURL(url);
          updateStatus('Exported all presets');
        } else {
          alert('No presets to export');
        }
      } else if (action === 'import') {
        // Create file input for import
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e) => {
          const file = e.target.files[0];
          if (!file) return;

          try {
            const text = await file.text();
            const result = presetManager.importPreset(text);

            if (result.success) {
              alert(
                `Imported ${result.imported} preset(s)${result.skipped > 0 ? ` (${result.skipped} skipped)` : ''}`
              );
              updatePresetDropdown();
              // Refresh the modal
              closeManagePresetsModalHandler();
              showManagePresetsModal();
            } else {
              alert(`Import failed: ${result.error}`);
            }
          } catch (error) {
            alert(`Failed to import preset: ${error.message}`);
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

  // Preset button handlers
  const savePresetBtn = document.getElementById('savePresetBtn');
  const managePresetsBtn = document.getElementById('managePresetsBtn');
  const presetSelect = document.getElementById('presetSelect');

  savePresetBtn.addEventListener('click', showSavePresetModal);
  managePresetsBtn.addEventListener('click', showManagePresetsModal);

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
  presetSelect.addEventListener('change', (e) => {
    const presetId = e.target.value;
    if (!presetId) return;

    const state = stateManager.getState();
    const preset = presetManager.loadPreset(state.uploadedFile.name, presetId);

    if (preset) {
      // Set flag to prevent clearPresetSelection during load
      isLoadingPreset = true;

      stateManager.setState({ parameters: { ...preset.parameters } });

      // Re-render UI with preset parameters (FIX: UI wasn't updating before)
      const parametersContainer = document.getElementById(
        'parametersContainer'
      );
      renderParameterUI(
        state.schema,
        parametersContainer,
        (values) => {
          stateManager.setState({ parameters: values });
          // Clear preset selection when parameters are manually changed
          clearPresetSelection();
          if (autoPreviewController) {
            autoPreviewController.onParameterChange(values);
          }
          updatePrimaryActionButton();
        },
        preset.parameters // Pass preset values as initial values
      );

      // Trigger auto-preview with new parameters
      if (autoPreviewController) {
        autoPreviewController.onParameterChange(preset.parameters);
      }
      updatePrimaryActionButton();

      // Track the currently loaded preset (for showing name in dropdown)
      stateManager.setState({
        currentPresetId: presetId,
        currentPresetName: preset.name,
      });
      // Ensure the dropdown displays the selected preset name (native <select> label)
      // (If the dropdown was rebuilt elsewhere, re-assert selection here.)
      const presetSelectEl = document.getElementById('presetSelect');
      if (presetSelectEl) {
        presetSelectEl.value = presetId;
      }

      // Clear the loading flag
      isLoadingPreset = false;

      updateStatus(`Loaded preset: ${preset.name}`);

      // Keep showing the preset name in dropdown (don't reset)
      // The dropdown will reset when parameters change (handled in onChange callback)
    }
  });

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

  // Initialize preset dropdown after file upload
  stateManager.subscribe((state, prevState) => {
    if (state.uploadedFile && !prevState.uploadedFile) {
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
      alert('No file uploaded');
      return;
    }

    // Show modal
    sourceViewerModal.classList.remove('hidden');
    sourceViewerContent.value = state.uploadedFile.content;

    // Show file info
    const lineCount = state.uploadedFile.content.split('\n').length;
    const charCount = state.uploadedFile.content.length;
    sourceViewerInfo.innerHTML = `
      <span>📄 ${state.uploadedFile.name}</span>
      <span>📏 ${lineCount.toLocaleString()} lines</span>
      <span>📊 ${charCount.toLocaleString()} characters</span>
    `;

    // Focus textarea for accessibility
    setTimeout(() => sourceViewerContent.focus(), 100);
  });

  copySourceBtn?.addEventListener('click', async () => {
    const state = stateManager.getState();
    if (!state.uploadedFile) {
      alert('No file uploaded');
      return;
    }

    try {
      await navigator.clipboard.writeText(state.uploadedFile.content);
      copySourceBtn.textContent = '✅ Copied!';
      updateStatus('Source code copied to clipboard');
      setTimeout(() => {
        copySourceBtn.textContent = '📋 Copy Source';
      }, 2000);
    } catch (error) {
      console.error('Failed to copy source:', error);
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = state.uploadedFile.content;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      copySourceBtn.textContent = '✅ Copied!';
      setTimeout(() => {
        copySourceBtn.textContent = '📋 Copy Source';
      }, 2000);
    }
  });

  // Source viewer modal close handlers
  sourceViewerClose?.addEventListener('click', () => {
    sourceViewerModal.classList.add('hidden');
  });

  sourceViewerOverlay?.addEventListener('click', () => {
    sourceViewerModal.classList.add('hidden');
  });

  sourceViewerCopy?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(sourceViewerContent.value);
      sourceViewerCopy.textContent = '✅ Copied!';
      setTimeout(() => {
        sourceViewerCopy.textContent = '📋 Copy';
      }, 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  });

  // Unlock Limits Toggle
  const unlockLimitsToggle = document.getElementById('unlockLimitsToggle');
  unlockLimitsToggle?.addEventListener('change', (e) => {
    const unlocked = e.target.checked;
    setLimitsUnlocked(unlocked);

    if (unlocked) {
      updateStatus(
        '⚠️ Parameter limits unlocked - values outside normal range allowed'
      );
    } else {
      updateStatus('Parameter limits restored to defaults');
    }
  });

  // Reset All Button (in Advanced Menu)
  const resetAllBtn = document.getElementById('resetAllBtn');
  resetAllBtn?.addEventListener('click', () => {
    // Same as main reset button
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

    // Populate group selector
    resetGroupSelect.innerHTML = '';
    state.schema.groups.forEach((group) => {
      const option = document.createElement('option');
      option.value = group.id;
      option.textContent = group.label;
      resetGroupSelect.appendChild(option);
    });

    // Show selector
    resetGroupSelector.classList.remove('hidden');
  });

  confirmResetGroupBtn?.addEventListener('click', () => {
    const state = stateManager.getState();
    const groupId = resetGroupSelect.value;

    if (!groupId || !state.schema) return;

    // Record state for undo
    stateManager.recordParameterState();

    // Find parameters in this group and reset them
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

    // Re-render UI
    const parametersContainer = document.getElementById('parametersContainer');
    renderParameterUI(
      state.schema,
      parametersContainer,
      (values) => {
        stateManager.recordParameterState();
        stateManager.setState({ parameters: values });
        clearPresetSelection();
        if (autoPreviewController && state.uploadedFile) {
          autoPreviewController.onParameterChange(values);
        }
        updatePrimaryActionButton();
      },
      newParams
    );

    // Trigger auto-preview
    if (autoPreviewController && state.uploadedFile) {
      autoPreviewController.onParameterChange(newParams);
    }

    // Hide selector and update status
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

    // Format parameters as JSON
    const json = JSON.stringify(state.parameters, null, 2);
    paramsJsonContent.value = json;
    paramsJsonModal.classList.remove('hidden');

    // Focus textarea for accessibility
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
      paramsJsonCopy.textContent = '✅ Copied!';
      updateStatus('Parameters JSON copied to clipboard');
      setTimeout(() => {
        paramsJsonCopy.textContent = '📋 Copy';
      }, 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
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
   * @param {string} tourType - Type of tour ('screen-reader', 'voice-input', 'educators')
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
      const tabs = Array.from(featuresTabs);
      const currentIndex = tabs.indexOf(tab);
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
      loadExampleByKey(exampleKey, {
        closeFeaturesGuideModal: true,
      });
    }
  });

  // ========== END FEATURES GUIDE MODAL ==========

  // Global keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    const state = stateManager.getState();

    // Ctrl/Cmd + Z: Undo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      if (state.uploadedFile && stateManager.canUndo()) {
        e.preventDefault();
        undoBtn?.click();
      }
    }

    // Ctrl/Cmd + Shift + Z: Redo (also Ctrl/Cmd + Y)
    if (
      (e.ctrlKey || e.metaKey) &&
      ((e.key === 'z' && e.shiftKey) || e.key === 'y')
    ) {
      if (state.uploadedFile && stateManager.canRedo()) {
        e.preventDefault();
        redoBtn?.click();
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

    // D key: Download STL (when button is in download mode)
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

    // G key: Generate STL (when button is in generate mode)
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

// Start the app
initApp();
