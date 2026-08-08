/**
 * Classic dock "Move panel" menus (B8) — the only way to relocate a panel this
 * round (D-3). Keyboard-first by design: there is no drag gesture, and half a
 * drag would be worse than none.
 *
 * Each dock title bar gets a trailing menu button whose items are the fields
 * that panel can legally reach, plus the panels it can merge with. A field the
 * panel already occupies is not listed — it would be an item that does
 * nothing. When the title bar belongs to a merged group (B7) the menu covers
 * every occupant, so a background tab can be moved without being activated.
 *
 * This is a purpose-built WAI-ARIA menu button, NOT the application menubar.
 * ToolbarMenuController cannot host it: its menu ids are a closed list of six,
 * init() requires #toolbarMenuBar plus static per-menu markup, and its arrow
 * keys walk between top-level menus — behaviour a standalone title-bar popup
 * must not have. Restructuring that controller is out of scope (plan §9), so
 * the APG pattern is implemented here over native <button> elements.
 *
 * @license GPL-3.0-or-later
 */

import { announceImmediate } from './announcer.js';
import {
  DOCK_FIELDS,
  TAB_BAR_CLASS,
  elementIdFor,
  fieldPositionLabel,
  panelLabel,
} from './classic-dock-model.js';

const MENU_BTN_CLASS = 'classic-panel-menu-btn';
const MENU_CLASS = 'classic-panel-menu';
const TITLEBAR_CLASS = 'classic-pane-titlebar';

/** Items are matched by role and label in tests — they have no stable ids. */
const MENU_ITEM_SELECTOR = '[role="menuitem"]';

/**
 * @typedef {Object} PanelMenuDeps
 * @property {() => string[]} getAllPanels - every dock panel id
 * @property {(panelId: string) => string|null} getFieldOf
 * @property {(panelId: string) => string[]} getGroupOf - the panels sharing a
 *   cell with this one, itself included
 * @property {(panelId: string, field: string) => boolean} canMove
 * @property {(panelId: string) => string[]} getMergeCandidates - visible panels
 *   elsewhere in the dock that this one could join
 * @property {(panelId: string, field: string, index: number|null, options: Object) => Object} movePanel
 */

export class ClassicPanelMenus {
  /**
   * @param {PanelMenuDeps} deps
   */
  constructor(deps) {
    this._deps = deps;

    /** @type {HTMLElement|null} the menu currently open */
    this._openMenu = null;
    /** @type {HTMLElement|null} the button that opened it */
    this._openButton = null;

    this._onDocumentPointerDown = (event) => {
      if (!this._openMenu) return;
      if (
        this._openMenu.contains(event.target) ||
        this._openButton?.contains(event.target)
      ) {
        return;
      }
      this.closeMenu();
    };

    // A fixed-position popup would drift away from its button; closing is
    // honest and matches how the application menus behave.
    this._onReposition = () => this.closeMenu();
  }

  /**
   * Put a menu button on every dock title bar that does not have one, and take
   * them off any that have left the dock.
   */
  refresh() {
    const bars = document.querySelectorAll(`#mainInterface .${TITLEBAR_CLASS}`);
    for (const bar of bars) {
      const panels = this._panelsForBar(bar);
      if (panels.length === 0) {
        bar.querySelector(`.${MENU_BTN_CLASS}`)?.remove();
        continue;
      }
      let btn = bar.querySelector(`.${MENU_BTN_CLASS}`);
      if (!btn) {
        btn = this._createButton();
        bar.appendChild(btn);
      }
      btn.dataset.classicPanels = panels.join(' ');
      btn.setAttribute('aria-label', this._buttonLabel(panels));
    }
  }

  /** Remove every menu button and close anything open. */
  destroy() {
    this.closeMenu();
    for (const btn of document.querySelectorAll(`.${MENU_BTN_CLASS}`)) {
      btn.remove();
    }
  }

  /**
   * Which panels a title bar's menu serves: the whole group when the bar is
   * the shared bar of a merged field (B7), otherwise the one panel it belongs
   * to.
   * @param {Element} bar
   * @returns {string[]}
   * @private
   */
  _panelsForBar(bar) {
    const owner = bar.parentElement;
    if (!owner) return [];
    if (owner.classList.contains(TAB_BAR_CLASS)) {
      const tabs = owner.querySelectorAll('[role="tab"]');
      return [...tabs].map((tab) => tab.dataset.classicPanel).filter(Boolean);
    }
    // Not always a direct child: the Customizer's title bar lives one level
    // down, inside #classicCustomizerBar. The panel's FIRST title bar is its
    // own — anything deeper belongs to something nested inside it.
    return this._deps.getAllPanels().filter((id) => {
      const el = document.getElementById(elementIdFor(id));
      return el?.querySelector(`.${TITLEBAR_CLASS}`) === bar;
    });
  }

  /**
   * @param {string[]} panels
   * @returns {string}
   * @private
   */
  _buttonLabel(panels) {
    // Owner-approved 2026-08-07: name the panel, so four of these in the
    // bottom strip do not all read the same.
    if (panels.length === 1) return `Move ${panelLabel(panels[0])}`;
    return 'Move panels';
  }

  /**
   * A native <button> is the trigger; aria-haspopup/aria-expanded are the
   * repair, because HTML has no menu-button primitive.
   * @returns {HTMLButtonElement}
   * @private
   */
  _createButton() {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `btn btn-sm btn-icon classic-pane-btn ${MENU_BTN_CLASS}`;
    btn.setAttribute('aria-haspopup', 'menu');
    btn.setAttribute('aria-expanded', 'false');
    // Decorative: the accessible name is on the button itself.
    const glyph = document.createElement('span');
    glyph.setAttribute('aria-hidden', 'true');
    glyph.textContent = '⋮';
    btn.appendChild(glyph);

    btn.addEventListener('click', () => this._toggleMenu(btn));
    btn.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        this._openFor(btn, event.key === 'ArrowUp' ? 'last' : 'first');
      }
    });
    return btn;
  }

  /**
   * @param {HTMLElement} btn
   * @private
   */
  _toggleMenu(btn) {
    if (this._openButton === btn) this.closeMenu();
    else this._openFor(btn, 'none');
  }

  /**
   * @param {HTMLElement} btn
   * @param {'first'|'last'|'none'} focusItem
   * @private
   */
  _openFor(btn, focusItem) {
    this.closeMenu();

    const panels = (btn.dataset.classicPanels || '').split(' ').filter(Boolean);
    const items = this.buildItems(panels);
    if (items.length === 0) return;

    const menu = document.createElement('ul');
    menu.className = MENU_CLASS;
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', btn.getAttribute('aria-label') || '');

    for (const item of items) {
      const li = document.createElement('li');
      li.setAttribute('role', 'none');
      if (item.separatorBefore) li.classList.add('classic-panel-menu-sep');

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'classic-panel-menu-item';
      button.setAttribute('role', 'menuitem');
      button.tabIndex = -1;
      button.textContent = item.label;
      button.addEventListener('click', () => {
        this.closeMenu();
        this._run(item);
      });
      li.appendChild(button);
      menu.appendChild(li);
    }

    menu.addEventListener('keydown', (event) => this._onMenuKeydown(event));
    document.body.appendChild(menu);

    this._position(menu, btn);

    btn.setAttribute('aria-expanded', 'true');
    this._openMenu = menu;
    this._openButton = btn;

    document.addEventListener('pointerdown', this._onDocumentPointerDown, true);
    window.addEventListener('resize', this._onReposition);
    window.addEventListener('scroll', this._onReposition, true);

    const all = [...menu.querySelectorAll(MENU_ITEM_SELECTOR)];
    if (focusItem === 'first') all[0]?.focus();
    else if (focusItem === 'last') all[all.length - 1]?.focus();
    else all[0]?.focus();
  }

  /**
   * Place the popup against its button and inside the viewport. The title bars
   * of the bottom strip sit near the foot of the window, where a menu that only
   * ever opened downwards would hang off the bottom of the screen with its last
   * items unreachable by pointer — so it flips above when that fits better, and
   * scrolls internally when neither side has room.
   * @param {HTMLElement} menu
   * @param {HTMLElement} btn
   * @private
   */
  _position(menu, btn) {
    const MARGIN = 4;
    const rect = btn.getBoundingClientRect();

    const width = menu.offsetWidth;
    const left = Math.min(
      Math.max(MARGIN, Math.round(rect.right - width)),
      Math.max(MARGIN, window.innerWidth - width - MARGIN)
    );
    menu.style.left = `${left}px`;

    const height = menu.offsetHeight;
    const below = window.innerHeight - rect.bottom - MARGIN;
    const above = rect.top - MARGIN;

    if (height <= below || below >= above) {
      menu.style.top = `${Math.round(rect.bottom)}px`;
      menu.style.maxHeight = `${Math.max(0, Math.round(below))}px`;
    } else {
      menu.style.top = `${Math.round(Math.max(MARGIN, rect.top - height))}px`;
      menu.style.maxHeight = `${Math.max(0, Math.round(above))}px`;
    }
  }

  /** Close the open menu and hand focus back to its button (APG). */
  closeMenu({ restoreFocus = true } = {}) {
    if (!this._openMenu) return;
    this._openMenu.remove();
    this._openMenu = null;

    const btn = this._openButton;
    this._openButton = null;
    document.removeEventListener(
      'pointerdown',
      this._onDocumentPointerDown,
      true
    );
    window.removeEventListener('resize', this._onReposition);
    window.removeEventListener('scroll', this._onReposition, true);

    if (btn?.isConnected) {
      btn.setAttribute('aria-expanded', 'false');
      if (restoreFocus) btn.focus();
    }
  }

  /**
   * @param {KeyboardEvent} event
   * @private
   */
  _onMenuKeydown(event) {
    const items = [...this._openMenu.querySelectorAll(MENU_ITEM_SELECTOR)];
    const current = items.indexOf(event.target);

    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        this.closeMenu();
        break;
      case 'Tab':
        // A menu is not a dialog: Tab leaves it rather than cycling inside.
        this.closeMenu({ restoreFocus: false });
        break;
      case 'ArrowDown':
        event.preventDefault();
        items[(current + 1) % items.length]?.focus();
        break;
      case 'ArrowUp':
        event.preventDefault();
        items[(current - 1 + items.length) % items.length]?.focus();
        break;
      case 'Home':
        event.preventDefault();
        items[0]?.focus();
        break;
      case 'End':
        event.preventDefault();
        items[items.length - 1]?.focus();
        break;
      default:
        break;
    }
  }

  /**
   * The menu's items for a title bar. Exposed so the tests can assert the item
   * set without opening a popup.
   *
   * Labels are owner-approved 2026-08-07: plain-language positions, the
   * panel's current field omitted rather than shown disabled, and the panel
   * named in each item once a merged bar serves more than one.
   *
   * @param {string[]} panels
   * @returns {Array<{label: string, panelId: string, field: string, mergeWith: string|null, separatorBefore: boolean}>}
   */
  buildItems(panels) {
    const items = [];
    const named = panels.length > 1;

    panels.forEach((panelId, panelIndex) => {
      const from = this._deps.getFieldOf(panelId);
      const subject = named ? `${panelLabel(panelId)} ` : '';

      for (const field of DOCK_FIELDS) {
        if (field.name === from) continue;
        if (!this._deps.canMove(panelId, field.name)) continue;
        items.push({
          label: `Move ${subject}to ${fieldPositionLabel(field.name)}`,
          panelId,
          field: field.name,
          mergeWith: null,
          separatorBefore: panelIndex > 0 && items.length > 0,
        });
      }

      for (const other of this._deps.getMergeCandidates(panelId)) {
        const field = this._deps.getFieldOf(other);
        if (!field || !this._deps.canMove(panelId, field)) continue;
        items.push({
          label: `Merge ${subject}with ${panelLabel(other)}`,
          panelId,
          field,
          mergeWith: other,
          separatorBefore: false,
        });
      }
    });

    return items;
  }

  /**
   * Run a chosen item and say what happened. Focus is already where the move
   * left it — the moved panel's title bar, or its tab when the field merged.
   * @param {{panelId: string, field: string, mergeWith: string|null}} item
   * @private
   */
  _run(item) {
    const result = this._deps.movePanel(item.panelId, item.field, null, {
      mergeWith: item.mergeWith,
    });
    if (!result?.ok) return;

    // movePanel has already re-hung the menus and placed focus; refreshing
    // again here could remove the very button that now holds it.
    announceImmediate(moveAnnouncement(item, this._deps.getGroupOf));
  }
}

/**
 * Owner-approved 2026-08-07: say what moved and where, and for a merge say
 * that a tab group now exists.
 * @param {{panelId: string, field: string, mergeWith: string|null}} item
 * @param {Function} [getGroup] - the group the panel landed in, for "tab N of M"
 * @returns {string}
 */
export function moveAnnouncement(item, getGroup) {
  const name = panelLabel(item.panelId);
  if (!item.mergeWith) {
    return `${name} moved to the ${fieldPositionLabel(item.field)}`;
  }
  const group = typeof getGroup === 'function' ? getGroup(item.panelId) : [];
  const position = group.indexOf(item.panelId) + 1;
  const suffix =
    position > 0 && group.length > 1
      ? `, tab ${position} of ${group.length}`
      : '';
  return `${name} merged with ${panelLabel(item.mergeWith)}${suffix}`;
}

/** @type {ClassicPanelMenus|null} */
let instance = null;

/**
 * Create (once) the dock's title-bar menus.
 * @param {PanelMenuDeps} deps
 * @returns {ClassicPanelMenus}
 */
export function initClassicPanelMenus(deps) {
  if (!instance) instance = new ClassicPanelMenus(deps);
  instance.refresh();
  return instance;
}

/** @returns {ClassicPanelMenus|null} */
export function getClassicPanelMenus() {
  return instance;
}

/** Tear the menus down when Classic exits. */
export function destroyClassicPanelMenus() {
  instance?.destroy();
  instance = null;
}
