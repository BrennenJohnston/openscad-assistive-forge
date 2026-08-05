/**
 * Classic Layout Controller - Applies the Classic (desktop-OpenSCAD-style)
 * layout when the UI mode is 'classic'.
 *
 * Desktop shell mapping (C5/C7):
 *   Editor     — #expertModePanel, moved into a titled slot (visible by
 *                default, Window > Editor / titlebar ✕ toggles it)
 *   Display    — .preview-panel (untouched)
 *   Customizer — .param-panel with the desktop-style #classicCustomizerBar
 *                (Automatic Preview / Reset / preset row) at its top
 *   Presets    — #presetControls, moved INTO the Customizer bar's
 *                #classicPresetRow (desktop puts the preset combobox inside
 *                the Customizer dock)
 *   Console    — #consolePanel, moved into a titled slot with a fold button
 *
 * Moves use appendChild (event listeners survive); the original parent and
 * nextSibling are recorded so exiting Classic restores the exact DOM order.
 * The grid itself lives in classic.css, keyed exclusively off
 * body[data-ui-mode='classic'] — other modes are untouched. Pane visibility
 * is data-attribute-driven (data-classic-*-hidden / -collapsed on <body>)
 * so the grid re-templates and folded panes actually give up their space.
 *
 * @license GPL-3.0-or-later
 */

import { getUIModeController } from './ui-mode-controller.js';
import { announceImmediate } from './announcer.js';

const PANES_STORAGE_KEY = 'openscad-forge-classic-panes';

/**
 * Classic startup contract: the customizer opens with all parameter
 * groups collapsed (desktop OpenSCAD behavior). Called on entering
 * Classic mode and after a project loads while Classic is active.
 * Setting `.open` fires the <details> 'toggle' event, so per-file
 * group state persistence keeps working.
 */
export function collapseCustomizerGroups() {
  document
    .querySelectorAll('#parametersContainer details.param-group')
    .forEach((group) => {
      if (group.open) group.open = false;
    });
}

const SLOT_DEFS = [
  {
    id: 'classicConsoleSlot',
    className: 'classic-slot classic-console-slot',
    label: 'Console',
    panelId: 'consolePanel',
    titlebar: { text: 'Console', foldBtnId: 'classicConsoleFoldBtn' },
  },
  {
    id: 'classicEditorSlot',
    className: 'classic-slot classic-editor-slot',
    label: 'Editor',
    panelId: 'expertModePanel',
    titlebar: { text: 'Editor', closeBtnId: 'classicEditorCloseBtn' },
  },
];

// Presets move into the Customizer dock rather than a created slot
const PRESETS_PANEL_ID = 'presetControls';
const PRESETS_TARGET_ID = 'classicPresetRow';

export class ClassicLayoutController {
  /**
   * @param {Object} [options]
   * @param {Function} [options.onEnter] - Called after the Classic layout is
   *   applied (main.js uses this to destroy the Split.js instance whose
   *   inline styles would fight the grid)
   * @param {Function} [options.onExit] - Called after the original layout is
   *   restored (main.js re-creates the split)
   */
  constructor(options = {}) {
    this.onEnter = options.onEnter || (() => {});
    this.onExit = options.onExit || (() => {});

    /** @type {boolean} */
    this.active = false;

    /**
     * Restore records for moved panels, in move order.
     * @type {Array<{el: Element, parent: Element, nextSibling: Node|null, wasOpen: boolean|null}>}
     */
    this._moved = [];

    /** Pane visibility state, persisted. Desktop defaults: editor shown. */
    this._panes = this._loadPaneState();
  }

  /**
   * Subscribe to UI mode changes and apply the current mode.
   */
  init() {
    const ui = getUIModeController();
    ui.subscribe((newMode) => {
      if (newMode === 'classic') {
        this.enter();
      } else {
        this.exit();
      }
    });

    if (ui.getMode() === 'classic') {
      this.enter();
    }
  }

  /**
   * Apply the Classic layout: create slots, move panels in, open the
   * disclosure panels, stamp pane-state attributes.
   */
  enter() {
    if (this.active) return;

    const mainInterface = document.getElementById('mainInterface');
    if (!mainInterface) return;

    for (const def of SLOT_DEFS) {
      const panel = document.getElementById(def.panelId);
      if (!panel) continue;

      const slot = this._ensureSlot(mainInterface, def);

      this._moved.push({
        el: panel,
        parent: panel.parentElement,
        nextSibling: panel.nextSibling,
        wasOpen: panel.tagName === 'DETAILS' ? panel.open : null,
      });

      slot.appendChild(panel);
      if (panel.tagName === 'DETAILS') {
        panel.open = true;
      }
    }

    // Presets join the Customizer dock (desktop layout)
    const presets = document.getElementById(PRESETS_PANEL_ID);
    const presetTarget = document.getElementById(PRESETS_TARGET_ID);
    if (presets && presetTarget) {
      this._moved.push({
        el: presets,
        parent: presets.parentElement,
        nextSibling: presets.nextSibling,
        wasOpen: presets.tagName === 'DETAILS' ? presets.open : null,
      });
      presetTarget.appendChild(presets);
      if (presets.tagName === 'DETAILS') {
        presets.open = true;
      }
    }

    this._applyPaneAttributes();
    if (this._panes.editorVisible) {
      document.dispatchEvent(new CustomEvent('classic-editor-activate'));
    }

    this.active = true;
    this.onEnter();
  }

  /**
   * Restore the original layout: move panels back to their recorded
   * positions (reverse order) and remove the slots.
   */
  exit() {
    if (!this.active) return;

    for (const record of [...this._moved].reverse()) {
      const { el, parent, nextSibling, wasOpen } = record;
      if (parent && parent.isConnected) {
        parent.insertBefore(el, nextSibling);
      }
      if (el.tagName === 'DETAILS' && wasOpen !== null) {
        el.open = wasOpen;
      }
    }
    this._moved = [];

    for (const def of SLOT_DEFS) {
      document.getElementById(def.id)?.remove();
    }

    delete document.body.dataset.classicEditorHidden;
    delete document.body.dataset.classicCustomizerHidden;
    delete document.body.dataset.classicConsoleCollapsed;
    document.dispatchEvent(new CustomEvent('classic-editor-deactivate'));

    this.active = false;
    this.onExit();
  }

  /** @returns {boolean} */
  isEditorVisible() {
    return this._panes.editorVisible;
  }

  /** @returns {boolean} */
  isCustomizerVisible() {
    return this._panes.customizerVisible;
  }

  /** @returns {boolean} */
  isConsoleCollapsed() {
    return this._panes.consoleCollapsed;
  }

  /** Show/hide the editor pane (Window > Editor, titlebar ✕). */
  toggleEditor() {
    this._panes.editorVisible = !this._panes.editorVisible;
    this._applyPaneAttributes();
    this._savePaneState();
    if (this.active) {
      document.dispatchEvent(
        new CustomEvent(
          this._panes.editorVisible
            ? 'classic-editor-activate'
            : 'classic-editor-deactivate'
        )
      );
    }
    announceImmediate(
      this._panes.editorVisible ? 'Editor shown' : 'Editor hidden'
    );
    return this._panes.editorVisible;
  }

  /** Show/hide the Customizer dock (Window > Customizer, titlebar ✕). */
  toggleCustomizer() {
    this._panes.customizerVisible = !this._panes.customizerVisible;
    this._applyPaneAttributes();
    this._savePaneState();
    announceImmediate(
      this._panes.customizerVisible ? 'Customizer shown' : 'Customizer hidden'
    );
    return this._panes.customizerVisible;
  }

  /** Fold/unfold the console pane (titlebar button). */
  setConsoleCollapsed(collapsed) {
    this._panes.consoleCollapsed = Boolean(collapsed);
    this._applyPaneAttributes();
    this._savePaneState();
    announceImmediate(
      this._panes.consoleCollapsed ? 'Console folded' : 'Console unfolded'
    );
    return this._panes.consoleCollapsed;
  }

  /**
   * Stamp the pane-visibility data attributes the classic.css grid keys on.
   * @private
   */
  _applyPaneAttributes() {
    const body = document.body;
    if (!body) return;
    body.dataset.classicEditorHidden = String(!this._panes.editorVisible);
    body.dataset.classicCustomizerHidden = String(
      !this._panes.customizerVisible
    );
    body.dataset.classicConsoleCollapsed = String(this._panes.consoleCollapsed);

    const foldBtn = document.getElementById('classicConsoleFoldBtn');
    if (foldBtn) {
      foldBtn.setAttribute(
        'aria-expanded',
        String(!this._panes.consoleCollapsed)
      );
    }
  }

  /** @private */
  _loadPaneState() {
    const defaults = {
      editorVisible: true,
      customizerVisible: true,
      consoleCollapsed: false,
    };
    try {
      const stored = localStorage.getItem(PANES_STORAGE_KEY);
      if (!stored) return defaults;
      const parsed = JSON.parse(stored);
      return {
        editorVisible:
          typeof parsed.editorVisible === 'boolean'
            ? parsed.editorVisible
            : defaults.editorVisible,
        customizerVisible:
          typeof parsed.customizerVisible === 'boolean'
            ? parsed.customizerVisible
            : defaults.customizerVisible,
        consoleCollapsed:
          typeof parsed.consoleCollapsed === 'boolean'
            ? parsed.consoleCollapsed
            : defaults.consoleCollapsed,
      };
    } catch {
      return defaults;
    }
  }

  /** @private */
  _savePaneState() {
    try {
      localStorage.setItem(PANES_STORAGE_KEY, JSON.stringify(this._panes));
    } catch {
      // Preference persistence is best-effort.
    }
  }

  /**
   * Find or create a labelled slot section inside the main interface,
   * with an optional desktop-style titlebar (text + fold/close button).
   * @param {Element} mainInterface
   * @param {{id: string, className: string, label: string, titlebar?: Object}} def
   * @returns {Element} the element moved panels are appended into
   * @private
   */
  _ensureSlot(mainInterface, def) {
    let slot = document.getElementById(def.id);
    if (!slot) {
      slot = document.createElement('section');
      slot.id = def.id;
      slot.className = def.className;
      slot.setAttribute('aria-label', def.label);

      if (def.titlebar) {
        const bar = document.createElement('div');
        bar.className = 'classic-pane-titlebar';
        const title = document.createElement('span');
        title.className = 'classic-pane-title';
        title.textContent = def.titlebar.text;
        bar.appendChild(title);

        if (def.titlebar.foldBtnId) {
          const fold = document.createElement('button');
          fold.type = 'button';
          fold.id = def.titlebar.foldBtnId;
          fold.className = 'btn btn-sm btn-icon classic-pane-btn';
          fold.setAttribute('aria-label', `Fold ${def.titlebar.text} pane`);
          fold.setAttribute('aria-expanded', 'true');
          fold.textContent = '▾';
          fold.addEventListener('click', () => {
            this.setConsoleCollapsed(!this._panes.consoleCollapsed);
          });
          bar.appendChild(fold);
        }
        if (def.titlebar.closeBtnId) {
          const close = document.createElement('button');
          close.type = 'button';
          close.id = def.titlebar.closeBtnId;
          close.className = 'btn btn-sm btn-icon classic-pane-btn';
          close.setAttribute('aria-label', `Hide ${def.titlebar.text}`);
          close.textContent = '✕';
          close.addEventListener('click', () => {
            this.toggleEditor();
          });
          bar.appendChild(close);
        }
        slot.appendChild(bar);
      }

      // Folding animates via grid-template-rows 0fr/1fr on this wrapper
      const body = document.createElement('div');
      body.className = 'classic-fold';
      const inner = document.createElement('div');
      inner.className = 'classic-fold-inner';
      body.appendChild(inner);
      slot.appendChild(body);

      mainInterface.appendChild(slot);
    }
    return slot.querySelector('.classic-fold-inner') || slot;
  }
}

// Singleton instance
let instance = null;

/**
 * Create (once) and initialize the ClassicLayoutController singleton.
 * @param {Object} [options] - Options for new instance (only used on first call)
 * @returns {ClassicLayoutController}
 */
export function initClassicLayoutController(options = {}) {
  if (!instance) {
    instance = new ClassicLayoutController(options);
    instance.init();
  }
  return instance;
}

/**
 * @returns {ClassicLayoutController|null} The singleton, if initialized.
 */
export function getClassicLayoutController() {
  return instance;
}

/**
 * Reset the singleton. Used in unit tests.
 */
export function resetClassicLayoutController() {
  instance = null;
}
