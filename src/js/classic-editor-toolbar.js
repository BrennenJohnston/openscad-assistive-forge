/**
 * Classic Editor Toolbar controller (D4).
 *
 * Wires the twelve buttons of #classicEditorToolbar, whose markup lives in
 * index.html so it travels into the Classic editor slot with the panel.
 *
 * Every handler delegates to machinery that already exists — the file-actions
 * controller, the editor's own performAction, the A4-rewired preview trigger,
 * the Generate button — so this module owns wiring and enablement, never a
 * second implementation of an action.
 *
 * Enablement is disabled-with-reason, not hiding: a gated button keeps
 * aria-disabled="true" and stays focusable so keyboard and screen-reader
 * users can find it and hear why. Reason strings are reused verbatim from the
 * menus that already describe the same conditions, so a user meets the same
 * wording wherever they hit the same wall.
 *
 * Dependencies are injected (the pattern of file-actions-controller.js:79-87)
 * rather than imported, because they are main.js closures.
 *
 * @license GPL-3.0-or-later
 */

import { announceImmediate } from './announcer.js';

/** Reason strings, reused verbatim from the menus (owner-approved 2026-08-07). */
const REASON_NOTHING_TO_UNDO = 'Nothing to undo';
const REASON_NOTHING_TO_REDO = 'Nothing to redo';
const REASON_BASIC_EDITOR = 'Not available in the basic text editor';
/**
 * Classic-truthful wording, owner-approved 2026-08-09 (Q-19): Classic has no
 * Generate surface, so the old "Press Generate first…" named a control the
 * user could not find. Exported because the top toolbar's STL button
 * (main.js) gates on the same condition and must say the same thing.
 */
export const REASON_NEEDS_RENDER = 'Render the model first (F6)';
const REASON_NEEDS_FILE = 'Open a file first';

export class ClassicEditorToolbar {
  /**
   * @param {Object} deps
   * @param {Object} deps.fileActionsController
   * @param {Function} deps.getEditor    - () => editor instance or null
   * @param {Function} deps.getState     - () => app state
   * @param {Function} deps.getHasFullRender - () => boolean
   * @param {Function} deps.triggerPreview   - the A4-rewired preview trigger
   * @param {Function} deps.triggerRender    - runFullRender, never the transformer (U-8a)
   * @param {Function} deps.exportStl        - () => void
   */
  constructor(deps = {}) {
    this.fileActions = deps.fileActionsController || null;
    this.getEditor = deps.getEditor || (() => null);
    this.getState = deps.getState || (() => ({}));
    this.getHasFullRender = deps.getHasFullRender || (() => false);
    this.triggerPreview = deps.triggerPreview || (() => {});
    this.triggerRender = deps.triggerRender || (() => {});
    this.exportStl = deps.exportStl || (() => {});

    /** @type {HTMLElement|null} */
    this._toolbar = null;
    /** @type {HTMLButtonElement[]} */
    this._buttons = [];
    /** @type {Array<{target: EventTarget, type: string, handler: Function}>} */
    this._listeners = [];
  }

  init() {
    const toolbar = document.getElementById('classicEditorToolbar');
    if (!toolbar || this._toolbar) return;
    this._toolbar = toolbar;
    this._buttons = Array.from(toolbar.querySelectorAll('button'));

    this._wireActions();
    this._wireRovingTabindex();

    // Enablement changes on every one of these, and nothing else re-checks it.
    // render-state-change is the one that un-grays the STL button when a
    // render completes (U-8b) — without it the button stayed gray until the
    // next mode or density switch, regardless of renders.
    for (const evt of [
      'classic-editor-activate',
      'classic-editor-deactivate',
      'ui-mode-changed',
      'classic-density-change',
      'render-state-change',
    ]) {
      this._on(document, evt, () => this.refresh());
    }

    this.refresh();
  }

  destroy() {
    for (const { target, type, handler } of this._listeners) {
      target.removeEventListener(type, handler);
    }
    this._listeners = [];
    this._toolbar = null;
    this._buttons = [];
  }

  /** @private */
  _on(target, type, handler) {
    target.addEventListener(type, handler);
    this._listeners.push({ target, type, handler });
  }

  /**
   * Run an editor command, then re-check enablement: undoing may have been
   * the last undoable edit.
   * @private
   */
  _editorAction(actionId) {
    const editor = this.getEditor();
    if (!editor?.supportsAction?.(actionId)) return;
    editor.performAction(actionId);
    this.refresh();
  }

  /** @private */
  _wireActions() {
    const click = (id, handler) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      this._on(btn, 'click', (event) => {
        // A gated button is aria-disabled, not disabled, so it still receives
        // the click — say why instead of doing nothing.
        if (btn.getAttribute('aria-disabled') === 'true') {
          event.preventDefault();
          this._announceUnavailable(btn);
          return;
        }
        handler();
      });
    };

    click('classicEdNewBtn', () => this.fileActions?.onNew());
    click('classicEdOpenBtn', () =>
      document.getElementById('fileInput')?.click()
    );
    click('classicEdSaveBtn', () => this.fileActions?.onSave());

    click('classicEdUndoBtn', () => this._editorAction('undo'));
    click('classicEdRedoBtn', () => this._editorAction('redo'));
    click('classicEdUnindentBtn', () => this._editorAction('unindent'));
    click('classicEdIndentBtn', () => this._editorAction('indent'));

    // Same handler as Ctrl+Enter: flush the pending write-back, then preview
    click('classicEdPreviewBtn', () => this.triggerPreview());
    click('classicEdRenderBtn', () => this.triggerRender());

    click('classicEdExportStlBtn', () => this.exportStl());
    // DXF goes through the one-click 2D path, which already handles the 2D
    // consent prompt and the projection fallback — exportFormatFromMenu would
    // reject it as a format mismatch against a 3D render (D-23).
    click('classicEdExportDxfBtn', () => this.fileActions?.onExport2D?.('dxf'));

    // 3D Print is permanently unavailable this round (D-26); its reason span
    // is static markup, so the shared announce path covers it.
    click('classicEdPrintBtn', () => {});
  }

  /**
   * Say why a button cannot be used, composing its own name with the reason
   * already attached to it.
   * @private
   */
  _announceUnavailable(btn) {
    const name = btn.textContent.trim() || btn.title;
    const reasonId = btn.getAttribute('aria-describedby');
    const reason = reasonId
      ? document.getElementById(reasonId)?.textContent.trim()
      : '';
    announceImmediate(
      reason ? `${name} unavailable. ${reason}` : `${name} unavailable`
    );
  }

  /**
   * Mark a button available or not, keeping it focusable either way.
   * @private
   */
  _setAvailable(id, available, reason) {
    const btn = document.getElementById(id);
    if (!btn) return;
    if (available) {
      btn.removeAttribute('aria-disabled');
      btn.removeAttribute('aria-describedby');
      return;
    }
    btn.setAttribute('aria-disabled', 'true');

    const reasonId = `${id}Reason`;
    let span = document.getElementById(reasonId);
    if (!span) {
      span = document.createElement('span');
      span.id = reasonId;
      span.className = 'sr-only';
      btn.insertAdjacentElement('afterend', span);
    }
    span.textContent = reason;
    btn.setAttribute('aria-describedby', reasonId);
  }

  /** Recompute which buttons are usable right now. */
  refresh() {
    if (!this._toolbar) return;

    const editor = this.getEditor();
    const state = this.getState() || {};
    const hasFile = Boolean(state.uploadedFile);

    // The textarea fallback (prefers-contrast: more) supports none of these,
    // and says so rather than pretending they are momentarily unavailable.
    const supports = (id) => editor?.supportsAction?.(id) === true;

    this._setAvailable(
      'classicEdUndoBtn',
      supports('undo') && editor.canUndo?.() === true,
      supports('undo') ? REASON_NOTHING_TO_UNDO : REASON_BASIC_EDITOR
    );
    this._setAvailable(
      'classicEdRedoBtn',
      supports('redo') && editor.canRedo?.() === true,
      supports('redo') ? REASON_NOTHING_TO_REDO : REASON_BASIC_EDITOR
    );
    this._setAvailable(
      'classicEdIndentBtn',
      supports('indent'),
      REASON_BASIC_EDITOR
    );
    this._setAvailable(
      'classicEdUnindentBtn',
      supports('unindent'),
      REASON_BASIC_EDITOR
    );

    this._setAvailable(
      'classicEdExportStlBtn',
      this.getHasFullRender() === true,
      REASON_NEEDS_RENDER
    );
    this._setAvailable('classicEdExportDxfBtn', hasFile, REASON_NEEDS_FILE);

    this._refreshRovingStop();
  }

  /**
   * APG toolbar pattern: the whole toolbar is ONE tab stop and arrows move
   * within it. Copied from the #classicToolbar implementation
   * (main.js:8326-8386) rather than invented, so both toolbars behave the
   * same. aria-disabled buttons stay in the ring on purpose — that is how a
   * keyboard user discovers them and hears why they are unavailable.
   * @private
   */
  _wireRovingTabindex() {
    this._setRovingStop(this._buttons[0]);

    this._on(this._toolbar, 'focusin', (event) => {
      const btn = event.target.closest('button');
      if (btn && this._buttons.includes(btn)) this._setRovingStop(btn);
    });

    this._on(this._toolbar, 'keydown', (event) => {
      const { key } = event;
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key)) return;
      const btn = event.target.closest('button');
      if (!btn || !this._buttons.includes(btn)) return;

      const visible = this._visibleButtons();
      if (visible.length === 0) return;
      const current = visible.indexOf(btn);

      let next;
      if (key === 'Home') next = visible[0];
      else if (key === 'End') next = visible[visible.length - 1];
      else {
        const delta = key === 'ArrowRight' ? 1 : -1;
        next = visible[(current + delta + visible.length) % visible.length];
      }
      event.preventDefault();
      this._setRovingStop(next);
      next.focus();
    });

    let resizeTimer;
    this._on(window, 'resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => this._refreshRovingStop(), 200);
    });
  }

  /** @private */
  _visibleButtons() {
    return this._buttons.filter((b) => b.offsetParent !== null && !b.disabled);
  }

  /** @private */
  _setRovingStop(target) {
    for (const b of this._buttons) {
      b.tabIndex = b === target ? 0 : -1;
    }
  }

  /**
   * The single tab stop must always be a VISIBLE button, or Tab skips it and
   * the whole toolbar drops out of the keyboard order.
   * @private
   */
  _refreshRovingStop() {
    const visible = this._visibleButtons();
    if (visible.length === 0) return;
    const current = this._buttons.find((b) => b.tabIndex === 0);
    this._setRovingStop(visible.includes(current) ? current : visible[0]);
  }
}

/** @type {ClassicEditorToolbar|null} */
let instance = null;

/**
 * Create (once) and wire the Classic editor toolbar.
 * @param {Object} deps
 * @returns {ClassicEditorToolbar}
 */
export function initClassicEditorToolbar(deps = {}) {
  if (!instance) instance = new ClassicEditorToolbar(deps);
  instance.init();
  return instance;
}

/** @returns {ClassicEditorToolbar|null} */
export function getClassicEditorToolbar() {
  return instance;
}
