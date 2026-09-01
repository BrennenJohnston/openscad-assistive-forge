/**
 * HFM/Alt View Controller
 * Manages the hidden-feature-mode (HFM) alternate ASCII art view, variant
 * theming, and pan-adjust controls. Extracted from main.js for
 * maintainability.
 * @license GPL-3.0-or-later
 */

import {
  STORAGE_KEY_HFM_CONTRAST_SCALE,
  STORAGE_KEY_HFM_FONT_SCALE,
  STORAGE_KEY_HFM_PERSIST_FADE,
} from './storage-keys.js';
import { announce } from './announcer.js';

// ---------------------------------------------------------------------------
// HFM / Alt View state (module-level singleton)
// ---------------------------------------------------------------------------

let _hfmUnlocked = false;
let _hfmAltView = null;
let _hfmInitPromise = null;
let _hfmEnabled = false;
let _hfmPendingEnable = false;
let _hfmSettingsLoaded = false;

const _HFM_CONTRAST_RANGE = { min: 0.5, max: 4.0, step: 0.05, default: 1 };
let _hfmContrastScale = _HFM_CONTRAST_RANGE.default;
let _hfmContrastControls = null;

const _HFM_FONT_SCALE_RANGE = { min: 0.5, max: 2.5, step: 0.05, default: 1 };
let _hfmFontScale = _HFM_FONT_SCALE_RANGE.default;
let _hfmFontScaleControls = null;

const _HFM_PERSIST_FADE_RANGE = { min: 0, max: 1, step: 0.05, default: 0 };
let _hfmPersistFade = _HFM_PERSIST_FADE_RANGE.default;
let _hfmPersistFadeControls = null;

let _hfmPanAdjustEnabled = false;
let _hfmPanToggleButtons = null;
let _hfmMotionListener = null;

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

function _prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );
}

function _formatPercent(value) {
  return `${Math.round(value * 100)}%`;
}

// Debounced localStorage writes so pan-adjust taps don't write per press.
const _SAVE_DEBOUNCE_MS = 200;
const _saveTimers = new Map();

function _debouncedSave(key, value) {
  const existing = _saveTimers.get(key);
  if (existing) clearTimeout(existing);
  _saveTimers.set(
    key,
    setTimeout(() => {
      _saveTimers.delete(key);
      try {
        localStorage.setItem(key, String(value));
      } catch (error) {
        console.warn(`[Alt View] Could not save setting (${key}):`, error);
      }
    }, _SAVE_DEBOUNCE_MS)
  );
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

  let displayText;
  if (_hfmPanAdjustEnabled) {
    displayText =
      '[ALT ADJUST] \u25B2\u25BC edge \u00B7 \u25C4\u25BA size \u00B7 Shift+\u25B2\u25BC glow';
  } else {
    const edge = _formatPercent(_hfmContrastScale);
    const size = _formatPercent(_hfmFontScale);
    const glow = _formatPercent(_hfmPersistFade);
    displayText = `[ALT VIEW] EDGE ${edge} \u00B7 SIZE ${size} \u00B7 GLOW ${glow}`;
  }

  altAdjustEl.textContent = displayText;
  statusBar.classList.add('has-alt-adjust');
}

function _syncHfmPanToggleUi() {
  const btns = [
    _hfmPanToggleButtons?.desktop,
    _hfmPanToggleButtons?.mobile,
  ].filter(Boolean);

  const edge = _formatPercent(_hfmContrastScale);
  const size = _formatPercent(_hfmFontScale);
  const glow = _formatPercent(_hfmPersistFade);

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
    _initHfmPersistFadeControls().setEnabled(!_hfmPanAdjustEnabled);
  }

  _syncHfmPanToggleUi();
}

function _resetHfmSettings() {
  try {
    localStorage.removeItem(STORAGE_KEY_HFM_CONTRAST_SCALE);
    localStorage.removeItem(STORAGE_KEY_HFM_FONT_SCALE);
    localStorage.removeItem(STORAGE_KEY_HFM_PERSIST_FADE);
  } catch (_) {
    // Storage unavailable
  }
  _applyHfmContrastScale(_HFM_CONTRAST_RANGE.default);
  _applyHfmFontScale(_HFM_FONT_SCALE_RANGE.default);
  _applyHfmPersistFade(_HFM_PERSIST_FADE_RANGE.default);
  if (import.meta.env.DEV) {
    console.log('[Alt View] Settings reset to defaults');
  }
}

// ---------------------------------------------------------------------------
// Contrast / font / persist-fade apply helpers
// ---------------------------------------------------------------------------

function _applyHfmContrastScale(scale) {
  const raw = Number(scale);
  const next = Number.isFinite(raw) ? raw : _HFM_CONTRAST_RANGE.default;
  const clamped = Math.max(
    _HFM_CONTRAST_RANGE.min,
    Math.min(_HFM_CONTRAST_RANGE.max, next)
  );
  _hfmContrastScale = clamped;

  if (_hfmAltView?.setContrastScale) {
    _hfmAltView.setContrastScale(clamped);
    _hfmAltView.invalidate?.();
  }

  _hfmContrastControls?.sync?.(clamped);
  _syncHfmPanToggleUi();
  _debouncedSave(STORAGE_KEY_HFM_CONTRAST_SCALE, clamped);

  return clamped;
}

function _applyHfmFontScale(scale) {
  const raw = Number(scale);
  const next = Number.isFinite(raw) ? raw : _HFM_FONT_SCALE_RANGE.default;
  const clamped = Math.max(
    _HFM_FONT_SCALE_RANGE.min,
    Math.min(_HFM_FONT_SCALE_RANGE.max, next)
  );
  _hfmFontScale = clamped;

  if (_hfmAltView?.setFontScale) {
    _hfmAltView.setFontScale(clamped);
    _hfmAltView.invalidate?.();
  }

  _hfmFontScaleControls?.sync?.(clamped);
  _syncHfmPanToggleUi();
  _debouncedSave(STORAGE_KEY_HFM_FONT_SCALE, clamped);

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
    _hfmAltView.invalidate?.();
  }

  _hfmPersistFadeControls?.sync?.(clamped);
  _syncHfmPanToggleUi();
  _debouncedSave(STORAGE_KEY_HFM_PERSIST_FADE, clamped);

  return clamped;
}

// ---------------------------------------------------------------------------
// Slider controls (contrast / font scale / afterglow)
// ---------------------------------------------------------------------------

/**
 * Build a pair of Alt View slider sections (desktop camera panel + mobile
 * drawer) and return a { setEnabled, sync } controls object.
 *
 * setEnabled(true) shows the sections while Alt View is on; setEnabled(false)
 * hides them entirely so they never appear in the standard UI.
 *
 * @param {Object} cfg
 * @param {string} cfg.idBase - DOM id base, e.g. '_hfmContrast'
 * @param {string} cfg.titleText - section heading
 * @param {{min:number,max:number,step:number}} cfg.range
 * @param {() => number} cfg.getValue
 * @param {(value:number) => void} cfg.onInput
 * @returns {{ setEnabled: Function, sync: Function }}
 */
function _buildHfmSliderControls({
  idBase,
  titleText,
  range,
  getValue,
  onInput,
}) {
  const inputs = [];
  const valueEls = [];
  const sections = [];
  const formatValue = _formatPercent;

  const buildSection = ({
    container,
    insertBefore,
    sectionClass,
    titleClass,
    inputId,
  }) => {
    if (!container || document.getElementById(inputId)) return;

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
    input.min = String(range.min);
    input.max = String(range.max);
    input.step = String(range.step);
    input.value = String(getValue());
    input.setAttribute('aria-labelledby', title.id);

    const valueEl = document.createElement('span');
    valueEl.className = 'slider-value';
    valueEl.id = `${inputId}-value`;
    valueEl.textContent = formatValue(getValue());

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
      onInput(parseFloat(input.value));
    });
  };

  const panelBody = document.getElementById('cameraPanelBody');
  const panelInsertBefore =
    panelBody?.querySelector('.camera-shortcuts-help') ?? null;
  buildSection({
    container: panelBody,
    insertBefore: panelInsertBefore,
    sectionClass: `camera-control-section hfm-slider-section ${idBase}-section`,
    titleClass: 'camera-control-section-title',
    inputId: idBase,
  });

  const drawerBody = document.getElementById('cameraDrawerBody');
  buildSection({
    container: drawerBody,
    insertBefore: null,
    sectionClass: `camera-drawer-section hfm-slider-section ${idBase}-drawer-section`,
    titleClass: 'camera-drawer-section-title',
    inputId: `${idBase}Mobile`,
  });

  const controls = {
    setEnabled(isEnabled) {
      const show = Boolean(isEnabled);
      sections.forEach((section) => {
        section.style.display = show ? '' : 'none';
      });
      inputs.forEach((input) => {
        input.disabled = !show;
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

  controls.setEnabled(false);
  controls.sync(getValue());

  return controls;
}

function _initHfmContrastControls() {
  if (_hfmContrastControls) return _hfmContrastControls;
  _hfmContrastControls = _buildHfmSliderControls({
    idBase: '_hfmContrast',
    titleText: 'Alt View Contrast',
    range: _HFM_CONTRAST_RANGE,
    getValue: () => _hfmContrastScale,
    onInput: (value) => _applyHfmContrastScale(value),
  });
  return _hfmContrastControls;
}

function _initHfmFontScaleControls() {
  if (_hfmFontScaleControls) return _hfmFontScaleControls;
  _hfmFontScaleControls = _buildHfmSliderControls({
    idBase: '_hfmFontScale',
    titleText: 'Alt View Font Size',
    range: _HFM_FONT_SCALE_RANGE,
    getValue: () => _hfmFontScale,
    onInput: (value) => _applyHfmFontScale(value),
  });
  return _hfmFontScaleControls;
}

function _initHfmPersistFadeControls() {
  if (_hfmPersistFadeControls) return _hfmPersistFadeControls;
  const base = _buildHfmSliderControls({
    idBase: '_hfmPersistFade',
    titleText: 'Alt View Afterglow',
    range: _HFM_PERSIST_FADE_RANGE,
    getValue: () => _hfmPersistFade,
    onInput: (value) => _applyHfmPersistFade(value),
  });
  // Afterglow is motion; hide the slider entirely under reduced-motion.
  _hfmPersistFadeControls = {
    setEnabled(isEnabled) {
      base.setEnabled(isEnabled && !_prefersReducedMotion());
    },
    sync(value) {
      base.sync(value);
    },
  };
  return _hfmPersistFadeControls;
}

function _setHfmSlidersEnabled(enabled) {
  _initHfmContrastControls().setEnabled(enabled);
  _initHfmFontScaleControls().setEnabled(enabled);
  _initHfmPersistFadeControls().setEnabled(enabled);
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

function _loadSavedHfmSettings() {
  if (_hfmSettingsLoaded) return;
  _hfmSettingsLoaded = true;

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

  if (
    Number.isFinite(parsedContrast) &&
    parsedContrast >= _HFM_CONTRAST_RANGE.min &&
    parsedContrast <= _HFM_CONTRAST_RANGE.max
  ) {
    _hfmContrastScale = parsedContrast;
  }
  if (
    Number.isFinite(parsedFont) &&
    parsedFont >= _HFM_FONT_SCALE_RANGE.min &&
    parsedFont <= _HFM_FONT_SCALE_RANGE.max
  ) {
    _hfmFontScale = parsedFont;
  }
  if (
    Number.isFinite(parsedPersistFade) &&
    parsedPersistFade >= _HFM_PERSIST_FADE_RANGE.min &&
    parsedPersistFade <= _HFM_PERSIST_FADE_RANGE.max
  ) {
    _hfmPersistFade = parsedPersistFade;
  }
}

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
    _initHfmPersistFadeControls().setEnabled(
      _hfmEnabled && !_hfmPanAdjustEnabled
    );
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

  _loadSavedHfmSettings();

  _applyHfmContrastScale(_hfmContrastScale);
  _applyHfmFontScale(_hfmFontScale);
  _applyHfmPersistFade(_hfmPersistFade);
  _setHfmSlidersEnabled(true);

  if (previewManager?.mesh && previewManager.enableRotationCentering) {
    previewManager.enableRotationCentering();
  }

  previewManager?.setPostLoadHook?.(() => {
    if (previewManager?.mesh && previewManager.enableRotationCentering) {
      previewManager.enableRotationCentering();
    }
    _getDisplayOptionsController().refreshOverlays();
    _hfmAltView?.invalidate?.();
  });

  previewManager.setRenderOverride(() => _hfmAltView.render());
  previewManager.setResizeHook(({ width, height }) => {
    _hfmAltView.resize(width, height);
    _hfmAltView.invalidate?.();
  });

  root.setAttribute('data-ui-variant', 'mono');

  const newTheme = previewManager.detectTheme();
  previewManager.updateTheme(
    newTheme,
    root.getAttribute('data-high-contrast') === 'true'
  );
  // The mono palette is applied above after the variant attribute flips, so
  // rebuild the glyph atlas against the final --color-accent value.
  _hfmAltView.rebuildGlyphs?.();

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
  _setHfmSlidersEnabled(false);

  _updateHfmStatusBar();
}

// ---------------------------------------------------------------------------
// Toggle injection & unlock
// ---------------------------------------------------------------------------

function _injectAltToggle() {
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

    // Resolve fresh on every click: the toggle can be injected on the welcome
    // screen (before any preview exists) and must pick up the preview manager
    // created later when a model loads.
    const previewManager = _getPreviewManager();

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
    _setHfmSlidersEnabled(true);
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

  announce(
    'Alt View unlocked. A new toggle appeared next to the theme button.'
  );

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
export function initHfmController({
  getPreviewManager,
  getDisplayOptionsController,
}) {
  _getPreviewManager = getPreviewManager;
  _getDisplayOptionsController = getDisplayOptionsController;

  return {
    handleUnlock: _handleUnlock,

    isLightThemeActive: _isLightThemeActive,

    refreshVariantAssets() {
      _setAssetsForVariant(true);
    },

    /**
     * Switch the variant-specific assets (logo, favicon) on or off without
     * touching the alt-view render state. Used by the City Walk game, which
     * forces the mono variant for its own lifetime and must restore the
     * standard assets on exit.
     * @param {boolean} enabled
     */
    setVariantAssets(enabled) {
      _setAssetsForVariant(Boolean(enabled));
    },

    /**
     * Notify the controller that the app theme changed while Alt View may be
     * active. Rebuilds the glyph atlas so the phosphor tint (green/amber)
     * follows the new theme.
     */
    onThemeChanged() {
      if (_hfmEnabled && _hfmAltView) {
        _hfmAltView.rebuildGlyphs?.();
        _hfmAltView.invalidate?.();
      }
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
        return `Alt view afterglow: ${_formatPercent(next)}`;
      }
      if (shiftKey && direction === 'down') {
        const next = _applyHfmPersistFade(
          _hfmPersistFade - _HFM_PERSIST_FADE_RANGE.step
        );
        return `Alt view afterglow: ${_formatPercent(next)}`;
      }
      if (direction === 'up') {
        const next = _applyHfmContrastScale(
          _hfmContrastScale + _HFM_CONTRAST_RANGE.step
        );
        return `Alt view contrast: ${_formatPercent(next)}`;
      }
      if (direction === 'down') {
        const next = _applyHfmContrastScale(
          _hfmContrastScale - _HFM_CONTRAST_RANGE.step
        );
        return `Alt view contrast: ${_formatPercent(next)}`;
      }
      if (direction === 'left') {
        const next = _applyHfmFontScale(
          _hfmFontScale - _HFM_FONT_SCALE_RANGE.step
        );
        return `Alt view font size: ${_formatPercent(next)}`;
      }
      if (direction === 'right') {
        const next = _applyHfmFontScale(
          _hfmFontScale + _HFM_FONT_SCALE_RANGE.step
        );
        return `Alt view font size: ${_formatPercent(next)}`;
      }
      return true;
    },
  };
}
