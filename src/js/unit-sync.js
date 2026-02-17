/**
 * Unit Synchronization Bus
 *
 * Shared mm/px unit mode and scale factor (px per mm), synchronized between
 * Image Measurement and Reference Overlay via CustomEvent on document.
 *
 * Default unit: px (workflow pipeline uses pixels; advanced users switch to mm).
 *
 * @license GPL-3.0-or-later
 */

const UNIT_KEY = 'forge_shared_unit';
const SCALE_KEY = 'forge_scale_factor';

// Default: iPad standard display density (264 PPI ÷ 25.4 mm/in ≈ 10.39 px/mm)
const DEFAULT_SCALE_PX_PER_MM = 10.39;

let currentUnit = localStorage.getItem(UNIT_KEY) || 'px';
let scaleFactor = parseFloat(localStorage.getItem(SCALE_KEY)) || DEFAULT_SCALE_PX_PER_MM;

export function getUnit() {
  return currentUnit;
}

export function setUnit(unit) {
  if (unit !== 'px' && unit !== 'mm') return;
  if (unit === currentUnit) return;
  currentUnit = unit;
  localStorage.setItem(UNIT_KEY, unit);
  document.dispatchEvent(new CustomEvent('forge:unit-change', {
    detail: { unit: currentUnit, scaleFactor },
  }));
}

export function getScaleFactor() {
  return scaleFactor;
}

export function setScaleFactor(pxPerMm) {
  const v = Number.isFinite(pxPerMm) && pxPerMm > 0 ? pxPerMm : 0;
  if (v === scaleFactor) return;
  scaleFactor = v;
  if (v > 0) {
    localStorage.setItem(SCALE_KEY, String(v));
  } else {
    localStorage.removeItem(SCALE_KEY);
  }
  document.dispatchEvent(new CustomEvent('forge:scale-change', {
    detail: { unit: currentUnit, scaleFactor },
  }));
}

/**
 * Subscribe to unit changes.
 * @param {Function} callback - receives { unit, scaleFactor }
 * @returns {Function} unsubscribe
 */
export function onUnitChange(callback) {
  const handler = (e) => callback(e.detail);
  document.addEventListener('forge:unit-change', handler);
  return () => document.removeEventListener('forge:unit-change', handler);
}

/**
 * Subscribe to scale factor changes.
 * @param {Function} callback - receives { unit, scaleFactor }
 * @returns {Function} unsubscribe
 */
export function onScaleChange(callback) {
  const handler = (e) => callback(e.detail);
  document.addEventListener('forge:scale-change', handler);
  return () => document.removeEventListener('forge:scale-change', handler);
}
