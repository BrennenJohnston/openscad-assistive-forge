/**
 * The Customizer on a phone: a sheet.
 *
 * Held upright it sits above the bottom bar, and the preview keeps half the
 * screen above it, drawn in that half, so a value changed in the sheet is
 * seen changing in the model. Held sideways it is a column at the left, at
 * most half the width, with the preview beside it. It is not a dialog: the
 * preview and the bar stay usable while it is open, and closed it is out of
 * the way of Tab and of a screen reader (layout.css hides it).
 *
 * STATE CONVENTION: Additive open — `drawer-open` class = open.
 * This is the opposite of Actions/Camera/Echo drawers which use
 * additive close (`collapsed` class = closed). See UI_STANDARDS.md.
 * @license GPL-3.0-or-later
 */

import { createDocumentFocusTrap, getFocusableElements } from './focus-trap.js';
import {
  closeOtherPhoneDrawers,
  isPhoneLayout,
  isSidewaysPhone,
  placeDrawerColumnTop,
  previewKeepsPx,
  registerPhoneDrawer,
  SIDEWAYS_PHONE_QUERY,
} from './phone-drawers.js';

/** Input types a phone answers with its on-screen keyboard. */
const TYPED_INPUTS = new Set([
  'text',
  'search',
  'number',
  'email',
  'url',
  'tel',
  'password',
]);

/**
 * Initialize the mobile drawer controller
 * Manages the sheet's state, its place on the screen and where focus goes
 */
export function initDrawerController() {
  const drawer = document.getElementById('paramPanel');
  const toggleBtn = document.getElementById('mobileDrawerToggle');
  const closeBtn = document.getElementById('drawerCloseBtn');
  const previewPanel = document.querySelector('.preview-panel');

  if (!drawer || !toggleBtn) {
    return;
  }

  let isOpen = false;
  let triggerEl = null;
  let tourTrap = null;

  /**
   * The tour card stays on screen over the sheet, and it is itself
   * `role="dialog" aria-modal="true"`: left that way, assistive technology
   * would ignore the sheet, and a screen-reader user would get instructions
   * about controls they could not reach on the sheet's steps, which are most
   * of the tour. While the sheet is open the card stands its modality down;
   * its claim is restored the moment the sheet closes.
   *
   * During a tour the card and the sheet are the task together, and the
   * tour's veil covers the rest: Tab moves between the two of them only, and
   * Escape anywhere closes the sheet first and the tour second. Without a
   * tour the sheet holds nothing.
   */
  const tourOverlay = () => document.querySelector('.tutorial-overlay');

  function syncTour() {
    const card = tourOverlay()?.querySelector('.tutorial-panel');
    if (isOpen) {
      card?.removeAttribute('aria-modal');
    } else {
      card?.setAttribute('aria-modal', 'true');
    }

    const touring = isOpen && !!tourOverlay();
    if (touring && !tourTrap) {
      tourTrap = createDocumentFocusTrap(drawer, {
        onEscape: () => close(),
        alsoTrap: tourOverlay,
      });
      const active = document.activeElement;
      tourTrap.activate(
        active && active !== document.body ? { initialFocus: active } : {}
      );
    } else if (!touring && tourTrap) {
      tourTrap.deactivate();
      tourTrap = null;
    }
  }

  /** Upright the sheet rises from the bar; sideways it comes in from the left. */
  function syncTravel() {
    toggleBtn.dataset.travelOpen = isSidewaysPhone() ? 'right' : 'up';
  }

  /**
   * Upright, the sheet begins where the preview's half of the screen ends,
   * and the preview ends there too (layout.css reads both lines). On a
   * phone too short for that, the sheet still keeps its header and one row
   * of controls, and the preview has the rest. Sideways, the column starts
   * below the preview's own row.
   */
  function placeSheet() {
    placeDrawerColumnTop();
    const section = document.getElementById('previewCanvasSection');
    const bar = document.getElementById('actionsBar');
    const header = drawer.querySelector('.panel-header');
    const token = (name) =>
      parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(name)
      ) || 0;
    const barTop = bar ? bar.getBoundingClientRect().top : window.innerHeight;
    const floor =
      (header ? header.offsetHeight : 0) +
      token('--size-touch-target') +
      token('--space-md');
    const top = Math.ceil(
      Math.min(
        (section ? section.getBoundingClientRect().top : 0) + previewKeepsPx(),
        barTop - floor
      )
    );
    const root = document.documentElement.style;
    root.setProperty('--phone-sheet-top', `${top}px`);
    root.setProperty(
      '--phone-sheet-reserve',
      `${Math.max(0, window.innerHeight - top)}px`
    );
  }

  /**
   * The sheet opens at the parameters: their search block at the top of
   * what scrolls, and focus on its first control that does not raise a
   * phone's keyboard over half the screen (the group picker, ahead of the
   * groups). Everything above them stays in place, a scroll or Shift+Tab
   * away.
   */
  function showParameters() {
    const search = document.getElementById('paramSearchSection');
    const container = document.getElementById('parametersContainer');
    const header = drawer.querySelector('.panel-header');
    const stuck =
      header && getComputedStyle(header).position === 'sticky'
        ? header.offsetHeight
        : 0;
    // A control focused anywhere in the sheet stays clear of its header.
    drawer.style.scrollPaddingTop = `${stuck}px`;
    if (search && drawer.contains(search)) {
      drawer.scrollTop +=
        search.getBoundingClientRect().top -
        drawer.getBoundingClientRect().top -
        stuck;
    }
    const first = [search, container]
      .filter(Boolean)
      .flatMap((part) => getFocusableElements(part))
      .find(
        (el) =>
          !(el instanceof HTMLInputElement && TYPED_INPUTS.has(el.type)) &&
          !(el instanceof HTMLTextAreaElement) &&
          !el.isContentEditable
      );
    if (!first) {
      (closeBtn || toggleBtn).focus();
      return;
    }
    // The sheet is still sliding in, so the browser's own scroll to a
    // focused control would measure a moving box; distances inside the
    // sheet do not move with it.
    first.focus({ preventScroll: true });
    const box = drawer.getBoundingClientRect();
    const top = box.top + drawer.clientTop + stuck;
    const bottom = box.top + drawer.clientTop + drawer.clientHeight;
    const target = first.getBoundingClientRect();
    if (target.bottom > bottom) {
      drawer.scrollTop += target.bottom - bottom;
    } else if (target.top < top) {
      drawer.scrollTop -= top - target.top;
    }
  }

  /**
   * Open the sheet
   *
   * @param {HTMLElement} [trigger] - Where focus returns when it closes
   * @param {{initialFocus?: HTMLElement}} [options] - Where focus lands on
   *   opening; by default the first parameter control
   */
  function open(trigger, { initialFocus } = {}) {
    if (isOpen || !isPhoneLayout()) return;
    // Classic lays the Customizer into its own stacked pane (classic.css
    // resets the sheet's positioning); there is no sheet to open.
    if (document.body.dataset.uiMode === 'classic') return;

    // On a phone one drawer is open at a time.
    closeOtherPhoneDrawers('customizer');

    triggerEl = trigger || toggleBtn;
    isOpen = true;
    placeSheet();

    toggleBtn.setAttribute('aria-expanded', 'true');
    toggleBtn.setAttribute('aria-label', 'Close customizer panel');
    drawer.classList.add('drawer-open');
    previewPanel?.classList.add('customizer-sheet-open');
    closeBtn?.classList.remove('hidden');

    if (initialFocus) {
      initialFocus.focus();
    } else {
      showParameters();
    }
    syncTour();
  }

  /**
   * The drawing editor takes the preview area, and at phone width this
   * sheet would stand over part of it: a person who pressed "Open the
   * drawing editor" or "Crop first" in the sheet would get an editor half
   * hidden behind it. The sheet stands aside while the editor is open and
   * comes back when it closes, keeping whatever focus the editor's host has
   * just set inside it (the button the person pressed), so the place they
   * were at is the place they land.
   */
  let closedForEditor = false;
  let editorTrigger = null;
  window.addEventListener('drawing-editor:open', () => {
    if (!isOpen) return;
    editorTrigger = triggerEl;
    close();
    closedForEditor = true;
  });
  window.addEventListener('drawing-editor:close', () => {
    if (!closedForEditor) return;
    closedForEditor = false;
    const trigger = editorTrigger;
    editorTrigger = null;
    const active = document.activeElement;
    open(trigger || toggleBtn, {
      initialFocus:
        active && active !== document.body && drawer.contains(active)
          ? active
          : undefined,
    });
  });

  /**
   * Close the drawer
   * @param {{restoreFocus?: boolean}} [options] - restoreFocus false when
   *   another drawer is opening: focus stays on the control that opened it
   */
  function close({ restoreFocus = true } = {}) {
    if (!isOpen) return;

    isOpen = false;
    syncTour(); // hands the card back its own modality

    toggleBtn.setAttribute('aria-expanded', 'false');
    toggleBtn.setAttribute('aria-label', 'Open customizer panel');
    drawer.classList.remove('drawer-open');
    previewPanel?.classList.remove('customizer-sheet-open');
    closeBtn?.classList.add('hidden');

    if (triggerEl) {
      if (restoreFocus) triggerEl.focus();
      triggerEl = null;
    }
  }

  /**
   * Toggle drawer open/close
   */
  function toggle(event) {
    event.preventDefault();
    if (isOpen) {
      close();
    } else {
      open(event.currentTarget);
    }
  }

  /**
   * Escape in the sheet, or on its own button, closes it and returns focus
   * to the button. A search box with text in it clears itself first.
   */
  function closeOnEscape(event) {
    if (event.key !== 'Escape' || !isOpen) return;
    const target = event.target;
    if (
      target instanceof HTMLInputElement &&
      target.type === 'search' &&
      target.value
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    close();
  }

  // Event listeners
  toggleBtn.addEventListener('click', toggle);
  toggleBtn.addEventListener('keydown', closeOnEscape);
  drawer.addEventListener('keydown', closeOnEscape);

  // Entering Classic while the sheet is open would leave it placed over a
  // panel Classic has re-parented into the normal flow, so it closes
  // cleanly instead. Document event, not a controller import: see the
  // dispatch note in ui-mode-controller.applyMode().
  document.addEventListener('ui-mode-changed', (event) => {
    if (event.detail?.mode === 'classic' && isOpen) {
      close();
    }
  });

  // A tour can start or end while the sheet is already open, so modality is
  // re-decided rather than fixed at open time.
  document.addEventListener('forge:tutorial-run-change', syncTour);

  // Wire up close button
  if (closeBtn) {
    closeBtn.addEventListener('click', () => close());
  }

  registerPhoneDrawer('customizer', { isOpen: () => isOpen, close });
  syncTravel();

  // A turned phone or a resized window moves the sheet's lines, or, at a
  // desktop width, ends the sheet: the Customizer is a column there.
  let resizeTimeout;
  const onViewportChange = () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      syncTravel();
      if (!isOpen) return;
      if (isPhoneLayout()) {
        placeSheet();
      } else {
        close({ restoreFocus: false });
      }
    }, 150);
  };
  window.addEventListener('resize', onViewportChange);
  window
    .matchMedia(SIDEWAYS_PHONE_QUERY)
    .addEventListener('change', onViewportChange);
}
