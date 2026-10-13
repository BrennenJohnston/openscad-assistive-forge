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
  STORAGE_KEY_SOUNDS,
} from './storage-keys.js';
import { announce, announceImmediate } from './announcer.js';
import { playUnlockJingle } from './unlock-jingle.js';

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

// The default is finer than the renderer's own 1: at full size the first
// frame drew the model as a blob with no faces. A saved size wins.
const _HFM_FONT_SCALE_RANGE = { min: 0.5, max: 2.5, step: 0.05, default: 0.6 };
let _hfmFontScale = _HFM_FONT_SCALE_RANGE.default;
let _hfmFontScaleControls = null;

// A gentle afterglow to begin with; a saved 0 stays 0, and reduced motion
// holds it at 0.
const _HFM_PERSIST_FADE_RANGE = { min: 0, max: 1, step: 0.05, default: 0.15 };
let _hfmPersistFade = _HFM_PERSIST_FADE_RANGE.default;
let _hfmPersistFadeControls = null;

let _hfmPanAdjustEnabled = false;
let _hfmPanToggleButtons = null;
let _hfmMotionListener = null;
let _hfmModeListener = null;

// Classic wears a retro look of its own while the Alt View is on; the root
// carries its name, and the variant stylesheet gives it its values.
const _HFM_CLASSIC_LOOK = 'dos';

// Heard once when the key appears: that something appeared, and where.
// Finding out what it does is the point, so the sentence says no more.
const _HFM_UNLOCK_SENTENCE = 'A key appeared next to the theme button.';
// announce() holds a polite message for 350 ms and a later call replaces a
// held one. The button that completes the sequence speaks its own action
// inside that hold, so the sentence waits past it and is written at once.
const _HFM_UNLOCK_ANNOUNCE_DELAY_MS = 600;
// With the tune playing, the sentence waits for its end and this pause.
const _HFM_AFTER_TUNE_MS = 300;

// The key's name says what it is; what it does is said once it is pressed.
const _HFM_TOGGLE_NAME = 'Alt View';
const _HFM_ON_SENTENCE =
  'Alt View on. The preview is drawn with characters and the interface follows.';
const _HFM_OFF_SENTENCE = 'Alt View off.';
// Pan adjust keeps one name in both states; the values it changes show in
// the preview's status line, and each change is spoken on its own.
const _HFM_PAN_ADJUST_NAME = 'Adjust the Alt View with the pan arrows';
const _HFM_PAN_ADJUST_ON_SENTENCE =
  'Pan arrows now adjust the Alt View: up and down for edges, left and right for size, Shift with up and down for glow.';
const _HFM_PAN_ADJUST_OFF_SENTENCE = 'Pan arrows move the view again.';

// The character sizes a person steps through from the status strip. The
// slider and the pan arrows still move in 5% steps between them.
const _HFM_CHARACTER_STEPS = [
  { name: 'Fine', scale: 0.5 },
  { name: 'Normal', scale: 0.6 },
  { name: 'Bold', scale: 1 },
];
const _HFM_STEP_TOLERANCE = 0.001;
let _hfmCharacterStepper = null;

// The edge levels a person chooses by name from the status strip; the slider
// still moves in 5% steps between them. The curve itself is unchanged.
const _HFM_EDGE_LEVELS = [
  { level: 'soft', scale: 0.7 },
  { level: 'normal', scale: 1 },
  { level: 'sharp', scale: 1.6 },
];
let _hfmEdgeLevels = null;

// The first Alt View in a page draws in from the top and the status line
// types a greeting before its ordinary line; later ones start at once. The
// line is not live, so the greeting is for the eye only.
const _HFM_GREETING = 'ALT VIEW ONLINE';
const _HFM_GREETING_LETTER_MS = 40;
const _HFM_GREETING_HOLD_MS = 700;
// The draw-in lasts the variant's --crt-reveal-duration (1 s) once it starts,
// and a slow machine takes most of a second to start it (0.65 s measured
// under 4x CPU throttling). This clears it if the animation never runs, as
// with forced colors.
const _HFM_REVEAL_FALLBACK_MS = 3000;
let _hfmRevealPlayed = false;
let _hfmRevealTimer = null;
let _hfmGreetingPlayed = false;
let _hfmGreetingTimer = null;
let _hfmStatusOverride = null;
// The first picture rasters in once per page, after the draw-in when that
// plays; the stylesheet times both. This clears it if it never ends.
const _HFM_RASTER_FALLBACK_MS = 4000;
let _hfmRasterPlayed = false;
let _hfmRasterTimer = null;

// Found by the camera sequence, the key drops into its place wearing the Alt
// View's colors, rests a moment, then redraws itself as the ordinary key. The
// stylesheet times the drop and the redraw; the rest is here.
const _HFM_KEY_REST_MS = 300;
// Clears the arrival if its animations never end, as in a hidden tab.
const _HFM_ARRIVAL_FALLBACK_MS = 12000;
let _hfmArrival = null;
const _hfmArrivalTimers = { rest: null, fallback: null };

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

// Preferences ▸ Advanced ▸ Play sounds, on unless turned off.
function _soundsOn() {
  try {
    return localStorage.getItem(STORAGE_KEY_SOUNDS) !== 'false';
  } catch (_) {
    return true;
  }
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

  const controls = document.getElementById('altViewControls');
  if (!isMono || !_hfmEnabled) {
    statusBar.classList.remove('has-alt-adjust');
    altAdjustEl.textContent = '';
    if (controls) controls.hidden = true;
    return;
  }
  if (controls) controls.hidden = false;

  let displayText;
  if (_hfmStatusOverride !== null) {
    displayText = _hfmStatusOverride;
  } else if (_hfmPanAdjustEnabled) {
    displayText =
      '[ALT ADJUST] \u25B2\u25BC edge \u00B7 \u25C4\u25BA size \u00B7 Shift+\u25B2\u25BC glow';
  } else {
    const edge = _formatPercent(_hfmContrastScale);
    const size = _formatPercent(_hfmFontScale);
    const glow = _formatPercent(_prefersReducedMotion() ? 0 : _hfmPersistFade);
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

  btns.forEach((btn) => {
    btn.setAttribute('aria-pressed', _hfmPanAdjustEnabled ? 'true' : 'false');
    btn.classList.toggle('active', _hfmPanAdjustEnabled);
    btn.title = _HFM_PAN_ADJUST_NAME;
    btn.setAttribute('aria-label', _HFM_PAN_ADJUST_NAME);
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
  _initHfmEdgeLevels()?.sync(clamped);
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
  _initHfmCharacterStepper()?.sync(clamped);
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

/**
 * Move the character size to the next named step below or above the
 * current size, and say the new size. At either end the size stays and is
 * said again.
 * @param {number} direction - -1 for smaller, 1 for larger
 * @returns {number} The size applied
 */
function _stepHfmCharacters(direction) {
  let target = _hfmFontScale;
  if (direction < 0) {
    const below = _HFM_CHARACTER_STEPS.filter(
      (step) => step.scale < _hfmFontScale - _HFM_STEP_TOLERANCE
    );
    if (below.length) target = below[below.length - 1].scale;
  } else {
    const above = _HFM_CHARACTER_STEPS.find(
      (step) => step.scale > _hfmFontScale + _HFM_STEP_TOLERANCE
    );
    if (above) target = above.scale;
  }
  const next = _applyHfmFontScale(target);
  announceImmediate(`Characters ${_formatPercent(next)}`);
  return next;
}

/**
 * The Characters stepper in the preview's status strip: Smaller and Larger
 * move to the next named step; the value shows the step's name, or the
 * percentage when the size was set between steps elsewhere.
 * @returns {{ sync: (scale: number) => void }|null} null when the strip is
 *   not on the page
 */
function _initHfmCharacterStepper() {
  if (_hfmCharacterStepper) return _hfmCharacterStepper;
  const smaller = document.getElementById('altViewCharactersSmaller');
  const larger = document.getElementById('altViewCharactersLarger');
  const valueEl = document.getElementById('altViewCharactersValue');
  if (!smaller || !larger || !valueEl) return null;

  smaller.addEventListener('click', () => _stepHfmCharacters(-1));
  larger.addEventListener('click', () => _stepHfmCharacters(1));

  _hfmCharacterStepper = {
    sync(scale) {
      const step = _HFM_CHARACTER_STEPS.find(
        (s) => Math.abs(s.scale - scale) < _HFM_STEP_TOLERANCE
      );
      valueEl.textContent = step ? step.name : _formatPercent(scale);
    },
  };
  _hfmCharacterStepper.sync(_hfmFontScale);
  return _hfmCharacterStepper;
}

/**
 * The Edges level buttons in the preview's status strip: each sets its
 * level's scale and says it; the button whose level the current scale
 * matches reads pressed, none when the slider sits between levels.
 * @returns {{ sync: (scale: number) => void }|null} null when the strip is
 *   not on the page
 */
function _initHfmEdgeLevels() {
  if (_hfmEdgeLevels) return _hfmEdgeLevels;
  const buttons = [
    ...document.querySelectorAll('#altViewEdges .alt-view-level-btn'),
  ];
  if (!buttons.length) return null;

  buttons.forEach((button) => {
    const level = _HFM_EDGE_LEVELS.find(
      (entry) => entry.level === button.dataset.level
    );
    if (!level) return;
    button.addEventListener('click', () => {
      const next = _applyHfmContrastScale(level.scale);
      announceImmediate(`Edges ${_formatPercent(next)}`);
    });
  });

  _hfmEdgeLevels = {
    sync(scale) {
      buttons.forEach((button) => {
        const level = _HFM_EDGE_LEVELS.find(
          (entry) => entry.level === button.dataset.level
        );
        const pressed =
          Boolean(level) && Math.abs(level.scale - scale) < _HFM_STEP_TOLERANCE;
        button.setAttribute('aria-pressed', pressed ? 'true' : 'false');
      });
    },
  };
  _hfmEdgeLevels.sync(_hfmContrastScale);
  return _hfmEdgeLevels;
}

function _initHfmContrastControls() {
  if (_hfmContrastControls) return _hfmContrastControls;
  _hfmContrastControls = _buildHfmSliderControls({
    idBase: '_hfmContrast',
    titleText: 'Edges',
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
    titleText: 'Characters',
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
    titleText: 'Glow',
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
  if (enabled) {
    document.documentElement.setAttribute(
      'data-classic-retro',
      _HFM_CLASSIC_LOOK
    );
  } else {
    document.documentElement.removeAttribute('data-classic-retro');
  }
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

function _onAltViewRevealEnd(event) {
  if (event.animationName === 'alt-view-reveal') _endAltViewReveal();
}

function _endAltViewReveal() {
  clearTimeout(_hfmRevealTimer);
  _hfmRevealTimer = null;
  document.body?.removeEventListener('animationend', _onAltViewRevealEnd);
  document.documentElement.removeAttribute('data-alt-view-reveal');
}

/** @returns {boolean} Whether the draw-in is playing now. */
function _playAltViewReveal() {
  if (_hfmRevealPlayed) return false;
  _hfmRevealPlayed = true;
  if (_prefersReducedMotion()) return false;
  document.body?.addEventListener('animationend', _onAltViewRevealEnd);
  _hfmRevealTimer = setTimeout(_endAltViewReveal, _HFM_REVEAL_FALLBACK_MS);
  document.documentElement.setAttribute('data-alt-view-reveal', '');
  return true;
}

function _onRasterInEnd(event) {
  if (event.animationName === 'alt-view-raster-in') _endRasterIn();
}

function _endRasterIn() {
  clearTimeout(_hfmRasterTimer);
  _hfmRasterTimer = null;
  const canvas = document.querySelector('.hfm-overlay-canvas');
  if (!canvas) return;
  canvas.removeEventListener('animationend', _onRasterInEnd);
  canvas.classList.remove(
    'alt-view-raster-in',
    'alt-view-raster-in--after-reveal'
  );
}

function _rasterInFirstPicture(afterReveal) {
  if (_hfmRasterPlayed) return;
  _hfmRasterPlayed = true;
  const canvas = document.querySelector('.hfm-overlay-canvas');
  if (!canvas || _prefersReducedMotion()) return;
  canvas.addEventListener('animationend', _onRasterInEnd);
  _hfmRasterTimer = setTimeout(_endRasterIn, _HFM_RASTER_FALLBACK_MS);
  canvas.classList.add('alt-view-raster-in');
  if (afterReveal) canvas.classList.add('alt-view-raster-in--after-reveal');
}

function _typeAltViewGreeting() {
  if (_hfmGreetingPlayed) return;
  _hfmGreetingPlayed = true;
  let shown = _prefersReducedMotion() ? _HFM_GREETING.length : 1;
  const step = () => {
    _hfmStatusOverride = _HFM_GREETING.slice(0, shown);
    _updateHfmStatusBar();
    if (shown < _HFM_GREETING.length) {
      shown += 1;
      _hfmGreetingTimer = setTimeout(step, _HFM_GREETING_LETTER_MS);
      return;
    }
    _hfmGreetingTimer = setTimeout(() => {
      _hfmGreetingTimer = null;
      _hfmStatusOverride = null;
      _updateHfmStatusBar();
    }, _HFM_GREETING_HOLD_MS);
  };
  step();
}

function _stopAltViewStart() {
  _endAltViewReveal();
  _endRasterIn();
  clearTimeout(_hfmGreetingTimer);
  _hfmGreetingTimer = null;
  _hfmStatusOverride = null;
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

  // Classic's look carries an accent of its own, so the glyph atlas follows
  // the layout mode as it follows the theme.
  _hfmModeListener = () => {
    _hfmAltView?.rebuildGlyphs?.();
    _hfmAltView?.invalidate?.();
  };
  document.addEventListener('ui-mode-changed', _hfmModeListener);

  _loadSavedHfmSettings();

  _applyHfmContrastScale(_hfmContrastScale);
  _applyHfmFontScale(_hfmFontScale);
  if (_prefersReducedMotion()) {
    // Afterglow is motion: held at 0 without saving, so the person's own
    // value is there when motion is allowed again.
    _hfmAltView.setPersistFade?.(0);
  } else {
    _applyHfmPersistFade(_hfmPersistFade);
  }
  _setHfmSlidersEnabled(true);

  // The model stays where the ordinary preview puts it, its bottom on the
  // grid: the orbit target is already at its middle, so nothing is moved.
  previewManager?.setPostLoadHook?.(() => {
    _getDisplayOptionsController().refreshOverlays();
    _hfmAltView?.invalidate?.();
  });

  previewManager.setRenderOverride(() => _hfmAltView.render());
  previewManager.setResizeHook(({ width, height }) => {
    _hfmAltView.resize(width, height);
    _hfmAltView.invalidate?.();
  });
  previewManager.applyGridForAltView?.(true);

  const revealing = _playAltViewReveal();
  root.setAttribute('data-ui-variant', 'mono');
  _rasterInFirstPicture(revealing);

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
  _typeAltViewGreeting();

  if (_hfmPanToggleButtons?.desktop)
    _hfmPanToggleButtons.desktop.style.display = 'flex';
  if (_hfmPanToggleButtons?.mobile)
    _hfmPanToggleButtons.mobile.style.display = 'flex';
  _setHfmPanAdjustEnabled(false);
}

function _disableAltViewWithPreview(toggleBtn) {
  const previewManager = _getPreviewManager();
  const root = document.documentElement;

  _stopAltViewStart();

  if (_hfmMotionListener) {
    const motionMql = window.matchMedia('(prefers-reduced-motion: reduce)');
    motionMql.removeEventListener('change', _hfmMotionListener);
    _hfmMotionListener = null;
  }
  if (_hfmModeListener) {
    document.removeEventListener('ui-mode-changed', _hfmModeListener);
    _hfmModeListener = null;
  }

  if (_hfmAltView) {
    _hfmAltView.disable();
  }
  previewManager?.clearRenderOverride();
  previewManager?.clearResizeHook();
  previewManager?.clearPostLoadHook?.();
  previewManager?.applyGridForAltView?.(false);

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

function _endKeyArrival() {
  if (!_hfmArrival) return;
  const { toggle, shown, onEnd } = _hfmArrival;
  _hfmArrival = null;
  clearTimeout(_hfmArrivalTimers.rest);
  clearTimeout(_hfmArrivalTimers.fallback);
  toggle.removeEventListener('animationend', onEnd);
  toggle.removeAttribute('data-arrival');
  shown.remove();
}

function _playKeyArrival(toggle) {
  if (!toggle || _prefersReducedMotion()) return;
  const shown = document.createElement('span');
  shown.className = 'alt-view-arrival';
  shown.setAttribute('aria-hidden', 'true');
  shown.innerHTML = toggle.querySelector('svg')?.outerHTML ?? '';
  // From just above the top of the screen to the key's place.
  const bottom = Math.ceil(toggle.getBoundingClientRect().bottom);
  shown.style.setProperty('--alt-view-drop-from', `${-bottom}px`);

  const onEnd = (event) => {
    if (event.target !== shown || event.pseudoElement) return;
    if (event.animationName === 'alt-view-key-drop') {
      toggle.setAttribute('data-arrival', 'landed');
      _hfmArrivalTimers.rest = setTimeout(() => {
        toggle.setAttribute('data-arrival', 'settled');
      }, _HFM_KEY_REST_MS);
    } else if (event.animationName === 'alt-view-key-scan') {
      _endKeyArrival();
    }
  };
  _hfmArrival = { toggle, shown, onEnd };
  toggle.addEventListener('animationend', onEnd);
  _hfmArrivalTimers.fallback = setTimeout(
    _endKeyArrival,
    _HFM_ARRIVAL_FALLBACK_MS
  );
  toggle.appendChild(shown);
  toggle.setAttribute('data-arrival', 'dropping');
}

function _injectAltToggle() {
  const themeToggle = document.getElementById('themeToggle');
  if (!themeToggle) return;
  if (document.getElementById('_hfmToggle')) return;

  const toggleBtn = document.createElement('button');
  toggleBtn.id = '_hfmToggle';
  toggleBtn.className = 'btn btn-sm btn-secondary alt-view-toggle';
  toggleBtn.setAttribute('aria-pressed', 'false');
  toggleBtn.setAttribute('aria-label', _HFM_TOGGLE_NAME);
  toggleBtn.setAttribute('title', _HFM_TOGGLE_NAME);
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
  panToggleBtn.setAttribute('aria-label', _HFM_PAN_ADJUST_NAME);
  panToggleBtn.setAttribute('title', _HFM_PAN_ADJUST_NAME);
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
    announceImmediate(
      _hfmPanAdjustEnabled
        ? _HFM_PAN_ADJUST_ON_SENTENCE
        : _HFM_PAN_ADJUST_OFF_SENTENCE
    );
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
    _endKeyArrival();
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
        _playAltViewReveal();
        root.setAttribute('data-ui-variant', 'mono');
        toggleBtn.setAttribute('aria-pressed', 'true');
        _hfmPendingEnable = true;
      } else {
        _stopAltViewStart();
        root.removeAttribute('data-ui-variant');
        _setAssetsForVariant(false);
        toggleBtn.setAttribute('aria-pressed', 'false');
        _hfmPendingEnable = false;
      }
      announceImmediate(
        isCurrentlyEnabled ? _HFM_OFF_SENTENCE : _HFM_ON_SENTENCE
      );
      return;
    }

    if (!isCurrentlyEnabled) {
      await _enableAltViewWithPreview(toggleBtn);
    } else {
      _disableAltViewWithPreview(toggleBtn);
    }
    announceImmediate(
      isCurrentlyEnabled ? _HFM_OFF_SENTENCE : _HFM_ON_SENTENCE
    );
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

/**
 * @param {Object} [options]
 * @param {boolean} [options.moment] - Found by the camera sequence: the key
 *   arrives with its drop instead of simply appearing.
 */
function _handleUnlock({ moment = false } = {}) {
  if (_hfmUnlocked) return;
  _hfmUnlocked = true;

  _injectAltToggle();
  if (moment) _playKeyArrival(document.getElementById('_hfmToggle'));

  document.querySelectorAll('[data-hfm-gated]').forEach((el) => {
    el.hidden = false;
  });

  const sayIt = (delay) =>
    window.setTimeout(() => {
      announce(_HFM_UNLOCK_SENTENCE, { immediate: true });
    }, delay);
  if (moment && _soundsOn()) {
    // The tune first, then the sentence, so neither covers the other. A tune
    // that cannot play leaves the sentence at its usual time.
    playUnlockJingle().then(
      (seconds) => sayIt(seconds * 1000 + _HFM_AFTER_TUNE_MS),
      (error) => {
        console.warn('[Alt View] The unlock tune did not play:', error);
        sayIt(_HFM_UNLOCK_ANNOUNCE_DELAY_MS);
      }
    );
  } else {
    sayIt(_HFM_UNLOCK_ANNOUNCE_DELAY_MS);
  }

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
     * The character-size shortcuts' action: a step smaller or larger while
     * the Alt View is on.
     * @param {number} direction - -1 for smaller, 1 for larger
     * @returns {boolean} False when the Alt View is off (nothing changed)
     */
    stepCharacters(direction) {
      if (!_hfmEnabled || !_hfmAltView) return false;
      _stepHfmCharacters(direction);
      return true;
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
        return `Glow ${_formatPercent(next)}`;
      }
      if (shiftKey && direction === 'down') {
        const next = _applyHfmPersistFade(
          _hfmPersistFade - _HFM_PERSIST_FADE_RANGE.step
        );
        return `Glow ${_formatPercent(next)}`;
      }
      if (direction === 'up') {
        const next = _applyHfmContrastScale(
          _hfmContrastScale + _HFM_CONTRAST_RANGE.step
        );
        return `Edges ${_formatPercent(next)}`;
      }
      if (direction === 'down') {
        const next = _applyHfmContrastScale(
          _hfmContrastScale - _HFM_CONTRAST_RANGE.step
        );
        return `Edges ${_formatPercent(next)}`;
      }
      if (direction === 'left') {
        const next = _applyHfmFontScale(
          _hfmFontScale - _HFM_FONT_SCALE_RANGE.step
        );
        return `Characters ${_formatPercent(next)}`;
      }
      if (direction === 'right') {
        const next = _applyHfmFontScale(
          _hfmFontScale + _HFM_FONT_SCALE_RANGE.step
        );
        return `Characters ${_formatPercent(next)}`;
      }
      return true;
    },
  };
}
