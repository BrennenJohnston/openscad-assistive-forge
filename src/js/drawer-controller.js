/**
 * The Customizer on a phone.
 *
 * Held upright it comes in from the left over the preview, the way it opens
 * beside the preview on a desktop, see-through so a value changed in it is
 * seen changing in the model behind it; the grip on its right edge sets its
 * width (phone-customizer.js). Held sideways it is a column at the left, at
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
  registerPhoneDrawer,
  SIDEWAYS_PHONE_QUERY,
} from './phone-drawers.js';
import { initPhoneCustomizer } from './phone-customizer.js';
import { registerLookDrawer, slideDrawer } from './drawer-motion.js';

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
  // The Customizer's own arrow, the desktop's collapse button: on a phone
  // it closes the open sheet, where an X used to.
  const arrowBtn = document.getElementById('collapseParamPanelBtn');
  const previewPanel = document.querySelector('.preview-panel');
  const grip = document.getElementById('customizerWidthGrip');

  if (!drawer || !toggleBtn) {
    return;
  }

  const width = initPhoneCustomizer({ panel: drawer, grip });

  // The tint behind the panel and the grip on its edge travel with it.
  const sheetParts = () => [
    { el: drawer },
    { el: document.querySelector('.customizer-glass'), role: 'rider' },
    { el: grip, role: 'rider' },
  ];

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

  /**
   * The panel runs from the foot of the Preview Settings row down to the bar.
   * Held upright it is as wide as the person chose and its grip shows on its
   * right edge while it is open; held sideways it is the column beside the
   * preview, without a grip.
   */
  function placePanel() {
    placeDrawerColumnTop();
    width.apply();
    if (grip) grip.hidden = !(isOpen && !isSidewaysPhone());
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
      (arrowBtn || toggleBtn).focus();
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
   * @param {{initialFocus?: HTMLElement, keepFocus?: boolean, instant?: boolean}} [options]
   *   - Where focus lands on opening, by default the first parameter control;
   *   keepFocus leaves it where it is (the look reopening the sheet)
   * @returns {Promise<boolean>|null|undefined} its slide
   */
  function open(
    trigger,
    { initialFocus, keepFocus = false, instant = false } = {}
  ) {
    if (isOpen || !isPhoneLayout()) return;
    // Classic lays the Customizer into its own stacked pane (classic.css
    // resets the sheet's positioning); there is no sheet to open.
    if (document.body.dataset.uiMode === 'classic') return;

    // On a phone one drawer is open at a time.
    closeOtherPhoneDrawers('customizer');

    triggerEl = trigger || toggleBtn;
    isOpen = true;

    toggleBtn.setAttribute('aria-expanded', 'true');
    toggleBtn.setAttribute('aria-label', 'Close customizer panel');
    // No tooltip on a phone: it made a screen reader say the name twice.
    arrowBtn?.setAttribute('aria-expanded', 'true');
    arrowBtn?.setAttribute('aria-label', 'Close customizer panel');
    arrowBtn?.removeAttribute('title');
    drawer.classList.add('drawer-open');
    previewPanel?.classList.add('customizer-sheet-open');
    placePanel();
    const slide = slideDrawer(sheetParts(), {
      from: 'left',
      open: true,
      instant,
      name: 'phone-customizer',
    });

    if (initialFocus) {
      initialFocus.focus();
    } else if (!keepFocus) {
      showParameters();
    }
    syncTour();
    return slide;
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
   * @param {{restoreFocus?: boolean, instant?: boolean}} [options] -
   *   restoreFocus false when another drawer is opening: focus stays on the
   *   control that opened it; instant when the layout is leaving the phone's
   */
  function close({ restoreFocus = true, instant = false } = {}) {
    if (!isOpen) return;

    isOpen = false;
    syncTour(); // hands the card back its own modality

    toggleBtn.setAttribute('aria-expanded', 'false');
    toggleBtn.setAttribute('aria-label', 'Open customizer panel');
    arrowBtn?.setAttribute('aria-expanded', 'false');

    // Focus leaves before the sheet slides away out of reach.
    if (triggerEl) {
      if (restoreFocus) triggerEl.focus();
      triggerEl = null;
    }

    return slideDrawer(sheetParts(), {
      from: 'left',
      open: false,
      instant,
      name: 'phone-customizer',
      inert: [drawer],
      whenClosed: () => {
        if (isOpen) return;
        drawer.classList.remove('drawer-open');
        previewPanel?.classList.remove('customizer-sheet-open');
        if (grip) grip.hidden = true;
      },
    });
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
  grip?.addEventListener('keydown', closeOnEscape);

  // Entering Classic while the sheet is open would leave it placed over a
  // panel Classic has re-parented into the normal flow, so it closes
  // cleanly instead. Document event, not a controller import: see the
  // dispatch note in ui-mode-controller.applyMode().
  document.addEventListener('ui-mode-changed', (event) => {
    if (event.detail?.mode === 'classic' && isOpen) {
      close({ instant: true });
    }
  });

  // A tour can start or end while the sheet is already open, so modality is
  // re-decided rather than fixed at open time.
  document.addEventListener('forge:tutorial-run-change', syncTour);

  // On a phone the arrow closes the open sheet; on a desktop it collapses
  // the column (main.js), and the two never both act on one press.
  arrowBtn?.addEventListener('click', () => {
    if (isPhoneLayout() && isOpen) close();
  });

  registerPhoneDrawer('customizer', { isOpen: () => isOpen, close });
  registerLookDrawer('phone-customizer', {
    place: () => drawer,
    isOpen: () => isOpen,
    open: ({ instant } = {}) => open(toggleBtn, { keepFocus: true, instant }),
    close: ({ instant } = {}) => close({ restoreFocus: false, instant }),
  });

  // A turned phone or a resized window moves the panel's lines and width,
  // or, at a desktop width, closes it: the Customizer is a column there.
  let resizeTimeout;
  const onViewportChange = () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      if (!isOpen) return;
      if (isPhoneLayout()) {
        placePanel();
      } else {
        close({ restoreFocus: false, instant: true });
      }
    }, 150);
  };
  window.addEventListener('resize', onViewportChange);
  window
    .matchMedia(SIDEWAYS_PHONE_QUERY)
    .addEventListener('change', onViewportChange);
}
