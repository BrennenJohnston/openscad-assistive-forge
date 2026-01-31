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
  escapeHtml,
  isValidServiceWorkerMessage,
  setupNotesCounter,
} from './js/html-utils.js';
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
import { presetManager, extractScadVersion } from './js/preset-manager.js';
import { ComparisonController } from './js/comparison-controller.js';
import { ComparisonView } from './js/comparison-view.js';
import { libraryManager, LIBRARY_DEFINITIONS } from './js/library-manager.js';
import { RenderQueue } from './js/render-queue.js';
import { openModal, closeModal, initStaticModals } from './js/modal-manager.js';
import { translateError } from './js/error-translator.js';
import {
  getStorageEstimate,
  clearCachedData,
  isFirstVisit,
  markFirstVisitComplete,
  updateStoragePrefs,
  shouldDeferLargeDownloads,
  formatBytes,
  // v2: Persistence and backup
  checkPersistentStorage,
  requestPersistentStorage,
  clearCacheWithOptions,
  getDetailedStorageInfo,
  exportProjectsBackup,
  importProjectsBackup,
} from './js/storage-manager.js';
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
  initSavedProjectsDB,
  listSavedProjects,
  saveProject,
  getProject,
  touchProject,
  updateProject,
  deleteProject,
  getSavedProjectsSummary,
  clearAllSavedProjects,
  getStorageDiagnostics,
  // v2: Folder operations
  createFolder,
  getFolder,
  listFolders,
  renameFolder,
  deleteFolder,
  moveFolder,
  getFolderTree,
  getFolderBreadcrumbs,
  // v2: Project-folder operations
  moveProject,
  getProjectsInFolder,
} from './js/saved-projects-manager.js';
import Split from 'split.js';

// Example definitions (used by welcome screen, Features Guide, and deep-linking)
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
  'multi-file-box': {
    path: '/examples/multi-file-box.zip',
    name: 'multi-file-box.zip',
  },
  // Additional examples for deep-linking
  'cable-organizer': {
    path: '/examples/cable-organizer/cable_organizer.scad',
    name: 'cable_organizer.scad',
  },
  'honeycomb-grid': {
    path: '/examples/honeycomb-grid/honeycomb_grid.scad',
    name: 'honeycomb_grid.scad',
  },
  'phone-stand': {
    path: '/examples/phone-stand/phone_stand.scad',
    name: 'phone_stand.scad',
  },
  'wall-hook': {
    path: '/examples/wall-hook/wall_hook.scad',
    name: 'wall_hook.scad',
  },
  // Volkswitch keyguard example for deep-linking from volksswitch.org
  // Usage: ?example=volkswitch-keyguard-demo
  'volkswitch-keyguard-demo': {
    path: '/examples/volkswitch-keyguard/keyguard_demo.scad',
    name: 'keyguard_demo.scad',
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

// Screen reader announcer utility
// Provides a consistent API for announcing messages to assistive technology
const srAnnouncer = {
  _timeout: null,
  _clearTimeout: null,
  /**
   * Announce a message to screen readers
   * @param {string} message - Message to announce
   * @param {boolean} [debounce=false] - Whether to debounce rapid announcements
   */
  announce(message, debounce = false) {
    const el = document.getElementById('srAnnouncer');
    if (!el) return;

    // Cancel pending announcements
    if (this._timeout) clearTimeout(this._timeout);
    if (this._clearTimeout) clearTimeout(this._clearTimeout);

    const write = () => {
      // Clear first so AT will re-announce repeated strings reliably
      el.textContent = '';
      requestAnimationFrame(() => {
        el.textContent = message;
        // Clear after a short delay, but only if unchanged
        this._clearTimeout = setTimeout(() => {
          if (el.textContent === message) {
            el.textContent = '';
          }
        }, 1500);
      });
    };

    if (debounce) {
      this._timeout = setTimeout(write, 150);
    } else {
      write();
    }
  },
};

// Hidden feature state (non-persistent)
let _hfmUnlocked = false;
let _hfmAltView = null;
let _hfmInitPromise = null;
let _hfmEnabled = false;
let _hfmPendingEnable = false;
// Edge sharpness range: controls contrast exponent (Harri technique)
// Base exponents: Global=1.8, Directional=2.5
// Effective range: scale 0.5→exp ~0.9 (off), scale 4.0→exp ~7.2 (very sharp)
// Research shows useful range is exponent 1-8 before artifacts appear
const _HFM_CONTRAST_RANGE = { min: 0.5, max: 4.0, step: 0.05, default: 1 };
let _hfmContrastScale = _HFM_CONTRAST_RANGE.default;
let _hfmContrastControls = null;
// Font size range: controls character size and effective ASCII resolution
// Smaller = more characters = higher resolution (harder to read)
// Larger = fewer characters = lower resolution (more legible)
const _HFM_FONT_SCALE_RANGE = { min: 0.5, max: 2.5, step: 0.05, default: 1 };
let _hfmFontScale = _HFM_FONT_SCALE_RANGE.default;
let _hfmFontScaleControls = null;
const _HFM_ZOOM_EPSILON = 0.02;
let _hfmZoomBaseline = null;
let _hfmZoomListening = false;
let _hfmZoomHandling = false;
let _hfmPanAdjustEnabled = false;
let _hfmPanToggleButtons = null; // { desktop: HTMLButtonElement|null, mobile: HTMLButtonElement|null }

function _syncHfmPanToggleUi() {
  const btns = [
    _hfmPanToggleButtons?.desktop,
    _hfmPanToggleButtons?.mobile,
  ].filter(Boolean);

  // Format values with descriptive labels (Harri's technique terminology)
  // "Edge" = contrast exponent (controls edge sharpness/boundary definition)
  // "Size" = font scale (controls character size/effective resolution)
  const edge = _formatHfmContrastValue(_hfmContrastScale);
  const size = _formatHfmFontScaleValue(_hfmFontScale);

  // Update pan toggle buttons if they exist
  btns.forEach((btn) => {
    btn.setAttribute('aria-pressed', _hfmPanAdjustEnabled ? 'true' : 'false');
    btn.classList.toggle('active', _hfmPanAdjustEnabled);
    btn.title = _hfmPanAdjustEnabled
      ? `Alt adjust ON (Pan: Edge ${edge}, Size ${size})`
      : `Alt adjust OFF (Pan controls). Current: Edge ${edge}, Size ${size}`;
    btn.setAttribute(
      'aria-label',
      _hfmPanAdjustEnabled
        ? `Alt adjust on. Pan up/down changes edge sharpness (${edge}). Pan left/right changes character size (${size}).`
        : `Alt adjust off. Pan controls. Current edge sharpness ${edge}, character size ${size}.`
    );
  });

  // Update status bar alt adjust display (always, regardless of button state)
  _updateHfmStatusBar();
}

/**
 * Update the preview status bar with alt adjust values.
 * Only shows in mono/retro theme when alt view is enabled.
 * Includes auto-calibration info when first launched.
 */
function _updateHfmStatusBar() {
  const root = document.documentElement;
  const isMono = root.getAttribute('data-ui-variant') === 'mono';
  const statusBar = document.getElementById('previewStatusBar');
  const altAdjustEl = document.getElementById('previewStatusAltAdjust');

  if (!statusBar || !altAdjustEl) return;

  // Only show alt adjust info in mono variant when alt view is enabled
  if (!isMono || !_hfmEnabled) {
    statusBar.classList.remove('has-alt-adjust');
    altAdjustEl.textContent = '';
    return;
  }

  // Format values
  // Contrast controls edge sharpness via exponent (Harri technique: higher = sharper edges)
  // Font scale controls character size/resolution (higher = larger chars, lower resolution)
  const edge = _formatHfmContrastValue(_hfmContrastScale);
  const size = _formatHfmFontScaleValue(_hfmFontScale);

  // Build the display string with descriptive labels aligned with Harri's ASCII research:
  // - Edge Sharpness (contrast exponent): controls boundary definition
  // - Char Size (font scale): controls effective ASCII resolution
  // Include device calibration info when available
  let displayText;
  const deviceInfo = _hfmCalibratedDevice ? ` [${_hfmCalibratedDevice}]` : '';

  if (_hfmPanAdjustEnabled) {
    displayText = `[ALT ADJUST]${deviceInfo} Edge: ${edge} (Up/Down) | Size: ${size} (Left/Right)`;
  } else {
    displayText = `[ALT VIEW]${deviceInfo} Edge: ${edge} | Size: ${size}`;
  }

  altAdjustEl.textContent = displayText;
  statusBar.classList.add('has-alt-adjust');
}

function _setHfmPanAdjustEnabled(enabled) {
  _hfmPanAdjustEnabled = Boolean(enabled);

  // When using Pan D-pad for adjustments, hide the sliders to avoid duplicate UI.
  // When toggled off, restore them (only if alt view is enabled).
  if (_hfmEnabled) {
    _initHfmContrastControls().setEnabled(!_hfmPanAdjustEnabled);
    _initHfmFontScaleControls().setEnabled(!_hfmPanAdjustEnabled);
  }

  _syncHfmPanToggleUi();
}

function _isLightThemeActive() {
  const root = document.documentElement;
  const dataTheme = root.getAttribute('data-theme');
  if (dataTheme === 'light') return true;
  if (dataTheme === 'dark') return false;
  // Auto mode - check system preference
  return !window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * Auto-calibrate Edge (contrast) and Size (font) settings based on the user's
 * viewing environment. This provides an optimal initial experience by analyzing:
 * - Viewport/preview container size
 * - Device pixel ratio (screen density)
 * - Touch capability (mobile vs desktop)
 * - Browser/platform characteristics
 *
 * Based on Harri's ASCII rendering research:
 * - Smaller screens benefit from larger characters and moderate edge sharpening
 * - Larger/high-DPI screens can handle more characters and sharper edges
 * - Mobile devices prioritize legibility over resolution
 *
 * @returns {{ edgeScale: number, sizeScale: number }} Calibrated values
 */
function _calibrateHfmSettings() {
  // Gather system information
  const dpr = window.devicePixelRatio || 1;
  const isTouchDevice =
    'ontouchstart' in window || navigator.maxTouchPoints > 0;

  // Get preview container dimensions (primary factor for calibration)
  const previewContainer = document.getElementById('previewContainer');
  const containerWidth = previewContainer?.clientWidth || window.innerWidth;
  const containerHeight = previewContainer?.clientHeight || window.innerHeight;
  const containerArea = containerWidth * containerHeight;

  // Detect browser/platform hints
  const isMobile =
    isTouchDevice && Math.min(containerWidth, containerHeight) < 500;
  const isTablet = isTouchDevice && !isMobile;
  const isHighDpi = dpr >= 1.5;
  const isVeryHighDpi = dpr >= 2.5;

  // Viewport size categories (based on container area in CSS pixels)
  const isSmallViewport = containerArea < 200000; // ~447x447 or smaller
  const isMediumViewport = containerArea >= 200000 && containerArea < 500000;
  const isLargeViewport = containerArea >= 500000;

  // ========================================
  // SIZE (Font Scale) Calibration
  // ========================================
  // Goal: Achieve readable character density based on viewing conditions
  // - Small/mobile: Larger chars (1.2-1.5) for legibility
  // - Large/desktop: Can use default or smaller (0.8-1.0) for more detail
  // - High DPI: Can afford smaller chars while maintaining readability

  let sizeScale = 1.0; // Default

  if (isMobile) {
    // Mobile: Prioritize legibility with larger characters
    sizeScale = 1.4;
    if (isVeryHighDpi) sizeScale = 1.2; // High DPI mobile can be slightly smaller
  } else if (isTablet) {
    // Tablet: Balance between legibility and detail
    sizeScale = 1.15;
    if (isHighDpi) sizeScale = 1.0;
  } else if (isSmallViewport) {
    // Small desktop window
    sizeScale = 1.1;
  } else if (isMediumViewport) {
    // Medium desktop - default works well
    sizeScale = 1.0;
    if (isHighDpi) sizeScale = 0.9; // High DPI can show more detail
  } else if (isLargeViewport) {
    // Large desktop - can show more characters
    sizeScale = 0.9;
    if (isHighDpi) sizeScale = 0.8; // High DPI large screen = maximum detail
    if (isVeryHighDpi) sizeScale = 0.75;
  }

  // ========================================
  // EDGE (Contrast Exponent) Calibration
  // ========================================
  // Goal: Sharp edges without artifacts (Harri research: useful range 1-8)
  // - Small screens: Lower values (artifacts more visible)
  // - Large screens: Higher values (can appreciate sharper definition)
  // - High DPI: Can use slightly higher values (finer detail visible)

  let edgeScale = 1.0; // Default (exponent ~1.8)

  if (isMobile) {
    // Mobile: Conservative edge sharpening (artifacts very visible)
    edgeScale = 0.85;
  } else if (isTablet) {
    // Tablet: Moderate edge sharpening
    edgeScale = 0.95;
  } else if (isSmallViewport) {
    // Small desktop: Slightly conservative
    edgeScale = 0.9;
  } else if (isMediumViewport) {
    // Medium desktop: Default is good
    edgeScale = 1.0;
    if (isHighDpi) edgeScale = 1.1; // High DPI can handle slightly sharper
  } else if (isLargeViewport) {
    // Large desktop: Can appreciate sharper edges
    edgeScale = 1.15;
    if (isHighDpi) edgeScale = 1.25;
    if (isVeryHighDpi) edgeScale = 1.35;
  }

  // Clamp to valid ranges
  edgeScale = Math.max(
    _HFM_CONTRAST_RANGE.min,
    Math.min(_HFM_CONTRAST_RANGE.max, edgeScale)
  );
  sizeScale = Math.max(
    _HFM_FONT_SCALE_RANGE.min,
    Math.min(_HFM_FONT_SCALE_RANGE.max, sizeScale)
  );

  // Determine device category for display
  let deviceCategory;
  if (isMobile) {
    deviceCategory = isVeryHighDpi ? 'Mobile HD' : 'Mobile';
  } else if (isTablet) {
    deviceCategory = isHighDpi ? 'Tablet HD' : 'Tablet';
  } else if (isSmallViewport) {
    deviceCategory = 'Compact';
  } else if (isMediumViewport) {
    deviceCategory = isHighDpi ? 'Desktop HD' : 'Desktop';
  } else {
    deviceCategory = isVeryHighDpi
      ? 'Large HD'
      : isHighDpi
        ? 'Large HD'
        : 'Large';
  }

  // Log calibration results for debugging
  console.log('[Alt View] Auto-calibration:', {
    viewport: `${containerWidth}x${containerHeight}`,
    dpr,
    deviceCategory,
    calibrated: {
      edge: `${Math.round(edgeScale * 100)}%`,
      size: `${Math.round(sizeScale * 100)}%`,
    },
  });

  return { edgeScale, sizeScale, deviceCategory };
}

// Track if calibration has been applied this session (only auto-calibrate once)
let _hfmCalibrated = false;
let _hfmCalibratedDevice = ''; // Store detected device category for status display

function _formatHfmContrastValue(scale) {
  return `${Math.round(scale * 100)}%`;
}

function _formatHfmFontScaleValue(scale) {
  return `${Math.round(scale * 100)}%`;
}

function _getHfmZoomLevel() {
  const dpr = Number.isFinite(window.devicePixelRatio)
    ? window.devicePixelRatio
    : 1;
  const vvScale =
    window.visualViewport && Number.isFinite(window.visualViewport.scale)
      ? window.visualViewport.scale
      : 1;
  return Math.max(0.1, dpr * vvScale);
}

function _setHfmZoomBaseline() {
  _hfmZoomBaseline = {
    zoom: _getHfmZoomLevel(),
    contrastScale: _hfmContrastScale,
    fontScale: _hfmFontScale,
  };
}

function _applyHfmZoomCompensation() {
  if (!_hfmEnabled || !_hfmZoomBaseline) return;
  const currentZoom = _getHfmZoomLevel();
  const baseZoom = _hfmZoomBaseline.zoom || 1;
  if (!Number.isFinite(currentZoom) || !Number.isFinite(baseZoom)) return;
  if (Math.abs(currentZoom - baseZoom) < _HFM_ZOOM_EPSILON) return;

  const factor = baseZoom / currentZoom;
  _hfmZoomHandling = true;
  _applyHfmContrastScale(_hfmZoomBaseline.contrastScale * factor, {
    setBaseline: false,
  });
  _applyHfmFontScale(_hfmZoomBaseline.fontScale * factor, {
    setBaseline: false,
  });
  _hfmZoomHandling = false;
}

function _handleHfmZoomChange() {
  _applyHfmZoomCompensation();
}

function _enableHfmZoomTracking() {
  if (_hfmZoomListening) return;
  _hfmZoomListening = true;
  window.addEventListener('resize', _handleHfmZoomChange);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', _handleHfmZoomChange);
    window.visualViewport.addEventListener('scroll', _handleHfmZoomChange);
  }
}

function _disableHfmZoomTracking() {
  if (!_hfmZoomListening) return;
  _hfmZoomListening = false;
  window.removeEventListener('resize', _handleHfmZoomChange);
  if (window.visualViewport) {
    window.visualViewport.removeEventListener('resize', _handleHfmZoomChange);
    window.visualViewport.removeEventListener('scroll', _handleHfmZoomChange);
  }
}

function _applyHfmContrastScale(scale, options = {}) {
  const { setBaseline = true } = options;
  const raw = Number(scale);
  const next = Number.isFinite(raw) ? raw : _HFM_CONTRAST_RANGE.default;
  const clamped = Math.max(
    _HFM_CONTRAST_RANGE.min,
    Math.min(_HFM_CONTRAST_RANGE.max, next)
  );
  _hfmContrastScale = clamped;

  if (_hfmAltView?.setContrastScale) {
    _hfmAltView.setContrastScale(clamped);
  }

  _hfmContrastControls?.sync?.(clamped);
  _syncHfmPanToggleUi();
  if (setBaseline && !_hfmZoomHandling) {
    _setHfmZoomBaseline();
  }
  return clamped;
}

function _applyHfmFontScale(scale, options = {}) {
  const { setBaseline = true } = options;
  const raw = Number(scale);
  const next = Number.isFinite(raw) ? raw : _HFM_FONT_SCALE_RANGE.default;
  const clamped = Math.max(
    _HFM_FONT_SCALE_RANGE.min,
    Math.min(_HFM_FONT_SCALE_RANGE.max, next)
  );
  _hfmFontScale = clamped;

  if (_hfmAltView?.setFontScale) {
    _hfmAltView.setFontScale(clamped);
  }

  _hfmFontScaleControls?.sync?.(clamped);
  _syncHfmPanToggleUi();
  if (setBaseline && !_hfmZoomHandling) {
    _setHfmZoomBaseline();
  }
  return clamped;
}

function _initHfmContrastControls() {
  if (_hfmContrastControls) return _hfmContrastControls;

  const inputs = [];
  const valueEls = [];
  const sections = [];
  const formatValue = (value) => _formatHfmContrastValue(value);

  const buildSection = ({
    container,
    insertBefore,
    sectionClass,
    titleClass,
    inputId,
    titleText,
  }) => {
    if (!container || document.getElementById(inputId)) return null;

    const section = document.createElement('div');
    section.className = sectionClass;

    const title = document.createElement('h3');
    title.className = titleClass;
    title.id = `${inputId}-label`;
    title.textContent = titleText;

    const sliderContainer = document.createElement('div');
    sliderContainer.className = 'slider-container';

    const input = document.createElement('input');
    input.type = 'range';
    input.id = inputId;
    input.min = String(_HFM_CONTRAST_RANGE.min);
    input.max = String(_HFM_CONTRAST_RANGE.max);
    input.step = String(_HFM_CONTRAST_RANGE.step);
    input.value = String(_hfmContrastScale);
    input.setAttribute('aria-labelledby', title.id);

    const valueEl = document.createElement('span');
    valueEl.className = 'slider-value';
    valueEl.id = `${inputId}-value`;
    valueEl.textContent = formatValue(_hfmContrastScale);

    sliderContainer.appendChild(input);
    sliderContainer.appendChild(valueEl);
    section.appendChild(title);
    section.appendChild(sliderContainer);

    if (insertBefore) {
      container.insertBefore(section, insertBefore);
    } else {
      container.appendChild(section);
    }

    inputs.push(input);
    valueEls.push(valueEl);
    sections.push(section);

    input.addEventListener('input', () => {
      _applyHfmContrastScale(parseFloat(input.value));
    });

    return section;
  };

  const panelBody = document.getElementById('cameraPanelBody');
  const panelInsertBefore =
    panelBody?.querySelector('.camera-shortcuts-help') ?? null;
  buildSection({
    container: panelBody,
    insertBefore: panelInsertBefore,
    sectionClass: 'camera-control-section hfm-contrast-section',
    titleClass: 'camera-control-section-title',
    inputId: '_hfmContrast',
    titleText: 'Alt View Contrast',
  });

  const drawerBody = document.getElementById('cameraDrawerBody');
  buildSection({
    container: drawerBody,
    insertBefore: null,
    sectionClass: 'camera-drawer-section camera-drawer-contrast',
    titleClass: 'camera-drawer-section-title',
    inputId: '_hfmContrastMobile',
    titleText: 'Alt View Contrast',
  });

  _hfmContrastControls = {
    setEnabled(_isEnabled) {
      // Sliders permanently hidden - use Pan D-pad adjust mode instead
      sections.forEach((section) => {
        section.style.display = 'none';
      });
      inputs.forEach((input) => {
        input.disabled = true;
      });
    },
    sync(value) {
      const formatted = formatValue(value);
      const rawValue = value.toFixed(2);
      inputs.forEach((input) => {
        if (input.value !== rawValue) {
          input.value = rawValue;
        }
        input.setAttribute('aria-valuetext', formatted);
      });
      valueEls.forEach((el) => {
        el.textContent = formatted;
      });
    },
  };

  _hfmContrastControls.setEnabled(false);
  _hfmContrastControls.sync(_hfmContrastScale);

  return _hfmContrastControls;
}

function _initHfmFontScaleControls() {
  if (_hfmFontScaleControls) return _hfmFontScaleControls;

  const inputs = [];
  const valueEls = [];
  const sections = [];
  const formatValue = (value) => _formatHfmFontScaleValue(value);

  const buildSection = ({
    container,
    insertBefore,
    sectionClass,
    titleClass,
    inputId,
    titleText,
  }) => {
    if (!container || document.getElementById(inputId)) return null;

    const section = document.createElement('div');
    section.className = sectionClass;

    const title = document.createElement('h3');
    title.className = titleClass;
    title.id = `${inputId}-label`;
    title.textContent = titleText;

    const sliderContainer = document.createElement('div');
    sliderContainer.className = 'slider-container';

    const input = document.createElement('input');
    input.type = 'range';
    input.id = inputId;
    input.min = String(_HFM_FONT_SCALE_RANGE.min);
    input.max = String(_HFM_FONT_SCALE_RANGE.max);
    input.step = String(_HFM_FONT_SCALE_RANGE.step);
    input.value = String(_hfmFontScale);
    input.setAttribute('aria-labelledby', title.id);

    const valueEl = document.createElement('span');
    valueEl.className = 'slider-value';
    valueEl.id = `${inputId}-value`;
    valueEl.textContent = formatValue(_hfmFontScale);

    sliderContainer.appendChild(input);
    sliderContainer.appendChild(valueEl);
    section.appendChild(title);
    section.appendChild(sliderContainer);

    if (insertBefore) {
      container.insertBefore(section, insertBefore);
    } else {
      container.appendChild(section);
    }

    inputs.push(input);
    valueEls.push(valueEl);
    sections.push(section);

    input.addEventListener('input', () => {
      _applyHfmFontScale(parseFloat(input.value));
    });

    return section;
  };

  const panelBody = document.getElementById('cameraPanelBody');
  const panelInsertBefore =
    panelBody?.querySelector('.camera-shortcuts-help') ?? null;
  buildSection({
    container: panelBody,
    insertBefore: panelInsertBefore,
    sectionClass: 'camera-control-section hfm-font-scale-section',
    titleClass: 'camera-control-section-title',
    inputId: '_hfmFontScale',
    titleText: 'Alt View Font Size',
  });

  const drawerBody = document.getElementById('cameraDrawerBody');
  buildSection({
    container: drawerBody,
    insertBefore: null,
    sectionClass: 'camera-drawer-section camera-drawer-font-scale',
    titleClass: 'camera-drawer-section-title',
    inputId: '_hfmFontScaleMobile',
    titleText: 'Alt View Font Size',
  });

  _hfmFontScaleControls = {
    setEnabled(_isEnabled) {
      // Sliders permanently hidden - use Pan D-pad adjust mode instead
      sections.forEach((section) => {
        section.style.display = 'none';
      });
      inputs.forEach((input) => {
        input.disabled = true;
      });
    },
    sync(value) {
      const formatted = formatValue(value);
      const rawValue = value.toFixed(2);
      inputs.forEach((input) => {
        if (input.value !== rawValue) {
          input.value = rawValue;
        }
        input.setAttribute('aria-valuetext', formatted);
      });
      valueEls.forEach((el) => {
        el.textContent = formatted;
      });
    },
  };

  _hfmFontScaleControls.setEnabled(false);
  _hfmFontScaleControls.sync(_hfmFontScale);

  return _hfmFontScaleControls;
}

function _setHeaderLogoForVariant(enabled) {
  const img = document.querySelector('.header-logo');
  if (!img) return;

  if (!img.dataset.defaultSrc) {
    img.dataset.defaultSrc = img.getAttribute('src') || '';
  }

  if (enabled) {
    // Use amber logo for light theme, green for dark theme
    const isLight = _isLightThemeActive();
    const logoSrc = isLight
      ? '/icons/logo-mono-hc.svg'
      : '/icons/logo-mono.svg';
    img.setAttribute('src', logoSrc);
  } else if (img.dataset.defaultSrc) {
    img.setAttribute('src', img.dataset.defaultSrc);
  }
}

function _setFaviconForVariant(enabled) {
  const faviconSvg = document.querySelector(
    'link[rel="icon"][type="image/svg+xml"]'
  );
  if (!faviconSvg) return;

  if (!faviconSvg.dataset.defaultHref) {
    faviconSvg.dataset.defaultHref = faviconSvg.getAttribute('href') || '';
  }

  if (enabled) {
    // Use amber favicon for light theme, green for dark theme
    const isLight = _isLightThemeActive();
    const faviconSrc = isLight
      ? '/icons/favicon-mono-hc.svg'
      : '/icons/favicon-mono.svg';
    faviconSvg.setAttribute('href', faviconSrc);
  } else if (faviconSvg.dataset.defaultHref) {
    faviconSvg.setAttribute('href', faviconSvg.dataset.defaultHref);
  }
}

function _setAssetsForVariant(enabled) {
  _setHeaderLogoForVariant(enabled);
  _setFaviconForVariant(enabled);
}

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

/**
 * Inject toggle button for alternate view (internal use)
 */
function _injectAltToggle() {
  const themeToggle = document.getElementById('themeToggle');
  if (!themeToggle) return;
  if (document.getElementById('_hfmToggle')) return; // Already exists

  const toggleBtn = document.createElement('button');
  toggleBtn.id = '_hfmToggle';
  toggleBtn.className = 'btn btn-sm btn-secondary alt-view-toggle';
  toggleBtn.setAttribute('aria-pressed', 'false');
  toggleBtn.setAttribute('aria-label', 'Toggle alternate view');
  toggleBtn.setAttribute('title', 'Alternate view');
  toggleBtn.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <!-- Key icon -->
      <circle cx="8" cy="8" r="5" />
      <path d="M11.3 11.3L21 21" />
      <path d="M16 16l3-3" />
      <path d="M18 18l3-3" />
    </svg>
  `;

  // Insert after themeToggle (before next sibling)
  themeToggle.parentElement.insertBefore(toggleBtn, themeToggle.nextSibling);

  // Create "Alt adjust" toggle button (placed in PAN D-pad center)
  const panToggleBtn = document.createElement('button');
  panToggleBtn.id = '_hfmPanAdjust';
  panToggleBtn.className =
    'btn btn-sm btn-icon camera-btn alt-pan-toggle dpad-center';
  panToggleBtn.setAttribute('aria-pressed', 'false');
  panToggleBtn.style.display = 'none'; // Hidden until alt view is enabled
  panToggleBtn.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 3v18" />
      <path d="M3 12h18" />
      <path d="M7 7h0.01" />
      <path d="M17 17h0.01" />
    </svg>
  `;

  const desktopPanDpad = document
    .getElementById('cameraPanUp')
    ?.closest('.camera-control-dpad');
  if (desktopPanDpad) {
    desktopPanDpad.appendChild(panToggleBtn);
  }

  const mobilePanToggleBtn = panToggleBtn.cloneNode(true);
  mobilePanToggleBtn.id = '_hfmPanAdjustMobile';
  mobilePanToggleBtn.className =
    'btn btn-sm btn-icon camera-drawer-btn alt-pan-toggle dpad-center';

  const mobilePanDpad = document
    .getElementById('mobileCameraPanUp')
    ?.closest('.camera-drawer-dpad');
  if (mobilePanDpad) {
    mobilePanDpad.appendChild(mobilePanToggleBtn);
  }

  _hfmPanToggleButtons = {
    desktop: panToggleBtn,
    mobile: mobilePanToggleBtn,
  };
  _setHfmPanAdjustEnabled(false);

  const handlePanToggleClick = () => {
    // Only meaningful when alt view is enabled
    if (!_hfmAltView || !_hfmEnabled) return;
    _setHfmPanAdjustEnabled(!_hfmPanAdjustEnabled);
  };
  panToggleBtn.addEventListener('click', handlePanToggleClick);
  mobilePanToggleBtn.addEventListener('click', handlePanToggleClick);

  // Wire toggle click handler
  toggleBtn.addEventListener('click', async () => {
    const root = document.documentElement;
    const isCurrentlyEnabled =
      toggleBtn.getAttribute('aria-pressed') === 'true';

    if (!previewManager) {
      if (!isCurrentlyEnabled) {
        _setAssetsForVariant(true);
        root.setAttribute('data-ui-variant', 'mono');
        toggleBtn.setAttribute('aria-pressed', 'true');
        _hfmPendingEnable = true;
      } else {
        root.removeAttribute('data-ui-variant');
        _setAssetsForVariant(false);
        toggleBtn.setAttribute('aria-pressed', 'false');
        _hfmPendingEnable = false;
      }
      return;
    }

    if (!isCurrentlyEnabled) {
      await _enableAltViewWithPreview(toggleBtn);
    } else {
      _disableAltViewWithPreview(toggleBtn);
    }
  });

  // Keep injected control consistent if dev auto-enabled already ran
  if (_hfmEnabled) {
    toggleBtn.setAttribute('aria-pressed', 'true');
    _initHfmContrastControls().setEnabled(true);
    _initHfmFontScaleControls().setEnabled(true);
    _enableHfmZoomTracking();
    if (_hfmPanToggleButtons?.desktop)
      _hfmPanToggleButtons.desktop.style.display = 'flex';
    if (_hfmPanToggleButtons?.mobile)
      _hfmPanToggleButtons.mobile.style.display = 'flex';
    _setHfmPanAdjustEnabled(false);
  }
}

/**
 * Handle unlock sequence match (internal use)
 */
function _handleUnlock() {
  if (_hfmUnlocked) return; // Already unlocked
  _hfmUnlocked = true;

  // Inject toggle button
  _injectAltToggle();

  // Reveal gated Features Guide tab and panel
  document.querySelectorAll('[data-hfm-gated]').forEach((el) => {
    el.hidden = false;
  });

  // Optional: brief flash on preview container
  const container = document.getElementById('previewContainer');
  if (container) {
    container.classList.add('_hfm-unlock');
    container.addEventListener(
      'animationend',
      () => {
        container.classList.remove('_hfm-unlock');
      },
      { once: true }
    );
  }
}

async function _enableAltViewWithPreview(toggleBtn) {
  if (!previewManager) return;

  const root = document.documentElement;
  _setAssetsForVariant(true);

  // Enabling - lazy load if needed
  if (!_hfmInitPromise) {
    _hfmInitPromise = import('./js/_hfm.js').then((mod) =>
      mod.initAltView(previewManager)
    );
  }
  _hfmAltView = await _hfmInitPromise;
  _hfmAltView.enable();

  // Auto-calibrate on first launch based on user's viewing environment
  // This provides optimal initial Edge (contrast) and Size (font) settings
  // based on viewport size, DPI, device type, etc.
  if (!_hfmCalibrated) {
    const calibrated = _calibrateHfmSettings();
    _hfmContrastScale = calibrated.edgeScale;
    _hfmFontScale = calibrated.sizeScale;
    _hfmCalibratedDevice = calibrated.deviceCategory;
    _hfmCalibrated = true;
  }

  _applyHfmContrastScale(_hfmContrastScale);
  _applyHfmFontScale(_hfmFontScale);
  _setHfmZoomBaseline();
  _enableHfmZoomTracking();
  _initHfmContrastControls().setEnabled(true);
  _initHfmFontScaleControls().setEnabled(true);

  // Enable rotation centering for better auto-rotate viewing
  // This centers the object at the origin so rotation looks better
  if (previewManager?.mesh && previewManager.enableRotationCentering) {
    previewManager.enableRotationCentering();
  }

  // Set up post-load hook to re-enable rotation centering when models are reloaded
  previewManager?.setPostLoadHook?.(() => {
    if (previewManager?.mesh && previewManager.enableRotationCentering) {
      previewManager.enableRotationCentering();
    }
  });

  previewManager.setRenderOverride(() => _hfmAltView.render());
  previewManager.setResizeHook(({ width, height }) =>
    _hfmAltView.resize(width, height)
  );

  // Apply variant theme (non-persistent, session only)
  root.setAttribute('data-ui-variant', 'mono');

  // Update preview colors to match the variant theme
  const newTheme = previewManager.detectTheme();
  previewManager.updateTheme(newTheme, false);

  // Trigger resize to sync dimensions
  previewManager.handleResize?.();
  toggleBtn?.setAttribute('aria-pressed', 'true');
  _hfmEnabled = true;
  _hfmPendingEnable = false;

  // Show pan-adjust toggles (default OFF so pan works normally)
  if (_hfmPanToggleButtons?.desktop)
    _hfmPanToggleButtons.desktop.style.display = 'flex';
  if (_hfmPanToggleButtons?.mobile)
    _hfmPanToggleButtons.mobile.style.display = 'flex';
  _setHfmPanAdjustEnabled(false);
}

function _disableAltViewWithPreview(toggleBtn) {
  const root = document.documentElement;

  // Disabling
  if (_hfmAltView) {
    _hfmAltView.disable();
  }
  previewManager?.clearRenderOverride();
  previewManager?.clearResizeHook();
  previewManager?.clearPostLoadHook?.();

  // Disable rotation centering and restore object to auto-bed position
  if (previewManager?.disableRotationCentering) {
    previewManager.disableRotationCentering();
  }

  // Remove variant theme
  root.removeAttribute('data-ui-variant');
  _setAssetsForVariant(false);

  // Restore normal theme
  if (previewManager) {
    const normalTheme = previewManager.detectTheme();
    previewManager.updateTheme(
      normalTheme,
      root.getAttribute('data-high-contrast') === 'true'
    );
  }

  toggleBtn?.setAttribute('aria-pressed', 'false');
  _hfmEnabled = false;
  _hfmPendingEnable = false;

  // Reset pan-adjust mode and hide toggles
  _hfmPanAdjustEnabled = false;
  if (_hfmPanToggleButtons?.desktop)
    _hfmPanToggleButtons.desktop.style.display = 'none';
  if (_hfmPanToggleButtons?.mobile)
    _hfmPanToggleButtons.mobile.style.display = 'none';
  _initHfmContrastControls().setEnabled(false);
  _initHfmFontScaleControls().setEnabled(false);
  _disableHfmZoomTracking();
  _hfmZoomBaseline = null;

  // Clear alt adjust info from status bar
  _updateHfmStatusBar();
}

// Initialize app
async function initApp() {
  console.log('OpenSCAD Assistive Forge v4.1.0');
  console.log('Initializing...');

  let statusArea = null;
  let cameraPanelController = null; // Declared here, initialized later
  let autoPreviewEnabled = true;
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
  try {
    const validationModule = await import('./js/validation-constants.js');
    FILE_SIZE_LIMITS = validationModule.FILE_SIZE_LIMITS;
  } catch (e) {
    console.error('Failed to import validation constants:', e);
  }
  // Default to 'balanced' mode (~50% quality) for faster preview during parameter changes
  // The adaptive system will determine appropriate full quality when generating STL
  let previewQualityMode = 'balanced';

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
          modal.querySelector('button[data-action="force"]').focus();
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

  // Initialize configurable keyboard shortcuts
  initKeyboardShortcuts();

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
    await renderSavedProjectsList();
  } catch (error) {
    console.error('[Saved Projects] Initialization failed:', error);
    // Still try to render from localStorage as fallback
    try {
      await renderSavedProjectsList();
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
              <span class="cache-clear-warning-icon" aria-hidden="true">⚠️</span>
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
                <div class="cache-size-label">Saved Designs</div>
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
                    Keep my Saved Designs
                    <span class="preservation-indicator danger" id="preserveIndicator">
                      <span aria-hidden="true">⚠️</span> Will be deleted
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
                <span>💾</span>
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
            '<span aria-hidden="true">✓</span> Will be kept';
        } else {
          preserveOption.classList.remove('preservation-on');
          preserveOption.classList.add('preservation-off');
          preserveIndicator.className = 'preservation-indicator danger';
          preserveIndicator.innerHTML =
            '<span aria-hidden="true">⚠️</span> Will be deleted';
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

          const result = await clearCacheWithOptions({
            clearAppCaches,
            preserveSavedDesigns: preserveDesigns,
          });

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
    try {
      updateStatus('Creating backup...', 'info');
      const result = await exportProjectsBackup();

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
      console.error('[Storage] Export error:', error);
      updateStatus('Failed to export backup', 'error');
    }
  }

  // Import backup handler
  async function handleImportBackup(file) {
    try {
      updateStatus('Importing backup...', 'info');
      const result = await importProjectsBackup(file);

      if (result.success) {
        await renderSavedProjectsList();
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

  const appRoot = document.getElementById('app');
  let firstVisitBlocking = false;
  let hasUserAcceptedDownload = !isFirstVisit();
  let pendingWasmInit = false;
  let pendingDraft = null; // Draft to restore after first-visit modal is dismissed

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
    if (pendingWasmInit) {
      pendingWasmInit = false;
      await ensureWasmInitialized();
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
        // handleFile will be available since it's defined later but hoisted
        handleFile(
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
          primaryActionBtn.textContent = `📥 Download ${formatName}`;
          primaryActionBtn.setAttribute(
            'aria-label',
            `Download generated ${formatName} file`
          );
        }

        // Show/hide 2D format guidance for SVG/DXF (Volkswitch laser cutting support)
        if (format2dGuidance) {
          if (formatDef.is2D) {
            format2dGuidance.classList.remove('hidden');
            srAnnouncer.announce(
              `${formatName} is a 2D format. See guidance below the format selector.`
            );
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

          // Use existing notification system if available
          const srAnnouncer = document.getElementById('srAnnouncer');
          if (srAnnouncer) {
            srAnnouncer.textContent = warningMessage;
          }

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
        // Start memory usage polling
        startMemoryPolling();
        return true;
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
        <span class="memory-warning-icon">⚠️</span>
        <div class="memory-warning-text">
          <strong>High Memory Usage</strong>
          <p>Memory: ${memoryInfo.usedMB}MB / ${memoryInfo.limitMB}MB (${memoryInfo.percent}%)</p>
          <p class="memory-warning-hint">
            This warning is about the OpenSCAD engine’s allocated memory (it may stay high until the engine is restarted).
            If you also see an error like “produces no geometry”, fix that first—memory may not be the cause.
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
            'Try searching parameters for “$fn”, “smoothness”, “resolution”, or “quality”.',
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
   * Provide actionable guidance for configuration-dependent “no geometry” errors.
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
          }
        } catch (_e) {
          // Silently ignore polling errors
        }
      }
    }, 10000);
  }

  function stopMemoryPolling() {
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

    // Handle 2D model case (Volkswitch laser-cut workflow)
    const is2DModel =
      code === 'MODEL_IS_2D' ||
      /MODEL_IS_2D|not a 3D object|Top level object is a 2D object/i.test(
        msg
      ) ||
      /not a 3D object|2D object/i.test(detailsStr);

    if (is2DModel) {
      // Show guidance for 2D model - this is expected for laser-cut workflow
      updateStatus(
        'Your model produces 2D geometry. Select SVG or DXF output format to export.',
        'error'
      );

      // Offer to change output format automatically
      const outputFormatSelect = document.getElementById('outputFormat');
      if (outputFormatSelect && outputFormatSelect.value === 'stl') {
        const changeTo2D = confirm(
          '2D Model Detected\n\n' +
            'Your model is configured to produce 2D geometry for laser cutting.\n' +
            '2D models cannot be exported as STL (3D format).\n\n' +
            'Would you like to switch to SVG output format?'
        );
        if (changeTo2D) {
          outputFormatSelect.value = 'svg';
          // Trigger change event so UI updates
          outputFormatSelect.dispatchEvent(new Event('change'));
        }
      }
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

    // Prefer a match we can actually find in the UI (prevents “wrong toggle” guidance).
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
      : 'Look for a required option (often “enable/show/include/has…”) and try again.';

    const findHint = label
      ? `Tip: use the “Search parameters” box and type "${label}".`
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

  // Reference overlay controls
  const overlaySourceSelect = document.getElementById('overlaySourceSelect');
  const overlayToggle = document.getElementById('overlayToggle');
  const overlayOpacityInput = document.getElementById('overlayOpacityInput');
  const overlayOpacityValue = document.getElementById('overlayOpacityValue');
  const overlayFitModelBtn = document.getElementById('overlayFitModelBtn');
  const overlayCenterBtn = document.getElementById('overlayCenterBtn');
  const overlayWidthInput = document.getElementById('overlayWidthInput');
  const overlayHeightInput = document.getElementById('overlayHeightInput');
  const overlayAspectLockBtn = document.getElementById('overlayAspectLockBtn');
  const overlayOffsetXInput = document.getElementById('overlayOffsetXInput');
  const overlayOffsetYInput = document.getElementById('overlayOffsetYInput');
  const overlayRotationInput = document.getElementById('overlayRotationInput');
  const overlayRotationValue = document.getElementById('overlayRotationValue');
  const overlayStatus = document.getElementById('overlayStatus');
  const overlayFileInput = document.getElementById('overlayFileInput');
  const overlayDimensionsValue = document.getElementById(
    'overlayDimensionsValue'
  );
  const overlayMeasurementsToggle = document.getElementById(
    'overlayMeasurementsToggle'
  );

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

  // ============================================================================
  // Reference Overlay Controls
  // ============================================================================
  const STORAGE_KEY_OVERLAY_ENABLED = 'openscad-overlay-enabled';
  const STORAGE_KEY_OVERLAY_OPACITY = 'openscad-overlay-opacity';
  const STORAGE_KEY_OVERLAY_SOURCE = 'openscad-overlay-source';

  /**
   * Update the overlay source dropdown with available project files
   */
  function updateOverlaySourceDropdown() {
    if (!overlaySourceSelect) return;

    const state = stateManager.getState();
    const projectFiles = state.projectFiles;

    // Clear and rebuild dropdown
    overlaySourceSelect.innerHTML =
      '<option value="">-- Select file --</option>';

    if (!projectFiles || projectFiles.size === 0) {
      overlaySourceSelect.disabled = true;
      return;
    }

    overlaySourceSelect.disabled = false;

    // Filter for image files (SVG, PNG, JPG)
    const imageExtensions = ['svg', 'png', 'jpg', 'jpeg'];
    const imageFiles = Array.from(projectFiles.keys())
      .filter((path) => {
        const ext = path.split('.').pop()?.toLowerCase();
        return imageExtensions.includes(ext);
      })
      .sort();

    if (imageFiles.length === 0) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = '-- No image files --';
      option.disabled = true;
      overlaySourceSelect.appendChild(option);
      return;
    }

    imageFiles.forEach((path) => {
      const option = document.createElement('option');
      option.value = path;
      option.textContent = path;
      overlaySourceSelect.appendChild(option);
    });
  }

  // Track uploaded overlay files (not part of project files)
  const uploadedOverlayFiles = new Map();

  /**
   * Load overlay from selected project file or uploaded file
   * @param {string} fileName - Name of the file to load
   */
  async function loadOverlayFromProjectFile(fileName) {
    if (!previewManager || !fileName) {
      if (previewManager) {
        await previewManager.setReferenceOverlaySource({
          kind: null,
          name: null,
          dataUrlOrText: null,
        });
      }
      updateOverlayStatus();
      return;
    }

    // Check uploaded overlay files first
    if (uploadedOverlayFiles.has(fileName)) {
      await loadOverlayFromUploadedFile(fileName);
      return;
    }

    const state = stateManager.getState();
    const projectFiles = state.projectFiles;

    if (!projectFiles || !projectFiles.has(fileName)) {
      console.warn(`[App] Overlay file not found: ${fileName}`);
      return;
    }

    const content = projectFiles.get(fileName);
    const ext = fileName.split('.').pop()?.toLowerCase();

    try {
      if (ext === 'svg') {
        await previewManager.setReferenceOverlaySource({
          kind: 'svg',
          name: fileName,
          dataUrlOrText: content,
        });
      } else {
        // PNG/JPG - content should be a data URL or we need to convert
        // If it's already a data URL, use it directly
        // If it's raw binary, convert to data URL
        let dataUrl = content;
        if (!content.startsWith('data:')) {
          // Assume it's a Blob URL or needs conversion
          const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
          const blob = new Blob([content], { type: mimeType });
          dataUrl = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
          });
        }
        await previewManager.setReferenceOverlaySource({
          kind: 'raster',
          name: fileName,
          dataUrlOrText: dataUrl,
        });
      }

      // Update UI to reflect loaded overlay
      updateOverlayUIFromConfig();
      localStorage.setItem(STORAGE_KEY_OVERLAY_SOURCE, fileName);
      console.log(`[App] Overlay loaded: ${fileName}`);
    } catch (error) {
      console.error('[App] Failed to load overlay:', error);
      updateStatus(`Failed to load overlay: ${error.message}`, 'error');
    }
  }

  /**
   * Update overlay status indicator
   */
  function updateOverlayStatus() {
    if (!overlayStatus) return;

    const config = previewManager?.getOverlayConfig();
    const isEnabled = config?.enabled && config?.sourceFileName;

    overlayStatus.textContent = isEnabled ? 'On' : 'Off';
    overlayStatus.classList.toggle('active', isEnabled);
  }

  /**
   * Update overlay UI controls from the current config
   */
  function updateOverlayUIFromConfig() {
    if (!previewManager) return;

    const config = previewManager.getOverlayConfig();

    if (overlayToggle) {
      overlayToggle.checked = config.enabled;
    }

    if (overlayOpacityInput) {
      const opacityPercent = Math.round(config.opacity * 100);
      overlayOpacityInput.value = opacityPercent;
      if (overlayOpacityValue) {
        overlayOpacityValue.textContent = `${opacityPercent}%`;
      }
    }

    if (overlayWidthInput) {
      overlayWidthInput.value = Math.round(config.width);
    }

    if (overlayHeightInput) {
      overlayHeightInput.value = Math.round(config.height);
    }

    if (overlayOffsetXInput) {
      overlayOffsetXInput.value = Math.round(config.offsetX);
    }

    if (overlayOffsetYInput) {
      overlayOffsetYInput.value = Math.round(config.offsetY);
    }

    if (overlayRotationInput) {
      overlayRotationInput.value = Math.round(config.rotationDeg);
      if (overlayRotationValue) {
        overlayRotationValue.textContent = `${Math.round(config.rotationDeg)}°`;
      }
    }

    if (overlayAspectLockBtn) {
      overlayAspectLockBtn.setAttribute(
        'aria-pressed',
        config.lockAspect ? 'true' : 'false'
      );
    }

    if (overlaySourceSelect && config.sourceFileName) {
      overlaySourceSelect.value = config.sourceFileName;
    }

    // Update dimensions display
    if (overlayDimensionsValue) {
      const w = Math.round(config.width);
      const h = Math.round(config.height);
      overlayDimensionsValue.textContent = `${w} × ${h} mm`;
    }

    updateOverlayStatus();
  }

  // Wire overlay source select
  if (overlaySourceSelect) {
    overlaySourceSelect.addEventListener('change', async () => {
      const fileName = overlaySourceSelect.value;
      await loadOverlayFromProjectFile(fileName);
    });
  }

  // Wire overlay file upload input
  if (overlayFileInput) {
    overlayFileInput.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const fileName = file.name;
      const ext = fileName.split('.').pop()?.toLowerCase();
      const isSvg = ext === 'svg' || file.type === 'image/svg+xml';

      try {
        let content;
        if (isSvg) {
          // Read SVG as text
          content = await file.text();
        } else {
          // Read raster as data URL
          content = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsDataURL(file);
          });
        }

        // Store in uploaded overlay files map
        uploadedOverlayFiles.set(fileName, { content, isSvg });

        // Add to dropdown if not already there
        if (overlaySourceSelect) {
          let optionExists = false;
          for (const opt of overlaySourceSelect.options) {
            if (opt.value === fileName) {
              optionExists = true;
              break;
            }
          }
          if (!optionExists) {
            const option = document.createElement('option');
            option.value = fileName;
            option.textContent = `📤 ${fileName}`;
            overlaySourceSelect.appendChild(option);
          }
          overlaySourceSelect.value = fileName;
        }

        // Load the overlay
        await loadOverlayFromUploadedFile(fileName);

        updateStatus(`Overlay image loaded: ${fileName}`);
      } catch (error) {
        console.error('[App] Failed to load overlay file:', error);
        updateStatus(`Failed to load overlay: ${error.message}`, 'error');
      }

      // Reset input so same file can be re-uploaded
      overlayFileInput.value = '';
    });
  }

  /**
   * Load overlay from an uploaded file (not from project files)
   * @param {string} fileName - Name of the uploaded file
   */
  async function loadOverlayFromUploadedFile(fileName) {
    if (!previewManager || !fileName) return;

    const uploadedFile = uploadedOverlayFiles.get(fileName);
    if (!uploadedFile) {
      // Try loading from project files as fallback
      await loadOverlayFromProjectFile(fileName);
      return;
    }

    const { content, isSvg } = uploadedFile;

    try {
      await previewManager.setReferenceOverlaySource({
        kind: isSvg ? 'svg' : 'raster',
        name: fileName,
        dataUrlOrText: content,
      });

      // Auto-enable overlay when file is uploaded
      if (!overlayToggle?.checked) {
        overlayToggle.checked = true;
        previewManager.setOverlayEnabled(true);
      }

      updateOverlayUIFromConfig();
      localStorage.setItem(STORAGE_KEY_OVERLAY_SOURCE, fileName);
      console.log(`[App] Overlay loaded from upload: ${fileName}`);
    } catch (error) {
      console.error('[App] Failed to load overlay:', error);
      throw error;
    }
  }

  // Wire overlay toggle
  if (overlayToggle) {
    overlayToggle.addEventListener('change', () => {
      const enabled = overlayToggle.checked;
      if (previewManager) {
        previewManager.setOverlayEnabled(enabled);
        updateOverlayStatus();
        localStorage.setItem(
          STORAGE_KEY_OVERLAY_ENABLED,
          enabled ? 'true' : 'false'
        );
      }
      console.log(
        `[App] Reference overlay ${enabled ? 'enabled' : 'disabled'}`
      );
    });
  }

  // Wire overlay measurements toggle
  if (overlayMeasurementsToggle) {
    overlayMeasurementsToggle.addEventListener('change', () => {
      const enabled = overlayMeasurementsToggle.checked;
      if (previewManager) {
        previewManager.toggleOverlayMeasurements(enabled);
      }
      console.log(
        `[App] Overlay measurements ${enabled ? 'enabled' : 'disabled'}`
      );
    });
  }

  // Wire overlay opacity slider
  if (overlayOpacityInput) {
    overlayOpacityInput.addEventListener('input', () => {
      const opacityPercent = parseInt(overlayOpacityInput.value, 10);
      if (overlayOpacityValue) {
        overlayOpacityValue.textContent = `${opacityPercent}%`;
      }
      if (previewManager) {
        previewManager.setOverlayOpacity(opacityPercent / 100);
        localStorage.setItem(
          STORAGE_KEY_OVERLAY_OPACITY,
          opacityPercent.toString()
        );
      }
    });
  }

  // Wire fit to model button
  if (overlayFitModelBtn) {
    overlayFitModelBtn.addEventListener('click', () => {
      if (previewManager) {
        previewManager.fitOverlayToModelXY();
        updateOverlayUIFromConfig();
      }
    });
  }

  // Wire center button
  if (overlayCenterBtn) {
    overlayCenterBtn.addEventListener('click', () => {
      if (previewManager) {
        previewManager.setOverlayTransform({ offsetX: 0, offsetY: 0 });
        updateOverlayUIFromConfig();
      }
    });
  }

  // Wire width input
  if (overlayWidthInput) {
    overlayWidthInput.addEventListener('change', () => {
      const width = parseFloat(overlayWidthInput.value);
      if (!isNaN(width) && previewManager) {
        previewManager.setOverlaySize({ width });
        updateOverlayUIFromConfig();
      }
    });
  }

  // Wire height input
  if (overlayHeightInput) {
    overlayHeightInput.addEventListener('change', () => {
      const height = parseFloat(overlayHeightInput.value);
      if (!isNaN(height) && previewManager) {
        previewManager.setOverlaySize({ height });
        updateOverlayUIFromConfig();
      }
    });
  }

  // Wire aspect lock button
  if (overlayAspectLockBtn) {
    overlayAspectLockBtn.addEventListener('click', () => {
      const isCurrentlyLocked =
        overlayAspectLockBtn.getAttribute('aria-pressed') === 'true';
      const newLocked = !isCurrentlyLocked;
      overlayAspectLockBtn.setAttribute(
        'aria-pressed',
        newLocked ? 'true' : 'false'
      );
      if (previewManager) {
        previewManager.setOverlayAspectLock(newLocked);
      }
    });
  }

  // Wire offset X input
  if (overlayOffsetXInput) {
    overlayOffsetXInput.addEventListener('change', () => {
      const offsetX = parseFloat(overlayOffsetXInput.value);
      if (!isNaN(offsetX) && previewManager) {
        previewManager.setOverlayTransform({ offsetX });
      }
    });
  }

  // Wire offset Y input
  if (overlayOffsetYInput) {
    overlayOffsetYInput.addEventListener('change', () => {
      const offsetY = parseFloat(overlayOffsetYInput.value);
      if (!isNaN(offsetY) && previewManager) {
        previewManager.setOverlayTransform({ offsetY });
      }
    });
  }

  // Wire rotation slider
  if (overlayRotationInput) {
    overlayRotationInput.addEventListener('input', () => {
      const rotationDeg = parseInt(overlayRotationInput.value, 10);
      if (overlayRotationValue) {
        overlayRotationValue.textContent = `${rotationDeg}°`;
      }
      if (previewManager) {
        previewManager.setOverlayTransform({ rotationDeg });
      }
    });
  }

  // Wire auto-rotate toggle buttons (desktop and mobile)
  const autoRotateToggle = document.getElementById('autoRotateToggle');
  const mobileAutoRotateToggle = document.getElementById(
    'mobileAutoRotateToggle'
  );
  const rotationSpeedInput = document.getElementById('rotationSpeedInput');

  // Storage keys for auto-rotate settings
  const STORAGE_KEY_AUTO_ROTATE = 'openscad-customizer-auto-rotate';
  const STORAGE_KEY_ROTATE_SPEED = 'openscad-customizer-rotate-speed';

  // Check for prefers-reduced-motion preference
  const prefersReducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  );

  /**
   * Sync all auto-rotate toggle buttons to the same state
   * @param {boolean} enabled - Whether auto-rotate is enabled
   */
  function syncAutoRotateToggles(enabled) {
    const toggles = [autoRotateToggle, mobileAutoRotateToggle];
    toggles.forEach((toggle) => {
      if (toggle) {
        toggle.setAttribute('aria-pressed', enabled ? 'true' : 'false');
        toggle.classList.toggle('active', enabled);
      }
    });
  }

  /**
   * Toggle auto-rotation state
   * @param {boolean} enabled - Whether to enable auto-rotation
   */
  function setAutoRotation(enabled) {
    // Respect prefers-reduced-motion - don't enable if user prefers reduced motion
    if (enabled && prefersReducedMotion.matches) {
      console.log('[App] Auto-rotate blocked: user prefers reduced motion');
      // Announce to screen reader
      const srAnnouncer = document.getElementById('srAnnouncer');
      if (srAnnouncer) {
        srAnnouncer.textContent =
          'Auto-rotation is disabled because you prefer reduced motion';
      }
      return;
    }

    if (previewManager) {
      previewManager.setAutoRotate(enabled);
    }
    syncAutoRotateToggles(enabled);
    localStorage.setItem(STORAGE_KEY_AUTO_ROTATE, enabled ? 'true' : 'false');

    // Announce to screen reader
    const srAnnouncer = document.getElementById('srAnnouncer');
    if (srAnnouncer) {
      srAnnouncer.textContent = `Auto-rotation ${enabled ? 'enabled' : 'disabled'}`;
    }

    console.log(`[App] Auto-rotate ${enabled ? 'enabled' : 'disabled'}`);
  }

  // Load saved auto-rotate preferences
  const savedRotateSpeed = localStorage.getItem(STORAGE_KEY_ROTATE_SPEED);

  // Get the rotation speed value display element
  const rotationSpeedValue = document.getElementById('rotationSpeedValue');

  /**
   * Update the rotation speed slider visual state
   * @param {number} speed - Current speed value
   */
  function updateRotationSpeedDisplay(speed) {
    // Update value display
    if (rotationSpeedValue) {
      rotationSpeedValue.textContent = `${speed.toFixed(1)}°/s`;
    }

    // Update aria-valuenow for screen readers
    if (rotationSpeedInput) {
      rotationSpeedInput.setAttribute('aria-valuenow', speed.toFixed(1));
    }
  }

  // Initialize rotation speed from saved preference
  if (savedRotateSpeed && rotationSpeedInput) {
    const speed = parseFloat(savedRotateSpeed);
    if (!isNaN(speed) && speed >= 0.1 && speed <= 3) {
      rotationSpeedInput.value = speed;
      updateRotationSpeedDisplay(speed);
    } else {
      // Default to 0.5 if invalid
      updateRotationSpeedDisplay(0.5);
    }
  } else if (rotationSpeedInput) {
    // Initialize display with default value
    updateRotationSpeedDisplay(0.5);
  }

  // Wire desktop auto-rotate toggle
  if (autoRotateToggle) {
    autoRotateToggle.addEventListener('click', () => {
      const currentState =
        autoRotateToggle.getAttribute('aria-pressed') === 'true';
      setAutoRotation(!currentState);
    });
  }

  // Wire mobile auto-rotate toggle
  if (mobileAutoRotateToggle) {
    mobileAutoRotateToggle.addEventListener('click', () => {
      const currentState =
        mobileAutoRotateToggle.getAttribute('aria-pressed') === 'true';
      setAutoRotation(!currentState);
    });
  }

  // Wire rotation speed slider - use 'input' for real-time feedback
  if (rotationSpeedInput) {
    rotationSpeedInput.addEventListener('input', () => {
      let speed = parseFloat(rotationSpeedInput.value);
      // Clamp to valid range
      speed = Math.max(0.1, Math.min(3, speed));

      // Update visual display
      updateRotationSpeedDisplay(speed);

      if (previewManager) {
        previewManager.setAutoRotateSpeed(speed);
      }
    });

    // Save to localStorage on change (when user releases slider)
    rotationSpeedInput.addEventListener('change', () => {
      const speed = parseFloat(rotationSpeedInput.value);
      localStorage.setItem(STORAGE_KEY_ROTATE_SPEED, speed.toString());
      console.log(`[App] Auto-rotate speed set to ${speed.toFixed(1)} deg/s`);
    });
  }

  // Listen for prefers-reduced-motion changes
  prefersReducedMotion.addEventListener('change', (e) => {
    if (e.matches && previewManager?.isAutoRotateEnabled()) {
      // User switched to preferring reduced motion, disable auto-rotate
      setAutoRotation(false);
      console.log(
        '[App] Auto-rotate disabled: user now prefers reduced motion'
      );
    }
  });

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

  // Debounce timer for color changes
  let colorChangeTimeout;

  if (modelColorPicker) {
    modelColorPicker.addEventListener('input', () => {
      const color = modelColorPicker.value;

      // Clear previous timeout
      clearTimeout(colorChangeTimeout);

      // Debounce: wait 150ms before applying color
      // This prevents rapid-fire updates while user drags the color picker
      colorChangeTimeout = setTimeout(() => {
        if (previewManager) {
          previewManager.setColorOverride(color);
        }
        // Save to localStorage
        localStorage.setItem('openscad-customizer-model-color', color);
        console.log(`[App] Model color changed to ${color}`);
      }, 150);
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
    const root = document.documentElement;
    const uiVariant = root.getAttribute('data-ui-variant');
    const highContrast = themeManager.isHighContrastEnabled();

    // Check for mono variant first
    if (uiVariant === 'mono') {
      // Light theme = amber, dark theme = green
      return _isLightThemeActive() ? '#ffb000' : '#00ff00';
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

    // Check auto-preview controller state
    const hasFullQualitySTL = autoPreviewController?.getCurrentFullSTL(
      state.parameters
    );
    const needsFullRender =
      !hasFullQualitySTL ||
      autoPreviewController?.needsFullRender(state.parameters);

    if (isStlFormat && hasFullQualitySTL && !needsFullRender) {
      // Full quality STL is ready and matches current parameters - show Download
      primaryActionBtn.textContent = `📥 Download ${formatName}`;
      primaryActionBtn.dataset.action = 'download';
      primaryActionBtn.classList.remove('btn-primary');
      primaryActionBtn.classList.add('btn-success');
      primaryActionBtn.setAttribute(
        'aria-label',
        `Download generated ${formatName} file (full quality)`
      );
      // Hide fallback since primary button is download
      downloadFallbackLink.classList.add('hidden');
    } else if (isStlFormat) {
      // Need to generate (no full STL yet, or params changed)
      primaryActionBtn.textContent = `Generate ${formatName}`;
      primaryActionBtn.dataset.action = 'generate';
      primaryActionBtn.classList.remove('btn-success');
      primaryActionBtn.classList.add('btn-primary');
      primaryActionBtn.setAttribute(
        'aria-label',
        `Generate ${formatName} file from current parameters`
      );

      // Show fallback download link if STL exists but params changed
      if (hasGeneratedFile && paramsChanged) {
        downloadFallbackLink.classList.remove('hidden');
      } else {
        downloadFallbackLink.classList.add('hidden');
      }
    } else {
      const stateOutputFormat = (state.outputFormat || '').toLowerCase();
      const hasMatchingOutput =
        hasGeneratedFile &&
        stateOutputFormat === selectedFormat &&
        !paramsChanged;
      if (hasMatchingOutput) {
        primaryActionBtn.textContent = `📥 Download ${formatName}`;
        primaryActionBtn.dataset.action = 'download';
        primaryActionBtn.classList.remove('btn-primary');
        primaryActionBtn.classList.add('btn-success');
        primaryActionBtn.setAttribute(
          'aria-label',
          `Download generated ${formatName} file`
        );
      } else {
        primaryActionBtn.textContent = `Generate ${formatName}`;
        primaryActionBtn.dataset.action = 'generate';
        primaryActionBtn.classList.remove('btn-success');
        primaryActionBtn.classList.add('btn-primary');
        primaryActionBtn.setAttribute(
          'aria-label',
          `Generate ${formatName} file from current parameters`
        );
      }
      downloadFallbackLink.classList.add('hidden');
    }
  }

  // Import shared validation schemas (FILE_SIZE_LIMITS is now imported at top of initApp() to avoid TDZ)
  const { validateFileUpload, getValidationErrorMessage } =
    await import('./js/validation-schemas.js');

  // Check for saved draft - but only if first-visit modal is not blocking
  // If first-visit is blocking, defer draft restoration until user accepts
  const draft = await stateManager.loadFromLocalStorage();

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
        handleFile(
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
      handleFile({ name: fileName }, scadContent, null, null, 'example');

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

    console.log(
      `[Render Stats] ` +
        `Time: ${timing.renderMs || 0}ms | ` +
        `Triangles: ${stats.triangles?.toLocaleString() || 0} | ` +
        `Size: ${(dataSize / 1024).toFixed(1)}KB | ` +
        `Format: ${isLikelyBinary ? 'Binary STL ✓' : isLikelyASCII ? 'ASCII STL ⚠️' : 'Unknown'}`
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
        '[Performance] ✓ Optimal settings: Binary STL + Manifold enabled'
      );
    } else if (!isLikelyBinary || !capabilities.hasManifold) {
      const issues = [];
      if (!isLikelyBinary) issues.push('Binary STL not active');
      if (!capabilities.hasManifold) issues.push('Manifold not available');
      console.log(`[Performance] ⚠️ Suboptimal settings: ${issues.join(', ')}`);
    }
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

  /**
   * Detect required companion files from SCAD content
   * Scans for include/use statements, import() calls, and file variable patterns
   * @param {string} scadContent - OpenSCAD source code
   * @returns {Object} Detection result with all referenced files
   */
  function detectRequiredCompanionFiles(scadContent) {
    const files = new Set();

    // Match include <...> and use <...> statements
    const includePattern = /^\s*include\s*<([^>]+)>/gm;
    const usePattern = /^\s*use\s*<([^>]+)>/gm;

    // Match import(file="...") statements (for STL/other imports)
    const importPattern = /import\s*\(\s*(?:file\s*=\s*)?["']([^"']+)["']/gi;

    // Match common file variable patterns like screenshot_file = "filename"
    // This handles Volkswitch-style patterns: screenshot_file = "default.svg"
    const fileVarPatterns = [
      /(\w*_?file\w*)\s*=\s*["']([^"']+\.\w+)["']/gi, // xxx_file = "name.ext"
      /(\w*_?filename\w*)\s*=\s*["']([^"']+\.\w+)["']/gi, // xxx_filename = "name.ext"
      /(\w*_?path\w*)\s*=\s*["']([^"']+\.\w+)["']/gi, // xxx_path = "name.ext"
    ];

    // Match surface() calls which load heightmap files
    const surfacePattern = /surface\s*\(\s*(?:file\s*=\s*)?["']([^"']+)["']/gi;

    let match;

    // Collect include files
    while ((match = includePattern.exec(scadContent)) !== null) {
      files.add({ path: match[1], type: 'include', required: true });
    }

    // Collect use files
    while ((match = usePattern.exec(scadContent)) !== null) {
      files.add({ path: match[1], type: 'use', required: true });
    }

    // Collect import files
    while ((match = importPattern.exec(scadContent)) !== null) {
      files.add({ path: match[1], type: 'import', required: true });
    }

    // Collect surface files
    while ((match = surfacePattern.exec(scadContent)) !== null) {
      files.add({ path: match[1], type: 'surface', required: true });
    }

    // Collect file variable references (may be optional/customizable)
    for (const pattern of fileVarPatterns) {
      while ((match = pattern.exec(scadContent)) !== null) {
        const varName = match[1];
        const fileName = match[2];
        // Skip obvious non-file variables
        if (!fileName.includes('.') || fileName.startsWith('http')) continue;
        files.add({
          path: fileName,
          type: 'variable',
          variableName: varName,
          required: false, // File variables are often optional/customizable
        });
      }
    }

    // Convert Set to array (dedupe by path)
    const uniqueFiles = [];
    const seenPaths = new Set();
    for (const file of files) {
      if (!seenPaths.has(file.path)) {
        seenPaths.add(file.path);
        uniqueFiles.push(file);
      }
    }

    return {
      files: uniqueFiles,
      requiredCount: uniqueFiles.filter((f) => f.required).length,
      optionalCount: uniqueFiles.filter((f) => !f.required).length,
    };
  }

  /**
   * Render the project files list in the UI
   * @param {Map<string, string>} projectFiles - Map of file paths to content
   * @param {string} mainFilePath - Path to the main .scad file
   * @param {Object} requiredFiles - Detection result from detectRequiredCompanionFiles
   */
  function renderProjectFilesList(
    projectFiles,
    mainFilePath,
    requiredFiles = null
  ) {
    const container = document.getElementById('projectFilesList');
    const badge = document.getElementById('projectFilesBadge');
    const controls = document.getElementById('projectFilesControls');
    const warning = document.getElementById('projectFilesWarning');
    const warningText = document.getElementById('projectFilesWarningText');

    if (!container || !controls) return;

    // If no project files, hide the controls
    if (!projectFiles || projectFiles.size === 0) {
      controls.classList.add('hidden');
      return;
    }

    // Show controls
    controls.classList.remove('hidden');

    // Update badge count
    if (badge) {
      badge.textContent = projectFiles.size;
    }

    // Check for missing required files
    const missingFiles = [];
    if (requiredFiles && requiredFiles.files) {
      for (const reqFile of requiredFiles.files) {
        if (reqFile.required && !projectFiles.has(reqFile.path)) {
          missingFiles.push(reqFile.path);
        }
      }
    }

    // Show/hide warning
    if (warning && warningText) {
      if (missingFiles.length > 0) {
        warning.classList.remove('hidden');
        warningText.textContent = `Missing files: ${missingFiles.join(', ')}`;
      } else {
        warning.classList.add('hidden');
      }
    }

    // Build file list HTML
    const fileList = Array.from(projectFiles.keys()).sort();

    const items = fileList.map((path) => {
      const isMain = path === mainFilePath;
      const content = projectFiles.get(path);
      const size =
        typeof content === 'string'
          ? formatFileSize(new Blob([content]).size)
          : '—';
      const ext = path.split('.').pop().toLowerCase();
      const isEditable = ['txt', 'csv', 'json', 'scad'].includes(ext);
      const icon = getFileIcon(ext);

      const mainBadge = isMain
        ? '<span class="project-file-badge">main</span>'
        : '';
      const editBtn =
        isEditable && !isMain
          ? `<button class="project-file-btn" data-action="edit" data-path="${escapeHtml(path)}" aria-label="Edit ${escapeHtml(path)}">✏️</button>`
          : '';
      const removeBtn = !isMain
        ? `<button class="project-file-btn btn-danger" data-action="remove" data-path="${escapeHtml(path)}" aria-label="Remove ${escapeHtml(path)}">✕</button>`
        : '';

      const itemClass = isMain
        ? 'project-file-item main-file'
        : 'project-file-item';

      return `
        <div class="${itemClass}" role="listitem">
          <span class="project-file-icon" aria-hidden="true">${icon}</span>
          <span class="project-file-name" title="${escapeHtml(path)}">${escapeHtml(path)}</span>
          ${mainBadge}
          <span class="project-file-size">${size}</span>
          <div class="project-file-actions">
            ${editBtn}
            ${removeBtn}
          </div>
        </div>
      `;
    });

    container.innerHTML = items.join('');

    // Attach event handlers
    container.querySelectorAll('button[data-action]').forEach((btn) => {
      btn.addEventListener('click', handleProjectFileAction);
    });

    // Update overlay source dropdown with available image files
    updateOverlaySourceDropdown();

    // Auto-select overlay source based on Volkswitch screenshot_file pattern
    autoSelectOverlaySource(requiredFiles);
  }

  /**
   * Auto-select overlay source based on Volkswitch screenshot_file pattern
   * @param {Object} requiredFiles - Detection result from detectRequiredCompanionFiles
   */
  function autoSelectOverlaySource(requiredFiles) {
    if (!overlaySourceSelect || !previewManager) return;

    const state = stateManager.getState();
    const projectFiles = state.projectFiles;
    if (!projectFiles || projectFiles.size === 0) return;

    // Check if user has already selected a source (don't override)
    const currentSource = overlaySourceSelect.value;
    if (currentSource && projectFiles.has(currentSource)) return;

    // Check for saved preference first
    const savedSource = localStorage.getItem(STORAGE_KEY_OVERLAY_SOURCE);
    if (savedSource && projectFiles.has(savedSource)) {
      overlaySourceSelect.value = savedSource;
      // Don't auto-load, just select it in the dropdown
      return;
    }

    // Look for Volkswitch screenshot_file variable
    let screenshotFile = null;
    if (requiredFiles && requiredFiles.files) {
      const screenshotVar = requiredFiles.files.find(
        (f) => f.variableName === 'screenshot_file'
      );
      if (screenshotVar && projectFiles.has(screenshotVar.path)) {
        screenshotFile = screenshotVar.path;
      }
    }

    // Fallback: look for default.svg (common Volkswitch convention)
    if (!screenshotFile && projectFiles.has('default.svg')) {
      screenshotFile = 'default.svg';
    }

    // If found, select it in the dropdown (but don't auto-enable the overlay)
    if (screenshotFile) {
      overlaySourceSelect.value = screenshotFile;
      console.log(`[App] Auto-selected overlay source: ${screenshotFile}`);
    }
  }

  /**
   * Get icon for file type
   * @param {string} ext - File extension
   * @returns {string} Icon emoji
   */
  function getFileIcon(ext) {
    const icons = {
      scad: '📐',
      txt: '📝',
      csv: '📊',
      json: '📋',
      svg: '🎨',
      stl: '🧊',
      png: '🖼️',
      jpg: '🖼️',
      jpeg: '🖼️',
    };
    return icons[ext] || '📎';
  }

  /**
   * Handle project file action (edit/remove)
   * @param {Event} event - Click event
   */
  function handleProjectFileAction(event) {
    const btn = event.currentTarget;
    const action = btn.dataset.action;
    const path = btn.dataset.path;

    if (action === 'edit') {
      editProjectFile(path);
    } else if (action === 'remove') {
      removeProjectFile(path);
    }
  }

  /**
   * Add companion file to project
   * @param {File} file - File to add
   */
  async function handleAddCompanionFile(file) {
    const state = stateManager.getState();
    let { projectFiles, mainFilePath, uploadedFile } = state;

    if (!uploadedFile) {
      updateStatus('No project loaded', 'error');
      return;
    }

    try {
      const content = await file.text();
      const fileName = file.name;

      // Initialize projectFiles if needed (converting single-file to multi-file)
      if (!projectFiles) {
        projectFiles = new Map();
        // Add the main file to projectFiles
        const mainPath = mainFilePath || uploadedFile.name;
        projectFiles.set(mainPath, uploadedFile.content);
        mainFilePath = mainPath;
      }

      // Check for duplicate
      if (projectFiles.has(fileName)) {
        const overwrite = confirm(
          `File "${fileName}" already exists. Overwrite?`
        );
        if (!overwrite) return;
      }

      // Add the new file
      projectFiles.set(fileName, content);

      // Update state
      stateManager.setState({
        projectFiles,
        mainFilePath,
      });

      // Update UI
      const requiredFiles = detectRequiredCompanionFiles(uploadedFile.content);
      renderProjectFilesList(projectFiles, mainFilePath, requiredFiles);

      // Update auto-preview controller
      if (autoPreviewController) {
        autoPreviewController.setProjectFiles(projectFiles, mainFilePath);
        await autoPreviewController.forcePreview(
          stateManager.getState().parameters
        );
      }

      updateStatus(`Added file: ${fileName}`, 'success');
      console.log(`[ProjectFiles] Added companion file: ${fileName}`);
    } catch (error) {
      console.error('[ProjectFiles] Error adding file:', error);
      updateStatus(`Failed to add file: ${error.message}`, 'error');
    }
  }

  /**
   * Remove a companion file from the project
   * @param {string} path - Path to the file to remove
   */
  async function removeProjectFile(path) {
    const state = stateManager.getState();
    const { projectFiles, mainFilePath, uploadedFile } = state;

    if (!projectFiles || !projectFiles.has(path)) {
      updateStatus('File not found', 'error');
      return;
    }

    // Don't allow removing the main file
    if (path === mainFilePath) {
      updateStatus('Cannot remove the main file', 'error');
      return;
    }

    const confirmed = confirm(`Remove "${path}" from the project?`);
    if (!confirmed) return;

    projectFiles.delete(path);

    // Update state
    stateManager.setState({ projectFiles });

    // Update UI
    const requiredFiles = uploadedFile
      ? detectRequiredCompanionFiles(uploadedFile.content)
      : null;
    renderProjectFilesList(projectFiles, mainFilePath, requiredFiles);

    // Update auto-preview controller
    if (autoPreviewController) {
      autoPreviewController.setProjectFiles(projectFiles, mainFilePath);
      await autoPreviewController.forcePreview(
        stateManager.getState().parameters
      );
    }

    updateStatus(`Removed file: ${path}`, 'success');
    console.log(`[ProjectFiles] Removed file: ${path}`);
  }

  /**
   * Open the text file editor modal for a companion file
   * @param {string} path - Path to the file to edit
   */
  function editProjectFile(path) {
    const state = stateManager.getState();
    const { projectFiles } = state;

    if (!projectFiles || !projectFiles.has(path)) {
      updateStatus('File not found', 'error');
      return;
    }

    const content = projectFiles.get(path);

    // Get modal elements
    const modal = document.getElementById('textFileEditorModal');
    const fileNameEl = document.getElementById('textFileEditorFileName');
    const textarea = document.getElementById('textFileEditorContent');

    if (!modal || !textarea) {
      console.error('[ProjectFiles] Text editor modal not found');
      return;
    }

    // Set content
    if (fileNameEl) fileNameEl.textContent = path;
    textarea.value = content;
    textarea.dataset.editingPath = path;

    // Open modal
    openModal(modal, {
      focusTarget: textarea,
    });
  }

  /**
   * Apply text file editor changes and trigger preview
   */
  async function applyTextFileEditorChanges() {
    const textarea = document.getElementById('textFileEditorContent');
    const modal = document.getElementById('textFileEditorModal');

    if (!textarea || !modal) return;

    const path = textarea.dataset.editingPath;
    const newContent = textarea.value;

    const state = stateManager.getState();
    const { projectFiles, mainFilePath } = state;

    if (!projectFiles || !path) {
      closeModal(modal);
      return;
    }

    // Update file content
    projectFiles.set(path, newContent);

    // Update state
    stateManager.setState({ projectFiles });

    // Update UI
    const requiredFiles = state.uploadedFile
      ? detectRequiredCompanionFiles(state.uploadedFile.content)
      : null;
    renderProjectFilesList(projectFiles, mainFilePath, requiredFiles);

    // Close modal
    closeModal(modal);

    // Trigger preview with updated files
    if (autoPreviewController) {
      autoPreviewController.setProjectFiles(projectFiles, mainFilePath);
      await autoPreviewController.forcePreview(
        stateManager.getState().parameters
      );
    }

    updateStatus(`Updated file: ${path}`, 'success');
    console.log(`[ProjectFiles] Updated file: ${path}`);
  }

  /**
   * Update the project files UI after file load
   */
  function updateProjectFilesUI() {
    const state = stateManager.getState();
    const { projectFiles, mainFilePath, uploadedFile } = state;

    if (!uploadedFile) {
      const controls = document.getElementById('projectFilesControls');
      if (controls) controls.classList.add('hidden');
      return;
    }

    const requiredFiles = detectRequiredCompanionFiles(uploadedFile.content);
    renderProjectFilesList(projectFiles, mainFilePath, requiredFiles);
  }

  // Handle file upload (supports both .scad and .zip files)
  async function handleFile(
    file,
    content = null,
    extractedFiles = null,
    mainFilePathArg = null,
    source = 'user', // 'user' | 'example' | 'saved' - track upload source
    originalFileNameArg = null // Original file name (e.g., ZIP name) for multi-file projects
  ) {
    if (!file && !content) return;

    const rawFileName =
      typeof file?.name === 'string' && file.name.trim().length > 0
        ? file.name
        : '';
    let fileName = rawFileName || 'example.scad';
    let fileContent = content;
    let projectFiles = extractedFiles; // Map of additional files for multi-file projects
    let mainFilePath = mainFilePathArg; // Path to main file in multi-file project (passed from ZIP extraction)
    // For ZIP files, preserve the original ZIP filename for display/save purposes
    let originalFileName = originalFileNameArg || fileName;

    if (file) {
      const fileNameLower = fileName.toLowerCase();
      // Only validate file metadata for actual File objects (user uploads)
      // Skip validation when content is already provided (example loading path)
      const isActualFileUpload = !content && file instanceof File;

      if (isActualFileUpload) {
        // Validate file metadata with Ajv before processing
        const fileMeta = {
          name: fileNameLower,
          size: file.size,
        };

        const isValid = validateFileUpload(fileMeta);
        if (!isValid) {
          const errorMsg = getValidationErrorMessage(validateFileUpload.errors);
          alert(`Invalid file: ${errorMsg}`);
          console.error(
            '[File Upload] Validation failed:',
            validateFileUpload.errors
          );
          return;
        }
      }

      const isZip = fileNameLower.endsWith('.zip');
      const isScad = fileNameLower.endsWith('.scad');

      if (!isZip && !isScad) {
        alert('Please upload a .scad or .zip file');
        return;
      }

      // Handle ZIP files - but SKIP if content is already provided (e.g., from saved project)
      // When loading a saved ZIP project, content and extractedFiles are already available
      if (isZip && !content && !extractedFiles) {
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
            infoArea.innerHTML = `${escapeHtml(file.name)} → ${escapeHtml(mainFile)}<br>${fileTreeHtml}`;
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

          // Continue with extracted content, passing mainFilePath and original ZIP name
          // The original ZIP filename is used as the default project name when saving
          const zipFileName = file.name;
          handleFile(
            null,
            fileContent,
            projectFiles,
            mainFilePath,
            source,
            zipFileName
          );
          return;
        } catch (error) {
          console.error('[ZIP] Extraction failed:', error);
          updateStatus('Failed to extract ZIP file');
          alert(error.message);
          return;
        }
      }

      // Handle single .scad files (existing logic)
      if (file.size > FILE_SIZE_LIMITS.SCAD_FILE) {
        const limitMB = FILE_SIZE_LIMITS.SCAD_FILE / (1024 * 1024);
        alert(`File size exceeds ${limitMB}MB limit`);
        return;
      }
    }

    if (file && !content) {
      const originalFileName = fileName; // Preserve file name for recursive call
      const reader = new FileReader();
      reader.onload = (e) => {
        // Pass a minimal object with the original file name
        handleFile(
          { name: originalFileName },
          e.target.result,
          extractedFiles,
          mainFilePath,
          source
        );
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
      // For ZIP files: fileName = main .scad file, originalFileName = ZIP name
      // For single files: both are the same
      stateManager.setState({
        uploadedFile: { name: originalFileName, content: fileContent },
        projectFiles: projectFiles || null, // Map of additional files (null for single-file projects)
        mainFilePath: mainFilePath || fileName, // Track main file path (the .scad file inside ZIP)
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
      const fileSizeBytes =
        typeof fileContent === 'string'
          ? new Blob([fileContent]).size
          : typeof file?.size === 'number'
            ? file.size
            : 0;
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
        // Avoid emoji icons so the badge stays in-theme (mono mode) and consistent.
        complexityTierLabel.textContent = tierName;
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

        // Sync auto-bed toggle with saved preference
        if (autoBedToggle) {
          autoBedToggle.checked = previewManager.autoBedEnabled;
        }

        // Initialize overlay settings from localStorage
        const savedOverlayOpacity = localStorage.getItem(
          STORAGE_KEY_OVERLAY_OPACITY
        );
        if (savedOverlayOpacity) {
          const opacity = parseInt(savedOverlayOpacity, 10);
          if (!isNaN(opacity) && opacity >= 0 && opacity <= 100) {
            previewManager.setOverlayOpacity(opacity / 100);
            if (overlayOpacityInput) {
              overlayOpacityInput.value = opacity;
            }
            if (overlayOpacityValue) {
              overlayOpacityValue.textContent = `${opacity}%`;
            }
          }
        }

        // Initialize auto-rotate settings from localStorage
        // Only enable if user doesn't prefer reduced motion
        const savedAutoRotatePref = localStorage.getItem(
          STORAGE_KEY_AUTO_ROTATE
        );
        const savedRotateSpeedPref = localStorage.getItem(
          STORAGE_KEY_ROTATE_SPEED
        );

        // Apply saved rotation speed first
        if (savedRotateSpeedPref) {
          const speed = parseFloat(savedRotateSpeedPref);
          if (!isNaN(speed) && speed >= 0.1 && speed <= 3) {
            previewManager.setAutoRotateSpeed(speed);
          }
        }

        // Apply saved auto-rotate state (respecting reduced motion preference)
        if (savedAutoRotatePref === 'true' && !prefersReducedMotion.matches) {
          previewManager.setAutoRotate(true);
          syncAutoRotateToggles(true);
        }

        // Update camera panel controller with preview manager reference
        if (cameraPanelController) {
          cameraPanelController.setPreviewManager(previewManager);
        }

        // If unlock was triggered before preview was ready, inject toggle now
        if (_hfmUnlocked && !document.getElementById('_hfmToggle')) {
          _injectAltToggle();
        }

        // If user toggled the alt view on from the welcome screen, enable it now.
        if (_hfmPendingEnable && !_hfmEnabled) {
          const toggleBtn = document.getElementById('_hfmToggle');
          if (toggleBtn) {
            await _enableAltViewWithPreview(toggleBtn);
          }
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

          // Update mono variant assets when theme changes (light=amber, dark=green)
          const root = document.documentElement;
          if (root.getAttribute('data-ui-variant') === 'mono') {
            _setAssetsForVariant(true);
          }
        });

        // Add preview state indicator and rendering overlay to container
        previewContainer.style.position = 'relative';
        previewContainer.appendChild(previewStateIndicator);
        previewContainer.appendChild(renderingOverlay);
      }

      // Initialize or update AutoPreviewController
      if (!autoPreviewController) {
        // Pass true to defer init if WASM isn't ready yet - this will trigger WASM init
        await initAutoPreviewController(true);
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
      }

      // Update Project Files Manager UI (for multi-file projects)
      updateProjectFilesUI();

      // Trigger an initial preview immediately on first load (and also for URL-param loads).
      if (autoPreviewController) {
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

      // Show opt-in save prompt for user uploads only (not examples or saved projects)
      if (source === 'user') {
        try {
          const state = stateManager.getState();
          await showSaveProjectPrompt(state);
        } catch (error) {
          console.error('[Saved Projects] Error showing save prompt:', error);
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

  // Companion file input (Project Files Manager)
  const addCompanionFileInput = document.getElementById(
    'addCompanionFileInput'
  );
  if (addCompanionFileInput) {
    addCompanionFileInput.addEventListener('change', async (e) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      for (const file of files) {
        await handleAddCompanionFile(file);
      }

      // Reset input for potential re-selection
      e.target.value = '';
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
    textFileEditorApply.addEventListener('click', applyTextFileEditorChanges);
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
        updateStorageDisplay();

        // Refresh saved projects list when returning to welcome screen
        await renderSavedProjectsList();

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

  // ========== SAVED PROJECTS ==========

  /**
   * Format relative time (e.g., "2 days ago")
   * @param {number} timestamp - Unix timestamp in milliseconds
   * @returns {string}
   */
  function formatRelativeTime(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return 'just now';
    if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
    if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    if (days < 7) return `${days} day${days !== 1 ? 's' : ''} ago`;
    if (days < 30) {
      const weeks = Math.floor(days / 7);
      return `${weeks} week${weeks !== 1 ? 's' : ''} ago`;
    }
    if (days < 365) {
      const months = Math.floor(days / 30);
      return `${months} month${months !== 1 ? 's' : ''} ago`;
    }
    const years = Math.floor(days / 365);
    return `${years} year${years !== 1 ? 's' : ''} ago`;
  }

  /**
   * Linkify URLs in text (convert http/https URLs to clickable links)
   * @param {string} text - Plain text with URLs
   * @returns {string} - HTML string with links
   */
  function linkifyText(text) {
    if (!text) return '';

    const escaped = escapeHtml(text);
    const urlPattern = /(https?:\/\/[^\s]+)/g;

    return escaped.replace(urlPattern, (url) => {
      return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
    });
  }

  // Track current folder for navigation
  let currentFolderId = null;

  /**
   * Render saved projects list on welcome screen (v2 with folder tree)
   */
  async function renderSavedProjectsList() {
    const savedProjectsList = document.getElementById('savedProjectsList');
    const savedProjectsEmpty = document.getElementById('savedProjectsEmpty');
    const folderTree = document.getElementById('folderTree');
    const breadcrumbNav = document.getElementById('folderBreadcrumbs');
    const breadcrumbList = document.getElementById('breadcrumbList');

    if (!savedProjectsList || !savedProjectsEmpty) return;

    // Get folder tree structure
    let folders, rootProjects, allProjects;
    try {
      const treeResult = await getFolderTree();
      folders = treeResult.folders;
      rootProjects = treeResult.rootProjects;
      allProjects = await listSavedProjects();
    } catch (error) {
      console.error('[Saved Projects] Error rendering list:', error);
      return;
    }

    // Determine what to show based on current folder
    let projectsToShow = [];
    let foldersToShow = [];

    if (currentFolderId) {
      // Show contents of current folder
      projectsToShow = allProjects.filter(
        (p) => p.folderId === currentFolderId
      );
      foldersToShow = folders.filter((f) => f.parentId === currentFolderId);

      // Also get nested folders
      const findNestedFolders = (parentId) => {
        const nested = [];
        for (const folder of folders) {
          if (folder.parentId === parentId) {
            nested.push(folder);
          }
        }
        return nested;
      };
      foldersToShow = findNestedFolders(currentFolderId);

      // Update breadcrumbs
      if (breadcrumbNav && breadcrumbList) {
        const breadcrumbs = await getFolderBreadcrumbs(currentFolderId);
        breadcrumbNav.classList.remove('hidden');
        breadcrumbList.innerHTML = `
          <li class="breadcrumb-item">
            <button class="breadcrumb-link" data-folder-id="" aria-label="Go to root">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                <polyline points="9 22 9 12 15 12 15 22"></polyline>
              </svg>
              Root
            </button>
          </li>
          ${breadcrumbs
            .map(
              (folder, index) => `
            <li class="breadcrumb-item">
              <button class="breadcrumb-link ${index === breadcrumbs.length - 1 ? 'current' : ''}" 
                      data-folder-id="${folder.id}"
                      ${index === breadcrumbs.length - 1 ? 'aria-current="page"' : ''}>
                ${escapeHtml(folder.name)}
              </button>
            </li>
          `
            )
            .join('')}
        `;

        // Wire up breadcrumb navigation
        breadcrumbList.querySelectorAll('.breadcrumb-link').forEach((link) => {
          link.addEventListener('click', () => {
            const folderId = link.dataset.folderId || null;
            navigateToFolder(folderId);
          });
        });
      }
    } else {
      // Show root level
      projectsToShow = rootProjects;
      foldersToShow = folders.filter((f) => !f.parentId);
      if (breadcrumbNav) {
        breadcrumbNav.classList.add('hidden');
      }
    }

    // Check if empty
    if (allProjects.length === 0 && folders.length === 0) {
      savedProjectsList.innerHTML = '';
      if (folderTree) folderTree.innerHTML = '';
      savedProjectsEmpty.classList.remove('hidden');
      return;
    }

    savedProjectsEmpty.classList.add('hidden');

    // Render folder tree (if at root level)
    if (folderTree) {
      if (currentFolderId === null) {
        folderTree.innerHTML = renderFolders(
          foldersToShow,
          folders,
          allProjects
        );
        wireUpFolderEvents(folderTree);
      } else {
        // When inside a folder, show subfolders inline
        folderTree.innerHTML = renderFolders(
          foldersToShow,
          folders,
          allProjects
        );
        wireUpFolderEvents(folderTree);
      }
    }

    // Render project cards
    const cardsHtml = projectsToShow
      .map((project) => renderProjectCard(project))
      .join('');

    savedProjectsList.innerHTML = cardsHtml;
    wireUpProjectCardEvents(savedProjectsList);
  }

  /**
   * Render folders recursively
   */
  function renderFolders(foldersToRender, allFolders, allProjects) {
    return foldersToRender
      .map((folder) => {
        const childCount = allProjects.filter(
          (p) => p.folderId === folder.id
        ).length;
        const childFolders = allFolders.filter((f) => f.parentId === folder.id);
        const totalItems = childCount + childFolders.length;
        const colorDot = folder.color
          ? `<span class="folder-color-dot" style="background: ${folder.color}"></span>`
          : '';

        return `
        <div class="folder-item" data-folder-id="${folder.id}">
          <div class="folder-header" 
               role="treeitem" 
               tabindex="0"
               aria-expanded="false"
               aria-label="${escapeHtml(folder.name)} folder, ${totalItems} items">
            <svg class="folder-expand-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
            ${colorDot}
            <svg class="folder-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
            <span class="folder-name">${escapeHtml(folder.name)}</span>
            <span class="folder-count">${totalItems}</span>
            <div class="folder-actions">
              <button class="btn btn-sm btn-icon btn-rename-folder" data-folder-id="${folder.id}" aria-label="Rename folder" title="Rename">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
              </button>
              <button class="btn btn-sm btn-icon btn-delete-folder" data-folder-id="${folder.id}" aria-label="Delete folder" title="Delete">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          </div>
          <div class="folder-contents" id="folder-contents-${folder.id}">
            <!-- Contents loaded on expand -->
          </div>
        </div>
      `;
      })
      .join('');
  }

  /**
   * Render a single project card
   */
  function renderProjectCard(project) {
    const notesPreview = project.notes
      ? `<div class="saved-project-notes-preview">${linkifyText(project.notes)}</div>`
      : '';

    const savedTime = formatRelativeTime(project.savedAt);
    const loadedTime =
      project.lastLoadedAt !== project.savedAt
        ? formatRelativeTime(project.lastLoadedAt)
        : null;

    const isZip = project.kind === 'zip';
    const iconPath = isZip
      ? '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>'
      : '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline>';

    return `
      <div class="saved-project-card" role="listitem" data-project-id="${project.id}" draggable="true">
        <div class="saved-project-header">
          <svg class="saved-project-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            ${iconPath}
          </svg>
          <div class="saved-project-info">
            <h4 class="saved-project-name">${escapeHtml(project.name)}</h4>
            <div class="saved-project-meta">
              <span class="saved-project-date">Saved ${savedTime}</span>
              ${loadedTime ? `<span class="saved-project-date">Opened ${loadedTime}</span>` : ''}
            </div>
          </div>
        </div>
        ${notesPreview}
        <div class="saved-project-actions">
            <button class="btn btn-primary btn-load-project" data-project-id="${project.id}">
              Load
            </button>
            ${
              isZip
                ? `<button class="btn btn-secondary btn-manage-files" data-project-id="${project.id}" title="View and manage project files">
              Files
            </button>`
                : ''
            }
            <button class="btn btn-secondary btn-edit-project" data-project-id="${project.id}">
              Edit
            </button>
            <button class="btn btn-danger btn-delete-project" data-project-id="${project.id}">
              Delete
            </button>
          </div>
        </div>
    `;
  }

  /**
   * Wire up event listeners for folder tree
   */
  function wireUpFolderEvents(container) {
    // Folder expand/collapse
    container.querySelectorAll('.folder-header').forEach((header) => {
      header.addEventListener('click', async (e) => {
        if (e.target.closest('.folder-actions')) return;

        const folderItem = header.closest('.folder-item');
        const folderId = folderItem.dataset.folderId;
        const contents = folderItem.querySelector('.folder-contents');
        const isExpanded = header.getAttribute('aria-expanded') === 'true';

        if (isExpanded) {
          // Collapse
          header.setAttribute('aria-expanded', 'false');
          contents.classList.remove('expanded');
        } else {
          // Expand and load contents
          header.setAttribute('aria-expanded', 'true');
          contents.classList.add('expanded');
          await loadFolderContents(folderId, contents);
        }
      });

      // Double-click to navigate into folder
      header.addEventListener('dblclick', (e) => {
        if (e.target.closest('.folder-actions')) return;
        const folderId = header.closest('.folder-item').dataset.folderId;
        navigateToFolder(folderId);
      });

      // Keyboard navigation
      header.addEventListener('keydown', (e) => {
        const folderId = header.closest('.folder-item').dataset.folderId;
        if (e.key === 'Enter') {
          e.preventDefault();
          navigateToFolder(folderId);
        } else if (e.key === ' ') {
          e.preventDefault();
          header.click(); // Toggle expand
        }
      });
    });

    // Rename folder buttons
    container.querySelectorAll('.btn-rename-folder').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const folderId = btn.dataset.folderId;
        await showRenameFolderDialog(folderId);
      });
    });

    // Delete folder buttons
    container.querySelectorAll('.btn-delete-folder').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const folderId = btn.dataset.folderId;
        await handleDeleteFolder(folderId);
      });
    });
  }

  /**
   * Wire up event listeners for project cards
   */
  function wireUpProjectCardEvents(container) {
    container.querySelectorAll('.btn-load-project').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        loadSavedProject(btn.dataset.projectId);
      });
    });

    container.querySelectorAll('.btn-manage-files').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        showProjectFileManager(btn.dataset.projectId);
      });
    });

    container.querySelectorAll('.btn-edit-project').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        showEditProjectModal(btn.dataset.projectId);
      });
    });

    container.querySelectorAll('.btn-delete-project').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteSavedProject(btn.dataset.projectId);
      });
    });

    // Make cards clickable to load
    container.querySelectorAll('.saved-project-card').forEach((card) => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        loadSavedProject(card.dataset.projectId);
      });

      card.setAttribute('tabindex', '0');
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          loadSavedProject(card.dataset.projectId);
        }
      });

      // Drag and drop support
      card.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', card.dataset.projectId);
        e.dataTransfer.setData(
          'application/x-project-id',
          card.dataset.projectId
        );
        card.classList.add('dragging');
      });

      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
      });
    });
  }

  /**
   * Load folder contents dynamically
   */
  async function loadFolderContents(folderId, container) {
    const allProjects = await listSavedProjects();
    const allFolders = await listFolders();

    const projectsInFolder = allProjects.filter((p) => p.folderId === folderId);
    const subfoldersInFolder = allFolders.filter(
      (f) => f.parentId === folderId
    );

    let html = '';

    // Render subfolders
    if (subfoldersInFolder.length > 0) {
      html += `<div class="folder-tree">${renderFolders(subfoldersInFolder, allFolders, allProjects)}</div>`;
    }

    // Render projects
    if (projectsInFolder.length > 0) {
      html += `<div class="saved-projects-list">${projectsInFolder.map((p) => renderProjectCard(p)).join('')}</div>`;
    }

    if (!html) {
      html = '<p class="folder-empty">This folder is empty</p>';
    }

    container.innerHTML = html;

    // Wire up events for new content
    const subFolderTree = container.querySelector('.folder-tree');
    if (subFolderTree) {
      wireUpFolderEvents(subFolderTree);
    }

    const projectsList = container.querySelector('.saved-projects-list');
    if (projectsList) {
      wireUpProjectCardEvents(projectsList);
    }

    // Setup folder as drop target
    setupFolderDropTarget(container.closest('.folder-item'));
  }

  /**
   * Navigate to a folder
   */
  async function navigateToFolder(folderId) {
    currentFolderId = folderId;
    await renderSavedProjectsList();
  }

  /**
   * Setup folder as drop target for projects
   */
  function setupFolderDropTarget(folderItem) {
    if (!folderItem) return;

    const header = folderItem.querySelector('.folder-header');
    const folderId = folderItem.dataset.folderId;

    header.addEventListener('dragover', (e) => {
      e.preventDefault();
      folderItem.classList.add('drag-over');
    });

    header.addEventListener('dragleave', () => {
      folderItem.classList.remove('drag-over');
    });

    header.addEventListener('drop', async (e) => {
      e.preventDefault();
      folderItem.classList.remove('drag-over');

      const projectId = e.dataTransfer.getData('application/x-project-id');
      if (projectId) {
        const result = await moveProject(projectId, folderId);
        if (result.success) {
          await renderSavedProjectsList();
          stateManager.announceChange('Project moved to folder');
        } else {
          alert(`Failed to move project: ${result.error}`);
        }
      }
    });
  }

  /**
   * Show dialog to rename a folder
   */
  async function showRenameFolderDialog(folderId) {
    const folder = await getFolder(folderId);
    if (!folder) return;

    const newName = prompt('Enter new folder name:', folder.name);
    if (newName && newName.trim() && newName !== folder.name) {
      const result = await renameFolder(folderId, newName.trim());
      if (result.success) {
        await renderSavedProjectsList();
        stateManager.announceChange(`Folder renamed to ${newName.trim()}`);
      } else {
        alert(`Failed to rename folder: ${result.error}`);
      }
    }
  }

  /**
   * Handle folder deletion
   */
  async function handleDeleteFolder(folderId) {
    const folder = await getFolder(folderId);
    if (!folder) return;

    const projectsInFolder = await getProjectsInFolder(folderId);
    const hasContents = projectsInFolder.length > 0;

    let message = `Delete folder "${folder.name}"?`;
    if (hasContents) {
      message = `Delete folder "${folder.name}"?\n\nThis folder contains ${projectsInFolder.length} project(s). They will be moved to the root level.`;
    }

    if (confirm(message)) {
      const result = await deleteFolder(folderId, false); // Don't delete contents, move to root
      if (result.success) {
        if (currentFolderId === folderId) {
          currentFolderId = null; // Navigate back to root if we deleted current folder
        }
        await renderSavedProjectsList();
        stateManager.announceChange(`Folder "${folder.name}" deleted`);
      } else {
        alert(`Failed to delete folder: ${result.error}`);
      }
    }
  }

  /**
   * Show Project File Manager modal for ZIP projects
   * @param {string} projectId - The project ID
   */
  async function showProjectFileManager(projectId) {
    const project = await getProject(projectId);
    if (!project) {
      alert('Project not found');
      return;
    }

    if (project.kind !== 'zip' || !project.projectFiles) {
      alert('This feature is only available for ZIP projects');
      return;
    }

    const projectFiles =
      typeof project.projectFiles === 'string'
        ? JSON.parse(project.projectFiles)
        : project.projectFiles;

    const modal = document.createElement('div');
    modal.className = 'preset-modal file-manager-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-labelledby', 'fileManagerTitle');
    modal.setAttribute('aria-modal', 'true');

    // Build file list
    const fileEntries = Object.entries(projectFiles);
    const filesHtml = fileEntries
      .map(([path, content]) => {
        const isMain = path === project.mainFilePath;
        const size = new Blob([content]).size;
        const iconClass = isMain ? 'main-file' : '';

        return `
        <div class="file-manager-item" data-path="${escapeHtml(path)}">
          <svg class="file-manager-item-icon ${iconClass}" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            ${
              isMain
                ? '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line>'
                : '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline>'
            }
          </svg>
          <span class="file-manager-item-path">${escapeHtml(path)}</span>
          <span class="file-manager-item-size">${formatFileSize(size)}</span>
          <div class="file-manager-item-actions">
            ${
              isMain
                ? '<span class="badge">Main</span>'
                : `
              <button class="btn btn-sm btn-icon btn-set-main-file" data-path="${escapeHtml(path)}" aria-label="Set as main file" title="Set as main">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </button>
            `
            }
            <button class="btn btn-sm btn-icon btn-preview-file" data-path="${escapeHtml(path)}" aria-label="Preview file" title="Preview">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
            </button>
          </div>
        </div>
      `;
      })
      .join('');

    modal.innerHTML = `
      <div class="preset-modal-content" style="max-width: 700px;">
        <div class="preset-modal-header">
          <h3 id="fileManagerTitle" class="preset-modal-title">Project Files: ${escapeHtml(project.name)}</h3>
        </div>

        <div class="preset-modal-body">
          <div class="file-manager-toolbar">
            <button type="button" class="btn btn-sm btn-outline" id="addFileToProjectBtn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              Add File
            </button>
            <span class="file-manager-count">${fileEntries.length} file${fileEntries.length !== 1 ? 's' : ''}</span>
          </div>

          <div class="file-manager-tree">
            ${filesHtml || '<p class="text-muted">No files in project</p>'}
          </div>
        </div>

        <div class="preset-modal-footer">
          <button class="btn btn-secondary" id="fileManagerCloseBtn">Close</button>
          <button class="btn btn-primary" id="fileManagerLoadBtn">Load Project</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Wire up events
    const closeBtn = modal.querySelector('#fileManagerCloseBtn');
    closeBtn.addEventListener('click', () => {
      document.body.removeChild(modal);
    });

    const loadBtn = modal.querySelector('#fileManagerLoadBtn');
    loadBtn.addEventListener('click', () => {
      document.body.removeChild(modal);
      loadSavedProject(projectId);
    });

    // Preview file buttons
    modal.querySelectorAll('.btn-preview-file').forEach((btn) => {
      btn.addEventListener('click', () => {
        const path = btn.dataset.path;
        const content = projectFiles[path];
        showFilePreviewModal(path, content);
      });
    });

    // Set main file buttons
    modal.querySelectorAll('.btn-set-main-file').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const path = btn.dataset.path;
        // Update project main file path
        project.mainFilePath = path;
        project.content = projectFiles[path];

        const projectToSave = { ...project };
        if (typeof projectToSave.projectFiles === 'object') {
          projectToSave.projectFiles = JSON.stringify(
            projectToSave.projectFiles
          );
        }

        const result = await updateProject({
          id: projectId,
          name: project.name,
          notes: project.notes,
        });

        if (result.success) {
          document.body.removeChild(modal);
          showProjectFileManager(projectId); // Refresh
          stateManager.announceChange(`Main file set to ${path}`);
        }
      });
    });

    // Add file button
    const addFileBtn = modal.querySelector('#addFileToProjectBtn');
    if (addFileBtn) {
      addFileBtn.addEventListener('click', () => {
        // Create a temporary file input
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.multiple = true;
        fileInput.accept = '.scad,.json,.svg,.png,.jpg,.jpeg,.stl,.txt';

        fileInput.addEventListener('change', async (e) => {
          const files = Array.from(e.target.files || []);
          if (files.length === 0) return;

          let addedCount = 0;
          const updatedProjectFiles = { ...projectFiles };

          for (const file of files) {
            try {
              // Determine how to read the file
              const ext = file.name.split('.').pop().toLowerCase();
              const isText = ['scad', 'json', 'txt', 'svg'].includes(ext);

              let content;
              if (isText) {
                content = await file.text();
              } else {
                // For binary files, store as base64 data URL
                content = await new Promise((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onload = () => resolve(reader.result);
                  reader.onerror = reject;
                  reader.readAsDataURL(file);
                });
              }

              // Use the filename as the path
              // If file already exists, it will be overwritten
              updatedProjectFiles[file.name] = content;
              addedCount++;
            } catch (err) {
              console.error(
                `[FileManager] Error reading file ${file.name}:`,
                err
              );
            }
          }

          if (addedCount > 0) {
            // Update project with new files
            const result = await updateProject({
              id: projectId,
              projectFiles: JSON.stringify(updatedProjectFiles),
            });

            if (result.success) {
              document.body.removeChild(modal);
              showProjectFileManager(projectId); // Refresh to show new files
              stateManager.announceChange(
                `Added ${addedCount} file${addedCount !== 1 ? 's' : ''} to project`
              );
            } else {
              alert(`Failed to add files: ${result.error}`);
            }
          }
        });

        fileInput.click();
      });
    }

    // Close on escape
    modal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.body.removeChild(modal);
      }
    });

    // Focus close button
    setTimeout(() => closeBtn.focus(), 100);
  }

  /**
   * Show file preview modal
   */
  function showFilePreviewModal(path, content) {
    const modal = document.createElement('div');
    modal.className = 'preset-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-labelledby', 'filePreviewTitle');
    modal.setAttribute('aria-modal', 'true');

    const ext = path.split('.').pop().toLowerCase();
    const isCode = ['scad', 'json', 'txt', 'md'].includes(ext);

    modal.innerHTML = `
      <div class="preset-modal-content">
        <div class="preset-modal-header">
          <h3 id="filePreviewTitle" class="preset-modal-title">${escapeHtml(path)}</h3>
        </div>

        <div class="preset-modal-body">
          ${
            isCode
              ? `<pre style="max-height: 400px; overflow: auto; background: var(--color-bg-secondary); padding: var(--space-md); border-radius: var(--border-radius-sm); font-size: var(--font-size-sm);"><code>${escapeHtml(content)}</code></pre>`
              : `<p class="text-muted">Binary file - preview not available</p>`
          }
        </div>

        <div class="preset-modal-footer">
          <button class="btn btn-secondary" id="filePreviewCloseBtn">Close</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const closeBtn = modal.querySelector('#filePreviewCloseBtn');
    closeBtn.addEventListener('click', () => {
      document.body.removeChild(modal);
    });

    modal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.body.removeChild(modal);
      }
    });

    setTimeout(() => closeBtn.focus(), 100);
  }

  /**
   * Load a saved project
   * @param {string} projectId
   */
  async function loadSavedProject(projectId) {
    try {
      const project = await getProject(projectId);
      if (!project) {
        alert('Project not found');
        return;
      }

      // Check if file is currently loaded
      const currentState = stateManager.getState();
      if (currentState.uploadedFile) {
        const confirmed = await showConfirmDialog(
          'Loading a saved design will replace the current file. Continue?',
          'Load Saved Design',
          'Load',
          'Cancel'
        );
        if (!confirmed) return;
      }

      // Reconstruct file data
      const content = project.content;
      const fileName = project.originalName;
      // getProject() already parses projectFiles from JSON string to object
      const projectFiles = project.projectFiles
        ? new Map(Object.entries(project.projectFiles))
        : null;
      // FIX: For single-file projects, mainFilePath should be null so content gets written to /tmp/input.scad
      // The mainFilePath is only meaningful for multi-file ZIP projects where files are mounted to the FS
      const mainFilePath =
        projectFiles && projectFiles.size > 0 ? project.mainFilePath : null;

      // Update last loaded timestamp
      await touchProject(projectId);

      // Load the file (reuse existing handleFile logic)
      // Pass project.name as the 6th arg so uploadedFile.name shows the saved project name
      await handleFile(
        { name: fileName },
        content,
        projectFiles,
        mainFilePath,
        'saved',
        project.name // Use the saved project name for display
      );

      // Announce success
      stateManager.announceChange(`Loaded saved design: ${project.name}`);
      updateStatus(`Loaded: ${project.name}`);

      // Re-render list to update "last opened" time
      await renderSavedProjectsList();
    } catch (error) {
      console.error('Error loading saved project:', error);
      alert(`Failed to load project: ${error.message}`);
    }
  }

  /**
   * Show opt-in save prompt after file upload
   * @param {Object} fileData - Current file state
   */
  async function showSaveProjectPrompt(fileData) {
    const { uploadedFile, projectFiles, mainFilePath } = fileData;

    if (!uploadedFile) return;

    const kind = projectFiles ? 'zip' : 'scad';
    const fileName = uploadedFile.name || 'untitled.scad';

    // Create modal
    const modal = document.createElement('div');
    modal.className = 'preset-modal save-project-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-labelledby', 'saveProjectTitle');
    modal.setAttribute('aria-modal', 'true');

    modal.innerHTML = `
      <div class="preset-modal-content">
        <div class="preset-modal-header">
          <h3 id="saveProjectTitle" class="preset-modal-title">Save this file for quick access?</h3>
          <button class="preset-modal-close" aria-label="Close dialog">&times;</button>
        </div>
        <div class="modal-body">
          <p style="margin-bottom: var(--space-md); color: var(--color-text-secondary);">
            Saved projects are stored in this browser. Clearing cache/site data will remove them.
          </p>
          <div class="save-project-checkbox-wrapper">
            <input type="checkbox" id="saveProjectCheckbox" />
            <label for="saveProjectCheckbox">Save this file to Saved Projects</label>
          </div>
          <div class="edit-project-field">
            <label for="saveProjectName">Project Name</label>
            <input type="text" id="saveProjectName" value="${escapeHtml(fileName)}" />
          </div>
          <div class="save-project-notes-field">
            <label for="saveProjectNotes">Notes (optional - you can paste links)</label>
            <textarea id="saveProjectNotes" placeholder="Add notes about this project..."></textarea>
            <div class="save-project-notes-counter">
              <span id="saveProjectNotesCount">0</span> / 5000 characters
            </div>
          </div>
        </div>
        <div class="preset-modal-footer">
          <button class="btn btn-secondary" id="saveProjectNotNow">Not now</button>
          <button class="btn btn-primary" id="saveProjectSave" disabled>Save</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Get elements
    const checkbox = modal.querySelector('#saveProjectCheckbox');
    const nameInput = modal.querySelector('#saveProjectName');
    const notesTextarea = modal.querySelector('#saveProjectNotes');
    const notesCount = modal.querySelector('#saveProjectNotesCount');
    const saveBtn = modal.querySelector('#saveProjectSave');
    const notNowBtn = modal.querySelector('#saveProjectNotNow');
    const closeBtn = modal.querySelector('.preset-modal-close');

    // Update save button state based on checkbox
    checkbox.addEventListener('change', () => {
      saveBtn.disabled = !checkbox.checked;
    });

    // Setup character counter for notes with validation
    const counter = modal.querySelector('.save-project-notes-counter');
    setupNotesCounter(notesTextarea, notesCount, counter, {
      maxLength: 5000,
      warningThreshold: 4500,
      onValidChange: (isValid) => {
        if (isValid) {
          saveBtn.disabled = !checkbox.checked;
        } else {
          saveBtn.disabled = true;
        }
      },
    });

    // Handle save
    saveBtn.addEventListener('click', async () => {
      if (!checkbox.checked) return;

      const projectName = nameInput.value.trim() || fileName;
      const notes = notesTextarea.value.trim();

      // Convert projectFiles Map to object for storage
      const projectFilesObj = projectFiles
        ? Object.fromEntries(projectFiles)
        : null;

      const result = await saveProject({
        name: projectName,
        originalName: fileName,
        kind,
        mainFilePath: mainFilePath || fileName,
        content: uploadedFile.content,
        projectFiles: projectFilesObj,
        notes,
      });

      if (result.success) {
        stateManager.announceChange(`Project saved: ${projectName}`);
        updateStatus(`Saved: ${projectName}`);
        await renderSavedProjectsList();
      } else {
        alert(`Failed to save project: ${result.error}`);
      }

      document.body.removeChild(modal);
    });

    // Handle close
    const closeHandler = () => {
      document.body.removeChild(modal);
    };

    notNowBtn.addEventListener('click', closeHandler);
    closeBtn.addEventListener('click', closeHandler);

    // Open modal with focus management
    openModal(modal);

    // Focus the project name input for easy editing
    nameInput.focus();
    nameInput.select();
  }

  /**
   * Show edit project modal
   * @param {string} projectId
   */
  async function showEditProjectModal(projectId) {
    try {
      const project = await getProject(projectId);
      if (!project) {
        alert('Project not found');
        return;
      }

      // Create modal
      const modal = document.createElement('div');
      modal.className = 'preset-modal edit-project-modal';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-labelledby', 'editProjectTitle');
      modal.setAttribute('aria-modal', 'true');

      modal.innerHTML = `
        <div class="preset-modal-content">
          <div class="preset-modal-header">
            <h3 id="editProjectTitle" class="preset-modal-title">Edit Project</h3>
            <button class="preset-modal-close" aria-label="Close dialog">&times;</button>
          </div>
          <div class="modal-body">
            <div class="edit-project-field">
              <label for="editProjectName">Project Name</label>
              <input type="text" id="editProjectName" value="${escapeHtml(project.name)}" />
            </div>
            <div class="edit-project-field">
              <label for="editProjectNotes">Notes</label>
              <textarea id="editProjectNotes">${escapeHtml(project.notes || '')}</textarea>
              <div class="save-project-notes-counter">
                <span id="editProjectNotesCount">${(project.notes || '').length}</span> / 5000 characters
              </div>
            </div>
          </div>
          <div class="preset-modal-footer">
            <button class="btn btn-secondary" id="editProjectCancel">Cancel</button>
            <button class="btn btn-primary" id="editProjectSave">Save Changes</button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      // Get elements
      const nameInput = modal.querySelector('#editProjectName');
      const notesTextarea = modal.querySelector('#editProjectNotes');
      const notesCount = modal.querySelector('#editProjectNotesCount');
      const saveBtn = modal.querySelector('#editProjectSave');
      const cancelBtn = modal.querySelector('#editProjectCancel');
      const closeBtn = modal.querySelector('.preset-modal-close');

      // Setup character counter for notes with validation
      const counter = modal.querySelector('.save-project-notes-counter');
      setupNotesCounter(notesTextarea, notesCount, counter, {
        maxLength: 5000,
        warningThreshold: 4500,
        submitButton: saveBtn, // Disable save button when over limit
      });

      // Handle save
      saveBtn.addEventListener('click', async () => {
        const name = nameInput.value.trim();
        const notes = notesTextarea.value.trim();

        if (!name) {
          alert('Project name cannot be empty');
          return;
        }

        const result = await updateProject({
          id: projectId,
          name,
          notes,
        });

        if (result.success) {
          stateManager.announceChange(`Project updated: ${name}`);
          updateStatus(`Updated: ${name}`);
          await renderSavedProjectsList();
        } else {
          alert(`Failed to update project: ${result.error}`);
        }

        document.body.removeChild(modal);
      });

      // Handle close
      const closeHandler = () => {
        document.body.removeChild(modal);
      };

      cancelBtn.addEventListener('click', closeHandler);
      closeBtn.addEventListener('click', closeHandler);

      // Open modal with focus management
      openModal(modal);
      nameInput.focus();
      nameInput.select();
    } catch (error) {
      console.error('Error showing edit modal:', error);
      alert(`Failed to load project: ${error.message}`);
    }
  }

  /**
   * Delete a saved project (with confirmation)
   * @param {string} projectId
   */
  async function deleteSavedProject(projectId) {
    try {
      const project = await getProject(projectId);
      if (!project) {
        alert('Project not found');
        return;
      }

      const confirmed = await showConfirmDialog(
        `Delete "${project.name}"?\n\nThis cannot be undone.`,
        'Delete Saved Design',
        'Delete',
        'Cancel'
      );

      if (!confirmed) return;

      const result = await deleteProject(projectId);

      if (result.success) {
        stateManager.announceChange(`Deleted project: ${project.name}`);
        updateStatus(`Deleted: ${project.name}`);
        await renderSavedProjectsList();
      } else {
        alert(`Failed to delete project: ${result.error}`);
      }
    } catch (error) {
      console.error('Error deleting project:', error);
      alert(`Failed to delete project: ${error.message}`);
    }
  }

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
      handleFile({ name: example.name }, content, null, null, 'example');
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

  // =========================================
  // Deep-linking: ?example= URL parameter support (Volkswitch website integration)
  // Allows external sites to link directly to Forge with a specific example loaded
  // Usage: ?example=simple-box or ?example=volkswitch-keyguard-v74
  // =========================================
  const initUrlParams = new URLSearchParams(window.location.search);
  const exampleParam = initUrlParams.get('example');

  if (exampleParam) {
    console.log(`[DeepLink] Loading example from URL: ${exampleParam}`);

    // Check if example exists
    if (EXAMPLE_DEFINITIONS[exampleParam]) {
      // Load the example after a short delay to ensure UI is ready
      setTimeout(async () => {
        try {
          await loadExampleByKey(exampleParam);

          // Clean up URL to avoid reloading on refresh
          initUrlParams.delete('example');
          const cleanUrl = initUrlParams.toString()
            ? `${window.location.pathname}?${initUrlParams}`
            : window.location.pathname;
          history.replaceState(null, '', cleanUrl);

          console.log(`[DeepLink] Successfully loaded: ${exampleParam}`);
          srAnnouncer.announce(
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
      onPanControl: ({ direction }) => {
        const root = document.documentElement;
        const isMono = root.getAttribute('data-ui-variant') === 'mono';
        const canAdjust = _hfmEnabled && _hfmAltView && _hfmPanAdjustEnabled;
        if (!isMono) return false;
        if (!canAdjust) return false;

        if (direction === 'up') {
          const next = _applyHfmContrastScale(
            _hfmContrastScale + _HFM_CONTRAST_RANGE.step
          );
          return `Alt view contrast: ${_formatHfmContrastValue(next)}`;
        }
        if (direction === 'down') {
          const next = _applyHfmContrastScale(
            _hfmContrastScale - _HFM_CONTRAST_RANGE.step
          );
          return `Alt view contrast: ${_formatHfmContrastValue(next)}`;
        }
        if (direction === 'left') {
          const next = _applyHfmFontScale(
            _hfmFontScale - _HFM_FONT_SCALE_RANGE.step
          );
          return `Alt view font size: ${_formatHfmFontScaleValue(next)}`;
        }
        if (direction === 'right') {
          const next = _applyHfmFontScale(
            _hfmFontScale + _HFM_FONT_SCALE_RANGE.step
          );
          return `Alt view font size: ${_formatHfmFontScaleValue(next)}`;
        }
        return true;
      },
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
      _handleUnlock();
    }

    // Initialize input sequence detector (still works for non-dev users)
    initSequenceDetector(_handleUnlock);

    // Expose DevTools helper for manual unlock
    window.__unlockAltView = () => {
      localStorage.setItem(HFM_UNLOCK_KEY, 'true');
      _handleUnlock();
      return 'Alt View unlocked. Refresh to persist.';
    };

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
            onProgress: (_percent, _message) => {
              // Simplified status: no confusing percentages
              const formatName =
                OUTPUT_FORMATS[outputFormat]?.name ||
                outputFormat.toUpperCase();
              updateStatus(`Generating ${formatName}...`);
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

      // Store console output for the Console panel (Volkswitch echo() support)
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

      // Update workflow progress to render complete
      completeWorkflowStep('render');
      setWorkflowStep('download');

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

      // Special-case: configuration dependency / empty geometry guidance
      if (handleConfigDependencyError(error)) {
        return;
      }

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

      // Auto-rename duplicates: "test1" → "test1 (1)" → "test1 (2)" etc.
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
        presetManager.savePreset(
          state.uploadedFile.name,
          finalName,
          state.parameters,
          { description }
        );

        updateStatus(`Preset "${finalName}" saved`);
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
            // Get current model name and schema for proper import
            const currentState = stateManager.getState();
            const currentModelName = currentState.uploadedFile?.name || null;
            const paramSchema = currentState.schema?.parameters || {};
            const result = presetManager.importPreset(
              text,
              currentModelName,
              paramSchema
            );

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
  presetSelect.addEventListener('change', async (e) => {
    const presetId = e.target.value;
    if (!presetId) return;

    const state = stateManager.getState();
    const preset = presetManager.loadPreset(state.uploadedFile.name, presetId);

    if (preset) {
      // Check preset compatibility with current schema
      const compatibility = presetManager.analyzePresetCompatibility(
        preset.parameters,
        state.schema || {}
      );

      // If there are compatibility issues, show a warning dialog
      if (!compatibility.isCompatible) {
        const action = await showPresetCompatibilityWarning(
          preset,
          compatibility,
          state
        );

        if (action === 'cancel') {
          // Reset dropdown selection
          const presetSelectEl = document.getElementById('presetSelect');
          if (presetSelectEl) presetSelectEl.value = '';
          return;
        }
        // action === 'apply' - continue with loading
      }

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

      // Update status with compatibility info if there were issues
      if (!compatibility.isCompatible) {
        const issueCount =
          compatibility.extraParams.length + compatibility.missingParams.length;
        updateStatus(
          `Loaded preset: ${preset.name} (${issueCount} parameter differences)`
        );
      } else {
        updateStatus(`Loaded preset: ${preset.name}`);
      }

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
  function showPresetCompatibilityWarning(preset, compatibility, state) {
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
            <h4>⚠️ Obsolete parameters (${compatibility.extraParams.length})</h4>
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
            <h4>ℹ️ New parameters (${compatibility.missingParams.length})</h4>
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

  // =========================================
  // Console Output Modal (Volkswitch echo() support)
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

  /**
   * Update console output display
   * @param {string} output - Console output from OpenSCAD render
   */
  function updateConsoleOutput(output) {
    if (!output || output.trim() === '') return;

    lastConsoleOutput = output;

    // Show badge to indicate new output
    if (consoleBadge) {
      consoleBadge.classList.remove('hidden');
    }

    // If modal is open, update it
    if (consoleOutput && !consoleOutputModal?.classList.contains('hidden')) {
      renderConsoleOutput(output);
    }

    // Extract ECHO messages and display in status bar
    const echoMessages = extractEchoMessages(output);
    updateStatusBarEcho(echoMessages);

    // Log for debugging
    const echoCount = echoMessages.length;
    if (echoCount > 0) {
      console.log(`[Console] ${echoCount} ECHO statement(s) captured`);
    }
  }

  /**
   * Extract ECHO messages from console output
   * @param {string} output - Raw console output
   * @returns {string[]} Array of ECHO message contents
   */
  function extractEchoMessages(output) {
    if (!output) return [];

    const echoLines = output
      .split('\n')
      .filter((line) => line.includes('ECHO:'));
    return echoLines
      .map((line) => {
        // Extract the message content after "ECHO:"
        const match = line.match(/ECHO:\s*"?([^"]*)"?/);
        return match ? match[1].trim() : line.replace(/.*ECHO:\s*/, '').trim();
      })
      .filter((msg) => msg.length > 0);
  }

  /**
   * Update the echo drawer display
   * @param {string[]} echoMessages - Array of ECHO messages
   */
  function updateStatusBarEcho(echoMessages) {
    const echoDrawer = document.getElementById('echoDrawer');
    const echoDrawerLabel = document.getElementById('echoDrawerLabel');
    const echoMessagesEl = document.getElementById('echoMessages');

    if (!echoDrawer || !echoDrawerLabel || !echoMessagesEl) return;

    if (echoMessages.length === 0) {
      echoDrawer.classList.remove('visible');
      echoDrawer.classList.add('collapsed');
      echoDrawerLabel.textContent = 'No echo messages';
      echoMessagesEl.textContent = '';
      return;
    }

    // Update label with count
    echoDrawerLabel.textContent = `ECHO Messages (${echoMessages.length})`;

    // Show all ECHO messages, each on its own line
    const formattedMessages = echoMessages
      .map((msg) => `ECHO: ${msg}`)
      .join('\n');
    echoMessagesEl.textContent = formattedMessages;

    // Show the drawer and EXPAND it by default so user sees the messages
    echoDrawer.classList.add('visible');
    echoDrawer.classList.remove('collapsed');

    // Update aria-expanded on toggle button
    const toggleBtn = document.getElementById('echoDrawerToggle');
    if (toggleBtn) {
      toggleBtn.setAttribute('aria-expanded', 'true');
    }

    // Announce to screen readers
    srAnnouncer.announce(
      `Model has ${echoMessages.length} echo message${echoMessages.length > 1 ? 's' : ''}: ${echoMessages[0]}`
    );
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
    srAnnouncer.announce('Console output panel opened');
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
      consoleCopyBtn.textContent = '✅ Copied!';
      srAnnouncer.announce('Console output copied to clipboard');
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

  // Clear console
  consoleClearBtn?.addEventListener('click', () => {
    lastConsoleOutput = '';
    if (consoleBadge) {
      consoleBadge.classList.add('hidden');
    }
    renderConsoleOutput('');
    srAnnouncer.announce('Console output cleared');
  });

  // Make updateConsoleOutput available globally for the render result handler
  window.updateConsoleOutput = updateConsoleOutput;

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

  // =========================================
  // Export Changed Settings (Volkswitch troubleshooting support)
  // =========================================
  const exportChangedBtn = document.getElementById('exportChangedBtn');

  exportChangedBtn?.addEventListener('click', () => {
    const state = stateManager.getState();
    if (!state.uploadedFile || !state.schema) {
      alert('No file uploaded');
      return;
    }

    // Get default parameters from schema
    const defaultParams = state.schema.parameters || {};

    // Use preset manager to export changed parameters
    const changedJson = presetManager.exportChangedParametersJSON(
      state.parameters,
      defaultParams,
      state.currentModelName || 'Unknown Model'
    );

    // Parse to check change count
    const parsed = JSON.parse(changedJson);

    if (parsed.message && parsed.changeCount === undefined) {
      // No changes made
      updateStatus('All parameters are at default values');
      srAnnouncer.announce(
        'All parameters are at default values. Nothing to export.'
      );
      return;
    }

    // Download as JSON file
    const blob = new Blob([changedJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');

    // Generate filename with model name and date
    const baseName = (state.currentModelName || 'model').replace(
      /\.(scad|zip)$/i,
      ''
    );
    const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
    a.href = url;
    a.download = `${baseName}-changed-params-${date}.json`;
    a.click();
    URL.revokeObjectURL(url);

    // Update status
    const changeCount = parsed.changeCount || 0;
    updateStatus(`Exported ${changeCount} changed parameter(s)`);
    srAnnouncer.announce(
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
      loadExampleByKey(exampleKey, {
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
