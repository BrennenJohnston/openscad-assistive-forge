/**
 * Classic Layout Controller - Applies the Classic (desktop-OpenSCAD-style)
 * four-pane layout when the UI mode is 'classic'.
 *
 * The four panes map onto existing elements:
 *   Display    — .preview-panel (untouched)
 *   Customizer — .param-panel (untouched)
 *   Presets    — #presetControls, moved into a labelled slot
 *   Console    — #consolePanel, moved into a labelled slot
 *
 * Moves use appendChild (event listeners survive); the original parent and
 * nextSibling are recorded so exiting Classic restores the exact DOM order.
 * The grid itself lives in classic.css, keyed exclusively off
 * body[data-ui-mode='classic'] — other modes are untouched.
 *
 * @license GPL-3.0-or-later
 */

import { getUIModeController } from './ui-mode-controller.js';

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
  },
  {
    id: 'classicPresetsSlot',
    className: 'classic-slot classic-presets-slot',
    label: 'Presets',
    panelId: 'presetControls',
  },
];

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
   * disclosure panels so all four panes are visible.
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

    this.active = false;
    this.onExit();
  }

  /**
   * Find or create a labelled slot section inside the main interface.
   * @param {Element} mainInterface
   * @param {{id: string, className: string, label: string}} def
   * @returns {Element}
   * @private
   */
  _ensureSlot(mainInterface, def) {
    let slot = document.getElementById(def.id);
    if (!slot) {
      slot = document.createElement('section');
      slot.id = def.id;
      slot.className = def.className;
      slot.setAttribute('aria-label', def.label);
      mainInterface.appendChild(slot);
    }
    return slot;
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
 * Reset the singleton. Used in unit tests.
 */
export function resetClassicLayoutController() {
  instance = null;
}
