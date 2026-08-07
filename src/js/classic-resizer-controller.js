/**
 * Classic Resizer Controller — keyboard-operable dock splitters (B4).
 *
 * Three separators size the Classic dock grid: two vertical ones between the
 * editor/3D view and the 3D view/Customizer, and one horizontal one between
 * the 3D view and the bottom strip (D-2). They exist only in Classic at
 * >=1024px; the Forge layouts keep Split.js, which is destroyed on entering
 * Classic because its inline styles would fight the grid.
 *
 * Value model: each separator's aria-valuenow is its pane's share of
 * #mainInterface, as a percentage. Bounds come from the --classic-*-min
 * tokens read back through getComputedStyle, so the CSS and this module
 * cannot drift apart — there is one copy of every limit and it lives in
 * classic.css.
 *
 * Sizing is applied by writing the same custom properties the grid template
 * already reads (--classic-col-editor, --classic-col-customizer,
 * --classic-row-bottom) via CSSOM setProperty. No inline geometry, no style
 * injection, nothing for the CSP to object to.
 *
 * Keyboard model is the Forge gutter's (main.js:7989-8039): Arrow +/-2%,
 * Shift+Arrow +/-5%, Home/End to the bounds.
 *
 * @license GPL-3.0-or-later
 */

import { getAppPrefKey } from './storage-keys.js';

const COLUMNS_KEY = getAppPrefKey('classic-columns');

/** Percentage step per arrow press, and with Shift held. */
const STEP_SMALL = 2;
const STEP_LARGE = 5;

/**
 * The separators, in DOM order. `property` is the custom property each one
 * writes; `minToken`/`otherMinToken` name the classic.css tokens that bound
 * it. Labels and value text are owner-approved (D-35, 2026-08-06).
 */
const RESIZER_DEFS = [
  {
    id: 'classicResizerEditor',
    key: 'editor',
    className: 'classic-resizer classic-resizer--editor',
    orientation: 'vertical',
    label: 'Resize editor pane',
    valueLabel: 'Editor',
    property: '--classic-col-editor',
    minToken: '--classic-col-editor-min',
    controls: ['classicEditorSlot', 'previewPanel'],
  },
  {
    id: 'classicResizerCustomizer',
    key: 'customizer',
    className: 'classic-resizer classic-resizer--customizer',
    orientation: 'vertical',
    label: 'Resize Customizer pane',
    valueLabel: 'Customizer',
    property: '--classic-col-customizer',
    minToken: '--classic-col-customizer-min',
    controls: ['previewPanel', 'paramPanel'],
  },
  {
    id: 'classicResizerStrip',
    key: 'bottom',
    className: 'classic-resizer classic-resizer--strip',
    orientation: 'horizontal',
    label: 'Resize bottom panels',
    valueLabel: 'Bottom panels',
    property: '--classic-row-bottom',
    minToken: '--classic-row-bottom-min',
    controls: ['previewPanel', 'classicBottomStrip'],
  },
];

/**
 * Read a length token off #mainInterface and return it in pixels.
 * @param {Element} host
 * @param {string} token
 * @returns {number} pixels, or 0 if the token is absent or not a length
 */
function readPxToken(host, token) {
  const raw = getComputedStyle(host).getPropertyValue(token).trim();
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : 0;
}

/**
 * Announce that the dock geometry changed. The 3D canvas sizes itself from
 * its container, so it has to re-measure — the same contract Split.js's
 * onDrag fulfils for the Forge layout (main.js:7908-7915).
 */
function emitLayoutResize() {
  document.dispatchEvent(new CustomEvent('classic-layout-resize'));
}

export class ClassicResizerController {
  constructor() {
    /** @type {Element|null} */
    this._host = null;
    /** @type {Map<string, Element>} */
    this._elements = new Map();
    /** @type {Record<string, number>} */
    this._sizes = this._loadSizes();
    /** @type {number|null} */
    this._rafId = null;
    /** @type {Array<{target: EventTarget, type: string, handler: Function}>} */
    this._listeners = [];
    /**
     * Value parked by a fold, restored on unfold. `null` means "not folded",
     * which is different from "folded at 0" — the fold must never lose the
     * height the user chose.
     * @type {number|null}
     */
    this._parkedBottom = null;
  }

  /** Create the separators and apply any stored sizes. */
  init() {
    const host = document.getElementById('mainInterface');
    if (!host || this._host) return;
    this._host = host;

    for (const def of RESIZER_DEFS) {
      const el = this._createSeparator(def);
      this._elements.set(def.key, el);
    }
    this._applyAll();
  }

  /**
   * Remove the separators and every property they wrote, so exiting Classic
   * leaves no geometry behind for Split.js to fight with.
   */
  destroy() {
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    for (const { target, type, handler } of this._listeners) {
      target.removeEventListener(type, handler);
    }
    this._listeners = [];

    for (const el of this._elements.values()) el.remove();
    this._elements.clear();

    if (this._host) {
      for (const def of RESIZER_DEFS) {
        this._host.style.removeProperty(def.property);
      }
    }
    this._host = null;
    this._parkedBottom = null;
  }

  /**
   * Park the bottom strip's size while it is folded. The fold owns the row
   * token for the duration, so the resizer must not also be writing it —
   * otherwise the two fight and the strip un-folds to the wrong height.
   */
  parkBottomSize() {
    if (!this._host || this._parkedBottom !== null) return;
    this._parkedBottom = this._sizes.bottom ?? null;
    this._host.style.removeProperty('--classic-row-bottom');
    this._refreshAria();
    emitLayoutResize();
  }

  /** Restore the size parked by {@link parkBottomSize}. */
  restoreBottomSize() {
    if (!this._host || this._parkedBottom === null) return;
    this._sizes.bottom = this._parkedBottom;
    this._parkedBottom = null;
    this._apply('bottom');
    this._refreshAria();
    emitLayoutResize();
  }

  /** @returns {boolean} whether the bottom strip is currently folded */
  isBottomParked() {
    return this._parkedBottom !== null;
  }

  /**
   * The percentage bounds for one separator, derived from the min-width
   * tokens. Mirrors getAriaRange (main.js:7959-7971).
   * @param {string} key
   * @returns {{min: number, max: number}}
   * @private
   */
  getRange(key) {
    const host = this._host;
    const def = RESIZER_DEFS.find((d) => d.key === key);
    if (!host || !def) return { min: 0, max: 100 };

    const vertical = def.orientation === 'vertical';
    const total = vertical ? host.clientWidth : host.clientHeight;
    if (!total) return { min: 0, max: 100 };

    const toPct = (px) => (px / total) * 100;
    const own = readPxToken(host, def.minToken);

    let max;
    if (vertical) {
      // Whatever the other column and the 3D view must keep is unavailable.
      const otherToken =
        key === 'editor'
          ? '--classic-col-customizer-min'
          : '--classic-col-editor-min';
      const otherOccupied =
        key === 'editor'
          ? document.body.dataset.classicFieldRightTop === 'occupied' ||
            document.body.dataset.classicFieldRightBottom === 'occupied'
          : document.body.dataset.classicFieldLeft === 'occupied';
      const reserved =
        readPxToken(host, '--classic-col-middle-min') +
        (otherOccupied ? readPxToken(host, otherToken) : 0) +
        readPxToken(host, '--classic-resizer-track') * 2;
      max = toPct(total - reserved);
    } else {
      // The floor belongs to the 3D VIEW, not to the display row as a whole:
      // the camera bar sits between the view and the strip and takes real
      // height, so it has to come out of the budget too or the view is
      // squeezed below its minimum by exactly the bar's height.
      const cameraBar = document.getElementById('classicCameraBar');
      const reserved =
        readPxToken(host, '--classic-row-display-min') +
        (cameraBar?.offsetHeight || 0);
      max = toPct(total - reserved);
    }

    const min = toPct(own);
    return {
      min: Math.max(0, Math.min(min, max)),
      max: Math.min(100, Math.max(min, max)),
    };
  }

  /**
   * The current size of a pane as a percentage of the host.
   * @param {string} key
   * @returns {number}
   * @private
   */
  _currentPct(key) {
    if (typeof this._sizes[key] === 'number') return this._sizes[key];

    const host = this._host;
    const def = RESIZER_DEFS.find((d) => d.key === key);
    if (!host || !def) return 0;

    const measured = {
      editor: () => document.getElementById('classicEditorSlot')?.offsetWidth,
      customizer: () => document.getElementById('paramPanel')?.offsetWidth,
      bottom: () => document.getElementById('classicBottomStrip')?.offsetHeight,
    }[key]?.();

    const total =
      def.orientation === 'vertical' ? host.clientWidth : host.clientHeight;
    if (!measured || !total) return 0;
    return (measured / total) * 100;
  }

  /**
   * Set one pane's size, clamped to its bounds, and persist it.
   * @param {string} key
   * @param {number} pct
   * @private
   */
  _setPct(key, pct) {
    const { min, max } = this.getRange(key);
    const clamped = Math.min(max, Math.max(min, pct));
    this._sizes[key] = clamped;
    this._apply(key);
    this._refreshAria(key);
    this._saveSizes();
    emitLayoutResize();
    return clamped;
  }

  /** @private */
  _apply(key) {
    const def = RESIZER_DEFS.find((d) => d.key === key);
    if (!this._host || !def || typeof this._sizes[key] !== 'number') return;
    // The row token is a track definition, not a bare length: keeping its
    // minmax() form means a dragged strip still refuses to go under its floor
    // even if the container shrinks afterwards.
    const value =
      def.orientation === 'vertical'
        ? `${this._sizes[key]}%`
        : `minmax(var(${def.minToken}), ${this._sizes[key]}%)`;
    this._host.style.setProperty(def.property, value);
  }

  /** @private */
  _applyAll() {
    for (const def of RESIZER_DEFS) this._apply(def.key);
    this._refreshAria();
  }

  /**
   * @param {string} [only] - refresh a single separator instead of all
   * @private
   */
  _refreshAria(only) {
    for (const def of RESIZER_DEFS) {
      if (only && def.key !== only) continue;
      const el = this._elements.get(def.key);
      if (!el) continue;

      const { min, max } = this.getRange(def.key);
      const now = Math.round(this._currentPct(def.key));
      el.setAttribute('aria-valuenow', String(now));
      el.setAttribute('aria-valuemin', String(Math.round(min)));
      el.setAttribute('aria-valuemax', String(Math.round(max)));
      el.setAttribute('aria-valuetext', `${def.valueLabel}: ${now}%`);
    }
  }

  /**
   * @param {Object} def
   * @returns {Element}
   * @private
   */
  _createSeparator(def) {
    let el = document.getElementById(def.id);
    if (!el) {
      el = document.createElement('div');
      el.id = def.id;
      el.className = def.className;
      this._host.appendChild(el);
    }
    // A native element cannot express "draggable boundary with a value", so
    // role="separator" plus tabindex is the sanctioned ARIA repair here.
    el.setAttribute('role', 'separator');
    el.setAttribute('tabindex', '0');
    el.setAttribute('aria-orientation', def.orientation);
    el.setAttribute('aria-label', def.label);
    const controls = def.controls
      .filter((id) => document.getElementById(id))
      .join(' ');
    if (controls) el.setAttribute('aria-controls', controls);

    this._on(el, 'keydown', (event) => this._onKeydown(def, event));
    this._on(el, 'pointerdown', (event) => this._onPointerDown(def, event));
    return el;
  }

  /** @private */
  _on(target, type, handler) {
    target.addEventListener(type, handler);
    this._listeners.push({ target, type, handler });
  }

  /** @private */
  _onKeydown(def, event) {
    const vertical = def.orientation === 'vertical';
    const decreaseKey = vertical ? 'ArrowLeft' : 'ArrowUp';
    const increaseKey = vertical ? 'ArrowRight' : 'ArrowDown';
    const keys = [decreaseKey, increaseKey, 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    if (def.key === 'bottom' && this.isBottomParked()) return;

    event.preventDefault();
    const { min, max } = this.getRange(def.key);
    const step = event.shiftKey ? STEP_LARGE : STEP_SMALL;
    const current = this._currentPct(def.key);

    // Growing the Customizer or the strip means dragging the separator the
    // other way, so the two vertical separators read their arrows opposite
    // to each other.
    const grows = def.key === 'editor' ? increaseKey : decreaseKey;
    const shrinks = def.key === 'editor' ? decreaseKey : increaseKey;

    let next = current;
    if (event.key === grows) next = current + step;
    else if (event.key === shrinks) next = current - step;
    else if (event.key === 'Home') next = def.key === 'editor' ? min : max;
    else if (event.key === 'End') next = def.key === 'editor' ? max : min;

    this._setPct(def.key, next);
  }

  /** @private */
  _onPointerDown(def, event) {
    if (event.button !== 0) return;
    if (def.key === 'bottom' && this.isBottomParked()) return;
    const host = this._host;
    if (!host) return;

    event.preventDefault();
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);

    const vertical = def.orientation === 'vertical';
    const move = (moveEvent) => {
      if (this._rafId !== null) return;
      this._rafId = requestAnimationFrame(() => {
        this._rafId = null;
        const rect = host.getBoundingClientRect();
        const total = vertical ? rect.width : rect.height;
        if (!total) return;

        let pct;
        if (def.key === 'editor') {
          pct = ((moveEvent.clientX - rect.left) / total) * 100;
        } else if (def.key === 'customizer') {
          pct = ((rect.right - moveEvent.clientX) / total) * 100;
        } else {
          pct = ((rect.bottom - moveEvent.clientY) / total) * 100;
        }
        this._setPct(def.key, pct);
      });
    };

    const up = () => {
      target.releasePointerCapture?.(event.pointerId);
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
      if (this._rafId !== null) {
        cancelAnimationFrame(this._rafId);
        this._rafId = null;
      }
      this._refreshAria(def.key);
    };

    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  }

  /** @private */
  _loadSizes() {
    try {
      const stored = localStorage.getItem(COLUMNS_KEY);
      if (!stored) return {};
      const parsed = JSON.parse(stored);
      const sizes = {};
      for (const def of RESIZER_DEFS) {
        const value = parsed?.[def.key];
        if (typeof value === 'number' && Number.isFinite(value)) {
          sizes[def.key] = value;
        }
      }
      return sizes;
    } catch (error) {
      console.warn(
        '[classic-resizers] stored column sizes were unreadable; falling back to the default layout',
        error
      );
      return {};
    }
  }

  /** @private */
  _saveSizes() {
    try {
      localStorage.setItem(COLUMNS_KEY, JSON.stringify(this._sizes));
    } catch {
      // Layout persistence is best-effort; a full quota must not break
      // the resize the user just performed.
    }
  }
}

/** @type {ClassicResizerController|null} */
let instance = null;

/**
 * Create the Classic resizers. Called at the end of the layout controller's
 * enter().
 * @returns {ClassicResizerController}
 */
export function initClassicResizers() {
  if (!instance) instance = new ClassicResizerController();
  instance.init();
  return instance;
}

/** Tear the resizers down. Called from the layout controller's exit(). */
export function destroyClassicResizers() {
  instance?.destroy();
  instance = null;
}

/** @returns {ClassicResizerController|null} */
export function getClassicResizerController() {
  return instance;
}
