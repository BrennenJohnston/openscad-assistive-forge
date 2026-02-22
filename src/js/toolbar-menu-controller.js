/**
 * Toolbar Menu Controller
 * Manages the 6-button application menu bar: File|Edit|Design|View|Window|Help
 * Each button opens a modal dialog containing menu items.
 *
 * Modal pattern delegates to modal-manager.js for focus trapping, Escape close,
 * and focus restoration. Menu content (items) is populated in Phases 2-7.
 *
 * ARIA approach: toolbar buttons use aria-haspopup="dialog"; menus use
 * role="dialog" with semantic <button>/<ul> inside — not role="menubar"/
 * role="menu", which would require the full ARIA menu keyboard model.
 *
 * @license GPL-3.0-or-later
 */

import {
  openModal,
  closeModal,
  setupModalCloseHandlers,
  isAnyModalOpen,
} from './modal-manager.js';
import { keyboardConfig, formatShortcut } from './keyboard-config.js';
import { announce } from './announcer.js';

/** Ordered menu identifiers matching the toolbar button order */
const MENU_IDS = ['file', 'edit', 'design', 'view', 'window', 'help'];

/** Human-readable labels for each menu */
const MENU_LABELS = {
  file: 'File',
  edit: 'Edit',
  design: 'Design',
  view: 'View',
  window: 'Window',
  help: 'Help',
};

export class ToolbarMenuController {
  constructor() {
    /** @type {Map<string, HTMLElement>} menuId -> toolbar button element */
    this._buttons = new Map();

    /** @type {Map<string, HTMLElement>} menuId -> modal element */
    this._modals = new Map();

    /** @type {string|null} ID of the currently open menu, or null */
    this._openMenuId = null;

    /** @type {Function|null} Optional global action callback */
    this._onMenuAction = null;
  }

  /**
   * Initialize: wire toolbar buttons to modal open handlers and set up
   * close handlers (overlay click, close button, Escape) for each menu modal.
   *
   * @param {Object} [options]
   * @param {Function} [options.onMenuAction] - Called with (actionId, data) for each menu action
   */
  init(options = {}) {
    this._onMenuAction = options.onMenuAction || null;

    const bar = document.getElementById('toolbarMenuBar');
    if (!bar) {
      console.warn('[ToolbarMenuController] #toolbarMenuBar not found in DOM');
      return;
    }

    for (const menuId of MENU_IDS) {
      const btn = document.getElementById(`${menuId}MenuBtn`);
      const modal = document.getElementById(`${menuId}MenuModal`);

      if (!btn || !modal) {
        console.warn(
          `[ToolbarMenuController] Missing button or modal for menu: ${menuId}`
        );
        continue;
      }

      this._buttons.set(menuId, btn);
      this._modals.set(menuId, modal);

      // Delegate close behaviours to modal-manager: overlay click, .modal-close
      // button click, and Escape keydown are all handled by setupModalCloseHandlers.
      setupModalCloseHandlers(modal, {
        closeButton: '.modal-close',
        overlay: '.modal-overlay',
      });

      btn.addEventListener('click', () => this.openMenu(menuId));
    }
  }

  /**
   * Open a menu modal.
   * Skips if a non-menu modal (e.g. Features Guide, Render Queue) is currently
   * open. Closes any currently-open menu first to prevent menu stacking.
   *
   * @param {string} menuId
   */
  openMenu(menuId) {
    if (!this._modals.has(menuId)) return;

    // Block opening over a non-toolbar-menu modal
    if (isAnyModalOpen() && this._openMenuId === null) return;

    // Close sibling menu if one is open
    this.closeAllMenus();

    const modal = this._modals.get(menuId);

    this._openMenuId = menuId;
    this._setButtonExpanded(menuId, true);

    openModal(modal, {
      onClose: () => {
        this._setButtonExpanded(menuId, false);
        if (this._openMenuId === menuId) {
          this._openMenuId = null;
        }
      },
    });

    announce(`${MENU_LABELS[menuId]} menu opened`, { clearDelayMs: 1500 });
  }

  /**
   * Close a specific menu modal.
   * @param {string} menuId
   */
  closeMenu(menuId) {
    if (!this._modals.has(menuId)) return;
    closeModal(this._modals.get(menuId));
    this._setButtonExpanded(menuId, false);
    if (this._openMenuId === menuId) {
      this._openMenuId = null;
    }
  }

  /**
   * Close all open menu modals (at most one can be open at a time).
   */
  closeAllMenus() {
    if (this._openMenuId !== null) {
      this.closeMenu(this._openMenuId);
    }
  }

  /**
   * Show the entire toolbar menu bar.
   */
  show() {
    const bar = document.getElementById('toolbarMenuBar');
    if (bar) bar.classList.remove('hidden');
  }

  /**
   * Hide the entire toolbar menu bar.
   */
  hide() {
    const bar = document.getElementById('toolbarMenuBar');
    if (bar) bar.classList.add('hidden');
  }

  /**
   * Show only the specified menu buttons; hide all others.
   * Used for Basic mode per-menu overrides: the bar is shown when at least
   * one menu ID is included, hidden when the array is empty.
   *
   * @param {string[]} visibleMenuIds - Menu IDs whose buttons should be visible
   */
  setVisibleMenus(visibleMenuIds) {
    const bar = document.getElementById('toolbarMenuBar');
    if (!bar) return;

    if (visibleMenuIds.length > 0) {
      bar.classList.remove('hidden');
    } else {
      bar.classList.add('hidden');
      return;
    }

    for (const menuId of MENU_IDS) {
      const btn = this._buttons.get(menuId);
      if (!btn) continue;
      if (visibleMenuIds.includes(menuId)) {
        btn.classList.remove('hidden');
      } else {
        btn.classList.add('hidden');
      }
    }
  }

  /**
   * Render menu items into a menu's list container.
   * Called by individual menu phases (2-7) after the menu definition is built.
   *
   * @param {string} menuId
   * @param {Object[]} items - Array of menu item definition objects
   */
  renderMenuContent(menuId, items) {
    const modal = this._modals.get(menuId);
    if (!modal) return;

    const listEl = modal.querySelector(`#${menuId}MenuItems`);
    if (!listEl) return;

    listEl.innerHTML = '';
    for (const item of items) {
      listEl.appendChild(this._buildMenuItem(item));
    }
  }

  /**
   * Re-query dynamic enabled/checked states for a menu's items.
   * Stub in Phase 1; populated per-menu in Phases 2-7.
   *
   * @param {string} _menuId
   */
  refreshMenuState(_menuId) {
    // Populated in phases 2-7 when per-menu definitions are added.
  }

  // ============================================================================
  // Private helpers
  // ============================================================================

  /**
   * Update aria-expanded on a toolbar button.
   * @param {string} menuId
   * @param {boolean} expanded
   * @private
   */
  _setButtonExpanded(menuId, expanded) {
    const btn = this._buttons.get(menuId);
    if (btn) btn.setAttribute('aria-expanded', String(expanded));
  }

  /**
   * Build a single <li> menu item element from a declarative definition.
   *
   * Supported item types:
   *   separator  — horizontal rule
   *   action     — plain button (default)
   *   toggle     — button with aria-pressed
   *   radio      — button acting as a radio option (visual indicator via CSS)
   *   submenu    — button with nested items (stub for Phase 1)
   *
   * @param {Object} item
   * @param {string} item.type
   * @param {string} [item.id]
   * @param {string} [item.label]
   * @param {boolean} [item.enabled] - When false, renders as aria-disabled
   * @param {boolean} [item.disabled] - Alias for enabled=false
   * @param {string} [item.tooltip]
   * @param {boolean} [item.checked] - For toggles and radios
   * @param {string} [item.shortcutAction] - Key in keyboardConfig for shortcut display
   * @param {Function} [item.handler]
   * @returns {HTMLLIElement}
   * @private
   */
  _buildMenuItem(item) {
    if (item.type === 'separator') {
      const sep = document.createElement('li');
      sep.className = 'menu-separator';
      sep.setAttribute('role', 'separator');
      sep.setAttribute('aria-hidden', 'true');
      return sep;
    }

    const li = document.createElement('li');
    li.className = 'menu-item';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'menu-item-btn';

    if (item.id) btn.id = item.id;

    const isDisabled = item.enabled === false || item.disabled === true;
    if (isDisabled) {
      btn.setAttribute('aria-disabled', 'true');
    }
    if (item.tooltip) {
      btn.setAttribute('title', item.tooltip);
    }

    if (item.type === 'toggle') {
      btn.setAttribute('aria-pressed', String(Boolean(item.checked)));
    }

    const labelSpan = document.createElement('span');
    labelSpan.className = 'menu-item-label';
    labelSpan.textContent = item.label || '';
    btn.appendChild(labelSpan);

    if (item.shortcutAction) {
      const shortcutDef = keyboardConfig.getShortcut(item.shortcutAction);
      if (shortcutDef) {
        const kbdSpan = document.createElement('span');
        kbdSpan.className = 'menu-item-shortcut';
        kbdSpan.setAttribute('aria-hidden', 'true');
        kbdSpan.textContent = formatShortcut(shortcutDef);
        btn.appendChild(kbdSpan);
      }
    }

    if (!isDisabled && typeof item.handler === 'function') {
      btn.addEventListener('click', () => {
        this.closeAllMenus();
        item.handler();
      });
    }

    li.appendChild(btn);
    return li;
  }
}

// Singleton
let _instance = null;

/**
 * Get (or create) the ToolbarMenuController singleton.
 * @returns {ToolbarMenuController}
 */
export function getToolbarMenuController() {
  if (!_instance) {
    _instance = new ToolbarMenuController();
  }
  return _instance;
}

/**
 * Reset the singleton. Used in unit tests.
 */
export function resetToolbarMenuController() {
  _instance = null;
}
