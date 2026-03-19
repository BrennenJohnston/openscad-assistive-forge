/**
 * HFM/Alt View Controller
 * Manages the hidden-feature-mode (HFM) alternate ASCII art view, variant
 * theming, zoom compensation, pan-adjust controls, and related toolbar/export
 * utilities. Extracted from main.js for maintainability.
 * @license GPL-3.0-or-later
 */

import { stateManager } from './state.js';
import {
  downloadFile,
  generateFilename,
} from './download.js';
import { getToolbarMenuController } from './toolbar-menu-controller.js';
import { getUIModeController } from './ui-mode-controller.js';
import {
  showWorkflowProgress,
  hideWorkflowProgress,
} from './workflow-progress.js';
import {
  STORAGE_KEY_HFM_CONTRAST_SCALE,
  STORAGE_KEY_HFM_FONT_SCALE,
  STORAGE_KEY_HFM_PERSIST_FADE,
} from './storage-keys.js';

// ---------------------------------------------------------------------------
// Standalone utilities (no HFM state dependency)
// ---------------------------------------------------------------------------

/**
 * Sanitize URL parameters against extracted schema.
 * @param {Object|null} extracted - Parsed schema from extractParameters()
 * @param {Object} urlParams - Raw URL parameter values
 * @returns {{ sanitized: Object, adjustments: Object }}
 */
export function sanitizeUrlParams(extracted, urlParams) {
  const sanitized = {};
  const adjustments = {};

  for (const [key, value] of Object.entries(urlParams || {})) {
    const schema = extracted?.parameters?.[key];
    if (!schema) {
      adjustments[key] = { reason: 'unknown-param', value };
      continue;
    }

    if (Array.isArray(schema.enum)) {
      if (!schema.enum.includes(value)) {
        adjustments[key] = { reason: 'enum', value, allowed: schema.enum };
        continue;
      }
      sanitized[key] = value;
      continue;
    }

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

    sanitized[key] = value;
  }

  return { sanitized, adjustments };
}

/**
 * Export the current render result in the given format from a toolbar menu action.
 * @param {string} format - Format key from OUTPUT_FORMATS (e.g. 'stl', 'obj')
 */
export function exportFormatFromMenu(format) {
  const state = stateManager.getState();
  const outputData = state.generatedOutput?.data || state.stl;
  if (!outputData) {
    alert('No rendered model to export. Run Render first.');
    return;
  }
  const stateFormat = (
    state.generatedOutput?.format ||
    state.outputFormat ||
    'stl'
  ).toLowerCase();
  if (stateFormat !== format) {
    alert(
      `The current render is ${stateFormat.toUpperCase()}. To export as ${format.toUpperCase()}, change the output format and click Generate first.`
    );
    return;
  }
  const filename = generateFilename(
    state.uploadedFile?.name || 'model',
    state.parameters || {},
    format
  );
  downloadFile(outputData, filename, format);
}

/**
 * Apply toolbar bar / workflow progress mutual exclusion based on UI mode.
 * @param {'basic'|'advanced'} mode
 */
export function applyToolbarModeVisibility(mode) {
  const controller = getToolbarMenuController();

  const mainInterfaceEl = document.getElementById('mainInterface');
  const mainInterfaceVisible =
    mainInterfaceEl && !mainInterfaceEl.classList.contains('hidden');

  if (!mainInterfaceVisible) {
    controller.hide();
    hideWorkflowProgress();
    return;
  }

  showWorkflowProgress();

  if (mode === 'advanced') {
    controller.show();
  } else {
    const uiMode = getUIModeController();
    const registry = uiMode.getRegistry();
    const menuIdMap = {
      toolbarMenuFile: 'file',
      toolbarMenuEdit: 'edit',
      toolbarMenuDesign: 'design',
      toolbarMenuView: 'view',
      toolbarMenuWindow: 'window',
      toolbarMenuHelp: 'help',
    };

    const visibleMenuIds = registry
      .filter((p) => p.id in menuIdMap)
      .filter((p) => {
        const el = document.getElementById(`${menuIdMap[p.id]}MenuBtn`);
        return el && !el.classList.contains('ui-mode-hidden');
      })
      .map((p) => menuIdMap[p.id]);

    if (visibleMenuIds.length > 0) {
      controller.setVisibleMenus(visibleMenuIds);
    } else {
      controller.hide();
    }
  }
}

// ---------------------------------------------------------------------------
// HFM / Alt View state (module-level singleton)
// ---------------------------------------------------------------------------

let _hfmUnlocked = false;
let _hfmAltView = null;
let _hfmInitPromise = null;
let _hfmEnabled = false;
let _hfmPendingEnable = false;

const _HFM_CONTRAST_RANGE = { min: 0.5, max: 4.0, step: 0.05, default: 1 };
let _hfmContrastScale = _HFM_CONTRAST_RANGE.default;
let _hfmContrastControls = null;

const _HFM_FONT_SCALE_RANGE = { min: 0.5, max: 2.5, step: 0.05, default: 1 };
let _hfmFontScale = _HFM_FONT_SCALE_RANGE.default;
let _hfmFontScaleControls = null;

const _HFM_PERSIST_FADE_RANGE = { min: 0, max: 1, step: 0.05, default: 0 };
let _hfmPersistFade = _HFM_PERSIST_FADE_RANGE.default;

const _HFM_ZOOM_EPSILON = 0.02;
let _hfmZoomBaseline = null;
let _hfmZoomListening = false;
let _hfmZoomHandling = false;
let _hfmPanAdjustEnabled = false;
let _hfmPanToggleButtons = null;
let _hfmMotionListener = null;

let _hfmCalibrated = false;
let _hfmCalibratedDevice = '';

// Late-bound dependencies set via initHfmController
let _getPreviewManager = () => null;
let _getDisplayOptionsController = () => null;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function _isLightThemeActive() {
  const root = document.documentElement;
  const dataTheme = root.getAttribute('data-theme');
  if (dataTheme === 'light') return true;
  if (dataTheme === 'dark') return false;
  return !window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function _formatHfmContrastValue(scale) {
  return `${Math.round(scale * 100)}%`;
}

function _formatHfmFontScaleValue(scale) {
  return `${Math.round(scale * 100)}%`;
}

function _formatHfmPersistFadeValue(value) {
  return `${Math.round(value * 100)}%`;
}

function _updateHfmStatusBar() {
  const root = document.documentElement;
  const isMono = root.getAttribute('data-ui-variant') === 'mono';
  const statusBar = document.getElementById('previewStatusBar');
  const altAdjustEl = document.getElementById('previewStatusAltAdjust');

  if (!statusBar || !altAdjustEl) return;

  if (!isMono || !_hfmEnabled) {
    statusBar.classList.remove('has-alt-adjust');
    altAdjustEl.textContent = '';
    return;
  }

  const edge = _formatHfmContrastValue(_hfmContrastScale);
  const size = _formatHfmFontScaleValue(_hfmFontScale);
  const glow = _formatHfmPersistFadeValue(_hfmPersistFade);

  let displayText;
  const deviceInfo = _hfmCalibratedDevice ? ` [${_hfmCalibratedDevice}]` : '';

  if (_hfmPanAdjustEnabled) {
    displayText = `[ALT ADJUST]${deviceInfo} Edge: ${edge} (Up/Down) | Size: ${size} (Left/Right) | Glow: ${glow} (Shift+Up/Down)`;
  } else {
    displayText = `[ALT VIEW]${deviceInfo} Edge: ${edge} | Size: ${size} | Glow: ${glow}`;
  }

  altAdjustEl.textContent = displayText;
  statusBar.classList.add('has-alt-adjust');
}

function _syncHfmPanToggleUi() {
  const btns = [
    _hfmPanToggleButtons?.desktop,
    _hfmPanToggleButtons?.mobile,
  ].filter(Boolean);

  const edge = _formatHfmContrastValue(_hfmContrastScale);
  const size = _formatHfmFontScaleValue(_hfmFontScale);
  const glow = _formatHfmPersistFadeValue(_hfmPersistFade);

  btns.forEach((btn) => {
    btn.setAttribute('aria-pressed', _hfmPanAdjustEnabled ? 'true' : 'false');
    btn.classList.toggle('active', _hfmPanAdjustEnabled);
    btn.title = _hfmPanAdjustEnabled
      ? `Alt adjust ON (Pan: Edge ${edge}, Size ${size}, Glow ${glow})`
      : `Alt adjust OFF (Pan controls). Current: Edge ${edge}, Size ${size}, Glow ${glow}`;
    btn.setAttribute(
      'aria-label',
      _hfmPanAdjustEnabled
        ? `Alt adjust on. Pan up/down changes edge sharpness (${edge}). Pan left/right changes character size (${size}). Shift+up/down changes afterglow (${glow}).`
        : `Alt adjust off. Pan controls. Current edge sharpness ${edge}, character size ${size}, afterglow ${glow}.`
    );
  });

  _updateHfmStatusBar();
}

function _setHfmPanAdjustEnabled(enabled) {
  _hfmPanAdjustEnabled = Boolean(enabled);

  if (_hfmEnabled) {
    _initHfmContrastControls().setEnabled(!_hfmPanAdjustEnabled);
    _initHfmFontScaleControls().setEnabled(!_hfmPanAdjustEnabled);
  }

  _syncHfmPanToggleUi();
}

// ---------------------------------------------------------------------------
// Calibration
// ---------------------------------------------------------------------------

function _calibrateHfmSettings() {
  const dpr = window.devicePixelRatio || 1;
  const isTouchDevice =
    'ontouchstart' in window || navigator.maxTouchPoints > 0;

  const previewContainer = document.getElementById('previewContainer');
  const containerWidth = previewContainer?.clientWidth || window.innerWidth;
  const containerHeight = previewContainer?.clientHeight || window.innerHeight;
  const containerArea = containerWidth * containerHeight;

  const isMobile =
    isTouchDevice && Math.min(containerWidth, containerHeight) < 500;
  const isTablet = isTouchDevice && !isMobile;
  const isHighDpi = dpr >= 1.5;
  const isVeryHighDpi = dpr >= 2.5;

  const isSmallViewport = containerArea < 200000;
  const isMediumViewport = containerArea >= 200000 && containerArea < 500000;
  const isLargeViewport = containerArea >= 500000;

  let sizeScale = 1.0;
  if (isMobile) {
    sizeScale = 1.4;
    if (isVeryHighDpi) sizeScale = 1.2;
  } else if (isTablet) {
    sizeScale = 1.15;
    if (isHighDpi) sizeScale = 1.0;
  } else if (isSmallViewport) {
    sizeScale = 1.1;
  } else if (isMediumViewport) {
    sizeScale = 1.0;
    if (isHighDpi) sizeScale = 0.9;
  } else if (isLargeViewport) {
    sizeScale = 0.9;
    if (isHighDpi) sizeScale = 0.8;
    if (isVeryHighDpi) sizeScale = 0.75;
  }

  let edgeScale = 1.0;
  if (isMobile) {
    edgeScale = 0.85;
  } else if (isTablet) {
    edgeScale = 0.95;
  } else if (isSmallViewport) {
    edgeScale = 0.9;
  } else if (isMediumViewport) {
    edgeScale = 1.0;
    if (isHighDpi) edgeScale = 1.1;
  } else if (isLargeViewport) {
    edgeScale = 1.15;
    if (isHighDpi) edgeScale = 1.25;
    if (isVeryHighDpi) edgeScale = 1.35;
  }

  edgeScale = Math.max(
    _HFM_CONTRAST_RANGE.min,
    Math.min(_HFM_CONTRAST_RANGE.max, edgeScale)
  );
  sizeScale = Math.max(
    _HFM_FONT_SCALE_RANGE.min,
    Math.min(_HFM_FONT_SCALE_RANGE.max, sizeScale)
  );

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

function _resetHfmSettings() {
  try {
    localStorage.removeItem(STORAGE_KEY_HFM_CONTRAST_SCALE);
    localStorage.removeItem(STORAGE_KEY_HFM_FONT_SCALE);
    localStorage.removeItem(STORAGE_KEY_HFM_PERSIST_FADE);
  } catch (_) {
    // Storage unavailable
  }
  _hfmCalibrated = false;
  const calibrated = _calibrateHfmSettings();
  _applyHfmContrastScale(calibrated.edgeScale);
  _applyHfmFontScale(calibrated.sizeScale);
  _hfmPersistFade = _HFM_PERSIST_FADE_RANGE.default;
  _applyHfmPersistFade(_hfmPersistFade);
  _hfmCalibratedDevice = calibrated.deviceCategory;
  _hfmCalibrated = true;
  console.log(
    '[Alt View] Settings reset to auto-calibrated defaults:',
    calibrated
  );
}

// ---------------------------------------------------------------------------
// Zoom tracking
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Contrast / font / persist-fade apply helpers
// ---------------------------------------------------------------------------

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

  try {
    localStorage.setItem(STORAGE_KEY_HFM_CONTRAST_SCALE, String(clamped));
  } catch (error) {
    if (error.name === 'QuotaExceededError') {
      console.warn(
        '[Alt View] localStorage quota exceeded \u2014 contrast scale not saved'
      );
    } else {
      console.warn('[Alt View] Could not save contrast scale:', error);
    }
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

  try {
    localStorage.setItem(STORAGE_KEY_HFM_FONT_SCALE, String(clamped));
  } catch (error) {
    if (error.name === 'QuotaExceededError') {
      console.warn(
        '[Alt View] localStorage quota exceeded \u2014 font scale not saved'
      );
    } else {
      console.warn('[Alt View] Could not save font scale:', error);
    }
  }

  return clamped;
}

function _applyHfmPersistFade(value) {
  const raw = Number(value);
  const next = Number.isFinite(raw) ? raw : _HFM_PERSIST_FADE_RANGE.default;
  const clamped = Math.max(
    _HFM_PERSIST_FADE_RANGE.min,
    Math.min(_HFM_PERSIST_FADE_RANGE.max, next)
  );
  _hfmPersistFade = clamped;

  if (_hfmAltView?.setPersistFade) {
    _hfmAltView.setPersistFade(clamped);
  }

  _syncHfmPanToggleUi();

  try {
    localStorage.setItem(STORAGE_KEY_HFM_PERSIST_FADE, String(clamped));
  } catch (error) {
    if (error.name === 'QuotaExceededError') {
      console.warn(
        '[Alt View] localStorage quota exceeded \u2014 persist fade not saved'
      );
    } else {
      console.warn('[Alt View] Could not save persist fade:', error);
    }
  }

  return clamped;
}

// ---------------------------------------------------------------------------
// Slider controls (contrast / font scale)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Variant asset switching (logo, favicon)
// ---------------------------------------------------------------------------

function _setHeaderLogoForVariant(enabled) {
  const img = document.querySelector('.header-logo');
  if (!img) return;

  if (!img.dataset.defaultSrc) {
    img.dataset.defaultSrc = img.getAttribute('src') || '';
  }

  if (enabled) {
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

// ---------------------------------------------------------------------------
// Alt view enable / disable (requires previewManager)
// ---------------------------------------------------------------------------

async function _enableAltViewWithPreview(toggleBtn) {
  const previewManager = _getPreviewManager();
  if (!previewManager) return;

  const root = document.documentElement;
  _setAssetsForVariant(true);

  if (!_hfmInitPromise) {
    _hfmInitPromise = import('./_hfm.js').then((mod) =>
      mod.initAltView(previewManager)
    );
  }
  _hfmAltView = await _hfmInitPromise;
  _hfmAltView.enable();

  const motionMql = window.matchMedia('(prefers-reduced-motion: reduce)');
  _hfmMotionListener = (event) => {
    _hfmAltView?.setReducedMotion(event.matches);
    if (event.matches) {
      _hfmPersistFade = 0;
      _updateHfmStatusBar();
    } else {
      let savedFade = null;
      try {
        savedFade = localStorage.getItem(STORAGE_KEY_HFM_PERSIST_FADE);
      } catch (_) {
        /* storage unavailable */
      }
      const parsed = savedFade !== null ? parseFloat(savedFade) : NaN;
      const valid =
        Number.isFinite(parsed) &&
        parsed >= _HFM_PERSIST_FADE_RANGE.min &&
        parsed <= _HFM_PERSIST_FADE_RANGE.max;
      _applyHfmPersistFade(valid ? parsed : _HFM_PERSIST_FADE_RANGE.default);
    }
  };
  motionMql.addEventListener('change', _hfmMotionListener);

  if (!_hfmCalibrated) {
    let savedContrast = null;
    let savedFont = null;
    let savedPersistFade = null;
    try {
      savedContrast = localStorage.getItem(STORAGE_KEY_HFM_CONTRAST_SCALE);
      savedFont = localStorage.getItem(STORAGE_KEY_HFM_FONT_SCALE);
      savedPersistFade = localStorage.getItem(STORAGE_KEY_HFM_PERSIST_FADE);
    } catch (_) {
      // Private browsing or storage unavailable
    }

    const parsedContrast =
      savedContrast !== null ? parseFloat(savedContrast) : NaN;
    const parsedFont = savedFont !== null ? parseFloat(savedFont) : NaN;
    const parsedPersistFade =
      savedPersistFade !== null ? parseFloat(savedPersistFade) : NaN;

    const contrastValid =
      Number.isFinite(parsedContrast) &&
      parsedContrast >= _HFM_CONTRAST_RANGE.min &&
      parsedContrast <= _HFM_CONTRAST_RANGE.max;
    const fontValid =
      Number.isFinite(parsedFont) &&
      parsedFont >= _HFM_FONT_SCALE_RANGE.min &&
      parsedFont <= _HFM_FONT_SCALE_RANGE.max;
    const persistFadeValid =
      Number.isFinite(parsedPersistFade) &&
      parsedPersistFade >= _HFM_PERSIST_FADE_RANGE.min &&
      parsedPersistFade <= _HFM_PERSIST_FADE_RANGE.max;

    if (contrastValid && fontValid) {
      _hfmContrastScale = parsedContrast;
      _hfmFontScale = parsedFont;
      _hfmCalibratedDevice = '';
      _hfmCalibrated = true;
    } else {
      const calibrated = _calibrateHfmSettings();
      _hfmContrastScale = contrastValid ? parsedContrast : calibrated.edgeScale;
      _hfmFontScale = fontValid ? parsedFont : calibrated.sizeScale;
      _hfmCalibratedDevice = calibrated.deviceCategory;
      _hfmCalibrated = true;
    }

    _hfmPersistFade = persistFadeValid
      ? parsedPersistFade
      : _HFM_PERSIST_FADE_RANGE.default;
  }

  _applyHfmContrastScale(_hfmContrastScale);
  _applyHfmFontScale(_hfmFontScale);
  _applyHfmPersistFade(_hfmPersistFade);
  _setHfmZoomBaseline();
  _enableHfmZoomTracking();
  _initHfmContrastControls().setEnabled(true);
  _initHfmFontScaleControls().setEnabled(true);

  if (previewManager?.mesh && previewManager.enableRotationCentering) {
    previewManager.enableRotationCentering();
  }

  previewManager?.setPostLoadHook?.(() => {
    if (previewManager?.mesh && previewManager.enableRotationCentering) {
      previewManager.enableRotationCentering();
    }
    _getDisplayOptionsController().refreshOverlays();
  });

  previewManager.setRenderOverride(() => _hfmAltView.render());
  previewManager.setResizeHook(({ width, height }) =>
    _hfmAltView.resize(width, height)
  );

  root.setAttribute('data-ui-variant', 'mono');

  const newTheme = previewManager.detectTheme();
  previewManager.updateTheme(
    newTheme,
    root.getAttribute('data-high-contrast') === 'true'
  );

  previewManager.handleResize?.();
  toggleBtn?.setAttribute('aria-pressed', 'true');
  _hfmEnabled = true;
  _hfmPendingEnable = false;

  if (_hfmPanToggleButtons?.desktop)
    _hfmPanToggleButtons.desktop.style.display = 'flex';
  if (_hfmPanToggleButtons?.mobile)
    _hfmPanToggleButtons.mobile.style.display = 'flex';
  _setHfmPanAdjustEnabled(false);
}

function _disableAltViewWithPreview(toggleBtn) {
  const previewManager = _getPreviewManager();
  const root = document.documentElement;

  if (_hfmMotionListener) {
    const motionMql = window.matchMedia('(prefers-reduced-motion: reduce)');
    motionMql.removeEventListener('change', _hfmMotionListener);
    _hfmMotionListener = null;
  }

  if (_hfmAltView) {
    _hfmAltView.disable();
  }
  previewManager?.clearRenderOverride();
  previewManager?.clearResizeHook();
  previewManager?.clearPostLoadHook?.();

  if (previewManager?.disableRotationCentering) {
    previewManager.disableRotationCentering();
  }

  root.removeAttribute('data-ui-variant');
  _setAssetsForVariant(false);

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

  _hfmPanAdjustEnabled = false;
  if (_hfmPanToggleButtons?.desktop)
    _hfmPanToggleButtons.desktop.style.display = 'none';
  if (_hfmPanToggleButtons?.mobile)
    _hfmPanToggleButtons.mobile.style.display = 'none';
  _initHfmContrastControls().setEnabled(false);
  _initHfmFontScaleControls().setEnabled(false);
  _disableHfmZoomTracking();
  _hfmZoomBaseline = null;

  _updateHfmStatusBar();
}

// ---------------------------------------------------------------------------
// Toggle injection & unlock
// ---------------------------------------------------------------------------

function _injectAltToggle() {
  const previewManager = _getPreviewManager();
  const themeToggle = document.getElementById('themeToggle');
  if (!themeToggle) return;
  if (document.getElementById('_hfmToggle')) return;

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

  themeToggle.parentElement.insertBefore(toggleBtn, themeToggle.nextSibling);

  const panToggleBtn = document.createElement('button');
  panToggleBtn.id = '_hfmPanAdjust';
  panToggleBtn.className =
    'btn btn-sm btn-icon camera-btn alt-pan-toggle dpad-center';
  panToggleBtn.setAttribute('aria-pressed', 'false');
  panToggleBtn.setAttribute(
    'aria-label',
    'Toggle alternate pan adjustment mode'
  );
  panToggleBtn.setAttribute('title', 'Toggle alternate pan adjustment');
  panToggleBtn.style.display = 'none';
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
    if (!_hfmAltView || !_hfmEnabled) return;
    _setHfmPanAdjustEnabled(!_hfmPanAdjustEnabled);
  };
  const handlePanToggleDblClick = (e) => {
    if (!_hfmAltView || !_hfmEnabled) return;
    e.preventDefault();
    _resetHfmSettings();
  };
  panToggleBtn.addEventListener('click', handlePanToggleClick);
  panToggleBtn.addEventListener('dblclick', handlePanToggleDblClick);
  mobilePanToggleBtn.addEventListener('click', handlePanToggleClick);
  mobilePanToggleBtn.addEventListener('dblclick', handlePanToggleDblClick);

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

function _handleUnlock() {
  if (_hfmUnlocked) return;
  _hfmUnlocked = true;

  _injectAltToggle();

  document.querySelectorAll('[data-hfm-gated]').forEach((el) => {
    el.hidden = false;
  });

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

// ---------------------------------------------------------------------------
// Public initializer
// ---------------------------------------------------------------------------

/**
 * Initialize the HFM/Alt View controller.
 * @param {Object} deps
 * @param {Function} deps.getPreviewManager - Returns current PreviewManager (may be null)
 * @param {Function} deps.getDisplayOptionsController - Returns DisplayOptionsController
 * @returns {Object} Controller API
 */
export function initHfmController({ getPreviewManager, getDisplayOptionsController }) {
  _getPreviewManager = getPreviewManager;
  _getDisplayOptionsController = getDisplayOptionsController;

  return {
    handleUnlock: _handleUnlock,

    isLightThemeActive: _isLightThemeActive,

    refreshVariantAssets() {
      _setAssetsForVariant(true);
    },

    injectAltToggle: _injectAltToggle,

    async enableAltViewWithPreview(toggleBtn) {
      await _enableAltViewWithPreview(toggleBtn);
    },

    disableAltViewWithPreview(toggleBtn) {
      _disableAltViewWithPreview(toggleBtn);
    },

    clearPersistence() {
      if (_hfmEnabled && _hfmAltView?.clearPersistence) {
        _hfmAltView.clearPersistence();
      }
    },

    isEnabled() {
      return _hfmEnabled;
    },

    isUnlocked() {
      return _hfmUnlocked;
    },

    isPendingEnable() {
      return _hfmPendingEnable && !_hfmEnabled;
    },

    /**
     * Camera pan control callback for HFM adjust mode.
     * @param {{ direction: string, shiftKey: boolean }} params
     * @returns {false|string|true} false if not handled, announcement string or true if handled
     */
    onPanControl({ direction, shiftKey }) {
      const root = document.documentElement;
      const isMono = root.getAttribute('data-ui-variant') === 'mono';
      const canAdjust = _hfmEnabled && _hfmAltView && _hfmPanAdjustEnabled;
      if (!isMono) return false;
      if (!canAdjust) return false;

      if (shiftKey && direction === 'up') {
        const next = _applyHfmPersistFade(
          _hfmPersistFade + _HFM_PERSIST_FADE_RANGE.step
        );
        return `Alt view afterglow: ${_formatHfmPersistFadeValue(next)}`;
      }
      if (shiftKey && direction === 'down') {
        const next = _applyHfmPersistFade(
          _hfmPersistFade - _HFM_PERSIST_FADE_RANGE.step
        );
        return `Alt view afterglow: ${_formatHfmPersistFadeValue(next)}`;
      }
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
  };
}
