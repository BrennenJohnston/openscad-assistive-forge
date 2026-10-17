/**
 * The Customizer on a phone held upright: it comes in from the left over the
 * preview, the way it opens beside the preview on a desktop, and it is
 * see-through, so the model shows behind it while a value changes. The grip
 * on its right edge sets its width, and the width is kept; Preferences sets
 * how solid it is. Held sideways it stays a column beside the preview.
 * @license GPL-3.0-or-later
 */

import {
  safeGetItem,
  safeSetItem,
  STORAGE_KEY_PHONE_CUSTOMIZER_OPACITY,
  STORAGE_KEY_PHONE_CUSTOMIZER_WIDTH,
} from './storage-keys.js';

/** Its width when nothing is saved, as a share of the screen's width. */
export const CUSTOMIZER_DEFAULT_SHARE = 0.85;
/** Its narrowest: the desktop Customizer's own, so a slider row still fits. */
export const CUSTOMIZER_MIN_PX = 280;
/** The strip of the preview it always leaves at its right: one touch target. */
export const CUSTOMIZER_STRIP_PX = 44;
/** How solid it is when nothing is saved, and the setting's range, in percent. */
export const CUSTOMIZER_OPACITY_DEFAULT = 90;
export const CUSTOMIZER_OPACITY_MIN = 65;
export const CUSTOMIZER_OPACITY_MAX = 100;
const OPACITY_STEP = 5;

/** The grip's arrow-key steps, in percent of the screen's width. */
const STEP = 2;
const BIG_STEP = 5;

/**
 * The narrowest and widest the Customizer may be on a screen this wide.
 * @param {number} viewportWidth - px
 * @returns {{min: number, max: number}} px
 */
export function customizerWidthBounds(viewportWidth) {
  const max = Math.max(0, Math.floor(viewportWidth - CUSTOMIZER_STRIP_PX));
  return { min: Math.min(CUSTOMIZER_MIN_PX, max), max };
}

/**
 * The Customizer's width for a saved share, kept within its bounds.
 * @param {number} share - of the screen's width, 0 to 1
 * @param {number} viewportWidth - px
 * @returns {number} px
 */
export function customizerWidthPx(share, viewportWidth) {
  const { min, max } = customizerWidthBounds(viewportWidth);
  const usable =
    Number.isFinite(share) && share > 0 && share <= 1
      ? share
      : CUSTOMIZER_DEFAULT_SHARE;
  return Math.round(Math.min(max, Math.max(min, usable * viewportWidth)));
}

/** @returns {number} the saved share of the screen's width, or the default */
export function loadCustomizerShare() {
  const saved = parseFloat(safeGetItem(STORAGE_KEY_PHONE_CUSTOMIZER_WIDTH));
  return Number.isFinite(saved) && saved > 0 && saved <= 1
    ? saved
    : CUSTOMIZER_DEFAULT_SHARE;
}

/**
 * A setting kept on the setting's steps and within its range.
 * @param {number|string} value - percent
 * @returns {number} percent
 */
export function clampCustomizerOpacity(value) {
  const n = Math.round(Number(value) / OPACITY_STEP) * OPACITY_STEP;
  if (!Number.isFinite(n)) return CUSTOMIZER_OPACITY_DEFAULT;
  return Math.min(CUSTOMIZER_OPACITY_MAX, Math.max(CUSTOMIZER_OPACITY_MIN, n));
}

/** @returns {number} the saved setting, or the default, in percent */
export function loadCustomizerOpacity() {
  const saved = safeGetItem(STORAGE_KEY_PHONE_CUSTOMIZER_OPACITY);
  return saved === null
    ? CUSTOMIZER_OPACITY_DEFAULT
    : clampCustomizerOpacity(saved);
}

function applyOpacity(percent) {
  document.documentElement.style.setProperty(
    '--customizer-opacity',
    `${percent}%`
  );
}

/** The Preferences slider beside Grid opacity, and the setting it keeps. */
function initOpacitySetting() {
  const current = loadCustomizerOpacity();
  applyOpacity(current);
  const input = document.getElementById('prefsCustomizerOpacity');
  if (!input) return;
  const value = document.getElementById('prefsCustomizerOpacityValue');
  input.min = String(CUSTOMIZER_OPACITY_MIN);
  input.max = String(CUSTOMIZER_OPACITY_MAX);
  input.step = String(OPACITY_STEP);
  input.value = String(current);
  if (value) value.textContent = `${current}%`;
  input.addEventListener('input', () => {
    const next = clampCustomizerOpacity(input.value);
    applyOpacity(next);
    if (value) value.textContent = `${next}%`;
    safeSetItem(STORAGE_KEY_PHONE_CUSTOMIZER_OPACITY, String(next));
  });
}

/**
 * The width and the grip. A finger or a mouse drags the grip; the arrow keys
 * move it as they move the desktop divider (Shift for bigger steps, Home and
 * End for the ends). The width is kept as a share of the screen's width, so
 * it is the same share after the phone turns or the page reloads.
 * @param {{panel: HTMLElement, grip: HTMLElement|null}} parts
 * @returns {{apply: () => void}}
 */
export function initPhoneCustomizer({ panel, grip }) {
  initOpacitySetting();
  let share = loadCustomizerShare();

  function apply() {
    const vw = window.innerWidth;
    const px = customizerWidthPx(share, vw);
    const root = document.documentElement.style;
    root.setProperty('--phone-customizer-width', `${px}px`);
    if (!grip) return;
    // The grip sits on the edge, halfway down the panel.
    const box = panel.getBoundingClientRect();
    if (box.height) {
      root.setProperty(
        '--phone-customizer-grip-top',
        `${Math.round(box.top + box.height / 2)}px`
      );
    }
    const { min, max } = customizerWidthBounds(vw);
    const percent = (n) => Math.round((n / vw) * 100);
    grip.setAttribute('aria-valuemin', String(percent(min)));
    grip.setAttribute('aria-valuemax', String(percent(max)));
    grip.setAttribute('aria-valuenow', String(percent(px)));
    grip.setAttribute(
      'aria-valuetext',
      `Customizer ${percent(px)}% of the screen's width`
    );
  }

  function setWidth(px, { save = true } = {}) {
    const vw = window.innerWidth;
    const { min, max } = customizerWidthBounds(vw);
    share = Math.min(max, Math.max(min, px)) / vw;
    apply();
    if (save) {
      safeSetItem(STORAGE_KEY_PHONE_CUSTOMIZER_WIDTH, share.toFixed(4));
    }
  }

  if (grip) {
    grip.addEventListener('keydown', (event) => {
      const vw = window.innerWidth;
      const now = customizerWidthPx(share, vw);
      const { min, max } = customizerWidthBounds(vw);
      const step = ((event.shiftKey ? BIG_STEP : STEP) / 100) * vw;
      const next = {
        ArrowLeft: now - step,
        ArrowRight: now + step,
        Home: min,
        End: max,
      }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      setWidth(next);
    });

    let dragging = false;
    grip.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      dragging = true;
      grip.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    });
    grip.addEventListener('pointermove', (event) => {
      if (!dragging) return;
      // The panel starts at the screen's left edge: its width is the
      // pointer's distance from that edge.
      setWidth(event.clientX, { save: false });
    });
    const endDrag = (event) => {
      if (!dragging) return;
      dragging = false;
      grip.releasePointerCapture?.(event.pointerId);
      safeSetItem(STORAGE_KEY_PHONE_CUSTOMIZER_WIDTH, share.toFixed(4));
    };
    grip.addEventListener('pointerup', endDrag);
    grip.addEventListener('pointercancel', endDrag);
  }

  apply();
  return { apply };
}
