/**
 * Toolbar Menu Controller
 * Manages the 6-button application menu bar: File|Edit|Design|View|Window|Help
 *
 * Implements the WAI-ARIA Menubar pattern (APG):
 *   - role="menubar" container with role="menuitem" triggers
 *   - role="menu" popups with role="menuitem" / "menuitemcheckbox" / "menuitemradio"
 *   - Roving tabindex across menubar items (Arrow Left/Right)
 *   - Arrow Up/Down within open menus, Home/End, Enter/Space activation
 *   - Escape closes menu, restores focus to menubar trigger
 *
 * Menu panels are positioned absolutely and dismissed on click-outside or Escape.
 * No modal-manager or focus-trap — keyboard navigation is fully managed here.
 *
 * @license GPL-3.0-or-later
 */

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

/** Human-readable labels for radio groups */
const RADIO_GROUP_LABELS = {
  displayMode: 'Display Mode',
  projection: 'Projection',
};

export class ToolbarMenuController {
  constructor() {
    /** @type {Map<string, HTMLElement>} menuId -> toolbar button element */
    this._buttons = new Map();

    /** @type {Map<string, HTMLElement>} menuId -> modal/popup wrapper element */
    this._modals = new Map();

    /** @type {string|null} ID of the currently open menu, or null */
    this._openMenuId = null;

    /** @type {Function|null} Optional global action callback */
    this._onMenuAction = null;

    /**
     * Per-menu builder functions called on each open to get fresh item definitions.
     * @type {Map<string, Function>}
     */
    this._menuBuilders = new Map();

    /** @type {number} Auto-incrementing counter for unique element IDs */
    this._idCounter = 0;

    /** @type {number} Index of the currently-focused menubar item (roving tabindex) */
    this._activeBarIndex = 0;

    /** @type {Function|null} Bound reference for document click-outside handler */
    this._onDocumentClick = null;
  }

  /**
   * Initialize: discover toolbar buttons and menu panels, wire up keyboard
   * and click handlers for the full APG menubar pattern.
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

      btn.addEventListener('click', () => this._onBarItemClick(menuId));

      // Overlay click closes the menu
      const overlay = modal.querySelector('.toolbar-menu-overlay');
      if (overlay) {
        overlay.addEventListener('click', () => this.closeAllMenus());
      }

      // Close button (mouse/touch affordance, not keyboard-reachable)
      const closeBtn = modal.querySelector('.toolbar-menu-close');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => this.closeAllMenus());
      }
    }

    // Menubar keyboard handler (arrow navigation between top-level items)
    bar.addEventListener('keydown', (e) => this._handleMenubarKeydown(e));
  }

  // ============================================================================
  // Public API (consumed by main.js, hfm-controller.js)
  // ============================================================================

  /**
   * Open a menu popup.
   * @param {string} menuId
   */
  openMenu(menuId) {
    if (!this._modals.has(menuId)) return;

    // Close any currently open sibling menu first
    if (this._openMenuId !== null && this._openMenuId !== menuId) {
      this._hideMenu(this._openMenuId);
    }

    this._showMenu(menuId);
  }

  /**
   * Close a specific menu popup.
   * @param {string} menuId
   */
  closeMenu(menuId) {
    if (this._openMenuId === menuId) {
      this._hideMenu(menuId);
    }
  }

  /** Close all open menu popups (at most one can be open at a time). */
  closeAllMenus() {
    if (this._openMenuId !== null) {
      this._hideMenu(this._openMenuId);
    }
  }

  /** Alias used by some call sites. */
  closeAll() {
    this.closeAllMenus();
  }

  /** Show the entire toolbar menu bar. */
  show() {
    const bar = document.getElementById('toolbarMenuBar');
    if (bar) bar.classList.remove('hidden');
  }

  /** Hide the entire toolbar menu bar. */
  hide() {
    const bar = document.getElementById('toolbarMenuBar');
    if (bar) bar.classList.add('hidden');
  }

  /**
   * Show only the specified menu buttons; hide all others.
   * @param {string[]} visibleMenuIds
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
   * Register a builder function for a menu.
   * @param {string} menuId
   * @param {Function} builderFn - () => Object[]
   */
  registerMenuBuilder(menuId, builderFn) {
    this._menuBuilders.set(menuId, builderFn);
  }

  /**
   * Render menu items into a menu's list container.
   * @param {string} menuId
   * @param {Object[]} items
   */
  renderMenuContent(menuId, items) {
    const modal = this._modals.get(menuId);
    if (!modal) return;

    const listEl = modal.querySelector(`#${menuId}MenuItems`);
    if (!listEl) return;

    listEl.innerHTML = '';

    let i = 0;
    while (i < items.length) {
      const item = items[i];
      if (item.type === 'radio') {
        const group = item.group;
        const radioItems = [];
        while (
          i < items.length &&
          items[i].type === 'radio' &&
          items[i].group === group
        ) {
          radioItems.push(items[i]);
          i++;
        }
        this._buildRadioGroup(group, radioItems).forEach((el) =>
          listEl.appendChild(el)
        );
      } else {
        listEl.appendChild(this._buildMenuItem(item));
        i++;
      }
    }

    // Wire keyboard navigation within this menu list
    listEl.addEventListener('keydown', (e) =>
      this._handleMenuKeydown(e, menuId)
    );
  }

  /**
   * Rebuild a menu's content from its registered builder.
   * @param {string} menuId
   */
  refreshMenuState(menuId) {
    const builder = this._menuBuilders.get(menuId);
    if (builder) {
      this.renderMenuContent(menuId, builder());
    }
  }

  // ============================================================================
  // Menu open/close helpers (no modal-manager)
  // ============================================================================

  /** @private */
  _showMenu(menuId) {
    this.refreshMenuState(menuId);

    const modal = this._modals.get(menuId);
    const btn = this._buttons.get(menuId);

    this._openMenuId = menuId;
    btn.setAttribute('aria-expanded', 'true');
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');

    // Focus the first menuitem inside the menu list
    const listEl = modal.querySelector(`#${menuId}MenuItems`);
    if (listEl) {
      const firstItem = this._getNavigableItems(listEl)[0];
      if (firstItem) {
        this._focusMenuItem(listEl, firstItem);
      }
    }

    announce(`${MENU_LABELS[menuId]} menu opened`, { clearDelayMs: 1500 });
  }

  /** @private */
  _hideMenu(menuId) {
    const modal = this._modals.get(menuId);
    const btn = this._buttons.get(menuId);

    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    btn.setAttribute('aria-expanded', 'false');

    if (this._openMenuId === menuId) {
      this._openMenuId = null;
    }
  }

  // ============================================================================
  // Menubar keyboard handling (roving tabindex across top-level items)
  // ============================================================================

  /** @private */
  _onBarItemClick(menuId) {
    if (this._openMenuId === menuId) {
      this.closeAllMenus();
    } else {
      this._activeBarIndex = this._getVisibleBarItems().indexOf(
        this._buttons.get(menuId)
      );
      this.openMenu(menuId);
    }
  }

  /**
   * Get the ordered list of visible menubar buttons.
   * @returns {HTMLElement[]}
   * @private
   */
  _getVisibleBarItems() {
    return MENU_IDS.map((id) => this._buttons.get(id)).filter(
      (btn) => btn && !btn.classList.contains('hidden')
    );
  }

  /**
   * Move roving tabindex to a specific menubar button.
   * @param {HTMLElement[]} items
   * @param {number} index
   * @private
   */
  _focusBarItem(items, index) {
    for (let i = 0; i < items.length; i++) {
      items[i].setAttribute('tabindex', i === index ? '0' : '-1');
    }
    items[index].focus();
    this._activeBarIndex = index;
  }

  /**
   * Keyboard handler on the menubar container.
   * @param {KeyboardEvent} e
   * @private
   */
  _handleMenubarKeydown(e) {
    const items = this._getVisibleBarItems();
    if (items.length === 0) return;

    const idx = this._activeBarIndex;

    switch (e.key) {
      case 'ArrowRight': {
        e.preventDefault();
        const next = (idx + 1) % items.length;
        this._focusBarItem(items, next);
        if (this._openMenuId !== null) {
          const nextId = this._menuIdForButton(items[next]);
          if (nextId) this.openMenu(nextId);
        }
        break;
      }
      case 'ArrowLeft': {
        e.preventDefault();
        const prev = (idx - 1 + items.length) % items.length;
        this._focusBarItem(items, prev);
        if (this._openMenuId !== null) {
          const prevId = this._menuIdForButton(items[prev]);
          if (prevId) this.openMenu(prevId);
        }
        break;
      }
      case 'ArrowDown':
      case 'Enter':
      case ' ': {
        e.preventDefault();
        const targetId = this._menuIdForButton(items[idx]);
        if (targetId) {
          if (this._openMenuId === targetId) {
            // Already open — focus first menu item
            const modal = this._modals.get(targetId);
            const listEl = modal?.querySelector(`#${targetId}MenuItems`);
            if (listEl) {
              const first = this._getNavigableItems(listEl)[0];
              if (first) this._focusMenuItem(listEl, first);
            }
          } else {
            this.openMenu(targetId);
          }
        }
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        const targetIdUp = this._menuIdForButton(items[idx]);
        if (targetIdUp) {
          if (this._openMenuId !== targetIdUp) {
            this.openMenu(targetIdUp);
          }
          // Focus last item in the menu
          const modal = this._modals.get(targetIdUp);
          const listEl = modal?.querySelector(`#${targetIdUp}MenuItems`);
          if (listEl) {
            const navItems = this._getNavigableItems(listEl);
            if (navItems.length > 0) {
              this._focusMenuItem(listEl, navItems[navItems.length - 1]);
            }
          }
        }
        break;
      }
      case 'Escape':
        if (this._openMenuId !== null) {
          e.preventDefault();
          this.closeAllMenus();
        }
        break;
      case 'Home': {
        e.preventDefault();
        this._focusBarItem(items, 0);
        break;
      }
      case 'End': {
        e.preventDefault();
        this._focusBarItem(items, items.length - 1);
        break;
      }
      default:
        break;
    }
  }

  /**
   * Look up the menuId for a given toolbar button element.
   * @param {HTMLElement} btn
   * @returns {string|null}
   * @private
   */
  _menuIdForButton(btn) {
    for (const [id, el] of this._buttons) {
      if (el === btn) return id;
    }
    return null;
  }

  // ============================================================================
  // Menu-level keyboard handling (Arrow Up/Down within an open menu)
  // ============================================================================

  /**
   * Get all navigable (non-disabled) menu items within a menu list.
   * Includes items inside nested role="group" containers but NOT items
   * inside nested role="menu" submenus (those get their own handler).
   * @param {HTMLElement} listEl - The <ul role="menu"> element
   * @returns {HTMLElement[]}
   * @private
   */
  _getNavigableItems(listEl) {
    const all = listEl.querySelectorAll(
      '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]'
    );
    return Array.from(all).filter((el) => {
      // Exclude items inside nested submenus
      const closestMenu = el.closest('[role="menu"]');
      if (closestMenu !== listEl) return false;
      // Exclude disabled items
      return el.getAttribute('aria-disabled') !== 'true';
    });
  }

  /**
   * Set roving tabindex within a menu and focus the target item.
   * @param {HTMLElement} listEl
   * @param {HTMLElement} target
   * @private
   */
  _focusMenuItem(listEl, target) {
    const all = listEl.querySelectorAll(
      '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]'
    );
    all.forEach((el) => {
      const closestMenu = el.closest('[role="menu"]');
      if (closestMenu === listEl) {
        el.setAttribute('tabindex', el === target ? '0' : '-1');
      }
    });
    target.focus();
  }

  /**
   * Keyboard handler for items within an open menu.
   * @param {KeyboardEvent} e
   * @param {string} menuId
   * @private
   */
  _handleMenuKeydown(e, menuId) {
    const modal = this._modals.get(menuId);
    if (!modal) return;
    const listEl = modal.querySelector(`#${menuId}MenuItems`);
    if (!listEl) return;

    const items = this._getNavigableItems(listEl);
    if (items.length === 0) return;

    const current = document.activeElement;
    const idx = items.indexOf(current);

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        e.stopPropagation();
        const next = idx < 0 ? 0 : (idx + 1) % items.length;
        this._focusMenuItem(listEl, items[next]);
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        e.stopPropagation();
        const prev = idx <= 0 ? items.length - 1 : idx - 1;
        this._focusMenuItem(listEl, items[prev]);
        break;
      }
      case 'Home': {
        e.preventDefault();
        e.stopPropagation();
        this._focusMenuItem(listEl, items[0]);
        break;
      }
      case 'End': {
        e.preventDefault();
        e.stopPropagation();
        this._focusMenuItem(listEl, items[items.length - 1]);
        break;
      }
      case 'Escape': {
        e.preventDefault();
        e.stopPropagation();
        this.closeAllMenus();
        // Restore focus to the menubar trigger
        const btn = this._buttons.get(menuId);
        if (btn) btn.focus();
        break;
      }
      case 'ArrowRight': {
        // Move to the next menubar item and open its menu
        e.preventDefault();
        e.stopPropagation();
        this._moveToAdjacentMenu(1);
        break;
      }
      case 'ArrowLeft': {
        // Move to the previous menubar item and open its menu
        e.preventDefault();
        e.stopPropagation();
        this._moveToAdjacentMenu(-1);
        break;
      }
      case 'Enter':
      case ' ': {
        e.preventDefault();
        e.stopPropagation();
        if (current && idx >= 0) {
          current.click();
        }
        break;
      }
      case 'Tab': {
        // Tab should close the menu and let focus leave the menubar naturally
        this.closeAllMenus();
        break;
      }
      default:
        // Character search: jump to first item starting with typed character
        if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
          e.stopPropagation();
          const char = e.key.toLowerCase();
          const startIdx = idx < 0 ? 0 : idx + 1;
          for (let offset = 0; offset < items.length; offset++) {
            const candidate = items[(startIdx + offset) % items.length];
            const label = candidate.textContent?.trim().toLowerCase();
            if (label && label.startsWith(char)) {
              this._focusMenuItem(listEl, candidate);
              break;
            }
          }
        }
        break;
    }
  }

  /**
   * From within an open menu, move to the next or previous menubar item and
   * open that menu (Arrow Left/Right from inside a menu).
   * @param {number} direction - +1 for next, -1 for previous
   * @private
   */
  _moveToAdjacentMenu(direction) {
    const barItems = this._getVisibleBarItems();
    if (barItems.length === 0) return;

    const idx = this._activeBarIndex;
    const next = (idx + direction + barItems.length) % barItems.length;
    this._focusBarItem(barItems, next);

    const nextId = this._menuIdForButton(barItems[next]);
    if (nextId) this.openMenu(nextId);
  }

  // ============================================================================
  // Menu item builders — APG roles
  // ============================================================================

  /**
   * Build a single menu item element from a declarative definition.
   *
   * Supported types:
   *   separator — <li role="separator">
   *   action    — <li role="none"><button role="menuitem">
   *   toggle    — <li role="none"><button role="menuitemcheckbox">
   *   submenu   — <li role="none"><button role="menuitem" aria-haspopup="menu">
   *               + nested <ul role="menu">
   *
   * @param {Object} item
   * @returns {HTMLLIElement}
   * @private
   */
  _buildMenuItem(item) {
    if (item.type === 'separator') {
      const sep = document.createElement('li');
      sep.setAttribute('role', 'separator');
      sep.className = 'menu-separator';
      return sep;
    }

    if (item.type === 'submenu') {
      return this._buildSubmenuItem(item);
    }

    const li = document.createElement('li');
    li.setAttribute('role', 'none');
    li.className = 'menu-item';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'menu-item-btn';
    btn.setAttribute('tabindex', '-1');

    if (item.type === 'toggle') {
      btn.setAttribute('role', 'menuitemcheckbox');
      btn.setAttribute('aria-checked', String(Boolean(item.checked)));
    } else {
      btn.setAttribute('role', 'menuitem');
    }

    if (item.id) btn.id = item.id;

    const isDisabled = item.enabled === false || item.disabled === true;
    if (isDisabled) {
      btn.setAttribute('aria-disabled', 'true');
    }
    if (item.tooltip) {
      btn.setAttribute('title', item.tooltip);
    }

    const labelSpan = document.createElement('span');
    labelSpan.className = 'menu-item-label';
    labelSpan.textContent = item.label || '';
    btn.appendChild(labelSpan);

    const describedByIds = [];

    if (item.tooltip) {
      const tooltipId = `menu-tip-${this._nextId()}`;
      const tooltipSpan = document.createElement('span');
      tooltipSpan.id = tooltipId;
      tooltipSpan.className = 'sr-only';
      tooltipSpan.textContent = item.tooltip;
      btn.appendChild(tooltipSpan);
      describedByIds.push(tooltipId);
    }

    if (item.shortcutAction) {
      const shortcutDef = keyboardConfig.getShortcut(item.shortcutAction);
      if (shortcutDef) {
        const shortcutId = `menu-kbd-${this._nextId()}`;
        const kbdSpan = document.createElement('span');
        kbdSpan.id = shortcutId;
        kbdSpan.className = 'menu-item-shortcut';
        kbdSpan.setAttribute('aria-hidden', 'true');
        kbdSpan.textContent = formatShortcut(shortcutDef);
        btn.appendChild(kbdSpan);
        describedByIds.push(shortcutId);
      }
    }

    if (describedByIds.length > 0) {
      btn.setAttribute('aria-describedby', describedByIds.join(' '));
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

  /** @private */
  _nextId() {
    return ++this._idCounter;
  }

  /**
   * Build consecutive radio items as menuitemradio elements inside a
   * role="group" container with an accessible label.
   *
   * Returns an array of <li> elements (the group wrapper + each radio item)
   * to be appended to the parent menu list.
   *
   * @param {string} groupName
   * @param {Object[]} items
   * @returns {HTMLElement[]}
   * @private
   */
  _buildRadioGroup(groupName, items) {
    const groupLi = document.createElement('li');
    groupLi.setAttribute('role', 'none');
    groupLi.className = 'menu-item menu-item--radio-group';

    const groupDiv = document.createElement('div');
    groupDiv.setAttribute('role', 'group');
    groupDiv.setAttribute(
      'aria-label',
      RADIO_GROUP_LABELS[groupName] || groupName
    );
    groupDiv.className = 'menu-radio-group';

    const legend = document.createElement('span');
    legend.className = 'menu-radio-legend';
    legend.setAttribute('aria-hidden', 'true');
    legend.textContent = RADIO_GROUP_LABELS[groupName] || groupName;
    groupDiv.appendChild(legend);

    for (const item of items) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'menu-item-btn menu-radio-btn';
      btn.setAttribute('role', 'menuitemradio');
      btn.setAttribute('aria-checked', String(Boolean(item.checked)));
      btn.setAttribute('tabindex', '-1');

      const isDisabled = item.enabled === false || item.disabled === true;
      if (isDisabled) {
        btn.setAttribute('aria-disabled', 'true');
      }
      if (item.tooltip) {
        btn.setAttribute('title', item.tooltip);
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

      if (!isDisabled && typeof item.onChange === 'function') {
        btn.addEventListener('click', () => {
          this.closeAllMenus();
          item.onChange(item.value || item.label);
        });
      }

      groupDiv.appendChild(btn);
    }

    groupLi.appendChild(groupDiv);
    return [groupLi];
  }

  /**
   * Build a submenu item: a menuitem trigger with aria-haspopup="menu" and a
   * nested <ul role="menu">. The submenu opens on Enter/Space/ArrowRight and
   * closes on Escape/ArrowLeft (handled by the menu keydown handler).
   *
   * @param {Object} item
   * @returns {HTMLLIElement}
   * @private
   */
  _buildSubmenuItem(item) {
    const li = document.createElement('li');
    li.setAttribute('role', 'none');
    li.className = 'menu-item menu-item--submenu';

    const isDisabled = item.enabled === false || item.disabled === true;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'menu-item-btn menu-submenu-trigger';
    btn.setAttribute('role', 'menuitem');
    btn.setAttribute('tabindex', '-1');
    btn.setAttribute('aria-haspopup', 'menu');
    btn.setAttribute('aria-expanded', 'false');

    if (isDisabled) {
      btn.setAttribute('aria-disabled', 'true');
    }
    if (item.tooltip) {
      btn.setAttribute('title', item.tooltip);
    }

    const labelSpan = document.createElement('span');
    labelSpan.className = 'menu-item-label';
    labelSpan.textContent = item.label || '';
    btn.appendChild(labelSpan);

    const arrow = document.createElement('span');
    arrow.className = 'menu-submenu-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '\u25B6';
    btn.appendChild(arrow);

    li.appendChild(btn);

    if (!isDisabled) {
      const submenuId = `submenu-${this._nextId()}`;
      const nestedUl = document.createElement('ul');
      nestedUl.id = submenuId;
      nestedUl.className = 'menu-items-list menu-items-list--nested hidden';
      nestedUl.setAttribute('role', 'menu');
      nestedUl.setAttribute('aria-label', item.label || '');

      btn.setAttribute('aria-controls', submenuId);

      const childItems = Array.isArray(item.items) ? item.items : [];
      for (const child of childItems) {
        nestedUl.appendChild(this._buildMenuItem(child));
      }

      // Submenu open/close via click on the trigger
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = btn.getAttribute('aria-expanded') === 'true';
        if (isOpen) {
          this._closeSubmenu(btn, nestedUl);
        } else {
          this._openSubmenu(btn, nestedUl);
        }
      });

      // Keyboard within submenu
      nestedUl.addEventListener('keydown', (e) => {
        this._handleSubmenuKeydown(e, btn, nestedUl);
      });

      li.appendChild(nestedUl);
    }

    return li;
  }

  // ============================================================================
  // Submenu open/close/keyboard
  // ============================================================================

  /** @private */
  _openSubmenu(triggerBtn, submenuUl) {
    triggerBtn.setAttribute('aria-expanded', 'true');
    submenuUl.classList.remove('hidden');
    const firstItem = this._getSubmenuNavigableItems(submenuUl)[0];
    if (firstItem) {
      firstItem.setAttribute('tabindex', '0');
      firstItem.focus();
    }
  }

  /** @private */
  _closeSubmenu(triggerBtn, submenuUl) {
    triggerBtn.setAttribute('aria-expanded', 'false');
    submenuUl.classList.add('hidden');
    triggerBtn.focus();
  }

  /**
   * Get navigable items within a submenu (items whose closest role="menu" is this submenu).
   * @param {HTMLElement} submenuUl
   * @returns {HTMLElement[]}
   * @private
   */
  _getSubmenuNavigableItems(submenuUl) {
    const all = submenuUl.querySelectorAll(
      '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]'
    );
    return Array.from(all).filter((el) => {
      const closestMenu = el.closest('[role="menu"]');
      return closestMenu === submenuUl && el.getAttribute('aria-disabled') !== 'true';
    });
  }

  /**
   * Keyboard handler within a submenu.
   * @param {KeyboardEvent} e
   * @param {HTMLElement} triggerBtn - The button that opened this submenu
   * @param {HTMLElement} submenuUl - The <ul role="menu"> submenu
   * @private
   */
  _handleSubmenuKeydown(e, triggerBtn, submenuUl) {
    const items = this._getSubmenuNavigableItems(submenuUl);
    if (items.length === 0) return;

    const current = document.activeElement;
    const idx = items.indexOf(current);

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        e.stopPropagation();
        const next = idx < 0 ? 0 : (idx + 1) % items.length;
        this._focusSubmenuItem(submenuUl, items, items[next]);
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        e.stopPropagation();
        const prev = idx <= 0 ? items.length - 1 : idx - 1;
        this._focusSubmenuItem(submenuUl, items, items[prev]);
        break;
      }
      case 'ArrowLeft':
      case 'Escape': {
        e.preventDefault();
        e.stopPropagation();
        this._closeSubmenu(triggerBtn, submenuUl);
        break;
      }
      case 'Enter':
      case ' ': {
        e.preventDefault();
        e.stopPropagation();
        if (current && idx >= 0) current.click();
        break;
      }
      case 'Home': {
        e.preventDefault();
        e.stopPropagation();
        this._focusSubmenuItem(submenuUl, items, items[0]);
        break;
      }
      case 'End': {
        e.preventDefault();
        e.stopPropagation();
        this._focusSubmenuItem(submenuUl, items, items[items.length - 1]);
        break;
      }
      default:
        break;
    }
  }

  /** @private */
  _focusSubmenuItem(submenuUl, allItems, target) {
    for (const it of allItems) {
      it.setAttribute('tabindex', it === target ? '0' : '-1');
    }
    target.focus();
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
